/**
 * App Builder — server. Owns the DATA tier of the compiler: turning an App-Spec's collections + fields
 * (relations + seed next, P1) into real NocoBase collections. Collections must be created via the
 * collection-manager repository WITH a `context` so its hooks migrate the physical table — the same path
 * @tuanla90/plugin-gsheet-sync uses (`ensureTargetCollection`). The PAGE tier (routes + flowModels) is built
 * client-side (see ../client-v2), because pages only exist as client flowModels.
 *
 * Actions (ACL loggedIn):
 *   POST /api/appBuilder:dryRun  { spec }  → { ok, errors[], warnings[] }   (validate, no writes)
 *   POST /api/appBuilder:apply   { spec }  → { ok, created[] }             (create collections + fields)
 */
import { Plugin } from '@nocobase/server';
import { AppSpec, CollectionSpec, FieldSpec, normalizeOptions, RelationSpec, StatusFlowState, validateAppSpec, ValidationIssue } from '../shared/appSpec';

/** Read the App-Spec from a custom-action call. The SDK wraps `resource().apply({values:{spec}})` as
 *  `ctx.action.params.values`; raw HTTP may put it top-level. Accept both. */
function readSpec(ctx: any): AppSpec {
  const p = ctx?.action?.params || {};
  return (p.values?.spec ?? p.spec ?? p.values ?? {}) as AppSpec;
}

/** Vietnamese-aware slug for status-flow keys (must be consistent within a field; the plugin reads the
 *  keys as-is). 'Nháp'→'nhap', 'Đã xác nhận'→'da_xac_nhan', 'Hoàn tất'→'hoan_tat'. */
function slugify(s: string): string {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'status';
}

/** Translate an `opSeed` value for an enum field (select/multipleSelect/statusFlow) from its LABEL to its
 *  stored slug VALUE. `opSeed`'s rows carry human labels (e.g. "Mới" from CollectionSpec.seed), but the
 *  column's enum stores slugs (e.g. "moi" from fieldDef's statusFlow/select compile) — writing the raw
 *  label leaves the field null (mismatch). A value that already equals an option's `value` passes through
 *  unchanged (idempotent). Handles both a single value and an array (multipleSelect). Returns undefined
 *  when nothing matches, so the caller can drop the key and let the field's own defaultValue apply. */
function resolveEnumSeedValue(enumOpts: Array<{ value: any; label?: any }>, raw: any): any {
  const findOne = (v: any) => enumOpts.find((o) => o.value === v || String(o.label) === String(v))?.value;
  if (Array.isArray(raw)) {
    const mapped = raw.map(findOne).filter((v) => v !== undefined);
    return mapped.length ? mapped : undefined;
  }
  return findOne(raw);
}

// ── rich statusFlow compile helpers ─────────────────────────────────────────────────────────────
// @tuanla90/plugin-status-flow's own Tag palette (types.ts TAG_HEX, unified on @tuanla90/shared's primary-6
// colors). Duplicated here (small, literal) rather than a runtime dep — this plugin is deliberately
// self-contained (see run-app-builder-build.sh); it must stay in sync with that palette's KEY NAMES.
const TAG_COLOR_SET = new Set(['default', 'magenta', 'red', 'volcano', 'orange', 'gold', 'yellow', 'lime', 'green', 'cyan', 'blue', 'geekblue', 'purple']);
// Friendly, semantic names an AI/UX-designer naturally reaches for → a concrete Tag color, so the spec
// vocabulary stays intuitive without needing the exact palette key names.
const FRIENDLY_COLOR: Record<string, string> = { default: 'default', processing: 'blue', warning: 'gold', success: 'green', error: 'red' };
function resolveStatusColor(color: string | undefined, fallback: string): string {
  if (!color) return fallback;
  if (TAG_COLOR_SET.has(color)) return color;
  return FRIENDLY_COLOR[color] || fallback;
}
// AI-facing `kind` (init/doing/done/fail — a UX designer's vocabulary) → @tuanla90/plugin-status-flow's own
// StatusKind (init/processing/success/fail).
const KIND_MAP: Record<string, string> = { init: 'init', doing: 'processing', done: 'success', fail: 'fail' };

/**
 * Map an App-Spec FieldSpec → a NocoBase field definition `{name, type, interface, uiSchema, ...}`.
 * Grounded in gsheet-sync's `fieldDef` + instant-create-page's interface maps. Kept deliberately small;
 * `statusFlow` compiles to a `select` carrying its states in P0/P1 (true status-flow behavior is layered
 * on the generated page later — see docs/APP-BUILDER-DESIGN.md §4).
 */
export function fieldDef(f: FieldSpec): any {
  const uiSchema: any = { title: f.title || f.name };
  if (f.required) uiSchema.required = true;
  // A computed column is a real number column the user shouldn't hand-edit — the value is maintained by a
  // ptdlComputedRules rule (created in a later apply phase). Mark it read-pretty.
  if (f.computed) uiSchema['x-read-pretty'] = true;
  const base: any = { name: f.name, interface: f.interface, uiSchema };
  if (f.unique) base.unique = true;
  if (f.defaultValue !== undefined) base.defaultValue = f.defaultValue;
  const withUi = (extra: any) => {
    Object.assign(uiSchema, extra.uiSchema || {});
    delete extra.uiSchema;
    return { ...base, ...extra };
  };
  switch (f.interface) {
    case 'input': case 'email': case 'phone': case 'url': case 'uuid': case 'nanoid':
      return withUi({ type: 'string', uiSchema: { 'x-component': 'Input' } });
    case 'textarea': case 'markdown':
      return withUi({ type: 'text', uiSchema: { 'x-component': 'Input.TextArea' } });
    case 'richText':
      return withUi({ type: 'text', interface: 'richText', uiSchema: { 'x-component': 'RichText' } });
    case 'password':
      return withUi({ type: 'password', uiSchema: { 'x-component': 'Password' } });
    case 'number':
      return withUi({ type: 'double', uiSchema: { 'x-component': 'InputNumber' } });
    case 'integer':
      return withUi({ type: 'integer', uiSchema: { 'x-component': 'InputNumber' } });
    case 'percent':
      return withUi({ type: 'float', interface: 'percent', uiSchema: { 'x-component': 'InputNumber', 'x-component-props': { addonAfter: '%' } } });
    case 'select': case 'radioGroup':
      return withUi({ type: 'string', interface: 'select', uiSchema: { 'x-component': 'Select', enum: normalizeOptions(f.options) } });
    case 'multipleSelect': case 'checkboxGroup':
      return withUi({ type: 'array', interface: 'multipleSelect', uiSchema: { 'x-component': 'Select', 'x-component-props': { mode: 'multiple' }, enum: normalizeOptions(f.options) } });
    case 'statusFlow': {
      // Real @tuanla90/plugin-status-flow field: interface 'statusFlow' + a `statusFlow` config that folds
      // into options (server hooks enforce transitions by reading options.statusFlow). `states` is EITHER
      // a plain string[] (auto-derive a linear flow: first=init, last=success, each→next — kept for
      // simple cases/back-compat) OR a richly AI-designed list ({label,color?,kind?}) paired with
      // `transitions` (from-label → to-labels), letting the AI act as a UX designer: real colors, exactly
      // one initial + at least one final (done/fail) status, branches and a cancel/fail path.
      const rawStates = f.states || [];
      const isRich = rawStates.some((s) => s && typeof s === 'object');
      const hasTransitions = !!(f.transitions && Object.keys(f.transitions).length);
      if (isRich || hasTransitions) {
        const rows: StatusFlowState[] = rawStates.map((s) => (typeof s === 'string' ? { label: s } : (s as StatusFlowState) || { label: '' }));
        const labels = rows.map((r) => r.label);
        const keys = labels.map((l) => slugify(l));
        const fallbackPalette = ['blue', 'gold', 'cyan', 'purple', 'geekblue', 'orange'];
        const kinds: Record<string, string> = {};
        rows.forEach((r, i) => { kinds[keys[i]] = (r.kind && KIND_MAP[r.kind]) || (i === 0 ? 'init' : i === rows.length - 1 ? 'success' : 'processing'); });
        if (!Object.values(kinds).includes('init') && keys.length) kinds[keys[0]] = 'init'; // guarantee exactly one initial
        const initialIdx = keys.findIndex((k) => kinds[k] === 'init');
        const initial = keys[initialIdx >= 0 ? initialIdx : 0];
        const defaultColorFor = (kind: string, i: number) => (kind === 'success' ? 'green' : kind === 'fail' ? 'red' : kind === 'init' ? 'default' : fallbackPalette[i % fallbackPalette.length]);
        const enumOpts = rows.map((r, i) => ({ value: keys[i], label: r.label, color: resolveStatusColor(r.color, defaultColorFor(kinds[keys[i]], i)) }));
        const labelToKey = new Map(labels.map((l, i) => [l, keys[i]]));
        const transitions: Record<string, { to: string[] }> = {};
        for (const [fromLabel, toLabels] of Object.entries(f.transitions || {})) {
          const fromKey = labelToKey.get(fromLabel) || slugify(fromLabel);
          const toKeys = Array.from(new Set((Array.isArray(toLabels) ? toLabels : []).map((tl) => labelToKey.get(tl) || slugify(tl)).filter((k) => keys.includes(k) && k !== fromKey)));
          if (toKeys.length) transitions[fromKey] = { to: toKeys };
        }
        return withUi({
          type: 'string',
          interface: 'statusFlow',
          defaultValue: initial,
          uiSchema: { 'x-component': 'Select', enum: enumOpts },
          statusFlow: { initial, kinds, transitions, openFrom: {} },
        });
      }
      // Fallback: plain-string states, no transitions given → linear auto-derive (existing behavior).
      const states = rawStates as string[];
      const keys = states.map((s) => slugify(s));
      const palette = ['default', 'blue', 'gold', 'cyan', 'orange', 'purple', 'geekblue'];
      const enumOpts = states.map((s, i) => ({ value: keys[i], label: s, color: i === states.length - 1 ? 'green' : palette[i % palette.length] }));
      const kinds: Record<string, string> = {};
      const transitions: Record<string, { to: string[] }> = {};
      keys.forEach((k, i) => {
        kinds[k] = i === 0 ? 'init' : i === keys.length - 1 ? 'success' : 'processing';
        if (i < keys.length - 1) transitions[k] = { to: [keys[i + 1]] };
      });
      return withUi({
        type: 'string',
        interface: 'statusFlow',
        defaultValue: keys[0],
        uiSchema: { 'x-component': 'Select', enum: enumOpts },
        statusFlow: { initial: keys[0], kinds, transitions, openFrom: {} },
      });
    }
    case 'checkbox': case 'boolean':
      return withUi({ type: 'boolean', interface: 'checkbox', uiSchema: { 'x-component': 'Checkbox' } });
    case 'date':
      return withUi({ type: 'date', uiSchema: { 'x-component': 'DatePicker' } });
    case 'datetime':
      return withUi({ type: 'date', interface: 'datetime', uiSchema: { 'x-component': 'DatePicker', 'x-component-props': { showTime: true } } });
    case 'time':
      return withUi({ type: 'time', uiSchema: { 'x-component': 'TimePicker' } });
    case 'color':
      return withUi({ type: 'string', interface: 'color', uiSchema: { 'x-component': 'ColorPicker' } });
    case 'icon':
      return withUi({ type: 'string', interface: 'icon', uiSchema: { 'x-component': 'IconPicker' } });
    case 'json':
      return withUi({ type: 'json', uiSchema: { 'x-component': 'Input.JSON' } });
    default:
      return withUi({ type: 'string', uiSchema: { 'x-component': 'Input' } });
  }
}

/**
 * The 5 standard fields every NocoBase collection should carry: id + created/updated at/by. NocoBase's
 * boolean flags (autoGenId/createdAt/…) create the runtime columns but NOT visible `fields` metadata —
 * so a flag-only collection shows none of them in the field manager AND its `id` isn't a proper metadata
 * PK, which is what breaks o2m/hasMany `sourceKey:'id'` resolution ("link ngược bị sai"). Mirrors
 * NocoBase's own AI `defineCollections` tool, which pushes these as explicit field records — INCLUDING its
 * `idField`: a **Snowflake ID (53-bit)** (`type`/`interface:'snowflakeId'`, `autoIncrement:false`), the exact
 * default NocoBase's own "Create collection" UI uses too (v0.4.3 — was a classic bigInt auto-increment id;
 * switched to match core exactly). Still a plain BIGINT column underneath (`SnowflakeIdField.dataType` =
 * `DataTypes.BIGINT`, same as bigInt) — the id is generated app-side (a `beforeSave`/`beforeBulkCreate` hook
 * calling `app.snowflakeIdGenerator.generate()`) instead of by a DB sequence, so relations/seed/computed are
 * unaffected. `autoGenId:false` still applies (we supply the id field explicitly either way).
 * Vietnamese titles because app-builder is VN-first.
 */
export function systemFieldDefs(): any[] {
  const userAssoc = (name: string, title: string, foreignKey: string) => ({
    name, type: 'belongsTo', interface: name, target: 'users', foreignKey, targetKey: 'id',
    uiSchema: { type: 'object', title, 'x-component': 'AssociationField', 'x-component-props': { fieldNames: { value: 'id', label: 'nickname' } }, 'x-read-pretty': true },
  });
  const ts = (name: string, title: string, iface: string) => ({
    name, type: 'date', field: name, interface: iface,
    uiSchema: { type: 'datetime', title, 'x-component': 'DatePicker', 'x-component-props': {}, 'x-read-pretty': true },
  });
  return [
    { name: 'id', type: 'snowflakeId', autoIncrement: false, primaryKey: true, allowNull: false, interface: 'snowflakeId',
      uiSchema: { type: 'number', title: 'ID', 'x-component': 'InputNumber', 'x-component-props': { stringMode: true, separator: '0.00', step: '1' }, 'x-validator': 'integer', 'x-read-pretty': true } },
    ts('createdAt', 'Ngày tạo', 'createdAt'),
    userAssoc('createdBy', 'Người tạo', 'createdById'),
    ts('updatedAt', 'Ngày cập nhật', 'updatedAt'),
    userAssoc('updatedBy', 'Người cập nhật', 'updatedById'),
  ];
}

