import { Plugin } from '@nocobase/server';

/**
 * Global Search server. Owns the `globalSearchConfig` collection — a tiny key/value store
 * (name → json) holding the plugin's SHARED, system-wide configuration so every user/browser
 * sees the same search scope, view-links and header-pill appearance instead of a per-browser
 * localStorage copy. Keys: `targets`, `viewlinks`, `appearance`.
 *
 * ACL: list/get/create/update/destroy are opened to every logged-in user (mirrors the
 * `custom-icons` plugin's `ptdlIconRemaps`). This is low-stakes — the Settings screen that writes
 * it is admin-only UI, and search results themselves still pass each collection's own ACL
 * (runSearch → resource.list), so a tampered target list can never leak data a user couldn't
 * already read.
 */
export class PluginGlobalSearchServer extends Plugin {
  async beforeLoad() {
    this.db.collection({
      name: 'globalSearchConfig',
      fields: [
        { type: 'string', name: 'name', unique: true },
        { type: 'json', name: 'value' },
      ],
    });
    this.app.acl.allow('globalSearchConfig', ['list', 'get', 'create', 'update', 'updateOrCreate', 'destroy'], 'loggedIn');
  }

  private async ensureTable() {
    try {
      await this.db.getCollection('globalSearchConfig')?.sync?.();
    } catch (e) {
      this.app.logger?.warn?.('[global-search] globalSearchConfig sync failed: ' + (e as any)?.message);
    }
  }

  async install() {
    await this.ensureTable();
  }

  async afterEnable() {
    await this.ensureTable();
  }

  async load() {
    await this.ensureTable();
  }
}

export default PluginGlobalSearchServer;
