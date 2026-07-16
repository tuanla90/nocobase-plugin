import React, { useEffect, useMemo, useState } from 'react';
import { Button, Card, Modal, Select, Space, Switch, Table, Tag, Tooltip, message } from 'antd';
import { ColumnSelect, buildColumnOptions } from '@ptdl/shared';
import { t, tr } from './changeLogClient';

// Settings page: one row per collection that has change logging on. Editing a config lets the
// admin pick which fields TRIGGER a log (status fields listed first) and which extra fields are
// SNAPSHOTTED alongside the default columns, toggle the optional note, and enable/disable.

interface CollectionInfo {
  name: string;
  title?: string;
  fields: Array<{ name: string; interface?: string; title?: string }>;
}

interface ConfigRow {
  id?: number;
  collectionName: string;
  enabled: boolean;
  triggerFields: string[];
  snapshotFields: string[];
  captureNote: boolean;
}

const fieldLabel = (f: { name: string; title?: string }) => {
  const t = tr(f.title);
  return t && t !== f.name ? `${t} (${f.name})` : f.name;
};

const collectionLabel = (c: { name: string; title?: string }) => {
  const t = tr(c.title);
  return t && t !== c.name ? `${t} (${c.name})` : c.name;
};

export const ChangeLogConfigManager: React.FC<{ api: any }> = ({ api }) => {
  const [collections, setCollections] = useState<CollectionInfo[]>([]);
  const [rows, setRows] = useState<ConfigRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<ConfigRow | null>(null);

  const loadCollections = async () => {
    try {
      const res = await api?.request?.({
        url: 'collections:list',
        params: { paginate: false, appends: ['fields'] },
      });
      const list = (res?.data?.data || []).map((c: any) => ({
        name: c.name,
        title: c.title,
        fields: (c.fields || []).map((f: any) => ({
          name: f.name,
          interface: f.interface,
          title: f?.uiSchema?.title,
        })),
      }));
      setCollections(list);
    } catch (e) {
      setCollections([]);
    }
  };

  const loadRows = async () => {
    setLoading(true);
    try {
      const res = await api?.request?.({ url: 'ptdlChangeLogConfigs:list', params: { paginate: false } });
      setRows(
        (res?.data?.data || []).map((r: any) => ({
          id: r.id,
          collectionName: r.collectionName,
          enabled: r.enabled !== false,
          triggerFields: r.triggerFields || [],
          snapshotFields: r.snapshotFields || [],
          captureNote: !!r.captureNote,
        })),
      );
    } catch (e) {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCollections();
    loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async (row: ConfigRow) => {
    if (!row.collectionName) {
      message.warning(t('Pick a collection'));
      return;
    }
    try {
      if (row.id) {
        await api?.request?.({
          url: 'ptdlChangeLogConfigs:update',
          method: 'post',
          params: { filterByTk: row.id },
          data: row,
        });
      } else {
        await api?.request?.({ url: 'ptdlChangeLogConfigs:create', method: 'post', data: row });
      }
      message.success(t('Saved'));
      setEditing(null);
      loadRows();
    } catch (e: any) {
      message.error(e?.response?.data?.errors?.[0]?.message || e?.message || t('Save failed'));
    }
  };

  const remove = async (row: ConfigRow) => {
    if (!row.id) return;
    try {
      await api?.request?.({ url: 'ptdlChangeLogConfigs:destroy', method: 'post', params: { filterByTk: row.id } });
      loadRows();
    } catch (e) {
      message.error(t('Delete failed'));
    }
  };

  const usedCollections = new Set(rows.map((r) => r.collectionName));

  // Show field labels (not raw names) in the trigger/snapshot tags.
  const fieldTagLabel = (row: ConfigRow, name: string) => {
    const c = collections.find((x) => x.name === row.collectionName);
    const f = (c?.fields || []).find((x) => x.name === name);
    return f ? fieldLabel(f) : name;
  };

  const columns = [
    {
      title: t('Collection'),
      dataIndex: 'collectionName',
      render: (v: string) => {
        const c = collections.find((x) => x.name === v);
        return <span>{c ? collectionLabel(c) : v}</span>;
      },
    },
    {
      title: t('Trigger fields'),
      dataIndex: 'triggerFields',
      render: (v: string[], row: ConfigRow) =>
        v?.length ? v.map((f) => <Tag key={f}>{fieldTagLabel(row, f)}</Tag>) : <span style={{ opacity: 0.5 }}>—</span>,
    },
    {
      title: t('Snapshot fields'),
      dataIndex: 'snapshotFields',
      render: (v: string[], row: ConfigRow) =>
        v?.length ? v.map((f) => <Tag key={f}>{fieldTagLabel(row, f)}</Tag>) : <span style={{ opacity: 0.5 }}>—</span>,
    },
    { title: t('Note'), dataIndex: 'captureNote', render: (v: boolean) => (v ? t('Yes') : t('No')) },
    {
      title: t('Enabled'),
      dataIndex: 'enabled',
      render: (v: boolean, row: ConfigRow) => (
        <Switch
          size="small"
          checked={v}
          onChange={(checked) => save({ ...row, enabled: checked })}
        />
      ),
    },
    {
      title: '',
      key: 'op',
      render: (_: any, row: ConfigRow) => (
        <Space>
          <Button size="small" onClick={() => setEditing({ ...row })}>
            {t('Edit')}
          </Button>
          <Button size="small" danger onClick={() => remove(row)}>
            {t('Delete')}
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Card
      title={t('Change log — tracked collections')}
      extra={
        <Button
          type="primary"
          onClick={() =>
            setEditing({ collectionName: '', enabled: true, triggerFields: [], snapshotFields: [], captureNote: false })
          }
        >
          {t('Add collection')}
        </Button>
      }
    >
      <Table rowKey={(r) => String(r.id ?? r.collectionName)} loading={loading} columns={columns as any} dataSource={rows} pagination={false} size="small" />
      {editing && (
        <ConfigEditor
          value={editing}
          collections={collections}
          disabledCollections={usedCollections}
          onCancel={() => setEditing(null)}
          onSave={save}
        />
      )}
    </Card>
  );
};

const ConfigEditor: React.FC<{
  value: ConfigRow;
  collections: CollectionInfo[];
  disabledCollections: Set<string>;
  onCancel: () => void;
  onSave: (row: ConfigRow) => void;
}> = ({ value, collections, disabledCollections, onCancel, onSave }) => {
  const [row, setRow] = useState<ConfigRow>(value);
  const coll = useMemo(() => collections.find((c) => c.name === row.collectionName), [collections, row.collectionName]);

  // Status fields first (this is the primary use case), then everything else.
  const fieldOptions = useMemo(() => {
    const fields = coll?.fields || [];
    const status = fields.filter((f) => f.interface === 'statusFlow');
    const rest = fields.filter((f) => f.interface !== 'statusFlow');
    const opt = (f: any, group: string) => ({ label: fieldLabel(f), value: f.name, group });
    return [
      ...(status.length ? [{ label: t('Status fields'), options: status.map((f) => opt(f, 'status')) }] : []),
      { label: t('Other fields'), options: rest.map((f) => opt(f, 'other')) },
    ];
  }, [coll]);

  return (
    <Modal open title={row.id ? t('Edit config') : t('Add config')} onCancel={onCancel} onOk={() => onSave(row)} okText={t('Save')} width={560}>
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <div>
          <div style={{ fontSize: 13, marginBottom: 4 }}>{t('Collection')}</div>
          <Select
            style={{ width: '100%' }}
            showSearch
            optionFilterProp="label"
            disabled={!!row.id}
            value={row.collectionName || undefined}
            placeholder={t('Pick a collection')}
            onChange={(v) => {
              // Sensible defaults so a new config isn't empty: trigger = the collection's status
              // fields (primary use case); snapshot = updatedBy/updatedAt when they exist.
              const c = collections.find((x) => x.name === v);
              const fields = c?.fields || [];
              const statusFields = fields.filter((f) => f.interface === 'statusFlow').map((f) => f.name);
              const defaultSnaps = ['updatedBy', 'updatedAt'].filter((n) => fields.some((f) => f.name === n));
              setRow({ ...row, collectionName: v, triggerFields: statusFields, snapshotFields: defaultSnaps });
            }}
            options={collections.map((c) => ({
              label: collectionLabel(c),
              value: c.name,
              disabled: !row.id && disabledCollections.has(c.name),
            }))}
          />
        </div>
        <div>
          <div style={{ fontSize: 13, marginBottom: 4 }}>
            {t('Trigger fields')}{' '}
            <Tooltip title={t('A log entry is written whenever one of these fields changes. Status fields are the primary use case.')}>
              <span style={{ opacity: 0.5, cursor: 'help' }}>ⓘ</span>
            </Tooltip>
          </div>
          <Select
            mode="multiple"
            style={{ width: '100%' }}
            placeholder={t('Pick trigger fields')}
            value={row.triggerFields}
            onChange={(v) => setRow({ ...row, triggerFields: v })}
            options={fieldOptions as any}
          />
        </div>
        <div>
          <div style={{ fontSize: 13, marginBottom: 4 }}>
            {t('Snapshot fields')}{' '}
            <Tooltip title={t('Extra fields captured (as they were at the moment of the change) alongside the default columns.')}>
              <span style={{ opacity: 0.5, cursor: 'help' }}>ⓘ</span>
            </Tooltip>
          </div>
          <ColumnSelect
            mode="multiple"
            placeholder={t('Optional companion fields to snapshot')}
            value={row.snapshotFields}
            onChange={(v) => setRow({ ...row, snapshotFields: v })}
            options={buildColumnOptions(coll?.fields || [])}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Switch checked={row.captureNote} onChange={(c) => setRow({ ...row, captureNote: c })} />
          <span style={{ fontSize: 13 }}>{t('Capture an optional note/reason with each change')}</span>
        </div>
      </Space>
    </Modal>
  );
};
