# Sub-table Pro — thiết kế (`@tuanla90/plugin-subtable-pro`)

**Trạng thái: PLAN — chưa code.** Ngày: 2026-07-15.

Widget **thay thế sub-table** cho association field (hasMany / belongsToMany) trong form,
3 tầng năng lực — tầng sau không phá tầng trước:

| Tầng | Năng lực | Người dùng |
|---|---|---|
| **1. Standalone** | Hoạt động như sub-table chuẩn: thêm dòng qua record picker, sửa qty, xóa dòng, submit nested | Ai cần sub-table "bình thường" |
| **2. Hiển thị** | Đổi view table / list / card grid; **dòng tổng** (sum các field số config được — cân, khối, tiền); qty +/− control | Ai cần sub-table đẹp + tổng tự tính |
| **3. Bridge** | Nhận event từ Table block khác trên cùng trang: add / +1 / −1 / remove theo key map → "click bên trái, nhảy vào đơn bên phải" | POS, soạn xe hàng, báo giá nhanh |

---

## 1. Bài toán & vì sao

Nghiệp vụ mẫu (đã chốt với user): **soạn xe hàng** — bảng trái = tất cả hàng hóa,
bên phải = form "chuyến xe" chứa bảng con các dòng hàng. Click/check bên trái → dòng hàng
nhảy vào bảng con (+1 nếu đã có), form tự cộng tổng cân/khối; đủ tải thì Submit tạo đơn,
chưa đủ thì nhặt ra nhặt vào. Tương tự: POS (menu → order), báo giá nhiều item.

**Cái có sẵn không làm được gì:**
- **Sub-table / record picker chuẩn**: chọn record được (~80%), nhưng thiếu click-nhanh,
  **cộng dồn qty theo key**, bỏ ra một chạm, dòng tổng.
- **Block linkage (filter)**: data-driven qua collection thật — không chở được state tạm
  (cart chưa ghi DB).
- **JS Block tự chế nguyên màn** (mockup POS hiện có): chạy được nhưng code bo toàn bộ,
  không tái sử dụng, bỏ phí form/validate/transaction chuẩn của NocoBase.

**Insight kiến trúc quyết định** (đã bàn kỹ, chọn phương án 3):
1. ~~Bridge → block cart tự chế~~: phải tự viết checkout, không tận dụng form.
2. ~~Bridge → mutate sub-table CHUẨN từ xa~~: rủi ro cao nhất — resolve FlowModel form đích,
   popup là engine render riêng, mutate array qua form API v2 ít tài liệu.
3. **Bridge → widget sub-table TỰ CHẾ** ✅: bridge subscribe nằm NGAY TRONG widget —
   không "điều khiển từ xa" ai cả, mọi mutation là `setValue` nội bộ của chính field.
   Widget vẫn nằm trong form chuẩn → Submit nested native, transaction native.
   Popup không thành vấn đề (widget đăng ký qua class registry, popup dùng chung —
   [[reference_nocobase_v2_field_render_patching]]).

---

## 2. Kiến trúc

### 2.1 Widget field (bên NHẬN — phần việc chính)

- **Editable field model** cho association hasMany/belongsToMany, đăng ký theo pattern
  field-enhancements ([[reference_field_enh_widget_pattern]]): `FieldModel` + `render`,
  chọn được trong Field component ⚙ (KHÔNG `isDefault` — sub-table gốc vẫn còn đó,
  hai widget song song, không ép thay).
- Giá trị field = mảng object con (kèm qty + các field khai báo cột). Mọi thao tác
  (add/remove/qty) đi qua `onChange`/`setValue` chuẩn của field → form serialize như thường.
- **View modes**: `table` (mặc định) · `list` · `cards` (ảnh + tên + qty, kiểu POS).
- **Dòng tổng**: config N field số → sum hiển thị chân widget (client-side, trên value hiện tại).
- Chiều cao control theo chuẩn 24/32 ([[feedback_control_height_24_32]]).

### 2.2 Bridge service (client-side pub/sub)

Singleton gắn vào `app` (cả 2 lane), API tối giản:

```ts
type BridgeEvent = { action: 'add' | 'inc' | 'dec' | 'remove' | 'set'; record: any };
app.ptdlBridge = {
  publish(channel: string, ev: BridgeEvent): void,
  subscribe(channel: string, cb: (ev: BridgeEvent) => void): () => void, // trả unsubscribe
  getLast(channel: string): BridgeEvent | undefined,
};
```

