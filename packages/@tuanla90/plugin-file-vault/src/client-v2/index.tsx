import React from 'react';
import { Plugin, useApp, Icon, icons } from '@nocobase/client-v2';
import { setSharedT, SHARED_NS, sharedEnUS } from '@tuanla90/shared';
import { FileVaultPane } from '../shared/FileVaultPane';
import { setI18n, t, NS } from '../shared/fileVaultClient';
import enUS from '../locale/en-US.json';
import viVN from '../locale/vi-VN.json';

// Modern lane (`/v/`): the File Vault settings page, registered via addMenuItem + addPageTabItem.
// [[reference_nocobase_settings_page_lane_api]]
// Pass the host `Icon` component + `icons` registry so the pane can render Lucide-by-key (guarded by
// icons.has(), inline-SVG fallback) — the established @tuanla90 custom-icons pattern.
const FileVaultSettings: React.FC = () => {
  const app: any = useApp();
  return <FileVaultPane api={app?.apiClient} Icon={Icon} icons={icons} />;
};

export class PluginFileVaultClientV2 extends Plugin {
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

    const psm: any = this.app.pluginSettingsManager;
    psm?.addMenuItem?.({ key: 'ptdl-file-vault', title: t('File Vault'), icon: 'FolderOpenOutlined' });
    psm?.addPageTabItem?.({ menuKey: 'ptdl-file-vault', key: 'index', Component: FileVaultSettings });
  }
}

export default PluginFileVaultClientV2;
