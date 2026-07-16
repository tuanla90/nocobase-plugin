import React from 'react';
import { Segmented, Slider, Tooltip } from 'antd';
import { observer, useForm } from '@formily/react';
import DOMPurify from 'dompurify';
import { SettingsGrid, ResetButton, fieldItem as fi, rx, SEG_PROPS } from '@ptdl/shared';

/**
 * "Clamp text" display widget (field-enhancements) — for long-text fields (`textarea` / `markdown` / `richText`).
 * Clamps the cell to N lines with a show-more toggle or a full-text tooltip, so long content doesn't blow up
 * a table row. `richText` renders sanitised HTML; `textarea`/`markdown` render as plain text. Opt-in.
 */

export const LT_NS = 'field-enhancements';
let LT_I18N: any = null;
export function setLongTextI18n(i18n: any) { if (i18n) LT_I18N = i18n; }
function T(key: string): string {
  const i18n = LT_I18N || (globalThis as any)?.window?.__nocobase_i18n__;
  try { if (i18n?.t) return i18n.t(key, { ns: LT_NS }); } catch (_) { /* fall through */ }
  return key;
}

const LT_DEFAULTS = { lines: 2, expand: 'inline' as 'inline' | 'tooltip' };
type LtCfg = typeof LT_DEFAULTS;
function ltFromProps(p: any): LtCfg {
  return { lines: typeof p.ptdlltLines === 'number' ? p.ptdlltLines : 2, expand: p.ptdlltExpand || 'inline' };
}
function ltFromForm(v: any): LtCfg {
  return { lines: typeof v?.lines === 'number' ? v.lines : 2, expand: v?.expand || 'inline' };
}

const stripTags = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

function clampStyle(lines: number): React.CSSProperties {
  return {
    display: '-webkit-box', WebkitLineClamp: lines, WebkitBoxOrient: 'vertical',
    overflow: 'hidden', wordBreak: 'break-word',
  };
}

function LongTextView({ value, isHtml, cfg }: { value: any; isHtml: boolean; cfg: LtCfg }) {
  const [open, setOpen] = React.useState(false);
  const raw = value == null ? '' : String(value);
  if (!raw) return <span style={{ color: '#bfbfbf' }}>-</span>;
  const lines = cfg.lines > 0 ? cfg.lines : 0;

  const body = isHtml
    ? <span style={lines && !open ? clampStyle(lines) : { wordBreak: 'break-word' }} dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(raw) }} />
    : <span style={lines && !open ? clampStyle(lines) : { whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{raw}</span>;

  if (cfg.expand === 'tooltip') {
    const full = isHtml ? stripTags(raw) : raw;
    return <Tooltip title={<span style={{ whiteSpace: 'pre-wrap' }}>{full}</span>} overlayStyle={{ maxWidth: 420 }}>{body}</Tooltip>;
  }
  // inline show-more (only when there's plausibly overflow: html always offers it; plain checks line count)
  const mayOverflow = isHtml || (lines > 0 && (raw.split('\n').length > lines || raw.length > lines * 60));
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', maxWidth: '100%' }}>
      {body}
      {lines > 0 && mayOverflow ? (
        <a onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }} style={{ fontSize: 12 }}>
          {open ? T('Show less') : T('Show more')}
        </a>
      ) : null}
    </span>
  );
}

const LT_Seg = (props: any) => (
  <Segmented {...SEG_PROPS} value={props.value ?? props.defaultValue} onChange={(v: any) => props.onChange?.(v)} options={props.options || []} />
);
const LT_Slider = (props: any) => {
  const v = typeof props.value === 'number' ? props.value : 2;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 160 }}>
      <Slider min={1} max={10} value={v} onChange={(n: any) => props.onChange?.(n)} style={{ flex: 1 }} />
      <span style={{ width: 40, textAlign: 'right', color: '#888' }}>{v}</span>
    </div>
  );
};
const LT_Preview: any = observer(() => {
  const form: any = useForm();
  const cfg = ltFromForm(form?.values || {});
  const sample = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation.';
  return (
    <div style={{ padding: '10px 12px', background: 'var(--colorFillQuaternary, #fafafa)', borderRadius: 6, border: '1px dashed #d9d9d9', maxWidth: 420 }}>
      <LongTextView value={sample} isHtml={false} cfg={cfg} />
    </div>
  );
});

