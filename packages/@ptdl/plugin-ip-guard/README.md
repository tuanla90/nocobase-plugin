# IP Guard (Allow-list / Block-list) — User Guide

> Firewall NocoBase by the visitor's **IP address**: admit only certain IPs, or block bad ones —
> configured right in the admin UI, **no code, no server restart**.

**Group:** Security · **Runs on:** /admin (classic) + /v/ (modern) · **Version:** 0.2.0

## What's new after installing?

- **A new Settings page: “IP Guard”** (lock icon). This is the one and only place you configure it.
- **No new menu, button or field** is added to your data pages/blocks.
- ⚠️ **The default is Off.** Enabling the plugin **blocks nothing** — rules take effect only after you pick a mode and click **Save**.
- Also included: a box showing **your current IP**, a tool to **test an IP**, and an **access log** to see who gets blocked.

## Where to configure

| Client | Path to the config page |
|---|---|
| **Modern (`/v/`)** | ⚙ **Settings** → **“IP Guard”** |
| **Classic (`/admin`)** | **Settings** → **“IP Guard”** (path `/admin/settings/ptdl-ip-guard`) |

Both clients open the **same config page** and share one set of rules.

## How to use (step by step)

> ✅ **Always do this first:** in the top card, check **“Your current IP”**, then click
> **“Add my IP to safe-list”**. This is your “escape hatch” so you can't lock yourself out.

### Scenario A — Allow only a few trusted IPs (allow-list)

1. Open the **“IP Guard”** page.
2. Click **“Add my IP to safe-list”** (so you keep access for sure).
3. Under **Mode**, choose **“Allow-list”**.
4. Pick the **Enforcement scope**: **“Whole app”** (blocks everything) or **“API only”** (safer — see the table below).
5. Fill in **“Allow-list (allowed IPs)”**, **one entry per line** (single IP, a CIDR block `10.0.0.0/8`, or a range `1.2.3.4-1.2.3.9`).
6. Click **“Save”**. ✅ From now on only IPs on the list (and the safe-list) get in; everyone else is blocked immediately.

### Scenario B — Block a few troublemakers (block-list)

1. Open the config page → set **Mode** to **“Block-list”**.
2. Put the IPs to ban into **“Block-list (blocked IPs)”**, one per line.
3. Click **“Save”**. ✅ Every IP gets in **except** the ones you listed.

### Scenario C — Try before you enforce (Monitor)

1. Set **Mode** to **“Monitor”**, enter your rules as usual, then **“Save”**.
2. The plugin **checks and logs** cases that *would* be blocked but **doesn't actually block** — safe to gauge the impact.
3. Watch the **access log**. The **Decision** column shows **“Would block”** for IPs that would be banned.
4. Once happy, switch **Mode** to **“Allow-list”** / **“Block-list”** and **“Save”** again.

> 💡 Want to try an address quickly **without saving**? Use **“Test an IP against the current (unsaved) rules”**, enter an IP and click **“Test”**.

## Tips & notes

- ⚠️ **This is server-side enforcement.** Rules apply **the moment you click “Save”**, **no restart** — be sure before you save.
- ⚠️ **Don't lock yourself out.** If your config would block your own IP, the page shows a red warning **“This configuration would block your own IP”**. Add your IP to the **allow-list** or **safe-list** first.
- Choose the **Enforcement scope** to fit your need:

  | Scope | Blocks what | Note |
  |---|---|---|
  | **Whole app** *(default)* | **Every request**, including the web page + static assets | A true firewall: a blocked IP sees nothing. |
  | **API only** | The API only (data, sign-in, settings) | The page shell still loads but is useless to a blocked IP; **never hard-bricks the server**. |

  Both scopes **exempt loopback and the safe-list**, so you always have a way back in.
- **Loopback is always allowed** (on by default): `127.0.0.1`, `::1`. So if you do lock yourself out, you can still get in **from the server itself** via `http://127.0.0.1:<port>` and set Mode back to **“Off”**.
- **Behind a proxy?** If NocoBase runs behind Nginx / a load balancer / Cloudflare, leave **“Behind a proxy (read forwarded header)”** on to read the real client IP. If clients connect **directly**, turn it **off** (a forwarded header can be spoofed).
- The **access log** self-caps around the last **500 rows**; you can **clear** it anytime. Turn on **“Log allowed requests”** only briefly when debugging — it's very chatty.
- Runs on **both** clients: classic `/admin` and modern `/v/`.

## Remove / disable

- **Pause blocking:** open the config page, set **Mode** back to **“Off”** → **“Save”**. Your config (the lists) is kept for later.
- **Remove entirely:** disable the plugin in **Plugin Manager** — blocking stops at once. Saved config and logs stay in the database if you re-enable.
- 🆘 **Locked out with no safe path?** Open the app **from the server** via `http://127.0.0.1:<port>` (loopback is exempt) and set Mode to **“Off”**; or edit the config row in the `ptdlIpAccessConfigs` DB table.

---

### For developers

Server-tier enforcement: **Whole app** uses `app.use` (registered before CORS, covers everything), **API only** uses `resourcer.use`. Config is one row (`key = 'global'`) in `ptdlIpAccessConfigs`, logs in `ptdlIpAccessLogs` (auto-trimmed to ~500 rows). The pure IP matcher (`ipMatch`) is unit-tested (IPv4/IPv6, CIDR, ranges, loopback/LAN).
