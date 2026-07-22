import { Plugin } from '@nocobase/server';
import { CONFIG_COLLECTION, METHODS_COLLECTION, TEMPLATES_COLLECTION, MAILER_RESOURCE, DEFAULT_SMTP_PORT } from '../shared/constants';
import {
  loadMethods,
  methodView,
  methodOption,
  buildMethodPatch,
  genMethodKey,
  migrateLegacyConfig,
  sendMail,
  sendTestViaMethod,
} from './sendCore';
import { makeMailerInstruction } from './mailerInstruction';

/**
 * @tuanla90/plugin-mailer — send emails from records & workflows via reusable HTML templates.
 *
 * Owns three collections:
 *   • ptdlMailerMethods  — the LIST of named "sending methods" (v0.2.0). Each row is one backend config
 *                          { key, name, backend, enabled, isDefault, + backend fields }. SECRETS
 *                          (appsScriptUrl, smtpPass, sharedToken) are stored here and NEVER returned to the
 *                          client (see sendCore.methodView / methodOption).
 *   • ptdlMailerConfig   — LEGACY single-row backend config (v0.1.x). Still defined + readable so an upgrade
 *                          migrates it into ONE default method; sending no longer reads it directly.
 *   • ptdlMailTemplates  — reusable templates { name, subject, htmlBody, collectionName, appends }.
 *
 * Exposes the `mailer` resource:
 *   • send             (loggedIn)  — the record action + the shared send path (picks a method by key/default).
 *   • methodOptions    (loggedIn)  — minimal, secret-free method list for the node/action pickers.
 *   • getMethods       (admin)     — masked method list for the settings page (no secrets).
 *   • saveMethod       (admin)     — create/update a method; secrets only overwritten when a real value is sent.
 *   • deleteMethod     (admin)     — remove a method (re-picks a default if the default was removed).
 *   • setDefaultMethod (admin)     — mark one method as the default.
 *   • sendTest         (admin)     — send a quick test email via a specific method.
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

    // send + methodOptions: any logged-in user (record action + workflow + pickers). getMethods/saveMethod/
    // deleteMethod/setDefaultMethod/sendTest: admin-only (reachable only through the pm.mailer snippet).
    acl?.allow?.(MAILER_RESOURCE, ['send', 'methodOptions'], 'loggedIn');
    acl?.registerSnippet?.({
      name: 'pm.mailer',
      actions: [
        `${MAILER_RESOURCE}:getMethods`,
        `${MAILER_RESOURCE}:saveMethod`,
        `${MAILER_RESOURCE}:deleteMethod`,
        `${MAILER_RESOURCE}:setDefaultMethod`,
        `${MAILER_RESOURCE}:sendTest`,
      ],
    });

    this.registerWorkflowNode();

    // Make sure the tables exist even on a hot reload, then migrate any legacy single config into a method.
    // [[reference_nb_local_install_new_plugin]]
    const ensureTables = async () => {
      for (const name of [CONFIG_COLLECTION, METHODS_COLLECTION, TEMPLATES_COLLECTION]) {
        try {
          await (this.db.getCollection(name) as any)?.sync?.({ alter: true });
        } catch (e: any) {
          this.app.logger?.warn?.(`[mailer] sync ${name} failed: ${e?.message}`);
        }
      }
      await migrateLegacyConfig(this.app);
    };
    (this.app as any).on?.('afterStart', ensureTables);
    (this.app as any).on?.('afterUpgrade', ensureTables);
  }

  async install() {
    for (const name of [CONFIG_COLLECTION, METHODS_COLLECTION, TEMPLATES_COLLECTION]) {
      try {
        await (this.db.getCollection(name) as any)?.sync?.();
      } catch (e: any) {
        this.app.logger?.warn?.(`[mailer] install sync ${name} failed: ${e?.message}`);
      }
    }
    await migrateLegacyConfig(this.app);
  }

  private defineCollections() {
    // LEGACY single-row config — kept so an upgrade can migrate it; not written by the UI anymore.
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

    // v0.2.0 — the LIST of named sending methods (each = one backend config).
    this.db.collection({
      name: METHODS_COLLECTION,
      hidden: true,
      fields: [
        { type: 'string', name: 'key' }, // stable id used by pickers
        { type: 'string', name: 'name' },
        { type: 'string', name: 'backend', defaultValue: 'apps-script' }, // 'apps-script' | 'smtp'
        { type: 'boolean', name: 'enabled', defaultValue: true },
        { type: 'boolean', name: 'isDefault', defaultValue: false },
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

  private methodsRepo() {
    return (this.app as any).db.getRepository(METHODS_COLLECTION);
  }

  /** After any write, guarantee the invariant "exactly one enabled-or-not method is the default" (as long
   *  as at least one method exists). `preferId` becomes the default when nothing is currently marked. */
  private async ensureOneDefault(preferId?: number) {
    const repo = this.methodsRepo();
    const rows = await repo.find();
    if (!rows.length) return;
    const hasDefault = rows.some((r: any) => (r.toJSON ? r.toJSON() : r).isDefault);
    if (hasDefault) return;
    const pick = (preferId != null && rows.find((r: any) => (r.toJSON ? r.toJSON() : r).id === preferId)) || rows[0];
    await pick.update({ isDefault: true });
  }

  private defineActions() {
    const app: any = this.app;
    (this.app as any).resourceManager?.define?.({
      name: MAILER_RESOURCE,
      actions: {
        // ── send: resolve the template against the record + send via the chosen (or default) method ──
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
            methodKey: v.methodKey,
          });
          ctx.body = result; // { ok, error?, backend?, messageId? } — raw (no data-wrapping crash)
          await next();
        },

        // ── methodOptions: minimal, secret-free list of methods for the node/action pickers (loggedIn) ──
        methodOptions: async (ctx: any, next: any) => {
          const methods = await loadMethods(app);
          ctx.body = methods.map(methodOption); // [{ key, name, backend, enabled, isDefault }] — raw array
          await next();
        },

        // ── getMethods: masked, secret-free method list for the settings page (admin) ──
        getMethods: async (ctx: any, next: any) => {
          this.requireAdmin(ctx);
          const rows = await this.methodsRepo().find({ sort: ['-isDefault', 'id'] });
          ctx.body = (rows || []).map(methodView); // raw array (no data-wrapping crash)
          await next();
        },

        // ── saveMethod: create/update one method; secrets only overwritten when a real value is sent (admin) ──
        saveMethod: async (ctx: any, next: any) => {
          this.requireAdmin(ctx);
          const values = ctx.action?.params?.values || ctx.request?.body || {};
          const repo = this.methodsRepo();
          const id = values.id != null && values.id !== '' ? Number(values.id) : null;
          const existing = id ? await repo.findOne({ filterByTk: id }) : null;
          const patch = buildMethodPatch(existing, values);

          let row: any;
          if (existing) {
            await existing.update(patch);
            row = existing;
          } else {
            row = await repo.create({ values: { key: genMethodKey(), name: 'Method', ...patch } });
          }
          // If this method was set as the default, clear the flag on every other method.
          const j = row.toJSON ? row.toJSON() : row;
          if (j.isDefault) {
            const all = await repo.find();
            for (const r of all) {
              const rj = r.toJSON ? r.toJSON() : r;
              if (rj.id !== j.id && rj.isDefault) await r.update({ isDefault: false });
            }
          }
          await this.ensureOneDefault(j.id); // first method (or none-default) → make this the default
          const fresh = await repo.findOne({ filterByTk: j.id });
          ctx.body = methodView(fresh);
          await next();
        },

        // ── deleteMethod: remove a method; re-pick a default if the default was removed (admin) ──
        deleteMethod: async (ctx: any, next: any) => {
          this.requireAdmin(ctx);
          const v = ctx.action?.params?.values || ctx.request?.body || {};
          const repo = this.methodsRepo();
          const id = v.id != null && v.id !== '' ? Number(v.id) : null;
          if (id == null) {
            ctx.body = { ok: false, error: 'Missing method id' };
            await next();
            return;
          }
          await repo.destroy({ filterByTk: id });
          await this.ensureOneDefault();
          ctx.body = { ok: true };
          await next();
        },

        // ── setDefaultMethod: mark one method as the default, clear the rest (admin) ──
        setDefaultMethod: async (ctx: any, next: any) => {
          this.requireAdmin(ctx);
          const v = ctx.action?.params?.values || ctx.request?.body || {};
          const repo = this.methodsRepo();
          const key = v.key != null ? String(v.key) : '';
          const id = v.id != null && v.id !== '' ? Number(v.id) : null;
          const all = await repo.find();
          const target = all.find((r: any) => {
            const rj = r.toJSON ? r.toJSON() : r;
            return (key && rj.key === key) || (id != null && rj.id === id);
          });
          if (!target) {
            ctx.body = { ok: false, error: 'Method not found' };
            await next();
            return;
          }
          const tj = target.toJSON ? target.toJSON() : target;
          for (const r of all) {
            const rj = r.toJSON ? r.toJSON() : r;
            const shouldBe = rj.id === tj.id;
            if (!!rj.isDefault !== shouldBe) await r.update({ isDefault: shouldBe });
          }
          ctx.body = { ok: true };
          await next();
        },

        // ── sendTest: send a quick test email via a specific method (admin) ──
        sendTest: async (ctx: any, next: any) => {
          this.requireAdmin(ctx);
          const v = ctx.action?.params?.values || ctx.request?.body || {};
          const to = v.to;
          if (!to) {
            ctx.body = { ok: false, error: 'Missing test recipient' };
            await next();
            return;
          }
          const result = await sendTestViaMethod(app, {
            methodKey: v.methodKey,
            to,
            subject: v.subject || '[Mailer] Test email — @tuanla90/plugin-mailer',
            html:
              v.html ||
              '<p>This is a <b>test email</b> from the @tuanla90 Mailer plugin.</p><p>Đây là email <b>thử nghiệm</b> từ plugin Mailer.</p>',
          });
          ctx.body = result;
          await next();
        },
      },
      only: ['send', 'methodOptions', 'getMethods', 'saveMethod', 'deleteMethod', 'setDefaultMethod', 'sendTest'],
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
