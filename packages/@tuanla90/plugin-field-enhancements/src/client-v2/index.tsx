import React from 'react';
import { Plugin, FieldModel, Icon, icons, RecordSelectFieldModel, DisplayTextFieldModel, useApp } from '@nocobase/client-v2';
import { tExpr, CollectionFieldModel } from '@nocobase/flow-engine';
import { registerAllFieldModels } from '../shared/registerAll';
import { GlobalWidgetsPane } from '../shared/GlobalWidgetsPane';

const NS = 'field-enhancements';
// /v/ settings page: overview of global field-widget assignments.
const GlobalWidgetsSettings: React.FC = () => {
  const app: any = useApp();
  const t = (s: string) => app?.i18n?.t?.(s, { ns: NS }) ?? s;
  return <GlobalWidgetsPane api={app?.apiClient} appT={(s: string) => (app?.i18n?.t?.(s) ?? s)} t={t} />;
};

// Modern lane (/v/). All widget registration lives in the shared registerAllFieldModels() so the two lanes
// can't drift; only the lane-specific base classes (imported from @nocobase/client-v2) differ.
export class PluginFieldEnhancementsClientV2 extends Plugin {
  async load() {
    registerAllFieldModels({
      flowEngine: (this as any).flowEngine,
      flowSettings: (this as any).flowEngine?.flowSettings,
      FieldModel,
      DisplayTextFieldModel,
      CollectionFieldModel,
      tExpr,
      Icon,
      icons,
      RecordSelectFieldModelImport: RecordSelectFieldModel,
      i18n: (this as any).app?.i18n,
      api: (this as any).app?.apiClient,
      lane: 'client-v2',
    });
    // Central overview settings page for global field-widget assignments.
    try {
      const t = (s: string) => this.app.i18n.t(s, { ns: NS });
      const psm: any = (this as any).app?.pluginSettingsManager;
      psm?.addMenuItem?.({ key: 'ptdl-field-widgets', title: t('Field nâng cao'), icon: 'AppstoreOutlined' });
      psm?.addPageTabItem?.({ menuKey: 'ptdl-field-widgets', key: 'index', Component: GlobalWidgetsSettings });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[field-enh] settings page register failed (ignored)', e);
    }
  }
}

export default PluginFieldEnhancementsClientV2;
