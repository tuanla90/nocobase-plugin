import { Plugin } from '@nocobase/server';

// Server side is intentionally empty for the PoC — all logic is client-side
// (FlowEngine field model). Kept so the plugin has a valid server entry.
export class PluginConditionalFormatServer extends Plugin {
  async load() {}
}

export default PluginConditionalFormatServer;
