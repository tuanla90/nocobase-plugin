# Tiêu đề & nhãn tùy biến — Hướng dẫn sử dụng

> Tạo kiểu cho **tiêu đề và nhãn** khắp giao diện NocoBase — tiêu đề trang, tiêu đề cột bảng,
> nhãn field ở form/detail và tiêu đề khối: đặt **icon**, **màu chữ**, **cỡ chữ**, **in đậm**,
> **nền** (đơn sắc/gradient) và **căn lề**. Không cần code — chỉnh ngay trên phần tử.

**Nhóm:** Giao diện (Blocks/UI) · **Chạy trên:** /admin (classic) + /v/ (modern) · **Phiên bản:** 0.2.3

## Sau khi cài, có gì mới?

Plugin thêm một **mục tạo kiểu vào menu ⚙ (bánh răng)** của 4 loại phần tử. **Không** thêm menu, trang hay mục Settings nào:

| Phần tử | Mục mới trong menu ⚙ | Tạo kiểu được gì |
|---|---|---|
| **Tiêu đề trang** | **"Giao diện tiêu đề"** | icon · màu chữ · cỡ · đậm · **nền** đơn sắc/gradient *(tô cả thanh tab)* |
| **Cột bảng** *(kể cả cột JS/tùy biến)* | **"Kiểu cột"** | icon · màu · cỡ · đậm · **căn lề tiêu đề** + **căn lề ô** *(riêng biệt)* |
| **Nhãn field** *(form / detail / field JS)* | **"Kiểu nhãn"** | icon · màu · cỡ · đậm |
| **Tiêu đề khối** | **"Kiểu tiêu đề khối"** | icon · màu · cỡ · đậm · **nền** đơn sắc/gradient |

- Mỗi dialog đều có **ô xem trước trực tiếp** (**"Xem trước"**) và nút **Đặt lại** (Reset).
- Với **cột** và **nhãn field**: có thêm công tắc **"Áp dụng mọi view (mặc định field)"** — bật để tạo kiểu *theo field*, hiện ở **mọi** bảng/form/detail có field đó (xem Tình huống C).
- 🎨 Icon lấy từ **kho biểu tượng chung**. Cài kèm **@ptdl/plugin-custom-icons** để có trọn bộ Lucide.

## Cấu hình ở đâu?

Plugin này **không có trang Settings riêng**. Bạn tạo kiểu **ngay trên phần tử** trong lúc chỉnh giao diện:

1. Bật **UI Editor** (chế độ chỉnh giao diện) ở góc trên.
2. Di chuột vào tiêu đề trang / cột / nhãn field / khối cần sửa.
3. Bấm biểu tượng **⚙ (bánh răng)** hiện ra → chọn mục tạo kiểu tương ứng (**"Giao diện tiêu đề"** / **"Kiểu cột"** / **"Kiểu nhãn"** / **"Kiểu tiêu đề khối"**).

> Áp dụng cho **cả hai** giao diện: classic `/admin` và modern `/v/`.

## Dùng thế nào (từng bước)

Mỗi dialog chia thành các mục gấp gọn — **Biểu tượng**, **Chữ**, **Nền**, **Căn lề** (tùy phần tử). Chỉnh tới đâu thấy ngay ở **"Xem trước"**, xong bấm ra ngoài để áp dụng.

### Bảng điều khiển (ý nghĩa từng mục)

| Điều khiển | Nhãn trên dialog | Làm gì |
|---|---|---|
| Icon | *Icon tiêu đề / Icon tiêu đề cột / Icon nhãn* | Chọn 1 biểu tượng đặt cạnh chữ |
| Vị trí icon | *Vị trí icon* | **Trái / Phải** *(chỉ hiện sau khi đã chọn icon)* |
| Màu chữ | *Màu chữ / Màu chữ cột / Màu nhãn* | Màu của chữ tiêu đề/nhãn |
| In đậm | *In đậm* | Bật/tắt chữ đậm |
| Cỡ chữ | *Cỡ chữ* | Thanh trượt 0–40px; **0 = Mặc định** (giữ nguyên cỡ) |
| Nền | *Nền tiêu đề* (+ *Nền (màu cuối gradient)* + *Hướng gradient*) | 1 màu = đơn sắc; thêm màu thứ 2 = **gradient**; chọn hướng ↓ → ↘ ↗ |
| Căn lề tiêu đề | *Căn lề tiêu đề* | Mặc định / Trái / Giữa / Phải cho **ô tiêu đề** cột |
| Căn lề ô | *Căn lề ô* | Mặc định / Trái / Giữa / Phải cho **dữ liệu** trong cột |

### Tình huống A — Làm nổi tiêu đề trang (icon + nền gradient)

1. Bật **UI Editor** → di chuột vào **tiêu đề trang** → ⚙ → **"Giao diện tiêu đề"**.
2. Mục **Biểu tượng**: chọn icon, đặt **Vị trí icon** = Trái/Phải.
3. Mục **Chữ**: chọn **Màu chữ**, bật **In đậm**, kéo **Cỡ chữ** (để 0 nếu muốn giữ nguyên).
4. Mục **Nền**: chọn **Nền tiêu đề**; muốn gradient thì chọn thêm **Nền (màu cuối gradient)** và **Hướng gradient**.
5. Đóng dialog. ✅ Tiêu đề (và **thanh tab** bên dưới) đổi kiểu ngay.

