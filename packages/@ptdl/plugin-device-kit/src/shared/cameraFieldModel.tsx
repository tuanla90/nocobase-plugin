import React, { useState } from 'react';
import { EditableItemModel } from '@nocobase/flow-engine';
import { Button, Select, Slider, Switch, Input, message, theme } from 'antd';
import { SettingsGrid, fi, ResetButton, CollapsibleSection, SEG_PROPS, SegmentedGroup } from '@ptdl/shared';
import { CameraCaptureModal } from './cameraModal';
import { getCurrentUserName, currentUserNameSync } from './user';
import type { WatermarkCfg, CaptureResult } from './watermark';
import type { GeoFix } from './geo';
import { te, t } from './i18n';

/**
 * Camera field widget — subclasses the file-manager UploadFieldModel so the native value binding,
 * preview and form submit stay 100% native (same reuse strategy subtable-pro uses over
 * SubTableFieldModel). We only ADD a "📷 Chụp ảnh" button that opens the in-app capture modal,
 * uploads the watermarked JPEG through the existing `attachments:create` action, and appends the
 * returned file record to the field's array value via the native `onChange`.
 *
 * The GPS fix used for the watermark is ALSO written into a chosen sibling Location field, so the
 * coordinates survive as queryable data (canvas re-encoding drops any EXIF).
 */

const C_DEFAULTS = {
  captureMode: 'inapp' as 'inapp' | 'native',
  wmEnabled: true,
  wmTime: true,
  wmGps: true,
  wmUser: true,
  wmText: '',
  wmPos: 'bottom-left' as WatermarkCfg['position'],
  maxDim: 1600,
  quality: 0.72,
  metaField: undefined as string | undefined,
  requirePhoto: false, // block form submit if no photo (enforced when the form enables auto-capture)
};

type CCfg = typeof C_DEFAULTS;

function ccfgFromProps(p: any): CCfg {
  return {
    captureMode: p.ptdlcMode === 'native' ? 'native' : 'inapp',
    wmEnabled: p.ptdlcWmEnabled !== false,
    wmTime: p.ptdlcWmTime !== false,
    wmGps: p.ptdlcWmGps !== false,
    wmUser: p.ptdlcWmUser !== false,
    wmText: p.ptdlcWmText || '',
    wmPos: p.ptdlcWmPos || 'bottom-left',
    maxDim: typeof p.ptdlcMaxDim === 'number' ? p.ptdlcMaxDim : 1600,
    quality: typeof p.ptdlcQuality === 'number' ? p.ptdlcQuality : 0.72,
    metaField: p.ptdlcMetaField || undefined,
  };
}

function toWatermarkCfg(cfg: CCfg, userName: string): WatermarkCfg {
  return {
    enabled: cfg.wmEnabled,
    showTime: cfg.wmTime,
    showGps: cfg.wmGps,
    showUser: cfg.wmUser,
    customText: cfg.wmText || undefined,
    position: cfg.wmPos,
    userName,
  };
}

function apiOf(model: any): any {
  return model?.context?.api || model?.flowEngine?.context?.api || model?.context?.app?.apiClient || model?.app?.apiClient;
}

function isMultiple(model: any): boolean {
  const cf = model?.collectionField;
  const m = cf?.multiple ?? cf?.options?.multiple;
  return m === undefined ? true : !!m; // attachment defaults to multiple
}

/** Upload a captured blob via attachments:create → returns the attachment record. */
async function uploadBlob(api: any, blob: Blob, at: number): Promise<any> {
  const fd = new FormData();
  const name = `photo-${at}.jpg`;
  fd.append('file', new File([blob], name, { type: 'image/jpeg' }));
  const res = await api.request({ url: 'attachments:create', method: 'post', data: fd });
  return res?.data?.data;
}

