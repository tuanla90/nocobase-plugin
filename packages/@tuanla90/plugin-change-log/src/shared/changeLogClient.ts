import { ChangeLogEntry } from './types';

// i18n namespace for this plugin's client UI. Translations are registered per-lane in load() via
// `app.i18n.addResources(<lang>, NS, json)` (en-US identity + vi-VN). The ENGLISH string is the key;
// a missing key falls back to the key text, so an incomplete locale never breaks the UI.
export const NS = '@tuanla90/plugin-change-log/client';

// Schema translator for FlowEngine-compiled strings (flow / step / uiSchema titles + enum option
// labels): emits a `{{t("key", { ns })}}` expression the framework compiles at RENDER time, so they
// stay reactive to language switching (same pattern as @tuanla90/plugin-custom-header). Runtime React
// strings use t() below instead.
export const te = (s: string): string => `{{t(${JSON.stringify(s)}, { ns: ${JSON.stringify(NS)} })}}`;

// The host i18n instance, stashed once per lane in load() (reliable source of the current
// language — the window global isn't always present on the /v/ lane).
let _i18n: any = null;
export function setChangeLogI18n(i18n: any) {
  if (i18n) _i18n = i18n;
}

export function lang(): string {
  try {
    const i = _i18n || (window as any).__nocobase_i18n__;
    return String(i?.language || i?.resolvedLanguage || '').toLowerCase();
  } catch (e) {
    return '';
  }
}

// Runtime translator for React-rendered strings: routes through the host i18n (NocoBase) under this
// plugin's namespace; falls back to the English key when i18n or the translation is unavailable.
export function t(key: string): string {
  try {
    const fn = _i18n?.t;
    if (typeof fn === 'function') {
      const out = fn.call(_i18n, key, { ns: NS });
      if (typeof out === 'string' && out) return out;
    }
  } catch (e) {
    /* fall back to the English key */
  }
  return key;
}

