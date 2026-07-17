/**
 * @ptdl/shared/relativeTime — "N units ago / in N units" from a date value.
 *
 * There are three near-duplicate copies across plugins (SHARED-DEDUP-AUDIT §10b): block-custom-html
 * `timeAgo` (vi, with future), change-log `relativeTime` (bilingual, adds "week"), field-enhancements
 * `reduceUnit` (day-distance feeding i18n plural templates). Their vocabularies/granularities differ,
 * so this core is fully parameterized: a caller supplies its own `units` ladder and phrase builders,
 * and behaviour is preserved by construction.
 *
 * The DEFAULT options reproduce block-custom-html's `timeAgo` exactly (Vietnamese, seconds-based,
 * năm/tháng/ngày/giờ/phút, past = "N u trước", future = "sau N u").
 */

/** [seconds-in-unit, unit-label] pairs, largest first. */
export type RtUnit = [number, string];

export interface RelativeTimeOpts {
  /** Reference "now" in epoch ms. Defaults to Date.now() at call time. */
  now?: number;
  /** Unit ladder, largest first. Default = năm/tháng/ngày/giờ/phút. */
  units?: RtUnit[];
  /** Phrase for a past distance. Default = `${n} ${unit} trước`. */
  past?: (n: number, unit: string) => string;
  /** Phrase for a future distance. Default = `sau ${n} ${unit}`. */
  future?: (n: number, unit: string) => string;
  /** Shown when the distance is under the smallest unit, in the past. Default 'vừa xong'. */
  justNow?: string;
  /** Shown when the distance is under the smallest unit, in the future. Default 'sắp tới'. */
  soon?: string;
}

const DEFAULT_UNITS: RtUnit[] = [
  [31536000, 'năm'],
  [2592000, 'tháng'],
  [86400, 'ngày'],
  [3600, 'giờ'],
  [60, 'phút'],
];

/**
 * Format `value` (Date | ISO string | epoch ms) as a relative-time phrase.
 * Returns '' for null/blank, and the raw string for an unparseable value.
 */
export function relativeTime(value: any, opts: RelativeTimeOpts = {}): string {
  if (value == null || value === '') return '';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return String(value);

  const now = opts.now == null ? Date.now() : opts.now;
  const s = Math.floor((now - d.getTime()) / 1000);
  const abs = Math.abs(s);
  const units = opts.units || DEFAULT_UNITS;
  const past = opts.past || ((n, u) => `${n} ${u} trước`);
  const future = opts.future || ((n, u) => `sau ${n} ${u}`);

  for (const [sec, label] of units) {
    if (abs >= sec) {
      const n = Math.floor(abs / sec);
      return s >= 0 ? past(n, label) : future(n, label);
    }
  }
  return s >= 0 ? opts.justNow ?? 'vừa xong' : opts.soon ?? 'sắp tới';
}
