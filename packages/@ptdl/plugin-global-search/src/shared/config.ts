import { interpolate } from '@ptdl/shared';

export type SearchTarget = {
  /** Collection (resource) name, e.g. 'users'. */
  collection: string;
  /** Group heading shown above this collection's results. Defaults to `collection`. */
  label?: string;
  /** Text fields matched with `$includes` (OR-ed together). */
  fields: string[];
  /** Field(s) shown as the result title. One name, or several joined with " · ". Defaults to fields[0], then 'id'. */
  titleField?: string | string[];
  /** Alternative to titleField: a string template with `{field}` tokens, e.g. `{id} - {name}`. Wins over titleField. */
  titleTemplate?: string;
  /** Optional secondary line under the title. */
  descriptionField?: string;
  /** "Open full page" target in the preview drawer. `{{field}}` tokens are filled from the row. */
  link?: string;
  /** Whitelist of fields shown in the preview drawer (in order). Omit → show all scalar fields. */
  previewFields?: string[];
  /** Max rows per collection (default 5). */
  limit?: number;
};

// Kept in sync with package.json "version"; stamped onto the header pill as data-gs-version.
export const GS_VERSION = '0.9.6';

// Shortcut label — macOS shows the ⌘ glyph; Windows/Linux render it as tofu, so use "Ctrl+K".
export const IS_MAC =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad|iPod/i.test(((navigator as any).platform || navigator.userAgent) || '');
export const SHORTCUT_LABEL = IS_MAC ? '⌘K' : 'Ctrl+K';

// End-user palette/drawer strings are localized through NocoBase's app i18n (namespace
// `@ptdl/plugin-global-search/client`). Each lane entry (client / client-v2) injects a translate
// fn into createGlobalSearch()/createGlobalSearchSettings(): the English text is the i18n key and
// `src/locale/vi-VN.json` supplies the Vietnamese (a missing key falls back to the English key).
// (Previously a self-contained table keyed off the browser language lived here.)

export const LS_KEY = 'ptdl-global-search-targets';

// Guaranteed baseline so search never comes up empty even if discovery fails.
export const BASELINE_TARGETS: SearchTarget[] = [
  { collection: 'users', label: 'Users', fields: ['nickname', 'username', 'email'], titleField: 'nickname', limit: 5 },
];

/** Local (this-browser) targets fallback. Empty array = auto-discover mode. Server value wins — see loadConfig. */
function loadManualTargetsLocal(): SearchTarget[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as SearchTarget[];
    }
  } catch (e) {
    // malformed → treat as none
  }
  return [];
}

function saveTargetsLocal(targets: SearchTarget[]): void {
  localStorage.setItem(LS_KEY, JSON.stringify(targets));
}

// Fields never worth searching even if they are strings.
const FIELD_DENYLIST = new Set(['password', 'resetToken', 'token', 'appLang', 'jwt']);

// Keys hidden from the preview drawer: internal (`__*`) plus the sensitive denylist above.
export function hideInPreview(key: string): boolean {
  return key.startsWith('__') || FIELD_DENYLIST.has(key);
}

