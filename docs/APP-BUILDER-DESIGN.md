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

## 16. Quick-create trên field quan hệ (v0.3.0, 2026-07-18, DONE + verify LIVE 8/8 + render + 6/6 hotel)

Field quan hệ m2o/o2o có nút **"＋ Thêm mới &lt;target&gt;"** ngay trên form — popup tạo nhanh **TÁI SỬ DỤNG** Add-form
của bảng đích qua **block template** (sửa 1 chỗ, đổi mọi nơi). User tự dựng mẫu → mình học theo.

**AI tự quyết (heuristic):** `RelationSpec.quickCreate?:bool`. Prompt: BẬT cho quan hệ tới thực thể tạo tại-chỗ
(khách hàng/liên hệ/nhà cung cấp), TẮT cho danh mục/master (sản phẩm/phòng/dịch vụ). Verify hotel: `booking.khach`
BẬT, `booking.phong` (danh mục) TẮT — đúng.

**Cơ chế (đảo ngược từ mẫu user + 2 subagent đọc source `@nocobase/plugin-ui-templates`):**
- Component = **`PtdlRichSelectFieldModel`** (@ptdl field-enhancements "Rich select"; fallback core `RecordSelectFieldModel`
  nếu chưa cài — check `engine.getModelClass('PtdlRichSelectFieldModel')`). 2 model này ĐỀU kế thừa flow `selectSettings`.
- Nút Add new = stepParam **`selectSettings.quickCreate = {quickCreate:'modalAdd'}`** trên field (recipe tối giản; KHÔNG cần
  đổi sang "Popup select"/RecordPicker như mẫu user — Dropdown/Rich + quickCreate là đủ). FormItem ghi `editItemSettings.model.use`
  để settings-UI nhất quán.
- Form trong popup = **`ReferenceBlockModel`** ở subKey **`grid`** của field, stepParams `referenceSettings.{target.targetUid,
  useTemplate.{templateUid,templateName,targetUid,mode:'reference'}}` + `resourceSettings.init.{dataSourceKey,collectionName}`.
  ReferenceBlockModel resolve target theo uid lúc render (không copy subtree).
- **Template** = REST `flowModelTemplates:create {name, targetUid, useModel:'CreateFormModel', type:'block', dataSourceKey,
  collectionName}`. `flowModelTemplateUsages` **TỰ tạo server-side** khi model chứa reference save (KHÔNG gọi tay, self-healing).

**Kiến trúc app-builder (2 file):**
- `materialize.tsx` `ensureQuickCreateTemplates(app,spec)`: TRƯỚC khi dựng trang, mỗi collection là target của 1 quan hệ
  quickCreate → dựng 1 **standalone CreateFormModel** (root, cột = popupColumns/columns của trang target) qua
  `createModelAsync({uid,...formBlock('CreateFormModel',...)})`+save, rồi `flowModelTemplates:create` → `{templateUid,targetUid,templateName}`.
  Map `quickCreateTemplates` truyền xuống `createPage`→`createQuickPage`.
- `quickView.tsx`: `createAddFormTemplate()` (dựng+đăng ký template); `buildCols` set `bc.quickCreate/quickCreateTarget/quickCreateTemplate`
  + đổi `formUse`→PtdlRichSelectFieldModel nếu có; `formBlock` khi quickCreate → field stepParams thêm selectSettings.quickCreate +
  `subModels.grid = referenceFormGrid(template)` (BlockGridModel→ReferenceBlockModel).
- `quickCreate` chỉ áp field m2o/o2o có formUse là RecordSelect/RichSelect. Template lỗi → field vẫn có nút (popup rỗng, fallback mềm).

**Verify:** app test 2-collection `materialize()` → **8/8 DB** (template đăng ký · target=CreateFormModel · field=PtdlRichSelect ·
quickCreate=modalAdd · grid→ReferenceBlockModel→đúng template · usage tự tạo) + **render**: mở form Đơn → field Khách (Rich select)
+ nút "Add new" → popup thứ 2 hiện **form Khách (Tên/ĐT) tái sử dụng**, 0 lỗi. Hotel `booking.khach` **6/6** (phong đúng KHÔNG bật). tgz 0.3.0 nb-local.

## 17. Tinh chỉnh view + lookup + menu sidebar (v0.3.1, 2026-07-18, verify 7/7 + chain + render)

3 phản hồi user trên app khách sạn:

