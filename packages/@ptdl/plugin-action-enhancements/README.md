# Action Button Enhancements — User Guide

> Customize **action buttons** on any page: recolour each button (background/text/border/hover), re-lay-out
> a block's **action bar**, and add two brand-new tools to tables — a **Search bar** and a **Filter bar** —
> all right in the UI, **no code, no server restart**.

**Group:** UI · Action buttons (Actions/UI) · **Runs on:** /admin (classic) + /v/ (modern) · **Version:** 0.1.0

## What's new after installing?

The plugin **adds no menu and no Settings page**. Instead, once you turn on **UI editing (UI Editor)**, new options appear:

- 🎨 **In each button's ⚙**: a new **“Button style”** item — set background/text/border colours, hover colours,
  shadow, corner radius, icon size & colour, button size, and **pin** the button left/right.
- 📐 **In each block's ⚙ (form or table)**: a new **“Action bar layout”** item — arrange buttons horizontally
  or vertically, align left/center/right, spread them evenly…
- 🔍 **On a Table**: you can add a **“Search bar”** action — a search box that filters as you type.
- 🧰 **On a Table**: you can add a **“Filter bar”** action — quick filter boxes for dropdown/relation/date columns.

## Where to configure

There is no separate config page — **everything is edited in place**, after you switch on the **UI Editor**
(the edit-mode toggle in the top-right corner):

| You want to | Where to set it |
|---|---|
| Colour & style of **one button** | Hover the button → click ⚙ → **“Button style”** |
| **Action bar layout** of a block | Hover the block (form/table) → the block's ⚙ → **“Action bar layout”** |
| Add a **Search bar** to a table | In the table's action bar → open the **add-action** menu → **“Search bar”** |
| Add a **Filter bar** to a table | In the table's action bar → open the **add-action** menu → **“Filter bar”** |

> To tune a **Search bar / Filter bar** after adding it: hover it → click ⚙ to open its config dialog.

## How to use (step by step)

### Scenario A — Recolour one button (background/text/border/hover)

1. Turn on the **UI Editor**.
2. Hover the button you want to change → click **⚙** → choose **“Button style”**.
3. The dialog has a built-in **“Sample button”** for preview (💡 hover the sample button to see the hover colour).
   Set any of these:

   | Group | Label | Value |
   |---|---|---|
   | Size | **Size** | Small · Medium · Large |
   | Pin | **Pin button** | None · Pin left · Pin right |
   | Colours | **Background · Text · Border · Shadow · Hover BG · Hover text** | colour pickers (leave empty = keep default) |
   | Border & icon | **Border style** (Solid/Dashed/Dotted) · **Border width** (1–3px) · **Corner** (Square/Rounded/Pill) · **Icon size** (Small/Medium/Large) · **Icon colour** | empty = default |

4. Click **“Save”**. ✅ The button changes colour instantly.

### Scenario B — Re-arrange / align a block's action bar

1. Turn on the **UI Editor** → hover the **block** (an Add/Edit/Details form, or a table) → the block's ⚙ → **“Action bar layout”**.
2. Choose the **Direction**: **Horizontal** or **Vertical (stacked)**.
3. If **Horizontal** → choose the **Arrangement**: Left · Center · Right · **Between** · **Around** · **Fill**.
   If **Vertical** → choose the **Alignment**: Left · Center · Right · **Full width**.
4. Click **“Save”**. ✅
> 💡 Want to “anchor” a specific button to the far left/right of the bar? Open **that button's** ⚙ → **“Button style”** → **Pin button** → **Pin left / Pin right**.

### Scenario C — Add a Search bar to a table

