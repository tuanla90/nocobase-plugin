# Conditional Formatting — User Guide

> Color the text, background, bold/italic, border, icon, or draw a **heatmap / data bar** on cells in
> **Table blocks** based on each row's value — configured right on the table, **no code, no data changes**.

**Group:** Blocks · **Runs on:** /v/ (modern) — on Table blocks · **Version:** 0.2.15

## What's new after installing?

- **A new item in every Table block's ⚙ settings menu**: **“Conditional formatting”**. This is the one and only place you configure it — there is no separate Settings page.
- **No other menu, page or field** is added. Only **Table blocks** gain this config item.
- Each table has its **own set of rules**; formatting is **display-only** and **never changes your data**.
- ⚠️ **Nothing is colored until you add a rule.** After installing, your table looks exactly as before — everything takes effect only once you create a rule and **Save** the block.

## Where to configure

There is no central config page. You configure it **right on each Table block**:

| Client | How to open |
|---|---|
| **Modern (`/v/`)** | Turn on the **UI Editor** → open the Table block's **⚙ (settings)** menu → **“Conditional formatting”**. A large dialog opens for adding/editing rules. |
| **Classic (`/admin`)** | ⚠️ **Not supported.** The classic table has no compatible block model, so the plugin **colors nothing** here. |

## How to use (step by step)

> Common start: go to a page with a **Table block**, turn on the **UI Editor**, open the block's **⚙** → **“Conditional formatting”**.
> In the dialog, click **“Add rule”**. Each rule uses one of 3 types: **Condition · Color scale · Data bar**.

### Scenario A — Style text / background / icon by condition (Condition type)

Example: when an order is **“Overdue”**, color the **Customer name** column red + bold, with a warning icon.

1. **Add rule** → at the top of the card, choose the **“Condition”** type.
2. Choose **Match**: **“All”** (every condition must be true) or **“Any”** (just one is enough).
3. Under **Condition**, click **“Select field…”** to pick the field to check (you can pick a field **through a relation**, e.g. `Customer → Group`), choose a comparison, and enter a value. Need more conditions? Click **“Add condition”**.
4. Under **Apply to**, pick the column(s) to color. 💡 The colored column **need not** be the one in the condition — you can test *Status* but color the *Name* column.
5. Under **Format**, turn on the effects you want (see the table below) and watch the **“Preview” / “Sample”** cell.
6. **Save** the dialog → **Save** the block. ✅ Rows that match are colored right away.

| Option (under **Format**) | What it does |
|---|---|
| **Text** | Change the text color |
| **Background** | Change the cell background color |
| **B** / **I** | **Bold** / *italic* |
| **Cell border** | Draw a border around the cell |
| **Text outline** | Add an outline (halo) around the text so it reads on a colored background; then pick an **Outline color** |
| **Icon** | Insert an icon before the cell content (click **“Select”** to choose the icon) |

### Scenario B — 2/3-color heatmap for a numeric column (Color scale type)

Example: the **Revenue** column — small numbers get a light fill, large numbers a dark fill.

1. **Add rule** → choose the **“Color scale”** type.
2. Under **Number column**, click **“Select number column”** to pick the column to color. The scale is **auto-scaled to the column's min–max**.
3. Set the two end colors: **Low** and **High**. Want 3 colors (a middle point)? Turn on **“3 colors”** and set **Middle**. The gradient preview appears right beside it.
4. (Optional) On the **Text** row, adjust the text **Color**, and turn on **Text outline** + **Outline color** if the text is hard to read on a colored fill.
5. **Save** → **Save** the block. ✅ The whole column becomes a heat gradient by value.

### Scenario C — In-cell data bar (Data bar type)

Example: the **Quantity** column shows an extra horizontal bar, long or short by value.

1. **Add rule** → choose the **“Data bar”** type.
2. Pick the **Number column** as above (the bar is also **auto-scaled to the column's min–max**).
3. Choose the **Bar color**; the preview shows a sample bar.
4. (Optional) adjust **Text** / **Text outline** / **Outline color** for readability.
5. **Save** → **Save** the block. ✅ Each cell gets a background bar sized to its value.

> 💡 A table can have **many rules** at once (a different type per column, or several conditions stacked). Click **“Add rule”** as many times as you like; click **“Delete”** on a card to remove a rule.

## Tips & notes

- 🎨 **This is pure display formatting (browser-side).** It **never edits data**, needs **no server restart**, and takes effect **the moment you Save** the block.
- ⚠️ **A “Condition” rule must have at least one condition** — if left empty, the rule **colors nothing** (by design, to avoid accidentally coloring the whole table).
- 🧭 **Conditions are evaluated per row** and can reference **any field, including through relations**. The column that gets *colored* (**Apply to**) can differ from the column *used to test the condition*.
- 🔢 **Color scale / Data bar work on numeric columns only** and scale to the **min–max of the currently visible rows**. So **paging / filtering** shifts the scale to whatever rows are on the page.
- 🧩 **Icons exist only in the “Condition” type** (Color scale / Data bar insert no icon).
- 🔁 **When several rules match one cell:** for color / text style, a **later rule overrides** an earlier one; for the icon, the **last matching rule that has an icon** wins.
- 🖥️ **Runs on the `/v/` (modern) client only.** On classic `/admin` the plugin colors nothing.
- 🛟 Safe: if coloring hits an error, the table **falls back to its original rendering** (never blanks the page).

## Remove / disable

- **Remove one rule:** reopen **“Conditional formatting”**, click **“Delete”** on the rule card (or clear them all) → **Save** the block.
- **Turn off system-wide:** disable the plugin in **Plugin Manager**. Coloring **stops at once**. Saved rules stay harmlessly in the block/page config — **re-enable** the plugin and they show again.
- Because config lives with **each block**, removing the plugin **never touches** your table data.

---

### For developers

Pure client, `/v/` lane only: patches `TableBlockModel.getColumns()` → wraps `onCell` (cell style: color/fill/bold/italic/border) and wraps `render` (inserts the icon before content), **crash-safe** (any error falls back to native behavior). Rules are stored in the block prop `ptdlCondRules` via `setProps` (MobX-reactive → the table re-renders itself, nothing written to data). The condition engine reuses `@ptdl/shared`'s condition-kit (`evalConditionOp`, relation-aware field picker); heatmap color interpolation + min/max are computed over the currently loaded rows. The classic lane is a no-op (no `TableBlockModel`); the server side is empty. Details: `src/shared/tableRulesModel.tsx`.
