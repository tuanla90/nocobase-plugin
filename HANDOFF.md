# @tuanla90 plugins — HANDOFF (đọc trước khi tiếp tục ở session mới)

Trạng thái công việc "gom thư viện dùng chung `@tuanla90/shared`" + bối cảnh, để session khác follow được.

## 0b. Git remote (đồng bộ đa máy)
- Repo: **`https://github.com/tuanla90/nocobase-plugin`** (nhánh `main`, remote `origin`). Máy này đã có credential GitHub sẵn (push OK).
- **Cài trên máy khác:** `git clone/pull` → upload `.tgz` từ `latest/@tuanla90/` qua Plugin Manager UI (không cần build). Xem README §"Cài trên máy khác".
- `.gitignore` loại: `node_modules/`, `build-env/{node_modules,packages,storage}/`, `packages/@tuanla90/shared/dist/`, `_backup-localhost-*/` + `*.sqlite` (DB thật — KHÔNG commit), `archive/` (tgz cũ nặng). Remote còn giữ snapshot cũ `plugins/` + `theme/` + `extras/` (merge unrelated-histories, không xoá).
- Sau khi build/promote plugin mới: `git add -A && git commit && git push` (kèm Co-Authored-By nếu Claude tạo).

## 0. Bản đồ tài liệu
- **`SHARED-LIBS-PROPOSAL.md`** — thiết kế + **roadmap có checkbox** (nguồn sự thật cho tiến độ). ĐỌC MỤC 9.
- **`PLUGIN-REGISTRY.md`** — 25 plugin @tuanla90: tên chuẩn, mô tả, nhóm, kế hoạch gộp.
- `build-env/BUILD.md` — cách build 1 plugin + **bắt buộc add-markers**.
- `docs/` (nocobase-autobuild) — dự án riêng: sinh app NocoBase từ BRD (khác việc này).

## 1. `@tuanla90/shared` là gì (đã dựng + chạy thật)
`packages/@tuanla90/shared/` = **source lib được BUNDLE thẳng vào từng plugin** (KHÔNG phải runtime dep → plugin
vẫn độc lập). Exports hiện có (`src/`):
- `color.ts`: `COLOR_PRESETS` (16 màu), `colorToString`, `TAG_COLORS`, `TAG_HEX` (primary-6), `tagColorToHex`.
- `colorField.tsx`: `ColorField` (antd ColorPicker + preset + normalize; props `allowAlpha`, `emptyValue`, `size=small`).
- `icons.tsx`: `setIconRegistry(Icon, icons)`, `IconByKey({type})`, `RegistryIconPicker` (**prop `placeholder`**, mặc định 'Select').
- `fieldPicker.tsx`: `FieldPickerCascader` (lazy drill-deep; **`label` nhận ReactNode** → truyền icon lucide không bị caret `▾` thừa), `getFields`, `buildLevelOptions`, `buildFieldCascaderOptions`, `FieldTokenTextArea`.
- `condition.tsx` (**MỚI, 2026-07-13**): smart condition kit — `resolveFieldMeta` (leaf type/enum theo dot-path), `operatorsForMeta`, `ConditionValueInput` (value input thông minh theo type+operator, **prop `size`**; date = antd `DatePicker` → cần `dayjs` external), `evalConditionOp` (evaluator CLIENT), `OP_LABELS`, `DATE_PRESETS`. Lineage từ filter-tree, adapt cho client-eval. Consumer: conditional-format.
- `format.ts` (+ subpath `@tuanla90/shared/format`, pure): `get`, `formatNumber`, `formatDate`, `escapeHtml`, `interpolate`…
- `settingsKit.tsx`: (A) Formily lane + (B) plain-React lane (xem HANDOFF §3 settings-kit).
- `index.ts` re-export tất cả.

