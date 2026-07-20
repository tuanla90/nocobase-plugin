# Custom Login — User Guide

> Re-skin the whole NocoBase **sign-in page** — background, form layout & position, light/dark colors,
> logo, input icons, footer and post-login landing page — right in the admin UI, with **live preview**,
> **no code**.

**Group:** Auth & UI · **Runs on:** /admin (classic) + /v/ (modern) · **Version:** 2.3.2

## What's new after installing?

- **The sign-in page (`/signin`) is replaced by the plugin's custom skin.** The moment you enable it (even with **nothing configured yet**), the page already has a **bundled gradient background** + a **side-panel form** — lightweight, with **no external image request**.
- **A new Settings page: “Login configurations”** (gear icon). This is the one and only place you configure it.
- **No new menu, button or field** is added to your data pages/blocks.
- A **live preview** updates the moment you edit — no need to save to try it.

## Where to configure

| Client | Path to the config page |
|---|---|
| **Modern (`/v/`)** | ⚙ **Settings** → **“Login configurations”** |
| **Classic (`/admin`)** | **Settings** → **“Login configurations”** (path `/admin/settings/plugin-login`) |

Both clients edit the **same configuration** (a **Home configuration** record), so it doesn't matter where you make the change — the result is identical.

## How to use (step by step)

> The two clients lay things out a little differently, but the **configuration options are identical**:
>
> - **Modern (`/v/`):** a tabbed form (**General / Background / Form position & style / Colors / Footer**),
>   with a **small preview** on the right. When done click **“Submit”**; click **“Refresh”** to reload.
> - **Classic (`/admin`):** a **table** of configurations. Click **“Add”** (or **“Edit”** on a row) to open a
>   **full-screen window**: the **left half is the real login page previewing live**, the right half is the edit form.
>   When done click **“Submit”** (or **“Cancel”** to exit without saving).

### Scenario A — Choose a background

Open **Background** → **“Left side content display”**, and pick one of four types:

| Background type | Use when | Also fill in |
|---|---|---|
| **Gradient** *(default)* | you want a nice, lightweight color gradient with **no external image** | pick a **“Gradient preset”**: Deep space · Midnight · Ocean · Violet · Sunset · Aurora · Emerald |
| **Image** | you have your own background image | **“Left side image URL”** (leave empty → falls back to gradient) |
| **HTML embed** | you want a dynamic background from your own HTML/CSS | paste **“HTML embed code”** |
| **Webpage embed** | embed a whole webpage as the background | **“Webpage embed URL”** (shown in an iframe) |

Watch the preview change immediately → **“Submit”**.

### Scenario B — Layout & form position

Open **Form position & style**:

1. **“Form layout”**:
   - **“Side panel (full height)”** — the form is a solid column spanning the full screen height, the background fills the rest.
   - **“Floating card”** — the form is a rounded card **floating over the background**.
2. **“Form position”**: **Left / Center / Right**.
   > ⚠️ **Center** only applies to the **Floating card**; **Side panel** uses only **Left** or **Right**.

### Scenario C — Colors, light/dark, logo, input icons

- **“Form theme”** (in **Colors**): choose how colors are set
  - **“Custom”** — set each color yourself below.
  - **“Light”** / **“Dark”** — full presets that **override** the color fields (the color fields then hide).
  - **“System”** — automatically switches light/dark to match the **visitor's** OS setting.
- With **“Custom”**, set: **Background theme color**, **Font color**, **Login form theme color**, **Login form text color**,
  **Button background color**, **Button text color**, and **“Background panel opacity”** (drag the % so the background **shows through** behind the form).
- **“Logo image URL”** (in **General**): shows a logo above the form title; leave empty to hide.
- **“Show input icons”** *(on by default)*: choose the **“Username icon”** (user · mail · at · id) and
  **“Password icon”** (lock · key · shield) shown inside the input fields.
- **“Use system name”**: **Yes** = take the app name from system settings; **No** = enter a **“Custom system name”**.

### Scenario D — After login & footer

- **“Default landing page”** (in **After login**; on `/v/` it lives in the **Footer** tab):
  e.g. `/admin` — the page **opens automatically** after a successful login when the URL has no explicit `redirect`.
  Leave empty to keep the system default.
- **“Copyright / footer text (Markdown)”** and **“ICP filing information (Markdown)”**: written in **Markdown**, shown at the bottom of the form.

> ✅ **To make it take effect:** in **Classic**, tick **“Enable”** then **“Submit”** — **only one configuration can be Enabled at a time**
> (enabling a new one **automatically disables** the old one). In **Modern (`/v/`)**, just **“Submit”** and it applies immediately to the active configuration.

## Tips & notes

- 👀 **Preview:** Classic shows the **real login page** in the left half of the window and changes almost **instantly** as you edit;
  Modern (`/v/`) shows a **small preview** on the right.
- 🔒 **The default background is a bundled gradient** — no external image request, lightweight and private.
- 🪟 Want the **background to show through behind the form**? Use a transparent form color or lower the **“Background panel opacity”**.
- ⚠️ **HTML / webpage embed:** only embed sources you **trust** — raw HTML / an iframe runs right on the login page.
- Changes **take effect the moment you “Submit”** — users just reload the `/signin` page. **No server restart needed.**
- Runs on **both** clients (classic `/admin` and modern `/v/`) and they **edit the same configuration**.
- The default footer keeps the **“Powered by NocoBase”** line required by the open-source license — please keep it.

## Remove / disable

- **Change/disable a configuration:** in Classic, untick **“Enable”** on the configuration row → **“Submit”**. Note: when **no configuration is enabled**,
  the login page **still uses the plugin's default skin** (gradient + side-panel form), it does **not** revert to the original page.
- **Restore NocoBase's original sign-in page:** **disable the plugin** in **Plugin Manager** — the login page returns to default **at once**.
- **Data:** saved configurations stay in the `login_configs` table; **re-enable the plugin and they're back** — nothing is lost.

---

### For developers

The plugin **overrides** `AuthLayout` + `SignInPage` on **both lanes** (`/` classic and `/v/` modern). Config is stored in the **`login_configs`** table — each row has `options` (JSON), `type = 'home'`, and an `enabled` flag. The **`getActiveConfig`** action is **public only** for `type = 'home'`; **enabling** one configuration **automatically disables** the others of the same type (only one active). The settings page is registered via `pluginSettingsManager.add` (classic) and `addMenuItem` + `addPageTabItem` (v2), both editing the same record. Framework-free helpers live in `@ptdl/shared` (`loginKit`) and are bundled into the plugin. Sign-in inputs mirror their placeholder into `aria-label` for screen readers. Dual-licensed AGPL-3.0 / NocoBase Commercial — please keep the footer attribution line.
