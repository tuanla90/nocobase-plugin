# @ptdl/plugin-global-search

Whole-app global search for NocoBase v2 — a header search box plus a **⌘ / Ctrl + K**
command palette that fans out over configured collections and jumps to the matched record.
Runs on **both** clients: classic (`/`, `/admin`) and modern (`/v/`).

- **⌘ / Ctrl + K command palette** — opens anywhere (global keydown). The robust core.
- **Header search trigger** — a pill portaled into the admin header. Classic ProLayout gets a real
  flex-item injected among the action icons; the modern `/v/` topbar gets a measured `position:fixed`
  overlay; anything else falls back to a floating top-right pill.
- **Live results** — debounced (300 ms), fan-out over the REST API, grouped by collection.
  Click a row (or ↑↓ then Enter) to open it. A **Search-in** dropdown narrows to one collection.
- **Open behaviour per collection** — jump to a mapped page / detail view, or quick-view the record
  in a **preview drawer** without leaving the page.
- **Admin settings page** — Settings → Global Search: pick collections/fields, choose how each
  collection's results open, and style the header pill.

## Architecture

```
src/
  shared/globalSearch.tsx   UI + search logic (framework-agnostic; imports NEITHER client lane)
  shared/config.ts          types · shared server config (localStorage fallback) · auto-discovery · view-link/URL helpers
  shared/Settings.tsx       admin settings screen (3 tabs)
  client/index.tsx          classic lane  (@nocobase/client)     — Plugin + settings registration
  client-v2/index.tsx       modern  lane  (@nocobase/client-v2)  — Plugin + settings registration
  server/index.ts           owns the globalSearchConfig collection (system-wide config store)
```

**Shared-lib reuse.** Pulls from `@ptdl/shared` instead of keeping per-plugin copies: the field-token
picker (`FieldPickerCascader` — lazy **nested** drill-down through to-one relations), the title-template
engine (`interpolate`, which wraps `applyFilter`/`formatDate`/`formatNumber`), and the caret helpers.

**Why `shared/` takes an injected `useApiClient`.** The two clients expose the API client
differently — classic has `useAPIClient()` from `@nocobase/client`, modern reads it off
`useApp().apiClient` in `@nocobase/client-v2`. `shared/globalSearch.tsx` imports **neither**;
each lane passes its own hook into `createGlobalSearch({ useApiClient })`. Importing
`@nocobase/client` into the shared bundle would poison the client-v2 bundle and break `/v/`
with a RequireJS script error.

| Lane | Provider registration | Settings registration |
|---|---|---|
| classic `client/index.tsx` | `app.addProvider(GlobalSearchProvider)` | `pluginSettingsManager.add('global-search', …)` |
| modern `client-v2/index.tsx` | `app.addProvider(GlobalSearchProvider)` | `addMenuItem` + `addPageTabItem` |
| `server/index.ts` | owns the `globalSearchConfig` collection + ACL | — |

Searching itself is still client-side (fan-out over the existing REST API); the server plugin's only
job is the shared-config collection. See **Known limits** for when a search endpoint becomes worthwhile.

## Search flow (UI → REST → DB)

1. `Ctrl/⌘+K` (or the header pill) toggles a Modal holding `SearchPanel`.
2. **Targets** are resolved once on open: the shared config is preloaded (`loadConfig()`), then
   explicit targets (`getManualTargets()`) win; otherwise `discoverTargets()` auto-builds them from
   `collections.list({ appends:['fields'] })`
   — picking `string`/`text` fields that have an `interface`, skipping the field denylist
   (`password`, `resetToken`, `token`, `appLang`, `jwt`), capped at 25 collections, cached for the
   session, falling back to `BASELINE_TARGETS` (just `users`) on any error.
3. The query is debounced 300 ms, then `runSearch()` **fans out in parallel** — one
   `apiClient.resource(collection).list({ filter, pageSize })` per target, where
   `filter = { $or: fields.map(f => ({ [f]: { $includes: query } })) }`. NocoBase translates
   `$includes` into a SQL `LIKE` server-side; this is the only DB touch point.
4. Results group by collection. The row title comes from `titleOf()` — a `titleTemplate`
   (`{field | filter:arg}`) wins, else `titleField` (one field or several joined with " · "),
   else `fields[0]`, else `#id`.
