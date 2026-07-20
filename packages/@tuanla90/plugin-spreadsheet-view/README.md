# Spreadsheet View — User Guide

> An Excel-like data-entry grid (AG Grid) over **any collection**: edit cells with **NocoBase's own field widgets**,
> save per row. Add **virtual formula columns**, **multi-level grouping with subtotals**, a **summary row**,
> **conditional formatting**, **TSV paste** from Excel/Sheets, **fill-down** and **copy** — all configured right on the block, no code.

**Group:** Blocks · **Runs on:** /v/ (modern) + /admin (classic, FlowEngine pages) · **Version:** 0.2.3

## What's new after installing?

- **One new block type** in the block picker: **"Spreadsheet"** (in the **"Content"** group, next to the core blocks). Add it to a page like any other block and point it at a collection.
- **No menu, page or field is added**, and there's **no separate Settings page.** Everything is configured **right on the block** (the block's ⚙ and each column's ⚙).
- Once added, the collection appears as an **Excel-like grid**: smooth (virtualized) scrolling, resize/pin columns, keyboard navigation, and **cells edited with NocoBase's own native widgets** (select, relation, date-time, checkbox…).
- A **toolbar** above the grid: a **Search…** box and an **Add new** button; when the **UI Editor is on** you also get **Formula (ƒ)**, **Actions (⚡)** and **Hidden** (the list of hidden columns).
- ⚠️ **Formula columns need the `@tuanla90/plugin-formula` plugin** (an engine with ~400 Excel functions). Without it, formula cells show the warning **"⚠ requires @tuanla90/plugin-formula"**.

## Where to configure

The plugin has **no Settings page**. You configure it in **3 places right on the block** — remember to **turn on the UI Editor** (the interface-design button) first:

| What to change | Where |
|---|---|
| **The whole block** (visible columns, height, grouping, add/delete rows, row drawer) | The block's ⚙ (gear) → **"Spreadsheet"** → **"Spreadsheet settings"** |
| **A single column** (format, widget, summary, pin, hide, insert ƒ column) | Hover over the **column header** → click the small **⚙** that appears at the right edge |
| **Formula columns · Row actions · Hidden columns** | The **Formula (ƒ)**, **Actions (⚡)**, **Hidden** buttons on the **toolbar** |

> 💡 The advanced buttons and the per-column ⚙ **only show while the UI Editor is on**. During normal viewing/data entry they're hidden — by design.

## How to use (step by step)

### Scenario A — Add a Spreadsheet grid to a page

1. Open the page where you want the grid → **turn on the UI Editor**.
2. Click **Add block** → the **"Content"** group → pick **"Spreadsheet"**.
3. Choose the **collection** to edit.
4. The grid appears immediately. Click a cell to edit: text/number cells are edited in place; **select / relation / date-time** cells open a **dropdown right under the cell**; **checkbox** cells toggle on click.
5. When you edit, the row gets an **orange bar on the left** and the toolbar shows **"● N unsaved"**. Changes **auto-save when you move to another row**, or click **"Save"** to write them all at once. ✅ (Select/date/checkbox cells **save immediately** on pick.)

> Field type → how you edit it in the grid:
>
> | Field type | How you edit the cell |
> |---|---|
> | Text, number, email, phone, URL | Type directly in the cell (start typing to begin editing, like Excel) |
> | Single/multiple select, many-to-one relation, date/time | A list/calendar opens **right under the cell**; picking saves it |
> | Checkbox (boolean) | Click the checkbox in the cell — toggles & saves instantly |
> | Attachment, rich text/markdown, JSON, sub-form/sub-table, password | **Not editable in the grid** — these fields are hidden from the table |

### Scenario B — Choose visible columns, height, row numbers

1. Turn on the UI Editor → the block's ⚙ → **"Spreadsheet"** → **"Spreadsheet settings"**.
2. Under **Display**: the **"Visible columns"** box — leave it empty to show every supported column, or pick exactly the columns you need. Set the **"Grid height"** (px) and toggle **"Show row numbers"**.
3. Under **Record drawer** → **"Row drawer"**: **"Auto form (zero-config)"** or **"Custom popup (configure with blocks)"** (design it yourself with blocks).
4. Click **Save** on the dialog. ✅

