/**
 * Reorder the Settings-center menu (both client lanes) into a user-defined, app-wide order.
 *
 * NocoBase orders settings entries by their `sort` (default 0; smaller = higher). There is NO
 * built-in drag-reorder. This module lets the user arrange the menu themselves and persists it
 * app-wide (server collection `ptdlSettingsMenuOrder`, one `scope='global'` row).
 *
 * Two manager shapes are handled transparently:
 *   • modern `/v/`  — `psm.menus[key].sort`  + `psm.addMenuItem(opts)` + `psm.cachedList`
 *   • classic `/admin` — `psm.settings[key].sort` + `psm.add(name, options)` + `psm.getList()` / `psm.clearCache()`
 *
 * Apply strategy (covers every load order):
 *   1) stamp `sort` onto every entry already registered before us, then
 *   2) patch `addMenuItem`/`add` once so entries registered AFTER us are stamped too.
 * The cache is cleared so the new order shows immediately.
 *
 * If the user hasn't saved a custom order yet, we fall back to PTDL_SETTINGS_ORDER — a sensible
 * theme-grouped default for the @tuanla90 pages. Edit that to change the out-of-the-box order.
 */

// Built-in default order (fallback until the user saves a custom one). addMenuItem key → sort.
export const PTDL_SETTINGS_ORDER: Record<string, number> = {
  // 🎨 Giao diện / Thương hiệu
  branding: 100, // branding
  'plugin-login': 110, // login-lite
  pwa: 120, // pwa
  'icon-remap': 130, // custom-icons
  'ptdl-conditional-format': 135, // conditional-format — global field display/formatting
  'ptdl-field-widgets': 137, // field-enhancements — global field-widget assignments
  // 🔍 Tìm kiếm & tiện ích
  'global-search': 140, // global-search
  'instant-create-page': 150, // instant-create-page
  // 🗄️ Dữ liệu & tự động hoá
  'ptdl-ai-provider': 160, // ai-column
  'ptdl-computed': 170, // formula — computed fields
  'ptdl-scancalc': 180, // formula — sequential/window
  'line-generator': 190, // line-generator
  'gsheet-sync': 200, // gsheet-sync — data import/export/sync
  'ptdl-nb-cloner': 205, // nb-cloner — whole-app export/import/clone
  'ptdl-change-log': 210, // change-log
  // 🖨️ In ấn
  'print-template': 220, // print-template
  // 🔒 Bảo mật (để cuối)
  'ptdl-ip-guard': 230, // ip-guard
};

export interface MenuEntry {
  key: string;
  title: any; // string | ReactNode — passed through to the editor for display
  sort: number;
  fixed?: boolean; // isPinned/isTopLevel core entries NocoBase renders at the top regardless of sort
}

const num = (x: any): number => {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
};

/** Turn a NocoBase i18n title template `{{t("Label", {...})}}` into just "Label" for display.
 *  Plain strings and React nodes pass through unchanged. */
