/**
 * Computed fields — a STORED field whose value is (re)computed from an Excel/formulajs formula and
 * kept in sync by the server on EVERY write path (form, quick-edit, API, bulk create, import).
 * Config is a "global rule" in the `ptdlComputedRules` collection, edited from the column ⚙ UI.
 *
 * THREE dependency kinds (declared in rule.deps), covering the full AppSheet-style recalc:
 *   - local     : a field on the SAME row.                        (Phase 1)
 *   - aggregate : SUM/COUNT/AVG/MIN/MAX over a hasMany/hasOne     (Phase 2 — roll-up, any depth)
 *   - lookup    : a field pulled through a belongsTo/hasOne       (Phase 3 — roll-down & fan-out)
 *
 * TWO recompute mechanisms:
 *   1. `beforeSave` (pure-local rules only): compute + `instance.set` → written in the SAME
 *      INSERT/UPDATE, returned to the client immediately, no loop, no deadlock. Mirrors NocoBase
 *      core plugin-field-formula.
 *   2. `afterCommit` cascade (any rule): a change to any dep source seeds a recursive
 *      `recomputeTarget` that loads the row (with the relations the formula needs), evaluates, writes
 *      with `hooks:false`, and PROPAGATES to dependents through an in-memory dependency graph — so a
 *      chain `item.line_amount → order.subtotal → order.total` (and N levels deep) settles in one pass.
 *      Loop-safe: writes use `hooks:false` (no re-trigger) + the graph is acyclic (checked at load) +
 *      a per-run `visited` set. Aggregates re-read committed state, so we flush level N before N+1.
 *
 * Formulas reference fields as `data.<field>` (relations: `data.items.line_amount`,
 * `data.product.unit_price`) — the engine compiles `new Function('data','value','record', …)`.
 * See docs/COMPUTED-FIELD-DESIGN.md and packages/@tuanla90/plugin-formula/COMPUTED-FIELD.md.
 */

import { evaluateFormula } from '../shared/formulaEngine';

type AnyDb = any;

export type ComputedDepKind = 'local' | 'aggregate' | 'lookup' | 'table';
export type ComputedDep = {
  kind: ComputedDepKind;
  field?: string; // local: same-row field · aggregate/lookup: the child/target field
  relation?: string; // aggregate: hasMany/hasOne · lookup: belongsTo/hasOne · table: alias used in formula
  collection?: string; // table: the config/lookup collection whose ALL rows load into `data.<alias>`
  fn?: string; // aggregate only (sum/count/avg/min/max) — informational; the SUM(...) lives in `formula`
};

/** The three independent moments a computed value can be (re)calculated — multi-select, like the AI plugin. */
export type TriggerKind = 'create' | 'update' | 'source';

/** Legacy single-string `runOn` → trigger set, so old rules keep working after this became multi-select. */
const LEGACY_TRIGGERS: Record<string, TriggerKind[]> = {
  both: ['create', 'update', 'source'], // was "Tạo & sửa" (fully live)
  create: ['create'], // was "Chỉ tạo" (sticky snapshot)
  self: ['create', 'update'], // was "Khi sửa dòng này" (own save, no fan-out)
  update: ['update', 'source'], // oldest "Chỉ sửa"
};

/** Normalize a stored `runOn` (comma-joined new form, a legacy single value, or an array) to a trigger set.
 *  undefined/null → default fully-live; '' or [] → NONE (user unchecked all = manual `Tính lại` only). */
export function normalizeTriggers(runOn: any): Set<TriggerKind> {
  if (runOn === undefined || runOn === null) return new Set(['create', 'update', 'source']);
  let arr: any[];
  if (Array.isArray(runOn)) arr = runOn;
  else {
    const s = String(runOn).trim();
    arr = !s ? [] : LEGACY_TRIGGERS[s] || s.split(',').map((x) => x.trim());
  }
  return new Set(arr.filter((x): x is TriggerKind => x === 'create' || x === 'update' || x === 'source'));
}

export type ComputedRule = {
  key: string;
  dataSourceKey: string;
  collectionName: string;
  targetField: string;
  formula: string;
  deps: ComputedDep[];
  runOn: string; // raw stored value (comma-joined triggers or a legacy token); parsed into `triggers`
  triggers: Set<TriggerKind>; // create / update / source — which moments recompute this rule
  enabled: boolean;
  onError: 'null' | 'keep';
  _resolved?: ResolvedDeps; // filled by buildGraph()
};

type AggEdge = {
  rule: ComputedRule;
  relation: string;
  childCollection: string;
  foreignKey: string; // FK on the child pointing at the parent
  sourceKey: string; // parent key the FK points at (usually pk)
  parentCollection: string;
  field?: string; // child field being aggregated (for change gating)
};
type LookupEdge = {
  rule: ComputedRule;
  relation: string;
  itemCollection: string; // collection carrying the computed field (the "many" side)
  foreignKey: string; // FK on the item pointing at the target
  targetKey: string; // key on the target the FK points at (usually pk)
  targetCollection: string;
  field?: string; // target field being read
};
type TableEdge = {
  rule: ComputedRule;
  tableCollection: string; // the config/lookup collection (ALL rows loaded)
  alias: string; // key under which rows are exposed in `data` (= the name used in the formula)
};
type ResolvedDeps = {
  local: string[];
  aggregate: AggEdge[];
  lookup: LookupEdge[];
  table: TableEdge[]; // whole-collection "lookup tables" (unrelated reference tables, AppSheet SELECT-style)
  appends: string[]; // relation names to load when evaluating this rule
  pureLocal: boolean;
};

const NUMERIC_TYPES = new Set(['integer', 'bigInt', 'double', 'decimal', 'float', 'real', 'number', 'percent']);
const INT_TYPES = new Set(['integer', 'bigInt']);
// Formulajs returns spreadsheet ERROR VALUES as plain strings (INDEX past the end → "#REF!", no match →
// "#N/A", bad arg → "#VALUE!"…) rather than throwing. Treat them as an error so the rule's `onError`
// (null/keep) applies — else the literal "#REF!" gets stored in the column (what the user was seeing).
const FORMULA_ERROR_VALUE = /^#(REF|N\/A|VALUE|DIV\/0|NAME|NUM|NULL|SPILL|CALC|GETTING_DATA|FIELD|BLOCKED|CONNECT|UNKNOWN)[!?]?$/i;
const isFormulaErrorValue = (v: any): boolean => typeof v === 'string' && FORMULA_ERROR_VALUE.test(v.trim());

