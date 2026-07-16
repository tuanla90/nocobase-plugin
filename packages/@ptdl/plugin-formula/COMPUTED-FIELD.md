# Computed field — tài liệu (đọc trước khi improve)

Feature thêm vào `@ptdl/plugin-formula` (2026-07-14). **Đủ 3 loại dep: local + aggregate + lookup** —
cascade nhiều tầng, roll-down, fan-out. Là **lane SERVER thứ 2** của plugin (sau Rollup). Thiết kế đầy
đủ: [../../../docs/COMPUTED-FIELD-DESIGN.md](../../../docs/COMPUTED-FIELD-DESIGN.md).

> **VERIFIED LIVE trên nb-local — 30/30 e2e:** local (sửa discount) · chain 3 tầng
> (qty→line_amount→subtotal→total) · lookup **fan-out** (đổi product.unit_price → mọi item) ·
> **roll-down** (đổi order.price_policy → mọi item) · aggregate add/xóa item · **reparent** (2 order
> cùng cập nhật) · **roll-up nhiều tầng SUM-of-SUMs** (item→order→customer) · cycle bị **từ chối** (không sập).

---

## 1. Bài toán & vì sao

Cột **thật (stored)** tự tính lại từ công thức Excel, đồng bộ **mọi đường ghi** (form, quick-edit, API,
bulk create, import) và **khi dữ liệu liên quan đổi** — kể cả xuyên quan hệ, nhiều tầng. Cấu hình **1 lần**
như global rule, nhập tại **⚙ của cột**.

- Built-in `@nocobase/plugin-field-formula`: same-row + lưu, nhưng chỉ cùng record, không quan hệ/cascade.
- Rollup (rollup.ts): aggregate 1 tầng — bù trợ; giờ là một trường hợp của `aggregate` dep.
- Không tool có sẵn nào làm cross-row nhiều tầng vào cột thật (xem so sánh trong design doc).

---

## 2. Trạng thái

