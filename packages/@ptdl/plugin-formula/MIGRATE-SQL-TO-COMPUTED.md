# Migrate workflow SQL → Computed Column (+ Scan / Line-Generator / Auto-link)

> Hướng dẫn chuyển các **workflow "chạy SQL sau Add/Edit/Delete/Duyệt"** sang **cột computed tự tính**
> của `@ptdl/plugin-formula`. Rút ra từ một hệ logistics thật (5 workflow, ~35 phép cập-nhật-cột).
> Đọc kèm: [COMPUTED-FIELD.md](COMPUTED-FIELD.md) (năng lực engine) · [COSTING.md](COSTING.md) +
> [LEDGER-WINDOW-MODE.md](LEDGER-WINDOW-MODE.md) (scan/running-balance).

---

## 0. TL;DR

Một workflow SQL kiểu:

```sql
-- Trigger: sau Add/Edit/Delete dòng con → chạy hàng loạt UPDATE cha
UPDATE parent SET total = (SELECT SUM(child.x) FROM child WHERE child.parent_id = parent.id) ...
```

**không phải là quy trình — nó là một ĐỒ THỊ PHỤ THUỘC được viết tay.** Computed column khai báo đồ thị đó
**một lần / cột**, rồi engine tự tính lại đúng thứ tự mỗi khi bất kỳ nguồn nào đổi (thêm/sửa/xoá, xuyên
quan hệ, nhiều tầng). Bạn **xoá được phần lớn SQL trùng lặp** — và quan trọng hơn: xoá luôn **mâu thuẫn
định nghĩa** (cùng một cột được tính khác nhau ở nhiều trigger).

Chuyển được ngay: **cộng-trừ cùng dòng · SUM/COUNT/AVG con · tra bảng config · IF/IFS nhãn · cascade
nhiều tầng**. Phải xử lý riêng: **gán FK theo mã (link) · quan hệ lồng 2+ tầng · tạo dòng mới · số dư
theo thời gian**. Bốn cái đó có lane khác (xem §2).

---

## 1. Vì sao NÊN chuyển (không chỉ để đỡ gõ SQL)

Trong hệ thực tế, cùng field `orders.total_liquidation_payable` được tính lại ở **4 workflow** với nhánh
`ELSE` **khác nhau** (`ELSE 0` / `ELSE NULL` / `ELSE giữ giá trị cũ`). ⇒ Giá trị cuối phụ thuộc
**workflow nào chạy sau cùng** = bug nhất quán nằm sẵn. Tương tự `total_order_cost`,
`remaining_liquidation_amount`, `shipments.profit/revenue` bị tái định nghĩa 3–5 nơi.

**Computed ép mỗi cột đúng MỘT định nghĩa.** Đây là lợi ích lớn nhất, hơn cả chuyện đỡ viết SQL.

---

## 2. Bản đồ 5 lane — chọn đúng công cụ

| Nhu cầu | Lane | Ghi chú |
|---|---|---|
| Cộng-trừ cùng dòng, SUM/COUNT/AVG con, tra bảng config, IF/IFS, cascade nhiều tầng | **Computed column** | 90% khối lượng nằm ở đây |
| Số dư chạy theo thời gian, có "mốc reset" (running-balance, tồn kho, costing) | **Scan / Window mode** | `ptdlScanRules`; xem LEDGER-WINDOW-MODE.md |
| Tạo dòng mới theo quy tắc (1 cha → N con, backfill đầu kỳ) | **Line Generator** | `@ptdl/plugin-line-generator` |
| Gán quan hệ (FK) bằng cách match mã/khoá | **Auto-link** *(hoặc SELECT+INDEX, xem §6.1)* | khâu LINK, chạy TRƯỚC |
| Còn lại (gọi API, gửi mail, duyệt, delay, chờ người) | **Workflow / script** | computed không đụng tới |

**Nguyên tắc vàng:** *LINK trước — TÍNH sau.* Auto-link/workflow dựng quan hệ; computed đi trên quan hệ đó
để gộp/tra. Đừng nhồi việc gán FK vào computed (sai mục đích + perf, xem §6.1).

### Computed KHÔNG làm — đúng 3 nhóm
1. **Ghi sang collection khác / tạo dòng / nhiều field-đích trong 1 rule.** (1 rule = 1 cột của **chính** dòng.)
2. **Quan hệ lồng 2+ tầng** (`data.a.b.c`) hoặc **join không-mô-hình-hoá** (match bằng string). → §5 (flatten).
3. **Side-effect quy trình** (API/mail/duyệt/delay) & **stateful theo thời gian**. → scan-mode / workflow.

---

