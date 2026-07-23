// Single i18n namespace + runtime translator, shared by both lanes.
// Vietnamese-source plugin: the KEYS are Vietnamese; en-US.json maps them to English. A vi-VN user
// (or any unsupported language, via the en-US fallback + a vi identity map wired in the lane) keeps the
// Vietnamese key text.
export const NS = '@tuanla90/plugin-my-columns/client';

let _i18n: any = null;
export function setMyColumnsI18n(i18n: any) {
  if (i18n) _i18n = i18n;
}

/** Runtime translate for React render / menu strings. */
export function t(s: string, o?: any): string {
  try {
    return _i18n?.t ? _i18n.t(s, { ns: NS, ...(o || {}) }) : s;
  } catch (_) {
    return s;
  }
}
