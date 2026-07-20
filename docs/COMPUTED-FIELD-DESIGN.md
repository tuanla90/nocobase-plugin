# Computed Field — cột công thức lưu thật, tự cập nhật theo dependency (DESIGN)

> Tài liệu thiết kế (2026-07-14). Feature mở rộng cho `@tuanla90/plugin-formula`, lấy **Rollup**
> ([ROLLUP.md](../packages/@tuanla90/plugin-formula/ROLLUP.md)) làm hạt nhân và tổng quát hoá thành một
> **engine đồ thị phụ thuộc** đa-collection. Đọc trước khi code.

---

## 1. Bài toán & vì sao

User cần **cột thực (stored)** mà giá trị **tự tính lại mỗi khi bất kỳ dữ liệu nào công thức phụ
thuộc thay đổi** — kể cả xuyên quan hệ, nhiều tầng. Ví dụ chuẩn (bảng `order` ← hasMany `items`
(`order_item`) → belongsTo `product`):

```
   product.unit_price ──(lookup)──┐
                                  ▼
order_item.quantity ──(local)──► order_item.line_amount = quantity × product.unit_price
                                  │
                                  └──(aggregate: SUM items)──► order.subtotal
                                                                    │
                                  order.discount ──(local)──┐       │(local)
                                                            ▼       ▼
                                                order.total_amount = subtotal − discount
```

Các kịch bản phải phủ:
1. Sửa `order.discount` → `total_amount` tính lại.
2. Đổi `order_item.quantity` → `line_amount` → `order.subtotal` → `order.total_amount`.
3. Đổi `product.unit_price` → **mọi** `order_item` trỏ tới product đó tính lại `line_amount` → subtotal → total (fan-out).
4. Thêm / xoá 1 `order_item` → subtotal → total.

### Vì sao không có giải pháp có sẵn nào đủ

