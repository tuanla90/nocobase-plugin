/**
 * Stateful ordered-scan / ALLOCATION engine — the 4th computed mode. The kernel is `allocate(need)`:
 * given an ordered ledger of inflows (+qty at a price) and outflows (−qty), walk it in order and for each
 * outflow ALLOCATE the consumed quantity against the standing layers. FIFO / LIFO / FEFO / Weighted-Avg
 * are just different `AllocationStrategy` implementations of "which layers to take". Once we have the
 * allocation `[{qty, price, sourceRow}]`, EVERY metric is a plain aggregate over it:
 *
 *   consumed value  = Σ(qty·price)        running value = Σ layers(qty·price)
 *   consumed qty    = Σ qty               running qty   = Σ layers.qty
 *   consumed unit   = consumed value / consumed qty      avg cost = running value / running qty
 *
 * Config lives in `ptdlScanRules`. Hooks the ledger collection; recomputes the affected partition (raw
 * ordered scan). General: inventory costing, FIFO payment allocation, credit/quota consumption, etc.
 * (Specific-Identification + full layer trace are the next increment.)
 */

import { evaluateFormula } from '../shared/formulaEngine';

type AnyDb = any;

export type Strategy = 'fifo' | 'lifo' | 'fefo' | 'weighted_avg';
export type OrderSpec = { field: string; dir: 'asc' | 'desc' };

export type QtyMode = 'signed' | 'split' | 'enum' | 'formula';
export type CostMode = 'column' | 'formula';
export type RoundMode = 'half_up' | 'half_even' | 'up' | 'down' | 'ceil' | 'floor';
export type NegativePolicy = 'allow' | 'error' | 'ignore'; // outflow > available stock
export type MissingCostPolicy = 'zero' | 'error' | 'previous'; // inflow with no unit cost

export type ScanRule = {
  collectionName: string;
  partitionBy: string[];
  orderBy: OrderSpec[];
  method: Strategy; // allocation strategy
  // --- signed-quantity input (several ways to say "how much in / out") ---
  qtyMode?: QtyMode;
  qtyField: string; // 'signed' mode: signed column · 'enum' mode: unsigned qty column
  inQtyField?: string; outQtyField?: string; // 'split' mode
  directionField?: string; inValue?: string; // 'enum' mode (row[directionField] === inValue ⇒ inflow)
  qtyFormula?: string; // 'formula' mode — Excel-style over data.<field>
  // --- unit price input ---
  costMode?: CostMode;
  costField?: string; // 'column' mode
  costFormula?: string; // 'formula' mode
  expiryField?: string; // FEFO: sort layers by this (earliest first)
  roundPrecision?: number; // advanced: decimals for stored numbers (default 4)
  roundMode?: RoundMode; // advanced: rounding rule (default half_up)
  negativePolicy?: NegativePolicy; // advanced: what to do when an outflow exceeds available stock
  missingCostPolicy?: MissingCostPolicy; // advanced: what to do when an inflow row has no unit cost
  // outputs (write only those mapped):
  outUnitCost?: string; // this row's valued unit cost (inflow price / outflow consumed unit cost)
  outCogs?: string; // consumed value (COGS) on outflows
  outConsumedQty?: string;
  outConsumedUnitCost?: string;
  outRunningQty?: string;
  outRunningValue?: string;
  outAvgCost?: string;
  outAllocations?: string; // JSON trace of the lots this outflow consumed
  enabled?: boolean;
};

// ---------------- allocation kernel ----------------
type Layer = { qty: number; price: number; sourceRow: any; expiry?: any };
type Alloc = { qty: number; price: number; sourceRow: any };
// Options for one outflow allocation: `allow` = permit going negative (backorder); `fallback` = the price
// to value the shortfall / a fresh short position at. When `allow` is false we cap at what exists (ignore).
type AllocOpts = { allow: boolean; fallback: number };

