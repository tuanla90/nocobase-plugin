# Custom Header — User Guide

> Style **titles and labels** across the NocoBase UI — page headers, table column headers,
> form/detail field labels and block titles: set an **icon**, **text color**, **size**, **bold**,
> **background** (solid / gradient) and **alignment**. No code — style right on the element.

**Group:** Appearance (Blocks/UI) · **Runs on:** /admin (classic) + /v/ (modern) · **Version:** 0.2.4

## What's new after installing?

The plugin adds a **styling item to the ⚙ (gear) menu** of 4 element types. It adds **no** menu, page or Settings entry:

| Element | New item in the ⚙ menu | What you can style |
|---|---|---|
| **Page title** | **"Header appearance"** | icon · text color · size · bold · **background** solid/gradient *(also tints the tab bar)* |
| **Table column** *(including JS/custom columns)* | **"Column style"** | icon · color · size · bold · **header align** + **cell align** *(independent)* |
| **Field label** *(form / detail / JS field)* | **"Label style"** | icon · color · size · bold |
| **Block title** | **"Block title style"** | icon · color · size · bold · **background** solid/gradient |

- Every dialog has a **live preview** (**"Preview"**) and a **Reset** button.
- For **columns** and **field labels** there's also an **"Apply to all views (field default)"** toggle — turn it on to style *by field*, so it shows on **every** table/form/detail that has that field (see Scenario C).
- 🎨 Icons come from the **shared icon registry**. Install **@tuanla90/plugin-custom-icons** for the full Lucide set.

## Where to configure

This plugin has **no Settings page of its own**. You style **right on the element** while editing the UI:

1. Turn on the **UI Editor** (edit-interface mode) at the top.
2. Hover over the page title / column / field label / block you want to change.
3. Click the **⚙ (gear)** icon that appears → choose the matching styling item (**"Header appearance"** / **"Column style"** / **"Label style"** / **"Block title style"**).

> Works on **both** clients: classic `/admin` and modern `/v/`.

## How to use (step by step)

Each dialog is split into collapsible sections — **Icon**, **Text**, **Background**, **Alignment** (depending on the element). Every change shows instantly in **"Preview"**; click outside to apply.

### Control panel (what each item means)

| Control | Label in the dialog | What it does |
|---|---|---|
| Icon | *Title icon / Header icon / Label icon* | Pick one icon to place next to the text |
| Icon position | *Icon position* | **Left / Right** *(only shown after you pick an icon)* |
| Text color | *Title color / Header color / Label color* | Color of the title/label text |
| Bold | *Bold* | Toggle bold text |
| Size | *Title size / Size* | Slider 0–40px; **0 = Default** (keep the original size) |
| Background | *Header background* (+ *Background (gradient end)* + *Gradient direction*) | One color = solid; add a 2nd color = **gradient**; pick a direction ↓ → ↘ ↗ |
| Header align | *Header align* | Default / Left / Center / Right for the column's **header cell** |
| Cell align | *Cell align* | Default / Left / Center / Right for the **data** in the column |

### Scenario A — Make the page title stand out (icon + gradient background)

1. Turn on the **UI Editor** → hover over the **page title** → ⚙ → **"Header appearance"**.
2. **Icon** section: pick an icon, set **Icon position** = Left/Right.
3. **Text** section: pick a **Title color**, turn on **Bold**, drag **Title size** (leave it at 0 to keep the original).
4. **Background** section: pick a **Header background**; for a gradient, also pick **Background (gradient end)** and **Gradient direction**.
5. Close the dialog. ✅ The title (and the **tab bar** below it) restyles at once.

### Scenario B — Style a column header + alignment

1. Hover over the **column header** → ⚙ → **"Column style"**.
2. Set the **icon**, **color** and **bold** in the Icon/Text sections.
3. **Alignment** section: set **Header align** (aligns the header cell alone) and **Cell align** (aligns the data) — the two are independent.
4. Want the style everywhere the field appears? Turn on **"Apply to all views (field default)"** (see Scenario C).

### Scenario C — "Set once, show everywhere" (field-level default)

1. Open **"Column style"** (on a column) or **"Label style"** (on a form/detail field).
2. Set the **icon / color / bold** as you like.
3. Turn on **"Apply to all views (field default)"** → close the dialog.
4. ✅ From now on **every** table/form/detail that shows that field uses this style (saved on the server).

