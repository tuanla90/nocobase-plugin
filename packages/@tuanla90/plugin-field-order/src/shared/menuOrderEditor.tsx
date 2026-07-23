import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button, Space, Typography, Tag, message, Spin, Alert, theme, Popconfirm } from 'antd';
import {
  HolderOutlined, ArrowUpOutlined, ArrowDownOutlined, SaveOutlined, ReloadOutlined, MenuOutlined,
} from '@ant-design/icons';
import { readLiveEntries, orderListToMap, applyOrderMap, cacheSettingsMenuOrder, MenuEntry } from './settingsMenuOrder';

const { Title, Text } = Typography;

/**
 * Drag-reorder editor for the Settings-center menu. Reads the LIVE entries from the current lane's
 * manager, lets the user drag (or use ↑/↓) to arrange them, and persists the order app-wide via
 * `ptdlSettingsMenuOrder:set`. Save re-applies + reloads so the sidebar recomputes cleanly.
 *
 * Pure component (props-injected app/api/t) so it is shared by both lanes; each lane wires its own
 * app/apiClient in index.tsx.
 */
export function MenuOrderEditor({
  app,
  api,
  t,
}: {
  app: any;
  api: any;
  t: (s: string, opts?: Record<string, any>) => string;
}) {
  const { token } = theme.useToken();
  const [items, setItems] = useState<MenuEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [customized, setCustomized] = useState(false); // a saved order already exists
  const dragIndex = useRef<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const live = readLiveEntries(app);
      let order: string[] = [];
      try {
        const res = await api?.request?.({ url: 'ptdlSettingsMenuOrder:read', method: 'GET' });
        const data = res?.data?.data ?? res?.data;
        if (Array.isArray(data?.order)) order = data.order.map((x: any) => String(x));
      } catch {
        /* none saved yet */
      }
      setCustomized(order.length > 0);
      if (order.length) {
        // Order the live entries by the saved order; entries added since (new plugins) sink to the
        // bottom in their current order (readLiveEntries already sorted them by their live sort).
        const rank = new Map(order.map((k, i) => [k, i]));
        live.sort((a, b) => {
          const ra = rank.has(a.key) ? (rank.get(a.key) as number) : Number.MAX_SAFE_INTEGER;
          const rb = rank.has(b.key) ? (rank.get(b.key) as number) : Number.MAX_SAFE_INTEGER;
          return ra - rb;
        });
      }
      setItems(live);
      setDirty(false);
    } finally {
      setLoading(false);
    }
  }, [app, api]);

  useEffect(() => { load(); }, [load]);

  // Fixed (pinned/top-level) entries lead the list and cannot be moved; movable rows can only reorder
  // among themselves below that block.
  const firstMovable = items.findIndex((i) => !i.fixed);
  const fixedCount = firstMovable === -1 ? items.length : firstMovable;

  const move = (from: number, to: number) => {
    if (from < 0 || to < 0 || from >= items.length || to >= items.length) return;
    if (items[from]?.fixed) return; // fixed rows don't move
    const dest = Math.max(to, fixedCount); // never above the fixed block
    if (from === dest) return;
    setItems((prev) => {
      const next = prev.slice();
      const [it] = next.splice(from, 1);
      next.splice(dest, 0, it);
      return next;
    });
    setDirty(true);
  };

  const onDrop = (dropIdx: number) => {
    const from = dragIndex.current;
    dragIndex.current = null;
    setOverIndex(null);
    if (from == null) return;
    move(from, dropIdx);
  };

  const save = async () => {
    setSaving(true);
    try {
      const order = items.map((i) => i.key);
      await api.request({ url: 'ptdlSettingsMenuOrder:set', method: 'POST', data: { order } });
      cacheSettingsMenuOrder(order); // seed cache so the reload applies it synchronously
      applyOrderMap(app, orderListToMap(order)); // apply live before the reload
      message.success(t('Saved — reloading to apply…'));
      setTimeout(() => window.location.reload(), 500);
    } catch (e: any) {
      message.error(t('Save failed: {{msg}}', { msg: e?.message || String(e) }));
      setSaving(false);
    }
  };

  const reset = async () => {
    setSaving(true);
    try {
      await api.request({ url: 'ptdlSettingsMenuOrder:set', method: 'POST', data: { order: [] } });
      cacheSettingsMenuOrder([]); // clear cache → reload falls back to the preset
      message.success(t('Reset to default — reloading…'));
      setTimeout(() => window.location.reload(), 500);
    } catch (e: any) {
      message.error(t('Save failed: {{msg}}', { msg: e?.message || String(e) }));
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: '8px 16px 16px', maxWidth: 720, margin: '0 auto' }}>
      <div
        style={{
          background: token.colorBgContainer,
          border: `0.8px solid ${token.colorBorderSecondary}`,
          borderRadius: 8,
          padding: 16,
        }}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Space style={{ width: '100%', justifyContent: 'space-between' }} align="start">
            <div>
              <Title level={4} style={{ margin: 0 }}>
                <MenuOutlined /> {t('Settings menu order')}
              </Title>
              <Text type="secondary">{t('Drag the rows (or use ↑/↓) to arrange the Settings menu. Saved for the whole app.')}</Text>
            </div>
            <Space>
              <Popconfirm
                title={t('Reset to the default order?')}
                okText={t('Reset')}
                cancelText={t('Cancel')}
                onConfirm={reset}
                disabled={saving || (!customized && !dirty)}
              >
                <Button icon={<ReloadOutlined />} disabled={saving || (!customized && !dirty)}>
                  {t('Reset')}
                </Button>
              </Popconfirm>
              <Button type="primary" icon={<SaveOutlined />} loading={saving} disabled={!dirty} onClick={save}>
                {t('Save order')}
              </Button>
            </Space>
          </Space>

          <Alert
            type="info"
            showIcon
            banner
            style={{ padding: '4px 12px' }}
            message={t('Order applies to both the classic (/admin) and modern (/v/) Settings menus. Core entries can be moved too.')}
          />

          <Spin spinning={loading}>
            {items.length === 0 && !loading ? (
              <Alert type="warning" showIcon message={t('No settings entries were found on this page.')} />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {items.map((it, idx) => {
                  const isFixed = !!it.fixed;
                  const canDrag = !saving && !isFixed;
                  return (
                    <div
                      key={it.key}
                      draggable={canDrag}
                      onDragStart={() => { if (canDrag) dragIndex.current = idx; }}
                      onDragEnter={() => { if (!isFixed) setOverIndex(idx); }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => onDrop(idx)}
                      onDragEnd={() => { dragIndex.current = null; setOverIndex(null); }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '6px 10px',
                        borderRadius: 6,
                        border: `1px solid ${overIndex === idx ? token.colorPrimary : token.colorBorderSecondary}`,
                        background: isFixed
                          ? token.colorFillTertiary
                          : overIndex === idx ? token.colorPrimaryBg : token.colorFillQuaternary,
                        opacity: isFixed ? 0.75 : 1,
                        cursor: canDrag ? 'grab' : 'default',
                      }}
                    >
                      <HolderOutlined style={{ color: isFixed ? token.colorTextQuaternary : token.colorTextTertiary }} />
                      <Tag style={{ margin: 0, minWidth: 26, textAlign: 'center' }}>{idx + 1}</Tag>
                      <div style={{ flex: 'auto', minWidth: 0 }}>
                        <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {it.title}
                          {isFixed && <Tag style={{ marginLeft: 8 }}>{t('Fixed')}</Tag>}
                        </div>
                        <Text type="secondary" style={{ fontSize: 11 }}>{it.key}</Text>
                      </div>
                      <Button
                        size="small"
                        type="text"
                        icon={<ArrowUpOutlined />}
                        disabled={saving || isFixed || idx <= fixedCount}
                        onClick={() => move(idx, idx - 1)}
                      />
                      <Button
                        size="small"
                        type="text"
                        icon={<ArrowDownOutlined />}
                        disabled={saving || isFixed || idx === items.length - 1}
                        onClick={() => move(idx, idx + 1)}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </Spin>
        </Space>
      </div>
    </div>
  );
}

export default MenuOrderEditor;
