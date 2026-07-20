import React from 'react';
import { Slider, Switch, theme } from 'antd';
import { observer, useForm } from '@formily/react';
import {
  colorToString, ColorField, IconByKey, RegistryIconPicker, setIconRegistry,
  SettingsGrid, fi, rx, ResetButton, PreviewBox, CollapsibleSection, registerSettingsKit,
  SegmentedGroup,
} from '@tuanla90/shared';

/**
 * @tuanla90/plugin-custom-header — STANDALONE. Ships ZERO icon library.
 *
 * Customizes FlowEngine title/label rendering on both clients (/ and /v/):
 *  - PAGE HEADER   (registerCustomHeader → PageModel):            icon + color + size + bold + background.
 *  - TABLE COLUMN  (registerColumnHeader → TableColumnModel):     icon + color + bold on the column header.
 *  - FORM/DETAIL   (registerFieldLabel → FormItemModel/DetailsItemModel): icon + color + bold on the field label.
 *
 * HYBRID styling source (per field): a FIELD-LEVEL default stored server-side in the dedicated
 * `ptdlFieldStyles` collection (one row per dataSource+collection+field), loaded into `fieldCache`
 * once at client startup and read synchronously during render — set once, shows in every view —
 * MERGED with an optional PER-VIEW override stored in the model's flow params (`chFieldStyle`).
 * Override wins per property; otherwise the field default applies. The write path is the
 * "Apply to all views" toggle in the column / form / detail "style" dialog (→ upsertFieldStyle).
 *
 * IMPORTANT: never replace a model's `props.title`/`props.label` STRING with a node — many consumers
 * read it as a string and call `.trim()` (core onCell, @tuanla90 enhanced-table columnTitles/summary).
 * So we keep the string prop intact and decorate only the VISUAL render output:
 *  - table  → wrap the antd column `title` node inside a patched `getColumnProps`,
 *  - form/detail → clone the rendered FormItem with a decorated `label` inside a patched `renderItem`.
 *
 * Icons render through NocoBase's shared registry (Icon + icons Map) — full Lucide with
 * @tuanla90/plugin-custom-icons installed; no icon library bundled here. This file imports NOTHING from
 * @nocobase/client(-v2); those symbols are injected per-lane (keeps the client-v2 bundle clean).
 */

const MARK = 'data-ch-raw'; // marks the page wrapper so we can recover the raw title text

// i18n: all settings labels resolve against this plugin namespace (registered per-lane via
// `app.i18n.addResources(lang, CH_NS, json)`). `t()` emits `{{t("key", { ns })}}` expression strings
// that FlowEngine flow/step titles and uiSchema titles compile — same pattern as
// @tuanla90/plugin-enhanced-table-block. A missing key falls back to the key text (English), so an
// incomplete locale never breaks the UI.
const CH_NS = '@tuanla90/plugin-custom-header/client';
const t = (s: string) => `{{t(${JSON.stringify(s)}, { ns: ${JSON.stringify(CH_NS)} })}}`;

// Runtime translator for React-rendered labels (Segmented options, "Preview", preview placeholders)
// that are NOT compiled through the schema `{{t()}}` path. Injected per-lane via setRuntimeT with the
// app i18n; defaults to identity (English) until set.
let tt: (s: string) => string = (s) => s;
export function setRuntimeT(fn: (s: string) => string) {
  if (typeof fn === 'function') tt = fn;
}

function normColor(c: any): string | undefined {
  return colorToString(c);
}

// Compose a CSS background from the header bg color(s): solid when only the first is set; a two-stop
// linear-gradient when a second color is chosen. `dir` is a CSS gradient keyword (e.g. "to bottom").
function bgToCss(bg?: string, bg2?: string, dir?: string): string | undefined {
  if (bg && bg2) return `linear-gradient(${dir || 'to bottom'}, ${bg}, ${bg2})`;
  return bg || undefined;
}

type TitleStyle = { color?: string; size?: number; bold?: boolean; iconKey?: string; iconRight?: boolean };

// Read a per-view override out of settings params / form values.
function readStyle(v: any): TitleStyle & { bg?: string; bg2?: string; bgDir?: string; bgCss?: string; hasTitleStyle: boolean } {
  const color = normColor(v?.titleColor);
  const bg = normColor(v?.headerBg);
  const bg2 = normColor(v?.headerBg2);
  const bgDir = v?.bgDirection || 'to bottom';
  const size = typeof v?.titleSize === 'number' && v.titleSize > 0 ? v.titleSize : undefined;
  const bold = !!v?.titleBold;
  const iconKey = v?.titleIcon || undefined;
  const iconRight = v?.iconPosition === 'right';
  return { color, bg, bg2, bgDir, bgCss: bgToCss(bg, bg2, bgDir), size, bold, iconKey, iconRight, hasTitleStyle: !!(color || size || bold || iconKey) };
}

