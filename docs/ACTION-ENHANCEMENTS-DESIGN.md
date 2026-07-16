# @ptdl/plugin-action-enhancements — Design

> Custom cách hiển thị **action button** trong NocoBase v2: layout thanh action (dọc / chia đều / căn trái-phải) + màu button sâu hơn (nền/chữ/viền/variant/hover).
> Tested target: NocoBase **2.1.19**, antd **5.24.2**. Song ngữ vi+en (R1), reuse `@ptdl/shared` (R2).
> Trạng thái: **v0.1.0 SHIPPED + verified live 2026-07-15** (deployed nb-local). Direction chốt với user 2026-07-15.

---

## STATUS 2026-07-15 (v0.1.0 — built, deployed, e2e-verified trên `/v/`)

**✅ Feature A — deep colour (DONE):** patch `ActionModel` base. Flow `ptdlButtonColour` đăng ký cạnh native
`buttonSettings` (verify qua `AM.globalFlowRegistry.getFlows()`); `renderButton` bọc `<ConfigProvider>` token.
**E2e:** set `props.ptdlBtnStyle` trên `AddNewActionModel` live → nền `rgb(168,85,247)`→`#ff4d4f`, chữ trắng ✓
(token honored, đúng quyết định "token không CSS"). Subclass thừa hưởng patch base ✓. Sống sót reload ✓.

**✅ Feature B — action-bar layout (DONE, form-family):** patch `renderComponent` + registerFlow `ptdlActionBar`
trên `CreateFormModel`/`EditFormModel`/`DetailsBlockModel`/`FilterFormBlockModel`. Wrapper `ActionBarLayout`
tag action `.ant-space` = `.ptdl-ab-space` (layout-effect) rồi CSS scope. **E2e trên `CreateFormModel` live:**
vertical→`flex-direction:column` full-width stack ✓; between→`space-between` (Submit trái x1313 / Actions phải
x1805) ✓; fill→2 nút bằng nhau 285px ✓; right→`flex-end` (Submit x1313→1738) ✓.
**Bug đã sửa (spike B1):** exclusion `.nb-block-grid` sai — nó là ANCESTOR của mọi block nên `closest()` loại
sạch mọi space; bỏ đi (chỉ giữ loại `.ant-table` cho sub-table). `.ant-space` là flex div thường → CSS layout
ĂN (khác gotcha button-internal).

**✅ Live preview trong cả 2 dialog (DONE 2026-07-15):** mỗi step config có field `preview` (`type:void`,
`x-component` đăng ký qua `flowEngine.flowSettings.registerComponents`) — pattern CLR_Preview của field-enh:
`observer(()=>{ const form=useForm(); … })` đọc `form.values` live, render **nút mẫu** (Feature A, cùng
`buildButtonTokens`+ConfigProvider) / **mini action-bar 2 nút** (Feature B, cùng `previewBarStyle`≡`buildCss`).
**Verify:** click radio "Vertical"→preview bar `row→column`; "Right"→`justify:flex-end` ✓ (observer reactive
với input thật). **Trap:** test reactivity KHÔNG dùng `form.setValuesIn/field.setValue/onInput` qua fiber —
form-instance grab được ≠ form render field (kể cả ColorField thật cũng không đổi) → false negative; phải click
control thật (radio) hoặc pick màu thật. defaultParams khởi tạo đủ key (bg/color/… , direction/…).

