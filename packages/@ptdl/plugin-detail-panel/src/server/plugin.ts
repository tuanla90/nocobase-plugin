import { Plugin } from '@nocobase/server';

/**
 * Detail Panel — server lane is a no-op.
 *
 * Everything ships on the client: a flow registered on the native /v/ TableBlockModel listens to its
 * `rowClick` event and opens the clicked record in NocoBase's built-in embed side container. No
 * collection, action or schema is added. A server entry only exists so NocoBase can load the client
 * bundles.
 */
export class PluginDetailPanelServer extends Plugin {}

export default PluginDetailPanelServer;
