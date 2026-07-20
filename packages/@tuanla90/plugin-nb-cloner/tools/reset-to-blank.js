#!/usr/bin/env node
/*
 * reset-to-blank.js — CÔNG CỤ TEST (không phải feature UI).
 *
 * Đưa một app NocoBase về trạng thái "trắng": xoá MỌI thứ được xây
 * (bảng business + data, toàn bộ UI/trang, menu/routes, workflow, ACL custom, categories).
 * GIỮ LẠI: các bảng hệ thống, users, và role mặc định (root/admin/member) → vẫn đăng nhập được.
 *
 * Dùng cho app ĐÍCH dùng-để-test import lặp đi lặp lại. ĐỪNG chạy trên app nguồn có dữ liệu thật.
 * PostgreSQL only (giống chính plugin).
 *
 * USAGE (chạy trong container từ /app/nocobase, hoặc nơi nào có sequelize):
 *   node reset-to-blank.js --url "postgresql://user:pass@host:port/db"          # DRY-RUN: chỉ in kế hoạch
 *   node reset-to-blank.js --url "postgresql://user:pass@host:port/db" --yes     # THỰC THI
 *
 * Khuyến nghị backup trước khi --yes:
 *   pg_dump "postgresql://..." > backup.sql
 */

const { Sequelize } = require('sequelize');

// ── args ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const argVal = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const url = argVal('--url') || process.env.RESET_DB_URL;
const EXECUTE = args.includes('--yes');
const NO_SSL = args.includes('--no-ssl'); // dùng cho postgres local (không hỗ trợ SSL như Railway)

if (!url) {
  console.error('❌ Thiếu --url "postgresql://user:pass@host:port/db"');
  process.exit(1);
}

// ── Ranh giới system/business: tái dùng từ plugin, fallback nếu không require được ──
let SYSTEM_COLLECTION_NAMES;
try {
  ({ SYSTEM_COLLECTION_NAMES } = require('@tuanla90/plugin-nb-cloner/dist/server/utils/constants'));
} catch {
  try {
    ({ SYSTEM_COLLECTION_NAMES } = require('../dist/server/utils/constants'));
  } catch {
    SYSTEM_COLLECTION_NAMES = new Set([
      'collections','fields','collectionCategories','collectionCategory','blockTemplates',
      'uiSchemas','uiSchemaServerHooks','uiSchemaTemplates','uiSchemaTreePath',
      'desktopRoutes','mobileRoutes','rolesDesktopRoutes','rolesMobileRoutes','rolesUischemas',
      'users','roles','rolesResources','rolesResourcesActions','rolesResourcesScopes','rolesUsers',
      'applications','applicationPlugins','attachments','storages',
      'workflows','flow_nodes','executions','jobs','actionLogs',
      'dataSources','dataSourcesCollections','dataSourcesFields',
      'migrations','sequences','verifications','authenticators','departments','departmentsUsers',
    ]);
  }
}

// ── Các bảng "lớp được xây" sẽ bị xoá TOÀN BỘ rows (thứ tự con → cha để né FK) ──
const WIPE_IN_ORDER = [
  // UI (uiSchemas cũ)
  'uiSchemaTreePath', 'uiSchemaServerHooks', 'uiSchemaTemplates', 'uiSchemas',
  // Flow-engine (kiểu UI mới 2.x): closure/tree + template trước, model sau (né FK)
  'flowModelTreePath', 'flowModelTemplateUsages', 'flowModelTemplates', 'flowSql', 'flowModels',
  // Menu / routes (đóng bảng closure *_path trước khi xoá routes để né FK)
  'rolesDesktopRoutes', 'rolesMobileRoutes', 'rolesUischemas',
  'main_desktopRoutes_path', 'main_mobileRoutes_path', 'main_dropdowns_path',
  'desktopRoutes', 'mobileRoutes',
  // Workflow (runtime trước, definition sau)
  'jobs', 'executions', 'flow_nodes', 'workflowVersionStats', 'workflows', 'workflowCategories',
  // ACL custom (children trước)
  'rolesResourcesActions', 'rolesResourcesScopes', 'rolesResources',
  // Custom requests / block templates
  'customRequestsRoles', 'customRequests', 'blockTemplates',
  // Categories (join trước)
  'collectionCategory', 'collectionCategories',
];

