import { Plugin, useAPIClient } from '@nocobase/client';
import { createPwaSettings, startPwa } from '../shared/pwa';
import { NS, setRuntimeT, t } from '../shared/i18n';
import enUS from '../locale/en-US.json';
import viVN from '../locale/vi-VN.json';

// Classic lane (`/`, `/admin`).
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

    this.pluginSettingsManager.add('pwa', {
      icon: 'MobileOutlined',
      title: t('PWA'),
      Component: createPwaSettings({ useApiClient: useAPIClient }),
      aclSnippet: 'pm.pwa.configuration',
    });
    startPwa(this.app);
  }
}

export default PluginPwaClient;
