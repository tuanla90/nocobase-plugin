// Starter templates for the config editor ("Nạp mẫu"). Each is a complete LineGenConfig the user can
// tweak. Keep in sync with seed/*.config.json (which are the deploy-time seeds of the same shape).
import type { LineGenConfig } from './types';

// Preload ONLY the person paths the 15 seeded rules actually resolve to (not every combo): responsible
// staff needs self+both managers; transaction staff only self; liquidation only self+direct. 6 paths.
// (The SWITCH stays generic; unused branches simply never fire.) We output the employee LINK, so
// position/department are shown on the result table THROUGH the relation — not preloaded/snapshotted.
function commissionPreload(): string[] {
  return [
    'responsible_staff', 'responsible_staff.direct_manager', 'responsible_staff.indirect_manager',
    'transaction_staff',
    'liquidation_employee', 'liquidation_employee.direct_manager',
  ];
}

// Resolve the recipient EMPLOYEE dynamically from the rule's own columns — 3 ways the engine supports
// dynamic access (pick per how your data is shaped):
//
//   1) DYNAMIC SCALAR COLUMN  — parent[rule.base_field]                (used below for base_value)
//        rule.base_field = 'package_revenue' → reads parent.package_revenue.
//   2) DYNAMIC RELATION        — parent[rule.based_on]                  (the person object)
//        rule.based_on = 'responsible_staff' → parent.responsible_staff.
//   3) DYNAMIC PATH via REL    — REL(parent, <path built from rule>)    (null-safe multi-hop)  ← used here
//
// `person` (a CTE-like derived var) builds the path 'responsible_staff[.direct_manager]' from the rule
// and walks it null-safely (missing manager → null → the required employee_id drops that row cleanly).
// THIS WORKS BECAUSE our based_on/recipient VALUES equal the relation NAMES. If your enums differ
// (e.g. based_on = 'NVPT'), map them first with a SWITCH:
//   person = SWITCH(rule.based_on & '|' & rule.recipient,
//              'NVPT|self', parent.responsible_staff, 'NVPT|TP', parent.responsible_staff.direct_manager, …, null)
const PERSON_DYNAMIC = "REL(parent, rule.based_on & IF(rule.recipient=='self', '', '.' & rule.recipient))";

export const COMMISSION_TEMPLATE: LineGenConfig = {
  key: 'order-commission',
  title: 'Tính hoa hồng đơn hàng',
  enabled: true,
  sourceCollection: 'orders',
  sourceLinesPath: null,
  ruleCollection: 'commission_rules',
  // v0.6 unified: only rule rows whose group matches this order + still active.
  ruleWhere: [
    { field: 'commission_rule_group.shipping_type', op: 'eq', value: 'parent.shipping_type' },
    { field: 'commission_rule_group.quotation_method', op: 'eq', value: 'parent.quotation_method' },
    { field: 'is_active', op: 'eq', value: 'true' },
    { field: 'commission_rule_group.is_active', op: 'eq', value: 'true' },
  ],
  preload: commissionPreload(),
  ruleAppends: ['commission_rule_group'],
  deriveVars: [{ name: 'person', formula: PERSON_DYNAMIC }],
  skipIf: null,
  // LEAN outputs: link the employee + keep only the numbers that ARE the commission. Everything derivable
  // from a relation (position, department, order's shipping/quotation) is shown on the result table
  // THROUGH the relation, not copied. Batches are told apart by the row's createdAt, so no run_version.
  lineOutputs: [
    { targetField: 'employee_id', formula: 'person.id', required: true },
    { targetField: 'commission_rule_name', formula: 'rule.name' },
    { targetField: 'base_field', formula: 'rule.base_field' },
    { targetField: 'base_value', formula: 'NUM(parent[rule.base_field])' },
    { targetField: 'rate', formula: 'rule.rate' },
    { targetField: 'commission_amt', formula: 'NUM(parent[rule.base_field]) * rule.rate' },
    { targetField: 'period_month', formula: 'YMONTH(parent.liquidation_date)' },
  ],
  groupBy: null,
  targetPath: 'order_commissions',
  targetForeignKey: 'order_id',
  regenPolicy: 'append',
  guard: [
    { field: 'status', value: 'Đã thanh lý' },
    { field: 'is_commission_created', value: false },
  ],
  parentUpdates: [
    { targetField: 'is_commission_created', formula: 'true' },
    { targetField: 'commission_status', formula: "'COMPLETED'" },
  ],
};