1. **Field hệ thống KHÔNG hiện trong view.** 5 field cơ bản (id + created/updated at/by) **bắt buộc CÓ** trong bảng
   (v0.2.0) nhưng **gần như không bao giờ nên show** (user tự thêm nếu cần). Lỗi: `buildSubTableColumns` lọc SYS thiếu
   `createdBy`/`updatedBy` (là belongsTo CÓ interface → lọt qua) → sub-table hiện "Người tạo/Người cập nhật" lên đầu.
   Fix: thêm `createdBy`,`updatedBy` vào SYS set (quickView.tsx). Chỉ sub-table auto-build cột mới lọt; trang/popup dùng
   cột spec (AI không nêu field hệ thống). Verify: sub-table Chi tiết dịch vụ = [so_luong,don_gia,thanh_tien,dich_vu].

2. **Công thức LOOKUP** (đơn giá dòng con ← bảng config). plugin-formula ĐÃ hỗ trợ lookup qua belongsTo (`computed.ts:9`
   "field pulled through a belongsTo/hasOne") + mode `table` (bảng config rời). App-builder chỉ cần SINH biểu thức
   `data.<m2o>.<field>` — plugin tự resolve edge lookup (không cần config thêm). Thêm vào AI prompt + ComputedSpec doc.
   Hotel: `booking_dv.don_gia` = `data.dich_vu.don_gia` (tự điền khi chọn dịch vụ) → cascade `thanh_tien=so_luong*don_gia`.
   Verify live: chọn "Đưa đón sân bay"(350k)·SL 3 → don_gia=350k, thanh_tien=1.050.000. (Lookup = computed read-only;
   muốn sửa tay thì để field thường.)

3. **Menu = sidebar groups cho ALL, ít item top-menu** (user: "apply thư viện quản lý sidebar", "hạn chế phân trang menu chính").
   Nền (2 subagent đọc client-v2): shell = ProLayout `layout:mix, splitMenus` → route top-level (parentId null) = **menu
   NGANG trên**; con của item đang chọn = **sidebar trái**; nhiều top-level → header **overflow "…"** = "phân trang". Fix
   (Option B): **1 group top-level = tên app** (header 1 item) → dưới nó FLAT: mỗi spec-group = 1 **nhãn divider**
   (`@ptdl/plugin-menu-enhancements`: route `options.ptdlMenuKind='divider'` + `ptdlMenuStyle`, ghi thẳng lúc tạo route —
   patch render đọc options runtime) + các trang, tạo THEO THỨ TỰ để sort đúng. **TRAP: chỉ đánh divider trên group
   CHILDLESS** (patch strip `routes` → con biến mất). `createMenuGroup(app,label,icon,parentId,options)`; materializeApp
   Option B. Verify: 1 top-entry "Quản lý khách sạn" · sidebar Danh mục[divider]→3 trang→Vận hành[divider]→1 trang;
   "Danh mục" render non-clickable, trang clickable.
   **FALLBACK (v0.3.2):** detect `app.pm.get('@ptdl/plugin-menu-enhancements')` — CÓ plugin → divider (trên); KHÔNG có →
   **nested group** (Option A: sub-group THẬT dưới top + trang lồng TRONG sub-group → submenu sidebar gập được, native,
   không cần plugin). Nếu không fallback thì divider marker render thành item bấm-được-nhưng-rỗng. Verify: mock detection
   off → 5/5 (top + 2 sub-group thật KHÔNG có ptdlMenuKind + trang lồng trong) + render submenu Nhóm Một/Hai gập được.

tgz 0.3.2 nb-local. App khách sạn rebuild với cả 3.

## 18. AI đóng vai UI/UX designer (v0.4.0, 2026-07-18, verify live)

User hỏi "thứ tự cột hard-code hay để AI thiết kế?" → chốt: **quyết định UX để AI làm (đóng vai designer), heuristic cứng chỉ làm lưới an toàn**.

