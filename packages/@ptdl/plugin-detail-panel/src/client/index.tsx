import { Plugin } from '@nocobase/client';

// Classic lane (/admin) uses the schema-based block system, not FlowEngine's TableBlockModel, so there is
// no `rowClick` event and no embed side container to dock into. Detail Panel is a /v/-only feature; this
// entry is a deliberate no-op so the plugin still loads on classic without error.
export class PluginDetailPanelClient extends Plugin {
  async load() {
    // no-op on classic
  }
}

export default PluginDetailPanelClient;
