import React, { useEffect, useMemo, useState } from 'react';
import { Table, Tag, Button, Popconfirm, Empty, Spin, Select, Modal, Input, Space, Tooltip, message, theme } from 'antd';
import { ConfigContainer, IconByKey } from '@tuanla90/shared';
import { allFieldWidgets, loadFieldWidgetCache, removeFieldWidget, upsertFieldWidget, borrowWidgetRender } from './fieldWidgetStore';
import { hasParamMap, configToParams, paramsToConfig, widgetIcon, configSummary, widgetOwnFlow } from './widgetConfigAdapters';

/**
 * Central manager for GLOBAL (field-level) widget assignments (`ptdlFieldWidget`).
 *
 * Beyond viewing/removing you can now: EDIT a row's config in place (opens the SAME per-widget settings form
 * the column ⚙ uses — via a detached synthetic model + the framework's own settings dialog — pre-filled from
 * the stored config; JSON raw-config editor fallback for widgets whose form needs a live block), CHANGE the
 * widget type (resets config to defaults), and see richer info (friendly field title, per-widget config
 * summary, an icon per widget, and a data-source column only when >1 source is present). Crash-safe throughout.
 */

// Model name → friendly widget label (matches the no-code widget catalog).
const WIDGET_LABELS: Record<string, string> = {
  ConditionalStatusFieldModel: 'Value tag',
  PtdlRelativeDateFieldModel: 'Relative date',
  PtdlNumberFieldModel: 'Number + unit',
  PtdlProgressFieldModel: 'Progress bar',
  PtdlStarFieldModel: 'Star rating',
  PtdlBooleanFieldModel: 'Boolean style',
  PtdlLongTextFieldModel: 'Clamp text',
  PtdlJsonFieldModel: 'JSON view',
  PtdlColorFieldModel: 'Colour chip',
  PtdlIconGlyphFieldModel: 'Icon glyph',
  PtdlLinkFieldModel: 'Link',
  PtdlRichSelectFieldModel: 'Rich select',
  PtdlRichSelectDisplayFieldModel: 'Rich select',
};
const widgetLabel = (m: string) => WIDGET_LABELS[m] || m;

// Assignable widget catalog (deduped) for the "change type" control.
const CATALOG: [string, string][] = [
  ['ConditionalStatusFieldModel', 'Value tag'],
  ['PtdlRelativeDateFieldModel', 'Relative date'],
  ['PtdlNumberFieldModel', 'Number + unit'],
  ['PtdlProgressFieldModel', 'Progress bar'],
  ['PtdlStarFieldModel', 'Star rating'],
  ['PtdlBooleanFieldModel', 'Boolean style'],
  ['PtdlLongTextFieldModel', 'Clamp text'],
  ['PtdlJsonFieldModel', 'JSON view'],
  ['PtdlColorFieldModel', 'Colour chip'],
  ['PtdlIconGlyphFieldModel', 'Icon glyph'],
  ['PtdlLinkFieldModel', 'Link'],
  ['PtdlRichSelectDisplayFieldModel', 'Rich select'],
];

