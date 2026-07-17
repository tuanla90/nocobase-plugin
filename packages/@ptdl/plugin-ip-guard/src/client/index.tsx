import React from 'react';
import { Plugin, useAPIClient } from '@nocobase/client';
import { setSharedT, SHARED_NS, sharedEnUS } from '@ptdl/shared';
import { IpGuardPane } from '../shared/IpGuardPane';
import { setI18n, t, NS } from '../shared/ipGuardClient';
import enUS from '../locale/en-US.json';
import viVN from '../locale/vi-VN.json';

// Classic lane (`/`, `/admin`): the settings page.
const IpGuardSettings: React.FC = () => {
  const api: any = useAPIClient();
  return <IpGuardPane api={api} />;
};

export class PluginIpGuardClient extends Plugin {
  async load() {
    setI18n((this.app as any).i18n);
    try {
      this.app.i18n.addResources('en-US', NS, enUS as any);
      this.app.i18n.addResources('vi-VN', NS, viVN as any);
      // @ptdl/shared's own render strings bilingual for this lane (per build-guide R1/R2).
      this.app.i18n.addResources('en-US', SHARED_NS, sharedEnUS as any);
      setSharedT((s, o) => this.app.i18n.t(s, { ns: SHARED_NS, ...(o || {}) }));
    } catch (e) {
      // ignore i18n load errors
    }

    this.app.pluginSettingsManager.add('ptdl-ip-guard', {
      title: t('IP Guard'),
      icon: 'LockOutlined',
      Component: IpGuardSettings,
    });
  }
}

export default PluginIpGuardClient;
