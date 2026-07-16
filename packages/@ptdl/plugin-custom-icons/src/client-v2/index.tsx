import { Plugin, registerIcon, icons } from '@nocobase/client-v2';
import { registerLucideIcons } from '../shared/lucideIcons';
import { initRegistry, loadAndApply, createIconRemapPane } from '../shared/iconRemap';
import { NS, setRuntimeT, t } from '../shared/i18n';
import enUS from '../locale/en-US.json';
import viVN from '../locale/vi-VN.json';

/**
 * client-v2 (Modern page / FlowEngine) entry — now also carries the icon-remap feature (merged in from
 * the former @ptdl/plugin-icon-remap). Order matters: register the full Lucide set FIRST so the remap
 * proxies (lucide-*) resolve, then snapshot the registry and apply the saved antd→lucide overrides.
 */
export class PluginCustomIconsClientV2 extends Plugin {
  async load() {
    // i18n first — register EN identity + VI resources and the runtime translator before any t() use.
    try {
      this.app.i18n.addResources('en-US', NS, enUS as any);
      this.app.i18n.addResources('vi-VN', NS, viVN as any);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[custom-icons] i18n addResources failed', e);
    }
    setRuntimeT((s, o) => this.app.i18n.t(s, { ns: NS, ...(o || {}) }));

    const app: any = (this as any).app;
    // 1) Provider — register lucide into the v2 registry (separate from the classic client's).
    const n = registerLucideIcons(registerIcon);
    // eslint-disable-next-line no-console
    console.log(`[custom-icons] client-v2: registered ${n} lucide icons`);

    // 2) Remap — snapshot (now incl. lucide) then apply saved overrides. Must run even if the settings
    //    page registration below fails.
    initRegistry(icons);
    await loadAndApply(app?.apiClient);

    // 3) Settings page (Icon remap editor). Modern client uses addMenuItem + addPageTabItem.
    try {
      const psm: any = (this as any).pluginSettingsManager;
      const Pane = createIconRemapPane({ getApi: () => (this as any).app.apiClient });
      psm.addMenuItem({ key: 'icon-remap', title: t('Icon remap'), icon: 'SwapOutlined' });
      psm.addPageTabItem({ menuKey: 'icon-remap', key: 'index', componentLoader: async () => ({ default: Pane }) });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[custom-icons] client-v2 settings page registration failed', e);
    }
  }
}

export default PluginCustomIconsClientV2;
