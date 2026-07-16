import React from 'react';
import { Badge, Button, Cascader, DatePicker, Empty, Input, InputNumber, Select, Space, Spin, Switch, Tabs } from 'antd';
import dayjs from 'dayjs';
import { observer, useForm, RecursionField, useFieldSchema } from '@formily/react';
import { ColorField, getFields, IconByKey, RegistryIconPicker, setIconRegistry, SettingsGrid, rx, onLiveRefresh, SegmentedGroup } from '@ptdl/shared';

/**
 * @ptdl/plugin-filter-tree — AppSheet-style group-by filter BLOCKS (two skins, one engine).
 *
 * Groups a collection by a field into a list ("All" + each value with a count), and clicking a value
 * filters the table/list blocks it is connected to on the same page.
 *  - FilterTreeBlockModel → vertical tree (up to 3 nested levels, expand/collapse, multi-select).
 *  - FilterBarBlockModel  → horizontal bar (single level; user-chosen skin: pill / segmented / tab).
 * Both share the SAME data path (one GROUP BY :query for counts + `pushFilterMulti` to connected
 * blocks) and the same config pickers/scope-builder — only the render (FilterTreeView vs FilterBarView)
 * and a few style options differ.
 *
 * How it plugs into NocoBase 2.1.19 (/v/ FlowEngine) — verified from source:
 *  - A block appears in the page "Add block" menu automatically when it extends `FilterBlockModel` and
 *    is registered via `flowEngine.registerModels(...)` (BlockGridModel groups add-items by base class;
 *    FilterBlockModel's group label is "Filter blocks"). No explicit initializer list.
 *  - `renderComponent()` returns our JSX; BlockModel wraps it in a card.
 *  - Filtering reuses the page's single `FilterManager` (`this.context.filterManager`): we implement
 *    `getFilterValue()` (returns the selected node value; empty → filter cleared), the user connects
 *    target data blocks via the core `connectFields` flow step (stores {targetId, filterPaths}), and on
 *    click we call `filterManager.refreshTargetsByFilter(this.uid)` which builds a FilterItem
 *    `{ <targetField>: { $eq: value } }` and pushes it to each connected block's resource.
 *  - Group counts come from ONE request: `<collection>:query` with a count measure + the field as a
 *    dimension → `[{ <field>: value, count }]` (SQL GROUP BY). No N-query loop.
 *
 * Config persists as the block's flow stepParams; a `handler` (client-only setProps, safe as auto-apply)
 * mirrors it into `props.ptdlTreeCfg` for render.
 */

// ---- collection / field pickers for the settings dialog (reactive via observer) ----------------
function apiOf(model: any) {
  return model?.context?.api || model?.flowEngine?.context?.api || null;
}

