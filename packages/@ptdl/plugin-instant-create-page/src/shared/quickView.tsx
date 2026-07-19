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
}

export interface CreateQuickPageParams {
  dataSourceKey?: string;
  collectionName: string;
  title: string;
  icon?: string;
  parentId?: number | null; // parent menu group route id; null/undefined = top level
  columns: QuickColumn[]; // ordered
  /** table block class — 'TableBlockModel' (basic) or 'EnhancedTableBlockModel' (summary row + cell-select). */
  blockUse?: string;
}

/** Resolved per-column model uses (display for table/details, editable for the form), title synced. */
interface BuiltCol {
  name: string;
  title?: string;
  tableUse: string;
  detailsUse: string;
  formUse: string;
  relPopup?: any; // to-one relation → click-to-open Details popup of the TARGET (see relationPopupColumns)
}

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
    try {
      const binding = Cls?.getDefaultBindingByField?.(engine?.context, field, { fallbackToTargetTitleField: true });
      if (binding?.modelName) return binding.modelName;
    } catch (e) {
      /* fall through to the map */
    }
    const iface = field?.interface || field?.type || 'input';
    const map = kind === 'form' ? EDIT_BY_INTERFACE : DISPLAY_BY_INTERFACE;
    return map[iface] || (kind === 'form' ? 'InputFieldModel' : 'DisplayTextFieldModel');
  };
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

/** One data column: TableColumnModel + its (user-chosen or default) display renderer sub-model. A to-one
 *  relation's `relPopup` (see relationPopupColumns) is attached at the field's own `page` subKey — exactly
 *  where the framework's openView action loads the click-to-open popup's content — so clicking the relation
 *  cell shows the related record's Details instead of opening an empty drawer. */
function tableColumn(ds: string, coll: string, c: BuiltCol) {
  return {
    use: 'TableColumnModel',
    stepParams: { ...fieldStep(ds, coll, c.name), ...colTitleStep(c.title) },
    subModels: {
      field: {
        use: c.tableUse,
        stepParams: fieldStep(ds, coll, c.name),
        ...(c.relPopup ? { subModels: { page: c.relPopup } } : {}),
      },
    },
  };
}

/** Read-only Details block (for View), one DetailsItemModel per picked column, plus an optional action bar
 *  (`actions` — an Edit button and/or a Change-status action; built by buildTableBlock). A relation display
 *  item gets the SAME `relPopup` fix as tableColumn(): without it, clicking a relation field here also pops
 *  an empty drawer. */
function detailsBlock(ds: string, coll: string, cols: BuiltCol[], actions?: any[]) {
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
                ...(c.relPopup ? { subModels: { page: c.relPopup } } : {}),
              },
            },
          })),
        },
      },
      ...(actions && actions.length ? { actions } : {}),
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
          items: cols.map((c) => ({
            use: 'FormItemModel',
            stepParams: { ...fieldStep(ds, coll, c.name), ...formLabelStep(c.title) },
            subModels: { field: { use: c.formUse, stepParams: fieldStep(ds, coll, c.name) } },
          })),
        },
      },
      actions: [{ use: 'FormSubmitActionModel' }],
    },
  };
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

/** Edit action (EditActionModel — the mechanism NocoBase uses everywhere for row-level edit): opens an Edit
 *  form over `cols`. ONE function builds BOTH the row-level Edit button AND the View popup's own Edit button,
 *  so row-Edit / View→Edit / Add always render the exact same fields, in the same order. */
function editAction(ds: string, coll: string, cols: BuiltCol[], asRowLink: boolean, tabTitle = 'Edit') {
  return {
    use: 'EditActionModel',
    stepParams: asRowLink ? rowActionBtn : { buttonSettings: { general: { type: 'default' } } },
    subModels: { page: popupShell(tabTitle, formBlock('EditFormModel', ds, coll, cols)) },
  };
}

/** "Change status" action — @ptdl/plugin-status-flow's own StatusTransitionActionModel (a record-scene
 *  action, same family as View/Edit: it reads ctx.record/ctx.collection wherever it's placed). Emitted into
 *  BOTH the row actions and the View popup for a collection that has a statusFlow field; the transition
 *  itself stays enforced server-side. Returns undefined (no button) when the model isn't registered — i.e. a
 *  site without @ptdl/plugin-status-flow simply doesn't get the button. */
function changeStatusAction(engine: any, statusFieldName: string, asRowLink: boolean): any | undefined {
  try {
    if (!engine?.getModelClass?.('StatusTransitionActionModel')) return undefined;
  } catch {
    return undefined;
  }
  return {
    use: 'StatusTransitionActionModel',
    stepParams: {
      buttonSettings: { general: { type: asRowLink ? 'link' : 'default', title: 'Đổi trạng thái', ...(asRowLink ? { icon: null } : {}) } },
      ptdlStatusTransition: { settings: { sfFieldName: statusFieldName, sfConfirm: true, sfAskNote: false } },
    },
  };
}

/** Delete action (DeleteActionModel — NocoBase's built-in record delete: a danger button with a confirm
 *  dialog, record-scene like View/Edit so it reads ctx.record wherever it's placed). Emitted into BOTH the
 *  row actions AND the View popup's Details action bar, so a record can be removed from either place. */
function deleteAction(asRowLink: boolean): any {
  return {
    use: 'DeleteActionModel',
    stepParams: asRowLink ? rowActionBtn : { buttonSettings: { general: { type: 'default' } } },
  };
}

