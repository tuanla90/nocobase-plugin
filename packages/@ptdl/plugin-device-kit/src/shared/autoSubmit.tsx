import React from 'react';
import { Switch, Select, theme } from 'antd';
import { message } from 'antd';
import { SettingsGrid, fi, CollapsibleSection } from '@ptdl/shared';
import { getCurrentFix, type GeoFix } from './geo';
import { getDeviceInfo } from './deviceInfo';
import { te, t } from './i18n';

/**
 * "Auto ghi nhận khi Lưu" — capture the device GPS (and enforce photo/required rules) automatically when a
 * Create/Edit form is submitted, so the user just presses Save.
 *
 * Design (docs/DEVICE-KIT-AUTOSUBMIT-RESEARCH.md): the master ENABLE is a FORM-block setting; the per-field
 * options (timing / required / require-photo) live in each device field's own config. GPS is async, so we
 * hook the form's async `submitHandler` — capture BEFORE the original runs (i.e. before validation + value
 * collection), so a required Location field is populated in time.
 *
 * Mechanism = the house pattern: resolve the block model via flowEngine.getModelClass and monkeypatch it
 * (same as conditional-format on TableBlockModel.getColumns / detail-panel rowClick). Client-only, /v/-only.
 */

// ---- descendant walk: collect our device field models in a form -------------------------------
function walkModels(model: any, out: any[], depth = 0) {
  if (!model || depth > 12) return;
  const sm = model.subModels;
  if (!sm) return;
  for (const key of Object.keys(sm)) {
    const v = (sm as any)[key];
    const arr = Array.isArray(v) ? v : [v];
    for (const child of arr) {
      if (!child) continue;
      out.push(child);
      walkModels(child, out, depth + 1);
    }
  }
}

function fieldNameOf(m: any): string | undefined {
  return m?.collectionField?.name || m?.parent?.collectionField?.name || m?.props?.name || m?.parent?.props?.name;
}

/** true if the model (by class name) is one of ours. */
function classOf(m: any): string {
  try { return m?.constructor?.name || ''; } catch (_) { return ''; }
}

// ---- the capture routine, run at submit --------------------------------------------------------
async function ptdlAutoCapture(formModel: any): Promise<void> {
  // Form-level master switch.
  let enabled = false;
  try { enabled = !!formModel?.getStepParams?.('ptdlAutoCapture', 'settings')?.enabled; } catch (_) { /* ignore */ }
  if (!enabled) return;

  const all: any[] = [];
  walkModels(formModel, all);

  const locations = all.filter((m) => classOf(m) === 'PtdlLocationFieldModel');
  const cameras = all.filter((m) => classOf(m) === 'PtdlCameraFieldModel');

  const errors: string[] = [];

  // 1) Auto-capture GPS for each Location field.
  for (const m of locations) {
    const name = fieldNameOf(m);
    if (!name) continue;
    const p = m.props || {};
    const when = p.ptdllAutoWhen === 'always' ? 'always' : 'ifEmpty';
    const required = !!p.ptdllAutoRequired;
    const highAcc = p.ptdllHighAcc !== false;

    // Current value (skip if "only when empty" and already set).
    let cur: any;
    try { cur = formModel.form?.getFieldValue?.(name); } catch (_) { cur = undefined; }
    const hasVal = cur && (typeof cur === 'object' ? cur.lat != null : String(cur).trim() !== '');
    if (when === 'ifEmpty' && hasVal) continue;

    try {
      const fix: GeoFix = await getCurrentFix({ enableHighAccuracy: highAcc, timeoutMs: 6000, maximumAgeMs: 60000 });
      try { formModel.setFieldValue?.(name, fix); } catch (_) { formModel.form?.setFieldValue?.(name, fix); }
    } catch (e: any) {
      if (required) {
        const label = p.title || name;
        errors.push(t('Không lấy được vị trí cho "{{f}}".').replace('{{f}}', String(label)));
      }
      // not required → leave empty, submit proceeds
    }
  }

  // 2) Optionally stamp device info (OS/browser/model/screen/pseudo-id) into a chosen field.
  try {
    const deviceField = formModel?.getStepParams?.('ptdlAutoCapture', 'settings')?.deviceField;
    if (deviceField) {
      const info = getDeviceInfo();
      try { formModel.setFieldValue?.(deviceField, info); } catch (_) { formModel.form?.setFieldValue?.(deviceField, info); }
    }
  } catch (_) { /* ignore */ }

  // 3) Enforce "require photo" for each Camera field.
  for (const m of cameras) {
    const name = fieldNameOf(m);
    if (!name) continue;
    const p = m.props || {};
    if (!p.ptdlcRequirePhoto) continue;
    let cur: any;
    try { cur = formModel.form?.getFieldValue?.(name); } catch (_) { cur = undefined; }
    const count = Array.isArray(cur) ? cur.length : (cur ? 1 : 0);
    if (count < 1) {
      const label = p.title || name;
      errors.push(t('Cần chụp ít nhất 1 ảnh cho "{{f}}".').replace('{{f}}', String(label)));
    }
  }

  if (errors.length) {
    try { message.error(errors.join(' · ')); } catch (_) { /* ignore */ }
    const err: any = new Error(errors.join('; '));
    err.__ptdlBlock = true;
    throw err;
  }
}

