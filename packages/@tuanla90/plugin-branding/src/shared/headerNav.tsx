import React from 'react';
import { Button, Card, Input, Space, Switch, Typography, Upload, message, theme } from 'antd';
import { SegmentedGroup } from '@tuanla90/shared';
import { currentThemeUid, scopedType } from './themeScope';

/**
 * @tuanla90/plugin-branding — header / navigation tweaks. Two server-backed toggles that live under the
 * same Branding settings (config `type: 'nav'`, so they are shared across browsers/users like the skin):
 *
 *   1. Hide the TOP horizontal menu  → navigate via the left sidebar; free the header for Global Search.
 *   2. Make the LOGO clickable        → clicking the brand logo/icon opens a configurable link.
 *
 * Raw-CSS + one delegated click listener under the hood; no CSS knowledge needed in the UI. A per-field
 * "advanced" selector is exposed so a custom theme/layout that renders the menu or logo under a
 * different class can still be targeted without a code change.
 */

export type NavCfg = {
  hideTopMenu?: boolean;
  topMenuSelector?: string;
  hideHelp?: boolean; // hide the header Help/"?" dropdown (Home page / Handbook / License)
  helpSelector?: string;
  logoLink?: string;
  logoTarget?: '_self' | '_blank';
  logoSelector?: string;
  logoLight?: string; // custom logo for a LIGHT theme (URL or uploaded attachment)
  logoDark?: string; // custom logo for a DARK theme
  favicon?: string; // browser-tab icon (URL or uploaded attachment). App NAME lives in core systemSettings.
};

const STYLE_ID = 'ptdl-branding-nav';

// The horizontal menu inside the app header (pro-layout or plain layout). The LEFT sidebar menu is
// inline/vertical (not -horizontal) and lives in a sider, so it stays untouched.
export const DEFAULT_MENU_SELECTOR =
  '.ant-layout-header .ant-menu-horizontal, .ant-pro-global-header .ant-menu-horizontal, .ant-pro-global-header-menu';

// NocoBase's header Help/"?" dropdown (version · Home page · Handbook · License). The clickable trigger is
// `<span data-testid="help-button">` (stable test-id in BOTH lanes — survives version bumps far better than
// the emotion-hashed className), but it sits inside a wrapper `<div>` that is the actual flex item in the
// header. Hiding only the span leaves that wrapper + its flex gap → a hole. So we ALSO hide the wrapper via
// `:has(> …)`. The whole thing is wrapped in a forgiving `:is(…)` so a browser without `:has()` still drops
// the icon through the span arm instead of discarding the entire rule. Overridable in settings just in case.
export const DEFAULT_HELP_SELECTOR = ':is([data-testid="help-button"], :has(> [data-testid="help-button"]))';

// The brand logo/title block on the left of the header. Broad on purpose (covers pro-layout + the
// modern /v/ topbar); overridable in settings if a theme renders it elsewhere.
export const DEFAULT_LOGO_SELECTOR =
  '.ant-pro-global-header-logo, .ant-pro-top-nav-header-logo, [class*="global-header-logo"], [class*="header-logo"], [class*="topbar"] [class*="logo"]';

// ---- Runtime application --------------------------------------------------------------------------
// Logo click is delegated on `document` in the CAPTURE phase so it runs before NocoBase's own
// logo → "/" navigation (React listens on the root container, which is inside document).
let _logoLink = '';
let _logoTarget: '_self' | '_blank' = '_self';
let _logoSelector = DEFAULT_LOGO_SELECTOR;
let _logoHandlerInstalled = false;

// Which SPA a path belongs to. /admin and /v are SEPARATE react-router apps: navigating WITHIN one is
// smooth (pushState), crossing between them (or leaving the origin) needs a full load.
function spaBase(pathname: string): string | null {
  if (pathname.startsWith('/admin')) return '/admin';
  if (pathname.startsWith('/v/') || pathname === '/v') return '/v';
  return null;
}

