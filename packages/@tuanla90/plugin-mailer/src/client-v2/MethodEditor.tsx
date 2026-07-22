import React, { useEffect, useState } from 'react';
import { App as AntApp, Alert, Button, Divider, Input, InputNumber, Modal, Radio, Space, Switch, theme } from 'antd';
import { APPS_SCRIPT_SNIPPET, MAILER_RESOURCE, SECRET_MASK, DEFAULT_SMTP_PORT, MailerBackend } from '../shared/constants';
import type { MailMethodView } from '../shared/types';
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

export interface MethodEditorProps {
  api: any;
  open: boolean;
  /** null = creating a new method; otherwise the masked view of the method being edited. */
  method: MailMethodView | null;
  onClose: () => void;
  onSaved: () => void;
}

/** Create/edit ONE sending method. Reuses the v0.1.x backend field set (Apps Script / SMTP), branched by
 *  the method's backend type, inside a Modal. Secrets stay blank locally and are only sent when typed. */
export const MethodEditor: React.FC<MethodEditorProps> = ({ api, open, method, onClose, onSaved }) => {
  const { token } = theme.useToken();
  const { message } = AntApp.useApp();
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  // local editable fields
  const [name, setName] = useState('');
  const [backend, setBackend] = useState<MailerBackend>('apps-script');
  const [enabled, setEnabled] = useState(true);
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

  // (re)initialize whenever the modal opens or the target method changes
  useEffect(() => {
    if (!open) return;
    const v = method;
    setName(v?.name || '');
    setBackend(v?.backend || 'apps-script');
    setEnabled(v ? !!v.enabled : true);
    setFromName(v?.fromName || '');
    setSmtpHost(v?.smtpHost || '');
    setSmtpPort(v?.smtpPort || DEFAULT_SMTP_PORT);
    setSmtpSecure(v ? v.smtpSecure !== false : true);
    setSmtpUser(v?.smtpUser || '');
    setSmtpFrom(v?.smtpFrom || '');
    // secrets stay blank locally (server never sends them); placeholders indicate "set / not set"
    setAppsScriptUrl('');
    setSharedToken('');
    setSmtpPass('');
    setTestTo('');
  }, [open, method]);

  /** Persist the method. Returns the saved method's stable key (needed for "Save & send test"). */
  const save = async (): Promise<string | null> => {
    if (!name.trim()) {
      message.warning(t('Please enter a method name'));
      return null;
    }
    setSaving(true);
    try {
      const values: any = {
        name: name.trim(),
        backend,
        enabled,
        fromName,
        smtpHost,
        smtpPort,
        smtpSecure,
        smtpUser,
        smtpFrom,
      };
      if (method?.id) values.id = method.id;
      // Secrets: send the field ONLY when the user typed a new value; empty keeps the stored secret.
      if (appsScriptUrl) values.appsScriptUrl = appsScriptUrl;
      if (sharedToken) values.sharedToken = sharedToken;
      if (smtpPass) values.smtpPass = smtpPass;
      const res = await api.request({ url: `${MAILER_RESOURCE}:saveMethod`, method: 'post', data: values });
      const saved = (res?.data?.data || res?.data) as MailMethodView;
      message.success(t('Saved'));
      return saved?.key || method?.key || null;
    } catch (e: any) {
      message.error(e?.response?.data?.errors?.[0]?.message || t('Save failed'));
      return null;
    } finally {
      setSaving(false);
    }
  };

  const saveAndClose = async () => {
    const key = await save();
    if (key != null) onSaved();
  };

  const saveAndTest = async () => {
    if (!testTo.trim()) {
      message.warning(t('Enter a test recipient email'));
      return;
    }
    setTesting(true);
    try {
      const key = await save();
      if (key == null) return;
      const res = await api.request({ url: `${MAILER_RESOURCE}:sendTest`, method: 'post', data: { to: testTo.trim(), methodKey: key } });
      const r = res?.data?.data || res?.data;
      if (r?.ok) message.success(t('Test email sent — check the inbox'));
      else message.error((t('Test failed') + ': ') + (r?.error || 'unknown'));
      onSaved();
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

  const codeBg = token.colorFillQuaternary;

  return (
    <Modal
      title={method?.id ? t('Edit sending method') : t('Add sending method')}
      open={open}
      onCancel={onClose}
      width={720}
      destroyOnClose
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Space>
            <Input
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder={t('test recipient email')}
              style={{ width: 220 }}
            />
            <Button loading={testing} onClick={saveAndTest}>
              {t('Save & send test')}
            </Button>
          </Space>
          <Space>
            <Button onClick={onClose}>{t('Cancel')}</Button>
            <Button type="primary" loading={saving} onClick={saveAndClose}>
              {t('Save')}
            </Button>
          </Space>
        </div>
      }
    >
      <div style={{ maxHeight: '68vh', overflowY: 'auto', paddingRight: 4 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: 12, marginBottom: 12 }}>
          <div>
            <Label hint={t('required')}>{t('Method name')}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('e.g. Default')} />
          </div>
          <div>
            <Label>{t('Enabled')}</Label>
            <Space align="center" style={{ height: 32 }}>
              <Switch checked={enabled} onChange={setEnabled} />
              <span style={{ fontSize: 13 }}>{enabled ? t('On') : t('Off')}</span>
            </Space>
          </div>
        </div>

        <Label>{t('Type')}</Label>
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
              <Label hint={method?.hasAppsScriptUrl ? t('a URL is already set — leave blank to keep it') : t('required')}>
                {t('Apps Script Web App URL (/exec)')}
              </Label>
              <Input
                value={appsScriptUrl}
                onChange={(e) => setAppsScriptUrl(e.target.value)}
                placeholder={method?.hasAppsScriptUrl ? `${SECRET_MASK}${method.appsScriptUrlMask}` : 'https://script.google.com/macros/s/…/exec'}
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <Label hint={method?.hasSharedToken ? t('a token is already set — leave blank to keep it') : t('optional but recommended')}>
                {t('Shared token (sent in the payload; verify it in the script)')}
              </Label>
              <Input.Password
                value={sharedToken}
                onChange={(e) => setSharedToken(e.target.value)}
                placeholder={method?.hasSharedToken ? SECRET_MASK : t('optional — a secret only you and the script know')}
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
                maxHeight: 260,
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
                <Label hint={method?.hasSmtpPass ? t('a password is already set — leave blank to keep it') : undefined}>{t('SMTP password')}</Label>
                <Input.Password value={smtpPass} onChange={(e) => setSmtpPass(e.target.value)} placeholder={method?.hasSmtpPass ? SECRET_MASK : t('app password / SMTP password')} autoComplete="new-password" />
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <Label hint={t('the envelope From address')}>{t('From address')}</Label>
              <Input value={smtpFrom} onChange={(e) => setSmtpFrom(e.target.value)} placeholder="noreply@domain.com" style={{ maxWidth: 360 }} />
            </div>
          </div>
        )}

        <Divider style={{ margin: '12px 0 4px' }} />
        <div style={{ fontSize: 12, color: token.colorTextTertiary }}>
          {t('Secrets (Apps Script URL, SMTP password, shared token) are stored server-side and never sent back to the browser.')}
        </div>
      </div>
    </Modal>
  );
};

export default MethodEditor;
