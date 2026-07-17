# @ptdl/plugin-field-order — Reorder collection fields

Adds a **"Reorder fields"** button to the Collection Manager's *Configure fields* drawer. Click it →
a drag-and-drop (+ ↑/↓) dialog listing the collection's UI fields in current order → **Save** →
persists the new order to `fields.sort`. Runs on both the classic (`/admin`) and modern (`/v/`) clients.

Status: **v0.1.0 — LIVE, e2e-verified on both lanes** (nb-local, sqlite).

## Why

NocoBase orders the *Configure fields* screen **and** the block field-pickers by `fields.sort`
(a `sortable` collection, `scopeKey = collectionName`). A field added later gets `sort = max+1` → it
always lands at the bottom, and **core exposes no UI to move it** (the fields table hard-codes
`dragSort: false`). This plugin fills that gap.

Scope reminder: changing `sort` updates **this screen** and the default order **new** blocks/forms
inherit. Blocks/forms **already built** keep their own layout (block schema is independent) — this is
by design, matches NocoBase, and is stated in the dialog.

## How it works

### Server (`src/server`)
One action `fieldOrder:reorder` (`{ collectionName, order: string[] }`). Raw dialect-quoted `UPDATE`
in a transaction. **Reuse-slots renumber:** it takes the *current* sort values of exactly the fields
being reordered, sorts them ascending, and reassigns them in the new sequence — so system/hidden
fields are never touched and no new collisions appear. Bypasses field-model hooks (only display order
changes, never the schema). ACL: `loggedIn` (the screen is admin-only; the action only shuffles
display metadata). Targets the **main** data source's `fields` table.

### Client (`src/shared/fieldOrder.tsx`, both lanes)
- Mounted at **body level** via `initFieldOrder()` in each lane's `load()` (NOT `app.addProvider`) —
  see trap #1.
- Watches the DOM (MutationObserver + a 1 s interval) for the *Configure fields* drawer and portals
  the button into its toolbar `.ant-space`.
- Reads fields via `collections/<c>/fields:list` (sort order); saves via `fieldOrder:reorder`; then
  **closes + reopens** the drawer so its table re-fetches and shows the new order.

## Cross-lane detection (no aria-labels on `/v/`)

The classic lane tags actions with aria-labels (`action-CollectionFields-…-fields-<coll>`); the
**modern `/v/` lane exposes none**. So detection is structural + click-tracked, identical on both:
- **Route gate (critical)**: only ever act when `location.pathname` contains `data-source-manager`.
  Without it the structural heuristic below **false-positives on record-edit drawers** on ordinary app
  pages — those have a sub-table (`tr[data-row-key]`) + a Submit primary button in a Space, and their
  row clicks are record ids (not collection names). The Configure-fields drawer keeps the
  `…/data-source-manager/…` URL while open; record-edit views (`/v/admin/<page>/view/…`) do not.
- **Drawer**: an open `.ant-drawer` holding a field table (`tr[data-row-key]`) + a primary "Add field"
  button in a multi-button toolbar `.ant-space`.
- **Collection name + reopen trigger**: a capture-phase click listener (also route-gated) records the
  last collections-list row (`tr[data-row-key]` = collection name) + the `<a>` clicked. The drawer's
  mask blocks background clicks while open, so this stays pinned to the right collection. Reopen =
  re-click that `<a>`.

## Traps hit while building (all fixed)

1. **`app.addProvider` providers do NOT render on `/admin/settings/*`** (the Collection Manager's
   subtree). A provider-based injector never runs there. Fix: mount our own React root at
   `document.body` via legacy `ReactDOM.render` (react-dom/client's `createRoot` subpath isn't
   externalized by the NocoBase builder — see `@ptdl/plugin-custom-icons`).
2. **`document.hidden` + `requestAnimationFrame`**: rAF is paused on hidden/backgrounded tabs, so an
   rAF/visibility-gated injector never fires there (also why automated browsers see nothing). Fix: the
   1 s interval calls `ensure()` **directly** (no rAF, no visibility guard).
3. **Filter serialization**: this lane's apiClient serializes `params.filter` as qs **bracket-notation**,
   which **drops null values** (`interface.$not: null` vanished → matched 0 plain fields). Fix: send
   `filter: JSON.stringify(...)` so it goes over verbatim as `filter=<json>` (how the core drawer sends it).
4. Field display order is driven by `fields.sort`, but the REST list **hides** `sort` and only orders
   by it when asked with the **array** form `sort[]=sort` (a plain `sort=sort` string is ignored).

## Build / deploy

- Build: `bash build-env/recipes/run-field-order-build.sh` → `storage/tar/@ptdl/plugin-field-order-<v>.tgz`
  (markers injected).
- Deploy (nb-local): extract tgz into `node_modules/@ptdl/plugin-field-order`, ensure the
  `applicationPlugins` row (`enabled=1, installed=1`), `pm2 restart index`. No collections → no table seeding.