/** Build the shallow display columns for a to-one relation's click-to-open Details popup (the TARGET's own
 *  fields). Filters system fields, raw FK columns, to-many fields, and the back-ref to the source row —
 *  no nested popups within this popup. */
function relationPopupColumns(engine: any, targetColl: any, sourceCollName: string): BuiltCol[] {
  if (!targetColl?.getFields) return [];
  const resolveT = makeResolver(engine, targetColl);
  const SYS = new Set(['id', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy', 'createdById', 'updatedById', 'sort']);
  const all = targetColl.getFields() || [];
  const fkNames = new Set<string>();
  all.forEach((f: any) => {
    [f.foreignKey, f.otherKey, f.options?.foreignKey, f.options?.otherKey].forEach((k) => k && fkNames.add(k));
  });
  const fields = all.filter((f: any) => {
    const name = f?.name;
    if (!name || SYS.has(name) || !f.interface) return false;
    if (fkNames.has(name) || f.isForeignKey) return false;
    const t = f.type || f.interface;
    if (t === 'hasMany' || t === 'belongsToMany' || f.interface === 'o2m' || f.interface === 'm2m') return false;
    const isToOne = f.interface === 'm2o' || t === 'belongsTo';
    if (isToOne && f.target === sourceCollName) return false; // don't show the back-ref to the source row
    return true;
  });
  return fields.map((f: any) => ({
    name: f.name,
    tableUse: resolveT(f.name, 'table'),
    detailsUse: resolveT(f.name, 'details'),
    formUse: resolveT(f.name, 'form'),
  }));
}

/** Find the collection's @ptdl/plugin-status-flow field name (if any), so the page can offer a
 *  Change-status action. Mirrors that plugin's own detection: `interface === 'statusFlow'` OR a configured
 *  `options.statusFlow.initial` (a programmatically-created field doesn't always surface `interface`). */
function findStatusFlowField(collection: any): string | undefined {
  const fields = collection?.getFields?.() || [];
  const hit = fields.find(
    (f: any) => f?.interface === 'statusFlow' || !!(f?.options?.statusFlow && typeof f.options.statusFlow === 'object' && f.options.statusFlow.initial),
  );
  return hit?.name;
}

/** The Table block: data columns + a row-actions column (View/Edit[/Change-status]) + toolbar actions
 *  (Add/Refresh). The View popup ALSO gets its own Edit button, and — when the collection has a statusFlow
 *  field — a Change-status action joins both the row actions AND the View popup's action bar. */
function buildTableBlock(p: CreateQuickPageParams, cols: BuiltCol[], statusFieldName?: string, engine?: any) {
  const ds = p.dataSourceKey || 'main';
  const coll = p.collectionName;
  const labels = { view: 'View', edit: 'Edit', add: 'Add new' };
  const rowStatusAction = statusFieldName ? changeStatusAction(engine, statusFieldName, true) : undefined;
  const viewStatusAction = statusFieldName ? changeStatusAction(engine, statusFieldName, false) : undefined;
  const viewActions = [editAction(ds, coll, cols, false, labels.edit), ...(viewStatusAction ? [viewStatusAction] : []), deleteAction(false)];
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
              { use: 'ViewActionModel', stepParams: rowActionBtn, subModels: { page: popupShell(labels.view, detailsBlock(ds, coll, cols, viewActions)) } },
              editAction(ds, coll, cols, true, labels.edit),
              ...(rowStatusAction ? [rowStatusAction] : []),
              deleteAction(true),
            ],
          },
        },
      ],
      actions: [
        { use: 'AddNewActionModel', subModels: { page: popupShell(labels.add, formBlock('CreateFormModel', ds, coll, cols)) } },
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
  // table / details / form; title is shared). A to-one relation ALSO gets a `relPopup` — a read-only
  // Details of the TARGET — so the relation cell/field is a working click-to-open link, not an empty drawer.
  const cols: BuiltCol[] = (params.columns || []).map((c) => {
    const bc: BuiltCol = {
      name: c.name,
      title: c.title,
      tableUse: resolve(c.name, 'table', c.component),
      detailsUse: resolve(c.name, 'details', c.component),
      formUse: resolve(c.name, 'form', c.component),
    };
    const field = collection?.getField?.(c.name);
    const relTarget = field?.target || field?.targetCollection?.name || field?.options?.target;
    const relKind = field?.type || field?.interface;
    const relIsToMany = relKind === 'hasMany' || relKind === 'belongsToMany' || field?.interface === 'o2m' || field?.interface === 'm2m';
    if (relTarget && !relIsToMany) {
      const targetColl =
        field?.targetCollection ||
        app?.dataSourceManager?.getDataSource?.(ds)?.getCollection?.(relTarget) ||
        app?.dataSourceManager?.getCollection?.(ds, relTarget);
      const relCols = relationPopupColumns(engine, targetColl, params.collectionName);
      if (relCols.length) bc.relPopup = popupShell('Details', detailsBlock(ds, relTarget, relCols));
    }
    return bc;
  });
  // A statusFlow column (if any) enables a Change-status action in both the row actions + the View popup.
  const statusFieldName = findStatusFlowField(collection);

  const pageSchemaUid = uid();
  const menuSchemaUid = uid();
  const tabSchemaUid = uid();
  const tabSchemaName = uid();

  const tableBlock = buildTableBlock(params, cols, statusFieldName, engine);

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
