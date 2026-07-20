/**
 * Shared registration for the Custom HTML block — called from BOTH lanes:
 *   - src/client      (classic app, `Plugin` from @nocobase/client)
 *   - src/client-v2   (modern /v/ app, `Plugin` from @nocobase/client-v2)
 * The block is FlowEngine-native (subclasses ChartBlockModel), so the same logic
 * works in either app as long as the ChartBlockModel is registered there.
 */
import React from 'react';
import { renderCustomHtml, DEFAULT_JS, cacheData } from './render';
import { HtmlCodeEditor } from './HtmlCodeEditor';
import { te } from './i18n';

/* ────────────────────────────────────────────────────────────────────────────
 * Block title — make Chart / Custom-HTML blocks report a MEANINGFUL model.title.
 *
 * Why: the /v/ "Connect fields" dialog (Filter form block) labels every target
 * block as `${model.title} #${uid.slice(0,4)}`. Core BlockModel.title has no
 * setter and falls back to the class label, so headerless chart/custom-html
 * blocks all read "Charts #c6ff" / "Custom HTML #b287" — impossible to tell
 * apart. We override the getter to resolve, in order:
 *   1. an explicit user title (the `blockTitle` flow-step below),
 *   2. a title derived from the block's own config (chart title.text, or the
 *      query's measure alias / measure & dimension field names, or collection),
 *   3. the original class-label default (unchanged behaviour).
 * The patch lives on ChartBlockModel.prototype so real charts AND the
 * CustomHtmlBlockModel subclass both benefit. See NocoBase client-v2 bundle:
 * `hI()` connect-fields dialog → `s5(blockGrid)` → reads each model `.title`.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Strip a `{{t("…")}}` i18n wrapper and trim; returns '' for empty/nullish. */
function cleanI18n(s: any): string {
  if (s == null) return '';
  return String(s)
    .replace(/\{\{\s*t\(\s*["']([^"']+)["'][^}]*\)\s*\}\}/g, '$1')
    .trim();
}

