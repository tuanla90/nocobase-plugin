import React, { useEffect, useState } from 'react';
import { observer } from '@formily/react';
import { useFlowSettingsContext } from '@nocobase/flow-engine';
import { getFields, ColumnSelect } from '@tuanla90/shared';
import { PtdlBulkPromptInput } from './aiBulkGenerate';
import { PtdlImageModelSelect, PtdlVoiceModelSelect, PtdlVoiceSelect, PtdlVoiceStyleInput, PtdlVoicePreview } from './aiImage';
import { withRetry, runBulkPool, newBulkSummary, recordFailure, summaryMessage, isBulkAllOk, maybeWarnLargeBatch } from './bulkRunner';
import { registerFlowComponentsOnce } from './aiColumn';
import { NS, t } from './i18n';

/**
 * @tuanla90/plugin-ai-column — "Bulk AI Image" / "Bulk AI Voice": the media-generation siblings of Bulk
 * AI Generate/Extract. Same COLLECTION-scene table-action shape, but per selected row they GENERATE
 * media from the prompt (image via `generateImage`, TTS via `generateVoice`) and write the resulting
 * attachment into ONE target attachment field of the row.
 *
 * Reuses the field-level media pickers (`PtdlImageModelSelect` / `PtdlVoiceModelSelect` /
 * `PtdlVoiceSelect` / `PtdlVoiceStyleInput` / `PtdlVoicePreview`, exported from aiImage.tsx) so the
 * 30-voice list + gender labels live in exactly one place, and `PtdlBulkPromptInput`
 * (aiBulkGenerate.tsx) for the {{field}} picker. `registerBulkImage` / `registerBulkVoice` share one
 * parameterized register (`registerBulkMedia`) — they differ only by endpoint, extra request fields,
 * the dialog's config rows, and wording.
 */

export type BulkMediaDeps = {
  flowEngine: any;
  ActionModel: any;
  ActionSceneEnum: any;
  api?: any;
  tExpr?: (s: string, opts?: any) => any;
};

/** What makes bulk-image different from bulk-voice. */
type BulkMediaSpec = {
  endpoint: string; // 'ptdlAiColumn:generateImage' | ':generateVoice'
  buildData: (p: any) => Record<string, any>; // extra request fields (model / voice / style)
  modelName: string; // registered flow-model name
  actionTitle: string; // action label in the toolbar (Vietnamese i18n key)
  settingsTitle: string; // settings dialog / flow title (Vietnamese i18n key)
  confirmContent: string; // confirm-dialog body (Vietnamese i18n key)
  configRows: (te: (s: string) => any) => Record<string, any>; // per-kind config fields (above prompt)
  components: Record<string, any>; // settings components to register
  logKind: string;
};

let API: any = null;

const ATTACHMENT_INTERFACES = new Set(['attachment', 'attachmentURL']);

/** Target attachment field (of the table's OWN collection) to write the generated media into. Same
 *  raw-`getFields` approach as bulk-extract's source picker (attachment/attachmentURL are excluded
 *  from the normal cascader leaf list, so we can't use that helper here). */
const PtdlBulkTargetAttachment: React.FC<any> = observer((props: any) => {
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
      placeholder={t('Chọn field đích để ghi media (Attachment)')}
      onChange={(v) => props.onChange?.(v)}
    />
  );
});

function bulkMediaStepUiSchema(te: (s: string) => any, spec: BulkMediaSpec) {
  return {
    aiTargetField: {
      type: 'string',
      title: te('Ghi vào field (Attachment)'),
      'x-decorator': 'FormItem',
      'x-component': 'PtdlBulkTargetAttachment',
    },
    aiService: { type: 'string', title: te('Dịch vụ LLM'), 'x-decorator': 'FormItem', 'x-component': 'PtdlLlmServiceSelect' },
    ...spec.configRows(te),
    aiPrompt: { type: 'string', title: te('Prompt / Text (hỗ trợ chèn cột)'), 'x-decorator': 'FormItem', 'x-component': 'PtdlBulkPromptInput' },
  };
}

