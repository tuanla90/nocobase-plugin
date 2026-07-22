/*
 * App Doctor — relation-integrity scan + repair (server core).
 * ===========================================================
 * WHAT it finds (over USER data collections only — never system collections):
 *   - missing-reverse  : a relation with no matching reverse field on its target (belongsTo without the
 *                        master's hasMany, hasMany/hasOne without the child's belongsTo, or a one-sided m2m).
 *                        This is exactly the incomplete-bidirectional damage app-builder ≤0.6.31 left behind,
 *                        and the class that makes a sub-table column's `collectionField` unresolvable (freeze).
 *                        **AUTO-FIXABLE** — creating the reverse is additive, touches NO data.
 *   - broken-target    : a relation pointing at a collection that does not exist. Report only (the model is gone).
 *   - broken-through   : a many-to-many whose junction (through) collection is missing. Report only.
 *
 * REPAIR (missing-reverse only): creates the reverse field via the `fields` repository — the exact proven
 *   mechanism app-builder uses (idempotent by target+FK, collision-safe name). Re-scans server-side so the
 *   client never supplies raw schema mutations.
 *
 * SAFETY: read-only scan; repair is additive (new virtual relation fields), never drops or edits data or
 *   existing fields. Fully guarded — a malformed field row is skipped, never throws the whole scan.
 */

type AnyObj = Record<string, any>;

export const DOCTOR_MARKER = 'ptdl-app-doctor/v0.1.0';

// System collections whose relations we never flag and to which we never require a reverse (createdBy/
// updatedBy → users, etc.). The primary allowlist is the `collections` repo (user-managed collections);
// this denylist is a safety net in case a system collection also has a `collections` row.
const CORE_DENY = new Set<string>([
  'users', 'roles', 'rolesUsers', 'rolesResources', 'rolesResourcesScopes', 'rolesResourcesActions',
  'usersRoles', 'rolesResourcesActionsScopes', 'dataSourcesRolesResources', 'dataSourcesRolesResourcesActions',
  'uiSchemas', 'uiSchemaTemplates', 'uiSchemaTreePath', 'uiSchemaServerHooks', 'uiRoutes', 'desktopRoutes',
  'mobileRoutes', 'roleDesktopRoutes', 'collections', 'fields', 'dataSources', 'dataSourcesCollections',
  'dataSourcesFields', 'applicationPlugins', 'applicationMobileRoutes', 'systemSettings', 'attachments',
  'storages', 'authenticators', 'tokenBlacklist', 'verifications', 'jobs', 'workflows', 'flowNodes',
  'flow_nodes', 'executions', 'jobs', 'workflowCategories', 'workflowStats', 'workflowVersionStats',
  'notificationChannels', 'notificationInAppMessages', 'chinaRegions', 'environmentVariables',
  'localizationTexts', 'localizationTranslations', 'userWorkflowTasks', 'workflowTasks',
]);

const REL_TYPES = new Set(['belongsTo', 'hasMany', 'hasOne', 'belongsToMany']);

export type IssueType = 'missing-reverse' | 'broken-target' | 'broken-through';

export interface DoctorIssue {
  id: string;
  type: IssueType;
  severity: 'error' | 'warning';
  collection: string;
  collectionTitle?: string;
  field: string;
  fieldTitle?: string;
  relationType: string;
  target?: string;
  targetTitle?: string;
  through?: string;
  foreignKey?: string;
  message: string;
  fixable: boolean;
  // Internal descriptor for the reverse to create (missing-reverse only). Not trusted from the client —
  // the repair action re-derives it by re-scanning; kept here so the UI can preview what will be created.
  fix?: {
    reverseType: 'hasMany' | 'belongsTo' | 'belongsToMany';
    onCollection: string; // where the reverse field is created (= the target)
    target: string; // what the reverse points back to (= the original collection)
    via: string; // original field name (for collision-safe naming)
    foreignKey?: string;
    otherKey?: string;
    through?: string;
    sourceKey?: string;
    targetKey?: string;
  };
}

export interface ScanResult {
  ok: true;
  issues: DoctorIssue[];
  summary: {
    total: number;
    fixable: number;
    byType: Record<string, number>;
    collectionsScanned: number;
    relationsScanned: number;
  };
}

function optOf(f: any): AnyObj {
  try {
    return (f?.get ? f.get('options') : f?.options) || {};
  } catch {
    return {};
  }
}
function colOf(f: any, key: string): any {
  try {
    return f?.get ? f.get(key) : f?.[key];
  } catch {
    return undefined;
  }
}

/** Read every field row once and index by collection. Relation options (target/foreignKey/…) live in the
 *  `options` JSON, not as physical `fields` columns — so we read them from there. */
async function loadFieldIndex(db: any): Promise<{ all: any[]; byColl: Map<string, any[]> }> {
  const fieldRepo = db.getRepository('fields');
  const all: any[] = (await fieldRepo.find({})) || [];
  const byColl = new Map<string, any[]>();
  for (const f of all) {
    const c = colOf(f, 'collectionName');
    if (!c) continue;
    if (!byColl.has(c)) byColl.set(c, []);
    byColl.get(c)!.push(f);
  }
  return { all, byColl };
}

