import { Plugin } from '@nocobase/server';

/**
 * Custom Header server. Holds the FIELD-LEVEL default styles ("set once, shows in every view"),
 * stored in the app DB collection `ptdlFieldStyles` (one row per data-source+collection+field).
 * The client reads them into a cache at startup and writes via `ptdlFieldStyles:updateOrCreate`.
 */
export class PluginCustomHeaderServer extends Plugin {
  async beforeLoad() {
    this.db.collection({
      name: 'ptdlFieldStyles',
      fields: [
        { type: 'string', name: 'dataSource', defaultValue: 'main' },
        { type: 'string', name: 'collectionName' },
        { type: 'string', name: 'fieldName' },
        { type: 'string', name: 'icon' },
        { type: 'string', name: 'iconPosition', defaultValue: 'left' },
        { type: 'string', name: 'color' },
        { type: 'boolean', name: 'bold', defaultValue: false },
      ],
    });

    // Logged-in users (admins configuring the UI) can read + write field-level styles.
    this.app.acl.allow('ptdlFieldStyles', ['list', 'get', 'create', 'update', 'updateOrCreate', 'destroy'], 'loggedIn');
  }

  async install() {
    await this.db.sync();
  }

  async afterEnable() {
    try {
      await this.db.sync();
    } catch (e) {
      this.app.logger?.warn?.('[custom-header] sync failed: ' + (e as any)?.message);
    }
  }

  async load() {
    // Ensure the table exists even when the plugin was already installed/enabled before this
    // collection was added (install()/afterEnable() won't re-run on a plain restart).
    try {
      await this.db.getCollection('ptdlFieldStyles')?.sync?.();
    } catch (e) {
      this.app.logger?.warn?.('[custom-header] ptdlFieldStyles sync failed: ' + (e as any)?.message);
    }
  }
}

export default PluginCustomHeaderServer;
