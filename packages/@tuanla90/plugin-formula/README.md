# Formula & Computed Fields — User Guide

> Write **Excel-style formulas** (400+ functions) all across NocoBase: display columns (including HTML & relation roll-ups),
> form default values, **stored columns the server recomputes** across relations, and **sequential / window** calculations
> like running balances or FIFO / average inventory costing — **no code**.

**Group:** Blocks / Fields · **Runs on:** /admin (classic) + /v/ (modern) · **Version:** 0.1.74

## What's new after installing?

The plugin opens up **5 ways to use formulas**, each in a different place:

| Use case | What it does | Where to set it | Writes to a column? |
|---|---|---|---|
| **Formula column** | Adds a display column computed on the fly (colour badges, HTML, roll-up of child rows…) | Table → **Add column → “Formula column”** | No — display only |
| **Formula on a field** | Makes an existing field show a **formula result** instead of its raw value | Field's ⚙ → **“Formula”** | No — display only |
| **Default value** | Auto-fills a box while the user fills in a form | Field → **Default value → “ƒ Use Excel formula”** | Yes — on form save |
| **Computed value (server)** | A number/text/date column the **server recomputes** when related data changes | A **real column's** ⚙ → **“Computed value”** | Yes — stored |
| **Scan calculations / Ledger · Running** | Running balances, inventory, FIFO / average costing | ⚙ Settings → **“Scan calculations”** | Yes — stored |

- **Two new Settings pages:** **“Computed formulas”** (manages the server-computed columns) and **“Scan calculations”** (ledger / running / costing).
- Every formula box comes with: an **insert field / relation** button, an **Examples** list, a **Functions & syntax** reference, a **Preview** pane (try it live), and a **“✨ Let AI write it”** button (describe it in words → the AI writes the formula).

## Where to configure

| Client | Path to the config page |
|---|---|
| **Modern (`/v/`)** | ⚙ **Settings** → **“Computed formulas”** and **“Scan calculations”** |
| **Classic (`/admin`)** | **Settings** → **“Computed formulas”** (`/admin/settings/ptdl-computed`) and **“Scan calculations”** (`/admin/settings/ptdl-scancalc`) |

> 💡 **Formula column**, **Formula on a field** and **Default value** have **no page of their own** — set them right on the
> column / field with the ⚙ gear button (turn on the **UI Editor** first).

### How to reference data (shared everywhere)

- **A column of the current row** → `data.<column_name>` — e.g. `data.subtotal`.
- **Through a relation** → `data.<relation>.<column>` — e.g. `SUM(data.items.line_amount)` (roll up many child rows), `data.product.unit_price` (pull through a one-to-one relation).
- **Lookup table** (a different collection, not a relation) → type `<table_name>.<column>` **directly**, **WITHOUT** `data.` — e.g. `bang_gia.he_so`.
- **Concatenate** with `&`. **Compare** with `==`, `<>`, `> < >= <=`; **AND** with `&&`. Function names are case-insensitive.

## How to use (step by step)

### Scenario A — Add a **display column** computed from a formula (colour badges, HTML, roll-up of child rows)

1. Open a page with a **Table** → turn on the **UI Editor**.
2. Click **＋ Add column** → choose **“Formula column”** (in the other-columns / virtual-columns group).
3. Open the ⚙ on the column header → **“Formula settings”** (classic: **“Edit formula”**).
4. Enter the **Formula**, for example:
   - Status badge: `IF(data.stock>0, TAG("In stock","green"), TAG("Out","red"))`
   - Roll up child rows: `SUM(data.items.line_amount)`
   - Text + HTML: `CONCATENATE("<b>", data.name, "</b>")`
5. Adjust if needed: **Render HTML** (turn on to show bold / colour / `TAG`…), **Align**, and **Format → Type** (Auto / Number / Date) → **Save**.

> 💡 Built-in HTML functions: `B` `I` `U` `BR` `COLOR(x,color)` `BG` `TAG(text,color)` `DOT(color,size)` `LINK(url,text)` `IMG(src,size)`.
> This column is **not stored in the database** — it recomputes on every render, so it's always fresh.

### Scenario B — Make an **existing field** display via a formula

