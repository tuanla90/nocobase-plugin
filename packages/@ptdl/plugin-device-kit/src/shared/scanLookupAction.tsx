import React, { useState } from 'react';
import { Button, Select, Switch, Input, message } from 'antd';
import { SettingsGrid, fi, ResetButton, CollapsibleSection, SEG_PROPS } from '@ptdl/shared';
import { Segmented } from 'antd';
import { ScanModal } from './scanModal';
import { te, t } from './i18n';

/**
 * A2 — "Scan → lookup" collection action (a toolbar button on a Table/list block). Opens the scanner;
 * each decoded code is looked up in the block's collection by a chosen field, then handled per config:
 *  - cart  : publish the found record to a Sub-table Pro cart channel (POS: scan → +1 to cart) via the
 *            shared global bridge (globalThis.__ptdlBridge) — continuous mode keeps scanning.
 *  - filter: filter the connected table to the matched record.
 *  - toast : just announce the match.
 * Registered as a custom collection-scene ActionModel (house pattern).
 */

const SL_DEFAULTS = {
  lookupField: '' as string,
  outcome: 'cart' as 'cart' | 'filter' | 'toast',
  cartChannel: 'cart',
  continuous: true,
  beep: true,
  vibrate: true,
  label: '' as string,
};

function apiOf(model: any): any {
  return model?.context?.api || model?.flowEngine?.context?.api || model?.context?.app?.apiClient || model?.app?.apiClient;
}
function appOf(model: any): any {
  return model?.context?.app || model?.app || model?.flowEngine?.context?.app;
}
function blockCtxOf(model: any): { collectionName?: string; resource?: any } {
  let collectionName, resource;
  let n = model;
  for (let i = 0; i < 12 && n; i++) {
    collectionName = collectionName || n.collectionName || n.collection?.name || n.context?.collectionName;
    resource = resource || n.resource || n.context?.resource;
    if (collectionName && resource) break;
    n = n.parent;
  }
  return { collectionName, resource };
}

function slCfg(p: any) {
  return {
    lookupField: p.ptdlslField || '',
    outcome: (['cart', 'filter', 'toast'].includes(p.ptdlslOutcome) ? p.ptdlslOutcome : 'cart'),
    cartChannel: p.ptdlslChannel || 'cart',
    continuous: p.ptdlslContinuous !== false,
    beep: p.ptdlslBeep !== false,
    vibrate: p.ptdlslVibrate !== false,
    label: p.ptdlslLabel || '',
  };
}

const ScanLookupButton: React.FC<{ model: any }> = ({ model }) => {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const p = model.props || {};
  const cfg = slCfg(p);

  const process = async (code: string) => {
    const api = apiOf(model);
    const { collectionName, resource } = blockCtxOf(model);
    const field = cfg.lookupField;
    if (!field) { message.warning(t('Chưa chọn field để tra cứu (mở cấu hình action).')); return; }
    if (!api?.request || !collectionName) { message.error(t('Không xác định được bảng để tra cứu.')); return; }
    try {
      const res = await api.request({ url: `${collectionName}:list`, params: { filter: { [field]: code }, pageSize: 1 } });
      const rec = res?.data?.data?.[0];
      if (!rec) { message.warning(`${t('Không thấy')}: ${code}`); return; }
      if (cfg.outcome === 'cart') {
        const bridge = (globalThis as any).__ptdlBridge || appOf(model)?.ptdlBridge;
        if (bridge?.publish) { bridge.publish(cfg.cartChannel, { action: 'add', record: rec }); setCount((c) => c + 1); }
        else message.error(t('Chưa có giỏ (Sub-table Pro) kết nối kênh này.'));
      } else if (cfg.outcome === 'filter') {
        try {
          if (resource?.addFilterGroup) { resource.addFilterGroup(`ptdl-scan`, { [field]: code }); resource.refresh?.(); }
          else if (resource?.setFilter) { resource.setFilter({ [field]: code }); resource.refresh?.(); }
          else message.info(`${t('Đã tìm')}: ${code}`);
        } catch (_) { message.info(`${t('Đã tìm')}: ${code}`); }
      } else {
        const title = rec.name ?? rec.title ?? rec.label ?? rec[field] ?? code;
        message.success(`✓ ${title}`);
      }
    } catch (e: any) {
      message.error(t('Lỗi tra cứu.') + (e?.message ? ` (${e.message})` : ''));
    }
  };

  const onDecode = (code: string) => {
    process(code);
    if (!cfg.continuous) setOpen(false);
  };

  const openScan = () => { setCount(0); setOpen(true); };

  return (
    <>
      <Button size="small" onClick={openScan} icon={<span>🔳</span>}>{cfg.label || t('Quét mã')}</Button>
      <ScanModal
        open={open} onClose={() => setOpen(false)} onDecode={onDecode}
        continuous={cfg.continuous} beep={cfg.beep} vibrate={cfg.vibrate}
        title={cfg.outcome === 'cart' ? t('Quét thêm vào giỏ') : t('Quét mã')} count={count}
      />
    </>
  );
};