- **Persona prompt:** `appSpecSystemPrompt` mở đầu đổi thành "CHUYÊN GIA UI/UX kiêm kỹ sư dựng app" + block **THIẾT KẾ UI/UX**: (1) thứ tự cột theo luồng ĐỌC-NHẬP — định danh/quan hệ chính (chọn-trước, hay kéo lookup) ĐẦU → thuộc tính → status → computed CUỐI; (2) **BẢNG GỌN** `columns` 4-6 cột quan trọng, field phụ + sub-table → CHỈ `popupColumns`; (3) chọn widget theo ngữ nghĩa **KHÔNG lạm dụng** (tiền/số → không widget; "Input icon" chỉ cho field icon); (4) khai `subColumns` cho o2m. Cùng note gọn ở `toolPlanSystemPrompt`.
- **subColumns (AI kiểm soát sub-table):** `RelationSpec.subColumns?:string[]` → thread `createPage subColumnsOf` → `buildSubTableColumns(...,subColumns)`: nếu có → dùng ĐÚNG thứ tự AI (lọc field hợp lệ); nếu KHÔNG → `rank()` fallback (relation 0 → editable 1 → computed/x-read-pretty 2, stable sort).
- **Menu tolerance:** `materializeApp` chấp nhận cả 2 shape AI hay emit — group `{label|title, icon, pages?:[pageTitle]}` VÀ `page.menuGroup`; `menuOf(p)=p.menuGroup || groupOfPage.get(p.title)`. Prompt cũng nói rõ shape `menu.groups[{label,icon}]` + dùng `page.menuGroup`.
- **Verify (aiGenerate "đơn bán hàng" → build live):** AI thiết kế: table `don_hang` = [ma_don,khach_hang,ngay_dat,tong_tien,trang_thai] (chi_tiet ĐẨY sang popup), `subColumns` chi_tiet = [san_pham,don_gia,so_luong,thanh_tien] (san_pham/quan-hệ ĐẦU), quickCreate khách hàng, statusFlow+Value tag. Build: **override honored** (sub-table = subColumns, khác rank → chứng minh), table gọn, menu nhóm Bán hàng/Danh mục/Hệ thống. Widget misfire (AI gắn "Input icon" cho tiền) → thêm caution "không lạm dụng widget". tgz 0.4.0.

## 19. Snowflake ID + collection category (v0.4.3, 2026-07-18, DONE + verify LIVE)

2 improvements aligning app-builder-created collections with NocoBase's own "Create collection" UI/AI conventions and organizing the data-source panel:

1. **`id` → Snowflake ID (53-bit), matching core exactly.** `systemFieldDefs()`'s `id` field was `type:'bigInt', autoIncrement:true` (deliberately, per §15 note — "để liền mạch seed/relation/computed"). Re-grounded on NocoBase's own AI `defineCollections.js` `idField` (`node_modules/@nocobase/plugin-data-source-manager/.../tools/defineCollections.js`) AND the client-v2 `SnowflakeIdFieldInterface` (`@nocobase/client-v2/src/collection-manager/interfaces/snowflake-id.ts`, title "Snowflake ID (53-bit)") — BOTH use `type`/`interface:'snowflakeId'`, `autoIncrement:false`, `uiSchema` with `x-component-props:{stringMode:true,separator:'0.00',step:'1'}` + `x-validator:'integer'`. Copied that exact shape (kept `x-read-pretty:true` on top, consistent with the other 4 system fields). **Why safe:** `SnowflakeIdField.dataType` is still `DataTypes.BIGINT` (`@nocobase/database/lib/fields/snowflake-id-field.js`) — identical column type to the old `bigInt` — only the value SOURCE changes (a `beforeSave`/`beforeBulkCreate` hook calling `app.snowflakeIdGenerator.generate()`, a plain-number Twitter-snowflake-style id, epoch 2020-11-11) instead of a DB auto-increment sequence. `autoGenId:false` unchanged (id still supplied explicitly).
2. **Auto-assign a collection category** (data-source panel grouping). Mechanism (read from `@nocobase/plugin-data-source-main/dist/server/collections/{collectionCategories,collections}.js`): `collectionCategories` (`id` snowflakeId, `name`, `color`) is a plain system collection; `collections` carries a `belongsToMany` **`category`** (singular name despite being M2M) → `collectionCategories`, through `collectionCategory`, `sourceKey:'name'`/`otherKey:'categoryId'`/`targetKey:'id'` — the SAME field the built-in "Add collection" panel writes (`category:[categoryId,...]`, an array of EXISTING category ids; categories are global, no `dataSourceKey`). Implemented: `ensureCategory(name)` (find-or-create by name, idempotent, best-effort/never throws) + `opCreateCollection(c, categoryName?)` resolves the id and passes `category:[categoryId]` in the `collections.create` values (Sequelize's `updateAssociations` resolves scalar ids against EXISTING rows and links via the through table — verified, not a nested-create footgun). `apply` derives `categoryName` per collection = the `menuGroup` of that collection's FIRST `PageSpec` (`spec.pages`), else `spec.meta.name` (app display name) as a catch-all, else omitted. The granular `createCollection` action also accepts an optional `category` passthrough for direct/step-by-step callers.

**Verify (live, throwaway 3-collection app via `appBuilder:apply`, 2 pages in 2 different menuGroups + 1 collection with no page):**
- DB `fields`: `id` row for all 3 test collections → `type='snowflakeId'`, `interface='snowflakeId'`, options `autoIncrement:false,primaryKey:true`.
- DB data rows: seeded ids were large snowflake numbers (e.g. `376084912406528/...529/...530`), NOT sequential 1/2/3.
- Relation FK: `zztest_order.khach_id = 376084912406528` — exact match to the related `zztest_cust` row's snowflake id (m2o FK resolves fine against snowflake PKs).
- Computed: `thanh_tien` (`data.so_luong * data.don_gia`) = `200000` (2 × 100000) — computed columns unaffected.
- **Lookup** (separate 2-collection test, `zzlk_cust`/`zzlk_order`, no pages → category fell back to `meta.name` for both, confirming that branch too): cross-record m2o lookup `gia_lookup = data.khach.gia` resolved to `55000`, matching the related `zzlk_cust` row's `gia` — through a `khach_id` FK pointing at that row's snowflake id. Confirms `data.<m2o>.<field>` lookups (not just same-row computed) are unaffected.
- Category: `appBuilder:apply`'s own report showed `{name:'zztest_cust',category:'ZZ Danh muc'}`, `{name:'zztest_order',category:'ZZ Van hanh'}` (from each page's `menuGroup`), `{name:'zztest_nopage',category:'ZZ App Test'}` (fallback to `meta.name`, no page) — all 3 branches. DB confirmed 3 new `collectionCategories` rows + 3 `collectionCategory` join rows, each pointing at the right category. `collections:list?appends=category` (the same read-path the data-source panel uses) returned the fully-resolved `category:[{id,name,color}]` array for all 3.
- Cleanup: `appBuilder:dropCollection` ×3 + `collectionCategories:destroy` ×3 — DB re-check confirmed 0 leftover collections/fields/categories/join-rows/computed-rules/physical tables.

