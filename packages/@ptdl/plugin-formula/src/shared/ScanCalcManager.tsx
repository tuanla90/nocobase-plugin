import React, { useEffect, useRef, useState } from 'react';
import { Table, Button, Modal, Select, Input, InputNumber, Space, message, Popconfirm, Tag, Tooltip, Segmented, Tabs, Radio } from 'antd';
import { PlusOutlined, ReloadOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import { getFields, FieldPickerCascader, getCaretElement, insertAtCaret } from '@ptdl/shared';
import { excelToSql, isTranspileError } from './excelToSql';
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
};
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
  const [colsCache, setColsCache] = useState<Record<string, { value: string; label: string }[]>>({});
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
      }));
      setList([...win, ...scan]);
    } catch (e) { message.error(t('Tải danh sách thất bại')); }
    finally { setLoading(false); }
  };
  const loadCollections = async () => {
    try { const arr = unwrap(await api.request({ url: 'collections:list', method: 'get', params: { paginate: false } }));
      setCollections((Array.isArray(arr) ? arr : []).map((c: any) => ({ value: c.name, label: c.title || c.name }))); } catch (e) { /* ignore */ }
  };
  useEffect(() => { load(); loadCollections(); }, []);

  const loadCols = async (coll?: string) => {
    if (!coll || colsCache[coll]) return;
    const fs = await getFields(api, coll);
    const opts = (fs || []).filter((f: any) => !['hasMany', 'belongsToMany', 'hasOne'].includes(f.type))
      .map((f: any) => { const ti = f.uiSchema?.title || f.name; return f.type === 'belongsTo' && f.foreignKey ? { value: f.foreignKey, label: `${ti} → ${f.foreignKey}` } : { value: f.name, label: ti }; });
    for (const extra of ['id', 'createdAt', 'updatedAt']) if (!opts.some((o) => o.value === extra)) opts.push({ value: extra, label: extra });
    setColsCache((p) => ({ ...p, [coll]: opts }));
  };
  useEffect(() => { if (modal?.collection) loadCols(modal.collection); }, [modal?.collection]);
  const cols = modal?.collection ? colsCache[modal.collection] || [] : [];
  const pick = cols.map((o) => ({ value: o.value, label: o.label, isLeaf: true }));
  const set = (patch: Partial<Row>) => setModal((p) => ({ ...(p as any), ...patch }));

  const recompute = async (r: Row) => {
    try {
      if (r._type === 'window') await api.request({ url: 'ptdlWindow:recompute', method: 'post', params: { collection: r.collection, field: r.field } });
      else await api.request({ url: 'ptdlScan:recompute', method: 'post', params: { collection: r.collection } });
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
    if (!m.collection) return message.warning(t('Chọn bảng'));
    if (!(m.orderBy || []).length) return message.warning(t('Chọn cột sắp theo'));
    const stateBased = isStateBased(m.accumulator);
    setBusy(true);
    try {
      if (stateBased) {
        const qm = m.qtyMode || 'signed';
        if (qm === 'signed' && !m.qtyField) return message.warning(t('Chọn cột lượng có dấu'));
        if (qm === 'split' && !m.inQtyField && !m.outQtyField) return message.warning(t('Chọn cột lượng VÀO / RA'));
        if (qm === 'enum' && (!m.qtyField || !m.directionField)) return message.warning(t('Chọn cột lượng + cột phân loại'));
        if (qm === 'formula' && !m.qtyFormula?.trim()) return message.warning(t('Nhập công thức lượng'));
        if (m.accumulator === 'fefo' && !m.expiryField) return message.warning(t('Chọn cột hạn dùng (FEFO)'));
        // derived ratios need their inputs mapped (they become computed columns = value / qty)
        if (m.outAvgCost && (!m.outRunningQty || !m.outRunningValue)) return message.warning(t('Đơn giá bình quân cần cả số dư lượng + số dư giá trị'));
        if (m.outConsumedUnitCost && (!m.outConsumedQty || !m.outCogs)) return message.warning(t('Đơn giá tiêu hao cần cả lượng tiêu hao + giá trị tiêu hao'));
        const data = { title: m.title, collectionName: m.collection, partitionBy: m.partitionBy || [], orderBy: m.orderBy, method: m.accumulator,
          qtyMode: qm, qtyField: m.qtyField, inQtyField: m.inQtyField, outQtyField: m.outQtyField, directionField: m.directionField, inValue: m.inValue, qtyFormula: m.qtyFormula,
          costMode: m.costMode || 'column', costField: m.costField, costFormula: m.costFormula, expiryField: m.expiryField,
          roundPrecision: m.roundPrecision, roundMode: m.roundMode || 'half_up', negativePolicy: m.negativePolicy || 'allow', missingCostPolicy: m.missingCostPolicy || 'zero',
          outRunningQty: m.outRunningQty, outRunningValue: m.outRunningValue, outConsumedQty: m.outConsumedQty, outCogs: m.outCogs,
          outConsumedUnitCost: m.outConsumedUnitCost, outUnitCost: m.outUnitCost, outAvgCost: m.outAvgCost, outAllocations: m.outAllocations };
        if (m.id) await api.request({ url: 'ptdlScanRules:update', method: 'post', params: { filterByTk: m.id }, data });
        else await api.request({ url: 'ptdlScanRules:create', method: 'post', data });
        // create/refresh the DERIVED computed columns (ratios); the scan writes primitives, these derive from them.
        if (m.outAvgCost) await upsertComputed(m.collection, m.outAvgCost, `IF(data.${m.outRunningQty}==0, 0, data.${m.outRunningValue} / data.${m.outRunningQty})`);
        if (m.outConsumedUnitCost) await upsertComputed(m.collection, m.outConsumedUnitCost, `IF(data.${m.outConsumedQty}==0, 0, data.${m.outCogs} / data.${m.outConsumedQty})`);
      } else {
        const mode = m.inputMode || 'column';
        if (!NO_INPUT.has(m.accumulator || '') && !m.input) return message.warning(t('Chọn cột đầu vào'));
        // Excel-formula input: transpile client-side first so the user sees a clear error before saving.
        if (mode === 'formula' && m.input) {
          const r = excelToSql(m.input, { columns: new Set(cols.map((c) => c.value)) });
          if (isTranspileError(r)) return message.warning(t('Công thức không hợp lệ: ') + r.error);
        }
        const cfg = { partitionBy: m.partitionBy || [], orderBy: m.orderBy, input: m.input || '', inputMode: mode, inputExpr: mode === 'sql', accumulator: m.accumulator || 'running_sum' };
        if (m._mode === 'add') {
          if (!m.field?.trim()) return message.warning(t('Nhập tên cột'));
          await api.request({ url: `collections/${m.collection}/fields:create`, method: 'post', data: {
            name: m.field.trim(), type: 'double', interface: 'number',
            uiSchema: { type: 'number', title: m.title || m.field, 'x-component': 'InputNumber', 'x-component-props': { readOnly: true, stringMode: true }, 'x-read-pretty': true },
            ptdlWindow: cfg,
          } });
        } else {
          await api.request({ url: `collections/${m.collection}/fields:update`, method: 'post', params: { filterByTk: m.field }, data: { ptdlWindow: cfg } });
        }
        await api.request({ url: 'ptdlWindow:recompute', method: 'post', params: { collection: m.collection, field: m.field } }).catch(() => {});
      }
      message.success(t('Đã lưu (đang tính lại…)'));
      setModal(null); load();
    } catch (e: any) { message.error(e?.response?.data?.errors?.[0]?.message || e?.message || t('Lưu thất bại')); }
    finally { setBusy(false); }
  };

  const openEdit = (r: Row) => { setTab('strategy'); setModal({ ...r, _mode: 'edit' }); };
  const columns = [
    { title: t('Kết quả'), render: (_: any, r: Row) => (<span>{r.title || <i style={{ color: '#999' }}>—</i>} <Tag color="default" style={{ fontFamily: 'monospace' }}>{r.collection}</Tag>{r._type === 'window' && r.field ? <Tag color="blue" style={{ fontFamily: 'monospace' }}>{r.field}</Tag> : null}</span>) },
    { title: t('Kiểu tính'), dataIndex: 'accumulator', width: 200, render: (v: string) => <Tag color={isStateBased(v) ? 'volcano' : 'geekblue'}>{accLabel(v)}</Tag> },
    { title: t('Phân vùng theo cột (partition by)'), dataIndex: 'partitionBy', render: (v: string[]) => (v || []).map((x) => <Tag key={x} style={{ fontFamily: 'monospace' }}>{x}</Tag>) },
    { title: t('Sắp theo'), dataIndex: 'orderBy', render: (v: OrderSpec[]) => (v || []).map((o) => <Tag key={o.field} style={{ fontFamily: 'monospace' }}>{o.field} {o.dir === 'desc' ? '↓' : '↑'}</Tag>) },
    { title: t('Ghi ra'), render: (_: any, r: Row) => r._type === 'scan' ? OUT_KEYS.filter((f) => r[f.key]).map((f) => <Tag key={f.key} color="green" style={{ fontFamily: 'monospace' }}>{r[f.key] as string}</Tag>) : <Tag color="green" style={{ fontFamily: 'monospace' }}>{r.field}</Tag> },
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
          const activeTab = tab === 'advanced' && !stateBased ? 'strategy' : tab;
          const hint = (s: string) => <div style={{ fontSize: 11.5, color: 'var(--colorTextTertiary, #999)', marginBottom: 2 }}>{s}</div>;
          const body = (children: React.ReactNode) => <Space direction="vertical" style={{ width: '100%' }} size={11}>{children}</Space>;
          const items: any[] = [
            {
              key: 'strategy', label: t('① Tổng quan'),
              children: body(<>
                {hint(t('Đặt tên và chọn cách tính. Lựa chọn này quyết định các bước sau.'))}
                <F label={t('Tên')} tip={t('Tên gợi nhớ cho cấu hình này — chỉ để bạn dễ nhận ra, không ảnh hưởng tính toán.')}>
                  <Input value={m.title} onChange={(e) => set({ title: e.target.value })} placeholder={stateBased ? t('vd Giá vốn kho, Phân bổ thanh toán…') : t('vd Tồn sau (lũy kế)')} />
                </F>
                <F label={t('Kiểu tính')} req tip={t('Theo dòng = hàm lũy kế chạy trong DB (SUM/đếm/min/max/TB/số thứ tự). Theo trạng thái = khớp vào–ra để định giá phần tiêu hao (FIFO/LIFO/FEFO/bình quân).')}>
                  <Select style={{ width: '100%' }} value={m.accumulator} options={accOptions} onChange={(v) => set({ accumulator: v })} placeholder={t('Chọn kiểu tính')} />
                </F>
              </>),
            },
            {
              key: 'input', label: t('② Đầu vào'),
              children: body(<>
                {hint(t('Bảng dữ liệu, ánh xạ cột, phân vùng và thứ tự duyệt.'))}
                <F label={t('Bảng (collection)')} req>
                  <Select style={{ width: '100%' }} showSearch optionFilterProp="label" disabled={m._mode === 'edit'} value={m.collection} options={collections}
                    onChange={(v) => set({ collection: v, partitionBy: [], orderBy: [], input: undefined, qtyField: undefined, inQtyField: undefined, outQtyField: undefined, directionField: undefined, costField: undefined, expiryField: undefined })} placeholder={t('Chọn bảng')} />
                </F>

                {stateBased && (<>
                  <F label={t('Lượng nhập / xuất mỗi dòng')} req tip={t('Cách xác định mỗi dòng là NHẬP (+) hay XUẤT (−) và bao nhiêu — chọn theo cách sổ của bạn lưu.')}>
                    <Segmented size="middle" style={{ marginBottom: 6 }} value={qm} onChange={(v) => set({ qtyMode: v as any })}
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
                    {qm === 'formula' && <FormulaInput value={m.qtyFormula} options={cols} onChange={(v) => set({ qtyFormula: v })} placeholder={'IF(data.type=="in", data.qty, -data.qty)'} />}
                  </F>

                  <F label={t('Đơn giá dòng nhập')} tip={t('Đơn giá của dòng NHẬP (dòng xuất bỏ trống — hệ thống tự suy giá vốn xuất). Nếu dòng nhập thiếu đơn giá, xử lý theo mục "Thiếu đơn giá" ở tab Nâng cao.')}>
                    <Segmented size="middle" style={{ marginBottom: 6 }} value={cm} onChange={(v) => set({ costMode: v as any })}
                      options={[{ label: t('Cột'), value: 'column' }, { label: t('Công thức'), value: 'formula' }]} />
                    {cm === 'column'
                      ? <ColSelect value={m.costField} options={cols} onChange={(v) => set({ costField: v })} placeholder={t('Chọn cột đơn giá…')} />
                      : <FormulaInput value={m.costFormula} options={cols} onChange={(v) => set({ costFormula: v })} placeholder={'data.amount / data.qty'} />}
                  </F>

                  {m.accumulator === 'fefo' && <F label={t('Cột hạn dùng (sắp lô theo hạn — FEFO)')} req tip={t('FEFO xuất lô có HẠN DÙNG sớm nhất trước. Chọn cột ngày hết hạn của lô.')}><ColSelect value={m.expiryField} options={cols} onChange={(v) => set({ expiryField: v })} placeholder={t('Chọn cột…')} /></F>}
                </>)}

                {!stateBased && !noInput && (
                  <F label={t('Cột đầu vào (cộng dồn)')} req tip={t('Giá trị mỗi dòng để cộng dồn. Công thức = viết như Excel, hệ thống tự dịch sang SQL (chỉ biểu thức 1 dòng, không dùng hàm gộp/quan hệ).')}>
                    <Segmented size="middle" style={{ marginBottom: 6 }} value={im} onChange={(v) => set({ inputMode: v as any, input: '' })}
                      options={[{ label: t('Cột'), value: 'column' }, { label: t('Công thức'), value: 'formula' }, { label: t('SQL (nâng cao)'), value: 'sql' }]} />
                    {im === 'column' && <ColSelect value={m.input} options={cols} onChange={(v) => set({ input: v })} placeholder={t('Chọn cột…')} />}
                    {im === 'formula' && (<><FormulaInput value={m.input} options={cols} onChange={(v) => set({ input: v })} placeholder={'IF(data.direction=="in", data.qty, -data.qty)'} /><SqlPreview formula={m.input} columns={cols} /></>)}
                    {im === 'sql' && <ExprInput value={m.input} options={pick} onChange={(v) => set({ input: v })} />}
                  </F>
                )}

                <F label={t('Phân vùng theo cột (partition by)')} tip={t('Mỗi phân vùng là một "sổ" riêng, tính độc lập. Vd mỗi (sản phẩm, kho) một tồn riêng. Để trống = một sổ chung.')}><ColMultiSelect value={m.partitionBy} options={cols} onChange={(v) => set({ partitionBy: v })} placeholder={t('Chọn cột…')} /></F>
                <F label={t('Sắp theo cột (order by) — bấm ↑/↓ trên thẻ để đổi chiều')} req tip={t('Thứ tự duyệt từng dòng. Nên kết thúc bằng một cột duy nhất (id) để phá hoà khi trùng thời điểm.')}><OrderSelect value={m.orderBy} options={cols} onChange={(v) => set({ orderBy: v })} placeholder={t('Chọn cột…')} /></F>
              </>),
            },
            {
              key: 'output', label: t('③ Kết quả'),
              children: body(<>
                {hint(stateBased ? t('Chọn ghi số liệu nào ra cột nào. Để trống nếu không cần.') : t('Cột kết quả sẽ được tạo/cập nhật.'))}
                {!stateBased && (<>
                  {m._mode === 'add' && <F label={t('Tên cột kết quả (name)')} req tip={t('Tên kỹ thuật của cột số sẽ được tạo trong bảng (không dấu, không cách). Vd balance_after.')}><Input value={m.field} onChange={(e) => set({ field: e.target.value })} placeholder="balance_after" /></F>}
                  {m._mode === 'edit' && <F label={t('Cột kết quả')}><Tag color="blue" style={{ fontFamily: 'monospace' }}>{m.field}</Tag></F>}
                </>)}
                {stateBased && OUT_GROUPS.map((g) => (
                  <div key={g.group}>
                    <div style={{ fontSize: 11.5, fontWeight: 600, color: g.computed ? 'var(--colorPrimary, #722ed1)' : 'var(--colorTextTertiary, #999)', margin: '2px 0 2px' }}>{t(g.group)}</div>
                    {g.computed && <div style={{ fontSize: 11, color: 'var(--colorTextTertiary, #999)', marginBottom: 2 }}>{t('Chọn cột ở đây sẽ tạo 1 "Công thức tự tính" = tỉ số; scan chỉ ghi cột nguồn ở trên.')}</div>}
                    {g.fields.map((f) => (
                      <F key={f.key} label={t(f.label)}><ColSelect value={m[f.key] as string} options={cols} onChange={(v) => set({ [f.key]: v } as any)} placeholder={t('(tuỳ chọn)')} /></F>
                    ))}
                  </div>
                ))}
              </>),
            },
            ...(stateBased ? [{
              key: 'advanced', label: t('④ Nâng cao'),
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

// Excel-style formula input (references columns as `data.<field>`, IF(), etc.) — used for qty / cost formulas.
const FormulaInput: React.FC<{ value?: string; options: any[]; onChange: (v: string) => void; placeholder?: string }> = ({ value, options, onChange, placeholder }) => {
  const taRef = useRef<any>(null);
  const insert = (path: string[]) => { const c = path[path.length - 1]; if (c) insertAtCaret(getCaretElement(taRef.current), 'data.' + c, value || '', onChange); };
  return (
    <div>
      <Input.TextArea ref={taRef} value={value} onChange={(e) => onChange(e.target.value)} autoSize={{ minRows: 2, maxRows: 5 }}
        style={{ fontFamily: 'monospace', fontSize: 12.5 }} placeholder={placeholder} />
      <div style={{ marginTop: 4, display: 'flex', gap: 10, alignItems: 'center' }}>
        <FieldPickerCascader options={options} onPick={insert} label={t('＋ Chèn cột')} />
        <span style={{ fontSize: 11.5, color: 'var(--colorTextTertiary, #999)' }}>{t('Công thức kiểu Excel: data.<cột>, IF(), v.v.')}</span>
      </div>
    </div>
  );
};

// Single column = a NORMAL antd dropdown (shows the field's label, searchable, clearable). Value = column name.
const ColSelect: React.FC<{ value?: string; options: any[]; onChange: (v?: string) => void; placeholder?: string }> = ({ value, options, onChange, placeholder }) => (
  <Select style={{ width: '100%' }} showSearch allowClear optionFilterProp="label" value={value || undefined} options={options} onChange={(v) => onChange(v as any)} placeholder={placeholder} />
);

// Multiple columns = a normal multi-select (tags show the field's label).
const ColMultiSelect: React.FC<{ value?: string[]; options: any[]; onChange: (v: string[]) => void; placeholder?: string }> = ({ value, options, onChange, placeholder }) => (
  <Select mode="multiple" style={{ width: '100%' }} showSearch optionFilterProp="label" value={value || []} options={options} onChange={(v) => onChange(v as string[])} placeholder={placeholder} />
);

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
  return <Select mode="multiple" style={{ width: '100%' }} showSearch optionFilterProp="label" value={selected} options={options} onChange={onSel} tagRender={tagRender} placeholder={placeholder} />;
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