- **Client-side, 1 tab** — KHÔNG đồng bộ đa thiết bị. Multi-device (POS quầy + bếp) = v3,
  đẩy qua WS pattern có sẵn ([[reference_nocobase_websocket_push]]), KHÔNG gộp vào bản đầu.
- Widget subscribe khi mount, unsubscribe khi unmount. Nhận event → tìm dòng theo
  **key map** (vd `record.id` ↔ `productId` của dòng con) → +1 / push dòng mới / −1 / xóa.

### 2.3 Publish (bên GỬI — gần như no-code)

Hai đường, làm cả hai:
1. **RunJS action** (có sẵn của NocoBase) trên row/link bảng nguồn:
   `ctx.app.ptdlBridge.publish('cart', { action: 'add', record: ctx.record })` —
   plugin chỉ cần doc + snippet mẫu.
2. **Patch selection-change / row-click** của Table block chuẩn (pattern render-patching
   đã có) → tick checkbox là tự publish, khỏi thêm nút. Đây là sugar, để v2.

---

## 3. Config shape (field ⚙ settings params)

```jsonc
{
  "viewMode": "table",              // table | list | cards
  "columns": ["name", "weight", "volume"], // field con hiển thị (field-picker của shared)
  "qtyField": "qty",                 // field số cộng dồn; null = không qty (chỉ có/không)
  "sumFields": ["weight", "volume"], // dòng tổng; format số qua shared/format
  "cardImageField": null,            // cards mode
  "bridge": {
    "enabled": false,
    "channel": "cart",               // tên kênh, khớp với publish
    "sourceKey": "id",               // key trên record nguồn
    "targetKey": "productId",        // FK/field khớp trên dòng con
    "fieldMap": { "name": "name", "weight": "weight" } // copy field nguồn → dòng con khi add mới
  }
}
```

Dialog config theo house style [[reference_ptdl_settings_kit]] (SettingsGrid / CollapsibleSection /
`rx()` — KHÔNG `{{$deps}}`).

---

## 4. Value format & submit — RỦI RO CÒN LẠI DUY NHẤT (nhỏ)

hasMany nested create: NocoBase nhận mảng object con trong body create/update của cha
(`updateAssociationValues`). **Verify 30′ trên nb-local trước khi code UI**: dùng sub-table
chuẩn tạo 1 đơn + 2 dòng con, xem payload (DevTools) → widget bắt chước đúng shape
(dòng mới = object không id; dòng có sẵn = object kèm id). belongsToMany qua bảng trung gian
(qty nằm ở through) — nếu vướng thì v0 chỉ hỗ trợ hasMany, m2m dời v2.

---

## 5. Lộ trình — mỗi mốc ship được, có giá trị độc lập

| Mốc | Nội dung | Tiêu chí verify (live nb-local) |
|---|---|---|
| **v0** ✅ SHIPPED | Widget hasMany: table view + dòng tổng config, add qua picker (native), sửa qty, xóa dòng, submit nested | Xem "Trạng thái v0" bên dưới |
| **v1** ✅ SHIPPED | House-style config dialog + view table/list/cards + qty +/− stepper | Xem "Trạng thái v1" bên dưới |
| **v2** ✅ SHIPPED | Bridge service (subscribe) + key map config + RunJS publish | Xem "Trạng thái v2" bên dưới |
| v3 (sau) | m2m/through-qty · multi-device qua WS · patch selection-change (auto-publish) | — |

Phần mò nhiều nhất (bridge) nằm CUỐI, trên nền đã chắc.

### Trạng thái v2 (2026-07-15) — bridge ✅ SHIPPED (logic verified live)

Quyết định user: **giữ nền inline (POS)** (không rebase sang PopupSubTableFieldModel). Bridge = client-side
pub/sub 1 tab (`src/shared/bridge.ts`, `installBridge` gắn `app.ptdlBridge` + `globalThis.__ptdlBridge`).
Widget `useBridge(props)` subscribe kênh cấu hình → reducer add/inc/dec/remove/set theo `targetKey`↔`sourceKey`,
cộng dồn `qtyField`, ghi lại value qua `onChange` native (submit vẫn native).

Config: section **"Kết nối block khác (bridge)"**: bật · Tên kênh · Cột khóa khớp (FK, vd product_id) ·
Khóa trên bản ghi nguồn (vd id). Publish từ block nguồn = RunJS action:
`((ctx.app&&ctx.app.ptdlBridge)||window.__ptdlBridge)?.publish('cart',{action:'add',record:ctx.record})`.
Chi tiết + bảng action: `packages/@tuanla90/plugin-subtable-pro/README.md`.

