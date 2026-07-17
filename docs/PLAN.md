# PLAN — Roadmap plugin @ptdl (NocoBase 2.1.19)

/ Cập nhật: 2026-07-10. Localhost dev: http://localhost:13000 (sqlite, pm2).
/ Chi tiết kỹ thuật từng plugin: xem docs riêng (STATUS-FLOW-RESEARCH.md, ICON-ARCHITECTURE.md,
  BRD/MVP-spreadsheet-view.md, NOCOBASE-PLUGIN-BUILD-GUIDE.md).

## 1. Đã hoàn thành

| Plugin / tính năng | Trạng thái | Ghi chú |
|---|---|---|
| plugin-print-template | ✅ HOÀN THIỆN (2026-07-13) | In ấn Handlebars: editor GrapesJS kéo-thả + Mã HTML, header/footer/watermark(9 vị trí/offset/tile/behind)/khổ giấy, helper đầy đủ (formatNumber/formatDate/sql-alasql/docso đọc-số/qr), template động **nhiều điều kiện (VÀ) chọn cột nhiều cấp**, partial `{{> slug}}`, chọn logo từ file (nút icon lucide). Xuất: nút Print (vector), **Save PDF to field** (record action, chọn template+field đích, ưu tiên PDF vector qua Gotenberg — fallback raster html2pdf.js — `attachments:create` rồi set field, `src/shared/saveToFieldAction.tsx`+`pdfSave.ts`), block Preview, In hàng loạt (gộp/ZIP/lưu-field). PDF vector qua dịch vụ Gotenberg cấu hình trong UI (Settings→PDF service). Editor: tab full-width bố cục 2 cột, **live preview chọn record + nút "In thử"**. Đã bỏ số trang (Paged.js render không nhất quán). Chi tiết + kinh nghiệm: docs/PRINT-TEMPLATE-NOTES.md. |
| plugin-status-flow | ✅ HOÀN THIỆN (2026-07-13) | Column type Status Flow: config editor card + graph SVG, wildcard toAll/fromAll, khóa status khi create (client+server), server enforcement theo role (400 sạch), filter transition classic /admin. **Editable + View là 2 model độc lập, mỗi bên chọn kiểu hiển thị** (dropdown/tag/pills/buttons/steps/statusbar) + Size + **màu colorful/mono (mono chọn màu riêng)** + **icon per-status** (RegistryIconPicker) + preview (demo trạng thái GIỮA). Dialog settings đã **i18n tiếng Việt** (`statusFlowI18n.ts`), **icon toggle lucide** (IconToggle), helper schema dùng chung (scaleRow/iconToggle/togglesRow/monoColor). Display extras trong cell: quick-transition (sát status) + graph popover + **change-log history** (bridge sang plugin-change-log). Gửi source header (quick/action) + note cho change-log. |
| plugin-change-log | ✅ HOÀN THIỆN (2026-07-13) | Plugin RIÊNG, status-aware change history. Server: 2 collection (ptdlChangeLogConfigs config per-collection + ptdlChangeLogs entries), hook afterCreate/afterUpdate log MỌI path (kể cả API), best-effort, cycle-time (durationMs), snapshot field kèm, source (create/quick/action/api/bulk/system), note base64 header, decode. Client: trang Settings config (trigger/snapshot fields, default status+updatedBy/updatedAt) + timeline UI (header lead-time + time-in-status bar + actor/role/source/duration/note/snapshot, i18n VI, label+date format) + action "Change history" (popover/drawer + badge số lượng) + block độc lập (record qua `view.inputArgs`, màu nền, title dùng Card core). 1 nguồn sự thật = trang Settings; action/block chỉ UI. Xem docs/CHANGE-LOG-NOTES.md. |
| plugin-formula | ✅ Hoàn chỉnh | Cột Formula ảo (/v/ + /admin) + field display + default value Excel mode (ctx.libs.ptdlFormula). |
| plugin-enhanced-table-block | ✅ | Summary row, format sampling, thống kê theo dòng tick checkbox. |
| plugin-ai-column | ✅ | AI gắn vào text field kiểu Airtable (nút ✨, prompt {{field}}, tái dùng @nocobase/plugin-ai). |
| plugin-block-tabs | ✅ | Container block Tabs FlowEngine v2, grid con lồng vô hạn, 4 style tab. |
| plugin-spreadsheet-view | ✅ spike | Block Spreadsheet AG Grid, cell editor tái dùng FieldModel. |
| plugin-custom-icons | ✅ | Provider icon registry `lucide-*` toàn workspace (ICON-ARCHITECTURE.md). |
| plugin-global-search, menu-sections, menu-badge, filter-tree, custom-header, login-lite, pwa, conditional-format, block-custom-html, data-visualization-echarts-pro | ✅ đang chạy | Xem README.md gốc. |
| RunJS snippets | ✅ | Bộ snippet + registerRunJSSnippet native registry. |

