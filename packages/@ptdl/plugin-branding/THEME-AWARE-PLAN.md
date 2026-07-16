# Branding — Theme-aware refactor (design & plan)

**Goal:** every branding surface can differ **per NocoBase theme** (Light / Dark / any custom theme). Switch
theme → the whole look (skin gradients, logo, login, typography, nav, favicon, accent) switches with it.
Configure once = applies to all themes; override a theme only when you want it different.

Status: PLANNED. Owner: this session is the source of truth (the parallel session stopped).

---

## 1. Verdict on the approach

The proposed model is sound. Verified load-bearing facts (live, 2026-07-14):

- **Current theme = per-user.** `currentUser.systemSettings` is a **JSON string** `"{\"themeId\":5}"` → parse →
  `themeId`. Falls back to the `themeConfig` row with `default:true` when unset.
- **id → uid** via `themeConfig:list` (e.g. id 5 → uid `95ssd8x7j6h`; built-ins: `default`/`dark`/`compact`/`compact_dark`).
- **App title is global**: `systemSettings.title` ("NocoBase") — one value shared by browser tab + login + PWA.
  **App name is NOT per-theme** (correct — it can't be).
- **Switching theme reloads the page** → the plugin re-inits and reads the new theme. No live-swap engine
  needed; reload is the apply path. (`theme-editor:runtime-refresh` is an optional extra hook for live token edits.)
- `useGlobalTheme().isDarkTheme` exists in `@nocobase/client` for light/dark checks.

**No DB schema change** — `brandingConfigs.type` is a free string, so we key rows by `skin@<uid>` etc.

---

## 2. The two layers (key framing — don't reinvent layer A)

| Layer | What | Per-theme? | Managed by |
|---|---|---|---|
| **A. antd theme token** | `colorPrimary`/accent, `borderRadius`, dark/light `algorithm`, base bg/text | **Already per-theme (native)** — each `themeConfig` row has its own `config.token` | NocoBase Theme Editor + our `setAccent` |
| **B. branding overlay** | skin gradients (sidebar/header/container/card), logo (light+dark img), login look, typography (font + tables), nav (hide-menu/logo-link), favicon | **We make it per-theme** via `type@uid` | this plugin |

**Consequence:** accent, corner radius, and dark/light are **already per-theme in NocoBase** — we must not
duplicate them as CSS. Our only job for layer A is: **`setAccent` writes to the theme *currently being edited*,
not always `default:true`.** Everything else in layer A the user does in Theme Editor. Layer B is the real work.

---

## 3. Storage model (additive, zero migration)

- Scoped rows: `skin@<uid>`, `nav@<uid>`, `typography@<uid>`, `logo@<uid>`.
- **Fallback chain**: `skin@<uid>` → (miss) → `skin` (global) → (miss) → built-in default.
- Existing `skin` / `nav` / `typography` rows become **"Default (all themes)"** automatically — nothing lost.
- Recommended tiny server tweak (optional but clean): `getActive` — if `type` contains `@` and the exact row
  is missing, fall back to the base `type` in ONE request. (Else client does 2 requests.)

---

## 4. Current-theme resolver (shared helper)

```
currentThemeUid(api):
  post-auth: id = JSON.parse(currentUser.systemSettings||'{}').themeId  // per-user
             || themeConfig row where default:true
  pre-auth (login page): themeConfig row where default:true             // no user yet
  return themeConfig:list → row(id).uid    // cache the id→uid map
```

One helper used by **all 4 tabs** (load/save scoped) **and all runtime loaders**. Minimises churn in
`skin.tsx` (which is large + was co-edited).

---

## 5. Settings UX

- A **theme scope dropdown** at the top of the Branding page: *"Đang chỉnh cho: [Mặc định · Test · Dark · …]"*.
- Defaults to the theme you're currently using. Includes an explicit **"Mặc định (mọi theme)"** entry (writes the
  global `skin`/`nav`/… rows).
- Changing it re-loads/saves all 4 tabs in that scope. A row that's still on fallback shows a subtle
  *"đang dùng bản Mặc định"* hint so it's obvious what's inherited vs overridden.

---

## 6. What is per-theme vs global

- **Per-theme (layer B):** skin · typography · nav · logo (light+dark) · favicon.
- **Per-theme (layer A, native):** accent (`colorPrimary`), radius, dark/light — via Theme Editor + `setAccent`
  retargeted to the edited theme.
- **Global (cannot be per-theme):** **app name** (`systemSettings.title`).

## 7. Login page (pre-auth reality)

Pre-auth there is **no user → no per-user theme**, so login can only follow ONE theme = the **`default:true`
theme's branding**. So: "login theo theme" = *login shows the default theme's skin/logo/login-colours*. There is
NO per-viewer light/dark on login (would need `prefers-color-scheme`; out of scope). Login theming = a
`login@<default-uid>` config applied on `/signin`. (This is the login-lite absorption, P-later.)

## 8. Import / Export

Already dumps **all** `brandingConfigs` rows (`find()` with no filter) + all `themeConfig` themes → it captures
`*@uid` rows and every theme's token automatically. Minimal/no change; just confirm the bundle round-trips scoped rows.

---

## 9. Phasing (incremental, verify each)

1. **[DONE]** **Foundation** — `src/shared/themeScope.ts` (`currentThemeUid()` from `localStorage.NOCOBASE_THEME.uid`,
   `scopedType()`, `listThemes()`) + `getActive` base-type fallback + `setAccent` accepts `uid`. Verified: server
   scope + fallback (`skin@uid`→scoped, `skin@dark`→global).
