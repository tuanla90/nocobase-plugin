import React from 'react';
import { theme } from 'antd';
import { IconByKey } from '@tuanla90/shared';

// ---------------------------------------------------------------------------
// Navigation bar (mobile-app style tab bar). Lane-agnostic: imports NO
// @nocobase/client* (icons come through the @tuanla90/shared registry, fed once
// per lane via setIconRegistry). Pure presentation — the provider decides
// visibility, current page, and how to navigate. Handles the bar placements
// (bottom / top / floating); the FAB + avatar-menu placements live elsewhere.
// ---------------------------------------------------------------------------

export interface BarItem {
  key: string;
  label?: string;
  icon?: string; // icon registry key, e.g. "homeoutlined"
  schemaUid?: string; // desktopRoutes page schemaUid to open
}

export type ShowOn = 'mobileOrStandalone' | 'standalone' | 'mobile' | 'always';
export type Placement = 'bottom' | 'top' | 'floating' | 'fab' | 'avatar';
export type BarPreset = 'mobile' | 'appsheet' | 'custom';
export type ShowLabels = 'always' | 'active' | 'never';
export type Indicator = 'none' | 'line' | 'pill' | 'dot';

export interface BarStyleConfig {
  preset?: BarPreset;
  background?: string;
  activeColor?: string;
  inactiveColor?: string;
  showLabels?: ShowLabels;
  indicator?: Indicator;
  rounded?: boolean;
  shadow?: boolean;
  iconSize?: number;
  height?: number;
  centerFab?: boolean;
}

export interface BottomBarConfig {
  enabled?: boolean;
  showOn?: ShowOn;
  placement?: Placement;
  items?: BarItem[];
  style?: BarStyleConfig;
}

export const BOTTOM_BAR_DEFAULTS: BottomBarConfig = {
  enabled: false,
  showOn: 'mobileOrStandalone',
  placement: 'bottom',
  items: [],
  style: { preset: 'mobile' },
};

export const MAX_ITEMS = 5;
export const MOBILE_MAX_WIDTH = 820; // px — at/below this the bar counts as "mobile"
const FAB_SIZE = 46;
const FLOAT_MARGIN = 12;

// Per-preset baseline for the knobs a preset controls. `custom` inherits `mobile` then the user
// overrides individual knobs. Colors left '' resolve to theme tokens / the PWA theme color.
const PRESET_BASE: Record<BarPreset, Required<Omit<BarStyleConfig, 'preset' | 'background' | 'activeColor' | 'inactiveColor'>>> = {
  mobile: { showLabels: 'always', indicator: 'none', rounded: false, shadow: false, iconSize: 22, height: 56, centerFab: false },
  appsheet: { showLabels: 'always', indicator: 'pill', rounded: true, shadow: true, iconSize: 22, height: 62, centerFab: false },
  custom: { showLabels: 'always', indicator: 'none', rounded: false, shadow: false, iconSize: 22, height: 56, centerFab: false },
};

export interface ResolvedBarStyle {
  background: string;
  activeColor: string;
  inactiveColor: string;
  showLabels: ShowLabels;
  indicator: Indicator;
  rounded: boolean;
  shadow: boolean;
  iconSize: number;
  height: number;
  centerFab: boolean;
}

/** Merge a style config over its preset baseline and resolve theme-dependent colors to concrete values. */
export function resolveBarStyle(style: BarStyleConfig | undefined, token: any, themeColor?: string): ResolvedBarStyle {
  const cfg = style || {};
  const preset: BarPreset = cfg.preset || 'mobile';
  const base = PRESET_BASE[preset] || PRESET_BASE.mobile;
  const pick = <K extends keyof typeof base>(k: K) => (cfg[k as keyof BarStyleConfig] ?? base[k]) as (typeof base)[K];
  return {
    background: (cfg.background && cfg.background.trim()) || token.colorBgElevated,
    activeColor: (cfg.activeColor && cfg.activeColor.trim()) || themeColor || token.colorPrimary,
    inactiveColor: (cfg.inactiveColor && cfg.inactiveColor.trim()) || token.colorTextTertiary,
    showLabels: pick('showLabels'),
    indicator: pick('indicator'),
    rounded: pick('rounded'),
    shadow: pick('shadow'),
    iconSize: pick('iconSize'),
    height: pick('height'),
    centerFab: pick('centerFab'),
  };
}

/** Total height the bar occupies (used by the provider to reserve content space / lift the install pill). */
export function barHeight(style: BarStyleConfig | undefined): number {
  const preset: BarPreset = style?.preset || 'mobile';
  return style?.height ?? (PRESET_BASE[preset] || PRESET_BASE.mobile).height;
}

