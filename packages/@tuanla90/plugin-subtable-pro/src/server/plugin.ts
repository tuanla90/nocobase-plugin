import { Plugin } from '@nocobase/server';

/**
 * Sub-table Pro — server lane is a no-op.
 *
 * Everything ships on the client: the widget is a FieldModel subclass of the native SubTableFieldModel,
 * and the bridge is an in-memory client-side pub/sub. Submit goes through the standard collection
 * association API (inherited from the native sub-table), so no collection/schema/action is added here.
 * A server entry only exists so NocoBase can load the client bundles.
 */
export class PluginSubtableProServer extends Plugin {}

export default PluginSubtableProServer;
