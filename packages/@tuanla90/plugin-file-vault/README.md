# File Vault — User Guide

> A central manager for **every uploaded file**. NocoBase keeps all uploads in one core `attachments`
> collection but gives you no place to see them — File Vault does: **browse, preview, rename and delete**
> files, see **which records use each file**, find and **bulk-clean orphaned files**, and **download a
> ZIP backup**. It reads the existing attachments — **no new table, no new data**.

**Group:** Admin & tools · **Runs on:** /v/ (modern) · **Version:** 0.1.2

## What's new after installing?

- **A new Settings page: “File Vault”** (folder icon). This is the one and only place you work.
- **No new collection or table** — it manages the built-in `attachments` collection that the core File Manager already fills on every upload.
- **No new menu, button or field** is added to your data pages or blocks.
- ⚠️ **Mutations (rename / delete / clean orphans / … ) are admin-only.** Browsing and stats are available to any signed-in user who can reach the page.

## Where to find it

| Client | Path |
|---|---|
| **Modern (`/v/`)** | ⚙ **Settings** → **“File Vault”** (Vietnamese label: **“Quản lý tệp”**) |

> File Vault is a **modern-client (`/v/`) feature**; on the classic `/admin` client it loads as a deliberate no-op (there is nothing to configure there).

## What you can do

- **Browse** every file as a **gallery** (image thumbnails; a Lucide type icon for non-images) or a **table** — with human-readable size, type, storage, uploader and date. Paginated.
- **Search** by title / filename, and **filter** by:
  - **Type** — image, video, audio, PDF, document, spreadsheet, archive, other.
  - **Storage** — which storage the file lives in.
  - **Date range** — when it was uploaded.
  - **Used in collection** (+ an optional **Record ID**) — show only files referenced by a record in that collection, or by one specific record. This runs **on the server**, so it spans **all** files, not just the current page.
- **Header stats** — total files, total size, a per-type breakdown, and **orphan count + reclaimable size**, split into clean stat tiles.
- **Usage** — each file shows a **“used in N places”** badge; click it to see **which collection + field + record** references it (with the record’s label and id). A file nothing references is flagged **Orphan**.
- **Manage** — **Preview** (image lightbox / open in a tab), **Rename** the display title, **Download** one file, and **Delete** with a **usage-aware warning** (deleting a referenced file is called out strongly).
- **Bulk** — select many files, then **bulk-delete** or **Download ZIP**.
- **Clean orphans** — one action deletes every file no record references, reclaiming disk space (a confirm shows the count + size first).
- **Backup** — **Download ZIP** of the selected files, or **Backup all (ZIP)** from the header for a full backup. Each zip includes a `_manifest.txt` listing what was included / skipped.

## How to use (step by step)

### See what a file is used by

1. Open **Settings → “File Vault”**.
2. On any file, the **Usage** badge reads **“used in N places”** (or **Orphan**). Click **“used in N places”**.
3. The popup lists each **collection · field** and the referencing **records** (label + `#id`).

### Find every file used by one record

1. In the filter bar pick a collection in **“Used in collection”**.
2. *(Optional)* type a **Record ID** to narrow to a single record.
3. The list now shows only the files that record references — across all pages, not just this one.

### Delete safely / clean up

- **One file:** click the **trash** icon → confirm. If the file is in use, the dialog **warns** that deleting it will break those records.
- **Many:** tick files → **“Delete selected”**.
- **All orphans:** in the header click **“Clean orphan files (N)”** → confirm. Only files nothing references are removed.
- Deleting a file removes both the **database row** and the **physical file** on disk (for local storage, and the other storages the core File Manager handles).

### Back up files

1. Tick the files you want → **“Download ZIP”** (or **“Backup all (ZIP)”** in the header for everything).
2. A `.zip` downloads with each file named by its display title; duplicate names get a ` (2)` suffix; a `_manifest.txt` lists included / skipped files.

## Tips & notes

- ⚠️ **Orphan = not referenced by any attachment / relation field.** File Vault detects **relational** references only. A file referenced solely by a **URL embedded in a rich-text or JSON field** is *not* detected and would read as an orphan — review before **Clean orphans**.
- **Deletes are permanent** — the physical file is removed. Use **Download ZIP** first if you want a backup.
- **Admin-gated:** rename, delete, bulk-delete and clean-orphans require an admin role; and if the usage scan can’t fully verify references, **Clean orphans aborts for safety** rather than risk deleting a referenced file.
- **Nothing to configure** — the plugin needs no setup; it reads the storages the File Manager already defines.

## Remove / disable

- **Disable it in Plugin Manager** — the “File Vault” page disappears; your files, the `attachments` collection and every storage are **untouched** (File Vault only ever read and managed them).

---

### For developers

File Vault adds **no collection**. The `/v/` Settings page (`ptdl-file-vault`) talks to a custom server resource **`fileVault`** with actions `browse`, `stats`, `usage`, `rename`, `purge`, `cleanOrphans`, `downloadZip` — never the native `attachments:list` (core disables it) nor `attachments:update` / `:destroy` (core scopes those to the uploader), so it drives the attachments **repository** directly, admin-gated in-handler.

The **usage scan** enumerates `db.collections` at runtime and, for every association whose target is `attachments` (belongsToMany through a junction, or belongsTo — e.g. the code-defined `systemSettings.logo`), counts referencing rows with **one grouped query per relation** (no N+1); an attachment referenced by none is an orphan. **Physical deletion** is automatic — destroying an `attachments` row fires the File Manager’s `afterDestroy` hook, which removes the file from storage. **Bulk ZIP** reads each file (via the File Manager’s own `getFileStream` looked up at runtime, a local-disk fallback, or a remote-URL fetch), zips in-memory with **jszip** (bundled into the server lane), and returns the raw `application/zip` Buffer un-wrapped. Everything is crash-safe: a failed usage scan or an unreadable file never breaks the page or the zip. Build via `bash build-env/recipes/run-file-vault-build.sh`.
