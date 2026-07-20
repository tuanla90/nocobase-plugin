// Standard NocoBase i18n routing for @tuanla90/plugin-status-flow (replaces the old bespoke
// English→Vietnamese map). Locale resources live in ../locale/{en-US,vi-VN,zh-CN}.json and are
// registered per lane via `app.i18n.addResources(lang, NS, json)` in each client's load().
//
// Two translators, mirroring the @tuanla90/plugin-custom-header house pattern:
//  - te():  framework-COMPILED schema strings (flow / step / model titles, uiSchema `title`,
//           Select `enum[].label`). Emits `{{t("<key>", { ns })}}`, which Formily / flow-engine
//           compile against our namespace. (Byte-identical to flow-engine's `tExpr(s, { ns })`,
//           hand-rolled here so this shared module pulls in no extra import.)
//  - tt():  RUNTIME strings rendered directly by React (JSX text, antd placeholder / okText /
//           Tooltip / Modal titles, KIND_META labels, empty states, …). Routed to `app.i18n.t`
//           via setRuntimeT(), injected per lane in load(); identity (English key) until set.
//           Named `tt` (not `t`) so it never shadows the `t` used as a loop/local variable across
//           these files (e.g. `targets.map((t) => …)`, `for (const t of …)`), matching custom-header.
export const NS = '@tuanla90/plugin-status-flow/client';

// Schema expression for framework-compiled titles/labels. A missing key falls back to the key
// text (English), so an incomplete locale never breaks the UI.
export function te(key: string): string {
  return `{{t(${JSON.stringify(key)}, ${JSON.stringify({ ns: NS })})}}`;
}

let _t: (key: string, opts?: any) => string = (key) => key;

// Called once per lane from load() with `(s, opts) => app.i18n.t(s, { ns: NS, ...opts })`.
export function setRuntimeT(fn: (key: string, opts?: any) => string) {
  if (typeof fn === 'function') _t = fn;
}

// Runtime translate. `opts` supports i18next interpolation, e.g. tt('Hello {{name}}', { name }).
export function tt(key: string, opts?: any): string {
  return _t(key, opts);
}
