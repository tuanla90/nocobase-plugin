import { Plugin } from '@nocobase/client';

/**
 * Classic (/admin) lane — intentional NO-OP.
 *
 * Per-user columns is a /v/-only feature (it patches the modern TableBlockModel). But a /v/-only plugin
 * MUST still ship a classic `dist/client/index.js`: without it the modern client's RequireJS loader fails
 * to resolve the client bundle and white-screens the WHOLE app. So this lane exists and does nothing.
 */
export class PluginMyColumnsClient extends Plugin {
  async load() {
    // eslint-disable-next-line no-console
    console.log('[my-columns] client (classic lane) no-op loaded');
  }
}

export default PluginMyColumnsClient;
