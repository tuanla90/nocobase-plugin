# @ptdl/plugin-subtable-pro

Enhanced sub-table field widget for hasMany / m2m associations. Subclasses the native
`SubTableFieldModel`, so **submit is 100% native** (nested create/update inherited). Adds:

- **Totals row** — sum chosen numeric columns (weight / volume / amount).
- **View modes** — table (default) / list / cards (compact: image + name + price + line total).
- **Qty +/− stepper** — a chosen column becomes a `− [n] +` pill (fast entry).
- **Bridge** — receive events from ANOTHER block (click a product row → add / +1 a line here).

Pick it per field: field ⚙ → **Thành phần trường → Sub-table Pro**. Config: field ⚙ →
**Cấu hình Sub-table Pro**.

> **Related (lookup) columns in TABLE view** are NOT a feature of this plugin — NocoBase does it
> natively: add the association column (e.g. `Sản phẩm`) → its column ⚙ → **Title field** → pick the
> target field (e.g. `Đơn giá`) → rename/format. This works inside the widget (it reuses native columns).
> In CARD/LIST view, the title/subtitle/image/price selectors accept a related field directly
> (`Sản phẩm · Đơn giá`), fetched on demand.

## Bridge — link two blocks (line-item entry / cargo loading)

The widget is the "target". A **source block** (e.g. a Table of products) publishes events; the widget,
configured with the same **channel**, mutates its own rows.

### 1. Configure the widget (the target sub-table)

Field ⚙ → Cấu hình Sub-table Pro → **Kết nối block khác (bridge)**:

| Field | Meaning | Example |
|---|---|---|
| Bật nhận sự kiện | enable the subscription | on |
| Tên kênh | channel name (must match publisher) | `ch1` |
| Cột khóa khớp (FK) | the child-row column that stores the source id | `product_id` |
| Khóa trên bản ghi nguồn | field on the incoming record to match by | `id` |

Also set **Cột số lượng (+/−)** (e.g. `quantity`) so `add`/`inc`/`dec` bump quantity instead of
duplicating rows.

> **Cột/quan hệ khóa khớp** — pick the **relation** (e.g. `Sản phẩm`) here, not a raw FK. The bridge
> derives the FK (`product_id`) and also attaches the source record as the relation object so the
> product name/price show immediately.

### 2. Publish from the source block — NO CODE (recommended)

Two no-code ways, pick by source block type:

**(a) Any block with record actions (Grid Card / List / Table row)** — add the action
**"Gửi dòng qua kênh (bridge)"** to the card/row action area (same place you'd add a "JS action"), then in its
⚙ set **Tên kênh** = `ch1` and a **Kiểu nút** (control style):
- **Nút +/−** (default) — a joined − / + group per card. `+` adds/increments, `−` decrements (disabled when
  the item isn't in the target sub-table). Needs a **qty column** configured on the target sub-table widget.
- **Checkbox (thêm/bớt)** — check = add, uncheck = remove. Auto-reflects whether the item is already in the
  target (the target sub-table broadcasts its membership live). **No qty column needed.**
- **Nút đơn** — a single button that fires one configured action (Add / Reduce / Remove).

The checkbox/+/− stay in sync with the target sub-table no matter how it changed (bridge, manual edit, delete).

**(b) Table block only** — block ⚙ → **"Gửi dòng khi bấm (bridge)"** → enable + type the channel.
Then clicking any row publishes it (no per-row button).

### 2-alt. Publish from RunJS (if you prefer code)

```js
const bridge = (ctx.app && ctx.app.ptdlBridge) || window.__ptdlBridge;
bridge?.publish('ch1', { action: 'add', record: ctx.record });
```

`record` is the source row (e.g. a product `{ id, name, unit_price, ... }`). The widget takes
`record[sourceKey]` (`id`) and matches/sets it into the child relation `targetKey` (`product` → `product_id`).

### Event shape

```ts
bridge.publish(channel, { action, record, delta })
```

| action | effect on the target sub-table |
|---|---|
| `add` | matching row → qty +1; else push a new row (qty 1, FK = record id) |
| `inc` | matching row → qty += `delta` (default 1); else new row (qty = delta) |
| `dec` | matching row → qty −= `delta`; qty ≤ 0 removes the row |
| `remove` | remove the matching row |
| `set` | set the matching row's qty = `delta` |

Everything is **client-side, one browser tab** — no multi-device sync (that would be a future
WebSocket concern). Submit still goes through the native form action.

## Roadmap

- **v0** ✅ standalone widget (table view, picker, qty, submit nested) + totals.
- **v1** ✅ house-style config dialog, table/list/cards, qty +/− stepper.
- **v2** ✅ bridge (subscribe + add/inc/dec/remove by key).
- next: patch source-table selection-change to auto-publish (no RunJS); m2m through-qty; multi-device (WS).

Design & status: `docs/SUBTABLE-PRO-DESIGN.md`.
