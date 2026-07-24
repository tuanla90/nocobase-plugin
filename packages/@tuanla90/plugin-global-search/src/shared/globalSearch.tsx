import { SearchOutlined } from '@ant-design/icons';
import { Button, Descriptions, Drawer, Empty, Input, Modal, Select, Spin, Typography, theme } from 'antd';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { interpolate } from '@tuanla90/shared';
import {
  APPEARANCE_EVENT,
  discoverTargets,
  fillTemplate,
  getAppearance,
  getManualTargets,
  GS_VERSION,
  hideInPreview,
  loadConfig,
  resolveViewUrl,
  SHORTCUT_LABEL,
  type Align,
  type Appearance,
  type SearchTarget,
} from './config';

// The API client differs per client lane: classic `/` uses @nocobase/client's useAPIClient,
// modern `/v/` uses @nocobase/client-v2's useApp().apiClient. This module imports NEITHER —
// each lane injects its own hook through createGlobalSearch() so the shared bundle stays
// framework-agnostic (importing @nocobase/client here would poison the client-v2 bundle and
// break /v/ with a RequireJS script error).
export type GlobalSearchDeps = {
  /** React hook returning the app's APIClient for the current lane. */
  useApiClient: () => any;
  /** Translate an English UI string against the plugin's i18n namespace. Injected per-lane
   *  (`(s) => app.i18n.t(s, { ns })`); defaults to identity (English) when omitted. */
  t?: (s: string) => string;
};

type GroupResult = { target: SearchTarget; rows: any[]; error?: boolean };
type Flat = { row: any; target: SearchTarget };

async function runSearch(apiClient: any, targets: SearchTarget[], q: string): Promise<GroupResult[]> {
  const query = q.trim();
  if (!query) return [];
  const numeric = /^\d+$/.test(query);
  return Promise.all(
    targets.map(async (t): Promise<GroupResult> => {
      const or = (t.fields || []).map((f) => ({ [f]: { $includes: query } }));
      // No searchable fields and not a numeric id → skip. (Never fall through to an empty filter,
      // which would return every row for any query.)
      if (!or.length && !numeric) return { target: t, rows: [] };
      // Append the to-one relations a nested title template reads (e.g. `{customer.name}` → append
      // `customer`) so those values are actually populated on the returned row.
      const base: any = { pageSize: t.limit ?? 5 };
      const appends = appendsFromTemplate(t.titleTemplate);
      if (appends.length) base.appends = appends;
      // A purely numeric query also tries an id match so "123" can find record #123. If the
      // collection's primary key isn't a plain integer this errors → fall back to text-only.
      const filter = numeric ? { $or: [...or, { id: Number(query) }] } : { $or: or };
      try {
        const res = await apiClient.resource(t.collection).list({ ...base, filter });
        return { target: t, rows: res?.data?.data ?? [] };
      } catch (e) {
        if (numeric && or.length) {
          try {
            const res = await apiClient.resource(t.collection).list({ ...base, filter: { $or: or } });
            return { target: t, rows: res?.data?.data ?? [] };
          } catch (e2) {
            return { target: t, rows: [], error: true };
          }
        }
        return { target: t, rows: [], error: true };
      }
    }),
  );
}

// The title-template engine (`{{field | filter:arg}}` with date/number/… filters + dot-path reads)
// now lives in @tuanla90/shared as `interpolate(tpl, row, { filters: true })` — the canonical superset
// (extra date tokens MMMM/MMM/D/M/hh/A/a, compact K/M/B numbers). Standard syntax is DOUBLE-brace
// `{{field}}` (matches link tokens + the other @tuanla90 plugins); legacy single-brace `{field}` still
// renders via the auto-detect in titleOf below.

// Association appends a nested title template needs. `{customer.name | upper}` → `customer`;
// `{a.b.c}` → `a.b`. Only dotted tokens produce an append (top-level fields are already on the row).
function appendsFromTemplate(tpl?: string): string[] {
  if (!tpl) return [];
  const out = new Set<string>();
  const re = /\{([^}]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tpl))) {
    const path = m[1].split('|')[0].trim();
    const dot = path.lastIndexOf('.');
    if (dot > 0) out.add(path.slice(0, dot));
  }
  return [...out];
}

