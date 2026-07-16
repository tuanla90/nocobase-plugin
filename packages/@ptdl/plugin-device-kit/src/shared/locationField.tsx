import React, { useState } from 'react';
import { EditableItemModel, DisplayItemModel } from '@nocobase/flow-engine';
import { Button, Input, Segmented, Switch, Slider, Space, message } from 'antd';
import { SettingsGrid, fi, ResetButton, CollapsibleSection, SEG_PROPS } from '@ptdl/shared';
import { getCurrentFix, formatFix, mapsUrl, parseLocation, accuracyBucket, type GeoFix } from './geo';
import { te, t } from './i18n';

/**
 * GPS Location field type `ptdlLocation` — a first-class field (custom CollectionFieldInterface,
 * grouped under "Thiết bị" in Add field) stored via the native `json` dbType as
 * {lat,lng,accuracy,ts,src,address?}. No map API key is needed anywhere: capture uses the browser
 * Geolocation API, and display is a pill that deep-links to Google Maps.
 *
 * Robustness: the models are ALSO bound to the built-in `json` interface (isDefault:false) so even
 * if the custom-interface registration fails on some build, users can still add a JSON field and
 * pick "Vị trí (GPS)" as the Field component.
 */

const L_DEFAULTS = {
  highAccuracy: true,
  showAccuracy: true,
  good: 25,
  ok: 100,
  embed: false,
};
type LCfg = typeof L_DEFAULTS;

function lcfgFromProps(p: any): LCfg {
  return {
    highAccuracy: p.ptdllHighAcc !== false,
    showAccuracy: p.ptdllShowAcc !== false,
    good: typeof p.ptdllGood === 'number' ? p.ptdllGood : 25,
    ok: typeof p.ptdllOk === 'number' ? p.ptdllOk : 100,
    embed: !!p.ptdllEmbed,
  };
}

const DOT_COLORS: Record<string, string> = { good: '#52c41a', ok: '#faad14', poor: '#f5222d', none: '#bfbfbf' };

function asFix(value: any): GeoFix | null {
  if (!value) return null;
  if (typeof value === 'string') return parseLocation(value);
  if (typeof value === 'object' && value.lat != null && value.lng != null) return value as GeoFix;
  return null;
}

// ---- editable widget ----------------------------------------------------------------------------
const LocationInput: React.FC<{ cfg: LCfg; value?: any; onChange?: (v: any) => void; disabled?: boolean }> = ({ cfg, value, onChange, disabled }) => {
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState('');
  const [showManual, setShowManual] = useState(false);
  const fix = asFix(value);

  const locate = async () => {
    setBusy(true);
    try {
      const f = await getCurrentFix({ enableHighAccuracy: cfg.highAccuracy, timeoutMs: 12000 });
      onChange?.(f);
    } catch (e: any) {
      const code = e?.code;
      if (code === 'denied') message.error(t('Bạn đã từ chối quyền vị trí. Mở lại quyền cho trang trong cài đặt trình duyệt rồi thử lại.'));
      else if (code === 'timeout') message.warning(t('Lấy vị trí quá lâu. Thử lại ở nơi thoáng hoặc bật GPS.'));
      else if (code === 'unsupported') message.error(t('Thiết bị/trình duyệt không hỗ trợ định vị (hoặc trang không chạy HTTPS).'));
      else message.error(t('Không lấy được vị trí.'));
    }
    setBusy(false);
  };

  const applyManual = () => {
    const f = parseLocation(manual);
    if (!f) { message.error(t('Không đọc được toạ độ. Nhập "vĩ độ, kinh độ" hoặc dán link Google Maps.')); return; }
    onChange?.(f);
    setManual('');
    setShowManual(false);
  };

  const bucket = accuracyBucket(fix?.accuracy, cfg.good, cfg.ok);

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 6, minWidth: 220 }}>
      <Space size={8} style={{ alignItems: 'center' }}>
        <Button size="small" loading={busy} onClick={locate} disabled={disabled}>📍 {t('Lấy vị trí')}</Button>
        {fix ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontVariantNumeric: 'tabular-nums' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: DOT_COLORS[bucket], flex: 'none' }} />
            <a href={mapsUrl(fix)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
              {formatFix(fix, { showAccuracy: cfg.showAccuracy })}
            </a>
          </span>
        ) : (
          <span style={{ color: '#bfbfbf' }}>{t('Chưa có vị trí')}</span>
        )}
      </Space>
      {!disabled && (
        showManual ? (
          <Space.Compact style={{ width: '100%' }}>
            <Input size="small" value={manual} onChange={(e) => setManual(e.target.value)} placeholder={t('vĩ độ, kinh độ hoặc link Google Maps')} onPressEnter={applyManual} />
            <Button size="small" onClick={applyManual}>{t('Áp dụng')}</Button>
          </Space.Compact>
        ) : (
          <a style={{ fontSize: 12, color: '#8c8c8c' }} onClick={() => setShowManual(true)}>{t('Nhập tay / dán link')}</a>
        )
      )}
    </div>
  );
};

