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
  fields?: string[];
}
export interface DashboardSpec { title: string; collection: string; menuGroup?: string; icon?: string; parentId?: number | null; widgets: DashboardWidget[]; }

const ACCENT = '#7C3AED';
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

// ── chart (core ECharts, custom raw option) ───────────────────────────────────────────────────────
function chartRaw(w: DashboardWidget): string {
  const dim = w.dimension!.field, mea = w.measure!.field;
  const axisText = "'#9ca3af'";
  // self-labelling title (block has no header) — mid-gray reads on both light & dark themes.
  const title = w.title ? `title:{text:'${esc(w.title)}',left:'left',top:4,textStyle:{fontSize:14,fontWeight:600,color:${axisText}}}, ` : '';
  if (w.chartType === 'pie') {
    return `var data = ctx.data.objects || []; return { ${title}textStyle:{fontFamily:'Inter'}, tooltip:{trigger:'item'}, legend:{top:${w.title ? 30 : 4},textStyle:{color:${axisText}}}, series:[{ type:'pie', radius:['42%','70%'], center:['50%','${w.title ? 60 : 54}%'], avoidLabelOverlap:true, itemStyle:{borderColor:'transparent',borderWidth:2}, label:{color:${axisText}}, data: data.map(function(x){ return { name:String(x.${dim}), value:x.${mea} }; }) }] };`;
  }
  if (w.chartType === 'bar') {
    return `var data = ctx.data.objects || []; return { ${title}textStyle:{fontFamily:'Inter'}, tooltip:{trigger:'axis'}, grid:{left:10,right:14,top:${w.title ? 48 : 20},bottom:10,containLabel:true}, xAxis:{type:'category', data:data.map(function(x){return x.${dim};}), axisLine:{show:false}, axisTick:{show:false}, axisLabel:{color:${axisText}}}, yAxis:{type:'value', splitLine:{lineStyle:{color:'rgba(148,163,184,0.15)'}}, axisLabel:{color:${axisText}}}, series:[{ type:'bar', barWidth:'55%', itemStyle:{color:'${ACCENT}', borderRadius:[6,6,0,0]}, data:data.map(function(x){return x.${mea};}) }] };`;
  }
  return `var data = ctx.data.objects || []; return { ${title}textStyle:{fontFamily:'Inter'}, tooltip:{trigger:'axis'}, grid:{left:10,right:14,top:${w.title ? 48 : 20},bottom:10,containLabel:true}, xAxis:{type:'category', boundaryGap:false, data:data.map(function(x){return x.${dim};}), axisLine:{show:false}, axisTick:{show:false}, axisLabel:{color:${axisText}}}, yAxis:{type:'value', splitLine:{lineStyle:{color:'rgba(148,163,184,0.15)'}}, axisLabel:{color:${axisText}}}, series:[{ type:'line', smooth:true, showSymbol:false, data:data.map(function(x){return x.${mea};}), lineStyle:{width:3,color:'${ACCENT}'}, itemStyle:{color:'${ACCENT}'}, areaStyle:{color:{type:'linear',x:0,y:0,x2:0,y2:1,colorStops:[{offset:0,color:'rgba(124,58,237,0.4)'},{offset:1,color:'rgba(124,58,237,0)'}]}} }] };`;
}
function chartBlock(ds: string, coll: string, w: DashboardWidget, id: string) {
  const raw = chartRaw(w);
  const builder: any = { type: 'echarts.' + (w.chartType || 'line'), xField: w.dimension!.field, yField: w.measure!.field, yFields: [w.measure!.field], size: { type: 'ratio' }, lightTheme: 'walden', darkTheme: 'defaultDark', showLegend: true, legend: true, tooltip: true };
  if (w.chartType === 'pie') Object.assign(builder, { colorField: w.dimension!.field, angleField: w.measure!.field, innerRadius: 42 });
  return {
    uid: id, use: 'ChartBlockModel', props: { chart: { optionRaw: raw } },
    stepParams: { chartSettings: { configure: {
      query: { mode: 'builder', collectionPath: [ds, coll], measures: [{ field: [w.measure!.field], aggregation: w.measure!.aggregation }], dimensions: [{ field: [w.dimension!.field], ...(w.dimension!.format ? { format: w.dimension!.format } : {}) }], orders: [], filter: { logic: '$and', items: [] } },
      chart: { option: { mode: 'custom', builder, raw } },
    } } },
  };
}

