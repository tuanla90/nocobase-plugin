/**
 * Sub-table Pro widget.
 *
 * A FieldModel that SUBCLASSES the native `SubTableFieldModel` (resolved from the flow-engine registry).
 * By extending it we inherit — for free — the value binding (`getCurrentValue`/`onChange`), the row markers
 * (`__is_new__`/`__is_stored__`/`__index__`), the record-picker "Select record" flow (`openView` event) and
 * the exact submit serialization of the native sub-table. We override ONLY `render()` to draw our own views
 * (a faithful fork of the native `SubTableField`, which the package doesn't export) plus:
 *   - a configurable TOTALS row (sum of chosen numeric columns),
 *   - table / list / card VIEW MODES,
 *   - a qty +/− stepper on a chosen column,
 *   - LOOKUP columns: display a field from a child-row relation (e.g. product.unit_price) — fetched on demand.
 * All mutations still flow through the inherited `onChange(normalizeSubTableRows(...))`, so submit is native.
 *
 * v2 will add the cross-block bridge subscription. See docs/SUBTABLE-PRO-DESIGN.md.
 */
import React from 'react';
import { Table, Button, Space, Form, InputNumber, Input, Checkbox, theme } from 'antd';
import { css } from '@emotion/css';
import { CloseOutlined, PlusOutlined, ZoomInOutlined, MinusOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { observer, useForm } from '@formily/react';
import { FormTab } from '@formily/antd-v5';
import { EditableItemModel } from '@nocobase/flow-engine';
import { formatNumber, SettingsGrid, CollapsibleSection, ColorField, fi, rx, SEG_PROPS, SegmentedGroup, ColumnSelect, registerFlowComponentsOnce } from '@tuanla90/shared';

/** The theme primary color (real token, not the CSS-var fallback which may be missing → wrong blue). */
function usePrimary(override?: string): string {
  const { token } = theme.useToken();
  return override || token.colorPrimary || '#1677ff';
}
import { getSubTableRowIdentity, normalizeSubTableRows } from './rowIdentity';
import { getBridge } from './bridge';

export const NS = 'subtable-pro';

// Runtime translator wired per lane (VN-source keys → en-US map). Falls back to identity.
let _t: (s: string, o?: any) => string = (s) => s;
export function setRuntimeT(fn: (s: string, o?: any) => string) {
  _t = fn;
}

// NocoBase Icon component + icon registry, injected per lane — used to render the Lucide "sigma" icon
// (registered by @tuanla90/plugin-custom-icons as `lucide-sigma`). Falls back to an inline SVG if absent.
let _Icon: any = null;
let _icons: any = null;
export function setIconComp(Icon: any, icons: any) {
  _Icon = Icon;
  _icons = icons;
}

// ---- helpers ------------------------------------------------------------------------------------
function cellText(v: any): string {
  if (v == null) return '';
  if (typeof v === 'object') return String(v.name ?? v.title ?? v.label ?? v.nickname ?? v.id ?? '');
  return String(v);
}
function num(v: any): number {
  return Number(v) || 0;
}
function fieldTitle(f: any): string {
  return f?.uiSchema?.title || f?.title || f?.name || '';
}
const REL_TYPES = ['belongsTo', 'hasOne', 'hasMany', 'belongsToMany'];

/** Cascader options (rel → scalar field) for lookup config, built sync from loaded collections. */
function buildRelOptions(model: any): any[] {
  const child = model?.collection;
  const dsm = model?.flowEngine?.context?.dataSourceManager;
  if (!child?.getFields || !dsm) return [];
  const dsKey = child.dataSourceKey || 'main';
  const rels = (child.getFields() || []).filter((f: any) => f.type === 'belongsTo' || f.type === 'hasOne');
  return rels
    .map((rf: any) => {
      const tcol = dsm.getDataSource?.(dsKey)?.getCollection?.(rf.target);
      const tfields = ((tcol?.getFields?.() as any[]) || []).filter((f) => !REL_TYPES.includes(f.type));
      return { value: rf.name, label: fieldTitle(rf), children: tfields.map((ff) => ({ value: ff.name, label: fieldTitle(ff) })) };
    })
    .filter((o: any) => o.children.length);
}
/** Flatten rel options into single-field options with `L:rel.field` values (for title/price pickers). */
function flattenLookupOptions(relOptions: any[]): any[] {
  const out: any[] = [];
  for (const rel of relOptions) for (const f of rel.children) out.push({ label: `${rel.label} · ${f.label}`, value: `L:${rel.value}.${f.value}` });
  return out;
}
function parseLookupKey(key: string): { rel: string; field: string } | null {
  if (typeof key !== 'string' || !key.startsWith('L:')) return null;
  const [rel, field] = key.slice(2).split('.');
  return rel && field ? { rel, field } : null;
}

/** Resolve how a bridge targetKey links rows: whether it's a relation name or a raw FK column. */
function resolveRelInfo(child: any, targetKey: any): { rel: string | null; fk: string; tk: string } {
  if (!child?.getFields || !targetKey) return { rel: null, fk: targetKey, tk: 'id' };
  const fields = child.getFields() || [];
  let f = fields.find((x: any) => x.name === targetKey && (x.type === 'belongsTo' || x.type === 'hasOne'));
  if (f) return { rel: f.name, fk: f.foreignKey || `${f.name}_id`, tk: f.targetKey || 'id' };
  f = fields.find((x: any) => (x.type === 'belongsTo' || x.type === 'hasOne') && (x.foreignKey || `${x.name}_id`) === targetKey);
  if (f) return { rel: f.name, fk: targetKey, tk: f.targetKey || 'id' };
  return { rel: null, fk: targetKey, tk: 'id' };
}
/** Group digits with a thousands separator (dot, vi-VN style). Integers only. */
function groupThousands(n: any): string {
  const s = String(Math.trunc(num(n)));
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Inline Σ (sigma) fallback when the Lucide icon set isn't installed. currentColor + scalable. */
const SigmaSvg = ({ size = 14 }: { size?: number }) => (
  <span role="img" aria-label="sum" className="anticon" style={{ display: 'inline-flex', alignItems: 'center' }}>
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="18 4 6 4 12 12 6 20 18 20" />
    </svg>
  </span>
);

/** Totals-row label: the Lucide "sigma" icon (falls back to an inline Σ) + row count, localized tooltip. */
function TotalsLabel({ count }: { count: number }) {
  const { token } = theme.useToken();
  const useLucide = _Icon && _icons?.has?.('lucide-sigma');
  return (
    <span
      title={_t('Tổng')}
      style={{ whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 5, color: token.colorTextSecondary, fontWeight: 600 }}
    >
      {useLucide ? <_Icon type="lucide-sigma" style={{ fontSize: 14 }} /> : <SigmaSvg />}
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{count}</span>
    </span>
  );
}

// ---- Segmented picker for the settings dialog ---------------------------------------------------
const SegPicker = (props: any) => (
  <SegmentedGroup {...SEG_PROPS} value={props.value ?? props.defaultValue} onChange={(v: any) => props.onChange?.(v)} options={props.options || []} />
);

// ---- qty stepper -------------------------------------------------------------------------------
// layout: 'pill' (joined) | 'split' (two separate circular icons with the number between).
// fullWidth: fill the container (column) — the number flexes so column width controls the size.
function QtyStepper({
  value,
  onChange,
  disabled,
  size = 'default',
  layout = 'pill',
  fullWidth = false,
  align = 'center',
  accent,
}: {
  value: any;
  onChange: (n: number) => void;
  disabled?: boolean;
  size?: 'small' | 'default';
  layout?: 'pill' | 'split';
  fullWidth?: boolean;
  align?: 'left' | 'center' | 'right';
  accent?: string;
}) {
  const v = num(value);
  const h = size === 'small' ? 24 : 30;
  const acc = usePrimary(accent);
  const { token } = theme.useToken();
  const justify = align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center';
  // textAlign must target the inner <input> — the wrapper style doesn't reach it.
  const inputCls = css`
    .ant-input-number-input {
      text-align: ${align} !important;
      font-weight: 500;
      font-variant-numeric: tabular-nums;
    }
  `;
  const numInput = (
    <InputNumber
      size="small"
      controls={false}
      variant="borderless"
      min={0}
      value={v}
      disabled={disabled}
      onChange={(n) => onChange(num(n))}
      formatter={(val) => groupThousands(val)}
      parser={(val) => (val || '').replace(/[^\d]/g, '')}
      className={inputCls}
      style={{
        width: fullWidth ? '100%' : Math.max(size === 'small' ? 40 : 48, groupThousands(v).length * (size === 'small' ? 8 : 9) + 14),
        fontSize: size === 'small' ? 13 : 14,
      }}
    />
  );
  const midStyle: React.CSSProperties = fullWidth
    ? { flex: 1, minWidth: 0, display: 'flex', justifyContent: justify }
    : { display: 'inline-flex', justifyContent: justify };

  if (layout === 'split') {
    const circBtn = (isPrimary?: boolean, off?: boolean): React.CSSProperties => ({
      width: h,
      height: h,
      minWidth: h,
      flexShrink: 0,
      borderRadius: '50%',
      border: `1px solid ${off ? token.colorBorderSecondary : isPrimary ? acc : token.colorBorder}`,
      background: 'transparent',
      cursor: off ? 'not-allowed' : 'pointer',
      color: off ? token.colorTextDisabled : isPrimary ? acc : token.colorText,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: size === 'small' ? 12 : 14,
    });
    return (
      <span style={{ display: fullWidth ? 'flex' : 'inline-flex', alignItems: 'center', gap: 6, width: fullWidth ? '100%' : 'auto' }}>
        <button type="button" style={circBtn(false, disabled || v <= 0)} disabled={disabled || v <= 0} onClick={() => onChange(Math.max(0, v - 1))}>
          <MinusOutlined />
        </button>
        <span style={midStyle}>{numInput}</span>
        <button type="button" style={circBtn(true)} disabled={disabled} onClick={() => onChange(v + 1)}>
          <PlusOutlined />
        </button>
      </span>
    );
  }

  // pill (joined)
  const bw = size === 'small' ? 26 : 30;
  const stepBtn = (dir: -1 | 1, isPrimary?: boolean): React.CSSProperties => ({
    width: bw,
    height: h,
    minWidth: bw,
    flexShrink: 0,
    border: 'none',
    background: 'transparent',
    cursor: disabled || (dir < 0 && v <= 0) ? 'not-allowed' : 'pointer',
    color: disabled || (dir < 0 && v <= 0) ? token.colorTextDisabled : isPrimary ? acc : token.colorText,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 14,
    transition: 'background .15s',
  });
  return (
    <span
      style={{
        display: fullWidth ? 'flex' : 'inline-flex',
        alignItems: 'center',
        height: h,
        width: fullWidth ? '100%' : 'auto',
        border: `1px solid ${token.colorBorder}`,
        borderRadius: h / 2,
        overflow: 'hidden',
        background: token.colorBgContainer,
      }}
    >
      <button
        type="button"
        style={stepBtn(-1)}
        disabled={disabled || v <= 0}
        onClick={() => onChange(Math.max(0, v - 1))}
        onMouseEnter={(e) => !(disabled || v <= 0) && (e.currentTarget.style.background = token.colorFillTertiary)}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        <MinusOutlined />
      </button>
      <span style={midStyle}>{numInput}</span>
      <button
        type="button"
        style={stepBtn(1, true)}
        disabled={disabled}
        onClick={() => onChange(v + 1)}
        onMouseEnter={(e) => !disabled && (e.currentTarget.style.background = token.colorPrimaryBg)}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        <PlusOutlined />
      </button>
    </span>
  );
}

// ---- delete affordance --------------------------------------------------------------------------
function DeleteBtn({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  const { token } = theme.useToken();
  const [hover, setHover] = React.useState(false);
  if (disabled) return null;
  return (
    <span
      role="button"
      onMouseDown={(event) => {
        const active = document.activeElement as HTMLElement | null;
        if (!active || (event.currentTarget as any).contains(active)) return;
        active.blur?.();
      }}
      onClick={() => setTimeout(onClick)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 24,
        height: 24,
        borderRadius: '50%',
        cursor: 'pointer',
        color: hover ? 'var(--colorError,#ff4d4f)' : token.colorTextTertiary,
        background: hover ? 'var(--colorErrorBg,#fff1f0)' : 'transparent',
        transition: 'all .15s',
      }}
    >
      <CloseOutlined />
    </span>
  );
}

// ---- shared row-ops hook ------------------------------------------------------------------------
function useRowOps(props: any) {
  const { onChange, getCurrentValue, pageSize, columns } = props;
  const [currentPage, setCurrentPage] = React.useState(1);
  const [currentPageSize, setCurrentPageSize] = React.useState(pageSize || 10);
  const rawCurrentValue = getCurrentValue();
  const currentValue = React.useMemo(() => normalizeSubTableRows(rawCurrentValue), [rawCurrentValue]);
  React.useEffect(() => {
    setCurrentPageSize(pageSize || 10);
  }, [pageSize]);
  React.useEffect(() => {
    if (props.resetPage) setCurrentPage(1);
  }, [props.resetPage]);

  const applyValue = React.useCallback((next: any) => onChange?.(normalizeSubTableRows(next)), [onChange]);
  const getLatestValue = React.useCallback(() => normalizeSubTableRows(getCurrentValue()), [getCurrentValue]);
  React.useEffect(() => {
    if (currentValue !== rawCurrentValue) applyValue(currentValue);
  }, [applyValue, currentValue, rawCurrentValue]);

  const handleAdd = () => {
    if (props.allowCreate === false) return;
    const newRow: any = { __is_new__: true };
    (columns || []).forEach((col: any) => {
      if (col.dataIndex) newRow[col.dataIndex] = undefined;
    });
    const nv = [...getLatestValue(), newRow];
    setCurrentPage(Math.ceil(nv.length / currentPageSize));
    applyValue(nv);
  };
  const handleDelete = (index: number) => {
    const nv = [...getLatestValue()];
    nv.splice(index, 1);
    const lastPage = Math.ceil(nv.length / currentPageSize);
    setCurrentPage(currentPage > lastPage ? lastPage : currentPage);
    applyValue(nv);
  };
  const handleCellChange = (rowIdx: number, dataIndex: string, cellValue: any) => {
    applyValue(getLatestValue().map((row: any, idx: number) => (idx === rowIdx ? { ...row, [dataIndex]: cellValue } : row)));
  };

  // Broadcast membership {key: qty} so source-side controls (checkbox / +/− with number) reflect it.
  // Runs here (not in useBridge) because this hook re-renders on every value change. setMembers dedupes.
  const bridgeChannel = props.ptdlBridgeChannel;
  const bridgeOn = !!props.ptdlBridgeEnabled;
  const counts = React.useMemo(() => {
    const m: Record<string, number> = {};
    if (!bridgeOn || !bridgeChannel) return m;
    const ri = resolveRelInfo(props.childCollection, props.ptdlBridgeTargetKey);
    const qf = props.ptdlQtyField;
    for (const r of currentValue) {
      const k = r?.[ri.fk] ?? (ri.rel ? r?.[ri.rel]?.[ri.tk || 'id'] : undefined);
      if (k == null) continue;
      m[String(k)] = (m[String(k)] || 0) + (qf ? num(r[qf]) : 1);
    }
    return m;
  }, [bridgeOn, bridgeChannel, currentValue, props.childCollection, props.ptdlBridgeTargetKey, props.ptdlQtyField]);
  React.useEffect(() => {
    if (!bridgeOn || !bridgeChannel) return;
    getBridge().setMembers(bridgeChannel, counts);
  }, [bridgeOn, bridgeChannel, counts]);

  return { currentPage, setCurrentPage, currentPageSize, setCurrentPageSize, currentValue, applyValue, getLatestValue, handleAdd, handleDelete, handleCellChange };
}

// ---- totals -------------------------------------------------------------------------------------
function useTotals(currentValue: any[], sumFields: string[], enabled: boolean) {
  return React.useMemo(() => {
    const acc: Record<string, number> = {};
    if (!enabled) return acc;
    for (const f of sumFields) acc[f] = 0;
    for (const row of currentValue) for (const f of sumFields) acc[f] += num(row?.[f]);
    return acc;
  }, [currentValue, sumFields, enabled]);
}

// ---- lookups: fetch related records on demand, map FK → record ----------------------------------
function useLookups(currentValue: any[], needed: Array<{ rel: string; field: string }>, childCollection: any, api: any) {
  // group needed fields by relation
  const relMeta = React.useMemo(() => {
    const m: Record<string, { fk: string; target: string; tk: string; fields: Set<string> }> = {};
    for (const lk of needed) {
      if (!lk?.rel || !lk?.field) continue;
      if (!m[lk.rel]) {
        const f = childCollection?.getField?.(lk.rel);
        if (!f) continue;
        m[lk.rel] = { fk: f.foreignKey || `${lk.rel}_id`, target: f.target, tk: f.targetKey || 'id', fields: new Set() };
      }
      m[lk.rel]?.fields.add(lk.field);
    }
    return m;
  }, [JSON.stringify(needed), childCollection]);

  // signature of the FK ids present, so we refetch only when the set changes
  const idsSig = React.useMemo(() => {
    const parts: string[] = [];
    for (const rel of Object.keys(relMeta)) {
      const { fk, tk } = relMeta[rel];
      const ids = currentValue.map((r) => r?.[fk] ?? r?.[rel]?.[tk]).filter((v) => v != null);
      parts.push(rel + ':' + [...new Set(ids)].sort().join(','));
    }
    return parts.join('|');
  }, [currentValue, relMeta]);

  const [maps, setMaps] = React.useState<Record<string, Record<string, any>>>({});
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const next: Record<string, Record<string, any>> = {};
      for (const rel of Object.keys(relMeta)) {
        const meta = relMeta[rel];
        const map: Record<string, any> = {};
        // seed from inline relation objects if already present on the row
        for (const r of currentValue) {
          const obj = r?.[rel];
          if (obj && typeof obj === 'object' && obj[meta.tk] != null) map[String(obj[meta.tk])] = obj;
        }
        const ids = [...new Set(currentValue.map((r) => r?.[meta.fk] ?? r?.[rel]?.[meta.tk]).filter((v) => v != null).map(String))];
        const missing = ids.filter((id) => {
          const rec = map[id];
          return !rec || [...meta.fields].some((f) => rec[f] === undefined);
        });
        if (missing.length && api?.request) {
          try {
            const res = await api.request({
              url: `${meta.target}:list`,
              params: { filter: { [meta.tk]: { $in: missing } }, fields: [meta.tk, ...meta.fields], pageSize: 200 },
            });
            for (const rec of res?.data?.data || []) map[String(rec[meta.tk])] = { ...(map[String(rec[meta.tk])] || {}), ...rec };
          } catch (e) {
            /* ignore fetch errors — show blank */
          }
        }
        next[rel] = map;
      }
      if (!cancelled) setMaps(next);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsSig]);

  return React.useCallback(
    (row: any, lk: { rel: string; field: string }) => {
      const meta = relMeta[lk.rel];
      if (!meta) return row?.[lk.rel]?.[lk.field];
      const id = row?.[meta.fk] ?? row?.[lk.rel]?.[meta.tk];
      const rec = (id != null && maps[lk.rel]?.[String(id)]) || row?.[lk.rel];
      return rec?.[lk.field];
    },
    [relMeta, maps],
  );
}

