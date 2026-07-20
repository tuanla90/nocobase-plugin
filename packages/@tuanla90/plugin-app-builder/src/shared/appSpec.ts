/**
 * App-Spec IR — the high-level, declarative description of a whole NocoBase app that the compiler
 * materializes (collections + relations + seed + pages + menu) and the extractor produces from a live app.
 *
 * Design intent (see docs/APP-BUILDER-DESIGN.md): the AI (P2) and human authors reason in THIS shape —
 * business-level "a customer has orders, show orders in a table with a Progress bar on total" — never in
 * flowModels/collections JSON. A deterministic compiler owns the framework details. Keep this file
 * antd/React/@nocobase-free so it can run in the server action, the client materializer, and pure tests.
 */

// ── field interfaces ─────────────────────────────────────────────────────────────────────────────
// The subset of NocoBase field interfaces the compiler supports, plus the @tuanla90 `statusFlow` extension.
// (Relations are NOT here — they live in CollectionSpec.relations so the compiler can order table
// creation and synthesize the foreign keys.)
export const FIELD_INTERFACES = [
  'input', 'textarea', 'markdown', 'richText', 'phone', 'email', 'url', 'uuid', 'nanoid', 'password',
  'number', 'integer', 'percent',
  'select', 'multipleSelect', 'radioGroup', 'checkbox', 'checkboxGroup', 'boolean',
  'date', 'datetime', 'time',
  'color', 'icon', 'json',
  'statusFlow', // @tuanla90 status-flow (needs `states`)
] as const;
export type FieldInterface = (typeof FIELD_INTERFACES)[number];

/** Interfaces that carry an enumerated option list (value/label/color). */
export const OPTION_INTERFACES: FieldInterface[] = ['select', 'multipleSelect', 'radioGroup', 'checkboxGroup'];

export type RelationType = 'm2o' | 'o2m' | 'o2o' | 'm2m';

// ── spec shapes ──────────────────────────────────────────────────────────────────────────────────
export interface FieldOption {
  value: string;
  label?: string;
  color?: string;
}

/** A computed/formula column, materialized via @tuanla90/plugin-formula. `expression` is Excel-style:
 *  `data.<field>` (same row) · `SUM(data.<o2m>.<field>)` (roll-up children) · `data.<m2o>.<field>`
 *  (LOOKUP a value from a related/config record, e.g. a line's unit price from the product master).
 *  `kind`: 'display' = virtual view column (recomputed each render), 'stored' = a real column recomputed
 *  on write across relations (default). */
export interface ComputedSpec {
  expression: string;
  kind?: 'display' | 'stored';
}

/** One richly-designed statusFlow status (the AI acting as a UX designer, not just naming states).
 *  `kind` places it in the flow: 'init' = where new records start (exactly ONE per field), 'doing' =
 *  in-progress, 'done' = a successful final status, 'fail' = a failed/cancelled final status (a status
 *  with no outgoing `transitions` entry is final — 'done'/'fail' are the natural candidates but not
 *  required to be final). `color` accepts either a friendly semantic name (default/processing/warning/
 *  success/error) or a concrete @tuanla90/plugin-status-flow Tag color (blue/gold/green/red/purple/cyan/
 *  geekblue/orange/magenta/volcano/yellow/lime) — see fieldDef's statusFlow compile in the server plugin. */
export interface StatusFlowState {
  label: string;
  color?: string;
  kind?: 'init' | 'doing' | 'done' | 'fail';
}

export interface FieldSpec {
  /** machine name, [a-z][a-z0-9_]* (camelCase also accepted). */
  name: string;
  /** human label (vi). */
  title: string;
  /** value type of the field (also the value type of a computed field's result). */
  interface: FieldInterface;
  /** select/radio/multi/checkboxGroup — string is shorthand for {value:s,label:s}. */
  options?: Array<string | FieldOption>;
  required?: boolean;
  unique?: boolean;
  defaultValue?: any;
  /** friendly @tuanla90 widget LABEL (e.g. 'Progress bar', 'Value tag', 'Rich select'). See §4 of the design. */
  widget?: string;
  /** deep per-widget config — P4; P0/P1 use each widget's defaults. */
  widgetConfig?: Record<string, any>;
  /** statusFlow only: EITHER plain status names (`["Mới","Xong"]` — auto-derives a linear flow: first is
   *  the initial status, last is success, each moves to the next; kept for simple cases/back-compat) OR a
   *  richly AI-designed list (`{label,color?,kind?}`) paired with `transitions` below — the AI acts as a
   *  UX designer: meaningful colors, exactly one initial + at least one final (done/fail) status, and
   *  realistic branches. */
  states?: Array<string | StatusFlowState>;
  /** statusFlow only, pairs with the rich `states` form: from-label → allowed to-labels (e.g.
   *  `{"Chờ duyệt": ["Đang làm","Từ chối"]}`), letting the flow branch and include a cancel/fail path.
   *  Ignored (linear auto-derive applies) when `states` is plain strings and this is omitted. */
  transitions?: Record<string, string[]>;
  /** present → this is a formula column wired via @tuanla90/plugin-formula (not a plain data field). */
  computed?: ComputedSpec;
}

