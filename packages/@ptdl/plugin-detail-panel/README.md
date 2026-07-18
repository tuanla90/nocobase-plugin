# Detail Panel (split-screen detail view) — User Guide

> Open a record **docked to the right** instead of a full-screen popup — **AppSheet-style master–detail**:
> the list on the left, the record's details on the right, drag the divider to resize. Just switch it on, **no code**.

**Group:** Blocks · **Runs on:** **/v/ (modern) only** — not /admin (classic) · **Version:** 0.1.0

## What's new after installing?

- **A new way to open a record: “Side panel”** — a **4th** choice beside Drawer / Dialog / Page in the *Open mode* of every popup button (View/Edit…). Pick it and the popup **docks to the right**, with the main content **shrinking beside it** instead of being hidden under a mask.
- **A new option in the Table block's ⚙: “Side detail panel”** — turn it on so **clicking anywhere on a row** opens that record in the right-hand panel (no button needed).
- **A drag splitter** on the panel's left edge: drag to resize the panel / content.
- **Adds no** menu, Settings page, field or collection. **Doesn't touch the server** — pure UI.
- ⚠️ **Nothing is enabled by default:** you must pick **“Side panel”** for a button, or turn on the row-click toggle, before anything takes effect.

## Where to configure

The plugin has **no Settings page of its own**. Everything is configured **right on the block/button** in **UI Editor** mode (toggle the UI-editing button in the top-right corner).

| Feature | Where to set it |
|---|---|
| **“Side panel” open mode** (per button) | Turn on **UI Editor** → click a button (e.g. **View**/**Edit**) → ⚙ → the popup config (*Edit popup*) → the *Open mode* section → choose **“Side panel”** |
| **Row-click opens the panel** (whole table) | Turn on **UI Editor** → the **Table** block's ⚙ → **“Side detail panel”** |

> ⚠️ Only on the **/v/ (modern)** client. On **/admin (classic)** the plugin **does nothing** (the classic client has no such *Open mode* control and no dock area to split the screen).

## How to use (step by step)

### Scenario A — Make a **View/Edit** button open the record in the right panel

1. Open a page with a **Table** block and turn on **UI Editor**.
2. Click a row's button, e.g. **View** → open ⚙ → choose the popup config (*Edit popup*).
3. In the *Open mode* section, choose **“Side panel”** (instead of Drawer / Dialog / Page).
4. (Optional) Choose the **Popup size** → the panel becomes **30% / 40% / 50%** wide accordingly.
5. **Save**. ✅ From now on, clicking **View** opens **exactly the popup you configured** (its tabs, buttons, editable form/sub-blocks) **docked to the right**, with the table shrinking on the left; opening another row **swaps the content** rather than closing; click **X** to close and restore the layout.

> 💡 It **reuses the very popup you built** — nothing new to make. It applies everywhere a popup button exists: a row's View/Edit buttons, association fields…

### Scenario B — **Click a row** to open the panel (no button needed)

1. Turn on **UI Editor** → open the **Table** block's ⚙ → choose **“Side detail panel”**.
2. Turn on the **“Click a row to open a detail panel on the right”** toggle.
3. Choose **“Panel content”**:
   - **“Configured popup (full, editable)”** *(default)* — clicking a row opens **the View button's exact popup** (editable tabs, buttons, form). So the row body and the **View** button give the **same** popup. (If the table has no popup button, it falls back to quick view.)
   - **“Quick view (read-only)”** — a **read-only** field list, no extra configuration.
4. Choose **“Panel width”**: **“Narrow (30%)” / “Medium (40%)” / “Wide (50%)”**.
5. If you chose **“Quick view (read-only)”**, you can use the **“Fields to show (empty = all)”** box to show only a few fields (leave empty = show all).
6. **Save**. ✅ Now **clicking any row body** opens the record in the panel; clicking another row **swaps** it; click **X** to close.

> 💡 Clicks that land on a **button** (View/Edit/Delete), a **link**, a **checkbox** or an inline input do **not** trigger the panel — those run their own action. That's how A and B **coexist** on the same table with **no double-open**.

### Scenario C — Resize the panel

- While the panel is open, a **drag handle** sits on the panel's **left edge** — **drag** it to resize. The system keeps a minimum of **320px for the panel** and **360px for the main content** so nothing gets squeezed away.

## Tips & notes

- ✅ **No server restart needed:** this is a pure client-side (UI) feature; configure, **Save**, and it works right away.
- **A and B share the same right-hand panel** region, so the experience is identical; both have a drag handle to resize.
- Size → panel width mapping:

  | Choice | Panel width |
  |---|---|
  | Small / **Narrow (30%)** | ~30% of the screen |
  | Medium / **Medium (40%)** *(default)* | ~40% of the screen |
  | Large / **Wide (50%)** | ~50% of the screen |

- ⚠️ **/v/ only:** on /admin (classic) the plugin is a **no-op** — no error, but nothing changes either.
- 📱 **Very narrow screen / phone:** if there's no dock area to split, the panel **falls back to a drawer** that covers the screen as usual — still usable, just not split-screen.
- Coexists nicely with other @ptdl plugins acting on the same block (e.g. Sub-table Pro's row-click, conditional formatting).

## Remove / disable

- **Turn off for one button:** reopen the button's popup config, set *Open mode* back to **Drawer / Dialog / Page** → **Save**.
- **Turn off row-click for a table:** open **⚙ → “Side detail panel”**, turn off the **“Click a row to open a detail panel on the right”** toggle → **Save**.
- **Remove entirely:** disable the plugin in **Plugin Manager**. Because the plugin **creates no data / collection / field**, turning it off reverts buttons to their default open mode — **no data is lost**.

---

### For developers

Client-only, **/v/ only**; no server, collection, or schema, and no core patching. **A** pushes a `sidePanel` option into the native `openView` action's `uiSchema.mode.enum` (label baked per language), then wraps its `handler`: when `mode === 'sidePanel'` it retargets the popup to the layout's built-in `#nocobase-embed-container`, applies a width from the popup size, and disables router navigation before delegating to the original handler (which still builds the real popup page). The retarget mutates `ctx.inputArgs` **properties** — reassigning the whole object does not stick. **B** registers a `rowClick` flow on `TableBlockModel`; the “configured popup” content re-triggers the row's own View action in `sidePanel` mode (falling back to a read-only field list — the “quick” content — when the table has no popup action). A `MutationObserver` on the container resets the width and shows/hides the splitter as the panel opens and closes. If the embed container is missing (e.g. mobile, where core forces a full-screen embed) it degrades to a drawer. Coexists with Sub-table Pro's `rowClick` bridge and conditional formatting on the same blocks.

Build & deploy:

```bash
cd build-env
bash recipes/run-detail-panel-build.sh
bash recipes/add-markers.sh storage/tar/@ptdl/plugin-detail-panel-0.1.0.tgz
# deploy the tgz into nb-local/node_modules/@ptdl and pm2 restart index
```