/** Collect every rel.field the card view needs (card fields configured as `L:rel.field`). */
function collectNeededLookups(props: any): Array<{ rel: string; field: string }> {
  const out: Array<{ rel: string; field: string }> = [];
  for (const key of [props.ptdlTitleField, props.ptdlSubtitleField, props.ptdlImageField, props.ptdlPriceField]) {
    const p = parseLookupKey(key);
    if (p) out.push(p);
  }
  return out;
}

// ---- footer (Add / Select) — polished buttons ---------------------------------------------------
function ProFooter({ props, ops }: { props: any; ops: any }) {
  const { t } = useTranslation();
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 36, padding: '2px 0' }}>
      {props.allowAddNew && (props.allowCreate || props.isConfigMode) && (
        <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={ops.handleAdd} disabled={props.disabled} style={{ borderRadius: 8 }}>
          {t('Add new')}
        </Button>
      )}
      {props.allowSelectExistingRecord && (
        <Button size="small" icon={<ZoomInOutlined />} onClick={() => props.onSelectExitRecordClick?.(ops.setCurrentPage, ops.currentPageSize)} disabled={props.disabled} style={{ borderRadius: 8 }}>
          {t('Select record')}
        </Button>
      )}
    </div>
  );
}

// ---- TABLE view ---------------------------------------------------------------------------------
function TableView(props: any) {
  const { t } = useTranslation();
  const { token } = theme.useToken();
  const ops = useRowOps(props);
  const { columns, disabled, allowDisassociation, filterTargetKey = 'id', parentFieldIndex, parentItem } = props;
  const { currentPage, currentPageSize, currentValue } = ops;
  const getRecordIdentity = React.useCallback((r: any) => getSubTableRowIdentity(r, filterTargetKey), [filterTargetKey]);

  const sumFields: string[] = Array.isArray(props.ptdlSumFields) ? props.ptdlSumFields : [];
  const showTotals = props.ptdlShowTotals !== false && sumFields.length > 0;
  const totals = useTotals(currentValue, sumFields, showTotals);
  const qtyField: string | undefined = props.ptdlQtyField || undefined;

  // native/data columns (+ qty stepper) mapped with the native cell-render calling convention
  const dataCols = columns.map((col: any) => ({
    ...col,
    render: (text: any, record: any, rowIdx: number) => {
      const pageRowIdx = (currentPage - 1) * currentPageSize + rowIdx;
      if (qtyField && col.dataIndex === qtyField) {
        return (
          <QtyStepper
            size="small"
            layout={props.ptdlStepperStyle === 'split' ? 'split' : 'pill'}
            fullWidth={props.ptdlStepperFullWidth !== false}
            align={props.ptdlStepperAlign || 'center'}
            accent={props.ptdlStepperColor}
            value={record?.[qtyField]}
            disabled={disabled}
            onChange={(n) => ops.handleCellChange(pageRowIdx, qtyField, n)}
          />
        );
      }
      const rowIdentity = getRecordIdentity(record) ?? `row:${pageRowIdx}`;
      const rowBindingKey = `${rowIdentity}:${pageRowIdx}`;
      const columnKey = col.dataIndex ?? col.key ?? 'cell';
      if (!col.render) return;
      return col.render({
        record,
        rowIdx: pageRowIdx,
        id: `field-${String(columnKey)}-${rowBindingKey}`,
        value: text,
        parentFieldIndex,
        parentItem,
        onChange: (value: any) => ops.handleCellChange(pageRowIdx, col.dataIndex, value?.target?.value ?? value),
        ['aria-describedby']: `field-${String(columnKey)}-${rowBindingKey}`,
      });
    },
  }));

  const deleteCol = !disabled
    ? [
        {
          title: '',
          key: 'delete',
          width: 50,
          align: 'center' as const,
          fixed: 'right' as const,
          render: (v: any, record: any, index: number) => {
            const pageRowIdx = (currentPage - 1) * currentPageSize + index;
            if (!allowDisassociation && !(record.__is_new__ || record.__is_stored__)) return null;
            return <DeleteBtn onClick={() => ops.handleDelete(pageRowIdx)} />;
          },
        },
      ]
    : [];

  const finalColumns = [...dataCols, ...deleteCol];

  const pagedDataSource = React.useMemo(() => {
    if (!currentValue.length) return [];
    const start = (currentPage - 1) * currentPageSize;
    return currentValue.slice(start, start + currentPageSize);
  }, [currentValue, currentPage, currentPageSize]);

  const pagination = React.useMemo(
    () =>
      ({
        style: { position: 'absolute', right: 0, bottom: 0 },
        current: currentPage,
        pageSize: currentPageSize,
        total: currentValue.length,
        onChange: (page: number, size: number) => {
          ops.setCurrentPage(page);
          ops.setCurrentPageSize(size);
        },
        showSizeChanger: true,
        showTotal: (total: number) => t('Total {{count}} items', { count: total }),
      }) as any,
    [currentPage, currentPageSize, currentValue.length, t],
  );

  // Label cell SPANS every leading non-sum column (row-index col, name col, …) up to the first sum
  // column — a narrow row-index column (48px) alone made "Tổng (n)" wrap onto 2 lines and look
  // misaligned against the real column boundaries. colSpan also keeps the sum-column cells lined up
  // exactly under their data columns, matching the body rows.
  const summary = showTotals
    ? () => {
        const rawFirstSumIdx = finalColumns.findIndex((col: any) => col.dataIndex && sumFields.includes(col.dataIndex));
        const labelSpan = rawFirstSumIdx > 0 ? rawFirstSumIdx : Math.max(1, finalColumns.length - sumFields.length);
        return (
          <Table.Summary fixed>
            <Table.Summary.Row style={{ fontWeight: 600, background: token.colorFillQuaternary }}>
              <Table.Summary.Cell index={0} colSpan={labelSpan}>
                <TotalsLabel count={currentValue.length} />
              </Table.Summary.Cell>
              {finalColumns.slice(labelSpan).map((col: any, j: number) => {
                const i = labelSpan + j;
                const di = col.dataIndex;
                if (di && sumFields.includes(di)) {
                  // align to the column's OWN align (usually left, matching the data cells) — not forced right
                  return (
                    <Table.Summary.Cell key={i} index={i} align={col.align}>
                      {formatNumber(totals[di], undefined)}
                    </Table.Summary.Cell>
                  );
                }
                return <Table.Summary.Cell key={i} index={i} />;
              })}
            </Table.Summary.Row>
          </Table.Summary>
        );
      }
    : undefined;

  return (
    <Form.Item>
      <Table
        dataSource={pagedDataSource}
        columns={finalColumns as any}
        rowKey={(record) => getRecordIdentity(record) ?? ''}
        tableLayout="fixed"
        scroll={{ x: 'max-content' }}
        pagination={pagination}
        summary={summary}
        locale={{ emptyText: <ProEmpty props={props} /> }}
        footer={() => <ProFooter props={props} ops={ops} />}
      />
    </Form.Item>
  );
}

