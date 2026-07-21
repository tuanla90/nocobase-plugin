// Classic lane (`/`, `/admin`). REQUIRED even though the main UI is /v/-only: a plugin that ships no
// classic `dist/client/index.js` makes the classic shell 404 that chunk and RequireJS white-screens the
// whole app. [[reference_nocobase_vonly_plugin_needs_classic_noop]]
//
// Beyond the no-op, this lane registers the Workflow node UI ("Send email (@tuanla90)") in the classic
// Workflow editor — guarded so a missing/disabled workflow plugin never breaks the app.
import { Plugin } from '@nocobase/client';
import { setI18n, NS } from '../shared/mailerClient';
import { registerMailerWorkflowNode } from './workflowNode';
import enUS from '../locale/en-US.json';
import viVN from '../locale/vi-VN.json';

export class PluginMailerClient extends Plugin {
  async load() {
    setI18n((this.app as any).i18n);
    try {
      this.app.i18n.addResources('en-US', NS, enUS as any);
      this.app.i18n.addResources('vi-VN', NS, viVN as any);
    } catch (e) {
      // ignore i18n load errors
    }

    // Phase 2 client: workflow node config UI. Fully guarded — see workflowNode.tsx.
    try {
      const ok = registerMailerWorkflowNode(this.app);
      // eslint-disable-next-line no-console
      console.log(`[mailer] classic lane loaded; workflow node ${ok ? 'registered' : 'skipped (workflow not present)'}`);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[mailer] workflow node registration failed (non-fatal)', e);
    }
  }
}

export default PluginMailerClient;
