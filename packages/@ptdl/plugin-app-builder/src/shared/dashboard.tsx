/**
 * Dashboard materializer — builds a /v/ dashboard flowPage from a high-level DashboardSpec: KPI score
 * cards (Custom HTML block), charts (core ECharts, CUSTOM option = hand-written raw JS, prettier than the
 * builder default), and a filter bar wired to the charts. Every block is a plain createModelOptions literal
 * saved via flowEngine (mirrors createQuickPage's page shell). Block/layout shapes were reverse-engineered
 * from a hand-built dashboard — see reference_nocobase_v2_dashboard_blocks memory.
 */
import { clientPrefix } from './quickView';

// NocoBase-compatible uid (11 lowercase alphanumerics), generated locally (see quickView.tsx note).
function uid(len = 11): string { const c = '0123456789abcdefghijklmnopqrstuvwxyz'; let s = ''; for (let i = 0; i < len; i++) s += c[Math.floor(Math.random() * c.length)]; return s; }

export interface DashboardWidget {
  kind: 'score' | 'chart' | 'filter';
  // score card:
  label?: string; measure?: { field: string; aggregation: 'sum' | 'count' | 'avg' | 'max' | 'min' };
  icon?: string; unit?: string; scale?: number; bg?: string;
  // chart:
  chartType?: 'line' | 'pie' | 'bar'; dimension?: { field: string; format?: string }; title?: string;
  // filter:
  fields?: string[]; filterLabels?: Record<string, string>;   // optional per-field display-name override
}
export interface DashboardSpec { title: string; collection: string; menuGroup?: string; icon?: string; parentId?: number | null; widgets: DashboardWidget[]; }

