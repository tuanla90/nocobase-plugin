import { Plugin } from '@nocobase/server';

// Empty server — all logic is client-side (icon registry + FlowEngine field model).
export class PluginIconKitServer extends Plugin {
  async load() {}
}

export default PluginIconKitServer;
