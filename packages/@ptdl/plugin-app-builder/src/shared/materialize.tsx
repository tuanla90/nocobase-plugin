/**
 * App Builder — CLIENT page tier. After the server creates the collections (appBuilder:apply), this
 * reloads the client dataSource, creates the menu groups, and builds one `/v/` page per PageSpec by
 * reusing instant-create-page's createQuickPage. Runs on the modern client (needs app.flowEngine +
 * app.context.routeRepository + app.dataSourceManager).
 */
import { AppSpec, ColumnSpec } from './appSpec';
import { clientPrefix, createAddFormTemplate, createQuickPage, QuickColumn, TemplateRef } from './quickView';
import { createDashboard } from './dashboard';

// The widget can be declared on the FieldSpec (field-level) OR overridden per page column. A page column
// that's a bare string inherits the field's widget; a ColumnSpec's own widget wins. `widgetOf` maps a
// field name → its FieldSpec.widget for the page's collection.
const toQuickColumns = (
  cols: Array<string | ColumnSpec>,
  widgetOf: (name: string) => string | undefined,
  quickCreateOf: (name: string) => boolean = () => false,
): QuickColumn[] =>
  (cols || []).map((c) => {
    const name = typeof c === 'string' ? c : c.name;
    const base = typeof c === 'string' ? { name, component: widgetOf(name) } : { name, title: c.title, component: c.widget || widgetOf(name) };
    return quickCreateOf(name) ? { ...base, quickCreate: true } : base;
  });

/** Reload the client dataSource so collections created server-side become visible to flowEngine. */
async function reloadDataSource(app: any): Promise<void> {
  const dsm = app?.dataSourceManager;
  const ds = dsm?.getDataSource?.('main');
  for (const fn of ['reload', 'refresh']) {
    try { if (typeof ds?.[fn] === 'function') { await ds[fn](); return; } } catch { /* try next */ }
  }
  for (const fn of ['reload', 'refresh']) {
    try { if (typeof dsm?.[fn] === 'function') { await dsm[fn](); return; } } catch { /* try next */ }
  }
}

/** Wait until a collection is visible on the client (dataSource reload can lag a beat). */
async function waitForCollection(app: any, name: string, tries = 10): Promise<boolean> {
  const dsm = app?.dataSourceManager;
  for (let i = 0; i < tries; i++) {
    const c = dsm?.getDataSource?.('main')?.getCollection?.(name) || dsm?.getCollection?.('main', name);
    if (c) return true;
    await new Promise((r) => setTimeout(r, 300));
    if (i % 3 === 2) await reloadDataSource(app);
  }
  return false;
}

/** Create a menu group route; returns its id (used as a page's / sub-group's parentId). `parentId` nests
 *  this group under another route (so a whole app can live under ONE top-menu entry, its sections in the
 *  left sidebar — avoids top-menu overflow). `options` is written to the route's `options` JSON — e.g.
 *  `{ptdlMenuKind:'divider'}` turns a CHILDLESS group into a @ptdl/plugin-menu-enhancements section label.
 *  (Never mark a group that has child routes — the divider render strips its children.) Exposed as a tool. */
export async function createMenuGroup(app: any, label: string, icon?: string, parentId?: number | null, options?: any): Promise<number | null> {
  const routeRepo = app?.context?.routeRepository;
  const values: any = { type: 'group', title: label, icon: icon || undefined, ...(parentId ? { parentId } : {}), ...(options ? { options } : {}) };
  try {
    if (routeRepo?.createRoute) {
      const r = await routeRepo.createRoute(values);
      return r?.id ?? r?.data?.id ?? r?.data?.data?.id ?? null;
    }
  } catch { /* fall through to REST */ }
  try {
    const r = await app.apiClient.resource('desktopRoutes').create({ values });
    await routeRepo?.refreshAccessible?.();
    return r?.data?.data?.id ?? null;
  } catch { /* give up — page goes top-level */ }
  return null;
}

/** Create ONE page from a PageSpec (+ optional CollectionSpec for field-level widget threading). A
 *  standalone tool AND the per-page step of materializeApp. `p.parentId` places it under a menu group. */