2. **[DONE]** **Skin per-theme** — shared theme dropdown in `BrandingPage`; `BrandingSkinPage(scopeUid)` scoped
   load/save; loader resolves current theme; `setAccent` retargeted to edited theme. Verified live.
3. **[DONE]** **Typography per-theme** — same pattern.
4. **[DONE]** **Nav (+ logo) per-theme** — `nav` config carries the logo images, so scoping `nav` makes logo
   per-theme too. Verified live (all 4 tabs mount, scoped resolution falls back to global).
5. **[DONE]** **Favicon** — lives in the `nav` config (`NavCfg.favicon`) → per-theme via #4. Logo (light/dark)
   too. Verified.
6. **[DECIDED — NOT merged]** **Login** — login is pre-auth (no user → no `themeId`), so it can only ever be a
   single look; it does NOT fit the per-theme model. Keep **login-lite** as the login-appearance tool. Login
   already inherits the default theme's `colorPrimary` (accent) automatically; point login-lite at the same logo
   file for cohesion. No merge.
7. **[DONE]** **Import/export** — `exportBundle` (`find()` no filter) already captures every `*@uid` row + all
   theme tokens; `importBundle` upserts by `type` (incl. `@uid`). Verified round-trip (`skin@dark`/`nav@dark` +
   5 themes in the bundle). No code change needed.

**App name stays global** (`systemSettings.title`) — confirmed in `headerNav.tsx`.

## STATUS: SHIPPED (v0.4.2). All of skin · typography · nav · logo · favicon · accent switch per NocoBase
theme, with a global "Default (all themes)" fallback. App name global. Login stays with login-lite.

---

## 10. Risks / decisions

- `skin.tsx` is large and was co-edited — keep changes localised behind the shared helper.
- Extra startup cost: 1 `themeConfig:list` (cache it) + the user's themeId (already loaded). Negligible.
- **Decision to confirm:** login = *default theme's* branding (no per-viewer light/dark). ✔ recommended.
- **Decision to confirm:** per-theme is **opt-in via fallback** (configure once → all themes; override as needed). ✔ recommended — keeps it usable, avoids forcing N× config.

---

## 11. v0.4.3 — Systematic preset engine (2026-07-15)

Replaced the 30 hand-tuned presets with a **generator keyed on one base colour** so Light / Dark / Mix stay in
sync **by construction** — the alignment the design needs, guaranteed, not hand-matched.

- **`BASE_COLORS`** = the 21 ColorField-palette hues (Tailwind-500: Red…Neutral). Each is a "colour standard".
- **Colour maths** in `skin.tsx`: `hexToRgb`/`rgbToHsl`/`hslToHex` + `stops(hex)` → 4 gradient blocks
  (darkChrome, darkCont, lightChrome, lightCont) + auto text colours. Saturation preserved (greys stay grey),
  capped at 0.92 (no neon glare); dark chrome L 9→30%, light container L 99→93%.
- **`triplet(hex)` → { light, dark, mix }** with the invariant **by shared object refs**:
  - `mix.sidebar === dark.sidebar` and `mix.header === dark.header`  (Dark & Mix share the chrome)
  - `mix.container === light.container`  (Light & Mix share the container)
- **`PRESETS`** = `BASE_COLORS.flatMap(triplet)` → 63 presets, keys `<base>-<light|dark|mix>`; `PRESET_ACCENTS`
  = the base hex (500) per variant. Old saved configs still render (CSS is built from stored gradient values;
  only the active-swatch highlight keys changed — no migration, no data loss).
- **Picker** = one **row per base colour**, variants aligned **Light · Mix · Dark** (Mix in the middle so its
  container lines up with Light on its left and its sidebar with Dark on its right). System theme leads the order.
- **Verified live** (`/v/admin/settings/branding` → Admin skin): 63 swatches, no error; on rendered rows
  `getComputedStyle` confirms `mix.sidebarGrad === dark.sidebarGrad` **and** `mix.containerGrad === light.containerGrad`.
- i18n: +3 vi-VN chrome keys (Mix / "Each row…" / "Mix shares…"); base colour names kept English (distinct &
  matches old preset-name convention). Build + deploy + DB `0.4.3` + restart → app 200.

## 12. v0.4.4 — Generate themes from a logo (2026-07-15)

"Upload a logo → suggest matching gradient themes + accent." Rule-based, **fully client-side** (canvas, no
upload, no AI, no cost, privacy-preserving) — and it **reuses the v0.4.3 generator**, so the suggestions are
the same aligned Light / Mix / Dark trios.

- **`extractPalette(img, 3)`** in `skin.tsx`: draw the logo to a 56-px canvas, `getImageData`, drop
  transparent / near-white / near-black pixels (logo backgrounds), bin the rest by coarse hue+lightness, rank
  buckets by `size × saturation` (vivid brand colours beat greys), dedupe hues within 22° → top 3 hexes.
- **UI** (top of Admin skin): antd `Upload` with `beforeUpload` returning `false` (never uploads) → reads the
  `File` via an object URL in-browser → `setLogoColors`. Each detected colour renders a row: swatch + hex +
  its **Light · Mix · Dark** trio (via `triplet(hex)`), clicking applies it with **accent = the extracted hex**
  (`applyPreset(pr, accentOverride)`).
- **Verified live**: drove a synthetic blue+orange-on-white logo through the real `Upload` input →
  `extractPalette` returned `#2563eb` + `#f97316` (exact brand colours) + an edge blend; DOM showed
  `72 swatches` (63 base + 3×3 logo). Build + deploy + DB `0.4.4` + restart → app 200.
- i18n: +4 vi-VN keys (button + hint + 2 messages); English via key fallback.
