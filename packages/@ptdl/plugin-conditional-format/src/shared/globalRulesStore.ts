/**
 * GLOBAL (field-level) conditional-format rules — "set once per collection, applies in every view".
 *
 * Storage: collection `ptdlFieldFormatRules` (one row per data-source + collection), loaded once into
 * `globalCache` at client startup and read SYNCHRONOUSLY during render (table onCell / detail-list value
 * render). Written via `ptdlFieldFormatRules:updateOrCreate`. Same blueprint as custom-header's
 * `ptdlFieldStyles`, but the payload is the whole rule array (Rule[] JSON, identical shape to a block's
 * `ptdlCondRules`) so the existing engine (styleForCell/iconForCell) + editor are reused verbatim.
 *
 * Rules are kept opaque here (`any[]`) — this module only stores/serves them; the engine lives in
 * tableRulesModel.
 */

// key = `${dataSource}.${collectionName}` → Rule[]
const globalCache = new Map<string, any[]>();

// Bumped on every cache mutation. Views that want to react to another surface's save can read it; the
// table block re-renders via setProps on its own save, so this is mainly a hook for future use.
let version = 0;
const listeners = new Set<() => void>();
export function globalRulesVersion(): number {
  return version;
}
export function onGlobalRulesChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function bump() {
  version++;
  for (const cb of listeners) {
    try {
      cb();
    } catch (_) {
      /* ignore */
    }
  }
}

function keyOf(dataSourceKey?: string, collectionName?: string): string | undefined {
  if (!collectionName) return undefined;
  return `${dataSourceKey || 'main'}.${collectionName}`;
}

/** The global rule array for a collection (empty array if none). Safe to call every render. */
export function globalRulesFor(dataSourceKey?: string, collectionName?: string): any[] {
  const k = keyOf(dataSourceKey, collectionName);
  return (k && globalCache.get(k)) || [];
}

/** Whether a saved global row exists for this collection (used to preload the block dialog toggle). */
export function hasGlobalRulesRow(dataSourceKey?: string, collectionName?: string): boolean {
  const k = keyOf(dataSourceKey, collectionName);
  return !!(k && globalCache.get(k)?.length);
}

/** Every collection that currently has global rules (for the settings page discovery list). */
export function allGlobalRuleCollections(): { dataSource: string; collection: string; count: number }[] {
  const out: { dataSource: string; collection: string; count: number }[] = [];
  for (const [k, rules] of globalCache) {
    const dot = k.indexOf('.');
    if (dot < 0) continue;
    out.push({ dataSource: k.slice(0, dot), collection: k.slice(dot + 1), count: rules?.length || 0 });
  }
  return out;
}

/** Populate the cache from the server. Call (awaited) in each lane's plugin load(). */
export async function loadGlobalRulesCache(api: any): Promise<void> {
  if (!api?.request) return;
  try {
    const res = await api.request({ url: 'ptdlFieldFormatRules:list', params: { pageSize: 1000 } });
    const rows = res?.data?.data || [];
    const total = res?.data?.meta?.count;
    if (typeof total === 'number' && total > rows.length) {
      // eslint-disable-next-line no-console
      console.warn(
        `[cond-fmt] global-rules cache truncated: loaded ${rows.length}/${total} rows (pageSize cap 1000).`,
      );
    }
    globalCache.clear();
    for (const r of rows) {
      const k = keyOf(r.dataSource, r.collectionName);
      const rules = Array.isArray(r.rules) ? r.rules : [];
      if (k && rules.length) globalCache.set(k, rules);
    }
    bump();
    // eslint-disable-next-line no-console
    console.log('[cond-fmt] global-rules cache loaded:', globalCache.size);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[cond-fmt] load global-rules cache failed (table may be new/empty)', e);
  }
}

/** Upsert (or clear) the global rules for a collection, then refresh the local cache. */
export async function upsertGlobalRules(
  api: any,
  dataSourceKey: string | undefined,
  collectionName: string | undefined,
  rules: any[],
): Promise<void> {
  if (!api?.request || !collectionName) return;
  const ds = dataSourceKey || 'main';
  const clean = Array.isArray(rules) ? rules : [];
  await api.request({
    url: 'ptdlFieldFormatRules:updateOrCreate',
    method: 'post',
    params: { filterKeys: ['dataSource', 'collectionName'] },
    data: { dataSource: ds, collectionName, rules: clean },
  });
  // Reflect immediately in this session's cache (other sessions pick it up on tab re-focus).
  const k = keyOf(ds, collectionName)!;
  if (clean.length) globalCache.set(k, clean);
  else globalCache.delete(k);
  bump();
}

// Cross-session freshness: the cache loads once at startup; if ANOTHER session edits a global rule,
// re-fetch on tab re-focus (throttled) so later renders pick it up. Views already on screen only refresh
// on their NEXT re-render (navigate away/back, or re-open the block) — there is no global force-render.
let _autoRefreshBound = false;
export function bindGlobalRulesAutoRefresh(api: any): void {
  if (_autoRefreshBound || typeof document === 'undefined' || !api?.request) return;
  _autoRefreshBound = true;
  let last = 0;
  const onVisible = () => {
    if (document.visibilityState !== 'visible') return;
    const now = Date.now();
    if (now - last < 10000) return; // throttle to once / 10s
    last = now;
    loadGlobalRulesCache(api);
  };
  try {
    document.addEventListener('visibilitychange', onVisible);
  } catch (_) {
    /* ignore */
  }
}
