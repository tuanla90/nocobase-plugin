# Sub-table Pro — User Guide

> Upgrade a **sub-table** field (hasMany / many-to-many relation) into a professional line-item
> entry tool: add a **totals row**, switch the **display mode** (table / list / cards), get **+/−
> quantity buttons**, and a **bridge** so clicking a row in another block auto-adds/increments a line
> here — great for **quotes, orders, picking**. Saving is still **100% native**.

**Group:** Blocks / Fields · **Runs on:** /v/ (modern) · **Version:** 0.2.8

## What's new after installing?

- **A new field-component option: “Sub-table Pro”** — for **one-to-many (hasMany)** or **many-to-many** relation fields.
- **A new config item on the field: “Sub-table Pro settings”** (open via the field's ⚙) — with 3 tabs: **Display**, **Totals row**, **Connect**.
- **A new action for product blocks: “Send row via channel (bridge)”** — a button you add to a card/row to push a product into the sub-table.
- **A new option for Table blocks: “Send row on click (bridge)”** — click a row to send it, no button needed.
- ⚠️ **It doesn't turn itself on.** Your sub-tables stay exactly as before until you **manually pick** “Sub-table Pro” for a field.
- **No new menu, no new Settings page** — everything is configured right on the field/block.

## Where to configure

The plugin has **no dedicated config page**. You configure it right on the field and block (turn on the **UI Editor** first):

| What you want | Where to open |
|---|---|
| **Turn on the widget** for a relation field | field ⚙ → pick **Field component** → **“Sub-table Pro”** |
| Display mode, quantity, totals row, bridge (**the receiver**) | field ⚙ → **“Sub-table Pro settings”** |
| Send-row button on a product block (**the sender**) | Add the **“Send row via channel (bridge)”** action to a card/row → its ⚙ → **“Send-row settings”** |
| Send on **clicking a whole row** (Table block only) | Table block ⚙ → **“Send row on click (bridge)”** |

## How to use (step by step)

### Scenario A — A nicer sub-table: +/− quantity buttons and a totals row (orders / quotes)

1. Go to a page whose form contains a sub-table (e.g. an **Order** with a **Details** sub-table). Turn on the **UI Editor**.
2. Click the sub-table field → open ⚙ → **Field component** → pick **“Sub-table Pro”**.
3. Open ⚙ again → **“Sub-table Pro settings”** → the **Display** tab:
   - In **“Quantity column (+/−)”** pick the quantity column (e.g. `Quantity`). That column becomes a **− [n] +** control for fast entry.
   - (optional) adjust **“Quantity control style”** (Joined / Split (2 icons)), **“Number align”**, **“Button color”**, **“Full-width button (follows column)”**.
4. Switch to the **Totals row** tab → enable **“Show totals row”** → tick the columns under **“Columns to total”** (e.g. `Amount`, `Weight`).
5. **Save**. ✅ A **totals** row appears at the bottom (Σ icon + row count); the chosen columns are summed.

> 💡 The **“Preview”** box at the top of the config dialog shows the quantity control and totals row update as you pick — try it before you Save.

### Scenario B — Switch to Cards / List mode (image + name + unit price + line total)

1. Open **“Sub-table Pro settings”** → the **Display** tab → set **“Display mode”** to **List** or **Cards**.
2. In Cards/List mode, 4 more fields appear so you specify which column each value comes from: **“Title column”**, **“Subtitle column”**, **“Image column”**, **“Unit price column”**.
   - These fields accept **related fields too** (e.g. `Product · Unit price`) — fetched on demand, no extra column needed.
3. **Save**. ✅ The sub-table renders as cards/list; if both a **unit price** and a **quantity column** are set, each row computes its **line total** automatically.

| Display mode | What it looks like | Good for |
|---|---|---|
| **Table** *(default)* | like the native sub-table, plus a totals row + +/− buttons | multi-column data entry |
| **List** | compact rows: small image + name + subtitle + unit price + line total + +/− buttons | quick scan, narrow screens |
| **Cards** | a card grid: large image + name + unit price + line total | “storefront”-style item picking |

> 💡 **Related columns in Table mode** are a **built-in NocoBase feature**, not this plugin's: add a relation column (e.g. `Product`) → the column's ⚙ → **Title field** → pick the field to show (e.g. `Unit price`). This works right inside the widget.

### Scenario C — Bridge: click a product in another block to auto-add a line (picking / POS)

The idea: a **product list block** (Table, Grid Card, or List) is the **sender**; the **“Sub-table Pro”** sub-table is the **receiver**. The two are linked by an identical **channel name**.

**Step 1 — Configure the receiver (the sub-table):** open **“Sub-table Pro settings”** → the **Connect** tab:
1. Enable **“Receive events from another block”**.
2. **“Channel name”**: set a name, e.g. `ch1` (the sender must match it exactly).
3. **“Match by column/relation (e.g. Product)”**: pick the **relation** that points to the product (e.g. `Product`) — pick the relation, not a raw key column.
4. **“Key on the source record”**: usually leave it as `id`.
5. On the **Display** tab, remember to set **“Quantity column (+/−)”** so that clicking an already-added product **increments the quantity** instead of creating a duplicate row.

**Step 2 — Configure the sender.** Choose one of two ways (both **need no code**):

- **Way (a) — A button on the card/row (Grid Card / List / or a Table row):** add the **“Send row via channel (bridge)”** action to the card/row's button area (where you usually add buttons), then open ⚙ → **“Send-row settings”** → fill **“Channel name”** = `ch1` and choose a **“Control style”**:

  | Control style | Behavior | Needs a “Quantity column”? |
  |---|---|---|
  | **Plus/minus buttons** | `+` adds/increments, `−` decrements (dimmed when the item isn't in the sub-table yet) | Yes |
  | **Checkbox (add/remove)** | checked = add, unchecked = remove; auto-reflects whether the item is already in the sub-table | No |
  | **Single button** | one button that runs exactly **one** action chosen in **“Action on click”** (Add / +1 · Reduce / −1 · Remove) | depends on the action |

- **Way (b) — Click the whole row (Table block only):** open the **Table block's** ⚙ → **“Send row on click (bridge)”** → enable **“Publish on row click”**, fill **“Channel name”** and choose an **“Action on click”**. From then on, clicking any row sends that row (no per-row button).

3. **Save** both sides. ✅ Click **+** (or tick the checkbox / click the row) in the product block → the sub-table **adds a new row** (quantity 1) or **+1** if it's already there; the `−` button reduces the quantity, and reaching 0 removes the row.

> 💡 The **+/−** buttons and **checkbox** on the sender always **sync back** with the sub-table: whether you edit by hand, delete a row, or add via the bridge, the number/checkmark updates to match.

## Tips & notes

- ✅ **Saving is still 100% native.** The widget **inherits** the native sub-table model, so saving (nested create/update of child rows) is **identical** to the default sub-table — no custom save format, no data risk.
- ⚠️ **You must pick it manually.** “Sub-table Pro” does **not** replace the default sub-table. Any field that hasn't picked it still shows as before. It only appears for **hasMany / many-to-many** relation fields (not for **file/attachment** relations).
- **The bridge runs within one browser tab** (client-side pub/sub): it's for quick entry on the same page, **not yet** multi-device sync. Data is only written when you click **Save** on the form (via the native save path).
- **Want quantities to accumulate?** The receiver **must** have a **“Quantity column (+/−)”**; if it's empty, every send adds a **new row** instead of +1.
- **Line total** in Cards/List mode only shows when **both** a “Unit price column” **and** a “Quantity column” are set.
- This is a feature of the **modern `/v/` client** (where the native sub-table model exists to inherit from). On the classic `/admin` client, if that lane has no native sub-table model, the plugin **safely skips** (the field shows as usual).

## Remove / disable

- **Return one field to the plain sub-table:** open the field's ⚙ → **Field component** → pick the **default** sub-table again. Data is untouched (it was native all along).
- **Remove entirely:** disable it in **Plugin Manager**. Since the data lives in the native relation, **nothing is lost**; fields set to “Sub-table Pro” simply **revert to the default sub-table display**.
- 💡 **Recommended:** before disabling the plugin, for tidiness switch the fields in use back to the default **Field component**. The bridge is runtime-only — it **stores nothing** in the database, so there's nothing to clean up.

---

### For developers

The widget is a `FieldModel` **subclass** of the native `SubTableFieldModel` (taken from the flow-engine registry) — it inherits value binding, row markers, the record-picker flow, and **submit serialization** unchanged; it only overrides `render()` to draw the 3 view modes + totals row + stepper + lookup. It's bound to the field via `FormItemModel.bindModelToInterface('PtdlSubtableProFieldModel', ['o2m','m2m','mbm'], { isDefault: false })`. The bridge is an in-memory client-side pub/sub (`ctx.app.ptdlBridge` / `window.__ptdlBridge`); the server is a no-op (submit goes through the standard association API).

Publish from RunJS (if you prefer code over the no-code action):

```js
const bridge = (ctx.app && ctx.app.ptdlBridge) || window.__ptdlBridge;
bridge?.publish('ch1', { action: 'add', record: ctx.record });
```

`record` is the source row (e.g. a product `{ id, name, unit_price, ... }`). The widget takes `record[sourceKey]` (`id`) and matches/sets it into the child relation `targetKey`.

Event shape: `bridge.publish(channel, { action, record, delta })`, where `action` ∈ `add | inc | dec | remove | set`:

| action | effect on the target sub-table |
|---|---|
| `add` | matching row → qty +1; else push a new row (qty 1, FK = record id) |
| `inc` | matching row → qty += `delta` (default 1); else new row (qty = delta) |
| `dec` | matching row → qty −= `delta`; qty ≤ 0 removes the row |
| `remove` | remove the matching row |
| `set` | set the matching row's qty = `delta` |

**Roadmap:** v0 ✅ standalone widget (table view, picker, qty, nested submit) + totals · v1 ✅ house-style config dialog, table/list/cards, qty +/− stepper · v2 ✅ bridge (subscribe + add/inc/dec/remove by key). Next: patch source-table selection-change to auto-publish (no RunJS); m2m through-qty; multi-device (WebSocket). Design & status: `docs/SUBTABLE-PRO-DESIGN.md`.
