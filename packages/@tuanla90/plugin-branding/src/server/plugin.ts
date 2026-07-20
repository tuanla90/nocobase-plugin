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
    // Skin must apply for everyone (incl. before login) → public read.
    this.app.acl.allow('brandingConfigs', 'getActive', 'public');
    // The write actions are custom (not standard CRUD), so the admin role's strategy doesn't cover them —
    // without an explicit allow ONLY root (which bypasses ACL) could save. Grant to authenticated users
    // (the settings page is admin-only in the UI); matches the @tuanla90 convention (see ai-column).
    this.app.acl.allow('brandingConfigs', ['save', 'setAccent', 'exportBundle', 'importBundle'], 'loggedIn');
  }

  async install() {
    // Seed an empty skin row so getActive never 404s and the settings page has a record to edit.
    const repo = this.db.getRepository('brandingConfigs');
    const existing = await repo.findOne({ filter: { type: 'skin' } });
    if (!existing) await repo.create({ values: { type: 'skin', options: {} } });
  }
}

export default PluginBrandingServer;
