// The pure heart of the plugin: (config, parent, srcRows, rules) -> generated child rows.
// NO NocoBase / DB imports — so it is exercised directly by the Node test (test/commission.test.mjs)
// and reused verbatim by the server manager (generator.ts). Data loading + transactional write live there.
//
// v0.8: the single JOIN was generalised into an ORDERED N-STEP JOIN PIPELINE. The v0.7 explode logic
// (evalPair + level-0 matching + FEATURE-A tiers + FEATURE-B recursion) was refactored into a reusable
// `runJoinStep(step, inputRows, parent, rules, …)` that BOTH the legacy single-join path AND the pipeline
// call. A config with no `joinSteps` runs runJoinStep exactly once (byte-identical to v0.7 — Scenario J).

import type {
  LineGenConfig, JoinStep, CoreResult, GeneratedRow, GuardCond, PreviewTrace, RuleWhere, DerivedVar, NamedFormula, MatchPair,
} from './types';
import { evalExpr } from './evalExpr';

/** The subset of fields the per-step engine helpers read — satisfied by BOTH `JoinStep` and `LineGenConfig`
 *  (so the single-join path passes the whole config as its one step). */
type JoinLike = {
  stepType?: 'config' | 'relation';
  relationPath?: string;
  ruleWhere?: RuleWhere[];
  matchTiers?: RuleWhere[][];
  matchMap?: MatchPair[];
  deriveVars?: DerivedVar[];
  skipIf?: string | null;
  lineOutputs: NamedFormula[];
  groupBy?: string[] | null;
  sumFields?: string[];
  recurse?: boolean;
  recurseParentKey?: string;
  recurseChildKey?: string;
  recurseQtyField?: string;
  maxDepth?: number;
  recurseOutput?: 'leaves' | 'all';
};

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

