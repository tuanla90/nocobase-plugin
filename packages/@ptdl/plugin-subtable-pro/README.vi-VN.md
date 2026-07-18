# Bảng con Pro — Hướng dẫn sử dụng

> Nâng cấp field **bảng con** (quan hệ hasMany / nhiều-nhiều) thành công cụ nhập dòng hàng chuyên nghiệp:
> thêm **dòng tổng**, đổi **kiểu hiển thị** (bảng / danh sách / thẻ), có **nút +/− số lượng**, và **cầu nối** để
> bấm 1 dòng ở block khác là tự thêm/tăng dòng ở đây — hợp cho **báo giá, đơn hàng, soạn hàng**. Lưu vẫn **100% như bản gốc**.

**Nhóm:** Khối & Trường (Blocks / Fields) · **Chạy trên:** /v/ (modern) · **Phiên bản:** 0.2.7

## Sau khi cài, có gì mới?

- **Một lựa chọn thành phần trường mới: “Sub-table Pro”** — áp cho field quan hệ **một–nhiều (hasMany)** hoặc **nhiều–nhiều**.
- **Một mục cấu hình mới trên field:** **“Cấu hình Sub-table Pro”** (mở bằng ⚙ của field) — gồm 3 thẻ **Hiển thị**, **Dòng tổng**, **Kết nối**.
- **Một hành động mới cho block sản phẩm:** **“Gửi dòng qua kênh (bridge)”** — nút thêm vào thẻ/dòng để đẩy sản phẩm sang bảng con.
- **Một tuỳ chọn mới cho block Bảng:** **“Gửi dòng khi bấm (bridge)”** — bấm 1 dòng là gửi luôn, không cần nút.
- ⚠️ **Không tự bật.** Bảng con của bạn vẫn giữ nguyên như cũ cho tới khi bạn **chọn tay** “Sub-table Pro” cho field.
- **Không thêm menu, không thêm trang Settings** nào cả — mọi thứ chỉnh ngay trên field/block.

## Cấu hình ở đâu?

Plugin **không có trang cấu hình riêng**. Bạn chỉnh trực tiếp trên field và block (bật **UI Editor** trước):

| Cần làm gì | Mở ở đâu |
|---|---|
| **Bật widget** cho 1 field quan hệ | ⚙ của field → chọn **Thành phần trường** (Field component) → **“Sub-table Pro”** |
| Kiểu hiển thị, số lượng, dòng tổng, cầu nối (**bên nhận**) | ⚙ của field → **“Cấu hình Sub-table Pro”** |
| Nút gửi dòng trên block sản phẩm (**bên gửi**) | Thêm hành động **“Gửi dòng qua kênh (bridge)”** vào thẻ/dòng → ⚙ của nút → **“Cấu hình gửi dòng”** |
| Gửi khi **bấm cả dòng** (chỉ block **Bảng**) | ⚙ của block Bảng → **“Gửi dòng khi bấm (bridge)”** |

## Dùng thế nào (từng bước)

### Tình huống A — Bảng con đẹp hơn: nút số lượng +/− và dòng tổng (đơn hàng / báo giá)

1. Vào trang có form chứa bảng con (ví dụ **Đơn hàng** có bảng con **Chi tiết**). Bật **UI Editor**.
2. Bấm vào field bảng con → mở ⚙ → **Thành phần trường** → chọn **“Sub-table Pro”**.
3. Mở ⚙ lần nữa → **“Cấu hình Sub-table Pro”** → thẻ **Hiển thị**:
   - Ở **“Cột số lượng (+/−)”** chọn cột số lượng (vd `Số lượng`). Cột đó biến thành nút **− [n] +** để nhập nhanh.
   - (tuỳ thích) chỉnh **“Kiểu nút số lượng”** (Liền / Tách 2 icon), **“Căn lề số”**, **“Màu nút”**, **“Nút full-width (theo cột)”**.
4. Sang thẻ **Dòng tổng** → bật **“Hiện dòng tổng”** → tích các cột ở **“Cột cần tính tổng”** (vd `Thành tiền`, `Khối lượng`).
5. **Lưu**. ✅ Cuối bảng có dòng **tổng** (biểu tượng Σ + số dòng); các cột đã chọn được cộng lại.

