# BRD v2 — Spreadsheet View cho NocoBase

> Package: `@tuanla90/plugin-spreadsheet-view` · Version khởi điểm `0.1.0` · Target NocoBase **2.1.19**
> Là plugin **#2** trong [PLAN.md](../PLAN.md). Bản v2 này thay BRD gốc, đã hiệu chỉnh theo
> kiểm chứng source NocoBase 2.1.19 thực tế (nb-local) ngày 2026-07-08.

## 1. Mục tiêu

Một **block dạng spreadsheet** (trải nghiệm Lark Base Grid) để nhập liệu/vận hành nhanh trên
Collection sẵn có của NocoBase:

- Backend dùng nguyên Collection hiện tại — **không đổi database schema**.
- ACL, Workflow, Relation, Field Interface của NocoBase giữ nguyên, plugin chỉ *phản chiếu*.
- User nhập nhiều dòng liên tục, sửa trực tiếp trên bảng, copy/paste từ Excel/Sheets.
- Người có quyền cấu hình UI chỉnh được cột, formula hiển thị, formatting.

**Không phải** một hệ spreadsheet độc lập: AG Grid chỉ là rendering engine, toàn bộ business
logic nằm trong **Spreadsheet Adapter** (mapping collection, quyền, save strategy, renderer resolver).

## 2. Vấn đề

Table block hiện tại theo mô hình CRUD form/popup — chậm với nghiệp vụ kho vận, sản xuất,
kế toán, sales ops, data entry: cần nhập liên tục nhiều dòng, copy nhanh, nhìn nhiều record
cùng lúc, sửa tại chỗ. Mục tiêu: *"Excel-like data entry trên nền database NocoBase"*.

## 3. Quyết định kiến trúc (đã chốt theo thực tế source 2.1.19)

| # | Quyết định | Căn cứ |
|---|-----------|--------|
| D1 | **Là BLOCK, không phải "View Type"** — NocoBase không có registry view cấp collection. "1 collection nhiều view" = đặt nhiều block instance, mỗi block tự mang config riêng → multi-view có sẵn miễn phí. | Kiến trúc uiSchema/block của NocoBase |
| D2 | **Target chính: modern client `/v/`** — đăng ký qua FlowEngine `BlockModel` (lane `client-v2`, như `plugin-block-list`). Toàn bộ hệ @tuanla90 đã chuẩn hoá chạy /v/. Nhớ **marker `client-v2.js` ở gốc package** (xem memory `nocobase-v2-client-marker`). Lane legacy: làm sau nếu cần. | plugin-block-list dist/client-v2 |
| D3 | **Config view lưu trong block props** (`x-decorator-props` / props của BlockModel): danh sách cột, width, editable, formula, formatting rules. Không tạo collection riêng cho config. | Chuẩn chung các block core |
| D4 | **API action-style, KHÔNG REST**: `POST /api/<collection>:update?filterByTk=<id>`, `:create`, `:destroy`. Core **không có bulk create per-row** (đã soi `@nocobase/actions`: chỉ create/update/destroy/list/get/firstOrCreate/updateOrCreate/toggle/add/remove/set; `plugin-action-bulk-update` chỉ áp *cùng 1 giá trị*). | @nocobase/actions/lib/actions |
| D5 | **v1 client-only**: commit tuần tự per-row (giới hạn paste, xem §5). **v1.1 thêm server action** `spreadsheet:bulkSync` gom create/update/destroy trong **1 transaction** — đây là điểm PLAN.md đánh dấu ⚠️. | Không có bulk API core |
| D6 | **Quyền derive từ ACL core, KHÔNG tự chế role**: list response đã kèm `allowedActions` per-record (middleware `with-acl-meta` của plugin-acl) + field-level permission → quyết định cell nào editable, nút xoá hiện không. Quyền sửa formula/formatting = quyền **UI configuration** sẵn có. Enforcement thật nằm ở server core; client chỉ phản chiếu để UX đúng. | plugin-acl with-acl-meta.js |
| D7 | **AG Grid Community** (MIT) — bundle thật `ag-grid-community` + `ag-grid-react` (tgz nặng, như echarts-pro). Các tính năng Enterprise **phải tự code**: clipboard range, fill-down, range selection. Row model: **Client-Side** (dataset nhỏ) / **Infinite** (lớn) — Viewport/Server-Side Row Model là Enterprise, không dùng. `undoRedoCellEditing` là Community — dùng được. | Bảng license AG Grid |
| D8 | **Tái dùng, không implement lại**: renderer giàu ← **#3 RunJS cell**; formatting có điều kiện ← **`@tuanla90/plugin-conditional-format`** (đang chạy); engine biểu thức ← **mathjs chung với #6/#7**. Tránh 2 hệ config formatting song song trên cùng instance. | PLAN.md #2/#3/#7 |

