import React from 'react';
import { Plugin, useApp } from '@nocobase/client-v2';
import { installKeepaliveCap } from '../shared/keepaliveCap';
import { installCrashGuard } from '../shared/crashGuard';
import { PerfGuardSettingsPane } from '../shared/settingsPane';
import enUS from '../locale/en-US.json';

const NS = 'ptdl-perf-guard';

// Modern lane (/v/) settings page — registered via addMenuItem + addPageTabItem.
const SettingsPage: React.FC = () => {
  const app: any = useApp();
  return <PerfGuardSettingsPane t={(s: string) => (app?.i18n?.t?.(s, { ns: NS }) ?? s)} />;
};

// perf-guard = two runtime patches on the modern client:
//   1. keep-alive cap — caps NocoBase v2's unbounded sub-page keep-alive (DOM-leak → render lag).
//   2. crash guard    — isolates a broken column's beforeRender so it can't freeze the whole app.
// Both are crash-safe and idempotent; the settings page toggles the cap + shows the live DOM signal.
export class PluginPerfGuardClientV2 extends Plugin {
  async load() {
    // i18n: EN translations under this plugin's namespace; VN is the source (= the key). A vi-VN identity
    // map keeps VN, and fallbackLng='en-US' routes other languages to English instead of raw VN keys.
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
      console.warn('[perf-guard] i18n addResources failed', e);
    }

    // 1) crash guard — global beforeRender isolation (must run before blocks render; retries internally).
    try {
      installCrashGuard((this as any).flowEngine || (this as any).app);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[perf-guard] crash-guard install failed (ignored)', e);
    }
    // 2) keep-alive cap — installs the nav hook + console API (auto-evict gated by the setting, default ON).
    try {
      installKeepaliveCap((this as any).app);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[perf-guard] keepalive-cap install failed (ignored)', e);
    }

    // Settings page (/v/ lane).
    try {
      const st = (s: string) => this.app.i18n.t(s, { ns: NS });
      const psm: any = this.app.pluginSettingsManager;
      psm?.addMenuItem?.({ key: 'ptdl-perf-guard', title: st('Tối ưu & Ổn định'), icon: 'ThunderboltOutlined' });
      psm?.addPageTabItem?.({ menuKey: 'ptdl-perf-guard', key: 'index', Component: SettingsPage });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[perf-guard] settings page register failed (ignored)', e);
    }

    // eslint-disable-next-line no-console
    console.log('[perf-guard] client-v2 loaded (keepalive-cap + crash-guard + settings)');
  }
}

export default PluginPerfGuardClientV2;
