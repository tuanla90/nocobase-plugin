import React, { useEffect, useMemo, useState } from 'react';
import { App as AntApp, Button, Checkbox, Divider, Input, Modal, Segmented, Select, Space, Spin, Tag, theme, Tooltip } from 'antd';
import { renderEmail, extractTokens } from '../shared/renderEngine';
import { TEMPLATES_COLLECTION, MAILER_RESOURCE } from '../shared/constants';
import type { MailTemplate, MailMethodOption } from '../shared/types';
import { t, mailerMethodsSettingsUrl } from '../shared/mailerClient';

/** "Configure sending methods ↗" — opens the mailer settings (Tab 1) in a new tab (same app). */
const ConfigMethodsLink: React.FC<{ small?: boolean }> = ({ small }) => (
  <a
    onClick={(e) => {
      e.preventDefault();
      e.stopPropagation();
      window.open(mailerMethodsSettingsUrl(), '_blank', 'noopener');
    }}
    style={{ fontSize: small ? 12 : 13, whiteSpace: 'nowrap' }}
  >
    {t('Configure sending methods ↗')}
  </a>
);

const HtmlPreview: React.FC<{ html: string }> = ({ html }) => {
  const { token } = theme.useToken();
  return (
    <iframe
      title="preview"
      srcDoc={html || `<div style="color:#999;font-family:sans-serif;padding:12px">${t('Nothing to preview')}</div>`}
      style={{ width: '100%', height: 300, border: `1px solid ${token.colorBorder}`, borderRadius: 8, background: '#fff' }}
    />
  );
};

/** relation-prefix appends implied by the template tokens (customer.name → "customer"). */
function appendsFromTokens(tokens: string[]): string[] {
  const set = new Set<string>();
  for (const tok of tokens) {
    const parts = tok.split('.');
    if (parts.length > 1) set.add(parts.slice(0, -1).join('.'));
  }
  return [...set];
}

interface AttachmentOption {
  id: number;
  label: string;
  field: string;
}