/** Names of user-managed data collections (the scan allowlist) + a name→title map for friendly labels. */
async function loadDataCollections(db: any): Promise<{ dataColls: Set<string>; titleOf: Map<string, string> }> {
  const dataColls = new Set<string>();
  const titleOf = new Map<string, string>();
  try {
    const rows: any[] = (await db.getRepository('collections').find({})) || [];
    for (const r of rows) {
      const name = colOf(r, 'name');
      if (!name || CORE_DENY.has(name)) continue;
      dataColls.add(name);
      const t = colOf(r, 'title');
      if (t) titleOf.set(name, String(t));
    }
  } catch {
    /* if the collections repo is unavailable, dataColls stays empty → scan finds nothing (safe) */
  }
  return { dataColls, titleOf };
}

function reverseExists(targetFields: any[], wantType: string[], sourceColl: string, fk?: string, through?: string): boolean {
  return (targetFields || []).some((tf) => {
    const t = colOf(tf, 'type');
    if (!wantType.includes(t)) return false;
    const o = optOf(tf);
    if (o.target !== sourceColl) return false;
    if (through != null) return o.through === through;
    return o.foreignKey === fk;
  });
}

/** Scan the whole app for relation-integrity issues. Read-only. Never throws. */
export async function scanApp(db: any): Promise<ScanResult> {
  const issues: DoctorIssue[] = [];
  let relationsScanned = 0;
  const byType: Record<string, number> = {};
  const bump = (t: string) => (byType[t] = (byType[t] || 0) + 1);

  const { byColl } = await loadFieldIndex(db);
  const { dataColls, titleOf } = await loadDataCollections(db);
  const existsColl = (name?: string) => !!name && (dataColls.has(name) || !!db.collections?.has?.(name));

  for (const coll of dataColls) {
    const fields = byColl.get(coll) || [];
    const collTitle = titleOf.get(coll);
    for (const f of fields) {
      const type = colOf(f, 'type');
      if (!REL_TYPES.has(type)) continue;
      relationsScanned++;
      const name = colOf(f, 'name');
      const o = optOf(f);
      const target = o.target;
      const fieldTitle = (o.uiSchema && o.uiSchema.title) || undefined;
      const base = {
        collection: coll,
        collectionTitle: collTitle,
        field: name,
        fieldTitle,
        relationType: type,
        target,
        targetTitle: target ? titleOf.get(target) : undefined,
      };

      // 1) target must exist somewhere in the app
      if (!existsColl(target)) {
        bump('broken-target');
        issues.push({
          id: `${coll}.${name}:broken-target`,
          type: 'broken-target',
          severity: 'error',
          ...base,
          message: `Quan hệ "${name}" trỏ tới bảng "${target || '(trống)'}" không tồn tại`,
          fixable: false,
        });
        continue;
      }
      // Reverse only expected between two USER data collections (never on users/roles/plugin collections).
      if (!dataColls.has(target)) continue;
      const targetFields = byColl.get(target) || [];

      if (type === 'belongsToMany') {
        const through = o.through;
        if (!existsColl(through)) {
          bump('broken-through');
          issues.push({
            id: `${coll}.${name}:broken-through`,
            type: 'broken-through',
            severity: 'error',
            ...base,
            through,
            message: `Quan hệ nhiều-nhiều "${name}" thiếu bảng trung gian "${through || '(trống)'}"`,
            fixable: false,
          });
          continue;
        }
        // Need both join keys to build a correct reverse m2m; skip if the m2m is under-specified.
        if (!o.foreignKey || !o.otherKey) continue;
        if (!reverseExists(targetFields, ['belongsToMany'], coll, undefined, through)) {
          bump('missing-reverse');
          issues.push({
            id: `${coll}.${name}:missing-reverse`,
            type: 'missing-reverse',
            severity: 'warning',
            ...base,
            through,
            message: `Bảng "${base.targetTitle || target}" chưa có quan hệ ngược (nhiều-nhiều) về "${collTitle || coll}"`,
            fixable: true,
            fix: {
              reverseType: 'belongsToMany',
              onCollection: target,
              target: coll,
              via: name,
              through,
              foreignKey: o.otherKey, // swap: the reverse's FK is the original otherKey
              otherKey: o.foreignKey,
              sourceKey: o.targetKey || 'id',
              targetKey: o.sourceKey || 'id',
            },
          });
        }
        continue;
      }

      const fk = o.foreignKey;
      // FK must be explicitly known to safely match/create a reverse (avoid a mis-keyed duplicate). Fields
      // created by app-builder / the collection-manager UI always store it; skip the rare implicit case.
      if (!fk) continue;
      if (type === 'belongsTo') {
        // reverse = hasMany (or hasOne) on the target, sharing the FK
        if (!reverseExists(targetFields, ['hasMany', 'hasOne'], coll, fk)) {
          bump('missing-reverse');
          issues.push({
            id: `${coll}.${name}:missing-reverse`,
            type: 'missing-reverse',
            severity: 'warning',
            ...base,
            foreignKey: fk,
            message: `Bảng "${base.targetTitle || target}" chưa có danh sách ngược (một-nhiều) về "${collTitle || coll}"`,
            fixable: true,
            fix: { reverseType: 'hasMany', onCollection: target, target: coll, via: name, foreignKey: fk, sourceKey: 'id', targetKey: 'id' },
          });
        }
      } else {
        // hasMany / hasOne → reverse = belongsTo on the target, sharing the FK
        if (!reverseExists(targetFields, ['belongsTo'], coll, fk)) {
          bump('missing-reverse');
          issues.push({
            id: `${coll}.${name}:missing-reverse`,
            type: 'missing-reverse',
            severity: 'warning',
            ...base,
            foreignKey: fk,
            message: `Bảng "${base.targetTitle || target}" chưa có quan hệ ngược (thuộc về) tới "${collTitle || coll}"`,
            fixable: true,
            fix: { reverseType: 'belongsTo', onCollection: target, target: coll, via: name, foreignKey: fk, targetKey: 'id' },
          });
        }
      }
    }
  }

  // errors first, then warnings; stable within.
  issues.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1));
  return {
    ok: true,
    issues,
    summary: {
      total: issues.length,
      fixable: issues.filter((i) => i.fixable).length,
      byType,
      collectionsScanned: dataColls.size,
      relationsScanned,
    },
  };
}

