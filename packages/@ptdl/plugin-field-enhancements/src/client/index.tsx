import { Plugin, FieldModel, Icon, icons, DisplayTextFieldModel } from '@nocobase/client';
import { tExpr, CollectionFieldModel } from '@nocobase/flow-engine';
import { registerAllFieldModels } from '../shared/registerAll';

// Classic lane (/admin). Same registration path as /v/ — see registerAllFieldModels(). The classic client
// does not export RecordSelectFieldModel, so richSelect resolves its base from the engine only.
export class PluginFieldEnhancementsClient extends Plugin {
  async load() {
    registerAllFieldModels({
      flowEngine: (this as any).flowEngine,
      flowSettings: (this as any).flowEngine?.flowSettings,
      FieldModel,
      DisplayTextFieldModel,
      CollectionFieldModel,
      tExpr,
      Icon,
      icons,
      i18n: (this as any).app?.i18n,
      lane: 'client',
    });
  }
}

export default PluginFieldEnhancementsClient;
