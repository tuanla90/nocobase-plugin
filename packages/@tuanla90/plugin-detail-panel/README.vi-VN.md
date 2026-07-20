# Panel bên (xem chi tiết kiểu chia đôi màn hình) — Hướng dẫn sử dụng

> Mở bản ghi **ghim sang bên phải** thay vì bật popup che kín màn hình — kiểu **master–detail của AppSheet**:
> danh sách ở bên trái, chi tiết bản ghi ở bên phải, kéo thanh giữa để chỉnh rộng hẹp. Chỉ cần bật, **không cần code**.

**Nhóm:** Khối (Blocks) · **Chạy trên:** **chỉ /v/ (modern)** — không áp dụng /admin (classic) · **Phiên bản:** 0.1.1

## Sau khi cài, có gì mới?

- **Thêm một cách mở bản ghi mới: “Panel bên”** — lựa chọn **thứ 4** nằm cạnh Drawer / Dialog / Page trong phần *cách mở popup* (Open mode) của mỗi nút mở popup (Xem/Sửa…). Chọn nó thì popup **ghim sang phải**, nội dung chính **co lại bên cạnh** thay vì bị lớp phủ che kín.
- **Một tuỳ chọn mới trong ⚙ của khối Bảng (Table): “Panel chi tiết cạnh bên”** — bật để **bấm vào bất kỳ đâu trên một dòng** là mở bản ghi đó ra panel bên phải (không cần bấm nút).
- **Thanh kéo (splitter)** ở mép trái panel: kéo để chỉnh độ rộng panel / nội dung.
- **Không thêm** menu, trang Settings, field hay collection nào. **Không đụng tới server** — thuần giao diện.
- ⚠️ Mặc định **chưa bật gì cả**: bạn phải tự chọn **“Panel bên”** cho một nút, hoặc bật công tắc bấm-dòng, thì mới có hiệu lực.

## Cấu hình ở đâu?

Plugin **không có trang Settings riêng**. Mọi thứ chỉnh **ngay trên khối/nút** ở chế độ **UI Editor** (bật nút chỉnh giao diện ở góc trên bên phải).

