import { Plugin, useAPIClient } from '@nocobase/client';
import { createGlobalSearch } from '../shared/globalSearch';
import { createGlobalSearchSettings } from '../shared/Settings';
import { setSharedT, SHARED_NS, sharedEnUS } from '@tuanla90/shared';
import enUS from '../locale/en-US.json';
import viVN from '../locale/vi-VN.json';

// i18n namespace for this plugin's client strings. English text is the key; en-US.json is an
// identity map and vi-VN.json supplies the Vietnamese (a missing key falls back to the English key).
const NS = '@tuanla90/plugin-global-search/client';

// Classic lane (`/`, `/admin`). This is the @nocobase/client app; useAPIClient is its API-client hook.
export class PluginGlobalSearchClient extends Plugin {
  async load() {
    try {
      this.app.i18n.addResources('en-US', NS, enUS);
      this.app.i18n.addResources('vi-VN', NS, viVN);
      // @tuanla90/shared's own render strings (field-picker button, empty state) — bilingual per lane.
      this.app.i18n.addResources('en-US', SHARED_NS, sharedEnUS);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[global-search] i18n addResources failed', e);
    }
    // Runtime translator handed to the shared UI; resolves against this plugin's namespace and
    // forwards any i18next interpolation values (e.g. { shortcut }).
    const t = (s: string, opts?: Record<string, any>) => this.app.i18n.t(s, { ns: NS, ...(opts || {}) });
    // Translator for @tuanla90/shared's own labels (separate NS from this plugin's).
    setSharedT((s, o) => this.app.i18n.t(s, { ns: SHARED_NS, ...(o || {}) }));

    const { GlobalSearchProvider } = createGlobalSearch({ useApiClient: useAPIClient, t });
    this.app.addProvider(GlobalSearchProvider);

    // Admin settings screen: map collections → view pages, and edit search targets.
    const GlobalSearchSettings = createGlobalSearchSettings({ useApiClient: useAPIClient, t });
    this.app.pluginSettingsManager.add('global-search', {
      title: t('Global Search'),
      icon: 'SearchOutlined',
      Component: GlobalSearchSettings,
    });
  }
}

export default PluginGlobalSearchClient;
