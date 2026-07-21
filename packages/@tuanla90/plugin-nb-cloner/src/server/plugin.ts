import { Plugin } from '@nocobase/server';
import { exportAction } from './actions/export';
import { importAction } from './actions/import';
import { previewImportAction } from './actions/previewImport';
import { listCollectionsAction } from './actions/listCollections';
import { deleteCollectionsAction } from './actions/deleteCollections';
import { infoAction } from './actions/info';

/**
 * NB Cloner server — exposes the `nbCloner` resource used by the settings page:
 *   listCollections · export · import · previewImport · deleteCollections · info
 *
 * The export/import actions are powerful (export reads every business table; import writes the
 * target's schema/UI/roles). They are granted to `loggedIn` — the same house pattern every @tuanla90
 * settings plugin uses (see plugin-ip-guard) — and the UI is reached only through the admin-gated
 * Settings surface. Restrict the tool further via NocoBase roles if untrusted users can sign in.
 * See README → "Security".
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
        previewImport: previewImportAction,
        deleteCollections: deleteCollectionsAction,
        info: infoAction,
      },
    });

    // Custom resource + system-table access → not covered by the admin role strategy, so grant the
    // authenticated user explicitly. [[reference_nocobase_acl_system_collection_writes]]
    this.app.acl.allow(
      'nbCloner',
      ['listCollections', 'export', 'import', 'previewImport', 'deleteCollections', 'info'],
      'loggedIn',
    );
  }

  async install() {}
  async afterEnable() {}
  async afterDisable() {}
  async remove() {}
}

export default PluginNbClonerServer;
