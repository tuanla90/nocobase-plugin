# Công thức & Trường tự tính — Hướng dẫn sử dụng

> Viết **công thức kiểu Excel** (hơn 400 hàm) ở khắp NocoBase: cột hiển thị (kể cả HTML & gộp qua quan hệ),
> giá trị mặc định của form, cột **lưu-trữ do server tự tính lại** theo quan hệ, và các phép **tuần tự / cửa sổ**
> như số dư lũy kế hay tồn kho FIFO / bình quân — **không cần code**.

**Nhóm:** Blocks / Fields · **Chạy trên:** /admin (classic) + /v/ (modern) · **Phiên bản:** 0.1.86

## Sau khi cài, có gì mới?

Plugin mở ra **5 cách dùng công thức**, mỗi cách một chỗ khác nhau:

| Cách dùng | Nó làm gì | Chỉnh ở đâu | Có ghi vào cột không? |
|---|---|---|---|
| **Cột công thức** | Thêm một cột hiển thị tính tại chỗ (badge màu, HTML, gộp dòng con…) | Bảng → **Thêm cột → “Cột công thức”** | Không — chỉ hiển thị |
| **Công thức trên field** | Cho một field sẵn có hiện **kết quả công thức** thay cho giá trị thô | ⚙ của field → **“Công thức”** | Không — chỉ hiển thị |
| **Giá trị mặc định** | Tự điền ô khi người dùng nhập form | Field → **Giá trị mặc định → “ƒ Dùng công thức Excel”** | Có — khi lưu form |
| **Giá trị tự tính (server)** | Cột số/chữ/ngày **server tự tính lại** khi dữ liệu liên quan đổi | ⚙ của **cột thật** → **“Giá trị tự tính”** | Có — lưu-trữ |
| **Tính tuần tự / Sổ · Lũy kế** | Số dư lũy kế, tồn kho, giá vốn FIFO / bình quân | ⚙ Settings → **“Tính tuần tự”** | Có — lưu-trữ |

- **Hai trang mới trong Settings:** **“Công thức tự tính”** (quản lý các cột tự tính server) và **“Tính tuần tự”** (sổ/lũy kế/giá vốn).
- Ở mọi ô nhập công thức đều có sẵn: nút **chèn field / quan hệ**, danh sách **Ví dụ**, bảng tra **Hàm & cú pháp**, khung **Xem trước** (tính thử ngay), và nút **“✨ AI viết hộ”** (mô tả bằng lời → AI viết công thức).

## Cấu hình ở đâu?

| Giao diện | Trang cấu hình chung |
|---|---|
| **Modern (`/v/`)** | ⚙ **Settings** → **“Công thức tự tính”** và **“Tính tuần tự”** |
| **Classic (`/admin`)** | **Settings** → **“Công thức tự tính”** (`/admin/settings/ptdl-computed`) và **“Tính tuần tự”** (`/admin/settings/ptdl-scancalc`) |

> 💡 **Cột công thức**, **Công thức trên field** và **Giá trị mặc định** thì **không có trang riêng** — chỉnh ngay trên
> cột / field bằng nút bánh răng ⚙ (bật **UI Editor** trước).

### Cách tham chiếu dữ liệu (dùng chung mọi nơi)

- **Cột của dòng hiện tại** → `data.<tên_cột>` — vd `data.subtotal`.
- **Qua quan hệ** → `data.<quan_hệ>.<cột>` — vd `SUM(data.items.line_amount)` (gộp nhiều dòng con), `data.product.unit_price` (kéo qua quan hệ một-một).
- **Bảng tra cứu** (một collection khác, không phải quan hệ) → gõ **thẳng** `<tên_bảng>.<cột>`, **KHÔNG** có `data.` — vd `bang_gia.he_so`.
- **Nối chuỗi** dùng `&`. **So sánh** dùng `==`, `<>`, `> < >= <=`; **VÀ** dùng `&&`. Tên hàm viết HOA/thường đều được.

## Hàm bổ sung (ngoài 400 hàm Excel)

Ngoài ~400 hàm Excel (formulajs), engine có thêm các hàm kiểu **AppSheet / Google Sheets** — mở **“Hàm & cú pháp”** ngay trong ô công thức để xem danh sách đầy đủ:

