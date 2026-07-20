# Filter Tree / Bar — User Guide

> Add an **AppSheet-style filter block**: group a collection by one field into a **counted list**
> (“All” + each value with a badge); click a value to **instantly filter** the connected Table/List
> blocks on the same page. Two skins on one engine: **Filter tree** (vertical, nested) and
> **Filter bar** (horizontal: pill / segmented / tab), plus an optional **free-text search box** — **no code**.

**Group:** Blocks · **Runs on:** /admin (classic) + /v/ (modern) · **Version:** 0.3.6

## What's new after installing?

- **No new menu, no new page, no data touched.** Just **2 new blocks** in the Add-block (**＋**) picker.
- In the **＋ (Add block)** menu, under the **Filter blocks** group, you now also get:
  - **Tree (filter)** — a **vertical** list, nested up to **3 levels**, collapse/expand, **multi-select** (Ctrl/⌘ or Shift-click).
  - **Bar (filter)** — a **horizontal** single-level list in 3 skins: **pill / segmented / tab**.
- Each value shows a **metric badge**: count of rows (default) or Sum / Average / Min / Max.
- Config lives **right inside the block's ⚙** (there's no separate Settings page).

## Where to configure

Everything lives in the **block's own ⚙** (turn on the UI Editor → hover the block → gear icon). There are **2 items**:

| Item in ⚙ | What it does |
|---|---|
| **Filter tree** / **Filter bar** | Opens the config box (with a live **Preview**) — pick the collection, group field, metric, style, scope and search box. |
| **Connect to data blocks** | Choose **which Table/List block on the page** this filter drives. **Required** if you want it to filter. |

The config box is split into tabs:

| Tab | Contents |
|---|---|
| **Group** | **Collection** + **Group by** (Filter tree adds an optional level 2 / level 3). |
| **Metric & format** | **Metric (badge value)**: Count of rows / Sum / Average / Min / Max · **Aggregate field** · **Date grouping** (By day/month/year) · **Number format** (Plain / Thousands separator / Compact) · Prefix / Suffix / Decimals. |
| **Style** | **Count badge color** (Colorful per value / Mono one color) · **Icon & color per value**. *Filter bar adds:* **Bar style** (Pill/Segmented/Tab), **Size**, **Align**, **Allow multiple (pill only)**, **Show “All” item**, **Show counts**. |
| **Data scope** | **Only count rows matching…** — a condition builder (count/filter on a subset of the data). |
| **Search** | **Show search box** · **Search in fields** · **Placeholder** · **Show reset button** · **Hide empty group**. *Filter bar adds:* **Search position**, **Search width (px)**. |

## How to use (step by step)

### Scenario A — Vertical filter tree over one table (e.g. filter Orders by Status)

1. Open a page that already has a **Table block** (e.g. an `Orders` table).
2. Turn on the **UI Editor** → click **＋ (Add block)** → **Filter blocks** group → pick **Tree (filter)**.
3. The block shows the prompt *“Configure the filter tree…”*. Open **⚙ → Filter tree**:
   - **Group** tab: set **Collection** = `Orders`, **Group by (level 1)** = the `Status` field.
   - (Optional) add **level 2 / level 3** to nest the tree; visit **Metric & format**, **Style**… if needed.
   - Check the **Preview** at the top of the box → **Save**.
4. Open **⚙ → Connect to data blocks** → pick the **`Orders` Table block** as the target.
5. ✅ The list now shows **All + each status with its count**. Click a status → the table filters instantly; click **All** → clears the filter.
   > 💡 Hold **Ctrl/⌘** or **Shift-click** to select several values at once.

### Scenario B — Horizontal filter bar (pill/tab style)

1. **＋ (Add block)** → **Filter blocks** → **Bar (filter)**.
2. **⚙ → Filter bar** → **Group** tab: pick **Collection** + **Group by** (single level).
3. **Style** tab: choose **Bar style** (Pill / Segmented / Tab), **Size**, **Align**; turn on **Allow multiple (pill only)** if you want multi-select.
4. **⚙ → Connect to data blocks** → pick the Table/List to filter → **Save**.
5. ✅ The horizontal pill/tab bar appears above the table; click to filter.

### Add a free-text search box (works for both skins)

1. In the config box → **Search** tab → turn on **Show search box**.
2. Pick **Search in fields** (one or more fields matched *contains*, OR-joined) and set a **Placeholder**.
3. (Filter bar) choose the **Search position** (Below / Above / Left / Right of the bar).
4. ✅ Type → after ~0.3s it auto-filters the connected table; the search box is **AND-joined** with the current group selection.

## Tips & notes

- ⚠️ **You must “Connect to data blocks”** for clicks to actually filter — picking a collection + group field alone only gives you the counts.
- Groupable fields: **status / select / number / date / boolean**. You **can't group** directly by a relation field or JSON — but you can **hop through one 1-to-1 relation** to a sub-field (e.g. `customer → gender`). If none qualify you'll see *“No groups…”*.
- 🔢 The count badges come from **a single GROUP BY query** on the target collection itself — **no data is changed**, it only counts.
- 🔄 **Counts auto-refresh** when the table's data changes (add/edit/delete — even by someone else or a server process) and when you return to the tab.
- The active selection is **temporary**: **F5 / reload** returns to **All** (the filter never gets “stuck”).
- **Average** can't be aggregated across groups, so the “All” total badge is left blank when the Metric is Average.
- Runs on **both** clients: classic `/admin` and modern `/v/`. **No server restart** needed (it's client-only).

## Remove / disable

- Disable the plugin in **Plugin Manager**. The two blocks **Tree (filter) / Bar (filter)** disappear from the ＋ menu; any block already placed on a page **stops working** until you re-enable it.
- A block's saved config **stays in the page schema** → re-enable the plugin and the block runs again as before. Your table data is **never touched**.

---

### For developers

The two models `FilterTreeBlockModel` + `FilterBarBlockModel` extend `FilterBlockModel` (so they auto-join the “Filter blocks” group), registered via `flowEngine.registerModels` in `src/shared/filterTree.tsx` (shared by both client lanes). Counting = `<collection>:query` GROUP BY (measure + dimension); filtering = core `connectFields` + `resource.addFilterGroup` (groups `ptdl-tree:*` and `ptdl-search:*`). The server is a **no-op** (adds no collection/schema). Bilingual UI labels live in `src/locale/vi-VN.json`.