/** Follow the configured logo link — smooth in-app nav when possible, full load only when needed. */
function followLogoLink() {
  const link = _logoLink;
  if (!link) return;
  if (_logoTarget === '_blank') {
    window.open(link, '_blank', 'noopener,noreferrer');
    return;
  }
  let url: URL;
  try {
    url = new URL(link, window.location.href); // resolves relative + absolute the same way
  } catch (e) {
    window.location.href = link;
    return;
  }
  const sameOrigin = url.origin === window.location.origin;
  const curBase = spaBase(window.location.pathname);
  const tgtBase = spaBase(url.pathname);
  if (sameOrigin && curBase && curBase === tgtBase) {
    // Same SPA → client-side navigation, no reload (the idiom used elsewhere in this repo:
    // pushState + a synthetic popstate that react-router v6 listens to).
    try {
      window.history.pushState({}, '', url.pathname + url.search + url.hash);
      window.dispatchEvent(new PopStateEvent('popstate'));
      return;
    } catch (e) {
      /* fall through to full nav */
    }
  }
  window.location.href = link; // external site or the other SPA lane → full load (expected)
}

function installLogoHandler() {
  if (_logoHandlerInstalled || typeof document === 'undefined') return;
  _logoHandlerInstalled = true;
  document.addEventListener(
    'click',
    (e) => {
      if (!_logoLink) return;
      const t = e.target as HTMLElement | null;
      if (!t || !t.closest) return;
      if (t.closest(_logoSelector)) {
        e.preventDefault();
        e.stopPropagation();
        followLogoLink();
      }
    },
    true,
  );
}

// ---- Logo override (light / dark) -----------------------------------------------------------------
// Override the app logo with a custom image, swapping between a light-theme and dark-theme file based
// on the LIVE antd theme (detected from the `--colorBgContainer` token). Core NocoBase ships one logo
// rendered theme-agnostically, so we drive the swap ourselves. Works whether the app logo is an <img>
// (override its src) or just the title text (inject an <img>, hide the text). React-safe: a light
// interval re-applies, so a re-render restoring the native src OR a theme toggle is picked up.
let _logoLight = '';
let _logoDark = '';
let _favicon = ''; // browser-tab icon; re-applied on the same interval as the logo (core re-asserts it)
let _lastDark: boolean | null = null;
let _logoTimer = 0;

function cssLuma(c: string): number | null {
  const s = (c || '').trim();
  let r = 0;
  let g = 0;
  let b = 0;
  const hex = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split('').map((x) => x + x).join('');
    r = parseInt(h.slice(0, 2), 16);
    g = parseInt(h.slice(2, 4), 16);
    b = parseInt(h.slice(4, 6), 16);
  } else {
    const m = s.match(/rgba?\(([^)]+)\)/i);
    if (!m) return null;
    const p = m[1].split(',').map((x) => parseFloat(x));
    r = p[0] || 0;
    g = p[1] || 0;
    b = p[2] || 0;
  }
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

// Dark theme = the container background is dark. Reads antd's `--colorBgContainer` (the theme-editor's
// dark algorithm sets it) — the same signal the skin builder uses.
function isDarkTheme(): boolean {
  try {
    const v =
      getComputedStyle(document.body).getPropertyValue('--colorBgContainer') ||
      getComputedStyle(document.documentElement).getPropertyValue('--colorBgContainer');
    const l = cssLuma(v);
    return l == null ? false : l < 128;
  } catch (e) {
    return false;
  }
}

