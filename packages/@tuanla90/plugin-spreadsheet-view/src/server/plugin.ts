import { Plugin } from '@nocobase/server';

const MAX_OPS = 2000;

/**
 * Spreadsheet view — server: action `<collection>:bulkSync` + `<collection>:ptdlResequenceSort`.
 * - bulkSync: nhận { updates:[{filterByTk, values}], creates:[values], deletes:[tk] } và chạy trong MỘT
 *   transaction — hoặc tất cả thành công hoặc rollback toàn bộ (nâng trần paste/fill-down của client).
 * - ptdlResequenceSort: chuẩn hoá cột sort về 1..N trước mỗi lần kéo-thả dòng (dọn sort TRÙNG/NULL do
 *   dữ liệu import/SQL ngoài luồng — xem doc tại handler).
 *
 * ACL: action mở qua `acl.allow('*', ..., 'loggedIn')` để qua middleware, nhưng handler tự check
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

      /**
       * Chuẩn hoá cột sort về 1..N (theo từng scope nếu sort field có scopeKey).
       * VÌ SAO: dữ liệu tạo ngoài luồng chuẩn (import cloner/gsheet-sync, INSERT SQL, workflow…) không
       * qua hook cấp sort → cột sort TRÙNG hoặc NULL. Action `:move` của NocoBase shift theo KHOẢNG GIÁ
       * TRỊ và GIẢ ĐỊNH sort duy nhất — gặp trùng là mỗi lần kéo dòng nhảy lung tung + đẻ thêm trùng.
       * Client (spreadsheet) gọi action này ngay trước mỗi `:move`.
       * - Chỉ UPDATE những dòng lệch số → bảng đã chuẩn = 1 câu SELECT, không ghi gì.
       * - hooks:false + silent:true → không bump updatedAt, không kích workflow/change-log hàng loạt.
       * - Thứ tự chuẩn = (scope,) sort NULLS LAST, pk — trùng ORDER BY sort client đang hiển thị.
       */
      ptdlResequenceSort: async (ctx: any, next: any) => {
        const resourceName = ctx.action?.resourceName;
        const values = ctx.action?.params?.values || {};
        const sortFieldName = String(values.sortField || 'sort');
        const collection = this.db.getCollection(resourceName);
        if (!collection) ctx.throw(400, `ptdlResequenceSort: unknown collection ${resourceName}`);
        const field: any = collection.getField?.(sortFieldName);
        const isSortField = !!field && (field.type === 'sort' || field?.options?.interface === 'sort');
        if (!isSortField) ctx.throw(400, `ptdlResequenceSort: "${sortFieldName}" is not a sort field of ${resourceName}`);

        // Đổi thứ tự = quyền update trên collection (root bỏ qua) — cùng pattern bulkSync.
        const role = ctx.state?.currentRole;
        const acl: any = (this.app as any).acl;
        const canUpdate =
          role === 'root' ||
          (() => {
            try {
              return !!acl?.can?.({ role, resource: resourceName, action: 'update' });
            } catch {
              return false;
            }
          })();
        if (!canUpdate) ctx.throw(403, 'ptdlResequenceSort: no update permission');

        const model: any = (collection as any).model;
        const pk: string | undefined = model?.primaryKeyAttribute;
        if (!pk) ctx.throw(400, 'ptdlResequenceSort: collection has no primary key');
        const scopeKey: string | undefined = field?.options?.scopeKey || undefined;

        // Trần an toàn: bảng quá lớn thì thôi (kéo-thả sort bảng cỡ đó cũng vô nghĩa) — move vẫn chạy như cũ.
        const total = await model.count();
        if (total > 50000) {
          ctx.body = { total, changed: 0, skipped: true };
          return next();
        }

        const attrs = [pk!, sortFieldName];
        if (scopeKey && scopeKey !== pk && scopeKey !== sortFieldName) attrs.push(scopeKey);
        const rows: any[] = await model.findAll({ attributes: attrs, raw: true });
        const num = (v: any) => (v === null || v === undefined || Number.isNaN(Number(v)) ? Number.POSITIVE_INFINITY : Number(v));
        rows.sort((a, b) => {
          if (scopeKey) {
            const sa = a[scopeKey] == null ? '' : String(a[scopeKey]);
            const sb = b[scopeKey] == null ? '' : String(b[scopeKey]);
            if (sa !== sb) return sa < sb ? -1 : 1;
          }
          const d = num(a[sortFieldName]) - num(b[sortFieldName]);
          if (d) return d;
          // pk tiebreak (numeric-aware) → dòng trùng sort có vị trí ỔN ĐỊNH qua các lần chạy
          return String(a[pk!]).localeCompare(String(b[pk!]), undefined, { numeric: true });
        });

        const changes: Array<{ id: any; v: number }> = [];
        let curScope: any = Symbol('init');
        let n = 0;
        for (const r of rows) {
          if (scopeKey) {
            const s = r[scopeKey] == null ? null : String(r[scopeKey]);
            if (s !== curScope) { curScope = s; n = 0; }
          }
          n += 1;
          if (Number(r[sortFieldName]) !== n) changes.push({ id: r[pk!], v: n });
        }

        if (changes.length) {
          await this.db.sequelize.transaction(async (transaction: any) => {
            for (const c of changes) {
              await model.update(
                { [sortFieldName]: c.v },
                { where: { [pk!]: c.id }, transaction, hooks: false, silent: true, validate: false },
              );
            }
          });
        }
        ctx.body = { total: rows.length, changed: changes.length };
        await next();
      },
    });
    // Cho action đi qua ACL middleware; quyền thật check trong handler theo role + collection.
    (this.app as any).acl?.allow?.('*', 'bulkSync', 'loggedIn');
    (this.app as any).acl?.allow?.('*', 'ptdlResequenceSort', 'loggedIn');
  }
}

export default PluginSpreadsheetViewServer;
