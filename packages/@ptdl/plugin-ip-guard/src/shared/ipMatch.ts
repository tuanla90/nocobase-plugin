/**
 * IP matching core — self-contained, dependency-free, and PURE so it can be unit-tested offline and
 * reused by both the request guard (hot path) and the `testIp` action.
 *
 * Supports, for BOTH IPv4 and IPv6:
 *   - a single address            192.168.1.10          ::1
 *   - a CIDR block                10.0.0.0/8            fc00::/7
 *   - an inclusive start-end range 192.168.1.10-192.168.1.20
 * Addresses are compared as 32-bit (v4) / 128-bit (v6) BigInts, so ranges never cross versions.
 */

export type IpVersion = 4 | 6;
export interface ParsedIp {
  version: IpVersion;
  value: bigint;
}

export type GuardMode = 'off' | 'monitor' | 'blacklist' | 'whitelist';

export interface GuardConfig {
  mode: GuardMode;
  allowList: string[]; // whitelist entries (whitelist mode)
  denyList: string[]; // blacklist entries (blacklist mode)
  safeList: string[]; // always-allowed (admin safe-list) — applies in every mode
  allowLoopback: boolean; // 127.0.0.0/8 + ::1 always allowed
  allowPrivate: boolean; // RFC1918 / link-local / ULA always allowed
  trustProxy: boolean; // read the client IP from a forwarded header
  forwardedHeader: string; // header to read when trustProxy (default x-forwarded-for)
  blockMessage: string;
  blockStatus: number;
  logBlocked: boolean;
  logAllowed: boolean;
}

export interface Decision {
  allow: boolean;
  /** machine reason: loopback | private | safelist | blacklist | not-blacklisted | whitelist |
   *  not-whitelisted | disabled | unparseable */
  reason: string;
  matched?: string; // the list entry that matched, when any
}

/** Normalize a raw address: strip brackets, an IPv6 zone id, and unwrap IPv4-mapped IPv6. */
export function normalizeIp(raw: string): string {
  if (!raw) return '';
  let ip = String(raw).trim();
  ip = ip.replace(/^\[/, '').replace(/\]$/, ''); // [::1] -> ::1
  const pct = ip.indexOf('%');
  if (pct >= 0) ip = ip.slice(0, pct); // fe80::1%eth0 -> fe80::1
  const mapped = ip.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i);
  if (mapped) ip = mapped[1]; // ::ffff:1.2.3.4 -> 1.2.3.4
  return ip.toLowerCase();
}

export function isIPv4(ip: string): boolean {
  const parts = ip.split('.');
  if (parts.length !== 4) return false;
  return parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255);
}

function ipv4ToInt(ip: string): bigint {
  const p = ip.split('.').map(Number);
  return (BigInt(p[0]) << 24n) | (BigInt(p[1]) << 16n) | (BigInt(p[2]) << 8n) | BigInt(p[3]);
}

/** Parse a (possibly compressed, possibly IPv4-tailed) IPv6 string to a 128-bit BigInt, or null. */
function ipv6ToBigInt(ip: string): bigint | null {
  if (ip.indexOf(':') < 0) return null;
  const dbl = ip.split('::');
  if (dbl.length > 2) return null; // only one '::' allowed

  const toGroups = (str: string): string[] | null => {
    if (str === '') return [];
    const out: string[] = [];
    for (const g of str.split(':')) {
      if (g.indexOf('.') >= 0) {
        // embedded IPv4 tail -> two 16-bit groups
        if (!isIPv4(g)) return null;
        const v = ipv4ToInt(g);
        out.push(((v >> 16n) & 0xffffn).toString(16));
        out.push((v & 0xffffn).toString(16));
      } else {
        if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
        out.push(g);
      }
    }
    return out;
  };

  const head = toGroups(dbl[0]);
  const tail = toGroups(dbl.length === 2 ? dbl[1] : '');
  if (head === null || tail === null) return null;

  let full: string[];
  if (dbl.length === 2) {
    const missing = 8 - (head.length + tail.length);
    if (missing < 0) return null;
    full = [...head, ...Array(missing).fill('0'), ...tail];
  } else {
    full = head;
  }
  if (full.length !== 8) return null;

  let result = 0n;
  for (const g of full) result = (result << 16n) | BigInt(parseInt(g, 16));
  return result;
}

