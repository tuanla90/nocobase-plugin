import { Plugin } from '@nocobase/client';
import { FormatNumberInput } from './FormatNumberInput';
import { FormatNumberFieldInterface } from './interface';

export class PluginNumberInputClient extends Plugin {
  async load() {
    // Make <... x-component="FormatNumberInput" /> resolvable in schemas.
    this.app.addComponents({ FormatNumberInput });

    // Register the "Formatted number" field interface so it appears in the
    // "Add field" menu (group: basic, right after the built-in Number).
    this.app.dataSourceManager.addFieldInterfaces([FormatNumberFieldInterface]);
  }
}

export default PluginNumberInputClient;
