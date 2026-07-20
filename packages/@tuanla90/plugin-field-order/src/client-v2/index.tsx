import { Plugin } from '@nocobase/client-v2';
import { initFieldOrder } from '../shared/fieldOrder';
import { applySettingsMenuOrder } from '../shared/settingsMenuOrder';
import enUS from '../locale/en-US.json';
import viVN from '../locale/vi-VN.json';

// i18n namespace for this plugin's client strings (shared with the classic lane).
const NS = '@tuanla90/plugin-field-order/client';

// Modern lane (`/v/`). Needs the lane class + a root `client-v2.js` marker or pm:listEnabledV2 skips
// the plugin. The injector is mounted at body level (initFieldOrder) — lane-agnostic and independent
// of the router subtree — with the app's apiClient instance (this.app.apiClient).
export class PluginFieldOrderClientV2 extends Plugin {
  async load() {
    try {
      this.app.i18n.addResources('en-US', NS, enUS);
      this.app.i18n.addResources('vi-VN', NS, viVN);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[field-order] i18n addResources failed', e);
    }
    const t = (s: string, opts?: Record<string, any>) => this.app.i18n.t(s, { ns: NS, ...(opts || {}) });

    initFieldOrder({ apiClient: (this.app as any).apiClient, t });

    // Reorder the /v/ Settings-center menu into a logical, theme-grouped order.
    applySettingsMenuOrder(this.app);
  }
}

export default PluginFieldOrderClientV2;