function titleOf(row: any, t: SearchTarget): string {
  // Template mode wins: fill tokens (with optional `| filter`) via the shared engine. Standard is
  // `{{field}}`; a legacy `{field}` template (no `{{`) still renders in single-brace mode.
  if (t.titleTemplate && t.titleTemplate.trim()) {
    const s = interpolate(t.titleTemplate, row, { filters: true, doubleBrace: t.titleTemplate.includes('{{') }).trim();
    if (s) return s;
  }
  const tf = t.titleField;
  const keys = Array.isArray(tf) ? tf : tf ? [tf] : [(t.fields && t.fields[0]) || 'id'];
  const parts = keys
    .map((k) => row?.[k])
    .filter((v) => v !== undefined && v !== null && v !== '')
    .map(String);
  return parts.length ? parts.join(' · ') : `#${row?.id ?? '?'}`;
}

function useDebounced<T>(value: T, delay = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return v;
}

function renderVal(v: any): React.ReactNode {
  if (v === null || v === undefined || v === '') return <span style={{ opacity: 0.35 }}>—</span>;
  if (typeof v === 'object') return <code style={{ fontSize: 12 }}>{JSON.stringify(v)}</code>;
  return String(v);
}

// Decide whether a computed background colour reads as dark (→ light text pill).
function isDarkBg(color: string): boolean {
  const m = color && color.match(/rgba?\(([^)]+)\)/);
  if (!m) return true; // unknown → assume the NocoBase admin header is dark
  const p = m[1].split(',').map((s) => parseFloat(s.trim()));
  const [r, g, b, a = 1] = p;
  if (!a) return false; // transparent at this node → let the caller keep walking up
  return 0.299 * r + 0.587 * g + 0.114 * b < 140;
}

// Walk up from `el` to the first ancestor with a non-transparent background and judge its darkness.
// The admin header/topbar is usually dark; a light theme yields a light bar. Defaults to dark.
function ancestorBgIsDark(el: Element | null): boolean {
  let node: Element | null = el;
  for (let i = 0; node && i < 6; i++, node = node.parentElement) {
    try {
      const bg = getComputedStyle(node).backgroundColor;
      const m = bg && bg.match(/rgba?\(([^)]+)\)/);
      if (!m) continue;
      const parts = m[1].split(',').map((s) => parseFloat(s.trim()));
      const a = parts[3] === undefined ? 1 : parts[3];
      if (a > 0.1) return isDarkBg(bg);
    } catch (e) {
      /* keep walking */
    }
  }
  return true;
}

type Variant = 'header-dark' | 'header-light' | 'floating';
// host = a real DOM node injected into the toolbar (flex item, no overlap at any width).
// overlayStyle = a fixed-position body overlay measured against a bar we must not inject into.
type Mount = { host: HTMLElement | null; overlayStyle: React.CSSProperties | null; variant: Variant };

// Below antd's popup layer (Modal/Drawer mask = 1000, dropdowns 1050+) so the pill never covers a
// modal, but above the plain header content.
const PILL_Z = 100;
const HOST_ID = 'ptdl-gs-host';

// Classic `/admin` renders the header with @ant-design/pro-layout: the action icons live in
// `.ant-pro-global-header-header-actions`, NOT in `.ant-layout-header` (which is an empty bar).
// That same class is reused by page-level tab bars ("+ Add tab" …); injecting there dropped the
// pill mid-screen over modals. So target only the APP top bar — the one holding app-level controls
// (avatar / settings / bell) — then drill to the flex row that holds the action items.
function resolveInjectRow(): HTMLElement | null {
  const override = (window as any).__PTDL_SEARCH_HEADER_SELECTOR__;
  let base: HTMLElement | null;
  if (override) {
    base = document.querySelector(override) as HTMLElement | null;
  } else {
    const APP_CTRL = '.ant-avatar, .anticon-user, .anticon-setting, .anticon-bell';
    base =
      ([...document.querySelectorAll('.ant-pro-global-header-header-actions')] as HTMLElement[]).find(
        // The MAIN app top bar only: holds app-level controls AND sits at the very top. Page-level
        // headers (detail/sub-page "view" routes) reuse this class lower down — skip them so the
        // pill isn't injected mid-page over a modal.
        (b) => b.querySelector(APP_CTRL) && b.getBoundingClientRect().top < 60,
      ) || null;
  }
  if (!base) return null;
  let row = base;
  // Descend past single-child wrappers to the row that holds the multiple action items.
  while (
    row.children.length === 1 &&
    row.firstElementChild &&
    (row.firstElementChild as HTMLElement).children.length > 0
  ) {
    row = row.firstElementChild as HTMLElement;
  }
  return row;
}