| Phần | Trạng thái |
|---|---|
| Engine server (`ComputedManager`): graph + cycle detect + topo + cascade worklist + backfill | ✅ XONG — **e2e 30/30 live** |
| `local` (cùng dòng) — `beforeSave` + `instance.set` (1 lần ghi, tức thì) | ✅ |
| `aggregate` (SUM/…/COUNT qua hasMany/hasOne) — roll-up **mọi độ sâu** | ✅ (SUM-of-SUMs verified) |
| `lookup` (belongsTo/hasOne) — **fan-out** + **roll-down** (trỏ lên cha) | ✅ |
| Auto-derive deps từ formula (`data.rel.field`) — UI chỉ cần ô công thức | ✅ |
| Cycle detection (từ chối rule tạo vòng, không sập) | ✅ |
| **UI quản lý = Settings page** "Công thức tự tính" (client-v2 `/v/` + classic `/admin`) — bảng rule + modal pickers (collection/field) + trợ giúp công thức + chèn field + **DAG SVG** | ✅ **verified /v/ (user screenshot)**; classic built; DAG data verified (`ptdlComputed:graph`) |
| **Column ⚙ "Giá trị tự cập nhật (công thức)"** — bê **NGUYÊN editor của Settings page** (`ComputedRuleEditor` dùng chung: toolbar chèn field/quan-hệ + chèn bảng tra-cứu + Ví dụ + hàm + **AI viết hộ** + multi-check triggers + Khi lỗi + Chạy thử), chỉ ẩn 2 picker bảng/cột (đã biết từ cột). Chỉ trên `TableColumnModel` | ✅ verified live (dialog mở qua `openStepSettingsDialog('ptdlComputedRule','rule')`, đủ toolbar/AI/triggers/onError/run) |
| **Form/Edit/Detail: icon 🧮 công thức, mode-aware + gated** (KHÔNG có dialog config ở field ⚙ — chỉ table-column ⚙ có, theo [[reference_nocobase_v2_ui_extension_gotchas]]). Cột computed hiện icon `CalculatorOutlined` + tooltip "Computed value (server): \<formula\>". **Bấm-sửa được CHỈ khi: (1) field editable (patch `render` = form/edit) VÀ (2) user là admin (`allowAll`) hoặc có quyền quản lý data source (`pm.data-source-manager` snippet, kiểm qua `roles:check` lúc load, fail-closed)** → mở Modal `ComputedRuleEditor` dùng chung (prefill, ẩn 2 picker, lưu ngay + recompute). Mọi trường hợp khác (view/detail, hoặc user thường) → **chỉ hover xem**. Patch MỌI field-model (guard no-op); resolve `collectionField` từ `.parent` FormItemModel; hook `registerModels` cho class đăng ký muộn; save vẫn theo ACL `ptdlComputedRules` — xem [[reference_nocobase_v2_field_render_patching]] | ✅ verified live (root: icon `cursor:pointer`+onClick, tooltip có "(click to edit)" → modal prefill `data.quantity*data.product.unit_price`, toolbar/AI/triggers/run đủ, picker ẩn, bấm Lưu → toast "Saved" + đóng) |
| **Auto-refresh** block sau khi sửa (khỏi F5) — axios 220ms **+ WebSocket `ptdl:live-refresh`** (server báo khi tính xong) → `refreshFlowBlocks` (đệ quy `.subModels`) | ✅ verified live e2e (WS round-trip: browser nhận push, block tự nhảy không F5) |
| **AI viết hộ** — nút `RobotOutlined` trong modal. 4 công cụ, TẤT CẢ tự Chạy thử + sửa lỗi ≤3 lần: **viết** (mô tả→công thức), **gợi ý 3 phương án**, **giải thích** công thức đang có, **AI sửa lỗi** công thức. Reuse `@nocobase/plugin-ai` + `src/shared/formulaKnowledge.ts` (few-shot+hàm+luật, dùng chung UI popover & prompt) | ✅ verified live (viết/suggest/explain/fix đều đúng field thật, pass Chạy thử) |
| Server actions: `ptdlComputed:recompute` · `:collections` · `:graph` · `:test` · `:aiWrite`(+fix) · `:aiSuggest` · `:aiExplain`; `ptdlComputedRules` CRUD | ✅ verified |
| **Live preview trong form (v0.1.23)** — cột computed trong form Create/Edit hiện badge **`≈ <số>`** tính NGAY TRÊN CLIENT bằng cùng engine (`evaluateFormula` isomorphic) trên giá trị form CHƯA save: local = form values (gõ là nhảy); to-many = rows sub-table trong form (kể cả chưa save, tự tính computed con 1 tầng) hoặc fetch children đã lưu; to-one = object từ picker hoặc fetch theo FK (cache); bảng tra cứu = fetch 1 lần (cache). Reactive qua `FormBlockModel.formValueRuntime.formValues` (proxy observable) + `observer`. KHÔNG ghi vào form values (server vẫn là nguồn chân lý); ẩn khi: ngoài form / rule không fire ở ngữ cảnh này (gating theo triggers create vs update,source) / đang fetch / bằng giá trị hiện tại / lỗi eval. **v0.1.26: cell sạch icon + editor ở ⚙ cột sub-table** — 🧮 KHÔNG render trong CELL nữa (gate: `context.fieldIndex` có row segment HOẶC parent gần là `*ColumnModel`; form item đơn vẫn giữ icon); bù lại flow `ptdlComputedRule` đăng ký thêm lên **`SubTableColumnModel`** (KHÔNG kế thừa TableColumnModel nên phải đăng ký riêng) → menu ⚙ cột sub-table có "Giá trị tự cập nhật (công thức)" mở full editor. **v0.1.25: preview THAY HẲN số trong ô** (user chọn "nhìn như đã save", user-base đã aware): khi preview ≠ số đã lưu, control gốc bị ẩn (`display:none` — vẫn mounted, giữ nguyên form binding, không submit gì giả) và ô hiện THẲNG số preview — trơn, non-editable, màu thường, không dấu ≈; hover tooltip "Số đã lưu: <x>". Mọi nhánh bail-out (ngoài form/gated/pending/lỗi/bằng nhau) trả control gốc nguyên vẹn. **v0.1.24: preview theo TỪNG DÒNG SUB-TABLE** — ô computed trong dòng sub-table tự scope vào row values (chưa save) qua `context.fieldIndex` (segments `"items:1"`, hỗ trợ lồng); row mới (chưa id) gate theo trigger `create`, row cũ theo `update|source`. File `src/shared/computedPreview.tsx`, gắn trong `patchComputedHint` (chỉ nhánh `render`) | ✅ verified live (create demo_item: qty=3+product_id=1 → `≈ 1,200,000`; qty→5 → `≈ 2,000,000` tức thì; product→2 → `≈ 600,000`; form values sạch. Sub-table trong Edit đơn: bấm ⊕ qty 2→4 → badge `≈ 1,600,000` hiện ngay trong ô dòng đó) |
| **Classic /admin parity (v0.1.22)** — icon + column ⚙ + live auto-refresh là feature FLOW-ENGINE, trước chỉ đăng ký ở `client-v2` (/v/) → /admin thiếu hết. Nhưng /admin cũng là app flow-engine riêng (render bảng bằng `MemoFlowModelRenderer`, KHÔNG phải formily classic) → chỉ cần gọi cùng bộ đăng ký trong `src/client/index.tsx`: `registerComputedRuleFlow + loadComputedRuleCache + loadComputedCollections + installComputedAutoRefresh` (models từ `@nocobase/client-v2`). Bundle mỗi lane tách biệt (guard riêng) | ✅ verified /admin: field-models 97/110 patched; external edit → /admin nhận WS `ptdl:live-refresh` → refreshFlowBlocks refetch |
| **Flow handler idempotency (v0.1.20 bugfix)** — column ⚙ flow `handler` AUTO-APPLIES mỗi lần render (defaultParams). Trước đây nó `saveRule`+recompute VÔ ĐIỀU KIỆN → mỗi render re-save/destroy/recompute MỌI cột (loop write→WS-refresh→re-render; và **403 "Render failed" cho non-admin** sau khi siết ACL). Fix: chỉ WRITE khi rule THỰC SỰ đổi (so `params.rule` vs cache: formula + `splitTriggers(runOn)` + onError; early-return khi trùng, và khi chưa có rule + formula rỗng). Handler settings-flow phải IDEMPOTENT — không side-effect server vô điều kiện | ✅ verified (post-fix load = 0 recompute/destroy, chỉ `list`+`collections`; 3 bảng render sạch, renderFailedCards=0) |
| **ACL gating** — `ptdlComputedRules:list/get` + `ptdlComputed:collections` = `loggedIn` (mọi user đọc được → tooltip hiện). WRITE/AI/recompute (`ptdlComputedRules:create/update/updateOrCreate/destroy`, `ptdlComputed:recompute/graph/test/aiWrite/aiSuggest/aiExplain`) gộp vào snippet **`pm.data-source-manager.ptdl-computed`** → chỉ admin/role quản lý data source (pm.* / pm.data-source-manager) + root (bypass). Vá lỗ hổng cũ `allow(...,'loggedIn')` cho phép MỌI user ghi rule/xài AI qua API. Client `canEditRules` chỉ ẩn nút; đây là chốt THẬT ở server | ✅ verified live (root bypass đủ list/collections/graph/test; server boot OK; non-admin cần role user confirm) |
| Reparent / add / delete / FK-move | ✅ |
| Bulk **update** không `individualHooks` | ❌ (dùng `ptdlComputed:recompute`) |
| Lane classic `/admin` UI · belongsToMany (m2m) · multi-hop lookup 1 chặng | ❌ (multi-hop = nối chuỗi computed) |

