# Block: Custom HTML — User Guide

> A block that pulls **data like the Chart block** — pick a table, build a query with the **Builder** or **SQL**,
> preview, filter, refresh — then **you draw the UI yourself with JavaScript that returns HTML**: scorecards,
> KPIs, top lists, cards. Ships **click-to-run templates** and a **helper toolkit** (number formatting, escaping, icons).

**Group:** Blocks · **Runs on:** /admin (classic) + /v/ (modern) · **Version:** 0.12.9

## What's new after installing?

- **A new block type** called **“Custom HTML”** in the **Add block** picker — grouped with the **Chart** block because it's built on top of it.
- When you add it, the block **asks for a data source (table) just like adding a chart**, then you configure the query the familiar Chart way: **Builder / SQL**, **preview**, **filter**, **refresh (Run query)**.
- **No new menu, no new Settings page.** Everything is edited **right on the block**.
- The block's ⚙ gains a **“Custom HTML”** config item: it opens a **code editor** with **6 ready-made templates**, a **live preview**, a **column picker**, a **“Let AI write it”** button, and a **helper functions list**.
- **Readable block titles** — the ⚙ now also has a **“Block title”** item. Chart and Custom-HTML blocks are headerless, so NocoBase's **Filter form → “Connect fields”** dialog used to list them as unhelpful IDs like *“Custom HTML #b287”*. Now each block reports a **meaningful title**: whatever you type in **Block title**, or — if left empty — an **auto-derived** name from its own config (the chart's title, or its measure/dimension). So the connect-fields picker shows *“Doanh thu #b287”* instead. (Also improves any place the block's title is shown.)
- ⚠️ This block requires the **Data Visualization** plugin (the Chart block) to be enabled. If it isn't, the block **won't appear** in the picker.

## Where to configure

There's no separate config page — you edit **right on the block**, in **two places**:

| Where | How to open | Used for |
|---|---|---|
| **Data query** | The block's own config (same as the Chart block) | Pick a table, build the question with the **Builder** or **SQL**, preview, **Run query** to fetch real data |
| **Custom HTML** | The block's ⚙ (gear) → **“Custom HTML”** | Write a snippet of **JavaScript** that `return`s an **HTML string** to draw the UI |

> 💡 Keep it simple: **the top part fetches the numbers, the bottom part decides how they look.**

## How to use (step by step)

### Scenario A — A “Total sales” KPI scorecard

1. Go to the page where you want the block → turn on **UI Editor** → click **Add block** → choose **“Custom HTML”**.
2. Pick the **table / data source** (e.g. *Orders*), then in the query section add the calculation you need (e.g. **sum** of the `value`/`amount` column). Click **Run query** to run it for real.
3. Open the block's ⚙ → **“Custom HTML”**. The code editor appears, defaulting to the **Scorecard** template.
4. In the **“Templates:”** bar at the top you can quickly switch to another template. In the code, **change the column name** to match your data (defaults to `'value'`).
5. Watch the **“Preview”** on the right — it updates **as you type**. Happy with it? Click **Save**. ✅ The block shows the scorecard you just built.

> 💡 Don't remember the real column names? Click the **Debug** template (or type `return helpers.table(data);`) to see every column and its data, then go back and adjust.

### Scenario B — Top list / leaderboard (Top list, Progress)

1. Build a query that returns a **list with a name column + a number column** (e.g. *product name* + *revenue*), then **Run query**.
2. Open **“Custom HTML”** → click the **“Top list”** template (medals for the top 1–2–3) or **“Progress”** (progress bars relative to the largest value).
3. In the code, change the first two lines `const nameCol = 'name', valCol = 'value';` to match your columns → preview → **Save**.

### Scenario C — Let AI write the code for you

1. Open **“Custom HTML”** → click the **“Let AI write it”** button (top-right of the toolbar).
2. Type a description in plain language, e.g. *“a KPI card for total revenue + order count”* → the AI generates JS based on the **exact columns** in your query.
3. Check the preview, tweak if needed → **Save**.

> 💡 **Insert column names quickly:** put your cursor in the code box, then use the **column picker** (top-right of the toolbar) — the column name is inserted for you as a `'column_name'` string.

## Tips & notes

- **The JS snippet receives these ready-made** and **must `return` an HTML string**:

  | Variable | What it is |
  |---|---|
  | `data` (or `rows`) | Array of query result rows |
  | `count` | Number of rows |
  | `helpers` | Helper toolkit (see the table below) |

