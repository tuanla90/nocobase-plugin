/**
 * Danh sách các bảng hệ thống của NocoBase v2.x — dùng để phân loại: system vs business.
 * (System collections of NocoBase v2.x, used to split system vs business collections.)
 */
export const SYSTEM_COLLECTION_NAMES = new Set([
  // Core schema
  'collections',
  'fields',
  // UI
  'uiSchemas',
  'uiSchemaServerHooks',
  'uiSchemaTemplates',
  'uiSchemaTreePath',
  'collectionCategories',
  'collectionCategory',
  'blockTemplates',
  // Flow-engine (kiểu UI mới)
  'flowModels',
  'flowModelTreePath',
  'main_desktopRoutes_path',
  // Menu / routes (2.1.9)
  'desktopRoutes',
  'mobileRoutes',
  'rolesDesktopRoutes',
  'rolesMobileRoutes',
  'rolesUischemas',
  // Auth / Users
  'users',
  'roles',
  'rolesResources',
  'rolesResourcesActions',
  'rolesResourcesScopes',
  'rolesUsers',
  'rolesMenus',
  // Applications
  'applications',
  'applicationPlugins',
  // Files
  'attachments',
  'storages',
  // Workflow
  'workflows',
  'flow_nodes',
  'executions',
  'jobs',
  // Audit
  'actionLogs',
  // Data sources
  'dataSources',
  'dataSourcesCollections',
  'dataSourcesFields',
  // Misc system
  'migrations',
  'sequences',
  'verifications',
  'authenticators',
  // LƯU Ý: 'departments'/'departmentsUsers' KHÔNG để ở đây nữa.
  // Chúng chỉ là bảng hệ thống khi dùng plugin @nocobase/plugin-departments.
  // Trong app tự-xây, 'departments' thường là bảng NGHIỆP VỤ (user tạo, template general) —
  // nếu liệt kê là system, importer sẽ BỎ QUA → app đích thiếu bảng departments →
  // employees.department (belongsTo) hỏng → lỗi 500 + "Invalid value {name:...}" + trang Phòng ban trắng.
]);

/**
 * Version của bundle format. Importer từ chối bundle có major khác BUNDLE_COMPAT_MAJOR.
 * 1.2.0: bổ sung desktopRoutes/mobileRoutes (menu 2.1.9), fix tên bảng ACL camelCase.
 * 1.3.0: bổ sung flowModelTemplates/flowModelTemplateUsages (block template flow-engine).
 */
export const BUNDLE_VERSION = '1.3.0';

/**
 * Major version tối thiểu bundle phải thoả để import được.
 * Tăng số này khi có breaking change trong format bundle.
 */
export const BUNDLE_COMPAT_MAJOR = 1;

/**
 * Tên bảng thực tế trong DB cho các system tables. Dùng để Extractor query đúng.
 * ⚠️ Đã audit trực tiếp trên NB 2.1.9 (DB thật). ACL là camelCase (rolesResources...),
 * KHÔNG phải snake_case → bản cũ export roles rỗng âm thầm.
 * `rolesMenus` KHÔNG tồn tại ở 2.1.9 — menu nằm ở desktopRoutes/mobileRoutes.
 */
export const SYSTEM_TABLE_NAMES = {
  // Schema
  collections:              'collections',
  fields:                   'fields',
  collectionCategories:     'collectionCategories',
  collectionCategory:       'collectionCategory',        // join: collectionName + categoryId (không unique)
  // UI schemas (kiểu CŨ)
  uiSchemas:                'uiSchemas',
  uiSchemaTreePath:         'uiSchemaTreePath',
  uiSchemaTemplates:        'uiSchemaTemplates',
  uiSchemaServerHooks:      'uiSchemaServerHooks',
  // Flow-engine (kiểu MỚI 2.x) — nội dung trang/block flowPage nằm ở đây, KHÔNG ở uiSchemas
  flowModels:               'flowModels',                 // PK uid
  flowModelTreePath:        'flowModelTreePath',           // PK (ancestor, descendant) — closure table, RẤT nhiều dòng
  flowModelTemplates:       'flowModelTemplates',          // PK uid — block template flow-engine
  flowModelTemplateUsages:  'flowModelTemplateUsages',     // PK uid — liên kết template ↔ model
  // ⚠️ main_desktopRoutes_path dùng PATH-ENUMERATION (cột nodePk/path/rootPk, KHÔNG unique),
  // KHÁC flowModelTreePath (ancestor/descendant). Import phải replaceRows theo nodePk, KHÔNG upsert.
  desktopRoutesPath:        'main_desktopRoutes_path',     // closure table (path-enumeration) của desktopRoutes
  // Menu / điều hướng (2.1.9)
  desktopRoutes:            'desktopRoutes',
  mobileRoutes:             'mobileRoutes',
  rolesDesktopRoutes:       'rolesDesktopRoutes',         // PK (desktopRouteId, roleName)
  rolesMobileRoutes:        'rolesMobileRoutes',          // PK (mobileRouteId, roleName)
  rolesUischemas:           'rolesUischemas',             // join: roleName + uiSchemaXUid (không unique)
  // ACL
  roles:                    'roles',
  rolesResources:           'rolesResources',
  rolesResourcesActions:    'rolesResourcesActions',
  rolesResourcesScopes:     'rolesResourcesScopes',
  // Workflow
  workflows:                'workflows',
  flowNodes:                'flow_nodes',
} as const;
