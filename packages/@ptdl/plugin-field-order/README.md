# Field Order — User Guide

> Reorder a collection's **fields** by **drag-and-drop**, right in the field-configuration screen —
> no code, no server restart.
> **Since 0.1.1**, the plugin also **tidies the Settings-page menu** into logical groups.

**Group:** Fields · **Runs on:** /admin (classic) + /v/ (modern) · **Version:** 0.1.1

## What's new after installing?

- **A new button: “Reorder fields”** appears on the **toolbar of the field-configuration drawer** (the drawer that opens when you “Configure fields” of a collection — where the **“Add field”** button is). It sits next to the add-field button.
- Click it → a **“Reorder fields”** dialog opens: a **drag-and-drop list** of the collection's fields in their current order. Drag to reorder, or use the **Move up / Move down** buttons on each row.
- 🆕 **(0.1.1) The Settings-page menu is auto-tidied into groups.** The **@ptdl** plugin settings entries are grouped and placed **right below** NocoBase's built-in ones — instead of scattered in load order. **Automatic, nothing to click.**
- **No other menu, settings page or field** is added. It's a tool used right where you manage fields.
- ✅ Fills a real NocoBase gap: a **newly added** field always gets pushed to the **bottom**, and NocoBase itself has **no way to drag it up** — this plugin lets you.

## Where to configure

The plugin has **no settings page of its own**. You use it inside the **Collection manager** under **Settings**, in each collection's field-configuration drawer:

| Client | How to reach the “Reorder fields” button |
|---|---|
| **Modern (`/v/`)** | ⚙ **Settings** → **Collection manager** → pick a collection to open its field-config drawer → the **“Reorder fields”** button is on the toolbar (next to **“Add field”**). |
| **Classic (`/admin`)** | **Settings** → **Collection manager** → open a collection's field config → **“Reorder fields”** on the toolbar. |

> The button only shows **inside the Collection manager** (path contains `data-source-manager`). It does **not** appear on the record-edit drawers of ordinary data pages — so it never gets in the way elsewhere.

## How to use (step by step)

### Scenario A — Move a field up (e.g. bring a just-added field to the top)

1. Go to **Settings** → **Collection manager**.
2. Open the **field configuration** of the collection you need (the drawer listing the fields, with the **“Add field”** button).
3. On the toolbar, click **“Reorder fields”**.
4. In the dialog, **drag** the field's row to the position you want (or click **Move up / Move down** on that row).
5. Click **“Save”**. ✅ A **“Field order updated”** message appears and the field list refreshes into the new order.

### Scenario B — Tidy up the whole list

1. Open **“Reorder fields”** as above.
2. Drag rows until the order suits you (each row shows the **display name**, plus the **field name** and **field-type label** for easy recognition).
3. Click **“Save”**. To abort, click **“Cancel”** — nothing changes.

> 💡 The new order **drives this field-config screen** *and* the **default field order** of **blocks/forms you create AFTER**. **Existing** blocks/forms **keep their layout** (that's how NocoBase works) — the dialog notes this too.

## Bonus: the Settings-page menu is auto-tidied (since 0.1.1)

This is **automatic** — just enable the plugin, there's no button. In **/v/ → ⚙ Settings**, the **@ptdl** settings entries are grouped for easy scanning, in this order:

- 🎨 **Appearance** — Branding & Theme · Custom Login · PWA · Custom Icons
- 🔍 **Search & utilities** — Global Search · Instant Create Page
- 🗄️ **Data & automation** — AI Column · Computed fields · Sequential/window · Line Generator · Google Sheets Sync · Change Log
- 🖨️ **Printing** — Print Template
- 🔒 **Security** — IP Guard *(last)*

> 💡 NocoBase's **built-in** entries (System settings, Plugin manager…) still sit **on top**; the @ptdl group goes **right below**. Applies to **/v/ (modern)**.
> ⚠️ NocoBase has **no drag-reorder** for the Settings menu, so this order is **fixed in the plugin**. To change it, edit the `PTDL_SETTINGS_ORDER` list in the plugin code (ask your developer).

## Tips & notes

- ✅ **Applies the moment you “Save”, no restart** needed.
- 📦 **Only the display order changes** — it never touches a field's structure/data. Reorder freely and safely.
- 🧭 The list contains only **UI fields** (those that appear in the field picker). **System fields** (like `id`, `createdAt`…) are hidden and **left untouched**.
- 🖥️ Applies to the **main data source** — where you manage collections inside the app. External data sources are out of scope.
- 🔁 Want the new order in an **existing** block? **Recreate** the block/form (or add a new one) — old blocks keep their own layout.
- 🌐 The reorder button runs on **both** clients; the **Settings-menu tidy** currently applies to **/v/**.

## Remove / disable

- **Disable the plugin** in **Plugin Manager**: the **“Reorder fields”** button disappears and the **Settings menu returns** to its default order. The field order you saved **is kept** (it's NocoBase's own order data) — **nothing is lost**. Re-enable anytime.

---

### For developers

The button is mounted at **body level** (its own React root, not `app.addProvider`, since providers don't render on the `/admin/settings/*` subtree), finds the field-config drawer via DOM structure + click-tracking, and only acts when the path contains `data-source-manager`. Order is saved via the `fieldOrder:reorder` server action — rewriting the `fields` metadata `sort` column by **reusing the reordered fields' existing sort slots** (never touching system/hidden fields, no collisions). The **Settings-menu tidy** (`src/shared/settingsMenuOrder.ts`) stamps `sort` onto `pluginSettingsManager.menus[key]` for the 14 @ptdl menu keys (patches `addMenuItem` + clears the cache) — no rebuild of the other 13 plugins. Details: see `FIELD-ORDER.md`.