function collLabel(c: any): string {
  const t = c?.title;
  const clean = typeof t === 'string' && !/^\s*\{\{/.test(t) ? t : c?.name;
  return clean && clean !== c?.name ? `${clean} (${c.name})` : c?.name || '';
}
// i18n namespace for this plugin's own labels (registered per-lane via app.i18n.addResources).
export const NS = '@ptdl/plugin-filter-tree/client';

// App i18n translate (injected in registerFilterTree). Resolves the KEY inside {{t("…")}} to the
// current locale (e.g. built-in role titles {{t("Admin")}} → "Quản trị viên"); falls back to the key.
let i18nT: ((k: string) => string) | null = null;
function tr(key: string): string {
  if (!i18nT) return key;
  try {
    const out = i18nT(key);
    return out && typeof out === 'string' ? out : key;
  } catch (_) {
    return key;
  }
}
// Runtime translate for THIS plugin's own render strings (block view/preview) against NS. Injected in
// registerFilterTree; falls back to the English key. `rt()` is used everywhere the render shows text.
let runtimeT: ((s: string) => string) | null = null;
function rt(s: string): string {
  if (!runtimeT) return s;
  try {
    const out = runtimeT(s);
    return out && typeof out === 'string' ? out : s;
  } catch (_) {
    return s;
  }
}
function cleanLabel(l: any, fallback: string): string {
  if (typeof l !== 'string' || !l.trim()) return fallback;
  // NocoBase core titles/enum labels are i18n templates like {{t("Nickname")}} / {{t("Admin")}} —
  // extract the key and translate it (fallback to the key text so we never show the raw template).
  const m = l.match(/\{\{\s*t\(\s*['"]([^'"]+)['"]/);
  if (m) return tr(m[1]);
  if (/\{\{/.test(l)) return fallback; // other template we can't resolve → use the name
  return l;
}
function fieldLabel(f: any): string {
  const title = f?.uiSchema?.title || f?.title;
  const lbl = cleanLabel(title, f?.name);
  return lbl + (lbl !== f?.name ? ` (${f.name})` : '');
}

// Collection fields fetch + per-(ds:collection) cache now comes from @ptdl/shared `getFields`
// (canonical dedup — identical fetch/cache to the former local copy; schema is stable during use).

// Fields that can be a group dimension directly (scalar / select / date / boolean — not relations/json).
const GROUP_BLOCK = new Set(['hasMany', 'belongsTo', 'belongsToMany', 'hasOne', 'password', 'json', 'jsonb', 'virtual', 'point', 'lineString', 'polygon']);
function isGroupableLeaf(f: any): boolean {
  return !!f && !GROUP_BLOCK.has(f.type);
}

// Build antd Cascader options: leaf groupable fields + to-one relations (belongsTo/hasOne) expandable
// ONE hop to their target's groupable fields (→ dot-path like client.gender). NocoBase's `:query` GROUP
// BY only supports a SINGLE relation hop in a dimension — a 2-hop path (a.b.c) errors with "Invalid SQL
// column or table reference" — so we cap at one relation level (filtering could go deeper, counting can't).
const MAX_REL_DEPTH = 1;
const REL_TO_ONE = ['belongsTo', 'hasOne'];
const REL_ALL = ['belongsTo', 'hasOne', 'belongsToMany', 'hasMany'];
// opts.maxDepth = how many relation hops to drill; opts.includeToMany = also drill hasMany/belongsToMany.
// Grouping uses {maxDepth:1, toMany:false} (query GROUP BY only joins 1 to-one hop); the data-scope
// FILTER can go deeper and through to-many, matching NocoBase's native scope picker.
async function buildCascaderOptions(
  api: any,
  collection: string,
  dataSourceKey?: string,
  opts: { maxDepth?: number; includeToMany?: boolean } = {},
  depth = 0,
): Promise<any[]> {
  const maxDepth = opts.maxDepth ?? MAX_REL_DEPTH;
  const relTypes = opts.includeToMany ? REL_ALL : REL_TO_ONE;
  const fields = await getFields(api, collection, dataSourceKey);
  const out: any[] = [];
  for (const f of fields) {
    if (isGroupableLeaf(f)) {
      out.push({ value: f.name, label: fieldLabel(f), isLeaf: true });
    } else if (depth < maxDepth && relTypes.includes(f.type) && f.target) {
      const children = await buildCascaderOptions(api, f.target, dataSourceKey, opts, depth + 1);
      if (children.length) out.push({ value: f.name, label: `${fieldLabel(f)} →`, children });
    }
  }
  return out;
}

// injected apiClient (for pickers, which don't have model context)
let apiClient: any = null;

// ---- data-change bus: re-count a tree when its collection is mutated (create/update/destroy…) ------
const dataListeners = new Map<string, Set<() => void>>();
function notifyCollection(collection: string) {
  dataListeners.get(collection)?.forEach((fn) => {
    try {
      fn();
    } catch (e) {
      /* ignore */
    }
  });
}
function subscribeCollection(collection: string, fn: () => void): () => void {
  if (!collection) return () => {};
  let set = dataListeners.get(collection);
  if (!set) {
    set = new Set();
    dataListeners.set(collection, set);
  }
  set.add(fn);
  return () => set!.delete(fn);
}
// One axios response interceptor: after a successful mutating action on collection X, re-count X's trees.
const MUTATING = /^(create|update|updatemany|destroy|move|firstorcreate|updateorcreate|add|remove|set|toggle|bulk|import)/;
function installDataInterceptor(api: any) {
  const ax = api?.axios;
  if (!ax || ax.__ptdlTreeInterceptor) return;
  try {
    ax.interceptors.response.use((resp: any) => {
      try {
        const url = String(resp?.config?.url || '');
        const m = url.match(/([\w.\-/]+):(\w+)/);
        if (m && MUTATING.test(m[2].toLowerCase())) notifyCollection(m[1].split('/').pop()!.split('.')[0]);
      } catch (e) {
        /* ignore */
      }
      return resp;
    });
    ax.__ptdlTreeInterceptor = true;
  } catch (e) {
    /* ignore */
  }
}

// Server WS push → re-count trees for the changed collections WITHOUT waiting for tab-focus. Covers what
// the own-mutation axios interceptor above can't see: edits by OTHER clients, server-side workflows, and
// computed-cascade writebacks (`hooks:false`). Uses the shared `onLiveRefresh` (both message types).
let treeWsInstalled = false;
function installTreeWs(app: any) {
  if (treeWsInstalled || !app?.ws) return;
  treeWsInstalled = true;
  onLiveRefresh(app, (cols) => {
    if (cols) cols.forEach((c) => notifyCollection(c));
    else dataListeners.forEach((_set, coll) => notifyCollection(coll)); // no list → re-count every tree
  });
}

const PtdlTreeCollection = observer((props: any) => {
  const { value, onChange } = props;
  const [opts, setOpts] = React.useState<any[]>([]);
  React.useEffect(() => {
    let active = true;
    apiClient
      ?.request?.({ url: 'collections:list', params: { pageSize: 500 } })
      .then((res: any) => {
        if (!active) return;
        setOpts(
          (res?.data?.data || [])
            .filter((c: any) => !c.hidden || c.name === value)
            .map((c: any) => ({ value: c.name, label: collLabel(c) }))
            .sort((a: any, b: any) => a.label.localeCompare(b.label)),
        );
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  return (
    <Select showSearch allowClear optionFilterProp="label" placeholder={rt('Select a collection')} style={{ width: '100%' }} value={value || undefined} onChange={(v: any) => onChange?.(v)} options={opts} />
  );
});

// x-reactions that pushes the sibling collectionName/dataSourceKey into a field-picker's component
// props. The group-by picker sits on the SAME tab as the collection Select, so its own
// observer(useForm) can miss the update when the collection changes (it only re-renders reliably via
// an incidental cascade — present in the tree's multi-level flow, absent in the single-level bar).
// A reaction reliably tracks form.values (same mechanism as `rx`), so this guarantees the re-render.
const injectCollection = (field: any) => {
  const coll = field?.form?.values?.collectionName || '';
  const ds = field?.form?.values?.dataSourceKey || 'main';
  try {
    if (typeof field?.setComponentProps === 'function') field.setComponentProps({ collectionName: coll, dataSourceKey: ds });
    else field.componentProps = { ...(field.componentProps || {}), collectionName: coll, dataSourceKey: ds };
  } catch (_) {
    /* ignore */
  }
};

// Group-by picker: a Cascader so the user can pick a scalar field OR drill into a to-one relation to a
// sub-field (e.g. client → gender, stored as the dot-path "client.gender").
const PtdlTreeField = observer((props: any) => {
  const { value, onChange } = props;
  const form: any = useForm();
  const [, force] = React.useReducer((x) => x + 1, 0);
  // The collection Select sits on the SAME tab as this picker. The observer(useForm) read below does
  // not reliably re-render when a sibling value flips from undefined→value (reactive key-add gap), so
  // the picker could stay stuck on "Pick a collection first". Subscribe to the form's value-change
  // events directly and force a re-render — this is the robust part; `injectCollection` (component
  // prop) is a secondary path.
  React.useEffect(() => {
    if (!form?.subscribe) return;
    const id = form.subscribe(({ type }: any) => {
      if (typeof type === 'string' && type.indexOf('alueChange') >= 0) force();
    });
    return () => form?.unsubscribe?.(id);
  }, [form]);
  // Prefer the collection injected via `injectCollection`; fall back to reading the form directly.
  const collection = props.collectionName ?? form?.values?.collectionName;
  const dataSourceKey = props.dataSourceKey ?? form?.values?.dataSourceKey ?? 'main';
  const [options, setOptions] = React.useState<any[]>([]);
  React.useEffect(() => {
    let active = true;
    if (!apiClient?.request || !collection) {
      setOptions([]);
      return;
    }
    buildCascaderOptions(apiClient, collection, dataSourceKey).then((o) => active && setOptions(o));
    return () => {
      active = false;
    };
  }, [collection, dataSourceKey]);
  const val = value ? String(value).split('.') : undefined;
  return (
    <Cascader
      options={options}
      value={val as any}
      onChange={(v: any) => onChange?.(Array.isArray(v) && v.length ? v.join('.') : undefined)}
      placeholder={collection ? rt('Field, or relation → sub-field') : rt('Pick a collection first')}
      style={{ width: '100%' }}
      allowClear
      showSearch
      expandTrigger="hover"
      disabled={!collection}
    />
  );
});

// Multi-field picker for the integrated search box (antd Cascader multiple → array of dot-paths).
const PtdlSearchFields = observer((props: any) => {
  const { value, onChange } = props;
  const form: any = useForm();
  const collection = form?.values?.collectionName;
  const dataSourceKey = form?.values?.dataSourceKey || 'main';
  const [options, setOptions] = React.useState<any[]>([]);
  React.useEffect(() => {
    let active = true;
    if (!apiClient?.request || !collection) {
      setOptions([]);
      return;
    }
    buildCascaderOptions(apiClient, collection, dataSourceKey, { maxDepth: 2, includeToMany: false }).then((o) => active && setOptions(o));
    return () => {
      active = false;
    };
  }, [collection, dataSourceKey]);
  const val = Array.isArray(value) ? value.map((s: string) => String(s).split('.')) : [];
  return (
    <Cascader
      multiple
      options={options}
      value={val as any}
      onChange={(v: any) => onChange?.((Array.isArray(v) ? v : []).map((arr: any[]) => (Array.isArray(arr) ? arr.join('.') : String(arr))))}
      placeholder={collection ? rt('Fields to search (contains)…') : rt('Pick a collection first')}
      style={{ width: '100%' }}
      showSearch
      expandTrigger="hover"
      allowClear
      maxTagCount="responsive"
      disabled={!collection}
    />
  );
});

const NUMERIC_TYPES = new Set(['integer', 'bigInt', 'float', 'double', 'decimal', 'real', 'number']);
const PtdlMetricField = observer((props: any) => {
  const { value, onChange } = props;
  const form: any = useForm();
  const collection = form?.values?.collectionName;
  const dataSourceKey = form?.values?.dataSourceKey || 'main';
  const [opts, setOpts] = React.useState<any[]>([]);
  React.useEffect(() => {
    let active = true;
    if (!apiClient?.request || !collection) {
      setOpts([]);
      return;
    }
    Promise.all([
      apiClient.request({ url: 'collections:get', params: { filterByTk: collection, appends: ['fields'] } }),
      // Which of this collection's fields are @ptdl computed columns (roll-up/formula stored value).
      // OPTIONAL + graceful — no formula plugin / collection → empty set, no badges.
      apiClient.request({ url: 'ptdlComputedRules:list', params: { filter: { collectionName: collection, dataSourceKey, enabled: true }, pageSize: 200 } }).catch(() => null),
    ])
      .then(([res, rulesRes]: any[]) => {
        if (!active) return;
        const computed = new Set((rulesRes?.data?.data || []).map((r: any) => r.targetField));
        // Numbers (sum/avg/min/max) + dates (min/max work on dates too — the common non-numeric agg).
        const fs = (res?.data?.data?.fields || []).filter((f: any) => NUMERIC_TYPES.has(f.type) || DATE_TYPES.has(f.type));
        setOpts(
          fs.map((f: any) => {
            const title = cleanLabel(f?.uiSchema?.title, f.name);
            const base = `${title}${title !== f.name ? ` (${f.name})` : ''}`;
            const tags = [DATE_TYPES.has(f.type) ? `· ${rt('date')}` : '', computed.has(f.name) ? `· ∑ ${rt('computed')}` : ''].filter(Boolean).join(' ');
            return { value: f.name, label: tags ? `${base}  ${tags}` : base };
          }),
        );
      })
      .catch(() => active && setOpts([]));
    return () => {
      active = false;
    };
  }, [collection, dataSourceKey]);
  return <Select showSearch allowClear optionFilterProp="label" placeholder={rt('Field to aggregate (number / date)')} style={{ width: '100%' }} value={value || undefined} onChange={(v: any) => onChange?.(v)} options={opts} disabled={!collection} />;
});

// A tabbed layout for the settings dialog. Each direct child property is a void tab pane; its own
// properties render inside the tab. Void panes are transparent to the value path, so field values
// (collectionName, metric, …) stay flat — defaultParams/handler keep reading them by their plain name.
const PtdlTabs = (props: any) => {
  const schema = useFieldSchema();
  const items: any[] = [];
  schema.mapProperties((tabSchema: any, key: string) => {
    // Render each field of the tab DIRECTLY under its own key (collectionName, fieldPath, …) so its
    // VALUE PATH stays flat (form.values.collectionName). The previous `RecursionField name={key}
    // onlyRenderProperties` nested the value under the tab key → form.values.tabGroup.collectionName,
    // which pickers + handler (reading the flat name) never saw. The tab void itself is transparent,
    // so rendering children by their own name here keeps them at the form root.
    const fields: React.ReactNode[] = [];
    tabSchema.mapProperties((fieldSchema: any, fieldKey: string) => {
      fields.push(<RecursionField key={fieldKey} schema={fieldSchema} name={fieldKey} />);
    });
    items.push({
      key,
      label: tabSchema.title,
      children: <div style={{ paddingTop: 8, maxHeight: 460, overflow: 'auto' }}>{fields}</div>,
    });
  });
  return <Tabs size="small" items={items} {...props} />;
};

// ---- Data scope: a base filter applied to the counts (and to the pushed filters) -----------------
const SCOPE_OPS: Array<{ value: string; label: string; noValue?: boolean; list?: boolean }> = [
  { value: '$eq', label: '=' },
  { value: '$ne', label: '≠' },
  { value: '$includes', label: 'contains' },
  { value: '$notIncludes', label: 'not contains' },
  { value: '$gt', label: '>' },
  { value: '$gte', label: '≥' },
  { value: '$lt', label: '<' },
  { value: '$lte', label: '≤' },
  { value: '$in', label: 'is any of', list: true },
  { value: '$notIn', label: 'is none of', list: true },
  { value: '$dateOn', label: 'is on', date: true },
  { value: '$dateBefore', label: 'is before', date: true },
  { value: '$dateAfter', label: 'is after', date: true },
  { value: '$empty', label: 'is empty', noValue: true },
  { value: '$notEmpty', label: 'is not empty', noValue: true },
];
const SCOPE_OP_META: Record<string, any> = Object.fromEntries(SCOPE_OPS.map((o) => [o.value, o]));

// Which operators make sense for a field type.
const OPS_TEXT = ['$eq', '$ne', '$includes', '$notIncludes', '$empty', '$notEmpty'];
const OPS_NUMBER = ['$eq', '$ne', '$gt', '$gte', '$lt', '$lte', '$empty', '$notEmpty'];
const OPS_DATE = ['$dateOn', '$dateBefore', '$dateAfter', '$empty', '$notEmpty'];
const OPS_BOOL = ['$eq', '$ne'];
const OPS_ENUM = ['$eq', '$ne', '$in', '$notIn', '$empty', '$notEmpty'];

// Relative date presets (server resolves {type,number?,unit?} at query time — verified via :query).
const DATE_PRESETS = [
  { value: 'exact', label: 'Exact date' },
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'tomorrow', label: 'Tomorrow' },
  { value: 'thisWeek', label: 'This week' },
  { value: 'lastWeek', label: 'Last week' },
  { value: 'nextWeek', label: 'Next week' },
  { value: 'thisMonth', label: 'This month' },
  { value: 'lastMonth', label: 'Last month' },
  { value: 'nextMonth', label: 'Next month' },
  { value: 'thisQuarter', label: 'This quarter' },
  { value: 'lastQuarter', label: 'Last quarter' },
  { value: 'thisYear', label: 'This year' },
  { value: 'lastYear', label: 'Last year' },
  { value: 'past', label: 'Past N…' },
  { value: 'next', label: 'Next N…' },
];
const DATE_UNITS = [
  { value: 'day', label: 'days' },
  { value: 'week', label: 'weeks' },
  { value: 'month', label: 'months' },
  { value: 'year', label: 'years' },
];

// Value for a date operator: an exact date STRING, or a relative descriptor OBJECT {type,number?,unit?}.
function ScopeDateValue({ value, onChange, withTime }: { value: any; onChange: (v: any) => void; withTime?: boolean }) {
  const isObj = value && typeof value === 'object';
  const mode = isObj ? value.type : 'exact';
  const setMode = (m: string) => {
    if (m === 'exact') onChange('');
    else if (m === 'past' || m === 'next') onChange({ type: m, number: 7, unit: 'day' });
    else onChange({ type: m });
  };
  return (
    <Space size={4} wrap>
      <Select size="small" style={{ width: 130 }} value={mode} onChange={setMode} options={DATE_PRESETS} />
      {mode === 'exact' && (
        <DatePicker size="small" style={{ width: 150 }} showTime={withTime} value={typeof value === 'string' && value ? dayjs(value) : null} onChange={(_d: any, ds: any) => onChange(typeof ds === 'string' ? ds : '')} />
      )}
      {(mode === 'past' || mode === 'next') && (
        <>
          <InputNumber size="small" style={{ width: 64 }} min={1} value={isObj ? value.number : 7} onChange={(n: any) => onChange({ ...value, number: typeof n === 'number' ? n : 1 })} />
          <Select size="small" style={{ width: 88 }} value={isObj ? value.unit : 'day'} onChange={(u: any) => onChange({ ...value, unit: u })} options={DATE_UNITS} />
        </>
      )}
    </Space>
  );
}

// Variables the SERVER resolves inside a filter (all verified via :query). A Cascader → nested picker
// like NocoBase's native variable menu. Value stored as the template string {{$user.id}} etc.
const VAR_OPTIONS = [
  {
    value: '$user',
    label: 'Current user',
    children: [
      { value: 'id', label: 'ID' },
      { value: 'email', label: 'Email' },
      { value: 'nickname', label: 'Nickname' },
      { value: 'username', label: 'Username' },
      { value: 'phone', label: 'Phone' },
    ],
  },
  { value: '$nRole', label: 'Current role' },
  { value: '$date', label: 'Date', children: [{ value: 'now', label: 'Now' }] },
];
const varToPath = (v: any): string[] | undefined => (isVarValue(v) ? String(v).trim().replace(/^\{\{\s*|\s*\}\}$/g, '').split('.') : undefined);
const pathToVar = (path: string[]): string => `{{${path.join('.')}}}`;
function opsForMeta(meta: any): string[] {
  if (!meta) return OPS_TEXT;
  if (meta.enumMap && meta.enumMap.size) return OPS_ENUM;
  if (meta.type === 'boolean') return OPS_BOOL;
  if (DATE_TYPES.has(meta.type)) return OPS_DATE;
  if (NUMERIC_TYPES.has(meta.type)) return OPS_NUMBER;
  return OPS_TEXT;
}

const isVarValue = (v: any) => typeof v === 'string' && /^\{\{[\s\S]*\}\}$/.test(v.trim());

// A value input for a scope condition, adapting to the field's type/enum, the operator (date presets),
// and a variable toggle (blue 𝑥) to filter by e.g. the current user.
function ScopeValueInput({ meta, op, value, onChange }: { meta: any; op: string; value: any; onChange: (v: any) => void }) {
  const m = SCOPE_OP_META[op];
  if (m?.noValue) return null;
  // Date operators → relative-preset / exact-date picker (server resolves the descriptor).
  if (m?.date) return <ScopeDateValue value={value} onChange={onChange} withTime={meta?.type !== 'dateOnly'} />;

  const type = meta?.type;
  const enumOpts = ((meta?.enumMap ? Array.from(meta.enumMap.entries()) : []) as any[]).map(([v, l]) => ({ value: String(v), label: l }));
  const common = { size: 'small' as const, style: { width: 160 } };
  const varMode = isVarValue(value);
  const varBtn = (
    <Button size="small" type={varMode ? 'primary' : 'text'} title={varMode ? 'Use a fixed value' : 'Use a variable'} style={{ padding: '0 6px', minWidth: 26 }} onClick={() => onChange(varMode ? '' : '{{$user.id}}')}>
      𝑥
    </Button>
  );

  let input: React.ReactNode;
  if (varMode) {
    input = (
      <Cascader
        size="small"
        style={{ width: 190 }}
        options={VAR_OPTIONS}
        value={varToPath(value)}
        onChange={(v: any) => onChange(Array.isArray(v) && v.length ? pathToVar(v) : '')}
        placeholder="variable"
        expandTrigger="hover"
        changeOnSelect={false}
        allowClear={false}
      />
    );
  } else if (m?.list) {
    const arr = value ? String(value).split(',').map((s) => s.trim()).filter(Boolean) : [];
    input = enumOpts.length ? (
      <Select {...common} mode="multiple" placeholder="values" value={arr} onChange={(v: any) => onChange((v || []).join(', '))} options={enumOpts} />
    ) : (
      <Input {...common} placeholder="a, b, c" value={value} onChange={(e: any) => onChange(e.target.value)} />
    );
  } else if (enumOpts.length) {
    input = <Select {...common} showSearch optionFilterProp="label" placeholder="value" value={value || undefined} onChange={(v: any) => onChange(v ?? '')} options={enumOpts} />;
  } else if (type === 'boolean') {
    input = (
      <Space size={6}>
        <Switch size="small" checked={value === 'true'} onChange={(c: boolean) => onChange(c ? 'true' : 'false')} />
        <span style={{ fontSize: 12, color: '#888' }}>{value === 'true' ? 'true' : 'false'}</span>
      </Space>
    );
  } else if (NUMERIC_TYPES.has(type)) {
    input = <InputNumber {...common} placeholder="number" value={value === '' || value == null ? undefined : (Number(value) as any)} onChange={(v: any) => onChange(v == null ? '' : String(v))} />;
  } else {
    input = <Input {...common} placeholder="Enter value" value={value} onChange={(e: any) => onChange(e.target.value)} />;
  }
  // The variable toggle applies to scalar comparisons (not enum multi-select / boolean).
  const showVarBtn = !m?.list && type !== 'boolean' && enumOpts.length === 0;
  return (
    <Space size={2}>
      {input}
      {showVarBtn ? varBtn : null}
    </Space>
  );
}

// Best-effort value coercion (no field type here): numeric string → number, true/false → boolean.
function scopeCoerce(raw: any) {
  const t = String(raw ?? '').trim();
  if (t !== '' && Number.isFinite(Number(t)) && /^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  if (t === 'true') return true;
  if (t === 'false') return false;
  return raw;
}
// Nest an operator object by a dot path: ('client.gender', {$eq:'m'}) → {client:{gender:{$eq:'m'}}}.
function nestByPath(pathStr: string, leafOp: any): any {
  const parts = String(pathStr).split('.');
  let obj = leafOp;
  for (let i = parts.length - 1; i >= 0; i--) obj = { [parts[i]]: obj };
  return obj;
}

type ScopeCond = { field: string; op: string; value: any };
// The final value for an operator: array (list), object/string as-is (date descriptor), variable
// template as-is (server resolves), else coerced scalar.
function leafValueFor(op: string, raw: any): any {
  const meta = SCOPE_OP_META[op];
  if (meta?.noValue) return true;
  if (meta?.list) {
    if (Array.isArray(raw)) return raw;
    return String(raw || '').split(',').map((s) => scopeCoerce(s.trim())).filter((s) => s !== '');
  }
  if (meta?.date) return raw; // exact date string or {type,number?,unit?} descriptor
  if (isVarValue(raw)) return String(raw).trim();
  return scopeCoerce(raw);
}
function encodeScope(conj: string, conds: ScopeCond[]): string {
  const parts = conds.filter((c) => c.field && c.op).map((c) => nestByPath(c.field, { [c.op]: leafValueFor(c.op, c.value) }));
  if (!parts.length) return '';
  return JSON.stringify({ [conj]: parts });
}
function decodeScope(json?: string): { conj: string; conds: ScopeCond[] } | null {
  if (!json || !json.trim()) return { conj: '$and', conds: [] };
  let obj: any;
  try {
    obj = JSON.parse(json);
  } catch (e) {
    return null;
  }
  const conj = obj?.$and ? '$and' : obj?.$or ? '$or' : null;
  if (!conj || !Array.isArray(obj[conj])) return null;
  const conds: ScopeCond[] = [];
  for (const item of obj[conj]) {
    if (!item || typeof item !== 'object') return null;
    // Un-nest a dot path: {client:{gender:{$eq:v}}} → field "client.gender", op "$eq", value v.
    let node: any = item;
    let field = '';
    let op = '';
    let value: any = '';
    while (node && typeof node === 'object') {
      const k = Object.keys(node)[0];
      if (!k) return null;
      if (k.startsWith('$')) {
        op = k;
        value = node[k];
        break;
      }
      field = field ? `${field}.${k}` : k;
      node = node[k];
    }
    if (!field || !op) return null;
    if (Array.isArray(value)) value = value.join(', ');
    else if (typeof value === 'boolean') value = '';
    else if (value && typeof value === 'object') {
      // keep date-descriptor objects ({type,number?,unit?}) as-is for the date value picker
    } else value = value == null ? '' : String(value);
    conds.push({ field, op, value });
  }
  return { conj, conds };
}

const PtdlScopeBuilder = observer((props: any) => {
  const { value, onChange } = props;
  const form: any = useForm();
  const collection = form?.values?.collectionName;
  const dataSourceKey = form?.values?.dataSourceKey || 'main';
  const [fields, setFields] = React.useState<any[]>([]);
  const initial = React.useMemo(() => decodeScope(value), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [conj, setConj] = React.useState<string>(initial?.conj || '$and');
  const [conds, setConds] = React.useState<ScopeCond[]>(initial?.conds || []);
  const [advanced, setAdvanced] = React.useState(initial === null);
  const lastEmit = React.useRef<string>(value || '');

  React.useEffect(() => {
    if ((value || '') === lastEmit.current) return;
    const d = decodeScope(value);
    if (d) {
      setConj(d.conj);
      setConds(d.conds);
      setAdvanced(false);
    } else setAdvanced(true);
    lastEmit.current = value || '';
  }, [value]);

  const [fieldOptions, setFieldOptions] = React.useState<any[]>([]);
  React.useEffect(() => {
    let active = true;
    if (!apiClient?.request || !collection) {
      setFieldOptions([]);
      return;
    }
    // Deeper cascader (relations + to-many) — the scope FILTER can traverse relations, e.g.
    // Created by → Roles → Role name (unlike grouping, which is capped at 1 to-one hop).
    buildCascaderOptions(apiClient, collection, dataSourceKey, { maxDepth: 3, includeToMany: true }).then((o) => active && setFieldOptions(o));
    return () => {
      active = false;
    };
  }, [collection, dataSourceKey]);

  // Resolve the leaf type/enum of each selected (dot-path) field, so operators + value input adapt.
  const [metaCache, setMetaCache] = React.useState<Record<string, FieldMeta>>({});
  const fieldsKey = conds.map((c) => c.field).filter(Boolean).join('|');
  React.useEffect(() => {
    if (!apiClient?.request || !collection) return;
    const need = Array.from(new Set(conds.map((c) => c.field).filter((f) => f && !metaCache[f])));
    if (!need.length) return;
    const cfg2: TreeCfg = { collectionName: collection, dataSourceKey };
    Promise.all(need.map((f) => resolveMeta(apiClient, cfg2, f).then((m) => [f, m] as [string, FieldMeta]))).then((pairs) => {
      const merged: Record<string, FieldMeta> = { ...metaCache };
      pairs.forEach(([f, m]) => (merged[f] = m));
      setMetaCache(merged);
      // Auto-fix operators that don't fit the just-resolved field type (e.g. date field → $dateOn).
      let changed = false;
      const fixed = conds.map((c) => {
        const meta = merged[c.field];
        if (!meta || !c.op) return c;
        const allowed = opsForMeta(meta);
        if (!allowed.includes(c.op)) {
          changed = true;
          return { ...c, op: allowed[0], value: '' };
        }
        return c;
      });
      if (changed) apply(conj, fixed);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldsKey, collection, dataSourceKey]);

  const emit = (nc: string, ncs: ScopeCond[]) => {
    const json = encodeScope(nc, ncs);
    lastEmit.current = json;
    onChange?.(json);
  };
  const apply = (nc: string, ncs: ScopeCond[]) => {
    setConj(nc);
    setConds(ncs);
    emit(nc, ncs);
  };

  if (advanced) {
    return (
      <div>
        <Input.TextArea rows={3} value={value} placeholder={'{"$and":[{"status":{"$eq":"pending"}}]}'} onChange={(e: any) => { lastEmit.current = e.target.value; onChange?.(e.target.value); }} />
        <a style={{ fontSize: 12 }} onClick={() => setAdvanced(false)}>← Back to visual builder</a>
      </div>
    );
  }
  if (!collection) return <span style={{ color: '#999', fontSize: 12 }}>Pick a collection first.</span>;
  return (
    <div>
      <div style={{ marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: '#888', marginRight: 8 }}>Meet</span>
        <Select size="small" value={conj} style={{ width: 110 }} onChange={(v: any) => apply(v, conds)} options={[{ value: '$and', label: 'All' }, { value: '$or', label: 'Any' }]} />
        <span style={{ fontSize: 12, color: '#888', marginLeft: 8 }}>conditions</span>
      </div>
      <Space direction="vertical" style={{ width: '100%' }} size={6}>
        {conds.map((c, i) => {
          const fmeta = metaCache[c.field];
          const allowed = opsForMeta(fmeta);
          const opOptions = SCOPE_OPS.filter((o) => allowed.includes(o.value)).map((o) => ({ value: o.value, label: o.label }));
          return (
            <Space key={i} align="center" wrap>
              <Cascader
                size="small"
                style={{ width: 220 }}
                options={fieldOptions}
                value={c.field ? c.field.split('.') : undefined}
                onChange={(v: any) => {
                  // Reset op/value on field change (its type — hence valid ops — likely differs).
                  apply(conj, conds.map((x, j) => (j === i ? { field: Array.isArray(v) && v.length ? v.join('.') : '', op: '$eq', value: '' } : x)));
                }}
                placeholder="Select field"
                showSearch
                expandTrigger="hover"
                changeOnSelect={false}
              />
              <Select size="small" style={{ width: 140 }} value={c.op} onChange={(v: any) => apply(conj, conds.map((x, j) => (j === i ? { ...x, op: v } : x)))} options={opOptions} />
              <ScopeValueInput meta={fmeta} op={c.op} value={c.value} onChange={(nv) => apply(conj, conds.map((x, j) => (j === i ? { ...x, value: nv } : x)))} />
              <Button size="small" type="text" danger onClick={() => apply(conj, conds.filter((_, j) => j !== i))}>✕</Button>
            </Space>
          );
        })}
      </Space>
      <div style={{ marginTop: 8 }}>
        <Button size="small" type="dashed" onClick={() => apply(conj, [...conds, { field: '', op: '$eq', value: '' }])}>+ Add condition</Button>
        <a style={{ fontSize: 12, marginLeft: 12 }} onClick={() => setAdvanced(true)}>Advanced (raw JSON)</a>
      </div>
    </div>
  );
});

// ---- icon (from the shared @ptdl/plugin-custom-icons registry — consumer, no bundling) ----------
// IconByKey + RegistryIconPicker now come from @ptdl/shared (registry wired via setIconRegistry in
// registerFilterTree). The shared IconByKey takes only {type}; StyledIcon re-applies the per-value
// color / size by wrapping it in a span — lucide icons use width/height:1em + stroke:currentColor,
// so color and fontSize inherit and the visual result is identical to the old style-on-icon path.
function StyledIcon({ type, style }: { type?: string; style?: any }) {
  if (!type) return null;
  return <span style={style}><IconByKey type={type} /></span>;
}

// ---- per-value icon + color editor (settings dialog) -------------------------------------------
type ValueStyle = { icon?: string; color?: string };

const PtdlValueStyles = observer((props: any) => {
  const { value, onChange } = props;
  const form: any = useForm();
  const collection = form?.values?.collectionName;
  const field = form?.values?.fieldPath;
  const dataSourceKey = form?.values?.dataSourceKey || 'main';
  const [values, setValues] = React.useState<any[]>([]);
  const [labels, setLabels] = React.useState<Map<string, string>>(new Map());
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    if (!apiClient?.request || !collection || !field) {
      setValues([]);
      return;
    }
    setLoading(true);
    Promise.all([
      fetchGroupCounts(apiClient, { dataSourceKey, collectionName: collection, fieldPath: field }),
      fetchEnumLabels(apiClient, { dataSourceKey, collectionName: collection, fieldPath: field }),
    ])
      .then(([rows, l]) => {
        if (!active) return;
        setValues(rows.map((r) => r.value));
        setLabels(l);
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [collection, field, dataSourceKey]);

  const map: Record<string, ValueStyle> = value || {};
  const setOne = (key: string, patch: ValueStyle) => onChange?.({ ...map, [key]: { ...(map[key] || {}), ...patch } });

  if (!collection || !field) return <span style={{ color: '#999', fontSize: 12 }}>Pick a collection + group field first.</span>;
  if (loading && !values.length) return <Spin size="small" />;
  if (!values.length) return <span style={{ color: '#999', fontSize: 12 }}>No values found to style.</span>;

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={6}>
      {values.map((v, i) => {
        const key = String(v);
        const st = map[key] || {};
        const label = labels.get(key) ?? (v == null ? '(empty)' : key);
        return (
          <Space key={i} align="center">
            <RegistryIconPicker value={st.icon} onChange={(ic) => setOne(key, { icon: ic })} />
            <ColorField size="small" value={st.color || undefined} onChange={(c: any) => setOne(key, { color: c })} />
            <StyledIcon type={st.icon} style={{ color: st.color || undefined }} />
            <span style={{ color: st.color || undefined }}>{label}</span>
          </Space>
        );
      })}
    </Space>
  );
});

// ---- the tree view -----------------------------------------------------------------------------
type TreeCfg = {
  dataSourceKey?: string;
  collectionName?: string;
  fieldPath?: string;
  level2Field?: string;
  level3Field?: string;
  scopeFilter?: string;
  valueStyles?: Record<string, ValueStyle>;
  badgeMode?: 'colorful' | 'mono';
  badgeColor?: string;
  metric?: 'count' | 'sum' | 'avg' | 'min' | 'max';
  metricField?: string;
  dateGranularity?: 'day' | 'month' | 'year';
  numFmt?: 'plain' | 'comma' | 'compact';
  numPrefix?: string;
  numSuffix?: string;
  numDecimals?: number;
  // ---- horizontal "Filter bar" render (FilterBarBlockModel) — single level, same data engine -----
  barStyle?: 'pill' | 'segmented' | 'tab';
  barSize?: 'small' | 'default';
  barAlign?: 'left' | 'center' | 'right';
  showCounts?: boolean; // show the metric badge on each item (default true)
  showAllPill?: boolean; // show the leading "All" item (default true)
  barMultiSelect?: boolean; // pill style only: click toggles, multiple values OR-ed
  // ---- integrated free-text search (available on BOTH tree and bar) -------------------------------
  showSearch?: boolean; // show the search input
  searchFields?: string[]; // fields the text searches (contains, OR'd); dot-paths allowed
  searchPlaceholder?: string;
  searchLayout?: 'above' | 'below' | 'left' | 'right'; // bar: search position relative to the bar
  searchWidth?: number; // px width of the search box (default ~260)
  // ---- extra UX (both blocks) --------------------------------------------------------------------
  showReset?: boolean; // show a "reset" button that clears the selection + search
  resetLabel?: string;
  hideEmpty?: boolean; // hide the null / (empty) group value
};

// The data-scope base filter (a NocoBase filter object), or undefined.
function scopeOf(cfg: TreeCfg): any {
  if (!cfg?.scopeFilter) return undefined;
  try {
    const f = JSON.parse(cfg.scopeFilter);
    return f && typeof f === 'object' && Object.keys(f).length ? f : undefined;
  } catch (e) {
    return undefined;
  }
}

// The aggregate measure: count (default) or sum/avg/min/max of a numeric field. One SQL GROUP BY either way.
function measureOf(cfg: TreeCfg) {
  if (cfg.metric && cfg.metric !== 'count' && cfg.metricField) {
    return { field: cfg.metricField, aggregation: cfg.metric, alias: 'value' };
  }
  return { field: 'id', aggregation: 'count', alias: 'value' };
}

async function fetchGroupCounts(api: any, cfg: TreeCfg): Promise<Array<{ value: any; metric: number }>> {
  if (!api?.request || !cfg?.collectionName || !cfg?.fieldPath) return [];
  const headers = cfg.dataSourceKey && cfg.dataSourceKey !== 'main' ? { 'X-Data-Source': cfg.dataSourceKey } : undefined;
  try {
    const scope = scopeOf(cfg);
    const res = await api.request({
      method: 'POST',
      url: `${cfg.collectionName}:query`,
      headers,
      data: { measures: [measureOf(cfg)], dimensions: [{ field: cfg.fieldPath }], ...(scope ? { filter: scope } : {}) },
    });
    const rows = res?.data?.data || res?.data || [];
    return (Array.isArray(rows) ? rows : []).map((r: any) => ({ value: r?.[cfg.fieldPath!], metric: Number(r?.value) || 0 }));
  } catch (e) {
    return [];
  }
}

// Combine group values into the "All" total. avg is not combinable from per-group averages → null.
function reduceTotal(metric: string | undefined, rows: Array<{ metric: number }>): number | null {
  const vals = rows.map((r) => r.metric).filter((v) => typeof v === 'number' && !isNaN(v));
  if (!vals.length) return null;
  if (metric === 'min') return Math.min(...vals);
  if (metric === 'max') return Math.max(...vals);
  if (metric === 'avg') return null;
  return vals.reduce((s, v) => s + v, 0); // count, sum
}

// Selected value per block, kept OUTSIDE model props so it is EPHEMERAL — saving the block config or
// reloading (F5) must not freeze a selection; a fresh load defaults to "All".
const selectionMap = new Map<string, any>();

function fmtValue(n: number | null, cfg: TreeCfg): string {
  if (n == null) return '';
  const dec = cfg.numDecimals;
  let s: string;
  try {
    if (cfg.numFmt === 'compact') {
      s = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: dec ?? 1 }).format(n);
    } else if (cfg.numFmt === 'comma') {
      s = new Intl.NumberFormat(undefined, { maximumFractionDigits: dec ?? 2, minimumFractionDigits: dec ?? 0 }).format(n);
    } else {
      s = new Intl.NumberFormat(undefined, { useGrouping: false, maximumFractionDigits: dec ?? 2, minimumFractionDigits: dec ?? 0 }).format(n);
    }
  } catch (e) {
    s = String(n);
  }
  return `${cfg.numPrefix || ''}${s}${cfg.numSuffix || ''}`;
}

// A hex color → a translucent tint (for the active row background). Non-hex (rgba/var) → undefined.
function tint(color?: string, alpha = 0.15): string | undefined {
  if (!color || !color.startsWith('#')) return undefined;
  let r: number, g: number, b: number;
  if (color.length === 7) {
    r = parseInt(color.slice(1, 3), 16);
    g = parseInt(color.slice(3, 5), 16);
    b = parseInt(color.slice(5, 7), 16);
  } else if (color.length === 4) {
    r = parseInt(color[1] + color[1], 16);
    g = parseInt(color[2] + color[2], 16);
    b = parseInt(color[3] + color[3], 16);
  } else return undefined;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Map raw value → display label using a field's uiSchema.enum, if any.
async function fetchEnumLabels(api: any, cfg: TreeCfg, fieldName?: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const fn = fieldName || cfg?.fieldPath;
  if (!api?.request || !cfg?.collectionName || !fn) return map;
  try {
    const res = await api.request({ url: 'collections:get', params: { filterByTk: cfg.collectionName, appends: ['fields'] } });
    const field = (res?.data?.data?.fields || []).find((f: any) => f.name === fn);
    for (const e of field?.uiSchema?.enum || []) {
      if (e && e.value != null) map.set(String(e.value), cleanLabel(e.label, String(e.value)));
    }
  } catch (e) {
    /* ignore */
  }
  return map;
}

// The ordered group levels: fieldPath (level 1) + optional level 2 / level 3.
function groupFieldsOf(cfg: TreeCfg): string[] {
  return [cfg.fieldPath, cfg.level2Field, cfg.level3Field].filter(Boolean) as string[];
}

// Fetch leaf rows with ALL group dimensions + the metric value (one GROUP BY). Date dimensions get a
// `format` so they bucket by day/month/year instead of one group per exact timestamp.
async function fetchGroupRows(api: any, cfg: TreeCfg, gf: string[], metas: FieldMeta[], gran?: string): Promise<any[]> {
  if (!api?.request || !cfg?.collectionName || !gf.length) return [];
  const headers = cfg.dataSourceKey && cfg.dataSourceKey !== 'main' ? { 'X-Data-Source': cfg.dataSourceKey } : undefined;
  try {
    const dims = gf.map((f, i) => (metas[i] && DATE_TYPES.has(metas[i].type) ? { field: f, format: dateFormatFor(gran) } : { field: f }));
    const scope = scopeOf(cfg);
    const res = await api.request({
      method: 'POST',
      url: `${cfg.collectionName}:query`,
      headers,
      data: { measures: [measureOf(cfg)], dimensions: dims, ...(scope ? { filter: scope } : {}) },
    });
    const rows = res?.data?.data || res?.data || [];
    return Array.isArray(rows) ? rows : [];
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.warn('[filter-tree] group query failed', gf, e?.response?.data?.errors?.[0]?.message || e?.message);
    return [];
  }
}

function reduceMetric(metric: string | undefined, vals: number[]): number | null {
  const v = vals.filter((x) => typeof x === 'number' && !isNaN(x));
  if (!v.length) return null;
  if (metric === 'min') return Math.min(...v);
  if (metric === 'max') return Math.max(...v);
  if (metric === 'avg') return null; // averages don't combine
  return v.reduce((s, x) => s + x, 0);
}

const DATE_TYPES = new Set(['date', 'dateOnly', 'datetime', 'datetimeNoTz', 'datetimeTz', 'unixTimestamp']);
type FieldMeta = { name: string; type: string; enumMap: Map<string, string> };

// Resolve a (possibly dotted) group path to the LEAF field's type + enum, walking relations.
async function resolveMeta(api: any, cfg: TreeCfg, dotPath: string): Promise<FieldMeta> {
  const parts = String(dotPath).split('.');
  let coll: string | undefined = cfg.collectionName;
  let field: any;
  for (let i = 0; i < parts.length; i++) {
    if (!coll) break;
    const fields = await getFields(api, coll, cfg.dataSourceKey);
    field = fields.find((f: any) => f.name === parts[i]);
    if (!field) break;
    if (i < parts.length - 1) coll = field.target;
  }
  const enumMap = new Map<string, string>();
  for (const e of field?.uiSchema?.enum || []) if (e && e.value != null) enumMap.set(String(e.value), cleanLabel(e.label, String(e.value)));
  return { name: dotPath, type: field?.type || 'string', enumMap };
}

// Field type + enum labels for each group level (supports dot paths like client.gender).
async function fetchFieldMetas(api: any, cfg: TreeCfg, gf: string[]): Promise<FieldMeta[]> {
  if (!api?.request || !cfg?.collectionName || !gf.length) return gf.map((name) => ({ name, type: 'string', enumMap: new Map<string, string>() }));
  return Promise.all(gf.map((p) => resolveMeta(api, cfg, p)));
}

// A value → display label: enum label → boolean Yes/No → raw (dates are already bucketed strings).
function labelFor(meta: FieldMeta | undefined, value: any): string {
  if (value == null || value === '') return rt('(empty)');
  const s = String(value);
  if (meta?.enumMap.has(s)) return meta.enumMap.get(s) as string;
  if (meta?.type === 'boolean') return s === '1' || s === 'true' ? 'Yes' : s === '0' || s === 'false' ? 'No' : s;
  // Some collections store the group value itself as an i18n template (e.g. built-in role titles
  // {{t("Admin")}}) — resolve/translate it instead of printing the raw template.
  return cleanLabel(s, s);
}

function dateFormatFor(gran?: string): string {
  return gran === 'year' ? 'YYYY' : gran === 'day' ? 'YYYY-MM-DD' : 'YYYY-MM'; // default month
}

// A date bucket string → [startInclusive, endExclusive) date-only strings.
function dateRange(gran: string | undefined, bucket: string): [string, string] {
  const p = String(bucket).split('-').map((x) => parseInt(x, 10));
  const pad = (n: number) => String(n).padStart(2, '0');
  if (gran === 'year') return [`${p[0]}-01-01`, `${p[0] + 1}-01-01`];
  if (gran === 'day') {
    const d = new Date(Date.UTC(p[0], (p[1] || 1) - 1, p[2] || 1));
    d.setUTCDate(d.getUTCDate() + 1);
    return [`${p[0]}-${pad(p[1])}-${pad(p[2])}`, `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`];
  }
  const m = p[1] || 1;
  const ny = m === 12 ? p[0] + 1 : p[0];
  const nm = m === 12 ? 1 : m + 1;
  return [`${p[0]}-${pad(m)}-01`, `${ny}-${pad(nm)}-01`];
}

// One filter condition for a value at a level. The leaf operator depends on type (date→range,
// boolean→bool, else→$eq); the meta.name may be a dot path → nest it, e.g. client.gender →
// { client: { gender: { $eq: value } } }.
function condFor(meta: FieldMeta | undefined, gran: string | undefined, value: any): any {
  let leaf: any;
  if (meta && DATE_TYPES.has(meta.type)) {
    const [start, end] = dateRange(gran, value);
    leaf = { $gte: start, $lt: end };
  } else if (meta?.type === 'boolean') {
    leaf = { $eq: String(value) === '1' || String(value) === 'true' };
  } else {
    leaf = { $eq: value };
  }
  const parts = String(meta?.name || '').split('.');
  let obj = leaf;
  for (let i = parts.length - 1; i >= 0; i--) obj = { [parts[i]]: obj };
  return obj;
}

type TreeNode = { key: string; value: any; label: string; metric: number | null; path: any[]; children: TreeNode[] };

// Build a nested tree from flat leaf rows; compute parent metrics by reducing descendants.
function buildTree(rows: any[], gf: string[], metas: FieldMeta[], metric: string | undefined): TreeNode[] {
  const roots: TreeNode[] = [];
  const index = new Map<string, TreeNode>();
  const SEP = '';
  for (const row of rows) {
    let level = roots;
    const acc: any[] = [];
    for (let i = 0; i < gf.length; i++) {
      const v = row[gf[i]];
      acc.push(v);
      const pk = acc.map(String).join(SEP);
      let node = index.get(pk);
      if (!node) {
        node = { key: pk, value: v, label: labelFor(metas[i], v), metric: null, path: acc.slice(), children: [] };
        index.set(pk, node);
        level.push(node);
      }
      if (i === gf.length - 1) node.metric = Number(row.value) || 0; // leaf
      level = node.children;
    }
  }
  const fill = (node: TreeNode): number | null => {
    if (!node.children.length) return node.metric;
    const childVals = node.children.map(fill).filter((x): x is number => typeof x === 'number');
    node.metric = reduceMetric(metric, childVals);
    return node.metric;
  };
  roots.forEach(fill);
  return roots;
}

// Push the current selection to the connected data blocks. Each selected node's path is an AND of its
// per-level conditions; multiple selected nodes are OR-ed. FilterManager only carries a single value,
// so we push the compound filter directly (under our own key), reading target ids from the connect config.
function pushFilterMulti(model: any, metas: FieldMeta[], gran: string | undefined, paths: any[][]) {
  try {
    const fm = model.context?.filterManager;
    const engine = model.context?.engine || model.flowEngine || fm?.context?.engine;
    const targets = fm?.getConnectFieldsConfig?.(model.uid)?.targets || [];
    const key = `ptdl-tree:${model.uid}`;
    const orParts = (paths || [])
      .filter((p) => p && p.length)
      .map((path) => {
        const conds = path.map((v: any, i: number) => condFor(metas[i], gran, v));
        return conds.length === 1 ? conds[0] : { $and: conds };
      });
    const filter = !orParts.length ? null : orParts.length === 1 ? orParts[0] : { $or: orParts };
    for (const tgt of targets) {
      const res = engine?.getModel?.(tgt.targetId)?.resource;
      if (!res?.addFilterGroup) continue;
      if (!filter) res.removeFilterGroup?.(key);
      else res.addFilterGroup(key, filter);
      res.setPage?.(1);
      res.refresh?.();
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[filter-tree] push failed', e);
  }
}

// Push a free-text search across configured fields as a SEPARATE filter group (key `ptdl-search:uid`),
// so it AND-combines with the group selection at the target resource. Empty text clears just this group.
// Available on BOTH blocks (tree + bar); dot-path fields (relations) are nested via nestByPath.
function pushSearchFilter(model: any, text: string, searchFields: string[]) {
  try {
    const fm = model.context?.filterManager;
    const engine = model.context?.engine || model.flowEngine || fm?.context?.engine;
    const targets = fm?.getConnectFieldsConfig?.(model.uid)?.targets || [];
    const key = `ptdl-search:${model.uid}`;
    const q = String(text || '').trim();
    const fields = (searchFields || []).filter(Boolean);
    const parts = q && fields.length ? fields.map((f) => nestByPath(f, { $includes: q })) : [];
    const filter = !parts.length ? null : parts.length === 1 ? parts[0] : { $or: parts };
    for (const tgt of targets) {
      const res = engine?.getModel?.(tgt.targetId)?.resource;
      if (!res?.addFilterGroup) continue;
      if (!filter) res.removeFilterGroup?.(key);
      else res.addFilterGroup(key, filter);
      res.setPage?.(1);
      res.refresh?.();
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[filter-tree] search push failed', e);
  }
}

// The debounced search input shared by both views. Local (ephemeral) text state — like the selection,
// it resets on reload; typing pushes/clears the `ptdl-search:*` filter group on connected blocks.
// Controlled: the parent owns `value` (so a Reset button can clear it); this box only debounces the
// push of the search filter to connected blocks.
function FilterSearchBox({ model, cfg, size = 'middle', value, onChange, style }: { model: any; cfg: TreeCfg; size?: 'small' | 'middle' | 'large'; value: string; onChange: (v: string) => void; style?: any }) {
  const timer = React.useRef<any>(null);
  const push = (v: string) => pushSearchFilter(model, v, cfg.searchFields || []);
  React.useEffect(() => () => timer.current && clearTimeout(timer.current), []);
  const handle = (e: any) => {
    const v = e.target.value;
    onChange(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => push(v), 300);
  };
  return (
    <Input.Search
      allowClear
      size={size}
      value={value}
      placeholder={cfg.searchPlaceholder || rt('Search…')}
      onChange={handle}
      onSearch={(v: string) => {
        if (timer.current) clearTimeout(timer.current);
        push(v);
      }}
      style={{ maxWidth: 320, width: '100%', ...style }}
    />
  );
}

// A small "reset" button — clears both the group selection and the search text. Always shown (icon
// always visible); DISABLED when there's nothing to reset. Shared by both views.
function ResetFilterButton({ label, onReset, size, disabled }: { label?: string; onReset: () => void; size?: 'small' | 'middle' | 'large'; disabled?: boolean }) {
  return (
    <Button
      size={size === 'small' ? 'small' : 'middle'}
      type="text"
      disabled={disabled}
      onClick={onReset}
      icon={<span style={{ fontSize: 13, display: 'inline-block', lineHeight: 1 }}>↺</span>}
      style={{ color: disabled ? undefined : 'var(--colorTextSecondary, #666)', paddingInline: 8, flex: 'none' }}
    >
      {label || rt('Reset')}
    </Button>
  );
}

function FilterTreeView({ model, cfg }: { model: any; cfg: TreeCfg }) {
  const [, force] = React.useReducer((x) => x + 1, 0);
  const gf = groupFieldsOf(cfg);
  const nested = gf.length > 1;
  const selected = selectionMap.get(model.uid);
  const [roots, setRoots] = React.useState<TreeNode[]>([]);
  const [metas, setMetas] = React.useState<FieldMeta[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [searchText, setSearchText] = React.useState('');
  const cfgKey = `${cfg.dataSourceKey}|${cfg.collectionName}|${gf.join(',')}|${cfg.metric}|${cfg.metricField}|${cfg.dateGranularity}|${cfg.scopeFilter}`;

  const load = React.useCallback(() => {
    const api = apiOf(model);
    setLoading(true);
    (async () => {
      const m = await fetchFieldMetas(api, cfg, gf);
      setMetas(m);
      const rows = await fetchGroupRows(api, cfg, gf, m, cfg.dateGranularity);
      setRoots(buildTree(rows, gf, m, cfg.metric));
    })().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfgKey]);

  React.useEffect(() => {
    load();
  }, [load]);

  // Live re-count: refresh when this collection is mutated anywhere in the app, and on tab focus.
  React.useEffect(() => {
    const unsub = subscribeCollection(cfg.collectionName || '', load);
    const onFocus = () => load();
    if (typeof window !== 'undefined') window.addEventListener('focus', onFocus);
    return () => {
      unsub();
      if (typeof window !== 'undefined') window.removeEventListener('focus', onFocus);
    };
  }, [cfg.collectionName, load]);

  const toggle = (key: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });

  // Selection = a set of node paths (ephemeral). Multiple = Ctrl/Cmd-click toggle or Shift-click range.
  const selectedPaths: any[][] = Array.isArray(selectionMap.get(model.uid)) ? selectionMap.get(model.uid) : [];
  const lastIdxRef = React.useRef<number | null>(null);
  const samePath = (a: any[], b: any[]) => a.length === b.length && a.every((v, i) => String(v) === String(b[i]));
  const isSelected = (path: any[]) => selectedPaths.some((p) => samePath(p, path));

  const apply = (paths: any[][]) => {
    const clean = (paths || []).filter((p) => p && p.length);
    if (!clean.length) selectionMap.delete(model.uid);
    else selectionMap.set(model.uid, clean);
    force();
    pushFilterMulti(model, metas, cfg.dateGranularity, clean);
  };
  const doReset = () => {
    apply([]);
    setSearchText('');
    pushSearchFilter(model, '', cfg.searchFields || []);
  };

  if (loading && !roots.length) return <Spin size="small" style={{ margin: 12 }} />;
  if (!roots.length)
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={<span style={{ fontSize: 12 }}>{rt("No groups. Use a status / select / number / date field (relation fields can't be grouped).")}</span>}
      />
    );

  const GREY = 'var(--colorFillSecondary, #f0f0f0)';
  const styles = cfg.valueStyles || {};
  const total = reduceMetric(cfg.metric, roots.map((r) => r.metric).filter((x): x is number => typeof x === 'number'));
  // Accent: mono → one color; colorful → level-1 value color (deeper levels have no per-value color).
  const accentOf = (depth: number, value?: any) => (cfg.badgeMode === 'mono' ? cfg.badgeColor : depth === 0 ? styles[String(value)]?.color : undefined) || undefined;

  // Flatten visible (expanded) nodes for Shift-range selection.
  const visibleFlat: TreeNode[] = [];
  const collect = (nodes: TreeNode[]) => nodes.forEach((n) => { visibleFlat.push(n); if (n.children.length && expanded.has(n.key)) collect(n.children); });
  collect(roots);

  const onNodeClick = (node: TreeNode, e: any) => {
    const idx = visibleFlat.findIndex((n) => n.key === node.key);
    if (e?.shiftKey && lastIdxRef.current != null) {
      const lo = Math.min(lastIdxRef.current, idx);
      const hi = Math.max(lastIdxRef.current, idx);
      apply(visibleFlat.slice(lo, hi + 1).map((n) => n.path));
      return;
    }
    if (e?.ctrlKey || e?.metaKey) {
      const exists = selectedPaths.some((p) => samePath(p, node.path));
      apply(exists ? selectedPaths.filter((p) => !samePath(p, node.path)) : [...selectedPaths, node.path]);
      lastIdxRef.current = idx;
      return;
    }
    apply([node.path]);
    lastIdxRef.current = idx;
  };

  const RowInner = ({ label, badgeText, active, icon, color, accent, depth, hasChildren, open, onToggle, onClick }: any) => {
    const badgeBg = accent || GREY;
    const activeBg = active ? tint(accent) || 'var(--colorPrimaryBg, #e6f4ff)' : 'transparent';
    return (
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 4, width: '100%', minWidth: 0, boxSizing: 'border-box', borderRadius: 6, background: activeBg, paddingLeft: 4 + depth * 14 }}
      >
        {hasChildren ? (
          <span onClick={(e: any) => { e.stopPropagation(); onToggle(); }} style={{ cursor: 'pointer', width: 16, textAlign: 'center', color: '#999', flex: 'none', userSelect: 'none' }}>
            {open ? '▾' : '▸'}
          </span>
        ) : (
          <span style={{ width: depth > 0 || hasChildrenAnywhere(roots) ? 16 : 0, flex: 'none' }} />
        )}
        <div onClick={(e: any) => onClick?.(e)} style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 auto', minWidth: 0, cursor: 'pointer', padding: '6px 8px 6px 0', fontWeight: active ? 600 : 400 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, overflow: 'hidden', minWidth: 0, flex: '1 1 auto' }}>
            {icon ? <StyledIcon type={icon} style={{ color: color || undefined, fontSize: 15, flex: 'none' }} /> : null}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, color: color || (active ? 'var(--colorPrimary, #1677ff)' : undefined) }}>{label}</span>
          </span>
          {badgeText !== '' && badgeText != null && (
            <Badge count={badgeText} style={{ backgroundColor: badgeBg, color: accent ? '#fff' : 'var(--colorText, #333)', boxShadow: 'none', flex: 'none' }} />
          )}
        </div>
      </div>
    );
  };

  const renderNode = (node: TreeNode, depth: number): React.ReactNode => {
    const hasChildren = node.children.length > 0;
    const open = expanded.has(node.key);
    const st = depth === 0 ? styles[String(node.value)] || {} : {};
    return (
      <React.Fragment key={node.key}>
        <RowInner
          label={node.label}
          badgeText={fmtValue(node.metric, cfg)}
          active={isSelected(node.path)}
          icon={st.icon}
          color={st.color}
          accent={accentOf(depth, node.value)}
          depth={depth}
          hasChildren={hasChildren}
          open={open}
          onToggle={() => toggle(node.key)}
          onClick={(e: any) => onNodeClick(node, e)}
        />
        {hasChildren && open && node.children.map((c) => renderNode(c, depth + 1))}
      </React.Fragment>
    );
  };

  const treeHasActive = selectedPaths.length > 0 || !!searchText;
  const visRoots = cfg.hideEmpty ? roots.filter((n) => !(n.value == null || n.value === '')) : roots;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, width: '100%', minWidth: 0, overflow: 'hidden' }}>
      {cfg.showSearch || cfg.showReset ? (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'space-between', padding: '2px 4px 8px' }}>
          {cfg.showSearch ? <FilterSearchBox model={model} cfg={cfg} value={searchText} onChange={setSearchText} style={{ maxWidth: cfg.searchWidth || 320, width: cfg.searchWidth || '100%' }} /> : <span />}
          {cfg.showReset ? <ResetFilterButton label={cfg.resetLabel} onReset={doReset} size="small" disabled={!treeHasActive} /> : null}
        </div>
      ) : null}
      <RowInner label={rt('All')} badgeText={fmtValue(total, cfg)} active={selectedPaths.length === 0} accent={accentOf(-1, undefined)} depth={0} hasChildren={false} onClick={() => apply([])} />
      {visRoots.map((n) => renderNode(n, 0))}
      {visibleFlat.length > 1 ? <div style={{ fontSize: 11, color: 'var(--colorTextTertiary, #999)', padding: '4px 8px' }}>{rt('Ctrl/⌘ or Shift-click to select multiple')}</div> : null}
    </div>
  );
}

function hasChildrenAnywhere(roots: TreeNode[]): boolean {
  return roots.some((r) => r.children.length > 0);
}

// ---- the horizontal "Filter bar" view ----------------------------------------------------------
// Same data engine as the tree (one GROUP BY :query → counts; pushFilterMulti to connected blocks),
// but SINGLE level rendered as a horizontal row of items. Three skins (user-chosen in settings):
// pill (rounded chips, like the screenshot), segmented (antd Segmented), tab (antd Tabs underline).
const BAR_GREY = 'var(--colorFillSecondary, #f0f0f0)';
const ALL_KEY = '__all__';

function FilterBarView({ model, cfg }: { model: any; cfg: TreeCfg }) {
  const [, force] = React.useReducer((x) => x + 1, 0);
  const field = cfg.fieldPath as string;
  const gf = React.useMemo(() => [field], [field]);
  const [roots, setRoots] = React.useState<TreeNode[]>([]);
  const [metas, setMetas] = React.useState<FieldMeta[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [searchText, setSearchText] = React.useState('');
  const cfgKey = `${cfg.dataSourceKey}|${cfg.collectionName}|${field}|${cfg.metric}|${cfg.metricField}|${cfg.dateGranularity}|${cfg.scopeFilter}`;

  const load = React.useCallback(() => {
    const api = apiOf(model);
    setLoading(true);
    (async () => {
      const m = await fetchFieldMetas(api, cfg, gf);
      setMetas(m);
      const rows = await fetchGroupRows(api, cfg, gf, m, cfg.dateGranularity);
      setRoots(buildTree(rows, gf, m, cfg.metric));
    })().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfgKey]);

  React.useEffect(() => {
    load();
  }, [load]);

  // Live re-count: refresh when this collection is mutated anywhere in the app, and on tab focus.
  React.useEffect(() => {
    const unsub = subscribeCollection(cfg.collectionName || '', load);
    const onFocus = () => load();
    if (typeof window !== 'undefined') window.addEventListener('focus', onFocus);
    return () => {
      unsub();
      if (typeof window !== 'undefined') window.removeEventListener('focus', onFocus);
    };
  }, [cfg.collectionName, load]);

  const selectedPaths: any[][] = Array.isArray(selectionMap.get(model.uid)) ? selectionMap.get(model.uid) : [];
  const samePath = (a: any[], b: any[]) => a.length === b.length && a.every((v, i) => String(v) === String(b[i]));
  const selectedVals = new Set(selectedPaths.map((p) => String(p[0])));
  const allActive = selectedPaths.length === 0;
  // Multi-select is only offered for pills (segmented/tab are single-select controls by nature).
  const multi = !!cfg.barMultiSelect && (cfg.barStyle || 'pill') === 'pill';

  const apply = (paths: any[][]) => {
    const clean = (paths || []).filter((p) => p && p.length);
    if (!clean.length) selectionMap.delete(model.uid);
    else selectionMap.set(model.uid, clean);
    force();
    pushFilterMulti(model, metas, cfg.dateGranularity, clean);
  };
  const pickAll = () => apply([]);
  const doReset = () => {
    apply([]);
    setSearchText('');
    pushSearchFilter(model, '', cfg.searchFields || []);
  };
  const pickValue = (value: any) => {
    const path = [value];
    if (multi) {
      const exists = selectedPaths.some((p) => samePath(p, path));
      apply(exists ? selectedPaths.filter((p) => !samePath(p, path)) : [...selectedPaths, path]);
    } else {
      // single-select: re-clicking the active item clears back to "All".
      const isActive = selectedPaths.length === 1 && samePath(selectedPaths[0], path);
      apply(isActive ? [] : [path]);
    }
  };

  if (loading && !roots.length) return <Spin size="small" style={{ margin: 8 }} />;
  if (!roots.length)
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<span style={{ fontSize: 12 }}>{rt("No groups. Use a status / select / number / date field (relation fields can't be grouped).")}</span>} />;

  const styles = cfg.valueStyles || {};
  const total = reduceMetric(cfg.metric, roots.map((r) => r.metric).filter((x): x is number => typeof x === 'number'));
  const showCounts = cfg.showCounts !== false;
  const showAll = cfg.showAllPill !== false;
  const size: 'small' | 'middle' | 'large' = cfg.barSize === 'small' ? 'small' : 'middle';
  const justify = cfg.barAlign === 'center' ? 'center' : cfg.barAlign === 'right' ? 'flex-end' : 'flex-start';
  // Accent per value: mono → one colour; else the per-value colour from valueStyles (level-1 only).
  const accentOf = (value?: any) => (cfg.badgeMode === 'mono' ? cfg.badgeColor : value === undefined ? undefined : styles[String(value)]?.color) || undefined;

  type Item = { key: string; value: any | undefined; label: string; metric: number | null; icon?: string; color?: string; active: boolean };
  const items: Item[] = [];
  if (showAll) items.push({ key: ALL_KEY, value: undefined, label: rt('All'), metric: total, active: allActive });
  for (const n of roots) {
    if (cfg.hideEmpty && (n.value == null || n.value === '')) continue; // hide the null / (empty) group
    const st = styles[String(n.value)] || {};
    items.push({ key: n.key, value: n.value, label: n.label, metric: n.metric, icon: st.icon, color: st.color, active: selectedVals.has(String(n.value)) });
  }
  const onItemKey = (k: string) => {
    const it = items.find((x) => x.key === k);
    if (!it) return;
    it.value === undefined ? pickAll() : pickValue(it.value);
  };
  const activeKey = allActive ? ALL_KEY : items.find((it) => it.active)?.key || ALL_KEY;

  // A plain styled count pill (NOT antd <Badge>, whose standalone default paints red/pink and ignores
  // the backgroundColor style) — subtle grey, or the per-value accent when one is set.
  const countBadge = (it: Item) =>
    showCounts && it.metric != null ? (
      <span
        style={{
          display: 'inline-block',
          minWidth: 18,
          height: 18,
          padding: '0 6px',
          borderRadius: 999,
          fontSize: 11,
          lineHeight: '18px',
          textAlign: 'center',
          background: accentOf(it.value) || BAR_GREY,
          color: accentOf(it.value) ? '#fff' : 'var(--colorTextSecondary, #666)',
        }}
      >
        {fmtValue(it.metric, cfg)}
      </span>
    ) : null;
  const itemLabel = (it: Item) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {it.icon ? <StyledIcon type={it.icon} style={{ color: it.color || undefined, fontSize: 14 }} /> : null}
      <span style={{ color: it.color || undefined }}>{it.label}</span>
      {countBadge(it)}
    </span>
  );

  // ---- build the control per skin, then wrap it with the optional search box ----
  let control: React.ReactNode;
  if (cfg.barStyle === 'segmented') {
    control = (
      <div style={{ display: 'flex', justifyContent: justify, overflowX: 'auto' }}>
        <SegmentedGroup size={size === 'large' ? 'large' : (size as any)} value={activeKey} onChange={(k: any) => onItemKey(String(k))} options={items.map((it) => ({ value: it.key, label: itemLabel(it) }))} />
      </div>
    );
  } else if (cfg.barStyle === 'tab') {
    // Custom underline "tabs" — NOT antd <Tabs>, so no sibling plugin's `.ant-tabs` CSS can bleed in, and
    // the active underline follows accentOf() (mono colour / per-value colour) instead of the theme primary.
    const fontSize = size === 'small' ? 12 : 13;
    control = (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: justify, alignItems: 'flex-end', borderBottom: '1px solid var(--colorBorderSecondary, #f0f0f0)', width: '100%' }}>
        {items.map((it) => {
          const accent = accentOf(it.value) || 'var(--colorPrimary, #1677ff)';
          return (
            <div
              key={it.key}
              onClick={() => (it.value === undefined ? pickAll() : pickValue(it.value))}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer',
                userSelect: 'none',
                whiteSpace: 'nowrap',
                padding: size === 'small' ? '4px 8px' : '6px 10px',
                fontSize,
                marginBottom: -1,
                borderBottom: `2px solid ${it.active ? accent : 'transparent'}`,
                color: it.active ? accent : it.color || 'var(--colorText, #333)',
                fontWeight: it.active ? 600 : 400,
              }}
            >
              {it.icon ? <StyledIcon type={it.icon} style={{ color: it.active ? accent : it.color || undefined, fontSize }} /> : null}
              <span>{it.label}</span>
              {countBadge(it)}
            </div>
          );
        })}
      </div>
    );
  } else {
    // PILL (default, matches the screenshot)
    const pad = size === 'small' ? '2px 10px' : '5px 14px';
    const fontSize = size === 'small' ? 12 : 13;
    control = (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: justify, alignItems: 'center', width: '100%' }}>
        {items.map((it) => {
          const accent = accentOf(it.value) || 'var(--colorPrimary, #1677ff)';
          return (
            <div
              key={it.key}
              onClick={() => (it.value === undefined ? pickAll() : pickValue(it.value))}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                cursor: 'pointer',
                userSelect: 'none',
                padding: pad,
                fontSize,
                borderRadius: 999,
                whiteSpace: 'nowrap',
                transition: 'all .15s',
                border: `1px solid ${it.active ? accent : 'var(--colorBorder, #d9d9d9)'}`,
                background: it.active ? accent : 'var(--colorBgContainer, #fff)',
                color: it.active ? '#fff' : it.color || 'var(--colorText, #333)',
                fontWeight: it.active ? 600 : 400,
              }}
            >
              {it.icon ? <StyledIcon type={it.icon} style={{ color: it.active ? '#fff' : it.color || undefined, fontSize }} /> : null}
              <span>{it.label}</span>
              {showCounts && it.metric != null ? (
                <span
                  style={{
                    minWidth: 18,
                    height: 18,
                    padding: '0 5px',
                    borderRadius: 999,
                    fontSize: 11,
                    lineHeight: '18px',
                    textAlign: 'center',
                    background: it.active ? 'rgba(255,255,255,0.26)' : accentOf(it.value) || BAR_GREY,
                    color: it.active ? '#fff' : accentOf(it.value) ? '#fff' : 'var(--colorTextSecondary, #666)',
                  }}
                >
                  {fmtValue(it.metric, cfg)}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  }

  const hasActive = selectedPaths.length > 0 || !!searchText;
  const pos = cfg.searchLayout || 'below';
  const sw = cfg.searchWidth && cfg.searchWidth > 0 ? cfg.searchWidth : undefined;
  const searchNode = cfg.showSearch ? (
    <FilterSearchBox model={model} cfg={cfg} size={size} value={searchText} onChange={setSearchText} style={{ maxWidth: sw || (pos === 'above' || pos === 'below' ? 320 : 260), width: sw || '100%' }} />
  ) : null;
  // Always render the reset button (icon always visible); DISABLED when there's nothing to reset.
  const resetNode = cfg.showReset ? <ResetFilterButton label={cfg.resetLabel} onReset={doReset} size={size} disabled={!hasActive} /> : null;
  const searchGroup = searchNode || resetNode ? (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flex: 'none' }}>
      {searchNode}
      {resetNode}
    </div>
  ) : null;

  // Left / Right → same row as the bar (bar flexes, search fixed on the chosen side; wraps if narrow).
  if (searchGroup && (pos === 'left' || pos === 'right')) {
    return (
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', width: '100%' }}>
        {pos === 'left' ? searchGroup : null}
        <div style={{ flex: '1 1 260px', minWidth: 0 }}>{control}</div>
        {pos === 'right' ? searchGroup : null}
      </div>
    );
  }
  // Above / Below → own row before / after the bar.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
      {pos === 'above' && searchGroup ? <div style={{ display: 'flex', justifyContent: justify }}>{searchGroup}</div> : null}
      {control}
      {pos !== 'above' && searchGroup ? <div style={{ display: 'flex', justifyContent: justify }}>{searchGroup}</div> : null}
    </div>
  );
}