// ---- launcher button (rendered next to the native upload UI) -----------------------------------
const CameraLauncher: React.FC<{ model: any; cfg: CCfg }> = ({ model, cfg }) => {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const nativeInputRef = React.useRef<HTMLInputElement | null>(null);
  const api = apiOf(model);
  const [userName, setUserName] = useState<string>(currentUserNameSync());

  React.useEffect(() => {
    if (cfg.wmUser && !userName && api) getCurrentUserName(api).then(setUserName).catch(() => {});
  }, [cfg.wmUser, userName, api]);

  const appendRecord = (rec: any) => {
    if (!rec) return;
    const p = model.props || {};
    const cur = Array.isArray(p.value) ? p.value : (p.value ? [p.value] : []);
    const next = isMultiple(model) ? [...cur, rec] : [rec];
    try { p.onChange?.(next); } catch (_) { /* ignore */ }
  };

  const writeMeta = (fix: GeoFix | null) => {
    if (!fix || !cfg.metaField) return;
    const form = model?.context?.form;
    if (!form?.setFieldValue) return;
    try { form.setFieldValue(cfg.metaField, { ...fix }); } catch (_) { /* ignore */ }
  };

  const onCapture = async (res: CaptureResult, fix: GeoFix | null) => {
    if (!api?.request) { message.error(t('Không có kết nối API để tải ảnh lên.')); return; }
    setBusy(true);
    try {
      const rec = await uploadBlob(api, res.blob, Date.now());
      appendRecord(rec);
      writeMeta(fix);
      message.success(t('Đã thêm ảnh.'));
    } catch (e: any) {
      message.error(t('Tải ảnh lên thất bại.') + (e?.message ? ` (${e.message})` : ''));
    }
    setBusy(false);
  };

  // Native OS-camera path (no in-app modal). Still watermarks via canvas before upload.
  const onNativePick = async (file?: File) => {
    if (!file) return;
    if (!api?.request) { message.error(t('Không có kết nối API để tải ảnh lên.')); return; }
    setBusy(true);
    try {
      const { fileToImage, captureToBlob } = await import('./watermark');
      const { getCurrentFix } = await import('./geo');
      let fix: GeoFix | null = null;
      if (cfg.wmGps || cfg.metaField) {
        try { fix = await getCurrentFix({ enableHighAccuracy: true, timeoutMs: 12000 }); if (fix) fix.src = 'camera'; } catch (_) { fix = null; }
      }
      const img = await fileToImage(file);
      const res = await captureToBlob(img, { maxDim: cfg.maxDim, quality: cfg.quality, watermark: toWatermarkCfg(cfg, userName), fix, at: Date.now() });
      const rec = await uploadBlob(api, res.blob, Date.now());
      appendRecord(rec);
      writeMeta(fix);
      message.success(t('Đã thêm ảnh.'));
    } catch (e: any) {
      message.error(t('Tải ảnh lên thất bại.') + (e?.message ? ` (${e.message})` : ''));
    }
    setBusy(false);
  };

  return (
    <span style={{ display: 'inline-flex', marginTop: 8 }}>
      <Button size="small" loading={busy} onClick={() => (cfg.captureMode === 'native' ? nativeInputRef.current?.click() : setOpen(true))}>
        📷 {t('Chụp ảnh')}
      </Button>
      {cfg.captureMode === 'inapp' && (
        <CameraCaptureModal
          open={open}
          onClose={() => setOpen(false)}
          onCapture={onCapture}
          watermark={toWatermarkCfg(cfg, userName)}
          maxDim={cfg.maxDim}
          quality={cfg.quality}
          wantGps={cfg.wmGps || !!cfg.metaField}
          title={t('Chụp ảnh')}
        />
      )}
      <input
        ref={nativeInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={(e) => { onNativePick(e.target.files?.[0]); e.target.value = ''; }}
      />
    </span>
  );
};

// ---- settings components ------------------------------------------------------------------------
const C_Switch = (props: any) => <Switch checked={!!props.value} onChange={(c: any) => props.onChange?.(c)} />;
const C_PosSeg = (props: any) => (
  <SegmentedGroup
    {...SEG_PROPS}
    value={props.value || 'bottom-left'}
    onChange={(v: any) => props.onChange?.(v)}
    options={[
      { label: t('Dưới-trái'), value: 'bottom-left' },
      { label: t('Dưới-phải'), value: 'bottom-right' },
      { label: t('Trên-trái'), value: 'top-left' },
      { label: t('Trên-phải'), value: 'top-right' },
    ]}
  />
);
const C_ModeSeg = (props: any) => (
  <SegmentedGroup
    {...SEG_PROPS}
    value={props.value || 'inapp'}
    onChange={(v: any) => props.onChange?.(v)}
    options={[
      { label: t('Trong app'), value: 'inapp' },
      { label: t('Camera hệ thống'), value: 'native' },
    ]}
  />
);
const C_DimSel = (props: any) => (
  <Select
    style={{ width: '100%' }}
    value={props.value ?? 1600}
    onChange={(v: any) => props.onChange?.(v)}
    options={[
      { label: '1280 px', value: 1280 },
      { label: '1600 px', value: 1600 },
      { label: '1920 px', value: 1920 },
      { label: t('Giữ gốc'), value: 0 },
    ]}
  />
);
const C_Quality = (props: any) => {
  const { token } = theme.useToken();
  const v = typeof props.value === 'number' ? props.value : 0.72;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 160 }}>
      <Slider min={0.4} max={0.95} step={0.01} value={v} onChange={(n: any) => props.onChange?.(n)} style={{ flex: 1 }} />
      <span style={{ width: 34, textAlign: 'right', color: token.colorTextTertiary }}>{Math.round(v * 100)}%</span>
    </div>
  );
};
const C_Text = (props: any) => <Input value={props.value} onChange={(e: any) => props.onChange?.(e.target.value)} placeholder={t('Dòng chữ thêm (tuỳ chọn)')} />;