/** Coerce a hasMany/o2m value read off an input row into an array of related records (the relation fan-out). */
function asArray(v: any): any[] {
  if (Array.isArray(v)) return v;
  return v === null || v === undefined ? [] : [v];
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

/** A (src, rule) pair matches when every matchMap pair agrees (rule dot-path vs src-then-parent value).
 *  Legacy single-join only — a JoinStep has no matchMap, so this is a no-op (returns true) for pipeline steps. */
function pairMatches(step: JoinLike, src: any, rule: any, parent: any): boolean {
  for (const m of step.matchMap || []) {
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
 * AND of a list of RuleWhere conditions for one (src, rule) pair — shared by the base `ruleWhere` filter
 * AND every `matchTiers` tier. Parent-only / literal conditions are already enforced by the DB prefilter
 * (buildRuleFilter), but re-checking is cheap and makes the core correct on its own; per-line conditions
 * (e.g. `product_id = src.product_id`) can ONLY be enforced here, since the DB query can't know which src
 * row a rule will pair with.
 */
function condListPass(conds: RuleWhere[] | undefined, src: any, rule: any, parent: any, evaluate: EvalFn): boolean {
  for (const w of conds || []) {
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

/** Every BASE `ruleWhere` condition holds for this (src, rule) pair (see condListPass). */
function ruleWherePass(step: JoinLike, src: any, rule: any, parent: any, evaluate: EvalFn): boolean {
  return condListPass(step.ruleWhere, src, rule, parent, evaluate);
}

/** Blank test for tier auto-exclude: null / undefined / '' all count as "not filled in". */
function isBlankVal(v: any): boolean {
  return v === null || v === undefined || v === '';
}

/**
 * FEATURE A — priority-tier matching ("specific overrides general"). Among `candidates` (rules that already
 * pass the BASE ruleWhere for this src), evaluate `step.matchTiers` top-down and return the FIRST tier's
 * matching rules — STOP at the first non-empty tier (no fall-through). Auto-exclude prevents double-counting:
 * when a lower tier i is evaluated, a candidate rule is skipped if ANY field named by a HIGHER tier's
 * condition is filled on that rule — so a "specific" row (whose specific field is set) is never also caught
 * by the general fallback tier. No matchTiers ⇒ return candidates unchanged (back-compat, order preserved).
 */
function selectMatchedRules(step: JoinLike, src: any, candidates: any[], parent: any, evaluate: EvalFn): any[] {
  const tiers = step.matchTiers;
  if (!tiers || !tiers.length) return candidates;
  for (let i = 0; i < tiers.length; i++) {
    const tier = tiers[i] || [];
    // Fields discriminated by every HIGHER tier (0..i-1) — must be BLANK on a rule for it to fall to tier i.
    const higherFields: string[] = [];
    for (let j = 0; j < i; j++) for (const w of tiers[j] || []) if (w && w.field) higherFields.push(w.field);
    const matched = candidates.filter((rule) => {
      for (const f of higherFields) if (!isBlankVal(getPath(rule, f))) return false; // auto-exclude
      return condListPass(tier, src, rule, parent, evaluate);
    });
    if (matched.length) return matched; // first non-empty tier wins → STOP
  }
  return []; // no tier matched → no rules for this src
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
  const groupKey = (r: GeneratedRow) => (cfg.groupBy && cfg.groupBy.length ? cfg.groupBy.map((k) => String(r[k])).join('') : '__all__');
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

/** Group rows by `keys`, summing numeric fields. First row's non-numeric values are kept. Shared by the
 *  top-level config group AND per-step group (a JoinStep may collapse its own output before the next step). */
function groupRows(step: JoinLike, rows: GeneratedRow[]): GeneratedRow[] {
  const keys = step.groupBy!;
  const sumFields =
    step.sumFields && step.sumFields.length
      ? step.sumFields
      : // infer: every output field whose value is numeric on the first row and NOT a group key
        Object.keys(rows[0] || {}).filter((k) => !keys.includes(k) && typeof rows[0][k] === 'number');
  const buckets = new Map<string, GeneratedRow>();
  for (const r of rows) {
    const gk = keys.map((k) => String(r[k])).join('');
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

/** (src, rule) → generated row (or null when dropped). Shared by the initial pass and recursion. */
type EvalPairFn = (src: any, rule: any) => GeneratedRow | null;

/** No-op-unless-exceeded row-cap checker; throws the MAX_ROWS sentinel (caught by the driver) when tripped. */
type CapFn = (n: number) => void;
const MAX_ROWS_SENTINEL = '__ptdlLineGenMaxRows__';

/** Cycle-guard seed for a level-0 row: the parent key it originated from (src's recurseParentKey value). */
function seedAncestry(step: JoinLike, src: any): Set<string> {
  const f = step.recurseParentKey;
  const v = f ? getPath(src, f) : undefined;
  return v === null || v === undefined || v === '' ? new Set<string>() : new Set<string>([String(v)]);
}

/**
 * FEATURE B — recursive self-join explosion (multi-level BOM). Starting from the level-0 rows, each generated
 * child whose `recurseChildKey` value re-joins the config (rules where `recurseParentKey` == that value) is a
 * SUB-ASSEMBLY → exploded again with src = that child; a child that re-joins nothing is a LEAF (raw material)
 * → kept. qty multiplies down: with `recurseQtyField` set, the deeper pass is evaluated with that field forced
 * to 1 (→ per-unit output) then scaled by the parent row's qty, so child.qty = parent.qty × per-unit exactly.
 * A key reappearing in its own ancestry (cycle) or exceeding `maxDepth` stops that branch (logged in skipped).
 * `recurseOutput`: 'leaves' keeps only leaves (drops intermediate sub-assemblies); 'all' keeps every node,
 * stamped with `_level` + `_recurseParent`. The SAME ruleWhere/matchTiers apply at every level.
 */
function recurseExplode(
  step: JoinLike,
  level0: Array<{ row: GeneratedRow; src: any }>,
  parent: any,
  rules: any[],
  evaluate: EvalFn,
  evalPair: EvalPairFn,
  skipped: CoreResult['skipped'],
  checkCap: CapFn,
): GeneratedRow[] {
  const parentKeyField = step.recurseParentKey;
  const childKeyField = step.recurseChildKey;
  const qtyField = step.recurseQtyField;
  const maxDepth = step.maxDepth ?? 20;
  const mode = step.recurseOutput || 'leaves';
  const out: GeneratedRow[] = [];
  const push = (r: GeneratedRow) => { out.push(r); checkCap(out.length); };

  // Config rows whose recurseParentKey == key (the components of the sub-assembly `key`). Empty ⇒ leaf.
  const childRulesOf = (key: any): any[] => {
    if (!parentKeyField || key === null || key === undefined || key === '') return [];
    return rules.filter((r) => looseEq(getPath(r, parentKeyField), key));
  };

  // Explode one generated row at `level`; `ancestry` = parent keys already descended through (cycle guard).
  const walk = (row: GeneratedRow, level: number, ancestry: Set<string>): void => {
    if (mode === 'all') row._level = level;
    const key = childKeyField ? row[childKeyField] : undefined; // this component becomes the next parent key
    const childRules = childRulesOf(key);
    if (!childRules.length) { push(row); return; } // LEAF (re-joins nothing) → keep

    const keyStr = String(key);
    if (mode === 'all') push(row); // keep the sub-assembly node itself in 'all' mode

    if (ancestry.has(keyStr)) { // CYCLE → stop this branch (don't recurse into it)
      skipped.push({ reason: 'recurse-cycle', detail: keyStr });
      if (mode === 'leaves') push(row); // keep it rather than silently losing the material
      return;
    }
    if (level >= maxDepth) { // hard backstop (cyclic-BOM / runaway)
      skipped.push({ reason: 'recurse-max-depth', detail: keyStr });
      if (mode === 'leaves') push(row);
      return;
    }

    // Deeper level: src = this generated row (qty multiplies down). With recurseQtyField, force it to 1 so
    // lineOutputs yield the PER-UNIT qty, then scale by this row's qty — exact `parent.qty × per-unit`.
    const nextAncestry = new Set(ancestry);
    nextAncestry.add(keyStr);
    const srcBase = qtyField ? { ...row, [qtyField]: 1 } : row;
    const candidates = childRules.filter(
      (rule) => pairMatches(step, row, rule, parent) && ruleWherePass(step, row, rule, parent, evaluate),
    );
    const matched = selectMatchedRules(step, row, candidates, parent, evaluate);
    for (const rule of matched) {
      const child = evalPair(srcBase, rule);
      if (!child) continue;
      if (qtyField) child[qtyField] = (Number(row[qtyField]) || 0) * (Number(child[qtyField]) || 0);
      if (mode === 'all') child._recurseParent = key;
      walk(child, level + 1, nextAncestry);
    }
  };

  for (const s of level0) walk(s.row, 0, seedAncestry(step, s.src));
  return out;
}

/** Context shared across every step of a run (mutated in place). */
interface StepCtx {
  user?: any;
  runVersion: number;
  skipped: CoreResult['skipped'];
  errors: CoreResult['errors'];
  debug: boolean;
  tracePairs?: TracePair[];
  stepIndex?: number; // only set for the pipeline path (tags each trace pair with its step)
  checkCap: CapFn;
}

/**
 * Run ONE join step: fan `inputRows` out against this step's RIGHT side (a config table `rules`, OR — for a
 * `stepType:'relation'` step — each input row's own related records), evaluate this step's derive/skip/outputs
 * per (src, rule) pair, and (if the step recurses) explode the self-join. Returns the OUTPUT rows (which become
 * the next step's input). Pushes skips/errors/trace into the shared ctx. NO grouping/marker/hash here — the
 * driver applies those. This IS the v0.7 single-join explode, extracted so both paths share it exactly.
 */
function runJoinStep(
  step: JoinLike,
  inputRows: any[],
  parent: any,
  rules: any[],
  evaluate: EvalFn,
  ctx: StepCtx,
): GeneratedRow[] {
  const { skipped, errors, debug, tracePairs, checkCap } = ctx;
  const isRelation = step.stepType === 'relation' && !!step.relationPath;

  // ONE (src, rule) → generated row (or null if dropped by derive/skipIf/required-null/output-error).
  const evalPair: EvalPairFn = (src, rule) => {
    const scope: Record<string, any> = { parent, src, rule, user: ctx.user, runVersion: ctx.runVersion };

    // Trace entry for this matched pair (records derived vars, outputs, and drop reason as we go).
    const tEntry: TracePair | null = debug && tracePairs
      ? { index: tracePairs.length, ...(ctx.stepIndex !== undefined ? { step: ctx.stepIndex } : {}), src, rule, derived: {}, outputs: {} }
      : null;
    if (tEntry) tracePairs!.push(tEntry);

    // Derived intermediates (evaluated in order; each visible to the next + to outputs).
    for (const dv of step.deriveVars || []) {
      const r = evaluate(dv.formula, scope);
      if (r.error) {
        errors.push({ rule, field: `derive:${dv.name}`, message: r.error });
        if (tEntry) { tEntry.dropped = true; tEntry.reason = `derive-error:${dv.name}`; }
        return null;
      }
      scope[dv.name] = r.value;
      if (tEntry) tEntry.derived![dv.name] = r.value;
    }

    // skipIf
    if (step.skipIf) {
      const r = evaluate(step.skipIf, scope);
      if (r.error) {
        errors.push({ rule, field: 'skipIf', message: r.error });
        if (tEntry) { tEntry.dropped = true; tEntry.reason = 'skipIf-error'; }
        return null;
      }
      if (r.value) {
        skipped.push({ rule, reason: 'skipIf' });
        if (tEntry) { tEntry.dropped = true; tEntry.reason = 'skipIf'; }
        return null;
      }
    }

    // Outputs
    const row: GeneratedRow = {};
    for (const out of step.lineOutputs || []) {
      const r = evaluate(out.formula, scope);
      if (r.error) {
        errors.push({ rule, field: out.targetField, message: r.error });
        if (out.required) {
          if (tEntry) { tEntry.dropped = true; tEntry.reason = `output-error:${out.targetField}`; }
          return null;
        }
        row[out.targetField] = null;
        if (tEntry) tEntry.outputs![out.targetField] = null;
        continue;
      }
      if (out.required && (r.value === null || r.value === undefined)) {
        skipped.push({ rule, reason: 'required-null', detail: out.targetField });
        if (tEntry) { tEntry.dropped = true; tEntry.reason = `required-null:${out.targetField}`; }
        return null;
      }
      row[out.targetField] = r.value === undefined ? null : r.value;
      if (tEntry) tEntry.outputs![out.targetField] = row[out.targetField];
    }
    return row;
  };

  // Recursion pool: config step ⇒ the loaded rule table; relation step ⇒ the union of every input row's
  // related records (so a SELF-referential association can still recurse by key).
  const pool = isRelation ? inputRows.flatMap((s) => asArray(getPath(s, step.relationPath!))) : rules || [];

  // Initial explosion (level 0): per source row, pick the matched rules, then evaluate outputs. The RIGHT
  // side is either the shared config table (filtered by matchMap+ruleWhere) or THIS row's own related rows
  // (fanned out by the FK, optionally post-filtered by ruleWhere). Carry the src so recursion can seed its guard.
  const level0: Array<{ row: GeneratedRow; src: any }> = [];
  for (const src of inputRows) {
    const candidates = isRelation
      ? asArray(getPath(src, step.relationPath!)).filter((rule) => ruleWherePass(step, src, rule, parent, evaluate))
      : (rules || []).filter((rule) => pairMatches(step, src, rule, parent) && ruleWherePass(step, src, rule, parent, evaluate));
    const matched = selectMatchedRules(step, src, candidates, parent, evaluate);
    for (const rule of matched) {
      const row = evalPair(src, rule);
      if (row) level0.push({ row, src });
    }
  }
  checkCap(level0.length);

  // FEATURE B: recursive self-join (multi-level BOM) when enabled, else the single pass (byte-identical).
  const rows = step.recurse
    ? recurseExplode(step, level0, parent, pool, evaluate, evalPair, skipped, checkCap)
    : level0.map((s) => s.row);
  checkCap(rows.length);
  return rows;
}

export function generateCore(
  config: LineGenConfig,
  ctx: { parent: any; srcRows: any[]; rules: any[]; stepRules?: any[][]; user?: any; runVersion?: number; debug?: boolean },
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

  // PIPELINE vs single-join. usePipeline ⇒ run each joinStep in order (output of step i = input of i+1);
  // else the v0.7 single-join = one runJoinStep over the whole config (byte-identical). The join fields on a
  // JoinStep MIRROR LineGenConfig, so `config` itself is a valid one-step.
  const usePipeline = !!(config.joinSteps && config.joinSteps.length);
  const steps: JoinLike[] = usePipeline ? (config.joinSteps as JoinStep[]) : [config as JoinLike];
  // Per-step rules: the server loads one array per config step (relation steps get [] — their fan-out is the
  // input rows' association). Single-join ⇒ [ctx.rules]. Fallback to empty arrays when not provided.
  const stepRulesArr: any[][] = usePipeline ? (ctx.stepRules || steps.map(() => [])) : [ctx.rules || []];

  // Debug trace: only collected when ctx.debug is set (previewInline) — pure add-on, never changes math.
  const debug = !!ctx.debug;
  const trace: PreviewTrace | undefined = debug
    ? {
        parent: ctx.parent,
        srcRows,
        rules: usePipeline ? ([] as any[]).concat(...stepRulesArr) : ctx.rules,
        pairs: [],
        ...(usePipeline ? { steps: [] as NonNullable<PreviewTrace['steps']> } : {}),
      }
    : undefined;

  // FEATURE (v0.8) — fan-out safety. N chained fan-outs can explode; abort the WHOLE run with a clear error
  // if the working set exceeds maxRows at any step boundary (or while a step recurses). Never truncate/hang.
  const maxRows = config.maxRows ?? 10000;
  const checkCap: CapFn = (n: number) => {
    if (n > maxRows) throw { [MAX_ROWS_SENTINEL]: true, count: n, limit: maxRows };
  };

  let aborted: CoreResult['aborted'] | undefined;
  try {
    let cur: any[] = srcRows;
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const rulesForStep = stepRulesArr[i] || [];
      cur = runJoinStep(step, cur, ctx.parent, rulesForStep, evaluate, {
        user: ctx.user,
        runVersion,
        skipped,
        errors,
        debug,
        tracePairs: trace?.pairs,
        stepIndex: usePipeline ? i : undefined,
        checkCap,
      });
      // Per-step group/SUM (pipeline only — the single-join path applies config.groupBy in the common tail).
      if (usePipeline && step.groupBy && step.groupBy.length && cur.length) cur = groupRows(step, cur);
      checkCap(cur.length);
      if (trace?.steps) {
        const js = config.joinSteps![i];
        trace.steps.push({ index: i, stepType: js.stepType || 'config', ruleCollection: js.ruleCollection, relationPath: js.relationPath, ruleCount: rulesForStep.length, outputCount: cur.length });
      }
    }
    rows = cur;
  } catch (e: any) {
    if (e && e[MAX_ROWS_SENTINEL]) {
      aborted = { reason: 'max-rows-exceeded', detail: `Vượt giới hạn số dòng (maxRows ${e.limit}): tập đang xử lý ${e.count} dòng. Thu hẹp điều kiện nối / bật gộp theo bước, hoặc tăng maxRows.` };
      rows = [];
    } else {
      throw e;
    }
  }

  if (!aborted) {
    // Common tail (runs after the last step for BOTH paths): top-level group/SUM, rounding, marker, hash.
    if (config.groupBy && config.groupBy.length && rows.length) rows = groupRows(config as JoinLike, rows);
    if (config.rounding && rows.length) applyRounding(rows, config.rounding);
    if (markerField) for (const row of rows) row[markerField] = config.key;
    if (hashField) for (const row of rows) row[hashField] = hashRow(row, markerField || '', hashField);
  }

  const result: CoreResult = { rows, skipped, errors };
  if (aborted) result.aborted = aborted;
  if (trace) {
    trace.grouped = rows; // after group/round/marker/hash, exactly what will be returned/written
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