| Tính năng | Chỉnh ở đâu |
|---|---|
| **Cách mở “Panel bên”** (từng nút) | Bật **UI Editor** → bấm nút (vd **Xem**/**Sửa**) → ⚙ → mục cấu hình popup (*Edit popup*) → phần *cách mở* (Open mode) → chọn **“Panel bên”** |
| **Bấm-dòng mở panel** (cả bảng) | Bật **UI Editor** → ⚙ của khối **Bảng** → **“Panel chi tiết cạnh bên”** |

> ⚠️ Chỉ có ở giao diện **/v/ (modern)**. Trên **/admin (classic)** plugin **không làm gì** (giao diện classic không có nút *cách mở* dạng này, cũng không có vùng ghim để chia đôi màn hình).

## Dùng thế nào (từng bước)

### Tình huống A — Cho nút **Xem/Sửa** mở bản ghi ra panel bên phải

1. Mở trang có khối **Bảng**, bật **UI Editor**.
2. Bấm vào nút của một dòng, ví dụ **Xem** (View) → mở ⚙ → chọn mục cấu hình popup (*Edit popup*).
3. Ở phần *cách mở* (Open mode), chọn **“Panel bên”** (thay cho Drawer / Dialog / Page).
4. (Tuỳ chọn) Chọn **kích thước popup** (Popup size) → panel rộng tương ứng **30% / 40% / 50%** màn hình.
5. **Lưu**. ✅ Từ giờ bấm **Xem** → **đúng popup bạn đã cấu hình** (các thẻ, nút, form/khối con sửa được) sẽ **ghim sang phải**, bảng co lại bên trái; mở dòng khác thì panel **đổi nội dung** chứ không đóng; bấm **X** để đóng và trả lại bố cục.

> 💡 Nó **dùng lại đúng popup bạn đã dựng** — không phải làm mới gì cả. Áp dụng cho mọi chỗ có nút mở popup: nút Xem/Sửa của dòng, field quan hệ…

### Tình huống B — **Bấm vào dòng** là mở panel (không cần bấm nút)

1. Bật **UI Editor** → mở **⚙ của khối Bảng** → chọn **“Panel chi tiết cạnh bên”**.
2. Bật công tắc **“Bấm dòng để mở panel chi tiết bên phải”**.
3. Chọn **“Nội dung panel”**:
   - **“Popup đã cấu hình (đầy đủ, sửa được)”** *(mặc định)* — bấm dòng sẽ mở **đúng popup của nút Xem** (thẻ, nút, form sửa được). Nhờ vậy bấm thân dòng và bấm nút **Xem** cho ra **cùng một popup**. (Nếu bảng chưa có nút mở popup, tự chuyển sang xem nhanh.)
   - **“Xem nhanh (chỉ đọc)”** — danh sách trường **chỉ đọc**, không cần cấu hình gì thêm.
4. Chọn **“Độ rộng panel”**: **“Hẹp (30%)” / “Vừa (40%)” / “Rộng (50%)”**.
5. Nếu chọn **“Xem nhanh (chỉ đọc)”**, có thể dùng ô **“Trường hiển thị (để trống = tất cả)”** để chỉ hiện vài trường (bỏ trống = hiện tất cả).
6. **Lưu**. ✅ Giờ **bấm vào thân dòng bất kỳ** là bản ghi mở ra panel; bấm dòng khác thì **đổi**; bấm **X** để đóng.

> 💡 Bấm trúng **nút** (Xem/Sửa/Xoá), **link**, ô **chọn (checkbox)** hay ô nhập trực tiếp thì **không** kích hoạt panel — các thứ đó chạy hành động riêng của chúng. Nhờ vậy A và B **sống chung** trên cùng một bảng mà **không mở hai lần**.

### Tình huống C — Chỉnh rộng/hẹp panel

- Khi panel đang mở, có **thanh kéo** ở **mép trái** panel — **kéo** để chỉnh độ rộng. Hệ thống giữ tối thiểu **320px cho panel** và **360px cho nội dung chính** để không bị bóp mất.

## Mẹo & lưu ý

- ✅ **Không cần restart server**: đây là tính năng thuần giao diện (client), chỉnh xong **Lưu** là dùng được ngay.
- **A và B dùng chung một vùng panel** bên phải, nên trải nghiệm giống nhau; cả hai đều có thanh kéo chỉnh rộng.
- Ánh xạ kích thước → độ rộng panel:

  | Lựa chọn | Panel rộng |
  |---|---|
  | Nhỏ / **Hẹp (30%)** | ~30% màn hình |
  | Vừa / **Vừa (40%)** *(mặc định)* | ~40% màn hình |
  | Lớn / **Rộng (50%)** | ~50% màn hình |

- ⚠️ **Chỉ /v/**: trên /admin (classic) plugin là **no-op** — không báo lỗi nhưng cũng không có gì thay đổi.
- 📱 **Màn hình rất hẹp / điện thoại**: nếu không có vùng ghim để chia đôi, panel **tự lùi về dạng ngăn kéo (drawer)** che kín như bình thường — vẫn dùng được, chỉ không chia đôi màn hình.
- Sống chung tốt với các plugin @tuanla90 khác thao tác trên cùng khối (vd bấm-dòng của Sub-table Pro, định dạng theo điều kiện).

## Gỡ / tắt

- **Tắt cho một nút:** vào lại mục cấu hình popup của nút, đổi *cách mở* về **Drawer / Dialog / Page** → **Lưu**.
- **Tắt bấm-dòng cho một bảng:** mở **⚙ → “Panel chi tiết cạnh bên”**, tắt công tắc **“Bấm dòng để mở panel chi tiết bên phải”** → **Lưu**.
- **Gỡ hẳn:** tắt plugin trong **Plugin Manager**. Vì plugin **không tạo dữ liệu / collection / field** nào, tắt đi thì các nút quay về cách mở mặc định — **không mất dữ liệu**.

---

### Cho nhà phát triển

Thuần client, **chỉ /v/**; không server / collection / schema. Không vá lõi: **A** bổ sung tuỳ chọn `sidePanel` vào `uiSchema.mode.enum` của action `openView` rồi bọc `handler` để nhắm popup vào vùng ghim `#nocobase-embed-container` (mutate **thuộc tính** của `ctx.inputArgs`, không gán lại cả object) + đặt độ rộng + tắt điều hướng router. **B** đăng ký flow `rowClick` trên `TableBlockModel`; nội dung “popup” kích hoạt lại đúng nút Xem ở chế độ `sidePanel`, nội dung “quick” render danh sách trường chỉ đọc. Một `MutationObserver` trên vùng ghim lo việc đặt lại độ rộng và ẩn/hiện thanh kéo khi panel đóng/mở. Nếu thiếu vùng ghim (vd mobile) thì tự lùi về drawer. Chi tiết kỹ thuật: xem `README.md` (tiếng Anh).
