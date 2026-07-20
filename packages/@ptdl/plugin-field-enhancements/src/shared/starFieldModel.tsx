import React from 'react';
import { EditableItemModel } from '@nocobase/flow-engine';
import { Rate, Switch, Slider } from 'antd';
import { ColorField, IconByKey, RegistryIconPicker, SettingsGrid, ResetButton, fieldItem as fi } from '@ptdl/shared';
import { globalToggleField, saveWidgetGlobal } from './globalWidgetToggle';
import { observer, useForm } from '@formily/react';
import { bindDisplayField } from './displayBinding';

/**
 * No-code widget: field SỐ (number/integer) → hiển thị/nhập bằng ⭐ Rate (antd). Config: icon tuỳ chọn (mặc định sao),
 * số tối đa, cho nửa, màu. Editable = Rate bấm chọn; readPretty = Rate disabled (+ số tuỳ chọn).
 */

const S_DEFAULTS = {
  icon: undefined as string | undefined, count: 5, allowHalf: true, color: '#fadb14', showValue: false,
};

type SCfg = { icon?: string; count: number; allowHalf: boolean; color: string; showValue: boolean };
function scfgFromProps(p: any): SCfg {
  return {
    icon: p.ptdlsIcon,
    count: typeof p.ptdlsCount === 'number' ? p.ptdlsCount : 5,
    allowHalf: p.ptdlsAllowHalf !== false,
    color: p.ptdlsColor || '#fadb14',
    showValue: !!p.ptdlsShowValue,
  };
}
function scfgFromForm(v: any): SCfg {
  return {
    icon: v?.icon,
    count: typeof v?.count === 'number' ? v.count : 5,
    allowHalf: v?.allowHalf !== false,
    color: v?.color || '#fadb14',
    showValue: !!v?.showValue,
  };
}

function StarView({
  cfg, value, onChange, disabled,
}: {
  cfg: SCfg; value?: any; onChange?: (v: any) => void; disabled?: boolean;
}) {
  const num = value == null || value === '' ? 0 : Number(value);
  // character: icon từ registry (nếu chọn) — nếu không render (registry chưa set/icon lỗi) thì antd tự dùng sao mặc định.
  const character = cfg.icon ? <IconByKey type={cfg.icon} /> : undefined;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <Rate
        value={Number.isNaN(num) ? 0 : num}
        onChange={(v: any) => onChange?.(v)}
        count={cfg.count}
        allowHalf={cfg.allowHalf}
        disabled={disabled}
        character={character}
        style={{ color: cfg.color, fontSize: 'inherit' }}
      />
      {cfg.showValue ? <span style={{ color: '#8c8c8c', fontVariantNumeric: 'tabular-nums' }}>{Number.isNaN(num) ? '' : num}</span> : null}
    </span>
  );
}

