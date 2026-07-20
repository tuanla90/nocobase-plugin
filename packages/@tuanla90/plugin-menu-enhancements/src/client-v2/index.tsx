import { Plugin } from '@nocobase/client-v2';
import { registerMenuSections } from '../shared/menuSections';
import { registerMenuBadge } from '../shared/menuBadge';
import { setSharedT, SHARED_NS, sharedEnUS } from '@tuanla90/shared';
import viVN from '../locale/vi-VN.json';
import enUS from '../locale/en-US.json';

const I18N_NS = '@tuanla90/plugin-menu-enhancements/client';

// Merged sidebar-menu enhancements (was plugin-menu-sections + plugin-menu-badge): a menu item can
// become a group title / divider, and can show a live count badge. Both are client-only and store
// config on the route `options` (ptdlMenuKind / ptdlBadge) — no schema, so existing configs survive.
export class PluginMenuEnhancementsClientV2 extends Plugin {
  async load() {
    const flowEngine = (this as any).flowEngine;
    const app: any = (this as any).app;
    app?.i18n?.addResources?.('vi-VN', I18N_NS, viVN);
    app?.i18n?.addResources?.('en-US', I18N_NS, enUS);
    // @tuanla90/shared's condition-kit strings (ConditionRow operators/date presets/value inputs) — bilingual.
    app?.i18n?.addResources?.('en-US', SHARED_NS, sharedEnUS);
    if (app?.i18n?.t) setSharedT((s, o) => app.i18n.t(s, { ns: SHARED_NS, ...(o || {}) }));
    registerMenuSections({ flowEngine, i18n: app?.i18n });
    registerMenuBadge({ flowEngine, apiClient: app?.apiClient, app, i18n: app?.i18n });
  }
}

export default PluginMenuEnhancementsClientV2;
