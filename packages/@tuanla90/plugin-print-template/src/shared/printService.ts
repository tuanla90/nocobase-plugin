// Fetch the record, run Handlebars over the template parts, open the print window.
// Auth rides on the app's own api client (session token) — never a hardcoded JWT.
import { ensureAlasql, templateUsesSql } from './alasqlLoader';
import { createRenderer } from './helpers';
import { MultiItem, buildMultiDocument, buildPrintDocument, openPrintDocument } from './printDoc';
import { PrintTemplate, TEMPLATES_COLLECTION, pickTemplateForRecord } from './types';
import { t, te } from './i18n';

/** Load heavyweight optional libs (alasql for the `sql` helper) before rendering. */
export async function ensureTemplateLibs(template: PrintTemplate): Promise<void> {
  if (templateUsesSql(template.bodyHtml, template.headerHtml, template.footerHtml, template.filename)) {
    await ensureAlasql();
  }
}

// Resolve the collection a settings dialog applies to. Record actions carry a
// collection on their context; a standalone block carries only the record identity
// in ctx.view.inputArgs, so fall back to dataSourceManager there.
export function settingsCollection(ctx: any): any {
  const c = ctx?.model?.context || {};
  if (c.collection?.name) return c.collection;
  if (c.blockModel?.collection?.name) return c.blockModel.collection;
  const ia = c.view?.inputArgs;
  if (ia?.collectionName && c.dataSourceManager?.getCollection) {
    return c.dataSourceManager.getCollection(ia.dataSourceKey || 'main', ia.collectionName);
  }
  return null;
}

// Async uiSchema field for action settings: a Select of the collection's templates
// (label = name, value = id). uiSchema functions are awaited by the flow engine, so
// we can fetch here. `ctx` is the settings-step runtime context.
export async function templateSelectSchema(ctx: any, title: string, allowEmpty = true): Promise<any> {
  const api = ctx?.model?.context?.api;
  const collection = settingsCollection(ctx);
  let list: PrintTemplate[] = [];
  if (api && collection?.name) list = await fetchTemplates(api, collection.name).catch(() => []);
  const enumOpts = [
    { label: te('🔀 Tự động theo dữ liệu (điều kiện)'), value: AUTO_TEMPLATE },
    ...list.map((t) => ({ label: t.title || `#${t.id}`, value: String(t.id) })),
  ];
  return {
    type: 'string',
    title,
    'x-decorator': 'FormItem',
    'x-component': 'Select',
    'x-component-props': { allowClear: allowEmpty, placeholder: allowEmpty ? te('Trống = template đầu tiên') : te('Chọn template') },
    enum: enumOpts,
  };
}

/** Sentinel value for "pick template dynamically by the record's data". */
export const AUTO_TEMPLATE = 'auto';

export async function fetchTemplates(api: any, collectionName?: string): Promise<PrintTemplate[]> {
  const filter: any = { enabled: { $ne: false } };
  if (collectionName) filter.collectionName = collectionName;
  const res = await api.request({
    url: `${TEMPLATES_COLLECTION}:list`,
    params: { paginate: false, filter, sort: ['id'] },
  });
  return res?.data?.data || [];
}

export async function fetchRecordData(api: any, template: PrintTemplate, filterByTk: any): Promise<any> {
  const params: any = { filterByTk };
  const appends = (template.appends || []).filter(Boolean);
  if (appends.length) params.appends = appends;
  const res = await api.request({ url: `${template.collectionName}:get`, params });
  return res?.data?.data;
}

// A literal {{#each}} between table rows gets destroyed by DOM parsers (the visual
// editor, and browsers' foster parenting) — so GrapesJS templates mark the repeat row
// with data-pt-each="relation" and we expand it into {{#each}} right before compiling.
function expandEachAttrs(src: string): string {
  return src.replace(
    /<tr([^>]*?)\s+data-pt-each="([^"]+)"([^>]*)>([\s\S]*?)<\/tr>/gi,
    '{{#each $2}}<tr$1$3>$4</tr>{{/each}}',
  );
}

/** Templates flagged "dùng làm khối chung" — excluded from the picker, registered as
 *  Handlebars partials so any template can embed them with {{> slug}}. */
export function partialTemplates(list: PrintTemplate[]): PrintTemplate[] {
  return list.filter((t) => t.isPartial && t.slug);
}
/** Templates the user can print directly (partials hidden). */
export function printableTemplates(list: PrintTemplate[]): PrintTemplate[] {
  return list.filter((t) => !t.isPartial);
}