// ---- FIELD-LEVEL default styles (option b): a dedicated collection `ptdlFieldStyles`, loaded once
// into this cache at client startup and read synchronously during render. Set once per field →
// shows in every table/form/detail. ------------------------------------------------------------
const fieldCache = new Map<string, TitleStyle>();

function keyOf(cf: any): string | undefined {
  if (!cf) return undefined;
  const ds = cf.dataSourceKey || 'main';
  const cn = cf.collectionName;
  const fn = cf.name;
  if (!cn || !fn) return undefined;
  return `${ds}.${cn}.${fn}`;
}

function getFieldDefaultStyle(cf: any): TitleStyle | undefined {
  const k = keyOf(cf);
  return k ? fieldCache.get(k) : undefined;
}

function setFieldDefaultStyle(cf: any, s: TitleStyle | undefined) {
  const k = keyOf(cf);
  if (!k) return;
  if (s && (s.iconKey || s.color || s.bold)) fieldCache.set(k, s);
  else fieldCache.delete(k);
}

function styleEq(a?: TitleStyle, b?: TitleStyle): boolean {
  const x = a || {};
  const y = b || {};
  return (x.iconKey || '') === (y.iconKey || '') && !!x.iconRight === !!y.iconRight && (x.color || '') === (y.color || '') && !!x.bold === !!y.bold;
}

// Populate the cache from the server. Call (awaited) in each lane's plugin load().
export async function loadFieldStyleCache(api: any) {
  if (!api?.request) return;
  try {
    const res = await api.request({ url: 'ptdlFieldStyles:list', params: { pageSize: 1000 } });
    const rows = res?.data?.data || [];
    const total = res?.data?.meta?.count;
    if (typeof total === 'number' && total > rows.length) {
      // eslint-disable-next-line no-console
      console.warn(
        `[custom-header] field-style cache truncated: loaded ${rows.length}/${total} rows (pageSize cap 1000). ` +
          'Some field-level defaults may not apply until pagination is added.',
      );
    }
    fieldCache.clear();
    for (const r of rows) {
      const key = `${r.dataSource || 'main'}.${r.collectionName}.${r.fieldName}`;
      fieldCache.set(key, {
        iconKey: r.icon || undefined,
        iconRight: r.iconPosition === 'right',
        color: normColor(r.color),
        bold: !!r.bold,
      });
    }
    // eslint-disable-next-line no-console
    console.log('[custom-header] field-style cache loaded:', fieldCache.size);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[custom-header] load field-style cache failed (table may be new/empty)', e);
  }
}

// C6 — cross-session freshness. The cache is loaded once at startup; if ANOTHER session changes a
// field-level default, this session won't see it until something re-fetches. Re-load the cache on tab
// re-focus (throttled to once / 10s) so later navigations/renders pick up other sessions' changes.
// NOTE: views already on screen only refresh on their NEXT re-render (navigate away/back, or re-open
// the block) — there is no global force-render signal.
let _autoRefreshBound = false;
export function bindFieldStyleAutoRefresh(api: any) {
  if (_autoRefreshBound || typeof document === 'undefined' || !api?.request) return;
  _autoRefreshBound = true;
  let last = 0;
  const onVisible = () => {
    if (document.visibilityState !== 'visible') return;
    const now = Date.now();
    if (now - last < 10000) return; // throttle
    last = now;
    loadFieldStyleCache(api);
  };
  try {
    document.addEventListener('visibilitychange', onVisible);
  } catch (e) {
    /* ignore */
  }
}

async function upsertFieldStyle(api: any, cf: any, style: TitleStyle) {
  if (!api?.request || !cf) return;
  const values = {
    dataSource: cf.dataSourceKey || 'main',
    collectionName: cf.collectionName,
    fieldName: cf.name,
    icon: style.iconKey || null,
    iconPosition: style.iconRight ? 'right' : 'left',
    color: style.color || null,
    bold: !!style.bold,
  };
  await api.request({
    url: 'ptdlFieldStyles:updateOrCreate',
    method: 'post',
    params: { filterKeys: ['dataSource', 'collectionName', 'fieldName'] },
    data: values,
  });
}

// Merge the field-level default (cache) with a per-view override (already-read TitleStyle).
function mergeFieldStyle(collectionField: any, override?: TitleStyle): TitleStyle & { hasStyle: boolean } {
  const fd = getFieldDefaultStyle(collectionField) || {};
  const iconKey = override?.iconKey || fd.iconKey || undefined;
  const iconRight = override?.iconKey ? !!override?.iconRight : !!fd.iconRight;
  const color = override?.color || fd.color;
  const bold = !!(override?.bold || fd.bold);
  const size = override?.size;
  return { iconKey, iconRight, color, bold, size, hasStyle: !!(iconKey || color || bold || size) };
}

