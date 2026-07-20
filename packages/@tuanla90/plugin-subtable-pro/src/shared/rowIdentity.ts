/**
 * Ported from @nocobase/client-v2 SubTableFieldModel/rowIdentity.ts (NOT exported from the package).
 * Keeps our forked presentational table row-key logic identical to the native sub-table so submit and
 * pagination behave the same. `uid()` is a local impl to avoid pulling @formily/shared into the bundle.
 */

type FilterTargetKey = string | string[] | null | undefined;
type SubTableRow = { __is_new__?: boolean; id?: any; [key: string]: any };

export const SUB_TABLE_TEMP_ROW_KEY = '__index__';

let _seq = 0;
function uid(): string {
  _seq += 1;
  // No Date.now()/Math.random() needed — a monotonic counter is enough for temp row keys within a form.
  return `r${_seq.toString(36)}${(_seq * 2654435761 % 2147483647).toString(36)}`;
}

function getPersistedRowKey(record: SubTableRow, filterTargetKey: FilterTargetKey) {
  if (!filterTargetKey) return null;
  if (Array.isArray(filterTargetKey)) {
    const values = filterTargetKey.map((k) => record?.[k]);
    if (values.some((v) => v == null)) return null;
    return values.map((v) => String(v)).join('__');
  }
  const value = record?.[filterTargetKey];
  return value == null ? null : String(value);
}

export function getSubTableRowIdentity(record: SubTableRow, filterTargetKey: FilterTargetKey) {
  const tempKey = record?.[SUB_TABLE_TEMP_ROW_KEY];
  if (record?.__is_new__ && tempKey != null && tempKey !== '') return `tmp:${String(tempKey)}`;
  const persistedKey = getPersistedRowKey(record, filterTargetKey);
  if (persistedKey != null) return `pk:${persistedKey}`;
  if (tempKey != null && tempKey !== '') return `tmp:${String(tempKey)}`;
  return null;
}

export function normalizeSubTableRows(rows: SubTableRow[]) {
  if (!rows?.length) return rows;
  let changed = false;
  const normalized = rows.map((row) => {
    const tempKey = row?.[SUB_TABLE_TEMP_ROW_KEY];
    if (!row.__is_new__ || (tempKey != null && tempKey !== '')) return row;
    changed = true;
    return { ...row, [SUB_TABLE_TEMP_ROW_KEY]: uid() };
  });
  return changed ? normalized : rows;
}