// True while any antd Modal/Drawer is open. We hide the pill entirely then — some flow-settings
// dialogs on /v/ sit at a stacking level where the pill would otherwise show through the backdrop
// ("bị lộ"). Belt-and-suspenders vs. z-index: if a dialog is up, just don't render the pill.
function isOverlayOpen(): boolean {
  const masks = document.querySelectorAll('.ant-modal-mask, .ant-drawer-mask');
  for (let i = 0; i < masks.length; i++) {
    const s = getComputedStyle(masks[i] as HTMLElement);
    if (s.display !== 'none' && s.visibility !== 'hidden' && parseFloat(s.opacity || '1') > 0.01) return true;
  }
  return false;
}

/**
 * Center mode: the X coordinate of the header's *free gap* — between the right edge of the left content
 * (logo + horizontal menu items) and the left edge of the right action cluster. Centering the pill here
 * (instead of a fixed viewport 50%) keeps it out of the menu text and lets it track the sidebar
 * expand/collapse, which shifts the menu. Returns null when there's no measurable/meaningful gap, so the
 * caller can fall back to viewport-center.
 */
function measureHeaderCenterX(): number | null {
  if (typeof document === 'undefined') return null;
  const actions =
    findInlineTopbarList() ||
    (document.querySelector(
      '.ant-pro-global-header-right-content, .ant-pro-global-header-header-actions',
    ) as HTMLElement | null);
  const ar = actions?.getBoundingClientRect();
  const rightBound = ar && ar.width ? ar.left : window.innerWidth || 0;

  // Left boundary: the far-right edge of the visible horizontal-menu items; else the logo; else 0.
  let leftBound = 0;
  const menu = document.querySelector('.ant-menu-horizontal, .ant-menu-overflow') as HTMLElement | null;
  if (menu) {
    let maxR = 0;
    menu.querySelectorAll(':scope > *').forEach((li) => {
      const el = li as HTMLElement;
      const s = getComputedStyle(el);
      if (s.visibility === 'hidden' || s.display === 'none') return;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > maxR) maxR = r.right;
    });
    if (maxR > 0) leftBound = maxR;
  }
  if (!leftBound) {
    const logo = document.querySelector(
      '.ant-pro-global-header-logo, .ant-pro-top-nav-header-logo, [class*="global-header-logo"], [class*="header-logo"]',
    ) as HTMLElement | null;
    const lr = logo?.getBoundingClientRect();
    if (lr && lr.width) leftBound = lr.right;
  }

  const gap = rightBound - leftBound;
  if (gap < 40) return null; // menu fills the bar → no real gap; let the caller fall back to 50%
  return Math.round(leftBound + gap / 2);
}

// The modern `/v/` topbar collapses every action into a "⋮" overflow on narrow screens, so
// `.nb-topbar-actions-list` disappears. Find that header "⋮" (ignore stray table-menu ellipses) so
// the pill can dock just left of it instead of falling back to a floating corner.
function findHeaderEllipsis(): Element | null {
  if (typeof document === 'undefined') return null;
  const w = typeof window !== 'undefined' ? window.innerWidth : 0;
  const scoped = document.querySelectorAll(
    '.ant-layout-header .anticon-ellipsis, .ant-pro-layout-header .anticon-ellipsis, header .anticon-ellipsis',
  );
  const pool: Element[] = scoped.length ? Array.from(scoped) : Array.from(document.querySelectorAll('.anticon-ellipsis'));
  for (const el of pool) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.top < 70 && r.right > w - 100) return el;
  }
  return null;
}

// The "⋮" overflow Popover renders ITS OWN copy of `.nb-topbar-actions-list` inside the popover
// portal while open — and antd keeps that popover mounted in the DOM after the first open. Only a
// list OUTSIDE any popover is the real inline topbar; anchoring to (or reasoning from) the popover
// copy is what made the pill pop up "orphaned" whenever the "⋮" menu was opened.
function findInlineTopbarList(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  for (const el of Array.from(document.querySelectorAll('.nb-topbar-actions-list'))) {
    if (!(el as HTMLElement).closest('.ant-popover')) return el as HTMLElement;
  }
  return null;
}

// True on the modern `/v/` client when the topbar has folded every action into a "⋮" overflow (its
// inline `.nb-topbar-actions-list` is gone — the popover copy doesn't count). Robust to timing:
// treats "no inline list + (⋮ visible OR narrow viewport)" as collapsed, so the decision doesn't
// flip-flop while the header (re)mounts or the overflow menu opens/closes.
function isModernCollapsed(): boolean {
  if (typeof document === 'undefined' || typeof window === 'undefined') return false;
  if (!/\/v(\/|$)/.test(location.pathname || '')) return false; // modern client only
  if (findInlineTopbarList()) return false; // desktop: actions inline → not collapsed
  return !!findHeaderEllipsis() || (window.innerWidth || 0) <= 820;
}