// ---- shared settings-tab builders (used by BOTH the tree flow and the bar flow) ----------------
// Keeping these as one source of truth means the Metric/Format, Style (badge + per-value icon/colour)
// and Data-scope tabs never drift between the two blocks.
const metricFormatProps = (t: (s: string) => any) => ({
  metricRow: {
    type: 'void',
    'x-component': 'PtdlGrid',
    'x-component-props': { style: { gridTemplateColumns: '1fr 1fr', columnGap: 16 } },
    properties: {
      metric: {
        type: 'string',
        title: t('Metric (badge value)'),
        'x-decorator': 'FormItem',
        'x-component': 'Select',
        enum: [
          { label: t('Count of rows'), value: 'count' },
          { label: t('Sum'), value: 'sum' },
          { label: t('Average'), value: 'avg' },
          { label: t('Min'), value: 'min' },
          { label: t('Max'), value: 'max' },
        ],
      },
      metricField: {
        type: 'string',
        title: t('Aggregate field'),
        description: t('Used when Metric is Sum/Average/Min/Max (ignored for Count).'),
        'x-decorator': 'FormItem',
        'x-component': 'PtdlMetricField',
      },
    },
  },
  dateGranularity: {
    type: 'string',
    title: t('Date grouping (for date fields)'),
    description: t('How date fields are bucketed. Ignored for non-date fields.'),
    'x-decorator': 'FormItem',
    'x-component': 'Select',
    enum: [
      { label: t('By day'), value: 'day' },
      { label: t('By month'), value: 'month' },
      { label: t('By year'), value: 'year' },
    ],
  },
  numFmt: {
    type: 'string',
    title: t('Number format'),
    'x-decorator': 'FormItem',
    'x-component': 'Select',
    enum: [
      { label: t('Plain (1234.5)'), value: 'plain' },
      { label: t('Thousands separator (1,234)'), value: 'comma' },
      { label: t('Compact (1.2K)'), value: 'compact' },
    ],
  },
  numGrid: {
    type: 'void',
    'x-component': 'PtdlGrid',
    'x-component-props': { style: { gridTemplateColumns: '1fr 1fr 1fr', columnGap: 12 } },
    properties: {
      numPrefix: { type: 'string', title: t('Prefix'), 'x-decorator': 'FormItem', 'x-component': 'Input', 'x-component-props': { placeholder: '$' } },
      numSuffix: { type: 'string', title: t('Suffix'), 'x-decorator': 'FormItem', 'x-component': 'Input', 'x-component-props': { placeholder: '₫' } },
      numDecimals: {
        type: 'number',
        title: t('Decimals'),
        'x-decorator': 'FormItem',
        'x-component': 'Select',
        enum: [
          { label: t('Auto'), value: null },
          { label: '0', value: 0 },
          { label: '1', value: 1 },
          { label: '2', value: 2 },
        ],
      },
    },
  },
});