// ---- settings components -----------------------------------------------------------------------
const ADK_Switch = (props: any) => <Switch checked={!!props.value} onChange={(c: any) => props.onChange?.(c)} />;
const ADK_Field = (props: any) => {
  const opts = Array.isArray(props.options) ? props.options : [];
  return (
    <Select
      style={{ width: '100%' }} allowClear showSearch optionFilterProp="label"
      placeholder={t('(Không lưu)')}
      value={props.value ?? undefined}
      onChange={(v: any) => props.onChange?.(v || undefined)}
      options={opts}
    />
  );
};
const ADK_Hint = () => {
  const { token } = theme.useToken();
  return (
  <div style={{ fontSize: 12, color: token.colorTextTertiary, lineHeight: 1.5 }}>
    {t('Khi bật: lúc Lưu form này, các field "Vị trí (GPS)" sẽ tự lấy toạ độ (theo cấu hình từng field), và field "Chụp ảnh" đặt bắt buộc sẽ chặn lưu nếu chưa có ảnh. Giờ & người ghi tự động dùng trường hệ thống (createdAt/updatedAt/createdBy).')}
    <br />
    {t('Thông tin thiết bị ghi được: hệ điều hành, trình duyệt, dòng máy (Android; iOS chỉ "iPhone"), độ phân giải, ID-giả. KHÔNG lấy được IMEI/ID phần cứng; IP cần lấy phía máy chủ.')}
  </div>
  );
};

/** Fields of the form's collection that can hold device info (json preferred; any text ok). */
function deviceFieldOptions(model: any): any[] {
  const coll = model?.collection || model?.context?.collection || model?.context?.collectionField?.collection;
  const opts: any[] = [];
  try {
    const fields = coll?.getFields?.() || [];
    for (const f of fields) {
      if (!f?.name) continue;
      const iface = f?.interface || f?.options?.interface;
      const type = f?.type || f?.options?.type;
      if (type === 'json' || iface === 'json' || iface === 'input' || iface === 'textarea' || type === 'string' || type === 'text') {
        opts.push({ label: `${f.uiSchema?.title || f.title || f.name} (${iface || type})`, value: f.name });
      }
    }
  } catch (_) { /* ignore */ }
  return opts;
}

// ---- registration ------------------------------------------------------------------------------
export function registerAutoSubmit(deps: { flowEngine: any; flowSettings?: any; lane: string }) {
  const { flowEngine, flowSettings, lane } = deps;
  if (!flowEngine?.getModelClass) { console.warn('[device-kit] autoSubmit: no getModelClass'); return; }

  if (flowSettings?.registerComponents) {
    try { flowSettings.registerComponents({ ADK_Switch, ADK_Field, ADK_Hint, ADK_Grid: SettingsGrid, ADK_Section: CollapsibleSection }); }
    catch (e) { console.warn('[device-kit] autoSubmit registerComponents failed', e); }
  }

  const settingsFlow: any = {
    key: 'ptdlAutoCapture',
    sort: 620,
    title: te('Tự động ghi nhận khi Lưu'),
    steps: {
      settings: {
        title: te('Tự động ghi nhận khi Lưu'),
        uiMode: { type: 'dialog', props: { width: 520 } },
        uiSchema: (ctx: any) => ({
          enabled: fi(te('Bật tự động ghi nhận khi Lưu'), 'ADK_Switch', { type: 'boolean' }),
          deviceField: fi(te('Ghi thông tin thiết bị vào field'), 'ADK_Field', { componentProps: { options: deviceFieldOptions(ctx?.model) } }),
          deviceHint: {
            type: 'void', 'x-component': 'ADK_Hint', 'x-decorator': 'FormItem', 'x-decorator-props': { style: { marginTop: 2 } },
          },
        }),
        defaultParams: { enabled: false },
        handler(_ctx: any, _params: any) {
          // Stored in stepParams; read at submit via getStepParams. Nothing to setProps.
        },
      },
    },
  };

  for (const cls of ['CreateFormModel', 'EditFormModel']) {
    const Cls: any = flowEngine.getModelClass(cls);
    if (!Cls) { console.warn(`[device-kit] (${lane}) autoSubmit: ${cls} not found — skip`); continue; }
    if (Cls.__ptdlAutoSubmit) continue;
    Cls.__ptdlAutoSubmit = true;

    // (a) form-block settings item.
    try { Cls.registerFlow(settingsFlow); } catch (e) { console.warn(`[device-kit] autoSubmit registerFlow ${cls} failed`, e); }

    // (b) patch async submitHandler — capture BEFORE the native pipeline runs.
    try {
      const proto = Cls.prototype;
      if (proto && typeof proto.submitHandler === 'function' && !proto.__ptdlAutoWrapped) {
        const orig = proto.submitHandler;
        proto.submitHandler = async function (ctx: any, params: any, cb?: any) {
          await ptdlAutoCapture(this); // throws {__ptdlBlock} to abort submit on required-fail
          return orig.call(this, ctx, params, cb);
        };
        proto.__ptdlAutoWrapped = true;
      }
    } catch (e) { console.warn(`[device-kit] autoSubmit patch ${cls} failed`, e); }

    console.log(`[device-kit] (${lane}) auto-capture wired on ${cls}`);
  }
}
