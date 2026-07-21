import { Plugin } from '@nocobase/client';

// Classic lane (`/`, `/admin`): intentionally a NO-OP. File Vault's settings page is built for the modern
// `/v/` client (registered via pluginSettingsManager.addMenuItem + addPageTabItem, which the classic lane
// lacks). We still ship a valid Plugin + the `client.js` marker so the package loads cleanly on classic —
// a MISSING classic bundle 404s and RequireJS then white-screens the WHOLE app.
// See [[reference_nocobase_vonly_plugin_needs_classic_noop]]. Mirrors plugin-detail-panel / inline-field.
export class PluginFileVaultClient extends Plugin {
  async load() {
    // no classic-lane UI — see ../client-v2 for the real implementation
  }
}

export default PluginFileVaultClient;