function applyLogoImages(): void {
  if (typeof document === 'undefined') return;
  const dark = isDarkTheme();
  _lastDark = dark;
  const url = dark ? _logoDark || _logoLight : _logoLight || _logoDark;
  const nodes = document.querySelectorAll(_logoSelector);
  nodes.forEach((node) => {
    const el = node as HTMLElement;
    if (!url) {
      // Restore: drop our injected <img> + unhide the native logo/title.
      el.querySelectorAll('img[data-ptdl-logo]').forEach((n) => n.remove());
      el.querySelectorAll('[data-ptdl-hidden]').forEach((n) => {
        (n as HTMLElement).style.display = '';
        n.removeAttribute('data-ptdl-hidden');
      });
      return;
    }
    const native = el.querySelector('img:not([data-ptdl-logo])') as HTMLImageElement | null;
    if (native) {
      // App has a real logo <img> → just point it at our URL (keeps its native sizing).
      if (native.getAttribute('src') !== url) native.setAttribute('src', url);
      el.querySelectorAll('img[data-ptdl-logo]').forEach((n) => n.remove());
      return;
    }
    // Text-only brand → inject our own <img> and hide the title text.
    let img = el.querySelector('img[data-ptdl-logo]') as HTMLImageElement | null;
    if (!img) {
      img = document.createElement('img');
      img.setAttribute('data-ptdl-logo', '1');
      img.style.height = '28px';
      img.style.maxHeight = '100%';
      img.style.objectFit = 'contain';
      el.insertBefore(img, el.firstChild);
    }
    if (img.getAttribute('src') !== url) img.setAttribute('src', url);
    Array.from(el.children).forEach((child) => {
      const ce = child as HTMLElement;
      if (ce === img) return;
      if (!ce.hasAttribute('data-ptdl-hidden')) {
        ce.setAttribute('data-ptdl-hidden', '1');
        ce.style.display = 'none';
      }
    });
  });
}

// Re-assert both DOM-level brand tweaks (logo images + favicon link). Both are cheap: each compares
// the current value before writing, so this is a no-op unless something (a re-render / theme toggle)
// actually reverted it.
function reapplyBranding(): void {
  applyLogoImages();
  applyFavicon();
}

function ensureBrandingTimer(active: boolean): void {
  if (typeof window === 'undefined') return;
  if (active && !_logoTimer) {
    // Cheap re-apply: catches a React re-render restoring the native logo / core favicon AND a live
    // light↔dark theme toggle.
    _logoTimer = window.setInterval(reapplyBranding, 1200);
  } else if (!active && _logoTimer) {
    window.clearInterval(_logoTimer);
    _logoTimer = 0;
    reapplyBranding(); // final pass restores the native logo + default favicon
  }
}

// ---- Favicon (browser-tab icon) -------------------------------------------------------------------
// Core NocoBase has NO favicon setting and sets the tab icon at RUNTIME (there is no <link> in the
// served HTML): it injects a `<link rel="shortcut icon" href="/favicon/favicon.ico">` LATE — after
// app-info resolves (~1s in). The old code created its OWN link early and only re-asserted that one;
// when core later added a SECOND (default) link, the browser used core's and our poll was a no-op on
// our own already-custom link → the icon flashed custom then stuck on the default.
//
// Fix: (1) set the href on EVERY favicon link so whichever one the browser picks shows the custom
// icon, and (2) watch <head> with a MutationObserver so we re-apply the instant core inserts/changes
// a link — no visible flash and no dependence on the 1.2s poll. `href` is compared before any write,
// so the observer settles in one pass (our own writes don't ping-pong).
let _faviconApplied = false;
const FAVICON_SELECTOR = 'link[rel~="icon" i]'; // matches rel="icon" AND rel="shortcut icon"
const DEFAULT_FAVICON = '/favicon/favicon.ico';

function faviconLinks(): HTMLLinkElement[] {
  return Array.from(document.querySelectorAll(FAVICON_SELECTOR)) as HTMLLinkElement[];
}

function applyFavicon(): void {
  if (typeof document === 'undefined') return;
  const url = _favicon;
  const links = faviconLinks();
  if (url) {
    if (!links.length) {
      const link = document.createElement('link');
      link.setAttribute('rel', 'shortcut icon');
      link.setAttribute('data-ptdl-favicon', '1');
      link.setAttribute('href', url);
      document.head.appendChild(link);
    } else {
      // Point every existing favicon link at our URL — core may keep more than one and the browser
      // picks the last/standard one, so covering them all is the only reliable way to win.
      links.forEach((l) => { if (l.getAttribute('href') !== url) l.setAttribute('href', url); });
    }
    _faviconApplied = true;
  } else if (_faviconApplied) {
    links.forEach((l) => { if (l.getAttribute('href') !== DEFAULT_FAVICON) l.setAttribute('href', DEFAULT_FAVICON); });
    _faviconApplied = false;
  }
}

