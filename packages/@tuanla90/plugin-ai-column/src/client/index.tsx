import { Plugin, useAPIClient } from '@nocobase/client';
// The classic /admin app also hosts flow-engine and provides '@nocobase/client-v2' as a shared
// runtime module to plugins — so we import the editable field bases here too and register our
// AI field models into the classic app's flowEngine (works in /admin flow-engine blocks).
import { InputFieldModel, TextareaFieldModel, ActionModel, ActionSceneEnum, RecordSelectFieldModel, RecordActionModel, FormActionModel } from '@nocobase/client-v2';
import { EditableItemModel, tExpr } from '@nocobase/flow-engine';
// Optional peer plugins (file-manager + field-attachment-url) — EITHER may be disabled on a given
// instance. Import defensively via `* as`: a missing peer → const is `undefined` → the attachment
// variants get `Base: undefined`, which the register* fns skip, instead of crashing the whole bundle
// ("Cannot read properties of undefined … FieldModel"). See the client-v2 lane for the full note.
import * as fileManagerV2 from '@nocobase/plugin-file-manager/client-v2';
import * as attachmentUrlV2 from '@nocobase/plugin-field-attachment-url/client-v2';
const UploadFieldModel: any = (fileManagerV2 as any)?.UploadFieldModel;
const AttachmentURLFieldModel: any = (attachmentUrlV2 as any)?.AttachmentURLFieldModel;
import { registerAiColumn } from '../shared/aiColumn';
import { registerAiExtract } from '../shared/aiExtract';
import { registerAiExtractRows } from '../shared/aiExtractRows';
import { registerAiClassify } from '../shared/aiClassify';
import { registerAiClassifyDeep } from '../shared/aiClassifyDeep';
import { registerAiImage, registerAiVoice } from '../shared/aiImage';
import { registerBulkGenerate } from '../shared/aiBulkGenerate';
import { registerBulkExtract } from '../shared/aiBulkExtract';
import { registerBulkClassify } from '../shared/aiBulkClassify';
import { registerBulkExtractRows } from '../shared/aiBulkExtractRows';
import { registerAiFunction } from '../shared/aiFunction';
import { registerBulkImage, registerBulkVoice } from '../shared/aiBulkMedia';
import { registerAiColumnClassic } from './aiColumnClassic';
import { registerAiExtractClassic } from './aiExtractClassic';
import { registerAiMediaClassic } from './aiMediaClassic';
import { createAiProviderManager } from '../shared/AiProviderManager';
import { NS, te, t, setRuntimeT } from '../shared/i18n';
import { setSharedT, SHARED_NS, sharedEnUS } from '@tuanla90/shared';
import enUS from '../locale/en-US.json';

/**
 * @tuanla90/plugin-ai-column — classic (/admin) client lane.
 * Building this lane is REQUIRED even for a modern-only feature: the app resolves every enabled
 * plugin's `dist/client/index.js` (a missing file 404s → requirejs "Script error"). It also
 * registers the AI input/textarea fields for /admin flow-engine blocks.
 */
export class PluginAiColumnClient extends Plugin {
  async load() {
    // i18n: register English translations (Vietnamese = the key) + inject the runtime translator
    // for React render strings. FIRST in load() so every later t()/te() resolves.
    try {
      this.app.i18n.addResources('en-US', NS, enUS);
      // @tuanla90/shared's own render strings (field-picker button, empty state) — bilingual per lane.
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
    // AI Extract on flow-engine attachment fields (e.g. EnhancedTableBlockModel forms placed on
    // /admin pages).
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
    // AI Multi-row Extract on flow-engine blocks (/admin pages): document/text → N sub-table rows.
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
    // AI Classify (Block B) on flow-engine blocks (/admin pages): match a field's value to a master row.
    registerAiClassify({
      flowEngine: fe,
      variants: [{ Base: InputFieldModel, modelName: 'AiClassifyFieldModel', interfaces: ['input'], label: te('AI phân loại') }],
      EditableItemModel,
      api,
      tExpr,
    });
    registerAiClassifyDeep({
      flowEngine: fe,
      variants: [
        { Base: InputFieldModel, modelName: 'AiClassifyDeepFieldModel', interfaces: ['input'], label: te('AI phân loại chuyên sâu') },
        { Base: RecordSelectFieldModel, modelName: 'AiClassifyDeepRelationFieldModel', interfaces: ['m2o', 'obo'], label: te('AI phân loại chuyên sâu'), relationMode: true },
      ],
      EditableItemModel,
      api,
      tExpr,
    });
    // AI Image: generate an image into an attachment field (flow-engine blocks on /admin pages).
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
    // AI Voice: text-to-speech into an attachment field (flow-engine blocks on /admin pages).
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
    // Table-level bulk action ("Bulk AI Generate") for flow-engine table blocks on /admin pages.
    registerBulkGenerate({ flowEngine: fe, ActionModel, ActionSceneEnum, api, tExpr });
    registerBulkExtract({ flowEngine: fe, ActionModel, ActionSceneEnum, api, tExpr });
    registerBulkImage({ flowEngine: fe, ActionModel, ActionSceneEnum, api, tExpr });
    registerBulkVoice({ flowEngine: fe, ActionModel, ActionSceneEnum, api, tExpr });
    registerBulkClassify({ flowEngine: fe, ActionModel, ActionSceneEnum, api, tExpr });
    registerBulkExtractRows({ flowEngine: fe, ActionModel, ActionSceneEnum, api, tExpr });
    registerAiFunction({ flowEngine: fe, RecordActionModel, FormActionModel, ActionSceneEnum, api, tExpr });
    // Classic Formily forms (the OLD, pre-flow-engine form blocks) — separate mechanism, see
    // aiColumnClassic.tsx / aiExtractClassic.tsx / aiMediaClassic.tsx. Order doesn't matter between
    // these (each keeps its own module-level apiClient var), but all must run — the flow-engine
    // registrations above only cover flow-engine blocks, not this classic Formily system.
    registerAiColumnClassic((this as any).app);
    registerAiExtractClassic((this as any).app);
    registerAiMediaClassic((this as any).app);

    // Settings page (ElevenLabs / Vbee voice credentials) — classic /admin uses useAPIClient.
    // The v1 PluginSettingsManager only has add(name, opts); addMenuItem/addPageTabItem are client-v2
    // only, so calling them here would throw and silently drop the page (that was the bug).
    try {
      const AiProviderManager = createAiProviderManager({ useApiClient: useAPIClient });
      (this as any).app.pluginSettingsManager.add('ptdl-ai-provider', {
        title: t('Nhà cung cấp AI'),
        icon: 'ApiOutlined',
        Component: AiProviderManager,
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[ai-column] AI provider settings page (classic) registration failed', e);
    }
    // eslint-disable-next-line no-console
    console.log('[ai-column] client (classic lane) loaded — AI input + textarea + extract + image + voice + bulk (generate/extract/image/voice) (flow-engine blocks + classic Formily forms)');
  }
}

export default PluginAiColumnClient;
