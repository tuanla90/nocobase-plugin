/**
 * Quick View — core builder. Turns "a collection + a list of columns" into a ready-to-use `/v/`
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

export type QuickField = string; // a collection field name (a.k.a. fieldPath at depth 1)

export interface CreateQuickPageParams {
  dataSourceKey?: string;
  collectionName: string;
  title: string;
  icon?: string;
  parentId?: number | null; // parent menu group route id; null/undefined = top level
  fields: QuickField[]; // ordered picked columns
  /** table block class — 'TableBlockModel' (basic) now, 'EnhancedTableBlockModel' later (phase 2). */
  blockUse?: string;
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

/** Resolve the renderer model `use` for a field: framework resolver first, interface map as fallback. */
function makeResolver(engine: any, collection: any) {
  const modelClassFor = (kind: Kind) =>
    kind === 'form' ? 'FormItemModel' : kind === 'details' ? 'DetailsItemModel' : 'TableColumnModel';
  return (fieldPath: string, kind: Kind): string => {
    const field = collection?.getField?.(fieldPath);
    // 1) framework's own interface→model resolver (honors isDefault overrides + custom interfaces)
    try {
      const Cls = engine?.getModelClass?.(modelClassFor(kind));
      const binding = Cls?.getDefaultBindingByField?.(engine?.context, field, { fallbackToTargetTitleField: true });
      if (binding?.modelName) return binding.modelName;
    } catch (e) {
      /* fall through to the map */
    }
    // 2) interface map fallback
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

/** One data column: TableColumnModel + its display renderer sub-model. */
function tableColumn(ds: string, coll: string, fp: string, resolve: (fp: string, k: Kind) => string) {
  return {
    use: 'TableColumnModel',
    stepParams: fieldStep(ds, coll, fp),
    subModels: { field: { use: resolve(fp, 'table'), stepParams: fieldStep(ds, coll, fp) } },
  };
}

/** Read-only Details block (for View), one DetailsItemModel per picked field. */
function detailsBlock(ds: string, coll: string, fields: string[], resolve: (fp: string, k: Kind) => string) {
  return {
    use: 'DetailsBlockModel',
    stepParams: resInit(ds, coll, true),
    subModels: {
      grid: {
        use: 'DetailsGridModel',
        subModels: {
          items: fields.map((fp) => ({
            use: 'DetailsItemModel',
            stepParams: fieldStep(ds, coll, fp),
            subModels: { field: { use: resolve(fp, 'details'), stepParams: fieldStep(ds, coll, fp) } },
          })),
        },
      },
    },
  };
}

/** Editable form block (Create or Edit) + Submit button, one FormItemModel per picked field. */
function formBlock(blockUse: 'CreateFormModel' | 'EditFormModel', ds: string, coll: string, fields: string[], resolve: (fp: string, k: Kind) => string) {
  return {
    use: blockUse,
    stepParams: resInit(ds, coll, blockUse === 'EditFormModel'),
    subModels: {
      grid: {
        use: 'FormGridModel',
        subModels: {
          items: fields.map((fp) => ({
            use: 'FormItemModel',
            stepParams: fieldStep(ds, coll, fp),
            subModels: { field: { use: resolve(fp, 'form'), stepParams: fieldStep(ds, coll, fp) } },
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

/** The Table block: data columns + a row-actions column (View/Edit) + toolbar actions (Add/Refresh). */
function buildTableBlock(p: CreateQuickPageParams, resolve: (fp: string, k: Kind) => string) {
  const ds = p.dataSourceKey || 'main';
  const coll = p.collectionName;
  const labels = { view: 'View', edit: 'Edit', add: 'Add new' };
  return {
    use: p.blockUse || 'TableBlockModel',
    stepParams: resInit(ds, coll),
    subModels: {
      columns: [
        ...p.fields.map((fp) => tableColumn(ds, coll, fp, resolve)),
        {
          use: 'TableActionsColumnModel',
          subModels: {
            actions: [
              { use: 'ViewActionModel', stepParams: rowActionBtn, subModels: { page: popupShell(labels.view, detailsBlock(ds, coll, p.fields, resolve)) } },
              { use: 'EditActionModel', stepParams: rowActionBtn, subModels: { page: popupShell(labels.edit, formBlock('EditFormModel', ds, coll, p.fields, resolve)) } },
            ],
          },
        },
      ],
      actions: [
        { use: 'AddNewActionModel', subModels: { page: popupShell(labels.add, formBlock('CreateFormModel', ds, coll, p.fields, resolve)) } },
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

  const pageSchemaUid = uid();
  const menuSchemaUid = uid();
  const tabSchemaUid = uid();
  const tabSchemaName = uid();

  const tableBlock = buildTableBlock(params, resolve);

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
