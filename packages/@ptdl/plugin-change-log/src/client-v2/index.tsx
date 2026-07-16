import React from 'react';
import { ActionModel, Icon, Plugin, icons, useApp } from '@nocobase/client-v2';
import { setIconRegistry } from '@ptdl/shared';
import { ChangeLogConfigManager } from '../shared/ChangeLogConfigManager';
import { defineChangeHistoryAction } from '../shared/changeHistoryAction';
import { registerChangeHistoryBlock } from '../shared/changeHistoryBlock';
import { exposeChangeLogBridge } from '../shared/ChangeLogSurfaces';
import { setChangeLogI18n, t, NS } from '../shared/changeLogClient';
import enUS from '../locale/en-US.json';
import viVN from '../locale/vi-VN.json';

// @nocobase/client-v2 has no useAPIClient — the app's client is on useApp().apiClient.
const ChangeLogSettings: React.FC = () => {
  const app: any = useApp();
  return <ChangeLogConfigManager api={app?.apiClient} />;
};

export class PluginChangeLogClientV2 extends Plugin {
  async load() {
    // Feed the @ptdl/shared registry so IconByKey (status + source icons in the timeline) resolves.
    setIconRegistry(Icon, icons);
    setChangeLogI18n((this.app as any).i18n);
    // Register EN/VI translations for this plugin's namespace (English key -> localized value).
    try {
      this.app.i18n.addResources('en-US', NS, enUS);
      this.app.i18n.addResources('vi-VN', NS, viVN);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[change-log] i18n addResources failed', e);
    }
    exposeChangeLogBridge();

    const engine: any = (this as any).flowEngine || (this.app as any).flowEngine;
    const ChangeHistoryActionModel = defineChangeHistoryAction(ActionModel);
    engine.registerModels({ ChangeHistoryActionModel });
    await registerChangeHistoryBlock(engine);

    this.app.pluginSettingsManager.addMenuItem({ key: 'ptdl-change-log', title: t('Change Log'), icon: 'HistoryOutlined' });
    this.app.pluginSettingsManager.addPageTabItem({
      menuKey: 'ptdl-change-log',
      key: 'index',
      title: t('Tracked collections'),
      Component: ChangeLogSettings,
    });

    // eslint-disable-next-line no-console
    console.log('[change-log] client-v2 lane loaded');
  }
}

export default PluginChangeLogClientV2;
