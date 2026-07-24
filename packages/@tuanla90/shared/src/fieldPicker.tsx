import React, { useEffect, useRef, useState } from 'react';
import { Cascader, Input, Select, theme } from 'antd';
import { st } from './i18n';

// Small leading DATA-TYPE icon for a field/column option — inline Lucide-style SVGs (currentColor) so
// @tuanla90/shared stays SELF-CONTAINED (no @ant-design/icons dependency forced on consumer plugin builds).
const DATE_TYPES = new Set(['date', 'dateOnly', 'datetime', 'datetimeNoTz', 'datetimeTz', 'timestamp', 'time', 'unixTimestamp']);
const NUM_TYPES = new Set(['integer', 'bigInt', 'float', 'double', 'decimal', 'real', 'number']);
const REL_TYPES = new Set(['belongsTo', 'hasOne', 'hasMany', 'belongsToMany']);
const TypeSvg: React.FC<{ d: React.ReactNode }> = ({ d }) => (
  <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>{d}</svg>
);
export function fieldTypeIcon(type?: string, iface?: string): React.ReactNode {
  const t = type || '';
  const i = iface || '';
  if (!t && !i) return null; // no type info (e.g. a plain non-field option) → no icon
  if (DATE_TYPES.has(t) || ['datetime', 'date', 'createdAt', 'updatedAt', 'time', 'unixTimestamp'].includes(i))
    return <TypeSvg d={<><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>} />; // calendar
  if (NUM_TYPES.has(t) || ['number', 'percent', 'integer'].includes(i))
    return <TypeSvg d={<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" />} />; // hash
  if (t === 'boolean' || i === 'checkbox')
    return <TypeSvg d={<><rect x="3" y="3" width="18" height="18" rx="2" /><path d="m9 12 2 2 4-4" /></>} />; // check-square
  if (REL_TYPES.has(t))
    return <TypeSvg d={<><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" /><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" /></>} />; // link
  if (t === 'json' || t === 'jsonb' || i === 'json')
    return <TypeSvg d={<path d="m16 18 6-6-6-6M8 6l-6 6 6 6" />} />; // code
  if (['multipleSelect', 'checkboxGroup', 'checkboxes'].includes(i))
    return <TypeSvg d={<path d="M11 6h10M11 12h10M11 18h10M3 6l1.5 1.5L7 5M3 12l1.5 1.5L7 11M3 18l1.5 1.5L7 17" />} />; // list-checks (multi-select)
  if (['select', 'radioGroup', 'chinaRegion'].includes(i))
    return <TypeSvg d={<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />} />; // list (single-select / options)
  return <TypeSvg d={<path d="M4 7V4h16v3M9 20h6M12 4v16" />} />; // text (default)
}

/**
 * Reusable "insert a field token" picker — canonical shared version (was copy-pasted into 5 plugins;
 * only ai-column had this lazy drill-deep variant).
 *
 * - `FieldPickerCascader`: a "＋ Chèn cột" trigger that opens a cascader of the collection's fields
 *   (by Label). In LAZY mode (api+collectionName, no precomputed options) each to-one relation is an
 *   expandable node whose children load on demand → drill arbitrarily deep (order → client → manager).
 * - `FieldTokenTextArea`: Input.TextArea + the picker above it; inserting a field drops the configured
 *   token (default `{{a.b}}`) at the caret. `format` is a prop so each plugin keeps its own syntax.
 *
 * antd-only — works in both the /v/ and /admin lanes.
 */

/** Strip a NocoBase `{{t('…')}}` i18n template down to its readable key (used for titles that aren't compiled). */
export function cleanLabel(title: any, fallback: string): string {
  if (title == null) return fallback;
  const l = String(title);
  const m = l.match(/\{\{\s*t\(\s*['"]([^'"]+)['"]/);
  if (m) return m[1];
  if (/\{\{/.test(l)) return fallback;
  return l;
}
function fieldLabel(f: any): string {
  const title = f?.uiSchema?.title || f?.title;
  const lbl = cleanLabel(title, f?.name);
  return lbl + (lbl !== f?.name ? ` (${f.name})` : '');
}
/** Just the clean display title (no "(name)" suffix) — used for the two-line option rendering. */
function fieldTitle(f: any): string {
  return cleanLabel(f?.uiSchema?.title || f?.title, f?.name);
}

const fieldsCache = new Map<string, any[]>();
/** Exported — callers needing raw field records (type/enum, e.g. AI Extract's typed schema) can reuse the SAME cache. */
export async function getFields(api: any, collection?: string, dataSourceKey?: string): Promise<any[]> {
  if (!api?.request || !collection) return [];
  const ck = `${dataSourceKey || 'main'}:${collection}`;
  if (fieldsCache.has(ck)) return fieldsCache.get(ck) as any[];
  try {
    const headers = dataSourceKey && dataSourceKey !== 'main' ? { 'X-Data-Source': dataSourceKey } : undefined;
    const res = await api.request({ url: 'collections:get', params: { filterByTk: collection, appends: ['fields'] }, headers });
    const fields = res?.data?.data?.fields || [];
    // KHÔNG cache kết quả RỖNG: 1 lần gọi sớm (collection/api chưa sẵn) trả [] mà cache lại sẽ poison
    // → mọi field-picker của session đó rỗng vĩnh viễn (phải reload). Chỉ cache khi có field.
    if (fields.length) fieldsCache.set(ck, fields);
    return fields;
  } catch {
    return [];
  }
}

const REL_TO_ONE = ['belongsTo', 'hasOne'];
const REL_ALL = ['belongsTo', 'hasOne', 'belongsToMany', 'hasMany'];
const LEAF_BLOCK = new Set([
  'password', 'json', 'jsonb', 'virtual', 'point', 'lineString', 'polygon',
  'hasMany', 'belongsTo', 'belongsToMany', 'hasOne',
]);
function isLeaf(f: any): boolean {
  return !!f && !LEAF_BLOCK.has(f.type);
}

const NUMERIC_TYPES = new Set(['integer', 'bigInt', 'float', 'double', 'decimal']);

export type FieldJsonMeta = { type: 'string' | 'number' | 'boolean'; enumValues?: string[]; markdown?: boolean };
export function fieldJsonMeta(f: any): FieldJsonMeta {
  if (!f) return { type: 'string' };
  if (NUMERIC_TYPES.has(f.type)) return { type: 'number' };
  if (f.type === 'boolean') return { type: 'boolean' };
  const raw = f?.uiSchema?.enum;
  if (Array.isArray(raw) && raw.length) {
    const enumValues = raw.map((e: any) => (e && typeof e === 'object' ? e.value : e)).filter((v: any) => v != null);
    if (enumValues.length) return { type: 'string', enumValues };
  }
  if (f.interface === 'markdown') return { type: 'string', markdown: true };
  return { type: 'string' };
}

/** Eager pre-walk of relations to a fixed depth (kept for maxDepth:0 flat use / precomputed callers). */
export async function buildFieldCascaderOptions(
  api: any,
  collection: string,
  dataSourceKey?: string,
  opts: { maxDepth?: number; includeToMany?: boolean } = {},
  depth = 0,
): Promise<any[]> {
  const maxDepth = opts.maxDepth ?? 1;
  const relTypes = opts.includeToMany ? REL_ALL : REL_TO_ONE;
  const fields = await getFields(api, collection, dataSourceKey);
  const out: any[] = [];
  for (const f of fields) {
    if (isLeaf(f)) {
      out.push({ value: f.name, label: fieldLabel(f), title: fieldTitle(f), type: f.type, iface: f.interface, isLeaf: true });
    } else if (depth < maxDepth && relTypes.includes(f.type) && f.target) {
      const children = await buildFieldCascaderOptions(api, f.target, dataSourceKey, opts, depth + 1);
      if (children.length) out.push({ value: f.name, label: `${fieldLabel(f)} →`, title: fieldTitle(f), type: f.type, iface: f.interface, children });
    }
  }
  return out;
}

/** One level for the LAZY drill-deep picker: relations become expandable `{isLeaf:false,target,paths}` nodes. */
export async function buildLevelOptions(
  api: any,
  collection: string,
  dataSourceKey: string | undefined,
  parentPaths: string[],
  opts: { includeToMany?: boolean; maxDepth?: number } = {},
): Promise<any[]> {
  const maxDepth = opts.maxDepth ?? 4;
  const relTypes = opts.includeToMany ? REL_ALL : REL_TO_ONE;
  const fields = await getFields(api, collection, dataSourceKey);
  const out: any[] = [];
  for (const f of fields) {
    const paths = [...parentPaths, f.name];
    if (isLeaf(f)) {
      out.push({ value: f.name, label: fieldLabel(f), title: fieldTitle(f), type: f.type, iface: f.interface, isLeaf: true, paths });
    } else if (parentPaths.length < maxDepth && relTypes.includes(f.type) && f.target) {
      out.push({ value: f.name, label: `${fieldLabel(f)} →`, title: fieldTitle(f), type: f.type, iface: f.interface, isLeaf: false, target: f.target, paths });
    }
  }
  return out;
}

export type TokenFormat = (path: string[]) => string;
const DEFAULT_FORMAT: TokenFormat = (p) => `{{${p.join('.')}}}`;

/** Unify TextArea ref / Input ref / native element to get the caret element. */
export function getCaretElement(ref: any): (HTMLInputElement | HTMLTextAreaElement) | null {
  if (!ref) return null;
  if (ref.resizableTextArea?.textArea) return ref.resizableTextArea.textArea;
  if (ref.input) return ref.input;
  if (typeof ref.tagName === 'string' && (ref.tagName === 'TEXTAREA' || ref.tagName === 'INPUT')) return ref;
  return null;
}

/** Insert `token` at the caret of `el` (falls back to append). */
export function insertAtCaret(
  el: (HTMLInputElement | HTMLTextAreaElement) | null,
  token: string,
  currentValue: string,
  onChange: (v: string) => void,
) {
  const cur = currentValue || '';
  if (el && typeof el.selectionStart === 'number') {
    const s = el.selectionStart;
    const e = el.selectionEnd ?? s;
    const next = cur.slice(0, s) + token + cur.slice(e);
    onChange(next);
    requestAnimationFrame(() => {
      try {
        el.focus();
        const pos = s + token.length;
        el.setSelectionRange(pos, pos);
      } catch {
        /* ignore */
      }
    });
  } else {
    onChange(cur + token);
  }
}

export interface FieldPickerCascaderProps {
  api?: any;
  collectionName?: string;
  dataSourceKey?: string;
  options?: any[];
  onPick: (path: string[]) => void;
  /** Trigger label. A string gets a trailing " ▾" caret; pass a ReactNode (e.g. a Lucide icon) to render it as-is (no caret). */
  label?: React.ReactNode;
  maxDepth?: number;
  includeToMany?: boolean;
  disabled?: boolean;
}

export const FieldPickerCascader: React.FC<FieldPickerCascaderProps> = ({
  api,
  collectionName,
  dataSourceKey,
  options,
  onPick,
  label = st('＋ Chèn cột'),
  maxDepth = 4,
  includeToMany = false,
  disabled,
}) => {
  const { token } = theme.useToken();
  const [fetched, setFetched] = useState<any[]>([]);
  const [sel, setSel] = useState<any[]>([]);
  const lazy = !options && !!collectionName;

  useEffect(() => {
    let active = true;
    if (lazy) {
      buildLevelOptions(api, collectionName as string, dataSourceKey, [], { includeToMany, maxDepth }).then(
        (o) => active && setFetched(o),
      );
    } else {
      setFetched([]);
    }
    return () => {
      active = false;
    };
  }, [lazy, api, collectionName, dataSourceKey, includeToMany, maxDepth]);

  const loadData = (selectedOptions: any[]) => {
    const target = selectedOptions[selectedOptions.length - 1];
    if (!target || target.isLeaf || target.children || !target.target) return;
    target.loading = true;
    buildLevelOptions(api, target.target, dataSourceKey, target.paths || [], { includeToMany, maxDepth }).then(
      (children) => {
        target.loading = false;
        target.children = children.length
          ? children
          : [{ value: '__empty', label: st('(không có field)'), disabled: true, isLeaf: true, paths: target.paths }];
        setFetched((prev) => [...prev]);
      },
    );
  };

  const opts = options || fetched;
  const off = disabled || !opts.length;
  return (
    <Cascader
      options={opts}
      disabled={off}
      value={sel as any}
      optionRender={cascaderOptionRender as any}
      loadData={lazy ? (loadData as any) : undefined}
      onChange={(val: any, selectedOptions: any) => {
        const leaf = Array.isArray(selectedOptions) ? selectedOptions[selectedOptions.length - 1] : undefined;
        const path: string[] = leaf?.paths || (Array.isArray(val) ? val.map(String) : []);
        if (path.length) onPick(path);
        setSel([]);
      }}
      changeOnSelect={false}
      showSearch={{
        filter: (input: string, path: any[]) =>
          path.some((o) => String(o.label).toLowerCase().includes(input.toLowerCase())),
      }}
      placement="bottomLeft"
    >
      <a
        style={{ fontSize: 12.5, userSelect: 'none', cursor: off ? 'not-allowed' : 'pointer', color: off ? token.colorTextDisabled : undefined, display: 'inline-flex', alignItems: 'center' }}
        onClick={(e) => e.preventDefault()}
      >
        {label}
        {typeof label === 'string' ? ' ▾' : null}
      </a>
    </Cascader>
  );
};

export interface NestedFieldCascaderProps {
  api?: any;
  collectionName?: string;
  dataSourceKey?: string;
  /** Dot-path string ('department.name'); '' / undefined = nothing picked. */
  value?: string;
  onChange?: (path: string, leafOption?: any) => void;
  placeholder?: string;
  maxDepth?: number;
  /** Include to-many relations (hasMany/belongsToMany, e.g. attachment images). Default true. */
  includeToMany?: boolean;
  allowClear?: boolean;
  style?: React.CSSProperties;
  size?: 'small' | 'middle' | 'large';
}

/** INPUT-style nested field picker (value = dot-path string) — the form-control sibling of the
 *  trigger-style FieldPickerCascader. Options are PRE-BUILT eagerly (buildFieldCascaderOptions):
 *  antd Cascader never fires loadData on hover-expand and disables it entirely under showSearch, so a
 *  lazy tree shows expand arrows that never populate. Eager + getFields cache = hover works, search
 *  sees every level. `changeOnSelect` lets the user stop AT a relation (renderers unwrap name/label). */
export const NestedFieldCascader: React.FC<NestedFieldCascaderProps> = ({
  api,
  collectionName,
  dataSourceKey,
  value,
  onChange,
  placeholder,
  maxDepth = 2,
  includeToMany = true,
  allowClear = true,
  style,
  size,
}) => {
  const [options, setOptions] = useState<any[]>([]);
  useEffect(() => {
    let live = true;
    if (!api || !collectionName) { setOptions([]); return; }
    buildFieldCascaderOptions(api, collectionName, dataSourceKey, { maxDepth, includeToMany }).then(
      (o) => live && setOptions(o),
    );
    return () => { live = false; };
  }, [api, collectionName, dataSourceKey, maxDepth, includeToMany]);
  return (
    <Cascader
      style={{ width: '100%', ...style }}
      size={size}
      options={options}
      value={value ? String(value).split('.') : []}
      changeOnSelect
      expandTrigger="hover"
      allowClear={allowClear}
      placeholder={placeholder}
      optionRender={cascaderOptionRender as any}
      showSearch={{
        filter: (input: string, path: any[]) => {
          const q = String(input).toLowerCase();
          return path.some((o) => String(o.label ?? '').toLowerCase().includes(q) || String(o.value ?? '').toLowerCase().includes(q));
        },
      }}
      displayRender={(labels: any[]) => (labels || []).map((l) => String(l).replace(/ →$/, '')).join(' / ') || (value || '')}
      onChange={(vals: any, opts: any) => {
        const p = (vals || []).join('.');
        onChange?.(p, Array.isArray(opts) ? opts[opts.length - 1] : undefined);
      }}
    />
  );
};

export interface FieldTokenTextAreaProps {
  value?: string;
  onChange?: (v: string) => void;
  api?: any;
  collectionName?: string;
  dataSourceKey?: string;
  options?: any[];
  format?: TokenFormat;
  rows?: number;
  placeholder?: string;
  hint?: React.ReactNode;
  label?: string;
  maxDepth?: number;
  includeToMany?: boolean;
  style?: React.CSSProperties;
}

export const FieldTokenTextArea: React.FC<FieldTokenTextAreaProps> = ({
  value,
  onChange,
  api,
  collectionName,
  dataSourceKey,
  options,
  format = DEFAULT_FORMAT,
  rows = 5,
  placeholder,
  hint,
  label,
  maxDepth,
  includeToMany,
  style,
}) => {
  const taRef = useRef<any>(null);
  const { token } = theme.useToken();

  const insert = (path: string[]) => {
    insertAtCaret(getCaretElement(taRef.current), format(path), value || '', (v) => onChange?.(v));
  };

  return (
    <div style={style}>
      <div style={{ marginBottom: 4 }}>
        <FieldPickerCascader
          api={api}
          collectionName={collectionName}
          dataSourceKey={dataSourceKey}
          options={options}
          onPick={insert}
          label={label}
          maxDepth={maxDepth}
          includeToMany={includeToMany}
        />
      </div>
      <Input.TextArea
        ref={taRef}
        rows={rows}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
      />
      {hint ? <div style={{ fontSize: 12, color: token.colorTextTertiary, marginTop: 4 }}>{hint}</div> : null}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// ColumnSelect — a normal antd dropdown for picking a COLUMN. The list shows the
// friendly title on top + the raw column name (monospace) underneath, and search
// matches EITHER. Spread `columnDropdownProps` into any <Select> to get the same
// two-line behaviour on a custom select (e.g. one with a tagRender).
// ─────────────────────────────────────────────────────────────────────────────
export type ColumnOption = { value: string; label: string; type?: string; iface?: string };

/** Map raw collection fields → {value,label,type} column options. A belongsTo picks its FK column but is
 *  LABELLED `field → <target collection>` (title via `opts.collTitle(target)`, else the target name). */
export function buildColumnOptions(fields: any[], opts?: { collTitle?: (name?: string) => string | undefined }): ColumnOption[] {
  const collTitle = opts?.collTitle;
  const out: ColumnOption[] = (fields || [])
    .filter((f: any) => !['hasMany', 'belongsToMany', 'hasOne'].includes(f.type))
    .map((f: any) => {
      const ti = fieldTitle(f); // clean the `{{t('…')}}` i18n templates (system collections) like the cascader does
      const base = f?.type === 'belongsTo' && f?.foreignKey
        ? { value: f.foreignKey, label: `${ti} → ${(collTitle && collTitle(f.target)) || f.target || f.foreignKey}` }
        : { value: f.name, label: ti };
      return { ...base, type: f?.type, iface: f?.interface };
    });
  const extraType: Record<string, string> = { id: 'bigInt', createdAt: 'date', updatedAt: 'date' };
  for (const extra of ['id', 'createdAt', 'updatedAt']) if (!out.some((o) => o.value === extra)) out.push({ value: extra, label: extra, type: extraType[extra] });
  return out;
}

const collTitleCache = new Map<string, Record<string, string>>();
/** Fetch (cached) a { collectionName → cleaned title } map so a belongsTo can be labelled by its target. */
export async function getCollectionTitles(api: any, dataSourceKey?: string): Promise<Record<string, string>> {
  const ck = dataSourceKey || 'main';
  if (collTitleCache.has(ck)) return collTitleCache.get(ck) as Record<string, string>;
  try {
    const headers = dataSourceKey && dataSourceKey !== 'main' ? { 'X-Data-Source': dataSourceKey } : undefined;
    const res = await api.request({ url: 'collections:list', params: { paginate: false }, headers });
    const arr = res?.data?.data;
    const map: Record<string, string> = {};
    for (const c of (Array.isArray(arr) ? arr : [])) map[c.name] = cleanLabel(c.title, c.name);
    collTitleCache.set(ck, map);
    return map;
  } catch { return {}; }
}

/** THE standard two-line option: friendly title on top, raw name (monospace) underneath. Reused by both
 *  the flat ColumnSelect and the multi-level FieldPickerCascader so every field picker looks identical. */
export const TwoLineOption: React.FC<{ title: React.ReactNode; sub?: string; icon?: React.ReactNode }> = ({ title, sub, icon }) => {
  const { token } = theme.useToken();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, lineHeight: 1.25, padding: '1px 0' }}>
      {icon != null && <span style={{ color: token.colorTextTertiary, fontSize: 13, flexShrink: 0, display: 'inline-flex' }}>{icon}</span>}
      <div style={{ minWidth: 0 }}>
        <div>{title}</div>
        {sub != null && sub !== '' && String(title) !== String(sub) && (
          <div style={{ fontSize: 11, color: token.colorTextTertiary, fontFamily: 'monospace' }}>{sub}</div>
        )}
      </div>
    </div>
  );
};
// Select.optionRender receives {label,value,data}; Cascader.optionRender receives the raw option.
const colOptionRender = (o: any) => <TwoLineOption title={o.data?.label} sub={o.value} icon={fieldTypeIcon(o.data?.type, o.data?.iface)} />;
const cascaderOptionRender = (o: any) => <TwoLineOption title={o?.title || o?.label} sub={o?.value === '__empty' ? undefined : o?.value} icon={o?.value === '__empty' ? null : fieldTypeIcon(o?.type, o?.iface)} />;
const colFilter = (input: string, opt: any) => {
  const s = input.toLowerCase();
  return String(opt?.label ?? '').toLowerCase().includes(s) || String(opt?.value ?? '').toLowerCase().includes(s);
};

/** Spread into any <Select options={columnOptions}> for the two-line title+name dropdown + dual (title/name) search. */
export const columnDropdownProps = { showSearch: true as const, filterOption: colFilter, optionRender: colOptionRender };

export type ColumnSelectProps = {
  value?: string | string[];
  onChange?: (v: any) => void;
  /** Pre-built options (can be GROUPED: [{label, options:[…]}]), OR pass `api` + `collectionName` to self-load. */
  options?: any[];
  api?: any;
  collectionName?: string;
  dataSourceKey?: string;
  /** self-load only: keep only fields matching this predicate (numeric/date/attachment restrictions, etc.). */
  fieldFilter?: (field: any) => boolean;
  mode?: 'single' | 'multiple';
  placeholder?: string;
  allowClear?: boolean;
  disabled?: boolean;
  style?: React.CSSProperties;
  /** Any other antd Select prop (getPopupContainer, notFoundContent, dropdownRender, open, …) passes straight through. */
  [key: string]: any;
};

/** Column picker dropdown (title + raw name + type icon, dual-search). Give `options` (flat or grouped), or
 *  (`api` + `collectionName`) to self-load. Extra antd Select props pass through via `...rest`. */
export const ColumnSelect: React.FC<ColumnSelectProps> = ({
  value, onChange, options, api, collectionName, dataSourceKey, fieldFilter, mode, placeholder, allowClear = true, disabled, style, ...rest
}) => {
  const [loaded, setLoaded] = useState<any[] | null>(null);
  useEffect(() => {
    if (options || !api || !collectionName) return;
    let alive = true;
    Promise.all([getFields(api, collectionName, dataSourceKey), getCollectionTitles(api, dataSourceKey)])
      .then(([fs, titles]) => { if (alive) setLoaded(buildColumnOptions(fieldFilter ? (fs || []).filter(fieldFilter) : fs, { collTitle: (n) => titles[n || ''] })); })
      .catch(() => { if (alive) setLoaded([]); });
    return () => { alive = false; };
    // fieldFilter intentionally out of deps (read at load time) — avoids a refetch loop on inline predicates.
  }, [api, collectionName, dataSourceKey, options]);
  const opts = options || loaded || [];
  const multiple = mode === 'multiple';
  return (
    <Select
      {...columnDropdownProps}
      style={{ width: '100%', ...style }}
      mode={multiple ? 'multiple' : undefined}
      allowClear={multiple ? false : allowClear}
      value={(value as any) || (multiple ? [] : undefined)}
      options={opts}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
      {...rest}
    />
  );
};
