import React, { useEffect, useState } from 'react';
import { Alert, Badge, Button, Input, Popconfirm, Space, Switch, Table, Tag, Typography, message } from 'antd';
import { ConfigContainer, SettingCard, Hint } from '@tuanla90/shared';
import { t } from './pluginHubClient';

const { Text, Paragraph, Title } = Typography;

const DEFAULT_MANIFEST = 'https://raw.githubusercontent.com/tuanla90/nocobase-plugin/main/latest/index.json';

interface HubConfig { manifestUrl: string; weeklyCheck: boolean; lastChecked: string | null; updatesAvailable: number; }
interface Item {
  packageName: string; slug: string; displayName: string;
  availableVersion: string; installedVersion: string; enabled: boolean;
  status: 'not-installed' | 'disabled' | 'update' | 'up-to-date'; url: string;
}
const DEFAULTS: HubConfig = { manifestUrl: DEFAULT_MANIFEST, weeklyCheck: true, lastChecked: null, updatesAvailable: 0 };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const errMsg = (e: any) => e?.response?.data?.errors?.[0]?.message || e?.response?.data?.error || e?.message || String(e);

const STATUS_META: Record<Item['status'], { color: string; label: string }> = {
  'not-installed': { color: 'default', label: 'Not installed' },
  disabled: { color: 'orange', label: 'Installed (disabled)' },
  update: { color: 'blue', label: 'Update available' },
  'up-to-date': { color: 'green', label: 'Up to date' },
};

const CardHeader: React.FC<{ title: React.ReactNode; extra?: React.ReactNode }> = ({ title, extra }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
    <Text strong style={{ fontSize: 14 }}>{title}</Text>
    {extra}
  </div>
);

// Category grouping for the plugin list — MIRRORS docs-site/generate.cjs SLUG_CAT (keep in sync when adding a plugin).
const CAT_ORDER = ['Admin', 'Fields', 'Blocks', 'UI', 'Data', 'Security'];
const CAT_LABEL_KEY: Record<string, string> = { Admin: 'Admin & tools', Fields: 'Fields', Blocks: 'Blocks & charts', UI: 'Interface', Data: 'Data', Security: 'Security & sign-in' };
const SLUG_CAT: Record<string, string> = {
  'hub': 'Admin', 'nb-cloner': 'Admin',
  'ai-column': 'Fields', 'device-kit': 'Fields', 'field-enhancements': 'Fields', 'field-order': 'Fields', 'formula': 'Fields', 'status-flow': 'Fields', 'inline-field': 'Fields',
  'block-custom-html': 'Blocks', 'conditional-format': 'Blocks', 'detail-panel': 'Blocks', 'enhanced-table-block': 'Blocks', 'filter-tree': 'Blocks', 'layout-containers': 'Blocks', 'spreadsheet-view': 'Blocks', 'subtable-pro': 'Blocks', 'data-visualization-echarts-pro': 'Blocks',
  'app-builder': 'UI', 'branding': 'UI', 'custom-header': 'UI', 'global-search': 'UI', 'instant-create-page': 'UI', 'pwa': 'UI', 'menu-enhancements': 'UI', 'custom-icons': 'UI', 'action-enhancements': 'UI', 'print-template': 'UI',
  'change-log': 'Data', 'gsheet-sync': 'Data', 'line-generator': 'Data',
  'ip-guard': 'Security', 'login-lite': 'Security',
};
const catOf = (slug: string) => SLUG_CAT[slug] || 'UI';
const catRank = (c: string) => { const i = CAT_ORDER.indexOf(c); return i < 0 ? CAT_ORDER.length : i; };