// The styled title node (page). PageHeader `title` accepts a ReactNode; nothing .trims the page title.
function styledTitleSpan(text: any, s: TitleStyle) {
  const iconEl = s.iconKey ? (
    <span style={{ display: 'inline-flex', fontSize: s.size ? Math.round(s.size * 0.9) : undefined }}>
      <IconByKey type={s.iconKey} />
    </span>
  ) : null;
  return (
    <span
      {...{ [MARK]: typeof text === 'string' ? text : undefined }}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: s.color, fontSize: s.size, fontWeight: s.bold ? 700 : undefined, lineHeight: 1.3 }}
    >
      {s.iconRight ? null : iconEl}
      <span>{text}</span>
      {s.iconRight ? iconEl : null}
    </span>
  );
}

function extractRawTitle(cur: any): { text: string; node: any } {
  if (cur == null) return { text: '', node: null };
  if (typeof cur === 'string') return { text: cur, node: cur };
  if (React.isValidElement(cur) && (cur as any).props && MARK in (cur as any).props) {
    return { text: (cur as any).props[MARK], node: (cur as any).props[MARK] };
  }
  return { text: '', node: cur };
}

// Wrap an EXISTING header/label node with icon + color + bold, without touching the string prop.
function decorateHeader(node: any, s: TitleStyle) {
  const iconEl = s.iconKey ? <IconByKey type={s.iconKey} /> : null;
  if (!iconEl && !s.color && !s.bold && !s.size) return node;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: '100%', color: s.color, fontWeight: s.bold ? 700 : undefined, fontSize: s.size || undefined }}>
      {s.iconRight ? null : iconEl}
      {node}
      {s.iconRight ? iconEl : null}
    </span>
  );
}

// Defensive: find the first rendered element carrying a `label` prop (the FormItem) and clone it
// with a decorated label. If none found, returns the element unchanged (feature simply doesn't show).
function decorateElementLabel(el: any, s: TitleStyle): any {
  try {
    if (!React.isValidElement(el)) return el;
    const props: any = (el as any).props || {};
    if ('label' in props && props.label != null && props.label !== false) {
      return React.cloneElement(el as any, { label: decorateHeader(props.label, s) });
    }
    if (props.children != null) {
      const arr = React.Children.toArray(props.children);
      let changed = false;
      const next = arr.map((k) => {
        const nk = decorateElementLabel(k, s);
        if (nk !== k) changed = true;
        return nk;
      });
      if (changed) return React.cloneElement(el as any, undefined as any, next as any);
    }
  } catch (e) {
    /* ignore — never break render */
  }
  return el;
}

// --- Reset button + preview components --------------------------------------------------
// ResetButton now comes from @tuanla90/shared: same behavior — size="small", label "Reset",
// onClick → form.setValues(defaults, 'overwrite'). Used directly as JSX below (prop `defaults`).

const HEADER_DEFAULTS = { titleIcon: undefined, iconPosition: 'left', titleColor: undefined, titleSize: 0, titleBold: false, headerBg: undefined, headerBg2: undefined, bgDirection: 'to bottom' };
const FIELD_DEFAULTS = { titleIcon: undefined, iconPosition: 'left', titleColor: undefined, headerBg: undefined, titleSize: 0, titleBold: false, applyAllViews: false };

// Preview label row: "Preview" on the left, Reset on the right (fits PreviewBox's label slot).
const previewLabel = (defaults: any) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
    <span>{tt('Preview')}</span>
    <ResetButton defaults={defaults} />
  </div>
);

const HeaderPreview: any = observer(() => {
  const form: any = useForm();
  const s = readStyle(form?.values || {});
  const { token } = theme.useToken();
  return (
    <PreviewBox style={{ marginBottom: 12 }} label={previewLabel(HEADER_DEFAULTS)}>
      <div style={{ background: s.bgCss || 'transparent', borderRadius: 6, padding: '10px 14px' }}>
        <div style={{ fontSize: 20, fontWeight: 600, color: token.colorText }}>{styledTitleSpan(tt('Page title'), s)}</div>
      </div>
    </PreviewBox>
  );
});

// Shared preview for column + form + detail field labels.
const FieldPreview: any = observer(() => {
  const form: any = useForm();
  const s = readStyle(form?.values || {});
  const { token } = theme.useToken();
  return (
    <PreviewBox style={{ marginBottom: 12 }} label={previewLabel(FIELD_DEFAULTS)}>
      <div style={{ background: s.bgCss || 'transparent', borderRadius: 6, padding: '6px 10px' }}>
        <div style={{ fontWeight: 600, color: token.colorText }}>{styledTitleSpan(tt('Field label'), s)}</div>
      </div>
    </PreviewBox>
  );
});

