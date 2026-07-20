# Mẫu in ấn — Hướng dẫn sử dụng

> Thiết kế mẫu **hoá đơn / phiếu / báo cáo** bằng trình **kéo-thả** (hoặc HTML), rồi **in 1 bản ghi ra PDF**
> ngay từ nút trên bảng/trang chi tiết — kèm **in hàng loạt**, **lưu PDF vào field**, QR, watermark,
> header/footer, tổng hợp bằng công thức & SQL… mà **không cần code**.

**Nhóm:** Actions (Hành động) · **Chạy trên:** /admin (classic) + /v/ (modern) · **Phiên bản:** 0.1.4

## Sau khi cài, có gì mới?

- **Trang cấu hình mới:** vào **⚙ Settings → “Mẫu in ấn”**, gồm 2 tab: **Danh sách mẫu** và **Dịch vụ PDF**.
- **3 nút hành động mới** để gắn vào block (qua **“Configure actions”**):

  | Nút (trong Configure actions) | Đặt ở đâu | Làm gì |
  |---|---|---|
  | **Mẫu in** | Dòng bảng / trang chi tiết 1 bản ghi | Mở hộp thoại **“In / xuất PDF”**: chọn mẫu → xem trước → **In / PDF** hoặc **Lưu vào field** |
  | **Lưu PDF vào field** | Dòng bảng / trang chi tiết 1 bản ghi | Bấm 1 phát: render mẫu rồi **đính PDF thẳng vào field** (không hỏi gì) |
  | **In hàng loạt** | Thanh công cụ của **Bảng** | In các dòng **đã chọn** (không chọn = cả trang hiện tại) |

- **1 khối (block) mới:** **“Xem trước bản in”** — thả vào popup/trang chi tiết của 1 bản ghi để hiện luôn bản in
  ngay trong trang (có nút In / Lưu nổi ở góc).

## Cấu hình ở đâu?

- **Quản lý mẫu in:** **/v/ → ⚙ Settings → “Mẫu in ấn” → tab “Danh sách mẫu”**
  (classic: `/admin/settings/print-template`). Đây là nơi **tạo / sửa / nhân bản / xoá** mẫu.
- **Dịch vụ PDF (tuỳ chọn):** cùng trang, **tab “Dịch vụ PDF”** — bật để xuất PDF **vector** (chữ thật, copy được).
- **Cấu hình từng nút In:** chọn nút trên block → mở **⚙** của nút → chọn **mẫu** (hoặc để trống / “Tự động”).

## Dùng thế nào (từng bước)

### Bước 1 — Tạo mẫu in
1. Vào **⚙ Settings → “Mẫu in ấn” → Danh sách mẫu** → bấm **+ Template mới**.
2. Tab **Chung**: điền **Tên template**, chọn **Collection nguồn dữ liệu**. Nếu bản in có bảng dòng con /
   thông tin quan hệ, chọn thêm ở **Tải kèm quan hệ (appends)** (VD `items` → `items.product`).
3. Tab **Nội dung**: thiết kế thân bản in bằng **Kéo-thả** hoặc **Mã HTML**.
   - Kéo-thả: kéo các khối trong nhóm **“Template in”** ở panel phải: *Trường dữ liệu, Bảng, Bảng dòng con,
     Số liệu tổng, Khu chữ ký, Ngày in, Số tiền bằng chữ, Mã QR, Ngắt trang*.
   - Mã HTML: bấm **＋ Chọn cột** để chèn `{{trường}}`, **ƒ Hàm** để tra & chèn công thức, hoặc **AI viết hộ**.
4. (Tuỳ chọn) tab **Header / Footer** (logo, địa chỉ, chữ ký lặp mỗi trang), **Watermark**, **Trang in** (khổ A4/A5…, dọc/ngang, lề).
5. Bên phải là **xem trước trực tiếp** với một bản ghi thật — đổi bản ghi ở **“Xem thử với:”**, hoặc bấm **In thử**.
6. Bấm **Lưu**.

### Bước 2 — Gắn nút In vào chỗ người dùng bấm
1. Mở trang có **Bảng** hoặc **trang chi tiết** của collection đó → bật **UI Editor**.
2. Bấm **Configure actions** → chọn **“Mẫu in”** (nút in cho 1 bản ghi) hoặc **“In hàng loạt”** (nút trên thanh công cụ bảng).
3. Mở **⚙** của nút vừa thêm → chọn **Template**:
   - Chọn 1 mẫu cố định, **để trống** (cho người dùng chọn khi bấm), hoặc **🔀 Tự động theo dữ liệu**.
