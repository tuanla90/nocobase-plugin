/**
 * i18n plumbing for @ptdl/plugin-formula (client lanes only — NOT imported by src/server/**).
 *
 * Scheme: VN-string-as-key. Each Vietnamese user-facing string IS the i18n key; `src/locale/en-US.json`
 * maps every VN key → its English value. nb-local's i18next sets NO fallbackLng (defaults to 'dev') and
 * uses keySeparator:false / nsSeparator:false, so a key may freely contain `.` `:` `"` and a vi-VN user
 * looking up a key that only exists under en-US simply gets the key back — i.e. the Vietnamese source.
 * Result: en-US users see English, vi-VN users keep seeing Vietnamese, and we register ONLY en-US.
 *
 * Two translation paths:
 *  - t(...)  → RUNTIME React strings (JSX text, button labels, Select options, tooltips, messages,
 *              placeholders). Backed by app.i18n.t via setRuntimeT() (called from each lane's load()).
 *  - te(...) → FRAMEWORK-COMPILED strings (FlowEngine flow/step/model titles + any title/enum/placeholder
 *              inside an x-component uiSchema literal). Emits `{{t("<vn>", { ns })}}` for the compiler.
 */
import { tExpr } from '@nocobase/flow-engine';

export const NS = '@ptdl/plugin-formula/client';

// Minimal mustache interpolation for the pre-setRuntimeT fallback (identity translator). i18next itself
// interpolates the returned key for a vi-VN miss, so `t('Đã tính {{n}} dòng', { n })` still fills in.
function interpolate(s: string, opts?: any): string {
  if (!opts) return s;
  return String(s).replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => (opts[k] != null ? String(opts[k]) : m));
}

let _t: (s: string, opts?: any) => string = (s, opts) => interpolate(s, opts);

/** Wire the real translator from a lane's load(): setRuntimeT((s, o) => app.i18n.t(s, { ns: NS, ...o })). */
export const setRuntimeT = (fn: (s: string, opts?: any) => string) => {
  _t = fn;
};

/** Runtime translator. Falls back to the key (= the Vietnamese source string) on any miss/throw. */
export function t(s: string, opts?: any): string {
  try {
    const out = _t(s, opts);
    return typeof out === 'string' && out ? out : interpolate(s, opts);
  } catch (_) {
    return interpolate(s, opts);
  }
}

/** Compiled translator for uiSchema / flow titles — resolves against this plugin's namespace. */
export const te = (s: string) => tExpr(s, { ns: NS });
