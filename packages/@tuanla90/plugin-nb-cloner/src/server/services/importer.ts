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
    matchFields: number;       // same name AND same key (same lineage) → overwrite updates, append keeps
    newFields: number;         // name not on target → always ADDED as a new column (both strategies)
    conflictFields: string[];  // same name, DIFFERENT internal key — the strategy decides:
                               //   append → kept untouched · overwrite → overwritten via key-remap
    dataRows: number;          // rows the bundle carries for this collection (0 = schema only)
  }>;
  newCollections: number;      // collections that don't exist on the target yet
  existingCollections: number; // collections that already exist (strategy decides merge vs overwrite)
  conflictFieldTotal: number;  // total same-name/different-key fields (see conflictFields)
  // What the bundle actually carries — lets the import UI enable/disable each "part" toggle
  // (you can't import a part that isn't in the file).
  bundleContents: {
    ui: number;         // uiSchemas + flowModels rows (0 = bundle has no UI/pages)
    roles: number;      // exported role definitions
    workflows: number;  // exported workflow definitions
    categories: number; // collection categories (table groups)
    dataRows: number;   // total business-data rows across all collections
  };
}

/**
 * Optional per-import selection (mirrors the export side). Absent → import EVERYTHING in the bundle
 * (back-compat with older clients that send no selection).
 *  - parts:       which sections to write. Any part left `true`/undefined is imported.
 *  - collections: which BUSINESS collection names to import (schema + optionally data).
 *                 null/undefined = all business collections in the bundle.
 *  - data:        which of those collections also get their ROW data written.
 *                 null/undefined = all that carry data; [] = none (schema only).
 *  - conflictStrategy (1.12.0): what to do when a SAME-NAME table/column already exists on the target.
 *      'overwrite' (default = the historical behaviour): the file wins — the collection row and
 *        same-name fields are updated from the bundle. A field whose name matches but whose internal
 *        `key` differs (previously skipped silently against UNIQUE(collectionName,name)) is now
 *        overwritten too, by remapping the bundle key onto the target key so every reference
 *        (parentKey/reverseKey) stays intact. Business-data rows with the same PK are upserted.
 *      'append': ONLY ADD — collections/fields/data rows that already exist on the target are LEFT
 *        UNTOUCHED (title/options included); only new tables, new columns and new rows are inserted.
 *    Scope: schema (collections + fields + category assignment) and business-data rows. UI, roles and
 *    workflows are uid/name-keyed whole objects and always upsert (untick their part to skip them).
 */
