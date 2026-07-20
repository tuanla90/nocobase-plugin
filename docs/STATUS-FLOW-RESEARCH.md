# Nghiên cứu: @tuanla90/plugin-status-flow — column type "Status Flow" (state machine field)

> Ngày nghiên cứu: 2026-07-10, trên NocoBase 2.1.19 (nb-local). Mục tiêu: thay thế việc user
> phải config tay 1 collection riêng (tên trạng thái / loại / trạng thái chuyển đến / role được
> chuyển + graph) bằng 1 field type mới cấu hình ngay trong Collection Manager.

## Kết luận khả thi

**Làm được trọn vẹn, KHÔNG cần custom DB field type.** Cột lưu dạng `string` (type có sẵn),
toàn bộ metadata state machine nằm trong cột JSON `options` của bảng `fields` (magic attribute —
mọi key lạ ghi vào field config đều tự đọng vào `options`, không cần migration). Server chỉ cần
1 hook enforcement. Đây sẽ là plugin @tuanla90 **đầu tiên có server lane thật** (các plugin trước
đều client-only).

## 1. Data model

Field record (bảng `fields`, cột `options` JSON):

```jsonc
{
  "interface": "statusFlow",
  "type": "string",
  "uiSchema": {
    "type": "string",
    "x-component": "Select",
    // GIỮ enum chuẩn: lane classic render free (Select + Tag màu), filter operators enum dùng lại được
    "enum": [
      { "value": "cho_xac_nhan", "label": "Chờ xác nhận", "color": "orange" },
      { "value": "cho_san_xuat", "label": "Chờ sản xuất", "color": "blue" },
      { "value": "da_thanh_ly",  "label": "Đã thanh lý",  "color": "green" },
      { "value": "huy_don",      "label": "Hủy đơn",      "color": "red" }
    ]
  },
  // Phần riêng của plugin (tự đọng vào options nhờ magic attribute):
  "statusFlow": {
    "initial": "cho_xac_nhan",
    "kinds":   { "cho_xac_nhan": "init", "cho_san_xuat": "processing",
                 "da_thanh_ly": "success", "huy_don": "fail" },
    "transitions": {
      "cho_xac_nhan": { "to": ["cho_san_xuat", "da_xac_nhan", "huy_don"], "roles": ["ke_toan"] },
      "cho_san_xuat": { "to": ["cho_xac_nhan"], "roles": ["sale", "ke_toan"] }
      // trạng thái không có entry = trạng thái cuối (không chuyển đi đâu)
    }
  }
}
```

Quy ước: `roles` rỗng/thiếu = mọi role được chuyển; value hiện tại luôn được giữ trong dropdown
(không bị clear); `kind` (Khởi tạo/Đang xử lý/Thành công/Thất bại) chủ yếu để tô màu mặc định +
validate initial + semantics báo cáo sau này.

## 2. Đăng ký interface — HAI registry ĐỘC LẬP (bắt buộc cả 2 lane)

| Lane | Base class | Gọi đăng ký |
|---|---|---|
| classic `/admin` | `CollectionFieldInterface` từ `@nocobase/client` | `this.app.dataSourceManager.addFieldInterfaces([X])` |
| `/v/` | `CollectionFieldInterface` từ `@nocobase/client-v2` | `this.app.addFieldInterfaces([X])` (Application.tsx:196) |

Mẫu chuẩn: `@nocobase/plugin-field-sequence` ship 2 build client riêng (`dist/client` +
`dist/client-v2`), mỗi bên 1 interface class. Thuộc tính interface: `name, group('choices'),
title, default:{type:'string', uiSchema}, availableTypes:['string'], hasDefaultValue,
filterable:{operators:'enumType'}, properties / configure`.

**Form config (nơi thay thế bảng config tay):**
- v2: `configure = { items: [...] }`, mỗi item có `component: 'Input'|'Checkbox'|...` (tên chuẩn
  trong `client-v2/src/collection-manager/field-configure.ts`) **hoặc `Component: ReactComponent`
  thật** → ta truyền `Component: StatusFlowConfigEditor` (editor tự viết). Sequence v2 làm đúng
  kiểu này (`Component: F` cho "Sequence rules"). `hidden` có thể là predicate `(e)=>...`.
- classic: `properties` formily; có thể inline React component thẳng vào `x-component`, hoặc
  đăng ký named component qua `this.app.use(Provider)` + `SchemaComponentOptions`.