/** Select for the "write GPS metadata to" target. Options are computed in the flow uiSchema (below)
 *  from the collection's sibling fields and passed via x-component-props.options. */
const C_MetaField = (props: any) => {
  const opts = Array.isArray(props.options) && props.options.length
    ? props.options
    : [{ label: t('(Không lưu vào field)'), value: '' }];
  return (
    <Select
      style={{ width: '100%' }}
      value={props.value ?? ''}
      onChange={(v: any) => props.onChange?.(v || undefined)}
      options={opts}
      showSearch
      optionFilterProp="label"
    />
  );
};

/** Build the meta-target field options from the current collection (self excluded). */
function metaFieldOptions(model: any): any[] {
  const coll = model?.collection || model?.context?.collection || model?.context?.collectionField?.collection;
  const selfName = model?.collectionField?.name;
  const opts: any[] = [{ label: t('(Không lưu vào field)'), value: '' }];
  try {
    const fields = coll?.getFields?.() || [];
    for (const f of fields) {
      if (!f?.name || f.name === selfName) continue;
      const iface = f?.interface || f?.options?.interface;
      const type = f?.type || f?.options?.type;
      if (iface === 'ptdlLocation' || type === 'json' || iface === 'json' || iface === 'input' || type === 'string') {
        opts.push({ label: `${f.uiSchema?.title || f.title || f.name} (${iface || type})`, value: f.name });
      }
    }
  } catch (_) { /* ignore */ }
  return opts;
}