| Giải pháp | Thiếu gì |
|---|---|
| **AppSheet — app formula trên real column** | *"columns with app formulas that depend on other rows (SELECT/LOOKUP) don't automatically update if the other rows change"* → chỉ tính lại theo **dòng của chính nó**, không lan cross-row. |
| **AppSheet — virtual column** | Tính được cross-row nhưng **không lưu**, tính lại **toàn bộ mỗi lần sync**, **cục bộ theo user** → không query/sort/filter/export trên DB, chậm khi nhiều. |
| **NocoBase core `@nocobase/plugin-field-formula`** | Lưu thật nhưng **chỉ cùng 1 record** (`record.toJSON()` của chính nó, không load quan hệ), chỉ chạy khi record **cha** save; không aggregate to-many, không nhảy khi con/lookup đổi (xem [ROLLUP.md §1](../packages/@tuanla90/plugin-formula/ROLLUP.md); issue nocobase#3514 "Formula field not update"). |
| **NocoBase Workflow (Collection event)** | Phải nối tay nhiều workflow; **không có đồ thị phụ thuộc / thứ tự chuỗi**; **dễ lặp vô hạn** (không cơ chế chống đệ quy); **bulk & association không trigger**; **thao tác DB trực tiếp không trigger** (chỉ qua HTTP app). |
| **@tuanla90 Rollup (hiện có)** | Đúng pattern (field thật + hook con + afterCommit + `hooks:false`) nhưng **chỉ 1 mức aggregate** — không có công thức số học cùng dòng, không lookup, không chuỗi nhiều tầng. |

→ **Computed Field** = *cột thật lưu DB* (query được như real column) **+** *khả năng lan cross-row
nhiều tầng* (điểm mạnh của virtual column) **+** *incremental* (chỉ tính dòng bị ảnh hưởng, không
tính lại toàn bộ như AppSheet).

---

## 2. Trạng thái & tài sản tái dùng

Feature này **không viết từ đầu** — hợp nhất 2 engine server đã chạy production trong repo:

| Tài sản có sẵn | Cho ta cái gì | File |
|---|---|---|
| **Rollup** (`RollupManager`) | Hook con `afterCreate/Update/Destroy` + snapshot FK cũ/mới (re-parent) + `afterCommit` + `recomputeParent` + `hooks:false` + backfill action | [rollup.ts](../packages/@tuanla90/plugin-formula/src/server/rollup.ts), [plugin.ts](../packages/@tuanla90/plugin-formula/src/server/plugin.ts) |
| **AI Autorun** (`ptdlAiAutorun`) | **Gần như đúng engine cần**: config-collection + `autorunCache` Map + hook idempotent per-collection + gate `dependsOn` bằng `model.changed()` + `tx.afterCommit` + **throttle queue** coalesce theo record + `hooks:false` | [ai-column/server/index.ts:965-1032](../packages/@tuanla90/plugin-ai-column/src/server/index.ts) |
| **Formula engine** | `evaluateFormula(formula, data)` — ~400 hàm Excel, **JS thuần, không React → chạy server được**; auto-pluck proxy hiểu `data.items.line_amount` | [formulaEngine.ts:165-176](../packages/@tuanla90/plugin-formula/src/shared/formulaEngine.ts) |
| **Change-log** (`ptdlChangeLogConfigs`) | Bản tham chiếu **sạch nhất** cho config-collection + cache + invalidate hook + enforce hook | [change-log/server/plugin.ts:35-79](../packages/@tuanla90/plugin-change-log/src/server/plugin.ts) |

**Cái mới phải viết:** (a) **đồ thị phụ thuộc đa-collection** + phát hiện chu trình; (b) **cascade
topo trong bộ nhớ** (computed→computed) thay vì để hook DB tự nối (sẽ lặp); (c) loại dep **lookup**
(to-one) với fan-out; (d) đánh giá công thức bằng `evaluateFormula` phía server.

---

## 3. Quyết định kiến trúc: rule lưu ở đâu? (user hỏi "tư vấn giúp")

Trong repo có **đúng 2 blueprint** cho "global rule" server-enforced:

- **B1 — rule nằm trong `field.options.<key>`**, server `scan()` mọi field lúc `afterStart` + rescan
  `fields.afterSave/*`. Dùng bởi **Rollup** (`field.options.ptdlRollup`) và **status-flow**
  (`field.options.statusFlow`, enforce ở `beforeCreate/beforeUpdate/beforeBulkUpdate`).
- **B2 — rule nằm trong collection cấu hình riêng** (`ptdlXxxConfigs`, key `collectionName` + field
  JSON), nạp vào `Map` in-memory, invalidate bằng hook `<config>.afterSave/afterDestroy`, enforce
  bằng hook `<targetCol>.afterCreate/afterUpdate`. Dùng bởi **change-log** (`ptdlChangeLogConfigs`)
  và **AI autorun** (`ptdlAiAutorun`).

> **Lưu ý về "plugin sửa title":** đó là **`plugin-custom-header`**, toggle *"Áp dụng mọi view (mặc
> định field)"* — lưu global rule trong collection riêng **`ptdlFieldStyles`**
> ([custom-header/server/plugin.ts:10-24](../packages/@tuanla90/plugin-custom-header/src/server/plugin.ts)),
> tức là **blueprint B2**. Nhưng nó **enforce phía CLIENT** (client cache rows rồi apply khi render) —
> KHÔNG hợp cho Computed Field, vì ta cần giá trị đúng **cả khi không mở form / qua API / bulk / import**.

### → Khuyến nghị: **B2 — collection riêng `ptdlComputedRules`**, nhưng **enforce phía SERVER** (clone AI autorun)

Lý do chọn B2 thay vì B1:
1. **Khớp đúng mental model của user** ("save as global rule giống plugin sửa title" = custom-header dùng collection riêng).
2. **Đồ thị phụ thuộc là chuyện của một registry trung tâm** — gom mọi rule 1 chỗ để dựng DAG, phát
   hiện chu trình, sort topo dễ hơn nhiều so với đi quét `field.options` rải rác khắp các collection.
3. **AI autorun đã chứng minh B2 chạy server-enforced** với `targetField` + `dependsOn` + `afterCommit`
   + throttle queue — ta gần như clone lại, thêm phần đồ thị.
4. **Quản trị**: list / bật-tắt / sắp thứ tự / xem sơ đồ phụ thuộc → cần một collection, không thể làm gọn trên field.options.

