# Inline Field — User Guide

> Add a **new column (field) while editing a table view** — no trip to the Collection Manager. Define it
> in a small dialog and the column appears **right there** in the block you're editing.

**Group:** Fields · **Runs on:** /v/ (modern) · **Version:** 0.1.3

## What it adds

- A **“Add new column”** item in every **Table block’s ⚙ settings menu** on `/v/`.
- Picking it opens a dialog: **Column name**, **Data type**, and type-specific options (choices, linked collection, or a formula).
- On **OK** the plugin **creates the field** on the collection, **migrates the physical column**, and **drops the column straight into the block being edited** — visible immediately, no page refresh.
- ✅ Fills a real NocoBase gap: normally a new column means **Collection Manager → Add field → come back and enable the column**. This collapses all three into one in-place step.

## How to use

1. Open a `/v/` page with a Table block and enter UI-config mode.
2. On the Table block, open its **⚙ menu** → **“Add new column”**.
3. Enter a **Column name** (e.g. *Notes*, *Unit price*). The **Field key** (snake_case) is auto-derived from it; override it under **Advanced**.
4. Pick a **Data type**. Choice → type values; **Relation** → pick the linked collection; **Computed** → write a formula.
5. Toggle **Required** if needed, then **OK**.
6. ✅ A “Column … added” toast appears; the new column sits just before the row-actions column. Drag the column header to reposition.

## Supported data types (0.1.3)

Text (single/multi-line), Email, Phone, Link (URL) · Decimal, Integer, Percent · Single choice, Multiple
choice, Yes/No, **Status flow** · Date, Date & time, Time · **Relations** (link-to-one m2o, child-list o2m,
many-to-many m2m) · **Icon**, Color, **Image/File (URL)**, **Attachment (upload)** · **Computed (formula)**.

### Status flow, icon & files (new in 0.1.3)

- **Status flow** — a **simple** config: list the states and pick a **colour** for each. **First state = start (init), last = end**; a linear flow is auto-derived. Renders as coloured tags + a change-status action (fullest with **@tuanla90/plugin-status-flow** installed).
- **Icon** — an icon-picker field (Lucide set).
- **Image/File (URL)** — paste an existing image/file URL; shown as a clickable link.
- **Attachment (upload)** — real file upload to storage (**requires the File manager plugin**, usually present), stored in the `attachments` collection.

### Relations (new in 0.1.2)

Pick a **Relation** type → a **Linked collection** picker appears:
- **Link to one record (m2o)** — each row points to one record of the other collection (belongsTo). e.g. order → customer.
- **Child records list (o2m)** — each row has many children in the other collection (hasMany); a **reverse link** is auto-created on the child.
- **Many-to-many (m2m)** — through a junction table (belongsToMany).

### Computed columns (from 0.1.1)

Pick **“Computed (formula)”** → a **Result** type (Number / Integer / Percent / Text) and an Excel-style
**Formula** box appear. Reference other columns with `data.<field_key>` — the **“Insert field / relation”**
picker (the same one the **Formula** plugin uses) inserts at the caret and **drills relations too**, e.g.
`data.customer.name`. Click **“Preview”** to run the formula against the **first record** and see the value.
The plugin creates a read-only field plus a **@tuanla90/plugin-formula** rule, so the value **auto-recomputes**
on create/update.

> ⚠️ Computed columns (and Preview) require **@tuanla90/plugin-formula**. Without it the column is still
> created but the formula stays inactive (the plugin says so).

## Notes

- 🧱 The created column is a **real field** (with a physical DB column), not a virtual one. Delete it from the **Collection Manager**.
- 🔤 Two columns with the same display name are fine — the **machine name** is auto-suffixed (`notes`, `notes_2`, …).
- 🔁 The column is auto-added to **the block you acted on**; the new field is also immediately available in every other block’s **“Fields”** (⚙) picker for that collection.
- 🔒 Creating a field is a config action — keep it to users who may edit the UI.

## Disable

- **Disabling the plugin** removes the menu item. Fields you already created **remain** (they’re real collection fields) — no data loss.

---

### For developers

Entry point = `TableBlockModel.registerFlow` (a ⚙-menu item) + `flowSettings.registerComponents` (the
dialog body is a React component, `PtdlInlineFieldForm`) — the exact live-verified pattern of
`@tuanla90/plugin-conditional-format`. Field creation goes through the server action
**`ptdlInlineField:createField`**: write a `fields` metadata record (with `context`) then
`collection.sync({alter:true})` to migrate the physical column — mirroring app-builder’s `opAddField`.
The client then `dataSourceManager.reload({keys})` to pick up metadata and attaches the column exactly the
way the native **Fields** button does: `createModelAsync` → `addSubModel('columns', …)` →
`afterAddAsSubModel` → `save`. The field-type map (`buildFieldDef`) and default renderer map
(`DISPLAY_BY_INTERFACE`) are reused verbatim from app-builder. ACL is `loggedIn` (matches app-builder /
field-order) — tighten to an admin role if you expose it to non-admins. `/v/` only (classic has no
`TableBlockModel`).
