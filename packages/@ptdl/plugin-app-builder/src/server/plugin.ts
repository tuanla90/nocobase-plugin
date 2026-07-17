/**
 * App Builder — server. Owns the DATA tier of the compiler: turning an App-Spec's collections + fields
 * (relations + seed next, P1) into real NocoBase collections. Collections must be created via the
 * collection-manager repository WITH a `context` so its hooks migrate the physical table — the same path
 * @ptdl/plugin-gsheet-sync uses (`ensureTargetCollection`). The PAGE tier (routes + flowModels) is built
 * client-side (see ../client-v2), because pages only exist as client flowModels.
 *
 * Actions (ACL loggedIn):
 *   POST /api/appBuilder:dryRun  { spec }  → { ok, errors[], warnings[] }   (validate, no writes)
 *   POST /api/appBuilder:apply   { spec }  → { ok, created[] }             (create collections + fields)
 */
import { Plugin } from '@nocobase/server';
import { AppSpec, CollectionSpec, FieldSpec, normalizeOptions, RelationSpec, validateAppSpec, ValidationIssue } from '../shared/appSpec';

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
      // Real @ptdl/plugin-status-flow field: interface 'statusFlow' + a `statusFlow` config that folds
      // into options (server hooks enforce transitions by reading options.statusFlow). Derive a sequential
      // flow from `states`: first = init, last = success, middle = processing; each → the next.
      const states = f.states || [];
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
 * Map a RelationSpec → a NocoBase relation field def (created on `sourceColl` via the fields repo with
 * `context:{}`). FK naming is deterministic so a m2o and its declared o2m reverse share ONE foreign key:
 *   m2o `x` → belongsTo, FK `${x}Id` on this collection.
 *   o2m `x` (reverseName `y`) → hasMany, FK `${y}Id` on the target (pairs with the m2o named `y`);
 *              without reverseName, FK `${sourceColl}Id`.
 * Shapes verified against live user-created relations (demo_item.order = belongsTo FK order_id, etc.).
 */
export function relationDef(sourceColl: string, r: RelationSpec): any {
  const uiSchema: any = { title: r.title || r.name, 'x-component': 'AssociationField' };
  const base: any = { collectionName: sourceColl, name: r.name, target: r.target, uiSchema };
  switch (r.type) {
    case 'm2o':
      return { ...base, type: 'belongsTo', interface: 'm2o', foreignKey: `${r.name}Id`, targetKey: 'id',
        uiSchema: { ...uiSchema, 'x-component-props': { multiple: false } } };
    case 'o2o':
      return { ...base, type: 'belongsTo', interface: 'obo', foreignKey: `${r.name}Id`, targetKey: 'id',
        uiSchema: { ...uiSchema, 'x-component-props': { multiple: false } } };
    case 'o2m':
      return { ...base, type: 'hasMany', interface: 'o2m', foreignKey: `${r.reverseName || sourceColl}Id`,
        sourceKey: 'id', targetKey: 'id', uiSchema: { ...uiSchema, 'x-component-props': { multiple: true } } };
    case 'm2m':
      return { ...base, type: 'belongsToMany', interface: 'm2m', through: r.through || `t_${sourceColl}_${r.target}`,
        foreignKey: `${sourceColl}Id`, otherKey: `${r.target}Id`, sourceKey: 'id', targetKey: 'id',
        uiSchema: { ...uiSchema, 'x-component-props': { multiple: true } } };
    default:
      return { ...base, type: 'belongsTo', interface: 'm2o', foreignKey: `${r.name}Id`, targetKey: 'id' };
  }
}

/** Order relation types so paired FKs exist before the side that reuses them: m2o/o2o/m2m first, o2m last. */
const RELATION_ORDER: Record<string, number> = { m2o: 0, o2o: 0, m2m: 1, o2m: 2 };

// ── AI (NocoBase @nocobase/plugin-ai) ─────────────────────────────────────────────────────────────
/** Resolve the app's configured LLM provider (same path formula/ai-column use). Inlined so app-builder
 *  stays self-contained (no @ptdl/shared runtime dep). */
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

