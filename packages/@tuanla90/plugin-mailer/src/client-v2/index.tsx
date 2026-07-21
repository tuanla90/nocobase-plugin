// @tuanla90/shared's index (via FieldPickerCascader → ColorField) imports @formily/react; a direct entry
// import makes the bundler externalize it (NocoBase provides it at runtime) instead of bundling it. Same
// pattern as the other Formily-based @tuanla90 plugins.
import '@formily/react';
import React from 'react';
import { ActionModel, Plugin, useApp } from '@nocobase/client-v2';
import { setSharedT, SHARED_NS, sharedEnUS } from '@tuanla90/shared';
import { BackendConfig } from './BackendConfig';
import { TemplateManager } from './TemplateManager';
import { defineSendEmailActionModel } from './SendEmailAction';
import { setI18n, t, NS } from '../shared/mailerClient';
import enUS from '../locale/en-US.json';
import viVN from '../locale/vi-VN.json';

// @nocobase/client-v2 has no useAPIClient — the app's client lives on useApp().apiClient.
const BackendConfigTab: React.FC = () => {
  const app: any = useApp();
  return <BackendConfig api={app?.apiClient} />;
};
const TemplateManagerTab: React.FC = () => {
  const app: any = useApp();
  return <TemplateManager api={app?.apiClient} />;
};

export class PluginMailerClientV2 extends Plugin {
  async load() {
    setI18n((this.app as any).i18n);
    try {
      this.app.i18n.addResources('en-US', NS, enUS as any);
      this.app.i18n.addResources('vi-VN', NS, viVN as any);
      this.app.i18n.addResources('en-US', SHARED_NS, sharedEnUS as any);
      setSharedT((s, o) => this.app.i18n.t(s, { ns: SHARED_NS, ...(o || {}) }));
    } catch (e) {
      // ignore i18n load errors
    }

    // Record action: "Send email" in a table row / detail block's "Configure actions".
    try {
      const engine: any = (this as any).flowEngine || (this.app as any).flowEngine;
      const SendEmailActionModel = defineSendEmailActionModel(ActionModel);
      engine.registerModels({ SendEmailActionModel });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[mailer] record action registration failed', e);
    }

    // Settings screen: one menu item + two tabs (Backend config + Templates).
    const psm: any = this.app.pluginSettingsManager;
    psm?.addMenuItem?.({ key: 'ptdl-mailer', title: t('Mailer'), icon: 'MailOutlined' });
    psm?.addPageTabItem?.({ menuKey: 'ptdl-mailer', key: 'backend', title: t('Backend'), Component: BackendConfigTab });
    psm?.addPageTabItem?.({ menuKey: 'ptdl-mailer', key: 'templates', title: t('Templates'), Component: TemplateManagerTab });
  }
}

export default PluginMailerClientV2;
