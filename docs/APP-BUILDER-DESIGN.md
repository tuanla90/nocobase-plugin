# App Builder — sinh app NocoBase từ mô tả (Design & Plan)

> Plugin: **`@ptdl/plugin-app-builder`** · Target NocoBase 2.1.19 · Trạng thái: **P0 (nền) đang dựng.**
> Mục tiêu cuối: user gõ mô tả tiếng Việt → AI sinh **cả app** (collections + quan hệ + nhiều trang + menu +
> widget @ptdl). Plugin này là **compiler + bộ mẫu (golden corpus)**; lớp AI gắn sau (P2).

## 0. Insight chính (định hình toàn bộ)

1. **KHÔNG cho AI đẻ thẳng `flowModels`/`collections` JSON** (thô, dài, dễ vỡ, phải hiểu nội tạng framework).
   Thay bằng một **App-Spec** — IR khai báo cấp cao, gọn — cộng một **compiler tất định** bung ra artifact thật.
   AI học App-Spec + "từ vựng" plugin; nó suy nghĩ ở tầng **nghiệp vụ**, không phải tầng framework.
2. **"App mẫu" = bộ golden**: mỗi mẫu = `(mô tả NL) ↔ (App-Spec chuẩn) ↔ (app materialize được + seed)`.
   Vừa **dạy AI** (few-shot exemplar) vừa là **bộ đo** (eval/regression).
3. **Tác giả hoá mẫu KHÔNG viết JSON tay** — dựng app thật bằng chính bộ @ptdl → **extract** ra App-Spec →
   snapshot làm golden. Extractor này cũng là nửa kia của **round-trip validator**.
4. **Không cần fine-tune** (áp cho P2): schema + catalog plugin trong system prompt + retrieval few-shot
   mẫu gần nhất + vòng validate→retry (compiler làm trọng tài).

### Tài sản tái dùng (không dựng lại)

| Cần | Đã có sẵn |
|---|---|
| Compiler dựng trang (route + flowModel tree) | `instant-create-page` `createQuickPage`/`buildTableBlock` (`quickView.tsx`) |
| Tạo collection + field + migrate bảng | `gsheet-sync` `ensureTargetCollection` = `db.getRepository('collections').create({values, context:{}})` |
| Vòng sinh→validate→retry (P2) | `@ptdl/shared` `AiCodegenButton` + `generateCode`/`ai-server` |
| Retrieval mẫu gần nhất (P2) | `ai-column` embedding (gemini-embedding-001, cosine, 768-dim) |
| "Từ vựng" widget/block | `PLUGIN-REGISTRY.md` (28 plugin) + field-enhancements bindings |
| Domain khoe hàng | `formula` scan-costing, `line-generator` BOM, `status-flow`, `subtable-pro` |

## 1. Phạm vi đợt này (P0 → P1)

**P0 — Nền (không AI):**
- Chốt **App-Spec schema** (mục 3) — `src/shared/appSpec.ts`.
- **Compiler `dryRun`** — validate spec vs registry sống (resolve mọi collection/field/widget/quan hệ), không ghi.
- **Extractor** — app thật → App-Spec (cho tác giả hoá mẫu + round-trip).

**P1 — Round-trip (không AI):**
- **Compiler `apply`** — tạo thật cả app (collections → seed → pages → menu), có rollback.
- Dựng **3 app mẫu** (bán hàng / kho / CRM) bằng hand-build → extract.
- Chứng minh **round-trip**: `app gốc → extract → spec → apply → app mới` khớp cấu trúc & chạy được.

Ngoài phạm vi đợt này (ghi để không lẫn): lớp AI (P2), eval harness (P3), corpus 6–10 domain (P3),
seed thông minh / dashboard / quan hệ phức (P4).

## 2. Kiến trúc — compiler 2 tầng

NocoBase tách rõ: **collections = server/DB**, **pages = client flowModels**. Compiler theo đúng đường đó.

```
App-Spec
  │
  ├─(TẦNG SERVER)  action appBuilder:apply|dryRun
  │     collections → fields → relations → seed
  │     dùng db.getRepository('collections'|'fields').create({values, context:{}})   ← pattern gsheet-sync
  │     (context:{} = chạy hook collection-manager → migrate bảng vật lý)
  │
  └─(TẦNG CLIENT)  flowEngine + routeRepository
        menu groups (desktopRoutes type:'group') → mỗi PageSpec:
        createRoute(flowPage) → createModelAsync(RootPageModel→tabs→grid→TableBlock) → save()
        TÁI DÙNG builders của quickView.tsx (buildTableBlock/detailsBlock/formBlock/popupShell)
```

Thứ tự `apply`: **server trước** (bảng phải tồn tại) → refresh dataSource client → **client sau** (trang trỏ vào bảng).
`dryRun`: chỉ chạy validator ở cả 2 tầng (server: field-def hợp lệ? quan hệ target tồn tại? / client:
interface→model resolve được? widget label khớp binding?) — trả list lỗi, không ghi.

**Đóng gói:** plugin RIÊNG `@ptdl/plugin-app-builder` (không nhồi vào instant-create-page — khác scope:
whole-app + collection-gen + AI). Phần builder trang import lại từ instant-create-page hoặc tách chung ra
`@ptdl/shared` sau (P1 để nguyên, copy builders nếu cần độc lập).

## 3. App-Spec IR (schema — nguồn sự thật)

TypeScript ở `src/shared/appSpec.ts`; đây là bản mô tả + ví dụ. Nguyên tắc: **khai báo intent, không chi tiết framework.**

