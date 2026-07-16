import { Plugin, registerIcon } from '@nocobase/client';
import { registerLucideIcons } from '../shared/iconKit';

export class PluginIconKitClient extends Plugin {
  async load() {
    const n = registerLucideIcons(registerIcon);
    // eslint-disable-next-line no-console
    console.log(`[icon-kit] provider (classic lane) — registered ${n} lucide icons as lucide-*`);
  }
}

export default PluginIconKitClient;
