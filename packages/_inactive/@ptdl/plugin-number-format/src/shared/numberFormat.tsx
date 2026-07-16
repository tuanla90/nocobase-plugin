import React from 'react';

/**
 * Formatted-number field for FORM inputs — extracted from @ptdl/plugin-icon-kit to be
 * researched on its own.
 *
 * The formatter/parser below is the user's CONFIRMED-WORKING RunJS logic (thousands
 * separators live while typing, prefix/suffix, decimals).
 *
 * ── OPEN RESEARCH ISSUE (2026-07) ──────────────────────────────────────────────
 * Registering a NEW flow on the core `NumberFieldModel` (see registerNumberFormatModel)
 * does NOT surface in the FORM field settings menu (the ⋮ menu). Investigation of the
 * minified client-v2 bundle showed that menu renders only SPECIFIC named settings flows
 * (`formItemSettings`, `numberSettings`, `displayFieldSettings`, …) — not arbitrary new
 * flows. Table COLUMNS expose new models/settings via `tableColumnSettings`, but forms
 * do not have an equivalent field-component / arbitrary-flow hook.
 *
 * Directions to try when we research this:
 *   1. Inject a STEP into the EXISTING `numberSettings` flow (it already lives on the
 *      number model) via `FlowDefinition.addStep(stepKey, step)` instead of a new flow.
 *      Risk: must not clobber the core steps — fetch NocoBase source for `numberSettings`
 *      first (curl raw.githubusercontent.com/nocobase/nocobase/main/... — WebFetch summarizes).
 *   2. Find the form field-ITEM settings model (`formItemSettings` is on a minified `uK`)
 *      and register the step there, then reach the number sub-model to setProps.
 *   3. Value binding is easy: `NumberFieldModel.render()` = `<InputNumberField {...this.props}/>`,
 *      so `this.props` carries value+onChange; setProps('formatter'/'parser') reaches the
 *      antd InputNumber. That part is proven — only the SETTINGS-MENU placement is open.
 *   4. Fallback that WORKS today: the RunJS number-format field (JSEditableFieldModel) —
 *      see D:\Users\tuanla2\Documents\nocobase-plugin-build\runjs-number-format.js
 * ───────────────────────────────────────────────────────────────────────────────
 */

export function makeNumberFormatter(cfg: any) {
  const S = cfg?.style === 'dot' ? { t: '.', d: ',' } : { t: ',', d: '.' };
  return (val: any) => {
    if (val === undefined || val === null || val === '') return '';
    const s = String(val);
    const neg = s.trim().startsWith('-');
    const p = s.replace('-', '').split('.');
    const intPart = (p[0] || '0').replace(/\B(?=(\d{3})+(?!\d))/g, S.t);
    let out = intPart;
    if (p[1] !== undefined && p[1] !== '') out += S.d + p[1];
    return (neg ? '-' : '') + (cfg?.prefix || '') + out + (cfg?.suffix || '');
  };
}

export function makeNumberParser(cfg: any) {
  const S = cfg?.style === 'dot' ? { t: '.', d: ',' } : { t: ',', d: '.' };
  return (val: any) => {
    if (!val) return '';
    let v = String(val);
    if (cfg?.prefix) v = v.split(cfg.prefix).join('');
    if (cfg?.suffix) v = v.split(cfg.suffix).join('');
    v = v.split(S.t).join('');
    if (S.d !== '.') v = v.split(S.d).join('.');
    return v.replace(/[^\d.-]/g, '');
  };
}

type NumDeps = {
  NumberFieldModel?: any;
  tExpr?: (s: string, opts?: any) => any;
};

// Attempt #1 (flow-on-core). Registers, but the step does NOT show in the form menu — see issue above.
export function registerNumberFormatModel({ NumberFieldModel, tExpr }: NumDeps) {
  if (!NumberFieldModel || typeof (NumberFieldModel as any).registerFlow !== 'function') {
    // eslint-disable-next-line no-console
    console.warn('[number-format] NumberFieldModel unavailable — skip');
    return;
  }
  const t = (s: string) => (tExpr ? tExpr(s) : s);
  try {
    (NumberFieldModel as any).registerFlow({
      key: 'numberFormat',
      sort: 250,
      title: t('Number format'),
      steps: {
        fmt: {
          title: t('Format'),
          uiSchema: {
            style: {
              type: 'string',
              title: t('Thousands style'),
              'x-decorator': 'FormItem',
              'x-component': 'Select',
              enum: [
                { label: t('None'), value: 'none' },
                { label: '1,234.56', value: 'comma' },
                { label: '1.234,56 (VN)', value: 'dot' },
              ],
              default: 'none',
            },
            decimals: {
              type: 'number',
              title: t('Decimals'),
              'x-decorator': 'FormItem',
              'x-component': 'Select',
              enum: [
                { label: '0', value: 0 },
                { label: '1', value: 1 },
                { label: '2', value: 2 },
                { label: '3', value: 3 },
                { label: '4', value: 4 },
              ],
              default: 0,
            },
            prefix: { type: 'string', title: t('Prefix'), 'x-decorator': 'FormItem', 'x-component': 'Input', 'x-component-props': { placeholder: '₫ ' } },
            suffix: { type: 'string', title: t('Suffix'), 'x-decorator': 'FormItem', 'x-component': 'Input', 'x-component-props': { placeholder: ' đ' } },
          },
          defaultParams: { style: 'none', decimals: 0, prefix: '', suffix: '' },
          handler(ctx: any, params: any) {
            const style = params?.style || 'none';
            if (style === 'none') {
              ctx.model.setProps('formatter', undefined);
              ctx.model.setProps('parser', undefined);
              return;
            }
            const cfg = { style, prefix: params?.prefix || '', suffix: params?.suffix || '', decimals: params?.decimals };
            ctx.model.setProps('formatter', makeNumberFormatter(cfg));
            ctx.model.setProps('parser', makeNumberParser(cfg));
            ctx.model.setProps('controls', false);
            if (cfg.decimals !== undefined && cfg.decimals !== null && cfg.decimals !== '') {
              ctx.model.setProps('precision', Number(cfg.decimals));
            }
          },
        },
      },
    });
    // eslint-disable-next-line no-console
    console.log('[number-format] flow registered on NumberFieldModel (note: not yet shown in form menu)');
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[number-format] registerFlow failed', e);
  }
}
