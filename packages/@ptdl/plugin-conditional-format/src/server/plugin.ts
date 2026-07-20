import { Plugin } from '@nocobase/server';

/**
 * Conditional Format server.
 *
 * Block-level formatting is 100% client-side (rules live on the TableBlockModel). This server only
 * holds the GLOBAL (field-level) rules — "set once per collection, applies in every view" — in the app
 * DB collection `ptdlFieldFormatRules` (one row per data-source + collection). The client loads them
 * into a cache at startup and writes via `ptdlFieldFormatRules:updateOrCreate`.
 *
 * Mirrors custom-header's `ptdlFieldStyles` blueprint, but the payload is the full rule-set
 * (Rule[] JSON — same shape as a block's `ptdlCondRules`) rather than a single style.
 */
export class PluginConditionalFormatServer extends Plugin {
  async beforeLoad() {
    this.db.collection({
      name: 'ptdlFieldFormatRules',
      title: 'Field format rules',
      fields: [
        { type: 'string', name: 'dataSource', defaultValue: 'main' },
        { type: 'string', name: 'collectionName' },
        // The full rule array (condition / colorScale / dataBar rules with targets, colours, icon…).
        { type: 'json', name: 'rules', defaultValue: [] },
      ],
    });

    // Logged-in users (admins configuring the UI) can read + write the global rules.
    this.app.acl.allow(
      'ptdlFieldFormatRules',
      ['list', 'get', 'create', 'update', 'updateOrCreate', 'destroy'],
      'loggedIn',
    );
  }

  async install() {
    await this.db.sync();
  }

  async afterEnable() {
    try {
      await this.db.sync();
    } catch (e) {
      this.app.logger?.warn?.('[cond-fmt] sync failed: ' + (e as any)?.message);
    }
  }

  async load() {
    // Ensure the table exists even when the plugin was installed/enabled before this collection was
    // added (install()/afterEnable() don't re-run on a plain restart).
    try {
      await this.db.getCollection('ptdlFieldFormatRules')?.sync?.();
    } catch (e) {
      this.app.logger?.warn?.('[cond-fmt] ptdlFieldFormatRules sync failed: ' + (e as any)?.message);
    }
  }
}

export default PluginConditionalFormatServer;
