import { Plugin } from '@nocobase/client';
import { registerMenuSections } from '../shared/menuSections';
import { registerMenuBadge } from '../shared/menuBadge';
import { setSharedT, SHARED_NS, sharedEnUS } from '@ptdl/shared';
import viVN from '../locale/vi-VN.json';
import enUS from '../locale/en-US.json';

const I18N_NS = '@ptdl/plugin-menu-enhancements/client';

// Classic lane (/admin). Same two features on the shared FlowEngine menu model.
export class PluginMenuEnhancementsClient extends Plugin {
  async load() {
    const flowEngine = (this as any).flowEngine;
    const app: any = (this as any).app;
    app?.i18n?.addResources?.('vi-VN', I18N_NS, viVN);
    app?.i18n?.addResources?.('en-US', I18N_NS, enUS);
    // @ptdl/shared's condition-kit strings (ConditionRow operators/date presets/value inputs) — bilingual.
    app?.i18n?.addResources?.('en-US', SHARED_NS, sharedEnUS);
    if (app?.i18n?.t) setSharedT((s, o) => app.i18n.t(s, { ns: SHARED_NS, ...(o || {}) }));
    registerMenuSections({ flowEngine, i18n: app?.i18n });
    registerMenuBadge({ flowEngine, apiClient: app?.apiClient, app, i18n: app?.i18n });
  }
}

export default PluginMenuEnhancementsClient;