export function registerLongTextModel(deps: {
  flowEngine: any; flowSettings?: any; Base: any; CollectionFieldModel?: any;
  tExpr?: (s: string, o?: any) => any; i18n?: any;
}) {
  const { flowEngine, flowSettings, Base, CollectionFieldModel } = deps;
  if (!flowEngine || !Base) { console.warn('[field-enh] long-text: missing flowEngine/Base — skip'); return; }
  if (deps.i18n) setLongTextI18n(deps.i18n);
  const t = (s: string) => (deps.tExpr ? deps.tExpr(s, { ns: LT_NS }) : s);

  if (flowSettings?.registerComponents) {
    try { flowSettings.registerComponents({ LT_Grid: SettingsGrid, LT_Seg, LT_Slider, LT_Reset: ResetButton, LT_Preview }); }
    catch (e) { console.warn('[field-enh] long-text registerComponents failed', e); }
  }

  class PtdlLongTextFieldModel extends Base {
    renderComponent(value: any, wrap: any) {
      const p: any = (this as any).props || {};
      if (value == null || value === '') return super.renderComponent?.(value, wrap) ?? null;
      const iface = (this as any).collectionField?.interface;
      const isHtml = iface === 'richText';
      return <LongTextView value={value} isHtml={isHtml} cfg={ltFromProps(p)} />;
    }
  }
  flowEngine.registerModels({ PtdlLongTextFieldModel });
  try { (PtdlLongTextFieldModel as any).define?.({ label: t('Clamp text') }); } catch (_) { /* optional */ }

  try {
    (PtdlLongTextFieldModel as any).registerFlow({
      key: 'ptdlClampText', sort: 506, title: t('Clamp text'),
      steps: {
        settings: {
          title: t('Clamp text settings'),
          uiMode: { type: 'dialog', props: { width: 500 } },
          uiSchema: () => ({
            preview: { type: 'void', title: t('Preview'), 'x-decorator': 'FormItem', 'x-decorator-props': { style: { marginBottom: 8 } }, 'x-component': 'LT_Preview' },
            row1: {
              type: 'void', 'x-component': 'LT_Grid',
              'x-component-props': { style: { gridTemplateColumns: '1fr 1fr auto', alignItems: 'end', gap: '0 12px' } },
              properties: {
                lines: fi(t('Clamp lines'), 'LT_Slider', { type: 'number' }),
                expand: fi(t('Expand'), 'LT_Seg', { componentProps: { options: [{ label: t('Show more'), value: 'inline' }, { label: t('Tooltip'), value: 'tooltip' }] } }),
                reset: { type: 'void', 'x-component': 'LT_Reset', 'x-component-props': { defaults: LT_DEFAULTS, label: t('Reset') }, 'x-decorator': 'FormItem', 'x-decorator-props': { style: { marginBottom: 6, alignSelf: 'end' } } },
              },
            },
          }),
          defaultParams: { ...LT_DEFAULTS },
          handler(ctx: any, params: any) {
            const p = params || {};
            ctx.model.setProps({ ptdlltLines: typeof p.lines === 'number' ? p.lines : 2, ptdlltExpand: p.expand || 'inline' });
          },
        },
      },
    });
  } catch (e) { console.warn('[field-enh] long-text registerFlow failed', e); }

  const binder = [PtdlLongTextFieldModel, Base, CollectionFieldModel].find((c: any) => c && typeof c.bindModelToInterface === 'function');
  try { (binder as any)?.bindModelToInterface('PtdlLongTextFieldModel', ['textarea', 'markdown', 'richText'], { isDefault: false }); }
  catch (e) { console.warn('[field-enh] long-text bind failed', e); }
  return PtdlLongTextFieldModel;
}
