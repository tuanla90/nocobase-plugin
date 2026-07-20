# Instant Create Page — User Guide

> One click turns **a collection + a few columns you pick** into a **ready-to-use `/v/` menu page**:
> a **Table** block of exactly those columns, plus **View / Edit / Add** buttons whose popups show those same columns.
> No manual block/column/popup wiring. The result is a native NocoBase page you can **keep editing freely**.

**Group:** Blocks · **Runs on:** **/v/** (modern) only — the **/admin** (classic) client does not have this tool · **Version:** 0.1.7

## What's new after installing?

- **A new Settings page: "Instant Create Page"** (box-with-plus icon). This is where you open the tool.
- **A floating button, bottom-right: ➕ "Quick page"** (hover shows **"Quick create a table page"**). Reachable from **anywhere** in the app.
- ⚠️ The plugin **adds no menu, button or field** to your existing pages. It's a **build-a-page-on-demand tool** — it runs only when you open it and click **"Create page"**.
- Every time you use it you get **a real NocoBase page** (in the left menu) that you edit like any hand-built page.

## Where to configure

This tool has **no saved configuration** — you open it and build a page whenever you need one. There are two ways into the **same form**:

| Entry point | How to open |
|---|---|
| **Floating button** | Click **➕ "Quick page"** at the **bottom-right** of the screen (opens a right-side drawer). |
| **Settings page** | ⚙ **Settings** → **"Instant Create Page"**. |

## How to use (step by step)

### Scenario A — Build a table page you can use right away

1. Click the floating **➕ "Quick page"** button (bottom-right) *or* go to **Settings → "Instant Create Page"**.
2. Choose the **"Collection"** (type to search) — the data table you want to show.
3. *(Optional)* Edit the **"Page title"** (defaults to the collection name), pick an **"Icon"** for the menu, and set **"Place under menu group"** (leave blank = top level).
4. In the **"Columns"** box, **tick the columns** to show. The box **stays open** so you can pick several at once.
   > 💡 The columns you pick are **both the table columns and the fields inside the View / Edit / Add popups**.
5. *(Optional)* Fine-tune the column list below:
   - **⬆⬇ arrows**: reorder the columns.
   - **⚙ "Column settings"**: change the **"Component"** (e.g. a Progress bar, colored tag… if the field supports it) and the **"Column title"** — applied to **View / Edit / Add too**.
   - **✕**: remove the column from the page.
6. Click **"Create page"**. ✅ The page **opens immediately** and **appears in the left menu**.

> ⚠️ The **"Create page"** button is enabled only once you've **picked a collection**, have **at least 1 column**, and the **title isn't empty**.

### Scenario B — Want a fancier table (if the Enhanced Table plugin is installed)

- If you've installed `@tuanla90/plugin-enhanced-table-block`, the form shows an extra **"Table type"** box.
- Choose **"Enhanced table"** (*summary row + cell select*) instead of **"Basic table"**, then create as usual.

### ✅ What's in the page it creates?

| Part | What it contains |
|---|---|
| **Table block** | Bound to the collection you picked; each ticked column is a table column (in the order you set). |
| **Per-row buttons** | **View** (read-only details) and **Edit** (form + Save). |
| **Toolbar buttons** | **Add new** (form + Save) and **Refresh**. |
| **The popups** | Show exactly **the columns you picked**. |

Because this is a native NocoBase page (`desktopRoutes` + `flowModels`), you can **open the UI Editor and keep customizing** it like any hand-built page.

## Tips & notes

- 🖥️ **Runs on the `/v/` (modern) client only.** On `/admin` (classic) this tool does nothing.
- 🧩 **Popups contain only the columns you picked.** If the **Add / Edit** form needs a **required** field you didn't tick, open the new page and **add that field to the form** (via the UI Editor).
- 🔢 **Column order = the order you set** (use the ⬆⬇ arrows in the column list).
- 🎨 **Change a column's "Component"** to make it look nicer (e.g. a percentage as a progress bar) — the change applies to both the table and the popups.
- 🗂️ **Menu group**: the **"Place under menu group"** box lists only **existing** groups; if you don't have any yet, leave it blank and the page lands at the top level.
- 🔁 **No server restart needed** — the page is created instantly and shows up in the menu right away.
- ♻️ **Build as many pages as you like**: just reopen the tool and repeat for another collection / column set.

## Remove / disable

- **Disable the plugin** in **Plugin Manager**: the floating **➕ "Quick page"** button and the **"Instant Create Page"** Settings page disappear — but **the pages you already created stay intact and keep working**, because they're real NocoBase pages that don't depend on this plugin.
- **To drop a page you created**: delete it from the **menu** like any other page (this tool doesn't "hold on to" a page once it's made).

---

### For developers

The tool builds the whole `RootPageModel → … → TableBlockModel` tree in memory and saves it **once** (recursive `flowModels:save`), plus one `desktopRoutes` row to turn it into a menu item — so the generated page is **native** NocoBase, editable as usual. Each column is mapped to its display/edit model via `getDefaultBindingByField` (preferred), falling back to the field `interface`; the "Component" and "Column title" stay in sync across Table ↔ View ↔ Edit ↔ Add. Registered on the `/v/` (client-v2) lane only: one Settings page (`addMenuItem` + `addPageTabItem`) plus one floating launcher (`app.addProvider`), both rendering `QuickCreateForm`. Technical detail: see `docs/QUICK-VIEW-DESIGN.md`.