function get(row: any, k: string): any {
  return typeof row?.get === 'function' ? row.get(k) : row?.[k];
}

export function readRuleRow(row: any): ComputedRule | null {
  const collectionName = get(row, 'collectionName');
  const targetField = get(row, 'targetField');
  const formula = get(row, 'formula');
  if (!collectionName || !targetField || !formula) return null;
  let deps = get(row, 'deps');
  if (typeof deps === 'string') {
    try {
      deps = deps.trim() ? JSON.parse(deps) : [];
    } catch {
      deps = [];
    }
  }
  if (!Array.isArray(deps)) deps = [];
  return {
    key: get(row, 'key') || `${get(row, 'dataSourceKey') || 'main'}:${collectionName}.${targetField}`,
    dataSourceKey: get(row, 'dataSourceKey') || 'main',
    collectionName,
    targetField,
    formula: String(formula),
    deps: deps as ComputedDep[],
    runOn: get(row, 'runOn') == null ? 'both' : String(get(row, 'runOn')),
    triggers: normalizeTriggers(get(row, 'runOn')),
    enabled: get(row, 'enabled') !== false,
    onError: (get(row, 'onError') as any) === 'keep' ? 'keep' : 'null',
  };
}

export class ComputedManager {
  private db: AnyDb;
  private logger: any;
  private rulesByTarget = new Map<string, ComputedRule>(); // `${collection}.${field}` -> rule
  private rulesByCollection = new Map<string, ComputedRule[]>(); // collection -> rules (topo within)
  private dependents = new Map<string, Array<{ kind: ComputedDepKind; edge?: AggEdge | LookupEdge; rule: ComputedRule }>>();
  private asChild = new Map<string, AggEdge[]>(); // childCollection -> aggregate edges
  private asLookupTarget = new Map<string, LookupEdge[]>(); // targetCollection -> lookup edges
  private asTableSource = new Map<string, TableEdge[]>(); // config/lookup collection -> rules reading it
  private tableCache = new Map<string, any[]>(); // config collection -> all rows (invalidated on change)
  private rank = new Map<string, number>(); // `${collection}.${field}` -> topo rank (deps have lower rank)
  private hookedLocal = new Set<string>();
  private hookedCascade = new Set<string>();

  /** Called after a cascade finishes with the set of collections whose rows actually changed. The plugin
   *  wires this to a WebSocket push so clients refresh ONLY once the recompute is truly done (no 220ms
   *  guess). Kept as a plain callback so the engine stays decoupled from `app`. */
  notify?: (collections: string[]) => void;

  constructor(db: AnyDb, logger?: any) {
    this.db = db;
    this.logger = logger || console;
  }

  /** Collections where a mutation could change some computed value (rule collections + aggregate
   *  children + lookup targets). The client uses this to decide when to auto-refresh page blocks. */
  involvedCollections(): string[] {
    return [...new Set<string>([
      ...this.rulesByCollection.keys(),
      ...this.asChild.keys(),
      ...this.asLookupTarget.keys(),
      ...this.asTableSource.keys(),
    ])];
  }

  /** A compact text description of a collection (fields, relations, and other collections usable as bare
   *  lookup tables) — injected into the AI formula-writer's prompt so it uses REAL names. */
  describeCollection(collectionName: string): string {
    const col = this.db.getCollection?.(collectionName);
    if (!col) return `(collection '${collectionName}' không tồn tại)`;
    const fields: any[] = [...(col.fields?.values?.() || [])];
    const isRel = (f: any) => !!f.options?.target;
    const relKind = (t: string) => (/[mM]any$/.test(t) || t === 'hasMany' || t === 'belongsToMany' ? 'to-many' : 'to-one');
    const scalars = fields.filter((f) => !isRel(f) && f.options?.name).map((f) => `${f.options.name} (${f.type})`);
    const rels = fields.filter((f) => isRel(f)).map((f) => `${f.options.name} → ${f.options.target} [${relKind(f.type)}]`);
    const others = [...(this.db.collections?.keys?.() || [])]
      .filter((c: string) => c !== collectionName && !c.startsWith('ptdl') && !/^(users|roles|uiSchemas|desktopRoutes|mobileRoutes|dataSources|applicationPlugins|flowModel|issuedTokens|executions|jobs)/.test(c))
      .slice(0, 50);
    return [
      `Collection: ${collectionName}`,
      `Fields (dùng data.<field>): ${scalars.join(', ') || '(none)'}`,
      rels.length ? `Relations (data.<rel>.<field>; to-many gộp bằng SUM/COUNT…): ${rels.join(', ')}` : 'Relations: (none)',
      `Các collection khác dùng làm bảng tra cứu (gõ THẲNG tên, không data.): ${others.join(', ')}`,
    ].join('\n');
  }

