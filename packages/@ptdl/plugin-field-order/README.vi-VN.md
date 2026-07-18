# Thứ tự trường — Hướng dẫn sử dụng

> Sắp xếp lại **thứ tự các trường** của một bảng dữ liệu bằng cách **kéo–thả**, ngay trong màn hình
> cấu hình trường — không cần code, không cần restart server.

**Nhóm:** Trường (Fields) · **Chạy trên:** /admin (classic) + /v/ (modern) · **Phiên bản:** 0.1.0

## Sau khi cài, có gì mới?

- **Một nút mới: “Sắp xếp trường”** xuất hiện trên **thanh công cụ của ngăn cấu hình trường** (ngăn kéo ra khi bạn mở phần “Configure fields” của một bảng — chỗ có nút **“Add field”**). Nút nằm cạnh nút thêm trường.
- Bấm nút → mở hộp thoại **“Sắp xếp trường”**: một **danh sách kéo–thả** liệt kê các trường của bảng theo thứ tự hiện tại. Kéo để đổi chỗ, hoặc dùng nút **Lên / Xuống** ở mỗi dòng.
- **Không thêm menu, trang cài đặt, hay field** nào khác. Đây là công cụ dùng ngay tại chỗ quản lý trường.
- ✅ Lấp đúng khoảng trống của NocoBase: trường **thêm sau** luôn bị đẩy xuống **cuối** và bản thân NocoBase **không có nút để kéo lên** — plugin này cho bạn làm điều đó.

## Cấu hình ở đâu?

Plugin **không có trang cài đặt riêng**. Bạn dùng nó ngay trong **khu quản lý bảng dữ liệu (Collection manager)** ở phần **Settings**, tại ngăn cấu hình trường của từng bảng:

| Giao diện | Cách tới nút “Sắp xếp trường” |
|---|---|
| **Modern (`/v/`)** | ⚙ **Settings** → khu **quản lý bảng dữ liệu (Collection manager)** → chọn một bảng để mở ngăn cấu hình trường → nút **“Sắp xếp trường”** nằm trên thanh công cụ (cạnh **“Add field”**). |
| **Classic (`/admin`)** | **Settings** → khu **quản lý bảng dữ liệu** → mở cấu hình trường của một bảng → nút **“Sắp xếp trường”** trên thanh công cụ. |

> Nút chỉ hiện **bên trong khu quản lý bảng dữ liệu** (đường dẫn có `data-source-manager`). Nó **không** xuất hiện ở các ngăn sửa bản ghi trên trang dữ liệu thường — nên bạn yên tâm nó không lẫn vào chỗ khác.

## Dùng thế nào (từng bước)

### Tình huống A — Kéo một trường lên trên (ví dụ: đưa trường vừa thêm lên đầu)

1. Vào **Settings** → khu **quản lý bảng dữ liệu (Collection manager)**.
2. Mở **cấu hình trường** của bảng bạn cần (ngăn liệt kê các trường, có nút **“Add field”**).
3. Trên thanh công cụ, bấm **“Sắp xếp trường”**.
4. Trong hộp thoại, **kéo** dòng của trường tới vị trí mong muốn (hoặc bấm **Lên / Xuống** ở dòng đó).
5. Bấm **“Lưu”**. ✅ Hiện thông báo **“Đã cập nhật thứ tự trường”**, danh sách trường tự làm mới theo thứ tự mới.

### Tình huống B — Sắp lại toàn bộ cho gọn

1. Mở **“Sắp xếp trường”** như trên.
2. Kéo–thả nhiều dòng cho tới khi thứ tự vừa ý (mỗi dòng hiện **tên hiển thị**, kèm **tên trường** và **nhãn kiểu trường** cho dễ nhận).
3. Bấm **“Lưu”**. Muốn bỏ giữa chừng thì bấm **“Hủy”** — không có gì thay đổi.

> 💡 Thứ tự mới **chi phối màn cấu hình trường này** *và* **thứ tự trường mặc định** của các **block/biểu mẫu bạn tạo MỚI** sau đó. Các **block/biểu mẫu đã tạo trước** vẫn **giữ nguyên bố cục** của chúng (đúng theo cơ chế NocoBase) — dòng chú thích trong hộp thoại cũng nhắc điều này.

## Mẹo & lưu ý

- ✅ **Áp dụng ngay khi “Lưu”, không cần restart** server.
- 📦 **Chỉ đổi thứ tự hiển thị**, tuyệt đối **không đụng tới cấu trúc/dữ liệu** của trường. Muốn sắp lại thế nào cũng an toàn.
- 🧭 Danh sách chỉ gồm **các trường giao diện** (những trường xuất hiện trong bộ chọn). Các **trường hệ thống** (như `id`, `createdAt`…) không hiển thị và **không bị thay đổi**.
- 🖥️ Áp dụng cho **nguồn dữ liệu chính (main data source)** — nơi bạn quản lý bảng ngay trong app. Các nguồn dữ liệu ngoài (external) không nằm trong phạm vi công cụ này.
- 🔁 Muốn thứ tự mới xuất hiện trong một block **đã có sẵn**? Hãy **tạo lại block/biểu mẫu** (hoặc thêm block mới) — block cũ giữ bố cục riêng của nó.
- 🌐 Chạy trên **cả hai** giao diện: classic `/admin` và modern `/v/`.

## Gỡ / tắt

- **Tắt plugin** trong **Plugin Manager**: nút **“Sắp xếp trường”** biến mất. Thứ tự trường bạn đã lưu **vẫn được giữ nguyên** (vì nó là dữ liệu thứ tự sẵn có của NocoBase) — **không mất gì cả**. Bật lại lúc nào cũng dùng tiếp được.

---

### Cho nhà phát triển

Nút được gắn ở **cấp body** (tự mount một React root, không qua `app.addProvider` vì provider không render trên subtree `/admin/settings/*`), dò tìm ngăn cấu hình trường bằng cấu trúc DOM + theo dõi cú click chọn bảng, và chỉ hoạt động khi đường dẫn chứa `data-source-manager`. Lưu thứ tự qua action server `fieldOrder:reorder` — ghi lại cột `sort` của bảng metadata `fields` bằng cách **tái dùng đúng các slot sort hiện có** của những trường được sắp (không đụng trường hệ thống/ẩn, không tạo trùng). Chi tiết kỹ thuật: xem `FIELD-ORDER.md` và `README.md` (tiếng Anh).
