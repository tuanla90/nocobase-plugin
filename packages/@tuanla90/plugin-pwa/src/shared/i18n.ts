/**
 * i18n helpers for @tuanla90/plugin-pwa (English-source / house-default scheme). The one previously
 * Vietnamese help string was re-keyed to English; `../locale/en-US.json` is the identity map and
 * `../locale/vi-VN.json` carries the (verbatim) Vietnamese. A missing key falls back to the key text,
 * so an incomplete locale never breaks the UI. The runtime translator is injected per-lane via
 * setRuntimeT() so this module never imports @nocobase/client (which the /v/ lane doesn't provide).
 *
 * This plugin has NO FlowEngine flow/uiSchema/model strings (it's a plain settings pane + PWA
 * manifest injector), so there is no `te()` / tExpr schema-translator here — every string is a
 * runtime React string or a settings-menu title, both routed through t().
 */
export const NS = '@tuanla90/plugin-pwa/client';

let _t: (s: string, opts?: any) => string = (s) => s;
export function setRuntimeT(fn: (s: string, opts?: any) => string): void {
  _t = fn;
}
/** Runtime translator for React render strings + settings-menu titles. */
export const t = (s: string, opts?: any): string => _t(s, opts);