// ---------------------------------------------------------------------------------------------------
// repair
// ---------------------------------------------------------------------------------------------------
export interface RepairResult {
  ok: boolean;
  fixed: Array<{ collection: string; field: string; created: string; onCollection: string }>;
  skipped: Array<{ collection: string; field: string; reason: string }>;
  errors: Array<{ collection: string; field: string; error: string }>;
}

/** Collision-safe reverse-field name on `onCollection`: prefer the source collection name, else `${src}_${via}`,
 *  else a numeric suffix — never clashing an existing field. */
async function pickName(fieldRepo: any, onCollection: string, src: string, via: string): Promise<string> {
  const taken = async (nm: string) => !!(await fieldRepo.findOne({ filter: { collectionName: onCollection, name: nm } }));
  let name = src;
  if (await taken(name)) {
    const alt = `${src}_${via}`;
    name = alt;
    let i = 2;
    while (await taken(name)) {
      name = `${alt}_${i++}`;
      if (i > 30) break;
    }
  }
  return name;
}

async function createReverse(db: any, fix: NonNullable<DoctorIssue['fix']>, titleOf: Map<string, string>): Promise<{ created: string }> {
  const fieldRepo = db.getRepository('fields');
  const name = await pickName(fieldRepo, fix.onCollection, fix.target, fix.via);
  const title = titleOf.get(fix.target) || fix.target;
  let values: AnyObj;
  if (fix.reverseType === 'hasMany') {
    values = {
      collectionName: fix.onCollection, name, type: 'hasMany', interface: 'o2m', target: fix.target,
      foreignKey: fix.foreignKey, sourceKey: fix.sourceKey || 'id', targetKey: fix.targetKey || 'id',
      uiSchema: { title, 'x-component': 'AssociationField', 'x-component-props': { multiple: true } },
    };
  } else if (fix.reverseType === 'belongsTo') {
    values = {
      collectionName: fix.onCollection, name, type: 'belongsTo', interface: 'm2o', target: fix.target,
      foreignKey: fix.foreignKey, targetKey: fix.targetKey || 'id',
      uiSchema: { title, 'x-component': 'AssociationField', 'x-component-props': { multiple: false } },
    };
  } else {
    values = {
      collectionName: fix.onCollection, name, type: 'belongsToMany', interface: 'm2m', target: fix.target,
      through: fix.through, foreignKey: fix.foreignKey, otherKey: fix.otherKey,
      sourceKey: fix.sourceKey || 'id', targetKey: fix.targetKey || 'id',
      uiSchema: { title, 'x-component': 'AssociationField', 'x-component-props': { multiple: true } },
    };
  }
  await fieldRepo.create({ values, context: {} });
  return { created: name };
}

/**
 * Re-scan and repair missing-reverse issues. `scope` (optional {collection, field}) limits the repair to one
 * relation; otherwise every fixable issue is repaired. Re-scanning server-side means the client can only ask
 * "fix these" — it can never inject arbitrary schema mutations.
 */
export async function repairApp(db: any, scope?: { collection?: string; field?: string }): Promise<RepairResult> {
  const res: RepairResult = { ok: true, fixed: [], skipped: [], errors: [] };
  const { titleOf } = await loadDataCollections(db);
  const scan = await scanApp(db);
  const targets = scan.issues.filter(
    (i) => i.fixable && i.fix && (!scope || !scope.collection || (i.collection === scope.collection && (!scope.field || i.field === scope.field))),
  );
  for (const issue of targets) {
    try {
      const { created } = await createReverse(db, issue.fix!, titleOf);
      res.fixed.push({ collection: issue.collection, field: issue.field, created, onCollection: issue.fix!.onCollection });
    } catch (e: any) {
      res.errors.push({ collection: issue.collection, field: issue.field, error: String(e?.message || e) });
    }
  }
  if (res.errors.length) res.ok = false;
  return res;
}