## 3. Quy trình migrate — 7 bước

1. **Chụp lại đồ thị phụ thuộc.** Mỗi `SET col = <expr>` là 1 node. Vẽ cạnh: col này đọc col/bảng nào.
   (Bỏ qua `COALESCE(...,0)` — engine coi thiếu = 0; bọc `IFERROR(x,0)` nếu cần chắc.)
2. **Phân loại từng node** theo §2: computed / scan / line-gen / link / workflow.
3. **Đảm bảo quan hệ tồn tại.** Mọi `WHERE child.parent_id = parent.id` phải là **quan hệ NocoBase thật**
   (hasMany/belongsTo), không phải cột id trần khớp tay. Thiếu thì tạo quan hệ (hoặc để link-lane lo).
4. **Với node computed: viết formula** theo §4, đích = **cột số/text/date/boolean thật**.
5. **Với quan hệ lồng/join-string: thêm "computed phẳng" per-hop** (§5) rồi mới tra.
6. **Chọn trigger** cho mỗi rule: `create` / `update` / `source` (xem §4.4). Mặc định cả 3.
7. **Backfill + verify.** Bấm "Tính lại" (`ptdlComputed:recompute`) để tính lại dữ liệu cũ; đối chiếu
   với kết quả SQL cũ trên vài record; **live-test đúng chuỗi cascade 2 tầng** (§7).

---

## 4. Ánh xạ pattern SQL → formula (cookbook)

Cú pháp: dòng hiện tại & quan hệ = `data.<...>`; bảng tra cứu rời = **bare** `<bảng>.<cột>`.

### 4.1 Cùng dòng
```sql
SET total_cost = COALESCE(a,0) + COALESCE(b,0) - COALESCE(c,0)
```
```
data.a + data.b - data.c
```

### 4.2 Gộp con (roll-up) — thay subquery SUM
```sql
SET total = (SELECT SUM(child.x) FROM child WHERE child.parent_id = parent.id)
```
```
SUM(data.<quan_hệ_con>.x)
```
> `data.children` = tên **quan hệ hasMany**, không phải tên bảng. Cùng: `COUNT`, `AVERAGE`, `MIN`, `MAX`.

### 4.3 Gộp CÓ ĐIỀU KIỆN — thay subquery có WHERE lọc
```sql
(SELECT SUM(td.amount) FROM td JOIN tr ... WHERE td.order_id=o.id
   AND dc.category='Khách thanh toán' AND tr.type='Thu' AND tr.status='Đã xác nhận')
```
```
SUMIFS(data.details.amount,
       data.details.category_flat, "Khách thanh toán",
       data.details.type_flat,     "Thu",
       data.details.status_flat,   "Đã xác nhận")
```
> Điều kiện nằm ở **bảng ông** (td→tr→category) ⇒ phải **flatten** category/type/status xuống `details`
> trước (§5). Hoặc dạng tự nhiên: `SUM(FILTER(data.details.amount, data.details.status_flat == "Đã xác nhận" && ...))`.

### 4.4 Nhãn điều kiện — thay CASE WHEN
```sql
CASE WHEN method='Báo trọn' THEN a+b-c
     WHEN method='Hàng lẻ'  THEN d+e+f-c
     ELSE 0 END
```
```
IFS(data.method == "Báo trọn", data.a + data.b - data.c,
    data.method == "Hàng lẻ",  data.d + data.e + data.f - data.c,
    TRUE, 0)
```
> `ELSE giữ giá trị cũ` **không map sạch** (computed luôn ghi đè) — dùng `TRUE, 0` hoặc default rõ ràng.
> Chuỗi tiếng Việt trong formula OK.

### 4.5 Tra bảng theo khoảng — thay JOIN price range
```sql
SELECT pd.percent FROM price_details pd JOIN prices p ON p.id=pd.price_id
WHERE p.price_name='01 chuẩn Hà Nội' AND pd.price_type='Ủy thác'
  AND o.value >= pd."from" AND o.value < pd."to" LIMIT 1
```
```
INDEX(SELECT(price_details.percent,
   price_details.price_name_flat == "01 chuẩn Hà Nội" &&
   price_details.price_type      == "Ủy thác" &&
   price_details.from <= data.value && price_details.to > data.value), 1)
```
> `price_name_flat` = computed phẳng trên `price_details` (§5) vì `prices.price_name` là quan hệ cha.

### 4.6 Chuỗi cascade nhiều tầng
Không cần viết gì thêm: khai mỗi cột 1 rule, engine tự nối. Ví dụ 2 tầng
`child → order → shipment`: rule trên `order` gộp `child`, rule trên `shipment` gộp `order`. Sửa 1 `child`
→ order tính lại → shipment tự tính theo. (Đây là ca "flush tầng N trước N+1" — §7 bắt buộc live-test.)

