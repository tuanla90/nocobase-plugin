import React from 'react';
import { Plugin, DisplayTextFieldModel, TableCustomColumnModel, TableColumnModel, EditableFieldModel, FieldModel, useApp } from '@nocobase/client-v2';
import { ComputedRulesManager } from '../shared/computedRulesManager';
import { ScanCalcManager } from '../shared/ScanCalcManager';
import { CollectionFieldModel, tExpr, registerRunJSLib, registerRunJSSnippet } from '@nocobase/flow-engine';
import { registerFormulaComponents } from '../shared/formulaEditorComponents';
import { registerFormulaModel } from '../shared/formulaFieldModel';
import { registerFormulaColumnModel } from '../shared/formulaColumnModel';
import {
  formulaRunJSLib,
  FORMULA_LIB_NAME,
  overrideDefaultValueComponent,
  registerFormulaSnippet,
} from '../shared/formulaDefaultValue';
import { registerComputedRuleFlow, loadComputedRuleCache, loadComputedCollections, loadScanHintCache, installComputedAutoRefresh } from '../shared/computedRuleClient';
import { NS, setRuntimeT, t } from '../shared/i18n';
import { setSharedT, SHARED_NS, sharedEnUS } from '@tuanla90/shared';
import enUS from '../locale/en-US.json';

// Settings page host: @nocobase/client-v2 has no useAPIClient — the client is on useApp().apiClient.
const ComputedRulesSettings: React.FC = () => {
  const app: any = useApp();
  return <ComputedRulesManager api={app?.apiClient} />;
};
const ScanCalcSettings: React.FC = () => {
  const app: any = useApp();
  return <ScanCalcManager api={app?.apiClient} />;
};

export class PluginFormulaClientV2 extends Plugin {
  // Register the virtual column model as EARLY as possible (afterAdd runs before any plugin's
  // load()), so blocks that build their columns during load (e.g. EnhancedTableBlockModel)
  // resolve `FormulaColumnModel` to our class — otherwise it falls back to the base
  // TableCustomColumnModel (no getColumnProps) and the table crashes.
  async afterAdd() {
    const fe = (this as any).flowEngine;
    registerFormulaColumnModel({ flowEngine: fe, Base: TableCustomColumnModel, tExpr });
  }

  async load() {
    const app = (this as any).app;
    // i18n: register the English translations under this plugin's namespace. Vietnamese is the source
    // (= the key), so it needs no resource file — a vi-VN user falls back to the key text. Must run
    // BEFORE any t()/registration below.
    try {
      app.i18n.addResources('en-US', NS, enUS);
      // @tuanla90/shared's own render strings (field-picker button, empty state) — bilingual per lane.
      app.i18n.addResources('en-US', SHARED_NS, sharedEnUS);
      // Unsupported UI languages → English: en-US fallback + a VN-key identity map for vi so it keeps VN.
      const _id = (m: any) => Object.fromEntries(Object.keys(m || {}).map((k) => [k, k]));
      app.i18n.addResources('vi-VN', NS, _id(enUS));
      app.i18n.addResources('vi-VN', SHARED_NS, _id(sharedEnUS));
      app.i18n.options.fallbackLng = 'en-US';
      if (app.i18n.services?.languageUtils?.options) app.i18n.services.languageUtils.options.fallbackLng = 'en-US';
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[formula] i18n addResources failed', e);
    }
    setRuntimeT((s, o) => app.i18n.t(s, { ns: NS, ...(o || {}) }));
    setSharedT((s, o) => app.i18n.t(s, { ns: SHARED_NS, ...(o || {}) }));
    const fe = (this as any).flowEngine;
    registerFormulaComponents(fe?.flowSettings);
    // Standalone virtual column (idempotent — already registered in afterAdd unless fe was late).
    registerFormulaColumnModel({ flowEngine: fe, Base: TableCustomColumnModel, tExpr });
    // D2: expose the engine to every RunJS sandbox + add the Excel-formula mode to Default value.
    try {
      registerRunJSLib(FORMULA_LIB_NAME, () => formulaRunJSLib, { cache: 'global' });
      // Bridge cho plugin khác (spreadsheet-view formula columns) dùng chung engine.
      (globalThis as any).__ptdlFormula = formulaRunJSLib;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[formula] registerRunJSLib failed', e);
    }
    overrideDefaultValueComponent(fe?.flowSettings);
    registerFormulaSnippet(registerRunJSSnippet);
    // NOTE: the "Rollup" and "Window/Ledger" special column types were REMOVED. Both were weak, plain-text
    // Add-field config UIs that duplicated a better central page. Aggregates → computed rules ("Công thức
    // tự tính", e.g. SUM(data.items.amount)); running/ledger columns → "Sổ / Lũy kế (window)" page; costing
    // → "Giá vốn (FIFO / Bình quân)" page. All are plain number columns with logic configured centrally.
    // Field-bound display option (attach Formula to an existing field / detail)
    registerFormulaModel({
      flowEngine: fe,
      flowSettings: fe?.flowSettings,
      Base: DisplayTextFieldModel,
      CollectionFieldModel,
      tExpr,
    });
    // Computed field (Phase 1): "Giá trị tự tính" rule editor on a real-field column's ⚙ menu +
    // prefill cache. Writes to the server `ptdlComputedRules` collection.
    try {
      registerComputedRuleFlow({ flowEngine: fe, flowSettings: fe?.flowSettings, TableColumnModel, EditableFieldModel, FieldModel, DisplayTextFieldModel, tExpr });
      await loadComputedRuleCache(app?.apiClient);
      await loadScanHintCache(app?.apiClient);
      // Auto-refresh page blocks after a mutation on a computed-relevant collection (no manual F5).
      await loadComputedCollections(app?.apiClient);
      installComputedAutoRefresh(app);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[formula] computed rule flow init failed', e);
    }
    // Settings page: Settings (⚙) → "Công thức tự tính" — manage every computed rule (add/edit/delete/recompute).
    try {
      const psm: any = (this as any).app?.pluginSettingsManager;
      psm?.addMenuItem?.({ key: 'ptdl-computed', title: t('Công thức tự tính'), icon: 'CalculatorOutlined' });
      psm?.addPageTabItem?.({ menuKey: 'ptdl-computed', key: 'index', title: t('Công thức'), Component: ComputedRulesSettings });
      psm?.addMenuItem?.({ key: 'ptdl-scancalc', title: t('Tính tuần tự'), icon: 'OrderedListOutlined' });
      psm?.addPageTabItem?.({ menuKey: 'ptdl-scancalc', key: 'index', title: t('Quy tắc'), Component: ScanCalcSettings });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[formula] computed settings page init failed', e);
    }
    // eslint-disable-next-line no-console
    console.log('[formula] client-v2 (modern lane) loaded — column + field + settings');
  }
}

export default PluginFormulaClientV2;
