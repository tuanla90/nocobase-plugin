/**
 * App Builder — CLIENT page tier. After the server creates the collections (appBuilder:apply), this
 * reloads the client dataSource, creates the menu groups, and builds one `/v/` page per PageSpec by
 * reusing instant-create-page's createQuickPage. Runs on the modern client (needs app.flowEngine +
 * app.context.routeRepository + app.dataSourceManager).
 */
import { AppSpec, ColumnSpec } from './appSpec';
import { clientPrefix, createAddFormTemplate, createQuickPage, QuickColumn, TemplateRef } from './quickView';

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
  const { pageSchemaUid } = await createQuickPage(app, {
    collectionName: p.collection,
    columns: toQuickColumns(p.columns, widgetOf, quickCreateOf),
    popupColumns: p.popupColumns ? toQuickColumns(p.popupColumns, widgetOf, quickCreateOf) : undefined,
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

export interface MaterializeResult {
  pages: Array<{ title: string; collection: string; schemaUid: string; url: string }>;
  groups: Array<{ label: string; id: number | null }>;
}

/** Client page tier: menu groups + one page per PageSpec. Assumes collections already exist server-side. */
export async function materializeApp(app: any, spec: AppSpec): Promise<MaterializeResult> {
  await reloadDataSource(app);

  // Reusable Add-form templates for quick-create targets — built BEFORE pages so each page's quick-create
  // fields can reference them.
  const quickCreateTemplates = await ensureQuickCreateTemplates(app, spec);

  // Navigation (User: "group sidebar cho all… apply thư viện quản lý sidebar… hạn chế phân trang menu chính"):
  // ONE top-level group = the single top-menu entry (no header overflow). Under it, a FLAT left-sidebar list
  // where each spec group becomes a @ptdl/plugin-menu-enhancements "divider" section LABEL (a childless group
  // carrying options.ptdlMenuKind) followed by its pages. Created in visual order so they sort correctly.
  const appLabel = spec.meta?.name?.trim() || 'Ứng dụng';
  const topId = await createMenuGroup(app, appLabel, spec.menu?.icon || 'lucide-layout-dashboard');
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
  const mkPage = async (p: any, parentId: number | null) => { pages.push(await createPage(app, { ...p, parentId }, cspecOf(p.collection), quickCreateTemplates)); };

  // section labels in spec order (menu.groups first, then any referenced only by pages)
  const labels: string[] = [];
  (spec.menu?.groups || []).forEach((g) => { if (!labels.includes(g.label)) labels.push(g.label); });
  (spec.pages || []).forEach((p) => { if (p.menuGroup && !labels.includes(p.menuGroup)) labels.push(p.menuGroup); });

  for (const p of (spec.pages || []).filter((p) => !p.menuGroup)) await mkPage(p, topId); // ungrouped → under the app
  for (const label of labels) {
    const icon = (spec.menu?.groups || []).find((g) => g.label === label)?.icon;
    const groupId = await createMenuGroup(app, label, icon, topId, hasMenuEnh ? DIVIDER : undefined);
    groups.push({ label, id: groupId });
    // divider label → pages sit flat beside it (under the app); native group → pages nest inside it.
    const pageParent = hasMenuEnh ? topId : groupId;
    for (const p of (spec.pages || []).filter((p) => p.menuGroup === label)) await mkPage(p, pageParent);
  }
  return { pages, groups };
}

/** Full build: server DATA tier (collections + relations + seed) then client PAGE tier. */
export async function buildApp(app: any, spec: AppSpec): Promise<{ data: any } & MaterializeResult> {
  const res = await app.apiClient.request({ url: 'appBuilder:apply', method: 'post', data: { spec } });
  const data = res?.data?.data ?? res?.data;
  if (data && data.ok === false) {
    throw new Error('appBuilder:apply thất bại: ' + JSON.stringify(data.errors || data.error || data));
  }
  const mat = await materializeApp(app, spec);
  return { data, ...mat };
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
