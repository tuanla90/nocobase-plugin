import React, { useEffect, useRef, useState } from 'react';
import { Select, DatePicker, Space, Input, theme } from 'antd';
import { Filter as FilterIcon, Calendar as CalendarIcon, ChevronDown as ChevronIcon } from 'lucide-react';
import dayjs from 'dayjs';
import { useFlowSettingsContext } from '@nocobase/flow-engine';
import { observer, useForm } from '@formily/react';
import { SettingsGrid, rx, SegmentedGroup, registerFlowComponentsOnce } from '@tuanla90/shared';
import { debounce } from 'lodash';
import { NS, t } from './i18n';

/**
 * "Filter bar" — a first-class toolbar ACTION (scene: collection), sibling of the search bar. Instead of the
 * native Filter popup it renders INLINE controls, one per configured column: a multi-select dropdown for
 * enum/relation columns and a date RangePicker for date/time columns. Each control writes into a single named
 * filter group on the block's MultiRecordResource (`addFilterGroup` → `setPage(1)` → `refresh()`) — the same
 * sanctioned path the native Filter uses, and the one the search bar already proves live.
 *
 * Only DROPDOWN (enum select + relation) and DATE columns are offered (per requirement).
 */
const FILTER_KEY = 'ptdlFilter';
const WIDTH_PX: Record<string, number> = { narrow: 150, normal: 180, wide: 240 };

/** Relative date presets, KEYED so a default can store the key (e.g. 'thisMonth') and the range is recomputed
 *  each load (always the current period). Built fresh each call so "today" stays current. */
function datePresetDefs(): Array<{ key: string; label: string; range: () => [any, any] }> {
  return [
    { key: 'today', label: t('Today'), range: () => [dayjs().startOf('day'), dayjs().endOf('day')] },
    { key: 'yesterday', label: t('Yesterday'), range: () => [dayjs().add(-1, 'day').startOf('day'), dayjs().add(-1, 'day').endOf('day')] },
    { key: 'last7', label: t('Last 7 days'), range: () => [dayjs().add(-6, 'day').startOf('day'), dayjs().endOf('day')] },
    { key: 'last30', label: t('Last 30 days'), range: () => [dayjs().add(-29, 'day').startOf('day'), dayjs().endOf('day')] },
    { key: 'thisMonth', label: t('This month'), range: () => [dayjs().startOf('month'), dayjs().endOf('month')] },
    { key: 'lastMonth', label: t('Last month'), range: () => [dayjs().add(-1, 'month').startOf('month'), dayjs().add(-1, 'month').endOf('month')] },
    { key: 'thisYear', label: t('This year'), range: () => [dayjs().startOf('year'), dayjs().endOf('year')] },
  ];
}
/** {label, value:[dayjs,dayjs]} list for the antd RangePicker `presets` prop. */
function buildDatePresets(): Array<{ label: string; value: [any, any] }> {
  return datePresetDefs().map((d) => ({ label: d.label, value: d.range() }));
}
/** Resolve a preset key → a concrete [start,end] dayjs range (or null). */
function presetRange(key: string): [any, any] | null {
  const d = datePresetDefs().find((x) => x.key === key);
  return d ? d.range() : null;
}

const ENUM_IFACES = ['select', 'multipleSelect', 'radioGroup', 'checkboxGroup'];
const REL_IFACES = ['m2o', 'o2o', 'oho', 'obo', 'm2m', 'o2m'];
const DATE_IFACES = ['datetime', 'createdAt', 'updatedAt', 'date', 'time', 'unixTimestamp', 'datetimeNoTz'];
const DATE_TYPES = ['date', 'datetime', 'datetimeTz', 'datetimeNoTz', 'dateOnly', 'timestamp'];

type FieldMeta = {
  name: string;
  title: string;
  kind: 'enum' | 'relation' | 'date';
  enumOptions?: Array<{ label: string; value: any }>;
  target?: string;
  targetKey?: string;
};

