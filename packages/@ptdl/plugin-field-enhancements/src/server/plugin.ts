import { Plugin } from '@nocobase/server';

/**
 * Field enhancements server.
 *
 * Most of the plugin ships on the client (RunJS snippets + no-code field models). The only server piece
 * is the GLOBAL (field-level) widget store: collection `ptdlFieldWidget`, one row per
 * data-source + collection + field, holding which display widget + its config applies to that field in
 * EVERY view ("set once, shows everywhere"). The client loads these into a cache at startup and writes
 * via `ptdlFieldWidget:updateOrCreate`. Same blueprint as conditional-format's `ptdlFieldFormatRules`
 * and custom-header's `ptdlFieldStyles`.
 */
export class PluginFieldEnhancementsServer extends Plugin {
  async beforeLoad() {
    this.db.collection({
      name: 'ptdlFieldWidget',
      title: 'Field widgets (global)',
      fields: [
        { type: 'string', name: 'dataSource', defaultValue: 'main' },
        { type: 'string', name: 'collectionName' },
        { type: 'string', name: 'fieldName' },
        { type: 'string', name: 'widgetModel' }, // e.g. 'PtdlConditionalStatusFieldModel'
        { type: 'json', name: 'config', defaultValue: {} }, // the widget's props (ptdl* keys)
      ],
    });
    this.app.acl.allow(
      'ptdlFieldWidget',
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
      this.app.logger?.warn?.('[field-enh] sync failed: ' + (e as any)?.message);
    }
  }

  async load() {
    try {
      await this.db.getCollection('ptdlFieldWidget')?.sync?.();
    } catch (e) {
      this.app.logger?.warn?.('[field-enh] ptdlFieldWidget sync failed: ' + (e as any)?.message);
    }
  }
}

export default PluginFieldEnhancementsServer;
