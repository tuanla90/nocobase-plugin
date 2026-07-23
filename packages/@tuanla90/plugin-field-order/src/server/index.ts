import { Plugin } from '@nocobase/server';

/**
 * Field Order server. Two areas:
 *
 * 1) `fieldOrder:reorder` — rewrites the `sort` column of a collection's fields (the main data
 *    source's `fields` metadata table) to a caller-supplied order.
 *
 *    WHY sort: NocoBase orders the Collection Manager's "Configure fields" screen and the block
 *    field-pickers by `fields.sort` (a `sortable` collection, scopeKey=collectionName). A newly added
 *    field gets sort=max+1 → always lands at the bottom, with no built-in UI to move it. This action is
 *    the persistence behind the client's drag-and-drop reorder button.
 *
 *    SAFE renumber: we reuse the *existing* sort slots of exactly the fields being reordered (their
 *    current sort values, ascending) and reassign them in the new sequence. System/hidden fields that
 *    aren't part of the request are never touched, and no new collisions are introduced. Raw UPDATE in
 *    a transaction (dialect-quoted) bypasses field-model hooks — we only shuffle display order, never
 *    the schema. Targets the MAIN data source's `fields` table.
 *
 * 2) `ptdlSettingsMenuOrder:read` / `:set` — persist the APP-WIDE order of the Settings-center menu
 *    (a single `scope='global'` row holding `order: string[]` of menu keys, top→bottom). The client
 *    drag-reorder editor writes it; both client lanes read it on load and stamp `sort` onto each menu
 *    entry. App-wide (not per-user): one admin arranges the menu for everyone.
 */

/** Read a custom-action's values: `resource().op({ values })` → ctx.action.params.values; raw HTTP may
 *  put them top-level. Accept both. */
function readVals(ctx: any): any {
  const p = ctx?.action?.params || {};
  return (p.values ?? p) || {};
}

export class PluginFieldOrderServer extends Plugin {
  async beforeLoad() {
    // App-wide Settings-menu order — a single well-known row (`scope='global'`).
    this.db.collection({
      name: 'ptdlSettingsMenuOrder',
      title: 'Settings menu order',
      fields: [
        { type: 'string', name: 'scope', unique: true }, // always 'global'
        { type: 'json', name: 'order', defaultValue: [] }, // string[] of menu keys, top→bottom
      ],
    });
  }