5. Picking a row calls `openPreview()`:
   - if `resolveViewUrl()` yields a URL (a per-collection view-link or the target's `link`) →
     `window.location.assign(url)` (full load — see limits);
   - otherwise open the **preview drawer**, which re-fetches the full record via
     `resource(collection).get({ filterByTk: id })` and renders it with `<Descriptions>`.

## Configuration

Configuration is **system-wide**: saved server-side to the `globalSearchConfig` collection (a
`name → value(json)` key/value store owned by the server plugin) so every user and browser sees the
same setup. **localStorage is a fallback** — used when the server plugin/collection isn't reachable
(older server, disabled, offline) or a key was never saved. `loadConfig()` preloads all three keys
into an in-memory cache on mount; the sync getters (`getManualTargets`/`getViewLinks`/`getAppearance`)
read that cache. Three keys, mirrored between the server rows and localStorage:

| Key (server row `name` / LS key) | Shape | Set from |
|---|---|---|
| `targets` / `ptdl-global-search-targets` | `SearchTarget[]` | Settings → *What to search* (custom mode) |
| `viewlinks` / `ptdl-global-search-viewlinks` | `Record<collection, linkTemplate>` | Settings → *When I click a result* |
| `appearance` / `ptdl-global-search-appearance` | `{ width, label, showShortcut }` | Settings → *Appearance* |

Saving requires an admin (the Settings screen is admin-only UI); reads are open to any logged-in user.
On upgrade the server config starts empty, so each admin still sees their existing localStorage
settings — click **Save** once in each tab to publish them system-wide.

`SearchTarget` (see `src/shared/config.ts`):

```ts
type SearchTarget = {
  collection: string;              // resource name, e.g. 'users'
  label?: string;                  // group heading (defaults to collection)
  fields: string[];                // text fields matched with $includes, OR-ed
  titleField?: string | string[];  // result title; several are joined with " · "
  titleTemplate?: string;          // '{{id}} - {{name}}' — wins over titleField
  descriptionField?: string;       // optional secondary line
  link?: string;                   // "open full page" target; {{field}} tokens
  limit?: number;                  // max rows per collection (default 5)
};
```

Both template kinds use **double-brace** `{{field}}` tokens (the standard shared with the other
`@ptdl` plugins and NocoBase's own `{{…}}` variables):

- **`titleTemplate`** — `{{field}}` with an optional filter pipe, rendered by `@ptdl/shared`'s
  canonical `interpolate`: `{{createdAt | date}}`, `{{price | number:2}}`, and **nested relation
  fields** picked via the cascader — `{{customer.name}}` (runSearch appends the relation so the value
  is populated). Filters: `date`, `datetime`, `time`, `number`/`num`, `round:N`, `upper`, `lower`
  (pattern args like `date:YYYY-MM-DD`; the shared date formatter also handles `MMMM/MMM/D/M/hh/A/a`).
  *Legacy single-brace `{field}` templates still render — titleOf auto-detects when no `{{` is present.*
- **`link`** / view-link templates — `{{field}}`, e.g. `/admin/orders/{{id}}`.

Console override (a **local fallback** — the server config wins over it when present):

```js
localStorage.setItem('ptdl-global-search-targets', JSON.stringify([
  { collection: 'users',  label: 'Users',  fields: ['nickname','email'], titleField: 'nickname', descriptionField: 'email', limit: 5 },
  { collection: 'orders', label: 'Orders', fields: ['code','note'],       titleTemplate: '{{code}} · {{total|number:0}}', link: '/admin/orders/{{id}}' },
]));
```

Leave the array empty (`[]`) — or use the *All collections (automatic)* toggle — to auto-discover.

### Settings screen (3 tabs)

1. **What to search** — *All collections (automatic)* or *Choose collections* (per-collection:
   fields to match — the *Search in* ＋ picker drills into relations to add nested fields like
   `customer.name` — title as fields or a template, and max results).
2. **When I click a result** — per collection: *Preview drawer* (default), *Detail view*
   (paste a record's browser URL; its id is templatized to `{{id}}`), or *Open page* (pick a page;
   id appended as `?filterByTk=`).
3. **Appearance** — quick presets (**Icon only** / Icon + text / Full), **position** (center /
   right), width, **corner radius**, **background & text colour** (`@ptdl/shared`'s `ColorField`; the
   text colour also tints the border), label text (empty = icon only, rendered as a **circle**
   button), and shortcut hint. Controls sit in a responsive two-column grid; per-field detail is on a
   hover tooltip (ⓘ). Center floats the pill over the header as a fixed overlay; right (default) docks
   it among the header actions (no overlap). *(Left was dropped — the header's left region holds a
   variable-width menu a fixed overlay can't reliably dodge.)*

## Header trigger placement

`useHeaderMount()` re-resolves where to render the pill on a light interval + DOM mutations:

- **Classic ProLayout** — inject a flex-item host into `.ant-pro-global-header-header-actions`
  (the *app* top bar only — page-level tab bars reuse that class lower down and are skipped).
- **Modern `/v/`** — its topbar is flow-rendered and drops foreign children, so overlay a
  fixed pill measured just left of `.nb-topbar-actions-list`.
- **Neither found** — a floating fixed pill at the top-right. ⌘/Ctrl+K still works regardless.

The pill hides itself while any antd Modal/Drawer mask is open. Override the target container with
`window.__PTDL_SEARCH_HEADER_SELECTOR__ = '<css selector>'`.

## Build (in the `@nocobase/build` session)

1. Copy this folder into `build-env/packages/plugins/@ptdl/plugin-global-search`.
2. `nocobase-build --tar` builds all three lanes: `client`, `client-v2`, `server`.
3. After `--tar`, extract the `.tgz` and **re-add the root stubs if stripped** —
   `client.js`, `client-v2.js`, `server.js` (each a one-line `require('./dist/<lane>/index.js')`)
   plus the matching `.d.ts`. The `client-v2.js` marker is required, otherwise the modern client's
   `pm:listEnabledV2` skips the plugin and nothing renders on `/v/`.
4. Deliverable `.tgz` → `latest/@ptdl/` (see `build-env/recipes/run-globalsearch-build.sh`).

## Install on nb-local (dev host, port 13000)

Copy the built package into BOTH `nb-local/node_modules/@ptdl/plugin-global-search` and
`nb-local/storage/plugins/@ptdl/plugin-global-search`, then:

```
cd <nb-local> && yarn nocobase pm add @ptdl/plugin-global-search && yarn nocobase pm enable @ptdl/plugin-global-search
```

Hard-refresh the browser. **A change to the server lane** (e.g. the `globalSearchConfig` collection)
needs a **NocoBase restart**, not just a hard refresh, to create the table + register the resource —
on nb-local it runs under PM2: `node node_modules/pm2/bin/pm2 restart index`.

## Test

- Press **Ctrl/⌘+K** → palette opens. Type → grouped live results (works even before the header
  pill is placed).
- Confirm the **header pill** on both `/admin` and `/v/`. If missing/misplaced, find the real
  container in devtools and set `window.__PTDL_SEARCH_HEADER_SELECTOR__ = '<selector>'`.
- Click a result: a mapped collection navigates; an unmapped one opens the preview drawer.

## Known limits / to verify

- **The `center` position is a fixed overlay** measured against the header bar — on some layouts it
  can overlap a centered page title. `right` (default) docks among the actions and never overlaps;
  override the measured bar with `window.__PTDL_SEARCH_HEADER_SELECTOR__`. (A `left` position was
  tried and dropped: the header's left region holds a variable-width menu an overlay can't dodge.)
- **Config write is open to any logged-in user at the API level.** The Settings UI is admin-only, but
  `globalSearchConfig:create/update` is ACL-allowed for `loggedIn` (mirrors `custom-icons`). Low-stakes
  — search results still pass each collection's own ACL, so a tampered target list can't leak data.
- **Client-side fan-out** — N parallel REST requests per search (up to 25 collections). Fine for now;
  an aggregated server `globalSearch:query` action is the fix when target count hurts.
- **Text fields (incl. nested), plus id.** `$includes` matches `string`/`text` fields — including
  **nested relation fields** you add via the *Search in* ＋ picker (`{customer.name}`; NocoBase
  auto-joins the association). A purely numeric query also tries an `id` equality (so "123" finds
  record #123, falling back to text-only if the PK isn't a plain integer). Not searchable: numbers,
  dates. Nested search adds a JOIN per related field — fine for typical data, heavier on very large tables.
- **Navigation uses `window.location.assign`** (full reload) for v1 robustness; upgrade to SPA
  navigation once the provider is confirmed to mount inside the router context.
- **`fetchPages()` reads `desktopRoutes`** (a `/v/` resource) — the *Open page* mapping may be empty
  on the classic client.
- **Admin Settings screen is English-only.** The end-user palette/drawer is localized (vi/en by
  browser language, overridable with `window.__PTDL_SEARCH_LANG__`); the Settings screen is not.

## Follow-ups

Aggregated server-side `globalSearch:query` endpoint · recent / favourites · fuzzy ranking across
groups · number / date field search · full i18n for the admin Settings screen · SPA navigation.
