import React, { useState } from 'react';
import { EditableItemModel } from '@nocobase/flow-engine';
import { Button, Slider, Switch, message, theme } from 'antd';
import { SettingsGrid, fi, ResetButton, CollapsibleSection, ColorField, registerFlowComponentsOnce } from '@tuanla90/shared';
import { SignatureModal, nowStamp, type SignatureCfg } from './signaturePad';
import { getCurrentUserName, currentUserNameSync } from './user';
import { te, t } from './i18n';

/**
 * Signature field widget — subclasses the file-manager UploadFieldModel (like the camera widget) so the
 * native value/preview/submit stay intact; adds a "✍️ Ký" button that opens the canvas signature pad and
 * uploads the resulting PNG through `attachments:create`, appending it to the field's array value.
 */

const G_DEFAULTS = {
  penColor: '#1f1f1f',
  penWidth: 2.5,
  white: true,
  height: 180,
  caption: true, // bake signer name + time under the signature
};
type GCfg = typeof G_DEFAULTS;

function gcfgFromProps(p: any): GCfg {
  return {
    penColor: p.ptdlgColor || '#1f1f1f',
    penWidth: typeof p.ptdlgWidth === 'number' ? p.ptdlgWidth : 2.5,
    white: p.ptdlgWhite !== false,
    height: typeof p.ptdlgHeight === 'number' ? p.ptdlgHeight : 180,
    caption: p.ptdlgCaption !== false,
  };
}

function apiOf(model: any): any {
  return model?.context?.api || model?.flowEngine?.context?.api || model?.context?.app?.apiClient || model?.app?.apiClient;
}
function isMultiple(model: any): boolean {
  const cf = model?.collectionField;
  const m = cf?.multiple ?? cf?.options?.multiple;
  return m === undefined ? true : !!m;
}
async function uploadBlob(api: any, blob: Blob, name: string): Promise<any> {
  const fd = new FormData();
  fd.append('file', new File([blob], name, { type: 'image/png' }));
  const res = await api.request({ url: 'attachments:create', method: 'post', data: fd });
  return res?.data?.data;
}

const SignatureLauncher: React.FC<{ model: any; cfg: GCfg }> = ({ model, cfg }) => {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const api = apiOf(model);
  const [userName, setUserName] = useState<string>(currentUserNameSync());

  React.useEffect(() => {
    if (cfg.caption && !userName && api) getCurrentUserName(api).then(setUserName).catch(() => {});
  }, [cfg.caption, userName, api]);

  const appendRecord = (rec: any) => {
    if (!rec) return;
    const p = model.props || {};
    const cur = Array.isArray(p.value) ? p.value : (p.value ? [p.value] : []);
    const next = isMultiple(model) ? [...cur, rec] : [rec];
    try { p.onChange?.(next); } catch (_) { /* ignore */ }
  };

  const onDone = async (blob: Blob) => {
    if (!api?.request) { message.error(t('Không có kết nối API để tải chữ ký lên.')); return; }
    setBusy(true);
    try {
      const rec = await uploadBlob(api, blob, `signature-${Date.now()}.png`);
      appendRecord(rec);
      message.success(t('Đã thêm chữ ký.'));
    } catch (e: any) {
      message.error(t('Tải chữ ký lên thất bại.') + (e?.message ? ` (${e.message})` : ''));
    }
    setBusy(false);
  };

  const caption = cfg.caption
    ? [userName, nowStamp()].filter(Boolean).join(' · ')
    : '';

  return (
    <span style={{ display: 'inline-flex', marginTop: 8 }}>
      <Button size="small" loading={busy} onClick={() => setOpen(true)}>✍️ {t('Ký tên')}</Button>
      <SignatureModal
        open={open} onClose={() => setOpen(false)} onDone={onDone}
        cfg={{ penColor: cfg.penColor, penWidth: cfg.penWidth, white: cfg.white, height: cfg.height, caption } as SignatureCfg}
        title={t('Ký tên')}
      />
    </span>
  );
};

// ---- settings components ------------------------------------------------------------------------
const G_Switch = (props: any) => <Switch checked={!!props.value} onChange={(c: any) => props.onChange?.(c)} />;
const G_Width = (props: any) => {
  const { token } = theme.useToken();
  const v = typeof props.value === 'number' ? props.value : 2.5;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 140 }}>
      <Slider min={1} max={6} step={0.5} value={v} onChange={(n: any) => props.onChange?.(n)} style={{ flex: 1 }} />
      <span style={{ width: 32, textAlign: 'right', color: token.colorTextTertiary }}>{v}</span>
    </div>
  );
};
const G_Height = (props: any) => {
  const { token } = theme.useToken();
  const v = typeof props.value === 'number' ? props.value : 180;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 140 }}>
      <Slider min={120} max={300} step={10} value={v} onChange={(n: any) => props.onChange?.(n)} style={{ flex: 1 }} />
      <span style={{ width: 40, textAlign: 'right', color: token.colorTextTertiary }}>{v}px</span>
    </div>
  );
};