/**
 * Where to render the header trigger, recomputed on a light interval + DOM mutations.
 * - Classic `/admin` (ProLayout): INJECT a flex-item host into the action row so the browser lays
 *   the pill out among the icons — never overlapping, at any window width. Re-inserted only when
 *   React actually detaches it (checking parentage, not order, avoids a re-order fight/loop).
 * - Modern `/v/`: the topbar is flow-rendered and drops foreign children, so instead OVERLAY a
 *   fixed pill just left of `.nb-topbar-actions-list` (measured).
 * - Neither found: a floating fixed pill at the top-right.
 * Override the target with `window.__PTDL_SEARCH_HEADER_SELECTOR__ = '<css selector>'`.
 */
function useHeaderMount(align: Align): Mount {
  // Start hidden; show only once a real bar is found (host injected, or /v/ overlay measured).
  const [mount, setMount] = useState<Mount>({ host: null, overlayStyle: null, variant: 'floating' });

  useEffect(() => {
    const makeHost = () => {
      const h = document.createElement('div');
      h.id = HOST_ID;
      h.setAttribute('data-gs-portal', '1');
      h.style.display = 'inline-flex';
      h.style.alignItems = 'center';
      h.style.marginRight = '8px';
      return h;
    };
    const dropHost = () => document.getElementById(HOST_ID)?.remove();

    let raf = 0;
    const hide = () =>
      setMount((m) => (!m.host && !m.overlayStyle ? m : { host: null, overlayStyle: null, variant: 'floating' }));
    const ensure = () => {
      // A dialog is open → hide the pill (matches how /admin dims under the modal mask).
      if (isOverlayOpen()) {
        dropHost();
        hide();
        return;
      }
      const override = (window as any).__PTDL_SEARCH_HEADER_SELECTOR__;

      // Modern /v/ folded into a "⋮" overflow → HIDE the header pill here (no room), taking
      // precedence over the alignment branches so it stays hidden consistently regardless of Position.
      // A launcher docked by the "⋮" (e.g. @tuanla90/plugin-pwa's mobile Search icon) opens the palette;
      // ⌘/Ctrl+K still works everywhere.
      if (!override && isModernCollapsed()) {
        dropHost();
        hide();
        return;
      }

      // 0) Explicit alignment → a measured fixed overlay over the header.
      //    Left   → anchored just past the logo (best with the top menu hidden so it has room).
      //    Center → centered over the header.  Right (default) docks among the actions below.
      if (align === 'left') {
        const header =
          (override ? (document.querySelector(override) as HTMLElement | null) : null) ||
          (document.querySelector('.ant-pro-global-header, .ant-layout-header') as HTMLElement | null) ||
          resolveInjectRow() ||
          findInlineTopbarList();
        const hr = header?.getBoundingClientRect();
        if (header && hr && (hr.width || hr.height)) {
          dropHost();
          // Dodge the logo when we can find + measure it; else a fixed clearance from the header's left.
          const logo = document.querySelector(
            '.ant-pro-global-header-logo, .ant-pro-top-nav-header-logo, [class*="global-header-logo"], [class*="header-logo"]',
          ) as HTMLElement | null;
          const lr = logo?.getBoundingClientRect();
          const left = Math.round(
            lr && lr.right > hr.left && lr.right < hr.right ? lr.right + 16 : hr.left + 16,
          );
          const top = Math.round(hr.top + hr.height / 2);
          const style: React.CSSProperties = { position: 'fixed', top, left, transform: 'translateY(-50%)', zIndex: PILL_Z };
          const variant: Variant = ancestorBgIsDark(header) ? 'header-dark' : 'header-light';
          setMount((m) =>
            !m.host && m.overlayStyle && m.overlayStyle.top === top && m.overlayStyle.left === left && m.variant === variant
              ? m
              : { host: null, overlayStyle: style, variant },
          );
          return;
        }
        // no header yet → fall through to the default logic (may hide until a header appears)
      }

      // Center alignment → a measured fixed overlay centered over the header.
      if (align === 'center') {
        const bar =
          (override ? (document.querySelector(override) as HTMLElement | null) : null) ||
          findInlineTopbarList() ||
          resolveInjectRow() ||
          (document.querySelector('.ant-pro-global-header, .ant-layout-header') as HTMLElement | null);
        const r = bar?.getBoundingClientRect();
        if (bar && r && (r.width || r.height)) {
          dropHost();
          const top = Math.round(r.top + r.height / 2);
          // Center in the header's real free gap (tracks the sidebar) — fall back to viewport-center only
          // when there's no measurable gap (e.g. the top menu fills the bar).
          const centerX = measureHeaderCenterX();
          const style: React.CSSProperties = {
            position: 'fixed',
            top,
            left: centerX != null ? centerX : '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: PILL_Z,
          };
          const variant: Variant = ancestorBgIsDark(bar) ? 'header-dark' : 'header-light';
          setMount((m) =>
            !m.host &&
            m.overlayStyle &&
            m.overlayStyle.top === style.top &&
            m.overlayStyle.left === style.left &&
            m.variant === variant
              ? m
              : { host: null, overlayStyle: style, variant },
          );
          return;
        }
        // no bar yet → fall through to the default logic (may hide until a bar appears)
      }

      // 1) Modern /v/ topbar → overlay just left of it (don't inject: flow render drops it).
      const topbar = !override ? findInlineTopbarList() : null;
      if (topbar) {
        const r = topbar.getBoundingClientRect();
        if (r.width || r.height) {
          dropHost();
          const vw = window.innerWidth || 0;
          const top = Math.round(r.top + r.height / 2);
          const right = Math.max(8, Math.round(vw - r.left + 12));
          const style: React.CSSProperties = { position: 'fixed', top, right, transform: 'translateY(-50%)', zIndex: PILL_Z };
          const variant: Variant = ancestorBgIsDark(topbar) ? 'header-dark' : 'header-light';
          setMount((m) =>
            !m.host && m.overlayStyle && m.overlayStyle.top === top && m.overlayStyle.right === right && m.variant === variant
              ? m
              : { host: null, overlayStyle: style, variant },
          );
          return;
        }
      }

      // 2) Classic ProLayout toolbar (or override) → inject a flex item.
      const row = resolveInjectRow();
      if (row) {
        let h = document.getElementById(HOST_ID) as HTMLElement | null;
        if (!h) h = makeHost();
        if (h.parentElement !== row) row.insertBefore(h, row.firstChild); // re-insert only when detached
        const variant: Variant = ancestorBgIsDark(row) ? 'header-dark' : 'header-light';
        setMount((m) => (m.host === h && m.variant === variant ? m : { host: h!, overlayStyle: null, variant }));
        return;
      }

      // 3) No main top bar on this view (detail/sub-page/popup) → hide the pill. ⌘/Ctrl+K still works.
      dropHost();
      hide();
    };

    const schedule = () => {
      if (raf) return;
      if (typeof document !== 'undefined' && document.hidden) return; // don't churn on a background tab
      raf = requestAnimationFrame(() => {
        raf = 0;
        ensure();
      });
    };

    ensure();
    const obs = new MutationObserver(schedule);
    obs.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', schedule);
    // Sidebar collapse/expand is a CSS width transition (no DOM mutation) — recompute when a
    // layout-affecting transition ends so the centered pill re-tracks the shifted menu promptly
    // instead of lagging until the 1.5s interval below.
    const onTransition = (e: TransitionEvent) => {
      const p = e.propertyName || '';
      if (p === 'width' || p === 'margin-left' || p === 'left' || p === 'transform' || p === 'flex-basis') schedule();
    };
    document.addEventListener('transitionend', onTransition, true);
    // Catch layout shifts that don't mutate the DOM (e.g. the /v/ overlay's bar moving).
    const id = window.setInterval(schedule, 1500);
    return () => {
      obs.disconnect();
      window.removeEventListener('resize', schedule);
      document.removeEventListener('transitionend', onTransition, true);
      window.clearInterval(id);
      if (raf) cancelAnimationFrame(raf);
      dropHost();
    };
  }, [align]);

  return mount;
}

