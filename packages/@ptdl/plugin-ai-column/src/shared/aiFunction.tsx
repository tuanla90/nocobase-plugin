import React from 'react';
import { observer } from '@formily/react';
import { FormTab } from '@formily/antd-v5';
import { Select } from 'antd';
import { getFields, visibleWhen } from '@ptdl/shared';
import { splitMapping } from './aiExtractRows';
import { withRetry } from './bulkRunner';
import { NS, t } from './i18n';

/**
 * @ptdl/plugin-ai-column — "AI Function": ONE record-scoped action button (RecordActionModel, on a
 * Details/record block's action bar) that runs ANY AI job on the CURRENT record. The designer picks a
 * job (extract / create rows / classify / generate / TTS / STT / image) and its config once; clicking
 * the button runs that job for the record and writes the result back.
 *
 * It's essentially "the bulk table actions, but for one record via a job selector" — so it REUSES the
 * bulk config components (already registered globally by registerBulk* — all read `blockModel.collection`)
 * and the SAME server actions (`extract` / `extractRowsInto` / `classify` / `generate` / `generateVoice`
 * / `generateImage`). No new server work: STT is just `extract` with an audio source + a transcribe prompt.
 *
 * MUST be registered AFTER the registerBulk* calls so their components exist for this uiSchema.
 */

export type AiFunctionDeps = { flowEngine: any; RecordActionModel: any; FormActionModel?: any; ActionSceneEnum: any; api?: any; tExpr?: (s: string, opts?: any) => any };

let API: any = null;

const JOBS = (te: (s: string) => any) => [
  { value: 'extract', label: te('Trích xuất (tệp/ảnh → các field)') },
  { value: 'extractRows', label: te('Tạo nhiều dòng (→ bảng con)') },
  { value: 'classify', label: te('Phân loại (đối chiếu → mã/FK)') },
  { value: 'generate', label: te('Sinh nội dung (→ 1 field)') },
  { value: 'tts', label: te('Đọc thành giọng nói (TTS)') },
  { value: 'stt', label: te('Chép lời từ audio (STT)') },
  { value: 'image', label: te('Tạo ảnh (→ field đính kèm)') },
];

/** Job picker — drives which config group shows (via visibleWhen) + which server action runs. */
export const PtdlAiJobSelect: React.FC<any> = observer((props: any) => (
  <Select style={{ width: '100%' }} options={JOBS(t)} value={props.value || 'extract'} onChange={(v) => props.onChange?.(v)} placeholder={t('Chọn việc AI cần làm')} />
));

/** Fetch one field's metadata (type/interface) from the block collection — for target-type detection. */
async function fieldMeta(collectionName: string, dsk: string, name: string): Promise<any> {
  try {
    const fields = await getFields(API, collectionName, dsk || 'main');
    return (fields || []).find((f: any) => f.name === name) || null;
  } catch {
    return null;
  }
}