> **Ngoại lệ nên cân nhắc B1:** nếu muốn Computed Field xuất hiện như một **field interface** trong
> Collection manager ("Add field → Computed") giống hệt Rollup, có thể lưu **kép**: rule vẫn ở
> `ptdlComputedRules` (nguồn sự thật cho engine), còn field interface chỉ là UI ghi vào đó. Cột đích
> **luôn phải là field thật** (type số) để lưu/query — điều này đúng với cả B1 lẫn B2.

**"Global rule" nghĩa là gì ở đây:** rule sống trong DB (`ptdlComputedRules`), áp cho **mọi dòng, mọi
block, mọi API path**, server tự thực thi và tự nạp lại khi rule đổi. Định nghĩa **1 lần** → hiệu lực
toàn hệ thống — đúng tinh thần "save as global rule" user muốn.

### 3.1. Nơi LƯU ≠ nơi NHẬP (nhập ngay tại ⚙ config của cột)

Storage là `ptdlComputedRules`, nhưng **UI nhập đặt ngay trong ⚙ config của cột** (không cần màn admin
riêng) — **đúng pattern `plugin-custom-header`**: config nằm trong flow-settings của cột, khi bấm lưu thì
`api.request({ url: 'ptdlComputedRules:updateOrCreate', params:{ filterKeys:['dataSourceKey','collectionName','targetField'] }, values })`
([customHeader.tsx:488-516](../packages/@tuanla90/plugin-custom-header/src/shared/customHeader.tsx) ghi vào `ptdlFieldStyles`
theo cùng cách). Mở lại dialog → prefill bằng cách đọc rule hiện có (client cache + `ptdlComputedRules:list`,
refresh khi refocus tab như [customHeader.tsx:149-165](../packages/@tuanla90/plugin-custom-header/src/shared/customHeader.tsx)).

- **Điểm nhập** = step "Công thức (tự cập nhật)" trên ⚙ của **cột gắn field số thật** (giống Rollup interface
  [rollupInterface.tsx](../packages/@tuanla90/plugin-formula/src/client-v2/rollupInterface.tsx)). Cột đích **bắt buộc là
  field stored** (double/integer/bigInt) để ghi + query/sort/filter được.
- **`targetField`** suy ra từ chính field của cột đang cấu hình → user chỉ nhập `formula` + (tuỳ chọn) `deps`.
- Khác với custom-header ở chỗ **enforce phía server** (engine đọc collection), không chỉ client-render.

---

## 4. Config shape

### 4.1. Collection `ptdlComputedRules` (clone `ptdlAiAutorun`)

```jsonc
{
  "key": "main:order.total_amount", // unique = `${dataSourceKey}:${collectionName}.${targetField}`
  "dataSourceKey": "main",
  "collectionName": "order",        // collection chứa cột đích
  "targetField": "total_amount",    // FIELD THẬT (double/integer/bigInt) sẽ được ghi
  "formula": "data.subtotal - data.discount", // ⚠️ field qua `data.` (ghi chú dưới); eval = evaluateFormula
  "deps": [ /* xem 4.2 */ ],        // json — khai báo tay HOẶC auto-detect từ formula
  "runOn": "both",                  // create | update | both
  "enabled": true,
  "onError": "null"                 // null | keep (giữ giá trị cũ) — lưu marker + log
}
```

> **⚠️ Cú pháp field = `data.<field>`** (vd `data.subtotal`, `data.quantity`, quan hệ `data.product.unit_price`),
> KHÔNG bare `subtotal` — engine compile `new Function('data','value','record', …)`. Nhất quán với formula
> column/field sẵn có. (Các ví dụ dạng `subtotal − discount` ở §1/§4.2 là mô tả khái niệm, khi cấu hình thêm `data.`.)

### 4.2. `deps` — 4 loại phụ thuộc (bản đầu hỗ trợ **đủ cả 4**, theo lựa chọn của user)

