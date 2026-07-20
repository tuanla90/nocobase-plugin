/**
 * @tuanla90/plugin-ai-column — i18n plumbing shared by every lane/module of the plugin.
 *
 * Scheme (identical to @tuanla90/plugin-conditional-format): the VIETNAMESE user-facing string IS the
 * i18n key. Only `../locale/en-US.json` is shipped (VN key → English value). nb-local's i18next
 * (22.5.1) has NO fallbackLng (defaults to ['dev']), so a vi-VN lookup of a key that exists only in
 * en-US misses → 'dev' misses → i18next returns the KEY verbatim (= the Vietnamese source text),
 * still running interpolation on it. So registering ONLY en-US renders English for en-US users and
 * Vietnamese for everyone else, with zero churn to the Vietnamese source. (Verified empirically
 * against nb-local's own i18next module, incl. `{{n}}` interpolation and literal `{{field}}` tokens.)
 *
 * Two translation paths:
 *  - `te(vnKey)`  — FRAMEWORK-COMPILED strings (FlowEngine flow/step/action titles, model labels,
 *                   uiSchema `title`/`enum`/placeholder inside an x-component). Emits the
 *                   `{{t("<vn>",{ns})}}` template expression the flow-engine/uiSchema compiler
 *                   evaluates. Do NOT use for plain React render — it would show the raw expression.
 *  - `t(vnKey, opts?)` — RUNTIME React strings (placeholders, tooltips, message toasts, button text,
 *                   settings-page titles). Resolved live against the app i18n via a module-level
 *                   translator that each lane's `load()` injects with `setRuntimeT(...)`. Falls back
 *                   to the key (= Vietnamese) until injected, so it is always safe to call.
 */
import { tExpr } from '@nocobase/flow-engine';

// i18n namespace for this plugin's own labels (registered per-lane via app.i18n.addResources).
export const NS = '@tuanla90/plugin-ai-column/client';

/** Framework-compiled translator → `{{t("<vn>",{ns})}}` for uiSchema/flow/step/action titles + labels. */
export const te = (s: string) => tExpr(s, { ns: NS });

// Runtime translator for React render strings. Injected once per lane from the app i18n
// (setRuntimeT in each load()); until then it is the identity so strings render as Vietnamese.
let _t: (s: string, opts?: any) => string = (s) => s;

/** Injected in each lane's load(): `setRuntimeT((s, o) => app.i18n.t(s, { ns: NS, ...(o||{}) }))`. */
export const setRuntimeT = (fn: (s: string, opts?: any) => string): void => {
  _t = fn;
};

/** Runtime translate (with optional i18next interpolation vars, e.g. `t('… {{n}} …', { n })`). */
export const t = (s: string, opts?: any): string => {
  try {
    const out = _t(s, opts);
    return typeof out === 'string' && out ? out : s;
  } catch (_) {
    return s;
  }
};
