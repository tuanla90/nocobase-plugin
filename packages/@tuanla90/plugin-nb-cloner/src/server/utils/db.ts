/**
 * Small DB helpers shared by the extractor / importer / analyzer.
 *
 * NB Cloner copies NocoBase's *system* tables (collections, fields, uiSchemas, flowModels, the menu
 * closure tables, ACL…) with hand-written SQL, because there is no ORM model for most of them and the
 * volume (flowModelTreePath is a closure table) rules out row-by-row repository calls. That SQL is
 * written for **PostgreSQL**: `ON CONFLICT … DO UPDATE`, `information_schema` PK discovery and
 * `"`-quoted identifiers. `assertPostgres()` fails fast with a clear message on any other dialect
 * instead of silently corrupting the target (e.g. SQLite has no `information_schema`, so PK discovery
 * would return nothing and every business row would insert-without-upsert).
 */

/** Quote an identifier (table/column) for PostgreSQL, escaping embedded double quotes. */
export function pgIdent(name: string): string {
  return `"${String(name).replace(/"/g, '""')}"`;
}

/** The Sequelize dialect of a NocoBase database ('postgres' | 'sqlite' | 'mysql' | …). */
export function getDialect(db: any): string {
  try {
    return db?.sequelize?.getDialect?.() || db?.options?.dialect || '';
  } catch {
    return '';
  }
}

/**
 * Throw a clear, user-facing error unless the target is PostgreSQL. Callers wrap it so the message
 * reaches the UI. English on purpose (server speaks English; the client localises known strings).
 */
export function assertPostgres(db: any): void {
  const dialect = getDialect(db);
  if (dialect !== 'postgres') {
    throw new Error(
      `NB Cloner supports PostgreSQL only. This app uses "${dialect || 'unknown'}". ` +
        `Export/import rely on PostgreSQL-specific SQL (ON CONFLICT upsert, information_schema). ` +
        `Run NB Cloner on a PostgreSQL-backed NocoBase.`,
    );
  }
}
