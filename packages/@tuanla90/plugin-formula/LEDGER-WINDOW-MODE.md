# Ledger / Window column — design (mode thứ 3 của computed column)

**Trạng thái:** `running_sum` **ĐÃ SHIP** trong `@tuanla90/plugin-formula` v0.1.27 (2026-07-16), live-verified e2e trên nb-local. FIFO / weighted-avg đã ship ở mode scan (xem COSTING.md).

> **v0.1.48 — INPUT viết bằng CÔNG THỨC EXCEL (tự chuyển sang SQL).** Ô "Cột đầu vào" của window giờ có **3 chế độ** (`inputMode`): **Cột** (chọn 1 cột) · **Công thức** (Excel `data.<field>`, hệ thống tự transpile sang SQL) · **SQL (nâng cao)** (biểu thức SQL thô, escape hatch). Transpiler `src/shared/excelToSql.ts` (thuần TS, dùng chung client+server) chuyển **biểu thức vô hướng theo từng dòng**: số học · so sánh (`==`→`=`, `<>`) · logic (`&&`/`||`/NOT → AND/OR/NOT) · nối chuỗi `&` (→ `||` hoặc CONCAT theo dialect) · `IF()`→`CASE WHEN` · hàm scalar an toàn (ABS/ROUND/COALESCE/IFERROR/UPPER/LOWER/TRIM/LEN/LEFT/RIGHT/MID/CONCATENATE/MOD). `data.<cột>`→cột (quoted theo dialect). **Từ chối rõ ràng** (không dịch bừa): hàm gộp/tra cứu (SUM/SUMIFS/FILTER/SELECT/VLOOKUP/INDEX…), tham chiếu quan hệ `data.a.b`, lookup bảng khác `tbl.col`, `^` — vì cần join/subquery, không thuộc bản chất cột lũy kế (dùng Computed cho mấy cái đó). Sinh SQL **từ AST** (quote identifier, escape literal) nên **an toàn hơn SQL thô** và **portable đa dialect** (sqlite/pg/mysql). Client validate trước khi lưu; server `overExpr` transpile lúc build query, lỗi thì recompute fail loud. Ví dụ live-verified: cột `data.qty * IF(data.direction=="in", 1, -1)` → running-sum ra đúng bằng `balance_after`. **Config dialog cũng đổi**: 4 nhóm → **Tabs theo bước** (① Chiến lược · ② Đầu vào · ③ Kết quả · ④ Nâng cao).

