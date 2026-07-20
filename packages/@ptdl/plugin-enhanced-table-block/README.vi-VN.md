# Khối Bảng nâng cao — Hướng dẫn sử dụng

> Bảng dữ liệu "xịn" hơn bảng thường: thêm **dòng tổng hợp** (tổng / trung bình / đếm… cho từng cột),
> **xem nhanh thống kê khi kéo chọn nhiều ô**, và **chế độ thẻ** tự xếp lại từng dòng cho gọn trên màn hình hẹp —
> cấu hình ngay trên khối, **không cần code, không cần restart máy chủ**.

**Nhóm:** Khối (Blocks) · **Chạy trên:** /admin (classic) + /v/ (modern) · **Phiên bản:** 2.1.0-beta.17

## Sau khi cài, có gì mới?

- **Một loại khối mới** trong bảng chọn **“Thêm khối” (Add block)**: **Bảng nâng cao (Enhanced Table)** — trên **/v/** nằm ở nhóm **Nội dung (Content)** (có ô tìm kiếm, gõ “Bảng nâng cao”).
- **Trong menu ⚙ (bánh răng) của khối** có thêm:
  - **Cài đặt bảng nâng cao (Enhanced table settings)** — nơi bật **dòng tổng hợp** và **trang trí** nó (trên /v/).
  - **Responsive (thẻ trên mobile)** — bật chế độ thẻ cho màn hẹp (trên /v/).
  - Trên /admin: mục **Cài đặt dòng tổng hợp (Summary row settings)** trong menu cài đặt của khối bảng.
- **Hành vi mới ngay khi dùng:** **kéo chọn nhiều ô số** trong bảng → hiện ngay ô thống kê (tổng, lớn nhất, nhỏ nhất, trung bình) cạnh con trỏ.
- **Không** thêm trang Settings, **không** thêm menu, **không** đụng dữ liệu hay máy chủ — tất cả nằm trên khối bảng.

## Cấu hình ở đâu?

Không có trang Settings riêng — mọi thứ chỉnh **ngay trên khối bảng**, trong menu **⚙** khi bật **UI Editor**.

| Việc muốn làm | Trên **/v/** (modern) | Trên **/admin** (classic) |
|---|---|---|
| Thêm khối | Thêm khối → **Nội dung** → **Bảng nâng cao** | Thêm khối → **Bảng nâng cao (Enhanced Table)** |
| Bật dòng tổng hợp | ⚙ khối → **Cài đặt bảng nâng cao** → thẻ **Cài đặt dòng tổng hợp** | ⚙ khối → **Cài đặt dòng tổng hợp** |
| Trang trí / đổi vị trí dòng tổng | ⚙ khối → **Cài đặt bảng nâng cao** → thẻ **Kiểu dòng tổng hợp** | *(chưa có ở classic)* |
| Chế độ thẻ cho màn hẹp | ⚙ khối → **Responsive (thẻ trên mobile)** | *(chưa có ở classic)* |
| Kéo chọn ô xem thống kê | Tự động | Tự động |