```ts
interface AppSpec {
  meta: { name: string; description?: string; locale?: 'vi' | 'en' };
  collections: CollectionSpec[];
  pages: PageSpec[];
  menu?: { groups: MenuGroup[] };            // tuỳ chọn; thiếu → suy từ page.menuGroup
}

interface CollectionSpec {
  name: string;                              // machine name (snake/camelCase, [a-z0-9_])
  title: string;                             // nhãn người đọc (vi)
  titleField?: string;                       // field làm nhãn hiển thị (mặc định: field string đầu tiên)
  fields: FieldSpec[];
  relations?: RelationSpec[];
  seed?: Record<string, any>[];              // vài dòng demo (khoá theo field.name; quan hệ = title target)
}

interface FieldSpec {
  name: string;
  title: string;
  interface: FieldInterface;                 // khoá interface NocoBase (mục 3.1)
  options?: Array<string | { value: string; label?: string; color?: string }>; // select/radio/multi
  required?: boolean;
  unique?: boolean;
  defaultValue?: any;
  widget?: string;                           // NHÃN thân thiện của binding @ptdl (mục 4). vd 'Progress bar'
  widgetConfig?: Record<string, any>;        // config sâu (P4; P0/P1 dùng default widget)
  states?: string[];                         // riêng interface 'statusFlow'
}

interface RelationSpec {
  name: string;                              // tên field quan hệ trên collection NÀY
  type: 'm2o' | 'o2m' | 'o2o' | 'm2m';
  target: string;                            // tên collection đích
  reverseName?: string;                      // field ngược trên target (tự sinh nếu thiếu)
  through?: string;                          // bảng nối m2m (tự sinh nếu thiếu)
}

interface PageSpec {
  key?: string;
  title: string;
  icon?: string;                             // key lucide (vd 'lucide-shopping-cart')
  collection: string;
  menuGroup?: string;                        // nhãn group menu; tạo nếu chưa có
  block?: 'TableBlockModel' | 'EnhancedTableBlockModel'; // mặc định TableBlockModel
  columns: Array<string | ColumnSpec>;       // tên field, hoặc {name,title?,widget?}
  popupColumns?: string[];                   // field trong View/Edit/Add; mặc định = columns
}

interface ColumnSpec { name: string; title?: string; widget?: string; }
interface MenuGroup { label: string; icon?: string; order?: number; }
```

### 3.1 `FieldInterface` (khoá NocoBase hợp lệ)

`input · textarea · markdown · richText · phone · email · url · uuid · nanoid · password ·`
`number · integer · percent · select · multipleSelect · radioGroup · checkbox · checkboxGroup ·`
`boolean · date · datetime · time · color · icon · json` + **mở rộng @ptdl:** `statusFlow` (kèm `states[]`).

Quan hệ KHÔNG khai trong `fields[]` mà trong `relations[]` (compiler tự sinh field quan hệ + FK).

### 3.2 Ví dụ (rút gọn — app bán hàng)

```jsonc
{
  "meta": { "name": "Bán hàng", "locale": "vi" },
  "collections": [
    { "name": "customers", "title": "Khách hàng", "titleField": "name",
      "fields": [
        { "name": "name",  "title": "Tên",       "interface": "input", "required": true },
        { "name": "phone", "title": "Điện thoại", "interface": "phone", "widget": "Input icon" },
        { "name": "tier",  "title": "Hạng",       "interface": "select",
          "options": ["VIP", "Thường"], "widget": "Button group" }
      ],
      "seed": [ { "name": "Cửa hàng A", "phone": "0900000001", "tier": "VIP" } ] },

    { "name": "products", "title": "Sản phẩm", "titleField": "name",
      "fields": [
        { "name": "name",  "title": "Tên", "interface": "input", "required": true },
        { "name": "price", "title": "Giá", "interface": "number" }
      ] },

    { "name": "orders", "title": "Đơn hàng", "titleField": "code",
      "fields": [
        { "name": "code",   "title": "Mã đơn",   "interface": "input", "required": true, "unique": true },
        { "name": "status", "title": "Trạng thái","interface": "statusFlow",
          "states": ["Nháp", "Đã xác nhận", "Đang giao", "Hoàn tất"], "widget": "Status flow" },
        { "name": "total",  "title": "Tổng tiền", "interface": "number", "widget": "Progress bar" }
      ],
      "relations": [
        { "name": "customer", "type": "m2o", "target": "customers" },
        { "name": "items",    "type": "o2m", "target": "order_items" }
      ] }
  ],
  "pages": [
    { "title": "Khách hàng", "collection": "customers", "menuGroup": "Danh mục",
      "icon": "lucide-users", "columns": ["name", "phone", "tier"] },
    { "title": "Đơn hàng", "collection": "orders", "menuGroup": "Vận hành",
      "icon": "lucide-shopping-cart", "block": "EnhancedTableBlockModel",
      "columns": ["code", "customer", "status", "total"],
      "popupColumns": ["code", "customer", "status", "items", "total"] }
  ],
  "menu": { "groups": [ { "label": "Danh mục", "order": 1 }, { "label": "Vận hành", "order": 2 } ] }
}
```

## 4. Từ vựng widget (intent → @ptdl) — bridge tới 28 plugin

`FieldSpec.widget` là **nhãn thân thiện** khớp binding của field-enhancements; compiler map nhãn→model
qua `getBindingsByField` + `modelLabel` (logic có sẵn trong `quickView.tsx`). Bảng gợi ý cho AI (P2) và cho
tác giả mẫu:

| intent / interface | widget @ptdl (nhãn) | plugin |
|---|---|---|
| số tiến độ / % | `Progress bar` | field-enhancements |
| điểm sao | `Star rating` | field-enhancements |
| số có đơn vị | `Number with unit` | field-enhancements |
| select màu dạng nút | `Button group` | field-enhancements |
| select → tag màu | `Value tag` | field-enhancements |
| quan hệ dropdown giàu (avatar/mô tả) | `Rich select` | field-enhancements |
| input có icon | `Input icon` | field-enhancements |
| ngày tương đối ("3 ngày trước") | `Relative date` | field-enhancements |
| trạng thái có luật chuyển | `Status flow` (interface `statusFlow`) | status-flow |
| cột tính công thức | (P4 — cần expression) | formula |

Block trang: `TableBlockModel` (cơ bản) · `EnhancedTableBlockModel` (dòng tổng + card responsive).
Widget thiếu/không khớp → compiler cảnh báo trong `dryRun`, fallback về renderer mặc định (an toàn).

## 4b. Bản đồ plugin → App-Spec + tinh chỉnh (checkpoint user 2026-07-17)

User chốt tầm nhìn: **app-builder là bộ ĐIỀU PHỐI, ghép các plugin @ptdl có sẵn — KHÔNG tự chế lại.**
Input = **mô tả bằng từ HOẶC bằng tài liệu**. Mỗi thứ user nêu đều có chỗ trong IR:

| User mô tả / muốn | App-Spec construct | Plugin thực thi | Tầng compiler |
|---|---|---|---|
| Mô tả bằng **từ** hoặc **tài liệu** (BRD/PDF/ảnh) | input → App-Spec | **ai-column** (đọc doc/PDF/ảnh) + LLM | P2 (AI) — xem 4b.1 |
| Bảng + trang **View/Edit/Add** | `PageSpec` | **instant-create-page** `createQuickPage` | client (đã chốt) |
| **Cột công thức** | `FieldSpec.computed{expression,kind}` | **formula** (computed column) | server/field — **first-class** (4b.2) |
| **Trạng thái có luật** | `FieldSpec.interface:'statusFlow'` + `states` | **status-flow** | server — field THẬT (4b.3) |
| **Bảng nâng cao / cột widget** | `PageSpec.block:'EnhancedTableBlockModel'` + `FieldSpec.widget` | **enhanced-table** + **field-enhancements** | client (đã có) |
| **Mẫu in HTML** | `templates[]` + record action Print | **print-template** | tầng MỚI (4b.4) |

→ **Kết luận: hướng plan ĐÚNG.** Ý chính (mô tả → App-Spec → compiler ghép plugin sẵn) đã là nguyên tắc nền.
Message của user làm rõ + nâng 4 điểm dưới:

**4b.1 — Input bằng tài liệu (P2, IR không đổi).** Ngoài ô mô tả NL, cho **upload tài liệu** (BRD .docx/.pdf,
ảnh chụp bảng, dán text). Đọc doc qua **ai-column** (đã có OCR/PDF/đọc ảnh) → rút yêu cầu → App-Spec. Tài liệu
chỉ là **đường vào khác** để tới cùng một App-Spec; compiler + IR **không đổi**.

**4b.2 — Cột computed = first-class (ĐÃ đưa vào IR 2026-07-17).** `FieldSpec.computed = {expression, kind}`
(`kind`: `display`=cột ảo tính mỗi lần render / `stored`=cột thật recompute khi ghi). Compiler tầng **formula**
wire qua @ptdl/plugin-formula. *(Trước đây để P4 — nay nâng lên theo yêu cầu user. Validate đã có: computed
thiếu expression → lỗi. Cấu hình field-option chính xác của plugin-formula sẽ đọc từ source khi dựng tầng này.)*

**4b.3 — status-flow = field THẬT, không phải select.** P0 tạm compile `statusFlow`→`select` để tầng
collection chạy trước. Tầng nâng cấp: `fieldDef('statusFlow')` sinh **field status-flow thật** (kèm states +
transitions mặc định tuần tự) — đọc field-def của plugin-status-flow. Xếp **sau** round-trip collections+pages.

**4b.4 — print-template = tầng template mới (nặng hơn, xếp sau).** print-template có **collection config
riêng + record action**. App-Spec thêm (sau) `templates[]` (tên, HTML/Handlebars, cột nguồn) + gắn **action
Print** vào PageSpec. Vì đụng config-collection của plugin đó nên làm **sau khi** round-trip lõi xong.

> **Nguyên tắc rủi ro (giữ nguyên):** mỗi plugin phải wire = một tầng cần **verify live** riêng. Thứ tự an toàn:
> **collections+pages round-trip TRƯỚC** (lõi), rồi mới lần lượt formula → status-flow → print-template. Không
> ghép tất cả cùng lúc để mỗi tầng còn cô lập được lỗi.

## 5. Compiler

### 5.1 Server tier — `appBuilder:apply` / `appBuilder:dryRun` (ACL loggedIn)
- **Collections**: cho mỗi `CollectionSpec` → `collections.create({values:{name,title,titleField,autoGenId:false,
  createdAt/updatedAt/createdBy/updatedBy:true, fields:[...systemFieldDefs(), ...fieldDefs]}, context:{}})`.
  `context:{}` = chạy hook migrate bảng. **`systemFieldDefs()`** = 5 field chuẩn (id bigInt autoinc PK +
  createdAt/updatedAt + createdBy/updatedBy belongsTo→users) push THẲNG vào `fields[]` — vì boolean flag chỉ
  tạo cột runtime, KHÔNG tạo metadata record (không hiện trong field manager, id không phải PK metadata → o2m
  `sourceKey:'id'` không resolve). Mirror NocoBase AI `defineCollections.js`. `autoGenId:false` vì id tường minh (v0.2.0, §15).