**Verified LIVE (console):** `app.ptdlBridge` installed; pub/sub roundtrip OK; reducer semantics đúng
(add p1×2→qty2 · add p2 · inc+3→4 · dec→giảm · remove→xóa). **Chờ smoke test mắt:** click thật ở block
nguồn → widget nhảy dòng trên màn (cần dựng 2 block trên form — giới hạn tooling screenshot). Cơ chế đã verify
từng lớp.

### Trạng thái v0 (2026-07-15) — SHIPPED, build+deploy+load OK

Cách làm CHỐT (khác design ban đầu 1 chút, tốt hơn): widget **subclass `SubTableFieldModel`**
(resolve qua `flowEngine.getModelClass('SubTableFieldModel')`) → **thừa kế nguyên**: value binding
(`getCurrentValue`/`onChange`), row markers (`__is_new__`/`__is_stored__`/`__index__`), flow record-picker
(`selectExitRecordSettings`), column designer (`subTableColumnSettings`), pagination. Chỉ override `render()`
(fork `SubTableField` — không export nên chép `rowIdentity` ~40 dòng) + thêm **dòng tổng** (antd
`Table.Summary`, sum các field cấu hình) + 1 flow `ptdlSubtableProTotals` (⚙ chọn cột tính tổng). Chi tiết
cơ chế: [[reference_nocobase_subtable_field_model]].

**Đã verify LIVE trên nb-local (/v/, console + API):**
- ✅ Build → tgz + markers → deploy `node_modules/@tuanla90` → `pm enable` (new plugin, no collection) → served 200.
- ✅ `PtdlSubtableProFieldModel` đăng ký, `extends SubTableFieldModel`, có đủ flow thừa kế + `ptdlSubtableProTotals`.
- ✅ **Bind ĐÚNG** vào `o2m/m2m/mbm` — hiện là option "Sub-table Pro" trong ⚙ Field component.
  **BUG đã sửa:** phải bind qua `FormItemModel.bindModelToInterface` (class giữ `_bindings` mà form field đọc),
  KHÔNG phải `EditableItemModel` của flow-engine (map riêng, form không đọc → widget vô hình). Verified clean-load.
- ✅ **Nested-create round-trip**: body `items:[{__is_new__:true, quantity, product_id}...]` +
  `updateAssociationValues[]=items` → cha+con lưu đúng (marker keys bị server bỏ qua vô hại). Submit là native
  (form submit action tự set `updateAssociationValues` cho sub-table field) → widget thừa kế, không đụng.

**Đã verify BẰNG MẮT (user screenshot):** widget render trên form demo_order thật — bảng vẽ đúng, ô sửa inline,
＋Thêm mới + Select record hoạt động, dòng tổng hiện đúng số. Render OK.

### Trạng thái v1 (2026-07-15) — SHIPPED (build+deploy+load OK; view mới chờ smoke test mắt)

Gộp toàn bộ config vào **1 dialog house-style** (flow `ptdlSubtablePro`, thay flow `ptdlSubtableProTotals` cũ) —
`SettingsGrid`/`CollapsibleSection`/`PtdlSeg`/`fi`/`rx`/`SEG_PROPS` từ [[reference_ptdl_settings_kit]]:
- **Kiểu hiển thị**: Bảng / Danh sách / Thẻ (segmented).
- **Cột số lượng (+/−)**: chọn 1 cột → thay editor số bằng **stepper − [n] +** (mọi view).
- **Hiển thị thẻ/danh sách** (hiện khi list/cards): cột tiêu đề / phụ đề / ảnh / đơn giá → card kiểu POS
  (ảnh + tên + đơn giá + thành tiền dòng = đơn giá×qty + nút xóa).
- **Dòng tổng**: switch + checkbox chọn cột (giữ nguyên, chạy ở cả 3 view).

Verified clean-load: registered, flow `ptdlSubtablePro` có, flow cũ mất, vẫn bind o2m/m2m/mbm, đủ flow thừa kế.
**Chờ smoke test mắt:** view Thẻ/Danh sách + stepper (chưa tự chụp được — giới hạn tooling như trên).

### v1.1 (2026-07-15) — button polish + lookup (rồi PIVOT) ✅ SHIPPED

