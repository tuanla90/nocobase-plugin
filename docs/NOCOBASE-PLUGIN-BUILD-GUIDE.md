# NocoBase v2 Plugin — Build, Package & Install Guide

> Bản hướng dẫn để đưa cho session/máy khác build một plugin NocoBase khác.
> Tested: Windows 10 + Node v24 + NocoBase **2.1.x** (07/2026). Chạy được cả Linux/macOS.
> Thay `2.1.19` bằng version NocoBase bạn dùng (`npm view @nocobase/cli version` để xem bản mới nhất).
> Thay `@nocobase/plugin-<name>` bằng tên package plugin của bạn.

---

## 0. Bản chất
- Plugin NocoBase được cài bằng **1 file `.tar.gz` (.tgz)** upload qua Plugin Manager.
- Tar chỉ chứa: `package.json`, `README.md`, và thư mục `dist/` (client bundle + server + locale + externalVersion.js).
- **Bắt buộc build bằng bộ công cụ chính thức `@nocobase/build`** — KHÔNG thể chỉ zip source lại, vì phần client phải được bundle thành UMD mà plugin-loader mới nạp được.

## Yêu cầu môi trường
- Node.js 20/22 (chính thức) — **Node 24 vẫn chạy được**. (`node -v`)
- npm; bật yarn qua corepack: `corepack enable && corepack prepare yarn@1.22.22 --activate`
- Mạng tới npm registry.
- Source plugin (thư mục `@scope/plugin-<name>` có `src/`, `package.json`, `client.js`, `server.js`).

## Cấu trúc source một plugin (tham khảo)
```
@nocobase/plugin-<name>/
  package.json          # name, version, main: ./dist/server/index.js,
                        # peerDependencies: @nocobase/client|server|flow-engine|test = "2.x"
  client.js             # module.exports = require('./dist/client/index.js')  (stub dev, KHÔNG vào tar)
  server.js             # module.exports = require('./dist/server/index.js')  (stub dev, KHÔNG vào tar)
  client.d.ts server.d.ts
  README.md
  src/
    index.ts            # export * from './server'
    server/index.ts, server/plugin.ts      # class extends Plugin (server)
    client/index.tsx, client/plugin.tsx     # class extends Plugin (client)
    client/*.tsx                            # models / components
    locale/vi-VN.json, en-US.json   # i18n BẮT BUỘC (xem QUY TẮC bên dưới)
```

---

# ⚙️ QUY TẮC BẮT BUỘC KHI LÀM PLUGIN MỚI (@tuanla90)

> Áp dụng cho MỌI plugin @tuanla90 mới **hoặc** sửa lớn. Đây là điều kiện review — không đạt thì chưa xong.