- **fieldDef(interface)**: map interface → NocoBase field def (`{name, type, interface, uiSchema:{title,...}}`).
  Grounded từ `gsheet-sync` `fieldDef` + `quickView` interface maps; `select` cần `uiSchema.enum` từ `options`.
- **Relations**: tạo **sau** khi cả 2 collection tồn tại. m2o→`belongsTo`, o2m→`hasMany`, o2o→`hasOne`,
  m2m→`belongsToMany` (+ through tự sinh). FK **snake_case** `fkOf(n)=${n}_id` (khớp field snake; đúng convention
  NocoBase UI `order_id`). Nhãn quan hệ = title collection target khi spec thiếu title. o2m auto tạo belongsTo
  ngược trên bảng con (`ensureReverseBelongsTo`, chung FK) — reverse-link điều hướng được (v0.2.0, §15).
- **Seed**: `db.getRepository(name).create({values})` sau khi bảng sẵn sàng; quan hệ trong seed resolve theo
  `titleField` của target (tra id).
- **dryRun**: chỉ validate (tên hợp lệ / trùng? interface hợp lệ? relation.target tồn tại trong spec hoặc DB?
  chu trình quan hệ? seed khoá lạ?), trả `{ok, errors[], warnings[]}`.

### 5.2 Client tier — materializer trang (tái dùng quickView.tsx)
- Sau khi server tạo bảng: `dataSourceManager.getDataSource('main').reload()` (hoặc refresh) để client thấy bảng mới.
- **Menu groups**: `routeRepository.createRoute({type:'group', title, icon})` → giữ `parentId` cho page dưới group.
- **Mỗi PageSpec**: gọi `createQuickPage(app, {collectionName, columns, title, icon, parentId, blockUse})` —
  đúng hàm instant-create-page. `popupColumns` cần mở rộng nhẹ builder để popup khác cột bảng (hiện popup =
  columns; thêm tham số `popupColumns` — thay đổi nhỏ, backward-compat).

### 5.3 Thứ tự + rollback
`apply` chạy tuần tự, ghi lại artifact đã tạo (collection names, route ids, model uids). Lỗi giữa chừng →
rollback ngược: `routeRepository.deleteRoute(id)` + `flowEngine.destroyModel(uid)` + (tuỳ chọn) drop collection.
Idempotent: nếu collection/route cùng tên đã tồn tại → skip hoặc báo lỗi rõ (không ghi đè mù).

## 6. Extractor — app thật → App-Spec (round-trip + tác giả hoá mẫu)
- **Collections**: `collections:list?appends=fields` → `CollectionSpec` (bỏ field hệ thống id/createdAt/…).
  interface field → `FieldSpec.interface`; `uiSchema.enum` → `options`; `titleField` từ collection option.
- **Relations**: field type belongsTo/hasMany/hasOne/belongsToMany → `RelationSpec` (bỏ FK column khỏi fields[]).
- **Widgets**: mỗi column model `stepParams.tableColumnSettings.model.use` → reverse-map model→nhãn (`modelLabel`).
- **Pages**: walk `flowModels` (RouteModel→RootPageModel→tabs→grid→TableBlockModel→columns) + `desktopRoutes`
  (group/flowPage/parentId) → `PageSpec[]` + `menu.groups`.
- **Seed**: (tuỳ chọn) lấy N dòng đầu mỗi collection → `seed[]` (ẩn danh nếu cần).

## 7. Round-trip verification (chốt P1)
Với mỗi app mẫu: `app gốc ──extract──▶ spec ──apply(app trắng)──▶ app mới`, rồi so:
- Số collection / field / quan hệ + đúng interface/type.
- Số trang + block type + cột.
- Materialize **0 lỗi** + mở được trang, thêm/sửa/xem record chạy.
Lệch → sửa compiler/extractor. Đây là bằng chứng "spec đủ để tái dựng app".

## 8. Bộ mẫu P1 (3 app — hand-build → extract)

| App | Collections (chính) | Khoe widget/plugin |
|---|---|---|
| **Bán hàng** | customers, products, orders, order_items | subtable-pro (dòng đơn), status-flow, enhanced-table, Progress bar |
| **Kho / tồn** | products, warehouses, stock_moves | formula scan-costing (FIFO/bình quân), Number with unit |
| **CRM** | contacts, companies, deals, activities | Rich select, Value tag, filter-tree, Status flow (deal stage) |

Mỗi mẫu kèm **2–3 mô tả NL** (khác độ dài/độ mơ hồ) — làm few-shot cho P2 + tài liệu.

## 9. Checklist P0 → P1 (nguồn sự thật tiến độ)

**P0 — Nền**
- [x] Scaffold `@ptdl/plugin-app-builder` (package.json + entries client-v2/client/server/locale + recipe). *(2026-07-17)*
- [x] `src/shared/appSpec.ts` — types App-Spec (mục 3) + `FieldInterface` + `validateAppSpec` thuần (không cần app).
  **Test offline 15/15 pass** (nhận ví dụ chuẩn Bán hàng + bắt 10 lớp lỗi: interface lạ, trùng field/collection,
  select thiếu options, statusFlow thiếu states, titleField/quan hệ/cột trỏ sai…). Cho phép `SYSTEM_FIELDS`
  (id/createdAt/updatedAt) làm titleField/cột.
