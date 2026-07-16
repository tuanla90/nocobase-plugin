import { Plugin } from '@nocobase/server';

/**
 * Field enhancements — server lane is a no-op.
 *
 * Everything ships on the client: the RunJS snippet library is registered into the flow-engine
 * snippet registry (client-side, in-memory), and future no-code field widgets are field models
 * registered on the client too. No collection/schema/API is added here — this plugin only needs
 * a server entry so NocoBase can load its client bundles.
 */
export class PluginFieldEnhancementsServer extends Plugin {}

export default PluginFieldEnhancementsServer;
