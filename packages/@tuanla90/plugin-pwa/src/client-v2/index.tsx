import { Icon, Plugin, icons, useApp } from '@nocobase/client-v2';
import { setIconRegistry } from '@tuanla90/shared';
import { createPwaSettings, startPwa } from '../shared/pwa';
import { createMobileShell } from '../shared/mobileShell';
import { initInstallCapture } from '../shared/installPrompt';
import { NS, setRuntimeT, t } from '../shared/i18n';
import enUS from '../locale/en-US.json';
import viVN from '../locale/vi-VN.json';

// Modern lane (`/v/`). @nocobase/client-v2 has no useAPIClient — use useApp().apiClient. Without
// this lane (and a root `client-v2.js` marker) the modern client skips the plugin, so the PWA
// manifest is never injected, the mobile shell (bottom bar + install prompt) never mounts, and the
// PWA settings page never appears on /v/.
const useApiClientV2 = () => (useApp() as any).apiClient;
// Framework navigate — RouterManager.navigate; react-router re-adds the `/v` basename to `/admin/…`.
const useNavigateV2 = () => {
  const app: any = useApp();
  return (path: string) => app?.router?.navigate?.(path);
};

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

    // Feed the @tuanla90/shared icon registry so the bottom bar / icon picker resolve route icons.
    try {
      setIconRegistry(Icon, icons);
    } catch (e) {
      // ignore
    }

    startPwa((this as any).app);
    initInstallCapture();

    // App-wide mobile shell: portals the bottom bar + install suggestion onto document.body.
    try {
      const Shell = createMobileShell({ useApiClient: useApiClientV2, useNavigate: useNavigateV2 });
      (this as any).app.addProvider(Shell);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[pwa] client-v2 mobile shell registration failed', e);
    }

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
