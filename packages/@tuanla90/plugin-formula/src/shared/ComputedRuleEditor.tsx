import React, { useEffect, useRef, useState } from 'react';
import { Input, Button, Switch, Select, Space, message, Tag, Popover, Tooltip, Cascader, Checkbox, theme } from 'antd';

// Bridge antd theme tokens → the `--colorX` CSS vars used below, so Modal/Popover PORTALS (which don't
// inherit page-scoped vars) render in the live theme instead of the light fallbacks. See computedRulesManager.
function themeVars(token: any): React.CSSProperties {
  const m: Record<string, string> = {
    '--colorText': token.colorText, '--colorTextSecondary': token.colorTextSecondary,
    '--colorTextTertiary': token.colorTextTertiary, '--colorTextQuaternary': token.colorTextQuaternary,
    '--colorBorder': token.colorBorder, '--colorBorderSecondary': token.colorBorderSecondary,
    '--colorBgContainer': token.colorBgContainer, '--colorBgLayout': token.colorBgLayout,
    '--colorFillSecondary': token.colorFillSecondary, '--colorFillTertiary': token.colorFillTertiary,
    '--colorFillQuaternary': token.colorFillQuaternary, '--colorPrimary': token.colorPrimary,
    '--colorPrimaryBorder': token.colorPrimaryBorder, '--colorPrimaryBg': token.colorPrimaryBg,
    '--colorInfo': token.colorInfo, '--colorInfoBg': token.colorInfoBg, '--colorInfoBorder': token.colorInfoBorder,
    '--colorWarning': token.colorWarning, '--colorSuccess': token.colorSuccess, '--colorError': token.colorError,
  };
  return m as unknown as React.CSSProperties;
}
import { PartitionOutlined, FunctionOutlined, TableOutlined, BulbOutlined, PlayCircleOutlined, RobotOutlined } from '@ant-design/icons';
import { SettingRow, FieldPickerCascader, getCaretElement, insertAtCaret, getFields } from '@tuanla90/shared';
import { FORMULA_EXAMPLES as EXAMPLES, FORMULA_FUNCTIONS as FN_HELP, TRIGGER_OPTIONS, splitTriggers } from './formulaKnowledge';
import { t } from './i18n';

/**
 * The shared computed-rule EDITOR body — reused by BOTH the Settings page modal (with the Bảng/Cột-đích
 * pickers) AND the table/form column ⚙ dialog (pickers hidden; collection + target field come from the
 * column context). Everything else — formula toolbar (field picker, lookup-table picker, examples, hàm,
 * AI viết hộ), multi-check triggers, "Khi lỗi", and live "Chạy thử" — is identical in both places.
 * Self-contained: loads its own collection/field/record options + owns the AI/test state.
 */

export type RuleValue = {
  collectionName?: string;
  targetField?: string;
  formula?: string;
  runOn?: string;
  onError?: string;
  enabled?: boolean;
  dataSourceKey?: string;
};

// Inline compact-row label: sizes to its own text and never breaks (a fixed-width label clipped the
// longer English labels like "Enabled" → "Ena bled"). Used by the "Compute when / On error / Enabled" row.
const INLINE_LBL: React.CSSProperties = { color: 'var(--colorTextTertiary, rgba(0,0,0,0.45))', fontSize: 12, whiteSpace: 'nowrap', flex: 'none' };