> **conditional-format V2 — block-level (2026-07-13, ĐÃ SHIP nb-local, cond-fmt 0.2.1 · user test iteratively):**
> - **block-level rules** kiểu linkage-rules NocoBase (⚙ Table block `/v/`, **tiếng Việt**). Mỗi rule 3 **mode**:
>   **Điều kiện** (đk xuyên quan hệ, operator theo type, AND/OR → chọn cột đích → chữ/nền/đậm/nghiêng/**viền ô**/**viền
>   chữ**/icon), **Thang màu** (heatmap 2–3 màu theo min–max cột), **Thanh dữ liệu** (data bar). Cơ chế: patch
>   `TableBlockModel.getColumns` bọc `onCell`+`render`, crash-safe. UI dùng antd `Cascader` thật + `@ptdl/shared/condition`
>   + `RegistryIconPicker`. Chi tiết + gotcha: memory `project-table-oncell-cond-fmt` + HANDOFF §6. Classic /admin = no-op.
>   Giới hạn v1: scale theo **dữ liệu trang hiện tại**; date presets client-resolvable (chưa có server var `{{$user}}`).
> - **MERGE:** widget per-column "value → tag" (Format Rule) **chuyển sang field-enhancements = "Value tag"** (giữ tên
>   model `ConditionalStatusFieldModel` → config cũ vẫn chạy; field-enh set `globalThis.__ptdlCondFmt` cho spreadsheet-view).
>   conditional-format giờ CHỈ còn block-level (group Fields → Blocks).
> - **field-enhancements** Button group: thêm Display = Button group | **Single tag**. Xem PLAN.md #15.

## 2. Kế hoạch mới

### 2.1. Xuất PDF báo cáo — plugin-print-template

> **V1 + M2 + M3 ĐÃ SHIP 2026-07-10** (@ptdl/plugin-print-template 0.1.0, chạy nb-local):
> collection + settings editor fullscreen (tab Chung/Nội dung/Header/Footer/Watermark/Trang in/CSS,
> live preview, panel Hàm + sql/alasql lazy) + record action Print + header/footer lặp trang
> (chặn cả header/footer trình duyệt bằng @page margin 0) + footer ghim đáy trang + watermark
> 9 vị trí + số trang Paged.js + GrapesJS kéo-thả (block Trường/Bảng dòng con data-pt-each/
> Số liệu/Chữ ký/Ngày in). Còn: nút "Lưu PDF vào field" (backlog §3), server PDF (V2).

**Bối cảnh (2026-07-10)**: user đang tự làm bằng 2 cách — (1) Google Doc template + Apps Script
merge (đọc data từ Sheet, `[listX]` expand row bảng, metrics `{sum(list1[col])}` regex tự chế);
(2) khối HTML trong NocoBase: template Handlebars lưu collection `template_management`, fetch
record qua API, bộ helper đầy đủ (math/date/formatNumber/regex + helper `sql` chạy alasql),
in qua `window.print()`. **Kết luận: cách 2 là nền đúng → plugin hoá; bỏ dần cách 1**
(data lệch nguồn sang Google Sheet, Apps Script chậm/quota, `setSharing ANYONE+EDIT` hở).

- **⚠️ Vá bảo mật TRƯỚC KHI làm gì khác**: cách 2 hiện hardcode JWT admin exp~3025 trong HTML
  client (ai xem source block là có full admin API). → đổi `APP_KEY` instance Railway để
  invalidate token cũ; block lấy token phiên hiện tại (localStorage / ctx.api) thay hardcode.
