import { Plugin } from '@nocobase/server';
import { Op } from '@nocobase/database';
import JSZip from 'jszip';
import * as fs from 'fs';
import * as path from 'path';

/**
 * File Vault — a central manager for NocoBase's `attachments` collection.
 *
 * Core file-manager stores EVERY upload in one `attachments` collection, but ships no central browse/
 * manage UI, and deliberately locks the collection down:
 *   • `attachments:list` is overridden to `ctx.throw(404)` (see plugin-file-manager server.js) — so we
 *     CANNOT list via the native action; File Vault exposes its own `fileVault:browse`.
 *   • `attachments:update` / `:destroy` carry `addFixedParams(... createdById = currentUser.id)` — a user
 *     may only touch files they uploaded. An admin file manager must touch ALL files, so every mutation
 *     here goes through the attachments REPOSITORY directly (server-side, no per-user fixed params),
 *     gated to admins in-handler.
 *   • Physical file deletion is automatic: file-manager registers `db.on('afterDestroy')` which removes
 *     the file from storage whenever an `attachments` row is destroyed (non-paranoid storages).
 *     `Repository.destroy` defaults `individualHooks: true`, so destroying rows via the repo fires that
 *     hook per-row → the file on disk is removed. We do NOT touch the filesystem ourselves.
 *
 * We do NOT hard-import @nocobase/plugin-file-manager (an optional peer) — talking to the `attachments`
 * repository + the generic relation graph keeps us decoupled, so toggling file-manager can't white-screen.
 *
 * USAGE SCAN — how attachment fields link:
 *   An "attachment" field on some collection is a relation whose TARGET is `attachments`. In practice:
 *     • multiple  → belongsToMany through an auto junction table (foreignKey→source, otherKey→attachment)
 *     • single    → belongsTo, foreign key on the owner table (e.g. code-defined systemSettings.logo)
 *   We enumerate `db.collections` at RUNTIME (catches code-defined fields the `fields` table never lists)
 *   and, for every association whose target is `attachments`, count referencing rows with ONE grouped
 *   query per relation (no N+1). An attachment referenced by no relation is an ORPHAN.
 *   Limitation (surfaced in the UI): only RELATIONAL references are detected — a file referenced solely by
 *   a URL embedded in a rich-text / JSON column is not, and would read as an orphan.
 */

const SPREADSHEET_EXT = ['.xls', '.xlsx', '.xlsm', '.csv', '.tsv', '.ods', '.numbers'];
const DOC_EXT = ['.doc', '.docx', '.ppt', '.pptx', '.txt', '.md', '.rtf', '.odt', '.odp', '.pages', '.key', '.json', '.xml', '.html', '.htm'];
const ARC_EXT = ['.zip', '.rar', '.7z', '.gz', '.tar', '.tgz', '.bz2', '.xz'];

export function classifyType(mimetype?: string, extname?: string): string {
  const m = String(mimetype || '').toLowerCase();
  const e = String(extname || '').toLowerCase();
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  if (m.includes('pdf') || e === '.pdf') return 'pdf';
  // spreadsheet BEFORE doc: xlsx mimetype contains both 'officedocument' and 'spreadsheet'.
  if (SPREADSHEET_EXT.includes(e) || m.includes('spreadsheet') || m.includes('excel') || m.includes('csv')) return 'spreadsheet';
  if (DOC_EXT.includes(e) || m.includes('word') || m.includes('presentation') || m.includes('officedocument') || m.startsWith('text/')) return 'doc';
  if (ARC_EXT.includes(e) || m.includes('zip') || m.includes('compressed') || m.includes('x-tar') || m.includes('x-7z') || m.includes('x-rar')) return 'archive';
  return 'other';
}