| Nhóm | Hàm | Ví dụ |
|---|---|---|
| **Chuỗi** | `SPLIT(text, sep)` tách → mảng · `TEXTJOIN(sep, bỏ_ô_trống, …)` gộp mảng → chuỗi · `CONTAINS` · `STARTSWITH` · `ENDSWITH` · `INITIALS(tên)` viết tắt | `TEXTJOIN(", ", TRUE, data.items.ten)` |
| **Danh sách / mảng** | `LIST(a, b, …)` tạo mảng · `UNIQUE(mảng)` / `DISTINCT` lọc trùng · `INTERSECT(a, b)` giao 2 mảng · `ANY(mảng)` phần tử đầu · `IN(x, mảng)` có thuộc? · `ISNOTBLANK(x)` | `TEXTJOIN(", ", TRUE, UNIQUE(data.items.loai))` |
| **Ngày — cộng/trừ** | `ADDDAYS(date, n)` · `ADDMONTHS(date, n)` · `ADDYEARS(date, n)` · `DATEADD(date, n, "day"/"month"/"year")`. **`n` âm để trừ**; clamp cuối tháng; kết quả là chuỗi ngày (chain được với `YEAR`/`MONTH`/`DAY`/`TEXT`) | `ADDDAYS(data.order_date, 30)` (hạn +30 ngày) |
| **Regex** (kiểu Google Sheets) | `REGEXMATCH(text, "mẫu")` → true/false · `REGEXEXTRACT(text, "mẫu")` lấy phần khớp (hoặc nhóm bắt `(...)` đầu tiên) · `REGEXREPLACE(text, "mẫu", "thay")` thay **tất cả** | `REGEXEXTRACT(data.sku, "[0-9]+")` |
| **Lọc / gộp có điều kiện** | `FILTER` / `SELECT` (≈ SELECT của AppSheet) · `SUMIFS` `COUNTIFS` `AVERAGEIFS` | `SUM(FILTER(data.items.amt, data.items.status == "active"))` |