- [x] `fieldDef(interface)` map (server `plugin.ts`) — grounded từ gsheet-sync + quickView; **chờ verify live**.
- [x] Server action `appBuilder:dryRun` (validate thuần + live-check trùng tên collection, ACL loggedIn) — **chờ deploy**.
- [ ] Client `dryRun` phần trang (resolve interface→model + widget label vs binding).
- [ ] Extractor `extractApp(app) → AppSpec` (collections + relations + pages + widgets).

**P1 — Round-trip**
- [x] Server action `appBuilder:apply` — **collections + fields + relations + seed + rollback XONG & VERIFY LIVE**.
  Test 1 (collections): 15/15 — tạo collection + field select-enum + **insert record (bảng đã migrate)** + cleanup.
  Test 2 (relations+seed): 14/14 — 3 collection, m2o (`customerId`) + cặp m2o/o2m **chung FK `orderId`** + seed
  **m2o resolve theo titleField** (DH001→"KH A") + FK linking + o2m reverse + cleanup. *(2026-07-17)*
- [x] Deploy nb-local (recipe + add-markers + node_modules/@ptdl + INSERT applicationPlugins id 113 + pm2 restart);
  boot 200, `appBuilder:dryRun/apply` = 401 unauth (đã đăng ký), `appBuilder:bogus` = 404, client-v2 bundle 200.
- [x] **Client materializer XONG & VERIFY LIVE trong browser** (`materialize.tsx` `buildApp`/`materializeApp`):
  reload dataSource → tạo menu group → mỗi trang qua `createQuickPage` (copy sang app-builder + thêm `popupColumns`
  + thread `FieldSpec.widget`→cột). Launcher UI "🛠 Dựng app" (client-v2, textarea spec + Validate + Create) +
  `window.__ptdlAppBuilder`. **Demo "Bán hàng" tạo thật**: 4 collection + 4 quan hệ + 9 seed → 2 group + 3 trang.
  Verify DOM: trang Đơn hàng 3 dòng, cột quan hệ hiện TÊN khách (không phải id), **3 Progress bar** (field-enh
  widget), nhãn tiếng Việt, EnhancedTable; trang Khách hàng 3 dòng; **popup Add mở drawer đúng field** (Tên/ĐT/Hạng
  + Submit). *(2026-07-17)*
- [ ] Extractor `extractApp(app) → AppSpec`.
- [ ] Hand-build 3 app mẫu (mới có Bán hàng) → extract → lưu golden spec (`src/samples/*.json`).
- [ ] Round-trip: extract → apply lại → verify khớp. (Chiều thuận spec→app đã xong; còn chiều app→spec.)

> **Gotcha browser test (2026-07-17):** click qua computer-tool/`el.click()` KHÔNG mở popup NocoBase (React cần
> chuỗi event đầy đủ). Mở popup trong test = dispatch `pointerdown/mousedown/pointerup/mouseup/click` (MouseEvent
> bubbles). Screenshot vẫn timeout → verify bằng DOM query (`.ant-table-tbody tr`, `.ant-progress`, `.ant-drawer-open`).
>
> **BUG đã vá — quan hệ to-many trong popup (2026-07-17):** o2m/m2m (hasMany) trong Details/Form KHÔNG có default
> binding scalar → resolver rơi về interface-map `DisplayTextFieldModel` → **CRASH "Cannot read properties of
> undefined (reading 'interface')"** (Render failed, DetailsItemModel). Fix trong `quickView.tsx` `makeResolver`:
> khi `getDefaultBindingByField` không trả modelName, dùng **binding đầu tiên** của `getBindingsByField` TRƯỚC khi
> về interface-map (o2m details → `DisplaySubTableFieldModel` = sub-table lồng, o2m form → `RecordSelectFieldModel`).
> Verify live: popup View đơn hàng hiện đủ field + **sub-table "Dòng hàng" 2 dòng line-item**, hết Render failed.
>
> **Sub-table cho quan hệ to-many (2026-07-17, user chốt "dùng sub table chuẩn/pro"):** o2m/m2m trong FORM →
> `SubTableFieldModel` (inline editing, thêm dòng), DETAILS → `DisplaySubTableFieldModel`. Override trong
> `makeResolver` (to-many + form → SubTable trước default picker). `RelationSpec.widget:'Sub-table Pro'` →
> `PtdlSubtableProFieldModel`. **Cột sub-table KHÔNG tự sinh** → `buildSubTableColumns(kind)` dựng cột từ field
> của bảng target: **form** (`SubTableFieldModel`) → cột `SubTableColumnModel` (init tự tạo readPrettyField, field
> editable); **details** (`DisplaySubTableFieldModel`) → cột **`TableColumnModel`** (field display). **Loại field
> hệ thống + cột FK thô** (`orderId/productId`, lọc theo `foreignKey/otherKey` target + field không interface) +
> back-ref về cha. Verify: form Add **và** popup View đơn hàng đều có sub-table cột **Số lượng · Đơn giá · Sản phẩm**
> (form có nút thêm dòng; View hiện 2 line-item).
>
> **BUG fieldPath sub-table EDIT (2026-07-17, vá):** form Sửa mở ra sub-table hiện **dòng nhưng ô nhập TRỐNG**
> (không load qty/price của line item có sẵn). GỐC (agent truy source): cột `SubTableColumnModel` phải mang
> **`collectionName = <bảng CHA>` + `fieldPath = "<assoc>.<child>"`** (vd `ab_orders` + `items.qty`) — vì antd-Form
> `name` của ô = `column.context.fieldPath.split('.')` → `[assoc, rowIdx, child]`. App-builder cũ ghi
> `collectionName=<bảng con>` + `fieldPath="qty"` → ô bind vào `[rowIdx,'qty']` (gốc) trong khi data ở
> `['items',rowIdx,'qty']` → dòng hiện (getCurrentValue đọc `['items']`) nhưng ô rỗng. **Fix:** `buildSubTableColumns`
> nhận `assocName`, nhánh **form** → `{collectionName: parentColl, fieldPath: `${assocName}.${f.name}`}` + BỎ
> fieldSettings của leaf field (leaf ko phải CollectionFieldModel, delegate fieldPath cho cột); nhánh **details**
> giữ nguyên (render theo dataIndex). Verify LIVE: form Sửa DH-001 hiện đủ 2 dòng có **qty 1 · price 850000/320000 ·
> line_total (computed)**. **KHÔNG cần đổi subtable-pro** — fix generator vá cả `SubTableFieldModel` lẫn
> `PtdlSubtableProFieldModel` (đều render ô qua native `SubTableColumnModel`/`MemoCell`). Submit dùng
> `updateAssociationValues['items']` (native path) — đúng khi fieldPath đúng.