export function registerSignatureFieldModel(deps: { flowEngine: any; flowSettings?: any; lane: string }) {
  const { flowEngine, flowSettings, lane } = deps;
  if (!flowEngine) { console.warn('[device-kit] signature: no flowEngine'); return; }

  const Base = flowEngine?.getModelClass?.('UploadFieldModel');
  if (!Base) { console.warn(`[device-kit] (${lane}) signature: UploadFieldModel not resolved — is file-manager enabled? skipped`); return; }

  if (flowSettings?.registerComponents) {
    try { registerFlowComponentsOnce(flowSettings, { G_Grid: SettingsGrid, G_Switch, G_Width, G_Height, G_Color: ColorField, G_Reset: ResetButton, G_Section: CollapsibleSection }); }
    catch (e) { console.warn('[device-kit] signature registerComponents failed', e); }
  }

  class PtdlSignatureFieldModel extends Base {
    render() {
      const model: any = this;
      const p = model.props || {};
      let base: any = null;
      try { base = super.render(); } catch (_) { base = null; }
      const readPretty = p.pattern === 'readPretty' || p.disabled;
      return (
        <div className="ptdl-signature-field">
          {base}
          {!readPretty ? <SignatureLauncher model={model} cfg={gcfgFromProps(p)} /> : null}
        </div>
      );
    }
  }

  flowEngine.registerModels({ PtdlSignatureFieldModel });
  try { (PtdlSignatureFieldModel as any).define?.({ label: t('Chữ ký') }); } catch (_) { /* optional */ }

  try {
    (PtdlSignatureFieldModel as any).registerFlow({
      key: 'ptdlSignature',
      sort: 812,
      title: te('Cấu hình chữ ký'),
      steps: {
        settings: {
          title: te('Cấu hình chữ ký'),
          uiMode: { type: 'dialog', props: { width: 520 } },
          uiSchema: () => ({
            row1: {
              type: 'void', 'x-component': 'G_Grid', 'x-component-props': { minColWidth: 150 },
              properties: {
                penColor: fi(te('Màu bút'), 'G_Color'),
                penWidth: fi(te('Nét bút'), 'G_Width', { type: 'number' }),
              },
            },
            row2: {
              type: 'void', 'x-component': 'G_Grid', 'x-component-props': { minColWidth: 150 },
              properties: {
                height: fi(te('Chiều cao'), 'G_Height', { type: 'number' }),
                white: fi(te('Nền trắng'), 'G_Switch', { type: 'boolean' }),
                caption: fi(te('Ghi tên + giờ dưới chữ ký'), 'G_Switch', { type: 'boolean' }),
              },
            },
            reset: { type: 'void', 'x-component': 'G_Reset', 'x-component-props': { defaults: G_DEFAULTS, label: te('Đặt lại') }, 'x-decorator': 'FormItem' },
          }),
          defaultParams: { ...G_DEFAULTS },
          handler(ctx: any, params: any) {
            const p = params || {};
            ctx.model.setProps({
              ptdlgColor: p.penColor || '#1f1f1f',
              ptdlgWidth: typeof p.penWidth === 'number' ? p.penWidth : 2.5,
              ptdlgWhite: p.white !== false,
              ptdlgHeight: typeof p.height === 'number' ? p.height : 180,
              ptdlgCaption: p.caption !== false,
            });
          },
        },
      },
    });
  } catch (e) { console.warn('[device-kit] signature registerFlow failed', e); }

  const binder =
    (EditableItemModel && typeof (EditableItemModel as any).bindModelToInterface === 'function' && EditableItemModel) ||
    [PtdlSignatureFieldModel, Base].find((c: any) => c && typeof c.bindModelToInterface === 'function');
  try {
    (binder as any)?.bindModelToInterface('PtdlSignatureFieldModel', ['attachment'], { isDefault: false });
  } catch (e) { console.warn('[device-kit] signature bind failed', e); }

  console.log(`[device-kit] (${lane}) signature widget registered`);
  return PtdlSignatureFieldModel;
}