// Registry-based icon picker (RegistryIconPicker) + IconByKey now come from @tuanla90/shared.

// Resolve a FlowEngine model class robustly across lanes.
function resolveModelClass(flowEngine: any, name: string, hint: any): any {
  try {
    const c = flowEngine?.getModelClass?.(name);
    if (c && typeof c.registerFlow === 'function') return c;
  } catch (e) {
    /* ignore */
  }
  let c: any = hint;
  while (c && typeof c === 'function') {
    if (c.name === name && typeof c.registerFlow === 'function') return c;
    c = Object.getPrototypeOf(c);
  }
  return hint && typeof hint.registerFlow === 'function' ? hint : null;
}

function registerSharedComponents(flowSettings: any) {
  if (!flowSettings) return;
  // Shared antd ColorPicker wrapper (16-preset palette + colorToString normalize). Kept `size="small"`
  // to match the compact settings dialog; onChange emits undefined on empty (shared default), as before.
  const ChColorPicker = (props: any) => React.createElement(ColorField, { size: 'small', ...props });
  const IconSide = (props: any) => (
    <SegmentedGroup
      value={props.value || 'left'}
      onChange={(v: any) => props.onChange?.(v)}
      options={[
        { label: tt('Left'), value: 'left' },
        { label: tt('Right'), value: 'right' },
      ]}
    />
  );
  const SizeSlider = (props: any) => {
    const v = typeof props.value === 'number' ? props.value : 0;
    const { token } = theme.useToken();
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 160 }}>
        <Slider min={0} max={40} value={v} onChange={(n: any) => props.onChange?.(n)} style={{ flex: 1 }} />
        <span style={{ width: 52, textAlign: 'right', color: token.colorTextTertiary, fontVariantNumeric: 'tabular-nums' }}>{v <= 0 ? tt('Default') : `${v}px`}</span>
      </div>
    );
  };
  const BoolSwitch = (props: any) => <Switch size="small" checked={!!props.value} onChange={(c: any) => props.onChange?.(c)} />;
  // Column alignment (antd Table column `align`): Default = no override.
  const AlignField = (props: any) => (
    <SegmentedGroup
      value={props.value || 'default'}
      onChange={(v: any) => props.onChange?.(v === 'default' ? undefined : v)}
      options={[
        { label: tt('Default'), value: 'default' },
        { label: tt('Left'), value: 'left' },
        { label: tt('Center'), value: 'center' },
        { label: tt('Right'), value: 'right' },
      ]}
    />
  );
  // Gradient direction (only relevant when a 2nd background color is set). Arrow labels — no i18n needed.
  const BgDirField = (props: any) => (
    <SegmentedGroup
      value={props.value || 'to bottom'}
      onChange={(v: any) => props.onChange?.(v)}
      options={[
        { label: '↓', value: 'to bottom' },
        { label: '→', value: 'to right' },
        { label: '↘', value: 'to bottom right' },
        { label: '↗', value: 'to top right' },
      ]}
    />
  );
  // registerSettingsKit registers the kit's SettingsGrid + CollapsibleSection (canonical names) plus
  // these extras in one call (own try/catch inside). The uiSchema references the aliases ChGrid/ChSection
  // (→ SettingsGrid/CollapsibleSection), so the aliases are kept as extras; the canonical registrations
  // are the same component objects, so they're harmless.
  registerSettingsKit(flowSettings, {
    ChGrid: SettingsGrid,
    ChColorPicker,
    ChIconPicker: RegistryIconPicker,
    ChIconSide: IconSide,
    ChSizeSlider: SizeSlider,
    ChBoolSwitch: BoolSwitch,
    ChAlign: AlignField,
    ChBgDir: BgDirField,
    ChSection: CollapsibleSection,
    ChHeaderPreview: HeaderPreview,
    ChFieldPreview: FieldPreview,
  });
}

// Thin adapter over the shared `fi` (fieldItem): keeps custom-header's call convention — translate the
// title via `t`, map the local `x-reactions` key onto fi's `reactions`, and preserve marginBottom:0 (the
// local default; shared fi defaults to 6) via decoratorProps. The fragment shape lives in @tuanla90/shared.
function cell(t: (s: string) => any, title: string, component: string, extra: any = {}) {
  const style: any = { marginBottom: 0 };
  if (extra.full) style.gridColumn = '1 / -1'; // span the whole grid row (e.g. the size slider)
  return fi(t(title), component, {
    type: extra.type,
    reactions: extra['x-reactions'],
    decoratorProps: { style },
  });
}

