import { Plugin, icons, Icon } from '@nocobase/client-v2';
import { tExpr } from '@nocobase/flow-engine';
import { registerFilterTree, NS } from '../shared/filterTree';
import viVN from '../locale/vi-VN.json';

export class PluginFilterTreeClientV2 extends Plugin {
  async load() {
    const app: any = (this as any).app;
    try {
      app.i18n.addResources('vi-VN', NS, viVN);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[filter-tree] i18n addResources failed', e);
    }
    registerFilterTree({ flowEngine: (this as any).flowEngine, api: app?.apiClient, app, Icon, icons, tExpr });
    // eslint-disable-next-line no-console
    console.log('[filter-tree] client-v2 loaded');
  }
}

export default PluginFilterTreeClientV2;
