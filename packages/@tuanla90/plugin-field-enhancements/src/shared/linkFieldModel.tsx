import React from 'react';
import { PreviewBox } from './previewBox';
import { EditableItemModel } from '@nocobase/flow-engine';
import { Input, Switch, InputNumber, Button, Space } from 'antd';
import { SegmentedGroup, ColorField, IconByKey, RegistryIconPicker, SettingsGrid, ResetButton, SEG_PROPS, fieldItem as fi, rx, registerFlowComponentsOnce } from '@tuanla90/shared';
import { observer, useForm } from '@formily/react';
import { bindDisplayField } from './displayBinding';

// Resolve a model's collectionField, walking up `.parent` — a SubTableColumnModel's column model (or an
// inner field-model rendered inside a form) doesn't always carry `collectionField` directly on itself;
// it can live on a parent (e.g. a FormItemModel). Walking `.parent` is the only real fix.
function resolveCf(model: any): any {
  for (let cur: any = model, i = 0; cur && i < 4; cur = cur.parent, i++) {
    if (cur?.collectionField) return cur.collectionField;
  }
  return null;
}

/**
 * No-code widget: field text (url/email/phone/input) → LINK bấm được + icon.
 * - Kind: url (mở https) | email (mailto:) | phone (tel:) | text (điều hướng nội bộ/href thô).
 * - Href template hỗ trợ `{{field}}` lấy từ record/form (vd `/admin/x?id={{id}}`); `{{value}}` = giá trị field.
 * - Open: tab mới (_blank) hoặc cùng tab. Icon từ registry (mặc định theo kind). Cắt text theo Max length.
 * Tham khảo snippet runjs link column (mailto/tel/https preset + stopPropagation + truncate).
 */

const KIND_ICON: Record<string, string> = { email: 'mailoutlined', phone: 'phoneoutlined', url: 'linkoutlined', text: 'linkoutlined' };

const L_DEFAULTS = {
  icon: undefined as string | undefined, kind: 'url', template: '',
  labelMode: 'value', customLabel: '', mailApp: 'gmail',
  openMode: 'blank', color: '#1677ff', underline: false, maxLen: 30,
};

type LCfg = {
  icon?: string; kind: string; template: string;
  labelMode: string; customLabel: string; mailApp: string;
  openMode: string; color: string; underline: boolean; maxLen: number;
};
function lcfgFromProps(p: any): LCfg {
  return {
    icon: p.ptdllIcon, kind: p.ptdllKind || 'url', template: p.ptdllTemplate || '',
    labelMode: p.ptdllLabelMode || 'value', customLabel: p.ptdllCustomLabel || '', mailApp: p.ptdllMailApp || 'gmail',
    openMode: p.ptdllOpenMode || 'blank', color: p.ptdllColor || '#1677ff',
    underline: !!p.ptdllUnderline, maxLen: typeof p.ptdllMaxLen === 'number' ? p.ptdllMaxLen : 30,
  };
}
function lcfgFromForm(v: any): LCfg {
  return {
    icon: v?.icon, kind: v?.kind || 'url', template: v?.template || '',
    labelMode: v?.labelMode || 'value', customLabel: v?.customLabel || '', mailApp: v?.mailApp || 'gmail',
    openMode: v?.openMode || 'blank', color: v?.color || '#1677ff',
    underline: !!v?.underline, maxLen: typeof v?.maxLen === 'number' ? v.maxLen : 30,
  };
}

