# @ptdl/plugin-instant-create-page — "Tạo trang nhanh" / Instant Create Page

One action → a ready-to-use page. Pick a **collection** and a **list of columns**; Instant Create Page builds a
`/v/` menu page containing a **Table** of exactly those columns, plus working **View / Edit / Add**
buttons whose popups show the same columns. No manual block/column/popup configuration.

## How to use
Open the tool one of two ways:
- **Settings → Quick create page**, or
- the floating **➕ Quick page** button (bottom-right, anywhere in the app).

Then: choose a collection → tick the columns → (optional) title / icon / menu group → **Create page**.
You land on the new page immediately; it also appears in the left menu.

## What it generates
A native, fully-editable page — nothing custom to maintain:
- `TableBlockModel` bound to the collection, one column per picked field.
- A row-actions column with **View** (read-only details) and **Edit** (form + Save).
- A toolbar **Add new** (form + Save) and **Refresh**.
- Every popup contains the picked columns.

Because the output is a normal NocoBase page (`desktopRoutes` + `flowModels`), you can keep customizing
it afterwards like any hand-built page.

## Notes & limits (v1)
- Modern client (`/v/`) only — the classic `/admin` lane is a no-op.
- Popups show **the selected columns**; if Add/Edit needs a required field you didn't pick, add it on the
  generated page (a future version can auto-include required fields).
- Column order = selection order.

## Roadmap
- Choose **basic vs. Enhanced** table (the `@ptdl/plugin-enhanced-table-block` model — one-line swap).
- **Drag-reorder** columns; per-column width / label.
- Per-popup field set (incl. auto-add required fields).

## Build & install
See `docs/NOCOBASE-PLUGIN-BUILD-GUIDE.md` (Cách A). Bilingual (en/vi) and reuses `@ptdl/shared`
(`ColumnSelect`, i18n) per the workspace build rules.
