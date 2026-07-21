# Chế độ bảng tính — Hướng dẫn sử dụng

> Lưới nhập liệu kiểu Excel (AG Grid) đặt lên **bất kỳ collection nào**: sửa ô bằng **chính field widget của NocoBase**,
> lưu theo dòng. Thêm được **cột công thức ảo**, **nhóm nhiều cấp có subtotal**, **hàng tổng hợp**, **định dạng có điều kiện**,
> **dán TSV** từ Excel/Sheets, **fill-down** và **sao chép** — tất cả cấu hình ngay trên khối, không cần code.

**Nhóm:** Khối (Blocks) · **Chạy trên:** /v/ (modern) + /admin (classic, trang chạy FlowEngine) · **Phiên bản:** 0.2.4

## Sau khi cài, có gì mới?

- **Một loại khối (block) mới** trong bộ chọn khối: **“Bảng tính”** (nằm trong nhóm **“Content” / Nội dung**, cạnh các khối lõi). Thêm vào trang như mọi block khác, trỏ vào một collection.
- **Không thêm menu, trang, hay field** nào; **không có trang Settings riêng.** Mọi thứ chỉnh **ngay trên khối** (bánh răng ⚙ của khối và ⚙ của từng cột).
- Sau khi thêm, collection hiện ra dạng **lưới Excel**: cuộn mượt (ảo hoá), kéo dãn/ghim cột, di chuyển bằng bàn phím, và **sửa ô bằng đúng widget gốc** của NocoBase (ô chọn, quan hệ, ngày giờ, tích…).
- **Thanh công cụ** phía trên lưới: ô **Tìm…**, nút **Thêm mới**; khi **bật UI Editor** có thêm **Công thức (ƒ)**, **Thao tác (⚡)** và **Ẩn** (danh sách cột đang ẩn).
- ⚠️ **Cột công thức cần plugin `@tuanla90/plugin-formula`** (engine ~400 hàm Excel). Chưa cài thì ô công thức hiện cảnh báo **“⚠ cần @tuanla90/plugin-formula”**.

## Cấu hình ở đâu?

Plugin **không có trang Settings**. Bạn chỉnh ở **3 chỗ ngay trên khối** — nhớ **bật UI Editor** (nút thiết kế giao diện) trước:

| Muốn chỉnh gì | Vào đâu |
|---|---|
| **Cả khối** (cột hiển thị, chiều cao, nhóm, thêm/xoá dòng, ngăn kéo dòng) | ⚙ (bánh răng) **của khối** → **“Bảng tính”** → **“Cấu hình bảng tính”** |
| **Từng cột** (định dạng, widget, tổng hợp, ghim, ẩn, chèn cột ƒ) | Di chuột lên **tiêu đề cột** → bấm **⚙ nhỏ** hiện ra ở mép phải tiêu đề |
| **Cột công thức · Thao tác dòng · Cột đang ẩn** | Các nút **Công thức (ƒ)**, **Thao tác (⚡)**, **Ẩn** trên **thanh công cụ** |

> 💡 Các nút nâng cao và ⚙ trên cột **chỉ hiện khi UI Editor đang bật**. Xem/nhập liệu bình thường thì không thấy — đúng như thiết kế.

## Dùng thế nào (từng bước)

### Tình huống A — Thêm lưới Bảng tính vào một trang

1. Mở trang cần đặt lưới → **bật UI Editor**.
2. Bấm **Add block** (thêm khối) → nhóm **“Content”** → chọn **“Bảng tính”**.
3. Chọn **collection** (bảng dữ liệu) muốn nhập.
4. Lưới hiện ngay. Bấm vào một ô để sửa: ô chữ/số sửa thẳng trong ô; ô **chọn / quan hệ / ngày giờ** bung **dropdown ngay dưới ô**; ô **tích (checkbox)** bấm là đổi luôn.
5. Sửa xong: dòng có **vạch cam bên trái** và thanh công cụ hiện **“● N chưa lưu”**. Thay đổi **tự lưu khi bạn rời sang dòng khác**, hoặc bấm **“Lưu”** để ghi tất cả một lượt. ✅ (Ô chọn/ngày/tích thì **lưu ngay** khi chọn.)

