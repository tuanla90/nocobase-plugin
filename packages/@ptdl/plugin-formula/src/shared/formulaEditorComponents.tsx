import React from 'react';
import { AutoComplete, Checkbox, Input, InputNumber, Segmented, Switch, Popover, Typography } from 'antd';
import { observer, useForm } from '@formily/react';
import { visibleWhen, fi, SEG_PROPS, PreviewBox, registerSettingsKit, AiCodegenButton, st } from '@ptdl/shared';
import { listFunctionNames, evaluateFormula, resultToString } from './formulaEngine';
import { TRIGGER_OPTIONS, splitTriggers } from './formulaKnowledge';
import { applyFormulaFormat, DATE_FORMAT_PRESETS } from './formulaFormat';
import { ComputedRuleEditorField } from './ComputedRuleEditor';
import { t } from './i18n';

/**
 * Shared flow-settings editor components for both the Formula display field and the
 * standalone Formula column. Registered once via registerFormulaComponents(flowSettings)
 * and referenced by string name ('FormulaCodeInput' etc.) in each model's uiSchema.
 */

// Category labels + function-reference lists for the "ƒ" help popover. Vietnamese-source (= i18n key);
// the labels + the HTML row (which embeds Vietnamese "màu") are translated at render via t(). The pure
// function-name rows are identical in both languages, so t() simply returns them unchanged.
const HELP_GROUPS: Array<[string, string]> = [
  ['Văn bản', 'CONCATENATE · TEXTJOIN · LEFT · RIGHT · MID · UPPER · LOWER · PROPER · TRIM · LEN · SUBSTITUTE · TEXT · REPT'],
  ['Logic', 'IF · IFS · SWITCH · AND · OR · NOT · IFERROR · ISBLANK · ISNUMBER'],
  ['Số', 'SUM · AVERAGE · MIN · MAX · COUNT · ROUND · ROUNDUP · ROUNDDOWN · ABS · MOD · POWER · CEILING · FLOOR'],
  ['Ngày', 'TODAY · NOW · DATE · YEAR · MONTH · DAY · DATEDIF · EDATE · TEXT(date,"dd/mm/yyyy")'],
  ['Tra cứu', 'VLOOKUP · INDEX · MATCH · CHOOSE'],
  ['HTML', 'B · I · U · BR · COLOR(x,màu) · BG · TAG(text,màu) · DOT(màu,size) · LINK(url,text) · IMG(src,size)'],
];

// Formula textarea + a "ƒ" help popover. value/onChange are Formily-wired. No React hooks.
// When the uiSchema passes `collection`+`api` (display-field / column models), an "✨ AI viết hộ" button
// reuses the proven server writer `ptdlComputed:aiWrite` (NL → formula, self-validated via testFormula,
// retried server-side). Gated on collection+api so contexts without them (default-value) just omit it.
export function FormulaCodeInput(props: any) {
  const { value, onChange } = props;
  const aiGenerate = async (r: any) => {
    if (!props.api?.request || !props.collection) return { error: st('Thiếu bảng hoặc kết nối API') };
    try {
      const res = await props.api.request({
        url: 'ptdlComputed:aiWrite',
        method: 'post',
        data: { collection: props.collection, dataSourceKey: props.dataSourceKey, description: r.instruction, fixFormula: r.current },
      });
      const d = res?.data?.data || {};
      if (d.error) return { error: d.error };
      if (!d.formula) return { error: st('AI không trả về công thức') };
      const note = d.test?.error ? `⚠️ ${d.test.error}` : `✓ ${st('chạy thử OK')}`;
      return { code: d.formula, explain: [d.explanation, note].filter(Boolean).join(' — ') };
    } catch (e: any) {
      return { error: e?.response?.data?.errors?.[0]?.message || e?.message || String(e) };
    }
  };
  let fnCount = 0;
  try { fnCount = listFunctionNames().length; } catch (_) { fnCount = 0; }
  const help = (
    <div style={{ width: 460, maxHeight: 340, overflow: 'auto' }}>
      <Typography.Paragraph style={{ marginBottom: 8 }}>
        <b>data</b> = {t('bản ghi dòng hiện tại')}. {t('VD')} <code>data.name</code>, <code>data.customer.name</code>.<br />
        <b>&amp;</b> = {t('nối chuỗi (Excel). Cộng dồn quan hệ:')} <code>SUM(data.order_ids.amount)</code>. {t('Viết HOA/thường đều được.')}
      </Typography.Paragraph>
      {HELP_GROUPS.map(([title, fns]) => (
        <div key={title} style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#888' }}>{t(title)}</div>
          <div style={{ fontSize: 12, fontFamily: 'monospace' }}>{t(fns)}</div>
        </div>
      ))}
      <div style={{ fontSize: 11, color: '#aaa', marginTop: 8 }}>{t('Tổng cộng {{count}} hàm (formulajs + HTML helpers).', { count: fnCount })}</div>
    </div>
  );
  return (
    <div>
      <Input.TextArea
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        rows={4}
        placeholder={t('VD: CONCATENATE("<b>", data.name, "</b>")\nhoặc: IF(data.stock>0, TAG("Còn","green"), TAG("Hết","red"))')}
        style={{ fontFamily: 'monospace', fontSize: 13 }}
      />
      <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 12 }}>
        <Popover content={help} trigger="click" placement="bottomLeft" title={t('Hàm & cú pháp')}>
          <a style={{ fontSize: 12 }}>ƒ {t('Danh sách hàm & cú pháp')}</a>
        </Popover>
        {props.collection && props.api ? (
          <AiCodegenButton
            language="formula"
            placeholder={st('Mô tả bạn muốn tính (vd: tổng tiền = số lượng × đơn giá, có định dạng tiền)')}
            getCurrent={() => value}
            callGenerate={aiGenerate}
            onInsert={(code) => onChange?.(code)}
          />
        ) : null}
      </div>
    </div>
  );
}

