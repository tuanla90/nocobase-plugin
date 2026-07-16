import React from 'react';
import dayjs from 'dayjs';
import { Slider, Tooltip } from 'antd';
import { observer, useForm } from '@formily/react';
import { SegmentedGroup, ColumnSelect, ColorField, SettingsGrid, ResetButton, CollapsibleSection, fieldItem as fi, rx } from '@ptdl/shared';

/**
 * "Relative date" display widget (field-enhancements).
 * Per-field DISPLAY component for date/time columns: renders a date as its distance from a reference —
 * TODAY by default ("Today" · "Yesterday" · "3 days ago" · "in 5 days"), or from ANOTHER date column of
 * the same record ("3 days after" · "same day"). Opt-in Field component (isDefault:false) — the core
 * absolute-date display stays the default.
 *
 * Modes (Format): Auto (collapses ±1 to Yesterday/Tomorrow) · Smart (coarse units: weeks/months/years for
 * far dates) · Days (always in days) · Number (signed integer). Colours by sign/threshold: overdue (past)
 * · due-soon (≤ N days ahead) · today · future. Optional real-date tooltip/suffix.
 *
 * Calendar-day difference (both sides floored to LOCAL midnight) so "today" is 0 regardless of the time
 * part / timezone. dayjs is the same parser core uses (DisplayDateTimeFieldModel) → every date interface
 * parses identically. Cell strings render in React (not schema) so they're localised at runtime via the
 * host i18n with {{count}} interpolation; vi-VN ships with the plugin.
 */

export const REL_DATE_NS = 'field-enhancements';

// --- runtime translator (cell strings render in React, outside the schema compile) --------------
let RT_I18N: any = null;
export function setRelativeDateI18n(i18n: any) { if (i18n) RT_I18N = i18n; }
function RT(key: string, opts?: any): string {
  const i18n = RT_I18N || (globalThis as any)?.window?.__nocobase_i18n__;
  try {
    if (i18n?.t) return i18n.t(key, { ns: REL_DATE_NS, ...(opts || {}) });
  } catch (_) { /* fall through — key IS the English phrase */ }
  let s = key;
  if (opts && typeof opts.count === 'number') s = s.replace('{{count}}', String(opts.count));
  return s;
}

// --- config ------------------------------------------------------------------------------------
const RD_DEFAULTS = {
  format: 'auto' as 'auto' | 'smart' | 'days' | 'number',
  refMode: 'today' as 'today' | 'field',
  refField: '',
  pastColor: '#ff4d4f', warnColor: '#faad14', warnDays: 3, todayColor: '', futureColor: '',
  showAbs: 'tooltip' as 'off' | 'tooltip' | 'suffix',
  absFormat: 'DD/MM/YYYY',
};
type RdCfg = typeof RD_DEFAULTS;

function cfgFromProps(p: any): RdCfg {
  return {
    format: p.ptdlrdFormat || 'auto',
    refMode: p.ptdlrdRefMode || 'today', refField: p.ptdlrdRefField || '',
    pastColor: p.ptdlrdPastColor ?? '#ff4d4f', warnColor: p.ptdlrdWarnColor ?? '#faad14',
    warnDays: typeof p.ptdlrdWarnDays === 'number' ? p.ptdlrdWarnDays : 3,
    todayColor: p.ptdlrdTodayColor || '', futureColor: p.ptdlrdFutureColor || '',
    showAbs: p.ptdlrdShowAbs || 'tooltip', absFormat: p.ptdlrdAbsFormat || 'DD/MM/YYYY',
  };
}
function cfgFromForm(v: any): RdCfg {
  return {
    format: v?.format || 'auto',
    refMode: v?.refMode || 'today', refField: v?.refField || '',
    pastColor: v?.pastColor ?? '#ff4d4f', warnColor: v?.warnColor ?? '#faad14',
    warnDays: typeof v?.warnDays === 'number' ? v.warnDays : 3,
    todayColor: v?.todayColor || '', futureColor: v?.futureColor || '',
    showAbs: v?.showAbs || 'tooltip', absFormat: v?.absFormat || 'DD/MM/YYYY',
  };
}

