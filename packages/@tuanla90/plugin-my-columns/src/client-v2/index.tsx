import { Plugin } from '@nocobase/client-v2';
import { tExpr } from '@nocobase/flow-engine';
import { NS, setMyColumnsI18n } from '../shared/i18n';
import { registerMyColumns, bumpAllSeenBlocks } from '../shared/myColumns';
import { loadMineCache } from '../shared/store';
import enUS from '../locale/en-US.json';

/**
 * Modern (/v/) lane — the real feature: PER-USER column settings for Table blocks.
 *
 *  - Loads the current user's saved layouts into a module cache (keyed by block uid).
 *  - Patches TableBlockModel.getColumns to hide / reorder / resize / pin columns per that cache.
 *  - Registers a "My columns" collection-scene action so every logged-in user can personalise a table.
 */
export class PluginMyColumnsClientV2 extends Plugin {
  async load() {
    // i18n — Vietnamese is the source (= the key); en-US.json maps to English. Unsupported languages fall
    // back to English; a vi identity map keeps vi-VN on the Vietnamese keys. Mirrors the repo standard.
    try {
      this.app.i18n.addResources('en-US', NS, enUS as any);
      const _id = (m: any) => Object.fromEntries(Object.keys(m || {}).map((k) => [k, k]));
      this.app.i18n.addResources('vi-VN', NS, _id(enUS));
      const _i: any = this.app.i18n;
      _i.options.fallbackLng = 'en-US';
      if (_i.services?.languageUtils?.options) _i.services.languageUtils.options.fallbackLng = 'en-US';
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[my-columns] i18n addResources failed', e);
    }
    setMyColumnsI18n(this.app.i18n);

    const api: any = (this as any).app?.apiClient;
    const flowEngine = (this as any).flowEngine;

    // Patch getColumns + register the action model.
    try {
      registerMyColumns({ flowEngine, app: (this as any).app, api, tExpr });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[my-columns] register failed (ignored)', e);
    }

    // Load the current user's saved layouts, then force any already-mounted tables to re-apply them.
    try {
      loadMineCache(api).then(() => {
        try {
          bumpAllSeenBlocks();
        } catch (_) {
          /* ignore */
        }
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[my-columns] cache load failed (ignored)', e);
    }

    // eslint-disable-next-line no-console
    console.log('[my-columns] client-v2 loaded (per-user columns: hide/reorder/width/pin)');
  }
}

export default PluginMyColumnsClientV2;
