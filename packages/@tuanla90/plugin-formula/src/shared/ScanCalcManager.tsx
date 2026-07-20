import React, { useEffect, useRef, useState } from 'react';
import { Table, Button, Modal, Select, Input, InputNumber, Space, message, Popconfirm, Tag, Tooltip, Tabs, Radio } from 'antd';
import { PlusOutlined, ReloadOutlined, QuestionCircleOutlined, CloseOutlined } from '@ant-design/icons';
import { getFields, buildColumnOptions, getCollectionTitles, cleanLabel, FieldPickerCascader, getCaretElement, insertAtCaret, columnDropdownProps, SegmentedGroup } from '@tuanla90/shared';
import { excelToSql, isTranspileError } from './excelToSql';
import { HighlightedTextArea } from './formulaEditorComponents';
import { t } from './i18n';

/**
 * UNIFIED "Scan calculations" page — one surface for BOTH computed-over-order modes, which the user sees
 * as one idea ("walk each row in order, accumulate"):
 *   • ROW-BASED  (window): running SUM/COUNT/MIN/MAX/AVG + ROW_NUMBER — state is one number → runs in SQL,
 *     stored on a plain number column (`options.ptdlWindow`).
 *   • STATE-BASED (scan)  : FIFO / weighted-average — state is a layer queue → runs in JS, config in the
 *     `ptdlScanRules` collection, writes several output columns.
 * The page merges both lists, routes save/edit/remove/recompute to the right backend by the chosen
 * accumulator, and the SQL-vs-JS split stays invisible. `api` is the per-lane apiClient.
 */

const unwrap = (res: any) => res?.data?.data ?? res?.data ?? {};
type OrderSpec = { field: string; dir: 'asc' | 'desc' };
type Row = {
  _type: 'window' | 'scan';
  id?: number; // scan rule id
  collection: string;
  title?: string;
  field?: string; // window output column
  accumulator: string;
  partitionBy: string[];
  orderBy: OrderSpec[];
  input?: string; inputExpr?: boolean; inputMode?: 'column' | 'formula' | 'sql'; // window
  // scan / allocation input:
  qtyMode?: 'signed' | 'split' | 'enum' | 'formula';
  qtyField?: string; inQtyField?: string; outQtyField?: string; directionField?: string; inValue?: string; qtyFormula?: string;
  costMode?: 'column' | 'formula'; costField?: string; costFormula?: string;
  expiryField?: string; roundPrecision?: number; roundMode?: string;
  negativePolicy?: 'allow' | 'error' | 'ignore'; missingCostPolicy?: 'zero' | 'error' | 'previous';
  // scan outputs:
  outRunningQty?: string; outRunningValue?: string; outConsumedQty?: string; outCogs?: string; outConsumedUnitCost?: string; outUnitCost?: string; outAvgCost?: string; outAllocations?: string;
  _outputs?: OutputEntry[]; // UI-only: the metric→column mapping list being edited (converted to out* on save)
  // MULTI-SOURCE (nhập/xuất tách thành nhiều bảng → trộn thành MỘT sổ): each source table brings its own
  // signed-qty / order-value / partition-key FORMULAS (order may drill a relation, e.g. data.phieu.ngay).
  multi?: boolean; sources?: SourceUI[];
};
type OutputEntry = { metric?: string; column?: string };
type SourceUI = {
  collection?: string;
  qtyFormula?: string; orderExpr?: string; partitionExpr?: string; expiryExpr?: string;
  costMode?: 'none' | 'column' | 'formula'; costField?: string; costFormula?: string;
  outUnitCost?: string; outCogs?: string; outRunningQty?: string; outRunningValue?: string; outConsumedQty?: string;
};
// The output columns a single source table can receive (per-table; written back onto that table's own rows).
const SRC_OUT: Array<{ key: keyof SourceUI; label: string }> = [
  { key: 'outRunningQty', label: 'Số dư lượng (tồn)' },
  { key: 'outUnitCost', label: 'Đơn giá đã định (dòng này)' },
  { key: 'outCogs', label: 'Giá trị tiêu hao (COGS)' },
  { key: 'outRunningValue', label: 'Số dư giá trị' },
  { key: 'outConsumedQty', label: 'Lượng tiêu hao' },
];
type ModalState = null | (Partial<Row> & { _mode: 'add' | 'edit' });

const STATE_BASED = new Set(['fifo', 'lifo', 'fefo', 'weighted_avg']);
const isStateBased = (acc?: string) => STATE_BASED.has(acc || '');
const NO_INPUT = new Set(['running_count', 'row_number']); // row-based accumulators needing no input
// Outputs grouped by nature — from the allocation kernel: state you must store · per-transaction · derived · trace.
const OUT_GROUPS: Array<{ group: string; fields: Array<{ key: keyof Row; label: string }>; computed?: boolean }> = [
  { group: 'Tồn (state — scan ghi)', fields: [
    { key: 'outRunningQty', label: 'Số dư lượng' },
    { key: 'outRunningValue', label: 'Số dư giá trị' },
  ] },
  { group: 'Giao dịch, mỗi dòng ra (scan ghi)', fields: [
    { key: 'outConsumedQty', label: 'Lượng tiêu hao' },
    { key: 'outCogs', label: 'Giá trị tiêu hao (COGS)' },
    { key: 'outUnitCost', label: 'Đơn giá đã định (dòng này)' },
  ] },
  // Ratios — NOT scan-written; each becomes a computed column `value / qty`, kept in sync by the scan.
  { group: 'Suy diễn — tự tạo CỘT COMPUTED (= giá trị / lượng)', computed: true, fields: [
    { key: 'outAvgCost', label: 'Đơn giá bình quân (= số dư GT / số dư lượng)' },
    { key: 'outConsumedUnitCost', label: 'Đơn giá tiêu hao (= giá trị / lượng tiêu hao)' },
  ] },
  { group: 'Truy vết (tuỳ chọn, nặng)', fields: [
    { key: 'outAllocations', label: 'Truy vết lô (JSON)' },
  ] },
];
const OUT_KEYS = OUT_GROUPS.flatMap((g) => g.fields);