## R1. i18n song ngữ — BẮT BUỘC (không hardcode 1 thứ tiếng)
Mọi chuỗi UI phải qua i18n ngay từ đầu (vi-VN + en-US). NS = `@tuanla90/plugin-<name>/client`.
- **Nhãn trong uiSchema settings** (Formily/flow-engine, framework compile `{{t()}}`): `const t = (s) => tExpr(s, { ns: NS })` — `tExpr` import từ `@nocobase/flow-engine`.
- **Chuỗi render runtime** (React/JS): `app.i18n.t(s, { ns: NS })` — route qua prop vào component; **đừng** đọc window global (`/v/` fail). Xem [[reference_nocobase_v2_block_i18n]].
- **Nhãn menu** (block-picker label, flow/step title): dùng chuỗi **dịch sẵn runtime** (`app.i18n.t`), **KHÔNG** dùng `{{t()}}` (menu không compile expression).
- File `src/locale/vi-VN.json` + `src/locale/en-US.json`; đăng ký **mỗi lane** (client + client-v2) trong `load()`: `this.app.i18n.addResources('<lang>', NS, json)`.
- i18next fallback về key khi thiếu → chỉ cần 1 file bên phía "không phải mặc định".
- **Ngôn ngữ thứ 3 (≠ en/vi) → mặc định EN (không để rơi về tiếng Việt):** NocoBase KHÔNG set `fallbackLng` → chuỗi thiếu trả về KEY. Plugin **VN-string-as-key** (chỉ có `en-US.json`) → user chọn zh/ja/fr… sẽ thấy **tiếng Việt** (key). Fix (đã áp cho 7 plugin VN-as-key: ai-column, block-custom-html, conditional-format, formula, gsheet-sync, print-template, spreadsheet-view): trong `load()` (mỗi lane) — (1) bật fallback en-US `app.i18n.options.fallbackLng='en-US'` **VÀ** `app.i18n.services.languageUtils.options.fallbackLng='en-US'` (i18next 22.x đọc từ languageUtils — set thiếu chỗ này là vô hiệu); (2) đăng ký **vi-VN identity map** sinh runtime từ chính en-US: `app.i18n.addResources('vi-VN', NS, Object.fromEntries(Object.keys(enUS).map(k=>[k,k])))` — để vi vẫn hiện VN (không rơi về en). Làm tương tự cho `SHARED_NS`+`sharedEnUS` ở các plugin render đồ shared (addResources MERGE nên chỉ cần ≥1 plugin đăng ký identity cho `SHARED_NS` là đủ cả app). Kết quả (verify live qua `window.__nocobase_v2_app__.i18n`): zh→EN, vi→VN, en→EN. Fail-safe: nếu mutation không ăn thì unsupported vẫn giữ VN (không crash, không phá vi). Plugin English-source (có `vi-VN.json`) không cần vì key đã là English.
- **Chuỗi render của `@tuanla90/shared`** (nút field-picker `＋ Chèn cột`, empty-state `(không có field)`, condition-kit: operator/date-preset/value-input `giá trị`/`Có`/`Không`/`số`…): shared **không có i18n context riêng** (được bundle vào plugin) → mỗi plugin **có render field-picker / condition-kit / UI chung phải wire trong `load()` (cả 2 lane)**: `import { setSharedT, SHARED_NS, sharedEnUS } from '@tuanla90/shared'`, rồi `app.i18n.addResources('en-US', SHARED_NS, sharedEnUS)` + `setSharedT((s,o)=>app.i18n.t(s,{ns:SHARED_NS,...(o||{})}))`. VN-string-as-key (vi = fallback về key). Bỏ wire → chuỗi hiện tiếng Việt cho user en. **Đã wire (8 plugin):** field-picker → block-custom-html, formula, ai-column, global-search, print-template, field-enhancements (qua `registerAll`); condition-kit (`ConditionRow`) → conditional-format, menu-enhancements. **Lưu ý:** hằng số module-level (`OP_LABELS`, `DATE_PRESETS`) giữ nguyên chuỗi VN làm KEY, chỉ gọi `st()` lúc RENDER (trong `operatorsForMeta` / map options) — `st()` ở lúc định nghĩa module sẽ chạy trước khi `setSharedT` được inject → dính key VN.
- **Mẫu chuẩn:** `plugin-custom-header` (tExpr+NS), `plugin-enhanced-table-block` (addResources), `plugin-data-visualization-echarts-pro` (runtime `t` truyền vào config), `plugin-filter-tree` (tExpr cho uiSchema + `rt()` cho render/menu).
- **Migrate VN-hardcode:** giữ chuỗi VN **làm key**, chỉ thêm `en-US.json` map VN→EN (vi hiển thị qua fallback) — ít rủi ro nhất.

## R2. Dùng lại `@tuanla90/shared` — BẮT BUỘC (đừng tự viết lại / copy-paste)
Import từ `@tuanla90/shared` (được **bundle** vào plugin, KHÔNG phải runtime dep). Khai báo `@tuanla90/shared` là **devDependency** (đã có lerna graph). Đã có sẵn:

| Mảng | Import từ `@tuanla90/shared` |
|---|---|
| **Màu** | `ColorField`, `COLOR_PRESETS`, `colorToString`, `TAG_HEX`, `tagColorToHex` |
| **Icon** | `setIconRegistry`, `IconByKey`, `RegistryIconPicker` (provider Lucide = `custom-icons`) |
| **Field picker** | `FieldPickerCascader`, `FieldTokenTextArea`, `getFields`, `buildFieldCascaderOptions`, `buildLevelOptions` |
| **Relation picker (appends)** | `RelationAppendsPicker`, `buildRelationOptions` — chọn QUAN HỆ nhiều cấp thành dot-path tag (cho `appends`/`preload`), KHÁC field-picker (chọn cột lá). Đừng tự dựng lại cascader `collections:get?appends=fields`. |
| **Điều kiện** | `resolveFieldMeta`, `operatorsForMeta`, `ConditionValueInput`, `evalConditionOp`, `ConditionRow`, `OP_LABELS`, `DATE_PRESETS` |
| **Format** | `formatNumber`, `makeNumberFormatter`, `formatDate`, `escapeHtml`, `interpolate`, `get`, `toDisplayString` — **đừng tự viết** `toFixed`+`\B(?=(\d{3})` hay token `.replace(/YYYY/)`: đó chính là dup đang tồn (formula/spreadsheet/enhanced-table/field-enh). |
| **Chèn biến / template** | `FieldTokenTextArea`, `getCaretElement`, `insertAtCaret` (chèn token `{{field}}` vào textarea), `interpolate` (thay `{{ }}`/pipe-filter trong chuỗi). *(interpolate của block-custom-html là `new Function()` JS-eval — KHÁC, không phải cái này.)* |
| **Settings-kit** (Formily) | `SettingsGrid`, `fi`/`fieldItem`, `rx`/`visibleWhen`, `ResetButton`, `PreviewBox`, `CollapsibleSection`, `SEG_PROPS`, `colorStrip`, `livePreview` |
| **Settings-kit** (plain-React) | `Hint`, `SettingRow`, `ControlGrid`, `SettingCard`, `SaveBar`, `PreviewPane`, `ConfigContainer` |
| **Realtime / WS** | `onLiveRefresh`, `onWsMessage`, `refreshFlowBlocks`, `LIVE_REFRESH_TYPE`, `DATA_CHANGED_TYPE` (đẩy WS server→client, tự refresh block) |
| **Login** | `loginKit` (gradient, theme palette, account/password icons) |

Ngoài `@tuanla90/shared`:
- **Layout** (Tabs / Collapse / Section trong form): dùng block của **`@tuanla90/plugin-layout-containers`**, đừng tự dựng container.
- **Field component** (widget hiển thị/nhập cột): theo pattern **`field-enhancements`** (`registerAll` + `bindModelToInterface`, `isDefault` theo registry).
- **Reuse chéo tính năng** (B dùng model/widget của A): qua **registry runtime OPTIONAL, graceful** (thiếu A thì fallback, không lỗi) — vd `filter-tree` đọc `ptdlComputedRules` của `formula`.

**Cấm:** copy-paste color/icon/field-picker/settings-kit/format/condition vào plugin mới (đã từng drift — xem `SHARED-LIBS-PROPOSAL.md`). Thiếu gì trong shared thì **bổ sung vào `@tuanla90/shared`** rồi mới dùng.

**CHƯA có trong shared (nếu cần thì đề xuất bổ sung, đừng copy bản local):**
- **Relative-time** ("X phút trước" / "2h ago"): hiện 3 bản local (block-custom-html `timeAgo`, change-log `relativeTime`, field-enh) — chưa gom.
- **Aggregate/data-helper** (`sum/avg/min/max/count/groupBy/median`): hiện ≥5 bản local (block-custom-html `buildHelpers`, print-template `arraySum/Avg`, spreadsheet, filter-tree, enhanced-table) — chưa gom.

