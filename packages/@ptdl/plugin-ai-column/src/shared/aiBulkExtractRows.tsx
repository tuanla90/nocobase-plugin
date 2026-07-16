import React, { useEffect, useState } from 'react';
import { observer } from '@formily/react';
import { FormTab } from '@formily/antd-v5';
import { useFlowSettingsContext } from '@nocobase/flow-engine';
import { getFields, ColumnSelect } from '@ptdl/shared';
import { splitMapping } from './aiExtractRows';
import { withRetry, runBulkPool, newBulkSummary, recordFailure, summaryMessage, isBulkAllOk, maybeWarnLargeBatch } from './bulkRunner';
import { NS, t } from './i18n';

/**
 * @ptdl/plugin-ai-column — "Bulk AI Extract-rows": a COLLECTION-scene table action that runs AI
 * Multi-row Extract (+ optional per-row classify) for each SELECTED PARENT row, creating child rows
 * in a to-many relation (e.g. select many quotes → generate their order lines at once). Delegates
 * the per-parent work to the server `extractRowsInto` action (the same code path as the auto-run),
 * so behaviour matches the field-level ✨ and the autorun rule exactly.
 *
 * Source can be TEXT (a {{column}} prompt) OR an attachment field per parent (image / PDF / doc) —
 * the server reads it through the same vision pipeline as the field-level extract.
 */

export type BulkExtractRowsDeps = { flowEngine: any; ActionModel: any; ActionSceneEnum: any; api?: any; tExpr?: (s: string, opts?: any) => any };

let API: any = null;
const ATTACHMENT_INTERFACES = new Set(['attachment', 'attachmentURL']);

/** Optional source: an attachment field (image/PDF/doc) of the table's OWN collection, read per
 *  selected parent row and sent to the AI as vision input (leave empty = text-prompt only). */
const PtdlBulkRowsSource: React.FC<any> = observer((props: any) => {
  const [options, setOptions] = useState<any[]>([]);
  let coll: string | undefined;
  let dsk = 'main';
  try {
    const ctx: any = useFlowSettingsContext();
    const model: any = ctx?.model;
    coll = model?.context?.blockModel?.collection?.name;
    dsk = model?.context?.blockModel?.collection?.dataSourceKey || 'main';
  } catch {
    /* no ctx */
  }
  useEffect(() => {
    let alive = true;
    if (coll) getFields(API, coll, dsk).then((fields) => alive && setOptions((fields || []).filter((f: any) => ATTACHMENT_INTERFACES.has(f?.interface)).map((f: any) => ({ value: f.name, label: f.uiSchema?.title || f.name, type: f.type, iface: f.interface }))));
    else setOptions([]);
    return () => {
      alive = false;
    };
  }, [coll, dsk]);
  return (
    <ColumnSelect
      options={options}
      value={props.value || undefined}
      placeholder={t('(tùy chọn) đọc ảnh/PDF từ field đính kèm — để trống = dùng prompt text')}
      onChange={(v) => props.onChange?.(v)}
    />
  );
});

function bulkExtractRowsStepUiSchema(te: (s: string) => any) {
  return {
    tabs: {
      type: 'void',
      'x-component': 'FormTab',
      properties: {
        tabData: {
          type: 'void',
          'x-component': 'FormTab.TabPane',
          'x-component-props': { tab: te('Cột & dòng') },
          properties: {
            aiTargetRelation: { type: 'object', title: te('Bảng con nhận dòng'), 'x-decorator': 'FormItem', 'x-component': 'PtdlRelationTargetSelect' },
            aiChildMapping: { type: 'array', title: te('Các field của mỗi dòng'), 'x-decorator': 'FormItem', 'x-component': 'PtdlChildFieldMapping' },
            aiRowMode: { type: 'string', title: te('Cách ghi'), 'x-decorator': 'FormItem', 'x-component': 'PtdlRowModeSelect' },
          },
        },
        tabSource: {
          type: 'void',
          'x-component': 'FormTab.TabPane',
          'x-component-props': { tab: te('Nguồn & Prompt') },
          properties: {
            aiSourceField: { type: 'string', title: te('Đọc tệp từ (ảnh / PDF / tài liệu)'), 'x-decorator': 'FormItem', 'x-component': 'PtdlBulkRowsSource' },
            rowConnection: {
              type: 'void',
              'x-component': 'PtdlGrid',
              properties: {
                aiService: { type: 'string', title: te('Dịch vụ LLM'), 'x-decorator': 'FormItem', 'x-component': 'PtdlLlmServiceSelect' },
                aiModel: { type: 'string', title: te('Model'), 'x-decorator': 'FormItem', 'x-component': 'PtdlLlmModelSelect' },
              },
            },
            aiSystem: { type: 'string', title: te('Câu lệnh hệ thống'), 'x-decorator': 'FormItem', 'x-component': 'PtdlAiSystemInput' },
            aiPrompt: { type: 'string', title: te('Prompt'), 'x-decorator': 'FormItem', 'x-component': 'PtdlBulkPromptInput' },
          },
        },
      },
    },
  };
}

