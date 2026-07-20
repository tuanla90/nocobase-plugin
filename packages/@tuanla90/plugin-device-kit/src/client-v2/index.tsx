import { Plugin, FieldModel, DisplayTextFieldModel, CollectionFieldInterface } from '@nocobase/client-v2';
import { tExpr } from '@nocobase/flow-engine';
import { registerDeviceKit } from '../shared/registerAll';

/**
 * Modern lane (/v/). All widget registration lives in shared registerDeviceKit(); only the
 * lane-specific base classes (from @nocobase/client-v2) differ. This is the primary lane —
 * the custom `ptdlLocation` field interface is registered here via app.addFieldInterfaces.
 */
export class PluginDeviceKitClientV2 extends Plugin {
  async load() {
    registerDeviceKit({
      flowEngine: (this as any).flowEngine,
      flowSettings: (this as any).flowEngine?.flowSettings,
      FieldModel,
      DisplayTextFieldModel,
      CollectionFieldInterface,
      tExpr,
      app: (this as any).app,
      i18n: (this as any).app?.i18n,
      lane: 'client-v2',
    });
  }
}

export default PluginDeviceKitClientV2;