const TARGET_TYPES = new Set(['double', 'integer', 'bigInt', 'decimal', 'float', 'real', 'number', 'percent', 'string', 'text', 'boolean', 'date', 'datetime', 'dateOnly', 'datetimeNoTz', 'unixTimestamp']);
const unwrap = (res: any) => res?.data?.data ?? res?.data ?? {};
const cleanTitle = (title: any, name: string): string => {
  if (!title) return name;
  const s = String(title);
  const m = s.match(/\{\{\s*t\(\s*['"]([^'"]+)['"]/);
  if (m) return m[1];
  return /\{\{/.test(s) ? name : s;
};

export function ComputedRuleEditor({
  api,
  value,
  onChange,
  showCollectionField = true,
  showTargetField = true,
  showEnabled = true,
  isEdit = false,
}: {
  api: any;
  value: RuleValue;
  onChange: (patch: Partial<RuleValue>) => void;
  showCollectionField?: boolean;
  showTargetField?: boolean;
  showEnabled?: boolean;
  isEdit?: boolean;
}) {
  const set = (patch: Partial<RuleValue>) => onChange(patch);
  const { token } = theme.useToken();
  const tv = themeVars(token);
  const [collOptions, setCollOptions] = useState<{ value: string; label: string }[]>([]);
  const [numericOpts, setNumericOpts] = useState<{ value: string; label: string }[]>([]);
  const [recordOpts, setRecordOpts] = useState<{ value: any; label: string }[]>([]);
  const [tableOpts, setTableOpts] = useState<any[]>([]);
  const [testId, setTestId] = useState<any>('');
  const [testRes, setTestRes] = useState<any>(null);
  const [testing, setTesting] = useState(false);
  const [aiDesc, setAiDesc] = useState('');
  const [aiBusy, setAiBusy] = useState('');
  const [aiResult, setAiResult] = useState<any>(null);
  const [aiOptions, setAiOptions] = useState<any[] | null>(null);
  const [aiExplainText, setAiExplainText] = useState('');
  const [aiAppsheet, setAiAppsheet] = useState('');
  const taRef = useRef<any>(null);
  const req = (url: string, opts: any = {}) => api?.request?.({ url, ...opts });
  const withCurrent = (opts: { value: string; label: string }[], cur?: string) =>
    cur && !opts.some((o) => o.value === cur) ? [{ value: cur, label: cur }, ...opts] : opts;

  // All collections (for the Bảng picker + lookup-table picker).
  useEffect(() => {
    if (!api?.request) return;
    req('collections:list', { params: { paginate: false } })
      .then((r: any) => {
        const list = (r?.data?.data || []).map((c: any) => { const tt = cleanTitle(c.title, c.name); return { value: c.name, label: tt !== c.name ? `${tt} (${c.name})` : c.name }; });
        setCollOptions(list);
        setTableOpts(list.map((c: any) => ({ value: c.value, label: c.label, isLeaf: false })));
      })
      .catch(() => {});
    // eslint-disable-next-line
  }, []);

  // On collection change: target-field options + records for "Chạy thử".
  useEffect(() => {
    let alive = true;
    setTestRes(null); setTestId('');
    (async () => {
      const coll = value.collectionName;
      if (!coll) { setNumericOpts([]); setRecordOpts([]); return; }
      const fs = await getFields(api, coll).catch(() => []);
      if (!alive) return;
      setNumericOpts((fs || []).filter((f: any) => TARGET_TYPES.has(f.type)).map((f: any) => { const tt = cleanTitle(f.uiSchema?.title, f.name); return { value: f.name, label: tt !== f.name ? `${tt} (${f.name}) · ${f.type}` : `${f.name} · ${f.type}` }; }));
      try {
        const cg = await req('collections:get', { params: { filterByTk: coll } });
        const tf = cg?.data?.data?.titleField || (fs || []).find((f: any) => f.type === 'string')?.name || null;
        const rl = await req(`${coll}:list`, { params: { pageSize: 100, sort: ['id'] } });
        const recs = (rl?.data?.data || []).map((r: any) => { const id = r.id; const tt = tf ? r[tf] : null; return { value: id, label: tt != null && tt !== '' ? `${tt} · #${id}` : `#${id}` }; });
        if (alive) setRecordOpts(recs);
      } catch { if (alive) setRecordOpts([]); }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line
  }, [value.collectionName]);

  const pickField = (path: string[]) => insertAtCaret(getCaretElement(taRef.current), 'data.' + path.join('.'), value.formula || '', (v) => set({ formula: v }));
  const loadTableFields = (selected: any[]) => {
    const target = selected[selected.length - 1];
    if (!target || target.children) return;
    target.loading = true;
    getFields(api, target.value).then((fs: any[]) => {
      target.loading = false;
      const kids = (fs || []).map((f: any) => ({ value: f.name, label: f.uiSchema?.title ? `${f.uiSchema.title} (${f.name})` : f.name, isLeaf: true }));
      target.children = kids.length ? kids : [{ value: '__none', label: t('(không có cột)'), disabled: true, isLeaf: true }];
      setTableOpts((prev) => [...prev]);
    });
  };
  const insertTableRef = (val: any[]) => { if (!val || val.length < 2) return; insertAtCaret(getCaretElement(taRef.current), `${val[0]}.${val[1]}`, value.formula || '', (v) => set({ formula: v })); };

  const runTest = async (idArg?: any) => {
    if (!value.collectionName || !value.formula?.trim()) { message.warning(t('Cần bảng + công thức')); return; }
    const id = idArg !== undefined ? idArg : testId;
    setTesting(true); setTestRes(null);
    try {
      const res = await req('ptdlComputed:test', { method: 'post', data: { collection: value.collectionName, formula: value.formula, filterByTk: id === '' || id == null ? undefined : id } });
      setTestRes(unwrap(res));
    } catch (e: any) { setTestRes({ error: e?.response?.data?.errors?.[0]?.message || e?.message || t('lỗi') }); }
    setTesting(false);
  };

  // AI tools (server self-validates via Chạy thử).
  const aiClear = () => { setAiResult(null); setAiOptions(null); setAiExplainText(''); };
  const aiCall = async (busy: string, url: string, data: any, onOk: (d: any) => void) => {
    if (!value.collectionName) { message.warning(t('Chọn "Bảng" trước')); return; }
    setAiBusy(busy); aiClear();
    try { onOk(unwrap(await req(url, { method: 'post', data: { collection: value.collectionName, sampleId: testId || undefined, ...data } }))); }
    catch (e: any) { setAiResult({ error: String(e?.response?.data?.errors?.[0]?.message || e?.message || e) }); }
    finally { setAiBusy(''); }
  };
  const aiWrite = () => { if (!aiDesc.trim()) return message.warning(t('Nhập mô tả bạn muốn tính')); aiCall('write', 'ptdlComputed:aiWrite', { description: aiDesc }, (d) => { setAiResult(d); if (d.formula) set({ formula: d.formula }); }); };
  const aiSuggest = () => { if (!aiDesc.trim()) return message.warning(t('Nhập mô tả bạn muốn tính')); aiCall('suggest', 'ptdlComputed:aiSuggest', { description: aiDesc, count: 3 }, (d) => { if (d.error) setAiResult(d); else setAiOptions(d.options || []); }); };
  const aiExplain = () => { if (!value.formula?.trim()) return message.warning(t('Ô công thức đang trống')); aiCall('explain', 'ptdlComputed:aiExplain', { formula: value.formula }, (d) => { if (d.error) setAiResult(d); else setAiExplainText(d.explanation || ''); }); };
  const aiFix = () => { if (!value.formula?.trim()) return message.warning(t('Ô công thức đang trống')); aiCall('fix', 'ptdlComputed:aiWrite', { fixFormula: value.formula, description: aiDesc }, (d) => { setAiResult(d); if (d.formula) set({ formula: d.formula }); }); };
  const aiConvert = () => { if (!aiAppsheet.trim()) return message.warning(t('Dán công thức AppSheet')); aiCall('convert', 'ptdlComputed:aiConvert', { appsheet: aiAppsheet }, (d) => { setAiResult(d); if (d.formula) set({ formula: d.formula }); }); };

  const examplesPopover = (
    <div style={{ width: 470, maxHeight: 360, overflow: 'auto', ...tv }}>
      {EXAMPLES.map(([label, f]) => (
        <div key={label} style={{ marginBottom: 9, cursor: 'pointer', padding: 4, borderRadius: 4 }}
          onClick={() => insertAtCaret(getCaretElement(taRef.current), f, value.formula || '', (v) => set({ formula: v }))}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--colorFillQuaternary, #f5f5f5)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
          <div style={{ fontSize: 12, fontWeight: 600 }}>{t(label)}</div>
          <code style={{ fontSize: 11.5, color: 'var(--colorTextSecondary)' }}>{f}</code>
        </div>
      ))}
    </div>
  );
  const helpPopover = (
    <div style={{ width: 440, maxHeight: 340, overflow: 'auto', ...tv }}>
      {FN_HELP.map(([g, fns]) => <div key={g} style={{ marginBottom: 6 }}><div style={{ fontSize: 12, fontWeight: 600, color: 'var(--colorTextTertiary, #888)' }}>{t(g)}</div><div style={{ fontSize: 12, fontFamily: 'monospace' }}>{t(fns)}</div></div>)}
    </div>
  );
  const testBadge = (tr: any, tries?: number) => !tr ? null : (tr.error
    ? <span style={{ color: '#d48806' }}>{t('Chạy thử lỗi')}{tries ? ` (${tries} ${t('lần')})` : ''}: {tr.error}</span>
    : <span style={{ color: '#389e0d' }}>{t('Chạy thử OK')}{tries ? ` (${tries} ${t('lần')})` : ''} → <b>{JSON.stringify(tr.value)}</b></span>);
  const aiPopover = (
    <div style={{ width: 430, ...tv }}>
      <Input.TextArea rows={2} value={aiDesc} onChange={(e) => setAiDesc(e.target.value)}
        placeholder={t('Mô tả bằng lời, vd: "tổng tiền các dòng đang active", "số ngày từ ngày tạo đến hôm nay"')} />
      <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button type="primary" size="small" icon={<RobotOutlined />} loading={aiBusy === 'write'} onClick={aiWrite}>{t('Tạo công thức')}</Button>
        <Button size="small" loading={aiBusy === 'suggest'} onClick={aiSuggest}>{t('Gợi ý 3 phương án')}</Button>
      </div>
      <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed var(--colorBorderSecondary, #eee)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: 'var(--colorTextTertiary)' }}>{t('Trên công thức đang có:')}</span>
        <Button size="small" loading={aiBusy === 'explain'} disabled={!value.formula?.trim()} onClick={aiExplain}>{t('Giải thích')}</Button>
        <Button size="small" loading={aiBusy === 'fix'} disabled={!value.formula?.trim()} onClick={aiFix}>{t('AI sửa lỗi')}</Button>
      </div>
      <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed var(--colorBorderSecondary, #eee)' }}>
        <span style={{ fontSize: 11, color: 'var(--colorTextTertiary)' }}>{t('Có công thức AppSheet? Dán vào đây để AI chuyển:')}</span>
        <Input.TextArea rows={2} value={aiAppsheet} onChange={(e) => setAiAppsheet(e.target.value)} style={{ marginTop: 4, fontFamily: 'monospace', fontSize: 12 }}
          placeholder={'SUM(SELECT(items[amount], [order_id] = [_THISROW].[id]))'} />
        <Button style={{ marginTop: 6 }} size="small" loading={aiBusy === 'convert'} onClick={aiConvert}>⇄ {t('Chuyển từ AppSheet')}</Button>
      </div>
      {aiExplainText && <div style={{ marginTop: 10, fontSize: 12, color: 'var(--colorTextSecondary)', background: 'var(--colorFillQuaternary, #f7f7f7)', padding: 8, borderRadius: 4 }}>{aiExplainText}</div>}
      {aiResult && (
        <div style={{ marginTop: 10, fontSize: 12, borderTop: '1px solid var(--colorBorderSecondary, #f0f0f0)', paddingTop: 8 }}>
          {aiResult.error ? <div style={{ color: 'var(--colorError, #cf1322)' }}>{t('Lỗi')}: {aiResult.error}</div> : (
            <>
              {aiResult.formula && <div>{t('Đã điền')}: <code style={{ fontSize: 11.5 }}>{aiResult.formula}</code></div>}
              {aiResult.explanation && <div style={{ color: 'var(--colorTextSecondary)', marginTop: 4 }}>{aiResult.explanation}</div>}
              <div style={{ marginTop: 4 }}>{testBadge(aiResult.test, aiResult.tries)}</div>
            </>
          )}
        </div>
      )}
      {aiOptions && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 11, color: 'var(--colorTextTertiary)', marginBottom: 4 }}>{t('Bấm 1 phương án để chèn:')}</div>
          {aiOptions.length === 0 && <div style={{ fontSize: 12, color: 'var(--colorTextTertiary)' }}>{t('(AI không trả về phương án)')}</div>}
          {aiOptions.map((o, i) => (
            <div key={i} style={{ padding: 6, borderRadius: 4, cursor: 'pointer', border: '1px solid var(--colorBorderSecondary, #f0f0f0)', marginBottom: 6 }}
              onClick={() => { set({ formula: o.formula }); message.success(t('Đã chèn phương án {{n}}', { n: i + 1 })); }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--colorFillQuaternary, #f5f5f5)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
              <code style={{ fontSize: 11.5 }}>{o.formula}</code>
              {o.explanation && <div style={{ fontSize: 11, color: 'var(--colorTextTertiary)', marginTop: 2 }}>{o.explanation}</div>}
              <div style={{ fontSize: 11, marginTop: 2 }}>{testBadge(o.test)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div style={tv}>
      {(showCollectionField || showTargetField) && (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {showCollectionField && (
            <div style={{ flex: '1 1 260px', minWidth: 0 }}>
              <SettingRow layout="vertical" label={t('Bảng (collection)')}>
                <Select showSearch style={{ width: '100%' }} value={value.collectionName || undefined} options={withCurrent(collOptions, value.collectionName)}
                  optionFilterProp="label" filterOption={(i, o) => String(o?.label).toLowerCase().includes(i.toLowerCase())}
                  onChange={(v) => set({ collectionName: (v as string) || '', targetField: '' })} placeholder={t('Chọn hoặc tìm bảng')} disabled={isEdit} />
              </SettingRow>
            </div>
          )}
          {showTargetField && (
            <div style={{ flex: '1 1 260px', minWidth: 0 }}>
              <SettingRow layout="vertical" label={t('Cột đích — field thật (số / chữ / ngày / boolean)')}>
                <Select showSearch style={{ width: '100%' }} value={value.targetField || undefined} options={withCurrent(numericOpts, value.targetField)}
                  optionFilterProp="label" filterOption={(i, o) => String(o?.label).toLowerCase().includes(i.toLowerCase())}
                  onChange={(v) => set({ targetField: (v as string) || '' })} placeholder={numericOpts.length ? t('Chọn cột đích') : t('Chọn bảng trước')} disabled={isEdit} notFoundContent={t('Không có field phù hợp')} />
              </SettingRow>
            </div>
          )}
        </div>
      )}
      <SettingRow layout="vertical" label={<span>{t('Công thức — dòng hiện tại & quan hệ dùng')} <code>data.…</code> · {t('bảng tra cứu gõ thẳng tên bảng')} <code>{t('tên_bảng.cột')}</code></span>}>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
          <FieldPickerCascader api={api} collectionName={value.collectionName} includeToMany maxDepth={4} onPick={pickField}
            label={<span style={{ fontSize: 12.5 }}><PartitionOutlined /> {t('Chèn field/quan hệ')}</span>} />
          <Cascader options={tableOpts} loadData={loadTableFields as any} changeOnSelect={false} placement="bottomLeft"
            showSearch={{ filter: (i: string, p: any[]) => p.some((o) => String(o.label).toLowerCase().includes(i.toLowerCase())) }}
            onChange={(val: any) => insertTableRef(val)} value={[] as any}>
            <a style={{ fontSize: 12.5 }} onClick={(e) => e.preventDefault()}><TableOutlined /> {t('Chèn bảng tra cứu')}</a>
          </Cascader>
          <Popover content={examplesPopover} trigger="click" title={t('Ví dụ công thức')}><a style={{ fontSize: 12.5 }}><BulbOutlined /> {t('Ví dụ')}</a></Popover>
          <Popover content={helpPopover} trigger="click" title={t('Hàm & cú pháp')}><a style={{ fontSize: 12.5 }}><FunctionOutlined /> {t('hàm')}</a></Popover>
          <Popover content={aiPopover} trigger="click" title={<span><RobotOutlined /> {t('Viết công thức bằng AI')}</span>} placement="bottomLeft" destroyTooltipOnHide={false}>
            <a style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--colorPrimary, #722ed1)' }}><RobotOutlined /> {t('AI viết hộ')}</a>
          </Popover>
        </div>
        <Input.TextArea ref={taRef} autoSize={{ minRows: 3, maxRows: 8 }} value={value.formula}
          onChange={(e) => set({ formula: e.target.value })}
          placeholder={t('vd: data.subtotal - data.discount\nhoặc: SUM(data.items.line_amount)\nbảng tra cứu (gõ thẳng tên bảng): data.metric * SUMIFS(bang_hs.he_so, bang_hs.a, data.parent.region, bang_hs.b, data.grade)')}
          style={{ fontFamily: 'monospace', fontSize: 13 }} />
      </SettingRow>
      {/* Compact inline row: auto-width nowrap labels (bilingual — a fixed labelWidth clipped/wrapped the
          longer English labels like "Enabled"). Each label+control is one Space group; wrapping happens
          BETWEEN groups, never inside a label. */}
      <Space size={20} wrap align="center" style={{ marginBottom: 8, rowGap: 8 }}>
        <Space size={8} align="center">
          <span style={INLINE_LBL}>{t('Tính khi')}</span>
          <Checkbox.Group options={TRIGGER_OPTIONS.map((o) => ({ ...o, label: t(o.label) }))} value={splitTriggers(value.runOn)}
            onChange={(vals) => set({ runOn: (vals as string[]).join(',') })} />
          <Tooltip title={
            <div style={{ fontSize: 12, lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: t('Tích nhiều được — ghép thành kịch bản:<br/><b>Khi tạo</b>: tính 1 lần lúc tạo dòng.<br/><b>Khi sửa</b>: tính lại mỗi lần mở dòng đó bấm lưu (bất kể sửa field nào).<br/><b>Khi nguồn thay đổi</b>: tính lại khi dữ liệu nguồn đổi (thêm/xoá dòng con, sửa cha, <u>sửa bảng config</u>) — đây là phần “lan” (fan-out).<br/><br/>Ví dụ:<br/>• <b>Tạo + Sửa + Nguồn</b> = luôn đúng tuyệt đối (mặc định).<br/>• <b>Tạo + Sửa</b> = cứ mở form lưu là tính, nhưng sửa bảng config KHÔNG lan (an toàn, không tốn).<br/>• <b>Sửa + Nguồn</b> = luôn đúng theo nguồn, không chốt lúc tạo.<br/>• <b>Chỉ Tạo</b> = chốt số, đóng băng (số HĐ, giá lúc đặt).') }} />
          }><BulbOutlined style={{ color: 'var(--colorTextTertiary, #999)', cursor: 'help' }} /></Tooltip>
          {splitTriggers(value.runOn).length === 0 && (
            <span style={{ fontSize: 12, color: 'var(--colorWarning, #d48806)', whiteSpace: 'nowrap' }}>{t('Chưa chọn → không tự tính (chỉ bằng nút “Tính lại”).')}</span>
          )}
        </Space>
        <Space size={8} align="center">
          <span style={INLINE_LBL}>{t('Khi lỗi')}</span>
          <Select size="small" value={value.onError || 'null'} style={{ width: 150 }} onChange={(v) => set({ onError: v })}
            options={[{ label: t('Ghi null'), value: 'null' }, { label: t('Giữ giá trị cũ'), value: 'keep' }]} />
        </Space>
        {showEnabled && (
          <Space size={8} align="center">
            <span style={INLINE_LBL}>{t('Bật')}</span>
            <Switch size="small" checked={value.enabled !== false} onChange={(c) => set({ enabled: c })} />
          </Space>
        )}
      </Space>
      <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--colorBorderSecondary, #f0f0f0)' }}>
        <Space wrap size={8} align="center">
          <span style={{ fontSize: 12, color: 'var(--colorTextTertiary)' }}><PlayCircleOutlined /> {t('Chạy thử trên 1 bản ghi:')}</span>
          <Select showSearch size="small" style={{ width: 320 }} allowClear optionFilterProp="label"
            placeholder={recordOpts.length ? t('Chọn bản ghi (trống = bản ghi đầu)') : t('Bảng chưa có bản ghi')}
            value={testId === '' || testId == null ? undefined : testId} options={recordOpts}
            filterOption={(i, o) => String(o?.label).toLowerCase().includes(i.toLowerCase())}
            onChange={(v) => { setTestId(v ?? ''); runTest(v ?? ''); }} notFoundContent={t('Không có bản ghi')} />
          <Button size="small" type="dashed" loading={testing} onClick={() => runTest()}>{t('Chạy')}</Button>
          {testRes && (testRes.error
            ? <Tag color="red" style={{ whiteSpace: 'normal', maxWidth: 520 }}>{t('Lỗi')}: {testRes.error}</Tag>
            : <Tag color="green" style={{ whiteSpace: 'normal', maxWidth: 520 }}>{t('Kết quả')} = <b>{testRes.value === null || testRes.value === undefined ? 'null' : String(testRes.value)}</b>{testRes.recordId != null ? ` · id ${testRes.recordId}` : ''}</Tag>)}
        </Space>
      </div>
    </div>
  );
}

/**
 * Formily flow-settings wrapper — lets the column/field ⚙ dialog host the full editor. The Formily field
 * value is the rule object `{ formula, runOn, onError }`; collection + target field come from the column
 * context via x-component-props (so the Bảng/Cột-đích pickers are hidden). Registered as
 * 'ComputedRuleEditorField' via registerFormulaComponents.
 */
export function ComputedRuleEditorField(props: any) {
  const { value, onChange, api, collection, targetField, dataSourceKey } = props;
  const v: RuleValue = { collectionName: collection, targetField, dataSourceKey, formula: value?.formula || '', runOn: value?.runOn, onError: value?.onError };
  return (
    <ComputedRuleEditor
      api={api}
      value={v}
      onChange={(patch) => onChange?.({ ...(value || {}), ...patch })}
      showCollectionField={false}
      showTargetField={false}
      showEnabled={false}
    />
  );
}

export default ComputedRuleEditor;
