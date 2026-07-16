import { Plugin, useApp } from '@nocobase/client-v2';
import { createGlobalSearch } from '../shared/globalSearch';
import { createGlobalSearchSettings } from '../shared/Settings';
import { setSharedT, SHARED_NS, sharedEnUS } from '@ptdl/shared';
import enUS from '../locale/en-US.json';
import viVN from '../locale/vi-VN.json';

// i18n namespace for this plugin's client strings. English text is the key; en-US.json is an
// identity map and vi-VN.json supplies the Vietnamese (a missing key falls back to the English key).
const NS = '@ptdl/plugin-global-search/client';

// Modern lane (`/v/`). @nocobase/client-v2 has no useAPIClient — the app's client is on
// useApp().apiClient. Without this lane (and a root `client-v2.js` marker) the modern client's
// pm:listEnabledV2 skips the plugin entirely, so nothing renders on /v/.
const useApiClientV2 = () => (useApp() as any).apiClient;

export class PluginGlobalSearchClientV2 extends Plugin {
  async load() {
    try {
      this.app.i18n.addResources('en-US', NS, enUS);
      this.app.i18n.addResources('vi-VN', NS, viVN);
      // @ptdl/shared's own render strings (field-picker button, empty state) — bilingual per lane.
      this.app.i18n.addResources('en-US', SHARED_NS, sharedEnUS);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[global-search] i18n addResources failed', e);
    }
    // Runtime translator handed to the shared UI; resolves against this plugin's namespace and
    // forwards any i18next interpolation values (e.g. { shortcut }).
    const t = (s: string, opts?: Record<string, any>) => this.app.i18n.t(s, { ns: NS, ...(opts || {}) });
    // Translator for @ptdl/shared's own labels (separate NS from this plugin's).
    setSharedT((s, o) => this.app.i18n.t(s, { ns: SHARED_NS, ...(o || {}) }));

    const { GlobalSearchProvider } = createGlobalSearch({ useApiClient: useApiClientV2, t });
    this.app.addProvider(GlobalSearchProvider);

    // Settings screen. client-v2 replaces v1's pluginSettingsManager.add(name, opts) with the
    // menu-item + page-tab pair.
    const GlobalSearchSettings = createGlobalSearchSettings({ useApiClient: useApiClientV2, t });
    this.app.pluginSettingsManager.addMenuItem({ key: 'global-search', title: t('Global Search'), icon: 'SearchOutlined' });
    this.app.pluginSettingsManager.addPageTabItem({ menuKey: 'global-search', key: 'index', Component: GlobalSearchSettings });
  }
}

export default PluginGlobalSearchClientV2;
