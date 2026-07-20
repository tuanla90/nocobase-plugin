import {
  parseCredentials,
  getSheetValues,
  getSpreadsheetMeta,
  batchUpdateValues,
  appendRowValues,
  batchUpdateSpreadsheet,
} from './google';
import { slugifyHeader, nbTypeToColType, ColType, SHEET_ROW_FIELD } from './sync';

// V2 write-back: NocoBase → Google Sheets. Bound per connection with twoWay enabled
// (upsert mode + key column required — row identity on the sheet is the KEY COLUMN,
// _sheet_row is only a hint). Changes are queued per record and flushed as one
// values:batchUpdate after a short debounce.

export const PULL_CONTEXT_FLAG = 'ptdlGsheetPull';

export const colLetter = (i: number): string => {
  let s = '';
  let n = i;
  while (n >= 0) {
    s = String.fromCharCode((n % 26) + 65) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
};

const pad = (n: number) => String(n).padStart(2, '0');

// record value → what we type into the cell (USER_ENTERED)
export function toSheetValue(v: any, type: ColType | null): any {
  if (v === null || v === undefined) return '';
  if (type === 'boolean') return !!v;
  if (type === 'integer' || type === 'number') {
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : '';
  }
  if (type === 'date') {
    const d = v instanceof Date ? v : new Date(v);
    if (isNaN(d.getTime())) return String(v);
    const hasTime = d.getHours() + d.getMinutes() + d.getSeconds() > 0;
    const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    return hasTime ? `${day} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` : day;
  }
  const s = typeof v === 'string' ? v : String(v);
  // formula-injection guard: never let record data execute in someone's sheet
  return /^[=+@]/.test(s) ? `'${s}` : s;
}

interface QueueItem {
  op: 'upsert' | 'delete';
  values: any; // snapshot of record values at event time
}

export class WritebackManager {
  private listeners = new Map<number, { events: { name: string; fn: any }[] }>();
  private queues = new Map<number, Map<string, QueueItem>>();
  private timers = new Map<number, any>();
  private flushing = new Set<number>();

  constructor(private plugin: any) {}

  private get db() {
    return this.plugin.db;
  }
  private log(level: 'info' | 'warn', msg: string) {
    this.plugin.app.logger?.[level]?.(`[gsheet-sync/push] ${msg}`);
  }

  async rebindAll(connCollection: string) {
    this.unbindAll();
    const repo: any = this.db.getRepository(connCollection);
    if (!repo) return;
    let rows: any[] = [];
    try {
      rows = await repo.find({ filter: { enabled: true, twoWay: true } });
    } catch {
      return; // table not synced yet (first boot)
    }
    for (const row of rows) {
      if (row.syncMode !== 'upsert' || !row.keyColumn || !row.targetCollection) {
        this.log('warn', `bỏ qua "${row.title}": 2 chiều cần upsert + cột khóa`);
        continue;
      }
      this.bind(row);
    }
    if (rows.length) this.log('info', `bound ${this.listeners.size} connection(s)`);
  }

  private bind(row: any) {
    const connId = row.id;
    const col = row.targetCollection;
    const mk = (op: QueueItem['op']) => async (model: any, options: any) => {
      if (options?.context?.[PULL_CONTEXT_FLAG]) return;
      const values = typeof model?.toJSON === 'function' ? model.toJSON() : { ...(model?.dataValues || model) };
      const enqueue = () => this.enqueue(connId, values, op);
      if (options?.transaction?.afterCommit) options.transaction.afterCommit(enqueue);
      else enqueue();
    };
    const events = [
      { name: `${col}.afterCreateWithAssociations`, fn: mk('upsert') },
      { name: `${col}.afterUpdateWithAssociations`, fn: mk('upsert') },
      { name: `${col}.afterDestroy`, fn: mk('delete') },
    ];
    for (const e of events) this.db.on(e.name, e.fn);
    this.listeners.set(connId, { events });
  }

  unbindAll() {
    for (const { events } of this.listeners.values()) {
      for (const e of events) this.db.off(e.name, e.fn);
    }
    this.listeners.clear();
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
  }

  private enqueue(connId: number, values: any, op: QueueItem['op']) {
    let q = this.queues.get(connId);
    if (!q) {
      q = new Map();
      this.queues.set(connId, q);
    }
    const pk = String(values?.id ?? JSON.stringify(values));
    const prev = q.get(pk);
    // delete wins over a pending upsert of the same record
    q.set(pk, { op: prev?.op === 'delete' ? 'delete' : op, values });
    this.schedule(connId);
  }

  private schedule(connId: number, delayMs?: number) {
    if (this.timers.has(connId)) return;
    const run = async () => {
      this.timers.delete(connId);
      try {
        await this.flush(connId);
      } catch (e: any) {
        this.log('warn', `flush conn#${connId} lỗi: ${e?.message}`);
      }
      // changes that arrived while flushing get their own round
      if (this.queues.get(connId)?.size) this.schedule(connId);
    };
    // debounce read fresh at flush; default 3s
    this.timers.set(connId, setTimeout(run, delayMs ?? 3000));
  }

  // Resolve push field specs against the LIVE header row: which record field goes
  // to which sheet column, and how to format it (type from the real target field).
  private async resolvePush(row: any, sa: any) {
    const headers: string[] = ((await getSheetValues(sa, row.spreadsheetId, `${row.sheetName}!1:1`))[0] || []).map(
      (h: any) => String(h ?? ''),
    );
    if (!headers.length) throw new Error('Sheet không có dòng tiêu đề');
    const target: any = this.db.getCollection(row.targetCollection);
    if (!target) throw new Error(`Collection ${row.targetCollection} không tồn tại`);

    const mappings: any[] = Array.isArray(row.mappings)
      ? row.mappings.filter((m: any) => m && m.header && m.field && m.include !== false)
      : [];
    let specs: { name: string; header: string; col: number; type: ColType | null }[];
    if (mappings.length) {
      specs = mappings
        .map((m: any) => ({ name: m.field, header: m.header, col: headers.indexOf(m.header), type: null as ColType | null }))
        .filter((s) => s.col >= 0);
    } else {
      specs = headers.map((h, i) => ({ name: slugifyHeader(h, i), header: h, col: i, type: null as ColType | null }));
    }
    specs = specs
      .map((s) => {
        const f = target.getField(s.name);
        return f ? { ...s, type: nbTypeToColType(f.options?.type || f.type) } : null;
      })
      .filter(Boolean) as any[];

    const keySpec = specs.find((s) => s.header === row.keyColumn || s.name === row.keyColumn);
    if (!keySpec) throw new Error(`Không tìm thấy cột khóa "${row.keyColumn}" trên sheet/collection`);
    return { headers, specs, keySpec };
  }

  private async keyRowMap(row: any, sa: any, keyCol: number): Promise<Map<string, number>> {
    const L = colLetter(keyCol);
    const vals = await getSheetValues(sa, row.spreadsheetId, `${row.sheetName}!${L}2:${L}`);
    const map = new Map<string, number>();
    vals.forEach((r: any[], i: number) => {
      const v = r?.[0];
      if (v !== null && v !== undefined && v !== '') map.set(String(v), i + 2);
    });
    return map;
  }

  async flush(connId: number): Promise<{ updated: number; appended: number; removed: number; skipped: number }> {
    const stats = { updated: 0, appended: 0, removed: 0, skipped: 0 };
    if (this.flushing.has(connId)) return stats;
    const q = this.queues.get(connId);
    if (!q || !q.size) return stats;
    this.flushing.add(connId);
    const items = [...q.values()];
    q.clear();
    try {
      const repo: any = this.db.getRepository('ptdl_gsheet_connections');
      const row = await repo.findOne({ filter: { id: connId } });
      if (!row || !row.twoWay || !row.enabled) return stats;
      const sa = parseCredentials(await this.plugin.resolveConnCredentials(row));
      const { specs, keySpec } = await this.resolvePush(row, sa);
      const rowByKey = await this.keyRowMap(row, sa, keySpec.col);
      const maxCol = Math.max(...specs.map((s) => s.col));

      const cellData: { range: string; values: any[][] }[] = [];
      const deleteRows: number[] = [];
      const appends: { values: any; rowArr: any[] }[] = [];

      for (const item of items) {
        const keyVal = item.values?.[keySpec.name];
        if (keyVal === null || keyVal === undefined || keyVal === '') {
          stats.skipped++;
          continue;
        }
        const sheetRow = rowByKey.get(String(keyVal));
        if (item.op === 'delete') {
          if (!sheetRow || row.pushDeletes === 'none' || !row.pushDeletes) {
            stats.skipped++;
            continue;
          }
          if (row.pushDeletes === 'delete') {
            deleteRows.push(sheetRow);
          } else {
            // clear: blank out mapped cells, keep the row
            for (const s of specs) {
              cellData.push({ range: `${row.sheetName}!${colLetter(s.col)}${sheetRow}`, values: [['']] });
            }
          }
          stats.removed++;
          continue;
        }
        if (sheetRow) {
          for (const s of specs) {
            cellData.push({
              range: `${row.sheetName}!${colLetter(s.col)}${sheetRow}`,
              values: [[toSheetValue(item.values[s.name], s.type)]],
            });
          }
          stats.updated++;
        } else {
          const rowArr = new Array(maxCol + 1).fill('');
          for (const s of specs) rowArr[s.col] = toSheetValue(item.values[s.name], s.type);
          appends.push({ values: item.values, rowArr });
        }
      }

      await batchUpdateValues(sa, row.spreadsheetId, cellData);

      for (const a of appends) {
        const newRow = await appendRowValues(sa, row.spreadsheetId, row.sheetName, a.rowArr);
        stats.appended++;
        if (newRow && a.values?.id !== undefined) {
          try {
            const targetRepo: any = this.db.getRepository(row.targetCollection);
            await targetRepo.update({
              filter: { id: a.values.id },
              values: { [SHEET_ROW_FIELD]: newRow },
              hooks: false,
              context: { [PULL_CONTEXT_FLAG]: true },
            });
          } catch {
            /* hint only */
          }
        }
      }

      if (deleteRows.length) {
        const meta = await getSpreadsheetMeta(sa, row.spreadsheetId);
        const sheetId = meta.sheets.find((s: any) => s.title === row.sheetName)?.sheetId;
        if (sheetId === undefined) throw new Error(`Không tìm thấy tab "${row.sheetName}"`);
        // delete bottom-up so earlier deletions don't shift later indexes
        const requests = deleteRows
          .sort((a, b) => b - a)
          .map((r) => ({ deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: r - 1, endIndex: r } } }));
        await batchUpdateSpreadsheet(sa, row.spreadsheetId, requests);
      }

      this.log(
        'info',
        `conn#${connId} push: ${stats.updated} sửa, ${stats.appended} thêm, ${stats.removed} xoá, ${stats.skipped} bỏ qua`,
      );
      return stats;
    } catch (e: any) {
      // requeue so the next change (or pushNow) retries these items
      const q2 = this.queues.get(connId) || new Map();
      for (const item of items) {
        const pk = String(item.values?.id ?? JSON.stringify(item.values));
        if (!q2.has(pk)) q2.set(pk, item);
      }
      this.queues.set(connId, q2);
      throw e;
    } finally {
      this.flushing.delete(connId);
    }
  }

  // Backfill: queue EVERY record of the target collection, then flush immediately.
  async pushAll(row: any) {
    const targetRepo: any = this.db.getRepository(row.targetCollection);
    if (!targetRepo) throw new Error(`Collection ${row.targetCollection} không tồn tại`);
    const records = await targetRepo.find();
    for (const r of records) this.enqueue(row.id, typeof r.toJSON === 'function' ? r.toJSON() : r, 'upsert');
    const t = this.timers.get(row.id);
    if (t) {
      clearTimeout(t);
      this.timers.delete(row.id);
    }
    return this.flush(row.id);
  }
}
