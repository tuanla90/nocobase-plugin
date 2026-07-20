import React from 'react';
import { Plugin, Icon, icons, useApp } from '@nocobase/client-v2';
import { tExpr } from '@nocobase/flow-engine';
import { registerTableConditionalFormat, NS } from '../shared/tableRulesModel';
import { GlobalRulesPane } from '../shared/globalRulesPane';
import { setSharedT, SHARED_NS, sharedEnUS, setIconRegistry } from '@tuanla90/shared';
import enUS from '../locale/en-US.json';

// Modern lane (/v/) settings page for the GLOBAL rules — registered via addMenuItem + addPageTabItem.
const GlobalRulesSettings: React.FC = () => {
  const app: any = useApp();
  // appT compiles `{{t("…")}}` collection/field titles (system entities) to localised text.
  return <GlobalRulesPane api={app?.apiClient} appT={(s: string) => (app?.i18n?.t?.(s) ?? s)} />;
};

// conditional-format = BLOCK-LEVEL conditional formatting only (the per-column "value → tag" widget moved to
// @tuanla90/plugin-field-enhancements as "Value tag", 2026-07-13).
export class PluginConditionalFormatClientV2 extends Plugin {
  async load() {
    // i18n: register the English translations against this plugin's namespace. Vietnamese is the
    // source (= the key), so it needs no resource file — a vi-VN user falls back to the key text.
    try {
      this.app.i18n.addResources('en-US', NS, enUS);
      // @tuanla90/shared's condition-kit strings (operators, date presets, value placeholders) — bilingual.
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
    // The settings pane renders RegistryIconPicker/IconByKey → wire the shared icon registry early
    // (register() also does it, but only reaches that line when a TableBlockModel exists).
    try { setIconRegistry(Icon, icons); } catch (_) { /* optional */ }
    const fe = (this as any).flowEngine;
    try {
      registerTableConditionalFormat({ flowEngine: fe, flowSettings: fe?.flowSettings, tExpr, Icon, icons, app: (this as any).app });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[cond-fmt] table cond-fmt register failed (ignored)', e);
    }
    // Central settings page for global (field-level) rules.
    try {
      const st = (s: string) => this.app.i18n.t(s, { ns: NS });
      const psm: any = this.app.pluginSettingsManager;
      psm?.addMenuItem?.({ key: 'ptdl-conditional-format', title: st('Định dạng có điều kiện (Global)'), icon: 'BgColorsOutlined' });
      psm?.addPageTabItem?.({ menuKey: 'ptdl-conditional-format', key: 'index', Component: GlobalRulesSettings });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[cond-fmt] settings page register failed (ignored)', e);
    }
    // eslint-disable-next-line no-console
    console.log('[cond-fmt] client-v2 loaded (block + global rules + settings)');
  }
}

export default PluginConditionalFormatClientV2;