// Thay {{field}}/{{field.sub}}/{{value}} (chuẩn; {field} cũ vẫn nhận) bằng giá trị form → record → field.
function interpolate(tpl: string, model: any, ownValue: any): string {
  const rec = model?.context?.record || {};
  const form = model?.context?.form;
  return String(tpl).replace(/\{\{?([\w.]+)\}\}?/g, (_m, key) => {
    if (key === 'value' || key === 'this') return ownValue == null ? '' : String(ownValue);
    let v: any;
    try { v = form?.getFieldValue?.(key); } catch (_) { /* ignore */ }
    if (v == null) v = String(key).split('.').reduce((o: any, k: string) => (o == null ? o : o[k]), rec);
    return v == null ? '' : String(v);
  });
}
function buildHref(cfg: LCfg, model: any, value: any): string {
  const base = cfg.template ? interpolate(cfg.template, model, value) : (value == null ? '' : String(value));
  const s = base.trim();
  if (!s) return '';
  if (cfg.kind === 'email') {
    const addr = s.replace(/^mailto:/i, '');
    // Gmail web compose (mở tab, không cần mail app desktop) hoặc mailto: chuẩn.
    if (cfg.mailApp === 'gmail') return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(addr)}`;
    return `mailto:${addr}`;
  }
  if (cfg.kind === 'phone') return s.startsWith('tel:') ? s : `tel:${s.replace(/[^\d+]/g, '')}`;
  if (cfg.kind === 'url') return /^https?:\/\//i.test(s) || s.startsWith('/') ? s : `https://${s}`;
  return s; // text/internal
}
function buildLabel(cfg: LCfg, model: any, value: any, fieldTitle?: string): string {
  let raw = '';
  if (cfg.labelMode === 'custom') raw = interpolate(cfg.customLabel || '', model, value);
  else if (cfg.labelMode === 'title') raw = fieldTitle || '';
  else raw = value == null ? '' : String(value);
  if (cfg.maxLen > 0 && raw.length > cfg.maxLen) return raw.slice(0, cfg.maxLen) + '…';
  return raw;
}

// IME-safe input (edit form) — cùng pattern InputFieldModel core.
function IMEInput(props: any) {
  const { value, onChange, ...rest } = props;
  const [inner, setInner] = React.useState<string>(value == null ? '' : String(value));
  React.useEffect(() => { setInner(value == null ? '' : String(value)); }, [value]);
  const ev = (e: any) => e.currentTarget.value;
  return (
    <Input
      {...rest}
      value={inner}
      onChange={(e: any) => { setInner(ev(e)); onChange?.(ev(e)); }}
      onCompositionStart={(e: any) => setInner(ev(e))}
      onCompositionEnd={(e: any) => { setInner(ev(e)); onChange?.(ev(e)); }}
    />
  );
}

// Render link (readPretty + preview). fullValue cho title/tooltip.
function LinkView({ cfg, model, value, fieldTitle }: { cfg: LCfg; model?: any; value?: any; fieldTitle?: string }) {
  const href = buildHref(cfg, model, value);
  const label = buildLabel(cfg, model, value, fieldTitle);
  const iconKey = cfg.icon || KIND_ICON[cfg.kind];
  const icon = iconKey ? <span style={{ display: 'inline-flex', lineHeight: 0 }}><IconByKey type={iconKey} /></span> : null;
  const inner = <>{icon}<span style={{ lineHeight: 'normal' }}>{label || (href ? href : '')}</span></>;
  if (!href && !label) return <span style={{ color: '#bfbfbf' }}>-</span>;
  if (!href) return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>{inner}</span>;
  const target = cfg.openMode === 'self' ? '_self' : '_blank';
  return (
    <a
      href={href}
      target={target}
      rel={target === '_blank' ? 'noopener noreferrer' : undefined}
      title={value == null ? undefined : String(value)}
      onClick={(e: any) => { e.stopPropagation(); }}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: cfg.color || undefined, textDecoration: cfg.underline ? 'underline' : 'none', lineHeight: 0 }}
    >
      {inner}
    </a>
  );
}

// Editable — nhập value + nút mở link (test) ở suffix. Giữ state cục bộ để href luôn khớp giá trị đang gõ.
function LinkEdit({ cfg, model, value, onChange, disabled, placeholder }: { cfg: LCfg; model?: any; value?: any; onChange?: (v: any) => void; disabled?: boolean; placeholder?: string }) {
  const [val, setVal] = React.useState<string>(value == null ? '' : String(value));
  React.useEffect(() => { setVal(value == null ? '' : String(value)); }, [value]);
  const iconKey = cfg.icon || KIND_ICON[cfg.kind];
  const prefix = iconKey ? <span style={{ display: 'inline-flex', lineHeight: 0, color: '#8c8c8c' }}><IconByKey type={iconKey} /></span> : undefined;
  // href từ template; nếu rỗng (template lỗi/không có) fallback dùng chính giá trị đang gõ.
  const href = buildHref(cfg, model, val) || buildHref({ ...cfg, template: '' }, model, val);
  const openLink = (e: any) => {
    e.preventDefault();
    e.stopPropagation();
    if (!href) return;
    // mailto:/tel: → dùng location (window.open không mở được protocol → tab trống). Same tab cũng dùng location.
    const isProto = /^(mailto:|tel:)/i.test(href);
    if (cfg.openMode === 'self' || isProto) { window.location.href = href; return; }
    const w = window.open(href, '_blank');
    if (w) { try { w.opener = null; } catch (_) { /* ignore */ } }
  };
  return (
    <Space.Compact style={{ width: '100%' }}>
      <IMEInput
        value={val}
        onChange={(v: any) => { setVal(v == null ? '' : String(v)); onChange?.(v); }}
        disabled={disabled} placeholder={placeholder} prefix={prefix} allowClear
      />
      <Button
        onClick={openLink}
        disabled={disabled || !href}
        title={href || undefined}
        icon={<IconByKey type="exportoutlined" />}
      />
    </Space.Compact>
  );
}