**dayjs external (2026-07-13):** `condition.tsx` dùng antd `DatePicker` → `run-shared-build.sh` thêm `--external:dayjs`; consumer phải `mkstub dayjs 1.11.21` (giống filter-tree). dayjs 1.11.x cross-instance OK nhờ marker `$isDayjsObject`.

**Cạm bẫy build shared:** shared có React/antd → `recipes/run-shared-build.sh` phải **externalize** react/antd/
@nocobase/@formily (đã làm) để không bundle bản react riêng. Build = esbuild (cjs+esm) + tsc dts, rồi **sync
sang `build-env/node_modules/@tuanla90/shared`** (consumer build resolve từ đó).

**Hành vi bundle:** client lane (rspack) **inline** shared; server lane (tsup) **vendored** vào
`dist/node_modules/@tuanla90/shared` — cả hai self-contained. Mỗi plugin có **bản shared riêng** → icon-registry
singleton là **per-plugin-per-lane**; mỗi lane phải tự gọi `setIconRegistry` (wiring cũ được giữ nguyên).

## 2. Đã migrate (build + deploy + verify LIVE)
- **Color presets + normalize** → 8 plugin (menu-badge, block-tabs, conditional-format, custom-header,
  filter-tree, field-enhancements×7, login-lite, pwa). Xoá 7 `colorPresets.ts` + inline.
- **TAG_HEX → primary-6** → status-flow (types.ts re-export), field-enh (selectButtons), spreadsheet-view
  (ANTD_TAG -7 → primary-6, dot enum sáng hơn — thay đổi nhìn thấy đã duyệt).
- **ColorField wrapper** → block-tabs, conditional-format, custom-header, filter-tree, field-enh×7, login-lite
  (allowAlpha giữ trong suốt). `size=small` cho gọn.
- **RegistryIconPicker / setIconRegistry / IconByKey** → conditional-format, custom-header, filter-tree,
  field-enh (xoá iconRegistry.tsx local). Sửa ref cũ `plugin-icon-kit`→`custom-icons`.

## 3. CÒN LẠI (giữ thứ tự này — user chốt)
- **P4a field-picker lazy**: bản canonical = ai-column `fieldPicker.tsx` (lazy drill-deep).
  Audit 2026-07-13 (subagent-verified):
  ✅ global-search (0.8.1: `FieldPickerCascader` lazy + runSearch appends to-one).
  ✅ print-template — **đã lazy sẵn** (TemplateManager ×2 + GrapesBodyEditor dùng `api`+`collectionName`); HANDOFF cũ ghi sai.
  ✅ field-enh (0.2.1: richSelect `RS_Html` → lazy, thread `api`/`cf.target`/`dataSourceKey` qua x-component-props).
  ⏭️ block-custom-html — **N/A**: picker chèn CỘT kết-quả-query (`model.resource.getData()` keys, post-aggregate/alias), KHÔNG phải field collection → lazy sẽ ra token SAI. Giữ eager (có comment trong code).
  ⏭️ filter-tree — **user chốt BỎ QUA (2026-07-13)**. KHÔNG phải drop-in: raw antd `Cascader` controlled (hiện value) + clone eager local `buildCascaderOptions` (l.74-94); `FieldPickerCascader` (chèn-rồi-quên) không thay được. Muốn lazy phải thay clone bằng shared `buildLevelOptions` + `loadData` **và seed ancestor** cho label path đã lưu (`client.gender`) — rủi ro UX. Lợi ích chỉ ở `PtdlScopeBuilder` (depth-3 + to-many); `PtdlTreeField` depth-1 vốn rẻ. → P4a coi như XONG; nếu sau này cần perf scope-builder mới quay lại (hoặc chỉ dedup clone → shared `buildFieldCascaderOptions`, an toàn).
