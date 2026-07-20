# menu-enhancements — Upgrade checklist

Theo dõi đợt sửa bug + nâng cấp `@tuanla90/plugin-menu-enhancements` (2026-07-13).
Nguồn đánh giá: review section (menuSections) + badge (menuBadge). Làm **theo thứ tự** dưới đây.

Trạng thái: ⬜ chưa làm · 🔧 đang làm · ✅ xong (source) · 🚀 đã build+deploy

> **2026-07-13: tất cả source ✅ xong.** Đang chờ build + deploy + test browser.

## Bug (ưu tiên theo mức độ)

- [x] ✅ **#1 Section vẫn điều hướng khi click** — `menuSections.tsx`
  - NocoBase tính đích click = `_runtimePath || redirect || path`. Plugin xoá `redirect/routes` nhưng giữ `path`+`_runtimePath` → click group-title/divider vẫn nhảy trang (hoặc ra route chết).
  - Fix: (a) node render bỏ `pointer-events:none`, thêm `onClick` guard (`preventDefault`+`stopPropagation`) chặn bubble tới `<Link>`; (b) trong `toProLayoutRoute` xoá thêm `_runtimePath`/`_navigationMode` và trỏ `path` về slug trơ `/admin/ptdl-section-<uid>` (giữ unique để ProLayout còn key).
- [x] ✅ **#2 Badge hiện "0" ở expanded, ẩn "0" ở collapsed** — `menuBadge.tsx`
  - Thống nhất: mặc định ẩn khi count=0 (cả 2 chế độ + tab). Thêm option **"Show when zero"**.
- [x] ✅ **#3 Poll không dừng khi tab ẩn** — `menuBadge.tsx`
  - `run()` bỏ qua khi `document.hidden`; thêm listener `visibilitychange` để refresh ngay khi quay lại tab.
- [x] ✅ **#4 Tắt "enabled" → xoá sạch config** — `menuBadge.tsx`
  - `normalizeCfg` giữ config (chỉ set `enabled:false`) khi còn `collection`; chỉ xoá khi bỏ hẳn collection. `readCfg`/tab-render kiểm tra `enabled` để không render khi tắt.
- [x] ✅ **#5 Data-change bus bỏ sót collection đích (association) + dataSource** — `menuBadge.tsx`
  - Notify thêm cả full-resource lẫn từng phần dotted (over-notify an toàn) để badge trên collection đích vẫn refresh. (dataSource giữ over-notify — chấp nhận.)
- [x] ✅ **#6 `PtdlColorPicker` dead code** — `menuBadge.tsx` → xoá.
- [x] ✅ **#7 Đổi collection nhưng filter cũ còn lại** — `menuBadge.tsx`
  - Reset điều kiện filter khi `collection` đổi (sau mount).
- [x] ✅ **#8 Dialog badge chưa dịch vi-VN** — `menuBadge.tsx` + `menuSections.tsx` + `locale/`
  - Thêm `locale/vi-VN.json` + `en-US.json`, `app.i18n.addResources`, chuyển chuỗi hardcode qua `T()`.

## Tính năng mới (user bổ sung)

- [x] ✅ **Overflow / compact số badge** — `menuBadge.tsx`
  - Option **"Number display"**: `Full` / `99+` / `999+` / `9999+` / `Compact (1.2K)`.
  - Helper `badgeCountProps()` map ra `overflowCount` (cap) hoặc chuỗi compact (`Intl.NumberFormat notation:'compact'`), dùng chung cho menu (expanded/collapsed) + tab.

## Build & deploy — 🚀 XONG (2026-07-13, giữ v0.1.0 cập nhật tại chỗ)

- [x] Build: `run-menu-enhancements-build.sh` → rspack client + client-v2 OK, tgz `plugin-menu-enhancements-0.1.0.tgz`.
- [x] `add-markers.sh` → nhồi `client.js` + `client-v2.js`.
- [x] Deploy: giải nén vào `nb-local/node_modules/@tuanla90/...` + `storage/plugins/@tuanla90/...` (`--force-local`).
- [x] `pm2 restart index` → app up (`/api/app:getInfo` = 200).
- [x] Verify bundle served qua HTTP: `static/.../dist/client-v2/index.js` = 200, chứa `visibilitychange` / `ptdl-section-` / `Number display` / `notation`.