---

## 5. Xử lý quan hệ lồng 2+ tầng & join-string (computed phẳng per-hop)

Engine **chỉ nạp quan hệ 1 tầng** (`appends` suy 1 tầng) và **cấm bảng-tra-cứu lồng quan hệ**
(`bảng.quan_hệ.cột` không chạy). Ba biểu hiện & cách né:

| Biểu hiện SQL | Vấn đề | Cách né |
|---|---|---|
| `dm.shipment.tax_status.name` | lồng 2 tầng | computed phẳng trên `shipments`: `tax_status_name = data.tax_status.name` (1 tầng) → dm đọc `data.shipment.tax_status_name` |
| `WHERE dc.category` (td→tr→dc) | điều kiện ở bảng ông | 2 lớp phẳng: `tr.cat_name = data.category.name`, rồi `td.cat_name = data.transaction.cat_name` |
| `JOIN cd ON cd.code = dm.code` | join bằng **string**, không phải quan hệ | **remodel**: biến string-match thành quan hệ thật (belongsTo), rồi tách computed per-hop. Không muốn đụng mô hình → giữ node đó ở workflow |

> Triết lý: **"multi-hop = tách per-hop"**. Mỗi bước nhảy quan hệ = 1 computed phẳng làm sẵn 1 cột, tầng
> sau chỉ đọc cột phẳng đó (luôn 1 tầng). Join bằng string là **mầm bug** — remodel thành quan hệ là vệ sinh tốt.

---

## 6. Các gap đặc thù

### 6.1 Gán FK theo mã (auto-link) — dùng SELECT+INDEX hay feature riêng?

```sql
SET order_id = (SELECT id FROM orders WHERE order_code = <parse(declaration_code)> LIMIT 1)
```
**Về giá trị, SELECT+INDEX GIẢI ĐƯỢC** (đích belongsTo, `order_id` là cột bigint thật):
```
INDEX(SELECT(orders.id, orders.order_code ==
   IFERROR(LEFT(data.declaration_code, FIND("/", data.declaration_code, FIND("/", data.declaration_code)+1)-1),
           data.declaration_code)), 1)
```
`IFERROR+FIND+LEFT` tái tạo đúng regex `^[^/]*/[^/]*` (cả 3 ca 0/1/≥2 dấu `/`).

**Khi nào ổn / khi nào cần feature riêng:**

| Tình huống | Dùng |
|---|---|
| Đích nhỏ/vừa, belongsTo, target ít đổi | **SELECT+INDEX ngay** |
| Đích lớn (bảng giao dịch), target đổi thường xuyên | **Auto-link** (index DB, targeted) |
| 1 match → nhiều FK / m2m / hasOne | Auto-link |
| Cần policy: cờ "chưa khớp", find-or-create, review | Auto-link |

**2 rủi ro khi dùng SELECT+INDEX cho FK:** (a) **perf** — `orders` làm bảng-tra-cứu bị quét toàn bộ; và
sửa **1 order** kéo recompute **mọi** declaration (value-based fan-out). Với engine SELECT đã index hoá
(§ hàm mới) thì quét/dòng hết đau, nhưng fan-out toàn bảng khi target đổi vẫn còn → **bỏ tick "Khi nguồn
thay đổi"** nếu target lớn. (b) **`order_id` vừa là output vừa là KHOÁ GỘP** của aggregate tầng trên →
reparent do-computed chưa e2e → **live-test**.

### 6.2 Số dư theo thời gian (running-balance) → Scan mode
```sql
deposit = (giao dịch thanh toán MỚI NHẤT: available-amount) + Σ(đặt cọc/hoàn tiền SAU mốc đó)
```
`ORDER BY createdAt DESC LIMIT 1` + Σ-sau-mốc = **stateful scan có reset**, KHÔNG phải computed (set-based).
Dùng **scan-mode** (`ptdlScanRules`): partition = company, order theo thời gian, gặp 'thanh toán'/'thanh lý'
→ reset về (available−amount), 'đặt cọc' → +, 'hoàn tiền' → −. Giống hệt costing FIFO/weighted-avg.
> **Seam:** scan ghi running-value lên **từng dòng transaction**; muốn số đóng ở `companies.deposit` cần
> hoặc option "ghi closing về entity cha", hoặc 1 computed `deposit = running-value dòng mới nhất`. Kiểm tra.

