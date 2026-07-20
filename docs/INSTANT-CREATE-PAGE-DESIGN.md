# Instant Create Page — Design & Build Notes (`@tuanla90/plugin-instant-create-page`)

**Goal:** one action → a ready-to-use `/v/` menu page. Pick a collection + a list of columns; get a
Table of those columns with working **View / Edit / Add** buttons. v0.1.0 LIVE (verified end-to-end on
nb-local: launcher → pick `order` + Amount/Status/Phone → Create → working page with 21 rows + popups).

## What it generates
A **native, fully-editable** page (no custom runtime): a `desktopRoutes` row (`type:'flowPage'`) + a tree
of core `flowModels`. Because the output is standard NocoBase, the user keeps customizing it afterward.

## The create recipe (all shapes verified against a live NocoBase 2.1.19 DB + client-v2 `src/`)

`createQuickPage(app, {collectionName, fields, title, icon, parentId})` in `src/shared/quickView.tsx`:

1. **Create the route FIRST.** `app.context.routeRepository.createRoute({ type:'flowPage', title, icon,
   parentId?, schemaUid, menuSchemaUid, enableTabs:false, children:[{type:'tabs', schemaUid:tabUid,
   tabSchemaName, hidden:true}] })`.
   - ⚠️ For a `flowPage`, `createRoute` **also creates a `RouteModel` flowModel at `schemaUid`** (verified:
     `flowModels:findOne?uid=<schemaUid>` → `use:'RouteModel'`). So you must NOT pre-save your own model
     at that uid — it 400s **"uid already exists"**. Route-first is mandatory.
2. **Attach the page content UNDER that RouteModel:** `flowEngine.createModelAsync({ parentId: schemaUid,
   subKey:'page', subType:'object', use:'RootPageModel', subModels:{ tabs:[{ uid:tabUid, use:'RootPageTabModel',
   subModels:{ grid:{ use:'BlockGridModel', subModels:{ items:[tableBlock] } } } }] } })`, then `pageModel.save()`.
   - The framework builds `RouteModel → RootPageModel[page] → RootPageTabModel[tabs] → BlockGridModel[grid]`
     lazily on render; we pre-build it with the tab `uid` == the route's hidden `tabs` child so a later
     render loads ours. RootPageModel/grid get fresh uids.
   - **Do NOT call `saveGridLayout()` before `pageModel.save()`** — it fires a `flowModels:save` on
     not-yet-persisted popup grids → **500**. Grids normalize their layout on render, so it isn't needed.
3. Navigate (`window.location.assign(`${clientPrefix()}/admin/${schemaUid}`)`).