// BOM explosion — the OTHER half the same engine covers (per-line sources + group+SUM). Users adapt names.
export const BOM_TEMPLATE: LineGenConfig = {
  key: 'order-bom',
  title: 'Nổ định mức NVL theo đơn',
  enabled: true,
  sourceCollection: 'orders',
  sourceLinesPath: 'order_lines',
  ruleCollection: 'bom_lines',
  // matches per LINE: only BOM rows for the product on the current order line (src = the line row).
  ruleWhere: [{ field: 'product_id', op: 'eq', value: 'src.product_id' }],
  preload: ['order_lines'],
  ruleAppends: ['material'],
  deriveVars: [],
  skipIf: null,
  lineOutputs: [
    { targetField: 'material_id', formula: 'rule.material_id', required: true },
    { targetField: 'material_name', formula: 'rule.material.name' },
    { targetField: 'qty', formula: 'NUM(src.quantity) * NUM(rule.qty_per_unit) * (1 + NUM(rule.scrap_pct))' },
    { targetField: 'unit', formula: 'rule.unit' },
  ],
  groupBy: ['material_id'],
  sumFields: ['qty'],
  targetPath: 'material_requirements',
  targetForeignKey: 'order_id',
  regenPolicy: 'append',
  markerField: '_genRule',
  hashField: '_genHash',
};

// MULTI-LEVEL BOM (v0.7 recursion) — one run explodes product → sub-assembly → raw materials at any depth.
// The self-join: each generated child's material_id becomes the next level's product_id. The qty formula
// reads BOTH src.qty (the generated parent row, at deeper levels) and src.quantity (the order line, level 0)
// so it CHAINS: qty(level n) = qty(level n-1) × qty_per_unit. recurseQtyField='qty' makes it exact.
export const MULTI_LEVEL_BOM_TEMPLATE: LineGenConfig = {
  key: 'order-bom-recursive',
  title: 'Nổ định mức BOM đa cấp (đệ quy)',
  enabled: true,
  sourceCollection: 'orders',
  sourceLinesPath: 'order_lines',
  ruleCollection: 'bom_lines',
  ruleWhere: [{ field: 'product_id', op: 'eq', value: 'src.product_id' }],
  recurse: true,
  recurseParentKey: 'product_id', // RIGHT/config field = the "parent product" of a BOM row
  recurseChildKey: 'material_id', // generated field whose value is the next level's parent product
  recurseQtyField: 'qty', // output qty multiplied down the tree
  maxDepth: 20,
  recurseOutput: 'leaves', // keep only raw materials; drop intermediate sub-assemblies
  preload: ['order_lines'],
  ruleAppends: ['material'],
  deriveVars: [],
  skipIf: null,
  lineOutputs: [
    { targetField: 'material_id', formula: 'rule.material_id', required: true },
    { targetField: 'material_name', formula: 'rule.material.name' },
    // reads src.qty (deeper: the generated parent row) OR src.quantity (level 0: the order line) → chains down.
    { targetField: 'qty', formula: '(NUM(src.qty) + NUM(src.quantity)) * NUM(rule.qty_per_unit)', required: true },
    { targetField: 'unit', formula: 'rule.unit' },
  ],
  groupBy: ['material_id'],
  sumFields: ['qty'],
  targetPath: 'material_requirements',
  targetForeignKey: 'order_id',
  regenPolicy: 'append',
  markerField: '_genRule',
};

