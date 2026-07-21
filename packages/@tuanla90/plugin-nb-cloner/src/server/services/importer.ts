import { Database } from '@nocobase/database';
import { Application } from '@nocobase/server';
import { BundleData } from './extractor';
import { BUNDLE_COMPAT_MAJOR, SYSTEM_TABLE_NAMES, SYSTEM_COLLECTION_NAMES } from '../utils/constants';
import { pgIdent, assertPostgres } from '../utils/db';

export interface ImportResult {
  success: boolean;
  steps: Array<{ step: string; status: 'ok' | 'error' | 'skipped'; count?: number; error?: string }>;
}

export interface PreviewReport {
  collections: Array<{
    name: string;
    title: string;
    existsOnTarget: boolean;   // a collection with this name already exists on the target app
    matchFields: number;       // same name AND same key → will be updated cleanly
    newFields: number;         // name not on target → will be ADDED as a new column
    conflictFields: string[];  // name exists on target but with a DIFFERENT key → will be SKIPPED
  }>;
  newCollections: number;      // collections that don't exist on the target yet
  existingCollections: number; // collections that already exist (get merged)
  conflictFieldTotal: number;  // total same-name/different-key fields that will be skipped
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Parse cột options (có thể là JSON string hoặc object) về object an toàn. */
function opt(o: any): any {
  if (o == null) return {};
  return typeof o === 'string' ? (() => { try { return JSON.parse(o); } catch { return {}; } })() : o;
}

/**
 * Chuẩn hoá 1 giá trị trước khi bind vào SQL.
 * node-postgres serialize MẢNG JS thành Postgres array literal `{...}` — sai với cột json/jsonb
 * (vd roles.snippets là jsonb chứa mảng → "invalid input syntax for type json").
 * Schema NocoBase KHÔNG có cột native Postgres ARRAY nào (đã verify), nên cứ JSON.stringify
 * mọi mảng/object là an toàn: cột json/jsonb nhận được text JSON hợp lệ.
 */
function toBind(v: any): any {
  return v !== null && typeof v === 'object' ? JSON.stringify(v) : v;
}

/**
 * Upsert nhiều rows vào một bảng.
 * @param conflictKey  Cột dùng làm conflict target (ON CONFLICT).
 *                     Nếu là mảng → composite unique key.
 *
 * LƯU Ý cố ý: mỗi row là một `sequelize.query` autocommit RIÊNG (không bọc transaction). Nhờ vậy
 * một dòng lỗi (bắt ở catch, chỉ warn) KHÔNG kéo các dòng khác chết theo — trên Postgres nếu bọc
 * chung transaction thì dòng lỗi đầu tiên sẽ "abort" cả transaction. Đây là đánh đổi có chủ đích:
 * best-effort theo từng dòng thay vì all-or-nothing.
 */
async function upsertRows(
  sequelize: any,
  tableName: string,
  rows: any[],
  conflictKey: string | string[],
): Promise<number> {
  if (!rows || rows.length === 0) return 0;

  const conflictCols = Array.isArray(conflictKey) ? conflictKey : [conflictKey];
  const conflictTarget = conflictCols.map(pgIdent).join(', ');
  let count = 0;
  let firstError: string | undefined;

  for (const row of rows) {
    const keys = Object.keys(row);
    if (keys.length === 0) continue;

    const values = Object.values(row).map(toBind);
    const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');

    // SET clause: cập nhật tất cả cột trừ conflict key(s)
    const setClauses = keys
      .filter((k) => !conflictCols.includes(k))
      .map((k) => `${pgIdent(k)} = EXCLUDED.${pgIdent(k)}`);

    // Nếu tất cả cột đều là conflict key → chỉ INSERT, không UPDATE (DO NOTHING)
    const updatePart = setClauses.length > 0
      ? `DO UPDATE SET ${setClauses.join(', ')}`
      : 'DO NOTHING';

    try {
      await sequelize.query(
        `INSERT INTO ${pgIdent(tableName)} (${keys.map(pgIdent).join(', ')})
         VALUES (${placeholders})
         ON CONFLICT (${conflictTarget}) ${updatePart}`,
        { bind: values },
      );
      count++;
    } catch (err: any) {
      if (!firstError) firstError = err?.message;
      console.warn(`[nb-cloner] Upsert warning ${tableName} (conflict on ${conflictTarget}):`, err?.message);
    }
  }
  // Nếu CÓ dòng để chèn mà KHÔNG dòng nào thành công → lỗi thật, throw để lộ (báo rõ)
  // thay vì âm thầm "ok" với 0 dòng.
  if (count === 0 && rows.length > 0) {
    throw new Error(`upsert ${tableName}: 0/${rows.length} rows inserted — ${firstError ?? 'unknown error'}`);
  }
  return count;
}

/**
 * Dành cho bảng join KHÔNG có unique constraint (rolesUischemas, collectionCategory) —
 * không dùng được ON CONFLICT. Chiến lược: DELETE theo khóa logic rồi INSERT lại.
 * @param keyCols  Các cột tạo nên khóa logic của một dòng join.
 */
async function replaceRows(
  sequelize: any,
  tableName: string,
  rows: any[],
  keyCols: string[],
): Promise<number> {
  if (!rows || rows.length === 0) return 0;
  let count = 0;

  for (const row of rows) {
    const keys = Object.keys(row);
    if (keys.length === 0) continue;

    const keyVals = keyCols.map((k) => row[k]);
    const whereParts = keyCols.map((k, i) => `${pgIdent(k)} = $${i + 1}`);

    const values = Object.values(row).map(toBind);
    const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');

    try {
      await sequelize.query(
        `DELETE FROM ${pgIdent(tableName)} WHERE ${whereParts.join(' AND ')}`,
        { bind: keyVals },
      );
      await sequelize.query(
        `INSERT INTO ${pgIdent(tableName)} (${keys.map(pgIdent).join(', ')}) VALUES (${placeholders})`,
        { bind: values },
      );
      count++;
    } catch (err: any) {
      console.warn(`[nb-cloner] Replace warning ${tableName} (key ${keyCols.join(',')}):`, err?.message);
    }
  }
  return count;
}

/**
 * Lấy các cột PRIMARY KEY THỰC TẾ của bảng từ information_schema (đúng theo DB, kể cả composite).
 * Trả về [] nếu bảng không có PK → caller sẽ chèn thẳng (không ON CONFLICT).
 * Thay cho việc đoán 'id' vốn vỡ với bảng join m2m không có cột id.
 */
async function getTablePkColumns(sequelize: any, tableName: string): Promise<string[]> {
  try {
    const [rows] = await sequelize.query(
      `SELECT kcu.column_name AS col
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
       WHERE tc.table_schema = 'public'
         AND tc.table_name = $1
         AND tc.constraint_type = 'PRIMARY KEY'
       ORDER BY kcu.ordinal_position`,
      { bind: [tableName] },
    );
    return (rows as any[]).map((r) => r.col);
  } catch {
    return [];
  }
}

/** Chèn thẳng (không ON CONFLICT) cho bảng KHÔNG có PK/unique. Lỗi từng dòng chỉ warn. */
async function insertRows(sequelize: any, tableName: string, rows: any[]): Promise<number> {
  if (!rows || rows.length === 0) return 0;
  let count = 0;
  for (const row of rows) {
    const keys = Object.keys(row);
    if (keys.length === 0) continue;
    const values = Object.values(row).map(toBind);
    const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
    try {
      await sequelize.query(
        `INSERT INTO ${pgIdent(tableName)} (${keys.map(pgIdent).join(', ')}) VALUES (${placeholders})`,
        { bind: values },
      );
      count++;
    } catch (err: any) {
      console.warn(`[nb-cloner] Insert warning ${tableName}:`, err?.message);
    }
  }
  return count;
}

// ─── Importer class ───────────────────────────────────────────────────────────

export class Importer {
  constructor(private db: Database, private app: Application) {}

