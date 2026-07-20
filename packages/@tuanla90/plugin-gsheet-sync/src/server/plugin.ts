import { Plugin } from '@nocobase/server';
import {
  parseCredentials,
  extractSpreadsheetId,
  getSpreadsheetMeta,
  ServiceAccount,
} from './google';
import {
  fetchSnapshot,
  fieldDef,
  nbTypeToColType,
  resolveMappedFields,
  rowToRecord,
  serialToDate,
  FieldSpec,
  SHEET_ROW_FIELD,
} from './sync';
import { WritebackManager, PULL_CONTEXT_FLAG } from './writeback';

const CONN_COLLECTION = 'ptdl_gsheet_connections';
const ACCT_COLLECTION = 'ptdl_gsheet_accounts';

// Google Sheets → NocoBase one-way sync. Each connection pulls one sheet tab into a
// real collection (auto-created with inferred field types). Row identity for the
// future write-back V2 is preserved via _sheet_row + optional key column upsert.
export class PluginGsheetSyncServer extends Plugin {
  private timer: any = null;
  private inFlight = new Set<number>();
  private writeback = new WritebackManager(this);

  // ---------- @tuanla90/plugin-formula bracket (pull = bulk write; pause computed rules for its duration) ----------
  // The pull below already runs `hooks:false` (so a live-recompute cascade never fires mid-sync — the SAME
  // reason app-builder's bulk import got explicit disable/enable, see its plugin.ts setComputedEnabled: a
  // table with downstream roll-ups measured ~300x slower per row with rules live vs disabled), which means
  // computed fields are simply never touched by a normal sync. This explicitly pauses rules (defensive — a
  // few paths here, like ensureTargetCollection's field creation, do NOT set hooks:false) and does ONE
  // correct backfill after, in dependency order, so synced data's computed columns are never stale/null.
  private async setComputedEnabled(enabled: boolean): Promise<void> {
    try {
      const repo: any = this.db.getRepository('ptdlComputedRules');
      if (!repo) return;
      await repo.update({ filter: {}, values: { enabled }, forceUpdate: true });
    } catch { /* plugin-formula not installed, or no rules yet — fine, sync proceeds either way */ }
  }
  private async recomputeAllComputed(): Promise<void> {
    try {
      const formulaPlugin: any = this.app.pm.get('@tuanla90/plugin-formula');
      await formulaPlugin?.computed?.recomputeAll?.();
    } catch { /* best-effort */ }
  }

