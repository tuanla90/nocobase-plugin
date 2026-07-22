# Line Generator — User Guide

> From **one parent record** → generate **N child rows** in **one transaction**, following a **rule set** you declare once.
> The same mechanism covers **BOM explosion**, **commission splits**, and **cost / piece-rate allocation** — with cross-relation matching, dynamic recipients, group-and-sum, and rounding; run it **manually with a button** or **automatically on save**, with a **dry-run preview** + **debugger**.

**Group:** Data model tools · **Runs on:** /admin (classic) + /v/ (modern) · **Version:** 0.8.0

> **New in 0.8** — the single JOIN is generalised into an **ordered multi-step JOIN pipeline**. The config editor becomes a **pipeline builder**: LEFT source, then an add/remove/reorder list of **step cards** (each joins its own RIGHT side), then the final group/SUM + write target.
> - **N-step pipeline** — each step joins a **different config table** (or follows a relation) and fans rows out; the **output of step N is the input of step N+1** (a step's formulas read the incoming row via `src.*`), so quantities **multiply naturally down the chain**. The real target case: order → order_items → **⋈ combo_config (recursive)** → **⋈ bom** → group by material + SUM.
> - **Two step kinds** — a step's RIGHT side is either a **config table** (scan a master/norm table, matched by ON conditions) *or* an **existing relation** (follow a hasMany/o2m by its indexed FK — no table scan). The relation kind also unifies the old `sourceLinesPath` hop.
> - **Per-step recursion + priority tiers** — the v0.7 self-join recursion and specific-over-general tiers now apply **per step**.
> - **Fan-out safety (`maxRows`, default 10000)** — chained fan-outs can explode, so if the working set exceeds the cap at any step the whole run **aborts with a clear error** (never a silent truncate or a hang).
>
> A config **without** join steps keeps the v0.7 single-join layout and behaves **byte-identically** (full back-compat).

> **New in 0.7** — the config editor is reshaped as a **JOIN builder** (LEFT source ⋈ RIGHT rules ON conditions → result), plus two optional matching upgrades:
> - **Priority-tier matching** (*specific overrides general*): try the specific rule (e.g. the row for this exact employee) first; if none, fall back to the general one (e.g. the row for the role) — with automatic de-duplication so nobody is counted twice.
> - **Recursive explosion** (*multi-level BOM in one run*): a product → sub-assembly → raw-material tree of any depth explodes in a single pass, quantities multiply down the tree, and a cyclic-BOM guard stops runaway loops. Configs without these fields behave exactly as before.

## What's new after installing?

- **A new Settings page: “Line generators”** (list-with-＋ icon). Inside is the **“Generators”** tab — where you create/edit each **generator** (one generator = one “1 parent → N children” rule).
- **A new action to add to a block: “Generate lines by rule”** (the button reads **“Generate lines”**). You add this button yourself to the table/form that holds the parent record.
- ⚠️ **Nothing runs by default.** After installing you'll **see no button** — you must first go to Settings and **create a generator**, then attach the button (or turn on auto-run).
- **No new field or display type** is added to your data.
- 🧠 The button **shows/hides intelligently**: it appears only when the collection has a valid generator **and** the record meets the condition (e.g. the order is already in “Settled” status).

## Where to configure

| Client | Path to the config page |
|---|---|
| **Modern (`/v/`)** | ⚙ **Settings** → **“Line generators”** → **“Generators”** tab |
| **Classic (`/admin`)** | **Settings** → **“Line generators”** → **“Generators”** (path `/admin/settings/line-generator`) |

Both clients open the **same generator list** and share one set of data.

## How to use (step by step)

> ✅ **The general idea:** one **generator** = answer 5 questions → (1) which **parent collection** it runs on, and when; (2) which **rows** to multiply by; (3) which **rule table** to read; (4) what each child row **writes** (formulas); (5) which **child collection** to write into. When done, click **“Run preview”** in the right-hand panel to preview, then **“Save”**.

### Scenario A — Split commission per staff member (run with a button)

1. Go to **Settings → “Line generators”**, click **“＋ New generator”**.
2. Top-right, open **“Load template…”** and choose the **commission** starter (rules from a data table) for a ready-made skeleton (you only adjust the table/field names to match your own data).
3. Walk through the 5 sections in turn (click each one open):
   - **1. Activation** → set the **Name**, pick the **Trigger table (parent)** (e.g. *Orders*). Under **Activation**, keep **“Button”**. Under **Condition**, declare when it may run (e.g. `status = Settled` **AND** `is_commission_created = false`).
   - **2. Input** → leave **“Source-rows table (src)”** empty = each order is counted once (each matching rule → one commission row).
   - **3. Rule table** → pick the **Rule collection** (e.g. *commission_rules*); under **“Only rule rows where”** declare the match conditions (e.g. the rule group matches the order's shipping type, and the rule is still in effect).
   - **4. Row formulas & write target** → pick **“Write to”** (the child collection that receives the rows, e.g. *order_commissions*); for each row set **target field ← formula** (e.g. `commission_amt ← NUM(parent[rule.base_field]) * rule.rate`). Any column ticked **“Required”** that comes out empty **drops that row**.
   - **5. Advanced** *(optional)* → round money, check the % total…
4. On the right, pick a record under **“Preview with:”** → click **“Run preview”** to preview the rows that would be generated → if happy, click **“Save”**.
5. **Attach the button to the page:** open the *Orders* table/form → turn on the **UI Editor** → add an action (**Configure actions**) → choose **“Generate lines by rule”**. The button reads **“Generate lines”**.
6. A user opens an eligible order → clicks **“Generate lines”** → the **preview** window shows *“N rows to create”* → click **“Confirm — create N rows”**. ✅ It reports **“Created N rows”**, and the child table refreshes itself.

> 💡 Have **several generators** for the same collection? The **“Generate lines”** button becomes a **dropdown menu** so you pick the right one. To pin one generator to a button: click ⚙ on the button → **“Generator settings”** → fill in **“Generator key”** (blank = auto-detect by collection).

### Scenario B — Explode material norms per order line (group + sum)

1. **“＋ New generator”** → **“Load template…”** → choose the **BOM explosion** starter.
2. In **2. Input**, pick **“Source-rows table (src)”** = the parent's child-line relation (e.g. *order_lines*). Now the generator **multiplies per LINE** of the order (each product line × its norms); formulas read the line via `src.*`.
3. In **3. Rule table**, match by line (e.g. the rule's `product_id` **=** `src.product_id`).
4. In **5. Advanced**, use **“Group by field”** (e.g. `material_id`) and **“Fields to sum when grouping”** (e.g. `qty`) to merge rows sharing the same material and **sum** the quantities.
5. **“Run preview”** → **“Save”** → attach the button as in Scenario A.

### Scenario C — Auto-run the moment it's saved (no button)

1. Open the generator → **1. Activation** → under **“Activation”** choose **“Auto when condition is met”**.
2. Fill in the **“Trigger condition”**: every **save** of a record that satisfies these conditions **generates the rows automatically** (no button needed).
3. ⚠️ **Important — prevent duplicate runs:** under **“After a successful run, update the parent (post)”**, set a **done flag** (e.g. `is_commission_created ← true`) and put that flag in the condition (e.g. `is_commission_created = false`). This way each record runs **once**. **To re-run**, **clear that flag**.
4. **“Save”**. From now on the server handles it, AI-Column style.

### Preview & debug (do this before saving)

- **Dry-run preview:** the right-hand panel of the editor — pick a record under **“Preview with:”**, click **“Run preview”**. It shows the **“N rows”**, **“N skipped”**, **“N errors”** cards and a table of the rows that would be generated. **Nothing is written.**
- **Step-by-step debug:** open the **“Step-by-step debug”** block below the preview table to inspect each stage: **Step 1** the parent record (relations loaded) → **Step 2** input rows → **Step 3** matched rules → **Step 4** each pair (row × rule, showing **Kept**/**Skipped** and the reason) → **Step 5** result after grouping → **Step 6** the columns that will be written back to the parent.
- **Insert a column into a formula:** use the **“Formula tools — insert a column into the focused input”** bar at the top: click a formula input, then pick **“＋ Parent column (parent)”**, **“＋ Source-row column (src)”** or **“＋ Rule column (rule)”** — a token like `parent.responsible_staff.direct_manager.id` is inserted at the caret (a null hop mid-path just yields null, no error).

## Tips & notes

- 📸 **Numbers are snapshotted at click time, NOT “live”.** Changing a norm/rate **after** generating does **not** alter rows already created. To reflect new prices, generate again.
- 🤫 **Missing data = silently skipped.** A **“Required”** column that comes out empty (e.g. the order has no responsible staff, or that person has no manager) **drops just that row**, records it under **“Skipped”**, and **does not error** the whole batch.
- 🔒 **Conditions are enforced at both ends.** The condition in section 1 both **shows/hides the button** and is **re-checked by the server** on run — blocking double-clicks or direct API calls.
- ♻️ **Re-running only ADDS new rows** (it doesn't delete old ones). So use a **done flag** (the *post* update) to avoid duplicate runs; if you need to clear old rows, delete them by hand.
- 🔢 **Splitting money by %?** Turn on **“Round columns (largest-remainder)”** in section 5: the leftover is **pushed into the last row** so the total matches exactly; add a **“Sum check”** (e.g. total % = 1) to be safe.
- 👥 **Who can do what:** **running/previewing** a generator is open to **any logged-in user** (accounting clicks the commission button); but **creating/editing rules** in Settings is **admin-only**.
- 🔗 **Dynamic recipients:** one rule can point to *self / department head / director* depending on the data — the engine walks relations via `REL()`. Remember the **“Load … relations”** fields in sections 1/2/3 so the path the formula needs is loaded.
- 🔁 **Auto-refresh:** after generating, related lists/tables update themselves (no F5).
- Runs on **both** clients: classic `/admin` and modern `/v/`.

## Remove / disable

- **Disable one generator:** open it, untick **“Enabled”** (or use **“Delete”** in the list). A generator running on **auto** stops catching events at once.
- **Remove entirely:** disable the plugin in **Plugin Manager** — the button disappears and nothing auto-runs. **Child rows already generated stay** (they're ordinary data), and the generators you declared remain in the database if you re-enable.
- 🆘 **Generated the wrong thing?** Child rows are ordinary records in the target table — just **delete them by hand** like any data; if you used a **done flag**, clear it to be allowed to generate again.

---

### For developers

A **config-driven** mechanism: each generator is one row in the `ptdl_linegen_rules` collection (the whole configuration lives in the JSON `config` column). The server exposes the `ptdlLineGen` resource with three main actions: `rulesFor` (which generators apply to a collection), `preview` (dry-run), and `generate` (transactional write: child rows + parent updates in the same transaction). Auto-run hangs off the `afterCreate/UpdateWithAssociations` hooks with an anti-reentrancy lock. Since 0.7 the core also does **priority-tier matching** (`matchTiers` — first non-empty tier wins, higher-tier fields auto-excluded from lower tiers) and **recursive self-join explosion** (`recurse` — multi-level BOM, qty multiplies down, leaf detection + cyclic guard, `leaves`/`all` output). The algorithm core (match / tiers / skip / recurse / group / round / hash) is pure, touches no DB, and is tested with Node — see `seed/COMMISSION-SETUP.md` and `bash test/run.sh` (88/88 assertions).
