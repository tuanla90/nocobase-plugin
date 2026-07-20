import React, { useState } from 'react';
import { EditableItemModel } from '@nocobase/flow-engine';
import { Input, Button, Switch, message } from 'antd';
import { SettingsGrid, fi, ResetButton, CollapsibleSection, registerFlowComponentsOnce } from '@tuanla90/shared';
import { ScanModal } from './scanModal';
import { te, t } from './i18n';

/**
 * A1 — Scan-input field widget. A normal text/number input with a 📷 button that opens the QR/barcode
 * scanner; the decoded value is (optionally regex-transformed) written into the field. Can auto-submit
 * the form right after a successful scan. Bound to text-ish interfaces as a non-default Field component.
 */

const SQ_DEFAULTS = {
  beep: true,
  vibrate: true,
  regex: '',       // optional extract/replace pattern
  replace: '',     // replacement; empty = use first capture group / whole match
  autoSubmit: false,
};
type SQCfg = typeof SQ_DEFAULTS;

function sqcfgFromProps(p: any): SQCfg {
  return {
    beep: p.ptdlsqBeep !== false,
    vibrate: p.ptdlsqVibrate !== false,
    regex: p.ptdlsqRegex || '',
    replace: p.ptdlsqReplace || '',
    autoSubmit: !!p.ptdlsqAutoSubmit,
  };
}

/** Apply the optional regex transform to a raw scan. */
function transform(raw: string, cfg: SQCfg): string {
  if (!cfg.regex) return raw;
  try {
    const re = new RegExp(cfg.regex);
    if (cfg.replace) return raw.replace(new RegExp(cfg.regex, 'g'), cfg.replace);
    const m = raw.match(re);
    if (m) return m[1] != null ? m[1] : m[0];
    return raw;
  } catch (_) { return raw; }
}

/** Walk up to the nearest form block model and submit it. */
function submitParentForm(model: any) {
  let n = model;
  for (let i = 0; i < 12 && n; i++) {
    if (typeof n.submit === 'function' && (n.constructor?.name || '').includes('FormModel')) {
      try { n.submit(); return; } catch (_) { /* ignore */ }
    }
    n = n.parent;
  }
}

const ScanInputView: React.FC<{ model: any; cfg: SQCfg; value?: any; onChange?: (v: any) => void; disabled?: boolean }> = ({ model, cfg, value, onChange, disabled }) => {
  const [open, setOpen] = useState(false);
  const onDecode = (textVal: string) => {
    const v = transform(textVal, cfg);
    onChange?.(v);
    setOpen(false);
    message.success(t('Đã quét: {{v}}').replace('{{v}}', v));
    if (cfg.autoSubmit) setTimeout(() => submitParentForm(model), 60);
  };
  return (
    <span style={{ display: 'inline-flex', width: '100%', maxWidth: 360 }}>
      <Input
        value={value ?? ''}
        onChange={(e) => onChange?.(e.target.value)}
        disabled={disabled}
        allowClear
        addonAfter={
          <span style={{ cursor: disabled ? 'default' : 'pointer', userSelect: 'none' }} onClick={() => !disabled && setOpen(true)} title={t('Quét mã')}>📷</span>
        }
      />
      <ScanModal open={open} onClose={() => setOpen(false)} onDecode={onDecode} beep={cfg.beep} vibrate={cfg.vibrate} title={t('Quét mã')} />
    </span>
  );
};

const SQ_Switch = (props: any) => <Switch checked={!!props.value} onChange={(c: any) => props.onChange?.(c)} />;
const SQ_Text = (props: any) => <Input value={props.value} onChange={(e: any) => props.onChange?.(e.target.value)} placeholder={props.placeholder} />;

