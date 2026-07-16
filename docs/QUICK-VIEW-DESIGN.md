# Quick View — Design & Build Notes (`@ptdl/plugin-quick-view`)

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
  (framework's own interface→model resolver, honors @ptdl field-enhancements overrides), with an
  interface→model map fallback. Table/Details use `Display*FieldModel`; Form uses editable (`Input/Number/Select/...`).

## Gotchas that bit us (fix once, remember)
- **`uid` is NOT exported by `@nocobase/flow-engine`** (agent guessed wrong). NocoBase's is in
  `@nocobase/utils/client`. We use a **local generator** (lowercase alphanumeric, 11 chars) — verified to
  persist + back a working page. Importing the wrong path → runtime `(0,v.uid) is not a function` (only
  caught by driving the real form, not the console replica).
- **Build dep:** `@ptdl/shared`'s `settingsKit` imports `@formily/react` + `lucide-react` at module top
  level, so rspack must RESOLVE them even though we only use `ColumnSelect`/i18n. They must be **real**
  packages in `build-env/node_modules` (a name+version stub has no entry → "can't resolve"). `@formily/*`
  stays external (app-provided) so it isn't bundled; the recipe fails loudly if pruned. Do NOT `npm i` in
  build-env casually — it prunes the hand-built stubs and `@ptdl/shared` (both auto-restored by the recipe now).
- Headless `/v/` render is janky but the **JS context works** — validate via `window.__nocobase_v2_app__`
  (`flowEngine`, `context.routeRepository`, `dataSourceManager`) rather than screenshots.

## Entry points (both, per user)
- Settings page: `pluginSettingsManager.addMenuItem({key:'quick-view'})` + `addPageTabItem`.
- Floating launcher "➕ Quick page" via `app.addProvider` → drawer with the same form.

## Files
`packages/@ptdl/plugin-quick-view/` — `src/shared/{quickView.tsx (builder+create), QuickCreateForm.tsx (UI),
Launcher.tsx}`, `src/client-v2/index.tsx` (primary lane: settings page + launcher + i18n), `src/client/index.tsx`
(classic no-op), `src/server/index.ts` (enable-only), `src/locale/{en,vi}`. Build: `build-env/recipes/run-quick-view-build.sh`.

## Roadmap (phase 2)
- Basic vs `EnhancedTableBlockModel` toggle (already parameterized via `blockUse`; add the UI switch).
- Drag-reorder columns; per-column width/label; per-popup field set (incl. auto-include required fields).
- Trim bundle: shared pulls its whole `index` (≈197KB). Subpath exports / `sideEffects:false` on `@ptdl/shared`
  would let rspack tree-shake `settingsKit` back out (the very first build orphaned it → 43KB).
