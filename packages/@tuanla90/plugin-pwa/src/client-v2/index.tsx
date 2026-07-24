import React from 'react';
import { Icon, Plugin, icons, useApp } from '@nocobase/client-v2';
import { setIconRegistry } from '@tuanla90/shared';
import { createPwaSettings, startPwa } from '../shared/pwa';
import { createMobileShell } from '../shared/mobileShell';
import { initInstallCapture } from '../shared/installPrompt';
import { PwaAvatarPanel } from '../shared/avatarPanel';
import { getPwaConfig } from '../shared/configStore';
import { NS, setRuntimeT, t } from '../shared/i18n';
import enUS from '../locale/en-US.json';
import viVN from '../locale/vi-VN.json';

// Modern lane (`/v/`). @nocobase/client-v2 has no useAPIClient — use useApp().apiClient. Without
// this lane (and a root `client-v2.js` marker) the modern client skips the plugin, so the PWA
// manifest is never injected, the mobile shell never mounts, and the settings page never appears.
const useApiClientV2 = () => (useApp() as any).apiClient;
// Framework navigate — RouterManager.navigate; react-router re-adds the `/v` basename to `/admin/…`.
const useNavigateV2 = () => {
  const app: any = useApp();
  return (path: string) => app?.router?.navigate?.(path);
};

// Register a UserCenter (avatar dropdown) item that renders the nav shortcuts / install suggestion
// when they're configured to live in the avatar menu. The core item base classes aren't exported, so
// resolve one at runtime from the flow engine and subclass it. Fully guarded — if the internal API
// differs, the avatar placement just no-ops and every other placement still works.
function registerAvatarShortcuts(app: any) {
  try {
    const fe = app?.flowEngine;
    if (!fe?.getModelClass || !fe?.registerModels) return;
    const Base = fe.getModelClass('UserCenterActionItemModel') || fe.getModelClass('UserCenterItemModel');
    if (!Base) return;

    class PwaAvatarShortcutsModel extends Base {
      static itemId = 'pwa-shortcuts';
      section = 'preferences';
      sort = 40;
      ready = true;

      isVisible() {
        const c = getPwaConfig();
        const navOk =
          !!c.bottomBar?.enabled &&
          c.bottomBar?.placement === 'avatar' &&
          (c.bottomBar?.items || []).some((i: any) => i && i.schemaUid);
        const insOk = c.install?.position === 'avatar' && c.install?.enabled !== false;
        return !!(navOk || insOk);
      }

      render() {
        return <PwaAvatarPanel closeDropdown={(this as any).closeDropdown} />;
      }
    }

    fe.registerModels({ PwaAvatarShortcutsModel });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[pwa] avatar shortcuts registration failed', e);
  }
}

export class PluginPwaClientV2 extends Plugin {
  async load() {
    // i18n first — register EN identity + VI resources and the runtime translator before any t() use.
    try {
      this.app.i18n.addResources('en-US', NS, enUS as any);
      this.app.i18n.addResources('vi-VN', NS, viVN as any);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[pwa] i18n addResources failed', e);
    }
    setRuntimeT((s, o) => this.app.i18n.t(s, { ns: NS, ...(o || {}) }));

    // Feed the @tuanla90/shared icon registry so the bars / icon picker resolve route icons.
    try {
      setIconRegistry(Icon, icons);
    } catch (e) {
      // ignore
    }

    startPwa((this as any).app);
    initInstallCapture();

    // App-wide mobile shell: portals the nav bar / FAB + install suggestion onto document.body.
    try {
      const Shell = createMobileShell({ useApiClient: useApiClientV2, useNavigate: useNavigateV2 });
      (this as any).app.addProvider(Shell);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[pwa] client-v2 mobile shell registration failed', e);
    }

    registerAvatarShortcuts((this as any).app);

    try {
      const psm: any = (this as any).pluginSettingsManager;
      const Pane = createPwaSettings({ useApiClient: useApiClientV2 });
      psm.addMenuItem({ key: 'pwa', title: t('PWA'), icon: 'MobileOutlined' });
      psm.addPageTabItem({ menuKey: 'pwa', key: 'index', Component: Pane });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[pwa] client-v2 settings registration failed', e);
    }
  }
}

export default PluginPwaClientV2;
