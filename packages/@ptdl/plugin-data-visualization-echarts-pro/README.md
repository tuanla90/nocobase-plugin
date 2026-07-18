# Data Visualization: ECharts Pro — User Guide

> Adds **one flexible ECharts chart type** to NocoBase's *Data Visualization* block:
> plot line / area / column / bar / pie / scatter, toggle smooth · stack · donut · legend · labels,
> customize fonts & number formatting, transform data with JavaScript, and a **raw ECharts option override**
> for full control — all configured **right on the chart**, no server-side code.

**Group:** Blocks · **Runs on:** /admin (classic) + /v/ (modern) · **Version:** 0.1.0

## What's new after installing?

- In the **Charts** block (*Data Visualization* / *Charts*), the chart-type picker gains **a new “ECharts Pro” group**, and inside it the **“ECharts Pro”** chart — an all-in-one chart type the plugin adds.
- **No new menu, Settings page, button or field** is added to your app. Everything is set **right in the chart's config panel**.
- ⚠️ **The base Data Visualization plugin** (`@nocobase/plugin-data-visualization`) must be **enabled** — ECharts Pro plugs into that block. If you don't see the “ECharts Pro” group, check that the base plugin is on.
- Runs on the client only (never touches the server) → **no server restart needed**.

## Where to configure

There is no separate config page. You edit it **directly on the chart** inside the Data Visualization block.

| Client | Path to the config page |
|---|---|
| **Modern (`/v/`)** and **Classic (`/admin`)** | A page with a **Charts** block → add/edit a chart → in the **chart-type** picker, open the **“ECharts Pro”** group → choose **“ECharts Pro”** → fill in the fields below, then **Save**. |

> 💡 There are **two “chart type” pickers** — don't mix them up: (1) NocoBase's own chart-type picker in the block, where you pick **“ECharts Pro”** to use this plugin; (2) the **“Chart type”** field *inside* ECharts Pro, where you pick Line / Column / Pie…

## How to use (step by step)

### Common setup — add an ECharts Pro chart
1. Open the page where the chart should go and turn on the **UI Editor**.
2. Add a **Charts** block (*Data Visualization* / *Charts*) — or open an existing chart to edit.
3. In the **chart-type** picker, choose the **ECharts Pro** group → **ECharts Pro**.
4. In the data section, choose a **Collection**, then add **Measures** (the value axis) and **Dimensions** (the category axis / series grouping).
   > ECharts Pro **auto-infers** the X / Y / series roles from your data, so it usually renders right from this step.
5. Go down to the **“Chart type”** field and the other ECharts Pro options (see the scenarios below), adjust them, then **Save**.

### Scenario A — Basic line / bar chart
1. **“Chart type”**: pick **“Line”**, **“Area”**, **“Column (vertical bar)”** or **“Bar (horizontal)”**.
2. Toggle as needed: **“Smooth line”** (only affects *Line / Area*), **“Stack series”** (when you have several series), **“Show legend”**, **“Show data labels”**.
3. Adjust **“Height (px)”** if needed (default 400). ✅ **Save**.

### Scenario B — Pie / donut chart
1. **“Chart type”** = **“Pie”**. Each data row is a slice: the **name** comes from the dimension, the **value** from the first measure.
2. Turn on **“Donut (pie)”** to make it a ring chart.
3. Turn on **“Show data labels”** to print the number on each slice. ✅ **Save**.

### Scenario C — Fonts & number formatting
1. **“Font family”**: type a font name (e.g. `Inter, Arial, sans-serif`) — applied to the whole chart.
2. Turn on **“Custom number format”** to reveal more fields:
   - **“Decimals”**, **“Thousands separator”**, **“Decimal separator”**
   - **“Prefix”** (e.g. `$`), **“Suffix”** (e.g. ` USD` or ` %`)
   - **“Multiplier”**, **“Compact (1.2K / 3.4M)”**
3. This number format applies to the **value axis**, the **tooltip** and the **data labels**. ✅ **Save**.

### Scenario D — Transform data with JS (advanced)
1. Open the **“Transform (JavaScript)”** box.
2. Write a JS function body: it receives `data` (an array of rows) and `echarts`, and **must `return` an array of rows** after processing (filter / group / sort / add computed columns…). This runs **before rendering**.
   - Example: `return data.filter(r => r.value > 0);`
3. ⚠️ If the code errors or doesn't return an array, the plugin **falls back to the original data** (a warning is logged to the browser Console). ✅ **Save**.

### Scenario E — Override the ECharts option (full control)
1. Open the **“JSON style (ECharts option override)”** box.
2. Write a **JS object** (functions are allowed, e.g. a custom formatter). It is **deep-merged over** the option the plugin already built, using ECharts' native merge.
   - Example: `{ tooltip: { valueFormatter: v => v + " %" } }`
3. Need a property name? Click the **“ECharts option reference”** link at the bottom of the config. ✅ **Save**.

## Tips & notes

- Which option works with which chart type:

  | Chart type | Smooth line | Stack series | Donut (pie) | Label / Legend |
  |---|:---:|:---:|:---:|:---:|
  | **Line / Area** | ✓ | ✓ *(multiple series)* | — | ✓ |
  | **Column / Bar** | — | ✓ *(multiple series)* | — | ✓ |
  | **Pie** | — | — | ✓ | ✓ |
  | **Scatter** | — | — | — | ✓ |

- **“Stack series”** only shows clearly when you have **several series** — i.e. multiple **Measures** or one **Dimension** acting as the series.
- **Scatter** needs **two numeric fields** (both X and Y are numbers).
- The number-format fields **appear only** when **“Custom number format”** is on.
- **JSON style** is merged **last**, so it can override any part the plugin built — more powerful than plain JSON because it allows functions.
- Client-side only: **no server restart needed**, works on both **/admin** (classic) and **/v/** (modern).
- Changing an option affects only the **current chart**; the config is saved inside the block.

## Remove / disable

- **Switch to another chart type:** in the chart-type picker, pick one of Data Visualization's built-in types again.
- **Remove entirely:** disable the plugin in **Plugin Manager**. The “ECharts Pro” group disappears; any chart still using this type **won't render** until you switch it to another type or re-enable the plugin. Config already saved in the block stays intact.

---

### For developers

The chart type is **client-only**, plugging into the base `Chart` class from `@nocobase/plugin-data-visualization` in **both lanes** (`client` for /admin, `client-v2` for /v/) via `charts.addGroup('echartsPro', …)`; the server is a no-op (the data query is handled by the base plugin). X/Y/series roles are inferred from `fieldProps` (`buildOption.ts`). **Transform (JavaScript)** runs via `new Function('data','echarts', …)`; **JSON style** is parsed via `new Function` and applied through a second `setOption` so ECharts deep-merges it; the number formatter is the shared `@ptdl/shared/format`. Technical detail lives in the source at `src/common/*`.