export interface RelationSpec {
  /** association field name on THIS collection (e.g. 'customer', 'items'). */
  name: string;
  type: RelationType;
  /** target collection `name`. */
  target: string;
  /** reverse field name on the target (auto-derived if omitted). */
  reverseName?: string;
  /** m2m junction collection name (auto if omitted). */
  through?: string;
  title?: string;
  /** friendly render widget for this relation in pages/popups, e.g. 'Sub-table Pro', 'Subform',
   *  'Dropdown select'. Default: to-many → inline sub-table, to-one → record picker / title text. */
  widget?: string;
  /** to-one relations only: add an inline "Add new <target>" button on forms (Rich select + quick-create
   *  Pop-up, whose create form REUSES the target's Add form via a block-template reference). Set true for
   *  relations to entities users create on-the-fly (customer/contact/supplier); false for controlled
   *  master/catalog data (product/room/category/status). AI decides per that heuristic. */
  quickCreate?: boolean;
  /** o2m only: the AI-designed column order for this relation's inline sub-table (child field names).
   *  When given, the compiler shows exactly these, in this order; otherwise it auto-derives + ranks them
   *  (relation → editable → computed). Let the UI/UX designer control the sub-table here. */
  subColumns?: string[];
}

export interface CollectionSpec {
  name: string;
  title: string;
  /** field whose value labels a record in relation pickers/columns (default: first string field). */
  titleField?: string;
  fields: FieldSpec[];
  relations?: RelationSpec[];
  /** demo rows; keyed by field.name. Relation values reference the target's titleField value. */
  seed?: Record<string, any>[];
}

export interface ColumnSpec {
  name: string;
  title?: string;
  widget?: string;
}

export const BLOCK_TYPES = ['TableBlockModel', 'EnhancedTableBlockModel'] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

export interface PageSpec {
  key?: string;
  title: string;
  icon?: string;
  collection: string;
  /** menu group label; the compiler creates the group route if missing. */
  menuGroup?: string;
  block?: BlockType;
  columns: Array<string | ColumnSpec>;
  /** fields shown in View/Edit/Add popups; defaults to `columns`. */
  popupColumns?: string[];
}

export interface MenuGroup {
  label: string;
  icon?: string;
  order?: number;
}

/** One analytics widget on a dashboard page. Structurally matches dashboard.tsx's DashboardWidget (kept
 *  here so this file stays React/@nocobase-free); the compiler passes these straight to createDashboard(). */
export interface DashboardWidgetSpec {
  kind: 'score' | 'chart' | 'filter';
  label?: string;
  measure?: { field: string; aggregation: 'sum' | 'count' | 'avg' | 'max' | 'min' };
  chartType?: 'line' | 'pie' | 'bar';
  dimension?: { field: string; format?: string };
  title?: string;
  fields?: string[];
}

/** An analytics page = a collection + KPI/chart/filter widgets. `collection` must be one of `collections`. */
export interface DashboardSpec {
  title: string;
  collection: string;
  menuGroup?: string;
  icon?: string;
  widgets: DashboardWidgetSpec[];
}

export interface AppSpec {
  /** `title` = the app's DISPLAY name (Vietnamese, WITH diacritics) shown as the top menu label; `name` =
   *  an optional machine id. Mirrors CollectionSpec's name/title split (which the AI fills reliably — the
   *  root cause of "Quan Ly Ban Hang": a display name routed through a `name`-only field loses its dấu). */
  meta: { name: string; title?: string; description?: string; locale?: 'vi' | 'en' };
  collections: CollectionSpec[];
  pages: PageSpec[];
  /** Analytics pages (KPI cards + ECharts). Extracted from AppSheet chart views or authored by AI; each is
   *  materialized via createDashboard(). Its `collection` must be one of `collections`. */
  dashboards?: DashboardSpec[];
  /** `groups` = sidebar sub-groups; `icon` = the single top-level app entry's icon. */
  menu?: { groups: MenuGroup[]; icon?: string };
}