function aiFunctionStepUiSchema(te: (s: string) => any) {
  // Two tabs (like "AI Classify pro"): "Việc & dữ liệu" (job selector + the job's I/O fields) and
  // "Prompt & Model" (shared prompt + LLM). FormTab/TabPane are VOID wrappers, so every field keeps a
  // FLAT value path (aiJob/aiMapping/…) — avoids the tab-nesting trap where paths get nested under the
  // tab key. Visibility is per-field via x-reactions (visibleWhen), NOT group containers (a raw `div`
  // x-component may be unregistered → silently drops the group).
  const on = (job: string | string[]) => ({ 'x-reactions': visibleWhen('aiJob', job) });
  const fi = (title: string, comp: string, job: string | string[], extra?: any) => ({ type: extra?.type || 'string', title: te(title), 'x-decorator': 'FormItem', 'x-component': comp, ...on(job) });
  const tab = (title: string, properties: any) => ({ type: 'void', 'x-component': 'FormTab.TabPane', 'x-component-props': { tab: te(title) }, properties });
  return {
    tabs: {
      type: 'void',
      'x-component': 'FormTab',
      properties: {
        tabJob: tab('Việc & dữ liệu', {
          aiJob: { type: 'string', title: te('Việc cần làm'), 'x-decorator': 'FormItem', 'x-component': 'PtdlAiJobSelect' },
          // extract
          aiSourceField: fi('Đọc tệp từ (ảnh / PDF / tài liệu)', 'PtdlBulkSourceAttachment', 'extract'),
          aiMapping: { ...fi('Các field cần trích xuất', 'PtdlExtractMapping', 'extract'), type: 'array' },
          // create rows
          aiTargetRelation: { ...fi('Bảng con nhận dòng', 'PtdlRelationTargetSelect', 'extractRows'), type: 'object' },
          aiChildMapping: { ...fi('Các field của mỗi dòng', 'PtdlChildFieldMapping', 'extractRows'), type: 'array' },
          aiRowsSource: fi('Đọc tệp từ (ảnh / PDF / tài liệu)', 'PtdlBulkRowsSource', 'extractRows'),
          aiRowMode: fi('Cách ghi', 'PtdlRowModeSelect', 'extractRows'),
          // classify
          aiMaster: { ...fi('Bảng master (danh mục đối chiếu)', 'PtdlMasterCollectionSelect', 'classify'), type: 'object' },
          aiClfSource: fi('Field đem đối chiếu', 'PtdlBulkClassifySource', 'classify'),
          aiClfTarget: fi('Field nhận kết quả', 'PtdlBulkClassifyTarget', 'classify'),
          aiWriteTemplate: fi('Giá trị ghi vào (cột của master)', 'PtdlMasterTokenArea', 'classify'),
          aiLabelTemplate: fi('Hiển thị ứng viên (cột của master)', 'PtdlMasterTokenArea', 'classify'),
          // generate
          aiTargetField: fi('Ghi kết quả vào', 'PtdlBulkTargetField', 'generate'),
          aiOutputType: fi('Kiểu kết quả', 'PtdlAiOutputSelect', 'generate'),
          aiOptions: { ...fi('Lựa chọn (nếu là chọn 1)', 'PtdlAiOptions', 'generate'), type: 'array' },
          // tts
          aiTtsTarget: fi('Ghi audio vào (field đính kèm)', 'PtdlBulkTargetAttachment', 'tts'),
          aiVoiceModel: fi('Model TTS', 'PtdlVoiceModelSelect', 'tts'),
          aiVoice: fi('Giọng đọc', 'PtdlVoiceSelect', 'tts'),
          aiVoiceStyle: fi('Phong cách / tốc độ (tùy chọn)', 'PtdlVoiceStyleInput', 'tts'),
          // stt
          aiSttSource: fi('Đọc audio từ (field đính kèm)', 'PtdlBulkSourceAttachment', 'stt'),
          aiSttTarget: fi('Ghi lời phiên âm vào (field text)', 'PtdlBulkTargetField', 'stt'),
          // image
          aiImgTarget: fi('Ghi ảnh vào (field đính kèm)', 'PtdlBulkTargetAttachment', 'image'),
          aiImageModel: fi('Model ảnh', 'PtdlImageModelSelect', 'image'),
        }),
        tabPrompt: tab('Prompt & Model', {
          aiSystem: fi('Câu lệnh hệ thống', 'PtdlAiSystemInput', ['extract', 'extractRows', 'generate']),
          aiPrompt: fi('Prompt / Nội dung', 'PtdlBulkPromptInput', ['extract', 'extractRows', 'generate', 'tts', 'image']),
          rowLLM: {
            type: 'void', 'x-component': 'PtdlGrid',
            properties: {
              aiService: { type: 'string', title: te('Dịch vụ LLM'), 'x-decorator': 'FormItem', 'x-component': 'PtdlLlmServiceSelect' },
              aiModel: fi('Model', 'PtdlLlmModelSelect', ['extract', 'extractRows', 'classify', 'generate', 'stt']),
            },
          },
        }),
      },
    },
  };
}

