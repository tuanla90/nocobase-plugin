// Single i18n namespace + runtime translator for this plugin, shared by both lanes.
// English-source plugin: keys are English; vi-VN.json holds Vietnamese, en-US.json is the identity map.
export const NS = '@tuanla90/plugin-action-enhancements/client';

let _i18n: any = null;
export function setActionEnhI18n(i18n: any) {
  if (i18n) _i18n = i18n;
}

/** Runtime translate (for React render / menu strings — NOT for `{{t()}}` uiSchema expressions). */
export function t(s: string, o?: any): string {
  try {
    return _i18n?.t ? _i18n.t(s, { ns: NS, ...(o || {}) }) : s;
  } catch (_) {
    return s;
  }
}
