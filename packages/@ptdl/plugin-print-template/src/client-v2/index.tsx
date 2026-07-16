// @ptdl/shared's index (via FieldPickerCascader → ColorField) imports @formily/react;
// a direct entry import makes the bundler externalize it (NocoBase provides it at
// runtime) instead of trying to bundle it. Same pattern as the Formily-based plugins.
import '@formily/react';
import { ActionModel, Icon, Plugin, icons, useApp } from '@nocobase/client-v2';
import { setIconRegistry } from '../shared/iconRegistry';
import { createTemplateManager } from '../shared/TemplateManager';
import { definePrintTemplateActionModel } from '../shared/printTemplateAction';
import { definePrintPreviewBlockModel } from '../shared/printPreviewBlock';
import { defineSaveToFieldActionModel } from '../shared/saveToFieldAction';
import { defineBatchPrintActionModel } from '../shared/batchPrintAction';
import { createPdfServiceSettings } from '../shared/PdfServiceSettings';
import { NS, setRuntimeT, t } from '../shared/i18n';
import { setSharedT, SHARED_NS, sharedEnUS } from '@ptdl/shared';
import enUS from '../locale/en-US.json';

// Modern lane (/v/). @nocobase/client-v2 has no useAPIClient — the app's client
// lives on useApp().apiClient.
const useApiClientV2 = () => (useApp() as any).apiClient;

export class PluginPrintTemplateClientV2 extends Plugin {
  async load() {
    // i18n: register the English translations for this plugin's namespace (Vietnamese IS the key,
    // so vi-VN falls back to the key text — see src/shared/i18n.ts). Wire the runtime translator
    // that every shared React module reads. Do this before anything renders a label.
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
      console.warn('[print-template] i18n addResources failed', e);
    }
    setRuntimeT((s, o) => this.app.i18n.t(s, { ns: NS, ...(o || {}) }));
    setSharedT((s, o) => this.app.i18n.t(s, { ns: SHARED_NS, ...(o || {}) }));

    setIconRegistry({ Icon, icons });

    // Record actions ("Configure actions" in table rows / details) + preview block.
    const engine: any = (this as any).flowEngine || (this.app as any).flowEngine;
    const PrintTemplateActionModel = definePrintTemplateActionModel(ActionModel);
    const SavePdfToFieldActionModel = defineSaveToFieldActionModel(ActionModel);
    const BatchPrintActionModel = defineBatchPrintActionModel(ActionModel);
    engine.registerModels({ PrintTemplateActionModel, SavePdfToFieldActionModel, BatchPrintActionModel });
    const BlockBase = engine.getModelClass?.('BlockModel');
    if (BlockBase) {
      const PrintPreviewBlockModel = definePrintPreviewBlockModel(BlockBase);
      engine.registerModels({ PrintPreviewBlockModel });
    }

    // Settings screen: menu item + page tab (client-v2 pattern).
    const TemplateManager = createTemplateManager({ useApiClient: useApiClientV2 });
    this.app.pluginSettingsManager.addMenuItem({
      key: 'print-template',
      title: t('Mẫu in ấn'),
      icon: 'lucide-printer',
    });
    this.app.pluginSettingsManager.addPageTabItem({
      menuKey: 'print-template',
      key: 'index',
      title: t('Danh sách mẫu'),
      Component: TemplateManager,
    });
    const PdfServiceSettings = createPdfServiceSettings({ useApiClient: useApiClientV2 });
    this.app.pluginSettingsManager.addPageTabItem({
      menuKey: 'print-template',
      key: 'pdf-service',
      title: t('Dịch vụ PDF'),
      Component: PdfServiceSettings,
    });

    // eslint-disable-next-line no-console
    console.log('[print-template] client-v2 lane loaded');
  }
}

export default PluginPrintTemplateClientV2;
