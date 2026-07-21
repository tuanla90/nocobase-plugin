# Thiết bị hiện trường (chụp ảnh · định vị · quét mã) — Hướng dẫn sử dụng

> Dùng **phần cứng của điện thoại/tablet** (camera, GPS, micro) để nhập liệu ngay tại hiện trường:
> chụp ảnh có **đóng dấu GPS/giờ**, ghi **vị trí trên bản đồ** (không cần API key), **chữ ký** & **ghi âm**,
> **quét QR/barcode** để điền hoặc tra cứu, và **check-in** một chạm.

**Nhóm:** Fields (Trường) + Actions (Hành động) · **Chạy trên:** /admin (classic) + /v/ (modern) · **Phiên bản:** 0.8.3

> ⚠️ **Điều kiện bắt buộc: trang chạy HTTPS** (hoặc `localhost`). Camera, GPS và micro của trình duyệt **chỉ hoạt động trên HTTPS**. Host trên Railway đã có sẵn HTTPS → mở URL production trên điện thoại là dùng được.

## Sau khi cài, có gì mới?

Plugin **không thêm menu hay trang cấu hình riêng**. Thay vào đó nó bổ sung **kiểu field, thành phần hiển thị field và nút hành động** để bạn gắn vào chính các trang/khối dữ liệu của mình:

| Thành phần mới | Loại | Xuất hiện ở đâu |
|---|---|---|
| **Vị trí (GPS)** | Kiểu field mới | **Add field → nhóm "Thiết bị"** |
| **Chụp ảnh (camera)** | Field component | Trên field **Đính kèm (attachment)** |
| **Chữ ký** | Field component | Trên field **Đính kèm** |
| **Ghi âm** | Field component | Trên field **Đính kèm** |
| **Quét mã (QR/Barcode)** | Field component | Trên field **chữ / số** (input, number, uuid…) |
| **Mã QR (hiển thị)** | Field component (chỉ xem) | Trên field **chữ / số** |
| **Check-in (vị trí)** | Hành động (trên bản ghi) | **Add action** ở dòng bảng / chi tiết / form |
| **Quét mã → tra cứu** | Hành động (trên bảng) | **Add action** ở thanh công cụ khối Bảng |
| **Tự động ghi nhận khi Lưu** | Cấu hình khối Form | ⚙ của khối **Form (Create/Edit)** |

## Cấu hình ở đâu?

Không có trang Settings tập trung — **mỗi thứ được chỉnh ngay tại chỗ** qua bánh răng **⚙** (nhớ **bật UI Editor** trước). Mỗi thành phần có một hộp thoại cấu hình riêng:

| Thành phần | Mở cấu hình bằng | Tên hộp thoại |
|---|---|---|
| Field Vị trí (GPS) | ⚙ trên field | **Cấu hình vị trí** |
| Chụp ảnh (camera) | ⚙ trên field | **Cấu hình chụp ảnh** |
| Chữ ký | ⚙ trên field | **Cấu hình chữ ký** |
| Ghi âm | ⚙ trên field | **Cấu hình ghi âm** |
| Quét mã (QR/Barcode) | ⚙ trên field | **Cấu hình quét mã** |
| Mã QR (hiển thị) | ⚙ trên field | **Cấu hình mã QR** |
| Check-in (vị trí) | ⚙ trên nút hành động | **Cấu hình Check-in** |
| Quét mã → tra cứu | ⚙ trên nút hành động | **Cấu hình quét → tra cứu** |
| Tự động ghi nhận khi Lưu | ⚙ trên khối Form | **Tự động ghi nhận khi Lưu** |

> 💡 **Classic (`/admin`) khác một chút:** giao diện classic không có mục **Add field → Thiết bị**. Để dùng field vị trí ở classic, hãy tạo một field kiểu **JSON** rồi vào ⚙ → **Field component → "Vị trí (GPS)"**. Mọi thứ còn lại giống hệt /v/.

