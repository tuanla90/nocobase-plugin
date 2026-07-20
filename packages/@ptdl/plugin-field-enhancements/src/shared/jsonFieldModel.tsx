import React from 'react';
import { Slider } from 'antd';
import { observer, useForm } from '@formily/react';
import { SegmentedGroup, SettingsGrid, ResetButton, fieldItem as fi, rx, SEG_PROPS } from '@ptdl/shared';
import { globalToggleField, saveWidgetGlobal } from './globalWidgetToggle';

/**
 * "JSON view" display widget (field-enhancements) — for `json` fields.
 * Renders a JSON value as key/value **pills** (flat objects) or pretty-printed **code** (clamped, with a
 * show-more toggle) instead of a raw `{...}` blob. Opt-in (isDefault:false).
 */

export const JSN_NS = 'field-enhancements';
let JSN_I18N: any = null;
export function setJsonFieldI18n(i18n: any) { if (i18n) JSN_I18N = i18n; }
function T(key: string): string {
  const i18n = JSN_I18N || (globalThis as any)?.window?.__nocobase_i18n__;
  try { if (i18n?.t) return i18n.t(key, { ns: JSN_NS }); } catch (_) { /* fall through */ }
  return key;
}

const JSN_DEFAULTS = { mode: 'pills' as 'pills' | 'code', lines: 6 };
type JsnCfg = typeof JSN_DEFAULTS;
function jsnFromProps(p: any): JsnCfg {
  return { mode: p.ptdljMode || 'pills', lines: typeof p.ptdljLines === 'number' ? p.ptdljLines : 6 };
}
function jsnFromForm(v: any): JsnCfg {
  return { mode: v?.mode || 'pills', lines: typeof v?.lines === 'number' ? v.lines : 6 };
}

// value → parsed JS value (parse JSON strings; pass objects through).
function parseVal(value: any): any {
  if (value == null || value === '') return undefined;
  if (typeof value === 'string') {
    const s = value.trim();
    if (!s) return undefined;
    try { return JSON.parse(s); } catch (_) { return value; }
  }
  return value;
}
function scalarStr(v: any): string {
  if (v == null) return '∅';
  if (typeof v === 'object') return Array.isArray(v) ? `[${v.length}]` : '{…}';
  return String(v);
}

function Pills({ data }: { data: any }) {
  const entries: Array<[string, any]> = Array.isArray(data)
    ? data.map((v, i) => [String(i), v])
    : data && typeof data === 'object'
      ? Object.entries(data)
      : [['', data]];
  if (!entries.length) return <span style={{ color: '#bfbfbf' }}>{'{}'}</span>;
  return (
    <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
      {entries.map(([k, v]) => (
        <span key={k} style={{
          display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, lineHeight: '18px',
          padding: '0 8px', borderRadius: 10, background: 'var(--colorFillSecondary, rgba(0,0,0,.04))',
          border: '1px solid var(--colorBorderSecondary, #f0f0f0)', maxWidth: 240,
        }}>
          {k !== '' ? <span style={{ color: 'var(--colorTextTertiary, #8c8c8c)' }}>{k}:</span> : null}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{scalarStr(v)}</span>
        </span>
      ))}
    </span>
  );
}

function CodeBlock({ data, lines }: { data: any; lines: number }) {
  const [open, setOpen] = React.useState(false);
  let text = '';
  try { text = JSON.stringify(data, null, 2); } catch (_) { text = String(data); }
  const clamp = lines > 0 && !open;
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', maxWidth: '100%' }}>
      <pre style={{
        margin: 0, fontFamily: 'var(--fontFamilyCode, monospace)', fontSize: 12, lineHeight: 1.5,
        whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxWidth: '100%',
        display: clamp ? '-webkit-box' : 'block',
        WebkitLineClamp: clamp ? lines : 'unset', WebkitBoxOrient: 'vertical', overflow: clamp ? 'hidden' : 'visible',
      }}>{text}</pre>
      {lines > 0 && text.split('\n').length > lines ? (
        <a onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }} style={{ fontSize: 12 }}>
          {open ? T('Show less') : T('Show more')}
        </a>
      ) : null}
    </span>
  );
}

function JsonView({ value, cfg }: { value: any; cfg: JsnCfg }) {
  const data = parseVal(value);
  if (data === undefined) return <span style={{ color: '#bfbfbf' }}>-</span>;
  if (cfg.mode === 'code') return <CodeBlock data={data} lines={cfg.lines} />;
  return <Pills data={data} />;
}

