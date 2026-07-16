import { Plugin } from '@nocobase/client-v2';
import { tExpr } from '@nocobase/flow-engine';
import { registerAll } from '../shared/registerAll';

// Modern lane (/v/). All registration lives in the shared registerAll() so the two lanes can't drift.
export class PluginActionEnhancementsClientV2 extends Plugin {
  async load() {
    registerAll({
      flowEngine: (this as any).flowEngine,
      i18n: (this as any).app?.i18n,
      tExpr,
      lane: 'client-v2',
    });
  }
}

export default PluginActionEnhancementsClientV2;
