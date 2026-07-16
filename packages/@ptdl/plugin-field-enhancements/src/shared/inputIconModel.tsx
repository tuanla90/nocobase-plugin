import React from 'react';
import { EditableItemModel } from '@nocobase/flow-engine';
import { Input, Segmented, Slider } from 'antd';
import { ColorField, IconByKey, RegistryIconPicker, SettingsGrid, ResetButton, CollapsibleSection, fieldItem as fi, rx, SEG_PROPS } from '@ptdl/shared';
import { observer, useForm } from '@formily/react';
import { bindDisplayField } from './displayBinding';

// Giá trị mặc định (dùng cho defaultParams lẫn nút Reset). iconColor/iconBg trống = tự theo màu chữ / theme.
const DEFAULTS = {
  icon: undefined as string | undefined, iconColor: '', placeholderMode: 'title', customPlaceholder: '',
  variant: 'outlined', iconStyle: 'none', iconBg: '', radius: 6,
};

/**
 * No-code widget: field text 1 dòng (input/url/phone/email) → Input có ICON prefix + placeholder tuỳ chọn
 * (tên field / tự nhập / không). Bản plugin-hoá của snippet runjs-input-icon-placeholder.js. Icon từ registry
 * custom-icons (consumer, không CDN). Config 1 dialog có live preview.
 */

// IME-safe input (port từ InputFieldModel core) — tránh lỗi gõ tiếng Việt (composition).
// password=true → dùng Input.Password (che ký tự, có nút mắt) cho field password (case login-form).
function IMEInput(props: any) {
  const { value, onChange, password, ...rest } = props;
  const [inner, setInner] = React.useState<string>(value == null ? '' : String(value));
  React.useEffect(() => {
    setInner(value == null ? '' : String(value));
  }, [value]);
  const ev = (e: any) => e.currentTarget.value;
  const Comp: any = password ? Input.Password : Input;
  return (
    <Comp
      {...rest}
      value={inner}
      onChange={(e: any) => { setInner(ev(e)); onChange?.(ev(e)); }}
      onCompositionStart={(e: any) => setInner(ev(e))}
      onCompositionEnd={(e: any) => { setInner(ev(e)); onChange?.(ev(e)); }}
    />
  );
}

type Cfg = {
  icon?: string; iconColor?: string; placeholderMode: string; customPlaceholder?: string;
  variant: string; radius: number; iconStyle: string; iconBg?: string;
};
function cfgFromProps(p: any): Cfg {
  return {
    icon: p.ptdlIcon,
    iconColor: p.ptdlIconColor || '', // trống = theo màu chữ (currentColor)
    placeholderMode: p.ptdlPlaceholderMode || 'title',
    customPlaceholder: p.ptdlCustomPlaceholder || '',
    variant: p.ptdlVariant || 'outlined',
    radius: typeof p.ptdlRadius === 'number' ? p.ptdlRadius : 6,
    iconStyle: p.ptdlIconStyle || 'none',
    iconBg: p.ptdlIconBg || '',
  };
}
function cfgFromForm(v: any): Cfg {
  return {
    icon: v?.icon,
    iconColor: v?.iconColor || '',
    placeholderMode: v?.placeholderMode || 'title',
    customPlaceholder: v?.customPlaceholder || '',
    variant: v?.variant || 'outlined',
    radius: typeof v?.radius === 'number' ? v.radius : 6,
    iconStyle: v?.iconStyle || 'none',
    iconBg: v?.iconBg || '',
  };
}
function computePlaceholder(cfg: Cfg, fieldTitle?: string): string | undefined {
  if (cfg.placeholderMode === 'title') return fieldTitle || undefined;
  if (cfg.placeholderMode === 'custom') return cfg.customPlaceholder || undefined;
  return undefined; // 'none'
}

