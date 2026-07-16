import React from 'react';
import { EditableItemModel } from '@nocobase/flow-engine';
import { InputNumber, Switch, Slider, Input } from 'antd';
import { SegmentedGroup, ColumnSelect, ColorField, IconByKey, RegistryIconPicker, SettingsGrid, ResetButton, CollapsibleSection, fieldItem as fi, rx, SEG_PROPS } from '@ptdl/shared';
import { observer, useForm } from '@formily/react';
import { bindDisplayField } from './displayBinding';

/**
 * No-code widget: field SỐ (number/integer/percent) → InputNumber có ICON/prefix + FORMAT (phân tách nghìn,
 * số thập phân) + ĐƠN VỊ (fixed cứng hoặc lấy từ cột khác của record). Tham khảo ảnh user: `$ 1,000.00  USD ⌄`.
 */

const N_DEFAULTS = {
  icon: undefined as string | undefined, iconColor: '',
  thousands: true, decimals: 2,
  unitMode: 'none', unitText: '', unitField: '',
};

type NCfg = {
  icon?: string; iconColor?: string;
  thousands: boolean; decimals: number;
  unitMode: string; unitText?: string; unitField?: string;
};
function ncfgFromProps(p: any): NCfg {
  return {
    icon: p.ptdlnIcon, iconColor: p.ptdlnIconColor || '',
    thousands: p.ptdlnThousands !== false, decimals: typeof p.ptdlnDecimals === 'number' ? p.ptdlnDecimals : 2,
    unitMode: p.ptdlnUnitMode || 'none', unitText: p.ptdlnUnitText || '', unitField: p.ptdlnUnitField || '',
  };
}
function ncfgFromForm(v: any): NCfg {
  return {
    icon: v?.icon, iconColor: v?.iconColor || '',
    thousands: v?.thousands !== false, decimals: typeof v?.decimals === 'number' ? v.decimals : 2,
    unitMode: v?.unitMode || 'none', unitText: v?.unitText || '', unitField: v?.unitField || '',
  };
}

