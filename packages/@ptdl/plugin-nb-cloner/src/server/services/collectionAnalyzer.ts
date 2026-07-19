import { Database } from '@nocobase/database';
import { pgIdent } from '../utils/db';

/**
 * Category of a collection, from the operator's point of view:
 *  - user    : a collection YOU created in the Collection Manager (real business data). This is what
 *              you normally clone. Signal: it's a row in the `collections` DB table (managed) AND is
 *              not owned by a plugin AND its physical table exists.
 *  - plugin  : a collection a plugin defined for its own config/data (origin = a package name).
 *  - system  : a framework/core collection defined in code (origin "core", not user-managed) — fields,
 *              uiSchemas, migrations, and any plugin collection that didn't declare an origin.
 *  - deleted : a managed collection whose physical table no longer exists (an orphan left behind).
 */
export type CollectionCategory = 'user' | 'plugin' | 'system' | 'deleted';

export interface CollectionInfo {
  name: string;
  title: string;
  category: CollectionCategory;
  origin: string;        // runtime Collection.origin: "core" or a package like "@ptdl/plugin-ip-guard"
  managed: boolean;      // present as a row in the `collections` DB table (created/managed via the UI)
  tableExists: boolean;  // the physical table responded to a COUNT
  tableName: string;
  fieldsCount: number;
  rowCount?: number;
  options: Record<string, any>;
}

export interface AnalyzeResult {
  collections: CollectionInfo[];
  counts: Record<CollectionCategory, number>;
}

export class CollectionAnalyzer {
  constructor(private db: Database) {}

  /** Names present in the `collections` DB table = collections created/managed via the UI. */
  private async managedNames(): Promise<Set<string>> {
    try {
      const rows: any[] = await this.db.getRepository('collections').find({ fields: ['name'] });
      return new Set(rows.map((r: any) => r.name));
    } catch {
      // Fallback: query the table directly (still works if the repository isn't ready).
      try {
        const [rows] = (await this.db.sequelize.query(`SELECT name FROM ${pgIdent('collections')}`)) as any;
        return new Set((rows as any[]).map((r) => r.name));
      } catch {
        return new Set();
      }
    }
  }

  async analyze(): Promise<AnalyzeResult> {
    const managed = await this.managedNames();
    const collections: CollectionInfo[] = [];
    const counts: Record<CollectionCategory, number> = { user: 0, plugin: 0, system: 0, deleted: 0 };

    for (const [name, collection] of this.db.collections) {
      const options = (collection as any).options || {};
      if (options.view) continue; // skip SQL views (derived, not clonable data)

      const rawTableName: string = (collection as any).tableName() as string;

      let rowCount: number | undefined;
      let tableExists = true;
      try {
        const result = (await this.db.sequelize.query(
          `SELECT COUNT(*) AS count FROM ${pgIdent(rawTableName)}`,
          { plain: true },
        )) as any;
        rowCount = parseInt(result?.count ?? '0', 10);
      } catch {
        rowCount = undefined;
        tableExists = false; // physical table missing/unreadable → likely a deleted/orphan collection
      }

      // Collection.origin = options.origin || "core". Non-"core" means a package owns it.
      const origin: string = (collection as any).origin || options.origin || 'core';
      const isManaged = managed.has(name);
      // "system" = NocoBase itself: framework core (origin core/@nocobase/database, code-defined) AND
      //            every @nocobase plugin (users, roles, workflows, files…). Intuitively these are all
      //            "NocoBase's own tables", so they group under System even though a plugin owns them.
      // "plugin"  = a THIRD-PARTY plugin's tables: a non-@nocobase package origin, OR (heuristic) a
      //            @ptdl code-defined collection that didn't declare an origin — its name starts "ptdl".
      const isThirdPartyOrigin = origin !== 'core' && !origin.startsWith('@nocobase');
      const looksLikePtdlTable = /^ptdl/i.test(name);
      const isPlugin = isThirdPartyOrigin || looksLikePtdlTable;

      let category: CollectionCategory;
      if (isManaged && !tableExists) category = 'deleted';
      else if (isPlugin) category = 'plugin';                 // third-party / @ptdl plugin tables
      else if (isManaged && origin === 'core') category = 'user'; // user-created (managed, no owner)
      else category = 'system';                               // framework core + all @nocobase plugins

      counts[category] += 1;
      collections.push({
        name,
        title: options.title || name,
        category,
        origin,
        managed: isManaged,
        tableExists,
        tableName: rawTableName,
        fieldsCount: collection.fields.size,
        rowCount,
        options,
      });
    }

    // Sort: user first (most useful), then plugin, system, deleted; alphabetical within a category.
    const order: Record<CollectionCategory, number> = { user: 0, plugin: 1, system: 2, deleted: 3 };
    collections.sort(
      (a, b) => order[a.category] - order[b.category] || a.name.localeCompare(b.name),
    );

    return { collections, counts };
  }
}