export function parseIp(raw: string): ParsedIp | null {
  const ip = normalizeIp(raw);
  if (!ip) return null;
  if (isIPv4(ip)) return { version: 4, value: ipv4ToInt(ip) };
  const v6 = ipv6ToBigInt(ip);
  if (v6 !== null) return { version: 6, value: v6 };
  return null;
}

/** Does a parsed IP match one list entry (single / CIDR / range)? Blank + `#` comment lines never match. */
export function matchEntry(ip: ParsedIp | null, entry: string): boolean {
  if (!ip) return false;
  const e = String(entry || '').trim().toLowerCase();
  if (!e || e.startsWith('#')) return false;

  // CIDR: addr/bits
  const slash = e.indexOf('/');
  if (slash >= 0) {
    const base = parseIp(e.slice(0, slash));
    const bits = Number(e.slice(slash + 1));
    if (!base || base.version !== ip.version || !Number.isInteger(bits)) return false;
    const total = ip.version === 4 ? 32 : 128;
    if (bits < 0 || bits > total) return false;
    if (bits === 0) return true;
    const mask = ((1n << BigInt(bits)) - 1n) << BigInt(total - bits);
    return (ip.value & mask) === (base.value & mask);
  }

  // Range: start-end (guard the '-' so we don't split an IPv6 — v6 has no '-')
  const dash = e.indexOf('-');
  if (dash > 0) {
    const a = parseIp(e.slice(0, dash));
    const b = parseIp(e.slice(dash + 1));
    if (!a || !b || a.version !== ip.version || b.version !== ip.version) return false;
    const lo = a.value <= b.value ? a.value : b.value;
    const hi = a.value <= b.value ? b.value : a.value;
    return ip.value >= lo && ip.value <= hi;
  }

  // Single address
  const one = parseIp(e);
  return !!one && one.version === ip.version && one.value === ip.value;
}

/** First matching entry in a list, or null. */
export function matchAny(rawIp: string, entries: string[]): string | null {
  const ip = parseIp(rawIp);
  if (!ip) return null;
  for (const entry of entries || []) {
    if (matchEntry(ip, entry)) return String(entry).trim();
  }
  return null;
}

const LOOPBACK = ['127.0.0.0/8', '::1'];
const PRIVATE = [
  '10.0.0.0/8',
  '172.16.0.0/12',
  '192.168.0.0/16',
  '169.254.0.0/16', // link-local v4
  'fc00::/7', // unique local v6
  'fe80::/10', // link-local v6
];

export function isLoopback(rawIp: string): boolean {
  return matchAny(rawIp, LOOPBACK) !== null;
}

export function isPrivate(rawIp: string): boolean {
  return isLoopback(rawIp) || matchAny(rawIp, PRIVATE) !== null;
}

/** Split a textarea / comma list into clean entries (drop blanks and `#` comments). */
export function parseList(input: unknown): string[] {
  if (Array.isArray(input)) {
    return input.map((s) => String(s).trim()).filter((s) => s && !s.startsWith('#'));
  }
  if (typeof input === 'string') {
    return input
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith('#'));
  }
  return [];
}

/**
 * Pure decision: what SHOULD happen for this IP under this config, ignoring `monitor` (the caller
 * turns a deny into a log-only event in monitor mode). Fail-open: an unparseable IP is allowed so a
 * quirk of proxy formatting can never lock everyone out.
 */
export function decide(rawIp: string, cfg: GuardConfig): Decision {
  const ip = parseIp(rawIp);
  if (!ip) return { allow: true, reason: 'unparseable' };

  if (cfg.allowLoopback && isLoopback(rawIp)) return { allow: true, reason: 'loopback' };
  if (cfg.allowPrivate && isPrivate(rawIp)) return { allow: true, reason: 'private' };

  const safe = matchAny(rawIp, cfg.safeList);
  if (safe) return { allow: true, reason: 'safelist', matched: safe };

  if (cfg.mode === 'blacklist') {
    const hit = matchAny(rawIp, cfg.denyList);
    return hit ? { allow: false, reason: 'blacklist', matched: hit } : { allow: true, reason: 'not-blacklisted' };
  }
  if (cfg.mode === 'whitelist') {
    const hit = matchAny(rawIp, cfg.allowList);
    return hit ? { allow: true, reason: 'whitelist', matched: hit } : { allow: false, reason: 'not-whitelisted' };
  }
  return { allow: true, reason: 'disabled' };
}