- **The `helpers` toolkit** (click **“Helpers list”** in the editor to see them all):

  | Function | What it does |
  |---|---|
  | `helpers.fmt(number)` | Thousands number format (vi-VN). `fmt(n, { locale, … })` |
  | `helpers.esc(string)` | **Escape** HTML — always use it when printing user data so it can't break the layout |
  | `helpers.icon('shopping-cart', { size:22, color:'#2490ef' })` | Insert any **Lucide icon** (kebab-case name) |
  | `helpers.sum / avg / min / max / count(data, 'col')` | Sum / average / min / max / count |
  | `helpers.first(data, 'col')` | Value of one column in the first row |
  | `helpers.keys(data)` | Array of column names |
  | `helpers.groupBy(data, 'col')` | Group by column → `{ key: rows[] }` |
  | `helpers.date(v, 'DD/MM/YYYY HH:mm')` | Format date/time (tokens `YYYY MM DD HH mm ss`) |
  | `helpers.timeAgo(v)` | Relative time — *“2 hours ago”* |
  | `helpers.table(data)` | Print all data as a table (handy for discovering column names) |
  | `helpers.json(data)` | Print the raw structure for debugging |

- **6 ready-made templates** in the **“Templates:”** bar — click one to replace the whole code: **Scorecard**, **Top list**, **Progress**, **KPI cards**, **Table**, **Debug**.
- **A minimal starter** to begin with (change `'value'` to your column name):

  ```js
  // data = array of query result rows.
  const total = helpers.sum(data, 'value');
  return `
    <div style="padding:22px 24px;border:1px solid #eef0f2;border-radius:16px;background:#fff;max-width:340px;font-family:system-ui">
      <div style="color:#737b83;font-size:13px;font-weight:600">SALES</div>
      <div style="font-size:36px;font-weight:800;margin-top:6px">
        ${helpers.fmt(total)} <span style="font-size:15px;color:#737b83">VND</span>
      </div>
    </div>`;
  ```

  > CSS is written **inline in the HTML** (like the templates). No separate CSS box needed.

- **The preview uses sample data** until you **Run query**. With no real data yet, the preview reads *“(sample data — run Run query to fetch real data)”*; once you have data it reads *“(N real rows)”*.
- **Column names must match the query result** — after a sum/group, a column can be renamed (aliased). Use the **Debug** template / `helpers.table(data)` to get the **exact real column names**.
- **Icons:** any **Lucide name** works (kebab-case, e.g. `'shopping-cart'`, `'trending-up'`, `'calendar-days'` — find names at lucide.dev) once the **Icon library (Lucide + system icon replacement)** plugin (`custom-icons`) is enabled. If it isn't, icons fall back to a **small built-in set** and unknown names show a circle.
- **The “Let AI write it” button** needs the system to have **an AI/LLM model configured** (NocoBase's AI plugin). Without one, the button reports a connection error.
- Runs on **both** clients: classic `/admin` and modern `/v/`. **No server restart** — just save and reload the page.

## Remove / disable

- **Remove one specific block:** in UI Editor, open the block's ⚙ → **delete the block**. The code is stored in the page config, so deleting the block deletes it too.
- **Disable the plugin entirely:** in **Plugin Manager**, turn off **“Block: Custom HTML”**. Any Custom HTML blocks you placed **stop showing** (the block type disappears from the system); re-enable the plugin and they work again because the code is still in the page config.
- ⚠️ If a block suddenly **goes blank / vanishes from the picker**: check whether the **Data Visualization** plugin is still enabled — this block relies on the Chart block to fetch data.

---

### For developers

The block is a **subclass of `ChartBlockModel`** (data-visualization), so it reuses the entire query tier (Builder/SQL/filter/refresh); the drawing part overrides `renderComponent()` to run the user's code via `new Function('data','rows','helpers','scope', code)` and return HTML (wrapped full-bleed to hide the card frame). Reducers/format/escape/`relativeTime` come from `@tuanla90/shared`; icons come from the **shared icon registry** (loaded by `custom-icons` — provider/consumer, no bundled lucide). The “Let AI write it” button calls the server action **`customHtmlAi:generate`** → `generateCode` from `@tuanla90/shared/ai-server` (the client validates + retries syntax itself). Registered once in `src/client/registerBlock.tsx`, used by both the classic (`src/client`) and modern (`src/client-v2`) lanes. Technical details: see the source in the package.
