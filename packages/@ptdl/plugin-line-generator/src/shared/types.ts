// @ptdl/plugin-line-generator — config shape for a "line generator" rule.
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
    src?: any;
    rule?: any;
    derived?: Record<string, any>;
    outputs?: Record<string, any>;
    dropped?: boolean;
    reason?: string;
  }>;
  grouped?: GeneratedRow[];
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
  /** populated only when generateCore is called with ctx.debug — powers the step-by-step preview. */
  trace?: PreviewTrace;
}
