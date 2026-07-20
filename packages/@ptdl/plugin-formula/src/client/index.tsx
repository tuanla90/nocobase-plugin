import React from 'react';
import { Plugin, DisplayTextFieldModel, useAPIClient } from '@nocobase/client';
import { ComputedRulesManager } from '../shared/computedRulesManager';
import { ScanCalcManager } from '../shared/ScanCalcManager';
// The classic /admin app ALSO hosts flow-engine blocks (e.g. EnhancedTableBlockModel) and
// provides '@nocobase/client-v2' as a shared runtime module to plugins — so we can import the
// flow-engine column base here too and register our virtual column for /admin's flow blocks.
import {
  TableCustomColumnModel,
  TableColumnModel,
  EditableFieldModel,
  DisplayTextFieldModel as DisplayTextFieldModelV2,
} from '@nocobase/client-v2';
import { CollectionFieldModel, tExpr, registerRunJSLib, registerRunJSSnippet } from '@nocobase/flow-engine';
import { registerFormulaModel } from '../shared/formulaFieldModel';
import { registerComputedRuleFlow, loadComputedRuleCache, loadComputedCollections, loadScanHintCache, installComputedAutoRefresh } from '../shared/computedRuleClient';
import { registerFormulaColumnModel } from '../shared/formulaColumnModel';
import { registerClassicFormulaColumn } from './formulaColumnClassic';
import {
  formulaRunJSLib,
  FORMULA_LIB_NAME,
  overrideDefaultValueComponent,
  registerFormulaSnippet,
} from '../shared/formulaDefaultValue';
import { NS, setRuntimeT, t } from '../shared/i18n';
import { setSharedT, SHARED_NS, sharedEnUS } from '@ptdl/shared';
import enUS from '../locale/en-US.json';

// Classic /admin settings page host — the classic app exposes useAPIClient().
const ScanCalcSettingsClassic: React.FC = () => {
  const api: any = useAPIClient();
  return <ScanCalcManager api={api} />;
};
const ComputedRulesSettingsClassic: React.FC = () => {
  const api: any = useAPIClient();
  return <ComputedRulesManager api={api} />;
};

export class PluginFormulaClient extends Plugin {
  // Register the flow-engine virtual column as EARLY as possible (afterAdd runs before any
  // plugin's load()). Without this, a persisted FormulaColumnModel inside a flow block that
  // builds columns during load (EnhancedTableBlockModel) resolves to the base
  // TableCustomColumnModel (no getColumnProps) and crashes the whole block on /admin.
  async afterAdd() {
    const fe = (this as any).flowEngine;
    registerFormulaColumnModel({ flowEngine: fe, Base: TableCustomColumnModel, tExpr });
  }

  async load() {
    const app = (this as any).app;
    // i18n: register the English translations under this plugin's namespace (Vietnamese = the key).
    // Must run BEFORE any t()/registration below (classic column initializer + settings page use t()).
    try {
      app.i18n.addResources('en-US', NS, enUS);
      // @ptdl/shared's own render strings (field-picker button, empty state) — bilingual per lane.
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
    // Idempotent — no-op if afterAdd already registered.
    registerFormulaColumnModel({ flowEngine: fe, Base: TableCustomColumnModel, tExpr });
    // Classic /admin virtual Formula column (SchemaInitializer / TableV2 stack).
    registerClassicFormulaColumn(this.app);
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
    // Field-bound display option (flow-engine field model), if the classic lane surfaces it.
    registerFormulaModel({
      flowEngine: fe,
      flowSettings: fe?.flowSettings,
      Base: DisplayTextFieldModel,
      CollectionFieldModel,
      tExpr,
    });
    // Computed field on /admin's flow blocks: the SAME flow-engine UX as /v/ — the ⓘ formula icon
    // (hover/click-to-edit, admin-gated), the column ⚙ editor, and the live WS+axios auto-refresh — all
    // just need registering on THIS lane's flowEngine + apiClient (client-v2 was doing it alone).
    try {
      registerComputedRuleFlow({
        flowEngine: fe,
        flowSettings: fe?.flowSettings,
        TableColumnModel,
        EditableFieldModel,
        DisplayTextFieldModel: DisplayTextFieldModelV2,
        tExpr,
      });
      await loadComputedRuleCache(app?.apiClient);
      await loadScanHintCache(app?.apiClient);
      await loadComputedCollections(app?.apiClient);
      installComputedAutoRefresh(app);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[formula] classic computed rule flow init failed', e);
    }
    // Settings page (classic /admin): pluginSettingsManager.add (v1 API).
    try {
      (this as any).app.pluginSettingsManager.add('ptdl-computed', {
        title: t('Công thức tự tính'),
        icon: 'CalculatorOutlined',
        Component: ComputedRulesSettingsClassic,
      });
      (this as any).app.pluginSettingsManager.add('ptdl-scancalc', {
        title: t('Tính tuần tự'),
        icon: 'OrderedListOutlined',
        Component: ScanCalcSettingsClassic,
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[formula] classic settings page init failed', e);
    }
    // eslint-disable-next-line no-console
    console.log('[formula] client (classic lane) loaded — /admin virtual column + flow column + field + settings');
  }
}

export default PluginFormulaClient;
