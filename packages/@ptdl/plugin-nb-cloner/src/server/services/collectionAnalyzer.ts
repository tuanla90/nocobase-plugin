import { Database } from '@nocobase/database';
import { SYSTEM_COLLECTION_NAMES } from '../utils/constants';
import { pgIdent } from '../utils/db';

export interface CollectionInfo {
  name: string;
  title: string;
  type: 'system' | 'business';
  tableName: string;
  fieldsCount: number;
  rowCount?: number;
  options: Record<string, any>;
}

export class CollectionAnalyzer {
  constructor(private db: Database) {}

  async analyze(): Promise<{ system: CollectionInfo[]; business: CollectionInfo[] }> {
    const system: CollectionInfo[] = [];
    const business: CollectionInfo[] = [];

    const allCollections = this.db.collections;

    for (const [name, collection] of allCollections) {
      const options = (collection as any).options || {};
      // Bỏ qua view và collection ẩn
      if (options.view) continue;

      const rawTableName: string = (collection as any).tableName() as string;

      let rowCount: number | undefined;
      try {
        // Escape tên bảng qua pgIdent — tránh SQL injection nếu tableName có ký tự đặc biệt
        const result = (await this.db.sequelize.query(
          `SELECT COUNT(*) AS count FROM ${pgIdent(rawTableName)}`,
          { plain: true },
        )) as any;
        rowCount = parseInt(result?.count ?? '0', 10);
      } catch {
        rowCount = undefined;
      }

      const info: CollectionInfo = {
        name,
        title: options.title || name,
        type: SYSTEM_COLLECTION_NAMES.has(name) ? 'system' : 'business',
        tableName: rawTableName,
        fieldsCount: collection.fields.size,
        rowCount,
        options,
      };

      if (info.type === 'system') {
        system.push(info);
      } else {
        business.push(info);
      }
    }

    system.sort((a, b) => a.name.localeCompare(b.name));
    business.sort((a, b) => a.name.localeCompare(b.name));

    return { system, business };
  }
}
