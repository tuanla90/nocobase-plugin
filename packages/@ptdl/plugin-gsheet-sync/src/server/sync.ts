import {
  ServiceAccount,
  getSheetValues,
  getSheetValuesFormatted,
  getSheetNumberFormats,
} from './google';

// ---------- header → field-name slug ----------

const RESERVED = new Set(['id', 'createdat', 'updatedat', 'createdby', 'updatedby', 'sort']);

export function slugifyHeader(header: string, index: number): string {
  let s = String(header || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, (c) => (c === 'đ' ? 'd' : 'D'))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!s) s = `col_${index + 1}`;
  if (/^[0-9]/.test(s)) s = `c_${s}`;
  if (RESERVED.has(s)) s = `${s}_col`;
  return s;
}

export function buildFieldNames(headers: string[]): { name: string; title: string }[] {
  const used = new Set<string>();
  return headers.map((h, i) => {
    let name = slugifyHeader(h, i);
    let n = 2;
    while (used.has(name)) name = `${slugifyHeader(h, i)}_${n++}`;
    used.add(name);
    return { name, title: String(h || `Cột ${i + 1}`) };
  });
}

// ---------- type inference ----------

export type ColType = 'string' | 'text' | 'integer' | 'number' | 'boolean' | 'date';

const DATEISH = /(\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4})|(\d{1,2}:\d{2})/;

// Google's own numberFormat.type values that mean "this cell is a date/time".
const DATE_FORMAT_TYPES = new Set(['DATE', 'DATE_TIME', 'TIME']);

// values: UNFORMATTED (numbers are real numbers, date cells are day-serials).
// formats: per-cell effective numberFormat.type (authoritative date signal).
// formatted: same cells as displayed (fallback signal when formats are missing).
export function inferColumnType(
  values: any[],
  formatted: (string | undefined)[],
  formats?: (string | undefined)[],
): ColType {
  let sawAny = false;
  let allBool = true;
  let allNum = true;
  let allInt = true;
  let dateVotes = 0;
  let numCount = 0;
  let voteDenom = 0; // numeric cells that carry a date-vs-number signal — the vote denominator
  let maxLen = 0;

  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v === null || v === undefined || v === '') continue;
    sawAny = true;
    if (typeof v === 'boolean') {
      allNum = false;
      continue;
    }
    allBool = false;
    if (typeof v === 'number') {
      numCount++;
      if (!Number.isInteger(v)) allInt = false;
      const ft = formats?.[i];
      const f = formatted[i];
      if (ft) {
        // authoritative: the cell's own number format tells us date vs number
        voteDenom++;
        if (DATE_FORMAT_TYPES.has(ft)) dateVotes++;
      } else if (typeof f === 'string' && f.trim()) {
        // fallback: infer from the displayed string (locale-dependent, best-effort)
        voteDenom++;
        if (DATEISH.test(f) && !/^-?[\d.,\s]+$/.test(f.trim())) dateVotes++;
      }
      continue;
    }
    allNum = false;
    maxLen = Math.max(maxLen, String(v).length);
  }

  if (!sawAny) return 'string';
  if (allBool) return 'boolean';
  if (allNum && numCount > 0) {
    // a solid majority of the numeric cells looking like dates → date column
    if (voteDenom > 0 && dateVotes >= Math.max(1, Math.ceil(voteDenom * 0.6))) return 'date';
    return allInt ? 'integer' : 'number';
  }
  return maxLen > 200 ? 'text' : 'string';
}

// Google Sheets day-serial (epoch 1899-12-30) → JS Date
export function serialToDate(serial: number): Date {
  return new Date(Math.round((serial - 25569) * 86400 * 1000));
}

export function coerceValue(v: any, type: ColType): any {
  if (v === null || v === undefined || v === '') return null;
  switch (type) {
    case 'boolean':
      if (typeof v === 'boolean') return v;
      return ['true', '1', 'yes', 'x'].includes(String(v).trim().toLowerCase());
    case 'integer': {
      const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''));
      return Number.isFinite(n) ? Math.round(n) : null;
    }
    case 'number': {
      const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''));
      return Number.isFinite(n) ? n : null;
    }
    case 'date':
      if (typeof v === 'number') return serialToDate(v);
      return String(v);
    default:
      return typeof v === 'string' ? v : String(v);
  }
}

// ---------- NocoBase field defs ----------

export function fieldDef(name: string, title: string, type: ColType): any {
  const base: any = { name, uiSchema: { title } };
  switch (type) {
    case 'boolean':
      return { ...base, type: 'boolean', interface: 'checkbox', uiSchema: { ...base.uiSchema, type: 'boolean', 'x-component': 'Checkbox' } };
    case 'integer':
      return { ...base, type: 'bigInt', interface: 'integer', uiSchema: { ...base.uiSchema, type: 'number', 'x-component': 'InputNumber', 'x-component-props': { stringMode: false, step: '1' } } };
    case 'number':
      return { ...base, type: 'double', interface: 'number', uiSchema: { ...base.uiSchema, type: 'number', 'x-component': 'InputNumber', 'x-component-props': { step: '0.01' } } };
    case 'date':
      return { ...base, type: 'date', interface: 'datetime', uiSchema: { ...base.uiSchema, type: 'string', 'x-component': 'DatePicker', 'x-component-props': { showTime: false, dateFormat: 'DD/MM/YYYY' } } };
    case 'text':
      return { ...base, type: 'text', interface: 'textarea', uiSchema: { ...base.uiSchema, type: 'string', 'x-component': 'Input.TextArea' } };
    default:
      return { ...base, type: 'string', interface: 'input', uiSchema: { ...base.uiSchema, type: 'string', 'x-component': 'Input' } };
  }
}