// ---- settings components (S_*) -----------------------------------------------------------------
const S_Switch = (props: any) => <Switch checked={!!props.value} onChange={(c: any) => props.onChange?.(c)} />;
const S_Slider = (props: any) => {
  const min = props.min ?? 3, max = props.max ?? 10;
  const v = typeof props.value === 'number' ? props.value : props.defaultValue ?? min;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 140 }}>
      <Slider min={min} max={max} value={v} onChange={(n: any) => props.onChange?.(n)} style={{ flex: 1 }} />
      <span style={{ width: 24, textAlign: 'right', color: '#888' }}>{v}</span>
    </div>
  );
};
export function registerStarFieldModel(deps: {
  flowEngine: any; flowSettings?: any; Base: any; tExpr?: (s: string, o?: any) => any;
}) {
  const { flowEngine, flowSettings, Base } = deps;
  if (!flowEngine || !Base) {
    // eslint-disable-next-line no-console
    console.warn('[field-enh] star: missing flowEngine/Base — skip');
    return;
  }
  const t = (s: string) => (deps.tExpr ? deps.tExpr(s, { ns: 'field-enhancements' }) : s);

  if (flowSettings?.registerComponents) {
    try {
      flowSettings.registerComponents({
        S_Grid: SettingsGrid, S_Switch, S_Slider, S_Color: ColorField, S_Reset: ResetButton, S_IconField: RegistryIconPicker, S_Preview: StarPreview,
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[field-enh] star registerComponents failed', e);
    }
  }

  class PtdlStarFieldModel extends Base {
    render() {
      const model: any = this;
      const p = model.props || {};
      const cfg = scfgFromProps(p);
      const readPretty = p.pattern === 'readPretty';
      return <StarView cfg={cfg} value={p.value} onChange={(v: any) => p.onChange?.(v)} disabled={readPretty || p.disabled} />;
    }
  }

  flowEngine.registerModels({ PtdlStarFieldModel });
  try { (PtdlStarFieldModel as any).define?.({ label: t('Star rating') }); } catch (_) { /* optional */ }

  const starFlow: any = {
      key: 'ptdlStar',
      sort: 800,
      title: t('Star rating'),
      steps: {
        settings: {
          title: t('Star rating settings'),
          uiMode: { type: 'dialog', props: { width: 600 } },
          uiSchema: () => ({
            ...globalToggleField(t),
            preview: {
              type: 'void', title: t('Preview'),
              'x-decorator': 'FormItem', 'x-decorator-props': { style: { marginBottom: 8 } },
              'x-component': 'S_Preview',
            },
            row1: {
              type: 'void', 'x-component': 'S_Grid',
              'x-component-props': { style: { gridTemplateColumns: 'auto 1fr auto', alignItems: 'end', gap: '0 12px' } },
              properties: {
                icon: fi(t('Icon (empty = star)'), 'S_IconField'),
                count: fi(t('Max'), 'S_Slider', { type: 'number', componentProps: { min: 3, max: 10 } }),
                reset: {
                  type: 'void', 'x-component': 'S_Reset', 'x-component-props': { defaults: S_DEFAULTS, label: t('Reset') },
                  'x-decorator': 'FormItem', 'x-decorator-props': { style: { marginBottom: 6, alignSelf: 'end' } },
                },
              },
            },
            row2: {
              type: 'void', 'x-component': 'S_Grid',
              'x-component-props': { minColWidth: 150 },
              properties: {
                color: fi(t('Color'), 'S_Color'),
                allowHalf: fi(t('Allow half'), 'S_Switch', { type: 'boolean' }),
                showValue: fi(t('Show number'), 'S_Switch', { type: 'boolean' }),
              },
            },
          }),
          defaultParams: { ...S_DEFAULTS },
          handler(ctx: any, params: any) {
            const p = params || {};
            const props = {
              ptdlsIcon: p.icon || undefined,
              ptdlsCount: typeof p.count === 'number' ? p.count : 5,
              ptdlsAllowHalf: p.allowHalf !== false,
              ptdlsColor: p.color || '#fadb14',
              ptdlsShowValue: !!p.showValue,
            };
            ctx.model.setProps(props);
            saveWidgetGlobal(ctx, params, 'PtdlStarFieldModel', props);
          },
        },
      },
  };
  try {
    (PtdlStarFieldModel as any).registerFlow(starFlow);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[field-enh] star registerFlow failed', e);
  }

  const binder =
    (EditableItemModel && typeof (EditableItemModel as any).bindModelToInterface === 'function' && EditableItemModel) ||
    [PtdlStarFieldModel, Base].find((c: any) => c && typeof c.bindModelToInterface === 'function');
  try {
    (binder as any)?.bindModelToInterface('PtdlStarFieldModel', ['number', 'integer'], { isDefault: false });
    if (!binder) console.warn('[field-enh] star: no binder found');
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[field-enh] star bind failed', e);
  }

  // Display variant (detail/table/list).
  bindDisplayField({
    flowEngine, Base, name: 'PtdlStarDisplayFieldModel', interfaces: ['number', 'integer'],
    label: t('Star rating'), flow: { ...starFlow, key: 'ptdlStarDisplay' },
    render: (p: any) => <StarView cfg={scfgFromProps(p)} value={p.value} disabled />,
  });

  return PtdlStarFieldModel;
}

const StarPreview: any = observer(() => {
  const form: any = useForm();
  const cfg = scfgFromForm(form?.values || {});
  const sample = cfg.allowHalf ? Math.min(cfg.count, 3.5) : Math.min(cfg.count, 3);
  return (
    <div style={{ padding: '10px 12px', background: 'var(--colorFillQuaternary, #fafafa)', borderRadius: 6, border: '1px dashed #d9d9d9' }}>
      <StarView cfg={cfg} value={sample} />
    </div>
  );
});

// Bridge cho @ptdl/plugin-spreadsheet-view dùng view component làm cell widget (không FlowModel per cell).
(globalThis as any).__ptdlFieldEnh = { ...((globalThis as any).__ptdlFieldEnh || {}), StarView, S_DEFAULTS };
