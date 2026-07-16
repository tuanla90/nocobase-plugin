# @ptdl/plugin-field-enhancements

**16 no-code field widgets** for NocoBase — swap a column/field's renderer or input for a richer one, no RunJS required. Also ships a bundled **RunJS snippet library** for the cases you do want to script. Works on both clients: classic `/admin` and modern `/v/`.

## How to use

Each widget is registered as a **Field component**. Most are **opt-in** — existing fields are untouched until you pick one. The **`color`** and **`icon`** widgets are the exception: they replace the core component **by default** (see the *Default* column in the catalog).

1. Open a block (Table / Detail / Form / List).
2. Click a column header ⚙ (or a form field's ⚙) → **Field component**.
3. Pick the widget that fits the field's type (see catalog). A settings dialog opens (live preview + options).

All widgets are **display-safe**: they render over the real stored value, so sorting, filtering and export keep using the underlying data.

## Widget catalog

**16 field components**, grouped by data type. *Role* = whether the widget handles input (edit form), read-only display, or both. *Default* widgets replace the core component automatically for that interface; the rest are opt-in (pick them per field via ⚙ → Field component).

| Widget | Applies to (field interfaces) | Role | What it does |
|---|---|---|---|
| ***Numbers*** | | | |
| **Number with unit** | `number` · `integer` · `percent` | edit + display | Prefix icon + thousands/decimals formatting + a unit (fixed text or taken from another column). |
| **Star rating** | `number` · `integer` | edit + display | Render/enter the value as ⭐ (antd Rate): custom icon, max, half-stars, colour, optional number. |
| **Progress bar** | `number` · `integer` · `percent` | edit + display | Line / Circle / Gauge progress: mono / gradient / threshold colours, percent text, label. |
| ***Choice / enum*** | | | |
| **Value tag** | `select` · `radioGroup` · `singleSelect` · `multipleSelect` · `input` | display | Map a value → a coloured tag (text/bg colour, icon, border, radius, text style) via a rules table. |
| **Button group** | `select` · `multipleSelect` | edit + display | Options as a segmented button group; also a compact single-tag display. |
| ***Text*** | | | |
| **Input with icon** | `input` · `email` · `phone` · `url` · `uuid` · `nanoid` · `password` | edit + display | Text input with a prefix icon + custom placeholder + max-length trim. |
| **Link** | `url` · `email` · `phone` · `input` | edit + display | Clickable link (mailto/tel/https or internal), icon, `{{field}}`/`{{value}}` href template, new/same tab. |
| **Clamp text** | `textarea` · `markdown` · `richText` | display | Clamp long content to N lines with a show-more toggle or full-text tooltip. `richText` renders sanitised HTML; others plain text. |
| ***Boolean*** | | | |
| **Boolean style** | `checkbox` · `boolean` | edit + display | Toggle / filled / outlined styles, on/off icon + colour + text. |
| ***Relation*** | | | |
| **Rich select** | `m2o` · `o2o` · `oho` · `obo` · `o2m` · `m2m` | edit + display | Association dropdown: Avatar + Title + Subtitle (preset) or a `{{field}}` HTML template (sanitised). |
| ***Date / time*** | | | |
| **Relative date** | `datetime` · `dateOnly` · `datetimeNoTz` · `unixTimestamp` · `createdAt` · `updatedAt` | display | Distance from **today** or **another date column**: Today / Yesterday / 3 days ago / in 5 days. Modes Auto · Smart (weeks/months/years) · Days · Number; overdue / due-soon / today / future colours; real-date tooltip or suffix. |
| ***Colour*** | | | |
| **Colour picker** | `color` | edit · **default** | Edit with the library `ColorField` (16-colour `COLOR_PRESETS` palette) instead of the core antd picker's presets. |
| **Colour chip** | `color` | display · **default** | Render a hex value as a swatch — dot / chip (swatch + hex) / pill (filled, contrast text) / bar; optional hex label + click-to-copy. |
| ***Icon*** | | | |
| **Icon picker** | `icon` | edit · **default** | Pick an icon with `RegistryIconPicker` (full **Lucide** set via custom-icons, grouped Lucide/AntD) instead of the core antd Outlined/Filled/Two-tone picker. |
| **Icon glyph** | `icon` | display · **default** | Render the stored icon **name** as its glyph: colour, size, optional background circle/square, optional name label. |
| ***JSON*** | | | |
| **JSON view** | `json` | display | Render as key/value **pills** (flat) or pretty **code** (clamped, show-more) instead of a raw `{...}` blob. |

> **`color` and `icon` default to the library end-to-end** (`isDefault: true`) — editing uses our picker, display uses our renderer, on every such field automatically. Switch a specific field/column back to the core component via ⚙ → Field component if needed. The other 12 widgets are opt-in.

## RunJS snippet library

The plugin also seeds a **RunJS snippet library** (icon-in-input, rich association dropdown, select→button group, star, progress, avatar, tags, formatters). Snippets appear in the RunJS editor picker for the matching field context — use these when you want to tweak the behaviour in code instead of the no-code dialogs.

Template tokens are standardised on the **double-brace** `{{field}}` form (legacy single-brace `{field}` still parsed for backward compatibility).

## i18n

Dialog labels and the Relative-date cell strings ship with **vi-VN** (`src/locale/vi-VN.json`, namespace `field-enhancements`). Other languages fall back to English. Cell strings are localised at runtime with `{{count}}` interpolation.

## Development notes

- Both lanes register through one shared path — `src/shared/registerAll.ts` (`registerAllFieldModels`). The two `index.tsx` files only inject the lane-specific base classes (`@nocobase/client` vs `@nocobase/client-v2`). **Add a new widget there once**, not in two places.
- Each widget lives in its own `src/shared/<name>Model.tsx`. Display-only widgets subclass `DisplayTextFieldModel` and override `renderComponent`; editable widgets subclass `FieldModel` and override `render()` (branching on `pattern === 'readPretty'`). Most bind with `isDefault: false` (opt-in); `color`/`icon` bind `isDefault: true` on both the display and editable registries so they replace the core components end-to-end.
- Icons come from the shared registry (`@ptdl/shared` → `IconByKey` / `RegistryIconPicker`); with `@ptdl/plugin-custom-icons` installed you get the full Lucide set, otherwise the built-in Ant Design icons.

## Build

```bash
bash build-env/recipes/run-field-enhancements-build.sh
bash build-env/recipes/add-markers.sh build-env/storage/tar/@ptdl/plugin-field-enhancements-<ver>.tgz
```

`add-markers.sh` injects the root `client.js` / `client-v2.js` markers the modern `/v/` lane needs (the `--tar` build omits them).
