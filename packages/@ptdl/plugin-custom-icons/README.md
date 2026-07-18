# Custom Icons (Lucide + Remap) — User Guide

> Add the **whole Lucide icon set** to the NocoBase icon picker (both `/admin` and `/v/`), and **replace the
> default Ant Design icons with Lucide** everywhere — menus, buttons, fields, the header bar. Ships a **default
> mapping** loaded on install and a **per-icon editor** with CSV import/export — **no code, no server restart**.

**Group:** Interface (UI) · Icons · **Runs on:** /admin (classic) + /v/ (modern) · **Version:** 0.2.3

## What's new after installing?

- **The whole Lucide set enters the icon picker** — in **both** clients. When you set an icon for a menu / button /
  field, open the picker and you'll find them in the **“Outlined”** tab: search by **typing the name** (e.g. `cart`,
  `user`, `truck`) or type `lucide` to list them all.
- **The app “Lucide-ifies” itself right away** — the plugin ships **200+ default swap pairs** (Ant Design → Lucide)
  and **loads them once** on install. So menus, buttons, fields and the header bar switch to tidy Lucide icons with
  **nothing for you to do**.
- **A new config page in Settings: “Icon remap”** (the two-arrows swap icon ⇄). This is where you **edit / add /
  remove** each swap pair, with a **preview** and **CSV import/export**.

## Where to configure

| Client | Path to the config page |
|---|---|
| **Modern (`/v/`)** | ⚙ **Settings** → **“Icon remap”** |
| **Classic (`/admin`)** | **Settings** → **“Icon remap”** (path `/admin/settings/icon-remap`) |

Both clients open the **same mapping table** — edit it in either place and it applies to both `/admin` and `/v/`.

> 💡 To simply **use** a Lucide icon for a menu/button/field you don't come to this page — pick it straight from the
> **icon picker** right where you're designing (see Scenario A).

## How to use (step by step)

### Scenario A — Use a Lucide icon for a menu / button / field

1. Turn on the **UI Editor** and open the icon picker of the part you're designing (menu icon, button icon, field icon…).
2. Choose the **“Outlined”** tab.
3. **Type the icon name** — e.g. `cart`, `user`, `calendar` — or type `lucide` to see them all.
4. Click to select. ✅ Done — the Lucide icon shows up immediately.

### Scenario B — Change a system icon to Lucide (edit the mapping)

1. Open the **“Icon remap”** page.
2. Click **“+ Add mapping”** to add a row.
3. In the **“Built-in icon (Ant Design)”** column, click the picker → **type the source icon name** (e.g. `setting`, `delete`) → select.
4. In the **“Replace with (Lucide)”** column, click the picker → **type the Lucide replacement name** (e.g. `settings`, `trash`) → select.
5. Check the **“Result”** column: it shows **old icon → new icon** so you can verify first.
6. Click **“Save”**, then **hard-refresh with `Ctrl+Shift+R`**. ✅ From now on that icon switches to Lucide **everywhere**
   it appears (menus, settings, fields, action buttons, and the header bar).

### Scenario C — Restore an icon to default (remove the swap)

1. Open the **“Icon remap”** page.
2. Click the remove (**✕**) button at the end of the row you want to drop.
3. Click **“Save”** → **`Ctrl+Shift+R`**. ✅ That icon returns to the original Ant Design version.

### Scenario D — Copy the whole mapping to another NocoBase site

1. On the source site: open the page → click **“⬇ Download CSV”** (downloads `icon-remap.csv`).
2. On the target site: open the page → click **“⬆ Import CSV”** → pick the file you just downloaded.
3. The table is **replaced with the CSV content** (not yet saved). Check it, then click **“Save”** → **`Ctrl+Shift+R`**.

> 💡 Click **“Reload”** anytime to discard unsaved changes and reload the exact state saved on the server.

## Tips & notes

- ⚠️ **Always hard-refresh after Save.** Icons only change across the app once you reload with **`Ctrl+Shift+R`**
  (the app prompts exactly this when you finish saving).
- ⚠️ **Swapping is global per icon**, you can't change it in just one spot. E.g. swapping `settingoutlined` changes
  **every** gear in the app. One source icon maps to **one** Lucide icon (on duplicates, the later row wins).
- **No server restart needed.** Just **Save** then **reload the page**; changes apply to **both** clients because
  they share one mapping table.
- **The default set loads only once per install.** If you **delete** a default row and **Save**, it does **not** come
  back on restart — your choice is respected.
- A few default pairs to give you the idea:

  | Built-in icon (Ant Design) | Replace with (Lucide) |
  |---|---|
  | `settingoutlined` (gear) | `lucide-settings` |
  | `searchoutlined` (magnifier) | `lucide-search` |
  | `deleteoutlined` (trash) | `lucide-trash2` |
  | `editoutlined` (edit pencil) | `lucide-pencil` |
  | `homeoutlined` (home) | `lucide-house` |

- **How to search in the picker:** the source column searches **Ant Design** (type e.g. `setting`), the target column
  searches **Lucide** (type e.g. `settings`). The list shows at most **120** icons at once — just **type to narrow**
  if you see the “+… more — type to narrow” line.
- **CSV** has exactly 2 columns: `sourceKey,lucideKey` (e.g. `SettingOutlined,lucide-settings`). The file includes a
  BOM so Excel opens it without font issues. Importing CSV **replaces** the current table; remember to click **“Save”**
  to apply.
- The config page requires **login**; the mapping is **app-wide config** (not per-user).

## Remove / disable

- **Pause the swaps (keep the Lucide library):** open the **“Icon remap”** page, delete the rows you don't want (or all
  of them) → **“Save”** → **`Ctrl+Shift+R`**. The affected icons return to the default Ant Design versions.
- **Remove entirely:** disable the plugin in **Plugin Manager**. All Lucide icons **vanish from the icon picker** and the
  system icons **return to Ant Design** at once. The mapping table (`ptdlIconRemaps`) is **kept in the database** —
  re-enable and the pairs you saved are still there.
- ℹ️ **When you re-enable the plugin**, the system may **reload the default pairs**. If you want to keep exactly what you
  fine-tuned, open the page, delete the extra rows again, then **“Save”**.

---

### For developers

Two icon-swap mechanisms run in parallel on the client: a **registry override** (each lane's `icons` Map — replaces the
icon drawn via `<Icon type="…">`) and a **CSS mask** (over the `.anticon-*` class — so it can also change icons NocoBase
hard-codes as JSX, like the header chrome). The mapping is stored in the **`ptdlIconRemaps`** collection
(`sourceKey` → `lucideKey`); the server **seeds 200+ default pairs once per instance** (upsert-missing, never overwrites
a user's edits). The Lucide library registers the **entire `lucide-react` set**, shown in the **Outlined** tab (key
`lucide-<name>outlined`) plus an alias `lucide-<name>` for other plugins to reference by name.

Notes for maintainers: the classic (`@nocobase/client`) and modern (`@nocobase/client-v2`) clients each keep their **own**
icon registry, which is why the plugin ships two client entries that register into their respective Maps. `lucide-react`
is **fully bundled** (`import *` defeats tree-shaking), so registering the whole set costs ~0 extra download versus a
curated subset. The settings page is registered per lane — classic via `pluginSettingsManager.add('icon-remap', …)`,
modern via `addMenuItem` + `addPageTabItem` — and ACL grants `ptdlIconRemaps` CRUD to `loggedIn`.