const badgeStyleProps = (t: (s: string) => any) => ({
  badgeRow: {
    type: 'void',
    'x-component': 'PtdlGrid',
    'x-component-props': { style: { gridTemplateColumns: '1fr 1fr', columnGap: 16 } },
    properties: {
      badgeMode: {
        type: 'string',
        title: t('Count badge color'),
        'x-decorator': 'FormItem',
        'x-component': 'Radio.Group',
        enum: [
          { label: t('Colorful (per value)'), value: 'colorful' },
          { label: t('Mono (one color)'), value: 'mono' },
        ],
      },
      badgeColor: {
        type: 'string',
        title: t('Badge color'),
        description: t('Used when Count badge color is Mono.'),
        'x-decorator': 'FormItem',
        'x-component': 'PtdlColorField',
      },
    },
  },
  valueStyles: {
    type: 'object',
    title: t('Icon & color per value'),
    'x-decorator': 'FormItem',
    'x-component': 'PtdlValueStyles',
  },
});

const dataScopeProps = (t: (s: string) => any) => ({
  scopeFilter: {
    type: 'string',
    title: t('Only count rows matching…'),
    'x-decorator': 'FormItem',
    'x-component': 'PtdlScopeBuilder',
  },
});

// NOTE: no `x-reactions` visibility gating here. These dialogs render the settings inside `PtdlTabs`
// (antd Tabs), where reaction-driven show/hide does not re-run reliably on value change — so a field
// hidden behind `rx(...)` would never appear when its toggle flips. We render the fields
// unconditionally instead; the toggle (`showSearch`) still decides whether the search box shows in the
// block itself (checked at render + in normalizeCfg), and the extra fields are simply ignored when off.
const searchProps = (t: (s: string) => any) => ({
  showSearch: { type: 'boolean', title: t('Show search box'), 'x-decorator': 'FormItem', 'x-component': 'Switch' },
  searchFields: {
    type: 'array',
    title: t('Search in fields'),
    description: t('The fields the search box matches (contains, OR). Applies when "Show search box" is on.'),
    'x-decorator': 'FormItem',
    'x-component': 'PtdlSearchFields',
  },
  searchPlaceholder: {
    type: 'string',
    title: t('Placeholder'),
    'x-decorator': 'FormItem',
    'x-component': 'Input',
    'x-component-props': { placeholder: t('Search…') },
  },
  uxRow: {
    type: 'void',
    'x-component': 'PtdlGrid',
    'x-component-props': { style: { gridTemplateColumns: '1fr 1fr', columnGap: 16 } },
    properties: {
      showReset: { type: 'boolean', title: t('Show reset button'), 'x-decorator': 'FormItem', 'x-component': 'Switch' },
      hideEmpty: { type: 'boolean', title: t('Hide empty group'), 'x-decorator': 'FormItem', 'x-component': 'Switch' },
    },
  },
  resetLabel: {
    type: 'string',
    title: t('Reset button label'),
    'x-decorator': 'FormItem',
    'x-component': 'Input',
    'x-component-props': { placeholder: 'Đặt lại' },
  },
});

