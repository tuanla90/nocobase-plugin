import React from 'react';
import { PreviewBox } from './previewBox';
import { Switch, Slider, message } from 'antd';
import { EditableItemModel } from '@nocobase/flow-engine';
import { observer, useForm } from '@formily/react';
import { SegmentedGroup, colorToString, ColorField, SettingsGrid, ResetButton, CollapsibleSection, fieldItem as fi, rx, SEG_PROPS, registerFlowComponentsOnce } from '@tuanla90/shared';

/**
 * "Colour chip" display widget (field-enhancements) — for `color` fields.
 * Core stores a hex string ("#1677ff"); this renders it as a swatch instead of raw text: dot / chip (swatch +
 * hex) / pill (filled, contrast-aware text) / bar. Optional hex label + click-to-copy. Opt-in (isDefault:false).
 */

export const CLR_NS = 'field-enhancements';
let CLR_I18N: any = null;
export function setColorFieldI18n(i18n: any) { if (i18n) CLR_I18N = i18n; }
function T(key: string): string {
  const i18n = CLR_I18N || (globalThis as any)?.window?.__nocobase_i18n__;
  try { if (i18n?.t) return i18n.t(key, { ns: CLR_NS }); } catch (_) { /* fall through */ }
  return key;
}

const CLR_DEFAULTS = { style: 'chip' as 'dot' | 'chip' | 'pill' | 'bar', text: 'hex' as 'none' | 'hex', size: 16, copy: true };
type ClrCfg = typeof CLR_DEFAULTS;
function clrFromProps(p: any): ClrCfg {
  return {
    style: p.ptdlclStyle || 'chip', text: p.ptdlclText || 'hex',
    size: typeof p.ptdlclSize === 'number' ? p.ptdlclSize : 16, copy: p.ptdlclCopy !== false,
  };
}
function clrFromForm(v: any): ClrCfg {
  return {
    style: v?.style || 'chip', text: v?.text || 'hex',
    size: typeof v?.size === 'number' ? v.size : 16, copy: v?.copy !== false,
  };
}

function toHex(value: any): string {
  if (value == null || value === '') return '';
  const s = typeof value === 'string' ? value : colorToString(value) || '';
  return String(s).trim();
}
// readable text colour over a solid fill (luminance threshold).
function readableOn(hex: string): string {
  const h = hex.replace('#', '');
  if (h.length < 6) return 'rgba(0,0,0,0.88)';
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? 'rgba(0,0,0,0.88)' : '#fff';
}

function copyText(txt: string) {
  try {
    navigator?.clipboard?.writeText?.(txt);
    try { message.success(T('Copied')); } catch (_) { /* message optional */ }
  } catch (_) { /* clipboard unavailable */ }
}

function ColorView({ value, cfg }: { value: any; cfg: ClrCfg }) {
  const hex = toHex(value);
  if (!hex) return <span style={{ color: '#bfbfbf' }}>-</span>;
  const sz = cfg.size || 16;
  const onClick = cfg.copy ? (e: any) => { e.stopPropagation(); copyText(hex); } : undefined;
  const cursor = cfg.copy ? 'pointer' : 'default';
  const label = cfg.text === 'hex' ? <span style={{ fontVariantNumeric: 'tabular-nums' }}>{hex}</span> : null;
  const title = cfg.copy ? `${hex} — ${T('Click to copy')}` : hex;

  if (cfg.style === 'pill') {
    return (
      <span onClick={onClick} title={title}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor, background: hex, color: readableOn(hex),
          borderRadius: 999, padding: '1px 10px', lineHeight: 1.7, border: '1px solid rgba(0,0,0,0.08)' }}>
        {cfg.text === 'hex' ? hex : '  '}
      </span>
    );
  }
  const swatch =
    cfg.style === 'bar'
      ? <span style={{ display: 'inline-block', width: Math.max(sz * 2, 28), height: sz, background: hex, borderRadius: 3, border: '1px solid rgba(0,0,0,0.12)' }} />
      : <span style={{ display: 'inline-block', width: sz, height: sz, background: hex,
          borderRadius: cfg.style === 'dot' ? '50%' : 4, border: '1px solid rgba(0,0,0,0.15)' }} />;
  return (
    <span onClick={onClick} title={title} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor }}>
      {swatch}{label}
    </span>
  );
}

const CLR_Seg = (props: any) => (
  <SegmentedGroup {...SEG_PROPS} value={props.value ?? props.defaultValue} onChange={(v: any) => props.onChange?.(v)} options={props.options || []} />
);
const CLR_Switch = (props: any) => <Switch checked={!!props.value} onChange={(c: any) => props.onChange?.(c)} />;
const CLR_Slider = (props: any) => {
  const v = typeof props.value === 'number' ? props.value : 16;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 150 }}>
      <Slider min={10} max={28} value={v} onChange={(n: any) => props.onChange?.(n)} style={{ flex: 1 }} />
      <span style={{ width: 34, textAlign: 'right', color: '#888' }}>{v}px</span>
    </div>
  );
};
const CLR_Preview: any = observer(() => {
  const form: any = useForm();
  const cfg = clrFromForm(form?.values || {});
  const samples = ['#1677ff', '#52c41a', '#faad14', '#f5222d'];
  return (
    <PreviewBox style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
      {samples.map((h) => <ColorView key={h} value={h} cfg={cfg} />)}
    </PreviewBox>
  );
});