**Ngoại lệ điều kiện:** `filter-tree` giữ taxonomy operator riêng (`SCOPE_OPS`/`OPS_*`) vì build **server-JSON query** (cần variables/date-descriptor server-resolve) — chỉ share được phần UI, không phải `evalConditionOp`. Đây là ngoại lệ có chủ đích của rule "cấm copy condition".

Chi tiết: `SHARED-LIBS-PROPOSAL.md`, **`docs/SHARED-DEDUP-AUDIT.md`** (rà soát tồn dư 2026-07-15), `docs/SETTINGS-KIT.md`, `docs/COLOR-PICKER-STANDARD.md`.

---

# CÁCH A — Build tối giản (KHUYẾN NGHỊ, nhanh, không cần app đầy đủ, không cần DB)

Chỉ cài `@nocobase/build`. Né việc cài `@nocobase/server` + driver DB + native module (đặc biệt lợi trên Windows/Node 24). ~2–4 phút.

## A1. Dựng thư mục `build-env`
```
build-env/
  package.json     # {"name":"build-env","private":true,"version":"1.0.0"}   <-- KHÔNG có "workspaces"
  lerna.json       # {"version":"independent","npmClient":"npm","packages":["packages/*/*","packages/*/*/*"]}
  tsconfig.json    # {"compilerOptions":{"jsx":"react-jsx","esModuleInterop":true,"skipLibCheck":true,
                   #   "moduleResolution":"node","target":"esnext","module":"esnext","resolveJsonModule":true,"baseUrl":"."}}
  packages/plugins/@nocobase/plugin-<name>/   <-- ĐẶT SOURCE PLUGIN vào đây
```
Vì sao dùng `lerna.json` + KHÔNG có `workspaces`:
- `@nocobase/build` tìm plugin qua glob `packages` của lerna → phải khớp `packages/plugins/@scope/name`.
- Không để `workspaces` trong package.json để npm **không** cố cài peerDependencies (`@nocobase/server`...) khi `npm install`.

## A2. Cài builder (khớp version NocoBase)
```bash
cd build-env
npm install @nocobase/build@2.1.19 --no-audit --no-fund
```

## A3. Tạo "stub" version cho các thư viện framework mà plugin import
Builder đánh dấu các lib framework là **external** (không bundle). Nó chỉ cần đọc `version` trong `package.json` của chúng để ghi `dist/externalVersion.js`. → Tạo stub (chỉ chứa name+version). Chỉ stub package nào **chưa** là dependency thật của `@nocobase/build`.

Xem plugin import gì: đọc các dòng `import ... from '<package>'` (bỏ import tương đối `./`) trong `src/`.
Bộ thường gặp cho plugin block phía client:
```
react  lodash  antd  @ant-design/icons  @emotion/css  react-i18next
@formily/react  @nocobase/client  @nocobase/server  @nocobase/flow-engine
```
Version chính xác cho NocoBase 2.1.19 (lấy qua `npm view @nocobase/client@2.1.19 dependencies peerDependencies`):
```
@nocobase/*        2.1.19
antd               5.24.2
@formily/react     2.2.27
@ant-design/icons  5.6.1
@emotion/css       11.11.1   (bất kỳ 11.x)
react-i18next      11.15.1
react              18.3.1
lodash             4.17.21
```

