# Menu Enhancements (Sections + Badge) — User Guide

> Upgrade the **left sidebar menu**: turn a menu item into a **section header / divider line**,
> and attach a live **count badge** (row count, or sum/avg/max/min of a field) to a menu item.
> Everything is configured right on the menu item — **no code, no extra page**.

**Group:** Menu · **Runs on:** /admin (classic) + /v/ (modern) · **Version:** 0.4.18

## What's new after installing?

- **No new menu, page or Settings entry is added.** Everything lives in the **⚙ (gear) of each menu item** in the sidebar.
- Every menu item now gains **2 options** when you open its ⚙:
  - **“Display as”** (the **Appearance** group) → turn the menu item into a **section header / divider line**.
  - **“Count badge”** (the **Badge** group) → attach a live **count badge** to the menu item.
- **Page tabs** also gain a **“Count badge”** in the tab's ⚙ — the same setup dialog as the menu badge.
- No data-structure changes: config is saved into the menu route's `options`, so it **survives reloads** and re-enabling the plugin.

## Where to configure

There's no separate config page. You configure it **right on the menu item**:

1. Turn on the **UI Editor** (interface-editing mode).
2. **Hover over a menu item** in the sidebar → click the **⚙** icon.
3. Choose **“Display as”** (make it a header/divider) or **“Count badge”** (attach a badge).

> 💡 For a **page tab**: turn on the UI Editor → ⚙ on the tab → **“Count badge”**.

## How to use (step by step)

### Scenario A — Turn a menu item into a section header / divider line

1. On the menu item's ⚙ → **“Display as”**.
2. Turn on the **“Convert to section”** switch. The setup box appears with a live **Preview** pinned at the top.
3. Pick the style you want:

| You want | How to set it |
|---|---|
| A plain **divider line** | Turn **“Show line”** on, leave **“Label (optional)”** empty |
| A **section header** (text, no line) | Turn **“Show line”** off; type a **Label** (e.g. `COMMUNICATION`) — leave it empty to use the menu item's own name |
| **Line + text** | Turn **“Show line”** on + type a **Label**; choose the **“Text position”** (Above / On line / Below) |

4. Fine-tune further: **Align** (Left/Center/Right), **Line thickness (px)**, **Color** (applies to both the line and the text), **Font size (px)**.
5. **Save**.
6. ✅ The menu item is now a divider/header — **no longer clickable** (it doesn't navigate), but you can still edit it via the ⚙.

> ↩️ To turn it back into a normal menu item: ⚙ → “Display as” → **turn off** “Convert to section” → Save.

### Scenario B — Attach a count badge to a menu item (e.g. “12” pending orders)

1. On the menu item's ⚙ → **“Count badge”**.
2. Turn on **“Show count badge”**.
3. The **Data & measure** section:
   - **Collection**: pick the table to count.
   - **Measure**: choose how it's computed —

     | Measure | Result |
     |---|---|
     | **Count rows** | the collection's row count *(default)* |
     | **Sum / Average / Maximum / Minimum** | aggregate a **number field** — you must also pick a **“Field to aggregate”** |

   - **Filter (optional)**: build conditions so only matching rows are counted (e.g. `status = pending`). There's a visual builder (**Add condition**, matching **ALL (AND)** / **ANY (OR)**) or **Advanced (raw JSON)**.
   - Click **“Test count”** to see the result right away (`= N matching row(s)`) before saving.
4. The **Appearance** section:
   - **Colour**: set the badge's **Fill** and **Border** (leave Border empty = no border).
   - **Number display**: Full number · `99+` · `999+` · `9999+` · **Compact (1.2K)** · **Dot only (no number)**.
   - **Show when zero**: by default the badge is **hidden at 0**; turn this on to always show it.
   - **Alert threshold** + **Alert color**: when the count reaches the threshold, the badge auto-switches to the alert color (set `0` to disable).
5. The **Refresh** section → **Refresh interval (seconds)** (minimum 10, default 45).
6. **Save**.
7. ✅ The badge appears at the right edge of the menu item (when the sidebar is collapsed it shows as a small number in the icon corner).

## Tips & notes

- 🔄 **The badge refreshes itself** three ways: on the interval you set, when you **return to the tab**, and **the moment a row is added/edited/deleted** — including edits by other people (via the server's WebSocket).
- 🧮 **Sum/Average/…** run through the aggregate API; use **“Test count”** to be sure you get a number before saving.
- 🎯 **It counts real data**: the badge only reads to count, it **never changes data**; the filter only narrows the counting scope.
- ⚠️ An item converted to a **header/divider** will **no longer navigate**; if you did it by mistake, open its ⚙ and turn off “Convert to section” to restore it.
- A menu item is **either** a divider **or** carries a badge — once it's been converted to a header/divider, the badge won't show on that item.
- Runs on **both** clients: classic `/admin` and modern `/v/`. No server restart needed (this is a client-side feature).

## Remove / disable

- Disable the plugin in **Plugin Manager**.
- Your config is **not lost**: it lives in the menu route's `options`. When the plugin is off, section items revert to **normal menu items** (pointing back to their original page) and badges **disappear**.
- **Re-enable** the plugin → every header/divider and badge comes back exactly as before.

---

### For developers

- Client-only, **no schema change**: config is stored on `route.options` — `ptdlMenuKind` + `ptdlMenuStyle` (sections) and `ptdlBadge` (badge).
- Installed by monkeypatching `AdminLayoutMenuItemModel` (`render` / `toProLayoutRoute`) and `BasePageTabModel` (the tab badge), resolved by name via `flowEngine.getModelClass(...)`; it registers two flow settings, `ptdlMenuSections` + `ptdlMenuBadge`.
- Aggregates use the data-viz `<collection>:query` action (measures); refresh runs through an axios response-interceptor + `onLiveRefresh` (WebSocket).
- Details: see `src/shared/menuSections.tsx` and `src/shared/menuBadge.tsx`.