> 💡 Ô **“Xem trước”** ngay trên đầu hộp cấu hình cho thấy nút số lượng và dòng tổng thay đổi theo lựa chọn — cứ thử trước khi Lưu.

### Tình huống B — Đổi sang kiểu Thẻ / Danh sách (ảnh + tên + đơn giá + thành tiền)

1. Mở **“Cấu hình Sub-table Pro”** → thẻ **Hiển thị** → **“Kiểu hiển thị”** chọn **Danh sách** hoặc **Thẻ**.
2. Khi ở Thẻ/Danh sách sẽ hiện thêm 4 ô để chỉ rõ lấy dữ liệu từ cột nào: **“Cột tiêu đề”**, **“Cột phụ đề”**, **“Cột ảnh”**, **“Cột đơn giá”**.
   - Các ô này nhận **cả trường quan hệ** (vd `Sản phẩm · Đơn giá`) — tự lấy về khi cần, không cần thêm cột.
3. **Lưu**. ✅ Bảng con hiển thị dạng thẻ/danh sách; nếu có cả **đơn giá** và **cột số lượng**, mỗi dòng tự tính **thành tiền**.

| Kiểu hiển thị | Trông thế nào | Hợp với |
|---|---|---|
| **Bảng** *(mặc định)* | như bảng con gốc, thêm được dòng tổng + nút +/− | nhập liệu nhiều cột |
| **Danh sách** | mỗi dòng gọn: ảnh nhỏ + tên + phụ đề + đơn giá + thành tiền + nút +/− | xem nhanh, màn hình hẹp |
| **Thẻ** | lưới thẻ: ảnh lớn + tên + đơn giá + thành tiền | chọn hàng kiểu “cửa hàng” |

> 💡 **Cột quan hệ trong kiểu Bảng** là tính năng **có sẵn của NocoBase**, không phải của plugin này: thêm cột quan hệ (vd `Sản phẩm`) → ⚙ của cột → **Title field** → chọn trường muốn hiện (vd `Đơn giá`). Cách này chạy ngay trong widget.

### Tình huống C — Cầu nối: bấm sản phẩm ở block khác là tự thêm dòng (soạn hàng / POS)

Ý tưởng: một **block danh sách sản phẩm** (Bảng, Grid Card, hoặc List) là **bên gửi**; bảng con **“Sub-table Pro”** là **bên nhận**. Hai bên nối nhau bằng một **tên kênh** giống hệt.

**Bước 1 — Cấu hình bên nhận (bảng con):** mở **“Cấu hình Sub-table Pro”** → thẻ **Kết nối**:
1. Bật **“Bật nhận sự kiện từ block khác”**.
2. **“Tên kênh”**: đặt một tên, vd `ch1` (bên gửi phải trùng đúng tên này).
3. **“Cột/quan hệ khóa khớp (vd Sản phẩm)”**: chọn **quan hệ** trỏ tới sản phẩm (vd `Sản phẩm`) — chọn quan hệ chứ đừng chọn cột khóa thô.
4. **“Khóa trên bản ghi nguồn”**: thường để `id`.
5. Ở thẻ **Hiển thị**, nhớ đặt **“Cột số lượng (+/−)”** để khi bấm lại một sản phẩm đã có thì **cộng dồn số lượng** thay vì tạo dòng trùng.

**Bước 2 — Cấu hình bên gửi.** Chọn 1 trong 2 cách (đều **không cần code**):

- **Cách (a) — Nút trên thẻ/dòng (Grid Card / List / hoặc dòng Bảng):** thêm hành động **“Gửi dòng qua kênh (bridge)”** vào vùng nút của thẻ/dòng (chỗ bạn hay thêm nút), rồi mở ⚙ → **“Cấu hình gửi dòng”** → điền **“Tên kênh”** = `ch1` và chọn **“Kiểu nút”**:

  | Kiểu nút | Hành vi | Cần “Cột số lượng”? |
  |---|---|---|
  | **Nút +/−** | `+` thêm/tăng, `−` giảm (mờ đi khi món chưa có trong bảng con) | Có |
  | **Checkbox (thêm/bớt)** | tích = thêm, bỏ tích = xóa; tự phản ánh món đã có trong bảng con hay chưa | Không |
  | **Nút đơn** | một nút chạy đúng **một** hành động đã chọn ở **“Hành động khi bấm”** (Thêm / +1 · Bớt / −1 · Xóa) | tuỳ hành động |

