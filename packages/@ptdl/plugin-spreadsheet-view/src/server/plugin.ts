import { Plugin } from '@nocobase/server';

const MAX_OPS = 2000;

/**
 * Spreadsheet view — server: action `<collection>:bulkSync`.
 * Nhận { updates:[{filterByTk, values}], creates:[values], deletes:[tk] } và chạy trong MỘT
 * transaction — hoặc tất cả thành công hoặc rollback toàn bộ (nâng trần paste/fill-down của client).
 *
 * ACL: action mở qua `acl.allow('*','bulkSync','loggedIn')` để qua middleware, nhưng handler tự check
 * quyền create/update/destroy CỦA ĐÚNG collection theo role hiện tại trước khi chạy (root bỏ qua).
 * (Row-level ACL của with-acl-meta chưa áp ở đây — ghi nhận giới hạn v1.1.)
 */
export class PluginSpreadsheetViewServer extends Plugin {
  async load() {
    this.app.resourceManager.registerActionHandlers({
      bulkSync: async (ctx: any, next: any) => {
        const resourceName = ctx.action?.resourceName;
        const values = ctx.action?.params?.values || {};
        const updates: any[] = Array.isArray(values.updates) ? values.updates : [];
        const creates: any[] = Array.isArray(values.creates) ? values.creates : [];
        const deletes: any[] = Array.isArray(values.deletes) ? values.deletes : [];

        const collection = this.db.getCollection(resourceName);
        if (!collection) ctx.throw(400, `bulkSync: unknown collection ${resourceName}`);
        const total = updates.length + creates.length + deletes.length;
        if (!total) {
          ctx.body = { updated: 0, created: 0, deleted: 0 };
          return next();
        }
        if (total > MAX_OPS) ctx.throw(413, `bulkSync: too many operations (${total} > ${MAX_OPS})`);

        // Check quyền theo role hiện tại cho từng loại op (collection-level).
        const role = ctx.state?.currentRole;
        const acl: any = (this.app as any).acl;
        const can = (action: string) => {
          if (role === 'root') return true;
          try {
            return !!acl?.can?.({ role, resource: resourceName, action });
          } catch {
            return false;
          }
        };
        if (updates.length && !can('update')) ctx.throw(403, 'bulkSync: no update permission');
        if (creates.length && !can('create')) ctx.throw(403, 'bulkSync: no create permission');
        if (deletes.length && !can('destroy')) ctx.throw(403, 'bulkSync: no destroy permission');

        const repo: any = this.db.getRepository(resourceName);
        await this.db.sequelize.transaction(async (transaction: any) => {
          // Optimistic concurrency (opt-in per update): client gửi expectUpdatedAt = updatedAt lúc load;
          // record đã bị người khác sửa (mới hơn >1s) → 409, rollback toàn bộ.
          const conflicts: any[] = [];
          for (const u of updates) {
            if (!u?.expectUpdatedAt || u?.filterByTk === undefined || u?.filterByTk === null) continue;
            const cur = await repo.findOne({ filterByTk: u.filterByTk, fields: ['updatedAt'], transaction });
            const curTs = cur?.updatedAt ? new Date(cur.updatedAt).getTime() : null;
            const expTs = new Date(u.expectUpdatedAt).getTime();
            if (curTs && Number.isFinite(expTs) && curTs - expTs > 1000) conflicts.push(u.filterByTk);
          }
          if (conflicts.length) {
            ctx.throw(409, `bulkSync conflict: rows ${conflicts.join(',')} were modified by someone else`);
          }
          for (const u of updates) {
            if (u?.filterByTk === undefined || u?.filterByTk === null || !u?.values) continue;
            await repo.update({ filterByTk: u.filterByTk, values: u.values, transaction });
          }
          for (const c of creates) {
            if (!c || typeof c !== 'object') continue;
            await repo.create({ values: c, transaction });
          }
          if (deletes.length) {
            await repo.destroy({ filterByTk: deletes, transaction });
          }
        });

        ctx.body = { updated: updates.length, created: creates.length, deleted: deletes.length };
        await next();
      },
    });
    // Cho action đi qua ACL middleware; quyền thật check trong handler theo role + collection.
    (this.app as any).acl?.allow?.('*', 'bulkSync', 'loggedIn');
  }
}

export default PluginSpreadsheetViewServer;