/** Consume `need` from a queue, taking from the FRONT (FIFO/FEFO) or BACK (LIFO); positive layers only. */
function consumeEnd(layers: Layer[], need: number, fromBack: boolean): Alloc[] {
  const out: Alloc[] = [];
  const nextIdx = () => {
    // skip any backorder (negative) layers — they are debt, not stock.
    if (fromBack) { for (let i = layers.length - 1; i >= 0; i--) if (layers[i].qty > 1e-9) return i; }
    else { for (let i = 0; i < layers.length; i++) if (layers[i].qty > 1e-9) return i; }
    return -1;
  };
  while (need > 1e-9) {
    const idx = nextIdx();
    if (idx < 0) break;
    const l = layers[idx];
    const take = Math.min(need, l.qty);
    out.push({ qty: take, price: l.price, sourceRow: l.sourceRow });
    l.qty -= take;
    need -= take;
    if (l.qty <= 1e-9) layers.splice(idx, 1);
  }
  return out;
}

/** Fill any leading backorders (negative layers) with an incoming inflow, front to back; returns leftover qty. */
function fillBackorders(layers: Layer[], qty: number): number {
  let rem = qty;
  for (let i = 0; i < layers.length && rem > 1e-9; ) {
    if (layers[i].qty < -1e-9) {
      const fill = Math.min(rem, -layers[i].qty);
      layers[i].qty += fill;
      rem -= fill;
      if (Math.abs(layers[i].qty) <= 1e-9) { layers.splice(i, 1); continue; }
    }
    i++;
  }
  return rem;
}

interface AllocationStrategy {
  addLayer(layers: Layer[], layer: Layer): void;
  allocate(layers: Layer[], need: number, opts: AllocOpts): Alloc[];
}

/** Comparable timestamp for a expiry value (Date / ISO string / number); NaN if absent/unparseable. */
function expKey(v: any): number {
  if (v == null) return NaN;
  if (typeof v === 'number') return v;
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? NaN : t;
}

/** Shared shortfall handling for the queue strategies: after taking what exists, either short (allow) or stop. */
function queueAllocate(L: Layer[], need: number, fromBack: boolean, opts: AllocOpts): Alloc[] {
  const out = consumeEnd(L, need, fromBack);
  const taken = out.reduce((s, a) => s + a.qty, 0);
  const short = need - taken;
  if (short > 1e-9 && opts.allow) {
    out.push({ qty: short, price: opts.fallback, sourceRow: null });
    L.push({ qty: -short, price: opts.fallback, sourceRow: null }); // backorder → running qty goes negative
  }
  return out; // if !allow, we simply consumed what existed (ignore policy)
}

