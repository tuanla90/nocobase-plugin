import { SearchOutlined } from '@ant-design/icons';
import { Alert, Button, Input, InputNumber, Select, Slider, Space, Switch, Tabs, Typography, message } from 'antd';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ColorField, FieldPickerCascader, getCaretElement, insertAtCaret, SettingRow, ControlGrid, SaveBar, PreviewPane, SegmentedGroup, ColumnSelect } from '@ptdl/shared';
import {
  DEFAULT_APPEARANCE,
  getAppearance,
  getManualTargets,
  getViewLinks,
  loadConfig,
  pagePath,
  saveAppearance,
  saveTargets,
  saveViewLinks,
  SHORTCUT_LABEL,
  templatizeViewUrl,
  fetchPages,
  fetchCollectionsWithFields,
  type Align,
  type Appearance,
  type CollectionFull,
  type PageInfo,
  type SearchTarget,
  type ViewLinks,
} from './config';

const SHORTCUT = SHORTCUT_LABEL;

const card: React.CSSProperties = {
  border: '1px solid #f0f0f0',
  borderRadius: 8,
  padding: '14px 16px',
  background: '#fff',
  boxShadow: '0 1px 4px rgba(0,0,0,0.06), 0 2px 10px rgba(0,0,0,0.04)',
};

// ---- "Open in view" rows -------------------------------------------------
type Mode = 'raw' | 'detail' | 'page';
type LinkRow = { collection: string; mode: Mode; url: string; page: string };

