# @tuanla90 admin config-page design rules

House rules for any `@tuanla90` plugin **Settings page** so they look native to NocoBase and consistent with each
other. Distilled from the `branding` build-out (verified live on `/v/admin/settings/*`). Pair with the code
kit in `settingsKit.tsx` (`SettingsGrid`, `fieldItem`, `CollapsibleSection`, `ColorField`).

## 1. The container — match native NocoBase
The reference is any core/@tuanla90 settings page (e.g. `change-log`, `print-template/pdf-service`):
- Content sits in a **white, bordered card**: `background: var(--colorBgContainer,#fff)`, `border: 0.8px solid
  var(--colorBorderSecondary,#f0f0f0)`, `border-radius: 8px`, **no shadow**, `maxWidth: 1200; margin: 8px auto 16px`
  (centred, consistent width). Sits under the page-header (title). Use the `ConfigContainer` helper from
  `settingsKit.tsx`, or an antd `<Card>`, or a plain styled `<div>` — but the wrapper MUST carry an **inline
  `border`** (or be `.ant-card`): the `branding` skin's global "clear the grey wrapper divs" rule
  (`:not([style*="border"])`) only spares panels that have one; a border-less `<div>` panel gets its white
  background wiped when a dark skin is active. change-log/print-template survive because they use `<Card>`.
- Do NOT float content directly on the grey settings background — it reads as "unfinished".
- Card body padding 16–20px; the inner content pads itself (don't double-pad).

## 2. Tabs
- Multi-area config → tabs at the **top of the card**. Put any page-wide control (theme scope, mode toggle) in
  `tabBarExtraContent={{ right: … }}` — never a separate row above the tabs (wastes vertical space).
- Native alternative: register N `addPageTabItem` → NocoBase renders tabs in the page-header **footer**; each
  tab's content gets a card container for free. Use this when tabs don't need shared state.
- Do NOT use `overflow:hidden` on the container if any child is `position:sticky` (it kills the stick).

## 3. Width — CONSISTENT across tabs
- Every tab uses the **same** `maxWidth` (branding uses **1440**) + `margin: '0 auto'`. Mixed maxWidths make the
  content visibly resize when switching tabs — the #1 "looks off" smell. Fill the card on normal screens, cap +
  center on ultra-wide (avoids 2-col content spreading thin at 1800px+).

## 4. Editor layout
- Preview + actions on one side (`position: sticky, top: 8`), editors on the other (`display:flex; flex-wrap:wrap;
  gap:20`). Preview `flex: 1 1 340px; max 440`, editors `flex: 2 1 …`.
- Group editor sub-cards in a **fixed** `grid-template-columns: repeat(2, minmax(0,1fr))`. **Avoid
  `auto-fill`/`auto-fit`** when the item count doesn't divide by the column count — it drops a lonely card onto
  its own row (and a full-width `gridColumn:'1 / -1'` card then adds another). Pair deliberately.
- **Varying-height card collections** → CSS masonry, not grid: `columns: '360px 2'` + `break-inside: avoid` on
  each card. Grid rows are as tall as their tallest cell (short cards leave gaps, tall cards sit alone); masonry
  packs by height and reflows as cards expand/collapse.

## 5. Icons
- Inline **Lucide** SVG (`viewBox 0 0 24 24`, `stroke="currentColor" fill="none" stroke-width 2`, render ~14px) —
  no dependency, themable via `currentColor`. Never emoji/symbols in a "designed" control.
- Colour stroke icons via `color`/`currentColor`, **never `fill`** (floods a `fill:none` outline into a blob).

## 6. Controls
- antd control height: small **24** / default **32**. A <28px pill looks cheap.
- Muted labels: `var(--colorTextTertiary,#999)`, 12px. Ranges → `Slider`; modes → `Segmented`; on/off → `Switch`.
- Save (primary) + Reset near the preview; **live-apply on edit**, revert-to-saved on unmount.

## 7. Recolouring antd (accent / buttons)
- antd buttons/controls **ignore injected CSS** (colour is baked into hashed `:where().ant-btn-color-primary…`
  classes; even `*{background:red!important}` won't touch them). Recolour the **primary/accent via the
  `themeConfig` token** (`colorPrimary`), which applies **on reload** — not via CSS. Radius/density have native
  Theme-Editor tokens too; don't reinvent them in CSS.

## 8. Theme-aware config
- Scope per NocoBase theme with `type@<themeUid>` rows + a global `type` fallback (free-string type → zero
  migration). Resolve the active theme sync from `localStorage.NOCOBASE_THEME.uid`. App name stays global
  (`systemSettings.title`). See `branding/THEME-AWARE-PLAN.md`.

## 9. Verifying (NocoBase is heavy)
- `computer{screenshot}` frequently **times out** on the admin. Verify layout with `javascript_tool` +
  `getComputedStyle` — measure widths, `gridTemplateColumns` column counts, element `top`/`left` to prove which
  items share a row. Switch antd tabs via a native `.click()` on `.ant-tabs-tab` (fires the handler).

## 10. Global-CSS injection caveats (only if you theme the app)
- The `/v/` content grey is nested wrappers (a hashed `acss-*` div + a nested `.ant-layout`), not one element.
- Settings/sub-pages nest a **second** `.ant-layout-content` (regular pages have one) — use that to tell them
  apart. Never set `color` on `.ant-layout-content` (cascades into white `.ant-card` blocks). Top-bar icons live
  in `.ant-pro-global-header`, not `.ant-layout-header`. Full detail: branding memory + `THEME-AWARE-PLAN.md`.
