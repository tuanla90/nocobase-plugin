import React from 'react';
import { Plugin, useAPIClient } from '@nocobase/client';
import { setSharedT, SHARED_NS, sharedEnUS } from '@ptdl/shared';
import { PluginHubPane } from '../shared/PluginHubPane';
import { setI18n, t, NS } from '../shared/pluginHubClient';
import enUS from '../locale/en-US.json';
import viVN from '../locale/vi-VN.json';

// Classic lane (`/`, `/admin`): the settings page.
const PluginHubSettings: React.FC = () => {
  const api: any = useAPIClient();
  return <PluginHubPane api={api} />;
};

export class PluginPluginHubClient extends Plugin {
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

    this.app.pluginSettingsManager.add('ptdl-plugin-hub', {
      title: t('Plugin Hub'),
      icon: 'AppstoreAddOutlined',
      Component: PluginHubSettings,
    });
  }
}

export default PluginPluginHubClient;
