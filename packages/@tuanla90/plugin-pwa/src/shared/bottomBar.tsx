import React from 'react';
import { theme } from 'antd';
import { IconByKey } from '@tuanla90/shared';

// ---------------------------------------------------------------------------
// Bottom navigation bar (mobile-app style tab bar). Lane-agnostic: imports NO
// @nocobase/client* (icons come through the @tuanla90/shared registry, fed once
// per lane via setIconRegistry). Pure presentation — the provider decides
// visibility, current page, and how to navigate.
// ---------------------------------------------------------------------------

export interface BarItem {
  key: string;
  label?: string;
  icon?: string; // icon registry key, e.g. "homeoutlined"
  schemaUid?: string; // desktopRoutes page schemaUid to open
}

export type ShowOn = 'mobileOrStandalone' | 'standalone' | 'mobile' | 'always';
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
  items?: BarItem[];
  style?: BarStyleConfig;
}

export const BOTTOM_BAR_DEFAULTS: BottomBarConfig = {
  enabled: false,
  showOn: 'mobileOrStandalone',
  items: [],
  style: { preset: 'mobile' },
};

export const MAX_ITEMS = 5;
export const MOBILE_MAX_WIDTH = 820; // px — at/below this the bar counts as "mobile"

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

const SafeIcon: React.FC<{ type?: string; size: number }> = ({ type, size }) => (
  <span style={{ fontSize: size, lineHeight: 1, display: 'inline-flex' }}>
    <IconByKey type={type} />
  </span>
);

/**
 * The bottom bar. When `preview` is set it renders in-flow (position: relative) for the settings
 * preview; otherwise it is fixed to the viewport bottom.
 */
export const BottomBar: React.FC<{
  items: BarItem[];
  activeKey?: string;
  style?: BarStyleConfig;
  themeColor?: string;
  onNavigate?: (item: BarItem) => void;
  preview?: boolean;
}> = ({ items, activeKey, style, themeColor, onNavigate, preview }) => {
  const { token } = theme.useToken();
  const s = resolveBarStyle(style, token, themeColor);
  const list = (items || []).slice(0, MAX_ITEMS);
  if (!list.length) return null;

  const midIndex = s.centerFab && list.length % 2 === 1 ? Math.floor(list.length / 2) : -1;

  const container: React.CSSProperties = preview
    ? {
        position: 'relative',
        width: '100%',
        display: 'flex',
        alignItems: 'stretch',
        height: s.height,
        background: s.background,
        borderTop: `1px solid ${token.colorBorderSecondary}`,
        borderRadius: s.rounded ? '16px 16px 0 0' : 0,
        boxShadow: s.shadow ? '0 -2px 12px rgba(0,0,0,0.10)' : 'none',
        overflow: 'hidden',
      }
    : {
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 990,
        display: 'flex',
        alignItems: 'stretch',
        height: s.height,
        paddingBottom: 'env(safe-area-inset-bottom)',
        background: s.background,
        borderTop: `1px solid ${token.colorBorderSecondary}`,
        borderRadius: s.rounded ? '16px 16px 0 0' : 0,
        boxShadow: s.shadow ? '0 -2px 14px rgba(0,0,0,0.12)' : 'none',
      };

  return (
    <nav style={container} aria-label="app-bottom-bar">
      {list.map((item, i) => {
        const active = activeKey ? item.key === activeKey : false;
        const color = active ? s.activeColor : s.inactiveColor;
        const showLabel = s.showLabels === 'always' || (s.showLabels === 'active' && active);
        const isFab = i === midIndex;

        if (isFab) {
          return (
            <button
              key={item.key}
              type="button"
              title={item.label}
              onClick={() => onNavigate?.(item)}
              style={{
                flex: 1,
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: 3,
                position: 'relative',
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  top: -18,
                  width: 48,
                  height: 48,
                  borderRadius: '50%',
                  background: s.activeColor,
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.22)',
                }}
              >
                <SafeIcon type={item.icon} size={s.iconSize + 2} />
              </span>
              {showLabel ? (
                <span style={{ fontSize: 11, color, marginTop: 26, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.label}
                </span>
              ) : (
                <span style={{ height: 26 }} />
              )}
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
              <span style={{ position: 'absolute', top: 0, width: 28, height: 3, borderRadius: 3, background: s.activeColor }} />
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

// Small helper: turn a #rrggbb (or any CSS color that yields rgb) into an rgba() with the given alpha.
function hexAlpha(color: string, alpha: number): string {
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
