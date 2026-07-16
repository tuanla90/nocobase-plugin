import React from 'react';
import { EditableItemModel } from '@nocobase/flow-engine';
import { Slider, Switch } from 'antd';
import { SegmentedGroup, ColorField, tagColorToHex, setIconRegistry, IconByKey, RegistryIconPicker, SettingsGrid, CollapsibleSection, fieldItem as fi, rx, visibleWhen, SEG_PROPS } from '@ptdl/shared';
import { observer, useForm } from '@formily/react';
import { bindDisplayField } from './displayBinding';

/**
 * No-code widget: field select/multi-select → dãy NÚT (thay dropdown). Bản plugin-hoá của snippet
 * runjs-select-buttons.js. Đăng ký như 1 "Field component" thay thế cho interface select/multipleSelect.
 *
 * Config = 1 mục "Button group settings" mở DIALOG (uiMode dialog + uiSchema hàm) — bố cục 2 cột gọn, có
 * LIVE PREVIEW (@formily/react observer/useForm) + ICON MAP (mỗi option 1 icon từ registry custom-icons,
 * KHÔNG cần CDN vì đây là plugin consumer). Component custom qua flowSettings.registerComponents (prefix Ptdl*).
 */


type Opt = { value: any; label?: any; color?: string };
type Settings = {
  colorMode: string; layout: string; allowDeselect: boolean; size: string; fullWidth: boolean;
  radius: number; fontSize: number; gap: number; monoColor: string; icons: Record<string, string>;
  // 'buttons' = dãy nút (mọi option); 'single' = chỉ hiện GIÁ TRỊ ĐANG CHỌN như 1 tag màu (như conditional-format),
  // chỉ áp cho lúc HIỂN THỊ (readPretty/detail/table); form edit vẫn là nút để bấm chọn.
  display: string;
};

function resolveOptions(model: any): Opt[] {
  const p = model?.props || {};
  if (Array.isArray(p.options) && p.options.length) return p.options;
  const cf = model?.collectionField || model?.context?.collectionField;
  const en = cf?.enum || cf?.uiSchema?.enum;
  return Array.isArray(en) ? en : [];
}
function isMultiField(model: any): boolean {
  const cf = model?.collectionField || model?.context?.collectionField;
  if (cf?.interface === 'multipleSelect') return true;
  if (Array.isArray(model?.props?.value)) return true;
  return false;
}
function settingsFromProps(p: any): Settings {
  return {
    colorMode: p.ptdlColorMode || 'colorful',
    layout: p.ptdlLayout || 'separated',
    allowDeselect: p.ptdlAllowDeselect !== false,
    size: p.ptdlSize || 'default',
    fullWidth: p.ptdlFullWidth === true,
    radius: typeof p.ptdlRadius === 'number' ? p.ptdlRadius : 4,
    fontSize: typeof p.ptdlFontSize === 'number' ? p.ptdlFontSize : 0,
    gap: typeof p.ptdlGap === 'number' ? p.ptdlGap : 6,
    monoColor: p.ptdlMonoColor || '',
    icons: p.ptdlIcons || {},
    display: p.ptdlDisplay || 'buttons',
  };
}
function settingsFromForm(v: any): Settings {
  return {
    colorMode: v?.colorMode || 'colorful',
    layout: v?.layout || 'separated',
    allowDeselect: v?.allowDeselect !== false,
    size: v?.size || 'default',
    fullWidth: !!v?.fullWidth,
    radius: typeof v?.radius === 'number' ? v.radius : 4,
    fontSize: typeof v?.fontSize === 'number' ? v.fontSize : 0,
    gap: typeof v?.gap === 'number' ? v.gap : 6,
    monoColor: v?.monoColor || '',
    icons: v?.icons || {},
    display: v?.display || 'buttons',
  };
}