**P1b — Tầng plugin đặc thù (sau round-trip lõi — mỗi tầng verify live riêng, xem §4b)**
- [x] **formula computed** ✅ **XONG + VERIFY LIVE.** `FieldSpec.computed = {expression, kind}` → apply tạo (1) cột số
  thật (`x-read-pretty`) + (2) rule row trong `ptdlComputedRules` (`{dataSourceKey,collectionName,targetField,
  formula,runOn:'create,update,source',enabled,onError:'null'}`). Expr = **`data.<field>`** (sibling), `SUM(data.rel.f)`
  (rollup — tạo rule non-rollup trước). Rule afterSave tự attach hook + backfill. Demo: `ab_order_items.line_total =
  data.qty * data.price` → seed tự tính (850k…), hiện cột "Thành tiền" trong sub-table.
- [x] **status-flow** ✅ **XONG + VERIFY LIVE.** `fieldDef('statusFlow')` sinh field THẬT: `type:'string'`,
  `interface:'statusFlow'`, top-level `statusFlow{initial,kinds init/processing/success,transitions tuần tự,openFrom}` +
  `defaultValue` (fold vào options); slug VN (`slugify`). Field byte-identical field status-flow có sẵn; client render
  widget + dropdown lọc transition. **ĐÍNH CHÍNH chẩn đoán:** enforcement KHÔNG hỏng — **root MIỄN enforce theo thiết kế**
  (`status-flow/src/server/plugin.ts:75,115` `roles.includes('root')`→skip); test bằng root đọc nhầm thành "hỏng".
  **Fix THẬT (đã áp + verify):** hook `statusFlowFields` lọc field theo `f.options.interface` = undefined runtime cho
  field tạo qua fields-repo → thêm match `options.statusFlow.initial` (luôn có) → field app-builder giờ enforce. **Verify
  non-root** (X-Role admin/member): chuyển trái luật → **400** (msg VN "Transition X → Y is not allowed"), hợp luật → 200.
  Sửa **`@ptdl/plugin-status-flow`** (server hook), build+deploy nb-local. Seed KHÔNG set status (hook lock record mới về
  initial 'Nháp').
- [ ] **print-template**: App-Spec `templates[]` + gắn action Print vào PageSpec (đụng config-collection của plugin).

**P2 — AI + input tài liệu (đợt sau, ngoài P0→P1)**
- [ ] Input: ô mô tả NL **+ upload tài liệu** (BRD/PDF/ảnh) → đọc qua ai-column → App-Spec.
- [ ] Vòng LLM structuredOutput → App-Spec + retrieval few-shot mẫu gần nhất + validate/retry (compiler dryRun).
- [ ] Preview (ERD + danh sách trang) cho user duyệt trước khi apply.

> **Nhật ký:**
> - 2026-07-17a — P0 nền (scaffold + App-Spec IR + validator 15/15 offline). **Checkpoint user:** "điều phối plugin
>   sẵn" + input bằng tài liệu + computed first-class (đã vào IR) + status-flow/print-template là tầng đặc thù.
> - 2026-07-17b — **Deploy + toàn bộ TẦNG DỮ LIỆU SERVER xong & verify LIVE** (29 assertion pass: 15/15 collections
>   + 14/14 relations/seed). Chứng minh: tạo collection+field, insert record (bảng migrate thật), 4 loại quan hệ,
>   cặp m2o/o2m chung FK, seed resolve m2o theo titleField, rollback, cleanup. **PHASE KẾ = client page materializer**
>   (menu + N trang, reuse `createQuickPage`) — cần /v/ client nên verify qua browser/JS-context (`window.__nocobase_v2_app__`).
>   Rồi extractor → hand-build 3 mẫu → round-trip → tầng plugin đặc thù (P1b: formula/status-flow/print-template).

