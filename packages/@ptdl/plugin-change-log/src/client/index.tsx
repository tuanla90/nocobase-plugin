import React from 'react';
import { Icon, Plugin, icons, useAPIClient } from '@nocobase/client';
import { setIconRegistry } from '@ptdl/shared';
import { ChangeLogConfigManager } from '../shared/ChangeLogConfigManager';
import { defineChangeHistoryAction } from '../shared/changeHistoryAction';
import { registerChangeHistoryBlock } from '../shared/changeHistoryBlock';
import { exposeChangeLogBridge } from '../shared/ChangeLogSurfaces';
import { setChangeLogI18n, t, NS } from '../shared/changeLogClient';
import enUS from '../locale/en-US.json';
import viVN from '../locale/vi-VN.json';

// Classic lane (`/`, `/admin`): the settings page + the flow-engine record action (classic pages
// can host flow-engine blocks too, so the same action model is registered here).
const ChangeLogSettings: React.FC = () => {
  const api: any = useAPIClient();
  return <ChangeLogConfigManager api={api} />;
};

export class PluginChangeLogClient extends Plugin {
  async load() {
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

    this.app.pluginSettingsManager.add('ptdl-change-log', {
      title: t('Change Log'),
      icon: 'HistoryOutlined',
      Component: ChangeLogSettings,
    });

    // Register the record action on the classic lane's flow-engine (resolve ActionModel lazily).
    const fe: any = (this as any).flowEngine;
    const bind = (attempt = 0) => {
      const ActionBase = fe?.getModelClass?.('ActionModel');
      if (!ActionBase) {
        if (attempt < 10) setTimeout(() => bind(attempt + 1), 1000);
        return;
      }
      const ChangeHistoryActionModel = defineChangeHistoryAction(ActionBase);
      fe.registerModels({ ChangeHistoryActionModel });
      registerChangeHistoryBlock(fe);
    };
    bind();

    // eslint-disable-next-line no-console
    console.log('[change-log] client (classic lane) loaded');
  }
}

export default PluginChangeLogClient;
