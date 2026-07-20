/**
 * Tabs block — modern (/v/) FlowEngine lane. Same registration as the classic lane
 * (../client); the base Plugin + Icon come from @nocobase/client-v2 so this bundle never
 * depends on @nocobase/client (which the /v/ app does not provide → would throw a
 * RequireJS "Script error for @nocobase/client").
 */
import { Plugin, Icon, PageModel } from '@nocobase/client-v2';
import { registerBlockTabs, loadGlobalTabStyleCache } from '../shared/registerBlockTabs';
import { registerFormTabs, registerFormCollapse } from '../shared/registerFormTabs';
import viVN from '../locale/vi-VN.json';

export class PluginBlockTabsClientV2 extends Plugin {
  async load() {
    try {
      this.app.i18n.addResources('vi-VN', 'plugin-block-tabs', viVN);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[layout-containers] i18n addResources failed', e);
    }
    const fe: any = this.flowEngine || (this.app && (this.app as any).flowEngine);
    // Load the app-wide (server-stored) global default before pages render so the shared style
    // applies on first paint.
    await loadGlobalTabStyleCache((this as any).app?.apiClient);
    // PageModel imported directly so page-tab styling patches the exact class RootPageModel/
    // ChildPageModel extend (getModelClass alone was unreliable on this lane).
    await registerBlockTabs(fe, { Icon, PageModel });
    await registerFormTabs(fe, { Icon });
    await registerFormCollapse(fe, { Icon });
  }
}

export default PluginBlockTabsClientV2;
