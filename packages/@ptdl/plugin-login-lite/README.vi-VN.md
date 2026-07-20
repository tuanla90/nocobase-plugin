# Trang đăng nhập tùy biến — Hướng dẫn sử dụng

> Đổi toàn bộ diện mạo **trang đăng nhập** NocoBase — nền, bố cục & vị trí form, màu sáng/tối, logo,
> icon ô nhập, chân trang và trang đích sau khi đăng nhập — ngay trong trang quản trị, **có xem trước
> trực tiếp**, **không cần code**.

**Nhóm:** Xác thực & Giao diện (Auth/UI) · **Chạy trên:** /admin (classic) + /v/ (modern) · **Phiên bản:** 2.3.2

## Sau khi cài, có gì mới?

- **Trang đăng nhập (`/signin`) được thay bằng giao diện tùy biến của plugin.** Ngay khi bật (dù **chưa
  cấu hình gì**), trang đã có sẵn **nền gradient dựng sẵn** + **form cột bên** — nhẹ, **không gọi ảnh từ ngoài**.
- **Một trang cấu hình mới trong Settings**: **“Cấu hình đăng nhập”** (biểu tượng bánh răng). Đây là nơi duy nhất bạn chỉnh.
- **Không thêm menu, nút hay field** nào lên các trang/khối dữ liệu của bạn.
- Có **khung xem trước (live preview)** cập nhật ngay khi bạn chỉnh — không cần lưu để xem thử.

## Cấu hình ở đâu?

| Giao diện | Đường tới trang cấu hình |
|---|---|
| **Modern (`/v/`)** | ⚙ **Settings** → **“Cấu hình đăng nhập”** |
| **Classic (`/admin`)** | **Settings** → **“Cấu hình đăng nhập”** (đường dẫn `/admin/settings/plugin-login`) |

Cả hai giao diện chỉnh **cùng một cấu hình** (bản ghi kiểu **“Cấu hình trang đăng nhập”**), nên sửa ở đâu cũng ra kết quả như nhau.

## Dùng thế nào (từng bước)

> Hai giao diện có cách bày khác nhau một chút, nhưng **các mục cấu hình y hệt**:
>
> - **Modern (`/v/`):** một biểu mẫu chia thẻ (**Chung / Nền / Vị trí & kiểu form / Màu sắc / Chân trang**),
>   bên phải là **ô xem trước thu nhỏ**. Chỉnh xong bấm **“Gửi”**; bấm **“Làm mới”** để nạp lại.
> - **Classic (`/admin`):** một **bảng** các cấu hình. Bấm **“Thêm”** (hoặc **“Sửa”** ở một dòng) để mở
>   **cửa sổ toàn màn hình**: **nửa trái là trang đăng nhập thật đang xem trước**, nửa phải là bảng chỉnh.
>   Xong bấm **“Gửi”** (thoát không lưu thì **“Hủy”**).

### Tình huống A — Chọn nền cho trang

Vào mục **Nền** → **“Nội dung hiển thị bên trái”**, chọn 1 trong 4 kiểu:

| Kiểu nền | Dùng khi | Cần điền thêm |
|---|---|---|
| **Gradient** *(mặc định)* | muốn nền màu chuyển đẹp, nhẹ, **không tải ảnh ngoài** | chọn **“Mẫu gradient”**: Vũ trụ · Nửa đêm · Đại dương · Tím · Hoàng hôn · Cực quang · Ngọc lục bảo |
| **Hình ảnh** | có ảnh nền riêng | **“URL ảnh nền bên trái”** (để trống → tự quay về gradient) |
| **Nhúng HTML** | muốn nền động bằng HTML/CSS của bạn | dán **“Mã HTML nhúng”** |
| **Nhúng trang web** | nhúng nguyên một trang web làm nền | **“URL trang web nhúng”** (hiển thị trong khung iframe) |

Nhìn khung xem trước đổi ngay → **“Gửi”**.

### Tình huống B — Bố cục & vị trí form

Vào mục **Vị trí & kiểu form**:

1. **“Kiểu bố cục form”**:
   - **“Cột bên (toàn chiều cao)”** — form là một cột đặc cao hết màn hình, nền phủ phần còn lại.
   - **“Thẻ nổi”** — form là một thẻ bo góc **nổi trên nền**.
2. **“Vị trí form”**: **Trái / Giữa / Phải**.
   > ⚠️ **Giữa** chỉ áp dụng cho **Thẻ nổi**; **Cột bên** chỉ dùng **Trái** hoặc **Phải**.

### Tình huống C — Màu sắc, sáng/tối, logo, icon ô nhập

- **“Chủ đề form”** (mục **Màu sắc**): chọn cách phối màu
  - **“Tùy chỉnh”** — tự đặt từng màu bên dưới.
  - **“Sáng”** / **“Tối”** — preset đầy đủ, **ghi đè** các ô màu (khi đó các ô màu tự ẩn).
  - **“Theo hệ thống”** — tự đổi sáng/tối theo cài đặt máy của **người truy cập**.