## v0.2.0 release — 🚀 XONG (2026-07-13)

- [x] Bump `package.json` `0.1.0 → 0.2.0` + rebuild + redeploy (node_modules + storage/plugins).
- [x] Update DB `applicationPlugins.version` → `0.2.0` (sqlite3, busyTimeout) + restart → app up, DB xác nhận `0.2.0` enabled+installed.
- [x] Phân phối tgz: `latest/@tuanla90/plugin-menu-enhancements-0.2.0.tgz` (thay 0.1.0) + `archive/@tuanla90/` (giữ cả 2).
- [x] `PLUGIN-REGISTRY.md` → 0.2.0 + mô tả mới (inert sections, overflow/compact, show-when-zero, vi-VN).
- [ ] **Test browser (user)**: cần đăng nhập → xem "Cách test".

---

## Phần B — Nâng cấp tính năng — 🚀 batch 1 XONG (v0.3.0, 2026-07-13)

### Menu Sections
- [x] ✅ **Group-title style** — màu chữ / cỡ chữ / in đậm (settings có field điều kiện theo kind + `GroupLabelNode`).
- [x] ✅ **Labeled divider** — text căn giữa trên đường kẻ + màu line + độ dày.
- [x] ✅ **A11y** — `role="separator"` cho divider, `role="heading"` cho group title.
- [x] ❌ **Collapsible section** — **QUYẾT ĐỊNH BỎ (2026-07-13)**. Phức tạp + dễ vỡ (ẩn sibling tới marker kế + ép re-render menu tree, không tự test browser được) và **trùng** với menu type `group` gốc của NocoBase (vốn đã là SubMenu gập được). Nếu sau cần gập → dùng `group` gốc.

### Menu Badge
- [x] ✅ **Dot-only** — thêm `Dot only (no number)` vào "Number display" (antd `<Badge dot>`).
- [x] ✅ **Threshold color** — `threshold` + `thresholdColor`; count ≥ ngưỡng → badge đổi màu (`effColor`, dùng chung 3 chỗ render).
- [x] ✅ **Aggregate** (v0.4.0) — "Measure": Count rows / Sum / Average / Max / Min của 1 field số.
  - API: **KHÔNG có** action `:aggregate` (404). Dùng `POST <coll>:query` của data-visualization (đã bật): body `{collection, dataSource?, measures:[{field:[x],aggregation,alias:'value'}], dimensions:[], filter}` → response `data:[{value}]`.
  - Count (mặc định) **vẫn** dùng `:list` meta.count (tin cậy). Aggregate lỗi → null (không hiện badge). Field picker chỉ liệt kê field số. avg làm tròn 1 chữ số.
  - Contract `:query` **reverse-engineer từ CLI + source server** (không login test trực tiếp được — ranh giới credential). Nút **"Thử đếm"** chạy đúng query → user tự xác minh; "Count failed" nếu contract lệch.
- [ ] **Realtime WS/SSE** (lớn, rủi ro, tách riêng) — thay poll; cần kiểm chứng NocoBase 2.1.19 có kênh ws/notification.

### Release v0.4.0
- [x] Build + add-markers + deploy + DB `version=0.4.0` + restart → app 200, DB xác nhận. tgz latest/archive, registry → 0.4.0.
- [ ] **User test browser**: mở ⚙ Badge → chọn Measure = Sum + field → **Thử đếm** ra số là OK. (hard-refresh trước)

### Release v0.3.0
- [x] Build + add-markers + deploy (node_modules + storage/plugins) + DB `applicationPlugins.version=0.3.0` + restart → app 200, DB xác nhận.
- [x] tgz: `latest/` 0.3.0, `archive/` giữ 0.1.0/0.2.0/0.3.0. `PLUGIN-REGISTRY.md` → 0.3.0.
- [ ] **User test browser** (hard-refresh Ctrl+Shift+R).

## 2 tảng lớn — đã cân nhắc, KHÔNG làm (2026-07-13)
1. **Collapsible section** — ❌ BỎ. Phức tạp/dễ vỡ + trùng menu type `group` gốc (đã là SubMenu gập được).
2. **Badge realtime (WS/SSE)** — ⏸ chưa cần. Hạ tầng CÓ (NocoBase có sẵn WS gateway `ws-server.js` + client giữ 1 WS thường trực → **không tốn thêm kết nối**; chi phí thật = fan-out refetch khi data đổi, chặn bằng debounce/throttle). Update cho *mọi user/mọi tab*. Để dành — user thấy near-realtime hiện tại (poll + tự-đổi tức thì + focus) là đủ; cần nhạy hơn thì giảm interval xuống 10-15s.