const JSN_Seg = (props: any) => (
  <SegmentedGroup {...SEG_PROPS} value={props.value ?? props.defaultValue} onChange={(v: any) => props.onChange?.(v)} options={props.options || []} />
);
const JSN_Slider = (props: any) => {
  const v = typeof props.value === 'number' ? props.value : 6;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 160 }}>
      <Slider min={0} max={20} value={v} onChange={(n: any) => props.onChange?.(n)} style={{ flex: 1 }} />
      <span style={{ width: 40, textAlign: 'right', color: '#888' }}>{v <= 0 ? T('Off') : v}</span>
    </div>
  );
};
const JSN_Preview: any = observer(() => {
  const form: any = useForm();
  const cfg = jsnFromForm(form?.values || {});
  const sample = { id: 42, name: 'Acme', tags: ['a', 'b'], active: true };
  return (
    <div style={{ padding: '10px 12px', background: 'var(--colorFillQuaternary, #fafafa)', borderRadius: 6, border: '1px dashed #d9d9d9' }}>
      <JsonView value={sample} cfg={cfg} />
    </div>
  );
});

export function registerJsonFieldModel(deps: {
  flowEngine: any; flowSettings?: any; Base: any; CollectionFieldModel?: any;
  tExpr?: (s: string, o?: any) => any; i18n?: any;
}) {
  const { flowEngine, flowSettings, Base, CollectionFieldModel } = deps;
  if (!flowEngine || !Base) { console.warn('[field-enh] json: missing flowEngine/Base — skip'); return; }
  if (deps.i18n) setJsonFieldI18n(deps.i18n);
  const t = (s: string) => (deps.tExpr ? deps.tExpr(s, { ns: JSN_NS }) : s);

  if (flowSettings?.registerComponents) {
    try { flowSettings.registerComponents({ JSN_Grid: SettingsGrid, JSN_Seg, JSN_Slider, JSN_Reset: ResetButton, JSN_Preview }); }
    catch (e) { console.warn('[field-enh] json registerComponents failed', e); }
  }

  class PtdlJsonFieldModel extends Base {
    renderComponent(value: any, wrap: any) {
      const p: any = (this as any).props || {};
      if (value == null || value === '') return super.renderComponent?.(value, wrap) ?? null;
      return <JsonView value={value} cfg={jsnFromProps(p)} />;
    }
  }
  flowEngine.registerModels({ PtdlJsonFieldModel });
  try { (PtdlJsonFieldModel as any).define?.({ label: t('JSON view') }); } catch (_) { /* optional */ }

  try {
    (PtdlJsonFieldModel as any).registerFlow({
      key: 'ptdlJsonView', sort: 505, title: t('JSON view'),
      steps: {
        settings: {
          title: t('JSON view settings'),
          uiMode: { type: 'dialog', props: { width: 520 } },
          uiSchema: () => ({
            ...globalToggleField(t),
            preview: { type: 'void', title: t('Preview'), 'x-decorator': 'FormItem', 'x-decorator-props': { style: { marginBottom: 8 } }, 'x-component': 'JSN_Preview' },
            row1: {
              type: 'void', 'x-component': 'JSN_Grid',
              'x-component-props': { style: { gridTemplateColumns: '1fr 1fr auto', alignItems: 'end', gap: '0 12px' } },
              properties: {
                mode: fi(t('Display'), 'JSN_Seg', { componentProps: { options: [{ label: t('Pills'), value: 'pills' }, { label: t('Code'), value: 'code' }] } }),
                lines: fi(t('Clamp lines'), 'JSN_Slider', { type: 'number', reactions: rx((v: any) => v.mode === 'code') }),
                reset: { type: 'void', 'x-component': 'JSN_Reset', 'x-component-props': { defaults: JSN_DEFAULTS, label: t('Reset') }, 'x-decorator': 'FormItem', 'x-decorator-props': { style: { marginBottom: 6, alignSelf: 'end' } } },
              },
            },
          }),
          defaultParams: { ...JSN_DEFAULTS },
          handler(ctx: any, params: any) {
            const p = params || {};
            const props = { ptdljMode: p.mode || 'pills', ptdljLines: typeof p.lines === 'number' ? p.lines : 6 };
            ctx.model.setProps(props);
            saveWidgetGlobal(ctx, params, 'PtdlJsonFieldModel', props);
          },
        },
      },
    });
  } catch (e) { console.warn('[field-enh] json registerFlow failed', e); }

  const binder = [PtdlJsonFieldModel, Base, CollectionFieldModel].find((c: any) => c && typeof c.bindModelToInterface === 'function');
  try { (binder as any)?.bindModelToInterface('PtdlJsonFieldModel', ['json'], { isDefault: false }); }
  catch (e) { console.warn('[field-enh] json bind failed', e); }
  return PtdlJsonFieldModel;
}
