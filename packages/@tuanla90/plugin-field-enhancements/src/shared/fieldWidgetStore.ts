/**
 * GLOBAL (field-level) display-widget assignments — "set a widget once for a field, it shows in every view".
 *
 * Storage: collection `ptdlFieldWidget` (one row per data-source + collection + field → {widgetModel, config}),
 * loaded once into `cache` at client startup and read synchronously during render. Written via
 * `ptdlFieldWidget:updateOrCreate`, deleted via `ptdlFieldWidget:destroy`. Same blueprint as
 * conditional-format's `ptdlFieldFormatRules` / custom-header's `ptdlFieldStyles`.
 *
 * `config` is the widget's own props object (the `ptdl*` keys its settings flow sets via setProps). The
 * display patch (registerAll) borrows the configured widget class's renderComponent with a synthetic
 * instance whose `props` = config, so the widget renders exactly as it would per-block.
 */

export type FieldWidget = { widgetModel: string; config: any };

/**
 * Render a widget's DISPLAY output from a config, by borrowing the configured widget class's
 * `renderComponent`/`render` on a SYNTHETIC instance whose `props` = config (the exact mechanism the global
 * display patch uses — see registerAll `patchGlobalFieldWidget`). Reused by the Widget-global manager pane's
 * Preview column. Returns the rendered node, or null when the class/methods are missing (caller falls back).
 * CRASH-SAFE for the setup; a throw INSIDE the render surfaces to React (wrap the result in an ErrorBoundary).
 */
export function borrowWidgetRender(flowEngine: any, model: string, props: any, value: any, cf: any, context: any): any {
  const proto: any = flowEngine?.getModelClass?.(model)?.prototype;
  if (!proto) return null;
  const own = (k: string) => Object.prototype.hasOwnProperty.call(proto, k) && typeof proto[k] === 'function';
  if (!own('renderComponent') && !own('render')) return null;
  const inst: any = Object.create(proto);
  inst.props = { ...(props || {}), value, pattern: 'readPretty' };
  // collectionField/context are getter-only on the prototype → define OWN value props to shadow them.
  try { Object.defineProperty(inst, 'collectionField', { value: cf, configurable: true, enumerable: true }); } catch (_) { /* ignore */ }
  try { Object.defineProperty(inst, 'context', { value: context, configurable: true, enumerable: true }); } catch (_) { /* ignore */ }
  const out = own('renderComponent') ? proto.renderComponent.call(inst, value, undefined) : proto.render.call(inst);
  return out == null ? null : out;
}

// key = `${dataSource}.${collectionName}.${fieldName}` → FieldWidget
const cache = new Map<string, FieldWidget>();

let version = 0;
const listeners = new Set<() => void>();
export function fieldWidgetVersion(): number { return version; }
export function onFieldWidgetChange(cb: () => void): () => void { listeners.add(cb); return () => listeners.delete(cb); }
function bump() { version++; for (const cb of listeners) { try { cb(); } catch (_) { /* ignore */ } } }

function keyOf(ds?: string, coll?: string, field?: string): string | undefined {
  if (!coll || !field) return undefined;
  return `${ds || 'main'}.${coll}.${field}`;
}

/** The configured widget for a field (or null). Safe to call every render. */
export function fieldWidgetFor(ds?: string, coll?: string, field?: string): FieldWidget | null {
  const k = keyOf(ds, coll, field);
  return (k && cache.get(k)) || null;
}

/** Every configured field-widget (for the overview page). */
export function allFieldWidgets(): { dataSource: string; collection: string; field: string; widget: FieldWidget }[] {
  const out: { dataSource: string; collection: string; field: string; widget: FieldWidget }[] = [];
  for (const [k, widget] of cache) {
    const [ds, coll, ...rest] = k.split('.');
    out.push({ dataSource: ds, collection: coll, field: rest.join('.'), widget });
  }
  return out;
}

/** Populate the cache from the server. Call (awaited) in each lane's plugin load(). */
export async function loadFieldWidgetCache(api: any): Promise<void> {
  if (!api?.request) return;
  try {
    const res = await api.request({ url: 'ptdlFieldWidget:list', params: { pageSize: 1000 } });
    const rows = res?.data?.data || [];
    const total = res?.data?.meta?.count;
    if (typeof total === 'number' && total > rows.length) {
      // eslint-disable-next-line no-console
      console.warn(`[field-enh] field-widget cache truncated: ${rows.length}/${total} rows (pageSize cap 1000).`);
    }
    cache.clear();
    for (const r of rows) {
      const k = keyOf(r.dataSource, r.collectionName, r.fieldName);
      if (k && r.widgetModel) cache.set(k, { widgetModel: r.widgetModel, config: r.config || {} });
    }
    bump();
    // eslint-disable-next-line no-console
    console.log('[field-enh] field-widget cache loaded:', cache.size);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[field-enh] load field-widget cache failed (table may be new/empty)', e);
  }
}

// Serialize upserts PER KEY: the widget dialog handler can fire saveWidgetGlobal several times in quick
// succession (flow re-apply), and concurrent `updateOrCreate` calls race — each sees "no row yet" and
// CREATEs → duplicate rows. Chaining per key guarantees the first commits before the next checks (→ 1 row).
const _inFlight = new Map<string, Promise<void>>();
async function doUpsert(api: any, dataSource: string, coll: string, field: string, widgetModel: string, config: any): Promise<void> {
  await api.request({
    url: 'ptdlFieldWidget:updateOrCreate',
    method: 'post',
    params: { filterKeys: ['dataSource', 'collectionName', 'fieldName'] },
    data: { dataSource, collectionName: coll, fieldName: field, widgetModel, config: config || {} },
  });
  const k = keyOf(dataSource, coll, field)!;
  cache.set(k, { widgetModel, config: config || {} });
  bump();
}

/** Assign (or overwrite) the global widget for a field, then refresh the local cache. Serialized per field. */
export async function upsertFieldWidget(api: any, ds: string | undefined, coll: string | undefined, field: string | undefined, widgetModel: string, config: any): Promise<void> {
  if (!api?.request || !coll || !field || !widgetModel) return;
  const dataSource = ds || 'main';
  const k = keyOf(dataSource, coll, field)!;
  const prev = _inFlight.get(k) || Promise.resolve();
  const run = prev.catch(() => {}).then(() => doUpsert(api, dataSource, coll, field, widgetModel, config));
  _inFlight.set(k, run);
  try { await run; } finally { if (_inFlight.get(k) === run) _inFlight.delete(k); }
}

/** Remove the global widget for a field. */
export async function removeFieldWidget(api: any, ds: string | undefined, coll: string, field: string): Promise<void> {
  if (!api?.request) return;
  const dataSource = ds || 'main';
  await api.request({
    url: 'ptdlFieldWidget:destroy',
    method: 'post',
    params: { filter: { dataSource, collectionName: coll, fieldName: field } },
  });
  cache.delete(keyOf(dataSource, coll, field)!);
  bump();
}

// Cross-session freshness: reload on tab re-focus (throttled once / 10s).
let _bound = false;
export function bindFieldWidgetAutoRefresh(api: any): void {
  if (_bound || typeof document === 'undefined' || !api?.request) return;
  _bound = true;
  let last = 0;
  const onVisible = () => {
    if (document.visibilityState !== 'visible') return;
    const now = Date.now();
    if (now - last < 10000) return;
    last = now;
    loadFieldWidgetCache(api);
  };
  try { document.addEventListener('visibilitychange', onVisible); } catch (_) { /* ignore */ }
}
