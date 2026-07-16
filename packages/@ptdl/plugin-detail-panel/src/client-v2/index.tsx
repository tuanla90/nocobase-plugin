import { Plugin } from '@nocobase/client-v2';
import { registerSidePanelModeWithRetry, registerRowClickPanel, NS, setRuntimeT } from '../shared/detailPanel';
import enUS from '../locale/en-US.json';

// Modern lane (/v/). The openView action + the embed side container only exist here, so this is where the
// "Side panel" open mode is wired. No @ptdl/shared component is rendered (the barrel pulls colorField→antd
// and isn't needed); i18n is the plugin's own NS.
export class PluginDetailPanelClientV2 extends Plugin {
  async load() {
    // i18n (VN-string-as-key): register English; Vietnamese is the source (= the key) → a vi-VN miss returns
    // the key text. See build-guide §R1.
    try {
      this.app.i18n.addResources('en-US', NS, enUS);
      this.app.i18n.addResources('vi-VN', NS, Object.fromEntries(Object.keys(enUS).map((k) => [k, k])));
      const _i: any = this.app.i18n;
      _i.options.fallbackLng = 'en-US';
      if (_i.services?.languageUtils?.options) _i.services.languageUtils.options.fallbackLng = 'en-US';
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[detail-panel] i18n addResources failed', e);
    }
    setRuntimeT((s, o) => this.app.i18n.t(s, { ns: NS, ...(o || {}) }));

    // The mode-enum label is baked at load per current language (the flow-settings dialog resolves core
    // labels against its own scope; a plain, already-localized string is the reliable cross-lane choice).
    const lang = (this.app.i18n as any)?.language || 'en-US';
    const sidePanelLabel = String(lang).startsWith('vi') ? 'Panel bên' : 'Side panel';

    try {
      // A) "Side panel" open mode on native popups (full configured, editable).
      registerSidePanelModeWithRetry({ flowEngine: (this as any).flowEngine, sidePanelLabel });
      // B) row-click quick panel (read-only, zero-config) — a Table block ⚙ toggle.
      registerRowClickPanel({ flowEngine: (this as any).flowEngine });
      // eslint-disable-next-line no-console
      console.log('[detail-panel] client-v2 loaded');
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[detail-panel] register failed', e);
    }
  }
}

export default PluginDetailPanelClientV2;
