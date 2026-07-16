/**
 * Custom HTML block — modern (/v/) FlowEngine lane. Same registration as the classic
 * lane (../client/registerBlock); the base Plugin + icon registry come from
 * @nocobase/client-v2 so this bundle never depends on @nocobase/client (which the /v/
 * app does not provide → would cause a RequireJS "Script error for @nocobase/client").
 */
import { Plugin, icons } from '@nocobase/client-v2';
import { registerCustomHtmlBlock } from '../client/registerBlock';
import { setIconRegistry } from '../client/render';
import { NS, setRuntimeT } from '../client/i18n';
import { setSharedT, SHARED_NS, sharedEnUS } from '@ptdl/shared';
import enUS from '../locale/en-US.json';

export class PluginBlockCustomHtmlClientV2 extends Plugin {
  async load() {
    try {
      this.app.i18n.addResources('en-US', NS, enUS as any);
      // @ptdl/shared's own render strings (field-picker button, empty state) — bilingual per lane.
      this.app.i18n.addResources('en-US', SHARED_NS, sharedEnUS as any);
      // Unsupported UI languages → English: turn on en-US fallback, and give vi a VN-key identity map
      // (VN string = key) so vi keeps Vietnamese instead of also falling back to English.
      const _id = (m: any) => Object.fromEntries(Object.keys(m || {}).map((k) => [k, k]));
      this.app.i18n.addResources('vi-VN', NS, _id(enUS));
      this.app.i18n.addResources('vi-VN', SHARED_NS, _id(sharedEnUS));
      const _i: any = this.app.i18n;
      _i.options.fallbackLng = 'en-US';
      if (_i.services?.languageUtils?.options) _i.services.languageUtils.options.fallbackLng = 'en-US';
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[custom-html] i18n addResources failed', e);
    }
    setRuntimeT((s, o) => this.app.i18n.t(s, { ns: NS, ...(o || {}) }));
    setSharedT((s, o) => this.app.i18n.t(s, { ns: SHARED_NS, ...(o || {}) }));
    setIconRegistry(icons);
    const fe: any = this.flowEngine || (this.app && (this.app as any).flowEngine);
    await registerCustomHtmlBlock(fe);
  }
}

export default PluginBlockCustomHtmlClientV2;