- **P4b format helpers** — ✅ **XONG (audit 2026-07-13, subagent)**. `escapeHtml` consolidated 100% (không còn bản local nào); `interpolate`/`toDisplayString`/`formatDate`/`getFields` đã migrate ở global-search (0.8.1) + field-enh richSelect + print-template helpers + filter-tree. Dedup dot-path cuối: ✅ print-template `getByPath`→shared `get` (0.1.1, subpath `@tuanla90/shared/format`), ✅ conditional-format `getPath`→`get` (0.2.1). ⏭️ change-log `formatDateFriendly`→`formatDate` BỎ QUA (plugin WIP, không trong registry, đang sửa live).
  **PHẦN CÒN LẠI CỐ Ý ĐỂ NGUYÊN (domain-specific — ép về shared sẽ vỡ):** formula `formulaFormat` (null-sentinel contract), print-template Handlebars `helpers.ts` (Intl+currency+docSo), block-custom-html `render.ts` interpolate (JS-eval `new Function`) + `helpers.fmt/date` (public API user snippet gọi), ai-column `renderTemplate`/`extractDeps`, enhanced-table `formatNumberLikeSample` (suy format từ sample) + `formatStat`, spreadsheet AG-Grid `valueFormatter`, login-lite `PercentageInput`, filter-tree `fmtValue` (Intl compact), gsheet-sync server `toSheetValue`, field-enh `numberFieldModel` (formatter gắn antd input) + `interpolateHtml` (dual-brace `{x}`+`{{x}}`) + linkField `interpolate` (form-scope + `{value}`), generatedSnippets (RunJS code).