## Dùng thế nào (từng bước)

### Tình huống A — Chụp ảnh hiện trường có đóng dấu GPS + giờ

1. Vào bảng/collection cần nhập, thêm một field **Đính kèm (attachment)** (nếu chưa có).
2. Bật **UI Editor** → bấm vào field đính kèm đó → mở **⚙ → Field component → "Chụp ảnh (camera)"**.
3. Mở **⚙** lần nữa → **"Cấu hình chụp ảnh"** và chỉnh:
   - **Cách chụp**: **"Trong app"** (mở camera trong trang, **ép chụp ảnh sống** — bằng chứng thật, không cho chọn từ thư viện) hoặc **"Camera hệ thống"** (mở app camera của máy).
   - **Watermark (đóng dấu lên ảnh)**: bật/tắt **Giờ chụp**, **Toạ độ GPS**, **Người chụp**, thêm **Dòng chữ thêm**, chọn **Vị trí** dấu (Dưới-trái / Dưới-phải / Trên-trái / Trên-phải).
   - **Ảnh & dữ liệu**: **Kích thước tối đa** (1280/1600/1920/Giữ gốc) và **Chất lượng JPEG** để tiết kiệm 4G; **Lưu toạ độ vào field** (chọn một field Vị trí (GPS) để ghi kèm toạ độ); **Bắt buộc chụp ảnh khi Lưu**.
4. **Lưu**. ✅ Trên form giờ có nút **📷 Chụp ảnh** — bấm để chụp, ảnh được đóng dấu rồi tự tải lên.

### Tình huống B — Field "Vị trí (GPS)": lấy toạ độ, chọn trên bản đồ, ra địa chỉ

1. **Add field → nhóm "Thiết bị" → "Vị trí (GPS)"** (classic: field JSON + Field component "Vị trí (GPS)").
2. Vào **⚙ → "Cấu hình vị trí"** để chọn:
   - **Độ chính xác cao**, **Hiện độ chính xác (±m)**.
   - **Bản đồ**: **Bản đồ khi nhập (kéo ghim để chọn)** và **Bản đồ khi xem (chi tiết)**, **Chiều cao bản đồ**.
   - **Địa chỉ (reverse geocode — OSM, miễn phí)**: **Tắt** / **Nút bấm** / **Tự động** — tự đổi toạ độ ra địa chỉ chữ (miễn phí qua OpenStreetMap, ~1 lần/giây), chọn **Ngôn ngữ** (mặc định `vi`).
   - **Ngưỡng màu độ chính xác**: **Tốt khi ≤ (m)** / **Khá khi ≤ (m)** — chấm màu xanh/vàng/đỏ theo sai số.
3. Khi nhập liệu: bấm **📍 Lấy vị trí** để lấy toạ độ hiện tại; hoặc **bấm/kéo ghim trên bản đồ**; hoặc **"Nhập tay / dán link"** (dán thẳng link Google Maps, hệ thống tự tách toạ độ).
4. **Lưu**. ✅ Ở bảng/chi tiết hiển thị dạng pill 📍 `vĩ độ, kinh độ (±m)`, bấm mở Google Maps.

> 💡 **Không cần API key bản đồ** — bản đồ dùng OpenStreetMap, định vị dùng GPS của trình duyệt.

### Tình huống C — Quét QR/Barcode để điền vào ô

1. Trên field **chữ/số** (mã sản phẩm, số lô…) → **⚙ → Field component → "Quét mã (QR/Barcode)"**.
2. **⚙ → "Cấu hình quét mã"**: **Bíp khi quét**, **Rung khi quét**, **Tự Lưu sau khi quét**; mục **Biến đổi kết quả (nâng cao)** cho phép dùng **Regex (cắt/lọc mã)** + **Thay thế** để lấy đúng phần cần.
3. Khi nhập: ô có nút **📷** ở cuối → bấm để mở khung quét → mã đọc được tự điền vào ô.

