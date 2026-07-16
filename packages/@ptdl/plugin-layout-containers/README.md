# @ptdl/plugin-layout-containers

Layout containers for NocoBase 2.x — **Tabs** and **Collapse/Sections** as blocks *and* as in-form
items, plus **custom styling** for the built-in page/popup/view tabs. Runs on both the classic (`/`)
and modern (`/v/`) clients.

## What you get

### 1. Tabs block
Add via **Add block → Other blocks → Tabs**. Each tab holds a full block grid, so you can drop any
block inside — including another Tabs block, so tabs **nest infinitely**. Drag a tab onto another to
reorder; the gear on each tab renames it / sets an icon / removes it.

### 2. Collapse (Sections) block
Add via **Add block → Other blocks → Collapse (Sections)**. Same panes as the Tabs block, but stacked
as **collapsible sections**. Gear on the block → **Collapse** settings:
- **Accordion** (open one section at a time) · **Bordered** · **Ghost** (borderless) · **Size** ·
  **Expand icon** position (start/end).
- **Header background**, **Active color** (open header text + icon), **Border color**.
- Live preview in the settings dialog.

### 3. In-form Tabs & Sections (group fields)
Inside a Create/Edit **Form** block: **Fields → Others → Tabs** *or* **Collapse (Sections)**. Each
pane/section gets its own field area, so you can organise a form's fields into tabs or collapsible
sections. Fields bind and submit normally (the form reads values from the Formily instance, which
doesn't care how deep a field is nested).
> Note: verify required-field validation for fields in a pane you never open — antd lazy-mounts panes.

### 4. Styling the built-in page / popup / view tabs
Every page (and record detail popup / view) with **Enable tabs** gets a **Tab style** item in its
settings gear. `MainPageModel`-style pages without a tab bar are untouched.

## Tab styles
`Line` · `Button group (pill)` · `Segment (bordered)` · `Card (folder)` · `Step` · `Text (color only)`

All produced with scoped CSS on antd line-tabs (so they work the same on the block and the core page
tabs, which can only be restyled — not re-typed).

**Position:** Top · Bottom · **Left · Right**. Every style has a proper **vertical** variant — Card
rounds its outer corners and joins the content edge, Segment moves its dividers to the block axis,
Step draws a vertical connector between the numbered badges, Button softens its pill tray. (Page/popup
tabs stay top.)

## Options (block + page)
- **Colors**: active, hover, container (button tray / step badges), border, background (active tab).
- **Text size**, **Top spacing**, **Centered**, **Position** (block only — page tabs stay top).
- **Hide tab bar when only one tab** (page/popup/view — runtime only; shown while editing).
- **Live preview** in the settings dialog.

## App-wide default ("Apply to all default tabs")
Turn on **Apply to all default tabs** to set a shared default for every built-in tab bar. It is stored
**server-side** (collection `ptdlTabStyleSettings`) **per theme** (keyed by the user's current theme
id from `systemSettings.themeId`, with a light/dark + primary-color fallback), so:
- An **admin sets it once → every user sees it** (on their next load), for the matching theme.
- Editing a theme's colours never orphans the config (keyed by theme **id**, not colour).
- A page styled with **Apply global OFF** keeps its own look (per-page override).

Logged-in users can read + write `ptdlTabStyleSettings`; in practice only UI-editors reach the write
path (the **Apply to all default tabs** toggle is shown only in editor mode). To hard-restrict writing
to specific roles, deny that collection's create/update to other roles in the Roles settings.

## Build

```bash
bash build-env/recipes/run-layout-containers-build.sh
```

Deploy = extract the tgz into `nb-local/node_modules/@ptdl/plugin-layout-containers` +
`storage/plugins/...`, `applicationPlugins` row enabled. **Server-lane changes (the collection / ACL)
require a restart; client-only changes just need a hard refresh.**
