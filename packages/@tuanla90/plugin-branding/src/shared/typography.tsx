import React from 'react';
import { Button, Card, ColorPicker, Divider, Input, Slider, Space, Switch, Tooltip, message, theme } from 'antd';
import { COLOR_PRESETS, colorToString, SegmentedGroup } from '@tuanla90/shared';
import { currentThemeUid, currentThemeIsDark, scopedType } from './themeScope';

/**
 * @tuanla90/plugin-branding — Typography & Tables. A second server-backed config (`type: 'typography'`)
 * that (1) loads a Google Fonts stylesheet + applies its family app-wide (keeping code editors
 * monospace) and (2) styles every antd table (header colours, font-size, borders, zebra, hover).
 * `buildTypographyCss` → a global stylesheet `injectTypographyCss` writes to <head>; the Google font
 * link is a separate <link> managed by `injectFontLink`. Every client calls loadAndApplyTypography at
 * startup. Same live-preview + Save pattern as the skin builder — no CSS knowledge needed in the UI.
 */

export type TableCfg = {
  fontSize?: number; // 0 / undefined = leave antd default
  headBg?: string;
  headText?: string;
  headWeight?: number; // 0 / undefined = default
  headSplit?: string; // colour of the header column-divider lines (th::before / bordered border). Alpha ok — a transparent value hides them.
  border?: string;
  rowHover?: string;
  zebra?: string; // even-row background (a fixed colour)
  zebraAuto?: boolean; // derive the zebra tint from the theme instead of `zebra` (adapts to light/dark)
  compact?: boolean;
};

// The "Auto" zebra: a translucent overlay that sits on top of the row's own (opaque) background, so it
// reads correctly in both light and dark without knowing the exact token colour. Lightens on dark,
// darkens on light — mirrors antd's own `colorFillQuaternary` feel.
export const AUTO_ZEBRA_DARK = 'rgba(255,255,255,0.05)';
export const AUTO_ZEBRA_LIGHT = 'rgba(0,0,0,0.022)';
export function autoZebraColor(isDark: boolean): string {
  return isDark ? AUTO_ZEBRA_DARK : AUTO_ZEBRA_LIGHT;
}
export type TypographyCfg = {
  fontUrl?: string; // Google Fonts stylesheet URL (or a pasted <link>/@import)
  fontFamily?: string; // family name to apply, e.g. 'Inter'
  antialias?: boolean;
  table?: TableCfg;
};

const CSS_ID = 'ptdl-branding-typography';
const LINK_ID = 'ptdl-branding-font-link';

// The reference fallback stacks the user gave — a clean system-sans tail after the chosen family,
// and a monospace stack kept for code editors so the global font change never breaks them.
const SANS_FALLBACK = `'Inter','Segoe UI',-apple-system,BlinkMacSystemFont,Roboto,'Helvetica Neue',Arial,sans-serif`;
const MONO_STACK = `'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace`;

// Default to Inter (the reference font) — pre-fills the settings input so a fresh config starts on Inter.
export const INTER_URL = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap';
export const DEFAULT_TYPOGRAPHY: TypographyCfg = {
  fontUrl: INTER_URL,
  fontFamily: 'Inter',
  antialias: true,
  table: { fontSize: 0, headWeight: 0 },
};

