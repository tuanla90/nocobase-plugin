import React from 'react';
// Externalise @formily/react (host-provided): shared's settingsKit imports it; the build derives externals
// from this plugin's client imports, so without this line rspack tries to bundle it and fails to resolve.
import '@formily/react';
import { Plugin, useApp } from '@nocobase/client-v2';
import { setSharedT, SHARED_NS, sharedEnUS } from '@tuanla90/shared';
import { PluginHubPane } from '../shared/PluginHubPane';
import { setI18n, t, NS } from '../shared/pluginHubClient';
import enUS from '../locale/en-US.json';
import viVN from '../locale/vi-VN.json';

// Modern lane (`/v/`): the same settings pane, registered via addMenuItem + addPageTabItem.
const PluginHubSettings: React.FC = () => {
  const app: any = useApp();
  return <PluginHubPane api={app?.apiClient} />;
};

export class PluginPluginHubClientV2 extends Plugin {
  async load() {
    setI18n((this.app as any).i18n);
    try {
      this.app.i18n.addResources('en-US', NS, enUS as any);
      this.app.i18n.addResources('vi-VN', NS, viVN as any);
      this.app.i18n.addResources('en-US', SHARED_NS, sharedEnUS as any);
      setSharedT((s, o) => this.app.i18n.t(s, { ns: SHARED_NS, ...(o || {}) }));
    } catch (e) {
      // ignore i18n load errors
    }

    const psm: any = this.app.pluginSettingsManager;
    psm?.addMenuItem?.({ key: 'ptdl-plugin-hub', title: t('Plugin Hub'), icon: 'AppstoreAddOutlined' });
    psm?.addPageTabItem?.({ menuKey: 'ptdl-plugin-hub', key: 'index', Component: PluginHubSettings });
  }
}

export default PluginPluginHubClientV2;
