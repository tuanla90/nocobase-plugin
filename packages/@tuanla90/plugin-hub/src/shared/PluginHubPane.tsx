import React, { useEffect, useState } from 'react';
import { Alert, Badge, Button, Input, Popconfirm, Space, Switch, Table, Tag, Typography, message } from 'antd';
import { ConfigContainer, SettingCard, Hint } from '@tuanla90/shared';
import { t } from './pluginHubClient';

const { Text, Paragraph, Title } = Typography;

const DEFAULT_MANIFEST = 'https://raw.githubusercontent.com/tuanla90/nocobase-plugin/main/latest/index.json';
// Per-plugin docs page on the GitHub-Pages site — same `#<slug>` convention every plugin's package.json
// `homepage` uses, so it's derived from the row's slug (no manifest/server change needed).
const DOCS_BASE = 'https://tuanla90.github.io/nocobase-plugin/#';

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

  // A notification-suppressed client for the restart-window polls: during a pm restart the app is DOWN and
  // every poll returns 502/503, which NocoBase's global handler would toast on each try. `api.silent()` mutes it.
  const silentApi = () => (typeof api.silent === 'function' ? api.silent() : api);
  const silentReq = (url: string, data?: any) =>
    silentApi().request({ url, method: 'post', data }).then((r: any) => r?.data?.data ?? r?.data);

  useEffect(() => {
    (async () => {
      let resolvedUrl = DEFAULTS.manifestUrl;
      try {
        const c = await req('ptdlPluginHub:getConfig');
        const merged = { ...DEFAULTS, ...(c || {}) };
        setCfg(merged);
        resolvedUrl = merged.manifestUrl;
      } catch { /* keep defaults */ }
      setLoading(false);
      // Auto-refresh on entry so the list populates without clicking "Check now" (this effect re-runs each
      // time the pane mounts → "làm mới khi vào"). Pass the URL EXPLICITLY — the setCfg above isn't visible
      // within this tick. Non-quiet so a genuinely broken manifest still surfaces an error, but ONLY when a
      // URL is configured: an empty manifest URL would otherwise toast "Could not load the manifest" every entry.
      if (resolvedUrl) await onCheck(resolvedUrl);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // `quiet` = the auto-refresh after an op (the app may still be mid-restart → tolerate 502/503 silently).
  // The manual "Check now" button calls it non-quiet so genuine errors still surface.
  const onCheck = async (urlOverride?: string, quiet = false) => {
    setChecking(true);
    try {
      const doReq = quiet ? silentReq : req;
      const res = await doReq('ptdlPluginHub:check', { manifestUrl: urlOverride ?? cfg.manifestUrl });
      if (!res?.ok) { if (!quiet) message.error(res?.error || t('Could not load the manifest')); return; }
      setItems(res.items || []);
      setCfg((c) => ({ ...c, updatesAvailable: res.updatesAvailable ?? 0, lastChecked: new Date().toISOString() }));
    } catch (e) { if (!quiet) message.error(errMsg(e)); }
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
      try { await silentApi().request({ url: 'app:getInfo', method: 'get' }); return true; }
      catch { await sleep(2500); }
    }
    return false;
  };

  // Poll `check` until a plugin reaches one of `want` statuses (or timeout). A pm add/enable triggers a FULL
  // app restart whose timing varies, so we watch the ACTUAL status instead of a fixed sleep AND report elapsed
  // seconds so the button never looks frozen. Refreshes the list as it goes; returns the matched item or null.
  const waitForStatus = async (packageName: string, want: Item['status'][], label: string, progress: (s: string) => void, maxMs = 150000): Promise<Item | null> => {
    const start = Date.now();
    await sleep(4000); // give the restart a moment to begin
    while (Date.now() - start < maxMs) {
      progress(`${label} — ${t('app is restarting')} ${Math.round((Date.now() - start) / 1000)}s`);
      try {
        const res = await silentReq('ptdlPluginHub:check', { manifestUrl: cfg.manifestUrl });
        if (res?.ok) {
          setItems(res.items || []);
          const it = (res.items || []).find((i: Item) => i.packageName === packageName);
          if (it && want.includes(it.status)) return it;
        }
      } catch { /* app mid-restart → keep polling */ }
      await sleep(3000);
    }
    return null;
  };

  // Run the NEXT action for ONE plugin (install / enable / update) and WAIT for its restart to finish. Does NOT
  // chain install→enable: install leaves the plugin registered but DISABLED so the row's button becomes "Enable"
  // (predictable + one restart per click). Returns null on success, or an error string.
  const advancePlugin = async (it: Item, progress: (s: string) => void): Promise<string | null> => {
    if (it.status === 'not-installed') {
      progress(t('Downloading'));
      // installOnly = download + link files + write a DISABLED applicationPlugins row — NO enable, so NO
      // app reload (the slow step that times out on heavy apps). The plugin lands as 'disabled'; the user
      // Enables it from the Plugin manager (or here) when ready. Fire-and-forget → poll until 'disabled'.
      const r = await silentReq('ptdlPluginHub:installOnly', { url: it.url, packageName: it.packageName, version: it.availableVersion }).catch(() => null);
      if (r && r.ok === false) return r.error || t('Operation failed');
      return (await waitForStatus(it.packageName, ['disabled', 'up-to-date', 'update'], t('Downloading'), progress, 90000)) ? null : t('Install did not finish in time');
    }
    if (it.status === 'disabled') {
      progress(t('Enabling'));
      const r = await req('ptdlPluginHub:enable', { packageName: it.packageName });
      if (!r?.ok) return r?.error || t('Operation failed');
      return (await waitForStatus(it.packageName, ['up-to-date', 'update'], t('Enabling'), progress)) ? null : t('Enable did not finish in time');
    }
    if (it.status === 'update') {
      progress(t('Updating'));
      const r = await req('ptdlPluginHub:updatePlugin', { url: it.url, packageName: it.packageName });
      if (!r?.ok) return r?.error || t('Operation failed');
      await waitForStatus(it.packageName, ['up-to-date'], t('Updating'), progress);
    }
    return null;
  };

  const runOp = async (successMsg: string, key: string, url: string, data: any) => {
    setBusy(key); setProgress(t('Sending command…'));
    try {
      const res = await req(url, data);
      if (!res?.ok) { message.error(res?.error || t('Operation failed')); return false; }
      setProgress(t('The app is reloading — please wait…'));
      await waitAppReady();
      setProgress(t('Refreshing the list…'));
      await onCheck(undefined, true);
      message.success(successMsg);
      return true;
    } catch (e) { message.error(errMsg(e)); return false; }
    finally { setBusy(null); setProgress(''); }
  };

  // Install = download + register the plugin as DISABLED (installOnly) — NO app reload. Enabling is a
  // SEPARATE step (here or in the native Plugin manager) so a heavy app's slow reload never blocks the
  // install / trips the poll timeout.
  const onInstall = async (it: Item) => {
    setBusy(it.packageName);
    try {
      const err = await advancePlugin(it, (s) => setProgress(`${s}: ${it.displayName}`));
      await onCheck(undefined, true);
      if (err) message.error(`${it.displayName}: ${err}`, 10);
      else message.success(t('Downloaded — now click Enable (here or in Plugin manager)'), 8);
    } catch (e) { message.error(errMsg(e)); }
    finally { setBusy(null); setProgress(''); }
  };
  const onEnable = (it: Item) => runOp(t('Enabled'), it.packageName, 'ptdlPluginHub:enable', { packageName: it.packageName });
  const onUpdate = (it: Item) => runOp(t('Updated'), it.packageName, 'ptdlPluginHub:updatePlugin', { url: it.url, packageName: it.packageName });
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
          const res = await req('ptdlPluginHub:updatePlugin', { url: todo[i].url, packageName: todo[i].packageName });
          if (res?.ok) await waitAppReady();
        } catch { /* keep going */ }
      }
      setProgress(t('Refreshing the list…'));
      await onCheck(undefined, true);
      message.success(t('Update all done'));
    } finally { setBusy(null); setProgress(''); }
  };

  // Batch-run the NEXT action for each CHECKED plugin, one at a time — same sequential-with-reload flow as
  // "Update all". Fresh instance: check all → installs them (→ disabled); check the now-disabled rows → enables.
  const onRunSelected = async () => {
    const todo = (items || []).filter((i) => selectedKeys.includes(i.packageName) && i.status !== 'up-to-date');
    if (!todo.length) return;
    setBusy('*selected*');
    const fails: string[] = [];
    try {
      for (let i = 0; i < todo.length; i++) {
        const it = todo[i];
        // advancePlugin runs install→enable (or enable/update) for ONE plugin and WAITS for each restart to
        // finish before returning — so the next item never starts mid-restart (the old batch's fatal flaw).
        try {
          const err = await advancePlugin(it, (s) => setProgress(`${s} ${i + 1}/${todo.length}: ${it.displayName}`));
          if (err) fails.push(`${it.displayName}: ${err}`);
        } catch (e: any) { fails.push(`${it.displayName}: ${e?.message || e}`); }
      }
      setProgress(t('Refreshing the list…'));
      await onCheck(undefined, true);
      setSelectedKeys([]);
      if (fails.length) message.error(`${t('Some items failed')} — ${fails.join(' · ')}`, 12);
      else message.success(t('Batch done'));
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
          {it.slug ? (
            <div style={{ marginTop: 2 }}>
              <a href={`${DOCS_BASE}${it.slug}`} target="_blank" rel="noreferrer" style={{ fontSize: 11 }}>
                📖 {t('Docs')}
              </a>
            </div>
          ) : null}
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
          <Paragraph type="secondary" style={{ margin: 0 }}>{checking ? t('Refreshing the list…') : t('Press “Check now” to load the plugin list from the manifest.')}</Paragraph>
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
