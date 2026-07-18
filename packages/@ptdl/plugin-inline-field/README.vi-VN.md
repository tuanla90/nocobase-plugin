# Thêm cột tại chỗ — Hướng dẫn sử dụng

> Thêm một **cột (field) mới ngay khi đang sửa bảng** — **không** phải rời trang để vào Collection
> Manager tạo field. Khai báo trong một hộp thoại nhỏ, cột hiện **luôn** trong bảng đang xem.

**Nhóm:** Trường (Fields) · **Chạy trên:** /v/ (modern) · **Phiên bản:** 0.1.3

## Sau khi cài, có gì mới?

- Trong **menu ⚙ (cài đặt)** của mỗi **khối Bảng** trên `/v/` xuất hiện mục **“Thêm cột mới”**.
- Bấm → mở hộp thoại khai báo: **Tên cột**, **Loại dữ liệu**, (nếu là *lựa chọn*) **các giá trị**, và **Bắt buộc**.
- Bấm **OK** → plugin **tạo field trên collection**, **migrate cột vật lý**, rồi **thả cột thẳng vào bảng đang sửa** — bạn thấy ngay, không cần làm mới trang.
- ✅ Lấp đúng khoảng trống của NocoBase: bình thường muốn có cột mới bạn phải **vào Collection Manager → Add field → quay lại bật cột**. Plugin gộp cả ba bước làm một, ngay tại chỗ.

## Dùng thế nào (từng bước)

1. Mở một **trang có khối Bảng** trên `/v/`, bật chế độ cấu hình giao diện (UI editor).
2. Di vào khối Bảng, mở **menu ⚙** của khối → chọn **“➕ Thêm cột mới”**.
3. Nhập **Tên cột** (ví dụ *Ghi chú*, *Đơn giá*). **Mã field** (snake_case) tự sinh từ tên; muốn đổi thì mở **Nâng cao**.
4. Chọn **Loại dữ liệu** (xem danh sách bên dưới). Lựa chọn → gõ giá trị; **Quan hệ** → chọn bảng liên kết; **Tự tính** → viết công thức.
5. Bật **Bắt buộc** nếu cần. Bấm **OK**.
6. ✅ Hiện thông báo **“Đã thêm cột …”**; cột mới nằm ngay trước cột nút thao tác. Có thể kéo tiêu đề cột để đổi vị trí.

## Loại dữ liệu hỗ trợ (bản 0.1.3)

| Nhóm | Loại |
|---|---|
| **Văn bản** | Văn bản 1 dòng · Văn bản nhiều dòng · Email · Điện thoại · Liên kết (URL) |
| **Số** | Số thập phân · Số nguyên · Phần trăm |
| **Lựa chọn** | Một lựa chọn · Nhiều lựa chọn · Có/Không · **Luồng trạng thái** |
| **Ngày/giờ** | Ngày · Ngày giờ · Giờ |
| **Quan hệ** | Liên kết 1 bản ghi (m2o) · Danh sách bản ghi con (o2m) · Nhiều–nhiều (m2m) |
| **Media & tệp** | **Biểu tượng** · Màu · **Ảnh/Tệp (URL)** · **Tệp đính kèm (upload)** |
| **Khác** | **Tự tính (công thức)** |

### Trạng thái, biểu tượng & tệp — mới ở 0.1.3

- **Luồng trạng thái** — khai báo **đơn giản**: liệt kê các trạng thái + chọn **màu** cho mỗi cái. **Trạng thái đầu = bắt đầu (init), cuối = kết thúc (end)**; chuyển tuần tự theo thứ tự. Hiển thị dạng thẻ màu + đổi trạng thái (đủ nhất khi có **@ptdl/plugin-status-flow**).
- **Biểu tượng** — field chọn icon (bộ Lucide) khi nhập.
- **Ảnh/Tệp (URL)** — dán URL ảnh/tệp có sẵn; bảng hiện link bấm được.
- **Tệp đính kèm (upload)** — tải tệp thật lên storage (**cần plugin File manager** — thường có sẵn), lưu vào bảng `attachments`.