const pgIdent = (n) => `"${String(n).replace(/"/g, '""')}"`;

(async () => {
  const seq = new Sequelize(url, {
    dialect: 'postgres',
    dialectOptions: NO_SSL ? {} : { ssl: { require: true, rejectUnauthorized: false } },
    logging: false,
  });

  await seq.authenticate();
  const SELECT = { type: Sequelize.QueryTypes.SELECT };
  // Tùy query, sequelize có thể trả row dạng object {col:val} hoặc mảng [val] → đọc cả hai.
  const cell = (row, key, idx = 0) => (row && row[key] !== undefined ? row[key] : row[idx]);
  const countOf = async (tbl) => cell((await seq.query(`SELECT count(*)::int AS count FROM ${pgIdent(tbl)}`, SELECT))[0], 'count');
  const host = (() => { try { return new URL(url).host; } catch { return '?'; } })();
  console.log(`\n🎯 Target DB: ${host}`);
  console.log(EXECUTE ? '⚠️  MODE: EXECUTE (sẽ xoá thật)\n' : 'ℹ️  MODE: DRY-RUN (chỉ xem, chưa xoá)\n');

  // Bảng nào thực sự tồn tại?
  const existing = await seq.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema='public'`, SELECT,
  );
  const tableExists = new Set(existing.map((r) => cell(r, 'table_name')));

  // ── 1. Business collections = trong bảng collections & KHÔNG thuộc system ──
  const cols = await seq.query(`SELECT name, options FROM collections`, SELECT);
  const business = cols
    .map((c) => ({ name: cell(c, 'name', 0), options: cell(c, 'options', 1) }))
    .filter((c) => !SYSTEM_COLLECTION_NAMES.has(c.name))
    .map((c) => {
      const opts = typeof c.options === 'string' ? JSON.parse(c.options || '{}') : (c.options || {});
      return { name: c.name, table: opts.tableName || c.name };
    });

  // ── PLAN (đếm những gì sẽ xoá) ──
  console.log('── Lớp được-xây sẽ XOÁ TOÀN BỘ rows ──');
  for (const t of WIPE_IN_ORDER) {
    if (!tableExists.has(t)) continue;
    const count = await countOf(t);
    if (count > 0) console.log(`   ${t.padEnd(24)} ${count} rows`);
  }

  console.log(`\n── Business collections sẽ DROP (${business.length}) ──`);
  for (const b of business) {
    let rows = 'n/a';
    if (tableExists.has(b.table)) {
      rows = `${await countOf(b.table)} rows`;
    }
    console.log(`   ${b.name.padEnd(28)} table=${b.table.padEnd(28)} ${rows}`);
  }

  console.log('\n── GIỮ LẠI: system tables, users, roles (root/admin/member), rolesUsers ──');

  if (!EXECUTE) {
    console.log('\n✅ Dry-run xong. Thêm --yes để thực thi. (Nên pg_dump backup trước.)');
    await seq.close();
    return;
  }

  // ── EXECUTE trong 1 transaction (Postgres cho phép rollback cả DDL) ──
  const t = await seq.transaction();
  try {
    for (const tbl of WIPE_IN_ORDER) {
      if (!tableExists.has(tbl)) continue;
      await seq.query(`DELETE FROM ${pgIdent(tbl)}`, { transaction: t });
    }
    for (const b of business) {
      if (tableExists.has(b.table)) {
        await seq.query(`DROP TABLE IF EXISTS ${pgIdent(b.table)} CASCADE`, { transaction: t });
      }
      await seq.query(`DELETE FROM fields WHERE "collectionName" = :n`, { replacements: { n: b.name }, transaction: t });
      await seq.query(`DELETE FROM collections WHERE name = :n`, { replacements: { n: b.name }, transaction: t });
    }
    await t.commit();
    console.log('\n✅ ĐÃ RESET. Chạy: docker compose restart app  (để NocoBase nạp lại schema trắng).');
  } catch (err) {
    await t.rollback();
    console.error('\n❌ Lỗi → đã rollback, DB không đổi:', err.message);
    process.exit(1);
  }

  await seq.close();
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
