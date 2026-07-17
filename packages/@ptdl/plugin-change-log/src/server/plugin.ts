import { Plugin } from '@nocobase/server';
import path from 'path';
import { ChangeSource, SOURCE_HEADER, ValueMeta } from '../shared/types';

type AnyObj = Record<string, any>;

const OWN_COLLECTIONS = new Set(['ptdlChangeLogs', 'ptdlChangeLogConfigs']);

interface Cfg {
  collectionName: string;
  enabled: boolean;
  triggerFields: string[];
  snapshotFields: string[];
  captureNote: boolean;
}

// The change-log authority. Every create/update that fires model hooks — form save, quick edit,
// bulk-per-row, AND direct API calls — is logged here (unlike an enforcement hook, logging never
// skips the API/internal path). Best-effort: a logging failure is swallowed so it can never block
// the business write.
export class PluginChangeLogServer extends Plugin {
  private configs: Map<string, Cfg> = new Map();

  async load() {
    const db: any = this.db;

    await db.import({ directory: path.resolve(__dirname, 'collections') });

    this.app.resourcer.define({ name: 'ptdlChangeLogs', only: ['list', 'get'] });
    this.app.resourcer.define({ name: 'ptdlChangeLogConfigs' });
    // Signed-in users may reach the endpoint; the per-collection gate below narrows it. Writing
    // entries is done by the hooks, not the API.
    this.app.acl.allow('ptdlChangeLogs', ['list', 'get'], 'loggedIn');

    // SECURITY (v0.1.2): gate history reads by the SOURCE-collection permission. Previously any
    // signed-in user could read the change history of ANY collection over the API. The timeline,
    // badge and block all query with a flat `filter.collectionName`, so we check the caller can
    // `view`/`list` that collection (strategy-aware → root & admin pass automatically). It is
    // deliberately FAIL-OPEN on uncertainty (no collectionName, unknown collection, ACL lookup
    // error, no role resolved) so it can never break the working timeline for the primary/root
    // user — it only blocks a NON-root role from reading a collection it cannot otherwise see.
    // ⚠️ Verify with a real restricted role before relying on it (see README / KNOWN ISSUES).
    this.app.resourcer.use(
      async (ctx: any, next: any) => {
        const action = ctx?.action;
        const isRead =
          action?.resourceName === 'ptdlChangeLogs' &&
          (action.actionName === 'list' || action.actionName === 'get');
        if (isRead) {
          let denied = false;
          try {
            const target = action.params?.filter?.collectionName;
            const acl = ctx.app?.acl;
            const roles: string[] = Array.isArray(ctx.state?.currentRoles)
              ? ctx.state.currentRoles
              : ctx.state?.currentRole
                ? [ctx.state.currentRole]
                : [];
            if (target && acl && roles.length) {
              const allowed = roles.some((role) => {
                try {
                  return (
                    !!acl.can({ role, resource: String(target), action: 'view' }) ||
                    !!acl.can({ role, resource: String(target), action: 'list' })
                  );
                } catch (e) {
                  return true; // per-role lookup failure → don't block
                }
              });
              denied = !allowed;
            }
          } catch (e) {
            denied = false; // fail-open
          }
          // Throw OUTSIDE the try so the fail-open catch above can't swallow the 403.
          if (denied) ctx.throw(403, "No permission to view this collection's change history");
        }
        await next();
      },
      { tag: 'ptdlChangeLogAcl' },
    );
    // ptdlChangeLogConfigs is a system collection (dumpRules:'required') → NOT covered by the admin role's
    // strategy, so the settings page's create/update/destroy were denied for non-root admins. Grant them.
    this.app.acl.allow('ptdlChangeLogConfigs', ['list', 'get', 'create', 'update', 'updateOrCreate', 'destroy'], 'loggedIn');

    const reloadConfigs = async () => {
      try {
        const rows = await db.getRepository('ptdlChangeLogConfigs').find();
        this.configs = new Map(
          (rows || []).map((r: any) => [
            r.collectionName,
            {
              collectionName: r.collectionName,
              enabled: r.enabled !== false,
              triggerFields: Array.isArray(r.triggerFields) ? r.triggerFields.map(String) : [],
              snapshotFields: Array.isArray(r.snapshotFields) ? r.snapshotFields.map(String) : [],
              captureNote: !!r.captureNote,
            } as Cfg,
          ]),
        );
      } catch (e) {
        // table may not exist yet on the very first load (before sync) -> keep whatever we had
      }
    };
    await reloadConfigs();
    db.on('ptdlChangeLogConfigs.afterSave', reloadConfigs);
    db.on('ptdlChangeLogConfigs.afterDestroy', reloadConfigs);

    const resolveCollection = (model: any) =>
      db.modelCollection?.get?.(model?.constructor) || db.getCollection?.(model?.constructor?.name);

    const cfgFor = (collection: any): Cfg | undefined => {
      const name = collection?.name;
      if (!name || OWN_COLLECTIONS.has(name)) return undefined;
      const cfg = this.configs.get(name);
      return cfg && cfg.enabled && cfg.triggerFields.length ? cfg : undefined;
    };

    db.on('afterCreate', async (model: any, options: any) => {
      const collection = resolveCollection(model);
      const cfg = cfgFor(collection);
      if (!cfg) return;
      for (const fieldName of cfg.triggerFields) {
        const value = model.get(fieldName);
        if (value === undefined || value === null || value === '') continue;
        await this.write(collection, model, options, cfg, fieldName, null, value, 'create', null);
      }
    });

    db.on('afterUpdate', async (model: any, options: any) => {
      const collection = resolveCollection(model);
      const cfg = cfgFor(collection);
      if (!cfg) return;
      for (const fieldName of cfg.triggerFields) {
        if (!model.changed?.(fieldName)) continue;
        const from = model.previous(fieldName);
        const to = model.get(fieldName);
        if (String(from ?? '') === String(to ?? '')) continue;
        await this.write(collection, model, options, cfg, fieldName, from, to, undefined, from ?? null);
      }
    });
  }