// Presentational — dùng CHUNG cho model.render() lẫn preview.
function ButtonGroupView({
  options, isMulti, value, settings, onPick, canEdit,
}: {
  options: Opt[]; isMulti: boolean; value: any; settings: Settings; onPick?: (opt: Opt) => void; canEdit: boolean;
}) {
  if (!options.length) return <span style={{ color: '#bfbfbf' }}>No options</span>;
  const { colorMode, layout, size, icons, fullWidth } = settings;
  const radius = settings.radius >= 24 ? 999 : settings.radius;
  const fontSize = settings.fontSize > 0 ? settings.fontSize : size === 'small' ? 12 : 13;
  const gap = settings.gap;
  const monoColor = settings.monoColor || 'var(--colorPrimaryTextActive, #1677ff)';
  const selected = new Set(isMulti ? (Array.isArray(value) ? value : value != null ? [value] : []) : value != null ? [value] : []);
  const colorFor = (opt: Opt) => (colorMode === 'mono' ? monoColor : tagColorToHex(opt.color));
  const pad = size === 'small' ? '2px 10px' : '4px 14px';
  // Control-height convention across @ptdl: antd controlHeight = 32 (small = 24). Enforce a minHeight
  // so short labels don't render a puny (~28px) pill next to real 32px controls.
  const minH = size === 'small' ? 24 : 32;
  const cursor = canEdit ? 'pointer' : 'default';

  // Single-value display: chỉ khi HIỂN THỊ (không cho sửa). Render option đang chọn thành 1 tag màu (filled) —
  // giống pill của conditional-format. Multi → nhiều tag. Không chọn gì → gạch mờ.
  if (settings.display === 'single' && !canEdit) {
    const sel = options.filter((o) => selected.has(o.value));
    if (!sel.length) return <span style={{ color: '#bfbfbf' }}>—</span>;
    const tagPad = size === 'small' ? '2px 10px' : '3px 12px';
    return (
      <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap, alignItems: 'center' }}>
        {sel.map((opt) => {
          const color = colorFor(opt);
          const iconKey = icons?.[String(opt.value)];
          return (
            <span key={String(opt.value)} style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, background: color, color: '#fff',
              borderRadius: radius, padding: tagPad, fontSize, lineHeight: 1.5, minHeight: minH, boxSizing: 'border-box',
            }}>
              {iconKey ? <span style={{ display: 'inline-flex', lineHeight: 0 }}><IconByKey type={iconKey} /></span> : null}
              <span>{opt.label ?? opt.value}</span>
            </span>
          );
        })}
      </span>
    );
  }

  const buttons = options.map((opt) => {
    const active = selected.has(opt.value);
    const color = colorFor(opt);
    const iconKey = icons?.[String(opt.value)];
    let style: React.CSSProperties;
    if (layout === 'joined') {
      const c = active ? color : '#8c8c8c';
      style = {
        padding: pad, fontSize, border: 'none', borderRadius: radius, lineHeight: 1.4,
        fontWeight: active ? 500 : 400, cursor, transition: 'all .15s',
        background: active ? '#fff' : 'transparent', color: c,
        boxShadow: active ? '0 1px 2px rgba(0,0,0,.08)' : 'none',
      };
    } else {
      const base: React.CSSProperties = active
        ? { background: color, borderColor: color, color: '#fff' }
        : colorMode === 'mono'
          ? { background: '#fff', borderColor: '#d9d9d9', color: '#595959' }
          : { background: '#fff', borderColor: `${color}88`, color };
      style = {
        padding: pad, fontSize, borderWidth: 1, borderStyle: 'solid', borderRadius: radius,
        lineHeight: 1.4, fontWeight: active ? 500 : 400, cursor, transition: 'all .15s', ...base,
      };
    }
    // Full width: mỗi nút flex đều nhau, chữ căn giữa.
    const fw: React.CSSProperties = fullWidth ? { flex: '1 1 0', minWidth: 0, justifyContent: 'center' } : {};
    return (
      <button key={String(opt.value)} type="button" disabled={!canEdit} onClick={() => onPick?.(opt)}
        style={{ ...style, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, minHeight: minH, boxSizing: 'border-box', ...fw }}>
        {iconKey ? <span style={{ display: 'inline-flex', lineHeight: 0 }}><IconByKey type={iconKey} /></span> : null}
        <span>{opt.label ?? opt.value}</span>
      </button>
    );
  });

  const base: React.CSSProperties =
    layout === 'joined'
      ? { alignItems: 'center', gap: 2, background: '#f0f0f0', padding: 2, borderRadius: radius + 2 }
      : { flexWrap: fullWidth ? 'nowrap' : 'wrap', alignItems: 'center', gap };
  // Full width: khối flex 100% để các nút chia đều; ngược lại inline-flex ôm nội dung.
  const wrapStyle: React.CSSProperties = fullWidth
    ? { display: 'flex', width: '100%', ...base }
    : { display: 'inline-flex', ...base };

  return <span style={wrapStyle}>{buttons}</span>;
}