export interface ImportSelection {
  parts?: { schema?: boolean; ui?: boolean; roles?: boolean; workflows?: boolean };
  collections?: string[] | null;
  data?: string[] | null;
  conflictStrategy?: 'append' | 'overwrite';
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
 * @param opts.ignoreExisting  Chiến lược APPEND (1.12.0): thay `DO UPDATE` bằng `ON CONFLICT DO
 *                     NOTHING` KHÔNG có conflict target — bắt MỌI vi phạm unique (PK lẫn index phụ
 *                     như UNIQUE(collectionName,name) của bảng fields) → dòng đã có được GIỮ NGUYÊN,
 *                     chỉ dòng thật sự mới được chèn. Kèm `RETURNING 1` để đếm đúng số dòng đã vào
 *                     (dòng bị conflict không trả gì).
 *
 * HIỆU NĂNG (1.10.1): chèn theo LÔ (multi-row INSERT) thay vì từng dòng — trước đây mỗi dòng 1 round-trip
 * SQL, với app /v/ có cây flowModels/uiSchema hàng chục nghìn dòng thì chạy hàng phút → gateway 502 trước
 * khi import xong view. Nếu 1 lô lỗi (trùng conflict key / 1 dòng hỏng abort cả câu) thì FALLBACK per-row
 * cho đúng lô đó → vẫn giữ best-effort (dòng lỗi chỉ warn, dòng tốt vẫn vào), không bọc transaction chung.
 */
async function upsertRows(
  sequelize: any,
  tableName: string,
  rows: any[],
  conflictKey: string | string[],
  opts?: { ignoreExisting?: boolean },
): Promise<number> {
  if (!rows || rows.length === 0) return 0;

  const ignoreExisting = !!opts?.ignoreExisting;
  const conflictCols = Array.isArray(conflictKey) ? conflictKey : [conflictKey];
  const conflictTarget = conflictCols.map(pgIdent).join(', ');
  let count = 0;
  let errored = 0;
  let firstError: string | undefined;

  // Số dòng THẬT SỰ chèn được, đọc từ kết quả `RETURNING 1`. sequelize.query trả shape hơi khác
  // nhau tuỳ version ([rows, meta] / [meta]) nên dò phòng thủ; không nhận diện được thì coi như cả
  // mẻ vào (giữ cách đếm lạc quan cũ).
  const insertedOf = (res: any, attempted: number): number =>
    Array.isArray(res) && Array.isArray(res[0]) ? res[0].length
      : Array.isArray(res) && typeof res[1] === 'number' ? res[1]
      : attempted;

  const conflictClause = (keys: string[]): string => {
    if (ignoreExisting) return 'ON CONFLICT DO NOTHING';
    const setClauses = keys
      .filter((k) => !conflictCols.includes(k))
      .map((k) => `${pgIdent(k)} = EXCLUDED.${pgIdent(k)}`);
    const updatePart = setClauses.length > 0 ? `DO UPDATE SET ${setClauses.join(', ')}` : 'DO NOTHING';
    return `ON CONFLICT (${conflictTarget}) ${updatePart}`;
  };
  const returning = ignoreExisting ? ' RETURNING 1' : '';

  // Resilient PER-ROW upsert (the fallback path). Best-effort: a bad row warns, others survive.
  // Trả về số dòng đã chèn (0/1) — ở mode ignoreExisting, dòng bị conflict trả 0 nhưng KHÔNG phải lỗi.
  const insertOne = async (row: any): Promise<number> => {
    const keys = Object.keys(row);
    if (keys.length === 0) return 0;
    const values = Object.values(row).map(toBind);
    const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
    try {
      const res = await sequelize.query(
        `INSERT INTO ${pgIdent(tableName)} (${keys.map(pgIdent).join(', ')})
         VALUES (${placeholders})
         ${conflictClause(keys)}${returning}`,
        { bind: values },
      );
      return ignoreExisting ? Math.min(1, insertedOf(res, 1)) : 1;
    } catch (err: any) {
      errored++;
      if (!firstError) firstError = err?.message;
      console.warn(`[nb-cloner] Upsert warning ${tableName} (row, conflict on ${conflictTarget}):`, err?.message);
      return 0;
    }
  };

  // BATCHED upsert — the perf fix. Row-by-row was ~1 SQL round-trip PER ROW; on a /v/ app's huge
  // flowModels/uiSchema tree (tens of thousands of rows) that ran for minutes and the gateway 502'd before
  // the view (UI) finished importing. We now INSERT many rows per statement. Rows are grouped by their exact
  // column set so one multi-row INSERT is valid; the Postgres bind-param cap (~65535) bounds the chunk size.
  // If a batch fails (a duplicate conflict key → "cannot affect row a second time", or one bad row aborts the
  // statement) we FALL BACK to per-row for just that chunk — preserving the original best-effort semantics.
  const groups = new Map<string, { keys: string[]; rows: any[] }>();
  for (const row of rows) {
    const keys = Object.keys(row);
    if (keys.length === 0) continue;
    const sig = keys.join('');
    let g = groups.get(sig);
    if (!g) { g = { keys, rows: [] }; groups.set(sig, g); }
    g.rows.push(row);
  }

  for (const { keys, rows: grp } of groups.values()) {
    const colList = keys.map(pgIdent).join(', ');
    // keep (#cols × chunk) under the ~65535 bind-parameter cap
    const chunkSize = Math.max(1, Math.min(1000, Math.floor(60000 / Math.max(1, keys.length))));
    for (let i = 0; i < grp.length; i += chunkSize) {
      const chunk = grp.slice(i, i + chunkSize);
      const binds: any[] = [];
      const tuples = chunk.map((row) => {
        const ph = keys.map((k) => { binds.push(toBind(row[k])); return `$${binds.length}`; });
        return `(${ph.join(', ')})`;
      });
      try {
        const res = await sequelize.query(
          `INSERT INTO ${pgIdent(tableName)} (${colList})
           VALUES ${tuples.join(', ')}
           ${conflictClause(keys)}${returning}`,
          { bind: binds },
        );
        // whole batch landed in one round-trip (ignoreExisting: chỉ đếm dòng RETURNING trả về)
        count += ignoreExisting ? Math.min(chunk.length, insertedOf(res, chunk.length)) : chunk.length;
      } catch (batchErr: any) {
        if (!firstError) firstError = batchErr?.message;
        // the statement aborted → isolate by retrying THIS chunk row-by-row (best-effort)
        for (const row of chunk) count += await insertOne(row);
      }
    }
  }
  // Nếu CÓ dòng để chèn mà KHÔNG dòng nào thành công → lỗi thật, throw để lộ (báo rõ)
  // thay vì âm thầm "ok" với 0 dòng. Riêng mode ignoreExisting (append), 0 dòng vào mà KHÔNG có lỗi
  // nào nghĩa là mọi thứ đã tồn tại sẵn — kết quả ĐÚNG, không throw.
  if (count === 0 && rows.length > 0 && (!ignoreExisting || errored > 0)) {
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

/** Tên các collection ĐANG CÓ trên app đích — đọc thẳng bảng `collections` (không dựa vào bộ nhớ
 *  `db`, vì collection import từ lần trước có thể chưa reload nếu app chưa restart). */
async function getTargetCollectionNames(sequelize: any): Promise<Set<string>> {
  try {
    const [rows] = await sequelize.query(`SELECT "name" FROM ${pgIdent(SYSTEM_TABLE_NAMES.collections)}`);
    return new Set((rows as any[]).map((r) => r.name));
  } catch {
    return new Set();
  }
}

/** Khoá tra cứu field theo (collectionName, name) — \u0000 không thể xuất hiện trong identifier. */
const fieldNameKey = (collectionName: string, name: string) => `${collectionName}\u0000${name}`;

/** Map (collectionName, name) → `key` nội bộ của TẤT CẢ field đang có trên app đích. */
async function getTargetFieldKeys(sequelize: any): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const [rows] = await sequelize.query(
      `SELECT "collectionName", "name", "key" FROM ${pgIdent(SYSTEM_TABLE_NAMES.fields)}`,
    );
    for (const r of rows as any[]) map.set(fieldNameKey(r.collectionName, r.name), r.key);
  } catch {
    /* bảng fields chưa tồn tại → coi như app trống */
  }
  return map;
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
  async import(bundle: BundleData, selection?: ImportSelection): Promise<ImportResult> {
    // Import dựa trên SQL đặc thù PostgreSQL — chặn sớm nếu chạy trên dialect khác.
    assertPostgres(this.db);
    // Validate trước khi chạm DB
    this.validateBundle(bundle);

    // Normalize the (optional) selection. No selection → import EVERYTHING (default = old behaviour,
    // so older clients keep working). Any part left true/undefined is written.
    const parts = {
      schema: selection?.parts?.schema !== false,
      ui: selection?.parts?.ui !== false,
      roles: selection?.parts?.roles !== false,
      workflows: selection?.parts?.workflows !== false,
    };
    const collFilter: Set<string> | null =
      Array.isArray(selection?.collections) ? new Set(selection!.collections) : null;
    const dataFilter: Set<string> | null =
      Array.isArray(selection?.data) ? new Set(selection!.data) : null;
    // Chiến lược khi TRÙNG TÊN bảng/cột (xem doc ở ImportSelection). Mặc định 'overwrite' = hành vi
    // lịch sử (file thắng); 'append' = chỉ thêm mới, giữ nguyên mọi thứ đang có trên app đích.
    const strategy: 'append' | 'overwrite' =
      selection?.conflictStrategy === 'append' ? 'append' : 'overwrite';

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
      let businessColNames = new Set<string>(
        (bundle.schema.collections ?? [])
          .filter((c: any) => !SYSTEM_COLLECTION_NAMES.has(c.name) && !opt(c.options).internal)
          .map((c: any) => c.name),
      );
      // Honour the collection selection (if the client sent one) — only these get imported.
      if (collFilter) {
        businessColNames = new Set([...businessColNames].filter((n) => collFilter.has(n)));
      }

      // ── STEP 1+2+2b: Collections schema + Fields + categories (chỉ khi chọn "schema") ──
      const businessCols = (bundle.schema.collections ?? []).filter((c: any) => businessColNames.has(c.name));
      if (parts.schema) {
        let businessFields = (bundle.schema.fields ?? []).filter((f: any) => businessColNames.has(f.collectionName));
        // Nhìn trước app đích để xử lý TRÙNG TÊN theo chiến lược đã chọn (1.12.0).
        const targetColNames = await getTargetCollectionNames(sequelize);
        const targetFieldKeys = await getTargetFieldKeys(sequelize);
        // Tập collection mà join category được phép ghi (append: chỉ bảng MỚI — không re-gán nhóm
        // cho bảng đang có; overwrite: mọi bảng như hành vi cũ).
        let categoryColNames: Set<string> = businessColNames;

        if (strategy === 'append') {
          // APPEND: giữ nguyên mọi thứ đã có — chỉ chèn collection mới + cột mới.
          const newCols = businessCols.filter((c: any) => !targetColNames.has(c.name));
          categoryColNames = new Set(newCols.map((c: any) => c.name));
          const keptCols = businessCols.length - newCols.length;
          const colCount = await upsertRows(sequelize, SYSTEM_TABLE_NAMES.collections, newCols, 'name', { ignoreExisting: true });
          steps.push({ step: 'schema.collections', status: 'ok', count: colCount });
          if (keptCols > 0) steps.push({ step: 'schema.collections.kept', status: 'skipped', count: keptCols });

          const newFields = businessFields.filter((f: any) => !targetFieldKeys.has(fieldNameKey(f.collectionName, f.name)));
          const keptFields = businessFields.length - newFields.length;
          const fieldCount = await upsertRows(sequelize, SYSTEM_TABLE_NAMES.fields, newFields, 'key', { ignoreExisting: true });
          steps.push({ step: 'schema.fields', status: 'ok', count: fieldCount });
          if (keptFields > 0) steps.push({ step: 'schema.fields.kept', status: 'skipped', count: keptFields });
        } else {
          // OVERWRITE: file thắng. Field trùng TÊN nhưng KHÁC `key` nội bộ trước đây bị bỏ qua im
          // lặng (INSERT đụng UNIQUE(collectionName,name) → warn) → giờ REMAP key bundle về key
          // target rồi upsert theo `key` như thường: bản ghi target được cập nhật TẠI CHỖ, mọi tham
          // chiếu tới key cũ (parentKey/reverseKey của field khác, FK ngầm) còn nguyên. Key của
          // bundle bị bỏ — lần re-import sau lại remap y hệt nên kết quả ổn định.
          const remap = new Map<string, string>();
          for (const f of businessFields) {
            const targetKey = targetFieldKeys.get(fieldNameKey(f.collectionName, f.name));
            if (targetKey && targetKey !== f.key) remap.set(f.key, targetKey);
          }
          if (remap.size > 0) {
            businessFields = businessFields.map((f: any) => ({
              ...f,
              key: remap.get(f.key) ?? f.key,
              ...(f.parentKey != null && remap.has(f.parentKey) ? { parentKey: remap.get(f.parentKey) } : {}),
              ...(f.reverseKey != null && remap.has(f.reverseKey) ? { reverseKey: remap.get(f.reverseKey) } : {}),
            }));
          }

          const colCount = await upsertRows(sequelize, SYSTEM_TABLE_NAMES.collections, businessCols, 'name');
          steps.push({ step: 'schema.collections', status: 'ok', count: colCount });
          const fieldCount = await upsertRows(sequelize, SYSTEM_TABLE_NAMES.fields, businessFields, 'key');
          steps.push({ step: 'schema.fields', status: 'ok', count: fieldCount });
          if (remap.size > 0) steps.push({ step: 'schema.fields.overwrote-same-name', status: 'ok', count: remap.size });
        }

        // Collection categories (nhóm bảng) — append: chỉ thêm nhóm mới, không đổi tên nhóm đang có
        await upsertRows(
          sequelize,
          SYSTEM_TABLE_NAMES.collectionCategories,
          bundle.schema.collectionCategories ?? [],
          'id',
          strategy === 'append' ? { ignoreExisting: true } : undefined,
        );
        // join collectionCategory không có unique → replace theo (collectionName, categoryId)
        const categoryJoinRows = (bundle.schema.collectionCategory ?? []).filter(
          (r: any) => strategy !== 'append' || categoryColNames.has(r.collectionName),
        );
        await replaceRows(sequelize, SYSTEM_TABLE_NAMES.collectionCategory, categoryJoinRows, ['collectionName', 'categoryId']);
      } else {
        steps.push({ step: 'schema.collections', status: 'skipped' });
        steps.push({ step: 'schema.fields', status: 'skipped' });
      }

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
        // Chỉ reload + tạo bảng khi có import schema và có collection được chọn. Nếu người dùng chỉ
        // import UI/roles/workflows (schema OFF) thì bỏ qua — bảng vật lý đã có sẵn trên app đích.
        if (parts.schema && businessCols.length > 0) {
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
        } else {
          steps.push({ step: 'db.sync', status: 'skipped' });
        }

        // ── STEP 4: Roles & Permissions ─────────────────────────────────
        if (parts.roles && (bundle.acl?.roles ?? []).length > 0) {
          const roleCount = await upsertRows(sequelize, SYSTEM_TABLE_NAMES.roles, bundle.acl.roles, 'name');
          await upsertRows(sequelize, SYSTEM_TABLE_NAMES.rolesResources, bundle.acl.rolesResources ?? [], 'id');
          await upsertRows(sequelize, SYSTEM_TABLE_NAMES.rolesResourcesActions, bundle.acl.rolesResourcesActions ?? [], 'id');
          await upsertRows(sequelize, SYSTEM_TABLE_NAMES.rolesResourcesScopes, bundle.acl.rolesResourcesScopes ?? [], 'id');
          steps.push({ step: 'acl.roles', status: 'ok', count: roleCount });
        } else {
          steps.push({ step: 'acl.roles', status: 'skipped' });
        }

        // ── STEP 5: UI Schemas + Menu/Routes ────────────────────────────
        if (parts.ui && (bundle.ui?.uiSchemas ?? []).length > 0) {
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
        if (parts.workflows && (bundle.workflows?.workflows ?? []).length > 0) {
          const wfCount = await upsertRows(sequelize, SYSTEM_TABLE_NAMES.workflows, bundle.workflows.workflows, 'id');
          await upsertRows(sequelize, SYSTEM_TABLE_NAMES.flowNodes, bundle.workflows.flow_nodes ?? [], 'id');
          steps.push({ step: 'workflows', status: 'ok', count: wfCount });
        } else {
          steps.push({ step: 'workflows', status: 'skipped' });
        }

        // ── STEP 7: Business Data ───────────────────────────────────────
        for (const [collectionName, rows] of Object.entries(bundle.businessData ?? {})) {
          // Honour the selection: a collection not picked at all is skipped silently; one picked for
          // "schema only" (not in the data set) records a skipped step so the report is explicit.
          if (!businessColNames.has(collectionName)) continue;
          if (dataFilter && !dataFilter.has(collectionName)) {
            steps.push({ step: `data.${collectionName}`, status: 'skipped' });
            continue;
          }
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
            // Strategy áp cả vào DATA: append = dòng trùng khóa GIỮ NGUYÊN (DO NOTHING), chỉ chèn
            // dòng mới; overwrite = upsert như cũ (dòng trùng khóa bị ghi đè theo file).
            const pkCols = await getTablePkColumns(sequelize, tableName);
            const dataCount = pkCols.length > 0
              ? await upsertRows(sequelize, tableName, rows, pkCols, strategy === 'append' ? { ignoreExisting: true } : undefined)
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
   * importing. Fields are matched by name+key. A bundle field whose NAME already exists on the target
   * under a DIFFERENT key lands in `conflictFields` — what happens to it depends on the chosen
   * conflictStrategy (append → kept untouched, overwrite → overwritten via key-remap); the client
   * renders the numbers with the right narrative for the selected strategy.
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
      bundleContents: {
        ui: (bundle.ui?.uiSchemas?.length ?? 0) + (bundle.ui?.flowModels?.length ?? 0),
        roles: bundle.acl?.roles?.length ?? 0,
        workflows: bundle.workflows?.workflows?.length ?? 0,
        categories: bundle.schema?.collectionCategories?.length ?? 0,
        dataRows: Object.values(bundle.businessData ?? {}).reduce((s, r) => s + (r?.length ?? 0), 0),
      },
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
        dataRows: (bundle.businessData?.[c.name] ?? []).length,
      });
    }

    // Existing collections first (they're the ones with potential conflicts), then alphabetical.
    report.collections.sort(
      (a, b) => Number(b.existsOnTarget) - Number(a.existsOnTarget) || a.name.localeCompare(b.name),
    );
    return report;
  }
}
