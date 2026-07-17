/**
 * @ptdl/shared/aggregate — small null-safe numeric reducers over row arrays.
 *
 * Seeded from block-custom-html's `buildHelpers` (the canonical copy) and the ≥5 other
 * near-identical reducer sets across plugins (SHARED-DEDUP-AUDIT §10b). Semantics match the
 * originals exactly so callers can swap in place:
 *   - a missing/`null` row, or a non-numeric cell, contributes 0 to `sum` and is skipped by
 *     `min`/`max`/`median`/`range` (via `pluckNums`);
 *   - every reducer returns 0 on an empty input (never NaN/Infinity).
 * `min`/`max`/`range` use a reduce (not `Math.min(...xs)`) so they are safe on very large arrays.
 *
 * `key` is a shallow field name (not a dot-path). For nested access, pre-map the rows.
 */

const cell = (row: any, key?: string): any => (key ? (row == null ? undefined : row[key]) : row);

/** Numeric values of a column, dropping blanks/non-numbers. */
export function pluckNums(arr: any[], key?: string): number[] {
  return (arr || []).map((r) => Number(cell(r, key))).filter((n) => isFinite(n));
}

/** Σ of a column (non-numbers count as 0). */
export function aggSum(arr: any[], key?: string): number {
  return (arr || []).reduce((s: number, r: any) => s + (Number(cell(r, key)) || 0), 0);
}

/** Row count (ignores `key`). */
export function aggCount(arr: any[]): number {
  return (arr || []).length;
}

/** Mean over all rows (0 on empty). Divides by row count, matching the original helpers. */
export function aggAvg(arr: any[], key?: string): number {
  const a = arr || [];
  return a.length ? aggSum(a, key) / a.length : 0;
}

/** Smallest numeric value (0 on empty). */
export function aggMin(arr: any[], key?: string): number {
  const xs = pluckNums(arr, key);
  return xs.length ? xs.reduce((m, n) => (n < m ? n : m), Infinity) : 0;
}

/** Largest numeric value (0 on empty). */
export function aggMax(arr: any[], key?: string): number {
  const xs = pluckNums(arr, key);
  return xs.length ? xs.reduce((m, n) => (n > m ? n : m), -Infinity) : 0;
}

/** Median of the numeric values (0 on empty). */
export function aggMedian(arr: any[], key?: string): number {
  const xs = pluckNums(arr, key).sort((a, b) => a - b);
  if (!xs.length) return 0;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

/** max − min of the numeric values (0 on empty). */
export function aggRange(arr: any[], key?: string): number {
  const xs = pluckNums(arr, key);
  if (!xs.length) return 0;
  let lo = Infinity;
  let hi = -Infinity;
  for (const n of xs) {
    if (n < lo) lo = n;
    if (n > hi) hi = n;
  }
  return hi - lo;
}

/** Group rows into `{ [value of key]: rows[] }` (blank key → ''). */
export function groupBy<T = any>(arr: T[], key: string): Record<string, T[]> {
  const m: Record<string, T[]> = {};
  (arr || []).forEach((r: any) => {
    const k = r == null ? '' : r[key];
    (m[k] = m[k] || []).push(r);
  });
  return m;
}
