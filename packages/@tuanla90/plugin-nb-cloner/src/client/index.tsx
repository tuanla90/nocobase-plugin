import React from 'react';
// Externalise @formily/react (host-provided): shared's settingsKit imports it; the build derives externals
// from this plugin's client imports. Without this line rspack tries to bundle the empty stub and fails.
import '@formily/react';
import { Plugin, useAPIClient } from '@nocobase/client';
import { setSharedT, SHARED_NS, sharedEnUS } from '@tuanla90/shared';
import { NbClonerPane } from '../shared/NbClonerPane';
import { setI18n, t, NS } from '../shared/nbClonerClient';
import enUS from '../locale/en-US.json';
import viVN from '../locale/vi-VN.json';

// Classic lane (`/`, `/admin`): the settings page.
const NbClonerSettings: React.FC = () => {
  const api: any = useAPIClient();
  return <NbClonerPane api={api} />;
};

export class PluginNbClonerClient extends Plugin {
  async load() {
    setI18n((this.app as any).i18n);
    try {
      this.app.i18n.addResources('en-US', NS, enUS as any);
      this.app.i18n.addResources('vi-VN', NS, viVN as any);
      // @tuanla90/shared's own render strings bilingual for this lane (per build-guide R1/R2).
      this.app.i18n.addResources('en-US', SHARED_NS, sharedEnUS as any);
      setSharedT((s, o) => this.app.i18n.t(s, { ns: SHARED_NS, ...(o || {}) }));
    } catch (e) {
      // ignore i18n load errors
    }

    this.app.pluginSettingsManager.add('ptdl-nb-cloner', {
      title: t('NB Cloner'),
      icon: 'CopyOutlined',
      Component: NbClonerSettings,
    });
  }
}

export default PluginNbClonerClient;