const CARD_BG = ['#6a5294', '#2d6a5a', '#8a4d63', '#3f5a86', '#7a5230'];
const DATEISH = new Set(['date', 'datetime', 'createdAt', 'updatedAt', 'time', 'datetimeNoTz', 'unixTimestamp']);
const esc = (s: any) => String(s == null ? '' : s).replace(/[`\\$]/g, '');

// ── score card (Custom HTML) ──────────────────────────────────────────────────────────────────────
function scoreCardCode(w: DashboardWidget, i: number): string {
  const bg = w.bg || CARD_BG[i % CARD_BG.length];
  const key = w.label || 'value';
  const valExpr = w.scale && w.scale > 1 ? `(Number(raw) || 0) / ${w.scale}` : 'raw';
  return `const raw = data && data[0] ? data[0][${JSON.stringify(key)}] : 0; const val = ${valExpr}; return \`<div style="position:relative;font-family:Inter,system-ui,sans-serif;padding:24px;border-radius:16px;background:${bg};color:#fff;box-shadow:0 4px 12px rgba(0,0,0,0.18);max-width:100%"><div style="position:absolute;top:20px;right:20px;width:48px;height:48px;border-radius:12px;background:rgba(255,255,255,0.92);color:${bg};display:flex;align-items:center;justify-content:center">\${helpers.icon(${JSON.stringify(w.icon || 'chart-bar')}, { size: 24 })}</div><div style="color:rgba(255,255,255,0.72);font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase">${esc(w.label)}</div><div style="font-size:32px;font-weight:800;line-height:1.2;margin-top:8px">\${helpers.fmt(val)} <span style="font-size:15px;font-weight:400;opacity:0.85">${esc(w.unit)}</span></div></div>\`;`;
}
function scoreBlock(ds: string, coll: string, w: DashboardWidget, i: number, id: string) {
  return {
    uid: id, use: 'CustomHtmlBlockModel',
    stepParams: {
      chartSettings: { configure: { query: { mode: 'builder', collectionPath: [ds, coll], measures: [{ field: [w.measure!.field], aggregation: w.measure!.aggregation, alias: w.label || 'value' }], dimensions: [], orders: [], filter: { logic: '$and', items: [] } } } },
      customHtmlSettings: { code: { code: scoreCardCode(w, i) } },
    },
  };
}

// ── chart (ECharts Pro block — render-time theme + enum→label, no baked raw) ───────────────────────
interface DimInfo { fieldPath: string[]; dataKey: string; format?: string }

/** Resolve a chart dimension to a QUERYABLE field path + the result-row key. A m2o RELATION can't be a
 *  dimension by its bare name (SQL error) — it must group by the target's title field, whose result key is
 *  the DOTTED path `<rel>.<title>` (so the raw reads `x['khach_hang.ho_ten']`, not `x.khach_hang`). */
function resolveDimension(app: any, coll: string, w: DashboardWidget): DimInfo {
  const dim = w.dimension!.field;
  try {
    const dsm = app?.dataSourceManager;
    const getColl = (name: string) => dsm?.getDataSource?.('main')?.getCollection?.(name) || dsm?.getCollection?.('main', name);
    const f = getColl(coll)?.getField?.(dim);
    const target = f?.target || f?.options?.target;
    if (target) {
      const tcoll = getColl(target);
      const titleField = tcoll?.titleField || tcoll?.options?.titleField;
      if (titleField) return { fieldPath: [dim, titleField], dataKey: `${dim}.${titleField}` };   // group by name
      return { fieldPath: [`${dim}_id`], dataKey: `${dim}_id` };                                    // fallback: FK id
    }
  } catch { /* not resolvable → treat as scalar */ }
  return { fieldPath: [dim], dataKey: dim, format: w.dimension!.format };
}
// A dashboard chart = an **ECharts Pro** chart block (mode:'basic', the plugin renders via getProps →
// buildOption). Render-time: the theme + enum→label mapping apply from LIVE field metadata, so labels are
// always correct and any future ECharts-Pro fix reaches existing charts too — no baked `raw`. Shape
// (builder.type 'echartsPro.echartsPro' + the general config fields) verified against a real saved chart.
function chartBlock(ds: string, coll: string, w: DashboardWidget, id: string, dim: DimInfo) {
  const proType = w.chartType === 'pie' ? 'pie' : w.chartType === 'bar' ? 'column' : 'line';
  return {
    uid: id, use: 'ChartBlockModel',
    stepParams: { chartSettings: { configure: {
      query: { mode: 'builder', collectionPath: [ds, coll], measures: [{ field: [w.measure!.field], aggregation: w.measure!.aggregation }], dimensions: [{ field: dim.fieldPath, ...(dim.format ? { format: dim.format } : {}) }], orders: [], filter: { logic: '$and', items: [] } },
      chart: { option: { mode: 'basic', builder: {
        type: 'echartsPro.echartsPro',
        chartType: proType,
        xField: dim.dataKey,
        yField: w.measure!.field,
        yFields: [w.measure!.field],
        showLegend: true,
        showLabel: true,
        height: 340,
      } } },
    } } },
  };
}

// ── filter bar (wired to the charts via defaultTargetUid) ─────────────────────────────────────────
function fieldMeta(collection: any, name: string) {
  const f = collection?.getField?.(name);
  const title = f?.uiSchema?.title || f?.options?.uiSchema?.title || f?.title || name;
  return { name, title: String(title).replace(/\{\{\s*t\(["']([^"']+)["']\)\s*\}\}/, '$1'), interface: f?.interface || 'input', type: f?.type || 'string' };
}
/** filterPaths entry for a filter field. A scalar field files on its own name; an association (m2o/o2o/…)
 *  field must file on the TARGET collection's key field (normally `id`) — mirrors FilterFormGridModel.
 *  onModelCreated's own `${fieldPath}.${filterTargetKey}` construction, else the merged runtime filter
 *  fires against the relation column itself instead of its id. */
function filterPathFor(app: any, ds: string, fn: string, fieldObj: any): string {
  const isAssoc = typeof fieldObj?.isAssociationField === 'function' ? fieldObj.isAssociationField() : !!fieldObj?.target;
  const target = fieldObj?.target || fieldObj?.options?.target;
  if (!isAssoc || !target) return fn;
  const dsm = app?.dataSourceManager;
  const tcoll = dsm?.getDataSource?.(ds)?.getCollection?.(target) || dsm?.getCollection?.(ds, target);
  const targetKey = tcoll?.filterTargetKey || tcoll?.options?.filterTargetKey || 'id';
  return `${fn}.${Array.isArray(targetKey) ? (targetKey[0] || 'id') : (targetKey || 'id')}`;
}
// A FilterFormItemModel's own `defaultTargetUid` is NOT the live wiring — it's a one-time seed the native
// "Add filter field" UI consumes (FilterFormGridModel.onModelCreated) to auto-populate ONE entry in the
// page's FilterManager. The real, plural connection is a `filterManager:[{filterId,targetId,filterPaths}]`
// array stored on the shared BlockGridModel (read by BlockGridModel.onInit) — we build it ourselves because
// createModelAsync never runs the interactive onModelCreated hook. Returns {block, filterManagerEntries}.
function filterBlock(engine: any, app: any, ds: string, coll: string, fields: string[], collection: any, targetUids: string[], id: string, labels?: Record<string, string>) {
  const FilterItem: any = engine?.getModelClass?.('FilterFormItemModel');
  const firstTargetUid = targetUids[0];
  const items = fields.map((fn) => {
    const meta = fieldMeta(collection, fn);
    const label = (labels && labels[fn] && String(labels[fn]).trim()) || meta.title;   // manual display-name override wins
    const fieldObj = collection?.getField?.(fn);
    const iid = uid();
    // Every filter item MUST carry a `field` sub-model or it renders label-only with no value picker (the
    // block reads `item.subModels.field.context.collectionField`). Resolve the input model + its default
    // props the SAME way the native "add filter field" does — getDefaultBindingByField(ctx, field).
    let fieldUse: string | undefined;
    let fieldProps: any;
    try {
      const binding = FilterItem?.getDefaultBindingByField?.(engine?.context, fieldObj);
      if (binding?.modelName) {
        const isAssoc = typeof fieldObj?.isAssociationField === 'function' ? fieldObj.isAssociationField() : !!fieldObj?.target;
        fieldUse = isAssoc && engine?.getModelClass?.('FilterFormRecordSelectFieldModel') ? 'FilterFormRecordSelectFieldModel' : binding.modelName;
        fieldProps = typeof binding.defaultProps === 'function' ? binding.defaultProps(engine.context, fieldObj) : binding.defaultProps;
      }
    } catch (_) { /* fall through to the fallbacks */ }
    if (!fieldUse && DATEISH.has(meta.interface)) fieldUse = 'DateTimeTzFilterFieldModel';
    // Everything else (select / statusFlow / text / number …) → the base filter field model, which renders
    // a suitable input (a select with the enum options for status/choice fields) from the collectionField.
    if (!fieldUse) fieldUse = 'FilterFormFieldModel';
    const model: any = {
      uid: iid, use: 'FilterFormItemModel',
      stepParams: {
        fieldSettings: { init: { dataSourceKey: ds, collectionName: coll, fieldPath: fn } },
        // defaultTargetUid kept for parity (feeds FilterFormBlockModel's target-deleted cleanup) — NOT what makes the filter live.
        filterFormItemSettings: { init: { filterField: { name: fn, title: label, interface: meta.interface, type: meta.type }, ...(firstTargetUid ? { defaultTargetUid: firstTargetUid } : {}) } },
      },
    };
    if (fieldUse) model.subModels = { field: { use: fieldUse, ...(fieldProps ? { props: fieldProps } : {}) } };
    return { uid: iid, model, filterPath: filterPathFor(app, ds, fn, fieldObj) };
  });
  const layout = { version: 2, rows: [{ id: uid(), cells: items.map((it) => ({ id: uid(), items: [it.uid] })), sizes: items.map(() => Math.max(6, Math.floor(24 / Math.max(1, items.length)))) }] };
  const block = {
    uid: id, use: 'FilterFormBlockModel',
    subModels: { grid: { use: 'FilterFormGridModel', props: { layout }, stepParams: { gridSettings: { grid: { layout } } }, subModels: { items: items.map((it) => it.model) } } },
  };
  // One FilterManager fan-out entry per (filter field × target block) — THIS is what
  // FilterFormItemModel.doFilter() → filterManager.refreshTargetsByFilter(this.uid) actually reads.
  const filterManagerEntries = items.flatMap((it) => targetUids.map((targetId) => ({ filterId: it.uid, targetId, filterPaths: [it.filterPath] })));
  return { block, filterManagerEntries };
}

const evenSizes = (n: number) => Array.from({ length: n }, () => Math.floor(24 / Math.max(1, n)));

/** Build the whole dashboard page (route + RootPageModel + BlockGrid of widgets). Returns the schemaUid +
 *  the chart uid↔widget map, so the launcher can offer per-chart AI refine right after generating. */
export async function createDashboard(app: any, spec: DashboardSpec): Promise<{ pageSchemaUid: string; url: string; charts: Array<{ uid: string; title?: string; chartType?: string }> }> {
  const engine = app?.flowEngine;
  if (!engine) throw new Error('flowEngine unavailable');
  const ds = 'main';
  const coll = spec.collection;
  const collection = app?.dataSourceManager?.getDataSource?.(ds)?.getCollection?.(coll) || app?.dataSourceManager?.getCollection?.(ds, coll);

  const scores = spec.widgets.filter((w) => w.kind === 'score' && w.measure);
  const charts = spec.widgets.filter((w) => w.kind === 'chart' && w.measure && w.dimension);
  const filters = spec.widgets.filter((w) => w.kind === 'filter' && (w.fields || []).length);

  const chartBlocks = charts.map((w) => chartBlock(ds, coll, w, uid(), resolveDimension(app, coll, w)));
  const chartUids = chartBlocks.map((b) => b.uid);
  const scoreBlocks = scores.map((w, i) => scoreBlock(ds, coll, w, i, uid()));
  const scoreUids = scoreBlocks.map((b) => b.uid);
  // The filter fans out to every chart AND every KPI card so the whole dashboard reacts to it.
  const filterResults = filters.map((w) => filterBlock(engine, app, ds, coll, w.fields || [], collection, [...chartUids, ...scoreUids], uid(), w.filterLabels));
  const filterBlocks = filterResults.map((r) => r.block);
  const filterManagerEntries = filterResults.flatMap((r) => r.filterManagerEntries);

  const rows: any[] = [];
  filterBlocks.forEach((fb) => rows.push({ id: uid(), cells: [{ id: uid(), items: [fb.uid] }], sizes: [24] }));
  // score cards: 2 per row (or fewer)
  for (let i = 0; i < scoreBlocks.length; i += 2) { const g = scoreBlocks.slice(i, i + 2); rows.push({ id: uid(), cells: g.map((b) => ({ id: uid(), items: [b.uid] })), sizes: evenSizes(g.length) }); }
  // charts: 2 per row
  for (let i = 0; i < chartBlocks.length; i += 2) { const g = chartBlocks.slice(i, i + 2); rows.push({ id: uid(), cells: g.map((b) => ({ id: uid(), items: [b.uid] })), sizes: evenSizes(g.length) }); }
  const layout = { version: 2, rows };
  const items = [...filterBlocks, ...scoreBlocks, ...chartBlocks];

  const pageSchemaUid = uid(), menuSchemaUid = uid(), tabSchemaUid = uid(), tabSchemaName = uid();
  const routeValues: any = { type: 'flowPage', title: spec.title, icon: spec.icon || 'lucide-layout-dashboard', ...(spec.parentId ? { parentId: spec.parentId } : {}), schemaUid: pageSchemaUid, menuSchemaUid, enableTabs: false, children: [{ type: 'tabs', schemaUid: tabSchemaUid, tabSchemaName, hidden: true }] };
  const routeRepo = app?.context?.routeRepository;
  if (routeRepo?.createRoute) await routeRepo.createRoute(routeValues);
  else { await app.apiClient.resource('desktopRoutes').create({ values: routeValues }); await routeRepo?.refreshAccessible?.(); }

  const pageModel = await engine.createModelAsync({
    parentId: pageSchemaUid, subKey: 'page', subType: 'object', use: 'RootPageModel',
    subModels: { tabs: [{ uid: tabSchemaUid, use: 'RootPageTabModel', props: { route: { type: 'tabs', schemaUid: tabSchemaUid, tabSchemaName, hidden: true } }, subModels: { grid: { use: 'BlockGridModel', props: { layout }, stepParams: { gridSettings: { grid: { layout } } }, filterManager: filterManagerEntries, subModels: { items } } } }] },
  });
  await pageModel.save();
  // Return BOTH ECharts charts and HTML KPI cards so the launcher's "Edit a chart with AI" list can refine
  // either (aiRefineChart branches on the block's `use`). Score cards carry chartType:'html'.
  const chartsOut = [
    ...charts.map((w, i) => ({ uid: chartBlocks[i].uid, title: w.title, chartType: w.chartType })),
    ...scores.map((w, i) => ({ uid: scoreBlocks[i].uid, title: w.label, chartType: 'html' })),
  ];
  return { pageSchemaUid, url: `${clientPrefix()}/admin/${pageSchemaUid}`, charts: chartsOut };
}

/** Add ONE widget (chart/score/filter) to an EXISTING dashboard: build the block with the SAME builders,
 *  createModelAsync-append it under the page's grid, then patch the grid's layout (+ filterManager for a
 *  filter) server-side. `info` comes from the `aiAddWidget` server action (grid uid, collection, targets). */
export async function addWidgetToDashboard(app: any, info: { widget: DashboardWidget; gridUid: string; collection: string; chartUids?: string[]; scoreUids?: string[]; nextSort?: number }): Promise<{ ok: boolean; widgetUid?: string; error?: string }> {
  const engine = app?.flowEngine;
  if (!engine) return { ok: false, error: 'flowEngine unavailable' };
  const { widget: w, gridUid, collection: coll, chartUids = [], scoreUids = [], nextSort = 0 } = info;
  const ds = 'main';
  const collection = app?.dataSourceManager?.getDataSource?.(ds)?.getCollection?.(coll) || app?.dataSourceManager?.getCollection?.(ds, coll);
  const id = uid();
  let block: any; let filterManagerEntries: any[] = [];
  try {
    if (w.kind === 'chart' && w.measure && w.dimension) block = chartBlock(ds, coll, w, id, resolveDimension(app, coll, w));
    else if (w.kind === 'score' && w.measure) block = scoreBlock(ds, coll, w, scoreUids.length, id);
    else if (w.kind === 'filter' && (w.fields || []).length) { const r = filterBlock(engine, app, ds, coll, w.fields || [], collection, [...chartUids, ...scoreUids], id, w.filterLabels); block = r.block; filterManagerEntries = r.filterManagerEntries; }
    else return { ok: false, error: 'Widget không hợp lệ' };
  } catch (e: any) { return { ok: false, error: 'Dựng widget lỗi: ' + (e?.message || e) }; }
  const layoutRow = { id: uid(), cells: [{ id: uid(), items: [id] }], sizes: [24] };
  try {
    const wm = await engine.createModelAsync({ parentId: gridUid, subKey: 'items', subType: 'array', sortIndex: nextSort, ...block });
    await wm.save();
  } catch (e: any) { return { ok: false, error: 'Chèn widget vào grid lỗi: ' + (e?.message || e) }; }
  try {
    await app.apiClient.request({ url: 'appBuilder:patchGrid', method: 'post', data: { gridUid, layoutRow, filterManagerEntries } }).then((r: any) => r?.data?.data ?? r?.data);
  } catch (e: any) { return { ok: false, error: 'Cập nhật layout grid lỗi: ' + (e?.message || e) }; }
  return { ok: true, widgetUid: id };
}
