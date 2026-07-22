// @tuanla90/plugin-line-generator — config shape for a "line generator" rule.
//
// One LineGenConfig = one button that, from a parent record + a rule table, produces N child rows
// in one transaction (snapshot; not live). Covers BOM explosion, commission split, cost allocation —
// the difference between them is ONLY config, not code. See PLAN.md.

export interface MatchPair {
  /** Field on the RULE row. May be a dot-path across a relation, e.g. 'commission_rule_group.shipping_type'. */
  ruleField: string;
  /** Field on the SOURCE row (falls back to the parent record when the source row lacks it). */
  sourceField: string;
}

export interface NamedFormula {
  /** Target column on the generated child row (for lineOutputs), or scope var name (for deriveVars). */
  targetField: string;
  /** Expression over the scope {parent, src, rule, user, runVersion, ...derived} + helpers + formulajs. */
  formula: string;
  /** lineOutputs only: if the evaluated value is null/undefined, DROP the whole row (a skip, not an error). */
  required?: boolean;
}

export interface DerivedVar {
  name: string;
  formula: string;
}

export interface RoundingCfg {
  /** Numeric output fields to round. */
  fields: string[];
  /** Decimal places (e.g. 0 for whole currency units). */
  precision: number;
  /** Largest-remainder: after rounding within a group, push the leftover to the last row so the group total is exact. */
  remainderToLast?: boolean;
  /** Group key for the remainder redistribution (defaults to no grouping = one global bucket). */
  groupBy?: string[];
}

/** Operators shared by every condition surface (guard + rule filters). */
export type CondOp = 'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains';

export interface GuardCond {
  field: string;
  op?: CondOp;
  value: any;
}

/**
 * One rule-filter row (v0.6 unified — replaces matchMap + ruleFilter). `value` is what the user TYPES:
 *  - 'true' / 'false' / a number      → that literal
 *  - starts with parent./src.         → evaluated as an expression against the record (dynamic match)
 *  - anything else                    → the literal string
 * Resolved server-side at query time (buildRuleFilter).
 */
export interface RuleWhere {
  field: string; // rule field, dot-path across relations allowed
  op?: CondOp;
  value: string;
}

/** Per-stage snapshot returned by previewInline({ debug:true }) so the editor can step through the run. */
export interface PreviewTrace {
  parent?: any;
  srcRows?: any[];
  rules?: any[];
  pairs?: Array<{
    index?: number;
    /** v0.8 pipeline: which join step this pair belongs to (0-based). Absent for the single-join path. */
    step?: number;
    src?: any;
    rule?: any;
    derived?: Record<string, any>;
    outputs?: Record<string, any>;
    dropped?: boolean;
    reason?: string;
  }>;
  grouped?: GeneratedRow[];
  /** v0.8 pipeline: one summary row per join step (rule table, rule count, rows out). */
  steps?: Array<{ index: number; stepType?: string; ruleCollection?: string; relationPath?: string; ruleCount?: number; outputCount?: number }>;
  /** parentUpdates evaluated (debug only) so the preview shows what will be written back + surfaces errors. */
  parentUpdates?: Array<{ field: string; formula: string; value?: any; error?: string }>;
}

/** Column definition for the INLINE rule grid — the "standardized shape" of a rule row. */
export interface RuleFieldDef {
  name: string;
  label?: string;
  type?: 'text' | 'number' | 'select';
  /** select only */
  options?: string[];
}

/** One inline scope: "when to apply" conditions on the parent + the rule rows used when it applies. */
export interface InlineScope {
  name: string;
  enabled?: boolean;
  /** ALL conditions must hold on the parent record (same semantics as guard). Empty = always applies. */
  when?: GuardCond[];
  /** Rule rows — arbitrary objects shaped by ruleFields; formulas read them as `rule.*`. */
  rules: Record<string, any>[];
}