### Tình huống D — Check-in GPS một chạm (điểm danh / xác nhận ghé thăm)

1. Cần sẵn một field **Vị trí (GPS)** (hoặc JSON) trong bảng để chứa toạ độ.
2. Ở khối Bảng/Chi tiết → **Add action → "Check-in (vị trí)"**.
3. **⚙ → "Cấu hình Check-in"**: chọn **Ghi vào field Vị trí**, bật **Độ chính xác cao**, **Hỏi xác nhận** nếu muốn hỏi trước, và đặt **Nhãn nút** (trống = "Check-in").
4. Bấm nút **📍 Check-in** trên bản ghi → lấy GPS hiện tại và ghi vào field đã chọn, rồi làm mới. ✅

### Tình huống E — Quét mã để tra cứu / bán hàng (POS)

1. Ở thanh công cụ khối **Bảng** → **Add action → "Quét mã → tra cứu"**.
2. **⚙ → "Cấu hình quét → tra cứu"**:
   - **Field chứa mã (tra cứu trong bảng này)**: cột dùng để tìm bản ghi theo mã quét.
   - **Khi tìm thấy**: **Thêm vào giỏ** (đẩy vào giỏ Sub-table Pro — POS), **Lọc bảng** (lọc tới bản ghi khớp), hoặc **Thông báo**.
   - **Kênh giỏ (khớp Sub-table Pro)**, **Quét liên tục (POS)**, **Bíp**, **Rung**, **Nhãn nút**.
3. Bấm nút quét → mỗi mã quét được sẽ tra trong bảng và xử lý theo cấu hình; bật **Quét liên tục** để quét liên tiếp không cần đóng khung.

### Tình huống F — Chữ ký & Ghi âm

- **Chữ ký:** field **Đính kèm** → ⚙ → **Field component → "Chữ ký"** → **"Cấu hình chữ ký"** (Màu bút, Nét bút, Chiều cao, Nền trắng, **Ghi tên + giờ dưới chữ ký**). Nút **✍️ Ký tên** mở bảng ký bằng ngón tay/chuột, lưu thành ảnh PNG.
- **Ghi âm:** field **Đính kèm** → ⚙ → **Field component → "Ghi âm"** → **"Cấu hình ghi âm"** (**Thời lượng tối đa**). Nút **🎙️ Ghi âm** ghi một đoạn thoại và đính kèm vào bản ghi.

### Tình huống G — Tự động ghi nhận khi Lưu (không cần bấm thủ công)

1. Ở khối **Form (Create/Edit)** → **⚙ → "Tự động ghi nhận khi Lưu"**.
2. Bật **"Bật tự động ghi nhận khi Lưu"**; tuỳ chọn **"Ghi thông tin thiết bị vào field"** (chọn một field JSON/chữ để lưu hệ điều hành, trình duyệt, dòng máy, độ phân giải…).
3. **Lưu**. ✅ Từ giờ, khi người dùng bấm **Lưu form**:
   - mỗi field **Vị trí (GPS)** tự lấy toạ độ (theo cấu hình **Thời điểm lấy** của từng field: **Chỉ khi trống** / **Luôn cập nhật**);
   - field **Chụp ảnh** đặt **Bắt buộc** sẽ **chặn lưu** nếu chưa có ảnh;
   - giờ & người ghi tự dùng trường hệ thống (`createdAt`/`updatedAt`/`createdBy`).

## Mẹo & lưu ý

