import { registerFieldSnippets } from './registerFieldSnippets';
import { registerConditionalModel } from './conditionalModel';
import { registerSelectButtonsModel } from './selectButtonsModel';
import { registerInputIconModel } from './inputIconModel';
import { registerNumberFieldModel } from './numberFieldModel';
import { registerStarFieldModel } from './starFieldModel';
import { registerProgressFieldModel } from './progressFieldModel';
import { registerLinkFieldModel } from './linkFieldModel';
import { registerBooleanFieldModel } from './booleanFieldModel';
import { registerRichSelectModel } from './richSelectModel';
import { registerRelativeDateModel } from './relativeDateModel';
import { registerColorFieldModel } from './colorFieldModel';
import { registerIconFieldModel } from './iconFieldModel';
import { registerJsonFieldModel } from './jsonFieldModel';
import { registerLongTextModel } from './longTextModel';
import { patchBulkEditSmartField } from './bulkEditSmartField';
import { registerInstantEdit } from './instantEdit';
import { setSharedT, SHARED_NS, sharedEnUS } from '@tuanla90/shared';
import { loadFieldWidgetCache, bindFieldWidgetAutoRefresh, fieldWidgetFor } from './fieldWidgetStore';
import { registerGlobalWidgetComponents } from './globalWidgetToggle';
import viVN from '../locale/vi-VN.json';

// Resolve a model's collectionField, walking up `.parent` — a SubTableColumnModel's column model (or an
// inner field-model rendered inside a form) doesn't always carry `collectionField` directly on itself;
// it can live on a parent (e.g. a FormItemModel). `model.collectionField` is a getter whose body is just
// `return this.context.collectionField` — so `model.collectionField || model.context?.collectionField` is
// NOT a real fallback (same read twice). Walking `.parent` is the only real fix.
function resolveCf(model: any): any {
  for (let cur: any = model, i = 0; cur && i < 4; cur = cur.parent, i++) {
    if (cur?.collectionField) return cur.collectionField;
  }
  return null;
}

/**
 * GLOBAL (field-level) widgets: patch the common display base `render()` so a field that has a global
 * widget assignment (collection `ptdlFieldWidget`) renders THAT widget in every table/detail — no
 * per-block config. Technique: borrow the configured widget class's `renderComponent` on a synthetic
 * instance whose `props` = the stored config (methods resolve via the prototype; `super`/missing instance
 * fields degrade gracefully — the widgets already guard those). CRASH-SAFE: any failure falls back to the
 * field's normal render. Forms are unaffected (inputs use editable models, not this display base).
 */
function patchGlobalFieldWidget(flowEngine: any, DisplayTextFieldModel: any) {
  try {
    const ClickProto: any = DisplayTextFieldModel?.prototype && Object.getPrototypeOf(DisplayTextFieldModel.prototype);
    if (!ClickProto || typeof ClickProto.render !== 'function' || ClickProto.__ptdlGlobalWidgetPatched) return;
    const orig = ClickProto.render;
    ClickProto.render = function (this: any, ...rargs: any[]) {
      // Apply even when `this` IS already the widget class: in an OTHER block (e.g. a Details view) the
      // field model may be the widget class but WITHOUT its per-block config (the config lives only in the
      // global store) → rendering `this` directly shows nothing. Borrowing with the GLOBAL config fixes
      // that. Borrow calls renderComponent (not render) → no recursion.
      try {
        const cf = resolveCf(this);
        const g = cf ? fieldWidgetFor(cf.dataSourceKey, cf.collectionName || cf.collection?.name, cf.name) : null;
        if (cf && g?.widgetModel) {
          const proto: any = flowEngine.getModelClass(g.widgetModel)?.prototype;
          // Display widgets OVERRIDE renderComponent; editable widgets OVERRIDE render() (branch on
          // pattern==='readPretty'). Borrow whichever the WIDGET CLASS ITSELF defines (own property) — a
          // synthetic instance carrying the global config + a readPretty pattern.
          const own = (k: string) => proto && Object.prototype.hasOwnProperty.call(proto, k) && typeof proto[k] === 'function';
          if (own('renderComponent') || own('render')) {
            const value = this.props?.value;
            const inst = Object.create(proto);
            inst.props = { ...this.props, ...(g.config || {}), value, pattern: 'readPretty' };
            // `collectionField` and `context` are GETTER-ONLY on the model prototype — a plain assignment
            // throws "Cannot set property … which has only a getter". Define OWN value props to shadow them.
            Object.defineProperty(inst, 'collectionField', { value: cf, configurable: true, enumerable: true });
            Object.defineProperty(inst, 'context', { value: this.context, configurable: true, enumerable: true });
            const out = own('renderComponent') ? proto.renderComponent.call(inst, value, undefined) : proto.render.call(inst);
            if (out != null) return out;
          }
        }
      } catch (_) { /* fall through to the field's normal render */ }
      return orig.apply(this, rargs);
    };
    ClickProto.__ptdlGlobalWidgetPatched = true;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[field-enh] global-widget display patch failed (ignored)', e);
  }
}