// SHORTCUT_LABEL is shared with the Settings screen — see ./config.

// Icon-only diameter (px) — a round icon button matching the header's other action icons.
const ICON_ONLY_DIAMETER = 34;

function pillStyle(variant: 'header-dark' | 'header-light' | 'floating', appearance: Appearance): React.CSSProperties {
  const iconOnly = !appearance.label && !appearance.showShortcut;
  const radius = Number.isFinite(appearance.radius) ? appearance.radius : 16;
  // Icon-only → a CIRCLE (equal width/height, no min-width) instead of a wide pill.
  const base: React.CSSProperties = iconOnly
    ? {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        width: ICON_ONLY_DIAMETER,
        height: ICON_ONLY_DIAMETER,
        minWidth: ICON_ONLY_DIAMETER,
        padding: 0,
        borderRadius: '50%',
        fontSize: 15,
        whiteSpace: 'nowrap',
      }
    : {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        cursor: 'pointer',
        padding: '5px 14px',
        borderRadius: radius,
        fontSize: 13,
        lineHeight: '22px',
        whiteSpace: 'nowrap',
        minWidth: Math.max(0, appearance.width),
      };
  const style: React.CSSProperties =
    variant === 'floating'
      ? { ...base, color: '#fff', background: 'rgba(0,0,0,0.72)', border: '1px solid rgba(255,255,255,0.25)' }
      : variant === 'header-light'
        ? { ...base, color: 'rgba(0,0,0,0.75)', background: 'rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.15)' }
        : { ...base, color: 'rgba(255,255,255,0.92)', background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.28)' };
  // Custom color overrides (empty string = keep the theme-derived value). The text colour also
  // drives the border so a custom fg reads as one coherent accent.
  if (appearance.bg) style.background = appearance.bg;
  if (appearance.fg) {
    style.color = appearance.fg;
    style.border = `1px solid ${appearance.fg}`;
  }
  return style;
}

