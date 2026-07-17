import React, { useState } from 'react';
import { Button, Modal, message, Select, Switch, Input } from 'antd';
import { SettingsGrid, fi, ResetButton, CollapsibleSection } from '@ptdl/shared';
import { getCurrentFix, formatFix, type GeoFix } from './geo';
import { PermissionHelp } from './permissionHelp';
import { te, t } from './i18n';

/**
 * C2 — "Check-in" record action. A 1-tap button on a table row / detail / form action bar that captures
 * the current GPS and writes it into a chosen Location field of THAT record (via `<collection>:update`),
 * then refreshes the block. For quick attendance / visit confirmation without opening a form.
 *
 * Registered as a custom record-scene ActionModel (house pattern: getModelClass('ActionModel') → subclass
 * → define({label}) so it shows in "Add action"). Client-only; writes through the existing resource API.
 */

const CI_DEFAULTS = {
  checkinField: '' as string,
  highAccuracy: true,
  confirm: false,
  label: '' as string,
};

function apiOf(model: any): any {
  return model?.context?.api || model?.flowEngine?.context?.api || model?.context?.app?.apiClient || model?.app?.apiClient;
}

function recordCtxOf(model: any): { filterByTk?: any; collectionName?: string; refresh?: () => void } {
  let filterByTk, collectionName, refresh;
  try {
    const args = model?.getInputArgs?.() || {};
    filterByTk = args.filterByTk ?? model?.context?.filterByTk ?? args.record?.id;
  } catch (_) { /* ignore */ }
  // Walk up to the collection block for the collection name + a resource to refresh.
  let n = model;
  for (let i = 0; i < 12 && n; i++) {
    collectionName = collectionName || n.collectionName || n.collection?.name || n.context?.collectionName;
    const res = n.resource || n.context?.resource;
    if (!refresh && res?.refresh) refresh = () => { try { res.refresh(); } catch (_) { /* ignore */ } };
    if (collectionName && refresh) break;
    n = n.parent;
  }
  return { filterByTk, collectionName, refresh };
}

function ciCfg(p: any) {
  return {
    checkinField: p.ptdlciField || '',
    highAccuracy: p.ptdlciHighAcc !== false,
    confirm: !!p.ptdlciConfirm,
    label: p.ptdlciLabel || '',
  };
}

const CheckinButton: React.FC<{ model: any }> = ({ model }) => {
  const [busy, setBusy] = useState(false);
  const p = model.props || {};
  const cfg = ciCfg(p);

  const run = async () => {
    const api = apiOf(model);
    const { filterByTk, collectionName, refresh } = recordCtxOf(model);
    const field = cfg.checkinField;
    if (!field) { message.warning(t('Chưa chọn field Vị trí để ghi (mở cấu hình action).')); return; }
    if (!api?.request || !collectionName || filterByTk == null) {
      message.error(t('Không xác định được bản ghi để check-in.'));
      return;
    }
    setBusy(true);
    let fix: GeoFix;
    try {
      fix = await getCurrentFix({ enableHighAccuracy: cfg.highAccuracy, timeoutMs: 8000, maximumAgeMs: 30000 });
      fix.src = 'gps';
    } catch (e: any) {
      setBusy(false);
      if (e?.code === 'denied') {
        Modal.warning({ title: t('Chưa được cấp quyền vị trí'), content: <PermissionHelp kind="location" compact />, okText: t('Đã hiểu') });
      } else {
        message.error(t('Không lấy được vị trí.'));
      }
      return;
    }
    try {
      await api.request({ url: `${collectionName}:update`, method: 'post', params: { filterByTk }, data: { [field]: fix } });
      message.success(`📍 ${t('Đã check-in')} · ${formatFix(fix)}`);
      refresh?.();
    } catch (e: any) {
      message.error(t('Lưu check-in thất bại.') + (e?.message ? ` (${e.message})` : ''));
    }
    setBusy(false);
  };

  const doClick = () => {
    if (cfg.confirm) {
      Modal.confirm({ title: t('Check-in vị trí hiện tại?'), okText: t('Check-in'), cancelText: t('Huỷ'), onOk: run });
    } else run();
  };

  return (
    <Button size="small" loading={busy} onClick={doClick} icon={<span>📍</span>}>
      {cfg.label || t('Check-in')}
    </Button>
  );
};

