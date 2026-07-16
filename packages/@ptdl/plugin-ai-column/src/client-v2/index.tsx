import { Plugin, InputFieldModel, TextareaFieldModel, ActionModel, ActionSceneEnum, useApp } from '@nocobase/client-v2';
import { EditableItemModel, tExpr } from '@nocobase/flow-engine';
import { UploadFieldModel } from '@nocobase/plugin-file-manager/client-v2';
import { AttachmentURLFieldModel } from '@nocobase/plugin-field-attachment-url/client-v2';
import { registerAiColumn } from '../shared/aiColumn';
import { registerAiExtract } from '../shared/aiExtract';
import { registerAiExtractRows } from '../shared/aiExtractRows';
import { registerAiClassify } from '../shared/aiClassify';
import { registerAiImage, registerAiVoice } from '../shared/aiImage';
import { registerBulkGenerate } from '../shared/aiBulkGenerate';
import { registerBulkExtract } from '../shared/aiBulkExtract';
import { createAiProviderManager } from '../shared/AiProviderManager';
import { NS, te, t, setRuntimeT } from '../shared/i18n';
import { setSharedT, SHARED_NS, sharedEnUS } from '@ptdl/shared';
import enUS from '../locale/en-US.json';

// @nocobase/client-v2 has no useAPIClient — the app's client lives on useApp().apiClient.
const useApiClientV2 = () => (useApp() as any).apiClient;
import { registerBulkImage, registerBulkVoice } from '../shared/aiBulkMedia';
import { registerBulkClassify } from '../shared/aiBulkClassify';
import { registerBulkExtractRows } from '../shared/aiBulkExtractRows';

/**
 * @ptdl/plugin-ai-column — modern (/v/) client lane.
 * Registers the editable AI field models (single-line input + multi-line textarea, each
 * with the ✨ generate button) and binds them as a non-default component for their interfaces.
 * Also registers "AI Extract" on attachment fields (peer plugins @nocobase/plugin-file-manager
 * + @nocobase/plugin-field-attachment-url — both confirmed enabled; if either is disabled later,
 * drop its variant entry below, since a missing external here 404s the whole bundle on /v/).
 */
