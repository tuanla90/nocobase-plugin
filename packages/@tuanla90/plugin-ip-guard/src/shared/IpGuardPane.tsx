import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert, Button, Divider, Input, Popconfirm, Space, Switch, Table, Tag, Tooltip, Typography, message,
} from 'antd';
import { ConfigContainer, SettingCard, SettingRow, SaveBar, Hint, SegmentedGroup } from '@tuanla90/shared';
import { decide, GuardConfig, GuardMode, normalizeIp } from './ipMatch';
import { t } from './ipGuardClient';

const { Text, Paragraph } = Typography;

interface Options {
  mode: GuardMode;
  enforcementScope: 'api' | 'app';
  allowList: string[];
  denyList: string[];
  safeList: string[];
  allowLoopback: boolean;
  allowPrivate: boolean;
  trustProxy: boolean;
  forwardedHeader: string;
  blockMessage: string;
  blockStatus: number;
  logBlocked: boolean;
  logAllowed: boolean;
}

const DEFAULTS: Options = {
  mode: 'off',
  enforcementScope: 'app',
  allowList: [],
  denyList: [],
  safeList: [],
  allowLoopback: true,
  allowPrivate: false,
  trustProxy: true,
  forwardedHeader: 'x-forwarded-for',
  blockMessage: 'Access denied: your IP address is not allowed.',
  blockStatus: 403,
  logBlocked: true,
  logAllowed: false,
};

const LIST_PLACEHOLDER = '203.0.113.4\n10.0.0.0/8\n192.168.1.10-192.168.1.20\n2001:db8::/32';

function splitList(text: string): string[] {
  return text
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith('#'));
}

function errMsg(e: any, fallback: string): string {
  return e?.response?.data?.errors?.[0]?.message || e?.message || fallback;
}