/** Run the configured job for ONE record. Mirrors each bulk handler but with row = the current record. */
async function runJob(ctx: any, params: any) {
  const job = params?.aiJob || 'extract';
  const collection = ctx.blockModel?.collection || ctx.model?.context?.blockModel?.collection;
  const collectionName = collection?.name;
  const record = ctx.record || ctx.model?.context?.record;
  if (!collectionName || !record) { ctx.message.error(t('Không xác định được bản ghi / collection.')); return; }
  const dsk = collection?.dataSourceKey || 'main';
  const filterByTk = collection.getFilterByTK(record);
  const svc = { llmService: params.aiService || undefined, model: params.aiModel || undefined };
  const update = (data: any) => ctx.api.request({ url: `${collectionName}:update`, method: 'post', params: { filterByTk }, data });

  const hide = ctx.message.loading(t('AI đang xử lý...'), 0);
  try {
    await withRetry(async () => {
      if (job === 'extract') {
        const mapping = Array.isArray(params.aiMapping) ? params.aiMapping : [];
        if (!params.aiSourceField && !String(params.aiPrompt || '').trim()) throw new Error(t('Chưa cấu hình nguồn/prompt'));
        if (!mapping.length) throw new Error(t('Chưa cấu hình field trích xuất'));
        const fields = mapping.map((m: any) => ({ name: m.field, description: m.description || '', type: m.type || 'string', enum: m.enumValues, markdown: m.markdown }));
        const res = await ctx.api.request({ url: 'ptdlAiColumn:extract', method: 'post', data: { ...svc, system: params.aiSystem || undefined, prompt: params.aiPrompt || '', values: record, attachment: params.aiSourceField ? record[params.aiSourceField] : undefined, fields } });
        const values = res?.data?.data?.values;
        if (!values || typeof values !== 'object') throw new Error('AI did not return usable values');
        await update(values);
      } else if (job === 'stt') {
        const src = params.aiSttSource, tgt = params.aiSttTarget;
        if (!src || !tgt) throw new Error(t('Chưa chọn field audio nguồn / field text đích'));
        const res = await ctx.api.request({ url: 'ptdlAiColumn:extract', method: 'post', data: { ...svc, prompt: t('Hãy phiên âm chính xác toàn bộ nội dung lời nói trong tệp audio.'), values: record, attachment: record[src], fields: [{ name: tgt, description: t('Nội dung phiên âm đầy đủ từ audio'), type: 'string' }] } });
        const values = res?.data?.data?.values;
        if (!values || values[tgt] == null) throw new Error('AI did not transcribe');
        await update({ [tgt]: values[tgt] });
      } else if (job === 'extractRows') {
        const rel = params.aiTargetRelation || {};
        const { fields, relationMaps } = splitMapping(Array.isArray(params.aiChildMapping) ? params.aiChildMapping : []);
        if (!rel.name || !fields.length) throw new Error(t('Chưa cấu hình bảng con / field'));
        const config = { relationField: rel.name, fields, relationMaps, sourceField: params.aiRowsSource || undefined, system: params.aiSystem || undefined, prompt: params.aiPrompt || '', mode: params.aiRowMode || 'append', ...svc };
        const res = await ctx.api.request({ url: 'ptdlAiColumn:extractRowsInto', method: 'post', data: { collectionName, filterByTk, config } });
        ctx.message.success(t('Đã tạo {{n}} dòng con', { n: res?.data?.data?.created || 0 }));
      } else if (job === 'classify') {
        const master = params.aiMaster?.collection;
        const src = params.aiClfSource, tgt = params.aiClfTarget;
        if (!master || !src || !tgt) throw new Error(t('Chưa cấu hình master / field nguồn / field đích'));
        const q = record[src];
        if (q == null || String(q).trim() === '') throw new Error(t('Field nguồn đang trống'));
        const tf = await fieldMeta(collectionName, dsk, tgt);
        const targetIsRel = !!tf && (tf.type === 'belongsTo' || tf.type === 'hasOne');
        const res = await ctx.api.request({ url: 'ptdlAiColumn:classify', method: 'post', data: { query: String(q), masterCollection: master, dataSourceKey: params.aiMaster?.dataSourceKey || 'main', labelTemplate: params.aiLabelTemplate || undefined, writeTemplate: params.aiWriteTemplate || undefined, ...svc } });
        const best = res?.data?.data?.best;
        if (!best) throw new Error(t('Không tìm được ứng viên khớp'));
        await update({ [tgt]: targetIsRel ? { id: best.tk } : best.write });
      } else if (job === 'generate') {
        const tgt = params.aiTargetField;
        if (!tgt || !String(params.aiPrompt || '').trim()) throw new Error(t('Chưa cấu hình field đích / prompt'));
        const tf = await fieldMeta(collectionName, dsk, tgt);
        const res = await ctx.api.request({ url: 'ptdlAiColumn:generate', method: 'post', data: { ...svc, system: params.aiSystem || undefined, prompt: params.aiPrompt || '', values: record, output: { type: params.aiOutputType || 'text', options: Array.isArray(params.aiOptions) ? params.aiOptions : [], markdown: tf?.interface === 'markdown' } } });
        const value = res?.data?.data?.value;
        if (value === undefined || value === null) throw new Error('AI did not return a value');
        await update({ [tgt]: value });
      } else if (job === 'tts' || job === 'image') {
        const tgt = job === 'tts' ? params.aiTtsTarget : params.aiImgTarget;
        if (!tgt || !String(params.aiPrompt || '').trim()) throw new Error(t('Chưa cấu hình field đích / prompt'));
        const tf = await fieldMeta(collectionName, dsk, tgt);
        const urlMode = tf?.interface === 'attachmentURL';
        const extra = job === 'tts' ? { model: params.aiVoiceModel || undefined, voice: params.aiVoice || undefined, style: params.aiVoiceStyle || undefined } : { model: params.aiImageModel || undefined };
        const res = await ctx.api.request({ url: job === 'tts' ? 'ptdlAiColumn:generateVoice' : 'ptdlAiColumn:generateImage', method: 'post', data: { llmService: params.aiService || undefined, prompt: params.aiPrompt || '', values: record, ...extra } });
        const att = res?.data?.data?.attachment || res?.data?.data;
        if (!att) throw new Error('AI did not return media');
        await update({ [tgt]: urlMode ? att.url : [att] });
      }
    });
    await (ctx.blockModel?.resource || ctx.model?.context?.blockModel?.resource)?.refresh?.();
    if (job !== 'extractRows') ctx.message.success(t('Xong.'));
  } catch (e: any) {
    ctx.message.error('AI: ' + (e?.response?.data?.errors?.[0]?.message || e?.response?.data?.message || e?.message || t('thất bại')));
  } finally {
    hide();
  }
}