// Instant re-apply: catch core injecting/replacing a favicon <link> the moment it happens, instead of
// waiting up to 1.2s for the poll (which is what made the icon visibly flash back to default).
let _headObserver: MutationObserver | null = null;
function ensureFaviconObserver(active: boolean): void {
  if (typeof MutationObserver === 'undefined' || typeof document === 'undefined') return;
  if (active && !_headObserver) {
    _headObserver = new MutationObserver(() => { if (_favicon) applyFavicon(); });
    // childList: core adding a new <link>; attributes(href): core repointing an existing one.
    _headObserver.observe(document.head, { childList: true, subtree: true, attributes: true, attributeFilter: ['href', 'rel'] });
  } else if (!active && _headObserver) {
    _headObserver.disconnect();
    _headObserver = null;
  }
}

/** Inject/remove the hide-menu + logo-cursor CSS and refresh the logo-link target. Idempotent. */
export function applyNav(cfg: NavCfg): void {
  if (typeof document === 'undefined') return;
  const c = cfg || {};
  const rules: string[] = [];
  if (c.hideTopMenu) rules.push(`${c.topMenuSelector || DEFAULT_MENU_SELECTOR}{display:none!important}`);
  if (c.hideHelp) rules.push(`${c.helpSelector || DEFAULT_HELP_SELECTOR}{display:none!important}`);
  if (c.logoLink) rules.push(`${c.logoSelector || DEFAULT_LOGO_SELECTOR}{cursor:pointer!important}`);

  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  const css = rules.join('\n');
  if (css) {
    if (!el) {
      el = document.createElement('style');
      el.id = STYLE_ID;
      document.head.appendChild(el);
    }
    el.textContent = css;
  } else if (el) {
    el.remove();
  }

  _logoLink = c.logoLink || '';
  _logoTarget = c.logoTarget === '_blank' ? '_blank' : '_self';
  _logoSelector = c.logoSelector || DEFAULT_LOGO_SELECTOR;
  if (_logoLink) installLogoHandler();

  // Custom light/dark logo override + custom favicon. Both are DOM tweaks that core re-asserts on
  // re-render, so they share one light re-apply interval (see reapplyBranding / ensureBrandingTimer).
  _logoLight = c.logoLight || '';
  _logoDark = c.logoDark || '';
  _favicon = c.favicon || '';
  reapplyBranding();
  ensureBrandingTimer(!!(_logoLight || _logoDark || _favicon));
  ensureFaviconObserver(!!_favicon); // instant re-apply when core injects its own favicon link
}

/** Every client calls this at startup to apply the saved nav config. */
export async function loadAndApplyNav(apiClient: any): Promise<void> {
  try {
    const res = await apiClient.request({ url: 'brandingConfigs:getActive', params: { type: scopedType('nav', currentThemeUid()) } });
    const cfg = res?.data?.data?.options || res?.data?.data || {};
    applyNav(cfg);
  } catch (e) {
    /* ignore — no nav config yet */
  }
}

// ---- Settings page (plain-React lane) -------------------------------------------------------------
let _api: any = null;
let _t: (s: string) => string = (s) => s;
export function initNavUi(deps: { apiClient: any; t?: (s: string) => string }) {
  _api = deps.apiClient || _api;
  if (deps.t) _t = deps.t;
}

// One logo slot: a URL input + an Upload button (both feed the same value) + a themed preview chip.
function LogoField({
  label,
  value,
  onChange,
  onUpload,
  uploading,
  bg,
}: {
  label: string;
  value?: string;
  onChange: (v: string) => void;
  onUpload: (file: any) => void;
  uploading: boolean;
  bg: string;
}) {
  const { token } = theme.useToken();
  return (
    <div>
      <div style={{ fontSize: 12, color: token.colorTextTertiary, marginBottom: 4 }}>{label}</div>
      <Space.Compact style={{ width: '100%' }}>
        <Input value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={'https://…  /storage/…'} allowClear />
        <Upload
          beforeUpload={(f: any) => {
            onUpload(f);
            return false; // handle the upload ourselves via attachments:create
          }}
          showUploadList={false}
          accept="image/*"
        >
          <Button loading={uploading}>{_t('Upload')}</Button>
        </Upload>
      </Space.Compact>
      {value ? (
        <div
          style={{
            marginTop: 6,
            display: 'inline-flex',
            alignItems: 'center',
            height: 44,
            padding: '0 12px',
            background: bg,
            border: '1px solid #d9d9d9',
            borderRadius: 6,
          }}
        >
          <img src={value} alt="logo" style={{ maxHeight: 28, maxWidth: 180, objectFit: 'contain' }} />
        </div>
      ) : null}
    </div>
  );
}