## v0.4.1 — Config UI polish (2026-07-13)
Đồng bộ dialog config với **house style** (settings-kit của `@tuanla90/shared`):
- [x] Import `SettingsGrid` / `CollapsibleSection` / `rx` / `fi`; register 2 component layout.
- [x] **Sửa reaction hỏng**: `menu-enhancements` là plugin DUY NHẤT dùng string `{{$deps}}` (settings-kit ghi rõ throws dưới v2 compileUiSchema; mọi plugin khác dùng `rx()`). Đổi hết sang **`rx(v => ...)`** — nhiều khả năng đây là lý do field không ẩn/hiện đúng (mọi field luôn hiện → trông rối).
- [x] **Badge dialog** gom thành 3 nhóm gập được: *Dữ liệu & phép đo* / *Giao diện* / *Làm mới*; field xếp lưới 2 cột (`SettingsGrid`); mô tả dài chuyển thành tooltip.
- [x] **Section dialog** gom *Kiểu tiêu đề nhóm* (lưới 3 cột) / *Kiểu đường kẻ* — hiện theo lựa chọn Display as.
- [x] Build + deploy + DB `0.4.1` + registry + tgz. App 200.
- [ ] **User test browser** (hard-refresh): mở ⚙ Badge/Section xem bố cục gọn + field ẩn/hiện đúng theo lựa chọn.

## v0.4.2 — UI tinh chỉnh (2026-07-13)
- [x] **Color picker**: thêm `size="small"` (giảm height, hết "to hơn") + `align="center"` các Space (PtdlBadgeStyle fill/border, PtdlColor threshold, PtdlSectionColor).
- [x] **Icon nút → Lucide** (`lucide-react`, bundle vào client, KHÔNG external): Thử đếm=`Play`, Thêm điều kiện=`Plus`, Xoá điều kiện=`X`, Quay lại builder=`ArrowLeft`.
- [x] Build + deploy + DB `0.4.2` + registry + tgz. App 200. Lucide verified bundled (0 external require).
- [ ] **User test**: xem color picker gọn/căn giữa + icon Lucide đẹp. **"Checkbox badge"** — chưa rõ ý, chờ user chỉ element.

## v0.4.3 — UI round 2 (2026-07-13)
- [x] **Chevron `▸` → Lucide `ChevronRight`** ở `@tuanla90/shared` `CollapsibleSection` (sửa `settingsKit.tsx` + thêm `--external:lucide-react` vào `run-shared-build.sh` → consumer bundle lucide). Rebuild shared → sync build-env → rebuild menu-enhancements (chevron bundled, 0 external). **Lưu ý:** các plugin khác dùng `CollapsibleSection` sẽ nhận chevron Lucide ở **lần rebuild kế** (check-stale sẽ báo stale; không vỡ vì lucide-react có trong build-env).
- [x] **Checkbox → Switch (toggle)**: `enabled`, `showZero` (badge) + `glBold` (section). `Switch` đã verify registered trong flow-settings.
- [x] **Color picker tinh chỉnh**: giữ `size="small"` nhưng bọc flex `alignItems:center` + `minHeight:32` (PtdlBadgeStyle row, PtdlColor, PtdlSectionColor) → hết "lệch lên trên", căn giữa theo chiều cao control chuẩn.
- [x] Build shared + menu-enhancements, deploy, DB `0.4.3`, registry, tgz. App 200.
- [ ] **User test** (hard-refresh): chevron Lucide, toggle switch, color picker căn giữa đúng.