## 4. Giới hạn cứng (chấp nhận, KHÔNG làm trong scope)

1. **Không sort/filter server-side theo cột formula** — formula thuộc view, tính client-side
   (on-read tại trình duyệt). Muốn sort "quá hạn nhiều nhất trước" phải qua #7-B (dịch mẫu
   biểu thức → SQL) — plugin khác, không thuộc scope này.
2. **Không realtime collaboration** — không thấy con trỏ/sửa đổi của người khác live.
   Xử lý xung đột chỉ ở mức phát hiện khi commit (§9).
3. **Undo/redo chỉ trong phiên, trước khi commit.** Đã ghi về server thì không undo
   (muốn revert phải sửa lại hoặc dùng history tracking — Phase 3).
4. **Paste hàng loạt bị chặn trần ở v1** (khuyến nghị ≤ 200 dòng/lần, mỗi dòng 1 request
   tuần tự + progress bar). Trần nâng lên đáng kể khi có `spreadsheet:bulkSync` (v1.1).
5. **Một số field không edit inline đúng nghĩa**: rich text, JSON, attachment nhiều file,
   o2m phức tạp → cell chỉ render + click mở **record drawer** để sửa. Đây là hành vi
   thiết kế, không phải bug.
6. Trải nghiệm fill/range tự code sẽ ở mức "đủ dùng", không mượt bằng Excel/AG Grid Enterprise.

## 5. Editing model

**Nguyên tắc: không save từng cell — dirty row + commit.**

```
Sửa nhiều cell → Dirty Row State (client) → Commit → API
```

- **Update**: gom diff theo row → `POST /api/orders:update?filterByTk=1001` body `{qty:20, price:200}`.
- **Add row**: dòng trống cuối bảng (`_isNew:true`), điền + Enter → `:create`. Áp **default value**
  của field, validate **required** trước khi gửi.
- **Delete**: đánh dấu local → commit → `:destroy` (nhận `filterByTk` dạng mảng → xoá bulk OK).
- **Commit trigger**: rời row / Enter ở cột cuối / nút Save all. Auto-save theo row (mặc định)
  hoặc manual batch — cấu hình được ở block settings.
- **Copy/paste (tự code)**: bắt sự kiện paste → parse TSV từ clipboard → map vào vùng ô đang
  chọn → diff → apply vào dirty state. Paste vượt số dòng hiện có → tạo `_isNew` rows (trần §4.4).
- **Fill-down (tự code)**: Ctrl+D hoặc kéo tay cầm đơn giản trên cột đang chọn.
- **Undo/redo**: `undoRedoCellEditing` của AG Grid cho phần chưa commit.
- **Dirty state vs scroll**: dirty rows giữ trong store ngoài grid (không mất khi virtual
  scroll/infinite load); badge đếm số dòng chưa lưu + chặn rời trang khi còn dirty.

## 6. Mapping field type → renderer + EDITOR

> **Editor mới là phần nặng (~50% công sức)** — phải nằm trong estimate ngay từ Phase 1,
> không để sau.