  async load() {
    this.registerSettingsMenuOrder();
    const db: any = this.db;
    const dialect: string = (() => {
      try {
        return db.sequelize.getDialect();
      } catch {
        return 'sqlite';
      }
    })();
    // Quote an identifier for the active dialect (mysql/mariadb = backticks, everyone else = double quotes).
    const q = (id: string): string =>
      dialect === 'mysql' || dialect === 'mariadb'
        ? '`' + String(id).replace(/`/g, '``') + '`'
        : '"' + String(id).replace(/"/g, '""') + '"';
    const table = (() => {
      try {
        return db.getCollection('fields')?.model?.tableName || 'fields';
      } catch {
        return 'fields';
      }
    })();
    const T = q(table);
    const C = q('collectionName');
    const N = q('name');
    const S = q('sort');
    const QT = db.sequelize.QueryTypes;

    this.app.resourcer.define({
      name: 'fieldOrder',
      actions: {
        reorder: async (ctx: any, next: any) => {
          const v = ctx.action?.params?.values || {};
          const collectionName = String(v.collectionName || '').trim();
          const order: string[] = Array.isArray(v.order) ? v.order.map((x: any) => String(x)) : [];
          if (!collectionName || order.length === 0) {
            ctx.throw(400, 'collectionName and a non-empty order[] are required');
            return;
          }

          // Current sort values for every field of this collection.
          const rows: any[] = await db.sequelize.query(
            `SELECT ${N} AS name, ${S} AS sort FROM ${T} WHERE ${C} = :coll`,
            { replacements: { coll: collectionName }, type: QT.SELECT },
          );
          const sortByName = new Map<string, number>(rows.map((r) => [String(r.name), Number(r.sort)]));
          // Keep only requested names that really belong to the collection (drop stray/deleted ones),
          // preserving the caller's sequence.
          const target = order.filter((n) => sortByName.has(n));
          if (target.length === 0) {
            ctx.throw(400, 'none of the given fields belong to this collection');
            return;
          }
          // Reuse exactly these fields' own sort slots, ascending, in the new sequence.
          const slots = target.map((n) => sortByName.get(n) as number).sort((a, b) => a - b);

          await db.sequelize.transaction(async (transaction: any) => {
            for (let i = 0; i < target.length; i++) {
              await db.sequelize.query(
                `UPDATE ${T} SET ${S} = :sort WHERE ${C} = :coll AND ${N} = :name`,
                { replacements: { sort: slots[i], coll: collectionName, name: target[i] }, transaction, type: QT.UPDATE },
              );
            }
          });

          ctx.body = { ok: true, collectionName, count: target.length };
          await next();
        },
      },
    });
    // The Configure-fields UI is admin-only; this action only shuffles display-order metadata (no
    // schema change, no data exposure), so any logged-in user is acceptable — mirrors other @tuanla90 actions.
    this.app.acl.allow('fieldOrder', 'reorder', 'loggedIn');
  }

  /**
   * Register the app-wide Settings-menu-order actions on the `ptdlSettingsMenuOrder` collection.
   * Uses registerActionHandlers (documented, non-destructive) so default CRUD stays ACL-gated to
   * admins while these two are opened to logged-in users (the settings page is admin-only anyway).
   */
  private registerSettingsMenuOrder(): void {
    this.app.resourceManager.registerActionHandlers({
      // Read the saved order (global). Always returns { order: string[] } ([] when unset → client uses its preset).
      'ptdlSettingsMenuOrder:read': async (ctx: any, next: any) => {
        try {
          const repo: any = this.db.getRepository('ptdlSettingsMenuOrder');
          const row: any = await repo.findOne({ filter: { scope: 'global' } });
          const order = row?.order;
          ctx.body = { order: Array.isArray(order) ? order : [] };
        } catch (e: any) {
          this.app.logger?.warn?.('[field-order] menu-order read failed: ' + (e?.message || e));
          ctx.body = { order: [] };
        }
        return next();
      },

      // Save the order (global). Body: { order: string[] }. Empty array clears the custom order.
      'ptdlSettingsMenuOrder:set': async (ctx: any, next: any) => {
        try {
          const userId = ctx.state?.currentUser?.id;
          if (userId == null) {
            ctx.status = 401;
            ctx.body = { ok: false, error: 'Not authenticated' };
            return next();
          }
          const vals = readVals(ctx);
          const order = Array.isArray(vals.order) ? vals.order.map((x: any) => String(x)) : [];
          const repo: any = this.db.getRepository('ptdlSettingsMenuOrder');
          await repo.updateOrCreate({ filterKeys: ['scope'], values: { scope: 'global', order } });
          ctx.body = { ok: true, count: order.length };
        } catch (e: any) {
          this.app.logger?.warn?.('[field-order] menu-order set failed: ' + (e?.message || e));
          ctx.body = { ok: false, error: e?.message || String(e) };
        }
        return next();
      },
    });

    // App-wide menu order: any logged-in user may read; write is allowed for logged-in users but the
    // editor lives on an admin-only settings page. (Cosmetic config — same rationale as fieldOrder:reorder.)
    this.app.acl.allow('ptdlSettingsMenuOrder', ['read', 'set'], 'loggedIn');

    // Ensure the table exists even when the plugin was enabled before this collection was added
    // (install()/afterEnable() don't re-run on a plain restart).
    this.db.getCollection('ptdlSettingsMenuOrder')?.sync?.().catch((e: any) =>
      this.app.logger?.warn?.('[field-order] ptdlSettingsMenuOrder sync failed: ' + (e?.message || e)),
    );
  }

  async install() {
    await this.db.sync();
  }

  async afterEnable() {
    try {
      await this.db.sync();
    } catch (e: any) {
      this.app.logger?.warn?.('[field-order] sync failed: ' + (e?.message || e));
    }
  }
}

export default PluginFieldOrderServer;