> Ánh xạ kiểu field → cách sửa trong lưới:
>
> | Kiểu field | Sửa trong ô thế nào |
> |---|---|
> | Chữ, số, email, phone, URL | Gõ thẳng trong ô (có thể gõ để bắt đầu sửa như Excel) |
> | Chọn một/nhiều, quan hệ n‑1, ngày/giờ | Bung danh sách/lịch **ngay dưới ô**, chọn là lưu |
> | Tích (checkbox / boolean) | Bấm ô vuông trên ô, đổi & lưu ngay |
> | Đính kèm, rich text/markdown, JSON, sub‑form/sub‑table, mật khẩu | **Không nhập trong lưới** — các field này bị ẩn khỏi bảng |

### Tình huống B — Chọn cột hiển thị, chiều cao, số thứ tự

1. Bật UI Editor → ⚙ **của khối** → **“Bảng tính”** → **“Cấu hình bảng tính”**.
2. Mục **Hiển thị**: ô **“Cột hiển thị”** — để trống = hiện mọi cột được hỗ trợ; hoặc chọn đúng các cột bạn cần. Đặt **“Chiều cao bảng”** (px) và bật/tắt **“Hiện số thứ tự dòng”**.
3. Mục **Mở bản ghi** → **“Ngăn kéo dòng”**: **“Form tự động”** (không cần cấu hình) hoặc **“Popup tuỳ biến”** (tự thiết kế bằng block).
4. Bấm **Lưu** hộp thoại. ✅

> 💡 Di chuột vào một dòng sẽ hiện nút **⤢** ở đầu dòng — bấm để **mở bản ghi** (ngăn kéo) đúng theo kiểu bạn chọn ở bước 3.

### Tình huống C — Thêm cột công thức (ƒ)

> Cần **`@tuanla90/plugin-formula`**. Cột công thức là **cột ảo tính lúc hiển thị** — không tạo field trong CSDL, không sort/filter phía server.

1. Bật UI Editor → trên thanh công cụ bấm **“Công thức”** (biểu tượng ƒ) → cửa sổ **“Cột công thức”**.
2. Bấm **“+ Thêm cột công thức”**, đặt **tên cột** (ô **“ƒ Cột”**) và nhập **công thức** kiểu Excel — **gõ thẳng tên field**, ví dụ `qty * price`, `CONCATENATE(name, " - ", status)`, `IF(total > 100, "VIP", "")`.
3. Có sẵn tab **Hàm / Trường / Mẫu** để bấm chèn nhanh, và **nút AI** gợi ý công thức từ mô tả tiếng Việt (mô tả điều muốn tính rồi bấm nút AI). Xem kết quả ở dòng **“Xem trước”**.
4. Bấm **“Áp dụng”**. ✅ Cột ƒ xuất hiện trong lưới.

> 💡 Cách khác: di chuột lên **tiêu đề một cột** → ⚙ → **“Chèn cột ƒ · bên trái”** / **“Chèn cột ƒ · bên phải”** để chèn cạnh cột đó. Sửa/xoá sau này qua ⚙ cột → **“Sửa công thức”** / **“Xoá cột ƒ”**.

### Tình huống D — Nhóm nhiều cấp + subtotal + hàng tổng hợp