```jsonc
// order_item.line_amount = quantity * product.unit_price
"deps": [
  { "kind": "local",  "field": "quantity" },
  { "kind": "lookup", "relation": "product", "field": "unit_price" }
]

// order.subtotal = SUM(items.line_amount)
"deps": [ { "kind": "aggregate", "relation": "items", "fn": "sum", "field": "line_amount" } ]

// order.total_amount = subtotal - discount
"deps": [ { "kind": "local", "field": "subtotal" }, { "kind": "local", "field": "discount" } ]
```

| kind | Ý nghĩa | Trường |
|---|---|---|
| `local` | field cùng dòng trên chính `collectionName` | `field` |
| `aggregate` | gộp qua field **hasMany/hasOne** (kế thừa Rollup) | `relation`, `fn`(sum/count/avg/min/max), `field` |
| `lookup` | kéo field qua **belongsTo/hasOne** (to-one) | `relation`, `field` |
| `chained` | (không khai báo tay) — sinh tự động khi `field` trong `local/aggregate/lookup` **lại là** một `targetField` computed khác | engine tự nối |

> **Auto-detect (khuyến nghị bật cho `local`):** bóc các tham chiếu `data.<field>` / `data.<rel>.<field>`
> từ formula bằng chính cấu trúc auto-pluck của [formulaEngine.ts:78-99](../packages/@tuanla90/plugin-formula/src/shared/formulaEngine.ts);
> `aggregate/lookup` nên **khai báo tay** để chắc chắn phân biệt to-many vs to-one.

> **`lookup` phủ luôn "roll-down" (cha → con):** to-one có thể trỏ tới **bảng tham chiếu** (`item→product`)
> HAY tới **cha** (`item→order`) — belongsTo là belongsTo. Vd `item.unit_price` khai
> `{ "kind":"lookup", "relation":"order", "field":"price_policy" }` → đổi `order.price_policy` fan-out ra
> **mọi item của order** (xem §6.1). **Multi-hop** (`item→order→policy_table`) = tách thành chuỗi computed
> từng chặng (order có `effective_rate` lookup từ policy; item lookup `order.effective_rate`) — cascade tự
> nối. Engine chỉ hiểu **single-hop**; độ sâu đến từ việc nối chuỗi (đúng mô hình spreadsheet).

---

## 5. Engine: đồ thị phụ thuộc + dirty-set + cascade topo

### 5.1. Dựng đồ thị (lúc `afterStart` + mỗi `ptdlComputedRules.afterSave/afterDestroy`)

```
node  = (collectionName, targetField)                    // mỗi rule = 1 node
edge  = node C ──depends-on──► nguồn của từng dep trong C.deps
        - local(f):      (C.collection, f)               // cùng collection
        - aggregate(rel,f): (childCollection(rel), f)    // sang collection con
        - lookup(rel,f):    (targetCollection(rel), f)   // sang collection cha của quan hệ

Dựng xong:
  - TOPO SORT toàn đồ thị. Nếu có CHU TRÌNH → từ chối rule vừa lưu (trả lỗi rõ ràng).
    (Đây là thứ workflow-tay không bao giờ kiểm được → nguồn gốc lặp vô hạn.)
  - Lưu reverse-edges: dependents(node) = ai đọc node này (để cascade).
  - ensureHooks(): với mỗi collection xuất hiện ở bất kỳ node/edge nào → gắn hook idempotent
    (clone ensureAutorunListener: afterCreateWithAssociations + afterUpdate + afterDestroy).
```

### 5.2. Thu "dirty" trong transaction (hook chỉ **snapshot + enqueue**, KHÔNG tính ngay)

Clone [ai-column ensureAutorunListener:986-1017](../packages/@tuanla90/plugin-ai-column/src/server/index.ts) — snapshot NGAY (pk, `model.changed()`, `values`, và **FK cũ/mới** như [rollup onChildChange:108-119](../packages/@tuanla90/plugin-formula/src/server/rollup.ts)), rồi `tx.afterCommit`:

