import React from 'react';
import { EditableItemModel } from '@nocobase/flow-engine';
import { Progress, InputNumber, Switch } from 'antd';
import { SegmentedGroup, ColorField, SettingsGrid, ResetButton, fieldItem as fi, rx, visibleWhen, SEG_PROPS, colorStrip, registerSettingsKit } from '@tuanla90/shared';
import { globalToggleField, saveWidgetGlobal } from './globalWidgetToggle';
import { observer, useForm } from '@formily/react';
import { bindDisplayField } from './displayBinding';

/**
 * No-code widget: field SỐ (number/integer) + PERCENT → thanh Progress (antd).
 * - Editable: type `line` cho KÉO/BẤM trực tiếp lên thanh (giống Rate); type `circle`/`gauge` nhập bằng InputNumber.
 * - readPretty: chỉ hiển thị.
 * - percent lưu dạng phân số 0–1 (NocoBase) → hiển thị value*100. number → value/max*100.
 * - Màu: mono / gradient (0%→100%) / threshold (đổi màu theo ngưỡng). Vị trí % text: top/bottom/left/right.
 */

const P_DEFAULTS = {
  ptype: 'line', max: 0, showInfo: true, textPos: 'inline', textAlign: 'right',
  colorMode: 'mono', color: '',
  colorFrom: '#1677ff', colorMid: '', colorTo: '#52c41a',
  t1: 33, c1: '#ff4d4f', t2: 66, c2: '#faad14', c3: '#52c41a',
};

