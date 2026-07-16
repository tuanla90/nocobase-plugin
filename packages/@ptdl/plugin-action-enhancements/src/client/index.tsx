import { Plugin } from '@nocobase/client';
import { tExpr } from '@nocobase/flow-engine';
import { registerAll } from '../shared/registerAll';

// Classic lane (/admin). Same registration path as /v/ — classic pages can host flow-engine blocks too,
// so the ActionModel patch applies here as well (resolves the class lazily; no-op if absent).
export class PluginActionEnhancementsClient extends Plugin {
  async load() {
    registerAll({
      flowEngine: (this as any).flowEngine,
      i18n: (this as any).app?.i18n,
      tExpr,
      lane: 'client',
    });
  }
}

export default PluginActionEnhancementsClient;
