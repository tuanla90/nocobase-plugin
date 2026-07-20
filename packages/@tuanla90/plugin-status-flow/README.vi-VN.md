# Luồng trạng thái — Hướng dẫn sử dụng

> Thêm một **kiểu trường mới** hoạt động như "máy trạng thái": bạn khai báo các **trạng thái**
> (kèm loại + màu), các **chuyển tiếp hợp lệ** và **vai trò nào được phép** chuyển. Khi sửa, ô chọn
> **chỉ hiện những trạng thái kế hợp lệ**; **máy chủ chặn** mọi chuyển tiếp sai luật (kể cả sửa hàng loạt).
> Trên ô dữ liệu còn có **sơ đồ luồng** và **nút chuyển nhanh**.

**Nhóm:** Fields · **Chạy trên:** /admin (classic) + /v/ (modern) · **Phiên bản:** 0.1.0

## Sau khi cài, có gì mới?

- **Một kiểu trường mới.** Khi thêm/cấu hình trường của một bảng, danh sách kiểu trường có thêm
  **"Luồng trạng thái"** (thường nằm trong nhóm *Lựa chọn / Choices*).
- **Không thêm menu, không thêm trang Settings.** Mọi thứ nằm trong **cấu hình của chính trường đó**,
  ở mục **"Trạng thái & chuyển đổi"**.
- Trên **ô bảng / trang chi tiết**, trường hiển thị thành **tag màu**; qua ⚙ của cột có thể bật thêm
  **Sơ đồ luồng**, **Chuyển nhanh**, **Lịch sử thay đổi** và đổi kiểu hiển thị (Pills, Nhóm nút, Các bước, Thanh trạng thái).
- Có thêm **nút hành động "Thao tác ▾"** (khi thêm sẽ thấy tên **"Chuyển trạng thái"**) đặt được vào
  thanh nút của bảng / chi tiết — bấm để chuyển trạng thái ngay tại chỗ.
- **Máy chủ tự thực thi luật**: bản ghi mới luôn bắt đầu ở trạng thái ban đầu; chuyển sai luật hoặc
  sai vai trò đều **bị chặn** (cả sửa lẻ lẫn sửa hàng loạt).

## Cấu hình ở đâu?

Không có trang cấu hình riêng — đây là **kiểu trường**, nên bạn chỉnh **ngay khi tạo/sửa trường** của bảng:

- Vào **quản lý trường (fields) của bảng** → **Thêm trường** (hoặc sửa trường sẵn có) →
  chọn kiểu **"Luồng trạng thái"**.
- Trong hộp cấu hình trường, mở mục **"Trạng thái & chuyển đổi"** để khai báo trạng thái, chuyển tiếp, vai trò.
- Dùng được ở **cả hai** giao diện: cấu hình trường ở classic `/admin` và modern `/v/` đều mở **cùng một trình soạn**.

## Dùng thế nào (từng bước)

### Bước 1 — Tạo trường trạng thái
1. Mở **bảng** cần theo dõi trạng thái (vd *Đơn hàng*, *Công việc*, *Yêu cầu*).
2. Vào **cấu hình trường** → **Thêm trường** → chọn kiểu **"Luồng trạng thái"**.
3. Đặt tên trường (vd *Trạng thái*) → mở mục **"Trạng thái & chuyển đổi"**.

### Bước 2 — Khai báo các trạng thái
Mỗi dòng là một trạng thái. Bấm **"+ Thêm trạng thái"** để thêm dòng, mỗi dòng đặt:

| Ô | Ý nghĩa |
|---|---|
| **Chấm màu** | Bấm để chọn **Màu** cho trạng thái |
| (biểu tượng) | Chọn **Biểu tượng (tuỳ chọn)** hiện cạnh nhãn |
| **Tên trạng thái** | Nhãn hiển thị (vd *Mới*, *Đang xử lý*, *Hoàn tất*) |
| **khóa** | Mã kỹ thuật (tự sinh từ tên; nên để nguyên) |
| **Loại** | **Ban đầu** / **Đang xử lý** / **Thành công** / **Thất bại / Đã huỷ** |

> 💡 Trạng thái có **Loại = "Ban đầu"** là nơi **mọi bản ghi mới bắt đầu** — chỉ một trạng thái được là "Ban đầu".
> Kéo biểu tượng **⠿** ở đầu dòng để **sắp xếp lại** thứ tự. Bấm **✕** để xoá một trạng thái.

### Bước 3 — Khai báo chuyển tiếp hợp lệ + vai trò
Ở dòng phụ ngay dưới mỗi trạng thái:
- **Có thể chuyển tới**: chọn (các) trạng thái mà từ đây được **chuyển sang tiếp**.
  Để **trống = trạng thái cuối** (không đi đâu nữa).
  - Chọn **"✳ Bất kỳ trạng thái nào"** nếu từ đây có thể sang **mọi** trạng thái.
- **"↩ từ bất kỳ"**: tick nếu **mọi** trạng thái đều được phép chuyển **VÀO** trạng thái này
  (hợp cho *Đã huỷ*, *Lưu trữ*).
- **theo vai trò**: giới hạn **vai trò nào được phép** thực hiện chuyển tiếp đó.
  Để **trống = mọi người** đều chuyển được.

