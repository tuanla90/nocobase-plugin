/**
 * Shared format helpers — canonical versions of the number/date/escape/interpolate/dot-path
 * utilities that were re-implemented across plugins (survey: number-regex 6×, date 4×, escapeHtml 3×,
 * interpolate 7×, dot-path 4×). Pure, no React/antd.
 */

// ---------------- dot-path + display-string ----------------
/** `get(obj, 'a.b.c')` — safe nested read. */
export function get(obj: any, path: string): any {
  return String(path)
    .split('.')
    .reduce((o: any, k: string) => (o == null ? o : o[k]), obj);
}

/** Object/scalar → display string (unwraps common relation shapes label/name/title/id). */
export function toDisplayString(v: any): string {
  if (v === undefined || v === null) return '';
  return String(typeof v === 'object' ? (v.label ?? v.name ?? v.title ?? v.id ?? '') : v);
}

// ---------------- HTML escape ----------------
export function escapeHtml(s: any): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---------------- number ----------------
export type NumberFormat = {
  enabled?: boolean;
  decimals?: number;
  thousandSep?: string;
  decimalSep?: string;
  prefix?: string;
  suffix?: string;
  multiplier?: number;
  compact?: boolean;
};

/** Superset number formatter (from the ECharts-pro plugin): decimals, seps, prefix/suffix, multiplier, K/M/B/T compact. */
export function makeNumberFormatter(nf: NumberFormat) {
  const decimals = Number.isFinite(nf.decimals as any) ? (nf.decimals as number) : 0;
  const thousandSep = nf.thousandSep == null ? ',' : nf.thousandSep;
  const decimalSep = nf.decimalSep == null ? '.' : nf.decimalSep;
  const prefix = nf.prefix || '';
  const suffix = nf.suffix || '';
  const multiplier = Number.isFinite(nf.multiplier as any) && nf.multiplier ? (nf.multiplier as number) : 1;
  const compact = !!nf.compact;
  const group = (s: string) => (thousandSep ? s.replace(/\B(?=(\d{3})+(?!\d))/g, thousandSep) : s);

  return (value: any): string => {
    let n = Number(value);
    if (!isFinite(n)) return value == null ? '' : String(value);
    n = n * multiplier;
    let unit = '';
    if (compact) {
      const abs = Math.abs(n);
      const units: Array<[number, string]> = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
      for (let i = 0; i < units.length; i++) {
        if (abs >= units[i][0]) { n = n / units[i][0]; unit = units[i][1]; break; }
      }
    }
    const fixed = n.toFixed(decimals);
    const parts = fixed.split('.');
    let intPart = parts[0];
    const frac = parts[1];
    const neg = intPart.charAt(0) === '-';
    if (neg) intPart = intPart.slice(1);
    const body = group(intPart) + (frac ? decimalSep + frac : '');
    return prefix + (neg ? '-' : '') + body + unit + suffix;
  };
}

/** Convenience: thousands-separated with optional fixed decimals (plain-`,`/`.` variant). */
export function formatNumber(raw: any, decimals?: number): string {
  const n = Number(raw);
  if (!isFinite(n)) return toDisplayString(raw);
  return makeNumberFormatter({ decimals: Number.isFinite(decimals as any) ? decimals : undefined })(n);
}

// ---------------- date (superset: DDDD/DDD/MMMM/MMM/D/M/hh/A/a + in-word guard) ----------------
const DAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_SHORT = MONTH_FULL.map((m) => m.substring(0, 3));