## 10. Rủi ro & gotcha (từ memory — đọc trước khi code)
- **`collections`/`fields` create phải qua repository + `context:{}`** để migrate bảng; **table-sync trễ 1 nhịp**
  → chờ/`sync({alter:true})` trước khi seed (xem gsheet-sync). Raw HTTP `collections:create` body **top-level**
  (không `{values}`) — nhưng ưu tiên đường server-repository.
- **`uid` KHÔNG export từ `@nocobase/flow-engine`** — dùng generator local 11-char (như quickView.tsx).
- **KHÔNG `saveGridLayout()` trước `pageModel.save()`** → 500. Route tạo TRƯỚC (flowPage tự tạo RouteModel@schemaUid).
- **Marker tgz**: recipe phải `add-markers.sh` đúng version tgz (client-v2 /v/) — nếu không, lane client-v2 không nạp.
- **SES trên server**: `new Function` trùng tên tham số throw; verify trên server thật (smoke Node không bắt).
- **Relation column hiển thị id**: cột phải trỏ field quan hệ BY NAME (`customer`), ẩn FK (`customer_id`) — đã xử lý trong quickView.
- **Headless /v/ render janky** nhưng JS context chạy: validate qua `window.__nocobase_v2_app__` (flowEngine/dataSourceManager/routeRepository).

## 12. Tool catalog — tách primitive để AI gọi từng bước (2026-07-17, DONE + verify)

`apply` (whole-spec) đã refactor thành **primitives** — mỗi bước dựng app là 1 hàm độc lập, idempotent — và **expose từng cái thành action riêng** để AI/script/UI gọi **từng bước** (thay vì 1 spec khổng lồ). `apply` giờ chỉ **orchestrate** các primitive (collections→relations→computed→seed). Cùng 1 engine, 2 mặt (spec compiler + tool-calling).

| Tool (action) | Args | Tầng | Việc |
|---|---|---|---|
| `appBuilder:createCollection` | `{name,title,titleField,fields[]}` | server | Tạo data model (collection + field) |
| `appBuilder:addField` | `{collection, field}` | server | Config data type (+ rule nếu computed) |
| `appBuilder:addRelation` | `{collection, relation}` | server | Quan hệ (m2o/o2m/o2o/m2m) |
| `appBuilder:addStatusFlow` | `{collection, field:{name,title,states}}` | server | Status flow (field THẬT) |
| `appBuilder:addComputed` | `{collection, field:{...,computed:{expression}}}` | server | Công thức (cột computed) |
| `appBuilder:seed` | `{collection, rows[]}` | server | Dữ liệu mẫu (m2o resolve theo titleField) |
| `appBuilder:describeApp` | `{prefix?}` | server | **Introspection** (AI "nhìn" state) |
| `appBuilder:dryRun` / `apply` | `{spec}` | server | Validate / dựng cả app |
| client: `createMenuGroup` / `createPage` | — | client | Dựng giao diện (flowEngine) |

**Client:** `window.__ptdlAppBuilder` = `{...tools, tools, callTool(name,args), toolNames, buildApp, samples, validateAppSpec}` — data-tier tool gọi server action, page-tier tool chạy flowEngine. `callTool` = dispatcher chung (nền cho Claude tool-use ở P2: mỗi primitive = 1 tool, `describeApp` = mắt, `validate` = kiểm).

**Verify: test step-by-step 15/15** (describeApp→createCollection→addField→addRelation[fk customerId]→addStatusFlow→addComputed→seed→describe→computed=200+relation live→cleanup). **TRAP:** `opSeed` trả key **`inserted`** (KHÔNG `rows` — top-level `rows` bị NocoBase list-unwrap nuốt sibling). Orphan `ptdlComputedRules` sau destroy collection (không cascade) → cần dọn khi re-apply.

## 13. "Tả là dựng" — AI sinh App-Spec bằng LLM của NocoBase (2026-07-17, DONE + verify)

Trực tiếp trên UI (giống nút "🛠 Dựng app"), dùng **LLM có sẵn của NocoBase** — KHÔNG cần cấu hình AI riêng:
- **Server** `appBuilder:aiGenerate({description})` → `getAiProvider(app)` (`app.pm.get('ai').aiManager` →
  `resolveModel` → `getLLMService` → `provider.invoke({messages, structuredOutput:{spec,explain}})`, inline nên
  app-builder tự chứa, không dep `@ptdl/shared`) → NL → App-Spec (chuỗi JSON) + **validate/retry ≤3** (nhét lỗi
  `validateAppSpec` lại cho model sửa). System prompt = shape App-Spec + từ vựng interface/widget/relation + quy
  tắc (name snake không dấu, title vi, titleField, seed). ACL loggedIn.
- **Launcher (client)** thêm mục **"✨ Sinh bằng AI"**: ô mô tả → gọi `aiGenerate` → điền spec vào editor JSON để
  **user xem lại** → "Tạo app" chạy `buildApp` (pipeline có sẵn). Không auto-build — luôn preview trước.
- **NocoBase AI**: nb-local có sẵn `llmServices` provider `google-genai` (Gemini). **Verify:** mô tả "quản lý dự
  án…" → spec HỢP LỆ trong ~7s (collections du_an+cong_viec, quan hệ m2o+o2m, field statusFlow [Mới/Đang làm/Xong],
  pages); launcher render đủ AI section.
- **Kế (nâng cấp)**: chuyển sang **tool-calling agentic** (LLM gọi trực tiếp bộ primitive §12 từng bước + `describeApp`
  làm mắt) để dựng tăng dần / sửa app có sẵn — thay cho one-shot NL→spec hiện tại.

