// i18n for @ptdl/plugin-print-template — VN-string-as-key scheme (mirrors
// @ptdl/plugin-conditional-format). Vietnamese IS the source AND the i18n key; only
// `src/locale/en-US.json` exists (VN key → English value). nb-local's i18next has NO
// fallbackLng, so a vi-VN user misses en-US → falls back to the key text = Vietnamese.
// Registering ONLY en-US is correct — never create vi-VN.json.
import { tExpr } from '@nocobase/flow-engine';

// This plugin's own i18n namespace (registered per-lane via app.i18n.addResources).
export const NS = '@ptdl/plugin-print-template/client';

// ---- Compile-time translator (framework-compiled strings) --------------------------------------
// For FlowEngine flow/step `title`, model `label`, and uiSchema `title`/`enum`/placeholder —
// the flow-settings UI compiles the returned `{{t("<vn>", { ns })}}` expression against NS.
// Prefer flow-engine's tExpr; hand-roll the same expression if it's ever unavailable.
export function te(s: string): string {
  try {
    if (typeof tExpr === 'function') return tExpr(s, { ns: NS }) as string;
  } catch (_) {
    /* fall through to the hand-rolled form */
  }
  return `{{t(${JSON.stringify(s)}, { ns: ${JSON.stringify(NS)} })}}`;
}

// ---- Runtime translator (React render strings) -------------------------------------------------
// For everything rendered by React at runtime (labels, placeholders, toasts, modal titles,
// GrapesJS editor chrome, thrown-error messages surfaced via message.error). Each lane injects
// the app i18n via setRuntimeT() in load(); until then (and for vi-VN) it falls back to the KEY,
// which IS the Vietnamese source — so the UI renders Vietnamese exactly as before.
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
