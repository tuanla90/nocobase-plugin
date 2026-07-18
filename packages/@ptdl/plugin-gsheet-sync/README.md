# Google Sheets Sync — User Guide

> Pull data from **a single Google Sheet tab** into a **real NocoBase collection** — run it
> manually or automatically on a schedule. Auto-create the collection and **infer data types**,
> or map columns onto an existing collection; **replace-all** or **upsert-by-key** modes;
> optional **two-way write-back** to the sheet.

**Group:** Data model tools · **Runs on:** /admin (classic) + /v/ (modern) · **Version:** 0.1.1

## What's new after installing?

- **A new Settings page: “Google Sheets Sync”** (cloud-sync icon). This is the one and only place you work — split into two tabs: **“Connections”** and **“Service Account”**.
- **No new menu, button or field** is added to your data pages/blocks.
- When you run the first sync, a **real data collection** appears in **Data sources** (immediately usable in blocks/relations like any other table).
- ⚠️ **Enabling the plugin syncs nothing yet.** You must register a **Service Account** + a **Connection** before data starts flowing.

## Where to configure

| Client | Path to the config page |
|---|---|
| **Modern (`/v/`)** | ⚙ **Settings** → **“Google Sheets Sync”** → **“Connections”** tab |
| **Classic (`/admin`)** | **Settings** → **“Google Sheets Sync”** (path `/admin/settings/gsheet-sync`) |

Both clients open the **same config page** and share one set of data. The page has two buttons in the top-right corner: **“↻ Reload”** and **“Manage collections”** (opens the collection list in Data sources directly).

## How to use (step by step)

> ✅ **Do this once, first:** register a **Service Account**, then **Share** the Google Sheet with its email. Without this step every connection fails with a “can't access the sheet” error.

### Prep step — Create a Service Account & share the sheet

1. Go to **Google Cloud Console → IAM → Service Accounts** → create a service account → **Keys** tab → add a **JSON key** (download the file).
2. In NocoBase open the **“Google Sheets Sync”** page → **“Service Account”** tab → click **“Add Service Account”**.
3. Set a **“Nickname”** (e.g. *Accounting SA*) and paste the **entire** JSON file content into the **“Service Account JSON”** box → **“Save”**.
4. After saving, the **“Service account email”** column shows an address like `…@…iam.gserviceaccount.com`. **Copy** it.
5. Open the Google Sheet you want to sync → **Share** it with the copied email: **Viewer** access is enough to pull; **Editor** is needed for **two-way write-back**.

> 💡 One Service Account is **reusable across many connections** — register it once. The **“In use”** column shows how many connections use it (a Service Account that's in use can't be deleted).

### Scenario A — Pull a tab into a NEW collection (auto-created)

1. Go to the **“Connections”** tab → click **“＋ Add connection”**.
2. **“Connection name”**: give it a memorable name (e.g. *Order list*).
3. **“Service Account”**: pick the account saved in the prep step.
4. **“Spreadsheet ID or URL”**: pasting the **full** Google Sheet URL works too (the system extracts the ID) → click **“Test connection”**. If OK it shows the spreadsheet title + tab count.
5. **“Sheet (tab)”**: pick the tab to read (the list loads after Test connection).
6. *(Optional)* **“Data range (optional)”**: empty = whole sheet; or type `A1:F` — **the first row of the range is the header row**.
7. **“Target collection”**: choose **“Create new collection”** and name the table (e.g. `gs_orders`).
8. Click **“👁 Preview & set up column mapping”** to see the **auto-inferred types** and **sample data**. Untick columns you don't need, and edit the field name / **“Stored type”** if you want.
9. Set **“Auto sync (minutes)”** (`0` = manual only; `15` = every 15 minutes), keep **“Enable connection”** on → **“Save”**.
10. Click **“Sync now”** (on the connection row or inside the edit dialog). ✅ The collection is **auto-created** with data; it reports *“Sync complete: N rows”*.

