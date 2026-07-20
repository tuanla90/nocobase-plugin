import React, { useEffect, useState } from 'react';
import { observer } from '@formily/react';
import { useFlowSettingsContext } from '@nocobase/flow-engine';
import { FieldTokenTextArea, buildFieldCascaderOptions, getFields, fieldJsonMeta, ColumnSelect } from '@tuanla90/shared';
import { withRetry, runBulkPool, newBulkSummary, recordFailure, summaryMessage, isBulkAllOk, maybeWarnLargeBatch } from './bulkRunner';
import { registerFlowComponentsOnce } from './aiColumn';
import { NS, t } from './i18n';

/**
 * @tuanla90/plugin-ai-column — "Bulk AI Generate": a COLLECTION-scene table action (appears in the
 * table's own toolbar, same category as core's "Delete" — active once rows are checkbox-selected).
 * Unlike the per-field ✨ button (fills ITS OWN field for the CURRENT row/form), this runs the
 * SAME server `generate` action once per SELECTED row and writes the result directly via
 * `<collection>:update` — these are already-saved table rows, there is no form to fill.
 *
 * Scoped to text/number/singleSelect output (reuses `generate`, not `extract` — bulk image
 * extraction per row is a heavier, separate follow-up; not built this pass).
 *
 * `on:'click'` flows (confirmed via core's BulkDeleteActionModel/JSFormActionModel) only run
 * their handler when the button is actually clicked — NOT on every render like field-settings
 * flows — so a single step can safely both show the settings dialog (uiSchema, edited via the
 * gear icon) AND perform the real API-mutating bulk run (handler, invoked on an actual click)
 * without the "storm of updates" risk field-settings handlers have.
 */

export type BulkGenerateDeps = {
  flowEngine: any;
  ActionModel: any;
  ActionSceneEnum: any;
  api?: any;
  tExpr?: (s: string, opts?: any) => any;
};

let API: any = null;

/** Which field (of the table's OWN collection) to write the generated value into. */
const PtdlBulkTargetField: React.FC<any> = observer((props: any) => {
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
      buildFieldCascaderOptions(API, coll, dsk, { maxDepth: 0 }).then((o) => alive && setOptions(o));
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
      placeholder={t('Chọn field để ghi kết quả')}
      onChange={(v) => props.onChange?.(v)}
    />
  );
});

/** Prompt with the same "＋ Chèn cột" field picker — collection resolved from the table's OWN
 *  block (`blockModel.collection`), since this action isn't bound to one specific field the way
 *  AiInputFieldModel/AiExtractFieldModel are. */
export const PtdlBulkPromptInput: React.FC<any> = observer((props: any) => {
  let coll: string | undefined;
  let dsk = 'main';
  try {
    const ctx: any = useFlowSettingsContext();
    const model: any = ctx?.model;
    coll = model?.context?.blockModel?.collection?.name;
    dsk = model?.context?.blockModel?.collection?.dataSourceKey || 'main';
  } catch {
    /* ignore */
  }
  return (
    <FieldTokenTextArea
      value={props.value}
      onChange={props.onChange}
      api={API}
      collectionName={coll}
      dataSourceKey={dsk}
      format={(p) => `{{${p.join('.')}}}`}
      rows={5}
      placeholder={t('VD: Tóm tắt {{content}} trong 1 câu.')}
      hint={
        <>
          {t('Bấm')} <b>＋ Chèn cột</b> {t('để chèn field, hoặc gõ tay')} <code>{'{{ten_field}}'}</code>. {t('Prompt chạy riêng cho')}{' '}
          <b>{t('TỪNG dòng')}</b> {t('đã chọn.')}
        </>
      }
    />
  );
});

function bulkStepUiSchema(te: (s: string) => any) {
  return {
    aiTargetField: {
      type: 'string',
      title: te('Ghi kết quả vào'),
      'x-decorator': 'FormItem',
      'x-component': 'PtdlBulkTargetField',
    },
    rowConnection: {
      type: 'void',
      'x-component': 'PtdlGrid',
      properties: {
        aiService: { type: 'string', title: te('Dịch vụ LLM'), 'x-decorator': 'FormItem', 'x-component': 'PtdlLlmServiceSelect' },
        aiModel: { type: 'string', title: te('Model'), 'x-decorator': 'FormItem', 'x-component': 'PtdlLlmModelSelect' },
      },
    },
    aiOutputType: { type: 'string', title: te('Kiểu kết quả'), 'x-decorator': 'FormItem', 'x-component': 'PtdlAiOutputSelect' },
    aiOptions: {
      type: 'array',
      title: te('Lựa chọn (Chọn 1)'),
      'x-decorator': 'FormItem',
      'x-component': 'PtdlAiOptions',
      'x-reactions': (field: any) => {
        field.display = field.form?.values?.aiOutputType === 'singleSelect' ? 'visible' : 'hidden';
      },
    },
    aiSystem: { type: 'string', title: te('Câu lệnh hệ thống'), 'x-decorator': 'FormItem', 'x-component': 'PtdlAiSystemInput' },
    aiPrompt: { type: 'string', title: te('Prompt'), 'x-decorator': 'FormItem', 'x-component': 'PtdlBulkPromptInput' },
  };
}

