import React from 'react';
import { Typography } from 'antd';
import { evaluateFormula } from './formulaEngine';
import { FormulaCodeInput } from './formulaEditorComponents';
import { t } from './i18n';

/**
 * D2 — Excel formula mode for "Set default value".
 *
 * How it works:
 *  - The formula is COMPILED into a RunJS value `{ code, version:'v2', __formula }`, so it runs
 *    through NocoBase's existing reactive rule engine: the RunJS eval context exposes
 *    `ctx.formValues` (a dependency-TRACKING proxy of the form values) — every field the formula
 *    reads is recorded as a dep, and the default re-computes whenever that field changes.
 *  - The compiled code calls `ctx.libs.ptdlFormula.run(...)` — the engine object is injected into
 *    the RunJS sandbox via flow-engine's public `registerRunJSLib` API (see plugin load()).
 *  - The editor UI: we OVERRIDE the flow-settings-registered `DefaultValue` component with a
 *    wrapper — normal modes delegate to the captured original; a "ƒ Excel formula" link switches
 *    to our formula editor (the original formula string round-trips via `__formula` + a comment).
 */

export const FORMULA_LIB_NAME = 'ptdlFormula';

// The runtime object exposed as ctx.libs.ptdlFormula inside every RunJS sandbox.
// `run(expr, ctx)` picks the right data source: form values (default value / linkage),
// falling back to the row record (JS column) or a raw data object.
export const formulaRunJSLib = {
  run(expr: string, ctxOrData?: any) {
    const data = ctxOrData?.formValues ?? ctxOrData?.record ?? ctxOrData ?? {};
    const res = evaluateFormula(expr, data);
    if ('error' in res) throw res.error;
    return res.value;
  },
  evaluateFormula,
};

const CODE_HEADER = '// ptdl-formula:v1';

export function compileFormulaToRunJS(expr: string): string {
  return [
    CODE_HEADER + ' — ' + t('sinh tự động từ công thức Excel; sửa qua ô "Công thức" (đừng sửa tay).'),
    '// FORMULA: ' + JSON.stringify(expr),
    'const __f = await (ctx.libs && ctx.libs.' + FORMULA_LIB_NAME + ');',
    "if (!__f) throw new Error('@ptdl/plugin-formula is not loaded');",
    'return __f.run(' + JSON.stringify(expr) + ', ctx);',
  ].join('\n');
}

/** Returns the original Excel formula if `value` is one of ours, else null. */
export function extractFormula(value: any): string | null {
  if (!value || typeof value !== 'object') return null;
  if (typeof value.__formula === 'string') return value.__formula;
  const code = typeof value.code === 'string' ? value.code : '';
  if (!code.startsWith(CODE_HEADER)) return null;
  const m = code.match(/^\/\/ FORMULA: (.*)$/m);
  if (!m) return '';
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

export function makeFormulaValue(expr: string) {
  // Shape must satisfy isRunJSValue ({code, version}) so the core rule engine executes it;
  // __formula is an extra key that survives storage and lets the editor round-trip.
  return { code: compileFormulaToRunJS(expr), version: 'v2', __formula: expr };
}

function FormulaDefaultEditor({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  const expr = extractFormula(value) ?? '';
  return (
    <div style={{ width: '100%' }}>
      <FormulaCodeInput value={expr} onChange={(v: string) => onChange?.(makeFormulaValue(v || ''))} />
      <div style={{ marginTop: 4, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          <b>data</b> = {t('giá trị các field trong form (vd')} <code>data.total</code>{t(') — field đổi là tự tính lại.')}
        </Typography.Text>
        <a style={{ fontSize: 12, whiteSpace: 'nowrap' }} onClick={() => onChange?.('')}>
          ✕ {t('Bỏ công thức')}
        </a>
      </div>
    </div>
  );
}

/** Wrap the original DefaultValue component: keep every normal mode, add the formula mode. */
export function wrapDefaultValueComponent(Original: any) {
  const Wrapped: React.FC<any> = (props: any) => {
    const { value, onChange } = props;
    if (extractFormula(value) !== null) {
      return <FormulaDefaultEditor value={value} onChange={onChange} />;
    }
    return (
      <div style={{ width: '100%' }}>
        {React.createElement(Original, props)}
        <div style={{ marginTop: 4 }}>
          <a style={{ fontSize: 12 }} onClick={() => onChange?.(makeFormulaValue(''))}>
            ƒ {t('Dùng công thức Excel')}
          </a>
        </div>
      </div>
    );
  };
  Wrapped.displayName = 'DefaultValueWithFormula';
  return Wrapped;
}

// "Snippets" button in every RunJS editor: register a ready-made Excel-formula template so the
// user doesn't have to remember the ctx.libs one-liner (contexts:'*' → shows in all RunJS editors).
// Built lazily (not a module const) so t() runs after setRuntimeT() has wired the app translator.
function buildFormulaSnippet() {
  return {
    contexts: ['*'],
    prefix: 'formula',
    label: t('Công thức Excel (ptdlFormula)'),
    description: t('Tính giá trị bằng công thức Excel (~400 hàm formulajs). data = giá trị form/record; đổi field là tự tính lại.'),
    content: [
      "const FORMULA = 'data.quantity * data.unit_price'; // " + t('← sửa công thức Excel tại đây'),
      '// ' + t('VD: IF(data.total>1000000,"VIP","Thường") · UPPER(LEFT(data.name,3)) & "-" & YEAR(TODAY()) · SUM(data.items.amount)'),
      'return (await ctx.libs.' + FORMULA_LIB_NAME + ').run(FORMULA, ctx);',
    ].join('\n'),
  };
}

let snippetRegistered = false;
export function registerFormulaSnippet(registerRunJSSnippet: any) {
  if (snippetRegistered || typeof registerRunJSSnippet !== 'function') return;
  snippetRegistered = true;
  try {
    registerRunJSSnippet('ptdl/formula/excel', async () => ({ default: buildFormulaSnippet() }), { override: true });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[formula] register snippet failed', e);
  }
}

let overridden = false;
export function overrideDefaultValueComponent(flowSettings: any) {
  if (!flowSettings || overridden) return;
  try {
    const Original = flowSettings.components?.DefaultValue || flowSettings.getComponent?.('DefaultValue');
    if (!Original) return; // core not registered yet — caller may call again later
    overridden = true;
    flowSettings.registerComponents({ DefaultValue: wrapDefaultValueComponent(Original) });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[formula] override DefaultValue failed', e);
  }
}