/**
 * v0.8 — ONE join step in an ordered N-step pipeline (`LineGenConfig.joinSteps`). Each step is a
 * self-contained join with its OWN RIGHT side + ON conditions + fan-out outputs + optional self-recursion.
 * The OUTPUT rows of step i become the INPUT rows (`src.*`) of step i+1 — so a step's formulas read
 * `src.*` = the current input row (carrying forward the accumulated fields from prior steps), `rule.*` =
 * this step's matched RIGHT row, and `parent.*` = the shared parent record. Quantities multiply naturally
 * down the chain (e.g. `qty = NUM(src.qty) * NUM(rule.qty_per_unit)`).
 *
 * A step has TWO source flavours:
 *  - `stepType:'config'` (default): RIGHT = an INDEPENDENT master/config table (`ruleCollection`), matched
 *    by the ON conditions (`ruleWhere` + optional `matchTiers`). The server queries that table.
 *  - `stepType:'relation'`: RIGHT = a DEPENDENT association (`relationPath`) FOLLOWED from each input row to
 *    its FK-linked child records — no table scan, only the indexed related rows. Those related records ARE
 *    the fan-out (read as `rule.*`), and `ruleWhere`/`matchTiers` may still OPTIONALLY post-filter them.
 *    This generalises the `sourceLinesPath` hop (order → order_items) to any step.
 *
 * The join fields below MIRROR the same-named `LineGenConfig` fields (so the single-join path is just the
 * 1-step case). Reuses the SAME engine helpers per step (condListPass / selectMatchedRules / recurseExplode /
 * lineOutputs eval) via `runJoinStep`.
 */
export interface JoinStep {
  /** 'config' (default) = join a master/config table; 'relation' = follow an existing hasMany/o2m association. */
  stepType?: 'config' | 'relation';
  /** relation step: the association on the current input rows to follow (its child records become `rule.*`). */
  relationPath?: string;
  /** config step: the master/config table joined on the ON conditions (used as-is, no migration). */
  ruleCollection?: string;
  /** config step: appends[] loaded onto each rule row of this step (e.g. 'material'). */
  ruleAppends?: string[];
  /** Base ON conditions (AND). config step: the join filter. relation step: an OPTIONAL post-filter. */
  ruleWhere?: RuleWhere[];
  /** OPTIONAL priority-tier matching for this step (same shape/semantics as LineGenConfig.matchTiers). */
  matchTiers?: RuleWhere[][];
  /** Intermediate named expressions for this step (evaluated before this step's lineOutputs). */
  deriveVars?: DerivedVar[];
  /** Expression on {src, rule, parent, ...derived}: truthy => skip this (src,rule) pair for this step. */
  skipIf?: string | null;
  /** One entry per generated column produced by this step (the row that flows to the next step's `src`). */
  lineOutputs: NamedFormula[];
  /** OPTIONAL: collapse this step's OUTPUT rows on these keys (numeric fields SUMmed) before the next step. */
  groupBy?: string[] | null;
  /** OPTIONAL: numeric fields to SUM when this step groups (default: inferred numeric outputs). */
  sumFields?: string[];
  /** OPTIONAL self-join recursion for THIS step (same semantics as LineGenConfig.recurse et al.). */
  recurse?: boolean;
  recurseParentKey?: string;
  recurseChildKey?: string;
  recurseQtyField?: string;
  maxDepth?: number;
  recurseOutput?: 'leaves' | 'all';
}

export interface LineGenConfig {
  /** Stable identifier, stamped onto every generated row (markerField) so regenerate can find its own output. */
  key: string;
  title: string;
  enabled: boolean;

  /** Parent collection the button lives on (e.g. 'orders'). */
  sourceCollection: string;
  /** hasMany assoc used as the input rows; null/omitted => the parent record itself is the single source row. */
  sourceLinesPath?: string | null;

  /** Where rules come from: 'collection' (default — an external data table, good for large/imported
   *  master data like BOM norms) or 'inline' (rules defined right inside this config via scopes —
   *  no external tables needed; good for small, stable, admin-managed rule sets like commission). */
  ruleSource?: 'collection' | 'inline';

  /** INLINE mode: the standardized columns of a rule row (renders the rule grid). */
  ruleFields?: RuleFieldDef[];
  /** INLINE mode: scopes ("when to use" on the parent) each carrying their rule rows. */
  scopes?: InlineScope[];