// ---- settings components ------------------------------------------------------------------------
const SL_Field = (props: any) => {
  const opts = Array.isArray(props.options) ? props.options : [];
  return <Select style={{ width: '100%' }} showSearch optionFilterProp="label" placeholder={t('Chọn field chứa mã')}
    value={props.value ?? undefined} onChange={(v: any) => props.onChange?.(v || undefined)} options={opts} />;
};
const SL_Switch = (props: any) => <Switch checked={!!props.value} onChange={(c: any) => props.onChange?.(c)} />;
const SL_Text = (props: any) => <Input value={props.value} onChange={(e: any) => props.onChange?.(e.target.value)} placeholder={props.placeholder} />;
const SL_Outcome = (props: any) => (
  <Segmented {...SEG_PROPS} value={props.value || 'cart'} onChange={(v: any) => props.onChange?.(v)}
    options={[{ label: t('Thêm vào giỏ'), value: 'cart' }, { label: t('Lọc bảng'), value: 'filter' }, { label: t('Thông báo'), value: 'toast' }]} />
);

function lookupFieldOptions(model: any): any[] {
  const coll = model?.collection || model?.context?.collection;
  const opts: any[] = [];
  try {
    const fields = coll?.getFields?.() || [];
    for (const f of fields) {
      if (!f?.name) continue;
      const iface = f?.interface || f?.options?.interface;
      const type = f?.type || f?.options?.type;
      if (['input', 'integer', 'number', 'uuid', 'nanoid', 'sequence'].includes(iface) || ['string', 'bigInt', 'integer', 'text'].includes(type)) {
        opts.push({ label: `${f.uiSchema?.title || f.title || f.name} (${iface || type})`, value: f.name });
      }
    }
  } catch (_) { /* ignore */ }
  return opts;
}

export function registerScanLookupAction(deps: { flowEngine: any; flowSettings?: any; lane: string }) {
  const { flowEngine, flowSettings, lane } = deps;
  if (!flowEngine?.getModelClass) { console.warn('[device-kit] scan-lookup: no getModelClass'); return; }

  if (flowSettings?.registerComponents) {
    try { flowSettings.registerComponents({ SL_Grid: SettingsGrid, SL_Field, SL_Switch, SL_Text, SL_Outcome, SL_Reset: ResetButton, SL_Section: CollapsibleSection }); }
    catch (e) { console.warn('[device-kit] scan-lookup registerComponents failed', e); }
  }

  const bind = (attempt = 0) => {
    const ActionBase: any = flowEngine.getModelClass('ActionModel');
    if (!ActionBase) { if (attempt < 15) setTimeout(() => bind(attempt + 1), 800); return; }
    if (flowEngine.getModelClass('PtdlScanLookupActionModel')) return;

    class PtdlScanLookupActionModel extends ActionBase {
      static scene = 'collection';
      getAclActionName() { return 'view'; }
      render() { return <ScanLookupButton model={this} />; }
    }

    try {
      flowEngine.registerModels({ PtdlScanLookupActionModel });
      (PtdlScanLookupActionModel as any).define({ label: t('Quét mã → tra cứu'), sort: 66 });
      (PtdlScanLookupActionModel as any).registerFlow({
        key: 'ptdlScanLookup',
        title: te('Quét mã → tra cứu'),
        sort: 100,
        steps: {
          settings: {
            title: te('Cấu hình quét → tra cứu'),
            uiMode: { type: 'dialog', props: { width: 520 } },
            uiSchema: (ctx: any) => ({
              lookupField: fi(te('Field chứa mã (tra cứu trong bảng này)'), 'SL_Field', { componentProps: { options: lookupFieldOptions(ctx?.model) } }),
              outcome: fi(te('Khi tìm thấy'), 'SL_Outcome'),
              cartChannel: fi(te('Kênh giỏ (khớp Sub-table Pro)'), 'SL_Text', { componentProps: { placeholder: 'cart' }, reactions: undefined }),
              row1: {
                type: 'void', 'x-component': 'SL_Grid', 'x-component-props': { minColWidth: 140 },
                properties: {
                  continuous: fi(te('Quét liên tục (POS)'), 'SL_Switch', { type: 'boolean' }),
                  beep: fi(te('Bíp'), 'SL_Switch', { type: 'boolean' }),
                  vibrate: fi(te('Rung'), 'SL_Switch', { type: 'boolean' }),
                },
              },
              label: fi(te('Nhãn nút'), 'SL_Text', { componentProps: { placeholder: 'Quét mã' } }),
              reset: { type: 'void', 'x-component': 'SL_Reset', 'x-component-props': { defaults: SL_DEFAULTS, label: te('Đặt lại') }, 'x-decorator': 'FormItem' },
            }),
            defaultParams: { ...SL_DEFAULTS },
            handler(ctx: any, params: any) {
              const p = params || {};
              ctx.model.setProps({
                ptdlslField: p.lookupField || '',
                ptdlslOutcome: ['cart', 'filter', 'toast'].includes(p.outcome) ? p.outcome : 'cart',
                ptdlslChannel: p.cartChannel || 'cart',
                ptdlslContinuous: p.continuous !== false,
                ptdlslBeep: p.beep !== false,
                ptdlslVibrate: p.vibrate !== false,
                ptdlslLabel: p.label || '',
              });
            },
          },
        },
      });
      console.log(`[device-kit] (${lane}) scan-lookup action registered`);
    } catch (e) { console.warn('[device-kit] scan-lookup register failed', e); }
  };
  bind();
}
