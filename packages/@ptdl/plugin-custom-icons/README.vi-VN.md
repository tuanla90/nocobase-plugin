# Thư viện icon (Lucide + thay icon hệ thống) — Hướng dẫn sử dụng

> Thêm **toàn bộ bộ icon Lucide** vào trình chọn icon của NocoBase (cả `/admin` và `/v/`), và **thay các icon
> Ant Design mặc định bằng Lucide** ở mọi nơi — menu, nút, field, thanh tiêu đề. Kèm **bộ mapping mặc định**
> nạp sẵn khi cài và **trình sửa từng icon** có nhập/xuất CSV. Không cần code, không cần restart server.

**Nhóm:** Giao diện (UI) · Icon · **Chạy trên:** /admin (classic) + /v/ (modern) · **Phiên bản:** 0.2.3

## Sau khi cài, có gì mới?

- **Toàn bộ icon Lucide vào trình chọn icon** — ở **cả hai** giao diện. Khi bạn cấu hình icon cho menu / nút /
  field, mở trình chọn icon là thấy chúng ở **tab “Outlined”**, tìm bằng cách **gõ tên** (vd `cart`, `user`,
  `truck`) hoặc gõ `lucide` để liệt kê tất cả.
- **App tự “Lucide hoá” ngay** — plugin kèm sẵn **hơn 200 cặp đổi icon mặc định** (Ant Design → Lucide) và
  **nạp một lần** khi cài. Nhờ vậy menu, nút, field và thanh header đổi sang icon Lucide gọn gàng mà bạn
  **không phải làm gì**.
- **Một trang cấu hình mới trong Settings**: **“Thay icon hệ thống”** (biểu tượng hai mũi tên đổi chỗ ⇄). Đây là
  nơi bạn **sửa / thêm / xoá** từng cặp đổi icon, có **xem trước** và **nhập/xuất CSV**.

## Cấu hình ở đâu?

| Giao diện | Đường tới trang cấu hình |
|---|---|
| **Modern (`/v/`)** | ⚙ **Settings** → **“Thay icon hệ thống”** |
| **Classic (`/admin`)** | **Settings** → **“Thay icon hệ thống”** (đường dẫn `/admin/settings/icon-remap`) |

Cả hai giao diện mở **cùng một bảng mapping** — sửa ở đâu cũng áp dụng cho cả `/admin` lẫn `/v/`.

> 💡 Riêng việc **dùng** icon Lucide cho menu/nút/field thì không vào trang này — bạn chọn thẳng trong **trình
> chọn icon** ngay chỗ đang thiết kế (xem Tình huống A).

## Dùng thế nào (từng bước)

### Tình huống A — Dùng một icon Lucide cho menu / nút / field

1. Bật **UI Editor** và mở ô chọn icon của phần bạn đang thiết kế (icon menu, icon nút, icon field…).
2. Chọn **tab “Outlined”**.
3. **Gõ tên** icon cần tìm — vd `cart`, `user`, `calendar` — hoặc gõ `lucide` để xem toàn bộ.
4. Bấm chọn icon. ✅ Xong — icon Lucide hiển thị ngay tại chỗ.

### Tình huống B — Đổi một icon hệ thống sang Lucide (sửa mapping)

1. Mở trang **“Thay icon hệ thống”**.
2. Bấm **“+ Thêm mapping”** để thêm một dòng.
3. Ở cột **“Icon hệ thống (Ant Design)”**, bấm ô chọn → **gõ tên** icon nguồn (vd `setting`, `delete`) → chọn.
4. Ở cột **“Thay bằng (Lucide)”**, bấm ô chọn → **gõ tên** icon Lucide thay thế (vd `settings`, `trash`) → chọn.
5. Xem cột **“Kết quả”**: nó hiện **icon cũ → icon mới** để bạn kiểm tra trước.
6. Bấm **“Lưu”**, rồi **tải lại trang bằng `Ctrl+Shift+R`**. ✅ Từ giờ icon đó đổi sang Lucide ở **mọi nơi** nó
   xuất hiện (menu, cài đặt, field, nút hành động và thanh header).

### Tình huống C — Trả một icon về mặc định (gỡ đổi icon)

1. Mở trang **“Thay icon hệ thống”**.
2. Bấm nút xoá (**✕**) ở cuối dòng cần bỏ.
3. Bấm **“Lưu”** → **`Ctrl+Shift+R`**. ✅ Icon đó trở lại đúng bản Ant Design gốc.

### Tình huống D — Chép cả bộ mapping sang site NocoBase khác

