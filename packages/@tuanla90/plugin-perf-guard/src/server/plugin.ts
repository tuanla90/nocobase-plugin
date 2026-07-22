import { Plugin } from '@nocobase/server';

/**
 * Performance & Stability — server shell.
 *
 * This plugin is entirely CLIENT-SIDE (both fixes patch the modern /v/ client at runtime):
 *   - keep-alive cap  → caps NocoBase v2's unbounded sub-page keep-alive (DOM-leak → render lag).
 *   - crash guard     → isolates a broken column's `beforeRender` so it can't freeze the whole app.
 *
 * There is NO server collection and NO settings persisted server-side — the toggle/threshold live in
 * the browser (localStorage, per-user). This server class exists only so NocoBase recognises the
 * package as a valid plugin and loads its client lanes. Keeping it a no-op means installing/enabling
 * the plugin never touches the DB and needs no migration.
 */
export class PluginPerfGuardServer extends Plugin {
  async load() {
    // no-op — see the class comment. All behaviour is in src/client-v2 (and a no-op classic lane).
  }
}

export default PluginPerfGuardServer;
