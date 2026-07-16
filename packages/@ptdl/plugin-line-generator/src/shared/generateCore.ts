// The pure heart of the plugin: (config, parent, srcRows, rules) -> generated child rows.
// NO NocoBase / DB imports — so it is exercised directly by the Node test (test/commission.test.mjs)
// and reused verbatim by the server manager (generator.ts). Data loading + transactional write live there.

import type { LineGenConfig, CoreResult, GeneratedRow, GuardCond, PreviewTrace } from './types';
import { evalExpr } from './evalExpr';

/** AND of condition checks on a record — shared semantics for guard AND inline-scope `when`. Supports the
 *  full CondOp set; eq/ne keep the loose boolean/string semantics, gt/lt/gte/lte compare numerically,
 *  contains is a substring test. */
export function condsPass(conds: GuardCond[] | undefined, record: any): { ok: boolean; detail?: string } {
  for (const g of conds || []) {
    const a = record?.[g.field];
    const op = g.op || 'eq';
    // eq baseline: booleans coerce (null→false), everything else compares as strings.
    const eq = typeof g.value === 'boolean' ? !!a === g.value : String(a ?? '') === String(g.value ?? '');
    let matches: boolean;
    switch (op) {
      case 'ne': matches = !eq; break;
      case 'gt': matches = Number(a) > Number(g.value); break;
      case 'lt': matches = Number(a) < Number(g.value); break;
      case 'gte': matches = Number(a) >= Number(g.value); break;
      case 'lte': matches = Number(a) <= Number(g.value); break;
      case 'contains': matches = String(a).includes(String(g.value)); break;
      default: matches = eq; break; // 'eq'
    }
    if (!matches) {
      const opTxt =
        op === 'ne' ? '≠ ' : op === 'gt' ? '> ' : op === 'lt' ? '< ' : op === 'gte' ? '≥ ' : op === 'lte' ? '≤ ' : op === 'contains' ? '⊇ ' : '';
      return { ok: false, detail: `${g.field} = ${JSON.stringify(a)} (cần ${opTxt}${JSON.stringify(g.value)})` };
    }
  }
  return { ok: true };
}

/** INLINE mode: rules = the rows of every enabled scope whose `when` conditions hold on the parent. */
export function resolveInlineRules(config: LineGenConfig, parent: any): any[] {
  const out: any[] = [];
  for (const scope of config.scopes || []) {
    if (scope.enabled === false) continue;
    if (!condsPass(scope.when, parent).ok) continue;
    for (const r of scope.rules || []) out.push({ ...r, _scope: scope.name });
  }
  return out;
}

type EvalFn = (formula: string, scope: Record<string, any>) => { value?: any; error?: string };

/** Walk a dot-path on a plain object (rule may carry appended relations, e.g. commission_rule_group.shipping_type). */
function getPath(obj: any, path: string): any {
  const segs = String(path).split('.').map((s) => s.trim()).filter(Boolean);
  let cur = obj;
  for (const s of segs) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[s];
  }
  return cur;
}

/** Loose equality used for match pairs: numbers compare numerically, everything else by string. */
function looseEq(a: any, b: any): boolean {
  if (a === null || a === undefined || b === null || b === undefined) return a == b; // eslint-disable-line eqeqeq
  if (typeof a === 'number' || typeof b === 'number') {
    const na = Number(a);
    const nb = Number(b);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na === nb;
  }
  return String(a) === String(b);
}

/** A (src, rule) pair matches when every matchMap pair agrees (rule dot-path vs src-then-parent value). */
function pairMatches(config: LineGenConfig, src: any, rule: any, parent: any): boolean {
  for (const m of config.matchMap || []) {
    const ruleVal = getPath(rule, m.ruleField);
    const srcVal = src && m.sourceField in src ? src[m.sourceField] : getPath(parent, m.sourceField);
    if (!looseEq(ruleVal, srcVal)) return false;
  }
  return true;
}

/**
 * Resolve a ruleWhere `value` token against the full pair scope. Mirrors the server's resolveWhereValue
 * (generator.ts) but sees parent/src/rule — so per-line refs like `src.product_id` resolve here.
 *  '' → undefined (skip) · 'true'/'false' → boolean · numeric → Number · parent/src/rule → expr eval ·
 *  '…'/"…" → inner string · else → literal string.
 */
function resolveWhereValue(raw: any, scope: Record<string, any>, evaluate: EvalFn): any {
  const s = String(raw ?? '').trim();
  if (s === '') return undefined;
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  if (/^(parent|src|rule)\b/.test(s)) return evaluate(raw, scope).value;
  const m = s.match(/^'(.*)'$/) || s.match(/^"(.*)"$/);
  if (m) return m[1];
  return s;
}