const STRATEGIES: Record<Strategy, AllocationStrategy> = {
  fifo: {
    addLayer: (L, l) => { const rem = fillBackorders(L, l.qty); if (rem > 1e-9) L.push({ ...l, qty: rem }); },
    allocate: (L, n, o) => queueAllocate(L, n, false, o),
  },
  lifo: {
    addLayer: (L, l) => { const rem = fillBackorders(L, l.qty); if (rem > 1e-9) L.push({ ...l, qty: rem }); },
    allocate: (L, n, o) => queueAllocate(L, n, true, o),
  },
  fefo: {
    addLayer: (L, l) => {
      const rem = fillBackorders(L, l.qty);
      if (rem <= 1e-9) return;
      const layer = { ...l, qty: rem };
      // insert sorted by expiry ascending (earliest first); missing expiry → append (consumed last).
      // NOTE: normalize to a numeric timestamp — a date arrives as a Date/ISO string, and String(Date)
      // is weekday-prefixed ("Fri May…") so a raw string compare misorders. `expKey` handles Date/string/number.
      const e = expKey(layer.expiry);
      if (Number.isNaN(e)) { L.push(layer); return; }
      const i = L.findIndex((x) => { const xk = expKey(x.expiry); return x.qty > 1e-9 && (Number.isNaN(xk) || xk > e); });
      if (i < 0) L.push(layer); else L.splice(i, 0, layer);
    },
    allocate: (L, n, o) => queueAllocate(L, n, false, o), // earliest-expiry sits at the front
  },
  weighted_avg: {
    // one blended layer at the running average; a new inflow re-averages it (and covers any short position).
    addLayer: (L, l) => {
      if (!L.length) { L.push({ qty: l.qty, price: l.price, sourceRow: null }); return; }
      const s = L[0];
      if (s.qty < -1e-9) {
        // currently short (backorder): the inflow fills the short; any surplus becomes stock at its own price.
        s.qty += l.qty;
        s.price = l.price;
        return;
      }
      const tot = s.qty + l.qty;
      s.price = tot > 1e-9 ? (s.qty * s.price + l.qty * l.price) / tot : l.price;
      s.qty = tot;
      s.sourceRow = null;
    },
    allocate: (L, n, o) => {
      const s = L[0];
      if (!s) { // no stock at all
        if (!o.allow) return [];
        L.push({ qty: -n, price: o.fallback, sourceRow: null });
        return [{ qty: n, price: o.fallback, sourceRow: null }];
      }
      const avail = Math.max(0, s.qty);
      const take = Math.min(n, avail);
      s.qty -= take;
      const out = [{ qty: take, price: s.price, sourceRow: null }];
      const short = n - take;
      if (short > 1e-9 && o.allow) { s.qty -= short; out.push({ qty: short, price: s.price, sourceRow: null }); } // negative moving-avg
      else if (Math.abs(s.qty) <= 1e-9) L.length = 0;
      return out;
    },
  },
};

/** Sum of usable (positive) stock across layers — backorders (negative) don't provide stock. */
const availableQty = (layers: Layer[]) => layers.reduce((s, l) => s + Math.max(0, l.qty), 0);

export type RowMetrics = {
  consumedQty: number; consumedValue: number; consumedUnitCost: number;
  runningQty: number; runningValue: number; avgCost: number;
  unitCost: number; // inflow: its price; outflow: the consumed unit cost
  allocations: Alloc[];
};

export type ScanOpts = {
  strategy: Strategy;
  qtyOf: (r: any) => number;
  priceOf: (r: any) => number;
  priceMissingOf?: (r: any) => boolean; // inflow row has no unit cost → apply missingCostPolicy
  expiryOf?: (r: any) => any;
  idOf: (r: any) => any;
  negative?: NegativePolicy; // outflow > available stock (default 'allow')
  missingCost?: MissingCostPolicy; // inflow with no cost (default 'zero')
};