**✅ UX redesign bar layout (DONE 2026-07-15) — bỏ option chết:** gộp distribution+align (2 field cùng điều
khiển 1 trục → gây "option vô hiệu option kia") thành model TRỰC GIAO: `direction` (horizontal/vertical) +
`hArrange` (horizontal: left/center/right/between/around/fill) + `vArrange` (vertical: left/center/right/**full
width**). uiSchema chỉ hiện `hArrange` khi horizontal / `vArrange` khi vertical qua **`rx()` visibility** (shared
settings-kit) → **mọi option đang hiện đều có tác dụng**. **E2e:** horizontal→chỉ field "Arrangement", bar `row`;
click Vertical→field đổi thành "Alignment" (có Full width), bar `column`; quay lại→"Arrangement". ✓

**✅ Per-button pin (DONE 2026-07-15):** flow `ptdlButtonPin` trên ActionModel (None/Left/Right)→`props.ptdlPin`;
renderButton patch gắn class `.ptdl-pin-left|right`; block `renderComponent` phát hiện `subModels.actions[].props
.ptdlPin` → activate wrapper (kể cả khi KHÔNG có bar config) → CSS `.ptdl-ab-space .ant-space-item:has(.ptdl-pin-
right){margin-inline-start:auto}` đẩy nút ra mép → chia bar thành cụm trái/phải. **E2e:** set pin=right → nút
Submit có class, item `margin-inline-start:auto`, x 1313→1737 (dồn phải), space được mark ✓.

**✅ Button size + button-group UI (DONE 2026-07-15):**
- **Button size** (per-button): field `size` (Small/Medium/Large) trong flow `ptdlButtonColour` (đổi tên hiển
  thị → "Button style"/"Kiểu nút"); handler tách `size`→`props.ptdlSize`, colours→`props.ptdlBtnStyle`;
  renderButton `cloneElement({size})`. **E2e nút thật:** middle 28 / large 35 / small 21 px, đúng cả khi CÓ
  màu (ConfigProvider) lẫn không. **Lưu ý:** preview sample KHÔNG đổi cao theo size (CSS của settings-dialog
  ghim `.ant-btn` height) — preview vẫn phản ánh MÀU; size xem trên nút thật. (đã thử componentSize/size prop
  đều bị dialog CSS override; chấp nhận cosmetic).
- **Button-group UI:** đổi mọi picker layout (direction/hArrange/vArrange) + size sang `Radio.Group` +
  `x-component-props:{optionType:'button',buttonStyle:'solid'}` (hArrange: Select→button group, nhãn ngắn
  Left/Center/Right/Between/Around/Fill). Dialog width 540 (style) / 560 (layout). Verify: size render 3
  `.ant-radio-button-wrapper` trong dialog; introspect uiSchema tất cả `optionType:'button'`.

**✅ Gộp 1 dialog + lưới màu + Shadow (DONE 2026-07-15):**
- **Gộp pin vào "Kiểu nút":** bỏ flow `ptdlButtonPin` riêng → field `pin` nằm chung flow `ptdlButtonColour`.
  ⚙ button giờ 1 mục "Kiểu nút" (Size + Pin + màu) thay vì 2. handler tách size→ptdlSize, pin→ptdlPin,
  còn lại→ptdlBtnStyle.
- **Lưới màu 2 cột** (dùng `SettingsGrid` của shared = `PtdlBtnGrid`, void field → **giữ path phẳng**, verify
  `form.query('bg')` có / `colours.bg` không): `[Background|Text] [Border|Shadow] [Hover BG|Hover text]` — verify
  6 picker, grid `276px 276px`, nhãn đúng thứ tự.
- **Shadow (mới):** ColorField thứ 6; áp `box-shadow: 0 2px 8px <color>` qua **inline style** (không có token) —
  KHÔNG đi qua ConfigProvider (tách khỏi `hasColourTokens`). Verify nút thật: shadow đỏ `rgb(255,77,79) 0 2px 8px`,
  chạy CẢ khi kèm bg (teal) qua ConfigProvider. Preview cũng gắn shadow.

**✅ Table toolbar + observer refactor (DONE 2026-07-15):**
- **Table toolbar:** patch `TableBlockModel` (kind `table`). Toolbar = outer `display:flex;justify:space-between`
  div ôm 2 `<Space>` (left/right native). Wrapper tag **outer flex** `.ptdl-ab-toolbar` (KHÔNG tag từng group,
  tránh vỡ split) + drive `justify-content`/`flex-direction` của nó (`!important` thắng inline). Default kind-
  aware: table = `between` (= native), form = `left`. Wrapper table = **`display:contents`** (trong suốt layout
  → giữ height/scroll của bảng). **E2e:** left→flex-start, center→center, right→flex-end, vertical→column, về
  between→gỡ (native). Flow **kế thừa sang `EnhancedTableBlockModel`** (instance `getFlows()` có ptdlActionBar) →
  ⚙ hiện cho cả bảng thường lẫn enhanced. `super.renderComponent()` của enhanced gọi bản patch → layout áp qua đó.
- **Observer refactor (bug fix):** block nặng (table) KHÔNG re-render khi `setProps(ptdlActionBar)` (observer
  của block không bắt được toggle inactive→active — verify: `renderComponent()` sinh wrapper nhưng DOM đứng im
  2s). Fix: `ActionBarLayout` giờ là **`observer`** đọc `model.props.ptdlActionBar` + pins TRỰC TIẾP, và block
  **luôn wrap** (bỏ gate) → ActionBarLayout tự re-render độc lập block. Form không regress (display:contents +
  observer vẫn chạy vertical/right/pin).

**✅ Table quick-search = 1 ACTION (DONE 2026-07-15, thay block-config):** user muốn di chuyển/pin search →
làm search thành **action toolbar** (`PtdlSearchActionModel extends ActionModel`, `static scene='collection'`,
`registerModels`+`.define({label:'Search bar'})`) thay vì toggle config. Thêm qua menu **"＋ Actions"**, `render()`
(KHÔNG renderButton) trả `<Input.Search>` đọc `this.context.resource`/`collection`. Gõ (debounce 300ms) → filter
`{$or:[{field:{$includes:text}}...]}` field text → `addFilterGroup('ptdlSearch',flt)+setPage(1)+refresh()`. **Di
chuyển:** flow `ptdlSearchSettings` set `props.position` (left|right) → table split native; default `left` (khớp
ảnh: search trái, action phải) + kéo-thả native. **E2e:** addable ✓, render trái ✓, gõ 'suc'→count 249→38, clear
→249, đổi position→sang nhóm phải ✓. **Bug lớn đã fix — REMOUNT:** action re-render/remount mạnh (FlowModelRenderer
+Droppable) → controlled `value` state reset về '' + `useEffect` cleanup xoá filter mỗi remount → search không bao
giờ lọc. Fix: value lưu **trên model** (`action.__ptdlSearchVal`, sống qua remount) + **uncontrolled** input
(defaultValue) + debounce trong `useRef` đọc mọi thứ FRESH + **KHÔNG cleanup xoá filter** (orphaned debounce vẫn
áp đúng value). **Trap:** `getData().length`=page size (20) — đọc `getMeta('count')`; addSubModel trả model SYNC
(không phải promise); thao tác nặng+refresh dễ làm browser-tool timeout 30s → tách nhiều call. Cần stub `lodash`.

**✅ Search config back+front (DONE 2026-07-15, tham khảo native Filter):** ⚙ của search action có step
`ptdlSearchSettings` với **`uiSchema(ctx)` dạng HÀM** đọc `ctx.model.context.collection.getFields()` để dựng
danh sách field động (giống native Filter `filterableFieldNames` dùng `<Transfer>`; ở đây dùng `Select
mode:multiple`). Config: **BACKEND** `ptdlSearchFields` (chọn cột, rỗng=tất cả cột chữ) + `ptdlMatchMode`
(contains/startsWith/exact → `$includes`/`$startsWith`/`$eq`); **FRONTEND** `ptdlSearchPlaceholder`, `ptdlSearchWidth`
(narrow160/normal220/wide320), `position`. handler cũng RE-APPLY filter hiện tại với config mới. **E2e:** set
fields=['status'] + match='exact' → filter captured = `{$or:[{status:{$eq:'success'}}]}` (đúng 1 field + $eq, không
$includes toàn bộ) → count 38; placeholder 'Find order...' + width wide đều áp. Field options từ collection:
status/phone/stage/color/icon.

**✅ Border/Icon options + Transfer picker (DONE 2026-07-15):**
- **Kiểu nút thêm lưới `borderIcon`:** `borderStyle` (Liền/Đứt/Chấm), `borderWidth` (1/2/3px), `borderRadius`
  (Vuông0/Bo8/Viên999), `iconSize` (12/16/20), `iconColor` (ColorField) — Select `allowClear` (rỗng=mặc định).
  Áp: border width/style/radius qua **inline `style`** (inline thắng class antd — verify: dashed 2.4px[=3×0.8 zoom]
  /radius 999/color #1677ff); icon qua **antd `styles={{icon:{color,fontSize}}}`** (5.21+, verify: `.ant-btn-icon`
  color #ff4d4f + inner SVG kế thừa currentColor, fontSize 22px). Preview có `<StarOutlined>` để thấy icon (cần
  stub `@ant-design/icons`). Đều KHÔNG cần ConfigProvider (inline/prop, tách khỏi `hasColourTokens`).
- **Search field-picker → Transfer 2 bảng:** đổi `ptdlSearchFields` từ `Select mode:multiple` sang inline
  x-component `<Transfer>` (dataSource=text fields, targetKeys=value, showSearch, titles Available/Selected) —
  giống hệt native Filter. Verify: x-component là function, render Transfer, dataSource 5 field, targetKeys=['status'].

**✅ Transfer fix + search appearance (DONE 2026-07-15):**
- **BUG Transfer trống → fix:** lấy field-list ở BUILD-time (`uiSchema(ctx).collection`) là RỖNG khi mở dialog
  thật (ctx.model.context.collection chưa có) → Transfer "0 item / No data". Fix: field-picker `SearchFieldTransfer`
  đọc collection ở **RENDER-time** qua **`useFlowSettingsContext()`** (import từ `@nocobase/flow-engine`) — đúng
  cách native FilterActionModel làm. Verify dialog thật: Available list = 5 field (Status/Phone/Stage/Color/Icon).
  **Bài học:** dữ liệu phụ thuộc collection trong flow uiSchema phải lấy qua hook lúc render, KHÔNG qua ctx build-time.
- **Search appearance (theo ảnh user):** thêm `ptdlSearchIconPos` (left=`<Input prefix>` / right=`<Input.Search>`
  nút), `ptdlSearchVariant` (outlined/filled/borderless = antd Input `variant`), `ptdlSearchShape` (square0/rounded8/
  pill999 → borderRadius), **`ptdlSearchBg`+`ptdlSearchText`** (ColorField — nền/chữ tùy chọn, vd pill đen). Áp bg/
  text qua **emotion `css` className** trên Input: wrapper+addon+button `background-color`, `.ant-input` transparent
  (để nền wrapper hiện), text/icon/placeholder = màu chữ. Verify pill đen: wrapper #1f1f1f, chữ+icon trắng, input
  trong suốt, radius 999. Verify: icon-left→prefix, pill→999, filled→bg rgba(0,0,0,0.04).

**✅ Multi-level field picker + search preview (DONE 2026-07-15):**
- **Transfer→Cascader multi-level (fix "vẫn trống"):** `buildFieldCascaderOptions(api, collName, dsKey,
  {maxDepth:1})` của `@ptdl/shared` fetch field tree QUA API (chỉ cần collection NAME + api — robust hơn đọc
  collection object) → `<Cascader multiple>`; association field drill-in (Khách hàng/client → name...). Value =
  dot-path (`['status','client.name']`) → filter `{'client.name':{$includes}}` (search label bảng liên kết).
  Fallback local `getFields()` nếu thiếu api. Verify dialog thật: 14 option, 3 relation có children.
- **Preview search bar:** `SearchBarPreview` observer + `SearchBox` (dùng chung với action). **BUG reactivity:**
  observer truyền cả `form.values` object vào child SearchBox → chỉ track object identity, KHÔNG track key →
  preview không đổi. Fix: **đọc từng key TRONG render của observer** rồi mới truyền (giống ActionBarPreview).
  Verify: click icon-Left→prefix icon hiện, Pill→radius 999. **Shape radius** chuyển từ inline `style` sang
  scoped CSS (Input.Search outer style.borderRadius không tới input box).

**✅ Icon position 3-way (DONE 2026-07-15):** user phản ánh icon "Right" cũ = `Input.Search` nút TÁCH RỜI (thành
hình tròn khi Pill), thiếu kiểu icon-trong-ô-phải + kiểu nút-có-nền. Tách `ptdlSearchIconPos` thành **Left**
(`<Input prefix>` icon trong ô trái) / **Right** (`<Input suffix>` icon trong ô phải = `[Search  🔍]`) / **Button**
(`<Input.Search>` nút riêng có nền/ngăn cách). Default đổi `right`→`left` (nhìn sạch). Verify preview: Left→prefix,
Right→suffix, Button→search button. (suffix luôn có do `allowClear` = X.)

**✅ Icon config redesign (DONE 2026-07-15, theo user):** `ptdlSearchIconPos` = Left/Right (bỏ Button — trùng với
container). Thêm **`ptdlSearchIconContainer`** (None/Border/Fill) → `buildSearchIcon()` bọc icon trong span badge
(border/fill, circle 22px); **`ptdlSearchIconBoxColor`** (màu viền/nền, hiện qua rx khi container≠none) +
**`ptdlSearchIconColor`** (màu icon riêng). searchCss text-color KHÔNG target `.anticon` nữa (để icon giữ màu
riêng), chỉ input+placeholder+clear-X. (Style/Shape/Bg/Text của INPUT: user chốt **GIỮ** — không cãi nhau với
style nút vì là 2 phần tử/2 dialog khác nhau.)

**✅ Fill/Border container ĐÚNG kiểu + bố cục dồn (DONE 2026-07-16, theo user + 4 ảnh mẫu):** user muốn **Fill** =
nút icon lấp đầy Ở MÉP ô (ảnh 1 vuông / ảnh 2 bo — bo theo config **Shape**), **Border** = 1 **vạch dọc liền nét**
ngăn icon với text (ảnh 3 phải / ảnh 4 trái). Bỏ hẳn badge tròn 22px. **Cơ chế mới — TẤT CẢ ở trên 1 cấu trúc
affix-wrapper** (`<Input prefix|suffix>`, width/className nhất quán, KHÔNG dùng antd addon group); container vẽ
bằng **CSS scoped lên chính `.ant-input-prefix/.ant-input-suffix`** (bên chứa icon) trong `searchCss(cfg)`:
  - **v4 — HỢP NHẤT border + fill (2026-07-16, user: "size border & fill phải giống nhau, border-right vẫn sai,
    CHUẨN là border-left"):** border VÀ fill giờ dùng CHUNG 1 span bọc icon (`buildSearchIcon`), `alignSelf:stretch`
    + **`boxSizing:border-box; width:30`** cố định → fill (không viền) và border (viền 1px) RA CÙNG width (1px viền
    được "nuốt" vào trong 30, không cộng thêm). Fill = `background`+bo góc ngoài theo Shape; Border = `borderInline
    <phía text>:1px solid` (icon phải→line trái / icon trái→line phải) = vạch full-height. searchCss cho CẢ HAI chỉ
    stretch affix (+margin −4 → 30px cao) + flush `margin-inline-<mép>:-11px` + `padding:0` + `&
    .ant-input-clear-icon-hidden{display:none}` (fill thêm `overflow:hidden`). **Lý do border-right sai trước đó**:
    `allowClear` nhét ✕ vào cùng `.ant-input-suffix` → tô/style cả suffix khiến ✕ đẩy vạch xa icon (còn border-LEFT
    dùng prefix KHÔNG có ✕ nên đúng → user gọi là bản chuẩn). Span bọc riêng đẩy ✕ RA NGOÀI container. Verify (mock
    đúng cấu trúc antd + span ✕): cả 4 (BL/BR/FL/FR) = **30×30, flushGap 0**; allSameWidth/borderMirrors/
    borderEqualsFill = true.
  - **v5 — chỉ nới rộng container + segmented 32px (2026-07-16):** user muốn "thêm chút padding NGANG cho
    border/fill giống none". Lần đầu tôi làm quá tay (inset + bo đều + 30×22) → **user bác, rollback** ("chỉ bảo
    thêm padding ngang, KHÔNG bảo sửa cách tô màu"). **Đã revert** về bản full-height flush (30 cao, dính mép,
    fill bo góc NGOÀI, border vạch full-height) và chỉ đổi DUY NHẤT: nới rộng box. Chốt **`width:32` + padding 4px ở
    cạnh NGOÀI (flush)** — icon trái→`paddingLeft:4`, icon phải→`paddingRight:4` (user tự chỉnh trong DevTools; case
    phải phải mirror sang padding-right). Segmented `size 'middle'` (~32px, giữ). Verify: icon trái hở 13px mép trái,
    icon phải hở 13px mép phải (mirror). **Bài học: làm ĐÚNG 1 việc được yêu cầu, đừng redesign phần style kế bên.**
  - **Border:** cùng trick `align-self:stretch`+neg-margin → `border-inline-<phía text>:1px solid` cao full 30px =
    **liền nét** chạm trên+dưới. Màu = boxColor|rgba(0,0,0,.15).
  - **Mấu chốt flexbox:** item `align-self:stretch` → **margin-box** bị stretch = cross-size của line (=content-box
    22px); nên **neg-margin −8px tổng ⇒ border-box = 30px** (nở ra ăn vào padding, chạm 2 mép border). Đây là lý do
    vạch/khối "liền nét" full-height mà không cần set height tường minh.
  - **Verify (đo hình học, screenshot /v/ timeout nên đo `getBoundingClientRect`):** cả 5 case `iconBoxH==wrapInnerH==30`
    → `spansFull:true`; A fill-vuông bg#8c8c8c radius0 gap-mép0; B fill-bo radius8; C border-phải `border-left solid`;
    D border-trái `border-right solid`; E fill-pill radius999. Khớp 4 ảnh mẫu.

**✅ Dồn bố cục dialog giảm height (DONE 2026-07-16):** ~14 hàng xếp dọc → **2 hàng full-width** (`preview`,
`ptdlSearchFields`) **+ 6 hàng 2-cột** (`SettingsGrid` alias `PtdlSearchGrid`, giống PtdlBtnGrid → path phẳng):
rowBackend[MatchMode|Width] · rowPlace[Placeholder|Position] · rowIcon[IconPos|IconContainer] ·
rowIconColor[BoxColor|IconColor] · rowStyle[Variant|Shape] · rowInputColor[Bg|Text]. **Picker = antd `<Segmented>`**
(chuẩn/đẹp, thay Radio.Group button — 2026-07-16 theo user; `segCell`: options qua `x-component-props.options` KHÔNG
phải schema `enum`, `block:true`+`size:small`; value/onChange khớp Formily inject); FormItem `marginBottom:8`; dialog
`width 520→560`. **Verify live** (đọc `M.globalFlowRegistry.flows` Map →
`ptdlSearchSettings`): `uiSchema()` chạy `OK`, dialogWidth 560, 6 grids đúng cặp, iconPosEnum[left,right],
iconContainerEnum[none,border,fill], boxColour rx=function.

**⏳ Chưa làm (đợt sau):**
- **Persistence qua ⚙ dialog thật:** đã verify flow ĐĂNG KÝ giống native + apply qua `setProps`/click radio;
  CHƯA click thật qua ⚙ → điền form → **save → reload**. Cơ chế `handler setProps(params)` y hệt native, tin OK.
- **Feature A hover colours:** base bg/text verify; token hover set nhưng chưa hover-test.
- **Deploy:** brand-new plugin → INSERT row `applicationPlugins` (enabled=1, installed=1), không cần tạo bảng
  (plugin không có collection). Dev-loop = swap `dist/` + `pm2 restart index`.

---

## 1. Mục tiêu (yêu cầu user)

1. **Stacked theo hàng dọc** — xếp button dọc thay vì ngang.
2. **Group button chia đều theo hàng ngang** — dàn đều (`space-between` / lấp đầy `flex:1`).
3. **Đổi vị trí submit sang căn trái / căn phải** — căn cả thanh + ghim từng nút.
4. **Custom sâu hơn màu button** — nền, chữ, viền, variant, hover riêng (vượt native "1 màu").

**Phạm vi block (đã chốt):** Form (Add + Edit), Table toolbar, Details, Filter form.
**Cấu hình:** per-block, trong menu ⚙ của block (không làm trang global).
**Thứ tự:** 2 tính năng độc lập, làm song song.

---

## 2. Hiện trạng native (đã đọc source `nb-local/node_modules/@nocobase/client-v2/src`)

### 2.1 Layout thanh action
| Block | File | Cách render hiện tại |
|---|---|---|
| Add-new form | `blocks/form/CreateFormModel.tsx:71` | 1 `<Space wrap>` — **luôn ngang, gói** |
| Edit form | `blocks/form/EditFormModel.tsx:141` | 1 `<Space wrap>` — như trên |
| Details | `blocks/details/DetailsBlockModel.tsx:199` | `mapSubModels('actions')` trong Space |
| Filter form | `blocks/filter-form/FilterFormBlockModel.tsx:625` | Space |
| Table toolbar | `blocks/table/TableBlockModel.tsx:589` | 2 `<Space wrap>` tách theo `action.props.position==='left'`, bọc flex `justify-content:space-between` |

- Form/Details/Filter: **không có** option hướng / phân bố / căn — cứng ngang-gói.
- Table: **đã có** khái niệm trái/phải qua `props.position` → tái dùng được cho yêu cầu #3.
- Container form actions: `FormBlockModel.tsx:646` — `<div style={actionsStyle} ref={actionsRef}>{actions}</div>` — **chỉ inline style, KHÔNG có class ổn định** → phải target qua cấu trúc DOM (`.ant-space`).

### 2.2 Màu / kiểu button
- `base/ActionModelCore.tsx:143` — `renderButton()` = `<Button {...props}/>` (antd).
- `base/ActionModel.tsx:21` — flow `buttonSettings.general` cho config: title, tooltip, icon, iconOnly, `type` (default/primary/dashed/link/text), `danger` (bool), `color` (1 màu, `x-component: ColorPicker`).
- `color` **gated sau `enableEditColor = false`** (ActionModelCore.tsx:67) — tắt mặc định hầu hết action; `enableEditColor` là **class field** (mỗi instance có bản riêng → patch prototype bị shadow).
- antd **5.24.2** Button (`node_modules/antd/es/button/button.d.ts:8-9`) hỗ trợ sẵn `color?: ButtonColorType` + `variant?: ButtonVariantType` (solid/outlined/filled/text/dashed/link × màu bất kỳ) — native chưa khai thác.

### 2.3 Hai cạm bẫy đã biết (memory)
- ⚠️ **antd Button bỏ qua CSS inject** (kể cả `outline !important`) — deep color **phải** qua prop `color`/`variant`/`styles` hoặc `ConfigProvider` component-token, KHÔNG CSS thô. ([[reference_nocobase_antd_token_accent]])
- Pattern patch native block đã có: `enhanced-table-block` **override `renderComponent()` → `super.renderComponent()` → bọc `<div css>`** (`EnhancedTableBlockModel.tsx:81`). Đây là seam layout. ([[reference_nocobase_v2_field_render_patching]])

---

## 3. Kiến trúc plugin

Plugin mới `@ptdl/plugin-action-enhancements` (song song `field-enhancements`). 2 lane: `client` (/admin v1) + `client-v2` (/v/). Đăng ký patch qua **wrap `registerModels`** để bắt cả class late-registered ([[reference_nocobase_v2_field_render_patching]]).

Hai tính năng **độc lập**, chung 1 plugin:

```
plugin-action-enhancements/
  src/
    client/index.tsx, client-v2/index.tsx     # wire i18n (R1) + shared-t + apply patches, mỗi lane
    shared/
      patchActionColor.tsx                      # Tính năng A
      patchActionBarLayout.tsx                  # Tính năng B
      ActionBarLayout.tsx                        # wrapper emotion-css
      colorConfig.ts / layoutConfig.ts          # uiSchema + defaults (song ngữ)
    locale/vi-VN.json, en-US.json
```

---

## 4. Tính năng A — Deep color (per-button)

### 4.1 Config (thêm vào ⚙ của button)
Thêm **1 flow riêng** `ptdlButtonStyle` (hoặc extend `buttonSettings.general`) trên `ActionModel`, dùng `@ptdl/shared`: `ColorField`, `COLOR_PRESETS`, `colorToString` (R2 — cấm tự viết color picker):

| Field | Component | Ghi chú |
|---|---|---|
| `variant` | Radio/Segmented | solid / outlined / filled / dashed / text / link |
| `bgColor` | `ColorField` | màu nền |
| `textColor` | `ColorField` | màu chữ |
| `borderColor` | `ColorField` | màu viền |
| `hoverBgColor` | `ColorField` | nền khi hover |
| `hoverTextColor` | `ColorField` | chữ khi hover |

Handler ghi vào `action.props.ptdlBtnStyle = {...}` (không đụng `enableEditColor` native → tránh class-field shadow).

### 4.2 Apply (patch `ActionModel.prototype.renderButton`)
Wrap `renderButton`: nếu có `props.ptdlBtnStyle`:
- Case đơn giản (chỉ đổi màu chủ đạo + variant) → set thẳng `color` + `variant` prop antd (antd tôn trọng).
- Case tách nền/chữ/viền/hover → bọc button trong **`<ConfigProvider theme={{ components: { Button: { defaultBg, defaultColor, defaultBorderColor, colorPrimary, colorPrimaryHover, defaultHoverBg, defaultHoverColor, ... }}}}>`**. ConfigProvider token **được antd honor** (khác CSS thô — xử lý cạm bẫy 2.3).

### 4.3 Rủi ro A
- Flow config riêng có hiện trong ⚙ button không? (memory cảnh báo extra registerFlow **TableColumnModel** không hiện — nhưng đó là column; ActionModel tự render flow-settings toolbar). **Spike A1:** thử `registerFlow` riêng, fallback = wrap `uiSchema`+`handler` của `buttonSettings.general` native.

---

## 5. Tính năng B — Action bar layout (per-block)

### 5.1 Config (thêm vào ⚙ của block)
`registerFlow` `ptdlActionBar` (settings step) trên **5 class**: `CreateFormModel`, `EditFormModel`, `DetailsBlockModel`, `FilterFormBlockModel`, `TableBlockModel`:

| Field | Options | Map yêu cầu |
|---|---|---|
| `direction` | horizontal (mặc định) / **vertical (stacked)** | #1 |
| `distribution` | packed / **space-between** / space-around / **fill (`flex:1`)** | #2 |
| `align` | left / center / right | #3 (cả thanh) |
| `gap` | number (px) | — |
| per-button `pin` | none / left / right | #3 (từng nút) |

Ghi vào `block.props.ptdlActionBar` (props block persist ổn định — [[reference_nocobase_v2_action_models]]). Per-button `pin` → `action.props.ptdlPin` (table: map sang `position` native sẵn có).

### 5.2 Apply (patch `renderComponent` mỗi block)
Theo pattern `enhanced-table-block`: override `renderComponent` → gọi bản gốc → bọc `<ActionBarLayout config={...}>{original}</ActionBarLayout>`. Wrapper dùng emotion `css` scope, nhắm `.ant-space` của thanh action:
- `direction=vertical` → `.ant-space { flex-direction: column; align-items: stretch }`
- `distribution=space-between` → `justify-content: space-between`
- `distribution=fill` → `.ant-space-item { flex: 1 } .ant-btn { width: 100% }`
- `align` → `justify-content` / `align-items`
- `pin=right` (form/details/filter) → `.ant-space-item:has(.ptdl-pin-right){ margin-inline-start:auto }` (`:has` — Chrome hiện đại OK); patched `renderButton` gắn class `ptdl-pin-*`. Table dùng `position` native.

### 5.3 Rủi ro B
- **Spike B1 (quan trọng):** selector `.ant-space` thanh action form không có class riêng → phải scope để KHÔNG trúng `.ant-space` của field/cell. Form: action Space là Space chính ngoài `.ant-table`/`.ant-formily-item`; table: 2 Space top trong flex space-between. Xác nhận selector ổn định trên live; fallback = override `renderComponent` đầy đủ (nhiều code, nhạy version).
- `:has()` cho pin — verify browser target.

---

## 6. i18n (R1 — bắt buộc)
- NS = `@ptdl/plugin-action-enhancements/client`. File `locale/vi-VN.json` + `en-US.json`, `addResources` **mỗi lane** trong `load()`.
- uiSchema labels: `tExpr(s,{ns})`. Menu/flow title: chuỗi dịch sẵn `app.i18n.t`.
- Wire `@ptdl/shared` color strings: `setSharedT` + `addResources(SHARED_NS, sharedEnUS)` cả 2 lane (vì render `ColorField`).
- Ngôn ngữ thứ 3: nếu VN-string-as-key thì bật fallback en-US + vi identity map (theo guide §R1).

## 7. Reuse `@ptdl/shared` (R2 — bắt buộc)
- Màu: `ColorField`, `COLOR_PRESETS`, `colorToString`, `TAG_HEX`.
- Settings UI: `SettingsGrid`/`fi`/`SEG_PROPS`/`CollapsibleSection` (dùng `rx()` không `{{$deps}}`).
- **Cấm** copy-paste color picker / settings-kit.

---

## 8. Phases (song song A ‖ B)

- **P0** — Scaffold plugin (2 lane, i18n wire, shared wire, wrap `registerModels`). Build rỗng chạy được.
- **P1-A** — Deep color: config step + patch `renderButton` + ConfigProvider. (Spike A1 trước.)
- **P1-B** — Layout: `registerFlow` 5 block + patch `renderComponent` + `ActionBarLayout` wrapper. (Spike B1 trước.)
- **P2** — Per-button pin (form/details/filter qua `:has`, table qua `position`).
- **P3** — Polish: verify i18n live (vi/en/zh), edge (iconOnly, danger, hidden-in-config, drag handler table).
- **P4** — Build (CÁCH A) → deploy nb-local (`node_modules/@ptdl` + `pm2 restart index`, add-markers) → e2e trên `/v/`.

## 9. Verify
- Live `/v/`: mỗi block × mỗi option (dọc/chia đều/căn/pin) + màu (bg/text/border/variant/hover) đúng, reload giữ config (props persist).
- Grep bundle served xác nhận string shipped ([[reference_bundle_verify_grep_gotcha]]).

## 10. Câu hỏi mở
- Tên plugin: `action-enhancements` (đề xuất) vs `action-bar` / `button-style`.
- Layout có áp cho **row-action** trong table cell (`TableActionsColumnModel`) không, hay chỉ toolbar? (hiện plan: chỉ toolbar).