1. **Bật tổng hợp cho cột số trước:** di chuột lên tiêu đề cột số → ⚙ → **“Định dạng cột…”** → mục **“Tổng hợp”**, chọn phép tính (xem bảng dưới). Làm cho từng cột bạn muốn cộng.
2. ⚙ **của khối** → **“Bảng tính”** → mục **Nhóm dòng** → **“Nhóm theo”**: chọn **1–3 field** (thứ tự chọn = **cấp 1 → cấp N**). Nhóm được theo field **chọn một / quan hệ n‑1 / chữ / tích**.
3. Chọn **“Kiểu hiển thị nhóm”**: **“Dòng nhóm (đóng/mở)”** (bấm để thu/mở từng nhóm) hoặc **“Gộp ô (kiểu Excel)”** (gộp ô cột nhóm, không có dòng header đóng/mở).
4. Cần thì tăng **“Giới hạn tải khi nhóm”** (tối đa 50.000 dòng — khi bật nhóm bảng tải toàn bộ dòng để tính đúng).
5. Bấm **Lưu**. ✅ Mỗi nhóm hiện **subtotal** ngay ở dòng tiêu đề nhóm; cuối bảng có **hàng tổng hợp** cho toàn bộ.

> Các phép **“Tổng hợp”** dùng được cho mỗi cột:
>
> | Nhóm phép | Lựa chọn |
> |---|---|
> | Số | **Tổng (Σ)**, **Trung bình**, **Trung vị**, **Nhỏ nhất**, **Lớn nhất**, **Khoảng (max−min)** |
> | Đếm | **Count (đã điền)**, **Empty (trống)**, **Unique (khác nhau)**, **Đã điền %** |
> | Tỉ lệ | **Tỉ lệ A÷B** (chọn cột tử/mẫu, có thể ×100 hiện %) |

### Tình huống E — Định dạng có điều kiện & widget trên ô

1. Di chuột lên tiêu đề cột → ⚙ → **“Định dạng cột…”**.
2. Chỉnh nhanh: **Căn lề** (Trái/Giữa/Phải), **Chữ đậm**, **Màu chữ**, **Nền**, **Màu tiêu đề**, **Độ rộng**, **Ghim**.
3. **Định dạng có điều kiện:** mục **“Format rules (khớp value/label)”** → thêm quy tắc: khi ô khớp một **giá trị/nhãn**, tô **màu chữ + nền** riêng.
4. **Widget hiển thị** (mục **“Hiển thị”**): biến ô số thành **★ Chấm sao** hoặc **▬ Thanh tiến độ** (tương tác thẳng trên ô: bấm sao / kéo thanh là lưu); cột ngày có **“Ngày tương đối”**, cột chọn có **“Nút chọn”**. Bấm biểu tượng cấu hình widget để chỉnh số sao, màu, %…
5. Đóng panel là áp ngay. ✅

### Tình huống F — Dán từ Excel, Fill-down, sao chép

- **Dán TSV:** copy một vùng ô từ Excel/Google Sheets → bấm vào ô bắt đầu trong lưới → **Ctrl/Cmd + V**. Dữ liệu điền lan từ ô đó; dán quá cuối bảng sẽ **tạo dòng mới**. Giới hạn **1.000 dòng/lần**.
- **Fill-down (điền xuống):** **bôi chọn ≥ 2 dòng** ở một cột rồi nhấn **Ctrl/Cmd + D** — giá trị dòng đầu điền xuống các dòng còn lại (chỉ cột sửa được & bạn có quyền).
- **Sao chép:** tick chọn các dòng → **Ctrl/Cmd + C**, hoặc bấm nút **“Sao chép (N)”** trên thanh công cụ.

### Tình huống G — Thêm & xoá dòng

1. ⚙ **của khối** → **“Bảng tính”** → mục **Thêm & xoá dòng**: bật **“Cho phép thêm dòng”** / **“Cho phép xoá dòng”**.
2. **“Hiện nút Thêm mới ở”**: **“Nút trên toolbar”** (giống lõi), **“Dòng ＋ ở cuối bảng”** (kiểu Airtable — gõ vào dòng cuối để thêm), hoặc **“Cả hai”**.
3. **“Thêm dòng (nút ＋ của nhóm)”**: **“Tạo + mở form”**, **“Tạo nhanh, không mở form”**, hoặc **“Mở link tuỳ biến”** (điền **“Link thêm dòng”**, `{field}` được thay bằng giá trị nhóm).
4. **Xoá:** tick chọn các dòng → bấm nút **xoá (🗑 N)** đỏ trên thanh công cụ, xác nhận. ✅