### The table-block tree (`buildTableBlock`)
```
TableBlockModel  stepParams.resourceSettings.init={dataSourceKey,collectionName}
├ columns[]: TableColumnModel (per picked field)
│   stepParams.fieldSettings.init={dataSourceKey,collectionName,fieldPath}
│   subModels.field = { use: <display renderer> }
├ columns[]: TableActionsColumnModel
│   └ actions[]: ViewActionModel, EditActionModel   (stepParams.buttonSettings.general={type:'link',icon:null})
│       └ page: ChildPageModel → tabs[ChildPageTabModel] → grid[BlockGridModel] → items[ (View) DetailsBlockModel | (Edit) EditFormModel + FormSubmitActionModel ]
└ actions[]: AddNewActionModel (→ CreateFormModel + FormSubmitActionModel), RefreshActionModel
```
- View/Edit/Add popups reuse the **same picked columns** (user decision): Details/Form items per field.
- Edit/View forms bind with `filterByTk:'{{ctx.view.inputArgs.filterByTk}}'` (auto-derived at runtime).
- Renderer per field: `<ItemModelClass>.getDefaultBindingByField(engine.context, field, {fallbackToTargetTitleField:true})?.modelName`
  (framework's own interface→model resolver, honors @tuanla90 field-enhancements overrides), with an
  interface→model map fallback. Table/Details use `Display*FieldModel`; Form uses editable (`Input/Number/Select/...`).

### Column → field-component mapping (verified live)
Auto-resolved from the field's interface; fallback maps in `quickView.tsx` mirror it:

| Field interface / type | Table + Details (display) | Form (edit) |
|---|---|---|
| input/email/phone/url/uuid | `DisplayTextFieldModel` | `InputFieldModel` |
| textarea/markdown | `DisplayTextFieldModel` | `TextareaFieldModel` |
| number/integer/id/percent | `DisplayNumber`/`DisplayPercentFieldModel` | `NumberFieldModel`/`PercentFieldModel` |
| select/multipleSelect/radio | `DisplayEnumFieldModel` | `SelectFieldModel` |
| checkbox/boolean | `DisplayCheckboxFieldModel` | `CheckboxFieldModel` |
| date/datetime/time | `DisplayDateTime`/`DisplayTimeFieldModel` | `DateOnly`/`DateTimeNoTz`/`TimeFieldModel` |
| color/icon/json/richText/password | `DisplayColor`/`Icon`/`JSON`/`Html`/`PasswordFieldModel` | `Color`/`Icon`/`Json`/`RichText`/`PasswordFieldModel` |
| **relation** (belongsTo/m2o, hasOne, hasMany, m2m…) | `DisplayTextFieldModel` (related record's **title**) | `RecordSelectFieldModel` (record picker) |

### Relation columns — the "column turns into an id" fix
`@tuanla90/shared`'s `buildColumnOptions` maps a belongsTo → its **foreign-key** column (right for filtering,
wrong for a table column) → `fieldPath = client_id` → renders the FK **id**. Fix in
`QuickCreateForm.buildQuickColumnOptions`: offer the **relation by name** (`fieldPath = client`) and **hide
the raw FK columns** (client_id, createdById, …) they back. Then `getDefaultBindingByField` resolves the
relation renderer and the column shows the related record's title (verified live: "Super Admin", not `1`),
data auto-appended by the framework (no manual `appends`). Also: collection/column/group selects show a
loading spinner while fetching so an in-flight list never looks like an empty dropdown.

## Gotchas that bit us (fix once, remember)
- **`uid` is NOT exported by `@nocobase/flow-engine`** (agent guessed wrong). NocoBase's is in
  `@nocobase/utils/client`. We use a **local generator** (lowercase alphanumeric, 11 chars) — verified to
  persist + back a working page. Importing the wrong path → runtime `(0,v.uid) is not a function` (only
  caught by driving the real form, not the console replica).
- **Build dep — RESOLVED by dropping `@tuanla90/shared` entirely.** Importing ANYTHING from `@tuanla90/shared`
  pulls its whole `index.mjs`, whose `settingsKit` section imports `@formily/react` (+ its inter-dependent
  scope: `@formily/core→@formily/shared→camel-case…`) at module top level. rspack then tries to BUNDLE all
  of it (formily isn't reliably externalized for a bundled dep), a deep fragile chain that caused endless
  "can't resolve" churn. Since this plugin renders only plain antd (custom column list, no ColumnSelect),
  we now import NOTHING from shared — a tiny inlined `getFields` replaces the one helper we used. Result:
  clean **38 KB** client-v2 bundle, zero formily. Lesson: for a plugin that doesn't render shared UI, don't
  import shared at all; the whole-index pull isn't worth one helper.
- Headless `/v/` render is janky but the **JS context works** — validate via `window.__nocobase_v2_app__`
  (`flowEngine`, `context.routeRepository`, `dataSourceManager`) rather than screenshots.

## Entry points (both, per user)
- Settings page: `pluginSettingsManager.addMenuItem({key:'instant-create-page'})` + `addPageTabItem`.
- Floating launcher "➕ Quick page" via `app.addProvider` → drawer with the same form.

## Files
`packages/@tuanla90/plugin-instant-create-page/` — `src/shared/{quickView.tsx (builder+create), QuickCreateForm.tsx (UI),
Launcher.tsx}`, `src/client-v2/index.tsx` (primary lane: settings page + launcher + i18n), `src/client/index.tsx`
(classic no-op), `src/server/index.ts` (enable-only), `src/locale/{en,vi}`. Build: `build-env/recipes/run-instant-create-page-build.sh`.

## Per-column config + Enhanced Table (phase 2 — SHIPPED, live-verified)
Columns use a **multi-select** (mode multiple → stays open so you tick several at once, `reconcileColumns`
preserves order+config) PLUS an **ordered config list** below it: each row has ↑↓ reorder, ✕ remove, and a
**⚙ popover** to set that column's **component** + **title**. Layout (per user): Collection · [Page title |
Table type] · [Icon | Place-under-group] · **Columns last** (biggest/most interactive, right above Create).
The **Table type** dropdown (Basic `TableBlockModel` ↔ `EnhancedTableBlockModel`) shows only if the
enhanced-table plugin is registered. The **Icon** field is a full searchable visual picker — `import *
as AntdIcons` (external, no bundle cost); `iconOptions` = all `*Outlined` keys at render, `filterOption` on
the name (type "user" → UserOutlined, UserAddOutlined…), `optionRender`/`labelRender` show the real glyph.
Data model = `columns: {name, title?, component?}[]` + `blockUse`.

**⚙ depth is intentionally shallow** — pick the component + rename only; it uses each widget's DEFAULT
settings. Deeper per-widget config (Progress color/max, Value-tag rules, number format…) is done ON the
generated page via that column's native ⚙ (full flow-settings dialog), since the output is a standard page.
Instant Create Page is a fast scaffold, not a re-implementation of every widget's uiSchema.

- **Component options** per column: `TableColumnModel.getBindingsByField(ctx, field)` → `[{modelName, isDefault}]`;
  labelled via `modelLabel()` = the model class's `meta.label` (cleaned of `{{t()}}`). Always include the
  default (relations only expose e.g. "Rich select" in bindings — the title-text default comes from the
  `fallbackToTargetTitleField` path). Exclude `Formula` (needs its own expression). Live options for a number
  field: Number / Number with unit / Star rating / Progress bar; for a select: Select / Value tag / Button group.
- **Component syncs table↔form by LABEL:** the user picks a label; `makeResolver` resolves the matching model
  within EACH kind's bindings (`TableColumnModel`/`DetailsItemModel`/`FormItemModel`) — so "Progress bar" display
  ↔ "Progress bar" input pair up; a display-only widget falls back to the edit default. Verified: amount column
  rendered 20 antd `.ant-progress` bars; the framework persisted it as `stepParams.tableColumnSettings.model.use`.
- **Title must go through the model's settings step, NOT `props.title`** — the field's `init` flow overwrites
  `props.title` with the field default. Verified paths: Table → `stepParams.tableColumnSettings.title.title`;
  Form → `stepParams.editItemSettings.label.label`; Details → `stepParams.detailItemSettings.label.label`.
  Live-verified: header showed "Số tiền", not "Amount".

## Roadmap (remaining)
- Per-column width; per-popup field set distinct from columns (incl. auto-include required fields); drag (vs ↑↓) reorder.
- Enhanced-table summary row is configured on the generated page via its own ⚙ (not pre-set by Instant Create Page).