// Render Input theo cfg — dùng CHUNG cho render() field thật lẫn preview.
// LUÔN là 1 antd Input bình thường (border/variant/radius của input GIỮ NGUYÊN). Chỉ style riêng PREFIX icon
// theo iconStyle (KHÔNG dựng lại input):
// - 'none'       : chỉ icon, không nền, không vạch (inline).
// - 'background' : ô icon có màu nền (iconBg; để trống = tự theo theme dark/light qua CSS var), không vạch.
// - 'divider'    : ô icon có vạch ngăn phải, không nền.
// 'background'/'divider' bọc ô vuông ôm sát mép trái + cao hết ô (negative margin bù padding antd 4px/11px).
function IconInput({
  cfg, value, onChange, placeholder, disabled, allowClear, password,
}: {
  cfg: Cfg; value?: any; onChange?: (v: any) => void; placeholder?: string; disabled?: boolean; allowClear?: boolean; password?: boolean;
}) {
  const radius = cfg.radius >= 24 ? 999 : cfg.radius;
  const icon = cfg.icon ? <IconByKey type={cfg.icon} /> : null;

  // Màu icon: trống = theo màu chữ (currentColor). Size icon = size chữ (fontSize 'inherit').
  const iconColor = cfg.iconColor || 'currentColor';
  let prefix: React.ReactNode = undefined;
  if (icon) {
    const boxed = cfg.iconStyle === 'background' || cfg.iconStyle === 'divider';
    if (boxed) {
      // iconBg trống → var theme (tự đổi dark/light); có giá trị → dùng màu đó.
      const bg = cfg.iconStyle === 'background' ? cfg.iconBg || 'var(--colorFillSecondary, rgba(0,0,0,.06))' : 'transparent';
      const divider = cfg.iconStyle === 'divider' ? '1px solid var(--colorBorder, #d9d9d9)' : 'none';
      prefix = (
        <span
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch',
            margin: '-4px 8px -4px -11px', padding: '0 10px', color: iconColor, fontSize: 'inherit', lineHeight: 0,
            background: bg, borderRight: divider,
            borderTopLeftRadius: radius, borderBottomLeftRadius: radius,
          }}
        >
          {icon}
        </span>
      );
    } else {
      prefix = <span style={{ display: 'inline-flex', lineHeight: 0, color: iconColor, fontSize: 'inherit' }}>{icon}</span>;
    }
  }

  return (
    <IMEInput
      password={password}
      value={value} onChange={onChange} placeholder={placeholder} prefix={prefix}
      disabled={disabled} allowClear={allowClear} variant={cfg.variant}
      style={{ borderRadius: radius, overflow: 'hidden' }}
    />
  );
}

