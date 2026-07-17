# Giá vốn / Tiêu hao theo lô (scan mode) + best-practice

> **v0.1.44-45 — engine refactor quanh `allocate()`.** Kernel = `allocate(need) → [{qty,price,sourceRow}]`;
> **FIFO · LIFO · FEFO · Bình quân** chỉ là các `AllocationStrategy` khác nhau ("lấy lô nào"). Có allocation
> rồi thì mọi chỉ tiêu = aggregate: consumed qty/value/unit-cost · running qty/value · avg. Outputs nhóm:
> **Tồn** (state, nên lưu) · **Giao dịch** (mỗi dòng ra) · **Định giá/suy diễn** (avg = value/qty, có thể để
> cột computed) · **Truy vết** (JSON lô, tuỳ chọn). Live: 4 strategy cho kết quả KHÁC nhau (COGS
> 2590/2650/2590/2610; FEFO sắp lô theo cột hạn dùng). Specific-Identification + trace-snapshot = TODO.
>
> **v0.1.49 — Nâng cao (edge cases) + Tabs + overview + tooltip.** Dialog giờ chia **Tabs theo bước** (① Tổng quan · ② Đầu vào · ③ Kết quả · ④ Nâng cao); **Tên** dời sang tab Tổng quan; nút Segmented đổi size **medium**; thêm **tooltip (?)** cho các mục khó. Tab **Nâng cao** đủ bộ: **Xuất quá tồn** (`negativePolicy`: Cho phép tồn âm = mặc định, phần thiếu định giá theo đơn giá gần nhất, sinh backorder — inflow sau tự bù · Báo lỗi = recompute dừng, báo dòng · Bỏ qua = chỉ xuất phần còn, tồn về 0) · **Thiếu đơn giá** (`missingCostPolicy`: Bằng 0 mặc định · Báo lỗi · Dùng giá trước = đơn giá nhập gần nhất, CHỈ áp cho cost mode = Cột bỏ trống, không áp cho formula) · **Số lẻ** + **Cách làm tròn** (`roundMode`: half_up/half_even/up/down/ceil/floor). Engine `scanLedger` thread policy + `lastPrice`; kernel `allocate(need,{allow,fallback})` + `fillBackorders` (inflow bù backorder trước), `availableQty` (chỉ lô dương). Live-verified: floor@2 → COGS 386.66 (vs half_up 386.67); offline: allow rq=−5/ignore cap 10/error throw, FIFO oversell+refill nets backorder (rq=3), missing previous→1500 vs zero→1000. **Đổi hành vi mặc định**: oversell giờ = tồn ÂM (allow) thay vì cap-0; dữ liệu không oversell thì không đổi.

> **v0.1.47 — config chia 4 nhóm + input mềm.** Dialog cấu hình (page "Tính tuần tự" gộp cả window + scan)
> gồm **① Chiến lược** (kiểu tính) · **② Đầu vào** (bảng + ánh xạ cột + phân vùng + sắp xếp) · **③ Kết quả**
> (chọn cột ghi ra) · **④ Nâng cao** (làm tròn). **Lượng nhập/xuất mỗi dòng** giờ có 4 chế độ: **Cột có dấu**
> (1 cột ± như cũ) · **2 cột** (cột VÀO − cột RA) · **Theo cột phân loại** (cột enum = giá trị "nhập" ⇒ +, còn
> lại ⇒ −, nhân cột lượng ≥0) · **Công thức** (Excel `data.<field>`, vd `IF(data.type=="in",data.qty,-data.qty)`).
> **Đơn giá** cũng 2 chế độ: **Cột** hoặc **Công thức**. **Nâng cao → làm tròn** N chữ số thập phân (mặc định 4).
> Server: `makeResolvers()` dựng qtyOf/priceOf theo chế độ; `evalNum()` chạy Excel-engine trên `row.toJSON()`.
> Live-verified (formula qty + formula cost `data.unit_cost/3` + round=2 → COGS `[0,0,800,0,386.67]` khớp tay).

Mode thứ 4 của `@ptdl/plugin-formula` (v0.1.34–37, live-verified). Bổ trợ 3 mode kia:

| Mode | Engine | Dùng cho |
|---|---|---|
| local | Excel formula (per-row JS) | `signed_qty = qty * IF(direction=='in',1,-1)` |
| aggregate/rollup | repository.aggregate (SQL) | `on_hand = SUM(movements.signed_qty)` |
| window | SQL window `OVER()` | số dư lũy kế, số thứ tự (ROW_NUMBER) |
| **scan (mới)** | **JS ordered-scan có trạng thái** | **giá vốn FIFO / bình quân gia quyền** |

## 1. Vì sao là JS-scan chứ không phải SQL