## v0.4.4 — UI round 3 (2026-07-13)
- [x] **Toggle "Hiện badge" cùng dòng**: FormItem `layout:'horizontal'` (label + switch 1 dòng) — tiết kiệm 1 dòng.
- [x] **Filter builder dùng field picker CHUẨN**: thay Select + SmartValueInput/RelationValueInput bằng `FieldPickerCascader` (drill sâu quan hệ, `onPick`→path) + condition kit chuẩn (`resolveFieldMeta` path→leaf meta, `operatorsForMeta`, `ConditionValueInput`). Filter JSON path-based (nest `{customer:{name:{$eq}}}`); decode round-trip cả filter cũ 1-hop. **Aggregate field vẫn dùng `PtdlNumericFieldSelect`** (user chỉ đổi field trong bộ lọc).
- [x] **Dọn dead-code**: xoá ~141 dòng (FILTER_OPS/OP_META/coerceVal/REL_TYPES/DATE_TYPES/encode/decode cũ/SmartValueInput/RelationValueInput) + import thừa (dayjs, DatePicker, InputNumber, Switch). Giữ `NUMERIC_TYPES`/`cleanLabel` cho aggregate picker.
- [x] Build + deploy + DB `0.4.4` + registry + tgz. App 200. Bundle +8.5KB (shared condition kit + cascader inlined).
- [ ] **User test** (hard-refresh): filter → bấm field mở cascader drill quan hệ; op/value tự đổi theo type; **"Thử đếm"** xác nhận filter chạy đúng. Toggle "Hiện badge" nằm cùng dòng.

