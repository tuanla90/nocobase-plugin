# Performance & Stability — User Guide

> Two defense layers for the **modern (/v/)** client: a **keep-alive cap** so the app doesn’t **slow down
> over time**, and a **crash guard** for **broken relations**. Pure client-side — **no data changes, no server restart**.

**Group:** System services · **Runs on:** /v/ (modern) · **Version:** 0.1.5

> ⚠️ **IMPORTANT (0.1.5):** The **CRASH GUARD** is the active, safe feature. The **KEEP-ALIVE CAP** is
> **EXPERIMENTAL and OFF by default**: the only unmount primitive NocoBase exposes (`destroyModel`) turned out
> to **DELETE the page from the DB** (not just unmount it), so auto-eviction is **disabled** until a
> non-destructive unmount exists. `evict()` is now **report-only — it destroys nothing**. The keep-alive
> sections below describe how it *would* work once a safe primitive is available.

## Why this plugin?

- **The app gets slower the longer you use it.** NocoBase v2 **keeps every page you open** mounted (keep-alive)
  and **never evicts it**. Navigating across menu pages makes the **DOM node count climb unbounded** (measured
  3k → 12k → 21k), rendering slows, and only **F5** clears it. → The **keep-alive cap** auto-evicts to keep the DOM lean.
- **A broken relation can freeze the whole app.** A relation missing its reverse (belongsTo) or with a mismatched
  FK makes a column fail to resolve its field → that column’s `beforeRender` flow throws → **the whole app freezes**.
  → The **crash guard** isolates each column: a broken one becomes an **empty cell** instead of freezing everything.

## What changes after install?

- **A new settings page**: **⚙ Settings → “Performance & Stability”** (present in both `/v/` and `/admin`).
- The **keep-alive cap is ON by default** (a safe default), keeping the **3 most-recent background pages** alive and evicting older ones.
- The **crash guard is ALWAYS ON** (pure protection, no downside).
- **No** new tables / fields / collections; **no server restart** — everything runs in the browser.

## Where do I configure it?

| UI | How to open |
|---|---|
| **Modern (`/v/`)** | **⚙ Settings** → **“Performance & Stability”**. |
| **Classic (`/admin`)** | **Settings** → **“Performance & Stability”**. (The keep-alive cap **has no effect** here — sub-pages are a `/v/` construct — but the settings page still opens.) |

## How to use

### Option A — Leave the defaults (recommended)
**Do nothing.** Install + enable and you’re done: the cap auto-evicts, the guard protects. After using the app for a
while, open the settings page and watch **“Pages kept (page-header)”** — it now **holds steady** at a small number instead of climbing forever.

### Option B — Tune how many background pages stay alive
In the settings page, change **“Max background pages to keep”**:
- **Higher** (e.g. 6–10): returning to recent pages is **instant** (filters/scroll preserved), but the DOM is larger.
- **Low** (1–2): leanest DOM, but returning to an older page **reloads** it.
- **0**: **evict all** background pages — maximum performance; every return reloads the page.

### Option C — Inspect / act manually
- **“Dry-run scan (no delete)”**: see how many pages would be evicted (touches nothing) — a safe first step.
- **“Evict now”**: evict immediately.
- **Console** (F12): `window.__ptdlPerfGuard.status()`, `.scan()`, `.evict()`, `.setMax(2)`, `.disable()` / `.enable()`.

## Tips & notes

- 🔁 **Eviction trade-off:** an evicted page **reloads from scratch** when you return (its transient filter/scroll is
  lost). That’s why the default **keeps the 3 most-recent pages** — the common “list → detail → list” bounce stays instant.
- 🛟 **The crash guard is completely safe:** it only **isolates** a column’s render error; if anything is off it **falls
  back to NocoBase’s original behavior** and never throws.
- 🖥️ **The keep-alive cap only applies on `/v/`** (modern). On classic `/admin` it **does nothing** (harmless).
- 🔌 **If you hit any odd navigation behavior**, just **turn off** “Auto-evict background pages” in the settings page
  (or run `window.__ptdlPerfGuard.disable()`); the crash guard keeps working independently.

## Remove / disable

- **Disable the cap only:** turn off the **“Auto-evict background pages”** switch (saved **per browser**).
- **Disable everything:** turn the plugin off in the **Plugin Manager**. Both layers stop immediately. Because the
  plugin **never touches data**, removing it is completely harmless.

---

### For developers

Pure client. **keep-alive cap** (`src/shared/keepaliveCap.ts`): reads the sub-page “view descriptors” inside
`.nb-subpages-slot-without-header-and-side` via a **read-only React-fiber walk**, orders them **LRU** (observing which
page is visible to stamp recency), keeps the `maxAlive` most-recent and calls the core’s own
`flowEngine.destroyModel(uid)` to cleanly unmount the rest; navigation hooked via `pushState/replaceState/popstate`
(300ms debounce). **ON by default** (only `localStorage['ptdl:perf-guard:enabled']==='0'` disables). **crash guard**
(`src/shared/crashGuard.ts`): walks the prototype chain from core model classes to find the base `FlowModel.prototype`
and patches `applySubModelsBeforeRenderFlows` to **isolate each sub-model’s `beforeRender`** (one broken column can’t
reject the shared `Promise.all` → no freeze); idempotent, keeps the original as a fallback. No collection; empty server.
