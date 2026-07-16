// See client-v2 note: entry import so @formily/react (pulled by @ptdl/shared index) is
// externalized rather than bundled.
import '@formily/react';
import { Icon, Plugin, icons, useAPIClient } from '@nocobase/client';
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

// Classic lane (/admin). Flow-engine blocks also run here; core models may register
// lazily, so resolve ActionModel with a short retry loop before subclass + register.
export class PluginPrintTemplateClient extends Plugin {
  async load() {
    // i18n: register the English translations for this plugin's namespace (Vietnamese IS the key,
    // so vi-VN falls back to the key text). Wire the runtime translator every shared module reads.
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

    const TemplateManager = createTemplateManager({ useApiClient: useAPIClient });
    const PdfServiceSettings = createPdfServiceSettings({ useApiClient: useAPIClient });
    // Classic settings tabs: a parent page + child pages registered as `parent.<key>`
    // become a tab bar (same as other @ptdl plugins split their settings).
    this.app.pluginSettingsManager.add('print-template', {
      title: t('Mẫu in ấn'),
      icon: 'lucide-printer',
    });
    this.app.pluginSettingsManager.add('print-template.templates', {
      title: t('Danh sách mẫu'),
      Component: TemplateManager,
    });
    this.app.pluginSettingsManager.add('print-template.pdf-service', {
      title: t('Dịch vụ PDF'),
      Component: PdfServiceSettings,
    });

    const fe: any = (this as any).flowEngine;
    const bind = (attempt = 0) => {
      const ActionBase = fe?.getModelClass?.('ActionModel');
      const BlockBase = fe?.getModelClass?.('BlockModel');
      if (!ActionBase || !BlockBase) {
        if (attempt < 10) setTimeout(() => bind(attempt + 1), 1000);
        return;
      }
      const PrintTemplateActionModel = definePrintTemplateActionModel(ActionBase);
      const SavePdfToFieldActionModel = defineSaveToFieldActionModel(ActionBase);
      const BatchPrintActionModel = defineBatchPrintActionModel(ActionBase);
      const PrintPreviewBlockModel = definePrintPreviewBlockModel(BlockBase);
      fe.registerModels({ PrintTemplateActionModel, SavePdfToFieldActionModel, BatchPrintActionModel, PrintPreviewBlockModel });
      // eslint-disable-next-line no-console
      console.log('[print-template] classic lane actions + block registered');
    };
    bind();

    // eslint-disable-next-line no-console
    console.log('[print-template] client (classic lane) loaded');
  }
}

export default PluginPrintTemplateClient;