  /** Evaluate a formula against ONE record without writing — powers the settings-page "Chạy thử". */
  async testFormula(collectionName: string, formula: string, filterByTk?: any): Promise<{ value?: any; error?: string; recordId?: any }> {
    if (!collectionName || !formula?.trim()) return { error: 'Thiếu bảng hoặc công thức' };
    if (!this.db.getCollection?.(collectionName)) return { error: `Không có collection '${collectionName}'` };
    try {
      const tmp: ComputedRule = { key: '__test', dataSourceKey: 'main', collectionName, targetField: '__test', formula, deps: [], runOn: 'both', triggers: new Set(['create', 'update', 'source']), enabled: true, onError: 'null' };
      const deps = this.deriveDeps(tmp);
      const appends = new Set<string>();
      const tables: Record<string, any[]> = {};
      for (const d of deps) {
        if ((d.kind === 'aggregate' || d.kind === 'lookup') && d.relation) appends.add(d.relation);
        else if (d.kind === 'table') { const t = d.collection || d.relation; if (t) tables[t] = await this.loadTable(t); }
      }
      const repo = this.db.getRepository(collectionName);
      const has = filterByTk != null && filterByTk !== '';
      const row = await repo.findOne({ ...(has ? { filterByTk } : {}), ...(appends.size ? { appends: [...appends] } : {}) });
      if (!row) return { error: has ? `Không tìm thấy bản ghi id=${filterByTk}` : 'Bảng chưa có bản ghi nào để thử' };
      const res = evaluateFormula(formula, row.toJSON(), undefined, Object.keys(tables).length ? tables : undefined);
      const recordId = row.get(this.pkOf(collectionName));
      if ('error' in res) return { error: String((res as any).error?.message || res.error), recordId };
      const raw = (res as any).value;
      // A formulajs error VALUE (#REF!, #N/A…) is not a thrown error — surface it AS an error so the preview
      // doesn't read like a valid result, and say it'll be written per "Khi lỗi".
      if (isFormulaErrorValue(raw)) return { error: `${String(raw).trim()} — công thức trả GIÁ TRỊ LỖI (thường do SELECT không khớp bản ghi nào / INDEX vượt danh sách). Theo "Khi lỗi" sẽ ghi null.`, recordId };
      // A relation RECORD that the lookup table didn't load serialises to an empty {} — useless to store. The
      // lookup tables load scalar columns (incl. the FK) but NOT nested relations, so guide the user to the FK
      // column (which IS loaded) to get a clean id that actually sets the relation.
      if (raw && typeof raw === 'object' && !Array.isArray(raw) && Object.keys(raw).length === 0) {
        return { error: 'Công thức trả về 1 QUAN HỆ chưa nạp (rỗng {}). Bảng tra cứu không tự nạp quan hệ — hãy dùng cột KHOÁ NGOẠI thay vì cột quan hệ, vd đổi "…phan_loai_hang" thành "…phan_loai_hang_id" để lấy id trực tiếp (engine sẽ gán id đó vào cột quan hệ đích).', recordId };
      }
      return { value: raw, recordId };
    } catch (e: any) {
      return { error: e?.message || String(e) };
    }
  }

  /** Impact of recomputing (collection.targetField): the row count that will be recomputed + the TRANSITIVE
   *  set of OTHER computed fields that cascade from it (so the editor's "Recompute" button can warn first).
   *  Walks the reverse-dependency graph from this node, following only 'source'-triggered edges. */
  async impact(collectionName: string, targetField: string): Promise<{ rows: number; dependents: Array<{ collection: string; field: string }>; dependentCount: number }> {
    let rows = 0;
    try { rows = await this.db.getRepository(collectionName).count(); } catch { /* best-effort */ }
    const start = `${collectionName}.${targetField}`;
    const seen = new Set<string>([start]);
    const out: Array<{ collection: string; field: string }> = [];
    const queue = [start];
    while (queue.length) {
      const key = queue.shift() as string;
      for (const d of this.dependents.get(key) || []) {
        if (!d.rule.triggers.has('source')) continue;
        const rk = `${d.rule.collectionName}.${d.rule.targetField}`;
        if (seen.has(rk)) continue;
        seen.add(rk); out.push({ collection: d.rule.collectionName, field: d.rule.targetField }); queue.push(rk);
      }
    }
    return { rows, dependents: out, dependentCount: out.length };
  }

  /** Dependency graph for the UI: computed-field nodes (with topo rank + derived deps) + edges
   *  between computed fields (edge from a dep-source computed field → the rule that reads it). */
  graph(): { nodes: any[]; edges: any[] } {
    const nodes = [...this.rulesByTarget.values()].map((r) => ({
      id: `${r.collectionName}.${r.targetField}`,
      collection: r.collectionName,
      field: r.targetField,
      formula: r.formula,
      enabled: r.enabled !== false,
      rank: this.rank.get(`${r.collectionName}.${r.targetField}`) ?? 0,
      deps: {
        local: r._resolved?.local || [],
        aggregate: (r._resolved?.aggregate || []).map((e) => ({ relation: e.relation, field: e.field, collection: e.childCollection })),
        lookup: (r._resolved?.lookup || []).map((e) => ({ relation: e.relation, field: e.field, collection: e.targetCollection })),
        table: (r._resolved?.table || []).map((e) => ({ collection: e.tableCollection, alias: e.alias })),
      },
    }));
    const nodeIds = new Set(nodes.map((n) => n.id));
    const edges: any[] = [];
    for (const [srcKey, deps] of this.dependents) {
      if (!nodeIds.has(srcKey)) continue; // only edges FROM a computed field
      for (const d of deps) {
        const to = `${d.rule.collectionName}.${d.rule.targetField}`;
        if (nodeIds.has(to)) edges.push({ from: srcKey, to, kind: d.kind });
      }
    }
    return { nodes, edges };
  }

  private pkOf(collectionName: string): string {
    try {
      return this.db.getCollection?.(collectionName)?.model?.primaryKeyAttribute || 'id';
    } catch {
      return 'id';
    }
  }

  private fieldType(collectionName: string, fieldName: string): string | undefined {
    try {
      const f = this.db.getCollection?.(collectionName)?.getField?.(fieldName);
      return f?.type || f?.options?.type;
    } catch {
      return undefined;
    }
  }

  /** Resolve a relation field to its shape. `mode` picks which side we expect. */
  private resolveRelation(collectionName: string, relName: string) {
    const col = this.db.getCollection?.(collectionName);
    const f = col?.getField?.(relName);
    const o = f?.options || f;
    if (!o?.type) return null;
    if (o.type === 'hasMany' || o.type === 'hasOne') {
      return {
        toMany: true,
        childCollection: o.target,
        foreignKey: o.foreignKey,
        sourceKey: o.sourceKey || this.pkOf(collectionName),
      };
    }
    if (o.type === 'belongsTo') {
      return {
        toMany: false,
        targetCollection: o.target,
        foreignKey: o.foreignKey, // on THIS collection
        targetKey: o.targetKey || this.pkOf(o.target),
      };
    }
    return null; // belongsToMany not supported yet
  }