```
seedDirty(change):
  # local: dòng R của T đổi base field f
  for C in computedOn(T) where C has local dep on f (và f ∈ changed):
      dirty.add(T, R.pk, C.field)

  # aggregate: con của quan hệ rel đổi field cf / created / destroyed / reparent
  parents = { curFK, prevFK≠curFK }                      # rollup đã làm: refresh cả cha cũ
  for C where C has aggregate dep (rel, cf):
      for P in parents: dirty.add(parentCollection, P, C.field)

  # lookup: dòng target của to-one đổi field tf  → FAN-OUT
  for C where C has lookup dep (rel, tf) and tf ∈ changed(target):
      rows = T.find({ [FK(rel)]: target.pk })            # mọi dòng trỏ tới target
      for R in rows: dirty.add(T, R.pk, C.field)
  # và: dòng R của T tự đổi FK(rel) → dirty.add(T, R.pk, C.field)
```

### 5.3. Xử lý dirty theo **thứ tự topo** + cascade in-memory (afterCommit)

```
processDirty():                                # chạy trong throttle queue, sau commit
  while dirty not empty:
    node C = pop theo TOPO ORDER               # line_amount trước subtotal trước total
    rows  = dirty rows của C
    for R in rows (gom theo lô):
        data   = load R + các relation/lookup C cần (chỉ field cần)
        newVal = evaluateFormula(C.formula, data)         # engine dùng chung
        if newVal !== oldVal(R, C.field):
            writeback.add(C.collection, R.pk, C.field, newVal)   # gom để ghi 1 lần
            # CASCADE: đẩy dependents vào dirty NGAY TRONG BỘ NHỚ (không qua hook DB)
            for D in dependents(C):
                affected = resolveAffected(D, C, R)  # aggregate→parent key; lookup→rows trỏ tới; local→cùng dòng
                for A in affected: dirty.add(D.collection, A, D.field)
    flush writeback theo (collection,row): parentRepo.update({ values:{…nhiều field…}, hooks:false })
```

**Vì sao cascade phải in-memory, không để hook DB tự nối:** vì writeback dùng `hooks:false` (chống
lặp — [rollup.ts:165](../packages/@tuanla90/plugin-formula/src/server/rollup.ts),
[ai-column:1019-1020](../packages/@tuanla90/plugin-ai-column/src/server/index.ts)). Nếu bật hook để nối
thì sẽ **lặp vô hạn**. Đồ thị **không chu trình** (đã kiểm ở 5.1) đảm bảo vòng `while` hội tụ.

**Tối ưu:** nhiều computed field cùng 1 dòng (vd `subtotal` và `total`) → gom vào **một** câu
`update({values:{subtotal, total}})`; topo đảm bảo subtotal tính trước total.

**Correctness cho roll-up NHIỀU TẦNG (2-3 lần):** `aggregate` dep **đọc lại DB** (như `recomputeParent`
của Rollup), KHÔNG đọc giá trị in-memory → phải **ghi xong tầng N rồi mới aggregate tầng N+1**. Vì vậy
xử lý **theo bậc topo và flush writeback của node trước khi tính dependents của nó**. Đảm bảo được điều
này thì độ sâu **không giới hạn**: `item.line_amount → order.subtotal → customer.total → region.total …`
mỗi tầng là 1 aggregate computed, cascade lan tới khi cạn. (`local`/`lookup` dùng data đã load nên không
cần chờ; chỉ `aggregate` cần "flush-trước-đọc-sau".)

### 5.4. Backfill (drift / import / ghi DB trực tiếp)

Tổng quát hoá [ptdlRollup:recompute](../packages/@tuanla90/plugin-formula/src/server/plugin.ts) thành
`POST /api/ptdlComputed:recompute?collection=&field=` → duyệt toàn bảng theo topo, tính lại tất cả.
Gọi tự động 1 lần khi **lưu/bật** một rule mới (giống Rollup backfill lúc tạo field).

---

## 6. Data flow theo đúng ví dụ Order (mọi kịch bản)