FIFO/bình quân **mang trạng thái order-dependent** mà window function thuần không diễn đạt được:
- Bình quân di động: avgₙ phụ thuộc avgₙ₋₁ (đệ quy).
- FIFO: mang **hàng đợi lớp** `[{qty,cost}]`, xuất tiêu thụ lớp cũ nhất; đẻ ra **nhiều output** (đơn giá vốn, COGS, tồn SL/GT).

→ Quét 1 phân vùng theo thứ tự trong JS: FIFO = mảng thật (trivial), ghi **nhiều cột** một lượt, chạy mọi DB. Bù tốc độ bằng: chỉ quét phân vùng bị đụng (from-point) + đóng kỳ.

## 2. Mô hình sổ (bắt buộc đúng thì giá vốn mới đúng)

`stock_movements` (sổ **append-only**):
- `qty_signed` — **+ nhập / − xuất** (nên là 1 cột **local computed** = `qty * IF(direction=='in',1,-1)`).
- `unit_cost` — đơn giá **cho dòng NHẬP** (dòng xuất bỏ trống; scan tự suy giá vốn xuất).
- `moved_at`, `id` — thứ tự.

## 3. Cấu hình (no-code) — dialog 4 nhóm (v0.1.47)

Settings → **"Tính tuần tự"** (gộp window + scan) → Thêm. Dialog chia 4 nhóm:

**① Chiến lược** — Kiểu tính. Chọn strategy theo lô (FIFO | LIFO | FEFO | Bình quân gia quyền) ⇒ hiện phần scan.

**② Đầu vào**
- **Bảng** (collection sổ).
- **Lượng nhập/xuất mỗi dòng** — chọn 1 trong 4 chế độ:
  - *Cột có dấu*: 1 cột `qty_signed` (+ nhập / − xuất) — kiểu cũ.
  - *2 cột (vào/ra)*: cột lượng VÀO − cột lượng RA.
  - *Theo cột phân loại*: cột enum + giá trị nghĩa là "nhập" (vd `in`) + cột lượng (luôn ≥0). Dòng khớp ⇒ +, còn lại ⇒ −.
  - *Công thức*: Excel `data.<field>`, vd `IF(data.type=="in", data.qty, -data.qty)`.
- **Đơn giá dòng nhập** — *Cột* (`unit_cost`) hoặc *Công thức* (vd `data.amount / data.qty`).
- **Cột hạn dùng** (chỉ khi FEFO).
- **Phân vùng** (`product_id, warehouse`), **Sắp theo** (`moved_at ↑, id ↑`; bấm ↑/↓ trên thẻ đổi chiều).

**③ Kết quả** — chọn cột ghi ra (để trống nếu không cần), nhóm sẵn: **Tồn** (số dư lượng/giá trị) · **Giao dịch** (lượng/giá trị tiêu hao, đơn giá đã định) · **Suy diễn** (đơn giá BQ, đơn giá tiêu hao — chọn ở đây sẽ **tự tạo cột computed** = value/qty) · **Truy vết** (JSON lô).

**④ Nâng cao** — **Làm tròn** N chữ số thập phân (mặc định 4).

Sửa/lưu quy tắc → **tự backfill**. Sửa 1 phiếu (qty/cost) → **tự quét lại phân vùng** (đã verify cascade).

## 4. Đóng kỳ / tồn tại thời điểm

Action **`POST /api/ptdlScan:closing?collection=&asOf=`** → trả **tồn SL + tồn GT + đơn giá BQ mỗi phân vùng** tại thời điểm `asOf` (bỏ trống = hiện tại). Đây là **tồn cuối kỳ**; **tồn đầu kỳ** = tồn cuối kỳ trước; **chênh** = hiệu hai mốc. Read-only, không ghi.

## 5. BEST-PRACTICE (luật quy trình, config không ép được)

1. **Sổ append-only.** Sai thì ghi **dòng điều chỉnh**, KHÔNG sửa/xoá dòng cũ → giữ audit + recompute tất định.
2. **Giá vốn đã post là khoá.** Kế toán không cho đổi hồi tố giá vốn kỳ đã đóng. Cơ chế scan tự tính lại khi sửa lùi ngày — nên **chỉ cho sửa lùi ngày trong kỳ CHƯA đóng**. (Khoá kỳ = luật của bạn; v1 chưa ép ở code.)
3. **Đóng kỳ định kỳ** để cắt đuôi lũy kế (hiệu năng) + làm mốc audit. Có thể snapshot `closing` vào 1 bảng kỳ (Line Generator) làm tồn đầu kỳ sau.
4. **Xuất quá tồn (âm kho).** FIFO hết lớp → phần dư tính giá 0; bình quân dùng avg hiện tại. Nên chặn ở nghiệp vụ, không để âm.
5. **`qty_signed` nên là local computed**, không nhập tay → 1 nguồn sự thật cho dấu.

## 6. Đã kiểm chứng (live nb-local)

