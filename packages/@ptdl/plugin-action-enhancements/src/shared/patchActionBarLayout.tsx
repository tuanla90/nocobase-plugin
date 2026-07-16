import React from 'react';
import { Button } from 'antd';
import { observer, useForm } from '@formily/react';
import { rx } from '@ptdl/shared';
import { NS, t } from './i18n';
import { ActionBarLayout, previewBarStyle, nativeHArrange } from './ActionBarLayout';

/**
 * Feature B — register the "Action bar layout" config on each host block and wrap its renderComponent so
 * the chosen layout (and any per-button pins) is applied. Pattern: override renderComponent → call the
 * original → wrap (see enhanced-table-block). First cut: form-family blocks (single action Space).
 */
const CONFIG_PROP = 'ptdlActionBar';

const TARGET_BLOCKS: Array<{ name: string; kind: string }> = [
  { name: 'CreateFormModel', kind: 'form' },
  { name: 'EditFormModel', kind: 'form' },
  { name: 'DetailsBlockModel', kind: 'form' },
  { name: 'FilterFormBlockModel', kind: 'form' },
  { name: 'TableBlockModel', kind: 'table' },
];

/** Live preview inside the layout dialog — reads the sibling form values reactively and renders a mini
 *  action bar through the SAME layout logic (previewBarStyle mirrors buildCss). */
const ActionBarPreview: any = observer(() => {
  const form: any = useForm();
  const v = (form && form.values) || {};
  const { container, item } = previewBarStyle({ direction: v.direction, hArrange: v.hArrange, vArrange: v.vArrange });
  return (
    <div style={{ padding: 12, background: 'var(--colorFillQuaternary, #fafafa)', borderRadius: 6, border: '1px dashed #d9d9d9' }}>
      <div style={container}>
        <Button type="primary" style={item}>
          {t('Save')}
        </Button>
        <Button style={item}>{t('Cancel')}</Button>
      </div>
    </div>
  );
});

let previewRegistered = false;

function registerLayoutFlow(BlockClass: any, te: (s: string) => any, kind: string) {
  BlockClass.registerFlow({
    key: 'ptdlActionBar',
    title: te('Action bar layout'),
    sort: 850,
    steps: {
      layout: {
        title: te('Action bar layout'),
        uiMode: { type: 'dialog', props: { width: 560 } },
        uiSchema: {
          preview: {
            type: 'void',
            'x-decorator': 'FormItem',
            'x-decorator-props': { style: { marginBottom: 8 } },
            'x-component': 'PtdlActionBarPreview',
          },
          direction: {
            'x-decorator': 'FormItem',
            'x-component': 'Radio.Group',
            'x-component-props': { optionType: 'button', buttonStyle: 'solid' },
            title: te('Direction'),
            enum: [
              { value: 'horizontal', label: te('Horizontal') },
              { value: 'vertical', label: te('Vertical (stacked)') },
            ],
          },
          // Horizontal main-axis arrangement — button group, shown only when horizontal (no dead option).
          hArrange: {
            'x-decorator': 'FormItem',
            'x-component': 'Radio.Group',
            'x-component-props': { optionType: 'button', buttonStyle: 'solid' },
            title: te('Arrangement'),
            'x-reactions': rx((v: any) => (v?.direction || 'horizontal') !== 'vertical'),
            enum: [
              { value: 'left', label: te('Left') },
              { value: 'center', label: te('Center') },
              { value: 'right', label: te('Right') },
              { value: 'between', label: te('Between') },
              { value: 'around', label: te('Around') },
              { value: 'fill', label: te('Fill') },
            ],
          },
          // Vertical cross-axis alignment — button group, shown only when vertical.
          vArrange: {
            'x-decorator': 'FormItem',
            'x-component': 'Radio.Group',
            'x-component-props': { optionType: 'button', buttonStyle: 'solid' },
            title: te('Alignment'),
            'x-reactions': rx((v: any) => (v?.direction || 'horizontal') === 'vertical'),
            enum: [
              { value: 'left', label: te('Left') },
              { value: 'center', label: te('Center') },
              { value: 'right', label: te('Right') },
              { value: 'fill', label: te('Full width') },
            ],
          },
        },
        defaultParams(ctx: any) {
          const s = ctx.model?.props?.[CONFIG_PROP] || {};
          return {
            direction: s.direction || 'horizontal',
            hArrange: s.hArrange || nativeHArrange(kind), // form → 'left', table → 'between'
            vArrange: s.vArrange || 'fill',
          };
        },
        handler(ctx: any, params: any) {
          ctx.model.setProps({ [CONFIG_PROP]: params || {} });
        },
      },
    },
  });
}

function patchRenderComponent(BlockClass: any, kind: string) {
  const orig = BlockClass.prototype.renderComponent;
  if (!orig) return;
  BlockClass.prototype.renderComponent = function patchedRenderComponent() {
    const el = orig.call(this);
    if (!React.isValidElement(el)) return el;
    // Always wrap — ActionBarLayout is an observer that reads config/pins from the model itself, so it
    // re-applies even when this (heavy) block doesn't re-render. Inactive = transparent passthrough.
    return (
      <ActionBarLayout model={this} kind={kind}>
        {el}
      </ActionBarLayout>
    );
  };
}

export function patchActionBarLayout(deps: { flowEngine: any; tExpr: (s: string, o?: any) => any; lane: string }) {
  const { flowEngine, tExpr, lane } = deps;
  const te = (s: string) => tExpr(s, { ns: NS });

  const bind = (attempt = 0) => {
    if (!previewRegistered && flowEngine?.flowSettings?.registerComponents) {
      try {
        flowEngine.flowSettings.registerComponents({ PtdlActionBarPreview: ActionBarPreview });
        previewRegistered = true;
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn(`[action-enh] (${lane}) action-bar preview registerComponents failed`, e);
      }
    }
    const resolved = TARGET_BLOCKS.map((b) => ({ ...b, cls: flowEngine?.getModelClass?.(b.name) }));
    const missing = resolved.filter((r) => !r.cls);
    if (missing.length && attempt < 15) setTimeout(() => bind(attempt + 1), 800);
    for (const r of resolved) {
      if (!r.cls || r.cls.__ptdlActionBarPatched) continue;
      r.cls.__ptdlActionBarPatched = true;
      try {
        registerLayoutFlow(r.cls, te, r.kind);
        patchRenderComponent(r.cls, r.kind);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn(`[action-enh] (${lane}) action-bar patch failed for ${r.name}`, e);
      }
    }
  };

  bind();
}
