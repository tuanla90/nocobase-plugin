/* Node test for the pure commission algorithm — proves the hardest logic (person resolution via REL,
 * dynamic based_on/recipient paths, base×rate math, required-null skip) WITHOUT the NocoBase runtime.
 * Bundle with esbuild + run with node (see test/run.sh). */
import { generateCore, resolveInlineRules } from '../src/shared/generateCore';
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

console.log('');
if (failures) {
  console.log(`FAILED: ${failures} assertion(s)`);
  process.exit(1);
} else {
  console.log('ALL PASSED');
}