## v0.4.5 — Filter UI đẹp hơn (2026-07-13)
- [x] **Field picker = antd `<Cascader>` thật** (box input, `displayRender`, `loadData` lazy) thay cho trigger link `FieldPickerCascader` — giống rule builder của conditional-format (tham chiếu `tableRulesModel.tsx`). Tách `FilterCondRow` (mỗi row tự quản field opts/meta).
- [x] **Nới dialog 480 → 640** (cả menu + tab flow) + row filter dùng flex `alignItems:center gap:8` → field/op/value/**nút xoá cùng 1 dòng** (hết rớt xuống).
- [x] Build + deploy + DB `0.4.5` + registry + tgz. App 200.
- [ ] **User test** (hard-refresh): ô chọn cột là box cascader gọn; xoá không rớt dòng.

## v0.4.12 — Hotfix màu chữ divider (2026-07-15)
- [x] **Bug**: divider có label — đổi màu line thì **chữ ở giữa không đổi theo** (bị hardcode `var(--colorTextTertiary)`). Chỉ 2 vạch kẻ ăn `lineColor`.
  - Fix (`menuSections.tsx` `DividerNode`): thêm `textColor = style?.color || tertiary` → chữ + line **cùng ăn màu** khi có set; không set thì về tertiary (giữ nguyên look mặc định). `GroupLabelNode` vốn đã đúng (dùng thẳng `style.color`).
- [x] Build + add-markers + deploy (node_modules + storage/plugins) + DB `0.4.12` + restart → app 200. Verify bundle: label wrapper compile ra `color:o` với `o=(t?.color)||"…colorTextTertiary…"`, vạch kẻ `borderTop:l px solid r` với `r=(t?.color)||"…colorSplit…"`.

## v0.4.13 — Divider linh hoạt = line + title (2026-07-15)
Nâng cấp **divider** thành "section" 1-mục cover mọi case (không thêm kind thứ 4; backward-compat: item cũ dùng default = look cũ). Thêm vào `SectionStyle`: `lineOn?`, `pos?: 'above'|'on'|'below'`, `align?: 'left'|'center'|'right'` (+ tái dùng `size`).
- [x] **`DividerNode` viết lại**: caption đặt **trên / trên-đường-kẻ (giữa) / dưới** đường kẻ; **căn trái/giữa/phải**; **cỡ chữ**; **ẩn/hiện line**. Mode "trên đường kẻ": center = kẻ 2 bên, left = chữ trước kẻ, right = kẻ trước chữ. Above/below = xếp dọc (title + rule). Uppercase chỉ ở mode "on line"; above/below = title thường (đậm hơn).
- [x] **Case "đường line xong title phía dưới"** = 1 item: kind=Divider, nhập label, **Text position = Below** (line off tùy chọn để thành title trơn).
- [x] **Settings dialog** thêm 4 control, **ẩn/hiện thông minh** (`rx`): position/align/size chỉ hiện khi có text; position còn cần line bật; thickness ẩn khi line tắt. Radio.Group `optionType:'button'` (mọi pattern — Radio.Group+enum, SettingsGrid, fi, rx, Switch, Input number — đã có sẵn trong dialog này).
- [x] **i18n**: +9 key vi-VN (Show line/Text position/Above/On line/Below/Align/Left/Center/Right) + tooltip mới; `Font size (px)` tái dùng. en-US `{}` → fallback key (English OK).
- [x] Build + add-markers + deploy + DB `0.4.13` + restart → app 200. Bundle 70974B, chứa `Text position`/`Show line`/`above|on|below`/`lineOn`. Plugin registered 2 lane, không lỗi console.
- [ ] **User test** (hard-refresh Ctrl+F5): ⚙ 1 menu item → Appearance → Divider → nhập label → Text position=Below → Save → thấy **đường kẻ rồi title dưới**; thử On line/Above + căn lề + ẩn line + cỡ chữ.

## v0.4.14 — Live preview trong dialog (2026-07-15)
- [x] **`SectionPreview`** (`livePreview` của settings-kit → observer đọc `form.values`, tự cập nhật mỗi lần sửa). Đăng ký `PtdlSectionPreview` (void component, cùng cơ chế `SettingsGrid`/`CollapsibleSection`), ghim đầu dialog qua `previewField`, hiện theo `rx`. Seed `__title` (tên item) vào defaultParams cho preview group-title.
- [x] Build + deploy + DB `0.4.14` + restart → app 200. Bundle 72597B chứa `PtdlSectionPreview`/`__title`. User xác nhận preview + button group render OK (screenshot).

## v0.4.15 — Gộp còn 1 option "Convert to section" + Segmented + preview có ngữ cảnh (2026-07-15)
User: bỏ hẳn "Group title", **chỉ 1 option cover cả 2 nhu cầu**; đổi radio → toggle; button group đẹp hơn; preview có menu trên/dưới; i18n EN-source.
- [x] **1. Bỏ 3-way radio → 1 Switch `Convert to section`** (`dvOn`). On = section (kind lưu luôn là `'divider'`), off = mục thường. **Group-title = "line off + text"** → không cần kind riêng. `GroupLabelNode` vẫn giữ để **render backward-compat** item cũ đã lưu `groupLabel`; mở lại item cũ → `defaultParams` map sang section (line off, căn trái, giữ màu/cỡ; text trống → dùng tên item), lưu lại thành `divider`.
  - **`DividerNode` thêm `fallbackText`**: line OFF + không nhập text → hiện **tên mục menu** làm tiêu đề (giữ hành vi group-title cũ, tự bám tên khi đổi). `onLine = lineOn && pos==='on'` mới quyết uppercase/đậm.
- [x] **2. Button group = antd `Segmented`** (`PtdlSegmented`, `SEG_PROPS` block+border) thay Radio.Group; dialog nới **460 → 560**. Segmented raw an toàn với Formily (onChange phát value, không phải event như Input). Options i18n dựng trong `uiSchema()`.
- [x] **3. Preview 2 mục menu trên/dưới** (`PreviewMenuItem`: chấm icon + "Menu item") kẹp section ở giữa → dễ tưởng tượng ngữ cảnh sidebar.
- [x] **4. i18n EN-source**: `en-US.json` từ `{}` → **21 key** English (source-of-truth cho feature section); vi-VN +5 key (Convert to section/2 tooltip/Color/Menu item) = 91. Cross-check: mọi key en có trong vi.
- [x] Ẩn/hiện thông minh (`rx` + helper `secOn/secText/secLineOn/secCaption`): text/line/color hiện khi `dvOn`; position cần text+line; align/size cần có caption (text hoặc line-off); thickness cần line.
- [x] Build + add-markers + deploy + DB `0.4.15` + restart → app 200. Bundle 73043B chứa `Convert to section`/`PtdlSegmented`/`dvOn`/`Menu item`. **User tự test** (theo yêu cầu).

## Trạng thái cuối: v0.4.15 — 1 option "section" duy nhất (Switch) cover heading + line + line-title; Segmented; live preview có ngữ cảnh; i18n EN-source
Xong: bug #1–#8, phần A, phần B batch 1, aggregate, config UI polish, **section 1-option + preview + i18n**. `groupLabel` chỉ còn ở render (backward-compat), UI không còn tạo mới. 2 tảng lớn: đã cân nhắc & bỏ/hoãn.

## Ghi chú kiểm chứng
- Bug #1 xác nhận bằng đọc source `nb-local/node_modules/@nocobase/client-v2/es/index.mjs`
  (menu link component: `S=y.redirect||y.path; k=y._runtimePath||S; onClick: if(!k){preventDefault;return} else navigate(F)`).
