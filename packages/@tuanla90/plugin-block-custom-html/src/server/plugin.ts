import { Plugin } from '@nocobase/server';
import { generateCode } from '@tuanla90/shared/ai-server';

/**
 * Custom HTML block is client-only, EXCEPT one server action: `customHtmlAi:generate` — the LLM
 * codegen endpoint behind the editor's "✨ AI viết hộ" button (the client drives validate+retry).
 */
export class PluginBlockCustomHtmlServer extends Plugin {
  async load() {
    this.app.resourcer.define({
      name: 'customHtmlAi',
      actions: {
        generate: async (ctx: any, next: any) => {
          const v = ctx.action?.params?.values || {};
          ctx.body = await generateCode(this.app, v);
          await next();
        },
      },
    });
    this.app.acl.allow('customHtmlAi', 'generate', 'loggedIn');
  }
}

export default PluginBlockCustomHtmlServer;