**Button polish** ✅ — stepper +/− thành **pill bo tròn** (− xám / + primary, hover tint, số typable
borderless, height 30/24 theo control-height convention); nút **Thêm mới** = dashed bo góc, **Chọn** =
default + icon; nút xóa = **tròn hover đỏ nhạt** (thay CloseOutlined trơ). User xác nhận stepper đẹp.

**Lookup — QUAN TRỌNG, đã PIVOT:** ban đầu làm "cột liên kết" riêng (config multiselect → cột read-only
trong bảng). User phản hồi ĐÚNG: cột đó là "công dân hạng 2" — không đổi tên/format được, không nằm trong
menu **Trường** như cột thường. **Phát hiện:** NocoBase ĐÃ có sẵn — mỗi `SubTableColumnModel` có setting
**"Title field"** (SubTableColumnModel.tsx:1076): với cột quan hệ (vd `Sản phẩm`), ⚙ cột → **Title field →
chọn `Đơn giá (unit_price)`** → hiện field đó, đổi tên/format/fixed/pattern per-column đều được (first-class).
Và vì widget của mình DÙNG native `getColumns()`/`getColumnProps()` (title bọc trong `FlowsFloatContextMenu`),
**⚙ per-column native VẪN chạy nguyên trong widget**. → **BỎ lookup-as-table-column**; cột quan hệ dùng native
Title field. Lookup (`L:rel.field` + `useLookups` fetch) **chỉ còn cho CARD/LIST view** (card không có hệ cột
native): "Cột đơn giá / tiêu đề / ảnh" của card chọn được field trực tiếp HOẶC `product · unit_price`.
`useLookups` verified data-layer live (item1→400k, item3→120k).

**Cách hiển thị `product.unit_price` ở BẢNG (hướng dẫn user):** thêm cột `Sản phẩm` (menu Trường) → ⚙ cột →
Pattern = Read-pretty (nếu cần) → **Title field = Đơn giá** → đổi tên. Hoàn toàn native, first-class.

**Còn (backlog):** live preview trong dialog; card lookup 1 chặng belongsTo/hasOne (multi-hop sau). View
card/list + stepper **chờ smoke test mắt** (giới hạn tooling screenshot).

---

## 6. Giới hạn nói trước

- Bridge = 1 tab trình duyệt, không multi-user/device (tới v3).
- v0–v2 không tái hiện 100% sub-table chuẩn: field type trong cột giới hạn tập phổ biến
  (text / number / select / date / m2o-display); linkage rules per-row, ACL per-field,
  validate phức tạp → khuyên dùng sub-table gốc. Hai widget song song.
- Dòng tổng là client-side trên value đang sửa (đúng ngữ cảnh soạn đơn); tổng server-side
  đã có computed-field lo.

---

## 7. Quy tắc bắt buộc (build-guide §R1/R2)

- **Bilingual en+vi** từ đầu: NS riêng, `tExpr`, `addResources` cả 2 lane
  ([[feedback_plugin_i18n_and_shared_mandatory]]); wire `setSharedT` cho field-picker/condition
  của shared ([[reference_ptdl_shared_i18n_injector]]).
- **Reuse `@tuanla90/shared`**: field-picker (chọn columns/sumFields), settings-kit (dialog),
  format (số/tiền), realtime helper khi tới v3.
- Client i18n đọc `app.i18n` (KHÔNG window global — [[reference_nocobase_v2_block_i18n]]).
- Build: recipe `build-env/recipes/run-subtable-pro-build.sh` + add-markers TRƯỚC khi deploy
  ([[project_nocobase_build_marker_tgz_trap]]); deploy vào `node_modules/@tuanla90`
  ([[reference_nb_local_deploy]]); plugin MỚI = tạo bảng tay nếu có collection
  ([[reference_nb_local_install_new_plugin]] — bản này KHÔNG có collection server, thuần client → chỉ cần INSERT row `applicationPlugins`).

## 8. Cấu trúc file dự kiến

```
packages/@tuanla90/plugin-subtable-pro/
  src/client/index.tsx        — lane /admin: registerModels + i18n
  src/client-v2/index.tsx     — lane /v/: như trên
  src/shared/bridge.ts        — ptdlBridge singleton (pub/sub)
  src/shared/SubtablePro.tsx  — widget render (3 view modes + totals + qty)
  src/shared/settings.tsx     — flow ⚙ config (settings-kit)
  src/shared/locale.ts        — en-US + vi-VN
  src/server/plugin.ts        — rỗng (client-only)
```

Server-side: **không có** (bridge client-only, submit dùng API chuẩn) → không cần ACL mới.