// Collection titles come as i18n templates like `{{t("Users")}}` — pull the label out.
function humanizeTitle(t: any): string | undefined {
  if (typeof t !== 'string') return undefined;
  const m = t.match(/t\(\s*["'`]([^"'`]+)["'`]\s*\)/);
  return m ? m[1] : t;
}

let _cache: SearchTarget[] | null = null;
let _cacheAt = 0;
// Re-discover at most once a minute so a newly added/removed collection shows up without a reload.
const DISCOVERY_TTL = 60_000;

/**
 * Auto-build search targets from every non-hidden collection that has string/text fields.
 * Cached for up to DISCOVERY_TTL. Falls back to BASELINE_TARGETS on any failure so search always works.
 */
export async function discoverTargets(apiClient: any): Promise<SearchTarget[]> {
  if (_cache && Date.now() - _cacheAt < DISCOVERY_TTL) return _cache;
  try {
    const res = await apiClient.resource('collections').list({ paginate: false, appends: ['fields'] });
    const cols = res?.data?.data ?? [];
    const targets: SearchTarget[] = [];
    for (const c of cols) {
      if (!c || c.hidden) continue;
      const fields = Array.isArray(c.fields) ? c.fields : [];
      const stringFields = fields
        .filter((f: any) => f && ['string', 'text'].includes(f.type) && f.interface && !FIELD_DENYLIST.has(f.name))
        .map((f: any) => f.name);
      const titleField = typeof c.titleField === 'string' ? c.titleField : undefined;
      const searchFields = Array.from(
        new Set([...(titleField && stringFields.includes(titleField) ? [titleField] : []), ...stringFields]),
      ).slice(0, 4);
      if (!searchFields.length) continue;
      targets.push({
        collection: c.name,
        label: humanizeTitle(c.title) || c.name,
        fields: searchFields,
        titleField: titleField || searchFields[0],
        limit: 5,
      });
      if (targets.length >= 25) break;
    }
    _cache = targets.length ? targets : BASELINE_TARGETS;
  } catch (e) {
    _cache = BASELINE_TARGETS;
  }
  _cacheAt = Date.now();
  return _cache;
}

export function clearDiscoveryCache(): void {
  _cache = null;
  _cacheAt = 0;
}

// ---------------------------------------------------------------------------
// "Open in view" — map each collection to a NocoBase page so a search result
// jumps to that page instead of the raw quick-view drawer.
// ---------------------------------------------------------------------------

export const LS_VIEWLINKS = 'ptdl-global-search-viewlinks';

/** collection name → target: `page:<schemaUid>` (picked page) or a raw URL/template (custom). */
export type ViewLinks = Record<string, string>;

function loadViewLinksLocal(): ViewLinks {
  try {
    const raw = localStorage.getItem(LS_VIEWLINKS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as ViewLinks;
    }
  } catch (e) {
    // malformed → none
  }
  return {};
}

function saveViewLinksLocal(links: ViewLinks): void {
  localStorage.setItem(LS_VIEWLINKS, JSON.stringify(links));
}

/** Fill `{{field}}` tokens (single-level, no dot-path) from a row — delegates to the shared engine. */
export function fillTemplate(tpl: string, row: any): string {
  return interpolate(tpl, row, { doubleBrace: true, dotPath: false });
}

/** Canonical page path (no client prefix) for a page schemaUid. */
export function pagePath(schemaUid: string): string {
  return `/admin/${schemaUid}`;
}

/**
 * Prepend the running client's prefix to a canonical `/admin/...` path. On `/v/admin/x` the prefix
 * is `/v`, on classic it's empty — so a stored `/admin/...` template works on whichever client is open.
 */
export function withClientPrefix(path: string): string {
  if (!path.startsWith('/admin')) return path;
  const cur = (typeof window !== 'undefined' && window.location.pathname) || '/admin';
  const base = (cur.split('/admin')[0] || '').replace(/\/+$/, '');
  return `${base}${path}`;
}

/**
 * Turn a detail-view URL the user copied from the browser into a reusable template:
 *  - strip the origin and any client prefix → canonical `/admin/...`
 *  - replace the record id (`/filterbytk/<id>` or `?filterbytk=<id>`) with `{{id}}`
 * A path already containing `{{…}}` is left as-is.
 * e.g. `http://host/admin/PAGE/view/BLOCK/filterbytk/123` → `/admin/PAGE/view/BLOCK/filterbytk/{{id}}`
 */
export function templatizeViewUrl(input: string): string {
  let s = (input || '').trim();
  if (!s) return s;
  try {
    const u = new URL(s, (typeof window !== 'undefined' && window.location.origin) || 'http://x');
    s = u.pathname + u.search + u.hash;
  } catch (e) {
    // not a full URL — keep as typed
  }
  const i = s.indexOf('/admin');
  if (i > 0) s = s.slice(i); // drop any client prefix before /admin
  if (!s.includes('{{')) {
    s = s.replace(/(\/filterbytk\/)([^/?#]+)/i, '$1{{id}}');
    s = s.replace(/([?&]filter[Bb]y[Tt]k=)([^&#]+)/i, '$1{{id}}');
  }
  return s;
}

/**
 * Where a clicked result should open. The per-collection map wins, then the target's own `link`.
 * Fills `{{field}}` tokens from the row; a plain page path gets `?filterByTk=<id>` appended.
 * Returns a full URL (client prefix applied) or null → caller falls back to the raw drawer.
 * Reads the preloaded shared config cache (getViewLinks), so loadConfig() must have run first.
 */
export function resolveViewUrl(collection: string, targetLink: string | undefined, row: any): string | null {
  let tpl = getViewLinks()[collection] || targetLink;
  if (!tpl) return null;
  if (tpl.startsWith('page:')) tpl = pagePath(tpl.slice(5)); // legacy stored form
  tpl = withClientPrefix(tpl);
  const id = row?.id;
  if (tpl.includes('{{')) return fillTemplate(tpl, row);
  if (id == null) return tpl;
  return `${tpl}${tpl.includes('?') ? '&' : '?'}filterByTk=${encodeURIComponent(String(id))}`;
}

export type PageInfo = { title: string; schemaUid: string };

/** List selectable `/v/` pages (page / flowPage routes that have a schema and a title). */
export async function fetchPages(apiClient: any): Promise<PageInfo[]> {
  try {
    const res = await apiClient.resource('desktopRoutes').list({ paginate: false, sort: 'sort' });
    const rows = res?.data?.data ?? [];
    return rows
      .filter((r: any) => r && (r.type === 'page' || r.type === 'flowPage') && r.schemaUid && r.title)
      .map((r: any) => ({ title: String(r.title), schemaUid: String(r.schemaUid) }));
  } catch (e) {
    return [];
  }
}

export type CollectionBrief = { name: string; title: string };

/** List non-hidden collections (name + human title) for the mapping dropdown. */
export async function fetchCollectionsBrief(apiClient: any): Promise<CollectionBrief[]> {
  try {
    const res = await apiClient.resource('collections').list({ paginate: false });
    const cols = res?.data?.data ?? [];
    return cols
      .filter((c: any) => c && !c.hidden && c.name)
      .map((c: any) => ({ name: String(c.name), title: humanizeTitle(c.title) || String(c.name) }));
  } catch (e) {
    return [];
  }
}

export type FieldOpt = { name: string; title: string };
// `fields` = text fields worth SEARCHING; `allFields` = every scalar field (incl. id) that can be
// shown as the result TITLE ("Show as").
export type CollectionFull = { name: string; title: string; fields: FieldOpt[]; allFields: FieldOpt[] };

function fieldTitle(f: any): string {
  return humanizeTitle(f?.uiSchema?.title) || humanizeTitle(f?.title) || String(f?.name || '');
}

// Relation field types don't make sense as a display title (they render as objects).
const RELATION_TYPES = new Set(['hasOne', 'hasMany', 'belongsTo', 'belongsToMany', 'belongsToArray', 'mbm']);

/**
 * Collections + their fields — powers the no-JSON "what to search" form.
 * `fields`   : string/text interface fields (the search matches these).
 * `allFields`: every non-relation scalar field, with `id` guaranteed — the "Show as" title options.
 */
export async function fetchCollectionsWithFields(apiClient: any): Promise<CollectionFull[]> {
  try {
    const res = await apiClient.resource('collections').list({ paginate: false, appends: ['fields'] });
    const cols = res?.data?.data ?? [];
    const out: CollectionFull[] = [];
    for (const c of cols) {
      if (!c || c.hidden || !c.name) continue;
      const raw = Array.isArray(c.fields) ? c.fields : [];
      const fields: FieldOpt[] = raw
        .filter((f: any) => f && ['string', 'text'].includes(f.type) && f.interface && !FIELD_DENYLIST.has(f.name))
        .map((f: any) => ({ name: String(f.name), title: fieldTitle(f) }));
      const allFields: FieldOpt[] = raw
        .filter((f: any) => f && f.name && !RELATION_TYPES.has(f.type) && !FIELD_DENYLIST.has(f.name))
        .map((f: any) => ({ name: String(f.name), title: fieldTitle(f) }));
      if (!allFields.some((f) => f.name === 'id')) allFields.unshift({ name: 'id', title: 'ID' });
      out.push({ name: String(c.name), title: humanizeTitle(c.title) || String(c.name), fields, allFields });
    }
    return out;
  } catch (e) {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Pill appearance (the header search button's look).
// ---------------------------------------------------------------------------

export const LS_APPEARANCE = 'ptdl-global-search-appearance';
export const APPEARANCE_EVENT = 'ptdl-gs-appearance';
export type Align = 'left' | 'center' | 'right';
export type Appearance = {
  width: number;
  label: string;
  showShortcut: boolean;
  align: Align;
  radius: number;
  bg: string; // custom background; '' = theme default
  fg: string; // custom text/icon color; '' = theme default
  autoIconBelow?: number; // responsive: collapse the bar to just the search icon when the window width ≤ this (px); 0 = never
};
export const DEFAULT_APPEARANCE: Appearance = {
  width: 150,
  label: 'Search',
  showShortcut: true,
  align: 'right',
  radius: 16,
  bg: '',
  fg: '',
  autoIconBelow: 820, // collapse to a search icon on narrow screens (≤ 820px) by default
};

function loadAppearanceLocal(): Appearance {
  try {
    const raw = localStorage.getItem(LS_APPEARANCE);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && typeof p === 'object') return { ...DEFAULT_APPEARANCE, ...p };
    }
  } catch (e) {
    // malformed → defaults
  }
  return DEFAULT_APPEARANCE;
}

function saveAppearanceLocal(a: Appearance): void {
  localStorage.setItem(LS_APPEARANCE, JSON.stringify(a));
}

// ---------------------------------------------------------------------------
// Shared (system-wide) config store — a `globalSearchConfig` collection owned by the server plugin
// (name → json rows: `targets`, `viewlinks`, `appearance`). Replaces the per-browser localStorage
// copies with ONE config every user sees. localStorage is kept as an OFFLINE FALLBACK: when the
// server plugin/collection isn't reachable (older server, disabled, offline) or a key was never
// saved server-side, the local value (or default) is used. Reads go through an in-memory cache
// preloaded by loadConfig() so the sync getters below stay callable at click time (resolveViewUrl,
// the header pill) without awaiting.
// ---------------------------------------------------------------------------

const CONFIG_RESOURCE = 'globalSearchConfig';

type ConfigCache = { targets: SearchTarget[]; viewLinks: ViewLinks; appearance: Appearance };
let _cfg: ConfigCache | null = null;
let _cfgPromise: Promise<ConfigCache> | null = null;

function fireConfigEvent(): void {
  try {
    window.dispatchEvent(new CustomEvent(APPEARANCE_EVENT));
  } catch (e) {
    // SSR/no-window → ignore
  }
}

// Read every config row in one request. Returns a partial map, or null when the resource is
// unreachable (collection missing / server plugin off / offline) so the caller falls back to local.
async function serverGetAll(
  apiClient: any,
): Promise<Partial<Record<'targets' | 'viewlinks' | 'appearance', any>> | null> {
  try {
    const res = await apiClient.resource(CONFIG_RESOURCE).list({ paginate: false });
    const rows = res?.data?.data ?? [];
    const out: any = {};
    for (const r of rows) if (r && r.name) out[r.name] = r.value;
    return out;
  } catch (e) {
    return null;
  }
}

// Upsert one config row by unique `name`. Uses only list/update/create so it works on any
// NocoBase 2.x without relying on the updateOrCreate action semantics. Returns false on failure.
async function serverSet(apiClient: any, name: string, value: any): Promise<boolean> {
  try {
    const res = await apiClient.resource(CONFIG_RESOURCE).list({ filter: { name }, pageSize: 1 });
    const row = res?.data?.data?.[0];
    if (row?.id != null) {
      await apiClient.resource(CONFIG_RESOURCE).update({ filterByTk: row.id, values: { value } });
    } else {
      await apiClient.resource(CONFIG_RESOURCE).create({ values: { name, value } });
    }
    return true;
  } catch (e) {
    return false;
  }
}

function normalizeAppearance(v: any): Appearance | undefined {
  return v && typeof v === 'object' ? { ...DEFAULT_APPEARANCE, ...v } : undefined;
}

/**
 * Preload the shared config into the in-memory cache exactly once (memoised on the in-flight
 * promise). Server value wins per key; a key absent server-side falls back to this browser's
 * localStorage, then the built-in default. Safe to call from multiple mounts.
 */
export function loadConfig(apiClient: any): Promise<ConfigCache> {
  if (_cfg) return Promise.resolve(_cfg);
  if (_cfgPromise) return _cfgPromise;
  _cfgPromise = (async () => {
    const server = await serverGetAll(apiClient);
    const targets = Array.isArray(server?.targets) ? (server!.targets as SearchTarget[]) : loadManualTargetsLocal();
    const viewLinks =
      server?.viewlinks && typeof server.viewlinks === 'object' && !Array.isArray(server.viewlinks)
        ? (server.viewlinks as ViewLinks)
        : loadViewLinksLocal();
    const appearance = normalizeAppearance(server?.appearance) || loadAppearanceLocal();
    _cfg = { targets, viewLinks, appearance };
    fireConfigEvent();
    return _cfg;
  })();
  return _cfgPromise;
}

/** Force the next loadConfig() to refetch from the server. */
export function clearConfigCache(): void {
  _cfg = null;
  _cfgPromise = null;
}

// Sync getters read the preloaded cache, falling back to local/default if loadConfig hasn't run yet.
export function getManualTargets(): SearchTarget[] {
  return _cfg ? _cfg.targets : loadManualTargetsLocal();
}
export function getViewLinks(): ViewLinks {
  return _cfg ? _cfg.viewLinks : loadViewLinksLocal();
}
export function getAppearance(): Appearance {
  return _cfg ? _cfg.appearance : loadAppearanceLocal();
}

// Savers write the shared server row, update the in-memory cache, mirror to localStorage (offline
// cache / next-boot speed) and notify live surfaces. Return false if the SERVER write failed (the
// local mirror still succeeded, so the admin's own browser reflects the change either way).
export async function saveTargets(apiClient: any, targets: SearchTarget[]): Promise<boolean> {
  const ok = await serverSet(apiClient, 'targets', targets);
  if (_cfg) _cfg.targets = targets;
  saveTargetsLocal(targets);
  clearDiscoveryCache();
  fireConfigEvent();
  return ok;
}
export async function saveViewLinks(apiClient: any, links: ViewLinks): Promise<boolean> {
  const ok = await serverSet(apiClient, 'viewlinks', links);
  if (_cfg) _cfg.viewLinks = links;
  saveViewLinksLocal(links);
  fireConfigEvent();
  return ok;
}
export async function saveAppearance(apiClient: any, a: Appearance): Promise<boolean> {
  const ok = await serverSet(apiClient, 'appearance', a);
  if (_cfg) _cfg.appearance = a;
  saveAppearanceLocal(a);
  fireConfigEvent();
  return ok;
}