  /** COLLECTION mode: rule/config collection (e.g. 'commission_rules'). Used AS-IS — no migration into a plugin-owned table. */
  ruleCollection?: string;
  /** v0.6 UNIFIED rule filter: only rule rows where ALL of these hold are used. `value` is a typed
   *  literal or a parent./src. reference (see RuleWhere). Replaces matchMap + ruleFilter. */
  ruleWhere?: RuleWhere[];
  /**
   * v0.7 OPTIONAL priority-tier matching ("specific overrides general"). An ORDERED list of tiers;
   * each tier is an array of conditions (AND within a tier), same shape/semantics as `ruleWhere`.
   * `matchTiers` is applied AMONG the rules that already pass the BASE `ruleWhere` filter — it does
   * NOT replace it. Tier 0 = most specific.
   *
   * For EACH source row, the tiers are evaluated top-down and the FIRST tier that yields ≥1 matching
   * rule is used (STOP there — no fall-through). Auto-exclude prevents double-counting: when a lower
   * tier i is evaluated, a candidate rule only counts if it satisfies tier i AND every field named by a
   * HIGHER tier's condition is BLANK/null on that rule row — so a "specific" row (whose specific field is
   * filled) is never also caught by the general fallback tier.
   *
   * Absent/empty ⇒ behave exactly as before (every `ruleWhere`-passing rule is used). Back-compat.
   */
  matchTiers?: RuleWhere[][];
  /** @deprecated legacy — read for back-compat; new configs use ruleWhere. Join field↔field. */
  matchMap?: MatchPair[];
  /** @deprecated legacy — read for back-compat; new configs use ruleWhere. Static filter object. */
  ruleFilter?: Record<string, any>;
  /** appends[] loaded onto the PARENT record so formulas can walk parent.* relations. */
  preload?: string[];
  /** appends[] loaded onto each SOURCE-LINE row (relative to the source-lines collection) so formulas
   *  can walk src.* relations. Server prefixes them with sourceLinesPath when loading the parent. */
  srcAppends?: string[];
  /** appends[] loaded onto each rule row (e.g. 'commission_rule_group'). */
  ruleAppends?: string[];

  /** Intermediate named expressions evaluated (in order) before lineOutputs; results injected into scope. */
  deriveVars?: DerivedVar[];
  /** Expression on {src, rule, parent, ...derived}: truthy => skip this (src,rule) pair before evaluating outputs. */
  skipIf?: string | null;
  /** One entry per generated column. */
  lineOutputs: NamedFormula[];

  /** Group key(s) to collapse rows on (e.g. ['material_id']); numeric fields are SUMmed. null => no grouping. */
  groupBy?: string[] | null;
  /** Numeric fields to SUM when grouping (default: every output whose values are all numbers). */
  sumFields?: string[];

  /**
   * v0.7 OPTIONAL recursive explosion (multi-level BOM = self-join on the RULE table). After the initial
   * explosion (source ⋈ config → children), each generated child whose `recurseChildKey` value re-joins the
   * SAME config (rows where `recurseParentKey` == that value) is a SUB-ASSEMBLY and is exploded again, with
   * the SAME ruleWhere/matchTiers; a child that re-joins NOTHING is a LEAF (raw material) and is kept. qty
   * multiplies down the tree. Absent/false ⇒ single-pass as before. Back-compat.
   */
  recurse?: boolean;
  /** RIGHT/config field holding the "parent product" key of a config row (e.g. bom.product_id). The self-join key. */
  recurseParentKey?: string;
  /** Generated child field holding the component id that becomes the NEXT level's parent key (e.g. output material_id). */
  recurseChildKey?: string;
  /** Output qty field multiplied down the tree: child.qty = parent.qty × per-unit qty (e.g. 'qty'). See generateCore. */
  recurseQtyField?: string;
  /** Cyclic-BOM / runaway backstop — max recursion depth (default 20). */
  maxDepth?: number;
  /** 'leaves' (default) = keep only leaf rows (drop intermediate sub-assemblies); 'all' = keep every level
   *  (each row stamped with `_level` + `_recurseParent`). */
  recurseOutput?: 'leaves' | 'all';

