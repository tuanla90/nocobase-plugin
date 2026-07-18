# Block: Enhanced Table — User Guide

> A data table that does more than the standard one: add a **summary row** (sum / average / count… per column), **get instant stats when you drag-select cells**, and a **card mode** that restacks each row to fit narrow screens —
> configured right on the block, **no code, no server restart**.

**Group:** Blocks · **Runs on:** /admin (classic) + /v/ (modern) · **Version:** 2.1.0-beta.16

## What's new after installing?

- **A new block type** in the **Add block** picker: **Enhanced Table** — on **/v/** it lives under the **Content** group (there's a search box; type "Enhanced Table").
- **In the block's ⚙ (gear) menu** you get:
  - **Enhanced table settings** — where you turn on the **summary row** and style it (on /v/).
  - **Responsive (mobile cards)** — turn on card mode for narrow screens (on /v/).
  - On /admin: a **Summary row settings** item in the table block's settings menu.
- **New behavior right away:** **drag-select multiple numeric cells** in the table → a stats popup (sum, max, min, average) pops up next to the cursor.
- **No** Settings page, **no** new menu, **no** touching your data or server — everything lives on the table block.

## Where to configure

There's no separate Settings page — everything is configured **right on the table block**, in the **⚙** menu when **UI Editor** is on.

| What you want to do | On **/v/** (modern) | On **/admin** (classic) |
|---|---|---|
| Add the block | Add block → **Content** → **Enhanced Table** | Add block → **Enhanced Table** |
| Turn on the summary row | ⚙ block → **Enhanced table settings** → **Summary row settings** tab | ⚙ block → **Summary row settings** |
| Style / reposition the summary row | ⚙ block → **Enhanced table settings** → **Summary row style** tab | *(not available on classic)* |
| Card mode for narrow screens | ⚙ block → **Responsive (mobile cards)** | *(not available on classic)* |
| Drag-select cells for stats | Automatic | Automatic |

> ℹ️ **The fullest feature set is on /v/ (modern).** The /admin (classic) client supports the **basic summary row** and **cell drag-select**; the advanced options (style/position, Count distinct, Custom label, card mode) are on **/v/**.

## How to use (step by step)

### Scenario A — Add a table and turn on the summary row (/v/)

1. Go to the page where you want the table and turn on **UI Editor**.
2. Click **Add block** → **Content** group → **Enhanced Table**; pick the **data source** & **collection** just like a normal table.
3. Add the **columns** you want to show — especially the **numeric columns** you want to total (only columns already in the table show up for selection in the next step).
4. Open the block's **⚙** → **Enhanced table settings** → **Summary row settings** tab.
5. For each column, pick an **aggregation type** in the **"Select aggregation type"** box:

   | Label | Meaning | Applies to |
   |---|---|---|
   | **Sum** | Adds up all values | Numeric columns |
   | **Average** | The mean value | Numeric columns |
   | **Count** | Counts cells that have data | Any column |
   | **Count distinct** | Counts how many different values | Any column · */v/ only* |
   | **Min** | The smallest value | Numeric columns |
   | **Max** | The largest value | Numeric columns |