export function registerCameraFieldModel(deps: {
  flowEngine: any; flowSettings?: any; lane: string;
}) {
  const { flowEngine, flowSettings, lane } = deps;
  if (!flowEngine) { console.warn('[device-kit] camera: no flowEngine'); return; }

  const Base = flowEngine?.getModelClass?.('UploadFieldModel');
  if (!Base) {
    console.warn(`[device-kit] (${lane}) camera: UploadFieldModel not resolved — is plugin-file-manager enabled? skipped`);
    return;
  }

  if (flowSettings?.registerComponents) {
    try {
      flowSettings.registerComponents({
        C_Grid: SettingsGrid, C_Switch, C_PosSeg, C_ModeSeg, C_DimSel, C_Quality, C_Text,
        C_Reset: ResetButton, C_Section: CollapsibleSection, C_MetaField,
      });
    } catch (e) { console.warn('[device-kit] camera registerComponents failed', e); }
  }

  class PtdlCameraFieldModel extends Base {
    render() {
      const model: any = this;
      const p = model.props || {};
      let base: any = null;
      try { base = super.render(); } catch (_) { base = null; }
      const readPretty = p.pattern === 'readPretty' || p.disabled;
      const cfg = ccfgFromProps(p);
      return (
        <div className="ptdl-camera-field">
          {base}
          {!readPretty ? <CameraLauncher model={model} cfg={cfg} /> : null}
        </div>
      );
    }
  }

  flowEngine.registerModels({ PtdlCameraFieldModel });
  try { (PtdlCameraFieldModel as any).define?.({ label: t('Chụp ảnh (camera)') }); } catch (_) { /* optional */ }

  const cameraFlow: any = {
    key: 'ptdlCamera',
    sort: 810,
    title: te('Cấu hình chụp ảnh'),
    steps: {
      settings: {
        title: te('Cấu hình chụp ảnh'),
        uiMode: { type: 'dialog', props: { width: 640 } },
        uiSchema: (ctx: any) => {
          const metaOpts = metaFieldOptions(ctx?.model);
          return {
            mode: fi(te('Cách chụp'), 'C_ModeSeg'),
            wmSection: {
              type: 'void', 'x-component': 'C_Section',
              'x-component-props': { title: te('Watermark (đóng dấu lên ảnh)'), defaultOpen: true },
              properties: {
                row1: {
                  type: 'void', 'x-component': 'C_Grid', 'x-component-props': { minColWidth: 150 },
                  properties: {
                    wmEnabled: fi(te('Bật watermark'), 'C_Switch', { type: 'boolean' }),
                    wmTime: fi(te('Giờ chụp'), 'C_Switch', { type: 'boolean' }),
                    wmGps: fi(te('Toạ độ GPS'), 'C_Switch', { type: 'boolean' }),
                    wmUser: fi(te('Người chụp'), 'C_Switch', { type: 'boolean' }),
                  },
                },
                row2: {
                  type: 'void', 'x-component': 'C_Grid', 'x-component-props': { style: { gridTemplateColumns: '1fr auto' }, alignItems: 'end' },
                  properties: {
                    wmText: fi(te('Dòng chữ thêm'), 'C_Text'),
                    wmPos: fi(te('Vị trí'), 'C_PosSeg'),
                  },
                },
              },
            },
            imgSection: {
              type: 'void', 'x-component': 'C_Section',
              'x-component-props': { title: te('Ảnh & dữ liệu'), defaultOpen: true },
              properties: {
                row3: {
                  type: 'void', 'x-component': 'C_Grid', 'x-component-props': { minColWidth: 160 },
                  properties: {
                    maxDim: fi(te('Kích thước tối đa'), 'C_DimSel', { type: 'number' }),
                    quality: fi(te('Chất lượng JPEG'), 'C_Quality', { type: 'number' }),
                  },
                },
                metaField: fi(te('Lưu toạ độ vào field'), 'C_MetaField', { componentProps: { options: metaOpts } }),
                requirePhoto: fi(te('Bắt buộc chụp ảnh khi Lưu'), 'C_Switch', { type: 'boolean' }),
                reset: {
                  type: 'void', 'x-component': 'C_Reset',
                  'x-component-props': { defaults: C_DEFAULTS, label: te('Đặt lại') },
                  'x-decorator': 'FormItem',
                },
              },
            },
          };
        },
        defaultParams: { ...C_DEFAULTS },
        handler(ctx: any, params: any) {
          const p = params || {};
          ctx.model.setProps({
            ptdlcMode: p.mode === 'native' ? 'native' : 'inapp',
            ptdlcWmEnabled: p.wmEnabled !== false,
            ptdlcWmTime: p.wmTime !== false,
            ptdlcWmGps: p.wmGps !== false,
            ptdlcWmUser: p.wmUser !== false,
            ptdlcWmText: p.wmText || '',
            ptdlcWmPos: p.wmPos || 'bottom-left',
            ptdlcMaxDim: typeof p.maxDim === 'number' ? p.maxDim : 1600,
            ptdlcQuality: typeof p.quality === 'number' ? p.quality : 0.72,
            ptdlcMetaField: p.metaField || undefined,
            ptdlcRequirePhoto: !!p.requirePhoto,
          });
        },
      },
    },
  };

  try { (PtdlCameraFieldModel as any).registerFlow(cameraFlow); } catch (e) { console.warn('[device-kit] camera registerFlow failed', e); }

  const binder =
    (EditableItemModel && typeof (EditableItemModel as any).bindModelToInterface === 'function' && EditableItemModel) ||
    [PtdlCameraFieldModel, Base].find((c: any) => c && typeof c.bindModelToInterface === 'function');
  try {
    (binder as any)?.bindModelToInterface('PtdlCameraFieldModel', ['attachment'], { isDefault: false });
    if (!binder) console.warn('[device-kit] camera: no binder found');
  } catch (e) { console.warn('[device-kit] camera bind failed', e); }

  console.log(`[device-kit] (${lane}) camera widget registered`);
  return PtdlCameraFieldModel;
}