/** The pure engine: walk `rows` in order, allocate per the strategy + edge-case policies, return per-row metrics. */
export function scanLedger(rows: any[], opts: ScanOpts): RowMetrics[] {
  const strat = STRATEGIES[opts.strategy] || STRATEGIES.weighted_avg;
  const negative = opts.negative || 'allow';
  const missingCost = opts.missingCost || 'zero';
  const layers: Layer[] = [];
  const out: RowMetrics[] = [];
  let lastPrice = 0; // last known inflow price — fallback for 'previous' missing-cost + 'allow' shortfall
  for (const r of rows) {
    const q = opts.qtyOf(r);
    let consumed: Alloc[] = [];
    let unitCost = 0;
    if (q >= 0) {
      let price = opts.priceOf(r);
      if (opts.priceMissingOf && opts.priceMissingOf(r)) {
        if (missingCost === 'error') throw new Error(`[ptdl-scan] dòng ${opts.idOf(r)} thiếu đơn giá nhập (Missing Cost = Báo lỗi)`);
        price = missingCost === 'previous' ? lastPrice : 0;
      }
      if (q > 0) { strat.addLayer(layers, { qty: q, price, sourceRow: opts.idOf(r), expiry: opts.expiryOf ? opts.expiryOf(r) : undefined }); lastPrice = price; }
      unitCost = price;
    } else {
      const need = -q;
      const avail = availableQty(layers);
      if (need > avail + 1e-9 && negative === 'error') {
        throw new Error(`[ptdl-scan] dòng ${opts.idOf(r)} xuất ${need} vượt tồn ${avail} (Negative Inventory = Báo lỗi)`);
      }
      // 'allow' → go negative valuing the shortfall at lastPrice; 'ignore' → cap at what exists.
      const fallback = opts.strategy === 'weighted_avg' ? (layers[0]?.price ?? lastPrice) : lastPrice;
      consumed = strat.allocate(layers, need, { allow: negative === 'allow', fallback });
      const cv = consumed.reduce((s, a) => s + a.qty * a.price, 0);
      const cq = consumed.reduce((s, a) => s + a.qty, 0);
      unitCost = cq > 1e-9 ? cv / cq : 0;
    }
    const runningQty = layers.reduce((s, l) => s + l.qty, 0);
    const runningValue = layers.reduce((s, l) => s + l.qty * l.price, 0);
    const consumedQty = consumed.reduce((s, a) => s + a.qty, 0);
    const consumedValue = consumed.reduce((s, a) => s + a.qty * a.price, 0);
    out.push({
      consumedQty, consumedValue, consumedUnitCost: consumedQty > 1e-9 ? consumedValue / consumedQty : 0,
      runningQty, runningValue, avgCost: Math.abs(runningQty) > 1e-9 ? runningValue / runningQty : 0,
      unitCost, allocations: consumed,
    });
  }
  return out;
}

const num = (v: any) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const asList = (v: any): string[] => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : []);
const asOrder = (v: any): OrderSpec[] => {
  const one = (x: any): OrderSpec | null => (!x ? null : typeof x === 'string' ? { field: x.trim(), dir: 'asc' } : x.field ? { field: String(x.field).trim(), dir: x.dir === 'desc' ? 'desc' : 'asc' } : null);
  return (Array.isArray(v) ? v.map(one) : typeof v === 'string' ? v.split(',').map(one) : []).filter(Boolean) as OrderSpec[];
};
/** Round `n` to `precision` decimals using the chosen rounding rule. */
const round = (n: number, precision = 4, mode: RoundMode = 'half_up'): number => {
  const f = Math.pow(10, precision);
  const x = num(n) * f;
  const s = Math.sign(x);
  const a = Math.abs(x);
  let r: number;
  switch (mode) {
    case 'ceil': r = Math.ceil(x); break;
    case 'floor': r = Math.floor(x); break;
    case 'up': r = s * Math.ceil(a); break; // away from zero
    case 'down': r = s * Math.floor(a); break; // toward zero (truncate)
    case 'half_even': { // banker's rounding
      const fl = Math.floor(x); const diff = x - fl;
      r = Math.abs(diff - 0.5) < 1e-9 ? (fl % 2 === 0 ? fl : fl + 1) : Math.floor(x + 0.5);
      break;
    }
    case 'half_up': default: r = s * Math.round(a + Number.EPSILON); break; // .5 away from zero
  }
  return r / f;
};
/** Evaluate an Excel-style formula (data.<field>) against a row; NaN-safe number. */
const evalNum = (formula: string, row: any): number => { try { const r = evaluateFormula(String(formula), row.toJSON()); return 'error' in r ? 0 : num((r as any).value); } catch { return 0; } };

