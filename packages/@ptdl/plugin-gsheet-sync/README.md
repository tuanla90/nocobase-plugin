# @ptdl/plugin-gsheet-sync

Sync a Google Sheet tab into a **real NocoBase collection** — one-way pull, optional
two-way write-back, on a schedule or on demand. Works on both the classic `/admin` and the
Modern `/v/` app.

- **Pull (Sheet → NocoBase)** — each connection pulls one sheet tab into a collection.
  Create the collection automatically (columns + inferred types) **or** map columns into an
  existing collection.
- **Type inference** — values are read `UNFORMATTED` (numbers stay numbers, dates are
  day-serials). Date-vs-number is decided by the cell's **effective `numberFormat.type`**
  from the Sheets API (authoritative), so date columns are detected regardless of locale
  formatting. Falls back to a formatted-string heuristic if the format grid can't be read.
- **Two-way (NocoBase → Sheet)** — for `upsert` connections with a key column, edits/creates/
  deletes in NocoBase are pushed back to the sheet (debounced batch, formula-injection guarded,
  loop-safe). Row identity on the sheet is the **key column**; `_sheet_row` is a hint.
- **Reusable Service Accounts** — register a Google service-account key once and reuse it
  across many connections (own tab in the settings page). Legacy per-connection inline
  credentials still work as a fallback.
- **Scheduling** — per-connection interval (minutes); `0` = manual only.

## Setup

1. **Google Cloud** → IAM → Service Accounts → create one → **Keys** → add a JSON key.
2. In NocoBase: **Settings → Google Sheets Sync → Service Account tab → ＋ Thêm Service Account**,
   paste the JSON, give it a name.
3. **Share** the Google Sheet with the service account's `client_email` — **Viewer** is enough
   for pull; **Editor** is required for two-way write-back.
4. **Kết nối tab → ＋ Thêm connection**: pick the service account, paste the sheet URL/ID,
   **Kiểm tra kết nối** to load tabs, choose the tab, then the target collection (new or existing).
   Use **Xem trước** to review inferred types / set up column mapping, then **Lưu** and
   **Đồng bộ ngay**.

## Sync modes

- **Replace** (default) — wipe + bulk insert every sync. Fast, but **record IDs change each
  run** (relations/comments attached to synced records break). On an *existing* collection only
  rows this plugin created (`_sheet_row` set) are wiped — your own rows stay.
- **Upsert (by key column)** — match on a key column, update-or-insert per row, keeping record
  IDs stable. Required to enable two-way. Optional "delete rows no longer on the sheet".

## Data model (server, all hidden)

- `ptdl_gsheet_connections` — one row per connection (source, target, mode, schedule, status,
  `accountId` → service account, legacy inline `credentials` fallback, `twoWay`, `pushDeletes`…).
- `ptdl_gsheet_accounts` — reusable service accounts (`title`, write-only `credentials`).
- The **target collection** is created via the collections repository (same path as the
  collection-manager UI) so it appears in Data sources; a helper `_sheet_row` bigint field is
  added for row identity.

Resource: `ptdlGsheet` (ACL snippet `pm.gsheet-sync`). Actions: `listConnections`,
`saveConnection`, `deleteConnection`, `testConnection`, `preview`, `syncNow`, `pushNow`,
`listAccounts`, `saveAccount`, `deleteAccount`.

## Architecture

- **`src/server/google.ts`** — zero-dep Google client: RS256 JWT signed with node `crypto`,
  token exchange + Sheets REST via global `fetch` (no `googleapis`). Scope: full
  `auth/spreadsheets` (so write-back needs no re-consent).
- **`src/server/sync.ts`** — header→field slugify, type inference, value coercion, snapshot
  fetch, mapping resolution.
- **`src/server/writeback.ts`** — `WritebackManager`: binds per two-way connection, queues +
  debounces changes, flushes as one `values:batchUpdate` (+ append / deleteDimension).
- **`src/server/plugin.ts`** — collections, resource actions, credential resolution
  (`resolveConnCredentials`: account wins, inline is fallback), scheduler.
- **`src/shared/ConnectionManager.tsx`** — the whole settings UI (antd only), shared by both
  client lanes; the api client is injected per lane. Also carries the "open a collection's
  field-config" deep-link helper.
- Lanes: `src/client` (classic) and `src/client-v2` (`/v/`). The classic lane also consumes a
  `sessionStorage` flag on boot to open a collection's field-config after a cross-app jump.

## Build

```
bash build-env/recipes/run-gsheet-sync-build.sh
```

Zero real deps (server = node crypto + fetch; client = antd + `@ant-design/icons`, both external).
Output: `build-env/storage/tar/@ptdl/plugin-gsheet-sync-0.1.0.tgz`. Packaged copies live in
`latest/@ptdl/` and `archive/@ptdl/`.

## Install on nb-local (dev host, port 13000)

Extract the tgz into **both** `nb-local/node_modules/@ptdl/plugin-gsheet-sync` and
`nb-local/storage/plugins/@ptdl/plugin-gsheet-sync` (use `tar --force-local` because the path
has a `D:` drive letter), copy the root marker files (`server.js`, `*.d.ts` — the tgz ships
`client.js`/`client-v2.js` but not `server.js`), set the DB row `enabled=1`, then restart:

```
node nb-local/node_modules/pm2/bin/pm2 restart index --update-env
```

Hard-refresh the browser.

## Known behaviour / limits (not bugs)

- **Field types aren't altered on re-sync** — `ensureTargetCollection` only *adds* missing
  fields. To change a field's type, edit it in Data sources (the settings list links straight to
  it) or drop the field/collection and re-sync.
- **Replace mode reassigns record IDs** each run — use *upsert* if you need stable IDs or plan to
  attach relations.
- **Two-way is last-write-wins** — no conflict detection / diff-before-write yet.
- **Service accounts can't create spreadsheets** (Google 2025 policy drops SA Drive quota) — the
  sheet must already exist and be shared with the SA.

## Disconnecting

Turning off **Bật connection** (or interval `0`, or two-way) stops auto-sync but keeps the config.
**Deleting** a connection removes only its config — the synced collection and its rows stay, and
so does the sheet. The two copies become independent.