// Normalise raw stepParams → the ptdlTreeCfg render config. Shared by both blocks; `bar` adds the
// horizontal-bar-only fields (both blocks read the same `ptdlTreeCfg` prop / TreeCfg shape).
function normalizeCfg(params: any, bar = false): TreeCfg {
  const cfg: TreeCfg = {
    dataSourceKey: (params?.dataSourceKey || 'main').trim?.() || 'main',
    collectionName: (params?.collectionName || '').trim?.() || params?.collectionName || '',
    fieldPath: (params?.fieldPath || '').trim?.() || params?.fieldPath || '',
    level2Field: (params?.level2Field || '').trim?.() || params?.level2Field || '',
    level3Field: (params?.level3Field || '').trim?.() || params?.level3Field || '',
    scopeFilter: (params?.scopeFilter || '').trim?.() || params?.scopeFilter || '',
    valueStyles: params?.valueStyles || {},
    badgeMode: params?.badgeMode === 'mono' ? 'mono' : 'colorful',
    badgeColor: (params?.badgeColor || '').trim?.() || params?.badgeColor || '',
    metric: ['sum', 'avg', 'min', 'max'].includes(params?.metric) ? params.metric : 'count',
    metricField: (params?.metricField || '').trim?.() || params?.metricField || '',
    dateGranularity: ['day', 'year'].includes(params?.dateGranularity) ? params.dateGranularity : 'month',
    numFmt: ['comma', 'compact'].includes(params?.numFmt) ? params.numFmt : 'plain',
    numPrefix: params?.numPrefix || '',
    numSuffix: params?.numSuffix || '',
    numDecimals: params?.numDecimals == null ? undefined : Number(params.numDecimals),
    showSearch: !!params?.showSearch,
    searchFields: Array.isArray(params?.searchFields) ? params.searchFields.filter(Boolean) : [],
    searchPlaceholder: (params?.searchPlaceholder || '').trim?.() || params?.searchPlaceholder || '',
    showReset: !!params?.showReset,
    resetLabel: (params?.resetLabel || '').trim?.() || params?.resetLabel || '',
    hideEmpty: !!params?.hideEmpty,
  };
  if (bar) {
    const sl = params?.searchLayout === 'inline' ? 'right' : params?.searchLayout; // back-compat: inline → right
    cfg.searchLayout = ['above', 'left', 'right'].includes(sl) ? sl : 'below';
    cfg.searchWidth = params?.searchWidth ? Number(params.searchWidth) : undefined;
    cfg.barStyle = ['segmented', 'tab'].includes(params?.barStyle) ? params.barStyle : 'pill';
    cfg.barSize = params?.barSize === 'small' ? 'small' : 'default';
    cfg.barAlign = ['center', 'right'].includes(params?.barAlign) ? params.barAlign : 'left';
    cfg.showCounts = params?.showCounts !== false;
    cfg.showAllPill = params?.showAllPill !== false;
    cfg.barMultiSelect = !!params?.barMultiSelect;
  }
  return cfg;
}

