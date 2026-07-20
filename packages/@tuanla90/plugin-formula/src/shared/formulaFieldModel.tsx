import React from 'react';
import { evaluateFormula, resultToString } from './formulaEngine';
import { applyFormulaFormat } from './formulaFormat';
import { registerFormulaComponents, formulaStepUiSchema } from './formulaEditorComponents';
import { NS, t as rt } from './i18n';

/**
 * @tuanla90/plugin-formula — display field model.
 * Attach "Formula" to any field; instead of the raw value it shows the result of an Excel-style
 * formula evaluated against the whole row record (`data`) — optionally rendered as HTML.
 * (For a standalone virtual column not tied to a field, see formulaColumnModel.tsx.)
 */

type Deps = {
  flowEngine: any;
  flowSettings?: any;
  Base: any; // DisplayTextFieldModel (per-lane import)
  CollectionFieldModel?: any;
  tExpr?: (s: string, opts?: any) => any;
};

export function registerFormulaModel({ flowEngine, flowSettings, Base, CollectionFieldModel, tExpr }: Deps) {
  if (!flowEngine || !Base) {
    // eslint-disable-next-line no-console
    console.warn('[formula] missing flowEngine or Base — skip', { flowEngine: !!flowEngine, Base: !!Base });
    return;
  }
  const t = (s: string) => (tExpr ? tExpr(s, { ns: NS }) : s);

  registerFormulaComponents(flowSettings);

  class FormulaFieldModel extends Base {
    renderComponent(value: any, wrap: any) {
      const p: any = (this as any).props || {};
      const formula: string = p.formula || '';
      if (!formula.trim()) return super.renderComponent(value, wrap);

      const record = (this as any).context?.record ?? {};
      const res = evaluateFormula(formula, record, value);
      const align = p.align || 'left';

      if ('error' in res) {
        return (
          <span
            title={rt('Lỗi công thức') + ': ' + res.error.message + '\n\n' + formula}
            style={{ color: '#cf1322', fontFamily: 'monospace', fontSize: 12, cursor: 'help' }}
          >
            #ERR
          </span>
        );
      }
      const fmt = applyFormulaFormat(res.value, {
        fmtType: p.fmtType,
        fmtThousands: p.fmtNumber?.thousands,
        fmtDecimals: p.fmtNumber?.decimals,
        fmtDate: p.fmtDate,
      });
      const text = fmt !== null ? fmt : resultToString(res.value);
      const style: React.CSSProperties = { display: 'block', textAlign: align, width: '100%' };
      if (text === '' || res.value === null || res.value === undefined) {
        return <span style={{ color: '#bbb' }} />;
      }
      if (fmt === null && p.renderHtml !== false) {
        return <span style={style} dangerouslySetInnerHTML={{ __html: text }} />;
      }
      return <span style={style}>{text}</span>;
    }
  }

  flowEngine.registerModels({ FormulaFieldModel });

  try {
    (FormulaFieldModel as any).registerFlow({
      key: 'formulaSettings',
      sort: 502, // right after core column/field settings (500) and conditional-format (501)
      title: t('Công thức'),
      steps: {
        formula: {
          title: t('Công thức'),
          uiMode: { type: 'dialog', props: { width: 640 } },
          uiSchema: (ctx: any) => formulaStepUiSchema(t, ctx),
          defaultParams: { formula: '', renderHtml: true, align: 'left', fmtType: 'auto', fmtNumber: {}, fmtDate: 'DD/MM/YYYY' },
          handler(ctx: any, params: any) {
            ctx.model.setProps('formula', params?.formula || '');
            ctx.model.setProps('renderHtml', params?.renderHtml !== false);
            ctx.model.setProps('align', params?.align || 'left');
            ctx.model.setProps('fmtType', params?.fmtType || 'auto');
            ctx.model.setProps('fmtNumber', params?.fmtNumber || {});
            ctx.model.setProps('fmtDate', params?.fmtDate || 'DD/MM/YYYY');
          },
        },
      },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[formula] registerFlow failed', e);
  }

  // Make "Formula" an available (non-default) display option for common field interfaces.
  const interfaces = [
    'input', 'email', 'phone', 'uuid', 'nanoid', 'textarea', 'url',
    'integer', 'number', 'percent', 'select', 'radioGroup', 'multipleSelect', 'singleSelect',
  ];
  const binder = [FormulaFieldModel, Base, CollectionFieldModel].find(
    (c: any) => c && typeof c.bindModelToInterface === 'function',
  );
  try {
    (binder as any)?.bindModelToInterface('FormulaFieldModel', interfaces, { isDefault: false });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[formula] bind failed', e);
  }
  try {
    (FormulaFieldModel as any).define?.({ label: t('Công thức') });
  } catch (e) {
    /* define optional */
  }

  return FormulaFieldModel;
}
