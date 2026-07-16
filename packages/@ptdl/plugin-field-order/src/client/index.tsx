import { Plugin } from '@nocobase/client';
import { initFieldOrder } from '../shared/fieldOrder';
import enUS from '../locale/en-US.json';
import viVN from '../locale/vi-VN.json';

// i18n namespace for this plugin's client strings. English text is the key; en-US.json is an
// identity map and vi-VN.json supplies the Vietnamese (a missing key falls back to the English key).
const NS = '@ptdl/plugin-field-order/client';

// Classic lane (`/`, `/admin`). The Collection Manager lives here. We mount the injector at body
// level (initFieldOrder) rather than via app.addProvider, whose providers don't render on the
// `/admin/settings/*` subtree where the Configure-fields drawer opens.
export class PluginFieldOrderClient extends Plugin {
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
  }
}

export default PluginFieldOrderClient;
