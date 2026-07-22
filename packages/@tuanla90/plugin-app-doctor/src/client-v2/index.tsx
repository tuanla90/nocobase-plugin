import React from 'react';
import { Plugin, useApp } from '@nocobase/client-v2';
import { DoctorPane } from '../shared/DoctorPane';
import enUS from '../locale/en-US.json';

const NS = 'ptdl-app-doctor';

// Modern lane (/v/) settings page — registered via addMenuItem + addPageTabItem.
const SettingsPage: React.FC = () => {
  const app: any = useApp();
  return <DoctorPane api={app?.apiClient} t={(s: string) => (app?.i18n?.t?.(s, { ns: NS }) ?? s)} />;
};

// App Doctor: scans the app's data collections for relation-integrity issues and one-click repairs the
// fixable ones (missing reverse relations). All logic is server-side (ptdlAppDoctor:scan/repair); this lane
// only registers the settings page.
export class PluginAppDoctorClientV2 extends Plugin {
  async load() {
    try {
      this.app.i18n.addResources('en-US', NS, enUS);
      const _id = (m: any) => Object.fromEntries(Object.keys(m || {}).map((k) => [k, k]));
      this.app.i18n.addResources('vi-VN', NS, _id(enUS));
      const _i: any = this.app.i18n;
      _i.options.fallbackLng = _i.options.fallbackLng || 'en-US';
      if (_i.services?.languageUtils?.options && !_i.services.languageUtils.options.fallbackLng) {
        _i.services.languageUtils.options.fallbackLng = 'en-US';
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[app-doctor] i18n addResources failed', e);
    }

    try {
      const st = (s: string) => this.app.i18n.t(s, { ns: NS });
      const psm: any = this.app.pluginSettingsManager;
      psm?.addMenuItem?.({ key: 'ptdl-app-doctor', title: st('App Doctor'), icon: 'MedicineBoxOutlined' });
      psm?.addPageTabItem?.({ menuKey: 'ptdl-app-doctor', key: 'index', Component: SettingsPage });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[app-doctor] settings page register failed (ignored)', e);
    }

    // eslint-disable-next-line no-console
    console.log('[app-doctor] client-v2 loaded (relation scan + repair)');
  }
}

export default PluginAppDoctorClientV2;
