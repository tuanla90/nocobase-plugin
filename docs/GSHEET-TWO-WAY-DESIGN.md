# Thiết kế đồng bộ 2 chiều NocoBase ⇄ Google Sheets (V2 của @tuanla90/plugin-gsheet-sync)

> **Trạng thái (2026-07-13): ĐÃ TRIỂN KHAI + E2E PASS.** Tài liệu này là thiết kế gốc, giữ
> làm tham chiếu. Hiện thực nằm ở `src/server/writeback.ts`; tính năng người dùng + cách cài +
> giới hạn đã biết xem `packages/@tuanla90/plugin-gsheet-sync/README.md`. Plugin v0.1.0 đã đóng gói
> vào `latest/@tuanla90/`.

Nghiên cứu 2026-07-12, dựa trên source thật của nb-local 2.1.19 (không đoán API).
V1 (pull 1 chiều) đã chạy; tài liệu này là thiết kế cho chiều PUSH (NocoBase → Sheet).

## 1. Phía NocoBase: bắt sự kiện record thay đổi

**Đã xác minh source** (`@nocobase/database/lib/repository.js`, `model-hook.js`,
`@nocobase/plugin-workflow/dist/server/triggers/CollectionTrigger.js`):

- Sự kiện đúng để subscribe (y hệt workflow CollectionTrigger dùng):
  - `db.on('<targetCollection>.afterCreateWithAssociations', (model, options) => ...)`
  - `db.on('<targetCollection>.afterUpdateWithAssociations', (model, options) => ...)`
  - `db.on('<targetCollection>.afterDestroy', (model, options) => ...)`
- `model.changed()` (sequelize) cho danh sách field đã đổi → chỉ push cell thay đổi.
- **Phải chờ transaction commit rồi mới enqueue**: trong hook,
  `options.transaction ? options.transaction.afterCommit(enqueue) : enqueue()` —
  tránh push dữ liệu của transaction bị rollback.

### Chống loop (pull ghi → hook bắn → push ngược → pull...)
- **V1 đã ghi mọi record pull với `hooks: false`** — repository.js:485/556 xác nhận
  `options.hooks !== false` mới emit `afterCreate/afterUpdateWithAssociations`, và
  `hooks:false` cũng truyền xuống sequelize (tắt cả bridge `<col>.afterUpdate`).
  → hook push KHÔNG bắn trong lúc pull. Loop bị chặn sẵn từ V1.
- Replace-mode `model.destroy({where:{}})` chỉ bắn `afterBulkDestroy` (không phải
  per-instance `afterDestroy` — sequelize chỉ bắn per-instance khi `individualHooks:true`)
  → subscribe `afterDestroy` là an toàn với replace mode. Vẫn nên thêm `hooks:false`
  vào destroy của pull cho chắc.
- Defense-in-depth: pull ghi thêm `context: { ptdlGsheetPull: true }`; hook check
  `options.context?.ptdlGsheetPull` thì bỏ qua (workflow cũng dùng pattern context này
  — `skipWorkflow`). Phòng khi sau này muốn bật `hooks:true` lúc pull để workflow
  của user chạy trên dữ liệu sync.
- **Trade-off ghi nhận**: vì pull dùng hooks:false, workflow của user hiện KHÔNG
  trigger khi dữ liệu về từ sheet. Nếu user cần → làm option "Trigger workflows on
  sync" (bật hooks + truyền context skip riêng cho push).

## 2. Phía Google Sheets: API ghi + định danh dòng

### API ghi (scope `auth/spreadsheets` V1 đã xin sẵn — không cần re-share)
| Việc | Endpoint | Ghi chú |
|---|---|---|
| Sửa ô theo range | `PUT /values/{range}?valueInputOption=...` | 1 range/request |
| Sửa NHIỀU range 1 phát | `POST /values:batchUpdate` body `{valueInputOption, data:[{range,values},...]}` | **dùng cái này cho flush queue** |
| Thêm dòng cuối | `POST /values/{Sheet}!A1:append` | response `updates.updatedRange` → parse ra số dòng mới → cập nhật `_sheet_row` |
| Xoá dòng thật | `POST /:batchUpdate` request `deleteDimension {range:{sheetId, dimension:'ROWS', startIndex, endIndex}}` | index 0-based; **dịch số dòng các record sau** |
| Ghi theo metadata | `POST /values:batchUpdateByDataFilter` với `developerMetadataLookup` | không cần biết số dòng |

- `valueInputOption`: dùng `USER_ENTERED` (số/ngày được Sheets hiểu đúng kiểu);
  **BẮT BUỘC escape formula-injection**: string bắt đầu bằng `=`/`+`/`@` → prefix `'`.
- Ngày: ghi chuỗi ISO `yyyy-MM-dd` (hoặc `yyyy-MM-dd HH:mm:ss`) — USER_ENTERED parse
  ổn định mọi locale; KHÔNG ghi serial number (RAW serial cần cell đã format date sẵn).
- Boolean → `TRUE`/`FALSE`.