- **V1 — client-side (đường ngắn nhất, tái dùng tối đa cái user đã có)**:
  - Record action "Print / Export" (subclass ActionModel `scene='record'` — pattern y hệt
    Status transition) mở view render template theo record hiện tại.
  - Bundle `handlebars` vào plugin (bỏ CDN); helper = `@budibase/handlebars-helpers` (~190 helper
    sẵn, học từ repo tham khảo minosss/nocobase-plugin-pht — repo đó README-only, không có code)
    + helper đặc thù của user (formatNumber vi-VN, formatDate token, `sql`/alasql — cân nhắc
    size ~1.4MB); auth = phiên đăng nhập, KHÔNG token cứng.
  - **Template editor = GrapesJS** (BSD-3, self-host, wrapper `@grapesjs/react`) — user than
    sửa HTML tay quá khó so với Google Doc → kéo-thả + Style Manager (click chỉnh màu/font).
    Bộ block tự định nghĩa: Text/Ảnh/Bảng + "Trường dữ liệu" (chèn `{{field}}`, nối
    `FieldPickerCascader`) + "Danh sách dòng con" (`{{#each}}` quanh row bảng, thay `[listX]`)
    + "Số liệu" (sum/count/avg). Output HTML+CSS thuần → đổ thẳng vào renderer Handlebars.
    KHÔNG dùng Unlayer/react-email-editor (editor không open source, load từ CDN Unlayer);
    KHÔNG dùng easy-email/MJML (HTML 600px cho email, không hợp A4).
  - **Header / Footer / Watermark / số trang** (yêu cầu 2026-07-10): template gồm 5 phần —
    header/body/footer (HTML riêng) + watermark (text|ảnh, opacity, góc xoay) + pageSetup
    (A4/Letter, lề, hướng). Render in bằng **Paged.js** (MIT, polyfill CSS Paged Media):
    header/footer lặp mỗi trang + `Trang X/Y` thật. Watermark = div `position:fixed` mờ xoay
    (tự lặp mọi trang in). Fallback không Paged.js: `<table><thead>/<tfoot>` lặp theo trang
    (không có số trang). Vẫn giữ `@page` + `page-break-inside: avoid`.
  - **Phương án B (loại template thứ 2, làm sau nếu cần)**: `docxtemplater` — template là file
    .docx sửa bằng Word/Google Docs (giữ trải nghiệm "sửa dễ, ăn style" của cách 1);
    header/footer/watermark NATIVE của Word, zero code; đổi lại output DOCX, PDF thuần lại khó.
- **V2 — server-side khi cần FILE PDF thật** (đính kèm record, gửi mail, batch):
  - Template HTML → PDF: thực tế nhất là `puppeteer-core` + Chromium headless (fidelity chuẩn,
    NHƯNG nặng ~300MB — Railway cần cân nhắc). Header/footer/số trang là NATIVE:
    `page.pdf({displayHeaderFooter, headerTemplate, footerTemplate})` + placeholder
    `pageNumber`/`totalPages`. **Lưu ý**: `pdf-lib`/`pdfmake` KHÔNG render
    HTML — chỉ hợp layout programmatic/docDefinition; `docxtemplater`+`pizzip` là đường
    template DOCX (thay cách 1, giữ WYSIWYG Word) nhưng DOCX→PDF không LibreOffice là khâu khó.
  - Server action `reports:render` — load record qua repository, trả Buffer +
    `Content-Disposition: attachment`.
- **Điểm cần verify khi làm**: font tiếng Việt (webfont nhúng khi in / fontkit+TTF nếu pdf-lib);
  ACL action mới; build stub mọi dep mới vào recipe mkstub (bẫy tgz stale im lặng).

### 2.2. Tính năng di động: GPS, NFC, quét mã nâng cao

**Kết luận khả thi**: Làm được qua Custom React Block/Field dùng Web APIs của trình duyệt
di động — không cần app native (đã có plugin-pwa làm nền).

- **GPS field**: field interface mới (kiểu `point`/json `{lat,lng,accuracy,ts}`) +
  EditableItemModel dùng `navigator.geolocation.getCurrentPosition/watchPosition`;
  display model render bản đồ tĩnh/link Google Maps. Nút "Lấy vị trí hiện tại" trong form.
- **NFC**: `NDEFReader` (Web NFC) — đọc/ghi tag để checkin/lookup record theo serial.
  **Ràng buộc cứng**: chỉ Chrome/Edge trên Android; iOS Safari KHÔNG hỗ trợ Web NFC →
  cần fallback (QR) và feature-detect `('NDEFReader' in window)`.