> ℹ️ **Đầy đủ tính năng nhất là trên /v/ (modern).** Bản /admin (classic) hỗ trợ **dòng tổng cơ bản** và **kéo chọn ô**; các tuỳ chọn nâng cao (kiểu/vị trí, Đếm phân biệt, Nhãn tùy chỉnh, chế độ thẻ) có ở **/v/**.

## Dùng thế nào (từng bước)

### Tình huống A — Thêm bảng và bật dòng tổng hợp (/v/)

1. Vào trang cần đặt bảng, bật **UI Editor**.
2. Bấm **Thêm khối** → nhóm **Nội dung** → **Bảng nâng cao**; chọn **nguồn dữ liệu** & **bộ sưu tập (collection)** như bảng thường.
3. Thêm các **cột** cần hiển thị — nhất là **cột số** bạn muốn tính tổng (chỉ cột đã có trong bảng mới hiện ra để chọn ở bước sau).
4. Mở **⚙** của khối → **Cài đặt bảng nâng cao** → thẻ **Cài đặt dòng tổng hợp**.
5. Với mỗi cột, chọn một **kiểu tổng hợp** ở ô **“Chọn kiểu tổng hợp”**:

   | Nhãn | Ý nghĩa | Áp dụng cho |
   |---|---|---|
   | **Tổng** *(Sum)* | Cộng tất cả giá trị | Cột số |
   | **Trung bình** *(Average)* | Giá trị trung bình | Cột số |
   | **Đếm** *(Count)* | Đếm số ô có dữ liệu | Mọi cột |
   | **Đếm phân biệt** *(Count distinct)* | Đếm số giá trị khác nhau | Mọi cột · *chỉ /v/* |
   | **Nhỏ nhất** *(Min)* | Giá trị nhỏ nhất | Cột số |
   | **Lớn nhất** *(Max)* | Giá trị lớn nhất | Cột số |

6. *(Tuỳ chọn)* Gõ **Nhãn tùy chỉnh** cho từng cột để thay tên mặc định (vd “Doanh thu”). *(chỉ /v/)*
7. Bấm **Lưu**. ✅ Một **dòng tổng hợp** hiện ở đáy bảng, tính trên **toàn bộ dữ liệu** (mọi trang, không chỉ trang đang xem) và tự canh theo đúng **định dạng số** của cột (dấu phân cách, số lẻ, ký hiệu tiền, %).

> 💡 Muốn **bỏ tổng** một cột: mở lại hộp thoại, **xoá** lựa chọn ở ô “Chọn kiểu tổng hợp” của cột đó rồi **Lưu**. Dòng tổng chỉ hiện khi có **ít nhất một cột** được chọn.

### Tình huống B — Đổi vị trí & trang trí dòng tổng (/v/)

1. ⚙ khối → **Cài đặt bảng nâng cao** → thẻ **Kiểu dòng tổng hợp**.
2. Chọn **Vị trí dòng tổng hợp**:
   - **Dưới cùng (mặc định)** — dòng tổng nằm ở đáy bảng.
   - **Trên, dính dưới tiêu đề** — dòng tổng luôn nhìn thấy (dính ngay dưới hàng tiêu đề) khi cuộn bảng dài.
3. Chỉnh thêm nếu muốn: **Hiện nhãn** (bật/tắt tên kiểu tổng), **Màu chữ giá trị** (mặc định `#1890ff`), **Màu chữ nhãn** (`#8c8c8c`), **Màu nền** (`#fafafa`), **Độ đậm chữ giá trị** (**Đậm** / **Thường**), **Cỡ chữ giá trị (px)** (mặc định `14`).
4. Bấm **Lưu**.

### Tình huống C — Xem nhanh thống kê khi kéo chọn ô (cả 2 giao diện)

1. Ở chế độ xem bình thường (**không cần bật gì**), **giữ chuột trái và kéo** qua nhiều ô của cột số.
2. Các ô được chọn tô **vàng nhạt**; một ô thống kê hiện cạnh con trỏ với **Tổng / Lớn nhất / Nhỏ nhất / Trung bình** và số ô đã chọn.
3. Chỉ hiện khi chọn **từ 2 ô trở lên**, và chỉ tính các ô ở **cột số**.

> 💡 Nếu bảng có ô **tích chọn dòng** (checkbox): khi bạn **tích vài dòng**, dòng tổng hợp sẽ tính riêng cho **các dòng đã tích**, kèm dòng nhỏ **“Tất cả: …”** cho tổng toàn bộ.

### Tình huống D — Bật chế độ thẻ cho màn hình hẹp (/v/)

1. ⚙ khối → **Responsive (thẻ trên mobile)**.
2. Bật **“Hiển thị dạng thẻ khi màn hình hẹp”**.
3. Đặt **“Chuyển sang thẻ khi rộng dưới”** — ngưỡng bề rộng (px), mặc định **640**. Khi khung chứa bảng **hẹp hơn** ngưỡng này, bảng tự chuyển thành danh sách **thẻ** (mỗi dòng = một thẻ: cột đầu làm tiêu đề, các cột còn lại xếp dọc, các nút thao tác ở cuối thẻ).
4. Bấm **Lưu**. Trên màn rộng vẫn hiển thị **bảng đầy đủ** như thường.

> 💡 Ngưỡng đo theo **bề rộng khung chứa khối**, không phải bề rộng cửa sổ — nên thẻ cũng tự bật khi bạn đặt bảng trong **cột hẹp / bố cục chia đôi**, không riêng điện thoại.

## Mẹo & lưu ý

- **Tổng tính trên toàn bộ dữ liệu**, không chỉ trang đang xem — plugin tự tải hết các trang để cộng cho đúng.
- **Cột phải có mặt trong bảng** thì mới xuất hiện trong danh sách chọn ở hộp cài đặt dòng tổng — hãy **thêm cột trước**, rồi mới bật tổng.
- **Đếm / Đếm phân biệt** dùng được cho **mọi loại cột**; còn **Tổng / Trung bình / Nhỏ nhất / Lớn nhất** chỉ dành cho **cột số**.
- **Định dạng số tự khớp cột:** dòng tổng bắt chước cách cột hiển thị (dấu phẩy/chấm ngăn cách, số lẻ, ký hiệu tiền tệ, %).
- **Khác nhau giữa hai giao diện:** bản **/v/** (modern) có đủ **trang trí + vị trí trên/dưới + Đếm phân biệt + Nhãn tùy chỉnh + chế độ thẻ**; bản **/admin** (classic) hiện chỉ có **dòng tổng cơ bản** (Tổng / Trung bình / Đếm / Nhỏ nhất / Lớn nhất) và **kéo chọn ô**.
- ⚠️ Trên **/admin** (classic), một số **nhãn có thể hiển thị bằng tiếng Anh** (gói tiếng Việt của khối này áp dụng cho **/v/**) — ý nghĩa vẫn như bảng đối chiếu ở trên.
- **Không cần restart máy chủ:** đây là plugin phía giao diện; cấu hình được lưu ngay trong khối/trang.

## Gỡ / tắt

- **Tắt tổng hợp cho một khối:** mở **⚙** → **Cài đặt bảng nâng cao** (classic: **Cài đặt dòng tổng hợp**) → **xoá hết** lựa chọn kiểu tổng → **Lưu**. Tắt chế độ thẻ: mở **Responsive (thẻ trên mobile)** → **tắt công tắc**.
- **Gỡ hẳn plugin** trong **Plugin Manager**: các khối “Bảng nâng cao” đã tạo sẽ **mất phần nâng cao** (dòng tổng, kéo-chọn, thẻ) và **có thể không hiển thị đúng** vì kiểu khối không còn được đăng ký. Nên **đổi các khối đó về bảng thường trước khi gỡ**, hoặc **bật lại plugin** để chúng hoạt động lại.
- Cấu hình đã lưu nằm trong **lược đồ trang** (không tạo bảng dữ liệu riêng), nên gỡ plugin **không** để lại dữ liệu thừa trong cơ sở dữ liệu.

---

### Cho nhà phát triển

Khối kế thừa `TableBlockModel` qua `defineEnhancedTableBlockModel()` (dùng chung cho cả hai lane; file lõi **không** import `@nocobase/client` để bundle `/v/` sạch — lane /v/ dùng `@nocobase/client-v2`, lane /admin tiêm hook qua `setEnhancedTableDeps`). Dòng tổng được tính **phía client**: tải toàn bộ dữ liệu (`paginate:false`) rồi định dạng số theo mẫu ô thật của cột; chế độ thẻ **portal** danh sách thẻ vào `.ant-spin-container` ngay trước phân trang, tái dùng `model.getColumns()` render (giữ conditional-format, widget field, tiêu đề quan hệ). Cấu hình: /v/ lưu trong **props của model** (`summaryConfig` / `summaryStyle` / `responsiveCard` / `responsiveBreakpoint`) qua tham số các bước flow; /admin lưu trong `x-decorator-props.summaryConfig`. Các tuỳ chọn **kiểu/vị trí, Đếm phân biệt, Nhãn tùy chỉnh, chế độ thẻ** chỉ có ở lane **/v/**. Chi tiết build/kiến trúc: xem `README.md` (tiếng Anh).