/** Build the per-row qty / price / expiry / id resolvers for a rule, honouring the input modes. */
function makeResolvers(rule: ScanRule, pk: string) {
  const col = (r: any, f?: string) => (f ? num(r.get(f)) : 0);
  let qtyOf: (r: any) => number;
  switch (rule.qtyMode) {
    case 'split': qtyOf = (r) => col(r, rule.inQtyField) - col(r, rule.outQtyField); break;
    case 'enum': qtyOf = (r) => col(r, rule.qtyField) * (String(r.get(rule.directionField as string)) === String(rule.inValue) ? 1 : -1); break;
    case 'formula': qtyOf = (r) => evalNum(rule.qtyFormula || '0', r); break;
    default: qtyOf = (r) => col(r, rule.qtyField); // 'signed'
  }
  const priceOf = rule.costMode === 'formula' ? (r: any) => evalNum(rule.costFormula || '0', r) : (r: any) => (rule.costField ? col(r, rule.costField) : 0);
  // "Missing cost" only applies to a column mapping that IS set but left empty on a row (the common
  // forgot-to-enter case). No cost column, or a formula, is treated as an intentional value (not missing).
  const priceMissingOf = rule.costMode !== 'formula' && rule.costField
    ? (r: any) => { const v = r.get(rule.costField as string); return v == null || v === ''; }
    : undefined;
  const expiryOf = rule.expiryField ? (r: any) => r.get(rule.expiryField as string) : undefined;
  return { strategy: rule.method, qtyOf, priceOf, priceMissingOf, expiryOf, idOf: (r: any) => r.get(pk), negative: rule.negativePolicy, missingCost: rule.missingCostPolicy };
}

export class ScanManager {
  private db: AnyDb;
  private logger: any;
  private rules: ScanRule[] = [];
  private hooked = new Set<string>();
  notify?: (collections: string[]) => void;
  /** Injected: after primitives are written, keep the DERIVED computed columns (avg = value/qty,
   *  consumed unit cost = consumed value/qty) in sync for the just-written rows. */
  derive?: (collection: string, ids: any[], fields: string[]) => Promise<void>;

  constructor(db: AnyDb, logger?: any) {
    this.db = db;
    this.logger = logger || console;
  }

  async loadRules(): Promise<ScanRule[]> {
    let rows: any[] = [];
    try {
      rows = await this.db.getRepository('ptdlScanRules').find({ filter: { enabled: true } });
    } catch (e: any) {
      this.logger?.warn?.(`[ptdl-scan] loadRules: ${e?.message || e}`);
    }
    const STRAT = new Set(['fifo', 'lifo', 'fefo', 'weighted_avg']);
    this.rules = rows.map((r) => {
      const g = (k: string) => (typeof r.get === 'function' ? r.get(k) : r[k]);
      const method = STRAT.has(g('method')) ? (g('method') as Strategy) : 'weighted_avg';
      const rp = Number(g('roundPrecision'));
      return {
        collectionName: g('collectionName'), partitionBy: asList(g('partitionBy')), orderBy: asOrder(g('orderBy')), method,
        qtyMode: (g('qtyMode') || 'signed') as QtyMode, qtyField: g('qtyField'),
        inQtyField: g('inQtyField') || undefined, outQtyField: g('outQtyField') || undefined,
        directionField: g('directionField') || undefined, inValue: g('inValue') || undefined, qtyFormula: g('qtyFormula') || undefined,
        costMode: (g('costMode') || 'column') as CostMode, costField: g('costField') || undefined, costFormula: g('costFormula') || undefined,
        expiryField: g('expiryField') || undefined, roundPrecision: Number.isFinite(rp) ? rp : undefined,
        roundMode: (g('roundMode') || 'half_up') as RoundMode, negativePolicy: (g('negativePolicy') || 'allow') as NegativePolicy, missingCostPolicy: (g('missingCostPolicy') || 'zero') as MissingCostPolicy,
        outUnitCost: g('outUnitCost') || undefined, outCogs: g('outCogs') || undefined, outConsumedQty: g('outConsumedQty') || undefined,
        outConsumedUnitCost: g('outConsumedUnitCost') || undefined, outRunningQty: g('outRunningQty') || undefined,
        outRunningValue: g('outRunningValue') || undefined, outAvgCost: g('outAvgCost') || undefined, outAllocations: g('outAllocations') || undefined,
        enabled: g('enabled') !== false,
      } as ScanRule;
    }).filter((r) => r.collectionName && r.orderBy.length && (r.qtyMode === 'split' ? (r.inQtyField || r.outQtyField) : r.qtyMode === 'formula' ? r.qtyFormula : r.qtyField));
    for (const r of this.rules) this.ensureHook(r.collectionName);
    this.logger?.info?.(`[ptdl-scan] ${this.rules.length} scan rule(s) across ${this.hooked.size} collection(s)`);
    return this.rules;
  }