- Editor enum chuẩn của select (tham khảo UI): `dataSource` trong
  `client-v2/src/collection-manager/interfaces/properties/index.ts:286` (ArrayTable
  value/label/color + SortHandle + Addition).
- Lấy danh sách role cho cột "Ai có quyền chuyển": API `roles:list?paginate=false&fields=name,title`.

## 3. Render + filter option (client)

### Lane /v/ (chính)
- **Editable**: `StatusFlowFieldModel extends SelectFieldModel`
  (`client-v2/src/flow/models/fields/SelectFieldModel.tsx`). Options vào model qua
  `props.options` (host FormItemModel/TableColumnModel gọi
  `subModel.setProps(collectionField.getComponentProps())` → `uiSchema.enum`).
  Trước khi render, filter:
  ```ts
  const current = this.props.value ?? this.context.record?.[fieldName];
  const roleNames = this.context.user?.roles?.map(r => r.name) ?? [];   // + this.context.role
  const rule = statusFlow.transitions[current];
  const allowed = (!rule) ? [] : (roleOk(rule.roles, roleNames) ? rule.to : []);
  options = enum.filter(o => o.value === current || allowed.includes(o.value));
  ```
  Record đang edit: `this.context.record`; sibling form values:
  `this.context.blockModel?.form?.getFieldsValue(true)`. User/roles client-side:
  `this.context.user.roles` (flow-engine global context, flowContext.ts:3435) hoặc hook
  `useCurrentRoles()` từ `@nocobase/client-v2`. LƯU Ý union role: `this.context.role` có thể là
  array khi role active là `__union__`.
- **Display**: `DisplayEnumFieldModel` (Tag màu theo `color` của enum option) đã đủ — chỉ cần
  bind, thường không phải subclass. Cell bảng /v/ đi qua `TableColumnModel extends
  DisplayItemModel` → binding display quyết định render cell.
- **Bind** (top-level module, giống core):
  ```ts
  EditableItemModel.bindModelToInterface('StatusFlowFieldModel', ['statusFlow'], { isDefault:true });
  DisplayItemModel.bindModelToInterface('DisplayEnumFieldModel', ['statusFlow'], { isDefault:true });
  FilterableItemModel.bindModelToInterface('SelectFieldModel', ['statusFlow'], { isDefault:true });
  // + this.app.flowEngine.registerModels({ StatusFlowFieldModel })
  ```
  Bindings kế thừa theo class hierarchy (đã biết từ vụ bulk edit) → tự ăn vào form, quick edit,
  details, table column, và cả Bulk edit (BulkEditFormItemModel → FormItemModel).

### Lane classic /admin
- `default.uiSchema = { x-component: 'Select', enum }` → editable Select + read-pretty
  `Select.ReadPretty` **Tag màu FREE, zero code** (fieldNames mặc định có `color`).
- Filter theo transition ở classic cần custom x-component (useCurrentRoles + useForm). **V1 bỏ
  qua** — classic hiện đủ dropdown, sai transition đã có server chặn. (User làm việc chủ yếu /v/.)

## 4. Server enforcement (điểm ăn tiền — client chỉ là UX, server mới là luật)

```ts
// dist/server — plugin server lane
import { Plugin } from '@nocobase/server';
import { ValidationError } from '@nocobase/database';

db.on('beforeUpdate', async (model, options) => {
  const collection = db.getCollection(model.constructor.name);
  for (const field of collection?.getFields() ?? []) {
    if (field.options.interface !== 'statusFlow') continue;
    const name = field.name;
    if (!model.changed(name)) continue;
    const from = model.previous(name), to = model.get(name);
    const flow = field.options.statusFlow || {};
    const rule = (flow.transitions || {})[from];
    const ctx = options.context;                       // Koa ctx — do proxy-to-repository gắn vào
    if (!ctx) continue;                                // internal update (workflow/script) → cho qua (policy)
    const roles = ctx.state?.currentRoles || [ctx.state?.currentRole].filter(Boolean);
    if (!rule || !rule.to?.includes(to))
      throw new ValidationError(`Không thể chuyển "${from}" → "${to}"`);
    if (rule.roles?.length && !roles.some(r => rule.roles.includes(r)))
      throw new ValidationError(`Role của bạn không được phép chuyển "${from}" → "${to}"`);
  }
});
```

