import '@formily/react';
import { ActionModel, Plugin, useApp } from '@nocobase/client-v2';
import { defineGenerateLinesActionModel } from '../shared/generateLinesAction';
import { createRulesManager } from '../shared/RulesManager';
import { NS, setRuntimeT, t } from '../shared/i18n';
import { setSharedT, SHARED_NS, sharedEnUS } from '@ptdl/shared';
import enUS from '../locale/en-US.json';

const useApiClientV2 = () => (useApp() as any).apiClient;

// Modern lane (/v/). Registers the "Sinh dòng" record action model on the flow engine.
export class PluginLineGeneratorClientV2 extends Plugin {
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

    const engine: any = (this as any).flowEngine || (this.app as any).flowEngine;
    const GenerateLinesActionModel = defineGenerateLinesActionModel(ActionModel);
    engine.registerModels({ GenerateLinesActionModel });

    // Settings page: manage generators (client-v2 pattern).
    const RulesManager = createRulesManager({ useApiClient: useApiClientV2 });
    this.app.pluginSettingsManager.addMenuItem({ key: 'line-generator', title: t('Bộ sinh dòng'), icon: 'lucide-list-plus' });
    this.app.pluginSettingsManager.addPageTabItem({ menuKey: 'line-generator', key: 'index', title: t('Danh sách bộ sinh'), Component: RulesManager });

    // eslint-disable-next-line no-console
    console.log('[line-generator] client-v2 lane loaded');
  }
}

export default PluginLineGeneratorClientV2;
