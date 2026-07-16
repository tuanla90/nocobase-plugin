import React from 'react';
import { Badge, Button, Input, Select, Space, Tooltip } from 'antd';
import { observer, useForm } from '@formily/react';
import { ColorField, registerSettingsKit, rx, fi, ConditionRow, opNeedsNoValue, onLiveRefresh, ColumnSelect } from '@ptdl/shared';
import type { CondMeta } from '@ptdl/shared';
import { Play, Plus, ArrowLeft, X } from 'lucide-react';

/**
 * @ptdl/plugin-menu-badge — show a live COUNT badge on a left-sidebar menu item (e.g. "12" pending
 * orders), like the count chips in modern admin sidebars.
 *
 * NocoBase 2.1.19 DOES have a native menu badge (AdminLayoutMenuUtils `MenuItem` renders
 * `<Badge count={useEvaluatedExpression(route.options.badge.count)}/>`), but its count is a JSON-template
 * expression evaluated ONCE per menu mount (`useEffect` keyed on [context, expression]) — no polling, no
 * data-change reactivity, and there's no config UI in this build. So we roll our own live badge:
 *
 *  - Config lives on the route's existing `options` JSON (`options.ptdlBadge = {enabled, collection,
 *    dataSource, filter, color, interval}`) — set via a settings step we add to the menu item (no schema
 *    change). Same pattern as @ptdl/plugin-menu-sections.
 *  - `AdminLayoutMenuItemModel.prototype.render` is patched to append a <MenuBadge> that fetches the count
 *    from `<collection>:list?pageSize=1` (meta.count) and refreshes it three ways:
 *      1. every `interval` seconds (poll),
 *      2. when the tab regains focus,
 *      3. immediately when THIS browser mutates that collection — a one-time axios response interceptor
 *         on the shared apiClient notifies badges after a successful create/update/destroy/…
 *
 * Client-only; imports nothing from @nocobase/client(-v2) (model class + apiClient injected per lane).
 */

const KEY = 'ptdlBadge'; // route.options.ptdlBadge
const RENDER_FLAG = '__ptdlBadgeRenderPatched';

type BadgeCfg = {
  enabled?: boolean;
  collection?: string;
  dataSource?: string;
  filter?: string;
  color?: string;
  borderColor?: string;
  interval?: number;
  // Number display: 'full' | '99' | '999' | '9999' (cap → "N+") | 'compact' (1.2K) | 'dot' (no number).
  overflow?: string;
  showZero?: boolean; // show the badge even when the count is 0 (default: hide)
  threshold?: number; // when value ≥ threshold, use thresholdColor instead of color
  thresholdColor?: string;
  // Measure: 'count' (rows, default) | 'sum' | 'avg' | 'max' | 'min' of `aggField`.
  agg?: string;
  aggField?: string;
};

// ---- i18n (namespace shared with the sections feature) ------------------------------------------
const I18N_NS = '@ptdl/plugin-menu-enhancements/client';
let _i18n: any = null;
export function setBadgeI18n(i18n: any) {
  if (i18n) _i18n = i18n;
}
function T(s: string): string {
  try {
    return _i18n ? _i18n.t(s, { ns: I18N_NS }) : s;
  } catch (e) {
    return s;
  }
}

// Map the configured number-display mode → antd <Badge> props: a `dot`, an `overflowCount` cap
// (shows "N+"), or a pre-formatted compact string ("1.2K"). Shared by the menu + tab badges so all
// surfaces render the number identically.
const OVERFLOW_CAPS: Record<string, number> = { '99': 99, '999': 999, '9999': 9999, full: Number.MAX_SAFE_INTEGER };
function badgeCountProps(count: number, cfg: BadgeCfg): { count?: any; overflowCount?: number; dot?: boolean } {
  const mode = cfg.overflow || '99';
  if (mode === 'dot') return { dot: true }; // presence-only indicator, no number
  if (mode === 'compact') {
    try {
      return { count: new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(count) };
    } catch (e) {
      return { count };
    }
  }
  return { count, overflowCount: OVERFLOW_CAPS[mode] ?? 99 };
}

// Resolve the badge fill: threshold color once the count reaches the threshold, else the base color.
function effColor(count: number | null, cfg: BadgeCfg): string | undefined {
  const th = Number(cfg.threshold);
  if (th > 0 && count != null && count >= th && cfg.thresholdColor) return cfg.thresholdColor;
  return cfg.color || undefined;
}

// ---- apiClient + data-change bus (injected once per lane) ---------------------------------------
let apiClient: any = null;
const listeners = new Map<string, Set<() => void>>();

function notify(collection: string) {
  const set = listeners.get(collection);
  if (set) set.forEach((fn) => {
    try {
      fn();
    } catch (e) {
      /* ignore */
    }
  });
}

function subscribe(collection: string, fn: () => void): () => void {
  if (!collection) return () => {};
  let set = listeners.get(collection);
  if (!set) {
    set = new Set();
    listeners.set(collection, set);
  }
  set.add(fn);
  return () => set!.delete(fn);
}

