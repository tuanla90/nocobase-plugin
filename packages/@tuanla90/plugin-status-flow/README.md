# Status Flow — User Guide

> Adds a **new field type** that works like a "state machine": you declare the **statuses**
> (with kind + colour), the **allowed transitions** and **which roles may move** them. When editing, the
> dropdown shows **only valid next statuses**; the **server blocks** every illegal transition (including bulk edit).
> Cells also get a **flow graph** and **quick-transition buttons**.

**Group:** Fields · **Runs on:** /admin (classic) + /v/ (modern) · **Version:** 0.1.2

## What's new after installing?

- **A new field type.** When you add/configure a field on a collection, the field-type list gains
  **"Status Flow"** (usually under the *Choices* group).
- **No new menu, no new Settings page.** Everything lives in **the field's own configuration**,
  under the **"Statuses & transitions"** section.
- On **table cells / detail pages**, the field renders as a **colour tag**; through the column's ⚙ you can also
  turn on **Flow graph**, **Quick actions**, **Change log** and switch the display style (Pills, Button group, Steps, Status bar).
- It adds an **"Actions ▾" action button** (when you add it you'll see the name **"Status transition"**) that you can
  place on the table / detail action bar — click to move the status right there.
- **The server enforces the rules**: new records always start at the initial status; illegal transitions or
  wrong-role moves are **blocked** (both single and bulk edit).

## Where to configure

There's no separate config page — this is a **field type**, so you set it up **right when you create/edit a field** on a collection:

- Go to the **collection's field manager** → **Add field** (or edit an existing field) → choose the **"Status Flow"** type.
- In the field-config dialog, open the **"Statuses & transitions"** section to declare statuses, transitions and roles.
- Works in **both** clients: field configuration on classic `/admin` and modern `/v/` both open the **same editor**.

## How to use (step by step)

### Step 1 — Create the status field
1. Open the **collection** whose status you want to track (e.g. *Orders*, *Tasks*, *Requests*).
2. Go to **field configuration** → **Add field** → choose the **"Status Flow"** type.
3. Name the field (e.g. *Status*) → open the **"Statuses & transitions"** section.

### Step 2 — Declare the statuses
Each row is one status. Click **"+ Add status"** to add a row; for each row set:

| Field | Meaning |
|---|---|
| **Colour dot** | Click to pick the status's **Color** |
| (icon) | Choose an **Icon (optional)** shown next to the label |
| **Status name** | The display label (e.g. *New*, *In progress*, *Done*) |
| **key** | Technical code (auto-generated from the name; best left as is) |
| **Kind** | **Initial** / **In progress** / **Success** / **Failed / Cancelled** |

> 💡 The status whose **Kind = "Initial"** is where **every new record starts** — only one status may be "Initial".
> Drag the **⠿** handle at the start of a row to **reorder**. Click **✕** to remove a status.

### Step 3 — Declare valid transitions + roles
In the sub-row right under each status:
- **Can move to**: pick the status(es) you're allowed to **move on to** from here.
  Leave it **empty = final status** (nowhere else to go).
  - Choose **"✳ Any status"** if from here you can go to **every** status.
- **"↩ from any"**: tick this if **every** status is allowed to move **INTO** this one
  (good for *Cancelled*, *Archived* style statuses).
- **by roles**: restrict **which roles may perform** that transition.
  Leave it **empty = everyone** may move.

> 💡 Above the editor there's a **"Flow preview"** box that draws the diagram so you can quickly check the paths (appears once you have 2+ statuses).

### Step 4 — How people will use the field
- **When creating a new record**: the field is **locked at the initial status** (no free choice).
- **When editing**: the dropdown shows **only the current status + the valid next statuses** for that person's **role**
  — forbidden paths never appear.
- **On a table cell**: shows the colour tag; if **Quick actions** is on, a **"→ &lt;status&gt;"** button lets you move right away
  (with a confirmation prompt).

### (Optional) Change the display style / enable cell widgets
1. Turn on the **UI Editor** → open **⚙** on the **column** (or the field in a Detail/Form block) → the **"Status Flow"** section → **"Display style"**.
2. **Display as**: *Tag (default)* / *Pills* / *Button group* / *Steps* / *Status bar*.
   (On a **form field** this option is called **"Widget"**, with the extra *Status pills (click to move)* and *Status bar (Odoo style)*.)
3. Pick a **Size** (Small/Medium/Large) and a **Color mode**: *Colorful (per-status color)* or *Mono (single color)*.
4. Turn on the cell widgets: **Flow graph** (an icon that opens a popover showing the diagram with the current status highlighted),
   **Quick actions** (move-now buttons), **Change log** (needs the change-log plugin).

### (Optional) Add an "Actions ▾" button to move statuses
1. On the action bar of a **table** or a **detail page**, add the **"Status transition"** action.
2. Open the button's **⚙** → **"Status transition settings"**: pick the **Status field**, turn on
   **Confirm before moving** and/or **Ask for a note/reason**.
3. Click the button → the menu **lists only the transitions valid for this record**.

## Tips & notes

- ✅ **The server is the "referee".** The pre-filtered dropdown is just for convenience; even a direct API call,
  a bulk edit or an import gets **blocked** on an illegal or wrong-role move, with a clear message ("… not allowed").
- ⚠️ **You can't blank out** a status you've set — the system raises an error instead of resetting it to empty. To "finish",
  create a **final status** (e.g. *Cancelled*) and let the other statuses move into it.
- ⚠️ **"Raw" bulk edits** on the status field are **rejected** — edit **one record at a time** so the transition rules apply.
- The **root** role (super admin) **bypasses** all transition rules.
- Changes made by **workflow / script / migration** (with no user context) are **let through** —
  the rules apply only to user actions.
- **Change log**: this button appears only when `@tuanla90/plugin-change-log` is also installed.
- Runs on **both** clients: classic `/admin` and modern `/v/`.

## Remove / disable

- Disable the plugin in **Plugin Manager**. The status configuration (saved in the field's `options`) is **kept**, but:
  - The field falls back to a **plain select** (loses the colour tag / graph / quick-transition buttons).
  - **The server stops enforcing the rules** → transitions are no longer blocked.
- Re-enable the plugin and everything works as before (**nothing is lost** from what you declared).

---

### For developers

- Field type: `statusFlow` (the `choices` group). Config is stored in the field record's `options` column:
  `uiSchema.enum` (`{ value, label, color, icon }`) + `statusFlow` (`initial`, `kinds`, `transitions`, `openFrom`).
- Enforced on the server via the `beforeCreate` / `beforeUpdate` / `beforeBulkUpdate` hooks — see `src/server/plugin.ts`.
  The client only filters the dropdown for tidiness (UX); it is not the protection layer.
- The two client lanes share one model + editor in `src/shared/*`: `src/client` (classic `/admin`) and
  `src/client-v2` (modern `/v/`).
- Research/design notes: `docs/STATUS-FLOW-RESEARCH.md`.
