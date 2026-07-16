import { Plugin, NumberFieldModel } from '@nocobase/client-v2';
import { tExpr } from '@nocobase/flow-engine';
import { registerNumberFormatModel } from '../shared/numberFormat';

// WIP: this registers the format flow, but it does NOT yet surface in the FORM field
// settings menu. See src/shared/numberFormat.tsx for the open issue + directions.
export class PluginNumberFormatClientV2 extends Plugin {
  async load() {
    registerNumberFormatModel({ NumberFieldModel, tExpr });
    // eslint-disable-next-line no-console
    console.log('[number-format] client-v2 loaded (research build)');
  }
}

export default PluginNumberFormatClientV2;