// Live preview: evaluate the current formula against a real sample record from the collection,
// re-rendering as the user edits (observer → useForm). loadSample is provided by the uiSchema.
export const FormulaPreview = observer((props: any) => {
  const form: any = useForm();
  const v = form?.values || {};
  const [sample, setSample] = React.useState<any>(null);
  const [state, setState] = React.useState<'loading' | 'none' | 'ok'>('loading');
  React.useEffect(() => {
    let alive = true;
    const load = props.loadSample;
    if (typeof load !== 'function') { setState('none'); return; }
    Promise.resolve(load())
      .then((s: any) => { if (!alive) return; if (s) { setSample(s); setState('ok'); } else setState('none'); })
      .catch(() => { if (alive) setState('none'); });
    return () => { alive = false; };
  }, []);
  const formula = String(v.formula || '').trim();
  const record = sample || {};
  const align = (v.align || 'left') as any;
  let body: React.ReactNode = <span style={{ color: '#bbb' }}>—</span>;
  if (formula) {
    const res = evaluateFormula(formula, record);
    if ('error' in res) {
      body = <span style={{ color: '#cf1322', fontFamily: 'monospace', fontSize: 12 }}>#ERR {res.error.message}</span>;
    } else {
      const fmt = applyFormulaFormat(res.value, {
        fmtType: v.fmtType, fmtThousands: v.fmtNumber?.thousands, fmtDecimals: v.fmtNumber?.decimals, fmtDate: v.fmtDate,
      });
      const text = fmt !== null ? fmt : resultToString(res.value);
      if (text === '' || res.value === null || res.value === undefined) body = <span style={{ color: '#bbb' }}>{t('(trống)')}</span>;
      else if (fmt === null && v.renderHtml !== false) body = <div style={{ textAlign: align }} dangerouslySetInnerHTML={{ __html: text }} />;
      else body = <div style={{ textAlign: align }}>{text}</div>;
    }
  }
  const note = state === 'loading' ? t('Đang tải bản ghi mẫu…')
    : state === 'none' ? t('Chưa có bản ghi mẫu — data.* sẽ trống')
    : t('Kết quả trên bản ghi đầu tiên của bảng');
  return (
    <PreviewBox label={props.label || t('Xem trước')}>
      <div style={{ minHeight: 22, fontSize: 14 }}>{body}</div>
      <div style={{ fontSize: 11, color: 'var(--colorTextQuaternary, #bbb)', marginTop: 8 }}>{note}</div>
    </PreviewBox>
  );
});

export function AlignSeg(props: any) {
  return (
    <Segmented
      size="small"
      {...SEG_PROPS}
      value={props.value || 'left'}
      onChange={(v) => props.onChange?.(v)}
      options={[
        { label: t('Trái'), value: 'left' },
        { label: t('Giữa'), value: 'center' },
        { label: t('Phải'), value: 'right' },
      ]}
    />
  );
}

export function RenderHtmlSwitch(props: any) {
  return <Switch size="small" checked={props.value !== false} onChange={(c) => props.onChange?.(c)} />;
}

// Multi-check trigger control for the computed-value ⚙ flow (matches the settings page). value = comma-string.
export function TriggerCheckboxes(props: any) {
  const { value, onChange } = props;
  const options = TRIGGER_OPTIONS.map((o) => ({ ...o, label: t(o.label) }));
  return <Checkbox.Group options={options} value={splitTriggers(value)} onChange={(vals) => onChange?.((vals as string[]).join(','))} />;
}

let registered = false;
export function registerFormulaComponents(flowSettings: any) {
  if (!flowSettings || registered) return;
  try {
    // registerSettingsKit also registers SettingsGrid + CollapsibleSection (kit house style).
    registerSettingsKit(flowSettings, { FormulaCodeInput, AlignSeg, RenderHtmlSwitch, TriggerCheckboxes, ComputedRuleEditorField, FmtTypeSeg, FmtNumberOpts, FmtDateInput, FormulaPreview });
    registered = true;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[formula] register components failed', e);
  }
}

