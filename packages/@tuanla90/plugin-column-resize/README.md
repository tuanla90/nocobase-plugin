# Column Resize (drag to resize table columns) — User Guide

> Drag the **right edge** of any table column header to make it wider or narrower. Widths are **saved per
> block** (everyone sees the same layout, like NocoBase's native *Column width* setting). Just switch it
> on — **no code**.

**Group:** Blocks · **Runs on:** **/v/ (modern) only** — not /admin (classic) · **Version:** 0.1.1

## What's new after installing?

- **A resize grip on every column header** in `/v/` tables — hover the right edge of a header, the cursor
  becomes ↔, drag to set the width. It's **live**: the table re-lays out as you drag, and columns shrink or
  grow exactly like the built-in setting.
- Works on **page tables** (the Table block) **and sub-tables** inside edit/create forms.
- **Widths are saved per block / per sub-table field** and shared with everyone — the same behaviour as the
  built-in *Column width*. They persist across reloads.
- **Adds no** menu, Settings page, field or collection. Pure UI — it doesn't touch the server.

## How to use

1. Turn the **UI editor ON** (top-right toggle). Widths are only editable in edit mode, so regular users
   can't accidentally change the shared layout.
2. Hover the **right edge** of a column header until the cursor becomes ↔.
3. **Drag** left/right to resize; release to save. The width is stored on that block and shown to everyone.

## Requirements & limits

- **`/v/` (modern) client only.** On the classic `/admin` client the plugin is a no-op.
- **Editable only with the UI editor on** — with the editor off, columns render at their saved widths but
  can't be dragged (normal viewers see the layout, they don't change it).
- Minimum column width is **56px**.
- Widths are **shared, not per-user** — a saved width is the block's layout for everyone (matching the
  native *Column width*).
- **Crash-safe:** if anything goes wrong it silently falls back to the normal table — it never
  white-screens the page.