// ── filter bar (wired to the charts via defaultTargetUid) ─────────────────────────────────────────
function fieldMeta(collection: any, name: string) {
  const f = collection?.getField?.(name);
  const title = f?.uiSchema?.title || f?.options?.uiSchema?.title || f?.title || name;
  return { name, title: String(title).replace(/\{\{\s*t\(["']([^"']+)["']\)\s*\}\}/, '$1'), interface: f?.interface || 'input', type: f?.type || 'string' };
}
function filterBlock(ds: string, coll: string, fields: string[], collection: any, targetUid: string | undefined, id: string) {
  const items = fields.map((fn) => {
    const meta = fieldMeta(collection, fn);
    const iid = uid();
    const model: any = {
      uid: iid, use: 'FilterFormItemModel',
      stepParams: {
        fieldSettings: { init: { dataSourceKey: ds, collectionName: coll, fieldPath: fn } },
        filterFormItemSettings: { init: { filterField: { name: fn, title: meta.title, interface: meta.interface, type: meta.type }, ...(targetUid ? { defaultTargetUid: targetUid } : {}) } },
      },
    };
    if (DATEISH.has(meta.interface)) model.subModels = { field: { use: 'DateTimeTzFilterFieldModel' } };
    return { uid: iid, model };
  });
  const layout = { version: 2, rows: [{ id: uid(), cells: items.map((it) => ({ id: uid(), items: [it.uid] })), sizes: items.map(() => Math.max(6, Math.floor(24 / Math.max(1, items.length)))) }] };
  return {
    uid: id, use: 'FilterFormBlockModel',
    subModels: { grid: { use: 'FilterFormGridModel', props: { layout }, stepParams: { gridSettings: { grid: { layout } } }, subModels: { items: items.map((it) => it.model) } } },
  };
}

const evenSizes = (n: number) => Array.from({ length: n }, () => Math.floor(24 / Math.max(1, n)));

/** Build the whole dashboard page (route + RootPageModel + BlockGrid of widgets). Returns the schemaUid. */
export async function createDashboard(app: any, spec: DashboardSpec): Promise<{ pageSchemaUid: string; url: string }> {
  const engine = app?.flowEngine;
  if (!engine) throw new Error('flowEngine unavailable');
  const ds = 'main';
  const coll = spec.collection;
  const collection = app?.dataSourceManager?.getDataSource?.(ds)?.getCollection?.(coll) || app?.dataSourceManager?.getCollection?.(ds, coll);

  const scores = spec.widgets.filter((w) => w.kind === 'score' && w.measure);
  const charts = spec.widgets.filter((w) => w.kind === 'chart' && w.measure && w.dimension);
  const filters = spec.widgets.filter((w) => w.kind === 'filter' && (w.fields || []).length);

  const chartBlocks = charts.map((w) => chartBlock(ds, coll, w, uid()));
  const firstChartUid = chartBlocks[0]?.uid;
  const scoreBlocks = scores.map((w, i) => scoreBlock(ds, coll, w, i, uid()));
  const filterBlocks = filters.map((w) => filterBlock(ds, coll, w.fields || [], collection, firstChartUid, uid()));

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
    subModels: { tabs: [{ uid: tabSchemaUid, use: 'RootPageTabModel', props: { route: { type: 'tabs', schemaUid: tabSchemaUid, tabSchemaName, hidden: true } }, subModels: { grid: { use: 'BlockGridModel', props: { layout }, stepParams: { gridSettings: { grid: { layout } } }, subModels: { items } } } }] },
  });
  await pageModel.save();
  return { pageSchemaUid, url: `${clientPrefix()}/admin/${pageSchemaUid}` };
}