function compileTitle(raw: any, appT?: (s: string) => string): string {
  const s = String(raw ?? '');
  if (!appT || s.indexOf('{{') < 0) return s;
  return s.replace(/\{\{\s*t\(\s*["'`](.+?)["'`]\s*\)\s*\}\}/g, (_m, k) => appT(k) || k);
}

type FieldMeta = { title: string; interface?: string; uiSchema?: any; target?: string; targetKey?: string };
type Row = { key: string; dataSource: string; collection: string; field: string; widgetModel: string; config: any };

// A representative sample value per widget so the Preview renders something meaningful (the widget's display
// needs a value). Best-effort; unknown → a plain string.
function sampleValueFor(model: string, config: any, meta?: FieldMeta): any {
  const c = config || {};
  switch (model) {
    case 'PtdlStarFieldModel': return 3.5;
    // With previewConfigFor forcing a max of 100 for non-percent, value 65 → 65%; percent field → 0.65 → 65%.
    case 'PtdlProgressFieldModel': return meta?.interface === 'percent' ? 0.65 : 65;
    case 'PtdlNumberFieldModel': return 1234.5;
    case 'ConditionalStatusFieldModel': { const e = meta?.uiSchema?.enum; const first = Array.isArray(e) && e[0]; return first ? (first.value ?? first) : 'Active'; }
    case 'PtdlRelativeDateFieldModel': return new Date(Date.now() - 3 * 86400000).toISOString();
    case 'PtdlLinkFieldModel': return c.ptdllKind === 'email' ? 'user@company.com' : c.ptdllKind === 'phone' ? '+84 912 345 678' : 'example.com/page';
    case 'PtdlBooleanFieldModel': return true;
    case 'PtdlLongTextFieldModel': return 'Lorem ipsum dolor sit amet, consectetur adipiscing elit sed do eiusmod tempor.';
    case 'PtdlColorFieldModel': return '#1677ff';
    case 'PtdlIconGlyphFieldModel': return 'lucide-star';
    case 'PtdlJsonFieldModel': return { id: 42, name: 'Acme', tags: ['a', 'b'] };
    case 'PtdlRichSelectFieldModel':
    case 'PtdlRichSelectDisplayFieldModel': { const rec: any = { id: 1 }; rec[c.ptdlrsTitle || 'name'] = 'Sample'; if (c.ptdlrsSub) rec[c.ptdlrsSub] = 'Subtitle'; return rec; }
    default: return 'Sample';
  }
}

// A config adjusted for the preview only (never persisted). Progress: force a known denominator (max 100)
// for non-percent fields so the sample maps to a stable ~65% bar — the real config may use auto-max (0),
// which would fetch the column's true max and make a fixed sample render as ~0% (empty bar).
function previewConfigFor(model: string, config: any, meta?: FieldMeta): any {
  const c = config || {};
  if (model === 'PtdlProgressFieldModel' && meta?.interface !== 'percent') return { ...c, ptdlpMax: 100 };
  return c;
}

// Catches a render-time throw inside the borrowed widget display → shows the fallback (never breaks the row).
class PreviewErrorBoundary extends React.Component<{ fallback: React.ReactNode; children?: React.ReactNode }, { err: boolean }> {
  constructor(p: any) { super(p); this.state = { err: false }; }
  static getDerivedStateFromError() { return { err: true }; }
  componentDidCatch() { /* swallow — fallback shown */ }
  render() { return this.state.err ? this.props.fallback : this.props.children; }
}

// Renders a row's widget with its STORED config + a sample value, by borrowing the widget class's display
// (the documented synthetic-instance mechanism). Crash-safe: setup throw OR render throw → the widget label.
const WidgetPreview: React.FC<{ flowEngine: any; api: any; model: string; config: any; meta?: FieldMeta; cf: any; token: any; label: string }> =
  ({ flowEngine, api, model, config, meta, cf, token, label }) => {
    const fallback = <span style={{ color: token.colorTextTertiary, fontSize: 12 }}>{label}</span>;
    let node: React.ReactNode = null;
    try {
      const value = sampleValueFor(model, config, meta);
      node = borrowWidgetRender(flowEngine, model, previewConfigFor(model, config, meta), value, cf, { api, flowEngine });
    } catch (_) { node = null; }
    if (node == null) return fallback;
    let hash = ''; try { hash = JSON.stringify(config); } catch (_) { /* ignore */ }
    return (
      <PreviewErrorBoundary key={`${model}:${hash}`} fallback={fallback}>
        <div style={{ display: 'inline-flex', alignItems: 'center', maxWidth: 200, overflow: 'hidden', color: token.colorText }}>{node}</div>
      </PreviewErrorBoundary>
    );
  };

export const GlobalWidgetsPane: React.FC<{ api: any; flowEngine?: any; appT?: (s: string) => string; t?: (s: string) => string }> = ({ api, flowEngine, appT, t }) => {
  const { token } = theme.useToken();
  const tr = t || ((s: string) => s);
  const [collTitles, setCollTitles] = useState<Record<string, string>>({});
  const [fieldMeta, setFieldMeta] = useState<Record<string, FieldMeta>>({});
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [jsonEdit, setJsonEdit] = useState<{ row: Row; text: string } | null>(null);

  const rebuild = () => setRows(allFieldWidgets().map((w) => ({
    key: `${w.dataSource}.${w.collection}.${w.field}`, dataSource: w.dataSource, collection: w.collection,
    field: w.field, widgetModel: w.widget.widgetModel, config: w.widget.config || {},
  })));

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // Collections + their fields in one call → collection titles + field titles/interfaces (the latter
        // feed the friendly field title AND the synthetic collectionField the edit form reads).
        const res = await api?.request?.({ url: 'collections:list', params: { paginate: false, appends: ['fields'] } });
        const map: Record<string, string> = {};
        const fm: Record<string, FieldMeta> = {};
        for (const c of res?.data?.data || []) {
          if (!c?.name) continue;
          map[c.name] = compileTitle((c.title && String(c.title)) || c.name, appT);
          for (const f of c.fields || []) {
            if (!f?.name) continue;
            const title = compileTitle((f.uiSchema?.title && String(f.uiSchema.title)) || f.title || f.name, appT);
            fm[`${c.name}.${f.name}`] = { title, interface: f.interface, uiSchema: f.uiSchema, target: f.target, targetKey: f.targetKey };
          }
        }
        if (alive) { setCollTitles(map); setFieldMeta(fm); }
      } catch (_) { /* ignore */ }
      try { await loadFieldWidgetCache(api); } catch (_) { /* ignore */ }
      if (alive) { rebuild(); setReady(true); }
    })();
    return () => { alive = false; };
  }, [api, appT]);

  const fieldTitle = (r: Row) => fieldMeta[`${r.collection}.${r.field}`]?.title || r.field;

  const del = async (r: Row) => {
    try {
      await removeFieldWidget(api, r.dataSource, r.collection, r.field);
      rebuild();
      message.success(tr('Đã xoá'));
    } catch (e: any) {
      message.error(e?.message || tr('Xoá thất bại'));
    }
  };

  // Change the widget TYPE for a field → reset config to defaults ({}) so the new widget uses its own defaults.
  const doChangeType = async (r: Row, newModel: string) => {
    try {
      await upsertFieldWidget(api, r.dataSource, r.collection, r.field, newModel, {});
      rebuild();
      message.success(tr('Widget type changed'));
    } catch (e: any) {
      message.error(e?.message || tr('Save failed'));
    }
  };
  const confirmChangeType = (r: Row, newModel: string) => {
    if (!newModel || newModel === r.widgetModel) return;
    Modal.confirm({
      title: tr('Change widget type will reset the config?'),
      okText: tr('OK'), cancelText: tr('Cancel'),
      onOk: () => doChangeType(r, newModel),
    });
  };

  // Build a best-effort synthetic collectionField so the widget's settings uiSchema (which may read
  // interface/target) renders. Not every field detail is present standalone — the form degrades gracefully.
  const buildSyntheticCf = (r: Row): any => {
    const m = fieldMeta[`${r.collection}.${r.field}`] || {};
    return {
      name: r.field, collectionName: r.collection, dataSourceKey: r.dataSource,
      interface: m.interface, uiSchema: m.uiSchema,
      // Value tag reads the field's enum via `cf.enum || cf.uiSchema.enum || cf.options` → supply all.
      enum: m.uiSchema?.enum, options: m.uiSchema?.enum || m.uiSchema?.['x-component-props']?.options,
      target: m.target, targetKey: m.targetKey,
      collection: { name: r.collection, dataSourceKey: r.dataSource, filterTargetKey: 'id' },
    };
  };

  // PART 1 — edit in place. Preferred: the REAL per-widget form via a detached synthetic model + the
  // framework's own settings dialog (isolated portal → a render error there can't break this pane). Fallback:
  // a JSON raw-config editor (widgets with no param map, or if the synthetic setup throws).
  // Explicit persist for a pane edit → upsert to the server row. Logs so the live test shows fire + result.
  const paneUpsert = async (widgetModel: string, ds: string, coll: string, field: string, config: any) => {
    try {
      // eslint-disable-next-line no-console
      console.log('[field-enh] pane edit → upsert', { field, widgetModel, config });
      await upsertFieldWidget(api, ds, coll, field, widgetModel, config);
      // eslint-disable-next-line no-console
      console.log('[field-enh] pane edit upsert OK', { field });
      rebuild();
      return true;
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.warn('[field-enh] pane edit upsert FAIL', { field, error: e?.message || e });
      message.error(e?.message || tr('Save failed'));
      return false;
    }
  };

  const openRealForm = async (r: Row): Promise<boolean> => {
    if (!hasParamMap(r.widgetModel) || !flowEngine?.createModel) return false;
    // Open the widget's OWN settings flow/step deterministically — NEVER a first-dialog-step guess (which
    // would grab a cross-cutting inherited flow, e.g. the formula plugin's `ptdlComputedRule` editor).
    const own = widgetOwnFlow(r.widgetModel);
    if (!own) return false;
    const { flow: flowKey, step: stepKey } = own;
    try {
      const synth: any = flowEngine.createModel({ use: r.widgetModel, uid: `ptdl-widget-edit-${Date.now()}` });
      if (!synth || typeof synth.getFlow !== 'function' || typeof synth.openStepSettingsDialog !== 'function') return false;
      const flow = synth.getFlow(flowKey);
      if (!flow || !flow.steps || !flow.steps[stepKey]) return false;
      const cf = buildSyntheticCf(r);
      try { Object.defineProperty(synth, 'collectionField', { value: cf, configurable: true }); } catch (_) { /* ignore */ }
      try { if (synth.context) synth.context.collectionField = cf; } catch (_) { /* ignore */ }

      // PERSIST — the dialog's OK calls setStepParams(finalValues) then saveStepParams(). We hook BOTH (deduped)
      // so the upsert fires no matter which the flow-engine version invokes. `ready` gates out the seed call +
      // any setup-time setStepParams, so only the USER's commit persists.
      let saved = false;
      const commit = (params: any) => {
        if (saved) return;
        const cfg = paramsToConfig(r.widgetModel, params);
        if (cfg == null) return;
        saved = true;
        paneUpsert(r.widgetModel, r.dataSource, r.collection, r.field, cfg);
      };
      const origSet = typeof synth.setStepParams === 'function' ? synth.setStepParams.bind(synth) : null;
      synth.__ptdlReady = false;
      // seed the form from the stored config (before ready → no commit).
      try { origSet && origSet(flowKey, stepKey, configToParams(r.widgetModel, r.config) || {}); } catch (_) { /* ignore */ }
      synth.setStepParams = function (...args: any[]) {
        try { origSet && origSet(...args); } catch (_) { /* ignore */ }
        try {
          if (synth.__ptdlReady) {
            const values = args.length >= 3 ? args[2] : (args.length === 1 ? args[0] : undefined);
            if (values && typeof values === 'object') commit(values);
          }
        } catch (_) { /* ignore */ }
      };
      synth.saveStepParams = async () => {
        try {
          if (!synth.__ptdlReady) return;
          let p: any = {};
          try { p = synth.getStepParams(flowKey, stepKey) || {}; } catch (_) { /* ignore */ }
          commit(p);
        } catch (_) { /* ignore */ }
      };

      // WIDER dialog: flowModel.openStepSettingsDialog defaults the width to 600 and ignores the step's
      // declared `uiMode.props.width` (only the gear-menu path reads it). So wide forms — especially the
      // value-tag rules table (Value/Text color/Background/Icon/Preview) — overflow with a horizontal
      // scrollbar. Briefly wrap the viewer's dialog opener to bump the width for the settings popup it's about
      // to open (targeted via `__isSettingsPopup` so only this dialog is affected), then restore it. Width =
      // the widget's declared width (960 for the value tag's 5-column table), capped at 92vw (responsive).
      let declaredWidth = 600;
      try { const uw = flow?.steps?.[stepKey]?.uiMode?.props?.width; if (typeof uw === 'number' && uw > 0) declaredWidth = uw; } catch (_) { /* ignore */ }
      const targetWidth = r.widgetModel === 'ConditionalStatusFieldModel' ? 960 : declaredWidth;
      const vw = (typeof window !== 'undefined' && window.innerWidth) ? window.innerWidth : 1200;
      const dialogWidth = Math.round(Math.min(targetWidth, vw * 0.92));
      const viewer: any = synth?.context?.viewer;
      let restoreDialog: (() => void) | null = null;
      try {
        if (viewer && typeof viewer.dialog === 'function') {
          const hadOwn = Object.prototype.hasOwnProperty.call(viewer, 'dialog');
          const origDialog = viewer.dialog;
          viewer.dialog = function (opts: any) {
            return origDialog.call(viewer, opts && opts.inputArgs && opts.inputArgs.__isSettingsPopup ? { ...opts, width: dialogWidth } : opts);
          };
          restoreDialog = () => {
            if (hadOwn) viewer.dialog = origDialog;
            else { try { delete viewer.dialog; } catch (_) { viewer.dialog = origDialog; } }
          };
        }
      } catch (_) { /* ignore — dialog just stays default width */ }

      try { await synth.openStepSettingsDialog(flowKey, stepKey); }
      finally { try { restoreDialog && restoreDialog(); } catch (_) { /* ignore */ } }
      synth.__ptdlReady = true; // dialog is open → the next setStepParams/saveStepParams is the user's OK
      return true;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[field-enh] widget edit real-form failed → JSON fallback', e);
      return false;
    }
  };
  const openEdit = async (r: Row) => {
    const ok = await openRealForm(r);
    if (!ok) setJsonEdit({ row: r, text: JSON.stringify(r.config || {}, null, 2) });
  };
  const saveJson = async () => {
    if (!jsonEdit) return;
    let parsed: any;
    try { parsed = JSON.parse(jsonEdit.text); }
    catch (_) { message.error(tr('Invalid JSON')); return; }
    const r = jsonEdit.row;
    const ok = await paneUpsert(r.widgetModel, r.dataSource, r.collection, r.field, parsed);
    if (ok) { setJsonEdit(null); message.success(tr('Saved')); }
  };

  const collOptions = useMemo(() => {
    const names = Array.from(new Set(rows.map((r) => r.collection)));
    return names.map((n) => ({ value: n, label: collTitles[n] || n }));
  }, [rows, collTitles]);
  const visible = useMemo(() => (filter.length ? rows.filter((r) => filter.includes(r.collection)) : rows), [rows, filter]);
  const showDataSource = useMemo(() => new Set(rows.map((r) => r.dataSource || 'main')).size > 1, [rows]);

  const columns: any[] = [
    { title: tr('Collection'), key: 'coll', width: 180, render: (_: any, r: Row) => <b>{collTitles[r.collection] || r.collection}</b> },
    {
      title: tr('Cột'), key: 'field', width: 200,
      render: (_: any, r: Row) => {
        const title = fieldTitle(r);
        return (
          <span>
            <span style={{ fontWeight: 500 }}>{title}</span>
            {title !== r.field ? <span style={{ color: token.colorTextTertiary, fontSize: 11, marginLeft: 6 }}>{r.field}</span> : null}
          </span>
        );
      },
    },
    ...(showDataSource ? [{ title: tr('Data source'), dataIndex: 'dataSource', width: 120, render: (v: string) => <Tag>{v || 'main'}</Tag> }] : []),
    {
      title: tr('Widget'), key: 'widget', width: 190,
      render: (_: any, r: Row) => {
        const opts = CATALOG.map(([v, l]) => ({ value: v, label: tr(l) }));
        if (!opts.find((o) => o.value === r.widgetModel)) opts.unshift({ value: r.widgetModel, label: widgetLabel(r.widgetModel) });
        return (
          <Space size={6} align="center">
            <span style={{ display: 'inline-flex', lineHeight: 0, color: token.colorPrimary }}><IconByKey type={widgetIcon(r.widgetModel)} /></span>
            <Tooltip title={tr('Change widget type')}>
              <Select size="small" variant="borderless" value={r.widgetModel} style={{ minWidth: 128 }}
                options={opts} onChange={(nm: string) => confirmChangeType(r, nm)} showSearch optionFilterProp="label" />
            </Tooltip>
          </Space>
        );
      },
    },
    {
      title: tr('Preview'), key: 'preview', width: 200,
      render: (_: any, r: Row) => (
        <WidgetPreview flowEngine={flowEngine} api={api} model={r.widgetModel} config={r.config}
          meta={fieldMeta[`${r.collection}.${r.field}`]} cf={buildSyntheticCf(r)} token={token} label={widgetLabel(r.widgetModel)} />
      ),
    },
    {
      title: tr('Config'), key: 'summary',
      render: (_: any, r: Row) => {
        const s = configSummary(r.widgetModel, r.config, tr);
        return s ? <span style={{ color: token.colorTextSecondary, fontSize: 12.5 }}>{s}</span> : <span style={{ color: token.colorTextQuaternary }}>—</span>;
      },
    },
    {
      title: '', key: 'act', width: 110,
      render: (_: any, r: Row) => (
        <Space size={2}>
          <Button size="small" type="link" onClick={() => openEdit(r)}>{tr('Edit')}</Button>
          <Popconfirm title={tr('Bỏ widget global cho cột này?')} okText={tr('Xoá')} cancelText={tr('Huỷ')} onConfirm={() => del(r)}>
            <Button size="small" type="link" danger>{tr('Xoá')}</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  if (!ready) return <ConfigContainer maxWidth={100000}><div style={{ padding: 40, textAlign: 'center' }}><Spin /></div></ConfigContainer>;

  return (
    <ConfigContainer maxWidth={100000}>
      <div style={{ marginBottom: 16, color: token.colorTextTertiary, fontSize: 13 }}>
        {tr('Danh sách các cột đã gán widget hiển thị "global" — set 1 lần, hiện ở mọi bảng/chi tiết. Muốn thêm: mở cấu hình widget của cột (⚙ → Field component) rồi bật "Áp dụng cho mọi view".')}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>{tr('Widget global')} <span style={{ color: token.colorTextTertiary, fontWeight: 400 }}>({rows.length})</span></span>
        <Select mode="multiple" allowClear size="small" placeholder={tr('Lọc theo collection…')} value={filter} onChange={setFilter}
          options={collOptions} style={{ minWidth: 220 }} maxTagCount="responsive" showSearch optionFilterProp="label" />
      </div>
      {rows.length ? (
        <Table<Row> rowKey="key" size="small" bordered pagination={false} columns={columns} dataSource={visible} />
      ) : (
        <Empty description={tr('Chưa có widget global nào. Bật "Áp dụng cho mọi view" trong cấu hình widget của một cột để thêm.')} style={{ padding: '24px 0' }} />
      )}

      <Modal
        open={!!jsonEdit}
        title={jsonEdit ? `${tr('Edit config (JSON)')} — ${widgetLabel(jsonEdit.row.widgetModel)}` : ''}
        onCancel={() => setJsonEdit(null)}
        onOk={saveJson}
        okText={tr('Save')}
        cancelText={tr('Cancel')}
        width={560}
        destroyOnClose
      >
        <div style={{ marginBottom: 8, color: token.colorTextTertiary, fontSize: 12 }}>
          {tr('Edit the raw widget config. Advanced — invalid JSON will not be saved.')}
        </div>
        <Input.TextArea
          value={jsonEdit?.text || ''}
          onChange={(e) => setJsonEdit((prev) => (prev ? { ...prev, text: e.target.value } : prev))}
          rows={14}
          style={{ fontFamily: 'monospace', fontSize: 12.5 }}
          spellCheck={false}
        />
      </Modal>
    </ConfigContainer>
  );
};

export default GlobalWidgetsPane;