export function IpGuardPane({ api }: { api: any }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [opt, setOpt] = useState<Options>(DEFAULTS);
  const [allowText, setAllowText] = useState('');
  const [denyText, setDenyText] = useState('');
  const [safeText, setSafeText] = useState('');
  const [callerIp, setCallerIp] = useState('');
  const [socketIp, setSocketIp] = useState('');
  const [testIp, setTestIp] = useState('');
  const [testOut, setTestOut] = useState<{ ip: string; allow: boolean; reason: string; matched?: string } | null>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const set = <K extends keyof Options>(k: K, v: Options[K]) => setOpt((o) => ({ ...o, [k]: v }));

  const load = async () => {
    setLoading(true);
    try {
      const res: any = await api.resource('ptdlIpAccessConfigs').getConfig();
      const body = res?.data?.data ?? res?.data ?? {};
      const o: Options = { ...DEFAULTS, ...(body.options || {}) };
      setOpt(o);
      setAllowText((o.allowList || []).join('\n'));
      setDenyText((o.denyList || []).join('\n'));
      setSafeText((o.safeList || []).join('\n'));
      setCallerIp(body.callerIp || '');
      setSocketIp(body.socketIp || '');
    } catch (e) {
      message.error(errMsg(e, t('Failed to load configuration')));
    }
    setLoading(false);
  };

  const loadLogs = async () => {
    setLogsLoading(true);
    try {
      const res: any = await api.resource('ptdlIpAccessLogs').list({ sort: ['-id'], pageSize: 50 });
      setLogs(res?.data?.data || []);
    } catch (e) {
      setLogs([]);
    }
    setLogsLoading(false);
  };

  useEffect(() => {
    load();
    loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The exact options that WOULD be saved — used for a live self-lockout check.
  const editedOptions: Options = useMemo(
    () => ({ ...opt, allowList: splitList(allowText), denyList: splitList(denyText), safeList: splitList(safeText) }),
    [opt, allowText, denyText, safeText],
  );

  // Live lock-out preview: run the SAME decision engine the server uses against my current IP.
  const selfDecision = useMemo(() => {
    if (!callerIp) return null;
    return decide(callerIp, editedOptions as unknown as GuardConfig);
  }, [callerIp, editedOptions]);
  const wouldLockMeOut = !!selfDecision && !selfDecision.allow && editedOptions.mode !== 'monitor' && editedOptions.mode !== 'off';

  const addMyIpToSafe = () => {
    if (!callerIp) return;
    const list = splitList(safeText);
    if (!list.includes(callerIp)) {
      setSafeText([...list, callerIp].join('\n'));
      message.success(t('Added {{ip}} to the safe-list', { ip: callerIp }));
    }
  };

  const buildPayload = (): Options => ({
    ...opt,
    allowList: splitList(allowText),
    denyList: splitList(denyText),
    safeList: splitList(safeText),
    forwardedHeader: (opt.forwardedHeader || '').trim() || 'x-forwarded-for',
    blockMessage: opt.blockMessage || DEFAULTS.blockMessage,
  });

  const doSave = async () => {
    setSaving(true);
    try {
      await api.resource('ptdlIpAccessConfigs').saveConfig({ values: { options: buildPayload() } });
      message.success(t('Saved'));
      await load();
      await loadLogs();
    } catch (e) {
      message.error(errMsg(e, t('Save failed')));
    }
    setSaving(false);
  };

  const runTest = async () => {
    const ip = normalizeIp(testIp);
    if (!ip) {
      setTestOut(null);
      return;
    }
    // Test against the CURRENTLY EDITED (unsaved) rules, locally, so the admin sees the effect before saving.
    const d = decide(ip, editedOptions as unknown as GuardConfig);
    setTestOut({ ip, allow: d.allow && editedOptions.mode !== 'off', reason: d.reason, matched: d.matched });
  };

  const reset = () => {
    load();
    setTestOut(null);
  };

  const clearLogs = async () => {
    try {
      await api.resource('ptdlIpAccessLogs').clear();
      setLogs([]);
      message.success(t('Access log cleared'));
    } catch (e) {
      message.error(errMsg(e, t('Failed to clear the log')));
    }
  };

  const MODE_OPTIONS = [
    { label: t('Off'), value: 'off' },
    { label: t('Monitor'), value: 'monitor' },
    { label: t('Block-list'), value: 'blacklist' },
    { label: t('Allow-list'), value: 'whitelist' },
  ];
  const MODE_DESC: Record<GuardMode, string> = {
    off: t('The guard is disabled. No request is checked.'),
    monitor: t('Requests are checked and would-be blocks are logged, but nothing is actually blocked. Use it to preview your rules safely.'),
    blacklist: t('Every IP is allowed except those in the block-list below.'),
    whitelist: t('Only IPs in the allow-list (and the safe-list) may reach the API. Everything else is blocked.'),
  };
  const SCOPE_OPTIONS = [
    { label: t('Whole app'), value: 'app' },
    { label: t('API only'), value: 'api' },
  ];
  const SCOPE_DESC: Record<string, string> = {
    app: t('Blocks every request, including the page itself — a true firewall. Loopback and the safe-list are still exempt so you can recover.'),
    api: t('Blocks the HTTP API only (data, sign-in, settings). The page shell still loads but does nothing for a blocked IP. Cannot hard-brick the server.'),
  };

  const listHint = t('One entry per line. Accepts a single IP, a CIDR block (10.0.0.0/8) or a start-end range (1.2.3.4-1.2.3.9). IPv4 and IPv6. Lines starting with # are comments.');

  const logColumns = [
    {
      title: t('Time'),
      dataIndex: 'createdAt',
      width: 160,
      render: (v: string) => (v ? new Date(v).toLocaleString() : ''),
    },
    { title: t('IP'), dataIndex: 'ip', width: 150 },
    {
      title: t('Decision'),
      dataIndex: 'decision',
      width: 100,
      render: (v: string) => {
        const color = v === 'deny' ? 'red' : v === 'monitor' ? 'orange' : 'green';
        const label = v === 'deny' ? t('Blocked') : v === 'monitor' ? t('Would block') : t('Allowed');
        return <Tag color={color}>{label}</Tag>;
      },
    },
    { title: t('Reason'), dataIndex: 'reason', width: 120 },
    { title: t('Method'), dataIndex: 'method', width: 80 },
    { title: t('Path'), dataIndex: 'path', ellipsis: true },
  ];

  return (
    <ConfigContainer maxWidth={1180}>
      {/* Current IP + safety */}
      <SettingCard style={{ marginBottom: 14 }}>
        <Space wrap align="center" style={{ justifyContent: 'space-between', width: '100%' }}>
          <Space direction="vertical" size={2}>
            <Space wrap>
              <Text type="secondary">{t('Your current IP')}:</Text>
              <Text strong copyable={{ text: callerIp }}>{callerIp || '—'}</Text>
              {socketIp && socketIp !== callerIp ? (
                <Tooltip title={t('The raw socket address differs from the forwarded one because trust-proxy is on.')}>
                  <Tag>{t('socket')}: {socketIp}</Tag>
                </Tooltip>
              ) : null}
            </Space>
            {selfDecision ? (
              <Text type={selfDecision.allow ? 'success' : 'danger'} style={{ fontSize: 12 }}>
                {selfDecision.allow ? t('With the current rules, your IP is allowed.') : t('With the current rules, your IP would be blocked.')}
                {selfDecision.matched ? ` (${selfDecision.matched})` : ''}
              </Text>
            ) : null}
          </Space>
          <Button size="small" onClick={addMyIpToSafe} disabled={!callerIp}>
            {t('Add my IP to safe-list')}
          </Button>
        </Space>
      </SettingCard>

      {wouldLockMeOut ? (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 14 }}
          message={t('This configuration would block your own IP')}
          description={t('Add your IP to the allow-list or the safe-list before saving, or you may lose access to the app from this address.')}
        />
      ) : null}

      {/* Mode */}
      <SettingCard style={{ marginBottom: 14 }}>
        <SettingRow label={t('Mode')} layout="vertical">
          <SegmentedGroup
            value={opt.mode}
            onChange={(v) => set('mode', v as GuardMode)}
            options={MODE_OPTIONS}
          />
        </SettingRow>
        <Alert type="info" showIcon message={MODE_DESC[opt.mode]} style={{ marginTop: 4 }} />

        {opt.mode !== 'off' ? (
          <>
            <SettingRow label={<>{t('Enforcement scope')} <Hint tip={t('Whole app is a true firewall (blocks even the page). API only blocks data/sign-in/settings but lets the page shell load — it can never hard-brick the server.')} /></>} layout="vertical" style={{ marginTop: 12, marginBottom: 0 }}>
              <SegmentedGroup
                value={opt.enforcementScope}
                onChange={(v) => set('enforcementScope', v as Options['enforcementScope'])}
                options={SCOPE_OPTIONS}
              />
            </SettingRow>
            <Alert type={opt.enforcementScope === 'app' ? 'warning' : 'info'} showIcon message={SCOPE_DESC[opt.enforcementScope]} style={{ marginTop: 8 }} />
          </>
        ) : null}
      </SettingCard>

      {/* Lists */}
      <SettingCard style={{ marginBottom: 14 }}>
        {opt.mode === 'whitelist' ? (
          <SettingRow label={<>{t('Allow-list (allowed IPs)')} <Hint tip={listHint} /></>} layout="vertical">
            <Input.TextArea
              rows={5}
              value={allowText}
              onChange={(e) => setAllowText(e.target.value)}
              placeholder={LIST_PLACEHOLDER}
              style={{ fontFamily: 'monospace' }}
            />
          </SettingRow>
        ) : null}

        {opt.mode === 'blacklist' ? (
          <SettingRow label={<>{t('Block-list (blocked IPs)')} <Hint tip={listHint} /></>} layout="vertical">
            <Input.TextArea
              rows={5}
              value={denyText}
              onChange={(e) => setDenyText(e.target.value)}
              placeholder={LIST_PLACEHOLDER}
              style={{ fontFamily: 'monospace' }}
            />
          </SettingRow>
        ) : null}

        {opt.mode === 'off' ? (
          <Text type="secondary">{t('Choose Monitor, Block-list or Allow-list to configure rules.')}</Text>
        ) : (
          <SettingRow
            label={<>{t('Safe-list (always allowed)')} <Hint tip={t('Applies in every mode and is never blocked. Put trusted admin IPs here so you cannot lock yourself out.')} /></>}
            layout="vertical"
            style={{ marginBottom: 0 }}
          >
            <Input.TextArea
              rows={3}
              value={safeText}
              onChange={(e) => setSafeText(e.target.value)}
              placeholder={LIST_PLACEHOLDER}
              style={{ fontFamily: 'monospace' }}
            />
          </SettingRow>
        )}
      </SettingCard>

      {/* Exemptions & proxy */}
      {opt.mode !== 'off' ? (
        <SettingCard style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <Switch checked={opt.allowLoopback} onChange={(v) => set('allowLoopback', v)} />
            <span>{t('Always allow loopback (127.0.0.1, ::1)')}</span>
            <Hint tip={t('Keeps local and CLI access working — recommended to leave on.')} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <Switch checked={opt.allowPrivate} onChange={(v) => set('allowPrivate', v)} />
            <span>{t('Always allow private / LAN ranges')}</span>
            <Hint tip={t('RFC1918 (10/8, 172.16/12, 192.168/16), link-local and IPv6 ULA.')} />
          </div>
          <Divider style={{ margin: '8px 0 12px' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <Switch checked={opt.trustProxy} onChange={(v) => set('trustProxy', v)} />
            <span>{t('Behind a proxy (read forwarded header)')}</span>
            <Hint tip={t('When your app sits behind Nginx / a load balancer / Cloudflare, the real client IP is in a forwarded header. Turn OFF only for a direct connection — a forwarded header can be spoofed by clients that reach the server directly.')} />
          </div>
          {opt.trustProxy ? (
            <SettingRow label={t('Forwarded header')} labelWidth={140}>
              <Input
                style={{ maxWidth: 260 }}
                value={opt.forwardedHeader}
                onChange={(e) => set('forwardedHeader', e.target.value)}
                placeholder="x-forwarded-for"
              />
            </SettingRow>
          ) : null}
          <SettingRow label={t('Block message')} layout="vertical" style={{ marginBottom: 0 }}>
            <Input
              value={opt.blockMessage}
              onChange={(e) => set('blockMessage', e.target.value)}
              placeholder={DEFAULTS.blockMessage}
            />
          </SettingRow>
        </SettingCard>
      ) : null}

      {/* Logging */}
      {opt.mode !== 'off' ? (
        <SettingCard style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <Switch checked={opt.logBlocked} onChange={(v) => set('logBlocked', v)} />
            <span>{t('Log blocked attempts')}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Switch checked={opt.logAllowed} onChange={(v) => set('logAllowed', v)} />
            <span>{t('Log allowed requests')}</span>
            <Hint tip={t('Verbose — this fires on every API call. Use briefly for debugging only.')} />
          </div>
        </SettingCard>
      ) : null}

      {/* Test tool */}
      <SettingCard style={{ marginBottom: 14 }}>
        <SettingRow label={t('Test an IP against the current (unsaved) rules')} layout="vertical" style={{ marginBottom: 8 }}>
          <Space.Compact style={{ width: '100%', maxWidth: 420 }}>
            <Input
              value={testIp}
              onChange={(e) => setTestIp(e.target.value)}
              onPressEnter={runTest}
              placeholder="203.0.113.4"
            />
            <Button type="primary" onClick={runTest}>{t('Test')}</Button>
          </Space.Compact>
        </SettingRow>
        {testOut ? (
          <Alert
            type={testOut.allow ? 'success' : 'error'}
            showIcon
            message={
              <span>
                {testOut.ip} — {testOut.allow ? t('Allowed') : t('Blocked')}
                <Text type="secondary" style={{ marginLeft: 8 }}>
                  ({testOut.reason}{testOut.matched ? `: ${testOut.matched}` : ''})
                </Text>
              </span>
            }
          />
        ) : null}
      </SettingCard>

      <SaveBar
        onReset={reset}
        onSave={doSave}
        saving={saving}
        resetLabel={t('Reset')}
        saveLabel={t('Save')}
      />

      {/* Access log */}
      <Divider style={{ margin: '20px 0 12px' }} />
      <Space style={{ justifyContent: 'space-between', width: '100%', marginBottom: 8 }}>
        <Text strong>{t('Recent access log')}</Text>
        <Space>
          <Button size="small" onClick={loadLogs} loading={logsLoading}>{t('Refresh')}</Button>
          <Popconfirm title={t('Clear the whole access log?')} onConfirm={clearLogs} okText={t('Clear')} cancelText={t('Cancel')}>
            <Button size="small" danger>{t('Clear log')}</Button>
          </Popconfirm>
        </Space>
      </Space>
      <Table
        size="small"
        rowKey="id"
        loading={logsLoading}
        columns={logColumns as any}
        dataSource={logs}
        pagination={{ pageSize: 10, size: 'small', hideOnSinglePage: true }}
        locale={{ emptyText: t('No entries yet') }}
        scroll={{ x: 720 }}
      />
    </ConfigContainer>
  );
}

export default IpGuardPane;
