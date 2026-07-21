import { Plugin } from '@nocobase/client-v2';
import { registerColumnResize } from '../shared/columnResize';

/**
 * Modern (/v/) lane — the real feature: patch TableBlockModel so every /v/ table gets drag-resizable
 * columns. Persisted per-block (shared), editable only with the UI editor on.
 */
export class PluginColumnResizeClientV2 extends Plugin {
  async load() {
    try {
      registerColumnResize({ flowEngine: (this as any).flowEngine });
      // eslint-disable-next-line no-console
      console.log('[col-resize] client-v2 loaded');
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[col-resize] register failed (ignored)', e);
    }
  }
}

export default PluginColumnResizeClientV2;