  private rulesFor(collection: string) { return this.rules.filter((r) => r.collectionName === collection); }

  private ensureHook(collection: string) {
    if (!collection || this.hooked.has(collection)) return;
    this.hooked.add(collection);
    this.db.on(`${collection}.afterCreateWithAssociations`, (i: any, o: any) => this.onChange(collection, i, o, false));
    this.db.on(`${collection}.afterUpdate`, (i: any, o: any) => this.onChange(collection, i, o, true));
    this.db.on(`${collection}.afterDestroy`, (i: any, o: any) => this.onChange(collection, i, o, false));
  }

  private afterCommit(options: any, fn: () => Promise<void>) {
    const run = () => fn().catch((e) => this.logger?.error?.(`[ptdl-scan] ${e?.message || e}`));
    const t = options?.transaction;
    if (t && typeof t.afterCommit === 'function') t.afterCommit(run);
    else run();
  }

  private onChange(collection: string, instance: any, options: any, isUpdate: boolean) {
    const rules = this.rulesFor(collection);
    if (!rules.length) return;
    const jobs = rules.map((rule) => {
      const cur: Record<string, any> = {};
      for (const c of rule.partitionBy) cur[c] = instance.get(c);
      const parts = [cur];
      if (isUpdate && typeof instance.previous === 'function') {
        const prev: Record<string, any> = {};
        let moved = false;
        for (const c of rule.partitionBy) { prev[c] = instance.previous(c); if (prev[c] !== undefined && prev[c] !== cur[c]) moved = true; }
        if (moved) parts.push(prev);
      }
      return { rule, parts };
    });
    this.afterCommit(options, async () => {
      const touched = new Set<string>();
      for (const { rule, parts } of jobs) for (const p of parts) { await this.recomputePartition(rule, p); touched.add(rule.collectionName); }
      if (touched.size) { try { this.notify?.([...touched]); } catch { /* ignore */ } }
    });
  }

  /** Load one partition ordered, run the allocation scan, write the mapped output columns per row. */
  async recomputePartition(rule: ScanRule, partVals: Record<string, any>) {
    const repo = this.db.getRepository(rule.collectionName);
    const filter: Record<string, any> = {};
    for (const c of rule.partitionBy) filter[c] = partVals[c] === undefined ? null : partVals[c];
    const sort = rule.orderBy.map((o) => (o.dir === 'desc' ? '-' : '') + o.field);
    const rows = await repo.find({ filter, sort });
    if (!rows.length) return;
    const pk = repo.collection?.model?.primaryKeyAttribute || 'id';
    const P = rule.roundPrecision ?? 4;
    const RM = rule.roundMode || 'half_up';
    const results = scanLedger(rows, makeResolvers(rule, pk));
    // The engine writes only the IRREDUCIBLE PRIMITIVES; ratios (avg unit cost, consumed unit cost) are
    // DERIVED — kept as computed columns and refreshed via `derive` below (their formula = value / qty).
    const ids: any[] = [];
    await this.db.sequelize.transaction(async (transaction: any) => {
      for (let i = 0; i < rows.length; i++) {
        const o = results[i];
        const id = rows[i].get(pk);
        ids.push(id);
        const values: Record<string, any> = {};
        if (rule.outUnitCost) values[rule.outUnitCost] = round(o.unitCost, P, RM);
        if (rule.outCogs) values[rule.outCogs] = round(o.consumedValue, P, RM);
        if (rule.outConsumedQty) values[rule.outConsumedQty] = round(o.consumedQty, P, RM);
        if (rule.outRunningQty) values[rule.outRunningQty] = round(o.runningQty, P, RM);
        if (rule.outRunningValue) values[rule.outRunningValue] = round(o.runningValue, P, RM);
        if (rule.outAllocations) values[rule.outAllocations] = o.allocations.length ? JSON.stringify(o.allocations) : null;
        if (Object.keys(values).length) await repo.update({ filterByTk: id, values, transaction, hooks: false });
      }
    });
    // refresh the derived computed columns for exactly these rows (scoped — not the whole collection).
    const derived = [rule.outAvgCost, rule.outConsumedUnitCost].filter(Boolean) as string[];
    if (derived.length) { try { await this.derive?.(rule.collectionName, ids, derived); } catch (e: any) { this.logger?.warn?.(`[ptdl-scan] derive: ${e?.message || e}`); } }
  }