export function ScanCalcManager({ api }: { api: any }) {
  const [list, setList] = useState<Row[]>([]);
  const [collections, setCollections] = useState<{ value: string; label: string }[]>([]);
  const [colsCache, setColsCache] = useState<Record<string, { value: string; label: string; type?: string; iface?: string }[]>>({});
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<ModalState>(null);
  const [tab, setTab] = useState('strategy'); // active step-tab in the config dialog

  const accGroups = [
    { label: t('Theo dòng (lũy kế) — chạy trong DB'), options: [
      { value: 'running_sum', label: t('Số dư lũy kế (SUM)') },
      { value: 'running_count', label: t('Đếm lũy kế (COUNT)') },
      { value: 'running_min', label: t('Nhỏ nhất tới hiện tại (MIN)') },
      { value: 'running_max', label: t('Lớn nhất tới hiện tại (MAX)') },
      { value: 'running_avg', label: t('Trung bình lũy kế (AVG)') },
      { value: 'row_number', label: t('Số thứ tự (ROW_NUMBER)') },
    ] },
    { label: t('Theo trạng thái (theo lô) — quét từng dòng'), options: [
      { value: 'fifo', label: 'FIFO' },
      { value: 'lifo', label: 'LIFO' },
      { value: 'fefo', label: t('FEFO (hết hạn trước)') },
      { value: 'weighted_avg', label: t('Bình quân gia quyền') },
    ] },
  ];
  const accLabel = (acc: string) => { for (const g of accGroups) for (const o of g.options) if (o.value === acc) return o.label; return acc; };

  const load = async () => {
    setLoading(true);
    try {
      const win = (unwrap(await api.request({ url: 'ptdlWindow:list', method: 'get' })).list || []).map((w: any): Row => ({
        _type: 'window', collection: w.collection, field: w.field, title: w.fieldTitle, accumulator: w.accumulator,
        partitionBy: w.partitionBy || [], orderBy: w.orderBy || [], input: w.input, inputExpr: w.inputExpr,
        inputMode: w.inputMode || (w.inputExpr ? 'sql' : 'column'),
      }));
      const scan = (unwrap(await api.request({ url: 'ptdlScanRules:list', method: 'get', params: { pageSize: 200 } })) || []).map((r: any): Row => ({
        _type: 'scan', id: r.id, collection: r.collectionName, title: r.title, accumulator: r.method,
        partitionBy: r.partitionBy || [], orderBy: r.orderBy || [],
        qtyMode: r.qtyMode || 'signed', qtyField: r.qtyField, inQtyField: r.inQtyField, outQtyField: r.outQtyField, directionField: r.directionField, inValue: r.inValue, qtyFormula: r.qtyFormula,
        costMode: r.costMode || 'column', costField: r.costField, costFormula: r.costFormula, expiryField: r.expiryField,
        roundPrecision: r.roundPrecision, roundMode: r.roundMode || 'half_up', negativePolicy: r.negativePolicy || 'allow', missingCostPolicy: r.missingCostPolicy || 'zero',
        outRunningQty: r.outRunningQty, outRunningValue: r.outRunningValue, outConsumedQty: r.outConsumedQty, outCogs: r.outCogs,
        outConsumedUnitCost: r.outConsumedUnitCost, outUnitCost: r.outUnitCost, outAvgCost: r.outAvgCost, outAllocations: r.outAllocations,
        multi: !!(Array.isArray(r.sources) && r.sources.length),
        sources: Array.isArray(r.sources) ? r.sources.map((s: any): SourceUI => ({
          collection: s.collection, qtyFormula: s.qtyFormula, orderExpr: s.orderExpr, partitionExpr: s.partitionExpr, expiryExpr: s.expiryExpr,
          costMode: s.costMode || (s.costField ? 'column' : 'none'), costField: s.costField, costFormula: s.costFormula,
          outUnitCost: s.outUnitCost, outCogs: s.outCogs, outRunningQty: s.outRunningQty, outRunningValue: s.outRunningValue, outConsumedQty: s.outConsumedQty,
        })) : undefined,
      }));
      setList([...win, ...scan]);
    } catch (e) { message.error(t('Tải danh sách thất bại')); }
    finally { setLoading(false); }
  };
  const loadCollections = async () => {
    try { const arr = unwrap(await api.request({ url: 'collections:list', method: 'get', params: { paginate: false } }));
      setCollections((Array.isArray(arr) ? arr : []).map((c: any) => ({ value: c.name, label: cleanLabel(c.title, c.name) }))); } catch (e) { /* ignore */ }
  };
  useEffect(() => { load(); loadCollections(); }, []);

  const loadCols = async (coll?: string) => {
    if (!coll || colsCache[coll]) return;
    const fs = await getFields(api, coll);
    // shared builder → each option carries {value,label,type,iface} so the dropdowns show the data-type icon.
    // collTitle labels a belongsTo by its TARGET collection ("Nhóm rule → HH Đơn hàng") not the FK column.
    const titles = await getCollectionTitles(api);
    const opts = buildColumnOptions(fs, { collTitle: (n) => titles[n || ''] });
    setColsCache((p) => ({ ...p, [coll]: opts }));
  };
  useEffect(() => { if (modal?.collection) loadCols(modal.collection); }, [modal?.collection]);
  // Multi-source: preload the column list for every source table so its per-table dropdowns fill in.
  const srcColsKey = (modal?.sources || []).map((s) => s.collection || '').join(',');
  useEffect(() => { (modal?.sources || []).forEach((s) => s.collection && loadCols(s.collection)); }, [srcColsKey]);
  const colsFor = (c?: string) => (c ? colsCache[c] || [] : []);
  const cols = modal?.collection ? colsCache[modal.collection] || [] : [];
  const pick = cols.map((o) => ({ ...o, isLeaf: true }));
  const set = (patch: Partial<Row>) => setModal((p) => ({ ...(p as any), ...patch }));

  const recompute = async (r: Row) => {
    try {
      if (r._type === 'window') await api.request({ url: 'ptdlWindow:recompute', method: 'post', params: { collection: r.collection, field: r.field } });
      // multi-source rules have no single collection → recompute via the first source (server recomputes ALL sources).
      else await api.request({ url: 'ptdlScan:recompute', method: 'post', params: { collection: r.collection || (r.sources && r.sources[0] && r.sources[0].collection) } });
      message.success(t('Đã tính lại'));
    } catch (e) { message.error(t('Tính lại thất bại')); }
  };
  // The derived ratios (avg unit cost, consumed unit cost) are stored as COMPUTED rules (formula = value/qty),
  // not scan outputs — the scan writes only the primitives and keeps these in sync via its `derive` hook.
  const findComputed = async (collection: string, targetField: string) =>
    (unwrap(await api.request({ url: 'ptdlComputedRules:list', method: 'get', params: { filter: JSON.stringify({ collectionName: collection, targetField }) } })) || [])[0];
  const upsertComputed = async (collection: string, targetField: string, formula: string) => {
    const ex = await findComputed(collection, targetField);
    const data = { collectionName: collection, targetField, formula, runOn: 'create,update,source', onError: 'null', enabled: true };
    if (ex) await api.request({ url: 'ptdlComputedRules:update', method: 'post', params: { filterByTk: ex.id }, data });
    else await api.request({ url: 'ptdlComputedRules:create', method: 'post', data });
  };
  const deleteComputed = async (collection: string, targetField?: string) => {
    if (!targetField) return;
    const ex = await findComputed(collection, targetField);
    if (ex) await api.request({ url: 'ptdlComputedRules:destroy', method: 'post', params: { filterByTk: ex.id } });
  };

  const remove = async (r: Row) => {
    try {
      if (r._type === 'window') await api.request({ url: `collections/${r.collection}/fields:update`, method: 'post', params: { filterByTk: r.field }, data: { ptdlWindow: null } });
      else {
        await api.request({ url: 'ptdlScanRules:destroy', method: 'post', params: { filterByTk: r.id } });
        await deleteComputed(r.collection, r.outAvgCost); // the ratios were computed rules → clean them up
        await deleteComputed(r.collection, r.outConsumedUnitCost);
      }
      message.success(t('Đã gỡ')); load();
    } catch (e) { message.error(t('Gỡ thất bại')); }
  };

  const save = async () => {
    const m = modal!;
    const multi = isStateBased(m.accumulator) && !!m.multi;
    if (!multi) {
      if (!m.collection) return message.warning(t('Chọn bảng'));
      if (!(m.orderBy || []).length) return message.warning(t('Chọn cột sắp theo'));
    }
    const stateBased = isStateBased(m.accumulator);
    setBusy(true);
    try {
      if (multi) {
        // MULTI-SOURCE: one rule, several source tables merged into a single ledger per partition.
        const srcs = (m.sources || []).filter((s) => s.collection);
        if (!srcs.length) return message.warning(t('Thêm ít nhất một bảng nguồn'));
        for (const s of srcs) {
          if (!s.qtyFormula?.trim()) return message.warning(t('Mỗi bảng cần công thức lượng (+ vào / − ra)'));
          if (!s.orderExpr?.trim()) return message.warning(t('Mỗi bảng cần công thức thời điểm sắp xếp'));
          if (!s.partitionExpr?.trim()) return message.warning(t('Mỗi bảng cần công thức phân vùng (khóa gộp sổ)'));
        }
        if (m.accumulator === 'fefo' && srcs.some((s) => !s.expiryExpr?.trim())) return message.warning(t('FEFO: mỗi bảng cần công thức hạn dùng'));
        const sources = srcs.map((s) => ({
          collection: s.collection, qtyFormula: s.qtyFormula, orderExpr: s.orderExpr, partitionExpr: s.partitionExpr,
          expiryExpr: s.expiryExpr?.trim() || undefined,
          costMode: s.costMode && s.costMode !== 'none' ? s.costMode : undefined,
          costField: s.costMode === 'column' ? s.costField || undefined : undefined,
          costFormula: s.costMode === 'formula' ? s.costFormula || undefined : undefined,
          outUnitCost: s.outUnitCost || undefined, outCogs: s.outCogs || undefined, outRunningQty: s.outRunningQty || undefined,
          outRunningValue: s.outRunningValue || undefined, outConsumedQty: s.outConsumedQty || undefined,
        }));
        const data: any = { title: m.title, collectionName: '', method: m.accumulator, sources,
          roundPrecision: m.roundPrecision, roundMode: m.roundMode || 'half_up', negativePolicy: m.negativePolicy || 'allow', missingCostPolicy: m.missingCostPolicy || 'zero',
          // clear any single-source config so a rule switched to multi doesn't carry stale mappings
          partitionBy: [], orderBy: [], qtyField: null, inQtyField: null, outQtyField: null, directionField: null, qtyFormula: null, costField: null, costFormula: null,
          outRunningQty: null, outRunningValue: null, outConsumedQty: null, outCogs: null, outConsumedUnitCost: null, outUnitCost: null, outAvgCost: null, outAllocations: null };
        if (m.id) await api.request({ url: 'ptdlScanRules:update', method: 'post', params: { filterByTk: m.id }, data });
        else await api.request({ url: 'ptdlScanRules:create', method: 'post', data });
        message.success(t('Đã lưu (đang tính lại…)'));
        setModal(null); load();
        return;
      }
      if (stateBased) {
        const qm = m.qtyMode || 'signed';
        if (qm === 'signed' && !m.qtyField) return message.warning(t('Chọn cột lượng có dấu'));
        if (qm === 'split' && !m.inQtyField && !m.outQtyField) return message.warning(t('Chọn cột lượng VÀO / RA'));
        if (qm === 'enum' && (!m.qtyField || !m.directionField)) return message.warning(t('Chọn cột lượng + cột phân loại'));
        if (qm === 'formula' && !m.qtyFormula?.trim()) return message.warning(t('Nhập công thức lượng'));
        if (m.accumulator === 'fefo' && !m.expiryField) return message.warning(t('Chọn cột hạn dùng (FEFO)'));
        // build the out* map from the metric→column cards (a metric with no column is ignored).
        const outs: OutputEntry[] = m._outputs ?? OUT_KEYS.filter((f) => m[f.key]).map((f) => ({ metric: f.key as string, column: m[f.key] as string }));
        const outMap: Record<string, string | undefined> = {};
        for (const f of OUT_KEYS) outMap[f.key as string] = undefined;
        for (const o of outs) if (o.metric && o.column) outMap[o.metric] = o.column;
        // derived ratios need their inputs mapped (they become computed columns = value / qty)
        if (outMap.outAvgCost && (!outMap.outRunningQty || !outMap.outRunningValue)) return message.warning(t('Đơn giá bình quân cần cả số dư lượng + số dư giá trị'));
        if (outMap.outConsumedUnitCost && (!outMap.outConsumedQty || !outMap.outCogs)) return message.warning(t('Đơn giá tiêu hao cần cả lượng tiêu hao + giá trị tiêu hao'));
        const data = { title: m.title, collectionName: m.collection, partitionBy: m.partitionBy || [], orderBy: m.orderBy, method: m.accumulator,
          qtyMode: qm, qtyField: m.qtyField, inQtyField: m.inQtyField, outQtyField: m.outQtyField, directionField: m.directionField, inValue: m.inValue, qtyFormula: m.qtyFormula,
          costMode: m.costMode || 'column', costField: m.costField, costFormula: m.costFormula, expiryField: m.expiryField,
          roundPrecision: m.roundPrecision, roundMode: m.roundMode || 'half_up', negativePolicy: m.negativePolicy || 'allow', missingCostPolicy: m.missingCostPolicy || 'zero',
          outRunningQty: outMap.outRunningQty ?? null, outRunningValue: outMap.outRunningValue ?? null, outConsumedQty: outMap.outConsumedQty ?? null, outCogs: outMap.outCogs ?? null,
          outConsumedUnitCost: outMap.outConsumedUnitCost ?? null, outUnitCost: outMap.outUnitCost ?? null, outAvgCost: outMap.outAvgCost ?? null, outAllocations: outMap.outAllocations ?? null };
        if (m.id) await api.request({ url: 'ptdlScanRules:update', method: 'post', params: { filterByTk: m.id }, data });
        else await api.request({ url: 'ptdlScanRules:create', method: 'post', data });
        // the DERIVED ratio columns (avg, consumed unit cost) are computed rules; sync or drop them to match.
        if (outMap.outAvgCost) await upsertComputed(m.collection, outMap.outAvgCost, `IF(data.${outMap.outRunningQty}==0, 0, data.${outMap.outRunningValue} / data.${outMap.outRunningQty})`);
        else if (m.outAvgCost) await deleteComputed(m.collection, m.outAvgCost);
        if (outMap.outConsumedUnitCost) await upsertComputed(m.collection, outMap.outConsumedUnitCost, `IF(data.${outMap.outConsumedQty}==0, 0, data.${outMap.outCogs} / data.${outMap.outConsumedQty})`);
        else if (m.outConsumedUnitCost) await deleteComputed(m.collection, m.outConsumedUnitCost);
      } else {
        const mode = m.inputMode || 'column';
        if (!m.field) return message.warning(t('Chọn cột kết quả'));
        if (!NO_INPUT.has(m.accumulator || '') && !m.input) return message.warning(t('Chọn cột đầu vào'));
        // Excel-formula input: transpile client-side first so the user sees a clear error before saving.
        if (mode === 'formula' && m.input) {
          const r = excelToSql(m.input, { columns: new Set(cols.map((c) => c.value)) });
          if (isTranspileError(r)) return message.warning(t('Công thức không hợp lệ: ') + r.error);
        }
        const cfg = { partitionBy: m.partitionBy || [], orderBy: m.orderBy, input: m.input || '', inputMode: mode, inputExpr: mode === 'sql', accumulator: m.accumulator || 'running_sum' };
        // window result = an EXISTING number column the running value is written into (attach the config to it).
        // A Name renames the column's display title (fields:update MERGES uiSchema, so other schema keys survive).
        const wdata: any = { ptdlWindow: cfg };
        if (m.title?.trim()) wdata.uiSchema = { title: m.title.trim() };
        await api.request({ url: `collections/${m.collection}/fields:update`, method: 'post', params: { filterByTk: m.field }, data: wdata });
        await api.request({ url: 'ptdlWindow:recompute', method: 'post', params: { collection: m.collection, field: m.field } }).catch(() => {});
      }
      message.success(t('Đã lưu (đang tính lại…)'));
      setModal(null); load();
    } catch (e: any) { message.error(e?.response?.data?.errors?.[0]?.message || e?.message || t('Lưu thất bại')); }
    finally { setBusy(false); }
  };

  const openEdit = (r: Row) => { setTab('strategy'); setModal({ ...r, _mode: 'edit' }); };
  const columns = [
    { title: t('Kết quả'), render: (_: any, r: Row) => (<span>{r.title || <i style={{ color: '#999' }}>—</i>}{' '}
      {r.multi
        ? (r.sources || []).map((s, i) => <Tag key={i} color="purple" style={{ fontFamily: 'monospace' }}>{s.collection}</Tag>)
        : <Tag color="default" style={{ fontFamily: 'monospace' }}>{r.collection}</Tag>}
      {r._type === 'window' && r.field ? <Tag color="blue" style={{ fontFamily: 'monospace' }}>{r.field}</Tag> : null}</span>) },
    { title: t('Kiểu tính'), dataIndex: 'accumulator', width: 200, render: (v: string) => <Tag color={isStateBased(v) ? 'volcano' : 'geekblue'}>{accLabel(v)}</Tag> },
    { title: t('Phân vùng theo cột (partition by)'), dataIndex: 'partitionBy', render: (v: string[]) => (v || []).map((x) => <Tag key={x} style={{ fontFamily: 'monospace' }}>{x}</Tag>) },
    { title: t('Sắp theo'), dataIndex: 'orderBy', render: (v: OrderSpec[]) => (v || []).map((o) => <Tag key={o.field} style={{ fontFamily: 'monospace' }}>{o.field} {o.dir === 'desc' ? '↓' : '↑'}</Tag>) },
    { title: t('Ghi ra'), render: (_: any, r: Row) => {
      if (r._type !== 'scan') return <Tag color="green" style={{ fontFamily: 'monospace' }}>{r.field}</Tag>;
      if (r.multi) { const cols = [...new Set((r.sources || []).flatMap((s) => SRC_OUT.map((o) => s[o.key]).filter(Boolean)))] as string[];
        return cols.map((c) => <Tag key={c} color="green" style={{ fontFamily: 'monospace' }}>{c}</Tag>); }
      return OUT_KEYS.filter((f) => r[f.key]).map((f) => <Tag key={f.key} color="green" style={{ fontFamily: 'monospace' }}>{r[f.key] as string}</Tag>);
    } },
    { title: '', key: 'act', width: 200, render: (_: any, r: Row) => (
      <Space size={4}>
        <Tooltip title={t('Tính lại toàn bộ')}><Button size="small" icon={<ReloadOutlined />} onClick={() => recompute(r)}>{t('Tính lại')}</Button></Tooltip>
        <Button size="small" onClick={() => openEdit(r)}>{t('Sửa')}</Button>
        <Popconfirm title={t('Gỡ mục này? (dữ liệu trong cột giữ nguyên)')} onConfirm={() => remove(r)}><Button size="small" danger>{t('Gỡ')}</Button></Popconfirm>
      </Space>
    ) },
  ];

  const m = modal;
  const stateBased = isStateBased(m?.accumulator);
  const noInput = NO_INPUT.has(m?.accumulator || '');
  // On edit, keep the accumulator within its original category (switching category = switching storage/backend).
  const accOptions = m?._mode === 'edit' ? [accGroups[m._type === 'scan' ? 1 : 0]] : accGroups;

  return (
    <div style={{ padding: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: 'var(--colorTextTertiary, #888)', flex: 1 }}>{t('Tính một giá trị bằng cách DUYỆT TỪNG DÒNG theo thứ tự trong mỗi phân vùng, mang theo tích lũy. Theo dòng (lũy kế: SUM/đếm/min/max/trung bình/số thứ tự) chạy trong DB; Theo trạng thái (FIFO / bình quân — khớp vào–ra định giá) quét từng dòng. Sửa/lưu là tự tính lại.')}</div>
        <Button icon={<ReloadOutlined />} onClick={load}>{t('Tải lại')}</Button>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setTab('strategy'); setModal({ _mode: 'add', accumulator: 'running_sum', partitionBy: [], orderBy: [] }); }}>{t('Thêm')}</Button>
      </div>
      <Table size="small" rowKey={(r) => `${r._type}:${r.id || r.collection + '.' + r.field}`} loading={loading} columns={columns as any} dataSource={list} pagination={false}
        locale={{ emptyText: t('Chưa có mục nào. Bấm "Thêm".') }} />

      <Modal open={!!m} title={m?._mode === 'edit' ? t('Sửa mục') : t('Thêm mục')} onCancel={() => setModal(null)} onOk={save} confirmLoading={busy} okText={t('Lưu')} cancelText={t('Huỷ')} width={640} maskClosable={false}>
        {m && (() => {
          const qm = m.qtyMode || 'signed';
          const cm = m.costMode || 'column';
          const im = m.inputMode || 'column';
          const multi = stateBased && !!m.multi; // nhập/xuất tách nhiều bảng → trộn một sổ
          const hint = (s: string) => <div style={{ fontSize: 11.5, color: 'var(--colorTextTertiary, #999)', marginBottom: 2 }}>{s}</div>;
          const body = (children: React.ReactNode) => <Space direction="vertical" style={{ width: '100%' }} size={11}>{children}</Space>;
          // scan output editing list: use the in-progress `_outputs` if present, else derive from the mapped out* fields.
          const outputs: OutputEntry[] = m._outputs ?? OUT_KEYS.filter((f) => m[f.key]).map((f) => ({ metric: f.key as string, column: m[f.key] as string }));
          const items: any[] = [
            {
              key: 'strategy', label: t('Tổng quan'),
              children: body(<>
                {hint(t('Đặt tên và chọn cách tính. Lựa chọn này quyết định các bước sau.'))}
                <F label={t('Tên')} tip={stateBased ? t('Tên gợi nhớ cho cấu hình này — chỉ để bạn dễ nhận ra, không ảnh hưởng tính toán.') : t('Tên hiển thị của cột kết quả (đặt/đổi tiêu đề cột được ghi vào).')}>
                  <Input value={m.title} onChange={(e) => set({ title: e.target.value })} placeholder={stateBased ? t('vd Giá vốn kho, Phân bổ thanh toán…') : t('vd Tồn sau (lũy kế)')} />
                </F>
                <F label={t('Kiểu tính')} req tip={t('Theo dòng = hàm lũy kế chạy trong DB (SUM/đếm/min/max/TB/số thứ tự). Theo trạng thái = khớp vào–ra để định giá phần tiêu hao (FIFO/LIFO/FEFO/bình quân).')}>
                  <Select style={{ width: '100%' }} value={m.accumulator} options={accOptions} onChange={(v) => set({ accumulator: v })} placeholder={t('Chọn kiểu tính')} />
                </F>
              </>),
            },
            {
              key: 'input', label: t('Đầu vào'),
              children: body(<>
                {hint(t('Bảng dữ liệu, ánh xạ cột, phân vùng và thứ tự duyệt.'))}
                {stateBased && (
                  <F label={t('Cấu trúc dữ liệu')} tip={t('Một bảng, hay nhập–xuất TÁCH thành nhiều bảng (hệ thống trộn tất cả thành MỘT sổ theo thời gian rồi định giá). Mỗi bảng có thể lấy thời điểm/phân vùng qua quan hệ, vd data.phieu.ngay.')}>
                    <SegmentedGroup value={multi ? 'multi' : 'single'} onChange={(v) => set(v === 'multi'
                      ? { multi: true, sources: (m.sources && m.sources.length) ? m.sources : [{ costMode: 'none' }] }
                      : { multi: false })}
                      options={[{ label: t('1 bảng'), value: 'single' }, { label: t('Nhiều bảng (nhập–xuất tách)'), value: 'multi' }]} />
                  </F>
                )}

                {multi ? (
                  <MultiSourceEditor sources={m.sources || []} api={api} collections={collections} colsFor={colsFor} method={m.accumulator} onChange={(s) => set({ sources: s })} />
                ) : (<>
                <F label={t('Bảng (collection)')} req>
                  <Select style={{ width: '100%' }} showSearch optionFilterProp="label" disabled={m._mode === 'edit'} value={m.collection} options={collections}
                    onChange={(v) => set({ collection: v, partitionBy: [], orderBy: [], input: undefined, qtyField: undefined, inQtyField: undefined, outQtyField: undefined, directionField: undefined, costField: undefined, expiryField: undefined })} placeholder={t('Chọn bảng')} />
                </F>

                {stateBased && (<>
                  <F label={t('Lượng nhập / xuất mỗi dòng')} req tip={t('Cách xác định mỗi dòng là NHẬP (+) hay XUẤT (−) và bao nhiêu — chọn theo cách sổ của bạn lưu.')}>
                    <SegmentedGroup style={{ marginBottom: 6 }} value={qm} onChange={(v) => set({ qtyMode: v as any })}
                      options={[
                        { label: t('Cột có dấu'), value: 'signed' },
                        { label: t('2 cột (vào/ra)'), value: 'split' },
                        { label: t('Theo cột phân loại'), value: 'enum' },
                        { label: t('Công thức'), value: 'formula' },
                      ]} />
                    {qm === 'signed' && <ColSelect value={m.qtyField} options={cols} onChange={(v) => set({ qtyField: v })} placeholder={t('Cột lượng (+ vào / − ra)')} />}
                    {qm === 'split' && (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <div style={{ flex: 1 }}><ColSelect value={m.inQtyField} options={cols} onChange={(v) => set({ inQtyField: v })} placeholder={t('Cột lượng VÀO (+)')} /></div>
                        <div style={{ flex: 1 }}><ColSelect value={m.outQtyField} options={cols} onChange={(v) => set({ outQtyField: v })} placeholder={t('Cột lượng RA (−)')} /></div>
                      </div>
                    )}
                    {qm === 'enum' && (<>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <div style={{ flex: 1 }}><ColSelect value={m.directionField} options={cols} onChange={(v) => set({ directionField: v })} placeholder={t('Cột phân loại (vào/ra)')} /></div>
                        <div style={{ flex: 1 }}><Input style={{ width: '100%' }} value={m.inValue} onChange={(e) => set({ inValue: e.target.value })} placeholder={t('Giá trị = "nhập", vd: in')} /></div>
                      </div>
                      <div style={{ marginTop: 6 }}><ColSelect value={m.qtyField} options={cols} onChange={(v) => set({ qtyField: v })} placeholder={t('Cột lượng (luôn ≥ 0)')} /></div>
                      <div style={{ fontSize: 11, color: 'var(--colorTextTertiary, #999)', marginTop: 2 }}>{t('Dòng có cột phân loại = giá trị trên ⇒ VÀO (+); còn lại ⇒ RA (−).')}</div>
                    </>)}
                    {qm === 'formula' && <FormulaInput api={api} collectionName={m.collection} value={m.qtyFormula} onChange={(v) => set({ qtyFormula: v })} placeholder={'IF(data.type=="in", data.qty, -data.qty)'} />}
                  </F>

                  <F label={t('Đơn giá dòng nhập')} tip={t('Đơn giá của dòng NHẬP (dòng xuất bỏ trống — hệ thống tự suy giá vốn xuất). Nếu dòng nhập thiếu đơn giá, xử lý theo mục "Thiếu đơn giá" ở tab Nâng cao.')}>
                    <SegmentedGroup style={{ marginBottom: 6 }} value={cm} onChange={(v) => set({ costMode: v as any })}
                      options={[{ label: t('Cột'), value: 'column' }, { label: t('Công thức'), value: 'formula' }]} />
                    {cm === 'column'
                      ? <ColSelect value={m.costField} options={cols} onChange={(v) => set({ costField: v })} placeholder={t('Chọn cột đơn giá…')} />
                      : <FormulaInput api={api} collectionName={m.collection} value={m.costFormula} onChange={(v) => set({ costFormula: v })} placeholder={'data.amount / data.qty'} />}
                  </F>

                  {m.accumulator === 'fefo' && <F label={t('Cột hạn dùng (sắp lô theo hạn — FEFO)')} req tip={t('FEFO xuất lô có HẠN DÙNG sớm nhất trước. Chọn cột ngày hết hạn của lô.')}><ColSelect value={m.expiryField} options={cols} onChange={(v) => set({ expiryField: v })} placeholder={t('Chọn cột…')} /></F>}
                </>)}

                {!stateBased && !noInput && (
                  <F label={t('Cột đầu vào (cộng dồn)')} req tip={t('Giá trị mỗi dòng để cộng dồn. Công thức = viết như Excel, hệ thống tự dịch sang SQL (chỉ biểu thức 1 dòng, không dùng hàm gộp/quan hệ).')}>
                    <SegmentedGroup style={{ marginBottom: 6 }} value={im} onChange={(v) => set({ inputMode: v as any, input: '' })}
                      options={[{ label: t('Cột'), value: 'column' }, { label: t('Công thức'), value: 'formula' }, { label: t('SQL (nâng cao)'), value: 'sql' }]} />
                    {im === 'column' && <ColSelect value={m.input} options={cols} onChange={(v) => set({ input: v })} placeholder={t('Chọn cột…')} />}
                    {im === 'formula' && (<><FormulaInput value={m.input} options={cols} onChange={(v) => set({ input: v })} placeholder={'IF(data.direction=="in", data.qty, -data.qty)'} /><SqlPreview formula={m.input} columns={cols} /></>)}
                    {im === 'sql' && <ExprInput value={m.input} options={pick} onChange={(v) => set({ input: v })} />}
                  </F>
                )}

                <F label={t('Phân vùng theo cột (partition by)')} tip={t('Mỗi phân vùng là một "sổ" riêng, tính độc lập. Vd mỗi (sản phẩm, kho) một tồn riêng. Để trống = một sổ chung.')}><ColMultiSelect value={m.partitionBy} options={cols} onChange={(v) => set({ partitionBy: v })} placeholder={t('Chọn cột…')} /></F>
                <F label={t('Sắp theo cột (order by) — bấm ↑/↓ trên thẻ để đổi chiều')} req tip={t('Thứ tự duyệt từng dòng. Nên kết thúc bằng một cột duy nhất (id) để phá hoà khi trùng thời điểm.')}><OrderSelect value={m.orderBy} options={cols} onChange={(v) => set({ orderBy: v })} placeholder={t('Chọn cột…')} /></F>
                </>)}
              </>),
            },
            ...(multi ? [] : [{
              key: 'output', label: t('Kết quả'),
              children: body(<>
                {hint(stateBased ? t('Bấm "Thêm số liệu" cho mỗi kết quả: chọn số liệu, rồi chọn cột để ghi vào.') : t('Chọn cột số để ghi kết quả vào.'))}
                {!stateBased && (
                  m._mode === 'edit'
                    ? <F label={t('Cột kết quả')}><Tag color="blue" style={{ fontFamily: 'monospace' }}>{m.field}</Tag></F>
                    : <F label={t('Cột kết quả')} req tip={t('Chọn một cột SỐ có sẵn trong bảng để ghi giá trị lũy kế vào. Chưa có thì tạo cột số trước ở phần quản lý trường.')}>
                        <ColSelect value={m.field} options={cols} onChange={(v) => set({ field: v })} placeholder={t('Chọn cột…')} />
                      </F>
                )}
                {stateBased && <OutputCards outputs={outputs} cols={cols} onChange={(o) => set({ _outputs: o })} />}
              </>),
            }]),
            ...(stateBased ? [{
              key: 'advanced', label: t('Nâng cao'),
              children: body(<>
                {hint(t('Làm tròn số và xử lý các tình huống đặc biệt.'))}
                <F label={t('Xuất quá tồn (tồn âm)')} tip={t('Khi XUẤT nhiều hơn đang có: Cho phép = tồn âm (ghi nợ, phần thiếu tính theo đơn giá gần nhất); Báo lỗi = dừng và báo dòng lỗi; Bỏ qua = chỉ xuất phần còn lại, tồn về 0.')}>
                  <Radio.Group value={m.negativePolicy || 'allow'} onChange={(e) => set({ negativePolicy: e.target.value })}>
                    <Radio value="allow">{t('Cho phép (tồn âm)')}</Radio>
                    <Radio value="error">{t('Báo lỗi')}</Radio>
                    <Radio value="ignore">{t('Bỏ qua')}</Radio>
                  </Radio.Group>
                </F>
                <F label={t('Thiếu đơn giá (dòng nhập)')} tip={t('Khi dòng NHẬP không có đơn giá: Bằng 0; Báo lỗi; Dùng giá trước (đơn giá nhập gần nhất đã biết).')}>
                  <Radio.Group value={m.missingCostPolicy || 'zero'} onChange={(e) => set({ missingCostPolicy: e.target.value })}>
                    <Radio value="zero">{t('Bằng 0')}</Radio>
                    <Radio value="error">{t('Báo lỗi')}</Radio>
                    <Radio value="previous">{t('Dùng giá trước')}</Radio>
                  </Radio.Group>
                </F>
                <div style={{ display: 'flex', gap: 16 }}>
                  <F label={t('Số chữ số thập phân')} tip={t('Số chữ số thập phân khi lưu kết quả (đơn giá, giá trị…).')}>
                    <InputNumber style={{ width: 120 }} min={0} max={10} value={m.roundPrecision ?? 4} onChange={(v) => set({ roundPrecision: (v ?? undefined) as any })} />
                  </F>
                  <F label={t('Cách làm tròn')} tip={t('Xử lý số 5: Nửa lên (0.5→1); Nửa chẵn (kế toán, 0.5→0 / 1.5→2); Lên (xa 0); Xuống (về 0); Trần (→ +∞); Sàn (→ −∞).')}>
                    <Select style={{ width: 200 }} value={m.roundMode || 'half_up'} onChange={(v) => set({ roundMode: v })}
                      options={[
                        { value: 'half_up', label: t('Nửa lên (0.5→1)') },
                        { value: 'half_even', label: t('Nửa chẵn (kế toán)') },
                        { value: 'up', label: t('Lên (xa số 0)') },
                        { value: 'down', label: t('Xuống (về số 0)') },
                        { value: 'ceil', label: t('Trần (→ +∞)') },
                        { value: 'floor', label: t('Sàn (→ −∞)') },
                      ]} />
                  </F>
                </div>
              </>),
            }] : []),
          ];
          // keep the active tab valid — some tabs (output / advanced) don't exist in every mode.
          const keys = items.map((it: any) => it.key);
          const activeTab = keys.includes(tab) ? tab : 'strategy';
          return <Tabs size="small" activeKey={activeTab} onChange={setTab} items={items} style={{ minHeight: 300 }} />;
        })()}
      </Modal>
    </div>
  );
}