const SendEmailDialog: React.FC<{
  api: any;
  collection: any;
  tk: any;
  onClose: () => void;
}> = ({ api, collection, tk, onClose }) => {
  const { token } = theme.useToken();
  const { message } = AntApp.useApp();
  const collectionName = collection?.name;

  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<MailTemplate[]>([]);
  const [methods, setMethods] = useState<MailMethodOption[]>([]);
  const [methodKey, setMethodKey] = useState<string>(''); // '' = use the default method
  const [record, setRecord] = useState<any>(null);
  const [attachmentOptions, setAttachmentOptions] = useState<AttachmentOption[]>([]);

  const [mode, setMode] = useState<'template' | 'inline'>('template');
  const [templateId, setTemplateId] = useState<number | undefined>(undefined);
  const [inlineSubject, setInlineSubject] = useState('');
  const [inlineHtml, setInlineHtml] = useState('');
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [selectedAttachments, setSelectedAttachments] = useState<number[]>([]);
  const [sending, setSending] = useState(false);

  const currentTemplate = useMemo(() => templates.find((x) => x.id === templateId), [templates, templateId]);

  // the subject/html used for the preview + (inline) send
  const previewSubject = mode === 'inline' ? inlineSubject : currentTemplate?.subject || '';
  const previewHtml = mode === 'inline' ? inlineHtml : currentTemplate?.htmlBody || '';

  const preview = useMemo(() => renderEmail(previewSubject, previewHtml, record || {}), [previewSubject, previewHtml, record]);

  // initial load: templates (for this collection or global) + the record (with token/attachment appends)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // 1) attachment fields on this collection
        let attachmentFieldNames: string[] = [];
        try {
          const cf = await api.request({ url: `collections/${collectionName}/fields:list`, params: { paginate: false } });
          const fields = cf?.data?.data || [];
          attachmentFieldNames = fields
            .filter((f: any) => f.interface === 'attachment' || f.target === 'attachments' || f?.options?.target === 'attachments')
            .map((f: any) => f.name);
        } catch {
          /* best-effort */
        }

        // 2) sending methods (minimal, secret-free) + templates
        try {
          const mRes = await api.request({ url: `${MAILER_RESOURCE}:methodOptions`, method: 'post' });
          const allMethods: MailMethodOption[] = (mRes?.data?.data || mRes?.data || []) as MailMethodOption[];
          if (!cancelled) setMethods(allMethods);
        } catch {
          /* pickers fall back to the server-side default method */
        }

        const tplRes = await api.request({ url: `${TEMPLATES_COLLECTION}:list`, params: { paginate: false, sort: ['-id'] } });
        const allTpls: MailTemplate[] = (tplRes?.data?.data || []).filter((x: any) => x.enabled !== false);
        if (cancelled) return;
        // Show ALL templates (never hide any behind a raw id); default-select one for THIS collection.
        setTemplates(allTpls);
        const preferred = allTpls.find((x) => x.collectionName === collectionName) || allTpls.find((x) => !x.collectionName) || allTpls[0];
        if (preferred?.id) setTemplateId(preferred.id);

        // 3) appends = union of template appends + token-implied appends + attachment fields
        const tokens = extractTokens(...allTpls.map((x) => `${x.subject} ${x.htmlBody}`));
        const appends = Array.from(new Set([...appendsFromTokens(tokens), ...attachmentFieldNames]));

        // 4) the record
        const recRes = await api.request({ url: `${collectionName}:get`, params: { filterByTk: tk, ...(appends.length ? { appends } : {}) } });
        const rec = recRes?.data?.data || {};
        if (cancelled) return;
        setRecord(rec);

        // 5) attachment options from the record's attachment fields
        const opts: AttachmentOption[] = [];
        for (const fname of attachmentFieldNames) {
          const val = rec[fname];
          const arr = Array.isArray(val) ? val : val ? [val] : [];
          for (const a of arr) {
            if (a && a.id) opts.push({ id: a.id, label: a.title || a.filename || `#${a.id}`, field: fname });
          }
        }
        setAttachmentOptions(opts);

        // 6) guess a default "to" from a likely email field on the record
        const emailKey = Object.keys(rec).find((k) => /email/i.test(k) && typeof rec[k] === 'string' && rec[k].includes('@'));
        if (emailKey) setTo(rec[emailKey]);
      } catch (e: any) {
        message.error(t('Could not load record / templates'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const send = async () => {
    if (!to.trim()) {
      message.warning(t('Please enter at least one "To" recipient'));
      return;
    }
    if (mode === 'template' && !templateId) {
      message.warning(t('Please pick a template (or switch to Inline)'));
      return;
    }
    setSending(true);
    try {
      const payload: any = {
        collectionName,
        recordId: tk,
        to,
        cc,
        bcc,
        attachments: selectedAttachments,
        methodKey: methodKey || undefined, // '' → let the server use the default method
      };
      if (mode === 'template') payload.templateId = templateId;
      else {
        payload.inlineSubject = inlineSubject;
        payload.inlineHtml = inlineHtml;
      }
      const res = await api.request({ url: `${MAILER_RESOURCE}:send`, method: 'post', data: payload });
      const r = res?.data?.data || res?.data;
      if (r?.ok) {
        message.success(t('Email sent'));
        onClose();
      } else {
        message.error((t('Send failed') + ': ') + (r?.error || 'unknown'));
      }
    } catch (e: any) {
      message.error(e?.response?.data?.errors?.[0]?.message || t('Send failed'));
    } finally {
      setSending(false);
    }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
      {/* left: compose */}
      <div>
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: 12, color: token.colorTextTertiary }}>{t('Sending method')}</span>
            <ConfigMethodsLink small />
          </div>
          <Select
            style={{ width: '100%' }}
            showSearch
            optionFilterProp="label"
            value={methodKey}
            onChange={(v) => setMethodKey(v)}
            options={[
              { value: '', label: t('Default method') },
              ...methods.map((m) => ({
                value: m.key,
                label: `${m.name || m.key} · ${m.backend === 'smtp' ? t('SMTP') : t('Apps Script')}${m.isDefault ? ' · ' + t('Default') : ''}${m.enabled === false ? ' · ' + t('Off') : ''}`,
              })),
            ]}
          />
        </div>

        <Segmented
          block
          value={mode}
          onChange={(v) => setMode(v as any)}
          options={[
            { label: t('Template'), value: 'template' },
            { label: t('Inline'), value: 'inline' },
          ]}
          style={{ marginBottom: 12 }}
        />

        {mode === 'template' ? (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 12, color: token.colorTextTertiary, marginBottom: 4 }}>{t('Template')}</div>
            {templates.length ? (
              <Select
                style={{ width: '100%' }}
                showSearch
                optionFilterProp="label"
                value={templateId}
                onChange={(v) => setTemplateId(v)}
                options={templates.map((x) => ({
                  value: x.id!,
                  label: `${x.name || `#${x.id}`} · ${x.collectionName || t('any collection')} · #${x.id}`,
                }))}
                placeholder={t('Pick a template')}
              />
            ) : (
              <Tag color="orange">{t('No templates yet — create one in Settings → Mailer → Templates, or use Inline.')}</Tag>
            )}
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, color: token.colorTextTertiary, marginBottom: 4 }}>{t('Subject')}</div>
              <Input value={inlineSubject} onChange={(e) => setInlineSubject(e.target.value)} placeholder={t('Subject (supports variables)')} />
            </div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, color: token.colorTextTertiary, marginBottom: 4 }}>{t('HTML body')}</div>
              <Input.TextArea rows={6} value={inlineHtml} onChange={(e) => setInlineHtml(e.target.value)} placeholder={'<p>Hi {{name}}, …</p>'} />
            </div>
          </>
        )}

        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12, color: token.colorTextTertiary, marginBottom: 4 }}>{t('To')} <span style={{ color: token.colorTextQuaternary }}>· {t('comma-separated')}</span></div>
          <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="a@x.com, b@y.com" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 12, color: token.colorTextTertiary, marginBottom: 4 }}>{t('CC')}</div>
            <Input value={cc} onChange={(e) => setCc(e.target.value)} />
          </div>
          <div>
            <div style={{ fontSize: 12, color: token.colorTextTertiary, marginBottom: 4 }}>{t('BCC')}</div>
            <Input value={bcc} onChange={(e) => setBcc(e.target.value)} />
          </div>
        </div>

        {attachmentOptions.length ? (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 12, color: token.colorTextTertiary, marginBottom: 4 }}>{t('Attachments (from this record)')}</div>
            <Checkbox.Group
              value={selectedAttachments}
              onChange={(v) => setSelectedAttachments(v as number[])}
              options={attachmentOptions.map((a) => ({ label: `${a.label}`, value: a.id }))}
            />
          </div>
        ) : null}
      </div>

      {/* right: preview + send */}
      <div>
        <div style={{ fontSize: 12, color: token.colorTextTertiary, marginBottom: 4 }}>{t('Preview (rendered against this record)')}</div>
        <div
          style={{
            border: `1px solid ${token.colorBorderSecondary}`,
            borderRadius: 8,
            padding: '8px 12px',
            marginBottom: 8,
            background: token.colorFillQuaternary,
          }}
        >
          <span style={{ fontSize: 12, color: token.colorTextTertiary }}>{t('Subject')}: </span>
          <b>{preview.subject || <span style={{ color: token.colorTextQuaternary }}>—</span>}</b>
        </div>
        <HtmlPreview html={preview.html} />

        <Divider style={{ margin: '12px 0' }} />
        <Space style={{ float: 'right' }}>
          <Button onClick={onClose}>{t('Cancel')}</Button>
          <Button type="primary" loading={sending} onClick={send}>
            {t('Send email')}
          </Button>
        </Space>
      </div>
    </div>
  );
};

