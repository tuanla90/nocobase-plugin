import React from 'react';
import { Plugin, useApp } from '@nocobase/client-v2';
import { setSharedT, SHARED_NS, sharedEnUS } from '@tuanla90/shared';
import { IpGuardPane } from '../shared/IpGuardPane';
import { setI18n, t, NS } from '../shared/ipGuardClient';
import enUS from '../locale/en-US.json';
import viVN from '../locale/vi-VN.json';

// Modern lane (`/v/`): the same settings pane, registered via addMenuItem + addPageTabItem.
const IpGuardSettings: React.FC = () => {
  const app: any = useApp();
  return <IpGuardPane api={app?.apiClient} />;
};

export class PluginIpGuardClientV2 extends Plugin {
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
    psm?.addMenuItem?.({ key: 'ptdl-ip-guard', title: t('IP Guard'), icon: 'LockOutlined' });
    psm?.addPageTabItem?.({ menuKey: 'ptdl-ip-guard', key: 'index', Component: IpGuardSettings });
  }
}

export default PluginIpGuardClientV2;
