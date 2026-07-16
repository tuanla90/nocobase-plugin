import { Plugin } from '@nocobase/server';

const RESOURCE = 'ptdlTabStyleSettings';

/**
 * Block Tabs server. Holds the APP-WIDE default tab style ("apply global": admin sets it once and
 * every user sees it) in the DB collection `ptdlTabStyleSettings` — a single row `key='global'`
 * whose `config` JSON is the style. The client reads it into a cache at startup and writes it via
 * `ptdlTabStyleSettings:updateOrCreate`. Tabs/nested blocks themselves persist in the flowModels
 * tree; only this shared default lives here.
 */
export class PluginBlockTabsServer extends Plugin {
  async beforeLoad() {
    this.db.collection({
      name: RESOURCE,
      fields: [
        // NOTE: avoid the column name `key` — it is a reserved SQL keyword and breaks queries.
        { type: 'string', name: 'settingKey', unique: true },
        { type: 'json', name: 'config' },
      ],
    });

    // Logged-in users can read + write. In practice only UI-editors reach the write path (the
    // "Apply to all default tabs" toggle is shown only in editor mode). To hard-restrict writing to
    // specific roles, deny `ptdlTabStyleSettings` create/update to other roles in the Roles settings.
    // (An ACL-only "admin can write" isn't reliable here — the app's admin is not a bypass-root role,
    // so a read-only-for-loggedIn rule blocks the admin's own save too.)
    this.app.acl.allow(RESOURCE, ['list', 'get', 'create', 'update', 'updateOrCreate', 'destroy'], 'loggedIn');
  }

  async install() {
    await this.db.sync();
  }

  async afterEnable() {
    try {
      await this.db.sync();
    } catch (e) {
      this.app.logger?.warn?.('[block-tabs] sync failed: ' + (e as any)?.message);
    }
  }

  async load() {
    // Ensure the table exists even when the plugin was already installed before this collection was
    // added (install()/afterEnable() won't re-run on a plain restart).
    try {
      await this.db.getCollection(RESOURCE)?.sync?.();
    } catch (e) {
      this.app.logger?.warn?.('[block-tabs] ' + RESOURCE + ' sync failed: ' + (e as any)?.message);
    }
  }
}

export default PluginBlockTabsServer;
