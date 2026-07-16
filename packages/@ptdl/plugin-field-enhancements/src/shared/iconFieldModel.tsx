import React from 'react';
import { Switch, Slider } from 'antd';
import { EditableItemModel } from '@nocobase/flow-engine';
import { observer, useForm } from '@formily/react';
import { SegmentedGroup, ColorField, IconByKey, RegistryIconPicker, SettingsGrid, ResetButton, CollapsibleSection, fieldItem as fi, rx, SEG_PROPS } from '@ptdl/shared';

/**
 * "Icon glyph" display widget (field-enhancements) — for `icon` fields.
 * Core stores an icon NAME; this renders the actual glyph (via the shared icon registry — full Lucide set when
 * @ptdl/plugin-custom-icons is installed) with colour / size / optional background shape / optional name label.
 * Opt-in (isDefault:false).
 */

export const ICO_NS = 'field-enhancements';

const ICO_DEFAULTS = {
  size: 18, color: '', bg: 'none' as 'none' | 'circle' | 'square', bgColor: '', label: false,
};
type IcoCfg = typeof ICO_DEFAULTS;
function icoFromProps(p: any): IcoCfg {
  return {
    size: typeof p.ptdliSize === 'number' ? p.ptdliSize : 18, color: p.ptdliColor || '',
    bg: p.ptdliBg || 'none', bgColor: p.ptdliBgColor || '', label: !!p.ptdliLabel,
  };
}
function icoFromForm(v: any): IcoCfg {
  return {
    size: typeof v?.size === 'number' ? v.size : 18, color: v?.color || '',
    bg: v?.bg || 'none', bgColor: v?.bgColor || '', label: !!v?.label,
  };
}

function IconView({ value, cfg }: { value: any; cfg: IcoCfg }) {
  const name = value == null ? '' : String(value);
  if (!name) return <span style={{ color: '#bfbfbf' }}>-</span>;
  const sz = cfg.size || 18;
  const glyph = (
    <span style={{ display: 'inline-flex', lineHeight: 0, color: cfg.color || 'currentColor', fontSize: sz }}>
      <IconByKey type={name} />
    </span>
  );
  const boxed = cfg.bg !== 'none';
  const iconNode = boxed ? (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: sz + 10, height: sz + 10, borderRadius: cfg.bg === 'circle' ? '50%' : 6,
      background: cfg.bgColor || 'var(--colorFillSecondary, rgba(0,0,0,.06))',
    }}>{glyph}</span>
  ) : glyph;
  if (!cfg.label) return iconNode;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {iconNode}<span style={{ color: 'var(--colorTextSecondary, #8c8c8c)' }}>{name}</span>
    </span>
  );
}