---

## 3. File

```
src/server/computed.ts            — ComputedManager: graph, hooks, cascade worklist (toàn bộ logic)
src/server/plugin.ts              — collection ptdlComputedRules + reload + action ptdlComputed:recompute
src/shared/formulaEngine.ts       — evaluateFormula (DÙNG CHUNG client+server); escapeHtml inline; SES fix
src/shared/computedRuleClient.tsx — registerComputedRuleFlow + cache prefill (client)
src/client-v2/index.tsx           — wire
```

---

## 4. Config shape (`ptdlComputedRules`)

```jsonc
{
  "key": "main:order.total_amount",   // unique = `${dataSourceKey}:${collectionName}.${targetField}`
  "dataSourceKey": "main",
  "collectionName": "order",
  "targetField": "total_amount",       // FIELD SỐ THẬT
  "formula": "data.subtotal - data.discount", // ⚠️ field qua `data.` (§6.1)
  "deps": [],                          // [] = server tự suy từ formula; hoặc khai báo tay
  "runOn": "both", "enabled": true, "onError": "null"
}
```

**Deps auto-derive:** server parse `data.<rel>.<field>` → phân loại theo kiểu quan hệ
(hasMany/hasOne→aggregate, belongsTo→lookup); `data.<field>`→local. Vậy UI chỉ cần ô công thức.
Ví dụ đủ 3 loại: `data.quantity * data.product.unit_price` (local + lookup) · `SUM(data.items.line_amount)`
(aggregate) · `data.subtotal - data.discount` (local).

