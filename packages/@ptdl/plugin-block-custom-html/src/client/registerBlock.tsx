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
