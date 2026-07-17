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
import { AppSpec, FieldSpec, normalizeOptions, RelationSpec, validateAppSpec, ValidationIssue } from '../shared/appSpec';

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

export class PluginAppBuilderServer extends Plugin {
  async load() {
    this.app.resourceManager.define({
      name: 'appBuilder',
      actions: {
        // Validate a spec without writing anything: the structural half (validateAppSpec) plus a live
        // check for collection-name collisions against the running DB.
        dryRun: async (ctx: any, next: any) => {
          const spec = readSpec(ctx);
          const result = validateAppSpec(spec);
          const errors: ValidationIssue[] = [...result.errors];
          const warnings: ValidationIssue[] = [...result.warnings];
          try {
            const colRepo: any = this.db.getRepository('collections');
            for (const c of spec.collections || []) {
              const existing = await colRepo.findOne({ filter: { name: c.name } });
              if (existing) {
                warnings.push({ level: 'warning', path: 'collections', message: `Collection "${c.name}" đã tồn tại — apply sẽ bỏ qua` });
              }
            }
          } catch {
            /* live check best-effort — structural validation still stands */
          }
          ctx.body = { ok: errors.length === 0, errors, warnings };
          await next();
        },

        // Create the DATA tier of an app: collections + scalar fields (phase 1), relations (phase 2),
        // seed rows (phase 3). The PAGE tier (routes + flowModels) is built client-side. Idempotent:
        // existing collections/fields are skipped. On error mid-run, best-effort rollback drops the
        // collections THIS call created (reverse order).
        apply: async (ctx: any, next: any) => {
          const spec = readSpec(ctx);
          const result = validateAppSpec(spec);
          if (!result.ok) {
            ctx.body = { ok: false, phase: 'validate', errors: result.errors, warnings: result.warnings };
            await next();
            return;
          }
          const colRepo: any = this.db.getRepository('collections');
          const fieldRepo: any = this.db.getRepository('fields');
          if (!colRepo || !fieldRepo) throw new Error('Không tìm thấy collection-manager (collections/fields repo)');

          const createdCollections: string[] = [];
          const report: any = { collections: [], relations: [], computed: [], seeded: [] };
          try {
            // ── phase 1: collections + scalar fields ──
            for (const c of spec.collections || []) {
              const existing = await colRepo.findOne({ filter: { name: c.name } });
              if (existing) { report.collections.push({ name: c.name, skipped: 'exists' }); continue; }
              const fields = (c.fields || []).map(fieldDef);
              await colRepo.create({
                values: {
                  name: c.name, title: c.title || c.name,
                  ...(c.titleField ? { titleField: c.titleField } : {}),
                  autoGenId: true, createdAt: true, updatedAt: true, sortable: true, logging: true, fields,
                },
                context: {}, // run collection-manager hooks → migrate the physical table
              });
              try { await (this.db.getCollection(c.name) as any)?.sync?.({ alter: true }); } catch {}
              createdCollections.push(c.name);
              report.collections.push({ name: c.name, fields: fields.length });
            }

            // ── phase 2: relations (both endpoints exist now; m2o/m2m before o2m so shared FKs pre-exist) ──
            const rels: Array<{ coll: string; r: RelationSpec }> = [];
            for (const c of spec.collections || []) for (const r of c.relations || []) rels.push({ coll: c.name, r });
            rels.sort((a, b) => (RELATION_ORDER[a.r.type] ?? 9) - (RELATION_ORDER[b.r.type] ?? 9));
            for (const { coll, r } of rels) {
              const exists = await fieldRepo.findOne({ filter: { collectionName: coll, name: r.name } });
              if (exists) { report.relations.push({ coll, name: r.name, skipped: 'exists' }); continue; }
              const def = relationDef(coll, r);
              await fieldRepo.create({ values: def, context: {} });
              report.relations.push({ coll, name: r.name, type: r.type, foreignKey: def.foreignKey });
            }
            for (const name of createdCollections) { try { await (this.db.getCollection(name) as any)?.sync?.({ alter: true }); } catch {} }

            // ── phase 2.5: computed-column rules (via @ptdl/plugin-formula's ptdlComputedRules) ──
            // A computed field is a real number column (created in phase 1) PLUS a rule row that holds the
            // expression; the formula plugin's rule-afterSave hook attaches compute hooks + backfills. Create
            // local (sibling) rules before rollups (SUM over a relation) so dependencies compute first.
            const ruleRepo: any = this.db.getRepository('ptdlComputedRules');
            const computedFields: Array<{ coll: string; f: FieldSpec }> = [];
            for (const c of spec.collections || []) for (const f of c.fields || []) if (f.computed?.expression) computedFields.push({ coll: c.name, f });
            if (computedFields.length && !ruleRepo) {
              report.computed.push({ skipped: 'plugin-formula (ptdlComputedRules) not installed' });
            } else if (ruleRepo) {
              const isRollup = (e: string) => /\b(SUM|COUNT|AVG|MIN|MAX)\s*\(\s*data\./i.test(e);
              computedFields.sort((a, b) => Number(isRollup(a.f.computed!.expression)) - Number(isRollup(b.f.computed!.expression)));
              for (const { coll, f } of computedFields) {
                try { await (this.db.getCollection(coll) as any)?.sync?.({ alter: true }); } catch {}
                const existsRule = await ruleRepo.findOne({ filter: { collectionName: coll, targetField: f.name } });
                if (existsRule) { report.computed.push({ coll, field: f.name, skipped: 'exists' }); continue; }
                await ruleRepo.create({
                  values: {
                    dataSourceKey: 'main', collectionName: coll, targetField: f.name,
                    formula: f.computed!.expression, runOn: 'create,update,source', enabled: true, onError: 'null',
                  },
                  context: {},
                });
                report.computed.push({ coll, field: f.name, formula: f.computed!.expression });
              }
            }

            // ── phase 3: seed rows (scalars + m2o resolved by the target's titleField) ──
            for (const c of spec.collections || []) {
              if (!c.seed || !c.seed.length) continue;
              const repo: any = this.db.getRepository(c.name);
              if (!repo) continue;
              const relByName = new Map((c.relations || []).map((r) => [r.name, r]));
              let n = 0;
              for (const row of c.seed) {
                const values: any = {};
                for (const [k, v] of Object.entries(row)) {
                  const rel = relByName.get(k);
                  if (!rel) { values[k] = v; continue; }
                  if (rel.type === 'm2o' && typeof v === 'string') {
                    const tSpec = (spec.collections || []).find((x) => x.name === rel.target);
                    const tTitle = tSpec?.titleField || 'id';
                    const tRepo: any = this.db.getRepository(rel.target);
                    const hit = tRepo && (await tRepo.findOne({ filter: { [tTitle]: v } }));
                    const id = hit && (hit.get ? hit.get('id') : hit.id);
                    if (id != null) values[`${rel.name}Id`] = id;
                  }
                  // o2m / m2m seed values are set from the other side — skip here
                }
                try { await repo.create({ values }); n++; } catch { /* skip a bad seed row */ }
              }
              report.seeded.push({ coll: c.name, rows: n });
            }

            ctx.body = { ok: true, ...report, note: 'Data tier xong (collections + relations + seed). Trang = client tier.' };
          } catch (e: any) {
            for (const name of [...createdCollections].reverse()) {
              try { await colRepo.destroy({ filter: { name } }); } catch {}
            }
            ctx.body = { ok: false, phase: 'apply', error: e?.message || String(e), rolledBack: createdCollections };
          }
          await next();
        },
      },
    });
    this.app.acl.allow('appBuilder', ['dryRun', 'apply'], 'loggedIn');
  }
}

export default PluginAppBuilderServer;
