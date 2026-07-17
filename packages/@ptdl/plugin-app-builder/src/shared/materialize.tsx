/**
 * App Builder — CLIENT page tier. After the server creates the collections (appBuilder:apply), this
 * reloads the client dataSource, creates the menu groups, and builds one `/v/` page per PageSpec by
 * reusing instant-create-page's createQuickPage. Runs on the modern client (needs app.flowEngine +
 * app.context.routeRepository + app.dataSourceManager).
 */
import { AppSpec, ColumnSpec } from './appSpec';
import { clientPrefix, createQuickPage, QuickColumn } from './quickView';

// The widget can be declared on the FieldSpec (field-level) OR overridden per page column. A page column
// that's a bare string inherits the field's widget; a ColumnSpec's own widget wins. `widgetOf` maps a
// field name → its FieldSpec.widget for the page's collection.
const toQuickColumns = (cols: Array<string | ColumnSpec>, widgetOf: (name: string) => string | undefined): QuickColumn[] =>
  (cols || []).map((c) =>
    typeof c === 'string'
      ? { name: c, component: widgetOf(c) }
      : { name: c.name, title: c.title, component: c.widget || widgetOf(c.name) },
  );

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

/** Create a menu group route; returns its id (used as a page's parentId). Exposed as a tool. */
export async function createMenuGroup(app: any, label: string, icon?: string): Promise<number | null> {
  const routeRepo = app?.context?.routeRepository;
  const values: any = { type: 'group', title: label, icon: icon || undefined };
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
export async function createPage(app: any, p: any, cspec?: any): Promise<{ title: string; collection: string; schemaUid: string; url: string }> {
  await waitForCollection(app, p.collection);
  const wmap = new Map<string, string | undefined>();
  (cspec?.fields || []).forEach((f: any) => { if (f.widget) wmap.set(f.name, f.widget); });
  (cspec?.relations || []).forEach((r: any) => { if (r.widget) wmap.set(r.name, r.widget); });
  const widgetOf = (name: string) => wmap.get(name);
  const { pageSchemaUid } = await createQuickPage(app, {
    collectionName: p.collection,
    columns: toQuickColumns(p.columns, widgetOf),
    popupColumns: p.popupColumns ? toQuickColumns(p.popupColumns, widgetOf) : undefined,
    title: p.title,
    icon: p.icon,
    parentId: p.parentId ?? null,
    blockUse: p.block,
  });
  return { title: p.title, collection: p.collection, schemaUid: pageSchemaUid, url: `${clientPrefix()}/admin/${pageSchemaUid}` };
}

export interface MaterializeResult {
  pages: Array<{ title: string; collection: string; schemaUid: string; url: string }>;
  groups: Array<{ label: string; id: number | null }>;
}

/** Client page tier: menu groups + one page per PageSpec. Assumes collections already exist server-side. */
export async function materializeApp(app: any, spec: AppSpec): Promise<MaterializeResult> {
  await reloadDataSource(app);

  // groups: those declared in menu.groups, plus any menuGroup referenced by a page but not declared.
  const wanted = new Map<string, string | undefined>();
  (spec.menu?.groups || []).forEach((g) => wanted.set(g.label, g.icon));
  (spec.pages || []).forEach((p) => { if (p.menuGroup && !wanted.has(p.menuGroup)) wanted.set(p.menuGroup, undefined); });

  const groupIdByLabel = new Map<string, number | null>();
  const groups: MaterializeResult['groups'] = [];
  for (const [label, icon] of wanted) {
    const id = await createMenuGroup(app, label, icon);
    groupIdByLabel.set(label, id);
    groups.push({ label, id });
  }

  const pages: MaterializeResult['pages'] = [];
  for (const p of spec.pages || []) {
    const parentId = p.menuGroup ? groupIdByLabel.get(p.menuGroup) ?? null : null;
    const cspec = (spec.collections || []).find((c) => c.name === p.collection);
    pages.push(await createPage(app, { ...p, parentId }, cspec));
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
