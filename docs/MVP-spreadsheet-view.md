# MVP Proposal — Spreadsheet View (cập nhật 2026-07-10)

> Bổ sung cho [BRD-spreadsheet-view.md](BRD-spreadsheet-view.md) (2026-07-08). Bản này hiệu chỉnh theo
> **hiện trạng workspace đã thay đổi** (field-enhancements widgets, plugin-formula, enhanced-table đã chạy)
> và theo **kiểm chứng sâu source core 2.1.19** ngày 2026-07-10 (`nb-local/node_modules/@nocobase/{client-v2,flow-engine,actions}`).

## 1. Những gì ĐÃ ĐỔI so với lúc viết BRD

| # | BRD giả định | Thực tế bây giờ | Hệ quả |
|---|---|---|---|
| C1 | "Editors = ~50% công sức, phải tự code từng field type cho AG Grid" | Core có **binding registry `EditableItemModel`** (interface → FieldModel) + **`FieldModelRenderer` nhận thẳng `value`/`onChange`** (không bắt buộc Formily). Core tự dùng đúng pattern này trong `QuickEditFormModel` (sửa 1 cell qua popover). | **Editor gần như free**: cell edit = resolve binding theo interface → mount 1 `FieldModelRenderer`. Không viết lại editor cho từng field type. Estimate Phase 1 giảm mạnh. |
| C2 | "Renderer giàu chờ #3 RunJS cell" | `@ptdl/plugin-field-enhancements` đã ship **widget no-code bind cả EditableItemModel LẪN DisplayItemModel**: Number/Star/Progress/Link/Boolean/RichSelect/SelectButtons. | Cell spreadsheet resolve qua registry → **tự hưởng widget @ptdl** (user đã chọn "Progress" cho field thì spreadsheet hiện progress luôn). Bỏ hẳn dependency chờ #3. |
| C3 | "Engine formula view = mathjs (chung #6/#7)" | `@ptdl/plugin-formula` đã HOÀN CHỈNH: `formulaEngine.ts` export `evaluateFormula(formula, record)` — formulajs ~400 hàm Excel, proxy auto-pluck relation, HTML helpers. | Formula của view **tái dùng ptdlFormula**, không thêm mathjs. Cột formula ảo client-side gần như có sẵn engine. |
| C4 | "Core không có inline edit" | Core 2.1.19 CÓ **quickEdit** (`tableSettings.quickEdit`) nhưng là **popover per-cell qua icon bút chì**, không phải click-vào-ô, không keyboard nav, không paste. | Không đủ "chất spreadsheet", nhưng `QuickEditFormModel` là **bản mẫu chuẩn** cho cách mount editor on-demand + commit + `resource.setItem(index, record)` cập nhật đúng 1 row. |
| C5 | Block đăng ký "như plugin-block-list" | Đã có tiền lệ NỘI BỘ tốt hơn: `enhanced-table-block` subclass `TableBlockModel`; pattern chuẩn: subclass `CollectionBlockModel` + `static scene = BlockSceneEnum.many` + `.define({label, group})` → tự vào menu Add block với submenu chọn collection (`defineChildren` lo). | Skeleton block chắc chắn làm được nhanh, rủi ro FlowEngine "ít tài liệu" đã giảm (đủ kinh nghiệm nội bộ). |
| C6 | — | `MultiRecordResource` có đủ CRUD: `create/update(filterByTk,data)/destroy(tk[])/refresh/setPage/setFilter/setSort/setItem/getSelectedRows`. `destroy` nhận mảng tk → bulk delete OK. | Persistence Phase 1 không cần server component. Xác nhận D5 của BRD: **không có** bulk update per-row khác values → v1 commit per-row, `bulkSync` vẫn để v1.1. |
| C7 | — | Record drawer mở được bằng API: `ctx.openView(uid, {mode:'drawer'})` hoặc `ctx.viewer.drawer({content})`. | Row expand → drawer là 1 call, không phải tự dựng. |

## 2. Kiến trúc đề xuất (hybrid — chốt)

**AG Grid Community chỉ làm KHUNG (virtualization + keyboard nav + selection), NocoBase FieldModel làm RUỘT (editor/renderer).**

