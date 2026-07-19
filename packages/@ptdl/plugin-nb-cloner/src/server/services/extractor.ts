import { Database } from '@nocobase/database';
import { BUNDLE_VERSION, SYSTEM_TABLE_NAMES } from '../utils/constants';
import { pgIdent, assertPostgres } from '../utils/db';

export interface ExportSelection {
  // System collections luôn được export schema
  includeSystemSchema: boolean;
  // UI Schemas (layout, blocks, menus)
  includeUiSchemas: boolean;
  // Roles & Permissions
  includeRoles: boolean;
  // Workflows definitions (không phải executions)
  includeWorkflows: boolean;
  // Business collections được chọn
  businessCollections: Array<{
    name: string;
    includeData: boolean; // true = copy cả rows, false = chỉ copy schema
  }>;
}

export interface BundleData {
  manifest: {
    version: string;
    exportedAt: string;
    nocobaseVersion: string;
    appName: string;
  };
  schema: {
    collections: any[];
    fields: any[];
    collectionCategories: any[];
    collectionCategory: any[];        // join collection ↔ category
  };
  ui: {
    uiSchemas: any[];
    uiSchemaTreePath: any[];
    uiSchemaTemplates: any[];
    uiSchemaServerHooks: any[];
    // Flow-engine (kiểu UI mới): nội dung trang/block flowPage. THIẾU cái này → trang trắng.
    flowModels: any[];
    flowModelTreePath: any[];
    flowModelTemplates: any[];
    flowModelTemplateUsages: any[];
    desktopRoutesPath: any[];
    // Menu / điều hướng 2.1.9 — thứ trước đây bị thiếu khiến app đích trắng menu
    desktopRoutes: any[];
    mobileRoutes: any[];
    rolesDesktopRoutes: any[];
    rolesMobileRoutes: any[];
    rolesUischemas: any[];
  };
  acl: {
    roles: any[];
    rolesResources: any[];
    rolesResourcesActions: any[];
    rolesResourcesScopes: any[];
  };
  workflows: {
    workflows: any[];
    flow_nodes: any[];
  };
  businessData: Record<string, any[]>; // key = collection name
}

// ─── Extractor class ──────────────────────────────────────────────────────────

export class Extractor {
  constructor(private db: Database) {}

  /**
   * Query tất cả rows từ một bảng system (tên bảng đến từ SYSTEM_TABLE_NAMES).
   * Dùng pgIdent để escape an toàn.
   */
  private async queryAll(tableName: string, whereClause?: string): Promise<any[]> {
    try {
      const safeTable = pgIdent(tableName);
      const sql = whereClause
        ? `SELECT * FROM ${safeTable} WHERE ${whereClause}`
        : `SELECT * FROM ${safeTable}`;
      const [rows] = await this.db.sequelize.query(sql);
      return rows as any[];
    } catch (err) {
      console.warn(`[nb-cloner] Warning: could not query ${tableName}:`, err);
      return [];
    }
  }