## Mẹo & lưu ý

- **Lưu theo dòng, an toàn dữ liệu.** Sửa nhiều ô trong một dòng chỉ ghi **một lần** khi bạn rời dòng hoặc bấm **Lưu**. Nếu người khác vừa sửa cùng dòng, bảng **tự tải bản mới và giữ thay đổi của bạn**, kèm nhắc bấm **Save để ghi đè** — không âm thầm mất dữ liệu.
- ⚠️ **Cột công thức cần `@tuanla90/plugin-formula`.** Không có plugin đó, ô ƒ hiện **“⚠ cần @tuanla90/plugin-formula”**. Cột ƒ là **ảo** (tính khi hiển thị) nên **không** sort/lọc được ở server.
- **Quyền hạn được tôn trọng.** Thêm/sửa/xoá/dán/fill-down đều theo quyền (ACL) của vai trò hiện tại; thao tác không có quyền sẽ bị bỏ qua và báo lại.
- **Nhóm = tải nhiều dòng.** Khi bật **Nhóm theo**, bảng tải toàn bộ dòng (tới **Giới hạn tải khi nhóm**, tối đa 50.000) để subtotal chính xác — với bảng rất lớn hãy đặt giới hạn hợp lý.
- **Field không hỗ trợ** (đính kèm, rich text/markdown, JSON, sub‑form/sub‑table, mật khẩu…) tự **ẩn khỏi lưới** — muốn sửa chúng, mở **bản ghi** bằng nút **⤢**.
- **Xuất CSV** đã có trong lõi nhưng **nút “Xuất” đang tạm ẩn ở bản này**; muốn dùng cần bật lại trong mã (`showExport`). Trước mắt hãy **sao chép/dán** để đưa dữ liệu ra ngoài.
- Chạy trên **/v/ (modern)** và các **trang chạy FlowEngine ở /admin**; **trang /admin kiểu uiSchema cũ không hiển thị** khối này (đúng thiết kế).

## Gỡ / tắt

- **Bỏ lưới khỏi một trang:** bật UI Editor → ⚙ của khối → **xoá khối**. Dữ liệu trong collection **không bị ảnh hưởng** (khối chỉ là cách hiển thị).
- **Gỡ hẳn plugin:** tắt trong **Plugin Manager**. Các khối “Bảng tính” đã đặt sẽ ngừng hiển thị, nhưng **dữ liệu collection vẫn nguyên vẹn**. Cấu hình cột/nhóm/công thức lưu theo khối nên sẽ mất khi xoá khối; bật lại plugin thì các khối còn lại hoạt động trở lại.
- Cột công thức, định dạng, tổng hợp… **không tạo cột trong CSDL** nên gỡ đi không để lại “rác” dữ liệu.

---

### Cho nhà phát triển

Khối `PtdlSpreadsheetBlockModel` (kế thừa `CollectionBlockModel`) đăng ký ở **cả hai lane** (`src/client`, `src/client-v2`) qua `registerSpreadsheet`. Khung lưới = **AG Grid Community 36**; ruột ô **tái dùng `EditableItemModel` / `FieldModelRenderer`** của NocoBase nên field đã gắn widget @tuanla90 tự hiện đúng. Ghi hàng loạt (dán/fill-down/Lưu) đi qua action server **`<collection>:bulkSync`** (`src/server/plugin.ts`) chạy trong **một transaction**, có **kiểm soát xung đột** bằng `expectUpdatedAt` (409 → tải lại + giữ dirty). i18n theo chuẩn @tuanla90 (**tiếng Việt = key**, chỉ đăng ký `en-US`); công thức dùng engine `globalThis.__ptdlFormula` từ `@tuanla90/plugin-formula`, widget ô từ `globalThis.__ptdlFieldEnh`. Chi tiết thiết kế/giới hạn: `docs/BRD-spreadsheet-view.md`, `docs/MVP-spreadsheet-view.md`, `docs/SPREADSHEET-VIEW-RETRO.md`.