// signed calendar-day difference of `value` from the reference (today, or `refValue`). +future / -past.
function diffDays(value: any, refValue: any): number | null {
  const a = dayjs(value);
  if (!a.isValid()) return null;
  const base = refValue != null && refValue !== '' ? dayjs(refValue) : dayjs();
  if (!base.isValid()) return null;
  return a.startOf('day').diff(base.startOf('day'), 'day');
}
// coarse unit reducer for Smart mode.
function reduceUnit(absDays: number): { n: number; unit: string } {
  if (absDays < 7) return { n: absDays, unit: 'day' };
  if (absDays < 30) return { n: Math.round(absDays / 7), unit: 'week' };
  if (absDays < 365) return { n: Math.round(absDays / 30), unit: 'month' };
  return { n: Math.round(absDays / 365), unit: 'year' };
}
// distance from TODAY → phrase.
function todayLabel(diff: number, format: RdCfg['format']): string {
  if (format === 'number') return diff > 0 ? `+${diff}` : String(diff);
  if (diff === 0) return RT('Today');
  if (format !== 'days') {
    if (diff === -1) return RT('Yesterday');
    if (diff === 1) return RT('Tomorrow');
  }
  const past = diff < 0;
  const abs = Math.abs(diff);
  if (format === 'smart') {
    const { n, unit } = reduceUnit(abs);
    return RT(past ? `{{count}} ${unit}s ago` : `in {{count}} ${unit}s`, { count: n });
  }
  return past ? RT('{{count}} days ago', { count: abs }) : RT('in {{count}} days', { count: abs });
}
// distance from ANOTHER date column → phrase (days only; +after / -before the reference).
function fieldLabel(diff: number, format: RdCfg['format']): string {
  if (format === 'number') return diff > 0 ? `+${diff}` : String(diff);
  if (diff === 0) return RT('Same day');
  const abs = Math.abs(diff);
  return diff > 0 ? RT('{{count}} days after', { count: abs }) : RT('{{count}} days before', { count: abs });
}
function colorFor(diff: number, cfg: RdCfg): string | undefined {
  if (diff < 0) return cfg.pastColor || undefined;
  if (diff === 0) return cfg.todayColor || (cfg.warnDays > 0 ? cfg.warnColor : '') || undefined;
  if (cfg.warnDays > 0 && diff <= cfg.warnDays) return cfg.warnColor || undefined;
  return cfg.futureColor || undefined;
}

// Shared cell renderer — live cell AND settings preview.
function RelDateView({ value, refValue, cfg }: { value: any; refValue?: any; cfg: RdCfg }) {
  const diff = diffDays(value, cfg.refMode === 'field' ? refValue : null);
  if (diff == null) return null;
  const label = cfg.refMode === 'field' ? fieldLabel(diff, cfg.format) : todayLabel(diff, cfg.format);
  const color = colorFor(diff, cfg);
  const absStr = dayjs(value).format(cfg.absFormat || 'DD/MM/YYYY');
  const node = (
    <span style={{ color, whiteSpace: 'nowrap' }}>
      {label}
      {cfg.showAbs === 'suffix' ? <span style={{ color: '#8c8c8c', marginLeft: 6 }}>({absStr})</span> : null}
    </span>
  );
  if (cfg.showAbs === 'tooltip') return <Tooltip title={absStr}>{node}</Tooltip>;
  return node;
}

// --- settings components -----------------------------------------------------------------------
const RD_Seg = (props: any) => (
  <SegmentedGroup value={props.value ?? props.defaultValue} onChange={(v: any) => props.onChange?.(v)} options={props.options || []} />
);
const RD_FieldSelect = (props: any) => (
  <ColumnSelect
    value={props.value || undefined} onChange={(v: any) => props.onChange?.(v)} options={props.options || []}
    placeholder={props.placeholder}
  />
);
const RD_WarnSlider = (props: any) => {
  const v = typeof props.value === 'number' ? props.value : 3;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 180 }}>
      <Slider min={0} max={14} value={v} onChange={(n: any) => props.onChange?.(n)} style={{ flex: 1 }} />
      <span style={{ width: 52, textAlign: 'right', color: '#888', fontVariantNumeric: 'tabular-nums' }}>
        {v <= 0 ? RT('Off') : `${v}d`}
      </span>
    </div>
  );
};

const RD_Preview: any = observer(() => {
  const form: any = useForm();
  const cfg = cfgFromForm(form?.values || {});
  const now = dayjs();
  const field = cfg.refMode === 'field';
  const ref = field ? now.toISOString() : null;
  const samples = [
    { k: '−3', v: now.subtract(3, 'day') },
    { k: '−1', v: now.subtract(1, 'day') },
    { k: '0', v: now },
    { k: '+1', v: now.add(1, 'day') },
    { k: '+5', v: now.add(5, 'day') },
  ];
  return (
    <div style={{ padding: '10px 12px', background: 'var(--colorFillQuaternary, #fafafa)', borderRadius: 6, border: '1px dashed #d9d9d9', display: 'flex', gap: 18, flexWrap: 'wrap', justifyContent: 'center' }}>
      {samples.map((s) => (
        <span key={s.k} style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 3, fontSize: 13 }}>
          <RelDateView value={s.v.toISOString()} refValue={ref} cfg={cfg} />
          <span style={{ color: '#bbb', fontVariantNumeric: 'tabular-nums', fontSize: 11 }}>{s.k}</span>
        </span>
      ))}
    </div>
  );
});

