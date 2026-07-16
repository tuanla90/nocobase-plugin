import { Plugin } from '@nocobase/server';
import path from 'path';
import { getActive, save, setAccent, exportBundle, importBundle } from './actions/brandingConfig';

export class PluginBrandingServer extends Plugin {
  async load() {
    await this.db.import({ directory: path.resolve(__dirname, 'collections') });

    this.app.resourcer.define({
      name: 'brandingConfigs',
      actions: { getActive, save, setAccent, exportBundle, importBundle },
      only: ['list', 'get', 'create', 'update', 'destroy', 'getActive', 'save', 'setAccent', 'exportBundle', 'importBundle'],
    });
    // Skin must apply for everyone (incl. before login) → public read. `save` stays admin-gated.
    this.app.acl.allow('brandingConfigs', 'getActive', 'public');
  }

  async install() {
    // Seed an empty skin row so getActive never 404s and the settings page has a record to edit.
    const repo = this.db.getRepository('brandingConfigs');
    const existing = await repo.findOne({ filter: { type: 'skin' } });
    if (!existing) await repo.create({ values: { type: 'skin', options: {} } });
  }
}

export default PluginBrandingServer;
