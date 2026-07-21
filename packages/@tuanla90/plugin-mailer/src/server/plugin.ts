import { Plugin } from '@nocobase/server';
import { CONFIG_COLLECTION, TEMPLATES_COLLECTION, MAILER_RESOURCE, DEFAULT_SMTP_PORT } from '../shared/constants';
import { loadConfig, configView, buildConfigPatch, sendMail } from './sendCore';
import { makeMailerInstruction } from './mailerInstruction';

/**
 * @tuanla90/plugin-mailer — send emails from records & workflows via reusable HTML templates.
 *
 * Owns two collections:
 *   • ptdlMailerConfig   — single-row backend config. SECRETS (appsScriptUrl, smtpPass, sharedToken)
 *                          are stored here and NEVER returned to the client (see sendCore.configView).
 *   • ptdlMailTemplates  — reusable templates { name, subject, htmlBody, collectionName, appends }.
 *
 * Exposes the `mailer` resource:
 *   • send        (loggedIn)  — the record action + the shared send path.
 *   • getConfig   (admin)     — masked config (no secrets).
 *   • saveConfig  (admin)     — secrets only overwritten when a real value is provided.
 *   • sendTest    (admin)     — send a quick test email to verify the backend.
 *
 * Also registers a workflow node ("mailer node") when @nocobase/plugin-workflow is present.
 * ACL follows the @tuanla90 pattern [[reference_nocobase_acl_system_collection_writes]]: custom-resource
 * writes default-deny; admin actions gated by the `pm.mailer` snippet + an in-handler role check.
 */
export class PluginMailerServer extends Plugin {
  async load() {
    this.defineCollections();

    const acl: any = (this.app as any).acl;
    // Templates: everyone logged-in can read (record action lists them); writes are admin-only via snippet.
    acl?.allow?.(TEMPLATES_COLLECTION, ['list', 'get'], 'loggedIn');
    acl?.registerSnippet?.({ name: 'pm.mailer', actions: [`${TEMPLATES_COLLECTION}:create`, `${TEMPLATES_COLLECTION}:update`, `${TEMPLATES_COLLECTION}:destroy`] });

    this.defineActions();

    // send: any logged-in user (so the record action + workflow can send). getConfig/saveConfig/sendTest:
    // admin-only (NOT in the loggedIn allow — reachable only through the pm.mailer snippet that admins carry).
    acl?.allow?.(MAILER_RESOURCE, 'send', 'loggedIn');
    acl?.registerSnippet?.({ name: 'pm.mailer', actions: [`${MAILER_RESOURCE}:getConfig`, `${MAILER_RESOURCE}:saveConfig`, `${MAILER_RESOURCE}:sendTest`] });

    this.registerWorkflowNode();

    // Make sure the two tables exist even on a hot reload (brand-new plugin: install() creates them,
    // but afterStart re-sync is cheap and covers upgrades). [[reference_nb_local_install_new_plugin]]
    const ensureTables = async () => {
      for (const name of [CONFIG_COLLECTION, TEMPLATES_COLLECTION]) {
        try {
          await (this.db.getCollection(name) as any)?.sync?.({ alter: true });
        } catch (e: any) {
          this.app.logger?.warn?.(`[mailer] sync ${name} failed: ${e?.message}`);
        }
      }
      // Seed a default (disabled) config row so getConfig always has something to show.
      try {
        await loadConfig(this.app);
      } catch {
        /* ignore */
      }
    };
    (this.app as any).on?.('afterStart', ensureTables);
    (this.app as any).on?.('afterUpgrade', ensureTables);
  }

  async install() {
    for (const name of [CONFIG_COLLECTION, TEMPLATES_COLLECTION]) {
      try {
        await (this.db.getCollection(name) as any)?.sync?.();
      } catch (e: any) {
        this.app.logger?.warn?.(`[mailer] install sync ${name} failed: ${e?.message}`);
      }
    }
    try {
      await loadConfig(this.app);
    } catch {
      /* ignore */
    }
  }

  private defineCollections() {
    this.db.collection({
      name: CONFIG_COLLECTION,
      hidden: true,
      fields: [
        { type: 'string', name: 'backend', defaultValue: 'apps-script' }, // 'apps-script' | 'smtp'
        { type: 'boolean', name: 'enabled', defaultValue: false },
        { type: 'string', name: 'fromName' },
        { type: 'text', name: 'appsScriptUrl' }, // SECRET
        { type: 'string', name: 'smtpHost' },
        { type: 'integer', name: 'smtpPort', defaultValue: DEFAULT_SMTP_PORT },
        { type: 'boolean', name: 'smtpSecure', defaultValue: true },
        { type: 'string', name: 'smtpUser' },
        { type: 'text', name: 'smtpPass' }, // SECRET
        { type: 'string', name: 'smtpFrom' },
        { type: 'text', name: 'sharedToken' }, // SECRET
      ],
    } as any);

    this.db.collection({
      name: TEMPLATES_COLLECTION,
      hidden: true,
      fields: [
        { type: 'string', name: 'name' },
        { type: 'text', name: 'subject' },
        { type: 'text', name: 'htmlBody' },
        { type: 'string', name: 'collectionName' },
        { type: 'json', name: 'appends', defaultValue: [] },
        { type: 'boolean', name: 'enabled', defaultValue: true },
      ],
    } as any);
  }

