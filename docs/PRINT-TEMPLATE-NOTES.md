# PRINT-TEMPLATE-NOTES — kinh nghiệm & kiến trúc @tuanla90/plugin-print-template

> Ghi ngày 2026-07-13. Bổ sung cho docs/PLAN.md §2.1. Mục đích: sau này khỏi khảo sát lại,
> và làm nền cho plugin-email-template (tái dùng lõi editor). Xem thêm memory
> `ptdl-plugin-print-template`.

## 1. Kiến trúc 3 lane + @tuanla90/shared

- Plugin 3 lane: `src/client` (classic /admin), `src/client-v2` (/v/ FlowEngine), `src/server`,
  `src/shared` (UI + logic dùng chung 2 lane). Marker root `client.js`/`client-v2.js`/`server.js`
  là **trigger build lane** — thiếu marker ở package staged = lane đó không build.
- `@tuanla90/shared` là workspace package **bundle vào dist/node_modules** của plugin. Xuất:
  `escapeHtml`, `formatDate` (subpath `@tuanla90/shared/format` — thuần, KHÔNG @formily),
  `FieldPickerCascader`, `getCaretElement`, `insertAtCaret`, `ColorField`, `COLOR_PRESETS`,
  `setIconRegistry`.
- **Bẫy @formily/react khi build**: `@tuanla90/shared/dist/index` kéo `@formily/react` → rspack
  báo "Can't resolve". Cách chữa: (a) import util thuần từ subpath `@tuanla90/shared/format`;
  (b) thêm `import '@formily/react'` vào CẢ 2 client entry để ép externalize (NocoBase cấp
  @formily lúc runtime; nó nằm trong danh sách external cứng của nocobase-build).

## 2. NocoBase custom action — bọc data 2 lớp

`resourceManager.define({ name, actions })`, action set `ctx.body`. Response API bọc thành
`{ data: ctx.body }` → **client phải đọc `res.data.data`** (không phải `res.data`). Lỗi này
làm form config PDF service hiện rỗng + `pdfServiceEnabled` luôn false. Nếu action trả FILE
(PDF), set `ctx.withoutDataWrapping = true` + tự set Content-Type/Content-Disposition, body = Buffer.

## 3. Bảo mật cấu hình dịch vụ PDF (Gotenberg)

- URL/username/password lưu **server-side** (collection `ptdl_pdf_settings`, 1 row). **Password
  KHÔNG BAO GIỜ trả về client**: `getConfig` chỉ trả `hasPassword: boolean`; `setConfig` chỉ ghi
  đè password khi client gửi giá trị mới (write-only), gửi `null` = xoá.
- ACL: `render`/`status` = `loggedIn` (để user thường in cũng có PDF vector); `getConfig`/`setConfig`
  qua snippet `pm.print-template` (admin). **Tên snippet KHÔNG được chứa `/`.**
- Cấu hình qua **UI (Settings → PDF service)**, KHÔNG hardcode env — để nhiều dự án NocoBase cắm
  chung 1 service. Basic Auth phải mạnh (URL Railway public).
- ⚠️ Đừng test bằng curl `setConfig` với password bừa — sẽ **ghi đè mất** password thật của user.

## 4. In HTML → PDF: chọn flavour "table", bỏ Paged.js

- **Flavour table (đang dùng)**: `<table><thead>/<tfoot>` lặp header/footer mỗi trang; `@page
  { margin: 0 }` lúc in để **chặn header/footer ngày-giờ/URL của trình duyệt** (user tưởng plugin
  thêm); lề dọc mô phỏng bằng padding cell thead/tfoot, lề ngang bằng padding sheet. Footer ghim
  đáy nhờ table `height = chiều cao khổ giấy` (min-height, nội dung dài vẫn tràn nhiều trang).
- **Paged.js (đã BỎ)**: render số trang "Trang X/Y" thật nhưng bố cục **khác hẳn** preview (header
  vào margin box, A4 width cố định tràn iframe hẹp) → không chuẩn hoá được 2 bên → user chốt bỏ
  hẳn tính năng số trang. `buildPagedDocument` giữ làm dead code (`void buildPagedDocument`).
- **PDF vector vs raster**: service Gotenberg (vector, đẹp) nếu bật, else fallback `html2pdf.js`
  (html2canvas+jsPDF — raster, chữ thành ảnh, file to). `renderPdfBlobSmart` tự chọn.

## 5. Watermark — bài học định vị (session 2026-07-13)

- **Lỗi cũ**: dùng flexbox (`align-items`/`justify-content`) + ảnh `width:60%`. Ảnh % co theo
  flex item shrink-to-fit → kích thước mơ hồ, bị kéo về giữa; "Cạnh phải" vẫn trông giữa,
  "Căn giữa" lại lệch trái (browser-dependent).
- **Cách đúng (hiện tại)**: **neo tuyệt đối theo lưới 9 ô** trong lớp `.__pt-watermark`
  (`position:absolute/fixed; inset:0; padding:12mm`):
  - Ngang: trái `left:0` / giữa `left:50%`+`translateX(-50%)` / phải `right:0`.
  - Dọc: trên `top:0` / giữa `top:50%`+`translateY(-50%)` / dưới `bottom:0`.
  - Wrapper ảnh đặt `width:{imageWidth}%` theo **khổ trang** (box thật), ảnh bên trong `width:100%`.
  - Nudge X/Y + `rotate(angle)` gộp trong `transform`, `transform-origin:center`.