export function registerScanInputModel(deps: { flowEngine: any; flowSettings?: any; Base: any }) {
  const { flowEngine, flowSettings, Base } = deps;
  if (!flowEngine || !Base) { console.warn('[device-kit] scan-input: missing flowEngine/Base'); return; }

  if (flowSettings?.registerComponents) {
    try { registerFlowComponentsOnce(flowSettings, { SQ_Grid: SettingsGrid, SQ_Switch, SQ_Text, SQ_Reset: ResetButton, SQ_Section: CollapsibleSection }); }
    catch (e) { console.warn('[device-kit] scan-input registerComponents failed', e); }
  }

  class PtdlScanInputFieldModel extends Base {
    render() {
      const model: any = this;
      const p = model.props || {};
      const readPretty = p.pattern === 'readPretty';
      if (readPretty) return <span>{p.value == null || p.value === '' ? '' : String(p.value)}</span>;
      return <ScanInputView model={model} cfg={sqcfgFromProps(p)} value={p.value} onChange={(v: any) => p.onChange?.(v)} disabled={p.disabled} />;
    }
  }
  flowEngine.registerModels({ PtdlScanInputFieldModel });
  try { (PtdlScanInputFieldModel as any).define?.({ label: t('Quét mã (QR/Barcode)') }); } catch (_) { /* optional */ }

  try {
    (PtdlScanInputFieldModel as any).registerFlow({
      key: 'ptdlScanInput',
      sort: 830,
      title: te('Cấu hình quét mã'),
      steps: {
        settings: {
          title: te('Cấu hình quét mã'),
          uiMode: { type: 'dialog', props: { width: 520 } },
          uiSchema: () => ({
            row1: {
              type: 'void', 'x-component': 'SQ_Grid', 'x-component-props': { minColWidth: 150 },
              properties: {
                beep: fi(te('Bíp khi quét'), 'SQ_Switch', { type: 'boolean' }),
                vibrate: fi(te('Rung khi quét'), 'SQ_Switch', { type: 'boolean' }),
                autoSubmit: fi(te('Tự Lưu sau khi quét'), 'SQ_Switch', { type: 'boolean' }),
              },
            },
            adv: {
              type: 'void', 'x-component': 'SQ_Section', 'x-component-props': { title: te('Biến đổi kết quả (nâng cao)'), defaultOpen: false },
              properties: {
                regex: fi(te('Regex (cắt/lọc mã)'), 'SQ_Text', { componentProps: { placeholder: 'VD: ^PRD-(\\d+)$' } }),
                replace: fi(te('Thay thế (trống = lấy nhóm 1)'), 'SQ_Text', { componentProps: { placeholder: '$1' } }),
              },
            },
            reset: { type: 'void', 'x-component': 'SQ_Reset', 'x-component-props': { defaults: SQ_DEFAULTS, label: te('Đặt lại') }, 'x-decorator': 'FormItem' },
          }),
          defaultParams: { ...SQ_DEFAULTS },
          handler(ctx: any, params: any) {
            const p = params || {};
            ctx.model.setProps({
              ptdlsqBeep: p.beep !== false,
              ptdlsqVibrate: p.vibrate !== false,
              ptdlsqRegex: p.regex || '',
              ptdlsqReplace: p.replace || '',
              ptdlsqAutoSubmit: !!p.autoSubmit,
            });
          },
        },
      },
    });
  } catch (e) { console.warn('[device-kit] scan-input registerFlow failed', e); }

  const binder =
    (EditableItemModel && typeof (EditableItemModel as any).bindModelToInterface === 'function' && EditableItemModel) ||
    [PtdlScanInputFieldModel, Base].find((c: any) => c && typeof c.bindModelToInterface === 'function');
  try {
    (binder as any)?.bindModelToInterface('PtdlScanInputFieldModel', ['input', 'integer', 'number', 'uuid', 'nanoid', 'sequence'], { isDefault: false });
  } catch (e) { console.warn('[device-kit] scan-input bind failed', e); }

  console.log('[device-kit] scan-input widget registered');
  return PtdlScanInputFieldModel;
}