- **Cách (b) — Bấm cả dòng (chỉ block Bảng):** mở ⚙ của **block Bảng** → **“Gửi dòng khi bấm (bridge)”** → bật **“Bật gửi khi bấm dòng”**, điền **“Tên kênh”** và chọn **“Hành động khi bấm”**. Từ đó, bấm dòng nào là gửi dòng đó (không cần nút trên từng dòng).

3. **Lưu** cả hai bên. ✅ Bấm nút **+** (hoặc tích checkbox / bấm dòng) ở block sản phẩm → bảng con **tự thêm dòng mới** (số lượng 1) hoặc **+1** nếu đã có; nút `−` giảm số lượng, về 0 thì xóa dòng.

> 💡 Nút **+/−** và **checkbox** ở bên gửi luôn **đồng bộ ngược** với bảng con: sửa tay, xoá dòng hay thêm bằng cầu nối, con số/ô tích đều cập nhật theo.

## Mẹo & lưu ý

- ✅ **Lưu vẫn 100% native.** Widget **kế thừa** model bảng con gốc, nên phần lưu (tạo/sửa dòng con lồng nhau) **giống hệt** bảng con mặc định — không có định dạng lưu riêng, không rủi ro dữ liệu.
- ⚠️ **Phải chọn tay.** “Sub-table Pro” **không** thay thế bảng con mặc định. Field nào chưa chọn nó thì vẫn hiển thị như cũ. Nó chỉ hiện với field quan hệ **hasMany / nhiều–nhiều** (không áp cho quan hệ kiểu **tệp/đính kèm**).
- **Cầu nối chạy trong 1 tab trình duyệt** (pub/sub phía client): dùng để soạn nhanh trong cùng một trang, **chưa** đồng bộ đa thiết bị. Bấm **Lưu** form thì dữ liệu mới được ghi (qua đường lưu native).
- **Muốn cộng dồn số lượng?** Bên nhận **bắt buộc** có **“Cột số lượng (+/−)”**; nếu bỏ trống, mỗi lần gửi sẽ thêm **dòng mới** thay vì +1.
- **Thành tiền** ở kiểu Thẻ/Danh sách chỉ hiện khi có **cả** “Cột đơn giá” **và** “Cột số lượng”.
- Đây là tính năng của **giao diện mới `/v/`** (nơi có model bảng con gốc để kế thừa). Trên giao diện classic `/admin`, nếu lane đó không có model bảng con gốc thì plugin **tự bỏ qua an toàn** (field hiện như bình thường).

## Gỡ / tắt

- **Trả 1 field về bảng con thường:** mở ⚙ của field → **Thành phần trường** → chọn lại bảng con **mặc định**. Dữ liệu giữ nguyên (vốn là native).
- **Gỡ hẳn plugin:** tắt trong **Plugin Manager**. Vì dữ liệu nằm ở quan hệ gốc nên **không mất gì**; các field đang để “Sub-table Pro” chỉ **quay về hiển thị bảng con mặc định**.
- 💡 **Khuyến nghị:** trước khi tắt plugin, nếu muốn gọn gàng thì đổi các field đang dùng về **Thành phần trường** mặc định. Cầu nối (bridge) là runtime, **không lưu gì** trong cơ sở dữ liệu nên không cần dọn.

---

### Cho nhà phát triển

Widget là một `FieldModel` **subclass** của `SubTableFieldModel` native (lấy từ registry của flow-engine) — thừa hưởng value binding, row markers, luồng chọn bản ghi và **serialize submit** y hệt; chỉ override `render()` để vẽ 3 kiểu view + dòng tổng + stepper + lookup. Gắn vào field qua `FormItemModel.bindModelToInterface('PtdlSubtableProFieldModel', ['o2m','m2m','mbm'], { isDefault: false })`. Cầu nối là pub/sub in-memory phía client (`ctx.app.ptdlBridge` / `window.__ptdlBridge`), phát bằng `bridge.publish(channel, { action, record, delta })` với `action` ∈ `add | inc | dec | remove | set`. Server là no-op (submit đi qua API association chuẩn). Chi tiết & lộ trình: xem `README.md` (tiếng Anh) và `docs/SUBTABLE-PRO-DESIGN.md`.