tgz `0.4.3` built + deployed nb-local (`pm2 restart index`, boot clean, `appBuilder:apply` 401-unauth/`appBuilder:bogus` 404 sanity-check before the live test).

## 20. `meta.title` display name + theme-proof section labels (app-builder 0.4.4 / menu-enhancements 0.4.17)

**Bug (user):** a generated app's TOP-menu label came out wrong — `"Quan Ly Ban Hang"` (titleized machine name, dấu lost) or raw `"project_management_pro"` — while EVERY collection/page title had correct Vietnamese diacritics. Live-DB proof (`desktopRoutes`): 2 of 3 apps had a machine-name top label; all sub-titles were fine.

**Root cause:** `meta` carried only `name`, so the AI treated it as a code identifier and slugified the display name (dropping dấu). Collections never hit this because their schema splits `name` (machine) + `title` (display) — the AI reliably fills a field literally called `title`. `titleizeMachineName` can de-underscore but CANNOT restore accents.

**Fix (v0.4.4):** give `meta` its own `title` (Vietnamese display, WITH dấu), mirroring collections. `AppSpec.meta = { name; title?; description?; locale? }`; `materializeApp` label = `meta.title || meta.name` (the machine-name titleize fallback fires only if BOTH are machine-ish). `appSpecSystemPrompt` now teaches `meta.title` (+ a "SOÁT KỸ dấu ở MỌI title" reminder for stray one-word slips like `"phòng"→"phong"`); the golden sample models it (`{ name:'ban_hang_demo', title:'Bán hàng (demo)' }`). The category catch-all also prefers `meta.title`.

**Theme-proof section labels (menu-enhancements 0.4.17):** sidebar group/divider labels rendered `color: theme.useToken().colorTextTertiary`, which returns the LIGHT algorithm's near-black `rgba(0,0,0,0.45)` in the menu subtree (antd tags it `ant-menu-light` even when a custom theme paints the sider dark) → invisible on a dark sider (user: "màu title chưa ăn"; a prior CSS-var attempt fell through to the same black). Fixed by INHERITING the menu slot's own themed colour (`color:'inherit'`, rule `currentColor`) + `opacity:0.62` for the muted look — theme-proof by construction; an explicit `style.color` still wins at full strength. Verified live: divider computed `rgb(250,244,250)` @ 0.62 opacity (was `rgba(0,0,0,0.45)`), matching sibling menu items.