4. Bấm nút **In** → hộp thoại hiện bản xem trước → **In / PDF** để mở cửa sổ in và **Save as PDF**. ✅

### Tình huống — Lưu hoá đơn PDF vào hồ sơ (1 chạm)
1. Thêm nút **“Lưu PDF vào field”** vào dòng/trang chi tiết.
2. Mở **⚙** của nút → chọn **Field đính kèm (bắt buộc)** (một field kiểu *đính kèm/attachment*) và **Template**.
3. Bấm nút → PDF được tạo và **đính thẳng vào field** đó của bản ghi. Hợp với luồng “chốt đơn → lưu hoá đơn”.

### Tình huống — In hàng loạt
1. Ở bảng, tích chọn vài dòng (bỏ trống = in cả trang hiện tại) → bấm **In hàng loạt**.
2. Trong **⚙** của nút chọn **Kiểu xuất**:
   - **Gộp 1 file** — mở cửa sổ in (mỗi bản ghi 1 trang).
   - **Tách nhiều file** — tải về **ZIP** (mỗi bản ghi 1 PDF).
   - **Tách — lưu PDF vào field** từng bản ghi (cần chọn **Field đính kèm**).

## Mẹo & lưu ý

- 🖨 **Nút “In / PDF” thủ công luôn ra PDF vector** (chữ thật) qua cửa sổ in của trình duyệt — không cần cài gì thêm.
- ⚙ **Vector cho “Lưu vào field” & “In hàng loạt”:** cần bật **Dịch vụ PDF** (Gotenberg) ở tab Dịch vụ PDF.
  Tắt = client tự chụp thành **ảnh raster** (nặng hơn, không copy chữ được). Gợi ý deploy: image `gotenberg/gotenberg:8`,
  nên đặt **URL nội bộ** (private network). Có nút **Test kết nối**.
- 🔤 **Công thức Handlebars** hay dùng: `{{formatNumber total format="#,##0₫"}}`, `{{formatDate date "DD/MM/YYYY"}}`,
  `{{docsoHoa total}}` (số thành chữ), `{{qr code size=110}}`, `{{#each items}}…{{/each}}`, và cả **SQL** `{{#sql "SELECT … FROM ?" items}}`.
  Bảng tra đầy đủ nằm ở nút **ƒ Hàm** trong trình soạn.
- ♻️ **Khối chung (partial):** một mẫu có thể đặt là **“Dùng làm khối chung”** + đặt **slug** → nhúng vào mẫu khác bằng
  `{{> slug}}`. Sửa 1 nơi, mọi mẫu nhúng đều cập nhật. Khối chung **không** hiện trong danh sách chọn khi in.
- 🔀 **Tự động theo dữ liệu:** đặt **Điều kiện áp dụng** trong tab Chung (VD `status ∈ [paid]`); khi nút để chế độ
  *Tự động*, hệ thống chọn mẫu đầu tiên khớp bản ghi. Mẫu **không có điều kiện** = mặc định.
- ⚠️ Khối **“Xem trước bản in”** và nút **“Mẫu in”** cần **ngữ cảnh 1 bản ghi** — đặt trong popup/trang chi tiết
  mở từ một dòng dữ liệu; trang trống hoặc form tạo mới sẽ không có gì để xem trước.
- ✅ Chạy trên **cả hai** giao diện: classic `/admin` và modern `/v/`.

## Gỡ / tắt

- Tắt plugin trong **Plugin Manager**. Các nút In / khối Xem trước sẽ biến mất khỏi block.
- **Mẫu đã thiết kế vẫn còn** trong CSDL (bảng ẩn `ptdl_print_templates`) — bật lại plugin là dùng tiếp.
- PDF đã lưu vào field là file đính kèm bình thường, **không bị ảnh hưởng** khi tắt plugin.

---

### Cho nhà phát triển

- Server tạo 2 collection ẩn: `ptdl_print_templates` (mẫu) và `ptdl_pdf_settings` (cấu hình dịch vụ, mật khẩu chỉ lưu server, không trả về client).
  Render HTML→PDF vector qua proxy `ptdlPdf:render` tới Gotenberg; “AI viết hộ” qua `ptdlPrintAi:generate`.
- Client đăng ký 3 action model (`PrintTemplateActionModel`, `SavePdfToFieldActionModel`, `BatchPrintActionModel`) + 1 block
  (`PrintPreviewBlockModel`) cho cả 2 lane; UI dùng chung ở `src/shared/*`, trình kéo-thả là GrapesJS (`GrapesBodyEditor`),
  công thức Handlebars ở `helpers.ts` / `HelperDocs.tsx`. Doc kỹ thuật đầy đủ: `README.md` (tiếng Anh).