// ── pure validation (no app / no network) — the schema half of compiler.dryRun ────────────────────
export interface ValidationIssue {
  level: 'error' | 'warning';
  path: string; // e.g. "collections[2].fields[1].interface"
  message: string;
}
export interface ValidationResult {
  ok: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

const NAME_RE = /^[a-zA-Z][a-zA-Z0-9_]*$/;
/** Implicit fields every auto-id collection has — valid `titleField` / column targets without being
 *  declared in `fields[]` (the compiler sets autoGenId/createdAt/updatedAt). */
export const SYSTEM_FIELDS = ['id', 'createdAt', 'updatedAt'];
const colName = (c: ColumnSpec | string): string => (typeof c === 'string' ? c : c.name);

/**
 * Structural validation of an App-Spec that needs NO live app: names, interfaces, option presence,
 * relation targets, title fields, page columns, menu references, name collisions, relation cycles.
 * The live half (does this collection already exist? does this widget label resolve to a binding?)
 * runs in the server/client dryRun on top of this.
 */
export function validateAppSpec(spec: AppSpec): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const err = (path: string, message: string) => errors.push({ level: 'error', path, message });
  const warn = (path: string, message: string) => warnings.push({ level: 'warning', path, message });

  if (!spec || typeof spec !== 'object') {
    return { ok: false, errors: [{ level: 'error', path: '', message: 'Spec rỗng hoặc không phải object' }], warnings };
  }
  if (!spec.meta?.name) err('meta.name', 'Thiếu tên app (meta.name)');
  if (!Array.isArray(spec.collections) || spec.collections.length === 0) {
    err('collections', 'App cần ít nhất 1 collection');
  }
  if (!Array.isArray(spec.pages)) err('pages', 'pages phải là mảng');

  const collections = spec.collections || [];
  const collNames = new Set<string>();
  const fieldsByColl = new Map<string, Set<string>>(); // includes relation field names
  const ifaceInterfaces = new Set<string>(FIELD_INTERFACES);

  // pass 1 — collections, fields, name collisions
  collections.forEach((c, ci) => {
    const cp = `collections[${ci}]`;
    if (!c.name || !NAME_RE.test(c.name)) err(`${cp}.name`, `Tên collection không hợp lệ: "${c.name}"`);
    if (collNames.has(c.name)) err(`${cp}.name`, `Trùng tên collection: "${c.name}"`);
    collNames.add(c.name);
    if (!c.title) warn(`${cp}.title`, `Collection "${c.name}" thiếu title`);

    const fnames = new Set<string>();
    (c.fields || []).forEach((f, fi) => {
      const fp = `${cp}.fields[${fi}]`;
      if (!f.name || !NAME_RE.test(f.name)) err(`${fp}.name`, `Tên field không hợp lệ: "${f.name}"`);
      if (fnames.has(f.name)) err(`${fp}.name`, `Trùng field "${f.name}" trong "${c.name}"`);
      fnames.add(f.name);
      if (!ifaceInterfaces.has(f.interface)) err(`${fp}.interface`, `interface không hỗ trợ: "${f.interface}"`);
      if (OPTION_INTERFACES.includes(f.interface) && !(f.options && f.options.length)) {
        err(`${fp}.options`, `Field "${f.name}" (${f.interface}) cần options`);
      }
      if (f.interface === 'statusFlow') {
        if (!(f.states && f.states.length >= 2)) {
          err(`${fp}.states`, `Field statusFlow "${f.name}" cần ≥ 2 states`);
        } else {
          const labels = f.states.map((s) => (typeof s === 'string' ? s : s?.label));
          labels.forEach((l, si) => { if (!l) err(`${fp}.states[${si}]`, `State thiếu "label"`); });
          if (f.transitions) {
            const labelSet = new Set(labels.filter(Boolean));
            Object.entries(f.transitions).forEach(([from, tos]) => {
              if (!labelSet.has(from)) warn(`${fp}.transitions`, `transitions "${from}" không khớp state nào trong "${f.name}"`);
              (tos || []).forEach((to) => {
                if (!labelSet.has(to)) warn(`${fp}.transitions`, `transitions "${from}" → "${to}": state đích không tồn tại trong "${f.name}"`);
              });
            });
          }
        }
      }
      if (f.computed && !(typeof f.computed.expression === 'string' && f.computed.expression.trim())) {
        err(`${fp}.computed.expression`, `Cột computed "${f.name}" cần expression`);
      }
    });

    // relation field names share the field namespace
    (c.relations || []).forEach((r, ri) => {
      const rp = `${cp}.relations[${ri}]`;
      if (!r.name || !NAME_RE.test(r.name)) err(`${rp}.name`, `Tên quan hệ không hợp lệ: "${r.name}"`);
      if (fnames.has(r.name)) err(`${rp}.name`, `Quan hệ "${r.name}" trùng tên field trong "${c.name}"`);
      fnames.add(r.name);
    });
    fieldsByColl.set(c.name, fnames);
  });