Facts đã verify trên source:
- Hook: `db.on('beforeUpdate', (model, options))` — Database re-emit mọi sequelize hook, cả dạng
  `<collection>.beforeUpdate` lẫn global (`database/lib/model-hook.js:84`). Giá trị cũ:
  `model.previous(name)`; có đổi không: `model.changed(name)`.
- Ai đang thao tác: action layer gắn `callObj.context = ctx`
  (`actions/lib/actions/proxy-to-repository.js:49`) → trong hook đọc
  `options.context.state.currentRole` (string) / `currentRoles` (array, union mode) /
  `currentUser` (set bởi `plugin-acl/.../setCurrentRole.js`).
- **Bulk edit ĐI QUA hook này từng dòng**: server plugin bulk-edit RỖNG, client gọi action
  `:update` chuẩn → `repository.update` load từng instance rồi `instance.update(values, options)`
  (`repository.js:508-570`, `update-associations.js:86`). Chỉ đường
  `individualHooks:false` (raw bulk UPDATE) mới né — chặn thêm bằng `beforeBulkUpdate` guard
  (từ chối khi values đụng field statusFlow).
- Lỗi: `throw new ValidationError(...)` (export từ `@nocobase/database`) → client nhận 400
  message đọc được (pattern y hệt plugin-field-sequence `sequence-field.js:381`).
- Bonus create: `db.on('beforeCreate')` — nếu field statusFlow chưa có giá trị → set
  `flow.initial`; nếu có giá trị mà không phải kind init → reject (tuỳ chọn).
- Đọc config trong hook: `collection.getField(name).options.statusFlow` (mọi key lạ của field
  config nằm trong cột `options` JSON của bảng `fields` — `plugin-data-source-main/.../fields.js:98`).

## 5. Cấu trúc plugin đề xuất

```
packages/@tuanla90/plugin-status-flow/
  client.js  client-v2.js  server.js          # marker (BẪY staging build!)
  src/
    shared/
      types.ts                 # StatusFlowConfig, resolveAllowedNext(config, current, roles)
      StatusFlowConfigEditor.tsx  # editor React dùng chung 2 lane: bảng trạng thái
                               # (label/value/color(ColorPicker chuẩn COLOR_PRESETS)/kind/
                               #  next-statuses multiselect/roles multiselect) + preview graph
      statusFlowFieldModel.ts  # defineStatusFlowFieldModel(SelectFieldModelBase) — nếu cần dùng chung
    client/index.tsx           # interface classic + dataSourceManager.addFieldInterfaces
    client-v2/index.tsx        # interface v2 (configure.items + Component) + registerModels + bind
    server/index.ts            # Plugin server: beforeUpdate + beforeBulkUpdate + beforeCreate
    locale/en-US.json  zh-CN.json
```

Build: theo recipe mẫu run-formula-build.sh (stub @nocobase/client, client-v2, flow-engine,
server, database, actions...). **Server lane cần stub `@nocobase/server` + `@nocobase/database`**
(external, runtime có sẵn trong nb-local). Deploy: extract tgz thẳng (không strip), 2 chỗ
node_modules + storage/plugins, row applicationPlugins enabled=1, restart pm2.

## 6. Lộ trình

> Cập nhật 2026-07-13: **✅ HOÀN THIỆN**, đã build vào `latest/@tuanla90/plugin-status-flow-0.1.0.tgz`,
> chạy nb-local, user test UI OK. Editable + View là 2 model độc lập (mỗi bên đủ kiểu hiển thị +
> size + colorful/mono-chọn-màu + icon + preview trạng-thái-giữa), dialog i18n VI + icon toggle
> lucide + helper schema dùng chung. Tích hợp change-log qua bridge (history popover + source header).
> Roadmap workspace tổng xem `docs/PLAN.md`.

- **V1 — ✅ XONG**: interface 2 lane + config editor + StatusFlowFieldModel filter option theo
  current+role + display Tag màu + server enforcement (update/bulk/create-initial, lỗi 400 sạch
  qua `StatusTransitionError` — KHÔNG dùng ValidationError, xem bẫy trong memory).
