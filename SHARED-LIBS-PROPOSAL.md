# @ptdl — đề xuất chuẩn hoá thư viện dùng chung

Nguồn: khảo sát tự động 20 plugin (6 agent song song, 2026-07-11). Kết luận cốt lõi:

> **Không có package chung nào.** Mỗi plugin build độc lập, và các mảnh ghép tái sử dụng được
> **nhân bản bằng copy-paste** (comment trong `fieldPicker.tsx` nói thẳng: *"Copy this file into other
> @ptdl plugins … packages build independently, so no cross-package import"*). Hệ quả: cùng một widget
> tồn tại nhiều bản đã **trôi lệch nhau**, sửa 1 chỗ không lan sang chỗ khác.

## 1. Mức độ trùng lặp (xếp theo ROI dọn dẹp)

| # | Mảnh ghép | Số bản | Điểm đau |
|---|---|---|---|
| 1 | **Color kit**: `COLOR_PRESETS` (14 màu) + `ColorField` wrapper + `colorToString` | 7 file presets giống hệt + wrapper ~12 chỗ + **8 lần nội bộ** trong field-enhancements (~15+) | + **bug thật**: bảng Tag name→hex phân kỳ (status-flow/field-enh primary-6 vs spreadsheet -7) ⇒ cùng tag khác màu ở 2 block |
| 2 | **Icon consumer helper** (`setIconRegistry`/`RegistryIcon`/`RegistryIconPicker`) | ≥6 bản (print-template & status-flow byte-identical trừ tên setter) | dedup logic tinh vi (lọc `createFromIconfontCN` gây React #31) — sửa 1 bản không tới bản khác |
| 3 | **fieldPicker.tsx** (cascader chọn field xuyên quan hệ) | 5 bản (4 giống hệt + ai-column đã nâng cấp) + filter-tree tự viết bản 6 | **drift năng lực**: chỉ ai-column có lazy drill-deep (order→client→manager→name); 4 plugin kẹt ở 1-hop |
| 4 | **Settings-kit**: `SettingsGrid`, `fi()` (FormItem cell), `rx()` (reactions), `ResetButton`, preview void-field | grid 8x, fi 8-9x, rx 7x, reset 9x, preview 13x | `rx` bản string-`{{$deps}}` (custom-header) = đúng footgun trong memory [[nocobase-v2-uischema-reaction-gotcha]] |
| 5 | **Format helpers**: number (regex `\B(?=(\d{3})…`), date token, `escapeHtml`, template interpolate, dot-path get | number 6x, date 4x, escape 3x, interpolate 7x, get 4x | interpolate phân kỳ cú pháp (`{x}` vs `{{x}}`, có/không pipe-filter) = footgun |
| 6 | **NBColorPicker** (core không export) | re-port/re-impl ~10 plugin | — |

## 2. Cái gì ĐANG ĐÚNG — giữ nguyên (đừng "chuẩn hoá" nhầm)

- **0 import `@ptdl/*` → `@ptdl/*`.** Đúng với mô hình bundle-độc-lập của NocoBase (import thật sẽ nhét
  bản sao dep vào bundle consumer). **Chia sẻ phải qua host registry lúc runtime, KHÔNG qua runtime dep.**
- 3 host-registry đang gánh mọi liên kết: **icon registry**, **FlowEngine `getModelClass`/`EditableItemModel`**, **RunJS snippet registry**.
- `custom-icons` = **provider lucide duy nhất** (1 bản lucide thay vì N). Giữ làm "core dữ liệu icon".
- rich-select **subclass** core `RecordSelectFieldModel` (đúng cách, không tự fetch lại).
- preview **dùng chung component render** với `render()` thật ⇒ không bao giờ lệch. Ghi thành quy ước.
- `build-env/` (add-markers.sh + mkstub) = **build core**. Giữ.
- **Reuse chéo bạn nhắc đã có thật**: `spreadsheet-view` gọi `PtdlRichSelectFieldModel`/Star/Progress của
  field-enhancements **theo tên** (degrade nhẹ nếu thiếu); block-custom-html dùng icon lucide qua registry.

## 3. Kiến trúc đề xuất: `packages/@ptdl/shared/` (source lib được BUNDLE, không phải runtime dep)

Một thư mục source chung, mỗi plugin **bundle nó vào** (giống lucide/echarts đang được bundle, không stub):

| Module | Xuất gì | Thay thế |
|---|---|---|
| `shared/color` | `COLOR_PRESETS`, `TAG_HEX` (chuẩn primary-6), `ColorField` (kèm option rgba), `colorToString`, `parseColor/luminance/isLight/hexToRgba`, `NBColorPicker` (port core 1 lần) | #1, #6 |
| `shared/icons` | `setIconRegistry`, `RegistryIcon`, `IconByKey`, `RegistryIconPicker({iconsMap, caps, grouped, showClear})` | #2 |
| `shared/field-picker` | `FieldPickerCascader` (lazy — bản ai-column làm chuẩn), `FieldTokenTextArea`, `getFields`+cache, `buildLevelOptions`, `resolvePath/resolveMeta` | #3 |
| `shared/settings-kit` | `SettingsGrid`, `fieldItem`(fi), `rx`/`visibleWhen`, `ResetButton`, `PreviewBox`, `createPreviewField`, `useSettingsFormValues`, **`CollapsibleSection` (MỚI)**, `SettingsSection` | #4 |
| `shared/format` | `makeNumberFormatter` (bản data-viz là superset), `formatDate` (bản print-template), `escapeHtml`, `interpolate({syntax, filters})`, `get/toDisplayString` | #5 |
| `shared/condition` | `resolveFieldMeta` (leaf type/enum theo dot-path, qua `getFields`), `operatorsForMeta`, `ConditionValueInput` (value input thông minh theo type+op), `evalConditionOp` (evaluator CLIENT), `OP_LABELS`, `DATE_PRESETS` | — (MỚI) |
| `shared/constants` | hằng chuỗi tên model (`PtdlRichSelectFieldModel`…) để rename không vỡ ngầm | — |

**✅ Spike ĐÃ XONG (2026-07-11):** tạo `packages/@ptdl/shared` (pre-compiled dist), đặt vào
`build-env/node_modules/@ptdl/shared`, cho `plugin-menu-badge` `import { colorToString } from '@ptdl/shared'`,
build → marker của shared **xuất hiện trong `dist/client-v2/index.js`** và **không còn import `@ptdl/shared`
ngoài** ⇒ rspack đã **inline** (bundle) như lucide. Cơ chế chốt = **(a) node_modules-resolvable package**.
`@ptdl/shared` không nằm mkstub-list nên không bị externalize. (menu-badge đã revert về nguyên trạng.)

## 4. Lộ trình (giảm rủi ro tối đa)

- **P0 — quick win, RỦI RO 0** (cùng-package, không đụng build chéo): dọn **nội bộ field-enhancements** —
  nó tự copy SettingsGrid/fi/rx/Reset/ColorField/preview **8 lần**. Gộp về `src/shared/` của chính nó.
  Vừa dọn lớn nhất, vừa **định hình luôn API** cho các primitive trước khi tách ra ngoài.
- **P1 — Color kit + Icon helper**: tạo `@ptdl/shared`, spike bundling, migrate màu + icon trước (ROI cao
  nhất, **sửa luôn bug Tag-màu** và **ref cũ `plugin-icon-kit`** — chính là cái "warning" nghi ở bước trước).
- **P2 — field-picker**: lấy bản lazy ai-column làm canonical → 5 plugin dùng chung (4 plugin lên drill-deep).
- **P3 — settings-kit + `CollapsibleSection`**: mở đường cho feature khối thu/gập (mục 5).
- **P4 — format helpers**; và gộp ~20 recipe build → 1 script tham số hoá.

## 5. Khối thu/gập (collapsible section) — đặt ở đâu (đã xác nhận bằng survey)

Survey xác nhận: **không plugin nào import antd `Collapse`** — 0 primitive gập; chỉ 2 toggle tự chế rời rạc
(print-template, block-custom-html). Nên:

- **Primitive `CollapsibleSection`** (title + chevron ▸/▾ + body, optional drag-resize) → vào **`shared/settings-kit`**.
  Nó phục vụ **cả** panel config kiểu ảnh (Typography/Dimension) mà các dialog đang *giả lập bằng `_Grid` phẳng*.
- **Khối runtime "Section" trong form/detail** (bấm thu/xoè, giống sidebar) → **CHỐT: gộp vào block-tabs, đổi tên
  `@ptdl/plugin-layout-containers`** ("Layout containers"): cùng một *container-core chứa grid con*; Tabs / Collapse /
  Section (+ sau này Steps) là các "kiểu render" mỏng trên nó. *(Đổi package name ⇒ bản đang cài cần reinstall/migrate;
  đang nháp nên rẻ.)*

## 6. Liên hệ với tool autobuild
Bộ shared này càng sạch thì generator (record-then-parameterize) càng dễ: ít biến thể phân kỳ để "học",
và các primitive (picker/preview/settings/collapse) trở thành slot chuẩn để điền. Nên P0–P1 làm nền tốt cho cả 2.

## 7. Đã chốt (2026-07-11)
- **Cơ chế chia sẻ = bundle** `@ptdl/shared` (source lib compile thẳng vào từng plugin; **không** kit-plugin).
  ⇒ mỗi plugin deploy **độc lập**, zero runtime dep vào plugin @ptdl khác. Đã **spike xác nhận** (mục 3).
- **Tái dùng tính năng chéo** (B dùng widget/model/icon của A nếu A có) = **registry runtime OPTIONAL, graceful**
  (thiếu A thì B fallback, không lỗi). Giữ nguyên pattern hiện có (custom-icons, spreadsheet→field-enh).
- **Ship = upload tgz lại bằng tay** mỗi lần update (không cần cơ chế auto-update).
- **Gộp collapse → `@ptdl/plugin-layout-containers`** (mục 5).

## 8. Cơ chế build & propagation ("sửa A thì B,C,D build lại")
- `@ptdl/shared` khai báo là **`devDependency`** của mỗi plugin (bundle lúc build, KHÔNG phải runtime dep)
  → đồ thị phụ thuộc **tường minh** cho lerna (đã có trong build-env).
- Sửa shared → **1 lệnh** `lerna run build --since` (topological: build shared trước, rồi đúng các plugin dùng nó).
- **Staleness guard**: mỗi build đóng dấu `sharedHash` vào tgz; script `check-stale` liệt kê plugin mang hash cũ
  → in đúng **danh sách tgz cần build lại & upload lại** (khớp luồng upload tay).
- Blast-radius mặc định = theo package; muốn hẹp hơn thì tách `shared-utils` / `shared-ui`.

## 9. Lộ trình còn lại
- [x] Spike bundling (mục 3)
- [x] **Lát cắt thật (menu-badge)**: `COLOR_PRESETS`+`colorToString` → `@ptdl/shared`; build (`recipes/run-shared-build.sh`)
  + build menu-badge + deploy localhost. Verify served client-v2 đã inline, không import ngoài. **Finding:**
  client lane **inline** shared; server lane (tsup) **vendored** bản sao vào `dist/node_modules/@ptdl/shared` —
  cả hai self-contained (plugin chạy độc lập). devDep `@ptdl/shared` đã thêm vào menu-badge (cho lerna graph).
- [ ] Dựng `lerna --since` + `check-stale (sharedHash)` trong build-env
- [ ] P0: dọn **nội bộ** field-enhancements (8× grid/fi/rx/reset/color/preview → 1) — định hình API primitive
- [x] **P1a — `COLOR_PRESETS` + `colorToString`** → `@ptdl/shared` cho **8 plugin** (menu-badge + block-tabs,
  conditional-format, custom-header, filter-tree, field-enhancements×7 model, login-lite, pwa). Xoá 7 `colorPresets.ts`
  + inline, hợp nhất ~15 normalizer. Build + deploy + verify served bundle (16-màu). login-lite giữ nguyên normalizer
  rgba/alpha (đúng). conditional-format giữ tên `normColor` (bridge `globalThis.__ptdlCondFmt` cho spreadsheet-view).
  **Bonus:** sửa 3 recipe cũ hỏng (run-condfmt/login/pwa: ROOT thiếu `/..`, không stage src, PKG sai scope `@taichuy`/`@nocobase`).
- [x] **P1b-TAG — `TAG_HEX`/`TAG_COLORS`/`tagColorToHex` (primary-6)** → shared; migrate status-flow (types.ts
  **re-export** → 4 importer giữ nguyên), field-enhancements (selectButtons: `PRESET_HEX`/`toHex` → `tagColorToHex`),
  spreadsheet-view (`ANTD_TAG` -7 đậm → primary-6: **dot enum sáng hơn, đồng bộ** — thay đổi nhìn thấy duy nhất, user đã duyệt).
  status-flow/field-enh không đổi màu (vốn đã primary-6). Build+deploy+verify (096dd9 cũ = 0, 1677ff mới có).
- [x] **P1b-ColorField** — `ColorField` chung (16 preset + `colorToString` + `size=small` + `allowAlpha` opt-in) →
  block-tabs, conditional-format, custom-header, filter-tree, field-enhancements(×7), **login-lite** (allowAlpha, hết ngoại lệ).
  Ẩn thanh alpha khi không dùng. Build+deploy+verify.
- [x] **P1c-Icon** — `setIconRegistry`/`IconByKey`/`RegistryIconPicker` chung (bản canonical field-enh) → conditional-format,
  custom-header, filter-tree, field-enhancements (xoá iconRegistry.tsx local). Giữ wiring `setIconRegistry` mỗi lane;
  `StyledIcon` adapter cho chỗ icon có style. Sửa ref cũ `plugin-icon-kit`→`custom-icons`. Build+deploy+verify (picker inline ở 4 consumer).
- [x] **P4a field-picker lazy** → `@ptdl/shared/fieldPicker.tsx` (bản ai-column). Migrate ai-column, global-search,
  print-template, field-enh, block-custom-html (xoá copy local, trỏ import shared → lên bản lazy drill-deep).
  filter-tree **partial** (chỉ gom `getFields`, giữ builder GROUP BY riêng). Build+deploy+verify.
  ⚠️ **Cạm bẫy:** block-custom-html trước KHÔNG import antd → nocobase-build không externalize antd → rspack cố
  bundle antd từ shared → fail. Fix: thêm `import 'antd'` trực tiếp trong src + antd vào package.json.
- [x] **P4b format helpers** → `@ptdl/shared/format` (number superset data-viz, date superset print-template,
  escapeHtml, `get` dot-path, `toDisplayString`, `interpolate`+pipe-filter). Migrate **thận trọng** 9 consumer:
  gom escapeHtml/dot-path/toDisplayString + date(print-template)/number(data-viz); **giữ local** number/date/interpolate
  phân kỳ (block-html interpolate=JS-eval, enhanced-table number=sample-inference, print-template number=Intl currency…).
  Build+deploy+verify 9/9, app UP. ⚠️ **2 fix build:** (1) echarts-pro recipe cũ (ROOT/PKG/stage) → rewrite; (2) barrel
  import kéo antd cho consumer thuần → thêm **subpath `@ptdl/shared/format`** (pure, không antd) cho data-viz.
- **→ "MIGRATE TẤT CẢ" (P1–P4) HOÀN TẤT.** Còn lại là phase SAU roadmap ↓
- [x] **settings-kit** → `@ptdl/shared/settingsKit.tsx`: `SettingsGrid`, `fieldItem`/`fi`, `rx`/`visibleWhen`,
  `ResetButton`, `PreviewBox`, **`CollapsibleSection` (mới)**. Migrate field-enhancements (8 model), custom-header
  (+ **sửa footgun `{{$deps}}`→`rx()`**), ai-column, filter-tree, formula — register grid/reset dưới tên cũ,
  giữ gap/cột phân kỳ bằng style. Build+deploy+verify 5/5, app UP.
  *(`CollapsibleSection` đã CÓ trong shared nhưng CHƯA adopt vào dialog nào — bước sau: biến section dài thành gập được / dựng khối runtime.)*
- [x] **tooling `check-stale`** (`recipes/check-stale.sh`) — báo plugin nào có tgz cũ hơn `@ptdl/shared/dist` → cần build lại.
  Bảo thủ (mtime); shared thay đổi kiểu cộng-thêm-module thì plugin cũ vẫn chạy đúng.
- [x] **Khối Collapse/Sections runtime** → thêm `BlockCollapseModel` vào **block-tabs** (KHÔNG đổi tên plugin — an toàn):
  tái dùng `BlockTabPaneModel`/`TabPaneGrid` + container-core (loadOrCreateModel grid + moveModel DnD), render antd
  `Collapse` thay `Tabs`. "Add block → Collapse (Sections)"; mỗi section = grid con (lồng bất kỳ block/field); edit chỉ
  chevron toggle, view thì cả header. Build+deploy+verify, app UP. → **đây là "Coalesce panel"/khối gập user muốn.**
- [x] **Đổi tên `block-tabs` → `@ptdl/plugin-layout-containers` (v0.3.0)** — mv source dir + package.json + recipe mới
  `run-layout-containers-build.sh`; giữ nguyên tên model class (BlockTabsModel/BlockCollapseModel/BlockTabPaneModel) +
  collection `ptdlTabStyleSettings` → **config tab-style cũ sống sót**. DB: rename row applicationPlugins + swap folder. LIVE.
- [x] **Gộp `menu-sections` + `menu-badge` → `@ptdl/plugin-menu-enhancements`** — cả 2 client-only, config trên route
  options (ptdlMenuKind/ptdlBadge) → **config cũ sống sót**. New plugin gọi cả registerMenuSections + registerMenuBadge.
  DB: rename menu-sections row → menu-enhancements, xoá menu-badge row, swap folder. LIVE. *(source dir cũ menu-sections/
  menu-badge còn lại — superseded, an toàn xoá; code đã copy verbatim vào menu-enhancements.)*
- [x] **Dọn dẹp (2026-07-12):** xoá source dir + recipe cũ (menu-sections/menu-badge/block-tabs/build-block-html) ·
  **rebuild TẤT CẢ 17 plugin** (shared có thêm `loginKit`, login-lite lên loginKit) → `check-stale = 0/17` ·
  **adopt `CollapsibleSection`** vào dialog tab-style của layout-containers (nhóm "Layout" thành section gập, void
  field data-transparent nên params giữ nguyên). Tất cả deploy, app UP.
- [x] **`shared/condition` (2026-07-13)** — extract smart-condition kit (operator theo field type + value input
  thông minh + evaluator) **derive từ filter-tree** (`opsForMeta`/`ScopeValueInput` — bản canonical), NHƯNG adapt
  cho **client-side eval** (bỏ server variables + date-descriptor server-resolve; date presets client-resolvable
  bằng native Date). Consumer đầu tiên = **conditional-format block-level rules** (dùng luôn `FieldPickerCascader`
  lazy + `RegistryIconPicker`). **Ứng viên migrate onto nó (chưa làm, tránh destabilize plugin đang chạy):**
  `filter-tree` (server-JSON — cần giữ variables/date-descriptor nên chỉ share phần UI/opsForMeta), `menu-enhancements`
  (filter builder). → khi migrate: tách phần build-JSON server khỏi phần UI, share UI.
- **→ TOÀN BỘ ROADMAP HOÀN TẤT.** `@ptdl/shared` + `loginKit` + `condition`; check-stale sạch; docs/memory cập nhật cho session sau.

## 10. Rà soát tồn dư (2026-07-15) — roadmap ~90%, KHÔNG phải 100%

Audit read-only lại toàn bộ (chi tiết: `docs/SHARED-DEDUP-AUDIT.md`). Xác nhận color/icon/field-picker/token-insert/escape-get/settings-kit/condition-UI/login/realtime **đã gom sạch**. Nhưng dòng "MIGRATE TẤT CẢ HOÀN TẤT" (§4b/§9) **overstate** — còn tồn:

**a) Format số/ngày — 4 dup thật chưa nằm trong list "giữ local" của §4b:**
- `formula/formulaFormat.ts`: `formatNumberValue` (→ `makeNumberFormatter`) + `formatDateValue` (→ `formatDate`). **formula chưa từng nằm trong đợt migrate 9-consumer.** ROI cao nhất, rủi ro thấp (formula đã bundle shared). Chặn: `decimals` unset (shared mặc định `toFixed(0)`, formula giữ full precision) + trả `null` khi invalid → cần wrapper.
- `spreadsheet-view/spreadsheet.tsx` `formatNum`, `field-enhancements/numberFieldModel.tsx` `formatDisplay` → `makeNumberFormatter` (đều `,` = mặc định shared, an toàn).
- `change-log/changeLogClient.ts` `formatDateFriendly` → `formatDate(v,'DD/MM/YYYY HH:mm')` (byte-identical).
- *Giữ local đúng:* `helpers.fmt` (toLocaleString vi-VN + currency/percent), `enhanced-table formatNumberLikeSample` (sniffing), `print-template` (Excel mask). `helpers.date` cần shared thêm token `H` trước khi swap.

**b) 2 module CHƯA từng đề xuất (nhưng đủ điều kiện SHAREABLE):**
- **`shared/relativeTime`** — 3 bản: block-custom-html `timeAgo`, change-log `relativeTime`, field-enh reduceUnit. API cần tham số hoá `{locale,style,t}` (3 vocabulary khác nhau).
- **`shared/aggregate`** (data-helper) — ≥5 bản reducer `sum/avg/min/max/count/groupBy/median/range` (seed từ `buildHelpers`). Rủi ro thấp, DRY + thống nhất null-policy.

