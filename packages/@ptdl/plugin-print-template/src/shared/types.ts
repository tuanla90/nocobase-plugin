// Data model of a print template. Stored in the plugin-owned collection
// `ptdl_print_templates` — one row per template, bound to one collection.
import { get } from '@ptdl/shared/format';

export const TEMPLATES_COLLECTION = 'ptdl_print_templates';

export type WatermarkPosition =
  | 'center'
  | 'top-left'
  | 'top'
  | 'top-right'
  | 'left'
  | 'right'
  | 'bottom-left'
  | 'bottom'
  | 'bottom-right';

export interface WatermarkConfig {
  enabled?: boolean;
  /** Text watermark (ignored when imageUrl is set). */
  text?: string;
  imageUrl?: string;
  /** 0..1 — defaults to 0.08 */
  opacity?: number;
  /** degrees, defaults to -30 */
  angle?: number;
  /** px, defaults to 84 */
  fontSize?: number;
  color?: string;
  /** 9-grid placement, defaults to 'center'. */
  position?: WatermarkPosition;
  /** fine nudge from the anchor, in px (can be negative). */
  offsetX?: number;
  offsetY?: number;
  /** image watermark width as % of the page, defaults to 60. */
  imageWidth?: number;
  /** repeat across the whole page (tiled) instead of a single mark. */
  tile?: boolean;
  /** spacing between tiles in px, defaults to 40. */
  tileGap?: number;
  /** draw behind the content instead of over it. */
  behind?: boolean;
}

export interface PageSetup {
  /** CSS @page size keyword. */
  size?: 'A4' | 'A5' | 'A3' | 'letter';
  orientation?: 'portrait' | 'landscape';
  /** CSS length for @page margin, e.g. '12mm'. */
  margin?: string;
  /** Paged.js mode: real pagination with "Trang X / Y" in the bottom margin. */
  pageNumbers?: boolean;
}

export interface PrintTemplate {
  id?: number;
  title?: string;
  collectionName?: string;
  /** Relation field names appended to the record fetch (rows for {{#each}} loops). */
  appends?: string[];
  bodyHtml?: string;
  headerHtml?: string;
  footerHtml?: string;
  /** Extra CSS appended after the built-in print styles. */
  css?: string;
  watermark?: WatermarkConfig;
  pageSetup?: PageSetup;
  /** Handlebars template for the document title (= suggested PDF filename). */
  filename?: string;
  enabled?: boolean;
  /** Legacy single condition (kept for old templates). Prefer `conditions`. */
  whenField?: string;
  whenValues?: string[];
  /** Dynamic selection: template applies when ALL conditions match. Each condition:
   *  the record value at `field` (dot-path, e.g. client.type) is one of `values`.
   *  Empty conditions = a default/fallback template (matches any record). */
  conditions?: TemplateCondition[];
  /** Reusable block: hidden from the print picker, registered as a Handlebars partial
   *  under `slug` so other templates embed it with {{> slug}}. */
  isPartial?: boolean;
  slug?: string;
}

export interface TemplateCondition {
  /** dot-path into the record, e.g. `status` or `client.type` */
  field: string;
  values: string[];
}

/** Read a possibly-nested value from a record by dot-path — delegates to @ptdl/shared's `get`. */
export function getByPath(obj: any, path: string): any {
  return path ? get(obj, path) : undefined;
}

/** Normalize a template's conditions (merge legacy whenField/whenValues in). */
export function templateConditions(t: PrintTemplate): TemplateCondition[] {
  const list = (t.conditions || []).filter((c) => c && c.field && (c.values || []).length);
  if (!list.length && t.whenField && (t.whenValues || []).length) {
    return [{ field: t.whenField, values: t.whenValues as string[] }];
  }
  return list;
}

/** Pick the template for a record in "auto" mode: first template whose conditions ALL
 *  match, else the first template with no condition (the default). */
export function pickTemplateForRecord(templates: PrintTemplate[], record: any): PrintTemplate | undefined {
  const conds = (t: PrintTemplate) => templateConditions(t);
  const matches = (t: PrintTemplate) => {
    const cs = conds(t);
    return cs.length > 0 && cs.every((c) => c.values.map(String).includes(String(getByPath(record, c.field))));
  };
  const conditional = templates.filter((t) => conds(t).length > 0);
  for (const t of conditional) if (matches(t)) return t;
  return templates.find((t) => conds(t).length === 0) || templates[0];
}

export const DEFAULT_PAGE_SETUP: Required<PageSetup> = {
  size: 'A4',
  orientation: 'portrait',
  margin: '12mm',
};

export const DEFAULT_WATERMARK: Required<Omit<WatermarkConfig, 'text' | 'imageUrl'>> = {
  enabled: false,
  opacity: 0.08,
  angle: -30,
  fontSize: 84,
  color: '#000000',
};