1. Turn on the **UI Editor** → in the **table's** action bar, open the **add-action** menu → choose **“Search bar”**.
2. The search box appears; hover it → ⚙ to fine-tune:

   | Group | Label | Meaning |
   |---|---|---|
   | Data | **Searchable fields** | Defaults to **All text fields**; you can pick specific columns (including one-level relation columns, e.g. `customer → name`) |
   | | **Match mode** | Contains · Starts with · Exact |
   | Display | **Width** (Narrow/Normal/Wide) · **Placeholder** · **Position** (Left/Right) | where the box sits on the action bar |
   | Icon | **Icon position** (Left/Right) · **Icon container** (None/Outlined/Filled) · **Icon colour** · **Container colour** | |
   | Box style | **Style** (Outlined/Filled/Borderless) · **Shape** (Square/Rounded/Pill) · **Background colour** · **Text colour** | |

3. Click **“Save”**. ✅ Typing in the box filters the table as you go (filters live, keystroke by keystroke).

### Scenario D — Add a quick Filter bar to a table

1. Turn on the **UI Editor** → in the **table's** action bar, open the **add-action** menu → choose **“Filter bar”**.
2. At first it shows a dashed placeholder reading *“Choose dropdown / date columns”*. Hover it → ⚙ to configure:

   | Label | Meaning |
   |---|---|
   | **Filter columns** | Pick the columns to filter — **only** **dropdown** columns (select/multi-select/radio), **relation**, or **date** |
   | **Column defaults & placeholders** | Set **Default values** (pre-filter when the table opens) and **Custom placeholders** for each column |
   | **Width** | Narrow · Normal · Wide |
   | **Position** | Left · Right |

3. Click **“Save”**. ✅ Each chosen column becomes a filter box: dropdown/relation columns → pick multiple values; date columns → pick a date range.
> 💡 Date boxes come with quick presets: **Today · Yesterday · Last 7 days · Last 30 days · This month · Last month · This year**. Set one as the **default** and it recomputes for the current period every time the table opens.

## Tips & notes

- ⚡ **Applies the moment you Save**, no restart needed. This is a **client-side (UI)** customization — it never touches your data.
- 🎨 When you set a button colour, the button switches to the “default” style so your colours cover the whole button (background/text/border/hover exactly as previewed).
- 🔍🧰 The **Search bar** and **Filter bar** are for **tables**. They are real actions, so you can **drag to reorder** them and set **Left/Right** just like any button.
- The **Filter bar** only accepts **dropdown / relation / date** columns — for free-text columns use the **Search bar**.
- Leaving a colour/border box empty = **keep the UI default** (no forced style).
- ✅ Runs on **both** clients: classic `/admin` and modern `/v/`.

## Remove / disable

- **Drop a button's colour:** open the button's ⚙ → **“Button style”** → **clear** the colour/border boxes you set → **Save**.
- **Drop an action-bar layout:** open the block's **“Action bar layout”**, set **Direction: Horizontal** with the default arrangement → **Save**.
- **Drop a Search bar / Filter bar:** hover it → ⚙ → delete the action (just like deleting any button).
- **Turn the plugin off entirely:** disable it in **Plugin Manager** — every customization (button colours, layouts, search/filter bars) **stops showing**. Saved config lives in the **page schema**; re-enable the plugin and it comes back.

---

### For developers

Everything is a client-side customization on the **flow-engine** (there is no server tier): patch
`ActionModel.renderButton` (colours applied through antd `<ConfigProvider>` **component tokens**, because antd
ignores CSS injected straight onto buttons) + patch the blocks' `renderComponent` to wrap **`ActionBarLayout`**.
The **Search bar** and **Filter bar** are two child `ActionModel`s (scene `collection`) that write into **one
filter-group** on the block's resource (`addFilterGroup` → `setPage(1)` → `refresh()`). Fully bilingual (English +
Vietnamese), reuses the `@ptdl/shared` colour kit.

**Build:**

```bash
cd build-env && bash recipes/run-action-enh-build.sh
bash recipes/add-markers.sh storage/tar/@ptdl/plugin-action-enhancements-*.tgz
```

Full design: `docs/ACTION-ENHANCEMENTS-DESIGN.md`. Vietnamese guide: `README.vi-VN.md`.