const F: React.FC<{ label: React.ReactNode; req?: boolean; tip?: React.ReactNode; children: React.ReactNode }> = ({ label, req, tip, children }) => (
  <div>
    <div style={{ fontSize: 12, marginBottom: 4, color: 'var(--colorTextSecondary, #555)' }}>
      {req && <span style={{ color: 'var(--colorError, #f5222d)' }}>* </span>}{label}
      {tip && <Tooltip title={tip}><QuestionCircleOutlined style={{ marginLeft: 5, color: 'var(--colorTextTertiary, #999)', fontSize: 12, cursor: 'help' }} /></Tooltip>}
    </div>
    {children}
  </div>
);

// Live preview of the SQL an Excel formula transpiles to (window `input` in formula mode).
const SqlPreview: React.FC<{ formula?: string; columns: any[] }> = ({ formula, columns }) => {
  if (!formula || !formula.trim()) return null;
  const r = excelToSql(formula, { columns: new Set(columns.map((c) => c.value)) });
  const ok = !isTranspileError(r);
  return (
    <div style={{ marginTop: 6, fontSize: 11.5, lineHeight: 1.5 }}>
      <span style={{ color: 'var(--colorTextTertiary, #999)' }}>{t('SQL sinh ra (xem trước):')} </span>
      {ok
        ? <code style={{ color: 'var(--colorSuccess, #389e0d)', fontFamily: 'monospace', wordBreak: 'break-all' }}>{(r as any).sql}</code>
        : <span style={{ color: 'var(--colorError, #cf1322)' }}>{(r as any).error}</span>}
    </div>
  );
};

