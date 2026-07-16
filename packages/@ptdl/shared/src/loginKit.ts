/**
 * Pure, framework-free helpers shared by @ptdl/plugin-login-lite's two client lanes
 * (classic `client/` and modern `client-v2/`). Bundled into each lane at build time.
 */

// Bundled default background (no external request) shown when no custom image is set.
export const DEFAULT_BG_GRADIENT = 'linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%)';

export const DEFAULT_POWERED_BY_HTML =
  '<div>Powered by <a href="https://www.nocobase.com/" target="_blank">NocoBase</a></div>';

export function hexToRgba(hex: string, alpha: number): string {
  if (!hex) return 'transparent';
  if (!hex.startsWith('#')) return hex;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hex.length === 4) {
    r = parseInt(hex[1] + hex[1], 16);
    g = parseInt(hex[2] + hex[2], 16);
    b = parseInt(hex[3] + hex[3], 16);
  } else if (hex.length === 7) {
    r = parseInt(hex.slice(1, 3), 16);
    g = parseInt(hex.slice(3, 5), 16);
    b = parseInt(hex.slice(5, 7), 16);
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * A leading icon drawn inside an input as a CSS `background-image` (icon-only login style).
 * `encodeURIComponent` leaves `()'` unescaped; parens break stylis' `url()` parsing when the
 * color is `rgba(...)`, so escape them too.
 */
export function svgFieldIcon(inner: string, color: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" ` +
    `stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.7">${inner}</svg>`;
  const enc = encodeURIComponent(svg).replace(/\(/g, '%28').replace(/\)/g, '%29');
  return `url("data:image/svg+xml,${enc}")`;
}

// Curated Lucide-style icon paths selectable for the username / password fields.
export const ACCOUNT_ICONS: Record<string, string> = {
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  at: '<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/>',
  id: '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M15 8h2M15 12h2M7 16h4"/>',
};
export const PASSWORD_ICONS: Record<string, string> = {
  lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/>',
};
export const accountIconPath = (k?: string): string => ACCOUNT_ICONS[k || 'user'] || ACCOUNT_ICONS.user;
export const passwordIconPath = (k?: string): string => PASSWORD_ICONS[k || 'lock'] || PASSWORD_ICONS.lock;

export type FormThemeColors = {
  inputBg: string;
  inputBorder: string;
  inputBorderHover: string;
  inputText: string;
};

/** Input-field internals for the light/dark form preset. */
export function getFormThemeColors(formTheme: string | undefined, formFontColor: string): FormThemeColors {
  const light = formTheme === 'light';
  return {
    inputBg: light ? 'rgba(0,0,0,0.04)' : 'rgba(0,0,0,0.25)',
    inputBorder: light ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.16)',
    inputBorderHover: light ? 'rgba(0,0,0,0.32)' : 'rgba(255,255,255,0.5)',
    inputText: light ? '#1f1f1f' : formFontColor,
  };
}

// ── Background gradients (selectable) ───────────────────────────────────────
export const GRADIENTS: Record<string, string> = {
  space: 'linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%)',
  midnight: 'linear-gradient(135deg, #232526 0%, #414345 100%)',
  ocean: 'linear-gradient(135deg, #2193b0 0%, #6dd5ed 100%)',
  violet: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  sunset: 'linear-gradient(135deg, #ee9ca7 0%, #ffdde1 100%)',
  aurora: 'linear-gradient(135deg, #4b6cb7 0%, #182848 100%)',
  emerald: 'linear-gradient(135deg, #134e5e 0%, #71b280 100%)',
};
export const gradientCss = (key?: string): string => GRADIENTS[key || 'space'] || GRADIENTS.space;

// ── Full theme palette (Custom / Light / Dark presets) ──────────────────────
export type ThemePalette = {
  pageBg: string; // form column / floating card background
  pageText: string; // system name + footer text
  cardBg: string; // inner sign-in form box
  cardText: string; // form text (labels, links)
  btnBg: string;
  btnText: string;
  inputBg: string;
  inputBorder: string;
  inputBorderHover: string;
  inputText: string;
};

const DARK_PALETTE: ThemePalette = {
  pageBg: '#000000',
  pageText: '#ffffff',
  cardBg: 'rgba(255,255,255,0.12)',
  cardText: '#ffffff',
  btnBg: 'rgba(255,255,255,0.2)',
  btnText: '#ffffff',
  inputBg: 'rgba(0,0,0,0.25)',
  inputBorder: 'rgba(255,255,255,0.16)',
  inputBorderHover: 'rgba(255,255,255,0.5)',
  inputText: '#ffffff',
};

const LIGHT_PALETTE: ThemePalette = {
  pageBg: '#f0f2f5',
  pageText: '#1f1f1f',
  cardBg: '#ffffff',
  cardText: '#1f1f1f',
  btnBg: '#1677ff',
  btnText: '#ffffff',
  inputBg: '#f5f5f7',
  inputBorder: 'rgba(0,0,0,0.15)',
  inputBorderHover: '#1677ff',
  inputText: '#1f1f1f',
};

type ThemeCfg = {
  formTheme?: string;
  themeColor?: string;
  fontColor?: string;
  formThemeColor?: string;
  formFontColor?: string;
  buttonBgColor?: string;
  buttonTextColor?: string;
};

/**
 * Resolve every rendered color. `light`/`dark` are full presets that override the individual
 * color pickers; `system` resolves to light/dark from the visitor's OS setting (pass `prefersDark`);
 * anything else (custom / undefined) uses the explicit picker values with the dark-glass input styling.
 */
export function resolveThemePalette(cfg: ThemeCfg, prefersDark = false): ThemePalette {
  const theme = cfg.formTheme === 'system' ? (prefersDark ? 'dark' : 'light') : cfg.formTheme;
  if (theme === 'light') return LIGHT_PALETTE;
  if (theme === 'dark') return DARK_PALETTE;
  const cardText = cfg.formFontColor || '#ffffff';
  return {
    pageBg: cfg.themeColor || '#000000',
    pageText: cfg.fontColor || '#ffffff',
    cardBg: cfg.formThemeColor || 'rgba(255,255,255,0.12)',
    cardText,
    btnBg: cfg.buttonBgColor || 'rgba(255,255,255,0.2)',
    btnText: cfg.buttonTextColor || cardText,
    inputBg: 'rgba(0,0,0,0.25)',
    inputBorder: 'rgba(255,255,255,0.16)',
    inputBorderHover: 'rgba(255,255,255,0.5)',
    inputText: cardText,
  };
}