// ---- Settings components ------------------------------------------------------------------------
const SegPicker = (props: any) => (
  <SegmentedGroup {...SEG_PROPS} value={props.value ?? props.defaultValue} onChange={(v: any) => props.onChange?.(v)} options={props.options || []} />
);
const PxSlider = (props: any) => {
  const min = props.min ?? 0, max = props.max ?? 24, unit = props.unit ?? 'px';
  const v = typeof props.value === 'number' ? props.value : props.defaultValue ?? min;
  const label = v <= min && props.zeroLabel ? props.zeroLabel : v >= max && props.maxLabel ? props.maxLabel : `${v}${unit}`;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 180 }}>
      <Slider min={min} max={max} value={v} onChange={(n: any) => props.onChange?.(n)} style={{ flex: 1 }} />
      <span style={{ width: 48, textAlign: 'right', color: '#888', fontVariantNumeric: 'tabular-nums' }}>{label}</span>
    </div>
  );
};
const BoolSwitch = (props: any) => (
  <Switch checked={!!props.value} onChange={(c: any) => props.onChange?.(c)} />
);

// Icon map: 1 field, value = { [String(optValue)]: iconKey }. Tự quản N picker theo options (từ x-component-props).
const PtdlIconMap = (props: any) => {
  const options: Opt[] = Array.isArray(props.options) ? props.options : [];
  const value: Record<string, string> = props.value || {};
  if (!options.length) return <span style={{ color: '#bbb' }}>No options</span>;
  const set = (k: string, iconKey?: string) => {
    const next = { ...value };
    if (iconKey) next[k] = iconKey;
    else delete next[k];
    props.onChange?.(next);
  };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '4px 10px', alignItems: 'center' }}>
      {options.map((opt) => {
        const key = String(opt.value);
        return (
          <React.Fragment key={key}>
            <span style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {opt.label ?? opt.value}
            </span>
            <RegistryIconPicker value={value[key]} onChange={(k: string) => set(key, k)} />
          </React.Fragment>
        );
      })}
    </div>
  );
};