// Excel-style formula input (references columns as `data.<field>`, IF(), etc.). When `api`+`collectionName`
// are given it uses the LAZY cascader → drills relations and inserts the full `data.<rel>.<field>` path.
const FormulaInput: React.FC<{ value?: string; options?: any[]; onChange: (v: string) => void; placeholder?: string; api?: any; collectionName?: string }> = ({ value, options, onChange, placeholder, api, collectionName }) => {
  const taRef = useRef<any>(null);
  const lazy = !!(api && collectionName);
  const insert = (path: string[]) => { if (!path.length) return; const token = 'data.' + (lazy ? path.join('.') : path[path.length - 1]); insertAtCaret(getCaretElement(taRef.current), token, value || '', onChange); };
  return (
    <div>
      <HighlightedTextArea ref={taRef} value={value} onChange={onChange} minRows={2} style={{ fontSize: 12.5 }} placeholder={placeholder} />
      <div style={{ marginTop: 4, display: 'flex', gap: 10, alignItems: 'center' }}>
        {lazy
          ? <FieldPickerCascader api={api} collectionName={collectionName} includeToMany maxDepth={4} onPick={insert} label={t('＋ Chèn cột / quan hệ')} />
          : <FieldPickerCascader options={options} onPick={insert} label={t('＋ Chèn cột')} />}
        <span style={{ fontSize: 11.5, color: 'var(--colorTextTertiary, #999)' }}>{lazy ? t('Excel: data.<cột>, data.<quan hệ>.<cột>, IF()…') : t('Công thức kiểu Excel: data.<cột>, IF(), v.v.')}</span>
      </div>
    </div>
  );
};