export function registerColorFieldModel(deps: {
  flowEngine: any; flowSettings?: any; Base: any; EditBase?: any; CollectionFieldModel?: any;
  tExpr?: (s: string, o?: any) => any; i18n?: any;
}) {
  const { flowEngine, flowSettings, Base, EditBase, CollectionFieldModel } = deps;
  if (!flowEngine || !Base) { console.warn('[field-enh] color: missing flowEngine/Base — skip'); return; }
  if (deps.i18n) setColorFieldI18n(deps.i18n);
  const t = (s: string) => (deps.tExpr ? deps.tExpr(s, { ns: CLR_NS }) : s);

  if (flowSettings?.registerComponents) {
    try {
      registerFlowComponentsOnce(flowSettings, { CLR_Grid: SettingsGrid, CLR_Section: CollapsibleSection, CLR_Seg, CLR_Switch, CLR_Slider, CLR_Reset: ResetButton, CLR_Preview });
    } catch (e) { console.warn('[field-enh] color registerComponents failed', e); }
  }

  class PtdlColorFieldModel extends Base {
    renderComponent(value: any, wrap: any) {
      const p: any = (this as any).props || {};
      if (value == null || value === '') return super.renderComponent?.(value, wrap) ?? null;
      return <ColorView value={value} cfg={clrFromProps(p)} />;
    }
  }
  flowEngine.registerModels({ PtdlColorFieldModel });
  try { (PtdlColorFieldModel as any).define?.({ label: t('Colour chip') }); } catch (_) { /* optional */ }

  try {
    (PtdlColorFieldModel as any).registerFlow({
      key: 'ptdlColorChip', sort: 503, title: t('Colour chip'),
      steps: {
        settings: {
          title: t('Colour chip settings'),
          uiMode: { type: 'dialog', props: { width: 520 } },
          uiSchema: () => ({
            preview: { type: 'void', title: t('Preview'), 'x-decorator': 'FormItem', 'x-decorator-props': { style: { marginBottom: 8 } }, 'x-component': 'CLR_Preview' },
            row1: {
              type: 'void', 'x-component': 'CLR_Grid',
              'x-component-props': { style: { gridTemplateColumns: '1fr auto', alignItems: 'end', gap: '0 12px' } },
              properties: {
                style: fi(t('Style'), 'CLR_Seg', { componentProps: { options: [
                  { label: t('Dot'), value: 'dot' }, { label: t('Chip'), value: 'chip' }, { label: t('Pill'), value: 'pill' }, { label: t('Bar'), value: 'bar' },
                ] } }),
                reset: { type: 'void', 'x-component': 'CLR_Reset', 'x-component-props': { defaults: CLR_DEFAULTS, label: t('Reset') }, 'x-decorator': 'FormItem', 'x-decorator-props': { style: { marginBottom: 6, alignSelf: 'end' } } },
              },
            },
            row2: {
              type: 'void', 'x-component': 'CLR_Grid',
              'x-component-props': { style: { gridTemplateColumns: '1fr 1fr 1fr', gap: '0 12px', alignItems: 'end' } },
              properties: {
                text: fi(t('Show text'), 'CLR_Seg', { componentProps: { options: [{ label: t('None'), value: 'none' }, { label: t('Hex'), value: 'hex' }] } }),
                size: fi(t('Size'), 'CLR_Slider', { type: 'number', reactions: rx((v: any) => v.style !== 'pill') }),
                copy: fi(t('Click to copy'), 'CLR_Switch', { type: 'boolean' }),
              },
            },
          }),
          defaultParams: { ...CLR_DEFAULTS },
          handler(ctx: any, params: any) {
            const p = params || {};
            ctx.model.setProps({
              ptdlclStyle: p.style || 'chip', ptdlclText: p.text || 'hex',
              ptdlclSize: typeof p.size === 'number' ? p.size : 16, ptdlclCopy: p.copy !== false,
            });
          },
        },
      },
    });
  } catch (e) { console.warn('[field-enh] color registerFlow failed', e); }

  const binder = [PtdlColorFieldModel, Base, CollectionFieldModel].find((c: any) => c && typeof c.bindModelToInterface === 'function');
  // isDefault:false → OPT-IN. The core NocoBase `color` display stays the default, so a plain color field
  // never depends on this plugin being installed (no "Model class not found" if it's absent). Users pick the
  // Colour-chip display per column when they want it (or turn it on globally via the advanced-field config).
  try { (binder as any)?.bindModelToInterface('PtdlColorFieldModel', ['color'], { isDefault: false }); }
  catch (e) { console.warn('[field-enh] color bind failed', e); }

  // EDITABLE variant — swap the core antd ColorPicker (antd default presets) for our ColorField, so the
  // input palette matches the library's 16-colour COLOR_PRESETS and the Colour-chip display. Opt-in.
  if (EditBase) {
    class PtdlColorInputFieldModel extends EditBase {
      render() {
        const model: any = this;
        const p = model.props || {};
        if (p.pattern === 'readPretty') return <ColorView value={p.value} cfg={{ ...CLR_DEFAULTS }} />;
        return <ColorField size="middle" value={p.value || undefined} onChange={(v: any) => p.onChange?.(v)} disabled={p.disabled} emptyValue="" />;
      }
    }
    flowEngine.registerModels({ PtdlColorInputFieldModel });
    try { (PtdlColorInputFieldModel as any).define?.({ label: t('Colour picker') }); } catch (_) { /* optional */ }
    const eb = [EditableItemModel, PtdlColorInputFieldModel, EditBase].find((c: any) => c && typeof c.bindModelToInterface === 'function');
    // isDefault:false → OPT-IN. The core antd ColorPicker stays the default editor, so a plain color field
    // stays on NocoBase's basic config and is safe when this plugin isn't installed. Users switch to our
    // ColorField (library COLOR_PRESETS) per field, or enable it globally via the advanced-field config.
    try { (eb as any)?.bindModelToInterface('PtdlColorInputFieldModel', ['color'], { isDefault: false }); }
    catch (e) { console.warn('[field-enh] color-input bind failed', e); }
  }

  return PtdlColorFieldModel;
}
