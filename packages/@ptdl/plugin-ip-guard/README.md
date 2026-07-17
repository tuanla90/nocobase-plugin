# @ptdl/plugin-ip-guard

**IP Guard (Whitelist / Blacklist)** — firewall your NocoBase by the client's IP address, configured
from the admin panel. Works on both the classic (`/`, `/admin`) and modern (`/v/`) clients.

## What it does

Every request to the NocoBase HTTP **API** (`/api/*` — data, sign-in, settings, everything) is checked
against your rules before the action runs:

- **Allow-list mode** — only IPs in the allow-list (plus the safe-list) may reach the API. Everything
  else is blocked.
- **Block-list mode** — every IP is allowed except those in the block-list.
- **Monitor mode** — requests are checked and would-be blocks are recorded in the access log, but
  **nothing is actually blocked**. Use it to preview the impact of your rules before enforcing.
- **Off** — no checking.

Blocked requests get a configurable `403` and are recorded in a capped access log.

### Enforcement scope

Pick how far the block reaches (Settings → IP Guard → **Enforcement scope**):

| Scope | Blocks | Notes |
| :-- | :-- | :-- |
| **Whole app** (default) | **every request** — the HTML page, static assets, and the API | A true firewall: a blocked IP gets nothing. Implemented as an app-level middleware registered before CORS. |
| **API only** | the HTTP API only (`/api/*` — data, sign-in, settings) | The page shell still loads but does nothing for a blocked IP. Can never hard-brick the web server, so you can always reach the page to fix the config from an allowed IP. |

Loopback and the safe-list are exempt in **both** scopes, so a local or safe-listed admin can always recover.

## Rule syntax

One entry per line (commas and semicolons also separate). IPv4 **and** IPv6.

| Form | Example |
| :-- | :-- |
| Single address | `203.0.113.4` · `2001:db8::1` |
| CIDR block | `10.0.0.0/8` · `192.168.1.0/24` · `2001:db8::/32` |
| Start–end range | `192.168.1.10-192.168.1.20` |
| Comment | `# office router` (whole line ignored) |

## Usage

1. **Enable**: Plugin Manager → `@ptdl/plugin-ip-guard` → enable.
2. **Configure**: open **Settings → IP Guard**.
3. The panel shows **your current IP** and whether the current rules would allow it. Click
   **Add my IP to safe-list** first so you don't lock yourself out.
4. Pick a **Mode**, fill the relevant list, and (recommended) leave it on **Monitor** for a while to
   watch the access log.
5. Use the **Test an IP** box to check any address against the unsaved rules.
6. **Save**. Changes apply immediately (no restart).

### Safety features

- **Safe-list (always allowed)** — applies in every mode and is never blocked. Put trusted admin IPs
  here. This is your remote-admin escape hatch.
- **Always allow loopback** (default **on**) — `127.0.0.0/8` and `::1` are never blocked, so local and
  CLI access keeps working.
- **Always allow private / LAN** (optional) — RFC1918, link-local and IPv6 ULA ranges.
- **Live lock-out warning** — the panel warns (and the mode blocks) before you save a config that would
  block your own current IP.

## Behind a proxy

If NocoBase runs behind Nginx, a load balancer or Cloudflare, the socket address is the proxy, not the
client. Leave **Behind a proxy** on (default) so the guard reads the real client IP from the
`X-Forwarded-For` header (first hop; `X-Real-IP` is a fallback). You can change the header name.

> **Security note.** A forwarded header is only trustworthy when a proxy you control sets it. If clients
> can reach the Node server **directly**, they can spoof `X-Forwarded-For` — in that case turn the
> option **off** so the guard uses the real socket address, or make sure only your proxy can reach the app.

## Recovering from a lock-out

If you enforce an allow-list that excludes you and have no safe-listed/loopback path, recover on the
server (root bypasses ACL but the guard is IP-based, so use one of these):

- **From the server host** (loopback is exempt by default): open the app on `http://127.0.0.1:<port>`
  and set the mode back to **Off** / add your IP.
- **Via the database**: set the guard back to off in the single config row —
  ```sql
  UPDATE "ptdlIpAccessConfigs" SET options = '{"mode":"off"}' WHERE "key" = 'global';
  ```
  then restart the app (or re-save from an allowed IP). The table name matches the collection
  `ptdlIpAccessConfigs`.

## Data

- `ptdlIpAccessConfigs` — one row (`key = 'global'`) whose `options` JSON holds the whole config.
- `ptdlIpAccessLogs` — access-attempt audit trail, auto-capped at 500 rows.

## Notes

- Server-enforced by an in-memory config that reloads on save: an app-level `app.use` middleware for
  **Whole app** scope, or a `resourcer.use` middleware for **API only** scope.
- Bilingual UI (English + Tiếng Việt); reuses `@ptdl/shared` settings-kit.
- The IP-matching core is pure and unit-tested (IPv4/IPv6, CIDR, ranges, loopback/private, decisions).
