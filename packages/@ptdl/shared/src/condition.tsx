import React from 'react';
import { Select, Input, InputNumber, Switch, Space, DatePicker, Cascader, Button } from 'antd';
import dayjs from 'dayjs';
import { getFields, buildLevelOptions } from './fieldPicker';
import { st } from './i18n';

// Field titles are often i18n templates like `{{t("Created at")}}` — surface the readable key, not the raw expr.
function cleanFieldTitle(title: any, fallback: string): string {
  if (title == null) return fallback;
  const s = String(title);
  const m = s.match(/\{\{\s*t\(\s*['"]([^'"]+)['"]/);
  if (m) return m[1];
  if (/\{\{/.test(s)) return fallback;
  return s;
}

/**
 * Shared CONDITION kit — smart operator + adaptive value input + client-side evaluator.
 *
 * Lineage: derived from `plugin-filter-tree`'s `opsForMeta` / `ScopeValueInput` (the canonical smart
 * operator+value editor in this workspace). filter-tree builds NocoBase filter JSON evaluated on the
 * SERVER (variables, server-resolved date descriptors). This shared version is adapted for **client-side
 * per-row evaluation** (conditional-format cell styling): no server variables; relative dates use a small
 * client-resolvable preset set (native Date). Operators use the same `$…` vocabulary so the two stay familiar.
 *
 * Consumers: `plugin-conditional-format` (block-level rules). Candidates to migrate onto this: filter-tree,
 * menu-enhancements (see SHARED-LIBS-PROPOSAL.md).
 */

const NUMERIC = new Set(['integer', 'bigInt', 'float', 'double', 'decimal', 'percent']);
const DATE = new Set(['date', 'datetime', 'dateOnly', 'datetimeNoTz', 'unixTimestamp', 'createdAt', 'updatedAt']);

export type CondMeta = {
  type?: string;
  enumMap?: Map<string, string>;
  title?: string;
  interface?: string;
  isDate?: boolean;
  isNumber?: boolean;
  isBoolean?: boolean;
};

function metaOfField(f: any): CondMeta {
  const enumRaw = f?.uiSchema?.enum;
  let enumMap: Map<string, string> | undefined;
  if (Array.isArray(enumRaw) && enumRaw.length) {
    enumMap = new Map();
    for (const e of enumRaw) {
      if (e && typeof e === 'object') enumMap.set(String(e.value), e.label ?? e.value);
      else enumMap.set(String(e), String(e));
    }
  }
  const type = f?.type;
  return {
    type,
    enumMap,
    title: cleanFieldTitle(f?.uiSchema?.title || f?.title, f?.name),
    interface: f?.interface,
    isDate: DATE.has(type),
    isNumber: NUMERIC.has(type),
    isBoolean: type === 'boolean',
  };
}

/** Resolve the leaf field meta of a dot-path (walks to-one relations via the shared getFields cache). */
export async function resolveFieldMeta(
  api: any,
  collectionName: string,
  dataSourceKey: string | undefined,
  path: string[],
): Promise<CondMeta> {
  if (!path?.length) return {};
  let coll = collectionName;
  let fields = await getFields(api, coll, dataSourceKey);
  for (let i = 0; i < path.length; i++) {
    const f = fields.find((x: any) => x.name === path[i]);
    if (!f) return {};
    if (i === path.length - 1) return metaOfField(f);
    if (!f.target) return metaOfField(f);
    coll = f.target;
    fields = await getFields(api, coll, dataSourceKey);
  }
  return {};
}

// ---- operators ---------------------------------------------------------------------------------
export const OP_LABELS: Record<string, string> = {
  $eq: '=', $ne: '≠', $includes: 'chứa', $notIncludes: 'không chứa',
  $gt: '>', $gte: '≥', $lt: '<', $lte: '≤',
  $in: 'là một trong', $notIn: 'không thuộc',
  $empty: 'rỗng', $notEmpty: 'khác rỗng',
  $dateOn: 'vào ngày', $dateBefore: 'trước ngày', $dateAfter: 'sau ngày',
};
const OPS_TEXT = ['$eq', '$ne', '$includes', '$notIncludes', '$empty', '$notEmpty'];
const OPS_NUMBER = ['$eq', '$ne', '$gt', '$gte', '$lt', '$lte', '$empty', '$notEmpty'];
const OPS_DATE = ['$dateOn', '$dateBefore', '$dateAfter', '$empty', '$notEmpty'];
const OPS_BOOL = ['$eq', '$ne'];
const OPS_ENUM = ['$eq', '$ne', '$in', '$notIn', '$empty', '$notEmpty'];
const NO_VALUE = new Set(['$empty', '$notEmpty']);
const LIST_OPS = new Set(['$in', '$notIn']);

export function operatorsForMeta(meta?: CondMeta): { value: string; label: string }[] {
  let ops = OPS_TEXT;
  if (meta) {
    if (meta.enumMap && meta.enumMap.size) ops = OPS_ENUM;
    else if (meta.isBoolean) ops = OPS_BOOL;
    else if (meta.isDate) ops = OPS_DATE;
    else if (meta.isNumber) ops = OPS_NUMBER;
  }
  // Translate at CALL time (render), not at OP_LABELS definition — `st` needs the per-plugin
  // translator injected in load(); a module-load st() would capture the VN key. Symbols (=, ≠, …)
  // aren't in the locale map so they fall back to themselves.
  return ops.map((o) => ({ value: o, label: st(OP_LABELS[o] || o) }));
}
export function opNeedsNoValue(op?: string): boolean {
  return NO_VALUE.has(op || '');
}

// ---- date presets (client-resolvable via native Date) ------------------------------------------
export const DATE_PRESETS = [
  { value: 'exact', label: 'Ngày cụ thể' },
  { value: 'today', label: 'Hôm nay' },
  { value: 'yesterday', label: 'Hôm qua' },
  { value: 'last7', label: '7 ngày qua' },
  { value: 'last30', label: '30 ngày qua' },
  { value: 'thisMonth', label: 'Tháng này' },
  { value: 'thisYear', label: 'Năm nay' },
];
function startOfDay(d: Date): Date { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function resolvePresetRange(preset: string): { start: Date; end: Date } | null {
  const now = new Date();
  const s = startOfDay(now);
  const e = new Date(s); e.setHours(23, 59, 59, 999);
  switch (preset) {
    case 'today': return { start: s, end: e };
    case 'yesterday': { const a = new Date(s); a.setDate(a.getDate() - 1); const b = new Date(a); b.setHours(23, 59, 59, 999); return { start: a, end: b }; }
    case 'last7': { const a = new Date(s); a.setDate(a.getDate() - 6); return { start: a, end: e }; }
    case 'last30': { const a = new Date(s); a.setDate(a.getDate() - 29); return { start: a, end: e }; }
    case 'thisMonth': { const a = new Date(now.getFullYear(), now.getMonth(), 1); const b = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999); return { start: a, end: b }; }
    case 'thisYear': { const a = new Date(now.getFullYear(), 0, 1); const b = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999); return { start: a, end: b }; }
    default: return null;
  }
}

// ---- adaptive value input ----------------------------------------------------------------------
export const ConditionValueInput: React.FC<{ meta?: CondMeta; op?: string; value: any; onChange: (v: any) => void; size?: 'small' | 'middle' | 'large' }> = ({ meta, op, value, onChange, size = 'small' }) => {
  if (opNeedsNoValue(op)) return null;
  const common = { size, style: { width: 160 } };
  const switchSize: 'small' | 'default' = size === 'small' ? 'small' : 'default';

  if (meta?.isDate) {
    const isObj = value && typeof value === 'object';
    const preset = isObj ? value.preset : 'exact';
    return (
      <Space size={4} wrap>
        <Select size={size} style={{ width: 130 }} value={preset} onChange={(m: any) => onChange(m === 'exact' ? '' : { preset: m })} options={DATE_PRESETS.map((p) => ({ value: p.value, label: st(p.label) }))} />
        {preset === 'exact' && (
          <DatePicker size={size} style={{ width: 150 }} format="YYYY-MM-DD"
            value={typeof value === 'string' && value ? dayjs(value) : null}
            onChange={(_d: any, ds: any) => onChange(typeof ds === 'string' ? ds : '')} />
        )}
      </Space>
    );
  }

  const enumOpts = meta?.enumMap ? Array.from(meta.enumMap.entries()).map(([v, l]) => ({ value: String(v), label: l })) : [];
  if (LIST_OPS.has(op || '')) {
    const arr = value ? String(value).split(',').map((s: string) => s.trim()).filter(Boolean) : [];
    return enumOpts.length ? (
      <Select {...common} mode="multiple" placeholder={st('giá trị')} value={arr} onChange={(v: any) => onChange((v || []).join(', '))} options={enumOpts} />
    ) : (
      <Input {...common} placeholder="a, b, c" value={value} onChange={(e: any) => onChange(e.target.value)} />
    );
  }
  if (enumOpts.length) {
    return <Select {...common} showSearch optionFilterProp="label" placeholder={st('giá trị')} value={value || undefined} onChange={(v: any) => onChange(v ?? '')} options={enumOpts} />;
  }
  if (meta?.isBoolean) {
    const on = value === 'true' || value === true;
    return (
      <Space size={6}>
        <Switch size={switchSize} checked={on} onChange={(c: boolean) => onChange(c ? 'true' : 'false')} />
        <span style={{ fontSize: 12, color: '#888' }}>{on ? st('Có') : st('Không')}</span>
      </Space>
    );
  }
  if (meta?.isNumber) {
    return <InputNumber {...common} placeholder={st('số')} value={value === '' || value == null ? undefined : (Number(value) as any)} onChange={(v: any) => onChange(v == null ? '' : String(v))} />;
  }
  return <Input {...common} placeholder={st('Nhập giá trị')} value={value} onChange={(e: any) => onChange(e.target.value)} />;
};

// ---- condition ROW (field cascader + operator + value + remove) --------------------------------
export type ConditionCond = { path: string[]; op: string; value: any; meta?: CondMeta };
export type ConditionRowProps = {
  api: any;
  collectionName?: string;
  dataSourceKey?: string;
  /** Current field path (canonical shape; a dot-string caller maps via `field.split('.')` / `path.join('.')`). */
  path: string[];
  op?: string;
  value: any;
  /** Fired on field/op/value change with the full canonical cond. Adapt to your storage shape here. */
  onChange: (next: ConditionCond) => void;
  onRemove: () => void;
  /** Rendered before the cascader (e.g. conditional-format's "khi/và/hoặc" connector). */
  connector?: React.ReactNode;
  /** Display fallback while the leaf meta (title) is still resolving. */
  fieldLabel?: React.ReactNode;
  placeholder?: string;
  cascaderWidth?: number;
  opWidth?: number;
  valueSize?: 'small' | 'middle' | 'large';
  emptyLabel?: string;
  includeToMany?: boolean;
  maxDepth?: number;
  /** Provide the plugin's exact remove control (keeps per-plugin look); default is a plain ✕ text button. */
  renderRemove?: (onRemove: () => void) => React.ReactNode;
  style?: React.CSSProperties;
};

/**
 * One condition row — lazy field Cascader (drills to-one relations on demand) + smart operator
 * (`operatorsForMeta`) + adaptive value (`ConditionValueInput`) + remove. The ~95%-identical row shell
 * behind conditional-format's rule builder and menu-enhancements' badge filter. Operates on a canonical
 * `path: string[]`; callers with a dot-string field adapt in `onChange`.
 */
export const ConditionRow: React.FC<ConditionRowProps> = ({
  api, collectionName, dataSourceKey, path, op, value, onChange, onRemove,
  connector, fieldLabel, placeholder = 'Select a field', cascaderWidth = 200, opWidth = 132,
  valueSize = 'middle', emptyLabel = 'No fields', includeToMany = false, maxDepth = 4, renderRemove, style,
}) => {
  const [fieldOpts, setFieldOpts] = React.useState<any[]>([]);
  const [meta, setMeta] = React.useState<CondMeta | undefined>(undefined);

  // Root field options for the collection (relations expand lazily via loadData).
  React.useEffect(() => {
    let active = true;
    if (!api?.request || !collectionName) { setFieldOpts([]); return; }
    buildLevelOptions(api, collectionName, dataSourceKey, [], { includeToMany, maxDepth })
      .then((o: any[]) => active && setFieldOpts(o)).catch(() => {});
    return () => { active = false; };
  }, [api, collectionName, dataSourceKey, includeToMany, maxDepth]);

  // Resolve leaf meta for the current path (mount / external change).
  React.useEffect(() => {
    let active = true;
    if (!path?.length || !collectionName || !api) { setMeta(undefined); return; }
    resolveFieldMeta(api, collectionName, dataSourceKey, path)
      .then((m: CondMeta) => active && setMeta(m)).catch(() => {});
    return () => { active = false; };
  }, [path?.join('.'), api, collectionName, dataSourceKey]);

  const loadData = (selected: any[]) => {
    const target = selected[selected.length - 1];
    if (!target || target.isLeaf || target.children || !target.target) return;
    target.loading = true;
    buildLevelOptions(api, target.target, dataSourceKey, target.paths || [], { includeToMany, maxDepth }).then((children: any[]) => {
      target.loading = false;
      target.children = children.length ? children : [{ value: '__empty', label: emptyLabel, disabled: true, isLeaf: true }];
      setFieldOpts((prev) => [...prev]);
    });
  };

  const ops = operatorsForMeta(meta);
  const curOp = op && ops.some((o) => o.value === op) ? op : ops[0]?.value || '$eq';

  const onPickField = async (p: string[]) => {
    const m = await resolveFieldMeta(api, collectionName || '', dataSourceKey, p).catch(() => undefined);
    setMeta(m);
    onChange({ path: p, op: operatorsForMeta(m)[0]?.value || '$eq', value: '', meta: m });
  };

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 32, flexWrap: 'wrap', ...style }}>
      {connector}
      <Cascader
        style={{ width: cascaderWidth, flex: 'none' }}
        options={fieldOpts}
        loadData={loadData as any}
        changeOnSelect={false}
        placeholder={placeholder}
        showSearch={{ filter: (input: string, p: any[]) => p.some((o) => String(o.label).toLowerCase().includes(input.toLowerCase())) }}
        value={path?.length ? path : undefined}
        displayRender={() => (meta?.title as any) || fieldLabel || (path || []).join(' → ') || ''}
        onChange={(val: any, selected: any) => {
          const leaf = Array.isArray(selected) ? selected[selected.length - 1] : undefined;
          const p: string[] = leaf?.paths || (Array.isArray(val) ? val.map(String) : []);
          if (p.length) onPickField(p);
        }}
      />
      <Select style={{ width: opWidth, flex: 'none' }} value={curOp} onChange={(v: any) => onChange({ path, op: v, value, meta })} options={ops} />
      {opNeedsNoValue(curOp) ? null : (
        <ConditionValueInput meta={meta} op={curOp} value={value} size={valueSize} onChange={(v: any) => onChange({ path, op: curOp, value: v, meta })} />
      )}
      {renderRemove ? renderRemove(onRemove) : (
        <Button size="small" type="text" danger style={{ flex: 'none' }} onClick={onRemove}>✕</Button>
      )}
    </div>
  );
};

// ---- client-side evaluator ---------------------------------------------------------------------
function toNum(v: any): number | null { if (v == null || v === '') return null; const n = Number(v); return Number.isNaN(n) ? null : n; }
function toDate(v: any): Date | null { if (v == null || v === '') return null; const d = new Date(v); return isNaN(d.getTime()) ? null : d; }

/** Evaluate one condition operator client-side. `condValue` is the raw stored value (string / {preset} / csv). */
export function evalConditionOp(op: string, cellValue: any, condValue: any): boolean {
  const isEmpty = cellValue == null || cellValue === '' || (Array.isArray(cellValue) && cellValue.length === 0);
  if (op === '$empty') return isEmpty;
  if (op === '$notEmpty') return !isEmpty;

  const sv = cellValue == null ? '' : typeof cellValue === 'object' ? JSON.stringify(cellValue) : String(cellValue);
  const cmp = condValue == null ? '' : String(condValue);
  switch (op) {
    case '$eq': return sv.trim().toLowerCase() === cmp.trim().toLowerCase();
    case '$ne': return sv.trim().toLowerCase() !== cmp.trim().toLowerCase();
    case '$includes': return sv.toLowerCase().includes(cmp.toLowerCase());
    case '$notIncludes': return !sv.toLowerCase().includes(cmp.toLowerCase());
    case '$gt': case '$gte': case '$lt': case '$lte': {
      const a = toNum(cellValue), b = toNum(condValue);
      if (a == null || b == null) return false;
      return op === '$gt' ? a > b : op === '$gte' ? a >= b : op === '$lt' ? a < b : a <= b;
    }
    case '$in': case '$notIn': {
      const list = String(condValue || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
      const hit = list.includes(sv.trim().toLowerCase());
      return op === '$in' ? hit : !hit;
    }
    case '$dateOn': case '$dateBefore': case '$dateAfter': {
      const cell = toDate(cellValue);
      if (!cell) return false;
      let start: Date | null, end: Date | null;
      if (condValue && typeof condValue === 'object' && condValue.preset) {
        const r = resolvePresetRange(condValue.preset);
        if (!r) return false;
        start = r.start; end = r.end;
      } else {
        const d = toDate(condValue);
        if (!d) return false;
        start = startOfDay(d); end = new Date(start); end.setHours(23, 59, 59, 999);
      }
      if (op === '$dateOn') return cell >= start && cell <= end;
      if (op === '$dateBefore') return cell < start;
      return cell > end; // $dateAfter
    }
    default: return false;
  }
}