export function hexAlpha(color: string, alpha: number): string {
  const c = (color || '').trim();
  const m = /^#([0-9a-f]{6})$/i.exec(c);
  if (m) {
    const n = parseInt(m[1], 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }
  const m3 = /^#([0-9a-f]{3})$/i.exec(c);
  if (m3) {
    const r = parseInt(m3[1][0] + m3[1][0], 16);
    const g = parseInt(m3[1][1] + m3[1][1], 16);
    const b = parseInt(m3[1][2] + m3[1][2], 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return c || 'transparent';
}

export const SafeIcon: React.FC<{ type?: string; size: number }> = ({ type, size }) => (
  <span style={{ fontSize: size, lineHeight: 1, display: 'inline-flex' }}>
    <IconByKey type={type} />
  </span>
);

/**
 * The navigation bar for the bottom / top / floating placements. When `preview` is set it renders
 * in-flow for the settings preview; otherwise it is fixed to the viewport edge.
 */
export const BottomBar: React.FC<{
  items: BarItem[];
  activeKey?: string;
  style?: BarStyleConfig;
  themeColor?: string;
  placement?: Placement;
  onNavigate?: (item: BarItem) => void;
  preview?: boolean;
}> = ({ items, activeKey, style, themeColor, placement = 'bottom', onNavigate, preview }) => {
  const { token } = theme.useToken();
  const s = resolveBarStyle(style, token, themeColor);
  const list = (items || []).slice(0, MAX_ITEMS);
  if (!list.length) return null;

  const floating = placement === 'floating';
  const atTop = placement === 'top';
  // A raised centre button only makes sense pointing up out of a bottom/floating bar.
  const fabEnabled = s.centerFab && !atTop && list.length % 2 === 1;
  const midIndex = fabEnabled ? Math.floor(list.length / 2) : -1;
  const rounded = floating ? true : s.rounded;
  const shadow = floating ? true : s.shadow;

  const base: React.CSSProperties = {
    display: 'flex',
    alignItems: 'stretch',
    height: s.height,
    background: s.background,
    boxShadow: shadow ? (atTop ? '0 2px 14px rgba(0,0,0,0.12)' : '0 -2px 14px rgba(0,0,0,0.12)') : 'none',
    overflow: 'visible',
  };

  let container: React.CSSProperties;
  if (preview) {
    container = {
      ...base,
      position: 'relative',
      width: floating ? `calc(100% - ${FLOAT_MARGIN * 2}px)` : '100%',
      margin: floating ? `0 ${FLOAT_MARGIN}px ${FLOAT_MARGIN}px` : 0,
      borderRadius: rounded ? (floating ? 18 : '16px 16px 0 0') : 0,
      border: floating ? `1px solid ${token.colorBorderSecondary}` : 'none',
      borderTop: floating || atTop ? undefined : `1px solid ${token.colorBorderSecondary}`,
    };
  } else if (floating) {
    container = {
      ...base,
      position: 'fixed',
      left: FLOAT_MARGIN,
      right: FLOAT_MARGIN,
      bottom: `calc(${FLOAT_MARGIN}px + env(safe-area-inset-bottom))`,
      zIndex: 990,
      borderRadius: 18,
      border: `1px solid ${token.colorBorderSecondary}`,
    };
  } else if (atTop) {
    container = {
      ...base,
      position: 'fixed',
      left: 0,
      right: 0,
      top: 0,
      zIndex: 990,
      borderBottom: `1px solid ${token.colorBorderSecondary}`,
      borderRadius: rounded ? '0 0 16px 16px' : 0,
    };
  } else {
    // bottom
    container = {
      ...base,
      position: 'fixed',
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 990,
      paddingBottom: 'env(safe-area-inset-bottom)',
      borderTop: `1px solid ${token.colorBorderSecondary}`,
      borderRadius: rounded ? '16px 16px 0 0' : 0,
    };
  }

  return (
    <nav style={container} aria-label="app-nav-bar">
      {list.map((item, i) => {
        const active = activeKey ? item.key === activeKey : false;
        const color = active ? s.activeColor : s.inactiveColor;
        const showLabel = s.showLabels === 'always' || (s.showLabels === 'active' && active);

        if (i === midIndex) {
          return (
            <button
              key={item.key}
              type="button"
              title={item.label}
              onClick={() => onNavigate?.(item)}
              style={{
                flex: 1,
                minWidth: 0,
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                position: 'relative',
                overflow: 'visible',
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: -(FAB_SIZE / 2),
                  transform: 'translateX(-50%)',
                  width: FAB_SIZE,
                  height: FAB_SIZE,
                  borderRadius: '50%',
                  background: s.activeColor,
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 6px 16px rgba(0,0,0,0.28)',
                }}
              >
                <SafeIcon type={item.icon} size={s.iconSize + 2} />
              </span>
              {showLabel ? (
                <span
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: 6,
                    textAlign: 'center',
                    fontSize: 11,
                    color,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    padding: '0 4px',
                  }}
                >
                  {item.label}
                </span>
              ) : null}
            </button>
          );
        }

        return (
          <button
            key={item.key}
            type="button"
            title={item.label}
            onClick={() => onNavigate?.(item)}
            style={{
              flex: 1,
              minWidth: 0,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 3,
              color,
              position: 'relative',
              padding: '0 4px',
            }}
          >
            {active && s.indicator === 'line' ? (
              <span style={{ position: 'absolute', top: atTop ? undefined : 0, bottom: atTop ? 0 : undefined, width: 28, height: 3, borderRadius: 3, background: s.activeColor }} />
            ) : null}
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: active && s.indicator === 'pill' ? 46 : s.iconSize + 6,
                height: active && s.indicator === 'pill' ? 26 : s.iconSize + 6,
                borderRadius: 999,
                background: active && s.indicator === 'pill' ? hexAlpha(s.activeColor, 0.14) : 'transparent',
                transition: 'background 0.15s, width 0.15s',
              }}
            >
              <SafeIcon type={item.icon} size={s.iconSize} />
            </span>
            {showLabel ? (
              <span style={{ fontSize: 11, lineHeight: 1.1, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.label}
              </span>
            ) : null}
            {active && s.indicator === 'dot' ? (
              <span style={{ position: 'absolute', bottom: 4, width: 5, height: 5, borderRadius: '50%', background: s.activeColor }} />
            ) : null}
          </button>
        );
      })}
    </nav>
  );
};