// Live preview inside the settings dialog. Reuses the REAL render (FilterBarView / FilterTreeView) with
// a throw-away model: `apiClient` for the count query, an isolated uid, and NO filterManager — so
// clicking an item is a harmless no-op (pushFilterMulti/pushSearchFilter find zero targets). `observer`
// re-reads form.values on every settings change → the preview updates live.
const PtdlPreview = observer((props: any) => {
  const bar = !!props.bar;
  const form: any = useForm();
  const cfg = normalizeCfg(form?.values || {}, bar);
  const modelRef = React.useRef<any>(null);
  if (!modelRef.current) modelRef.current = { uid: `ptdl-preview-${bar ? 'bar' : 'tree'}`, context: { api: apiClient } };
  const [runKey, setRunKey] = React.useState(0); // "Chạy thử" → remount the view → re-run the group query
  React.useEffect(() => {
    const uid = modelRef.current.uid;
    selectionMap.delete(uid);
    return () => selectionMap.delete(uid);
  }, []);
  const ready = cfg.collectionName && cfg.fieldPath;
  return (
    <div style={{ marginBottom: 12, border: '1px solid var(--colorBorderSecondary, #eee)', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: 'var(--colorTextTertiary, #999)', padding: '3px 6px 3px 10px', background: 'var(--colorFillQuaternary, #fafafa)', borderBottom: '1px solid var(--colorBorderSecondary, #eee)' }}>
        <span>{rt('Preview')}</span>
        <Button size="small" type="text" disabled={!ready} onClick={() => setRunKey((k) => k + 1)} style={{ fontSize: 11, height: 22, paddingInline: 8 }}>
          ↻ {rt('Run test')}
        </Button>
      </div>
      <div style={{ padding: 12, maxHeight: 240, overflow: 'auto' }}>
        {ready ? (
          bar ? <FilterBarView key={runKey} model={modelRef.current} cfg={cfg} /> : <FilterTreeView key={runKey} model={modelRef.current} cfg={cfg} />
        ) : (
          <div style={{ color: 'var(--colorTextTertiary, #999)', fontSize: 12, textAlign: 'center' }}>{rt('Pick a collection + group field to preview.')}</div>
        )}
      </div>
    </div>
  );
});

