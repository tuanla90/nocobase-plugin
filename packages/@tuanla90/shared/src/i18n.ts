/**
 * Runtime i18n for @tuanla90/shared's own render strings (field-picker labels, etc.).
 *
 * @tuanla90/shared is BUNDLED into each plugin (not a runtime dep) and has NO i18n context of its own,
 * so it can't import `@nocobase/client`/`app.i18n`. Instead each consumer plugin INJECTS a translator
 * in its `load()` (same shape as every plugin's own `setRuntimeT`), resolved against the shared
 * namespace below. Because every plugin bundles its OWN copy of this module, `setSharedT` is a
 * per-plugin singleton — no cross-plugin interference (mirrors `setIconRegistry`).
 *
 * NS scheme = VN-string-as-key: the Vietnamese source string IS the i18next key, and only an
 * `en-US.json` map ships (see ./locale/en-US.json). nb-local's i18next has no `fallbackLng`, so a
 * vi-VN user (no resources for this NS) gets the key back = the Vietnamese text, unchanged. An en-US
 * user gets the mapped English. If no plugin injects a translator, `st()` returns the key = Vietnamese
 * exactly as before this module existed.
 */
export const SHARED_NS = '@tuanla90/shared';

// English translations for the shared render strings, keyed by the Vietnamese source string.
// Re-exported for consumers to `app.i18n.addResources('en-US', SHARED_NS, sharedEnUS)`.
import enUS from './locale/en-US.json';
export const sharedEnUS = enUS;

type SharedT = (s: string, opts?: Record<string, any>) => string;

// Injected once per plugin from its app i18n; falls back to identity (= the Vietnamese key).
let _t: SharedT = (s) => s;

/** Consumer plugins call this in `load()`: `setSharedT((s, o) => app.i18n.t(s, { ns: SHARED_NS, ...o }))`. */
export function setSharedT(fn: SharedT): void {
  if (typeof fn === 'function') _t = fn;
}

/** Translate a shared render string. Crash-safe: any failure (or non-string result) falls back to the key. */
export function st(s: string, opts?: Record<string, any>): string {
  try {
    const out = _t(s, opts);
    return out && typeof out === 'string' ? out : s;
  } catch {
    return s;
  }
}