> ⚠️ **Size** and **alignment** are **not** saved at field level (per-view only). Only **icon + icon position + color + bold** are stored as the field default.
> ⚠️ **JS/custom columns** aren't tied to a field → they support **per-view** styling only, with no field default.

### Scenario D — Background + icon for a block title

1. Hover over the **block/section** → ⚙ → **"Block title style"**.
2. Set the **icon + color + bold**; in the **Background** section pick one color (solid) or two colors (gradient).
3. Close the dialog → the background fills to the top edge of the card, covering the whole title area.

## Tips & notes

- **No Settings page** — everything is styled in place via ⚙. Remember to turn on the **UI Editor** first.
- **Clear a style fast:** reopen the dialog → click **Reset** → close. For size specifically, drag the **Size** slider back to **0** to return to the default size.
- **Field default ≠ per-view:** when "Apply to all views" is off, the style applies only to that exact column/label in the view you're editing. If a field has both a default and a per-view tweak, the **per-view version wins** per property.
- **Cross-session updates:** if someone else changes a field default, your session sees it only after you **return to the tab** (refreshes ~every 10s) and the view **re-renders** (navigate away/back, or reopen the block) — it doesn't refresh instantly.
- **Full icon set:** install **@tuanla90/plugin-custom-icons** for the complete Lucide set in the icon picker.
- This is **browser-side (client) styling** — **no server restart needed**.

## Remove / disable

- **Remove one style:** reopen the element's dialog → **Reset** → close.
- **Remove a field default (all views):** open **"Column style" / "Label style"** → **Reset** while **"Apply to all views"** is on → close.
- **Disable the plugin** in **Plugin Manager**: all styles disappear from the UI. Field defaults stay in the database (table `ptdlFieldStyles`) and per-view styles stay in the page config → **re-enable** and everything comes back as before.

---

### For developers

- **Client-only** styling, running in two lanes: `@nocobase/client` (classic) + `@nocobase/client-v2` (modern). **Bundles no icon library** — icons come from the shared registry (full Lucide when `@tuanla90/plugin-custom-icons` is installed). The classic lane resolves base model classes via `flowEngine.getModelClass(name)` with a prototype-walk fallback.
- **Surfaces & models:** page header (`PageModel`), table column (`TableColumnModel` + JS/custom columns), form/detail/JS field label (`FormItemModel` / `DetailsItemModel` / `FormJSFieldItemModel`), block title (`BlockModel`). Each adds a settings item to that FlowModel's ⚙ menu.
- **Never clobbers the string `title`/`label` prop** — many consumers read it as a string and call `.trim()` (core `onCell`, `@tuanla90/plugin-enhanced-table`). Only the **rendered output** is decorated: table → patch `getColumnProps` (inject the icon into the title's inner div so antd `align` moves icon + text together); form/detail → patch `renderItem` (clone the FormItem with a decorated `label`); block → patch `render()` (decorate the card `title` node + apply the `styles.header` background).
- **Field-level defaults** live in the server collection **`ptdlFieldStyles`** (fields `dataSource`, `collectionName`, `fieldName`, `icon`, `iconPosition`, `color`, `bold`; ACL `loggedIn`; one row per dataSource + collection + field), loaded into an in-memory cache at startup (`loadFieldStyleCache`) and written via `ptdlFieldStyles:updateOrCreate`. Per-view overrides live in flow params (`chFieldStyle`). At render time the two are merged (`mergeFieldStyle`): the per-view override wins per property, otherwise the field default applies.
- **i18n:** settings labels via `app.i18n.addResources(lang, '@tuanla90/plugin-custom-header/client', …)` per lane; bundled locales **en-US / vi-VN / zh-CN** (`src/locale/*.json`); a missing key falls back to the English key text. React-rendered labels (Segmented options, "Preview", preview placeholders) bypass the schema `{{t()}}` path and are translated at runtime via `setRuntimeT`.
- **Build:** `bash build-env/recipes/run-custom-header-build.sh` → `build-env/storage/tar/*custom-header*.tgz`. No bundled deps — framework packages (`react`, `antd`, `@nocobase/*`, `@formily/react`) are stubbed at build so `dist/externalVersion.js` matches the runtime.
- **Known limits:** no background **image** yet (solid/gradient only) and no column-header background; a field-default change refreshes on tab refocus only (no global force-render). See `IMPROVEMENTS-CHECKLIST.md` for the v0.2.0 change batch and acceptance tests.
