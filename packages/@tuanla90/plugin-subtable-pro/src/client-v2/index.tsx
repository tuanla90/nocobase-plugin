import { Plugin, Icon, icons } from '@nocobase/client-v2';
import { registerSubtablePro, NS, setRuntimeT, setIconComp } from '../shared/subtablePro';
import { installBridge } from '../shared/bridge';
import { setSharedT, SHARED_NS, sharedEnUS } from '@tuanla90/shared';
import enUS from '../locale/en-US.json';

// Modern lane (/v/). The widget subclasses the native SubTableFieldModel, which only exists on this lane.
export class PluginSubtableProClientV2 extends Plugin {
  async load() {
    // i18n (VN-string-as-key): register English translations; Vietnamese is the source (= the key), so a
    // vi-VN user misses en-US and i18next returns the key text (Vietnamese). See build-guide §R1.
    try {
      this.app.i18n.addResources('en-US', NS, enUS);
      this.app.i18n.addResources('vi-VN', NS, Object.fromEntries(Object.keys(enUS).map((k) => [k, k])));
      const _i: any = this.app.i18n;
      _i.options.fallbackLng = 'en-US';
      if (_i.services?.languageUtils?.options) _i.services.languageUtils.options.fallbackLng = 'en-US';
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[subtable-pro] i18n addResources failed', e);
    }
    setRuntimeT((s, o) => this.app.i18n.t(s, { ns: NS, ...(o || {}) }));
    // @tuanla90/shared's own render strings — register + inject translator (mandatory R1/R2).
    try {
      this.app.i18n.addResources('en-US', SHARED_NS, sharedEnUS);
      this.app.i18n.addResources('vi-VN', SHARED_NS, Object.fromEntries(Object.keys(sharedEnUS).map((k) => [k, k])));
      setSharedT((s: string, o?: any) => this.app.i18n.t(s, { ns: SHARED_NS, ...(o || {}) }));
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[subtable-pro] shared i18n wiring failed', e);
    }
    installBridge(this.app);
    setIconComp(Icon, icons);
    try {
      registerSubtablePro({ flowEngine: (this as any).flowEngine, flowSettings: (this as any).flowEngine?.flowSettings });
      // eslint-disable-next-line no-console
      console.log('[subtable-pro] client-v2 loaded');
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[subtable-pro] register failed', e);
    }
  }
}

export default PluginSubtableProClientV2;
