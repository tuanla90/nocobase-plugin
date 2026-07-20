# Khối bố cục (Tabs / Collapse) — Hướng dẫn sử dụng

> Hai khối để **sắp xếp nội dung trang và gom field trong form**: khối **Tabs** và khối **Collapse (Mục gập)** — đều lồng nhau được, có cả biến thể nhóm-field trong form. Kèm khả năng **đổi kiểu thanh tab** của trang/popup sẵn có sang Line, Pill, Segment, Card, Step hoặc Text, với **mặc định chung cho cả app theo từng theme**.

**Nhóm:** Khối (Blocks) · **Chạy trên:** /admin (classic) + /v/ (modern) · **Phiên bản:** 0.4.3

## Sau khi cài, có gì mới?

Khi bật **chế độ chỉnh giao diện (UI Editor)** bạn sẽ thấy thêm:

- **2 khối mới** trong ô "Add block" (Thêm khối): **Tabs** và **Collapse (Sections)** (Mục gập).
- **2 mục mới** trong bộ thêm field của **Form**: **Tabs** và **Collapse (Sections)** — để chia field thành tab / mục gập ngay trong form.
- **Một mục cấu hình mới** trong bánh răng **⚙** của mọi **trang / popup / view có bật tab**: **Kiểu tab** (Tab style) — đổi giao diện thanh tab sẵn có.
- ⚠️ **Không thêm trang nào trong Settings, không thêm menu.** Mọi thứ chỉnh **ngay trên khối/trang** khi đang bật chế độ chỉnh giao diện.

## Cấu hình ở đâu?

| Bạn muốn chỉnh | Vào đâu |
|---|---|
| Khối **Tabs** (kiểu, màu, cỡ chữ…) | **⚙** trên khối → **Kiểu tab** (Tab style) |
| Khối **Collapse** (Mục gập) | **⚙** trên khối → **Kiểu Collapse** (Collapse style) |
| Một **tab** cụ thể (tên + biểu tượng) | **⚙** ngay trên tên tab → **Sửa tab** (Edit tab) |
| **Thanh tab của trang / popup có sẵn** | **⚙** của trang → **Kiểu tab** (Tab style) |
| **Kiểu mặc định cho MỌI thanh tab** của app | Cùng chỗ trên → bật **Áp dụng cho mọi tab mặc định** |

> Plugin **không có trang cấu hình riêng**. Nhớ bật **chế độ chỉnh giao diện** thì các nút **⚙** và ô "Add block" mới hiện ra.

## Dùng thế nào (từng bước)

### Tình huống A — Thêm khối Tabs vào một trang

1. Mở trang cần sửa, bật **chế độ chỉnh giao diện (UI Editor)**.
2. Bấm **"Add block"** (Thêm khối) ở vùng trống → nhóm **"Other blocks"** (Khối khác) → chọn **Tabs**.
3. Bấm **"Thêm tab"** (Add tab) → **"Tab trống"** (Blank tab) để thêm tab. **Kéo–thả** một tab lên tab khác để đổi thứ tự.
4. Trong mỗi tab, bấm **"Add block"** để bỏ **bất cứ khối nào** vào — kể cả một khối **Tabs** khác (lồng nhau không giới hạn).
5. Trỏ vào tên tab → **⚙** → **"Sửa tab"** (Edit tab) để đặt **Tên tab** (Tab name) và **Biểu tượng** (Icon).
6. Muốn đổi giao diện thanh tab: **⚙** trên khối → **"Kiểu tab"** (Tab style) → chọn kiểu + màu (xem bảng **6 kiểu thanh tab** ở mục *Mẹo & lưu ý*) → có **Xem trước** ngay trong hộp thoại.

### Tình huống B — Thêm khối Collapse (Mục gập)

1. Vẫn trong chế độ chỉnh giao diện, bấm **"Add block"** → **"Other blocks"** → **Collapse (Sections)**.
2. Bấm **"Thêm mục"** (Add section) → **"Mục trống"** (Blank section); mỗi mục chứa được mọi khối như một tab.
3. **⚙** trên khối → **"Kiểu Collapse"** (Collapse style) để chỉnh:

   | Tuỳ chọn | Ý nghĩa |
   |---|---|
   | **Chỉ mở 1 mục (accordion)** | Mở mục này thì tự đóng mục kia |
   | **Mặc định** (Default state) | Ban đầu **Mở tất cả** hay **Đóng tất cả** |
   | **Khung** (Frame) | **Có khung** / **Không viền** / **Trong suốt** |
   | **Cỡ** (Size) | **Nhỏ / Vừa / Lớn** |
   | **Icon mở rộng** (Expand icon) | Đặt ở **Đầu** hay **Cuối** header |
   | **In đậm** + **Màu sắc** | Header, màu mục **Đang mở** / **Bình thường**, **Viền** |

### Tình huống C — Chia field trong Form thành tab / mục gập

1. Mở một khối **Form** (Thêm/Sửa bản ghi), bật chế độ chỉnh giao diện.
2. Ở bộ thêm field của form, vào nhóm **"Others"** → chọn **Tabs** hoặc **Collapse (Sections)**.
3. Thêm tab/mục như trên, rồi kéo các **field** vào từng tab/mục. Field vẫn **lưu và kiểm tra bình thường** — form không quan tâm field nằm sâu bao nhiêu.
   > ⚠️ Field **bắt buộc** đặt trong một tab/mục bạn **chưa mở lần nào** có thể **không kích hoạt kiểm tra** (giao diện chỉ dựng nội dung khi mở tab đó). Nên bấm qua các tab trước khi lưu, hoặc tránh giấu field bắt buộc trong tab hiếm mở.

