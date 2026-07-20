import React from 'react';
import { registerFlowComponentsOnce } from '@tuanla90/shared';
import { Switch } from 'antd';
import { upsertFieldWidget } from './fieldWidgetStore';

/**
 * Shared "Apply to all views" toggle for the no-code widget dialogs.
 *
 * A widget's settings dialog adds `globalToggleField(t)` to its uiSchema and calls
 * `saveWidgetGlobal(ctx, params, '<ModelName>', <configProps>)` at the end of its handler. When the
 * toggle is on, the widget + its config is written to `ptdlFieldWidget` (keyed by collection+field), and
 * the display patch in registerAll then renders that widget for the field in EVERY table/detail — no
 * per-block config. The per-block config is still set too, so the block you configured keeps working.
 */

export const GlobalWidgetToggle: React.FC<{ value?: boolean; onChange?: (v: boolean) => void; title?: string; hint?: string }> = (props) => {
  const on = !!props.value;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10,
      background: on ? 'var(--colorPrimaryBg, rgba(22,119,255,0.08))' : 'var(--colorFillQuaternary, #fafafa)',
      border: `1px solid ${on ? 'var(--colorPrimaryBorder, #91caff)' : 'var(--colorBorderSecondary, #f0f0f0)'}`,
    }}>
      <Switch checked={on} onChange={(c: any) => props.onChange?.(c)} />
      <div style={{ lineHeight: 1.35, minWidth: 0 }}>
        <div style={{ fontWeight: 500, fontSize: 13 }}>{props.title || 'Áp dụng cho mọi view'}</div>
        {props.hint ? <div style={{ fontSize: 12, color: 'var(--colorTextTertiary, #8c8c8c)' }}>{props.hint}</div> : null}
      </div>
    </div>
  );
};

/** Register the toggle component once (called from registerAll for both lanes). */
export function registerGlobalWidgetComponents(flowSettings: any): void {
  try { registerFlowComponentsOnce(flowSettings, { PtdlGlobalWidgetToggle: GlobalWidgetToggle }); } catch (_) { /* optional */ }
}

/** uiSchema fragment for the toggle. `t` = the widget's tExpr translator (compiled in x-component-props). */
export function globalToggleField(t: (s: string) => any): Record<string, any> {
  return {
    applyGlobal: {
      type: 'boolean',
      'x-decorator': 'FormItem',
      'x-decorator-props': { style: { marginBottom: 12 } },
      'x-component': 'PtdlGlobalWidgetToggle',
      'x-component-props': {
        title: t('Áp dụng cho mọi view (mọi bảng/chi tiết dùng cột này)'),
        hint: t('Bật: dùng widget này làm mặc định của cột — hiện ở mọi nơi, không cần cấu hình từng block.'),
      },
    },
  };
}

/** Persist the widget+config to the global store when the toggle is on. Call at the end of the handler. */
export async function saveWidgetGlobal(ctx: any, params: any, widgetModel: string, config: any): Promise<void> {
  if (!params?.applyGlobal) return;
  const cf = ctx?.model?.collectionField || ctx?.model?.context?.collectionField;
  const api = ctx?.model?.context?.api || ctx?.model?.flowEngine?.context?.api || (ctx?.app?.apiClient);
  if (!cf || !api) return;
  const ds = cf.dataSourceKey;
  const coll = cf.collectionName || cf.collection?.name;
  const field = cf.name;
  try { await upsertFieldWidget(api, ds, coll, field, widgetModel, config); }
  catch (e) { /* eslint-disable-next-line no-console */ console.warn('[field-enh] save global widget failed', e); }
}
