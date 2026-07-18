/**
 * Instant Create Page — core builder. Turns "a collection + a list of columns" into a ready-to-use `/v/`
 * menu page: one Table block bound to the collection, one column per picked field, and working
 * View / Edit / Add row+toolbar buttons whose popups show those same columns.
 *
 * Everything here is a plain `createModelOptions` literal (the shape @nocobase/client-v2 persists to
 * `flowModels`). The whole page is built in memory via `flowEngine.createModelAsync(...)` and saved
 * in ONE `flowModels:save` (recursive), then a `desktopRoutes` row makes it a menu item. Shapes were
 * verified against a live NocoBase 2.1.19 DB — see docs/QUICK-VIEW-DESIGN.md.
 *
 * antd/React-free on purpose (the UI lives in QuickCreateForm.tsx) so this stays a thin logic module.
 */

// NocoBase-compatible uid: lowercase alphanumeric, 11 chars. Generated locally rather than imported
// (NocoBase's own `uid` lives in `@nocobase/utils/client`, not `@nocobase/flow-engine`; keeping it
// local avoids a fragile external-subpath dependency in the bundle). Verified live: uids of this shape
// persist to flowModels and back a working page/route.
function uid(len = 11): string {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
  let s = '';
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

/** One column's config: the field name + optional title override + optional component (the friendly
 *  LABEL of a field-model binding, e.g. 'Progress bar' / 'Value tag' / 'Rich select'). The component +
 *  title are applied to the table column AND — matched by the same label — the View/Edit/Add popups. */
export interface QuickColumn {
  name: string;
  title?: string;
  component?: string;
  /** to-one relation: render an inline "Add new <target>" affordance on the form (Rich select +
   *  quick-create Pop-up reusing the target's Add form via a block-template reference). */
  quickCreate?: boolean;
}

export interface CreateQuickPageParams {
  dataSourceKey?: string;
  collectionName: string;
  title: string;
  icon?: string;
  parentId?: number | null; // parent menu group route id; null/undefined = top level
  columns: QuickColumn[]; // ordered — the TABLE columns
  /** fields shown in the View/Edit/Add popups; defaults to `columns` when omitted. */
  popupColumns?: QuickColumn[];
  /** table block class — 'TableBlockModel' (basic) or 'EnhancedTableBlockModel' (summary row + cell-select). */
  blockUse?: string;
  /** target collection name → its Add-form block template, so quick-create fields on this page can
   *  reference the target's reusable Add form. Built by materializeApp before pages. */
  quickCreateTemplates?: Record<string, TemplateRef>;
}

/** Resolved per-column model uses (display for table/details, editable for the form), title synced. */
interface BuiltCol {
  name: string;
  title?: string;
  tableUse: string;
  detailsUse: string;
  formUse: string;
  /** for a to-many relation rendered as an inline SUB-TABLE in the form: its child columns (built). */
  formSubCols?: any[];
  /** for a to-many relation rendered as a read-only sub-table in Details: its child columns (built). */
  detailsSubCols?: any[];
  /** to-one relation with an inline "Add new <target>" affordance (Rich select + quick-create Pop-up). */
  quickCreate?: boolean;
  /** the quick-create relation's target collection name (for the template reference). */
  quickCreateTarget?: string;
  /** the target's registered Add-form block template that the quick-create popup references. */
  quickCreateTemplate?: TemplateRef;
}

/** A registered Add-form block template (single source of truth reused by quick-create popups). */
export interface TemplateRef { templateUid: string; targetUid: string; templateName: string; }

// ── field interface → renderer model class ─────────────────────────────────────────────────────
// Fallback only. We try the framework's own resolver (getDefaultBindingByField) first so custom
// interfaces and @ptdl/field-enhancements `isDefault` overrides (color/icon/etc.) are honored; these
// maps (from @nocobase/client-v2's bindModelToInterface registrations) catch anything that resolver
// can't answer standalone.
const DISPLAY_BY_INTERFACE: Record<string, string> = {
  input: 'DisplayTextFieldModel', email: 'DisplayTextFieldModel', phone: 'DisplayTextFieldModel',
  uuid: 'DisplayTextFieldModel', url: 'DisplayTextFieldModel', nanoid: 'DisplayTextFieldModel',
  textarea: 'DisplayTextFieldModel', markdown: 'DisplayTextFieldModel', vditor: 'DisplayTextFieldModel',
  number: 'DisplayNumberFieldModel', integer: 'DisplayNumberFieldModel', id: 'DisplayNumberFieldModel',
  snowflakeId: 'DisplayNumberFieldModel', percent: 'DisplayPercentFieldModel',
  select: 'DisplayEnumFieldModel', multipleSelect: 'DisplayEnumFieldModel', radioGroup: 'DisplayEnumFieldModel',
  checkboxGroup: 'DisplayEnumFieldModel',
  checkbox: 'DisplayCheckboxFieldModel', boolean: 'DisplayCheckboxFieldModel',
  date: 'DisplayDateTimeFieldModel', datetime: 'DisplayDateTimeFieldModel', datetimeNoTz: 'DisplayDateTimeFieldModel',
  createdAt: 'DisplayDateTimeFieldModel', updatedAt: 'DisplayDateTimeFieldModel', unixTimestamp: 'DisplayDateTimeFieldModel',
  time: 'DisplayTimeFieldModel', color: 'DisplayColorFieldModel', icon: 'DisplayIconFieldModel',
  password: 'DisplayPasswordFieldModel', json: 'DisplayJSONFieldModel', richText: 'DisplayHtmlFieldModel',
  // relations render as the related record's title text (verified live: belongsTo → DisplayTextFieldModel,
  // shows "Super Admin" not the FK id). Used only if the framework resolver can't answer.
  m2o: 'DisplayTextFieldModel', o2o: 'DisplayTextFieldModel', oho: 'DisplayTextFieldModel', obo: 'DisplayTextFieldModel',
  createdBy: 'DisplayTextFieldModel', updatedBy: 'DisplayTextFieldModel', chinaRegion: 'DisplayTextFieldModel',
  o2m: 'DisplayTextFieldModel', m2m: 'DisplayTextFieldModel', mbm: 'DisplayTextFieldModel', linkTo: 'DisplayTextFieldModel',
};
const EDIT_BY_INTERFACE: Record<string, string> = {
  input: 'InputFieldModel', email: 'InputFieldModel', phone: 'InputFieldModel', uuid: 'InputFieldModel',
  url: 'InputFieldModel', nanoid: 'InputFieldModel', textarea: 'TextareaFieldModel', markdown: 'TextareaFieldModel',
  number: 'NumberFieldModel', integer: 'NumberFieldModel', id: 'NumberFieldModel', snowflakeId: 'NumberFieldModel',
  percent: 'PercentFieldModel',
  select: 'SelectFieldModel', multipleSelect: 'SelectFieldModel', radioGroup: 'SelectFieldModel',
  checkboxGroup: 'SelectFieldModel',
  checkbox: 'CheckboxFieldModel', boolean: 'CheckboxFieldModel',
  date: 'DateOnlyFieldModel', datetime: 'DateTimeFieldModel', datetimeNoTz: 'DateTimeNoTzFieldModel',
  time: 'TimeFieldModel', color: 'ColorFieldModel', icon: 'IconFieldModel',
  password: 'PasswordFieldModel', json: 'JsonFieldModel', richText: 'RichTextFieldModel',
  // relations edit via the record picker (verified live: belongsTo → RecordSelectFieldModel). Fallback
  // only; the framework resolver is tried first. Never let a relation fall back to a plain Input.
  m2o: 'RecordSelectFieldModel', o2o: 'RecordSelectFieldModel', oho: 'RecordSelectFieldModel', obo: 'RecordSelectFieldModel',
  createdBy: 'RecordSelectFieldModel', updatedBy: 'RecordSelectFieldModel', chinaRegion: 'RecordSelectFieldModel',
  o2m: 'RecordSelectFieldModel', m2m: 'RecordSelectFieldModel', mbm: 'RecordSelectFieldModel', linkTo: 'RecordSelectFieldModel',
};

type Kind = 'table' | 'details' | 'form';
const modelClassFor = (kind: Kind) =>
  kind === 'form' ? 'FormItemModel' : kind === 'details' ? 'DetailsItemModel' : 'TableColumnModel';

/** Friendly label of a field-model class (its define()'d label, cleaned of `{{t()}}`); fallback = name. */
export function modelLabel(engine: any, modelName: string): string {
  try {
    const C = engine?.getModelClass?.(modelName);
    const meta = C && (C.meta || (typeof C.getMeta === 'function' && C.getMeta()));
    let lbl: any = meta && meta.label;
    if (lbl) {
      const m = String(lbl).match(/\{\{\s*t\(\s*['"]([^'"]+)['"]/);
      lbl = m ? m[1] : /\{\{/.test(String(lbl)) ? '' : String(lbl);
    }
    return lbl || modelName.replace(/FieldModel$|Model$/, '');
  } catch (e) {
    return modelName;
  }
}

/** Available display components for a field (for the per-column picker): {value: model, label}. Always
 *  includes the default (relations only expose e.g. "Rich select" via bindings, default comes via
 *  the title-field fallback). Excludes Formula (needs its own expression config). */
export function componentOptionsFor(engine: any, collection: any, fieldPath: string): { value: string; label: string; isDefault?: boolean }[] {
  const field = collection?.getField?.(fieldPath);
  const Cls = engine?.getModelClass?.('TableColumnModel');
  const out: { value: string; label: string; isDefault?: boolean }[] = [];
  const seen = new Set<string>();
  const push = (modelName?: string, isDefault?: boolean) => {
    if (!modelName || seen.has(modelName) || /Formula/.test(modelName)) return;
    seen.add(modelName);
    out.push({ value: modelLabel(engine, modelName), label: modelLabel(engine, modelName), isDefault });
  };
  try {
    const def = Cls?.getDefaultBindingByField?.(engine?.context, field, { fallbackToTargetTitleField: true });
    push(def?.modelName, true);
    const bindings = Cls?.getBindingsByField?.(engine?.context, field) || [];
    bindings.forEach((b: any) => push(b.modelName, b.isDefault));
  } catch (e) {
    /* no options */
  }
  return out;
}

/** Resolve a field's renderer model `use`: prefer the component the user picked (matched by LABEL within
 *  this kind's bindings, so display↔edit stay paired), else the framework default, else the interface map. */
function makeResolver(engine: any, collection: any) {
  return (fieldPath: string, kind: Kind, componentLabel?: string): string => {
    const field = collection?.getField?.(fieldPath);
    const Cls = engine?.getModelClass?.(modelClassFor(kind));
    if (componentLabel) {
      try {
        const bindings = Cls?.getBindingsByField?.(engine?.context, field) || [];
        const hit = bindings.find((b: any) => modelLabel(engine, b.modelName) === componentLabel);
        if (hit?.modelName) return hit.modelName;
      } catch (e) {
        /* fall through to the default */
      }
    }
    // To-many relations (o2m/m2m): the framework default is a record PICKER ('Dropdown select'), but a
    // generated app wants children editable INLINE. Default a to-many to an inline SUB-TABLE in forms and
    // a nested sub-table on display. An explicit widget (componentLabel, handled above) still wins — e.g.
    // RelationSpec.widget: 'Sub-table Pro' → PtdlSubtableProFieldModel.
    const relType = field?.type || field?.interface;
    const isToMany = relType === 'hasMany' || relType === 'belongsToMany' || field?.interface === 'o2m' || field?.interface === 'm2m';
    if (isToMany) {
      // Form → prefer @ptdl Sub-table Pro (user's enhanced widget), fall back to the native inline
      // sub-table, then popup editing. Details → read-only sub-table.
      const prefer = kind === 'form'
        ? ['PtdlSubtableProFieldModel', 'SubTableFieldModel', 'PopupSubTableFieldModel']
        : ['DisplaySubTableFieldModel'];
      for (const m of prefer) if (engine?.getModelClass?.(m)) return m;
    }
    try {
      const binding = Cls?.getDefaultBindingByField?.(engine?.context, field, { fallbackToTargetTitleField: true });
      if (binding?.modelName) return binding.modelName;
    } catch (e) {
      /* fall through */
    }
    // A to-many relation (o2m/m2m) has NO scalar default binding — falling to the text/interface map
    // yields DisplayTextFieldModel, which CRASHES on a hasMany ("Cannot read properties of undefined
    // (reading 'interface')"). Use the first real binding instead: e.g. DisplaySubTableFieldModel for a
    // hasMany in a Details block (renders the related rows as a nested sub-table).
    try {
      const bindings = Cls?.getBindingsByField?.(engine?.context, field) || [];
      const pick = bindings.find((b: any) => b.isDefault) || bindings[0];
      if (pick?.modelName) return pick.modelName;
    } catch (e) {
      /* fall through to the map */
    }
    const iface = field?.interface || field?.type || 'input';
    const map = kind === 'form' ? EDIT_BY_INTERFACE : DISPLAY_BY_INTERFACE;
    return map[iface] || (kind === 'form' ? 'InputFieldModel' : 'DisplayTextFieldModel');
  };
}

/**
 * Build the child columns of a sub-table for a to-many relation, from the TARGET collection's fields.
 * `kind:'form'` → editable inline sub-table (SubTableFieldModel) columns = `SubTableColumnModel` (its init
 * flow auto-creates the readPrettyField, field = editable). `kind:'details'` → read-only sub-table
 * (DisplaySubTableFieldModel) columns = plain `TableColumnModel` (field = display renderer).
 * Skips system fields, raw FK columns, other to-many fields (no deep nesting), and the back-reference to
 * the parent. Empty array if the target is unavailable.
 */
function buildSubTableColumns(engine: any, ds: string, targetColl: any, parentCollName: string, assocName: string, kind: 'form' | 'details' = 'form'): any[] {
  if (!targetColl?.getFields) return [];
  const resolveT = makeResolver(engine, targetColl);
  const SYS = new Set(['id', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy', 'createdById', 'updatedById', 'sort']);
  const all = targetColl.getFields() || [];
  // the raw FK columns backing the target's relations (e.g. orderId, productId) — hide them
  const fkNames = new Set<string>();
  all.forEach((f: any) => {
    [f.foreignKey, f.otherKey, f.options?.foreignKey, f.options?.otherKey].forEach((k) => k && fkNames.add(k));
  });
  const fields = all.filter((f: any) => {
    const name = f?.name;
    if (!name || SYS.has(name)) return false;
    if (!f.interface) return false; // FK / system columns have no interface → skip
    if (fkNames.has(name) || f.isForeignKey) return false; // raw FK backing a relation
    const t = f.type || f.interface;
    if (t === 'hasMany' || t === 'belongsToMany' || f.interface === 'o2m' || f.interface === 'm2m') return false;
    const isToOne = f.interface === 'm2o' || t === 'belongsTo';
    if (isToOne && f.target === parentCollName) return false; // don't show the back-ref to the parent row
    return true;
  });
  // Column ORDER follows data-entry logic, not field-creation order: the m2o relation you pick FIRST
  // (which product/service — it often drives a lookup) leads, then editable scalars (qty…), then auto/
  // computed columns (unit-price lookup, line total) last. Field-creation order buried relations (created
  // after scalars) at the end — that's why "Dịch vụ" showed up last.
  const rank = (f: any) => {
    if (f.interface === 'm2o' || (f.type || f.interface) === 'belongsTo') return 0;
    const ui = f.uiSchema || f.options?.uiSchema || {};
    return ui['x-read-pretty'] === true ? 2 : 1; // computed/read-pretty → last
  };
  fields.sort((a: any, b: any) => rank(a) - rank(b)); // stable sort preserves field order within a rank
  const isForm = kind === 'form';
  return fields.map((f: any) => {
    // The editable inline sub-table derives each cell's antd-Form `name` from the COLUMN model's
    // context.fieldPath (client-v2 SubTableColumnModel → MemoCell: `action.context.fieldPath.split('.')`
    // → `[...prefix, rowIdx, leaf]`). It MUST be the association-relative dotted path on the PARENT
    // collection — exactly what the native UI builder persists (collectionName:'ab_orders',
    // fieldPath:'items.qty'). With the child collection + bare 'qty' the cell binds to `[rowIdx,'qty']`
    // (root) while the row data lives at `['items',rowIdx,'qty']` → rows render but every input is EMPTY.
    if (isForm) {
      return {
        use: 'SubTableColumnModel',
        stepParams: { fieldSettings: { init: { dataSourceKey: ds, collectionName: parentCollName, fieldPath: `${assocName}.${f.name}` } } },
        // Native omits the leaf field's own fieldSettings (a leaf FieldModel isn't a CollectionFieldModel;
        // it delegates fieldPath to the column). Keep parity — don't set it here.
        subModels: { field: { use: resolveT(f.name, 'form') } },
      };
    }
    // Read-only Details sub-table renders by dataIndex from the record (no Form-name binding) — child
    // collection + bare fieldPath is correct here.
    return {
      use: 'TableColumnModel',
      stepParams: { fieldSettings: { init: { dataSourceKey: ds, collectionName: targetColl.name, fieldPath: f.name } } },
      subModels: { field: { use: resolveT(f.name, 'table'), stepParams: { fieldSettings: { init: { dataSourceKey: ds, collectionName: targetColl.name, fieldPath: f.name } } } } },
    };
  });
}

// ── small literal builders ─────────────────────────────────────────────────────────────────────
const resInit = (ds: string, coll: string, filterByTk?: boolean) => ({
  resourceSettings: { init: { dataSourceKey: ds, collectionName: coll, ...(filterByTk ? { filterByTk: '{{ctx.view.inputArgs.filterByTk}}' } : {}) } },
});
const fieldStep = (ds: string, coll: string, fp: string) => ({
  fieldSettings: { init: { dataSourceKey: ds, collectionName: coll, fieldPath: fp } },
});

// The TITLE must go through each model's own settings step — the fieldSettings init flow sets
// props.title/label to the FIELD's default, overwriting a bare props.title. Verified via source:
// Table → tableColumnSettings.title.title; Form → editItemSettings.label.label; Details → detailItemSettings.label.label.
const colTitleStep = (t?: string) => (t && t.trim() ? { tableColumnSettings: { title: { title: t.trim() } } } : {});
const formLabelStep = (t?: string) => (t && t.trim() ? { editItemSettings: { label: { label: t.trim() } } } : {});
const detailLabelStep = (t?: string) => (t && t.trim() ? { detailItemSettings: { label: { label: t.trim() } } } : {});

/** One data column: TableColumnModel + its (user-chosen or default) display renderer sub-model. */
function tableColumn(ds: string, coll: string, c: BuiltCol) {
  return {
    use: 'TableColumnModel',
    stepParams: { ...fieldStep(ds, coll, c.name), ...colTitleStep(c.title) },
    subModels: { field: { use: c.tableUse, stepParams: fieldStep(ds, coll, c.name) } },
  };
}

/** Read-only Details block (for View), one DetailsItemModel per picked column. */
function detailsBlock(ds: string, coll: string, cols: BuiltCol[]) {
  return {
    use: 'DetailsBlockModel',
    stepParams: resInit(ds, coll, true),
    subModels: {
      grid: {
        use: 'DetailsGridModel',
        subModels: {
          items: cols.map((c) => ({
            use: 'DetailsItemModel',
            stepParams: { ...fieldStep(ds, coll, c.name), ...detailLabelStep(c.title) },
            subModels: {
              field: {
                use: c.detailsUse,
                stepParams: fieldStep(ds, coll, c.name),
                ...(c.detailsSubCols && c.detailsSubCols.length ? { subModels: { columns: c.detailsSubCols } } : {}),
              },
            },
          })),
        },
      },
    },
  };
}

/** The quick-create popup body: a grid holding a ReferenceBlockModel that renders the target's Add-form
 *  template (resolved by uid at render; the usage row is auto-created server-side on save). Lives at the
 *  relation field's subKey 'grid' (the modalAdd create-form slot). */
function referenceFormGrid(ds: string, targetColl: string, tpl: TemplateRef) {
  return {
    use: 'BlockGridModel',
    subModels: {
      items: [{
        use: 'ReferenceBlockModel',
        stepParams: {
          referenceSettings: {
            useTemplate: { mode: 'reference', templateUid: tpl.templateUid, templateName: tpl.templateName, targetUid: tpl.targetUid },
            target: { mode: 'reference', targetUid: tpl.targetUid },
          },
          resourceSettings: { init: { dataSourceKey: ds, collectionName: targetColl } },
        },
      }],
    },
  };
}

/** Editable form block (Create or Edit) + Submit button, one FormItemModel per picked column. */
function formBlock(blockUse: 'CreateFormModel' | 'EditFormModel', ds: string, coll: string, cols: BuiltCol[]) {
  return {
    use: blockUse,
    stepParams: resInit(ds, coll, blockUse === 'EditFormModel'),
    subModels: {
      grid: {
        use: 'FormGridModel',
        subModels: {
          items: cols.map((c) => {
            // quick-create: switch the component (record editItemSettings.model.use so the settings UI is
            // consistent) + turn on the "Add new" Pop-up, whose create-form is a ReferenceBlockModel (at the
            // field's subKey 'grid') rendering the target's reusable Add-form template.
            const qc = c.quickCreate;
            const fieldSub: any = {};
            if (c.formSubCols && c.formSubCols.length) fieldSub.columns = c.formSubCols;
            if (qc && c.quickCreateTemplate && c.quickCreateTarget) fieldSub.grid = referenceFormGrid(ds, c.quickCreateTarget, c.quickCreateTemplate);
            return {
              use: 'FormItemModel',
              stepParams: { ...fieldStep(ds, coll, c.name), ...formLabelStep(c.title), ...(qc ? { editItemSettings: { model: { use: c.formUse } } } : {}) },
              subModels: {
                field: {
                  use: c.formUse,
                  stepParams: { ...fieldStep(ds, coll, c.name), ...(qc ? { selectSettings: { quickCreate: { quickCreate: 'modalAdd' } } } : {}) },
                  ...(Object.keys(fieldSub).length ? { subModels: fieldSub } : {}),
                },
              },
            };
          }),
        },
      },
      actions: [{ use: 'FormSubmitActionModel' }],
    },
  };
}

/** Build a STANDALONE Add-form (a root CreateFormModel) for `collectionName` and register it as a reusable
 *  block template. Quick-create popups reference it by uid, so the "Add new <X>" form is defined ONCE and
 *  can be edited centrally. Returns the template handle (null on any failure → caller falls back to a plain
 *  empty popup). The usage rows are created server-side when the referencing page saves. */
export async function createAddFormTemplate(
  app: any,
  params: { collectionName: string; columns: QuickColumn[]; dataSourceKey?: string; title?: string },
): Promise<TemplateRef | null> {
  const engine = app?.flowEngine;
  if (!engine?.createModelAsync) return null;
  const ds = params.dataSourceKey || 'main';
  const collection =
    app?.dataSourceManager?.getDataSource?.(ds)?.getCollection?.(params.collectionName) ||
    app?.dataSourceManager?.getCollection?.(ds, params.collectionName);
  const resolve = makeResolver(engine, collection);
  const cols: BuiltCol[] = (params.columns || []).map((c) => ({
    name: c.name, title: c.title,
    tableUse: resolve(c.name, 'table', c.component),
    detailsUse: resolve(c.name, 'details', c.component),
    formUse: resolve(c.name, 'form', c.component),
  }));
  try {
    const targetUid = uid();
    const model = await engine.createModelAsync({ uid: targetUid, ...formBlock('CreateFormModel', ds, params.collectionName, cols) });
    await model.save();
    const templateName = `Form (Thêm mới): ${params.title || params.collectionName}`;
    const res = await app.apiClient.request({
      url: 'flowModelTemplates:create', method: 'post',
      data: { name: templateName, targetUid, useModel: 'CreateFormModel', type: 'block', dataSourceKey: ds, collectionName: params.collectionName },
    });
    const templateUid = res?.data?.data?.uid ?? res?.data?.uid;
    return templateUid ? { templateUid, targetUid, templateName } : null;
  } catch {
    return null;
  }
}

/** Popup shell shared by every action: ChildPage → tab → grid → [block]. */
function popupShell(tabTitle: string, block: any) {
  return {
    use: 'ChildPageModel',
    stepParams: { pageSettings: { general: { displayTitle: false, enableTabs: true } } },
    subModels: {
      tabs: [
        {
          use: 'ChildPageTabModel',
          stepParams: { pageTabSettings: { tab: { title: tabTitle } } },
          subModels: { grid: { use: 'BlockGridModel', subModels: { items: [block] } } },
        },
      ],
    },
  };
}

const rowActionBtn = { buttonSettings: { general: { type: 'link', icon: null } } };

/** The Table block: data columns (`cols`) + a row-actions column (View/Edit) + toolbar actions
 *  (Add/Refresh). The View/Edit/Add popups render `popupCols` (defaults to `cols`). */
function buildTableBlock(p: CreateQuickPageParams, cols: BuiltCol[], popupCols: BuiltCol[]) {
  const ds = p.dataSourceKey || 'main';
  const coll = p.collectionName;
  const labels = { view: 'View', edit: 'Edit', add: 'Add new' };
  return {
    use: p.blockUse || 'TableBlockModel',
    stepParams: resInit(ds, coll),
    subModels: {
      columns: [
        ...cols.map((c) => tableColumn(ds, coll, c)),
        {
          use: 'TableActionsColumnModel',
          subModels: {
            actions: [
              { use: 'ViewActionModel', stepParams: rowActionBtn, subModels: { page: popupShell(labels.view, detailsBlock(ds, coll, popupCols)) } },
              { use: 'EditActionModel', stepParams: rowActionBtn, subModels: { page: popupShell(labels.edit, formBlock('EditFormModel', ds, coll, popupCols)) } },
            ],
          },
        },
      ],
      actions: [
        { use: 'AddNewActionModel', subModels: { page: popupShell(labels.add, formBlock('CreateFormModel', ds, coll, popupCols)) } },
        { use: 'RefreshActionModel' },
      ],
    },
  };
}

/** Compute the running client's path prefix ('/v' on the modern client, '' on classic). */
export function clientPrefix(): string {
  const cur = (typeof window !== 'undefined' && window.location?.pathname) || '/admin';
  return (cur.split('/admin')[0] || '').replace(/\/+$/, '');
}

/**
 * Create the whole page and its menu route. Returns the new page's schemaUid.
 * `app` is the client-v2 Application (has flowEngine, dataSourceManager, context.routeRepository, apiClient).
 */
export async function createQuickPage(app: any, params: CreateQuickPageParams): Promise<{ pageSchemaUid: string }> {
  const engine = app?.flowEngine;
  if (!engine) throw new Error('flowEngine unavailable');
  const ds = params.dataSourceKey || 'main';
  const collection =
    app?.dataSourceManager?.getDataSource?.(ds)?.getCollection?.(params.collectionName) ||
    app?.dataSourceManager?.getCollection?.(ds, params.collectionName);
  const resolve = makeResolver(engine, collection);
  // Resolve each column's display + edit model once (component picked by label stays paired across
  // table / details / form; title is shared).
  const buildCols = (list: QuickColumn[]): BuiltCol[] =>
    (list || []).map((c) => {
      const bc: BuiltCol = {
        name: c.name,
        title: c.title,
        tableUse: resolve(c.name, 'table', c.component),
        detailsUse: resolve(c.name, 'details', c.component),
        formUse: resolve(c.name, 'form', c.component),
      };
      // A to-many relation rendered as a sub-table needs its child columns pre-built (they don't
      // auto-derive) — for BOTH the editable form sub-table and the read-only details sub-table.
      if (/subtable/i.test(bc.formUse) || /subtable/i.test(bc.detailsUse)) {
        const field = collection?.getField?.(c.name);
        const target =
          field?.targetCollection ||
          app?.dataSourceManager?.getDataSource?.(ds)?.getCollection?.(field?.target) ||
          app?.dataSourceManager?.getCollection?.(ds, field?.target);
        if (target) {
          if (/subtable/i.test(bc.formUse)) bc.formSubCols = buildSubTableColumns(engine, ds, target, params.collectionName, c.name, 'form');
          if (/subtable/i.test(bc.detailsUse)) bc.detailsSubCols = buildSubTableColumns(engine, ds, target, params.collectionName, c.name, 'details');
        }
      }
      // quick-create: to-one relation gets an inline "Add new <target>". Prefer the "Rich select"
      // component (@ptdl/field-enhancements) — fall back to whatever the resolver picked (Dropdown select).
      if (c.quickCreate && /RecordSelect|RichSelect|RecordPicker/i.test(bc.formUse)) {
        const field = collection?.getField?.(c.name);
        bc.quickCreate = true;
        bc.quickCreateTarget = field?.target || field?.targetCollection?.name || field?.options?.target;
        bc.quickCreateTemplate = bc.quickCreateTarget ? params.quickCreateTemplates?.[bc.quickCreateTarget] : undefined;
        const hasRich = (() => { try { return !!engine.getModelClass?.('PtdlRichSelectFieldModel'); } catch { return false; } })();
        if (hasRich) bc.formUse = 'PtdlRichSelectFieldModel';
      }
      return bc;
    });
  const cols = buildCols(params.columns);
  // Popups reuse `columns` unless `popupColumns` is given (e.g. to add a hasMany sub-table not in the grid).
  const popupCols = params.popupColumns && params.popupColumns.length ? buildCols(params.popupColumns) : cols;

  const pageSchemaUid = uid();
  const menuSchemaUid = uid();
  const tabSchemaUid = uid();
  const tabSchemaName = uid();

  const tableBlock = buildTableBlock(params, cols, popupCols);

  // 1) Create the menu route FIRST. For a flowPage this also creates the RouteModel at `schemaUid`
  //    (verified live). We must NOT pre-create our own model at that uid — it would collide
  //    ("uid already exists"). The RouteModel's page/tab/grid are otherwise built lazily on render.
  const routeValues = {
    type: 'flowPage',
    title: params.title,
    icon: params.icon || undefined,
    ...(params.parentId ? { parentId: params.parentId } : {}),
    schemaUid: pageSchemaUid,
    menuSchemaUid,
    enableTabs: false,
    children: [{ type: 'tabs', schemaUid: tabSchemaUid, tabSchemaName, hidden: true }],
  };
  const routeRepo = app?.context?.routeRepository;
  if (routeRepo?.createRoute) {
    await routeRepo.createRoute(routeValues);
  } else {
    await app.apiClient.resource('desktopRoutes').create({ values: routeValues });
    await routeRepo?.refreshAccessible?.();
  }

  // 2) Build the page content as the RouteModel's `page` sub-model (fresh uids for RootPageModel/grid;
  //    the tab uid matches the route's hidden `tabs` child so a later render loads ours, not a fresh
  //    one). One save() persists the whole subtree; grids normalize their layout on render (so no
  //    pre-save saveGridLayout — calling it on not-yet-persisted popup grids 500s flowModels:save).
  const pageModel = await engine.createModelAsync({
    parentId: pageSchemaUid,
    subKey: 'page',
    subType: 'object',
    use: 'RootPageModel',
    subModels: {
      tabs: [
        {
          uid: tabSchemaUid,
          use: 'RootPageTabModel',
          props: { route: { type: 'tabs', schemaUid: tabSchemaUid, tabSchemaName, hidden: true } },
          subModels: { grid: { use: 'BlockGridModel', subModels: { items: [tableBlock] } } },
        },
      ],
    },
  });
  await pageModel.save();

  return { pageSchemaUid };
}