> 💡 Phía trên trình soạn có khung **"Xem trước luồng"** vẽ sơ đồ để bạn kiểm tra nhanh đường đi (hiện khi có từ 2 trạng thái).

### Bước 4 — Người dùng sẽ dùng trường thế nào
- **Khi tạo bản ghi mới**: trường bị **khoá ở trạng thái ban đầu** (không cho chọn tuỳ tiện).
- **Khi sửa**: ô chọn **chỉ hiện trạng thái hiện tại + các trạng thái kế hợp lệ** cho **vai trò** của người đó
  — đường đi bị cấm sẽ không xuất hiện.
- **Trên ô bảng**: hiện tag màu; nếu bật **Chuyển nhanh** sẽ có nút dạng **"→ &lt;trạng thái&gt;"** bấm để chuyển ngay
  (có hỏi xác nhận).

### (Tuỳ chọn) Đổi kiểu hiển thị / bật tiện ích trên cột
1. Bật **UI Editor** → mở **⚙** trên **cột** (hoặc trường trong Chi tiết/Biểu mẫu) → mục **"Luồng trạng thái"** → **"Kiểu hiển thị"**.
2. **Hiển thị dạng**: *Tag màu (mặc định)* / *Pills* / *Nhóm nút* / *Các bước* / *Thanh trạng thái*.
   (Ở **trường biểu mẫu** mục này tên là **"Widget"**, có thêm *Pills (bấm để chuyển)* và *Thanh trạng thái (kiểu Odoo)*.)
3. Chọn **Kích thước** (Nhỏ/Vừa/Lớn) và **Chế độ màu**: *Nhiều màu (theo trạng thái)* hoặc *Đơn sắc*.
4. Bật các tiện ích trên ô: **Sơ đồ luồng** (icon mở popover xem sơ đồ, tô đậm trạng thái hiện tại),
   **Chuyển nhanh** (nút chuyển ngay), **Lịch sử thay đổi** (cần plugin change-log).

### (Tuỳ chọn) Thêm nút "Thao tác ▾" để chuyển trạng thái
1. Trong thanh nút của **bảng** hoặc **trang chi tiết**, thêm hành động **"Chuyển trạng thái"**.
2. Mở **⚙** của nút → **"Cài đặt chuyển trạng thái"**: chọn **Trường trạng thái**, bật
   **Xác nhận trước khi chuyển** và/hoặc **Yêu cầu ghi chú/lý do**.
3. Bấm nút → menu **chỉ liệt kê các chuyển tiếp hợp lệ cho bản ghi này**.

## Mẹo & lưu ý

- ✅ **Máy chủ là "trọng tài".** Ô chọn lọc sẵn chỉ để tiện tay; kể cả gọi API trực tiếp, sửa hàng loạt hay
  nhập (import), chuyển sai luật/sai vai trò đều **bị chặn** kèm thông báo rõ ("… không được phép").
- ⚠️ **Không xoá trắng được** trạng thái đã đặt — hệ thống báo lỗi thay vì đưa về rỗng. Muốn "kết thúc"
  thì tạo một **trạng thái cuối** (vd *Đã huỷ*) và cho các trạng thái khác chuyển vào đó.
- ⚠️ **Sửa hàng loạt kiểu "thô"** trên trường trạng thái bị **từ chối** — hãy sửa **từng bản ghi** để luật chuyển tiếp được áp.
- Vai trò **root** (super admin) **bỏ qua** mọi luật chuyển tiếp.
- Thay đổi do **workflow / script / migration** (không có ngữ cảnh người dùng) được **cho qua** —
  luật chỉ áp cho thao tác của người dùng.
- **Lịch sử thay đổi**: nút này chỉ xuất hiện khi có cài kèm `@tuanla90/plugin-change-log`.
- Chạy trên **cả hai** giao diện classic `/admin` và modern `/v/`.

## Gỡ / tắt

- Tắt plugin trong **Plugin Manager**. Cấu hình trạng thái (đã lưu trong `options` của trường) **vẫn còn**, nhưng:
  - Trường quay về hiển thị như một **select thường** (mất tag màu / sơ đồ / nút chuyển nhanh).
  - **Máy chủ ngừng thực thi luật** → chuyển tiếp không còn bị chặn.
- Bật lại plugin thì mọi thứ hoạt động như cũ (**không mất** cấu hình đã khai báo).

---

### Cho nhà phát triển

- Kiểu trường: `statusFlow` (nhóm `choices`). Cấu hình lưu trong cột `options` của bản ghi field:
  `uiSchema.enum` (`{ value, label, color, icon }`) + `statusFlow` (`initial`, `kinds`, `transitions`, `openFrom`).
- Thực thi ở server qua hook `beforeCreate` / `beforeUpdate` / `beforeBulkUpdate` — xem `src/server/plugin.ts`.
  Client chỉ lọc dropdown cho gọn (UX), không phải nơi bảo vệ.
- Hai lane client dùng chung model + trình soạn ở `src/shared/*`: `src/client` (classic `/admin`) và
  `src/client-v2` (modern `/v/`).
- Ghi chú nghiên cứu/thiết kế: `docs/STATUS-FLOW-RESEARCH.md`.