/** Classify a raw collection field into a filterable KIND (or null to drop it). */
function fieldKind(f: any): FieldMeta['kind'] | null {
  const i = f && f.interface;
  const type = f && f.type;
  if (ENUM_IFACES.includes(i)) return 'enum';
  if (REL_IFACES.includes(i) && f.target) return 'relation';
  if (DATE_IFACES.includes(i) || DATE_TYPES.includes(type)) return 'date';
  return null;
}

/** Turn the raw fields list (from the fields REST endpoint) into the eligible FieldMeta[]. */
function classifyFields(fields: any[]): FieldMeta[] {
  const out: FieldMeta[] = [];
  for (const f of fields || []) {
    const kind = fieldKind(f);
    if (!kind) continue;
    const title = (f.uiSchema && f.uiSchema.title) || f.title || f.name;
    const meta: FieldMeta = { name: f.name, title, kind, target: f.target, targetKey: f.targetKey || 'id' };
    if (kind === 'enum') {
      const raw = (f.uiSchema && f.uiSchema.enum) || f.enum || [];
      meta.enumOptions = raw.map((o: any) => ({ label: o.label ?? String(o.value), value: o.value }));
    }
    out.push(meta);
  }
  return out;
}

// ── model → collection / api / datasource / collection-manager plumbing ──
function collectionOfModel(model: any): any {
  return (
    (model && model.context && (model.context.collection || (model.context.blockModel && model.context.blockModel.collection))) ||
    (model && model.collection) ||
    null
  );
}
function apiOfModel(model: any): any {
  return (model && model.context && (model.context.api || (model.context.app && model.context.app.apiClient))) || null;
}
function dsKeyOfModel(model: any): string {
  const c = collectionOfModel(model);
  return (c && (c.dataSourceKey || (c.dataSource && c.dataSource.key))) || 'main';
}
function cmOfModel(model: any): any {
  try {
    const app = model && model.context && model.context.app;
    const dsm = (app && app.dataSourceManager) || (model && model.context && model.context.dataSourceManager);
    const ds = dsm && dsm.getDataSource && dsm.getDataSource(dsKeyOfModel(model));
    return ds && ds.collectionManager;
  } catch (_) {
    return null;
  }
}
function resourceOf(model: any): any {
  const ctx = model && model.context;
  return ctx && (ctx.resource || (ctx.blockModel && ctx.blockModel.resource));
}

function fieldsUrl(coll: string, dsKey: string): string {
  return dsKey && dsKey !== 'main' ? `dataSources/${dsKey}/collections/${coll}/fields` : `collections/${coll}/fields`;
}
async function fetchFields(api: any, coll: string, dsKey: string): Promise<any[]> {
  const res = await api.request({ url: fieldsUrl(coll, dsKey), params: { paginate: false } });
  return (res && res.data && res.data.data) || [];
}

/** Best display field for a relation target: the collection's titleField, else a common display field, else id.
 *  Preference list covers NocoBase's usual display fields (nickname/username for `users`, name/title, VN
 *  ten/ma/ho_ten…) so we don't fall through to an arbitrary first string like `appLang`. */
const LABEL_PREF = [
  'nickname', 'username', 'name', 'title', 'fullName', 'full_name', 'displayName', 'display_name', 'label',
  'text', 'ten', 'ho_ten', 'hoTen', 'ten_day_du', 'ma', 'code', 'so_hop_dong', 'email', 'phone',
];
function pickLabelField(records: any[], preferred?: string): string {
  if (preferred) return preferred;
  const r = (records && records[0]) || {};
  const keys = Object.keys(r).filter((k) => !/^(id|createdAt|updatedAt|createdById|updatedById|sort|__)/.test(k));
  for (const p of LABEL_PREF) if (keys.includes(p)) return p;
  const strKey = keys.find((k) => typeof r[k] === 'string');
  return strKey || 'id';
}
async function fetchRelationOptions(api: any, m: FieldMeta, dsKey: string, cm: any): Promise<Array<{ label: string; value: any }>> {
  const listUrl = dsKey && dsKey !== 'main' ? `dataSources/${dsKey}/collections/${m.target}:list` : `${m.target}:list`;
  const res = await api.request({ url: listUrl, params: { pageSize: 100 } });
  const records = (res && res.data && res.data.data) || [];
  let titleField: string | undefined;
  try {
    const tc = cm && cm.getCollection && cm.getCollection(m.target);
    titleField = (tc && (tc.titleField || (tc.options && tc.options.titleField))) || undefined;
  } catch (_) {
    /* fall back to heuristic */
  }
  const labelField = pickLabelField(records, titleField);
  const tk = m.targetKey || 'id';
  return records.map((r: any) => ({ label: String(r[labelField] ?? r[tk]), value: r[tk] }));
}

