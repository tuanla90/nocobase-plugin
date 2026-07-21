/**
 * Theme scoping for branding — every branding surface (skin / typography / nav / logo) can differ per
 * NocoBase theme. Configs are keyed `<base>@<themeUid>`; a theme with no override falls back to the
 * global `<base>` row (server-side, in `getActive`). See THEME-AWARE-PLAN.md.
 */

// Sentinel for the settings dropdown's "Default (all themes)" entry → writes the base `<type>` row.
export const GLOBAL_SCOPE = '';

/**
 * The active theme's uid — read synchronously from the theme NocoBase caches in `localStorage`
 * (`NOCOBASE_THEME` holds the resolved per-user theme, incl. its `uid`). No request, no await; falls
 * back to the built-in `default` theme (also the pre-auth / login-page case). Because switching theme
 * reloads the page, this is always fresh at plugin-init time.
 */
export function currentThemeUid(): string {
  try {
    if (typeof localStorage !== 'undefined') {
      const t = JSON.parse(localStorage.getItem('NOCOBASE_THEME') || '{}');
      if (t && t.uid) return String(t.uid);
    }
  } catch {
    /* ignore */
  }
  return 'default';
}

// base + uid → the scoped `brandingConfigs.type`. Empty uid (GLOBAL_SCOPE) → the shared base row.
export function scopedType(base: string, uid?: string): string {
  return uid ? `${base}@${uid}` : base;
}

/**
 * Is the active theme dark? Read synchronously from the same cached `NOCOBASE_THEME` (its `config.algorithm`
 * is `theme.darkAlgorithm` for dark themes), with a dark-in-uid heuristic and a `prefers-color-scheme`
 * fallback. Used so token-derived styles (e.g. the "Auto" zebra tint) can pick a light-on-dark vs
 * dark-on-light overlay without pulling the antd token (which isn't available outside React).
 */
export function currentThemeIsDark(): boolean {
  try {
    if (typeof localStorage !== 'undefined') {
      const t = JSON.parse(localStorage.getItem('NOCOBASE_THEME') || '{}');
      const algo = JSON.stringify(t?.config?.algorithm ?? t?.algorithm ?? '');
      if (/dark/i.test(algo)) return true;
      if (/dark/i.test(String(t?.uid || ''))) return true;
      if (algo && algo !== '""') return false; // a resolved light theme → definitively light
    }
  } catch {
    /* ignore */
  }
  try {
    return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

export type ThemeInfo = { uid: string; name: string; dark: boolean; isDefault: boolean };

// Full theme list for the settings scope dropdown (async, one request; cache at the call site).
export async function listThemes(api: any): Promise<ThemeInfo[]> {
  try {
    const res = await api.request({ url: 'themeConfig:list', params: { pageSize: 50, sort: 'id' } });
    const rows = res?.data?.data || [];
    return (rows as any[]).map((t) => {
      const algo = JSON.stringify(t?.config?.algorithm || '');
      return {
        uid: t.uid,
        name: t?.config?.name || t.uid,
        dark: /dark/i.test(algo) || /dark/i.test(String(t.uid || '')),
        isDefault: !!t.default,
      };
    });
  } catch {
    return [];
  }
}