  // ── Validate bundle trước khi import ────────────────────────────────────────
  private validateBundle(bundle: BundleData): void {
    if (!bundle.manifest) {
      throw new Error('Invalid bundle: manifest is missing.');
    }

    const version: string = bundle.manifest.version ?? '0.0.0';
    const [major] = version.split('.').map(Number);

    if (isNaN(major) || major < BUNDLE_COMPAT_MAJOR) {
      throw new Error(
        `Bundle version "${version}" is not compatible. ` +
        `A major version >= ${BUNDLE_COMPAT_MAJOR} is required. ` +
        `Re-export it with a newer NB Cloner.`,
      );
    }

    if (!bundle.schema) {
      throw new Error('Invalid bundle: the "schema" section is missing.');
    }
  }

  // ── Import chính ────────────────────────────────────────────────────────────
  async import(bundle: BundleData): Promise<ImportResult> {
    // Import dựa trên SQL đặc thù PostgreSQL — chặn sớm nếu chạy trên dialect khác.
    assertPostgres(this.db);
    // Validate trước khi chạm DB
    this.validateBundle(bundle);

    const steps: ImportResult['steps'] = [];
    const sequelize = this.db.sequelize;

    // Hai transaction "khung" để gom lỗi FATAL: các bulk helper (upsert/replace/insert) chạy
    // autocommit theo từng dòng (xem ghi chú ở upsertRows) nên KHÔNG tham gia transaction này —
    // transaction ở đây chỉ bảo vệ các thao tác ORM/DDL trong nhánh sync và bắt lỗi tổng thể.
    const transaction = await sequelize.transaction();

    try {
      // Xác định BUSINESS collections: không thuộc hệ thống & không internal.
      // CHỈ import những collection này + fields của chúng. Tuyệt đối không đụng
      // collection hệ thống (users/roles/uiSchemas...) — nếu không db.sync sẽ ALTER
      // bảng hệ thống của target và làm hỏng auth (Bug B).
      const businessColNames = new Set<string>(
        (bundle.schema.collections ?? [])
          .filter((c: any) => !SYSTEM_COLLECTION_NAMES.has(c.name) && !opt(c.options).internal)
          .map((c: any) => c.name),
      );

      // ── STEP 1: Collections schema (chỉ business) ───────────────────────
      const businessCols = (bundle.schema.collections ?? []).filter((c: any) => businessColNames.has(c.name));
      const colCount = await upsertRows(sequelize, SYSTEM_TABLE_NAMES.collections, businessCols, 'name');
      steps.push({ step: 'schema.collections', status: 'ok', count: colCount });

      // ── STEP 2: Fields (chỉ của business collections) ───────────────────
      const businessFields = (bundle.schema.fields ?? []).filter((f: any) => businessColNames.has(f.collectionName));
      const fieldCount = await upsertRows(sequelize, SYSTEM_TABLE_NAMES.fields, businessFields, 'key');
      steps.push({ step: 'schema.fields', status: 'ok', count: fieldCount });

      // ── STEP 2b: Collection categories (nhóm bảng) ──────────────────────
      await upsertRows(sequelize, SYSTEM_TABLE_NAMES.collectionCategories, bundle.schema.collectionCategories ?? [], 'id');
      // join collectionCategory không có unique → replace theo (collectionName, categoryId)
      await replaceRows(sequelize, SYSTEM_TABLE_NAMES.collectionCategory, bundle.schema.collectionCategory ?? [], ['collectionName', 'categoryId']);

      // ── STEP 3: reload collections + db.sync — tạo bảng vật lý ──────────
      // Chạy ngoài transaction vì DDL không thể rollback trong PostgreSQL
      await transaction.commit();
      const syncTransaction = await sequelize.transaction();

      try {
        // QUAN TRỌNG: collection vừa được upsert bằng SQL thô CHƯA nằm trong bộ nhớ `db`,
        // nên db.sync() sẽ bỏ qua và KHÔNG tạo bảng vật lý. Phải nạp lại định nghĩa
        // collection/field từ DB vào bộ nhớ trước, rồi mới sync để tạo bảng.
        // Full load() có thể vấp lỗi thứ tự association (NocoBase không defer hasMany)
        // với collection quan hệ phức tạp → nếu lỗi thì fallback: nạp TỪNG business
        // collection, chạy 2 vòng (vòng 1 nạp base + PK, vòng 2 resolve quan hệ chéo),
        // bỏ qua cái lỗi để không hủy cả mẻ.
        const collRepo: any = this.app.db.getRepository('collections');
        try {
          await collRepo.load();
          steps.push({ step: 'collections.reload', status: 'ok' });
        } catch (reloadErr: any) {
          const failedNames = new Set<string>();
          for (let pass = 0; pass < 2; pass++) {
            for (const name of businessColNames) {
              try {
                await collRepo.load({ filter: { name } });
                failedNames.delete(name);
              } catch {
                failedNames.add(name);
              }
            }
          }
          const ok = businessColNames.size - failedNames.size;
          steps.push({
            step: 'collections.reload',
            status: failedNames.size ? 'error' : 'ok',
            count: ok,
            error: failedNames.size
              ? `${reloadErr.message} → fallback: ${ok}/${businessColNames.size} ok, failed: ${[...failedNames].join(', ')}`
              : undefined,
          });
        }

        await this.app.db.sync({ alter: { drop: false } });
        steps.push({ step: 'db.sync', status: 'ok' });

        // ── STEP 4: Roles & Permissions ─────────────────────────────────
        if ((bundle.acl?.roles ?? []).length > 0) {
          const roleCount = await upsertRows(sequelize, SYSTEM_TABLE_NAMES.roles, bundle.acl.roles, 'name');
          await upsertRows(sequelize, SYSTEM_TABLE_NAMES.rolesResources, bundle.acl.rolesResources ?? [], 'id');
          await upsertRows(sequelize, SYSTEM_TABLE_NAMES.rolesResourcesActions, bundle.acl.rolesResourcesActions ?? [], 'id');
          await upsertRows(sequelize, SYSTEM_TABLE_NAMES.rolesResourcesScopes, bundle.acl.rolesResourcesScopes ?? [], 'id');
          steps.push({ step: 'acl.roles', status: 'ok', count: roleCount });
        } else {
          steps.push({ step: 'acl.roles', status: 'skipped' });
        }

        // ── STEP 5: UI Schemas + Menu/Routes ────────────────────────────
        if ((bundle.ui?.uiSchemas ?? []).length > 0) {
          // PK thật của uiSchemas là "x-uid" (có gạch ngang) — trước đây để "x_uid" nên import lỗi
          const uiCount = await upsertRows(sequelize, SYSTEM_TABLE_NAMES.uiSchemas, bundle.ui.uiSchemas, 'x-uid');

          // uiSchemaTreePath: composite PK (ancestor, descendant)
          await upsertRows(
            sequelize,
            SYSTEM_TABLE_NAMES.uiSchemaTreePath,
            bundle.ui.uiSchemaTreePath ?? [],
            ['ancestor', 'descendant'],   // ← composite conflict key
          );

          // uiSchemaTemplates PK thật là "key" (không phải x_uid)
          await upsertRows(sequelize, SYSTEM_TABLE_NAMES.uiSchemaTemplates, bundle.ui.uiSchemaTemplates ?? [], 'key');
          await upsertRows(sequelize, SYSTEM_TABLE_NAMES.uiSchemaServerHooks, bundle.ui.uiSchemaServerHooks ?? [], 'id');

          // Flow-engine (kiểu UI mới): nội dung trang/block flowPage. flowModelTreePath là
          // closure table nên RẤT nhiều dòng — đây là phần nặng nhất của bundle.
          const fmCount = await upsertRows(sequelize, SYSTEM_TABLE_NAMES.flowModels, bundle.ui.flowModels ?? [], 'uid');
          await upsertRows(sequelize, SYSTEM_TABLE_NAMES.flowModelTreePath, bundle.ui.flowModelTreePath ?? [], ['ancestor', 'descendant']);
          // main_desktopRoutes_path là closure kiểu PATH-ENUMERATION (cột nodePk/path/rootPk),
          // KHÔNG có unique constraint → KHÔNG dùng ON CONFLICT được. Đúng phải là replaceRows theo nodePk.
          await replaceRows(sequelize, SYSTEM_TABLE_NAMES.desktopRoutesPath, bundle.ui.desktopRoutesPath ?? [], ['nodePk']);
          // Block template flow-engine (PK uid) — insert TEMPLATE trước, USAGES sau (usages tham chiếu template)
          await upsertRows(sequelize, SYSTEM_TABLE_NAMES.flowModelTemplates, bundle.ui.flowModelTemplates ?? [], 'uid');
          await upsertRows(sequelize, SYSTEM_TABLE_NAMES.flowModelTemplateUsages, bundle.ui.flowModelTemplateUsages ?? [], 'uid');
          if (fmCount > 0) steps.push({ step: 'ui.flowModels', status: 'ok', count: fmCount });

          // Menu / điều hướng 2.1.9
          await upsertRows(sequelize, SYSTEM_TABLE_NAMES.desktopRoutes, bundle.ui.desktopRoutes ?? [], 'id');
          await upsertRows(sequelize, SYSTEM_TABLE_NAMES.mobileRoutes, bundle.ui.mobileRoutes ?? [], 'id');
          // join role↔route có PK composite → dùng ON CONFLICT được
          await upsertRows(sequelize, SYSTEM_TABLE_NAMES.rolesDesktopRoutes, bundle.ui.rolesDesktopRoutes ?? [], ['desktopRouteId', 'roleName']);
          await upsertRows(sequelize, SYSTEM_TABLE_NAMES.rolesMobileRoutes, bundle.ui.rolesMobileRoutes ?? [], ['mobileRouteId', 'roleName']);
          // rolesUischemas KHÔNG có unique → replace theo (roleName, uiSchemaXUid)
          await replaceRows(sequelize, SYSTEM_TABLE_NAMES.rolesUischemas, bundle.ui.rolesUischemas ?? [], ['roleName', 'uiSchemaXUid']);

          steps.push({ step: 'ui.schemas', status: 'ok', count: uiCount });
        } else {
          steps.push({ step: 'ui.schemas', status: 'skipped' });
        }

        // ── STEP 6: Workflows ───────────────────────────────────────────
        if ((bundle.workflows?.workflows ?? []).length > 0) {
          const wfCount = await upsertRows(sequelize, SYSTEM_TABLE_NAMES.workflows, bundle.workflows.workflows, 'id');
          await upsertRows(sequelize, SYSTEM_TABLE_NAMES.flowNodes, bundle.workflows.flow_nodes ?? [], 'id');
          steps.push({ step: 'workflows', status: 'ok', count: wfCount });
        } else {
          steps.push({ step: 'workflows', status: 'skipped' });
        }

        // ── STEP 7: Business Data ───────────────────────────────────────
        for (const [collectionName, rows] of Object.entries(bundle.businessData ?? {})) {
          if (!rows || rows.length === 0) {
            steps.push({ step: `data.${collectionName}`, status: 'skipped' });
            continue;
          }
          const collection = this.db.getCollection(collectionName);
          if (!collection) {
            steps.push({
              step: `data.${collectionName}`,
              status: 'error',
              error: 'Collection not found after db.sync — its schema may not have been created correctly.',
            });
            continue;
          }
          const tableName = (collection as any).tableName() as string;
          // Lỗi 1 bảng data KHÔNG được làm hỏng cả mẻ (FATAL) → bắt lỗi, ghi step, tiếp bảng khác.
          try {
            // PK LẤY THẲNG TỪ DB (composite cho bảng join m2m). KHÔNG đoán 'id' — nhiều bảng
            // join không có cột id → ON CONFLICT ("id") vỡ.
            const pkCols = await getTablePkColumns(sequelize, tableName);
            const dataCount = pkCols.length > 0
              ? await upsertRows(sequelize, tableName, rows, pkCols)
              : await insertRows(sequelize, tableName, rows); // bảng không PK → chèn thẳng
            steps.push({ step: `data.${collectionName}`, status: 'ok', count: dataCount });
          } catch (dataErr: any) {
            steps.push({ step: `data.${collectionName}`, status: 'error', error: dataErr.message });
          }
        }

        await syncTransaction.commit();
      } catch (innerErr: any) {
        await syncTransaction.rollback();
        throw innerErr;
      }

      const hasError = steps.some((s) => s.status === 'error');
      return { success: !hasError, steps };

    } catch (err: any) {
      // Rollback transaction đầu (schema) nếu chưa commit
      try { await transaction.rollback(); } catch { /* đã commit */ }

      steps.push({ step: 'FATAL', status: 'error', error: err.message });
      return { success: false, steps };
    }
  }