function ProEmpty({ props }: { props: any }) {
  const { t } = useTranslation();
  return (
    <span>
      {props.disabled
        ? t('No data')
        : props.allowAddNew && props.allowSelectExistingRecord
          ? t('Please add or select record')
          : props.allowAddNew
            ? t('Please add record')
            : props.allowSelectExistingRecord
              ? t('Please select record')
              : t('No data')}
    </span>
  );
}

// ---- CARD / LIST view ---------------------------------------------------------------------------
function CardListView(props: any) {
  const { token } = theme.useToken();
  const ops = useRowOps(props);
  const { currentValue } = ops;
  const mode = props.ptdlViewMode === 'list' ? 'list' : 'cards';
  const { disabled, allowDisassociation } = props;
  const qtyField = props.ptdlQtyField;

  const getLk = useLookups(currentValue, collectNeededLookups(props), props.childCollection, props.api);
  // resolve a config field key that may be a direct dataIndex OR a `L:rel.field` lookup
  const resolve = (row: any, key: string) => {
    const lk = parseLookupKey(key);
    if (lk) return getLk(row, lk);
    return key ? row?.[key] : undefined;
  };

  const sumFields: string[] = Array.isArray(props.ptdlSumFields) ? props.ptdlSumFields : [];
  const showTotals = props.ptdlShowTotals !== false && sumFields.length > 0;
  const totals = useTotals(currentValue, sumFields, showTotals);

  const imageUrl = (row: any): string | null => {
    const v = resolve(row, props.ptdlImageField);
    if (!v) return null;
    if (typeof v === 'string') return v;
    if (Array.isArray(v)) return v[0]?.url || null;
    return v.url || null;
  };
  const canRemove = (record: any) => !disabled && (allowDisassociation || record.__is_new__ || record.__is_stored__);

  const renderRow = (row: any, absIdx: number) => {
    const title = props.ptdlTitleField ? cellText(resolve(row, props.ptdlTitleField)) : cellText(row?.id);
    const subtitle = props.ptdlSubtitleField ? cellText(resolve(row, props.ptdlSubtitleField)) : '';
    const price = props.ptdlPriceField ? num(resolve(row, props.ptdlPriceField)) : null;
    const qty = qtyField ? num(row?.[qtyField]) : null;
    const lineTotal = price != null && qty != null ? price * qty : null;
    const img = imageUrl(row);
    const remove = canRemove(row) ? <DeleteBtn onClick={() => ops.handleDelete(absIdx)} /> : null;
    const stepper = qtyField ? (
      <QtyStepper size="small" layout={props.ptdlStepperStyle === 'split' ? 'split' : 'pill'} align={props.ptdlStepperAlign || 'center'} accent={props.ptdlStepperColor} value={row?.[qtyField]} disabled={disabled} onChange={(n) => ops.handleCellChange(absIdx, qtyField, n)} />
    ) : null;
    const priceEls = (
      <>
        {price != null && props.ptdlPriceField && <span style={{ color: token.colorTextTertiary, fontSize: 13 }}>{formatNumber(price, undefined)}</span>}
        {lineTotal != null && <span style={{ color: token.colorPrimary, fontWeight: 600 }}>{formatNumber(lineTotal, undefined)}</span>}
      </>
    );

    if (mode === 'list') {
      return (
        <div key={absIdx} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 10px', borderBottom: `1px dashed ${token.colorBorderSecondary}` }}>
          {img && <img src={img} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6 }} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title || '—'}</div>
            {subtitle && <div style={{ fontSize: 12, color: token.colorTextTertiary }}>{subtitle}</div>}
          </div>
          <Space size={12}>{priceEls}</Space>
          {stepper}
          <span style={{ width: 24, textAlign: 'center' }}>{remove}</span>
        </div>
      );
    }
    return (
      <div key={absIdx} style={{ position: 'relative', border: `1px solid ${token.colorBorderSecondary}`, borderRadius: 10, padding: 12, background: token.colorBgContainer, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {remove && <span style={{ position: 'absolute', top: 8, right: 8 }}>{remove}</span>}
        {img && <img src={img} alt="" style={{ width: '100%', height: 96, objectFit: 'cover', borderRadius: 8 }} />}
        <div style={{ fontWeight: 500, lineHeight: 1.3, paddingRight: 20 }}>{title || '—'}</div>
        {subtitle && <div style={{ fontSize: 12, color: token.colorTextTertiary }}>{subtitle}</div>}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 'auto' }}>
          <Space direction="vertical" size={0}>{priceEls}</Space>
          {stepper}
        </div>
      </div>
    );
  };

  const rows = currentValue.map((row: any, idx: number) => renderRow(row, idx));

  return (
    <Form.Item>
      <div style={{ border: `1px solid ${token.colorBorderSecondary}`, borderRadius: 10, overflow: 'hidden' }}>
        {currentValue.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: token.colorTextQuaternary }}>
            <ProEmpty props={props} />
          </div>
        ) : mode === 'cards' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10, padding: 12 }}>{rows}</div>
        ) : (
          <div>{rows}</div>
        )}
        {showTotals && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 18, padding: '10px 14px', borderTop: `1px solid ${token.colorBorderSecondary}`, background: token.colorFillQuaternary, fontWeight: 600 }}>
            <span style={{ color: token.colorTextSecondary }}><TotalsLabel count={currentValue.length} /></span>
            {sumFields.map((f) => (
              <span key={f}>{formatNumber(totals[f], undefined)}</span>
            ))}
          </div>
        )}
        <div style={{ padding: '4px 10px', borderTop: `1px solid ${token.colorBorderSecondary}` }}>
          <ProFooter props={props} ops={ops} />
        </div>
      </div>
    </Form.Item>
  );
}

