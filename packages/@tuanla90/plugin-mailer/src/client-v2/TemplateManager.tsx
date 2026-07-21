// Mailer template manager — modeled on plugin-print-template's TemplateManager: a template list +
// a full-screen editor Drawer with a GrapesJS visual body editor, a collection + appends picker, a
// subject field (email-specific), and a LIVE preview pane that renders subject+HTML against a
// pick-able SAMPLE RECORD using the mailer's own isomorphic renderEngine (renderEmail).
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  App as AntApp, Button, Drawer, Input, Popconfirm, Select, Space, Spin, Switch, Table, Tabs, Tag, Tooltip, theme,
} from 'antd';
import { FieldTokenTextArea, RelationAppendsPicker, SegmentedGroup } from '@tuanla90/shared';
import { GrapesBodyEditor } from '../shared/grapesBodyEditor';
import { renderEmail } from '../shared/renderEngine';
import { TEMPLATES_COLLECTION } from '../shared/constants';
import type { MailTemplate } from '../shared/types';
import { t } from '../shared/mailerClient';

const EMPTY = (): MailTemplate => ({ name: '', subject: '', htmlBody: '', collectionName: null, appends: [], enabled: true });

/** Friendly label for a record in the sample-record picker. */
function recordLabel(r: any): string {
  if (!r || typeof r !== 'object') return String(r ?? '');
  for (const k of ['name', 'title', 'code', 'label', 'subject', 'fullName', 'email']) {
    if (typeof r[k] === 'string' && r[k].trim()) return `${r[k]} (#${r.id ?? '?'})`;
  }
  return `#${r.id ?? '?'}`;
}

const HtmlPreview: React.FC<{ html: string }> = ({ html }) => (
  <iframe title="mail-preview" srcDoc={html} style={{ flex: 1, width: '100%', border: 'none', background: '#fff' }} />
);