/** Translate a UI type key into an attachments-repository filter fragment (or null for "all"). */
function typeFilter(type?: string): any {
  switch (type) {
    case 'image': return { mimetype: { $includes: 'image/' } };
    case 'video': return { mimetype: { $includes: 'video/' } };
    case 'audio': return { mimetype: { $includes: 'audio/' } };
    case 'pdf': return { $or: [{ extname: { $in: ['.pdf'] } }, { mimetype: { $includes: 'pdf' } }] };
    case 'spreadsheet': return { $or: [{ extname: { $in: SPREADSHEET_EXT } }, { mimetype: { $includes: 'spreadsheet' } }, { mimetype: { $includes: 'excel' } }] };
    case 'doc': return { extname: { $in: DOC_EXT } };
    case 'archive': return { extname: { $in: ARC_EXT } };
    case 'other': return {
      $and: [
        { mimetype: { $notIncludes: 'image/' } },
        { mimetype: { $notIncludes: 'video/' } },
        { mimetype: { $notIncludes: 'audio/' } },
        { mimetype: { $notIncludes: 'pdf' } },
        { mimetype: { $notIncludes: 'spreadsheet' } },
        { extname: { $notIn: [...DOC_EXT, ...SPREADSHEET_EXT, ...ARC_EXT, '.pdf'] } },
      ],
    };
    default: return null;
  }
}

const SORT_WHITELIST = new Set(['createdAt', '-createdAt', 'updatedAt', '-updatedAt', 'size', '-size', 'title', '-title', 'filename', '-filename', 'id', '-id']);
const TITLE_FIELD_CANDIDATES = ['title', 'name', 'label', 'nickname', 'username', 'subject', 'displayName', 'code'];
const toNum = (v: any) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const arrayify = (v: any): number[] => (Array.isArray(v) ? v : v == null ? [] : [v]).map((x) => Number(x)).filter((x) => Number.isFinite(x));

