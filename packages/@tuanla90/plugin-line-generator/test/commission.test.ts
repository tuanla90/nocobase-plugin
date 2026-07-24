/* Node test for the pure commission algorithm — proves the hardest logic (person resolution via REL,
 * dynamic based_on/recipient paths, base×rate math, required-null skip) WITHOUT the NocoBase runtime.
 * Bundle with esbuild + run with node (see test/run.sh). */
import { generateCore, resolveInlineRules } from '../src/shared/generateCore';
import { GenerateManager } from '../src/server/generator';
import type { LineGenConfig } from '../src/shared/types';
import { COMMISSION_INLINE_TEMPLATE } from '../src/shared/templates';

let failures = 0;
function assert(cond: any, msg: string) {
  if (cond) {
    console.log('  ✓ ' + msg);
  } else {
    failures++;
    console.log('  ✗ FAIL: ' + msg);
  }
}
function eq(a: any, b: any, msg: string) {
  assert(a === b, `${msg}  (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);
}

// ---- fixtures ----
const G1 = { shipping_type: 'Chính ngạch', quotation_method: 'Báo trọn', is_active: true };

// employees (managers carry their own position/department for the position/department outputs)
const pos = (name: string) => ({ name });
const dep = (name: string) => ({ name });
const Bob = { id: 'BOB', position: pos('Trưởng phòng'), department: dep('Kinh doanh') };
const Carol = { id: 'CAROL', position: pos('Giám đốc'), department: dep('Kinh doanh') };
const Frank = { id: 'FRANK', position: pos('Trưởng phòng'), department: dep('Kế toán') };
const Alice = { id: 'ALICE', position: pos('Nhân viên'), department: dep('Kinh doanh'), direct_manager: Bob, indirect_manager: Carol };
const Dan = { id: 'DAN', position: pos('Nhân viên'), department: dep('Giao dịch'), direct_manager: null, indirect_manager: null };
const Eve = { id: 'EVE', position: pos('Nhân viên'), department: dep('Kế toán'), direct_manager: Frank, indirect_manager: null };

function rule(name: string, based_on: string, recipient: string, base_field: string, rate: number) {
  return { name, based_on, recipient, base_field, rate, is_active: true, commission_rule_group: G1 };
}
const G1_RULES = [
  rule('Lương vận chuyển', 'responsible_staff', 'self', 'package_revenue', 0.02),
  rule('Lương order', 'responsible_staff', 'self', 'payment_profit', 0.2),
  rule('Lương order GD', 'transaction_staff', 'self', 'payment_profit', 0.1),
  rule('Lương phí order GD', 'responsible_staff', 'self', 'order_service_fee', 0.1),
  rule('Lương phí order GD - TP', 'responsible_staff', 'direct_manager', 'order_service_fee', 0.2),
  rule('Lương phí order GD - GĐ', 'responsible_staff', 'indirect_manager', 'order_service_fee', 0.2),
  rule('Lương trưởng phòng', 'responsible_staff', 'direct_manager', 'commission_price', 0.0025),
  rule('Lương giám đốc', 'responsible_staff', 'indirect_manager', 'commission_price', 0.0025),
  rule('Lương báo dư', 'responsible_staff', 'self', 'extra_amount', 0.1),
  rule('Lương báo dư - TP', 'responsible_staff', 'direct_manager', 'extra_amount', 0.1),
  rule('Lương báo dư - GĐ', 'responsible_staff', 'indirect_manager', 'extra_amount', 0.1),
  rule('Com kế toán vận chuyển', 'liquidation_employee', 'self', 'commission_price', 0.0004),
  rule('Com kế toán vận chuyển - TP', 'liquidation_employee', 'direct_manager', 'commission_price', 0.0004),
  rule('Com kế toán order', 'liquidation_employee', 'self', 'payment_profit', 0.002),
  rule('Com kế toán order - TP', 'liquidation_employee', 'direct_manager', 'payment_profit', 0.002),
];

// The commission config — this is EXACTLY the ptdl_linegen_rules row that ships for the commission case.
const CONFIG: LineGenConfig = {
  key: 'order-commission',
  title: 'Tính hoa hồng đơn hàng',
  enabled: true,
  sourceCollection: 'orders',
  sourceLinesPath: null,
  ruleCollection: 'commission_rules',
  matchMap: [
    { ruleField: 'commission_rule_group.shipping_type', sourceField: 'shipping_type' },
    { ruleField: 'commission_rule_group.quotation_method', sourceField: 'quotation_method' },
  ],
  ruleFilter: { is_active: true, 'commission_rule_group.is_active': true },
  preload: [], // (server-side appends; not needed for the in-memory fixture)
  ruleAppends: ['commission_rule_group'],
  deriveVars: [
    { name: 'personPath', formula: "rule.based_on & IF(rule.recipient=='self', '', '.' & rule.recipient)" },
  ],
  skipIf: null,
  lineOutputs: [
    { targetField: 'employee_id', formula: "REL(parent, personPath & '.id')", required: true },
    { targetField: 'commission_rule_name', formula: 'rule.name' },
    { targetField: 'position', formula: "REL(parent, personPath & '.position.name')" },
    { targetField: 'department', formula: "REL(parent, personPath & '.department.name')" },
    { targetField: 'base_field', formula: 'rule.base_field' },
    { targetField: 'base_value', formula: 'NUM(parent[rule.base_field])' },
    { targetField: 'rate', formula: 'rule.rate' },
    { targetField: 'commission_amt', formula: 'NUM(parent[rule.base_field]) * rule.rate' },
    { targetField: 'period_month', formula: 'YMONTH(parent.liquidation_date)' },
    { targetField: 'run_version', formula: 'runVersion' },
    { targetField: 'shipping_type', formula: 'parent.shipping_type' },
    { targetField: 'quotation_method', formula: 'parent.quotation_method' },
  ],
  groupBy: null,
  targetPath: 'order_commissions',
  targetForeignKey: 'order_id',
  regenPolicy: 'version',
  runVersionSource: 'rerun_count',
  markerField: '_genRule',
  hashField: '_genHash',
  guard: [
    { field: 'status', value: 'Đã thanh lý' },
    { field: 'is_commission_created', value: false },
  ],
  parentUpdates: [
    { targetField: 'is_commission_created', formula: 'true' },
    { targetField: 'commission_status', formula: "'COMPLETED'" },
  ],
};

function order(extra: any) {
  return {
    id: 'ORD1',
    shipping_type: 'Chính ngạch',
    quotation_method: 'Báo trọn',
    status: 'Đã thanh lý',
    is_commission_created: false,
    liquidation_date: '2026-07-10',
    rerun_count: 0,
    package_revenue: 100_000_000,
    payment_profit: 20_000_000,
    order_service_fee: 5_000_000,
    commission_price: 80_000_000,
    extra_amount: 1_000_000,
    shipping_fee_commission: 0,
    ...extra,
  };
}

// ============ Scenario A: full staffing → all 15 rules produce a row ============
console.log('\nScenario A — full staffing (G1):');
{
  const parent = order({ responsible_staff: Alice, transaction_staff: Dan, liquidation_employee: Eve });
  const { rows, skipped, errors } = generateCore(CONFIG, { parent, srcRows: [], rules: G1_RULES, runVersion: 1 });
  eq(errors.length, 0, 'no evaluation errors');
  eq(skipped.length, 0, 'nothing skipped');
  eq(rows.length, 15, '15 commission rows');

  const byName = (n: string) => rows.find((r) => r.commission_rule_name === n)!;
  eq(byName('Lương vận chuyển').employee_id, 'ALICE', 'shipping salary -> responsible_staff (Alice)');
  eq(byName('Lương vận chuyển').commission_amt, 2_000_000, 'shipping salary = 100M × 2%');
  eq(byName('Lương order GD').employee_id, 'DAN', 'order-GD salary -> transaction_staff (Dan)');
  eq(byName('Lương order GD').commission_amt, 2_000_000, 'order-GD = 20M × 10%');
  eq(byName('Lương phí order GD - TP').employee_id, 'BOB', 'fee-TP -> direct_manager of responsible (Bob)');
  eq(byName('Lương phí order GD - TP').commission_amt, 1_000_000, 'fee-TP = 5M × 20%');
  eq(byName('Lương phí order GD - GĐ').employee_id, 'CAROL', 'fee-GĐ -> indirect_manager (Carol)');
  eq(byName('Lương trưởng phòng').employee_id, 'BOB', 'TP salary -> direct_manager (Bob)');
  eq(byName('Lương trưởng phòng').commission_amt, 200_000, 'TP salary = 80M × 0.25%');
  eq(byName('Lương giám đốc').commission_amt, 200_000, 'GĐ salary = 80M × 0.25%');
  eq(byName('Com kế toán vận chuyển').employee_id, 'EVE', 'accountant-shipping -> liquidation_employee (Eve)');
  eq(byName('Com kế toán vận chuyển').commission_amt, 32_000, 'accountant-shipping = 80M × 0.04%');
  eq(byName('Com kế toán vận chuyển - TP').employee_id, 'FRANK', 'accountant-shipping-TP -> Eve.direct_manager (Frank)');
  eq(byName('Com kế toán order').commission_amt, 40_000, 'accountant-order = 20M × 0.2%');
  // snapshot fields
  eq(byName('Lương trưởng phòng').position, 'Trưởng phòng', 'position snapshot = Bob position');
  eq(byName('Lương giám đốc').position, 'Giám đốc', 'position snapshot = Carol position');
  eq(byName('Lương vận chuyển').department, 'Kinh doanh', 'department snapshot = Alice department');
  eq(byName('Lương vận chuyển').period_month, '2026-07', 'period_month = YYYY-MM of liquidation_date');
  eq(byName('Lương vận chuyển').run_version, 1, 'run_version = 1');
  eq(byName('Lương vận chuyển')._genRule, 'order-commission', 'marker stamped');
  assert(byName('Lương vận chuyển')._genHash, 'hash stamped');
  // total commission across everyone
  const total = rows.reduce((s, r) => s + r.commission_amt, 0);
  eq(total, 2_000_000 + 4_000_000 + 2_000_000 + 500_000 + 1_000_000 + 1_000_000 + 200_000 + 200_000 + 100_000 + 100_000 + 100_000 + 32_000 + 32_000 + 40_000 + 40_000, 'grand total matches hand calc');
}

// ============ Scenario B: missing managers + missing transaction_staff → skips ============
console.log('\nScenario B — Alice has no managers, no transaction_staff, Eve has no manager:');
{
  const AliceNoMgr = { id: 'ALICE', position: pos('Nhân viên'), department: dep('Kinh doanh'), direct_manager: null, indirect_manager: null };
  const EveNoMgr = { id: 'EVE', position: pos('Nhân viên'), department: dep('Kế toán'), direct_manager: null, indirect_manager: null };
  const parent = order({ responsible_staff: AliceNoMgr, transaction_staff: null, liquidation_employee: EveNoMgr });
  const { rows, skipped } = generateCore(CONFIG, { parent, srcRows: [], rules: G1_RULES, runVersion: 1 });
  const names = rows.map((r) => r.commission_rule_name).sort();
  eq(rows.length, 6, 'only 6 self-rows survive');
  eq(skipped.length, 9, '9 rows skipped (missing person/manager)');
  assert(names.includes('Lương vận chuyển') && names.includes('Lương order') && names.includes('Lương phí order GD') && names.includes('Lương báo dư'), 'Alice self-rows present');
  assert(names.includes('Com kế toán vận chuyển') && names.includes('Com kế toán order'), 'Eve self-rows present');
  assert(!names.includes('Lương order GD'), 'transaction_staff row skipped (staff null)');
  assert(!names.includes('Lương trưởng phòng') && !names.includes('Lương giám đốc'), 'manager rows skipped');
  assert(skipped.every((s) => s.reason === 'required-null'), 'all skips are required-null (employee_id resolved to null)');
}

// ============ Scenario C: INLINE rules (no external rule tables) — G1 order via scopes ============
console.log('\nScenario C — inline rules (scopes G1–G4 embedded in config):');
{
  const parent = order({ responsible_staff: Alice, transaction_staff: Dan, liquidation_employee: Eve });
  const rules = resolveInlineRules(COMMISSION_INLINE_TEMPLATE, parent);
  eq(rules.length, 15, 'G1 scope matched → 15 inline rules (G2–G4 filtered out)');
  assert(rules.every((r: any) => r._scope?.startsWith('G1')), 'all resolved rules carry the G1 scope tag');
  const { rows, skipped, errors } = generateCore(COMMISSION_INLINE_TEMPLATE, { parent, srcRows: [], rules, runVersion: 1 });
  eq(errors.length, 0, 'no evaluation errors (inline)');
  eq(skipped.length, 0, 'nothing skipped (inline)');
  eq(rows.length, 15, '15 commission rows (inline)');
  const total = rows.reduce((s, r) => s + r.commission_amt, 0);
  eq(total, 11_344_000, 'inline grand total = 11,344,000 (same as collection mode)');

  // G4 order (Tiểu ngạch + Hàng lẻ): shipping rule uses shipping_fee_commission ×4%
  const g4parent = order({ shipping_type: 'Tiểu ngạch', quotation_method: 'Hàng lẻ', shipping_fee_commission: 50_000_000, responsible_staff: Alice, transaction_staff: Dan, liquidation_employee: Eve });
  const g4rules = resolveInlineRules(COMMISSION_INLINE_TEMPLATE, g4parent);
  eq(g4rules.length, 15, 'G4 scope matched for Tiểu ngạch + Hàng lẻ');
  const g4 = generateCore(COMMISSION_INLINE_TEMPLATE, { parent: g4parent, srcRows: [], rules: g4rules, runVersion: 1 });
  const ship = g4.rows.find((r) => r.commission_rule_name === 'Lương vận chuyển')!;
  eq(ship.commission_amt, 2_000_000, 'G4 shipping = 50M × 4% (shipping_fee_commission)');
  eq(ship.base_field, 'shipping_fee_commission', 'G4 shipping base_field differs from G1');

  // no scope matches → 0 rules (e.g. missing quotation_method)
  const noneParent = order({ quotation_method: 'Khác', responsible_staff: Alice });
  eq(resolveInlineRules(COMMISSION_INLINE_TEMPLATE, noneParent).length, 0, 'no scope matches → 0 rules');

  // disabled scope is skipped
  const cfgDisabled = JSON.parse(JSON.stringify(COMMISSION_INLINE_TEMPLATE));
  cfgDisabled.scopes[0].enabled = false;
  eq(resolveInlineRules(cfgDisabled, parent).length, 0, 'disabled G1 scope → 0 rules for a G1 order');
}

// ============ Scenario D: CASE-WHEN mapping — config enum values ≠ relation names ============
// The user's point: config values are business codes, not schema names. SWITCH maps them explicitly.
console.log('\nScenario D — decoupled enums (based_on="NVPT", recipient="TP") mapped via SWITCH:');
{
  const parent = order({ responsible_staff: Alice, transaction_staff: Dan, liquidation_employee: Eve });
  const rules = [
    { name: 'Lương vận chuyển', based_on: 'NVPT', recipient: 'BAN_THAN', base_field: 'package_revenue', rate: 0.02 },
    { name: 'Lương trưởng phòng', based_on: 'NVPT', recipient: 'TP', base_field: 'commission_price', rate: 0.0025 },
    { name: 'Com kế toán', based_on: 'KTTL', recipient: 'BAN_THAN', base_field: 'commission_price', rate: 0.0004 },
  ];
  const cfg: LineGenConfig = {
    key: 'd-test', title: 'D', enabled: true, sourceCollection: 'orders', sourceLinesPath: null,
    ruleSource: 'inline', scopes: [{ name: 'all', rules }],
    matchMap: [],
    deriveVars: [{
      name: 'person',
      formula: "SWITCH(rule.based_on & '|' & rule.recipient, 'NVPT|BAN_THAN', REL(parent,'responsible_staff'), 'NVPT|TP', REL(parent,'responsible_staff.direct_manager'), 'KTTL|BAN_THAN', REL(parent,'liquidation_employee'), null)",
    }],
    lineOutputs: [
      { targetField: 'employee_id', formula: "REL(person, 'id')", required: true },
      { targetField: 'commission_amt', formula: 'NUM(parent[rule.base_field]) * rule.rate' },
    ],
    targetPath: 'order_commissions', targetForeignKey: 'order_id', regenPolicy: 'append',
  };
  const inlineRules = resolveInlineRules(cfg, parent);
  const { rows, errors } = generateCore(cfg, { parent, srcRows: [], rules: inlineRules, runVersion: 1 });
  eq(errors.length, 0, 'no errors with arbitrary enum codes');
  eq(rows.length, 3, '3 rows resolved');
  eq(rows[0].employee_id, 'ALICE', "'NVPT|BAN_THAN' → Alice (mapped, not name-matched)");
  eq(rows[1].employee_id, 'BOB', "'NVPT|TP' → Bob (direct manager)");
  eq(rows[2].employee_id, 'EVE', "'KTTL|BAN_THAN' → Eve");
}

// ============ Scenario E: direct dot-chains are null-safe (no REL needed) ============
console.log('\nScenario E — direct dots, null-safe:');
{
  const parent = order({ responsible_staff: Dan }); // Dan has NO managers
  const cfg: LineGenConfig = {
    key: 'e-test', title: 'E', enabled: true, sourceCollection: 'orders', sourceLinesPath: null,
    ruleSource: 'inline', scopes: [{ name: 'all', rules: [{ name: 'TP rule', rate: 0.5 }] }], matchMap: [],
    lineOutputs: [
      { targetField: 'employee_id', formula: 'parent.responsible_staff.direct_manager.id', required: true },
      { targetField: 'amt', formula: '1.5 * NUM(parent.package_revenue)' }, // numeric literal must survive the rewrite
    ],
    targetPath: 'order_commissions', targetForeignKey: 'order_id', regenPolicy: 'append',
  };
  const rules = resolveInlineRules(cfg, parent);
  const { rows, skipped, errors } = generateCore(cfg, { parent, srcRows: [], rules, runVersion: 1 });
  eq(errors.length, 0, 'null hop mid-chain → NO error (optional chaining)');
  eq(rows.length, 0, 'row dropped (required)');
  eq(skipped.length, 1, 'clean required-null skip');
  assert(skipped[0]?.reason === 'required-null', 'skip reason is required-null, not a thrown error');

  const parent2 = order({ responsible_staff: Alice }); // Alice HAS Bob as direct manager
  const ok = generateCore(cfg, { parent: parent2, srcRows: [], rules: resolveInlineRules(cfg, parent2), runVersion: 1 });
  eq(ok.rows.length, 1, 'resolves when the chain is complete');
  eq(ok.rows[0].employee_id, 'BOB', 'parent.responsible_staff.direct_manager.id → Bob');
  eq(ok.rows[0].amt, 150_000_000, '1.5 numeric literal untouched by the dot rewrite');
}

// ============ Scenario F: bare word → string literal + parentUpdates in debug trace ============
console.log('\nScenario F — unquoted literal + parentUpdates debug trace:');
{
  const parent = order({ responsible_staff: Alice });
  const cfg: LineGenConfig = {
    key: 'f', title: 'F', enabled: true, sourceCollection: 'orders', sourceLinesPath: null,
    ruleSource: 'inline', scopes: [{ name: 'all', rules: [{ x: 1 }] }],
    lineOutputs: [
      { targetField: 'status_text', formula: 'DRAFT' },      // bare word → should become the string "DRAFT"
      { targetField: 'amt', formula: 'NUM(parent.package_revenue)' },
    ],
    parentUpdates: [
      { targetField: 'commission_status', formula: 'COMPLETED' }, // bare → "COMPLETED" (bug 1)
      { targetField: 'note', formula: 'parent.nope.deep' },       // real error path stays an error
    ],
    targetPath: 'order_commissions', targetForeignKey: 'order_id', regenPolicy: 'append',
  };
  const rules = resolveInlineRules(cfg, parent);
  const out = generateCore(cfg, { parent, srcRows: [], rules, runVersion: 1, debug: true } as any);
  eq(out.rows[0].status_text, 'DRAFT', "bare 'DRAFT' → string literal (not an error)");
  eq(out.rows[0].amt, 100_000_000, 'real expression still evaluates');
  const pu = out.trace?.parentUpdates || [];
  eq(pu.find((u) => u.field === 'commission_status')?.value, 'COMPLETED', "parentUpdate bare 'COMPLETED' → literal in trace");
  assert(pu.find((u) => u.field === 'note')?.error == null, "parent.nope.deep is null-safe → no error (yields undefined)");
  assert((out.trace?.parentUpdates?.length || 0) === 2, 'trace exposes both parentUpdates for debug');
}

// ============ Scenario G: per-line BOM — ruleWhere `product_id = src.product_id` matches PER src row ====
// Regression: without per-pair ruleWhere enforcement every order line paired with every BOM row (a full
// cross-product), so a 2-line order × 5 BOM rows produced 10 pairs instead of the 5 correct ones.
console.log('\nScenario G — per-line BOM ruleWhere (src.product_id) + group/SUM:');
{
  const bom = (product_id: number, material_id: number, qty_per_unit: number, unit: string) => ({ product_id, material_id, qty_per_unit, unit });
  const RULES = [
    bom(1, 10, 4, 'cái'), bom(1, 20, 1, 'tấm'), bom(1, 30, 8, 'con'), // Ghế → Chân/Mặt/Vít
    bom(2, 10, 4, 'cái'), bom(2, 20, 1, 'tấm'),                        // Bàn → Chân/Mặt
  ];
  const cfg: LineGenConfig = {
    key: 'bom', title: 'BOM', enabled: true, sourceCollection: 'orders', sourceLinesPath: 'order_lines',
    ruleCollection: 'bom_lines',
    ruleWhere: [{ field: 'product_id', op: 'eq', value: 'src.product_id' }],
    lineOutputs: [
      { targetField: 'material_id', formula: 'rule.material_id', required: true },
      { targetField: 'qty', formula: 'NUM(src.quantity) * NUM(rule.qty_per_unit)' },
      { targetField: 'unit', formula: 'rule.unit' },
    ],
    groupBy: ['material_id'], sumFields: ['qty'],
    targetPath: 'material_requirements', targetForeignKey: 'order_id', regenPolicy: 'append',
  };
  const parent = { id: 1, order_lines: [{ product_id: 1, quantity: 10 }, { product_id: 2, quantity: 5 }] };
  const out = generateCore(cfg, { parent, srcRows: parent.order_lines, rules: RULES, runVersion: 1, debug: true } as any);
  const byMat = Object.fromEntries(out.rows.map((r) => [r.material_id, r.qty]));
  eq(out.rows.length, 3, 'grouped to 3 distinct materials (Chân/Mặt/Vít)');
  eq(byMat[10], 60, 'Chân = Ghế 10×4 + Bàn 5×4 = 60');
  eq(byMat[20], 15, 'Mặt = Ghế 10×1 + Bàn 5×1 = 15');
  eq(byMat[30], 80, 'Vít = Ghế 10×8 (Bàn has no Vít rule) = 80');
  eq(out.trace?.pairs?.length, 5, 'exactly 5 matched pairs (3 Ghế + 2 Bàn), NOT the 10-row cross-product');
}

// ============ Scenario H: FEATURE A — matchTiers priority fallback (specific > general) ============
// Task worked example: orders [id1 emp A, id2 emp B]; config rows [role=NV,user=A,10%] & [role=NV,user=null,6%];
// tiers=[[user==src.emp],[role==src.role]]. → id1 tier0 (A-row) 10%; id2 tier1 (null-row) 6%; NEVER id1=both.
console.log('\nScenario H — matchTiers (specific employee row overrides role fallback):');
{
  const RULES = [
    { role: 'NV', user: 'A', rate: 0.10 }, // SPECIFIC: employee A
    { role: 'NV', user: null, rate: 0.06 }, // GENERAL: whole role NV (user blank)
  ];
  const cfg: LineGenConfig = {
    key: 'tier', title: 'Tier', enabled: true, sourceCollection: 'orders', sourceLinesPath: 'lines',
    ruleCollection: 'commission_rules',
    ruleWhere: [], // base filter empty — both rows are candidates
    matchTiers: [
      [{ field: 'user', op: 'eq', value: 'src.emp' }], // tier 0 = most specific
      [{ field: 'role', op: 'eq', value: 'src.role' }], // tier 1 = role fallback
    ],
    lineOutputs: [
      { targetField: 'emp', formula: 'src.emp', required: true },
      { targetField: 'matched_user', formula: 'rule.user' },
      { targetField: 'rate', formula: 'rule.rate', required: true },
    ],
    targetPath: 'order_commissions', targetForeignKey: 'order_id', regenPolicy: 'append',
  };
  const parent = { id: 'ord', lines: [{ emp: 'A', role: 'NV' }, { emp: 'B', role: 'NV' }] };
  const out = generateCore(cfg, { parent, srcRows: parent.lines, rules: RULES, runVersion: 1 } as any);
  eq(out.rows.length, 2, 'exactly 2 rows (one per order line) — id1 NOT double-counted');
  const A = out.rows.filter((r) => r.emp === 'A');
  const B = out.rows.filter((r) => r.emp === 'B');
  eq(A.length, 1, 'emp A → exactly ONE row (tier 0 stops fall-through)');
  eq(A[0].rate, 0.10, 'id1 (emp A) → tier 0 specific A-row → 10%');
  eq(A[0].matched_user, 'A', 'id1 matched the SPECIFIC (user=A) row');
  eq(B.length, 1, 'emp B → exactly ONE row');
  eq(B[0].rate, 0.06, 'id2 (emp B) → tier 0 empty → tier 1 role fallback → 6%');
  eq(B[0].matched_user, null, 'id2 matched the GENERAL (user=null) row — auto-exclude kept it off the A-row');
}

// ============ Scenario I: FEATURE B — recursive multi-level BOM explosion (self-join) ============
// Task worked example: order product ×10; bom product→[S×2,R1×3]; S→[R2×4,R3×1]; R1/R2/R3 leaves.
// → leaves R1=30, R2=80 (10×2×4), R3=20 (10×2×1). S is a sub-assembly (dropped in 'leaves' mode).
console.log('\nScenario I — recursive BOM (multi-level, qty multiplies down the tree):');
{
  const BOM = [
    { product_id: 'P', material_id: 'S', qty_per_unit: 2 }, // product → sub-assembly S ×2
    { product_id: 'P', material_id: 'R1', qty_per_unit: 3 }, // product → raw R1 ×3
    { product_id: 'S', material_id: 'R2', qty_per_unit: 4 }, // S → raw R2 ×4
    { product_id: 'S', material_id: 'R3', qty_per_unit: 1 }, // S → raw R3 ×1
  ];
  const base: LineGenConfig = {
    key: 'rbom', title: 'RBOM', enabled: true, sourceCollection: 'orders', sourceLinesPath: 'order_lines',
    ruleCollection: 'bom_lines',
    ruleWhere: [{ field: 'product_id', op: 'eq', value: 'src.product_id' }],
    recurse: true, recurseParentKey: 'product_id', recurseChildKey: 'material_id', recurseQtyField: 'qty',
    lineOutputs: [
      { targetField: 'material_id', formula: 'rule.material_id', required: true },
      { targetField: 'qty', formula: 'NUM(src.qty) * NUM(rule.qty_per_unit)', required: true },
    ],
    targetPath: 'material_requirements', targetForeignKey: 'order_id', regenPolicy: 'append',
  };
  const parent = { id: 1, order_lines: [{ product_id: 'P', qty: 10 }] };

  // ---- 'leaves' mode (default) + group/SUM ----
  const leavesCfg: LineGenConfig = { ...base, recurseOutput: 'leaves', groupBy: ['material_id'], sumFields: ['qty'] };
  const L = generateCore(leavesCfg, { parent, srcRows: parent.order_lines, rules: BOM, runVersion: 1 } as any);
  const byMat = Object.fromEntries(L.rows.map((r) => [r.material_id, r.qty]));
  eq(L.rows.length, 3, "'leaves' → 3 raw materials (S sub-assembly dropped)");
  eq(byMat['R1'], 30, 'R1 = 10 × 3 = 30 (level-1 leaf)');
  eq(byMat['R2'], 80, 'R2 = 10 × 2 × 4 = 80 (multiplied down through S)');
  eq(byMat['R3'], 20, 'R3 = 10 × 2 × 1 = 20 (multiplied down through S)');
  assert(!('S' in byMat), "sub-assembly S is NOT in the leaves output");

  // ---- 'all' mode: every node kept, stamped with _level + _recurseParent ----
  const allCfg: LineGenConfig = { ...base, recurseOutput: 'all' };
  const AA = generateCore(allCfg, { parent, srcRows: parent.order_lines, rules: BOM, runVersion: 1 } as any);
  eq(AA.rows.length, 4, "'all' → 4 rows (S + R1 + R2 + R3)");
  const S = AA.rows.find((r) => r.material_id === 'S');
  const R2 = AA.rows.find((r) => r.material_id === 'R2');
  eq(S?.qty, 20, 'S sub-assembly qty = 10 × 2 = 20');
  eq(S?._level, 0, 'S stamped level 0');
  eq(R2?._level, 1, 'R2 stamped level 1 (one level deeper)');
  eq(R2?._recurseParent, 'S', 'R2 parent-link = S');
  eq(R2?.qty, 80, 'R2 qty in all-mode still 80');

  // ---- cyclic BOM: guard stops the branch instead of looping forever ----
  const CYCLE = [
    { product_id: 'P', material_id: 'A', qty_per_unit: 2 },
    { product_id: 'A', material_id: 'B', qty_per_unit: 2 },
    { product_id: 'B', material_id: 'A', qty_per_unit: 2 }, // A ↔ B cycle
  ];
  const C = generateCore(leavesCfg, { parent, srcRows: parent.order_lines, rules: CYCLE, runVersion: 1 } as any);
  assert(C.skipped.some((s) => s.reason === 'recurse-cycle'), 'cyclic BOM detected & stopped (recurse-cycle logged)');
  assert(C.rows.length > 0 && C.rows.length < 50, 'cycle terminated (finite rows, no infinite loop)');
}

// ============ Scenario J: BACK-COMPAT — new fields absent/false ≡ old behavior, byte-identical ============
console.log('\nScenario J — back-compat (no matchTiers / recurse:false ≡ pre-0.7):');
{
  // Same BOM config as Scenario G, once plain and once with the new fields explicitly neutral.
  const RULES = [
    { product_id: 1, material_id: 10, qty_per_unit: 4, unit: 'cái' },
    { product_id: 1, material_id: 20, qty_per_unit: 1, unit: 'tấm' },
    { product_id: 2, material_id: 10, qty_per_unit: 4, unit: 'cái' },
  ];
  const plainCfg: LineGenConfig = {
    key: 'bc', title: 'BC', enabled: true, sourceCollection: 'orders', sourceLinesPath: 'order_lines',
    ruleCollection: 'bom_lines',
    ruleWhere: [{ field: 'product_id', op: 'eq', value: 'src.product_id' }],
    lineOutputs: [
      { targetField: 'material_id', formula: 'rule.material_id', required: true },
      { targetField: 'qty', formula: 'NUM(src.quantity) * NUM(rule.qty_per_unit)' },
    ],
    groupBy: ['material_id'], sumFields: ['qty'],
    targetPath: 'material_requirements', targetForeignKey: 'order_id', regenPolicy: 'append',
  };
  const parent = { id: 1, order_lines: [{ product_id: 1, quantity: 10 }, { product_id: 2, quantity: 5 }] };
  const before = generateCore(plainCfg, { parent, srcRows: parent.order_lines, rules: RULES, runVersion: 1 } as any);
  const neutralCfg: LineGenConfig = { ...plainCfg, matchTiers: undefined, recurse: false };
  const after = generateCore(neutralCfg, { parent, srcRows: parent.order_lines, rules: RULES, runVersion: 1 } as any);
  eq(JSON.stringify(after.rows), JSON.stringify(before.rows), 'recurse:false + matchTiers:undefined → byte-identical rows');
  eq(JSON.stringify(after.skipped), JSON.stringify(before.skipped), 'skipped identical');
  // An EMPTY matchTiers array must also be a no-op (all ruleWhere-passing rules used).
  const emptyTiers = generateCore({ ...plainCfg, matchTiers: [] }, { parent, srcRows: parent.order_lines, rules: RULES, runVersion: 1 } as any);
  eq(JSON.stringify(emptyTiers.rows), JSON.stringify(before.rows), 'matchTiers:[] → no-op (identical rows)');
}

// ============ Scenario K: v0.8 PIPELINE — combo → BOM (2 config steps, recurse, qty multiplies) =======
// Task worked example: order_item combo "Ghế+Bàn" qty 2; step1 combo_config (recurse-capable) explodes a
// combo into its products; step2 bom explodes each product into raw materials; group by material + SUM.
// qty multiplies across steps: order_item.qty × combo.qty_per × bom.qty_per → gỗ=10 (4+6), đinh=12 (8+4).
console.log('\nScenario K — PIPELINE combo→BOM (2 different config tables, qty multiplies, group+SUM):');
{
  const COMBO_CFG = [
    { combo_id: 'COMBO', item_id: 'GHE', qty_per: 1 }, // COMBO = 1 Ghế + 1 Bàn
    { combo_id: 'COMBO', item_id: 'BAN', qty_per: 1 },
    { combo_id: 'SETX', item_id: 'COMBO', qty_per: 1 }, // SETX = 1 COMBO (a combo of combos → recursion)
  ];
  const BOM2 = [
    { product_id: 'GHE', material_id: 'GO', qty_per: 2 }, // Ghế → gỗ 2, đinh 4
    { product_id: 'GHE', material_id: 'DINH', qty_per: 4 },
    { product_id: 'BAN', material_id: 'GO', qty_per: 3 }, // Bàn → gỗ 3, đinh 2
    { product_id: 'BAN', material_id: 'DINH', qty_per: 2 },
  ];
  // step1: ⋈ combo_config, recurse ON (a combo can contain combos); step2: ⋈ bom. src.* carries qty forward.
  const comboStep = {
    stepType: 'config' as const, ruleCollection: 'combo_config',
    ruleWhere: [{ field: 'combo_id', op: 'eq' as const, value: 'src.product_id' }],
    recurse: true, recurseParentKey: 'combo_id', recurseChildKey: 'product_id', recurseQtyField: 'qty',
    lineOutputs: [
      { targetField: 'product_id', formula: 'rule.item_id', required: true },
      { targetField: 'qty', formula: 'NUM(src.qty) * NUM(rule.qty_per)', required: true },
    ],
  };
  const bomStep = {
    stepType: 'config' as const, ruleCollection: 'bom',
    ruleWhere: [{ field: 'product_id', op: 'eq' as const, value: 'src.product_id' }],
    lineOutputs: [
      { targetField: 'material_id', formula: 'rule.material_id', required: true },
      { targetField: 'qty', formula: 'NUM(src.qty) * NUM(rule.qty_per)', required: true },
    ],
  };
  const comboBomCfg: LineGenConfig = {
    key: 'combo-bom', title: 'Combo→BOM', enabled: true, sourceCollection: 'orders', sourceLinesPath: 'order_items',
    joinSteps: [comboStep, bomStep],
    groupBy: ['material_id'], sumFields: ['qty'],
    targetPath: 'material_requirements', targetForeignKey: 'order_id', regenPolicy: 'append',
  };

  // Order 1 — a plain COMBO (Ghế+Bàn) qty 2 → the exact acceptance numbers.
  const parent1 = { id: 1, order_items: [{ product_id: 'COMBO', qty: 2 }] };
  const K = generateCore(comboBomCfg, { parent: parent1, srcRows: parent1.order_items, rules: [], stepRules: [COMBO_CFG, BOM2], runVersion: 1 });
  const byMat = Object.fromEntries(K.rows.map((r) => [r.material_id, r.qty]));
  eq(K.errors.length, 0, 'no evaluation errors across the pipeline');
  eq(K.rows.length, 2, 'grouped to 2 materials (gỗ, đinh)');
  eq(byMat['GO'], 10, 'gỗ = combo qty2 × (Ghế 1×2 + Bàn 1×3) = 4 + 6 = 10');
  eq(byMat['DINH'], 12, 'đinh = combo qty2 × (Ghế 1×4 + Bàn 1×2) = 8 + 4 = 12');

  // Order 2 — a NESTED combo (SETX = 1 COMBO = Ghế+Bàn) qty 3 → proves recursion multiplies inside a step.
  const parent2 = { id: 2, order_items: [{ product_id: 'SETX', qty: 3 }] };
  const K2 = generateCore(comboBomCfg, { parent: parent2, srcRows: parent2.order_items, rules: [], stepRules: [COMBO_CFG, BOM2], runVersion: 1 });
  const byMat2 = Object.fromEntries(K2.rows.map((r) => [r.material_id, r.qty]));
  eq(byMat2['GO'], 15, 'nested: SETX×3 → 3 Ghế + 3 Bàn → gỗ = 3×2 + 3×3 = 15 (recurse × 2 steps)');
  eq(byMat2['DINH'], 18, 'nested: đinh = 3×4 + 3×2 = 18');
}

// ============ Scenario L: v0.8 PIPELINE — 3 DIFFERENT tables chain (value multiplies through each) =====
console.log('\nScenario L — PIPELINE 3 different config tables (chained rows, value multiplies):');
{
  const TA = [{ k: 'K', f: 2 }];
  const TB = [{ k: 'K', f: 3 }];
  const TC = [{ k: 'K', mat: 'M1', f: 5 }, { k: 'K', mat: 'M2', f: 7 }]; // fans 1 → 2 rows at the last step
  const cfgL: LineGenConfig = {
    key: 'multi3', title: '3-step', enabled: true, sourceCollection: 'orders', sourceLinesPath: 'lines',
    joinSteps: [
      { stepType: 'config', ruleCollection: 'tableA', ruleWhere: [{ field: 'k', op: 'eq', value: 'src.key' }],
        lineOutputs: [{ targetField: 'key', formula: 'src.key' }, { targetField: 'val', formula: 'NUM(src.qty) * NUM(rule.f)' }] },
      { stepType: 'config', ruleCollection: 'tableB', ruleWhere: [{ field: 'k', op: 'eq', value: 'src.key' }],
        lineOutputs: [{ targetField: 'key', formula: 'src.key' }, { targetField: 'val', formula: 'NUM(src.val) * NUM(rule.f)' }] },
      { stepType: 'config', ruleCollection: 'tableC', ruleWhere: [{ field: 'k', op: 'eq', value: 'src.key' }],
        lineOutputs: [{ targetField: 'mat', formula: 'rule.mat' }, { targetField: 'val', formula: 'NUM(src.val) * NUM(rule.f)' }] },
    ],
    targetPath: 'x', targetForeignKey: 'order_id', regenPolicy: 'append',
  };
  const parentL = { id: 1, lines: [{ key: 'K', qty: 10 }] };
  const L = generateCore(cfgL, { parent: parentL, srcRows: parentL.lines, rules: [], stepRules: [TA, TB, TC], runVersion: 1 });
  const byMat = Object.fromEntries(L.rows.map((r) => [r.mat, r.val]));
  eq(L.rows.length, 2, '2 chained rows (tableC fans the single row into M1/M2)');
  eq(byMat['M1'], 300, 'M1 = 10 × 2 (A) × 3 (B) × 5 (C) = 300 — value threaded through 3 tables');
  eq(byMat['M2'], 420, 'M2 = 10 × 2 × 3 × 7 = 420');
}

// ============ Scenario M: v0.8 FAN-OUT SAFETY — maxRows cap ABORTS (no hang / no silent truncate) ======
console.log('\nScenario M — maxRows cap aborts a runaway pipeline:');
{
  const many = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i, x: 1 }));
  const cfgM = (maxRows: number): LineGenConfig => ({
    key: 'cap', title: 'cap', enabled: true, sourceCollection: 'orders', sourceLinesPath: 'lines',
    joinSteps: [
      { stepType: 'config', ruleCollection: 'a', ruleWhere: [], lineOutputs: [{ targetField: 'v', formula: '1' }] },
      { stepType: 'config', ruleCollection: 'b', ruleWhere: [], lineOutputs: [{ targetField: 'v', formula: '1' }] },
    ],
    maxRows,
    targetPath: 'x', targetForeignKey: 'order_id', regenPolicy: 'append',
  });
  const parentM = { id: 1, lines: [{ id: 1 }] };
  // step1: 1 src × 10 rules = 10 rows; step2: 10 × 10 = 100 rows. Cap 50 → abort at step2.
  const M = generateCore(cfgM(50), { parent: parentM, srcRows: parentM.lines, rules: [], stepRules: [many(10), many(10)], runVersion: 1 });
  assert(!!M.aborted, 'run ABORTED (not a hang, not a silent truncate)');
  eq(M.aborted?.reason, 'max-rows-exceeded', 'abort reason is max-rows-exceeded');
  eq(M.rows.length, 0, 'no rows returned on abort');
  assert(/maxRows/.test(M.aborted?.detail || ''), 'abort detail is a clear message mentioning maxRows');
  // Same pipeline under a higher cap runs to completion (100 rows, no abort).
  const Mok = generateCore(cfgM(500), { parent: parentM, srcRows: parentM.lines, rules: [], stepRules: [many(10), many(10)], runVersion: 1 });
  assert(!Mok.aborted, 'under a sufficient cap the same pipeline completes');
  eq(Mok.rows.length, 100, '10 × 10 = 100 rows produced when within the cap');
}

// ============ Scenario O: v0.8 RELATION step — fan out an association, NO config table =================
console.log('\nScenario O — relation-type step fans out the linked rows (no config table):');
{
  const cfgO: LineGenConfig = {
    key: 'rel', title: 'relation hop', enabled: true, sourceCollection: 'orders', sourceLinesPath: null,
    joinSteps: [
      { stepType: 'relation', relationPath: 'order_items',
        lineOutputs: [{ targetField: 'product_id', formula: 'rule.product_id', required: true }, { targetField: 'qty', formula: 'NUM(rule.qty)' }] },
    ],
    targetPath: 'x', targetForeignKey: 'order_id', regenPolicy: 'append',
  };
  // sourceLinesPath null → the parent is the single source row; the relation step follows parent.order_items.
  const parentO = { id: 1, order_items: [{ product_id: 'A', qty: 2 }, { product_id: 'B', qty: 3 }] };
  const O = generateCore(cfgO, { parent: parentO, srcRows: [], rules: [], stepRules: [[]], runVersion: 1 });
  const byP = Object.fromEntries(O.rows.map((r) => [r.product_id, r.qty]));
  eq(O.rows.length, 2, 'exactly the 2 FK-linked order_items fanned out (no config table scanned)');
  eq(byP['A'], 2, 'A row read from the association (rule.* = the related record)');
  eq(byP['B'], 3, 'B row read from the association');
  // OPTIONAL post-filter with ruleWhere on the fetched relation rows.
  const cfgOf: LineGenConfig = { ...cfgO, joinSteps: [{ ...cfgO.joinSteps![0], ruleWhere: [{ field: 'qty', op: 'gt', value: '2' }] }] };
  const Of = generateCore(cfgOf, { parent: parentO, srcRows: [], rules: [], stepRules: [[]], runVersion: 1 });
  eq(Of.rows.length, 1, 'ruleWhere post-filters the relation rows (qty > 2 → only B)');
  eq(Of.rows[0].product_id, 'B', 'the surviving relation row is B');
}

// ============ Scenario P: v0.8 UNIFICATION — relation step REPLACES sourceLinesPath in combo→BOM ========
console.log('\nScenario P — relation step0 replaces the sourceLinesPath hop (combo→BOM, same result):');
{
  const COMBO_CFG = [
    { combo_id: 'COMBO', item_id: 'GHE', qty_per: 1 },
    { combo_id: 'COMBO', item_id: 'BAN', qty_per: 1 },
  ];
  const BOM2 = [
    { product_id: 'GHE', material_id: 'GO', qty_per: 2 }, { product_id: 'GHE', material_id: 'DINH', qty_per: 4 },
    { product_id: 'BAN', material_id: 'GO', qty_per: 3 }, { product_id: 'BAN', material_id: 'DINH', qty_per: 2 },
  ];
  const cfgP: LineGenConfig = {
    key: 'combo-bom-rel', title: 'Combo→BOM (relation hop)', enabled: true, sourceCollection: 'orders', sourceLinesPath: null,
    joinSteps: [
      // step0 = a RELATION hop (order → order_items) instead of sourceLinesPath — the unification the design calls for.
      { stepType: 'relation', relationPath: 'order_items',
        lineOutputs: [{ targetField: 'product_id', formula: 'rule.product_id', required: true }, { targetField: 'qty', formula: 'NUM(rule.qty)', required: true }] },
      { stepType: 'config', ruleCollection: 'combo_config', ruleWhere: [{ field: 'combo_id', op: 'eq', value: 'src.product_id' }],
        recurse: true, recurseParentKey: 'combo_id', recurseChildKey: 'product_id', recurseQtyField: 'qty',
        lineOutputs: [{ targetField: 'product_id', formula: 'rule.item_id', required: true }, { targetField: 'qty', formula: 'NUM(src.qty) * NUM(rule.qty_per)', required: true }] },
      { stepType: 'config', ruleCollection: 'bom', ruleWhere: [{ field: 'product_id', op: 'eq', value: 'src.product_id' }],
        lineOutputs: [{ targetField: 'material_id', formula: 'rule.material_id', required: true }, { targetField: 'qty', formula: 'NUM(src.qty) * NUM(rule.qty_per)', required: true }] },
    ],
    groupBy: ['material_id'], sumFields: ['qty'],
    targetPath: 'material_requirements', targetForeignKey: 'order_id', regenPolicy: 'append',
  };
  const parentP = { id: 1, order_items: [{ product_id: 'COMBO', qty: 2 }] };
  const P = generateCore(cfgP, { parent: parentP, srcRows: [], rules: [], stepRules: [[], COMBO_CFG, BOM2], runVersion: 1 });
  const byMat = Object.fromEntries(P.rows.map((r) => [r.material_id, r.qty]));
  eq(P.rows.length, 2, '3-step pipeline (relation → combo → bom) → 2 materials');
  eq(byMat['GO'], 10, 'gỗ = 10 (same as the sourceLinesPath version — relation step unifies the hop)');
  eq(byMat['DINH'], 12, 'đinh = 12');
}

// ============ Scenario R: GenerateManager.run() dry-run — REGRESSION ============
// v0.8.0/0.8.1 shipped a dry-run return that read a block-scoped `rules` from outside its block →
// every preview threw "rules is not defined" (HTTP 500). The pure-core scenarios above can't catch
// that class of bug, so drive the REAL server wrapper (fake db) through BOTH branches, dryRun:true.
(async () => {
  console.log('\nScenario R — GenerateManager.run() dry-run regression (rules out-of-scope → 500):');
  const mkDb = (tables: Record<string, any[]>, parentRow: any) => ({
    getRepository: (name: string) => ({
      findOne: async (_q: any) => parentRow,
      find: async (_q: any) => tables[name] || [],
    }),
    sequelize: { transaction: async (_fn: any) => { throw new Error('dry-run must not open a transaction'); } },
  });

  // R1 — legacy single-join branch (external ruleCollection), same inputs as Scenario A.
  {
    const parent = order({ responsible_staff: Alice, transaction_staff: Dan, liquidation_employee: Eve });
    const direct = generateCore(CONFIG, { parent, srcRows: [], rules: G1_RULES, runVersion: 1 });
    const mgr = new GenerateManager(mkDb({ commission_rules: G1_RULES }, parent));
    try {
      const res = await mgr.run(CONFIG, 'ORD1', { dryRun: true });
      eq(res.ok, true, 'R1 legacy dry-run ok (no ReferenceError)');
      eq(res.ruleCount, G1_RULES.length, `R1 ruleCount = ${G1_RULES.length}`);
      eq((res.lines || []).length, direct.rows.length, 'R1 preview lines = direct core rows');
    } catch (e: any) {
      failures++;
      console.log('  ✗ FAIL: R1 legacy dry-run threw: ' + (e?.message || e));
    }
  }

  // R2 — joinSteps pipeline branch (config step loaded from its own table).
  {
    const cfg: LineGenConfig = {
      key: 'r2-bom', title: 'BOM (pipeline dry-run)', enabled: true,
      sourceCollection: 'orders', sourceLinesPath: 'order_items',
      joinSteps: [
        { stepType: 'config', ruleCollection: 'bom', ruleWhere: [{ field: 'product_id', op: 'eq', value: 'src.product_id' }],
          lineOutputs: [
            { targetField: 'material_id', formula: 'rule.material_id', required: true },
            { targetField: 'qty', formula: 'NUM(src.qty) * NUM(rule.qty_per)', required: true },
          ] },
      ],
      targetPath: 'material_requirements', targetForeignKey: 'order_id', regenPolicy: 'append',
    } as any;
    const parent = { id: 1, order_items: [{ product_id: 'GHE', qty: 2 }] };
    const BOM_TBL = [{ product_id: 'GHE', material_id: 'GO', qty_per: 2 }];
    const mgr = new GenerateManager(mkDb({ bom: BOM_TBL }, parent));
    try {
      const res = await mgr.run(cfg, 1, { dryRun: true });
      eq(res.ok, true, 'R2 pipeline dry-run ok (no ReferenceError)');
      eq(res.ruleCount, 1, 'R2 ruleCount = 1 (config-step rules)');
      eq((res.lines || []).length, 1, 'R2 one line generated');
      eq((res.lines || [])[0]?.qty, 4, 'R2 qty = 2 × 2');
    } catch (e: any) {
      failures++;
      console.log('  ✗ FAIL: R2 pipeline dry-run threw: ' + (e?.message || e));
    }
  }

  console.log('');
  if (failures) {
    console.log(`FAILED: ${failures} assertion(s)`);
    process.exit(1);
  } else {
    console.log('ALL PASSED');
  }
})().catch((e) => {
  console.log('✗ FAIL: unhandled — ' + (e?.message || e));
  process.exit(1);
});
