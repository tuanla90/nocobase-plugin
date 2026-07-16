import { Plugin } from '@nocobase/client-v2';
import { registerSpreadsheet, NS, setRuntimeT } from '../shared/spreadsheet';
import { setSharedT, SHARED_NS, sharedEnUS } from '@ptdl/shared';
import enUS from '../locale/en-US.json';

export class PluginSpreadsheetViewClientV2 extends Plugin {
  async load() {
    // i18n (VN-string-as-key): register the English translations against this plugin's namespace.
    // Vietnamese is the source (= the key), so no vi-VN file is needed — a vi-VN user misses en-US
    // and i18next returns the key text (Vietnamese). setRuntimeT wires the runtime React translator.
    try {
      this.app.i18n.addResources('en-US', NS, enUS);
      // Unsupported UI languages → English: en-US fallback + a VN-key identity map for vi so it keeps VN.
      this.app.i18n.addResources('vi-VN', NS, Object.fromEntries(Object.keys(enUS).map((k) => [k, k])));
      const _i: any = this.app.i18n;
      _i.options.fallbackLng = 'en-US';
      if (_i.services?.languageUtils?.options) _i.services.languageUtils.options.fallbackLng = 'en-US';
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[spreadsheet-view] i18n addResources failed', e);
    }
    setRuntimeT((s, o) => this.app.i18n.t(s, { ns: NS, ...(o || {}) }));
    // @ptdl/shared's OWN render strings (AiCodegenButton chrome) là VN-string-as-key dưới SHARED_NS —
    // đăng ký map en-US + inject translator để nút "AI viết hộ" song ngữ theo host (bắt buộc, R1/R2).
    try {
      this.app.i18n.addResources('en-US', SHARED_NS, sharedEnUS);
      this.app.i18n.addResources('vi-VN', SHARED_NS, Object.fromEntries(Object.keys(sharedEnUS).map((k) => [k, k])));
      setSharedT((s: string, o?: any) => this.app.i18n.t(s, { ns: SHARED_NS, ...(o || {}) }));
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[spreadsheet-view] shared i18n wiring failed', e);
    }
    try {
      registerSpreadsheet({ flowEngine: (this as any).flowEngine });
      // eslint-disable-next-line no-console
      console.log('[spreadsheet-view] client-v2 loaded');
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[spreadsheet-view] register failed', e);
    }
  }
}

export default PluginSpreadsheetViewClientV2;
