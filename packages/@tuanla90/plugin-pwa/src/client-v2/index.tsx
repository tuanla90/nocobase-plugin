import { Plugin, useApp } from '@nocobase/client-v2';
import { createPwaSettings, startPwa } from '../shared/pwa';
import { NS, setRuntimeT, t } from '../shared/i18n';
import enUS from '../locale/en-US.json';
import viVN from '../locale/vi-VN.json';

// Modern lane (`/v/`). @nocobase/client-v2 has no useAPIClient — use useApp().apiClient. Without
// this lane (and a root `client-v2.js` marker) the modern client skips the plugin, so the PWA
// manifest is never injected and the PWA settings page never appears on /v/.
const useApiClientV2 = () => (useApp() as any).apiClient;

export class PluginPwaClientV2 extends Plugin {
  async load() {
    // i18n first — register EN identity + VI resources and the runtime translator before any t() use.
    try {
      this.app.i18n.addResources('en-US', NS, enUS as any);
      this.app.i18n.addResources('vi-VN', NS, viVN as any);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[pwa] i18n addResources failed', e);
    }
    setRuntimeT((s, o) => this.app.i18n.t(s, { ns: NS, ...(o || {}) }));

    startPwa((this as any).app);
    try {
      const psm: any = (this as any).pluginSettingsManager;
      const Pane = createPwaSettings({ useApiClient: useApiClientV2 });
      psm.addMenuItem({ key: 'pwa', title: t('PWA'), icon: 'MobileOutlined' });
      psm.addPageTabItem({ menuKey: 'pwa', key: 'index', Component: Pane });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[pwa] client-v2 settings registration failed', e);
    }
  }
}

export default PluginPwaClientV2;