---

## 4b. VÍ DỤ CÔNG THỨC (cookbook) — tất cả đã e2e verified

**Cú pháp:** dòng hiện tại & quan hệ = `data.<...>`; bảng tra cứu (collection rời) = **bare** `<tên_bảng>.<cột>` (không `data.`).

| Nhu cầu | Công thức | Loại dep |
|---|---|---|
| Cùng dòng | `data.subtotal - data.discount` | local |
| Nhân đơn giá | `data.quantity * data.product.unit_price` | local + lookup |
| Gộp quan hệ (roll-up) | `SUM(data.items.line_amount)` | aggregate |
| Roll-up nhiều tầng | (customer) `SUM(data.orders.subtotal)` ← (order) `SUM(data.items.line_amount)` | aggregate (chuỗi) |
| Roll-down (cha→con) | (item) `data.quantity * data.order.price_policy` | lookup (lên cha) |
| **Gộp CÓ ĐIỀU KIỆN** (≈ SELECT/FILTER AppSheet) | `SUMIFS(data.items.line_amount, data.items.status, "active")` | aggregate |
| **FILTER / SELECT** — lọc DANH SÁCH theo điều kiện `==`/`&&`/`>`… (bọc SUM/COUNT/INDEX) | `SUM(FILTER(data.items.line_amount, data.items.status == "active" && data.items.line_amount > 40))` | aggregate |
| **Tra bảng 2 khoá ra CHỮ/bất kỳ** (SUMIFS chỉ ra số) | `INDEX(SELECT(bang_hs.ten, bang_hs.a == data.parent.region && bang_hs.b == data.grade), 1)` | table + lookup |

> **Cú pháp FILTER/SELECT:** dạng điều kiện tự nhiên `FILTER(bảng.cột_lấy, bảng.a == data.x && bảng.b > data.y)` — trong điều kiện: cột của bảng-đang-lọc viết `bảng.<cột>`, cột dòng hiện tại viết `data.<cột>`; VÀ dùng `&&` (hoặc `AND(...)`), so sánh `== === != > < >= <=` (KHÔNG dùng `=` đơn = gán, KHÔNG dùng `&` đơn = nối chuỗi). Bọc kết quả: `SUM/COUNT/AVERAGE/MIN/MAX` hoặc `INDEX(…, 1)` lấy dòng đầu. (Vẫn hỗ trợ dạng cặp cũ `FILTER(cột, cột_đk, giá_trị, …)`.)
| Gộp so sánh | `SUMIF(data.items.amount, ">40")` · `COUNTIF(data.items.status,"done")` | aggregate |
| **Bảng tra cứu 2 khoá** (≈ VLOOKUP nhiều điều kiện) | `data.metric * SUMIFS(bang_hs.he_so, bang_hs.a, data.parent.region, bang_hs.b, data.grade)` | table + lookup + local |
| Cấu hình toàn cục (bảng 1 dòng) | `data.total * cfg.vat_rate` (hoặc `INDEX(cfg.vat_rate,1)`) | table |
| **Số thứ tự trong nhóm** (OR-123.1, .2, .3) | `data.order.code & "." & (COUNTIFS(order_item.order_id, data.order_id, order_item.id, "<" & data.id) + 1)` | table (self) + lookup |
| Nhãn điều kiện | `IF(data.total>1000000, "VIP", "Thường")` · `IFS(...)` · `SWITCH(...)` | local |
| **Đếm / TB dòng con** | `COUNT(FILTER(data.items.id, data.items.status == "pending"))` · `AVERAGE(data.items.line_amount)` | aggregate |
| **Tỉ lệ %** | `data.done_qty / data.total_qty * 100` | local |
| **Cờ boolean** (output boolean) | `data.total > data.credit_limit` | local |
| **Ghép chuỗi** (output text) | `data.first_name & " " & data.last_name` | local |
| **Ngày** (output date) | đến hạn `EDATE(data.order_date, 1)` · số ngày `DAYS(data.end_date, data.start_date)` | local |
| **Tra theo KHOÁ QUAN HỆ** (thay cho nested — so id) | `INDEX(SELECT(bang_gia.don_gia, bang_gia.product_id == data.product_id), 1)` | table |