| Field NocoBase | Renderer | Editor inline | Phase |
|---|---|---|:---:|
| Text / Textarea | text | text input | 1 |
| Number / Percent | số đã format | number input | 1 |
| Boolean | checkbox/toggle | click toggle | 1 |
| Select / Radio | chip màu (theo option color) | dropdown | 1 |
| Multi-select | chips | multi dropdown | 1 |
| Date / Datetime | date đã format | date picker | 1 |
| m2o (belongsTo) | label bản ghi liên kết | **record picker** (search + chọn) | 1 |
| User (createdBy/assignee) | avatar + tên | user picker | 1 |
| Email / Phone / URL | text + link | text input | 1 |
| o2m / m2m | đếm + chips | ❌ inline → mở drawer | 2 |
| Attachment | 📎 n files + preview | ❌ inline → mở drawer (upload trong drawer) | 2 |
| Rich text / Markdown / JSON | trích đoạn | ❌ inline → mở drawer | 2 |
| Formula (core, persisted) | giá trị đã tính | read-only | 1 |
| Formula của view (§7) | computed cell | read-only | 2 |
| RunJS display (#3) | renderer của #3 | read-only | 2 |
| Status flow (#4) | renderer của #4 | dropdown chỉ transition hợp lệ | sau khi có #4 |

- Field không có editor → cell read-only + icon mở drawer.
- **Row expand**: nút đầu dòng mở **record drawer chuẩn của NocoBase** (đủ form/relation/file)
  — đây là van xả cho mọi case editor inline chưa phủ.

## 7. Formula của view (client-side, on-read)

- Thuộc **block config**, không tạo database column, không đụng schema.
- Engine: **mathjs** (chung #6/#7), input = field của row (`qty * price`, `days(now - deadline)`).
- Tính lúc render → luôn tươi (đúng cho case thời gian, khác formula core persisted).
- Editor công thức có autocomplete tên field + preview trên dòng dữ liệu thật.
- Chỉ người có quyền UI configuration sửa được (D6).
- **Limitation §4.1 áp dụng**: không sort/filter server theo cột này; chỉ cho phép sort
  client-side trên trang dữ liệu đã load, ghi rõ trong UI.

## 8. Conditional formatting & rich renderer

- **Không implement mới** — tích hợp `@tuanla90/plugin-conditional-format` làm nguồn rule
  (màu nền/chữ/icon theo điều kiện, vd `stock == 0 → nền đỏ`). Adapter đọc rule và áp vào
  `cellStyle`/`cellClass` của AG Grid.
- Renderer giàu (progress, star, badge, mini-bar) → dùng renderer descriptor của **#3 RunJS
  cell** khi #3 xong; Phase 1 chỉ ship renderer cơ bản trong bảng §6.
- Nếu conditional-format cần API mở rộng để nhận context AG Grid → sửa ở plugin đó,
  không fork logic vào đây.

## 9. Validation, conflict, lỗi

- Lỗi validate từ server (required, unique, hook nghiệp vụ) → hiển thị **tại cell/row**
  (viền đỏ + tooltip message), row giữ dirty để sửa tiếp — không toast chung chung.
- **Conflict**: gửi kèm `updatedAt` đã load; server trả record mới hơn → cảnh báo
  "record đã bị sửa bởi người khác", cho chọn ghi đè / tải lại dòng.
- Mất mạng giữa chừng batch: dừng, báo rõ dòng nào đã lưu / dòng nào chưa (dirty giữ nguyên).

## 10. Quản lý cột & hiển thị

- Resize, kéo đổi thứ tự, ẩn/hiện cột, **freeze (pin) cột đầu** — đều là Community, lưu vào block config.
- Nút **"+" thêm cột**: chọn field sẵn có của collection (Phase 1); tạo field mới ngay tại chỗ
  (gọi API field của data-source-main) — Phase 2.
- Row height chỉnh được (compact / regular / tall).
- Sort/filter: đẩy xuống server qua params `sort`/`filter` chuẩn của `:list` (trừ cột formula §7).

## 11. Performance

- Không load toàn collection: `page/pageSize` của `:list`; dataset lớn dùng **Infinite Row
  Model** (Community) — grid tự gọi trang kế khi cuộn.
- Chỉ request field đang hiển thị (`fields=` + `appends=` cho relation).
- Mục tiêu: mượt với 10k record / 20 cột trên máy phổ thông; đo lại khi prototype.

## 12. Phases & estimate

> Prototype trên **1 collection nhỏ trước** (theo PLAN.md) để nghiệm thu UX rồi mới phủ field types.

**Phase 1 — Core (6–8 tuần)** *(BRD gốc ghi 4–6 tuần là thiếu editors + keyboard nav)*
- Plugin skeleton (client-v2 BlockModel + marker), block initializer, block settings.
- Data binding `:list` + Infinite Row Model; dirty-row store; commit create/update/destroy per-row.
- **Editors + renderers Phase-1 trong bảng §6** (gồm m2o picker, user picker — phần nặng).
- **Keyboard navigation: Tab / Enter / arrow / Esc** — bắt buộc Phase 1, không phải Phase 2
  (không có nó thì không đạt success criteria "nhập nhanh không cần form").
- Add row inline (default value + required), delete, row expand → record drawer.
- Quyền theo ACL (D6). Quản cột cơ bản: resize/reorder/hide/pin.
- Validation lỗi tại cell (§9 mức cơ bản).

**Phase 2 — Excel-feel + cấu hình (4–5 tuần)**
- Copy/paste TSV tự code + paste-tạo-dòng-mới; fill-down; undo/redo.
- **Server action `spreadsheet:bulkSync` (transaction)** → nâng trần paste. *(Từ đây plugin có
  server component — cập nhật cột Server trong PLAN.md.)*
- Formula của view (§7); tích hợp conditional-format (§8); editor/drawer cho o2m, attachment, rich text.
- Thêm field mới từ "+"; conflict handling đầy đủ (§9).

**Phase 3 — Optional**
- Import/Export Excel (cân nhắc tái dùng plugin-action-import/export core), bulk update theo
  vùng chọn, history tracking, validation nâng cao.

## 13. Out of scope

Không làm: Excel clone đầy đủ · workbook nhiều sheet · realtime collaboration · pivot ·
Kanban/Calendar (đã quyết KHÔNG trong PLAN.md) · analytics dashboard. Các mảng này thuộc
plugin/view khác của NocoBase.

## 14. Success criteria

User (theo quyền ACL): mở block spreadsheet trên collection, sửa trực tiếp, nhập N dòng liên
tục **chỉ bằng bàn phím**, paste từ Excel ≥ 50 dòng không lỗi, không cần mở form cho các field
Phase-1. Người cấu hình: chỉnh cột, tạo formula view, gắn rule formatting, kiểm soát quyền —
tất cả lưu trong block config, xoá block không ảnh hưởng dữ liệu.

## 15. Rủi ro chính

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| Độ phủ field editors (nhiều interface, edge case) | **Cao** | Bảng §6 chốt trước; field lạ → read-only + drawer |
| Clipboard/fill tự code nhiều edge case (merge, định dạng, IME) | Cao | Chỉ nhận TSV thuần; test với Excel + Google Sheets |
| Ghi hàng loạt không transaction ở v1 | Trung | Trần paste + progress + report từng dòng; bulkSync ở v1.1 |
| Bundle ag-grid lớn | Trung | Đã có tiền lệ echarts-pro; lazy-load block |
| FlowEngine /v/ API còn mới, ít tài liệu | Trung | Soi plugin-block-list/grid-card làm mẫu; prototype sớm |
| Xung đột UX với enhanced-table-block | Thấp | Định vị rõ: spreadsheet = nhập liệu; enhanced-table = xem/hiển thị |
