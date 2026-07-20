import { Plugin } from '@nocobase/server';

/**
 * Filter tree — server lane is a no-op. Group counts come from the target collection's own `:query`
 * action (GROUP BY), and filtering reuses the client-side FilterManager. No collection/schema added.
 */
export class PluginFilterTreeServer extends Plugin {}

export default PluginFilterTreeServer;
