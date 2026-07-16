# @ptdl/plugin-detail-panel — Detail Panel / "Side panel" open mode

AppSheet-style **master–detail split view** for NocoBase `/v/`, in two complementary features that share the
layout's built-in embed side container, plus a **drag-resize splitter**.

## A) "Side panel" open mode (full, editable popup)

Adds a **"Side panel"** option to the *Open mode* of record popups — a native-feeling 4th choice next to
Drawer / Dialog / Page.

## What it does

In a record action's **Edit popup** dialog:

```
Open mode:  ( ) Drawer   ( ) Dialog   ( ) Page   (•) Side panel   ← added
Popup size: ( ) Small    (•) Medium   ( ) Large                   ← controls panel width (30/40/50%)
Popup template: …                                                  ← your existing configured popup
```

Pick **Side panel** and clicking that action (e.g. the row **View** button) opens the *exact same configured
popup* — tabs, action buttons, editable form/detail/sub-blocks — **docked to the right** in the layout's
built-in `#nocobase-embed-container`. The content shrinks beside it (no mask, both interactive), and opening
another record **swaps** the panel without closing it. The panel's X (or opening elsewhere) closes it and
restores the layout.

Nothing new to build: it reuses whatever popup the user already configured. It works anywhere `openView`
is used (row View/Edit buttons, association fields, …).

## B) Row-click (click anywhere on a row body)

A Table block ⚙ toggle (**Side detail panel**). Click **anywhere on a row body** (no button needed) → the
record opens in the side panel. **Panel content** is a choice:

- **Configured popup (full, editable)** — *default*. Triggers the row's own **View** action (the same popup
  the user built: tabs, actions, editable form/sub-blocks) in Side panel mode, so clicking the row body and
  clicking the **View** button give the *same* editable popup. Falls back to the quick view if the table has
  no popup action.
- **Quick view (read-only)** — a zero-config read-only field list (optionally a field subset).

Clicking another row swaps the panel; the X closes it. Width follows the picked size (30/40/50%).

Clicks that land on a row **action button** (View/Edit/Delete), link, checkbox or inline input are ignored
by the row-click handler — those run their own action — so B coexists with A on the same table with **no
double-open** (row body and the View button each open the popup exactly once).

## Splitter

While the panel is open, a drag handle sits on its left edge — drag to resize the split (min 320px panel /
360px content). Applies to both features.

## How it works (no core patching)

Augments the already-registered native `openView` action in place:

1. Pushes a `sidePanel` option into `uiSchema.mode.enum` (label baked per language).
2. Wraps `handler`: when `mode === 'sidePanel'`, retarget the open to `#nocobase-embed-container`, apply a
   width from the popup size, and disable router navigation — then delegate to the original handler (which
   still builds the real popup page). The retarget mutates `ctx.inputArgs` **properties** (reassigning the
   whole object does not stick).
3. A `MutationObserver` on the container restores the layout width when the panel closes.

## Scope / notes

- `/v/` only — classic `/admin` uses a different, schema-based popup system (no `openView` action, no embed
  container), so neither feature applies there → no-op.
- Client-only; no server, collection, or schema.
- Degrades to a drawer if the embed container is missing (e.g. mobile, where core forces full-screen embed).
- Reuses the flow-engine's *global-embed replace behavior* for the swap; coexists with subtable-pro's
  `rowClick` bridge + conditional-format on the same blocks.

## Build & deploy

```bash
cd build-env
bash recipes/run-detail-panel-build.sh
bash recipes/add-markers.sh storage/tar/@ptdl/plugin-detail-panel-0.1.0.tgz
# deploy the tgz into nb-local/node_modules/@ptdl and pm2 restart index
```