  /** Backfill: recompute every partition for the matching rule(s). */
  async recomputeAll(opts?: { collection?: string }): Promise<number> {
    const rules = this.rules.filter((r) => !opts?.collection || r.collectionName === opts.collection);
    for (const rule of rules) {
      if (!rule.partitionBy.length) { await this.recomputePartition(rule, {}); continue; }
      const repo = this.db.getRepository(rule.collectionName);
      const all = await repo.find({ fields: [...rule.partitionBy] });
      const seen = new Set<string>();
      for (const row of all) {
        const partVals: Record<string, any> = {};
        for (const c of rule.partitionBy) partVals[c] = row.get(c);
        const key = JSON.stringify(rule.partitionBy.map((c) => partVals[c]));
        if (seen.has(key)) continue;
        seen.add(key);
        await this.recomputePartition(rule, partVals);
      }
    }
    if (rules.length) { try { this.notify?.([...new Set(rules.map((r) => r.collectionName))]); } catch { /* ignore */ } }
    return rules.length;
  }

  /** Period close / point-in-time: on-hand qty + value per partition AS OF a cutoff (read-only). */
  async closing(opts: { collection?: string; asOf?: string } = {}): Promise<any[]> {
    const rules = this.rules.filter((r) => !opts.collection || r.collectionName === opts.collection);
    const out: any[] = [];
    for (const rule of rules) {
      const repo = this.db.getRepository(rule.collectionName);
      let partitions: Record<string, any>[] = [{}];
      if (rule.partitionBy.length) {
        const all = await repo.find({ fields: [...rule.partitionBy] });
        const seen = new Set<string>(); partitions = [];
        for (const row of all) {
          const pv: Record<string, any> = {}; for (const c of rule.partitionBy) pv[c] = row.get(c);
          const key = JSON.stringify(rule.partitionBy.map((c) => pv[c]));
          if (!seen.has(key)) { seen.add(key); partitions.push(pv); }
        }
      }
      const timeCol = rule.orderBy[0]?.field;
      const sort = rule.orderBy.map((o) => (o.dir === 'desc' ? '-' : '') + o.field);
      const pk = repo.collection?.model?.primaryKeyAttribute || 'id';
      for (const pv of partitions) {
        const filter: Record<string, any> = {};
        for (const c of rule.partitionBy) filter[c] = pv[c] === undefined ? null : pv[c];
        if (opts.asOf && timeCol) filter[timeCol] = { $lte: opts.asOf };
        const rows = await repo.find({ filter, sort });
        if (!rows.length) continue;
        const P = rule.roundPrecision ?? 4;
        const RM = rule.roundMode || 'half_up';
        const res = scanLedger(rows, makeResolvers(rule, pk));
        const last = res[res.length - 1];
        out.push({ collection: rule.collectionName, method: rule.method, partition: pv, asOf: opts.asOf || null, qty: round(last.runningQty, P, RM), value: round(last.runningValue, P, RM), avgCost: round(last.avgCost, P, RM) });
      }
    }
    return out;
  }
}