// The two-line column dropdown (title + raw name, dual-search) now lives in @tuanla90/shared so other plugins
// reuse it; we dogfood the same `columnDropdownProps` here.
const { optionRender: colOptionRender, filterOption: colFilter } = columnDropdownProps as any;

// Single column = a NORMAL antd dropdown (title + raw column name in the list, title in the box). Value = column name.
const ColSelect: React.FC<{ value?: string; options: any[]; onChange: (v?: string) => void; placeholder?: string }> = ({ value, options, onChange, placeholder }) => (
  <Select style={{ width: '100%' }} showSearch allowClear filterOption={colFilter} optionRender={colOptionRender} value={value || undefined} options={options} onChange={(v) => onChange(v as any)} placeholder={placeholder} />
);

// Multiple columns = a normal multi-select (tags show the field's label).
const ColMultiSelect: React.FC<{ value?: string[]; options: any[]; onChange: (v: string[]) => void; placeholder?: string }> = ({ value, options, onChange, placeholder }) => (
  <Select mode="multiple" style={{ width: '100%' }} showSearch filterOption={colFilter} optionRender={colOptionRender} value={value || []} options={options} onChange={(v) => onChange(v as string[])} placeholder={placeholder} />
);

// Output mapping cards — click "+ Add", pick a METRIC (grouped by nature) then the target COLUMN. Each metric once.
const OutputCards: React.FC<{ outputs: OutputEntry[]; cols: any[]; onChange: (o: OutputEntry[]) => void }> = ({ outputs, cols, onChange }) => {
  const used = new Set(outputs.map((o) => o.metric).filter(Boolean));
  const metricOptions = OUT_GROUPS.map((g) => ({
    label: t(g.group),
    options: g.fields.map((f) => ({ value: f.key as string, label: t(f.label), disabled: used.has(f.key as string) })),
  }));
  const info = (k?: string) => OUT_KEYS.find((f) => f.key === k);
  const isComputed = (k?: string) => OUT_GROUPS.some((g) => g.computed && g.fields.some((f) => f.key === k));
  const upd = (i: number, patch: Partial<OutputEntry>) => onChange(outputs.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  return (
    <div>
      {outputs.map((o, i) => (
        <div key={i} style={{ border: '1px solid var(--colorBorderSecondary, #eee)', borderRadius: 8, padding: '8px 10px', marginBottom: 8 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Select style={{ flex: 1 }} placeholder={t('Chọn số liệu…')} value={o.metric} options={metricOptions} showSearch optionFilterProp="label"
              onChange={(v) => upd(i, { metric: v as string })} />
            <Select style={{ flex: 1 }} placeholder={t('Chọn cột…')} value={o.column} options={cols} allowClear showSearch filterOption={colFilter} optionRender={colOptionRender}
              onChange={(v) => upd(i, { column: v as string })} />
            <Button type="text" danger icon={<CloseOutlined />} onClick={() => onChange(outputs.filter((_, j) => j !== i))} />
          </div>
          {isComputed(o.metric) && <div style={{ fontSize: 11, color: 'var(--colorPrimary, #722ed1)', marginTop: 4 }}>{t('Suy diễn — sẽ tạo 1 cột "Công thức tự tính" = giá trị / lượng.')}</div>}
          {!info(o.metric) && o.metric && <div style={{ fontSize: 11, color: 'var(--colorTextTertiary, #999)', marginTop: 4 }} />}
        </div>
      ))}
      <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={() => onChange([...outputs, {}])}>{t('Thêm số liệu')}</Button>
    </div>
  );
};

// MULTI-SOURCE editor: one card per source table. Each brings its own signed-qty / order / partition FORMULAS
// (Excel-style, `data.<col>` or relation `data.<rel>.<col>`), an optional inflow unit-price, and the output
// columns to write back onto THAT table's own rows. The server merges all sources into one ledger per partition.
const MultiSourceEditor: React.FC<{
  sources: SourceUI[]; api: any; collections: any[]; method?: string;
  colsFor: (c?: string) => any[]; onChange: (s: SourceUI[]) => void;
}> = ({ sources, api, collections, method, colsFor, onChange }) => {
  const upd = (i: number, patch: Partial<SourceUI>) => onChange(sources.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const collLabel = (n?: string) => collections.find((c) => c.value === n)?.label || n;
  return (
    <div>
      {sources.map((s, i) => {
        const cols = colsFor(s.collection);
        const cm = s.costMode || 'none';
        return (
          <div key={i} style={{ border: '1px solid var(--colorBorderSecondary, #e8e8e8)', borderRadius: 10, padding: '10px 12px', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 12.5, flex: 1 }}>{t('Bảng nguồn')} #{i + 1}{s.collection ? <span style={{ color: 'var(--colorTextTertiary, #999)', fontWeight: 400 }}> — {collLabel(s.collection)}</span> : null}</span>
              <Button type="text" danger size="small" icon={<CloseOutlined />} onClick={() => onChange(sources.filter((_, j) => j !== i))} />
            </div>
            <Space direction="vertical" style={{ width: '100%' }} size={9}>
              <F label={t('Bảng (collection)')} req>
                <Select style={{ width: '100%' }} showSearch optionFilterProp="label" value={s.collection} options={collections}
                  onChange={(v) => upd(i, { collection: v as string, costField: undefined, outUnitCost: undefined, outCogs: undefined, outRunningQty: undefined, outRunningValue: undefined, outConsumedQty: undefined })} placeholder={t('Chọn bảng')} />
              </F>
              <F label={t('Lượng nhập / xuất (công thức)')} req tip={t('Dương = NHẬP (+), âm = XUẤT (−). Bảng nhập thường là data.<cột lượng>; bảng xuất là -data.<cột lượng>.')}>
                <FormulaInput api={api} collectionName={s.collection} value={s.qtyFormula} onChange={(v) => upd(i, { qtyFormula: v })} placeholder={'data.sl   /   -data.sl'} />
              </F>
              <F label={t('Thời điểm sắp xếp (công thức)')} req tip={t('Giá trị (ngày/số) để TRỘN các bảng theo thời gian. Có thể lấy qua quan hệ nếu ngày nằm ở bảng cha, vd data.phieu.ngay.')}>
                <FormulaInput api={api} collectionName={s.collection} value={s.orderExpr} onChange={(v) => upd(i, { orderExpr: v })} placeholder={'data.ngay   /   data.phieu.ngay'} />
              </F>
              <F label={t('Phân vùng — khóa gộp sổ (công thức)')} req tip={t('Các dòng cùng giá trị này (ở mọi bảng) mới chung MỘT sổ. Vd data.sp (mã sản phẩm). Phải khớp kiểu giữa các bảng.')}>
                <FormulaInput api={api} collectionName={s.collection} value={s.partitionExpr} onChange={(v) => upd(i, { partitionExpr: v })} placeholder={'data.sp'} />
              </F>
              <F label={t('Đơn giá dòng nhập')} tip={t('Chỉ bảng NHẬP cần: đơn giá mỗi đơn vị nhập. Bảng xuất để "Không" — hệ thống tự suy giá vốn xuất.')}>
                <SegmentedGroup style={{ marginBottom: 6 }} value={cm} onChange={(v) => upd(i, { costMode: v as any })}
                  options={[{ label: t('Không'), value: 'none' }, { label: t('Cột'), value: 'column' }, { label: t('Công thức'), value: 'formula' }]} />
                {cm === 'column' && <ColSelect value={s.costField} options={cols} onChange={(v) => upd(i, { costField: v })} placeholder={t('Chọn cột đơn giá…')} />}
                {cm === 'formula' && <FormulaInput api={api} collectionName={s.collection} value={s.costFormula} onChange={(v) => upd(i, { costFormula: v })} placeholder={'data.gia   /   data.amount / data.sl'} />}
              </F>
              {method === 'fefo' && (
                <F label={t('Hạn dùng (công thức, FEFO)')} req tip={t('FEFO xuất lô hết hạn sớm nhất trước. Công thức trả về ngày hết hạn của lô.')}>
                  <FormulaInput api={api} collectionName={s.collection} value={s.expiryExpr} onChange={(v) => upd(i, { expiryExpr: v })} placeholder={'data.hsd'} />
                </F>
              )}
              <F label={t('Ghi kết quả vào cột (của bảng này)')} tip={t('Chọn cột SỐ có sẵn trên chính bảng này để nhận kết quả. Bảng nào không cần một số liệu thì để trống.')}>
                <div style={{ display: 'grid', gridTemplateColumns: '170px 1fr', gap: '6px 10px', alignItems: 'center' }}>
                  {SRC_OUT.map((o) => (
                    <React.Fragment key={o.key as string}>
                      <span style={{ fontSize: 12, color: 'var(--colorTextSecondary, #555)' }}>{t(o.label)}</span>
                      <ColSelect value={s[o.key] as string} options={cols} onChange={(v) => upd(i, { [o.key]: v } as any)} placeholder={t('— (bỏ trống)')} />
                    </React.Fragment>
                  ))}
                </div>
              </F>
            </Space>
          </div>
        );
      })}
      <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={() => onChange([...sources, { costMode: 'none' }])}>{t('Thêm bảng nguồn')}</Button>
      {!sources.length && <div style={{ fontSize: 11.5, color: 'var(--colorTextTertiary, #999)', marginTop: 6 }}>{t('Thêm mỗi bảng nhập / xuất một thẻ. Tối thiểu 2 bảng cho ca nhập–xuất tách.')}</div>}
    </div>
  );
};

// Order-by = a normal multi-select whose TAGS show the field label + a clickable ↑/↓ direction toggle.
const OrderSelect: React.FC<{ value?: OrderSpec[]; options: any[]; onChange: (v: OrderSpec[]) => void; placeholder?: string }> = ({ value, options, onChange, placeholder }) => {
  const arr = value || [];
  const selected = arr.map((o) => o.field);
  const labelOf = (f: string) => options.find((o) => o.value === f)?.label || f;
  const onSel = (vals: string[]) => onChange(vals.map((f) => arr.find((o) => o.field === f) || { field: f, dir: 'asc' }));
  const toggle = (f: string) => onChange(arr.map((o) => (o.field === f ? { ...o, dir: o.dir === 'desc' ? 'asc' : 'desc' } : o)));
  const tagRender = (props: any) => {
    const o = arr.find((x) => x.field === props.value);
    return (
      <Tag closable onClose={props.onClose} onMouseDown={(e) => e.stopPropagation()} style={{ marginRight: 3 }}>
        {labelOf(props.value)}
        <a onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggle(props.value); }} style={{ marginLeft: 5, fontWeight: 600 }}>{o?.dir === 'desc' ? '↓' : '↑'}</a>
      </Tag>
    );
  };
  return <Select mode="multiple" style={{ width: '100%' }} showSearch filterOption={colFilter} optionRender={colOptionRender} value={selected} options={options} onChange={onSel} tagRender={tagRender} placeholder={placeholder} />;
};

const ExprInput: React.FC<{ value?: string; options: any[]; onChange: (v: string) => void }> = ({ value, options, onChange }) => {
  const taRef = useRef<any>(null);
  const insert = (path: string[]) => { const c = path[path.length - 1]; if (c) insertAtCaret(getCaretElement(taRef.current), c, value || '', onChange); };
  return (
    <div>
      <Input.TextArea ref={taRef} value={value} onChange={(e) => onChange(e.target.value)} autoSize={{ minRows: 2, maxRows: 5 }}
        style={{ fontFamily: 'monospace', fontSize: 12.5 }} placeholder={"qty * CASE WHEN direction = 'in' THEN 1 ELSE -1 END"} />
      <div style={{ marginTop: 4, display: 'flex', gap: 10, alignItems: 'center' }}>
        <FieldPickerCascader options={options} onPick={insert} label={t('＋ Chèn cột')} />
        <span style={{ fontSize: 11.5, color: 'var(--colorTextTertiary, #999)' }}>{t('Biểu thức SQL thô (theo DB đang dùng). Chỉ admin cấu hình.')}</span>
      </div>
    </div>
  );
};