function registerBulkMedia({ flowEngine, ActionModel, ActionSceneEnum, api, tExpr }: BulkMediaDeps, spec: BulkMediaSpec) {
  if (!flowEngine || !ActionModel || !ActionSceneEnum) {
    // eslint-disable-next-line no-console
    console.warn(`[ai-column] ${spec.logKind}: missing flowEngine/ActionModel/ActionSceneEnum — skip`);
    return;
  }
  if (api) API = api;
  const te = (s: string) => (tExpr ? tExpr(s, { ns: NS }) : s);

  try {
    registerFlowComponentsOnce(flowEngine, { PtdlBulkTargetAttachment, ...spec.components });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(`[ai-column] ${spec.logKind}: registerComponents failed`, e);
  }

  class PtdlBulkMediaActionModel extends ActionModel {
    static scene = ActionSceneEnum.collection;
    defaultProps = { title: te(spec.actionTitle) };
  }

  flowEngine.registerModels({ [spec.modelName]: PtdlBulkMediaActionModel });

  try {
    (PtdlBulkMediaActionModel as any).define({ label: te(spec.actionTitle) });
  } catch {
    /* define optional */
  }

  try {
    (PtdlBulkMediaActionModel as any).registerFlow({
      key: `${spec.modelName}Settings`,
      title: te(spec.settingsTitle),
      on: 'click',
      steps: {
        confirm: {
          use: 'confirm',
          defaultParams: { enable: true, title: te(spec.actionTitle), content: te(spec.confirmContent) },
        },
        run: {
          title: te(spec.settingsTitle),
          uiMode: { type: 'dialog', props: { width: 640 } },
          uiSchema: bulkMediaStepUiSchema(te, spec),
          defaultParams: { aiTargetField: '', aiService: '', aiPrompt: '' },
          async handler(ctx: any, params: any) {
            const targetField = params?.aiTargetField;
            const prompt = params?.aiPrompt || '';
            if (!targetField || !String(prompt).trim()) {
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
            const dsk = collection?.dataSourceKey || 'main';

            // attachmentURL field stores a bare url string; attachment stores record(s). Detect once.
            let urlMode = false;
            try {
              const fields = await getFields(ctx.api, collectionName, dsk);
              urlMode = (fields || []).find((f: any) => f?.name === targetField)?.interface === 'attachmentURL';
            } catch {
              /* default to attachment-record mode */
            }

            maybeWarnLargeBatch(ctx, rows.length);
            const hideLoading = ctx.message.loading(t('Đang sinh media cho {{n}} dòng...', { n: rows.length }), 0);
            const summary = newBulkSummary();

            // Media generation is heavier + more rate-limit-prone than text → smaller pool (2).
            await runBulkPool(rows, 2, async (row) => {
              try {
                await withRetry(async () => {
                  const filterByTk = collection.getFilterByTK(row);
                  const res = await ctx.api.request({
                    url: spec.endpoint,
                    method: 'post',
                    data: { llmService: params.aiService || undefined, prompt, values: row, ...spec.buildData(params) },
                  });
                  const att = res?.data?.data?.attachment;
                  if (!att) throw new Error(t('model không trả về media'));
                  await ctx.api.request({
                    url: `${collectionName}:update`,
                    method: 'post',
                    params: { filterByTk },
                    data: { [targetField]: urlMode ? att.url : [att] },
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
    console.warn(`[ai-column] ${spec.logKind}: registerFlow failed`, e);
  }

  return PtdlBulkMediaActionModel;
}

export function registerBulkImage(deps: BulkMediaDeps) {
  return registerBulkMedia(deps, {
    endpoint: 'ptdlAiColumn:generateImage',
    buildData: (p) => ({ model: p.aiImageModel || undefined }),
    modelName: 'PtdlBulkImageActionModel',
    actionTitle: 'Tạo ảnh AI hàng loạt',
    settingsTitle: 'Cấu hình tạo ảnh AI hàng loạt',
    confirmContent: 'Sinh ảnh AI cho các dòng đã chọn? Giá trị hiện tại của field đích sẽ bị GHI ĐÈ.',
    configRows: (te) => ({
      aiImageModel: { type: 'string', title: te('Model ảnh'), 'x-decorator': 'FormItem', 'x-component': 'PtdlImageModelSelect' },
    }),
    components: { PtdlImageModelSelect },
    logKind: 'bulk image',
  });
}

export function registerBulkVoice(deps: BulkMediaDeps) {
  return registerBulkMedia(deps, {
    endpoint: 'ptdlAiColumn:generateVoice',
    buildData: (p) => ({ model: p.aiVoiceModel || undefined, voice: p.aiVoice || undefined, style: p.aiVoiceStyle || undefined }),
    modelName: 'PtdlBulkVoiceActionModel',
    actionTitle: 'Tạo giọng AI hàng loạt',
    settingsTitle: 'Cấu hình tạo giọng AI hàng loạt',
    confirmContent: 'Sinh giọng đọc (TTS) cho các dòng đã chọn? Giá trị hiện tại của field đích sẽ bị GHI ĐÈ.',
    configRows: (te) => ({
      aiVoiceModel: { type: 'string', title: te('Model TTS'), 'x-decorator': 'FormItem', 'x-component': 'PtdlVoiceModelSelect' },
      aiVoice: { type: 'string', title: te('Giọng đọc'), 'x-decorator': 'FormItem', 'x-component': 'PtdlVoiceSelect' },
      aiVoiceStyle: { type: 'string', title: te('Phong cách / cảm xúc / tốc độ (tùy chọn)'), 'x-decorator': 'FormItem', 'x-component': 'PtdlVoiceStyleInput' },
      voicePreview: { type: 'void', 'x-decorator': 'FormItem', 'x-component': 'PtdlVoicePreview' },
    }),
    components: { PtdlVoiceModelSelect, PtdlVoiceSelect, PtdlVoiceStyleInput, PtdlVoicePreview },
    logKind: 'bulk voice',
  });
}
