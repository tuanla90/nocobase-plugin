# Field nâng cao — Hướng dẫn sử dụng

> Đổi cách một **trường (field)** hiển thị/nhập liệu sang kiểu đẹp và dễ đọc hơn: thanh tiến độ,
> chấm sao, nhãn màu, huy hiệu On/Off, ô nhập có icon… mà **không cần code**.
> Kèm sẵn một **thư viện snippet RunJS** cho trường hợp bạn muốn tự script.

**Nhóm:** Fields · **Chạy trên:** /admin (classic) + /v/ (modern) · **Phiên bản:** 0.2.10

## Sau khi cài, có gì mới?

- **Không thêm menu, không thêm trang.** Thay đổi nằm ngay trong **⚙ cấu hình của từng cột/field**
  trên block (Bảng, Chi tiết, Biểu mẫu, List).
- Mỗi widget đăng ký thành một **“Field component”**. Với field đúng kiểu dữ liệu, mở ⚙ → **Field component**
  sẽ thấy **thêm các lựa chọn hiển thị mới** (vd cột số → có thêm **Progress bar**, **Star rating**, **Number with unit**).
- Field kiểu **màu (`color`)** và **icon** được đổi renderer **mặc định** ngay khi bật (không cần chỉnh);
  các widget còn lại là **tùy chọn** — field cũ giữ nguyên tới khi bạn tự chọn.

## Bản đồ: kiểu field → widget có thêm

| Kiểu field (data type) | Widget hiển thị thêm được |
|---|---|
| Số: `number`, `integer`, `percent` | **Progress bar** (thanh tiến độ), **Number with unit** (số + đơn vị), **Percent text** |
| Số: `number`, `integer` | **Star rating** (chấm sao) |
| `checkbox`, `boolean` | **Boolean style** — Toggle hoặc Icon, đặt nhãn On/Off, màu On/Off |
| `color` *(mặc định)* | **Colour chip** (dot / chip / pill / bar) · **Colour input** (ô chọn màu) |
| `icon` *(mặc định)* | **Icon glyph** (hiện icon) · **Input with icon** (ô nhập gắn icon) |
| `select`, `multipleSelect` | **Button group** (nhóm nút) · **Value tag** (nhãn màu theo giá trị) · **Rich select** |
| `url`, `email`, `phone`, `input` | **Link** (biến chuỗi thành liên kết bấm được) |
| `textarea`, `markdown`, `richText` | **Clamp text** (cắt gọn N dòng) · **Rich display** · **Text style** |
| `json` | **JSON view** (xem JSON gọn, có thu gọn) |
| `date` / `datetime` | **Relative date** (“3 ngày trước”…) + xem ngày thật khi hover |

> Tổng khoảng **16 widget**. Đa số **tùy chọn**; riêng **`color`** và **`icon`** thay renderer **mặc định**.

## Dùng thế nào (từng bước)

### Ví dụ — biến cột số “Tiến độ” thành thanh Progress bar
1. Mở trang có **Bảng** chứa cột số (vd cột `progress` kiểu `percent`/`number`).
2. Bật **UI Editor** (chế độ chỉnh giao diện) → **rê chuột vào tiêu đề cột** → bấm biểu tượng **⚙**.
3. Chọn **“Field component”** → trong danh sách chọn **“Progress bar”**
   (danh sách chỉ hiện widget hợp kiểu field).
4. Hộp thiết lập hiện ra (**có preview trực tiếp**) → chỉnh **Low/Mid/High color**, ngưỡng, bo góc… → xong.
5. ✅ Ô trong cột giờ hiển thị thanh tiến độ thay vì con số trần.

### Ví dụ — cột đánh giá thành chấm sao
1. Với cột kiểu `integer`/`number` (vd `rating`), mở **⚙ → “Field component”**.
2. Chọn **“Star rating”** → hộp thiết lập để đặt số sao tối đa, màu.

### Cột màu, cột select…
- Cột `color`: đã tự thành **chip màu**; muốn đổi dạng (dot/pill/bar) → **⚙ → Field component → “Colour chip”**.
- Cột `select`: **⚙ → Field component → “Button group”** (dạng nút) hoặc **“Value tag”** (nhãn màu theo từng giá trị).

> 💡 Cùng một đường **⚙ → Field component** dùng được cho **cột Bảng, trường Chi tiết, trong Biểu mẫu và List**.

## Mẹo & lưu ý

- ⚠️ Widget chỉ xuất hiện với **đúng kiểu dữ liệu** (xem bảng trên). Cột kiểu khác sẽ không có lựa chọn tương ứng.
- ✅ **Hiển thị an toàn**: widget vẽ đè lên giá trị gốc, nên **sắp xếp / lọc / xuất dữ liệu vẫn dùng dữ liệu thật** — không đổi dữ liệu.
- Chạy trên **cả hai** giao diện: classic `/admin` và modern `/v/`.

## Gỡ / tắt

- Tắt plugin trong **Plugin Manager**. Field đang dùng widget quay về renderer mặc định của NocoBase;
  cấu hình widget đã lưu trong schema block vẫn còn nếu bật lại.

---

### Cho nhà phát triển
Mẫu widget đăng ký qua `registerAll` + `bindModelToInterface` (display/editable là 2 class riêng ở v2),
thư viện snippet: xem `src/shared/*` và `PLUGIN-REGISTRY.md`. Doc kỹ thuật đầy đủ: chính `README.md` (tiếng Anh).
