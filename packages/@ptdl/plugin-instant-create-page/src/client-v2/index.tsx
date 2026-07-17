/**
 * Instant Create Page — modern (`/v/`) lane. This is the only lane where the tool works: creating a page means
 * building a FlowModel tree (RootPageModel → … → TableBlockModel) and a `desktopRoutes` row, which is
 * a FlowEngine concept. Registers a settings page + a floating launcher, both rendering QuickCreateForm.
 *
 * Without this lane (and the root `client-v2.js` marker) the modern client's pm:listEnabledV2 skips the
 * plugin entirely, so nothing renders on `/v/`.
 */
import React from 'react';
import { Plugin, useApp } from '@nocobase/client-v2';
import { QuickCreateForm } from '../shared/QuickCreateForm';
import { createLauncher } from '../shared/Launcher';
import enUS from '../locale/en-US.json';
import viVN from '../locale/vi-VN.json';

const NS = '@ptdl/plugin-instant-create-page/client';

export class PluginInstantCreatePageClientV2 extends Plugin {
  async load() {
    // This plugin renders only plain antd (no @ptdl/shared UI), so it needs no SHARED_NS wiring — and
    // importing @ptdl/shared at all would pull settingsKit's @formily/react into the bundle.
    try {
      this.app.i18n.addResources('en-US', NS, enUS);
      this.app.i18n.addResources('vi-VN', NS, viVN);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[instant-create-page] i18n addResources failed', e);
    }
    const t = (s: string, opts?: Record<string, any>) => this.app.i18n.t(s, { ns: NS, ...(opts || {}) });

    // 1) Settings page: Settings → Quick create page.
    const SettingsComponent: React.FC = () => {
      const app = useApp();
      return <QuickCreateForm app={app} t={t} />;
    };
    this.app.pluginSettingsManager.addMenuItem({ key: 'instant-create-page', title: t('Quick create page'), icon: 'PlusSquareOutlined' });
    this.app.pluginSettingsManager.addPageTabItem({ menuKey: 'instant-create-page', key: 'index', Component: SettingsComponent });

    // 2) One-click launcher floating button, reachable from anywhere in the app.
    const Launcher = createLauncher({ app: this.app, t });
    this.app.addProvider(Launcher);
  }
}

export default PluginInstantCreatePageClientV2;
