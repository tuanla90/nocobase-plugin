# Plugin Hub — user guide

> Install **one plugin**, then install & update **every other @tuanla90 plugin** from it — no browser `.tgz`
> upload, no server shell. Point it at a **manifest URL**, click a button.

**Group:** UI · **Runs on:** /admin (classic) + /v/ (modern) · **Version:** 0.1.14

## Why?

Installing a NocoBase plugin normally means **uploading a `.tgz`** through the browser — which many devices
/ corporate networks **block**. Plugin Hub takes the other route: the **server downloads** each plugin from a
URL, so a browser upload block no longer matters. And instead of pasting a URL for every plugin (30+ times),
you install the Hub **once** and it manages the rest — including **updates** later.

## What it adds

- **One new Settings page**: **“Plugin Hub”** — the only place you interact.
- **No menu / button / field** on your data pages.
- A **weekly update check that only NOTIFIES** (“N updates available”) — it never auto-applies (installing
  new code without review is opt-out by design).

## Where to configure

| Client | Path |
|---|---|
| **Modern (`/v/`)** | ⚙ **Settings** → **“Plugin Hub”** |
| **Classic (`/admin`)** | **Settings** → **“Plugin Hub”** (`/admin/settings/ptdl-plugin-hub`) |

## How to use

1. **Source** — the **Manifest URL** field (default = the public @tuanla90 repo's `latest/index.json`), a JSON
   listing `{ packageName, version, url }` per plugin.
2. **Check now** → a table of every plugin with its *installed · latest · status*:
   - **Not installed** → **Install** (`pm add`), then **Enable** (`pm enable`).
   - **Installed (disabled)** → **Enable**.
   - **Update available** → **Update** (`pm update`).
   - **Up to date** → ✓.
3. **Update all** — updates every out-of-date plugin sequentially, with a progress line.

> Each Install/Enable/Update makes NocoBase **reload** briefly (maintenance mode); the Hub **waits for the
> app to come back** and refreshes the list. Normal — “Update all” across many plugins takes a while.

## Notes

- Only the **`root` role** can install/update (these change code).
- **Railway / Docker**: runtime-installed plugins live in `storage/plugins` → mount a **volume at
  `/app/nocobase/storage`**, or they vanish on redeploy.
- **Chicken-and-egg**: the Hub is itself a plugin, so install it **once via URL** (Plugin manager → Add → URL
  → the `plugin-hub-*.tgz` link). After that, the Hub handles everything.
