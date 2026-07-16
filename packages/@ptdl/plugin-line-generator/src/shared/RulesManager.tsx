// Settings page: list + create/edit line-generator rules IN-APP. Shared by both lanes.
// v0.2.1 — simplified per user feedback, mirroring print-template's condition UX:
//  - every "field" input is a picker loaded from the real collection (label + name), not free typing
//  - condition values suggest the field's select options (enum), like print-template's ConditionPicker
//  - targetForeignKey is AUTO-DERIVED from the picked hasMany relation (field removed from the form)
//  - key auto-slugs from the title; runVersionSource only shows for the 'version' policy
//  - 5 sections instead of 7; rarely-touched knobs live under "Nâng cao" (collapsed)
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AutoComplete, Button, Cascader, Checkbox, Collapse, Drawer, Input, InputNumber, Modal, Popconfirm, Segmented, Select, Space, Table, Tag, Tooltip, message } from 'antd';
import { CollapsibleSection, SettingRow, RelationAppendsPicker, FieldPickerCascader, getFields } from '@ptdl/shared';
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

  // ---- collection fields (shared per-collection cache — same one every @ptdl picker uses) ------
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

  // Multi-level relation cascader = shared `RelationAppendsPicker` (@ptdl/shared): hover to expand
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
  const JsonBlock: React.FC<{ value: any }> = ({ value }) => (
    <pre style={{ margin: 0, padding: 8, fontSize: 11.5, lineHeight: 1.5, maxHeight: 280, overflow: 'auto', background: '#fff', border: '1px solid #eee', borderRadius: 4, whiteSpace: 'pre' }}>
      {JSON.stringify(value ?? null, null, 2)}
    </pre>
  );

  /** Reduced table for the debug panels: first few columns of a row list (src / rules / grouped). */
  const MiniTable: React.FC<{ rows: any[]; maxCols?: number }> = ({ rows, maxCols = 6 }) => {
    const list = rows || [];
    if (!list.length) return <div style={{ color: '#999', fontSize: 12 }}>{tt('(không có dòng)')}</div>;
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

  const EditorDrawer: React.FC<{
    api: any; open: boolean; initial: LineGenConfig; collections: any[]; existingKeys: Set<string>; onClose: () => void; onSaved: () => void;
  }> = ({ api, open, initial, collections, existingKeys, onClose, onSaved }) => {
    const [cfg, setCfg] = useState<LineGenConfig>(initial);
    const [saving, setSaving] = useState(false);
    const [records, setRecords] = useState<any[]>([]);
    const [sampleTk, setSampleTk] = useState<any>(undefined);
    const [preview, setPreview] = useState<RunResult | null>(null);
    const [previewing, setPreviewing] = useState(false);
    const [askClose, setAskClose] = useState(false);

    // Baseline of the config as it was opened — used to detect unsaved edits so closing can warn.
    const baselineRef = useRef('');
    useEffect(() => {
      const m = migrateConfig(initial);
      setCfg(m); baselineRef.current = JSON.stringify(m);
      setPreview(null); setSampleTk(undefined); setAskClose(false);
    }, [initial, open]);
    const set = (patch: Partial<LineGenConfig>) => setCfg((p) => ({ ...p, ...patch }));
    const dirty = JSON.stringify(cfg) !== baselineRef.current;
    // Guarded close (X button + Escape both route here): warn if there are unsaved changes.
    const requestClose = () => { if (dirty) setAskClose(true); else onClose(); };

    // "＋ Chèn cột" (like the other @ptdl plugins): pickers insert dot tokens (parent.x.y / rule.x /
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
    const ruleWhereTypes = useResolvedTypes(api, cfg.ruleCollection || undefined, (cfg.ruleWhere || []).map((r) => r.field)); // op-by-type (nested) for the rule filter
    const srcLinesCollection = relOptions.find((r) => r.value === cfg.sourceLinesPath)?.target; // "bảng dòng nguồn"

    // Prominent shared formula toolbar (point 5): inserts a parent./src./rule. column token into whatever
    // formula input was last focused — used by sections 2 (skipIf), 3 (rule filter value) and 4 (all formulas).
    const FormulaToolbar = (
      <div style={{ position: 'sticky', top: 0, zIndex: 5, background: 'var(--colorBgContainer, #fff)', border: '1px solid var(--colorBorderSecondary, #f0f0f0)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
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
        <div style={{ fontSize: 11.5, color: '#999', marginTop: 6 }}>{tt('Bấm vào ô công thức bất kỳ, rồi chọn cột — token dạng parent.responsible_staff.direct_manager.id được chèn tại con trỏ (null giữa đường tự ra null).')}</div>
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
      if (!c.lineOutputs?.length) return message.warning(tt('Thêm ít nhất 1 cột sinh ra'));
      if (c.ruleSource === 'inline' && !(c.scopes || []).some((s: any) => (s.rules || []).length)) return message.warning(tt('Thêm ít nhất 1 nhóm quy tắc có quy tắc'));
      if (c.ruleSource !== 'inline' && !c.ruleCollection) return message.warning(tt('Chọn bảng quy tắc'));
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

            <CollapsibleSection title={tt('1. Kích hoạt — bảng cha (parent), khi nào chạy')}>
              <div style={{ fontSize: 12, color: '#888', margin: '0 0 10px' }}>{tt('Bảng cha = bản ghi đặt nút / lắng trigger. Trong mọi công thức, bản ghi này được gọi là parent (vd parent.shipping_type).')}</div>
              <SettingRow label={tt('Tên')} hint={tt('Tên hiển thị trong danh sách và trên menu nút.')}><Input value={cfg.title} onChange={(e) => set({ title: e.target.value })} placeholder={tt('VD: Tính hoa hồng đơn hàng')} /></SettingRow>
              <SettingRow label={tt('Bảng kích hoạt (cha)')} hint={tt('Nơi đặt nút / lắng trigger. Mỗi bản ghi của bảng này là một "cha" — công thức đọc nó qua parent.*')}><Select style={{ width: '100%' }} showSearch optionFilterProp="label" options={collections} value={cfg.sourceCollection || undefined} onChange={(v) => set({ sourceCollection: v, targetPath: '', targetForeignKey: '', sourceLinesPath: null })} placeholder={tt('Chọn bảng')} /></SettingRow>
              <SettingRow layout="vertical" label={tt('Nạp kèm quan hệ của bảng cha (preload)')} hint={tt('Quan hệ của BẢNG CHA mà công thức cần đọc (parent.*). Chọn quan hệ (xổ nhiều cấp) — nạp toàn bộ cột của các object trên đường đi.')}>
                <RelationAppendsPicker api={api} collectionName={cfg.sourceCollection || undefined} value={cfg.preload} onChange={(v) => set({ preload: v })} />
              </SettingRow>
              <SettingRow label={tt('Bật')}><Checkbox checked={cfg.enabled} onChange={(e) => set({ enabled: e.target.checked })} /></SettingRow>
              <SettingRow label={tt('Kích hoạt')} hint={tt('Bấm nút: người dùng chủ động chạy trên từng bản ghi. Tự động: server tự chạy ngay khi bản ghi đạt điều kiện (lưu là chạy, không cần nút — kiểu AI Column).')}>
                <Segmented
                  block
                  style={{ border: '1px solid var(--colorBorder, #d9d9d9)', width: '100%' }}
                  value={cfg.trigger || 'manual'}
                  onChange={(v: any) => set({ trigger: v })}
                  options={[
                    { value: 'manual', label: tt('Bấm nút') },
                    { value: 'auto', label: tt('Tự động khi đạt điều kiện') },
                  ]}
                />
              </SettingRow>
              <SettingRow layout="vertical"
                label={(cfg.trigger || 'manual') === 'auto' ? tt('Điều kiện kích hoạt') : tt('Điều kiện (nút chỉ hiện & server chỉ chạy khi thoả)')}
                hint={(cfg.trigger || 'manual') === 'auto'
                  ? tt('Bản ghi được lưu mà thoả các điều kiện này là tự sinh dòng. QUAN TRỌNG: thêm "cập nhật bản ghi cha" đánh dấu đã chạy (vd is_commission_created = true) để chỉ chạy 1 lần — bỏ dấu đó đi chính là cách chạy lại.')
                  : tt('Điều kiện trên bản ghi cha — vừa ẩn/hiện nút, vừa được server kiểm tra lại khi chạy (chặn bấm đôi/gọi API thẳng). VD status = Đã thanh lý VÀ is_commission_created = false.')}>
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

            <CollapsibleSection title={tt('2. Đầu vào — nhân theo bảng nào (src)')}>
              <SettingRow label={tt('Bảng dòng nguồn (src)')} hint={tt('Cái đem NHÂN với quy tắc. Mặc định = chính bản ghi cha (1 dòng — hoa hồng: 15 quy tắc → 15 dòng). Chọn bảng con = nhân theo TỪNG DÒNG của cha (BOM: mỗi dòng sản phẩm × định mức của nó); công thức đọc dòng qua src.*, và src.* tự về parent.* khi để mặc định.')}>
                <Select style={{ width: '100%' }} allowClear options={relOptions} value={cfg.sourceLinesPath || undefined}
                  onChange={(v) => set({ sourceLinesPath: v || null, srcAppends: v ? cfg.srcAppends : [] })}
                  placeholder={tt('Chính bản ghi cha — 1 dòng (mặc định)')}
                  notFoundContent={cfg.sourceCollection ? tt('Bảng nguồn chưa có quan hệ bảng con') : tt('Chọn bảng nguồn trước')} />
              </SettingRow>
              {cfg.sourceLinesPath ? (
                <SettingRow layout="vertical" label={tt('Nạp kèm quan hệ của bảng dòng nguồn (src)')} hint={tt('Quan hệ của BẢNG DÒNG NGUỒN mà công thức cần đọc (src.*), vd product của order_lines. Nạp toàn bộ cột của object trên đường đi.')}>
                  <RelationAppendsPicker api={api} collectionName={srcLinesCollection} value={cfg.srcAppends} onChange={(v) => set({ srcAppends: v })} />
                </SettingRow>
              ) : null}
              <SettingRow label={tt('Bỏ qua dòng khi')} hint={tt('Điều kiện lọc bớt đầu vào: biểu thức true = bỏ, không tính. Xem được src / parent / rule. VD src.quantity == 0, hay parent.is_internal == true.')}><Input style={mono} value={cfg.skipIf || ''} onChange={(e) => set({ skipIf: e.target.value })} onFocus={trackFocus} placeholder={tt('(tuỳ chọn)')} /></SettingRow>
            </CollapsibleSection>

            <CollapsibleSection title={tt('3. Bảng quy tắc (rule)')}>
              {cfg.ruleSource === 'inline' ? (
                // Inline rules were removed from the product (kept engine-side so old configs keep RUNNING).
                // Editing them here is no longer possible — recreate as a collection-mode generator.
                <div style={{ fontSize: 12.5, color: '#ad6800', background: '#fffbe6', border: '1px solid #ffe58f', borderRadius: 6, padding: '8px 10px' }}>
                  {tt('Bộ sinh này dùng quy tắc NHÚNG trong config (kiểu cũ, đã ngừng hỗ trợ sửa) — nó VẪN CHẠY bình thường. Muốn sửa quy tắc: đưa quy tắc vào một bảng dữ liệu rồi tạo bộ sinh mới.')}
                </div>
              ) : (
                <>
                  <SettingRow label={tt('Bảng quy tắc')} hint={tt('Bảng dữ liệu chứa các dòng quy tắc (vd định mức BOM) — hợp khi quy tắc nhiều, import Excel, do nghiệp vụ tự quản.')}><Select style={{ width: '100%' }} showSearch optionFilterProp="label" options={collections} value={cfg.ruleCollection || undefined} onChange={(v) => set({ ruleCollection: v })} placeholder={tt('Chọn bảng')} /></SettingRow>
                  <SettingRow layout="vertical" label={tt('Nạp kèm quan hệ của quy tắc (appends)')} hint={tt('Quan hệ của bảng quy tắc mà điều kiện/công thức cần đọc (vd nhóm của rule). Chọn là nạp toàn bộ cột.')}>
                    <RelationAppendsPicker api={api} collectionName={cfg.ruleCollection || undefined} value={cfg.ruleAppends} onChange={(v) => set({ ruleAppends: v })} />
                  </SettingRow>
                  <SettingRow layout="vertical" label={tt('Chỉ lấy dòng quy tắc thoả')} hint={tt('Mỗi dòng là một điều kiện — tất cả phải đúng (VÀ). Cột quy tắc so với giá trị bạn gõ: gõ true / Chính ngạch là so hằng; gõ parent.shipping_type (hay src.*) là khớp động theo bản ghi đang tính. Cột quy tắc đi xuyên quan hệ được.')}>
                    <EditTable
                      rows={cfg.ruleWhere || []} onChange={(v) => set({ ruleWhere: v })}
                      newRow={() => ({ field: '', op: 'eq', value: '' })} addLabel={tt('Thêm điều kiện')}
                      columns={[
                        { title: tt('Cột quy tắc'), key: 'field', render: (row, patch) => <CondFieldCascader api={api} collection={cfg.ruleCollection || undefined} value={row.field} onPick={(p, t) => { const ops = opsForType(t).map((o) => o.value); patch({ field: p, ...(row.op && !ops.includes(row.op) ? { op: 'eq' } : {}) }); }} placeholder={tt('cột quy tắc')} /> },
                        { title: tt('Toán tử'), key: 'op', width: 96, render: (row, patch) => <Select size="middle" style={{ width: '100%' }} value={row.op || 'eq'} onChange={(v) => patch({ op: v })} options={opsForType(ruleWhereTypes[row.field])} /> },
                        { title: tt('Giá trị'), key: 'value', render: (row, patch) => isDateType(ruleWhereTypes[row.field])
                          ? <Input type="date" size="middle" style={{ width: '100%' }} value={String(row.value ?? '')} onChange={(e) => patch({ value: e.target.value })} onFocus={trackFocus} />
                          : <Input size="middle" style={{ width: '100%' }} value={row.value ?? ''} onChange={(e) => patch({ value: e.target.value })} onFocus={trackFocus} placeholder={tt('gõ cái gì ăn cái đó (true, Chính ngạch, parent.shipping_type)')} /> },
                      ]}
                    />
                  </SettingRow>
                </>
              )}
            </CollapsibleSection>

            <CollapsibleSection title={tt('4. Công thức tạo dòng & ghi kết quả')}>
              <SettingRow label={tt('Ghi vào')} hint={tt('Bảng con của bảng nguồn nhận các dòng sinh ra. Khoá ngoại tự suy ra từ quan hệ — không phải điền.')}>
                <Select style={{ width: '100%' }} showSearch optionFilterProp="label" options={relOptions} value={cfg.targetPath || undefined}
                  onChange={(v) => { const rel = relOptions.find((r) => r.value === v); set({ targetPath: v, targetForeignKey: rel?.foreignKey || '' }); }}
                  placeholder={tt('Chọn bảng con (quan hệ hasMany)')} notFoundContent={cfg.sourceCollection ? tt('Bảng nguồn chưa có quan hệ bảng con') : tt('Chọn bảng nguồn trước')} />
              </SettingRow>
              <SettingRow layout="vertical" label={tt('Biến trung gian')} hint={tt('KHÔNG bắt buộc — như alias/CTE trong SQL: dùng khi một biểu thức lặp lại ở nhiều cột. Ánh xạ giá trị config → dữ liệu bằng SWITCH/IF (như CASE WHEN). VD person = SWITCH(rule.based_on & \'|\' & rule.recipient, \'NVPT|self\', parent.responsible_staff, …, null).')}>
                <EditTable rows={cfg.deriveVars || []} onChange={(v) => set({ deriveVars: v })} addLabel={tt('Thêm biến')} newRow={() => ({ name: '', formula: '' })}
                  columns={[
                    { title: tt('Tên biến'), key: 'name', width: 240, render: (row, patch) => <Input size="middle" style={{ ...mono, width: '100%' }} value={row.name} onChange={(e) => patch({ name: e.target.value })} placeholder={tt('tên biến')} /> },
                    { title: tt('Công thức'), key: 'formula', render: (row, patch) => <Input size="middle" style={{ ...mono, width: '100%' }} value={row.formula} onChange={(e) => patch({ formula: e.target.value })} onFocus={trackFocus} placeholder={tt('công thức')} /> },
                  ]} />
              </SettingRow>
              <div style={{ fontSize: 12, color: '#888', margin: '4px 0 8px' }}>{tt('Mỗi dòng = 1 cột trên bảng con. Viết điều kiện như CASE WHEN trong SQL: IF(đk, a, b) · IFS(đk1, kq1, đk2, kq2, …) · SWITCH(giá_trị, khớp1, kq1, …, mặc_định). Biến: parent / src / rule + biến trung gian + REL / NUM / YMONTH. "Bắt buộc" = null thì bỏ cả dòng.')}</div>
              <EditTable rows={cfg.lineOutputs} onChange={(v) => set({ lineOutputs: v })} addLabel={tt('Thêm cột')} newRow={() => ({ targetField: '', formula: '', required: false })}
                columns={[
                  { title: tt('Cột đích'), key: 'targetField', width: 240, render: (row, patch) => <FieldSelect api={api} collection={targetCollection} value={row.targetField} onChange={(v) => patch({ targetField: v })} placeholder={tt('cột đích')} size="middle" style={{ width: '100%' }} /> },
                  { title: tt('Công thức'), key: 'formula', render: (row, patch) => <Input size="middle" style={{ ...mono, width: '100%' }} value={row.formula} onChange={(e) => patch({ formula: e.target.value })} onFocus={trackFocus} placeholder={tt('công thức')} /> },
                  { title: tt('Bắt buộc'), key: 'required', width: 84, align: 'center', render: (row, patch) => <Tooltip title={tt('Bắt buộc — null thì bỏ dòng')}><Checkbox checked={!!row.required} onChange={(e) => patch({ required: e.target.checked })} /></Tooltip> },
                ]} />
            </CollapsibleSection>

            <CollapsibleSection title={tt('5. Nâng cao — logic điền số (tuỳ chọn)')} defaultOpen={false}>
              <SettingRow layout="vertical" label={tt('Gộp theo cột (group by)')} hint={tt('Gộp các dòng trùng khoá này; cột số được cộng dồn. VD material_id khi nổ BOM.')}><FieldMultiSelect api={api} collection={targetCollection} value={cfg.groupBy || undefined} onChange={(v) => set({ groupBy: v })} placeholder={tt('vd material_id')} /></SettingRow>
              <SettingRow layout="vertical" label={tt('Cột cộng dồn khi gộp')}><FieldMultiSelect api={api} collection={targetCollection} value={cfg.sumFields} onChange={(v) => set({ sumFields: v })} placeholder={tt('vd qty')} /></SettingRow>
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
          <div style={{ flex: 1, borderLeft: '1px solid #e8e8e8', display: 'flex', flexDirection: 'column', background: '#f7f8fa', minWidth: 0 }}>
            <div style={{ padding: '10px 12px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12.5, color: '#666' }}>{tt('Chạy thử với:')}</span>
              <Select size="small" style={{ flex: 1, minWidth: 150 }} showSearch optionFilterProp="label" placeholder={tt('Chọn bản ghi')} value={sampleTk}
                onChange={setSampleTk} options={records.map((r) => ({ value: r.id, label: `#${r.id} ${r.code || r.name || r.title || ''}` }))} notFoundContent={tt('Chưa có bản ghi')} />
              <Button size="small" type="primary" loading={previewing} disabled={!cfg.sourceCollection} onClick={runPreview}>{tt('Chạy thử')}</Button>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
              {!preview ? <div style={{ color: '#999', fontSize: 13 }}>{tt('Bấm "Chạy thử" để xem các dòng sẽ sinh (dry-run, không ghi).')}</div>
                : !preview.ok ? <div style={{ color: '#a8071a', fontSize: 13 }}>{preview.detail || preview.error}</div>
                : <Space direction="vertical" style={{ width: '100%' }} size="small">
                    {preview.guardOk === false ? (
                      <div style={{ fontSize: 12.5, color: '#ad6800', background: '#fffbe6', border: '1px solid #ffe58f', borderRadius: 6, padding: '6px 10px' }}>
                        {tt('Bản ghi mẫu CHƯA đạt điều kiện kích hoạt')} ({preview.guardDetail}) — {tt('thực tế nút sẽ ẩn / tự động sẽ không chạy. Kết quả bên dưới là GIẢ ĐỊNH bỏ qua điều kiện, chỉ để xem công thức.')}
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
                                      <div style={{ fontSize: 12, color: '#888' }}>{tt('Biến suy ra (derived)')}</div>
                                      <JsonBlock value={p.derived || {}} />
                                      <div style={{ fontSize: 12, color: '#888' }}>{tt('Kết quả cột (outputs)')}</div>
                                      <JsonBlock value={p.outputs || {}} />
                                    </Space>
                                  ),
                                }))} />
                              ) : <div style={{ color: '#999', fontSize: 12 }}>{tt('(không có cặp)')}</div>
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
      <div style={{ padding: 20, maxWidth: 1280, margin: '8px auto 16px', background: 'var(--colorBgContainer, #fff)', border: '0.8px solid var(--colorBorderSecondary, #f0f0f0)', borderRadius: 8 }}>
        <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ color: '#666' }}>{tt('Bộ sinh dòng theo quy tắc. Gắn nút vào block qua action')} <b>{tt('Sinh dòng theo quy tắc')}</b>.</div>
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