// ---- display widget -----------------------------------------------------------------------------
const LocationDisplay: React.FC<{ cfg: LCfg; value?: any }> = ({ cfg, value }) => {
  const fix = asFix(value);
  if (!fix) return <span style={{ color: '#bfbfbf' }}>—</span>;
  const bucket = accuracyBucket(fix.accuracy, cfg.good, cfg.ok);
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 4 }}>
      <a
        href={mapsUrl(fix)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontVariantNumeric: 'tabular-nums' }}
      >
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: DOT_COLORS[bucket], flex: 'none' }} />
        📍 {formatFix(fix, { showAccuracy: cfg.showAccuracy })}
      </a>
      {cfg.embed && (
        <iframe
          title="map"
          width="240"
          height="150"
          style={{ border: '1px solid #eee', borderRadius: 6 }}
          loading="lazy"
          src={`https://www.openstreetmap.org/export/embed.html?bbox=${fix.lng - 0.003}%2C${fix.lat - 0.002}%2C${fix.lng + 0.003}%2C${fix.lat + 0.002}&layer=mapnik&marker=${fix.lat}%2C${fix.lng}`}
        />
      )}
    </span>
  );
};

// ---- settings components ------------------------------------------------------------------------
const L_Switch = (props: any) => <Switch checked={!!props.value} onChange={(c: any) => props.onChange?.(c)} />;
const L_Meters = (props: any) => {
  const v = typeof props.value === 'number' ? props.value : (props.defaultValue ?? 25);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 140 }}>
      <Slider min={5} max={300} step={5} value={v} onChange={(n: any) => props.onChange?.(n)} style={{ flex: 1 }} />
      <span style={{ width: 44, textAlign: 'right', color: '#888' }}>{v}m</span>
    </div>
  );
};

