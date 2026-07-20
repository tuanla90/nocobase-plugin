// Server side of the line generator: load the parent + rules from the DB, run the pure core, then
// write the generated child rows (+ parent bookkeeping) in ONE transaction. The math/matching/skip
// logic lives in generateCore (shared, unit-tested) — this file only does I/O.

import { condsPass, generateCore, resolveInlineRules } from '../shared/generateCore';
import { evalExpr } from '../shared/evalExpr';
import type { LineGenConfig } from '../shared/types';

type AnyObj = Record<string, any>;

function plain(m: any): AnyObj {
  return m && typeof m.toJSON === 'function' ? m.toJSON() : m;
}

/**
 * repository appends does NOT reliably materialize INTERMEDIATE relations of a nested path (unlike the
 * HTTP :get API) — appending only 'a.b.c' can leave parent.a missing. Expand every path to include all
 * its prefixes ('a.b.c' → 'a', 'a.b', 'a.b.c') so leaf-only configs load the whole chain.
 */
function expandAppends(paths?: string[]): string[] {
  const out = new Set<string>();
  for (const p of paths || []) {
    const segs = String(p).split('.').map((s) => s.trim()).filter(Boolean);
    for (let i = 1; i <= segs.length; i++) out.add(segs.slice(0, i).join('.'));
  }
  return [...out];
}

/**
 * Resolve a user-typed ruleWhere `value` string into a real comparison value:
 *  - '' → undefined (caller skips the condition)
 *  - 'true'/'false' → boolean
 *  - /^-?\d+(\.\d+)?$/ → Number
 *  - starts with parent/src/rule → evaluated as an expression against the record (dynamic match)
 *  - wrapped in '…' or "…" → the inner string
 *  - anything else → the literal string
 */
function resolveWhereValue(raw: string, parent: AnyObj): any {
  const s = String(raw ?? '').trim();
  if (s === '') return undefined;
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  if (/^(parent|src|rule)\b/.test(s)) return evalExpr(raw, { parent }).value;
  const m = s.match(/^'(.*)'$/) || s.match(/^"(.*)"$/);
  if (m) return m[1];
  return s;
}

/**
 * Build the NocoBase rule filter. v0.6: prefer the unified `ruleWhere` (each {field, op?, value} resolved
 * against the parent via resolveWhereValue and mapped to a filter operator; dot-paths across relations
 * allowed). Falls back to the legacy ruleFilter + matchMap path when `ruleWhere` is absent (back-compat).
 */
function buildRuleFilter(config: LineGenConfig, parent: AnyObj): AnyObj {
  if (config.ruleWhere) {
    const filter: AnyObj = {};
    for (const w of config.ruleWhere || []) {
      if (!w || !w.field) continue;
      const value = resolveWhereValue(w.value, parent);
      if (value === undefined) continue; // '' or an unresolved parent ref → skip this condition
      switch (w.op || 'eq') {
        case 'ne': filter[w.field] = { $ne: value }; break;
        case 'gt': filter[w.field] = { $gt: value }; break;
        case 'lt': filter[w.field] = { $lt: value }; break;
        case 'gte': filter[w.field] = { $gte: value }; break;
        case 'lte': filter[w.field] = { $lte: value }; break;
        case 'contains': filter[w.field] = { $includes: value }; break;
        default: filter[w.field] = value; break; // eq
      }
    }
    return filter;
  }

  // Legacy back-compat: static ruleFilter + matchMap resolved against the parent (source-less only).
  const filter: AnyObj = { ...(config.ruleFilter || {}) };
  if (!config.sourceLinesPath) {
    for (const m of config.matchMap || []) {
      const segs = m.sourceField.split('.');
      let v: any = parent;
      for (const s of segs) v = v == null ? undefined : v[s];
      if (v !== undefined) filter[m.ruleField] = v;
    }
  }
  return filter;
}

function checkValidations(config: LineGenConfig, rows: AnyObj[]): { ok: boolean; detail?: string } {
  const v = config.validations;
  if (!v || !v.sumField || v.sumEquals === undefined) return { ok: true };
  const sum = rows.reduce((s, r) => s + (Number(r[v.sumField!]) || 0), 0);
  const tol = v.tolerance ?? 1e-6;
  if (Math.abs(sum - v.sumEquals) > tol) return { ok: false, detail: `Tổng ${v.sumField} = ${sum}, cần ${v.sumEquals}` };
  return { ok: true };
}

export class GenerateManager {
  db: any;
  logger: any;
  /** Injected by the plugin: broadcast a live-refresh over WS to all clients of this app. */
  notify?: (collections: string[]) => void;

  constructor(db: any, logger?: any) {
    this.db = db;
    this.logger = logger;
  }