  // A m2o/o2o with `reverseName` makes the framework auto-create the inverse (o2m/o2o) on the TARGET
  // collection. Register those inverse names too, so a parent page/popup that shows its child sub-table
  // (by reverseName) validates — mirrors what the server materializer actually creates.
  collections.forEach((c) => {
    (c.relations || []).forEach((r) => {
      if (r.reverseName && r.target && fieldsByColl.has(r.target)) fieldsByColl.get(r.target)!.add(r.reverseName);
    });
  });

  // pass 2 — relation targets, titleField, relation graph (for cycle warning)
  const edges = new Map<string, Set<string>>();
  collections.forEach((c, ci) => {
    const cp = `collections[${ci}]`;
    if (c.titleField && !(fieldsByColl.get(c.name)?.has(c.titleField)) && !SYSTEM_FIELDS.includes(c.titleField)) {
      err(`${cp}.titleField`, `titleField "${c.titleField}" không có trong fields của "${c.name}"`);
    }
    (c.relations || []).forEach((r, ri) => {
      const rp = `${cp}.relations[${ri}]`;
      if (!collNames.has(r.target)) err(`${rp}.target`, `Quan hệ trỏ tới collection không tồn tại: "${r.target}"`);
      if (!['m2o', 'o2m', 'o2o', 'm2m'].includes(r.type)) err(`${rp}.type`, `Loại quan hệ lạ: "${r.type}"`);
      if (!edges.has(c.name)) edges.set(c.name, new Set());
      edges.get(c.name)!.add(r.target);
    });
  });
  // shallow self-loop notice (full cycle detection is a warning, not a blocker)
  edges.forEach((tos, from) => {
    if (tos.has(from)) warn(`collections`, `Quan hệ tự tham chiếu trên "${from}" — kiểm tra reverseName`);
  });

  // pass 3 — pages reference real collections + real columns; menu groups referenced exist
  const menuGroupLabels = new Set((spec.menu?.groups || []).map((g) => g.label));
  (spec.pages || []).forEach((p, pi) => {
    const pp = `pages[${pi}]`;
    if (!p.collection || !collNames.has(p.collection)) {
      err(`${pp}.collection`, `Trang "${p.title}" trỏ collection không tồn tại: "${p.collection}"`);
    } else {
      const known = fieldsByColl.get(p.collection)!;
      const cols = (p.columns || []).map(colName);
      if (!cols.length) warn(`${pp}.columns`, `Trang "${p.title}" không có cột nào`);
      cols.forEach((cn, xi) => {
        if (!known.has(cn) && !SYSTEM_FIELDS.includes(cn)) err(`${pp}.columns[${xi}]`, `Cột "${cn}" không có trong "${p.collection}"`);
      });
      (p.popupColumns || []).forEach((cn, xi) => {
        if (!known.has(cn) && !SYSTEM_FIELDS.includes(cn)) err(`${pp}.popupColumns[${xi}]`, `popupColumn "${cn}" không có trong "${p.collection}"`);
      });
    }
    if (p.block && !BLOCK_TYPES.includes(p.block)) err(`${pp}.block`, `block type lạ: "${p.block}"`);
    if (p.menuGroup && spec.menu?.groups && !menuGroupLabels.has(p.menuGroup)) {
      warn(`${pp}.menuGroup`, `menuGroup "${p.menuGroup}" không khai trong menu.groups (sẽ tự tạo)`);
    }
  });