export function registerBulkExtractRows({ flowEngine, ActionModel, ActionSceneEnum, api, tExpr }: BulkExtractRowsDeps) {
  if (!flowEngine || !ActionModel || !ActionSceneEnum) {
    // eslint-disable-next-line no-console
    console.warn('[ai-column] bulk extract-rows: missing deps — skip');
    return;
  }
  if (api) API = api;
  const te = (s: string) => (tExpr ? tExpr(s, { ns: NS }) : s);

  try {
    flowEngine.flowSettings?.registerComponents?.({ PtdlBulkRowsSource, FormTab, 'FormTab.TabPane': FormTab.TabPane });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[ai-column] bulk extract-rows: registerComponents failed', e);
  }

  class PtdlBulkExtractRowsActionModel extends ActionModel {
    static scene = ActionSceneEnum.collection;
    defaultProps = { title: te('Trích nhiều dòng AI hàng loạt') };
  }
  flowEngine.registerModels({ PtdlBulkExtractRowsActionModel });
  try {
    (PtdlBulkExtractRowsActionModel as any).define({ label: te('Trích nhiều dòng AI hàng loạt') });
  } catch {
    /* optional */
  }

  try {
    (PtdlBulkExtractRowsActionModel as any).registerFlow({
      key: 'ptdlBulkExtractRowsSettings',
      title: te('Cấu hình trích nhiều dòng AI hàng loạt'),
      on: 'click',
      steps: {
        confirm: {
          use: 'confirm',
          defaultParams: { enable: true, title: te('Trích nhiều dòng AI hàng loạt'), content: te('Sinh dòng con bằng AI cho các bản ghi đã chọn?') },
        },
        run: {
          title: te('Cấu hình trích nhiều dòng AI'),
          uiMode: { type: 'dialog', props: { width: 760 } },
          uiSchema: bulkExtractRowsStepUiSchema(te),
          defaultParams: { aiTargetRelation: {}, aiChildMapping: [], aiRowMode: 'append', aiSourceField: '', aiService: '', aiModel: '', aiSystem: '', aiPrompt: '' },
          async handler(ctx: any, params: any) {
            const rel = params?.aiTargetRelation || {};
            const { fields, relationMaps } = splitMapping(Array.isArray(params?.aiChildMapping) ? params.aiChildMapping : []);
            const hasPrompt = !!String(params?.aiPrompt || '').trim();
            const hasSource = !!params?.aiSourceField;
            if (!rel.name || !fields.length || (!hasPrompt && !hasSource)) {
              ctx.message.error(t('Chưa cấu hình bảng con / field / prompt hoặc field tệp — mở gear (⚙) để cấu hình trước.'));
              return;
            }
            const resource = ctx.blockModel?.resource;
            const rows: any[] = resource?.getSelectedRows ? resource.getSelectedRows() : [];
            if (!rows.length) {
              ctx.message.warning(t('Chọn ít nhất 1 dòng (tick checkbox) trước khi chạy.'));
              return;
            }
            const collection = ctx.blockModel.collection;
            const collectionName = collection?.name;
            if (!collectionName) {
              ctx.message.error(t('Không xác định được collection của bảng.'));
              return;
            }

            const config = {
              relationField: rel.name,
              fields,
              relationMaps,
              sourceField: params.aiSourceField || undefined,
              system: params.aiSystem || undefined,
              prompt: params.aiPrompt || '',
              mode: params.aiRowMode || 'append',
              llmService: params.aiService || undefined,
              model: params.aiModel || undefined,
            };

            maybeWarnLargeBatch(ctx, rows.length);
            const hideLoading = ctx.message.loading(t('Đang sinh dòng con AI cho {{n}} bản ghi...', { n: rows.length }), 0);
            const summary = newBulkSummary();
            let totalCreated = 0;

            await runBulkPool(rows, 2, async (row) => {
              try {
                await withRetry(async () => {
                  const filterByTk = collection.getFilterByTK(row);
                  const res = await ctx.api.request({ url: 'ptdlAiColumn:extractRowsInto', method: 'post', data: { collectionName, filterByTk, config } });
                  totalCreated += res?.data?.data?.created || 0;
                });
                summary.ok++;
              } catch (e) {
                recordFailure(summary, e);
              }
            });

            hideLoading();
            const note = t('Đã tạo {{n}} dòng con', { n: totalCreated });
            const msg = summaryMessage(summary, rows.length, note);
            if (isBulkAllOk(summary)) ctx.message.success(msg);
            else ctx.message.warning(msg);
            await resource.refresh?.();
          },
        },
      },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[ai-column] bulk extract-rows: registerFlow failed', e);
  }

  return PtdlBulkExtractRowsActionModel;
}