// ---- bridge: subscribe to a channel; another block publishes add/inc/dec/remove events -----------
function useBridge(props: any) {
  const enabled = !!props.ptdlBridgeEnabled;
  const channel = props.ptdlBridgeChannel;
  const targetKey = props.ptdlBridgeTargetKey;
  // keep the latest handlers/config in a ref so the long-lived subscription never goes stale
  // Resolve how to link/match rows. targetKey may be EITHER a relation name ('product') OR a raw FK
  // column ('product_id'); resolveRelInfo derives {rel, fk, tk} either way.
  const relInfo = React.useMemo(() => resolveRelInfo(props.childCollection, targetKey), [props.childCollection, targetKey]);

  const ref = React.useRef<any>({});
  ref.current = {
    sourceKey: props.ptdlBridgeSourceKey || 'id',
    relInfo,
    qtyField: props.ptdlQtyField,
    getCurrentValue: props.getCurrentValue,
    onChange: props.onChange,
    fieldMap: props.ptdlBridgeFieldMap,
  };
  React.useEffect(() => {
    if (!enabled || !channel || !targetKey) return;
    const bridge = getBridge();
    const unsub = bridge.subscribe(channel, (ev: any) => {
      const { sourceKey, relInfo, qtyField, getCurrentValue, onChange, fieldMap } = ref.current;
      const { rel, fk, tk } = relInfo || {};
      if (!onChange || !fk) return;
      const cur = normalizeSubTableRows((getCurrentValue && getCurrentValue()) || []);
      const rec = ev?.record || {};
      const matchVal = rec[sourceKey];
      // match an existing row by the FK column OR by the attached relation object's id
      const idx = cur.findIndex(
        (r: any) => String(r?.[fk]) === String(matchVal) || (rel && r?.[rel] && String(r[rel][tk || 'id']) === String(matchVal)),
      );
      const delta = num(ev?.delta) || 1;
      const action = ev?.action || 'add';
      const next = cur.slice();
      const bump = (row: any, by: number) => (qtyField ? { ...row, [qtyField]: Math.max(0, num(row[qtyField]) + by) } : row);
      if (action === 'remove') {
        if (idx >= 0) next.splice(idx, 1);
      } else if (action === 'dec') {
        if (idx >= 0) {
          const nq = num(next[idx][qtyField]) - delta;
          if (qtyField && nq <= 0) next.splice(idx, 1);
          else next[idx] = bump(next[idx], -delta);
        }
      } else if (action === 'set') {
        if (idx >= 0 && qtyField) next[idx] = { ...next[idx], [qtyField]: Math.max(0, delta) };
      } else {
        // add | inc
        if (idx >= 0) next[idx] = bump(next[idx], action === 'inc' ? delta : 1);
        else {
          const row: any = { __is_new__: true, [fk]: matchVal };
          if (qtyField) row[qtyField] = action === 'inc' ? delta : 1;
          // attach the source record as the relation object so the association column / lookup shows it
          if (rel && rec && typeof rec === 'object') row[rel] = rec;
          if (fieldMap && typeof fieldMap === 'object') for (const k of Object.keys(fieldMap)) if (fieldMap[k]) row[fieldMap[k]] = rec[k];
          next.push(row);
        }
      }
      onChange(normalizeSubTableRows(next));
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, channel, targetKey]);
}

// ---- top-level view switch ----------------------------------------------------------------------
function SubtableProField(props: any) {
  useBridge(props);
  const mode = props.ptdlViewMode;
  if (mode === 'cards' || mode === 'list') return <CardListView {...props} />;
  return <TableView {...props} />;
}

// ---- source-side control for the "Send row" action (plus/minus group or checkbox) ---------------
/** Presentational read-only +/− control. layout: 'pill' (joined) | 'split' (two circular icons). */
function PlusMinusPill({ qty, showCount, size, minusDisabled, onMinus, onPlus, layout = 'pill', accent }: any) {
  const h = size === 'default' ? 32 : 24;
  const acc = usePrimary(accent);
  const { token } = theme.useToken();
  const numTxt = showCount ? (
    <span style={{ minWidth: size === 'default' ? 40 : 34, padding: '0 8px', textAlign: 'center', fontWeight: 600, fontSize: size === 'default' ? 14 : 13, fontVariantNumeric: 'tabular-nums', lineHeight: `${h}px` }}>
      {groupThousands(qty)}
    </span>
  ) : null;

  if (layout === 'split') {
    const circBtn = (isPrimary?: boolean, off?: boolean): React.CSSProperties => ({
      width: h,
      height: h,
      minWidth: h,
      borderRadius: '50%',
      border: `1px solid ${off ? token.colorBorderSecondary : isPrimary ? acc : token.colorBorder}`,
      background: 'transparent',
      cursor: off ? 'not-allowed' : 'pointer',
      color: off ? token.colorTextDisabled : isPrimary ? acc : token.colorText,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: size === 'default' ? 14 : 12,
    });
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <button type="button" style={circBtn(false, minusDisabled)} disabled={minusDisabled} onClick={onMinus}>
          <MinusOutlined />
        </button>
        {numTxt}
        <button type="button" style={circBtn(true)} onClick={onPlus}>
          <PlusOutlined />
        </button>
      </span>
    );
  }

  const bw = size === 'default' ? 30 : 26;
  const stepBtn = (isPrimary?: boolean, isDisabled?: boolean): React.CSSProperties => ({
    width: bw,
    height: h,
    minWidth: bw,
    border: 'none',
    background: 'transparent',
    cursor: isDisabled ? 'not-allowed' : 'pointer',
    color: isDisabled ? token.colorTextDisabled : isPrimary ? acc : token.colorText,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: size === 'default' ? 15 : 13,
  });
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', height: h, border: `1px solid ${token.colorBorder}`, borderRadius: h / 2, overflow: 'hidden', background: token.colorBgContainer }}>
      <button type="button" style={stepBtn(false, minusDisabled)} disabled={minusDisabled} onClick={onMinus}>
        <MinusOutlined />
      </button>
      {showCount && (
        <span style={{ minWidth: size === 'default' ? 44 : 36, padding: '0 8px', textAlign: 'center', fontWeight: 600, fontSize: size === 'default' ? 14 : 13, fontVariantNumeric: 'tabular-nums', borderLeft: `1px solid ${token.colorBorderSecondary}`, borderRight: `1px solid ${token.colorBorderSecondary}`, lineHeight: `${h}px` }}>
          {groupThousands(qty)}
        </span>
      )}
      <button type="button" style={stepBtn(true)} onClick={onPlus}>
        <PlusOutlined />
      </button>
    </span>
  );
}