**Existing apps:** patched their stored `desktopRoutes.title` in place via API — `"Quan Ly Ban Hang"→"Quản lý bán hàng"`, `"project_management_pro"→"Quản lý dự án"`, `"Lịch đặt phong"→"Lịch đặt phòng"` (verified live after restart).

## 21. Preview → refine → patch → dashboards (v0.4.5–0.5.0, 2026-07-18, verify LIVE)

- **v0.4.5 launcher edit-mode gate** — the floating 🛠 Build app / + Quick page launchers only render when the /v/ "UI editor" flag is ON (`useFlowSettingsEnabled` mirrors the framework reader: localStorage `NOCOBASE_V2_FLOW_SETTINGS_ENABLED` + its preference-change event), so they never clutter normal use.
- **v0.4.6 SpecPreview "Xem trước"** (`src/client-v2/SpecPreview.tsx`) — a Segmented [👁 Preview | JSON] tab renders the App-Spec visually, **deriving everything from the spec, skipping whatever isn't present**: stat chips + Vietnamese prose summary + an SVG ERD (one box/collection, arrows per relation) + menu tree + per-page Collapse (columns / popup / sub-table / actions) with a field-type icon per column and a hover Popover for configured fields (statusFlow flow diagram, computed formula, relation target, select options).
- **v0.4.7 patch/merge-apply** — `apply` is now an idempotent MERGE: an existing collection gets its MISSING fields added (not skipped) and reports `mergedFields`; seed runs only for newly-created collections; `materializeApp` reuses menu groups by title+parent and skips pages whose title already exists. Re-applying or pasting a spec into an existing app never duplicates.
- **v0.4.8 aiRefine** — while previewing a spec, chat an instruction; `appBuilder:aiRefine({spec, instruction})` returns the WHOLE modified spec (keep everything unrelated, structured-output + validate/retry ≤3) and re-fills the editor. Distinct from aiGenerate (new app) and aiPlan (modify a built app). ACL-allowed.
- **Page-builder refactor = option B (sync guard).** Both page-builders are deliberately shared-free; instead of merging into @ptdl/shared, `build-env/checks/quickview-sync.mjs` fails the build if the 10 byte-identical helpers diverge between app-builder/quickView.tsx and instant-create-page/quickView.tsx, or if any of 10 feature markers is missing from either. Wired into both recipes.

### v0.5.0 — Dashboard generation (Phase 3B)

Block/layout flowModel shapes were reverse-engineered from a hand-built dashboard (see the `reference_nocobase_v2_dashboard_blocks` memory). A dashboard is a normal flowPage whose BlockGridModel holds the widgets; the grid `layout` is `{version:2, rows:[{cells:[{items:[blockUid]}], sizes}]}` on a 24-col basis (24 = full width, 12+12 = two columns) — so every widget block is given an EXPLICIT `uid` that the layout references (same trick createQuickPage uses for tabs).

**`src/shared/dashboard.tsx` `createDashboard(app, DashboardSpec)`** — `DashboardSpec = { title, collection, icon?, widgets[] }`. Three widget kinds:
- **score** → `CustomHtmlBlockModel`: `chartSettings.configure.query` (a count/sum/avg measure, aliased) + `customHtmlSettings.code.code` = JS returning an HTML KPI card (coloured bg, Lucide icon via `helpers.icon`, value via `helpers.fmt`, optional `scale` + `unit` so a billion đồng reads "1.849 triệu đ").
- **chart** → `ChartBlockModel`: `configure.query` (measure + dimension, date dimension takes `format:'YYYY-MM'`) + `chart.option = { mode:'custom', builder, raw }` where `raw` is hand-written ECharts JS (`var data = ctx.data.objects; return {…}`) — line with an area gradient, bar with rounded caps, pie as a donut, each with a self-labelling `title.text`. Custom mode chosen because the builder default looks poor. Data keys: an un-aliased measure surfaces under its FIELD name, so `raw` reads `x.<field>`.
- **filter** → `FilterFormBlockModel` → `FilterFormGridModel` → one `FilterFormItemModel` per field (`fieldSettings.init` + `filterFormItemSettings.init.filterField` + `defaultTargetUid` → the first chart); date fields get a `DateTimeTzFilterFieldModel` sub-model.