6. *(Optional)* Type a **Custom label** per column to replace the default name (e.g. "Revenue"). */v/ only*
7. Click **Save**. ✅ A **summary row** appears at the bottom of the table, computed over **all your data** (every page, not just the one you're viewing) and matched to each column's own **number format** (separators, decimals, currency symbol, %).

> 💡 To **drop the total** for a column: reopen the dialog, **clear** the selection in that column's "Select aggregation type" box, then **Save**. The summary row shows only when **at least one column** is selected.

### Scenario B — Reposition & style the summary row (/v/)

1. ⚙ block → **Enhanced table settings** → **Summary row style** tab.
2. Choose the **Summary row position**:
   - **Bottom (default)** — the summary row sits at the bottom of the table.
   - **Top, sticky below header** — the summary row stays visible (stuck right below the header row) as you scroll a long table.
3. Tune the rest if you like: **Show label** (turn the aggregation-type name on/off), **Value text color** (default `#1890ff`), **Label text color** (`#8c8c8c`), **Background color** (`#fafafa`), **Value font weight** (**Bold** / **Normal**), **Value font size (px)** (default `14`).
4. Click **Save**.

### Scenario C — Instant stats when you drag-select cells (both clients)

1. In normal view (**nothing to turn on**), **hold the left mouse button and drag** across several cells of a numeric column.
2. The selected cells turn **pale yellow**; a stats popup appears next to the cursor with **Sum / Max / Min / Average** and the number of selected cells.
3. It shows only when you select **2 or more cells**, and it counts only cells in **numeric columns**.

> 💡 If the table has **row checkboxes**: when you **tick a few rows**, the summary row recomputes just for the **ticked rows**, with a small **"All: …"** line for the grand total.

### Scenario D — Turn on card mode for narrow screens (/v/)

1. ⚙ block → **Responsive (mobile cards)**.
2. Turn on **"Show as cards on narrow screens"**.
3. Set **"Switch to cards below width"** — the width threshold (px), default **640**. When the block's container is **narrower** than this threshold, the table turns into a list of **cards** (each row = one card: the first column becomes the title, the remaining columns stack vertically, and the action buttons go at the bottom of the card).
4. Click **Save**. On wide screens it still shows the **full table** as usual.

> 💡 The threshold measures the **block container's width**, not the window width — so cards also kick in when you place the table in a **narrow column / split layout**, not just on phones.

## Tips & notes

- **The total is computed over all your data**, not just the page you're viewing — the plugin loads every page to add them up correctly.
- **A column must be present in the table** before it appears in the summary-row settings list — so **add the column first**, then turn on its total.
- **Count / Count distinct** work on **any column type**; **Sum / Average / Min / Max** are for **numeric columns** only.
- **Number format matches the column:** the summary row mirrors how the column displays (comma/period separators, decimals, currency symbol, %).
- **Difference between the two clients:** the **/v/** (modern) client has the full set — **styling + top/bottom position + Count distinct + Custom label + card mode**; the **/admin** (classic) client currently has only the **basic summary row** (Sum / Average / Count / Min / Max) and **cell drag-select**.
- ⚠️ On **/admin** (classic), some **labels may not be fully localized** (this block's translation pack targets **/v/**) — the meaning is still as in the reference table above.
- **No server restart needed:** this is a front-end plugin; the configuration is saved right in the block/page.

## Remove / disable

- **Turn off the summary for one block:** open **⚙** → **Enhanced table settings** (classic: **Summary row settings**) → **clear all** aggregation selections → **Save**. To turn off card mode: open **Responsive (mobile cards)** → **flip the switch off**.
- **Remove the plugin entirely** in **Plugin Manager**: any "Enhanced Table" blocks you've created **lose the enhanced parts** (summary row, drag-select, cards) and **may not render correctly** because the block type is no longer registered. It's best to **convert those blocks back to normal tables before removing**, or **re-enable the plugin** to bring them back.
- Saved configuration lives in the **page schema** (it creates no data table of its own), so removing the plugin leaves **no** leftover data in the database.

---

### For developers

The block extends `TableBlockModel` via `defineEnhancedTableBlockModel()` (shared by both lanes; the core file does **not** import `@nocobase/client`, so the `/v/` bundle stays clean — the /v/ lane uses `@nocobase/client-v2`, the /admin lane injects hooks via `setEnhancedTableDeps`). The summary row is computed **client-side**: it loads the whole dataset (`paginate:false`), then formats numbers using each column's real cell template. Card mode **portals** the card list into `.ant-spin-container` just before pagination, reusing `model.getColumns()` to render (preserving conditional formatting, widget fields, and relation titles). Config storage: /v/ keeps it in the **model props** (`summaryConfig` / `summaryStyle` / `responsiveCard` / `responsiveBreakpoint`) via flow-step parameters; /admin keeps it in `x-decorator-props.summaryConfig`. The **style/position, Count distinct, Custom label, and card mode** options are /v/ only. Install via CLI with `yarn nocobase plugin install @ptdl/plugin-enhanced-table-block`, or enable it in Plugin Manager. Compatible with both V1 (`/admin`) and V2 (`/v/`) pages. License: **AGPL-3.0**.
