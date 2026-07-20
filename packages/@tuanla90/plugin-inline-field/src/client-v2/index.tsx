import { Plugin, Icon, icons } from '@nocobase/client-v2';
import { tExpr } from '@nocobase/flow-engine';
import { setSharedT, SHARED_NS, sharedEnUS } from '@tuanla90/shared';
import { registerInlineField, NS } from '../shared/inlineField';
import enUS from '../locale/en-US.json';

/**
 * Inline Field — modern lane (`/v/`). Adds a "➕ Thêm cột mới…" item to every Table block's ⚙ settings
 * menu; picking it opens a dialog to define a scalar field, which is created on the collection and dropped
 * straight into the block. Needs a root `client-v2.js` marker in the tgz or pm:listEnabledV2 skips the lane.
 *
 * i18n: Vietnamese is the SOURCE (= the key), so only en-US needs a resource file. Unsupported UI
 * languages fall back to English; a vi-VN identity map keeps Vietnamese rendering its own keys.
 */
export class PluginInlineFieldClientV2 extends Plugin {
  async load() {
    try {
      this.app.i18n.addResources('en-US', NS, enUS);
      // @tuanla90/shared's own strings (FieldPickerCascader labels/placeholders) — bilingual.
      this.app.i18n.addResources('en-US', SHARED_NS, sharedEnUS);
      const _id = (m: any) => Object.fromEntries(Object.keys(m || {}).map((k) => [k, k]));
      this.app.i18n.addResources('vi-VN', NS, _id(enUS));
      this.app.i18n.addResources('vi-VN', SHARED_NS, _id(sharedEnUS));
      const _i: any = this.app.i18n;
      _i.options.fallbackLng = _i.options.fallbackLng || 'en-US';
      if (_i.services?.languageUtils?.options) _i.services.languageUtils.options.fallbackLng = 'en-US';
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[inline-field] i18n addResources failed', e);
    }

    setSharedT((s, o) => this.app.i18n.t(s, { ns: SHARED_NS, ...(o || {}) }));

    const fe = (this as any).flowEngine;
    try {
      registerInlineField({ flowEngine: fe, flowSettings: fe?.flowSettings, tExpr, app: (this as any).app, Icon, icons });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[inline-field] register failed (ignored)', e);
    }
    // eslint-disable-next-line no-console
    console.log('[inline-field] client-v2 loaded');
  }
}

export default PluginInlineFieldClientV2;