/** Build the `{$and:[…]}` filter from the model's stashed values + field meta, and apply it to the resource. */
function applyFilter(actionModel: any) {
  const resource = resourceOf(actionModel);
  if (!resource || !resource.addFilterGroup) return;
  const vals = actionModel.__ptdlFilterVals || {};
  const meta: Record<string, FieldMeta> = actionModel.__ptdlFilterMeta || {};
  const and: any[] = [];
  for (const name of Object.keys(vals)) {
    const m = meta[name];
    const v = vals[name];
    if (!m) continue;
    if (m.kind === 'enum') {
      if (Array.isArray(v) && v.length) and.push({ [name]: { $in: v } });
    } else if (m.kind === 'relation') {
      if (Array.isArray(v) && v.length) and.push({ [`${name}.${m.targetKey || 'id'}`]: { $in: v } });
    } else if (m.kind === 'date') {
      if (Array.isArray(v) && v[0] && v[1]) and.push({ [name]: { $gte: v[0], $lte: v[1] } });
    }
  }
  if (and.length) resource.addFilterGroup(FILTER_KEY, { $and: and });
  else resource.removeFilterGroup(FILTER_KEY);
  if (resource.setPage) resource.setPage(1);
  if (resource.refresh) resource.refresh();
}

/** The live inline filter bar rendered by the action. Values live ON THE MODEL (survive remounts, like the
 *  search bar); a ref-held debounce applies them; nothing is cleared on unmount. */
