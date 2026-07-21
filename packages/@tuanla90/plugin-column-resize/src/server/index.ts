import { Plugin } from '@nocobase/server';

/**
 * Server lane — no server logic (widths persist through the block model's normal save path, client-side).
 * Ships only so the plugin has a valid server entry.
 */
export class PluginColumnResizeServer extends Plugin {}

export default PluginColumnResizeServer;