### Tình huống D — Đổi kiểu thanh tab của một trang / popup có sẵn

1. Vào trang (hoặc popup chi tiết bản ghi) đã **bật tab** → **⚙** của trang → **"Kiểu tab"** (Tab style).
2. Ở ô **Kiểu** (Style) chọn một trong: **Line · Button group (pill) · Segment (bordered) · Card (folder) · Step · Text (color only)** (mô tả từng kiểu ở mục *Mẹo & lưu ý*).
3. Chỉnh **Màu sắc**, **Cỡ chữ**, **In đậm**, **Canh giữa**… và bật **"Ẩn thanh tab khi chỉ có 1 tab"** nếu muốn → **Lưu**.
   > Muốn trang này **theo mặc định chung**? Chọn **Kiểu = "Inherit (global / default)"**.

### Tình huống E — Đặt kiểu mặc định cho MỌI thanh tab (theo theme)

1. Mở **⚙** → **"Kiểu tab"** ở bất kỳ trang/popup nào, chọn kiểu + màu bạn thích.
2. Bật công tắc **"Áp dụng cho mọi tab mặc định (trang / popup / view)"** → **Lưu**.
3. ✅ Mọi trang/popup đang để **"Inherit (global / default)"** sẽ theo kiểu này ở **lần tải lại sau**. Cấu hình lưu **trên máy chủ, theo từng theme** — **admin đặt một lần, mọi người dùng chung**.

> ⚠️ Chỉ có **một** mặc định chung cho **mỗi theme**: lần lưu sau ở trang khác sẽ **ghi đè**. Trang nào bạn chỉnh riêng với công tắc **TẮT** vẫn **giữ kiểu riêng**. Công tắc này **chỉ hiện khi đang chỉnh giao diện**.

## Mẹo & lưu ý

**6 kiểu thanh tab** (nhãn trên UI hiện bằng tiếng Anh):

| Kiểu | Trông thế nào |
|---|---|
| **Line** | Gạch chân mặc định của NocoBase, chỉ đổi màu |
| **Button group (pill)** | Nhóm nút bo tròn; tab đang mở tô đầy màu |
| **Segment (bordered)** | Hộp có viền, các tab ngăn nhau bằng vạch; tab mở tô đầy |
| **Card (folder)** | Tab dạng thẻ/cặp giấy, dính liền vào khung nội dung |
| **Step** | Số thứ tự trong vòng tròn + đường nối — như các bước |
| **Text (color only)** | Chỉ đổi màu chữ (+ in đậm), không gạch chân |

- **Lồng nhau không giới hạn:** Tabs trong Tabs, Mục trong Mục, hay Tabs trong một Mục gập… đều được. Trong mỗi tab/mục bỏ được mọi loại khối.
- **Màu "Nền"** (Background) chỉ đổi nền của **tab đang mở**; **màu "Khay"** (Tray) chỉ áp cho kiểu **Button** và **Step**; **"Di chuột"** (Hover) để trống thì dùng theo màu **Đang mở** (Active).
- **"Ẩn thanh tab khi chỉ có 1 tab"** chỉ ẩn khi **xem thật**; lúc đang chỉnh giao diện vẫn hiện để bạn còn thao tác.
- **Kiểu mặc định app-wide** lưu **theo theme**: sửa màu của theme không làm mất cấu hình. Muốn **giới hạn ai được đổi mặc định chung**: vào **Roles**, chặn quyền *create/update* trên collection `ptdlTabStyleSettings` với các vai trò khác (mặc định mọi tài khoản đã đăng nhập đều ghi được, nhưng chỉ người chỉnh giao diện mới thấy công tắc).
- Chạy được ở **cả hai** giao diện: classic `/admin` và modern `/v/`.

## Gỡ / tắt

- **Tắt plugin** trong **Plugin Manager**: hai khối **Tabs / Collapse** và mục **"Kiểu tab"** biến mất; thanh tab của trang trở lại **kiểu mặc định của NocoBase**.
- Bố cục đã dựng (các tab/mục và khối bên trong) **vẫn nằm trong cấu hình trang** — **bật lại plugin là hiện lại nguyên vẹn**. Giá trị **field trong form không bị ảnh hưởng**.
- Kiểu **mặc định app-wide** vẫn được giữ trong bảng `ptdlTabStyleSettings`; bật lại plugin là còn.

---

### Cho nhà phát triển

Khối, tab và mục gập lưu trong **cây flowModels** của trang (không có bảng riêng). Kiểu **mặc định toàn app** lưu server ở collection `ptdlTabStyleSettings` — mỗi theme một dòng (`settingKey`), client nạp vào cache lúc khởi động (có mirror `localStorage`). Mọi kiểu tab đều dựng bằng **CSS scoped trên antd line-tabs**, nên áp được cho cả tab lõi của trang/popup (vốn chỉ đổi được style chứ không đổi được "type"). Thêm/sửa **tầng server** (collection / ACL) cần **restart**; đổi phía **client** chỉ cần **hard-refresh**. Chi tiết kỹ thuật: xem `README.md` (tiếng Anh).