type PCfg = {
  ptype: string; max: number; showInfo: boolean; textPos: string; textAlign: string;
  colorMode: string; color: string;
  colorFrom: string; colorMid: string; colorTo: string;
  t1: number; c1: string; t2: number; c2: string; c3: string;
};
// textPos ∈ {top,bottom,inline}; textAlign ∈ {left,right}. Tương thích ngược config cũ (left/right = inline + align).
function normTextPos(pos: any, align: any): { pos: string; align: string } {
  let p = pos || 'inline';
  let a = align || 'right';
  if (p === 'left') { p = 'inline'; a = 'left'; }
  else if (p === 'right') { p = 'inline'; a = 'right'; }
  return { pos: p, align: a };
}
function pcfgFromProps(p: any): PCfg {
  const tp = normTextPos(p.ptdlpTextPos, p.ptdlpTextAlign);
  return {
    ptype: p.ptdlpType || 'line',
    max: typeof p.ptdlpMax === 'number' && p.ptdlpMax > 0 ? p.ptdlpMax : 0,
    showInfo: p.ptdlpShowInfo !== false,
    textPos: tp.pos, textAlign: tp.align,
    colorMode: p.ptdlpColorMode || 'mono',
    color: p.ptdlpColor || '',
    colorFrom: p.ptdlpColorFrom || '#1677ff',
    colorMid: p.ptdlpColorMid || '',
    colorTo: p.ptdlpColorTo || '#52c41a',
    t1: typeof p.ptdlpT1 === 'number' ? p.ptdlpT1 : 33,
    c1: p.ptdlpC1 || '#ff4d4f',
    t2: typeof p.ptdlpT2 === 'number' ? p.ptdlpT2 : 66,
    c2: p.ptdlpC2 || '#faad14',
    c3: p.ptdlpC3 || '#52c41a',
  };
}
function pcfgFromForm(v: any): PCfg {
  const tp = normTextPos(v?.textPos, v?.textAlign);
  return {
    ptype: v?.ptype || 'line',
    max: typeof v?.max === 'number' && v.max > 0 ? v.max : 0,
    showInfo: v?.showInfo !== false,
    textPos: tp.pos, textAlign: tp.align,
    colorMode: v?.colorMode || 'mono',
    color: v?.color || '',
    colorFrom: v?.colorFrom || '#1677ff',
    colorMid: v?.colorMid || '',
    colorTo: v?.colorTo || '#52c41a',
    t1: typeof v?.t1 === 'number' ? v.t1 : 33,
    c1: v?.c1 || '#ff4d4f',
    t2: typeof v?.t2 === 'number' ? v.t2 : 66,
    c2: v?.c2 || '#faad14',
    c3: v?.c3 || '#52c41a',
  };
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
function computePercent(value: any, cfg: PCfg, isPercent: boolean, autoMax?: number): number {
  const n = value == null || value === '' ? 0 : Number(value);
  if (Number.isNaN(n)) return 0;
  // Number field denominator: configured max (>0) → else the auto column max (>0) → else 100.
  const denom = cfg.max && cfg.max > 0 ? cfg.max : autoMax && autoMax > 0 ? autoMax : 100;
  const pct = isPercent ? n * 100 : (n / denom) * 100;
  return Math.round(clamp(pct, 0, 100) * 100) / 100;
}
// strokeColor cho antd Progress: mono=1 màu | gradient={0%,100%} | threshold=màu theo ngưỡng (single).
function resolveStroke(cfg: PCfg, percent: number): any {
  if (cfg.colorMode === 'gradient') {
    const from = cfg.colorFrom || '#1677ff';
    const to = cfg.colorTo || '#52c41a';
    // Optional mid stop → 3-colour gradient; empty mid keeps the classic 2-colour gradient (back-compat).
    return cfg.colorMid ? { '0%': from, '50%': cfg.colorMid, '100%': to } : { '0%': from, '100%': to };
  }
  if (cfg.colorMode === 'threshold') {
    if (percent <= cfg.t1) return cfg.c1 || '#ff4d4f';
    if (percent <= cfg.t2) return cfg.c2 || '#faad14';
    return cfg.c3 || '#52c41a';
  }
  return cfg.color || undefined; // mono (undefined = xanh mặc định antd)
}

// ---- Auto max (aggregate) ----------------------------------------------------------------------
// "Full value (100%)" bỏ trống (cfg.max <= 0) trên field SỐ thường → thanh readPretty scale theo GIÁ
// TRỊ LỚN NHẤT của cột trên toàn collection. Dùng data-viz `<coll>:query` (measure max) — aggregate
// server duy nhất trong build này (xem menu-badge). Cache + dedup in-flight theo cột (TTL 60s).
const maxCache = new Map<string, { value?: number | null; ts?: number; promise?: Promise<number | null> }>();
const MAX_TTL = 60000;

async function fetchColumnMax(api: any, collection: string, field: string, ds?: string): Promise<number | null> {
  if (!api?.request || !collection || !field) return null;
  try {
    const res = await api.request({
      url: `${collection}:query`,
      method: 'post',
      data: {
        collection,
        ...(ds && ds !== 'main' ? { dataSource: ds } : {}),
        measures: [{ field: [field], aggregation: 'max', alias: 'value' }],
        dimensions: [],
      },
    });
    const rows = res?.data?.data;
    const raw = Array.isArray(rows) && rows.length ? rows[0]?.value : undefined;
    const num = typeof raw === 'number' ? raw : Number(raw);
    return Number.isFinite(num) && num > 0 ? num : null;
  } catch (_) {
    return null;
  }
}

function resolveMaxCtx(model: any): { api: any; collection: string; field: string; ds?: string } | null {
  const cf = model?.collectionField || model?.context?.collectionField;
  const field = cf?.name;
  const collection = cf?.collectionName || model?.collection?.name || model?.context?.collection?.name;
  const ds = cf?.dataSourceKey || model?.collection?.dataSourceKey || model?.context?.collection?.dataSourceKey;
  const app = model?.context?.app || model?.flowEngine?.context?.app;
  const api = model?.context?.api || model?.flowEngine?.context?.api || app?.apiClient;
  if (!api || !collection || !field) return null;
  return { api, collection, field, ds };
}
const maxKeyOf = (info: { collection: string; field: string; ds?: string }) => `${info.ds || ''}:${info.collection}:${info.field}`;

function getColumnMax(info: { api: any; collection: string; field: string; ds?: string }): Promise<number | null> {
  const key = maxKeyOf(info);
  const c = maxCache.get(key);
  if (c && c.ts != null && Date.now() - c.ts < MAX_TTL) return Promise.resolve(c.value ?? null);
  if (c && c.promise) return c.promise;
  const promise = fetchColumnMax(info.api, info.collection, info.field, info.ds)
    .then((v) => { maxCache.set(key, { value: v, ts: Date.now() }); return v; })
    .catch(() => { maxCache.delete(key); return null; });
  maxCache.set(key, { promise });
  return promise;
}

// Thanh LINE — hỗ trợ kéo/bấm khi truyền onPercent (editable). Text % đặt theo textPos.
function LineProgress({ cfg, percent, onPercent }: { cfg: PCfg; percent: number; onPercent?: (p: number) => void }) {
  const stroke = resolveStroke(cfg, percent);
  const barRef = React.useRef<HTMLDivElement | null>(null);
  const interactive = !!onPercent;
  const setFromX = (clientX: number) => {
    const el = barRef.current;
    if (!el || !onPercent) return;
    const r = el.getBoundingClientRect();
    if (r.width <= 0) return;
    onPercent(clamp(Math.round(((clientX - r.left) / r.width) * 100), 0, 100));
  };
  const onDown = (e: React.PointerEvent) => {
    if (!interactive) return;
    e.preventDefault();
    setFromX(e.clientX);
    const mv = (ev: PointerEvent) => setFromX(ev.clientX);
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  };
  const bar = (
    <div ref={barRef} onPointerDown={onDown} style={{ flex: 1, minWidth: 60, cursor: interactive ? 'pointer' : 'default', touchAction: 'none' }}>
      <Progress type="line" percent={percent} strokeColor={stroke} showInfo={false} />
    </div>
  );
  if (!cfg.showInfo) return <div style={{ display: 'flex', width: '100%' }}>{bar}</div>;
  const text = <span style={{ color: '#595959', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{percent}%</span>;
  const align = cfg.textAlign === 'left' ? 'left' : 'right';
  // pos: top/bottom = text nằm hàng riêng (căn trái/phải); inline = text cùng hàng, bên trái/phải thanh.
  if (cfg.textPos === 'top') return <div style={{ display: 'flex', flexDirection: 'column', gap: 2, width: '100%' }}><div style={{ textAlign: align }}>{text}</div>{bar}</div>;
  if (cfg.textPos === 'bottom') return <div style={{ display: 'flex', flexDirection: 'column', gap: 2, width: '100%' }}>{bar}<div style={{ textAlign: align }}>{text}</div></div>;
  // inline
  return align === 'left'
    ? <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>{text}{bar}</div>
    : <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>{bar}{text}</div>;
}

// Circle/Gauge — readPretty hiện % ở tâm (antd). Editable: overlay InputNumber vào tâm để nhập % (0–100).
function CircleProgress({ cfg, percent, onPercent }: { cfg: PCfg; percent: number; onPercent?: (p: number) => void }) {
  const editable = !!onPercent;
  const size = 72;
  return (
    <div style={{ position: 'relative', display: 'inline-flex', lineHeight: 0 }}>
      <Progress
        type={cfg.ptype as any}
        percent={percent}
        strokeColor={resolveStroke(cfg, percent)}
        showInfo={editable ? false : cfg.showInfo}
        size={size}
      />
      {editable ? (
        <div
          className="ptdlp-center-num"
          style={{
            // Gauge (dashboard) chữ nằm hơi thấp so với tâm bbox → nhích lên khi circle, để tự nhiên khi gauge.
            position: 'absolute', left: 0, right: 0,
            top: cfg.ptype === 'dashboard' ? '58%' : '50%', transform: 'translateY(-50%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
          }}
        >
          <style>{'.ptdlp-center-num .ant-input-number-input{text-align:center;padding:0;height:auto;}'}</style>
          <InputNumber
            size="small"
            variant="borderless"
            value={percent}
            min={0}
            max={100}
            controls={false}
            onChange={(v: any) => onPercent?.(clamp(Math.round(Number(v) || 0), 0, 100))}
            formatter={(v: any) => (v == null || v === '' ? '' : `${v}%`)}
            parser={(v: any) => (v == null ? '' : String(v).replace('%', ''))}
            style={{ width: 52, pointerEvents: 'auto' }}
          />
        </div>
      ) : null}
    </div>
  );
}

function ProgressView({ cfg, percent, onPercent }: { cfg: PCfg; percent: number; onPercent?: (p: number) => void }) {
  if (cfg.ptype === 'circle' || cfg.ptype === 'dashboard') {
    // 'dashboard' = gauge (nửa vòng đồng hồ) của antd.
    return <CircleProgress cfg={cfg} percent={percent} onPercent={onPercent} />;
  }
  return <LineProgress cfg={cfg} percent={percent} onPercent={onPercent} />;
}

// readPretty của field SỐ + max để trống (auto): lấy max của cột (cache) rồi scale. Loading → tạm 100.
function ProgressAutoMax({ model, cfg, value }: { model: any; cfg: PCfg; value: any }) {
  const info = React.useMemo(() => resolveMaxCtx(model), [model]);
  const key = info ? maxKeyOf(info) : '';
  const [autoMax, setAutoMax] = React.useState<number | null>(() => {
    if (!key) return null;
    const c = maxCache.get(key);
    return c && c.ts != null && Date.now() - c.ts < MAX_TTL ? c.value ?? null : null;
  });
  React.useEffect(() => {
    if (!info || autoMax != null) return;
    let alive = true;
    getColumnMax(info).then((v) => { if (alive) setAutoMax(v); });
    return () => { alive = false; };
  }, [key]);
  return <ProgressView cfg={cfg} percent={computePercent(value, cfg, false, autoMax ?? undefined)} />;
}

// Editable: line = kéo/bấm; circle/gauge = InputNumber + hiển thị (khó kéo vòng tròn).
function ProgressEdit({
  cfg, value, onChange, disabled, isPercent,
}: {
  cfg: PCfg; value?: any; onChange?: (v: any) => void; disabled?: boolean; isPercent: boolean;
}) {
  const percent = computePercent(value, cfg, isPercent);
  // Kéo/bấm (line) hoặc nhập tâm (circle/gauge) đều trả % → quy về giá trị lưu (percent=phân số, number=÷max).
  const setFromPercent = (pct: number) => {
    const v = isPercent ? pct / 100 : (pct / 100) * (cfg.max || 100);
    onChange?.(isPercent ? Math.round(v * 10000) / 10000 : Math.round(v * 100) / 100);
  };
  return <ProgressView cfg={cfg} percent={percent} onPercent={disabled ? undefined : setFromPercent} />;
}

// ---- settings components (P_*) -----------------------------------------------------------------
const P_Seg = (props: any) => (
  <SegmentedGroup {...SEG_PROPS} value={props.value ?? props.defaultValue} onChange={(v: any) => props.onChange?.(v)} options={props.options || []} />
);
const P_Switch = (props: any) => <Switch checked={props.value !== false} onChange={(c: any) => props.onChange?.(c)} />;
const P_Num = (props: any) => (
  <InputNumber value={props.value} min={props.min ?? 1} max={props.max} onChange={(v: any) => props.onChange?.(v)} style={{ width: '100%' }} />
);
// Max input with an "auto" state: a value ≤ 0 renders empty (+ placeholder) → the column max is used.
const P_MaxNum = (props: any) => (
  <InputNumber
    value={typeof props.value === 'number' && props.value > 0 ? props.value : undefined}
    min={0}
    placeholder={props.placeholder || 'Auto'}
    onChange={(v: any) => props.onChange?.(typeof v === 'number' && v > 0 ? v : 0)}
    style={{ width: '100%' }}
  />
);
export function registerProgressFieldModel(deps: {
  flowEngine: any; flowSettings?: any; Base: any; tExpr?: (s: string, o?: any) => any;
}) {
  const { flowEngine, flowSettings, Base } = deps;
  if (!flowEngine || !Base) {
    // eslint-disable-next-line no-console
    console.warn('[field-enh] progress: missing flowEngine/Base — skip');
    return;
  }
  const t = (s: string) => (deps.tExpr ? deps.tExpr(s, { ns: 'field-enhancements' }) : s);

  if (flowSettings?.registerComponents) {
    try {
      // registerSettingsKit also registers the shared SettingsGrid + CollapsibleSection (house style).
      registerSettingsKit(flowSettings, { P_Grid: SettingsGrid, P_Seg, P_Switch, P_Color: ColorField, P_Num, P_MaxNum, P_Reset: ResetButton, P_Preview: ProgressPreview });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[field-enh] progress registerComponents failed', e);
    }
  }

  const isPercentField = (model: any) =>
    (model?.collectionField || model?.context?.collectionField)?.interface === 'percent';

  class PtdlProgressFieldModel extends Base {
    render() {
      const model: any = this;
      const p = model.props || {};
      const cfg = pcfgFromProps(p);
      const isPercent = isPercentField(model);
      if (p.pattern === 'readPretty') {
        // Field số + "Full value (100%)" bỏ trống (max ≤ 0) → scale theo max của cột (async, cache).
        if (!isPercent && !(cfg.max > 0)) {
          return <ProgressAutoMax model={model} cfg={cfg} value={p.value} />;
        }
        return <ProgressView cfg={cfg} percent={computePercent(p.value, cfg, isPercent)} />;
      }
      return <ProgressEdit cfg={cfg} value={p.value} onChange={(v: any) => p.onChange?.(v)} disabled={p.disabled} isPercent={isPercent} />;
    }
  }

  flowEngine.registerModels({ PtdlProgressFieldModel });
  try { (PtdlProgressFieldModel as any).define?.({ label: t('Progress bar') }); } catch (_) { /* optional */ }

  const progressFlow: any = {
      key: 'ptdlProgress',
      sort: 800,
      title: t('Progress bar'),
      steps: {
        settings: {
          title: t('Progress bar settings'),
          uiMode: { type: 'dialog', props: { width: 600 } },
          uiSchema: (ctx: any) => {
            const isPercent = (ctx?.model?.collectionField || ctx?.model?.context?.collectionField)?.interface === 'percent';
            return {
              ...globalToggleField(t),
              preview: {
                type: 'void', title: t('Preview'),
                'x-decorator': 'FormItem', 'x-decorator-props': { style: { marginBottom: 8 } },
                'x-component': 'P_Preview', 'x-component-props': { isPercent },
              },
              row1: {
                type: 'void', 'x-component': 'P_Grid',
                'x-component-props': { style: { gridTemplateColumns: '1fr 1fr auto', alignItems: 'end', gap: '0 12px' } },
                properties: {
                  ptype: fi(t('Type'), 'P_Seg', {
                    componentProps: { options: [
                      { label: t('Line'), value: 'line' },
                      { label: t('Circle'), value: 'circle' },
                      { label: t('Gauge'), value: 'dashboard' },
                    ] },
                  }),
                  colorMode: fi(t('Color mode'), 'P_Seg', {
                    componentProps: { options: [
                      { label: t('Mono'), value: 'mono' },
                      { label: t('Gradient'), value: 'gradient' },
                      { label: t('Threshold'), value: 'threshold' },
                    ] },
                  }),
                  reset: {
                    type: 'void', 'x-component': 'P_Reset', 'x-component-props': { defaults: P_DEFAULTS, label: t('Reset') },
                    'x-decorator': 'FormItem', 'x-decorator-props': { style: { marginBottom: 6, alignSelf: 'end' } },
                  },
                },
              },
              // Colour cluster (mono / gradient / threshold) — grouped in a collapsible section (house style).
              colours: {
                type: 'void', 'x-component': 'CollapsibleSection',
                'x-component-props': { title: t('Colors') },
                properties: {
                  // Mono → 1 màu.
                  color: fi(t('Color'), 'P_Color', { reactions: visibleWhen('colorMode', 'mono') }),
                  // Gradient → 2–3 màu (compact swatch strip). Mid tùy chọn: trống = gradient 2 màu.
                  gradientRow: {
                    ...colorStrip([
                      { key: 'colorFrom', title: t('Gradient from') },
                      { key: 'colorMid', title: t('Gradient mid'), tooltip: t('Optional — leave empty for a 2-colour gradient') },
                      { key: 'colorTo', title: t('Gradient to') },
                    ], { minColWidth: 90 }),
                    'x-reactions': visibleWhen('colorMode', 'gradient'),
                  },
                  // Threshold → 3 màu (compact swatch strip) + 2 ngưỡng (%).
                  thresholdRow: {
                    ...colorStrip([
                      { key: 'c1', title: t('Low color') },
                      { key: 'c2', title: t('Mid color') },
                      { key: 'c3', title: t('High color') },
                    ], { minColWidth: 90 }),
                    'x-reactions': visibleWhen('colorMode', 'threshold'),
                  },
                  thresholdBreaks: {
                    type: 'void', 'x-component': 'P_Grid', 'x-component-props': { minColWidth: 180 },
                    'x-reactions': visibleWhen('colorMode', 'threshold'),
                    properties: {
                      t1: fi(t('Low ≤ (%)'), 'P_Num', { type: 'number', componentProps: { min: 1, max: 99 } }),
                      t2: fi(t('Mid ≤ (%)'), 'P_Num', { type: 'number', componentProps: { min: 1, max: 99 } }),
                    },
                  },
                },
              },
              // Percent text — toggle + position/align (line only), grouped in a section.
              text: {
                type: 'void', 'x-component': 'CollapsibleSection',
                'x-component-props': { title: t('Percent text') },
                properties: {
                  showInfo: fi(t('Show percent text'), 'P_Switch', { type: 'boolean' }),
                  // Vị trí + căn text — chỉ áp dụng cho type Line (circle/gauge % nằm ở tâm).
                  textRow: {
                    type: 'void', 'x-component': 'P_Grid', 'x-component-props': { minColWidth: 180 },
                    'x-reactions': rx((v: any) => v.showInfo !== false && v.ptype === 'line'),
                    properties: {
                      textPos: fi(t('Text position'), 'P_Seg', {
                        componentProps: { options: [
                          { label: t('Top'), value: 'top' },
                          { label: t('Bottom'), value: 'bottom' },
                          { label: t('Inline'), value: 'inline' },
                        ] },
                      }),
                      textAlign: fi(t('Text align'), 'P_Seg', {
                        componentProps: { options: [
                          { label: t('Left'), value: 'left' },
                          { label: t('Right'), value: 'right' },
                        ] },
                      }),
                    },
                  },
                },
              },
              // 100% = giá trị đầy thanh (chỉ field số thường; percent auto 0–1). Trống = tự lấy max của cột.
              ...(isPercent ? {} : {
                max: fi(t('Full value (100%)'), 'P_MaxNum', {
                  type: 'number',
                  componentProps: { placeholder: t('Empty = column max') },
                  decoratorProps: { tooltip: t('Value shown as 100%. Leave empty to auto-use the largest value in the column.') },
                }),
              }),
            };
          },
          defaultParams: { ...P_DEFAULTS },
          handler(ctx: any, params: any) {
            const p = params || {};
            const props = {
              ptdlpType: p.ptype || 'line',
              ptdlpMax: typeof p.max === 'number' && p.max > 0 ? p.max : 0,
              ptdlpShowInfo: p.showInfo !== false,
              ptdlpTextPos: p.textPos || 'inline',
              ptdlpTextAlign: p.textAlign || 'right',
              ptdlpColorMode: p.colorMode || 'mono',
              ptdlpColor: p.color || '',
              ptdlpColorFrom: p.colorFrom || '#1677ff',
              ptdlpColorMid: p.colorMid || '',
              ptdlpColorTo: p.colorTo || '#52c41a',
              ptdlpT1: typeof p.t1 === 'number' ? p.t1 : 33,
              ptdlpC1: p.c1 || '#ff4d4f',
              ptdlpT2: typeof p.t2 === 'number' ? p.t2 : 66,
              ptdlpC2: p.c2 || '#faad14',
              ptdlpC3: p.c3 || '#52c41a',
            };
            ctx.model.setProps(props);
            saveWidgetGlobal(ctx, params, 'PtdlProgressFieldModel', props);
          },
        },
      },
  };
  try {
    (PtdlProgressFieldModel as any).registerFlow(progressFlow);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[field-enh] progress registerFlow failed', e);
  }

  const binder =
    (EditableItemModel && typeof (EditableItemModel as any).bindModelToInterface === 'function' && EditableItemModel) ||
    [PtdlProgressFieldModel, Base].find((c: any) => c && typeof c.bindModelToInterface === 'function');
  try {
    (binder as any)?.bindModelToInterface('PtdlProgressFieldModel', ['number', 'integer', 'percent'], { isDefault: false });
    if (!binder) console.warn('[field-enh] progress: no binder found');
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[field-enh] progress bind failed', e);
  }

  // Display variant (detail/table/list) — chỉ thanh, không tương tác.
  bindDisplayField({
    flowEngine, Base, name: 'PtdlProgressDisplayFieldModel', interfaces: ['number', 'integer', 'percent'],
    label: t('Progress bar'), flow: { ...progressFlow, key: 'ptdlProgressDisplay' },
    render: (p: any, model: any) => {
      const cfg = pcfgFromProps(p);
      const isPercent = (model?.collectionField || model?.context?.collectionField)?.interface === 'percent';
      return <ProgressView cfg={cfg} percent={computePercent(p.value, cfg, isPercent)} />;
    },
  });

  return PtdlProgressFieldModel;
}

const ProgressPreview: any = observer((props: any) => {
  const form: any = useForm();
  const cfg = pcfgFromForm(form?.values || {});
  const sampleValue = props.isPercent ? 0.65 : (cfg.max || 100) * 0.65;
  const percent = computePercent(sampleValue, cfg, !!props.isPercent);
  return (
    <div style={{ padding: '12px', background: 'var(--colorFillQuaternary, #fafafa)', borderRadius: 6, border: '1px dashed #d9d9d9' }}>
      <ProgressView cfg={cfg} percent={percent} />
    </div>
  );
});

// Bridge cho @tuanla90/plugin-spreadsheet-view dùng view component làm cell widget (không FlowModel per cell).
(globalThis as any).__ptdlFieldEnh = { ...((globalThis as any).__ptdlFieldEnh || {}), LineProgress, computePercent, P_DEFAULTS };
