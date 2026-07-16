import '@formily/react';
import { Plugin, useAPIClient } from '@nocobase/client';
import { defineGenerateLinesActionModel } from '../shared/generateLinesAction';
import { createRulesManager } from '../shared/RulesManager';
import { NS, setRuntimeT, t } from '../shared/i18n';
import { setSharedT, SHARED_NS, sharedEnUS } from '@ptdl/shared';
import enUS from '../locale/en-US.json';

// Classic lane (/admin). Core models may register lazily → resolve ActionModel with a retry loop.
export class PluginLineGeneratorClient extends Plugin {
  async load() {
    try {
      this.app.i18n.addResources('en-US', NS, enUS);
      // @ptdl/shared's own render strings (relation picker button, …) — bilingual per lane.
      this.app.i18n.addResources('en-US', SHARED_NS, sharedEnUS);
      const _id = (m: any) => Object.fromEntries(Object.keys(m || {}).map((k) => [k, k]));
      this.app.i18n.addResources('vi-VN', NS, _id(enUS));
      this.app.i18n.addResources('vi-VN', SHARED_NS, _id(sharedEnUS));
      const _i: any = this.app.i18n;
      _i.options.fallbackLng = 'en-US';
      if (_i.services?.languageUtils?.options) _i.services.languageUtils.options.fallbackLng = 'en-US';
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[line-generator] i18n addResources failed', e);
    }
    setRuntimeT((s, o) => this.app.i18n.t(s, { ns: NS, ...(o || {}) }));
    setSharedT((s, o) => this.app.i18n.t(s, { ns: SHARED_NS, ...(o || {}) }));

    const fe: any = (this as any).flowEngine;
    const bind = (attempt = 0) => {
      const ActionBase = fe?.getModelClass?.('ActionModel');
      if (!ActionBase) {
        if (attempt < 10) setTimeout(() => bind(attempt + 1), 1000);
        return;
      }
      const GenerateLinesActionModel = defineGenerateLinesActionModel(ActionBase);
      fe.registerModels({ GenerateLinesActionModel });
      // eslint-disable-next-line no-console
      console.log('[line-generator] classic lane action registered');
    };
    bind();

    // Settings page: manage generators (classic /admin pattern — parent page + child tab).
    const RulesManager = createRulesManager({ useApiClient: useAPIClient });
    this.app.pluginSettingsManager.add('line-generator', { title: t('Bộ sinh dòng'), icon: 'lucide-list-plus' });
    this.app.pluginSettingsManager.add('line-generator.index', { title: t('Danh sách bộ sinh'), Component: RulesManager });

    // eslint-disable-next-line no-console
    console.log('[line-generator] client (classic lane) loaded');
  }
}

export default PluginLineGeneratorClient;
