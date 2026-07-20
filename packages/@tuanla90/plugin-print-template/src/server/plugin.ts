import { Plugin } from '@nocobase/server';
import { generateCode } from '@tuanla90/shared/ai-server';

const TEMPLATES_COLLECTION = 'ptdl_print_templates';
const SETTINGS_COLLECTION = 'ptdl_pdf_settings';

// Custom Handlebars helpers the renderer registers — fed to the AI so it only uses ones that exist.
const PTDL_HELPER_NAMES = ['docso', 'docsoHoa', 'formatDate', 'formatNumber', 'now', 'pluck', 'qr', 'regexReplace', 'regexExtract'];

// Owns the print-template collection + the PDF-service settings, plus a server-side
// proxy to an external HTML→PDF service (Gotenberg) so one service can render vector
// PDFs for many NocoBase instances. Credentials live in the DB (configured in the UI,
// never hardcoded/env) and are never returned to the client.
export class PluginPrintTemplateServer extends Plugin {
  async load() {
    this.db.collection({
      name: TEMPLATES_COLLECTION,
      hidden: true,
      fields: [
        { type: 'string', name: 'title' },
        { type: 'string', name: 'collectionName' },
        { type: 'json', name: 'appends', defaultValue: [] },
        { type: 'text', name: 'headerHtml' },
        { type: 'text', name: 'bodyHtml' },
        { type: 'text', name: 'footerHtml' },
        { type: 'text', name: 'css' },
        { type: 'json', name: 'watermark', defaultValue: {} },
        { type: 'json', name: 'pageSetup', defaultValue: {} },
        { type: 'string', name: 'filename' },
        { type: 'boolean', name: 'enabled', defaultValue: true },
        { type: 'string', name: 'whenField' },
        { type: 'json', name: 'whenValues', defaultValue: [] },
        { type: 'json', name: 'conditions', defaultValue: [] },
        { type: 'boolean', name: 'isPartial', defaultValue: false },
        { type: 'string', name: 'slug' },
      ],
    } as any);

    // Single-row settings for the external PDF service (Gotenberg-compatible).
    this.db.collection({
      name: SETTINGS_COLLECTION,
      hidden: true,
      fields: [
        { type: 'string', name: 'url' }, // e.g. http://gotenberg.railway.internal:3000
        { type: 'string', name: 'username' },
        { type: 'text', name: 'password' },
        { type: 'boolean', name: 'enabled', defaultValue: false },
      ],
    } as any);

    const acl: any = (this.app as any).acl;
    acl?.allow?.(TEMPLATES_COLLECTION, ['list', 'get'], 'loggedIn');
    acl?.registerSnippet?.({ name: 'pm.print-template', actions: [`${TEMPLATES_COLLECTION}:*`] });

    // ---- PDF service resource actions ----
    const getRow = async () => {
      const repo: any = this.db.getRepository(SETTINGS_COLLECTION);
      let row = await repo.findOne();
      if (!row) row = await repo.create({ values: { enabled: false } });
      return row;
    };

    (this.app as any).resourceManager?.define?.({
      name: 'ptdlPdf',
      actions: {
        // any logged-in user: is the vector service on? (no secrets) — so non-admins
        // also get vector output when it's enabled.
        status: async (ctx: any, next: any) => {
          const row = await getRow();
          ctx.body = { enabled: !!row.enabled && !!row.url };
          await next();
        },
        // admin: read config WITHOUT the password (only whether one is set)
        getConfig: async (ctx: any, next: any) => {
          const row = await getRow();
          ctx.body = {
            url: row.url || '',
            username: row.username || '',
            enabled: !!row.enabled,
            hasPassword: !!row.password,
          };
          await next();
        },
        // admin: save config; password only overwritten when a new value is provided
        setConfig: async (ctx: any, next: any) => {
          const v = ctx.action?.params?.values || {};
          const row = await getRow();
          const patch: any = {
            url: typeof v.url === 'string' ? v.url.trim() : row.url,
            username: typeof v.username === 'string' ? v.username : row.username,
            enabled: typeof v.enabled === 'boolean' ? v.enabled : row.enabled,
          };
          if (typeof v.password === 'string' && v.password.length) patch.password = v.password;
          if (v.password === null) patch.password = null; // explicit clear
          await row.update(patch);
          ctx.body = { ok: true };
          await next();
        },
        // any logged-in user: render HTML → PDF via the configured service
        render: async (ctx: any, next: any) => {
          const row = await getRow();
          if (!row.enabled || !row.url) {
            ctx.throw(400, 'PDF service chưa được bật/cấu hình (Settings → PDF service)');
          }
          const { html, filename } = ctx.action?.params?.values || {};
          if (!html) ctx.throw(400, 'Thiếu html');
          try {
            const form: any = new (globalThis as any).FormData();
            form.append('files', new (globalThis as any).Blob([html], { type: 'text/html' }), 'index.html');
            form.append('preferCssPageSize', 'true');
            form.append('printBackground', 'true');
            const headers: any = {};
            if (row.username) {
              const token = Buffer.from(`${row.username}:${row.password || ''}`).toString('base64');
              headers['Authorization'] = 'Basic ' + token;
            }
            const endpoint = row.url.replace(/\/+$/, '') + '/forms/chromium/convert/html';
            const res = await (globalThis as any).fetch(endpoint, { method: 'POST', body: form, headers });
            if (!res.ok) {
              const txt = await res.text().catch(() => '');
              ctx.throw(res.status === 401 ? 401 : 502, `Gotenberg lỗi ${res.status}: ${txt.slice(0, 200)}`);
            }
            const buf = Buffer.from(await res.arrayBuffer());
            ctx.withoutDataWrapping = true;
            ctx.set('Content-Type', 'application/pdf');
            ctx.set('Content-Disposition', `attachment; filename="${(filename || 'print').replace(/"/g, '')}.pdf"`);
            ctx.body = buf;
          } catch (e: any) {
            if (e?.status) throw e;
            ctx.throw(502, `Không gọi được PDF service: ${e?.message}`);
          }
          await next();
        },
      },
    });

    // render: any logged-in user (so printing works). getConfig/setConfig: admin-only
    // via the snippet (admins/root carry `pm.*` which matches `pm.print-template`).
    acl?.allow?.('ptdlPdf', ['render', 'status'], 'loggedIn');
    acl?.registerSnippet?.({ name: 'pm.print-template', actions: ['ptdlPdf:getConfig', 'ptdlPdf:setConfig'] });

    // ---- AI "viết hộ" for the Handlebars editor (the client drives validate+retry via hb.compile) ----
    // The server enriches the request with the template's collection fields + available helpers so the
    // model only references real {{field}} tokens and existing helpers.
    (this.app as any).resourceManager?.define?.({
      name: 'ptdlPrintAi',
      actions: {
        generate: async (ctx: any, next: any) => {
          const v = ctx.action?.params?.values || {};
          const req: any = { ...v };
          try {
            const coll: any = v.collectionName && this.db.getCollection(v.collectionName);
            const columns = coll
              ? Array.from(coll.fields.values()).map((f: any) => ({ name: f.name, type: f.type, title: f.options?.uiSchema?.title }))
              : [];
            req.context = { ...(v.context || {}), columns, helpers: PTDL_HELPER_NAMES };
          } catch (e) {
            /* best-effort context */
          }
          req.language = 'handlebars';
          ctx.body = await generateCode(this.app, req);
          await next();
        },
      },
    });
    acl?.allow?.('ptdlPrintAi', 'generate', 'loggedIn');

    const ensureTables = async () => {
      for (const name of [TEMPLATES_COLLECTION, SETTINGS_COLLECTION]) {
        try {
          await (this.db.getCollection(name) as any)?.sync?.({ alter: true });
        } catch (e: any) {
          this.app.logger?.warn?.(`[print-template] sync ${name} failed: ${e?.message}`);
        }
      }
    };
    (this.app as any).on?.('afterStart', ensureTables);
    (this.app as any).on?.('afterUpgrade', ensureTables);
  }

  async install() {
    for (const name of [TEMPLATES_COLLECTION, SETTINGS_COLLECTION]) {
      await (this.db.getCollection(name) as any)?.sync?.();
    }
  }
}

export default PluginPrintTemplateServer;
