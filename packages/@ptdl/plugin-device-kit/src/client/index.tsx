import { Plugin, FieldModel, DisplayTextFieldModel } from '@nocobase/client';
import { tExpr } from '@nocobase/flow-engine';
import { registerDeviceKit } from '../shared/registerAll';

/**
 * Classic lane (/admin). Same registration path as /v/ via shared registerDeviceKit(). The classic
 * client does NOT export CollectionFieldInterface, so the custom `ptdlLocation` Add-field entry is
 * skipped here (guarded) — but the widgets still bind to the `json` interface as a Field component,
 * and the camera widget binds to `attachment`. The modern /v/ lane is where the custom interface lives.
 */
export class PluginDeviceKitClient extends Plugin {
  async load() {
    registerDeviceKit({
      flowEngine: (this as any).flowEngine,
      flowSettings: (this as any).flowEngine?.flowSettings,
      FieldModel,
      DisplayTextFieldModel,
      CollectionFieldInterface: undefined,
      tExpr,
      app: (this as any).app,
      i18n: (this as any).app?.i18n,
      lane: 'client',
    });
  }
}

export default PluginDeviceKitClient;