function BridgeActionControl({ model }: { model: any }) {
  const display = model.props?.ptdlDisplay || 'plusminus';
  const channel = model.props?.channel;
  const showCount = model.props?.ptdlShowCount !== false;
  const size = model.props?.ptdlSize === 'default' ? 'default' : 'small';
  const record = model.context?.record;
  const id = record?.id;
  const pub = (action: string) => {
    if (channel && record) getBridge().publish(channel, { action, record });
  };
  const [counts, setCounts] = React.useState<Record<string, number>>(() => (channel ? getBridge().getMembers(channel) : {}));
  React.useEffect(() => {
    if (!channel) return;
    setCounts(getBridge().getMembers(channel));
    return getBridge().onMembers(channel, setCounts);
  }, [channel]);
  const qty = num(counts[String(id)]);
  const inCart = qty > 0;

  if (display === 'checkbox') {
    // antd Checkbox has no size prop → scale it so Nhỏ/Vừa actually differ.
    return (
      <Checkbox
        checked={inCart}
        onChange={(e) => pub(e.target.checked ? 'add' : 'remove')}
        style={{ transform: size === 'default' ? 'scale(1.4)' : 'none', transformOrigin: 'left center' }}
      />
    );
  }
  return (
    <PlusMinusPill
      qty={qty}
      showCount={showCount}
      size={size}
      accent={model.props?.pmColor}
      layout={model.props?.ptdlPmStyle === 'split' ? 'split' : 'pill'}
      minusDisabled={!inCart}
      onMinus={() => pub('dec')}
      onPlus={() => pub('add')}
    />
  );
}

// Live preview for the action settings dialog — reads the form values, renders the chosen control.
const PtdlActionPreview: any = observer(() => {
  const form: any = useForm();
  const { token } = theme.useToken();
  const v = form?.values || {};
  const display = v.ptdlDisplay || 'plusminus';
  const size = v.ptdlSize === 'default' ? 'default' : 'small';
  const [qty, setQty] = React.useState(1234);
  const box: React.CSSProperties = { padding: '12px 14px', background: token.colorFillQuaternary, borderRadius: 8, border: `1px dashed ${token.colorBorder}`, display: 'inline-flex', gap: 12, alignItems: 'center' };
  const hint = <span style={{ color: token.colorTextTertiary, fontSize: 12 }}>{_t('Ví dụ')}</span>;
  if (display === 'button') {
    return (
      <div style={box}>
        <Button type="primary" size={size} icon={<PlusOutlined />}>
          {_t('Thêm dòng')}
        </Button>
        {hint}
      </div>
    );
  }
  if (display === 'checkbox') {
    return (
      <div style={box}>
        <Checkbox checked={qty > 0} onChange={(e) => setQty(e.target.checked ? 1 : 0)} style={{ transform: size === 'default' ? 'scale(1.4)' : 'none', transformOrigin: 'left center' }} />
        {hint}
      </div>
    );
  }
  return (
    <div style={box}>
      <PlusMinusPill qty={qty} showCount={v.ptdlShowCount !== false} size={size} accent={v.pmColor} layout={v.ptdlPmStyle === 'split' ? 'split' : 'pill'} minusDisabled={qty <= 0} onMinus={() => setQty((q) => Math.max(0, q - 1))} onPlus={() => setQty((q) => q + 1)} />
      {hint}
    </div>
  );
});

