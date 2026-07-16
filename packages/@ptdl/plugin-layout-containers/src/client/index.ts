/**
 * Tabs block — classic (v1) lane. Registration logic lives in ../shared/registerBlockTabs
 * and is shared with the modern (/v/) lane in ../client-v2. `Icon` is injected here so the
 * shared file never imports @nocobase/client directly (the /v/ app does not provide it).
 */
import { Plugin, Icon, ChildPageModel } from '@nocobase/client';
import { registerBlockTabs, loadGlobalTabStyleCache } from '../shared/registerBlockTabs';
import { registerFormTabs, registerFormCollapse } from '../shared/registerFormTabs';
import viVN from '../locale/vi-VN.json';

export class PluginBlockTabsClient extends Plugin {
  async load() {
    try {
      this.app.i18n.addResources('vi-VN', 'plugin-block-tabs', viVN);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[layout-containers] i18n addResources failed', e);
    }
    const fe: any = this.flowEngine || (this.app && (this.app as any).flowEngine);
    // Load the app-wide (server-stored) global default before pages render.
    await loadGlobalTabStyleCache((this as any).app?.apiClient);
    // Classic client doesn't export the base PageModel; pass ChildPageModel — its prototype
    // chain includes PageModel, which resolvePageModelClass walks up to.
    await registerBlockTabs(fe, { Icon, PageModel: ChildPageModel });
    await registerFormTabs(fe, { Icon });
    await registerFormCollapse(fe, { Icon });
  }
}

export default PluginBlockTabsClient;
