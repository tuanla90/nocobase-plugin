import { Plugin } from '@nocobase/server';

type AnyObj = Record<string, any>;

function statusFlowFields(collection: any): any[] {
  try {
    const fields = collection?.getFields?.() || [];
    return fields.filter((f: any) => {
      const o = f?.options || {};
      // Match a status-flow field by its interface OR (robust) the presence of a configured statusFlow.
      // `options.interface` is NOT reliably populated at runtime — it's undefined for every status-flow
      // field created via the fields repo (incl. programmatically, e.g. @ptdl/plugin-app-builder), which
      // silently disabled enforcement. A configured field always carries `options.statusFlow.initial`.
      return o.interface === 'statusFlow' || !!(o.statusFlow && typeof o.statusFlow === 'object' && o.statusFlow.initial);
    });
  } catch (e) {
    return [];
  }
}

function labelOf(field: any, value: any): string {
  const options = field?.options?.uiSchema?.enum || [];
  const hit = options.find((o: AnyObj) => String(o?.value) === String(value));
  const label = hit?.label;
  return typeof label === 'string' && label ? label : String(value);
}

// The core error-handler's default renderer honours err.statusCode + err.message; the
// SequelizeValidationError path would instead replace the message with i18n.t(item.type),
// which cannot carry a custom text — so a plain 400 error keeps our message intact.
class StatusTransitionError extends Error {
  statusCode = 400;
  code = 'STATUS_FLOW_TRANSITION';
  logLevel = 'info';
}

function throwValidation(message: string, _path?: string, _value?: any, _instance?: any): never {
  throw new StatusTransitionError(message);
}

function rolesOf(ctx: any): string[] {
  const state = ctx?.state || {};
  if (Array.isArray(state.currentRoles) && state.currentRoles.length) return state.currentRoles.map(String);
  return state.currentRole ? [String(state.currentRole)] : [];
}

// The authority for status transitions. The client dropdown filter is UX only — every
// update that fires model hooks (single edit, quick edit, bulk edit: they all go through
// repository.update -> instance.update per row) is validated here.
export class PluginStatusFlowServer extends Plugin {
  async load() {
    const db: any = this.db;

    const resolveCollection = (model: any) =>
      db.modelCollection?.get?.(model?.constructor) || db.getCollection?.(model?.constructor?.name);

    // Default the field to the configured initial status on create; if a caller supplies an
    // explicit non-initial value (direct API call, duplicate/import — the create-form lock is
    // UI only), reject it the same way an illegal transition would be rejected.
    db.on('beforeCreate', async (model: any, options: any) => {
      const collection = resolveCollection(model);
      if (!collection) return;
      for (const field of statusFlowFields(collection)) {
        const name = field.name;
        const flow = field.options?.statusFlow || {};
        const value = model.get(name);
        if (value === undefined || value === null || value === '') {
          if (flow.initial) model.set(name, flow.initial);
          continue;
        }
        const kinds = flow.kinds || {};
        if (!flow.initial || !Object.keys(kinds).length) continue; // flow not configured -> don't block
        const ctx = options?.context;
        if (!ctx) continue; // internal create (workflow/script/migration) -> policy: allow
        if (rolesOf(ctx).includes('root')) continue;
        const valueS = String(value);
        if (valueS !== String(flow.initial) && kinds[valueS] !== 'init') {
          throwValidation(
            `[${field.options?.uiSchema?.title || name}] New records must start at the initial status ("${labelOf(
              field,
              flow.initial,
            )}")`,
            name,
            value,
            model,
          );
        }
      }
    });

    // roles gate: empty/missing = everyone
    const roleOk = (ruleRoles: any, roles: string[]) =>
      !Array.isArray(ruleRoles) || !ruleRoles.length || roles.some((r) => ruleRoles.includes(r));

    db.on('beforeUpdate', async (model: any, options: any) => {
      const collection = resolveCollection(model);
      if (!collection) return;
      for (const field of statusFlowFields(collection)) {
        const name = field.name;
        if (!model.changed?.(name)) continue;

        const flow = field.options?.statusFlow || {};
        const transitions: AnyObj = flow.transitions || {};
        const openFrom: AnyObj = flow.openFrom || {};
        if (!Object.keys(transitions).length && !Object.keys(openFrom).length) continue; // not configured -> don't block

        const from = model.previous(name);
        const to = model.get(name);
        if (from === undefined || from === null || from === '') continue; // first assignment
        if (String(from) === String(to)) continue;

        const ctx = options?.context;
        if (!ctx) continue; // internal update (workflow, script, migration) -> policy: allow
        const roles = rolesOf(ctx);
        if (roles.includes('root')) continue;

        const fieldTitle = field.options?.uiSchema?.title || name;

        // Clearing a configured status field (e.g. via allowClear in the UI) has no transition
        // rule to check against -> reject with a plain message instead of falling through to a
        // confusing "-> null/undefined" transition error below.
        if (to === undefined || to === null || to === '') {
          throwValidation(`[${fieldTitle}] Status cannot be cleared once set`, name, to, model);
        }

        const allValues: string[] = (field.options?.uiSchema?.enum || [])
          .map((o: AnyObj) => String(o?.value))
          .filter((v: string) => v !== 'undefined');
        const fromS = String(from);
        const toS = String(to);
        const rule = transitions[fromS];

        // declared = reachable ignoring roles; allowed = reachable for THESE roles
        const declared = new Set<string>();
        const allowed = new Set<string>();
        if (rule) {
          const outTargets: string[] = rule.toAll ? allValues : (rule.to || []).map(String);
          outTargets.forEach((v) => declared.add(v));
          if (roleOk(rule.roles, roles)) outTargets.forEach((v) => allowed.add(v));
        }
        for (const [target, cfg] of Object.entries(openFrom)) {
          if (target === fromS) continue;
          declared.add(target);
          if (roleOk((cfg as AnyObj)?.roles, roles)) allowed.add(target);
        }
        declared.delete(fromS);
        allowed.delete(fromS);

        if (!declared.has(toS)) {
          throwValidation(
            `[${fieldTitle}] Transition "${labelOf(field, from)}" -> "${labelOf(field, to)}" is not allowed`,
            name,
            to,
            model,
          );
        }
        if (!allowed.has(toS)) {
          throwValidation(
            `[${fieldTitle}] Your role is not allowed to move "${labelOf(field, from)}" -> "${labelOf(field, to)}"`,
            name,
            to,
            model,
          );
        }
      }
    });

    // Raw bulk UPDATE (repository.update({ individualHooks: false }) / Model.update) skips the
    // per-instance hook above and has no previous value to validate against -> refuse to touch
    // statusFlow fields on that path so the rules can't be bypassed.
    db.on('beforeBulkUpdate', async (options: any) => {
      if (options?.individualHooks) return; // per-instance hooks will run and validate
      const ctx = options?.context;
      if (!ctx) return; // internal (workflow/script/migration) -> same policy as beforeUpdate: allow
      if (rolesOf(ctx).includes('root')) return;
      const values: AnyObj = options?.attributes || options?.values || {};
      const modelClass = options?.model;
      const collection =
        (modelClass && db.modelCollection?.get?.(modelClass)) ||
        (modelClass?.name && db.getCollection?.(modelClass.name));
      if (!collection) return;
      const touched = statusFlowFields(collection).filter((f: any) => f.name in values);
      if (touched.length) {
        throwValidation(
          `Status field "${touched[0].name}" cannot be changed by a raw bulk update; update records individually so transition rules apply`,
          touched[0].name,
          values[touched[0].name],
          null,
        );
      }
    });
  }
}

export default PluginStatusFlowServer;