## 14. Xoá/Sửa + rollback (2026-07-17, DONE + verify 11/11 + DB)

Hoàn thiện story "SỬA" (trước chỉ THÊM được) + độ tin cậy:
- **Tool xoá/đổi (server, ACL loggedIn):** `dropField {collection,field}` (xoá field + computed rule; CHẶN system
  field), `dropCollection {collection}` (xoá bảng + rules; CHẶN `CORE_COLLECTIONS` denylist — users/roles/collections/
  fields/flowModels/ptdl*…), `renameField {collection,field,title}` (đổi **tên hiển thị** uiSchema.title; KHÔNG đổi tên
  máy vì vỡ FK/page). Đã thêm vào `toolPlanSystemPrompt` + `KNOWN` set → **AI plan được xoá** (verify: "bỏ trường
  phone" → `[dropField(mod_test, phone)]`).
- **deleteApp (client) + rollback:** `deleteApp(app, {collections, pages, groups})` = xoá route trang + group
  (`routeRepository.deleteRoute` + `flowEngine.destroyModel`) + `dropCollection` (server) + `reloadDataSource`.
  Launcher track `lastArtifacts` sau buildApp/runPlan → nút danger **"🗑 Xoá app vừa tạo"**.
- **Verify:** dropField/guard system-field, renameField, dropCollection guard `users`, aiPlan-remove, dropCollection
  → **11/11**; deleteApp: DB xác nhận metadata + bảng vật lý XOÁ (route trang/group xoá). **TRAP:** repo destroy OK
  nhưng client `collections:get` trả cache cũ → phải `reloadDataSource` để UI cập nhật.

## 15. Chất lượng collection do AI dựng (v0.2.0, 2026-07-18, DONE + verify LIVE 18/18)

3 lỗi user phát hiện khi thử app AI dựng (app khách sạn) — đều ở **tầng server tạo collection/relation**, KHÔNG phải client:

1. **Thiếu 5 field hệ thống** (ID, Created At/By, Updated At/By) → collection trông "trần", và **link ngược (o2m) sai**.
   *Gốc:* boolean flag (`autoGenId/createdAt/…:true`) tạo cột **runtime** nhưng KHÔNG tạo `fields` **metadata record** → không hiện
   trong field manager, và `id` không phải PK metadata nên `belongsTo/hasMany targetKey/sourceKey:'id'` không resolve chuẩn.
   *Fix:* `systemFieldDefs()` push 5 field THẲNG vào `fields[]` (id bigInt autoinc PK — dùng bigInt thay snowflakeId để liền
   mạch seed/relation/computed; createdAt/updatedAt; createdBy/updatedBy belongsTo→users), `autoGenId:false`. **Mirror
   NocoBase AI `defineCollections.js`** (`node_modules/@nocobase/plugin-data-source-manager/.../tools/`), nó cũng push
   idField/createdAtField/… chứ không dựa flag. (gsheet-sync dùng flag-only + `HIDDEN_FIELD_NAMES` → cố tình ẩn; app-builder thì cần HIỆN.)
2. **FK camelCase `khach_hangId`** lệch với field snake_case. *Fix:* `fkOf(n)=${n}_id` cho MỌI relation user (m2o/o2o/o2m/m2m);
   `createdById/updatedById` GIỮ camelCase (tên hệ thống cố định của NocoBase). Khớp convention UI NocoBase (`order_id`).
3. **Nhãn quan hệ = tên máy snake thô** (`khach_hang`) vì AI thường quên `title` cho relation. *Fix:* `opAddRelation` default
   `uiSchema.title` = **title của collection TARGET** (unwrap `{{t()}}`) khi thiếu → m2o `khach`→"Khách hàng", o2m `dong`→"Dòng hàng";
   + 2 prompt (appSpec/toolPlan) thêm trường relation `title`.

**BONUS — reverse-link đúng nghĩa:** o2m khai ở bảng cha giờ **tự tạo belongsTo NGƯỢC** trên bảng con
(`ensureReverseBelongsTo`, chung FK `<parent>_id`, nhãn = title cha) → con **điều hướng + lưu** về cha (trước chỉ có FK int thô).
`opDropField` guard mở rộng: +createdBy/updatedBy/sort.

**Verify (test-fixes.mjs, master-detail qua `apply` thật):** 18/18 — 5 sys field mỗi coll · FK `khach_id`/`don_id` snake (0 leak
camelCase user-FK) · nhãn "Khách hàng"/"Dòng hàng"/"Đơn hàng" từ target-title (relation KHÔNG khai title) · belongsTo con auto ·
seed m2o resolve theo titleField · **e2e**: thêm dòng qua FK snake → `thanh_tien`=sl×gia · con.don resolve về cha · cha.dong (hasMany)
liệt kê con · **computed rollup** `tong`=SUM=150000. **App CŨ dựng trước fix giữ shape cũ → REBUILD để nhận fix (KHÔNG migrate
in-place — quá rủi ro trên bảng đã có data).** tgz `0.2.0` build+deploy nb-local, pm2 restart.

## Files
`packages/@ptdl/plugin-app-builder/` — `src/shared/{appSpec.ts, compiler.tsx, extractor.tsx}`,
`src/server/{index.ts, plugin.ts (actions apply/dryRun)}`, `src/client-v2/index.tsx` (launcher + settings),
`src/client/index.tsx` (no-op), `src/samples/*.json` (golden), `src/locale/{en-US,vi-VN}.json`.
Build: `build-env/recipes/run-app-builder-build.sh`.
