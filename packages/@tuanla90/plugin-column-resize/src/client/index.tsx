import { Plugin } from '@nocobase/client';

/**
 * Classic (/admin) lane — intentional NO-OP. Column drag-resize targets the /v/ flow-engine TableBlockModel
 * only. This empty Plugin (+ the dist/client marker) must still ship: a /v/-only plugin with no classic
 * client bundle 404s the classic shell and RequireJS white-screens the whole app.
 */
export class PluginColumnResizeClient extends Plugin {
  async load() {
    /* no-op on classic */
  }
}

export default PluginColumnResizeClient;
