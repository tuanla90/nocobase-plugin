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
import { setSharedT, SHARED_NS, sharedEnUS } from '@ptdl/shared';
import viVN from '../locale/vi-VN.json';

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
  lane: string;                // 'client' | 'client-v2' (logging only)
}

export function registerAllFieldModels(deps: RegisterAllDeps) {
  const {
    flowEngine, flowSettings, FieldModel, DisplayTextFieldModel, CollectionFieldModel,
    tExpr, Icon, icons, RecordSelectFieldModelImport, i18n, lane,
  } = deps;

  // Vietnamese resources for every widget's dialog labels + the Relative-date cell strings.
  try { i18n?.addResources?.('vi-VN', 'field-enhancements', viVN); } catch (e) { /* i18n optional */ }
  // @ptdl/shared's OWN render strings (field-picker button, empty state) use a VN-string-as-key scheme
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

  // eslint-disable-next-line no-console
  console.log(`[field-enhancements] ${lane} loaded`);
}