  async load() {
    // Reusable service accounts — register credentials once, pick per connection.
    this.db.collection({
      name: ACCT_COLLECTION,
      hidden: true,
      fields: [
        { type: 'string', name: 'title' },
        { type: 'text', name: 'credentials' }, // service-account JSON, write-only
      ],
    } as any);

    this.db.collection({
      name: CONN_COLLECTION,
      hidden: true,
      fields: [
        { type: 'string', name: 'title' },
        { type: 'text', name: 'credentials' }, // legacy inline SA JSON (fallback when no accountId)
        { type: 'bigInt', name: 'accountId' }, // FK -> ptdl_gsheet_accounts (preferred credential source)
        { type: 'string', name: 'spreadsheetId' },
        { type: 'string', name: 'sheetName' },
        { type: 'string', name: 'range' }, // optional A1 range, empty = whole tab
        { type: 'string', name: 'targetCollection' },
        { type: 'string', name: 'targetMode', defaultValue: 'create' }, // create | existing
        { type: 'json', name: 'mappings', defaultValue: null }, // [{header, field, type?, include?}]
        { type: 'string', name: 'keyColumn' }, // header title used as upsert key
        { type: 'string', name: 'syncMode', defaultValue: 'replace' }, // replace | upsert
        { type: 'boolean', name: 'deleteMissing', defaultValue: false },
        { type: 'boolean', name: 'twoWay', defaultValue: false }, // push NocoBase → Sheet
        { type: 'string', name: 'pushDeletes', defaultValue: 'none' }, // none | clear | delete
        { type: 'integer', name: 'intervalMinutes', defaultValue: 0 }, // 0 = manual only
        { type: 'boolean', name: 'enabled', defaultValue: true },
        { type: 'date', name: 'lastSyncAt' },
        { type: 'string', name: 'lastStatus' }, // ok | error | running
        { type: 'text', name: 'lastError' },
        { type: 'integer', name: 'lastRowCount' },
      ],
    } as any);

    const acl: any = (this.app as any).acl;
    acl?.registerSnippet?.({
      name: 'pm.gsheet-sync',
      actions: ['ptdlGsheet:*'],
    });

    const repo = () => this.db.getRepository(CONN_COLLECTION) as any;
    const acctRepo = () => this.db.getRepository(ACCT_COLLECTION) as any;

    const emailOf = (creds: any) => {
      try {
        return JSON.parse(creds || '{}').client_email || '';
      } catch {
        return '';
      }
    };
    const publicAccount = (row: any) => ({
      id: row.id,
      title: row.title,
      serviceEmail: emailOf(row.credentials),
      hasCredentials: !!row.credentials,
    });

    const publicRow = (row: any) => ({
      id: row.id,
      title: row.title,
      spreadsheetId: row.spreadsheetId,
      sheetName: row.sheetName,
      range: row.range,
      targetCollection: row.targetCollection,
      targetMode: row.targetMode || 'create',
      mappings: row.mappings || null,
      keyColumn: row.keyColumn,
      syncMode: row.syncMode,
      deleteMissing: !!row.deleteMissing,
      twoWay: !!row.twoWay,
      pushDeletes: row.pushDeletes || 'none',
      intervalMinutes: row.intervalMinutes || 0,
      enabled: !!row.enabled,
      lastSyncAt: row.lastSyncAt,
      lastStatus: row.lastStatus,
      lastError: row.lastError,
      lastRowCount: row.lastRowCount,
      accountId: row.accountId ? Number(row.accountId) : null,
      hasCredentials: !!row.credentials, // own inline creds (legacy)
      serviceEmail: emailOf(row.credentials),
      accountTitle: '',
    });

    // Overlay the linked account's title/email onto a public row (accountId wins).
    const withAccount = async (pub: any) => {
      if (pub.accountId) {
        const a = await acctRepo().findOne({ filter: { id: pub.accountId } });
        if (a) return { ...pub, serviceEmail: emailOf(a.credentials), accountTitle: a.title || '' };
      }
      return pub;
    };

    // Resolve the service account for an action: fresh inline credentials win, then a
    // chosen accountId, then whatever the connection row resolves to.
    const resolveSa = async (v: any): Promise<ServiceAccount> => {
      if (typeof v.credentials === 'string' && v.credentials.trim()) return parseCredentials(v.credentials);
      if (v.accountId) {
        const a = await acctRepo().findOne({ filter: { id: v.accountId } });
        if (a?.credentials) return parseCredentials(a.credentials);
      }
      if (v.id) {
        const row = await repo().findOne({ filter: { id: v.id } });
        if (row) return parseCredentials(await this.resolveConnCredentials(row));
      }
      throw new Error('Chưa có credentials — chọn hoặc thêm Service Account');
    };

    (this.app as any).resourceManager?.define?.({
      name: 'ptdlGsheet',
      actions: {
        listConnections: async (ctx: any, next: any) => {
          const rows = await repo().find({ sort: ['-id'] });
          ctx.body = await Promise.all(rows.map((r: any) => withAccount(publicRow(r))));
          await next();
        },

        // ---- reusable service accounts ----
        listAccounts: async (ctx: any, next: any) => {
          const accts = await acctRepo().find({ sort: ['-id'] });
          const conns = await repo().find();
          const usage: Record<number, number> = {};
          for (const c of conns) if (c.accountId) usage[Number(c.accountId)] = (usage[Number(c.accountId)] || 0) + 1;
          ctx.body = accts.map((a: any) => ({ ...publicAccount(a), usedBy: usage[Number(a.id)] || 0 }));
          await next();
        },

        saveAccount: async (ctx: any, next: any) => {
          const v = ctx.action?.params?.values || {};
          const patch: any = {};
          if (v.title !== undefined) patch.title = String(v.title).trim();
          if (typeof v.credentials === 'string' && v.credentials.trim()) {
            try {
              parseCredentials(v.credentials);
            } catch (e: any) {
              ctx.throw(400, e?.message || 'Credentials không hợp lệ');
            }
            patch.credentials = v.credentials.trim();
          }
          let row;
          if (v.id) {
            row = await acctRepo().findOne({ filter: { id: v.id } });
            if (!row) ctx.throw(404, 'Service Account không tồn tại');
            await row.update(patch);
          } else {
            if (!patch.credentials) ctx.throw(400, 'Cần dán credentials JSON của Service Account');
            if (!patch.title) patch.title = emailOf(patch.credentials) || 'Service Account';
            row = await acctRepo().create({ values: patch });
          }
          ctx.body = publicAccount(await acctRepo().findOne({ filter: { id: row.id } }));
          await next();
        },

        deleteAccount: async (ctx: any, next: any) => {
          const { id } = ctx.action?.params?.values || {};
          if (!id) ctx.throw(400, 'Thiếu id');
          const used = await repo().count({ filter: { accountId: id } });
          if (used) {
            ctx.throw(400, `Service Account đang được ${used} connection dùng — gỡ khỏi các connection đó trước khi xoá`);
          }
          await acctRepo().destroy({ filter: { id } });
          ctx.body = { ok: true };
          await next();
        },

        saveConnection: async (ctx: any, next: any) => {
          const v = ctx.action?.params?.values || {};
          const patch: any = {};
          for (const k of [
            'title', 'spreadsheetId', 'sheetName', 'range', 'targetCollection', 'targetMode',
            'mappings', 'keyColumn', 'syncMode', 'deleteMissing', 'intervalMinutes', 'enabled',
            'twoWay', 'pushDeletes', 'accountId',
          ]) {
            if (v[k] !== undefined) patch[k] = v[k];
          }
          if (patch.accountId !== undefined && patch.accountId !== null && patch.accountId !== '') {
            const a = await acctRepo().findOne({ filter: { id: patch.accountId } });
            if (!a) ctx.throw(400, 'Service Account đã chọn không tồn tại');
          }
          if (patch.pushDeletes && !['none', 'clear', 'delete'].includes(patch.pushDeletes)) {
            ctx.throw(400, 'pushDeletes không hợp lệ');
          }
          if (patch.mappings !== undefined && patch.mappings !== null && !Array.isArray(patch.mappings)) {
            ctx.throw(400, 'mappings phải là mảng');
          }
          if (patch.targetMode && !['create', 'existing'].includes(patch.targetMode)) {
            ctx.throw(400, 'targetMode không hợp lệ');
          }
          if (patch.spreadsheetId) patch.spreadsheetId = extractSpreadsheetId(patch.spreadsheetId);
          if (patch.targetCollection) {
            patch.targetCollection = String(patch.targetCollection).trim();
            if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(patch.targetCollection)) {
              ctx.throw(400, 'Tên collection đích chỉ gồm chữ/số/gạch dưới, bắt đầu bằng chữ');
            }
          }
          if (typeof v.credentials === 'string' && v.credentials.trim()) {
            try {
              parseCredentials(v.credentials); // validate before storing
            } catch (e: any) {
              ctx.throw(400, e?.message || 'Credentials không hợp lệ');
            }
            patch.credentials = v.credentials.trim();
          }
          let row;
          if (v.id) {
            row = await repo().findOne({ filter: { id: v.id } });
            if (!row) ctx.throw(404, 'Connection không tồn tại');
            const merged = { ...row.toJSON(), ...patch };
            if (merged.twoWay && (merged.syncMode !== 'upsert' || !merged.keyColumn)) {
              ctx.throw(400, 'Đồng bộ 2 chiều cần chế độ upsert + cột khóa');
            }
            await row.update(patch);
          } else {
            if (!patch.accountId && !patch.credentials) {
              ctx.throw(400, 'Connection mới cần chọn Service Account');
            }
            if (patch.twoWay && (patch.syncMode !== 'upsert' || !patch.keyColumn)) {
              ctx.throw(400, 'Đồng bộ 2 chiều cần chế độ upsert + cột khóa');
            }
            row = await repo().create({ values: patch });
          }
          await this.writeback.rebindAll(CONN_COLLECTION);
          ctx.body = await withAccount(publicRow(await repo().findOne({ filter: { id: row.id } })));
          await next();
        },

        deleteConnection: async (ctx: any, next: any) => {
          const { id } = ctx.action?.params?.values || {};
          if (!id) ctx.throw(400, 'Thiếu id');
          await repo().destroy({ filter: { id } });
          await this.writeback.rebindAll(CONN_COLLECTION);
          ctx.body = { ok: true };
          await next();
        },

        // backfill: push EVERY record of the target collection up to the sheet
        pushNow: async (ctx: any, next: any) => {
          const { id } = ctx.action?.params?.values || {};
          if (!id) ctx.throw(400, 'Thiếu id');
          const row = await repo().findOne({ filter: { id } });
          if (!row) ctx.throw(404, 'Connection không tồn tại');
          if (!row.twoWay) ctx.throw(400, 'Connection chưa bật đồng bộ 2 chiều');
          try {
            const stats = await this.writeback.pushAll(row);
            ctx.body = { ok: true, ...stats };
          } catch (e: any) {
            ctx.throw(400, e?.message || 'Push thất bại');
          }
          await next();
        },

        // auth + spreadsheet metadata → tabs list (also how the UI fills the tab dropdown)
        testConnection: async (ctx: any, next: any) => {
          const v = ctx.action?.params?.values || {};
          try {
            const sa = await resolveSa(v);
            let spreadsheetId = extractSpreadsheetId(v.spreadsheetId || '');
            if (!spreadsheetId && v.id) {
              const row = await repo().findOne({ filter: { id: v.id } });
              spreadsheetId = row?.spreadsheetId || '';
            }
            if (!spreadsheetId) ctx.throw(400, 'Thiếu Spreadsheet ID');
            const meta = await getSpreadsheetMeta(sa, spreadsheetId);
            ctx.body = { ok: true, serviceEmail: sa.client_email, ...meta };
          } catch (e: any) {
            if (e?.status) throw e;
            ctx.throw(400, e?.message || 'Kết nối thất bại');
          }
          await next();
        },

        // headers + inferred types + first rows, for the mapping/preview UI
        preview: async (ctx: any, next: any) => {
          const v = ctx.action?.params?.values || {};
          try {
            const sa = await resolveSa(v);
            let { spreadsheetId, sheetName, range } = v;
            if (v.id) {
              const row = await repo().findOne({ filter: { id: v.id } });
              spreadsheetId = spreadsheetId || row?.spreadsheetId;
              sheetName = sheetName || row?.sheetName;
              range = range !== undefined ? range : row?.range;
            }
            spreadsheetId = extractSpreadsheetId(spreadsheetId || '');
            if (!spreadsheetId || !sheetName) ctx.throw(400, 'Thiếu Spreadsheet ID / tên sheet');
            const snap = await fetchSnapshot(sa, spreadsheetId, sheetName, range);
            // sample rows are raw (dates = day serials) — convert per inferred type so
            // the preview table shows what the data will BECOME, not the wire format.
            // Use UTC getters: serialToDate maps a day-serial to midnight UTC, so UTC
            // read-back gives the sheet's calendar date regardless of the server timezone.
            const pad2 = (n: number) => String(n).padStart(2, '0');
            const sample = snap.rows.slice(0, 5).map((r) =>
              snap.headers.map((_, col) => {
                const v = r?.[col];
                if (snap.fields[col]?.type === 'date' && typeof v === 'number') {
                  const d = serialToDate(v);
                  const dateStr = `${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
                  const hasTime = Math.abs(v - Math.round(v)) > 1e-9;
                  return hasTime ? `${dateStr} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}` : dateStr;
                }
                return v ?? '';
              }),
            );
            ctx.body = {
              headers: snap.headers,
              fields: snap.fields,
              totalRows: snap.rows.length,
              sample,
            };
          } catch (e: any) {
            if (e?.status) throw e;
            ctx.throw(400, e?.message || 'Preview thất bại');
          }
          await next();
        },

        syncNow: async (ctx: any, next: any) => {
          const { id } = ctx.action?.params?.values || {};
          if (!id) ctx.throw(400, 'Thiếu id');
          const row = await repo().findOne({ filter: { id } });
          if (!row) ctx.throw(404, 'Connection không tồn tại');
          try {
            const stats = await this.syncConnection(row);
            ctx.body = { ok: true, ...stats };
          } catch (e: any) {
            ctx.throw(400, e?.message || 'Sync thất bại');
          }
          await next();
        },
      },
    });

    const ensureTable = async () => {
      for (const c of [ACCT_COLLECTION, CONN_COLLECTION]) {
        try {
          await (this.db.getCollection(c) as any)?.sync?.({ alter: true });
        } catch (e: any) {
          this.app.logger?.warn?.(`[gsheet-sync] sync table ${c} failed: ${e?.message}`);
        }
      }
    };
    (this.app as any).on?.('afterStart', async () => {
      await ensureTable();
      this.startScheduler();
      await this.writeback.rebindAll(CONN_COLLECTION);
    });
    (this.app as any).on?.('afterUpgrade', ensureTable);
    (this.app as any).on?.('beforeStop', () => {
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
      this.writeback.unbindAll();
    });
  }

  // Resolve a connection's credential JSON: linked account wins, else legacy inline.
  async resolveConnCredentials(row: any): Promise<string> {
    if (row.accountId) {
      const a = await (this.db.getRepository(ACCT_COLLECTION) as any).findOne({ filter: { id: row.accountId } });
      if (a?.credentials) return a.credentials;
      throw new Error('Service Account của connection này không còn tồn tại — chọn lại account trong cấu hình');
    }
    if (row.credentials) return row.credentials;
    throw new Error('Connection chưa gắn Service Account');
  }

  // ---------- target collection ----------

  private sheetRowFieldDef() {
    return {
      name: SHEET_ROW_FIELD,
      type: 'bigInt',
      interface: 'integer',
      uiSchema: { type: 'number', title: 'Sheet row', 'x-component': 'InputNumber', 'x-read-pretty': true },
    };
  }

  // Create the target collection via the collections repository (same path as the
  // collection-manager UI) so it shows up in the data-source panel; passing a context
  // makes the collection-manager hooks load + migrate the physical table.
  private async ensureTargetCollection(name: string, title: string, fields: FieldSpec[]) {
    const colRepo: any = this.db.getRepository('collections');
    const fieldRepo: any = this.db.getRepository('fields');
    if (!colRepo || !fieldRepo) throw new Error('Không tìm thấy collection-manager (collections repo)');

    const wanted = [
      ...fields.map((f) => fieldDef(f.name, f.title, f.type)),
      this.sheetRowFieldDef(),
    ];

    const existing = await colRepo.findOne({ filter: { name } });
    if (!existing) {
      await colRepo.create({
        values: {
          name,
          title: title || name,
          autoGenId: true,
          createdAt: true,
          updatedAt: true,
          sortable: false,
          logging: true,
          fields: wanted,
        },
        context: {},
      });
      // sanity check: field labels (uiSchema.title) must survive the nested create —
      // log loudly if any got dropped so a report of "labels lost" is traceable
      try {
        const created = await fieldRepo.find({ filter: { collectionName: name } });
        const missing = created
          .filter((f: any) => {
            const ui = f.get?.('uiSchema') ?? f.uiSchema;
            return f.name !== SHEET_ROW_FIELD && !ui?.title;
          })
          .map((f: any) => f.name);
        if (missing.length) {
          this.app.logger?.warn?.(`[gsheet-sync] collection ${name}: field THIẾU label: ${missing.join(', ')}`);
        } else {
          this.app.logger?.info?.(`[gsheet-sync] collection ${name}: ${created.length} field, label đầy đủ`);
        }
      } catch {
        /* log-only */
      }
      return;
    }

    // add any newly appeared sheet columns as fields
    const have = await fieldRepo.find({ filter: { collectionName: name } });
    const haveNames = new Set(have.map((f: any) => f.name));
    for (const f of wanted) {
      if (!haveNames.has(f.name)) {
        await fieldRepo.create({ values: { ...f, collectionName: name }, context: {} });
      }
    }
    try {
      await (this.db.getCollection(name) as any)?.sync?.({ alter: true });
    } catch {
      /* alter best-effort */
    }
  }

  // ---------- sync runner ----------

  async syncConnection(row: any): Promise<{ rows: number; created?: number; updated?: number; removed?: number }> {
    const id = row.id;
    if (this.inFlight.has(id)) throw new Error('Connection này đang sync dở');
    this.inFlight.add(id);
    await this.setComputedEnabled(false);
    try {
      await row.update({ lastStatus: 'running', lastError: null });
      const sa = parseCredentials(await this.resolveConnCredentials(row));
      if (!row.spreadsheetId || !row.sheetName) throw new Error('Thiếu Spreadsheet ID / tên sheet');
      if (!row.targetCollection) throw new Error('Chưa đặt tên collection đích');

      const snap = await fetchSnapshot(sa, row.spreadsheetId, row.sheetName, row.range);
      let fields = resolveMappedFields(snap, row.mappings);

      if (row.targetMode === 'existing') {
        // sync into an existing collection: it must exist, mapped fields must exist,
        // and each target field's REAL type drives coercion (inference is ignored)
        const target0: any = this.db.getCollection(row.targetCollection);
        if (!target0) throw new Error(`Collection có sẵn "${row.targetCollection}" không tồn tại`);
        if (!Array.isArray(row.mappings) || !row.mappings.length) {
          throw new Error('Chế độ collection có sẵn cần cấu hình mapping cột → field (mở Xem trước để thiết lập)');
        }
        fields = fields.map((f) => {
          const tf = target0.getField(f.name);
          if (!tf) throw new Error(`Field "${f.name}" không tồn tại trong collection "${row.targetCollection}"`);
          const ct = nbTypeToColType(tf.options?.type || tf.type);
          if (!ct) throw new Error(`Field "${f.name}" kiểu "${tf.options?.type || tf.type}" không hỗ trợ sync (field quan hệ/đặc biệt)`);
          return { ...f, type: ct };
        });
        // _sheet_row for row identity (V2 write-back); added via fields repo if absent
        if (!target0.getField(SHEET_ROW_FIELD)) {
          const fieldRepo: any = this.db.getRepository('fields');
          await fieldRepo.create({
            values: { ...this.sheetRowFieldDef(), collectionName: row.targetCollection },
            context: {},
          });
        }
      } else {
        await this.ensureTargetCollection(row.targetCollection, row.title, fields);
      }

      const target: any = this.db.getCollection(row.targetCollection);
      if (!target) throw new Error(`Collection ${row.targetCollection} chưa sẵn sàng — thử sync lại`);
      const targetRepo: any = this.db.getRepository(row.targetCollection);

      const records = snap.rows.map((r, i) => rowToRecord(r, fields, snap.firstDataRow + i));
      const stats: any = { rows: records.length };

      const keyField = row.keyColumn
        ? fields.find((f) => f.title === row.keyColumn || f.name === row.keyColumn)?.name
        : null;

      // hooks:false already keeps db events silent during pull; the context flag is a
      // second net so the write-back listeners never echo pulled data to the sheet.
      const pullCtx = { context: { [PULL_CONTEXT_FLAG]: true } };

      // NocoBase populates createdAt/updatedAt via a create hook — which hooks:false
      // skips, leaving them NULL (notNull violation). Stamp them ourselves for inserts.
      const now = new Date();
      const hasCreatedAt = !!target.getField?.('createdAt');
      const hasUpdatedAt = !!target.getField?.('updatedAt');
      const stampInsert = (rec: any) => ({
        ...(hasCreatedAt ? { createdAt: now } : {}),
        ...(hasUpdatedAt ? { updatedAt: now } : {}),
        ...rec,
      });
      const stampUpdate = (rec: any) => (hasUpdatedAt ? { ...rec, updatedAt: now } : rec);

      if (row.syncMode === 'upsert' && keyField) {
        let created = 0;
        let updated = 0;
        const seenKeys: any[] = [];
        for (const rec of records) {
          const keyVal = rec[keyField];
          if (keyVal === null || keyVal === undefined) continue; // rows without a key are skipped in upsert mode
          seenKeys.push(keyVal);
          const found = await targetRepo.findOne({ filter: { [keyField]: keyVal } });
          if (found) {
            await targetRepo.update({ filter: { [keyField]: keyVal }, values: stampUpdate(rec), hooks: false, ...pullCtx });
            updated++;
          } else {
            await targetRepo.create({ values: stampInsert(rec), hooks: false, ...pullCtx });
            created++;
          }
        }
        stats.created = created;
        stats.updated = updated;
        if (row.deleteMissing && seenKeys.length) {
          const removed = await targetRepo.destroy({
            filter: { [keyField]: { $notIn: seenKeys } },
            individualHooks: false,
            ...pullCtx,
          });
          stats.removed = removed;
        }
      } else {
        // replace: wipe + bulk insert (fast path, default). On an EXISTING collection
        // only rows this plugin synced (_sheet_row set) are wiped — user data stays.
        if (row.targetMode === 'existing') {
          await targetRepo.destroy({
            filter: { [SHEET_ROW_FIELD]: { $notEmpty: true } },
            individualHooks: false,
            ...pullCtx,
          });
        } else {
          await target.model.destroy({ where: {}, truncate: false, hooks: false });
        }
        if (records.length) {
          await targetRepo.createMany({ records: records.map(stampInsert), hooks: false, ...pullCtx });
        }
        stats.created = records.length;
      }

      await row.update({
        lastStatus: 'ok',
        lastError: null,
        lastSyncAt: new Date(),
        lastRowCount: records.length,
      });
      return stats;
    } catch (e: any) {
      try {
        await row.update({ lastStatus: 'error', lastError: e?.message || String(e) });
      } catch {
        /* keep original error */
      }
      throw e;
    } finally {
      await this.setComputedEnabled(true);
      await this.recomputeAllComputed();
      this.inFlight.delete(id);
    }
  }

  // ---------- scheduler ----------

  private startScheduler() {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(async () => {
      try {
        const repo: any = this.db.getRepository(CONN_COLLECTION);
        if (!repo) return;
        const rows = await repo.find({ filter: { enabled: true } });
        for (const row of rows) {
          const mins = row.intervalMinutes || 0;
          if (mins <= 0 || this.inFlight.has(row.id)) continue;
          const last = row.lastSyncAt ? new Date(row.lastSyncAt).getTime() : 0;
          if (Date.now() - last >= mins * 60_000) {
            try {
              await this.syncConnection(row);
              this.app.logger?.info?.(`[gsheet-sync] scheduled sync ok: ${row.title || row.id}`);
            } catch (e: any) {
              this.app.logger?.warn?.(`[gsheet-sync] scheduled sync failed (${row.title || row.id}): ${e?.message}`);
            }
          }
        }
      } catch {
        /* scheduler tick must never throw */
      }
    }, 60_000);
    // don't keep the process alive just for the scheduler
    this.timer?.unref?.();
  }

  async install() {
    await (this.db.getCollection(ACCT_COLLECTION) as any)?.sync?.();
    await (this.db.getCollection(CONN_COLLECTION) as any)?.sync?.();
  }
}

export default PluginGsheetSyncServer;
