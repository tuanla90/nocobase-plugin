# App Builder — User Guide

> Describe your app in **plain English** (or paste an **App-Spec** JSON) → the plugin builds a whole
> NocoBase app for you: **collections, relations, seed data, auto-computed columns, status flows,
> pages and menu** — right in the **/v/** interface. Need to change an existing app? AI **adds/modifies
> it step by step** too.

**Group:** Low-code builder · **Runs on:** /v/ (modern) only · **Version:** 0.6.24

## What's new after installing?

- **A floating button** at the **bottom-right** of the screen: **“🛠 Build app”** (on the **/v/** interface only). Click it to open the **“Build app from an App-Spec”** dialog — the one and only place you work.
- **No Settings page** is added, and **nothing is touched** in your existing menus/pages/data blocks.
- The dialog offers **3 ways to build**: let **AI write from a description**, let **AI build/modify step by step**, or **paste / load an App-Spec (JSON)** and click create.
- When it finishes, it shows **“Created pages”** with **clickable links to use them right away**, plus a **“🗑 Delete the app I just built”** button for a quick undo.
- **📊 Dashboard + ✨ Edit charts with AI:** the floating dock also **generates dashboards** (KPI cards + charts + a filter bar) and lets you **edit each chart right on the page with AI** — see **[Dashboards & charts (AI)](#dashboards--charts-ai)** below.
- ⚠️ On the **classic (`/admin`)** interface the plugin **shows nothing** — by design, because the pages it generates are **/v/** pages.

## Where to configure

This plugin has **no dedicated Settings page.** Everything happens in the floating button:

| Client | Where to go |
|---|---|
| **Modern (`/v/`)** | Click the **“🛠 Build app”** floating button at the **bottom-right** → opens the **“Build app from an App-Spec”** dialog |
| **Classic (`/admin`)** | No interface (intentionally left blank) |

> 💡 Script/AI authors also get a `window.__ptdlAppBuilder` gateway to call each step — see **For developers**.

## How to use (step by step)

In the **“Build app from an App-Spec”** dialog, the buttons work like this:

| Button / field | What it does |
|---|---|
| Description box *(top)* | Type a description of your app in plain English |
| **✨ Generate with AI** | AI writes an **App-Spec (JSON)** into the box below for **a new app** — review it, then click **Create app** |
| **🔧 Build/modify step-by-step** | AI **plans** the steps; it can **modify an existing app too** (add a field/page, rename…) — preview, then click **▶ Run plan** |
| JSON box *(App-Spec)* | Paste an App-Spec directly, or let the two AI buttons above fill it in |
| **Load demo** | Loads the **sales** demo App-Spec into the JSON box |
| **Validate** | Checks whether the App-Spec is **valid** (writes nothing yet) |
| **Create app** | **Builds for real:** collections + relations + seed data + computed columns + status flows + pages + menu |
| **🗑 Delete the app I just built** | Undo: deletes exactly what was just created (only appears **after** creating) |

When you click **Create app**, the plugin compiles the App-Spec into 2 tiers:

| Tier | What it generates |
|---|---|
| **Data** *(server)* | **Collections** with fields of every kind (text, number, %, select, date/time, boolean, color, icon, JSON…), **relations** (one-to-many / many-to-one / one-to-one / many-to-many, reverse link created automatically), **auto-computed columns** (e.g. Line total = Qty × Price), **status flows** (Draft → Confirmed → …), and **seed data** |
| **UI** *(/v/)* | A **menu group** + one **page** per collection (plain or enhanced table) with **View / Edit / Add** popups |

### Scenario A — Describe and build (fastest; creates a new app)

1. Click the **“🛠 Build app”** floating button at the bottom-right.
2. In the description box at the top, type the app you want — e.g. *“a sales app: customers, products, orders with line items + order status”*.
3. Click **“✨ Generate with AI”**. NocoBase's AI writes an **App-Spec (JSON)** into the box below.
4. **Review** the JSON (rename fields / add columns as you like). To be safe, click **“Validate”**.
5. Click **“Create app”**. ✅ When done, **“Created pages”** appears — click a link to start using it.

> 💡 The **✨ / 🔧** buttons only run when **AI (`@nocobase/plugin-ai`)** is enabled and a model is configured. Without it you'll get an *“AI not enabled / configured…”* error.

### Scenario B — Build/modify step by step (can also edit an existing app)

1. Open **“🛠 Build app”**.
2. Type your request — e.g. *“add a status field to the orders collection”* or *“add a customer list page”*.
3. Click **“🔧 Build/modify step-by-step”**. AI **looks at the current state** of your app, then draws up a **Plan** of steps.
4. **Preview** the list of steps in the **“Plan (N):”** box. Happy with it? Click **“▶ Run plan”**.
5. The plugin runs the steps **one by one**; each shows **✓** (green, done) or **✕** (red, with the error). At the end it reports *“N/N steps ok”*.

> 💡 This is how you **edit an existing app** (add/remove fields, add pages, rename display labels). It **won't rebuild** collections that already exist.

### Scenario C — Paste / load a ready-made App-Spec (no AI needed)

1. Open **“🛠 Build app”**.
2. Click **“Load demo”** to load the **sales** demo App-Spec (4 collections: **Customers · Products · Orders · Line items**) — or **paste** your own App-Spec JSON into the box.
3. Click **“Validate”** to make sure the spec is valid.
4. Click **“Create app”**. ✅ When done, you get page links to open and view.

> 💡 The demo's collections are prefixed `ab_` so they **never overwrite** your real ones. It demonstrates everything: the **order ↔ line-item** relation, a **computed** *line total* column, the order **status flow**, and a **progress-bar** widget.

> 🗑 **Made a mistake?** Right after creating, click **“🗑 Delete the app I just built”** to remove exactly what was just built (collections + pages). The button only undoes the **most recent build in this session**.

## Dashboards & charts (AI)

Beyond building apps, the plugin also **generates dashboards** and lets you **edit any chart with AI in place**. These live in the **floating dock** at the bottom-right (only shown while the **/v/ UI-editor is ON**):