- Khi để **“Tùy chỉnh”**, đặt: **Màu nền chủ đạo**, **Màu chữ**, **Màu nền form đăng nhập**, **Màu chữ form đăng nhập**,
  **Màu nền nút**, **Màu chữ nút**, và **“Độ trong suốt nền panel”** (kéo % để nền **lộ qua** sau form).
- **“URL ảnh logo”** (mục **Chung**): hiện logo phía trên tiêu đề form; để trống để ẩn.
- **“Hiện icon trong ô nhập”** *(bật sẵn)*: chọn **“Icon tên đăng nhập”** (user · mail · at · id) và
  **“Icon mật khẩu”** (lock · key · shield) hiện bên trong ô nhập.
- **“Dùng tên hệ thống”**: **Có** = lấy tên app từ cài đặt hệ thống; **Không** = nhập **“Tên hệ thống tùy chỉnh”**.

### Tình huống D — Sau khi đăng nhập & chân trang

- **“Trang mặc định sau đăng nhập”** (mục **Sau khi đăng nhập**; ở `/v/` nằm trong thẻ **Chân trang**):
  ví dụ `/admin` — trang sẽ **tự mở** sau khi đăng nhập thành công nếu đường dẫn không có sẵn `redirect`.
  Để trống để giữ mặc định của hệ thống.
- **“Bản quyền / chữ chân trang (Markdown)”** và **“Thông tin ICP (Markdown)”**: viết bằng **Markdown**, hiện ở chân form.

> ✅ **Cho có hiệu lực:** ở **Classic**, tick **“Bật”** rồi **“Gửi”** — **chỉ một cấu hình được Bật một lúc**
> (bật cấu hình mới sẽ **tự tắt** cấu hình cũ). Ở **Modern (`/v/`)**, cứ **“Gửi”** là áp dụng ngay cho cấu hình đang hoạt động.

## Mẹo & lưu ý

- 👀 **Xem trước:** Classic hiện **nguyên trang đăng nhập thật** ở nửa trái cửa sổ và đổi gần như **tức thì** khi bạn chỉnh;
  Modern (`/v/`) hiện một **khung thu nhỏ** bên phải.
- 🔒 **Nền mặc định là gradient dựng sẵn** — không tải ảnh từ ngoài, nhẹ và riêng tư.
- 🪟 Muốn **nền lộ qua sau form**: dùng màu form trong suốt hoặc giảm **“Độ trong suốt nền panel”**.
- ⚠️ **Nhúng HTML / trang web:** chỉ nhúng nguồn bạn **tin tưởng** — mã HTML thô / iframe sẽ chạy ngay trên trang đăng nhập.
- Đổi **có hiệu lực ngay sau khi “Gửi”** — người dùng chỉ cần tải lại trang `/signin`. **Không cần restart server.**
- Chạy trên **cả hai** giao diện (classic `/admin` và modern `/v/`) và **cùng sửa một cấu hình**.
- Chân trang mặc định giữ dòng **“Powered by NocoBase”** theo yêu cầu của giấy phép mã nguồn mở — nên giữ lại.

## Gỡ / tắt

- **Đổi/tắt một cấu hình:** ở Classic bỏ tick **“Bật”** ở dòng cấu hình → **“Gửi”**. Lưu ý: khi **không cấu hình nào được bật**,
  trang đăng nhập **vẫn dùng giao diện mặc định của plugin** (gradient + form cột bên), **không** trở về trang gốc.
- **Trả về trang đăng nhập gốc của NocoBase:** **tắt plugin** trong **Plugin Manager** — trang đăng nhập trở lại mặc định **ngay**.
- **Dữ liệu:** cấu hình đã lưu vẫn nằm trong bảng `login_configs`; **bật plugin lại là có ngay**, không mất gì.

---

### Cho nhà phát triển

Plugin **ghi đè** `AuthLayout` + `SignInPage` ở **cả hai lane** (`/` classic và `/v/` modern). Cấu hình lưu trong
bảng **`login_configs`** — mỗi bản ghi có `options` (JSON), `type = 'home'`, cờ `enabled`. Action **`getActiveConfig`**
chỉ **public** cho `type = 'home'`; **bật** một cấu hình sẽ **tự tắt** các cấu hình cùng loại (chỉ một active). Trang cấu
hình đăng ký qua `pluginSettingsManager.add` (classic) và `addMenuItem` + `addPageTabItem` (v2), cùng chỉnh một bản ghi.
Các helper thuần (không phụ thuộc framework) nằm trong `@ptdl/shared` (`loginKit`) và được đóng gói kèm plugin. Song-license
AGPL-3.0 / NocoBase Commercial — vui lòng giữ dòng attribution ở chân trang. Chi tiết kỹ thuật: xem `README.md` (tiếng Anh).
