import { Plugin } from '@nocobase/client-v2';
import React from 'react';
import { initSkinUi, loadAndApplySkin } from '../shared/skin';
import { initNavUi, loadAndApplyNav } from '../shared/headerNav';
import { initTypographyUi, loadAndApplyTypography } from '../shared/typography';
import { initBackupUi } from '../shared/backup';
import { BrandingPage } from '../shared/brandingPage';
import viVN from '../locale/vi-VN.json';
import enUS from '../locale/en-US.json';

const NS = '@tuanla90/plugin-branding/client';

export class PluginBrandingClientV2 extends Plugin {
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
    // Apply the saved skin + header/nav + typography config app-wide on startup.
    loadAndApplySkin(app?.apiClient);
    loadAndApplyNav(app?.apiClient);
    loadAndApplyTypography(app?.apiClient);
    // Settings page: Branding & Theme. client-v2 replaces v1's pluginSettingsManager.add(name, opts)
    // with addMenuItem + addPageTabItem — the (Skin | Header/Logo) tabs live inside BrandingPage.
    const psm = app?.pluginSettingsManager;
    psm?.addMenuItem?.({ key: 'branding', title: t('Branding & Theme'), icon: 'BgColorsOutlined' });
    psm?.addPageTabItem?.({
      menuKey: 'branding',
      key: 'index',
      Component: () => React.createElement(BrandingPage, { t, apiClient: app?.apiClient }),
    });
  }
}

export default PluginBrandingClientV2;
