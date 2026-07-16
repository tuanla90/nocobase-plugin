import { Plugin, Icon, icons, ChildPageModel, TableColumnModel, FormItemModel, DetailsItemModel, FormJSFieldItemModel, BlockModel } from '@nocobase/client';
import {
  registerCustomHeader,
  registerColumnHeader,
  registerFieldLabel,
  registerBlockStyle,
  loadFieldStyleCache,
  bindFieldStyleAutoRefresh,
  setRuntimeT,
} from '../shared/customHeader';
import enUS from '../locale/en-US.json';
import viVN from '../locale/vi-VN.json';
import zhCN from '../locale/zh-CN.json';

// Classic lane (/). @nocobase/client re-exports a curated set of FlowEngine models — it exposes
// ChildPageModel (hint → base PageModel resolved at runtime), TableColumnModel, FormItemModel and
// DetailsItemModel directly.
export class PluginCustomHeaderClient extends Plugin {
  async load() {
    try {
      this.app.i18n.addResources('en-US', '@ptdl/plugin-custom-header/client', enUS);
      this.app.i18n.addResources('vi-VN', '@ptdl/plugin-custom-header/client', viVN);
      this.app.i18n.addResources('zh-CN', '@ptdl/plugin-custom-header/client', zhCN);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[custom-header] i18n addResources failed', e);
    }
    setRuntimeT((s: string) => this.app.i18n.t(s, { ns: '@ptdl/plugin-custom-header/client' }));
    const fe = (this as any).flowEngine;
    const api = (this as any).app?.apiClient;
    await loadFieldStyleCache(api);
    bindFieldStyleAutoRefresh(api);
    const common = { flowEngine: fe, flowSettings: fe?.flowSettings, Icon, icons };
    registerCustomHeader({ ...common, PageModel: ChildPageModel });
    registerColumnHeader({ ...common, TableColumnModel });
    registerFieldLabel({ ...common, modelName: 'FormItemModel', ModelHint: FormItemModel, flowKey: 'ptdlFormLabel' });
    registerFieldLabel({ ...common, modelName: 'DetailsItemModel', ModelHint: DetailsItemModel, flowKey: 'ptdlDetailLabel' });
    registerFieldLabel({ ...common, modelName: 'FormJSFieldItemModel', ModelHint: FormJSFieldItemModel, flowKey: 'ptdlJsFieldLabel' });
    registerBlockStyle({ ...common, BlockModelHint: BlockModel });
    // eslint-disable-next-line no-console
    console.log('[custom-header] client (classic lane) loaded — page + column + form/detail + js-field + block');
  }
}

export default PluginCustomHeaderClient;