// MULTI-STEP PIPELINE (v0.8 joinSteps) — combo → BOM in ONE run. The order's lines carry COMBO products;
// step 1 joins `combo_config` (recurse ON: a combo may contain sub-combos) to explode a combo into its
// constituent products; step 2 joins `bom` to explode each product into raw materials. The OUTPUT of step 1
// (product_id + qty) is the INPUT (`src.*`) of step 2, so quantities multiply down the chain
// (order_item.qty × combo.qty_per × bom.qty_per). The top-level groupBy+SUM totals the material demand.
export const MULTI_STEP_COMBO_BOM_TEMPLATE: LineGenConfig = {
  key: 'order-combo-bom',
  title: 'Nổ combo → BOM (pipeline nhiều bước)',
  enabled: true,
  sourceCollection: 'orders',
  sourceLinesPath: 'order_items', // LEFT: each order line (a COMBO + qty) is one source row
  preload: ['order_items'],
  joinSteps: [
    {
      // STEP 1 — ⋈ combo_config, recurse ON (a combo can contain combos). Explodes COMBO → its products.
      stepType: 'config',
      ruleCollection: 'combo_config',
      ruleWhere: [{ field: 'combo_id', op: 'eq', value: 'src.product_id' }],
      recurse: true,
      recurseParentKey: 'combo_id', // config field naming a row's parent combo (the self-join key)
      recurseChildKey: 'product_id', // generated field = the component that becomes the next level's combo key
      recurseQtyField: 'qty', // qty multiplied down the recursion
      maxDepth: 20,
      recurseOutput: 'leaves', // keep only real products (drop intermediate sub-combos)
      lineOutputs: [
        { targetField: 'product_id', formula: 'rule.item_id', required: true },
        { targetField: 'qty', formula: 'NUM(src.qty) * NUM(rule.qty_per)', required: true },
      ],
    },
    {
      // STEP 2 — ⋈ bom. Explodes each product (from step 1) into raw materials; qty keeps multiplying.
      stepType: 'config',
      ruleCollection: 'bom',
      ruleWhere: [{ field: 'product_id', op: 'eq', value: 'src.product_id' }],
      ruleAppends: ['material'],
      lineOutputs: [
        { targetField: 'material_id', formula: 'rule.material_id', required: true },
        { targetField: 'material_name', formula: 'rule.material.name' },
        { targetField: 'qty', formula: 'NUM(src.qty) * NUM(rule.qty_per)', required: true },
        { targetField: 'unit', formula: 'rule.unit' },
      ],
    },
  ],
  maxRows: 10000, // fan-out safety: abort (not truncate/hang) if the working set explodes past this
  groupBy: ['material_id'], // total the demand across every combo/product
  sumFields: ['qty'],
  targetPath: 'material_requirements',
  targetForeignKey: 'order_id',
  regenPolicy: 'append',
  markerField: '_genRule',
};

// PRIORITY-TIER commission (v0.7 matchTiers) — "specific employee overrides role default". A rate table
// has both employee-specific rows (employee_id filled) and role-default rows (employee_id blank). Tier 0
// uses the specific row if one exists for this order's staff; else tier 1 falls back to the role row —
// and the role tier auto-excludes any employee-specific row, so nobody is paid twice.
export const TIERED_COMMISSION_TEMPLATE: LineGenConfig = {
  key: 'order-commission-tiered',
  title: 'Hoa hồng theo bậc ưu tiên (đích danh > vai trò)',
  enabled: true,
  sourceCollection: 'orders',
  sourceLinesPath: null,
  ruleCollection: 'commission_rate_rules',
  ruleWhere: [{ field: 'is_active', op: 'eq', value: 'true' }], // base filter: active rows only
  matchTiers: [
    [{ field: 'employee_id', op: 'eq', value: 'parent.responsible_staff_id' }], // tier 0 — specific employee
    [{ field: 'role', op: 'eq', value: 'parent.responsible_role' }], // tier 1 — role fallback
  ],
  preload: [],
  deriveVars: [],
  skipIf: null,
  lineOutputs: [
    { targetField: 'employee_id', formula: 'parent.responsible_staff_id', required: true },
    { targetField: 'rate', formula: 'rule.rate', required: true },
    { targetField: 'commission_amt', formula: 'NUM(parent.order_total) * NUM(rule.rate)' },
  ],
  groupBy: null,
  targetPath: 'order_commissions',
  targetForeignKey: 'order_id',
  regenPolicy: 'append',
};

