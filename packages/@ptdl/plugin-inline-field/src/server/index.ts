import { Plugin } from '@nocobase/server';
import { buildFieldDef, relationDef, attachmentDef, fkOf, RELATION_INTERFACES, slugify, InlineFieldSpec } from '../shared/fieldTypes';

/**
 * Inline Field — server. ONE action: `ptdlInlineField:createField { collection, field }` — creates a
 * scalar, computed (formula) OR relation (m2o/o2m/m2m) field on an existing collection AND migrates the
 * physical column, so the /v/ client can add it to the table being edited without a trip to the
 * Collection Manager. Computed → a @ptdl/plugin-formula rule; o2m → a reverse belongsTo on the child.
 *
 * Mechanism mirrors app-builder's `opAddField` (the proven path): write a `fields` metadata record via
 * the collection-manager repository WITH a `context` (so its hooks run), then `collection.sync({alter})`
 * to add the real DB column. The sync is AWAITED before the response returns, so a client
 * `dataSourceManager.reload()` immediately afterwards sees the new field (no table-sync lag window).
 *
 * Machine name: auto-slugged from the Vietnamese title when the caller omits it, then uniquified against
 * the collection's existing field names (append `_2`, `_3`, …) so two "Ghi chú" columns never collide.
 *
 * ACL: `loggedIn` — matches @ptdl/plugin-app-builder and @ptdl/plugin-field-order (the entry point itself
 * lives in the block's ⚙ config menu, which is already admin-gated by NocoBase's UI-config permission).
 * Tighten to an explicit admin role if you expose field creation to non-admins.
 */
export class PluginInlineFieldServer extends Plugin {
  async load() {
    const db: any = this.db;

    this.app.resourcer.define({
      name: 'ptdlInlineField',
      actions: {
        createField: async (ctx: any, next: any) => {
          const v = ctx.action?.params?.values || {};
          const collectionName = String(v.collection || '').trim();
          const field: InlineFieldSpec = v.field || {};
          if (!collectionName || !field || !String(field.title || '').trim()) {
            ctx.throw(400, 'collection and field.title are required');
            return;
          }
          if (!field.interface) {
            ctx.throw(400, 'field.interface is required');
            return;
          }
          if (field.interface === 'computed' && !String((field as any).expression || '').trim()) {
            ctx.throw(400, 'field.expression is required for a computed field');
            return;
          }
          const isRelation = RELATION_INTERFACES.includes(field.interface);
          const isAttachment = field.interface === 'attachment';
          if (isRelation && !String((field as any).target || '').trim()) {
            ctx.throw(400, 'field.target (linked collection) is required for a relation');
            return;
          }
          const collection = db.getCollection(collectionName);
          if (!collection) {
            ctx.throw(404, `collection "${collectionName}" not found`);
            return;
          }
          if (isRelation && !db.getCollection(String(field.target))) {
            ctx.throw(404, `linked collection "${field.target}" not found`);
            return;
          }
          if (isAttachment && !db.getCollection('attachments')) {
            ctx.throw(404, 'attachments collection unavailable — the File manager plugin must be enabled');
            return;
          }

          const fieldRepo: any = db.getRepository('fields');
          if (!fieldRepo) {
            ctx.throw(500, 'collection-manager (fields repo) unavailable');
            return;
          }

          // Machine name: caller-supplied or slugged from the title, then uniquified.
          const existing: any[] = await fieldRepo.find({ filter: { collectionName } });
          const taken = new Set(existing.map((f: any) => (f.get ? f.get('name') : f.name)));
          let name = String(field.name || slugify(field.title)).trim() || slugify(field.title);
          if (taken.has(name)) {
            let i = 2;
            while (taken.has(`${name}_${i}`)) i++;
            name = `${name}_${i}`;
          }

          // Relation (m2o/o2m/m2m) → relationDef; attachment → attachmentDef; else scalar/computed/statusFlow → buildFieldDef.
          const values = isRelation
            ? relationDef(collectionName, { ...field, name })
            : isAttachment
              ? attachmentDef(collectionName, { ...field, name })
              : { ...buildFieldDef({ ...field, name }), collectionName };
          await fieldRepo.create({ values, context: {} });
          // Migrate the physical column(s) (awaited — the client reload right after sees the field).
          try {
            await (db.getCollection(collectionName) as any)?.sync?.({ alter: true });
          } catch (e) {
            this.app.logger?.warn?.(`[inline-field] sync failed for ${collectionName}.${name}: ${(e as any)?.message}`);
          }

          // An o2m parent-declared relation: give the child a belongsTo back to the parent (bidirectional,
          // sharing the SAME foreign key) — mirrors app-builder's ensureReverseBelongsTo.
          let paired: any;
          if (field.interface === 'o2m') {
            const childColl = String(field.target);
            const revName = String(field.reverseName || collectionName);
            const revFk = (values as any).foreignKey; // = fkOf(reverseName || collectionName)
            const revExists = await fieldRepo.findOne({ filter: { collectionName: childColl, name: revName } });
            if (!revExists) {
              let parentTitle = collectionName;
              try {
                const c = await db.getRepository('collections').findOne({ filter: { name: collectionName } });
                const raw = c && (c.get ? c.get('title') : c.title);
                if (raw) parentTitle = String(raw).replace(/\{\{\s*t\(["']([^"']+)["']\)\s*\}\}/, '$1');
              } catch { /* best-effort */ }
              try {
                await fieldRepo.create({
                  values: {
                    collectionName: childColl, name: revName, type: 'belongsTo', interface: 'm2o',
                    target: collectionName, foreignKey: revFk, targetKey: 'id',
                    uiSchema: { title: parentTitle, 'x-component': 'AssociationField', 'x-component-props': { multiple: false } },
                  },
                  context: {},
                });
                try { await (db.getCollection(childColl) as any)?.sync?.({ alter: true }); } catch { /* best-effort */ }
                paired = { collection: childColl, name: revName };
              } catch (e) {
                this.app.logger?.warn?.(`[inline-field] reverse belongsTo failed: ${(e as any)?.message}`);
              }
            }
          }

          // Computed field → materialize a @ptdl/plugin-formula rule (recomputes on create/update/source).
          // Same shape app-builder's opAddComputedRules writes. No-op (with a flag) if formula isn't installed.
          let computed: boolean | undefined;
          let computedSkipped: string | undefined;
          if (field.interface === 'computed') {
            const ruleRepo: any = db.getRepository('ptdlComputedRules');
            if (!ruleRepo) {
              computedSkipped = 'plugin-formula (ptdlComputedRules) not installed';
            } else {
              const exists = await ruleRepo.findOne({ filter: { collectionName, targetField: name } });
              if (!exists) {
                await ruleRepo.create({
                  values: {
                    dataSourceKey: 'main', collectionName, targetField: name,
                    formula: String((field as any).expression || ''), runOn: 'create,update,source',
                    enabled: true, onError: 'null',
                  },
                  context: {},
                });
              }
              computed = true;
            }
          }

          ctx.body = { ok: true, name, interface: field.interface, collection: collectionName, ...(isRelation ? { target: field.target } : {}), ...(paired ? { paired } : {}), ...(computed ? { computed } : {}), ...(computedSkipped ? { computedSkipped } : {}) };
          await next();
        },
      },
    });

    this.app.acl.allow('ptdlInlineField', 'createField', 'loggedIn');
  }
}

export default PluginInlineFieldServer;