export function PluginHubPane({ api }: { api: any }) {
  const [loading, setLoading] = useState(true);
  const [cfg, setCfg] = useState<HubConfig>(DEFAULTS);
  const [items, setItems] = useState<Item[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [savingCfg, setSavingCfg] = useState(false);
  const [busy, setBusy] = useState<string | null>(null); // packageName being operated on, or '*all*' / '*selected*'
  const [progress, setProgress] = useState('');
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]); // checked rows for batch install/enable/update

  const req = (url: string, data?: any) =>
    api.request({ url, method: 'post', data }).then((r: any) => r?.data?.data ?? r?.data);

  useEffect(() => {
    (async () => {
      try {
        const c = await req('ptdlPluginHub:getConfig');
        setCfg({ ...DEFAULTS, ...(c || {}) });
      } catch { /* keep defaults */ }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onCheck = async (urlOverride?: string) => {
    setChecking(true);
    try {
      const res = await req('ptdlPluginHub:check', { manifestUrl: urlOverride ?? cfg.manifestUrl });
      if (!res?.ok) { message.error(res?.error || t('Could not load the manifest')); return; }
      setItems(res.items || []);
      setCfg((c) => ({ ...c, updatesAvailable: res.updatesAvailable ?? 0, lastChecked: new Date().toISOString() }));
    } catch (e) { message.error(errMsg(e)); }
    finally { setChecking(false); }
  };

  const onSaveCfg = async () => {
    setSavingCfg(true);
    try {
      const saved = await req('ptdlPluginHub:saveConfig', { manifestUrl: cfg.manifestUrl, weeklyCheck: cfg.weeklyCheck });
      setCfg((c) => ({ ...c, ...(saved || {}) }));
      message.success(t('Saved'));
    } catch (e) { message.error(errMsg(e)); }
    finally { setSavingCfg(false); }
  };

  // After a pm command the app reloads (503 "maintaining") — wait for it to come back, then re-check.
  const waitAppReady = async (maxMs = 120000) => {
    const start = Date.now();
    await sleep(3000); // let it enter maintenance first
    while (Date.now() - start < maxMs) {
      try { await api.request({ url: 'app:getInfo', method: 'get' }); return true; }
      catch { await sleep(2500); }
    }
    return false;
  };

  const runOp = async (successMsg: string, key: string, url: string, data: any) => {
    setBusy(key); setProgress(t('Sending command…'));
    try {
      const res = await req(url, data);
      if (!res?.ok) { message.error(res?.error || t('Operation failed')); return false; }
      setProgress(t('The app is reloading — please wait…'));
      await waitAppReady();
      setProgress(t('Refreshing the list…'));
      await onCheck();
      message.success(successMsg);
      return true;
    } catch (e) { message.error(errMsg(e)); return false; }
    finally { setBusy(null); setProgress(''); }
  };

  const onInstall = (it: Item) => runOp(t('Installed — now Enable it'), it.packageName, 'ptdlPluginHub:install', { url: it.url });
  const onEnable = (it: Item) => runOp(t('Enabled'), it.packageName, 'ptdlPluginHub:enable', { packageName: it.packageName });
  const onUpdate = (it: Item) => runOp(t('Updated'), it.packageName, 'ptdlPluginHub:updatePlugin', { url: it.url });
  const onDisable = (it: Item) => runOp(t('Disabled'), it.packageName, 'ptdlPluginHub:disable', { packageName: it.packageName });
  const onUninstall = (it: Item) => runOp(t('Removed'), it.packageName, 'ptdlPluginHub:uninstall', { packageName: it.packageName });

  const onUpdateAll = async () => {
    const todo = (items || []).filter((i) => i.status === 'update');
    if (!todo.length) return;
    setBusy('*all*');
    try {
      for (let i = 0; i < todo.length; i++) {
        setProgress(`${t('Updating')} ${i + 1}/${todo.length}: ${todo[i].displayName}`);
        try {
          const res = await req('ptdlPluginHub:updatePlugin', { url: todo[i].url });
          if (res?.ok) await waitAppReady();
        } catch { /* keep going */ }
      }
      setProgress(t('Refreshing the list…'));
      await onCheck();
      message.success(t('Update all done'));
    } finally { setBusy(null); setProgress(''); }
  };

  // Batch-run the NEXT action for each CHECKED plugin, one at a time — same sequential-with-reload flow as
  // "Update all". Fresh instance: check all → installs them (→ disabled); check the now-disabled rows → enables.
  const onRunSelected = async () => {
    const todo = (items || []).filter((i) => selectedKeys.includes(i.packageName) && i.status !== 'up-to-date');
    if (!todo.length) return;
    setBusy('*selected*');
    try {
      for (let i = 0; i < todo.length; i++) {
        const it = todo[i];
        const verb = it.status === 'not-installed' ? t('Installing') : it.status === 'disabled' ? t('Enabling') : t('Updating');
        setProgress(`${verb} ${i + 1}/${todo.length}: ${it.displayName}`);
        try {
          const url = it.status === 'disabled' ? 'ptdlPluginHub:enable' : it.status === 'update' ? 'ptdlPluginHub:updatePlugin' : 'ptdlPluginHub:install';
          const data = it.status === 'disabled' ? { packageName: it.packageName } : { url: it.url };
          const res = await req(url, data);
          if (res?.ok) await waitAppReady();
        } catch { /* keep going — one failure shouldn't abort the batch */ }
      }
      setProgress(t('Refreshing the list…'));
      await onCheck();
      setSelectedKeys([]);
      message.success(t('Batch done'));
    } finally { setBusy(null); setProgress(''); }
  };

  const anyBusy = busy !== null;
  const updateCount = (items || []).filter((i) => i.status === 'update').length;

  // Row checkboxes for batch actions — only actionable rows are selectable (up-to-date has nothing to do).
  // The button label follows the selection: all not-installed → Install, all disabled → Enable, else Run.
  const selItems = (items || []).filter((i) => selectedKeys.includes(i.packageName));
  const selCount = selItems.length;
  const batchLabel =
    selCount && selItems.every((i) => i.status === 'not-installed') ? t('Install selected')
      : selCount && selItems.every((i) => i.status === 'disabled') ? t('Enable selected')
        : t('Run selected');
  const rowSelection = {
    selectedRowKeys: selectedKeys,
    onChange: (keys: React.Key[]) => setSelectedKeys(keys as string[]),
    getCheckboxProps: (it: Item) => ({ disabled: anyBusy || it.status === 'up-to-date' }),
  };

  // Group the list by category (CAT_ORDER) then name so rows are contiguous; the category cell rowSpans its group.
  const sortedItems = React.useMemo(
    () => [...(items || [])].sort((a, b) => (catRank(catOf(a.slug)) - catRank(catOf(b.slug))) || a.displayName.localeCompare(b.displayName)),
    [items],
  );
  const catRowSpan = React.useMemo(() => {
    const spans = new Array(sortedItems.length).fill(0);
    for (let i = 0; i < sortedItems.length;) {
      const c = catOf(sortedItems[i].slug);
      let j = i; while (j < sortedItems.length && catOf(sortedItems[j].slug) === c) j++;
      spans[i] = j - i; // first row of the group spans it; the others stay 0 (merged away)
      i = j;
    }
    return spans;
  }, [sortedItems]);

  const columns = [
    {
      title: t('Group'), key: 'category', width: 132,
      onCell: (_it: Item, idx?: number) => ({ rowSpan: catRowSpan[idx ?? 0] ?? 1 }),
      render: (_: any, it: Item) => <Text strong style={{ fontSize: 12.5 }}>{t(CAT_LABEL_KEY[catOf(it.slug)] || catOf(it.slug))}</Text>,
    },
    {
      title: t('Plugin'), dataIndex: 'displayName', key: 'displayName',
      render: (_: any, it: Item) => (
        <div>
          <div style={{ fontWeight: 600 }}>{it.displayName}</div>
          <Text type="secondary" style={{ fontSize: 11 }}>{it.packageName}</Text>
        </div>
      ),
    },
    { title: t('Installed'), dataIndex: 'installedVersion', key: 'installedVersion', width: 110, render: (v: string) => v || <Text type="secondary">—</Text> },
    { title: t('Latest'), dataIndex: 'availableVersion', key: 'availableVersion', width: 110 },
    {
      title: t('Status'), dataIndex: 'status', key: 'status', width: 160,
      render: (s: Item['status']) => <Tag color={STATUS_META[s].color}>{t(STATUS_META[s].label)}</Tag>,
    },
    {
      title: t('Action'), key: 'action', width: 218,
      render: (_: any, it: Item) => {
        const loadingThis = busy === it.packageName;
        const dis = anyBusy && !loadingThis;
        const isSelf = it.slug === 'hub'; // never let the tool disable/remove ITSELF — use the native Plugin Manager for that
        const installed = it.status !== 'not-installed';
        const enabled = it.status === 'up-to-date' || it.status === 'update';
        const primary =
          it.status === 'not-installed' ? <Button size="small" type="primary" loading={loadingThis} disabled={dis} onClick={() => onInstall(it)}>{t('Install')}</Button>
            : it.status === 'disabled' ? <Button size="small" loading={loadingThis} disabled={dis} onClick={() => onEnable(it)}>{t('Enable')}</Button>
              : it.status === 'update' ? <Button size="small" type="primary" loading={loadingThis} disabled={dis} onClick={() => onUpdate(it)}>{t('Update')}</Button>
                : <Text type="success" style={{ padding: '0 2px' }}>✓</Text>;
        return (
          <Space size={4} wrap>
            {primary}
            {installed && enabled && !isSelf && <Button size="small" loading={loadingThis} disabled={dis} onClick={() => onDisable(it)}>{t('Disable')}</Button>}
            {installed && !isSelf && (
              <Popconfirm title={t('Remove this plugin? Its data/config stays.')} okText={t('Remove')} okButtonProps={{ danger: true }} cancelText={t('Cancel')} onConfirm={() => onUninstall(it)}>
                <Button size="small" danger disabled={dis}>{t('Delete')}</Button>
              </Popconfirm>
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <ConfigContainer maxWidth={1180}>
      <div style={{ marginBottom: 14 }}>
        <Title level={4} style={{ margin: 0 }}>{t('Plugin Hub')}</Title>
        <Paragraph type="secondary" style={{ margin: '4px 0 0' }}>
          {t('Install and update your @tuanla90 plugins from one manifest — no browser upload. The weekly check only notifies; nothing is auto-applied.')}
        </Paragraph>
      </div>

      <SettingCard style={{ marginBottom: 14 }}>
        <CardHeader title={t('Source')} />
        <Space direction="vertical" style={{ width: '100%' }} size={10}>
          <div>
            <Text strong>{t('Manifest URL')}</Text>
            <Input value={cfg.manifestUrl} onChange={(e) => setCfg((c) => ({ ...c, manifestUrl: e.target.value }))} placeholder={DEFAULT_MANIFEST} style={{ marginTop: 4 }} />
            <div style={{ marginTop: 4 }}><Hint tip={t('A JSON listing { packageName, version, url } per plugin. Default = the public @tuanla90 repo.')} /> <Text type="secondary" style={{ fontSize: 12 }}>{t('A manifest that lists each plugin + its download URL.')}</Text></div>
          </div>
          <Space>
            <Switch checked={cfg.weeklyCheck} onChange={(v) => setCfg((c) => ({ ...c, weeklyCheck: v }))} />
            <Text>{t('Check for updates weekly (notify only)')}</Text>
          </Space>
          <Space wrap>
            <Button loading={savingCfg} onClick={onSaveCfg}>{t('Save')}</Button>
            <Button type="primary" loading={checking} disabled={anyBusy} onClick={() => onCheck()}>{t('Check now')}</Button>
            {cfg.lastChecked && <Text type="secondary" style={{ fontSize: 12 }}>{t('Last checked')}: {new Date(cfg.lastChecked).toLocaleString()}</Text>}
          </Space>
        </Space>
      </SettingCard>

      <SettingCard style={{ marginBottom: 14 }}>
        <CardHeader
          title={<Space>{t('Plugins')}{items && <Badge count={items.length} overflowCount={999} showZero style={{ backgroundColor: '#8c8c8c' }} />}{items && updateCount > 0 && <Tag color="blue" style={{ marginInlineStart: 2 }}>{updateCount} {t('to update')}</Tag>}</Space>}
          extra={items ? (
            <Space>
              <Button type="primary" disabled={!selCount || anyBusy} loading={busy === '*selected*'} onClick={onRunSelected}>{batchLabel}{selCount ? ` (${selCount})` : ''}</Button>
              <Button disabled={!updateCount || anyBusy} loading={busy === '*all*'} onClick={onUpdateAll}>{t('Update all')}{updateCount ? ` (${updateCount})` : ''}</Button>
            </Space>
          ) : null}
        />
        {progress && <Alert type="info" showIcon message={progress} style={{ marginBottom: 12 }} />}
        {!items ? (
          <Paragraph type="secondary" style={{ margin: 0 }}>{t('Press “Check now” to load the plugin list from the manifest.')}</Paragraph>
        ) : (
          <Table rowSelection={rowSelection} rowKey="packageName" size="small" dataSource={sortedItems} columns={columns as any} pagination={false} loading={checking} />
        )}
        <div style={{ marginTop: 10 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>{t('Install adds a plugin (then Enable it). Update replaces an installed plugin. Each triggers an app reload, handled automatically.')}</Text>
        </div>
      </SettingCard>
    </ConfigContainer>
  );
}

export default PluginHubPane;
