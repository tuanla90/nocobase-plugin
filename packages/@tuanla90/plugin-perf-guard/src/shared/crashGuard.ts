/*
 * crash-guard — isolates a broken column's `beforeRender` so it can't freeze the whole /v/ app.
 * ============================================================================================
 * PROBLEM (confirmed live on NocoBase 2.1.19, modern /v/ client):
 *   A malformed relation (missing reverse belongsTo / mismatched FK — exactly what app-builder ≤0.6.31
 *   could leave behind) yields a COLUMN whose `collectionField` can't resolve. Core then runs that
 *   column's `beforeRender` flow → a step's `defaultParams` calls `getDefaultBindingByField(ctx, undefined)`,
 *   which reads `.interface` on `undefined` → TypeError. Because core applies ALL sub-models through one
 *   SHARED `Promise.all` (FlowModel.applySubModelsBeforeRenderFlows), that single rejection propagates to
 *   the parent block's render flow and RENDER-LOOPS the whole app ("đơ luôn" — freeze).
 *
 * FIX — global beforeRender isolation:
 *   subtable-pro already isolates this for SUB-TABLES (it patches SubTableFieldModel.prototype). This
 *   generalises the same guard to the BASE `FlowModel.prototype`, so ANY block (Table / Details / Form /
 *   sub-table) with one unresolvable column degrades that column to an empty cell (its own ErrorBoundary
 *   handles the cell) instead of freezing everything. We can't patch core's `getDefaultBindingByField`,
 *   so we re-implement core's loop with a per-sub-model try/catch.
 *
 * HOW we reach FlowModel.prototype:
 *   `FlowModel` isn't a named export we can import, and the method may be shadowed on subclasses (e.g.
 *   subtable-pro's own copy). So we start from several registered core model classes and walk the
 *   prototype chain, keeping the TOPMOST prototype that OWNS `applySubModelsBeforeRenderFlows` — that is
 *   FlowModel.prototype regardless of any subclass override. Patching there covers every model that does
 *   not define its own copy; subclasses that do (subtable-pro) keep their own — both isolate, no conflict.
 *
 * SAFETY:
 *   - Idempotent (a flag on the patched prototype); never throws at install time.
 *   - Preserves the original as a fallback: if the isolated loop itself fails, it calls core unchanged.
 *   - One retry on a later tick in case core models aren't registered yet when this runs.
 */

export const CRASH_GUARD_MARKER = 'ptdl-perf-guard/crashguard/v0.1.0';
const LOG = '[perf-guard]';
const METHOD = 'applySubModelsBeforeRenderFlows';
// Core model classes to seed the prototype-chain walk (any one that inherits the method suffices).
const SEED_CLASSES = [
  'TableBlockModel',
  'DetailsBlockModel',
  'FormBlockModel',
  'SubTableFieldModel',
  'BlockModel',
  'FlowModel',
];

/** Walk the instance-prototype chain of `cls`, returning the HIGHEST prototype that OWNS `method`. */
function findBaseProtoOwningMethod(cls: any, method: string): any {
  try {
    let proto = cls?.prototype;
    let found: any = null;
    let guard = 0;
    while (proto && proto !== Object.prototype && guard < 50) {
      guard++;
      if (Object.prototype.hasOwnProperty.call(proto, method)) found = proto; // keep climbing → topmost wins
      proto = Object.getPrototypeOf(proto);
    }
    return found;
  } catch {
    return null;
  }
}

function resolveFlowEngine(feOrApp: any): any {
  try {
    if (feOrApp?.getModelClass) return feOrApp; // already a flowEngine
    return feOrApp?.flowEngine || feOrApp?.app?.flowEngine || null;
  } catch {
    return null;
  }
}

function tryInstall(feOrApp: any): boolean {
  const fe = resolveFlowEngine(feOrApp);
  if (!fe || typeof fe.getModelClass !== 'function') return false;

  let proto: any = null;
  for (const name of SEED_CLASSES) {
    try {
      const Cls = fe.getModelClass(name);
      const p = findBaseProtoOwningMethod(Cls, METHOD);
      if (p) {
        proto = p;
        break;
      }
    } catch {
      /* try next seed */
    }
  }
  if (!proto) return false; // core models not registered yet → caller may retry
  if (proto.__ptdlBeforeRenderIsolated) return true; // already patched (idempotent)
  if (typeof proto[METHOD] !== 'function') return true; // nothing to wrap; treat as done

  const orig = proto[METHOD];
  proto[METHOD] = async function (...args: any[]) {
    const subKey = args[0];
    const inputArgs = args[1];
    try {
      // Re-implement core's loop but ISOLATE each sub-model so one unresolvable column can't reject the
      // shared Promise.all (core: `Promise.all(mapSubModels(k, s => s.dispatchEvent('beforeRender')))`).
      if (typeof this.mapSubModels !== 'function') return await orig.apply(this, args);
      await Promise.all(
        (this.mapSubModels(subKey, async (sub: any) => {
          try {
            await sub.dispatchEvent('beforeRender', inputArgs);
          } catch (e) {
            // eslint-disable-next-line no-console
            console.warn(`${LOG} crash-guard: sub-model beforeRender skipped (unresolvable field / broken relation)`, subKey, e);
          }
        }) as any[]),
      );
    } catch (e) {
      // Last-resort: never let this method reject (that is what froze the app). Fall back to core.
      // eslint-disable-next-line no-console
      console.warn(`${LOG} crash-guard: isolated beforeRender loop failed — falling back to core`, e);
      return orig.apply(this, args);
    }
  };
  proto.__ptdlBeforeRenderIsolated = true;
  try {
    // eslint-disable-next-line no-console
    console.log(`${LOG} crash-guard installed ${CRASH_GUARD_MARKER} (global beforeRender isolation)`);
  } catch {
    /* ignore */
  }
  return true;
}

/**
 * Install the global crash-guard. Accepts a flowEngine, an app, or the plugin instance. Fully guarded;
 * retries once on a later tick if core model classes aren't registered yet.
 */
export function installCrashGuard(feOrApp: any): void {
  try {
    if (tryInstall(feOrApp)) return;
    // Retry once shortly after — covers the (rare) case where this runs before core models register.
    setTimeout(() => {
      try {
        if (!tryInstall(feOrApp)) {
          // eslint-disable-next-line no-console
          console.warn(`${LOG} crash-guard: base FlowModel prototype not found (skipped)`);
        }
      } catch {
        /* ignore */
      }
    }, 0);
  } catch (e) {
    try {
      // eslint-disable-next-line no-console
      console.warn(`${LOG} crash-guard install failed (ignored)`, e);
    } catch {
      /* ignore */
    }
  }
}

export default installCrashGuard;