const EditorDrawer: React.FC<{
  api: any;
  open: boolean;
  initial: MailTemplate;
  collections: { value: string; label: string }[];
  onClose: () => void;
  onSaved: () => void;
}> = ({ api, open, initial, collections, onClose, onSaved }) => {
  const { token } = theme.useToken();
  const { message, modal } = AntApp.useApp();
  const [tpl, setTpl] = useState<MailTemplate>(initial);
  const [saving, setSaving] = useState(false);
  const [bodyMode, setBodyMode] = useState<'visual' | 'html'>('visual');
  const [dirty, setDirty] = useState(false);

  // sample-record picker + preview state
  const [records, setRecords] = useState<any[]>([]);
  const [sampleTk, setSampleTk] = useState<any>(undefined);
  const [sampleTick, setSampleTick] = useState(0);
  const [recLoading, setRecLoading] = useState(false);

  useEffect(() => {
    setTpl(initial);
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial, open]);

  const up = (patch: Partial<MailTemplate>) => {
    setDirty(true);
    setTpl((prev) => ({ ...prev, ...patch }));
  };

  const appendsKey = (tpl.appends || []).join(',');
  // Load a page of records for the picker whenever collection/appends change.
  useEffect(() => {
    let live = true;
    const coll = tpl.collectionName;
    if (!coll) {
      setRecords([]);
      setSampleTk(undefined);
      return;
    }
    setRecLoading(true);
    const params: any = { pageSize: 50, page: 1, sort: ['-id'] };
    const appends = (tpl.appends || []).filter(Boolean);
    if (appends.length) params.appends = appends;
    api
      .request({ url: `${coll}:list`, params })
      .then((res: any) => {
        if (!live) return;
        const list = res?.data?.data || [];
        setRecords(list);
        setSampleTk((prev: any) => (prev != null && list.some((r: any) => r.id === prev) ? prev : list[0]?.id));
      })
      .catch(() => live && setRecords([]))
      .finally(() => live && setRecLoading(false));
    return () => {
      live = false;
    };
  }, [api, tpl.collectionName, appendsKey, sampleTick]);

  const sample = useMemo(() => records.find((r) => r.id === sampleTk) || records[0] || {}, [records, sampleTk]);
  const preview = useMemo(() => renderEmail(tpl.subject, tpl.htmlBody, sample), [tpl.subject, tpl.htmlBody, sample]);

  const tryClose = () => {
    if (!dirty) return onClose();
    modal.confirm({
      title: t('Discard unsaved changes?'),
      content: t('You have changes that are not saved. Closing will lose them.'),
      okText: t('Discard'),
      okButtonProps: { danger: true },
      cancelText: t('Stay'),
      onOk: onClose,
    });
  };

  const save = async () => {
    if (!tpl.name?.trim()) return message.warning(t('Please enter a template name'));
    setSaving(true);
    try {
      const values: any = {
        name: tpl.name.trim(),
        subject: tpl.subject || '',
        htmlBody: tpl.htmlBody || '',
        collectionName: tpl.collectionName || null,
        appends: tpl.appends || [],
        enabled: tpl.enabled !== false,
      };
      if (tpl.id) {
        await api.request({ url: `${TEMPLATES_COLLECTION}:update`, method: 'post', params: { filterByTk: tpl.id }, data: values });
      } else {
        await api.request({ url: `${TEMPLATES_COLLECTION}:create`, method: 'post', data: values });
      }
      message.success(t('Template saved'));
      setDirty(false);
      onSaved();
    } catch (e: any) {
      message.error(e?.response?.data?.errors?.[0]?.message || e?.message || t('Save failed'));
    } finally {
      setSaving(false);
    }
  };

  const label = (text: string) => <div style={{ fontSize: 12, color: token.colorTextTertiary, margin: '10px 0 4px' }}>{text}</div>;

  return (
    <Drawer
      title={tpl.id ? `${t('Edit template')} #${tpl.id}` : t('New template')}
      open={open}
      onClose={tryClose}
      keyboard={false}
      maskClosable={false}
      width="100%"
      destroyOnClose
      styles={{ body: { padding: 0, overflow: 'hidden' } }}
      extra={
        <Button type="primary" loading={saving} onClick={save}>
          {t('Save')}
        </Button>
      }
    >
      <div style={{ display: 'flex', height: '100%' }}>
        {/* LEFT: form + tabs */}
        <div
          style={{
            flex: bodyMode === 'visual' ? '0 0 62%' : '0 0 52%',
            maxWidth: bodyMode === 'visual' ? 1120 : 760,
            overflowY: 'auto',
            padding: 16,
            transition: 'flex-basis .2s',
          }}
        >
          <Tabs
            defaultActiveKey={tpl.id ? 'body' : 'general'}
            items={[
              {
                key: 'general',
                label: t('General'),
                children: (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '0 24px', alignItems: 'start' }}>
                    <div>
                      {label(t('Template name'))}
                      <Input value={tpl.name} onChange={(e) => up({ name: e.target.value })} placeholder={t('e.g. Order confirmation')} />
                    </div>
                    <div>
                      {label(t('Data collection'))}
                      <Select
                        style={{ width: '100%' }}
                        showSearch
                        allowClear
                        optionFilterProp="label"
                        placeholder={t('Pick the collection this template is for')}
                        options={collections}
                        value={tpl.collectionName || undefined}
                        onChange={(v) => up({ collectionName: v || null, appends: [] })}
                      />
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      {label(t('Load related data (appends)'))}
                      <RelationAppendsPicker
                        api={api}
                        collectionName={tpl.collectionName || undefined}
                        value={tpl.appends}
                        onChange={(v: string[]) => up({ appends: v })}
                        hint={t('Pick relations to load so their fields resolve in the template (e.g. customer, items.product).')}
                      />
                    </div>
                    <div>
                      {label(t('Status'))}
                      <Space>
                        <Switch checked={tpl.enabled !== false} onChange={(v) => up({ enabled: v })} />
                        <span style={{ fontSize: 13 }}>{tpl.enabled !== false ? t('Enabled') : t('Off')}</span>
                      </Space>
                    </div>
                  </div>
                ),
              },
              {
                key: 'body',
                label: t('Content'),
                children: (
                  <div>
                    {label(t('Subject'))}
                    <FieldTokenTextArea
                      api={api}
                      collectionName={tpl.collectionName || undefined}
                      includeToMany
                      rows={2}
                      value={tpl.subject}
                      onChange={(v) => up({ subject: v })}
                      placeholder={t('e.g. Your order is confirmed')}
                      label={t('Insert variable')}
                    />
                    <div style={{ height: 12 }} />
                    {label(t('HTML body'))}
                    <SegmentedGroup
                      style={{ marginBottom: 8 }}
                      value={bodyMode}
                      onChange={(v: any) => setBodyMode(v)}
                      options={[
                        { value: 'visual', label: t('Visual (drag & drop)') },
                        { value: 'html', label: t('HTML code') },
                      ]}
                    />
                    {bodyMode === 'visual' ? (
                      <GrapesBodyEditor api={api} collectionName={tpl.collectionName || undefined} value={tpl.htmlBody} onChange={(v) => up({ htmlBody: v })} heightPx={420} />
                    ) : (
                      <Input.TextArea
                        rows={16}
                        value={tpl.htmlBody}
                        onChange={(e) => up({ htmlBody: e.target.value })}
                        placeholder={'<p>Hi {{customer.name}}, your order {{code}} is confirmed.</p>'}
                      />
                    )}
                    <div style={{ fontSize: 12, color: token.colorTextTertiary, marginTop: 6 }}>
                      {/* Code examples kept as literal <code> (NEVER through t() — i18next would interpolate {{...}}). */}
                      Handlebars: <code>{'{{field}}'}</code>, {t('relations')} <code>{'{{customer.name}}'}</code>, {t('rows')}{' '}
                      <code>{'{{#each items}} … {{/each}}'}</code>, {t('numbers')} <code>{'{{formatNumber total format="#,##0"}}'}</code>, {t('dates')}{' '}
                      <code>{'{{formatDate created_at "DD/MM/YYYY"}}'}</code>
                    </div>
                  </div>
                ),
              },
            ]}
          />
        </div>

        {/* RIGHT: sample-record picker + live preview */}
        <div style={{ flex: 1, borderLeft: `1px solid ${token.colorBorderSecondary}`, display: 'flex', flexDirection: 'column', background: token.colorBgLayout, minWidth: 0 }}>
          <div style={{ padding: '8px 12px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12.5, color: token.colorTextTertiary, whiteSpace: 'nowrap' }}>{t('Preview with:')}</span>
            <Select
              size="small"
              style={{ flex: 1, minWidth: 160 }}
              showSearch
              optionFilterProp="label"
              placeholder={tpl.collectionName ? t('Pick a record') : t('Pick a collection first')}
              value={sampleTk}
              onChange={(v) => setSampleTk(v)}
              notFoundContent={recLoading ? <Spin size="small" /> : t('No records')}
              options={records.map((r) => ({ value: r.id, label: recordLabel(r) }))}
              disabled={!tpl.collectionName}
            />
            <Tooltip title={t('Reload records')}>
              <Button size="small" onClick={() => setSampleTick((x) => x + 1)} disabled={!tpl.collectionName}>
                ↻
              </Button>
            </Tooltip>
          </div>
          <div style={{ padding: '0 12px 8px' }}>
            <div style={{ border: `1px solid ${token.colorBorderSecondary}`, borderRadius: 6, padding: '6px 10px', background: token.colorBgContainer }}>
              <span style={{ fontSize: 12, color: token.colorTextTertiary }}>{t('Subject')}: </span>
              <b>{preview.subject || <span style={{ color: token.colorTextQuaternary }}>—</span>}</b>
            </div>
          </div>
          <HtmlPreview html={preview.html || `<div style="color:#999;font-family:sans-serif;padding:16px">${t('Nothing to preview')}</div>`} />
        </div>
      </div>
    </Drawer>
  );
};