  /** Derive deps from a formula. Current row = `data.<a>[.<b>]`; lookup tables = a BARE
   *  `<collectionName>.<col>` (no `data.` prefix). Explicit deps override this. */
  private deriveDeps(rule: ComputedRule): ComputedDep[] {
    const deps: ComputedDep[] = [];
    const seen = new Set<string>();
    const push = (k: string, d: ComputedDep) => {
      if (!seen.has(k)) {
        seen.add(k);
        deps.push(d);
      }
    };
    // 1) current-row refs: data.<a>[.<b>]  → local / aggregate / lookup
    const re = /(?:^|[^.\w$])(?:data|record)\.([A-Za-z_$][\w$]*)(?:\.([A-Za-z_$][\w$]*))?/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(rule.formula))) {
      const a = m[1];
      const b = m[2];
      if (b) {
        const rel = this.resolveRelation(rule.collectionName, a);
        if (rel && rel.toMany) push(`agg:${a}.${b}`, { kind: 'aggregate', relation: a, field: b });
        else if (rel && !rel.toMany) push(`lk:${a}.${b}`, { kind: 'lookup', relation: a, field: b });
        else push(`loc:${a}`, { kind: 'local', field: a }); // `a` is a JSON/object field under data.
      } else {
        push(`loc:${a}`, { kind: 'local', field: a });
      }
    }
    // 2) lookup-table refs: a BARE `<X>.<col>` where X is a standalone collection (not data/value/record).
    const reTbl = /(?:^|[^.\w$])([A-Za-z_$][\w$]*)\.[A-Za-z_$][\w$]*/g;
    while ((m = reTbl.exec(rule.formula))) {
      const x = m[1];
      if (x === 'data' || x === 'record' || x === 'value') continue;
      if (this.db.getCollection?.(x)) push(`tbl:${x}`, { kind: 'table', relation: x, collection: x });
    }
    return deps;
  }

  async loadRules(): Promise<number> {
    let rows: any[] = [];
    try {
      rows = await this.db.getRepository('ptdlComputedRules').find({ filter: { enabled: true } });
    } catch {
      return this.rulesByTarget.size; // table not synced yet — keep prior state
    }
    const rules: ComputedRule[] = [];
    for (const row of rows || []) {
      const r = readRuleRow(row);
      if (r) rules.push(r);
    }
    this.buildGraph(rules);
    // Attach hooks for every collection that participates (rule collection / aggregate child / lookup target).
    for (const col of this.rulesByCollection.keys()) this.ensureLocalHook(col);
    const cascadeCols = new Set<string>([
      ...this.rulesByCollection.keys(),
      ...this.asChild.keys(),
      ...this.asLookupTarget.keys(),
      ...this.asTableSource.keys(),
    ]);
    for (const col of cascadeCols) this.ensureCascadeHook(col);
    // Rank = topological DEPTH (longest path from a leaf), NOT linear index — so nodes at the same
    // depth share a column in the DAG (independent chains stack, no crossed edges) and the cascade
    // still processes inputs before dependents (a dep has strictly smaller depth).
    this.rank = this.computeDepths();
    this.logger?.info?.(
      `[ptdl-computed] ${this.rulesByTarget.size} rule(s), ${cascadeCols.size} collection(s) hooked`,
    );
    return this.rulesByTarget.size;
  }

  /** Resolve every rule's deps into edges, build reverse-dependency maps, detect cycles. */
  private buildGraph(rules: ComputedRule[]) {
    const rulesByTarget = new Map<string, ComputedRule>();
    for (const r of rules) rulesByTarget.set(`${r.collectionName}.${r.targetField}`, r);

    const dependents = new Map<string, Array<{ kind: ComputedDepKind; edge?: any; rule: ComputedRule }>>();
    const asChild = new Map<string, AggEdge[]>();
    const asLookupTarget = new Map<string, LookupEdge[]>();
    const asTableSource = new Map<string, TableEdge[]>();
    const addDependent = (nodeKey: string, entry: any) => {
      if (!dependents.has(nodeKey)) dependents.set(nodeKey, []);
      dependents.get(nodeKey)!.push(entry);
    };

    for (const r of rules) {
      // Auto-derive deps from the formula when none were declared: parse `data.<rel>.<field>` paths
      // and classify by the relation's type (hasMany/hasOne → aggregate, belongsTo → lookup); a bare
      // `data.<field>` (or `data.<jsonField>.<prop>`) → local. Explicit deps (if any) win.
      if (!r.deps || !r.deps.length) r.deps = this.deriveDeps(r);
      const resolved: ResolvedDeps = { local: [], aggregate: [], lookup: [], table: [], appends: [], pureLocal: true };
      for (const d of r.deps || []) {
        if (d.kind === 'local' && d.field) {
          resolved.local.push(d.field);
          addDependent(`${r.collectionName}.${d.field}`, { kind: 'local', rule: r });
        } else if (d.kind === 'aggregate' && d.relation) {
          const rel = this.resolveRelation(r.collectionName, d.relation);
          if (!rel || !rel.toMany) {
            this.logger?.warn?.(`[ptdl-computed] ${r.key}: aggregate relation '${d.relation}' is not hasMany/hasOne — skipped`);
            continue;
          }
          const edge: AggEdge = {
            rule: r, relation: d.relation, childCollection: rel.childCollection,
            foreignKey: rel.foreignKey, sourceKey: rel.sourceKey, parentCollection: r.collectionName, field: d.field,
          };
          resolved.aggregate.push(edge);
          resolved.appends.push(d.relation);
          resolved.pureLocal = false;
          if (!asChild.has(rel.childCollection)) asChild.set(rel.childCollection, []);
          asChild.get(rel.childCollection)!.push(edge);
          if (d.field) addDependent(`${rel.childCollection}.${d.field}`, { kind: 'aggregate', edge, rule: r });
        } else if (d.kind === 'lookup' && d.relation) {
          const rel = this.resolveRelation(r.collectionName, d.relation);
          if (!rel || rel.toMany) {
            this.logger?.warn?.(`[ptdl-computed] ${r.key}: lookup relation '${d.relation}' is not belongsTo — skipped`);
            continue;
          }
          const edge: LookupEdge = {
            rule: r, relation: d.relation, itemCollection: r.collectionName,
            foreignKey: rel.foreignKey, targetKey: rel.targetKey, targetCollection: rel.targetCollection, field: d.field,
          };
          resolved.lookup.push(edge);
          resolved.appends.push(d.relation);
          resolved.pureLocal = false;
          if (!asLookupTarget.has(rel.targetCollection)) asLookupTarget.set(rel.targetCollection, []);
          asLookupTarget.get(rel.targetCollection)!.push(edge);
          if (d.field) addDependent(`${rel.targetCollection}.${d.field}`, { kind: 'lookup', edge, rule: r });
        } else if (d.kind === 'table') {
          const tcoll = d.collection || d.relation;
          if (!tcoll || !this.db.getCollection?.(tcoll)) {
            this.logger?.warn?.(`[ptdl-computed] ${r.key}: table '${tcoll}' is not a collection — skipped`);
            continue;
          }
          const edge: TableEdge = { rule: r, tableCollection: tcoll, alias: d.relation || tcoll };
          resolved.table.push(edge);
          resolved.pureLocal = false;
          if (!asTableSource.has(tcoll)) asTableSource.set(tcoll, []);
          asTableSource.get(tcoll)!.push(edge);
        }
      }
      resolved.appends = [...new Set(resolved.appends)];
      r._resolved = resolved;
    }

    // Cycle detection over computed-field nodes: edge target-node -> dep-node (if the dep is itself a rule target).
    const disabled = this.detectCycles(rules, rulesByTarget);
    if (disabled.size) {
      for (const key of disabled) {
        const r = rulesByTarget.get(key);
        this.logger?.error?.(`[ptdl-computed] rule ${r?.key} is part of a dependency CYCLE — DISABLED`);
        rulesByTarget.delete(key);
      }
    }

    // Rebuild per-collection map + topo order from the (possibly cycle-pruned) surviving rules.
    const survivors = [...rulesByTarget.values()];
    const rulesByCollection = new Map<string, ComputedRule[]>();
    for (const r of survivors) {
      if (!rulesByCollection.has(r.collectionName)) rulesByCollection.set(r.collectionName, []);
      rulesByCollection.get(r.collectionName)!.push(r);
    }
    for (const [c, list] of rulesByCollection) rulesByCollection.set(c, this.orderIntraCollection(list, rulesByTarget));

    this.rulesByTarget = rulesByTarget;
    this.rulesByCollection = rulesByCollection;
    this.dependents = dependents;
    this.asChild = asChild;
    this.asLookupTarget = asLookupTarget;
    this.asTableSource = asTableSource;
    this.tableCache.clear(); // rules reloaded → drop cached table rows
  }

  /** DFS cycle detection across collections; returns the set of node keys that sit on a cycle. */
  private detectCycles(rules: ComputedRule[], rulesByTarget: Map<string, ComputedRule>): Set<string> {
    const adj = new Map<string, string[]>();
    for (const r of rules) {
      const node = `${r.collectionName}.${r.targetField}`;
      const outs: string[] = [];
      const res = r._resolved!;
      for (const f of res.local) outs.push(`${r.collectionName}.${f}`);
      for (const e of res.aggregate) if (e.field) outs.push(`${e.childCollection}.${e.field}`);
      for (const e of res.lookup) if (e.field) outs.push(`${e.targetCollection}.${e.field}`);
      adj.set(node, outs.filter((n) => rulesByTarget.has(n))); // only edges to other computed fields matter
    }
    const WHITE = 0, GRAY = 1, BLACK = 2;
    const color = new Map<string, number>();
    const onCycle = new Set<string>();
    const stack: string[] = [];
    const visit = (n: string) => {
      color.set(n, GRAY);
      stack.push(n);
      for (const m of adj.get(n) || []) {
        const c = color.get(m) || WHITE;
        if (c === GRAY) {
          // found a back-edge → mark the whole current cycle segment
          const idx = stack.lastIndexOf(m);
          for (let i = idx; i < stack.length; i++) onCycle.add(stack[i]);
        } else if (c === WHITE) {
          visit(m);
        }
      }
      stack.pop();
      color.set(n, BLACK);
    };
    for (const n of adj.keys()) if ((color.get(n) || WHITE) === WHITE) visit(n);
    return onCycle;
  }

  /** Order same-collection rules so a local dep on another rule's target computes first (beforeSave chain). */
  private orderIntraCollection(list: ComputedRule[], rulesByTarget: Map<string, ComputedRule>): ComputedRule[] {
    const byTarget = new Map(list.map((r) => [r.targetField, r]));
    const ordered: ComputedRule[] = [];
    const seen = new Set<string>();
    const visit = (r: ComputedRule, path: Set<string>) => {
      if (seen.has(r.targetField) || path.has(r.targetField)) return;
      path.add(r.targetField);
      for (const f of r._resolved!.local) if (byTarget.has(f)) visit(byTarget.get(f)!, path);
      path.delete(r.targetField);
      seen.add(r.targetField);
      ordered.push(r);
    };
    for (const r of list) visit(r, new Set());
    return ordered;
  }

  // ---------------- hooks ----------------

  private ensureLocalHook(collectionName: string) {
    if (this.hookedLocal.has(collectionName)) return;
    this.hookedLocal.add(collectionName);
    this.db.on(`${collectionName}.beforeSave`, (instance: any) => this.applyLocal(collectionName, instance));
    this.db.on(`${collectionName}.beforeBulkCreate`, (instances: any) => {
      for (const inst of Array.isArray(instances) ? instances : [instances]) this.applyLocal(collectionName, inst);
    });
  }

  private ensureCascadeHook(collectionName: string) {
    if (this.hookedCascade.has(collectionName)) return;
    this.hookedCascade.add(collectionName);
    this.db.on(`${collectionName}.afterCreateWithAssociations`, (i: any, o: any) => this.onChange(collectionName, i, o, 'create'));
    this.db.on(`${collectionName}.afterUpdate`, (i: any, o: any) => this.onChange(collectionName, i, o, 'update'));
    this.db.on(`${collectionName}.afterDestroy`, (i: any, o: any) => this.onChange(collectionName, i, o, 'destroy'));
  }

  // ---------------- beforeSave: pure-local rules (immediate, single write) ----------------

  private applyLocal(collectionName: string, instance: any) {
    const rules = this.rulesByCollection.get(collectionName);
    if (!rules || !instance) return;
    const isCreate = !!instance.isNewRecord;
    for (const rule of rules) {
      if (!rule._resolved?.pureLocal) continue; // relation-bearing rules compute in the afterCommit cascade
      const T = rule.triggers;
      if (isCreate) {
        if (!T.has('create')) continue;
      } else {
        // own update: 'update' = recompute on any save of this row; 'source' = only when an input field changed.
        if (!(T.has('update') || (T.has('source') && this.localChanged(rule, instance)))) continue;
      }
      try {
        const res = evaluateFormula(rule.formula, instance.toJSON());
        if ('error' in res) {
          if (rule.onError === 'null') { const w = this.targetWrite(collectionName, rule.targetField, null); instance.set(w.field, w.value); }
          this.logger?.warn?.(`[ptdl-computed] ${rule.key}: ${res.error.message}`);
          continue;
        }
        if (isFormulaErrorValue((res as any).value)) {
          if (rule.onError === 'null') { const w = this.targetWrite(collectionName, rule.targetField, null); instance.set(w.field, w.value); }
          this.logger?.warn?.(`[ptdl-computed] ${rule.key}: formula error value ${(res as any).value}`);
          continue;
        }
        const w = this.targetWrite(collectionName, rule.targetField, (res as any).value);
        instance.set(w.field, w.value);
      } catch (e: any) {
        this.logger?.error?.(`[ptdl-computed] ${rule.key} local failed: ${e?.message || e}`);
      }
    }
  }

  private localChanged(rule: ComputedRule, instance: any): boolean {
    const deps = rule._resolved!.local;
    if (!deps.length) return true;
    const changed: string[] | null = typeof instance.changed === 'function' ? instance.changed() || [] : null;
    if (!changed) return true;
    return deps.some((f) => changed.includes(f));
  }

  // ---------------- afterCommit cascade: any rule (cross-row, chained, any depth) ----------------

  private afterCommit(options: any, fn: () => Promise<void>) {
    const run = () => fn().catch((e) => this.logger?.error?.(`[ptdl-computed] cascade: ${e?.message || e}`));
    const t = options?.transaction;
    if (t && typeof t.afterCommit === 'function') t.afterCommit(run);
    else run();
  }

  private onChange(collectionName: string, instance: any, options: any, event: 'create' | 'update' | 'destroy') {
    const pk = this.pkOf(collectionName);
    const key = instance.get(pk);
    const changed: string[] = event === 'update' && typeof instance.changed === 'function' ? instance.changed() || [] : [];
    // Snapshot NOW (Sequelize resets previous()/get after commit): FK cur+prev for aggregate child edges,
    // and targetKey values for lookup-target edges.
    const aggEdges = this.asChild.get(collectionName) || [];
    const aggSnaps = aggEdges.map((e) => ({
      e,
      cur: instance.get(e.foreignKey),
      prev: typeof instance.previous === 'function' ? instance.previous(e.foreignKey) : undefined,
    }));
    const lookupEdges = this.asLookupTarget.get(collectionName) || [];
    const lookupSnaps = lookupEdges.map((e) => ({ e, targetVal: e.targetKey === pk ? key : instance.get(e.targetKey) }));

    this.afterCommit(options, async () => {
      const seeds: Array<{ collection: string; key: any; field: string }> = [];
      const push = (c: string, k: any, f: string) => { if (k != null) seeds.push({ collection: c, key: k, field: f }); };

      // A. This row's OWN rules. Fire the 'create'/'update' trigger depending on the event: a rule that
      // didn't tick that box (e.g. a 'create'-only snapshot on an update) is skipped. 'update' fires on ANY
      // own save; a rule that only ticked 'source' recomputes on its own save only when an input changed.
      if (event !== 'destroy') {
        for (const rule of this.rulesByCollection.get(collectionName) || []) {
          const T = rule.triggers;
          const fire = event === 'create'
            ? T.has('create')
            : T.has('update') || (T.has('source') && this.ownRuleTriggered(rule, changed));
          if (fire) push(collectionName, key, rule.targetField);
        }
      }
      // B1. This collection is a CHILD of an aggregate → recompute affected parent(s). Cross-row = 'source'.
      for (const { e, cur, prev } of aggSnaps) {
        if (!e.rule.triggers.has('source')) continue;
        const fkChanged = event === 'update' && changed.includes(e.foreignKey);
        const fieldChanged = event === 'update' && !!e.field && changed.includes(e.field);
        if (event === 'create' || event === 'destroy' || fkChanged || fieldChanged) {
          if (cur != null) push(e.parentCollection, cur, e.rule.targetField);
          if (fkChanged && prev != null && prev !== cur) push(e.parentCollection, prev, e.rule.targetField); // reparent → old parent too
        }
      }
      // B2. This collection is a LOOKUP TARGET → recompute dependent rows whose looked-up field changed ('source').
      if (event === 'update') {
        for (const { e, targetVal } of lookupSnaps) {
          if (!e.rule.triggers.has('source')) continue;
          if (!e.field || !changed.includes(e.field) || targetVal == null) continue;
          const itemPk = this.pkOf(e.itemCollection);
          const items = await this.db.getRepository(e.itemCollection).find({ filter: { [e.foreignKey]: targetVal }, fields: [itemPk] });
          for (const it of items || []) push(e.itemCollection, it.get(itemPk), e.rule.targetField);
        }
      }
      // B3. This collection is a LOOKUP-TABLE source (config): always invalidate the cache, and — for rules
      // that ticked 'source' — re-compute ALL rows of every collection that reads it (value-based fan-out).
      const tableEdges = this.asTableSource.get(collectionName) || [];
      if (tableEdges.length) {
        this.tableCache.delete(collectionName);
        const done = new Set<string>();
        for (const te of tableEdges) {
          if (!te.rule.triggers.has('source')) continue;
          const tag = `${te.rule.collectionName}.${te.rule.targetField}`;
          if (done.has(tag)) continue;
          done.add(tag);
          const depPk = this.pkOf(te.rule.collectionName);
          const all = await this.db.getRepository(te.rule.collectionName).find({ fields: [depPk] });
          for (const rr of all || []) push(te.rule.collectionName, rr.get(depPk), te.rule.targetField);
        }
      }
      await this.runCascade(seeds);
    });
  }

  /** On its OWN row change, a rule recomputes if a local dep changed or a lookup FK was re-pointed. */
  private ownRuleTriggered(rule: ComputedRule, changed: string[]): boolean {
    const r = rule._resolved!;
    if (!changed.length) return false;
    if (r.local.some((f) => changed.includes(f))) return true;
    if (r.lookup.some((e) => changed.includes(e.foreignKey))) return true;
    return false;
  }

  /**
   * Process a dirty set in TOPOLOGICAL RANK order: always recompute the lowest-rank node next, so a
   * parent aggregate settles only AFTER every child that feeds it — this is what fixes fan-out
   * double-counting (a naive recursive cascade recomputes the shared parent after the first child and
   * then can't revisit it). Each changed value enqueues its concrete dependents. The graph is a DAG
   * (cycles pruned at load), so the worklist terminates.
   */
  private async runCascade(seeds: Array<{ collection: string; key: any; field: string }>) {
    const dirty = new Map<string, { collection: string; key: any; field: string }>();
    const add = (c: string, k: any, f: string) => {
      if (k == null) return;
      const id = `${c}#${k}#${f}`;
      if (!dirty.has(id)) dirty.set(id, { collection: c, key: k, field: f });
    };
    for (const s of seeds) add(s.collection, s.key, s.field);
    // Collections that had a computed rule TRIGGERED by this save. We refresh clients for these even when
    // the cascade detects no CHANGE — a pure-local computed (e.g. total = subtotal − discount) is already
    // recomputed in beforeSave, so `touched` stays empty, yet the UI still needs to refetch or the number
    // only "jumps" after a manual F5. (Cross-row changes are added to `touched` below and unioned in.)
    const originCollections = new Set<string>(seeds.map((s) => s.collection));
    const rankOf = (c: string, f: string) => this.rank.get(`${c}.${f}`) ?? 0;
    const touched = new Set<string>(); // collections whose rows actually changed → tell clients to refresh
    let guard = 0;
    while (dirty.size) {
      if (++guard > 200000) { this.logger?.error?.('[ptdl-computed] cascade guard tripped — aborting'); break; }
      // pick the dirty node with the lowest topo rank (all its computed inputs are already settled)
      let bestId = '', best: any = null, bestRank = Infinity;
      for (const [id, v] of dirty) { const r = rankOf(v.collection, v.field); if (r < bestRank) { bestRank = r; best = v; bestId = id; } }
      dirty.delete(bestId);
      // Every seed reached the worklist only after passing its rule's trigger filter (create/update/source)
      // in onChange, so it is cleared to compute here.
      const changed = await this.recomputeOne(best.collection, best.key, best.field);
      if (changed) {
        touched.add(best.collection);
        // A computed value changed → its dependents' SOURCE changed: enqueue only dependents that tick 'source'.
        for (const dep of this.dependents.get(`${best.collection}.${best.field}`) || []) {
          if (!dep.rule.triggers.has('source')) continue;
          await this.addDependentTargets(dep, best.collection, best.key, add);
        }
      }
    }
    // Recompute is fully settled now — signal clients so they refetch. Notify the union of collections that
    // actually changed (cross-row) AND those that had a rule triggered (covers pure-local edits whose value
    // settled in beforeSave, so `touched` is empty but the UI still needs to refresh).
    const toNotify = new Set<string>([...touched, ...originCollections]);
    if (toNotify.size) {
      try { this.notify?.([...toNotify]); } catch (e: any) { this.logger?.warn?.(`[ptdl-computed] notify failed: ${e?.message || e}`); }
    }
  }

  /** Recompute one (collection,row,field): load row + relations, evaluate, write. Returns true if the stored
   *  value changed. Public so the scan engine can keep DERIVED computed columns (avg = value/qty) in sync
   *  after it writes the primitives with hooks:false (which otherwise wouldn't re-trigger this rule). */
  async recomputeOne(collectionName: string, rowKey: any, targetField: string): Promise<boolean> {
    if (rowKey == null) return false;
    const rule = this.rulesByTarget.get(`${collectionName}.${targetField}`);
    if (!rule) return false;
    try {
      const repo = this.db.getRepository(collectionName);
      const appends = rule._resolved!.appends;
      const row = await repo.findOne({ filterByTk: rowKey, ...(appends.length ? { appends } : {}) });
      if (!row) return false;
      const data = row.toJSON();
      // Lookup tables → TOP-LEVEL scope vars, so the formula writes them bare: `table_policy.rate`
      // (no `data.` prefix), while the current row keeps `data.subtotal`.
      const tables: Record<string, any[]> = {};
      for (const t of rule._resolved!.table) tables[t.alias] = await this.loadTable(t.tableCollection);
      const res = evaluateFormula(rule.formula, data, undefined, Object.keys(tables).length ? tables : undefined);
      let raw: any;
      if ('error' in res) {
        if (rule.onError === 'keep') { this.logger?.warn?.(`[ptdl-computed] ${rule.key}: ${res.error.message} (kept old)`); return false; }
        raw = null;
        this.logger?.warn?.(`[ptdl-computed] ${rule.key}: ${res.error.message}`);
      } else if (isFormulaErrorValue((res as any).value)) {
        // A formulajs error VALUE (#REF!, #N/A…) is not a thrown error — handle it the same way, per onError.
        if (rule.onError === 'keep') { this.logger?.warn?.(`[ptdl-computed] ${rule.key}: error value ${(res as any).value} (kept old)`); return false; }
        raw = null;
        this.logger?.warn?.(`[ptdl-computed] ${rule.key}: formula error value ${(res as any).value}`);
      } else {
        raw = (res as any).value;
      }
      // targetWrite resolves a relation (belongsTo) target to its FK + the record's id; a scalar target to
      // the coerced value on the field itself.
      const w = this.targetWrite(collectionName, targetField, raw);
      const current = row.get(w.field);
      if (String(current ?? '') === String(w.value ?? '')) return false; // unchanged → dependents unaffected
      await repo.update({ filterByTk: rowKey, values: { [w.field]: w.value }, hooks: false });
      return true;
    } catch (e: any) {
      this.logger?.error?.(`[ptdl-computed] recompute ${rule.key}#${rowKey}: ${e?.message || e}`);
      return false;
    }
  }

  /** Load (and cache) ALL rows of a config/lookup collection for `data.<alias>` in a formula. */
  private async loadTable(collectionName: string): Promise<any[]> {
    if (this.tableCache.has(collectionName)) return this.tableCache.get(collectionName)!;
    let rows: any[] = [];
    try {
      const recs = await this.db.getRepository(collectionName).find({});
      rows = (recs || []).map((r: any) => (typeof r.toJSON === 'function' ? r.toJSON() : r));
    } catch (e: any) {
      this.logger?.warn?.(`[ptdl-computed] loadTable ${collectionName} failed: ${e?.message || e}`);
    }
    this.tableCache.set(collectionName, rows);
    return rows;
  }

  /** Resolve a dependency edge to the concrete dependent (collection,row,field) targets and enqueue them. */
  private async addDependentTargets(dep: { kind: ComputedDepKind; edge?: any; rule: ComputedRule }, changedCol: string, changedKey: any, add: (c: string, k: any, f: string) => void) {
    if (dep.kind === 'local') {
      add(dep.rule.collectionName, changedKey, dep.rule.targetField); // same row
    } else if (dep.kind === 'aggregate') {
      const e = dep.edge as AggEdge;
      const child = await this.db.getRepository(e.childCollection).findOne({ filterByTk: changedKey, fields: [e.foreignKey] });
      const parentKey = child?.get(e.foreignKey);
      if (parentKey != null) add(e.parentCollection, parentKey, e.rule.targetField);
    } else if (dep.kind === 'lookup') {
      const e = dep.edge as LookupEdge;
      let targetVal = changedKey;
      if (e.targetKey !== this.pkOf(e.targetCollection)) {
        const tgt = await this.db.getRepository(e.targetCollection).findOne({ filterByTk: changedKey, fields: [e.targetKey] });
        targetVal = tgt?.get(e.targetKey);
      }
      if (targetVal == null) return;
      const itemPk = this.pkOf(e.itemCollection);
      const items = await this.db.getRepository(e.itemCollection).find({ filter: { [e.foreignKey]: targetVal }, fields: [itemPk] });
      for (const it of items || []) add(e.itemCollection, it.get(itemPk), e.rule.targetField);
    }
  }

  private coerce(value: any, fieldType?: string): any {
    if (value === null || value === undefined) return null;
    if (fieldType && !NUMERIC_TYPES.has(fieldType)) return value;
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n)) return null;
    return fieldType && INT_TYPES.has(fieldType) ? Math.round(n) : n;
  }

  /** Where a computed value actually LANDS, given the target field's type:
   *   • belongsTo (m2o) target → write the FOREIGN KEY column with the related record's id. A bare
   *     `{ relation: <object> }` update with `hooks:false` does NOT set the FK (the association-writing
   *     hooks are bypassed), so the relation would appear empty. If the formula returned the whole related
   *     RECORD (e.g. INDEX(SELECT(coll.some_relation, …))), we pull its `.id`; if it returned a bare id we
   *     use it as-is. So a relation-target rule works whether the formula yields the record or its id.
   *   • anything else → the coerced value on the field itself (unchanged behaviour).
   *  Returns the concrete { field, value } to persist. */
  private targetWrite(collectionName: string, targetField: string, raw: any): { field: string; value: any } {
    try {
      const f = this.db.getCollection?.(collectionName)?.getField?.(targetField);
      const o: any = f?.options || f || {};
      if (o.type === 'belongsTo' && o.foreignKey) {
        const tk = o.targetKey || 'id';
        const id = raw && typeof raw === 'object' ? (raw[tk] ?? raw.id ?? null) : raw;
        return { field: o.foreignKey, value: id === undefined || id === '' ? null : id };
      }
    } catch { /* fall through to scalar */ }
    return { field: targetField, value: this.coerce(raw, this.fieldType(collectionName, targetField)) };
  }

  /** Backfill: recompute stored values for existing rows, in topo order so multi-level chains settle. */
  async recomputeAll(opts?: { collection?: string; field?: string }): Promise<number> {
    let touched = 0;
    // Process rules in a global topological order (deps first) so a later level reads fresh values.
    const ordered = this.topoRules();
    for (const rule of ordered) {
      if (opts?.collection && opts.collection !== rule.collectionName) continue;
      if (opts?.field && opts.field !== rule.targetField) continue;
      const repo = this.db.getRepository(rule.collectionName);
      const pk = this.pkOf(rule.collectionName);
      const rows = await repo.find({ fields: [pk] });
      // topo order across rules means every dep of this rule is already backfilled → recompute once, no cascade.
      for (const row of rows || []) {
        await this.recomputeOne(rule.collectionName, row.get(pk), rule.targetField);
        touched++;
      }
    }
    return touched;
  }

  /** Depth of each computed node = longest path from a leaf (a computed field with no computed inputs).
   *  Leaves = 0; a node = 1 + max(depth of its computed-field inputs). Same depth ⇒ same DAG column. */
  private computeDepths(): Map<string, number> {
    const depth = new Map<string, number>();
    const inputsOf = (nodeKey: string): string[] => {
      const r = this.rulesByTarget.get(nodeKey);
      if (!r?._resolved) return [];
      const res = r._resolved;
      return [
        ...res.local.map((f) => `${r.collectionName}.${f}`),
        ...res.aggregate.map((e) => (e.field ? `${e.childCollection}.${e.field}` : '')),
        ...res.lookup.map((e) => (e.field ? `${e.targetCollection}.${e.field}` : '')),
      ].filter((k) => k && this.rulesByTarget.has(k));
    };
    const visit = (nodeKey: string, path: Set<string>): number => {
      if (depth.has(nodeKey)) return depth.get(nodeKey)!;
      if (path.has(nodeKey)) return 0; // cycle guard (cycles already pruned at load)
      path.add(nodeKey);
      let d = 0;
      for (const inp of inputsOf(nodeKey)) d = Math.max(d, 1 + visit(inp, path));
      path.delete(nodeKey);
      depth.set(nodeKey, d);
      return d;
    };
    for (const k of this.rulesByTarget.keys()) visit(k, new Set());
    return depth;
  }

  /** Global topological order of rule nodes (deps before dependents). Falls back to input order on trouble. */
  private topoRules(): ComputedRule[] {
    const nodes = [...this.rulesByTarget.keys()];
    const indeg = new Map<string, number>(nodes.map((n) => [n, 0]));
    const outs = new Map<string, string[]>();
    for (const n of nodes) {
      const r = this.rulesByTarget.get(n)!;
      const res = r._resolved!;
      const deps = [
        ...res.local.map((f) => `${r.collectionName}.${f}`),
        ...res.aggregate.map((e) => (e.field ? `${e.childCollection}.${e.field}` : '')),
        ...res.lookup.map((e) => (e.field ? `${e.targetCollection}.${e.field}` : '')),
      ].filter((d) => this.rulesByTarget.has(d));
      for (const d of deps) {
        outs.set(d, [...(outs.get(d) || []), n]);
        indeg.set(n, (indeg.get(n) || 0) + 1);
      }
    }
    const queue = nodes.filter((n) => (indeg.get(n) || 0) === 0);
    const order: string[] = [];
    while (queue.length) {
      const n = queue.shift()!;
      order.push(n);
      for (const m of outs.get(n) || []) {
        indeg.set(m, (indeg.get(m) || 0) - 1);
        if ((indeg.get(m) || 0) === 0) queue.push(m);
      }
    }
    const finalOrder = order.length === nodes.length ? order : nodes; // cycle guard (shouldn't happen post-prune)
    return finalOrder.map((n) => this.rulesByTarget.get(n)!).filter(Boolean);
  }
}