export async function createPage(app: any, p: any, cspec?: any, quickCreateTemplates?: Record<string, TemplateRef>): Promise<{ title: string; collection: string; schemaUid: string; url: string }> {
  await waitForCollection(app, p.collection);
  const wmap = new Map<string, string | undefined>();
  (cspec?.fields || []).forEach((f: any) => { if (f.widget) wmap.set(f.name, f.widget); });
  (cspec?.relations || []).forEach((r: any) => { if (r.widget) wmap.set(r.name, r.widget); });
  const widgetOf = (name: string) => wmap.get(name);
  // relations flagged quickCreate → the form field gets an inline "Add new <target>" button (reusing the
  // target's Add form via a block-template reference). See createQuickPage.
  const qcSet = new Set((cspec?.relations || []).filter((r: any) => r.quickCreate).map((r: any) => r.name));
  const quickCreateOf = (name: string) => qcSet.has(name);
  // o2m relation name → AI-designed sub-table column order.
  const subMap = new Map<string, string[]>();
  (cspec?.relations || []).forEach((r: any) => { if (Array.isArray(r.subColumns) && r.subColumns.length) subMap.set(r.name, r.subColumns); });
  const subColumnsOf = (name: string) => subMap.get(name);
  const { pageSchemaUid } = await createQuickPage(app, {
    collectionName: p.collection,
    columns: toQuickColumns(p.columns, widgetOf, quickCreateOf),
    popupColumns: p.popupColumns ? toQuickColumns(p.popupColumns, widgetOf, quickCreateOf) : undefined,
    subColumnsOf,
    title: p.title,
    icon: p.icon,
    parentId: p.parentId ?? null,
    blockUse: p.block,
    quickCreateTemplates,
  });
  return { title: p.title, collection: p.collection, schemaUid: pageSchemaUid, url: `${clientPrefix()}/admin/${pageSchemaUid}` };
}

/** Build + register one reusable Add-form block template per quick-create TARGET collection, so the
 *  quick-create popup on any form referencing that target reuses ONE Add form (single source of truth).
 *  Best-effort: a failed template just means that field falls back to a plain (empty) quick-create popup. */
async function ensureQuickCreateTemplates(app: any, spec: AppSpec): Promise<Record<string, TemplateRef>> {
  const out: Record<string, TemplateRef> = {};
  const targets = new Set<string>();
  for (const c of spec.collections || []) for (const r of c.relations || []) if (r.quickCreate && (r.type === 'm2o' || r.type === 'o2o')) targets.add(r.target);
  for (const target of targets) {
    const page = (spec.pages || []).find((p) => p.collection === target);
    const cspec = (spec.collections || []).find((c) => c.name === target);
    const cols = (page?.popupColumns || page?.columns || (cspec?.fields || []).map((f) => f.name)) as Array<string | ColumnSpec>;
    const wmap = new Map<string, string | undefined>();
    (cspec?.fields || []).forEach((f: any) => { if (f.widget) wmap.set(f.name, f.widget); });
    await waitForCollection(app, target);
    const tpl = await createAddFormTemplate(app, { collectionName: target, columns: toQuickColumns(cols, (n) => wmap.get(n)), title: cspec?.title || target });
    if (tpl) out[target] = tpl;
  }
  return out;
}

