# Layout Containers (Tabs / Collapse) — User Guide

> Two blocks for **organizing page content and grouping fields in a form**: a **Tabs** block and a
> **Collapse (Sections)** block — both nestable, both with in-form field-group variants. Plus the
> ability to **restyle the tab bar** of an existing page/popup to Line, Pill, Segment, Card, Step or
> Text, with an **app-wide default per theme**.

**Group:** Blocks · **Runs on:** /admin (classic) + /v/ (modern) · **Version:** 0.4.4

## What's new after installing?

When you turn on **UI-editor mode** you get:

- **2 new blocks** in the "Add block" panel: **Tabs** and **Collapse (Sections)**.
- **2 new items** in a **Form**'s field adder: **Tabs** and **Collapse (Sections)** — to split fields into tabs / collapsible sections right inside the form.
- **A new config item** in the **⚙** gear of every **page / popup / view that has tabs enabled**: **Tab style** — restyle its existing tab bar.
- ⚠️ **No Settings page is added, and no menu.** Everything is configured **right on the block/page** while in UI-editor mode.

## Where to configure

| To change | Go to |
|---|---|
| The **Tabs** block (style, color, text size…) | **⚙** on the block → **Tab style** |
| The **Collapse** block (Sections) | **⚙** on the block → **Collapse style** |
| A specific **tab** (name + icon) | **⚙** on the tab name → **Edit tab** |
| The **tab bar of an existing page / popup** | The page's **⚙** → **Tab style** |
| The **default style for EVERY tab bar** in the app | Same place → turn on **Apply to all default tabs** |

> The plugin has **no dedicated settings page**. Remember to turn on **UI-editor mode** so the **⚙** buttons and the "Add block" panel appear.

## How to use (step by step)

### Scenario A — Add a Tabs block to a page

1. Open the page to edit and turn on **UI-editor mode**.
2. Click **"Add block"** in an empty area → the **"Other blocks"** group → choose **Tabs**.
3. Click **"Add tab"** → **"Blank tab"** to add a tab. **Drag-and-drop** one tab onto another to reorder.
4. Inside each tab, click **"Add block"** to drop in **any block** — including another **Tabs** block (nest without limit).
5. Point at the tab name → **⚙** → **"Edit tab"** to set the **Tab name** and **Icon**.
6. To restyle the tab bar: **⚙** on the block → **"Tab style"** → pick a style + color (see the **6 tab-bar styles** table under *Tips & notes*) → there's a **Preview** right in the dialog.

### Scenario B — Add a Collapse (Sections) block

1. Still in UI-editor mode, click **"Add block"** → **"Other blocks"** → **Collapse (Sections)**.
2. Click **"Add section"** → **"Blank section"**; each section holds any block, just like a tab.
3. **⚙** on the block → **"Collapse style"** to adjust:

   | Option | Meaning |
   |---|---|
   | **Accordion (open one at a time)** | Opening one section auto-closes the others |
   | **Default state** | Start with **Expand all** or **Collapse all** |
   | **Frame** | **Boxed** / **Borderless** / **Ghost** |
   | **Size** | **Small / Medium / Large** |
   | **Expand icon** | Place it at the **Start** or **End** of the header |
   | **Bold** + **Colors** | Header, **Active** / **Normal** section color, **Border** |

### Scenario C — Split form fields into tabs / collapsible sections

1. Open a **Form** block (Add/Edit record) and turn on UI-editor mode.
2. In the form's field adder, open the **"Others"** group → choose **Tabs** or **Collapse (Sections)**.
3. Add tabs/sections as above, then drag the **fields** into each tab/section. Fields still **save and validate normally** — the form doesn't care how deeply a field is nested.
   > ⚠️ A **required** field placed in a tab/section you've **never opened** may **not trigger validation** (the UI only builds a tab's content when you open it). Click through the tabs before saving, or avoid hiding required fields in rarely opened tabs.

### Scenario D — Restyle the tab bar of an existing page / popup

