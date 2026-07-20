/**
 * Client-side i18n singleton for the NB Cloner UI. @tuanla90/shared has no i18n context of its own and the
 * pane is shared by both client lanes, so each lane injects the app's i18n via `setI18n` in load().
 * `t()` falls back to the key (English source string) when no i18n is wired yet. Mirrors
 * plugin-ip-guard's `ipGuardClient`.
 */
export const NS = '@tuanla90/plugin-nb-cloner';

let _i18n: any = null;

export function setI18n(i18n: any) {
  _i18n = i18n;
}

export function t(s: string, opts?: Record<string, any>): string {
  try {
    if (!_i18n) return s;
    const out = _i18n.t(s, { ns: NS, ...(opts || {}) });
    return typeof out === 'string' && out ? out : s;
  } catch {
    return s;
  }
}
