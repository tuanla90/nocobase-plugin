# Tìm kiếm toàn cục — Hướng dẫn sử dụng

> Một **ô tìm kiếm trên thanh tiêu đề** + **bảng lệnh `Ctrl / ⌘ + K`** tìm xuyên nhiều bộ sưu tập
> một lúc và **nhảy thẳng tới bản ghi** — kết quả gom nhóm theo bộ sưu tập, hiện ngay khi bạn gõ.

**Nhóm:** UI (tìm kiếm) · **Chạy trên:** /admin (classic) + /v/ (modern) · **Phiên bản:** 0.9.6

## Sau khi cài, có gì mới?

- **Phím tắt `Ctrl / ⌘ + K`** ở bất cứ đâu → mở **bảng lệnh tìm kiếm**. Bấm lại (hoặc `Esc`) để đóng.
- **Nút tìm kiếm trên thanh tiêu đề** (một “viên thuốc” / pill): bấm vào cũng mở bảng lệnh. Bạn chỉnh được
  hình dạng, màu, vị trí của nút này.
- **Kết quả trực tiếp, gom nhóm**: vừa gõ vừa ra kết quả (chờ ~0,3 giây), tách nhóm theo từng bộ sưu tập.
  Bấm chuột hoặc dùng **↑↓ rồi `Enter`** để mở.
- **Ô “Tìm trong”** trong bảng lệnh: thu hẹp về đúng một bộ sưu tập (hiện khi có nhiều hơn 1 nhóm).
- **Trang cấu hình mới**: **Settings → Tìm kiếm toàn cục** (3 tab) để chọn phạm vi tìm, cách mở kết quả và
  kiểu dáng nút.

> Ngôn ngữ của bảng lệnh và trang cấu hình đi **theo ngôn ngữ giao diện NocoBase** (Việt/Anh).

## Cấu hình ở đâu?

- **/v/ (modern):** menu **⚙ Settings → “Tìm kiếm toàn cục”**.
- **/admin (classic):** **Settings → “Tìm kiếm toàn cục”** (`/admin/settings/global-search`).
- Cấu hình được **lưu trên máy chủ và dùng chung cho mọi người** (mọi tài khoản, mọi trình duyệt thấy như nhau).
  Vì vậy chỉ **quản trị viên** mới nên chỉnh; sau khi **Lưu** sẽ có thông báo *“Đã lưu cho mọi người”*.

Trang cấu hình có **3 tab**:

| Tab | Dùng để | Bạn đặt gì ở đây |
|---|---|---|
| **Tìm gì** | Chọn phạm vi tìm | Tìm tất cả (tự động) *hay* chọn từng bộ sưu tập + trường + cách hiện tiêu đề |
| **Khi tôi nhấp vào kết quả** | Chọn cách mở kết quả | Ngăn xem trước / Trang chi tiết / Mở trang — cho từng bộ sưu tập |
| **Giao diện** | Chỉnh nút trên thanh tiêu đề | Kiểu hiển thị, vị trí, bề rộng, bo góc, chữ, màu nền/chữ |

## Dùng thế nào (từng bước)

### Tình huống A — Tìm nhanh một bản ghi
1. Nhấn **`Ctrl + K`** (Windows/Linux) hoặc **`⌘ + K`** (Mac) — hoặc bấm **nút tìm kiếm** ở góc thanh tiêu đề.
2. Gõ từ khóa vào ô **“Tìm kiếm…”**. Kết quả hiện ngay bên dưới, **gom nhóm theo bộ sưu tập**.
3. (Tuỳ chọn) Bấm ô **“Tìm trong”** để chỉ tìm trong **một** bộ sưu tập thay vì tất cả.
4. Chọn kết quả bằng **chuột**, hoặc **↑↓** để di chuyển rồi **`Enter`** để mở. `Esc` để đóng.
5. ✅ Tuỳ cấu hình, bản ghi mở ra ở **ngăn xem trước** (bên phải) hoặc **nhảy tới trang** tương ứng.

> 💡 Gõ **một số** (vd `123`) cũng tìm được bản ghi theo **ID**, không chỉ theo chữ.

### Tình huống B — Chọn đúng chỗ để tìm (tab **Tìm gì**)
1. Vào **Settings → Tìm kiếm toàn cục → tab “Tìm gì”**.
2. Chọn một trong hai chế độ:
   - **Tất cả bộ sưu tập (tự động)** — tìm trong trường văn bản của mọi bộ sưu tập không bị ẩn, khỏi thiết lập gì thêm.
   - **Chọn bộ sưu tập** — tự khai báo từng bộ sưu tập muốn tìm.
3. Nếu chọn “Chọn bộ sưu tập”, với mỗi thẻ:
   - **Bộ sưu tập:** chọn bảng cần tìm.
   - **Tìm trong:** chọn các **trường** để so khớp (mặc định là mọi trường văn bản). Bấm **“＋ Trường lồng nhau”**
     để thêm trường của bảng liên quan, vd `customer.name`.
   - **Hiển thị dạng:** chọn **Trường** (ghép vài trường làm tiêu đề) hoặc **Mẫu** (viết mẫu như
     `{{id}} - {{name}} - {{customer.name}}`, có định dạng ngày/số…). Đặt **Số kết quả tối đa** ở cạnh.
