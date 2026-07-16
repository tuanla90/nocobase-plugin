import { Plugin } from '@nocobase/client';
import React from 'react';
import { initSkinUi, loadAndApplySkin } from '../shared/skin';
import { initNavUi, loadAndApplyNav } from '../shared/headerNav';
import { initTypographyUi, loadAndApplyTypography } from '../shared/typography';
import { initBackupUi } from '../shared/backup';
import { BrandingPage } from '../shared/brandingPage';
import viVN from '../locale/vi-VN.json';
import enUS from '../locale/en-US.json';

const NS = '@ptdl/plugin-branding/client';

// Classic lane (/admin). Same skin injection; register the settings page if available.
export class PluginBrandingClient extends Plugin {
  async load() {
    const app: any = this.app;
    app?.i18n?.addResources?.('vi-VN', NS, viVN);
    app?.i18n?.addResources?.('en-US', NS, enUS);
    const t = (s: string) => {
      try {
        return app?.i18n?.t(s, { ns: NS }) || s;
      } catch (e) {
        return s;
      }
    };
    initSkinUi({ apiClient: app?.apiClient, t });
    initNavUi({ apiClient: app?.apiClient, t });
    initTypographyUi({ apiClient: app?.apiClient, t });
    initBackupUi({ apiClient: app?.apiClient, t });
    loadAndApplySkin(app?.apiClient);
    loadAndApplyNav(app?.apiClient);
    loadAndApplyTypography(app?.apiClient);
    app?.pluginSettingsManager?.add?.('branding', {
      title: t('Branding & Theme'),
      icon: 'BgColorsOutlined',
      Component: () => React.createElement(BrandingPage, { t, apiClient: app?.apiClient }),
    });
  }
}

export default PluginBrandingClient;
