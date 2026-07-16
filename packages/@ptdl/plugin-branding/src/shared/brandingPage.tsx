import React from 'react';
import { Select, Space, Tabs, Tag, Tooltip } from 'antd';
import { BrandingSkinPage } from './skin';
import { BrandingHeaderPage } from './headerNav';
import { BrandingTypographyPage } from './typography';
import { BrandingBackupPage } from './backup';
import { GLOBAL_SCOPE, currentThemeUid, listThemes, type ThemeInfo } from './themeScope';

// Lucide-style glyphs (inline SVG — no dependency) for the theme-scope picker.
const gsvg = (children: React.ReactNode) => (
  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none' }}>
    {children}
  </svg>
);
const ICON = {
  all: gsvg(
    <>
      <rect width={7} height={7} x={3} y={3} rx={1} />
      <rect width={7} height={7} x={14} y={3} rx={1} />
      <rect width={7} height={7} x={14} y={14} rx={1} />
      <rect width={7} height={7} x={3} y={14} rx={1} />
    </>,
  ),
  sun: gsvg(
    <>
      <circle cx={12} cy={12} r={4} />
      <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </>,
  ),
  moon: gsvg(<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />),
  star: (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="currentColor" style={{ flex: 'none', opacity: 0.65 }}>
      <path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14l-5-4.87 6.91-1.01L12 2Z" />
    </svg>
  ),
};
function themeLabel(icon: React.ReactNode, text: string, isDefault?: boolean) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {icon}
      {text}
      {isDefault ? ICON.star : null}
    </span>
  );
}

/**
 * Single Settings entry ("Branding & Theme") hosting every branding area as tabs. A shared **theme
 * scope** selector at the top lets you configure a different look per NocoBase theme; a theme with no
 * override inherits the "Default (all themes)" row. (Wired for Skin first; other tabs follow.)
 */
export function BrandingPage({ t, apiClient }: { t?: (s: string) => string; apiClient?: any }): React.ReactElement {
  const tr = t || ((s: string) => s);
  const [themes, setThemes] = React.useState<ThemeInfo[]>([]);
  const [scope, setScope] = React.useState<string>(() => currentThemeUid());
  const active = currentThemeUid();

  React.useEffect(() => {
    if (apiClient) listThemes(apiClient).then(setThemes);
  }, [apiClient]);

  const options = [
    { value: GLOBAL_SCOPE, label: themeLabel(ICON.all, tr('Default (all themes)')) },
    ...themes.map((th) => ({ value: th.uid, label: themeLabel(th.dark ? ICON.moon : ICON.sun, th.name, th.isDefault) })),
  ];

  // The theme-scope picker lives on the right of the tab bar (compact, shared across all tabs).
  const scopeSelector = (
    <Space size={6} align="center" style={{ paddingRight: 12 }}>
      <span style={{ fontSize: 12, color: 'var(--colorTextTertiary, #999)' }}>{tr('Editing for')}:</span>
      <Select size="small" value={scope} onChange={setScope} options={options} style={{ minWidth: 190 }} />
      {scope && scope === active ? (
        <Tag color="blue" style={{ margin: 0 }}>{tr('current theme')}</Tag>
      ) : (
        <Tooltip title={tr('Switch to that theme to see it applied. A theme with no override inherits “Default”.')}>
          <Tag style={{ margin: 0 }}>{scope ? tr('per-theme override') : tr('shared default')}</Tag>
        </Tooltip>
      )}
    </Space>
  );

  // Standard NocoBase settings container: a white, bordered, radius-8 card (matches change-log /
  // print-template). The four areas are tabs at the top of the card; content pads itself inside.
  return (
    <div style={{ padding: '8px 16px 16px' }}>
      <div
        style={{
          background: 'var(--colorBgContainer, #fff)',
          border: '0.8px solid var(--colorBorderSecondary, #f0f0f0)',
          borderRadius: 8,
        }}
      >
        <Tabs
          tabBarStyle={{ margin: 0, paddingInline: 16 }}
          tabBarExtraContent={{ right: scopeSelector }}
          items={[
            { key: 'skin', label: tr('Admin skin'), children: <BrandingSkinPage scopeUid={scope || undefined} /> },
            { key: 'typography', label: tr('Typography & tables'), children: <BrandingTypographyPage scopeUid={scope || undefined} /> },
            { key: 'header', label: tr('Header & Logo'), children: <BrandingHeaderPage scopeUid={scope || undefined} /> },
            { key: 'backup', label: tr('Import / export'), children: <BrandingBackupPage /> },
          ]}
        />
      </div>
    </div>
  );
}
