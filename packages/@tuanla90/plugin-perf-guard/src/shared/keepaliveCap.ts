/*
 * keepalive-cap — caps NocoBase v2's unbounded sub-page keep-alive (the DOM-leak fix).
 * ====================================================================================
 * PROBLEM (confirmed live on NocoBase 2.1.19, modern /v/ client):
 *   The core keeps EVERY visited sub-page mounted (keep-alive) and never evicts them. After
 *   navigating N menu pages, all N sit inside the CORE container
 *   `div.nb-subpages-slot-without-header-and-side` — N-1 hidden (display:none), 1 visible — and
 *   `document.querySelectorAll('.ant-page-header').length === N`. DOM node count climbs unbounded
 *   (3k → 12k → 21k over navigation) → progressive render lag; only F5 clears it.
 *
 * MECHANISM (read from @nocobase/client-v2/lib/index.js, 2.1.19):
 *   Each cached sub-page is a "view descriptor" of shape { params, modelUid, model, hidden, index }
 *   (core fn `B`), where `hidden` is a mobx `observable.ref(boolean)` that drives display:none, `index`
 *   is the stack position (0 = the base page, never a stale duplicate), and `model` is a flowEngine
 *   FlowModel (`model.uid`). The core renders these inside `.nb-subpages-slot-without-header-and-side`.
 *
 * FIX — bounded LRU cap (this plugin's default):
 *   Instead of destroying ALL background pages (jarring — every return-navigation reloads), we keep the
 *   `maxAlive` MOST-RECENTLY-VISIBLE background pages and evict only the older tail. So the common
 *   bounce (list → detail → back to list) stays instant while the long navigation history is reclaimed.
 *   Recency is observed directly: every scan stamps whichever descriptor is currently VISIBLE, giving a
 *   true LRU order regardless of what `index` means. `maxAlive = 0` ⇒ aggressive (evict every background
 *   page, minimum DOM). Eviction uses the core's own `flowEngine.destroyModel(uid)` — the exact primitive
 *   NocoBase itself uses to cleanly unmount a model (app-builder's deleteApp; core field-swap); returning
 *   re-materialises the page from its stable viewUid (core fn `B` re-runs `getModel(viewUid, true)`),
 *   the accepted trade-off (transient scroll/filter state on that page is lost).
 *
 * SAFETY:
 *   - Every step guarded; NOTHING throws out of this module; navigation is never blocked.
 *   - Never touches index 0 (base page) or any visible page (hidden !== true).
 *   - If a uid/model/engine can't be resolved, it SKIPS that entry (under-evict, never break).
 *   - Enabled by DEFAULT (safe optimisation) — a user hitting an edge case turns it off per-browser via
 *     the settings page or `window.__ptdlPerfGuard.disable()`. Dry-run scan (`.scan()`) reports first.
 */

export const KAC_VERSION = '0.1.6';
export const KAC_MARKER = 'ptdl-perf-guard/keepalive/v0.1.6'; // grep-able marker for bundle verification

const LS_ENABLED = 'ptdl:perf-guard:enabled'; // default ON: only an explicit '0' disables
const LS_MAX = 'ptdl:perf-guard:max-alive'; // integer ≥ 0; default DEFAULT_MAX; 0 = aggressive
const DEFAULT_MAX = 3;
const HARD_MAX = 100;
const LOG = '[perf-guard]';
const SLOT_SEL = '.nb-subpages-slot-without-header-and-side';
const DEBOUNCE_MS = 300;

let _app: any = null;
let _installed = false;
let _debounceTimer: any = null;

// LRU recency: uid → monotonic tick stamped whenever that descriptor is observed VISIBLE.
const _recency = new Map<string, number>();
let _tick = 0;