/**
 * Map a RelationSpec → a NocoBase relation field def (created on `sourceColl` via the fields repo with
 * `context:{}`). FK naming is deterministic AND snake_case so it stays consistent with the snake_case
 * field names (NocoBase's own UI names user-relation FKs this way — e.g. demo_item.order → FK `order_id`),
 * and so a m2o and its declared o2m reverse share ONE foreign key:
 *   m2o `x` → belongsTo, FK `${x}_id` on this collection.
 *   o2m `x` (reverseName `y`) → hasMany, FK `${y}_id` on the target (pairs with the m2o named `y`);
 *              without reverseName, FK `${sourceColl}_id`.
 * (System audit relations createdBy/updatedBy keep NocoBase's fixed camelCase FKs createdById/updatedById.)
 */
export const fkOf = (name: string) => `${name}_id`;
export function relationDef(sourceColl: string, r: RelationSpec): any {
  const uiSchema: any = { title: r.title || r.name, 'x-component': 'AssociationField' };
  const base: any = { collectionName: sourceColl, name: r.name, target: r.target, uiSchema };
  switch (r.type) {
    case 'm2o':
      return { ...base, type: 'belongsTo', interface: 'm2o', foreignKey: fkOf(r.name), targetKey: 'id',
        uiSchema: { ...uiSchema, 'x-component-props': { multiple: false } } };
    case 'o2o':
      return { ...base, type: 'belongsTo', interface: 'obo', foreignKey: fkOf(r.name), targetKey: 'id',
        uiSchema: { ...uiSchema, 'x-component-props': { multiple: false } } };
    case 'o2m':
      return { ...base, type: 'hasMany', interface: 'o2m', foreignKey: fkOf(r.reverseName || sourceColl),
        sourceKey: 'id', targetKey: 'id', uiSchema: { ...uiSchema, 'x-component-props': { multiple: true } } };
    case 'm2m':
      return { ...base, type: 'belongsToMany', interface: 'm2m', through: r.through || `t_${sourceColl}_${r.target}`,
        foreignKey: fkOf(sourceColl), otherKey: fkOf(r.target), sourceKey: 'id', targetKey: 'id',
        uiSchema: { ...uiSchema, 'x-component-props': { multiple: true } } };
    default:
      return { ...base, type: 'belongsTo', interface: 'm2o', foreignKey: fkOf(r.name), targetKey: 'id' };
  }
}

/** Order relation types so paired FKs exist before the side that reuses them: m2o/o2o/m2m first, o2m last. */
const RELATION_ORDER: Record<string, number> = { m2o: 0, o2o: 0, m2m: 1, o2m: 2 };

/** Never drop these — core NocoBase / @tuanla90 system collections (guardrail for dropCollection). */
const CORE_COLLECTIONS = new Set([
  'users', 'roles', 'rolesUsers', 'collections', 'fields', 'dataSources', 'dataSourcesRoles', 'dataSourcesCollections', 'dataSourcesFields',
  'desktopRoutes', 'mobileRoutes', 'rolesDesktopRoutes', 'rolesMobileRoutes', 'applicationPlugins', 'uiSchemas', 'uiSchemaServerHooks',
  'uiSchemaTemplates', 'uiSchemaTreePath', 'flowModels', 'systemSettings', 'attachments', 'storages', 'jobs', 'usersJobs', 'tokenControlConfig',
  'authenticators', 'localizationTexts', 'localizationTranslations', 'themeConfig', 'notificationChannels', 'notificationInAppMessages',
  'workflows', 'workflowCategories', 'executions', 'flowNodes', 'jobs', 'aiConversations', 'aiMessages', 'aiEmployees', 'llmServices', 'aiSettings',
  'ptdlComputedRules', 'ptdlScanRules', 'ptdlChangeLogs', 'ptdlChangeLogConfigs', 'ptdlFieldStyles', 'ptdlIconRemaps', 'ptdlIpAccessConfigs',
]);

// ── AI (NocoBase @nocobase/plugin-ai) ─────────────────────────────────────────────────────────────
/** Resolve the app's configured LLM provider (same path formula/ai-column use). Inlined so app-builder
 *  stays self-contained (no @tuanla90/shared runtime dep). */
