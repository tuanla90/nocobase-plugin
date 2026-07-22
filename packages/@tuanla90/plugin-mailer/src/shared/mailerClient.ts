// Client-side i18n singleton for the Mailer UI. @tuanla90/shared has no i18n context of its own and the
// UI is shared across lanes, so each lane injects the app's i18n via `setI18n` in load(). `t()` falls
// back to the key (English source string) if no i18n is wired yet. Mirrors pluginHubClient / fileVaultClient.
export const NS = '@tuanla90/plugin-mailer';

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

/** URL of the mailer settings → "Sending methods" tab (Tab 1). The settings page lives ONLY in the modern
 *  client (/v/), so this always points there — reusing the current /v base if we're already inside it (e.g.
 *  the v2 send action), or defaulting to /v when linking from the classic workflow editor. Route derived
 *  from client-v2 pluginSettingsManager.getRoutePath → /admin/settings/<menuKey>/<tabKey>. */
export function mailerMethodsSettingsUrl(): string {
  try {
    const p = (typeof window !== 'undefined' && window.location && window.location.pathname) || '';
    const m = p.match(/^(.*?\/v)(?:\/|$)/); // capture an existing "…/v" base if present
    const base = m ? m[1] : '/v';
    return `${base}/admin/settings/ptdl-mailer/methods`;
  } catch {
    return '/v/admin/settings/ptdl-mailer/methods';
  }
}
