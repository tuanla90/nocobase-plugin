/**
 * Window / ledger fields — a stored ORDER-DEPENDENT column (running balance, later FIFO / moving-avg)
 * that auto-recomputes when a row in the SAME collection is created / updated / deleted. This is the
 * third computed-column mode, alongside local (computed.ts) and aggregate (rollup.ts):
 *
 *   local     : value = f(this row)
 *   aggregate : value = SUM/AVG(related rows)          — order-independent
 *   window    : value = running accumulator over a PARTITION, in ORDER          — order-DEPENDENT
 *
 * A window column is a normal (stored) field carrying an option blob:
 *   options.ptdlWindow = { partitionBy: string[], orderBy: string[], input, accumulator?, ... }
 * where partitionBy / orderBy / input are COLUMN names (for scalar fields the column = field name;
 * for a belongsTo, use its FK column, e.g. product_id). v1 accumulator = 'running_sum'
 * (running_sum = SUM(input) OVER (PARTITION BY partitionBy ORDER BY orderBy)).
 *
 * Implemented with a real SQL window function (`OVER()`) issued via sequelize.query, so it is exact and
 * cheap. On any change we recompute only the AFFECTED PARTITION (not the whole table); a re-partition
 * (row moved to another product/warehouse) recomputes both the old and the new partition. The raw
 * UPDATE bypasses model hooks, so it can never loop.
 */

import { excelToSql, isTranspileError } from '../shared/excelToSql';

type AnyDb = any;

/** How the window `input` is expressed: a column name, an Excel formula (transpiled to SQL), or raw SQL. */
export type WindowInputMode = 'column' | 'formula' | 'sql';

// All are PURE window functions (SUM/COUNT/MIN/MAX/AVG + ranking ROW_NUMBER) — exact + cheap, no recursion.
// (FIFO / moving-weighted-average are order-dependent WITH state → recursive CTE, added later.)
export type WindowAccumulator = 'running_sum' | 'running_count' | 'running_min' | 'running_max' | 'running_avg' | 'row_number';

const ACC_FN: Record<string, string> = {
  running_sum: 'SUM',
  running_count: 'COUNT',
  running_min: 'MIN',
  running_max: 'MAX',
  running_avg: 'AVG',
  row_number: 'ROW_NUMBER',
};
// Accumulators that need NO input column (COUNT(*) / ROW_NUMBER()).
const NO_INPUT = new Set(['running_count', 'row_number']);

/** One ORDER BY term: a column + direction. */
export type OrderSpec = { field: string; dir: 'asc' | 'desc' };

export type WindowConfig = {
  partitionBy: string[]; // column names to partition by (e.g. ['product_id', 'warehouse'])
  orderBy: OrderSpec[]; // ordered terms defining the running order (tie-break with the pk, e.g. moved_at asc, id asc)
  input: string; // a column name, an Excel formula, or a raw SQL expression fed to the accumulator
  inputMode: WindowInputMode; // how to interpret `input`
  inputExpr?: boolean; // legacy: input is raw SQL (kept for back-compat; equivalent to inputMode='sql')
  accumulator?: WindowAccumulator;
};

type WindowDef = {
  collection: string;
  tableName: string;
  targetColumn: string; // the stored column we fill (e.g. balance_after)
  pk: string;
  partitionBy: string[];
  orderBy: OrderSpec[];
  inputColumn: string; // column name, Excel formula, or raw SQL expression
  inputMode: WindowInputMode;
  accumulator: WindowAccumulator;
};

/** Resolve the input mode from a config blob, honouring the legacy `inputExpr` boolean. */
function readInputMode(wc: any): WindowInputMode {
  const m = wc?.inputMode;
  if (m === 'column' || m === 'formula' || m === 'sql') return m;
  return wc?.inputExpr ? 'sql' : 'column';
}

/** Accept the config from a runtime field (`options.ptdlWindow`) or an API-flattened field (`ptdlWindow`). */
export function readWindowConfig(field: any): WindowConfig | null {
  const wc = field?.options?.ptdlWindow ?? field?.options?.window ?? field?.ptdlWindow;
  if (!wc) return null;
  const partitionBy = asList(wc.partitionBy);
  const orderBy = asOrder(wc.orderBy);
  const accumulator = (wc.accumulator || 'running_sum') as WindowAccumulator;
  // order is always required; input is required for every accumulator EXCEPT count / row_number.
  if (!orderBy.length) return null;
  if (!NO_INPUT.has(accumulator) && !wc.input) return null;
  return { partitionBy, orderBy, input: String(wc.input || ''), inputMode: readInputMode(wc), inputExpr: !!wc.inputExpr, accumulator };
}

/** A raw SQL expression input is admin-configured, but block the obvious statement-break / comment
 *  injection tokens as defense-in-depth (the expression is embedded verbatim into `<fn>(<expr>) OVER…`). */
