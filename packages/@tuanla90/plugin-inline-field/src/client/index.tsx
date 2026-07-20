import { Plugin } from '@nocobase/client';

// Classic lane (/admin): Inline Field's "Add new column" flow is built on FlowEngine's Table block
// (TableBlockModel + the ⚙ settings menu), which only exists on the modern /v/ client. Inline Field is
// therefore a /v/-only feature; this entry is a deliberate no-op so the plugin still LOADS on the classic
// client without a 404 (a missing classic bundle halts the whole client). Mirrors plugin-detail-panel.
export class PluginInlineFieldClient extends Plugin {
  async load() {
    // no-op on classic
  }
}

export default PluginInlineFieldClient;
