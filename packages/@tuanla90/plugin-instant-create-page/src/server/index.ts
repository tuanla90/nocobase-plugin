/**
 * Instant Create Page — server. Nothing to persist of our own: generated pages live in NocoBase's core
 * `desktopRoutes` + `flowModels` collections (written from the client via their normal REST APIs,
 * which enforce the caller's ACL). So the server side is enable-only.
 */
import { Plugin } from '@nocobase/server';

export class PluginInstantCreatePageServer extends Plugin {
  async load() {
    // no-op: page/route creation happens client-side against core collections
  }
}

export default PluginInstantCreatePageServer;