/**
 * Every ruleWhere condition holds for this (src, rule) pair. Parent-only / literal conditions are already
 * enforced by the DB prefilter (buildRuleFilter), but re-checking is cheap and makes the core correct on
 * its own; per-line conditions (e.g. `product_id = src.product_id`) can ONLY be enforced here, since the
 * DB query can't know which src row a rule will pair with.
 */
function ruleWherePass(config: LineGenConfig, src: any, rule: any, parent: any, evaluate: EvalFn): boolean {
  for (const w of config.ruleWhere || []) {
    if (!w || !w.field) continue;
    const right = resolveWhereValue(w.value, { parent, src, rule }, evaluate);
    if (right === undefined) continue; // '' or an unresolved ref → skip this condition
    const left = getPath(rule, w.field);
    const op = w.op || 'eq';
    const eq = typeof right === 'boolean' ? !!left === right : looseEq(left, right);
    let matches: boolean;
    switch (op) {
      case 'ne': matches = !eq; break;
      case 'gt': matches = Number(left) > Number(right); break;
      case 'lt': matches = Number(left) < Number(right); break;
      case 'gte': matches = Number(left) >= Number(right); break;
      case 'lte': matches = Number(left) <= Number(right); break;
      case 'contains': matches = String(left).includes(String(right)); break;
      default: matches = eq; break; // 'eq'
    }
    if (!matches) return false;
  }
  return true;
}