/** Same jobs, but for a FORM (button next to Submit): AI-FILL the in-progress form values instead of
 *  updating the DB — no saved record needed, the user reviews then clicks Submit. Writes via the
 *  Formily form (`setValuesIn`), so extract-rows uses `extractRows` (returns lines) not `extractRowsInto`. */
async function runJobForm(ctx: any, params: any) {
  const job = params?.aiJob || 'extract';
  const form = ctx.model?.context?.form || ctx.form;
  const collection = ctx.blockModel?.collection || ctx.model?.context?.blockModel?.collection;
  const collectionName = collection?.name;
  if (!form || !collectionName) { ctx.message.error(t('Không xác định được form / collection.')); return; }
  const dsk = collection?.dataSourceKey || 'main';
  const values = form.values || ctx.model?.context?.formValues || {};
  const svc = { llmService: params.aiService || undefined, model: params.aiModel || undefined };
  const setField = (name: string, val: any) => { try { form.setValuesIn?.(name, val); } catch { form.setValues?.({ ...form.values, [name]: val }); } };

  const hide = ctx.message.loading(t('AI đang xử lý...'), 0);
  try {
    await withRetry(async () => {
      if (job === 'extract' || job === 'stt') {
        const isStt = job === 'stt';
        const src = isStt ? params.aiSttSource : params.aiSourceField;
        const mapping = isStt ? [{ name: params.aiSttTarget, description: t('Nội dung phiên âm đầy đủ từ audio'), type: 'string' }] : (Array.isArray(params.aiMapping) ? params.aiMapping.map((m: any) => ({ name: m.field, description: m.description || '', type: m.type || 'string', enum: m.enumValues, markdown: m.markdown })) : []);
        if (isStt && (!src || !params.aiSttTarget)) throw new Error(t('Chưa chọn field audio nguồn / field text đích'));
        if (!isStt && !mapping.length) throw new Error(t('Chưa cấu hình field trích xuất'));
        const res = await ctx.api.request({ url: 'ptdlAiColumn:extract', method: 'post', data: { ...svc, system: params.aiSystem || undefined, prompt: isStt ? t('Hãy phiên âm chính xác toàn bộ nội dung lời nói trong tệp audio.') : (params.aiPrompt || ''), values, attachment: src ? values[src] : undefined, fields: mapping } });
        const out = res?.data?.data?.values;
        if (!out || typeof out !== 'object') throw new Error('AI did not return usable values');
        Object.entries(out).forEach(([k, v]) => setField(k, v));
      } else if (job === 'extractRows') {
        const rel = params.aiTargetRelation || {};
        const { fields } = splitMapping(Array.isArray(params.aiChildMapping) ? params.aiChildMapping : []);
        if (!rel.name || !fields.length) throw new Error(t('Chưa cấu hình bảng con / field'));
        const res = await ctx.api.request({ url: 'ptdlAiColumn:extractRows', method: 'post', data: { ...svc, system: params.aiSystem || undefined, prompt: params.aiPrompt || '', values, attachment: params.aiRowsSource ? values[params.aiRowsSource] : undefined, fields } });
        const lines: any[] = res?.data?.data?.lines || [];
        if (!lines.length) throw new Error(t('AI không tách được dòng nào.'));
        const existing = Array.isArray(values[rel.name]) ? values[rel.name] : [];
        setField(rel.name, params.aiRowMode === 'replace' ? lines : [...existing, ...lines]);
      } else if (job === 'classify') {
        const master = params.aiMaster?.collection;
        const src = params.aiClfSource, tgt = params.aiClfTarget;
        if (!master || !src || !tgt) throw new Error(t('Chưa cấu hình master / field nguồn / field đích'));
        const q = values[src];
        if (q == null || String(q).trim() === '') throw new Error(t('Field nguồn đang trống'));
        const tf = await fieldMeta(collectionName, dsk, tgt);
        const isRel = !!tf && (tf.type === 'belongsTo' || tf.type === 'hasOne');
        const res = await ctx.api.request({ url: 'ptdlAiColumn:classify', method: 'post', data: { query: String(q), masterCollection: master, dataSourceKey: params.aiMaster?.dataSourceKey || 'main', labelTemplate: params.aiLabelTemplate || undefined, writeTemplate: params.aiWriteTemplate || undefined, ...svc } });
        const best = res?.data?.data?.best;
        if (!best) throw new Error(t('Không tìm được ứng viên khớp'));
        setField(tgt, isRel ? (best.record || { id: best.tk }) : best.write);
      } else if (job === 'generate') {
        const tgt = params.aiTargetField;
        if (!tgt || !String(params.aiPrompt || '').trim()) throw new Error(t('Chưa cấu hình field đích / prompt'));
        const tf = await fieldMeta(collectionName, dsk, tgt);
        const res = await ctx.api.request({ url: 'ptdlAiColumn:generate', method: 'post', data: { ...svc, system: params.aiSystem || undefined, prompt: params.aiPrompt || '', values, output: { type: params.aiOutputType || 'text', options: Array.isArray(params.aiOptions) ? params.aiOptions : [], markdown: tf?.interface === 'markdown' } } });
        const value = res?.data?.data?.value;
        if (value === undefined || value === null) throw new Error('AI did not return a value');
        setField(tgt, value);
      } else if (job === 'tts' || job === 'image') {
        const tgt = job === 'tts' ? params.aiTtsTarget : params.aiImgTarget;
        if (!tgt || !String(params.aiPrompt || '').trim()) throw new Error(t('Chưa cấu hình field đích / prompt'));
        const tf = await fieldMeta(collectionName, dsk, tgt);
        const urlMode = tf?.interface === 'attachmentURL';
        const extra = job === 'tts' ? { model: params.aiVoiceModel || undefined, voice: params.aiVoice || undefined, style: params.aiVoiceStyle || undefined } : { model: params.aiImageModel || undefined };
        const res = await ctx.api.request({ url: job === 'tts' ? 'ptdlAiColumn:generateVoice' : 'ptdlAiColumn:generateImage', method: 'post', data: { llmService: params.aiService || undefined, prompt: params.aiPrompt || '', values, ...extra } });
        const att = res?.data?.data?.attachment || res?.data?.data;
        if (!att) throw new Error('AI did not return media');
        setField(tgt, urlMode ? att.url : [att]);
      }
    });
    ctx.message.success(t('Đã điền vào form — kiểm tra rồi bấm Submit.'));
  } catch (e: any) {
    ctx.message.error('AI: ' + (e?.response?.data?.errors?.[0]?.message || e?.response?.data?.message || e?.message || t('thất bại')));
  } finally {
    hide();
  }
}