**Output KHÔNG chỉ số:** cột đích có thể là số / **text** / **date** / **boolean** (engine trả JS Date cho `TODAY()/EDATE`, chuỗi cho concat/`IF`, boolean cho so sánh — `coerce()` để nguyên kiểu phi-số). *(các dòng mới trên đã test trên SES live: EDATE/DAYS/IFS/AVERAGE/COUNT+FILTER/boolean/`&` đều chạy.)*

**Hàm CÓ:** SUM/AVERAGE/MIN/MAX/COUNT · SUMIF(S)/COUNTIF(S)/AVERAGEIF(S) (kể cả `">40"`, `"<"&data.id`) · **FILTER/SELECT** (cú pháp tự nhiên, xem trên) · VLOOKUP (mảng 2D trong field JSON) · INDEX/MATCH · IF/IFS/SWITCH/CHOOSE · ngày `TODAY/EDATE/DAYS/DATEDIF/YEAR/MONTH…` · text `CONCAT/LEFT/MID/UPPER/TEXT…` · ~400 hàm Excel. **KHÔNG có:** XLOOKUP, mảng-động Excel `FILTER(arr, boolArr)`.

**⚠️ Bảng tra cứu KHÔNG hỗ trợ NESTED quan hệ:** `bang.quan_he.cot` KHÔNG chạy — `loadTable` nạp **phẳng** (`find({})`, 0 appends) nên quan hệ của bảng tra cứu không được load (auto-pluck engine thì nestable, nhưng dữ liệu không nạp sâu). `data.a.b.c` (2+ tầng quan hệ dòng hiện tại) cũng vậy — appends chỉ suy ra 1 tầng. **Cách né:** (1) so **khoá id** trực tiếp `bang.rel_id == data.x_id` thay vì `bang.rel.field` — đủ cho hầu hết ca "khớp theo quan hệ"; (2) cần GIÁ TRỊ field lồng → đặt 1 **computed field trên CHÍNH bảng tra cứu** làm phẳng value đó thành 1 cột rồi tham chiếu cột đó (đúng triết lý "multi-hop = tách per-hop").

**"Tính khi" = 3 trigger tick nhiều được (`runOn`, giống plugin AI)** — điều khiển chi phí & độ tươi. Lưu dạng chuỗi phẩy `create,update,source` (token cũ `both/create/self/update` vẫn đọc được):

| Tick | Nghĩa | Chi phí |
|---|---|---|
| **Khi tạo** (`create`) | Tính 1 lần lúc tạo dòng. | rẻ |
| **Khi sửa** (`update`) | Tính lại **mỗi lần mở đúng dòng đó bấm lưu** (bất kể sửa field nào — bỏ qua tối ưu localChanged). | rẻ |
| **Khi nguồn thay đổi** (`source`) | Tính lại khi dữ liệu nguồn đổi: thêm/xoá dòng con, sửa cha, **sửa bảng config** → phần "lan" (**fan-out**). | tốn nếu bảng lớn |

**Ghép thành kịch bản** (e2e 15/15 — `scratchpad/e2e-triggers.mjs`):

| Chọn | create / cfg-đổi / lưu-lại | Dùng khi |
|---|---|---|
| **Tạo + Sửa + Nguồn** (mặc định) | 1000 / **2000** / 2000 | Luôn đúng tuyệt đối; bảng nhỏ/vừa. |
| **Tạo + Sửa** | 1000 / **1000** / **2000** | Mở form lưu là tính, **sửa bảng config KHÔNG lan** (an toàn, không tốn). |
| **Sửa + Nguồn** | **null** / 2000 / 2000 | Luôn đúng theo nguồn; không chốt lúc tạo. |
| **Chỉ Tạo** | 1000 / 1000 / 1000 | Chốt số đóng băng: số HĐ, giá lúc đặt, STT. |
| **(bỏ chọn hết)** | null / null / null | Không tự tính — chỉ chạy bằng nút **Tính lại** (manual `ptdlComputed:recompute`). |

(bảng test: `total = qty×rate`, qty=10, rate config 100→200; "cfg-đổi" = sửa 1 dòng bảng config, "lưu-lại" = mở dòng sửa field `note` rồi lưu.)

