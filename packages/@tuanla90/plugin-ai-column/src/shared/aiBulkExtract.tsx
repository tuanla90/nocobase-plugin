import React, { useEffect, useState } from 'react';
import { observer } from '@formily/react';
import { useFlowSettingsContext } from '@nocobase/flow-engine';
import { getFields, ColumnSelect } from '@tuanla90/shared';
import { PtdlExtractMapping } from './aiExtract';
import { PtdlBulkPromptInput } from './aiBulkGenerate';
import { withRetry, runBulkPool, newBulkSummary, recordFailure, summaryMessage, isBulkAllOk, maybeWarnLargeBatch } from './bulkRunner';
import { registerFlowComponentsOnce } from './aiColumn';
import { NS, t } from './i18n';

/**
 * @tuanla90/plugin-ai-column — "Bulk AI Extract": the image-reading sibling of Bulk AI Generate
 * (aiBulkGenerate.tsx) — same COLLECTION-scene table action shape, but instead of writing ONE
 * text/number/select value it reads an attachment field PER ROW and splits it into N target
 * fields in one structuredOutput call (reuses the server's `extract` action, the same one the
 * field-level AI Extract button calls).
 *
 * Reuses, rather than re-implements: `PtdlExtractMapping` (aiExtract.tsx, now resolves its
 * collection via `blockModel.collection` too — see that file) for the target-field mapping
 * table, and `PtdlBulkPromptInput` (aiBulkGenerate.tsx) for the prompt's field picker — both
 * already collection-context-agnostic between "bound to one field" and "bound to a table".
 */

export type BulkExtractDeps = {
  flowEngine: any;
  ActionModel: any;
  ActionSceneEnum: any;
  api?: any;
  tExpr?: (s: string, opts?: any) => any;
};

let API: any = null;

const ATTACHMENT_INTERFACES = new Set(['attachment', 'attachmentURL']);

/** Which attachment field (of the table's OWN collection) to read as the vision source, per row.
 *  Unlike the target-field pickers elsewhere (which use `buildFieldCascaderOptions` — that helper
 *  deliberately EXCLUDES attachment/relation fields from its leaf list), this needs the OPPOSITE
 *  filter, so it goes through the raw `getFields()` list directly. */
const PtdlBulkSourceAttachment: React.FC<any> = observer((props: any) => {
  const [options, setOptions] = useState<any[]>([]);
  let coll: string | undefined;
  let dsk = 'main';
  try {
    const ctx: any = useFlowSettingsContext();
    const model: any = ctx?.model;
    coll = model?.context?.blockModel?.collection?.name;
    dsk = model?.context?.blockModel?.collection?.dataSourceKey || 'main';
  } catch {
    /* no settings context — options just stay empty */
  }

  useEffect(() => {
    let alive = true;
    if (coll) {
      getFields(API, coll, dsk).then((fields) => {
        if (!alive) return;
        const opts = (fields || [])
          .filter((f: any) => ATTACHMENT_INTERFACES.has(f?.interface))
          .map((f: any) => ({ value: f.name, label: f.uiSchema?.title || f.name, type: f.type, iface: f.interface }));
        setOptions(opts);
      });
    } else {
      setOptions([]);
    }
    return () => {
      alive = false;
    };
  }, [coll, dsk]);

  return (
    <ColumnSelect
      options={options}
      value={props.value || undefined}
      placeholder={t('Chọn field ảnh/tệp làm nguồn')}
      onChange={(v) => props.onChange?.(v)}
    />
  );
});

function bulkExtractStepUiSchema(te: (s: string) => any) {
  return {
    aiSourceField: {
      type: 'string',
      title: te('Đọc tệp từ (ảnh / PDF / tài liệu)'),
      'x-decorator': 'FormItem',
      'x-component': 'PtdlBulkSourceAttachment',
    },
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
    aiMapping: { type: 'array', title: te('Các field cần trích xuất'), 'x-decorator': 'FormItem', 'x-component': 'PtdlExtractMapping' },
  };
}

