import { Plugin } from '@nocobase/client';
import { registerSpreadsheet, NS, setRuntimeT } from '../shared/spreadsheet';
import { setSharedT, SHARED_NS, sharedEnUS } from '@ptdl/shared';
import enUS from '../locale/en-US.json';

/**
 * Classic /admin lane. Lane này cũng chạy FlowEngine (như filter-tree/field-enhancements), nên
 * đăng ký cùng block model; nếu flowEngine của lane không có CollectionBlockModel thì
 * registerSpreadsheet tự no-op kèm warning. Lưu ý: trang /admin kiểu uiSchema CŨ không render
 * block FlowEngine — block chỉ hiện ở những trang chạy FlowEngine.
 */
export class PluginSpreadsheetViewClient extends Plugin {
  async load() {
    // i18n (VN-string-as-key): register English translations for this plugin's namespace (Vietnamese
    // = the key, so no vi-VN file). setRuntimeT wires the runtime translator for React-rendered strings.
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
    // @ptdl/shared's OWN render strings (AiCodegenButton chrome) song ngữ qua SHARED_NS + setSharedT.
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
      console.log('[spreadsheet-view] classic lane loaded');
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[spreadsheet-view] classic register failed', e);
    }
  }
}

export default PluginSpreadsheetViewClient;