### Định danh dòng — vấn đề cốt lõi (4 phương án)
| # | Cách | Ưu | Nhược |
|---|---|---|---|
| A | `_sheet_row` (V1 đang lưu) | có sẵn, 0 request | **vỡ khi sheet chèn/xoá/sort dòng** giữa 2 lần pull |
| B | **Cột khóa (keyColumn)** | upsert mode V1 đã bắt buộc có; tìm dòng = đọc 1 cột rồi indexOf; không đụng schema sheet | tốn 1 read trước mỗi flush (cache được); key phải unique + không đổi |
| C | Cột ID riêng ghi vào sheet (record id) | tường minh | user thấy/xoá được cột; phải ghi thêm cột |
| D | **Developer metadata** gắn từng dòng (`createDeveloperMetadata` + `batchUpdateByDataFilter`) | vô hình, SỐNG SÓT sort/chèn/xoá, ghi không cần biết số dòng | code nhiều hơn; phải tag dòng lúc pull; quota ~30k metadata/spreadsheet |

**KHUYẾN NGHỊ V2-MVP: phương án B** — vì push chỉ bật khi connection ở chế độ upsert
(đã có keyColumn), flow ghi:
1. flush queue → `GET values/{Sheet}!<cột key>` (1 read, cache 30s)
2. map keyValue → rowIndex; record có key không tìm thấy → append (dòng mới)
3. gộp mọi thay đổi thành 1 `values:batchUpdate`
`_sheet_row` chỉ còn là hint/debug, không phải nguồn sự thật.
**V2.1 nâng cấp**: phương án D cho sheet không có khóa tự nhiên (tag metadata
`ptdlRowId=<uuid>` mỗi dòng ngay lúc pull, mọi ghi sau đó theo metadata).

## 3. Kiến trúc push (module mới `src/server/writeback.ts`)

```
hooks (afterCreate/Update/Destroy, đã lọc pull-context)
  → transaction.afterCommit
    → enqueue(connId, recordId, {op, changedFields})
       (Map<connId, Map<recordId, change>>, gộp nhiều edit 1 record)
  → debounce N giây (mặc định 3s, config pushDebounceSec)
    → flush(connId):
        đọc cột key (cache) → phân loại update/append/delete
        → 1 values:batchUpdate + append + (tuỳ chọn) deleteDimension
        → retry backoff khi 429 (quota 60 write/phút/user — debounce 3s
          + batch là đủ xa trần)
        → append xong: cập nhật _sheet_row record mới (hooks:false!)
```

- Schema connection thêm: `twoWay` (bool, chỉ bật được khi syncMode=upsert),
  `pushDeletes` ('none' | 'clear' | 'delete' — mặc định 'none'; 'delete' phải
  deleteDimension và chấp nhận dịch dòng vì identity theo key nên không sao),
  `fieldsMap` (json — **V2 phải PERSIST mapping header→field→cột** lúc pull;
  V1 chưa lưu, push cần biết field nào nằm cột nào),
  `pushDebounceSec` (int, default 3).
- Chỉ push field có trong fieldsMap (bỏ `_sheet_row`, id, createdAt...).
- Record tạo mới trong NocoBase mà chưa điền giá trị cột khóa → KHÔNG push,
  log warning (không có key thì không định danh được dòng).
- Bind/unbind hook động: sau `saveConnection`/`deleteConnection` re-register
  (giữ Map connId→listener để `db.off` — pattern getHookId của workflow).

## 4. Conflict & thứ tự thắng thua
- **Push tức thời (debounce vài giây), pull theo lịch** → trong 1 chu kỳ:
  NocoBase sửa → sheet nhận ngay; sheet sửa → NocoBase nhận ở lần pull kế.
- Cả 2 bên sửa CÙNG ô giữa 2 lần pull: bên nào ghi SAU thắng (last-write-wins).
  Không làm merge/CRDT — ghi rõ trong UI cho user.
- Pull nên **diff trước khi ghi** (V1 đang update mọi dòng bất kể đổi hay không):
  giảm churn updatedAt + là chỗ phát hiện conflict nếu sau này muốn cảnh báo.
- Ping-pong không xảy ra: pull ghi hooks:false (không bắn push), push không
  gây pull (pull theo lịch, so key/diff).

## 5. Lộ trình đề xuất
1. **V2.0**: persist `fieldsMap` khi pull + diff-before-write + `twoWay` cho
   update/create (append), pushDeletes='none'. Chỉ upsert mode.
2. **V2.1**: pushDeletes clear/delete; nút "Push all now" (đẩy toàn bộ record
   lệch lên sheet); cảnh báo conflict đơn giản (so updatedAt vs lần pull cuối).
3. **V2.2**: developer metadata identity cho sheet không khóa; option
   "Trigger workflows on sync".

## 6. Việc phải verify bằng tay khi có credentials thật (chưa test được)
- [ ] `values:append` trả `updates.updatedRange` đúng format `Sheet1!A7:F7` → parse số dòng.
- [ ] `USER_ENTERED` + chuỗi ISO date vào cell trống → Sheets nhận là date (không phải text) với locale sheet VN.
- [ ] Quota thực tế khi batch 200 dòng/flush.
- [ ] deleteDimension cần `sheetId` (số, không phải tên tab) → lấy từ testConnection meta (V1 đã trả sheetId).
- [ ] `transaction.afterCommit` tồn tại trên transaction của sqlite driver (sequelize chuẩn là có).
