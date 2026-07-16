// @ptdl/shared's index (via FieldPickerCascader/ColorField) imports @formily/react;
// a direct entry import makes the bundler externalize it (NocoBase provides it at
// runtime) instead of trying to bundle it. Same pattern as the Formily-based plugins.
import '@formily/react';
import { Plugin, useApp } from '@nocobase/client-v2';
import { createConnectionManager } from '../shared/ConnectionManager';
import { NS, setRuntimeT, t } from '../shared/i18n';
import enUS from '../locale/en-US.json';

// Modern lane (/v/). @nocobase/client-v2 has no useAPIClient — the app's client
// lives on useApp().apiClient.
const useApiClientV2 = () => (useApp() as any).apiClient;

export class PluginGsheetSyncClientV2 extends Plugin {
  async load() {
    // i18n (Scheme A — Vietnamese source): register English against this plugin's NS and inject the
    // runtime translator BEFORE any t() use. Vietnamese = the key, so no vi-VN file is needed.
    try {
      this.app.i18n.addResources('en-US', NS, enUS);
      // Unsupported UI languages → English: en-US fallback + a VN-key identity map for vi so it keeps VN.
      this.app.i18n.addResources('vi-VN', NS, Object.fromEntries(Object.keys(enUS).map((k) => [k, k])));
      const _i: any = this.app.i18n;
      _i.options.fallbackLng = 'en-US';
      if (_i.services?.languageUtils?.options) _i.services.languageUtils.options.fallbackLng = 'en-US';
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[gsheet-sync] i18n addResources failed', e);
    }
    setRuntimeT((s, o) => this.app.i18n.t(s, { ns: NS, ...(o || {}) }));

    const ConnectionManager = createConnectionManager({ useApiClient: useApiClientV2 });
    this.app.pluginSettingsManager.addMenuItem({
      key: 'gsheet-sync',
      title: 'Google Sheets Sync',
      icon: 'CloudSyncOutlined',
    });
    this.app.pluginSettingsManager.addPageTabItem({
      menuKey: 'gsheet-sync',
      key: 'index',
      title: t('Kết nối'),
      Component: ConnectionManager,
    });
    // eslint-disable-next-line no-console
    console.log('[gsheet-sync] client-v2 lane loaded');
  }
}

export default PluginGsheetSyncClientV2;