> 💡 Hovering over a row shows a **⤢** button at the start of the row — click it to **open the record** (drawer) in the style you picked in step 3.

### Scenario C — Add a formula column (ƒ)

> Requires **`@tuanla90/plugin-formula`**. A formula column is a **virtual column computed at display time** — it creates no field in the database and can't be sorted/filtered on the server.

1. Turn on the UI Editor → on the toolbar click **"Formula"** (the ƒ icon) → the **"Formula columns"** window.
2. Click **"+ Add formula column"**, give it a **column name** (the **"ƒ Column"** box) and enter an Excel-style **formula** — **type field names directly**, e.g. `qty * price`, `CONCATENATE(name, " - ", status)`, `IF(total > 100, "VIP", "")`.
3. Handy **Functions / Fields / Samples** tabs let you click to insert, and an **AI button** suggests a formula from a natural-language description (describe what you want to compute, then click the AI button). See the result on the **"Preview"** line.
4. Click **"Apply"**. ✅ The ƒ column appears in the grid.

> 💡 Alternatively: hover over a **column header** → ⚙ → **"Insert ƒ column · left"** / **"Insert ƒ column · right"** to insert next to it. Edit/delete later via the column ⚙ → **"Edit formula"** / **"Delete ƒ column"**.

### Scenario D — Multi-level grouping + subtotals + a summary row

1. **First enable a summary on the number column:** hover over the number column's header → ⚙ → **"Column format…"** → the **"Summary"** section, pick a calculation (see the table below). Do this for each column you want to total.
2. The block's ⚙ → **"Spreadsheet"** → the **Row grouping** section → **"Group by"**: pick **1–3 fields** (selection order = **level 1 → level N**). You can group by **single-select / many-to-one relation / text / checkbox** fields.
3. Choose the **"Group display"**: **"Group rows (collapsible)"** (click to collapse/expand each group) or **"Merged cells (Excel style)"** (merges the group-column cells, with no collapsible header rows).
4. If needed, raise the **"Group load limit"** (up to 50,000 rows — when grouping is on the table loads every row so subtotals are computed correctly).
5. Click **Save**. ✅ Each group shows a **subtotal** on its group header row; a **summary row** at the bottom totals everything.

> The **"Summary"** calculations available per column:
>
> | Group | Options |
> |---|---|
> | Number | **Sum (Σ)**, **Average**, **Median**, **Min**, **Max**, **Range (max−min)** |
> | Count | **Count (filled)**, **Empty**, **Unique (distinct)**, **Filled %** |
> | Ratio | **Ratio A÷B** (pick numerator/denominator columns, optionally ×100 to show a %) |

### Scenario E — Conditional formatting & cell widgets

1. Hover over the column header → ⚙ → **"Column format…"**.
2. Quick tweaks: **Align** (Left/Center/Right), **Bold text**, **Text color**, **Background**, **Header color**, **Width**, **Pin**.
3. **Conditional formatting:** the **"Format rules (match value/label)"** section → add a rule: when a cell matches a **value/label**, give it its own **text color + background**.
4. **Display widget** (the **"Display"** section): turn a number cell into a **★ Star rating** or **▬ Progress bar** (interact right on the cell: click a star / drag the bar to save); date columns get **"Relative date"**, select columns get **"Select buttons"**. Click the widget's config icon to set the max stars, color, %, etc.
5. Closing the panel applies it right away. ✅

### Scenario F — Paste from Excel, Fill-down, Copy

- **Paste TSV:** copy a range of cells from Excel/Google Sheets → click the start cell in the grid → **Ctrl/Cmd + V**. The data spreads out from that cell; pasting past the end of the table **creates new rows**. Limit **1,000 rows per paste**.
- **Fill-down:** **select ≥ 2 rows** in one column then press **Ctrl/Cmd + D** — the first row's value fills down into the rest (only editable columns you have permission for).
- **Copy:** tick the rows → **Ctrl/Cmd + C**, or click the **"Copy (N)"** button on the toolbar.

