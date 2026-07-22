# App Doctor — User Guide

> **Scan** all data collections for **broken relations** and **repair them in one click**. It specializes in the
> breakage that **imports / auto-generated apps** leave behind — the same class that **freezes the app when you open
> a sub-table**. Repair only **ADDS the missing reverse relation** and **never touches your data**.

**Group:** System services · **Runs on:** /v/ (modern) + /admin (classic) · **Version:** 0.1.0

## Why this plugin?

When you **import data** or let **AI / app-builder generate an app**, relations often end up **one-sided**: the child
has `order → customer`, but `customer` has **no** reverse list of `orders`. Consequences:
- **The app freezes** when you enable a **sub-table** column bound to the incomplete relation (the column can’t
  resolve its field → the render error spreads to the whole app). *(The `perf-guard` plugin already blocks the
  freeze — App Doctor **cures the root cause** so the relation actually works.)*
- Related lists won’t open, and cross-relation filter/display don’t behave as expected.

App Doctor finds those spots and **auto-creates the missing reverse relation**.

## What changes after install?

- **A new settings page**: **⚙ Settings → “App Doctor”** (in both `/v/` and `/admin`). Opening it **auto-scans**.
- **No** plugin-owned tables / fields / collections; it runs only when you click.
- ⚠️ Requires **administrator** rights to scan/repair.

## What it checks

| Issue | Level | Auto-fix? |
|---|---|---|
| **Missing reverse** — a one-sided relation (belongsTo without the master’s hasMany, hasMany without the child’s belongsTo, or a one-sided many-to-many) | Warning | ✅ **Yes** (creates the reverse) |
| **Broken target** — a relation pointing at a collection that was deleted | Error | ❌ Manual (the model is gone) |
| **Broken through** — a many-to-many missing its junction (through) table | Error | ❌ Manual |

*(Relations to system collections like `users`/`roles` — e.g. created-by/updated-by — are **not** flagged as missing a reverse.)*

## How to use

1. Open **⚙ Settings → “App Doctor”**. The page **auto-scans** and lists the issues (Errors in red first, Warnings in gold).
2. Read the **Issue** column to understand each row: which collection, which relation, what’s missing.
3. Fix:
   - **One at a time:** click **“Fix”** on a fixable row → creates exactly the missing reverse relation.
   - **All:** click **“Fix all (N)”** → creates every missing reverse in one go (with a confirm).
4. **Reload the page (F5)** after fixing so the UI reloads the new field list. Click **“Re-scan”** to confirm it’s clean.

## Tips & notes

- 🛟 **Safe:** a repair only **ADDS** a virtual relation field (for navigation); it never drops/edits data or existing
  fields. Reverse names are **collision-safe** automatically.
- 🔁 **Idempotent:** re-scanning/repairing is harmless — anything that already has its reverse is **not** created twice.
- 🩺 **Pairs with `perf-guard`:** perf-guard **blocks the freeze** instantly; App Doctor **cures the root** so the
  relation works. Run App Doctor **after each import / app generation**.
- ⚠️ **Error** rows (missing target/through collection) need you to handle them in **Collection management** (restore
  the collection or delete the orphaned relation) — App Doctor won’t guess a model that’s gone.

## Remove / disable

Turn the plugin off in the **Plugin Manager** — App Doctor **runs nothing in the background**, only when you open the
page and click, so removing it is completely harmless (the reverse relations it **already created** stay, since they’re
now part of your data model).

---

### For developers

Server-only (`src/server/doctor.ts` + `plugin.ts`). The scan reads the whole `fields` repo **once** plus the user
data-collection list from the `collections` repo (an allowlist — system collections skipped), then for each relation
field checks that the matching reverse exists on the target (belongsTo↔hasMany/hasOne by shared `foreignKey`; m2m by
`through`). Repair **re-scans server-side** and creates the reverse field via the `fields` repo — **idempotent by
(target, FK)**, collision-safe naming (the same proven mechanism as `app-builder`). Two actions
`ptdlAppDoctor:scan|repair`, **admin-only** (`pm.app-doctor` snippet + `requireAdmin`), `ctx.body` **raw** (no
`{data}` wrapper). No own collection.