// Live preview for the Sub-table Pro settings dialog — shows the qty stepper in the chosen style + totals.
const PtdlSubtablePreview: any = observer(() => {
  const form: any = useForm();
  const { token } = theme.useToken();
  const v = form?.values || {};
  const [qty, setQty] = React.useState(12);
  const hasQty = !!v.qtyField;
  const style = v.stepperStyle === 'split' ? 'split' : 'pill';
  const full = v.stepperFullWidth !== false;
  const hasTotals = v.showTotals !== false && Array.isArray(v.sumFields) && v.sumFields.length > 0;
  return (
    <div style={{ padding: '14px 16px', background: token.colorFillQuaternary, borderRadius: 8, border: `1px dashed ${token.colorBorder}` }}>
      {hasQty ? (
        <div>
          <div style={{ fontSize: 11, color: token.colorTextTertiary, marginBottom: 6 }}>{_t('Nút số lượng')}{full ? ` (${_t('full-width theo cột')})` : ''}</div>
          <div style={{ width: full ? 200 : 'auto', border: full ? `1px dashed ${token.colorBorderSecondary}` : 'none', borderRadius: 6, padding: full ? 4 : 0 }}>
            <QtyStepper size="small" layout={style} fullWidth={full} align={v.stepperAlign || 'center'} accent={v.stepperColor} value={qty} onChange={setQty} />
          </div>
        </div>
      ) : (
        <span style={{ color: token.colorTextTertiary, fontSize: 12 }}>{_t('Chọn "Cột số lượng" để bật nút +/−')}</span>
      )}
      {hasTotals && (
        <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end', gap: 16, fontWeight: 600, borderTop: `1px solid ${token.colorBorderSecondary}`, paddingTop: 8 }}>
          <span style={{ color: token.colorTextSecondary }}><TotalsLabel count={3} /></span>
          <span>1.680.000</span>
        </div>
      )}
    </div>
  );
});