**Server `aiDashboard({collection, description?})`** — introspects the collection's real fields (bucketed num / date / category), feeds them to the LLM (`getAiProvider`), and gets back a DashboardSpec via structured output; `validateDashboardSpec` forces the collection and drops any widget referencing an unknown field, retry ≤3. The prompt pairs `scale` with the right unit word.

**Launcher** — an edit-mode-only "📊 Dashboard" button opens a modal: a Select of user collections (system tables filtered out) + an optional focus hint → aiDashboard → createDashboard → a widget summary + clickable link. `window.__ptdlAppBuilder.{createDashboard, aiDashboard}` are also in the tool catalog. Bilingual (en+vi).

**Verified live** on the sales app: `aiDashboard('don_hang')` designed 3 KPI cards (28 đơn / 1.849 triệu đ / 66.048 ngàn đ) + a revenue-by-month line + orders-by-month bar + status pie + a 3-field filter; both charts drew real content and the page logged 0 console errors — parity with the hand-built dashboard.

## 22. Dashboard: chart-refine + relation/enum/filter correctness (v0.5.1–0.5.3, 2026-07-19, verify LIVE)

- **aiRefineChart (chat-edit ONE chart).** Server `appBuilder:aiRefineChart({chartUid, instruction})` loads the chart's flowModel, gives the AI the current `raw` + the data-key context (dimension/measure keys from the query), and rewrites the ECharts code — validate (`new Function` syntax check + must `return`) / retry ≤3 — then persists `option.raw` + `props.chart.optionRaw` (mode:custom) straight into the flowModel; the change shows on next page load. The launcher lists each generated chart with an inline "✏️ refine" input (createDashboard now returns the chart `uid↔widget` map). Charts also stay editable **manually** in NocoBase's own chart Configure panel, since every generated chart is `mode:custom` — the editor opens on our `raw`.
- **Refine an EXISTING chart (v0.5.5).** aiRefineChart only reachable right after generating was too narrow, so `appBuilder:listCharts` scans `flowModels` for every `ChartBlockModel` (SQL `LIKE '%ChartBlockModel%'`, parse options → `{uid, title (from raw's `title.text` or measure/dim), chartType, collection}`) and the 📊 Dashboard modal grows a "✏️ Edit an existing chart with AI" picker: load charts → pick one → describe → aiRefineChart. Works on ANY chart in the app, including hand-built ones (converts a `mode:basic` chart to custom on first refine).
- **Relation dimensions.** A chart grouped on a m2o field by its bare name is a 400 "Invalid SQL column". `resolveDimension` detects a relation (`collection.getField(dim).target`) and groups by the target's title field, so the query dimension becomes `[rel, titleField]` and the result-row key is the DOTTED `rel.titleField` — the raw must read it with bracket notation (`x['khach_hang.ho_ten']`, not `x.khach_hang`). Fallback: the FK column `<rel>_id`. So "revenue by customer" works.
- **Enum labels.** For a scalar dimension that is a select/choice field, `enumLabels(field)` reads its `uiSchema.enum` value→label map and the raw maps the stored slug to its label on the category axis (statusFlow, whose states live in `options.statusFlow` not `uiSchema.enum`, still shows slugs — a known gap).
- **Filter value-pickers.** Every `FilterFormItemModel` MUST carry a `subModels.field` or it renders label-only (the block reads `item.subModels.field.context.collectionField`). Resolve it the way the native "add filter field" does — `FilterFormItemModel.getDefaultBindingByField(engine.context, collectionField)` → `{use: modelName, props: defaultProps}` (association → `FilterFormRecordSelectFieldModel`); fallbacks: date interfaces → `DateTimeTzFilterFieldModel`, everything else → base `FilterFormFieldModel` (renders a select with the enum options). The earlier code only added a field model for dates, so select/status/text filters were empty.

## Files
`packages/@ptdl/plugin-app-builder/` — `src/shared/{appSpec.ts, compiler.tsx, extractor.tsx, materialize.tsx, quickView.tsx, dashboard.tsx}`,
`src/server/{index.ts, plugin.ts (actions apply/dryRun/ai*/dashboard)}`, `src/client-v2/{index.tsx (launcher + Build app + 📊 Dashboard), SpecPreview.tsx}`,
`src/client/index.tsx` (no-op), `src/samples/*.json` (golden), `src/locale/{en-US,vi-VN}.json`.
Build: `build-env/recipes/run-app-builder-build.sh` (runs `build-env/checks/quickview-sync.mjs` first).