**3 lưu ý:**
- **Regex phải nhân đôi `\`**: gõ `\\d`, `\\w`, `\\s` (vì mẫu là chuỗi). Dùng lớp ký tự `[0-9]`, `[A-Z]` thì khỏi cần.
- `TEXTJOIN` cần **≥ 3 tham số**: `TEXTJOIN(dấu_phân_cách, TRUE/FALSE, giá_trị)`.
- `UNIQUE` / `REGEX*` / `SPLIT` / `TEXTJOIN` dùng ở **Cột công thức / Công thức trên field / Giá trị tự tính (Computed)** — **không** dùng ở **Tính tuần tự** (chế độ SQL). `CONTAINS` **phân biệt HOA/thường** (bọc `LOWER(...)` nếu muốn bỏ qua).

## Dùng thế nào (từng bước)

### Tình huống A — Thêm một **cột hiển thị** tính từ công thức (badge màu, HTML, gộp dòng con)

1. Mở trang có **bảng (Table)** → bật **UI Editor**.
2. Bấm **＋ Thêm cột** → chọn **“Cột công thức”** (nằm trong nhóm cột khác / cột ảo).
3. Mở ⚙ trên đầu cột → **“Thiết lập công thức”** (classic: **“Sửa công thức”**).
4. Nhập **Công thức**, ví dụ:
   - Badge trạng thái: `IF(data.stock>0, TAG("Còn","green"), TAG("Hết","red"))`
   - Gộp dòng con: `SUM(data.items.line_amount)`
   - Ghép chữ + HTML: `CONCATENATE("<b>", data.name, "</b>")`
5. Chỉnh thêm nếu cần: **Kết xuất HTML** (bật để hiện đậm/màu/`TAG`…), **Căn lề**, và **Định dạng → Kiểu** (Auto / Số / Ngày) → **Lưu**.

> 💡 Có sẵn các hàm HTML: `B` `I` `U` `BR` `COLOR(x,màu)` `BG` `TAG(text,màu)` `DOT(màu,size)` `LINK(url,text)` `IMG(src,size)`.
> Cột này **không lưu vào cơ sở dữ liệu** — nó tính lại mỗi lần hiển thị nên luôn “tươi”.

### Tình huống B — Cho một **field sẵn có** hiển thị theo công thức

1. Trong bảng / trang chi tiết / form, bật **UI Editor** → bấm vào **field** cần đổi.
2. Mở ⚙ → chọn **“Công thức”**.
3. Nhập công thức (dùng `data.*` như trên; giá trị gốc của chính field vẫn dùng được) → chọn **Kết xuất HTML / Căn lề / Định dạng** nếu cần → **Lưu**.

### Tình huống C — **Tự điền** một ô khi nhập form (giá trị mặc định)

1. Vào **quản lý trường** của bảng, mở field cần tự điền → phần **Giá trị mặc định**.
2. Bấm liên kết **“ƒ Dùng công thức Excel”**.
3. Nhập công thức theo **giá trị các field trong form**, vd `data.quantity * data.unit_price` → **Lưu**.
4. ✅ Khi người dùng nhập form, ô này **tự tính lại mỗi khi field liên quan thay đổi**. Muốn bỏ thì bấm **“✕ Bỏ công thức”**.

### Tình huống D — Cột **lưu-trữ** do **server tự tính lại** theo quan hệ (Giá trị tự tính)

Dùng khi cần một con số **được lưu thật** và **luôn đúng** kể cả khi sửa dòng con, sửa dòng cha, hay đổi bảng cấu hình.

1. Tạo (hoặc chọn) một **cột thật** kiểu **số / chữ / ngày / boolean** trên bảng.
2. Trong **Table**, bật UI Editor → mở ⚙ của cột đó → **“Giá trị tự tính”** → **“Giá trị tự cập nhật (công thức)”**.
   *(Cũng có thể mở nhanh từ biểu tượng 🧮 cạnh field trong form, hoặc từ Settings → “Công thức tự tính”.)*
3. Nhập công thức — cùng dòng, gộp quan hệ hoặc kéo quan hệ:
   `data.subtotal - data.discount` · `SUM(data.items.line_amount)` · `data.product.unit_price`
4. Chọn **Tính khi** (tích được nhiều — ghép thành kịch bản):
   - **Khi tạo** — tính 1 lần lúc tạo dòng (đóng băng, vd số hoá đơn, giá lúc đặt).
   - **Khi sửa** — mỗi lần mở dòng đó bấm lưu là tính lại.
   - **Khi nguồn thay đổi** — tự tính lại khi thêm/xoá dòng con, sửa dòng cha, hoặc sửa **bảng cấu hình** (đây là phần “lan” fan-out).
   - 💡 Tích **cả ba** = luôn đúng tuyệt đối (mặc định).
5. (Tuỳ chọn) đặt **Khi lỗi** = **Ghi null** hay **Giữ giá trị cũ**; bấm **Chạy** trong **“Chạy thử trên 1 bản ghi”** để xem trước → **Lưu**.
6. ✅ Server tự tính lại các dòng liên quan; trang tự làm mới (không cần F5). Muốn tính lại toàn bộ bảng: dùng nút **“Tính lại”** ở trang **“Công thức tự tính”**.

### Tình huống E — **Số dư lũy kế / Tồn kho / Giá vốn** (Tính tuần tự)

Dùng cho các phép **cộng dồn theo thứ tự** (số dư sau mỗi phiếu, tồn kho) và **giá vốn xuất kho** (FIFO / bình quân).

1. Vào ⚙ **Settings → “Tính tuần tự”** → tab **“Quy tắc”** → bấm **“Thêm”**.
2. **① Tổng quan / Chiến lược** — đặt tên và chọn **Kiểu tính**:
   - **Theo dòng (lũy kế)** — chạy trong DB: **Số dư lũy kế (SUM)**, đếm/nhỏ nhất/lớn nhất/trung bình lũy kế, **Số thứ tự (ROW_NUMBER)**.
   - **Theo trạng thái (theo lô)** — quét từng dòng để định giá tiêu hao: **Giá vốn FIFO**, **Bình quân gia quyền**, **FEFO (hết hạn trước)**.
3. **② Đầu vào** — chọn **bảng dữ liệu**, cột **lượng có dấu** (+ nhập / − xuất), **Phân vùng theo cột** (mỗi sản phẩm/kho một sổ riêng), **Sắp theo cột** (thứ tự lũy kế; nên kết thúc bằng `id` để phá hoà). Giá vốn cần thêm **cột đơn giá dòng nhập**.
4. **③ Kết quả** — chọn ghi số liệu nào vào cột số nào (số dư lượng, số dư giá trị, giá vốn xuất/COGS, đơn giá bình quân…).
5. **④ Nâng cao** — số **chữ số thập phân**, **cách làm tròn**, xử lý **xuất quá tồn** và **thiếu đơn giá** (nếu là giá vốn) → **Lưu**.
6. ✅ Lưu là **tự tính lại**. Cần chạy lại từ đầu thì bấm **“Tính lại toàn bộ”**.

> 💡 Có nhiều bảng nhập/xuất riêng? Ở **② Đầu vào** chọn **“Nhiều bảng (nhập–xuất tách)”** — hệ thống trộn tất cả thành **một sổ theo thời gian** rồi định giá.

## Mẹo & lưu ý

- **Chọn đúng công cụ theo nhu cầu “có lưu hay không”:** cần **hiển thị** đẹp/nhanh → *Cột công thức* hoặc *Công thức trên field* (không tốn cột). Cần con số **được lưu và luôn đúng theo quan hệ** → *Giá trị tự tính*. Cần **cộng dồn theo thứ tự / giá vốn** → *Tính tuần tự*.
- ⚠️ **Giá trị tự tính** và **Tính tuần tự** là **tính ở phía máy chủ** và **ghi đè cột thật** — hãy dùng **Chạy thử** / **Xem trước** trước khi lưu trên dữ liệu lớn.
- **Quan hệ lồng 2+ tầng** (`data.a.b.c`) thường **không nạp được** → so theo **khoá id** thay vì lồng sâu (vd `bang.rel_id == data.x_id`).
- Chỉ dùng **hàm có trong danh sách** (mở **“Hàm & cú pháp”**); **không có** `XLOOKUP` hay mảng-động kiểu Excel mới. `VLOOKUP` cần mảng 2D trong 1 field JSON, **không** dùng cho bảng collection.
- **Bí công thức?** Bấm **“✨ AI viết hộ”**, mô tả bằng lời (vd “tổng tiền các dòng đang active”) → AI đề xuất; hoặc dùng **“AI sửa lỗi”** / **“Giải thích”** cho công thức đang có.
- Cột **Giá trị tự tính** tự làm mới trên các máy khác qua WebSocket — sửa dòng con là các trang liên quan tự cập nhật, **không cần F5**.
- Chạy trên **cả hai** giao diện: classic `/admin` và modern `/v/`. Bật/sửa quy tắc **không cần restart** server.

## Gỡ / tắt

- **Bỏ một Cột công thức / Công thức trên field:** mở ⚙ của cột/field → **Xoá** (với cột), hoặc mở lại **“Công thức”** và xoá nội dung. Dữ liệu bảng **không bị ảnh hưởng** (chúng chỉ hiển thị).
- **Bỏ Giá trị mặc định bằng công thức:** mở lại Default value → **“✕ Bỏ công thức”**.
- **Bỏ một cột Giá trị tự tính:** xoá công thức (để trống) trong ⚙ **“Giá trị tự tính”**, hoặc **“Xoá”** rule ở trang **“Công thức tự tính”** → cột trở lại field số/chữ bình thường, **giữ nguyên giá trị đang có**.
- **Bỏ một quy tắc Tính tuần tự:** vào trang **“Tính tuần tự”** → **“Gỡ mục”** — dữ liệu trong cột **vẫn được giữ**.
- **Gỡ hẳn:** tắt plugin trong **Plugin Manager**. Các công thức hiển thị ngừng render; cấu hình *Giá trị tự tính* / *Tính tuần tự* đã lưu vẫn còn trong cơ sở dữ liệu để dùng lại nếu bật lại (nhưng sẽ **không tự tính lại** khi plugin tắt).

---

### Cho nhà phát triển

Engine ~400 hàm formulajs + helper HTML + hàm kiểu AppSheet/regex (`SPLIT` `TEXTJOIN` `UNIQUE`/`DISTINCT` `CONTAINS` `LIST` `IN` `ANY` `REGEXMATCH`/`REGEXEXTRACT`/`REGEXREPLACE` `INTERSECT` `INITIALS` `ADDDAYS`/`ADDMONTHS`/`ADDYEARS`/`DATEADD` — trong `CUSTOM_FNS`, `src/shared/formulaEngine.ts`). Năm điểm cắm: cột ảo (`formulaColumnModel` + classic `formulaColumnClassic`), field hiển thị (`formulaFieldModel`), giá trị mặc định biên dịch sang RunJS (`formulaDefaultValue`), rule tự tính server lưu ở `ptdlComputedRules` (client `computedRuleClient`, tự phát hiện phụ thuộc + fan-out + WS live-refresh), và tính tuần tự/cửa sổ + giá vốn (`ScanCalcManager`, `excelToSql`). Chi tiết thiết kế: `COMPUTED-FIELD.md` (§4b danh sách ví dụ), `ROLLUP.md`, `LEDGER-WINDOW-MODE.md`, `COSTING.md`, và `README.md` (tiếng Anh).
</content>
</invoke>