| Thao tác | Hook bắt | Dirty seed | Cascade (topo) | Ghi |
|---|---|---|---|---|
| Sửa `order.discount` | `order.afterUpdate`, `changed=['discount']` | (order, id, total) | — | total |
| Đổi `order_item.quantity` | `order_item.afterUpdate`, `changed=['quantity']` | (item, id, line_amount) | line_amount→(order subtotal)→(order total) | line_amount; rồi subtotal+total của cha |
| Đổi `product.unit_price` | `product.afterUpdate`, `changed=['unit_price']` | fan-out: (item, mọi id trỏ product, line_amount) | mỗi item → cha subtotal → total | line_amount hàng loạt; subtotal+total các cha |
| Thêm/Xoá `order_item` | `order_item.afterCreateWithAssociations` / `afterDestroy` | (order, parentFK, subtotal) | subtotal→total | subtotal+total |
| Dời item sang order khác | `order_item.afterUpdate` (FK đổi) | (order, curFK, subtotal) + (order, prevFK, subtotal) | mỗi cha subtotal→total | subtotal+total của **cả 2** cha |
| **Roll-down**: đổi `order.price_policy` | `order.afterUpdate`, `changed=['price_policy']` | fan-out: (item, **mọi** id của order, unit_price) | unit_price→line_amount→subtotal→total | unit_price+line_amount mỗi item; rồi subtotal+total của order |

### 6.1. Roll-up NHIỀU TẦNG & ROLL-DOWN — cùng một engine

Không cần cơ chế riêng; cả hai chỉ là hệ quả của **đồ thị + cascade topo**.

**Roll-up N tầng** (mỗi tầng là 1 `aggregate` computed, độ sâu không giới hạn):
```
item.qty ↓ → item.line_amount → order.subtotal (SUM items) → customer.total (SUM orders) → region.total (SUM customers)
```
Đổi 1 item lan hết chuỗi. Điều kiện đúng: **ghi xong tầng N rồi mới aggregate tầng N+1** (§5.3) vì
aggregate đọc lại DB. Cạm bẫy hội tụ = đồ thị acyclic (§5.1).

**Roll-down** (cha đổi → mọi con tính lại) = **`lookup` trỏ lên cha**, rồi thường **cuộn ngược lên**:
```
order.price_policy ─(lookup item→order)─► item.unit_price → item.line_amount ─(aggregate)─► order.subtotal → order.total
```
Đây là **DAG hợp lệ**: `price_policy` là input, còn `subtotal`/`total` là field **khác** → không tạo vòng.
Fan-out = số item của order (nhỏ). Nếu chính sách nằm ở **bảng dùng chung** (đổi 1 policy đụng nhiều order)
→ fan-out 2 tầng (policy→order→item): tách mỗi chặng thành 1 lookup computed (§4.2) + batch (§7.7).

1. **FK-move phải hook `afterUpdate` RAW**, KHÔNG `afterUpdateWithAssociations` — bản WithAssociations
   bắn trên instance đã reload → mất `previous(fk)` → cha cũ không nhảy ([ROLLUP.md §6.1-6.2](../packages/@tuanla90/plugin-formula/ROLLUP.md)).
2. **Snapshot `get(fk)` + `previous(fk)` + `changed()` NGAY trong handler**, trước `afterCommit`
   (Sequelize reset sau commit).
3. **`afterCommit`** để đọc state đã commit (nhất là afterDestroy — dòng đã xoá; aggregate mới đúng).
4. **`hooks:false`** khi writeback + **cascade in-memory** (không hook) → chống lặp. Không có cái này là loop.
5. **Node 24: callback `afterCommit` phải SYNC + async detach + tự catch** — unhandled rejection làm
   crash process ([ai-column:983-1010](../packages/@tuanla90/plugin-ai-column/src/server/index.ts)). Dùng **throttle queue** (coalesce theo `col:pk`) để burst không xếp chồng.
5. **Phát hiện chu trình lúc lưu rule** — từ chối rule tạo vòng (A→B→A). Bắt buộc, nếu không cascade không hội tụ.
7. **Fan-out lookup có thể rất lớn** (đổi 1 đơn giá đụng ngàn item) → gom lô, cân nhắc chạy nền cho cột "nặng".
8. **`evaluateFormula` tham chiếu field qua `data.x`** (không bare `x`) vì compile `new Function('data','value','record',…)` ([formulaEngine.ts:169](../packages/@tuanla90/plugin-formula/src/shared/formulaEngine.ts)).
9. **Bundle server phải kèm `shared/formulaEngine.ts`** (+ vendored formulajs UMD) — hiện server lane
   chỉ build `rollup.ts`. Engine là JS thuần nên chạy Node OK, chỉ là vấn đề đóng gói.
