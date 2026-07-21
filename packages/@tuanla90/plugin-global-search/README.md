# Global Search — User Guide

> A **header search box** plus a **`Ctrl / ⌘ + K` command palette** that searches across many
> collections at once and **jumps straight to the record** — results grouped by collection, shown live as you type.

**Group:** UI (search) · **Runs on:** /admin (classic) + /v/ (modern) · **Version:** 0.9.8

## What's new after installing?

- **A `Ctrl / ⌘ + K` shortcut** anywhere → opens the **search command palette**. Press it again (or `Esc`) to close.
- **A header search button** (a "pill"): clicking it also opens the palette. You can adjust its shape, colour and position.
- **Live, grouped results**: results appear as you type (~0.3 s debounce), split into a group per collection.
  Click, or use **↑↓ then `Enter`** to open.
- **A "Search in" box** in the palette: narrows to exactly one collection (shown when there's more than one group).
- **A new settings page**: **Settings → Global Search** (3 tabs) to choose the search scope, how results open, and the button style.

> The palette and settings-page language follows the **NocoBase interface language** (Vietnamese/English).

## Where to configure

| Client | Path to the config page |
|---|---|
| **Modern (`/v/`)** | ⚙ **Settings** → **"Global Search"** |
| **Classic (`/admin`)** | **Settings** → **"Global Search"** (path `/admin/settings/global-search`) |

Both clients open the **same config page**. The configuration is **saved on the server and shared by everyone**
(every account and browser sees the same setup), so only an **administrator** should change it; after you click
**Save** you'll see a *"Saved for everyone"* message.

The config page has **3 tabs**:

| Tab | Used for | What you set here |
|---|---|---|
| **What to search** | Choose the search scope | All collections (automatic) *or* pick each collection + fields + how the title shows |
| **When I click a result** | Choose how results open | Preview drawer / Detail view / Open page — per collection |
| **Appearance** | Style the header button | Preset, position, width, corner radius, text, background/text colour |

## How to use (step by step)

### Scenario A — Quickly find a record

1. Press **`Ctrl + K`** (Windows/Linux) or **`⌘ + K`** (Mac) — or click the **search button** in the header corner.
2. Type your keyword into the **"Search…"** box. Results appear right below, **grouped by collection**.
3. (Optional) Click the **"Search in"** box to search just **one** collection instead of all of them.
4. Pick a result with the **mouse**, or use **↑↓** to move then **`Enter`** to open. `Esc` closes.
5. ✅ Depending on the config, the record opens in a **preview drawer** (on the right) or **jumps to the matching page**.

> 💡 Typing **a number** (e.g. `123`) also finds a record by its **ID**, not just by text.

### Scenario B — Choose where to search (the **What to search** tab)

1. Go to **Settings → Global Search → the "What to search" tab**.
2. Choose one of two modes:
   - **All collections (automatic)** — searches the text fields of every non-hidden collection, with nothing else to set up.
   - **Choose collections** — declare each collection you want to search yourself.
3. If you pick "Choose collections", for each card:
   - **Collection:** pick the table to search.
   - **Search in:** choose the **fields** to match (defaults to all text fields). Click **"＋ Nested field"**
     to add a field from a related table, e.g. `customer.name`.
   - **Show as:** choose **Fields** (join a few fields into the title) or **Template** (write a template like
     `{{id}} - {{name}} - {{customer.name}}`, with date/number formatting…). Set **Max results** alongside.
4. Add another table with **"+ Add collection"**, drop one with **"Remove"** → click **"Save"**.

### Scenario C — Change how results open (the **When I click a result** tab)

Pick how each collection opens in the **"Open as"** box:

| Option | What happens when you click |
|---|---|
| **Preview drawer** *(default)* | Opens a right-hand drawer for a quick look at the record's fields, **without leaving the page**. |
| **Detail view** | Opens the record's detail page. **Open one record as a test, copy the browser URL, paste it here** — the id part automatically becomes `{{id}}`. |
| **Open page** | Jumps to a **page** you choose; the id is appended as `?filterByTk=`. |

Click **"Save"**. Any collection **not** listed here uses the **Preview drawer** by default.

### Scenario D — Style the search button (the **Appearance** tab)

There's a **live preview** at the top of the tab. You can adjust:

- **Preset:** **Icon only** / **Icon + text** / **Full** (with the shortcut hint).
- **Position:** **Left** / **Center** / **Right** *(default)*. Left & Center float as an overlay over the header;
  **Right** docks neatly among the action buttons and **never overlaps** anything.
- **Width**, **Corner radius**.
- **Button text:** leave it empty and the button shrinks to a **circle with only the icon**.
- **Shortcut hint:** show/hide the `Ctrl / ⌘ + K` hint on the button.
- **Auto icon:** on a narrow screen the button auto-collapses to a circle (default when the width is ≤ 820px; set 0 to turn off).
- **Background** and **Text color:** leave empty to follow the theme colours.

Click **Save** to apply for everyone (or the reset button to return to defaults).

## Tips & notes

- ⌨️ **The shortcut always works**, even when you can't see the button in the header (e.g. on a sub-page/popup with no main header bar).
- 🔎 **Searchable:** **text** fields (string/text), including nested relation fields you add via **"＋ Nested field"**,
  and the **ID** when you type a number. **Not** searchable: numbers/dates.
- 👥 The config is **system-wide** (saved on the server) — one person changes it, everyone sees it. You need **admin** rights to save.
  If the server is briefly unreachable, changes are saved **on this device only** (you'll get a warning).
- ⚠️ After changing the config, **reopen** the palette (`Ctrl / ⌘ + K`) to use the new settings.
- 🖥️ Runs on **both** clients: classic `/admin` and modern `/v/`.
- 🔒 Results still respect each collection's **permissions** — a collection you don't have access to shows *"Couldn't search"* instead of leaking data.

## Remove / disable

- Disable the plugin in **Plugin Manager**. The search button and shortcut disappear; your saved config
  (search scope, open behaviour, appearance) stays on the server and **comes back when you re-enable** the plugin.

---

### For developers

Three lanes: **classic** `client/index.tsx` (`@nocobase/client`) and **modern** `client-v2/index.tsx`
(`@nocobase/client-v2`) each register a `GlobalSearchProvider` and the settings page (classic via
`pluginSettingsManager.add`, modern via `addMenuItem` + `addPageTabItem`); `server/index.ts` owns the
`globalSearchConfig` collection. Search is **client-side**: `Ctrl/⌘+K` opens a palette that debounces 300 ms and
**fans out** one `resource(collection).list({ filter: { $or: [...] }, pageSize })` per target (NocoBase turns
`$includes` into a SQL `LIKE`), grouping results by collection; targets are either explicit or auto-discovered
from `collections.list` (text fields, ≤25 collections, cached, falling back to `users`). Config is **system-wide**
in `globalSearchConfig` under three keys — `targets`, `viewlinks`, `appearance` — with **localStorage as a fallback**
when the server isn't reachable. Both template kinds use double-brace `{{field}}` tokens (via `@tuanla90/shared`'s
`interpolate`), including nested relation fields (`{{customer.name}}`) and filter pipes (`date`, `number:2`, …).
A **server-tier change** (e.g. the `globalSearchConfig` collection) needs a **NocoBase restart**, not just a hard
refresh, to create the table and register the resource. Results still pass each collection's own ACL; note the
config write is ACL-open to `loggedIn` (the Settings UI is admin-only, so this is low-stakes). Force the
header-pill container with `window.__PTDL_SEARCH_HEADER_SELECTOR__ = '<css selector>'` for unusual layouts.
Build compiles all three lanes (`nocobase-build --tar`); keep the `client-v2.js` root stub or the modern
client's `pm:listEnabledV2` skips the plugin and nothing renders on `/v/`.
