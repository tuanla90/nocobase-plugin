// i18n for @ptdl/plugin-line-generator — VN-string-as-key scheme (mirrors print-template /
// conditional-format). Vietnamese IS the source AND the key; only src/locale/en-US.json exists
// (VN key → English value). nb-local's i18next has NO fallbackLng, so a vi-VN user misses en-US →
// falls back to the key text = Vietnamese. Register ONLY en-US; never create vi-VN.json.
import { tExpr } from '@nocobase/flow-engine';

export const NS = '@ptdl/plugin-line-generator/client';

// Compile-time translator: FlowEngine flow/step title, model label, uiSchema title/enum — the
// flow-settings UI compiles the returned `{{t("<vn>", { ns })}}` expression against NS.
export function te(s: string): string {
  try {
    if (typeof tExpr === 'function') return tExpr(s, { ns: NS }) as string;
  } catch (_) {
    /* fall through */
  }
  return `{{t(${JSON.stringify(s)}, { ns: ${JSON.stringify(NS)} })}}`;
}

// Runtime translator: everything rendered by React (labels, toasts, modal titles). Each lane injects
// the app i18n via setRuntimeT() in load(); until then (and for vi-VN) it falls back to the KEY = VN.
let _rt: (s: string, opts?: any) => string = (s) => s;
export function setRuntimeT(fn: (s: string, opts?: any) => string): void {
  if (typeof fn === 'function') _rt = fn;
}
export function t(s: string, opts?: any): string {
  try {
    const out = _rt(s, opts);
    return out && typeof out === 'string' ? out : s;
  } catch (_) {
    return s;
  }
}