export function registerLocationField(deps: {
  flowEngine: any; flowSettings?: any; FieldModel: any; DisplayTextFieldModel: any;
  CollectionFieldInterface?: any; app?: any; lane: string;
}) {
  const { flowEngine, flowSettings, FieldModel, DisplayTextFieldModel, CollectionFieldInterface, app, lane } = deps;
  if (!flowEngine || !FieldModel) { console.warn('[device-kit] location: missing flowEngine/FieldModel'); return; }

  if (flowSettings?.registerComponents) {
    try {
      flowSettings.registerComponents({ L_Grid: SettingsGrid, L_Switch, L_Meters, L_Reset: ResetButton, L_Section: CollapsibleSection });
    } catch (e) { console.warn('[device-kit] location registerComponents failed', e); }
  }

  // Editable model.
  class PtdlLocationFieldModel extends FieldModel {
    render() {
      const model: any = this;
      const p = model.props || {};
      const readPretty = p.pattern === 'readPretty';
      const cfg = lcfgFromProps(p);
      if (readPretty) return <LocationDisplay cfg={cfg} value={p.value} />;
      return <LocationInput cfg={cfg} value={p.value} onChange={(v: any) => p.onChange?.(v)} disabled={p.disabled} />;
    }
  }
  flowEngine.registerModels({ PtdlLocationFieldModel });
  try { (PtdlLocationFieldModel as any).define?.({ label: t('Vị trí (GPS)') }); } catch (_) { /* optional */ }

  const locFlow: any = {
    key: 'ptdlLocation',
    sort: 820,
    title: te('Cấu hình vị trí'),
    steps: {
      settings: {
        title: te('Cấu hình vị trí'),
        uiMode: { type: 'dialog', props: { width: 560 } },
        uiSchema: () => ({
          row1: {
            type: 'void', 'x-component': 'L_Grid', 'x-component-props': { minColWidth: 160 },
            properties: {
              highAccuracy: fi(te('Độ chính xác cao'), 'L_Switch', { type: 'boolean' }),
              showAccuracy: fi(te('Hiện độ chính xác (±m)'), 'L_Switch', { type: 'boolean' }),
              embed: fi(te('Nhúng bản đồ (chi tiết)'), 'L_Switch', { type: 'boolean' }),
            },
          },
          accSection: {
            type: 'void', 'x-component': 'L_Section',
            'x-component-props': { title: te('Ngưỡng màu độ chính xác'), defaultOpen: true },
            properties: {
              row2: {
                type: 'void', 'x-component': 'L_Grid', 'x-component-props': { minColWidth: 180 },
                properties: {
                  good: fi(te('Tốt khi ≤ (m)'), 'L_Meters', { type: 'number' }),
                  ok: fi(te('Khá khi ≤ (m)'), 'L_Meters', { type: 'number' }),
                },
              },
            },
          },
          reset: { type: 'void', 'x-component': 'L_Reset', 'x-component-props': { defaults: L_DEFAULTS, label: te('Đặt lại') }, 'x-decorator': 'FormItem' },
        }),
        defaultParams: { ...L_DEFAULTS },
        handler(ctx: any, params: any) {
          const p = params || {};
          ctx.model.setProps({
            ptdllHighAcc: p.highAccuracy !== false,
            ptdllShowAcc: p.showAccuracy !== false,
            ptdllGood: typeof p.good === 'number' ? p.good : 25,
            ptdllOk: typeof p.ok === 'number' ? p.ok : 100,
            ptdllEmbed: !!p.embed,
          });
        },
      },
    },
  };
  try { (PtdlLocationFieldModel as any).registerFlow(locFlow); } catch (e) { console.warn('[device-kit] location registerFlow failed', e); }

  // Display model (detail / table / list).
  const DisplayBase = DisplayTextFieldModel || FieldModel;
  class PtdlLocationDisplayFieldModel extends DisplayBase {
    render() {
      const model: any = this;
      const p = model.props || {};
      return <LocationDisplay cfg={lcfgFromProps(p)} value={p.value} />;
    }
    renderComponent(value?: any) {
      const model: any = this;
      const p = model.props || {};
      return <LocationDisplay cfg={lcfgFromProps(p)} value={value !== undefined ? value : p.value} />;
    }
  }
  flowEngine.registerModels({ PtdlLocationDisplayFieldModel });
  try { (PtdlLocationDisplayFieldModel as any).define?.({ label: t('Vị trí (GPS)') }); } catch (_) { /* optional */ }
  try { (PtdlLocationDisplayFieldModel as any).registerFlow({ ...locFlow, key: 'ptdlLocationDisplay' }); } catch (_) { /* optional */ }

  // ---- custom field interface (best-effort; json binding below is the guaranteed fallback) ------
  if (app?.addFieldInterfaces && CollectionFieldInterface) {
    try {
      class PtdlLocationFieldInterface extends CollectionFieldInterface {
        name = 'ptdlLocation';
        type = 'json';
        group = 'ptdlDevice';
        order = 1;
        title = t('Vị trí (GPS)');
        sortable = false;
        default = {
          type: 'json',
          uiSchema: { type: 'object', 'x-component': 'Input' },
        };
        availableTypes = ['json'];
        hasDefaultValue = false;
        properties = {
          'uiSchema.title': {
            type: 'string',
            title: '{{t("Field display name")}}',
            required: true,
            'x-decorator': 'FormItem',
            'x-component': 'Input',
          },
          name: {
            type: 'string',
            title: '{{t("Field name")}}',
            required: true,
            'x-disabled': '{{ !createOnly }}',
            'x-decorator': 'FormItem',
            'x-component': 'Input',
            description: '{{t("Randomly generated and can be modified. Support letters, numbers and underscores, must start with an letter.")}}',
          },
        };
      }
      app.addFieldInterfaceGroups?.({ ptdlDevice: { label: t('Thiết bị'), order: 310 } });
      app.addFieldInterfaces([PtdlLocationFieldInterface as any]);
      console.log(`[device-kit] (${lane}) ptdlLocation interface registered`);
    } catch (e) {
      console.warn(`[device-kit] (${lane}) ptdlLocation interface registration failed (json fallback still works)`, e);
    }
  }

  // ---- bindings ----------------------------------------------------------------------------------
  const editBinder =
    (EditableItemModel && typeof (EditableItemModel as any).bindModelToInterface === 'function' && EditableItemModel) ||
    [PtdlLocationFieldModel, FieldModel].find((c: any) => c && typeof c.bindModelToInterface === 'function');
  try {
    (editBinder as any)?.bindModelToInterface?.('PtdlLocationFieldModel', ['ptdlLocation'], { isDefault: true });
    (editBinder as any)?.bindModelToInterface?.('PtdlLocationFieldModel', ['json'], { isDefault: false });
  } catch (e) { console.warn('[device-kit] location edit-bind failed', e); }

  try {
    (DisplayItemModel as any)?.bindModelToInterface?.('PtdlLocationDisplayFieldModel', ['ptdlLocation'], { isDefault: true });
    (DisplayItemModel as any)?.bindModelToInterface?.('PtdlLocationDisplayFieldModel', ['json'], { isDefault: false });
  } catch (e) { console.warn('[device-kit] location display-bind failed', e); }

  console.log(`[device-kit] (${lane}) location field registered`);
  return PtdlLocationFieldModel;
}