// ---- settings components (đăng ký tên riêng II_* tránh clobber) ---------------------------------
const II_Seg = (props: any) => (
  <Segmented {...SEG_PROPS} value={props.value ?? props.defaultValue} onChange={(v: any) => props.onChange?.(v)} options={props.options || []} />
);
const II_Slider = (props: any) => {
  const min = props.min ?? 0, max = props.max ?? 24;
  const v = typeof props.value === 'number' ? props.value : props.defaultValue ?? min;
  const label = v >= max && props.maxLabel ? props.maxLabel : `${v}px`;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 180 }}>
      <Slider min={min} max={max} value={v} onChange={(n: any) => props.onChange?.(n)} style={{ flex: 1 }} />
      <span style={{ width: 48, textAlign: 'right', color: '#888', fontVariantNumeric: 'tabular-nums' }}>{label}</span>
    </div>
  );
};
export function registerInputIconModel(deps: {
  flowEngine: any;
  flowSettings?: any;
  Base: any;
  tExpr?: (s: string, o?: any) => any;
}) {
  const { flowEngine, flowSettings, Base } = deps;
  if (!flowEngine || !Base) {
    // eslint-disable-next-line no-console
    console.warn('[field-enh] input-icon: missing flowEngine/Base — skip');
    return;
  }
  const t = (s: string) => (deps.tExpr ? deps.tExpr(s, { ns: 'field-enhancements' }) : s);

  if (flowSettings?.registerComponents) {
    try {
      flowSettings.registerComponents({
        II_Grid: SettingsGrid, CollapsibleSection, II_Seg, II_Color: ColorField, II_Slider, II_Reset: ResetButton, II_IconField: RegistryIconPicker, II_Preview: InputIconPreview,
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[field-enh] input-icon registerComponents failed', e);
    }
  }

  class PtdlInputIconFieldModel extends Base {
    render() {
      const model: any = this;
      const p = model.props || {};
      const cfg = cfgFromProps(p);
      const cf = model.collectionField || model.context?.collectionField;
      const placeholder = computePlaceholder(cfg, cf?.title);
      const isPassword = cf?.interface === 'password';
      if (p.pattern === 'readPretty') {
        return <span>{p.value == null ? '' : isPassword ? '••••••••' : String(p.value)}</span>;
      }
      return (
        <IconInput
          cfg={cfg}
          value={p.value}
          onChange={(v: any) => p.onChange?.(v)}
          placeholder={placeholder}
          disabled={p.disabled}
          allowClear={p.allowClear}
          password={isPassword}
        />
      );
    }
  }

  flowEngine.registerModels({ PtdlInputIconFieldModel });
  try { (PtdlInputIconFieldModel as any).define?.({ label: t('Input with icon') }); } catch (_) { /* optional */ }

  const inputIconFlow: any = {
      key: 'ptdlInputIcon',
      sort: 800,
      title: t('Input with icon'),
      steps: {
        settings: {
          title: t('Input with icon settings'),
          uiMode: { type: 'dialog', props: { width: 600 } },
          uiSchema: (ctx: any) => {
            const cf = ctx?.model?.collectionField || ctx?.model?.context?.collectionField;
            const fieldTitle = cf?.title;
            const isPassword = cf?.interface === 'password';
            const grid = (props: any) => ({ type: 'void', 'x-component': 'II_Grid', 'x-component-props': { minColWidth: 180 }, properties: props });
            return {
              preview: {
                type: 'void', title: t('Preview'),
                'x-decorator': 'FormItem', 'x-decorator-props': { style: { marginBottom: 8 } },
                'x-component': 'II_Preview', 'x-component-props': { fieldTitle, password: isPassword },
              },
              row1: {
                type: 'void', 'x-component': 'II_Grid',
                'x-component-props': { style: { gridTemplateColumns: '1fr 1fr auto', alignItems: 'end', gap: '0 12px' } },
                properties: {
                  icon: fi(t('Icon'), 'II_IconField', { decoratorProps: { style: { marginBottom: 6 } } }),
                  iconColor: fi(t('Icon color (empty = text)'), 'II_Color', { decoratorProps: { style: { marginBottom: 6 } } }),
                  reset: {
                    type: 'void', 'x-component': 'II_Reset',
                    'x-component-props': { defaults: DEFAULTS, label: t('Reset') },
                    'x-decorator': 'FormItem', 'x-decorator-props': { style: { marginBottom: 6, alignSelf: 'end' } },
                  },
                },
              },
              appearance: {
                type: 'void', 'x-component': 'CollapsibleSection', 'x-component-props': { title: t('Appearance') },
                properties: {
                  row2: grid({
                    variant: fi(t('Background'), 'II_Seg', {
                      decoratorProps: { style: { marginBottom: 6 } },
                      componentProps: { options: [
                        { label: t('Outlined'), value: 'outlined' }, { label: t('Filled'), value: 'filled' }, { label: t('Borderless'), value: 'borderless' },
                      ] },
                    }),
                    iconStyle: fi(t('Icon style'), 'II_Seg', {
                      decoratorProps: { style: { marginBottom: 6 } },
                      componentProps: { options: [
                        { label: t('None'), value: 'none' }, { label: t('Background'), value: 'background' }, { label: t('Divider'), value: 'divider' },
                      ] },
                    }),
                  }),
                  iconBg: fi(t('Icon background (empty = auto theme)'), 'II_Color', {
                    decoratorProps: { style: { marginBottom: 6 } },
                    reactions: rx((v: any) => v.iconStyle === 'background'),
                  }),
                  radius: fi(t('Corner radius'), 'II_Slider', { type: 'number', decoratorProps: { style: { marginBottom: 6 } }, componentProps: { min: 0, max: 24, maxLabel: 'Pill' } }),
                },
              },
              placeholderMode: fi(t('Placeholder'), 'II_Seg', {
                decoratorProps: { style: { marginBottom: 6 } },
                componentProps: { options: [
                  { label: t('Field title'), value: 'title' }, { label: t('Custom'), value: 'custom' }, { label: t('None'), value: 'none' },
                ] },
              }),
              customPlaceholder: fi(t('Custom placeholder'), 'Input', {
                decoratorProps: { style: { marginBottom: 6 } },
                reactions: rx((v: any) => v.placeholderMode === 'custom'),
              }),
            };
          },
          defaultParams: { ...DEFAULTS },
          handler(ctx: any, params: any) {
            const p = params || {};
            ctx.model.setProps({
              ptdlIcon: p.icon || undefined,
              ptdlIconColor: p.iconColor || '',
              ptdlPlaceholderMode: p.placeholderMode || 'title',
              ptdlCustomPlaceholder: p.customPlaceholder || '',
              ptdlVariant: p.variant || 'outlined',
              ptdlIconStyle: p.iconStyle || 'none',
              ptdlIconBg: p.iconBg || '',
              ptdlRadius: typeof p.radius === 'number' ? p.radius : 6,
            });
          },
        },
      },
  };
  try {
    (PtdlInputIconFieldModel as any).registerFlow(inputIconFlow);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[field-enh] input-icon registerFlow failed', e);
  }

  const ICON_INTERFACES = ['input', 'email', 'phone', 'url', 'uuid', 'nanoid', 'password'];
  const binder =
    (EditableItemModel && typeof (EditableItemModel as any).bindModelToInterface === 'function' && EditableItemModel) ||
    [PtdlInputIconFieldModel, Base].find((c: any) => c && typeof c.bindModelToInterface === 'function');
  try {
    (binder as any)?.bindModelToInterface('PtdlInputIconFieldModel', ICON_INTERFACES, { isDefault: false });
    if (!binder) console.warn('[field-enh] input-icon: no binder found');
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[field-enh] input-icon bind failed', e);
  }

  // Display variant (detail/table/list) — icon + text (read-only).
  bindDisplayField({
    flowEngine, Base, name: 'PtdlInputIconDisplayFieldModel', interfaces: ICON_INTERFACES,
    label: t('Input with icon'), flow: { ...inputIconFlow, key: 'ptdlInputIconDisplay' },
    render: (p: any, model: any) => {
      const cfg = cfgFromProps(p);
      const cf = model?.collectionField || model?.context?.collectionField;
      const isPassword = cf?.interface === 'password';
      const text = p.value == null ? '' : isPassword ? '••••••••' : String(p.value);
      const icon = cfg.icon ? <span style={{ display: 'inline-flex', lineHeight: 0, color: cfg.iconColor || 'inherit' }}><IconByKey type={cfg.icon} /></span> : null;
      if (!text && !icon) return <span style={{ color: '#bfbfbf' }}>-</span>;
      return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{icon}<span>{text}</span></span>;
    },
  });

  return PtdlInputIconFieldModel;
}

// Live preview — đọc cfg từ form.values, fieldTitle từ x-component-props.
const InputIconPreview: any = observer((props: any) => {
  const form: any = useForm();
  const cfg = cfgFromForm(form?.values || {});
  const placeholder = computePlaceholder(cfg, props.fieldTitle) || props.fieldTitle || 'Placeholder';
  return (
    <div style={{ padding: '10px 12px', background: 'var(--colorFillQuaternary, #fafafa)', borderRadius: 6, border: '1px dashed #d9d9d9' }}>
      <IconInput cfg={cfg} placeholder={placeholder} password={!!props.password} />
    </div>
  );
});