// ---- settings components (L_*) -----------------------------------------------------------------
const L_Seg = (props: any) => (
  <SegmentedGroup {...SEG_PROPS} value={props.value ?? props.defaultValue} onChange={(v: any) => props.onChange?.(v)} options={props.options || []} />
);
const L_Switch = (props: any) => <Switch checked={!!props.value} onChange={(c: any) => props.onChange?.(c)} />;
const L_Num = (props: any) => (
  <InputNumber value={props.value} min={0} onChange={(v: any) => props.onChange?.(v)} style={{ width: '100%' }} />
);
export function registerLinkFieldModel(deps: {
  flowEngine: any; flowSettings?: any; Base: any; tExpr?: (s: string, o?: any) => any;
}) {
  const { flowEngine, flowSettings, Base } = deps;
  if (!flowEngine || !Base) {
    // eslint-disable-next-line no-console
    console.warn('[field-enh] link: missing flowEngine/Base — skip');
    return;
  }
  const t = (s: string) => (deps.tExpr ? deps.tExpr(s, { ns: 'field-enhancements' }) : s);

  if (flowSettings?.registerComponents) {
    try {
      registerFlowComponentsOnce(flowSettings, {
        L_Grid: SettingsGrid, L_Seg, L_Switch, L_Num, L_Color: ColorField, L_Reset: ResetButton, L_IconField: RegistryIconPicker, L_Preview: LinkPreview,
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[field-enh] link registerComponents failed', e);
    }
  }

  class PtdlLinkFieldModel extends Base {
    render() {
      const model: any = this;
      const p = model.props || {};
      const cfg = lcfgFromProps(p);
      const cf = resolveCf(model);
      if (p.pattern === 'readPretty') {
        return <LinkView cfg={cfg} model={model} value={p.value} fieldTitle={cf?.title} />;
      }
      return <LinkEdit cfg={cfg} model={model} value={p.value} onChange={(v: any) => p.onChange?.(v)} disabled={p.disabled} placeholder={cf?.title} />;
    }
  }

  flowEngine.registerModels({ PtdlLinkFieldModel });
  try { (PtdlLinkFieldModel as any).define?.({ label: t('Link') }); } catch (_) { /* optional */ }

  const linkFlow: any = {
      key: 'ptdlLink',
      sort: 800,
      title: t('Link'),
      steps: {
        settings: {
          title: t('Link settings'),
          uiMode: { type: 'dialog', props: { width: 600 } },
          uiSchema: () => ({
            preview: {
              type: 'void', title: t('Preview'),
              'x-decorator': 'FormItem', 'x-decorator-props': { style: { marginBottom: 8 } },
              'x-component': 'L_Preview',
            },
            row1: {
              type: 'void', 'x-component': 'L_Grid',
              'x-component-props': { style: { gridTemplateColumns: 'auto 1fr auto', alignItems: 'end', gap: '0 12px' } },
              properties: {
                icon: fi(t('Icon (empty = by kind)'), 'L_IconField'),
                kind: fi(t('Kind'), 'L_Seg', {
                  componentProps: { options: [
                    { label: 'URL', value: 'url' },
                    { label: t('Email'), value: 'email' },
                    { label: t('Phone'), value: 'phone' },
                    { label: t('Text'), value: 'text' },
                  ] },
                }),
                reset: {
                  type: 'void', 'x-component': 'L_Reset', 'x-component-props': { defaults: L_DEFAULTS, label: t('Reset') },
                  'x-decorator': 'FormItem', 'x-decorator-props': { style: { marginBottom: 6, alignSelf: 'end' } },
                },
              },
            },
            template: fi(t('Href template (empty = field value; {{field}}, {{value}})'), 'Input', {
              componentProps: { placeholder: '/admin/orders?customer={{id}}' },
            }),
            row2: {
              type: 'void', 'x-component': 'L_Grid',
              'x-component-props': { minColWidth: 180 },
              properties: {
                labelMode: fi(t('Label'), 'L_Seg', {
                  componentProps: { options: [
                    { label: t('Field value'), value: 'value' },
                    { label: t('Field title'), value: 'title' },
                    { label: t('Custom'), value: 'custom' },
                  ] },
                }),
                openMode: fi(t('Open'), 'L_Seg', {
                  componentProps: { options: [
                    { label: t('New tab'), value: 'blank' },
                    { label: t('Same tab'), value: 'self' },
                  ] },
                }),
              },
            },
            customLabel: fi(t('Custom label ({{field}}, {{value}})'), 'Input', {
              componentProps: { placeholder: 'Open #{{id}}' },
              reactions: rx((v: any) => v.labelMode === 'custom'),
            }),
            mailApp: fi(t('Email opens with'), 'L_Seg', {
              componentProps: { options: [{ label: t('Gmail web'), value: 'gmail' }, { label: t('Mail app (mailto:)'), value: 'mailto' }] },
              reactions: rx((v: any) => v.kind === 'email'),
            }),
            row3: {
              type: 'void', 'x-component': 'L_Grid',
              'x-component-props': { minColWidth: 150 },
              properties: {
                color: fi(t('Color'), 'L_Color'),
                underline: fi(t('Underline'), 'L_Switch', { type: 'boolean' }),
                maxLen: fi(t('Max length (0 = off)'), 'L_Num', { type: 'number' }),
              },
            },
          }),
          defaultParams: { ...L_DEFAULTS },
          handler(ctx: any, params: any) {
            const p = params || {};
            ctx.model.setProps({
              ptdllIcon: p.icon || undefined,
              ptdllKind: p.kind || 'url',
              ptdllTemplate: p.template || '',
              ptdllLabelMode: p.labelMode || 'value',
              ptdllCustomLabel: p.customLabel || '',
              ptdllMailApp: p.mailApp || 'gmail',
              ptdllOpenMode: p.openMode || 'blank',
              ptdllColor: p.color || '#1677ff',
              ptdllUnderline: !!p.underline,
              ptdllMaxLen: typeof p.maxLen === 'number' ? p.maxLen : 30,
            });
          },
        },
      },
  };
  try {
    (PtdlLinkFieldModel as any).registerFlow(linkFlow);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[field-enh] link registerFlow failed', e);
  }

  const binder =
    (EditableItemModel && typeof (EditableItemModel as any).bindModelToInterface === 'function' && EditableItemModel) ||
    [PtdlLinkFieldModel, Base].find((c: any) => c && typeof c.bindModelToInterface === 'function');
  try {
    (binder as any)?.bindModelToInterface('PtdlLinkFieldModel', ['url', 'email', 'phone', 'input'], { isDefault: false });
    if (!binder) console.warn('[field-enh] link: no binder found');
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[field-enh] link bind failed', e);
  }

  // Display variant (detail/table/list) — link bấm được, không phải ô nhập.
  bindDisplayField({
    flowEngine, Base, name: 'PtdlLinkDisplayFieldModel', interfaces: ['url', 'email', 'phone', 'input'],
    label: t('Link'), flow: { ...linkFlow, key: 'ptdlLinkDisplay' },
    render: (p: any, model: any) => {
      const cf = resolveCf(model);
      return <LinkView cfg={lcfgFromProps(p)} model={model} value={p.value} fieldTitle={cf?.title} />;
    },
  });

  return PtdlLinkFieldModel;
}

// Preview — không có record thật; dùng value mẫu theo kind, template hiển thị nguyên văn (không có {{field}}).
const LinkPreview: any = observer(() => {
  const form: any = useForm();
  const cfg = lcfgFromForm(form?.values || {});
  const sample = cfg.kind === 'email' ? 'user@company.com' : cfg.kind === 'phone' ? '+84 912 345 678' : cfg.kind === 'url' ? 'example.com/page' : 'Sample text';
  return (
    <PreviewBox>
      <LinkView cfg={cfg} value={sample} fieldTitle="Field title" />
    </PreviewBox>
  );
});