// Function-form reaction (shared `rx`): show "Icon position" only when an icon is chosen. Replaces the
// old string form { fulfill: { state: { visible: '{{!!$deps[0]}}' } } }, which throws "$deps is not
// defined" under v2 compileUiSchema. Same visibility semantics.
const ICON_POS_REACTION = rx((v: any) => !!v.titleIcon);
// Show "Gradient direction" only when a 2nd background color is chosen.
const BG_DIR_REACTION = rx((v: any) => !!v.headerBg2);

// Collapsible section (shared CollapsibleSection) wrapping a compact 2-col grid of field cells — the
// accordion layout other @tuanla90 settings dialogs use (e.g. layout-containers "Colors"/"Layout").
function section(t: (s: string) => any, titleKey: string, gridProps: any, opts: { defaultOpen?: boolean } = {}) {
  return {
    type: 'void',
    'x-component': 'ChSection',
    'x-component-props': { title: t(titleKey), defaultOpen: opts.defaultOpen !== false },
    properties: {
      grid: {
        type: 'void',
        'x-component': 'ChGrid',
        'x-component-props': { style: { columnGap: 16, rowGap: 8, padding: '2px 0 6px' } },
        properties: gridProps,
      },
    },
  };
}

// Field-cell groups shared by every dialog. iconLabel/colorLabel differ per surface (Title/Header/Label).
const iconCells = (t: any, iconLabel: string) => ({
  titleIcon: cell(t, iconLabel, 'ChIconPicker'),
  iconPosition: cell(t, 'Icon position', 'ChIconSide', { 'x-reactions': ICON_POS_REACTION }),
});
const textCells = (t: any, colorLabel: string) => ({
  titleColor: cell(t, colorLabel, 'ChColorPicker'),
  titleBold: cell(t, 'Bold', 'ChBoolSwitch', { type: 'boolean' }),
  titleSize: cell(t, 'Size', 'ChSizeSlider', { type: 'number', full: true }),
});
const bgCells = (t: any) => ({
  headerBg: cell(t, 'Header background', 'ChColorPicker'),
  headerBg2: cell(t, 'Background (gradient end)', 'ChColorPicker'),
  bgDirection: cell(t, 'Gradient direction', 'ChBgDir', { 'x-reactions': BG_DIR_REACTION }),
});

// Build the shared "field label style" step (used by table column + form/detail). Includes an
// "Apply to all views" toggle: ON → persist as the FIELD-LEVEL default (collection ptdlFieldStyles,
// shows everywhere); OFF → per-view override stored in this model's flow params (`chFieldStyle`).
function fieldStyleStep(t: (s: string) => any, iconLabel: string, colorLabel: string, opts: { withAlign?: boolean } = {}) {
  const sections: any = {
    iconSection: section(t, 'Icon', iconCells(t, iconLabel)),
    textSection: section(t, 'Text', textCells(t, colorLabel)),
  };
  // Column alignment is per-view (per-column), independent of the field-level default. Split into
  // HEADER align (antd `onHeaderCell` style override) vs CELL align (antd column `align`). Header
  // "Default" = follow the cell align (no override).
  if (opts.withAlign) {
    sections.alignSection = section(t, 'Alignment', {
      headerAlign: cell(t, 'Header align', 'ChAlign'),
      align: cell(t, 'Cell align', 'ChAlign'),
    });
  }
  return {
    title: t('Label style'),
    uiMode: { type: 'dialog', props: { width: 460 } },
    uiSchema: {
      preview: { type: 'void', 'x-component': 'ChFieldPreview' },
      applyAllViews: {
        type: 'boolean',
        title: t('Apply to all views (field default)'),
        'x-decorator': 'FormItem',
        'x-decorator-props': { style: { marginBottom: 8 } },
        'x-component': 'ChBoolSwitch',
      },
      ...sections,
    },
    defaultParams(ctx: any) {
      // Prefill from the field-level default if one exists (so any view shows the same starting point).
      const cf = ctx?.model?.collectionField;
      const d = cf ? getFieldDefaultStyle(cf) : undefined;
      if (d && (d.iconKey || d.color || d.bold)) {
        return { applyAllViews: true, titleIcon: d.iconKey, iconPosition: d.iconRight ? 'right' : 'left', titleColor: d.color, titleBold: d.bold };
      }
      return { ...FIELD_DEFAULTS };
    },
    async handler(ctx: any, params: any) {
      const model = ctx.model;
      const s = readStyle(params);
      // Column alignment: per-column. CELL → antd `align` (spread from props by getColumnProps);
      // HEADER → `chHeaderAlign`, applied via onHeaderCell in the getColumnProps patch.
      if (opts.withAlign) {
        model.setProps('align', params?.align || undefined);
        model.setProps('chHeaderAlign', params?.headerAlign || undefined);
      }
      if (params?.applyAllViews) {
        // Field-level default. Clear the per-view override so the field default is what shows.
        model.setProps('chFieldStyle', undefined);
        const cf = model.collectionField;
        if (cf) {
          const desired: TitleStyle = { iconKey: s.iconKey, iconRight: s.iconRight, color: s.color, bold: s.bold };
          // Only write when it actually changed (this handler also runs on every auto-apply).
          if (!styleEq(desired, getFieldDefaultStyle(cf))) {
            setFieldDefaultStyle(cf, desired);
            try {
              await upsertFieldStyle(model.context?.api, cf, desired);
            } catch (e) {
              // eslint-disable-next-line no-console
              console.warn('[custom-header] save field default failed', e);
            }
          }
        }
      } else {
        model.setProps('chFieldStyle', s.hasTitleStyle ? s : undefined);
      }
      // Nudge the current model to re-render so the change is visible immediately here.
      model.setProps('chFieldRev', Date.now());
    },
  };
}