export function registerBulkExtract({ flowEngine, ActionModel, ActionSceneEnum, api, tExpr }: BulkExtractDeps) {
  if (!flowEngine || !ActionModel || !ActionSceneEnum) {
    // eslint-disable-next-line no-console
    console.warn('[ai-column] bulk extract: missing flowEngine/ActionModel/ActionSceneEnum — skip');
    return;
  }
  if (api) API = api;
  const te = (s: string) => (tExpr ? tExpr(s, { ns: NS }) : s);

  try {
    registerFlowComponentsOnce(flowEngine, { PtdlBulkSourceAttachment });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[ai-column] bulk extract: registerComponents failed', e);
  }

  class PtdlBulkExtractActionModel extends ActionModel {
    static scene = ActionSceneEnum.collection;
    defaultProps = { title: te('Trích xuất AI hàng loạt') };
  }

  flowEngine.registerModels({ PtdlBulkExtractActionModel });

  try {
    (PtdlBulkExtractActionModel as any).define({ label: te('Trích xuất AI hàng loạt') });
  } catch {
    /* define optional */
  }

  try {
    (PtdlBulkExtractActionModel as any).registerFlow({
      key: 'ptdlBulkExtractSettings',
      title: te('Cấu hình trích xuất AI hàng loạt'),
      on: 'click',
      steps: {
        confirm: {
          use: 'confirm',
          defaultParams: {
            enable: true,
            title: te('Trích xuất AI hàng loạt'),
            content: te('Trích xuất AI từ tệp (ảnh/PDF/tài liệu) cho các dòng đã chọn? Giá trị hiện tại của các field đích sẽ bị GHI ĐÈ.'),
          },
        },
        run: {
          title: te('Cấu hình trích xuất AI'),
          uiMode: { type: 'dialog', props: { width: 720 } },
          uiSchema: bulkExtractStepUiSchema(te),
          defaultParams: {
            aiSourceField: '',
            aiService: '',
            aiModel: '',
            aiSystem: '',
            aiPrompt: '',
            aiMapping: [],
          },
          async handler(ctx: any, params: any) {
            const sourceField = params?.aiSourceField;
            const mapping = (Array.isArray(params?.aiMapping) ? params.aiMapping : []).filter((m: any) => m?.field);
            if (!sourceField || !mapping.length) {
              ctx.message.error(t('Chưa cấu hình field tệp nguồn / field đích — mở gear (⚙) để cấu hình trước.'));
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

            maybeWarnLargeBatch(ctx, rows.length);
            const hideLoading = ctx.message.loading(t('Đang trích xuất AI cho {{n}} dòng...', { n: rows.length }), 0);
            const summary = newBulkSummary();
            let skippedNoImage = 0;

            const fieldDefs = mapping.map((m: any) => ({
              name: m.field,
              description: m.description || '',
              type: m.type || 'string',
              enum: m.enumValues,
              markdown: m.markdown,
            }));

            await runBulkPool(rows, 3, async (row) => {
              const attachment = row[sourceField];
              const hasImage = Array.isArray(attachment) ? attachment.length > 0 : attachment != null && attachment !== '';
              if (!hasImage) {
                skippedNoImage++;
                return;
              }
              try {
                await withRetry(async () => {
                  const filterByTk = collection.getFilterByTK(row);
                  const res = await ctx.api.request({
                    url: 'ptdlAiColumn:extract',
                    method: 'post',
                    data: {
                      llmService: params.aiService || undefined,
                      model: params.aiModel || undefined,
                      system: params.aiSystem || undefined,
                      prompt: params.aiPrompt || '',
                      values: row,
                      attachment,
                      fields: fieldDefs,
                    },
                  });
                  const values = res?.data?.data?.values;
                  if (!values || typeof values !== 'object') throw new Error('AI did not return usable values');
                  await ctx.api.request({
                    url: `${collectionName}:update`,
                    method: 'post',
                    params: { filterByTk },
                    data: values,
                  });
                });
                summary.ok++;
              } catch (e) {
                recordFailure(summary, e);
              }
            });

            hideLoading();
            const note = skippedNoImage ? t('{{n}} dòng bỏ qua vì không có tệp', { n: skippedNoImage }) : undefined;
            const msg = summaryMessage(summary, rows.length, note);
            if (isBulkAllOk(summary) && !skippedNoImage) ctx.message.success(msg);
            else ctx.message.warning(msg);
            await resource.refresh?.();
          },
        },
      },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[ai-column] bulk extract: registerFlow failed', e);
  }

  return PtdlBulkExtractActionModel;
}