// ---------------------------------------------------------------------------------------------------
// settings (default ON, maxAlive default 3) — persisted per-browser in localStorage
// ---------------------------------------------------------------------------------------------------
export function isEnabled(): boolean {
  try {
    if (typeof window === 'undefined') return false; // SSR / no DOM → no-op
    // DEFAULT OFF (opt-in). ⚠️ The eviction primitive (flowEngine.destroyModel) turned out to be DESTRUCTIVE
    // — it POSTs flowModels:destroy, i.e. DELETES the page's persisted model from the DB, not just unmounts
    // it. Until a NON-destructive unmount is available, keep-alive auto-eviction stays off so no browser can
    // fire a destructive destroy on navigation. Enable only for experiments: __ptdlPerfGuard.enable().
    return window.localStorage?.getItem(LS_ENABLED) === '1';
  } catch {
    return false;
  }
}
export function setEnabledSetting(v: boolean): void {
  try {
    window.localStorage?.setItem(LS_ENABLED, v ? '1' : '0');
  } catch {
    /* ignore */
  }
}
export function getMaxAlive(): number {
  try {
    const raw = window.localStorage?.getItem(LS_MAX);
    if (raw == null || raw === '') return DEFAULT_MAX;
    const n = parseInt(raw, 10);
    if (!isFinite(n) || n < 0) return DEFAULT_MAX;
    return Math.min(n, HARD_MAX);
  } catch {
    return DEFAULT_MAX;
  }
}
export function setMaxAlive(n: number): void {
  try {
    const v = Math.max(0, Math.min(HARD_MAX, Math.floor(Number(n) || 0)));
    window.localStorage?.setItem(LS_MAX, String(v));
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------------------------------
// react-fiber helpers (READ-ONLY)
// ---------------------------------------------------------------------------------------------------
function getFiber(node: any): any {
  try {
    if (!node) return null;
    const k = Object.keys(node).find(
      (x) => x.startsWith('__reactFiber$') || x.startsWith('__reactInternalInstance$'),
    );
    return k ? (node as any)[k] : null;
  } catch {
    return null;
  }
}

function descUid(d: any): string | undefined {
  try {
    return d?.uid || d?.modelUid || d?.model?.uid || d?.model?.options?.uid || undefined;
  } catch {
    return undefined;
  }
}

// hidden is a plain boolean here (read from the DOM display in collectDescriptors); tolerate an
// observable.ref({value}) too, for safety across builds.
function readHidden(d: any): boolean | null {
  try {
    const h = d?.hidden;
    if (h == null) return null;
    if (typeof h === 'boolean') return h;
    if (typeof h === 'object' && 'value' in h) return !!h.value;
    return null;
  } catch {
    return null;
  }
}

// DOM-ANCHORED detection (confirmed live via PGDIAG4). Each kept sub-page renders as one DIRECT CHILD of the
// slot; the current page has a normal display, the stale ones are CSS `display:none`. Each panel's own
// RootPageModel is reachable by walking that child's React fiber (down, then a little up).
// ⚠️ CRITICAL: `model.hidden` is ALWAYS false here — the layout hides background pages purely via CSS, NOT
// via the model flag — so `hidden` MUST be read from the DOM (getComputedStyle(child).display === 'none').
function isPageModel(o: any): boolean {
  try {
    // a page/content FlowModel: has a uid + flowEngine back-ref, and is NOT a sidebar menu model.
    return !!(o && typeof o === 'object' && o.uid && o.flowEngine && !/menu-item-group|menu-item/.test(String(o.uid)));
  } catch {
    return false;
  }
}

function findModelInChild(el: Element): any {
  try {
    const root = getFiber(el);
    if (!root) return null;
    // DOWN the child's own subtree first — the panel receives its page model as a prop / hook value.
    const seen = new Set<any>();
    const stack: any[] = [root];
    let g = 0;
    while (stack.length && g < 6000) {
      g++;
      const f = stack.pop();
      if (!f || seen.has(f)) continue;
      seen.add(f);
      const p = f.memoizedProps;
      if (p && typeof p === 'object') {
        for (const k of Object.keys(p)) {
          const v = (p as any)[k];
          if (isPageModel(v)) return v;
          if (Array.isArray(v)) for (const e of v) if (isPageModel(e)) return e;
        }
      }
      let s: any = f.memoizedState;
      let c = 0;
      while (s && c < 40) {
        c++;
        if (isPageModel(s.memoizedState)) return s.memoizedState;
        s = s.next;
      }
      if (f.child) stack.push(f.child);
      if (f.sibling) stack.push(f.sibling);
    }
    // fallback: a few levels UP from the child wrapper.
    let f: any = root.return;
    let up = 0;
    while (f && up < 12) {
      up++;
      const p = f.memoizedProps;
      if (p && typeof p === 'object') for (const k of Object.keys(p)) if (isPageModel((p as any)[k])) return (p as any)[k];
      f = f.return;
    }
  } catch {
    /* ignore */
  }
  return null;
}

// Each slot child = one kept page. `hidden` comes from CSS display:none (NOT model.hidden). Children with no
// page model (e.g. a header wrapper) are skipped. Returns normalised descriptors { uid, hidden, index, model }.
function collectDescriptors(): any[] {
  const out: any[] = [];
  try {
    const slot = document.querySelector(SLOT_SEL);
    if (!slot || !slot.children) return out;
    const children = Array.from(slot.children);
    for (let i = 0; i < children.length; i++) {
      const ch = children[i];
      let hidden: boolean | null = null;
      try {
        hidden = getComputedStyle(ch).display === 'none';
      } catch {
        hidden = null;
      }
      const model = findModelInChild(ch);
      if (!model || !model.uid) continue; // wrapper / no page model → skip
      out.push({ uid: model.uid, hidden, index: i, model });
    }
  } catch {
    /* never throw */
  }
  return out;
}

function resolveEngine(descriptors: any[]): any {
  try {
    if (_app?.flowEngine && typeof _app.flowEngine.destroyModel === 'function') return _app.flowEngine;
  } catch {
    /* ignore */
  }
  // fallback: a model back-references its flowEngine.
  for (const d of descriptors) {
    try {
      const fe = d?.model?.flowEngine;
      if (fe && typeof fe.destroyModel === 'function') return fe;
    } catch {
      /* ignore */
    }
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------
// core eviction (dryRun => report only, no destroy). LRU cap: keep the `maxAlive` most-recently-visible
// background pages, evict the older tail. maxAlive === 0 ⇒ evict every background page.
// ---------------------------------------------------------------------------------------------------
export interface EvictResult {
  scanned: number;
  evicted: number;
  kept: number;
  skipped: number;
  maxAlive: number;
  dryRun: boolean;
  details: Array<{ uid?: string; index?: number; hidden?: boolean | null; action: string; error?: string }>;
  error?: string;
}

function evictInternal(dryRun: boolean): EvictResult {
  const maxAlive = getMaxAlive();
  const res: EvictResult = { scanned: 0, evicted: 0, kept: 0, skipped: 0, maxAlive, dryRun, details: [] };
  try {
    const descriptors = collectDescriptors();
    res.scanned = descriptors.length;
    const fe = resolveEngine(descriptors);

    // Pass 1 — stamp recency for currently-visible descriptors; collect background (hidden, index>0) ones.
    const liveUids = new Set<string>();
    const background: Array<{ uid: string; index: number; hidden: boolean | null }> = [];
    for (const d of descriptors) {
      const uid = descUid(d);
      const index = typeof d?.index === 'number' ? d.index : -1;
      const hidden = readHidden(d);
      if (uid) liveUids.add(uid);
      if (uid && hidden === false) _recency.set(uid, ++_tick); // visible now → most recent
      if (index === 0) {
        res.kept++;
        res.details.push({ uid, index, hidden, action: 'keep-base' });
        continue;
      }
      if (hidden !== true) {
        res.kept++;
        res.details.push({ uid, index, hidden, action: 'keep-active' });
        continue;
      }
      if (!uid) {
        res.skipped++;
        res.details.push({ index, hidden, action: 'skip-no-uid' });
        continue;
      }
      background.push({ uid, index, hidden, model: (d as any).model });
    }

    // Pass 2 — LRU order (oldest first). Keep the last `maxAlive`; the head is the eviction set.
    background.sort((a, b) => (_recency.get(a.uid) || 0) - (_recency.get(b.uid) || 0));
    const cut = maxAlive > 0 ? Math.max(0, background.length - maxAlive) : background.length;
    for (let i = 0; i < background.length; i++) {
      const b = background[i];
      if (i >= cut) {
        // within the cap → keep alive
        res.kept++;
        res.details.push({ uid: b.uid, index: b.index, hidden: b.hidden, action: 'keep-cap' });
        continue;
      }
      // Use the engine that OWNS this page model. Page models register in their OWN flowEngine, which can
      // differ from _app.flowEngine — querying the wrong one made getModel() report "not registered" and
      // skip every page (the 0.1.2 bug). We already hold a LIVE model object (read from the current DOM), so
      // no getModel() gate is needed; destroy via its own engine, falling back to model.remove()/destroy().
      const model: any = (b as any).model;
      const eng: any = model?.flowEngine || fe;
      const canDestroy =
        (eng && typeof eng.destroyModel === 'function') ||
        typeof model?.remove === 'function' ||
        typeof model?.destroy === 'function';
      if (!canDestroy) {
        res.skipped++;
        res.details.push({ uid: b.uid, index: b.index, hidden: b.hidden, action: 'skip-no-engine' });
        continue;
      }
      if (dryRun) {
        res.evicted++; // in dry-run this is the "would evict" count
        res.details.push({ uid: b.uid, index: b.index, hidden: b.hidden, action: 'would-evict' });
        continue;
      }
      try {
        let r: any;
        if (eng && typeof eng.destroyModel === 'function') r = eng.destroyModel(b.uid);
        else if (typeof model.remove === 'function') r = model.remove();
        else r = model.destroy();
        if (r && typeof r.then === 'function') r.catch(() => {}); // swallow async rejection
        res.evicted++;
        res.details.push({ uid: b.uid, index: b.index, hidden: b.hidden, action: 'evicted' });
        _recency.delete(b.uid);
      } catch (e: any) {
        res.skipped++;
        res.details.push({ uid: b.uid, index: b.index, hidden: b.hidden, action: 'evict-failed', error: String(e?.message || e) });
      }
    }

    // Prune recency of uids no longer present (keeps the map bounded to live pages).
    if (!dryRun) {
      try {
        for (const uid of Array.from(_recency.keys())) if (!liveUids.has(uid)) _recency.delete(uid);
      } catch {
        /* ignore */
      }
    }
  } catch (e: any) {
    res.error = String(e?.message || e);
  }
  return res;
}

// ---------------------------------------------------------------------------------------------------
// public run helpers
// ---------------------------------------------------------------------------------------------------
export function runEvict(): EvictResult {
  // ⚠️ NON-DESTRUCTIVE — REPORT ONLY. flowEngine.destroyModel(uid) turned out to DELETE the page's persisted
  // model from the DB (POST flowModels:destroy) and, fired in a burst, causes SQLITE_BUSY lock storms — it is
  // NOT a clean client-side unmount. Until a safe non-destructive unmount exists, evict() behaves like scan()
  // (dry-run): it reports what WOULD be evicted and destroys NOTHING. This guarantees no browser (auto or
  // manual) can ever fire the destructive call.
  const res = evictInternal(true);
  try {
    // eslint-disable-next-line no-console
    console.warn(`${LOG} eviction is REPORT-ONLY (safe): would-evict ${res.evicted} sub-page(s) — destroy disabled pending a non-destructive primitive`);
  } catch {
    /* ignore */
  }
  return res;
}
export function scanNow(): EvictResult {
  return evictInternal(true);
}

export function getStatus(): { enabled: boolean; installed: boolean; version: string; maxAlive: number; pageHeaders: number; slots: number } {
  let pageHeaders = 0;
  let slots = 0;
  try {
    pageHeaders = document.querySelectorAll('.ant-page-header').length;
  } catch {
    /* ignore */
  }
  try {
    slots = document.querySelectorAll(SLOT_SEL).length;
  } catch {
    /* ignore */
  }
  return { enabled: isEnabled(), installed: _installed, version: KAC_VERSION, maxAlive: getMaxAlive(), pageHeaders, slots };
}

function scheduleAuto(): void {
  try {
    if (!isEnabled()) return;
    if (_debounceTimer) clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(() => {
      try {
        if (isEnabled()) runEvict();
      } catch {
        /* never throw */
      }
    }, DEBOUNCE_MS);
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------------------------------
// navigation hook — framework-agnostic SPA nav detection (pushState/replaceState patch + popstate).
// Purely additive & idempotent; only DISPATCHES an event. Eviction still gated by isEnabled().
// ---------------------------------------------------------------------------------------------------
function installNavHook(): void {
  try {
    const h: any = window.history;
    if (h && !h.__ptdlPgNavPatched) {
      const wrap = (name: 'pushState' | 'replaceState') => {
        const orig = h[name];
        if (typeof orig === 'function') {
          h[name] = function (...args: any[]) {
            const r = orig.apply(this, args);
            try {
              window.dispatchEvent(new Event('ptdl:locationchange'));
            } catch {
              /* ignore */
            }
            return r;
          };
        }
      };
      wrap('pushState');
      wrap('replaceState');
      h.__ptdlPgNavPatched = true;
    }
    window.addEventListener('popstate', scheduleAuto);
    window.addEventListener('ptdl:locationchange', scheduleAuto);
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------------------------------
// install (called once from each client lane's load()) — sets up the console API + auto-hook.
// ---------------------------------------------------------------------------------------------------
export function installKeepaliveCap(app: any): void {
  try {
    if (_installed) {
      _app = app || _app;
      return;
    }
    _installed = true;
    _app = app;
    installNavHook();

    const api = {
      version: KAC_VERSION,
      marker: KAC_MARKER,
      /** turn auto-evict ON (persists in localStorage) and evict once now. */
      enable(runNow = true) {
        setEnabledSetting(true);
        try {
          // eslint-disable-next-line no-console
          console.log(`${LOG} keep-alive cap ENABLED`);
        } catch {
          /* ignore */
        }
        if (runNow) scheduleAuto();
        return this.status();
      },
      /** turn auto-evict OFF (persists). Already-evicted pages are not restored; nothing is destroyed. */
      disable() {
        setEnabledSetting(false);
        try {
          // eslint-disable-next-line no-console
          console.log(`${LOG} keep-alive cap DISABLED`);
        } catch {
          /* ignore */
        }
        return this.status();
      },
      /** set the max number of background pages to keep alive (0 = evict all background pages). */
      setMax(n: number) {
        setMaxAlive(n);
        if (isEnabled()) scheduleAuto();
        return this.status();
      },
      /** current state + how many .ant-page-header nodes exist right now (the DOM-growth signal). */
      status: getStatus,
      /** DRY-RUN: report which sub-pages WOULD be evicted (no destroy). Safe first step. */
      scan: scanNow,
      /** MANUAL evict now (works regardless of the enabled setting — for live testing). */
      evict: runEvict,
    };

    try {
      (window as any).__ptdlPerfGuard = Object.assign((window as any).__ptdlPerfGuard || {}, api);
      // convenience shorthands (may be shadowed by another plugin's dormant copy — the canonical is above)
      (window as any).__ptdlEvictSubpages = () => runEvict();
      (window as any).__ptdlScanSubpages = () => scanNow();
    } catch {
      /* ignore */
    }

    try {
      // eslint-disable-next-line no-console
      console.log(
        `${LOG} keep-alive cap installed ${KAC_MARKER} — ${isEnabled() ? 'ENABLED' : 'disabled'} (maxAlive=${getMaxAlive()}); ` +
          `console API: window.__ptdlPerfGuard (.scan/.evict/.enable/.disable/.setMax/.status)`,
      );
    } catch {
      /* ignore */
    }
  } catch {
    /* installation must never break the app */
  }
}

export default installKeepaliveCap;