  async extract(selection: ExportSelection, appName: string): Promise<BundleData> {
    // Export dựa trên SQL đặc thù PostgreSQL — chặn sớm nếu chạy trên dialect khác.
    assertPostgres(this.db);

    const bundle: BundleData = {
      manifest: {
        version: BUNDLE_VERSION,           // ← dùng constant, không hardcode '1.0.0'
        exportedAt: new Date().toISOString(),
        nocobaseVersion: '2.x',
        appName,
      },
      schema: { collections: [], fields: [], collectionCategories: [], collectionCategory: [] },
      ui: {
        uiSchemas: [],
        uiSchemaTreePath: [],
        uiSchemaTemplates: [],
        uiSchemaServerHooks: [],
        flowModels: [],
        flowModelTreePath: [],
        flowModelTemplates: [],
        flowModelTemplateUsages: [],
        desktopRoutesPath: [],
        desktopRoutes: [],
        mobileRoutes: [],
        rolesDesktopRoutes: [],
        rolesMobileRoutes: [],
        rolesUischemas: [],
      },
      acl: {
        roles: [],
        rolesResources: [],
        rolesResourcesActions: [],
        rolesResourcesScopes: [],
      },
      workflows: { workflows: [], flow_nodes: [] },
      businessData: {},
    };

    // ── 1. SCHEMA: collections + fields + categories ──────────────────────────
    if (selection.includeSystemSchema || selection.businessCollections.length > 0) {
      bundle.schema.collections          = await this.queryAll(SYSTEM_TABLE_NAMES.collections);
      bundle.schema.fields               = await this.queryAll(SYSTEM_TABLE_NAMES.fields);
      bundle.schema.collectionCategories = await this.queryAll(SYSTEM_TABLE_NAMES.collectionCategories);
      bundle.schema.collectionCategory   = await this.queryAll(SYSTEM_TABLE_NAMES.collectionCategory);
    }

    // ── 2. UI SCHEMAS + MENU/ROUTES ───────────────────────────────────────────
    if (selection.includeUiSchemas) {
      bundle.ui.uiSchemas           = await this.queryAll(SYSTEM_TABLE_NAMES.uiSchemas);
      bundle.ui.uiSchemaTreePath    = await this.queryAll(SYSTEM_TABLE_NAMES.uiSchemaTreePath);
      bundle.ui.uiSchemaTemplates   = await this.queryAll(SYSTEM_TABLE_NAMES.uiSchemaTemplates);
      bundle.ui.uiSchemaServerHooks = await this.queryAll(SYSTEM_TABLE_NAMES.uiSchemaServerHooks);
      // Flow-engine: nội dung trang/block flowPage (kiểu UI mới của NocoBase 2.x)
      bundle.ui.flowModels             = await this.queryAll(SYSTEM_TABLE_NAMES.flowModels);
      bundle.ui.flowModelTreePath      = await this.queryAll(SYSTEM_TABLE_NAMES.flowModelTreePath);
      bundle.ui.flowModelTemplates     = await this.queryAll(SYSTEM_TABLE_NAMES.flowModelTemplates);
      bundle.ui.flowModelTemplateUsages = await this.queryAll(SYSTEM_TABLE_NAMES.flowModelTemplateUsages);
      bundle.ui.desktopRoutesPath      = await this.queryAll(SYSTEM_TABLE_NAMES.desktopRoutesPath);
      // Menu/điều hướng (2.1.9): trước đây bị thiếu hoàn toàn → app đích không có trang nào
      bundle.ui.desktopRoutes       = await this.queryAll(SYSTEM_TABLE_NAMES.desktopRoutes);
      bundle.ui.mobileRoutes        = await this.queryAll(SYSTEM_TABLE_NAMES.mobileRoutes);
      bundle.ui.rolesDesktopRoutes  = await this.queryAll(SYSTEM_TABLE_NAMES.rolesDesktopRoutes);
      bundle.ui.rolesMobileRoutes   = await this.queryAll(SYSTEM_TABLE_NAMES.rolesMobileRoutes);
      bundle.ui.rolesUischemas      = await this.queryAll(SYSTEM_TABLE_NAMES.rolesUischemas);
    }

    // ── 3. ROLES & PERMISSIONS ────────────────────────────────────────────────
    if (selection.includeRoles) {
      // Loại trừ role mặc định để tránh conflict với app đích
      bundle.acl.roles = await this.queryAll(
        SYSTEM_TABLE_NAMES.roles,
        `"name" NOT IN ('root', 'admin', 'member')`,
      );
      bundle.acl.rolesResources        = await this.queryAll(SYSTEM_TABLE_NAMES.rolesResources);
      bundle.acl.rolesResourcesActions = await this.queryAll(SYSTEM_TABLE_NAMES.rolesResourcesActions);
      bundle.acl.rolesResourcesScopes  = await this.queryAll(SYSTEM_TABLE_NAMES.rolesResourcesScopes);
    }

    // ── 4. WORKFLOWS (chỉ definitions, không lấy executions/jobs) ────────────
    if (selection.includeWorkflows) {
      bundle.workflows.workflows = await this.queryAll(
        SYSTEM_TABLE_NAMES.workflows,
        `"type" IS NOT NULL`,
      );
      bundle.workflows.flow_nodes = await this.queryAll(SYSTEM_TABLE_NAMES.flowNodes);
    }

    // ── 5. BUSINESS DATA ──────────────────────────────────────────────────────
    for (const item of selection.businessCollections) {
      if (item.includeData) {
        const collection = this.db.getCollection(item.name);
        if (!collection) continue;
        // tableName() trả về tên đã được NocoBase resolve — escape khi dùng
        const tableName = (collection as any).tableName() as string;
        bundle.businessData[item.name] = await this.queryAll(tableName);
      } else {
        // Chỉ đánh dấu collection được chọn, không lấy data
        bundle.businessData[item.name] = [];
      }
    }

    return bundle;
  }
}