  // Resolve the presentation snapshot for a value: rich (label/color/icon/kind) when the field is a
  // statusFlow field, otherwise just the stringified value as label.
  private valueMeta(field: any, value: any): ValueMeta {
    if (value === undefined || value === null || value === '') return {};
    const opts = field?.options || {};
    const enumOptions = opts?.uiSchema?.enum || [];
    const hit = enumOptions.find((o: AnyObj) => String(o?.value) === String(value));
    if (hit) {
      return {
        label: typeof hit.label === 'string' ? hit.label : String(value),
        color: hit.color,
        icon: hit.icon,
        kind: opts?.statusFlow?.kinds?.[String(value)],
      };
    }
    return { label: String(value) };
  }

  private sourceOf(options: any, actionName: string | undefined): ChangeSource {
    const ctx = options?.context;
    if (!ctx) return 'system'; // workflow / script / migration
    const header = ctx.get?.(SOURCE_HEADER);
    if (header) return String(header) as ChangeSource;
    if (actionName === 'create') return 'create';
    if (actionName === 'updateMany' || options?.individualHooks) return 'bulk';
    return 'api';
  }

  private async write(
    collection: any,
    model: any,
    options: any,
    cfg: Cfg,
    fieldName: string,
    from: any,
    to: any,
    forcedSource: ChangeSource | undefined,
    prevValueForMeta: any,
  ) {
    try {
      const field = collection.getField?.(fieldName);
      const tkName = collection.filterTargetKey || 'id';
      const recordId = model.get(Array.isArray(tkName) ? tkName[0] : tkName);
      if (recordId === undefined || recordId === null) return;

      const ctx = options?.context;
      const state = ctx?.state || {};
      const userId = state.currentUserId ?? state.currentUser?.id ?? null;
      const userName =
        state.currentUser?.nickname || state.currentUser?.username || state.currentUser?.email || null;
      const roleName =
        (Array.isArray(state.currentRoles) && state.currentRoles[0]) || state.currentRole || null;

      const source = forcedSource || this.sourceOf(options, ctx?.action?.actionName);

      // Cycle time: elapsed since the record entered the previous value (last log entry for this
      // record+field, or the record's own createdAt as a fallback for the first transition).
      let durationMs: number | null = null;
      try {
        const repo = this.db.getRepository('ptdlChangeLogs');
        const prev = await repo.findOne({
          filter: { collectionName: collection.name, recordId: String(recordId), fieldName },
          sort: ['-createdAt', '-id'],
          transaction: options?.transaction,
        });
        const prevAt = prev?.get?.('createdAt') || model.get?.('createdAt');
        if (prevAt) durationMs = Math.max(0, Date.now() - new Date(prevAt).getTime());
      } catch (e) {
        durationMs = null;
      }

      const snapshot: AnyObj = {};
      for (const f of cfg.snapshotFields) {
        if (f === fieldName) continue;
        try {
          snapshot[f] = model.get(f);
        } catch (e) {
          // field may not be loaded; skip it
        }
      }

      // Note arrives base64-encoded in a header (keeps Unicode out of the raw header and off the
      // record's own values); fall back to a plain value key if present.
      let note: string | null = null;
      if (cfg.captureNote) {
        const rawNote = ctx?.get?.('x-ptdl-change-note');
        if (rawNote) {
          try {
            note = Buffer.from(String(rawNote), 'base64').toString('utf8');
          } catch (e) {
            note = null;
          }
        } else if (ctx?.action?.params?.values?.__changeNote) {
          note = String(ctx.action.params.values.__changeNote);
        }
      }

      await this.db.getRepository('ptdlChangeLogs').create({
        values: {
          collectionName: collection.name,
          recordId: String(recordId),
          fieldName,
          fromValue: from === undefined || from === null ? null : String(from),
          toValue: to === undefined || to === null ? null : String(to),
          fromMeta: this.valueMeta(field, prevValueForMeta),
          toMeta: this.valueMeta(field, to),
          userId: userId === null ? null : String(userId),
          userName,
          roleName: roleName ? String(roleName) : null,
          source,
          durationMs,
          note: note ? String(note) : null,
          snapshot,
        },
        transaction: options?.transaction,
      });
    } catch (e) {
      // best-effort: never let a logging error break the business write
    }
  }
}

export default PluginChangeLogServer;