export function BrandingHeaderPage({ scopeUid }: { scopeUid?: string } = {}): React.ReactElement {
  const { token } = theme.useToken();
  const [cfg, setCfg] = React.useState<NavCfg>({});
  const savedRef = React.useRef<NavCfg>({});
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [uploading, setUploading] = React.useState('');
  // App NAME is core `systemSettings.title` (single source of truth: tab title, login, PWA name) —
  // edited here for convenience, persisted straight to systemSettings (not into brandingConfigs).
  const [appTitle, setAppTitle] = React.useState('');
  const savedTitleRef = React.useRef('');

  React.useEffect(() => {
    let active = true;
    if (!_api?.request) {
      setLoading(false);
      return;
    }
    setLoading(true);
    _api
      .request({ url: 'brandingConfigs:getActive', params: { type: scopedType('nav', scopeUid) } })
      .then((res: any) => {
        if (!active) return;
        const o = res?.data?.data?.options || {};
        savedRef.current = o;
        setCfg(o);
      })
      .catch(() => {})
      .finally(() => active && setLoading(false));
    // App name from core systemSettings (separate source).
    _api
      .request({ url: 'systemSettings:get' })
      .then((res: any) => {
        if (!active) return;
        const tt = (res?.data?.data?.title || '').toString();
        savedTitleRef.current = tt;
        setAppTitle(tt);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [scopeUid]);

  // Live-preview on the real admin as you edit; revert to the last SAVED config on leave.
  React.useEffect(() => {
    applyNav(cfg);
  }, [cfg]);
  React.useEffect(() => {
    return () => applyNav(savedRef.current);
  }, []);
  // Preview the app name in the browser tab as you type; restore the saved title on leave.
  React.useEffect(() => {
    if (appTitle) document.title = appTitle;
  }, [appTitle]);
  React.useEffect(() => {
    return () => {
      if (savedTitleRef.current) document.title = savedTitleRef.current;
    };
  }, []);

  const set = (patch: Partial<NavCfg>) => setCfg((c) => ({ ...c, ...patch }));

  // Upload a logo file to NocoBase's attachments (same store as the core system logo) → keep its URL.
  const uploadLogo = async (file: any, which: 'logoLight' | 'logoDark' | 'favicon') => {
    if (!_api?.request) return;
    setUploading(which);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await _api.request({ url: 'attachments:create', method: 'post', data: fd });
      const url = res?.data?.data?.url;
      if (url) {
        set({ [which]: url } as Partial<NavCfg>);
        message.success(_t('Uploaded'));
      } else {
        message.error(_t('Upload failed'));
      }
    } catch (e) {
      message.error(_t('Upload failed'));
    }
    setUploading('');
  };

  const save = async () => {
    if (!_api?.request) return;
    setSaving(true);
    try {
      await _api.request({ url: 'brandingConfigs:save', method: 'post', data: { type: scopedType('nav', scopeUid), options: cfg } });
      savedRef.current = cfg;
      // App name → core systemSettings (the `put` action maps `raw_title` → `title`).
      if (appTitle !== savedTitleRef.current) {
        await _api.request({ url: 'systemSettings:put', method: 'post', data: { raw_title: appTitle } });
        savedTitleRef.current = appTitle;
      }
      message.success(_t('Saved'));
    } catch (e) {
      message.error(_t('Save failed'));
    }
    setSaving(false);
  };
  const reset = () => {
    setCfg(savedRef.current || {});
    setAppTitle(savedTitleRef.current);
  };

  if (loading) return <div style={{ padding: 24 }}>{_t('Loading…')}</div>;

  const hint: React.CSSProperties = { fontSize: 12, color: token.colorTextTertiary, margin: '2px 0 6px' };
  // These toggles live-preview instantly, which can make a change look already-applied — but it only
  // persists on Save. Flag unsaved edits so the sticky bar can nudge the user to Save (a toggle left
  // unsaved then reappears on reload).
  const dirty = JSON.stringify(cfg) !== JSON.stringify(savedRef.current) || appTitle !== savedTitleRef.current;

  return (
    <div style={{ padding: 24, maxWidth: 1440, margin: '0 auto' }}>
      <h2 style={{ marginTop: 0 }}>{_t('Header & Logo')}</h2>
      <p style={{ color: token.colorTextTertiary, marginTop: -6 }}>
        {_t('Tweak the top header: hide the horizontal menu and make the logo clickable. Saved for everyone.')}
      </p>

      {/* Masonry (CSS columns, max 2) so the varying-height cards pack tightly — no lonely rows or
          gaps under a short card, unlike a rigid grid. Each card gets break-inside:avoid below. */}
      <div style={{ columns: '360px 2', columnGap: 12 }}>
      {/* App name & favicon */}
      <Card size="small" title={_t('App name & favicon')} style={{ marginBottom: 12, breakInside: 'avoid' }}>
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <div>
            <div style={{ fontSize: 12, color: token.colorTextTertiary, marginBottom: 4 }}>{_t('App name')}</div>
            <Input value={appTitle} onChange={(e) => setAppTitle(e.target.value)} placeholder="NocoBase" allowClear />
            <p style={hint}>{_t('The system title — one value shared by the browser tab, the login page and the PWA name.')}</p>
          </div>
          <div>
            <LogoField
              label={_t('Favicon')}
              value={cfg.favicon}
              onChange={(v) => set({ favicon: v })}
              onUpload={(f) => uploadLogo(f, 'favicon')}
              uploading={uploading === 'favicon'}
              bg="#ffffff"
            />
            <p style={hint}>{_t('The small icon in the browser tab (PNG/ICO/SVG). Separate from the PWA install icon.')}</p>
          </div>
        </Space>
      </Card>

      {/* Hide top menu */}
      <Card
        size="small"
        title={
          <Space>
            <Switch checked={!!cfg.hideTopMenu} size="small" onChange={(v) => set({ hideTopMenu: v })} />
            {_t('Hide top menu')}
          </Space>
        }
        style={{ marginBottom: 12, breakInside: 'avoid' }}
      >
        {cfg.hideTopMenu ? (
          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {_t('Hide the horizontal menu on the header and navigate via the left sidebar. The freed space can hold the Global Search block.')}
            </Typography.Text>
            <Typography.Text strong style={{ fontSize: 12, marginTop: 6 }}>
              {_t('Selector (advanced)')}
            </Typography.Text>
            <Input.TextArea
              value={cfg.topMenuSelector ?? DEFAULT_MENU_SELECTOR}
              onChange={(e) => set({ topMenuSelector: e.target.value })}
              autoSize={{ minRows: 2, maxRows: 4 }}
              spellCheck={false}
              style={{ fontFamily: 'monospace', fontSize: 12 }}
            />
          </Space>
        ) : (
          <span style={{ color: token.colorTextQuaternary, fontSize: 12 }}>{_t('Off')}</span>
        )}
      </Card>

      {/* Hide help icon */}
      <Card
        size="small"
        title={
          <Space>
            <Switch checked={!!cfg.hideHelp} size="small" onChange={(v) => set({ hideHelp: v })} />
            {_t('Hide help icon')}
          </Space>
        }
        style={{ marginBottom: 12, breakInside: 'avoid' }}
      >
        {cfg.hideHelp ? (
          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {_t('Hide the “?” help dropdown (version, Home page, Handbook, License) in the top-right header.')}
            </Typography.Text>
            <Typography.Text strong style={{ fontSize: 12, marginTop: 6 }}>
              {_t('Selector (advanced)')}
            </Typography.Text>
            <Input.TextArea
              value={cfg.helpSelector ?? DEFAULT_HELP_SELECTOR}
              onChange={(e) => set({ helpSelector: e.target.value })}
              autoSize={{ minRows: 2, maxRows: 4 }}
              spellCheck={false}
              style={{ fontFamily: 'monospace', fontSize: 12 }}
            />
          </Space>
        ) : (
          <span style={{ color: token.colorTextQuaternary, fontSize: 12 }}>{_t('Off')}</span>
        )}
      </Card>

      {/* Logo link */}
      <Card size="small" title={_t('Logo link')} style={{ marginBottom: 16, breakInside: 'avoid' }}>
        <Space direction="vertical" size={6} style={{ width: '100%' }}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {_t('Open this link when the header logo is clicked. Leave empty to keep the default behaviour.')}
          </Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {_t('An in-app path (e.g. /v/… or /admin/…) navigates smoothly without reload; an external URL opens the full page.')}
          </Typography.Text>
          <Input
            value={cfg.logoLink ?? ''}
            onChange={(e) => set({ logoLink: e.target.value })}
            placeholder="/v/…  hoặc  https://example.com"
            allowClear
          />
          {cfg.logoLink ? (
            <>
              <Space align="center">
                <span style={{ fontSize: 12, color: token.colorTextTertiary }}>{_t('Open in')}</span>
                <SegmentedGroup
                  value={cfg.logoTarget || '_self'}
                  onChange={(v) => set({ logoTarget: v as any })}
                  options={[
                    { label: _t('Same tab'), value: '_self' },
                    { label: _t('New tab'), value: '_blank' },
                  ]}
                />
              </Space>
              <Typography.Text strong style={{ fontSize: 12, marginTop: 6 }}>
                {_t('Logo selector (advanced)')}
              </Typography.Text>
              <Input.TextArea
                value={cfg.logoSelector ?? DEFAULT_LOGO_SELECTOR}
                onChange={(e) => set({ logoSelector: e.target.value })}
                autoSize={{ minRows: 2, maxRows: 4 }}
                spellCheck={false}
                style={{ fontFamily: 'monospace', fontSize: 12 }}
              />
              <p style={hint}>{_t('If the click does nothing, put the CSS selector of the logo element here (find its class in DevTools).')}</p>
            </>
          ) : null}
        </Space>
      </Card>

      {/* Override logo — separate light / dark image, URL or upload */}
      <Card size="small" title={_t('Override logo')} style={{ marginBottom: 16, breakInside: 'avoid' }}>
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {_t('Replace the app logo with your own — a separate image for light and dark themes. Paste a URL or upload a file; leave both empty to keep the default logo.')}
          </Typography.Text>
          <LogoField
            label={_t('Light theme')}
            value={cfg.logoLight}
            onChange={(v) => set({ logoLight: v })}
            onUpload={(f) => uploadLogo(f, 'logoLight')}
            uploading={uploading === 'logoLight'}
            bg="#ffffff"
          />
          <LogoField
            label={_t('Dark theme')}
            value={cfg.logoDark}
            onChange={(v) => set({ logoDark: v })}
            onUpload={(f) => uploadLogo(f, 'logoDark')}
            uploading={uploading === 'logoDark'}
            bg="#1f1f1f"
          />
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {_t('If only one is set, it is used for both. The dark logo shows when the app is in a dark theme. If the logo doesn’t change, set the Logo selector above.')}
          </Typography.Text>
        </Space>
      </Card>
      </div>

      {/* Sticky action bar — always visible so a toggled setting is never left unsaved (the live preview
          can make a change look already-applied; it only persists on Save). */}
      <div
        style={{
          position: 'sticky',
          bottom: 0,
          marginTop: 16,
          padding: '12px 4px',
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          background: token.colorBgLayout,
          borderTop: `1px solid ${token.colorBorderSecondary}`,
          zIndex: 3,
        }}
      >
        <Button type="primary" loading={saving} onClick={save}>
          {_t('Save')}
        </Button>
        <Button onClick={reset} disabled={!dirty}>
          {_t('Reset')}
        </Button>
        {dirty ? (
          <Typography.Text type="warning" style={{ fontSize: 12 }}>
            ● {_t('Unsaved changes — press Save to apply')}
          </Typography.Text>
        ) : null}
      </div>
    </div>
  );
}
