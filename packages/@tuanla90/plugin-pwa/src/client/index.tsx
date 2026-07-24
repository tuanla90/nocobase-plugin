import { Icon, Plugin, icons, useAPIClient } from '@nocobase/client';
import { setIconRegistry } from '@tuanla90/shared';
import { createPwaSettings, startPwa } from '../shared/pwa';
import { createMobileShell } from '../shared/mobileShell';
import { initInstallCapture } from '../shared/installPrompt';
import { NS, setRuntimeT, t } from '../shared/i18n';
import enUS from '../locale/en-US.json';
import viVN from '../locale/vi-VN.json';

// Classic lane (`/`, `/admin`). Navigation falls back to the history push/pop shim (mobileShell) —
// no framework navigate is injected here.
export class PluginPwaClient extends Plugin {
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

    try {
      setIconRegistry(Icon, icons);
    } catch (e) {
      // ignore
    }

    this.pluginSettingsManager.add('pwa', {
      icon: 'MobileOutlined',
      title: t('PWA'),
      Component: createPwaSettings({ useApiClient: useAPIClient }),
      aclSnippet: 'pm.pwa.configuration',
    });

    startPwa(this.app);
    initInstallCapture();

    try {
      const Shell = createMobileShell({ useApiClient: useAPIClient });
      (this.app as any).addProvider(Shell);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[pwa] client mobile shell registration failed', e);
    }
  }
}

export default PluginPwaClient;