10. **Cột đích để read-only trong form** (như [rollupInterface.tsx:24-27](../packages/@tuanla90/plugin-formula/src/client-v2/rollupInterface.tsx)) — tránh user gõ đè.
11. **Chỉ hasMany/hasOne cho aggregate; belongsTo/hasOne cho lookup.** m2m (belongsToMany) hoãn (through/otherKey khác).

---

## 8. So sánh (nhắc lại, để quyết định)

| Tiêu chí | AppSheet real | AppSheet virtual | NocoBase formula field | Workflow tay | **Computed Field** |
|---|---|---|---|---|---|
| Lưu cột thật (query/sort/filter) | ✅ | ❌ | ✅ | ✅ | ✅ |
| Cùng dòng | ✅ | ✅ | ✅ | ✅ | ✅ |
| Aggregate to-many | ⚠️ | ✅ | ❌ | ⚠️ tay | ✅ |
| Lookup to-one, đổi là lan | ❌ | ⚠️/sync | ❌ | ⚠️ tay | ✅ (fan-out) |
| Chuỗi nhiều tầng, đúng thứ tự | ❌ | ⚠️ | ❌ | ❌ | ✅ topo |
| Bulk / import / API | — | — | ❌ | ❌ | ✅ (hook + backfill) |
| Chống lặp | — | — | ⚠️ | ❌ | ✅ (2 lớp + acyclic) |
| Chi phí tính | rẻ | **đắt (toàn bộ/sync)** | rẻ | phình theo #rule | **incremental** |

---

## 9. Lộ trình (checklist từng phase)

### Phase 1 — Local computed ✅ ĐÃ XONG (build OK, smoke-test Node 4/4) — xem [../packages/@tuanla90/plugin-formula/COMPUTED-FIELD.md](../packages/@tuanla90/plugin-formula/COMPUTED-FIELD.md)
- [x] Collection `ptdlComputedRules` + `acl.allow(...,'loggedIn')` + action `ptdlComputed:recompute` → [server/plugin.ts](../packages/@tuanla90/plugin-formula/src/server/plugin.ts).
- [x] `ComputedManager`: `loadRules()` → `Map<collection, rules[]>`, invalidate `ptdlComputedRules.afterSave/afterDestroy` → [server/computed.ts](../packages/@tuanla90/plugin-formula/src/server/computed.ts).
- [x] Server lane bundle `shared/formulaEngine.ts` — **inline `escapeHtml`** (bỏ import `@tuanla90/shared`; server-build chỉ bundle `main` → subpath sẽ thiếu runtime).
- [x] **Đổi hướng vs plan gốc**: local same-row dùng **`beforeSave` + `instance.set`** (1 lần ghi, trả về ngay, không deadlock/loop) — như NocoBase core formula field. `afterCommit`/queue/cascade để Phase 2 (cross-row). Gate `changed()` cho local deps.
- [x] UI: step "Giá trị tự tính" trên ⚙ cột (client-v2) → `ptdlComputedRules:updateOrCreate` → [computedRuleClient.tsx](../packages/@tuanla90/plugin-formula/src/shared/computedRuleClient.tsx). ⚠️ chưa verify browser thật. **Giải quyết** `total = data.subtotal − data.discount`.

### Phase 2 — Đồ thị + aggregate + chained ✅ ĐÃ XONG (e2e 30/30) — xem [../packages/@tuanla90/plugin-formula/COMPUTED-FIELD.md](../packages/@tuanla90/plugin-formula/COMPUTED-FIELD.md)
- [x] DAG + topo `rank` + **phát hiện chu trình** (rule tạo vòng bị disable, server không sập) — [computed.ts](../packages/@tuanla90/plugin-formula/src/server/computed.ts) `buildGraph`/`detectCycles`.
- [x] `aggregate` dep qua công thức `SUM(data.items.line_amount)` — **roll-up mọi độ sâu** (SUM-of-SUMs item→order→customer verified). Rollup cũ coexist.
- [x] **`runCascade` worklist theo topo rank** (KHÔNG đệ quy+visited — xem cạm bẫy fan-out); **nối** `line_amount → subtotal → total`.
- [x] `ptdlComputed:recompute` (backfill topo) + client auto-backfill khi lưu rule.