/** ActionModel factory (record scene) — the "Send email" button in a table row / detail block. */
export function defineSendEmailActionModel(Base: any) {
  const SendButton: React.FC<{ api: any; collection: any; record: any; tk: any; label: React.ReactNode; btnProps: any }> = ({
    api,
    collection,
    record,
    tk,
    label,
    btnProps,
  }) => {
    const [open, setOpen] = useState(false);

    let reason = '';
    if (!collection?.name) reason = t('No collection context');
    else if (!record || tk == null) reason = t('No record context');

    if (reason) {
      return (
        <Tooltip title={reason}>
          <Button {...btnProps} disabled>
            {label}
          </Button>
        </Tooltip>
      );
    }
    return (
      <>
        <Button
          {...btnProps}
          onClick={(e: any) => {
            e?.stopPropagation?.();
            setOpen(true);
          }}
        >
          {label}
        </Button>
        <Modal title={t('Send email')} open={open} onCancel={() => setOpen(false)} footer={null} width={960} destroyOnClose>
          {open ? <SendEmailDialog api={api} collection={collection} tk={tk} onClose={() => setOpen(false)} /> : null}
        </Modal>
      </>
    );
  };

  class SendEmailActionModel extends Base {
    static scene = 'record';

    defaultProps: any = {
      title: 'Send email',
    };

    getAclActionName() {
      return 'get';
    }

    render() {
      const { iconOnly, tooltip, title, children, ...btnProps }: any = (this as any).props || {};
      void iconOnly;
      const ctx: any = (this as any).context;
      const collection = ctx?.collection || ctx?.blockModel?.collection;
      const record = ctx?.record;
      const tkField = collection?.filterTargetKey || 'id';
      const tk = record?.[Array.isArray(tkField) ? tkField[0] : tkField];
      const resolved = (typeof (this as any).getTitle === 'function' ? (this as any).getTitle() : title) || 'Send email';
      const label = children || (typeof resolved === 'string' ? t(resolved) : resolved);
      const btn = <SendButton api={ctx?.api} collection={collection} record={record} tk={tk} label={label} btnProps={btnProps} />;
      return tooltip ? <Tooltip title={tooltip}>{btn}</Tooltip> : btn;
    }
  }

  (SendEmailActionModel as any).define({
    label: t('Send email'),
    sort: 57,
  });

  return SendEmailActionModel;
}

export default defineSendEmailActionModel;