// A successful mutating request on collection X → refresh X's badges immediately (this browser).
const MUTATING = /^(create|update|updatemany|destroy|move|firstorcreate|updateorcreate|add|remove|set|toggle|bulk)/;

function installInterceptor(api: any) {
  const ax = api?.axios;
  if (!ax || ax.__ptdlBadgeInterceptor) return;
  try {
    ax.interceptors.response.use((resp: any) => {
      try {
        const url = String(resp?.config?.url || '');
        const m = url.match(/([\w.\-/]+):(\w+)/);
        if (m && MUTATING.test(m[2].toLowerCase())) {
          const resource = m[1].split('/').pop()!; // "orders" or an association like "posts.comments"
          notify(resource);
          if (resource.includes('.')) {
            // Association resource (parent.relation): nudge badges keyed on EITHER plain name so a
            // badge counting the target collection still refreshes. Over-notifying is harmless (an
            // extra count fetch); under-notifying would leave the badge stale until the next poll.
            const parts = resource.split('.');
            notify(parts[0]);
            notify(parts[parts.length - 1]);
          }
        }
      } catch (e) {
        /* ignore */
      }
      return resp;
    });
    ax.__ptdlBadgeInterceptor = true;
  } catch (e) {
    /* ignore */
  }
}

// A server WS push → refresh badges for the changed collections WITHOUT waiting for the poll. Covers what
// this browser's own axios interceptor can't see: edits by OTHER clients, server-side workflows, and
// computed-cascade writebacks (`hooks:false`). Uses the shared `onLiveRefresh` (both message types).
let wsInstalled = false;
function installWs(app: any) {
  if (wsInstalled || !app?.ws) return;
  wsInstalled = true;
  onLiveRefresh(app, (cols) => {
    if (cols) cols.forEach((c) => notify(c));
    else listeners.forEach((_set, coll) => notify(coll)); // no list → refresh every badge
  });
}

export function initBadge(deps: { apiClient: any; app?: any }) {
  apiClient = deps.apiClient || apiClient;
  installInterceptor(apiClient);
  if (deps.app) installWs(deps.app);
}

const AGG_FNS = new Set(['sum', 'avg', 'max', 'min']);

// Fetch the badge value. 'count' (or a missing aggregate field) uses the reliable `<coll>:list`
// meta.count. sum/avg/max/min go through the data-visualization `<coll>:query` action (measures),
// which is the only server aggregate available in this build (there is no plain `:aggregate`).
async function fetchCount(cfg: BadgeCfg): Promise<number | null> {
  if (!apiClient?.request || !cfg?.collection) return null;
  let filter: any;
  if (cfg.filter) {
    try {
      filter = JSON.parse(cfg.filter);
    } catch (e) {
      filter = undefined;
    }
  }
  const ds = cfg.dataSource && cfg.dataSource !== 'main' ? cfg.dataSource : undefined;
  const agg = String(cfg.agg || 'count');

  if (AGG_FNS.has(agg) && cfg.aggField) {
    try {
      const res = await apiClient.request({
        url: `${cfg.collection}:query`,
        method: 'post',
        data: {
          collection: cfg.collection,
          ...(ds ? { dataSource: ds } : {}),
          measures: [{ field: [cfg.aggField], aggregation: agg, alias: 'value' }],
          dimensions: [],
          ...(filter ? { filter } : {}),
        },
      });
      // repository.query returns rows; one measure + no dimension → [{ value: <number|string> }].
      const rows = res?.data?.data;
      const raw = Array.isArray(rows) && rows.length ? rows[0]?.value : undefined;
      const num = typeof raw === 'number' ? raw : Number(raw);
      if (!Number.isFinite(num)) return null;
      // Keep fractional aggregates (avg) tidy for a badge.
      return Number.isInteger(num) ? num : Math.round(num * 10) / 10;
    } catch (e) {
      return null;
    }
  }

  const headers = ds ? { 'X-Data-Source': ds } : undefined;
  try {
    const res = await apiClient.request({
      url: `${cfg.collection}:list`,
      params: { pageSize: 1, ...(filter ? { filter } : {}) },
      headers,
    });
    const c = res?.data?.meta?.count;
    return typeof c === 'number' ? c : null;
  } catch (e) {
    return null;
  }
}

function useBadgeCount(cfg: BadgeCfg): number | null {
  const [count, setCount] = React.useState<number | null>(null);
  const cfgKey = `${cfg.collection}|${cfg.dataSource}|${cfg.filter}|${cfg.interval}|${cfg.agg}|${cfg.aggField}`;
  React.useEffect(() => {
    let active = true;
    // Skip polling while the tab is hidden (background tabs shouldn't hammer the API); the
    // visibilitychange handler refreshes immediately when the user returns.
    const run = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      fetchCount(cfg).then((c) => {
        if (active) setCount(c);
      });
    };
    run();
    const ms = Math.max(10, Number(cfg.interval) || 45) * 1000;
    const timer = setInterval(run, ms);
    const unsub = subscribe(cfg.collection || '', run);
    const onFocus = () => run();
    const onVisible = () => {
      if (typeof document === 'undefined' || !document.hidden) run();
    };
    if (typeof window !== 'undefined') window.addEventListener('focus', onFocus);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      clearInterval(timer);
      unsub();
      if (typeof window !== 'undefined') window.removeEventListener('focus', onFocus);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfgKey]);
  return count;
}