export function registerAiFunction({ flowEngine, RecordActionModel, FormActionModel, ActionSceneEnum, api, tExpr }: AiFunctionDeps) {
  if (!flowEngine || !RecordActionModel || !ActionSceneEnum) {
    console.warn('[ai-column] aiFunction: missing deps — skip');
    return;
  }
  if (api) API = api;
  const te = (s: string) => (tExpr ? tExpr(s, { ns: NS }) : s);

  try {
    flowEngine.flowSettings?.registerComponents?.({ PtdlAiJobSelect, FormTab, 'FormTab.TabPane': FormTab.TabPane });
  } catch (e) {
    console.warn('[ai-column] aiFunction: registerComponents failed', e);
  }

  const flowConfig = (runner: (ctx: any, params: any) => Promise<void>) => ({
    key: 'ptdlAiFunctionSettings',
    title: te('Cấu hình AI Function'),
    on: 'click',
    steps: {
      run: {
        title: te('Cấu hình AI Function'),
        uiMode: { type: 'dialog', props: { width: 760 } },
        uiSchema: aiFunctionStepUiSchema(te),
        defaultParams: { aiJob: 'extract', aiService: '', aiModel: '', aiPrompt: '', aiSystem: '', aiMapping: [], aiChildMapping: [], aiTargetRelation: {}, aiRowMode: 'append', aiMaster: {}, aiOptions: [], aiOutputType: 'text' },
        async handler(ctx: any, params: any) { await runner(ctx, params); },
      },
    },
  });

  // (1) Record variant — on a Details/record block's action bar → UPDATES the saved record.
  class PtdlAiFunctionActionModel extends RecordActionModel {
    static scene = ActionSceneEnum.record;
    defaultProps = { title: te('AI Function') };
  }
  flowEngine.registerModels({ PtdlAiFunctionActionModel });
  try { (PtdlAiFunctionActionModel as any).define({ label: te('AI Function') }); } catch { /* optional */ }
  try { (PtdlAiFunctionActionModel as any).registerFlow(flowConfig(runJob)); } catch (e) { console.warn('[ai-column] aiFunction record: registerFlow failed', e); }

  // (2) Form variant — a button next to Submit in a create/edit FORM → AI-FILLS the form (no DB write).
  if (FormActionModel) {
    class PtdlAiFunctionFormActionModel extends FormActionModel {
      defaultProps = { title: te('AI điền hộ') };
    }
    flowEngine.registerModels({ PtdlAiFunctionFormActionModel });
    try { (PtdlAiFunctionFormActionModel as any).define({ label: te('AI điền hộ (AI Function)') }); } catch { /* optional */ }
    try { (PtdlAiFunctionFormActionModel as any).registerFlow(flowConfig(runJobForm)); } catch (e) { console.warn('[ai-column] aiFunction form: registerFlow failed', e); }
  }

  return PtdlAiFunctionActionModel;
}