- **Quét mã nâng cao**: `BarcodeDetector` API (Chrome Android, nhiều format 1D/2D) +
  fallback thư viện JS (`zxing-js`/`jsQR`) qua `getUserMedia` camera stream cho iOS.
  Block scanner: quét → tra record theo field mã → mở record / điền form.
- **Ràng buộc chung**: tất cả API này yêu cầu **HTTPS** (secure context) — localhost được,
  còn deploy LAN phải có cert; xin quyền camera/GPS lần đầu; test thật trên thiết bị.
- **Kiến trúc**: gom 1 plugin `plugin-mobile-kit` (field GPS + block Scanner + block/field NFC)
  hoặc tách nhỏ theo nhu cầu; client-v2 là lane chính, classic tối thiểu.

### 2.3. plugin-email-template — tái dùng lõi editor của print-template (tương lai)

**Ý tưởng (2026-07-13, sau khi print-template hoàn thiện)**: soạn email HTML kéo-thả +
merge dữ liệu record, tái dùng ~60-70% code print-template. **Việc nền phải làm trước:**
tách một **`GrapesEditorCore`** vào `@ptdl/shared` (khung nạp UMD GrapesJS + trait màu
`ColorField`/ReactDOM + custom StyleManager + toolbar/theme lucide + `FieldPickerCascader`
chèn `{{field}}`) — hiện đang nằm trong `GrapesBodyEditor.tsx` của print-template.

Dùng lại nguyên: **pipeline render Handlebars** (`renderTemplateParts` + helpers + partials
`{{> slug}}` + đọc-số) = chính là merge/personalize email; editor 2 chế độ (kéo-thả ↔ Mã HTML);
màn quản lý template + preview + chọn record.

**Khác biệt phải xử lý cho email:**
1. Preset đổi `grapesjs-preset-webpage` → **`grapesjs-preset-newsletter`** (block table-based,
   CTA, cột) — recipe repack thêm 1 file JS như các preset hiện tại.
2. **Inline CSS**: email client (Outlook) không đọc `<style>`/CSS ngoài, không JS, không flex/grid
   → thêm bước inliner (`juice`) khi export, layout table + width ~600px cố định.
3. Đầu ra: thay `buildPrintDocument`/mở cửa sổ in → sinh HTML email + **gửi qua server lane**
   (nodemailer/SMTP/provider). Bỏ watermark/`@page`/số trang.
4. Ràng buộc: font web-safe, ảnh URL tuyệt đối (tránh data-URI lớn), QR = ảnh (không canvas).

**Kiến trúc đề xuất**: `GrapesEditorCore` (shared) ← `plugin-print-template` (preset webpage +
in/PDF) và `plugin-email-template` (preset newsletter + inliner + gửi mail).

## 3. Backlog nhỏ còn treo

- ~~status-flow: log lịch sử chuyển trạng thái~~ → **ĐÃ XONG** ở plugin riêng @ptdl/plugin-change-log
  (xem bảng §1 + docs/CHANGE-LOG-NOTES.md).
- **change-log — backlog:**
  - ~~**Phân quyền đọc log**~~ → ✅ **ĐÃ LÀM (v0.1.2, 2026-07-17).** Thêm resourcer middleware gate
    `ptdlChangeLogs:list/get` theo quyền `view`/`list` của **collection nguồn** (`filter.collectionName`),
    strategy-aware nên **root/admin qua tự động**. **FAIL-OPEN** khi không xác định được (không có
    collectionName / collection lạ / lỗi ACL / chưa resolve role) → không bao giờ vỡ timeline của user
    chính. `ctx.throw(403)` đặt NGOÀI try để catch fail-open không nuốt mất. ⚠️ **Cần verify với 1 role
    hạn chế thật** trước khi tin cậy hoàn toàn (chưa test multi-role được ở môi trường này).
  - **Retention**: log tăng vô hạn — cần cơ chế dọn/xoá cũ cho collection lưu lượng cao.
  - Source **'form'** vẫn label 'api' (server không phân biệt form vs API) — giới hạn đã biết.
- ~~plugin-number-format (_inactive): lỗi build thiếu lane dist/client-v2 — cần sửa builder nếu dùng lại.~~
  **Superseded (không cần làm)**: nhu cầu đã có ở field-enhancements "Number with unit" widget (đã ship). Vướng
  gốc là kiến trúc (form settings menu không nhận flow tuỳ ý), không phải lỗi build. Xem README.md.