  // pass 4 — dashboards reference a real collection; widget measure/dimension fields exist (warn: bad ones are
  // dropped at materialize, never fatal)
  (spec.dashboards || []).forEach((d, di) => {
    const dp = `dashboards[${di}]`;
    if (!d.collection || !collNames.has(d.collection)) { err(`${dp}.collection`, `Dashboard "${d.title}" trỏ collection không tồn tại: "${d.collection}"`); return; }
    const known = fieldsByColl.get(d.collection)!;
    (d.widgets || []).forEach((w, wi) => {
      const f = w.measure?.field, dm = w.dimension?.field;
      if (f && f !== 'id' && !known.has(f) && !SYSTEM_FIELDS.includes(f)) warn(`${dp}.widgets[${wi}].measure`, `measure "${f}" không có trong "${d.collection}" (bỏ qua widget)`);
      if (dm && !known.has(dm) && !SYSTEM_FIELDS.includes(dm)) warn(`${dp}.widgets[${wi}].dimension`, `dimension "${dm}" không có trong "${d.collection}" (bỏ qua widget)`);
    });
  });

  return { ok: errors.length === 0, errors, warnings };
}

/**
 * Turn raw validation errors into ACTIONABLE, per-error fix instructions the LLM can act on in a
 * repair loop. The plain `path: message` list tells the model WHAT is wrong; these hints tell it HOW
 * to fix each class of error (e.g. a statusFlow field with < 2 states → add ≥2 states OR switch to
 * select). Dedupes identical hints so the prompt stays short. Returns '' when nothing maps.
 */
export function repairHints(errors: ValidationIssue[]): string {
  const hints = new Set<string>();
  for (const e of errors || []) {
    const m = e.message || '';
    const p = e.path || '';
    if (/statusFlow.*≥\s*2 states|\.states\b/i.test(m + p)) {
      hints.add(
        'Field statusFlow phải có "states" = mảng ≥ 2 object {"label","color"?,"kind"?} (vd [{"label":"Mới"},{"label":"Đang xử lý"},{"label":"Xong","kind":"done"}]). ' +
          'Nếu field đó KHÔNG thật sự là luồng trạng thái nhiều bước → đổi "interface" sang "select" và cấp "options" thay vì "states".',
      );
    } else if (/State thiếu "label"/i.test(m)) {
      hints.add('Mỗi phần tử trong "states" phải có "label" không rỗng.');
    } else if (/cần options/i.test(m)) {
      hints.add('Field select/radioGroup/checkboxGroup/multipleSelect cần "options" = mảng {"value","label"} (ít nhất 1 mục).');
    } else if (/interface không hỗ trợ/i.test(m)) {
      hints.add(`"interface" phải nằm trong danh sách hỗ trợ: ${FIELD_INTERFACES.join(', ')}.`);
    } else if (/Tên (field|collection) không hợp lệ/i.test(m)) {
      hints.add('"name" phải là snake_case KHÔNG DẤU, bắt đầu bằng chữ (vd "ma_don_hang"). Đưa nhãn tiếng Việt vào "title", KHÔNG vào "name".');
    } else if (/Trùng (field|tên collection)/i.test(m)) {
      hints.add('Bỏ trùng lặp: mỗi "name" field/collection phải là duy nhất.');
    } else if (/cần expression/i.test(m)) {
      hints.add('Field computed cần "computed.expression" là chuỗi công thức không rỗng.');
    } else if (/ít nhất 1 collection/i.test(m)) {
      hints.add('Spec cần "collections" không rỗng — ít nhất 1 collection có fields.');
    } else if (/tên app|meta\.name/i.test(m + p)) {
      hints.add('Cần "meta.name" (snake_case) đặt tên app.');
    }
  }
  return Array.from(hints).map((h) => `• ${h}`).join('\n');
}

/** Normalize a field's options to the {value,label,color} shape (accepts string shorthand). */
export function normalizeOptions(options?: Array<string | FieldOption>): FieldOption[] {
  return (options || []).map((o) => (typeof o === 'string' ? { value: o, label: o } : { label: o.value, ...o }));
}

/** The display column name list of a page (accepts string | ColumnSpec). */
export function pageColumnNames(p: PageSpec): string[] {
  return (p.columns || []).map(colName);
}