// The shared uiSchema fragment (formula + renderHtml + align) used by both models' settings step.
// ---- format kết quả (Number/Date) ----
export function FmtTypeSeg(props: any) {
  return (
    <Segmented
      size="small"
      {...SEG_PROPS}
      value={props.value || 'auto'}
      onChange={(v) => props.onChange?.(v)}
      options={[
        { label: t('Auto'), value: 'auto' },
        { label: t('Số'), value: 'number' },
        { label: t('Ngày'), value: 'date' },
      ]}
    />
  );
}

/** Gộp 2 option số vào 1 control: { thousands, decimals } — tránh nhiều field reaction. */
export function FmtNumberOpts(props: any) {
  const v = props.value || {};
  const set = (patch: any) => props.onChange?.({ ...v, ...patch });
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 16 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#666' }}>
        {t('Ngăn cách nghìn')}
        <Switch size="small" checked={!!v.thousands} onChange={(b) => set({ thousands: b || undefined })} />
      </span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#666' }}>
        {t('Số thập phân')}
        <InputNumber
          size="small"
          min={0}
          max={6}
          value={v.decimals}
          onChange={(n) => set({ decimals: n === null || n === undefined ? undefined : n })}
          style={{ width: 70 }}
        />
      </span>
    </span>
  );
}

export function FmtDateInput(props: any) {
  return (
    <AutoComplete
      size="small"
      style={{ width: 220 }}
      value={props.value || 'DD/MM/YYYY'}
      onChange={(v) => props.onChange?.(v)}
      options={DATE_FORMAT_PRESETS.map((f) => ({ value: f }))}
      placeholder="DD/MM/YYYY HH:mm"
    />
  );
}

// x-reactions PHẢI là function (không {{$deps}} — compileUiSchema sẽ nổ $deps is not defined).
// visibleWhen('fmtType', want) từ @ptdl/shared: rx(v => v.fmtType === want) → field.setState({visible}).

// The shared uiSchema fragment (formula + renderHtml + align + format) used by both models' settings step.
export function formulaStepUiSchema(t: (s: string) => any, ctx?: any) {
  // Resolve the collection so the preview can load a real sample row (data.*). Works for both the
  // display-field model (bound field → its collection) and the virtual column (table collection).
  const model = ctx?.model;
  const cf = model?.collectionField;
  const coll = model?.context?.collection || model?.collection || cf?.collection;
  const api = ctx?.app?.apiClient || model?.context?.api || model?.flowEngine?.context?.api;
  const collName = coll?.name || cf?.collectionName;
  const dsKey = coll?.dataSourceKey || cf?.dataSourceKey;
  const loadSample = async () => {
    if (!api || !collName) return null;
    try {
      const res = await api.request({
        url: `${collName}:list`, method: 'get', params: { pageSize: 1 },
        headers: dsKey ? { 'X-Data-Source': dsKey } : undefined,
      });
      return res?.data?.data?.[0] || null;
    } catch (_) {
      return null;
    }
  };
  return {
    preview: {
      type: 'void',
      'x-decorator': 'FormItem', 'x-decorator-props': { style: { marginBottom: 10 } },
      'x-component': 'FormulaPreview', 'x-component-props': { loadSample, label: t('Xem trước') },
    },
    formula: {
      type: 'string',
      title: t('Công thức'),
      'x-decorator': 'FormItem',
      'x-decorator-props': { style: { marginBottom: 8 } },
      'x-component': 'FormulaCodeInput',
      // collection+api let FormulaCodeInput show the "AI viết hộ" button (reuses ptdlComputed:aiWrite).
      'x-component-props': { collection: collName, api, dataSourceKey: dsKey },
    },
    display: {
      type: 'void', 'x-component': 'CollapsibleSection', 'x-component-props': { title: t('Hiển thị') },
      properties: {
        grid: {
          type: 'void', 'x-component': 'SettingsGrid',
          'x-component-props': { minColWidth: 180, style: { alignItems: 'end' } },
          properties: {
            align: fi(t('Căn lề'), 'AlignSeg'),
            renderHtml: fi(t('Kết xuất HTML'), 'RenderHtmlSwitch', {
              type: 'boolean',
              decoratorProps: { tooltip: t('Hiển thị kết quả dạng HTML (in đậm, màu, TAG…). Tắt để hiện văn bản thuần.') },
            }),
          },
        },
      },
    },
    format: {
      type: 'void', 'x-component': 'CollapsibleSection', 'x-component-props': { title: t('Định dạng') },
      properties: {
        fmtType: fi(t('Kiểu'), 'FmtTypeSeg', {
          decoratorProps: { tooltip: t('Auto giữ nguyên kết quả công thức. Số/Ngày định dạng lại giá trị số hoặc ngày.') },
        }),
        fmtNumber: fi(t('Định dạng số'), 'FmtNumberOpts', { type: 'object', reactions: visibleWhen('fmtType', 'number') }),
        fmtDate: fi(t('Định dạng ngày'), 'FmtDateInput', { reactions: visibleWhen('fmtType', 'date') }),
      },
    },
  };
}
