import React, { useState } from 'react';
import { EditableItemModel } from '@nocobase/flow-engine';
import { Button, Slider, message } from 'antd';
import { SettingsGrid, fi, ResetButton } from '@ptdl/shared';
import { AudioRecorderModal } from './audioRecorder';
import { te, t } from './i18n';

/**
 * Audio recorder field widget — subclasses the file-manager UploadFieldModel (like camera/signature),
 * adds a "🎙️ Ghi âm" button that records a voice note (MediaRecorder) and uploads it via
 * attachments:create, appending to the attachment field. Pair with an AI STT column to transcribe.
 */

const AU_DEFAULTS = { maxSec: 120 };
type AUCfg = typeof AU_DEFAULTS;
function aucfgFromProps(p: any): AUCfg {
  return { maxSec: typeof p.ptdlauMax === 'number' ? p.ptdlauMax : 120 };
}

function apiOf(model: any): any {
  return model?.context?.api || model?.flowEngine?.context?.api || model?.context?.app?.apiClient || model?.app?.apiClient;
}
function isMultiple(model: any): boolean {
  const cf = model?.collectionField;
  const m = cf?.multiple ?? cf?.options?.multiple;
  return m === undefined ? true : !!m;
}

const AudioLauncher: React.FC<{ model: any; cfg: AUCfg }> = ({ model, cfg }) => {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const api = apiOf(model);

  const appendRecord = (rec: any) => {
    if (!rec) return;
    const p = model.props || {};
    const cur = Array.isArray(p.value) ? p.value : (p.value ? [p.value] : []);
    const next = isMultiple(model) ? [...cur, rec] : [rec];
    try { p.onChange?.(next); } catch (_) { /* ignore */ }
  };

  const onDone = async (blob: Blob, ext: string) => {
    if (!api?.request) { message.error(t('Không có kết nối API để tải bản ghi lên.')); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', new File([blob], `voice-${Date.now()}.${ext}`, { type: blob.type || 'audio/webm' }));
      const res = await api.request({ url: 'attachments:create', method: 'post', data: fd });
      appendRecord(res?.data?.data);
      message.success(t('Đã thêm bản ghi âm.'));
    } catch (e: any) {
      message.error(t('Tải bản ghi lên thất bại.') + (e?.message ? ` (${e.message})` : ''));
    }
    setBusy(false);
  };

  return (
    <span style={{ display: 'inline-flex', marginTop: 8 }}>
      <Button size="small" loading={busy} onClick={() => setOpen(true)}>🎙️ {t('Ghi âm')}</Button>
      <AudioRecorderModal open={open} onClose={() => setOpen(false)} onDone={onDone} maxSec={cfg.maxSec} title={t('Ghi âm')} />
    </span>
  );
};

const AU_Sec = (props: any) => {
  const v = typeof props.value === 'number' ? props.value : 120;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 160 }}>
      <Slider min={10} max={600} step={10} value={v} onChange={(n: any) => props.onChange?.(n)} style={{ flex: 1 }} />
      <span style={{ width: 48, textAlign: 'right', color: '#888' }}>{v}s</span>
    </div>
  );
};

export function registerAudioFieldModel(deps: { flowEngine: any; flowSettings?: any; lane: string }) {
  const { flowEngine, flowSettings, lane } = deps;
  if (!flowEngine) { console.warn('[device-kit] audio: no flowEngine'); return; }

  const Base = flowEngine?.getModelClass?.('UploadFieldModel');
  if (!Base) { console.warn(`[device-kit] (${lane}) audio: UploadFieldModel not resolved — is file-manager enabled? skipped`); return; }

  if (flowSettings?.registerComponents) {
    try { flowSettings.registerComponents({ AU_Grid: SettingsGrid, AU_Sec, AU_Reset: ResetButton }); }
    catch (e) { console.warn('[device-kit] audio registerComponents failed', e); }
  }

  class PtdlAudioFieldModel extends Base {
    render() {
      const model: any = this;
      const p = model.props || {};
      let base: any = null;
      try { base = super.render(); } catch (_) { base = null; }
      const readPretty = p.pattern === 'readPretty' || p.disabled;
      return (
        <div className="ptdl-audio-field">
          {base}
          {!readPretty ? <AudioLauncher model={model} cfg={aucfgFromProps(p)} /> : null}
        </div>
      );
    }
  }

  flowEngine.registerModels({ PtdlAudioFieldModel });
  try { (PtdlAudioFieldModel as any).define?.({ label: t('Ghi âm') }); } catch (_) { /* optional */ }

  try {
    (PtdlAudioFieldModel as any).registerFlow({
      key: 'ptdlAudio',
      sort: 814,
      title: te('Cấu hình ghi âm'),
      steps: {
        settings: {
          title: te('Cấu hình ghi âm'),
          uiMode: { type: 'dialog', props: { width: 440 } },
          uiSchema: () => ({
            row1: {
              type: 'void', 'x-component': 'AU_Grid', 'x-component-props': { minColWidth: 200 },
              properties: { maxSec: fi(te('Thời lượng tối đa'), 'AU_Sec', { type: 'number' }) },
            },
            reset: { type: 'void', 'x-component': 'AU_Reset', 'x-component-props': { defaults: AU_DEFAULTS, label: te('Đặt lại') }, 'x-decorator': 'FormItem' },
          }),
          defaultParams: { ...AU_DEFAULTS },
          handler(ctx: any, params: any) {
            ctx.model.setProps({ ptdlauMax: typeof params?.maxSec === 'number' ? params.maxSec : 120 });
          },
        },
      },
    });
  } catch (e) { console.warn('[device-kit] audio registerFlow failed', e); }

  const binder =
    (EditableItemModel && typeof (EditableItemModel as any).bindModelToInterface === 'function' && EditableItemModel) ||
    [PtdlAudioFieldModel, Base].find((c: any) => c && typeof c.bindModelToInterface === 'function');
  try {
    (binder as any)?.bindModelToInterface('PtdlAudioFieldModel', ['attachment'], { isDefault: false });
  } catch (e) { console.warn('[device-kit] audio bind failed', e); }

  console.log(`[device-kit] (${lane}) audio widget registered`);
  return PtdlAudioFieldModel;
}