function assertSafeExpr(expr: string) {
  if (/;|--|\/\*|\*\//.test(expr)) throw new Error('[ptdl-window] unsafe SQL expression (contains ; or a comment)');
}

/** A list field may arrive as an array, a comma string (UI text input), or a single value. */
function asList(v: any): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (typeof v === 'string') return v.split(',').map((s) => s.trim()).filter(Boolean);
  return [];
}

/** Normalize orderBy into OrderSpec[]. Accepts: [{field,dir}], ['col', …] (→ asc), or a "a, b" string. */
function asOrder(v: any): OrderSpec[] {
  const one = (x: any): OrderSpec | null => {
    if (!x) return null;
    if (typeof x === 'string') { const s = x.trim(); return s ? { field: s, dir: 'asc' } : null; }
    if (x.field) return { field: String(x.field).trim(), dir: x.dir === 'desc' ? 'desc' : 'asc' };
    return null;
  };
  if (Array.isArray(v)) return v.map(one).filter(Boolean) as OrderSpec[];
  if (typeof v === 'string') return v.split(',').map(one).filter(Boolean) as OrderSpec[];
  return [];
}

export class WindowManager {
  private db: AnyDb;
  private logger: any;
  private defs: WindowDef[] = [];
  private hooked = new Set<string>();
  private dialect: string;
  /** Injected by the plugin: broadcast a live-refresh to all clients of this app. */
  notify?: (collections: string[]) => void;

  constructor(db: AnyDb, logger?: any) {
    this.db = db;
    this.logger = logger || console;
    this.dialect = (() => {
      try {
        return this.db.sequelize.getDialect();
      } catch {
        return 'sqlite';
      }
    })();
  }