### Scenario G — Add & delete rows

1. The block's ⚙ → **"Spreadsheet"** → the **Add & delete rows** section: turn on **"Allow add row"** / **"Allow delete rows"**.
2. **"Show 'Add new' at"**: **"Toolbar button"** (like core), **"＋ row at the bottom"** (Airtable-style — type in the last row to add), or **"Both (toolbar button + ＋ row)"**.
3. **"Add row (group ＋ button)"**: **"Create + open form"**, **"Quick create, no form"**, or **"Open custom link"** (fill in the **"Add row link"**; `{field}` is replaced by the group value).
4. **Delete:** tick the rows → click the red **delete (🗑 N)** button on the toolbar, confirm. ✅

## Tips & notes

- **Per-row saving keeps data safe.** Editing several cells in one row writes **once** when you leave the row or click **Save**. If someone else just changed the same row, the table **reloads the latest version and keeps your changes**, prompting you to click **Save to overwrite** — nothing is lost silently.
- ⚠️ **Formula columns need `@tuanla90/plugin-formula`.** Without it, ƒ cells show **"⚠ requires @tuanla90/plugin-formula"**. ƒ columns are **virtual** (computed at display time), so they **can't** be sorted/filtered on the server.
- **Permissions are respected.** Add/edit/delete/paste/fill-down all follow the current role's ACL; actions you don't have permission for are skipped and reported back.
- **Grouping loads many rows.** When **Group by** is on, the table loads every row (up to the **Group load limit**, max 50,000) so subtotals are accurate — on very large tables, set a sensible limit.
- **Unsupported fields** (attachment, rich text/markdown, JSON, sub-form/sub-table, password…) are **hidden from the grid** automatically — to edit them, open the **record** with the **⤢** button.
- **CSV export** exists in the core, but the **"Export" button is temporarily hidden in this build**; to use it you must re-enable it in code (`showExport`). For now, use **copy/paste** to get data out.
- Runs on **/v/ (modern)** and on **FlowEngine-powered pages in /admin**; **legacy uiSchema /admin pages don't show** this block (by design).

## Remove / disable

- **Remove the grid from a page:** turn on the UI Editor → the block's ⚙ → **delete the block**. The collection's data is **unaffected** (the block is only a way to display it).
- **Remove entirely:** disable the plugin in **Plugin Manager**. Any "Spreadsheet" blocks you placed stop rendering, but the **collection data stays intact**. Column/group/formula config is stored per block, so it's lost when you delete a block; re-enable the plugin and the remaining blocks work again.
- Formula columns, formatting, summaries… **create no columns in the database**, so removing the plugin leaves no data "junk" behind.

---

### For developers

The `PtdlSpreadsheetBlockModel` block (extends `CollectionBlockModel`) is registered in **both lanes** (`src/client`, `src/client-v2`) via `registerSpreadsheet`. The grid framework is **AG Grid Community 36**; cell internals **reuse NocoBase's `EditableItemModel` / `FieldModelRenderer`**, so fields already carrying an @tuanla90 widget render correctly. Bulk writes (paste / fill-down / Save) go through the server action **`<collection>:bulkSync`** (`src/server/plugin.ts`) in **a single transaction**, with **conflict control** via `expectUpdatedAt` (409 → reload + keep dirty). i18n follows the @tuanla90 convention (**Vietnamese = key**, only `en-US` is registered); formulas use the `globalThis.__ptdlFormula` engine from `@tuanla90/plugin-formula`, and cell widgets come from `globalThis.__ptdlFieldEnh`. Design/limitations detail: `docs/BRD-spreadsheet-view.md`, `docs/MVP-spreadsheet-view.md`, `docs/SPREADSHEET-VIEW-RETRO.md`.