1. Go to a page (or record-detail popup) that has **tabs enabled** → the page's **⚙** → **"Tab style"**.
2. In the **Style** field, pick one of: **Line · Button group (pill) · Segment (bordered) · Card (folder) · Step · Text (color only)** (each described under *Tips & notes*).
3. Adjust **Colors**, **Text size**, **Bold**, **Centered**… and turn on **"Hide tab bar when only one tab"** if you want → **Save**.
   > Want this page to **follow the app-wide default**? Pick **Style = "Inherit (global / default)"**.

### Scenario E — Set the default style for EVERY tab bar (per theme)

1. Open **⚙** → **"Tab style"** on any page/popup and pick the style + colors you like.
2. Turn on the **"Apply to all default tabs (page / popup / view)"** toggle → **Save**.
3. ✅ Every page/popup still set to **"Inherit (global / default)"** will follow this style on its **next reload**. The config is stored **on the server, per theme** — **the admin sets it once, and everyone shares it**.

> ⚠️ There is only **one** shared default per **theme**: a later save on another page **overwrites** it. Any page you styled with the toggle **OFF** keeps its own look. This toggle **only appears while in UI-editor mode**.

## Tips & notes

**6 tab-bar styles** (labels shown in English on the UI):

| Style | What it looks like |
|---|---|
| **Line** | NocoBase's default underline, recolored only |
| **Button group (pill)** | Rounded button group; the open tab is filled with color |
| **Segment (bordered)** | Bordered box, tabs separated by dividers; the open tab is filled |
| **Card (folder)** | Card/folder-style tabs that attach to the content frame |
| **Step** | Numbered circles + a connector line — like steps |
| **Text (color only)** | Only the text color changes (+ bold), no underline |

- **Nest without limit:** Tabs in Tabs, Sections in Sections, or Tabs inside a Collapse section — all allowed. Each tab/section can hold any kind of block.
- The **"Background"** color only changes the background of the **open tab**; the **"Tray"** color only applies to the **Button** and **Step** styles; leave **"Hover"** empty to fall back to the **Active** color.
- **"Hide tab bar when only one tab"** only hides it in the **live view**; while editing, it stays visible so you can keep working.
- The **app-wide default style** is stored **per theme**, so editing a theme's colors won't lose the config. To **limit who can change the shared default**, go to **Roles** and deny *create/update* on the `ptdlTabStyleSettings` collection for other roles (by default every logged-in account can write, but only UI-editors see the toggle).
- Runs on **both** clients: classic `/admin` and modern `/v/`.

## Remove / disable

- **Disable the plugin** in **Plugin Manager**: the two **Tabs / Collapse** blocks and the **"Tab style"** item disappear; page tab bars revert to **NocoBase's default style**.
- Any layout you built (the tabs/sections and the blocks inside them) **stays in the page config** — **re-enable the plugin and it all comes back intact**. **Field values in forms are unaffected.**
- The **app-wide default** style stays in the `ptdlTabStyleSettings` table; re-enabling the plugin brings it back.

---

### For developers

Blocks, tabs and sections live in the page's **flowModels tree** (no dedicated table). The **app-wide default** style is stored server-side in the `ptdlTabStyleSettings` collection — **one row per theme** (`settingKey`), which the client reads into a cache at startup (mirrored to `localStorage`). Every tab style is produced with **scoped CSS over antd line-tabs**, so it can apply even to the core page/popup tabs (which can only be restyled, not "re-typed"). Adding/altering the **server tier** (the collection / ACL) needs a **restart**; **client-only** changes just need a **hard refresh**.

Build with `bash build-env/recipes/run-layout-containers-build.sh`; deploy = extract the tgz into `nb-local/node_modules/@tuanla90/plugin-layout-containers` + `storage/plugins/...` with the `applicationPlugins` row enabled.

> Note: the **Position** option (Top / Bottom / Left / Right vertical variants) is implemented but **hidden in 0.4.1** — it is forced to **Top** while the vertical / bottom-card rendering is still WIP, which is why it isn't exposed as a user option above.
