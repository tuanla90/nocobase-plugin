/**
 * Per-user column-layout store (client).
 *
 * The current user's rows are loaded ONCE into `cache` (keyed by the block's tableUid) at startup and
 * read synchronously inside the patched `TableBlockModel.getColumns`. Writes go through the debounced
 * `persist()` → `ptdlUserColumns:set`. Everything here is this session's user only — the server scopes by
 * session userId, so the cache can never hold another user's data.
 */

export type Pin = 'left' | 'right';
export interface MyColSettings {
  hidden?: string[];
  order?: string[];
  widths?: Record<string, number>;
  pinned?: Record<string, Pin>;
}

// tableUid (block uid) → settings
const cache = new Map<string, MyColSettings>();
let _loaded = false;

export function isLoaded(): boolean {
  return _loaded;
}

/** Coerce arbitrary JSON into a well-formed settings object. */
export function normalize(raw: any): MyColSettings {
  const s: MyColSettings = {};
  if (!raw || typeof raw !== 'object') return s;
  if (Array.isArray(raw.hidden)) s.hidden = raw.hidden.map(String);
  if (Array.isArray(raw.order)) s.order = raw.order.map(String);
  if (raw.widths && typeof raw.widths === 'object') {
    const w: Record<string, number> = {};
    for (const k of Object.keys(raw.widths)) {
      const n = Number(raw.widths[k]);
      if (Number.isFinite(n) && n > 0) w[k] = Math.round(n);
    }
    s.widths = w;
  }
  if (raw.pinned && typeof raw.pinned === 'object') {
    const p: Record<string, Pin> = {};
    for (const k of Object.keys(raw.pinned)) {
      const v = raw.pinned[k];
      if (v === 'left' || v === 'right') p[k] = v;
    }
    s.pinned = p;
  }
  return s;
}

/** True when the settings actually change anything (else the transform can be skipped entirely). */
export function isEmpty(s?: MyColSettings): boolean {
  if (!s) return true;
  return (
    (!s.hidden || !s.hidden.length) &&
    (!s.order || !s.order.length) &&
    (!s.widths || !Object.keys(s.widths).length) &&
    (!s.pinned || !Object.keys(s.pinned).length)
  );
}

export function getSettings(tableUid?: string): MyColSettings | undefined {
  if (!tableUid) return undefined;
  return cache.get(tableUid);
}

/** Update the in-memory cache immediately (so the next getColumns re-run reflects the change). */
export function putLocal(tableUid: string, settings: MyColSettings): void {
  if (!tableUid) return;
  cache.set(tableUid, normalize(settings));
}

export function clearLocal(tableUid: string): void {
  if (tableUid) cache.delete(tableUid);
}

/** Load the current user's rows into the cache. Fire-and-forget; safe to call again (refresh). */
export async function loadMineCache(api: any): Promise<string[]> {
  const changed: string[] = [];
  if (!api?.request) return changed;
  try {
    const res = await api.request({ url: 'ptdlUserColumns:mine', method: 'get' });
    const rows = res?.data?.data || [];
    cache.clear();
    for (const r of rows) {
      const uid = r && r.tableUid ? String(r.tableUid) : '';
      if (!uid) continue;
      const s = normalize(r.settings);
      if (!isEmpty(s)) {
        cache.set(uid, s);
        changed.push(uid);
      }
    }
    _loaded = true;
    // eslint-disable-next-line no-console
    console.log('[my-columns] per-user cache loaded:', cache.size);
  } catch (e) {
    _loaded = true; // treat as "loaded, empty" so we do not block forever
    // eslint-disable-next-line no-console
    console.warn('[my-columns] load per-user cache failed (table may be new/empty)', e);
  }
  return changed;
}

// ── Debounced persistence (~400ms per tableUid) ──────────────────────────────────────────────────
const timers = new Map<string, any>();

/** Update the cache locally (instant) + debounce-persist to the server. */
export function persist(api: any, tableUid: string, settings: MyColSettings): void {
  if (!tableUid) return;
  putLocal(tableUid, settings);
  if (!api?.request) return;
  const prev = timers.get(tableUid);
  if (prev) clearTimeout(prev);
  const timer = setTimeout(() => {
    timers.delete(tableUid);
    const snapshot = cache.get(tableUid) || {};
    api
      .request({ url: 'ptdlUserColumns:set', method: 'post', data: { tableUid, settings: snapshot } })
      .catch((e: any) => {
        // eslint-disable-next-line no-console
        console.warn('[my-columns] persist failed', e);
      });
  }, 400);
  timers.set(tableUid, timer);
}

/** Clear this user's settings for a block (revert to the shared default) — persisted immediately. */
export function reset(api: any, tableUid: string): Promise<void> {
  clearLocal(tableUid);
  const prev = timers.get(tableUid);
  if (prev) {
    clearTimeout(prev);
    timers.delete(tableUid);
  }
  if (!api?.request) return Promise.resolve();
  return api
    .request({ url: 'ptdlUserColumns:set', method: 'post', data: { tableUid, settings: {} } })
    .then(() => undefined)
    .catch((e: any) => {
      // eslint-disable-next-line no-console
      console.warn('[my-columns] reset failed', e);
    });
}