export const SHEET_ROW_FIELD = '_sheet_row';

// NocoBase field type → coercion type, for syncing into EXISTING collections
// (the target field's real type wins over inference). null = unsupported (relations…).
export function nbTypeToColType(t: string): ColType | null {
  switch (t) {
    case 'integer':
    case 'bigInt':
      return 'integer';
    case 'float':
    case 'double':
    case 'decimal':
    case 'real':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'date':
    case 'datetime':
    case 'dateOnly':
    case 'datetimeNoTz':
    case 'datetimeTz':
    case 'unixTimestamp':
      return 'date';
    case 'text':
      return 'text';
    case 'string':
    case 'uuid':
    case 'nanoid':
    case 'uid':
    case 'email':
    case 'phone':
    case 'url':
      return 'string';
    default:
      return null;
  }
}

// ---------- sheet snapshot (fetch + analyze, shared by preview & sync) ----------

export interface FieldSpec {
  name: string;
  title: string;
  type: ColType;
  col?: number; // sheet column index; defaults to array position (auto mode)
}

export interface SheetSnapshot {
  headers: string[];
  fields: FieldSpec[];
  rows: any[][]; // data rows, unformatted
  firstDataRow: number; // 1-based sheet row of rows[0]
}

export async function fetchSnapshot(
  sa: ServiceAccount,
  spreadsheetId: string,
  sheetName: string,
  range?: string,
): Promise<SheetSnapshot> {
  const effRange = range && range.trim() ? `${sheetName}!${range.trim()}` : sheetName;
  const values = await getSheetValues(sa, spreadsheetId, effRange);
  if (!values.length) throw new Error('Sheet trống (không có dòng nào trong vùng đã chọn)');
  const headers = (values[0] || []).map((h: any) => String(h ?? ''));
  const rows = values.slice(1);
  const names = buildFieldNames(headers);

  // Sample window (first 200 data rows, same as the inference window) used ONLY for
  // date-vs-number disambiguation. numberFormat.type is authoritative; the formatted
  // string is a locale-dependent fallback for when the format grid can't be read.
  const sampleRange = range && range.trim() ? effRange : `${sheetName}!1:201`;
  let formatRows: string[][] = [];
  try {
    formatRows = await getSheetNumberFormats(sa, spreadsheetId, sampleRange);
  } catch {
    formatRows = [];
  }
  let formattedRows: any[][] = [];
  try {
    formattedRows = await getSheetValuesFormatted(sa, spreadsheetId, sampleRange);
  } catch {
    formattedRows = [];
  }
  const formatData = formatRows.slice(1);
  const formattedData = formattedRows.slice(1);

  const fields = names.map((n, col) => {
    const colVals = rows.slice(0, 200).map((r) => r?.[col]);
    const colFmt = formattedData.slice(0, 200).map((r) => (r?.[col] !== undefined ? String(r[col]) : undefined));
    const colFmtType = formatData.slice(0, 200).map((r) => r?.[col] || undefined);
    return { ...n, type: inferColumnType(colVals, colFmt, colFmtType) };
  });

  // row 1 = header when no explicit range; with a range we still treat its first row as header
  let firstDataRow = 2;
  if (range && range.trim()) {
    const m = range.trim().match(/^[A-Za-z]*(\d+)/);
    firstDataRow = m ? parseInt(m[1], 10) + 1 : 2;
  }
  return { headers, fields, rows, firstDataRow };
}

export function rowToRecord(row: any[], fields: FieldSpec[], sheetRow: number): any {
  const rec: any = { [SHEET_ROW_FIELD]: sheetRow };
  fields.forEach((f, i) => {
    rec[f.name] = coerceValue(row?.[f.col ?? i], f.type);
  });
  return rec;
}

// User-configured column mappings [{header, field, type?, include?}] → FieldSpec list.
// Empty/absent mappings = auto mode (all columns, inferred names/types).
export function resolveMappedFields(snap: SheetSnapshot, mappings: any): FieldSpec[] {
  const rows = (Array.isArray(mappings) ? mappings : []).filter(
    (m: any) => m && m.header && m.field && m.include !== false,
  );
  if (!rows.length) return snap.fields.map((f, i) => ({ ...f, col: i }));
  return rows.map((m: any) => {
    const col = snap.headers.indexOf(m.header);
    if (col < 0) throw new Error(`Không tìm thấy cột "${m.header}" trên sheet — header đã đổi? Mở lại mapping và lưu lại.`);
    const name = String(m.field).trim();
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) throw new Error(`Tên field "${name}" không hợp lệ`);
    return {
      name,
      title: m.header,
      type: (m.type as ColType) || snap.fields[col]?.type || 'string',
      col,
    };
  });
}
