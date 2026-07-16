import { Plugin } from '@nocobase/server';

/**
 * Action button enhancements — server lane is a no-op.
 *
 * Everything ships on the client: we patch the native flow-engine ActionModel (deep colour) and the
 * block models that host the action bar (layout). No collection/schema/API is added — the server entry
 * only exists so NocoBase can load the client bundles.
 */
export class PluginActionEnhancementsServer extends Plugin {}

export default PluginActionEnhancementsServer;
