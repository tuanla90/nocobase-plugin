# @ptdl/plugin-branding — plan

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
