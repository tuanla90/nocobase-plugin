import { Plugin } from '@nocobase/server';
import { exportAction } from './actions/export';
import { importAction } from './actions/import';
import { listCollectionsAction } from './actions/listCollections';
import { infoAction } from './actions/info';
import { selfUpdateAction } from './actions/selfUpdate';

/**
 * NB Cloner server — exposes the `nbCloner` resource used by the settings page:
 *   listCollections · export · import · info · selfUpdate
 *
 * The export/import/selfUpdate actions are powerful (they read every business table, write the
 * target's schema/UI/roles, and can overwrite the plugin's own code). They are granted to `loggedIn`
 * — the same house pattern every @ptdl settings plugin uses (see plugin-ip-guard) — and the UI is
 * reached only through the admin-gated Settings surface. Restrict the tool further via NocoBase roles
 * if untrusted users can sign in. See README → "Security".
 */
export class PluginNbClonerServer extends Plugin {
  async afterAdd() {}

  async beforeLoad() {}

  async load() {
    // Register API endpoints
    this.app.resource({
      name: 'nbCloner',
      actions: {
        listCollections: listCollectionsAction,
        export: exportAction,
        import: importAction,
        info: infoAction,
        selfUpdate: selfUpdateAction,
      },
    });

    // Custom resource + system-table access → not covered by the admin role strategy, so grant the
    // authenticated user explicitly. [[reference_nocobase_acl_system_collection_writes]]
    this.app.acl.allow('nbCloner', ['listCollections', 'export', 'import', 'info', 'selfUpdate'], 'loggedIn');
  }

  async install() {}
  async afterEnable() {}
  async afterDisable() {}
  async remove() {}
}

export default PluginNbClonerServer;