  /** Resolve the collection name behind config.targetPath (the hasMany relation on the source collection). */
  private targetCollectionName(config: LineGenConfig): string | undefined {
    try {
      const field = this.db.getCollection(config.sourceCollection)?.getField(config.targetPath);
      return field?.target || field?.options?.target;
    } catch {
      return undefined;
    }
  }

  /**
   * @param opts.dryRun  evaluate + validate but do NOT write (preview).
   * Returns a structured result — never throws for business failures (guard/validation), only rethrows
   * unexpected DB errors from inside the transaction.
   */
  async run(config: LineGenConfig, filterByTk: any, opts: { userId?: any; dryRun?: boolean; ignoreGuard?: boolean; debug?: boolean } = {}): Promise<AnyObj> {
    const { db } = this;
    const parentRepo = db.getRepository(config.sourceCollection);
    // Parent appends = preload (parent relations) + the source-lines relation and its own appends
    // (prefixed by sourceLinesPath) so `src.*` relations materialize on each line row.
    const appends = expandAppends(config.preload);
    if (config.sourceLinesPath) {
      const srcPaths = [config.sourceLinesPath, ...(config.srcAppends || []).map((a) => `${config.sourceLinesPath}.${a}`)];
      for (const p of expandAppends(srcPaths)) if (!appends.includes(p)) appends.push(p);
    }
    const parentModel = await parentRepo.findOne({ filterByTk, appends });
    if (!parentModel) return { ok: false, error: 'record-not-found' };
    const parent = plain(parentModel);

    // ignoreGuard (dry-run only): the settings editor previews WHAT WOULD be generated even on a
    // record that fails the condition — the result carries guardOk/guardDetail so the UI can warn.
    const guard = condsPass(config.guard, parent);
    if (!guard.ok && !(opts.dryRun && opts.ignoreGuard)) return { ok: false, error: 'guard-failed', detail: guard.detail };

    const runVersion = (config.runVersionSource ? Number(parent[config.runVersionSource]) || 0 : 0) + 1;
    const srcRows = config.sourceLinesPath ? parent[config.sourceLinesPath] || [] : [];

    // Rules: inline (embedded in this config, filtered by scope `when`) or an external collection.
    let rules: AnyObj[];
    if (config.ruleSource === 'inline') {
      rules = resolveInlineRules(config, parent);
    } else {
      if (!config.ruleCollection) return { ok: false, error: 'bad-config', detail: 'ruleCollection missing' };
      const filter = buildRuleFilter(config, parent);
      const ruleModels = await db.getRepository(config.ruleCollection).find({ filter, appends: expandAppends(config.ruleAppends) });
      rules = (ruleModels || []).map(plain);
    }

    const user = opts.userId != null ? { id: opts.userId } : null;
    const core = generateCore(config, { parent, srcRows, rules, user, runVersion, debug: opts.debug });

    const valid = checkValidations(config, core.rows);
    if (!valid.ok) {
      // NB: key is `lines`, NOT `rows` — a top-level `rows` collides with NocoBase's list-response
      // wrapping (body {rows,count} → data=rows[], meta), which would drop ok/skipped/errors.
      return { ok: false, error: 'validation-failed', detail: valid.detail, lines: core.rows, skipped: core.skipped, errors: core.errors };
    }

    if (opts.dryRun) {
      return { ok: true, dryRun: true, guardOk: guard.ok, guardDetail: guard.detail, lines: core.rows, skipped: core.skipped, errors: core.errors, trace: core.trace, runVersion, ruleCount: rules.length };
    }

    const marker = config.markerField || '_genRule';
    const assocRepo = db.getRepository(`${config.sourceCollection}.${config.targetPath}`, filterByTk);

    await db.sequelize.transaction(async (transaction: any) => {
      if (config.regenPolicy === 'replace' || config.regenPolicy === 'block-if-edited') {
        await assocRepo.destroy({ filter: { [marker]: config.key }, transaction });
      }
      for (const row of core.rows) {
        await assocRepo.create({ values: row, transaction });
      }
      if (config.parentUpdates && config.parentUpdates.length) {
        const values: AnyObj = {};
        for (const pu of config.parentUpdates) {
          const r = evalExpr(pu.formula, { parent, user, runVersion });
          if (!r.error) values[pu.targetField] = r.value === undefined ? null : r.value;
        }
        // context marker lets the auto-trigger hook ignore this self-inflicted update (loop break).
        if (Object.keys(values).length) await parentRepo.update({ filterByTk, values, transaction, context: { __ptdlLineGenInternal: true } });
      }
    });

    const targetCol = this.targetCollectionName(config);
    try {
      this.notify?.([targetCol, config.sourceCollection].filter(Boolean) as string[]);
    } catch (e: any) {
      this.logger?.warn?.(`[line-generator] ws notify failed: ${e?.message || e}`);
    }

    return { ok: true, created: core.rows.length, skipped: core.skipped, errors: core.errors, runVersion };
  }
}