// Accept a bare URL, a pasted `<link ... href="...">`, or `@import url('...')` — return the href.
export function extractFontHref(input?: string): string {
  if (!input) return '';
  const s = String(input).trim();
  const href = s.match(/href\s*=\s*["']([^"']+)["']/i);
  if (href) return href[1];
  const imp = s.match(/@import\s+(?:url\()?["']?([^"')]+)["']?\)?/i);
  if (imp) return imp[1];
  if (/^https?:\/\//i.test(s)) return s.split(/\s/)[0];
  return '';
}

// Parse the first family out of a Google Fonts URL (`...family=Inter:wght@...` → `Inter`) so we can
// prefill the family field when the user only pastes the link.
export function familyFromUrl(url?: string): string {
  const href = extractFontHref(url);
  const m = href.match(/[?&]family=([^:&]+)/i);
  if (!m) return '';
  return decodeURIComponent(m[1].replace(/\+/g, ' ')).trim();
}

function quoteFamily(fam: string): string {
  const clean = fam.replace(/['"]/g, '').trim();
  return /\s/.test(clean) ? `'${clean}'` : clean;
}

// Zebra rule that does NOT clobber the selected/hover row highlight (excludes those states so antd's
// own highlight wins), and skips the summary/measure row (only `.ant-table-row` data rows striped).
// `translucent` (the Auto tint) additionally skips fixed columns — a semi-transparent fill on a sticky
// cell would let the horizontally-scrolled body show through.
function zebraRule(color: string, translucent: boolean): string {
  const sel =
    '.ant-table-tbody>tr.ant-table-row:nth-child(2n):not(.ant-table-row-selected):not(:hover)>td' +
    (translucent ? ':not(.ant-table-cell-fix-left):not(.ant-table-cell-fix-right)' : '');
  return `${sel}{background:${color}!important}`;
}

// TypographyCfg → global CSS. Targets antd's semantic classes; `!important` beats antd's own tokens.
// `isDark` (defaults to the active theme) resolves the "Auto" zebra tint. Kept optional so existing
// callers/tests keep working.
export function buildTypographyCss(cfg: TypographyCfg, isDark: boolean = false): string {
  if (!cfg || typeof cfg !== 'object') return '';
  const p: string[] = [];
  const fam = (cfg.fontFamily || '').trim();
  if (fam) {
    const q = quoteFamily(fam);
    // Base UI font everywhere (matches the reference `*` rule)…
    p.push(`*{font-family:${q},${SANS_FALLBACK}!important}`);
    // …but keep code editors + inline code monospace (more specific → wins over the `*` rule).
    p.push(`.monaco-editor,.monaco-editor *,.cm-editor,.cm-editor *,code,kbd,pre,samp{font-family:${MONO_STACK}!important}`);
    if (cfg.antialias !== false) p.push(`body{-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}`);
  }
  const tb = cfg.table || {};
  if (typeof tb.fontSize === 'number' && tb.fontSize > 0) p.push(`.ant-table{font-size:${tb.fontSize}px}`);
  const th: string[] = [];
  if (tb.headBg) th.push(`background:${tb.headBg}!important`);
  if (tb.headText) th.push(`color:${tb.headText}!important`);
  if (tb.headWeight) th.push(`font-weight:${tb.headWeight}!important`);
  if (tb.border) th.push(`border-bottom:1px solid ${tb.border}!important`);
  // Header column-divider on BORDERED tables = the header cell's inline-end border. Recolour it here
  // (bundled into the `th` block so it rides the SAME dual-specificity emit below): skin's in-card
  // `.ant-card .ant-table-thead>tr>th{border-color:…!important}` (0,2,2) — border-color sets
  // border-inline-end-color in LTR — would otherwise clobber a plain (0,1,2) rule inside cards, so the
  // (0,3,2) in-card selector is needed here too. Harmless no-op when the table has no header border.
  if (tb.headSplit) th.push(`border-inline-end-color:${tb.headSplit}!important`);
  if (th.length) {
    const decl = th.join(';');
    // Emit the header styles at TWO specificities so the user's Fill/Text/Border win everywhere:
    //   • out-of-card tables → the plain semantic selector (specificity 0,1,2).
    //   • in-card tables → a higher-specificity selector (0,3,2). The admin-skin builder, when a card
    //     gradient is on, emits `.ant-card .ant-table-thead>tr>th{background:transparent;color:…}` at
    //     (0,2,2); since BOTH rules are !important, its higher specificity used to override the user's
    //     header Fill/Text (font-weight survived because skin never sets it). Adding `.ant-table-wrapper`
    //     (antd's outer table wrapper — always an ancestor of `.ant-table-thead`) lifts us to (0,3,2) >
    //     (0,2,2), so we win inside cards too, independent of stylesheet injection order (skin may
    //     re-inject after us on a storage-sync event, so we rely on specificity, not source order).
    p.push(`.ant-table-thead>tr>th{${decl}}`);
    p.push(`.ant-card .ant-table-wrapper .ant-table-thead>tr>th{${decl}}`);
  }
  // Default (non-bordered) header column-divider = antd's `th::before` pseudo-element. Recolour it
  // (a transparent value hides the lines). antd's own colour is NOT !important and skin never touches
  // `::before`, so this single !important rule wins everywhere — no in-card escalation needed. It only
  // repaints dividers antd already renders (a `::before` with no `content` isn't generated).
  if (tb.headSplit) p.push(`.ant-table-thead>tr>th::before{background-color:${tb.headSplit}!important}`);
  if (tb.border) {
    // Row bottom-border at TWO specificities, same reason as the header rule above: skin's in-card
    // `.ant-card .ant-table-tbody>tr>td{…border-color:…!important}` (0,2,2) otherwise overrides the
    // user's Rows→Border colour. The `.ant-card .ant-table-wrapper …` variant (0,3,2) beats it in cards.
    const bd = `border-bottom:1px solid ${tb.border}!important`;
    p.push(`.ant-table-tbody>tr>td{${bd}}`);
    p.push(`.ant-card .ant-table-wrapper .ant-table-tbody>tr>td{${bd}}`);
  }
  if (tb.zebraAuto) p.push(zebraRule(autoZebraColor(isDark), true));
  else if (tb.zebra) p.push(zebraRule(tb.zebra, false));
  if (tb.rowHover) {
    p.push(
      `.ant-table-wrapper .ant-table-tbody>tr.ant-table-row:hover>td,` +
        `.ant-table-wrapper .ant-table-tbody>tr:hover>td{background:${tb.rowHover}!important}`,
    );
  }
  if (tb.compact) p.push(`.ant-table-tbody>tr>td,.ant-table-thead>tr>th{padding:6px 10px!important}`);
  return p.join('\n');
}

export function injectTypographyCss(css: string) {
  if (typeof document === 'undefined') return;
  let el = document.getElementById(CSS_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = CSS_ID;
    document.head.appendChild(el);
  }
  el.textContent = css || '';
}

export function injectFontLink(url?: string) {
  if (typeof document === 'undefined') return;
  const href = extractFontHref(url);
  let el = document.getElementById(LINK_ID) as HTMLLinkElement | null;
  if (!href) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement('link');
    el.id = LINK_ID;
    el.rel = 'stylesheet';
    document.head.appendChild(el);
  }
  if (el.getAttribute('href') !== href) el.setAttribute('href', href);
}

export function applyTypography(cfg: TypographyCfg) {
  injectFontLink(cfg?.fontUrl);
  injectTypographyCss(buildTypographyCss(cfg || {}, currentThemeIsDark()));
}

// localStorage key bumped on every Save. Other open tabs/views listen for the `storage` event and
// re-fetch+apply — so a saved change reaches already-open tables without a manual reload (the settings
// page only live-previews its OWN document; app views loaded earlier would otherwise stay stale).
const REV_KEY = 'ptdl-branding-typography-rev';
let _syncBound = false;
function bindTypographySync(apiClient: any) {
  if (_syncBound || typeof window === 'undefined') return;
  _syncBound = true;
  window.addEventListener('storage', (e) => {
    if (e.key === REV_KEY) loadAndApplyTypography(apiClient);
  });
}
export function notifyTypographyChanged() {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(REV_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

// Every client calls this at startup to apply the saved typography (and wire the cross-tab sync).
export async function loadAndApplyTypography(apiClient: any) {
  bindTypographySync(apiClient);
  try {
    const res = await apiClient.request({ url: 'brandingConfigs:getActive', params: { type: scopedType('typography', currentThemeUid()) } });
    const cfg = res?.data?.data?.options || res?.data?.data || {};
    applyTypography(cfg);
  } catch (e) {
    /* ignore — no typography config yet */
  }
}

// ================= Settings-page builder (plain-React lane) ========================================
let _api: any = null;
let _t: (s: string) => string = (s) => s;
export function initTypographyUi(deps: { apiClient: any; t?: (s: string) => string }) {
  _api = deps.apiClient || _api;
  if (deps.t) _t = deps.t;
}

function ColorBtn({ value, onChange, label, disabled, alpha }: { value?: string; onChange: (v: string) => void; label: string; disabled?: boolean; alpha?: boolean }) {
  const { token } = theme.useToken();
  return (
    <Space size={4}>
      <span style={{ fontSize: 12, color: token.colorTextTertiary }}>{label}</span>
      <ColorPicker
        size="small"
        disabled={disabled}
        value={value || undefined}
        presets={COLOR_PRESETS as any}
        allowClear
        showText
        // `alpha` picker: show the transparency slider + rgb text so a transparent value (→ hides the
        // divider) is producible. Omitted for the others → antd defaults (unchanged behaviour).
        {...(alpha ? { disabledAlpha: false, format: 'rgb' as const } : {})}
        onChange={(c: any) => onChange(colorToString(c) || '')}
        onClear={() => onChange('')}
      />
    </Space>
  );
}

// Self-contained preview: a sample paragraph + a mini table styled from the config (inline, so it
// reflects the settings even before Save). The Google font link is injected live, so text shows it.
function TypographyPreview({ cfg }: { cfg: TypographyCfg }) {
  const { token } = theme.useToken();
  const fam = (cfg.fontFamily || '').trim();
  const fontFamily = fam ? `${quoteFamily(fam)}, ${SANS_FALLBACK}` : undefined;
  const tb = cfg.table || {};
  const fs = tb.fontSize && tb.fontSize > 0 ? tb.fontSize : 13;
  const border = tb.border || token.colorBorderSecondary;
  const rows = [
    ['Nguyễn Văn A', 'Đang mở', '1.250.000'],
    ['Trần Thị B', 'Hoàn tất', '980.000'],
    ['Lê Văn C', 'Chờ xử lý', '2.400.000'],
  ];
  return (
    <div
      style={{
        fontFamily,
        border: `1px solid ${token.colorBorder}`,
        borderRadius: 8,
        padding: 14,
        marginBottom: 16,
        background: token.colorBgContainer,
      }}
    >
      <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 2 }}>{_t('The quick brown fox')} — Xin chào</div>
      <div style={{ color: token.colorTextTertiary, fontSize: 13, marginBottom: 12 }}>0123456789 · Aa Bb Cc Đđ · abcdefghijk</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: fs }}>
        <thead>
          <tr>
            {[_t('Name'), _t('Status'), _t('Amount')].map((h, i) => (
              <th
                key={i}
                style={{
                  textAlign: i === 2 ? 'right' : 'left',
                  padding: tb.compact ? '6px 10px' : '9px 12px',
                  background: tb.headBg || token.colorFillQuaternary,
                  color: tb.headText || token.colorTextSecondary,
                  fontWeight: tb.headWeight || 500,
                  borderBottom: `1px solid ${border}`,
                  // Reflect the header column-divider colour on the non-last cells.
                  borderRight: i < 2 ? `1px solid ${tb.headSplit || 'transparent'}` : undefined,
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} style={{ background: ri % 2 === 1 ? (tb.zebraAuto ? token.colorFillQuaternary : tb.zebra) || 'transparent' : 'transparent' }}>
              {r.map((c, ci) => (
                <td
                  key={ci}
                  style={{
                    textAlign: ci === 2 ? 'right' : 'left',
                    padding: tb.compact ? '6px 10px' : '9px 12px',
                    borderBottom: `1px solid ${border}`,
                    fontVariantNumeric: ci === 2 ? 'tabular-nums' : undefined,
                  }}
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function BrandingTypographyPage({ scopeUid }: { scopeUid?: string } = {}): React.ReactElement {
  const { token } = theme.useToken();
  const [cfg, setCfg] = React.useState<TypographyCfg>(DEFAULT_TYPOGRAPHY);
  const savedRef = React.useRef<TypographyCfg>(DEFAULT_TYPOGRAPHY);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    if (!_api?.request) {
      setLoading(false);
      return;
    }
    setLoading(true);
    _api
      .request({ url: 'brandingConfigs:getActive', params: { type: scopedType('typography', scopeUid) } })
      .then((res: any) => {
        if (!active) return;
        const o = { ...DEFAULT_TYPOGRAPHY, ...(res?.data?.data?.options || {}) };
        savedRef.current = o;
        setCfg(o);
      })
      .catch(() => {})
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [scopeUid]);

  // Live-apply while editing; revert to the last SAVED config on leave.
  React.useEffect(() => {
    applyTypography(cfg);
  }, [cfg]);
  React.useEffect(() => {
    return () => applyTypography(savedRef.current);
  }, []);

  const set = (patch: Partial<TypographyCfg>) => setCfg((c) => ({ ...c, ...patch }));
  const setTable = (patch: Partial<TableCfg>) => setCfg((c) => ({ ...c, table: { ...c.table, ...patch } }));

  const save = async () => {
    if (!_api?.request) return;
    setSaving(true);
    try {
      await _api.request({ url: 'brandingConfigs:save', method: 'post', data: { type: scopedType('typography', scopeUid), options: cfg } });
      savedRef.current = cfg;
      notifyTypographyChanged(); // push the change to other open tabs/views (no manual reload needed)
      message.success(_t('Saved'));
    } catch (e) {
      message.error(_t('Save failed'));
    }
    setSaving(false);
  };
  const reset = () => setCfg(savedRef.current || DEFAULT_TYPOGRAPHY);

  if (loading) return <div style={{ padding: 24 }}>{_t('Loading…')}</div>;

  const tb = cfg.table || {};
  const suggested = familyFromUrl(cfg.fontUrl);

  return (
    <div style={{ padding: 20, maxWidth: 1440, margin: '0 auto' }}>
      <h2 style={{ marginTop: 0, marginBottom: 4 }}>{_t('Typography & tables')}</h2>
      <p style={{ color: token.colorTextTertiary, margin: '0 0 16px' }}>
        {_t('Load a Google Font and apply it app-wide (code editors stay monospace), and style every table. Changes preview live; press Save to apply for everyone.')}
      </p>

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* Sticky preview + actions — on the RIGHT (order 2) so the controls read first on the left. */}
        <div style={{ flex: '1 1 340px', minWidth: 300, maxWidth: 460, position: 'sticky', top: 8, order: 2 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{_t('Preview')}</div>
          <TypographyPreview cfg={cfg} />
          <Space>
            <Button type="primary" loading={saving} onClick={save}>
              {_t('Save')}
            </Button>
            <Button onClick={reset}>{_t('Reset')}</Button>
          </Space>
        </div>

        {/* Editors — on the LEFT (order 1). */}
        <div style={{ flex: '2 1 460px', minWidth: 320, order: 1 }}>
          <Card size="small" title={_t('Font')} style={{ marginBottom: 12 }}>
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <div>
                <div style={{ fontSize: 12, color: token.colorTextTertiary, marginBottom: 4 }}>{_t('Google Fonts link (or URL)')}</div>
                <Input.TextArea
                  value={cfg.fontUrl}
                  autoSize={{ minRows: 2, maxRows: 3 }}
                  placeholder={'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap'}
                  onChange={(e) => set({ fontUrl: e.target.value })}
                  style={{ fontFamily: MONO_STACK, fontSize: 12 }}
                />
                <div style={{ fontSize: 11, color: token.colorTextQuaternary, marginTop: 4 }}>
                  {_t('Paste the <link> from fonts.google.com — the family fills in automatically.')}
                </div>
              </div>
              <Space wrap align="center" size={10} style={{ width: '100%' }}>
                <span style={{ fontSize: 12, color: token.colorTextTertiary, flex: 'none' }}>{_t('Font family')}</span>
                <Input
                  value={cfg.fontFamily}
                  placeholder={suggested || 'Inter'}
                  onChange={(e) => set({ fontFamily: e.target.value })}
                  style={{ width: 180 }}
                />
                {suggested && suggested !== cfg.fontFamily ? (
                  <Button size="small" type="link" onClick={() => set({ fontFamily: suggested })}>
                    {_t('Use')} “{suggested}”
                  </Button>
                ) : null}
              </Space>
              <Space size={8}>
                <Switch size="small" checked={cfg.antialias !== false} onChange={(v) => set({ antialias: v })} />
                <span style={{ fontSize: 12, color: token.colorTextTertiary }}>{_t('Smooth text (antialiasing)')}</span>
              </Space>
            </Space>
          </Card>

          <Card size="small" title={_t('Tables')}>
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <Space size={10} align="center" style={{ width: '100%' }}>
                <span style={{ fontSize: 12, color: token.colorTextTertiary, width: 70, flex: 'none' }}>{_t('Font size')}</span>
                <Slider
                  min={0}
                  max={18}
                  value={tb.fontSize || 0}
                  onChange={(v) => setTable({ fontSize: v })}
                  style={{ flex: 1, minWidth: 150 }}
                />
                <span style={{ fontSize: 12, color: token.colorTextTertiary, width: 56, textAlign: 'right' }}>
                  {tb.fontSize && tb.fontSize > 0 ? `${tb.fontSize}px` : _t('Default')}
                </span>
              </Space>
              <Space size={10} align="center" wrap>
                <span style={{ fontSize: 12, color: token.colorTextTertiary, width: 70, flex: 'none' }}>{_t('Header row')}</span>
                <ColorBtn label={_t('Fill')} value={tb.headBg} onChange={(headBg) => setTable({ headBg })} />
                <ColorBtn label={_t('Text')} value={tb.headText} onChange={(headText) => setTable({ headText })} />
                {/* Divider = the thin vertical separators between header cells. Alpha on: a transparent value hides them. */}
                <ColorBtn label={_t('Divider')} value={tb.headSplit} onChange={(headSplit) => setTable({ headSplit })} alpha />
              </Space>
              <Space size={10} align="center">
                <span style={{ fontSize: 12, color: token.colorTextTertiary, width: 70, flex: 'none' }}>{_t('Header weight')}</span>
                <SegmentedGroup
                  value={tb.headWeight || 0}
                  onChange={(v) => setTable({ headWeight: v as number })}
                  options={[
                    { label: _t('Default'), value: 0 },
                    { label: _t('Normal'), value: 400 },
                    { label: _t('Medium'), value: 500 },
                    { label: _t('Semibold'), value: 600 },
                  ]}
                />
              </Space>
              <Space size={10} align="center" wrap>
                <span style={{ fontSize: 12, color: token.colorTextTertiary, width: 70, flex: 'none' }}>{_t('Rows')}</span>
                <ColorBtn label={_t('Border')} value={tb.border} onChange={(border) => setTable({ border })} />
                <ColorBtn label={_t('Zebra')} value={tb.zebra} onChange={(zebra) => setTable({ zebra })} disabled={!!tb.zebraAuto} />
                <Space size={4} align="center">
                  <Switch size="small" checked={!!tb.zebraAuto} onChange={(v) => setTable({ zebraAuto: v })} />
                  <Tooltip title={_t('Derive the zebra tint from the theme — adapts to light/dark and keeps the selected-row highlight.')}>
                    <span style={{ fontSize: 12, color: token.colorTextTertiary }}>{_t('Auto (theme)')}</span>
                  </Tooltip>
                </Space>
                <ColorBtn label={_t('Hover')} value={tb.rowHover} onChange={(rowHover) => setTable({ rowHover })} />
              </Space>
              <Space size={8}>
                <Switch size="small" checked={!!tb.compact} onChange={(v) => setTable({ compact: v })} />
                <span style={{ fontSize: 12, color: token.colorTextTertiary }}>{_t('Compact rows')}</span>
              </Space>
            </Space>
          </Card>
        </div>
      </div>
    </div>
  );
}
