# @ptdl/plugin-custom-header

Style titles & labels across the NocoBase UI — on **both** the classic (`/`) and modern (`/v/`)
clients. Client-only styling; **bundles no icon library** (icons come from the shared registry, full
Lucide with `@ptdl/plugin-custom-icons` installed).

## What it styles

Each surface adds a settings item to the corresponding FlowModel's ⚙ menu:

| Surface | Settings item | Options |
|---|---|---|
| **Page header** (`PageModel`) | *Header appearance* | icon · color · **size** · bold · **background** (solid / **gradient**; also tints the tab bar) |
| **Table column** (`TableColumnModel` + JS/custom columns) | *Column style* | icon · color · **size** · bold · **header align** + **cell align** (independent, L/C/R) |
| **Form / Detail / JS field label** (`FormItemModel` / `DetailsItemModel` / `FormJSFieldItemModel`) | *Label style* | icon · color · **size** · bold |
| **Block / section title** (`BlockModel`) | *Block title style* | icon · color · **size** · bold · **background** (solid / **gradient**) |

All surfaces share: a Lucide/registry **icon picker**, a live **preview**, and a **Reset** button.

## Field-level defaults ("set once, show everywhere")

In the *Column style* / *Label style* dialog, the **"Apply to all views"** toggle controls where the
style is stored:

- **ON** → saved as a **field-level default** in the server collection `ptdlFieldStyles`
  (one row per `dataSource + collection + field`). It then shows in **every** table / form / detail
  that renders this field.
- **OFF** → saved as a **per-view override** in that model's flow params (`chFieldStyle`).

At render time the two are merged (`mergeFieldStyle`): the per-view override wins per property,
otherwise the field-level default applies. The client loads all defaults into an in-memory cache once
at startup (`loadFieldStyleCache`).

> Notes: **size** is per-view only (not stored at field level). JS/custom columns have no
> `collectionField`, so they support per-view styling only.

## i18n

Settings labels are translated via `app.i18n.addResources(lang, '@ptdl/plugin-custom-header/client', …)`
in each lane. Bundled locales: **en-US**, **vi-VN**, **zh-CN** (`src/locale/*.json`). A missing key
falls back to the English key text, so an incomplete locale never breaks the UI. React-rendered labels
(Segmented options, "Preview", preview placeholders) don't pass through the schema `{{t()}}` path, so
they are translated at runtime via `setRuntimeT` (wired to the app i18n in each lane's `load()`).

## Technical notes

- **Never clobbers the string title/label prop.** Many consumers read `props.title` / `props.label`
  as a string and call `.trim()` (core `onCell`, `@ptdl/plugin-enhanced-table` columnTitles/summary).
  So the string prop is kept intact and only the **rendered output** is decorated:
  - table → patch `getColumnProps`, inject icon into the title's inner div (so antd `align` moves icon + text together);
  - form/detail → patch `renderItem`, clone the FormItem with a decorated `label`;
  - block → patch `render()`, decorate the card `title` node + apply `styles.header` background.
- **Classic lane** (`@nocobase/client` re-exports a curated model set) resolves base model classes via
  `flowEngine.getModelClass(name)` with a prototype-walk fallback.

## Server

`PluginCustomHeaderServer` defines the `ptdlFieldStyles` collection (fields: `dataSource`,
`collectionName`, `fieldName`, `icon`, `iconPosition`, `color`, `bold`; ACL: `loggedIn`) and keeps it
synced on install / enable / load.

## Build

```bash
bash build-env/recipes/run-custom-header-build.sh   # → build-env/storage/tar/*custom-header*.tgz
```

No bundled deps — framework packages (`react`, `antd`, `@nocobase/*`, `@formily/react`) are stubbed at
build so `dist/externalVersion.js` matches the runtime.

## Status

See [IMPROVEMENTS-CHECKLIST.md](./IMPROVEMENTS-CHECKLIST.md) for the v0.2.0 change batch and acceptance
tests. Not yet done: background **image** (only solid/gradient today) and column-header background;
a global force-render when a field-level default changes (today the cache refreshes on tab refocus only).