  /**
   * v0.8 OPTIONAL ordered N-STEP JOIN PIPELINE. When present + non-empty, the engine runs the source rows
   * through each step in order (each step joins its OWN table/relation and fans out); the OUTPUT of step i is
   * the INPUT (`src.*`) of step i+1, so quantities multiply down the chain. After the last step, the
   * TOP-LEVEL `groupBy`/`sumFields`/`rounding` apply and the rows are written to `targetPath`. When ABSENT,
   * the engine runs the existing v0.7 single-join path UNCHANGED (full back-compat).
   *
   * The initial input is the source rows (`sourceLinesPath` hop, or the parent record itself) — exactly as
   * the single-join path. A `stepType:'relation'` step can also replace the `sourceLinesPath` hop.
   */
  joinSteps?: JoinStep[];
  /**
   * v0.8 fan-out safety: N chained fan-outs can explode combinatorially. If the working row set exceeds this
   * at ANY step boundary (or while a step recurses), the WHOLE run is ABORTED with a clear error (surfaced in
   * CoreResult.aborted + to the client) — never a silent truncate or a hang. Default 10000.
   */
  maxRows?: number;

  /** hasMany assoc on the parent that receives the generated rows (e.g. 'order_commissions'). */
  targetPath: string;
  /** FK column on the target collection pointing back to the parent (e.g. 'order_id'). */
  targetForeignKey: string;

  /** Write policy. DEFAULT (and the only mode the UI offers since v0.4): 'append' — always add rows,
   *  never delete; duplicate-prevention is the condition + parentUpdates flag's job (pre/post model),
   *  row cleanup is the user's. 'replace'/'block-if-edited' remain ENGINE-ONLY for legacy configs
   *  (they need markerField to find their own rows). 'version' ≡ append. */
  regenPolicy?: 'replace' | 'append' | 'version' | 'block-if-edited';
  /** Parent field holding the prior run count; runVersion = value + 1 (default 0 => runVersion 1). */
  runVersionSource?: string;

  rounding?: RoundingCfg;
  /** v0 validation: sum of `sumField` across generated rows must equal `sumEquals` (e.g. 1 for 100%). */
  validations?: { sumField?: string; sumEquals?: number; tolerance?: number };

  /** Activation mode. 'manual' (default) = a button on the record; `guard` is the button's show-if AND
   *  the server-enforced precondition. 'auto' = NO button — a server save-hook on sourceCollection runs
   *  the generator whenever a record satisfies `guard` (ai-column autorun pattern); pair it with a
   *  parentUpdates flag that breaks the condition so it runs once (unticking the flag = re-run). */
  trigger?: 'manual' | 'auto';
  /** THE condition (one concept for both modes): manual = show-if + server guard; auto = trigger condition. */
  guard?: GuardCond[];
  /** Parent columns updated in the SAME transaction after rows are written (bookkeeping flags/counters). */
  parentUpdates?: NamedFormula[];

  /** OPTIONAL since v0.4 (no default): target column to stamp the generator `key` into — an audit
   *  mapping ("which generator made this row") the user can point at any column, or leave off entirely
   *  (then the target table needs no special columns). Required only by legacy replace/block-if-edited. */
  markerField?: string;
  /** OPTIONAL (no default): target column for a content hash (legacy block-if-edited only). */
  hashField?: string;
}

export interface GeneratedRow {
  [field: string]: any;
}

export interface CoreResult {
  rows: GeneratedRow[];
  /** (src,rule) pairs that were skipped, with a reason (for the preview report). */
  skipped: Array<{ rule?: any; reason: string; detail?: string }>;
  /** per-formula evaluation errors (rule/field/message) — surfaced but non-fatal. */
  errors: Array<{ rule?: any; field: string; message: string }>;
  /** v0.8 pipeline safety: set when the run was ABORTED (e.g. maxRows exceeded). When set, `rows` is empty
   *  and the caller MUST treat the run as failed (the server returns ok:false with this reason/detail). */
  aborted?: { reason: string; detail?: string };
  /** populated only when generateCore is called with ctx.debug — powers the step-by-step preview. */
  trace?: PreviewTrace;
}
