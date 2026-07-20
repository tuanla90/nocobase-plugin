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