- **V2 — đã làm vượt kế hoạch**:
  - ✅ Graph preview SVG trong config editor (BFS depth layout, edge bezier, tooltip roles).
  - ✅ Config editor card-per-status: drag-drop reorder, color popover 12 màu, Kind là nguồn
    initial duy nhất (auto-promote), wildcard `toAll` (✳ Any status) + `fromAll` (↩ from any).
  - ✅ 5 widget hiển thị editable: dropdown / pills / button group / steps / status bar kiểu
    Odoo + option Size (S/M/L) + Full width + Show graph — preview tương tác ngay trong dialog.
  - ✅ Icon cho từng trạng thái (RegistryIconPicker @tuanla90/shared, key lucide-*/antd) — hiện ở
    config editor, mọi widget editable, tag hiển thị (table/details), dropdown core, action
    "Status transition". Lưu vào `uiSchema.enum[].icon`. Cần `setIconRegistry(Icon, icons)` của
    @tuanla90/shared ở cả 2 lane (đã wire trong load()).
  - ✅ View/display cũng chọn được **kiểu widget** (Tag/Pills/Nhóm nút/Các bước/Thanh trạng thái —
    read-only, disabled) + Size, độc lập với editable (2 model riêng, không kế thừa nhau). Cả 2
    dialog settings (editable + display) đã dùng **icon toggle lucide** (component `IconToggle` trong
    statusFlowWidgets) + **i18n tiếng Việt** (`statusFlowI18n.ts`, stash `app.i18n`). Dialog đổi tên
    "Status flow options" → "Kiểu hiển thị".
  - ✅ Color mode `colorful | mono`: setting ở cả field editable (widgets) lẫn display (tag).
    mono = 1 màu trung tính (#8c8c8c) cho mọi trạng thái, nhấn mạnh bằng fill/weight (kiểu
    button group). Helper `statusHex`/`statusTagColor` trong types.ts. Default colorful (giữ
    nguyên hành vi cũ).
  - ✅ UX config editor: ô key không còn nuốt chữ (BufferedInput có buffer + validate viền đỏ,
    commit khi hợp lệ trên blur), ô label buffer tránh nhảy con trỏ, popover chọn màu tự đóng
    sau khi chọn.
  - ✅ Display extras (table/details): popover graph theo record + quick-transition tags "→ X".
  - ✅ Action riêng **Status transition** (dropdown kiểu ERPNext, scene='record', chọn field +
    confirm option) — icon qua registry `lucide-chevron-down`/`lucide-workflow` (ICON-ARCHITECTURE).
  - ✅ Khóa status trên create form (LockedInitialStatus) + defaultValue = initial.
  - ⬜ Lịch sử chuyển trạng thái (log ra collection phụ, hook afterUpdate) — chưa làm (đang brainstorm).
  - ✅ Classic lane filter option: `StatusFlowSelect` (connect + mapReadPretty) đăng ký qua
    `app.addComponents`, interface `x-component='StatusFlowSelect'` → form/table legacy Formily
    ở /admin lọc transition theo current+role (roles đọc từ `api.auth.role`), read-pretty giữ
    Tag màu. Flow-engine lane không đụng (bind theo interface name). Chỉ áp cho field TẠO MỚI
    sau khi deploy (field cũ giữ x-component 'Select' đã đóng băng). Cần test runtime trên
    localhost:13000.

## 7. Nguồn tham chiếu chính (nb-local/node_modules)

- `@nocobase/client-v2/src/collection-field-interface/{CollectionFieldInterface,CollectionFieldInterfaceManager}.ts`
- `@nocobase/client-v2/src/collection-manager/interfaces/select.ts` + `properties/index.ts:286` (enum editor)
- `@nocobase/client-v2/src/collection-manager/field-configure.ts` (configure.items / Component)
- `@nocobase/client-v2/src/flow/models/fields/{SelectFieldModel,DisplayEnumFieldModel}.tsx`
- `@nocobase/flow-engine/src/models/CollectionFieldModel.tsx:259` (bindModelToInterface)
- `@nocobase/flow-engine/src/flowContext.ts:3435` (context.user/role), `client-v2` `useCurrentRoles`
- `@nocobase/plugin-field-sequence/dist/{client,client-v2,server}` (mẫu plugin field 3 lane hoàn chỉnh)
- `@nocobase/database/lib/{model-hook.js,repository.js,update-associations.js,fields/field.js}`
- `@nocobase/actions/lib/actions/proxy-to-repository.js:49` (options.context = ctx)
- `@nocobase/plugin-acl/dist/server/middlewares/setCurrentRole.js` (ctx.state.currentRole/currentRoles)
