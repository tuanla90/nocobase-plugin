/**
 * Enhanced Table — modern (/v/) FlowEngine lane. Registers the same FlowModel as the classic
 * lane, but builds it on @nocobase/client-v2's TableBlockModel and keeps the v1 hooks as no-ops
 * (the isV1 branch never runs here). The shared model file (../client/EnhancedTableBlockModel)
 * imports NOTHING from @nocobase/client, so this bundle stays free of it (no RequireJS script error).
 */
import { Plugin, TableBlockModel } from '@nocobase/client-v2';
import { defineEnhancedTableBlockModel } from '../client/EnhancedTableBlockModel';
import { EtRespSwitch, EtRespNum } from '../client/responsiveCards';

import enUS from '../locale/en-US.json';
import zhCN from '../locale/zh-CN.json';
import viVN from '../locale/vi-VN.json';

export class PluginEnhancedTableBlockClientV2 extends Plugin {
  async load() {
    this.app.i18n.addResources('zh-CN', '@ptdl/plugin-enhanced-table-block/client', zhCN);
    this.app.i18n.addResources('en-US', '@ptdl/plugin-enhanced-table-block/client', enUS);
    this.app.i18n.addResources('vi-VN', '@ptdl/plugin-enhanced-table-block/client', viVN);

    try { (this as any).flowEngine?.flowSettings?.registerComponents?.({ EtRespSwitch, EtRespNum }); } catch (e) { /* optional */ }

    // v1 hooks stay no-op (defaults); the modern lane only uses the `model` path.
    const EnhancedTableBlockModel = defineEnhancedTableBlockModel(TableBlockModel);
    this.flowEngine.registerModels({ EnhancedTableBlockModel });
  }
}

export default PluginEnhancedTableBlockClientV2;