const ICO_Seg = (props: any) => (
  <SegmentedGroup {...SEG_PROPS} value={props.value ?? props.defaultValue} onChange={(v: any) => props.onChange?.(v)} options={props.options || []} />
);
const ICO_Switch = (props: any) => <Switch checked={!!props.value} onChange={(c: any) => props.onChange?.(c)} />;
const ICO_Slider = (props: any) => {
  const v = typeof props.value === 'number' ? props.value : 18;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 150 }}>
      <Slider min={12} max={40} value={v} onChange={(n: any) => props.onChange?.(n)} style={{ flex: 1 }} />
      <span style={{ width: 34, textAlign: 'right', color: '#888' }}>{v}px</span>
    </div>
  );
};
const ICO_Preview: any = observer(() => {
  const form: any = useForm();
  const cfg = icoFromForm(form?.values || {});
  const samples = ['lucide-star', 'lucide-heart', 'lucide-check-circle', 'lucide-flag'];
  return (
    <div style={{ padding: '10px 12px', background: 'var(--colorFillQuaternary, #fafafa)', borderRadius: 6, border: '1px dashed #d9d9d9', display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
      {samples.map((n) => <IconView key={n} value={n} cfg={cfg} />)}
    </div>
  );
});

export function registerIconFieldModel(deps: {
  flowEngine: any; flowSettings?: any; Base: any; EditBase?: any; CollectionFieldModel?: any;
  tExpr?: (s: string, o?: any) => any; i18n?: any;
}) {
  const { flowEngine, flowSettings, Base, EditBase, CollectionFieldModel } = deps;
  if (!flowEngine || !Base) { console.warn('[field-enh] icon: missing flowEngine/Base — skip'); return; }
  const t = (s: string) => (deps.tExpr ? deps.tExpr(s, { ns: ICO_NS }) : s);

  if (flowSettings?.registerComponents) {
    try {
      flowSettings.registerComponents({ ICO_Grid: SettingsGrid, ICO_Section: CollapsibleSection, ICO_Seg, ICO_Switch, ICO_Slider, ICO_Color: ColorField, ICO_Reset: ResetButton, ICO_Preview });
    } catch (e) { console.warn('[field-enh] icon registerComponents failed', e); }
  }

  class PtdlIconGlyphFieldModel extends Base {
    renderComponent(value: any, wrap: any) {
      const p: any = (this as any).props || {};
      if (value == null || value === '') return super.renderComponent?.(value, wrap) ?? null;
      return <IconView value={value} cfg={icoFromProps(p)} />;
    }
  }
  flowEngine.registerModels({ PtdlIconGlyphFieldModel });
  try { (PtdlIconGlyphFieldModel as any).define?.({ label: t('Icon glyph') }); } catch (_) { /* optional */ }

  try {
    (PtdlIconGlyphFieldModel as any).registerFlow({
      key: 'ptdlIconGlyph', sort: 504, title: t('Icon glyph'),
      steps: {
        settings: {
          title: t('Icon glyph settings'),
          uiMode: { type: 'dialog', props: { width: 520 } },
          uiSchema: () => ({
            preview: { type: 'void', title: t('Preview'), 'x-decorator': 'FormItem', 'x-decorator-props': { style: { marginBottom: 8 } }, 'x-component': 'ICO_Preview' },
            row1: {
              type: 'void', 'x-component': 'ICO_Grid',
              'x-component-props': { style: { gridTemplateColumns: '1fr 1fr auto', alignItems: 'end', gap: '0 12px' } },
              properties: {
                size: fi(t('Size'), 'ICO_Slider', { type: 'number' }),
                color: fi(t('Colour (empty = inherit)'), 'ICO_Color'),
                reset: { type: 'void', 'x-component': 'ICO_Reset', 'x-component-props': { defaults: ICO_DEFAULTS, label: t('Reset') }, 'x-decorator': 'FormItem', 'x-decorator-props': { style: { marginBottom: 6, alignSelf: 'end' } } },
              },
            },
            row2: {
              type: 'void', 'x-component': 'ICO_Grid',
              'x-component-props': { style: { gridTemplateColumns: '1fr 1fr 1fr', gap: '0 12px', alignItems: 'end' } },
              properties: {
                bg: fi(t('Background'), 'ICO_Seg', { componentProps: { options: [{ label: t('None'), value: 'none' }, { label: t('Circle'), value: 'circle' }, { label: t('Square'), value: 'square' }] } }),
                bgColor: fi(t('Background colour'), 'ICO_Color', { reactions: rx((v: any) => v.bg && v.bg !== 'none') }),
                label: fi(t('Show name'), 'ICO_Switch', { type: 'boolean' }),
              },
            },
          }),
          defaultParams: { ...ICO_DEFAULTS },
          handler(ctx: any, params: any) {
            const p = params || {};
            ctx.model.setProps({
              ptdliSize: typeof p.size === 'number' ? p.size : 18, ptdliColor: p.color || '',
              ptdliBg: p.bg || 'none', ptdliBgColor: p.bgColor || '', ptdliLabel: !!p.label,
            });
          },
        },
      },
    });
  } catch (e) { console.warn('[field-enh] icon registerFlow failed', e); }

  const binder = [PtdlIconGlyphFieldModel, Base, CollectionFieldModel].find((c: any) => c && typeof c.bindModelToInterface === 'function');
  // isDefault:true → the Icon-glyph display is the default renderer for every `icon` cell (table/detail),
  // so the library styles both edit AND display. Users can still switch a column back to the core display.
  try { (binder as any)?.bindModelToInterface('PtdlIconGlyphFieldModel', ['icon'], { isDefault: true }); }
  catch (e) { console.warn('[field-enh] icon bind failed', e); }

  // EDITABLE variant — swap the core antd icon picker (Outlined/Filled/Two-tone antd set) for our
  // RegistryIconPicker (full Lucide via custom-icons registry), matching the Icon-glyph display. Opt-in.
  if (EditBase) {
    class PtdlIconInputFieldModel extends EditBase {
      render() {
        const model: any = this;
        const p = model.props || {};
        if (p.pattern === 'readPretty') return <IconView value={p.value} cfg={{ ...ICO_DEFAULTS }} />;
        return <RegistryIconPicker value={p.value} onChange={(v: any) => p.onChange?.(v)} disabled={p.disabled} placeholder={p.placeholder} />;
      }
    }
    flowEngine.registerModels({ PtdlIconInputFieldModel });
    try { (PtdlIconInputFieldModel as any).define?.({ label: t('Icon picker') }); } catch (_) { /* optional */ }
    const eb = [EditableItemModel, PtdlIconInputFieldModel, EditBase].find((c: any) => c && typeof c.bindModelToInterface === 'function');
    // isDefault:true → OUR RegistryIconPicker (full Lucide) becomes the default editor for every `icon`
    // field, replacing the core antd Outlined/Filled/Two-tone picker. User asked to default to the library.
    try { (eb as any)?.bindModelToInterface('PtdlIconInputFieldModel', ['icon'], { isDefault: true }); }
    catch (e) { console.warn('[field-enh] icon-input bind failed', e); }
  }

  return PtdlIconGlyphFieldModel;
}