export function registerRelativeDateModel(deps: {
  flowEngine: any; flowSettings?: any; Base: any; CollectionFieldModel?: any;
  tExpr?: (s: string, o?: any) => any; i18n?: any;
}) {
  const { flowEngine, flowSettings, Base, CollectionFieldModel } = deps;
  if (!flowEngine || !Base) {
    // eslint-disable-next-line no-console
    console.warn('[field-enh] relative-date: missing flowEngine/Base — skip');
    return;
  }
  if (deps.i18n) setRelativeDateI18n(deps.i18n);
  const t = (s: string) => (deps.tExpr ? deps.tExpr(s, { ns: REL_DATE_NS }) : s);

  if (flowSettings?.registerComponents) {
    try {
      flowSettings.registerComponents({
        RD_Grid: SettingsGrid, RD_Section: CollapsibleSection, RD_Seg, RD_Color: ColorField,
        RD_FieldSelect, RD_WarnSlider, RD_Reset: ResetButton, RD_Preview,
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[field-enh] relative-date registerComponents failed', e);
    }
  }

  class PtdlRelativeDateFieldModel extends Base {
    renderComponent(value: any, wrap: any) {
      const p: any = (this as any).props || {};
      if (value == null || value === '') return super.renderComponent?.(value, wrap) ?? null;
      const cfg = cfgFromProps(p);
      let refValue: any = null;
      if (cfg.refMode === 'field' && cfg.refField) {
        const model: any = this;
        const rec = model?.context?.record || {};
        const fv = model?.context?.form?.getFieldValue?.(cfg.refField);
        refValue = fv ?? rec[cfg.refField];
      }
      const diff = diffDays(value, cfg.refMode === 'field' ? refValue : null);
      if (diff == null) return super.renderComponent?.(value, wrap) ?? String(value);
      return <RelDateView value={value} refValue={refValue} cfg={cfg} />;
    }
  }

  flowEngine.registerModels({ PtdlRelativeDateFieldModel });
  try { (PtdlRelativeDateFieldModel as any).define?.({ label: t('Relative date') }); } catch (_) { /* optional */ }

  try {
    (PtdlRelativeDateFieldModel as any).registerFlow({
      key: 'ptdlRelativeDate',
      sort: 502, // right after "Value tag" (501), near the core Field-component group (500)
      title: t('Relative date'),
      steps: {
        settings: {
          title: t('Relative date settings'),
          uiMode: { type: 'dialog', props: { width: 580 } },
          uiSchema: (ctx: any) => {
            const coll = ctx?.model?.collection || ctx?.model?.context?.collection || ctx?.model?.context?.collectionField?.collection;
            const selfName = ctx?.model?.collectionField?.name;
            const DATE_IFACES = new Set(['date', 'dateOnly', 'datetime', 'datetimeNoTz', 'unixTimestamp', 'createdAt', 'updatedAt']);
            let dateFieldOptions: any[] = [];
            try {
              const fields = coll?.getFields?.() || [];
              dateFieldOptions = fields
                .filter((f: any) => f?.name && f.name !== selfName && DATE_IFACES.has(f.interface))
                .map((f: any) => ({ label: f.title || f.name, value: f.name, type: f.type, iface: f.interface }));
            } catch (_) { /* ignore */ }
            return {
              preview: {
                type: 'void', title: t('Preview'),
                'x-decorator': 'FormItem', 'x-decorator-props': { style: { marginBottom: 8 } },
                'x-component': 'RD_Preview',
              },
              top: {
                type: 'void', 'x-component': 'RD_Grid',
                'x-component-props': { style: { gridTemplateColumns: '1fr auto', alignItems: 'end', gap: '0 12px' } },
                properties: {
                  format: fi(t('Format'), 'RD_Seg', {
                    componentProps: { options: [
                      { label: t('Auto'), value: 'auto' },
                      { label: t('Smart'), value: 'smart' },
                      { label: t('Days'), value: 'days' },
                      { label: t('Number'), value: 'number' },
                    ] },
                  }),
                  reset: {
                    type: 'void', 'x-component': 'RD_Reset',
                    'x-component-props': { defaults: RD_DEFAULTS, label: t('Reset') },
                    'x-decorator': 'FormItem', 'x-decorator-props': { style: { marginBottom: 6, alignSelf: 'end' } },
                  },
                },
              },
              reference: {
                type: 'void', 'x-component': 'RD_Section', 'x-component-props': { title: t('Reference'), defaultOpen: false },
                properties: {
                  refGrid: {
                    type: 'void', 'x-component': 'RD_Grid',
                    'x-component-props': { style: { gridTemplateColumns: '1fr 1fr', gap: '0 12px' } },
                    properties: {
                      refMode: fi(t('Compare with'), 'RD_Seg', {
                        componentProps: { options: [
                          { label: t('Today'), value: 'today' },
                          { label: t('Another column'), value: 'field' },
                        ] },
                      }),
                      refField: fi(t('Date column'), 'RD_FieldSelect', {
                        componentProps: { options: dateFieldOptions, placeholder: t('Select a date column') },
                        reactions: rx((v: any) => v.refMode === 'field'),
                      }),
                    },
                  },
                },
              },
              colors: {
                type: 'void', 'x-component': 'RD_Section', 'x-component-props': { title: t('Colors'), defaultOpen: true },
                properties: {
                  cGrid: {
                    type: 'void', 'x-component': 'RD_Grid',
                    'x-component-props': { style: { gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '0 12px' } },
                    properties: {
                      pastColor: fi(t('Overdue'), 'RD_Color'),
                      warnColor: fi(t('Due soon'), 'RD_Color'),
                      todayColor: fi(t('Today'), 'RD_Color'),
                      futureColor: fi(t('Future'), 'RD_Color'),
                    },
                  },
                  wGrid: {
                    type: 'void', 'x-component': 'RD_Grid',
                    'x-component-props': { style: { gridTemplateColumns: '1fr' } },
                    properties: {
                      warnDays: fi(t('Due-soon threshold (days, 0 = off)'), 'RD_WarnSlider', { type: 'number' }),
                    },
                  },
                },
              },
              realdate: {
                type: 'void', 'x-component': 'RD_Section', 'x-component-props': { title: t('Real date'), defaultOpen: false },
                properties: {
                  rGrid: {
                    type: 'void', 'x-component': 'RD_Grid',
                    'x-component-props': { style: { gridTemplateColumns: '1fr 1fr', gap: '0 12px' } },
                    properties: {
                      showAbs: fi(t('Show real date'), 'RD_Seg', {
                        componentProps: { options: [
                          { label: t('Off'), value: 'off' },
                          { label: t('Tooltip'), value: 'tooltip' },
                          { label: t('Suffix'), value: 'suffix' },
                        ] },
                      }),
                      absFormat: fi(t('Date format'), 'Input', {
                        componentProps: { placeholder: 'DD/MM/YYYY', style: { width: '100%' } },
                        reactions: rx((v: any) => v.showAbs && v.showAbs !== 'off'),
                      }),
                    },
                  },
                },
              },
            };
          },
          defaultParams: { ...RD_DEFAULTS },
          handler(ctx: any, params: any) {
            const p = params || {};
            ctx.model.setProps({
              ptdlrdFormat: p.format || 'auto',
              ptdlrdRefMode: p.refMode || 'today',
              ptdlrdRefField: p.refField || '',
              ptdlrdPastColor: p.pastColor ?? '',
              ptdlrdWarnColor: p.warnColor ?? '',
              ptdlrdWarnDays: typeof p.warnDays === 'number' ? p.warnDays : 3,
              ptdlrdTodayColor: p.todayColor || '',
              ptdlrdFutureColor: p.futureColor || '',
              ptdlrdShowAbs: p.showAbs || 'tooltip',
              ptdlrdAbsFormat: p.absFormat || 'DD/MM/YYYY',
            });
          },
        },
      },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[field-enh] relative-date registerFlow failed', e);
  }

  // Bind to every date/time interface as an OPT-IN Field component (isDefault:false → core default stays).
  const interfaces = ['date', 'dateOnly', 'datetime', 'datetimeNoTz', 'unixTimestamp', 'createdAt', 'updatedAt'];
  const binder = [PtdlRelativeDateFieldModel, Base, CollectionFieldModel].find(
    (c: any) => c && typeof c.bindModelToInterface === 'function',
  );
  try {
    (binder as any)?.bindModelToInterface('PtdlRelativeDateFieldModel', interfaces, { isDefault: false });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[field-enh] relative-date bind failed', e);
  }

  return PtdlRelativeDateFieldModel;
}
