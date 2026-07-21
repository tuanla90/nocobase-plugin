# @tuanla90/plugin-branding — plan

Plugin thương hiệu/giao diện gộp: **admin skin builder + presets + import/export** (P1–P2), rồi **hấp thụ login-lite** (P3).
User chọn: *tạo plugin mới `branding`* (thay vì mở rộng login-lite tại chỗ). 2026-07-13.

## Kiến trúc
- **Storage**: collection `brandingConfigs` (JSON `options`, singleton `type='skin'`) — giống pattern `login_configs`.
- **Apply**: client (cả 2 lane) load skin qua action public `getActive` → inject 1 `<style id="ptdl-branding-skin">` vào head, CSS sinh từ config (reuse `gradientCss` của shared). Không phụ thuộc Theme Editor của NocoBase.
- **UI**: settings page (pluginSettingsManager) "Branding" — builder gradient/màu cho **sidebar / header / card** + **preset gallery** + **live preview** + Save.
- **CSS target**: `.ant-layout-sider` (menu trắng chữ), `.ant-layout-header`, `.ant-card`. `!important` để thắng antd CSS-in-JS.

## Phân pha
- **P1** — skin builder core: sidebar+header+card gradient + text color, live preview, presets (dark/glass/animated), inject + persist. ← *đang làm*
- **P2** — import/export bộ branding (JSON).
- **P3** — hấp thụ login-lite: port login UI + migrate `login_configs` + deprecate login-lite.

## Checklist P1
- [x] Scaffold: package.json, index/server/plugin, collection `brandingConfigs`, action `getActive`, stubs client/client-v2/server(+ .d.ts), recipe.
- [x] `shared/skin.tsx`: `buildSkinCss(cfg)` + `PRESETS` + `injectSkin()`.
- [x] Settings page: builder (SettingsGrid + gradient pickers) + preset gallery + live preview + Save (POST brandingConfigs).
- [x] client(-v2): load getActive → inject; register settings page.
- [x] locale vi-VN/en-US.
- [x] Build (`run-branding-build.sh`) + add-markers.
- [x] Install: INSERT applicationPlugins (enabled+installed) + deploy + restart + verify.

## Ghi chú
- login-lite KHÔNG trong nhóm refactor song song → an toàn; nhưng plugin MỚI càng ít đụng plugin đang sửa.
- Raw CSS bọc UI → selector dễ vỡ (dark mode/nâng cấp) → lo `!important` + dark-aware sau.


## P1 — 🚀 XONG (2026-07-13)
Scaffold + skin builder (sidebar/header/card gradient + text, presets dark/ocean/glass/animated/charcoal, live preview) + inject + persist (collection brandingConfigs + getActive public + save). Build + deploy + INSERT DB (id=104) + table tạo tay (CLI pm không install plugin INSERT tay) + seed skin row. App 200, getActive OK, settings page "Branding & Theme" served. latest/ + archive/ có tgz. **Chờ user test browser.**

## Motion (animations) — 🚀 XONG (0.4.9, 2026-07-20)
Thêm lớp **chuyển động UI toàn app** vào cùng stylesheet skin (không plugin mới, không vehicle mới).
- `SkinCfg.motion?: 'off' | 'subtle' | 'lively'` (mặc định `subtle` khi chưa cấu hình → bật sẵn out-of-the-box). `buildMotionCss(level)` trong `shared/skin.tsx`, gọi cuối `buildSkinCss` (append vào `p`) nên áp **kể cả khi chưa set màu gì**.
- **Phủ**: sidebar menu (hover tint + slide `translateX` + icon scale), sider collapse/expand (ease width), record **drawer** (slide + mask fade), **modal/dropdown/select/popover/tooltip** (retime `*-enter-active` animation), nút bấm (`:active scale(.96)`), table row hover; `lively` thêm page-mount fade (drawer-body + page container) + card hover-glow (shadow).
- **An toàn**: chỉ transform/opacity + curve ease-out ngắn; **KHÔNG** `transition:transform` trên `.ant-card` (block /v/ drag bằng inline transform → transition sẽ lag kéo-thả); tự tắt qua `@media (prefers-reduced-motion:reduce)`.
- **UI**: SegmentedGroup "Motion" (Off/Subtle/Lively) trong card *Accent & shape* của skin page, cạnh Density; `applyPreset` giữ `motion` khi đổi preset (như radius/density). Live-preview áp ngay khi đổi.
- i18n: Motion/Subtle/Lively + tooltip (vi-VN). Verified: bundle cả 2 lane có motion CSS, served==deployed byte match (98271). **Chờ user test browser (pane chưa login nên chưa thấy inject — đúng như skin gốc, chỉ áp khi đã đăng nhập).**

