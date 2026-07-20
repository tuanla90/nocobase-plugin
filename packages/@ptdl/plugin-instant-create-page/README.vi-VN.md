# Tạo trang nhanh — Hướng dẫn sử dụng

> Một cú nhấp biến **một bộ sưu tập + vài cột bạn chọn** thành một **trang menu `/v/` dùng được ngay**:
> khối **Bảng** đúng các cột đó, kèm nút **Xem / Sửa / Thêm mới** mà popup cũng hiển thị đúng các cột đó.
> Không phải bấm cấu hình khối/cột/popup thủ công. Kết quả là trang NocoBase gốc, **chỉnh sửa tiếp thoải mái**.

**Nhóm:** Khối & Trang (Blocks) · **Chạy trên:** chỉ **/v/** (modern) — giao diện **/admin** (classic) không có công cụ này · **Phiên bản:** 0.1.7

## Sau khi cài, có gì mới?

- **Một trang trong Settings**: **“Tạo trang nhanh”** (biểu tượng ô có dấu cộng). Đây là nơi mở công cụ.
- **Một nút nổi ở góc dưới bên phải**: **➕ “Trang nhanh”** (di chuột vào hiện “Tạo nhanh trang bảng”). Bấm được ở **bất kỳ đâu** trong app.
- ⚠️ Plugin **không tự thêm** menu/nút/field nào lên các trang có sẵn của bạn. Nó là **công cụ dựng trang theo yêu cầu** — chỉ chạy khi bạn mở nó ra và bấm **“Tạo trang”**.
- Mỗi lần dùng, bạn nhận về **một trang thật của NocoBase** (nằm trong menu bên trái), sửa tiếp như trang tự dựng tay.

## Cấu hình ở đâu?

Công cụ này **không có cấu hình lưu sẵn** — bạn mở nó ra rồi tạo trang khi cần. Có hai lối vào **cùng một biểu mẫu**:

| Lối vào | Cách mở |
|---|---|
| **Nút nổi** | Bấm **➕ “Trang nhanh”** ở **góc dưới bên phải** màn hình (mở ra ngăn kéo bên phải). |
| **Trang Settings** | ⚙ **Settings** → **“Tạo trang nhanh”**. |

## Dùng thế nào (từng bước)

### Tình huống A — Tạo một trang bảng dùng ngay

1. Bấm nút nổi **➕ “Trang nhanh”** (góc dưới phải) *hoặc* vào **Settings → “Tạo trang nhanh”**.
2. Chọn **“Bộ sưu tập”** (gõ để tìm) — đây là bảng dữ liệu bạn muốn hiển thị.
3. *(Tuỳ chọn)* Sửa **“Tiêu đề trang”** (mặc định lấy theo tên bộ sưu tập), chọn **“Biểu tượng”** cho menu, và **“Đặt trong nhóm menu”** (để trống = đặt ngoài cùng).
4. Ở ô **“Các cột”**, **tick các cột** cần hiển thị. Ô này **giữ mở** để bạn chọn nhiều cột một lượt.
   > 💡 Các cột đã chọn vừa là **cột của bảng**, vừa là **các trường bên trong popup Xem / Sửa / Thêm**.
5. *(Tuỳ chọn)* Tinh chỉnh danh sách cột bên dưới:
   - **Mũi tên ⬆⬇**: sắp xếp thứ tự cột.
   - **⚙ “Cấu hình cột”**: đổi **“Thành phần hiển thị”** (ví dụ thanh Progress, thẻ màu… nếu field hỗ trợ) và **“Tiêu đề cột”** — áp dụng cho **cả** Xem / Sửa / Thêm.
   - **✕**: bỏ cột khỏi trang.
6. Bấm **“Tạo trang”**. ✅ Trang **mở ra ngay**, đồng thời **xuất hiện trong menu bên trái**.

> ⚠️ Nút **“Tạo trang”** chỉ bật khi đã **chọn bộ sưu tập**, **có ít nhất 1 cột** và **tiêu đề không rỗng**.