export class PluginAiColumnClientV2 extends Plugin {
  async load() {
    // i18n: register English translations against this plugin's namespace (Vietnamese = the key),
    // then inject the runtime translator for React render strings. Do this FIRST so every later
    // t()/te() in load() (and in components rendered afterwards) resolves.
    try {
      this.app.i18n.addResources('en-US', NS, enUS);
      // @ptdl/shared's own render strings (field-picker button, empty state) — bilingual per lane.
      this.app.i18n.addResources('en-US', SHARED_NS, sharedEnUS);
      // Unsupported UI languages → English: en-US fallback + a VN-key identity map for vi so it keeps VN.
      const _id = (m: any) => Object.fromEntries(Object.keys(m || {}).map((k) => [k, k]));
      this.app.i18n.addResources('vi-VN', NS, _id(enUS));
      this.app.i18n.addResources('vi-VN', SHARED_NS, _id(sharedEnUS));
      const _i: any = this.app.i18n;
      _i.options.fallbackLng = 'en-US';
      if (_i.services?.languageUtils?.options) _i.services.languageUtils.options.fallbackLng = 'en-US';
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[ai-column] i18n addResources failed', e);
    }
    setRuntimeT((s, o) => this.app.i18n.t(s, { ns: NS, ...(o || {}) }));
    setSharedT((s, o) => this.app.i18n.t(s, { ns: SHARED_NS, ...(o || {}) }));
    const fe = (this as any).flowEngine;
    const api = (this as any).app?.apiClient;
    registerAiColumn({
      flowEngine: fe,
      variants: [
        { Base: InputFieldModel, modelName: 'AiInputFieldModel', interfaces: ['input', 'email', 'url', 'phone'], label: te('AI nhập') },
        { Base: TextareaFieldModel, modelName: 'AiTextareaFieldModel', interfaces: ['textarea'], label: te('AI văn bản') },
      ],
      EditableItemModel,
      api,
      tExpr,
    });
    // Must run AFTER registerAiColumn: that call sets the shared apiClient module-level variable
    // that PtdlAiPromptInput/PtdlAiSystemInput (reused here) and AiExtractEditable depend on.
    registerAiExtract({
      flowEngine: fe,
      variants: [
        { Base: UploadFieldModel, modelName: 'AiExtractFieldModel', interfaces: ['attachment'], label: te('AI trích xuất') },
        { Base: AttachmentURLFieldModel, modelName: 'AiExtractUrlFieldModel', interfaces: ['attachmentURL'], label: te('AI trích xuất') },
      ],
      EditableItemModel,
      api,
      tExpr,
    });
    // AI Multi-row Extract: read ONE source (a document in an attachment field, or pasted text in a
    // textarea) → N child rows into a to-many (sub-table) field of the same record (e.g. a quote →
    // order lines). Bound onto the SOURCE field; output goes into the configured relation.
    registerAiExtractRows({
      flowEngine: fe,
      variants: [
        { Base: UploadFieldModel, modelName: 'AiExtractRowsFieldModel', interfaces: ['attachment'], label: te('AI trích nhiều dòng'), isFileSource: true },
        { Base: AttachmentURLFieldModel, modelName: 'AiExtractRowsUrlFieldModel', interfaces: ['attachmentURL'], label: te('AI trích nhiều dòng'), isFileSource: true },
        { Base: TextareaFieldModel, modelName: 'AiExtractRowsTextFieldModel', interfaces: ['textarea'], label: te('AI trích nhiều dòng'), isFileSource: false },
      ],
      EditableItemModel,
      api,
      tExpr,
    });
    // AI Classify (Block B): match this field's value to ONE row of a master collection via vector
    // embedding + LLM re-rank; ✨ shows a candidate picker, writes the picked code. Bound to text
    // code fields (e.g. "Mã HS", "Mã SP"). Reuses the same server `classify` action per-row extract.
    registerAiClassify({
      flowEngine: fe,
      variants: [{ Base: InputFieldModel, modelName: 'AiClassifyFieldModel', interfaces: ['input'], label: te('AI phân loại') }],
      EditableItemModel,
      api,
      tExpr,
    });
    // AI Image: generate an image from a prompt straight into an attachment field (peer of AI
    // Extract, same interfaces — both show up as "Field component" options).
    registerAiImage({
      flowEngine: fe,
      variants: [
        { Base: UploadFieldModel, modelName: 'AiImageFieldModel', interfaces: ['attachment'], label: te('AI ảnh'), urlMode: false },
        { Base: AttachmentURLFieldModel, modelName: 'AiImageUrlFieldModel', interfaces: ['attachmentURL'], label: te('AI ảnh'), urlMode: true },
      ],
      EditableItemModel,
      api,
      tExpr,
    });
    // AI Voice: text-to-speech into an attachment field (same interfaces as image/extract).
    registerAiVoice({
      flowEngine: fe,
      variants: [
        { Base: UploadFieldModel, modelName: 'AiVoiceFieldModel', interfaces: ['attachment'], label: te('AI giọng nói'), urlMode: false },
        { Base: AttachmentURLFieldModel, modelName: 'AiVoiceUrlFieldModel', interfaces: ['attachmentURL'], label: te('AI giọng nói'), urlMode: true },
      ],
      EditableItemModel,
      api,
      tExpr,
    });
    // Table-level bulk action ("Bulk AI Generate") — appears in the table's own toolbar
    // (CollectionActionGroupModel), same category as core's "Delete".
    registerBulkGenerate({ flowEngine: fe, ActionModel, ActionSceneEnum, api, tExpr });
    registerBulkExtract({ flowEngine: fe, ActionModel, ActionSceneEnum, api, tExpr });
    registerBulkImage({ flowEngine: fe, ActionModel, ActionSceneEnum, api, tExpr });
    registerBulkVoice({ flowEngine: fe, ActionModel, ActionSceneEnum, api, tExpr });
    // Bulk Classify + Bulk Extract-rows — run classify / multi-row extract over selected table rows.
    registerBulkClassify({ flowEngine: fe, ActionModel, ActionSceneEnum, api, tExpr });
    registerBulkExtractRows({ flowEngine: fe, ActionModel, ActionSceneEnum, api, tExpr });

    // Combined "AI Provider" settings page: Voice (TTS) credentials + AI-Classify embedding index.
    try {
      const AiProviderManager = createAiProviderManager({ useApiClient: useApiClientV2 });
      (this as any).app.pluginSettingsManager.addMenuItem({ key: 'ptdl-ai-provider', title: t('Nhà cung cấp AI'), icon: 'ApiOutlined' });
      (this as any).app.pluginSettingsManager.addPageTabItem({ menuKey: 'ptdl-ai-provider', key: 'index', title: t('Cấu hình'), Component: AiProviderManager });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[ai-column] AI provider settings page registration failed', e);
    }
    // eslint-disable-next-line no-console
    console.log('[ai-column] client-v2 (modern lane) loaded — AI input + textarea + extract + image + voice fields + bulk generate/extract/image/voice');
  }
}

export default PluginAiColumnClientV2;