function FilterBarInline({ actionModel }: { actionModel: any }) {
  const { token } = theme.useToken();
  const [meta, setMeta] = useState<Record<string, FieldMeta>>({});
  const [relOpts, setRelOpts] = useState<Record<string, Array<{ label: string; value: any }>>>({});
  const [, force] = useState(0);
  const runRef = useRef<any>(null);
  if (!runRef.current) runRef.current = debounce(() => applyFilter(actionModel), 300);

  const props = (actionModel && actionModel.props) || {};
  const names: string[] = Array.isArray(props.ptdlFilterFields) ? props.ptdlFilterFields : [];
  const key = names.join(',');

  useEffect(() => {
    const api = apiOfModel(actionModel);
    const coll = collectionOfModel(actionModel);
    const collName = coll && coll.name;
    if (!api || !collName || !names.length) return;
    let alive = true;
    fetchFields(api, collName, dsKeyOfModel(actionModel))
      .then((fields) => {
        if (!alive) return;
        const map: Record<string, FieldMeta> = {};
        classifyFields(fields).forEach((c) => {
          if (names.includes(c.name)) map[c.name] = c;
        });
        setMeta(map);
        actionModel.__ptdlFilterMeta = map; // so the debounced apply reads fresh meta
        // Seed configured DEFAULT values ONCE (first meta load) → the filter is pre-applied when the table
        // opens. Date defaults are a preset KEY (recomputed to the current period); enum/relation are value
        // arrays. Only fill fields the user hasn't already touched (`vals[name] == null`).
        if (!actionModel.__ptdlDefaultsApplied) {
          actionModel.__ptdlDefaultsApplied = true;
          const cols0 = (props && props.ptdlColumns) || {};
          const vals0 = actionModel.__ptdlFilterVals || (actionModel.__ptdlFilterVals = {});
          let seeded = false;
          names.forEach((name) => {
            const dm = map[name];
            const dflt = cols0[name] && cols0[name].default;
            if (!dm || dflt == null || vals0[name] != null) return;
            if (dm.kind === 'date' && typeof dflt === 'string') {
              const r = presetRange(dflt);
              if (r) {
                vals0[name] = [r[0].startOf('day').toISOString(), r[1].endOf('day').toISOString()];
                seeded = true;
              }
            } else if (Array.isArray(dflt) && dflt.length) {
              vals0[name] = dflt;
              seeded = true;
            }
          });
          if (seeded) applyFilter(actionModel);
        }
        const cm = cmOfModel(actionModel);
        Object.values(map)
          .filter((m) => m.kind === 'relation')
          .forEach((m) => {
            fetchRelationOptions(api, m, dsKeyOfModel(actionModel), cm)
              .then((opts) => alive && setRelOpts((p) => ({ ...p, [m.name]: opts })))
              .catch(() => {});
          });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [actionModel, key]);

  const w = WIDTH_PX[props.ptdlControlWidth] || 180;
  const cols: Record<string, { default?: any; placeholder?: string }> = (props && props.ptdlColumns) || {};
  const vals = actionModel.__ptdlFilterVals || (actionModel.__ptdlFilterVals = {});
  const setVal = (name: string, v: any) => {
    if (v == null || (Array.isArray(v) && !v.length)) delete vals[name];
    else vals[name] = v;
    if (runRef.current) runRef.current();
    force((n) => n + 1);
  };

  // Not configured yet → show a VISIBLE dashed placeholder. Otherwise the action renders an empty <Space> =
  // invisible, so you can't even hover it to reach its ⚙ to pick columns (unlike the search bar, which always
  // shows its input). This guides the user to configure.
  if (!names.length) {
    return (
      <span
        onClick={(e: any) => e.stopPropagation()}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          height: 32,
          padding: '0 12px',
          border: `1px dashed ${token.colorBorder}`,
          borderRadius: 8,
          color: token.colorTextTertiary,
          fontSize: 13,
          whiteSpace: 'nowrap',
        }}
      >
        <FilterIcon size={15} />
        {t('Filter bar')}
        <span style={{ opacity: 0.75, fontSize: 12 }}>· {t('Choose dropdown / date columns')}</span>
      </span>
    );
  }

  return (
    <Space wrap size={8} onClick={(e: any) => e.stopPropagation()}>
      {names.map((name) => {
        const m = meta[name];
        // meta still loading → a disabled placeholder so the control is visible immediately (not blank).
        if (!m) return <Select key={name} disabled placeholder={name} style={{ minWidth: w }} />;
        const ph = (cols[name] && cols[name].placeholder) || m.title;
        if (m.kind === 'date') {
          const s = vals[name];
          const value: any = Array.isArray(s) && s[0] && s[1] ? [dayjs(s[0]), dayjs(s[1])] : null;
          return (
            <DatePicker.RangePicker
              key={name}
              value={value}
              allowClear
              suffixIcon={<CalendarIcon size={15} />}
              presets={buildDatePresets()}
              placeholder={[ph, t('End')]}
              style={{ width: w + 90 }}
              onChange={(d: any) =>
                setVal(name, d && d[0] && d[1] ? [d[0].startOf('day').toISOString(), d[1].endOf('day').toISOString()] : null)
              }
            />
          );
        }
        const options = m.kind === 'enum' ? m.enumOptions || [] : relOpts[name] || [];
        return (
          <Select
            key={name}
            mode="multiple"
            allowClear
            showSearch
            optionFilterProp="label"
            maxTagCount="responsive"
            suffixIcon={<ChevronIcon size={15} />}
            placeholder={ph}
            style={{ minWidth: w, maxWidth: w + 140 }}
            value={vals[name] || []}
            options={options}
            onChange={(v: any) => setVal(name, v)}
          />
        );
      })}
    </Space>
  );
}

/** Config field picker — multi-select of ONLY the eligible (dropdown + date) columns, fetched at render. */
function FilterFieldPicker(p: any) {
  let model: any = null;
  try {
    model = (useFlowSettingsContext() as any)?.model || null;
  } catch (_) {
    /* not in a settings context */
  }
  const [options, setOptions] = useState<any[]>([]);
  useEffect(() => {
    const api = apiOfModel(model);
    const coll = collectionOfModel(model);
    const collName = coll && coll.name;
    if (!api || !collName) return;
    fetchFields(api, collName, dsKeyOfModel(model))
      .then((fields) =>
        setOptions(
          // `title` (plain string) drives search; `label` is JSX with a Lucide kind icon (date → Calendar,
          // dropdown → ChevronDown) so both the option list AND the selected tags show the icon, not an emoji.
          classifyFields(fields).map((c) => ({
            value: c.name,
            title: c.title,
            label: (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {c.title}
                {c.kind === 'date' ? <CalendarIcon size={13} /> : <ChevronIcon size={13} />}
              </span>
            ),
          })),
        ),
      )
      .catch(() => setOptions([]));
  }, [model]);
  return (
    <Select
      mode="multiple"
      allowClear
      showSearch
      filterOption={(input: string, option: any) => String(option?.title || '').toLowerCase().includes(input.toLowerCase())}
      maxTagCount="responsive"
      value={p.value || []}
      onChange={(v: any) => p.onChange && p.onChange(v)}
      options={options}
      placeholder={t('Choose dropdown / date columns')}
      style={{ width: '100%' }}
    />
  );
}

/** The DEFAULT-value control for a column, matching its kind: enum/relation → multi-Select; date → a preset
 *  dropdown (stores a KEY like 'thisMonth', recomputed to the current period on load). */
function defaultControl(m: FieldMeta | undefined, value: any, onChange: (v: any) => void, relOpts?: any[]): React.ReactNode {
  if (!m) return <Input size="small" disabled placeholder="…" />;
  if (m.kind === 'date') {
    return (
      <Select
        size="small"
        allowClear
        placeholder={t('No default')}
        style={{ width: '100%' }}
        value={value || undefined}
        options={datePresetDefs().map((d) => ({ label: d.label, value: d.key }))}
        onChange={(v: any) => onChange(v || null)}
      />
    );
  }
  const options = m.kind === 'enum' ? m.enumOptions || [] : relOpts || [];
  return (
    <Select
      size="small"
      mode="multiple"
      allowClear
      showSearch
      optionFilterProp="label"
      maxTagCount="responsive"
      placeholder={t('No default')}
      style={{ width: '100%' }}
      value={value || []}
      options={options}
      onChange={(v: any) => onChange(v && v.length ? v : null)}
    />
  );
}

/** Combined per-column editor — ONE row per picked column with its DEFAULT value and its custom PLACEHOLDER
 *  side by side, so both are configured in one place. Bound to the `ptdlColumns` map
 *  `{ [field]: { default, placeholder } }`. Reactive to the field picker above. */
const FilterColumnsEditor: any = observer((p: any) => {
  const form: any = useForm();
  const { token } = theme.useToken();
  const names: string[] = Array.isArray(form?.values?.ptdlFilterFields) ? form.values.ptdlFilterFields : [];
  let model: any = null;
  try {
    model = (useFlowSettingsContext() as any)?.model || null;
  } catch (_) {
    /* ignore */
  }
  const [meta, setMeta] = useState<Record<string, FieldMeta>>({});
  const [relOpts, setRelOpts] = useState<Record<string, Array<{ label: string; value: any }>>>({});
  useEffect(() => {
    const api = apiOfModel(model);
    const coll = collectionOfModel(model);
    const collName = coll && coll.name;
    if (!api || !collName) return;
    fetchFields(api, collName, dsKeyOfModel(model))
      .then((fields) => {
        const map: Record<string, FieldMeta> = {};
        classifyFields(fields).forEach((c) => (map[c.name] = c));
        setMeta(map);
        const cm = cmOfModel(model);
        Object.values(map)
          .filter((m) => m.kind === 'relation')
          .forEach((m) => {
            fetchRelationOptions(api, m, dsKeyOfModel(model), cm)
              .then((opts) => setRelOpts((x) => ({ ...x, [m.name]: opts })))
              .catch(() => {});
          });
      })
      .catch(() => {});
  }, [model]);
  const cols: Record<string, { default?: any; placeholder?: string }> = p.value || {};
  const patch = (name: string, key: 'default' | 'placeholder', val: any) => {
    const next = { ...cols };
    const entry: any = { ...(next[name] || {}) };
    if (val == null || (Array.isArray(val) && !val.length) || val === '') delete entry[key];
    else entry[key] = val;
    if (Object.keys(entry).length) next[name] = entry;
    else delete next[name];
    p.onChange && p.onChange(next);
  };
  if (!names.length) return <span style={{ color: token.colorTextTertiary, fontSize: 12 }}>{t('Pick columns first')}</span>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', gap: 8, fontSize: 11, color: token.colorTextQuaternary }}>
        <span style={{ width: 116, flex: 'none' }} />
        <span style={{ flex: 1 }}>{t('Default values')}</span>
        <span style={{ flex: 1 }}>{t('Custom placeholders')}</span>
      </div>
      {names.map((name) => {
        const m = meta[name];
        const entry = cols[name] || {};
        return (
          <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              title={(m && m.title) || name}
              style={{ width: 116, flex: 'none', color: token.colorTextTertiary, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {(m && m.title) || name}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>{defaultControl(m, entry.default, (v) => patch(name, 'default', v), relOpts[name])}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Input
                size="small"
                value={entry.placeholder || ''}
                placeholder={(m && m.title) || name}
                onChange={(e: any) => patch(name, 'placeholder', e.target.value)}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
});

/** Live preview — reactive disabled controls mirroring the picked columns (fetches meta for the kind labels). */
const FilterBarPreview: any = observer(() => {
  const form: any = useForm();
  const { token } = theme.useToken();
  const v = (form && form.values) || {};
  const names: string[] = Array.isArray(v.ptdlFilterFields) ? v.ptdlFilterFields : [];
  let model: any = null;
  try {
    model = (useFlowSettingsContext() as any)?.model || null;
  } catch (_) {
    /* ignore */
  }
  const [meta, setMeta] = useState<Record<string, FieldMeta>>({});
  useEffect(() => {
    const api = apiOfModel(model);
    const coll = collectionOfModel(model);
    const collName = coll && coll.name;
    if (!api || !collName) return;
    fetchFields(api, collName, dsKeyOfModel(model))
      .then((fields) => {
        const map: Record<string, FieldMeta> = {};
        classifyFields(fields).forEach((c) => (map[c.name] = c));
        setMeta(map);
      })
      .catch(() => {});
  }, [model]);
  const w = WIDTH_PX[v.ptdlControlWidth] || 180;
  return (
    <div style={{ padding: '10px 12px', background: token.colorFillQuaternary, borderRadius: 6, border: `1px dashed ${token.colorBorder}` }}>
      {names.length ? (
        <Space wrap size={8}>
          {names.map((name) => {
            const m = meta[name];
            if (m && m.kind === 'date')
              return <DatePicker.RangePicker key={name} disabled placeholder={[m.title, '']} style={{ width: w + 90 }} />;
            return (
              <Select
                key={name}
                disabled
                mode="multiple"
                placeholder={m ? m.title : name}
                style={{ minWidth: w }}
                options={m && m.enumOptions ? m.enumOptions : []}
              />
            );
          })}
        </Space>
      ) : (
        <span style={{ color: '#999', fontSize: 12 }}>{t('Pick columns to preview')}</span>
      )}
    </div>
  );
});

export function registerFilterAction(deps: { flowEngine: any; tExpr: (s: string, o?: any) => any; lane: string }) {
  const { flowEngine, tExpr, lane } = deps;
  const te = (s: string) => tExpr(s, { ns: NS });

  const bind = (attempt = 0) => {
    const ActionBase: any = flowEngine?.getModelClass?.('ActionModel');
    if (!ActionBase) {
      if (attempt < 15) setTimeout(() => bind(attempt + 1), 800);
      return;
    }
    if (flowEngine.getModelClass?.('PtdlFilterActionModel')) return; // already registered

    class PtdlFilterActionModel extends ActionBase {
      static scene = 'collection';
      enableEditTitle = false;
      enableEditIcon = false;
      enableEditType = false;
      enableEditDanger = false;
      enableEditColor = false;

      getAclActionName() {
        return 'view';
      }

      render() {
        return <FilterBarInline actionModel={this} />;
      }
    }

    try {
      flowEngine.registerModels({ PtdlFilterActionModel });
      (PtdlFilterActionModel as any).define({ label: te('Filter bar'), sort: 61 });
      try {
        registerFlowComponentsOnce(flowEngine.flowSettings, { PtdlFilterPreview: FilterBarPreview, PtdlFilterGrid: SettingsGrid });
      } catch (e) {
        /* preview optional */
      }

      (PtdlFilterActionModel as any).registerFlow({
        key: 'ptdlFilterSettings',
        title: te('Filter bar'),
        sort: 100,
        steps: {
          settings: {
            title: te('Filter bar'),
            uiMode: { type: 'dialog', props: { width: 600 } },
            uiSchema() {
              const cell = (title: string, comp: any, extra: any = {}) => ({
                'x-decorator': 'FormItem',
                'x-decorator-props': { style: { marginBottom: 8 } },
                'x-component': comp,
                title: te(title),
                ...(extra.type ? { type: extra.type } : {}),
                ...(extra.props ? { 'x-component-props': extra.props } : {}),
                ...(extra.enum ? { enum: extra.enum } : {}),
              });
              const seg = (options: any[]) => ({ size: 'middle', block: true, options });
              return {
                preview: {
                  type: 'void',
                  'x-decorator': 'FormItem',
                  'x-decorator-props': { style: { marginBottom: 8 } },
                  'x-component': 'PtdlFilterPreview',
                },
                ptdlFilterFields: cell('Filter columns', FilterFieldPicker, { type: 'array' }),
                ptdlColumns: cell('Column defaults & placeholders', FilterColumnsEditor, { type: 'object' }),
                row: {
                  type: 'void',
                  'x-component': 'PtdlFilterGrid',
                  properties: {
                    ptdlControlWidth: cell('Width', SegmentedGroup, {
                      props: seg([
                        { value: 'narrow', label: te('Narrow') },
                        { value: 'normal', label: te('Normal') },
                        { value: 'wide', label: te('Wide') },
                      ]),
                    }),
                    position: cell('Position', SegmentedGroup, {
                      props: seg([
                        { value: 'left', label: te('Left') },
                        { value: 'right', label: te('Right') },
                      ]),
                    }),
                  },
                },
              };
            },
            defaultParams(ctx: any) {
              const p = (ctx.model && ctx.model.props) || {};
              return {
                ptdlFilterFields: Array.isArray(p.ptdlFilterFields) ? p.ptdlFilterFields : [],
                ptdlColumns: p.ptdlColumns && typeof p.ptdlColumns === 'object' ? p.ptdlColumns : {},
                ptdlControlWidth: p.ptdlControlWidth || 'normal',
                position: p.position || 'left',
              };
            },
            handler(ctx: any, params: any) {
              const p = params || {};
              ctx.model.setProps({
                ptdlFilterFields: Array.isArray(p.ptdlFilterFields) ? p.ptdlFilterFields : [],
                ptdlColumns: p.ptdlColumns && typeof p.ptdlColumns === 'object' ? p.ptdlColumns : {},
                ptdlControlWidth: p.ptdlControlWidth || 'normal',
                position: p.position || 'left',
              });
              // Let freshly-saved defaults re-seed on next open (the live bar's once-flag is per model instance).
              try {
                ctx.model.__ptdlDefaultsApplied = false;
              } catch (_) {
                /* best effort */
              }
            },
          },
        },
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(`[action-enh] (${lane}) filter action register failed`, e);
    }
  };

  bind();
}