- **settings-kit** — ✅ **KIT XONG (audit 3 subagent 2026-07-13, `docs/SETTINGS-KIT.md`)**. Nhận ra **2 lane**: (A) Formily uiSchema (đã có kit) + (B) plain-React settings page (chưa có → tự chế nhiều). Đã thêm export mới vào `@tuanla90/shared/settingsKit.tsx` (additive, không phá consumer, rebuild shared xong): (A) `SEG_PROPS`, `registerSettingsKit`, `livePreview`/`previewField`, `colorStrip`, `SettingsGrid` responsive (`minColWidth`); (B) `Hint`, `SettingRow`, `ControlGrid`, `SettingCard`, `SaveBar`, `PreviewPane`. **CHƯA migrate plugin nào** (kit "cho sau này" — plugin cũ vẫn chạy bản tự chế).
  **✅ MIGRATE PLUGIN SANG KIT (2026-07-13, 4 subagent behavior-preserving + deploy):** global-search 0.9.2 (lane B: local Hint→`SettingRow.hint`, label rows→`SettingRow`, grid→`ControlGrid`, dark preview→`PreviewPane` boxStyle, Reset/Save→`SaveBar`); conditional-format 0.2.2 (`CARD`→`SettingCard`, label rows→`SettingRow`); menu-enhancements 0.4.6 (3 ColorPicker clone→`ColorField`, register→`registerSettingsKit`); custom-header 0.2.1 (register→`registerSettingsKit` — first adopter); layout-containers 0.4.1 (`showForStyles`→`visibleWhen`, local `SEG_PROPS`→kit). field-enhancements = **không đổi** (đã dùng `ColorField` sẵn, Segmented plain, model đăng ký alias prefix riêng → registerSettingsKit không hợp). Deliberately LEFT: tuned code (layout-containers preview size-fix, colorStrip vì FormGrid≠SettingsGrid responsive), `minHeight:32` align spans (menu-enh), condition-builder rows, `card` double-shadow (global-search). ✅ **VERIFY LIVE (2026-07-13, user login nb-local)**: global-search Settings mở đủ 3 tab; mọi primitive lane-B (`SettingRow`/`ControlGrid`/`SaveBar`/`PreviewPane`/`Hint`/`ColorField`/`Segmented`) render OK; palette mở + search "admin" ra group "Users" (titleOf + i18n + token `{{id}} - {{name}} - {{customer.name}}` chuẩn) → **shared settingsKit render live OK**. (Drawer settings custom-header/layout-containers chưa click tận mắt — served 200, behavior-preserving.)
  **✅ CONDITION-BUILDER DEDUP XONG (2026-07-13):** thêm `ConditionRow` (+ types `ConditionCond`/`ConditionRowProps`) vào `@tuanla90/shared/condition.tsx` — row shared (field Cascader lazy + `operatorsForMeta` + `ConditionValueInput` + remove); props cho phần khác biệt: `connector`, `renderRemove`, `cascaderWidth`, `emptyLabel`, `placeholder`, `fieldLabel`, `style`. Canonical shape `path: string[]`; caller dot-string adapt trong `onChange`. Migrate: menu-enhancements 0.4.7 (`FilterCondRow`→wrapper, path[] shape, X-button, w190) + conditional-format 0.2.3 (`CondRow`→wrapper, dot-string adapt, connector span + lucide-x, w200). Xoá ~150 dòng dup + import thừa (buildLevelOptions/resolveFieldMeta/operatorsForMeta/ConditionValueInput/Cascader). GROUP shell (AND-OR + add + advanced-JSON/rule-card) để nguyên mỗi plugin (quá khác). ✅ **VERIFY (2026-07-13, user login)**: render-body của `ConditionRow` có mặt trong **bundle client-v2 ĐANG CHẠY** của CẢ hai adopter (fingerprint ` → ` displayRender + `No fields` + `Select a field`): conditional-format (49.5KB, 200) + menu-enhancements (63.7KB, 200), kèm group-shell riêng mỗi plugin (Thang màu/scale · badge+advanced-JSON) → migrated code nằm đúng bytes browser thực thi. conditional-format runtime render bảng `/v/` có format live. (Chưa mở drawer rule-builder/badge tận mắt — cần bật UI-editor mode + screenshot timeout ở môi trường này; user click 30s để xác nhận pixel nếu muốn.)
  **DX dts ✅ XONG (2026-07-13):** `run-shared-build.sh` bước tsc dts thêm `--jsx react-jsx --moduleResolution bundler --module esnext --esModuleInterop` → giờ sinh `.d.ts` cho MỌI file `.tsx` (colorField/icons/fieldPicker/condition/settingsKit) với props typed đầy đủ (`React.ReactNode`/`CSSProperties` resolve ở consumer). Trước đây thiếu hẳn → consumer nhận `any`. (18 TS2307 khi build shared vô hại — shared thiếu @types cục bộ, `.d.ts` vẫn tham chiếu react theo tên.) → **shared-libs consolidation XONG hoàn toàn.**
  **✅ SETTINGS-KIT POLISH ĐỢT 2 (2026-07-13, session này — verify LIVE, served 200):** áp house style cho 2 plugin user thấy "xấu":
  • **formula 0.1.1** — `formulaStepUiSchema` thêm `FormulaPreview` **live** (eval công thức trên 1 bản ghi mẫu THẬT của bảng, cập nhật khi gõ, kể cả HTML/format/align; lỗi → #ERR) + gom **Display/Format** `CollapsibleSection` + `SEG_PROPS` cho AlignSeg/FmtTypeSeg. 2 model (column+field) truyền `ctx` vào schema để load sample. **Recipe fix:** `run-formula-build.sh` giờ tự sync version từ workspace package.json (trước chỉ sync `src` → ship nhầm số cũ 0.1.0) + chọn tgz version-exact.
  • **field-enhancements 0.2.4** — 4 subagent behavior-preserving quét 8 model: `SEG_PROPS` mọi Segmented; `SettingsGrid` responsive (`minColWidth` thay `1fr 1fr` cứng, GIỮ hàng có `auto` reset); `colorStrip` (progress gradient/threshold tách theo reaction, boolean on/off — gỡ B_Color thừa); `CollapsibleSection` (progress Colors/Percent text · selectButtons Style/Icons · number Format · inputIcon Appearance · richSelect Preset fields); selectButtons inline `setState`→`visibleWhen`/`rx`. Value tag (conditionalModel) user OK — KO đụng. `relativeDateModel` (model MỚI user tự thêm, đã dùng kit) compile chung OK, ngoài scope.
  • **Button group cao 24/32px** (antd controlHeight; small 24 / default 32 + boxSizing border-box) — `selectButtonsModel` `ButtonGroupView` (nút separated/joined + tag single). User CHỐT style: field widget/pill @tuanla90 phải ≥ antd control height, <28px là "hèn" → memory `feedback_control_height_24_32`. Áp tiếp cho star/progress-edit/number/link/icon-input khi cần.
- ✅ (2026-07-13) `plugin-block-tabs` → **`plugin-layout-containers`** — HOÀN THÀNH: Tabs + **Collapse/Sections**
  (block **và** in-form), settings Collapse (Accordion + Bordered/Ghost/Size/Icon + màu header/active/border,
  live preview), **vertical (Left/Right) chuẩn cho mọi tab style** (card folder dọc, segment chia dọc, step
  connector dọc, button pill dịu), và **sửa lỗi nhảy kích thước** khung config Tab style (preview vertical đặt
  `minHeight` cao hơn cột tab → antd hết bật/tắt "…" overflow). Deployed nb-local + verify bằng repro antd thật
  (`scratchpad/repro`, screenshot không dùng được ở môi trường này → visual do user xác nhận). Client-only, không restart.
  - **(round 2)** Redesign config dialog (Tab block + page + Collapse): Style+Position lên 1 hàng đầu, 5 ô màu dồn
    **1 dải swatch** (`ColorField` shared GIỮ NGUYÊN — chỉ đặt `x-component-props:{showText:false}` + `maxColumns:5` tại
    chỗ dùng, KHÔNG sửa `@tuanla90/shared`), Colors/Layout thành CollapsibleSection mở sẵn. **Card giờ "dính" container**:
    `.ant-tabs-content-holder` có viền+nền `cardActiveBg`, bỏ gap nav↔content, tab active nối liền panel (verify gap=0/−1).
  - **(round 3)** Card dọc/bottom hoàn thiện: **bottom** có nhánh riêng (bo góc dưới, nối lên); **left/right** bỏ guide-line
    trên nav → mỗi tab là hộp riêng, tab active bỏ viền phía-panel + `align-self:stretch` → liền mạch (không đè pixel).
    **Gap thật là `.ant-tabs-tabpane` padding 24px mặc định của antd** (không phải panel) → override `padding:10px`. Chốt
    **Option B** cho cả 4 hướng: folder body có viền = `segBorder` (ĐỒNG BỘ với viền tab, theo "Border color"), cạnh giáp
    tab để mở cho active liền vào, content đệm 10px trong folder. LƯU Ý: block bên trong vẫn có card riêng → có thể thành
    "card trong folder" (2 khung); nếu user muốn 1 khung thì phải target viền card block (chưa làm, hơi fragile).
- Tooling `check-stale` (sharedHash) + `lerna run build --since` (đồ thị qua devDep `@tuanla90/shared`).

## 4. Cách build + deploy (localhost nb-local = D:\...\nb-local, pm2 app `index`)
```bash
cd build-env
bash recipes/run-shared-build.sh                      # khi sửa @tuanla90/shared → build + sync
bash recipes/run-<plugin>-build.sh                    # build 1 plugin (stage src + mkstub + tar)
bash recipes/add-markers.sh storage/tar/@tuanla90/<pkg>-<ver>.tgz   # BẮT BUỘC (client-v2 /v/)
# deploy: giải nén tgz vào CẢ node_modules/@tuanla90/<p> VÀ storage/plugins/@tuanla90/<p> (tar --force-local)
cd ../../nb-local && npx pm2 restart index            # server-lane đổi mới cần restart
```
Verify: `curl .../static/plugins/@tuanla90/<p>/dist/client-v2/index.js | grep <marker>`; app up = `/api/app:getInfo` 200.

**Sau khi sửa `@tuanla90/shared` → `bash recipes/check-stale.sh`**: liệt kê plugin nào có tgz cũ hơn shared/dist (hoặc src đổi)
→ cần build lại + upload lại. **Bảo thủ (so mtime):** "STALE" = shared đổi sau lần build, KHÔNG chắc hỏng — chỉ cần
build lại nếu plugin dùng đúng export vừa đổi. Shared thay đổi kiểu **cộng thêm module** thì plugin cũ vẫn chạy đúng.

## 5. Cạm bẫy recipe (đã gặp)
- Recipe "cũ" (run-condfmt/login/pwa) từng hỏng: `ROOT` thiếu `/..`, không stage src, **PKG sai scope**
  (`@taichuy`, `@nocobase/plugin-pwa`). Đã sửa về chuẩn new-style (stage từ `../packages/@tuanla90/<p>`). Nếu gặp
  recipe khác lỗi `Cannot find .../recipes/node_modules/@nocobase/build` → sửa y hệt.
- `plugin-block-custom-html` build đặc thù → dùng **`run-blockhtml-build.sh`** (không phải run-build-block-html.sh cũ).
- **Externalize theo import trong src (client/rspack):** nocobase-build chỉ externalize package **được import trong
  SOURCE của plugin** (không phải qua node_modules). Nếu plugin dùng antd CHỈ qua `@tuanla90/shared` mà src của nó không
  import antd → rspack cố bundle antd từ shared → `Can't resolve 'antd'`. Fix: thêm `import 'antd'` trực tiếp trong 1
  file src + khai báo antd trong package.json. (Đã gặp ở block-custom-html khi nó dùng shared FieldPickerCascader.)
- **"Plugin dependencies check failed" (Problematic) trên plugin-manager** = NocoBase so `dist/externalVersion.js`
  (version dep lúc BUILD) vs version THẬT trong app. Lệch **MAJOR** → fail cứng (warning); lệch minor/patch → tolerate.
  Gốc: **recipe `mkstub` GIỮ stub cũ nếu đã tồn tại** (`if [ -f package.json ]; then keep real`) → recipe nào stub SAI
  version chạy đầu tiên làm hỏng chung cho mọi build sau (kể cả recipe khác ghi đúng). **Fix:** stub phải khớp version
  thật của app (react-i18next 11.18.6, @emotion/css 11.13.5, dayjs 1.11.21…); sửa cả `build-env/node_modules/<dep>/package.json`
  LẪN các recipe. **CẢNH BÁO:** dayjs là REAL package (main=`dayjs.min.js`) — chỉ bump field `version`, ĐỪNG ghi đè mất `main`
  (require('dayjs') sẽ vỡ). Tool quét: `scratchpad/scan-ext.js` (đọc externalVersion mọi plugin, so version thật).
- **Consumer CHỈ dùng helper thuần** (format) nên import từ **subpath `@tuanla90/shared/format`** (KHÔNG phải barrel
  `@tuanla90/shared`) — barrel kéo colorField/icons/fieldPicker (antd). Tree-shake barrel KHÔNG chắc (enhanced-table được,
  data-viz không → fail antd). Subpath `format` (build riêng `dist/format.{js,mjs}` + `exports` map trong package.json)
  là pure, an toàn. Recipe cũ `run-build-echarts-pro.sh` cũng đã rewrite new-style (ROOT/PKG/stage) như condfmt/login/pwa.

## 6. Conditional formatting BLOCK-LEVEL (2026-07-13) — feature mới, ĐÃ SHIP (cond-fmt 0.2.1)
> Chi tiết kỹ thuật đầy đủ + mọi gotcha: **memory `project-table-oncell-cond-fmt`** (đọc đó trước khi sửa).

- **Tách plugin:** `conditional-format` giờ **CHỈ block-level**. Widget per-column cũ "value → tag" ("Format Rule")
  **chuyển sang `field-enhancements` = "Value tag"** (giữ nguyên tên model `ConditionalStatusFieldModel`/flow key →
  config cột cũ vẫn chạy). field-enh set `globalThis.__ptdlCondFmt` (bridge spreadsheet-view) + `mkstub @formily/antd-v5`.
- **Cơ chế block-level:** patch `TableBlockModel.getColumns()` (client-v2) → bọc `onCell` (style ô: nền/chữ/đậm/
  nghiêng/viền ô/viền chữ) + `render` (chèn icon). antd merge `onCell.style` vào `<td>`. **CRASH-SAFE** (try/catch mọi
  khâu — từng trắng trang vì gọi `rerender()` trong flow handler). Chỉ /v/ (classic không có TableBlockModel).
- **3 mode/rule** (Segmented đầu card, `rule.mode`): **Điều kiện** (nhiều cond xuyên quan hệ, operator theo type,
  AND/OR → chọn cột đích → chữ/nền/đậm/nghiêng/viền ô/**viền chữ**/icon), **Thang màu** (heatmap 2–3 màu theo min–max
  cột), **Thanh dữ liệu** (data bar nền gradient). Scale mode + Điều kiện đều có **màu chữ + viền chữ** (`textOutline`/
  `outlineColor`, dùng `text-shadow` kế thừa). min/max tính từ `resource.getData()`, **memoize** `model.__ptdlRangeCache`.
  - **QUAN TRỌNG:** mọi hàm áp format (`styleForCell`/`iconForCell`) **phải guard `rule.mode`** — nếu không, field của
    tab inactive (vd icon set hồi mode Điều kiện) vẫn áp khi đang ở mode khác. (bug đã gặp + vá.)
- **UI:** field = **antd `Cascader` thật** (không phải chip tự vẽ → khớp size 32px control khác) + lazy `buildLevelOptions`;
  operator/value từ `@tuanla90/shared/condition`; icon `RegistryIconPicker`; toàn bộ **tiếng Việt**. apiClient inject qua
  **module var** (KHÔNG qua Formily x-component-props — bị mất method → picker disable).
- **Deploy version:** cond-fmt bump **0.2.1** — deploy script phải đọc version từ package.json (đừng hardcode 0.2.0,
  dễ deploy nhầm tgz cũ). `latest/@tuanla90` giữ 1 bản/plugin.

## 7. KNOWN ISSUES
- **block-custom-html `helpers.icon('name')` render sai icon** — 🔧 **ĐÃ CHẨN + VÁ (0.12.3, 2026-07-17), CHỜ user xác nhận browser.**
  Loại trừ react-dom: bản deployed dùng `require("react-dom")` = **react-dom THẬT 18.3.1** (không stub), mà 18.3.1
  VẪN có legacy `.render` → giả thuyết "stub rỗng / thiếu .render" KHÔNG đúng. Bug thật = `registryIconSvg`
  **cache cả kết quả `null`**: nếu 1 icon bị tra TRƯỚC khi custom-icons nạp xong registry (preview dialog / thứ tự
  load) → `null` bị cache VĨNH VIỄN → icon rơi về set built-in nhỏ → `circle`/sai. **Fix:** chỉ cache hit; miss thì
  return null KHÔNG cache; thêm guard `reg.has(key)` (bỏ render khi registry chưa có key) → lần sau tra lại tự đúng.
  Đã deploy + served bundle có `.has` guard. **User test:** mở block, `helpers.icon('rocket')`/`helpers.icon('phone')`
  (icon NGOÀI set built-in ~50) phải ra đúng, không phải hình tròn. *(Nhân tiện: reducers + `timeAgo` của buildHelpers
  giờ dùng `@tuanla90/shared` aggregate/relativeTime.)* Comment cũ `plugin-icon-kit` trong render.ts:23,277 vẫn nên dọn.
