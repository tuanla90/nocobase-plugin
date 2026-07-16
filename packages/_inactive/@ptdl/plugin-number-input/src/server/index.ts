import { Plugin } from '@nocobase/server';

/**
 * Server side is intentionally empty.
 * All logic (field interface + input component) lives on the client.
 * NocoBase still requires a server Plugin entry so the package can be
 * added and enabled from the Plugin Manager.
 */
export class PluginNumberInputServer extends Plugin {
  async load() {}
}

export default PluginNumberInputServer;