/** Collect a Node readable stream into a single Buffer. */
function streamToBuffer(stream: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (c: any) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

interface RefRelation { name: string; title: string; field: string; type: string; assoc: any; model: any; }

export class PluginFileVaultServer extends Plugin {
  async load() {
    this.app.resourcer.define({
      name: 'fileVault',
      actions: {
        browse: this.browse,
        stats: this.stats,
        usage: this.usage,
        rename: this.rename,
        purge: this.purge,
        cleanOrphans: this.cleanOrphans,
        downloadZip: this.downloadZip,
      },
      // None of these names are RESERVED resourcer actions (list/get/update/destroy/move/set/add/remove/
      // toggle), so NocoBase won't auto-enforce filterByTk or hijack the handler.
      only: ['browse', 'stats', 'usage', 'rename', 'purge', 'cleanOrphans', 'downloadZip'],
    });

    // `fileVault` is a pure custom resource (not a DB collection) → not covered by any role strategy.
    // Reads (browse/stats/usage/downloadZip) are allowed for any logged-in user; MUTATIONS additionally
    // require an admin role, checked in-handler (see requireAdmin). Mirrors ip-guard / plugin-hub.
    // [[reference_nocobase_acl_system_collection_writes]]
    this.app.acl.allow('fileVault', ['browse', 'stats', 'usage', 'rename', 'purge', 'cleanOrphans', 'downloadZip'], 'loggedIn');
  }

  private attRepo() {
    return this.db.getRepository('attachments');
  }

  private requireAdmin(ctx: any) {
    const roles = ctx.state?.currentRoles;
    const list = Array.isArray(roles) ? roles : roles ? [roles] : [];
    const ok = list.includes('root') || list.includes('admin');
    if (!ok) ctx.throw(403, 'Chỉ quản trị viên mới được sửa/xóa tệp / Only an administrator may modify or delete files');
  }

  private titleFieldOf(name: string): string | null {
    try {
      const col: any = this.db.getCollection(name);
      const tf = col?.options?.titleField;
      if (tf && col.getField?.(tf)) return tf;
      for (const cand of TITLE_FIELD_CANDIDATES) if (col?.getField?.(cand)) return cand;
    } catch { /* noop */ }
    return null;
  }

  private pkOf(name: string): string {
    try { return (this.db.getCollection(name) as any)?.filterTargetKey || 'id'; } catch { return 'id'; }
  }

  private humanFromRow(j: any) {
    return {
      id: j.id,
      title: j.title ?? null,
      filename: j.filename ?? null,
      extname: j.extname ?? null,
      size: toNum(j.size),
      mimetype: j.mimetype ?? null,
      url: j.url ?? null,
      preview: j.preview ?? j.url ?? null,
      path: j.path ?? null,
      meta: j.meta ?? null,
      createdAt: j.createdAt ?? null,
      updatedAt: j.updatedAt ?? null,
      storageId: j.storageId ?? null,
      storageTitle: j.storage?.title ?? null,
      storageName: j.storage?.name ?? null,
      createdById: j.createdById ?? null,
      uploader: j.createdBy?.nickname || j.createdBy?.username || j.createdBy?.email || null,
      type: classifyType(j.mimetype, j.extname),
    };
  }

  // ── browse: paginated / filtered / searched list of attachments ─────────────────────────────────
  private browse = async (ctx: any, next: any) => {
    try {
      const v = ctx.action?.params?.values || {};
      const page = Math.max(1, toNum(v.page) || 1);
      const pageSize = Math.min(200, Math.max(1, toNum(v.pageSize) || 24));
      const sort = SORT_WHITELIST.has(v.sort) ? v.sort : '-createdAt';

      const and: any[] = [];
      const search = String(v.search || '').trim();
      if (search) and.push({ $or: [{ title: { $includes: search } }, { filename: { $includes: search } }] });
      const tf = typeFilter(v.type);
      if (tf) and.push(tf);
      if (v.storageId != null && v.storageId !== '' && v.storageId !== 'all') and.push({ storageId: { $eq: toNum(v.storageId) } });
      if (v.dateFrom) and.push({ createdAt: { $gte: v.dateFrom } });
      if (v.dateTo) and.push({ createdAt: { $lte: v.dateTo } });

      // SERVER-SIDE "used in collection (+ record)" filter: intersect with the attachment ids referenced
      // by a record in that collection. Works across ALL files, not just the current page.
      const usedInCollection = String(v.usedInCollection || '').trim();
      if (usedInCollection) {
        const refIds = await this.attachmentIdsReferencedBy(usedInCollection, v.usedInRecordId);
        if (!refIds.length) {
          ctx.body = { items: [], count: 0, page, pageSize, usedInEmpty: true };
          await next();
          return;
        }
        and.push({ id: { $in: refIds } });
      }

      const filter = and.length ? { $and: and } : {};
      const repo = this.attRepo();
      let rows: any[] = [];
      let count = 0;
      try {
        const res = await repo.findAndCount({ filter, appends: ['storage', 'createdBy'], sort, offset: (page - 1) * pageSize, limit: pageSize });
        rows = res?.[0] || [];
        count = res?.[1] || 0;
      } catch {
        const res = await repo.findAndCount({ filter, appends: ['storage'], sort, offset: (page - 1) * pageSize, limit: pageSize });
        rows = res?.[0] || [];
        count = res?.[1] || 0;
      }

      ctx.body = {
        items: rows.map((r: any) => this.humanFromRow(typeof r?.toJSON === 'function' ? r.toJSON() : r)),
        count, page, pageSize,
      };
    } catch (e: any) {
      ctx.body = { items: [], count: 0, page: 1, pageSize: 24, error: String(e?.message || e) };
    }
    await next();
  };

  // ── stats: totals, by-type / by-storage breakdown, orphan count + reclaimable bytes ─────────────
  private stats = async (ctx: any, next: any) => {
    const out: any = { totalCount: 0, totalBytes: 0, byType: [], byStorage: [], storages: [], orphanCount: 0, orphanBytes: 0, refCount: 0, scanOk: false, scanErrors: 0, refs: [] };
    try {
      const rows = await this.attRepo().find({ fields: ['id', 'size', 'mimetype', 'extname', 'storageId'] });
      const typeAgg: Record<string, { count: number; bytes: number }> = {};
      const storAgg: Record<string, { count: number; bytes: number }> = {};
      for (const r of rows) {
        const j = typeof r?.toJSON === 'function' ? r.toJSON() : r;
        const size = toNum(j.size);
        out.totalCount++;
        out.totalBytes += size;
        const t = classifyType(j.mimetype, j.extname);
        (typeAgg[t] || (typeAgg[t] = { count: 0, bytes: 0 })).count++;
        typeAgg[t].bytes += size;
        const sk = String(j.storageId ?? '0');
        (storAgg[sk] || (storAgg[sk] = { count: 0, bytes: 0 })).count++;
        storAgg[sk].bytes += size;
      }
      out.byType = Object.keys(typeAgg).map((type) => ({ type, ...typeAgg[type] })).sort((a, b) => b.bytes - a.bytes);

      try {
        const storages = await this.db.getRepository('storages').find({ fields: ['id', 'title', 'name', 'default'] });
        out.storages = storages.map((s: any) => {
          const j = typeof s?.toJSON === 'function' ? s.toJSON() : s;
          const agg = storAgg[String(j.id)] || { count: 0, bytes: 0 };
          return { id: j.id, title: j.title, name: j.name, default: !!j.default, count: agg.count, bytes: agg.bytes };
        });
      } catch { /* storages optional */ }

      try {
        const scan = await this.usageScan(null);
        out.refCount = scan.refs.length;
        out.scanErrors = scan.errors.length;
        out.scanOk = true;
        out.refs = scan.refs;
        for (const r of rows) {
          const j = typeof r?.toJSON === 'function' ? r.toJSON() : r;
          if (!scan.usedIds.has(Number(j.id))) { out.orphanCount++; out.orphanBytes += toNum(j.size); }
        }
        if (scan.errors.length) out.scanErrorDetail = scan.errors;
      } catch (e: any) {
        out.scanOk = false;
        out.scanErrorDetail = [{ error: String(e?.message || e) }];
      }
    } catch (e: any) {
      out.error = String(e?.message || e);
    }
    ctx.body = out;
    await next();
  };

  // ── usage: where are these attachment ids referenced? (page-scoped detail, WITH record labels) ──
  private usage = async (ctx: any, next: any) => {
    try {
      const v = ctx.action?.params?.values || {};
      const ids = arrayify(v.ids);
      if (!ids.length) { ctx.body = { usage: {}, orphanIds: [], refs: [] }; await next(); return; }
      const scan = await this.usageScan(ids);
      const orphanIds = ids.filter((id) => !scan.usedIds.has(id));

      // Enrich each usage entry with the referencing records' friendly labels (title-field value) so the
      // client can show "label (#id)" not just a bare id. One label query per referencing collection.
      const byColl: Record<string, Set<number>> = {};
      for (const attId of Object.keys(scan.usage)) {
        for (const e of scan.usage[attId]) {
          const set = byColl[e.collection] || (byColl[e.collection] = new Set());
          (e.recordIds || []).forEach((id: any) => set.add(Number(id)));
        }
      }
      const labels: Record<string, Record<string, string>> = {};
      for (const coll of Object.keys(byColl)) {
        try {
          const idList = [...byColl[coll]].filter(Boolean);
          if (!idList.length) continue;
          const tfield = this.titleFieldOf(coll);
          const pk = this.pkOf(coll);
          const rows = await this.db.getRepository(coll).find({ filter: { [pk]: { $in: idList } }, fields: tfield ? [pk, tfield] : [pk] });
          const map: Record<string, string> = {};
          for (const r of rows) { const j = r.toJSON ? r.toJSON() : r; map[String(j[pk])] = tfield ? String(j[tfield] ?? '') : ''; }
          labels[coll] = map;
        } catch { /* labels are best-effort — fall back to bare ids */ }
      }
      for (const attId of Object.keys(scan.usage)) {
        for (const e of scan.usage[attId]) {
          e.records = (e.recordIds || []).map((id: any) => ({ id, label: labels[e.collection]?.[String(id)] || '' }));
        }
      }

      ctx.body = { usage: scan.usage, orphanIds, refs: scan.refs, scanErrors: scan.errors.length };
    } catch (e: any) {
      // Crash-safe: a failed usage scan must NOT break the page — return empty, no orphan claims.
      ctx.body = { usage: {}, orphanIds: [], refs: [], error: String(e?.message || e) };
    }
    await next();
  };

  // ── rename: update the user-facing title (admin) ────────────────────────────────────────────────
  private rename = async (ctx: any, next: any) => {
    this.requireAdmin(ctx);
    const v = ctx.action?.params?.values || {};
    const id = toNum(v.id);
    const title = String(v.title ?? '').trim();
    if (!id) { ctx.body = { ok: false, error: 'Thiếu id / Missing id' }; await next(); return; }
    try {
      await this.attRepo().update({ filterByTk: id, values: { title } });
      ctx.body = { ok: true, id, title };
    } catch (e: any) {
      ctx.body = { ok: false, error: String(e?.message || e) };
    }
    await next();
  };

  // ── purge: delete attachments by id (admin). Physical files removed by the file-manager afterDestroy
  //    hook (Repository.destroy fires individualHooks by default). ──────────────────────────────────
  private purge = async (ctx: any, next: any) => {
    this.requireAdmin(ctx);
    const v = ctx.action?.params?.values || {};
    const ids = arrayify(v.ids);
    if (!ids.length) { ctx.body = { ok: false, error: 'Thiếu danh sách id / Missing ids' }; await next(); return; }
    try {
      const rows = await this.attRepo().find({ filter: { id: { $in: ids } }, fields: ['id', 'size'] });
      const freedBytes = rows.reduce((s: number, r: any) => s + toNum((r.toJSON ? r.toJSON() : r).size), 0);
      const realIds = rows.map((r: any) => (r.toJSON ? r.toJSON() : r).id);
      if (realIds.length) await this.attRepo().destroy({ filterByTk: realIds });
      ctx.body = { ok: true, deleted: realIds.length, freedBytes };
    } catch (e: any) {
      ctx.body = { ok: false, error: String(e?.message || e) };
    }
    await next();
  };

  // ── cleanOrphans: re-verify orphan status server-side, then delete every orphan (admin) ─────────
  private cleanOrphans = async (ctx: any, next: any) => {
    this.requireAdmin(ctx);
    try {
      const scan = await this.usageScan(null);
      // FAIL-SAFE: if any relation query errored we could not fully verify usage → refuse, so we never
      // delete a file that might still be referenced. The user is told which relations failed.
      if (scan.errors.length) {
        ctx.body = { ok: false, error: 'Không quét được đầy đủ tham chiếu — hủy để an toàn / Usage scan incomplete — aborted for safety', scanErrors: scan.errors };
        await next();
        return;
      }
      const rows = await this.attRepo().find({ fields: ['id', 'size'] });
      const orphans = rows
        .map((r: any) => (r.toJSON ? r.toJSON() : r))
        .filter((j: any) => !scan.usedIds.has(Number(j.id)));
      const ids = orphans.map((j: any) => j.id);
      const freedBytes = orphans.reduce((s: number, j: any) => s + toNum(j.size), 0);
      if (ids.length) await this.attRepo().destroy({ filterByTk: ids });
      ctx.body = { ok: true, deleted: ids.length, freedBytes, refCount: scan.refs.length };
    } catch (e: any) {
      ctx.body = { ok: false, error: String(e?.message || e) };
    }
    await next();
  };

  // ── downloadZip: bundle selected files (or all) into a ZIP for backup (loggedIn) ────────────────
  // Raw-binary response (Buffer body + explicit headers) — NocoBase's dataWrapping middleware passes a
  // Buffer through un-wrapped (same pattern as nb-cloner's `.nbc.gz` export). We read each physical file
  // (local disk via the storage config, or a remote URL) into memory and zip in-process with jszip
  // (bundled into the server lane). A file that can't be read is SKIPPED (listed in _manifest.txt), never
  // fatal, so one missing file can't break the whole backup.
  private downloadZip = async (ctx: any, next: any) => {
    try {
      const v = ctx.action?.params?.values || ctx.request?.body || {};
      const ids = arrayify(v.ids);
      const filter = ids.length ? { id: { $in: ids } } : {};
      const rows = await this.attRepo().find({
        filter,
        fields: ['id', 'title', 'filename', 'extname', 'mimetype', 'size', 'path', 'url', 'storageId'],
        sort: 'id',
        limit: 5000, // sanity cap: this is an in-memory zip
      });
      if (!rows.length) { ctx.status = 400; ctx.body = { ok: false, error: 'Không có tệp nào / No files' }; await next(); return; }

      const storageMap = await this.allStoragesMap();
      const zip = new JSZip();
      const used = new Set<string>();
      const uniqueName = (base: string): string => {
        if (!used.has(base)) { used.add(base); return base; }
        const dot = base.lastIndexOf('.');
        const stem = dot > 0 ? base.slice(0, dot) : base;
        const ext = dot > 0 ? base.slice(dot) : '';
        let i = 2, name = '';
        do { name = `${stem} (${i})${ext}`; i++; } while (used.has(name));
        used.add(name); return name;
      };

      const included: string[] = [];
      const skipped: string[] = [];
      for (const r of rows) {
        const att = typeof r?.toJSON === 'function' ? r.toJSON() : r;
        const storage = storageMap.get(Number(att.storageId));
        const rawBase = (att.title ? `${att.title}${att.extname || ''}` : att.filename) || `file-${att.id}`;
        const safeBase = String(rawBase).replace(/[\\/]/g, '_').replace(/[\u0000-\u001f]/g, '').trim() || `file-${att.id}`;
        let buf: Buffer | null = null;
        try { buf = await this.readFileBuffer(att, storage); } catch { buf = null; }
        if (!buf) { skipped.push(`#${att.id}  ${safeBase}`); continue; }
        const name = uniqueName(safeBase);
        zip.file(name, buf);
        included.push(`${name}  (#${att.id}, ${buf.length} bytes)`);
      }

      const manifest = [
        'File Vault backup — @tuanla90/plugin-file-vault',
        `Generated: ${new Date().toISOString()}`,
        '',
        `Included: ${included.length} file(s)`,
        ...included.map((s) => '  + ' + s),
        '',
        `Skipped (unreadable): ${skipped.length}`,
        ...skipped.map((s) => '  - ' + s),
      ].join('\n');
      zip.file('_manifest.txt', manifest);

      if (!included.length) { ctx.status = 404; ctx.body = { ok: false, error: 'Không đọc được tệp nào / No readable files found', skipped: skipped.length }; await next(); return; }

      const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
      const filename = `file-backup-${included.length}.zip`;
      ctx.set('Content-Type', 'application/zip');
      ctx.set('Content-Disposition', `attachment; filename="${filename}"`);
      ctx.set('Content-Length', String(buffer.length));
      ctx.body = buffer; // Buffer → returned raw (not JSON-wrapped), like nb-cloner's export.
    } catch (e: any) {
      ctx.status = 500;
      ctx.body = { ok: false, error: String(e?.message || e) };
    }
    await next();
  };

  private fileManager(): any {
    try { const pm: any = this.app.pm; return pm.get('file-manager') || pm.get('@nocobase/plugin-file-manager') || null; } catch { return null; }
  }

  private async allStoragesMap(): Promise<Map<number, any>> {
    const map = new Map<number, any>();
    try {
      const rows = await this.db.getRepository('storages').find();
      for (const r of rows) { const j = typeof r?.toJSON === 'function' ? r.toJSON() : r; map.set(Number(j.id), j); }
    } catch { /* storages optional */ }
    return map;
  }

  /** On-disk path for a LOCAL-storage attachment — resolved the same way core file-manager's local
   *  storage does (documentRoot + path + filename). Returns null for non-local storages. */
  private localFilePath(att: any, storage: any): string | null {
    if (storage && storage.type && storage.type !== 'local') return null;
    let root = storage?.options?.documentRoot || process.env.LOCAL_STORAGE_DEST || 'storage/uploads';
    if (!path.isAbsolute(root)) root = path.resolve(process.cwd(), root);
    const rel = String(att.path || '').replace(/^[\\/]+/, '');
    return path.resolve(root, rel, String(att.filename || ''));
  }

  /** Read one attachment's bytes: (1) via file-manager's own getFileStream (all storage types, runtime
   *  lookup — no hard import); (2) local disk fallback; (3) absolute-URL fetch for remote storages.
   *  Returns null if unreadable (caller skips it). */
  private async readFileBuffer(att: any, storage: any): Promise<Buffer | null> {
    try {
      const fm = this.fileManager();
      if (fm?.getFileStream) {
        const res = await fm.getFileStream({ storageId: att.storageId, path: att.path, filename: att.filename, mimetype: att.mimetype });
        const stream = res?.stream || res;
        if (stream && typeof stream.on === 'function') return await streamToBuffer(stream);
      }
    } catch { /* fall through */ }
    try {
      const p = this.localFilePath(att, storage);
      if (p && fs.existsSync(p)) return await fs.promises.readFile(p);
    } catch { /* fall through */ }
    try {
      if (att.url && /^https?:\/\//i.test(att.url)) {
        const r = await (globalThis as any).fetch(att.url);
        if (r?.ok) return Buffer.from(await r.arrayBuffer());
      }
    } catch { /* give up */ }
    return null;
  }

  // ── the relation graph ──────────────────────────────────────────────────────────────────────────
  /** Enumerate every association across all collections whose target is `attachments`. Crash-safe. */
  private getReferenceRelations(): { refs: RefRelation[]; attModel: any; enumError?: string } {
    const db: any = this.db;
    let attModel: any;
    try { attModel = db.getModel('attachments'); } catch (e: any) { return { refs: [], attModel: null, enumError: String(e?.message || e) }; }
    const refs: RefRelation[] = [];
    try {
      for (const [name, collection] of db.collections as Map<string, any>) {
        if (name === 'attachments') continue;
        let model: any;
        try { model = db.getModel(name); } catch { continue; }
        const assocs = model?.associations || {};
        for (const assocName of Object.keys(assocs)) {
          try {
            const assoc = assocs[assocName];
            const target = assoc?.target;
            if (!target) continue;
            if (target !== attModel && target?.name !== attModel?.name && target?.tableName !== attModel?.tableName) continue;
            refs.push({ name, title: collection?.options?.title || name, field: assocName, type: assoc.associationType, assoc, model });
          } catch { /* skip a malformed association */ }
        }
      }
    } catch (e: any) {
      return { refs, attModel, enumError: String(e?.message || e) };
    }
    return { refs, attModel };
  }

  /** All attachment ids referenced by a record in `collectionName` (optionally a single record). Grouped
   *  queries, crash-safe (a relation that errors is skipped). Used by the browse "used in collection" filter. */
  private async attachmentIdsReferencedBy(collectionName: string, recordId?: any): Promise<number[]> {
    const { refs, attModel } = this.getReferenceRelations();
    const mine = refs.filter((r) => r.name === collectionName);
    if (!mine.length || !attModel) return [];
    const rid = recordId != null && recordId !== '' && Number.isFinite(Number(recordId)) ? Number(recordId) : null;
    const set = new Set<number>();
    for (const ref of mine) {
      try {
        const { assoc, type } = ref;
        if (type === 'BelongsToMany') {
          const through = assoc.through?.model;
          const fk = assoc.foreignKey;
          const otherKey = assoc.otherKey;
          if (!through || !otherKey) continue;
          const where: any = {};
          if (rid != null) where[fk] = rid;
          const rows = await through.findAll({ attributes: [[otherKey, 'attId']], where, group: [otherKey], raw: true });
          rows.forEach((r: any) => { const n = Number(r.attId); if (n) set.add(n); });
        } else if (type === 'BelongsTo') {
          const fk = assoc.foreignKey;
          const srcPk = ref.model?.primaryKeyAttribute || 'id';
          const where: any = { [fk]: { [Op.ne]: null } };
          if (rid != null) where[srcPk] = rid;
          const rows = await ref.model.findAll({ attributes: [[fk, 'attId']], where, group: [fk], raw: true });
          rows.forEach((r: any) => { const n = Number(r.attId); if (n) set.add(n); });
        } else if (type === 'HasMany' || type === 'HasOne') {
          const fk = assoc.foreignKey;
          const where: any = { [fk]: { [Op.ne]: null } };
          if (rid != null) where[fk] = rid;
          const rows = await attModel.findAll({ attributes: [['id', 'attId']], where, raw: true });
          rows.forEach((r: any) => { const n = Number(r.attId); if (n) set.add(n); });
        }
      } catch { /* skip this relation */ }
    }
    return [...set];
  }

  /**
   * @param ids  when a non-empty array → compute DETAILED usage (which collections/records) for just
   *             those attachment ids (cheap, page-scoped). When null → FULL scan, returning only the set
   *             of used attachment ids (for orphan detection), one grouped query per relation.
   */
  private async usageScan(ids: number[] | null): Promise<{ usage: Record<string, any[]>; usedIds: Set<number>; refs: any[]; errors: any[] }> {
    const usage: Record<string, Record<string, any>> = {};
    const usedIds = new Set<number>();
    const errors: any[] = [];
    const wantDetail = Array.isArray(ids) && ids.length > 0;
    const idFilter = wantDetail ? (ids as number[]) : null;

    const { refs, attModel, enumError } = this.getReferenceRelations();
    if (enumError) errors.push({ error: 'collection enumeration failed: ' + enumError });
    if (!attModel) return { usage: {}, usedIds, refs: [], errors };

    const add = (attIdRaw: any, ref: RefRelation, srcId: any) => {
      const attId = Number(attIdRaw);
      if (!Number.isFinite(attId) || !attId) return;
      usedIds.add(attId);
      if (!wantDetail) return;
      const bag = usage[attId] || (usage[attId] = {});
      const key = ref.name + '::' + ref.field;
      const entry = bag[key] || (bag[key] = { collection: ref.name, title: ref.title, field: ref.field, count: 0, recordIds: [] });
      entry.count++;
      if (srcId != null && entry.recordIds.length < 20 && !entry.recordIds.includes(srcId)) entry.recordIds.push(srcId);
    };

    // One grouped query per relation. Every relation is isolated in try/catch → one bad table can never
    // abort the whole scan (and, for cleanOrphans, is reported so we refuse to delete).
    for (const ref of refs) {
      try {
        const { assoc, type } = ref;
        if (type === 'BelongsToMany') {
          const through = assoc.through?.model;
          const fk = assoc.foreignKey;
          const otherKey = assoc.otherKey;
          if (!through || !otherKey) continue;
          if (wantDetail) {
            const list = await through.findAll({ attributes: [[otherKey, 'attId'], [fk, 'srcId']], where: { [otherKey]: idFilter }, raw: true });
            list.forEach((r: any) => add(r.attId, ref, r.srcId));
          } else {
            const list = await through.findAll({ attributes: [[otherKey, 'attId']], group: [otherKey], raw: true });
            list.forEach((r: any) => add(r.attId, ref, null));
          }
        } else if (type === 'BelongsTo') {
          const fk = assoc.foreignKey;
          const srcPk = ref.model?.primaryKeyAttribute || 'id';
          if (wantDetail) {
            const list = await ref.model.findAll({ attributes: [[fk, 'attId'], [srcPk, 'srcId']], where: { [fk]: idFilter }, raw: true });
            list.forEach((r: any) => add(r.attId, ref, r.srcId));
          } else {
            const list = await ref.model.findAll({ attributes: [[fk, 'attId']], where: { [fk]: { [Op.ne]: null } }, group: [fk], raw: true });
            list.forEach((r: any) => add(r.attId, ref, null));
          }
        } else if (type === 'HasMany' || type === 'HasOne') {
          const fk = assoc.foreignKey;
          if (wantDetail) {
            const list = await attModel.findAll({ attributes: [['id', 'attId'], [fk, 'srcId']], where: { id: idFilter, [fk]: { [Op.ne]: null } }, raw: true });
            list.forEach((r: any) => add(r.attId, ref, r.srcId));
          } else {
            const list = await attModel.findAll({ attributes: [['id', 'attId']], where: { [fk]: { [Op.ne]: null } }, raw: true });
            list.forEach((r: any) => add(r.attId, ref, null));
          }
        }
      } catch (e: any) {
        errors.push({ collection: ref.name, field: ref.field, type: ref.type, error: String(e?.message || e) });
      }
    }

    const flatUsage: Record<string, any[]> = {};
    for (const attId of Object.keys(usage)) flatUsage[attId] = Object.values(usage[attId]);

    return {
      usage: flatUsage,
      usedIds,
      refs: refs.map((r) => ({ collection: r.name, title: r.title, field: r.field, type: r.type })),
      errors,
    };
  }
}

export default PluginFileVaultServer;