async function getAiProvider(app: any): Promise<{ provider?: any; error?: string }> {
  const aiPlugin: any = app?.pm?.get?.('ai');
  if (!aiPlugin?.aiManager) return { error: 'Chưa bật/cấu hình AI (@nocobase/plugin-ai)' };
  try {
    const resolved = await aiPlugin.aiManager.resolveModel({});
    const { provider } = await aiPlugin.aiManager.getLLMService({ llmService: resolved.llmService, model: resolved.model });
    return { provider };
  } catch (e: any) {
    return { error: 'Không lấy được model AI: ' + (e?.message || e) };
  }
}
const stripFences = (s: any) => String(s ?? '').replace(/^\s*```[a-zA-Z]*\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
function aiText(msg: any): string {
  if (!msg) return '';
  if (typeof msg === 'string') return msg;
  if (Array.isArray(msg?.content)) return msg.content.map((c: any) => c?.text || '').join('');
  return String(msg?.content ?? msg?.text ?? msg?.output_text ?? '');
}

/** System prompt: the App-Spec shape + the @tuanla90 vocabulary + rules, so the LLM emits a valid spec. */
function appSpecSystemPrompt(): string {
  return [
    'Bạn là CHUYÊN GIA UI/UX kiêm kỹ sư dựng app NocoBase. Từ MÔ TẢ tiếng Việt, hãy THIẾT KẾ rồi sinh MỘT App-Spec JSON hợp lệ — không chỉ đúng dữ liệu mà còn ĐẸP, GỌN & DỄ DÙNG (thứ tự cột, chọn widget, cột nào lên bảng vs chỉ trong popup… đều do BẠN quyết như một designer).',
    '',
    'App-Spec = { "meta": {"name","locale":"vi"}, "collections": [...], "pages": [...], "menu": {"groups": [...]} }.',
    'meta.title = TÊN HIỂN THỊ của cả app, tiếng Việt CÓ DẤU, viết hoa đầu câu (vd "Quản lý bán hàng", "Theo dõi dự án") — nhãn hiển thị trên menu; hãy điền y như "title" của collection (LUÔN có dấu). meta.name = tên máy snake_case, tuỳ chọn. TUYỆT ĐỐI đừng để tên hiển thị ra thành tên máy (SAI: hiển thị "quan_ly_ban_hang").',
    'collection = { "name" (machine, ^[a-z][a-z0-9_]*), "title" (vi có dấu), "titleField", "fields": [...], "relations": [...], "seed": [...] }.',
    'field = { "name", "title", "interface", "options"?, "required"?, "widget"?, "computed"?, "states"?, "transitions"? }.',
    '  interface ∈ input, textarea, markdown, phone, email, url, number, integer, percent, select, multipleSelect, checkbox, date, datetime, time, color, json, statusFlow.',
    '  select/multipleSelect PHẢI có "options": ["A","B"]. computed = {"expression":"..."}:',
    '    · data.<field> = ô cùng dòng (vd "data.so_luong * data.don_gia");  · SUM(data.<quan_hệ_o2m>.<field>) = tổng con (rollup, vd "SUM(data.chi_tiet.thanh_tien)");',
    '    · data.<quan_hệ_m2o>.<field> = TRA CỨU (lookup) giá trị từ bản ghi liên quan/bảng cấu hình — VD đơn giá dòng chi tiết lấy từ bảng sản phẩm/dịch vụ: "data.san_pham.gia" (đơn giá tự điền khi chọn sản phẩm).',
    '  statusFlow — bạn là UX designer THIẾT KẾ CẢ LUỒNG chứ không chỉ liệt kê tên: "states" = mảng object {"label","color"?,"kind"?} + "transitions": {"Nhãn A": ["Nhãn B","Nhãn C"]} (từ nhãn → các nhãn được phép chuyển tới).',
    '    · "kind": "init" (bắt đầu — ĐÚNG 1 trạng thái), "doing" (đang xử lý), "done" (thành công — cuối), "fail" (thất bại/huỷ — cuối). "color": default/processing/warning/success/error (hoặc tên tag blue/gold/green/red/purple/cyan/geekblue/orange/magenta/volcano/yellow/lime).',
    '    · THIẾT KẾ THẬT: đúng 1 "init"; ít nhất 1 trạng thái cuối (done và/hoặc fail — KHÔNG xuất hiện làm from-key trong transitions); rẽ nhánh khi hợp lý (vd "Chờ duyệt": ["Đang làm","Từ chối"] — vừa lùi vừa tiến); thêm đường huỷ/fail khi hợp lý (vd "Đang làm": ["Xong","Đã huỷ"]).',
    '    · Vẫn chấp nhận dạng đơn giản "states": ["Mới","Xong"] (mảng string, không "transitions") — compiler tự suy luận tuyến tính; nhưng khi luồng có ý nghĩa nghiệp vụ rõ (đơn hàng, duyệt, ticket…) PHẢI thiết kế đầy đủ như trên.',
    '  widget (tùy chọn, cho đẹp): "Progress bar","Star rating","Value tag","Rich select","Input icon","Sub-table Pro".',
    'relation = { "name" (snake, không dấu), "title" (NHÃN tiếng Việt có dấu, vd "Khách hàng"), "type": "m2o"|"o2m"|"o2o"|"m2m", "target" (tên collection khác), "reverseName"?, "quickCreate"? (bool), "subColumns"? ([tên field bảng con hiện trong sub-table, o2m — theo thứ tự bạn thiết kế]) }.',
    '  quickCreate (chỉ m2o/o2o): thêm nút "＋ Thêm mới <target>" ngay trên form. BẬT (true) cho quan hệ tới thực thể người dùng hay tạo tại-chỗ (khách hàng, liên hệ, nhà cung cấp, đối tác). TẮT (bỏ trống) cho danh mục/master quản lý riêng (sản phẩm, phòng, dịch vụ, danh mục, trạng thái).',
    'page = { "title", "collection", "menuGroup"?, "icon"? ("lucide-users"…), "block"? ("TableBlockModel"|"EnhancedTableBlockModel"), "columns": [tên field], "popupColumns"? }.',
    'menu = { "groups": [{ "label" (nhãn nhóm sidebar, vd "Danh mục"/"Vận hành"), "icon"? }] }. Đưa trang vào nhóm bằng page.menuGroup = ĐÚNG "label" của nhóm (đừng lồng danh sách pages vào trong group).',
    '',
    'QUY TẮC:',
    '- meta.title = TÊN HIỂN THỊ tiếng Việt có dấu (vd "Quản lý bán hàng"); meta.name = tên máy snake tuỳ chọn — GIỐNG cặp name/title của collection/field. Điền title trước, LUÔN có dấu.',
    '- name của collection/field = KHÔNG DẤU, snake_case (vd "khach_hang", "ngay_dat"); title = tiếng Việt có dấu — SOÁT KỸ đừng bỏ sót dấu ở BẤT KỲ title nào (vd đừng để "phòng" thành "phong").',
    '- Mỗi collection có titleField = 1 field string chính (vd "ten", "ma").',
    '- Đơn có dòng chi tiết: khai o2m ở bảng cha (reverseName = tên m2o ở bảng con) + m2o ở bảng con; cột computed line-total dùng data.<field>.',
    '- Seed 2-3 dòng demo mỗi collection; giá trị quan hệ m2o = giá trị titleField của bản ghi target.',
    '- Mỗi collection nên có 1 page; nhóm menu hợp lý (Danh mục / Vận hành…).',
    '',
    'THIẾT KẾ UI/UX (bạn tự quyết cho MỌI view như một designer, đừng để mặc định):',
    '- THỨ TỰ cột (columns/popupColumns/subColumns) theo luồng ĐỌC-NHẬP: ĐỊNH DANH (mã/tên) hoặc QUAN HỆ chính (khách/sản phẩm — thứ CHỌN TRƯỚC, hay kéo theo lookup) ĐẦU → thuộc tính chính → trạng thái → COMPUTED/tổng CUỐI. TUYỆT ĐỐI không để quan hệ ở cuối.',
    '- BẢNG GỌN: "columns" (bảng danh sách) chỉ 4-6 cột QUAN TRỌNG nhất (định danh, quan hệ chính, trạng thái, tổng tiền). Field phụ/chi tiết → CHỈ để "popupColumns" (xem/sửa), đừng nhồi hết lên bảng.',
    '- CHỌN WIDGET theo ngữ nghĩa, KHÔNG lạm dụng (chỉ gắn khi RÕ hợp): %/tiến độ → "Progress bar"; nhãn/trạng thái ngắn → "Value tag"; đánh giá sao → "Star rating"; quan hệ cần hiện đẹp (avatar/phụ đề) → "Rich select". Trạng thái có luồng → interface "statusFlow". TIỀN/số/ngày/text thường → KHÔNG widget (để mặc định). "Input icon" CHỈ cho field chọn biểu tượng, KHÔNG phải cho tiền.',
    '- Bảng con (o2m) khai "subColumns" theo cùng logic (quan hệ chọn-trước đầu, số lượng, computed/thành tiền cuối); KHÔNG liệt kê field hệ thống (id/ngày tạo…).',
    '- CHỈ trả JSON App-Spec, không markdown, không giải thích ngoài trường "explain".',
  ].join('\n');
}

/** System prompt for DASHBOARD design: given a collection's fields, design a KPI + charts + filter board. */
function dashboardSystemPrompt(): string {
  return [
    'Bạn là chuyên gia thiết kế DASHBOARD phân tích. Từ danh sách field của MỘT collection, hãy THIẾT KẾ một dashboard đẹp, hữu ích gồm thẻ KPI + biểu đồ + thanh lọc. Trả về DUY NHẤT JSON DashboardSpec.',
    '',
    'DashboardSpec = { "title": <tên hiển thị tiếng Việt CÓ DẤU>, "collection": <machine name ĐÚNG như đề bài>, "icon"?: "lucide-<tên>", "widgets": [ ...4-8 widget... ] }.',
    'widget.kind:',
    '  "score" — thẻ KPI (1 con số): { "kind":"score", "label":<nhãn vi ngắn>, "measure":{"field":<field số, hoặc "id" để đếm>, "aggregation":"sum"|"count"|"avg"|"max"|"min"}, "icon"?:<lucide kebab: shopping-cart, dollar-sign, users, package, trending-up…>, "unit"?:<đơn vị hiển thị>, "scale"?:<số chia cho gọn> }.',
    '    · scale + unit ĐI ĐÔI: tiền lớn (>1 triệu) NÊN đặt scale để gọn và unit PHẢI kèm bậc → scale 1000000 ⇒ unit "triệu đ"; scale 1000000000 ⇒ unit "tỷ đ". Đếm/số lượng: bỏ scale, unit "đơn"/"sp"/… %: unit "%".',
    '  "chart" — biểu đồ: { "kind":"chart", "title":<tiêu đề vi>, "chartType":"line"|"bar"|"pie", "measure":{"field","aggregation"}, "dimension":{"field":<field nhóm>, "format"?:"YYYY-MM"} }.',
    '    · line/bar = xu hướng/so sánh theo THỜI GIAN hoặc phân loại; dimension theo field NGÀY thì THÊM "format":"YYYY-MM" (gộp tháng). pie = tỉ trọng theo field PHÂN LOẠI (select/statusFlow/quan hệ).',
    '  "filter" — thanh lọc nối vào biểu đồ: { "kind":"filter", "fields":[<vài field để lọc, ưu tiên NGÀY + PHÂN LOẠI>] }.',
    '',
    'QUY TẮC BẮT BUỘC:',
    '- CHỈ dùng field CÓ trong danh sách được cung cấp (đúng "name"). Không bịa field.',
    '- measure PHẢI là field KIỂU SỐ (tiền/số lượng/%), hoặc "id" với aggregation "count". TUYỆT ĐỐI không sum field chữ/ngày.',
    '- dimension thời gian PHẢI là field NGÀY (kèm format YYYY-MM). dimension phân loại = select/statusFlow/quan hệ (KHÔNG phải field số liên tục).',
    '- Thiết kế cân đối: 2-4 score card (các KPI khác nhau) + 2-3 chart (ít nhất 1 line/bar theo thời gian + 1 pie theo phân loại nếu có) + 1 filter.',
    '- title tiếng Việt CÓ DẤU. Chỉ trả JSON, không markdown.',
  ].join('\n');
}

/** System prompt for refining ONE chart's ECharts code from a NL instruction. */
function chartRefineSystemPrompt(): string {
  return [
    'Bạn là chuyên gia ECharts. Sửa (hoặc viết lại) code option của MỘT biểu đồ NocoBase theo YÊU CẦU, GIỮ nguyên mọi thứ không liên quan.',
    'Code chạy trong TRÌNH DUYỆT: có sẵn biến `ctx.data.objects` = MẢNG bản ghi (mỗi phần tử là 1 object, key = tên field trong query). Code PHẢI kết thúc bằng `return { …option ECharts… };`.',
    'Khung ví dụ: `var data = ctx.data.objects || []; return { tooltip:{trigger:"axis"}, xAxis:{type:"category", data:data.map(function(x){return x.thang;})}, series:[{type:"bar", data:data.map(function(x){return x.doanh_thu;})}] };`',
    // Modern default look (khớp theme ECharts Pro / Semantix) — áp KHI user KHÔNG chỉ định khác:
    'PHONG CÁCH MẶC ĐỊNH (hiện đại, sạch — dùng khi user không yêu cầu màu/style khác):',
    '- Palette: color:["#3b82f6","#10b981","#f59e0b","#8b5cf6","#ec4899","#06b6d4","#f97316","#14b8a6"]. textStyle.fontFamily:"Inter".',
    '- Trục: axisLabel.color:"#94a3b8" (slate nhạt). Trục category: axisLine.lineStyle.color:"#e2e8f0", axisTick.show:false. Trục value: axisLine.show:false, splitLine.show:false (KHÔNG kẻ lưới).',
    '- tooltip: backgroundColor:"#fff", borderColor:"#e2e8f0", extraCssText:"border-radius:10px;box-shadow:0 6px 20px rgba(15,23,42,0.14)", axisPointer:{type: (bar→"shadow", line→"line")}.',
    '- bar: itemStyle.borderRadius:[5,5,0,0], barMaxWidth:44. line: smooth + lineStyle.width:2.5 + symbolSize:7 + areaStyle gradient nhạt. pie: radius ["42%","70%"] (donut), label formatter "{b}: {d}%".',
    '- Số lớn: format compact (vd formatter: v=> Math.abs(v)>=1e6? (v/1e6).toFixed(1)+"M" : Math.abs(v)>=1e3? (v/1e3).toFixed(1)+"K" : v) cho axisLabel value + data label. Bật data label (series.label.show:true, fontWeight:700).',
    'NHÃN PHÂN LOẠI: nếu human cung cấp "MAP nhãn" cho một field (field select/statusFlow lưu mã như "dang_giao"), PHẢI map mã→nhãn khi hiển thị: `var LBL={...}; ...name: LBL[x.trang_thai]||x.trang_thai` (dữ liệu vẫn là mã, chỉ đổi phần HIỂN THỊ tên/trục).',
    'QUY TẮC: dùng ĐÚNG key data đã cho (`x.<field>`). KHÔNG require/import/khai báo hàm ngoài. Đổi ĐÚNG thứ user yêu cầu (loại chart line/bar/pie, màu, nhãn số liệu label, định dạng trục, legend, tooltip…), phần còn lại giữ nguyên. Trả về TOÀN BỘ code (cả `var data` lẫn `return`), KHÔNG markdown, KHÔNG giải thích ngoài trường explain.',
  ].join('\n');
}

/** System prompt for refining ONE Custom-HTML block's (score card / KPI tile) JS from a NL instruction.
 *  Sibling of chartRefineSystemPrompt() — same recipe, different runtime contract: the code returns an
 *  HTML STRING (not an ECharts option) and sees `data`/`helpers`, not `ctx`. */
function htmlRefineSystemPrompt(): string {
  return [
    'Bạn là chuyên gia viết JS cho block "Custom HTML" (thẻ KPI/score-card) của NocoBase. Sửa (hoặc viết lại) đoạn JS theo YÊU CẦU, GIỮ nguyên mọi thứ không liên quan.',
    'Code chạy trong TRÌNH DUYỆT, có sẵn 2 biến: `data` = MẢNG bản ghi kết quả query (mỗi phần tử 1 object, key = tên field/alias trong query — 1 thẻ KPI thường chỉ cần `data[0]`); `helpers` = tiện ích dựng sẵn: `helpers.fmt(n)` định dạng số, `helpers.icon("ten-kebab", { size })` trả về SVG icon (vd "dollar-sign","shopping-cart","trending-up","users"), `helpers.esc(s)` escape HTML. Code PHẢI kết thúc bằng `return` MỘT CHUỖI HTML (template string).',
    'Khung ví dụ: const raw = data && data[0] ? data[0]["Tổng doanh thu"] : 0; const val = raw; return `<div style="padding:16px">${helpers.fmt(val)}</div>`;',
    'QUY TẮC: dùng ĐÚNG key dữ liệu đã cho (đừng bịa tên field/alias). KHÔNG require/import/khai báo hàm ngoài, KHÔNG dùng biến `ctx` (đây là thẻ HTML, KHÔNG phải biểu đồ ECharts). Đổi ĐÚNG thứ user yêu cầu (màu/nền, icon, đơn vị/định dạng số, bố cục, cỡ chữ, thêm % thay đổi…), phần còn lại giữ nguyên. Trả về TOÀN BỘ code JS (khai báo biến lẫn return), KHÔNG markdown, KHÔNG giải thích ngoài trường explain.',
  ].join('\n');
}

/** Light validate + coerce a DashboardSpec: force the collection, drop widgets referencing unknown fields. */
function validateDashboardSpec(spec: any, coll: string, fieldNames: Set<string>): { ok: boolean; spec?: any; error?: string } {
  if (!spec || typeof spec !== 'object') return { ok: false, error: 'Không phải object' };
  spec.collection = coll;
  if (!Array.isArray(spec.widgets)) return { ok: false, error: 'Thiếu widgets[]' };
  const known = (fn: string) => fn === 'id' || fieldNames.has(fn);
  spec.widgets = spec.widgets.filter((w: any) => {
    if (!w || typeof w !== 'object') return false;
    if (w.kind === 'score') return !!(w.measure && known(w.measure.field));
    if (w.kind === 'chart') return !!(w.measure && known(w.measure.field) && w.dimension && known(w.dimension.field));
    if (w.kind === 'filter') { w.fields = (Array.isArray(w.fields) ? w.fields : []).filter((f: string) => fieldNames.has(f)); return w.fields.length > 0; }
    return false;
  });
  if (!spec.widgets.length) return { ok: false, error: 'Không có widget hợp lệ (field không khớp collection)' };
  if (!spec.title) spec.title = coll;
  return { ok: true, spec };
}

/** System prompt for AGENTIC tool-planning: given an instruction + current state, plan an ordered list
 *  of tool calls (build from scratch OR modify an existing app). */
function toolPlanSystemPrompt(state: string): string {
  return [
    'Bạn là trợ lý DỰNG/SỬA app NocoBase. Từ YÊU CẦU + TRẠNG THÁI hiện tại, lập KẾ HOẠCH gồm các bước gọi tool (đúng THỨ TỰ). Trả JSON.',
    '',
    'TOOL (mỗi bước = {"tool":"...","args":{...}}):',
    '- createCollection {name(snake, không dấu), title(vi), titleField, fields:[{name,title,interface,options?,widget?,computed?,states?}]}',
    '- addField {collection, field:{name,title,interface,...}}',
    '- addRelation {collection, relation:{name(snake),title(nhãn tiếng Việt vd "Khách hàng"),type:"m2o"|"o2m"|"o2o"|"m2m",target,reverseName?,quickCreate?(bool: BẬT cho quan hệ tới khách hàng/liên hệ/nhà cung cấp — tạo tại-chỗ; TẮT cho danh mục/master),subColumns?([field con cho sub-table o2m, theo thứ tự thiết kế])}}',
    '- addComputed {collection, field:{name,title,interface:"number",computed:{expression:"data.x * data.y"}}}',
    '- addStatusFlow {collection, field:{name,title,states:(["Mới","Xong"] đơn giản HOẶC [{"label","color"?,"kind"?:"init"|"doing"|"done"|"fail"}] thiết kế đầy đủ),transitions?:{"Nhãn A":["Nhãn B",...]}}}',
    '- seed {collection, rows:[{...}]}  (giá trị quan hệ m2o = giá trị titleField của bản ghi target)',
    '- createMenuGroup {label, icon?}',
    '- createPage {collection, title, menuGroup?, icon?("lucide-users"), block?("EnhancedTableBlockModel"), columns:[tên field], popupColumns?}',
    '- dropField {collection, field}  — XOÁ 1 field khỏi bảng',
    '- dropCollection {collection}  — XOÁ cả 1 bảng',
    '- renameField {collection, field, title}  — đổi TÊN HIỂN THỊ của field (KHÔNG đổi tên máy)',
    '',
    'interface ∈ input,textarea,phone,email,url,number,integer,percent,select,multipleSelect,checkbox,date,datetime,time,color,json,statusFlow (select/multi cần options; statusFlow cần states; computed: data.<field> cùng dòng / SUM(data.<o2m>.<field>) rollup / data.<m2o>.<field> TRA CỨU từ bảng cấu hình vd "data.san_pham.gia"). widget?: "Progress bar","Value tag","Sub-table Pro".',
    '',
    'QUY TẮC:',
    '- DỰNG MỚI: createCollection từng bảng TRƯỚC → addRelation → createMenuGroup + createPage. Tên snake không dấu, title tiếng Việt.',
    '- SỬA app CÓ SẴN: CHỈ đụng cái cần đổi trên collection ĐÃ CÓ trong TRẠNG THÁI — thêm (addField/addStatusFlow/addComputed/addRelation/createPage), XOÁ (dropField/dropCollection), hoặc đổi tên hiển thị (renameField). TUYỆT ĐỐI KHÔNG createCollection lại collection đã tồn tại. CHỈ dropField/dropCollection field/bảng CÓ THẬT trong TRẠNG THÁI.',
    '- addRelation chỉ sau khi cả 2 collection tồn tại (đã có, hoặc được createCollection trước đó trong plan).',
    '- THIẾT KẾ UI/UX (bạn là designer): thứ tự cột theo luồng đọc-nhập (định danh/quan hệ chính ĐẦU → thuộc tính → status → computed CUỐI); "columns" bảng chỉ 4-6 cột quan trọng, field phụ để "popupColumns"; chọn widget theo ngữ nghĩa (%/tiến độ→Progress bar, nhãn→Value tag, quan hệ→Rich select).',
    '- CHỈ trả JSON {"steps":[...], "explain":"..."}.',
    '',
    'TRẠNG THÁI hiện tại (các collection + field đang có):',
    state || '(chưa có collection nào)',
  ].join('\n');
}

/**
 * Read a custom-action's values (`resource().op({values})` → ctx.action.params.values; raw HTTP may put
 * them top-level). Accept both.
 */
function readVals(ctx: any): any {
  const p = ctx?.action?.params || {};
  return p.values ?? p ?? {};
}

// ── AppSheet data import (Google Sheet → collection) helpers ──
const asSlug = (s: any) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^([0-9])/, 'c$1').toLowerCase();
/** Fetch a published/public Google Sheet tab as CSV (gviz). Follows one redirect. */
function fetchSheetCsv(docId: string, tab: string): Promise<string> {
  const https = require('https');
  const url = `https://docs.google.com/spreadsheets/d/${docId}/gviz/tq?tqx=out:csv&headers=1&sheet=${encodeURIComponent(tab)}`;
  const get = (u: string, redirs: number): Promise<string> => new Promise((res, rej) => {
    https.get(u, (r: any) => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location && redirs > 0) { get(r.headers.location, redirs - 1).then(res, rej); return; }
      let d = ''; r.on('data', (c: any) => (d += c)); r.on('end', () => res(d));
    }).on('error', rej);
  });
  return get(url, 3);
}
/** Minimal RFC-4180 CSV parser → array of rows (each an array of cells). */
function parseCsvRows(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (ch !== '\r') cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

export class PluginAppBuilderServer extends Plugin {
  // ── PRIMITIVES ──────────────────────────────────────────────────────────────────────────────────
  // Each op is a self-contained, idempotent building block. `apply` orchestrates them for a whole spec,
  // and each is ALSO exposed as its own action (below) so an AI / script / UI can call them step-by-step.

  /** Find-or-create a `collectionCategories` row by name and return its id — idempotent, best-effort
   *  (never throws; a category hiccup must not block collection creation). Categories are GLOBAL (the
   *  `collectionCategories` table carries no `dataSourceKey`), so the same name across apps/collections
   *  dedupes onto one row — matching how the built-in "Add collection" panel's category list works. */
  private async ensureCategory(name: string): Promise<number | undefined> {
    const trimmed = String(name || '').trim();
    if (!trimmed) return undefined;
    try {
      const repo: any = this.db.getRepository('collectionCategories');
      if (!repo) return undefined;
      const existing = await repo.findOne({ filter: { name: trimmed } });
      if (existing) return existing.get ? existing.get('id') : existing.id;
      const created = await repo.create({ values: { name: trimmed } });
      return created.get ? created.get('id') : created.id;
    } catch { return undefined; }
  }

  /** Create one collection + its fields (scalar / select / status-flow / computed-as-number-column).
   *  Does NOT create computed RULES here — those run AFTER relations so roll-ups can reference them.
   *  `categoryName`, when given, groups the collection in the data-source panel: ensures/finds a
   *  `collectionCategories` row by that name and links it via `category` — the SAME belongsToMany
   *  association (`collections.category` → `collectionCategories`, through `collectionCategory`) the
   *  built-in "Add collection" UI writes, given as an array of (existing) category ids.
   *  Idempotent: an existing collection is skipped. */
  private async opCreateCollection(c: CollectionSpec, categoryName?: string): Promise<any> {
    const colRepo: any = this.db.getRepository('collections');
    if (!colRepo) throw new Error('collection-manager (collections repo) không có');
    if (await colRepo.findOne({ filter: { name: c.name } })) {
      // PATCH / merge: the collection already exists (e.g. a shared `customer` the new spec reuses, or a
      // re-apply) — DON'T recreate it, but ADD any user fields it's missing so the spec's additions land.
      // opAddField is idempotent per field, so existing fields (and their data) are left untouched.
      const mergedFields: string[] = [];
      for (const f of c.fields || []) { const r = await this.opAddField(c.name, f); if (r.field_status === 'created') mergedFields.push(f.name); }
      return { name: c.name, skipped: 'exists', ...(mergedFields.length ? { mergedFields } : {}) };
    }
    // System fields FIRST (visible id + created/updated at/by, proper `id` PK), then the user's fields.
    // autoGenId MUST be false since we supply the id field explicitly (else NocoBase adds a 2nd, clashing PK).
    const userFields = (c.fields || []).map(fieldDef);
    const fields = [...systemFieldDefs(), ...userFields];
    const categoryId = categoryName ? await this.ensureCategory(categoryName) : undefined;
    await colRepo.create({
      values: {
        name: c.name, title: c.title || c.name, ...(c.titleField ? { titleField: c.titleField } : {}),
        autoGenId: false, createdAt: true, updatedAt: true, createdBy: true, updatedBy: true, sortable: true, logging: true, fields,
        ...(categoryId != null ? { category: [categoryId] } : {}),
      },
      context: {}, // run collection-manager hooks → migrate the physical table
    });
    try { await (this.db.getCollection(c.name) as any)?.sync?.({ alter: true }); } catch {}
    return { name: c.name, fields: userFields.length, ...(categoryId != null ? { category: categoryName } : {}) };
  }

  /** Add one field to an existing collection (+ its computed rule if it's a computed field). Idempotent
   *  on the column; the computed rule is (re)ensured regardless (so `addComputed` on an existing column works). */
  private async opAddField(coll: string, f: FieldSpec): Promise<any> {
    const fieldRepo: any = this.db.getRepository('fields');
    const exists = await fieldRepo.findOne({ filter: { collectionName: coll, name: f.name } });
    if (!exists) {
      await fieldRepo.create({ values: { ...fieldDef(f), collectionName: coll }, context: {} });
      try { await (this.db.getCollection(coll) as any)?.sync?.({ alter: true }); } catch {}
    }
    const computed = f.computed?.expression ? await this.opAddComputedRules(coll, [f]) : [];
    return { coll, field: f.name, interface: f.interface, field_status: exists ? 'exists' : 'created', ...(computed.length ? { computed } : {}) };
  }

  /** Create @tuanla90/plugin-formula computed-column rules (`ptdlComputedRules`); local/sibling first,
   *  roll-ups (SUM over a relation) last so their dependencies compute first. */
  private async opAddComputedRules(coll: string, fields: FieldSpec[]): Promise<any[]> {
    if (!fields.length) return [];
    const ruleRepo: any = this.db.getRepository('ptdlComputedRules');
    if (!ruleRepo) return [{ skipped: 'plugin-formula (ptdlComputedRules) chưa cài' }];
    const isRollup = (e: string) => /\b(SUM|COUNT|AVG|MIN|MAX)\s*\(\s*data\./i.test(e);
    const sorted = [...fields].sort((a, b) => Number(isRollup(a.computed!.expression)) - Number(isRollup(b.computed!.expression)));
    const out: any[] = [];
    // Which rules are NEW (not already attached)? Only those need a schema sync.
    const toAdd: FieldSpec[] = [];
    for (const f of sorted) {
      if (await ruleRepo.findOne({ filter: { collectionName: coll, targetField: f.name } })) out.push({ field: f.name, skipped: 'exists' });
      else toAdd.push(f);
    }
    // NO schema sync: the computed COLUMN already exists (createCollection created every field, computed
    // included, as a real number column), and a computed RULE is just a `ptdlComputedRules` metadata row —
    // it changes no table schema. An alter-sync on a wide sqlite table is ~10s; doing it per computed field
    // made a 34-formula collection hang for minutes. Just insert the rule rows.
    for (const f of toAdd) {
      await ruleRepo.create({
        values: { dataSourceKey: 'main', collectionName: coll, targetField: f.name, formula: f.computed!.expression, runOn: 'create,update,source', enabled: true, onError: 'null' },
        context: {},
      });
      out.push({ field: f.name, formula: f.computed!.expression });
    }
    return out;
  }

  /** Plain-text title of a collection (unwraps system `{{t("...")}}` i18n templates). '' if unknown. */
  private async collTitle(name: string): Promise<string> {
    try {
      const c = await this.db.getRepository('collections').findOne({ filter: { name } });
      const raw = c && (c.get ? c.get('title') : (c as any).title);
      return raw ? String(raw).replace(/\{\{\s*t\(["']([^"']+)["']\)\s*\}\}/, '$1') : '';
    } catch { return ''; }
  }

  /** value→label map of an enum field (select/multipleSelect/radioGroup/statusFlow) from its stored
   *  `options.uiSchema.enum` — so an AI-refined raw chart can show labels instead of stored slugs. Server
   *  reads the DB directly (the real enum WITH labels; no client empty-array trap). null if not an enum. */
  private async enumLabelMapOf(coll: string, name: string): Promise<Record<string, string> | null> {
    if (!coll || !name) return null;
    try {
      const f: any = await this.db.getRepository('fields').findOne({ filter: { collectionName: coll, name } });
      if (!f) return null;
      const o = f.get ? f.get('options') : f.options;
      const opts = o?.uiSchema?.enum;
      if (!Array.isArray(opts) || !opts.length) return null;
      const m: Record<string, string> = {};
      opts.forEach((x: any) => { if (x && x.value != null && x.label != null) m[String(x.value)] = String(x.label); });
      return Object.keys(m).length ? m : null;
    } catch { return null; }
  }

  /** Ensure the CHILD of an o2m has a belongsTo back to the parent (sharing the SAME FK) so the reverse
   *  relation is navigable — otherwise the child only carries a raw FK int ("link ngược bị sai"). Idempotent. */
  private async ensureReverseBelongsTo(parentColl: string, r: RelationSpec, foreignKey: string): Promise<any> {
    const childColl = r.target;
    const revName = r.reverseName || parentColl;
    const fieldRepo: any = this.db.getRepository('fields');
    if (await fieldRepo.findOne({ filter: { collectionName: childColl, name: revName } })) return { name: revName, skipped: 'exists' };
    const title = (await this.collTitle(parentColl)) || revName;
    try {
      await fieldRepo.create({ values: {
        collectionName: childColl, name: revName, type: 'belongsTo', interface: 'm2o', target: parentColl, foreignKey, targetKey: 'id',
        uiSchema: { title, 'x-component': 'AssociationField', 'x-component-props': { multiple: false } },
      }, context: {} });
      return { name: revName, target: parentColl, foreignKey };
    } catch (e: any) { return { name: revName, error: e?.message || String(e) }; }
  }

  /** Create one relation field on `coll`. Idempotent. (Both endpoint collections must already exist.) */
  private async opAddRelation(coll: string, r: RelationSpec): Promise<any> {
    const fieldRepo: any = this.db.getRepository('fields');
    if (await fieldRepo.findOne({ filter: { collectionName: coll, name: r.name } })) return { coll, name: r.name, skipped: 'exists' };
    const def = relationDef(coll, r);
    // Friendly display label: AI-provided title > target collection's title > the machine name.
    if (!r.title) { const t = await this.collTitle(r.target); if (t) def.uiSchema = { ...def.uiSchema, title: t }; }
    await fieldRepo.create({ values: def, context: {} });
    // A parent-declared o2m: also give the child a belongsTo back to the parent (bidirectional).
    const paired = r.type === 'o2m' ? await this.ensureReverseBelongsTo(coll, r, def.foreignKey) : undefined;
    return { coll, name: r.name, type: r.type, foreignKey: def.foreignKey, ...(paired ? { paired } : {}) };
  }

  /** Import ONE collection's rows from its AppSheet Google Sheet (public gviz CSV, fetched server-side → no
   *  CORS). Columns map by field name (slug) OR original title (AppSheet "ID" → NocoBase "id_x" collision);
   *  m2o relations link by querying the target's key field → id. Returns a per-collection summary. */
  private async opImportSheet(v: any): Promise<any> {
    const { collection, docId, tab, keyField } = v;
    const fields: any[] = v.fields || [];
    const relations: any[] = v.relations || [];
    const offset = Number(v.offset) || 0;
    const limit = Number(v.limit) || 0;   // 0 = all rows in one call (small collections)
    if (!collection || !docId || !tab) return { collection, error: 'thiếu collection/docId/tab' };
    const repo: any = this.db.getRepository(collection);
    if (!repo) return { collection, error: 'collection không tồn tại' };
    let csv: string;
    try { csv = await fetchSheetCsv(docId, tab); } catch (e: any) { return { collection, error: 'fetch lỗi: ' + (e?.message || e) }; }
    if (/^\s*<!DOCTYPE|^\s*<html/i.test(csv)) return { collection, tab, error: 'sheet CHƯA PUBLIC (nhận HTML)' };
    const rows = parseCsvRows(csv);
    if (rows.length < 1) return { collection, tab, nrows: 0, total: 0, done: true };
    const header = rows[0].map((h) => h.trim());
    const allData = rows.slice(1).filter((r) => r.some((c) => c !== ''));
    const total = allData.length;
    const dataRows = limit ? allData.slice(offset, offset + limit) : allData;   // this chunk
    const hIndex = new Map(header.map((h, i) => [asSlug(h), i]));
    const hRaw = new Map(header.map((h, i) => [h.trim(), i]));
    const colOf = (fr: any): number | undefined => { const a = hIndex.get(fr.name); if (a != null) return a; return hRaw.get(String(fr.title || '').trim()); };
    const fmap = fields.map((f) => ({ f, i: colOf(f) })).filter((x) => x.i != null);
    const rmap = relations.map((r) => ({ r, i: colOf(r) })).filter((x) => x.i != null);
    // DEDUP: skip rows whose business key already exists (so re-clicking Import never duplicates). Read the
    // existing key set once; the key column is found by name-slug or original title (ID→id_x collision).
    const kfCol = keyField ? colOf({ name: keyField, title: (fields.find((f) => f.name === keyField) || {}).title || keyField }) : undefined;
    const existing = new Set<string>();
    if (keyField && kfCol != null) { try { const recs = await repo.find({ fields: ['id', keyField] }); for (const rec of recs) { const k = rec?.[keyField]; if (k != null && k !== '') existing.add(String(k)); } } catch { /* */ } }
    // relation keymaps: query each target's keyField → id (business key → NocoBase id)
    const keymaps = new Map<string, Map<string, any>>();
    for (const { r } of rmap) {
      if (keymaps.has(r.target)) continue;
      const tkf = r.targetKeyField; const trepo: any = tkf ? this.db.getRepository(r.target) : null;
      const km = new Map<string, any>();
      if (trepo) { try { const recs = await trepo.find({ fields: ['id', tkf] }); for (const rec of recs) { const k = rec?.[tkf]; if (k != null && k !== '') km.set(String(k), rec.id); } } catch { /* */ } }
      keymaps.set(r.target, km);
    }
    let posted = 0, failed = 0, linked = 0, missed = 0, skipped = 0, firstErr = '';
    for (const row of dataRows) {
      if (kfCol != null && existing.has(String(row[kfCol as number]))) { skipped++; continue; }   // already imported
      const values: any = {};
      for (const { f, i } of fmap) {
        let val: any = row[i as number];
        if (val === '' || val == null) continue;
        if (f.interface === 'number' || f.interface === 'integer' || f.interface === 'percent') { const n = Number(String(val).replace(/,/g, '')); if (!Number.isNaN(n)) val = n; }
        else if (f.interface === 'boolean') val = /^(true|1|yes|có|x)$/i.test(val);
        else if (f.interface === 'multipleSelect' || f.interface === 'checkboxGroup') { val = String(val).split(/\s*,\s*/).map((x) => x.trim()).filter(Boolean); }   // AppSheet EnumList = comma-separated → array
        values[f.name] = val;
      }
      for (const { r, i } of rmap) {
        const kv = row[i as number]; if (!kv) continue;
        const id = keymaps.get(r.target)?.get(String(kv));
        if (id != null) { values[r.name] = { id }; linked++; } else missed++;
      }
      try { await repo.create({ values }); posted++; } catch (e: any) { failed++; if (!firstErr) firstErr = String(e?.message || e).slice(0, 160); }
    }
    // NB: key must NOT be `rows` — a top-level `rows` in a custom action's ctx.body triggers list-unwrap
    // (data := rows), dropping the rest of the summary. See reference_nocobase_list_response_rows_key.
    return { collection, tab, nrows: dataRows.length, total, done: offset + dataRows.length >= total, posted, skipped, failed, linked, missed, firstErr: firstErr || undefined };
  }

  /** Seed rows into a collection. Self-contained: resolves m2o values (a string) against the target's
   *  titleField by querying the live DB — no spec needed, so it works as a standalone tool. */
  private async opSeed(coll: string, rows: any[]): Promise<any> {
    const repo: any = this.db.getRepository(coll);
    // NOTE: return key is `inserted`, NOT `rows` — a top-level `rows` key in a custom action's ctx.body
    // triggers NocoBase's list-unwrap (data := rows), dropping siblings. See reference memory.
    if (!repo || !rows?.length) return { coll, inserted: 0 };
    const collObj: any = this.db.getCollection(coll);
    const belongsTo = (collObj?.getFields?.() || []).filter((f: any) => f.type === 'belongsTo');
    const relByName = new Map<string, any>(belongsTo.map((f: any) => [f.name, f]));
    // Enum fields (select/multipleSelect/statusFlow): read each field's uiSchema.enum from the fields
    // metadata repo (same read path as opRenameField/collTitle — the runtime Collection's own Field
    // instances don't reliably expose it) so seed rows can translate label → value before insert.
    const enumByName = new Map<string, Array<{ value: any; label?: any }>>();
    try {
      const fieldRepo: any = this.db.getRepository('fields');
      const fieldRows: any[] = fieldRepo ? await fieldRepo.find({ filter: { collectionName: coll } }) : [];
      for (const fr of fieldRows) {
        const name = fr.get ? fr.get('name') : fr.name;
        const options = (fr.get ? fr.get('options') : fr.options) || {};
        const en = options.uiSchema?.enum;
        if (name && Array.isArray(en) && en.length) enumByName.set(name, en);
      }
    } catch { /* best-effort — fall back to storing the raw seed value below */ }
    let n = 0;
    for (const row of rows) {
      const values: any = {};
      for (const [k, v] of Object.entries(row)) {
        const rel = relByName.get(k);
        if (rel && typeof v === 'string') {
          const tColl: any = this.db.getCollection(rel.target);
          const tTitle = (tColl?.titleField) || (tColl?.options?.titleField) || 'id';
          const tRepo: any = this.db.getRepository(rel.target);
          const hit = tRepo && (await tRepo.findOne({ filter: { [tTitle]: v } }));
          const id = hit && (hit.get ? hit.get('id') : hit.id);
          if (id != null) values[rel.foreignKey || rel.options?.foreignKey || fkOf(rel.name)] = id;
        } else if (!rel) {
          const enumOpts = enumByName.get(k);
          if (enumOpts) {
            const resolved = resolveEnumSeedValue(enumOpts, v);
            if (resolved !== undefined) values[k] = resolved; // else: drop — the field's defaultValue applies
          } else {
            values[k] = v;
          }
        }
      }
      try { await repo.create({ values }); n++; } catch { /* skip a bad row */ }
    }
    return { coll, inserted: n };
  }

  /** Introspection: list collections (optionally by name prefix) + their fields, so a step-by-step
   *  caller can "see" current state before deciding the next call. */
  private async opDescribe(prefix?: string): Promise<any> {
    const colRepo: any = this.db.getRepository('collections');
    const all = (await colRepo.find({ appends: ['fields'] })) || [];
    const collections = all
      .filter((c: any) => !prefix || String(c.name).startsWith(prefix))
      .map((c: any) => ({
        name: c.name, title: c.get ? c.get('title') : c.title, titleField: c.get ? c.get('titleField') : c.titleField,
        fields: (c.fields || []).filter((f: any) => f.interface).map((f: any) => ({ name: f.name, interface: f.interface, type: f.type, ...(f.target ? { target: f.target } : {}) })),
      }));
    return { count: collections.length, collections };
  }

  /** Drop one field from a collection (+ its computed rule). Refuses system fields. */
  private async opDropField(coll: string, field: string): Promise<any> {
    if (['id', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy', 'createdById', 'updatedById', 'sort'].includes(field)) return { coll, field, skipped: 'system field' };
    const fieldRepo: any = this.db.getRepository('fields');
    const f = await fieldRepo.findOne({ filter: { collectionName: coll, name: field } });
    if (!f) return { coll, field, skipped: 'not found' };
    try { const ruleRepo: any = this.db.getRepository('ptdlComputedRules'); if (ruleRepo) await ruleRepo.destroy({ filter: { collectionName: coll, targetField: field } }); } catch {}
    await fieldRepo.destroy({ filter: { collectionName: coll, name: field }, context: {} });
    try { await (this.db.getCollection(coll) as any)?.sync?.({ alter: true }); } catch {}
    return { coll, field, dropped: true };
  }

  /** Drop a whole collection (+ its computed rules). Refuses core NocoBase collections. */
  private async opDropCollection(coll: string): Promise<any> {
    if (CORE_COLLECTIONS.has(coll)) return { coll, skipped: 'core collection (refused)' };
    const colRepo: any = this.db.getRepository('collections');
    if (!(await colRepo.findOne({ filter: { name: coll } }))) return { coll, skipped: 'not found' };
    try { const ruleRepo: any = this.db.getRepository('ptdlComputedRules'); if (ruleRepo) await ruleRepo.destroy({ filter: { collectionName: coll } }); } catch {}
    await colRepo.destroy({ filter: { name: coll }, context: {} });
    return { coll, dropped: true };
  }

  /** Rename a field's display label (uiSchema.title). Machine-name rename is intentionally NOT done
   *  (it breaks relations/pages/FKs); change the label only. */
  private async opRenameField(coll: string, field: string, title: string): Promise<any> {
    const fieldRepo: any = this.db.getRepository('fields');
    const f = await fieldRepo.findOne({ filter: { collectionName: coll, name: field } });
    if (!f) return { coll, field, skipped: 'not found' };
    const options = (f.get ? f.get('options') : f.options) || {};
    const uiSchema = { ...(options.uiSchema || {}), title };
    await fieldRepo.update({ filter: { collectionName: coll, name: field }, values: { uiSchema }, context: {} });
    return { coll, field, title };
  }

  async load() {
    this.app.resourceManager.define({
      name: 'appBuilder',
      actions: {
        // ── validate a spec (no writes) ──
        dryRun: async (ctx: any, next: any) => {
          const spec = readSpec(ctx);
          const result = validateAppSpec(spec);
          const errors: ValidationIssue[] = [...result.errors];
          const warnings: ValidationIssue[] = [...result.warnings];
          try {
            const colRepo: any = this.db.getRepository('collections');
            for (const c of spec.collections || []) {
              if (await colRepo.findOne({ filter: { name: c.name } })) warnings.push({ level: 'warning', path: 'collections', message: `Collection "${c.name}" đã tồn tại — apply sẽ bỏ qua` });
            }
          } catch { /* best-effort */ }
          ctx.body = { ok: errors.length === 0, errors, warnings };
          await next();
        },

        // ── whole-spec compiler = orchestrate the primitives (collections → relations → computed → seed).
        //    Idempotent; best-effort rollback of THIS run's new collections on error. ──
        apply: async (ctx: any, next: any) => {
          const spec = readSpec(ctx);
          const result = validateAppSpec(spec);
          if (!result.ok) { ctx.body = { ok: false, phase: 'validate', errors: result.errors, warnings: result.warnings }; await next(); return; }
          const colRepo: any = this.db.getRepository('collections');
          const created: string[] = [];
          const report: any = { collections: [], relations: [], computed: [], seeded: [] };
          try {
            // Category per collection = the menuGroup of its FIRST page (the spec's own logical grouping),
            // else the app's display name (meta.title||name) as a single catch-all bucket, else none (best-effort —
            // see opCreateCollection/ensureCategory).
            const menuGroupByColl = new Map<string, string>();
            for (const p of spec.pages || []) { if (p.collection && p.menuGroup && !menuGroupByColl.has(p.collection)) menuGroupByColl.set(p.collection, p.menuGroup); }
            for (const c of spec.collections || []) { const r = await this.opCreateCollection(c, menuGroupByColl.get(c.name) || spec.meta?.title || spec.meta?.name); if (!r.skipped) created.push(c.name); report.collections.push(r); }
            const rels: Array<{ coll: string; r: RelationSpec }> = [];
            for (const c of spec.collections || []) for (const r of c.relations || []) rels.push({ coll: c.name, r });
            rels.sort((a, b) => (RELATION_ORDER[a.r.type] ?? 9) - (RELATION_ORDER[b.r.type] ?? 9));
            for (const { coll, r } of rels) report.relations.push(await this.opAddRelation(coll, r));
            for (const name of created) { try { await (this.db.getCollection(name) as any)?.sync?.({ alter: true }); } catch {} }
            for (const c of spec.collections || []) { const cf = (c.fields || []).filter((f) => f.computed?.expression); if (cf.length) (await this.opAddComputedRules(c.name, cf)).forEach((x) => report.computed.push({ coll: c.name, ...x })); }
            // Seed ONLY newly-created collections — re-applying a spec, or patching into an app whose
            // collection already exists, must NOT duplicate its demo rows.
            for (const c of spec.collections || []) { if (c.seed?.length && created.includes(c.name)) report.seeded.push(await this.opSeed(c.name, c.seed)); }
            ctx.body = { ok: true, ...report, note: 'Data tier xong (collections + relations + computed + seed). Trang = client tier.' };
          } catch (e: any) {
            for (const name of [...created].reverse()) { try { await colRepo.destroy({ filter: { name } }); } catch {} }
            ctx.body = { ok: false, phase: 'apply', error: e?.message || String(e), rolledBack: created };
          }
          await next();
        },

        // ── GRANULAR TOOLS (step-by-step / AI tool-calling) ──
        // POST /api/appBuilder:createCollection {name,title,titleField,fields:[FieldSpec],category?}
        createCollection: async (ctx: any, next: any) => { const v = readVals(ctx); ctx.body = await this.opCreateCollection(v as CollectionSpec, v.category); await next(); },
        // {collection, field:FieldSpec}
        addField: async (ctx: any, next: any) => { const v = readVals(ctx); ctx.body = await this.opAddField(v.collection, v.field); await next(); },
        // {collection, relation:RelationSpec}
        addRelation: async (ctx: any, next: any) => { const v = readVals(ctx); ctx.body = await this.opAddRelation(v.collection, v.relation); await next(); },
        // {collection, field:{name,title,interface?,computed:{expression}}} OR {collection, field:{name,title}, expression}
        addComputed: async (ctx: any, next: any) => {
          const v = readVals(ctx); const f = v.field || {};
          ctx.body = await this.opAddField(v.collection, { interface: 'number', ...f, computed: f.computed || { expression: v.expression } });
          await next();
        },
        // {collection, fields:[FieldSpec]} — attach many computed rules in ONE call (stepped buildApp: 16 calls not 104)
        addComputedBatch: async (ctx: any, next: any) => {
          const v = readVals(ctx); ctx.body = await this.opAddComputedRules(v.collection, v.fields || []); await next();
        },
        // {enabled: boolean} — bulk toggle ALL @tuanla90/plugin-formula computed rules in ONE query (repository
        // update, not the generic :update HTTP action — that one 500s on a bulk filter for this resource).
        // Used to bracket a bulk data import: disable → import raw rows fast (no per-row recompute cascade
        // across dependent collections) → re-enable → ptdlComputed:recompute once to backfill correctly.
        setComputedEnabled: async (ctx: any, next: any) => {
          const v = readVals(ctx);
          const repo: any = this.db.getRepository('ptdlComputedRules');
          if (!repo) { ctx.body = { skipped: 'plugin-formula chưa cài' }; await next(); return; }
          const n = await repo.update({ filter: {}, values: { enabled: !!v.enabled }, forceUpdate: true });
          ctx.body = { enabled: !!v.enabled, count: Array.isArray(n) ? n.length : n };
          await next();
        },
        // Backfill EVERY computed rule (topo order) — called once after a bulk import re-enables rules, so
        // rows created while rules were OFF get their computed values without per-row cascade cost during
        // import. In-process call (not the public ptdlComputed:recompute HTTP action, which is ACL-gated to
        // a snippet most app-builder callers aren't in) via the formula plugin's own ComputedManager.
        recomputeAll: async (ctx: any, next: any) => {
          try {
            const formulaPlugin: any = this.app.pm.get('@tuanla90/plugin-formula');
            const n = await formulaPlugin?.computed?.recomputeAll?.();
            ctx.body = { recomputed: n ?? 0 };
          } catch (e: any) { ctx.body = { error: e?.message || String(e) }; }
          await next();
        },
        // Import ONE collection's rows from its AppSheet Google Sheet (server-side fetch → no CORS).
        // {collection, docId, tab, fields:[{name,title,interface,unique}], relations:[{name,title,target,targetKeyField}]}
        importSheet: async (ctx: any, next: any) => {
          const v = readVals(ctx); ctx.body = await this.opImportSheet(v); await next();
        },
        // {collection, field:{name,title,states:[...],transitions?:{...}}}  → a real @tuanla90 status-flow field
        addStatusFlow: async (ctx: any, next: any) => {
          const v = readVals(ctx); const f = v.field || v;
          ctx.body = await this.opAddField(v.collection, { name: f.name, title: f.title, interface: 'statusFlow', states: f.states, transitions: f.transitions });
          await next();
        },
        // {collection, rows:[...]}
        seed: async (ctx: any, next: any) => { const v = readVals(ctx); ctx.body = await this.opSeed(v.collection, v.rows || []); await next(); },
        // {prefix?}  → introspect current collections/fields
        describeApp: async (ctx: any, next: any) => { ctx.body = await this.opDescribe(readVals(ctx).prefix); await next(); },

        // {description} → dùng LLM của NocoBase sinh App-Spec (structured output + validate/retry ≤3).
        // Client sau đó preview + buildApp (materialize). Đây là "Tả là dựng".
        aiGenerate: async (ctx: any, next: any) => {
          const description = String(readVals(ctx).description || '').trim();
          if (!description) { ctx.body = { ok: false, error: 'Thiếu mô tả' }; await next(); return; }
          const { provider, error } = await getAiProvider(this.app);
          if (error) { ctx.body = { ok: false, error }; await next(); return; }
          const system = appSpecSystemPrompt();
          const schema = { type: 'object', properties: { spec: { type: 'string', description: 'App-Spec dạng chuỗi JSON hợp lệ' }, explain: { type: 'string', description: 'Giải thích ngắn tiếng Việt (1 câu)' } }, required: ['spec'] };
          let human = `Mô tả app: ${description}\n\nSinh App-Spec JSON.`;
          let spec: any = null; let explain = ''; let lastError = '';
          for (let attempt = 0; attempt < 3 && !spec; attempt++) {
            let raw = '';
            try {
              const result: any = await provider.invoke({ messages: [['system', system], ['human', human]], structuredOutput: { schema, name: 'appspec', description: 'App-Spec + giải thích' } });
              const parsed = result && typeof result === 'object' && 'parsed' in result ? result.parsed : result;
              raw = parsed?.spec || ''; explain = String(parsed?.explain || '');
            } catch { /* structured output not supported → plain-text fallback */ }
            if (!raw) { try { raw = aiText(await provider.invoke({ messages: [['system', system + '\n\nTrả về DUY NHẤT JSON App-Spec.'], ['human', human]] })); } catch {} }
            raw = stripFences(raw);
            let parsedSpec: any;
            try { parsedSpec = JSON.parse(raw); } catch (e: any) { lastError = 'JSON không parse được: ' + e?.message; human += `\n\nLần trước output KHÔNG phải JSON hợp lệ. Trả JSON App-Spec thuần.`; continue; }
            const v = validateAppSpec(parsedSpec);
            if (v.ok) { spec = parsedSpec; break; }
            lastError = v.errors.slice(0, 6).map((x) => `${x.path}: ${x.message}`).join('; ');
            human = `Mô tả app: ${description}\n\nApp-Spec bạn vừa sinh SAI:\n${JSON.stringify(parsedSpec)}\n\nLỖI cần sửa: ${lastError}\n\nSửa lại cho HỢP LỆ, trả JSON App-Spec.`;
          }
          if (!spec) { ctx.body = { ok: false, error: lastError || 'AI không trả về App-Spec hợp lệ' }; await next(); return; }
          ctx.body = { ok: true, spec, explain, warnings: validateAppSpec(spec).warnings };
          await next();
        },

        // {spec, instruction} → REFINE an existing App-Spec conversationally: keep everything, apply just
        // the requested change, return the WHOLE modified spec. Different from aiGenerate (from scratch) and
        // aiPlan (tool-calls on a BUILT app) — this edits the SPEC in the preview, so a user who sees
        // something wrong can chat "thêm cột ghi chú vào bảng khách hàng" and re-preview before Create.
        aiRefine: async (ctx: any, next: any) => {
          const v = readVals(ctx);
          const instruction = String(v.instruction || '').trim();
          let current: any = v.spec;
          if (typeof current === 'string') { try { current = JSON.parse(current); } catch { /* handled below */ } }
          if (!instruction) { ctx.body = { ok: false, error: 'Thiếu yêu cầu sửa' }; await next(); return; }
          if (!current || typeof current !== 'object') { ctx.body = { ok: false, error: 'Thiếu App-Spec hiện tại (spec) hoặc spec không hợp lệ' }; await next(); return; }
          const { provider, error } = await getAiProvider(this.app);
          if (error) { ctx.body = { ok: false, error }; await next(); return; }
          const system = appSpecSystemPrompt();
          const schema = { type: 'object', properties: { spec: { type: 'string', description: 'App-Spec ĐÃ SỬA, chuỗi JSON hợp lệ' }, explain: { type: 'string', description: 'Giải thích ngắn tiếng Việt đã đổi gì (1 câu)' } }, required: ['spec'] };
          const base = (extra = '') => `App-Spec HIỆN TẠI:\n${JSON.stringify(current)}\n\nYÊU CẦU SỬA: ${instruction}\n\nTrả về TOÀN BỘ App-Spec ĐÃ SỬA — GIỮ NGUYÊN mọi thứ không liên quan, CHỈ đổi theo yêu cầu. JSON App-Spec thuần.${extra}`;
          let human = base();
          let spec: any = null; let explain = ''; let lastError = '';
          for (let attempt = 0; attempt < 3 && !spec; attempt++) {
            let raw = '';
            try {
              const result: any = await provider.invoke({ messages: [['system', system], ['human', human]], structuredOutput: { schema, name: 'appspec', description: 'App-Spec đã sửa + giải thích' } });
              const parsed = result && typeof result === 'object' && 'parsed' in result ? result.parsed : result;
              raw = parsed?.spec || ''; explain = String(parsed?.explain || '');
            } catch { /* structured output not supported → plain-text fallback */ }
            if (!raw) { try { raw = aiText(await provider.invoke({ messages: [['system', system + '\n\nTrả về DUY NHẤT JSON App-Spec.'], ['human', human]] })); } catch {} }
            raw = stripFences(raw);
            let parsedSpec: any;
            try { parsedSpec = JSON.parse(raw); } catch (e: any) { lastError = 'JSON không parse được: ' + e?.message; human = base('\n\nLần trước output KHÔNG phải JSON hợp lệ.'); continue; }
            const vr = validateAppSpec(parsedSpec);
            if (vr.ok) { spec = parsedSpec; break; }
            lastError = vr.errors.slice(0, 6).map((x) => `${x.path}: ${x.message}`).join('; ');
            human = base(`\n\nBản bạn vừa sửa SAI: ${JSON.stringify(parsedSpec)}\nLỖI: ${lastError}\nSửa cho HỢP LỆ.`);
          }
          if (!spec) { ctx.body = { ok: false, error: lastError || 'AI không sửa được thành App-Spec hợp lệ' }; await next(); return; }
          ctx.body = { ok: true, spec, explain, warnings: validateAppSpec(spec).warnings };
          await next();
        },

        // {collection, description?} → AI thiết kế DashboardSpec (KPI + charts + filter) từ field của bảng.
        // Trả spec để client materialize (createDashboard). AI "nhìn" field thật của collection để chọn measure/dimension.
        aiDashboard: async (ctx: any, next: any) => {
          const v = readVals(ctx);
          const coll = String(v.collection || '').trim();
          const hint = String(v.description || v.instruction || '').trim();
          if (!coll) { ctx.body = { ok: false, error: 'Thiếu collection' }; await next(); return; }
          const collection: any = this.db.getCollection(coll);
          if (!collection) { ctx.body = { ok: false, error: 'Không thấy collection: ' + coll }; await next(); return; }
          // Introspect fields → give the AI real names/types to pick measures & dimensions from.
          const fields: any[] = [];
          collection.fields.forEach((f: any) => {
            const o = f.options || {};
            if (['belongsToMany', 'hasMany', 'hasOne', 'password'].includes(o.type)) return; // skip to-many rels & secrets
            const rawTitle = o.uiSchema?.title || o.title || f.name;
            fields.push({ name: f.name, type: o.type, interface: o.interface, title: typeof rawTitle === 'string' ? rawTitle : f.name });
          });
          const fieldNames = new Set<string>(fields.map((f) => f.name));
          const isNum = (f: any) => ['float', 'double', 'decimal', 'integer', 'bigInt'].includes(f.type) || ['number', 'integer', 'percent', 'currency'].includes(f.interface);
          const isDate = (f: any) => ['date', 'datetime', 'dateOnly', 'datetimeNoTz', 'timestamp'].includes(f.type) || ['date', 'datetime', 'createdAt', 'updatedAt'].includes(f.interface);
          const isCat = (f: any) => ['select', 'statusFlow', 'radioGroup', 'checkbox'].includes(f.interface) || f.type === 'belongsTo';
          const numF = fields.filter(isNum).map((f) => f.name);
          const dateF = fields.filter(isDate).map((f) => f.name);
          const catF = fields.filter(isCat).map((f) => f.name);
          const { provider, error } = await getAiProvider(this.app);
          if (error) { ctx.body = { ok: false, error }; await next(); return; }
          const system = dashboardSystemPrompt();
          const schema = { type: 'object', properties: { spec: { type: 'string', description: 'DashboardSpec, chuỗi JSON hợp lệ' }, explain: { type: 'string', description: 'Giải thích ngắn tiếng Việt (1 câu)' } }, required: ['spec'] };
          const base = (extra = '') => [
            `Collection: "${coll}"`,
            `Các field: ${JSON.stringify(fields)}`,
            `Gợi ý MEASURE (số): ${numF.join(', ') || '(không có field số → dùng count "id")'}`,
            `Gợi ý DIMENSION thời gian: ${dateF.join(', ') || '(không)'}`,
            `Gợi ý DIMENSION phân loại: ${catF.join(', ') || '(không)'}`,
            hint ? `Yêu cầu thêm của người dùng: ${hint}` : '',
            '', 'Thiết kế DashboardSpec đẹp, cân đối. Trả JSON thuần.' + extra,
          ].filter(Boolean).join('\n');
          let human = base();
          let spec: any = null; let explain = ''; let lastError = '';
          for (let attempt = 0; attempt < 3 && !spec; attempt++) {
            let raw = '';
            try {
              const result: any = await provider.invoke({ messages: [['system', system], ['human', human]], structuredOutput: { schema, name: 'dashboard', description: 'DashboardSpec + giải thích' } });
              const parsed = result && typeof result === 'object' && 'parsed' in result ? result.parsed : result;
              raw = parsed?.spec || ''; explain = String(parsed?.explain || '');
            } catch { /* structured output not supported → plain-text fallback */ }
            if (!raw) { try { raw = aiText(await provider.invoke({ messages: [['system', system + '\n\nTrả về DUY NHẤT JSON DashboardSpec.'], ['human', human]] })); } catch {} }
            raw = stripFences(raw);
            let parsedSpec: any;
            try { parsedSpec = JSON.parse(raw); } catch (e: any) { lastError = 'JSON không parse được: ' + e?.message; human = base('\n\nLần trước output KHÔNG phải JSON hợp lệ.'); continue; }
            const vr = validateDashboardSpec(parsedSpec, coll, fieldNames);
            if (vr.ok) { spec = vr.spec; break; }
            lastError = vr.error || 'không hợp lệ';
            human = base(`\n\nBản vừa rồi SAI: ${lastError}. Chỉ dùng field có thật, measure phải là số/count.`);
          }
          if (!spec) { ctx.body = { ok: false, error: lastError || 'AI không thiết kế được dashboard hợp lệ' }; await next(); return; }
          ctx.body = { ok: true, spec, explain };
          await next();
        },

        // {chartUid, instruction} → AI viết lại code ECharts (raw) của MỘT Chart block theo yêu cầu, ghi thẳng
        // vào flowModel (mode:custom). Chart đổi khi trang tải lại. Chart nào cũng sửa được (kể cả builder-mặc-định).
        aiRefineChart: async (ctx: any, next: any) => {
          const v = readVals(ctx);
          const chartUid = String(v.chartUid || '').trim();
          const instruction = String(v.instruction || '').trim();
          if (!chartUid || !instruction) { ctx.body = { ok: false, error: 'Thiếu chartUid hoặc instruction' }; await next(); return; }
          const repo = this.db.getRepository('flowModels');
          const rec: any = await repo.findOne({ filter: { uid: chartUid } });
          if (!rec) { ctx.body = { ok: false, error: 'Không thấy chart: ' + chartUid }; await next(); return; }
          const options = typeof rec.options === 'string' ? JSON.parse(rec.options) : (rec.options || {});
          const isHtml = options.use === 'CustomHtmlBlockModel';
          const isChart = options.use === 'ChartBlockModel';
          if (!isHtml && !isChart) { ctx.body = { ok: false, error: 'Không phải Chart/Custom-HTML block (' + options.use + ')' }; await next(); return; }
          const cfg = (((options.stepParams = options.stepParams || {}).chartSettings = options.stepParams.chartSettings || {}).configure = options.stepParams.chartSettings.configure || {});
          const query = cfg.query || {};
          const leaf = (f: any) => (Array.isArray(f) ? f[f.length - 1] : f);
          const measures = (query.measures || []).map((m: any) => m.alias || leaf(m.field));
          const dims = (query.dimensions || []).map((d: any) => leaf(d.field));
          const dataKeys = [...dims, ...measures].filter(Boolean);
          const { provider, error } = await getAiProvider(this.app);
          if (error) { ctx.body = { ok: false, error }; await next(); return; }

          if (isChart) {
            const opt = (cfg.chart = cfg.chart || {}).option || {};
            const prevRaw = String(opt.raw || ''); // code BEFORE this edit — returned so the client can offer one-step Undo
            const system = chartRefineSystemPrompt();
            const schema = { type: 'object', properties: { raw: { type: 'string', description: 'Code ECharts MỚI (JS trả về option)' }, explain: { type: 'string' } }, required: ['raw'] };
            // A select/statusFlow dimension stores slugs → give the AI the value→label map so the refined
            // raw shows labels (the ECharts Pro block does this automatically; a hand-written raw must too).
            const dimField = dims[0];
            const dimLabelMap = dimField ? await this.enumLabelMapOf((query.collectionPath || [])[1], dimField) : null;
            const base = (extra = '') => [
              'Code ECharts HIỆN TẠI của biểu đồ:', opt.raw || '(chưa có raw — chart đang dùng builder mặc định / ECharts Pro; hãy viết mới hoàn chỉnh theo PHONG CÁCH MẶC ĐỊNH)',
              '', `Data: \`ctx.data.objects\` = mảng row, mỗi row có key: ${dataKeys.map((k) => 'x.' + k).join(', ') || '(theo query của chart)'}.`,
              `Loại chart hiện tại: ${opt.builder?.type || '(tuỳ code)'}.`,
              ...(dimLabelMap ? [`MAP nhãn cho field phân loại "${dimField}" (mã→nhãn) — PHẢI map khi hiển thị tên/trục (dữ liệu vẫn là mã): ${JSON.stringify(dimLabelMap)}`] : []),
              '', `YÊU CẦU SỬA: ${instruction}`,
              '', 'Trả về TOÀN BỘ code mới.' + extra,
            ].join('\n');
            let human = base(); let raw = ''; let explain = ''; let lastError = '';
            for (let attempt = 0; attempt < 3 && !raw; attempt++) {
              let out = '';
              try {
                const r: any = await provider.invoke({ messages: [['system', system], ['human', human]], structuredOutput: { schema, name: 'chart', description: 'ECharts code + giải thích' } });
                const p = r && typeof r === 'object' && 'parsed' in r ? r.parsed : r;
                out = p?.raw || ''; explain = String(p?.explain || '');
              } catch { /* fall back to plain text */ }
              if (!out) { try { out = aiText(await provider.invoke({ messages: [['system', system + '\n\nTrả DUY NHẤT code JS.'], ['human', human]] })); } catch {} }
              out = stripFences(out).trim();
              if (!out || !/return/.test(out)) { lastError = 'Code không có return'; human = base('\n\nLần trước THIẾU câu return object.'); continue; }
              try { new Function('ctx', out); } catch (e: any) { lastError = 'Lỗi cú pháp: ' + e?.message; human = base('\n\nLần trước LỖI cú pháp: ' + e?.message + '. Sửa cho chạy được.'); continue; }
              raw = out;
            }
            if (!raw) { ctx.body = { ok: false, error: lastError || 'AI không sửa được code chart' }; await next(); return; }
            cfg.chart.option = { ...opt, mode: 'custom', raw };
            options.props = options.props || {}; options.props.chart = { ...(options.props.chart || {}), optionRaw: raw };
            await repo.update({ filter: { uid: chartUid }, values: { options } });
            ctx.body = { ok: true, raw, explain, prevRaw };
            await next();
            return;
          }

          // ── isHtml: CustomHtmlBlockModel — sửa customHtmlSettings.code.code (KHÔNG đụng cfg.chart) ──
          const htmlCfg = (options.stepParams.customHtmlSettings = options.stepParams.customHtmlSettings || {});
          const codeCfg = (htmlCfg.code = htmlCfg.code || {});
          const currentCode = codeCfg.code || '';
          const system = htmlRefineSystemPrompt();
          const schema = { type: 'object', properties: { code: { type: 'string', description: 'Code JS MỚI (trả về chuỗi HTML)' }, explain: { type: 'string' } }, required: ['code'] };
          const base = (extra = '') => [
            'Code JS HIỆN TẠI của thẻ:', currentCode || '(chưa có code — thẻ đang dùng mặc định; hãy viết mới hoàn chỉnh)',
            '', `Data: \`data\` = mảng row, mỗi row có key: ${dataKeys.map((k) => JSON.stringify(k)).join(', ') || '(theo query của thẻ)'}. Thường chỉ cần \`data[0]\`.`,
            '', `YÊU CẦU SỬA: ${instruction}`,
            '', 'Trả về TOÀN BỘ code JS mới (kết thúc bằng return chuỗi HTML).' + extra,
          ].join('\n');
          let human = base(); let code = ''; let explain = ''; let lastError = '';
          for (let attempt = 0; attempt < 3 && !code; attempt++) {
            let out = '';
            try {
              const r: any = await provider.invoke({ messages: [['system', system], ['human', human]], structuredOutput: { schema, name: 'html', description: 'Custom-HTML code + giải thích' } });
              const p = r && typeof r === 'object' && 'parsed' in r ? r.parsed : r;
              out = p?.code || ''; explain = String(p?.explain || '');
            } catch { /* fall back to plain text */ }
            if (!out) { try { out = aiText(await provider.invoke({ messages: [['system', system + '\n\nTrả DUY NHẤT code JS.'], ['human', human]] })); } catch {} }
            out = stripFences(out).trim();
            if (!out || !/return/.test(out)) { lastError = 'Code không có return'; human = base('\n\nLần trước THIẾU câu return chuỗi HTML.'); continue; }
            try { new Function('data', 'rows', 'helpers', 'scope', out); } catch (e: any) { lastError = 'Lỗi cú pháp: ' + e?.message; human = base('\n\nLần trước LỖI cú pháp: ' + e?.message + '. Sửa cho chạy được.'); continue; }
            code = out;
          }
          if (!code) { ctx.body = { ok: false, error: lastError || 'AI không sửa được code thẻ' }; await next(); return; }
          codeCfg.code = code;
          await repo.update({ filter: { uid: chartUid }, values: { options } });
          ctx.body = { ok: true, raw: code, explain, prevRaw: currentCode };
          await next();
        },

        // {chartUid, raw} → write a specific ECharts `raw` (Chart) or HTML `code` (Custom-HTML) straight back
        // into a block, syntax-checked, WITHOUT AI. Powers the hover overlay's one-step Undo (restore prevRaw)
        // and any "set code" path. Same write shape as aiRefineChart so behaviour is identical on reload.
        setChartRaw: async (ctx: any, next: any) => {
          const v = readVals(ctx);
          const chartUid = String(v.chartUid || '').trim();
          const raw = typeof v.raw === 'string' ? v.raw : '';
          if (!chartUid) { ctx.body = { ok: false, error: 'Thiếu chartUid' }; await next(); return; }
          const repo = this.db.getRepository('flowModels');
          const rec: any = await repo.findOne({ filter: { uid: chartUid } });
          if (!rec) { ctx.body = { ok: false, error: 'Không thấy chart: ' + chartUid }; await next(); return; }
          const options = typeof rec.options === 'string' ? JSON.parse(rec.options) : (rec.options || {});
          const isHtml = options.use === 'CustomHtmlBlockModel';
          const isChart = options.use === 'ChartBlockModel';
          if (!isHtml && !isChart) { ctx.body = { ok: false, error: 'Không phải Chart/Custom-HTML block (' + options.use + ')' }; await next(); return; }
          try { if (isChart) new Function('ctx', raw); else new Function('data', 'rows', 'helpers', 'scope', raw); }
          catch (e: any) { ctx.body = { ok: false, error: 'Lỗi cú pháp: ' + (e?.message || e) }; await next(); return; }
          if (isChart) {
            const cfg = (((options.stepParams = options.stepParams || {}).chartSettings = options.stepParams.chartSettings || {}).configure = options.stepParams.chartSettings.configure || {});
            const opt = (cfg.chart = cfg.chart || {}).option || {};
            cfg.chart.option = { ...opt, mode: 'custom', raw };
            options.props = options.props || {}; options.props.chart = { ...(options.props.chart || {}), optionRaw: raw };
          } else {
            const htmlCfg = ((options.stepParams = options.stepParams || {}).customHtmlSettings = options.stepParams.customHtmlSettings || {});
            const codeCfg = (htmlCfg.code = htmlCfg.code || {});
            codeCfg.code = raw;
          }
          await repo.update({ filter: { uid: chartUid }, values: { options } });
          ctx.body = { ok: true, raw };
          await next();
        },

        // List Chart blocks (uid + friendly label + type + collection) so the launcher can AI-refine an
        // EXISTING chart. {pageSchemaUid?} scopes to charts on ONE page (default), else the whole app.
        // Read-only. Tree = each model's `options.parentId`; walk chart → grid → tab → page uid.
        listCharts: async (ctx: any, next: any) => {
          const pageUid = String(readVals(ctx).pageSchemaUid || '').trim();
          const leaf = (f: any) => (Array.isArray(f) ? f[f.length - 1] : f);
          const rowsOf = (res: any) => (Array.isArray(res?.[0]) ? res[0] : (Array.isArray(res) ? res : []));
          // Cheap ancestry map (json_extract — no full-options parse) for page scoping.
          const parentOf: Record<string, string> = {};
          let scoped = false;
          if (pageUid) {
            try {
              rowsOf(await this.db.sequelize.query("SELECT uid, json_extract(options,'$.parentId') AS parentId FROM flowModels")).forEach((r: any) => { if (r.parentId) parentOf[r.uid] = r.parentId; });
              scoped = Object.keys(parentOf).length > 0;
            } catch { /* fall back to whole-app */ }
          }
          const underPage = (uid: string) => { let cur: any = uid; for (let i = 0; i < 16 && cur; i++) { cur = parentOf[cur]; if (cur === pageUid) return true; } return false; };
          let rows: any[] = [];
          try { rows = rowsOf(await this.db.sequelize.query("SELECT uid, options FROM flowModels WHERE options LIKE '%ChartBlockModel%' OR options LIKE '%CustomHtmlBlockModel%'")); }
          catch (e: any) { ctx.body = { ok: false, error: 'Không đọc được flowModels: ' + (e?.message || e) }; await next(); return; }
          const charts: any[] = [];
          for (const r of rows) {
            let o: any; try { o = typeof r.options === 'string' ? JSON.parse(r.options) : r.options; } catch { continue; }
            const isHtml = o?.use === 'CustomHtmlBlockModel';
            const isChart = o?.use === 'ChartBlockModel';
            if (!o || (!isChart && !isHtml)) continue;
            if (scoped && !underPage(r.uid)) continue;
            const cfg = o.stepParams?.chartSettings?.configure || {};
            const q = cfg.query || {};
            const mea = q.measures?.[0]; const dim = q.dimensions?.[0];
            const aggFallback = mea ? `${mea.aggregation || ''}(${leaf(mea.field) || ''})${dim ? ` theo ${leaf(dim.field)}` : ''}` : '';
            let title: string; let chartType: string;
            if (isHtml) {
              // Score-card label = the measure's alias (app-builder writes the KPI label there — see dashboard.tsx scoreBlock).
              title = mea?.alias || aggFallback || 'Score card';
              chartType = 'html';
            } else {
              const opt = cfg.chart?.option || {};
              const m = String(opt.raw || '').match(/title\s*:\s*\{\s*text\s*:\s*['"]([^'"]+)['"]/);
              title = (m && m[1]) || aggFallback || 'Biểu đồ';
              chartType = String(opt.builder?.type || '').replace('echarts.', '') || (/(type:\s*['"](pie|bar|line|scatter)['"])/.exec(String(opt.raw || ''))?.[2]) || 'chart';
            }
            charts.push({ uid: r.uid, title, chartType, collection: q.collectionPath?.[1] || '', blockKind: isHtml ? 'html' : 'chart' });
          }
          ctx.body = { ok: true, charts, scoped };
          await next();
        },

        // {pageSchemaUid, description} → locate the dashboard's grid + AI-design ONE widget (chart/score/
        // filter) from its collection, and return everything the CLIENT needs to build the block (reusing
        // dashboard.tsx's builders) + createModelAsync-append it + call patchGrid. Read-only here.
        aiAddWidget: async (ctx: any, next: any) => {
          const v = readVals(ctx);
          const pageUid = String(v.pageSchemaUid || '').trim();
          const instruction = String(v.description || v.instruction || '').trim();
          if (!pageUid || !instruction) { ctx.body = { ok: false, error: 'Thiếu pageSchemaUid hoặc mô tả' }; await next(); return; }
          const rowsOf = (res: any) => (Array.isArray(res?.[0]) ? res[0] : (Array.isArray(res) ? res : []));
          const parentOf: Record<string, string> = {};
          try { rowsOf(await this.db.sequelize.query("SELECT uid, json_extract(options,'$.parentId') AS parentId FROM flowModels")).forEach((r: any) => { if (r.parentId) parentOf[r.uid] = r.parentId; }); } catch {}
          const underPage = (u: string) => { let cur: any = u; for (let i = 0; i < 16 && cur; i++) { cur = parentOf[cur]; if (cur === pageUid) return true; } return false; };
          let gridUid = '';
          try { const g = rowsOf(await this.db.sequelize.query("SELECT uid FROM flowModels WHERE json_extract(options,'$.use')='BlockGridModel'")).find((x: any) => underPage(x.uid)); gridUid = g?.uid || ''; } catch {}
          if (!gridUid) { ctx.body = { ok: false, error: 'Không tìm thấy lưới (grid) của dashboard này' }; await next(); return; }
          let collName = ''; const chartUids: string[] = []; const scoreUids: string[] = []; let maxSort = 0;
          try {
            for (const r of rowsOf(await this.db.sequelize.query(`SELECT uid, options FROM flowModels WHERE options LIKE '%"parentId":"${gridUid}"%'`))) {
              let o: any; try { o = typeof r.options === 'string' ? JSON.parse(r.options) : r.options; } catch { continue; }
              if (o.parentId !== gridUid) continue;
              const s = Number(o.sortIndex) || 0; if (s > maxSort) maxSort = s;
              if (o.use === 'ChartBlockModel') chartUids.push(r.uid); else if (o.use === 'CustomHtmlBlockModel') scoreUids.push(r.uid);
              const cp = o.stepParams?.chartSettings?.configure?.query?.collectionPath; if (!collName && Array.isArray(cp) && cp[1]) collName = cp[1];
            }
          } catch {}
          if (!collName) { ctx.body = { ok: false, error: 'Không xác định được bảng dữ liệu của dashboard' }; await next(); return; }
          const collection: any = this.db.getCollection(collName);
          if (!collection) { ctx.body = { ok: false, error: 'Không thấy collection: ' + collName }; await next(); return; }
          const fields: any[] = [];
          collection.fields.forEach((f: any) => { const o = f.options || {}; if (['belongsToMany', 'hasMany', 'hasOne', 'password'].includes(o.type)) return; fields.push({ name: f.name, type: o.type, interface: o.interface, title: (o.uiSchema?.title || o.title || f.name) }); });
          const fieldNames = new Set<string>(fields.map((f) => f.name));
          const { provider, error } = await getAiProvider(this.app);
          if (error) { ctx.body = { ok: false, error }; await next(); return; }
          const system = [
            'Bạn là chuyên gia dashboard. Thiết kế ĐÚNG MỘT widget để THÊM vào dashboard có sẵn, theo yêu cầu. Trả DUY NHẤT JSON { "widget": {...} }.',
            'widget.kind ∈ "score" | "chart" | "filter":',
            '  score: {kind:"score", label, measure:{field(số/"id"), aggregation:"sum"|"count"|"avg"|"max"|"min"}, icon?, unit?, scale?}.',
            '  chart: {kind:"chart", title, chartType:"line"|"bar"|"pie", measure:{field,aggregation}, dimension:{field, format?:"YYYY-MM"}}.',
            '  filter: {kind:"filter", fields:[tên field để lọc]}.',
            'CHỈ dùng field có thật (đúng "name"). measure là field SỐ hoặc "id"+count. dimension thời gian=field ngày (+format), phân loại=select/statusFlow/quan hệ.',
          ].join('\n');
          const schema = { type: 'object', properties: { widget: { type: 'string', description: 'JSON của 1 widget' }, explain: { type: 'string' } }, required: ['widget'] };
          const base = (extra = '') => `Bảng: "${collName}"\nField: ${JSON.stringify(fields)}\nYÊU CẦU: ${instruction}\n\nTrả JSON {"widget":{...}} thuần.${extra}`;
          let human = base(); let widget: any = null; let explain = ''; let lastError = '';
          for (let attempt = 0; attempt < 3 && !widget; attempt++) {
            let raw = '';
            try { const r: any = await provider.invoke({ messages: [['system', system], ['human', human]], structuredOutput: { schema, name: 'widget', description: 'widget + giải thích' } }); const p = r && typeof r === 'object' && 'parsed' in r ? r.parsed : r; raw = p?.widget || ''; explain = String(p?.explain || ''); } catch {}
            if (!raw) { try { raw = aiText(await provider.invoke({ messages: [['system', system + '\n\nTrả DUY NHẤT JSON {"widget":{...}}.'], ['human', human]] })); } catch {} }
            raw = stripFences(raw);
            let parsed: any; try { parsed = JSON.parse(raw); } catch (e: any) { lastError = 'JSON lỗi: ' + e?.message; human = base('\n\nLần trước KHÔNG phải JSON hợp lệ.'); continue; }
            const w = parsed?.widget || parsed;
            const ok = (fn: string) => fn === 'id' || fieldNames.has(fn);
            const valid = w && (
              (w.kind === 'score' && w.measure && ok(w.measure.field)) ||
              (w.kind === 'chart' && w.measure && ok(w.measure.field) && w.dimension && ok(w.dimension.field)) ||
              (w.kind === 'filter' && Array.isArray(w.fields) && (w.fields = w.fields.filter((f: string) => fieldNames.has(f))).length)
            );
            if (valid) { widget = w; break; }
            lastError = 'Widget không hợp lệ (field không khớp)'; human = base('\n\n' + lastError + '. Chỉ dùng field có thật.');
          }
          if (!widget) { ctx.body = { ok: false, error: lastError || 'AI không thiết kế được widget' }; await next(); return; }
          ctx.body = { ok: true, widget, explain, gridUid, collection: collName, chartUids, scoreUids, nextSort: maxSort + 1 };
          await next();
        },

        // {pageSchemaUid} → the same grid/target/collection info aiAddWidget gathers, WITHOUT the AI step,
        // PLUS the collection's filterable field list — powers the launcher's MANUAL "add a filter column"
        // picker (pick field(s) + optional display-name → build a filter widget client-side + addWidget).
        dashboardFields: async (ctx: any, next: any) => {
          const pageUid = String(readVals(ctx).pageSchemaUid || '').trim();
          if (!pageUid) { ctx.body = { ok: false, error: 'Thiếu pageSchemaUid' }; await next(); return; }
          const rowsOf = (res: any) => (Array.isArray(res?.[0]) ? res[0] : (Array.isArray(res) ? res : []));
          const parentOf: Record<string, string> = {};
          try { rowsOf(await this.db.sequelize.query("SELECT uid, json_extract(options,'$.parentId') AS parentId FROM flowModels")).forEach((r: any) => { if (r.parentId) parentOf[r.uid] = r.parentId; }); } catch {}
          const underPage = (u: string) => { let cur: any = u; for (let i = 0; i < 16 && cur; i++) { cur = parentOf[cur]; if (cur === pageUid) return true; } return false; };
          let gridUid = '';
          try { const g = rowsOf(await this.db.sequelize.query("SELECT uid FROM flowModels WHERE json_extract(options,'$.use')='BlockGridModel'")).find((x: any) => underPage(x.uid)); gridUid = g?.uid || ''; } catch {}
          if (!gridUid) { ctx.body = { ok: false, error: 'Không tìm thấy lưới (grid) của dashboard này' }; await next(); return; }
          let collName = ''; const chartUids: string[] = []; const scoreUids: string[] = []; let maxSort = 0;
          try {
            for (const r of rowsOf(await this.db.sequelize.query(`SELECT uid, options FROM flowModels WHERE options LIKE '%"parentId":"${gridUid}"%'`))) {
              let o: any; try { o = typeof r.options === 'string' ? JSON.parse(r.options) : r.options; } catch { continue; }
              if (o.parentId !== gridUid) continue;
              const s = Number(o.sortIndex) || 0; if (s > maxSort) maxSort = s;
              if (o.use === 'ChartBlockModel') chartUids.push(r.uid); else if (o.use === 'CustomHtmlBlockModel') scoreUids.push(r.uid);
              const cp = o.stepParams?.chartSettings?.configure?.query?.collectionPath; if (!collName && Array.isArray(cp) && cp[1]) collName = cp[1];
            }
          } catch {}
          if (!collName) { ctx.body = { ok: false, error: 'Không xác định được bảng dữ liệu của dashboard' }; await next(); return; }
          const collection: any = this.db.getCollection(collName);
          if (!collection) { ctx.body = { ok: false, error: 'Không thấy collection: ' + collName }; await next(); return; }
          const stripT = (s: any) => String(s == null ? '' : s).replace(/\{\{\s*t\(["']([^"']+)["']\)\s*\}\}/, '$1');
          const fields: any[] = [];
          // Filterable fields only: skip to-many / password (same exclusion aiAddWidget uses); m2o (belongsTo)
          // stays — it's a valid relation filter.
          collection.fields.forEach((f: any) => { const o = f.options || {}; if (['belongsToMany', 'hasMany', 'hasOne', 'password'].includes(o.type)) return; fields.push({ name: f.name, type: o.type, interface: o.interface, title: stripT(o.uiSchema?.title || o.title || f.name) }); });
          ctx.body = { ok: true, gridUid, collection: collName, chartUids, scoreUids, nextSort: maxSort + 1, fields };
          await next();
        },

        // {gridUid, layoutRow, filterManagerEntries?} → append the row to the grid's layout (both props +
        // stepParams copies) and merge any filter-manager fan-out entries. The widget model itself is created
        // client-side via createModelAsync (so filter subtrees + client-only field bindings are built there).
        patchGrid: async (ctx: any, next: any) => {
          const v = readVals(ctx);
          const gridUid = String(v.gridUid || '').trim();
          const layoutRow = v.layoutRow;
          const fmEntries = Array.isArray(v.filterManagerEntries) ? v.filterManagerEntries : [];
          if (!gridUid || !layoutRow) { ctx.body = { ok: false, error: 'Thiếu gridUid hoặc layoutRow' }; await next(); return; }
          const repo = this.db.getRepository('flowModels');
          const rec: any = await repo.findOne({ filter: { uid: gridUid } });
          if (!rec) { ctx.body = { ok: false, error: 'Không thấy grid: ' + gridUid }; await next(); return; }
          const options = typeof rec.options === 'string' ? JSON.parse(rec.options) : (rec.options || {});
          const pushRow = (lay: any) => { if (lay && Array.isArray(lay.rows)) lay.rows.push(layoutRow); };
          pushRow(((options.props = options.props || {}).layout = options.props.layout || { version: 2, rows: [] }));
          const cfgLay = ((((options.stepParams = options.stepParams || {}).gridSettings = options.stepParams.gridSettings || {}).grid = options.stepParams.gridSettings.grid || {}).layout = options.stepParams.gridSettings.grid.layout || { version: 2, rows: [] });
          pushRow(cfgLay);
          if (fmEntries.length) options.filterManager = [...(Array.isArray(options.filterManager) ? options.filterManager : []), ...fmEntries];
          await repo.update({ filter: { uid: gridUid }, values: { options } });
          ctx.body = { ok: true };
          await next();
        },

        // {instruction} → AGENTIC: AI lập plan gọi các primitive (dùng trạng thái hiện tại làm "mắt").
        // KHÔNG chạy — trả steps để client preview + execute (data→server tool, page→flowEngine).
        aiPlan: async (ctx: any, next: any) => {
          const instruction = String(readVals(ctx).instruction || readVals(ctx).description || '').trim();
          if (!instruction) { ctx.body = { ok: false, error: 'Thiếu yêu cầu' }; await next(); return; }
          const { provider, error } = await getAiProvider(this.app);
          if (error) { ctx.body = { ok: false, error }; await next(); return; }
          // compact live state (the AI's "eyes"): collection names + fields; names-only if too big.
          let stateStr = '';
          try {
            const d = await this.opDescribe();
            const lines = (d.collections || []).map((c: any) => `- ${c.name}${c.title ? ` (${c.title})` : ''} [${(c.fields || []).map((f: any) => `${f.name}:${f.interface}${f.target ? `→${f.target}` : ''}`).join(', ')}]`);
            let s = lines.join('\n');
            if (s.length > 6000) s = (d.collections || []).map((c: any) => c.name).join(', ');
            stateStr = s;
          } catch { /* no state */ }
          const system = toolPlanSystemPrompt(stateStr);
          const schema = { type: 'object', properties: { steps: { type: 'string', description: 'Mảng JSON các bước [{"tool","args"}]' }, explain: { type: 'string', description: 'Giải thích ngắn tiếng Việt' } }, required: ['steps'] };
          const KNOWN = new Set(['createCollection', 'addField', 'addRelation', 'addComputed', 'addStatusFlow', 'seed', 'createMenuGroup', 'createPage', 'dropField', 'dropCollection', 'renameField']);
          let human = `Yêu cầu: ${instruction}\n\nLập kế hoạch tool (JSON).`;
          let steps: any = null; let explain = ''; let lastError = '';
          for (let attempt = 0; attempt < 3 && !steps; attempt++) {
            let raw = '';
            try {
              const result: any = await provider.invoke({ messages: [['system', system], ['human', human]], structuredOutput: { schema, name: 'plan', description: 'Kế hoạch tool' } });
              const parsed = result && typeof result === 'object' && 'parsed' in result ? result.parsed : result;
              raw = parsed?.steps || ''; explain = String(parsed?.explain || '');
            } catch { /* plain-text fallback */ }
            if (!raw) { try { raw = aiText(await provider.invoke({ messages: [['system', system + '\n\nTrả DUY NHẤT JSON {"steps":[...]}'], ['human', human]] })); } catch {} }
            raw = stripFences(raw);
            let parsed: any;
            try { parsed = JSON.parse(raw); } catch (e: any) { lastError = 'JSON lỗi: ' + e?.message; human += '\n\nLần trước KHÔNG phải JSON. Trả JSON thuần.'; continue; }
            const arr = Array.isArray(parsed) ? parsed : parsed?.steps;
            if (!Array.isArray(arr) || !arr.length) { lastError = 'Không có steps'; human += '\n\nTrả mảng "steps" không rỗng.'; continue; }
            const bad = arr.find((s: any) => !KNOWN.has(s?.tool));
            if (bad) { lastError = 'Tool lạ: ' + bad?.tool; human += `\n\nBước dùng tool KHÔNG hợp lệ ("${bad?.tool}"). CHỈ dùng tool trong danh sách.`; continue; }
            steps = arr;
          }
          if (!steps) { ctx.body = { ok: false, error: lastError || 'AI không lập được plan' }; await next(); return; }
          ctx.body = { ok: true, steps, explain };
          await next();
        },

        // ── DELETE / MODIFY tools (complete the "modify" story; guardrailed) ──
        // {collection, field}
        dropField: async (ctx: any, next: any) => { const v = readVals(ctx); ctx.body = await this.opDropField(v.collection, v.field); await next(); },
        // {collection}
        dropCollection: async (ctx: any, next: any) => { ctx.body = await this.opDropCollection(readVals(ctx).collection); await next(); },
        // {collection, field, title}
        renameField: async (ctx: any, next: any) => { const v = readVals(ctx); ctx.body = await this.opRenameField(v.collection, v.field, v.title); await next(); },
      },
    });
    this.app.acl.allow('appBuilder', ['dryRun', 'apply', 'createCollection', 'addField', 'addRelation', 'addComputed', 'addComputedBatch', 'importSheet', 'setComputedEnabled', 'recomputeAll', 'addStatusFlow', 'seed', 'describeApp', 'aiGenerate', 'aiRefine', 'aiDashboard', 'aiRefineChart', 'setChartRaw', 'listCharts', 'aiAddWidget', 'dashboardFields', 'patchGrid', 'aiPlan', 'dropField', 'dropCollection', 'renameField'], 'loggedIn');
  }
}

export default PluginAppBuilderServer;
