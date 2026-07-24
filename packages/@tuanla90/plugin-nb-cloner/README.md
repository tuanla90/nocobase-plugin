# NB Cloner (App export / import) — User Guide

> Clone a whole self-built NocoBase app — its collections, UI, menus, roles and hand-picked data —
> from one install to another as a single **`.nbc.gz`** file. Import **never deletes** what's already
> there; when a same-name table/column exists **you choose**: append only (keep existing) or overwrite
> with the file.

**Group:** Admin / Migration · **Runs on:** /admin (classic) + /v/ (modern) · **Database:** PostgreSQL only · **Version:** 1.12.0

## What's new after installing?

- **A new Settings page: “NB Cloner”** (copy icon) with three tabs: **Export**, **Import** and **Clean up**.
- **No new menu, button or field** is added to your data pages/blocks.
- Nothing runs automatically — you drive every export and import from that page.

## Where to configure

| Client | Path to the page |
|---|---|
| **Modern (`/v/`)** | ⚙ **Settings** → **“NB Cloner”** |
| **Classic (`/admin`)** | **Settings** → **“NB Cloner”** (path `/admin/settings/ptdl-nb-cloner`) |

Both clients open the **same page** and hit the same server endpoints.

## What gets cloned

| Area | Included | Notes |
|---|---|---|
| **Collections + Fields** | ✅ | Business collections' schema (system collections are never modified on import). |
| **Collection categories** | ✅ | The table groups shown in the collection manager. |
| **UI** | optional | uiSchemas, flow-engine models (the `/v/` page/block content), block templates. |
| **Menus / routes** | ✅ (with UI) | desktop + mobile routes and their closure/path tables — without these the target has no menu. |
| **Roles & permissions** | optional | Custom roles only (`root`/`admin`/`member` are skipped to avoid clobbering the target's defaults). |
| **Workflows** | optional | Definitions + nodes only — **not** executions/jobs. |
| **Business data** | per-collection | Off by default; turn on **“Copy Data”** for each collection you want rows from. |
| **File attachments / uploads** | ❌ | Binary files are **not** cloned — only the DB rows. |

## How to use (step by step)

### Export (source app)

1. Open **Settings → “NB Cloner” → Export**.
   - **Quick goal presets** (fastest): click **📦 Backup** (your whole app + all data), **🧬 Clone** (structure + UI, no data — a blank copy), or **↺ Default** (reset). A preset sets the toggles + selects your collections in one click; you can still fine-tune afterward. The steps below are the manual equivalent.
2. Set an **App name** (used in the download filename).
3. Toggle the **System** options you want: *Collections Schema*, *UI / Menus*, *Roles & Permissions*, *Workflows*.
4. In **Collections**, use the category filter to focus on what you want. Every collection is classified:
   - **My collections** — the tables you created (real business data). *This is the default view, and only these are pre-selected.*
   - **Plugin** — tables a plugin defined for its own config/data.
   - **System** — NocoBase framework tables (fields, uiSchemas, roles…).
   - **Deleted** — a managed collection whose physical table is gone (an orphan).

   Tick the collections to include and flip **“Copy Data”** on the ones whose rows you also want (use **All / None**). This is why a “fresh” app can list 100+ collections — most are plugin/system tables; the filter hides them so you export just yours.
5. Click **“Export → Download .nbc.gz”**. Your browser downloads `nb-clone-<app>-<date>.nbc.gz`.

### Import (target app)

> ⚠️ **The target must be the SAME NocoBase version as the source.** The flow-engine changes its stored
> format between versions, so a cross-version import produces a broken UI.

1. Open **Settings → “NB Cloner” → Import** on the **target** app.
2. Read the warnings, then drag the `.nbc.gz` into the upload box.
3. Wait for the step report — **do not close or reload the page** while it runs (a large app can take 1–2 minutes).
4. When it finishes, **Restart the app** so the new tables and UI load fully.

The result table lists every step (`schema.collections`, `db.sync`, `ui.schemas`, `data.<collection>`, …) with an `ok` / `skipped` / `error` status and a row count.

> Updating the plugin itself is done the normal way — Plugin Manager → **Add & Update** → upload the newer
> `.tgz`, then restart.

### Import preview (dry-run) + conflict strategy

When you drop a bundle, NB Cloner first shows a **preview** — nothing is written yet. It reports, per
collection: whether it already **exists** on this app, how many **new columns** will be added, and how
many columns have the **same name** as an existing one. Right there you pick what happens to the
same-name ones (1.12.0):

- **♻️ Overwrite with the file** (default — the historical behaviour): the file wins. Same-name
  collections and columns are updated to match the bundle — *including* columns whose internal `key`
  differs (the importer remaps the bundle key onto the target key, so nothing referencing the existing
  column breaks). Imported data rows that share a primary key with an existing row replace it.
- **➕ Append only (keep existing)**: this app wins. Same-name collections/columns — and data rows with
  the same primary key — are left exactly as they are; only new tables, new columns and new rows are
  inserted. Ideal for pulling additions into a **live** app without touching anything already configured.

Neither mode deletes anything. The strategy covers schema (collections + fields + category assignment)
and business-data rows; UI pages, roles and workflows are whole objects keyed by uid/name and always
upsert — untick their part checkbox if you don't want them written.

### Clean up (delete junk collections)

The **Clean up** tab lists **only your own collections** (system & plugin tables are never deletable) with
their row counts. Tick the junk ones and **Delete selected** — a confirmation lists exactly what will go
and its total rows, and you must type **DELETE**. This drops each table, all its rows, and any relations
pointing to it (via NocoBase's own delete path), then recommends a restart. **It cannot be undone.**

## Requirements & limits

- **PostgreSQL only.** Export/import use PostgreSQL-specific SQL (`ON CONFLICT` upsert, `information_schema`
  primary-key discovery). On any other dialect the plugin **fails fast with a clear message** rather than
  corrupting the target.
- **Same NocoBase version** on both ends (see the import warning above).
- **Import never deletes** — it updates/inserts only. Same-name conflicts follow the strategy you pick
  in the preview (append vs overwrite). For a pixel-perfect clone, import into a **blank, freshly
  installed** app.
- **Large bundles:** the flow-engine content can exceed NocoBase's default 10 MB request limit. If import
  fails on a big app, set the env var **`REQUEST_BODY_LIMIT=50mb`** (or higher) and restart.
- **Attachments are not cloned** — copy your storage separately if you need the files.
- A **restart is required** after import for tables + UI to appear.

## Security

The export / import endpoints are powerful: export reads **every** business table and import writes the
target's schema/UI/roles. They are granted to `loggedIn` — the same pattern the other @tuanla90 settings
plugins use — and are reached only through the admin-gated **Settings** surface. **If untrusted users can
sign in to your app, restrict access with NocoBase roles** (or don't enable this plugin there).

## The `.nbc.gz` format

A `.nbc.gz` file is a single JSON bundle (manifest + schema + ui + acl + workflows + businessData) compressed
with gzip. The manifest carries a bundle-format version; the importer refuses a bundle whose major version is
older than it understands and tells you to re-export.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| “NB Cloner supports PostgreSQL only …” | The app isn't on PostgreSQL. This tool is PostgreSQL-only by design. |
| Import fails on a large app | Raise `REQUEST_BODY_LIMIT` (e.g. `50mb`) and restart, then retry. |
| Target menu / pages are empty after import | Make sure **UI / Menus** was enabled on export, and **Restart** the target after import. |
| Some `data.<collection>` steps show `error` | Those rows were skipped (often FK order or a column mismatch); the rest of the import still applied. Re-run after a restart if needed. |
| Version tag shows an orange “code v… · restart to sync” | The running code differs from the DB-recorded version — restart the app. |
