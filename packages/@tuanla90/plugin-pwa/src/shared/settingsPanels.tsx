import React, { useEffect, useMemo, useState } from 'react';
import { Button, ColorPicker, Input, InputNumber, Segmented, Select, Space, Switch, Typography, theme } from 'antd';
import { COLOR_PRESETS, colorToString, RegistryIconPicker } from '@tuanla90/shared';
import { t } from './i18n';
import { BottomBar, BottomBarConfig, BarItem, BarStyleConfig, MAX_ITEMS, resolveBarStyle, Placement, SafeIcon } from './bottomBar';
import { FabMenu } from './fabMenu';
import { InstallConfig } from './installPrompt';

// Settings panels for the Bottom bar + Install tabs. Kept out of pwa.tsx to keep that file focused
// on the manifest injector; both are pure controlled components driven by the parent's cfg state.

const label: React.CSSProperties = { fontWeight: 500, marginBottom: 6, fontSize: 13 };
const uid = () => 'it' + Math.random().toString(36).slice(2, 9);

interface PageOpt {
  schemaUid: string;
  title: string;
  icon?: string;
  label: string;
}

/** Fetch navigable desktop pages (page/flowPage with a schemaUid), labelled with their parent group. */
function usePages(api: any): { pages: PageOpt[]; byUid: Record<string, PageOpt>; loading: boolean } {
  const [pages, setPages] = useState<PageOpt[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    if (!api) return;
    api
      .request({ url: 'desktopRoutes:list', params: { pageSize: 300, sort: ['sort'], tree: false } })
      .then((res: any) => {
        const rows: any[] = res?.data?.data || [];
        const byId: Record<string, any> = {};
        rows.forEach((r) => (byId[r.id] = r));
        const navigable = rows
          .filter((r) => (r.type === 'page' || r.type === 'flowPage') && r.schemaUid && !r.hideInMenu)
          .map((r) => {
            const parent = r.parentId ? byId[r.parentId] : null;
            const prefix = parent && parent.title ? `${parent.title} / ` : '';
            return { schemaUid: r.schemaUid, title: r.title || r.schemaUid, icon: r.icon, label: `${prefix}${r.title || r.schemaUid}` };
          });
        if (alive) setPages(navigable);
      })
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [api]);
  const byUid = useMemo(() => {
    const m: Record<string, PageOpt> = {};
    pages.forEach((p) => (m[p.schemaUid] = p));
    return m;
  }, [pages]);
  return { pages, byUid, loading };
}