**c) Sửa stale trong doc này:**
- §condition (dòng ~158) nói `menu-enhancements` "chưa migrate" → SAI, đã import `ConditionRow`/`opNeedsNoValue`.
- Ngoại lệ `filter-tree` condition (giữ taxonomy vì server-JSON) nay đã ghi rõ trong build-guide §R2.
- compact-number (filter-tree/menu-enhancements dùng `Intl notation:'compact'`) — `makeNumberFormatter({compact})` là bản thay nhưng output K/M/B thủ công khác → cần cân nhắc.

> **Chưa refactor code** (chỉ audit + doc, theo yêu cầu) — nhiều file đang được i18n-edit song song. Khi làm: theo thứ tự ROI ở `SHARED-DEDUP-AUDIT.md §B`, chú ý các diff hành vi ở §B (chặn swap ngây thơ).

**d) Relation-appends cascader — ✅ GOM XONG (2026-07-15).** Audit §10 gốc bỏ sót 1 dup: cascader "chọn quan hệ nhiều cấp, hover xổ con, mỗi pick thành tag" (build options từ `collections:get?appends=fields`, depth 3) copy-paste ở print-template (`AppendsPicker`) và line-generator (`RelationAppendsPicker`). Đã extract → **`@ptdl/shared` `RelationAppendsPicker` + `buildRelationOptions`** (`relationPicker.tsx`, dùng chung cache `getFields` của field-picker, i18n `st()`, hint = prop); 2 plugin refactor sang bản shared, line-generator được wire thêm shared-i18n (trước đó thiếu). Build + deploy + verify served bundle. Chi tiết: `docs/SHARED-DEDUP-AUDIT.md §3b`.
