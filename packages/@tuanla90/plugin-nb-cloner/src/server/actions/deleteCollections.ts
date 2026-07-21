import { Context, Next } from '@nocobase/actions';
import { CollectionAnalyzer } from '../services/collectionAnalyzer';
import { pgIdent } from '../utils/db';

/**
 * Permanently delete collections ("clean up junk tables"): drops the physical table, removes the
 * collection + its fields metadata, and clears relation fields (incl. reverse relations from other
 * collections) via NocoBase's own delete path — destroying the `collections` row fires
 * `collections.beforeDestroy` → `CollectionModel.remove()`. Dialect-agnostic (uses dropTable).
 *
 * SAFETY: the server re-classifies every collection and refuses anything that is NOT a "user"
 * collection (managed via the Collection Manager, not a system/plugin table). The client's selection
 * is never trusted — deleting `users`/`roles`/a plugin table would break the app.
 */
export async function deleteCollectionsAction(ctx: Context, next: Next) {
  const body = (ctx.request as any).body;
  const names: string[] = Array.isArray(body?.names) ? body.names.filter((n: any) => typeof n === 'string') : [];

  if (names.length === 0) {
    ctx.status = 400;
    ctx.body = { error: 'No collection names provided. Send { names: ["a", "b"] }.' };
    await next();
    return;
  }

  const db = ctx.db;

  // Re-derive the set of deletable (user) collections server-side — do NOT trust the client.
  const analyzer = new CollectionAnalyzer(db);
  const { collections } = await analyzer.analyze();
  const userNames = new Set(collections.filter((c) => c.category === 'user').map((c) => c.name));

  const results: Array<{ name: string; status: 'ok' | 'error' | 'skipped'; rows?: number; error?: string }> = [];

  for (const name of names) {
    if (!userNames.has(name)) {
      results.push({ name, status: 'skipped', error: 'Not a user collection — refused for safety.' });
      continue;
    }
    try {
      // Best-effort row count for the report (before the table is dropped).
      let rows: number | undefined;
      try {
        const collection = db.getCollection(name);
        const tableName = (collection as any)?.tableName?.() as string;
        if (tableName) {
          const r = (await db.sequelize.query(`SELECT COUNT(*) AS count FROM ${pgIdent(tableName)}`, { plain: true })) as any;
          rows = parseInt(r?.count ?? '0', 10);
        }
      } catch {
        /* ignore count errors */
      }

      // Canonical delete: destroying the collections row → beforeDestroy → remove() → drop table + relations.
      await db.getRepository('collections').destroy({ filterByTk: name });
      // Belt-and-suspenders: clear any leftover field rows for this collection.
      try { await db.getRepository('fields').destroy({ filter: { collectionName: name } }); } catch { /* ignore */ }

      results.push({ name, status: 'ok', rows });
    } catch (err: any) {
      results.push({ name, status: 'error', error: err?.message || String(err) });
    }
  }

  const okCount = results.filter((r) => r.status === 'ok').length;
  ctx.body = { results, deleted: okCount, restartRequired: okCount > 0 };
  await next();
}
