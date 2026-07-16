import { Plugin } from '@nocobase/server';

/**
 * Field Order server. One action: `fieldOrder:reorder` — rewrites the `sort` column of a
 * collection's fields (the main data source's `fields` metadata table) to a caller-supplied order.
 *
 * WHY sort: NocoBase orders the Collection Manager's "Configure fields" screen and the block
 * field-pickers by `fields.sort` (a `sortable` collection, scopeKey=collectionName). A newly added
 * field gets sort=max+1 → always lands at the bottom, with no built-in UI to move it. This action is
 * the persistence behind the client's drag-and-drop reorder button.
 *
 * SAFE renumber: we reuse the *existing* sort slots of exactly the fields being reordered (their
 * current sort values, ascending) and reassign them in the new sequence. System/hidden fields that
 * aren't part of the request are never touched, and no new collisions are introduced. Raw UPDATE in
 * a transaction (dialect-quoted) bypasses field-model hooks — we only shuffle display order, never
 * the schema.
 *
 * NOTE: targets the MAIN data source's `fields` table (external data sources store field metadata
 * elsewhere). The Collection Manager screen we augment is the main data source.
 */
export class PluginFieldOrderServer extends Plugin {
  async load() {
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
    // schema change, no data exposure), so any logged-in user is acceptable — mirrors other @ptdl actions.
    this.app.acl.allow('fieldOrder', 'reorder', 'loggedIn');
  }
}

export default PluginFieldOrderServer;