> 💡 A **Date** column on the sheet is recognized correctly as a date (not Google's serial number) — the type is inferred from the cell format, independent of locale.

### Scenario B — Load into an EXISTING collection (map columns)

1. In **“Target collection”** choose **“Existing collection”** → pick a collection from the list.
2. Click **“👁 Preview & set up column mapping”**. Columns whose name matches a field **auto-match**; only **ticked** columns sync.
3. For each column, pick the matching **“Target field”** (the type **follows the target field**, so there's no “Stored type” to choose).
4. Choose the sync mode → **“Save”** → **“Sync now”**.

> ⚠️ On an existing collection, **replace** mode **only deletes rows created by this plugin** (rows you entered by hand are kept).

### Scenario C — Keep record IDs stable (Upsert by key column)

1. In **“Sync mode”** choose **“Upsert by key column”**.
2. Pick the **“Key column”** — a column with a **unique value** per row (e.g. *Order ID*). *(Click Preview to load the column list.)*
3. *(Optional)* tick **“Delete records no longer on the sheet”** to clean up rows removed from the sheet.
4. **“Save”**. ✅ Each sync **updates or inserts** by the key column, **keeping record IDs stable** — safe for relations / comments attached to a record.

### Scenario D — Two-way write-back (NocoBase → Sheet)

1. You must be on **Upsert + a key column selected** (required), and the sheet must be **Shared with Editor** access to the service account.
2. Turn on the **“Push changes from NocoBase to the sheet”** switch.
3. Choose how to handle **“When deleting a record:”** — **“Leave the sheet alone”**, **“Clear the row (keep the row)”**, or **“Delete the row from the sheet”**.
4. **“Save”**. From now on, **editing / adding / deleting** a record in NocoBase is **pushed to the sheet after ~3 seconds** (batched into one lot). To re-push everything now: click **“⇪ Push everything to the sheet”**.

## Tips & notes

- **Replace or Upsert?**

  | Mode | How it runs | Record IDs | Use when |
  |---|---|---|---|
  | **Replace all (replace)** *(default)* | Wipes and reloads everything each sync | **Change every run** → relations/comments attached to records break | Lookup tables with no relations; need speed |
  | **Upsert by key column** | Matches on the key column, update-or-insert per row | **Stay stable** | Need stable IDs, have relations, or want two-way on |

- **Inferable data types** (when creating a new collection) — editable in the **“Stored type”** column of the mapping table: **Text (string)**, **Long text (text)**, **Integer**, **Decimal**, **Boolean**, **Date**.
- ⚠️ **Re-sync doesn't change existing field types** — each sync only **adds** missing fields, it never alters an existing field's type. To change a type/format: click the **collection-name chip** (blue, with a ⚙ icon) in the **“Target collection”** column to open the field config directly, edit it, then sync again.
- **Write-back is last-write-wins** — no conflict detection yet. Avoid editing the same row simultaneously in both places.
- **A Service Account can't create a new spreadsheet** (Google 2025 policy) — the Google Sheet must **already exist** and be **Shared** with the service account.
- **Auto schedule:** the system scans every minute; set/change **“Auto sync (minutes)”** then **“Save”** and it takes effect — **no server restart needed**. Set `0` for manual only.
- **Legacy credentials (per-connection):** an old connection may still use credentials pasted inline (labelled **“own credentials (legacy)”**). It still works, but switching to a shared **Service Account** is tidier.
- Runs on **both** clients: classic `/admin` and modern `/v/`.

## Remove / disable

- **Pause a connection:** open the connection, **turn off “Enable connection”** (or set **“Auto sync (minutes)”** = `0`, or turn off two-way) → **“Save”**. The config is kept; re-enable anytime.
- **Delete a connection:** click **“Delete”** — this removes only the config. **The data collection and its synced rows stay**, and the Google Sheet is untouched; from then on the two sides are independent.
- **Remove the plugin entirely:** disable it in **Plugin Manager** — syncing stops at once. The collections already created and their data **stay** in the database.

---

### For developers

The Google client has **no external dependencies** — an RS256 JWT is signed with node's `crypto` and tokens/data are fetched straight from the Sheets REST API via global `fetch` (no `googleapis`); the scope is full `auth/spreadsheets`, so write-back needs no re-consent. **Type inference** reads values `UNFORMATTED` and decides date-vs-number from the cell's effective `numberFormat.type` (authoritative from the Sheets API), so dates are detected regardless of locale, with a formatted-string heuristic as fallback.

Config lives in two hidden collections: `ptdl_gsheet_connections` (one row per connection — source, target, mode, schedule, status, `accountId`, legacy inline `credentials`, `twoWay`, `pushDeletes`…) and `ptdl_gsheet_accounts` (reusable service accounts, write-only `credentials`). Credential resolution: the account wins, inline credentials are the fallback. The **target collection** is created via the collections repository (same path as the collection-manager UI, so it appears in Data sources) plus a hidden `_sheet_row` bigint field for row identity.

Server resource: `ptdlGsheet` (ACL snippet `pm.gsheet-sync`), with actions `listConnections`, `saveConnection`, `deleteConnection`, `testConnection`, `preview`, `syncNow`, `pushNow`, `listAccounts`, `saveAccount`, `deleteAccount`. The scheduler runs every 60 seconds. Write-back (`WritebackManager`) binds per two-way connection, queues + debounces changes, and flushes them as one `values:batchUpdate` (+ append / deleteDimension) — formula-injection guarded and loop-safe; row identity on the sheet is the **key column**, with `_sheet_row` as a hint. The whole settings UI is `src/shared/ConnectionManager.tsx` (antd only), shared by both client lanes with the api client injected per lane. Build via `bash build-env/recipes/run-gsheet-sync-build.sh`.