/** System prompt: the App-Spec shape + the @ptdl vocabulary + rules, so the LLM emits a valid spec. */
function appSpecSystemPrompt(): string {
  return [
    'Bạn là trợ lý dựng app NocoBase. Từ MÔ TẢ tiếng Việt của người dùng, sinh MỘT App-Spec JSON hợp lệ.',
    '',
    'App-Spec = { "meta": {"name","locale":"vi"}, "collections": [...], "pages": [...], "menu": {"groups": [...]} }.',
    'collection = { "name" (machine, ^[a-z][a-z0-9_]*), "title" (vi có dấu), "titleField", "fields": [...], "relations": [...], "seed": [...] }.',
    'field = { "name", "title", "interface", "options"?, "required"?, "widget"?, "computed"?, "states"? }.',
    '  interface ∈ input, textarea, markdown, phone, email, url, number, integer, percent, select, multipleSelect, checkbox, date, datetime, time, color, json, statusFlow.',
    '  select/multipleSelect PHẢI có "options": ["A","B"]. statusFlow PHẢI có "states": ["Mới","Xong"]. computed = {"expression":"data.qty * data.price"} (cú pháp data.<field>, SUM(data.rel.field) cho rollup).',
    '  widget (tùy chọn, cho đẹp): "Progress bar","Star rating","Value tag","Rich select","Input icon","Sub-table Pro".',
    'relation = { "name", "type": "m2o"|"o2m"|"o2o"|"m2m", "target" (tên collection khác), "reverseName"? }.',
    'page = { "title", "collection", "menuGroup"?, "icon"? ("lucide-users"…), "block"? ("TableBlockModel"|"EnhancedTableBlockModel"), "columns": [tên field], "popupColumns"? }.',
    '',
    'QUY TẮC:',
    '- name của collection/field = KHÔNG DẤU, snake_case (vd "khach_hang", "ngay_dat"); title = tiếng Việt có dấu.',
    '- Mỗi collection có titleField = 1 field string chính (vd "ten", "ma").',
    '- Đơn có dòng chi tiết: khai o2m ở bảng cha (reverseName = tên m2o ở bảng con) + m2o ở bảng con; cột computed line-total dùng data.<field>.',
    '- Seed 2-3 dòng demo mỗi collection; giá trị quan hệ m2o = giá trị titleField của bản ghi target.',
    '- Mỗi collection nên có 1 page; nhóm menu hợp lý (Danh mục / Vận hành…).',
    '- CHỈ trả JSON App-Spec, không markdown, không giải thích ngoài trường "explain".',
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

export class PluginAppBuilderServer extends Plugin {
  // ── PRIMITIVES ──────────────────────────────────────────────────────────────────────────────────
  // Each op is a self-contained, idempotent building block. `apply` orchestrates them for a whole spec,
  // and each is ALSO exposed as its own action (below) so an AI / script / UI can call them step-by-step.

  /** Create one collection + its fields (scalar / select / status-flow / computed-as-number-column).
   *  Does NOT create computed RULES here — those run AFTER relations so roll-ups can reference them.
   *  Idempotent: an existing collection is skipped. */
  private async opCreateCollection(c: CollectionSpec): Promise<any> {
    const colRepo: any = this.db.getRepository('collections');
    if (!colRepo) throw new Error('collection-manager (collections repo) không có');
    if (await colRepo.findOne({ filter: { name: c.name } })) return { name: c.name, skipped: 'exists' };
    const fields = (c.fields || []).map(fieldDef);
    await colRepo.create({
      values: {
        name: c.name, title: c.title || c.name, ...(c.titleField ? { titleField: c.titleField } : {}),
        autoGenId: true, createdAt: true, updatedAt: true, sortable: true, logging: true, fields,
      },
      context: {}, // run collection-manager hooks → migrate the physical table
    });
    try { await (this.db.getCollection(c.name) as any)?.sync?.({ alter: true }); } catch {}
    return { name: c.name, fields: fields.length };
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

  /** Create @ptdl/plugin-formula computed-column rules (`ptdlComputedRules`); local/sibling first,
   *  roll-ups (SUM over a relation) last so their dependencies compute first. */
  private async opAddComputedRules(coll: string, fields: FieldSpec[]): Promise<any[]> {
    if (!fields.length) return [];
    const ruleRepo: any = this.db.getRepository('ptdlComputedRules');
    if (!ruleRepo) return [{ skipped: 'plugin-formula (ptdlComputedRules) chưa cài' }];
    const isRollup = (e: string) => /\b(SUM|COUNT|AVG|MIN|MAX)\s*\(\s*data\./i.test(e);
    const sorted = [...fields].sort((a, b) => Number(isRollup(a.computed!.expression)) - Number(isRollup(b.computed!.expression)));
    const out: any[] = [];
    for (const f of sorted) {
      try { await (this.db.getCollection(coll) as any)?.sync?.({ alter: true }); } catch {}
      if (await ruleRepo.findOne({ filter: { collectionName: coll, targetField: f.name } })) { out.push({ field: f.name, skipped: 'exists' }); continue; }
      await ruleRepo.create({
        values: { dataSourceKey: 'main', collectionName: coll, targetField: f.name, formula: f.computed!.expression, runOn: 'create,update,source', enabled: true, onError: 'null' },
        context: {},
      });
      out.push({ field: f.name, formula: f.computed!.expression });
    }
    return out;
  }

  /** Create one relation field on `coll`. Idempotent. (Both endpoint collections must already exist.) */
  private async opAddRelation(coll: string, r: RelationSpec): Promise<any> {
    const fieldRepo: any = this.db.getRepository('fields');
    if (await fieldRepo.findOne({ filter: { collectionName: coll, name: r.name } })) return { coll, name: r.name, skipped: 'exists' };
    const def = relationDef(coll, r);
    await fieldRepo.create({ values: def, context: {} });
    return { coll, name: r.name, type: r.type, foreignKey: def.foreignKey };
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
          if (id != null) values[rel.foreignKey || rel.options?.foreignKey || `${rel.name}Id`] = id;
        } else if (!rel) {
          values[k] = v;
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
            for (const c of spec.collections || []) { const r = await this.opCreateCollection(c); if (!r.skipped) created.push(c.name); report.collections.push(r); }
            const rels: Array<{ coll: string; r: RelationSpec }> = [];
            for (const c of spec.collections || []) for (const r of c.relations || []) rels.push({ coll: c.name, r });
            rels.sort((a, b) => (RELATION_ORDER[a.r.type] ?? 9) - (RELATION_ORDER[b.r.type] ?? 9));
            for (const { coll, r } of rels) report.relations.push(await this.opAddRelation(coll, r));
            for (const name of created) { try { await (this.db.getCollection(name) as any)?.sync?.({ alter: true }); } catch {} }
            for (const c of spec.collections || []) { const cf = (c.fields || []).filter((f) => f.computed?.expression); if (cf.length) (await this.opAddComputedRules(c.name, cf)).forEach((x) => report.computed.push({ coll: c.name, ...x })); }
            for (const c of spec.collections || []) { if (c.seed?.length) report.seeded.push(await this.opSeed(c.name, c.seed)); }
            ctx.body = { ok: true, ...report, note: 'Data tier xong (collections + relations + computed + seed). Trang = client tier.' };
          } catch (e: any) {
            for (const name of [...created].reverse()) { try { await colRepo.destroy({ filter: { name } }); } catch {} }
            ctx.body = { ok: false, phase: 'apply', error: e?.message || String(e), rolledBack: created };
          }
          await next();
        },

        // ── GRANULAR TOOLS (step-by-step / AI tool-calling) ──
        // POST /api/appBuilder:createCollection {name,title,titleField,fields:[FieldSpec]}
        createCollection: async (ctx: any, next: any) => { ctx.body = await this.opCreateCollection(readVals(ctx) as CollectionSpec); await next(); },
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
        // {collection, field:{name,title,states:[...]}}  → a real @ptdl status-flow field
        addStatusFlow: async (ctx: any, next: any) => {
          const v = readVals(ctx); const f = v.field || v;
          ctx.body = await this.opAddField(v.collection, { name: f.name, title: f.title, interface: 'statusFlow', states: f.states });
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
      },
    });
    this.app.acl.allow('appBuilder', ['dryRun', 'apply', 'createCollection', 'addField', 'addRelation', 'addComputed', 'addStatusFlow', 'seed', 'describeApp', 'aiGenerate'], 'loggedIn');
  }
}

export default PluginAppBuilderServer;