  /**
   * Dry-run: compare a bundle against the target WITHOUT writing anything, so the UI can warn before
   * importing. Fields are matched by `key` (their PK) — a bundle field whose NAME already exists on the
   * target under a DIFFERENT key hits the UNIQUE(collectionName, name) index on import and is silently
   * skipped; this report surfaces exactly those, plus which collections already exist / which fields are new.
   */
  async preview(bundle: BundleData): Promise<PreviewReport> {
    this.validateBundle(bundle);

    const businessColNames = new Set<string>(
      (bundle.schema.collections ?? [])
        .filter((c: any) => !SYSTEM_COLLECTION_NAMES.has(c.name) && !opt(c.options).internal)
        .map((c: any) => c.name),
    );
    const businessCols = (bundle.schema.collections ?? []).filter((c: any) => businessColNames.has(c.name));
    const allFields = bundle.schema.fields ?? [];

    const report: PreviewReport = {
      collections: [],
      newCollections: 0,
      existingCollections: 0,
      conflictFieldTotal: 0,
    };

    for (const c of businessCols) {
      const existsOnTarget = !!this.db.getCollection(c.name);
      const bundleFields = allFields.filter((f: any) => f.collectionName === c.name);
      let matchFields = 0;
      let newFields = 0;
      const conflictFields: string[] = [];

      if (existsOnTarget) {
        report.existingCollections += 1;
        // Target's fields → name → key
        let targetByName = new Map<string, any>();
        try {
          const rows: any[] = await this.db.getRepository('fields').find({
            filter: { collectionName: c.name },
            fields: ['name', 'key'],
          });
          targetByName = new Map(rows.map((r: any) => [r.name ?? r.get?.('name'), r.key ?? r.get?.('key')]));
        } catch {
          /* leave empty → everything counts as new (best-effort) */
        }
        for (const bf of bundleFields) {
          if (!targetByName.has(bf.name)) newFields += 1;
          else if (targetByName.get(bf.name) === bf.key) matchFields += 1;
          else conflictFields.push(bf.name); // same name, different key → will be SKIPPED on import
        }
      } else {
        report.newCollections += 1;
        newFields = bundleFields.length;
      }

      report.conflictFieldTotal += conflictFields.length;
      report.collections.push({
        name: c.name,
        title: opt(c.options).title || c.name,
        existsOnTarget,
        matchFields,
        newFields,
        conflictFields,
      });
    }

    // Existing collections first (they're the ones with potential conflicts), then alphabetical.
    report.collections.sort(
      (a, b) => Number(b.existsOnTarget) - Number(a.existsOnTarget) || a.name.localeCompare(b.name),
    );
    return report;
  }
}