Sổ 5 phiếu (+10@100, +10@120, −15, +5@130, −8):
- **Bình quân**: COGS tổng **2610**, tồn cuối **2 / 240**, các dòng khớp tay 100%.
- **FIFO**: COGS tổng **2590**, tồn cuối **2 / 260**, khớp tay 100%.
- Sửa 1 phiếu (cost 100→200) → cả 2 method tự quét lại đúng.
- `closing` asOf giữa kỳ → tồn tại thời điểm đúng (avg 5/800, fifo 5/600).

## 7. Đa nguồn — nhập/xuất tách nhiều bảng (v0.1.57–58)

Case thực tế: chứng từ nhập & xuất nằm ở **các bảng khác nhau** (vd `stockIn` và dòng-xuất `stockOutLine` thuộc phiếu `stockOutHeader`), mỗi bảng lưu **kiểu khác nhau** (ngày ở chính dòng, hoặc ở bảng cha qua quan hệ). Không thể gộp thành một cột có dấu → cần **scan đa nguồn**: đọc mọi bảng, mỗi bảng tự khai công thức, hệ thống **trộn thành MỘT sổ** theo thời gian rồi định giá.

**Cấu hình** — `ptdlScanRules.sources` (JSON), mỗi phần tử = một bảng nguồn:
- `collection` — bảng nguồn.
- `qtyFormula` — công thức Excel → **lượng CÓ DẤU** (bảng nhập `data.sl`, bảng xuất `-data.sl`).
- `orderExpr` — công thức → giá trị (ngày/số) để **trộn** các bảng; **được drill quan hệ** vd `data.phieu.ngay` (ngày nằm ở phiếu cha).
- `partitionExpr` — công thức → **khóa gộp sổ** (vd `data.sp`); các dòng cùng khóa ở MỌI bảng mới chung một sổ.
- `costMode`/`costField`/`costFormula` — đơn giá dòng nhập (bảng xuất để trống → engine tự suy giá vốn xuất).
- `expiryExpr` — hạn dùng (FEFO).
- `outUnitCost` / `outCogs` / `outRunningQty` / `outRunningValue` / `outConsumedQty` — cột ghi kết quả **trên chính bảng đó** (mỗi dòng ghi về bảng gốc của nó).

`collectionName` để rỗng khi đa nguồn. Engine = `ScanManager.recomputeMulti()`: load từng bảng (auto-`appends` quan hệ trong công thức qua `collectionAppends`), tính `{part, ord, qty, price}` mỗi dòng, group theo `part` **xuyên bảng**, merge-sort `(ord, srcIdx, id)`, chạy chung `scanLedger`, ghi output về `repos[srcIdx]`. Hook mọi bảng nguồn: đổi 1 dòng ở bảng nào → `recomputeMulti` cả rule (đổi bảng nhập cũng tính lại cột giá vốn ở bảng xuất). UI: tab Đầu vào có nút **1 bảng / Nhiều bảng (nhập–xuất tách)**; mỗi bảng một thẻ (collection + 3 công thức + đơn giá + map cột output), công thức dùng cascader drill quan hệ.

## 8. Đã kiểm chứng (live nb-local)

Đơn nguồn — sổ 5 phiếu (+10@100, +10@120, −15, +5@130, −8):
- **Bình quân**: COGS tổng **2610**, tồn cuối **2 / 240**, các dòng khớp tay 100%.
- **FIFO**: COGS tổng **2590**, tồn cuối **2 / 260**, khớp tay 100%.
- Sửa 1 phiếu (cost 100→200) → cả 2 method tự quét lại đúng.
- `closing` asOf giữa kỳ → tồn tại thời điểm đúng (avg 5/800, fifo 5/600).

Đa nguồn — 2 bảng `msIn` (ngày ở dòng) + `msOutLn` (ngày qua `data.phieu.ngay`), bình quân, partition `data.sp`:
- Sổ trộn: 01-01 nhập 10@100 · 01-02 xuất 4 · 01-03 nhập 10@200 · 01-04 xuất 8.
- Kết quả khớp tay: tồn 10→6→16→8, đơn giá vốn xuất **100** rồi **162.5**, COGS **400** + **1300**.
- Xoá dòng nhập 200 → hook tự tính lại: dòng xuất-8 thành COGS **800**, tồn **−2** (negative allow).
- Round-trip UI: create/edit/save (APIClient) giữ nguyên `sources` 2 bảng, tự backfill đúng.

## 9. TODO
- Đóng kỳ **có lưu + khoá** (bảng kỳ + chặn sửa kỳ đã đóng) — cần chốt policy khoá.
- Ghi output qua raw bulk UPDATE (hiện per-row trong transaction) nếu phân vùng rất lớn.
- LIFO / định danh đích (specific-identification) nếu cần.
- Đa nguồn: scope recompute theo partition (hiện full-rule mỗi lần đổi); `closing`/FEFO cho đa nguồn.