// ---- settings components ------------------------------------------------------------------------
const CI_Field = (props: any) => {
  const opts = Array.isArray(props.options) ? props.options : [];
  return <Select style={{ width: '100%' }} showSearch optionFilterProp="label" placeholder={t('Chọn field Vị trí (GPS)')}
    value={props.value ?? undefined} onChange={(v: any) => props.onChange?.(v || undefined)} options={opts} />;
};
const CI_Switch = (props: any) => <Switch checked={!!props.value} onChange={(c: any) => props.onChange?.(c)} />;
const CI_Text = (props: any) => <Input value={props.value} onChange={(e: any) => props.onChange?.(e.target.value)} placeholder={props.placeholder} />;

function checkinFieldOptions(model: any): any[] {
  const coll = model?.collection || model?.context?.collection;
  const opts: any[] = [];
  try {
    const fields = coll?.getFields?.() || [];
    for (const f of fields) {
      if (!f?.name) continue;
      const iface = f?.interface || f?.options?.interface;
      const type = f?.type || f?.options?.type;
      if (iface === 'ptdlLocation' || type === 'json' || iface === 'json') {
        opts.push({ label: `${f.uiSchema?.title || f.title || f.name} (${iface || type})`, value: f.name });
      }
    }
  } catch (_) { /* ignore */ }
  return opts;
}

export function registerCheckinAction(deps: { flowEngine: any; flowSettings?: any; lane: string }) {
  const { flowEngine, flowSettings, lane } = deps;
  if (!flowEngine?.getModelClass) { console.warn('[device-kit] checkin: no getModelClass'); return; }

  if (flowSettings?.registerComponents) {
    try { flowSettings.registerComponents({ CI_Grid: SettingsGrid, CI_Field, CI_Switch, CI_Text, CI_Reset: ResetButton, CI_Section: CollapsibleSection }); }
    catch (e) { console.warn('[device-kit] checkin registerComponents failed', e); }
  }

  const bind = (attempt = 0) => {
    const ActionBase: any = flowEngine.getModelClass('ActionModel');
    if (!ActionBase) { if (attempt < 15) setTimeout(() => bind(attempt + 1), 800); return; }
    if (flowEngine.getModelClass('PtdlCheckinActionModel')) return;

    class PtdlCheckinActionModel extends ActionBase {
      static scene = 'record';
      getAclActionName() { return 'update'; }
      render() { return <CheckinButton model={this} />; }
    }

    try {
      flowEngine.registerModels({ PtdlCheckinActionModel });
      (PtdlCheckinActionModel as any).define({ label: t('Check-in (vị trí)'), sort: 65 });
      (PtdlCheckinActionModel as any).registerFlow({
        key: 'ptdlCheckin',
        title: te('Check-in (vị trí)'),
        sort: 100,
        steps: {
          settings: {
            title: te('Cấu hình Check-in'),
            uiMode: { type: 'dialog', props: { width: 500 } },
            uiSchema: (ctx: any) => ({
              checkinField: fi(te('Ghi vào field Vị trí'), 'CI_Field', { componentProps: { options: checkinFieldOptions(ctx?.model) } }),
              row1: {
                type: 'void', 'x-component': 'CI_Grid', 'x-component-props': { minColWidth: 150 },
                properties: {
                  highAccuracy: fi(te('Độ chính xác cao'), 'CI_Switch', { type: 'boolean' }),
                  confirm: fi(te('Hỏi xác nhận'), 'CI_Switch', { type: 'boolean' }),
                },
              },
              label: fi(te('Nhãn nút (trống = "Check-in")'), 'CI_Text', { componentProps: { placeholder: 'Check-in' } }),
              reset: { type: 'void', 'x-component': 'CI_Reset', 'x-component-props': { defaults: CI_DEFAULTS, label: te('Đặt lại') }, 'x-decorator': 'FormItem' },
            }),
            defaultParams: { ...CI_DEFAULTS },
            handler(ctx: any, params: any) {
              const p = params || {};
              ctx.model.setProps({
                ptdlciField: p.checkinField || '',
                ptdlciHighAcc: p.highAccuracy !== false,
                ptdlciConfirm: !!p.confirm,
                ptdlciLabel: p.label || '',
              });
            },
          },
        },
      });
      console.log(`[device-kit] (${lane}) check-in action registered`);
    } catch (e) { console.warn('[device-kit] checkin register failed', e); }
  };
  bind();
}