function toLinkRow(collection: string, stored: string): LinkRow {
  if (stored.startsWith('page:')) return { collection, mode: 'page', url: '', page: stored.slice(5) };
  if (/\/view\//.test(stored)) return { collection, mode: 'detail', url: stored, page: '' };
  const m = stored.match(/^\/admin\/([^/?#]+)\/?$/);
  if (m) return { collection, mode: 'page', url: '', page: m[1] };
  return { collection, mode: 'detail', url: stored, page: '' };
}
const emptyLinkRow = (): LinkRow => ({ collection: '', mode: 'detail', url: '', page: '' });

// ---- "What to search" rows -----------------------------------------------
type ScopeRow = {
  collection: string;
  fields: string[];
  titleMode: 'fields' | 'template';
  titleFields: string[];
  titleTemplate: string;
  limit: number;
};
const toScopeRow = (t: SearchTarget): ScopeRow => ({
  collection: t.collection,
  fields: t.fields || [],
  titleMode: t.titleTemplate ? 'template' : 'fields',
  titleFields: Array.isArray(t.titleField) ? t.titleField : t.titleField ? [t.titleField] : [],
  titleTemplate: t.titleTemplate || '',
  limit: t.limit || 5,
});
// Single-line template input + "＋ Chèn cột" picker — its own ref (can't useRef inside
// the .map() that renders one of these per scope row). The picker is the shared LAZY nested
// cascader: to-one relations drill arbitrarily deep (order → customer → manager) and insert a
// dot-path token like `{{customer.name}}` (runSearch appends the relation so the value is populated).
const TitleTemplateInput: React.FC<{
  value: string;
  onChange: (v: string) => void;
  api: any;
  collectionName: string;
  t: (s: string) => string;
}> = ({ value, onChange, api, collectionName, t }) => {
  const ref = useRef<any>(null);
  const insert = (path: string[]) => {
    insertAtCaret(getCaretElement(ref.current), `{{${path.join('.')}}}`, value || '', onChange);
  };
  return (
    <div style={{ flex: 1 }}>
      <div style={{ marginBottom: 4 }}>
        <FieldPickerCascader api={api} collectionName={collectionName} onPick={insert} />
      </div>
      <Input
        ref={ref}
        placeholder="e.g. {{id}} - {{name}} - {{customer.name}}"
        style={{ fontFamily: 'monospace', fontSize: 13 }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
        {t('Drill into relations with the picker →')} <code>{'{{customer.name}}'}</code>. {t('Format')}:{' '}
        <code>{'{{createdAt | date}}'}</code>, <code>{'{{price | number:2}}'}</code> {t('— also')}{' '}
        <code>datetime</code>, <code>time</code>, <code>{'date:YYYY-MM-DD'}</code>, <code>round:N</code>,{' '}
        <code>upper</code>, <code>lower</code>.
      </Typography.Text>
    </div>
  );
};

const emptyScopeRow = (): ScopeRow => ({
  collection: '',
  fields: [],
  titleMode: 'fields',
  titleFields: [],
  titleTemplate: '',
  limit: 5,
});

// Build the form rows from a (shared) config value; used both for initial state and after the
// server config loads.
const linkRowsFrom = (vl: ViewLinks): LinkRow[] => {
  const e = Object.entries(vl).map(([c, v]) => toLinkRow(c, v));
  return e.length ? e : [emptyLinkRow()];
};
const scopeRowsFrom = (mt: SearchTarget[]): ScopeRow[] => (mt.length ? mt.map(toScopeRow) : [emptyScopeRow()]);

export type GlobalSearchSettingsDeps = {
  useApiClient: () => any;
  /** Translate an English UI string against the plugin's i18n namespace, with optional i18next
   *  interpolation values. Injected per-lane (`(s, opts) => app.i18n.t(s, { ns, ...opts })`);
   *  defaults to a self-interpolating identity (English) when omitted. */
  t?: (s: string, opts?: Record<string, any>) => string;
};

// Identity fallback used when no lane injects a translator: returns the English key, still filling
// any `{{token}}` interpolation values so a fallback never leaks a raw placeholder.
const identityT = (s: string, opts?: Record<string, any>): string =>
  opts ? String(s).replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => String(opts[k] ?? '')) : s;

export function createGlobalSearchSettings({ useApiClient, t = identityT }: GlobalSearchSettingsDeps): React.FC {
  const GlobalSearchSettings: React.FC = () => {
    const apiClient = useApiClient();
    const [cols, setCols] = useState<CollectionFull[]>([]);
    const [pages, setPages] = useState<PageInfo[]>([]);

    // Initial state uses the local fallback (getters read the cache, or localStorage before it
    // loads); the effect below rehydrates from the shared server config once it arrives.
    const [linkRows, setLinkRows] = useState<LinkRow[]>(() => linkRowsFrom(getViewLinks()));
    const [scopeMode, setScopeMode] = useState<'auto' | 'custom'>(getManualTargets().length ? 'custom' : 'auto');
    const [scopeRows, setScopeRows] = useState<ScopeRow[]>(() => scopeRowsFrom(getManualTargets()));
    const [appearance, setAppearance] = useState<Appearance>(getAppearance);
    const setAppear = (patch: Partial<Appearance>) => setAppearance((a) => ({ ...a, ...patch }));

    useEffect(() => {
      let alive = true;
      Promise.all([fetchPages(apiClient), fetchCollectionsWithFields(apiClient)]).then(([p, c]) => {
        if (!alive) return;
        setPages(p);
        setCols(c);
      });
      return () => {
        alive = false;
      };
    }, [apiClient]);

    // Pull the shared config from the server, then hydrate the form (server value wins over the
    // local fallback the initial state used).
    useEffect(() => {
      let alive = true;
      loadConfig(apiClient).then(() => {
        if (!alive) return;
        setLinkRows(linkRowsFrom(getViewLinks()));
        const mt = getManualTargets();
        setScopeMode(mt.length ? 'custom' : 'auto');
        setScopeRows(scopeRowsFrom(mt));
        setAppearance(getAppearance());
      });
      return () => {
        alive = false;
      };
    }, [apiClient]);

    const colByName = useMemo(() => {
      const m: Record<string, CollectionFull> = {};
      cols.forEach((c) => (m[c.name] = c));
      return m;
    }, [cols]);
    const collectionOptions = useMemo(
      () => cols.map((c) => ({ label: c.title === c.name ? c.name : `${c.title} (${c.name})`, value: c.name })),
      [cols],
    );
    const pageOptions = useMemo(() => pages.map((p) => ({ label: p.title, value: p.schemaUid })), [pages]);
    const optsFrom = (list?: { name: string; title: string }[]) =>
      (list || []).map((f) => ({ label: f.title === f.name ? f.name : `${f.title} (${f.name})`, value: f.name }));
    // "Search in" = text fields; "Show as" = every scalar field incl. id.
    const fieldOptions = (collection: string) => optsFrom(colByName[collection]?.fields);
    const titleFieldOptions = (collection: string) => optsFrom(colByName[collection]?.allFields);
    const filterOpt = (input: string, opt?: { label?: React.ReactNode }) =>
      String(opt?.label ?? '').toLowerCase().includes(input.toLowerCase());

    // ----- link rows helpers -----
    const setLinkRow = (i: number, patch: Partial<LinkRow>) =>
      setLinkRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
    const saveLinks = async () => {
      const map: ViewLinks = {};
      for (const r of linkRows) {
        const col = r.collection?.trim();
        if (!col) continue;
        if (r.mode === 'detail') {
          const val = templatizeViewUrl(r.url);
          if (val) map[col] = val;
        } else if (r.mode === 'page' && r.page) {
          map[col] = pagePath(r.page);
        }
      }
      const ok = await saveViewLinks(apiClient, map);
      message[ok ? 'success' : 'warning'](
        ok
          ? t('Saved for everyone. Click a search result to open it this way.')
          : t('Saved on this device only — server config not reachable.'),
      );
    };

    // ----- scope rows helpers -----
    const setScopeRow = (i: number, patch: Partial<ScopeRow>) =>
      setScopeRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
    const pickScopeCollection = (i: number, name: string) => {
      const all = (colByName[name]?.fields || []).map((f) => f.name);
      setScopeRow(i, { collection: name, fields: all, titleFields: [] });
    };
    const saveScope = async () => {
      if (scopeMode === 'auto') {
        const ok = await saveTargets(apiClient, []); // clears the discovery cache internally
        message[ok ? 'success' : 'warning'](
          ok
            ? t('Saved for everyone — searching all collections. Reopen search (Ctrl / ⌘ + K).')
            : t('Saved on this device only — server config not reachable.'),
        );
        return;
      }
      const targets: SearchTarget[] = [];
      for (const r of scopeRows) {
        const col = r.collection?.trim();
        if (!col || !r.fields.length) continue;
        const useTpl = r.titleMode === 'template' && !!r.titleTemplate.trim();
        targets.push({
          collection: col,
          label: colByName[col]?.title || col,
          fields: r.fields,
          titleField: useTpl
            ? undefined
            : r.titleFields.length
              ? r.titleFields.length === 1
                ? r.titleFields[0]
                : r.titleFields
              : undefined,
          titleTemplate: useTpl ? r.titleTemplate.trim() : undefined,
          limit: r.limit || 5,
        });
      }
      if (!targets.length) {
        message.warning(t('Add at least one collection with fields, or switch to “All collections”.'));
        return;
      }
      const ok = await saveTargets(apiClient, targets);
      message[ok ? 'success' : 'warning'](
        ok
          ? t('Search scope saved for everyone. Reopen search (Ctrl / ⌘ + K) to use it.')
          : t('Saved on this device only — server config not reachable.'),
      );
    };

    const collectionSelect = (value: string, onChange: (v: string) => void, width = 340) =>
      cols.length ? (
        <Select
          showSearch
          allowClear
          placeholder={t('Choose a collection')}
          style={{ flex: 1, maxWidth: width }}
          options={collectionOptions}
          value={value || undefined}
          onChange={(v) => onChange(v || '')}
          filterOption={filterOpt}
        />
      ) : (
        <Input
          placeholder={t('collection name')}
          style={{ flex: 1, maxWidth: width }}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    return (
      <div
        style={{
          padding: 20,
          maxWidth: 1200,
          margin: '8px auto 16px',
          background: 'var(--colorBgContainer, #fff)',
          border: '0.8px solid var(--colorBorderSecondary, #f0f0f0)',
          borderRadius: 8,
        }}
      >
        <Typography.Title level={4} style={{ marginBottom: 4 }}>
          {t('Global Search')}
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 20 }}>
          {t('Header search box')} + <code>Ctrl / ⌘ + K</code> {t('palette.')}
        </Typography.Paragraph>

        <Tabs
          items={[
            {
              key: 'scope',
              label: t('What to search'),
              children: (
                <div style={{ paddingTop: 8 }}>
                  <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
                    {t('Choose which collections and fields the search looks through.')}
                  </Typography.Paragraph>

        {cols.length === 0 && (
          <Alert type="info" showIcon style={{ marginBottom: 12 }} message={t('Loading collections…')} />
        )}

        <SegmentedGroup
          value={scopeMode}
          onChange={(v) => setScopeMode(v as 'auto' | 'custom')}
          options={[
            { label: t('All collections (automatic)'), value: 'auto' },
            { label: t('Choose collections'), value: 'custom' },
          ]}
          style={{ marginBottom: 14 }}
        />

        {scopeMode === 'auto' ? (
          <Typography.Paragraph type="secondary">
            {t('Searches the text fields of every non-hidden collection. Nothing else to set.')}
          </Typography.Paragraph>
        ) : (
          <>
            <Space direction="vertical" size={14} style={{ display: 'flex' }}>
              {scopeRows.map((r, i) => (
                <div key={i} style={card}>
                  <SettingRow label={t('Collection')} labelWidth={84} style={{ gap: 10, marginBottom: 10 }}>
                    {cols.length ? (
                      <Select
                        showSearch
                        allowClear
                        placeholder={t('Choose a collection')}
                        style={{ flex: 1, maxWidth: 340 }}
                        options={collectionOptions}
                        value={r.collection || undefined}
                        onChange={(v) => pickScopeCollection(i, v || '')}
                        filterOption={filterOpt}
                      />
                    ) : (
                      <Input
                        placeholder={t('collection name')}
                        style={{ flex: 1, maxWidth: 340 }}
                        value={r.collection}
                        onChange={(e) => setScopeRow(i, { collection: e.target.value })}
                      />
                    )}
                    <Button
                      danger
                      type="text"
                      size="small"
                      style={{ marginLeft: 'auto' }}
                      onClick={() => setScopeRows((rs) => (rs.length > 1 ? rs.filter((_, idx) => idx !== i) : [emptyScopeRow()]))}
                    >
                      {t('Remove')}
                    </Button>
                  </SettingRow>
                  <SettingRow label={t('Search in')} labelWidth={84} align="start" style={{ gap: 10, marginBottom: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ marginBottom: 4 }}>
                        <FieldPickerCascader
                          api={apiClient}
                          collectionName={r.collection}
                          label={t('＋ Nested field')}
                          onPick={(path) => {
                            const f = path.join('.');
                            setScopeRow(i, { fields: r.fields.includes(f) ? r.fields : [...r.fields, f] });
                          }}
                        />
                      </div>
                      <Select
                        mode="tags"
                        allowClear
                        placeholder={t('Fields to match (defaults to all text fields). Use ＋ to add a related field.')}
                        style={{ width: '100%' }}
                        options={fieldOptions(r.collection)}
                        value={r.fields}
                        onChange={(v) => setScopeRow(i, { fields: v })}
                        filterOption={filterOpt}
                      />
                    </div>
                  </SettingRow>
                  <SettingRow label={t('Show as')} labelWidth={84} style={{ gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                    <SegmentedGroup
                      value={r.titleMode}
                      onChange={(v) => setScopeRow(i, { titleMode: v as 'fields' | 'template' })}
                      options={[
                        { label: t('Fields'), value: 'fields' },
                        { label: t('Template'), value: 'template' },
                      ]}
                    />
                    <span style={{ width: 'auto', marginLeft: 'auto', color: 'rgba(0,0,0,0.45)', fontSize: 12, flex: 'none' }}>{t('Max results')}</span>
                    <InputNumber
                      min={1}
                      max={50}
                      value={r.limit}
                      onChange={(v) => setScopeRow(i, { limit: Number(v) || 5 })}
                      style={{ width: 90 }}
                    />
                  </SettingRow>
                  <SettingRow label={null} labelWidth={84} align="start" style={{ gap: 10, marginBottom: 0 }}>
                    {r.titleMode === 'template' ? (
                      <TitleTemplateInput
                        value={r.titleTemplate}
                        onChange={(v) => setScopeRow(i, { titleTemplate: v })}
                        api={apiClient}
                        collectionName={r.collection}
                        t={t}
                      />
                    ) : (
                      <ColumnSelect
                        mode="multiple"
                        placeholder={t('Title field(s) — e.g. ID, name')}
                        style={{ flex: 1, maxWidth: 460 }}
                        options={titleFieldOptions(r.collection)}
                        value={r.titleFields}
                        onChange={(v) => setScopeRow(i, { titleFields: v })}
                      />
                    )}
                  </SettingRow>
                </div>
              ))}
            </Space>
            <Space style={{ marginTop: 14 }} wrap>
              <Button onClick={() => setScopeRows((rs) => [...rs, emptyScopeRow()])}>{t('+ Add collection')}</Button>
            </Space>
          </>
        )}

                  <div style={{ marginTop: 14 }}>
                    <Button type="primary" onClick={saveScope}>
                      {t('Save')}
                    </Button>
                  </div>
                </div>
              ),
            },
            {
              key: 'open',
              label: t('When I click a result'),
              children: (
                <div style={{ paddingTop: 8 }}>
                  <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
                    {t("Pick how each collection's results open. Collections you don't list use the")}{' '}
                    <b>{t('Preview drawer')}</b> {t('by default.')}
                  </Typography.Paragraph>

        <Space direction="vertical" size={14} style={{ display: 'flex' }}>
          {linkRows.map((r, i) => {
            const tpl = templatizeViewUrl(r.url);
            return (
              <div key={i} style={card}>
                <SettingRow label={t('Collection')} labelWidth={84} style={{ gap: 10, marginBottom: 10 }}>
                  {collectionSelect(r.collection, (v) => setLinkRow(i, { collection: v }))}
                  <Button
                    danger
                    type="text"
                    size="small"
                    style={{ marginLeft: 'auto' }}
                    onClick={() =>
                      setLinkRows((rs) => (rs.length > 1 ? rs.filter((_, idx) => idx !== i) : [emptyLinkRow()]))
                    }
                  >
                    {t('Remove')}
                  </Button>
                </SettingRow>
                <SettingRow label={t('Open as')} labelWidth={84} style={{ gap: 10, marginBottom: r.mode === 'raw' ? 0 : 10 }}>
                  <SegmentedGroup
                    value={r.mode}
                    onChange={(v) => setLinkRow(i, { mode: v as Mode })}
                    options={[
                      { label: t('Preview drawer'), value: 'raw' },
                      { label: t('Detail view'), value: 'detail' },
                      { label: t('Open page'), value: 'page' },
                    ]}
                  />
                </SettingRow>
                {r.mode === 'detail' && (
                  <SettingRow label="URL" labelWidth={84} align="start" style={{ gap: 10, marginBottom: 0 }}>
                    <div style={{ flex: 1 }}>
                      <Input
                        placeholder={t("Paste a record's detail-view URL, e.g. /admin/PAGE/view/BLOCK/filterbytk/123")}
                        style={{ fontFamily: 'monospace', fontSize: 12 }}
                        value={r.url}
                        onChange={(e) => setLinkRow(i, { url: e.target.value })}
                      />
                      <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
                        {t("Open a record's detail view, copy the browser URL, paste it here — the id becomes")}{' '}
                        <code>{'{{id}}'}</code>.
                        {r.url && (
                          <>
                            {' '}
                            {t('Opens')}: <code>{tpl}</code>
                          </>
                        )}
                      </Typography.Text>
                    </div>
                  </SettingRow>
                )}
                {r.mode === 'page' && (
                  <SettingRow label={t('Page')} labelWidth={84} style={{ gap: 10, marginBottom: 0 }}>
                    {pages.length ? (
                      <Select
                        showSearch
                        allowClear
                        placeholder={t('Choose a page to open')}
                        style={{ flex: 1, maxWidth: 340 }}
                        options={pageOptions}
                        value={r.page || undefined}
                        onChange={(v) => setLinkRow(i, { page: v || '' })}
                        filterOption={filterOpt}
                      />
                    ) : (
                      <Input
                        placeholder={t('page schemaUid')}
                        style={{ flex: 1, maxWidth: 340 }}
                        value={r.page}
                        onChange={(e) => setLinkRow(i, { page: e.target.value })}
                      />
                    )}
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {t('id added as')} <code>?filterByTk=</code>
                    </Typography.Text>
                  </SettingRow>
                )}
                {r.mode === 'raw' && (
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {t("Shows a quick preview drawer with the record's fields (no navigation).")}
                  </Typography.Text>
                )}
              </div>
            );
          })}
        </Space>
                  <Space style={{ marginTop: 14 }} wrap>
                    <Button onClick={() => setLinkRows((rs) => [...rs, emptyLinkRow()])}>{t('+ Add collection')}</Button>
                    <Button type="primary" onClick={saveLinks}>
                      {t('Save')}
                    </Button>
                  </Space>
                </div>
              ),
            },
            {
              key: 'appearance',
              label: t('Appearance'),
              children: (
                <div style={{ paddingTop: 8 }}>
                  <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
                    {t('Customize the search button in the header.')}
                  </Typography.Paragraph>

                  <PreviewPane
                    style={{ marginBottom: 22 }}
                    boxStyle={{
                      background: '#1f1f1f',
                      padding: '14px 18px',
                      border: 'none',
                      display: 'flex',
                      justifyContent:
                        appearance.align === 'left' ? 'flex-start' : appearance.align === 'center' ? 'center' : 'flex-end',
                    }}
                  >
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        color: appearance.fg || 'rgba(255,255,255,0.92)',
                        background: appearance.bg || 'rgba(255,255,255,0.14)',
                        border: `1px solid ${appearance.fg || 'rgba(255,255,255,0.28)'}`,
                        // Icon-only → circle; otherwise the wide pill (mirrors pillStyle in globalSearch.tsx).
                        ...(!appearance.label && !appearance.showShortcut
                          ? { justifyContent: 'center', width: 34, height: 34, minWidth: 34, padding: 0, borderRadius: '50%', fontSize: 15 }
                          : {
                              justifyContent: 'space-between',
                              gap: 8,
                              padding: '5px 14px',
                              borderRadius: appearance.radius ?? 16,
                              fontSize: 13,
                              lineHeight: '22px',
                              minWidth: Math.max(0, appearance.width),
                            }),
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <SearchOutlined />
                        {appearance.label ? <span>{appearance.label}</span> : null}
                      </span>
                      {appearance.showShortcut ? (
                        <span style={{ opacity: 0.6, fontSize: 11, marginLeft: 12 }}>{SHORTCUT}</span>
                      ) : null}
                    </div>
                  </PreviewPane>

                  <ControlGrid>
                  <SettingRow label={t('Preset')} labelWidth={84} style={{ marginBottom: 16 }}>
                    <SegmentedGroup
                      value={
                        !appearance.label && !appearance.showShortcut
                          ? 'icon'
                          : appearance.showShortcut
                            ? 'full'
                            : 'text'
                      }
                      onChange={(v) =>
                        setAppear(
                          v === 'icon'
                            ? { label: '', showShortcut: false }
                            : v === 'text'
                              ? { label: appearance.label || 'Search', showShortcut: false }
                              : { label: appearance.label || 'Search', showShortcut: true },
                        )
                      }
                      options={[
                        { label: t('Icon only'), value: 'icon' },
                        { label: t('Icon + text'), value: 'text' },
                        { label: t('Full'), value: 'full' },
                      ]}
                    />
                  </SettingRow>

                  <SettingRow label={t('Position')} labelWidth={84} hint={t('Left & Center float over the header as an overlay — Left anchors just after the logo (best with the top menu hidden so it has room); Right (default) docks among the header actions and never overlaps.')} style={{ marginBottom: 16 }}>
                    <SegmentedGroup
                      value={appearance.align === 'left' ? 'left' : appearance.align === 'center' ? 'center' : 'right'}
                      onChange={(v) => setAppear({ align: v as Align })}
                      options={[
                        { label: t('Left'), value: 'left' },
                        { label: t('Center'), value: 'center' },
                        { label: t('Right'), value: 'right' },
                      ]}
                    />
                  </SettingRow>

                  <SettingRow label={t('Width')} labelWidth={84} style={{ marginBottom: 16 }}>
                    <Slider
                      min={90}
                      max={360}
                      value={appearance.width}
                      onChange={(v) => setAppear({ width: Number(v) })}
                      style={{ flex: 1, maxWidth: 300 }}
                      disabled={!appearance.label && !appearance.showShortcut}
                    />
                    <span style={{ width: 74, color: 'rgba(0,0,0,0.45)', fontSize: 12 }}>
                      {!appearance.label && !appearance.showShortcut ? t('circle') : `${appearance.width}px`}
                    </span>
                  </SettingRow>

                  <SettingRow label={t('Corner radius')} labelWidth={84} style={{ marginBottom: 16 }}>
                    <Slider
                      min={0}
                      max={24}
                      value={appearance.radius ?? 16}
                      onChange={(v) => setAppear({ radius: Number(v) })}
                      style={{ flex: 1, maxWidth: 300 }}
                      disabled={!appearance.label && !appearance.showShortcut}
                    />
                    <span style={{ width: 74, color: 'rgba(0,0,0,0.45)', fontSize: 12 }}>
                      {!appearance.label && !appearance.showShortcut ? t('circle') : `${appearance.radius ?? 16}px`}
                    </span>
                  </SettingRow>

                  <SettingRow label={t('Button text')} labelWidth={84} hint={t('Leave empty to show only the search icon (a circle button).')} style={{ marginBottom: 16 }}>
                    <Input
                      placeholder="Search"
                      style={{ maxWidth: 240 }}
                      value={appearance.label}
                      onChange={(e) => setAppear({ label: e.target.value })}
                      allowClear
                    />
                  </SettingRow>

                  <SettingRow label={t('Shortcut hint')} labelWidth={84} hint={t('Show the “{{shortcut}}” hint on the button.', { shortcut: SHORTCUT })} style={{ marginBottom: 16 }}>
                    <Switch checked={appearance.showShortcut} onChange={(v) => setAppear({ showShortcut: v })} />
                  </SettingRow>

                  <SettingRow label={t('Background')} labelWidth={84} hint={t('Custom background colour; leave empty to use the header theme default.')} style={{ marginBottom: 16 }}>
                    <ColorField value={appearance.bg} onChange={(v: string) => setAppear({ bg: v || '' })} emptyValue="" allowAlpha />
                  </SettingRow>

                  <SettingRow label={t('Text color')} labelWidth={84} hint={t('Colours the icon, label and shortcut — and tints the border to match.')} style={{ marginBottom: 22 }}>
                    <ColorField value={appearance.fg} onChange={(v: string) => setAppear({ fg: v || '' })} emptyValue="" />
                  </SettingRow>
                  </ControlGrid>

                  <SaveBar
                    onReset={() => setAppearance({ ...DEFAULT_APPEARANCE })}
                    onSave={async () => {
                      const ok = await saveAppearance(apiClient, appearance);
                      message[ok ? 'success' : 'warning'](
                        ok ? t('Appearance saved for everyone.') : t('Saved on this device only — server config not reachable.'),
                      );
                    }}
                  />
                </div>
              ),
            },
          ]}
        />
      </div>
    );
  };

  return GlobalSearchSettings;
}

export default createGlobalSearchSettings;