```
PtdlSpreadsheetBlockModel extends CollectionBlockModel   (scene=many, define → Add block menu)
 ├─ resource = MultiRecordResource        (core cấp sẵn qua context: list/page/filter/sort)
 ├─ AG Grid Community (bundle thật, tiền lệ echarts-pro)
 │   ├─ cellRenderer  = renderer NHẸ tự viết theo interface (text/number/date/chip màu option/
 │   │                  boolean/m2o label/user avatar) — KHÔNG mount FlowModel per cell (perf);
 │   │                  field đã gắn widget @ptdl → dùng chính view component export từ field-enhancements
 │   ├─ cellEditor    = 1 editor ACTIVE duy nhất: resolve EditableItemModel.getDefaultBindingByField(ctx, cf)
 │   │                  → addSubModel + <FieldModelRenderer value onChange> (pattern QuickEditFormModel,
 │   │                  bỏ popover). Field không có editor phù hợp → read-only + mở drawer.
 │   └─ keyboard nav / undoRedoCellEditing / column resize-reorder-pin-hide = AG Grid Community CÓ SẴN
 ├─ Dirty-row store ngoài grid → commit per-row: resource.update(tk, diff) / resource.create / resource.destroy([tk])
 ├─ Row expand → ctx.openView(..., {mode:'drawer'})
 └─ ACL: đọc allowedActions per-record từ list meta (with-acl-meta) → khoá cell/nút xoá
```

Vì sao không đi 2 hướng kia:
- **"QuickEdit++" (độ trên TableBlockModel/antd Table):** antd Table không có virtualization tốt, không keyboard nav dạng lưới, không range/clipboard — càng độ càng gồng, trần thấp. Loại.
- **AG Grid full-custom editors (BRD gốc):** phí — mất free editors/validation/widget @ptdl từ binding registry, và phải maintain N editor song song với core. Loại.

Điểm cần prototype sớm (rủi ro chính còn lại): **vòng đời FlowModel trong cellEditor của AG Grid** — mount 1 editor khi vào edit mode, `dispatchEvent('beforeRender')` async trong khi AG Grid muốn editor sync → cần wrapper suspense/placeholder; và context tối thiểu cho FieldModel (`collectionField` + `blockModel` + `collection`, form antd mỏng nếu field đòi). Làm spike 2-3 ngày với 3 loại field: input, select (chip), m2o (RecordSelect) — nếu m2o chạy thì mọi thứ khác chạy.

## 3. Scope MVP (nghiệm thu được trong ~2–3 tuần, thay Phase 1 6–8 tuần của BRD)

**Có trong MVP:**
1. Block skeleton: `CollectionBlockModel` subclass + define + marker client-v2 + block settings (pageSize, row height compact/regular/tall, editable on/off).
2. Load data: `resource` list + phân trang (Client-Side Row Model, pageSize mặc định 100; Infinite Row Model để Phase 2).
3. Cột từ collection fields: chọn field hiển thị (checkbox list trong settings), resize/reorder/pin/hide (AG Grid, lưu vào block props).
4. Renderer nhẹ Phase-1: text, number/percent (format từ field options), boolean, select/multi chip màu option, date format, m2o label, user avatar+tên, email/phone/url.
5. **Editor qua binding registry**: text/number/boolean/select/date/m2o/user — mount on-demand. Field đã gán widget @ptdl (Star, Progress, RichSelect…) tự dùng widget đó.
6. Keyboard: Tab/Enter/arrow/Esc (AG Grid), Enter cuối dòng → xuống dòng mới.
7. Dirty-row + commit: auto-save khi rời row (badge số row chưa lưu, chặn rời trang khi dirty); add row cuối bảng (`_isNew`, default value + required check); delete rows đã chọn (`destroy([tks])`).
8. Lỗi validate từ server hiện tại cell/row (viền đỏ + tooltip), row giữ dirty.
9. Row expand → record drawer (`openView`).
10. ACL phản chiếu: `allowedActions` per-record + field-level → cell read-only, ẩn nút xoá.

**KHÔNG trong MVP (Phase 2 — giữ như BRD):** copy/paste TSV + paste-tạo-dòng, fill-down, `spreadsheet:bulkSync` (server, transaction), formula view (tái dùng ptdlFormula), tích hợp conditional-format vào cellStyle, o2m/attachment/richtext drawer editor, Infinite Row Model, thêm field mới từ "+", conflict `updatedAt`.

**Thứ tự dựng MVP:**
1. **Spike** (2-3 ngày): AG Grid trong 1 BlockModel + FieldModelRenderer làm cellEditor cho input/select/m2o. ← điểm go/no-go
2. Block chính thức + settings + chọn cột + renderer nhẹ (tuần 1).
3. Dirty store + commit + add/delete row + keyboard flow + validate lỗi (tuần 2).
4. ACL + drawer + polish + build/recipe/deploy nb-local (tuần 3).

## 4. Build & bundle

- Bundle thật `ag-grid-community` + `ag-grid-react` (KHÔNG stub) — recipe theo mẫu echarts-pro; ag-grid theme CSS import thẳng vào bundle. Lazy-load module grid khi block mount để không phình first-load.
- Marker `client-v2.js` gốc package (memory nocobase-v2-client-marker). Lane classic /admin: **không làm** (block FlowEngine chỉ có /v/, giống filter-tree) — server = no-op plugin.
- Định vị so với enhanced-table: spreadsheet = NHẬP liệu; enhanced-table = XEM/thống kê. Không trộn tính năng.