// The top menu label = meta.title (the app's Vietnamese DISPLAY name) → else meta.name. If the AI still
// slips and emits a machine name (e.g. "quan_ly_ban_hang"), don't show that verbatim as
// the top menu group. Defence in depth: detect a machine-ish string (has '_', or is all-lowercase with no
// space — the AI's own machine-name pattern is `^[a-z][a-z0-9_]*`) and titleize it for display only.
function looksMachineName(s: string): boolean {
  return /_/.test(s) || (s === s.toLowerCase() && !/\s/.test(s));
}
function titleizeMachineName(s: string): string {
  return s
    .replace(/_/g, ' ')
    .trim()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

export interface MaterializeResult {
  pages: Array<{ title: string; collection: string; schemaUid: string; url: string }>;
  groups: Array<{ label: string; id: number | null }>;
}

/** Client page tier: menu groups + one page per PageSpec. Assumes collections already exist server-side.
 *  `onProgress(label, phase)` fires per page/dashboard so the caller can show live progress. */
export async function materializeApp(app: any, spec: AppSpec, onProgress?: (label: string, phase?: 'page' | 'dashboard') => void): Promise<MaterializeResult> {
  await reloadDataSource(app);

  // Reusable Add-form templates for quick-create targets — built BEFORE pages so each page's quick-create
  // fields can reference them.
  const quickCreateTemplates = await ensureQuickCreateTemplates(app, spec);

  // Navigation (User: "group sidebar cho all… apply thư viện quản lý sidebar… hạn chế phân trang menu chính"):
  // ONE top-level group = the single top-menu entry (no header overflow). Under it, a FLAT left-sidebar list
  // where each spec group becomes a @ptdl/plugin-menu-enhancements "divider" section LABEL (a childless group
  // carrying options.ptdlMenuKind) followed by its pages. Created in visual order so they sort correctly.
  const rawAppLabel = spec.meta?.title?.trim() || spec.meta?.name?.trim() || 'Ứng dụng';
  const appLabel = looksMachineName(rawAppLabel) ? titleizeMachineName(rawAppLabel) : rawAppLabel;
  // PATCH / merge: reuse existing routes so re-applying a spec (or adding pages to an app that already has
  // this top group / sections / pages) never creates DUPLICATES. Fetch once; groups are reused by
  // title+parent, pages skipped by title.
  let existingRoutes: any[] = [];
  try { existingRoutes = (await app.apiClient.request({ url: 'desktopRoutes:list', params: { paginate: false } }))?.data?.data || []; } catch {}
  const norm = (v: any) => v ?? null;
  const findGroupId = (title: string, parentId?: number | null): number | null => {
    const hit = existingRoutes.find((r: any) => r.type === 'group' && String(r.title || '').trim() === String(title).trim() && norm(r.parentId) === norm(parentId));
    return hit ? (hit.id ?? null) : null;
  };
  const pageExists = (title: string) => existingRoutes.some((r: any) => r.type === 'flowPage' && String(r.title || '').trim() === String(title).trim());
  const ensureGroup = async (label: string, icon?: string, parentId?: number | null, options?: any): Promise<number | null> =>
    findGroupId(label, parentId) ?? (await createMenuGroup(app, label, icon, parentId, options));
  const topId = await ensureGroup(appLabel, spec.menu?.icon || 'lucide-layout-dashboard');
  // Section style depends on @ptdl/plugin-menu-enhancements: if enabled, each spec group renders as a
  // NON-CLICKABLE "divider" LABEL (a childless group carrying options.ptdlMenuKind) with its pages flat
  // beside it. Without the plugin those markers would render as broken empty menu items, so FALL BACK to
  // native NESTED groups (a real group with its pages nested → collapsible sidebar sub-menu). Either way:
  // one top-level entry, everything grouped in the left sidebar.
  const hasMenuEnh = (() => { try { return !!app?.pm?.get?.('@ptdl/plugin-menu-enhancements'); } catch { return false; } })();
  const DIVIDER = { ptdlMenuKind: 'divider', ptdlMenuStyle: { lineOn: false, align: 'left' } };
  const cspecOf = (coll: string) => (spec.collections || []).find((c) => c.name === coll);
  const groups: MaterializeResult['groups'] = [{ label: appLabel, id: topId }];
  const pages: MaterializeResult['pages'] = [];
  const mkPage = async (p: any, parentId: number | null) => {
    if (pageExists(p.title)) return; // patch/merge: this page already exists — don't duplicate it
    onProgress?.(`Trang ${p.title}`, 'page');
    pages.push(await createPage(app, { ...p, parentId }, cspecOf(p.collection), quickCreateTemplates));
  };

  // Tolerate two menu shapes the AI naturally emits: a group as {label|title, icon, pages?:[pageTitle]}
  // AND a page's own `menuGroup`. Resolve each page's section from either source.
  const specGroups = (spec.menu?.groups || []) as any[];
  const glabel = (g: any) => g?.label || g?.title;
  const groupOfPage = new Map<string, string>();
  specGroups.forEach((g) => (g.pages || []).forEach((pt: string) => { const l = glabel(g); if (l) groupOfPage.set(pt, l); }));
  const menuOf = (p: any) => p.menuGroup || groupOfPage.get(p.title);

  // section labels in spec order (menu.groups first, then any referenced only by pages)
  const labels: string[] = [];
  specGroups.forEach((g) => { const l = glabel(g); if (l && !labels.includes(l)) labels.push(l); });
  (spec.pages || []).forEach((p) => { const l = menuOf(p); if (l && !labels.includes(l)) labels.push(l); });

  for (const p of (spec.pages || []).filter((p) => !menuOf(p))) await mkPage(p, topId); // ungrouped → under the app
  for (const label of labels) {
    const icon = specGroups.find((g) => glabel(g) === label)?.icon;
    const groupId = await ensureGroup(label, icon, topId, hasMenuEnh ? DIVIDER : undefined);
    groups.push({ label, id: groupId });
    // divider label → pages sit flat beside it (under the app); native group → pages nest inside it.
    const pageParent = hasMenuEnh ? topId : groupId;
    for (const p of (spec.pages || []).filter((p) => menuOf(p) === label)) await mkPage(p, pageParent);
  }

  // Dashboards (from AppSheet chart views / AI) → one analytics page each, placed in its menu group.
  // createDashboard builds its own route + BlockGrid of ECharts/KPI widgets; a bad one is skipped, not fatal.
  for (const d of (spec.dashboards || []) as any[]) {
    if (pageExists(d.title)) continue;
    const label = d.menuGroup && labels.includes(d.menuGroup) ? d.menuGroup : null;
    const parentId = label ? (hasMenuEnh ? topId : (groups.find((g) => g.label === label)?.id ?? topId)) : topId;
    onProgress?.(`Dashboard ${d.title}`, 'dashboard');
    try {
      const built = await createDashboard(app, { ...d, parentId });
      pages.push({ title: d.title, collection: d.collection, schemaUid: built.pageSchemaUid, url: built.url });
    } catch (e) { /* skip a bad dashboard, keep building the rest */ }
  }
  return { pages, groups };
}

export type BuildProgress = { phase: 'collection' | 'relation' | 'computed' | 'page' | 'dashboard' | 'done'; label: string; done: number; total: number };

/** Full build, STEPPED with live progress. Drives the granular server ops (createCollection → addRelation →
 *  addComputedBatch) ONE ITEM AT A TIME instead of a single monolithic `appBuilder:apply` — a big spec (16
 *  collections + 104 computed) blows the request timeout, and apply's catch rolls back EVERYTHING. Here each
 *  item is its own small request; a per-item failure is collected, not fatal. Then the client page tier. */
export async function buildApp(app: any, spec: AppSpec, onProgress?: (p: BuildProgress) => void): Promise<{ data: any } & MaterializeResult> {
  const api = (action: string, values: any) => app.apiClient.request({ url: `appBuilder:${action}`, method: 'post', data: values }).then((r: any) => r?.data?.data ?? r?.data);
  const RELATION_ORDER: Record<string, number> = { m2o: 0, o2o: 0, m2m: 1, o2m: 2 };
  const colls = spec.collections || [];
  const rels: Array<{ coll: string; r: any }> = [];
  colls.forEach((c) => (c.relations || []).forEach((r) => rels.push({ coll: c.name, r })));
  rels.sort((a, b) => (RELATION_ORDER[a.r.type] ?? 9) - (RELATION_ORDER[b.r.type] ?? 9));
  const computedColls = colls.filter((c) => (c.fields || []).some((f) => (f as any).computed?.expression));
  const total = colls.length + rels.length + computedColls.length + (spec.pages || []).length + (spec.dashboards || []).length;
  let done = 0;
  const errors: string[] = [];

  // menuGroup category per collection (first page's group) — mirrors the server apply's bucketing.
  const menuGroupByColl = new Map<string, string>();
  for (const p of spec.pages || []) if (p.collection && p.menuGroup && !menuGroupByColl.has(p.collection)) menuGroupByColl.set(p.collection, p.menuGroup);

  for (const c of colls) {
    onProgress?.({ phase: 'collection', label: c.title || c.name, done: done++, total });
    try { await api('createCollection', { ...c, category: menuGroupByColl.get(c.name) || spec.meta?.title || spec.meta?.name }); }
    catch (e: any) { errors.push(`Bảng ${c.name}: ${e?.message || e}`); }
  }
  for (const { coll, r } of rels) {
    onProgress?.({ phase: 'relation', label: `${coll} → ${r.target}`, done: done++, total });
    try { await api('addRelation', { collection: coll, relation: r }); }
    catch (e: any) { errors.push(`Quan hệ ${coll}.${r.name}: ${e?.message || e}`); }
  }
  for (const c of computedColls) {
    const cf = (c.fields || []).filter((f) => (f as any).computed?.expression);
    onProgress?.({ phase: 'computed', label: `${c.title || c.name} · ${cf.length} công thức`, done: done++, total });
    try { await api('addComputedBatch', { collection: c.name, fields: cf }); }
    catch (e: any) { errors.push(`Công thức ${c.name}: ${e?.message || e}`); }
  }
  // client page tier (pages + dashboards) — continues the same progress counter
  const mat = await materializeApp(app, spec, (label, phase) => onProgress?.({ phase: (phase as any) || 'page', label, done: done++, total }));
  onProgress?.({ phase: 'done', label: 'Hoàn tất', done: total, total });
  return { data: { ok: errors.length === 0, errors, collections: colls.map((c) => c.name) }, ...mat };
}

/** Topological collection order (parents before children by m2o) so relation keymaps resolve on import. */
function topoOrder(spec: AppSpec): string[] {
  const names = (spec.collections || []).map((c) => c.name);
  const has = new Set(names);
  const deps = new Map<string, Set<string>>(names.map((n) => [n, new Set<string>()]));
  for (const c of spec.collections || []) for (const r of c.relations || []) if (r.type === 'm2o' && r.target !== c.name && has.has(r.target)) deps.get(c.name)!.add(r.target);
  const out: string[] = [], seen = new Set<string>();
  const visit = (n: string, stack = new Set<string>()) => { if (seen.has(n) || stack.has(n)) return; stack.add(n); for (const d of deps.get(n) || []) visit(d, stack); seen.add(n); out.push(n); };
  names.forEach((n) => visit(n));
  return out;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Import each collection's rows from its AppSheet Google Sheet (server `importSheet` action, chunked +
 *  dedup-by-key so it's safe to resume). Topological order so m2o keymaps resolve. `onProgress` fires per
 *  chunk. Resilient to a TRANSIENT server hiccup (a sibling session restarting nb-local mid-import, a dropped
 *  connection, …): each chunk retries a few times with backoff, and any collection still incomplete after
 *  the first full sweep gets up to 2 more sweeps — so a blip that resolves itself doesn't need a manual
 *  re-click. Only a collection that's STILL failing after all of that is reported as an error.
 *
 *  PERFORMANCE: computed rules are disabled for the DURATION of the import, then re-enabled + backfilled
 *  ONCE at the end (`ptdlComputed` recomputeAll, topo order). Without this, every row insert into a table
 *  that feeds a roll-up on another collection (common — e.g. line items summed onto their parent) triggers
 *  a recompute cascade whose cost grows with table size; on a real app this measured ~25ms/row with rules
 *  off vs 7-9 SECONDS/row once a table had a couple hundred rows with rules on (a ~300x difference) — import
 *  would appear to hang. Computing once at the end is also strictly more correct (no wasted recomputes on
 *  partially-imported data mid-way through). */
export async function importData(app: any, spec: AppSpec, sourcePlan: Array<{ collection: string; docId: string | null; tab: string }>, onProgress?: (p: { done: number; total: number; label: string }) => void): Promise<{ rows: number; linked: number; results: any[]; retried: string[] }> {
  const api = (action: string, values: any) => app.apiClient.request({ url: `appBuilder:${action}`, method: 'post', data: values }).then((r: any) => r?.data?.data ?? r?.data);
  const collByName = new Map((spec.collections || []).map((c) => [c.name, c]));
  const planByColl = new Map(sourcePlan.map((s) => [s.collection, s]));
  const keyFieldOf = (c: any) => (c?.fields?.find((f: any) => f.unique) || {}).name || c?.titleField || null;
  const order = topoOrder(spec).filter((n) => planByColl.get(n)?.docId);
  const total = order.length;
  const results: any[] = []; let rows = 0, linked = 0;
  const CHUNK = 50;         // rows per request — bounded so a big table can't blow the request timeout
  const CHUNK_RETRIES = 3;  // per-chunk retry on a transient failure (network blip, server mid-restart)

  // Import one collection fully (paginating offset→total). Returns whether it actually finished.
  const importOne = async (cn: string, doneIdx: number): Promise<boolean> => {
    const plan = planByColl.get(cn)!; const c: any = collByName.get(cn);
    const fields = (c.fields || []).filter((f: any) => !f.computed).map((f: any) => ({ name: f.name, title: f.title, interface: f.interface }));
    const relations = (c.relations || []).filter((r: any) => r.type === 'm2o').map((r: any) => ({ name: r.name, title: r.title, target: r.target, targetKeyField: keyFieldOf(collByName.get(r.target)) }));
    const keyField = keyFieldOf(c);
    let offset = 0, ctotal = 0;
    for (let guard = 0; guard < 1000; guard++) {
      let res: any = null, lastErr: any = null;
      for (let attempt = 0; attempt < CHUNK_RETRIES; attempt++) {
        try { res = await api('importSheet', { collection: cn, docId: plan.docId, tab: plan.tab, fields, relations, keyField, offset, limit: CHUNK }); lastErr = null; break; }
        catch (e: any) { lastErr = e; await sleep(1500 * (attempt + 1)); }
      }
      if (lastErr) { results.push({ collection: cn, error: String(lastErr?.message || lastErr) }); return false; }
      if (res?.error) { results.push(res); return false; }
      results.push(res);
      ctotal = res?.total ?? 0; rows += res?.posted ?? 0; linked += res?.linked ?? 0;
      offset += res?.nrows ?? 0;
      onProgress?.({ done: doneIdx, total, label: `${c?.title || cn}: ${Math.min(offset, ctotal)}/${ctotal}` });
      if (res?.done || !res?.nrows) return true;
    }
    return false;
  };

  onProgress?.({ done: 0, total, label: 'Tạm tắt công thức (để import nhanh)…' });
  try { await api('setComputedEnabled', { enabled: false }); } catch { /* plugin-formula not installed — fine, imports just run at normal (formula-triggered) speed */ }

  let pending = order;
  const retried: string[] = [];
  try {
    for (let sweep = 0; sweep < 3 && pending.length; sweep++) {
      if (sweep > 0) { retried.push(...pending); await sleep(2000); }   // give a flaky server a moment before the retry sweep
      const stillFailing: string[] = [];
      for (let i = 0; i < pending.length; i++) {
        const ok = await importOne(pending[i], order.indexOf(pending[i]));
        if (!ok) stillFailing.push(pending[i]);
      }
      pending = stillFailing;
    }
  } finally {
    // ALWAYS re-enable + backfill, even if the import loop above threw — otherwise every computed field in
    // the app stays permanently off, which is a much worse state than a slow/partial import.
    onProgress?.({ done: total, total, label: 'Bật lại công thức + tính lại toàn bộ…' });
    try { await api('setComputedEnabled', { enabled: true }); await api('recomputeAll', {}); } catch { /* best-effort */ }
  }
  onProgress?.({ done: total, total, label: 'Xong' });
  return { rows, linked, results, retried };
}

/** Delete an app's artifacts: page routes + their flowModels, menu groups, and (via the server
 *  dropCollection tool) the collections. `artifacts` comes from a build/plan result — powers the
 *  launcher's "Delete the app I just built" + plan rollback. */
export async function deleteApp(
  app: any,
  artifacts: { collections?: string[]; pages?: Array<{ schemaUid: string }>; groups?: Array<{ id?: number | null; label?: string }> },
): Promise<{ pages: number; groups: number; collections: number }> {
  const routeRepo = app?.context?.routeRepository;
  const api = app.apiClient;
  const out = { pages: 0, groups: 0, collections: 0 };
  const pageUids = new Set((artifacts.pages || []).map((p) => p.schemaUid).filter(Boolean));
  const groupIds = new Set((artifacts.groups || []).map((g) => g.id).filter(Boolean) as number[]);
  const groupLabels = new Set((artifacts.groups || []).map((g) => g.label).filter(Boolean) as string[]);
  let routes: any[] = [];
  try { routes = (await api.request({ url: 'desktopRoutes:list', params: { paginate: false } }))?.data?.data || []; } catch {}
  for (const r of routes) {
    const isPage = pageUids.has(r.schemaUid);
    const isGroup = r.type === 'group' && (groupIds.has(r.id) || groupLabels.has(String(r.title || '').trim()));
    if (!isPage && !isGroup) continue;
    try { if (routeRepo?.deleteRoute) await routeRepo.deleteRoute(r.id); else await api.resource('desktopRoutes').destroy({ filterByTk: r.id }); } catch {}
    if (isPage) out.pages++; else out.groups++;
  }
  for (const uid of pageUids) { try { await app.flowEngine?.destroyModel?.(uid); } catch {} }
  for (const c of artifacts.collections || []) {
    try {
      const res = await api.request({ url: 'appBuilder:dropCollection', method: 'post', data: { collection: c } }).then((r: any) => r?.data?.data ?? r?.data);
      if (res?.dropped) out.collections++;
    } catch {}
  }
  try { await routeRepo?.refreshAccessible?.(); } catch {}
  try { await reloadDataSource(app); } catch {} // refresh the client collection cache so the UI reflects the drop
  return out;
}