export function registerSelectButtonsModel(deps: {
  flowEngine: any;
  flowSettings?: any;
  Base: any;
  tExpr?: (s: string, o?: any) => any;
  Icon?: any;
  icons?: Map<string, any>;
}) {
  const { flowEngine, flowSettings, Base } = deps;
  if (!flowEngine || !Base) {
    // eslint-disable-next-line no-console
    console.warn('[field-enh] select-buttons: missing flowEngine/Base — skip');
    return;
  }
  setIconRegistry(deps.Icon, deps.icons);
  const t = (s: string) => (deps.tExpr ? deps.tExpr(s, { ns: 'field-enhancements' }) : s);

  if (flowSettings?.registerComponents) {
    try {
      flowSettings.registerComponents({
        PtdlGrid: SettingsGrid, CollapsibleSection, PtdlSeg: SegPicker, PtdlPxSlider: PxSlider, PtdlColorField: ColorField,
        PtdlBoolSwitch: BoolSwitch, PtdlIconMap, PtdlPreview,
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[field-enh] select-buttons registerComponents failed', e);
    }
  }

  class PtdlSelectButtonsFieldModel extends Base {
    render() {
      const model: any = this;
      const p = model.props || {};
      const options = resolveOptions(model);
      const isMulti = isMultiField(model);
      const canEdit = p.pattern !== 'readPretty' && !p.disabled && typeof p.onChange === 'function';
      const settings = settingsFromProps(p);
      const raw = p.value;
      const onPick = (opt: Opt) => {
        if (!canEdit) return;
        if (isMulti) {
          const cur = Array.isArray(raw) ? [...raw] : [];
          const i = cur.findIndex((v) => v === opt.value);
          if (i >= 0) cur.splice(i, 1); else cur.push(opt.value);
          p.onChange(cur);
        } else {
          p.onChange(raw === opt.value && settings.allowDeselect ? null : opt.value);
        }
      };
      return <ButtonGroupView options={options} isMulti={isMulti} value={raw} settings={settings} onPick={onPick} canEdit={canEdit} />;
    }
  }

  flowEngine.registerModels({ PtdlSelectButtonsFieldModel });
  try { (PtdlSelectButtonsFieldModel as any).define?.({ label: t('Button group') }); } catch (_) { /* optional */ }

  const selectButtonsFlow: any = {
      key: 'ptdlSelectButtons',
      sort: 800,
      title: t('Button group'),
      steps: {
        settings: {
          title: t('Button group settings'),
          uiMode: { type: 'dialog', props: { width: 600 } },
          uiSchema: (ctx: any) => {
            const options = resolveOptions(ctx?.model);
            const isMulti = isMultiField(ctx?.model);
            return {
              preview: {
                type: 'void', title: t('Preview'),
                'x-decorator': 'FormItem', 'x-decorator-props': { style: { marginBottom: 8 } },
                'x-component': 'PtdlPreview', 'x-component-props': { options, isMulti },
              },
              display: fi(t('Display'), 'PtdlSeg', {
                componentProps: { options: [{ label: t('Button group'), value: 'buttons' }, { label: t('Single tag'), value: 'single' }] },
              }),
              row1: {
                type: 'void', 'x-component': 'PtdlGrid', 'x-component-props': { minColWidth: 160 },
                properties: {
                  layout: fi(t('Layout'), 'PtdlSeg', {
                    componentProps: { options: [{ label: t('Separated'), value: 'separated' }, { label: t('Joined'), value: 'joined' }] },
                    reactions: rx((v: any) => v.display !== 'single'),
                  }),
                  colorMode: fi(t('Color mode'), 'PtdlSeg', { componentProps: { options: [{ label: t('Colorful'), value: 'colorful' }, { label: t('Mono'), value: 'mono' }] } }),
                  size: fi(t('Size'), 'PtdlSeg', { componentProps: { options: [{ label: t('Small'), value: 'small' }, { label: t('Default'), value: 'default' }] } }),
                  allowDeselect: fi(t('Allow deselect'), 'PtdlBoolSwitch', {
                    type: 'boolean',
                    reactions: rx((v: any) => v.display !== 'single'),
                  }),
                  fullWidth: fi(t('Full width (equal columns)'), 'PtdlBoolSwitch', {
                    type: 'boolean',
                    reactions: rx((v: any) => v.display !== 'single'),
                  }),
                },
              },
              monoColor: fi(t('Mono color'), 'PtdlColorField', {
                reactions: visibleWhen('colorMode', 'mono'),
              }),
              styleSection: {
                type: 'void', 'x-component': 'CollapsibleSection', 'x-component-props': { title: t('Style') },
                properties: {
                  row2: {
                    type: 'void', 'x-component': 'PtdlGrid', 'x-component-props': { minColWidth: 180 },
                    properties: {
                      fontSize: fi(t('Font size'), 'PtdlPxSlider', { type: 'number', componentProps: { min: 0, max: 24, zeroLabel: 'Auto' } }),
                      radius: fi(t('Corner radius'), 'PtdlPxSlider', { type: 'number', componentProps: { min: 0, max: 24, maxLabel: 'Pill' } }),
                    },
                  },
                  gap: fi(t('Gap'), 'PtdlPxSlider', {
                    type: 'number', componentProps: { min: 0, max: 20 },
                    reactions: rx((v: any) => v.layout === 'separated'),
                  }),
                },
              },
              iconsSection: {
                type: 'void', 'x-component': 'CollapsibleSection', 'x-component-props': { title: t('Icons') },
                properties: {
                  icons: fi(t('Icon per option'), 'PtdlIconMap', { type: 'object', componentProps: { options } }),
                },
              },
            };
          },
          defaultParams: {
            display: 'buttons',
            layout: 'separated', colorMode: 'colorful', monoColor: '', size: 'default',
            fontSize: 0, radius: 4, gap: 6, allowDeselect: true, fullWidth: false, icons: {},
          },
          handler(ctx: any, params: any) {
            const p = params || {};
            ctx.model.setProps({
              ptdlDisplay: p.display || 'buttons',
              ptdlLayout: p.layout || 'separated',
              ptdlColorMode: p.colorMode || 'colorful',
              ptdlMonoColor: p.monoColor || '',
              ptdlSize: p.size || 'default',
              ptdlFontSize: typeof p.fontSize === 'number' ? p.fontSize : 0,
              ptdlRadius: typeof p.radius === 'number' ? p.radius : 4,
              ptdlGap: typeof p.gap === 'number' ? p.gap : 6,
              ptdlAllowDeselect: p.allowDeselect !== false,
              ptdlFullWidth: !!p.fullWidth,
              ptdlIcons: p.icons || {},
            });
          },
        },
      },
  };
  try {
    (PtdlSelectButtonsFieldModel as any).registerFlow(selectButtonsFlow);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[field-enh] select-buttons registerFlow failed', e);
  }

  const binder =
    (EditableItemModel && typeof (EditableItemModel as any).bindModelToInterface === 'function' && EditableItemModel) ||
    [PtdlSelectButtonsFieldModel, Base].find((c: any) => c && typeof c.bindModelToInterface === 'function');
  try {
    (binder as any)?.bindModelToInterface('PtdlSelectButtonsFieldModel', ['select', 'multipleSelect'], { isDefault: false });
    if (!binder) console.warn('[field-enh] select-buttons: no binder found');
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[field-enh] select-buttons bind failed', e);
  }

  // Display variant (detail/table/list) — nút không bấm được (chỉ hiển thị lựa chọn).
  bindDisplayField({
    flowEngine, Base, name: 'PtdlSelectButtonsDisplayFieldModel', interfaces: ['select', 'multipleSelect'],
    label: t('Button group'), flow: { ...selectButtonsFlow, key: 'ptdlSelectButtonsDisplay' },
    render: (p: any, model: any) => {
      const options = resolveOptions(model);
      const isMulti = isMultiField(model);
      const settings = settingsFromProps(p);
      return <ButtonGroupView options={options} isMulti={isMulti} value={p.value} settings={settings} onPick={() => {}} canEdit={false} />;
    },
  });

  return PtdlSelectButtonsFieldModel;
}

// Live preview — đọc settings từ form.values, options/isMulti từ x-component-props.
const PtdlPreview: any = observer((props: any) => {
  const form: any = useForm();
  const options: Opt[] = Array.isArray(props.options) && props.options.length
    ? props.options
    : [{ value: 'a', label: 'Option A', color: 'blue' }, { value: 'b', label: 'Option B', color: 'green' }, { value: 'c', label: 'Option C', color: 'gold' }];
  const isMulti = !!props.isMulti;
  const settings = settingsFromForm(form?.values || {});
  const [sel, setSel] = React.useState<any>(isMulti ? [options[0]?.value] : options[0]?.value);
  const onPick = (opt: Opt) => {
    if (isMulti) {
      const cur = Array.isArray(sel) ? [...sel] : [];
      const i = cur.indexOf(opt.value);
      if (i >= 0) cur.splice(i, 1); else cur.push(opt.value);
      setSel(cur);
    } else {
      setSel(sel === opt.value && settings.allowDeselect ? null : opt.value);
    }
  };
  return (
    <div style={{ padding: '10px 12px', background: 'var(--colorFillQuaternary, #fafafa)', borderRadius: 6, border: '1px dashed #d9d9d9' }}>
      <ButtonGroupView options={options} isMulti={isMulti} value={sel} settings={settings} onPick={onPick} canEdit />
      {settings.display === 'single' ? (
        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: '#999' }}>{'Hiển thị:'}</span>
          <ButtonGroupView options={options} isMulti={isMulti} value={sel} settings={settings} onPick={() => {}} canEdit={false} />
        </div>
      ) : null}
    </div>
  );
});
