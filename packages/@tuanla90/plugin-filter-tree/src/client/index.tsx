import { Plugin, icons, Icon } from '@nocobase/client';
import { tExpr } from '@nocobase/flow-engine';
import { registerFilterTree, NS } from '../shared/filterTree';
import viVN from '../locale/vi-VN.json';

// Classic lane (/admin). It also runs the FlowEngine (same models resolvable via getModelClass), so we
// register the block here too. If this lane's flowEngine has no FilterBlockModel, registerFilterTree
// no-ops with a warning.
export class PluginFilterTreeClient extends Plugin {
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
    console.log('[filter-tree] client (classic lane) loaded');
  }
}

export default PluginFilterTreeClient;
