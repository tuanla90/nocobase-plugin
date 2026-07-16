import { Plugin, registerIcon, icons } from '@nocobase/client';
import { registerLucideIcons } from '../shared/lucideIcons';
import { initRegistry, loadAndApply, createIconRemapPane } from '../shared/iconRemap';
import { NS, setRuntimeT, t } from '../shared/i18n';
import enUS from '../locale/en-US.json';
import viVN from '../locale/vi-VN.json';

/**
 * Classic client entry (/admin). Registers the Lucide set into the classic registry AND applies the
 * icon-remap overrides + settings page (merged in from the former @ptdl/plugin-icon-remap), wired to
 * the classic client's own icon Map and apiClient.
 */
export class PluginCustomIconsClient extends Plugin {
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
    // 1) Provider first so remap proxies resolve.
    registerLucideIcons(registerIcon);

    // 2) Remap — snapshot then apply saved overrides.
    initRegistry(icons);
    await loadAndApply(app?.apiClient);

    // 3) Settings page (classic PluginSettingsManager uses `.add`).
    try {
      const Pane = createIconRemapPane({ getApi: () => (this as any).app.apiClient });
      (this as any).app.pluginSettingsManager.add('icon-remap', {
        title: t('Icon remap'),
        icon: 'SwapOutlined',
        Component: Pane,
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[custom-icons] client settings page registration failed', e);
    }
  }
}

export default PluginCustomIconsClient;
