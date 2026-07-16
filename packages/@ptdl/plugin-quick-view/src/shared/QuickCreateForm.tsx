/**
 * Quick View — the config UI. Pick a collection + columns → one button generates a `/v/` menu page
 * with a Table of those columns and View/Edit/Add buttons. Lane-agnostic: `app` and `t` are injected
 * by each lane (client / client-v2), so this file imports nothing from @nocobase/client* .
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Input, Select, Space, Typography, message } from 'antd';
import { ColumnSelect } from '@ptdl/shared';
import { createQuickPage, clientPrefix } from './quickView';

export interface QuickCreateFormProps {
  app: any;
  t: (s: string, opts?: Record<string, any>) => string;
  /** called after a page is created (e.g. to close the launcher drawer) */
  onCreated?: (pageSchemaUid: string) => void;
  /** compact = drawer variant (no outer card chrome) */
  compact?: boolean;
}

type Coll = { name: string; title: string };
type Group = { id: number; title: string };

// A short, friendly icon menu (NocoBase uses @ant-design/icons names on routes). Keeps v1 free of the
// Lucide registry wiring; default is a table icon.
const ICON_OPTIONS = [
  'TableOutlined', 'UnorderedListOutlined', 'AppstoreOutlined', 'DatabaseOutlined', 'FileTextOutlined',
  'FolderOutlined', 'ProfileOutlined', 'ContainerOutlined', 'BarsOutlined', 'ProjectOutlined',
];

function humanize(title: any, fallback: string): string {
  if (title == null) return fallback;
  const s = String(title);
  const m = s.match(/\{\{\s*t\(\s*['"]([^'"]+)['"]/);
  if (m) return m[1];
  if (/\{\{/.test(s)) return fallback;
  return s || fallback;
}

async function fetchCollections(api: any): Promise<Coll[]> {
  try {
    const res = await api.resource('collections').list({ paginate: false });
    const cols = res?.data?.data ?? [];
    return cols
      .filter((c: any) => c && !c.hidden && c.name)
      .map((c: any) => ({ name: String(c.name), title: humanize(c.title, String(c.name)) }))
      .sort((a: Coll, b: Coll) => a.title.localeCompare(b.title));
  } catch (e) {
    return [];
  }
}

async function fetchGroups(api: any): Promise<Group[]> {
  try {
    const res = await api.resource('desktopRoutes').list({ paginate: false, sort: 'sort' });
    const rows = res?.data?.data ?? [];
    return rows.filter((r: any) => r && r.type === 'group' && r.id != null).map((r: any) => ({ id: r.id, title: humanize(r.title, `#${r.id}`) }));
  } catch (e) {
    return [];
  }
}

export const QuickCreateForm: React.FC<QuickCreateFormProps> = ({ app, t, onCreated, compact }) => {
  const api = app?.apiClient;
  const [collections, setCollections] = useState<Coll[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [collectionName, setCollectionName] = useState<string>('');
  const [fields, setFields] = useState<string[]>([]);
  const [title, setTitle] = useState<string>('');
  const [titleTouched, setTitleTouched] = useState(false);
  const [icon, setIcon] = useState<string>('TableOutlined');
  const [parentId, setParentId] = useState<number | undefined>(undefined);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchCollections(api).then(setCollections);
    fetchGroups(api).then(setGroups);
  }, [api]);

  const collTitle = useMemo(() => collections.find((c) => c.name === collectionName)?.title || '', [collections, collectionName]);

  // Auto-fill the page title from the collection until the user edits it themselves.
  useEffect(() => {
    if (!titleTouched) setTitle(collTitle);
  }, [collTitle, titleTouched]);

  const canCreate = !!collectionName && fields.length > 0 && !!title.trim() && !creating;

  const onCreate = async () => {
    if (!canCreate) return;
    setCreating(true);
    try {
      const { pageSchemaUid } = await createQuickPage(app, {
        dataSourceKey: 'main',
        collectionName,
        title: title.trim(),
        icon,
        parentId: parentId ?? null,
        fields,
      });
      message.success(t('Page "{{title}}" created', { title: title.trim() }));
      onCreated?.(pageSchemaUid);
      // Hard-navigate so the freshly-added route loads cleanly.
      const url = `${clientPrefix()}/admin/${pageSchemaUid}`;
      setTimeout(() => {
        try { window.location.assign(url); } catch (e) { /* noop */ }
      }, 300);
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.error('[quick-view] create failed', e);
      message.error(t('Create failed: {{msg}}', { msg: e?.message || String(e) }));
    } finally {
      setCreating(false);
    }
  };

  const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 500, marginBottom: 6, display: 'block' };
  const rowStyle: React.CSSProperties = { marginBottom: 16 };

  const body = (
    <Space direction="vertical" size={0} style={{ width: '100%' }}>
      <div style={rowStyle}>
        <label style={labelStyle}>{t('Collection')}</label>
        <Select
          showSearch
          value={collectionName || undefined}
          placeholder={t('Choose a collection')}
          optionFilterProp="label"
          options={collections.map((c) => ({ value: c.name, label: `${c.title} (${c.name})` }))}
          onChange={(v) => { setCollectionName(v); setFields([]); }}
          style={{ width: '100%' }}
        />
      </div>

      <div style={rowStyle}>
        <label style={labelStyle}>{t('Columns')}</label>
        <ColumnSelect
          key={collectionName /* reset internal loaded options when collection changes */}
          api={api}
          collectionName={collectionName || undefined}
          mode="multiple"
          value={fields}
          onChange={(v: any) => setFields(v || [])}
          placeholder={t('Pick the columns to show')}
          disabled={!collectionName}
        />
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {t('These columns become the table columns and the fields inside View / Edit / Add.')}
        </Typography.Text>
      </div>

      <div style={rowStyle}>
        <label style={labelStyle}>{t('Page title')}</label>
        <Input
          value={title}
          placeholder={t('Page title')}
          onChange={(e) => { setTitle(e.target.value); setTitleTouched(true); }}
        />
      </div>

      <div style={{ ...rowStyle, display: 'flex', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>{t('Icon')}</label>
          <Select
            value={icon}
            options={ICON_OPTIONS.map((i) => ({ value: i, label: i }))}
            onChange={setIcon}
            style={{ width: '100%' }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>{t('Place under menu group')}</label>
          <Select
            allowClear
            value={parentId}
            placeholder={t('Top level')}
            options={groups.map((g) => ({ value: g.id, label: g.title }))}
            onChange={(v) => setParentId(v)}
            style={{ width: '100%' }}
          />
        </div>
      </div>

      <Button type="primary" onClick={onCreate} loading={creating} disabled={!canCreate} block>
        {t('Create page')}
      </Button>
    </Space>
  );

  if (compact) return <div style={{ padding: 4 }}>{body}</div>;

  return (
    <div style={{ maxWidth: 640, padding: 4 }}>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message={t('Quick create a table page')}
        description={t('Pick a collection and the columns you want. One click builds a menu page with a table and View / Edit / Add buttons.')}
      />
      {body}
    </div>
  );
};

export default QuickCreateForm;