- Preview embedded: watermark `position:absolute` neo vào `.__pt-sheet` (position:relative) để
  cuộn cùng nội dung; khi in đổi `position:fixed` để lặp mọi trang. `behind` = z-index 0 + sheet
  trong suốt (giấy trắng lấy từ page bg).

## 6. GrapesJS (lõi editor kéo-thả) — nhiều cạm bẫy

- Nạp UMD lazy bằng `loadScriptClean` (ẩn `window.define` để requirejs không nuốt). Assets
  (grapes.min.js/css + preset-webpage + blocks-basic) **repack vào tgz** bởi recipe (không bundle).
- **Custom StyleManager type KHÔNG tự render label** → phải tự render label trong component; và
  `emit`/`updateStyle` không tin cậy → gọi thẳng `sel.addStyle({ [cssProp]: v })`.
- Trait/SM color = `ColorField` render qua `ReactDOM.render`. Sector `pt-deco` tách border thành
  width/style/color (color full:true).
- Toolbar item bị GrapesJS ép cỡ icon → nút chữ phải CSS scoped `.gjs-toolbar-item:has(.pt-tbtn){width:auto}`.
  Đừng set `width:100%` cho `.gjs-pn-btn` (giấu mất panel options undo/redo) — dùng natural size + margin.
- **Row bảng lặp**: literal `{{#each}}` giữa `<tr>` bị DOM parser phá (foster parenting). Giải pháp:
  đánh dấu row bằng `data-pt-each="relation"`, `expandEachAttrs()` biến thành `{{#each}}` NGAY
  TRƯỚC khi compile Handlebars.

## 7. Helper Handlebars

`createRenderer()` + helper: formatNumber/formatDate (từ `@tuanla90/shared/format`)/`sql` (alasql lazy)/
`docso` (đọc số vi-VN)/`qr` (qrcode-generator)/math/string/array. Partial: `hb.registerPartial(slug,
body)` cho template `isPartial`. `templateUsesSql()` → lazy-load alasql chỉ khi template dùng `{{sql}}`.

## 8. Template động nhiều điều kiện (session 2026-07-13)

- `types.ts`: `conditions: TemplateCondition[]` (`{ field, values }`), `field` là **dot-path**
  (VD `khach_hang.loai`), đọc bằng `getByPath()`. `templateConditions()` gộp cả legacy
  `whenField/whenValues`. `pickTemplateForRecord()`: chọn template đầu tiên khớp **TẤT CẢ** điều
  kiện (VÀ giữa các dòng, HOẶC trong values 1 dòng); template không điều kiện = mặc định.
- UI `ConditionPicker`: nhiều dòng, mỗi dòng `FieldPickerCascader` (chọn cột nhiều cấp) + tags
  gợi ý enum + nút xoá; nút "＋ Thêm điều kiện". Server: cột `{ type:'json', name:'conditions' }`.
- Đổi schema collection → `ensureTables` chạy `.sync({ alter:true })` ở `afterStart`/`afterUpgrade`
  tự thêm cột.

## 9. Editor UX (session 2026-07-13)

- Tab Chung/Watermark/Trang in **bỏ cap `maxWidth:720`** (bị hẹp trong panel rộng). Tab Chung =
  grid 2 cột `repeat(auto-fit, minmax(300px, 1fr))`, khối điều kiện/partial `gridColumn:'1/-1'`.
- **Live preview chọn record**: `fetchSampleRecords` (50 bản ghi mới nhất, có appends) → Select
  ở header panel (`recordLabel` lấy title/name/code…), đổi record preview cập nhật ngay. Nút
  **"In thử"** gọi `printData(api, t, sample)` — in đúng data đang xem, tôn trọng chỉnh sửa CHƯA lưu.
- Nút tải ảnh: icon lucide `image-up` (bỏ emoji 📁); prop `size` để khớp chiều cao Input trong
  `Space.Compact` (dùng `size="middle"`).
- Drawer editor: `keyboard={false}`, `maskClosable={false}`, Escape/click-ngoài → `Modal.confirm`
  nếu `dirty` (chống mất chỉnh sửa).

## 10. Build & deploy (recipe run-print-template-build.sh)

- Stage src + 6 marker + `package.json` vào build-env; giữ REAL `handlebars`/`qrcode-generator`/
  `jszip`; `mkstub` các external framework (react/antd/@nocobase/*) ở version 2.1.19; restore
  `@tuanla90/shared` từ packages/ (npm prune mỗi lần install); `nocobase-build --tar --no-dts`.
- Repack vào tgz: alasql/pagedjs/html2pdf/jszip + grapes (grapes.min.js/css, preset-webpage,
  blocks-basic). `tar --force-local` (Windows path có `:`), **KHÔNG `--strip-components`**.
- Deploy nb-local: giải nén tgz vào CẢ `node_modules/@tuanla90/...` VÀ `storage/plugins/@tuanla90/...`
  (`rm -rf` trước), rồi `pm2 restart index --update-env`. **pm2 phải khởi bằng `yarn start -d`**
  (daemon) — `yarn start` thường = foreground, chết theo shell. Verify bằng grep string literal
  MỚI trong `dist/*/index.js` (comment bị minify, tên hàm bị mangle — grep literal user-facing).
- **PWA cache**: service worker cache JS plugin → phải Unregister SW + Clear site data mới thấy
  bản mới (Ctrl+F5 không đủ).

## 11. Tái sử dụng cho email (xem PLAN §2.3)

Tách `GrapesEditorCore` vào `@tuanla90/shared` trước; đổi preset newsletter + inline CSS (`juice`) +
gửi server. Pipeline Handlebars/field-picker/partial = merge email, dùng lại nguyên.
