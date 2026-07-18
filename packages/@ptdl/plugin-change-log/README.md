# Change Log — User Guide

> Automatically record the **change history** of the fields you choose (perfect for **status fields**):
> who changed it · when · which role · from which value to which value · through which path · how long it sat in the old value · with an optional reason.
> Review it as a **timeline** right on the record — **no code, no restart**.

**Group:** Auditing · **Runs on:** /admin (classic) + /v/ (modern) · **Version:** 0.1.3

## What's new after installing?

- **A new Settings page: “Change Log”** (history-clock icon) → the **“Tracked collections”** tab. This is where you choose **which collections and which fields** to track.
- **A new record button: “Change history”** — added to the action bar of a table/form; click it to open that record's timeline (as a full **Drawer** or a compact **Popover**).
- **A new block: “Change history”** — drop it onto a **record detail page** to show the timeline inline.
- ⚠️ **Nothing is logged until you declare it.** Enabling the plugin **logs nothing** — the log only starts after you **add a collection and pick its trigger fields** on the config page.

## Where to configure

| Client | Path to the config page |
|---|---|
| **Modern (`/v/`)** | ⚙ **Settings** → **“Change Log”** → the **“Tracked collections”** tab |
| **Classic (`/admin`)** | **Settings** → **“Change Log”** (path `/admin/settings/ptdl-change-log`) |

Both clients open the **same config page** and share one set of tracking rules.

## How to use (step by step)

### Scenario A — Turn on change logging for a field (usually status)

1. Open the **“Change Log”** page → click **“Add collection”**.
2. In the **Collection** field, pick the collection to track. The plugin **pre-fills for you**: **Trigger fields** = the collection's status fields, **Snapshot fields** = `updatedBy`/`updatedAt` (if present).
3. Adjust **“Trigger fields”** — every time **one of these fields changes value**, one history entry is written (status fields are sorted to the top of the list).
4. (Optional) also pick **“Snapshot fields”** — these fields are **captured at their exact value at the moment of the change** to show alongside the history.
5. (Optional) turn on **“Capture an optional note/reason with each change”**, and set **“Retention (days)”** to auto-delete old entries.
6. Click **“Save”**. ✅ From now on, every time those fields change value it is recorded **automatically**.

> 💡 Each collection has **one** config only. To pause without deleting, toggle the **“Enabled”** column off on that row.

### Scenario B — View history via the “Change history” button

1. Open a view that has records (a table or a detail page) → turn on **UI Editor**.
2. Go to the block's **action configuration** → add the **“Change history”** action (the button shows **“History”** by default).
3. Open the button's ⚙ → **“Change history settings”**:
   - **“Display as”**: **“Drawer (full)”** (a wide slide-out with room for notes + snapshot fields) or **“Popover (compact)”** (quick and small).
   - **“Show count badge”**: puts the number of changes on the button.
4. Click the button on a record → see the full **timeline**.

### Scenario C — Embed the timeline into a detail page (block)

1. Open a record's **detail page / pop-up** → turn on **UI Editor** → add a block.
2. Choose the **“Change history”** block.
3. (Optional) in the block's ⚙ → **“Background”** → pick a **“Background color”**; the title/description come from the existing **Card settings**.

> ℹ️ If you place the block/button where there's **no record** in context, it just shows the hint *“Add this block to a record page to see its history.”* instead of an error.

### What's in the timeline?

- **At the top**: the **current** value (with its color/icon), **“Lead time”**, **“Changes”**, and a bar showing **how long it spent in each value**.
- **Each entry**: new value ← old value, **who changed it** (avatar), **role**, **change source** (chip), time spent **in the previous value**, **reason** (if any), and the **snapshot fields**.

## Tips & notes

- **Automatic server-side logging, for every write path**: saving a **form**, a **quick** change, a **bulk** edit (row by row), and even direct **API/workflow** calls — all go into the log. Logging is *best-effort*: if writing a log entry fails, it **never blocks** your actual business operation.
- **The change source is detected automatically** and shown as a chip in the history:

  | Chip | Meaning |
  |---|---|
  | **Created** | The record was just created with that value |
  | **Form** | Saved via a form in the UI |
  | **Action** / **Quick** | Changed via an action button / a quick status change |
  | **Bulk** | Editing many records at once |
  | **API** / **Workflow** / **System** | Direct API call / workflow / background process |

- 🎨 **A value's color and icon are “snapshotted” at the moment of the change.** If you later edit the status list / change a color / change an icon, **old history still displays correctly** — exactly as it was when it happened.
- ⏱ **“Snapshot fields” are frozen** at their exact value at the moment of the change; the **time spent in the previous value** (cycle time) is computed automatically.
- 📝 To record a **reason** for each change, turn on **“Capture an optional note/reason with each change”** in that collection's config.
- 🗑 **“Retention (days)”** is set per collection: it auto-deletes entries older than that many days (runs periodically in the background and right when you save the config). **`0` = keep forever.**
- 🔒 **View permissions**: a user can only read the history of a **collection they have permission to view**; root/admin accounts can always see it. (It's a “safe-when-in-doubt” mechanism — so **test with a real restricted role** before you fully rely on it.)
- The config **takes effect the moment you click “Save”** (the server reloads itself), **no restart needed**.
- Runs on **both** clients: classic `/admin` and modern `/v/`.

## Remove / disable

- **Stop tracking a collection:** open the config page, toggle the **“Enabled”** column off on that row, or click **“Delete”** on the config. History **already written is kept**.
- **Clean up old history:** set **“Retention (days)”** for the collection so the system auto-deletes expired entries.
- **Remove entirely:** disable the plugin in **Plugin Manager** — logging stops at once. The **history data** (`ptdlChangeLogs`) and **config** (`ptdlChangeLogConfigs`) stay in the database if you re-enable later.

---

### For developers

Logging happens at the **server tier** via db hooks `afterCreate`/`afterUpdate` on the trigger fields; each change becomes one row in the **`ptdlChangeLogs`** collection (immutable, `dumpRules: 'skipped'`), with per-collection config in **`ptdlChangeLogConfigs`** (one row per collection). A value's color/icon/label is snapshotted from the `statusFlow` field's `uiSchema.enum` into `fromMeta`/`toMeta`. The change source = the `x-ptdl-change-source` header (`form`/`quick`/`action`, set by the client) plus server-side inference (`create`/`bulk`/`api`/`system`); the reason travels through the base64 header `x-ptdl-change-note`. The surfaces (timeline / popover / drawer / block) query through the standard resource API and are **permission-gated by the source collection** (fail-open). A `globalThis.__ptdlChangeLog` bridge lets other plugins (e.g. status flow) open the history popover without a hard dependency.
