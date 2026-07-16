import { Plugin, Icon, icons } from '@nocobase/client';
import { tExpr } from '@nocobase/flow-engine';
import { registerTableConditionalFormat, NS } from '../shared/tableRulesModel';
import { setSharedT, SHARED_NS, sharedEnUS } from '@ptdl/shared';
import enUS from '../locale/en-US.json';

// Block-level conditional formatting only (per-column "Value tag" moved to field-enhancements).
export class PluginConditionalFormatClient extends Plugin {
  async load() {
    // i18n: register the English translations against this plugin's namespace (Vietnamese = the key).
    try {
      this.app.i18n.addResources('en-US', NS, enUS);
      // @ptdl/shared's condition-kit strings (operators, date presets, value placeholders) — bilingual.
      this.app.i18n.addResources('en-US', SHARED_NS, sharedEnUS);
      // Unsupported UI languages → English: en-US fallback + a VN-key identity map for vi so it keeps VN.
      const _id = (m: any) => Object.fromEntries(Object.keys(m || {}).map((k) => [k, k]));
      this.app.i18n.addResources('vi-VN', NS, _id(enUS));
      this.app.i18n.addResources('vi-VN', SHARED_NS, _id(sharedEnUS));
      const _i: any = this.app.i18n;
      _i.options.fallbackLng = 'en-US';
      if (_i.services?.languageUtils?.options) _i.services.languageUtils.options.fallbackLng = 'en-US';
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[cond-fmt] i18n addResources failed', e);
    }
    setSharedT((s, o) => this.app.i18n.t(s, { ns: SHARED_NS, ...(o || {}) }));
    const fe = (this as any).flowEngine;
    // No-op ở classic nếu không có TableBlockModel.
    try {
      registerTableConditionalFormat({ flowEngine: fe, flowSettings: fe?.flowSettings, tExpr, Icon, icons, app: (this as any).app });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[cond-fmt] table cond-fmt register failed (ignored)', e);
    }
    // eslint-disable-next-line no-console
    console.log('[cond-fmt] client (classic lane) loaded');
  }
}

export default PluginConditionalFormatClient;
