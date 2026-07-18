# PWA (Installable App) — User Guide

> Turn NocoBase into an **installable app** on desktop and mobile (**Add to Home Screen / Install**):
> it gets its own icon on the home screen and opens full-screen like a real app. You set the
> **name, colors and icon** in one config page — **no code, no server restart**.

**Group:** Interface & Experience (UI/UX) · **Runs on:** /admin (classic) + /v/ (modern) · **Version:** 0.4.1

## What's new after installing?

- **A new Settings page: “PWA”** (mobile-phone icon). This is the one and only place you configure it.
- **The browser will offer to “Install” / “Add to Home Screen”** when you open NocoBase — because the page now carries the “manifest” of an installable app.
- **No new menu, button or field** is added to your data pages/blocks.
- ✅ **Works right away once enabled.** If you change nothing, the plugin uses the **system name** (System Settings), the **default blue** color, and an **icon made from the first letter** of the name. Only open the page when you want something different.

## Where to configure

| Client | Path to the config page |
|---|---|
| **Modern (`/v/`)** | ⚙ **Settings** → **“PWA”** |
| **Classic (`/admin`)** | **Settings** → **“PWA”** (path `/admin/settings/pwa`) |

Both clients open the **same config page** and share **one set of settings** (a change in either place applies to both).

## How to use (step by step)

### Scenario A — Set the app's name, colors and icon

1. Open the **“PWA”** page (see the table above).
2. **“App name”**: the full name shown when installing (e.g. *“ABC Company”*). Leave empty → uses the **system name**.
3. **“Short name (home screen)”**: the label shown **under the icon** on the home screen — keep it **short (≤ 12 characters)**. Leave empty → uses the **first word** of the app name.
4. **“Theme color”**: your app's brand color. **“Background color”**: the splash-screen color while the app is opening.
5. **“Icon”**: click **“Choose image”** to upload a logo (PNG/JPG). To replace it click **“Change image”**, to drop it click **“Remove”**.
   > 💡 No upload needed: the system **auto-generates an icon from the first letter** of the app name on the **Theme color** background.
6. Click **“Save”**. ✅ The page shows *“Saved. Reload (Ctrl+Shift+R) to update the installed app.”*
7. **Reload the page with `Ctrl+Shift+R`** so the browser picks up the new settings.

### Scenario B — Install on a computer (Chrome / Edge)

1. Make sure you've configured and clicked **“Save”** as in Scenario A.
2. Open NocoBase in **Chrome** or **Edge**.
3. Look at the **end of the address bar** and click the **install icon** (a monitor with a **+** / arrow); or open the **⋮** menu → **“Install <app name>”**.
4. Confirm → the app appears as its own program, with an **icon on the Desktop / Start Menu**, and opens in **its own window**.

### Scenario C — Install on a phone (Add to Home Screen)

| Device | How to install |
|---|---|
| **Android (Chrome)** | **⋮** menu → **“Add to Home screen”** / **“Install app”** → confirm. |
| **iPhone / iPad (Safari)** | The **Share** button (a square with an up arrow) → **“Add to Home Screen”** → **“Add”**. |

✅ The icon appears on the **home screen**; tap it and the app opens **full-screen**, with no browser address bar.

> ⚠️ The wording in the **“Install / Add to Home Screen”** menu is shown by the **browser** (not the plugin), so it may vary slightly by browser and version.

## Tips & notes

- ⚠️ **Always “Save” then reload the page (`Ctrl+Shift+R`)** for the new name/colors/icon to reach the manifest. If the app was **already installed**, you may need to **uninstall and reinstall** it to pick up the new icon/name.
- ⚠️ **HTTPS is required.** The browser only offers **“Install”** when the site runs over **`https://…`** (or `localhost` while testing). No install button → check whether the site is really on HTTPS.
- 🖼️ **A square image works best.** The system **rounds the corners** and produces **192 / 512 px** sizes. A non-square image is placed **neatly in the center** on the **“Background color”**.
- ✂️ **A “Short name” that's too long** gets clipped by the home screen — keep it really short.
- 🔁 **One shared set of settings** for both classic `/admin` and modern `/v/`.
- 🖥️ This is a **browser-side** feature (it injects the manifest on the client): changing the settings only needs a **page reload**, **no server restart**.

## Remove / disable

- **Uninstall the installed app from a computer/phone:** do it like any normal app (right-click the Desktop icon → *Uninstall*, or press-and-hold the icon on a phone → *Remove*). This is **independent** of the plugin.
- **Disable the plugin** in **Plugin Manager** → NocoBase **stops injecting the manifest** and the browser no longer offers to install. A previously installed app may still keep its icon but will open as a plain web page — uninstall it from the operating system as above.
- **Saved settings** (name/colors/icon) **are kept** in the database; re-enable the plugin and they're back.

---

### For developers

The client injects a **Web App Manifest** (blob URL) plus `<meta>` tags (`theme-color`, `apple-touch-icon`, `apple-mobile-web-app-*`) into `<head>`, and runs on **both lanes** (`client` for `/admin`, `client-v2` for `/v/`). The **192 / 512 px** icons (including a `maskable` variant) are drawn with **canvas**: the uploaded image placed on the background, or the first letter of the name on the **Theme color**. Settings live in **one row** of the `pwaSettings` collection; **read is public** so the manifest loads for every guest, while **write** goes through the `pm.pwa.configuration` snippet. Nothing touches a tier that needs a restart. Source: `src/shared/pwa.tsx` (manifest injection + config page), `src/server/plugin.ts` (collection + ACL).