### 6.3 Tạo dòng synthetic đầu kỳ → Line Generator
`NOT EXISTS(migration) → INSERT` = **sinh dòng có điều kiện**, computed cấm tuyệt đối. Dùng **line-generator**
("1 company → N transaction"), tạo record thật (bỏ hack `1000000+ROW_NUMBER`). **Cần guard idempotency**
("đã sinh thì thôi") — verify plugin hỗ trợ, kẻo duyệt lần 2 đẻ trùng.
> **Thứ tự tinh tế:** `deposit` vừa là *input* của backfill (đọc số mở tay) vừa là *output* của scan sau đó.
> Đúng pattern kho: **line-gen đóng băng số dư đầu kỳ thành 1 dòng (1 lần) → scan sở hữu deposit từ đó.**

---

## 7. Cạm bẫy & checklist verify

- [ ] **Quan hệ là thật** (không phải id trần match tay). Thiếu → tạo quan hệ / để link-lane.
- [ ] **Không `ELSE giữ-giá-trị-cũ`** trong IFS (computed ghi đè). Đổi thành default rõ ràng.
- [ ] **Đích là cột stored thật** đúng kiểu (số/text/date/boolean).
- [ ] **Trigger đúng ý:** target lớn mà không muốn fan-out khi sửa config → **bỏ tick "Khi nguồn thay đổi"**.
- [ ] **Cascade 2 tầng quan hệ** (child→order→shipment): **live-test 1 lượt** — đây là ca "flush tầng N
      trước khi gộp N+1", đã e2e với dữ liệu mẫu nhưng data thật nên chạy thử.
- [ ] **Chuỗi LINK→TÍNH:** node gán FK (workflow/auto-link) phải commit **trước** khi computed gộp theo FK
      đó. Set FK là 1 update → computed tự re-fire; **verify không bị đua**.
- [ ] **Backfill:** bấm "Tính lại" cho dữ liệu cũ; đối chiếu 3–5 record với kết quả SQL cũ.
- [ ] **Vòng lặp:** engine tự phát hiện & từ chối rule tạo cycle (không sập) — kiểm DAG trong Settings page.

---

## 8. Case study — 5 workflow thật (tóm tắt kết quả)

| WF | Trigger | Chuyển được | Chừa lại |
|---|---|---|---|
| #1 shipment cost → fee/cost/profit | delete cost | **✅ 100%** (3 rule) | — |
| #2 sales_tax → order → shipment | delete tax | **✅ 100%** (8 rule, cascade 2 tầng) | — |
| #3 sales_tax add/edit | add/edit | **✅ ~90%** | `order_id` link (§6.1) |
| #4 declaration_management | add/edit | **✅ ~85%** | 3 FK-link; flatten 3 chỗ (§5); **1 blocker**: `items.import_entrustment_fee` join-string (§5, cần remodel) |
| #5 duyệt transaction | approve | **~55% (computed) → ~90% (cả suite)** | **backfill INSERT** (§6.3) · **deposit** (§6.2) · flatten payment roll-ups (§5) · FK-link |

**Chi tiết #1 (mẫu chuẩn):**
```
shipments.total_shipment_fee = SUM(data.shipment_costs.total_amount)
shipments.total_cost         = data.total_shipment_fee + data.total_other_tax + data.total_vat + data.total_import_tax
shipments.profit             = data.total_revenue - data.total_cost
```
Trigger `source` → thêm/sửa/xoá `shipment_costs` con đều tự tính lại. **1 bộ rule thay cả 3 workflow add/edit/delete.**

**Tổng:** ~35 phép cập-nhật-cột → **~26 (≈75%) chuyển sang computed**, nhiều cái **trùng lặp** nên gộp còn ít
hơn; phần dư (link FK, insert, deposit, flatten) **ít & tách bạch rõ**. Kiến trúc **lai** (computed + scan +
line-gen + workflow-mỏng), **không** thay thế toàn bộ.

---

## 9. Kiến trúc đích

```
① AUTO-LINK / workflow-mỏng  → set FK theo mã (LINK, chạy trước)
② LINE GENERATOR             → sinh dòng synthetic đầu kỳ (idempotent)
③ COMPUTED DAG               → toàn bộ cascade tiền tệ (khai 1 lần/cột)
     + computed phẳng per-hop → né quan hệ lồng / join-string
④ SCAN / WINDOW              → running-balance (deposit), tồn kho, costing
```
`①②④` làm thứ computed không làm; `③` nuốt phần còn lại & xoá SQL trùng lặp. Xem thêm:
[COMPUTED-FIELD.md](COMPUTED-FIELD.md) · [LEDGER-WINDOW-MODE.md](LEDGER-WINDOW-MODE.md) · [COSTING.md](COSTING.md).
