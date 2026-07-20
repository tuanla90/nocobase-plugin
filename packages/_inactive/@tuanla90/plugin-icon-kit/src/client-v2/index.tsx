import { Plugin, registerIcon } from '@nocobase/client-v2';
import { registerLucideIcons } from '../shared/iconKit';

export class PluginIconKitClientV2 extends Plugin {
  async load() {
    const n = registerLucideIcons(registerIcon);
    // eslint-disable-next-line no-console
    console.log(`[icon-kit] provider (modern lane) — registered ${n} lucide icons as lucide-*`);
  }
}

export default PluginIconKitClientV2;
