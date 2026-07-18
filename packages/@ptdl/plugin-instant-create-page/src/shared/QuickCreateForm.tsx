/**
 * Instant Create Page — the config UI. Pick a collection, then build an ordered list of columns; each column
 * has a ⚙ to choose its display **component** (default + field-enhancements widgets) and a **title**
 * (both synced into the View/Edit/Add popups). Optionally switch the block to Enhanced Table. One
 * button generates the `/v/` page. Lane-agnostic: `app`/`t` injected, so no @nocobase/client* imports.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Input, Popover, Select, Space, Spin, Typography, message, theme } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined, CloseOutlined, SettingOutlined } from '@ant-design/icons';
import * as AntdIcons from '@ant-design/icons';
import { createQuickPage, clientPrefix, componentOptionsFor, type QuickColumn } from './quickView';

// Render an antd icon by its name (e.g. 'TableOutlined'). @ant-design/icons is external (app-provided),
// so `import * as` costs nothing in the bundle. Returns null for unknown names.
function renderIcon(name?: string): React.ReactNode {
  const C = name ? (AntdIcons as any)[name] : null;
  return C ? React.createElement(C) : null;
}

// Fetch a collection's fields (collections:get + appends fields). Inlined (was @ptdl/shared's getFields)
// so this plugin imports NOTHING from @ptdl/shared — that import pulls shared's whole index, incl.
// settingsKit's top-level `@formily/react` import, which rspack then must resolve/bundle (a deep,
// fragile transitive chain). We render only plain antd here, so there's nothing else from shared to reuse.
const _fieldsCache = new Map<string, any[]>();
async function getFields(api: any, collection?: string): Promise<any[]> {
  if (!api?.request || !collection) return [];
  const ck = `main:${collection}`;
  if (_fieldsCache.has(ck)) return _fieldsCache.get(ck) as any[];
  try {
    const res = await api.request({ url: 'collections:get', params: { filterByTk: collection, appends: ['fields'] } });
    const fields = res?.data?.data?.fields || [];
    _fieldsCache.set(ck, fields);
    return fields;
  } catch (e) {
    return [];
  }
}

export interface QuickCreateFormProps {
  app: any;
  t: (s: string, opts?: Record<string, any>) => string;
  onCreated?: (pageSchemaUid: string) => void;
  compact?: boolean;
}

type Coll = { name: string; title: string };
type Group = { id: number; title: string };

// A curated set of common antd outlined icons (searchable, rendered visually). Not the full antd set,
// but broad enough for menu pages; users can still change the icon on the generated page afterward.
const ICON_OPTIONS = [
  'TableOutlined', 'UnorderedListOutlined', 'OrderedListOutlined', 'AppstoreOutlined', 'DatabaseOutlined',
  'FileTextOutlined', 'FileOutlined', 'FolderOutlined', 'FolderOpenOutlined', 'ProfileOutlined',
  'ContainerOutlined', 'BarsOutlined', 'ProjectOutlined', 'SnippetsOutlined', 'BookOutlined',
  'DashboardOutlined', 'BarChartOutlined', 'LineChartOutlined', 'PieChartOutlined', 'FundOutlined',
  'ShoppingCartOutlined', 'ShoppingOutlined', 'ShopOutlined', 'DollarOutlined', 'CreditCardOutlined',
  'UserOutlined', 'TeamOutlined', 'IdcardOutlined', 'ContactsOutlined', 'SolutionOutlined',
  'CalendarOutlined', 'ClockCircleOutlined', 'CarryOutOutlined', 'ScheduleOutlined', 'FlagOutlined',
  'CarOutlined', 'InboxOutlined', 'GiftOutlined', 'TagOutlined', 'TagsOutlined',
  'HomeOutlined', 'BankOutlined', 'SettingOutlined', 'ToolOutlined', 'ApiOutlined',
  'MailOutlined', 'PhoneOutlined', 'EnvironmentOutlined', 'GlobalOutlined', 'ClusterOutlined',
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

// Column options for the picker. Unlike @ptdl/shared's buildColumnOptions (which maps a belongsTo to its
// FK — right for filtering), a table COLUMN wants the RELATION itself (fieldPath = the relation name),
// so it renders the related record's title, not the id. So we offer relations by name and hide the raw
// FK columns they back (client_id, createdById, …).
const REL_TYPES = new Set(['belongsTo', 'hasOne', 'hasMany', 'belongsToMany', 'belongsToArray']);
const HIDDEN_IFACE = new Set(['password']);
type ColOpt = { value: string; label: string; type?: string; iface?: string };
function buildQuickColumnOptions(fields: any[]): ColOpt[] {
  const fkNames = new Set(
    (fields || []).filter((f) => f && f.type === 'belongsTo' && f.foreignKey).map((f) => f.foreignKey),
  );
  const out: ColOpt[] = [];
  const seen = new Set<string>();
  for (const f of fields || []) {
    if (!f || !f.name || seen.has(f.name)) continue;
    if (fkNames.has(f.name)) continue;
    if (f.interface && HIDDEN_IFACE.has(f.interface)) continue;
    if (!f.interface && !REL_TYPES.has(f.type)) continue;
    out.push({ value: f.name, label: humanize(f?.uiSchema?.title || f?.title, f.name), type: f.type, iface: f.interface });
    seen.add(f.name);
  }
  const extraType: Record<string, string> = { id: 'bigInt', createdAt: 'date', updatedAt: 'date' };
  for (const extra of ['id', 'createdAt', 'updatedAt']) if (!seen.has(extra)) out.push({ value: extra, label: extra, type: extraType[extra] });
  return out;
}

export const QuickCreateForm: React.FC<QuickCreateFormProps> = ({ app, t, onCreated, compact }) => {
  const { token } = theme.useToken();
  const api = app?.apiClient;
  const engine = app?.flowEngine;
  const [collections, setCollections] = useState<Coll[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [collectionName, setCollectionName] = useState<string>('');
  const [columns, setColumns] = useState<QuickColumn[]>([]);
  const [blockUse, setBlockUse] = useState<string>('TableBlockModel');
  const [title, setTitle] = useState<string>('');
  const [titleTouched, setTitleTouched] = useState(false);
  const [icon, setIcon] = useState<string>('TableOutlined');
  const [parentId, setParentId] = useState<number | undefined>(undefined);
  const [creating, setCreating] = useState(false);
  const [collectionsLoading, setCollectionsLoading] = useState(true);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [columnOptions, setColumnOptions] = useState<ColOpt[]>([]);
  const [columnsLoading, setColumnsLoading] = useState(false);

  const enhancedAvailable = useMemo(() => {
    try { return !!engine?.getModelClass?.('EnhancedTableBlockModel'); } catch (e) { return false; }
  }, [engine]);

  // All antd *Outlined icons (searchable) — computed from the external module at render so it's the app's
  // real @ant-design/icons; falls back to the curated set if unavailable.
  const iconOptions = useMemo(() => {
    try {
      const keys = Object.keys(AntdIcons).filter((k) => /^[A-Z].*Outlined$/.test(k) && !!(AntdIcons as any)[k]?.render);
      if (keys.length > 20) return keys.sort();
    } catch (e) { /* fall back */ }
    return ICON_OPTIONS;
  }, []);

  // The live collection object — needed to enumerate each field's available components (getBindingsByField).
  const collection = useMemo(() => {
    if (!collectionName) return null;
    try {
      return (
        app?.dataSourceManager?.getDataSource?.('main')?.getCollection?.(collectionName) ||
        app?.dataSourceManager?.getCollection?.('main', collectionName) ||
        null
      );
    } catch (e) {
      return null;
    }
  }, [app, collectionName]);

  useEffect(() => {
    let alive = true;
    setCollectionsLoading(true);
    fetchCollections(api).then((c) => { if (alive) { setCollections(c); setCollectionsLoading(false); } });
    setGroupsLoading(true);
    fetchGroups(api).then((g) => { if (alive) { setGroups(g); setGroupsLoading(false); } });
    return () => { alive = false; };
  }, [api]);

  useEffect(() => {
    if (!collectionName) { setColumnOptions([]); return; }
    let alive = true;
    setColumnsLoading(true);
    getFields(api, collectionName)
      .then((fs) => { if (alive) { setColumnOptions(buildQuickColumnOptions(fs)); setColumnsLoading(false); } })
      .catch(() => { if (alive) { setColumnOptions([]); setColumnsLoading(false); } });
    return () => { alive = false; };
  }, [api, collectionName]);

  const collTitle = useMemo(() => collections.find((c) => c.name === collectionName)?.title || '', [collections, collectionName]);
  useEffect(() => { if (!titleTouched) setTitle(collTitle); }, [collTitle, titleTouched]);

  const colLabelOf = (name: string) => columnOptions.find((o) => o.value === name)?.label || name;

  const removeCol = (idx: number) => setColumns((cs) => cs.filter((_, i) => i !== idx));
  const updateCol = (idx: number, patch: Partial<QuickColumn>) => setColumns((cs) => cs.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  const moveCol = (idx: number, dir: -1 | 1) => setColumns((cs) => {
    const j = idx + dir;
    if (j < 0 || j >= cs.length) return cs;
    const next = cs.slice();
    [next[idx], next[j]] = [next[j], next[idx]];
    return next;
  });
  // Multi-select membership → ordered columns: keep existing (order + per-column config) that are still
  // ticked, append newly-ticked ones. Lets the user add many columns without the dropdown closing.
  const reconcileColumns = (names: string[]) => setColumns((cs) => {
    const kept = cs.filter((c) => names.includes(c.name));
    const added = names.filter((n) => !cs.some((c) => c.name === n)).map((n) => ({ name: n } as QuickColumn));
    return [...kept, ...added];
  });

  const canCreate = !!collectionName && columns.length > 0 && !!title.trim() && !creating;

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
        columns,
        blockUse,
      });
      message.success(t('Page "{{title}}" created', { title: title.trim() }));
      onCreated?.(pageSchemaUid);
      const url = `${clientPrefix()}/admin/${pageSchemaUid}`;
      setTimeout(() => { try { window.location.assign(url); } catch (e) { /* noop */ } }, 300);
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.error('[instant-create-page] create failed', e);
      message.error(t('Create failed: {{msg}}', { msg: e?.message || String(e) }));
    } finally {
      setCreating(false);
    }
  };

  const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 500, marginBottom: 6, display: 'block' };
  const miniLabel: React.CSSProperties = { fontSize: 12, fontWeight: 500, marginBottom: 4, display: 'block' };
  const rowStyle: React.CSSProperties = { marginBottom: 16 };

  // Per-column config popover (component + title).
  const ColConfig: React.FC<{ col: QuickColumn; idx: number }> = ({ col, idx }) => {
    const opts = collection ? componentOptionsFor(engine, collection, col.name) : [];
    const defOpt = opts.find((o) => o.isDefault);
    return (
      <div style={{ width: 240 }}>
        <div style={{ marginBottom: 10 }}>
          <label style={miniLabel}>{t('Component')}</label>
          <Select
            size="small"
            style={{ width: '100%' }}
            allowClear
            value={col.component}
            placeholder={defOpt ? `${defOpt.label} (${t('default')})` : t('Default')}
            options={opts.map((o) => ({ value: o.value, label: o.isDefault ? `${o.label} · ${t('default')}` : o.label }))}
            onChange={(v) => updateCol(idx, { component: v })}
            notFoundContent={<span style={{ color: token.colorTextTertiary }}>{t('Default')}</span>}
          />
        </div>
        <div>
          <label style={miniLabel}>{t('Column title')}</label>
          <Input
            size="small"
            value={col.title ?? ''}
            placeholder={colLabelOf(col.name)}
            onChange={(e) => updateCol(idx, { title: e.target.value })}
          />
        </div>
      </div>
    );
  };

  const body = (
    <Space direction="vertical" size={0} style={{ width: '100%' }}>
      {/* 1) Collection (first — it loads the column options) */}
      <div style={rowStyle}>
        <label style={labelStyle}>{t('Collection')}</label>
        <Select
          showSearch
          loading={collectionsLoading}
          value={collectionName || undefined}
          placeholder={t('Choose a collection')}
          optionFilterProp="label"
          options={collections.map((c) => ({ value: c.name, label: `${c.title} (${c.name})` }))}
          onChange={(v) => { setCollectionName(v); setColumns([]); }}
          style={{ width: '100%' }}
        />
      </div>

      {/* 2a) Page title | Table type */}
      <div style={{ ...rowStyle, display: 'flex', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>{t('Page title')}</label>
          <Input value={title} placeholder={t('Page title')} onChange={(e) => { setTitle(e.target.value); setTitleTouched(true); }} />
        </div>
        {enhancedAvailable && (
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>{t('Table type')}</label>
            <Select
              value={blockUse}
              onChange={setBlockUse}
              options={[
                { value: 'TableBlockModel', label: t('Basic table') },
                { value: 'EnhancedTableBlockModel', label: t('Enhanced table') },
              ]}
              style={{ width: '100%' }}
            />
          </div>
        )}
      </div>

      {/* 2b) Icon | Place under menu group */}
      <div style={{ ...rowStyle, display: 'flex', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>{t('Icon')}</label>
          <Select
            showSearch
            value={icon}
            onChange={setIcon}
            placeholder={t('Type to search icons…')}
            filterOption={(input, option) => String(option?.value ?? '').toLowerCase().includes(input.toLowerCase())}
            options={iconOptions.map((i) => ({ value: i }))}
            optionRender={(opt) => (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 16, display: 'inline-flex' }}>{renderIcon(opt.value as string)}</span>
                <span style={{ fontSize: 12, color: token.colorTextTertiary }}>{opt.value}</span>
              </span>
            )}
            labelRender={(props) => (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                {renderIcon(props.value as string)}<span>{props.value}</span>
              </span>
            )}
            style={{ width: '100%' }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>{t('Place under menu group')}</label>
          <Select
            allowClear
            loading={groupsLoading}
            value={parentId}
            placeholder={t('Top level')}
            options={groups.map((g) => ({ value: g.id, label: g.title }))}
            onChange={(v) => setParentId(v)}
            notFoundContent={
              groupsLoading
                ? <span style={{ color: token.colorTextTertiary }}><Spin size="small" /> {t('Loading…')}</span>
                : <span style={{ color: token.colorTextTertiary }}>{t('No menu groups yet — leave blank for top level')}</span>
            }
            style={{ width: '100%' }}
          />
        </div>
      </div>

      {/* 3) Columns — LAST (the biggest, most interactive part). Multi-select stays open so you can tick
             several at once; the list below is for order + per-column ⚙ config. */}
      <div style={rowStyle}>
        <label style={labelStyle}>{t('Columns')}</label>
        <Select
          mode="multiple"
          showSearch
          loading={columnsLoading}
          disabled={!collectionName}
          placeholder={t('Pick columns to show')}
          optionFilterProp="label"
          value={columns.map((c) => c.name)}
          options={columnOptions.map((o) => ({ value: o.value, label: `${o.label} (${o.value})` }))}
          onChange={(names) => reconcileColumns(names as string[])}
          notFoundContent={
            columnsLoading
              ? <span style={{ color: token.colorTextTertiary }}><Spin size="small" /> {t('Loading…')}</span>
              : <span style={{ color: token.colorTextTertiary }}>{collectionName ? t('No columns') : t('Choose a collection first')}</span>
          }
          style={{ width: '100%' }}
        />

        {columns.length > 0 && (
          <div style={{ marginTop: 8 }}>
            {columns.map((col, idx) => (
              <div
                key={col.name}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', border: `1px solid ${token.colorBorderSecondary}`, borderRadius: 6, marginBottom: 6, background: token.colorBgContainer }}
              >
                <Space.Compact size="small">
                  <Button type="text" size="small" icon={<ArrowUpOutlined />} disabled={idx === 0} onClick={() => moveCol(idx, -1)} />
                  <Button type="text" size="small" icon={<ArrowDownOutlined />} disabled={idx === columns.length - 1} onClick={() => moveCol(idx, 1)} />
                </Space.Compact>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{col.title?.trim() || colLabelOf(col.name)}</div>
                  <div style={{ fontSize: 11, color: token.colorTextTertiary, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {col.name}{col.component ? ` · ${col.component}` : ''}
                  </div>
                </div>
                <Popover trigger="click" placement="bottomRight" title={t('Column settings')} content={<ColConfig col={col} idx={idx} />}>
                  <Button type="text" size="small" icon={<SettingOutlined />} title={t('Column settings')} />
                </Popover>
                <Button type="text" size="small" danger icon={<CloseOutlined />} onClick={() => removeCol(idx)} />
              </div>
            ))}
          </div>
        )}
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {t('Use ⚙ to set each column\'s component + title (applied to View / Edit / Add too); arrows reorder.')}
        </Typography.Text>
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