### Tình huống B — Tạo kiểu tiêu đề cột + căn lề

1. Di chuột vào **tiêu đề cột** → ⚙ → **"Kiểu cột"**.
2. Đặt **icon**, **màu**, **đậm** ở mục Biểu tượng/Chữ.
3. Mục **Căn lề**: chỉnh **Căn lề tiêu đề** (căn riêng ô tiêu đề) và **Căn lề ô** (căn dữ liệu) — hai cái độc lập nhau.
4. Muốn kiểu này hiện ở mọi nơi field xuất hiện → bật **"Áp dụng mọi view (mặc định field)"** (xem Tình huống C).

### Tình huống C — "Đặt 1 lần, hiện mọi nơi" (mặc định mức field)

1. Mở **"Kiểu cột"** (ở cột) hoặc **"Kiểu nhãn"** (ở field form/detail).
2. Chỉnh **icon / màu / đậm** như ý.
3. Bật **"Áp dụng mọi view (mặc định field)"** → đóng dialog.
4. ✅ Từ giờ **mọi** bảng/form/detail hiển thị field đó đều dùng kiểu này (lưu trên máy chủ).

> ⚠️ **Cỡ chữ** và **căn lề** **không** lưu ở mức field (chỉ theo từng view). Chỉ **icon + vị trí icon + màu + đậm** được lưu làm mặc định field.
> ⚠️ **Cột JS/tùy biến** không gắn với field → chỉ tạo kiểu **theo view**, không có mặc định field.

### Tình huống D — Tô nền + icon cho tiêu đề khối

1. Di chuột vào **khối/section** → ⚙ → **"Kiểu tiêu đề khối"**.
2. Đặt **icon + màu + đậm**; mục **Nền** chọn 1 màu (đơn sắc) hoặc 2 màu (gradient).
3. Đóng dialog → nền tô sát mép trên thẻ, phủ trọn vùng tiêu đề.

## Mẹo & lưu ý

- **Không có trang Settings** — tất cả chỉnh tại chỗ qua ⚙. Nhớ bật **UI Editor** trước.
- **Bỏ style nhanh:** mở lại dialog → bấm **Đặt lại** (Reset) → đóng. Riêng cỡ chữ, kéo **Cỡ chữ** về **0** để trả về cỡ mặc định.
- **Mặc định field ≠ theo view:** khi tắt "Áp dụng mọi view", kiểu chỉ áp cho đúng cột/nhãn ở view đang sửa. Nếu một field vừa có mặc định vừa có chỉnh theo view, **bản theo view thắng** ở từng thuộc tính.
- **Cập nhật chéo phiên:** nếu người khác đổi mặc định field, phiên của bạn chỉ thấy sau khi **quay lại tab** (làm mới ~10 giây/lần) và view **render lại** (điều hướng đi/về, hoặc mở lại khối) — không tự làm mới tức thì.
- **Đầy đủ biểu tượng:** cài **@ptdl/plugin-custom-icons** để có trọn bộ Lucide trong bộ chọn icon.
- Đây là **tạo kiểu phía trình duyệt** (client) — **không cần restart server**.

## Gỡ / tắt

- **Gỡ style một chỗ:** mở lại dialog của phần tử → **Đặt lại** (Reset) → đóng.
- **Gỡ mặc định field (mọi view):** mở **"Kiểu cột"/"Kiểu nhãn"** → **Đặt lại** khi đang bật **"Áp dụng mọi view"** → đóng.
- **Tắt plugin** trong **Plugin Manager**: mọi kiểu biến mất khỏi giao diện. Mặc định field vẫn được giữ trong CSDL (bảng `ptdlFieldStyles`), kiểu theo-view vẫn nằm trong cấu hình trang → **bật lại** thì hiện lại như cũ.

---

### Cho nhà phát triển

- Chỉ tạo kiểu **phía client**, chạy 2 lane: `@nocobase/client` (classic) + `@nocobase/client-v2` (modern). **Không bundle** thư viện icon — dùng registry chung (đủ Lucide khi có `@ptdl/plugin-custom-icons`).
- Không thay chuỗi `title`/`label` gốc (nhiều nơi gọi `.trim()`); chỉ trang trí **kết quả render** (patch `getColumnProps` / `renderItem` / `render`).
- Mặc định mức field lưu ở collection **`ptdlFieldStyles`** (ACL `loggedIn`; 1 dòng cho mỗi nguồn+bảng+field), nạp vào cache lúc khởi động, ghi qua `ptdlFieldStyles:updateOrCreate`; bản theo-view lưu trong flow params (`chFieldStyle`).
- Giới hạn đã biết: chưa hỗ trợ **ảnh** nền (chỉ đơn sắc/gradient) và nền cho tiêu đề cột; đổi mặc định field chỉ tự làm mới khi tab được focus lại. Chi tiết kỹ thuật: xem `README.md` (tiếng Anh) + `IMPROVEMENTS-CHECKLIST.md`.