function cleanTitle(title: any): any {
  if (typeof title !== 'string') return title;
  const m = title.match(/\{\{\s*t\(\s*['"]([^'"]+)['"]/);
  return m ? m[1] : title;
}

/** Read the LIVE top-level settings-menu entries from whichever manager this lane exposes.
 *  Skips sub-route entries (keys with '/' or ':') and de-dupes, so the editor lists only real
 *  menu roots — with human-readable titles. */
export function readLiveEntries(app: any): MenuEntry[] {
  const psm = app?.pluginSettingsManager;
  if (!psm) return [];
  const seen = new Set<string>();
  const out: MenuEntry[] = [];
  const add = (key: any, title: any, sort: any, fixed: any) => {
    const k = String(key || '');
    if (!k || k.indexOf('/') >= 0 || k.indexOf(':') >= 0 || seen.has(k)) return;
    seen.add(k);
    out.push({ key: k, title: cleanTitle(title != null ? title : k), sort: num(sort), fixed: !!fixed });
  };
  const pushObj = (registry: Record<string, any>) => {
    for (const [key, v] of Object.entries(registry || {})) add(key, v?.title, v?.sort, v?.isPinned);
  };
  if (psm.menus && typeof psm.menus === 'object' && !Array.isArray(psm.menus)) {
    pushObj(psm.menus); // modern /v/
  } else if (typeof psm.getList === 'function') {
    // classic /admin
    try { for (const v of psm.getList(false) || []) add(v?.key ?? v?.name, v?.title ?? v?.label, v?.sort, v?.isPinned); } catch { /* fall through */ }
  }
  if (out.length === 0 && psm.settings && typeof psm.settings === 'object') pushObj(psm.settings);
  // Fixed (pinned/top-level) entries render at the top of the real menu regardless of sort — mirror that
  // in the editor so its order matches the sidebar and those rows are shown as non-movable.
  out.sort((a, b) => (Number(!!b.fixed) - Number(!!a.fixed)) || a.sort - b.sort || String(a.key).localeCompare(String(b.key)));
  return out;
}

// ── Low-level stamping (lane-agnostic) ─────────────────────────────────────────

function stampSort(psm: any, key: string, val: number): boolean {
  if (psm?.menus && psm.menus[key]) { psm.menus[key].sort = val; return true; }
  if (psm?.settings && psm.settings[key]) { psm.settings[key].sort = val; return true; }
  // classic exposes a getter that returns the internal record
  if (typeof psm?.getSetting === 'function') {
    try { const s = psm.getSetting(key); if (s) { s.sort = val; return true; } } catch { /* ignore */ }
  }
  return false;
}

function clearCache(psm: any): void {
  try {
    if (typeof psm.clearCache === 'function') psm.clearCache();
    else if ('cachedList' in psm) psm.cachedList = {};
  } catch {
    /* not resettable — ignore */
  }
}

function patchAdd(psm: any, stampFn: (key: string) => void): void {
  // /v/ — entries registered after us via addMenuItem
  if (typeof psm.addMenuItem === 'function' && !psm.__ptdlMenuItemPatched) {
    const orig = psm.addMenuItem.bind(psm);
    psm.addMenuItem = (opts: any) => {
      const r = orig(opts);
      try { if (opts && opts.key != null) { stampFn(String(opts.key)); clearCache(psm); } } catch { /* ignore */ }
      return r;
    };
    psm.__ptdlMenuItemPatched = true;
  }
  // classic — entries registered after us via add(name, options)
  if (typeof psm.add === 'function' && !psm.__ptdlAddPatched) {
    const orig = psm.add.bind(psm);
    psm.add = (name: string, options: any) => {
      const r = orig(name, options);
      try { if (name != null) { stampFn(String(name)); clearCache(psm); } } catch { /* ignore */ }
      return r;
    };
    psm.__ptdlAddPatched = true;
  }
}

/** Stamp an explicit `key → sort` map onto the current lane's manager (idempotent). */
export function applyOrderMap(app: any, orderMap: Record<string, number>): void {
  try {
    const psm = app?.pluginSettingsManager;
    if (!psm) return;
    const stampFn = (key: string) => { if (orderMap[key] != null) stampSort(psm, key, orderMap[key]); };
    Object.keys(orderMap).forEach(stampFn);
    clearCache(psm);
    patchAdd(psm, stampFn);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[field-order] applyOrderMap failed', e);
  }
}

/** Turn an ordered list of keys into a `key → sort` map (10, 20, 30, …). */
export function orderListToMap(order: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  order.forEach((k, i) => { map[String(k)] = (i + 1) * 10; });
  return map;
}

const LS_KEY = 'ptdl:settingsMenuOrder';

function readCache(): string[] | null {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(LS_KEY) : null;
    if (!raw) return null;
    const a = JSON.parse(raw);
    return Array.isArray(a) ? a.map((x: any) => String(x)) : null;
  } catch {
    return null;
  }
}
function writeCache(order: string[]): void {
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(LS_KEY, JSON.stringify(order)); } catch { /* ignore */ }
}

/** Seed the localStorage cache (called by the editor right before it reloads, so the fresh order
 *  is applied synchronously on the next paint). */
export function cacheSettingsMenuOrder(order: string[]): void {
  writeCache(order);
}

/**
 * Apply the app-wide Settings-menu order.
 *
 * Two-phase to avoid a flash of the un-reordered menu on first paint:
 *   1) SYNC — apply from the localStorage cache (or the built-in preset) immediately at load, before
 *      the menu renders.
 *   2) ASYNC — reconcile against the server; update the cache and re-stamp only if it changed. Because
 *      Save reloads the page, the cache almost always already matches, so there is no visible reshuffle.
 *
 * Falls back to PTDL_SETTINGS_ORDER whenever no custom order is saved (or the request fails), so both
 * lanes get a sensible default order even before the user customises anything.
 */
export async function applySettingsMenuOrderFromServer(app: any, api: any): Promise<void> {
  // 1) instant apply from cache / preset
  const cached = readCache();
  applyOrderMap(app, cached && cached.length ? orderListToMap(cached) : PTDL_SETTINGS_ORDER);

  // 2) reconcile with the server
  try {
    const res = await api?.request?.({ url: 'ptdlSettingsMenuOrder:read', method: 'GET' });
    const data = res?.data?.data ?? res?.data;
    const order: string[] = Array.isArray(data?.order) ? data.order.map((x: any) => String(x)) : [];
    const serialized = JSON.stringify(order);
    if (serialized !== JSON.stringify(cached || [])) {
      writeCache(order);
      applyOrderMap(app, order.length ? orderListToMap(order) : PTDL_SETTINGS_ORDER);
    }
  } catch {
    /* offline / not saved → keep the sync-applied order */
  }
}

/**
 * Back-compat: apply a fixed order map (defaults to the preset). Kept so existing callers keep
 * working; new code should prefer applySettingsMenuOrderFromServer.
 */
export function applySettingsMenuOrder(app: any, order: Record<string, number> = PTDL_SETTINGS_ORDER): void {
  applyOrderMap(app, order);
}