## Hide help icon — 🚀 XONG (0.4.10, 2026-07-20)
Thêm toggle **ẩn icon trợ giúp "?"** trên header (dropdown phiên bản · Home page · Handbook · License) vào tab **Header & Logo** (config `type:'nav'`, dùng chung mọi user).
- `NavCfg.hideHelp?: boolean` + `helpSelector?: string`; `DEFAULT_HELP_SELECTOR = '[data-testid="help-button"]'` trong `shared/headerNav.tsx`. `applyNav` push rule `{display:none!important}` — cùng cơ chế hide-top-menu.
- **Selector**: NocoBase render nút help là `<span data-testid="help-button">` ở CẢ 2 lane (/admin + /v/) — verified từ bundle `@nocobase/app`. Chọn `data-testid` (không phải className emotion-hash) vì test-id bền qua nâng cấp. Có ô "Selector (advanced)" để đổi nếu version sau khác.
- UI: card "Hide help icon" (Switch + advanced selector) ngay dưới "Hide top menu"; i18n vi-VN. Verified: selector bundled cả 2 lane, served==deployed (100078). **Chờ user bật toggle + Save.**

## Spring motion (0.4.11, 2026-07-20)
Mức **Lively** giờ dùng **spring vật lý** (CSS `linear()` easing, thuần CSS — KHÔNG thư viện JS) cho các khoảnh khắc "xuất hiện":
- `SPRING_POP` (~+11% overshoot) cho modal/dropdown/select/popover/tooltip (retime `*-enter-active` → scale vọt qua keyframe 100% của antd = pop thật).
- `SPRING_SOFT` (~+5% overshoot) cho record **drawer** (panel to nên nảy nhẹ, đỡ "cụng").
- Duration dài hơn chút khi lively (modal .44s, dropdown .34s, drawer .5s) để thấy được overshoot.
- **Subtle giữ nguyên** (crisp cubic-bezier). Hover/nhấn nút/collapse sider **luôn crisp** ở cả 2 mức — bounce mấy chỗ lặp lại sẽ giật.
- Curve sinh offline (spring underdamped, ζ=0.58/0.70) rồi hardcode chuỗi `linear(...)`. Trình duyệt cũ (Safari <17.2) không hiểu `linear()` → fallback ease, vẫn chạy. `prefers-reduced-motion` vẫn tắt hết. **Chờ user xem độ mạnh, tune nếu cần rồi mới release.**

## Fix hide-help (0.4.12, 2026-07-20)
Hai bug user báo:
- **Bug B (lủng chỗ)**: `[data-testid="help-button"]` là INNER span; nó nằm trong wrapper `<div>` (flex item thật + flex gap). Ẩn mỗi span → wrapper còn chiếm chỗ → lỗ. Fix: `DEFAULT_HELP_SELECTOR = ':is([data-testid="help-button"], :has(> [data-testid="help-button"]))'` — `:has(>…)` ẩn luôn wrapper (thu gọn slot); bọc `:is()` forgiving để trình duyệt không có `:has()` vẫn ẩn được span (khỏi vứt cả rule). Cấu trúc DOM verify từ bundle `@nocobase/app`: `<div nx><span data-testid=help-button padding:16px><icon/></span></div>` (antd Dropdown clone child, KHÔNG thêm wrapper).
- **Bug A ("F5 hiện lại")**: KHÔNG phải bug code — DB cho thấy `hideHelp` không có ở base lẫn 5 theme-scope nào, base `nav.updatedAt`=13/7 (chưa ghi hôm nay) → user **chưa bấm Save** (live-preview ẩn ngay làm tưởng đã áp; Save ở cuối trang masonry dài → dễ miss). Fix UX: **sticky action bar** (Save/Reset luôn hiện) + cờ `dirty` → hiện "● Có thay đổi chưa lưu — bấm Lưu để áp dụng". Giúp mọi toggle trên trang, không riêng hideHelp.
- Verified qua public `getActive` (không cần auth) + `themeConfig:list`. **Chờ user Save + F5 xác nhận.**

## Fix sidebar hover cho menu-sections (0.4.14, 2026-07-21)
Hiệu ứng hover-slide của sidebar (`.ant-menu-item:hover{translateX}`) áp cả cho các item bị `@tuanla90/plugin-menu-enhancements` convert sang **line/title** (chúng vẫn là `li.ant-menu-item`, chỉ khác có marker `[data-ptdl-menu-kind]` bên trong) → divider/title trượt khi hover, sai. Fix trong `buildMotionCss` (`skin.tsx`): thêm **1 override riêng** `.ant-layout-sider .ant-menu-item:has([data-ptdl-menu-kind]):hover{transform:none!important}` — để rule riêng (không `:not(:has())` trên rule gốc) để browser thiếu `:has()` vẫn giữ hiệu ứng cho item thường. Verified matches(): normal=false (giữ slide), divider/title=true (tắt slide). Release chung 0.4.14 với refactor favicon-interval + typography zebra "Auto (theme)".