export function renderTemplateParts(template: PrintTemplate, data: any, partials?: PrintTemplate[]) {
  const hb = createRenderer();
  for (const p of partials || []) {
    if (p.slug) (hb as any).registerPartial(p.slug, expandEachAttrs(p.bodyHtml || ''));
  }
  const run = (src?: string) => {
    if (!src) return '';
    return hb.compile(expandEachAttrs(src))(data || {});
  };
  return {
    headerHtml: run(template.headerHtml),
    bodyHtml: run(template.bodyHtml || ''),
    footerHtml: run(template.footerHtml),
    title: template.filename ? run(template.filename) : template.title,
  };
}

/** The whole pipeline: record → handlebars → print window. Throws on fetch errors. */
export async function printRecord(api: any, template: PrintTemplate, filterByTk: any) {
  const [data, list] = await Promise.all([
    fetchRecordData(api, template, filterByTk),
    fetchTemplates(api, template.collectionName).catch(() => [] as PrintTemplate[]),
    ensureTemplateLibs(template),
  ]);
  const parts = renderTemplateParts(template, data, partialTemplates(list));
  openPrintDocument(buildPrintDocument(template, parts));
}

/** First record of the collection (with appends) — sample data for previews. */
export async function fetchSampleData(api: any, template: PrintTemplate): Promise<any> {
  if (!template.collectionName) return {};
  try {
    const params: any = { pageSize: 1, page: 1 };
    const appends = (template.appends || []).filter(Boolean);
    if (appends.length) params.appends = appends;
    const res = await api.request({ url: `${template.collectionName}:list`, params });
    return res?.data?.data?.[0] || {};
  } catch (e) {
    return {};
  }
}

/** A page of records (with appends) for the preview record-picker. */
export async function fetchSampleRecords(api: any, template: PrintTemplate, limit = 50): Promise<any[]> {
  if (!template.collectionName) return [];
  try {
    const params: any = { pageSize: limit, page: 1, sort: ['-id'] };
    const appends = (template.appends || []).filter(Boolean);
    if (appends.length) params.appends = appends;
    const res = await api.request({ url: `${template.collectionName}:list`, params });
    return res?.data?.data || [];
  } catch (e) {
    return [];
  }
}

/** Human label for a record in the picker: a title-ish field, else its id. */
export function recordLabel(r: any): string {
  if (!r || typeof r !== 'object') return String(r ?? '');
  for (const k of ['title', 'name', 'code', 'label', 'subject', 'fullName']) {
    if (typeof r[k] === 'string' && r[k].trim()) return `${r[k]} (#${r.id ?? '?'})`;
  }
  return `#${r.id ?? '?'}`;
}

/** Print the exact data object currently shown in the preview (respects unsaved template
 *  edits) — opens the print window without re-fetching the record. */
export async function printData(api: any, template: PrintTemplate, data: any): Promise<void> {
  const list = await fetchTemplates(api, template.collectionName).catch(() => [] as PrintTemplate[]);
  await ensureTemplateLibs(template);
  const parts = renderTemplateParts(template, data || {}, partialTemplates(list));
  openPrintDocument(buildPrintDocument(template, parts));
}

/** Batch print: render many records into one document and open the print window.
 *  pinnedId undefined + auto=false → first template; auto=true → per-record condition. */
export async function batchPrint(
  api: any,
  collectionName: string,
  templates: PrintTemplate[],
  tks: any[],
  opts: { pinnedId?: number; auto?: boolean },
): Promise<void> {
  const items: MultiItem[] = [];
  for (const tk of tks) {
    let tpl: PrintTemplate | undefined;
    let data: any;
    const printable = printableTemplates(templates);
    if (opts.auto) {
      const min = await api.request({ url: `${collectionName}:get`, params: { filterByTk: tk } }).then((r: any) => r?.data?.data || {}).catch(() => ({}));
      tpl = pickTemplateForRecord(printable, min);
    } else {
      tpl = (opts.pinnedId && printable.find((t) => t.id === opts.pinnedId)) || printable[0];
    }
    if (!tpl) continue;
    data = await fetchRecordData(api, { ...tpl, collectionName } as any, tk).catch(() => ({}));
    await ensureTemplateLibs(tpl);
    items.push({ template: tpl, parts: renderTemplateParts(tpl, data, partialTemplates(templates)) });
  }
  if (!items.length) throw new Error(t('Không có bản ghi / template để in'));
  openPrintDocument(buildMultiDocument(items));
}

/** Preview with the first record of the collection (used by the template editor). */
export async function printPreview(api: any, template: PrintTemplate) {
  const [data, list] = await Promise.all([
    fetchSampleData(api, template),
    fetchTemplates(api, template.collectionName).catch(() => [] as PrintTemplate[]),
    ensureTemplateLibs(template),
  ]);
  const parts = renderTemplateParts(template, data, partialTemplates(list));
  openPrintDocument(buildPrintDocument(template, parts));
}