| Task | How |
|---|---|
| **📊 Generate a dashboard** | Click **📊 Dashboard** → pick **one collection** (and optionally a **menu group**) → describe a focus if you like → AI designs **KPI cards + charts (line / column / pie) + a filter bar** and builds them into **one complete dashboard page** |
| **✨ Edit a chart with AI (in place)** | On a dashboard page, with the **UI-editor ON**, **hover over any chart or KPI card** → an **✨ AI** button appears at the **top centre** → type your request → the AI **rewrites** the chart and it **updates in place** (no page reload) |
| **↶ Undo** | In the same edit box, click **↶ Undo** to revert that chart to its **previous version** |
| **➕ Add a widget** | Open a dashboard, then describe *“add a revenue-by-quarter column chart”* / *“add a filter by customer”* → the AI builds and **inserts** the widget |

Example chart-edit prompts: *“turn it into a column chart”*, *“make it blue”*, *“add % labels”*, *“group by month”*, *“sort descending”*.

> 💡 **Select / status-flow** columns show **labels, not stored codes** (e.g. `dang_giao` → *In transit*), and charts use a clean **modern default theme** (tidy palette, compact K/M numbers, data labels).

> 🤖 These AI features need **`@nocobase/plugin-ai`** enabled + a model configured, same as the two build buttons. The ✨ button on a chart **only appears while the UI-editor is ON** (the /v/ design mode) — regular viewers won't see it.

## Tips & notes

- ⚠️ **Creating an app writes for real to the database** (it creates collections, relations, pages). **Validate** / review the JSON **before** you click **Create app**.
- ✅ **Safe to re-run:** if a collection already exists, the plugin **skips it** (never overwrites). If a build hits an error partway through, the plugin **rolls back** the collections it just created in that run.
- 🤖 The two buttons **✨ Generate with AI** and **🔧 Build/modify step-by-step** need **`@nocobase/plugin-ai`** enabled + a model configured. **Load demo / paste JSON** needs **no AI**.
- 🧩 For the full experience, also install: **`@tuanla90/plugin-formula`** (auto-computed columns) and @tuanla90's **status-flow** (status flows); the **/v/** pages reuse **instant-create-page**'s page builder. If any of these is missing, that part is skipped — the collections are still created (e.g. a computed column exists but **won't auto-calculate**).
- 🖥️ Runs on **/v/ (modern)** only; on **/admin classic** the button **doesn't appear** (by design).
- 🔁 The **“🗑 Delete the app I just built”** button only remembers the **most recent build** in the browser session; **reloading the page** wipes that memory (then you must delete the collections/pages by hand).
- 🔐 **Any logged-in user** can call the build actions — so only enable the plugin for trusted environments / roles (usually **administrators**).

## Remove / disable

- **Undo the app you just built:** click **“🗑 Delete the app I just built”** right in the dialog (while it still remembers the most recent build).
- **Disable the plugin:** turn it off in **Plugin Manager** → the **“🛠 Build app”** button disappears and you can no longer build.
- ⚠️ **Note:** the collections / relations / data / pages **you already created stay** after disabling the plugin (they are **real** NocoBase collections & routes). To remove them for good: use the **delete button before disabling**, or delete them by hand afterwards — **collections** in **Collection Manager**, **pages** in the menu/route management area.

---

### For developers

- **Architecture:** App-Spec (a high-level IR) → compiler. The **data tier** runs on the **server** (action `appBuilder:apply` plus individual tools `createCollection` / `addField` / `addRelation` / `addComputed` / `addStatusFlow` / `seed` / `describeApp` / `dropField` / `dropCollection` / `renameField`, ACL `loggedIn`). The **page tier** runs on the **/v/ client** (flowEngine + routeRepository, reusing instant-create-page's `createQuickPage`). AI uses NocoBase's own LLM (`aiGenerate` = generate a spec, `aiPlan` = plan tool calls).
- **Script/AI gateway:** `window.__ptdlAppBuilder` — exposes `buildApp(spec)`, `validateAppSpec(spec)`, `runPlan(steps)`, `callTool(name, args)`, `toolNames`, `samples.banHang`, and each individual tool. Handy for automated testing.
- **Guardrails:** `dropCollection` refuses core NocoBase/@tuanla90 collections; `dropField` refuses system fields; `renameField` only changes the **display label** (never the machine name, so relations/pages/FKs don't break).
- **Design details:** `docs/APP-BUILDER-DESIGN.md`.