**Cách chọn nhanh:** lo "sửa 1 dòng config kéo tính lại cả bảng lớn" → **bỏ tick "Khi nguồn thay đổi"** (giữ Tạo+Sửa) là cắt hẳn fan-out mà vẫn tươi mỗi lần bạn tự lưu dòng. Impl: mỗi seed cascade mang "origin" (create/update/source), chỉ vào worklist nếu rule có tick origin đó — filter ngay lúc seed (`onChange`), không phải lúc chạy.

**Bảng tra cứu — ngữ nghĩa:** `bang_hs.he_so` = MẢNG cột `he_so` của MỌI dòng bảng `bang_hs`. Ra 1 giá trị: bảng 1 dòng → JS tự ép (hoặc `INDEX(...,1)`); nhiều dòng → SUMIFS/INDEX+MATCH theo điều kiện. Bảng = **collection name** (kỹ thuật), đừng trùng tên hàm. Self-table (đánh số) → mọi dòng recompute khi 1 dòng đổi (O(N²), OK với N vừa).

---

## 5. Cách hoạt động

**loadRules()** (afterStart + mỗi `ptdlComputedRules.afterSave/afterDestroy`): đọc rule → `deriveDeps` →
`buildGraph` (resolve quan hệ, dựng reverse-edges, **detectCycles** → disable rule tạo vòng) → topo `rank` →
gắn hook. Hook: `beforeSave`+`beforeBulkCreate` (rule collection, cho local); `afterCreateWithAssociations`/
`afterUpdate`/`afterDestroy` (mọi collection tham gia: rule / child aggregate / target lookup).

**2 cơ chế tính:**
1. **`beforeSave`** — rule *pure-local*: `instance.set(target)` → ghi cùng INSERT/UPDATE, trả về ngay.
2. **`afterCommit` cascade** — mọi rule: `onChange` seed các (collection,row,field) bị ảnh hưởng (own rules /
   parent aggregate / lookup fan-out, có snapshot FK cũ+mới) → **`runCascade`**: worklist xử lý theo
   **topo rank tăng dần** (node rank thấp trước) → mỗi node `recomputeOne` (load row + `appends` quan hệ,
   `evaluateFormula`, ghi `hooks:false` nếu đổi) → đẩy dependents cụ thể vào dirty. DAG (đã prune cycle) → hội tụ.

**Backfill:** `POST /api/ptdlComputed:recompute?collection=&field=` → duyệt rule theo topo, tính lại mọi dòng.

---

## 6. CẠM BẪY (đã trả giá — đừng lặp lại)

1. **⚠️ SES/strict `new Function` — "Duplicate parameter name":** server NocoBase chạy dưới **SES lockdown
   (strict mode)**. Engine compile `new Function('data','value','record', ...formulajsNames, body)`; Excel
   `VALUE()` → tên `value` → **trùng tham số** → strict mode THROW (browser + Node thường = sloppy nên lọt).
   Fix: `formulaEngine.buildScope` xoá `data`/`value`/`record` khỏi names (chữ HOA `VALUE` vẫn dùng được).
   **Node smoke-test KHÔNG bắt được lỗi này — phải test trên server thật.**
2. **⚠️ Fan-out double-count — dùng WORKLIST theo topo rank, KHÔNG cascade đệ quy + `visited`:** khi 1 nguồn
   đụng nhiều con của cùng 1 cha (đổi product.unit_price / roll-down), cascade đệ quy tính cha sau con ĐẦU
   rồi `visited` chặn → SUM thiếu (120000 thay vì 140000). `runCascade` xử lý theo **rank tăng dần** → cha
   aggregate chỉ tính SAU khi MỌI con settle. (Đây là mô hình dirty-set+topo trong design §5.3.)
