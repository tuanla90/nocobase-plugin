# Field Enhancements — User Guide

> Change how a **field** is displayed or entered — into something prettier and easier to read:
> progress bars, star ratings, coloured tags, On/Off badges, inputs with icons… all **with no code**.
> Comes with a **RunJS snippet library** for the times you'd rather script it yourself.

**Group:** Fields · **Runs on:** /admin (classic) + /v/ (modern) · **Version:** 0.2.35

## What's new after installing?

- **No new menu, no new page.** The changes live right inside the **⚙ config of each column/field**
  on a block (Table, Detail, Form, List).
- Each widget is registered as a **"Field component"**. On a field of the right data type, open ⚙ → **Field component**
  to find **new display options** (e.g. a number column gains **Progress bar**, **Star rating**, **Number with unit**).
- **Every widget is opt-in.** A field always keeps NocoBase's **basic default renderer/editor**; you pick a widget
  per column/field when you want it (or enable them in bulk via the advanced-field config). This keeps a field
  **independent of whether the plugin is installed** — safe, with no "Model class not found" if it's removed/absent.

## Where to configure

There is **no settings page** and **no extra menu** — you configure everything from the **⚙** of the individual
column or field, on any block (Table, Detail, Form, List).

| Client | Where |
|---|---|
| **Modern (`/v/`)** | Turn on the UI editor → hover a column header / field → **⚙** → **"Field component"** |
| **Classic (`/admin`)** | The same **⚙** on the column/field → **"Field component"** |

Both clients use the **same ⚙ → Field component** path. Which widgets appear depends on the field's **data type**:

| Field type (data type) | Extra display widgets available |
|---|---|
| Numbers: `number`, `integer`, `percent` | **Progress bar**, **Number with unit**, **Percent text** |
| Numbers: `number`, `integer` | **Star rating** |
| `checkbox`, `boolean` | **Boolean style** — Toggle or Icon, On/Off labels, On/Off colours |
| `color` | **Colour chip** (dot / chip / pill / bar) · **Colour picker** (colour input) |
| `icon` | **Icon glyph** (shows the icon) · **Input with icon** (input with an attached icon) |
| `select`, `multipleSelect` | **Button group** · **Value tag** (colour by value) · **Rich select** |
| `url`, `email`, `phone`, `input` | **Link** (turn a string into a clickable link) |
| `textarea`, `markdown`, `richText` | **Clamp text** (trim to N lines) · **Rich display** · **Text style** |
| `json` | **JSON view** (compact JSON, collapsible) |
| `date` / `datetime` | **Relative date** ("3 days ago"…) + the real date on hover |

> Around **16 widgets** in total. **All of them are opt-in** — NocoBase's basic renderer is always the default.

## How to use (step by step)

### Example — turn a "Progress" number column into a Progress bar
1. Open a page whose **Table** has a number column (e.g. a `progress` column of type `percent`/`number`).
2. Turn on the **UI Editor** → **hover the column header** → click the **⚙** icon.
3. Choose **"Field component"** → in the list pick **"Progress bar"**
   (the list only shows widgets that fit the field type).
4. A settings dialog appears (**with live preview**) → adjust **Low/Mid/High color**, thresholds, corner radius… → done.
5. ✅ Cells in that column now show a progress bar instead of a bare number.

### Example — turn a rating column into stars
1. On an `integer`/`number` column (e.g. `rating`), open **⚙ → "Field component"**.
2. Pick **"Star rating"** → the settings dialog lets you set the max number of stars and the colour.

### Colour columns, select columns…
- A `color` column already becomes a **colour chip**; to change the shape (dot/pill/bar) → **⚙ → Field component → "Colour chip"**.
- A `select` column: **⚙ → Field component → "Button group"** (buttons) or **"Value tag"** (a coloured tag per value).

> 💡 The same **⚙ → Field component** path works for **Table columns, Detail fields, and inside Forms and Lists**.

## Tips & notes

- ⚠️ A widget only appears for the **matching data type** (see the table above). Columns of another type won't offer it.
- ✅ **Display-safe:** widgets draw over the original value, so **sorting, filtering and export still use the real data** — the data itself is never changed.
- Runs on **both** clients: classic `/admin` and modern `/v/`.

## Remove / disable

- Disable the plugin in the **Plugin Manager**. Fields that were using a widget revert to NocoBase's default renderer;
  the widget config already saved in the block schema is kept in case you re-enable.

---

### For developers

Both lanes register through one shared path — `src/shared/registerAll.tsx` (`registerAllFieldModels`); the two
`index.tsx` files only inject the lane-specific base classes (`@nocobase/client` vs `@nocobase/client-v2`), so
**add a new widget there once**, not in two places. Each widget lives in its own `src/shared/<name>Model.tsx`:
display-only widgets subclass `DisplayTextFieldModel` and override `renderComponent`; editable widgets subclass
`FieldModel` and override `render()` (branching on `pattern === 'readPretty'`). **Every** widget binds with
`isDefault: false` (opt-in) against NocoBase's built-in field interfaces — the core renderer/editor stays the
default, so a plain field never depends on this plugin being installed (no "Model class not found" when it's
absent) and stays on NocoBase's basic config; users switch a column/field to a widget per-field, or turn it on
globally via the advanced-field config. Icons come from the shared registry (`@tuanla90/shared` → `IconByKey` / `RegistryIconPicker`); with
`@tuanla90/plugin-custom-icons` installed you get the full **Lucide** set, otherwise the built-in Ant Design icons.

A bundled **RunJS snippet library** (`src/shared/generatedSnippets.ts`) is also seeded — snippets appear in the RunJS
editor picker for the matching field context, for when you want to tweak behaviour in code instead of the no-code
dialogs. Template tokens are standardised on the double-brace `{{field}}` form (legacy single-brace `{field}` is still
parsed for backward compatibility). Dialog labels and the Relative-date cell strings ship with **vi-VN**
(`src/locale/vi-VN.json`, namespace `field-enhancements`); other languages fall back to English.

Build:

```bash
bash build-env/recipes/run-field-enhancements-build.sh
bash build-env/recipes/add-markers.sh build-env/storage/tar/@tuanla90/plugin-field-enhancements-<ver>.tgz
```

`add-markers.sh` injects the root `client.js` / `client-v2.js` markers the modern `/v/` lane needs (the `--tar` build omits them).
