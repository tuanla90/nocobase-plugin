/*
 * keepalive-cap — caps NocoBase v2's unbounded subpage keep-alive.
 * =================================================================
 * PROBLEM (confirmed live on NocoBase 2.1.19, modern /v/ client):
 *   The core keeps EVERY visited subpage mounted (keep-alive) and never evicts them. After
 *   navigating N menu pages, all N sit inside the CORE container
 *   `div.nb-subpages-slot-without-header-and-side` — N-1 hidden (display:none), 1 visible — and
 *   `document.querySelectorAll('.ant-page-header').length === N`. DOM node count climbs unbounded
 *   (3k → 12k → 21k over navigation) → progressive render lag; only F5 clears it.
 *
 * MECHANISM (read from @nocobase/client-v2/lib/index.js, 2.1.19):
 *   Each cached subpage is a "view descriptor" of shape { params, modelUid, model, hidden, index }
 *   (core fn `B`), where `hidden` is a mobx `observable.ref(boolean)` that drives display:none, `index`
 *   is the stack position (0 = the base page, never a stale duplicate), and `model` is a flowEngine
 *   FlowModel (`model.uid`). The core renders these inside `.nb-subpages-slot-without-header-and-side`.
 *
 * EVICTION (React-safe):
 *   The descriptors are NOT exposed on any public API and carry no `data-uid` in the DOM, so we read
 *   them via a READ-ONLY React-fiber walk rooted at the slot element (we only READ memoizedProps; we
 *   never mutate fiber or rip DOM nodes). For each descriptor with `index > 0` AND `hidden === true`
 *   (i.e. a kept-alive page that is NOT the base page and NOT currently visible) we call the core's own
 *   `flowEngine.destroyModel(uid)` — the exact primitive NocoBase itself uses to cleanly unmount a model
 *   (app-builder's deleteApp; core field-swap). destroyModel unmounts the React subtree via the model's
 *   own teardown; navigating back re-materialises the page from its stable viewUid (core fn `B` re-runs
 *   `getModel(viewUid, true)`), which is the accepted trade-off (transient scroll/filter state is lost).
 *
 * SAFETY:
 *   - Every step guarded; NOTHING throws out of this module; navigation is never blocked.
 *   - Never touches index 0 (base page) or any visible page (hidden !== true).
 *   - If a uid/model/engine can't be resolved, it SKIPS that entry (under-evict, never break).
 *   - Auto-eviction is OFF by default (opt-in via localStorage) — the user verifies live first with the
 *     manual `window.__ptdlEvictSubpages()` / dry-run `window.__ptdlScanSubpages()` console hooks.
 */

export const KAC_VERSION = '0.1.0';
export const KAC_MARKER = 'ptdl-keepalive-cap/v0.1.0'; // grep-able marker for bundle verification

const LS_KEY = 'ptdl:keepalive-cap:enabled';
const LOG = '[keepalive-cap]';
const SLOT_SEL = '.nb-subpages-slot-without-header-and-side';
const DEBOUNCE_MS = 300;

let _app: any = null;
let _installed = false;
let _debounceTimer: any = null;

// ---------------------------------------------------------------------------------------------------
// setting (default OFF)
// ---------------------------------------------------------------------------------------------------
function isEnabled(): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage?.getItem(LS_KEY) === '1';
  } catch {
    return false;
  }
}
function setEnabled(v: boolean): void {
  try {
    window.localStorage?.setItem(LS_KEY, v ? '1' : '0');
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
    return d?.modelUid || d?.model?.uid || d?.model?.options?.uid || undefined;
  } catch {
    return undefined;
  }
}

// A cached-subpage view descriptor looks like { params, modelUid, model:{uid}, hidden, index:number }.
function asDescriptor(obj: any): any {
  try {
    if (!obj || typeof obj !== 'object') return null;
    if (typeof obj.index !== 'number') return null;
    if (!('hidden' in obj)) return null;
    if (!descUid(obj)) return null;
    return obj;
  } catch {
    return null;
  }
}

// hidden is `observable.ref(false)` → read .value; tolerate a plain boolean too.
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

function pushCandidates(val: any, bag: any[]): void {
  try {
    if (!val || typeof val !== 'object') return;
    bag.push(val);
    if (Array.isArray(val)) {
      for (let i = 0; i < val.length && i < 200; i++) {
        const e = val[i];
        if (e && typeof e === 'object') bag.push(e);
      }
    }
  } catch {
    /* ignore */
  }
}