1. Ở site nguồn: mở trang → bấm **“⬇ Tải CSV xuống”** (tải về file `icon-remap.csv`).
2. Ở site đích: mở trang → bấm **“⬆ Nhập CSV”** → chọn file vừa tải.
3. Bảng sẽ được **thay bằng nội dung CSV** (chưa lưu). Kiểm tra rồi bấm **“Lưu”** → **`Ctrl+Shift+R`**.

> 💡 Bấm **“Tải lại”** bất cứ lúc nào để bỏ các thay đổi chưa lưu và nạp lại đúng trạng thái đang lưu trên máy chủ.

## Mẹo & lưu ý

- ⚠️ **Luôn hard-refresh sau khi Lưu.** Icon chỉ đổi trên toàn app sau khi bạn tải lại trang bằng
  **`Ctrl+Shift+R`** (app sẽ nhắc đúng câu này khi lưu xong).
- ⚠️ **Đổi icon là toàn cục theo từng icon**, không thể chỉ đổi ở một chỗ. Ví dụ đổi `settingoutlined` thì **mọi**
  bánh răng trong app đổi theo. Một icon nguồn chỉ ánh xạ tới **một** icon Lucide (trùng thì dòng sau thắng).
- **Không cần restart server.** Chỉ cần **Lưu** rồi **tải lại trang**; thay đổi áp dụng cho **cả hai** giao diện
  vì dùng chung một bảng mapping.
- **Bộ mặc định chỉ nạp một lần cho mỗi bản cài.** Nếu bạn **xoá** một dòng mặc định rồi **Lưu**, nó **không**
  tự quay lại khi restart — lựa chọn của bạn được tôn trọng.
- Vài cặp mặc định để bạn hình dung:

  | Icon hệ thống (Ant Design) | Đổi thành (Lucide) |
  |---|---|
  | `settingoutlined` (bánh răng) | `lucide-settings` |
  | `searchoutlined` (kính lúp) | `lucide-search` |
  | `deleteoutlined` (thùng rác) | `lucide-trash2` |
  | `editoutlined` (bút sửa) | `lucide-pencil` |
  | `homeoutlined` (trang chủ) | `lucide-house` |

- **Cách tìm trong ô chọn icon:** cột nguồn tìm trong **Ant Design** (gõ vd `setting`), cột đích tìm trong
  **Lucide** (gõ vd `settings`). Danh sách hiển thị tối đa **120** icon một lúc — cứ **gõ để thu hẹp** nếu thấy
  dòng “+… nữa — gõ để thu hẹp”.
- **CSV** gồm đúng 2 cột: `sourceKey,lucideKey` (vd `SettingOutlined,lucide-settings`). File có sẵn BOM nên mở
  bằng Excel không lỗi phông. Nhập CSV sẽ **thay** bảng đang có; nhớ bấm **“Lưu”** để áp dụng.
- Trang cấu hình cần **đăng nhập**; mapping là **cấu hình chung của cả app** (không theo từng người dùng).

## Gỡ / tắt

- **Tạm bỏ đổi icon (vẫn giữ thư viện Lucide):** vào trang **“Thay icon hệ thống”**, xoá các dòng không muốn (hoặc
  xoá hết) → **“Lưu”** → **`Ctrl+Shift+R`**. Các icon liên quan trở lại bản Ant Design mặc định.
- **Gỡ hẳn:** tắt plugin trong **Plugin Manager**. Toàn bộ icon Lucide **biến khỏi trình chọn icon** và các icon hệ
  thống **trở lại Ant Design** ngay. Bảng mapping (`ptdlIconRemaps`) vẫn được **giữ trong cơ sở dữ liệu** — bật lại
  thì các cặp bạn từng lưu vẫn còn.
- ℹ️ **Khi bật lại plugin**, hệ thống có thể **nạp lại các cặp mặc định**. Nếu muốn giữ đúng những gì đã tinh chỉnh,
  vào trang, xoá lại các dòng thừa rồi **“Lưu”**.

---

### Cho nhà phát triển

Hai cơ chế đổi icon chạy song song ở phía client: **ghi đè registry** (`icons` Map của mỗi lane — thay icon vẽ qua
`<Icon type="…">`) và **CSS mask** (phủ lên class `.anticon-*` — để đổi được cả những icon NocoBase nhúng cứng như
thanh header). Mapping lưu ở collection **`ptdlIconRemaps`** (`sourceKey` → `lucideKey`); server **seed hơn 200 cặp
mặc định một lần/instance** (upsert-missing, không đè lên chỉnh sửa của người dùng). Thư viện Lucide đăng ký cả bộ
`lucide-react`, hiển thị ở tab **Outlined** (key `lucide-<tên>outlined`) kèm alias `lucide-<tên>` cho plugin khác gọi
theo tên. Chi tiết kỹ thuật: xem `README.md` (tiếng Anh).