/**
 * Single lane-agnostic registration path shared by BOTH clients (classic `/` and modern `/v/`).
 * The two lanes differ ONLY in the model base classes they inject (imported from @nocobase/client vs
 * @nocobase/client-v2) — everything else is identical. Keeping the sequence here means a new widget is
 * wired ONCE instead of hand-edited in two near-identical index files (which silently drift).
 */
export interface RegisterAllDeps {
  flowEngine: any;
  flowSettings?: any;
  FieldModel: any;             // editable field base (both lanes)
  DisplayTextFieldModel: any;  // display-only base (both lanes)
  CollectionFieldModel?: any;
  tExpr?: (s: string, o?: any) => any;
  Icon?: any;
  icons?: Map<string, any>;
  /** v2 only: the imported RecordSelectFieldModel, used as a fallback if the engine hasn't registered it. */
  RecordSelectFieldModelImport?: any;
  i18n?: any;                  // this.app.i18n — for vi-VN resources
  api?: any;                   // this.app.apiClient — for the global field-widget cache
  lane: string;                // 'client' | 'client-v2' (logging only)
}

export function registerAllFieldModels(deps: RegisterAllDeps) {
  const {
    flowEngine, flowSettings, FieldModel, DisplayTextFieldModel, CollectionFieldModel,
    tExpr, Icon, icons, RecordSelectFieldModelImport, i18n, lane,
  } = deps;

  // Vietnamese resources for every widget's dialog labels + the Relative-date cell strings.
  try { i18n?.addResources?.('vi-VN', 'field-enhancements', viVN); } catch (e) { /* i18n optional */ }
  // @tuanla90/shared's OWN render strings (field-picker button, empty state) use a VN-string-as-key scheme
  // under SHARED_NS — register the en-US map + inject a translator so they're bilingual too (runs once
  // per lane; registerAll is the single lane-agnostic path).
  try {
    if (i18n?.t) {
      i18n.addResources?.('en-US', SHARED_NS, sharedEnUS);
      setSharedT((s: string, o?: any) => i18n.t(s, { ns: SHARED_NS, ...(o || {}) }));
    }
  } catch (e) { /* i18n optional */ }

  registerFieldSnippets();
  // Bulk edit UX: value editor always visible, typing auto-selects "Changed to".
  patchBulkEditSmartField({ flowEngine });
  // Shared "Apply to all views" toggle component for the widget dialogs (global field-widget assignments).
  registerGlobalWidgetComponents(flowSettings);

  // "Value tag" display widget (moved from conditional-format): value → colored tag. Same model name so
  // existing configured columns keep working; also sets globalThis.__ptdlCondFmt for spreadsheet-view.
  try {
    registerConditionalModel({ flowEngine, flowSettings, Base: DisplayTextFieldModel, CollectionFieldModel, Icon, icons, tExpr });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(`[field-enh] (${lane}) value-tag register failed (ignored)`, e);
  }

  // No-code editable widgets.
  registerSelectButtonsModel({ flowEngine, flowSettings, Base: FieldModel, tExpr, Icon, icons });
  registerInputIconModel({ flowEngine, flowSettings, Base: FieldModel, tExpr });
  registerNumberFieldModel({ flowEngine, flowSettings, Base: FieldModel, tExpr });
  registerStarFieldModel({ flowEngine, flowSettings, Base: FieldModel, tExpr });
  registerProgressFieldModel({ flowEngine, flowSettings, Base: FieldModel, tExpr });
  registerLinkFieldModel({ flowEngine, flowSettings, Base: FieldModel, tExpr });
  registerBooleanFieldModel({ flowEngine, flowSettings, Base: FieldModel, tExpr });

  // Display-only widgets (opt-in, isDefault:false). Each isolated so one failure can't skip the rest.
  const displayWidgets: Array<[string, () => void]> = [
    ['relative-date', () => registerRelativeDateModel({ flowEngine, flowSettings, Base: DisplayTextFieldModel, CollectionFieldModel, tExpr, i18n })],
    ['color', () => registerColorFieldModel({ flowEngine, flowSettings, Base: DisplayTextFieldModel, EditBase: FieldModel, CollectionFieldModel, tExpr, i18n })],
    ['icon', () => registerIconFieldModel({ flowEngine, flowSettings, Base: DisplayTextFieldModel, EditBase: FieldModel, CollectionFieldModel, tExpr, i18n })],
    ['json', () => registerJsonFieldModel({ flowEngine, flowSettings, Base: DisplayTextFieldModel, CollectionFieldModel, tExpr, i18n })],
    ['long-text', () => registerLongTextModel({ flowEngine, flowSettings, Base: DisplayTextFieldModel, CollectionFieldModel, tExpr, i18n })],
  ];
  for (const [name, run] of displayWidgets) {
    try { run(); } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(`[field-enh] (${lane}) ${name} register failed (ignored)`, e);
    }
  }

  // RichSelect: subclass core RecordSelectFieldModel to inherit resource/fetch. Prefer the engine-registered
  // class (guaranteed present); fall back to the imported one (v2 passes it, classic relies on the engine).
  try {
    const RSBase = flowEngine?.getModelClass?.('RecordSelectFieldModel') || RecordSelectFieldModelImport;
    if (RSBase) {
      registerRichSelectModel({ flowEngine, flowSettings, Base: RSBase, tExpr });
    } else {
      // eslint-disable-next-line no-console
      console.warn(`[field-enh] (${lane}) rich-select: RecordSelectFieldModel not resolved — skipped`);
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(`[field-enh] (${lane}) rich-select registration threw`, e);
  }

  // GLOBAL (field-level) widgets: prime the cache (+ refresh on tab focus) and patch the display base so
  // assigned fields render their widget in every view. Wired once here (both lanes call registerAll).
  try {
    const api = (deps as any).api || flowEngine?.context?.api;
    if (api) { loadFieldWidgetCache(api); bindFieldWidgetAutoRefresh(api); }
    patchGlobalFieldWidget(flowEngine, DisplayTextFieldModel);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(`[field-enh] (${lane}) global-widget wiring failed (ignored)`, e);
  }

  // Block-level "Instant edit" for /v/ tables (guarded on TableBlockModel → no-ops on the classic lane).
  try {
    registerInstantEdit({ flowEngine, flowSettings, tExpr });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(`[field-enh] (${lane}) instant-edit register failed (ignored)`, e);
  }

  // eslint-disable-next-line no-console
  console.log(`[field-enhancements] ${lane} loaded`);
}