type BaseDeps = {
  flowEngine: any;
  flowSettings?: any;
  Icon?: any;
  icons?: Map<string, any>;
};

// Wire the host Icon component + icons Map into the shared registry (@tuanla90/shared).
// Icon + icons still come from @nocobase/client(-v2) per lane — only the sink changed.
function initIcons(Icon: any, icons: any) {
  setIconRegistry(Icon, icons);
}

// ============================ PAGE HEADER ============================
export function registerCustomHeader(deps: BaseDeps & { PageModel: any }) {
  const { flowEngine, flowSettings, PageModel: pageHint, Icon, icons } = deps;
  const PageModel = resolveModelClass(flowEngine, 'PageModel', pageHint);
  if (!flowEngine || !PageModel) {
    // eslint-disable-next-line no-console
    console.warn('[custom-header] PageModel base not resolvable — skip', { hint: pageHint && pageHint.name });
    return;
  }
  initIcons(Icon, icons);
  registerSharedComponents(flowSettings);
  // eslint-disable-next-line no-console
  console.log('[custom-header] page: registering on', PageModel.name);

  try {
    (PageModel as any).registerFlow({
      key: 'ptdlCustomHeader',
      sort: 1000,
      title: t('Header appearance'),
      steps: {
        style: {
          title: t('Header appearance'),
          uiMode: { type: 'dialog', props: { width: 480 } },
          uiSchema: {
            preview: { type: 'void', 'x-component': 'ChHeaderPreview' },
            iconSection: section(t, 'Icon', iconCells(t, 'Title icon')),
            textSection: section(t, 'Text', textCells(t, 'Title color')),
            bgSection: section(t, 'Background', bgCells(t)),
          },
          defaultParams: { ...HEADER_DEFAULTS },
          handler(ctx: any, params: any) {
            const model = ctx.model;
            const { text, node } = extractRawTitle(model.props.title);
            const s = readStyle(params);
            if (!s.hasTitleStyle) model.setProps('title', node);
            else model.setProps('title', styledTitleSpan(text, s));
            const hs = { ...(model.props.headerStyle || {}) };
            if (s.bgCss) { hs.background = s.bgCss; delete hs.backgroundColor; } else { delete hs.background; delete hs.backgroundColor; }
            model.setProps('headerStyle', hs);
            // Also tint the tab bar so the header background covers the tabs section too.
            const tbs = { ...(model.props.tabBarStyle || {}) };
            if (s.bgCss) { tbs.background = s.bgCss; delete tbs.backgroundColor; } else { delete tbs.background; delete tbs.backgroundColor; }
            model.setProps('tabBarStyle', tbs);
          },
        },
      },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[custom-header] page registerFlow failed', e);
  }
}

// Inject the icon INSIDE the column title's inner ellipsis <div> (alongside the title text/component)
// and apply color/bold there, so antd's column `align` (text-align, inherited by the div) moves the
// icon AND the text together. Keeps the Droppable/FlowsFloatContextMenu wrapper (settings menu) intact.
function injectIconIntoTitle(node: any, s: TitleStyle): any {
  if (!React.isValidElement(node)) return node;
  if ((node as any).type === 'div') {
    // Align the icon to the text (baseline-relative) so it doesn't ride high; add a small gap.
    const iconEl = s.iconKey ? (
      <span
        style={{ display: 'inline-flex', flex: 'none', verticalAlign: '-0.14em', marginRight: s.iconRight ? 0 : 6, marginLeft: s.iconRight ? 6 : 0 }}
      >
        <IconByKey type={s.iconKey} />
      </span>
    ) : null;
    const style = { ...((node as any).props.style || {}), color: s.color, fontWeight: s.bold ? 700 : undefined, fontSize: s.size || undefined };
    return React.cloneElement(
      node as any,
      { style },
      s.iconRight ? null : iconEl,
      <span key="__cht">{(node as any).props.children}</span>,
      s.iconRight ? iconEl : null,
    );
  }
  const kids = (node as any).props?.children;
  if (kids != null) {
    const arr = React.Children.toArray(kids);
    let changed = false;
    const next = arr.map((k) => {
      const nk = injectIconIntoTitle(k, s);
      if (nk !== k) changed = true;
      return nk;
    });
    if (changed) return React.cloneElement(node as any, undefined as any, next as any);
  }
  return node;
}

// Patch a column model's own getColumnProps (icon/color/bold via injectIconIntoTitle; align via
// props.align which the method already spreads). Guarded per-prototype; only patches classes that
// OWN getColumnProps (so inherited copies aren't double-wrapped).
function patchColumnGetProps(C: any) {
  if (!C) return;
  const proto: any = C.prototype;
  if (!proto || !Object.prototype.hasOwnProperty.call(proto, 'getColumnProps') || typeof proto.getColumnProps !== 'function') return;
  if (Object.prototype.hasOwnProperty.call(proto, '__chColPatched')) return;
  const orig = proto.getColumnProps;
  proto.getColumnProps = function (this: any) {
    const cp = orig.apply(this, arguments);
    try {
      const s = mergeFieldStyle(this?.collectionField, this?.props?.chFieldStyle);
      if (cp && s.hasStyle) cp.title = injectIconIntoTitle(cp.title, s);
      // Header alignment override (independent of cell `align`): antd merges onHeaderCell `style`
      // AFTER the align-derived text-align, so this wins for the <th> only; body cells keep `align`.
      const ha = this?.props?.chHeaderAlign;
      if (cp && ha) {
        const prev = cp.onHeaderCell;
        cp.onHeaderCell = (col: any) => {
          const base = (typeof prev === 'function' ? prev(col) : undefined) || {};
          return { ...base, style: { ...(base.style || {}), textAlign: ha } };
        };
      }
    } catch (e) {
      /* ignore */
    }
    return cp;
  };
  proto.__chColPatched = true;
}

// ============================ TABLE COLUMN HEADER ============================
// Covers field columns (TableColumnModel) AND custom/JS columns (JSColumnModel extends
// TableCustomColumnModel — a separate branch). Flow goes on the two bases so the "Column style" item
// shows in both menus; getColumnProps is patched on each concrete class that owns it.
export function registerColumnHeader(deps: BaseDeps & { TableColumnModel: any }) {
  const { flowEngine, flowSettings, TableColumnModel: colHint, Icon, icons } = deps;
  const fieldCol = resolveModelClass(flowEngine, 'TableColumnModel', colHint);
  const customCol = resolveModelClass(flowEngine, 'TableCustomColumnModel', undefined);
  const jsCol = resolveModelClass(flowEngine, 'JSColumnModel', undefined);
  if (!flowEngine || (!fieldCol && !customCol)) {
    // eslint-disable-next-line no-console
    console.warn('[custom-header] column models not resolvable — skip', { hint: colHint && colHint.name });
    return;
  }
  initIcons(Icon, icons);
  registerSharedComponents(flowSettings);

  // Patch the concrete classes that own getColumnProps.
  [fieldCol, jsCol].forEach((C) => {
    try {
      patchColumnGetProps(C);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[custom-header] column patch failed', e);
    }
  });

  // Register the "Column style" flow on both column bases.
  [fieldCol, customCol].forEach((C) => {
    if (!C || typeof (C as any).registerFlow !== 'function') return;
    try {
      (C as any).registerFlow({
        key: 'ptdlColumnHeader',
        sort: 490, // just above the core column-settings group (sort 500) — top of the column menu
        title: t('Column style'),
        steps: { style: { ...fieldStyleStep(t, 'Header icon', 'Header color', { withAlign: true }), title: t('Column style') } },
      });
      // eslint-disable-next-line no-console
      console.log('[custom-header] column: registered on', (C as any).name);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[custom-header] column registerFlow failed', e);
    }
  });
}

// ============================ FORM / DETAIL FIELD LABEL ============================
// Generic: patches `renderItem` to decorate the FormItem label, and registers a per-view "Label
// style" settings item. Used for FormItemModel and DetailsItemModel.
export function registerFieldLabel(deps: BaseDeps & { modelName: string; ModelHint: any; flowKey: string }) {
  const { flowEngine, flowSettings, modelName, ModelHint, flowKey, Icon, icons } = deps;
  const ModelClass = resolveModelClass(flowEngine, modelName, ModelHint);
  if (!flowEngine || !ModelClass) {
    // eslint-disable-next-line no-console
    console.warn('[custom-header] field-label model not resolvable — skip', { modelName, hint: ModelHint && ModelHint.name });
    return;
  }
  initIcons(Icon, icons);
  registerSharedComponents(flowSettings);
  // eslint-disable-next-line no-console
  console.log('[custom-header] field-label: registering on', ModelClass.name);

  // Patch renderItem ONCE: decorate the rendered FormItem's label (string prop stays intact).
  try {
    const proto: any = (ModelClass as any).prototype;
    if (proto && !proto.__chLabelPatched && typeof proto.renderItem === 'function') {
      const orig = proto.renderItem;
      proto.renderItem = function (this: any) {
        const el = orig.apply(this, arguments);
        try {
          const s = mergeFieldStyle(this?.collectionField, this?.props?.chFieldStyle);
          if (s.hasStyle) return decorateElementLabel(el, s);
        } catch (e) {
          /* ignore */
        }
        return el;
      };
      proto.__chLabelPatched = true;
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[custom-header] field-label patch failed', e);
  }

  try {
    (ModelClass as any).registerFlow({
      key: flowKey,
      sort: 1000,
      title: t('Label style'),
      steps: { style: fieldStyleStep(t, 'Label icon', 'Label color') },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[custom-header] field-label registerFlow failed', e);
  }
}

// ============================ BLOCK / SECTION TITLE ============================
// Block title = `decoratorProps.title` (string) rendered by BlockItemCard. We keep the string and
// decorate only the rendered card's `title` node (icon + color + bold) via a render() patch.
export function registerBlockStyle(deps: BaseDeps & { BlockModelHint: any }) {
  const { flowEngine, flowSettings, BlockModelHint, Icon, icons } = deps;
  const BlockModel = resolveModelClass(flowEngine, 'BlockModel', BlockModelHint);
  if (!flowEngine || !BlockModel) {
    // eslint-disable-next-line no-console
    console.warn('[custom-header] BlockModel not resolvable — skip', { hint: BlockModelHint && BlockModelHint.name });
    return;
  }
  initIcons(Icon, icons);
  registerSharedComponents(flowSettings);
  // eslint-disable-next-line no-console
  console.log('[custom-header] block: registering on', BlockModel.name);

  try {
    const proto: any = (BlockModel as any).prototype;
    if (proto && !proto.__chBlockPatched && typeof proto.render === 'function') {
      const orig = proto.render;
      proto.render = function (this: any) {
        const el = orig.apply(this, arguments);
        try {
          const s = this?.props?.chBlockStyle;
          if (s && (s.iconKey || s.color || s.bold || s.bg || s.size) && React.isValidElement(el)) {
            const p: any = {};
            if ((s.iconKey || s.color || s.bold || s.size) && (el as any).props?.title != null) {
              p.title = decorateHeader((el as any).props.title, s);
            }
            if (s.bg) {
              // BlockItemCard spreads `...rest` last, so a `styles` prop overrides its own — provide
              // the full styles (keep the body layout) plus the header background.
              p.styles = {
                body: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'auto' },
                // marginTop:0 (core uses 8px) so the tinted header sits flush at the card top — no white strip above.
                header: { marginTop: 0, background: s.bgCss },
              };
            }
            if (Object.keys(p).length) return React.cloneElement(el as any, p);
          }
        } catch (e) {
          /* ignore */
        }
        return el;
      };
      proto.__chBlockPatched = true;
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[custom-header] block patch failed', e);
  }

  try {
    (BlockModel as any).registerFlow({
      key: 'ptdlBlockStyle',
      sort: 1, // near the top of the block settings menu, next to core "Title & description" (sort 0)
      title: t('Block title style'),
      steps: {
        style: {
          title: t('Block title style'),
          uiMode: { type: 'dialog', props: { width: 480 } },
          uiSchema: {
            preview: { type: 'void', 'x-component': 'ChFieldPreview' },
            iconSection: section(t, 'Icon', iconCells(t, 'Title icon')),
            textSection: section(t, 'Text', textCells(t, 'Title color')),
            bgSection: section(t, 'Background', bgCells(t)),
          },
          defaultParams: { titleIcon: undefined, iconPosition: 'left', titleColor: undefined, headerBg: undefined, headerBg2: undefined, bgDirection: 'to bottom', titleSize: 0, titleBold: false },
          handler(ctx: any, params: any) {
            const s = readStyle(params);
            ctx.model.setProps('chBlockStyle', s.hasTitleStyle || s.bg ? s : undefined);
          },
        },
      },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[custom-header] block registerFlow failed', e);
  }
}