// Renders the menu item's content with the count badge. Two layouts:
//  - expanded: a standalone number badge at the right (with a little right padding so it isn't clipped),
//  - collapsed (icon-only sidebar): a small dot overlaid on the icon.
function BadgeWrap({ cfg, collapsed, children }: { cfg: BadgeCfg; collapsed: boolean; children: React.ReactNode }) {
  const count = useBadgeCount(cfg);
  // Hide at 0 by default on BOTH layouts (a "0" badge is rarely wanted); opt back in with showZero.
  const visible = count != null && (Number(count) > 0 || !!cfg.showZero);

  if (collapsed) {
    // Small NUMBER badge overlaid on the icon corner (a plain dot is nearly invisible). Pulled inward
    // (negative x offset) so the narrow collapsed item doesn't clip it; a ring separates it from the icon.
    if (!visible) return <span style={{ display: 'inline-flex' }}>{children}</span>;
    return (
      <Badge
        {...badgeCountProps(count as number, cfg)}
        showZero={!!cfg.showZero}
        size="small"
        offset={[-10, 9]}
        style={{
          backgroundColor: effColor(count, cfg),
          // No ring by default (the white border was unwanted) — only when a Border color is set.
          boxShadow: cfg.borderColor ? `0 0 0 1.5px ${cfg.borderColor}` : 'none',
          // Compact: smaller than antd's "small" preset, sunk deeper into the icon corner.
          fontSize: 8,
          height: 11,
          minWidth: 11,
          lineHeight: '11px',
          padding: '0 2px',
        }}
      >
        <span style={{ display: 'inline-flex' }}>{children}</span>
      </Badge>
    );
  }

  if (!visible) return <>{children}</>;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, width: '100%', paddingRight: 10, boxSizing: 'border-box' }}>
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', flex: '1 1 auto' }}>{children}</span>
      <Badge
        {...badgeCountProps(count as number, cfg)}
        showZero={!!cfg.showZero}
        style={{
          backgroundColor: effColor(count, cfg),
          boxShadow: cfg.borderColor ? `0 0 0 1px ${cfg.borderColor}` : 'none',
          flex: 'none',
        }}
      />
    </span>
  );
}