### Phase 3 — Lookup fan-out + roll-down ✅ ĐÃ XONG (e2e 30/30)
- [x] `lookup` dep: hook target + fan-out mọi dòng trỏ tới. **Đổi `product.unit_price` lan đúng** (fan-out) + **roll-down** `order.price_policy → items`.
- [x] Auto-derive deps từ formula (`data.rel.field`) → UI chỉ cần ô công thức.
- [ ] (còn) Debounce/batch fan-out lớn (hiện O(n²) chọn min-rank + fan-out tuần tự); UI sơ đồ phụ thuộc; lane classic; belongsToMany; multi-hop lookup (hiện nối chuỗi computed).

---

## 10. Build / deploy / test (theo [ROLLUP.md §9](../packages/@tuanla90/plugin-formula/ROLLUP.md))

```bash
cd build-env
bash recipes/run-formula-build.sh                 # sync src → build 3 lane
bash recipes/add-markers.sh storage/tar/@tuanla90/plugin-formula-<ver>.tgz
# deploy tgz → node_modules/@tuanla90/ (nb-local); server lane đổi → PHẢI restart
cd ../../nb-local && npx pm2 restart index
```
> Nhớ **verify markers trên đúng version vừa build** (bẫy `find|head -1` chèn marker vào tgz cũ nhất — memory `build-marker-tgz-trap`) và **verify bundle server đã kèm formulaEngine** (grep chuỗi trên bundle đã giải nén).

**Test e2e tối thiểu** (mở rộng bộ test Rollup `rollup_order`/`rollup_item`, thêm `product`): sửa discount · đổi quantity · đổi product.unit_price (fan-out) · thêm/xoá item · dời item · rule tạo chu trình (phải bị từ chối) · backfill.

---

## 11. Tham chiếu

**Code trong repo:**
- Rollup engine: [packages/@tuanla90/plugin-formula/src/server/rollup.ts](../packages/@tuanla90/plugin-formula/src/server/rollup.ts), [ROLLUP.md](../packages/@tuanla90/plugin-formula/ROLLUP.md)
- AI Autorun (precedent gần nhất): [packages/@tuanla90/plugin-ai-column/src/server/index.ts:965-1032](../packages/@tuanla90/plugin-ai-column/src/server/index.ts) (+ collection def ~1127-1140)
- Config-collection + cache + hook (bản sạch): [packages/@tuanla90/plugin-change-log/src/server/plugin.ts:35-79](../packages/@tuanla90/plugin-change-log/src/server/plugin.ts)
- "Save as global rule" (custom-header / `ptdlFieldStyles`, **client-enforced**): [packages/@tuanla90/plugin-custom-header/src/server/plugin.ts:10-24](../packages/@tuanla90/plugin-custom-header/src/server/plugin.ts), [customHeader.tsx:470-516](../packages/@tuanla90/plugin-custom-header/src/shared/customHeader.tsx)
- Field-options + enforce hook (status-flow): [packages/@tuanla90/plugin-status-flow/src/server/plugin.ts](../packages/@tuanla90/plugin-status-flow/src/server/plugin.ts)
- Formula engine: [packages/@tuanla90/plugin-formula/src/shared/formulaEngine.ts](../packages/@tuanla90/plugin-formula/src/shared/formulaEngine.ts)

**Ngoài (nghiên cứu):**
- AppSheet — Use virtual columns: https://support.google.com/appsheet/answer/10106758
- AppSheet — Define app formulas and initial values: https://support.google.com/appsheet/answer/10106437
- NocoBase — Collection Events trigger: https://docs.nocobase.com/workflow/triggers/collection
- NocoBase — Update Record node: https://docs.nocobase.com/handbook/workflow/nodes/update/
- NocoBase — `@nocobase/plugin-field-formula`: https://www.npmjs.com/package/@nocobase/plugin-field-formula (giới hạn same-record; issue nocobase#3514)
