import { tExpr } from '@nocobase/flow-engine';

/**
 * i18n for gsheet-sync (Scheme A — Vietnamese-source).
 *
 * The Vietnamese user-facing string IS the i18n key. Only en-US.json is registered
 * (VN key -> English value); no vi-VN file is needed because nb-local's i18next sets
 * no fallbackLng -> a vi-VN miss returns the key verbatim (= the Vietnamese source).
 *
 * - `t(key, opts)`   runtime React strings -> app.i18n.t(key, { ns: NS, ...opts }),
 *                    injected once per lane via setRuntimeT() in each index.tsx load().
 *                    Falls back to the KEY (Vietnamese) until the setter runs.
 * - `te(key)`        framework-compiled strings (uiSchema/flow titles) -> `{{t("key", { ns })}}`.
 *                    Present for completeness; this plugin currently has no compiled strings.
 */
export const NS = '@ptdl/plugin-gsheet-sync/client';

let _t: (s: string, opts?: any) => string = (s) => s;

export const setRuntimeT = (fn: (s: string, opts?: any) => string) => {
  _t = fn;
};

export const t = (s: string, opts?: any): string => {
  try {
    const out = _t(s, opts);
    return out && typeof out === 'string' ? out : s;
  } catch (_) {
    return s;
  }
};

export const te = (s: string): string => tExpr(s, { ns: NS });