// ================= Settings-dialog custom components (registered on flowEngine.flowSettings) =======
// Collection titles are often i18n templates ("{{t(...)}}"); fall back to the raw name for those.
function collLabel(c: any): string {
  const t = c?.title;
  const clean = typeof t === 'string' && !/^\s*\{\{/.test(t) ? t : c?.name;
  return clean && clean !== c?.name ? `${clean} (${c.name})` : c?.name || '';
}

function dsHeaders(dataSource?: string) {
  return dataSource && dataSource !== 'main' ? { 'X-Data-Source': dataSource } : undefined;
}

// ---- Collection picker (dropdown from collections:list) -----------------------------------------
function PtdlCollectionSelect(props: any) {
  const { value, onChange } = props;
  const form: any = useForm();
  const dataSource = form?.values?.dataSource || 'main';
  const [opts, setOpts] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(false);
  React.useEffect(() => {
    let active = true;
    if (!apiClient?.request) return;
    setLoading(true);
    apiClient
      .request({ url: 'collections:list', params: { pageSize: 500 }, headers: dsHeaders(dataSource) })
      .then((res: any) => {
        if (!active) return;
        const list = (res?.data?.data || [])
          .filter((c: any) => !c.hidden || c.name === value)
          .map((c: any) => ({ value: c.name, label: collLabel(c) }))
          .sort((a: any, b: any) => a.label.localeCompare(b.label));
        setOpts(list);
      })
      .catch(() => {})
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [dataSource]);
  return (
    <Select
      showSearch
      allowClear
      optionFilterProp="label"
      placeholder={T('Select a collection')}
      style={{ width: '100%' }}
      value={value || undefined}
      onChange={(v: any) => onChange?.(v)}
      options={opts}
      loading={loading}
    />
  );
}

// ---- Numeric field picker (for sum/avg/max/min) — lists the chosen collection's number fields -----
function PtdlNumericFieldSelect(props: any) {
  const { value, onChange } = props;
  const form: any = useForm();
  const collection = form?.values?.collection;
  const dataSource = form?.values?.dataSource || 'main';
  const [opts, setOpts] = React.useState<any[]>([]);
  React.useEffect(() => {
    let active = true;
    if (!apiClient?.request || !collection) {
      setOpts([]);
      return;
    }
    apiClient
      .request({ url: 'collections:get', params: { filterByTk: collection, appends: ['fields'] }, headers: dsHeaders(dataSource) })
      .then((res: any) => {
        if (!active) return;
        const list = (res?.data?.data?.fields || [])
          .filter((f: any) => NUMERIC_TYPES.has(f.type))
          .map((f: any) => ({ value: f.name, label: cleanLabel(f?.uiSchema?.title, f.name), type: f.type, iface: f.interface }));
        setOpts(list);
      })
      .catch(() => active && setOpts([]));
    return () => {
      active = false;
    };
  }, [collection, dataSource]);
  return (
    <ColumnSelect
      placeholder={T('Select a number field')}
      value={value}
      onChange={(v: any) => onChange?.(v ?? '')}
      options={opts}
      notFoundContent={collection ? T('No number fields') : T('Pick a collection first')}
    />
  );
}

// ---- Numeric field types (used by the aggregate field picker) -----------------------------------
const NUMERIC_TYPES = new Set(['integer', 'bigInt', 'float', 'double', 'decimal', 'real', 'number']);

function cleanLabel(l: any, fallback: string): string {
  return typeof l === 'string' && l.trim() && !/^\s*\{\{/.test(l) ? l : fallback;
}

// ---- Path-based filter model (antd Cascader field picker, like conditional-format, + condition kit) --
type FCond = { path: string[]; op: string; value: any; meta?: CondMeta };

// path ['customer','name'] + inner {$eq:x} → {customer:{name:{$eq:x}}} (NocoBase nested relation filter).
function nestPath(path: string[], inner: any): any {
  return path.reduceRight((acc, k) => ({ [k]: acc }), inner);
}
function encodeFilterPath(conj: string, conds: FCond[]): any {
  const parts = conds
    .filter((c) => c.path?.length && c.op)
    .map((c) => nestPath(c.path, opNeedsNoValue(c.op) ? { [c.op]: true } : { [c.op]: c.value }));
  return parts.length ? { [conj]: parts } : undefined;
}
// Walk a stored filter object back into path-based conds (unwrap nested relation keys until an $op).
function decodeFilterPath(json: string): { conj: string; conds: FCond[] } | null {
  if (!json || !json.trim()) return { conj: '$and', conds: [] };
  let obj: any;
  try {
    obj = JSON.parse(json);
  } catch (e) {
    return null;
  }
  const conj = obj?.$and ? '$and' : obj?.$or ? '$or' : null;
  if (!conj || !Array.isArray(obj[conj])) return null;
  const conds: FCond[] = [];
  for (const item of obj[conj]) {
    if (!item || typeof item !== 'object') return null;
    const path: string[] = [];
    let cur: any = item;
    let ok = false;
    while (cur && typeof cur === 'object') {
      const k = Object.keys(cur)[0];
      if (!k) break;
      if (k.startsWith('$')) {
        const val = cur[k];
        conds.push({ path, op: k, value: typeof val === 'boolean' ? '' : val });
        ok = true;
        break;
      }
      path.push(k);
      cur = cur[k];
    }
    if (!ok) return null; // shape we don't recognise → fall back to advanced JSON
  }
  return { conj, conds };
}

// One condition row — the shared `ConditionRow` (field cascader + smart operator + adaptive value),
// with this plugin's `path[]` cond shape, 190px field box, and X-button remove.
function FilterCondRow({ cond, collection, ds, onChange, onRemove }: any) {
  return (
    <ConditionRow
      api={apiClient}
      collectionName={collection}
      dataSourceKey={ds}
      path={cond.path || []}
      op={cond.op}
      value={cond.value}
      onChange={onChange}
      onRemove={onRemove}
      placeholder={T('Select a field')}
      emptyLabel={T('No fields')}
      cascaderWidth={190}
      renderRemove={(onR) => (
        <Tooltip title={T('Remove')}>
          <Button size="small" type="text" danger style={{ flex: 'none' }} icon={<X size={15} />} onClick={onR} />
        </Tooltip>
      )}
    />
  );
}

function PtdlFilterBuilder(props: any) {
  const { value, onChange } = props;
  const form: any = useForm();
  const collection = form?.values?.collection;
  const dataSource = form?.values?.dataSource || 'main';
  const ds = dataSource && dataSource !== 'main' ? dataSource : undefined;

  const initial = React.useMemo(() => decodeFilterPath(value || ''), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [conj, setConj] = React.useState<string>(initial?.conj || '$and');
  const [conds, setConds] = React.useState<FCond[]>(initial?.conds || []);
  const [advanced, setAdvanced] = React.useState(initial === null);
  const lastEmit = React.useRef<string>(value || '');

  // Re-sync if the stored value changes from OUTSIDE (e.g. dialog reopened), not from our own emit.
  React.useEffect(() => {
    if ((value || '') === lastEmit.current) return;
    const d = decodeFilterPath(value || '');
    if (d) {
      setConj(d.conj);
      setConds(d.conds);
      setAdvanced(false);
    } else {
      setAdvanced(true);
    }
    lastEmit.current = value || '';
  }, [value]);

  // Switching the collection invalidates every condition (they reference the old collection's fields).
  const mountedRef = React.useRef(false);
  React.useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    setConds([]);
    setConj('$and');
    setAdvanced(false);
    lastEmit.current = '';
    onChange?.('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collection]);

  const apply = (nextConj: string, nextConds: FCond[]) => {
    setConj(nextConj);
    setConds(nextConds);
    const obj = encodeFilterPath(nextConj, nextConds);
    const json = obj ? JSON.stringify(obj) : '';
    lastEmit.current = json;
    onChange?.(json);
  };

  if (advanced) {
    return (
      <div>
        <Input.TextArea
          rows={3}
          value={value}
          placeholder={'{"$and":[{"status":{"$eq":"pending"}}]}'}
          onChange={(e: any) => {
            lastEmit.current = e.target.value;
            onChange?.(e.target.value);
          }}
        />
        <a style={{ fontSize: 12 }} onClick={() => setAdvanced(false)}>
          <ArrowLeft size={12} style={{ verticalAlign: '-0.15em' }} /> {T('Back to visual builder')}
        </a>
      </div>
    );
  }

  return (
    <div>
      {!collection ? (
        <div style={{ color: '#999', fontSize: 12 }}>{T('Pick a collection first to choose fields.')}</div>
      ) : (
        <>
          {conds.length > 1 && (
            <div style={{ marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: '#888', marginRight: 8 }}>{T('Match')}</span>
              <Select
                size="small"
                value={conj}
                style={{ width: 130 }}
                onChange={(v: any) => apply(v, conds)}
                options={[
                  { value: '$and', label: T('ALL (AND)') },
                  { value: '$or', label: T('ANY (OR)') },
                ]}
              />
            </div>
          )}
          <Space direction="vertical" style={{ width: '100%' }} size={6}>
            {conds.map((c, i) => (
              <FilterCondRow
                key={i}
                cond={c}
                collection={collection}
                ds={ds}
                onChange={(nc: FCond) => apply(conj, conds.map((x, j) => (j === i ? nc : x)))}
                onRemove={() => apply(conj, conds.filter((_, j) => j !== i))}
              />
            ))}
          </Space>
          <div style={{ marginTop: 8 }}>
            <Button size="small" icon={<Plus size={14} />} onClick={() => apply(conj, [...conds, { path: [], op: '$eq', value: '' }])}>
              {T('Add condition')}
            </Button>
            <a style={{ fontSize: 12, marginLeft: 12 }} onClick={() => setAdvanced(true)}>
              {T('Advanced (raw JSON)')}
            </a>
          </div>
        </>
      )}
    </div>
  );
}

// Live "try it" preview: runs the exact query the badge will (count OR aggregate), with the current
// form values — so an aggregate that the query API can't run surfaces here, not silently on the menu.
function PtdlCountPreview() {
  const form: any = useForm();
  const { collection, dataSource, filter, agg, aggField } = form?.values || {};
  const [count, setCount] = React.useState<number | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState('');
  const isAgg = AGG_FNS.has(String(agg));
  const run = async () => {
    setErr('');
    setCount(null);
    if (!apiClient?.request || !collection) {
      setErr(T('Pick a collection first'));
      return;
    }
    if (isAgg && !aggField) {
      setErr(T('Pick a field to aggregate'));
      return;
    }
    if (filter) {
      try {
        JSON.parse(filter);
      } catch (e) {
        setErr(T('Filter is not valid yet'));
        return;
      }
    }
    setLoading(true);
    const v = await fetchCount({ collection, dataSource, filter, agg, aggField } as BadgeCfg);
    if (v == null) setErr(T('Count failed — check the filter/collection'));
    else setCount(v);
    setLoading(false);
  };
  return (
    <Space>
      <Button size="small" onClick={run} loading={loading} icon={<Play size={13} />}>
        {T('Test count')}
      </Button>
      {count != null && (
        <span>
          = <b style={{ fontSize: 15 }}>{count}</b> {isAgg ? '' : T('matching row(s)')}
        </span>
      )}
      {err && <span style={{ color: '#cf1322', fontSize: 12 }}>{err}</span>}
    </Space>
  );
}

// Fill + border color on ONE row with a SINGLE live preview of the real badge (both colors together).
// Writes to the sibling `color` / `borderColor` form fields (kept hidden in the schema).
function PtdlBadgeStyle() {
  const form: any = useForm();
  const color = form?.values?.color;
  const borderColor = form?.values?.borderColor;
  const set = (key: string, hex: string) => {
    try {
      form.setValuesIn(key, hex || '');
    } catch (e) {
      /* ignore */
    }
  };
  const picker = (val: any, key: string, label: string) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span style={{ fontSize: 12, color: '#888' }}>{label}</span>
      <ColorField value={val} emptyValue="" onChange={(hex: any) => set(key, hex)} />
    </span>
  );
  // Explicit flex row (alignItems:center + a normal control min-height) so the small pickers sit
  // centered on the line instead of floating to the top of a collapsed-height row.
  return (
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 20, rowGap: 6, minHeight: 32 }}>
      {picker(color, 'color', T('Fill'))}
      {picker(borderColor, 'borderColor', T('Border'))}
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 12, color: '#999' }}>{T('Preview')}</span>
        <Badge
          count={12}
          overflowCount={9999}
          style={{ backgroundColor: color || undefined, boxShadow: borderColor ? `0 0 0 1px ${borderColor}` : 'none' }}
        />
      </span>
    </div>
  );
}

// Simple color field for a single form value (used by the threshold color). minHeight matches a
// normal control so the small picker aligns with the sibling number input in its grid row.
function PtdlColor(props: any) {
  const { value, onChange } = props;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', minHeight: 32 }}>
      <ColorField value={value} onChange={onChange} />
    </span>
  );
}

function registerComponents(flowSettings: any) {
  // Wrap in observer so reading sibling form.values (collection / dataSource) is reactive — otherwise
  // the filter builder never sees the picked collection and stays on "Pick a collection first".
  // registerSettingsKit also registers the shared layout primitives (SettingsGrid + CollapsibleSection).
  registerSettingsKit(flowSettings, {
    PtdlCollectionSelect: observer(PtdlCollectionSelect),
    PtdlNumericFieldSelect: observer(PtdlNumericFieldSelect),
    PtdlFilterBuilder: observer(PtdlFilterBuilder),
    PtdlCountPreview: observer(PtdlCountPreview),
    PtdlBadgeStyle: observer(PtdlBadgeStyle),
    PtdlColor,
  });
}

function readCfg(route: any): BadgeCfg | null {
  const b = route?.options?.[KEY];
  return b && b.enabled && b.collection ? b : null;
}

function patchRender(proto: any) {
  if (proto[RENDER_FLAG] || typeof proto.render !== 'function') return;
  const prev = proto.render;
  proto.render = function (this: any) {
    const orig = prev.apply(this, arguments);
    try {
      const route = this.getRoute?.();
      // Don't badge items converted to a divider / group label by @ptdl/plugin-menu-sections.
      const kind = route?.options?.ptdlMenuKind;
      const cfg = kind ? null : readCfg(route);
      if (cfg) {
        const opts = this.props?.options || {};
        const collapsed = !!(opts.collapsed || opts.isMobile);
        return (
          <BadgeWrap cfg={cfg} collapsed={collapsed}>
            {orig}
          </BadgeWrap>
        );
      }
    } catch (e) {
      /* never break the menu render */
    }
    return orig;
  };
  proto[RENDER_FLAG] = true;
}

// desktopRoutes:update runs a tree transaction wrapped by workflow middlewares → transient SQLITE_BUSY
// (HTTP 500) on SQLite/Windows. Retry a few times so a lock recovers silently.
async function updateRouteWithRetry(model: any, values: any, attempts = 4) {
  let lastErr: any;
  for (let i = 0; i < attempts; i++) {
    try {
      await model.updateMenuRoute(values);
      return;
    } catch (e: any) {
      lastErr = e;
      const status = e?.response?.status ?? e?.status;
      const msg = String(e?.response?.data?.errors?.[0]?.message || e?.message || '');
      if (!(status === 500 || /busy|locked|timeout/i.test(msg)) || i === attempts - 1) break;
      await new Promise((r) => setTimeout(r, 150 * (i + 1)));
    }
  }
  throw lastErr;
}

// Kept for call-site compatibility (schema builders pass ctx); routes through the module i18n so our
// namespace resolves. The ctx arg is ignored.
function tr(_ctx: any, s: string): string {
  return T(s);
}

// Shared config helpers so the menu-item flow and the tab flow use the exact same dialog + shape.
function badgeDefaultParams(b: any = {}) {
  return {
    enabled: !!b.enabled,
    collection: b.collection || '',
    dataSource: b.dataSource || 'main',
    filter: b.filter || '',
    color: b.color || '',
    borderColor: b.borderColor || '',
    interval: b.interval || 45,
    overflow: b.overflow || '99',
    showZero: !!b.showZero,
    threshold: b.threshold || 0,
    thresholdColor: b.thresholdColor || '',
    agg: b.agg || 'count',
    aggField: b.aggField || '',
  };
}

// Persist the config as long as a collection is chosen — even with the badge disabled — so toggling
// "Show badge" off no longer wipes the collection/filter/colours (readCfg gates rendering on
// `enabled`). Only a cleared collection removes the config entirely.
function normalizeCfg(params: any): BadgeCfg | null {
  if (!params?.collection) return null;
  return {
    enabled: !!params?.enabled,
    collection: String(params.collection).trim(),
    dataSource: String(params.dataSource || 'main').trim() || 'main',
    filter: String(params.filter || '').trim(),
    color: String(params.color || '').trim(),
    borderColor: String(params.borderColor || '').trim(),
    interval: Math.max(10, Number(params.interval) || 45),
    overflow: String(params.overflow || '99'),
    showZero: !!params.showZero,
    threshold: Math.max(0, Number(params.threshold) || 0),
    thresholdColor: String(params.thresholdColor || '').trim(),
    // Aggregate only sticks when a field is chosen; otherwise fall back to counting rows.
    agg: AGG_FNS.has(String(params.agg)) && params.aggField ? String(params.agg) : 'count',
    aggField: AGG_FNS.has(String(params.agg)) ? String(params.aggField || '').trim() : '',
  };
}

function buildBadgeUiSchema(ctx: any) {
  // Function-form reactions (rx) — the string {{$deps}} form throws under v2 compileUiSchema.
  const whenEnabled = rx((v: any) => !!v.enabled);
  const whenAgg = rx((v: any) => !!v.enabled && AGG_FNS.has(String(v.agg)));
  const whenThreshold = rx((v: any) => !!v.enabled && Number(v.threshold) > 0);
  const grid2 = { type: 'void', 'x-component': 'SettingsGrid' };

  return {
    enabled: fi(tr(ctx, 'Show count badge'), 'Switch', {
      type: 'boolean',
      // Inline (label + switch on one line) to save a row.
      decoratorProps: { layout: 'horizontal', labelAlign: 'left', labelWidth: 160, style: { marginBottom: 10 } },
    }),

    // ── Data & measure ─────────────────────────────────────────────────────────
    dataGroup: {
      type: 'void',
      'x-component': 'CollapsibleSection',
      'x-component-props': { title: tr(ctx, 'Data & measure') },
      'x-reactions': whenEnabled,
      properties: {
        r1: {
          ...grid2,
          properties: {
            collection: fi(tr(ctx, 'Collection'), 'PtdlCollectionSelect'),
            dataSource: fi(tr(ctx, 'Data source'), 'Input', {
              componentProps: { placeholder: 'main' },
              decoratorProps: { tooltip: tr(ctx, 'Leave as "main" unless the collection is in another data source.') },
            }),
          },
        },
        r2: {
          ...grid2,
          properties: {
            agg: {
              ...fi(tr(ctx, 'Measure'), 'Select'),
              enum: [
                { label: tr(ctx, 'Count rows'), value: 'count' },
                { label: tr(ctx, 'Sum'), value: 'sum' },
                { label: tr(ctx, 'Average'), value: 'avg' },
                { label: tr(ctx, 'Maximum'), value: 'max' },
                { label: tr(ctx, 'Minimum'), value: 'min' },
              ],
            },
            aggField: fi(tr(ctx, 'Field to aggregate'), 'PtdlNumericFieldSelect', { reactions: whenAgg }),
          },
        },
        filter: fi(tr(ctx, 'Filter (optional)'), 'PtdlFilterBuilder', {
          decoratorProps: { tooltip: tr(ctx, 'Only include rows matching these conditions.') },
        }),
        preview: {
          type: 'void',
          'x-decorator': 'FormItem',
          'x-decorator-props': { style: { marginBottom: 4 } },
          'x-component': 'PtdlCountPreview',
        },
      },
    },

    // ── Appearance ─────────────────────────────────────────────────────────────
    lookGroup: {
      type: 'void',
      'x-component': 'CollapsibleSection',
      'x-component-props': { title: tr(ctx, 'Appearance') },
      'x-reactions': whenEnabled,
      properties: {
        badgeStyle: {
          type: 'void',
          title: tr(ctx, 'Colour'),
          'x-decorator': 'FormItem',
          'x-decorator-props': { style: { marginBottom: 8 }, tooltip: tr(ctx, 'Border empty = no border (removes the default white ring).') },
          'x-component': 'PtdlBadgeStyle',
        },
        r3: {
          ...grid2,
          properties: {
            overflow: {
              ...fi(tr(ctx, 'Number display'), 'Select'),
              enum: [
                { label: tr(ctx, 'Full number'), value: 'full' },
                { label: '99+', value: '99' },
                { label: '999+', value: '999' },
                { label: '9999+', value: '9999' },
                { label: tr(ctx, 'Compact (1.2K)'), value: 'compact' },
                { label: tr(ctx, 'Dot only (no number)'), value: 'dot' },
              ],
            },
            showZero: fi(tr(ctx, 'Show when zero'), 'Switch', { type: 'boolean' }),
          },
        },
        r4: {
          ...grid2,
          properties: {
            threshold: fi(tr(ctx, 'Alert threshold'), 'Input', {
              type: 'number',
              componentProps: { type: 'number', min: 0, placeholder: '0 = off' },
              decoratorProps: { tooltip: tr(ctx, 'When the count reaches this number, the badge switches to the alert color.') },
            }),
            thresholdColor: fi(tr(ctx, 'Alert color'), 'PtdlColor', { reactions: whenThreshold }),
          },
        },
      },
    },

    // ── Refresh ────────────────────────────────────────────────────────────────
    refreshGroup: {
      type: 'void',
      'x-component': 'CollapsibleSection',
      'x-component-props': { title: tr(ctx, 'Refresh'), defaultOpen: false },
      'x-reactions': whenEnabled,
      properties: {
        interval: fi(tr(ctx, 'Refresh interval (seconds)'), 'Input', {
          type: 'number',
          componentProps: { type: 'number', min: 10, placeholder: '45' },
          decoratorProps: { tooltip: tr(ctx, 'Auto-refresh cadence; also refreshes on tab focus and when you add/remove a row.') },
        }),
      },
    },

    // Data-only (edited via PtdlBadgeStyle above) — kept hidden so their values persist.
    color: { type: 'string', 'x-hidden': true },
    borderColor: { type: 'string', 'x-hidden': true },
  };
}

// MENU-ITEM flow: config persists on route.options → API write, so use beforeParamsSave (save-only),
// NOT a handler (handler auto-applies every render → updateMenuRoute storm → SQLITE_BUSY).
function registerBadgeFlow(Model: any) {
  try {
    Model.registerFlow({
      key: 'ptdlMenuBadge',
      sort: 220,
      title: T('Badge'),
      steps: {
        badge: {
          title: T('Count badge'),
          uiMode: { type: 'dialog', props: { width: 640 } },
          defaultParams: (ctx: any) => badgeDefaultParams(ctx.model?.getRoute?.()?.options?.[KEY]),
          uiSchema: (ctx: any) => buildBadgeUiSchema(ctx),
          async beforeParamsSave(ctx: any, params: any) {
            const model = ctx.model;
            const route = model?.getRoute?.();
            const options = { ...(route?.options || {}) };
            const cfg = normalizeCfg(params);
            if (cfg) options[KEY] = cfg;
            else delete options[KEY];
            await updateRouteWithRetry(model, { options });
            model.setProps?.('ptdlBadgeRev', Date.now());
          },
        },
      },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[menu-badge] registerFlow failed', e);
  }
}

// A standalone number badge for page tabs (tabs are always expanded and compact → size="small").
function TabBadge({ cfg }: { cfg: BadgeCfg }) {
  const count = useBadgeCount(cfg);
  if (count == null || (Number(count) === 0 && !cfg.showZero)) return null;
  return (
    <Badge
      {...badgeCountProps(count as number, cfg)}
      showZero={!!cfg.showZero}
      size="small"
      style={{ backgroundColor: effColor(count, cfg), boxShadow: cfg.borderColor ? `0 0 0 1px ${cfg.borderColor}` : 'none' }}
    />
  );
}

// TAB flow: a tab MODEL persists its own flow stepParams (no route/API), so a `handler` is safe here —
// it only setProps (client-only), exactly like the core tab title/icon handler. render() reads it.
function registerTabBadge(flowEngine: any) {
  const TabModel = flowEngine?.getModelClass?.('BasePageTabModel');
  if (!TabModel || typeof TabModel.registerFlow !== 'function') {
    // eslint-disable-next-line no-console
    console.warn('[menu-badge] BasePageTabModel not resolvable in this lane — skip tab badge');
    return;
  }
  const proto: any = TabModel.prototype;
  if (!proto.__ptdlTabBadgePatched && typeof proto.render === 'function') {
    const prev = proto.render;
    proto.render = function (this: any) {
      const el = prev.apply(this, arguments);
      try {
        const cfg = this.props?.ptdlTabBadge;
        if (cfg && cfg.enabled && cfg.collection && React.isValidElement(el)) {
          return (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {el}
              <TabBadge cfg={cfg} />
            </span>
          );
        }
      } catch (e) {
        /* never break the tab render */
      }
      return el;
    };
    proto.__ptdlTabBadgePatched = true;
  }
  try {
    TabModel.registerFlow({
      key: 'ptdlTabBadge',
      sort: 1000,
      title: T('Badge'),
      steps: {
        badge: {
          title: T('Count badge'),
          uiMode: { type: 'dialog', props: { width: 640 } },
          defaultParams: () => badgeDefaultParams(),
          uiSchema: (ctx: any) => buildBadgeUiSchema(ctx),
          // Safe as auto-apply: client-only setProps, no API write. Params persist via stepParams.
          handler(ctx: any, params: any) {
            ctx.model.setProps('ptdlTabBadge', normalizeCfg(params));
          },
        },
      },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[menu-badge] tab registerFlow failed', e);
  }
}

export function registerMenuBadge(deps: { flowEngine: any; apiClient: any; app?: any; i18n?: any }) {
  const { flowEngine } = deps;
  setBadgeI18n(deps.i18n);
  initBadge({ apiClient: deps.apiClient, app: deps.app });
  registerComponents(flowEngine?.flowSettings);

  const Model = flowEngine?.getModelClass?.('AdminLayoutMenuItemModel');
  if (Model && typeof Model.registerFlow === 'function') {
    patchRender(Model.prototype);
    registerBadgeFlow(Model);
    // eslint-disable-next-line no-console
    console.log('[menu-badge] registered on AdminLayoutMenuItemModel');
  } else {
    // eslint-disable-next-line no-console
    console.warn('[menu-badge] AdminLayoutMenuItemModel not resolvable in this lane — skip menu badge');
  }

  // Also add count badges to page tabs.
  registerTabBadge(flowEngine);
}
