import React from 'react';
import { DisplayItemModel } from '@nocobase/flow-engine';
import { QRCode, Input, Slider, Segmented } from 'antd';
import { SettingsGrid, fi, ResetButton, SEG_PROPS } from '@ptdl/shared';
import { te, t } from './i18n';

/**
 * A3 — QR display widget. Renders the field value (or a {{field}} template, e.g. a deep-link URL) as a
 * QR code using antd's built-in <QRCode> (zero extra bundle). Handy for asset tags / tickets printed
 * via print-template then scanned back with A1/A2. Display-only, non-default Field component.
 */

const Q_DEFAULTS = {
  size: 96,
  level: 'M' as 'L' | 'M' | 'Q' | 'H',
  template: '', // optional; {{path}} tokens resolved from the record. empty = the field's own value
};
type QCfg = typeof Q_DEFAULTS;

function qcfgFromProps(p: any): QCfg {
  return {
    size: typeof p.ptdlqSize === 'number' ? p.ptdlqSize : 96,
    level: (['L', 'M', 'Q', 'H'].includes(p.ptdlqLevel) ? p.ptdlqLevel : 'M'),
    template: p.ptdlqTemplate || '',
  };
}

function getPath(obj: any, path: string): any {
  if (!obj || !path) return undefined;
  return path.split('.').reduce((a: any, k: string) => (a == null ? undefined : a[k]), obj);
}

function resolveValue(cfg: QCfg, value: any, record: any): string {
  if (cfg.template) {
    return cfg.template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, p) => {
      const v = getPath(record || {}, p);
      return v == null ? '' : String(v);
    });
  }
  return value == null ? '' : String(value);
}

const QrView: React.FC<{ cfg: QCfg; value?: any; record?: any }> = ({ cfg, value, record }) => {
  const text = resolveValue(cfg, value, record);
  if (!text) return <span style={{ color: '#bfbfbf' }}>—</span>;
  return <QRCode value={text} size={cfg.size} errorLevel={cfg.level} bordered={false} style={{ padding: 0 }} />;
};

const Q_Size = (props: any) => {
  const v = typeof props.value === 'number' ? props.value : 96;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 140 }}>
      <Slider min={48} max={220} step={4} value={v} onChange={(n: any) => props.onChange?.(n)} style={{ flex: 1 }} />
      <span style={{ width: 44, textAlign: 'right', color: '#888' }}>{v}px</span>
    </div>
  );
};
const Q_Level = (props: any) => (
  <Segmented {...SEG_PROPS} value={props.value || 'M'} onChange={(v: any) => props.onChange?.(v)}
    options={[{ label: 'L', value: 'L' }, { label: 'M', value: 'M' }, { label: 'Q', value: 'Q' }, { label: 'H', value: 'H' }]} />
);
const Q_Text = (props: any) => <Input value={props.value} onChange={(e: any) => props.onChange?.(e.target.value)} placeholder={props.placeholder} />;

export function registerQrDisplayModel(deps: { flowEngine: any; flowSettings?: any; Base: any }) {
  const { flowEngine, flowSettings, Base } = deps;
  if (!flowEngine || !Base) { console.warn('[device-kit] qr-display: missing flowEngine/Base'); return; }

  if (flowSettings?.registerComponents) {
    try { flowSettings.registerComponents({ Q_Grid: SettingsGrid, Q_Size, Q_Level, Q_Text, Q_Reset: ResetButton }); }
    catch (e) { console.warn('[device-kit] qr-display registerComponents failed', e); }
  }

  class PtdlQrDisplayFieldModel extends Base {
    render() {
      const model: any = this;
      const p = model.props || {};
      const record = model?.context?.record || model?.context?.view?.inputArgs?.record;
      return <QrView cfg={qcfgFromProps(p)} value={p.value} record={record} />;
    }
    renderComponent(value?: any) {
      const model: any = this;
      const p = model.props || {};
      const record = model?.context?.record;
      return <QrView cfg={qcfgFromProps(p)} value={value !== undefined ? value : p.value} record={record} />;
    }
  }
  flowEngine.registerModels({ PtdlQrDisplayFieldModel });
  try { (PtdlQrDisplayFieldModel as any).define?.({ label: t('Mã QR (hiển thị)') }); } catch (_) { /* optional */ }

  try {
    (PtdlQrDisplayFieldModel as any).registerFlow({
      key: 'ptdlQrDisplay',
      sort: 840,
      title: te('Cấu hình mã QR'),
      steps: {
        settings: {
          title: te('Cấu hình mã QR'),
          uiMode: { type: 'dialog', props: { width: 480 } },
          uiSchema: () => ({
            row1: {
              type: 'void', 'x-component': 'Q_Grid', 'x-component-props': { minColWidth: 150 },
              properties: {
                size: fi(te('Kích thước'), 'Q_Size', { type: 'number' }),
                level: fi(te('Độ chịu lỗi'), 'Q_Level'),
              },
            },
            template: fi(te('Nội dung (trống = giá trị cột; hỗ trợ {{cột}})'), 'Q_Text', { componentProps: { placeholder: '{{code}}  hoặc  https://…?id={{id}}' } }),
            reset: { type: 'void', 'x-component': 'Q_Reset', 'x-component-props': { defaults: Q_DEFAULTS, label: te('Đặt lại') }, 'x-decorator': 'FormItem' },
          }),
          defaultParams: { ...Q_DEFAULTS },
          handler(ctx: any, params: any) {
            const p = params || {};
            ctx.model.setProps({
              ptdlqSize: typeof p.size === 'number' ? p.size : 96,
              ptdlqLevel: ['L', 'M', 'Q', 'H'].includes(p.level) ? p.level : 'M',
              ptdlqTemplate: p.template || '',
            });
          },
        },
      },
    });
  } catch (e) { console.warn('[device-kit] qr-display registerFlow failed', e); }

  try {
    (DisplayItemModel as any)?.bindModelToInterface?.('PtdlQrDisplayFieldModel', ['input', 'uuid', 'nanoid', 'integer', 'number', 'sequence'], { isDefault: false });
  } catch (e) { console.warn('[device-kit] qr-display bind failed', e); }

  console.log('[device-kit] qr-display widget registered');
  return PtdlQrDisplayFieldModel;
}
