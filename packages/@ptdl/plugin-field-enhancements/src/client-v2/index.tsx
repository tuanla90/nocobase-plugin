import { Plugin, FieldModel, Icon, icons, RecordSelectFieldModel, DisplayTextFieldModel } from '@nocobase/client-v2';
import { tExpr, CollectionFieldModel } from '@nocobase/flow-engine';
import { registerAllFieldModels } from '../shared/registerAll';

// Modern lane (/v/). All widget registration lives in the shared registerAllFieldModels() so the two lanes
// can't drift; only the lane-specific base classes (imported from @nocobase/client-v2) differ.
export class PluginFieldEnhancementsClientV2 extends Plugin {
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
      RecordSelectFieldModelImport: RecordSelectFieldModel,
      i18n: (this as any).app?.i18n,
      lane: 'client-v2',
    });
  }
}

export default PluginFieldEnhancementsClientV2;