3. **Công thức PHẢI `data.<field>`** (quan hệ `data.rel.field`) — bare name = ReferenceError.
4. **`beforeSave` + `set` cho pure-local**; nested-write trong txn = **deadlock sqlite** → cross-row phải `afterCommit`.
5. **`hooks:false` khi writeback** (không kích hoạt lại hook) + đồ thị **acyclic** → không lặp.
6. **Snapshot FK cur+prev NGAY trong hook** (Sequelize reset `previous()` sau commit) → reparent đúng cả 2 cha.
7. **Coerce theo kiểu cột**: lỗi/không-số → null; integer/bigInt → round.
8. **`escapeHtml` INLINE** trong formulaEngine (server-build chỉ bundle `main` → subpath `@ptdl/shared/format` thiếu runtime).
9. **Bulk update** where-based không bắn per-row hook → `ptdlComputed:recompute`.
10. **"Phải F5 mới nhảy số" = KHÔNG phải lỗi engine.** Đo được: sau mutation, **refetch NGAY đã ra giá trị đúng**
    (DB đúng tức thì) — nhưng (a) response của lệnh sửa KHÔNG kèm cột computed, (b) block khác trên trang không tự
    refetch. Fix = `installComputedAutoRefresh` với **2 trigger gộp vào 1 lần refresh debounce** (`src/shared/computedRuleClient.tsx`):
    - **(1) axios 220ms (nhanh, optimistic, chỉ client tự sửa):** interceptor trên `app.apiClient.axios` bắt mutation trên collection ∈ `ptdlComputed:collections` (gồm **lookup target** như product) → `schedule()`.
    - **(2) WebSocket (chuẩn xác, MỌI client, thắng đua fan-out lớn):** server cuối `runCascade` gọi `ComputedManager.notify(collections đã đổi)` → `plugin.ts` `app.emit('ws:sendToCurrentApp', {message:{type:'ptdl:live-refresh', payload:{collections}}})`; client `onWsMessage(app,'ptdl:live-refresh',schedule)`. Đây là tín hiệu "tính XONG thật", không đoán 220ms.
    - **Refetch = `refreshFlowBlocks(flowEngine)`** — ⚠️ `forEachModel` CHỈ trả model khung tầng top (KHÔNG có `resource`); data block nằm sâu ở engine con → phải **đệ quy `.subModels`** (dedup theo tham chiếu) mới với tới. (Sai lầm cũ: `forEachModel(m=>m.resource.refresh())` refresh vào hư không → v0.1.4 fix.)
    - Helper tái sử dụng, không phụ thuộc, ở `src/shared/liveRefresh.ts` (`onWsMessage`/`refreshFlowBlocks`/`LIVE_REFRESH_TYPE`) — copy sang plugin khác (vd badged) hoặc promote lên @ptdl/shared khi nó có build thật. ⚠️ NocoBase core coi `payload.refresh:true` = full `window.location.reload()` → dùng `type` riêng. ⚠️ sửa thuần-local (vd đổi discount → total_amount qua beforeSave) KHÔNG bắn WS (cascade thấy giá trị đã settle) — client tự sửa vẫn thấy nhờ response+axios, client khác thì không. **Verified live e2e:** sửa qua API ngoài (browser KHÔNG gửi request → axios không thể bắn) → browser nhận push `{collections:['demo_item','demo_order']}` → block demo_order tự nhảy 1.8M→2.0M không F5.

---

## 7. Build / deploy / test

```bash
cd build-env && bash recipes/run-formula-build.sh          # 3 lane → tar → add-markers
# deploy: giải nén tgz (tar --force-local) → nb-local/node_modules/@ptdl/plugin-formula/ (+ storage/plugins)
cd ../../nb-local && npx pm2 restart index                 # SERVER lane đổi → PHẢI restart
```

**E2E live (đã chạy):** script `scratchpad/e2e.mjs` — tạo product/order/order_item + 3 rule qua API,
test mọi kịch bản (30/30). Login root: `POST /api/auth:signIn` (`X-Authenticator: basic`,
admin@nocobase.com / .env INIT_ROOT_PASSWORD) → token → `Authorization: Bearer`. `updateOrCreate` cần
`filterKeys[]=key` (dạng mảng, KHÔNG `filterKeys=key` → "Invalid SQL column").

**UI verified live (v0.1.15):** column ⚙ dialog render đủ `ComputedRuleEditor` (toolbar/AI/triggers/onError/run, ẩn 2 picker) + form/detail ⓘ tooltip công thức trên field computed (icon + hover overlay đúng formula). Config flow vẫn chỉ trên `TableColumnModel` (field ⚙ không nhận dialog → bỏ, thay bằng tooltip).

---

## 8. TODO

- Perf: `runCascade` chọn min-rank O(n²/lần) + fan-out tuần tự → batch/priority-queue cho fan-out lớn.
- UI lane classic `/admin`; ép cột đích read-only; sơ đồ phụ thuộc.
- belongsToMany (m2m) aggregate; multi-hop lookup (hiện: nối chuỗi computed từng chặng).
- Gộp hẳn RollupManager thành `aggregate` dep (hiện coexist, không xung đột).

Memory: `project_ptdl_computed_field`, `reference_ptdl_global_rule_blueprints`.
