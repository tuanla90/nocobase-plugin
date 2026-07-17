/**
 * App Builder — classic (`/admin`) lane: intentionally a no-op. The compiler builds `/v/` FlowModel pages,
 * which only exist on the modern client, so there is nothing to render on the classic client. We keep a
 * valid Plugin (and the `client.js` marker) so the package loads cleanly on both lanes.
 */
import { Plugin } from '@nocobase/client';

export class PluginAppBuilderClient extends Plugin {
  async load() {
    // no classic-lane UI — see ../client-v2 for the real implementation
  }
}

export default PluginAppBuilderClient;
