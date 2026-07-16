/**
 * i18n for @ptdl/plugin-device-kit — VN-source scheme.
 *
 * The UI strings are written in Vietnamese and USED AS THE i18n KEY. NocoBase's i18next has no
 * `fallbackLng`, so a missing translation returns the key verbatim → Vietnamese users always see
 * Vietnamese even with no vi-VN file. `../locale/en-US.json` maps each VN key → English for en users
 * (see memory reference_nocobase_i18n_fallback_to_key + build-guide §R1).
 *
 * Two translator flavours (same as custom-header / filter-tree):
 *  - `tExpr(s)` → a `{{t('…')}}` EXPRESSION string, compiled by Formily inside flow uiSchema dialogs.
 *  - `t(s)`     → a runtime-translated string via app.i18n, for React render + settings-menu titles
 *                 (menus do NOT compile `{{t()}}`, so they need the already-translated string).
 */
export const NS = '@ptdl/plugin-device-kit/client';

let _tExpr: (s: string, o?: any) => any = (s) => s;
/** Inject the schema-expression translator (app's tExpr from @nocobase/flow-engine). */
export function setTExpr(fn: (s: string, o?: any) => any): void {
  _tExpr = fn;
}
/** For flow uiSchema: returns a `{{t('…')}}` expression bound to this plugin's namespace. */
export const te = (s: string, o?: any): any => _tExpr(s, { ns: NS, ...(o || {}) });

let _t: (s: string, opts?: any) => string = (s) => s;
/** Inject the runtime translator (app.i18n.t). */
export function setRuntimeT(fn: (s: string, opts?: any) => string): void {
  _t = fn;
}
/** Runtime translator for React render strings + settings-menu titles. */
export const t = (s: string, opts?: any): string => _t(s, { ns: NS, ...(opts || {}) });