/** Format a Date/parseable value by a token pattern. Invalid → toDisplayString(raw). No dayjs. */
export function formatDate(raw: any, pattern: string): string {
  const date = raw instanceof Date ? raw : new Date(raw);
  if (isNaN(date.getTime())) return toDisplayString(raw);
  const d = date.getDate();
  const m = date.getMonth() + 1;
  const year = date.getFullYear();
  const h24 = date.getHours();
  const h12 = h24 % 12 || 12;
  const ampm = h24 >= 12 ? 'PM' : 'AM';
  const map: Record<string, string> = {
    DDDD: DAY_FULL[date.getDay()], DDD: DAY_SHORT[date.getDay()],
    DD: String(d).padStart(2, '0'), D: String(d),
    MMMM: MONTH_FULL[date.getMonth()], MMM: MONTH_SHORT[date.getMonth()],
    MM: String(m).padStart(2, '0'), M: String(m),
    YYYY: String(year), YY: String(year).slice(-2),
    HH: String(h24).padStart(2, '0'), hh: String(h12).padStart(2, '0'),
    mm: String(date.getMinutes()).padStart(2, '0'), ss: String(date.getSeconds()).padStart(2, '0'),
    A: ampm, a: ampm.toLowerCase(),
  };
  const tokens = Object.keys(map).sort((a, b) => b.length - a.length);
  const re = new RegExp(tokens.join('|'), 'g');
  return String(pattern).replace(re, (match, offset: number, str: string) => {
    const before = offset > 0 ? str[offset - 1] : '';
    const after = offset + match.length < str.length ? str[offset + match.length] : '';
    if (/[A-Za-z]/.test(before) || /[A-Za-z]/.test(after)) return match;
    return map[match] != null ? map[match] : match;
  });
}

// ---------------- pipe filters + interpolate ----------------
/** `applyFilter(v, 'date', 'DD/MM/YYYY')` etc. — the pipe-filter set from global-search's title template. */
export function applyFilter(raw: any, fname: string, farg: string): string {
  switch ((fname || '').toLowerCase()) {
    case 'date': return formatDate(raw, farg || 'DD/MM/YYYY');
    case 'datetime': return formatDate(raw, farg || 'DD/MM/YYYY HH:mm');
    case 'time': return formatDate(raw, farg || 'HH:mm');
    case 'number': case 'num': return formatNumber(raw, farg !== '' && farg != null ? parseInt(farg, 10) : undefined);
    case 'round': { const n = Number(raw); return isNaN(n) ? toDisplayString(raw) : n.toFixed(farg ? parseInt(farg, 10) : 0); }
    case 'upper': return toDisplayString(raw).toUpperCase();
    case 'lower': return toDisplayString(raw).toLowerCase();
    default: return toDisplayString(raw);
  }
}

export type InterpolateOpts = {
  /** `{{x}}` when true (default `{x}`). */
  doubleBrace?: boolean;
  /** support `{a.b.c}` dot-paths (default true). */
  dotPath?: boolean;
  /** support `{x|filter:arg}` pipe filters (default false). */
  filters?: boolean;
};

/** Fill `{token}` / `{{token}}` in a template from `scope`. Superset of the per-plugin interpolators. */
export function interpolate(tpl: string, scope: any, opts: InterpolateOpts = {}): string {
  const { doubleBrace = false, dotPath = true, filters = false } = opts;
  const re = doubleBrace ? /\{\{([^}]+)\}\}/g : /\{([^}]+)\}/g;
  const read = (k: string) => (dotPath ? get(scope, k) : scope?.[k]);
  return String(tpl).replace(re, (_m, inner) => {
    if (filters) {
      const parts = String(inner).split('|');
      let raw: any = read(parts[0].trim());
      if (parts.length === 1) return toDisplayString(raw);
      for (let i = 1; i < parts.length; i++) {
        const fp = parts[i].trim();
        const ci = fp.indexOf(':');
        const fname = ci >= 0 ? fp.slice(0, ci) : fp;
        const farg = ci >= 0 ? fp.slice(ci + 1).trim() : '';
        raw = applyFilter(raw, fname, farg);
      }
      return typeof raw === 'string' ? raw : toDisplayString(raw);
    }
    return toDisplayString(read(String(inner).trim()));
  });
}