## A4. Script `build-env/run-build.sh` (chạy nguyên si)
```bash
#!/usr/bin/env bash
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
NM="$ROOT/node_modules"
PKG="@nocobase/plugin-<name>"      # <-- ĐỔI tên package plugin

# Stub version cho external deps (chỉ khi chưa có thật). Chỉ dùng cho externalVersion.js.
mkstub() {
  local name="$1"; local ver="$2"
  if [ -f "$NM/$name/package.json" ]; then echo "keep real : $name"; return; fi
  mkdir -p "$NM/$name"
  printf '{"name":"%s","version":"%s"}\n' "$name" "$ver" > "$NM/$name/package.json"
  echo "stub      : $name@$ver"
}
mkstub react 18.3.1
mkstub lodash 4.17.21
mkstub antd 5.24.2
mkstub "@ant-design/icons" 5.6.1
mkstub "@emotion/css" 11.11.1
mkstub "react-i18next" 11.15.1
mkstub "@formily/react" 2.2.27
mkstub "@nocobase/client" 2.1.19
mkstub "@nocobase/server" 2.1.19
mkstub "@nocobase/flow-engine" 2.1.19
# (thêm/bớt mkstub theo đúng các import của plugin)

# Build client (rspack->UMD) + server (tsup->cjs) + đóng gói .tgz.
# --no-dts: bỏ sinh .d.ts (không cần cho cài; tránh phải có type thật của external).
node "$NM/@nocobase/build/bin/nocobase-build.js" "$PKG" --tar --no-dts

echo "=== TAR OUTPUT ==="
find "$ROOT/storage/tar" -type f
```
Chạy: `bash run-build.sh`

## A5. Kết quả
```
build-env/storage/tar/@nocobase/plugin-<name>-<version>.tgz   <-- file để upload
```
Nội dung tar hợp lệ: `package.json`, `README.md`, `dist/{client/index.js, server/index.js, index.js, locale/*, externalVersion.js}`.

(Tuỳ chọn) Nếu 1 version trong `dist/externalVersion.js` hiển thị lạ → sửa tay file đó rồi đóng gói lại KHÔNG build lại:
```bash
node node_modules/@nocobase/build/bin/nocobase-build.js @nocobase/plugin-<name> --only-tar
```

---

# CÁCH B — App NocoBase đầy đủ (khi cần CHẠY THỬ plugin trên trình duyệt)

Dùng khi muốn 1 NocoBase sống để test UI.
```bash
corepack enable && corepack prepare yarn@1.22.22 --activate
npx -y create-nocobase-app@2.1.19 nb-local --quickstart   # scaffold app sqlite (chỉ tạo khung, KHÔNG tự cài)
cd nb-local
```
Sửa `.env`:
```
DB_DIALECT=sqlite
DB_STORAGE=storage/db/nocobase.sqlite
```
Thêm `"sqlite3": "^5.1.7"` vào `dependencies` của `package.json` (quickstart thiếu driver sqlite).
```bash
yarn install                 # ~10 phút, ~1GB
yarn nocobase install        # khởi tạo DB + tạo tài khoản root (admin@nocobase.com / admin123)
# đặt plugin tại packages/plugins/@scope/plugin-<name>
yarn nocobase build @nocobase/plugin-<name> --tar     # build + đóng gói -> storage/tar/
yarn dev                     # chạy tại http://localhost:13000  (lần đầu build client vài phút)
```
Ghi chú:
- `sqlite3` có sẵn binary prebuilt cho Node 24/Windows → không cần trình biên dịch.
- Tài khoản root lấy từ `.env` `INIT_ROOT_EMAIL / INIT_ROOT_PASSWORD` (mặc định admin@nocobase.com / admin123, nickname "Super Admin").
- Trong app này cũng có thể build plugin y như CÁCH A.

---

# ĐÓNG GÓI (tóm tắt cờ builder)
| Cờ | Ý nghĩa |
|---|---|
| `--tar` | Build xong đóng gói `.tgz` vào `storage/tar/<name>-<version>.tgz` |
| `--no-dts` | Bỏ sinh khai báo TypeScript (không cần cho cài) |
| `--only-tar` | Chỉ đóng gói lại `dist/` hiện có, KHÔNG build lại |

---

# CÀI ĐẶT / BẬT PLUGIN
### Qua UI
Plugin Manager (góc phải trên) → **Add & Update** → tab **Upload plugin** → chọn `.tgz` → **Submit** → **Enable**.
Sau khi Enable (dev mode) → **hard refresh** trình duyệt (Ctrl+Shift+R).

