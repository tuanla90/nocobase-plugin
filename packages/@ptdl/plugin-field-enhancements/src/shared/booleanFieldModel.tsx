import React from 'react';
import { EditableItemModel } from '@nocobase/flow-engine';
import { Switch, Slider, Input } from 'antd';
import { SegmentedGroup, IconByKey, RegistryIconPicker, SettingsGrid, ResetButton, fieldItem as fi, rx, SEG_PROPS, colorStrip } from '@ptdl/shared';
import { globalToggleField, saveWidgetGlobal } from './globalWidgetToggle';
import { observer, useForm } from '@formily/react';
import { bindDisplayField } from './displayBinding';

/**
 * No-code widget: field boolean (checkbox) → hiển thị/nhập dạng Toggle (switch) hoặc Icon.
 * Tham khảo snippet runjs-checkbox: on/off color, icon on/off, FILLED (nền đặc + check trắng), show label,
 * null-as-off. Editable = bấm đổi; readPretty = hiển thị. Icon từ registry custom-icons (không CDN).
 */

const B_DEFAULTS = {
  style: 'toggle',
  onColor: '#52c41a', offColor: '#d9d9d9',
  iconOn: 'checkcircleoutlined', iconOff: 'closecircleoutlined',
  filled: false, size: 18,
  showLabel: false, labelOn: 'On', labelOff: 'Off',
  nullAsOff: true,
};

type BCfg = {
  style: string; onColor: string; offColor: string;
  iconOn: string; iconOff: string; filled: boolean; size: number;
  showLabel: boolean; labelOn: string; labelOff: string; nullAsOff: boolean;
};
function bcfgFromProps(p: any): BCfg {
  return {
    style: p.ptdlbStyle || 'toggle',
    onColor: p.ptdlbOnColor || '#52c41a', offColor: p.ptdlbOffColor || '#d9d9d9',
    iconOn: p.ptdlbIconOn || 'checkcircleoutlined', iconOff: p.ptdlbIconOff || 'closecircleoutlined',
    filled: !!p.ptdlbFilled, size: typeof p.ptdlbSize === 'number' ? p.ptdlbSize : 18,
    showLabel: !!p.ptdlbShowLabel, labelOn: p.ptdlbLabelOn ?? 'On', labelOff: p.ptdlbLabelOff ?? 'Off',
    nullAsOff: p.ptdlbNullAsOff !== false,
  };
}
function bcfgFromForm(v: any): BCfg {
  return {
    style: v?.style || 'toggle',
    onColor: v?.onColor || '#52c41a', offColor: v?.offColor || '#d9d9d9',
    iconOn: v?.iconOn || 'checkcircleoutlined', iconOff: v?.iconOff || 'closecircleoutlined',
    filled: !!v?.filled, size: typeof v?.size === 'number' ? v.size : 18,
    showLabel: !!v?.showLabel, labelOn: v?.labelOn ?? 'On', labelOff: v?.labelOff ?? 'Off',
    nullAsOff: v?.nullAsOff !== false,
  };
}

const isChecked = (v: any) => v === true || v === 1 || v === '1' || v === 'true';

function BoolView({
  cfg, value, onChange, interactive,
}: {
  cfg: BCfg; value?: any; onChange?: (v: any) => void; interactive?: boolean;
}) {
  const isNull = value == null || value === '';
  if (isNull && !cfg.nullAsOff && !interactive) return <span style={{ color: '#bfbfbf' }}>-</span>;
  const checked = isChecked(value);
  const label = cfg.showLabel
    ? <span style={{ fontSize: 12, color: checked ? cfg.onColor : '#8c8c8c' }}>{checked ? cfg.labelOn : cfg.labelOff}</span>
    : null;
  const cursor = interactive ? 'pointer' : 'default';
  const toggle = () => interactive && onChange?.(!checked);

  if (cfg.style === 'toggle') {
    // antd Switch — override màu track theo on/off color.
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <Switch
          checked={checked}
          disabled={!interactive}
          onChange={(c: any) => onChange?.(c)}
          style={{ backgroundColor: checked ? cfg.onColor : cfg.offColor }}
        />
        {label}
      </span>
    );
  }

  // Icon style
  const key = checked ? cfg.iconOn : cfg.iconOff;
  const iconEl = <IconByKey type={key} />;
  let iconNode: React.ReactNode;
  if (checked && cfg.filled) {
    // Nền đặc onColor + icon trắng, bo tròn (giống FILLED của snippet).
    iconNode = (
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: cfg.size + 6, height: cfg.size + 6, borderRadius: '50%',
        background: cfg.onColor, color: '#fff', fontSize: cfg.size, lineHeight: 0,
      }}>{iconEl}</span>
    );
  } else {
    iconNode = <span style={{ color: checked ? cfg.onColor : cfg.offColor, fontSize: cfg.size, lineHeight: 0, display: 'inline-flex' }}>{iconEl}</span>;
  }
  return (
    <span
      onClick={(e: any) => { e.stopPropagation(); toggle(); }}
      title={checked ? cfg.labelOn : cfg.labelOff}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor, lineHeight: 0 }}
    >
      {iconNode}{label}
    </span>
  );
}