### Quan hệ (relation) — mới ở 0.1.2

Chọn một loại **Quan hệ** → hiện ô **Bảng liên kết** để chọn bảng đích:
- **Liên kết 1 bản ghi (m2o)** — mỗi dòng trỏ tới 1 bản ghi bảng kia (belongsTo). Vd đơn hàng → khách hàng.
- **Danh sách bản ghi con (o2m)** — mỗi dòng có nhiều con ở bảng kia (hasMany); plugin **tự tạo liên kết ngược** trên bảng con.
- **Nhiều–nhiều (m2m)** — nối qua bảng trung gian (belongsToMany).

### Cột tự tính (công thức) — từ 0.1.1

Chọn loại **“Tự tính (công thức)”** → hiện thêm **Kết quả** (Số / Số nguyên / Phần trăm / Văn bản) và ô
**Công thức** kiểu Excel. Tham chiếu cột khác bằng `data.<mã_field>` — bấm nút **“Chèn field/quan hệ”**
(bộ chọn chuẩn dùng chung với plugin **Công thức**) để chèn tại con trỏ; **drill được cả quan hệ**, vd
`data.khach_hang.ten`. Bấm **“Xem thử”** để chạy công thức trên **bản ghi đầu tiên** và xem ngay kết quả.
Plugin tạo field (chỉ đọc) + một **luật tính** của plugin **Công thức** — giá trị **tự cập nhật** khi tạo/sửa.

> ⚠️ Cột tự tính (và nút Xem thử) cần cài **@ptdl/plugin-formula (Công thức)**. Nếu chưa cài, cột vẫn được
> tạo nhưng công thức chưa chạy (plugin báo rõ).

## Mẹo & lưu ý

- 🧱 Cột được tạo là **field thật** trên collection (có cả cột vật lý trong CSDL) — không phải cột ảo. Xoá thì vào **Collection Manager**.
- 🔤 Hai cột cùng tên hiển thị vẫn ổn: **tên máy** tự thêm hậu tố (`ghi_chu`, `ghi_chu_2`…) để không trùng.
- 🔁 Cột chỉ tự thêm vào **khối bạn đang thao tác**. Field mới cũng lập tức có mặt trong danh sách **“Fields”** (nút ⚙) của mọi khối khác cùng bảng, để bạn tick thêm nếu muốn.
- 🔒 Việc tạo field là thao tác cấu hình — nên chỉ mở cho người có quyền chỉnh giao diện. (Xem phần nhà phát triển.)

## Gỡ / tắt

- **Tắt plugin** trong **Plugin Manager**: mục **“Thêm cột mới”** biến mất. Các field bạn đã tạo **vẫn còn nguyên** (chúng là field thật của collection) — không mất dữ liệu.

---

### Cho nhà phát triển

Điểm vào = `TableBlockModel.registerFlow` (mục trong menu ⚙ của khối) + `flowSettings.registerComponents`
(hộp thoại là component React `PtdlInlineFieldForm`) — **đúng pattern** đã chạy thật của
`@ptdl/plugin-conditional-format`. Tạo field qua action server **`ptdlInlineField:createField`**: ghi
metadata vào bảng `fields` (kèm `context`) rồi `collection.sync({alter:true})` để migrate cột vật lý —
mirror `opAddField` của app-builder. Sau đó client `dataSourceManager.reload({keys})` để nạp metadata,
rồi gắn cột **giống hệt nút “Fields” gốc**: `createModelAsync` → `addSubModel('columns', …)` →
`afterAddAsSubModel` → `save`. Bộ chuyển kiểu field (`buildFieldDef`) và bảng renderer mặc định
(`DISPLAY_BY_INTERFACE`) tái dùng verbatim từ app-builder. ACL hiện đặt `loggedIn` (khớp app-builder /
field-order) — siết thành vai trò admin nếu mở cho người dùng thường. Chỉ chạy `/v/` (classic không có
`TableBlockModel`). Chi tiết kỹ thuật: xem `README.md` (tiếng Anh).
