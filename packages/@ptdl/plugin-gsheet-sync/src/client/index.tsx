import { Plugin, useAPIClient } from '@nocobase/client';
import { createConnectionManager, bootstrapOpenCollectionFields } from '../shared/ConnectionManager';
import { NS, setRuntimeT } from '../shared/i18n';
import enUS from '../locale/en-US.json';

// Classic lane (/admin).
export class PluginGsheetSyncClient extends Plugin {
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

    const ConnectionManager = createConnectionManager({ useApiClient: useAPIClient });
    this.app.pluginSettingsManager.add('gsheet-sync', {
      title: 'Google Sheets Sync',
      icon: 'CloudSyncOutlined',
      Component: ConnectionManager,
    });
    // If we hard-navigated here from /v/ to open a collection's field-config,
    // consume the stashed flag now that the classic data-source manager is available.
    try {
      bootstrapOpenCollectionFields();
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line no-console
    console.log('[gsheet-sync] client (classic lane) loaded');
  }
}

export default PluginGsheetSyncClient;