// ---- settings components (B_*) -----------------------------------------------------------------
const B_Seg = (props: any) => (
  <SegmentedGroup {...SEG_PROPS} value={props.value ?? props.defaultValue} onChange={(v: any) => props.onChange?.(v)} options={props.options || []} />
);
const B_Switch = (props: any) => <Switch checked={!!props.value} onChange={(c: any) => props.onChange?.(c)} />;
const B_Slider = (props: any) => {
  const min = props.min ?? 12, max = props.max ?? 32;
  const v = typeof props.value === 'number' ? props.value : props.defaultValue ?? min;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 140 }}>
      <Slider min={min} max={max} value={v} onChange={(n: any) => props.onChange?.(n)} style={{ flex: 1 }} />
      <span style={{ width: 32, textAlign: 'right', color: '#888' }}>{v}px</span>
    </div>
  );
};
export function registerBooleanFieldModel(deps: {
  flowEngine: any; flowSettings?: any; Base: any; tExpr?: (s: string, o?: any) => any;
}) {
  const { flowEngine, flowSettings, Base } = deps;
  if (!flowEngine || !Base) {
    // eslint-disable-next-line no-console
    console.warn('[field-enh] boolean: missing flowEngine/Base — skip');
    return;
  }
  const t = (s: string) => (deps.tExpr ? deps.tExpr(s, { ns: 'field-enhancements' }) : s);

  if (flowSettings?.registerComponents) {
    try {
      flowSettings.registerComponents({
        B_Grid: SettingsGrid, B_Seg, B_Switch, B_Slider, B_Reset: ResetButton, B_IconField: RegistryIconPicker, B_Preview: BoolPreview,
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[field-enh] boolean registerComponents failed', e);
    }
  }

  class PtdlBooleanFieldModel extends Base {
    render() {
      const model: any = this;
      const p = model.props || {};
      const cfg = bcfgFromProps(p);
      const readPretty = p.pattern === 'readPretty';
      return <BoolView cfg={cfg} value={p.value} onChange={(v: any) => p.onChange?.(v)} interactive={!readPretty && !p.disabled} />;
    }
  }

  flowEngine.registerModels({ PtdlBooleanFieldModel });
  try { (PtdlBooleanFieldModel as any).define?.({ label: t('Boolean style') }); } catch (_) { /* optional */ }

  const visIcon = rx((v: any) => v.style === 'icon');
  const visLabel = rx((v: any) => !!v.showLabel);

  const booleanFlow: any = {
      key: 'ptdlBoolean',
      sort: 800,
      title: t('Boolean style'),
      steps: {
        settings: {
          title: t('Boolean style settings'),
          uiMode: { type: 'dialog', props: { width: 600 } },
          uiSchema: () => ({
            ...globalToggleField(t),
            preview: {
              type: 'void', title: t('Preview'),
              'x-decorator': 'FormItem', 'x-decorator-props': { style: { marginBottom: 8 } },
              'x-component': 'B_Preview',
            },
            row1: {
              type: 'void', 'x-component': 'B_Grid',
              'x-component-props': { style: { gridTemplateColumns: '1fr auto', alignItems: 'end', gap: '0 12px' } },
              properties: {
                style: fi(t('Style'), 'B_Seg', {
                  componentProps: { options: [{ label: t('Toggle'), value: 'toggle' }, { label: t('Icon'), value: 'icon' }] },
                }),
                reset: {
                  type: 'void', 'x-component': 'B_Reset', 'x-component-props': { defaults: B_DEFAULTS, label: t('Reset') },
                  'x-decorator': 'FormItem', 'x-decorator-props': { style: { marginBottom: 6, alignSelf: 'end' } },
                },
              },
            },
            // On/off colours — compact swatch strip (house style).
            row2: colorStrip([
              { key: 'onColor', title: t('On color') },
              { key: 'offColor', title: t('Off color') },
            ], { minColWidth: 90 }),
            iconRow: {
              type: 'void', 'x-component': 'B_Grid',
              'x-component-props': { style: { gridTemplateColumns: 'auto auto 1fr' } },
              'x-reactions': visIcon,
              properties: {
                iconOn: fi(t('Icon on'), 'B_IconField'),
                iconOff: fi(t('Icon off'), 'B_IconField'),
                size: fi(t('Icon size'), 'B_Slider', { type: 'number', componentProps: { min: 12, max: 32 } }),
              },
            },
            filled: fi(t('Filled (solid bg + white check)'), 'B_Switch', { type: 'boolean', reactions: visIcon }),
            row3: {
              type: 'void', 'x-component': 'B_Grid',
              properties: {
                showLabel: fi(t('Show label'), 'B_Switch', { type: 'boolean' }),
                nullAsOff: fi(t('Null as Off (else "-")'), 'B_Switch', { type: 'boolean' }),
              },
            },
            labelRow: {
              type: 'void', 'x-component': 'B_Grid',
              'x-reactions': visLabel,
              properties: {
                labelOn: fi(t('On text'), 'Input', { componentProps: { placeholder: 'On', maxLength: 20 } }),
                labelOff: fi(t('Off text'), 'Input', { componentProps: { placeholder: 'Off', maxLength: 20 } }),
              },
            },
          }),
          defaultParams: { ...B_DEFAULTS },
          handler(ctx: any, params: any) {
            const p = params || {};
            const props = {
              ptdlbStyle: p.style || 'toggle',
              ptdlbOnColor: p.onColor || '#52c41a',
              ptdlbOffColor: p.offColor || '#d9d9d9',
              ptdlbIconOn: p.iconOn || 'checkcircleoutlined',
              ptdlbIconOff: p.iconOff || 'closecircleoutlined',
              ptdlbFilled: !!p.filled,
              ptdlbSize: typeof p.size === 'number' ? p.size : 18,
              ptdlbShowLabel: !!p.showLabel,
              ptdlbLabelOn: p.labelOn ?? 'On',
              ptdlbLabelOff: p.labelOff ?? 'Off',
              ptdlbNullAsOff: p.nullAsOff !== false,
            };
            ctx.model.setProps(props);
            saveWidgetGlobal(ctx, params, 'PtdlBooleanFieldModel', props);
          },
        },
      },
  };
  try {
    (PtdlBooleanFieldModel as any).registerFlow(booleanFlow);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[field-enh] boolean registerFlow failed', e);
  }

  const binder =
    (EditableItemModel && typeof (EditableItemModel as any).bindModelToInterface === 'function' && EditableItemModel) ||
    [PtdlBooleanFieldModel, Base].find((c: any) => c && typeof c.bindModelToInterface === 'function');
  try {
    (binder as any)?.bindModelToInterface('PtdlBooleanFieldModel', ['checkbox', 'boolean'], { isDefault: false });
    if (!binder) console.warn('[field-enh] boolean: no binder found');
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[field-enh] boolean bind failed', e);
  }

  // Display variant (detail/table/list) — render chỉ hiển thị, tái dùng cùng settings flow.
  bindDisplayField({
    flowEngine, Base, name: 'PtdlBooleanDisplayFieldModel', interfaces: ['checkbox', 'boolean'],
    label: t('Boolean style'), flow: { ...booleanFlow, key: 'ptdlBooleanDisplay' },
    render: (p: any) => <BoolView cfg={bcfgFromProps(p)} value={p.value} interactive={false} />,
  });

  return PtdlBooleanFieldModel;
}

const BoolPreview: any = observer(() => {
  const form: any = useForm();
  const cfg = bcfgFromForm(form?.values || {});
  return (
    <div style={{ padding: '10px 12px', background: 'var(--colorFillQuaternary, #fafafa)', borderRadius: 6, border: '1px dashed #d9d9d9', display: 'flex', gap: 24, alignItems: 'center' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ color: '#8c8c8c', fontSize: 12 }}>On:</span><BoolView cfg={cfg} value={true} /></span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ color: '#8c8c8c', fontSize: 12 }}>Off:</span><BoolView cfg={cfg} value={false} /></span>
    </div>
  );
});