4. Thêm bảng khác bằng **“+ Thêm bộ sưu tập”**, bỏ bảng bằng **“Xóa”** → bấm **“Lưu”**.

### Tình huống C — Đổi cách mở kết quả (tab **Khi tôi nhấp vào kết quả**)
Chọn cách mở cho từng bộ sưu tập ở ô **“Mở dạng”**:

| Lựa chọn | Kết quả khi bấm |
|---|---|
| **Ngăn xem trước** *(mặc định)* | Mở ngăn bên phải xem nhanh các trường của bản ghi, **không rời trang**. |
| **Trang chi tiết** | Mở trang chi tiết của bản ghi. Bạn **mở thử 1 bản ghi, copy URL trên trình duyệt, dán vào đây** — phần ID sẽ tự thành `{{id}}`. |
| **Mở trang** | Nhảy tới một **trang** bạn chọn; ID được nối vào dưới dạng `?filterByTk=`. |

Bấm **“Lưu”**. Bộ sưu tập nào **không** khai báo ở đây sẽ dùng **Ngăn xem trước** theo mặc định.

### Tình huống D — Chỉnh nút tìm kiếm (tab **Giao diện**)
Có **xem trước trực tiếp** ở đầu tab. Các mục chỉnh được:

- **Cấu hình sẵn:** **Chỉ biểu tượng** / **Biểu tượng + chữ** / **Đầy đủ** (kèm gợi ý phím tắt).
- **Vị trí:** **Trái** / **Giữa** / **Phải** *(mặc định)*. Trái & Giữa là lớp phủ nổi trên thanh tiêu đề;
  **Phải** gắn gọn vào cụm nút và **không bao giờ chồng lên** thứ khác.
- **Chiều rộng**, **Bo góc**.
- **Chữ trên nút:** để trống thì nút thu về **hình tròn chỉ có biểu tượng**.
- **Gợi ý phím tắt:** bật/tắt hiển thị `Ctrl / ⌘ + K` trên nút.
- **Icon tự động:** màn hình hẹp thì tự thu nút về hình tròn (mặc định khi bề rộng ≤ 820px; đặt 0 để tắt).
- **Nền** và **Màu chữ:** để trống là dùng màu theo giao diện.

Bấm **Lưu** để áp cho mọi người (hoặc nút hoàn tác để về mặc định).

## Mẹo & lưu ý

- ⌨️ **Phím tắt luôn hoạt động** kể cả khi chưa thấy nút trên thanh tiêu đề (vd ở trang con/popup không có thanh tiêu đề chính).
- 🔎 **Tìm được:** trường **chữ** (string/text), gồm cả trường lồng qua quan hệ bạn thêm bằng **“＋ Trường lồng nhau”**,
  và **ID** khi gõ số. **Không** tìm theo số/ngày.
- 👥 Cấu hình là **chung cho cả hệ thống** (lưu ở máy chủ) — một người chỉnh, mọi người thấy. Cần quyền **quản trị** để lưu.
  Nếu máy chủ tạm không kết nối được, thay đổi chỉ lưu **trên thiết bị này** (sẽ có cảnh báo).
- ⚠️ Sau khi đổi cấu hình, hãy **mở lại** bảng lệnh (`Ctrl / ⌘ + K`) để dùng thiết lập mới.
- 🖥️ Chạy trên **cả hai** giao diện: classic `/admin` và modern `/v/`.
- 🔒 Kết quả vẫn tuân theo **phân quyền** của từng bộ sưu tập — bộ sưu tập nào không có quyền sẽ báo *“Không tìm được”* thay vì lộ dữ liệu.

## Gỡ / tắt

- Tắt plugin trong **Plugin Manager**. Nút tìm và phím tắt biến mất; cấu hình đã lưu (phạm vi tìm, cách mở, giao diện)
  vẫn còn trên máy chủ và **quay lại khi bật lại** plugin.

---

### Cho nhà phát triển
- Tài liệu kỹ thuật đầy đủ (kiến trúc 3 lane, luồng tìm kiếm, ACL, build/deploy): xem **`README.md`** (tiếng Anh).
- Cấu hình lưu ở collection **`globalSearchConfig`** (3 khóa: `targets`, `viewlinks`, `appearance`); localStorage chỉ là bản dự phòng khi máy chủ không tới được.
- **Đổi tầng server** (vd collection `globalSearchConfig`) cần **khởi động lại NocoBase**, không chỉ tải lại trang.
- Ép chỗ đặt nút trên thanh tiêu đề bằng `window.__PTDL_SEARCH_HEADER_SELECTOR__ = '<css selector>'` nếu layout đặc biệt.