### Qua CLI (trên server/container đã có plugin trong node_modules)
```bash
yarn nocobase pm add @nocobase/plugin-<name>
yarn nocobase pm enable @nocobase/plugin-<name>
```

---

# LẶP NHANH KHI DEV trên instance đang chạy (CÁCH B)
Sau khi build lại, tráo `dist/` mà không cần upload lại:
```bash
cp -r build-env/packages/plugins/@nocobase/plugin-<name>/dist \
      nb-local/node_modules/@nocobase/plugin-<name>/dist
# rồi hard refresh trình duyệt (client bundle phục vụ tĩnh từ dist/client của plugin)
```
Xác minh bundle server đang phục vụ đúng code mới (bundle bị MINIFY nên grep **chuỗi literal**, đừng grep tên hàm):
```bash
curl -s http://localhost:13000/static/plugins/@nocobase/plugin-<name>/dist/client/index.js | grep -c "Một Chuỗi Nhãn Nào Đó"
```

---

# ⚠️ CẠM BẪY (đã gặp thực tế trong session này)

1. **Windows — lỗi symlink EPERM khi upload**: `pm:add` trả `{"data":"ok"}` nhưng plugin **không hiện trong danh sách** để bật. Log server: `Failed to create symlink ... EPERM`. NocoBase không tạo được symlink từ `storage/plugins/...` → `node_modules/...` (Windows chặn symlink nếu không có quyền).
   - **Fix**: bật **Windows Developer Mode** (Settings → Privacy & security → For developers) hoặc chạy NocoBase bằng **Administrator**; hoặc `cp -r` thủ công plugin đã giải nén từ `storage/plugins/...` sang `node_modules/...`.
   - **Không xảy ra trên Linux/Docker.**

2. **403 "You are not allowed to perform this action" khi upload**: đây là **ACL từ chối**. Trong NocoBase chỉ role tên nội bộ `root` mới bỏ qua toàn bộ ACL. Nếu đứng sau reverse proxy/edge (Railway/Nginx/Cloudflare) làm **mất header `X-Role`**, server không nhận ra bạn là root → 403.
   - **Chẩn đoán**: DevTools → Network → request `pm:add` → Request Headers → xem `X-Role` có phải `root` không.
   - **Fix**: đăng nhập root qua kết nối trực tiếp/localhost; cấu hình proxy forward header `X-Role`; hoặc cài qua CLI / nhúng plugin sẵn vào image.

3. **git clone trên Windows (đường dẫn quá dài)**: `git config core.longpaths true`; dùng `git sparse-checkout` để chỉ lấy 1 plugin trong monorepo.

4. **externalVersion.js**: chỉ là metadata tương thích (cosmetic). Nếu 1 version stub lạ → sửa + `--only-tar`.

5. **Node version**: NocoBase v2 chính thức Node 20/22; Node 24 thực tế chạy được.

6. **AN TOÀN**: KHÔNG `npm install`/`yarn install` source plugin lạ khi chưa soi `package.json` (kiểm tra field `scripts` — không có postinstall độc hại), không eval/child_process/fetch ra ngoài đáng ngờ.

7. **Bump version**: tăng `version` trong package.json của plugin mỗi lần build mới để NocoBase coi lần upload sau là "update".

---

# CHECKLIST NHANH (CÁCH A)
```
[ ] node -v ; corepack enable ; corepack prepare yarn@1.22.22 --activate
[ ] tạo build-env/{package.json(no workspaces), lerna.json, tsconfig.json}
[ ] đặt source vào build-env/packages/plugins/@scope/plugin-<name>
[ ] cd build-env ; npm install @nocobase/build@<ver> --no-audit --no-fund
[ ] sửa run-build.sh (PKG + danh sách mkstub theo import của plugin)
[ ] bash run-build.sh
[ ] lấy build-env/storage/tar/@scope/plugin-<name>-<ver>.tgz
[ ] upload qua Plugin Manager → Enable → hard refresh
```