1. In a table / detail page / form, turn on the **UI Editor** → click the **field** you want to change.
2. Open its ⚙ → choose **“Formula”**.
3. Enter the formula (use `data.*` as above; the field's own raw value is still available) → set **Render HTML / Align / Format** if needed → **Save**.

### Scenario C — **Auto-fill** a box while filling a form (default value)

1. Go to the table's **field manager**, open the field to auto-fill → the **Default value** section.
2. Click the **“ƒ Use Excel formula”** link.
3. Enter a formula over **the form field values**, e.g. `data.quantity * data.unit_price` → **Save**.
4. ✅ As the user fills the form, this box **recomputes whenever a related field changes**. To remove it, click **“✕ Remove formula”**.

### Scenario D — A **stored** column the **server recomputes** across relations (Computed value)

Use this when you need a figure that is **truly stored** and **always correct**, even when you edit a child row, the parent row, or a config table.

1. Create (or pick) a **real column** of type **number / text / date / boolean** on the table.
2. In the **Table**, turn on the UI Editor → open that column's ⚙ → **“Computed value”** → **“Auto-updating value (formula)”**.
   *(You can also open it quickly from the 🧮 icon next to the field in a form, or from Settings → “Computed formulas”.)*
3. Enter a formula — same row, aggregate a relation, or pull through a relation:
   `data.subtotal - data.discount` · `SUM(data.items.line_amount)` · `data.product.unit_price`
4. Choose **Compute when** (tick several — they combine into a scenario):
   - **On create** — computed once when the row is created (frozen, e.g. invoice number, price at order time).
   - **On update** — recomputed each time you open that row and save.
   - **On source change** — recomputed when you add/remove a child row, edit the parent row, or edit a **config table** (this is the “fan-out” part).
   - 💡 Tick **all three** = always absolutely correct (default).
5. (Optional) set **On error** = **Write null** or **Keep old value**; click **Run** in **“Test on 1 record”** to preview → **Save**.
6. ✅ The server recomputes the related rows; the page refreshes itself (no F5). To recompute the whole table, use the **“Recompute”** button on the **“Computed formulas”** page.

### Scenario E — **Running balances / Inventory / Costing** (Scan calculations)

Use this for **ordered accumulation** (balance after each voucher, stock on hand) and **outbound costing** (FIFO / average).

1. Go to ⚙ **Settings → “Scan calculations”** → the **“Rules”** tab → click **“Add”**.
2. **① Overview / Strategy** — name it and choose the **Calculation type**:
   - **Row-based (running)** — runs in the DB: **Running total (SUM)**, running count / min / max / average, **Sequence number (ROW_NUMBER)**.
   - **State-based (per-batch)** — scans each row to value what's consumed: **FIFO cost**, **Weighted average**, **FEFO (earliest expiry first)**.
3. **② Input** — pick the **data table**, the **signed amount** column (+ in / − out), **Partition by column(s)** (a separate ledger per product / warehouse), **Order by column(s)** (the running order; end with `id` as a tie-breaker). Costing also needs the **receipt unit-cost column**.
4. **③ Output** — choose which figures to write into which number columns (running quantity, running value, cost of goods sold / COGS, average unit cost…).
5. **④ Advanced** — **decimal places**, **rounding**, handling of **negative inventory** and **missing cost** (for costing) → **Save**.
6. ✅ Saving **recomputes** automatically. To rerun from scratch, click **“Recompute all”**.

> 💡 Separate in / out tables? In **② Input** choose **“Multiple tables (in/out split)”** — the system merges them all into
> **one ledger by time**, then values it.

## Tips & notes

- **Pick the right tool by “stored or not”:** need a nice / fast **display** → *Formula column* or *Formula on a field* (costs no column). Need a figure that is **stored and always correct across relations** → *Computed value*. Need **ordered accumulation / costing** → *Scan calculations*.
- ⚠️ **Computed value** and **Scan calculations** are **server-side** and **overwrite a real column** — use **Test** / **Preview** before saving on large data.
- **Relations nested 2+ levels deep** (`data.a.b.c`) usually **can't be loaded** → compare by an **id key** instead of deep nesting (e.g. `bang.rel_id == data.x_id`).
- Use only **functions in the list** (open **“Functions & syntax”**); there's **no** `XLOOKUP` or new-Excel dynamic arrays. `VLOOKUP` needs a 2D array in one JSON field, **not** for a collection table.
- **Stuck on a formula?** Click **“✨ Let AI write it”**, describe it in words (e.g. “total of active rows”) → the AI suggests one; or use **“AI fix”** / **“Explain”** on an existing formula.
- **Computed value** columns refresh on other machines via WebSocket — edit a child row and the related pages update themselves, **no F5**.
- Runs on **both** clients: classic `/admin` and modern `/v/`. Enabling / editing rules needs **no server restart**.

## Remove / disable

- **Remove a Formula column / Formula on a field:** open the column / field's ⚙ → **Delete** (for a column), or reopen **“Formula”** and clear the content. Your table data is **unaffected** (these are display only).
- **Remove a formula default value:** reopen Default value → **“✕ Remove formula”**.
- **Remove a Computed value column:** clear the formula (leave it empty) in the ⚙ **“Computed value”**, or **“Delete”** the rule on the **“Computed formulas”** page → the column reverts to a normal number / text field and **keeps its current values**.
- **Remove a Scan-calculations rule:** go to the **“Scan calculations”** page → **“Remove item”** — the column's data **is kept**.
- **Remove entirely:** disable the plugin in **Plugin Manager**. Display formulas stop rendering; saved *Computed value* / *Scan calculations* config stays in the database to reuse if you re-enable (but it **won't recompute** while the plugin is off).

---

### For developers

The engine is ~400 formulajs functions + HTML helpers (`src/shared/formulaEngine.ts`). Five entry points: the virtual column (`formulaColumnModel` + classic `formulaColumnClassic`), the display field (`formulaFieldModel`), the default value compiled to RunJS (`formulaDefaultValue`), the server computed-rule stored in `ptdlComputedRules` (client `computedRuleClient`, auto-detects dependencies + fan-out + WS live-refresh), and the sequential / window + costing engine (`ScanCalcManager`, `excelToSql`). Design details: `COMPUTED-FIELD.md` (§4b example list), `ROLLUP.md`, `LEDGER-WINDOW-MODE.md`, `COSTING.md`.
