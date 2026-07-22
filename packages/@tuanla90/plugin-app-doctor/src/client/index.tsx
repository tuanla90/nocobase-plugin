import React from 'react';
import { Plugin, useAPIClient } from '@nocobase/client';
import { DoctorPane } from '../shared/DoctorPane';
import enUS from '../locale/en-US.json';

const NS = 'ptdl-app-doctor';

// Classic lane (/admin). Must exist (a dist/client/index.js) or RequireJS white-screens a /v/-only plugin.
// It also exposes the same App Doctor page under classic Settings (the server actions work from either lane).
let _adApp: any = null;
const SettingsPage: React.FC = () => {
  const api: any = useAPIClient();
  return <DoctorPane api={api} t={(s: string) => (_adApp?.i18n?.t?.(s, { ns: NS }) ?? s)} />;
};

export class PluginAppDoctorClient extends Plugin {
  async load() {
    _adApp = this.app;
    try {
      this.app.i18n.addResources('en-US', NS, enUS);
      const _id = (m: any) => Object.fromEntries(Object.keys(m || {}).map((k) => [k, k]));
      this.app.i18n.addResources('vi-VN', NS, _id(enUS));
      const _i: any = this.app.i18n;
      _i.options.fallbackLng = _i.options.fallbackLng || 'en-US';
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[app-doctor] i18n addResources failed', e);
    }

    try {
      const st = (s: string) => this.app.i18n.t(s, { ns: NS });
      this.app.pluginSettingsManager.add('ptdl-app-doctor', {
        title: st('App Doctor'),
        icon: 'MedicineBoxOutlined',
        Component: SettingsPage,
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[app-doctor] settings page register failed (ignored)', e);
    }

    // eslint-disable-next-line no-console
    console.log('[app-doctor] client (classic lane) loaded');
  }
}

export default PluginAppDoctorClient;