// Translate/strip raw i18n templates like `{{t("Created at")}}` -> "Created at".
export function tr(label: any): string {
  const s = typeof label === 'string' ? label : String(label ?? '');
  const m = s.match(/^\s*\{\{\s*t\(\s*(['"`])(.*?)\1/);
  if (m) {
    try {
      const t = (window as any).__nocobase_i18n__?.t;
      const translated = typeof t === 'function' ? t(m[2]) : undefined;
      if (typeof translated === 'string' && translated) return translated;
    } catch (e) {
      /* fall back to key */
    }
    return m[2];
  }
  return s;
}

// Friendly date-time: "13/07/2026 15:00". Non-date input is returned as-is.
export function formatDateFriendly(v: any): string {
  const d = new Date(v);
  if (isNaN(d.getTime())) return String(v);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

// The collection's fields (name -> {title, interface, type, enum}) used to render snapshot values
// with their field label + a friendly value (enum -> option label, date -> friendly, else raw).
export async function fetchFields(api: any, collectionName: string): Promise<any[]> {
  try {
    const res = await api?.request?.({
      url: 'fields:list',
      params: { filter: { collectionName }, paginate: false },
    });
    return res?.data?.data || [];
  } catch (e) {
    return [];
  }
}

export function makeFieldResolvers(fields: any[]) {
  const byName = new Map<string, any>((fields || []).map((f: any) => [f.name, f]));
  const labelOf = (name: string): string => tr(byName.get(name)?.uiSchema?.title) || name;
  const valueOf = (name: string, raw: any): string => {
    if (raw === null || raw === undefined || raw === '') return '—';
    const f = byName.get(name);
    const en = f?.uiSchema?.enum;
    if (Array.isArray(en) && en.length) {
      const hit = en.find((o: any) => String(o?.value) === String(raw));
      if (hit) return tr(hit.label) || String(raw);
    }
    if (/date/i.test(f?.type || '') || (typeof raw === 'string' && ISO_RE.test(raw))) return formatDateFriendly(raw);
    if (typeof raw === 'object') {
      try {
        const s = JSON.stringify(raw);
        return s.length > 40 ? s.slice(0, 39) + '…' : s;
      } catch (e) {
        return String(raw);
      }
    }
    const s = String(raw);
    return s.length > 48 ? s.slice(0, 47) + '…' : s;
  };
  return { labelOf, valueOf };
}

// Compact relative time: "just now", "5m ago", "3h ago", "2d ago", "3w ago".
export function relativeTime(iso?: string): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (!then) return '';
  const s = Math.floor((Date.now() - then) / 1000);
  const vi = lang().startsWith('vi');
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  const w = Math.floor(d / 7);
  const mo = Math.floor(d / 30);
  const y = Math.floor(d / 365);
  if (vi) {
    if (s < 60) return 'vừa xong';
    if (m < 60) return `${m} phút trước`;
    if (h < 24) return `${h} giờ trước`;
    if (d < 7) return `${d} ngày trước`;
    if (w < 5) return `${w} tuần trước`;
    if (mo < 12) return `${mo} tháng trước`;
    return `${y} năm trước`;
  }
  if (s < 60) return 'just now';
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  if (d < 7) return `${d}d ago`;
  if (w < 5) return `${w}w ago`;
  if (mo < 12) return `${mo}mo ago`;
  return `${y}y ago`;
}

export function exactTime(iso?: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString();
  } catch (e) {
    return String(iso);
  }
}

export function initialsOf(name?: string | null): string {
  const s = String(name || '').trim();
  if (!s) return '?';
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Fetch a record's change history (newest first) through the standard collection-resource API.
export async function fetchHistory(
  api: any,
  collectionName: string,
  recordId: string | number,
  fieldName?: string,
): Promise<ChangeLogEntry[]> {
  const filter: any = { collectionName, recordId: String(recordId) };
  if (fieldName) filter.fieldName = fieldName;
  const res = await api?.request?.({
    url: 'ptdlChangeLogs:list',
    params: { filter, sort: ['-createdAt', '-id'], pageSize: 200 },
  });
  return (res?.data?.data as ChangeLogEntry[]) || [];
}

// Number of history entries for a record (for the count badge) — one lightweight request.
export async function fetchHistoryCount(
  api: any,
  collectionName: string,
  recordId: string | number,
): Promise<number> {
  try {
    const res = await api?.request?.({
      url: 'ptdlChangeLogs:list',
      params: { filter: { collectionName, recordId: String(recordId) }, pageSize: 1 },
    });
    return res?.data?.meta?.count ?? (res?.data?.data?.length || 0);
  } catch (e) {
    return 0;
  }
}

// Time spent in each distinct value: every entry's durationMs is the time the record sat in its
// `fromValue` before the change; the current (latest) value gets `now - its entry time`.
export function timeInValue(entries: ChangeLogEntry[]): Array<{ value: string; meta: any; ms: number }> {
  const buckets = new Map<string, { value: string; meta: any; ms: number }>();
  const add = (value: string | null | undefined, meta: any, ms: number) => {
    if (value === null || value === undefined || value === '') return;
    const key = String(value);
    const cur = buckets.get(key) || { value: key, meta: meta || {}, ms: 0 };
    cur.ms += Math.max(0, ms || 0);
    if (meta && !cur.meta?.label) cur.meta = meta;
    buckets.set(key, cur);
  };
  for (const e of entries) {
    if (e.durationMs) add(e.fromValue, e.fromMeta, Number(e.durationMs));
  }
  if (entries.length) {
    const latest = entries[0];
    add(latest.toValue, latest.toMeta, Date.now() - new Date(latest.createdAt).getTime());
  }
  return Array.from(buckets.values()).sort((a, b) => b.ms - a.ms);
}

// ---------------------------------------------------------------------------
// Live refresh — update open timelines right after a record mutation, no manual F5.
// A change-log row is created server-side (in the update's own transaction) whenever a tracked
// record changes, so ANY successful mutating (non-GET) API call is a signal that a timeline may
// have a new entry. We fire one debounced window event on such calls; every mounted timeline then
// re-fetches its own record. GET/HEAD are skipped so the timeline's own list can't self-loop.
// ---------------------------------------------------------------------------
export const CHANGELOG_REFRESH_EVENT = 'ptdl-changelog:refresh';

export function emitChangeLogRefresh(): void {
  try {
    window.dispatchEvent(new CustomEvent(CHANGELOG_REFRESH_EVENT));
  } catch (e) {
    /* SSR / no window */
  }
}

let _refreshTimer: any = null;
function scheduleChangeLogRefresh(): void {
  // Collapse the burst of requests a single form submit makes (update + block re-fetch + …) into one.
  if (_refreshTimer) return;
  _refreshTimer = setTimeout(() => {
    _refreshTimer = null;
    emitChangeLogRefresh();
  }, 350);
}

// Install once per api client (axios instance): fire the refresh event after any successful mutating
// request. Idempotent — safe to call from every mounted surface.
const _refreshHooked = new WeakSet<any>();
export function installChangeLogRefreshHook(api: any): void {
  try {
    const axios = api?.axios;
    if (!axios?.interceptors?.response || _refreshHooked.has(axios)) return;
    _refreshHooked.add(axios);
    axios.interceptors.response.use(
      (resp: any) => {
        try {
          const method = String(resp?.config?.method || '').toLowerCase();
          if (method && method !== 'get' && method !== 'head') scheduleChangeLogRefresh();
        } catch (e) {
          /* ignore — never let the hook break a real response */
        }
        return resp;
      },
      (err: any) => Promise.reject(err),
    );
  } catch (e) {
    /* no axios on this client → auto-refresh disabled; opening the panel still fetches fresh */
  }
}
