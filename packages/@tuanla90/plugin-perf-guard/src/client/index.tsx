import React from 'react';
import { Plugin } from '@nocobase/client';
import { installKeepaliveCap } from '../shared/keepaliveCap';
import { installCrashGuard } from '../shared/crashGuard';
import { PerfGuardSettingsPane } from '../shared/settingsPane';
import enUS from '../locale/en-US.json';

const NS = 'ptdl-perf-guard';

// Classic lane (/admin). This lane MUST exist (a dist/client/index.js) or RequireJS white-screens the
// whole app for a /v/-only plugin. Beyond existing, it installs the same crash-safe guards (the
// keep-alive cap no-ops here — the sub-page slot is a /v/ construct — but the crash guard still applies
// if the classic client shares the flow-engine) and exposes the settings page under classic Settings.
let _pgApp: any = null;
const SettingsPage: React.FC = () => {
  return <PerfGuardSettingsPane t={(s: string) => (_pgApp?.i18n?.t?.(s, { ns: NS }) ?? s)} />;
};

export class PluginPerfGuardClient extends Plugin {
  async load() {
    _pgApp = this.app;
    try {
      this.app.i18n.addResources('en-US', NS, enUS);
      const _id = (m: any) => Object.fromEntries(Object.keys(m || {}).map((k) => [k, k]));
      this.app.i18n.addResources('vi-VN', NS, _id(enUS));
      const _i: any = this.app.i18n;
      _i.options.fallbackLng = _i.options.fallbackLng || 'en-US';
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[perf-guard] i18n addResources failed', e);
    }

    try {
      installCrashGuard((this as any).flowEngine || (this as any).app);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[perf-guard] crash-guard install failed (ignored)', e);
    }
    try {
      installKeepaliveCap((this as any).app);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[perf-guard] keepalive-cap install failed (ignored)', e);
    }

    try {
      const st = (s: string) => this.app.i18n.t(s, { ns: NS });
      this.app.pluginSettingsManager.add('ptdl-perf-guard', {
        title: st('Tối ưu & Ổn định'),
        icon: 'ThunderboltOutlined',
        Component: SettingsPage,
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[perf-guard] settings page register failed (ignored)', e);
    }

    // eslint-disable-next-line no-console
    console.log('[perf-guard] client (classic lane) loaded');
  }
}

export default PluginPerfGuardClient;
