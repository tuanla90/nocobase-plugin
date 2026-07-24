// Settings page: list + create/edit line-generator rules IN-APP. Shared by both lanes.
// v0.2.1 — simplified per user feedback, mirroring print-template's condition UX:
//  - every "field" input is a picker loaded from the real collection (label + name), not free typing
//  - condition values suggest the field's select options (enum), like print-template's ConditionPicker
//  - targetForeignKey is AUTO-DERIVED from the picked hasMany relation (field removed from the form)
//  - key auto-slugs from the title; runVersionSource only shows for the 'version' policy
//  - 5 sections instead of 7; rarely-touched knobs live under "Nâng cao" (collapsed)
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AutoComplete, Button, Cascader, Checkbox, Collapse, Drawer, Input, InputNumber, Modal, Popconfirm, Select, Space, Table, Tag, Tooltip, message, theme } from 'antd';
import { CollapsibleSection, SettingRow, RelationAppendsPicker, FieldPickerCascader, getFields, SegmentedGroup } from '@tuanla90/shared';
import { previewInline, RunResult } from './api';
import { TEMPLATES } from './templates';
import type { LineGenConfig } from './types';
import { t as tt } from './i18n';

const RULES_COLLECTION = 'ptdl_linegen_rules';

// New generators are COLLECTION-mode only (rules live in a data table) — inline scopes remain
// supported by the engine + editor for LEGACY configs, but can no longer be chosen for new ones.
const EMPTY: LineGenConfig = {
  key: '', title: '', enabled: true, sourceCollection: '', ruleCollection: '',
  ruleWhere: [], lineOutputs: [{ targetField: '', formula: '', required: false }], targetPath: '', targetForeignKey: '', regenPolicy: 'append',
};