// Walk the fiber subtree under every slot, collecting unique view descriptors (deduped by uid).
function collectDescriptors(): any[] {
  const out: any[] = [];
  try {
    const seenFiber = new Set<any>();
    const seenUid = new Set<string>();
    let slots: Element[] = [];
    try {
      slots = Array.from(document.querySelectorAll(SLOT_SEL));
    } catch {
      return out;
    }
    for (const slot of slots) {
      const root = getFiber(slot);
      if (!root) continue;
      // Stay within the slot's subtree: seed with root.child (root's own sibling escapes the subtree).
      const stack: any[] = [];
      if (root.child) stack.push(root.child);
      let guard = 0;
      while (stack.length && guard < 40000) {
        guard++;
        const f = stack.pop();
        if (!f || seenFiber.has(f)) continue;
        seenFiber.add(f);
        const props = f.memoizedProps;
        if (props && typeof props === 'object') {
          const bag: any[] = [];
          bag.push(props);
          try {
            for (const key of Object.keys(props)) pushCandidates((props as any)[key], bag);
          } catch {
            /* ignore */
          }
          for (const c of bag) {
            const d = asDescriptor(c);
            if (d) {
              const uid = descUid(d)!;
              if (!seenUid.has(uid)) {
                seenUid.add(uid);
                out.push(d);
              }
            }
          }
        }
        if (f.child) stack.push(f.child);
        if (f.sibling) stack.push(f.sibling);
      }
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
// core eviction (dryRun => report only, no destroy)
// ---------------------------------------------------------------------------------------------------
export interface EvictResult {
  scanned: number;
  evicted: number;
  kept: number;
  skipped: number;
  dryRun: boolean;
  details: Array<{ uid?: string; index?: number; hidden?: boolean | null; action: string; error?: string }>;
  error?: string;
}

function evictInternal(dryRun: boolean): EvictResult {
  const res: EvictResult = { scanned: 0, evicted: 0, kept: 0, skipped: 0, dryRun, details: [] };
  try {
    const descriptors = collectDescriptors();
    res.scanned = descriptors.length;
    const fe = resolveEngine(descriptors);
    for (const d of descriptors) {
      let uid: string | undefined;
      try {
        uid = descUid(d);
      } catch {
        /* ignore */
      }
      const index = typeof d?.index === 'number' ? d.index : -1;
      const hidden = readHidden(d);

      // Never evict the base page or a page whose hidden-state we can't confirm as true.
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
      if (!fe) {
        res.skipped++;
        res.details.push({ uid, index, hidden, action: 'skip-no-engine' });
        continue;
      }
      // Only destroy a model that is still registered.
      let registered = true;
      try {
        if (typeof fe.getModel === 'function') registered = !!fe.getModel(uid);
      } catch {
        /* if getModel is unavailable, fall through and let destroyModel guard itself */
      }
      if (!registered) {
        res.skipped++;
        res.details.push({ uid, index, hidden, action: 'skip-not-registered' });
        continue;
      }

      if (dryRun) {
        res.evicted++; // in dry-run this is the "would evict" count
        res.details.push({ uid, index, hidden, action: 'would-evict' });
        continue;
      }

      try {
        const r = fe.destroyModel(uid);
        if (r && typeof r.then === 'function') r.catch(() => {}); // swallow async rejection
        res.evicted++;
        res.details.push({ uid, index, hidden, action: 'evicted' });
      } catch (e: any) {
        res.skipped++;
        res.details.push({ uid, index, hidden, action: 'evict-failed', error: String(e?.message || e) });
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
function runEvict(): EvictResult {
  const res = evictInternal(false);
  try {
    if (res.evicted > 0) {
      // eslint-disable-next-line no-console
      console.log(`${LOG} evicted ${res.evicted} stale subpage(s)` + (res.kept ? ` (kept ${res.kept})` : ''));
    }
  } catch {
    /* ignore */
  }
  return res;
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
    if (h && !h.__ptdlKacPatched) {
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
      h.__ptdlKacPatched = true;
    }
    window.addEventListener('popstate', scheduleAuto);
    window.addEventListener('ptdl:locationchange', scheduleAuto);
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------------------------------
// install (called once from the /v/ client load()) — sets up the console API + auto-hook.
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
        setEnabled(true);
        try {
          // eslint-disable-next-line no-console
          console.log(`${LOG} enabled — auto-evict ON`);
        } catch {
          /* ignore */
        }
        if (runNow) scheduleAuto();
        return this.status();
      },
      /** turn auto-evict OFF (persists). Already-evicted pages are not restored; nothing is destroyed. */
      disable() {
        setEnabled(false);
        try {
          // eslint-disable-next-line no-console
          console.log(`${LOG} disabled — auto-evict OFF`);
        } catch {
          /* ignore */
        }
        return this.status();
      },
      /** current state + how many .ant-page-header nodes exist right now (the DOM-growth signal). */
      status() {
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
        return { enabled: isEnabled(), installed: _installed, version: KAC_VERSION, pageHeaders, slots };
      },
      /** DRY-RUN: report which subpages WOULD be evicted (no destroy). Safe first step. */
      scan(): EvictResult {
        return evictInternal(true);
      },
      /** MANUAL evict now (works regardless of the enabled setting — for live testing). */
      evict(): EvictResult {
        return runEvict();
      },
    };

    try {
      (window as any).__ptdlKeepaliveCap = api;
      (window as any).__ptdlEvictSubpages = () => runEvict();
      (window as any).__ptdlScanSubpages = () => evictInternal(true);
    } catch {
      /* ignore */
    }

    try {
      // eslint-disable-next-line no-console
      console.log(
        `${LOG} installed ${KAC_MARKER} — ${isEnabled() ? 'ENABLED' : 'disabled (default)'}; ` +
          `console API: window.__ptdlKeepaliveCap (.scan/.evict/.enable/.disable/.status)`,
      );
    } catch {
      /* ignore */
    }
  } catch {
    /* installation must never break the app */
  }
}

export default installKeepaliveCap;