## Đã build (v0.1.27)
- **Server** `src/server/window.ts` = `WindowManager`: `scan()` mọi field có `options.ptdlWindow` → hook `afterCreateWithAssociations`/`afterUpdate`/`afterDestroy` TRÊN CHÍNH bảng đó → `recomputePartition()` (window-SQL cho đúng 1 phân vùng, re-partition thì tính cả cũ+mới) trong `afterCommit`; `recomputeAll()` = 1 lượt `OVER(PARTITION BY…)` toàn bảng. UPDATE raw qua `sequelize.query` → **bỏ qua model hook → không loop**. Quote identifier theo dialect (sqlite/pg = `"`, mysql = `` ` ``).
- Wire trong `plugin.ts`: scan lúc `afterStart` + rescan mỗi `fields.*` + action `POST /api/ptdlWindow:recompute?collection=&field=` (ACL loggedIn) + WS `ptdl:live-refresh`.
- **Client** `src/client-v2/windowInterface.tsx` = `PtdlWindowFieldInterface` (Add field → Advanced → "Sổ/Lũy kế (window)"): nhập partitionBy / orderBy / input / accumulator → lưu `field.options.ptdlWindow`.
- **Trang quản lý tập trung** (v0.1.30) `src/shared/WindowColumnsManager.tsx` = Settings → "Sổ / Lũy kế (window)": liệt kê MỌI cột window mọi bảng (server action `ptdlWindow:list`), **Thêm / Sửa / Gỡ / Tính lại** ngay tại chỗ. Thêm = `fields:create` (interface ptdlWindow + options.ptdlWindow), Sửa = `fields:update {ptdlWindow}`, Gỡ = `fields:update {ptdlWindow:null}` (giữ cột+data), rồi auto recompute. Modal dùng picker cột thật (getFields). Đăng ký cả 2 lane (pluginSettingsManager). Live e2e: list/create/recompute(bal_test khớp 100/70/60/20/60/-20)/edit/remove đều đúng.
- **Live e2e** (bảng `stock_movements`, field `balance_after`, partition [product_id,warehouse], order [moved_at,id], input signed_qty): create hook tự tính (100,70,120,80 · 60,40) · recompute-all backfill · chèn lùi ngày 01-07 (→60,110,70) · xoá (→20) · đổi kho re-partition (P2/K1=-20, P2/K2=60). Tất cả đúng.

**Trạng thái cũ:** thiết kế + PROTOTYPE engine đã chứng minh live trên nb-local (2026-07-16).

## 1. Vì sao cần

Computed Field hiện có 2 kiểu cột dẫn xuất, cả hai **độc lập thứ tự**:
- **local** — giá trị dòng = f(chính dòng đó).
- **aggregate / roll-up** — giá trị dòng = SUM/AVG… các dòng liên quan.

Có một lớp bài toán chúng KHÔNG làm được: **cột phụ thuộc thứ tự, lũy kế qua từng dòng trong một phân vùng** — tức "hàm window" (`SUM() OVER (PARTITION BY … ORDER BY …)`), vật chất hoá vào một cột cứng để vận hành:
- **Tồn lũy kế / số dư sau mỗi phiếu** (`balance_after`).
- **Chênh tồn đầu/cuối kỳ** (đóng kỳ) — rút thẳng từ `balance_after`.
- **Giá vốn bình quân gia quyền di động** (mỗi avg phụ thuộc avg trước → recursive).
- **Giá vốn FIFO** (tiêu thụ lớp — cumulative-in range ⋈ cumulative-out range).

→ Thêm **mode "window/ledger"** vào plugin computed-column: cùng họ "cột dẫn xuất lưu cứng, tự bảo trì", dùng chung config UI / trigger / nút recompute / WS, nhưng có **engine tính-theo-thứ-tự** riêng.

## 2. Khác biệt căn bản so với 2 mode cũ

| Trục | aggregate (có sẵn) | window/ledger (mới) |
|---|---|---|
| Ngữ nghĩa | f(dòng, aggregate dòng liên quan) | partition + **order** + **accumulator mang qua từng dòng** |
| Invalidation | *theo phụ thuộc* (cột X đổi → tính ô này) | *theo vị trí* (chèn/sửa phiếu ở giữa → tính lại **từ điểm đó về cuối**) |
| Thực thi | recompute per-row (JS) | **batch SQL** (`OVER()` / recursive CTE) → `UPDATE` ngược |

Trục giữa là engine invalidation **thứ hai** (position-based) — đây là phần mới thật, không phải chỉ thêm 1 hàm formula.

## 3. Config shape (đề xuất)

```
windowColumn:
  targetCollection : stock_movements
  targetField      : balance_after      # cột cứng để ghi
  partitionBy      : [product_id, warehouse]
  orderBy          : [moved_at, id]      # phải xác định (tie-break bằng id)
  accumulator      : running_sum         # running_sum | weighted_avg | fifo
  input            : signed_qty          # cột/công thức đầu vào mỗi dòng
  # (weighted_avg/fifo dùng thêm: qtyField, costField, và ghi ra cogs/avg_cost…)
  recompute        : from_point          # full | from_point
  triggers         : [create, update(order/input fields), delete]
```

| accumulator | SQL | ghi ra mỗi dòng |
|---|---|---|
| `running_sum` | `SUM(input) OVER(…)` | số dư lũy kế |
| `running_count` | `COUNT(*) OVER(…)` | đếm lũy kế (input tuỳ chọn) |
| `running_min` / `running_max` | `MIN/MAX(input) OVER(…)` | nhỏ/lớn nhất tới hiện tại |
| `running_avg` | `AVG(input) OVER(…)` | trung bình lũy kế |
| `row_number` | `ROW_NUMBER() OVER(…)` | **số thứ tự** 1,2,3… mỗi phân vùng (không cần input; KHÔNG frame) |
| `weighted_avg` *(→ mode scan, ĐÃ LÀM)* | JS ordered-scan state-based | `avg_cost`, `cogs` |
| `fifo` / `lifo` / `fefo` *(→ mode scan, ĐÃ LÀM)* | JS allocation strategy (hàng đợi lớp) | `cogs`, tồn theo lô |

> **Lưu ý (cập nhật 2026-07-17):** `weighted_avg`/`fifo` KHÔNG hiện thực bằng recursive-CTE trong window mà bằng **mode thứ 4 "scan/costing"** (v0.1.34+, JS ordered-scan — kernel `allocate(need)`, FIFO/LIFO/FEFO/weighted-average = các `AllocationStrategy`). Multi-source nhiều bảng thêm ở v0.1.57–58. Chi tiết + trạng thái đầy đủ: **`COSTING.md`**. Bảng trên giữ lại để đối chiếu ý tưởng gốc.

**orderBy = `OrderSpec[] {field, dir:'asc'|'desc'}`** (v0.1.32). Chuẩn hoá backward-compat: chuỗi/`['col']` cũ → asc. SQL: `ORDER BY col ASC/DESC`. ROW_NUMBER là ranking fn → build KHÔNG kèm `ROWS UNBOUNDED PRECEDING` (Postgres từ chối frame trên ranking).

v0.1.31–32: 6 accumulator hàm-window-thuần (sum/count/min/max/avg/**row_number**) + **ASC/DESC per cột**. Live-verified: avg 100/35/20/5, count 1-4, max 100×4, **row_number ASC 1,2,3,4 / DESC 4,3,2,1**, SUM DESC 20/-80/-50/-40, backward-compat balance_after nguyên. Trang quản lý dùng **FieldPickerCascader (shared)** pick cột + **OrderPick** (tag ↑ASC/↓DESC bấm đổi chiều), hiện **Cột đích + Công thức window** (`ROW_NUMBER() OVER (PARTITION BY … ORDER BY … ASC)`). → "đánh số thứ tự tăng dần" = 1 cột row_number.

## 4. Engine (đã prototype)

**Full recompute** — mọi phân vùng, từ đầu (nút "tính lại toàn bộ"):
```sql
WITH calc AS (
  SELECT id, SUM(signed_qty) OVER (
    PARTITION BY product_id, warehouse ORDER BY moved_at, id ROWS UNBOUNDED PRECEDING) AS bal
  FROM stock_movements)
UPDATE stock_movements SET balance_after = (SELECT bal FROM calc WHERE calc.id = stock_movements.id);
```

**From-point recompute** — chỉ 1 phân vùng, chỉ dòng ≥ điểm sửa; **tái dùng số dư đã lưu** của dòng ngay trước (anchor) nên không quét lại từ đầu phân vùng, không đụng phân vùng khác:
```sql
-- base = balance_after của dòng ngay trước (T, I) trong cùng phân vùng (COALESCE 0)
WITH ds AS (
  SELECT id, SUM(signed_qty) OVER (ORDER BY moved_at, id ROWS UNBOUNDED PRECEDING) AS partial
  FROM stock_movements
  WHERE product_id=:P AND warehouse=:W AND (moved_at > :T OR (moved_at = :T AND id >= :I)))
UPDATE stock_movements SET balance_after = :base + (SELECT partial FROM ds WHERE ds.id = stock_movements.id)
WHERE id IN (SELECT id FROM ds);
```

Trigger nối vào: create/update(cột order/input)/delete 1 phiếu → gọi from-point tại (partition, moved_at, id) của phiếu đó. Thêm cuối sổ = incremental rẻ; sửa lùi ngày = quét lại đuôi phân vùng.

## 5. Kết quả prototype (live nb-local, sqlite 3.53)

Sổ P1 (Ghế) kho K1: in100 / out30 / in50 / out40 → full recompute: **100, 70, 120, 80** ✓.
Chèn **lùi ngày** P1 01-07 out10 → from-point (base=70): **chỉ đụng 3/7 dòng**, P2 và 2 dòng đầu P1 không động → **100, 70, 60, 110, 70** ✓.
**from-point == full recompute: khớp 100%** (chứng minh đúng). Tồn cuối kỳ (đóng kỳ) rút thẳng từ `balance_after`: P1=70, P2=40.
Window functions + recursive CTE đều chạy trên sqlite của nb-local (và pg/mysql).

## 6. Ranh giới / lưu ý

- **FIFO** không phải 1 window đơn — là truy vấn nhiều bước (khớp khoảng luỹ kế) hoặc recursive CTE; **bình quân di động** cần recursive (avg_n phụ thuộc avg_{n-1}). `running_sum` (số dư/đóng kỳ) là bản dễ nhất, làm trước.
- **Giá vốn đã post phải khoá cứng** — vật chất hoá ở đây là *yêu cầu kế toán*, không chỉ tối ưu.
- **Hiệu năng lượng lớn**: from-point + đóng kỳ (cắt đuôi luỹ kế) là cách giữ rẻ; tránh full recompute toàn sổ mỗi lần.
- `signed_qty` nên là 1 cột **local** (mode có sẵn) = `qty * IF(direction=='in',1,-1)` — minh hoạ 3 mode ghép nhau trên cùng 1 bảng.

## 6b. 3 mode GHÉP trên 1 bảng sổ — live-verified (2026-07-16)

Chuỗi đầy đủ trên `stock_movements` + `products`:
1. **local** `signed_qty` = `data.qty * IF(data.direction=="in", 1, -1)` (computed rule; lưu ý engine dùng `==`, KHÔNG phải `=` Excel — verified qua `ptdlComputed:test`).
2. **window** `balance_after` = running SUM của `signed_qty` per (product,warehouse).
3. **aggregate** `products.on_hand` = rollup SUM(`movements.signed_qty`) qua hasMany `products.movements`.

**Cascade tất định từ MỘT edit** (Ghế K1: qty 100→150): signed_qty→150, balance_after P1/K1 dời +50 (150/120/110/70), on_hand(Ghế) 20→70; Bàn không đổi. **Vì sao chắc chắn**: pure-local rule (chỉ ref cùng dòng) ghi trong `beforeSave` = CÙNG transaction với update gốc → khi window/rollup chạy ở `afterCommit` đã đọc được `signed_qty` mới đã commit. (Nếu input là formula có quan hệ → cascade afterCommit, cần cân nhắc thứ tự.) → Có thể để `signed_qty` là cột local, hoặc bỏ qua và cho window `input` là biểu thức SQL (TODO §8).

## 7. Lộ trình build
1. ✅ `running_sum` + recompute-partition + action recompute-all — **SHIPPED v0.1.27** (live-verified).
2. Đóng kỳ (period snapshot) — có thể bằng Line Generator hoặc query từ `balance_after`.
3. `weighted_avg` (recursive) → `fifo` (khớp lớp) — tái dùng đúng khung partition/order.

## 7b. Column type ĐÃ BỎ (v0.1.38)

Field-interface "Sổ/Lũy kế (window)" ở Add field **đã gỡ hẳn** (`PtdlWindowFieldInterface` + `windowInterface.tsx` xoá). Lý do: nó là UI cấu hình thứ 2, gõ-tay, kém hơn trang tập trung → bất nhất. Giờ **cột window chỉ là 1 field number thường**; logic (partitionBy/orderBy/input/accumulator) ở `options.ptdlWindow`, cấu hình 100% qua trang **Settings → "Sổ / Lũy kế (window)"**. Trang này khi "Thêm cột sổ" tạo field `interface:'number'` (không phải interface đặc biệt). Engine đọc `options.ptdlWindow` bất kể interface → live-verified: number field + ptdlWindow options → list thấy, recompute khớp balance_after. (Field cũ `balance_after` interface `ptdlWindow` vẫn chạy — engine không quan tâm interface.)

## 8. TODO / nâng cấp (bản v0.1.27)
- **Recompute-partition hiện quét cả phân vùng** (không anchor-from-point). Đúng + chỉ đụng 1 phân vùng, nhưng phân vùng cực dài thì nên thêm anchor (base = balance_after dòng ngay trước điểm sửa, chỉ tính đuôi) — SQL đã có trong prototype (ledger-engine.mjs).
- **Field-interface (Add field) vẫn input gõ tay** tên cột — nhưng **trang quản lý tập trung đã có picker cột thật + nút Tính lại** (v0.1.30), nên đây chỉ còn là điểm nice-to-have cho lối tạo-qua-Add-field.
- **partition value = null** bị bỏ (dùng `IS NULL` cho where nhưng replacements null → cần soát). Ledger nên luôn đủ product+warehouse.
- ~~**weighted_avg/fifo** cần recursive CTE~~ → **ĐÃ LÀM KHÁC HƯỚNG (v0.1.34+):** tách **mode "scan/costing" thứ 4** (JS ordered-scan, không phải recursive-CTE). FIFO/LIFO/FEFO/weighted-average là các `AllocationStrategy`; live-verified COGS phân biệt; multi-source (nhiều bảng) ở v0.1.57–58. Xem `COSTING.md`.
- **signed_qty** trong demo set tay; thực tế nên là 1 **local computed column** = `qty * IF(direction=='in',1,-1)` (3 mode ghép trên cùng bảng) — HOẶC dùng **input = biểu thức SQL** (v0.1.33, xem dưới) để khỏi cột trung gian.

## 9. Input = cột HOẶC biểu thức SQL (v0.1.33)

`input` có 2 chế độ (config `inputExpr: boolean`):
- **Cột** (mặc định): tên cột → SQL quote thành `"col"`.
- **Biểu thức SQL** (`inputExpr:true`): dùng **verbatim** trong `<fn>(<expr>) OVER(…)`. VD `qty * CASE WHEN direction = 'in' THEN 1 ELSE -1 END` → **khỏi cần cột `signed_qty` trung gian** (window tự tính dấu inline; cascade luôn đúng vì đọc qty/direction trực tiếp).

UI (trang quản lý): Segmented **Cột | Biểu thức SQL**; chế độ biểu thức = textarea monospace + **"＋ Chèn cột"** (shared FieldPickerCascader chèn tên cột tại caret). **Bảo mật**: chỉ admin (fields API gated); `assertSafeExpr` chặn `;`, `--`, `/* */` (defense-in-depth). Live-verified: expr `qty * CASE…` cho ra 100/70/60/20/60/-20 KHỚP balance_after (không dùng signed_qty); expr độc `qty); DROP TABLE…; --` bị chặn (500, bảng nguyên). JOIN cho nested partition: chưa (chưa cần).
