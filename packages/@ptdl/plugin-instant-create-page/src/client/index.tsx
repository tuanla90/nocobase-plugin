/**
 * Instant Create Page — classic (`/admin`) lane: intentionally a no-op. The tool builds a `/v/` FlowModel page
 * tree, which only exists on the modern client, so there is nothing meaningful to render on the classic
 * client. We keep a valid Plugin (and the `client.js` marker) so the package loads cleanly on both.
 */
import { Plugin } from '@nocobase/client';

export class PluginInstantCreatePageClient extends Plugin {
  async load() {
    // no classic-lane UI — see ../client-v2 for the real implementation
  }
}

export default PluginInstantCreatePageClient;
