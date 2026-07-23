import { Plugin } from '@nocobase/server';

/**
 * My Columns (per-user) — server.
 *
 * Stores PER-USER column layout for /v/ Table blocks in the app DB collection `ptdlUserColumns`
 * (one row per (userId, tableUid)). The client loads the current user's rows once at startup and
 * writes via the two custom actions below.
 *
 * 🔒 SECURITY: `userId` is ALWAYS taken from the server-side session (`ctx.state.currentUser.id`),
 * NEVER from the client body/params. Both actions scope strictly to that user, so a user can only
 * read/write THEIR OWN rows. No `userId` sent by the client is ever trusted.
 *
 * NON-DESTRUCTIVE: this plugin only upserts the current user's own settings row. It never deletes or
 * modifies other collections/fields/rows.
 */

/** Read a custom-action's values: `resource().op({ values })` → ctx.action.params.values; raw HTTP may
 *  put them top-level. Accept both. */
function readVals(ctx: any): any {
  const p = ctx?.action?.params || {};
  return (p.values ?? p) || {};
}

export class PluginMyColumnsServer extends Plugin {
  async beforeLoad() {
    this.db.collection({
      name: 'ptdlUserColumns',
      title: 'User column settings',
      fields: [
        // The owning user — indexed. Populated server-side only (never from the client).
        { type: 'bigInt', name: 'userId', index: true },
        // The /v/ Table block uid this layout belongs to — indexed.
        { type: 'string', name: 'tableUid', index: true },
        // The per-user layout: { hidden: string[], order: string[], widths: {}, pinned: {} }.
        { type: 'json', name: 'settings', defaultValue: {} },
      ],
    });
  }

  async load() {
    // Two custom resource actions on `ptdlUserColumns`. Registered as resource-specific global handlers
    // (documented API) so they attach to the collection resource when it is lazily constructed — no
    // resource replacement, default CRUD stays untouched (and stays ACL-gated to admins).
    this.app.resourceManager.registerActionHandlers({
      // Read the current user's settings. All rows for the user, or one row when `tableUid` is given.
      'ptdlUserColumns:mine': async (ctx: any, next: any) => {
        try {
          const userId = ctx.state?.currentUser?.id;
          if (userId == null) {
            ctx.body = [];
            return next();
          }
          const vals = readVals(ctx);
          const filter: any = { userId };
          if (vals.tableUid) filter.tableUid = String(vals.tableUid);
          const repo: any = this.db.getRepository('ptdlUserColumns');
          const rows = (await repo.find({ filter })) || [];
          // Raw array (NOT { data: X } — the framework wraps once). Only expose tableUid + settings.
          ctx.body = rows.map((r: any) => ({
            tableUid: r.tableUid,
            settings: r.settings && typeof r.settings === 'object' ? r.settings : {},
          }));
        } catch (e: any) {
          this.app.logger?.warn?.('[my-columns] mine failed: ' + (e?.message || e));
          ctx.body = [];
        }
        return next();
      },

      // Upsert the current user's settings for one tableUid. Body: { tableUid, settings }.
      'ptdlUserColumns:set': async (ctx: any, next: any) => {
        try {
          const userId = ctx.state?.currentUser?.id;
          if (userId == null) {
            // No session → do NOT write anything.
            ctx.status = 401;
            ctx.body = { ok: false, error: 'Not authenticated' };
            return next();
          }
          const vals = readVals(ctx);
          const tableUid = vals.tableUid ? String(vals.tableUid) : '';
          if (!tableUid) {
            ctx.body = { ok: false, error: 'tableUid required' };
            return next();
          }
          const settings = vals.settings && typeof vals.settings === 'object' ? vals.settings : {};
          const repo: any = this.db.getRepository('ptdlUserColumns');
          // updateOrCreate scoped to (userId, tableUid) — userId is the SESSION user, so a user can only
          // ever touch their own row.
          await repo.updateOrCreate({
            filterKeys: ['userId', 'tableUid'],
            values: { userId, tableUid, settings },
          });
          ctx.body = { ok: true, tableUid, settings };
        } catch (e: any) {
          this.app.logger?.warn?.('[my-columns] set failed: ' + (e?.message || e));
          ctx.body = { ok: false, error: e?.message || String(e) };
        }
        return next();
      },
    });

    // Every logged-in user may read/write THEIR OWN settings (server scopes by session userId).
    this.app.acl.allow('ptdlUserColumns', ['mine', 'set'], 'loggedIn');

    // Ensure the table exists even when the plugin was installed/enabled before this collection was added
    // (install()/afterEnable() don't re-run on a plain restart).
    try {
      await this.db.getCollection('ptdlUserColumns')?.sync?.();
    } catch (e: any) {
      this.app.logger?.warn?.('[my-columns] ptdlUserColumns sync failed: ' + (e?.message || e));
    }
  }

  async install() {
    await this.db.sync();
  }

  async afterEnable() {
    try {
      await this.db.sync();
    } catch (e: any) {
      this.app.logger?.warn?.('[my-columns] sync failed: ' + (e?.message || e));
    }
  }
}

export default PluginMyColumnsServer;
