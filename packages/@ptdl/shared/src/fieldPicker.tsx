import React, { useEffect, useRef, useState } from 'react';
import { Cascader, Input } from 'antd';
import { st } from './i18n';

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

function cleanLabel(title: any, fallback: string): string {
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
    fieldsCache.set(ck, fields);
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
      out.push({ value: f.name, label: fieldLabel(f), isLeaf: true });
    } else if (depth < maxDepth && relTypes.includes(f.type) && f.target) {
      const children = await buildFieldCascaderOptions(api, f.target, dataSourceKey, opts, depth + 1);
      if (children.length) out.push({ value: f.name, label: `${fieldLabel(f)} →`, children });
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
      out.push({ value: f.name, label: fieldLabel(f), isLeaf: true, paths });
    } else if (parentPaths.length < maxDepth && relTypes.includes(f.type) && f.target) {
      out.push({ value: f.name, label: `${fieldLabel(f)} →`, isLeaf: false, target: f.target, paths });
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
        style={{ fontSize: 12.5, userSelect: 'none', cursor: off ? 'not-allowed' : 'pointer', color: off ? '#bbb' : undefined, display: 'inline-flex', alignItems: 'center' }}
        onClick={(e) => e.preventDefault()}
      >
        {label}
        {typeof label === 'string' ? ' ▾' : null}
      </a>
    </Cascader>
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
      {hint ? <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>{hint}</div> : null}
    </div>
  );
};