### Tình huống B — Muốn bảng “xịn” hơn (nếu có plugin Bảng nâng cao)

- Nếu bạn đã cài `@ptdl/plugin-enhanced-table-block`, biểu mẫu sẽ hiện thêm ô **“Loại bảng”**.
- Chọn **“Bảng nâng cao”** (có *dòng tổng + bôi chọn ô*) thay cho **“Bảng cơ bản”**, rồi tạo như bình thường.

### ✅ Trang tạo ra gồm những gì?

| Thành phần | Nội dung |
|---|---|
| **Khối Bảng** | Gắn với bộ sưu tập bạn chọn, mỗi cột đã tick là một cột của bảng (đúng thứ tự bạn sắp). |
| **Nút trên mỗi dòng** | **Xem** (View — xem chi tiết, chỉ đọc) và **Sửa** (Edit — biểu mẫu + Lưu). |
| **Nút trên thanh công cụ** | **Thêm mới** (Add new — biểu mẫu + Lưu) và **Làm mới** (Refresh). |
| **Các popup** | Hiển thị đúng **các cột bạn đã chọn**. |

Vì đây là trang NocoBase gốc (`desktopRoutes` + `flowModels`), bạn có thể **mở UI Editor chỉnh tiếp** như bất kỳ trang tự dựng nào.

## Mẹo & lưu ý

- 🖥️ **Chỉ chạy trên giao diện `/v/` (modern).** Bên `/admin` (classic) công cụ này không hoạt động.
- 🧩 **Popup chỉ có các cột bạn chọn.** Nếu form **Thêm mới / Sửa** cần một trường **bắt buộc** mà bạn chưa tick, hãy mở trang vừa tạo và **thêm trường đó vào form** (bằng UI Editor).
- 🔢 **Thứ tự cột = thứ tự bạn sắp** (dùng mũi tên ⬆⬇ trong danh sách cột).
- 🎨 **Đổi “Thành phần hiển thị” cho một cột** để nó hiện đẹp hơn (ví dụ số phần trăm thành thanh tiến độ) — thay đổi này áp cho cả bảng lẫn các popup.
- 🗂️ **Nhóm menu**: ô **“Đặt trong nhóm menu”** chỉ liệt kê các **nhóm** đã có sẵn; chưa có nhóm nào thì cứ để trống, trang sẽ nằm ở cấp ngoài cùng.
- 🔁 **Không cần restart server** — trang được tạo ngay và hiện luôn trong menu.
- ♻️ **Tạo được nhiều trang**: cứ mở lại công cụ và làm lại cho bộ sưu tập / bộ cột khác.

## Gỡ / tắt

- **Tắt plugin** trong **Plugin Manager**: nút nổi **➕ “Trang nhanh”** và trang **“Tạo trang nhanh”** trong Settings sẽ biến mất — nhưng **các trang bạn đã tạo vẫn còn nguyên và chạy tốt**, vì chúng là trang NocoBase thật, không phụ thuộc plugin này.
- **Muốn bỏ một trang đã tạo**: xoá nó khỏi **menu** như xoá bất kỳ trang nào (công cụ này không “nắm giữ” trang sau khi đã tạo).

---

### Cho nhà phát triển

Công cụ dựng toàn bộ cây `RootPageModel → … → TableBlockModel` trong bộ nhớ rồi lưu **một lần** (`flowModels:save` đệ quy), kèm một dòng `desktopRoutes` để thành mục menu — nên trang sinh ra là NocoBase **gốc**, chỉnh sửa tiếp bình thường. Mỗi cột được ánh xạ sang model hiển thị/sửa qua `getDefaultBindingByField` (ưu tiên), fallback theo `interface`; “Thành phần” và “Tiêu đề” khớp nhau giữa Bảng ↔ Xem ↔ Sửa ↔ Thêm. Chỉ đăng ký ở lane `/v/` (client-v2): một trang Settings + một launcher nổi, cùng render `QuickCreateForm`. Chi tiết kỹ thuật: xem `README.md` (tiếng Anh) và `docs/QUICK-VIEW-DESIGN.md`.