  private requireAdmin(ctx: any) {
    const roles = ctx.state?.currentRoles;
    const list = Array.isArray(roles) ? roles : roles ? [roles] : [];
    if (!list.includes('root') && !list.includes('admin')) {
      ctx.throw(403, 'Chỉ quản trị viên mới được cấu hình Mailer / Only an administrator may configure Mailer');
    }
  }

  private defineActions() {
    const app: any = this.app;
    (this.app as any).resourceManager?.define?.({
      name: MAILER_RESOURCE,
      actions: {
        // ── send: resolve the template against the record + send via the configured backend ──
        send: async (ctx: any, next: any) => {
          const v = ctx.action?.params?.values || ctx.request?.body || {};
          const result = await sendMail(app, {
            templateId: v.templateId != null && v.templateId !== '' ? Number(v.templateId) : null,
            inlineSubject: v.inlineSubject ?? v.subject,
            inlineHtml: v.inlineHtml ?? v.html,
            collectionName: v.collectionName || null,
            recordId: v.recordId,
            data: v.data,
            to: v.to,
            cc: v.cc,
            bcc: v.bcc,
            attachments: v.attachments,
            backend: v.backend,
          });
          ctx.body = result; // { ok, error?, backend?, messageId? } — raw (no data-wrapping crash)
          await next();
        },

        // ── getConfig: masked, secret-free config for the settings page (admin) ──
        getConfig: async (ctx: any, next: any) => {
          this.requireAdmin(ctx);
          const row = await loadConfig(app);
          ctx.body = configView(row);
          await next();
        },

        // ── saveConfig: persist; secrets only overwritten when a real value is sent (admin) ──
        saveConfig: async (ctx: any, next: any) => {
          this.requireAdmin(ctx);
          const values = ctx.action?.params?.values || ctx.request?.body || {};
          const row = await loadConfig(app);
          const patch = buildConfigPatch(row, values);
          await row.update(patch);
          ctx.body = configView(row);
          await next();
        },

        // ── sendTest: send a quick test email to verify the backend (admin) ──
        sendTest: async (ctx: any, next: any) => {
          this.requireAdmin(ctx);
          const v = ctx.action?.params?.values || ctx.request?.body || {};
          const to = v.to;
          if (!to) {
            ctx.body = { ok: false, error: 'Missing test recipient' };
            await next();
            return;
          }
          const result = await sendMail(app, {
            inlineSubject: v.subject || '[Mailer] Test email — @tuanla90/plugin-mailer',
            inlineHtml:
              v.html ||
              '<p>This is a <b>test email</b> from the @tuanla90 Mailer plugin.</p><p>Đây là email <b>thử nghiệm</b> từ plugin Mailer.</p>',
            to,
            backend: v.backend,
          });
          ctx.body = result;
          await next();
        },
      },
      only: ['send', 'getConfig', 'saveConfig', 'sendTest'],
    });
  }

  /** Register the workflow node when @nocobase/plugin-workflow is loaded. Guarded so a missing/disabled
   *  workflow plugin (or a load-order race) never breaks this plugin. */
  private registerWorkflowNode() {
    try {
      const workflowPlugin: any = this.app.pm?.get?.('workflow');
      if (!workflowPlugin || typeof workflowPlugin.registerInstruction !== 'function') {
        this.app.logger?.info?.('[mailer] workflow plugin not present — skipping workflow node registration');
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      let wf: any = null;
      try {
        wf = require('@nocobase/plugin-workflow');
      } catch {
        wf = null;
      }
      const Instruction = makeMailerInstruction(this.app, wf);
      if (!Instruction) {
        this.app.logger?.warn?.('[mailer] could not resolve workflow Instruction base — workflow node skipped');
        return;
      }
      // Node type key. The CLIENT lane registers the config UI under the same key.
      workflowPlugin.registerInstruction('ptdl-mailer', Instruction);
      this.app.logger?.info?.('[mailer] workflow node "ptdl-mailer" registered');
    } catch (e: any) {
      this.app.logger?.warn?.(`[mailer] workflow node registration failed: ${e?.message || e}`);
    }
  }
}

export default PluginMailerServer;
