# PLAN — Plugin NocoBase dự tính làm

> Scope chuẩn: `@ptdl/plugin-<name>`. Target NocoBase **2.1.19**. Build qua `build-env/` (xem `build-env/BUILD.md`).
> Version khởi điểm mỗi plugin: `0.1.0`. Cập nhật: 2026-07-09.

> **⭐ Chiến lược "snippet-first" (đúc kết 2026-07-09):** RunJS snippet (dán tay vào JS Column / JS Field / JS editable
> field) đang giải quyết **kha khá nhu cầu thật** với chi phí gần bằng 0 (không build, không cài, không restart, sửa
> config trực tiếp). Nhiều mục dưới đây (#3, #8, #9, #11) **đã có bản snippet dùng được ngay**, chỉ nâng lên "plugin
> thật" (đăng ký qua SchemaSettings, tự swap component) KHI cần dùng lặp nhiều nơi / cho user không rành code. → Ưu
> tiên: gom bộ snippet cho chắc trước, plugin hoá sau theo nhu cầu thực. Bộ snippet: `nocobase-plugins/snippets/`.

## Tổng quan

| # | Plugin | Package | Client | Server | Độ khó | Ưu tiên |
|---|--------|---------|:---:|:---:|:---:|:---:|
| 1 | Custom Header ✅ | `@ptdl/plugin-custom-header` | ✅ | ✅ | Thấp | Cao |
| 2 | Spreadsheet View | `@ptdl/plugin-spreadsheet-view` | ✅ | ⚠️ (bulk API) | **Cao** | Trung |
| 3 | Table Cell Display (RunJS) 🟢 snippet | `@ptdl/plugin-table-cell-display` | ✅ | – | Trung | Cao |
| 4 | Status Flow Column | `@ptdl/plugin-status-flow` | ✅ | ✅ | **Cao** | Cao |
| 5 | QR Scanner | `@ptdl/plugin-qr-scanner` | ✅ | – | Thấp–Trung | Trung |
| 6 | Default Value Expression | `@ptdl/plugin-default-value-expression` | ✅ | ⚠️ | Trung | Trung |
| 7 | Computed / Virtual Field | `@ptdl/plugin-computed-field` (+ core formula cho case đơn giản) | ✅ | ✅ | **Cao** | Cao |
| 8 | Rich Dropdown Picker (+ thống kê) 🟢 snippet | `@ptdl/plugin-rich-select` | ✅ | ⚠️ (count) | Trung | Trung |
| 9 | Input Prefix Icon 🟢 snippet | `@ptdl/plugin-input-icon` | ✅ | – | Thấp | Trung |
| 10 | Button Icon Picker | `@ptdl/plugin-button-icon` | ✅ | – | Thấp | Trung |
| 11 | Field Widgets (checkbox→toggle, multi-select→button) 🟢 snippet | `@ptdl/plugin-field-widgets` | ✅ | – | Thấp | Trung |
| 12 | Menu Sections (group title + divider) ✅ | `@ptdl/plugin-menu-sections` | ✅ | ✅(no-op) | Trung | – |
| 13 | Icon Remap (system icon → Lucide) ✅ | `@ptdl/plugin-icon-remap` | ✅ | ✅ | Trung | – |
| 14 | Menu Count Badge ✅ | `@ptdl/plugin-menu-badge` | ✅ | ✅(no-op) | Trung | – |
| 15 | **Field Enhancements** (gom snippet field #8+#9+#11 + display) ✅ snippet-lib | `@ptdl/plugin-field-enhancements` | ✅ | – | Trung | **Cao** |
| 16 | Filter Tree (AppSheet group-by block) 🔨 MVP | `@ptdl/plugin-filter-tree` | ✅ (v2 only) | ✅(no-op) | **Cao** | – |
| 17 | **Sub-table Pro** (widget hasMany 3 tầng: standalone → view/tổng → bridge nhận event từ table khác) ✅ v0.2.0 | `@ptdl/plugin-subtable-pro` | ✅ | – | Trung | Cao |

> **Chú thích trạng thái:** ✅ = plugin đã build+cài xong · 🟢 snippet = đã có bản RunJS dùng được ngay (chưa plugin hoá) · 🔨 = đang thiết kế/dựng.
>
> #17 Sub-table Pro: **SHIPPED v0.2.0** (2026-07-15) — v0 standalone + v1 view/tổng/stepper + v2 bridge (+ no-code publish action/rowClick, membership sync, tabbed config) đều xong & verified live. Thiết kế/trạng thái: `docs/SUBTABLE-PRO-DESIGN.md`; hướng dẫn: `packages/@ptdl/plugin-subtable-pro/README.md`. Còn lại: m2m through-qty, multi-device WS.

**Nhóm ICON (#1, #9, #10):** đều cần một component **`IconPicker` dùng chung** dựa trên registry của `@ptdl/plugin-custom-icons`. → **Làm IconPicker 1 lần** (đặt trong custom-icons hoặc 1 shared lib), 3 plugin kia tái dùng. Có thể gộp #9+#10 thành 1 plugin `@ptdl/plugin-ui-icons` nếu muốn gọn.

Thứ tự đề xuất: **1 → 9 → 10 → 11 → 8 → 3 → 7 → 6 → 5 → 4 → 2** (nhóm icon nhẹ + IconPicker chung làm sớm để #1/#9/#10 dùng lại). Lý do: #3 (RunJS cell) là hạ tầng cho #7-A (cột ảo hiển thị, gồm `NOW()-deadline`); core formula lo case nội bảng đơn giản; #2 nặng nhất để cuối. #7 làm dần A(client) → B(date-diff server) → C(rollup).

---

## 16. Filter Tree (AppSheet group-by block)
> **Trạng thái (2026-07-14): ✅ v0.3.4 LIVE — full vi-VN i18n.**
> - **i18n (0.3.4):** theo pattern custom-header/layout-containers. NS = `@ptdl/plugin-filter-tree/client`; `src/locale/vi-VN.json` (~90 key); `addResources('vi-VN', NS, viVN)` mỗi lane. **uiSchema** dùng `t(s)=tExpr(s,{ns})` (compile trong dialog). **Render + menu** (block-picker label/flow title/step title/placeholder/All/(empty)/preview…) dùng `rt(s)=app.i18n.t(s,{ns})` (chuỗi dịch sẵn — menu KHÔNG compile `{{t()}}` nên tránh tExpr ở đó). Fallback = English key (i18next). `i18nT` (no ns) vẫn dịch value/enum core `{{t("Admin")}}`.
> - **v0.3.3:** (1) **i18n value labels** — `cleanLabel` giờ dịch key `{{t("Admin")}}` qua `app.i18n.t` (inject `i18nT` trong registerFilterTree, app truyền từ client-v2), `labelFor` clean cả value raw (role built-in `{{t("Admin")}}`→"Quản trị viên"/fallback "Admin"). (2) **Aggregate field** nhận **số + ngày** (min/max trên date), nhãn gắn `· date`; hết "No data" khi collection không có cột số.
> - **v0.3.2 fixes:** (1) **tab style tự vẽ** (bỏ antd `<Tabs>` — bị plugin khác đè `.ant-tabs`; underline giờ theo `accentOf`/mono, hết leak). (2) **Reset** = icon `↺` LUÔN hiện, `disabled` khi không có filter (thay vì ẩn). (3) Preview thêm nút **↻ Chạy thử** (remount view → re-run group query). (4) **searchWidth** (px, blank=auto) + **searchLayout 4 vị trí** above/below/left/right (back-compat `inline`→`right`). Register thêm `InputNumber`.
> - **Live preview (0.3.1):** field void `ptdlPreview` (x-component `PtdlPreview`, prop `bar`) đặt TRÊN `ptdlTabs` ở uiSchema cả 2 block. `observer`+`useForm` → `normalizeCfg(form.values, bar)` → render **thật** `FilterBarView`/`FilterTreeView` với **model giả** (`{uid, context:{api:apiClient}}`, KHÔNG có filterManager → click = no-op an toàn, fetch count thật). Cập nhật realtime khi đổi settings. Bọc trong khung "Xem trước".
> - **UX v0.3.0:** count badge của tab/segmented đổi antd `Badge` (mặc định đỏ/hồng, bỏ qua style) → **span tự style** (xám nhẹ / accent). Thêm option (tab Search, dùng chung): **Show reset button** (nút "Đặt lại" xoá cả chọn nhóm + search, hiện khi đang lọc — `FilterSearchBox` giờ controlled để reset xoá được text) · **Hide empty group** (ẩn giá trị null/(empty)) · **(bar-only) Search position: Below / Inline** (chia 2 — search bên phải bar). Reset dùng `pushSearchFilter(model,'')` + `apply([])`.
> - **BUG GỐC đã tìm+vá (0.2.5):** `PtdlTabs` render tab bằng `RecursionField name={key} onlyRenderProperties` → **lồng value path dưới tên tab** (`form.values.tabGroup.collectionName`) thay vì phẳng → mọi picker/handler đọc tên phẳng = rỗng → group-by kẹt disabled, settings không lưu. Fix: render từng field bằng chính tên nó (`tabSchema.mapProperties(...RecursionField name={fieldKey})`). Chẩn bằng **dòng debug in `Object.keys(form.values)` ngay trong picker** (extension Chrome chưa nối, không login được). Chi tiết: memory [[nocobase-flow-settings-tab-nesting]]. `SettingsGrid` không dính (render qua `props.children`).
> - **Filter bar** = biến thể render NGANG 1 cấp của cùng engine (`fetchGroupRows` GROUP BY + `pushFilterMulti`). Block riêng `FilterBarBlockModel extends FilterBlockModel` → "Add block → Filter blocks → **Bar (filter)**". User chọn **kiểu**: `pill` (chip bo tròn như ảnh user) / `segmented` (antd Segmented) / `tab` (antd Tabs gạch chân); + size, align, ẩn/hiện "All" & số đếm, multi-select (chỉ pill). Dùng lại toàn bộ config pickers + scope builder + valueStyles.
> - **Search tích hợp (2026-07-14, CẢ tree + bar):** tab **Search** — bật/tắt (`showSearch`) + chọn field search (`searchFields`, Cascader multiple, dot-path) + placeholder. `FilterSearchBox` (debounce 300ms) đẩy `{$or:[{f:{$includes:q}}…]}` qua `pushSearchFilter` dưới **filter-group KHÁC** (`ptdl-search:uid`) nên **AND** với lựa chọn nhóm (`ptdl-tree:uid`) tại resource. Tree = search ở đầu; Bar = search dưới thanh. → thay được block "Filter form" trong ảnh user (tab danh mục + ô Tìm kiếm) bằng 1 block.
> - **DRY:** tách 3 tab settings dùng chung (`metricFormatProps`/`badgeStyleProps`/`dataScopeProps`/`searchProps`) + `normalizeCfg(params, bar?)` → cả 2 block dùng chung, không trôi lệch. Bar đọc cùng `props.ptdlTreeCfg`/`TreeCfg` (thêm `barStyle/barSize/barAlign/showCounts/showAllPill/barMultiSelect` + `showSearch/searchFields/searchPlaceholder`). Tree flow refactor onto helpers. `src/shared/filterTree.tsx` (`FilterBarView`/`FilterSearchBox`/`PtdlSearchFields`).
> - **Deploy (đã làm, LIVE):** extract `latest/@ptdl/plugin-filter-tree-0.2.6.tgz` vào **cả** `nb-local/node_modules/@ptdl/plugin-filter-tree` **và** `storage/plugins/...` (đè dist+markers) → `npx pm2 restart index` (từ nb-local) → F5 (hash `?hash=sha256(mtime+ver)` đổi → tự bust cache). Bundle client-v2 = 68.6 KB. Update plugin đã cài — KHÔNG đụng DB.
> - **CÒN LẠI:** block Filter tree cũ (config từ trước bug-fix) cần **mở lại settings → bật Show search box → Save** để `showSearch` lưu đúng (bản cũ lưu lồng nên =false); render tree search box vốn đúng (`FilterTreeView` đầu list).
>
> **Trạng thái (2026-07-09): 🔨 MVP 1 cấp single-select ĐÃ BUILD + CÀI (chỉ /v/) — CHỜ user test trong trình duyệt.**
>
> **Mục tiêu:** block filter kiểu AppSheet — nhóm collection theo 1 field thành cây (All + mỗi value + count), bấm value → lọc bảng/list đã connect.
>
> **Kỹ thuật (đã research, memory `nocobase-filter-block-architecture`):** `FilterTreeBlockModel extends FilterBlockModel`
> (resolve base runtime + `flowEngine.registerModels`) → tự hiện nhóm "Filter blocks" trong Add-block. `renderComponent()` vẽ cây;
> đếm nhóm 1 request qua `<collection>:query` GROUP BY (đã test order→status). `getFilterValue()` trả value chọn; connect bảng qua
> step core `{use:'connectFields'}`; click → `filterManager.refreshTargetsByFilter(uid)` → `addFilterGroup` vào resource bảng. `getDefaultOperator()='$eq'`.
> Config qua stepParams + handler setProps (client-only, an toàn). Classic /admin = no-op (block cổ điển ≠ FlowEngine).
>
> **CHỜ user test:** Add block → Filter blocks → **Tree (filter)** → settings chọn collection+field → Connect to data blocks (bảng cùng collection) → bấm node lọc bảng.
> **Chưa làm (phase sau):** nesting nhiều cấp + xổ/thu cây; icon+màu per value; live re-count khi data đổi; multi-select.

---

## 15. Field Enhancements (gom snippet field — Hybrid)
> **Trạng thái (2026-07-09): ✅ Phần (a) XONG — user XÁC NHẬN snippet hiện trong picker. Đang làm phần (b) widget no-code: SelectButtons trước.**
> - **BUG (a) đã vá:** `contexts` phải set tên MODEL (`JSEditableFieldModel`/`JSColumnModel`/`JSFieldModel`), KHÔNG phải
>   tên context class — editor lọc bằng `hostCtx.model.constructor.name`. Xem memory runjs-snippet-registry-native.
> - **Phần (b) — cơ chế (đã khảo sát):** field component = FieldModel bind qua `EditableItemModel.bindModelToInterface`.
>   Đăng ký widget mới = `flowEngine.registerModels({Model})` + `bindModelToInterface('Model',['select','multipleSelect'],{isDefault:false})`
>   → hiện trong settings "Field component" cho user chọn (no-code). Pattern chuẩn workspace: `@ptdl/plugin-conditional-format`
>   (`registerModels` + binder-search + `registerFlow`). `this.props` có sẵn options(enum)/value/onChange.
> - **(b1) SelectButtons widget — user XÁC NHẬN hiện + chạy (2026-07-09).** `PtdlSelectButtonsFieldModel extends FieldModel`
>   (client-v2 + client), render() vẽ dãy nút (override render() như SelectFieldModel core). Bind `['select','multipleSelect']`
>   isDefault:false → "Field component → Button group". `src/shared/selectButtonsModel.tsx`.
>   - **Config = 1 mục "Button group settings" mở DIALOG** (uiMode `{type:'dialog'}` + uiSchema hàm) — Layout/Color mode/
>     Mono color/Size/Font size/Radius/Gap/Allow deselect. Component custom qua `flowSettings.registerComponents` (prefix Ptdl*).
>   - **LIVE PREVIEW trong dialog** (`PtdlPreview` = `@formily/react` `observer`+`useForm` đọc `form.values`, giống RulePreview
>     condfmt) — bấm nút thử chọn (state cục bộ), đổi settings thấy ngay. `ButtonGroupView` tách dùng chung render & preview.
>   - Build: recipe thêm `mkstub @formily/react 2.3.7` (externalize như condfmt). Reactive render qua FlowModelRenderer observer.
>   - **Bố cục gọn (2026-07-09):** dialog 2 cột (`PtdlGrid` void component) — row1 [Layout|Color mode / Size|Allow deselect],
>     sliders 2 cột [Font size|Radius], `x-reactions` ẩn Mono color (trừ khi mono) + Gap (trừ khi separated).
>   - **DISPLAY "Single tag" (2026-07-13, CHỜ user test):** thêm setting **Display = Button group | Single tag**
>     (`ptdlDisplay`). Single tag = chỉ khi HIỂN THỊ (readPretty/detail/table, `!canEdit`) render GIÁ TRỊ ĐANG CHỌN
>     thành 1 tag màu filled (như pill của conditional-format; multi → nhiều tag; trống → gạch "—"); form edit vẫn là
>     nút để bấm. Reactions ẩn Layout/Allow deselect/Full width khi single. Preview có dòng "Hiển thị:" render tag thật.
>   - **ICON MAP (2026-07-09):** mỗi option 1 icon — `PtdlIconMap` (1 field, value={[optValue]:iconKey}, tự quản N picker
>     theo options qua x-component-props, tránh lỗi field-name Formily). Icon từ **registry custom-icons** (`Icon`+`icons`
>     truyền per-lane, consumer — KHÔNG CDN như RunJS). `RegistryIconPicker` rút gọn từ condfmt (luật hậu tố outlined/filled/twotone).
>     render() + preview vẽ icon trước label. Chi tiết: memory runjs-snippet-registry-native.
> - **(b2) InputIcon widget — ĐÃ BUILD + tráo dist (2026-07-09), CHỜ user test:** `PtdlInputIconFieldModel extends FieldModel`,
>   render antd Input (IME-safe port từ InputFieldModel — gõ tiếng Việt) với **prefix icon** (registry custom-icons) +
>   **placeholder** (Field title / Custom / None). Bind `['input','url','phone','email']` (string 1 dòng, đúng yêu cầu user).
>   Config dialog: Preview live + Icon + Icon color + Placeholder mode + Custom placeholder (reaction hiện khi mode=custom).
>   `src/shared/inputIconModel.tsx`. Icon-registry util tách chung `src/shared/iconRegistry.tsx` (setIconRegistry/IconByKey/
>   RegistryIconPicker) — dùng cho cả SelectButtons lẫn InputIcon.
>   - **Biến thể hình thức + tinh chỉnh (2026-07-09):** Background (Outlined/Filled/Borderless = antd `variant`), Corner radius
>     (Pill), **Icon style: None/Background/Divider** (chỉ style riêng PREFIX icon qua negative-margin, input GIỮ NGUYÊN border —
>     sửa sau khi user báo "chỉ style chỗ icon thôi"), Icon background (trống=auto theme dark/light, chọn=màu custom), icon size
>     = size chữ (`fontSize:'inherit'`), màu icon trống=màu chữ (`currentColor`), nút **Reset** (`form.setValues` overwrite DEFAULTS).
>     Bố cục dialog 2 cột (`II_Grid`). Helper `IconInput` dùng chung render + preview.
>   - **Interfaces bind (chuẩn theo core InputFieldModel + password):** `['input','email','phone','url','uuid','nanoid','password']`
>     (KHÔNG textarea=multiline). Field `password` → render `Input.Password` (case login-form icon khóa).
> - **(b3) Number with unit widget — ĐÃ BUILD + tráo dist (2026-07-09), CHỜ user test:** `PtdlNumberFieldModel extends FieldModel`,
>   render antd `InputNumber` (prefix icon/text `$`, `formatter`/`parser` phân tách nghìn, `precision` số thập phân, `addonAfter`
>   = đơn vị). Bind `['number','integer','percent']`. Config: Icon | Prefix text | Reset · Thousands | Decimals · **Unit mode
>   None/Fixed/Field** (Fixed = text cứng "USD"; Field = lấy value từ CỘT KHÁC của record qua `context.form.getFieldValue`/
>   `context.record` — v1 đọc lúc render, đổi cột khác có thể cần refresh). `src/shared/numberFieldModel.tsx`. Tham khảo ảnh
>   user `$ 1,000.00  USD`. readPretty hiển thị formatted + prefix + unit.
> - **(b3) Number with unit — ĐÃ SỬA (2026-07-09):** bỏ `precision` (antd bỏ qua khi có `formatter`), chặn thập phân ở
>   `parser` bằng `clampDecimals` (blur tự chuẩn về đúng số lẻ). Bỏ **Prefix text** (antd `InputNumber` không render prefix
>   text được) → thay bằng **Icon color**. Giữ icon prefix + unit addonAfter.
> - **(b3b) Star rating — ĐÃ BUILD + tráo dist (2026-07-09):** `PtdlStarFieldModel`, antd `Rate`. Bind `['number','integer']`.
>   Config: Max stars (3–10) | Color | Reset · Allow half | Show number. Editable = Rate bấm; readPretty = disabled.
>   `src/shared/starFieldModel.tsx`.
> - **(b3c) Progress bar — ĐÃ BUILD + tráo dist (2026-07-09):** `PtdlProgressFieldModel`, antd `Progress`. Bind
>   `['number','integer','percent']`. percent lưu 0–1 → hiển thị `value*100`; number → `value/max*100` (config **Full value
>   (100%)**, ẩn khi field percent). Config: Type line/circle/dashboard | Color | Reset · Show percent | Full value.
>   Editable = InputNumber (percent hiện `*100` addonAfter `%`, lưu `/100`) + thanh Progress; readPretty = chỉ thanh.
>   `src/shared/progressFieldModel.tsx`.
> - **Kế tiếp (b4):** RichSelect (#8, association field component — m2o/o2o/o2m/m2m, dropdown 2 dòng avatar+tên+chức vụ).
> - Cài: giải nén tgz → `nb-local/node_modules/@ptdl/plugin-field-enhancements` (tar `--force-local` vì path D:) + copy root
>   stubs client.js/client-v2.js/server.js (tgz KHÔNG chứa, nhưng runtime cần để Node resolve `@ptdl/.../client`) → INSERT
>   applicationPlugins id=94 (enabled=1,installed=1) khi app STOP → `pm2 restart index`. Bundle client-v2 phục vụ đủ 10 ref, pm:list enabled=true.
> - **User test:** hard refresh (Ctrl+Shift+R) → mở JS field/column → bảng chọn snippet của code editor phải hiện nhóm
>   `ptdl/field/*` đúng theo loại (form/bảng/display).
>
> **Quyết định (user chốt):** gom các snippet **liên quan tới field** vào **1 plugin duy nhất** (KHÔNG gom mọi plugin;
> các case nặng/khác dep như #2 spreadsheet, #4 status-flow, #5 QR, #7 computed vẫn TÁCH riêng). Kiểu ship = **Hybrid**:
> plugin làm nền chung + đăng ký snippet vào picker RunJS native NGAY (dùng được liền), rồi nâng dần vài cái giá trị cao
> thành widget no-code trong CÙNG plugin.
>
> **Cấu trúc:**
> ```
> @ptdl/plugin-field-enhancements
>  ├─ shared/    IconPicker (consumer @ptdl/plugin-custom-icons) · colorPreset antd 12 màu · ctxHelpers (form/table detect, association hydrate, api list)
>  ├─ snippets/  registerRunJSSnippet(...) — nhồi toàn bộ snippet field vào picker  ✅ làm trước, rẻ
>  └─ widgets/   field settings no-code — nâng dần: SelectButtons · RichSelect · InputIcon  ⏳ sau
> ```
>
> **Nền kỹ thuật đã xác minh (2026-07-09) — memory `runjs-snippet-registry-native`:**
> - API native `registerRunJSSnippet(ref, loader, {override})` + `listSnippetsForContext` + `getSnippetBody`, EXPORT từ
>   index chính `@nocobase/flow-engine`. Plugin client gọi lúc `load()`, KHÔNG cần tự dựng UI gallery.
> - `SnippetModule` = `{ contexts:[<ContextClassName string>|'*'], prefix, label, description, content:<code string>, locales?, scenes? }`.
> - Context để snippet hiện đúng chỗ (nhận STRING, không cần import class): `JSEditableFieldRunJSContext` (field form),
>   `JSColumnRunJSContext` (bảng), `JSFieldRunJSContext` (display/detail).
>
> **Snippet đưa vào (từ `nocobase-plugins/snippets/`):** input-icon-placeholder (#9), record-select-rich (#8),
> select-buttons + checkbox-toggle (#11), star, process-bar, avatar, tags, number-format, status-format, link.
> (formula ĐÃ tách riêng `@ptdl/plugin-formula` — dep formulajs nặng + hướng default-value server; KHÔNG gộp vào đây.)
>
> **Thứ tự dựng:** (a) scaffold plugin + `shared/` + đăng ký snippets (Hybrid phần snippet) → dùng ngay; (b) widget
> no-code đầu tiên = **SelectButtons** (#11, rủi ro thấp nhất) rồi InputIcon (#9, đã research) → RichSelect (#8).

---

## 14. Menu Count Badge
> **Trạng thái (2026-07-09): ✅ BUILD + CÀI xong v0.1.0 — CHỜ user test.**
>
> **Mục tiêu:** badge số lượng sống trên menu item trái (vd "12" đơn chờ). NocoBase CÓ badge native
> (`MenuItem` đọc `route.options.badge.count`) NHƯNG count là expression `useEvaluatedExpression` tính **1 lần/mount**
> (không poll, không phản ứng DB) và **không có UI** → tự làm badge riêng.
>
> **Kỹ thuật (client-only, patch `AdminLayoutMenuItemModel`):**
> - Settings step `ptdlMenuBadge` (sort 220) → bật badge + chọn collection + filter JSON + màu + interval; lưu
>   `route.options.ptdlBadge` (cột options JSON, KHÔNG đổi schema). updateMenuRoute có retry SQLITE_BUSY.
> - patch `render()` → append `<MenuBadge>` (fetch `<collection>:list?pageSize=1` → `meta.count`; KHÔNG có action `:count`).
>   Bỏ qua item đã là divider/groupLabel của menu-sections.
> - **Auto-update 3 kiểu:** (1) poll mỗi `interval` giây (mặc định 45), (2) refresh khi focus tab, (3) tức thì khi
>   CHÍNH browser này mutate collection đó — 1 axios response interceptor bắt action create/update/destroy… → notify badge.
> - Performance: opt-in từng item; mỗi badge = 1 COUNT/lần đánh giá; tránh badge bảng cực lớn + poll dày (SQLite hay BUSY).
>
> **Cách dùng:** settings menu item → **Badge → Show count badge** → nhập collection (vd `orders`) + filter tùy chọn → Save.

---

## 13. Icon Remap (system icon → Lucide)
> **Trạng thái (2026-07-09): ✅ BUILD + CÀI xong v0.1.0 (server API test OK) — CHỜ user test đổi icon trực quan.**
>
> **Mục tiêu:** thay icon antd mặc định của NocoBase bằng Lucide, có **trang admin map [antd → Lucide]**. Áp cả /admin lẫn /v/.
>
> **Kỹ thuật:** registry `icons` (Map, `<Icon type>` tra live). Ghi đè key bằng proxy tra `lucide-*` live → đổi mọi chỗ
> render qua `<Icon type>`. GIỚI HẠN: không đổi được icon hardcode JSX (bánh răng/bút chì header, mũi tên collapse);
> override toàn cục theo key; mỗi lane 1 Map nên đăng ký cả 2 lane. Chi tiết: memory `nocobase-icon-architecture`.
> - Server collection `ptdlIconRemaps` (sourceKey unique, lucideKey; ACL loggedIn). UI `pluginSettingsManager.add('icon-remap')`
>   bảng picker antd→Lucide + preview + Save. **BẪY đã vá:** `updateOrCreate` trên field unique → 500 `no such column .y`
>   → save dùng list→create/update thủ công.
>
> **Cách dùng:** Settings (bánh răng) → **Icon remap** → + Add mapping → chọn icon nguồn (antd) + icon Lucide → **Save** →
> **Ctrl+Shift+R** để icon đổi khắp nơi. Bỏ mapping = xoá dòng + Save (khôi phục icon gốc). Consumer của custom-icons (không bundle icon).

---

## 12. Menu Sections (group title + divider)
> **Trạng thái (2026-07-09): ✅ BUILD + CÀI xong v0.1.0 trên nb-local — CHỜ user test UI trong trình duyệt.**
>
> **Mục tiêu:** biến 1 menu item ở sidebar trái thành **group title** (nhãn section không click, kiểu "ANA MENÜ")
> hoặc **divider** (đường kẻ ngăn) — giống ảnh sidebar mẫu user gửi. NocoBase KHÔNG có sẵn 2 loại này.
>
> **Kỹ thuật (client-only, 3 monkeypatch trên `AdminLayoutMenuItemModel` — resolve qua `flowEngine.getModelClass`):**
> - `registerFlow('ptdlMenuSections', sort 210)` → mục settings **"Display as: Normal / Group title / Divider"**;
>   lưu marker `route.options.ptdlMenuKind` qua `updateMenuRoute({options})` — **cột options JSON có sẵn, KHÔNG đổi schema server**.
> - patch `render()` → divider = `<span data-ptdl-menu-kind=divider>` đường kẻ; groupLabel = nhãn uppercase muted (route.title).
>   Settings gear vẫn giữ (do `FlowModelRenderer` bọc NGOÀI render).
> - patch `toProLayoutRoute()` → item đã convert thành leaf trơ (bỏ redirect/children, không điều hướng).
> - CSS `:has()` khử hover/height/cursor của `li.ant-menu-item`. Server lane = no-op Plugin (chỉ để có main entry).
>
> **Cách dùng (user):** ở /v/ bật UI editor → tạo 1 menu item (nên loại **Page hoặc Link** = leaf) đặt tên (vd "COMMUNICATION")
> → mở settings item đó → **Appearance → Display as → Group title / Divider line**. Đổi lại Normal để hoàn tác; xoá item như thường.
> Tốt nhất trên item leaf; đổi kind là re-render sống. Chi tiết kỹ thuật: memory `nocobase-sidebar-menu-architecture`.
>
> **Build/cài:** `build-env/recipes/run-menu-sections-build.sh` → `add-markers.sh` → giải nén vào `nb-local/node_modules/@ptdl/`
> (tar cần `--force-local` vì path `D:`), INSERT applicationPlugins (id 90, enabled+installed), `yarn start`.

---

## 1. Custom Header
> **Trạng thái (2026-07-13): ✅ v0.2.0 — nghiệm thu PASS + đã deploy nb-local (node_modules/@ptdl, pm2 `index`).** ✅ Polish UI config: gom field vào `CollapsibleSection` (Icon/Text/Background/Alignment) + preview dùng `PreviewBox` — chuẩn `@ptdl/shared` như layout-containers (chỉ đổi trình bày, giữ key/handler). Đã deploy nb-local. Thêm **Size** cho Column/Form-Detail label/Block (trước chỉ page); **tách Header align vs Cell align** (cell = antd `align`, header override qua `onHeaderCell`/`chHeaderAlign`); **JS Field trong form** (`FormJSFieldItemModel` → flow `ptdlJsFieldLabel`, resolve theo tên); **cache auto-refresh** khi tab refocus (`bindFieldStyleAutoRefresh`, throttle 10s; view đang mở cần re-render kế tiếp); **i18n** en/vi/zh (`addResources` ns `@ptdl/plugin-custom-header/client`; `t()` sinh expression có `ns` — pattern enhanced-table; nhãn React Segmented/Preview dịch runtime qua `setRuntimeT`+app.i18n); **gradient nền** 2 màu+hướng cho page & block (`headerBg2`+`bgDirection`→`linear-gradient`, component `ChBgDir`; clear màu = xóa nền sạch); **xóa dead code** `registerTabStyle`; guard `pageSize:1000`; thêm `README.md`. Checklist + test nghiệm thu: `packages/@ptdl/plugin-custom-header/IMPROVEMENTS-CHECKLIST.md`. Build OK → `storage/tar/@ptdl/plugin-custom-header-0.2.0.tgz` (chưa promote lên `latest/`).
> **Trạng thái (2026-07-09): ✅ HOÀN THÀNH v0.1.0 — chạy trên CẢ `/` và `/v/`** (client + server; user đã xác nhận từng phần).
>
> **Phủ (đều có: chọn icon Lucide/registry + màu chữ + bold; preview sống + nút Reset):**
> - **Page header** — `PageModel`, flow `ptdlCustomHeader` (sort 1000), mục **"Header appearance"**: icon + màu + **size** + bold + **background** (phủ cả **thanh tab** qua `headerStyle`+`tabBarStyle`). Bọc `props.title` ReactNode.
> - **Table column** — `TableColumnModel` + JS/custom (`TableCustomColumnModel`/`JSColumnModel`), flow `ptdlColumnHeader` (sort 490 = đầu menu), mục **"Column style"**: icon + màu + bold + **Alignment** (L/C/R qua antd `align`, căn cả header+cell). Patch `getColumnProps`, chèn icon VÀO div title (`vertical-align:-0.14em`) để align kéo icon theo. KHÔNG clobber `props.title` (string) → tránh crash `.trim` enhanced-table.
> - **Form + Detail field label** — `FormItemModel`/`DetailsItemModel`, flow `ptdlFormLabel`/`ptdlDetailLabel`, mục **"Label style"**: patch `renderItem` + `cloneElement` decorate `label` (giữ string).
> - **Block/section title** — `BlockModel`, flow `ptdlBlockStyle` (sort 1 = cạnh "Title & description"), mục **"Block title style"**: icon + màu + bold + **background** (áp `styles.header` BlockItemCard, marginTop:0). Patch `render()`, giữ `decoratorProps.title` string.
>
> **HYBRID field-level (set 1 lần → hiện mọi view) — option b:** server collection **`ptdlFieldStyles`** (ds/collection/field/icon/pos/color/bold; ACL loggedIn; sync trong `load()` vì plugin đã installed). Client `loadFieldStyleCache(apiClient)` → Map cache đọc sync. `mergeFieldStyle` = field default(cache) ⊕ per-view override(`chFieldStyle`). Dialog có toggle **"Apply to all views"**: ON→`ptdlFieldStyles:updateOrCreate` (filterKeys ds+coll+field, guard `styleEq` chống spam API); OFF→per-view. (JS column không có `collectionField` → chỉ per-view.)
>
> **Lane classic `/`:** `@nocobase/client` re-export chọn lọc (thiếu base PageModel/BasePageTabModel) → resolve class qua `flowEngine.getModelClass(name)` + fallback proto-walk. Chạy cả 2 lane.
>
> **Bug đã vá:** (a) icon picker React **#31** khi gõ chữ khớp export tiện ích antd (`createFromIconfontCN`…) → picker chỉ hiện icon thật (có gạch = thư viện namespaced luôn hiện; không gạch = phải có hậu tố outlined/filled/twotone) + dedupe alias `lucide-*`; vá **cả `@ptdl/plugin-conditional-format`**. (b) enhanced-table "Render failed" (`.trim` trên ReactNode) → giữ title dạng string. Đổi tên item conditional-format "Rules & appearance" → **"Format Rule"** (sort 501).
>
> **BỎ:** Tab style màu/bold (lệch màu gạch active + active/inactive giống nhau); tab dùng icon sẵn của core "Edit tab". *(0.2.0: đã xóa hẳn hàm `registerTabStyle` dead code.)*
> **CHƯA làm (tùy chọn):** ~~size cho column & block~~ · ~~tách align header/cell~~ · ~~JS Field trong form~~ · ~~cache đa-phiên~~ (tất cả ✅ 0.2.0); còn: gradient/ảnh nền cho column & block; force re-render toàn cục khi field default đổi (C6 nâng cao — hiện chỉ refresh cache lúc refocus); dịch nhãn Segmented + "Preview". Kỹ thuật: memory [[customize-flowmodel-render-v2]].

**Mục tiêu:** Tùy biến tiêu đề của **page** và của **block**.

**Tính năng:** nội dung tiêu đề; màu chữ; cỡ chữ (size/weight); **icon** đứng trước; **background** (màu/gradient/ảnh). Áp cho page header + block title (table, form, details...).

**Hướng kỹ thuật:** **client-only**. Thêm mục vào `SchemaSettings` của page/block title → lưu style vào `x-component-props`/`x-decorator-props`. Override component render tiêu đề để đọc prop style mới. Icon dùng lại registry của `@ptdl/plugin-custom-icons`.

**Bundle:** không đáng kể (antd `ColorPicker`, `Select`). **Rủi ro:** thấp — thuần schema settings.

---

## 2. Spreadsheet View  ← lõi "cảm giác Lark Base"
**Mục tiêu:** Block bảng tính nhập liệu **nhanh như Lark Base**, dựa trên **AG Grid**.

> **Trạng thái (2026-07-10 cuối ngày): ✅ FEATURE-COMPLETE P1+P2 (user test từng phần OK) — còn polish UI/UX.**
> Đủ: editor mọi interface (registry) + select/multi list tự vẽ + boolean toggle + RichSelect per-column; keyboard
> + type-to-edit; paste/copy 2 chiều Excel (bulkSync transaction, trần 1000) + range + fill-down; dirty-row batch +
> conflict updatedAt (409, đã test); dòng nhập mới pinned; ACL; record drawer (auto + popup native openView);
> sort server + search đa loại cột + pagination; quản cột + style + Format rules (condfmt bridge) + widget
> Star/Progress (field-enh bridge) + formula view (ptdlFormula bridge, ⚙ đầy đủ). Chi tiết: memory ptdl-plugin-spreadsheet-view.
>
> *(Spike gốc)* `@ptdl/plugin-spreadsheet-view`
> v0.1.0: block "Spreadsheet" (group Content) = AG Grid Community 36 (bundle ~1.3MB) + cell editor tái dùng FieldModel
> qua `EditableItemModel` registry (host model per cột, pattern QuickEditFormModel không popover); commit per-cell qua
> `resource.update`. Cạm bẫy build đã vá: ép ag-grid dùng CJS (ESM linking lỗi AgPromise) + `import 'react-dom'` trong
> source (nocobase-build chỉ externalize package mà SOURCE import trực tiếp). Test: /v/ → Add block → Spreadsheet →
> chọn collection → double-click ô sửa input/select/m2o.

> **MVP proposal (2026-07-10):** [docs/MVP-spreadsheet-view.md](docs/MVP-spreadsheet-view.md) — hiệu chỉnh BRD theo hiện trạng:
> editor cell TÁI DÙNG binding registry `EditableItemModel` + `FieldModelRenderer` (pattern QuickEditFormModel core) thay vì
> tự code editors cho AG Grid → widget @ptdl (Star/Progress/RichSelect…) tự chạy trong cell; formula view dùng ptdlFormula
> (bỏ mathjs); estimate Phase 1 6–8 tuần → MVP ~2–3 tuần; spike go/no-go: FieldModelRenderer làm cellEditor AG Grid.
>
> **BRD chi tiết đã chốt (2026-07-08):** [docs/BRD-spreadsheet-view.md](docs/BRD-spreadsheet-view.md) — gồm các quyết định kiến trúc (block chứ không phải "view type", target /v/ BlockModel, ACL derive từ `allowedActions`, giới hạn AG Grid Community phải tự code clipboard/fill), giới hạn cứng, bảng field→editor, và phases (P1 6–8 tuần gồm editors + keyboard nav; P2 thêm server action `spreadsheet:bulkSync` transaction).

**Scope lõi (bắt buộc để "ra chất Base"):**
- Inline edit, điều hướng bàn phím (Tab/Enter/arrow), **copy–paste nhiều dòng/cột** (Excel/Sheets), fill-down, undo/redo.
- Ghi **batch** về server; paste vượt số dòng → tạo bản ghi mới hàng loạt.
- **Map đầy đủ field types → cell editor** (đây là ~50% công sức, KHÔNG để sau): select/multi-select màu, quan hệ m2o/o2m, người dùng, file/ảnh, date/time, number, checkbox, và các field từ plugin #3/#4/#7.
- **Quản cột inline**: nút "+" thêm field, kéo đổi thứ tự, resize, **freeze cột đầu**, ẩn/hiện cột, chỉnh row-height.
- **Row expand** → mở record drawer sẵn có của NocoBase.

**Hướng kỹ thuật:** block mới (block type + initializer). Client dựng column defs từ collection fields; bulk save qua resource API `updateMany`/nhiều `update` (nên có server action gom **transaction**). Parse clipboard TSV → diff → apply.

**Bundle (dep thật, KHÔNG stub):** `ag-grid-community`, `ag-grid-react` → tar nặng (như echarts-pro).
**Liên quan:** [enhanced-table-block]. **Rủi ro:** **cao** — bundle lớn, đồng bộ state, conflict khi ghi hàng loạt. Prototype trên 1 collection nhỏ trước.

---

## 3. Table Cell Display (RunJS)
**Mục tiêu:** Cột **hiển thị custom** dựa trên **RunJS** — progress, star, badge, dot, link, avatar...

> **Trạng thái (2026-07-09):** ✅ **Snippet library đã build đầy đủ cho case phổ biến** (star rating, progress bar, checkbox, link với icon). Chưa tích hợp vào plugin chính thức nhưng code sẵn dùng được ngay.
> - ✅ **runjs-star.js** (icon rating 0-5, 3 trạng thái fill/half/empty, editable cả form + table).
> - ✅ **runjs-process-bar.js** (progress bar 0-100%, màu ngưỡng, editable click-to-set, support form + table).
> - ✅ **runjs-checkbox.js** (toggle/icon, editable switch giá trị, tự nhận diện form vs table).
> - ✅ **runjs-link.js** (link mailto/tel/url với icon lucide, mở Gmail compose cho email, block click-propagation).
> - ✅ **runjs-number-format.js**, **runjs-status-format.js** (formatter cơ bản).
> - **API context ngã ba:** JS Column (table) → `ctx.record + ctx.collection + ctx.api` gọi API update; JS Field (detail) → `ctx.value` xem; JS editable field (form) → `ctx.getValue/ctx.setValue` ghi form (bấm Save mới lưu).
> - **DOMPurify cạm bẫy:** innerHTML strip `target="_blank"` → fix bằng addEventListener + `window.open()`. Lucide icon dạng nét → fill 2 màu set stroke trắng + fill/stroke riêng `rect/circle`.
>
> - ✅ **runjs-avatar.js** (avatar từ dot-path bất kỳ trên record + tên, fallback initials màu hash-ổn-định khi thiếu ảnh; chỉ hiển thị, chưa test với dữ liệu thật).
> - ✅ **runjs-tags.js** (multi-select/m2m → dãy tag màu hash hoặc override theo `COLORS`, cắt `MAX_VISIBLE` + "+N" tooltip; editable [bỏ tag] chỉ khi mảng giá trị đơn giản trong JS editable field của form; chưa test với dữ liệu thật).
> - ✅ **runjs-select-buttons.js** (select/multi-select → dãy nút; đầy đủ COLOR_MODE/LAYOUT/ICONS/RADIUS/FONT_SIZE — xem mục #11).
> - ✅ **runjs-formula.js** (Excel-formula cell: viết 1 dòng `FORMULA='CONCATENATE(...)'`, ~398 hàm formulajs nạp CDN + hàm HTML tự thêm TAG/COLOR/LINK/IMG; dùng cho JS Column + JS Field). Chi tiết: memory `nocobase-runjs-snippets`.
>
> **Render qua JSX (`ctx.React`/`ctx.antd`) — dùng khi cần antd component thật thay vì tự vẽ HTML:** đã dùng cho
> `runjs-record-select-rich.js` (#8) và `runjs-input-icon-placeholder.js` (#9). Cạm bẫy: `Select.optionRender` nhận
> wrapper `{data,...}` (record ở `option.data.record`), row nhiều dòng cần `virtual={false}`; xem memory.
>
> **Còn cần (P2, sau P1):**
> - ⚠️ **Image thumbnail** — preview ảnh inline (nhẹ, dùng `<img>` với max-width).
> - ⚠️ **Date formatter** — short/long/relative (NocoBase đã có format nhưng RunJS mở rộng).
> - **(đã cover)** Status badge ← [conditional-format] làm rồi (tag màu + nền).

**Hướng kỹ thuật:** **client-only**. Dùng bộ snippet RunJS chung — copy-paste vào cell hoặc tích hợp vào plugin formalization sau (lưu template vào field settings). Sandbox qua `requireAsync` + `ctx.render(html)`. Tái dùng lucide via `ctx.requireAsync`, gọi API `ctx.api.request` cho cột editable (table).

**Bundle:** nhỏ (antd `Progress`, `Rate`, `Tag` — chỉ renderHTML). **Liên quan:** [conditional-format], [computed-field] (virtual display). **Rủi ro:** thấp — snippet library stable, mở rộng dễ.

---

## 4. Status Flow Column
**Mục tiêu:** Cột **trạng thái có luật chuyển** (state machine) — như Salesforce / Lark Base.

**Tính năng (config):** danh sách trạng thái + màu/icon; ma trận chuyển (A → được sang những trạng thái nào); phân quyền **role nào** chuyển được từng bước; đánh dấu `start` (default), `end-success`, `end-fail`; (option) log lịch sử chuyển.

**Hướng kỹ thuật (client + server):**
- **Client:** UI cấu hình transition; ô chỉ cho chọn trạng thái **hợp lệ** theo trạng thái hiện tại + role; màu theo trạng thái.
- **Server:** validate transition trong hook `beforeUpdate` (chặn sai luật/sai role) — **bắt buộc**, nếu chỉ chặn ở client thì lách qua API được. ACL theo role.
- Lưu config: field options (JSON) hoặc collection riêng cho định nghĩa flow.

**Bundle:** nhỏ. **Liên quan:** [conditional-format], snippet `runjs-status-format`. **Rủi ro:** **cao** — chốt **data model của flow** trước khi code.

---

## 5. QR Scanner
> **Trạng thái (2026-07-16): 🔨 P1a ĐÃ BUILD v0.1.0 — `@ptdl/plugin-device-kit`.** Camera widget (chụp tại chỗ
> getUserMedia, **watermark ON** giờ/GPS/user burn pixel, nén, meta tự lưu vào field) + field type GPS `ptdlLocation`
> (json, no map key, hiện trong Add field nhóm "Thiết bị"). tgz `latest/@ptdl/plugin-device-kit-0.1.0.tgz` → upload
> Plugin Manager UI (cần bật File manager). **CHỜ user test điện thoại thật qua Railway.** C2 check-in + QR (P1b) +
> chữ ký/ghi âm (P2) làm sau. Thiết kế + nghiên cứu: **`docs/DEVICE-KIT-DESIGN.md`**; hướng dẫn: plugin README.md.

**Mục tiêu:** Quét mã QR/barcode để nhập liệu.

**Tính năng:** nút/scan action mở camera → quét → điền field hoặc lookup bản ghi theo mã; chạy tốt trên mobile (đã có `@ptdl/plugin-pwa`).

**Hướng kỹ thuật:** **client-only**. Field action/block mở camera qua `getUserMedia`, giải mã bằng thư viện.
**Bundle (dep thật):** `html5-qrcode` **hoặc** `@zxing/browser` (chọn 1). Cần HTTPS/localhost + quyền camera. **Rủi ro:** thấp–trung.

---

## 6. Default Value support expression
**Mục tiêu:** Giá trị mặc định là **biểu thức** thay vì hằng số.

**Tính năng:** default dùng biến (`currentUser`, `now`, record khác...), hàm ngày/chuỗi/số, phép tính; đánh giá khi mở form tạo (client) và khi tạo qua API (server) để nhất quán.

**Hướng kỹ thuật:** client thay input default tĩnh bằng input expression + gợi ý biến; **server** evaluate ở `beforeCreate`. Tái dùng engine biến/handlebars của NocoBase; cần toán học → cân nhắc `mathjs`.
**Bundle:** tùy chọn `mathjs`. **Rủi ro:** trung — an toàn eval + parity client/server. **Liên quan mạnh với #7 (chung engine biểu thức).**

---

## 7. Computed / Virtual Field  ← bạn cần
**Mục tiêu:** Cột tính vượt giới hạn của formula core. Core (`@nocobase/plugin-field-formula`, đã BẬT trên localhost) chỉ **tính-rồi-lưu (persisted)** → chỉ trong nội bảng, và **sai với case thời gian** (`NOW()-deadline` đóng băng lúc save).

### Phân loại quan trọng: Persisted vs On-read
| | Persisted (core) | **Virtual / on-read** |
|---|---|---|
| Tính lúc | create/update, lưu DB | mỗi lần fetch/render |
| `NOW()-deadline` | ❌ đóng băng | ✅ luôn tươi |
| Cross-table rollup | ❌ | ✅ |
| Sort/filter server | ✅ dễ | ⚠️ khó (phải dịch → SQL) |
| Chi phí đọc | rẻ | tốn hơn |

→ Case thời gian **bắt buộc on-read**. Không có cách lưu-sẵn nào đúng (trừ cron re-touch — không nên).

### 3 kiểu hỗ trợ
**A. Virtual display (client)** — rẻ nhất, cho `NOW()-deadline`, %hoàn thành, đếm ngày...
Tính trong cell renderer ở trình duyệt từ field của dòng + `now`. **Trùng hạ tầng #3 (RunJS cell)** — một RunJS cell trả `daysLeft` chính là cột ảo on-read. Hạn chế: chỉ hiển thị, không sort/filter server.

**B. Server virtual (on-read)** — khi cần sort/filter/dùng ở API.
Tính trong hook `afterFind`, append vào record khi fetch. Muốn sort/filter (vd "quá hạn nhiều nhất trước") phải đẩy biểu thức xuống SQL: sqlite `julianday('now') - julianday(deadline)`. **v1: hỗ trợ theo MẪU cụ thể (ưu tiên hiệu ngày/giờ)**, chưa cần engine formula→SQL tổng quát.

**C. Cross-table**
- **Lookup** (kéo 1 field từ bản ghi m2o) — nhẹ, on-read hoặc stored.
- **Rollup** (SUM/COUNT/AVG trên o2m/m2m) — nặng nhất. Chọn: **on-read** (đơn giản, tốn query) hoặc **stored + recompute qua hook** trên bảng liên kết (đọc nhanh, phức tạp, **không cho case thời gian**). Có cache + invalidation khi bảng liên kết đổi.

### Kỹ thuật
- Field type mới (không persist với mode on-read), hoặc mark virtual + getter.
- Client: editor công thức autocomplete **tên field** + preview; hiển thị realtime trong Spreadsheet grid (#2).
- Server: hook `afterFind`/`beforeFind` cho on-read + append; hook aggregate cho rollup; dịch mẫu date-diff → SQL cho sort/filter.
- **Chung engine biểu thức `mathjs` với #6.** Tái dùng renderer của #3 cho hiển thị.

**Rủi ro:** cao — sort/filter trên field ảo (formula→SQL), và perf/cache của rollup trên bảng lớn. Bắt đầu từ A (client), rồi B (date-diff server), cuối cùng C (rollup).

---

## 8. Rich Dropdown Picker (+ thống kê)
**Mục tiêu:** Tùy biến hiển thị dropdown của **select / association picker** → **list item đẹp** (icon, mô tả, màu, avatar) + **thống kê số bản ghi** theo từng option.

> **Trạng thái (2026-07-09): 🟢 Bản RunJS đã chạy được (user test OK)** — [runjs-record-select-rich.js](snippets/runjs-record-select-rich.js).
> Field quan hệ (m2o/o2o/o2m/m2m) → dropdown mỗi option 2 dòng: `[avatar][tên] ... [active icon] / [chức vụ]`.
> - Tự lấy bảng đích + khoá từ `ctx.collectionField.target`/`.targetCollection.filterTargetKey` (không hard-code).
> - Value lưu = **nguyên record object** (đúng như field "Dropdown select" gốc), tự nhận single/multi theo `type`,
>   tự hydrate record thiếu field hiển thị. Search server-side (`$includes`, debounce 300ms). optionRender/labelRender/
>   tagRender custom. Config: `LABEL_FIELD`/`SUBTITLE_FIELD`/`AVATAR_FIELD`/`ACTIVE_FIELD`. Chi tiết + cạm bẫy: memory `nocobase-runjs-snippets`.
> - **CHƯA có:** badge **đếm số bản ghi** theo option (cần API aggregate group-by, tốn query) — phần "thống kê" của
>   mục này. Và bản snippet mới cho **association picker**, chưa phủ enum select thuần (dùng `runjs-select-buttons` cho case đó).

**Tính năng:**
- Mỗi option render dạng item giàu: icon/màu (dùng option color của select, hoặc icon từ custom-icons), dòng phụ mô tả.
- **Badge đếm**: mỗi option hiện số bản ghi đang mang giá trị đó (vd Status: Đang làm 12 · Xong 30). Tùy chọn bật/tắt vì tốn query.
- Áp cho select/multi-select (enum options) và m2o/m2m picker.

**Hướng kỹ thuật:**
- **Client:** override option render của antd `Select` (`optionRender`/`labelRender`) hoặc `dropdownRender`; với association picker thì custom item template.
- **Data cho count:** gọi API aggregate `group by <field>` → count (endpoint list với `group`/`count`), cache ngắn + invalidate khi dữ liệu đổi. Với m2m/m2o thì count theo association.
- Cấu hình qua field settings (bật thống kê, chọn field mô tả/icon).

**Bundle:** nhỏ. **Liên quan:** [custom-icons], [conditional-format] (màu option). **Rủi ro:** trung — **perf của count** trên bảng lớn (phải cache), và độ phủ nhiều loại field.

---

## 9. Input Prefix Icon
**Mục tiêu:** Thêm **icon đứng trước** các input thường (text, number, email, phone, url...) cho đẹp/dễ nhận diện.

> **Trạng thái (2026-07-09): 🟢 Bản RunJS đã có** — [runjs-input-icon-placeholder.js](snippets/runjs-input-icon-placeholder.js).
> JS editable field render antd `Input`/`Input.Password` với `prefix` = icon lucide, kèm option **placeholder = tên
> field** (`ctx.collectionField.title`) để dùng kiểu login form (tắt label qua "Show label" có sẵn, không cần code).
> Config: `ICON`, `IS_PASSWORD`, `USE_TITLE_AS_PLACEHOLDER`. Đã research sẵn hướng plugin hoá (đăng ký flow trên
> `InputFieldModel`/`PasswordFieldModel` set `prefix`/`placeholder`, không cần bundle lucide riêng) — memory `input-icon-placeholder-research`.

**Tính năng:** chọn icon prefix (và tùy chọn suffix) cho field input; áp ở form/edit.

**Hướng kỹ thuật:** **client-only**. Schema setting cho field component → lưu tên icon vào `x-component-props.prefix`; render antd `Input` với `prefix`. Dùng **IconPicker chung** (registry custom-icons).

**Bundle:** nhỏ. **Liên quan:** [custom-icons], **chung IconPicker với #1, #10**. **Rủi ro:** thấp.

---

## 10. Button Icon Picker
**Mục tiêu:** Cho phép **chọn icon cho button/action** (toolbar, action buttons).

**Tính năng:** picker icon gắn vào action; hiển thị icon trước label; hỗ trợ cả icon custom (lucide/custom-icons) chứ không chỉ antd icon mặc định.

**Hướng kỹ thuật:** **client-only**. Schema setting cho action → lưu icon; render trước `title`. NocoBase action đã có `x-component-props.icon` (antd) — mở rộng để nhận registry custom-icons + picker đẹp.

**Bundle:** nhỏ. **Liên quan:** [custom-icons], **chung IconPicker với #1, #9**. **Rủi ro:** thấp.

**Đã chẩn/vá lỗi Lucide không hiện trong picker `/v/` (2026-07-08):** không phải lỗi thư viện picker mà là **thiếu marker `client-v2.js`** trong tgz → `/v/` không nạp lane client-v2 của custom-icons → Lucide không đăng ký. Đã vá marker cho toàn bộ @ptdl (node_modules + tgz) + `build-env/recipes/add-markers.sh`. Chi tiết: memory `nocobase-v2-client-marker`. Luật picker: chỉ hiện icon có key kết thúc `outlined/filled/twotone` — custom-icons đăng ký `lucide-*outlined` (đúng). → **Fix marker này gần như hoàn tất phần picker của #10.**
**Cập nhật (2026-07-09):** đọc lại source `plugin-custom-icons/src/shared/lucideIcons.tsx` — dòng "~100 icon
curated, cần REGISTER_ALL_LUCIDE" trước đây **đã lỗi thời**, hiện `registerLucideIcons()` đăng ký **toàn bộ** icon
lucide-react (không giới hạn), 2 key/icon (`lucide-<kebab>outlined` cho picker + `lucide-<kebab>` không hậu tố =
contract lập trình cho plugin khác đọc qua registry). `@ptdl/plugin-icon-kit` (provider gốc trong
`docs/ICON-ARCHITECTURE.md`) đã chuyển vào `packages/_inactive/` — **`plugin-custom-icons` là provider đang
active**. Chi tiết đầy đủ pattern provider/consumer: memory `nocobase-icon-architecture`.

---

## 11. Field Widgets (đổi cách hiển thị/nhập field)
**Mục tiêu:** Thay **widget nhập liệu mặc định** của một số field bằng dạng đẹp/thao tác nhanh hơn — mà không đổi kiểu dữ liệu.

> **Trạng thái (2026-07-09):** ✅ **Multi/single select → Button group đã có bản RunJS** — [runjs-select-buttons.js](../nocobase-plugins/snippets/runjs-select-buttons.js)
> trong `nocobase-plugins/snippets/`. Dùng cho JS Column (bảng) + JS editable field (form), phục vụ đúng case
> "sửa nhanh option ít (2-3 mục)". Chưa test với dữ liệu thật.
> - Single-select → nút kiểu Radio (đúng 1, `ALLOW_DESELECT` cho bỏ chọn); multi-select → nút kiểu Checkbox (độc lập).
> - **Tự nhận option + màu** qua `ctx.collection.getField(FIELD).enum` (trả `{value,label,color}` đúng cấu hình field,
>   không cần khai tay) — `MODE='auto'` tự phân biệt single/multi qua `field.interface === 'multipleSelect'`.
>   Có `OPTIONS_FALLBACK` khai tay khi không có `ctx.collection` (vd JS Block rời không gắn collection).
> - Màu preset antd (12 màu chuẩn field select) map sẵn sang hex; option dùng hex/rgba trực tiếp cũng nhận diện được.
> - **`COLOR_MODE`**: `'colorful'` (mỗi option 1 màu, mặc định) hoặc `'mono'` (chỉ nút active có màu — lấy theo
>   primary theme qua CSS var `--colorPrimaryTextActive` mà NocoBase tự set trên `<body>`, fallback xanh dương antd).
> - **`LAYOUT`**: `'separated'` (mỗi nút tách rời, mặc định) hoặc `'joined'` (dính khối kiểu segmented control —
>   track nền xám nhạt, nút active nổi nền trắng + shadow, giống UI "Basic/Ratio/Custom" của core formula field).
> - **`ICONS`**: mapping icon lucide theo TỪNG value (`{ [String(value)]: 'kebab-icon-name' }`) — chỉ tải lucide
>   qua CDN khi có cấu hình, cache sau lần tải đầu; icon dùng `stroke="currentColor"` nên tự đổi màu theo
>   COLOR_MODE/trạng thái active, không cần tính riêng. Version CDN `lucide@0.469.0` khớp `lucide-react` mà
>   `@ptdl/plugin-custom-icons` (provider icon đang active) pin — xem memory `nocobase-icon-architecture` về vì
>   sao RunJS phải CDN load thay vì dùng registry nội bộ (RunJS context không expose `icons`/`registerIcon`).
> - **`RADIUS`**: số (px) hoặc `'full'` (bo tròn hết cỡ/pill) — áp cho cả 2 layout, track ngoài của `joined` tự
>   lớn hơn nút bên trong 2px (giống cách antd Segmented làm).
> - **`FONT_SIZE`**: số (px) ghi đè cỡ chữ, để `null` thì tự theo `SIZE` (`'small'`=12px, `'default'`=13px).
> - **Còn thiếu để "làm plugin thật":** đây mới là RunJS snippet (dán tay), CHƯA phải field component đăng ký
>   qua `SchemaSettings` như mô tả gốc (chọn "widget hiển thị" trong dropdown field settings). Muốn đúng scope
>   gốc (client-only, swap component tự động) cần bọc thành field interface/component riêng — việc kế tiếp nếu
>   muốn nâng cấp từ "snippet" lên "plugin". Checkbox→Toggle của mục này CHƯA làm riêng (đã có tại
>   `runjs-checkbox.js` dạng RunJS, kiểu `STYLE='toggle'`).

**Tính năng:**
- **Checkbox → Toggle:** field boolean/checkbox render bằng antd `Switch` thay cho ô tick. Tùy chọn label On/Off, màu, cỡ.
- **Multiple select → Button group:** field enum
  - **multi-select** → `Checkbox.Group` với `optionType="button"` (bấm nhiều nút để chọn/bỏ);
  - **single select** → `Radio.Group` với `optionType="button"` (segmented) — cùng cơ chế, tùy chọn thêm.
  - Kế thừa **màu option** của select (dùng chung với [conditional-format]).
- Bật/tắt theo từng field; mặc định giữ nguyên widget gốc để không phá form cũ.

**Hướng kỹ thuật:** **client-only**. Thêm mục vào `SchemaSettings` của field (ở edit/form) để chọn "widget hiển thị" → lưu vào `x-component-props` (vd `{ widget: 'toggle' }` / `{ widget: 'button' }`). Đăng ký component thay thế (hoặc wrapper đọc prop `widget` rồi chọn render `Switch` / `Checkbox.Group optionType=button` / `Radio.Group optionType=button`). Không đụng server — chỉ đổi tầng render input.

**Bundle:** nhỏ (chỉ antd `Switch`/`Checkbox`/`Radio`). **Liên quan:** [conditional-format] (màu option), gần nhóm #8 (#8 là dropdown giàu, #11 là widget nút/toggle). **Rủi ro:** thấp — thuần schema settings + swap component, giữ default an toàn.

---

## Định hướng Lark Base parity

**Mục tiêu thực tế:** một **Grid view kiểu Lark Base** để nhập liệu/vận hành hàng ngày — KHÔNG cố clone toàn bộ.

**Có làm (đủ tạo "cảm giác Base"):**
- **#2** đầy đủ scope lõi (map field types + quản cột inline + row expand) — đây là xương sống.
- **#3** ô hiển thị giàu · **#4** trạng thái có luật · **#7** formula (ưu tiên core + lấp gap rollup nếu cần).

**KHÔNG làm (theo yêu cầu):**
- ~~Đa view chuyển nhanh (Grid/Kanban/Gallery/Calendar tab)~~ — không cần.
- Automation, comment/@mention theo ô — để **sau**, không thuộc phạm vi cảm giác cốt lõi.

**Đánh giá:** Làm xong **#2 (đầy đủ) + #3 + #4 + #7** → đạt ~**80–85%** trải nghiệm nhập liệu/vận hành của Lark Base. Phần còn thiếu (automation, formula rollup nâng cao) là tầng sau, không chặn.

---

## Ghi chú chung
- Mỗi plugin: source ở `packages/@ptdl/plugin-<name>/` (client/, server/, locale/), recipe build ở `build-env/recipes/`.
- Dep **phải bundle** (ag-grid, html5-qrcode, mathjs...) → cài thật trong build-env; framework dep thì **stub** (xem BUILD.md).
- Đổi scope/tên sau này = phải build lại (tên nướng cứng trong client UMD).
- #6 và #7 nên **chung engine biểu thức** (mathjs/formulajs) để nhất quán và đỡ trùng. (formulajs đã dùng thật trong `runjs-formula.js`.)
- **Trạng thái tổng (cập nhật 2026-07-17):** gần như TẤT CẢ mục dưới đã plugin-hoá & LIVE. Nguồn chuẩn = `PLUGIN-REGISTRY.md` (28 plugin @ptdl). Bảng #-số dưới đây là kế hoạch GỐC — ánh xạ sang plugin thực tế:
  - ✅ Đã ship: **#1** Custom Header · **#2** Spreadsheet View (`spreadsheet-view`) · **#3** Table Cell Display (→ `field-enhancements` widgets + bộ snippet) · **#4** Status Flow (`status-flow`, server-enforced) · **#5** QR/Scanner (→ `device-kit`) · **#7** Computed/Virtual Field (`formula`: computed 3-mode + window/ledger + scan-costing FIFO/avg) · **#8** Rich Dropdown (`field-enhancements` richSelect) · **#9** Input Prefix Icon (`field-enhancements`) · **#10** Button Icon Picker (native `x-component-props.icon` + registry custom-icons) · **#11** Field Widgets (`field-enhancements`) · **#12/#14** Menu Sections & Badge (→ `menu-enhancements`) · **#13** Icon Remap (→ `custom-icons`) · **#16** Filter Tree/Bar (`filter-tree`) · **#17** Sub-table Pro (`subtable-pro`).
  - 🟡 Còn lại (không chặn): **#6** Default Value Expression thuần — đã có gián tiếp qua `formula` default-value (Excel mode); badge "đếm số bản ghi" per-option của **#8** (cần aggregate group-by) vẫn chưa làm.
