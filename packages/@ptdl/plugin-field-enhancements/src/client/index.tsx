import React from 'react';
import { Plugin, FieldModel, Icon, icons, DisplayTextFieldModel, useAPIClient } from '@nocobase/client';
import { tExpr, CollectionFieldModel } from '@nocobase/flow-engine';
import { registerAllFieldModels } from '../shared/registerAll';
import { GlobalWidgetsPane } from '../shared/GlobalWidgetsPane';

const NS = 'field-enhancements';
let _feApp: any = null; // captured in load() so the settings component can reach app.i18n.
const GlobalWidgetsSettings: React.FC = () => {
  const api: any = useAPIClient();
  const t = (s: string) => _feApp?.i18n?.t?.(s, { ns: NS }) ?? s;
  return <GlobalWidgetsPane api={api} appT={(s: string) => (_feApp?.i18n?.t?.(s) ?? s)} t={t} />;
};

// Classic lane (/admin). Same registration path as /v/ — see registerAllFieldModels(). The classic client
// does not export RecordSelectFieldModel, so richSelect resolves its base from the engine only.
export class PluginFieldEnhancementsClient extends Plugin {
  async load() {
    _feApp = this.app;
    registerAllFieldModels({
      flowEngine: (this as any).flowEngine,
      flowSettings: (this as any).flowEngine?.flowSettings,
      FieldModel,
      DisplayTextFieldModel,
      CollectionFieldModel,
      tExpr,
      Icon,
      icons,
      i18n: (this as any).app?.i18n,
      api: (this as any).app?.apiClient,
      lane: 'client',
    });
    // Central overview settings page for global field-widget assignments.
    try {
      const t = (s: string) => this.app.i18n.t(s, { ns: NS });
      this.app.pluginSettingsManager.add('ptdl-field-widgets', {
        title: t('Field nâng cao'),
        icon: 'AppstoreOutlined',
        Component: GlobalWidgetsSettings,
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[field-enh] settings page register failed (ignored)', e);
    }
  }
}

export default PluginFieldEnhancementsClient;