  /** Quote an identifier for the active dialect (mysql/mariadb = backticks, everyone else = double quotes). */
  private q(id: string): string {
    return this.dialect === 'mysql' || this.dialect === 'mariadb'
      ? '`' + String(id).replace(/`/g, '``') + '`'
      : '"' + String(id).replace(/"/g, '""') + '"';
  }

  /** ORDER BY clause from OrderSpec[], e.g. `"moved_at" ASC, "id" ASC`. */
  private orderSql(order: OrderSpec[]): string {
    return order.map((o) => `${this.q(o.field)} ${o.dir === 'desc' ? 'DESC' : 'ASC'}`).join(', ');
  }

  /** The full `<fn>(…) OVER (…)` expression. Aggregates get a running frame; ROW_NUMBER (a ranking
   *  function) must NOT have a frame clause (Postgres rejects it). `partSql` is '' or `PARTITION BY … `. */
  private overExpr(d: WindowDef, partSql: string): string {
    const order = this.orderSql(d.orderBy);
    if (d.accumulator === 'row_number') return `ROW_NUMBER() OVER (${partSql}ORDER BY ${order})`;
    const fn = ACC_FN[d.accumulator] || 'SUM';
    // input: a column name (quoted), an Excel formula (transpiled to SQL), or raw SQL (verbatim, guarded).
    let inputSql = '';
    if (d.inputColumn) {
      if (d.inputMode === 'sql') { assertSafeExpr(d.inputColumn); inputSql = d.inputColumn; }
      else if (d.inputMode === 'formula') {
        const r = excelToSql(d.inputColumn, { dialect: this.dialect, quoteId: (s) => this.q(s) });
        if (isTranspileError(r)) throw new Error(`[ptdl-window] công thức không hợp lệ: ${r.error}`);
        inputSql = r.sql;
      } else inputSql = this.q(d.inputColumn);
    }
    const arg = fn === 'COUNT' ? (inputSql || '*') : inputSql;
    return `${fn}(${arg}) OVER (${partSql}ORDER BY ${order} ROWS UNBOUNDED PRECEDING)`;
  }

  /** Re-read every window field across all collections and make sure this-collection hooks are attached. */
  scan(): WindowDef[] {
    const defs: WindowDef[] = [];
    for (const collection of this.db.collections.values()) {
      for (const field of collection.fields.values()) {
        const wc = readWindowConfig(field);
        if (!wc) continue;
        defs.push({
          collection: collection.name,
          tableName: collection.model?.tableName || collection.name,
          targetColumn: field.options?.field || field.name,
          pk: collection.model?.primaryKeyAttribute || 'id',
          partitionBy: wc.partitionBy,
          orderBy: wc.orderBy,
          inputColumn: wc.input,
          inputMode: wc.inputMode,
          accumulator: wc.accumulator || 'running_sum',
        });
      }
    }
    this.defs = defs;
    for (const d of defs) this.ensureHook(d.collection);
    this.logger?.info?.(`[ptdl-window] ${defs.length} window field(s) across ${this.hooked.size} collection(s)`);
    return defs;
  }

  private defsFor(collection: string): WindowDef[] {
    return this.defs.filter((d) => d.collection === collection);
  }

  private ensureHook(collection: string) {
    if (!collection || this.hooked.has(collection)) return;
    this.hooked.add(collection);
    // create → WithAssociations (FK columns already set). update/destroy → raw (previous() is reliable).
    this.db.on(`${collection}.afterCreateWithAssociations`, (i: any, o: any) => this.onChange(collection, i, o, false));
    this.db.on(`${collection}.afterUpdate`, (i: any, o: any) => this.onChange(collection, i, o, true));
    this.db.on(`${collection}.afterDestroy`, (i: any, o: any) => this.onChange(collection, i, o, false));
  }

  /** Snapshot the partition key(s) of the touched row NOW (previous() is reset after commit), then
   *  recompute the affected partition(s) after the transaction commits. */
  private onChange(collection: string, instance: any, options: any, isUpdate: boolean) {
    const defs = this.defsFor(collection);
    if (!defs.length) return;
    const jobs: Array<{ d: WindowDef; parts: Array<Record<string, any>> }> = [];
    for (const d of defs) {
      const cur: Record<string, any> = {};
      for (const c of d.partitionBy) cur[c] = instance.get(c);
      const parts = [cur];
      if (isUpdate && typeof instance.previous === 'function') {
        const prev: Record<string, any> = {};
        let moved = false;
        for (const c of d.partitionBy) {
          prev[c] = instance.previous(c);
          if (prev[c] !== undefined && prev[c] !== cur[c]) moved = true;
        }
        if (moved) parts.push(prev); // re-partitioned → old partition needs recompute too
      }
      jobs.push({ d, parts });
    }
    this.afterCommit(options, async () => {
      const touched = new Set<string>();
      for (const { d, parts } of jobs) {
        for (const p of parts) {
          await this.recomputePartition(d, p);
          touched.add(d.collection);
        }
      }
      if (touched.size) {
        try {
          this.notify?.([...touched]);
        } catch (e: any) {
          this.logger?.warn?.(`[ptdl-window] notify failed: ${e?.message || e}`);
        }
      }
    });
  }

  private afterCommit(options: any, fn: () => Promise<void>) {
    const run = () => fn().catch((e) => this.logger?.error?.(`[ptdl-window] ${e?.message || e}`));
    const t = options?.transaction;
    if (t && typeof t.afterCommit === 'function') t.afterCommit(run);
    else run();
  }

  /** Recompute the running accumulator for ONE partition and write it into the stored column. */
  async recomputePartition(d: WindowDef, partVals: Record<string, any>) {
    const q = (s: string) => this.q(s);
    const repl: Record<string, any> = {};
    const whereSql = d.partitionBy.length
      ? d.partitionBy
          .map((c, i) => {
            repl[`p${i}`] = partVals[c];
            return partVals[c] == null ? `${q(c)} IS NULL` : `${q(c)} = :p${i}`;
          })
          .join(' AND ')
      : '1=1';
    const T = q(d.tableName);
    const sql =
      `WITH calc AS (` +
      ` SELECT ${q(d.pk)} AS __pk,` +
      ` ${this.overExpr(d, '')} AS __bal` +
      ` FROM ${T} WHERE ${whereSql})` +
      ` UPDATE ${T} SET ${q(d.targetColumn)} = (SELECT __bal FROM calc WHERE calc.__pk = ${T}.${q(d.pk)})` +
      ` WHERE ${whereSql}`;
    await this.db.sequelize.query(sql, { replacements: repl });
  }

  /** Every window field with its resolved config + titles — powers the central management page. */
  list(): Array<Record<string, any>> {
    const out: Array<Record<string, any>> = [];
    for (const collection of this.db.collections.values()) {
      for (const field of collection.fields.values()) {
        const wc = readWindowConfig(field);
        if (!wc) continue;
        out.push({
          collection: collection.name,
          collectionTitle: (collection.options && collection.options.title) || collection.name,
          field: field.name,
          fieldTitle: field.options?.uiSchema?.title || field.name,
          partitionBy: wc.partitionBy,
          orderBy: wc.orderBy,
          input: wc.input,
          inputMode: wc.inputMode,
          inputExpr: wc.inputExpr,
          accumulator: wc.accumulator || 'running_sum',
        });
      }
    }
    return out;
  }

  /** Full recompute across every partition (backfill / drift fix) — one window pass over the whole table. */
  async recomputeAll(opts?: { collection?: string; field?: string }): Promise<number> {
    const targets = this.defs.filter(
      (d) => (!opts?.collection || d.collection === opts.collection) && (!opts?.field || d.targetColumn === opts.field),
    );
    for (const d of targets) {
      const q = (s: string) => this.q(s);
      const partSql = d.partitionBy.length ? `PARTITION BY ${d.partitionBy.map(q).join(', ')} ` : '';
      const T = q(d.tableName);
      const sql =
        `WITH calc AS (` +
        ` SELECT ${q(d.pk)} AS __pk,` +
        ` ${this.overExpr(d, partSql)} AS __bal` +
        ` FROM ${T})` +
        ` UPDATE ${T} SET ${q(d.targetColumn)} = (SELECT __bal FROM calc WHERE calc.__pk = ${T}.${q(d.pk)})`;
      await this.db.sequelize.query(sql);
    }
    if (targets.length) {
      try {
        this.notify?.([...new Set(targets.map((d) => d.collection))]);
      } catch {
        /* ignore */
      }
    }
    return targets.length;
  }
}