const cleanTitle = (raw: any, fb: string) => {
  const s = String(raw ?? '');
  const m = s.match(/\{\{\s*t\(\s*['"]([^'"]+)['"]/);
  if (m) return m[1];
  if (!s || /\{\{/.test(s)) return fb;
  return s;
};

/** "Tính hoa hồng đơn hàng" → "tinh-hoa-hong-don-hang" (key auto-fill). */
const slugify = (s: string) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

// "true"/"false"/number → typed; else the raw string.
const coerce = (v: string): any => {
  const s = String(v ?? '').trim();
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (s !== '' && !Number.isNaN(Number(s)) && /^-?\d/.test(s)) return Number(s);
  return v;
};
const showVal = (v: any): string => (v === true ? 'true' : v === false ? 'false' : v == null ? '' : String(v));

/** Readable cell display — an OBJECT value (e.g. saving a whole relation record) shows as "#id label"
 *  instead of "[object Object]"; arrays as "[n]"; everything else as-is. Used across preview + debug. */
const disp = (v: any): string => {
  if (v == null) return '';
  if (typeof v === 'object') {
    if (Array.isArray(v)) return `[${v.length}]`;
    const id = (v as any).id ?? (v as any).value;
    const label = (v as any).name ?? (v as any).title ?? (v as any).nickname ?? (v as any).label;
    if (id != null || label != null) return `#${id ?? '?'}${label != null ? ' ' + label : ''}`;
    const s = JSON.stringify(v);
    return s.length > 60 ? s.slice(0, 60) + '…' : s;
  }
  return String(v);
};

/** v0.6 migration: legacy configs stored the rule filter as matchMap (rule↔source join) + a static
 *  ruleFilter object. The editor now uses a single ruleWhere[]. Convert on OPEN so the UI shows the rows;
 *  cleanConfig then persists ruleWhere and strips matchMap/ruleFilter (they never coexist afterwards). */
const migrateConfig = (cfg0: any): LineGenConfig => {
  const c: any = { ...(cfg0 || {}) };
  const hasLegacy = (Array.isArray(c.matchMap) && c.matchMap.length) || (c.ruleFilter && Object.keys(c.ruleFilter).length);
  if (!Array.isArray(c.ruleWhere) && hasLegacy) {
    const rw: any[] = [];
    for (const m of (c.matchMap || [])) rw.push({ field: m.ruleField, op: 'eq', value: 'parent.' + m.sourceField });
    for (const [k, v] of Object.entries(c.ruleFilter || {})) rw.push({ field: k, op: 'eq', value: (typeof v === 'boolean' || typeof v === 'number') ? String(v) : String(v) });
    c.ruleWhere = rw;
  }
  return c;
};

export function createRulesManager(deps: { useApiClient: () => any }): React.FC {
  const { useApiClient } = deps;

  // ---- collection fields (shared per-collection cache — same one every @tuanla90 picker uses) ------
  const useCollectionFields = (api: any, collection?: string): any[] => {
    const [fields, setFields] = useState<any[]>([]);
    useEffect(() => {
      let live = true;
      if (!collection) { setFields([]); return; }
      getFields(api, collection).then((f) => live && setFields(f));
      return () => { live = false; };
    }, [api, collection]);
    return fields;
  };

  // Multi-level relation cascader = shared `RelationAppendsPicker` (@tuanla90/shared): hover to expand
  // nested relations, each pick becomes a removable tag. Picking a path loads ALL columns of every
  // object along it — no per-column picking.
  const fieldLabel = (f: any) => cleanTitle(f?.uiSchema?.title, f.name) + (cleanTitle(f?.uiSchema?.title, '') ? ` (${f.name})` : '');
  const enumOf = (fields: any[], name?: string) => {
    const f = fields.find((x) => x.name === name);
    return ((f?.uiSchema?.enum || f?.options?.uiSchema?.enum || []) as any[]).map((o: any) => ({ value: String(o?.value ?? o), label: String(o?.label ?? o?.value ?? o) }));
  };

  /** Field picker with free-text fallback (dot-paths still typable) — print-template style. */
  const FieldSelect: React.FC<{ api: any; collection?: string; value?: string; onChange: (v: string) => void; placeholder?: string; size?: 'small' | 'middle'; only?: (f: any) => boolean; style?: React.CSSProperties }> =
    ({ api, collection, value, onChange, placeholder, size = 'small', only, style }) => {
      const fields = useCollectionFields(api, collection);
      const opts = fields.filter((f) => (only ? only(f) : !['hasMany', 'belongsToMany', 'hasOne', 'belongsTo'].includes(f.type)))
        .map((f) => ({ value: f.name, label: fieldLabel(f) }));
      return <AutoComplete size={size} style={{ minWidth: 140, ...style }} options={opts} value={value} onChange={(v) => onChange(v as string)} placeholder={placeholder} filterOption={(input, o) => String(o?.label || '').toLowerCase().includes(input.toLowerCase())} />;
    };

  /** Multi field picker: a dropdown of the collection's real columns, but still free-typable (tags mode)
   *  for output columns that aren't on the collection yet. Used by the group-by / sum / rounding lists. */
  const FieldMultiSelect: React.FC<{ api: any; collection?: string; value?: string[]; onChange: (v: string[]) => void; placeholder?: string; only?: (f: any) => boolean; style?: React.CSSProperties }> =
    ({ api, collection, value, onChange, placeholder, only, style }) => {
      const fields = useCollectionFields(api, collection);
      const opts = fields.filter((f) => (only ? only(f) : !['hasMany', 'belongsToMany', 'hasOne', 'belongsTo'].includes(f.type)))
        .map((f) => ({ value: f.name, label: fieldLabel(f) }));
      return <Select mode="tags" size="middle" style={{ width: '100%', ...style }} options={opts} value={value || []} onChange={onChange} placeholder={placeholder} tokenSeparators={[',']}
        filterOption={(input, o) => String(o?.label || '').toLowerCase().includes(input.toLowerCase())} />;
    };

  /** Value input suggesting the picked field's select options (enum) — print-template style. */
  const ValueSuggest: React.FC<{ api: any; collection?: string; field?: string; value: any; onChange: (v: any) => void; size?: 'small' | 'middle'; style?: React.CSSProperties }> =
    ({ api, collection, field, value, onChange, size = 'small', style }) => {
      const fields = useCollectionFields(api, collection);
      return <AutoComplete size={size} style={{ minWidth: 130, ...style }} options={enumOf(fields, field)} value={showVal(value)} onChange={(v) => onChange(coerce(v as string))} placeholder={tt('giá trị')} />;
    };

  // Operators offered ADAPT to the picked field's data type (point 4): numbers/dates get the range ops,
  // text gets "contains", booleans/selects only =/≠. Unknown or dot-path fields get the full set.
  const OP_ALL = () => [
    { value: 'eq', label: '=' },
    { value: 'ne', label: '≠' },
    { value: 'gt', label: '>' },
    { value: 'lt', label: '<' },
    { value: 'gte', label: '≥' },
    { value: 'lte', label: '≤' },
    { value: 'contains', label: tt('chứa') },
  ];
  const opsForType = (type?: string) => {
    const all = OP_ALL();
    const pick = (ks: string[]) => all.filter((o) => ks.includes(o.value));
    const t = String(type || '').toLowerCase();
    if (!t) return all;
    if (/(bigint|integer|int|float|double|decimal|number|currency|percent|sort)/.test(t)) return pick(['eq', 'ne', 'gt', 'lt', 'gte', 'lte']);
    if (/(date|time)/.test(t)) return pick(['eq', 'ne', 'gt', 'lt', 'gte', 'lte']);
    if (/(bool|checkbox)/.test(t)) return pick(['eq', 'ne']);
    if (/(select|radio|status)/.test(t)) return pick(['eq', 'ne']);
    if (/(string|text|char|input|email|url|uuid|markdown|password)/.test(t)) return pick(['eq', 'ne', 'contains']);
    return all;
  };
  const isDateType = (t?: string) => /(date|time)/.test(String(t || '').toLowerCase());

  // Resolve the TYPE of a (possibly NESTED) field path by walking relations to the leaf. Cached.
  const typeCache = new Map<string, string | undefined>();
  const resolvePathType = async (api: any, collection: string, path: string): Promise<string | undefined> => {
    const key = `${collection}|${path}`;
    if (typeCache.has(key)) return typeCache.get(key);
    let coll = collection;
    let type: string | undefined;
    const segs = path.split('.').filter(Boolean);
    for (let i = 0; i < segs.length; i++) {
      const fs = await getFields(api, coll);
      const f = fs.find((x: any) => x.name === segs[i]);
      if (!f) break;
      if (i === segs.length - 1) { type = f.type; break; }
      if (!f.target) break;
      coll = f.target;
    }
    typeCache.set(key, type);
    return type;
  };
  /** { path -> type } for a set of condition paths — resolves nested types async (works for loaded configs too). */
  const useResolvedTypes = (api: any, collection: string | undefined, paths: string[]): Record<string, string | undefined> => {
    const [map, setMap] = useState<Record<string, string | undefined>>({});
    const dep = (collection || '') + '|' + paths.filter(Boolean).slice().sort().join(',');
    useEffect(() => {
      let live = true;
      if (!collection) { setMap({}); return; }
      (async () => {
        const out: Record<string, string | undefined> = {};
        for (const p of paths) if (p) out[p] = await resolvePathType(api, collection, p);
        if (live) setMap(out);
      })();
      return () => { live = false; };
    }, [api, dep]);
    return map;
  };

  /** Nested field cascader: click through relations to a scalar; returns dot-path + leaf type. Displays
   *  the raw path (so a loaded value shows even before lazy children are fetched). */
  const CondFieldCascader: React.FC<{ api: any; collection?: string; value?: string; onPick: (path: string, type?: string) => void; placeholder?: string }> = ({ api, collection, value, onPick, placeholder }) => {
    const [options, setOptions] = useState<any[]>([]);
    const toOpt = (f: any) => {
      const isRel = ['belongsTo', 'hasOne', 'hasMany', 'belongsToMany'].includes(f.type) && f.target;
      return { value: f.name, label: fieldLabel(f), _type: f.type, _target: f.target, isLeaf: !isRel };
    };
    useEffect(() => { let live = true; if (!collection) { setOptions([]); return; } getFields(api, collection).then((fs: any[]) => live && setOptions(fs.map(toOpt))); return () => { live = false; }; }, [api, collection]);
    const loadData = async (sel: any[]) => {
      const t = sel[sel.length - 1];
      if (!t?._target || t.children) return;
      const fs = await getFields(api, t._target);
      t.children = fs.map(toOpt);
      setOptions((o) => [...o]);
    };
    return (
      <Cascader style={{ width: '100%' }} size="middle" options={options} value={value ? value.split('.') : []} changeOnSelect expandTrigger="hover"
        loadData={loadData} placeholder={placeholder} allowClear={false}
        showSearch={{ filter: (input: string, path: any[]) => path.some((o) => String(o.label).toLowerCase().includes(input.toLowerCase())) }}
        displayRender={() => value || ''}
        onChange={(vals: any, opts: any) => { const p = (vals || []).join('.'); const leaf = opts && opts[opts.length - 1]; if (collection) typeCache.set(`${collection}|${p}`, leaf?._type); onPick(p, leaf?._type); }} />
    );
  };

  /** Generic edit-in-place TABLE: antd Table (thin border, light header) + a trailing ✕ column + one
   *  "＋ add" button below. Every list surface in the editor goes through this so they share one look.
   *  Each column's render(row, patch, index) gets a patcher that merges a partial into that row. */
  const EditTable: React.FC<{
    columns: Array<{ title: React.ReactNode; key: string; width?: number | string; align?: 'left' | 'center' | 'right'; render: (row: any, patch: (p: any) => void, index: number) => React.ReactNode }>;
    rows: any[];
    onChange: (next: any[]) => void;
    newRow: () => any;
    addLabel: string;
  }> = ({ columns, rows, onChange, newRow, addLabel }) => {
    const list = rows || [];
    const tblCols: any[] = [
      ...columns.map((c) => ({
        title: c.title, key: c.key, width: c.width, align: c.align,
        render: (_: any, row: any, index: number) => c.render(row, (p: any) => onChange(list.map((x, j) => (j === index ? { ...x, ...p } : x))), index),
      })),
      {
        title: '', key: '__del', width: 44, align: 'center' as const,
        render: (_: any, __: any, index: number) => <Button type="text" size="small" danger onClick={() => onChange(list.filter((_x, j) => j !== index))}>✕</Button>,
      },
    ];
    return (
      <div>
        <Table size="small" bordered pagination={false} rowKey={(_: any, i: number) => String(i)}
          columns={tblCols} dataSource={list} locale={{ emptyText: tt('Chưa có dòng nào') }} />
        <Button size="small" type="dashed" style={{ marginTop: 8 }} onClick={() => onChange([...list, newRow()])}>＋ {addLabel}</Button>
      </div>
    );
  };

  /** Compact JSON viewer for the step-by-step debug panels (scrolls both axes, never wraps the page). */
  const JsonBlock: React.FC<{ value: any }> = ({ value }) => {
    const { token } = theme.useToken();
    return (
      <pre style={{ margin: 0, padding: 8, fontSize: 11.5, lineHeight: 1.5, maxHeight: 280, overflow: 'auto', background: token.colorBgContainer, border: `1px solid ${token.colorBorderSecondary}`, borderRadius: 4, whiteSpace: 'pre' }}>
        {JSON.stringify(value ?? null, null, 2)}
      </pre>
    );
  };

  /** Reduced table for the debug panels: first few columns of a row list (src / rules / grouped). */
  const MiniTable: React.FC<{ rows: any[]; maxCols?: number }> = ({ rows, maxCols = 6 }) => {
    const { token } = theme.useToken();
    const list = rows || [];
    if (!list.length) return <div style={{ color: token.colorTextTertiary, fontSize: 12 }}>{tt('(không có dòng)')}</div>;
    const keys = Array.from(list.reduce((s, r) => { Object.keys(r || {}).forEach((k) => s.add(k)); return s; }, new Set<string>())).slice(0, maxCols);
    const cols = keys.map((k) => ({ title: k, dataIndex: k, key: k, ellipsis: true, render: (v: any) => disp(v) }));
    return <Table size="small" bordered rowKey={(_: any, i: number) => String(i)} columns={cols} dataSource={list} pagination={list.length > 10 ? { pageSize: 10 } : false} scroll={{ x: true }} />;
  };

  /** Guard / precondition list — a table [Cột | Toán tử | Giá trị | ✕]. Default AND (no "VÀ" marker):
   *  each row is one more condition that must hold. Shared by the guard surface(s). */
  const CondList: React.FC<{ api: any; collection?: string; items: any[]; onChange: (v: any[]) => void }> = ({ api, collection, items, onChange }) => {
    const types = useResolvedTypes(api, collection, (items || []).map((r) => r.field));
    return (
      <EditTable
        rows={items || []} onChange={onChange} newRow={() => ({ field: '', op: 'eq', value: '' })} addLabel={tt('Thêm điều kiện')}
        columns={[
          { title: tt('Cột'), key: 'field', render: (row, patch) => <CondFieldCascader api={api} collection={collection} value={row.field} onPick={(p, t) => { const ops = opsForType(t).map((o) => o.value); patch({ field: p, ...(row.op && !ops.includes(row.op) ? { op: 'eq' } : {}) }); }} placeholder={tt('chọn cột')} /> },
          { title: tt('Toán tử'), key: 'op', width: 96, render: (row, patch) => <Select size="middle" style={{ width: '100%' }} value={row.op || 'eq'} onChange={(v) => patch({ op: v })} options={opsForType(types[row.field])} /> },
          { title: tt('Giá trị'), key: 'value', render: (row, patch) => isDateType(types[row.field])
            ? <Input type="date" size="middle" style={{ width: '100%' }} value={String(row.value ?? '')} onChange={(e) => patch({ value: e.target.value })} />
            : <ValueSuggest api={api} collection={collection} field={row.field} value={row.value} onChange={(v) => patch({ value: v })} size="middle" style={{ width: '100%' }} /> },
        ]}
      />
    );
  };

  /** ONE consistent "assignment row" style for every field←formula surface (parent updates,
   *  intermediate vars, output columns): [left box 240 | formula, joined, full height]. */
  const AssignRow: React.FC<{ left: React.ReactNode; children: React.ReactNode; suffix?: React.ReactNode }> = ({ left, children, suffix }) => (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <Space.Compact style={{ flex: 1 }}>
        {left}
        {children}
      </Space.Compact>
      {suffix || null}
    </div>
  );

  const RowList: React.FC<{
    items: any[]; onChange: (next: any[]) => void; addLabel: string; newItem: () => any;
    renderRow: (item: any, patch: (p: any) => void) => React.ReactNode;
  }> = ({ items, onChange, addLabel, newItem, renderRow }) => {
    const list = items || [];
    return (
      <div>
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          {list.map((item, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ flex: 1, minWidth: 0 }}>{renderRow(item, (p) => onChange(list.map((x, j) => (j === i ? { ...x, ...p } : x))))}</div>
              <Button size="small" type="text" danger onClick={() => onChange(list.filter((_, j) => j !== i))}>✕</Button>
            </div>
          ))}
        </Space>
        <Button size="small" type="dashed" style={{ marginTop: 8 }} onClick={() => onChange([...list, newItem()])}>＋ {addLabel}</Button>
      </div>
    );
  };

  // A fresh empty join step (v0.8 pipeline). Defaults to a config-join with one blank output.
  const newJoinStep = (): any => ({ stepType: 'config', ruleCollection: '', ruleWhere: [], lineOutputs: [{ targetField: '', formula: '', required: false }] });

  // ---- v0.8 PIPELINE — ONE join-step card (reuses the v0.7 RIGHT + ON + recurse + outputs UI) ----------
  // Stable component (defined once at manager scope) so its inputs don't remount on every parent render;
  // it owns its own resolved-types hook for the ON grid of THIS step's rule table. `onChange(patch)` merges
  // a partial into this step; onMove/onRemove reorder/delete it. `relationCollection` = the collection the
  // relation picker lists associations from (the source-lines table, or the parent). `outputCollection` =
  // the collection whose columns the output/recurse pickers suggest (the final target, for the last step).
  const StepCard: React.FC<{
    api: any; step: any; index: number; total: number; collections: any[];
    relationCollection?: string; outputCollection?: string; trackFocus: (e: React.FocusEvent) => void;
    onChange: (patch: any) => void; onMove: (dir: -1 | 1) => void; onRemove: () => void;
  }> = ({ api, step, index, total, collections, relationCollection, outputCollection, trackFocus, onChange, onMove, onRemove }) => {
    const { token } = theme.useToken();
    const isRel = (step.stepType || 'config') === 'relation';
    const relFields = useCollectionFields(api, isRel ? (relationCollection || undefined) : undefined);
    const relOptions = relFields.filter((f) => ['hasMany', 'belongsToMany', 'hasOne', 'belongsTo'].includes(f.type))
      .map((f) => ({ value: f.name, label: fieldLabel(f) }));
    // op-by-type for THIS step's ON grid (base ruleWhere + every matchTiers tier), resolved on the step table.
    const ondTypes = useResolvedTypes(api, step.ruleCollection || undefined, [
      ...((step.ruleWhere || []).map((r: any) => r.field)),
      ...(([] as any[]).concat(...(step.matchTiers || [])).map((r: any) => r.field)),
    ].filter(Boolean) as string[]);
    const mono = { fontFamily: 'monospace', fontSize: 12.5 } as React.CSSProperties;

    // The rule/tier condition grid for THIS step (rule column op value; value typed like the single-join ON).
    const condCols = () => ([
      { title: tt('Cột quy tắc'), key: 'field', render: (row: any, patch: any) => <CondFieldCascader api={api} collection={step.ruleCollection || undefined} value={row.field} onPick={(p: string, t?: string) => { const ops = opsForType(t).map((o) => o.value); patch({ field: p, ...(row.op && !ops.includes(row.op) ? { op: 'eq' } : {}) }); }} placeholder={tt('cột quy tắc')} /> },
      { title: tt('Toán tử'), key: 'op', width: 96, render: (row: any, patch: any) => <Select size="middle" style={{ width: '100%' }} value={row.op || 'eq'} onChange={(v) => patch({ op: v })} options={opsForType(ondTypes[row.field])} /> },
      { title: tt('Giá trị'), key: 'value', render: (row: any, patch: any) => isDateType(ondTypes[row.field])
        ? <Input type="date" size="middle" style={{ width: '100%' }} value={String(row.value ?? '')} onChange={(e) => patch({ value: e.target.value })} onFocus={trackFocus} />
        : <Input size="middle" style={{ width: '100%' }} value={row.value ?? ''} onChange={(e) => patch({ value: e.target.value })} onFocus={trackFocus} placeholder={tt('gõ: true, NV, parent.x, src.x')} /> },
    ]);

    // matchTiers ladder (per step).
    const tiers = step.matchTiers || [];
    const setTiers = (next: any[][]) => onChange({ matchTiers: next });
    const moveTier = (i: number, dir: -1 | 1) => { const j = i + dir; if (j < 0 || j >= tiers.length) return; const next = tiers.map((t: any) => t); [next[i], next[j]] = [next[j], next[i]]; setTiers(next); };
    const tierLabel = (i: number, n: number) => (i === 0 ? tt('cụ thể nhất') : i === n - 1 ? tt('chung/dự phòng') : tt('bậc giữa'));

    const rightName = isRel ? `→ ${step.relationPath || tt('(quan hệ)')}` : (step.ruleCollection || tt('(bảng config)'));
    return (
      <div style={{ border: `1px solid ${step.recurse ? token.colorPrimary : token.colorBorderSecondary}`, borderRadius: 8, padding: '10px 12px', marginBottom: 10, background: token.colorBgContainer }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <b style={{ fontSize: 13 }}>{tt('Bước {{n}}', { n: index + 1 })} · <span style={{ color: token.colorTextSecondary }}>⋈ {rightName}</span>
            {step.recurse ? <span title={tt('nổ đệ quy (self-join)')} style={{ marginLeft: 8, background: token.colorPrimary, color: '#fff', borderRadius: 10, fontSize: 11, padding: '1px 7px', fontWeight: 600 }}>↻ {tt('lặp (đệ quy)')}</span> : null}
          </b>
          <Space size={2}>
            <Button size="small" type="text" disabled={index === 0} onClick={() => onMove(-1)}>↑</Button>
            <Button size="small" type="text" disabled={index === total - 1} onClick={() => onMove(1)}>↓</Button>
            <Button size="small" type="text" danger onClick={onRemove}>✕</Button>
          </Space>
        </div>

        <SettingRow label={tt('Nguồn nối (RIGHT)')} hint={tt('Bảng config = quét bảng chuẩn/định mức, khớp theo điều kiện. Quan hệ có sẵn = đi theo hasMany/o2m sẵn có của dòng hiện tại (nhanh, chỉ dòng liên kết theo khoá ngoại).')}>
          <SegmentedGroup block style={{ border: `1px solid ${token.colorBorder}`, width: '100%' }} value={step.stepType || 'config'} onChange={(v: any) => onChange({ stepType: v })}
            options={[{ value: 'config', label: tt('Bảng config (khớp điều kiện)') }, { value: 'relation', label: tt('Quan hệ có sẵn (theo key)') }]} />
        </SettingRow>

        {isRel ? (
          <>
            <SettingRow label={tt('Quan hệ để đi theo (relationPath)')} hint={tt('Quan hệ hasMany/o2m trên dòng đầu vào của bước này — các bản ghi liên kết trở thành rule.* để nổ ra. Bước đầu đọc quan hệ của bảng nguồn/cha.')}>
              <AutoComplete size="middle" style={{ width: '100%' }} options={relOptions} value={step.relationPath} onChange={(v) => onChange({ relationPath: v as string })} placeholder={tt('vd order_items')} filterOption={(input, o) => String(o?.label || '').toLowerCase().includes(input.toLowerCase())} />
            </SettingRow>
            <SettingRow layout="vertical" label={tt('Lọc thêm dòng quan hệ (tuỳ chọn)')} hint={tt('Không bắt buộc — lọc bớt các bản ghi liên kết đã lấy về. rule.* = bản ghi liên kết.')}>
              <EditTable rows={step.ruleWhere || []} onChange={(v) => onChange({ ruleWhere: v })} newRow={() => ({ field: '', op: 'eq', value: '' })} addLabel={tt('Thêm điều kiện')} columns={condCols()} />
            </SettingRow>
          </>
        ) : (
          <>
            <SettingRow label={tt('Bảng config (RIGHT)')} hint={tt('Bảng chuẩn/định mức của bước này (vd combo_config, bom). Khớp với dòng đầu vào theo điều kiện nối bên dưới.')}>
              <Select style={{ width: '100%' }} showSearch optionFilterProp="label" options={collections} value={step.ruleCollection || undefined} onChange={(v) => onChange({ ruleCollection: v })} placeholder={tt('Chọn bảng')} />
            </SettingRow>
            <SettingRow layout="vertical" label={tt('Nạp kèm quan hệ của config (appends)')} hint={tt('Quan hệ của bảng config mà điều kiện/công thức cần đọc (vd material của bom).')}>
              <RelationAppendsPicker api={api} collectionName={step.ruleCollection || undefined} value={step.ruleAppends} onChange={(v) => onChange({ ruleAppends: v })} />
            </SettingRow>
            <SettingRow layout="vertical" label={tt('Điều kiện nối (ON) — VÀ')} hint={tt('Cột config so với giá trị bạn gõ: true / NV là hằng; src.product_id là khớp động theo dòng đầu vào của bước này (= output bước trước).')}>
              <EditTable rows={step.ruleWhere || []} onChange={(v) => onChange({ ruleWhere: v })} newRow={() => ({ field: '', op: 'eq', value: '' })} addLabel={tt('Thêm điều kiện')} columns={condCols()} />
            </SettingRow>
            <SettingRow layout="vertical" label={tt('Bậc khớp ưu tiên (tuỳ chọn)')} hint={tt('thử bậc 1 trước; có kết quả thì dùng & dừng; bậc dưới tự bỏ dòng đã khai bậc trên (chống đếm trùng).')}>
              <div>
                {tiers.map((tier: any, i: number) => (
                  <div key={i} style={{ border: `1px solid ${token.colorBorderSecondary}`, borderRadius: 6, padding: '8px 10px', marginBottom: 8, background: token.colorFillQuaternary }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <b style={{ fontSize: 12.5 }}>{tt('Bậc {{n}}', { n: i + 1 })} · <span style={{ color: token.colorPrimary }}>{tierLabel(i, tiers.length)}</span></b>
                      <Space size={2}>
                        <Button size="small" type="text" disabled={i === 0} onClick={() => moveTier(i, -1)}>↑</Button>
                        <Button size="small" type="text" disabled={i === tiers.length - 1} onClick={() => moveTier(i, 1)}>↓</Button>
                        <Button size="small" type="text" danger onClick={() => setTiers(tiers.filter((_: any, j: number) => j !== i))}>✕</Button>
                      </Space>
                    </div>
                    <EditTable rows={tier} onChange={(v) => setTiers(tiers.map((t: any, j: number) => (j === i ? v : t)))} newRow={() => ({ field: '', op: 'eq', value: '' })} addLabel={tt('Thêm điều kiện')} columns={condCols()} />
                  </div>
                ))}
                <Button size="small" type="dashed" onClick={() => setTiers([...tiers, []])}>＋ {tt('Thêm bậc ưu tiên')}</Button>
              </div>
            </SettingRow>
            <SettingRow label={tt('Nổ đệ quy (self-join)')} hint={tt('BOM/combo nhiều cấp trong bước này: mỗi dòng con lại tra tiếp bảng config. Tắt = 1 cấp.')}>
              <Checkbox checked={!!step.recurse} onChange={(e) => onChange({ recurse: e.target.checked })} />
            </SettingRow>
            {step.recurse ? (
              <div style={{ border: `1px solid ${token.colorPrimaryBorder || token.colorBorder}`, borderRadius: 8, padding: '10px 12px', margin: '2px 0 6px', background: token.colorFillQuaternary }}>
                <SettingRow label={tt('Khoá cha (trên bảng config)')} hint={tt('Cột trên bảng config đóng vai "cha" của một dòng — khoá self-join. VD combo_id.')}>
                  <FieldSelect api={api} collection={step.ruleCollection || undefined} value={step.recurseParentKey || ''} onChange={(v) => onChange({ recurseParentKey: v })} placeholder={tt('vd combo_id')} size="middle" style={{ width: '100%' }} />
                </SettingRow>
                <SettingRow label={tt('Component (cột sinh ra → khoá cha cấp sau)')} hint={tt('Cột SINH RA chứa id linh kiện; giá trị của nó thành "khoá cha" cấp sau. VD product_id.')}>
                  <FieldSelect api={api} collection={outputCollection} value={step.recurseChildKey || ''} onChange={(v) => onChange({ recurseChildKey: v })} placeholder={tt('vd product_id')} size="middle" style={{ width: '100%' }} />
                </SettingRow>
                <SettingRow label={tt('Cột số lượng (nhân dồn xuống)')} hint={tt('Cột SINH RA chứa số lượng, nhân dồn theo cây. Công thức nên đọc src.<cột này>. VD qty.')}>
                  <FieldSelect api={api} collection={outputCollection} value={step.recurseQtyField || ''} onChange={(v) => onChange({ recurseQtyField: v })} placeholder={tt('vd qty')} size="middle" style={{ width: '100%' }} />
                </SettingRow>
                <SettingRow label={tt('Độ sâu tối đa')}><InputNumber min={1} max={100} value={step.maxDepth ?? 20} onChange={(v) => onChange({ maxDepth: v ?? 20 })} /></SettingRow>
                <SettingRow label={tt('Xuất ra')}>
                  <SegmentedGroup block style={{ border: `1px solid ${token.colorBorder}`, width: '100%' }} value={step.recurseOutput || 'leaves'} onChange={(v: any) => onChange({ recurseOutput: v })}
                    options={[{ value: 'leaves', label: tt('Chỉ lá (NVL gốc)') }, { value: 'all', label: tt('Mọi cấp') }]} />
                </SettingRow>
              </div>
            ) : null}
          </>
        )}

        <div style={{ height: 1, background: token.colorBorderSecondary, margin: '10px 0 8px' }} />
        <SettingRow layout="vertical" label={tt('Cột sinh ra của bước này')} hint={tt('Mỗi dòng = 1 cột trên dòng output của bước. Output bước này = input bước sau (đọc qua src.*). Đọc parent / src (dòng vào) / rule (dòng phải) + REL / NUM / YMONTH.')}>
          <EditTable rows={step.lineOutputs || []} onChange={(v) => onChange({ lineOutputs: v })} addLabel={tt('Thêm cột')} newRow={() => ({ targetField: '', formula: '', required: false })}
            columns={[
              { title: tt('Cột đích'), key: 'targetField', width: 220, render: (row, patch) => <FieldSelect api={api} collection={outputCollection} value={row.targetField} onChange={(v) => patch({ targetField: v })} placeholder={tt('cột đích')} size="middle" style={{ width: '100%' }} /> },
              { title: tt('Công thức'), key: 'formula', render: (row, patch) => <Input size="middle" style={{ ...mono, width: '100%' }} value={row.formula} onChange={(e) => patch({ formula: e.target.value })} onFocus={trackFocus} placeholder={tt('công thức')} /> },
              { title: tt('Bắt buộc'), key: 'required', width: 84, align: 'center', render: (row, patch) => <Tooltip title={tt('Bắt buộc — null thì bỏ dòng')}><Checkbox checked={!!row.required} onChange={(e) => patch({ required: e.target.checked })} /></Tooltip> },
            ]} />
        </SettingRow>
        <SettingRow label={tt('Gộp theo bước (tuỳ chọn)')} hint={tt('Gộp output của bước này trước khi sang bước sau (cột số cộng dồn). Thường chỉ cần gộp ở KẾT QUẢ cuối.')}>
          <Space wrap>
            <FieldMultiSelect api={api} collection={outputCollection} value={step.groupBy || undefined} onChange={(v) => onChange({ groupBy: v })} placeholder={tt('vd material_id')} style={{ width: 200 }} />
            <FieldMultiSelect api={api} collection={outputCollection} value={step.sumFields} onChange={(v) => onChange({ sumFields: v })} placeholder={tt('cột cộng dồn')} style={{ width: 200 }} />
          </Space>
        </SettingRow>
      </div>
    );
  };

  const EditorDrawer: React.FC<{
    api: any; open: boolean; initial: LineGenConfig; collections: any[]; existingKeys: Set<string>; onClose: () => void; onSaved: () => void;
  }> = ({ api, open, initial, collections, existingKeys, onClose, onSaved }) => {
    const { token } = theme.useToken();
    const [cfg, setCfg] = useState<LineGenConfig>(initial);
    const [saving, setSaving] = useState(false);
    const [records, setRecords] = useState<any[]>([]);
    const [sampleTk, setSampleTk] = useState<any>(undefined);
    const [preview, setPreview] = useState<RunResult | null>(null);
    const [previewing, setPreviewing] = useState(false);
    const [askClose, setAskClose] = useState(false);
    // LEFT source mode: 'self' (parent record) vs 'relation' (a hasMany). Kept in UI state so the relation
    // picker can show BEFORE a relation is picked; derived from sourceLinesPath on open / template load.
    const [srcMode, setSrcMode] = useState<'self' | 'relation'>('self');

    // Baseline of the config as it was opened — used to detect unsaved edits so closing can warn.
    const baselineRef = useRef('');
    useEffect(() => {
      const m = migrateConfig(initial);
      setCfg(m); baselineRef.current = JSON.stringify(m);
      setSrcMode(m.sourceLinesPath ? 'relation' : 'self');
      setPreview(null); setSampleTk(undefined); setAskClose(false);
    }, [initial, open]);
    const set = (patch: Partial<LineGenConfig>) => setCfg((p) => ({ ...p, ...patch }));
    const dirty = JSON.stringify(cfg) !== baselineRef.current;
    // Guarded close (X button + Escape both route here): warn if there are unsaved changes.
    const requestClose = () => { if (dirty) setAskClose(true); else onClose(); };

    // "＋ Chèn cột" (like the other @tuanla90 plugins): pickers insert dot tokens (parent.x.y / rule.x /
    // src.x) into the LAST-FOCUSED formula input. Insertion goes through the native value setter +
    // an `input` event so React's controlled onChange fires with the new value.
    const lastFormulaEl = useRef<HTMLInputElement | null>(null);
    const trackFocus = (e: React.FocusEvent) => { lastFormulaEl.current = e.target as HTMLInputElement; };
    const insertToken = (tok: string) => {
      const el = lastFormulaEl.current;
      if (!el || !document.body.contains(el)) { message.info(tt('Bấm vào ô công thức trước, rồi chèn cột')); return; }
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? start;
      const next = el.value.slice(0, start) + tok + el.value.slice(end);
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      setter?.call(el, next);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.focus();
      try { el.setSelectionRange(start + tok.length, start + tok.length); } catch (_) { /* ignore */ }
    };
    // Inserting parent.<rel>.<field> only works if the relation is preloaded — add it automatically.
    const ensurePreload = (path: string[]) => {
      if (path.length < 2) return;
      const prefix = path.slice(0, -1).join('.');
      const covered = (cfg.preload || []).some((p) => p === prefix || p.startsWith(prefix + '.'));
      if (!covered) set({ preload: [...(cfg.preload || []), prefix] });
    };

    // Relations of the source collection → target picker; picking one auto-fills targetForeignKey.
    const srcFields = useCollectionFields(api, cfg.sourceCollection || undefined);
    const relOptions = srcFields.filter((f) => ['hasMany', 'belongsToMany'].includes(f.type))
      .map((f) => ({ value: f.name, label: fieldLabel(f), target: f.target, foreignKey: f.foreignKey }));
    const targetCollection = relOptions.find((r) => r.value === cfg.targetPath)?.target;
    // op-by-type (nested) for EVERY rule-side condition surface: base ruleWhere + every matchTiers tier.
    const ruleCondTypes = useResolvedTypes(api, cfg.ruleCollection || undefined, [
      ...(cfg.ruleWhere || []).map((r) => r.field),
      ...(([] as any[]).concat(...(cfg.matchTiers || [])).map((r: any) => r.field)),
    ].filter(Boolean) as string[]);
    const srcLinesCollection = relOptions.find((r) => r.value === cfg.sourceLinesPath)?.target; // "bảng dòng nguồn"

    // ---- JOIN builder helpers (FEATURE C) --------------------------------------------------------
    // The rule/tier condition grid — reused by the BASE ruleWhere AND every matchTiers tier. A condition
    // is "rule column op value", where value is typed: true / NV / parent.x / src.x (see resolveWhereValue).
    const ruleCondColumns = () => ([
      { title: tt('Cột quy tắc'), key: 'field', render: (row: any, patch: any) => <CondFieldCascader api={api} collection={cfg.ruleCollection || undefined} value={row.field} onPick={(p: string, t?: string) => { const ops = opsForType(t).map((o) => o.value); patch({ field: p, ...(row.op && !ops.includes(row.op) ? { op: 'eq' } : {}) }); }} placeholder={tt('cột quy tắc')} /> },
      { title: tt('Toán tử'), key: 'op', width: 96, render: (row: any, patch: any) => <Select size="middle" style={{ width: '100%' }} value={row.op || 'eq'} onChange={(v) => patch({ op: v })} options={opsForType(ruleCondTypes[row.field])} /> },
      { title: tt('Giá trị'), key: 'value', render: (row: any, patch: any) => isDateType(ruleCondTypes[row.field])
        ? <Input type="date" size="middle" style={{ width: '100%' }} value={String(row.value ?? '')} onChange={(e) => patch({ value: e.target.value })} onFocus={trackFocus} />
        : <Input size="middle" style={{ width: '100%' }} value={row.value ?? ''} onChange={(e) => patch({ value: e.target.value })} onFocus={trackFocus} placeholder={tt('gõ: true, NV, parent.x, src.x')} /> },
    ]);

    // matchTiers ladder ops.
    const tiers = cfg.matchTiers || [];
    const setTiers = (next: any[][]) => set({ matchTiers: next });
    const moveTier = (i: number, dir: -1 | 1) => { const j = i + dir; if (j < 0 || j >= tiers.length) return; const next = tiers.map((t) => t); [next[i], next[j]] = [next[j], next[i]]; setTiers(next); };
    const tierLabel = (i: number, n: number) => (i === 0 ? tt('cụ thể nhất') : i === n - 1 ? tt('chung/dự phòng') : tt('bậc giữa'));

    // ---- v0.8 PIPELINE (joinSteps) helpers -------------------------------------------------------
    // pipeline mode is derived from the presence of joinSteps. The single-join layout (③④⑤) shows when it
    // is off; the step-card list replaces ③④ + the outputs of ⑤ when it is on.
    const pipeline = !!(cfg.joinSteps && cfg.joinSteps.length);
    const steps = cfg.joinSteps || [];
    const patchStep = (i: number, patch: any) => set({ joinSteps: steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
    const moveStep = (i: number, dir: -1 | 1) => { const j = i + dir; if (j < 0 || j >= steps.length) return; const next = steps.slice(); [next[i], next[j]] = [next[j], next[i]]; set({ joinSteps: next }); };
    const removeStep = (i: number) => set({ joinSteps: steps.filter((_, j) => j !== i) });
    const addStep = () => set({ joinSteps: [...steps, newJoinStep()] });
    // Convert the current single-join into joinSteps[0] (preserve the user's work), then run as a pipeline.
    const toPipeline = () => {
      if (steps.length) return;
      const s0: any = {
        stepType: 'config', ruleCollection: cfg.ruleCollection || '', ruleAppends: cfg.ruleAppends,
        ruleWhere: cfg.ruleWhere || [], matchTiers: cfg.matchTiers, deriveVars: cfg.deriveVars, skipIf: cfg.skipIf,
        lineOutputs: (cfg.lineOutputs && cfg.lineOutputs.length) ? cfg.lineOutputs : [{ targetField: '', formula: '', required: false }],
        recurse: cfg.recurse, recurseParentKey: cfg.recurseParentKey, recurseChildKey: cfg.recurseChildKey,
        recurseQtyField: cfg.recurseQtyField, maxDepth: cfg.maxDepth, recurseOutput: cfg.recurseOutput,
      };
      set({ joinSteps: [s0] });
    };
    // Collapse back to a single join: fold joinSteps[0] into the top-level fields, drop the pipeline.
    const toSingle = () => {
      const s0: any = steps[0] || {};
      set({
        joinSteps: undefined,
        ruleCollection: s0.ruleCollection ?? cfg.ruleCollection, ruleAppends: s0.ruleAppends ?? cfg.ruleAppends,
        ruleWhere: s0.ruleWhere ?? cfg.ruleWhere ?? [], matchTiers: s0.matchTiers, deriveVars: s0.deriveVars, skipIf: s0.skipIf,
        lineOutputs: (s0.lineOutputs && s0.lineOutputs.length) ? s0.lineOutputs : (cfg.lineOutputs || [{ targetField: '', formula: '', required: false }]),
        recurse: s0.recurse, recurseParentKey: s0.recurseParentKey, recurseChildKey: s0.recurseChildKey,
        recurseQtyField: s0.recurseQtyField, maxDepth: s0.maxDepth, recurseOutput: s0.recurseOutput,
      });
    };

    // "SQL tương đương" — a read-only caption so the config reads like the JOIN(s) it is.
    const leftName = cfg.sourceLinesPath ? `${cfg.sourceCollection || '?'} ▸ ${cfg.sourceLinesPath}` : (cfg.sourceCollection || 'nguồn');
    const condSql = (list: any[]) => (list || []).filter((w) => w && w.field).map((w) => { const opm: any = { eq: '=', ne: '<>', gt: '>', lt: '<', gte: '>=', lte: '<=', contains: 'LIKE' }; return `R.${w.field} ${opm[w.op || 'eq'] || '='} ${/^(parent|src)\b/.test(String(w.value || '')) ? String(w.value).replace(/^parent/, 'L').replace(/^src/, 'L') : JSON.stringify(w.value ?? '')}`; }).join(' AND ');
    const joinSql = (() => {
      if (pipeline) {
        // Multi-JOIN / chained form: LEFT ⋈ step1 ⋈ step2 … ; output of step i is the input (src) of i+1.
        let s = `FROM ${leftName} L0`;
        steps.forEach((st: any, i: number) => {
          const on = condSql(st.ruleWhere || []) || '1=1';
          const right = (st.stepType === 'relation') ? `L${i}.${st.relationPath || '(quan hệ)'}` : `${st.ruleCollection || '(config)'}`;
          s += `\n${st.recurse ? 'JOIN RECURSIVE' : 'JOIN'} ${right} R${i + 1} ON ${st.stepType === 'relation' ? '(FK)' : on}  -- → src(bước ${i + 2 <= steps.length ? i + 2 : '→KQ'})`;
          if (st.recurse && st.recurseParentKey && st.recurseChildKey) s += `\n  ↻ next: R${i + 1}.${st.recurseParentKey} = child.${st.recurseChildKey}`;
        });
        if (cfg.groupBy && cfg.groupBy.length) s += `\nGROUP BY ${cfg.groupBy.join(', ')}`;
        return s;
      }
      if (!cfg.ruleCollection) return '';
      const on = condSql(cfg.ruleWhere || []) || '1=1';
      let s = `FROM ${leftName} L\n${cfg.recurse ? 'JOIN RECURSIVE' : 'JOIN'} ${cfg.ruleCollection} R ON ${on}`;
      if (cfg.recurse && cfg.recurseParentKey && cfg.recurseChildKey) s += `\n  ↻ next: R.${cfg.recurseParentKey} = child.${cfg.recurseChildKey}`;
      if (tiers.length) s += `\n  PRIORITY: ${tiers.map((t, i) => `[${i + 1}] ${condSql(t) || '…'}`).join(' ELSE ')}`;
      if (cfg.groupBy && cfg.groupBy.length) s += `\nGROUP BY ${cfg.groupBy.join(', ')}`;
      return s;
    })();

    // Prominent shared formula toolbar (point 5): inserts a parent./src./rule. column token into whatever
    // formula input was last focused — used by sections 2 (skipIf), 3 (rule filter value) and 4 (all formulas).
    const FormulaToolbar = (
      <div style={{ position: 'sticky', top: 0, zIndex: 5, background: token.colorBgContainer, border: `1px solid ${token.colorBorderSecondary}`, borderRadius: 8, padding: '10px 14px', marginBottom: 14, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 8 }}>{tt('Công cụ công thức — chèn cột vào ô đang chọn')}</div>
        <Space size={12} wrap>
          <FieldPickerCascader api={api} collectionName={cfg.sourceCollection || undefined} includeToMany
            label={tt('＋ Cột của cha (parent)')} onPick={(path: string[]) => { ensurePreload(path); insertToken('parent.' + path.join('.')); }} />
          {cfg.sourceLinesPath ? (
            <FieldPickerCascader api={api} collectionName={srcLinesCollection} includeToMany
              label={tt('＋ Cột dòng nguồn (src)')} onPick={(path: string[]) => { if (path.length > 1) set({ srcAppends: [...new Set([...(cfg.srcAppends || []), path.slice(0, -1).join('.')])] }); insertToken('src.' + path.join('.')); }} />
          ) : null}
          <FieldPickerCascader api={api} collectionName={cfg.ruleCollection || undefined} includeToMany
            label={tt('＋ Cột quy tắc (rule)')} onPick={(path: string[]) => insertToken('rule.' + path.join('.'))} />
        </Space>
        <div style={{ fontSize: 11.5, color: token.colorTextTertiary, marginTop: 6 }}>{tt('Bấm vào ô công thức bất kỳ, rồi chọn cột — token dạng parent.responsible_staff.direct_manager.id được chèn tại con trỏ (null giữa đường tự ra null).')}</div>
      </div>
    );

    // Key is INTERNAL now (user feedback): auto-generated on create (template key or title slug),
    // uniquified against existing keys, and NEVER editable afterwards — it is the ownership stamp
    // (_genRule) on generated rows, so immutability keeps old rows attached to their generator.
    const autoKey = (c: LineGenConfig): string => {
      if ((initial as any).__id) return c.key; // existing generator: key is frozen
      const base = (c.key && c.key.trim()) || slugify(c.title || '') || 'bo-sinh';
      let k = base;
      let i = 2;
      while (existingKeys.has(k)) k = `${base}-${i++}`;
      return k;
    };

    useEffect(() => {
      let live = true;
      if (!cfg.sourceCollection) { setRecords([]); return; }
      api?.request({ url: `${cfg.sourceCollection}:list`, params: { pageSize: 20, sort: ['-id'] } })
        .then((r: any) => { if (live) { const rows = r?.data?.data || []; setRecords(rows); setSampleTk((prev: any) => prev ?? rows[0]?.id); } })
        .catch(() => live && setRecords([]));
      return () => { live = false; };
    }, [api, cfg.sourceCollection]);

    const cleanConfig = (): LineGenConfig => {
      const c: any = { ...cfg };
      if ((c.ruleSource || 'collection') === 'inline') {
        delete c.ruleCollection; delete c.matchMap; delete c.ruleFilter; delete c.ruleWhere; delete c.ruleAppends;
        c.scopes = (c.scopes || []).map((s: any) => ({ ...s, rules: (s.rules || []).filter((r: any) => Object.keys(r).length) }));
      } else {
        delete c.ruleSource; delete c.ruleFields; delete c.scopes;
        // v0.6 unified rule filter: the UI keeps ruleWhere — drop the legacy matchMap/ruleFilter entirely
        // so old + new never coexist (the server would otherwise still honour the legacy path).
        delete c.matchMap; delete c.ruleFilter;
        if (Array.isArray(c.ruleWhere)) c.ruleWhere = c.ruleWhere.filter((r: any) => r && r.field);
      }
      if (!c.sourceLinesPath) delete c.srcAppends; // src appends only make sense with a source-lines table
      const dropEmptyArr = ['ruleWhere', 'deriveVars', 'preload', 'srcAppends', 'ruleAppends', 'groupBy', 'sumFields', 'guard', 'parentUpdates', 'ruleFields', 'scopes'];
      for (const k of dropEmptyArr) if (Array.isArray(c[k]) && !c[k].length) delete c[k];
      const dropEmptyStr = ['sourceLinesPath', 'skipIf', 'runVersionSource', 'targetForeignKey', 'markerField', 'hashField'];
      for (const k of dropEmptyStr) if (!c[k]) delete c[k];
      if (c.rounding && (!c.rounding.fields || !c.rounding.fields.length)) delete c.rounding;
      if (c.validations && !c.validations.sumField) delete c.validations;
      // v0.7 FEATURE A — priority tiers: drop blank conditions + empty tiers; remove the key if none remain.
      if (Array.isArray(c.matchTiers)) {
        c.matchTiers = c.matchTiers.map((t: any) => (Array.isArray(t) ? t.filter((w: any) => w && w.field) : [])).filter((t: any[]) => t.length);
        if (!c.matchTiers.length) delete c.matchTiers;
      }
      // v0.7 FEATURE B — recursion: keep the recurse block only when enabled; strip it entirely otherwise
      // (absent ⇒ single-pass = back-compat).
      if (!c.recurse) {
        for (const k of ['recurse', 'recurseParentKey', 'recurseChildKey', 'recurseQtyField', 'maxDepth', 'recurseOutput']) delete c[k];
      } else {
        for (const k of ['recurseParentKey', 'recurseChildKey', 'recurseQtyField', 'recurseOutput']) if (!c[k]) delete c[k];
        if (c.maxDepth == null) delete c.maxDepth;
      }
      // v0.8 PIPELINE (joinSteps): clean each step; in pipeline mode the single-join TOP-LEVEL join fields are
      // unused (each step carries its own RIGHT/ON/recurse/outputs) → strip them so the two never coexist.
      if (Array.isArray(c.joinSteps) && c.joinSteps.length) {
        const cleanStep = (st0: any): any => {
          const st: any = { ...(st0 || {}) };
          st.stepType = st.stepType === 'relation' ? 'relation' : 'config';
          if (st.stepType === 'relation') delete st.ruleCollection; else delete st.relationPath;
          if (Array.isArray(st.ruleWhere)) st.ruleWhere = st.ruleWhere.filter((r: any) => r && r.field);
          if (Array.isArray(st.matchTiers)) {
            st.matchTiers = st.matchTiers.map((t: any) => (Array.isArray(t) ? t.filter((w: any) => w && w.field) : [])).filter((t: any[]) => t.length);
            if (!st.matchTiers.length) delete st.matchTiers;
          }
          if (Array.isArray(st.lineOutputs)) st.lineOutputs = st.lineOutputs.filter((o: any) => o && (o.targetField || o.formula));
          for (const k of ['ruleWhere', 'ruleAppends', 'deriveVars', 'groupBy', 'sumFields']) if (Array.isArray(st[k]) && !st[k].length) delete st[k];
          if (!st.skipIf) delete st.skipIf;
          if (!st.recurse) {
            for (const k of ['recurse', 'recurseParentKey', 'recurseChildKey', 'recurseQtyField', 'maxDepth', 'recurseOutput']) delete st[k];
          } else {
            for (const k of ['recurseParentKey', 'recurseChildKey', 'recurseQtyField', 'recurseOutput']) if (!st[k]) delete st[k];
            if (st.maxDepth == null) delete st.maxDepth;
          }
          return st;
        };
        c.joinSteps = c.joinSteps.map(cleanStep);
        for (const k of ['ruleCollection', 'ruleWhere', 'ruleAppends', 'matchTiers', 'deriveVars', 'skipIf', 'lineOutputs', 'recurse', 'recurseParentKey', 'recurseChildKey', 'recurseQtyField', 'maxDepth', 'recurseOutput', 'ruleSource', 'ruleFields', 'scopes', 'matchMap', 'ruleFilter']) delete c[k];
        if (c.maxRows == null) delete c.maxRows;
      } else {
        delete c.joinSteps;
        delete c.maxRows;
      }
      if (!c.regenPolicy) c.regenPolicy = 'append'; // v0.4: append-only from the UI
      return c;
    };

    const runPreview = async () => {
      if (sampleTk == null) return message.warning(tt('Chọn bản ghi để chạy thử'));
      setPreviewing(true);
      try { setPreview(await previewInline(api, cleanConfig(), sampleTk)); }
      catch (e: any) { setPreview({ ok: false, error: e?.message || 'error' }); }
      finally { setPreviewing(false); }
    };

    const save = async () => {
      const c = cleanConfig();
      if (!c.title?.trim()) return message.warning(tt('Nhập tên'));
      c.key = autoKey(c);
      if (!c.sourceCollection) return message.warning(tt('Chọn bảng nguồn'));
      if (!c.targetPath) return message.warning(tt('Chọn nơi ghi kết quả'));
      const pipe = Array.isArray((c as any).joinSteps) && (c as any).joinSteps.length;
      if (pipe) {
        const js = (c as any).joinSteps as any[];
        if (!js.every((s) => (s.lineOutputs || []).length)) return message.warning(tt('Mỗi bước join cần ít nhất 1 cột sinh ra'));
        if (!js.every((s) => (s.stepType === 'relation' ? s.relationPath : s.ruleCollection))) return message.warning(tt('Mỗi bước join cần chọn bảng config hoặc quan hệ'));
      } else {
        if (!c.lineOutputs?.length) return message.warning(tt('Thêm ít nhất 1 cột sinh ra'));
        if (c.ruleSource === 'inline' && !(c.scopes || []).some((s: any) => (s.rules || []).length)) return message.warning(tt('Thêm ít nhất 1 nhóm quy tắc có quy tắc'));
        if (c.ruleSource !== 'inline' && !c.ruleCollection) return message.warning(tt('Chọn bảng quy tắc'));
      }
      setSaving(true);
      try {
        const existingId = (initial as any).__id;
        if (existingId) await api.request({ url: `${RULES_COLLECTION}:update`, method: 'post', params: { filterByTk: existingId }, data: { config: c } });
        else await api.request({ url: `${RULES_COLLECTION}:create`, method: 'post', data: { config: c } });
        message.success(tt('Đã lưu'));
        onSaved();
      } catch (e: any) {
        message.error(e?.response?.data?.errors?.[0]?.message || e?.message || tt('Lưu thất bại'));
      } finally { setSaving(false); }
    };

    const lines = preview?.lines || [];
    const HIDDEN = new Set(['_genRule', '_genHash']);
    const cols = Array.from(lines.reduce((s, r) => { Object.keys(r).forEach((k) => !HIDDEN.has(k) && s.add(k)); return s; }, new Set<string>()));
    const previewColumns = cols.map((c) => ({ title: c, dataIndex: c, key: c, ellipsis: true, render: (v: any) => disp(v) }));

    const mono = { fontFamily: 'monospace', fontSize: 12.5 } as React.CSSProperties;

    return (
      <Drawer
        title={(initial as any).__id ? tt('Sửa bộ sinh') : tt('Bộ sinh mới')}
        open={open} onClose={requestClose} width="100%" destroyOnClose keyboard maskClosable={false}
        extra={<Space>
          <Select style={{ width: 240 }} placeholder={tt('Nạp mẫu…')} value={undefined}
            options={TEMPLATES.map((t, i) => ({ value: i, label: t.label }))}
            onChange={(i: number) => setCfg(JSON.parse(JSON.stringify(TEMPLATES[i].config)))} />
          <Button type="primary" loading={saving} onClick={save}>{tt('Lưu')}</Button>
        </Space>}
      >
        <div style={{ display: 'flex', height: '100%' }}>
          <div style={{ flex: '0 0 56%', maxWidth: 900, overflowY: 'auto', padding: '4px 18px 24px' }}>

            {FormulaToolbar}

            {/* JOIN banner: single-join reads LEFT ⋈ RIGHT → KẾT QUẢ; pipeline reads LEFT ⋈ B1 ⋈ B2 … → KẾT QUẢ. */}
            <div style={{ border: `1px solid ${token.colorBorderSecondary}`, borderRadius: 8, padding: '12px 14px', marginBottom: 14, background: token.colorFillQuaternary }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 10 }}>{pipeline ? tt('Bộ sinh = một PIPELINE nhiều bước JOIN: LEFT (nguồn) ⋈ B1 ⋈ B2 … → KẾT QUẢ (output bước N = input bước N+1)') : tt('Bộ sinh = một phép JOIN: LEFT (nguồn) ⋈ RIGHT (định mức) theo ĐIỀU KIỆN NỐI → KẾT QUẢ')}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 110, textAlign: 'center', border: `1px solid ${token.colorBorder}`, borderRadius: 6, padding: '8px 6px', background: token.colorBgContainer }}>
                  <div style={{ fontSize: 11, color: token.colorTextTertiary }}>{tt('LEFT · nguồn')}</div>
                  <div style={{ fontWeight: 600, fontSize: 12.5, wordBreak: 'break-all' }}>{leftName}</div>
                </div>
                {pipeline ? (
                  steps.map((st: any, i: number) => (
                    <React.Fragment key={i}>
                      <div style={{ fontSize: 18, color: token.colorTextSecondary }}>⋈</div>
                      <div style={{ position: 'relative', flex: 1, minWidth: 110, textAlign: 'center', border: `1px solid ${st.recurse ? token.colorPrimary : token.colorBorder}`, borderRadius: 6, padding: '8px 6px', background: token.colorBgContainer }}>
                        <div style={{ fontSize: 11, color: token.colorTextTertiary }}>{tt('Bước {{n}}', { n: i + 1 })}{st.stepType === 'relation' ? ' · →' : ''}</div>
                        <div style={{ fontWeight: 600, fontSize: 12.5, wordBreak: 'break-all' }}>{st.stepType === 'relation' ? (st.relationPath || tt('(quan hệ)')) : (st.ruleCollection || tt('(bảng config)'))}</div>
                        {st.recurse ? <div title={tt('nổ đệ quy (self-join)')} style={{ position: 'absolute', top: -9, right: -9, background: token.colorPrimary, color: '#fff', borderRadius: 10, fontSize: 11, padding: '1px 7px', fontWeight: 600 }}>↻</div> : null}
                      </div>
                    </React.Fragment>
                  ))
                ) : (
                  <>
                    <div style={{ fontSize: 18, color: token.colorTextSecondary }}>⋈</div>
                    <div style={{ position: 'relative', flex: 1, minWidth: 120, textAlign: 'center', border: `1px solid ${cfg.recurse ? token.colorPrimary : token.colorBorder}`, borderRadius: 6, padding: '8px 6px', background: token.colorBgContainer }}>
                      <div style={{ fontSize: 11, color: token.colorTextTertiary }}>{tt('RIGHT · định mức')}</div>
                      <div style={{ fontWeight: 600, fontSize: 12.5, wordBreak: 'break-all' }}>{cfg.ruleCollection || tt('(bảng quy tắc)')}</div>
                      {cfg.recurse ? <div title={tt('nổ đệ quy (self-join)')} style={{ position: 'absolute', top: -9, right: -9, background: token.colorPrimary, color: '#fff', borderRadius: 10, fontSize: 11, padding: '1px 7px', fontWeight: 600 }}>↻ {tt('đệ quy')}</div> : null}
                    </div>
                  </>
                )}
                <div style={{ fontSize: 18, color: token.colorTextSecondary }}>→</div>
                <div style={{ flex: 1, minWidth: 110, textAlign: 'center', border: `1px solid ${token.colorBorder}`, borderRadius: 6, padding: '8px 6px', background: token.colorBgContainer }}>
                  <div style={{ fontSize: 11, color: token.colorTextTertiary }}>{tt('→ KẾT QUẢ')}</div>
                  <div style={{ fontWeight: 600, fontSize: 12.5, wordBreak: 'break-all' }}>{cfg.targetPath || tt('(bảng con)')}</div>
                </div>
              </div>
              {joinSql ? <pre style={{ margin: '10px 0 0', padding: 8, fontSize: 11, lineHeight: 1.5, background: token.colorBgContainer, border: `1px solid ${token.colorBorderSecondary}`, borderRadius: 4, overflow: 'auto', whiteSpace: 'pre', color: token.colorTextSecondary }}>{tt('SQL tương đương')}:{'\n'}{joinSql}</pre> : null}
            </div>

            <CollapsibleSection title={tt('① Kích hoạt — bảng cha (parent), khi nào chạy')}>
              <div style={{ fontSize: 12, color: token.colorTextTertiary, margin: '0 0 10px' }}>{tt('Bảng cha = bản ghi đặt nút / lắng trigger. Trong mọi công thức, bản ghi này được gọi là parent (vd parent.shipping_type).')}</div>
              <SettingRow label={tt('Tên')} hint={tt('Tên hiển thị trong danh sách và trên menu nút.')}><Input value={cfg.title} onChange={(e) => set({ title: e.target.value })} placeholder={tt('VD: Tính hoa hồng đơn hàng')} /></SettingRow>
              <SettingRow label={tt('Bảng kích hoạt (cha)')} hint={tt('Nơi đặt nút / lắng trigger. Mỗi bản ghi của bảng này là một "cha" — công thức đọc nó qua parent.*')}><Select style={{ width: '100%' }} showSearch optionFilterProp="label" options={collections} value={cfg.sourceCollection || undefined} onChange={(v) => set({ sourceCollection: v, targetPath: '', targetForeignKey: '', sourceLinesPath: null })} placeholder={tt('Chọn bảng')} /></SettingRow>
              <SettingRow layout="vertical" label={tt('Nạp kèm quan hệ của bảng cha (preload)')} hint={tt('Quan hệ của BẢNG CHA mà công thức cần đọc (parent.*). Chọn quan hệ (xổ nhiều cấp) — nạp toàn bộ cột của các object trên đường đi.')}>
                <RelationAppendsPicker api={api} collectionName={cfg.sourceCollection || undefined} value={cfg.preload} onChange={(v) => set({ preload: v })} />
              </SettingRow>
              <SettingRow label={tt('Bật')}><Checkbox checked={cfg.enabled} onChange={(e) => set({ enabled: e.target.checked })} /></SettingRow>
              <SettingRow label={tt('Kích hoạt')} hint={tt('Bấm nút: người dùng chủ động chạy trên từng bản ghi. Tự động: server tự chạy ngay khi bản ghi đạt điều kiện (lưu là chạy, không cần nút — kiểu AI Column).')}>
                <SegmentedGroup
                  block
                  style={{ border: `1px solid ${token.colorBorder}`, width: '100%' }}
                  value={cfg.trigger || 'manual'}
                  onChange={(v: any) => set({ trigger: v })}
                  options={[
                    { value: 'manual', label: tt('Bấm nút') },
                    { value: 'auto', label: tt('Tự động khi đạt điều kiện') },
                  ]}
                />
              </SettingRow>
              <SettingRow layout="vertical"
                label={tt('Điều kiện kích hoạt (auto / mặc định)')}
                hint={(cfg.trigger || 'manual') === 'auto'
                  ? tt('Bản ghi được lưu mà thoả các điều kiện này là tự sinh dòng. QUAN TRỌNG: thêm "cập nhật bản ghi cha" đánh dấu đã chạy (vd is_commission_created = true) để chỉ chạy 1 lần — bỏ dấu đó đi chính là cách chạy lại.')
                  : tt('Điều kiện mặc định khi chạy: chưa thoả thì hộp thoại cảnh báo và hỏi xác nhận trước khi vẫn sinh. Nút bấm KHÔNG còn tự ẩn theo điều kiện này — ẩn/hiện nút chỉnh bằng linkage rules của chính nút (như nút core). VD status = Đã thanh lý VÀ is_commission_created = false.')}>
                <CondList api={api} collection={cfg.sourceCollection || undefined} items={cfg.guard || []} onChange={(v) => set({ guard: v })} />
              </SettingRow>
              <SettingRow layout="vertical" label={tt('Sau khi chạy thành công, cập nhật bản ghi cha (post)')} hint={tt('Chạy trong cùng transaction. Luôn CHỈ THÊM dòng mới (không xoá) — nên đánh cờ ở đây (vd is_commission_created = true) để điều kiện phía trên chặn chạy trùng; xoá dòng cũ (nếu cần) là việc của người dùng.')}>
                <EditTable rows={cfg.parentUpdates || []} onChange={(v) => set({ parentUpdates: v })} addLabel={tt('Thêm cập nhật')} newRow={() => ({ targetField: '', formula: '' })}
                  columns={[
                    { title: tt('Cột trên cha'), key: 'targetField', width: 240, render: (row, patch) => <FieldSelect api={api} collection={cfg.sourceCollection || undefined} value={row.targetField} onChange={(v) => patch({ targetField: v })} placeholder={tt('cột trên cha')} size="middle" style={{ width: '100%' }} /> },
                    { title: tt('Công thức'), key: 'formula', render: (row, patch) => <Input size="middle" style={{ ...mono, width: '100%' }} value={row.formula} onChange={(e) => patch({ formula: e.target.value })} onFocus={trackFocus} placeholder={tt('công thức, vd true')} /> },
                  ]} />
              </SettingRow>
            </CollapsibleSection>

            <CollapsibleSection title={tt('② LEFT · Nguồn — nhân theo dòng nào (src)')}>
              <SettingRow label={tt('Lấy dòng nguồn từ')} hint={tt('LEFT của phép JOIN: cái đem NHÂN với bảng định mức. "Chính bản ghi này" = 1 dòng (hoa hồng: 15 quy tắc → 15 dòng). "Đi theo quan hệ" = nhân theo TỪNG DÒNG bảng con (BOM: mỗi dòng sản phẩm × định mức của nó); công thức đọc dòng qua src.*, và src.* tự về parent.* khi chọn chính bản ghi.')}>
                <SegmentedGroup block style={{ border: `1px solid ${token.colorBorder}`, width: '100%' }}
                  value={srcMode}
                  onChange={(v: any) => { setSrcMode(v); if (v === 'self') set({ sourceLinesPath: null, srcAppends: [] }); }}
                  options={[
                    { value: 'self', label: tt('Chính bản ghi này') },
                    { value: 'relation', label: tt('Đi theo quan hệ →') },
                  ]} />
              </SettingRow>
              {srcMode === 'relation' ? (
                <SettingRow label={tt('Quan hệ bảng con (src)')} hint={tt('Quan hệ hasMany trên bảng cha — mỗi dòng của nó là một src. VD order_lines.')}>
                  <Select style={{ width: '100%' }} allowClear options={relOptions} value={cfg.sourceLinesPath || undefined}
                    onChange={(v) => set({ sourceLinesPath: v || null, srcAppends: v ? cfg.srcAppends : [] })}
                    placeholder={tt('Chọn quan hệ bảng con (hasMany)')}
                    notFoundContent={cfg.sourceCollection ? tt('Bảng nguồn chưa có quan hệ bảng con') : tt('Chọn bảng nguồn trước')} />
                </SettingRow>
              ) : null}
              {cfg.sourceLinesPath ? (
                <SettingRow layout="vertical" label={tt('Nạp kèm quan hệ của bảng dòng nguồn (src)')} hint={tt('Quan hệ của BẢNG DÒNG NGUỒN mà công thức cần đọc (src.*), vd product của order_lines. Nạp toàn bộ cột của object trên đường đi.')}>
                  <RelationAppendsPicker api={api} collectionName={srcLinesCollection} value={cfg.srcAppends} onChange={(v) => set({ srcAppends: v })} />
                </SettingRow>
              ) : null}
              <SettingRow label={tt('Bỏ qua dòng khi')} hint={tt('Điều kiện lọc bớt đầu vào: biểu thức true = bỏ, không tính. Xem được src / parent / rule. VD src.quantity == 0, hay parent.is_internal == true.')}><Input style={mono} value={cfg.skipIf || ''} onChange={(e) => set({ skipIf: e.target.value })} onFocus={trackFocus} placeholder={tt('(tuỳ chọn)')} /></SettingRow>
            </CollapsibleSection>

            {/* v0.8 PIPELINE — the ordered join-step list (replaces ③ RIGHT + ④ ON when pipeline mode is on). */}
            {pipeline ? (
              <CollapsibleSection title={tt('③ Các bước JOIN (pipeline) — nối tuần tự nhiều bảng')}>
                <div style={{ fontSize: 12, color: token.colorTextTertiary, margin: '0 0 10px' }}>{tt('Mỗi bước nối thêm một bảng/quan hệ và nổ dòng ra. OUTPUT bước N = INPUT bước N+1 (bước sau đọc dòng vào qua src.*). Kéo ↑/↓ để đổi thứ tự.')}</div>
                {steps.map((st: any, i: number) => (
                  <StepCard key={i} api={api} step={st} index={i} total={steps.length} collections={collections}
                    relationCollection={i === 0 ? (srcLinesCollection || cfg.sourceCollection || undefined) : undefined}
                    outputCollection={i === steps.length - 1 ? targetCollection : undefined}
                    trackFocus={trackFocus}
                    onChange={(patch) => patchStep(i, patch)} onMove={(dir) => moveStep(i, dir)} onRemove={() => removeStep(i)} />
                ))}
                <Space>
                  <Button type="dashed" onClick={addStep}>＋ {tt('Thêm bước join')}</Button>
                  {steps.length <= 1 ? <Button size="small" type="text" onClick={toSingle}>{tt('↩ Quay lại JOIN một bước')}</Button> : null}
                </Space>
              </CollapsibleSection>
            ) : null}

            {!pipeline ? (
            <CollapsibleSection title={tt('③ RIGHT · Bảng định mức (rule)')}>
              {cfg.ruleSource === 'inline' ? (
                // Inline rules were removed from the product (kept engine-side so old configs keep RUNNING).
                // Editing them here is no longer possible — recreate as a collection-mode generator.
                <div style={{ fontSize: 12.5, color: '#ad6800', background: '#fffbe6', border: '1px solid #ffe58f', borderRadius: 6, padding: '8px 10px' }}>
                  {tt('Bộ sinh này dùng quy tắc NHÚNG trong config (kiểu cũ, đã ngừng hỗ trợ sửa) — nó VẪN CHẠY bình thường. Muốn sửa quy tắc: đưa quy tắc vào một bảng dữ liệu rồi tạo bộ sinh mới.')}
                </div>
              ) : (
                <>
                  <SettingRow label={tt('Bảng quy tắc')} hint={tt('RIGHT của phép JOIN: bảng dữ liệu chứa các dòng định mức/quy tắc (vd BOM) — hợp khi quy tắc nhiều, import Excel, do nghiệp vụ tự quản.')}><Select style={{ width: '100%' }} showSearch optionFilterProp="label" options={collections} value={cfg.ruleCollection || undefined} onChange={(v) => set({ ruleCollection: v })} placeholder={tt('Chọn bảng')} /></SettingRow>
                  <SettingRow layout="vertical" label={tt('Nạp kèm quan hệ của quy tắc (appends)')} hint={tt('Quan hệ của bảng quy tắc mà điều kiện/công thức cần đọc (vd nhóm của rule). Chọn là nạp toàn bộ cột.')}>
                    <RelationAppendsPicker api={api} collectionName={cfg.ruleCollection || undefined} value={cfg.ruleAppends} onChange={(v) => set({ ruleAppends: v })} />
                  </SettingRow>
                  <SettingRow label={tt('Nổ đệ quy (self-join nhiều cấp)')} hint={tt('BOM nhiều cấp trong 1 lần chạy: mỗi dòng con lại tra tiếp bảng định mức. Tắt = 1 cấp như cũ.')}>
                    <Checkbox checked={!!cfg.recurse} onChange={(e) => set({ recurse: e.target.checked })} />
                  </SettingRow>
                  {cfg.recurse ? (
                    <div style={{ border: `1px solid ${token.colorPrimaryBorder || token.colorBorder}`, borderRadius: 8, padding: '10px 12px', margin: '2px 0 6px', background: token.colorFillQuaternary }}>
                      <div style={{ fontSize: 11.5, color: token.colorTextTertiary, marginBottom: 8 }}>↻ {tt('khi đệ quy, khoá cha của cấp sau = component của cấp trước')}</div>
                      <SettingRow label={tt('Khoá cha (trên bảng định mức)')} hint={tt('Cột trên bảng định mức đóng vai "sản phẩm cha" của một dòng — khoá self-join. VD bom.product_id.')}>
                        <FieldSelect api={api} collection={cfg.ruleCollection || undefined} value={cfg.recurseParentKey || ''} onChange={(v) => set({ recurseParentKey: v })} placeholder={tt('vd product_id')} size="middle" style={{ width: '100%' }} />
                      </SettingRow>
                      <SettingRow label={tt('Component (cột sinh ra → khoá cha cấp sau)')} hint={tt('Cột SINH RA chứa id linh kiện; giá trị của nó trở thành "khoá cha" khi tra cấp tiếp theo. VD material_id.')}>
                        <FieldSelect api={api} collection={targetCollection} value={cfg.recurseChildKey || ''} onChange={(v) => set({ recurseChildKey: v })} placeholder={tt('vd material_id')} size="middle" style={{ width: '100%' }} />
                      </SettingRow>
                      <SettingRow label={tt('Cột số lượng (nhân dồn xuống)')} hint={tt('Cột SINH RA chứa số lượng; nhân dồn theo cây: sl(cấp sau) = sl(cấp trước) × định mức/đơn vị. Công thức số lượng nên đọc src.<cột này> để nối cấp. VD qty.')}>
                        <FieldSelect api={api} collection={targetCollection} value={cfg.recurseQtyField || ''} onChange={(v) => set({ recurseQtyField: v })} placeholder={tt('vd qty')} size="middle" style={{ width: '100%' }} />
                      </SettingRow>
                      <SettingRow label={tt('Độ sâu tối đa')} hint={tt('Chặn BOM vòng lặp / chạy vô hạn. Mặc định 20.')}>
                        <InputNumber min={1} max={100} value={cfg.maxDepth ?? 20} onChange={(v) => set({ maxDepth: v ?? 20 })} />
                      </SettingRow>
                      <SettingRow label={tt('Xuất ra')} hint={tt('Chỉ lá = chỉ giữ NVL gốc (bỏ cụm trung gian). Mọi cấp = giữ tất cả, đánh dấu cấp + cha.')}>
                        <SegmentedGroup block style={{ border: `1px solid ${token.colorBorder}`, width: '100%' }} value={cfg.recurseOutput || 'leaves'} onChange={(v: any) => set({ recurseOutput: v })}
                          options={[{ value: 'leaves', label: tt('Chỉ lá (NVL gốc)') }, { value: 'all', label: tt('Mọi cấp') }]} />
                      </SettingRow>
                    </div>
                  ) : null}
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px dashed ${token.colorBorderSecondary}` }}>
                    <div style={{ fontSize: 12, color: token.colorTextTertiary, marginBottom: 6 }}>{tt('Cần nối QUA NHIỀU BẢNG liên tiếp (vd đơn → combo → BOM)? Chuyển sang pipeline nhiều bước — mỗi bước nối một bảng, output bước trước là input bước sau.')}</div>
                    <Button type="dashed" onClick={toPipeline}>⛓ {tt('Chuyển sang pipeline nhiều bước')}</Button>
                  </div>
                </>
              )}
            </CollapsibleSection>
            ) : null}

            {cfg.ruleSource !== 'inline' && !pipeline ? (
              <CollapsibleSection title={tt('④ ON · Điều kiện nối (LEFT ⋈ RIGHT)')}>
                <SettingRow layout="vertical" label={tt('Điều kiện nối cơ bản (VÀ)')} hint={tt('Cơ sở của phép nối — mọi điều kiện phải đúng (VÀ). Cột quy tắc so với giá trị bạn gõ: true / NV là hằng; parent.shipping_type hay src.product_id là khớp động theo bản ghi/dòng đang tính. Cột quy tắc đi xuyên quan hệ được.')}>
                  <EditTable rows={cfg.ruleWhere || []} onChange={(v) => set({ ruleWhere: v })} newRow={() => ({ field: '', op: 'eq', value: '' })} addLabel={tt('Thêm điều kiện')} columns={ruleCondColumns()} />
                </SettingRow>
                <SettingRow layout="vertical" label={tt('Bậc khớp ưu tiên (tuỳ chọn)')} hint={tt('thử bậc 1 trước; có kết quả thì dùng & dừng; bậc dưới tự bỏ dòng đã khai bậc trên (chống đếm trùng). VD: bậc 1 = user == src.emp (đích danh), bậc 2 = role == src.role (theo vai trò).')}>
                  <div>
                    {tiers.map((tier, i) => (
                      <div key={i} style={{ border: `1px solid ${token.colorBorderSecondary}`, borderRadius: 6, padding: '8px 10px', marginBottom: 8, background: token.colorBgContainer }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                          <b style={{ fontSize: 12.5 }}>{tt('Bậc {{n}}', { n: i + 1 })} · <span style={{ color: token.colorPrimary }}>{tierLabel(i, tiers.length)}</span></b>
                          <Space size={2}>
                            <Button size="small" type="text" disabled={i === 0} onClick={() => moveTier(i, -1)}>↑</Button>
                            <Button size="small" type="text" disabled={i === tiers.length - 1} onClick={() => moveTier(i, 1)}>↓</Button>
                            <Button size="small" type="text" danger onClick={() => setTiers(tiers.filter((_, j) => j !== i))}>✕</Button>
                          </Space>
                        </div>
                        <EditTable rows={tier} onChange={(v) => setTiers(tiers.map((t, j) => (j === i ? v : t)))} newRow={() => ({ field: '', op: 'eq', value: '' })} addLabel={tt('Thêm điều kiện')} columns={ruleCondColumns()} />
                      </div>
                    ))}
                    <Button size="small" type="dashed" onClick={() => setTiers([...tiers, []])}>＋ {tt('Thêm bậc ưu tiên')}</Button>
                  </div>
                </SettingRow>
              </CollapsibleSection>
            ) : null}

            <CollapsibleSection title={tt('⑤ → KẾT QUẢ · công thức tạo dòng & ghi vào đâu')}>
              <SettingRow label={tt('Ghi vào')} hint={tt('Bảng con của bảng nguồn nhận các dòng sinh ra. Khoá ngoại tự suy ra từ quan hệ — không phải điền.')}>
                <Select style={{ width: '100%' }} showSearch optionFilterProp="label" options={relOptions} value={cfg.targetPath || undefined}
                  onChange={(v) => { const rel = relOptions.find((r) => r.value === v); set({ targetPath: v, targetForeignKey: rel?.foreignKey || '' }); }}
                  placeholder={tt('Chọn bảng con (quan hệ hasMany)')} notFoundContent={cfg.sourceCollection ? tt('Bảng nguồn chưa có quan hệ bảng con') : tt('Chọn bảng nguồn trước')} />
              </SettingRow>
              {!pipeline ? (
              <>
              <SettingRow layout="vertical" label={tt('Biến trung gian')} hint={tt('KHÔNG bắt buộc — như alias/CTE trong SQL: dùng khi một biểu thức lặp lại ở nhiều cột. Ánh xạ giá trị config → dữ liệu bằng SWITCH/IF (như CASE WHEN). VD person = SWITCH(rule.based_on & \'|\' & rule.recipient, \'NVPT|self\', parent.responsible_staff, …, null).')}>
                <EditTable rows={cfg.deriveVars || []} onChange={(v) => set({ deriveVars: v })} addLabel={tt('Thêm biến')} newRow={() => ({ name: '', formula: '' })}
                  columns={[
                    { title: tt('Tên biến'), key: 'name', width: 240, render: (row, patch) => <Input size="middle" style={{ ...mono, width: '100%' }} value={row.name} onChange={(e) => patch({ name: e.target.value })} placeholder={tt('tên biến')} /> },
                    { title: tt('Công thức'), key: 'formula', render: (row, patch) => <Input size="middle" style={{ ...mono, width: '100%' }} value={row.formula} onChange={(e) => patch({ formula: e.target.value })} onFocus={trackFocus} placeholder={tt('công thức')} /> },
                  ]} />
              </SettingRow>
              <div style={{ fontSize: 12, color: token.colorTextTertiary, margin: '4px 0 8px' }}>{tt('Mỗi dòng = 1 cột trên bảng con. Viết điều kiện như CASE WHEN trong SQL: IF(đk, a, b) · IFS(đk1, kq1, đk2, kq2, …) · SWITCH(giá_trị, khớp1, kq1, …, mặc_định). Biến: parent / src / rule + biến trung gian + REL / NUM / YMONTH. "Bắt buộc" = null thì bỏ cả dòng.')}</div>
              <EditTable rows={cfg.lineOutputs} onChange={(v) => set({ lineOutputs: v })} addLabel={tt('Thêm cột')} newRow={() => ({ targetField: '', formula: '', required: false })}
                columns={[
                  { title: tt('Cột đích'), key: 'targetField', width: 240, render: (row, patch) => <FieldSelect api={api} collection={targetCollection} value={row.targetField} onChange={(v) => patch({ targetField: v })} placeholder={tt('cột đích')} size="middle" style={{ width: '100%' }} /> },
                  { title: tt('Công thức'), key: 'formula', render: (row, patch) => <Input size="middle" style={{ ...mono, width: '100%' }} value={row.formula} onChange={(e) => patch({ formula: e.target.value })} onFocus={trackFocus} placeholder={tt('công thức')} /> },
                  { title: tt('Bắt buộc'), key: 'required', width: 84, align: 'center', render: (row, patch) => <Tooltip title={tt('Bắt buộc — null thì bỏ dòng')}><Checkbox checked={!!row.required} onChange={(e) => patch({ required: e.target.checked })} /></Tooltip> },
                ]} />
              </>
              ) : (
                <div style={{ fontSize: 12.5, color: token.colorTextTertiary, background: token.colorFillQuaternary, border: `1px solid ${token.colorBorderSecondary}`, borderRadius: 6, padding: '8px 10px', margin: '4px 0 8px' }}>
                  {tt('Chế độ pipeline: các cột sinh ra được khai TRONG TỪNG BƯỚC JOIN ở trên (mục ③). Kết quả cuối là output của bước cuối; phần gộp/SUM dưới đây áp cho toàn bộ.')}
                </div>
              )}
              <div style={{ height: 1, background: token.colorBorderSecondary, margin: '14px 0 10px' }} />
              <SettingRow layout="vertical" label={tt('Gộp theo cột (group by)')} hint={tt('Gộp các dòng trùng khoá này; cột số được cộng dồn. VD material_id khi nổ BOM (đệ quy: gộp các lá theo NVL → tổng nhu cầu).')}><FieldMultiSelect api={api} collection={targetCollection} value={cfg.groupBy || undefined} onChange={(v) => set({ groupBy: v })} placeholder={tt('vd material_id')} /></SettingRow>
              <SettingRow layout="vertical" label={tt('Cột cộng dồn khi gộp')}><FieldMultiSelect api={api} collection={targetCollection} value={cfg.sumFields} onChange={(v) => set({ sumFields: v })} placeholder={tt('vd qty')} /></SettingRow>
            </CollapsibleSection>

            <CollapsibleSection title={tt('⑥ Nâng cao — làm tròn/kiểm tra (tuỳ chọn)')} defaultOpen={false}>
              {pipeline ? (
                <SettingRow label={tt('Giới hạn số dòng (maxRows)')} hint={tt('An toàn nổ dây chuyền: nếu tập đang xử lý vượt số này ở BẤT KỲ bước nào, cả lần chạy bị HUỶ với thông báo rõ ràng (không cắt cụt/treo). Mặc định 10000.')}>
                  <InputNumber min={1} max={1000000} step={1000} style={{ width: 200 }} value={cfg.maxRows ?? 10000} onChange={(v) => set({ maxRows: v ?? undefined })} />
                </SettingRow>
              ) : null}
              <SettingRow layout="vertical" label={tt('Làm tròn cột (largest-remainder)')} hint={tt('Làm tròn số, phần dư dồn vào dòng cuối để tổng khớp. Hợp cho tiền hoa hồng chia %.')}>
                <Space wrap>
                  <FieldMultiSelect api={api} collection={targetCollection} value={cfg.rounding?.fields} onChange={(v) => set({ rounding: { ...(cfg.rounding || { precision: 0 }), fields: v } })} placeholder={tt('cột cần làm tròn')} style={{ width: 260 }} />
                  <InputNumber style={{ width: 120 }} addonBefore={tt('số lẻ')} min={0} max={6} value={cfg.rounding?.precision ?? 0} onChange={(v) => set({ rounding: { ...(cfg.rounding || { fields: [] }), precision: v ?? 0 } })} />
                  <Checkbox checked={cfg.rounding?.remainderToLast ?? true} onChange={(e) => set({ rounding: { ...(cfg.rounding || { fields: [], precision: 0 }), remainderToLast: e.target.checked } })}>{tt('dồn dư dòng cuối')}</Checkbox>
                </Space>
              </SettingRow>
              <SettingRow label={tt('Cột đếm lần chạy')} hint={tt('Cột trên bản ghi cha giữ số lần đã chạy; biến runVersion trong công thức = giá trị + 1 — dùng phân biệt các đợt sinh khi chạy lại (append).')}>
                <FieldSelect api={api} collection={cfg.sourceCollection || undefined} value={cfg.runVersionSource || ''} onChange={(v) => set({ runVersionSource: v })} placeholder={tt('(tuỳ chọn) vd rerun_count')} size="middle" style={{ width: '100%' }} />
              </SettingRow>
              <SettingRow label={tt('Cột ghi nhận diện bộ sinh')} hint={tt('Tuỳ chọn: chọn 1 cột trên BẢNG ĐÍCH để plugin đóng dấu key của bộ sinh vào từng dòng — biết dòng nào do bộ nào tạo, tiện lọc/xoá tay. Bỏ trống = bảng đích không cần cột đặc biệt nào.')}>
                <FieldSelect api={api} collection={targetCollection} value={cfg.markerField || ''} onChange={(v) => set({ markerField: v })} placeholder={tt('(tuỳ chọn)')} size="middle" style={{ width: '100%' }} />
              </SettingRow>
              <SettingRow label={tt('Kiểm tra tổng')} hint={tt('Tổng cột này qua các dòng phải = giá trị (vd tổng % = 1). Trống = bỏ qua.')}>
                <Space.Compact>
                  <FieldSelect api={api} collection={targetCollection} value={cfg.validations?.sumField || ''} onChange={(v) => set({ validations: { ...(cfg.validations || {}), sumField: v } })} placeholder={tt('cột')} size="middle" style={{ width: 160 }} />
                  <Input style={{ width: 40, textAlign: 'center' }} value="=" disabled />
                  <InputNumber style={{ width: 110 }} value={cfg.validations?.sumEquals} onChange={(v) => set({ validations: { ...(cfg.validations || {}), sumEquals: v ?? undefined } })} placeholder="1" />
                </Space.Compact>
              </SettingRow>
            </CollapsibleSection>
          </div>

          {/* right: live preview */}
          <div style={{ flex: 1, borderLeft: `1px solid ${token.colorBorderSecondary}`, display: 'flex', flexDirection: 'column', background: token.colorFillQuaternary, minWidth: 0 }}>
            <div style={{ padding: '10px 12px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12.5, color: token.colorTextSecondary }}>{tt('Chạy thử với:')}</span>
              <Select size="small" style={{ flex: 1, minWidth: 150 }} showSearch optionFilterProp="label" placeholder={tt('Chọn bản ghi')} value={sampleTk}
                onChange={setSampleTk} options={records.map((r) => ({ value: r.id, label: `#${r.id} ${r.code || r.name || r.title || ''}` }))} notFoundContent={tt('Chưa có bản ghi')} />
              <Button size="small" type="primary" loading={previewing} disabled={!cfg.sourceCollection} onClick={runPreview}>{tt('Chạy thử')}</Button>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
              {!preview ? <div style={{ color: token.colorTextTertiary, fontSize: 13 }}>{tt('Bấm "Chạy thử" để xem các dòng sẽ sinh (dry-run, không ghi).')}</div>
                : !preview.ok ? <div style={{ color: '#a8071a', fontSize: 13 }}>{preview.detail || preview.error}</div>
                : <Space direction="vertical" style={{ width: '100%' }} size="small">
                    {preview.guardOk === false ? (
                      <div style={{ fontSize: 12.5, color: '#ad6800', background: '#fffbe6', border: '1px solid #ffe58f', borderRadius: 6, padding: '6px 10px' }}>
                        {tt('Bản ghi mẫu CHƯA đạt điều kiện kích hoạt')} ({preview.guardDetail}) — {tt('tự động sẽ không chạy; bấm nút sẽ bị hỏi xác nhận trước khi vẫn sinh. Kết quả bên dưới là GIẢ ĐỊNH bỏ qua điều kiện, chỉ để xem công thức.')}
                      </div>
                    ) : null}
                    <Space size="small" wrap>
                      <Tag color="blue">{tt('{{n}} dòng', { n: lines.length })}</Tag>
                      {preview.skipped?.length ? <Tag color="orange">{tt('{{n}} bỏ qua', { n: preview.skipped.length })}</Tag> : null}
                      {preview.errors?.length ? <Tag color="red">{tt('{{n}} lỗi', { n: preview.errors.length })}</Tag> : null}
                    </Space>
                    <Table size="small" rowKey={(_, i) => String(i)} columns={previewColumns} dataSource={lines} pagination={lines.length > 20 ? { pageSize: 20 } : false} scroll={{ x: true }} />
                    {preview.errors?.length ? <div style={{ fontSize: 12, color: '#a8071a' }}>{preview.errors.map((e) => `${e.field}: ${e.message}`).slice(0, 5).join(' · ')}</div> : null}
                    {preview.trace ? (
                      <Collapse size="small" style={{ marginTop: 4 }} items={[{
                        key: 'dbg',
                        label: tt('Debug từng bước'),
                        children: (
                          <Collapse size="small" items={[
                            { key: '1', label: tt('Bước 1 — Bản ghi cha (đã nạp quan hệ)'), children: <JsonBlock value={preview.trace.parent} /> },
                            { key: '2', label: <span>{tt('Bước 2 — Dòng đầu vào (src)')} <Tag>{tt('{{n}} dòng', { n: preview.trace.srcRows?.length || 0 })}</Tag></span>, children: <MiniTable rows={preview.trace.srcRows || []} /> },
                            { key: '3', label: <span>{tt('Bước 3 — Quy tắc khớp')} <Tag>{tt('{{n}} quy tắc', { n: preview.trace.rules?.length || 0 })}</Tag></span>, children: <MiniTable rows={preview.trace.rules || []} /> },
                            { key: '4', label: <span>{tt('Bước 4 — Từng cặp (dòng × quy tắc)')} <Tag>{tt('{{n}} cặp', { n: preview.trace.pairs?.length || 0 })}</Tag></span>, children: (
                              (preview.trace.pairs && preview.trace.pairs.length) ? (
                                <Collapse size="small" items={preview.trace.pairs.map((p, i) => ({
                                  key: String(i),
                                  label: <span>#{(p.index ?? i) + 1} {p.dropped ? <Tag color="red">{tt('Bỏ qua')}{p.reason ? `: ${p.reason}` : ''}</Tag> : <Tag color="green">{tt('Giữ')}</Tag>}</span>,
                                  children: (
                                    <Space direction="vertical" size={6} style={{ width: '100%' }}>
                                      <div style={{ fontSize: 12, color: token.colorTextTertiary }}>{tt('Biến suy ra (derived)')}</div>
                                      <JsonBlock value={p.derived || {}} />
                                      <div style={{ fontSize: 12, color: token.colorTextTertiary }}>{tt('Kết quả cột (outputs)')}</div>
                                      <JsonBlock value={p.outputs || {}} />
                                    </Space>
                                  ),
                                }))} />
                              ) : <div style={{ color: token.colorTextTertiary, fontSize: 12 }}>{tt('(không có cặp)')}</div>
                            ) },
                            { key: '5', label: <span>{tt('Bước 5 — Kết quả sau gộp')} <Tag>{tt('{{n}} dòng', { n: preview.trace.grouped?.length || 0 })}</Tag></span>, children: <MiniTable rows={preview.trace.grouped || []} /> },
                            ...(preview.trace.parentUpdates && preview.trace.parentUpdates.length ? [{
                              key: '6',
                              label: <span>{tt('Bước 6 — Cập nhật bản ghi cha (post)')} {preview.trace.parentUpdates.some((u) => u.error) ? <Tag color="red">{tt('có lỗi')}</Tag> : null}</span>,
                              children: (
                                <Table size="small" bordered pagination={false} rowKey={(_: any, i: number) => String(i)}
                                  dataSource={preview.trace.parentUpdates}
                                  columns={[
                                    { title: tt('Cột trên cha'), dataIndex: 'field', key: 'field', width: 200 },
                                    { title: tt('Công thức'), dataIndex: 'formula', key: 'formula', ellipsis: true, render: (v: any) => <code style={{ fontSize: 12 }}>{v}</code> },
                                    { title: tt('Sẽ ghi'), key: 'value', render: (_: any, r: any) => r.error ? <span style={{ color: '#a8071a' }}>⚠ {r.error}</span> : <b>{disp(r.value)}</b> },
                                  ]} />
                              ),
                            }] : []),
                          ]} />
                        ),
                      }]} />
                    ) : null}
                  </Space>}
            </div>
          </div>
        </div>
        <Modal
          open={askClose}
          title={tt('Có thay đổi chưa lưu')}
          onCancel={() => setAskClose(false)}
          maskClosable={false}
          footer={[
            <Button key="stay" onClick={() => setAskClose(false)}>{tt('Ở lại')}</Button>,
            <Button key="discard" danger onClick={() => { setAskClose(false); onClose(); }}>{tt('Đóng, không lưu')}</Button>,
            <Button key="save" type="primary" loading={saving} onClick={async () => { await save(); setAskClose(false); }}>{tt('Lưu & đóng')}</Button>,
          ]}
        >
          {tt('Bạn đã sửa cấu hình bộ sinh nhưng chưa lưu. Bạn muốn lưu các thay đổi trước khi đóng không?')}
        </Modal>
      </Drawer>
    );
  };

  return function RulesManager() {
    const { token } = theme.useToken();
    const api = useApiClient();
    const [rows, setRows] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [collections, setCollections] = useState<any[]>([]);
    const [editing, setEditing] = useState<LineGenConfig | null>(null);

    const reload = useCallback(() => {
      setLoading(true);
      api?.request({ url: `${RULES_COLLECTION}:list`, params: { paginate: false, sort: ['id'] } })
        .then((r: any) => setRows(r?.data?.data || []))
        .catch((e: any) => message.error(e?.message || tt('Load thất bại')))
        .finally(() => setLoading(false));
    }, [api]);

    useEffect(() => {
      reload();
      api?.request({ url: 'collections:list', params: { paginate: false, sort: ['name'] } })
        .then((r: any) => setCollections((r?.data?.data || []).filter((c: any) => !c.hidden).map((c: any) => ({ value: c.name, label: cleanTitle(c.title, c.name) + ` (${c.name})` }))))
        .catch(() => setCollections([]));
    }, []);

    const remove = async (id: any) => {
      try { await api.request({ url: `${RULES_COLLECTION}:destroy`, method: 'post', params: { filterByTk: id } }); message.success(tt('Đã xoá')); reload(); }
      catch (e: any) { message.error(e?.message || tt('Xoá thất bại')); }
    };
    const openEdit = (row?: any) => {
      if (!row) return setEditing(JSON.parse(JSON.stringify(EMPTY)));
      const c = { ...(row.config || {}) } as any;
      c.__id = row.id;
      setEditing(c);
    };

    return (
      <div style={{ padding: 20, maxWidth: 1280, margin: '8px auto 16px', background: token.colorBgContainer, border: `0.8px solid ${token.colorBorderSecondary}`, borderRadius: 8 }}>
        <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ color: token.colorTextSecondary }}>{tt('Bộ sinh dòng theo quy tắc. Gắn nút vào block qua action')} <b>{tt('Sinh dòng theo quy tắc')}</b>.</div>
          <Button type="primary" onClick={() => openEdit()}>+ {tt('Bộ sinh mới')}</Button>
        </div>
        <Table rowKey="id" size="small" loading={loading} dataSource={rows} pagination={false}
          columns={[
            { title: 'ID', dataIndex: 'id', width: 56 },
            { title: tt('Tên'), dataIndex: 'title', render: (v: any, r: any) => <a onClick={() => openEdit(r)}>{v || r.key || `#${r.id}`}</a> },
            { title: 'Key', dataIndex: 'key', width: 180, render: (v: any) => <code>{v}</code> },
            { title: tt('Bảng nguồn'), dataIndex: 'sourceCollection', width: 160 },
            { title: tt('Trạng thái'), dataIndex: 'enabled', width: 90, render: (v: any) => (v === false ? <Tag>{tt('Tắt')}</Tag> : <Tag color="green">{tt('Bật')}</Tag>) },
            { title: '', width: 170, render: (_: any, r: any) => (
              <Space size="small">
                <Button size="small" onClick={() => openEdit(r)}>{tt('Sửa')}</Button>
                <Button size="small" onClick={() => { const c = JSON.parse(JSON.stringify(r.config || {})); c.key = (c.key || '') + '-copy'; c.title = (c.title || '') + tt(' (bản sao)'); setEditing(c); }}>{tt('Nhân bản')}</Button>
                <Popconfirm title={tt('Xoá bộ sinh này?')} onConfirm={() => remove(r.id)}><Button size="small" danger>{tt('Xoá')}</Button></Popconfirm>
              </Space>
            ) },
          ]} />
        {editing && <EditorDrawer api={api} open={!!editing} initial={editing} collections={collections} existingKeys={new Set(rows.map((r: any) => r.key).filter(Boolean))} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
      </div>
    );
  };
}