export interface TemplateManagerProps {
  api: any;
}

export const TemplateManager: React.FC<TemplateManagerProps> = ({ api }) => {
  const { token } = theme.useToken();
  const { message } = AntApp.useApp();
  const [rows, setRows] = useState<MailTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [collections, setCollections] = useState<{ value: string; label: string }[]>([]);
  const [editing, setEditing] = useState<MailTemplate | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    api
      ?.request({ url: `${TEMPLATES_COLLECTION}:list`, params: { paginate: false, sort: ['-id'] } })
      .then((res: any) => setRows(res?.data?.data || []))
      .catch(() => message.error(t('Could not load templates')))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  useEffect(() => {
    reload();
    api
      ?.request({ url: 'collections:list', params: { paginate: false, sort: ['name'] } })
      .then((res: any) => {
        const list = (res?.data?.data || [])
          .filter((c: any) => !c.hidden && c.name && !String(c.name).startsWith('ptdl'))
          .map((c: any) => ({ value: c.name, label: `${c.title || c.name} (${c.name})` }));
        setCollections(list);
      })
      .catch(() => setCollections([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const remove = async (id: any) => {
    try {
      await api.request({ url: `${TEMPLATES_COLLECTION}:destroy`, method: 'post', params: { filterByTk: id } });
      message.success(t('Deleted'));
      reload();
    } catch {
      message.error(t('Delete failed'));
    }
  };

  const collLabel = useMemo(() => {
    const m = new Map(collections.map((c) => [c.value, c.label]));
    return (name?: string | null) => (name ? m.get(name) || name : '');
  }, [collections]);

  return (
    <div>
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ color: token.colorTextTertiary, fontSize: 13 }}>
          {t('Reusable email templates with a visual editor, variable insertion and a live preview bound to a sample record.')}
        </div>
        <Button type="primary" onClick={() => setEditing(EMPTY())}>
          {t('New template')}
        </Button>
      </div>
      <Table
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={rows}
        pagination={false}
        columns={[
          { title: 'ID', dataIndex: 'id', width: 60, render: (v: any) => <Tag style={{ fontFamily: 'monospace' }}>#{v}</Tag> },
          {
            title: t('Name'),
            dataIndex: 'name',
            render: (v: any, r: MailTemplate) => <a onClick={() => setEditing({ ...EMPTY(), ...r })}>{v || `#${r.id}`}</a>,
          },
          { title: t('Subject'), dataIndex: 'subject', ellipsis: true },
          { title: t('Collection'), dataIndex: 'collectionName', render: (v: any) => (v ? <Tag>{collLabel(v)}</Tag> : <span style={{ color: token.colorTextQuaternary }}>—</span>) },
          {
            title: t('Status'),
            dataIndex: 'enabled',
            width: 90,
            render: (v: any) => (v === false ? <Tag>{t('Off')}</Tag> : <Tag color="green">{t('On')}</Tag>),
          },
          {
            title: '',
            width: 220,
            render: (_: any, r: MailTemplate) => (
              <Space size="small">
                <Button size="small" onClick={() => setEditing({ ...EMPTY(), ...r })}>
                  {t('Edit')}
                </Button>
                <Button
                  size="small"
                  onClick={() => {
                    const { id, ...rest } = r as any;
                    setEditing({ ...EMPTY(), ...rest, name: `${r.name || ''} ${t('(copy)')}` });
                  }}
                >
                  {t('Duplicate')}
                </Button>
                <Popconfirm title={t('Delete this template?')} okText={t('Delete')} cancelText={t('Cancel')} onConfirm={() => remove(r.id)}>
                  <Button size="small" danger>
                    {t('Delete')}
                  </Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />
      {editing && (
        <EditorDrawer
          api={api}
          open={!!editing}
          initial={editing}
          collections={collections}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
    </div>
  );
};

export default TemplateManager;
