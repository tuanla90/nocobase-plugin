import React, { useCallback, useEffect, useState } from 'react';
import { App as AntApp, Button, Popconfirm, Space, Switch, Table, Tag, theme, Tooltip } from 'antd';
import { MAILER_RESOURCE } from '../shared/constants';
import type { MailMethodView } from '../shared/types';
import { t } from '../shared/mailerClient';
import { MethodEditor } from './MethodEditor';

export interface MethodsManagerProps {
  api: any;
}

/** Tab 1 — "Sending methods". A list/table of named backend configs (Apps Script / SMTP) with add / edit /
 *  delete / enable-toggle / set-default. Replaces the v0.1.x single-backend form. */
export const MethodsManager: React.FC<MethodsManagerProps> = ({ api }) => {
  const { token } = theme.useToken();
  const { message } = AntApp.useApp();
  const [rows, setRows] = useState<MailMethodView[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [editing, setEditing] = useState<MailMethodView | null | undefined>(undefined); // undefined = closed, null = new

  const reload = useCallback(() => {
    setLoading(true);
    api
      ?.request({ url: `${MAILER_RESOURCE}:getMethods`, method: 'post' })
      .then((res: any) => setRows((res?.data?.data || res?.data || []) as MailMethodView[]))
      .catch(() => message.error(t('Could not load config (admin only)')))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleEnabled = async (r: MailMethodView, next: boolean) => {
    setBusyId(r.id);
    try {
      await api.request({ url: `${MAILER_RESOURCE}:saveMethod`, method: 'post', data: { id: r.id, enabled: next } });
      reload();
    } catch {
      message.error(t('Save failed'));
    } finally {
      setBusyId(null);
    }
  };

  const setDefault = async (r: MailMethodView) => {
    setBusyId(r.id);
    try {
      await api.request({ url: `${MAILER_RESOURCE}:setDefaultMethod`, method: 'post', data: { id: r.id } });
      reload();
    } catch {
      message.error(t('Save failed'));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (r: MailMethodView) => {
    setBusyId(r.id);
    try {
      await api.request({ url: `${MAILER_RESOURCE}:deleteMethod`, method: 'post', data: { id: r.id } });
      message.success(t('Deleted'));
      reload();
    } catch {
      message.error(t('Delete failed'));
    } finally {
      setBusyId(null);
    }
  };

  const fromOf = (r: MailMethodView) => r.fromName || (r.backend === 'smtp' ? r.smtpFrom || r.smtpUser : '') || '';

  return (
    <div>
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div style={{ color: token.colorTextTertiary, fontSize: 13 }}>
          {t('Define one or more sending methods. The Send email action and workflow node pick a method (or use the default).')}
        </div>
        <Button type="primary" onClick={() => setEditing(null)}>
          {t('Add sending method')}
        </Button>
      </div>

      <Table
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={rows}
        pagination={false}
        locale={{ emptyText: t('No sending methods yet — add one.') }}
        columns={[
          {
            title: t('Name'),
            dataIndex: 'name',
            render: (v: any, r: MailMethodView) => (
              <Space size={6}>
                <a onClick={() => setEditing(r)}>{v || `#${r.id}`}</a>
                {r.isDefault ? <Tag color="blue">{t('Default')}</Tag> : null}
              </Space>
            ),
          },
          {
            title: t('Type'),
            dataIndex: 'backend',
            width: 150,
            render: (v: any) => <Tag>{v === 'smtp' ? t('SMTP') : t('Apps Script')}</Tag>,
          },
          {
            title: t('From'),
            key: 'from',
            ellipsis: true,
            render: (_: any, r: MailMethodView) => fromOf(r) || <span style={{ color: token.colorTextQuaternary }}>—</span>,
          },
          {
            title: t('Enabled'),
            dataIndex: 'enabled',
            width: 90,
            render: (v: any, r: MailMethodView) => (
              <Switch size="small" checked={v !== false} loading={busyId === r.id} onChange={(next) => toggleEnabled(r, next)} />
            ),
          },
          {
            title: t('Default'),
            key: 'default',
            width: 120,
            render: (_: any, r: MailMethodView) =>
              r.isDefault ? (
                <Tag color="blue">{t('Default')}</Tag>
              ) : (
                <Button size="small" disabled={busyId === r.id} onClick={() => setDefault(r)}>
                  {t('Set as default')}
                </Button>
              ),
          },
          {
            title: '',
            key: 'ops',
            width: 150,
            render: (_: any, r: MailMethodView) => (
              <Space size="small">
                <Button size="small" onClick={() => setEditing(r)}>
                  {t('Edit')}
                </Button>
                <Popconfirm title={t('Delete this sending method?')} okText={t('Delete')} cancelText={t('Cancel')} onConfirm={() => remove(r)}>
                  <Tooltip title={r.isDefault ? t('Deleting the default — another method becomes default') : undefined}>
                    <Button size="small" danger>
                      {t('Delete')}
                    </Button>
                  </Tooltip>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />

      <MethodEditor
        api={api}
        open={editing !== undefined}
        method={editing ?? null}
        onClose={() => setEditing(undefined)}
        onSaved={() => {
          setEditing(undefined);
          reload();
        }}
      />
    </div>
  );
};

export default MethodsManager;