export function registerBulkGenerate({ flowEngine, ActionModel, ActionSceneEnum, api, tExpr }: BulkGenerateDeps) {
  if (!flowEngine || !ActionModel || !ActionSceneEnum) {
    // eslint-disable-next-line no-console
    console.warn('[ai-column] bulk: missing flowEngine/ActionModel/ActionSceneEnum — skip');
    return;
  }
  if (api) API = api;
  const te = (s: string) => (tExpr ? tExpr(s, { ns: NS }) : s);

  try {
    registerFlowComponentsOnce(flowEngine, { PtdlBulkTargetField, PtdlBulkPromptInput });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[ai-column] bulk: registerComponents failed', e);
  }

  class PtdlBulkGenerateActionModel extends ActionModel {
    static scene = ActionSceneEnum.collection;
    defaultProps = { title: te('Sinh AI hàng loạt') };
  }

  flowEngine.registerModels({ PtdlBulkGenerateActionModel });

  try {
    (PtdlBulkGenerateActionModel as any).define({ label: te('Sinh AI hàng loạt') });
  } catch {
    /* define optional */
  }

  try {
    (PtdlBulkGenerateActionModel as any).registerFlow({
      key: 'ptdlBulkGenerateSettings',
      title: te('Cấu hình sinh AI hàng loạt'),
      on: 'click',
      steps: {
        confirm: {
          use: 'confirm',
          defaultParams: {
            enable: true,
            title: te('Sinh AI hàng loạt'),
            content: te('Sinh giá trị AI cho các dòng đã chọn? Giá trị hiện tại của field đích sẽ bị GHI ĐÈ.'),
          },
        },
        run: {
          title: te('Cấu hình AI'),
          uiMode: { type: 'dialog', props: { width: 680 } },
          uiSchema: bulkStepUiSchema(te),
          defaultParams: {
            aiTargetField: '',
            aiService: '',
            aiModel: '',
            aiOutputType: 'text',
            aiOptions: [],
            aiSystem: '',
            aiPrompt: '',
          },
          async handler(ctx: any, params: any) {
            const targetField = params?.aiTargetField;
            const prompt = params?.aiPrompt;
            if (!targetField || !String(prompt || '').trim()) {
              ctx.message.error(t('Chưa cấu hình field đích / prompt — mở gear (⚙) để cấu hình trước.'));
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

            // Detect ONCE (not per-row) whether the chosen target field itself renders markdown
            // (e.g. a Markdown-interface field) — if so, the server keeps the model's formatting
            // instead of stripping it like every other plain text/textarea target.
            let targetIsMarkdown = false;
            try {
              const targetFields = await getFields(ctx.api, collectionName, collection?.dataSourceKey || 'main');
              const targetDef = (targetFields || []).find((f: any) => f?.name === targetField);
              targetIsMarkdown = !!fieldJsonMeta(targetDef).markdown;
            } catch {
              /* best-effort — falls back to stripping, the safer default */
            }

            maybeWarnLargeBatch(ctx, rows.length);
            const hideLoading = ctx.message.loading(t('Đang sinh AI cho {{n}} dòng...', { n: rows.length }), 0);
            const summary = newBulkSummary();
            await runBulkPool(rows, 3, async (row) => {
              try {
                await withRetry(async () => {
                  const filterByTk = collection.getFilterByTK(row);
                  const res = await ctx.api.request({
                    url: 'ptdlAiColumn:generate',
                    method: 'post',
                    data: {
                      llmService: params.aiService || undefined,
                      model: params.aiModel || undefined,
                      system: params.aiSystem || undefined,
                      prompt,
                      values: row,
                      output: {
                        type: params.aiOutputType || 'text',
                        options: Array.isArray(params.aiOptions) ? params.aiOptions : [],
                        markdown: targetIsMarkdown,
                      },
                    },
                  });
                  const value = res?.data?.data?.value;
                  if (value === undefined || value === null) throw new Error('AI did not return a value');
                  await ctx.api.request({
                    url: `${collectionName}:update`,
                    method: 'post',
                    params: { filterByTk },
                    data: { [targetField]: value },
                  });
                });
                summary.ok++;
              } catch (e) {
                recordFailure(summary, e);
              }
            });
            hideLoading();
            const msg = summaryMessage(summary, rows.length);
            if (isBulkAllOk(summary)) ctx.message.success(msg);
            else ctx.message.warning(msg);
            await resource.refresh?.();
          },
        },
      },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[ai-column] bulk: registerFlow failed', e);
  }

  return PtdlBulkGenerateActionModel;
}