/** Best-effort human title from a block's data config. '' when nothing usable. */
function deriveBlockTitle(model: any): string {
  try {
    const cfg: any = (model.getStepParams && model.getStepParams('chartSettings', 'configure')) || {};
    // 1) the chart's own ECharts title.text (app-builder / hand-built charts bake it in)
    const raw: string =
      (cfg.chart && cfg.chart.option && cfg.chart.option.raw) ||
      (model.props && model.props.chart && model.props.chart.optionRaw) ||
      '';
    if (raw) {
      const m = /title\s*:\s*\{[^}]*?\btext\s*:\s*(["'])([^"']+)\1/.exec(raw);
      if (m && m[2]) return cleanI18n(m[2]);
    }
    // 2) from the query — SAME "agg(measure) theo dimension" formula as app-builder's `listCharts` action,
    //    so the Filter block's "Connect fields" picker reads the identical label to the app-builder AI-refine
    //    chart picker instead of bare column names. First measure + first dimension only (matches listCharts).
    const q: any = cfg.query || {};
    const leaf = (f: any): any => (Array.isArray(f) ? f[f.length - 1] : f);
    const mea: any = (q.measures || [])[0];
    if (mea) {
      const dim: any = (q.dimensions || [])[0];
      const measureLeaf = leaf(mea.field) || '';
      const dimensionLeaf = dim ? leaf(dim.field) : '';
      return `${mea.aggregation || ''}(${measureLeaf})${dimensionLeaf ? ` theo ${dimensionLeaf}` : ''}`;
    }
    // 3) fall back to the collection's display name
    let coll: any = null;
    try { coll = model.collection; } catch (e) { coll = null; }
    const ct = cleanI18n(coll && coll.title);
    if (ct) return ct;
  } catch (e) {
    /* ignore — caller falls back to the original default title */
  }
  return '';
}

/** Idempotently override `get/set title` on ChartBlockModel.prototype. */
function patchBlockTitle(ChartBlockModel: any): void {
  const proto = ChartBlockModel && ChartBlockModel.prototype;
  if (!proto || (proto as any).__ptdlTitlePatched) return;
  // Capture the inherited (base BlockModel) title descriptor for the default fallback.
  let p: any = proto;
  let desc: PropertyDescriptor | undefined;
  while (p && !(desc = Object.getOwnPropertyDescriptor(p, 'title'))) p = Object.getPrototypeOf(p);
  const origGet = desc && desc.get;
  const origSet = desc && desc.set;
  Object.defineProperty(proto, 'title', {
    configurable: true,
    enumerable: false,
    get(this: any) {
      try {
        const user = cleanI18n(((this.getStepParams && this.getStepParams('blockTitle', 'title')) || {}).title);
        if (user) return user;
        const derived = deriveBlockTitle(this);
        if (derived) return derived;
      } catch (e) {
        /* fall through to the original default */
      }
      return origGet ? origGet.call(this) : this._title;
    },
    set(this: any, v: any) {
      if (origSet) origSet.call(this, v);
      else this._title = v;
    },
  });
  Object.defineProperty(proto, '__ptdlTitlePatched', { value: true, configurable: true });
}

/** ⚙ settings step: let the user type an explicit block title (overrides the auto-derived one). */
function blockTitleFlow() {
  return {
    key: 'blockTitle',
    sort: 50,
    title: te('Tiêu đề block'),
    steps: {
      title: {
        title: te('Tiêu đề block'),
        uiSchema: {
          title: {
            type: 'string',
            'x-decorator': 'FormItem',
            'x-component': 'Input',
            'x-component-props': { placeholder: te('Để trống để tự đặt tên theo dữ liệu') },
          },
        },
        defaultParams: (ctx: any) => ({
          title: (((ctx.model.getStepParams && ctx.model.getStepParams('blockTitle', 'title')) || {}).title) || '',
        }),
      },
    },
  };
}

function htmlFlow() {
  return {
    key: 'customHtmlSettings',
    sort: 600,
    title: te('Custom HTML'),
    steps: {
      code: {
        title: te('Custom HTML'),
        useRawParams: true,
        uiMode: { type: 'dialog', props: { width: 960 } },
        uiSchema: {
          code: {
            type: 'string',
            'x-decorator': 'FormItem',
            'x-component': HtmlCodeEditor,
          },
        },
        defaultParams: { code: DEFAULT_JS },
      },
    },
  };
}

/** Register the Custom HTML block into the given FlowEngine instance. Safe no-op if
 *  the engine or the base ChartBlockModel is unavailable. */
export async function registerCustomHtmlBlock(fe: any): Promise<void> {
  if (!fe) {
    // eslint-disable-next-line no-console
    console.warn('[custom-html] no flowEngine on this lane — block not registered.');
    return;
  }
  let ChartBlockModel: any;
  try {
    ChartBlockModel = fe.getModelClassAsync
      ? await fe.getModelClassAsync('ChartBlockModel')
      : fe.getModelClass && fe.getModelClass('ChartBlockModel');
  } catch (e) {
    ChartBlockModel = fe.getModelClass && fe.getModelClass('ChartBlockModel');
  }
  if (!ChartBlockModel) {
    // eslint-disable-next-line no-console
    console.warn('[custom-html] ChartBlockModel not found — enable the Data Visualization plugin.');
    return;
  }

  // Meaningful block titles (for the /v/ "Connect fields" dialog & everywhere model.title shows).
  // Patch the shared ChartBlockModel BEFORE defining the subclass so both inherit it. Guarded so
  // repeated loads / the two lanes don't double-register.
  try {
    patchBlockTitle(ChartBlockModel);
    if (!(ChartBlockModel as any).__ptdlBlockTitleFlow) {
      ChartBlockModel.registerFlow(blockTitleFlow());
      Object.defineProperty(ChartBlockModel, '__ptdlBlockTitleFlow', { value: true, configurable: true });
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[custom-html] block-title patch failed', e);
  }

  class CustomHtmlBlockModel extends ChartBlockModel {
    renderComponent() {
      const params: any = this.getStepParams('customHtmlSettings', 'code') || {};
      const code = params.code != null ? params.code : DEFAULT_JS;
      let rows: any[] = [];
      try {
        const r: any = (this as any).resource;
        rows = (r && r.getData && r.getData()) || [];
      } catch (e) {
        rows = [];
      }
      cacheData(this.uid, rows);
      const sel = '.chtml-' + this.uid;
      const fullBleed =
        '<style>' +
        '.ant-card:has(' +
        sel +
        '){background:transparent!important;border:none!important;box-shadow:none!important}' +
        '.ant-card-body:has(' +
        sel +
        '){padding:0!important;background:transparent!important}' +
        '</style>';
      const out = fullBleed + renderCustomHtml({ js: code, rows, uid: this.uid });
      return React.createElement('div', {
        className: 'chtml chtml-' + this.uid,
        style: { width: '100%', height: '100%' },
        dangerouslySetInnerHTML: { __html: out },
      });
    }

    renderChart() {
      /* no-op: we render HTML, not an ECharts chart */
    }
  }

  CustomHtmlBlockModel.define({
    label: te('Custom HTML'),
    createModelOptions: { use: 'CustomHtmlBlockModel' },
    sort: 410,
  });

  CustomHtmlBlockModel.registerFlow(htmlFlow());
  CustomHtmlBlockModel.registerFlow({ key: 'renderChart', steps: {} });

  fe.registerModels({ CustomHtmlBlockModel });
}