// ---- model registration -------------------------------------------------------------------------
export function registerSubtablePro(deps: { flowEngine: any; flowSettings?: any }) {
  const { flowEngine, flowSettings } = deps;
  if (!flowEngine) {
    // eslint-disable-next-line no-console
    console.warn('[subtable-pro] missing flowEngine — skip');
    return;
  }
  const Base = flowEngine.getModelClass?.('SubTableFieldModel');
  if (!Base) {
    // eslint-disable-next-line no-console
    console.warn('[subtable-pro] SubTableFieldModel not registered — skip (are you on /v/?)');
    return;
  }
  // ── CRASH GUARD (defense-in-depth) ──────────────────────────────────────────────────────────────
  // A malformed o2m (missing reverse belongsTo / mismatched FK — exactly what app-builder ≤0.6.31 could
  // leave behind) yields a sub-table COLUMN whose `collectionField` can't resolve. Core then runs that
  // column's `beforeRender` flow → SubTableColumnModel's `subModel` step `defaultParams` calls
  // `getDefaultBindingByField(ctx, undefined)`, which reads `.interface` on `undefined` → TypeError. Because
  // core applies ALL columns through one SHARED `Promise.all` (FlowModel.applySubModelsBeforeRenderFlows),
  // that single rejection propagates to the parent sub-table's render flow and RENDER-LOOPS the whole app
  // ("đơ luôn" — freeze) when the user toggles the o2m sub-table field ON in an Add-new form. We can't patch
  // core's `getDefaultBindingByField`, so we ISOLATE each sub-model's `beforeRender` here: one broken column
  // degrades to a placeholder/empty column (its own cell ErrorBoundary handles the rest) instead of freezing
  // everything. Patched ONCE, as an own method on the core SubTableFieldModel prototype (shadows the inherited
  // FlowModel method) so it is scoped to sub-tables only and BOTH the native sub-table AND this Pro subclass
  // are protected. Idempotent + fully guarded (never throws at install time). Mirrors the crash-safe fallbacks
  // in column-resize/inline-field.
  try {
    const proto: any = (Base as any)?.prototype;
    if (proto && !proto.__ptdlColumnFlowIsolated && typeof proto.applySubModelsBeforeRenderFlows === 'function') {
      const orig = proto.applySubModelsBeforeRenderFlows;
      proto.applySubModelsBeforeRenderFlows = async function (subKey: any, inputArgs?: any, shared?: any) {
        try {
          // Re-implement core's loop but ISOLATE each sub-model so one unresolvable column can't reject the
          // shared Promise.all (core: `Promise.all(mapSubModels(k, s => s.dispatchEvent('beforeRender')))`).
          await Promise.all(
            (this.mapSubModels(subKey, async (sub: any) => {
              try {
                await sub.dispatchEvent('beforeRender', inputArgs);
              } catch (e) {
                // eslint-disable-next-line no-console
                console.warn('[subtable-pro] sub-table sub-model beforeRender skipped (unresolvable field / broken association)', subKey, e);
              }
            }) as any[]),
          );
        } catch (e) {
          // Last-resort: never let this method reject (that is what froze the app). Fall back to core.
          // eslint-disable-next-line no-console
          console.warn('[subtable-pro] isolated beforeRender loop failed — falling back to core', e);
          return orig.call(this, subKey, inputArgs, shared);
        }
      };
      proto.__ptdlColumnFlowIsolated = true;
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[subtable-pro] column-flow isolation guard failed to install', e);
  }
  const t = _t;

  if (flowSettings?.registerComponents) {
    try {
      registerFlowComponentsOnce(flowSettings, {
        PtdlGrid: SettingsGrid,
        CollapsibleSection,
        PtdlSeg: SegPicker,
        PtdlActionPreview,
        PtdlSubtablePreview,
        FormTab,
        'FormTab.TabPane': FormTab.TabPane,
        PtdlColor: ColorField,
        PtdlInput: (p: any) => <Input {...p} value={p.value} onChange={(e: any) => p.onChange?.(e?.target?.value)} />,
        ColumnSelect,
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[subtable-pro] registerComponents failed', e);
    }
  }

  class PtdlSubtableProFieldModel extends (Base as any) {
    render() {
      const columns = this.getColumns();
      const isConfigMode = !!this.context.flowSettingsEnabled;
      const fieldPathArray = this.context.fieldPathArray ?? this.parent?.context?.fieldPathArray;
      const onResetFieldValue = () => {
        const value: any[] = [];
        this.setProps({ value });
        this.context.blockModel?.setFieldValue?.(fieldPathArray, value);
      };
      return (
        <SubtableProField
          {...this.props}
          columns={columns}
          isConfigMode={isConfigMode}
          parentFieldIndex={this.context.fieldIndex}
          parentItem={this.context.item}
          filterTargetKey={this.collection?.filterTargetKey}
          getCurrentValue={() => this.getCurrentValue()}
          onResetFieldValue={onResetFieldValue}
          childCollection={this.collection}
          api={this.flowEngine?.context?.api}
        />
      );
    }
  }

  flowEngine.registerModels({ PtdlSubtableProFieldModel });
  try {
    (PtdlSubtableProFieldModel as any).define?.({ label: t('Sub-table Pro') });
  } catch (_) {
    /* optional */
  }

  const proFlow = {
    key: 'ptdlSubtablePro',
    title: t('Sub-table Pro'),
    sort: 500,
    steps: {
      settings: {
        title: t('Cấu hình Sub-table Pro'),
        uiMode: { type: 'dialog', props: { width: 580 } },
        uiSchema: (ctx: any) => {
          // Column `title` from getColumns() is a wrapped React element, not a string → fall back showed the
          // raw field name. Resolve the display label from the collection field's uiSchema title instead.
          const fieldTitleMap: Record<string, string> = {};
          const fieldTypeMap: Record<string, { type?: string; iface?: string }> = {};
          try {
            ((ctx?.model?.collection?.getFields?.() as any[]) || []).forEach((f) => {
              fieldTitleMap[f.name] = f?.uiSchema?.title || f?.title || f?.name;
              fieldTypeMap[f.name] = { type: f?.type, iface: f?.interface };
            });
          } catch (e) {
            /* ignore */
          }
          const labelOf = (c: any) => fieldTitleMap[c.dataIndex] || (typeof c.title === 'string' ? c.title : String(c.dataIndex));
          const cols = ((ctx?.model?.getColumns?.() as any[]) || [])
            .filter((c) => c && c.dataIndex)
            .map((c) => ({ label: labelOf(c), value: c.dataIndex, ...(fieldTypeMap[c.dataIndex] || {}) }));
          const relOptions = buildRelOptions(ctx?.model);
          const lookupFieldOptions = flattenLookupOptions(relOptions);
          const cardFieldOptions = [...cols, ...lookupFieldOptions];
          const isCard = rx((v: any) => v.viewMode === 'cards' || v.viewMode === 'list');
          const hasQty = rx((v: any) => !!v.qtyField);
          return {
            preview: { type: 'void', title: t('Xem trước'), 'x-decorator': 'FormItem', 'x-component': 'PtdlSubtablePreview' },
            tabs: {
              type: 'void',
              'x-component': 'FormTab',
              properties: {
                tabDisplay: {
                  type: 'void',
                  'x-component': 'FormTab.TabPane',
                  'x-component-props': { tab: t('Hiển thị') },
                  properties: {
                    viewMode: fi(t('Kiểu hiển thị'), 'PtdlSeg', {
                      componentProps: {
                        ...SEG_PROPS,
                        options: [
                          { label: t('Bảng'), value: 'table' },
                          { label: t('Danh sách'), value: 'list' },
                          { label: t('Thẻ'), value: 'cards' },
                        ],
                      },
                    }),
                    qtyField: fi(t('Cột số lượng (+/−)'), 'ColumnSelect', {
                      componentProps: { options: [{ label: t('— Không —'), value: '' }, ...cols], allowClear: true, style: { width: '100%' } },
                    }),
                    stepperGrid: {
                      type: 'void',
                      'x-component': 'PtdlGrid',
                      'x-component-props': { minColWidth: 170 },
                      'x-reactions': hasQty,
                      properties: {
                        stepperStyle: fi(t('Kiểu nút số lượng'), 'PtdlSeg', {
                          componentProps: { options: [{ label: t('Liền'), value: 'pill' }, { label: t('Tách 2 icon'), value: 'split' }] },
                        }),
                        stepperAlign: fi(t('Căn lề số'), 'PtdlSeg', {
                          componentProps: { options: [{ label: t('Trái'), value: 'left' }, { label: t('Giữa'), value: 'center' }, { label: t('Phải'), value: 'right' }] },
                        }),
                        stepperColor: fi(t('Màu nút (mặc định: primary)'), 'PtdlColor', {}),
                        stepperFullWidth: fi(t('Nút full-width (theo cột)'), 'Switch', { type: 'boolean' }),
                      },
                    },
                    cardGrid: {
                      type: 'void',
                      'x-component': 'PtdlGrid',
                      'x-component-props': { minColWidth: 240 },
                      'x-reactions': isCard,
                      properties: {
                        titleField: fi(t('Cột tiêu đề'), 'Select', { componentProps: { options: cardFieldOptions, allowClear: true, style: { width: '100%' } } }),
                        subtitleField: fi(t('Cột phụ đề'), 'Select', { componentProps: { options: cardFieldOptions, allowClear: true, style: { width: '100%' } } }),
                        imageField: fi(t('Cột ảnh'), 'Select', { componentProps: { options: cardFieldOptions, allowClear: true, style: { width: '100%' } } }),
                        priceField: fi(t('Cột đơn giá'), 'Select', { componentProps: { options: cardFieldOptions, allowClear: true, style: { width: '100%' } } }),
                      },
                    },
                  },
                },
                tabTotals: {
                  type: 'void',
                  'x-component': 'FormTab.TabPane',
                  'x-component-props': { tab: t('Dòng tổng') },
                  properties: {
                    showTotals: fi(t('Hiện dòng tổng'), 'Switch', { type: 'boolean' }),
                    sumFields: fi(t('Cột cần tính tổng'), 'Checkbox.Group', {
                      type: 'array',
                      componentProps: { options: cols },
                      reactions: rx((v: any) => v.showTotals !== false),
                    }),
                  },
                },
                tabBridge: {
                  type: 'void',
                  'x-component': 'FormTab.TabPane',
                  'x-component-props': { tab: t('Kết nối') },
                  properties: {
                    bridgeEnabled: fi(t('Bật nhận sự kiện từ block khác'), 'Switch', { type: 'boolean' }),
                    bridgeGrid: {
                      type: 'void',
                      'x-component': 'PtdlGrid',
                      'x-component-props': { minColWidth: 240 },
                      'x-reactions': rx((v: any) => !!v.bridgeEnabled),
                      properties: {
                        bridgeChannel: fi(t('Tên kênh'), 'PtdlInput', { componentProps: { placeholder: 'ch1' } }),
                        bridgeTargetKey: fi(t('Cột/quan hệ khóa khớp (vd Sản phẩm)'), 'ColumnSelect', { componentProps: { options: cols, allowClear: true, style: { width: '100%' } } }),
                        bridgeSourceKey: fi(t('Khóa trên bản ghi nguồn'), 'PtdlInput', { componentProps: { placeholder: 'id' } }),
                      },
                    },
                  },
                },
              },
            },
          };
        },
        defaultParams: {
          viewMode: 'table',
          qtyField: '',
          stepperStyle: 'pill',
          stepperAlign: 'center',
          stepperColor: '',
          stepperFullWidth: true,
          titleField: '',
          subtitleField: '',
          imageField: '',
          priceField: '',
          showTotals: true,
          sumFields: [],
          bridgeEnabled: false,
          bridgeChannel: 'ch1',
          bridgeTargetKey: '',
          bridgeSourceKey: 'id',
        },
        handler(ctx: any, params: any) {
          const p = params || {};
          ctx.model.setProps({
            ptdlViewMode: p.viewMode || 'table',
            ptdlQtyField: p.qtyField || '',
            ptdlStepperStyle: p.stepperStyle || 'pill',
            ptdlStepperAlign: p.stepperAlign || 'center',
            ptdlStepperColor: p.stepperColor || '',
            ptdlStepperFullWidth: p.stepperFullWidth !== false,
            ptdlTitleField: p.titleField || '',
            ptdlSubtitleField: p.subtitleField || '',
            ptdlImageField: p.imageField || '',
            ptdlPriceField: p.priceField || '',
            ptdlShowTotals: p.showTotals !== false,
            ptdlSumFields: Array.isArray(p.sumFields) ? p.sumFields : [],
            ptdlBridgeEnabled: !!p.bridgeEnabled,
            ptdlBridgeChannel: p.bridgeChannel || '',
            ptdlBridgeTargetKey: p.bridgeTargetKey || '',
            ptdlBridgeSourceKey: p.bridgeSourceKey || 'id',
          });
        },
      },
    },
  };
  try {
    (PtdlSubtableProFieldModel as any).registerFlow(proFlow);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[subtable-pro] registerFlow failed', e);
  }

  // Bind via FormItemModel — that class owns the `_bindings` map form fields read (NOT the flow-engine
  // EditableItemModel base, which has its own separate map → invisible to form fields).
  const FormItemModel = flowEngine.getModelClass?.('FormItemModel');
  const binder =
    (FormItemModel && typeof (FormItemModel as any).bindModelToInterface === 'function' && FormItemModel) ||
    (EditableItemModel && typeof (EditableItemModel as any).bindModelToInterface === 'function' && EditableItemModel) ||
    [PtdlSubtableProFieldModel, Base].find((c: any) => c && typeof c.bindModelToInterface === 'function');
  try {
    (binder as any)?.bindModelToInterface('PtdlSubtableProFieldModel', ['o2m', 'm2m', 'mbm'], {
      isDefault: false,
      order: 210,
      when: (_ctx: any, field: any) => (field?.targetCollection ? field.targetCollection.template !== 'file' : true),
    });
    if (!binder) console.warn('[subtable-pro] no binder found');
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[subtable-pro] bind failed', e);
  }

  // ---- Auto-publish (no-code) -------------------------------------------------------------------
  // Any Table block can push its CLICKED ROW to a bridge channel — just enable + type the channel in the
  // block ⚙ (no RunJS, no per-row button). We register ONE flow on TableBlockModel that listens to its
  // native `rowClick` event; the settings step (shown in the block ⚙) holds the channel + action.
  try {
    const TableBlockModel: any = flowEngine.getModelClass?.('TableBlockModel');
    if (TableBlockModel && !TableBlockModel.__ptdlBridgePublish) {
      TableBlockModel.__ptdlBridgePublish = true;
      TableBlockModel.registerFlow({
        key: 'ptdlBridgePublish',
        title: t('Gửi dòng khi bấm (bridge)'),
        on: { eventName: 'rowClick' },
        sort: 900,
        steps: {
          settings: {
            title: t('Gửi dòng khi bấm (bridge)'),
            uiSchema: {
              bridgeEnabled: { type: 'boolean', title: t('Bật gửi khi bấm dòng'), 'x-decorator': 'FormItem', 'x-component': 'Switch' },
              bridgeChannel: { type: 'string', title: t('Tên kênh'), 'x-decorator': 'FormItem', 'x-component': 'PtdlInput', 'x-component-props': { placeholder: 'ch1' } },
              bridgeAction: {
                type: 'string',
                title: t('Hành động khi bấm'),
                'x-decorator': 'FormItem',
                'x-component': 'Select',
                enum: [
                  { label: t('Thêm / +1'), value: 'add' },
                  { label: t('Bớt / −1'), value: 'dec' },
                  { label: t('Xóa'), value: 'remove' },
                ],
              },
            },
            defaultParams: { bridgeEnabled: false, bridgeChannel: 'ch1', bridgeAction: 'add' },
            handler(ctx: any, params: any) {
              if (!params?.bridgeEnabled || !params?.bridgeChannel) return;
              const record = ctx?.inputArgs?.record;
              if (!record) return;
              getBridge().publish(params.bridgeChannel, { action: params.bridgeAction || 'add', record });
            },
          },
        },
      });
      // eslint-disable-next-line no-console
      console.log('[subtable-pro] registered rowClick auto-publish on TableBlockModel');
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[subtable-pro] bridge-publish flow register failed', e);
  }

  // ---- Auto-publish via a record ACTION (works on Grid Card / List / Table rows) ----------------
  // For block types WITHOUT a rowClick event (e.g. Grid Card), the user adds this action to the card/row
  // action area (like the native "JS action") and just types the channel — no code.
  try {
    const RecordActionModel: any = flowEngine.getModelClass?.('RecordActionModel');
    if (RecordActionModel && !flowEngine.getModelClass?.('PtdlBridgeAddActionModel')) {
      class PtdlBridgeAddActionModel extends RecordActionModel {
        static scene = 'record';
        defaultProps: any = { title: t('Thêm dòng'), icon: 'PlusCircleOutlined' };
        render() {
          const display = (this as any).props?.ptdlDisplay || 'button';
          if (display === 'plusminus' || display === 'checkbox') return <BridgeActionControl model={this} />;
          return super.render();
        }
      }
      (PtdlBridgeAddActionModel as any).define({ label: t('Gửi dòng qua kênh (bridge)') });
      (PtdlBridgeAddActionModel as any).registerFlow({
        key: 'ptdlBridgeAddClick',
        on: 'click',
        steps: {
          click: {
            async handler(ctx: any) {
              const channel = ctx.model.props?.channel;
              const action = ctx.model.props?.action || 'add';
              if (!ctx.record) {
                ctx.message?.error?.('No record');
                return;
              }
              if (!channel) {
                ctx.message?.warning?.(t('Chưa cấu hình tên kênh'));
                return;
              }
              getBridge().publish(channel, { action, record: ctx.record });
            },
          },
        },
      });
      (PtdlBridgeAddActionModel as any).registerFlow({
        key: 'ptdlBridgeAddSettings',
        title: t('Cấu hình gửi dòng'),
        steps: {
          settings: {
            title: t('Cấu hình gửi dòng'),
            uiSchema: {
              preview: { type: 'void', title: t('Xem trước'), 'x-decorator': 'FormItem', 'x-component': 'PtdlActionPreview' },
              ptdlDisplay: {
                type: 'string',
                title: t('Kiểu nút'),
                'x-decorator': 'FormItem',
                'x-component': 'PtdlSeg',
                'x-component-props': {
                  options: [
                    { label: t('Nút +/−'), value: 'plusminus' },
                    { label: t('Checkbox (thêm/bớt)'), value: 'checkbox' },
                    { label: t('Nút đơn'), value: 'button' },
                  ],
                },
              },
              ptdlPmStyle: {
                type: 'string',
                title: t('Dạng nút +/−'),
                'x-decorator': 'FormItem',
                'x-component': 'PtdlSeg',
                'x-component-props': { options: [{ label: t('Liền'), value: 'pill' }, { label: t('Tách 2 icon'), value: 'split' }] },
                'x-reactions': rx((v: any) => (v.ptdlDisplay || 'plusminus') === 'plusminus'),
              },
              ptdlShowCount: {
                type: 'boolean',
                title: t('Hiện số lượng ở giữa'),
                'x-decorator': 'FormItem',
                'x-component': 'Switch',
                'x-reactions': rx((v: any) => (v.ptdlDisplay || 'plusminus') === 'plusminus'),
              },
              ptdlSize: {
                type: 'string',
                title: t('Cỡ'),
                'x-decorator': 'FormItem',
                'x-component': 'PtdlSeg',
                'x-component-props': { options: [{ label: t('Nhỏ'), value: 'small' }, { label: t('Vừa'), value: 'default' }] },
                'x-reactions': rx((v: any) => (v.ptdlDisplay || 'plusminus') !== 'button'),
              },
              pmColor: {
                type: 'string',
                title: t('Màu nút (mặc định: primary)'),
                'x-decorator': 'FormItem',
                'x-component': 'PtdlColor',
                'x-reactions': rx((v: any) => (v.ptdlDisplay || 'plusminus') === 'plusminus'),
              },
              channel: { type: 'string', title: t('Tên kênh'), 'x-decorator': 'FormItem', 'x-component': 'PtdlInput', 'x-component-props': { placeholder: 'ch1' }, required: true },
              action: {
                type: 'string',
                title: t('Hành động khi bấm'),
                'x-decorator': 'FormItem',
                'x-component': 'Select',
                enum: [
                  { label: t('Thêm / +1'), value: 'add' },
                  { label: t('Bớt / −1'), value: 'dec' },
                  { label: t('Xóa'), value: 'remove' },
                ],
                'x-reactions': rx((v: any) => (v.ptdlDisplay || 'plusminus') === 'button'),
              },
            },
            defaultParams: { ptdlDisplay: 'plusminus', ptdlPmStyle: 'split', ptdlShowCount: true, ptdlSize: 'small', pmColor: '', channel: 'ch1', action: 'add' },
            handler(ctx: any, params: any) {
              ctx.model.setProps({
                ptdlDisplay: params.ptdlDisplay || 'plusminus',
                ptdlPmStyle: params.ptdlPmStyle || 'split',
                ptdlShowCount: params.ptdlShowCount !== false,
                ptdlSize: params.ptdlSize || 'small',
                pmColor: params.pmColor || '',
                channel: params.channel,
                action: params.action || 'add',
              });
            },
          },
        },
      });
      flowEngine.registerModels({ PtdlBridgeAddActionModel });
      // eslint-disable-next-line no-console
      console.log('[subtable-pro] registered PtdlBridgeAddActionModel (record action)');
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[subtable-pro] bridge-add action register failed', e);
  }

  // eslint-disable-next-line no-console
  console.log('[subtable-pro] registered PtdlSubtableProFieldModel');
  return PtdlSubtableProFieldModel;
}