// ---- register the block + settings flow --------------------------------------------------------
export function registerFilterTree(deps: { flowEngine: any; api?: any; app?: any; Icon?: any; icons?: Map<string, any>; tExpr?: (s: string, o?: any) => any }) {
  const { flowEngine } = deps;
  apiClient = deps.api || flowEngine?.context?.api || apiClient;
  installDataInterceptor(apiClient);
  // App i18n → (a) resolve core {{t("…")}} value/enum labels (default ns), (b) translate THIS plugin's
  // own render strings against its NS (rt).
  const i18n = deps.app?.i18n || flowEngine?.context?.app?.i18n;
  if (i18n?.t && !i18nT) i18nT = (k: string) => i18n.t(k);
  if (i18n?.t && !runtimeT) runtimeT = (s: string) => i18n.t(s, { ns: NS });
  if (deps.app) installTreeWs(deps.app); // live re-count on cross-client / server-side data changes
  // Wire the shared icon registry (same host Icon + icons Map obtained from @nocobase/client(-v2)).
  setIconRegistry(deps.Icon, deps.icons);
  // Settings-dialog labels → compilable i18n expression against NS (resolved by compileUiSchema).
  const t = (s: string) => (deps.tExpr ? deps.tExpr(s, { ns: NS }) : s);

  const Base = flowEngine?.getModelClass?.('FilterBlockModel') || flowEngine?.getModelClass?.('BlockModel');
  if (!Base) {
    // eslint-disable-next-line no-console
    console.warn('[filter-tree] FilterBlockModel base not resolvable — skip');
    return;
  }
  if (flowEngine.getModelClass?.('FilterTreeBlockModel')) return; // already registered this lane

  class FilterTreeBlockModel extends (Base as any) {
    // The value the connected data blocks get filtered by (undefined = "All" → filter cleared).
    // Read from the ephemeral selection map (NOT props) so it never persists across save/reload.
    getFilterValue() {
      const v = selectionMap.get((this as any).uid);
      // Nested selection is an array pushed directly to targets → filterManager gets nothing here.
      return v == null || v === '' || Array.isArray(v) ? undefined : v;
    }
    // Single-select equality.
    getDefaultOperator() {
      return '$eq';
    }
    renderComponent() {
      const cfg = (this as any).props?.ptdlTreeCfg;
      if (!cfg?.collectionName || !cfg?.fieldPath) {
        return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={rt('Configure the filter tree: pick a collection + a field to group by (block settings → Filter tree).')} />;
      }
      return <FilterTreeView model={this} cfg={cfg} />;
    }
  }

  (FilterTreeBlockModel as any).define({
    label: rt('Tree (filter)'),
    createModelOptions: { use: 'FilterTreeBlockModel' },
  });

  (FilterTreeBlockModel as any).registerFlow({
    key: 'ptdlFilterTree',
    title: rt('Filter tree'),
    sort: 100,
    steps: {
      source: {
        title: rt('Filter tree'),
        uiMode: { type: 'dialog', props: { width: 760 } },
        defaultParams: (ctx: any) => {
          const c = ctx.model?.props?.ptdlTreeCfg || {};
          return {
            dataSourceKey: c.dataSourceKey || 'main',
            collectionName: c.collectionName || '',
            fieldPath: c.fieldPath || '',
            level2Field: c.level2Field || '',
            level3Field: c.level3Field || '',
            scopeFilter: c.scopeFilter || '',
            showSearch: c.showSearch || false,
            searchFields: c.searchFields || [],
            searchPlaceholder: c.searchPlaceholder || '',
            showReset: c.showReset || false,
            resetLabel: c.resetLabel || '',
            hideEmpty: c.hideEmpty || false,
            valueStyles: c.valueStyles || {},
            badgeMode: c.badgeMode || 'colorful',
            badgeColor: c.badgeColor || '',
            metric: c.metric || 'count',
            metricField: c.metricField || '',
            dateGranularity: c.dateGranularity || 'month',
            numFmt: c.numFmt || 'plain',
            numPrefix: c.numPrefix || '',
            numSuffix: c.numSuffix || '',
            numDecimals: c.numDecimals ?? null,
          };
        },
        uiSchema: () => ({
          ptdlPreview: { type: 'void', 'x-component': 'PtdlPreview', 'x-component-props': { bar: false } },
          ptdlTabs: {
            type: 'void',
            'x-component': 'PtdlTabs',
            properties: {
              // -------- Tab 1: Group --------
              tabGroup: {
                type: 'void',
                title: t('Group'),
                properties: {
                  collectionName: { type: 'string', title: t('Collection'), 'x-decorator': 'FormItem', 'x-component': 'PtdlTreeCollection' },
                  fieldPath: { type: 'string', title: t('Group by (level 1)'), 'x-decorator': 'FormItem', 'x-component': 'PtdlTreeField', 'x-reactions': injectCollection },
                  level2Field: {
                    type: 'string',
                    title: t('Group by (level 2, optional)'),
                    'x-decorator': 'FormItem',
                    'x-component': 'PtdlTreeField',
                    'x-reactions': rx((v: any) => !!v.fieldPath),
                  },
                  level3Field: {
                    type: 'string',
                    title: t('Group by (level 3, optional)'),
                    'x-decorator': 'FormItem',
                    'x-component': 'PtdlTreeField',
                    'x-reactions': rx((v: any) => !!v.level2Field),
                  },
                },
              },
              // -------- Tab 2: Metric & format --------
              tabMetric: { type: 'void', title: t('Metric & format'), properties: metricFormatProps(t) },
              // -------- Tab 3: Style --------
              tabStyle: { type: 'void', title: t('Style'), properties: badgeStyleProps(t) },
              // -------- Tab 4: Data scope --------
              tabScope: { type: 'void', title: t('Data scope'), properties: dataScopeProps(t) },
              // -------- Tab 5: Search --------
              tabSearch: { type: 'void', title: t('Search'), properties: searchProps(t) },
            },
          },
        }),
        // Client-only setProps → safe as auto-apply; params persist via stepParams.
        handler(ctx: any, params: any) {
          ctx.model.setProps('ptdlTreeCfg', normalizeCfg(params));
        },
      },
      // Core action: lets the user "connect to data blocks" (stores {targetId, filterPaths}).
      connectFields: { use: 'connectFields', title: rt('Connect to data blocks') },
    },
  });

  // ============ Filter BAR block — horizontal, single level, SAME data engine as the tree =========
  // A second block in the same plugin (shares fetchGroupRows/pushFilterMulti/config pickers). Appears
  // as its own "Bar (filter)" entry in Add-block → Filter blocks. User picks the skin (pill/segmented/tab).
  class FilterBarBlockModel extends (Base as any) {
    getFilterValue() {
      const v = selectionMap.get((this as any).uid);
      return v == null || v === '' || Array.isArray(v) ? undefined : v;
    }
    getDefaultOperator() {
      return '$eq';
    }
    renderComponent() {
      const cfg = (this as any).props?.ptdlTreeCfg;
      if (!cfg?.collectionName || !cfg?.fieldPath) {
        return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={rt('Configure the filter bar: pick a collection + a field to group by (block settings → Filter bar).')} />;
      }
      return <FilterBarView model={this} cfg={cfg} />;
    }
  }

  (FilterBarBlockModel as any).define({
    label: rt('Bar (filter)'),
    createModelOptions: { use: 'FilterBarBlockModel' },
  });

  (FilterBarBlockModel as any).registerFlow({
    key: 'ptdlFilterBar',
    title: rt('Filter bar'),
    sort: 100,
    steps: {
      source: {
        title: rt('Filter bar'),
        uiMode: { type: 'dialog', props: { width: 760 } },
        defaultParams: (ctx: any) => {
          const c = ctx.model?.props?.ptdlTreeCfg || {};
          return {
            dataSourceKey: c.dataSourceKey || 'main',
            collectionName: c.collectionName || '',
            fieldPath: c.fieldPath || '',
            scopeFilter: c.scopeFilter || '',
            valueStyles: c.valueStyles || {},
            badgeMode: c.badgeMode || 'colorful',
            badgeColor: c.badgeColor || '',
            metric: c.metric || 'count',
            metricField: c.metricField || '',
            dateGranularity: c.dateGranularity || 'month',
            numFmt: c.numFmt || 'plain',
            numPrefix: c.numPrefix || '',
            numSuffix: c.numSuffix || '',
            numDecimals: c.numDecimals ?? null,
            barStyle: c.barStyle || 'pill',
            barSize: c.barSize || 'default',
            barAlign: c.barAlign || 'left',
            showCounts: c.showCounts !== false,
            showAllPill: c.showAllPill !== false,
            barMultiSelect: !!c.barMultiSelect,
            showSearch: c.showSearch || false,
            searchFields: c.searchFields || [],
            searchPlaceholder: c.searchPlaceholder || '',
            showReset: c.showReset || false,
            resetLabel: c.resetLabel || '',
            hideEmpty: c.hideEmpty || false,
            searchLayout: c.searchLayout || 'below',
            searchWidth: c.searchWidth ?? null,
          };
        },
        uiSchema: () => ({
          ptdlPreview: { type: 'void', 'x-component': 'PtdlPreview', 'x-component-props': { bar: true } },
          ptdlTabs: {
            type: 'void',
            'x-component': 'PtdlTabs',
            properties: {
              // -------- Tab 1: Group (single level for the bar) --------
              tabGroup: {
                type: 'void',
                title: t('Group'),
                properties: {
                  collectionName: { type: 'string', title: t('Collection'), 'x-decorator': 'FormItem', 'x-component': 'PtdlTreeCollection' },
                  fieldPath: { type: 'string', title: t('Group by'), 'x-decorator': 'FormItem', 'x-component': 'PtdlTreeField', 'x-reactions': injectCollection },
                },
              },
              // -------- Tab 2: Metric & format (shared) --------
              tabMetric: { type: 'void', title: t('Metric & format'), properties: metricFormatProps(t) },
              // -------- Tab 3: Style (bar-specific + shared badge/per-value) --------
              tabStyle: {
                type: 'void',
                title: t('Style'),
                properties: {
                  barRow: {
                    type: 'void',
                    'x-component': 'PtdlGrid',
                    'x-component-props': { style: { gridTemplateColumns: '1fr 1fr', columnGap: 16 } },
                    properties: {
                      barStyle: {
                        type: 'string',
                        title: t('Bar style'),
                        'x-decorator': 'FormItem',
                        'x-component': 'Select',
                        enum: [
                          { label: t('Pill (rounded chips)'), value: 'pill' },
                          { label: t('Segmented'), value: 'segmented' },
                          { label: t('Tab (underline)'), value: 'tab' },
                        ],
                      },
                      barSize: {
                        type: 'string',
                        title: t('Size'),
                        'x-decorator': 'FormItem',
                        'x-component': 'Select',
                        enum: [
                          { label: t('Default'), value: 'default' },
                          { label: t('Small'), value: 'small' },
                        ],
                      },
                      barAlign: {
                        type: 'string',
                        title: t('Align'),
                        'x-decorator': 'FormItem',
                        'x-component': 'Select',
                        enum: [
                          { label: t('Left'), value: 'left' },
                          { label: t('Center'), value: 'center' },
                          { label: t('Right'), value: 'right' },
                        ],
                      },
                      barMultiSelect: {
                        type: 'boolean',
                        title: t('Allow multiple (pill only)'),
                        'x-decorator': 'FormItem',
                        'x-component': 'Switch',
                      },
                    },
                  },
                  toggleRow: {
                    type: 'void',
                    'x-component': 'PtdlGrid',
                    'x-component-props': { style: { gridTemplateColumns: '1fr 1fr', columnGap: 16 } },
                    properties: {
                      showAllPill: { type: 'boolean', title: t('Show "All" item'), 'x-decorator': 'FormItem', 'x-component': 'Switch' },
                      showCounts: { type: 'boolean', title: t('Show counts'), 'x-decorator': 'FormItem', 'x-component': 'Switch' },
                    },
                  },
                  ...badgeStyleProps(t),
                },
              },
              // -------- Tab 4: Data scope (shared) --------
              tabScope: { type: 'void', title: t('Data scope'), properties: dataScopeProps(t) },
              // -------- Tab 5: Search (shared) + bar-only search layout --------
              tabSearch: {
                type: 'void',
                title: t('Search'),
                properties: {
                  ...searchProps(t),
                  searchRow2: {
                    type: 'void',
                    'x-component': 'PtdlGrid',
                    'x-component-props': { style: { gridTemplateColumns: '1fr 1fr', columnGap: 16 } },
                    properties: {
                      searchLayout: {
                        type: 'string',
                        title: t('Search position'),
                        'x-decorator': 'FormItem',
                        'x-component': 'Select',
                        enum: [
                          { label: t('Below the bar'), value: 'below' },
                          { label: t('Above the bar'), value: 'above' },
                          { label: t('Left of the bar'), value: 'left' },
                          { label: t('Right of the bar'), value: 'right' },
                        ],
                      },
                      searchWidth: {
                        type: 'number',
                        title: t('Search width (px)'),
                        description: t('Blank = auto.'),
                        'x-decorator': 'FormItem',
                        'x-component': 'InputNumber',
                        'x-component-props': { min: 100, max: 800, step: 20, style: { width: '100%' }, placeholder: 'auto' },
                      },
                    },
                  },
                },
              },
            },
          },
        }),
        handler(ctx: any, params: any) {
          ctx.model.setProps('ptdlTreeCfg', normalizeCfg(params, true));
        },
      },
      connectFields: { use: 'connectFields', title: rt('Connect to data blocks') },
    },
  });

  try {
    flowEngine.flowSettings?.registerComponents?.({ PtdlTreeCollection, PtdlTreeField, PtdlMetricField, PtdlValueStyles, PtdlColorField: ColorField, PtdlScopeBuilder, PtdlTabs, PtdlGrid: SettingsGrid, PtdlSearchFields, PtdlPreview, InputNumber });
  } catch (e) {
    /* ignore */
  }
  try {
    flowEngine.registerModels({ FilterTreeBlockModel, FilterBarBlockModel });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[filter-tree] registerModels failed', e);
  }
  // eslint-disable-next-line no-console
  console.log('[filter-tree] registered FilterTreeBlockModel + FilterBarBlockModel');
}
