import React, { useEffect, useState } from 'react';
import { App as AntApp, Alert, Button, Divider, Input, InputNumber, Radio, Space, Spin, Switch, theme } from 'antd';
import { APPS_SCRIPT_SNIPPET, MAILER_RESOURCE, SECRET_MASK, DEFAULT_SMTP_PORT, MailerBackend } from '../shared/constants';
import type { MailerConfigView } from '../shared/types';
import { t } from '../shared/mailerClient';

const Label: React.FC<{ children: React.ReactNode; hint?: string }> = ({ children, hint }) => {
  const { token } = theme.useToken();
  return (
    <div style={{ fontSize: 12, color: token.colorTextTertiary, marginBottom: 4 }}>
      {children}
      {hint ? <span style={{ marginLeft: 6, color: token.colorTextQuaternary }}>· {hint}</span> : null}
    </div>
  );
};

export interface BackendConfigProps {
  api: any;
}

export const BackendConfig: React.FC<BackendConfigProps> = ({ api }) => {
  const { token } = theme.useToken();
  const { message } = AntApp.useApp();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [cfg, setCfg] = useState<MailerConfigView | null>(null);

  // local editable fields
  const [backend, setBackend] = useState<MailerBackend>('apps-script');
  const [enabled, setEnabled] = useState(false);
  const [fromName, setFromName] = useState('');
  const [appsScriptUrl, setAppsScriptUrl] = useState(''); // empty = keep existing
  const [sharedToken, setSharedToken] = useState('');
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState<number>(DEFAULT_SMTP_PORT);
  const [smtpSecure, setSmtpSecure] = useState(true);
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [smtpFrom, setSmtpFrom] = useState('');
  const [testTo, setTestTo] = useState('');

  const applyView = (v: MailerConfigView) => {
    setCfg(v);
    setBackend(v.backend || 'apps-script');
    setEnabled(!!v.enabled);
    setFromName(v.fromName || '');
    setSmtpHost(v.smtpHost || '');
    setSmtpPort(v.smtpPort || DEFAULT_SMTP_PORT);
    setSmtpSecure(v.smtpSecure !== false);
    setSmtpUser(v.smtpUser || '');
    setSmtpFrom(v.smtpFrom || '');
    // secrets stay blank locally (server never sends them); placeholders indicate "set / not set"
    setAppsScriptUrl('');
    setSharedToken('');
    setSmtpPass('');
  };

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.request({ url: `${MAILER_RESOURCE}:getConfig`, method: 'post' });
      applyView(res?.data?.data || res?.data);
    } catch (e: any) {
      message.error(t('Could not load config (admin only)'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      // Secrets: send the field ONLY when the user typed a new value; empty keeps the stored secret.
      const values: any = {
        backend,
        enabled,
        fromName,
        smtpHost,
        smtpPort,
        smtpSecure,
        smtpUser,
        smtpFrom,
      };
      if (appsScriptUrl) values.appsScriptUrl = appsScriptUrl;
      if (sharedToken) values.sharedToken = sharedToken;
      if (smtpPass) values.smtpPass = smtpPass;
      const res = await api.request({ url: `${MAILER_RESOURCE}:saveConfig`, method: 'post', data: values });
      applyView(res?.data?.data || res?.data);
      message.success(t('Saved'));
    } catch (e: any) {
      message.error(e?.response?.data?.errors?.[0]?.message || t('Save failed'));
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    if (!testTo.trim()) {
      message.warning(t('Enter a test recipient email'));
      return;
    }
    setTesting(true);
    try {
      // Save first so the test uses the latest config.
      await save();
      const res = await api.request({ url: `${MAILER_RESOURCE}:sendTest`, method: 'post', data: { to: testTo.trim(), backend } });
      const r = res?.data?.data || res?.data;
      if (r?.ok) message.success(t('Test email sent — check the inbox'));
      else message.error((t('Test failed') + ': ') + (r?.error || 'unknown'));
    } catch (e: any) {
      message.error(e?.response?.data?.errors?.[0]?.message || t('Test failed'));
    } finally {
      setTesting(false);
    }
  };

  const copySnippet = async () => {
    try {
      await navigator.clipboard.writeText(APPS_SCRIPT_SNIPPET);
      message.success(t('Copied'));
    } catch {
      message.error(t('Copy failed — select the text manually'));
    }
  };

  if (loading) return <Spin />;

  const codeBg = token.colorFillQuaternary;

  return (
    <div style={{ maxWidth: 720 }}>
      <Space align="center" style={{ marginBottom: 16 }}>
        <Switch checked={enabled} onChange={setEnabled} />
        <b>{t('Enable sending')}</b>
        <span style={{ color: token.colorTextTertiary, fontSize: 12 }}>
          {t('When off, the Send email action and workflow node return a clear "not enabled" error.')}
        </span>
      </Space>

      <Divider style={{ margin: '8px 0 16px' }} />

      <Label>{t('Backend')}</Label>
      <Radio.Group value={backend} onChange={(e) => setBackend(e.target.value)} optionType="button" buttonStyle="solid" style={{ marginBottom: 16 }}>
        <Radio.Button value="apps-script">{t('Google Apps Script (Gmail)')}</Radio.Button>
        <Radio.Button value="smtp">{t('SMTP (nodemailer)')}</Radio.Button>
      </Radio.Group>

      <div style={{ marginBottom: 16 }}>
        <Label hint={t('shown as the sender display name')}>{t('From name')}</Label>
        <Input value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder={t('e.g. Acme Sales')} style={{ maxWidth: 360 }} />
      </div>

      {backend === 'apps-script' ? (
        <div>
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 12 }}
            message={t('How Google Apps Script sending works')}
            description={t('Deploy the script below as a Web App (Deploy → New deployment → Web app; Execute as = Me; Who has access = Anyone). Paste the resulting /exec URL here. GmailApp sends from the deploying Google account — no SMTP server needed.')}
          />
          <div style={{ marginBottom: 12 }}>
            <Label hint={cfg?.hasAppsScriptUrl ? t('a URL is already set — leave blank to keep it') : t('required')}>
              {t('Apps Script Web App URL (/exec)')}
            </Label>
            <Input
              value={appsScriptUrl}
              onChange={(e) => setAppsScriptUrl(e.target.value)}
              placeholder={cfg?.hasAppsScriptUrl ? `${SECRET_MASK}${cfg.appsScriptUrlMask}` : 'https://script.google.com/macros/s/…/exec'}
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <Label hint={cfg?.hasSharedToken ? t('a token is already set — leave blank to keep it') : t('optional but recommended')}>
              {t('Shared token (sent in the payload; verify it in the script)')}
            </Label>
            <Input.Password
              value={sharedToken}
              onChange={(e) => setSharedToken(e.target.value)}
              placeholder={cfg?.hasSharedToken ? SECRET_MASK : t('optional — a secret only you and the script know')}
              style={{ maxWidth: 360 }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <Label>{t('Apps Script doPost — copy this into your script project')}</Label>
            <Button size="small" onClick={copySnippet}>
              {t('Copy script')}
            </Button>
          </div>
          <pre
            style={{
              background: codeBg,
              border: `1px solid ${token.colorBorderSecondary}`,
              borderRadius: 8,
              padding: 12,
              fontSize: 12,
              lineHeight: 1.5,
              overflowX: 'auto',
              maxHeight: 320,
              margin: 0,
            }}
          >
            {APPS_SCRIPT_SNIPPET}
          </pre>
        </div>
      ) : (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: 12, marginBottom: 12 }}>
            <div>
              <Label hint={t('required')}>{t('SMTP host')}</Label>
              <Input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="smtp.gmail.com" />
            </div>
            <div>
              <Label>{t('Port')}</Label>
              <InputNumber value={smtpPort} onChange={(v) => setSmtpPort(Number(v) || DEFAULT_SMTP_PORT)} min={1} max={65535} style={{ width: '100%' }} />
            </div>
          </div>
          <Space align="center" style={{ marginBottom: 12 }}>
            <Switch checked={smtpSecure} onChange={setSmtpSecure} />
            <span style={{ fontSize: 13 }}>{t('Secure (TLS)')}</span>
            <span style={{ color: token.colorTextQuaternary, fontSize: 12 }}>{t('port 465 → on; 587/25 → off')}</span>
          </Space>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <Label>{t('SMTP username')}</Label>
              <Input value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} placeholder="user@domain.com" autoComplete="off" />
            </div>
            <div>
              <Label hint={cfg?.hasSmtpPass ? t('a password is already set — leave blank to keep it') : undefined}>{t('SMTP password')}</Label>
              <Input.Password value={smtpPass} onChange={(e) => setSmtpPass(e.target.value)} placeholder={cfg?.hasSmtpPass ? SECRET_MASK : t('app password / SMTP password')} autoComplete="new-password" />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <Label hint={t('the envelope From address')}>{t('From address')}</Label>
            <Input value={smtpFrom} onChange={(e) => setSmtpFrom(e.target.value)} placeholder="noreply@domain.com" style={{ maxWidth: 360 }} />
          </div>
        </div>
      )}

      <Divider style={{ margin: '16px 0' }} />

      <Space wrap>
        <Button type="primary" loading={saving} onClick={save}>
          {t('Save')}
        </Button>
        <Input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder={t('test recipient email')} style={{ width: 240 }} />
        <Button loading={testing} onClick={sendTest}>
          {t('Save & send test')}
        </Button>
      </Space>
      <div style={{ marginTop: 8, fontSize: 12, color: token.colorTextTertiary }}>
        {t('Secrets (Apps Script URL, SMTP password, shared token) are stored server-side and never sent back to the browser.')}
      </div>
    </div>
  );
};

export default BackendConfig;