// ---- INLINE commission template: rules embedded in the config (NO external rule tables) -------
// Scopes = the G1–G4 matrix (shipping_type × quotation_method). Only rule #1 ("Lương vận chuyển")
// differs per group; the other 14 are shared. Input tables needed: orders + employees only.
const R = (name: string, based_on: string, recipient: string, base_field: string, rate: number) => ({ name, based_on, recipient, base_field, rate });
const COMMON_RULES = [
  R('Lương order', 'responsible_staff', 'self', 'payment_profit', 0.2),
  R('Lương order GD', 'transaction_staff', 'self', 'payment_profit', 0.1),
  R('Lương phí order GD', 'responsible_staff', 'self', 'order_service_fee', 0.1),
  R('Lương phí order GD - TP', 'responsible_staff', 'direct_manager', 'order_service_fee', 0.2),
  R('Lương phí order GD - GĐ', 'responsible_staff', 'indirect_manager', 'order_service_fee', 0.2),
  R('Lương trưởng phòng', 'responsible_staff', 'direct_manager', 'commission_price', 0.0025),
  R('Lương giám đốc', 'responsible_staff', 'indirect_manager', 'commission_price', 0.0025),
  R('Lương báo dư', 'responsible_staff', 'self', 'extra_amount', 0.1),
  R('Lương báo dư - TP', 'responsible_staff', 'direct_manager', 'extra_amount', 0.1),
  R('Lương báo dư - GĐ', 'responsible_staff', 'indirect_manager', 'extra_amount', 0.1),
  R('Com kế toán vận chuyển', 'liquidation_employee', 'self', 'commission_price', 0.0004),
  R('Com kế toán vận chuyển - TP', 'liquidation_employee', 'direct_manager', 'commission_price', 0.0004),
  R('Com kế toán order', 'liquidation_employee', 'self', 'payment_profit', 0.002),
  R('Com kế toán order - TP', 'liquidation_employee', 'direct_manager', 'payment_profit', 0.002),
];
const scope = (name: string, shipping: string, quoting: string, shipRule: ReturnType<typeof R>) => ({
  name,
  enabled: true,
  when: [
    { field: 'shipping_type', value: shipping },
    { field: 'quotation_method', value: quoting },
  ],
  rules: [shipRule, ...COMMON_RULES.map((r) => ({ ...r }))],
});

export const COMMISSION_INLINE_TEMPLATE: LineGenConfig = {
  ...COMMISSION_TEMPLATE,
  key: 'order-commission-inline',
  title: 'Tính hoa hồng đơn hàng (quy tắc nhúng)',
  ruleSource: 'inline',
  ruleCollection: undefined,
  ruleWhere: undefined,
  ruleAppends: undefined,
  ruleFields: [
    { name: 'name', label: 'Tên quy tắc', type: 'text' },
    { name: 'based_on', label: 'Lấy người gốc theo', type: 'select', options: ['responsible_staff', 'transaction_staff', 'liquidation_employee'] },
    { name: 'recipient', label: 'Người nhận', type: 'select', options: ['self', 'direct_manager', 'indirect_manager'] },
    { name: 'base_field', label: 'Cột tính lương', type: 'select', options: ['package_revenue', 'payment_profit', 'order_service_fee', 'commission_price', 'extra_amount', 'shipping_fee_commission'] },
    { name: 'rate', label: 'Tỉ lệ', type: 'number' },
  ],
  scopes: [
    scope('G1 — Chính ngạch + Báo trọn', 'Chính ngạch', 'Báo trọn', R('Lương vận chuyển', 'responsible_staff', 'self', 'package_revenue', 0.02)),
    scope('G2 — Chính ngạch + Hàng lẻ', 'Chính ngạch', 'Hàng lẻ', R('Lương vận chuyển', 'responsible_staff', 'self', 'shipping_fee_commission', 0.04)),
    scope('G3 — Tiểu ngạch + Báo trọn', 'Tiểu ngạch', 'Báo trọn', R('Lương vận chuyển', 'responsible_staff', 'self', 'package_revenue', 0.04)),
    scope('G4 — Tiểu ngạch + Hàng lẻ', 'Tiểu ngạch', 'Hàng lẻ', R('Lương vận chuyển', 'responsible_staff', 'self', 'shipping_fee_commission', 0.04)),
  ],
};

// Menu templates are COLLECTION-mode only (inline is legacy — COMMISSION_INLINE_TEMPLATE stays
// exported for engine tests + existing configs, but is no longer offered for new generators).
export const TEMPLATES: Array<{ label: string; config: LineGenConfig }> = [
  { label: 'Hoa hồng (quy tắc từ bảng dữ liệu)', config: COMMISSION_TEMPLATE },
  { label: 'Hoa hồng theo bậc ưu tiên (đích danh > vai trò)', config: TIERED_COMMISSION_TEMPLATE },
  { label: 'Nổ định mức BOM', config: BOM_TEMPLATE },
  { label: 'Nổ định mức BOM đa cấp (đệ quy)', config: MULTI_LEVEL_BOM_TEMPLATE },
  { label: 'Nổ combo → BOM (pipeline nhiều bước)', config: MULTI_STEP_COMBO_BOM_TEMPLATE },
];