// Responsive: is the window narrower than `breakpoint`px? (0 = never.) Drives the auto-collapse to an
// icon on small screens. Recomputes on resize.
function useIsNarrow(breakpoint: number): boolean {
  const bp = breakpoint > 0 ? breakpoint : 0;
  const [narrow, setNarrow] = useState<boolean>(() => bp > 0 && typeof window !== 'undefined' && window.innerWidth <= bp);
  useEffect(() => {
    if (!(bp > 0) || typeof window === 'undefined') {
      setNarrow(false);
      return;
    }
    const check = () => setNarrow(window.innerWidth <= bp);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [bp]);
  return narrow;
}

const Trigger: React.FC<{
  variant: 'header-dark' | 'header-light' | 'floating';
  onClick: () => void;
  appearance: Appearance;
  t: (s: string) => string;
}> = ({ variant, onClick, appearance, t }) => {
  // Auto-collapse to an icon-only circle on narrow screens: clear label + shortcut so pillStyle takes
  // its icon-only branch. Default breakpoint 820px; `autoIconBelow: 0` disables it.
  const bp = typeof appearance.autoIconBelow === 'number' ? appearance.autoIconBelow : 820;
  const narrow = useIsNarrow(bp);
  const eff: Appearance = narrow ? { ...appearance, label: '', showShortcut: false } : appearance;
  return (
    <div
      data-gs-version={GS_VERSION}
      role="button"
      tabIndex={0}
      aria-label={t('Open global search')}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      title={t('Search (Ctrl / ⌘ + K)')}
      style={pillStyle(variant, eff)}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <SearchOutlined />
        {eff.label ? <span>{eff.label}</span> : null}
      </span>
      {eff.showShortcut ? (
        <span style={{ opacity: 0.6, fontSize: 11, marginLeft: 12 }}>{SHORTCUT_LABEL}</span>
      ) : null}
    </div>
  );
};

/**
 * Builds the global-search overlay bound to a specific client lane's API-client hook.
 * Returns a provider component to hand to `app.addProvider()`. The provider renders a
 * ⌘/Ctrl+K palette, a header trigger (docked into the modern topbar or classic header, with a
 * floating fallback), and a preview drawer that quick-views the picked record.
 */
export function createGlobalSearch({ useApiClient, t = (s) => s }: GlobalSearchDeps) {
  const SearchPanel: React.FC<{ onClose: () => void; onOpen: (row: any, t: SearchTarget) => void }> = ({
    onClose,
    onOpen,
  }) => {
    const { token } = theme.useToken();
    const apiClient = useApiClient();
    const [targets, setTargets] = useState<SearchTarget[]>([]);
    const [targetsReady, setTargetsReady] = useState(false);
    const [scope, setScope] = useState(''); // '' = all collections; else a single collection name
    const [q, setQ] = useState('');
    const dq = useDebounced(q, 300);
    const [loading, setLoading] = useState(false);
    const [groups, setGroups] = useState<GroupResult[]>([]);
    const [sel, setSel] = useState(0);
    const reqId = useRef(0);
    const selRef = useRef<HTMLDivElement | null>(null);

    // Resolve targets once: preload the shared config, then explicit targets win, otherwise
    // auto-discover collections.
    useEffect(() => {
      let alive = true;
      loadConfig(apiClient).then(() => {
        if (!alive) return;
        const manual = getManualTargets();
        if (manual.length) {
          setTargets(manual);
          setTargetsReady(true);
          return;
        }
        discoverTargets(apiClient).then((t) => {
          if (alive) {
            setTargets(t);
            setTargetsReady(true);
          }
        });
      });
      return () => {
        alive = false;
      };
    }, [apiClient]);

    useEffect(() => {
      const id = ++reqId.current;
      // Scope to one collection when picked, otherwise search all configured targets.
      const active = scope ? targets.filter((t) => t.collection === scope) : targets;
      if (!dq.trim() || !active.length) {
        setGroups([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      runSearch(apiClient, active, dq).then((g) => {
        if (id === reqId.current) {
          setGroups(g);
          setSel(0);
          setLoading(false);
        }
      });
    }, [dq, apiClient, targets, scope]);

    const flat: Flat[] = useMemo(
      () => groups.flatMap((g) => g.rows.map((row) => ({ row, target: g.target }))),
      [groups],
    );

    // Collections whose request errored (e.g. no permission) — surfaced below the results instead
    // of silently vanishing as an empty group.
    const errored = useMemo(
      () => groups.filter((g) => g.error).map((g) => g.target.label || g.target.collection),
      [groups],
    );

    useEffect(() => {
      selRef.current?.scrollIntoView({ block: 'nearest' });
    }, [sel]);

    const onKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSel((s) => Math.min(s + 1, Math.max(flat.length - 1, 0)));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSel((s) => Math.max(s - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const f = flat[sel];
        if (f) onOpen(f.row, f.target);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    const busy = loading || (!targetsReady && !!dq.trim());

    return (
      <div>
        {targets.length > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Typography.Text type="secondary" style={{ fontSize: 12, flex: 'none' }}>
              {t('Search in')}
            </Typography.Text>
            <Select
              size="small"
              value={scope}
              onChange={setScope}
              showSearch
              optionFilterProp="label"
              style={{ minWidth: 200 }}
              options={[
                { label: t('All collections'), value: '' },
                ...targets.map((t) => ({ label: t.label || t.collection, value: t.collection })),
              ]}
            />
          </div>
        )}
        <Input
          autoFocus
          size="large"
          allowClear
          prefix={<SearchOutlined />}
          placeholder={t('Search…')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <div style={{ marginTop: 12, maxHeight: '55vh', overflow: 'auto' }}>
          {busy && (
            <div style={{ textAlign: 'center', padding: 24 }}>
              <Spin />
            </div>
          )}
          {!busy && !!dq.trim() && flat.length === 0 && (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('No results')} />
          )}
          {!busy &&
            flat.map((f, i) => {
              const prev = flat[i - 1];
              const showHeader = !prev || prev.target.collection !== f.target.collection;
              const active = i === sel;
              return (
                <React.Fragment key={`${f.target.collection}:${f.row?.id ?? i}`}>
                  {showHeader && (
                    <Typography.Text
                      type="secondary"
                      style={{ fontSize: 12, paddingLeft: 4, display: 'block', marginTop: 6 }}
                    >
                      {f.target.label || f.target.collection}
                    </Typography.Text>
                  )}
                  <div
                    ref={active ? selRef : undefined}
                    onClick={() => onOpen(f.row, f.target)}
                    onMouseEnter={() => setSel(i)}
                    style={{
                      cursor: 'pointer',
                      background: active ? token.colorFillTertiary : undefined,
                      borderRadius: 6,
                      padding: '6px 8px',
                    }}
                  >
                    <div style={{ fontWeight: 500 }}>{titleOf(f.row, f.target)}</div>
                    {f.target.descriptionField && (
                      <div style={{ opacity: 0.6, fontSize: 12 }}>
                        {String(f.row?.[f.target.descriptionField] ?? '')}
                      </div>
                    )}
                  </div>
                </React.Fragment>
              );
            })}
          {!busy && errored.length > 0 && (
            <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
              {t("Couldn't search")}: {errored.join(', ')}
            </Typography.Text>
          )}
        </div>
        <div style={{ marginTop: 10, opacity: 0.5, fontSize: 12 }}>{t('↑↓ navigate · Enter open · Esc close')}</div>
      </div>
    );
  };

  const QuickView: React.FC<{ preview: Flat | null; onClose: () => void }> = ({ preview, onClose }) => {
    const apiClient = useApiClient();
    const [loading, setLoading] = useState(false);
    const [record, setRecord] = useState<any>(null);

    useEffect(() => {
      if (!preview) {
        setRecord(null);
        return;
      }
      const { row, target } = preview;
      const id = row?.id;
      if (id == null) {
        setRecord(row);
        return;
      }
      let alive = true;
      setLoading(true);
      apiClient
        .resource(target.collection)
        .get({ filterByTk: id })
        .then((res: any) => {
          if (alive) setRecord(res?.data?.data ?? row);
        })
        .catch(() => {
          if (alive) setRecord(row);
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
      return () => {
        alive = false;
      };
    }, [preview, apiClient]);

    const target = preview?.target;
    // An explicit `previewFields` whitelist wins; otherwise show every non-hidden field with
    // scalars first and nested objects/relations last. `hideInPreview` drops internal/sensitive keys.
    const entries = useMemo<[string, any][]>(() => {
      if (!record) return [];
      const pf = target?.previewFields;
      if (pf && pf.length) return pf.filter((k) => k in record).map((k): [string, any] => [k, (record as any)[k]]);
      const all = Object.entries(record).filter(([k]) => !hideInPreview(k));
      const isScalar = (v: any) => v == null || typeof v !== 'object';
      return all.sort((a, b) => Number(isScalar(b[1])) - Number(isScalar(a[1])));
    }, [record, target]);

    return (
      <Drawer
        open={!!preview}
        onClose={onClose}
        width={480}
        title={target ? target.label || target.collection : ''}
        extra={
          target?.link && record ? (
            <Button type="primary" onClick={() => window.location.assign(fillTemplate(target.link!, record))}>
              {t('Open full page')}
            </Button>
          ) : null
        }
      >
        {loading ? (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <Spin />
          </div>
        ) : (
          <Descriptions
            column={1}
            size="small"
            bordered
            items={entries.map(([k, v]) => ({ key: k, label: k, children: renderVal(v) }))}
          />
        )}
      </Drawer>
    );
  };

  const GlobalSearchProvider: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
    const apiClient = useApiClient();
    const [open, setOpen] = useState(false);
    const [preview, setPreview] = useState<Flat | null>(null);
    const [appearance, setAppearance] = useState<Appearance>(getAppearance);
    const mount = useHeaderMount(appearance.align || 'right');

    // Preload the shared (server) config once, then reflect the saved appearance on the pill.
    useEffect(() => {
      let alive = true;
      loadConfig(apiClient).then(() => {
        if (alive) setAppearance(getAppearance());
      });
      return () => {
        alive = false;
      };
    }, [apiClient]);

    useEffect(() => {
      const onKey = (e: KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
          e.preventDefault();
          setOpen((v) => !v);
        }
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, []);

    // Live-update the pill when config is saved (same tab via custom event, other tabs via storage).
    useEffect(() => {
      const refresh = () => setAppearance(getAppearance());
      window.addEventListener(APPEARANCE_EVENT, refresh);
      window.addEventListener('storage', refresh);
      return () => {
        window.removeEventListener(APPEARANCE_EVENT, refresh);
        window.removeEventListener('storage', refresh);
      };
    }, []);

    const openPreview = (row: any, target: SearchTarget) => {
      setOpen(false);
      // Mapped collection → jump straight to its page; otherwise fall back to the raw drawer.
      const url = resolveViewUrl(target.collection, target.link, row);
      if (url) {
        window.location.assign(url);
        return;
      }
      setPreview({ row, target });
    };

    return (
      <>
        {children}
        {mount.host
          ? createPortal(
              <Trigger variant={mount.variant} onClick={() => setOpen(true)} appearance={appearance} t={t} />,
              mount.host,
            )
          : mount.overlayStyle
            ? createPortal(
                <div data-gs-portal="1" style={mount.overlayStyle}>
                  <Trigger variant={mount.variant} onClick={() => setOpen(true)} appearance={appearance} t={t} />
                </div>,
                document.body,
              )
            : null}
        <Modal open={open} onCancel={() => setOpen(false)} footer={null} closable={false} title={null} width={640}>
          {open && <SearchPanel onClose={() => setOpen(false)} onOpen={openPreview} />}
        </Modal>
        <QuickView preview={preview} onClose={() => setPreview(null)} />
      </>
    );
  };

  return { GlobalSearchProvider };
}