/** Deterministic content hash (order-independent over keys) for hand-edit detection on regenerate. */
function hashRow(row: GeneratedRow, markerField: string, hashField: string): string {
  const keys = Object.keys(row).filter((k) => k !== hashField).sort();
  const norm = keys.map((k) => `${k}=${row[k] === null || row[k] === undefined ? '' : String(row[k])}`).join('|');
  let h = 5381;
  for (let i = 0; i < norm.length; i++) h = ((h << 5) + h + norm.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function round(n: number, precision: number): number {
  const f = Math.pow(10, precision);
  return Math.round((Number(n) + Number.EPSILON) * f) / f;
}

/**
 * Largest-remainder rounding: within each group, round every row's field then give the leftover
 * (rawTotal - roundedTotal) to the row with the largest fractional part so the group total stays exact.
 */
function applyRounding(rows: GeneratedRow[], cfg: NonNullable<LineGenConfig['rounding']>): void {
  const precision = cfg.precision ?? 0;
  const groupKey = (r: GeneratedRow) => (cfg.groupBy && cfg.groupBy.length ? cfg.groupBy.map((k) => String(r[k])).join('') : '__all__');
  for (const field of cfg.fields || []) {
    const groups = new Map<string, GeneratedRow[]>();
    for (const r of rows) {
      const g = groupKey(r);
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(r);
    }
    for (const group of groups.values()) {
      let rawTotal = 0;
      let roundedTotal = 0;
      const fracs: Array<{ r: GeneratedRow; frac: number }> = [];
      for (const r of group) {
        const raw = Number(r[field]) || 0;
        const rd = round(raw, precision);
        rawTotal += raw;
        roundedTotal += rd;
        const scaled = raw * Math.pow(10, precision);
        fracs.push({ r, frac: scaled - Math.floor(scaled) });
        r[field] = rd;
      }
      if (!cfg.remainderToLast) continue;
      const diff = round(rawTotal - roundedTotal, precision);
      if (diff !== 0 && group.length) {
        // Give the whole leftover to the row with the largest fractional part (ties -> last).
        let target = fracs[0];
        for (const f of fracs) if (f.frac >= target.frac) target = f;
        target.r[field] = round((Number(target.r[field]) || 0) + diff, precision);
      }
    }
  }
}

/** Group rows by config.groupBy, summing numeric fields. First row's non-numeric values are kept. */
function groupRows(config: LineGenConfig, rows: GeneratedRow[]): GeneratedRow[] {
  const keys = config.groupBy!;
  const sumFields =
    config.sumFields && config.sumFields.length
      ? config.sumFields
      : // infer: every output field whose value is numeric on the first row and NOT a group key
        Object.keys(rows[0] || {}).filter((k) => !keys.includes(k) && typeof rows[0][k] === 'number');
  const buckets = new Map<string, GeneratedRow>();
  for (const r of rows) {
    const gk = keys.map((k) => String(r[k])).join('');
    if (!buckets.has(gk)) {
      buckets.set(gk, { ...r });
    } else {
      const acc = buckets.get(gk)!;
      for (const f of sumFields) acc[f] = (Number(acc[f]) || 0) + (Number(r[f]) || 0);
    }
  }
  return [...buckets.values()];
}

/** One entry in trace.pairs — the per-(src,rule) step-through record for the debug preview. */
type TracePair = NonNullable<PreviewTrace['pairs']>[number];

export function generateCore(
  config: LineGenConfig,
  ctx: { parent: any; srcRows: any[]; rules: any[]; user?: any; runVersion?: number; debug?: boolean },
  evaluate: EvalFn = evalExpr,
): CoreResult {
  // v0.4: stamping is OPT-IN. No configured column = no stamp = the target table needs no magic columns.
  const markerField = config.markerField;
  const hashField = config.hashField;
  const runVersion = ctx.runVersion ?? 1;
  const skipped: CoreResult['skipped'] = [];
  const errors: CoreResult['errors'] = [];
  let rows: GeneratedRow[] = [];

  const srcRows = config.sourceLinesPath ? ctx.srcRows || [] : [ctx.parent];

  // Debug trace: only collected when ctx.debug is set (previewInline) — pure add-on, never changes math.
  const debug = !!ctx.debug;
  const trace: PreviewTrace | undefined = debug
    ? { parent: ctx.parent, srcRows, rules: ctx.rules, pairs: [] }
    : undefined;

  for (const src of srcRows) {
    for (const rule of ctx.rules || []) {
      if (!pairMatches(config, src, rule, ctx.parent)) continue;
      if (!ruleWherePass(config, src, rule, ctx.parent, evaluate)) continue;

      // Base scope for this pair.
      const scope: Record<string, any> = { parent: ctx.parent, src, rule, user: ctx.user, runVersion };

      // Trace entry for this matched pair (records derived vars, outputs, and drop reason as we go).
      const tEntry: TracePair | null = debug
        ? { index: trace!.pairs!.length, src, rule, derived: {}, outputs: {} }
        : null;
      if (tEntry) trace!.pairs!.push(tEntry);

      // Derived intermediates (evaluated in order; each visible to the next + to outputs).
      let derailed = false;
      for (const dv of config.deriveVars || []) {
        const r = evaluate(dv.formula, scope);
        if (r.error) {
          errors.push({ rule, field: `derive:${dv.name}`, message: r.error });
          if (tEntry) {
            tEntry.dropped = true;
            tEntry.reason = `derive-error:${dv.name}`;
          }
          derailed = true;
          break;
        }
        scope[dv.name] = r.value;
        if (tEntry) tEntry.derived![dv.name] = r.value;
      }
      if (derailed) continue;

      // skipIf
      if (config.skipIf) {
        const r = evaluate(config.skipIf, scope);
        if (r.error) {
          errors.push({ rule, field: 'skipIf', message: r.error });
          if (tEntry) {
            tEntry.dropped = true;
            tEntry.reason = 'skipIf-error';
          }
          continue;
        }
        if (r.value) {
          skipped.push({ rule, reason: 'skipIf' });
          if (tEntry) {
            tEntry.dropped = true;
            tEntry.reason = 'skipIf';
          }
          continue;
        }
      }

      // Outputs
      const row: GeneratedRow = {};
      let drop = false;
      for (const out of config.lineOutputs || []) {
        const r = evaluate(out.formula, scope);
        if (r.error) {
          errors.push({ rule, field: out.targetField, message: r.error });
          if (out.required) {
            if (tEntry) {
              tEntry.dropped = true;
              tEntry.reason = `output-error:${out.targetField}`;
            }
            drop = true;
            break;
          }
          row[out.targetField] = null;
          if (tEntry) tEntry.outputs![out.targetField] = null;
          continue;
        }
        if (out.required && (r.value === null || r.value === undefined)) {
          skipped.push({ rule, reason: 'required-null', detail: out.targetField });
          if (tEntry) {
            tEntry.dropped = true;
            tEntry.reason = `required-null:${out.targetField}`;
          }
          drop = true;
          break;
        }
        row[out.targetField] = r.value === undefined ? null : r.value;
        if (tEntry) tEntry.outputs![out.targetField] = row[out.targetField];
      }
      if (drop) continue;

      if (markerField) row[markerField] = config.key;
      rows.push(row);
    }
  }

  if (config.groupBy && config.groupBy.length && rows.length) {
    rows = groupRows(config, rows);
  }
  if (config.rounding && rows.length) {
    applyRounding(rows, config.rounding);
  }
  if (hashField) {
    for (const row of rows) {
      row[hashField] = hashRow(row, markerField || '', hashField);
    }
  }

  const result: CoreResult = { rows, skipped, errors };
  if (trace) {
    trace.grouped = rows; // after group/round/hash, exactly what will be returned/written
    // Evaluate parentUpdates too (they only run in the real transaction) so the debug preview shows
    // what will be written to the parent — and SURFACES formula errors that would otherwise be silent.
    if ((config.parentUpdates || []).length) {
      trace.parentUpdates = [];
      for (const pu of config.parentUpdates!) {
        const r = evaluate(pu.formula, { parent: ctx.parent, user: ctx.user, runVersion });
        trace.parentUpdates.push({ field: pu.targetField, formula: pu.formula, value: r.error ? undefined : r.value, error: r.error });
        if (r.error) errors.push({ field: `parentUpdate:${pu.targetField}`, message: r.error });
      }
    }
    result.trace = trace;
  }
  return result;
}
