import React from 'react';
import { Plugin, useApp } from '@nocobase/client-v2';
import { setSharedT, SHARED_NS, sharedEnUS } from '@ptdl/shared';
import { NbClonerPane } from '../shared/NbClonerPane';
import { setI18n, t, NS } from '../shared/nbClonerClient';
import enUS from '../locale/en-US.json';
import viVN from '../locale/vi-VN.json';

// Modern lane (`/v/`): the same pane, registered via addMenuItem + addPageTabItem.
const NbClonerSettings: React.FC = () => {
  const app: any = useApp();
  return <NbClonerPane api={app?.apiClient} />;
};

export class PluginNbClonerClientV2 extends Plugin {
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
    psm?.addMenuItem?.({ key: 'ptdl-nb-cloner', title: t('NB Cloner'), icon: 'CopyOutlined' });
    psm?.addPageTabItem?.({ menuKey: 'ptdl-nb-cloner', key: 'index', Component: NbClonerSettings });
  }
}

export default PluginNbClonerClientV2;