function addThousands(intStr: string): string {
  return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
function formatDisplay(v: any, cfg: NCfg): string {
  if (v == null || v === '') return '';
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  let s = cfg.decimals >= 0 ? n.toFixed(cfg.decimals) : String(n);
  if (cfg.thousands) {
    const neg = s.startsWith('-');
    const abs = neg ? s.slice(1) : s;
    const [int, dec] = abs.split('.');
    s = (neg ? '-' : '') + addThousands(int) + (dec ? '.' + dec : '');
  }
  return s;
}
function prefixNode(cfg: NCfg): React.ReactNode {
  const color = cfg.iconColor || 'currentColor';
  if (cfg.icon) return <span style={{ display: 'inline-flex', lineHeight: 0, color, fontSize: 'inherit' }}><IconByKey type={cfg.icon} /></span>;
  return null;
}
// Chặn số chữ số thập phân ngay lúc gõ (antd bỏ qua `precision` khi có `formatter` → phải tự cắt ở parser).
// Nhận chuỗi đã bỏ dấu phẩy. decimals=0 → chỉ phần nguyên; giữ nguyên khi user đang gõ dở "12." (chưa có phần lẻ).
function clampDecimals(raw: string, decimals: number): string {
  if (decimals < 0) return raw;
  const m = String(raw).match(/^(-?)(\d*)(?:\.(\d*))?$/);
  if (!m) return raw;
  const sign = m[1] || '';
  const intp = m[2] || '';
  const dec = m[3];
  if (decimals === 0) return sign + intp; // integer-only: bỏ luôn dấu chấm
  if (dec == null) return raw;            // chưa gõ phần thập phân (hoặc kết thúc bằng '.')
  return sign + intp + '.' + (dec.length > decimals ? dec.slice(0, decimals) : dec);
}
function computeUnit(model: any, cfg: NCfg): string {
  if (cfg.unitMode === 'fixed') return cfg.unitText || '';
  if (cfg.unitMode === 'field' && cfg.unitField) {
    const rec = model?.context?.record || {};
    const fv = model?.context?.form?.getFieldValue?.(cfg.unitField);
    const raw = fv ?? rec[cfg.unitField];
    return raw == null ? '' : String(raw);
  }
  return '';
}

// Render InputNumber theo cfg — dùng chung render() field thật lẫn preview (preview truyền unitOverride).
function NumberInput({
  cfg, value, onChange, disabled, placeholder, unit,
}: {
  cfg: NCfg; value?: any; onChange?: (v: any) => void; disabled?: boolean; placeholder?: string; unit?: string;
}) {
  return (
    <InputNumber
      style={{ width: '100%' }}
      value={value}
      onChange={(v: any) => onChange?.(Number.isNaN(v) ? null : v)}
      disabled={disabled}
      placeholder={placeholder}
      prefix={prefixNode(cfg)}
      addonAfter={unit ? <span style={{ whiteSpace: 'nowrap' }}>{unit}</span> : undefined}
      controls={false}
      formatter={(val: any) => {
        if (val == null || val === '') return '';
        if (!cfg.thousands) return `${val}`;
        const s = `${val}`;
        const neg = s.startsWith('-');
        const abs = neg ? s.slice(1) : s;
        const [int, dec] = abs.split('.');
        return (neg ? '-' : '') + addThousands(int) + (dec != null ? '.' + dec : '');
      }}
      parser={(val: any) => (val == null ? '' : clampDecimals(String(val).replace(/,/g, ''), cfg.decimals))}
    />
  );
}

// ---- settings components (N_*) -----------------------------------------------------------------
const N_Seg = (props: any) => (
  <SegmentedGroup {...SEG_PROPS} value={props.value ?? props.defaultValue} onChange={(v: any) => props.onChange?.(v)} options={props.options || []} />
);
const N_Switch = (props: any) => <Switch checked={!!props.value} onChange={(c: any) => props.onChange?.(c)} />;
const N_Slider = (props: any) => {
  const min = props.min ?? 0, max = props.max ?? 4;
  const v = typeof props.value === 'number' ? props.value : props.defaultValue ?? min;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 160 }}>
      <Slider min={min} max={max} value={v} onChange={(n: any) => props.onChange?.(n)} style={{ flex: 1 }} />
      <span style={{ width: 24, textAlign: 'right', color: '#888' }}>{v}</span>
    </div>
  );
};
const N_FieldSelect = (props: any) => (
  <ColumnSelect
    value={props.value || undefined} onChange={(v: any) => props.onChange?.(v)} options={props.options || []}
    placeholder="Chọn cột…"
  />
);
export function registerNumberFieldModel(deps: {
  flowEngine: any; flowSettings?: any; Base: any; tExpr?: (s: string, o?: any) => any;
}) {
  const { flowEngine, flowSettings, Base } = deps;
  if (!flowEngine || !Base) {
    // eslint-disable-next-line no-console
    console.warn('[field-enh] number: missing flowEngine/Base — skip');
    return;
  }
  const t = (s: string) => (deps.tExpr ? deps.tExpr(s, { ns: 'field-enhancements' }) : s);

  if (flowSettings?.registerComponents) {
    try {
      flowSettings.registerComponents({
        N_Grid: SettingsGrid, CollapsibleSection, N_Seg, N_Switch, N_Slider, N_Color: ColorField, N_FieldSelect, N_Reset: ResetButton,
        N_IconField: RegistryIconPicker, N_Preview: NumberPreview,
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[field-enh] number registerComponents failed', e);
    }
  }

  class PtdlNumberFieldModel extends Base {
    render() {
      const model: any = this;
      const p = model.props || {};
      const cfg = ncfgFromProps(p);
      const unit = computeUnit(model, cfg);
      if (p.pattern === 'readPretty') {
        const pfx = prefixNode(cfg);
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            {pfx}<span>{formatDisplay(p.value, cfg)}</span>{unit ? <span style={{ color: '#8c8c8c' }}>{unit}</span> : null}
          </span>
        );
      }
      return (
        <NumberInput cfg={cfg} value={p.value} onChange={(v: any) => p.onChange?.(v)} disabled={p.disabled} placeholder={p.placeholder} unit={unit} />
      );
    }
  }

  flowEngine.registerModels({ PtdlNumberFieldModel });
  try { (PtdlNumberFieldModel as any).define?.({ label: t('Number with unit') }); } catch (_) { /* optional */ }

  const numberFlow: any = {
      key: 'ptdlNumber',
      sort: 800,
      title: t('Number with unit'),
      steps: {
        settings: {
          title: t('Number with unit settings'),
          uiMode: { type: 'dialog', props: { width: 600 } },
          uiSchema: (ctx: any) => {
            const coll = ctx?.model?.collection || ctx?.model?.context?.collection || ctx?.model?.context?.collectionField?.collection;
            const selfName = ctx?.model?.collectionField?.name;
            let fieldOptions: any[] = [];
            try {
              const fields = coll?.getFields?.() || [];
              fieldOptions = fields
                .filter((f: any) => f?.name && f.name !== selfName)
                .map((f: any) => ({ label: f.title || f.name, value: f.name, type: f.type, iface: f.interface }));
            } catch (_) { /* ignore */ }
            return {
              preview: {
                type: 'void', title: t('Preview'),
                'x-decorator': 'FormItem', 'x-decorator-props': { style: { marginBottom: 8 } },
                'x-component': 'N_Preview',
              },
              row1: {
                type: 'void', 'x-component': 'N_Grid',
                'x-component-props': { style: { gridTemplateColumns: '1fr 1fr auto', alignItems: 'end', gap: '0 12px' } },
                properties: {
                  icon: fi(t('Icon'), 'N_IconField'),
                  iconColor: fi(t('Icon color (empty = text)'), 'N_Color'),
                  reset: {
                    type: 'void', 'x-component': 'N_Reset', 'x-component-props': { defaults: N_DEFAULTS, label: t('Reset') },
                    'x-decorator': 'FormItem', 'x-decorator-props': { style: { marginBottom: 6, alignSelf: 'end' } },
                  },
                },
              },
              format: {
                type: 'void', 'x-component': 'CollapsibleSection', 'x-component-props': { title: t('Format') },
                properties: {
                  row2: {
                    type: 'void', 'x-component': 'N_Grid', 'x-component-props': { minColWidth: 180 },
                    properties: {
                      thousands: fi(t('Thousands separator'), 'N_Switch', { type: 'boolean' }),
                      decimals: fi(t('Decimals'), 'N_Slider', { type: 'number', componentProps: { min: 0, max: 4 } }),
                    },
                  },
                  unitMode: fi(t('Unit'), 'N_Seg', {
                    componentProps: { options: [
                      { label: t('None'), value: 'none' },
                      { label: t('Fixed'), value: 'fixed' },
                      { label: t('From field'), value: 'field' },
                    ] },
                  }),
                  unitText: fi(t('Unit text (e.g. USD)'), 'Input', {
                    componentProps: { placeholder: 'USD', style: { width: '100%' } },
                    reactions: rx((v: any) => v.unitMode === 'fixed'),
                  }),
                  unitField: fi(t('Unit from column'), 'N_FieldSelect', {
                    componentProps: { options: fieldOptions },
                    reactions: rx((v: any) => v.unitMode === 'field'),
                  }),
                },
              },
            };
          },
          defaultParams: { ...N_DEFAULTS },
          handler(ctx: any, params: any) {
            const p = params || {};
            ctx.model.setProps({
              ptdlnIcon: p.icon || undefined,
              ptdlnIconColor: p.iconColor || '',
              ptdlnThousands: p.thousands !== false,
              ptdlnDecimals: typeof p.decimals === 'number' ? p.decimals : 2,
              ptdlnUnitMode: p.unitMode || 'none',
              ptdlnUnitText: p.unitText || '',
              ptdlnUnitField: p.unitField || '',
            });
          },
        },
      },
  };
  try {
    (PtdlNumberFieldModel as any).registerFlow(numberFlow);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[field-enh] number registerFlow failed', e);
  }

  const binder =
    (EditableItemModel && typeof (EditableItemModel as any).bindModelToInterface === 'function' && EditableItemModel) ||
    [PtdlNumberFieldModel, Base].find((c: any) => c && typeof c.bindModelToInterface === 'function');
  try {
    (binder as any)?.bindModelToInterface('PtdlNumberFieldModel', ['number', 'integer', 'percent'], { isDefault: false });
    if (!binder) console.warn('[field-enh] number: no binder found');
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[field-enh] number bind failed', e);
  }

  // Display variant (detail/table/list) — số đã format + prefix + unit.
  bindDisplayField({
    flowEngine, Base, name: 'PtdlNumberDisplayFieldModel', interfaces: ['number', 'integer', 'percent'],
    label: t('Number with unit'), flow: { ...numberFlow, key: 'ptdlNumberDisplay' },
    render: (p: any, model: any) => {
      const cfg = ncfgFromProps(p);
      const unit = computeUnit(model, cfg);
      const pfx = prefixNode(cfg);
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {pfx}<span>{formatDisplay(p.value, cfg)}</span>{unit ? <span style={{ color: '#8c8c8c' }}>{unit}</span> : null}
        </span>
      );
    },
  });

  return PtdlNumberFieldModel;
}

// Live preview — đọc cfg từ form.values; đơn vị hiển thị mẫu (fixed=unitText, field=tên cột) vì chưa có record.
const NumberPreview: any = observer(() => {
  const form: any = useForm();
  const cfg = ncfgFromForm(form?.values || {});
  const unit = cfg.unitMode === 'fixed' ? cfg.unitText || 'USD' : cfg.unitMode === 'field' ? `{${cfg.unitField || 'field'}}` : '';
  return (
    <div style={{ padding: '10px 12px', background: 'var(--colorFillQuaternary, #fafafa)', borderRadius: 6, border: '1px dashed #d9d9d9' }}>
      <NumberInput cfg={cfg} value={1000} unit={unit} />
    </div>
  );
});