- ⚠️ **Bắt buộc HTTPS.** Nếu mở qua `http://` (không phải localhost), trình duyệt sẽ chặn camera/GPS/micro và các nút sẽ báo lỗi quyền.
- ⚠️ **Cần bật plugin "File manager".** Ba field **Chụp ảnh / Chữ ký / Ghi âm** đều tải file qua bộ đính kèm sẵn có; nếu File manager tắt thì ba thành phần này sẽ không hiện (field Vị trí, quét mã, check-in vẫn dùng bình thường).
- **Lần đầu dùng sẽ xin quyền.** Trình duyệt hỏi cấp quyền **Máy ảnh / Vị trí / Micro** — chọn **Cho phép**. Nếu lỡ từ chối, plugin hiện hướng dẫn mở lại quyền theo từng máy (iOS Safari / Chrome Android). Nhớ bật **GPS/Location** của điện thoại.
- **Watermark đóng thẳng vào ảnh** (vì xử lý ảnh làm mất EXIF) → dấu GPS/giờ không thể bị gỡ khỏi ảnh. Muốn giữ toạ độ ở dạng dữ liệu tra cứu được, dùng thêm **"Lưu toạ độ vào field"**.
- **Field Vị trí lưu dạng JSON** `{lat, lng, accuracy, ts, src, address}` → lọc/thống kê được, và **không tốn API key**.
- **Thông tin thiết bị** chỉ lấy được: hệ điều hành, trình duyệt, dòng máy (Android; iOS chỉ hiện "iPhone"), độ phân giải, mã-giả. **Không lấy được IMEI/ID phần cứng**; địa chỉ IP phải lấy ở phía máy chủ.
- **Reverse geocode** dùng dịch vụ miễn phí của OpenStreetMap, giới hạn ~1 yêu cầu/giây — hợp nhập liệu, không hợp gọi hàng loạt.
- Chạy trên **cả hai** giao diện classic `/admin` và modern `/v/`. Riêng mục **Add field → Thiết bị** chỉ có ở /v/; classic dùng field **JSON** + Field component (xem mục "Cấu hình ở đâu?").

## Gỡ / tắt

- **Bỏ một thành phần lẻ:** vào ⚙ của field/nút đó, đổi **Field component** về mặc định, hoặc xoá nút hành động. Cấu hình mỗi thành phần có nút **"Đặt lại"** để trả về mặc định.
- **Gỡ hẳn:** tắt plugin trong **Plugin Manager**. Các nút camera/định vị/quét/chữ ký/ghi âm ngừng hiện. **Dữ liệu vẫn còn**: ảnh/chữ ký/ghi âm là đính kèm thường; toạ độ và thông tin thiết bị là JSON trong bản ghi; giá trị do quét mã điền vào cũng là dữ liệu chữ/số bình thường.
- Field **Vị trí (GPS)** khi tắt plugin sẽ hiển thị dưới dạng JSON thô (dữ liệu không mất); bật lại plugin là hiện đẹp trở lại.

---

### Cho nhà phát triển

Client-only (server no-op), một đường đăng ký dùng chung cho **cả hai lane** (`src/shared/registerAll.tsx`), chỉ khác lớp cơ sở tiêm vào từng lane. **Chụp ảnh / Chữ ký / Ghi âm** subclass `UploadFieldModel` của plugin-file-manager (giữ nguyên value/preview/submit native, chỉ thêm nút). **Vị trí (GPS)** là `CollectionFieldInterface` tùy biến `ptdlLocation` (dbType `json`, nhóm "Thiết bị"), có fallback bind vào interface `json`; bản đồ dùng Leaflet + OpenStreetMap (không key). **Check-in** và **Quét mã → tra cứu** là `ActionModel` tùy biến (house pattern `getModelClass('ActionModel')` → subclass → `define({label})`). **Tự động ghi nhận khi Lưu** vá `submitHandler` của `CreateFormModel`/`EditFormModel` để chụp GPS/kiểm tra bắt buộc trước khi pipeline native chạy. Mọi khâu đăng ký đều **guard try/catch** (một phần lỗi không kéo sập phần khác). i18n theo chuẩn VN-source (chuỗi VN làm key + `src/locale/en-US.json`), dùng `@tuanla90/shared` settings-kit. Chi tiết kỹ thuật & build: xem `README.md` (tiếng Anh) và `docs/*` của workspace.