/** Fetch collections (name + title) for the badge "count from collection" picker. */
function useCollections(api: any): { name: string; title: string }[] {
  const [cols, setCols] = useState<{ name: string; title: string }[]>([]);
  useEffect(() => {
    let alive = true;
    if (!api) return;
    api
      .request({ url: 'collections:list', params: { paginate: false, fields: ['name', 'title'] } })
      .then((res: any) => {
        const rows: any[] = res?.data?.data || [];
        if (alive) setCols(rows.map((r) => ({ name: r.name, title: r.title || r.name })).sort((a, b) => a.title.localeCompare(b.title)));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [api]);
  return cols;
}

// ---------------------------------------------------------------------------
// Bottom bar panel
// ---------------------------------------------------------------------------

export const BottomBarPanel: React.FC<{
  value: BottomBarConfig;
  onChange: (v: BottomBarConfig) => void;
  api: any;
  themeColor?: string;
}> = ({ value, onChange, api, themeColor }) => {
  const { token } = theme.useToken();
  const { pages, byUid } = usePages(api);
  const collections = useCollections(api);
  const [badgeOpen, setBadgeOpen] = useState<Record<string, boolean>>({});
  const cfg = value || {};
  const items: BarItem[] = cfg.items || [];
  const style: BarStyleConfig = cfg.style || { preset: 'mobile' };
  const placement: Placement = cfg.placement || 'bottom';
  const resolved = resolveBarStyle(style, token, themeColor);

  const set = (patch: Partial<BottomBarConfig>) => onChange({ ...cfg, ...patch });
  const setStyle = (patch: Partial<BarStyleConfig>) => set({ style: { ...style, ...patch } });
  const setItems = (next: BarItem[]) => set({ items: next });

  const addItem = () => {
    if (items.length >= MAX_ITEMS) return;
    setItems([...items, { key: uid() }]);
  };
  const patchItem = (i: number, patch: Partial<BarItem>) => {
    const next = items.slice();
    next[i] = { ...next[i], ...patch };
    setItems(next);
  };
  const patchBadge = (i: number, patch: Record<string, any>) => {
    const next = items.slice();
    next[i] = { ...next[i], badge: { ...(next[i].badge || {}), ...patch } };
    setItems(next);
  };
  const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i));
  const moveItem = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = items.slice();
    [next[i], next[j]] = [next[j], next[i]];
    setItems(next);
  };
  // When a page is chosen, auto-fill empty label/icon from the route.
  const pickPage = (i: number, schemaUid: string) => {
    const p = byUid[schemaUid];
    const it = items[i];
    patchItem(i, {
      schemaUid,
      label: it.label || p?.title || '',
      icon: it.icon || p?.icon || undefined,
    });
  };

  const setPreset = (preset: 'mobile' | 'appsheet' | 'custom') =>
    // Keep colors, reset the layout knobs so the new preset's look shows cleanly.
    set({ style: { preset, background: style.background, activeColor: style.activeColor, inactiveColor: style.inactiveColor } });

  const previewItems: BarItem[] = items.filter((it) => it.schemaUid || it.label).length
    ? items
    : [
        { key: 'd1', label: t('Home'), icon: 'homeoutlined' },
        { key: 'd2', label: t('List'), icon: 'unorderedlistoutlined' },
        { key: 'd3', label: t('Me'), icon: 'useroutlined' },
      ];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Switch checked={cfg.enabled !== false && !!cfg.enabled} onChange={(v) => set({ enabled: v })} />
        <div>
          <div style={{ fontWeight: 600 }}>{t('Show a navigation bar')}</div>
          <div style={{ fontSize: 12, color: token.colorTextTertiary }}>
            {t('Up to 5 shortcuts to your pages, shown as a bar / button / avatar-menu.')}
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={label}>{t('Placement')}</div>
        <Segmented
          value={placement}
          onChange={(v) => set({ placement: v as Placement })}
          options={[
            { label: t('Bottom bar'), value: 'bottom' },
            { label: t('Top bar'), value: 'top' },
            { label: t('Floating dock'), value: 'floating' },
            { label: t('Floating button'), value: 'fab' },
            { label: t('Avatar menu'), value: 'avatar' },
          ]}
        />
      </div>

      <div style={{ marginBottom: 18 }}>
        <div style={label}>{t('Show when')}</div>
        <Segmented
          value={cfg.showOn || 'mobileOrStandalone'}
          onChange={(v) => set({ showOn: v as any })}
          options={[
            { label: t('Mobile + installed app'), value: 'mobileOrStandalone' },
            { label: t('Installed app only'), value: 'standalone' },
            { label: t('Mobile screens only'), value: 'mobile' },
            { label: t('Always'), value: 'always' },
          ]}
        />
        {placement === 'avatar' ? (
          <div style={{ fontSize: 12, color: token.colorTextTertiary, marginTop: 6 }}>
            {t('Avatar-menu shortcuts always show in the account menu (this rule is ignored).')}
          </div>
        ) : (cfg.showOn || 'mobileOrStandalone') !== 'always' ? (
          <div style={{ fontSize: 12, color: token.colorTextWarning || token.colorTextTertiary, marginTop: 6 }}>
            {t('Note: hidden on wide desktop screens. Resize the window below 820px, open on a phone / installed app, or choose “Always” to see it.')}
          </div>
        ) : null}
      </div>

      <Typography.Text strong>{t('Items (max 5)')}</Typography.Text>
      <div style={{ marginTop: 8, marginBottom: 8 }}>
        {items.length === 0 ? (
          <div style={{ color: token.colorTextTertiary, fontSize: 13, padding: '6px 0' }}>
            {t('No items yet. Add up to 5 shortcuts.')}
          </div>
        ) : null}
        {items.map((it, i) => (
          <div
            key={it.key || i}
            style={{
              padding: 8,
              marginBottom: 8,
              border: `1px solid ${token.colorBorderSecondary}`,
              borderRadius: 8,
              background: token.colorFillQuaternary,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: token.colorTextQuaternary, width: 18, textAlign: 'center', fontSize: 12 }}>{i + 1}</span>
              <Select
                showSearch
                placeholder={t('Choose a page')}
                value={it.schemaUid || undefined}
                onChange={(v) => pickPage(i, v)}
                options={pages.map((p) => ({ label: p.label, value: p.schemaUid }))}
                optionFilterProp="label"
                style={{ flex: 1, minWidth: 160 }}
              />
              <Input placeholder={t('Label')} value={it.label || ''} onChange={(e) => patchItem(i, { label: e.target.value })} style={{ width: 120 }} />
              <RegistryIconPicker value={it.icon} onChange={(v: string) => patchItem(i, { icon: v })} placeholder={t('Icon')} />
              <Button
                size="small"
                type={it.badge?.enabled ? 'primary' : 'default'}
                onClick={() => setBadgeOpen((o) => ({ ...o, [it.key]: !o[it.key] }))}
                title={t('Badge')}
                style={{ flex: 'none' }}
              >
                {t('Badge')}
              </Button>
              <Button type="text" size="small" disabled={i === 0} onClick={() => moveItem(i, -1)} title={t('Move up')}>
                ↑
              </Button>
              <Button type="text" size="small" disabled={i === items.length - 1} onClick={() => moveItem(i, 1)} title={t('Move down')}>
                ↓
              </Button>
              <Button type="text" size="small" danger onClick={() => removeItem(i)} title={t('Remove')}>
                ✕
              </Button>
            </div>

            {badgeOpen[it.key] ? (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px dashed ${token.colorBorderSecondary}` }}>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <div>
                    <div style={label}>{t('Show badge')}</div>
                    <Switch size="small" checked={!!it.badge?.enabled} onChange={(v) => patchBadge(i, { enabled: v })} />
                  </div>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={label}>{t('Count from collection')}</div>
                    <Select
                      showSearch
                      allowClear
                      placeholder={t('Choose a collection')}
                      value={it.badge?.collection || undefined}
                      onChange={(v) => patchBadge(i, { collection: v })}
                      options={collections.map((c) => ({ label: `${c.title} (${c.name})`, value: c.name }))}
                      optionFilterProp="label"
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div>
                    <div style={label}>{t('Color')}</div>
                    <ColorPicker
                      allowClear
                      value={it.badge?.color || undefined}
                      onChange={(c) => patchBadge(i, { color: c ? colorToString(c) : '' })}
                      presets={COLOR_PRESETS}
                    />
                  </div>
                  <div>
                    <div style={label}>{t('Dot only')}</div>
                    <Switch size="small" checked={!!it.badge?.dot} onChange={(v) => patchBadge(i, { dot: v })} />
                  </div>
                </div>
                <div style={{ marginTop: 10 }}>
                  <div style={label}>{t('Filter (optional, JSON)')}</div>
                  <Input.TextArea
                    rows={2}
                    placeholder='{"status":"pending"}'
                    value={typeof it.badge?.filter === 'string' ? it.badge?.filter : it.badge?.filter ? JSON.stringify(it.badge.filter) : ''}
                    onChange={(e) => patchBadge(i, { filter: e.target.value })}
                    style={{ fontFamily: 'monospace', fontSize: 12 }}
                  />
                  <div style={{ fontSize: 11, color: token.colorTextTertiary, marginTop: 4 }}>
                    {t('Leave empty to count all rows. Otherwise a NocoBase filter object.')}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ))}
        <Button onClick={addItem} disabled={items.length >= MAX_ITEMS} type="dashed" size="small">
          + {t('Add item')} ({items.length}/{MAX_ITEMS})
        </Button>
      </div>

      <Typography.Text strong style={{ display: 'block', marginTop: 18, marginBottom: 8 }}>
        {t('Display style')}
      </Typography.Text>
      <Segmented
        value={style.preset || 'mobile'}
        onChange={(v) => setPreset(v as any)}
        options={[
          { label: t('Mobile legacy'), value: 'mobile' },
          { label: t('AppSheet'), value: 'appsheet' },
          { label: t('Custom'), value: 'custom' },
        ]}
        style={{ marginBottom: 14 }}
      />

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <div style={label}>{t('Background')}</div>
          <ColorPicker
            allowClear
            value={style.background || undefined}
            onChange={(c, hex) => setStyle({ background: c ? colorToString(c) : '' })}
            presets={COLOR_PRESETS}
            showText
          />
        </div>
        <div>
          <div style={label}>{t('Active color')}</div>
          <ColorPicker
            allowClear
            value={style.activeColor || undefined}
            onChange={(c) => setStyle({ activeColor: c ? colorToString(c) : '' })}
            presets={COLOR_PRESETS}
            showText
          />
        </div>
        <div>
          <div style={label}>{t('Inactive color')}</div>
          <ColorPicker
            allowClear
            value={style.inactiveColor || undefined}
            onChange={(c) => setStyle({ inactiveColor: c ? colorToString(c) : '' })}
            presets={COLOR_PRESETS}
            showText
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 14, alignItems: 'flex-end' }}>
        <div>
          <div style={label}>{t('Labels')}</div>
          <Segmented
            value={resolved.showLabels}
            onChange={(v) => setStyle({ showLabels: v as any })}
            options={[
              { label: t('Always'), value: 'always' },
              { label: t('Active only'), value: 'active' },
              { label: t('Hidden'), value: 'never' },
            ]}
          />
        </div>
        <div>
          <div style={label}>{t('Active indicator')}</div>
          <Segmented
            value={resolved.indicator}
            onChange={(v) => setStyle({ indicator: v as any })}
            options={[
              { label: t('None'), value: 'none' },
              { label: t('Line'), value: 'line' },
              { label: t('Pill'), value: 'pill' },
              { label: t('Dot'), value: 'dot' },
            ]}
          />
        </div>
        <div>
          <div style={label}>{t('Height')}</div>
          <InputNumber
            min={48}
            max={84}
            value={resolved.height}
            onChange={(v) => setStyle({ height: v || undefined })}
            addonAfter="px"
            style={{ width: 110 }}
          />
        </div>
      </div>

      <Space size="large" style={{ marginBottom: 18 }}>
        <Space>
          <Switch checked={resolved.rounded} onChange={(v) => setStyle({ rounded: v })} size="small" />
          <span style={{ fontSize: 13 }}>{t('Rounded top')}</span>
        </Space>
        <Space>
          <Switch checked={resolved.shadow} onChange={(v) => setStyle({ shadow: v })} size="small" />
          <span style={{ fontSize: 13 }}>{t('Shadow')}</span>
        </Space>
        <Space>
          <Switch checked={resolved.centerFab} onChange={(v) => setStyle({ centerFab: v })} size="small" />
          <span style={{ fontSize: 13 }}>{t('Raised center button')}</span>
        </Space>
      </Space>

      <div>
        <div style={label}>{t('Preview')}</div>
        {placement === 'fab' ? (
          <div style={{ position: 'relative', height: 240, maxWidth: 380, border: `1px solid ${token.colorBorder}`, borderRadius: 12, overflow: 'hidden', background: token.colorBgLayout }}>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: token.colorTextQuaternary, fontSize: 12 }}>
              {t('Page content')}
            </div>
            <FabMenu items={previewItems} activeKey={previewItems[0]?.key} themeColor={themeColor} preview />
          </div>
        ) : placement === 'avatar' ? (
          <div style={{ maxWidth: 380, border: `1px solid ${token.colorBorder}`, borderRadius: 12, padding: 12, background: token.colorBgLayout, display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ width: 220, background: token.colorBgElevated, borderRadius: 10, boxShadow: token.boxShadowSecondary, padding: 6 }}>
              {previewItems.map((it) => (
                <div key={it.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, color: token.colorText, fontSize: 13 }}>
                  <span style={{ width: 18, display: 'inline-flex', justifyContent: 'center', color: token.colorTextSecondary }}>
                    <SafeIcon type={it.icon} size={16} />
                  </span>
                  <span>{it.label}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ maxWidth: 380, border: `1px solid ${token.colorBorder}`, borderRadius: 12, overflow: 'hidden', background: token.colorBgLayout, display: 'flex', flexDirection: 'column' }}>
            {placement === 'top' ? (
              <BottomBar items={previewItems} activeKey={previewItems[0]?.key} style={style} placement="top" themeColor={themeColor} preview />
            ) : null}
            <div style={{ height: 96, display: 'flex', alignItems: 'center', justifyContent: 'center', color: token.colorTextQuaternary, fontSize: 12 }}>
              {t('Page content')}
            </div>
            {placement !== 'top' ? (
              <BottomBar items={previewItems} activeKey={previewItems[0]?.key} style={style} placement={placement} themeColor={themeColor} preview />
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Install suggestion panel
// ---------------------------------------------------------------------------

export const InstallPanel: React.FC<{ value: InstallConfig; onChange: (v: InstallConfig) => void }> = ({ value, onChange }) => {
  const { token } = theme.useToken();
  const cfg = value || {};
  const set = (patch: Partial<InstallConfig>) => onChange({ ...cfg, ...patch });
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Switch checked={cfg.enabled !== false} onChange={(v) => set({ enabled: v })} />
        <div>
          <div style={{ fontWeight: 600 }}>{t('Suggest installing the app')}</div>
          <div style={{ fontSize: 12, color: token.colorTextTertiary }}>
            {t('Show an “Install app” prompt so users can add the icon to their home screen. Hidden once installed.')}
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={label}>{t('Style')}</div>
        <Segmented
          value={cfg.position || 'pill'}
          onChange={(v) => set({ position: v as any })}
          options={[
            { label: t('Floating pill'), value: 'pill' },
            { label: t('Bottom banner'), value: 'banner' },
            { label: t('Top banner'), value: 'bannerTop' },
            { label: t('Floating button'), value: 'fab' },
            { label: t('Avatar menu'), value: 'avatar' },
          ]}
        />
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={label}>{t('Title')}</div>
          <Input value={cfg.title || ''} placeholder={t('Install app')} onChange={(e) => set({ title: e.target.value })} />
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={label}>{t('Description')}</div>
          <Input
            value={cfg.description || ''}
            placeholder={t('Add to your home screen for quick access.')}
            onChange={(e) => set({ description: e.target.value })}
          />
        </div>
      </div>

      <div style={{ marginTop: 16, fontSize: 12, color: token.colorTextTertiary, maxWidth: 520 }}>
        {t('On Android/desktop Chrome & Edge the prompt appears automatically when installable. On iPhone/iPad it shows Safari “Add to Home Screen” steps.')}
      </div>
    </div>
  );
};
