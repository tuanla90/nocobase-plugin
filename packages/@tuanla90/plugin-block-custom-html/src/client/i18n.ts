/**
 * i18n helpers for the Custom HTML block (VN-source plugin).
 * The Vietnamese string IS the i18n key; `../locale/en-US.json` provides English.
 * NocoBase's i18next sets no `fallbackLng` (defaults to ['dev']), so a vi-VN miss
 * returns the key verbatim — Vietnamese users are unaffected, English users get en-US.
 * Runtime translator is injected per-lane via setRuntimeT() so this module never
 * imports @nocobase/client (which the /v/ app doesn't provide).
 */
import { tExpr } from '@nocobase/flow-engine';

export const NS = '@tuanla90/plugin-block-custom-html/client';

let _t: (s: string, opts?: any) => string = (s) => s;
export function setRuntimeT(fn: (s: string, opts?: any) => string): void {
  _t = fn;
}
/** Runtime translator for React render strings. */
export const t = (s: string, opts?: any): string => _t(s, opts);
/** uiSchema translator → emits a compilable {{t("...", { ns })}} expression. */
export const te = (s: string): string => tExpr(s, { ns: NS });
