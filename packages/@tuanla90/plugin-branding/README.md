# Branding & Theme — User Guide

> Restyle your whole app: colors for the sidebar / header / cards, accent color, density (weight), font,
> app name, favicon and logo (light/dark)… Ships with presets, **remembers per theme**, and imports/exports the config.

**Group:** UI · **Runs on:** /admin (classic) + /v/ (modern) · **Version:** 0.4.18

## What's new after installing?

- **A new Settings page: "Branding & Theme"** (paint-drop icon 🎨). This is where you configure everything.
- From there you can adjust the **skin / sidebar–header–card–background colors**, the **accent color (Accent)**, the **density (Density)**, the **app-wide font**, the **app name + favicon + logo**, and **import/export** the whole config in one bundle.
- Config is **tied to each NocoBase theme**: every theme remembers its own set of colors.

## Where to configure

| Client | Path to the config page |
|---|---|
| **Modern (`/v/`)** | ⚙ **Settings** → **"Branding & Theme"** |
| **Classic (`/admin`)** | **Settings** → **"Branding & Theme"** (path `/admin/settings/branding`) |

Both clients open the **same config page**, which has these tabs: **Skin** · **Header & Logo** · **Import / export**.

## How to use (step by step)

### 1) Change the overall colors & style (tab **Skin**)

1. Open **Settings → Branding & Theme → the Skin tab**.
2. Pick an **Admin skin** (a ready-made preset) to swap the whole look in one click.
3. Fine-tune:
   - **Accent & shape** — the accent color + rounded corners (**Corners**).
   - **Density** — **Compact** (tight) or **Comfortable** (roomy).
   - **Font** — **Font family**, **Font size**, or paste a **Google Fonts link**.
   - Background colors: **Container (content background)**, **Card**, **Header** (with **From/To/Angle** for a gradient shift, **Header weight**, and **Hide top menu**).
4. Every change previews live as you go → when you're happy, click **Save**. ✅

### 2) App name, favicon, logo (tab **Header & Logo**)

1. **App name & favicon** — rename the **app name** and set the **favicon**.
2. **Logo** — upload a separate **light/dark logo**, or use **Generate from logo…** to derive colors from it.

### 3) Back up / move to another app (tab **Import / export**)

- **Export theme** → download the config file; **Import** → paste or upload it to re-apply the exact same look.

> 💡 Because config is **per theme**: if you switch themes and the colors seem "gone", check that you're on the theme you actually configured.

## Tips & notes

- ⚠️ **Button (primary) color:** antd takes its color from the **theme token**, not from any extra injected CSS — to change the button color, edit it in the theme token (it applies after a page reload).
- The **app name** is global (not per theme). The **login** page isn't folded in here — use the *Custom Login* plugin for that.
- Runs on **both** clients: classic `/admin` and modern `/v/`.

## Remove / disable

- Disable the plugin in **Plugin Manager** → the app returns to NocoBase's native look. Your saved config stays in the database; re-enable to restore it.

---

### For developers

**Theme-aware storage:** every branding surface (skin / typography / header–nav) is one server-backed row in `brandingConfigs`, keyed by `type`. Per-theme overrides use `scopedType(type, uid)` → a `type@<uid>` row, and a theme with no override falls back to the global `type` row; the active theme is read from `localStorage.NOCOBASE_THEME.uid`. Each client calls `loadAndApplySkin` / `loadAndApplyTypography` at startup and injects a global `<head>` stylesheet, so the look applies app-wide.

**Two lanes:** the classic client registers `pluginSettingsManager.add('branding', …)` (→ `/admin/settings/branding`); the modern client uses `addMenuItem` + `addPageTabItem` (menu key `branding`). Both host the same tabbed `BrandingPage`.

**Import / export** goes through the admin-only server actions `brandingConfigs:exportBundle` / `brandingConfigs:importBundle`, bundling the branding configs together with the NocoBase Theme Editor themes. Note the **app name** is core `systemSettings.title`, not a branding row.

See `docs/` (THEME-AWARE-PLAN) and the code in `src/shared/brandingPage.tsx`.
