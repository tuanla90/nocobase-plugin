import React from 'react';
import { Button, Space, Tooltip, theme } from 'antd';
import { useForm, observer } from '@formily/react';
import { ChevronRight, Info } from 'lucide-react';
import { ColorField } from './colorField';
import { ColumnSelect } from './fieldPicker';

/**
 * Settings-dialog kit — canonical config-panel primitives, shared so plugins stop re-inventing them.
 * React + antd + @formily/react (all externalized in the shared build).
 *
 * TWO LANES (a plugin's settings live in one of them):
 *  (A) Formily uiSchema lane — flow-engine model settings: `uiSchema` of `fi()` cells + void
 *      containers, values live flat in `form.values`. Primitives: SettingsGrid, fieldItem/fi, rx,
 *      visibleWhen, ResetButton, PreviewBox, CollapsibleSection, colorStrip, livePreview/previewField,
 *      registerSettingsKit, SEG_PROPS. Reference plugin: custom-header, layout-containers.
 *  (B) Plain-React lane — a `pluginSettingsManager` PAGE or a plain-React editor registered as a
 *      single value/onChange component. The (A) primitives that call `useForm()` (fi/rx/ResetButton)
 *      do NOT apply. Use: Hint, SettingRow, ControlGrid, SettingCard, SaveBar, PreviewPane, ColorField.
 *      Reference plugin: global-search Settings.tsx.
 *
 * GOTCHA: never the `{{$deps}}` x-reactions string (throws "$deps is not defined" under v2
 * compileUiSchema → fields silently never toggle). Use `rx(v => ...)` / `visibleWhen(dep, val)`.
 */

// ============================================================================
// (B0) Settings-PAGE container (page-level chrome, used by every @tuanla90 config page)
// ============================================================================

/**
 * The standard settings-PAGE frame: a white, bordered, radius-8 card that every @tuanla90 config page sits
 * in — matches native NocoBase settings (change-log / print-template). See CONFIG-PAGE-DESIGN.md.
 * `maxWidth` (default 1440) + centring keeps every page/tab the SAME width (no resize when switching
 * tabs). `padded` adds the 16px body pad; set `padded={false}` when the child is a full-bleed `<Tabs>`
 * (its bar/panels pad themselves). Colours use theme tokens so it adapts to antd dark mode.
 */
export function ConfigContainer({
  maxWidth = 1440,
  padded = true,
  style,
  children,
}: {
  maxWidth?: number;
  padded?: boolean;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const { token } = theme.useToken();
  return (
    <div style={{ padding: '8px 16px 16px', maxWidth, margin: '0 auto' }}>
      <div
        style={{
          background: token.colorBgContainer,
          border: `0.8px solid ${token.colorBorderSecondary}`,
          borderRadius: 8,
          padding: padded ? 16 : 0,
          ...style,
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ============================================================================
// (A) Formily uiSchema lane
// ============================================================================

/** Config grid. Default fixed 2-col; pass `minColWidth` for a responsive auto-fit grid (columns
 *  collapse on narrow dialogs). Override columns/gap via `style` (e.g. '1fr auto'). */
export function SettingsGrid(props: any) {
  const cols = props.minColWidth ? `repeat(auto-fit, minmax(${props.minColWidth}px, 1fr))` : '1fr 1fr';
  return (
    <div style={{ display: 'grid', gridTemplateColumns: cols, gap: '2px 16px', ...(props.style || {}) }}>
      {props.children}
    </div>
  );
}

/** FormItem-cell schema fragment: `fieldItem(title, componentName, {type, componentProps, reactions, decoratorProps})`. */
export function fieldItem(title: string, component: string, extra?: any) {
  return {
    type: extra?.type || 'string',
    title,
    'x-decorator': 'FormItem',
    'x-decorator-props': { style: { marginBottom: 6 }, ...(extra?.decoratorProps || {}) },
    'x-component': component,
    ...(extra?.componentProps ? { 'x-component-props': extra.componentProps } : {}),
    ...(extra?.reactions ? { 'x-reactions': extra.reactions } : {}),
  };
}
/** alias — many plugins call it `fi`. */
export const fi = fieldItem;

/**
 * Function-form x-reactions helper: `rx(values => boolean)` → sets field visibility from form.values.
 * Use this instead of the `{{$deps}}` string form (which throws "$deps is not defined" under v2 compileUiSchema).
 */
export function rx(fn: (values: any) => boolean) {
  return (field: any) => {
    try {
      field.setState({ visible: !!fn(field?.form?.values || {}) });
    } catch (_) {
      /* ignore */
    }
  };
}
/** Convenience: visible when `values[dep]` equals `val` (or is in `val` when an array). */
export function visibleWhen(dep: string, val: any) {
  return rx((v) => (Array.isArray(val) ? val.includes(v?.[dep]) : v?.[dep] === val));
}

/** "Reset to defaults" button for the FORMILY lane — `form.setValues(defaults, 'overwrite')`.
 *  (Plain-React panels: use `SaveBar`'s `onReset` instead — this one needs `useForm()`.) */
export function ResetButton(props: any) {
  const form: any = useForm();
  return (
    <Button
      size="small"
      onClick={() => {
        try {
          form.setValues(props.defaults || {}, 'overwrite');
        } catch (_) {
          form?.reset?.();
        }
      }}
    >
      {props.label || 'Reset'}
    </Button>
  );
}

/** Preview chrome — a "Preview" label + a dashed bordered box (unifies the drifted per-plugin boxes). */
export function PreviewBox(props: any) {
  const { label = 'Preview', children, style } = props;
  const { token } = theme.useToken();
  return (
    <div style={style}>
      <div style={{ fontSize: 12, color: token.colorTextTertiary, marginBottom: 4 }}>{label}</div>
      <div
        style={{
          border: `1px dashed ${token.colorBorder}`,
          borderRadius: 6,
          padding: 12,
          background: token.colorBgLayout,
        }}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Collapsible section — title row with a chevron that shows/hides its body (the "Typography /
 * Dimension"-style accordion the settings dialogs currently fake with flat grids).
 */
export function CollapsibleSection(props: any) {
  const { title, defaultOpen = true, children, style } = props;
  const [open, setOpen] = React.useState(!!defaultOpen);
  const { token } = theme.useToken();
  return (
    <div style={{ borderTop: `1px solid ${token.colorBorderSecondary}`, ...style }}>
      <div
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
          padding: '8px 2px', fontWeight: 600, userSelect: 'none',
        }}
      >
        <ChevronRight
          size={15}
          style={{ flex: 'none', transition: 'transform .15s', transform: open ? 'rotate(90deg)' : 'none' }}
        />
        {title}
      </div>
      {open ? <div style={{ padding: '4px 2px 10px' }}>{children}</div> : null}
    </div>
  );
}

/** antd `Segmented` style preset — bordered + `block`, so segmented pickers look consistent. Spread
 *  into a Segmented's props: `<Segmented {...SEG_PROPS} …/>` or `x-component-props: { ...SEG_PROPS }`. */
export const SEG_PROPS = { block: true, style: { border: '1px solid var(--colorBorder, #d9d9d9)' } } as const;

/** Register flow-settings components ONLY if the name isn't already registered. The flow-settings
 *  component registry is GLOBAL across every field/action model AND every plugin, so registering a
 *  shared name (FormTab, SettingsGrid, ColumnSelect…) from >1 place logs "Component X is already
 *  registered and will be overwritten" (harmless overwrite, but noisy). This skips names already
 *  present. Accepts either a `flowEngine` (reads `.flowSettings`) or a `flowSettings` directly. */
export function registerFlowComponentsOnce(flowEngineOrSettings: any, comps: Record<string, any>) {
  try {
    const fs = flowEngineOrSettings?.flowSettings || flowEngineOrSettings;
    if (!fs?.registerComponents) return;
    const existing = fs.components || {};
    const fresh: Record<string, any> = {};
    for (const k of Object.keys(comps || {})) if (!(k in existing)) fresh[k] = comps[k];
    if (Object.keys(fresh).length) fs.registerComponents(fresh);
  } catch (_) {
    /* ignore */
  }
}

/** Register the kit's void components on a flow-engine `flowSettings` once (removes the per-plugin
 *  `registerComponents({ SettingsGrid, CollapsibleSection })` boilerplate). Merge extras via `extra`. */
export function registerSettingsKit(flowSettings: any, extra?: Record<string, any>) {
  // ColumnSelect is registered by default so any kit consumer can use `x-component: 'ColumnSelect'`
  // in a Formily field schema (value/onChange bind automatically; pass options via x-component-props).
  // Once-guard → no "already registered" spam when many plugins call registerSettingsKit.
  registerFlowComponentsOnce(flowSettings, { SettingsGrid, CollapsibleSection, ColumnSelect, ...(extra || {}) });
}

/** Wrap `render(values)` into an `observer` component that reactively reads the dialog's live
 *  `form.values` — a self-updating preview with no reactions/wiring. Pair with `previewField`. */
export function livePreview(render: (values: any) => React.ReactNode) {
  return observer(() => {
    const form: any = useForm();
    return <>{render(form?.values || {})}</>;
  });
}

/** Void-schema fragment placing a preview component (usually from `livePreview`) into a uiSchema.
 *  Pin it first in `properties` so it stays in view while the user edits below it. */
export function previewField(component: any, title?: string) {
  return { type: 'void', ...(title ? { title } : {}), 'x-decorator': 'FormItem', 'x-component': component };
}

/** Colour "swatch strip" — a responsive grid of text-less `ColorField` swatches (one per entry;
 *  meaning lives in each cell's decorator `tooltip`). The compact colour convention from
 *  layout-containers. Returns a void uiSchema fragment; spread its `.properties` or nest it. */
export function colorStrip(
  fields: Array<{ key: string; title: string; tooltip?: string; reactions?: any }>,
  opts?: { minColWidth?: number },
) {
  const properties: any = {};
  for (const f of fields) {
    properties[f.key] = {
      type: 'string',
      title: f.title,
      'x-decorator': 'FormItem',
      'x-decorator-props': { style: { marginBottom: 6 }, ...(f.tooltip ? { tooltip: f.tooltip } : {}) },
      'x-component': ColorField,
      'x-component-props': { showText: false },
      ...(f.reactions ? { 'x-reactions': f.reactions } : {}),
    };
  }
  return { type: 'void', 'x-component': SettingsGrid, 'x-component-props': { minColWidth: opts?.minColWidth ?? 90 }, properties };
}

// ============================================================================
// (B) Plain-React lane — for pluginSettingsManager PAGES and value/onChange editors.
// The Formily primitives above (fi/rx/ResetButton) do NOT apply here.
// ============================================================================

/** Muted info icon with a hover tooltip — surface per-control detail without wrapping inline text
 *  (replaces the drifted `InfoCircleOutlined` / `ⓘ`-glyph copies). */
export function Hint(props: { tip: React.ReactNode }) {
  const { token } = theme.useToken();
  return (
    <Tooltip title={props.tip}>
      <Info
        size={13}
        style={{ color: token.colorTextQuaternary, cursor: 'help', flex: 'none', verticalAlign: 'middle' }}
      />
    </Tooltip>
  );
}

/** A label + control row. `layout='horizontal'` (default) = label left at fixed `labelWidth`;
 *  `'vertical'` = label above. `align='start'` for tall/multi-line controls. `hint` → trailing ⓘ. */
export function SettingRow(props: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  layout?: 'horizontal' | 'vertical';
  labelWidth?: number;
  align?: 'center' | 'start';
  style?: React.CSSProperties;
  children?: React.ReactNode;
}) {
  const { label, hint, layout = 'horizontal', labelWidth = 96, align = 'center', children, style } = props;
  const { token } = theme.useToken();
  if (layout === 'vertical') {
    return (
      <div style={{ marginBottom: 12, ...style }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 4 }}>
          {label}
          {hint ? <Hint tip={hint} /> : null}
        </div>
        {children}
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', alignItems: align === 'start' ? 'flex-start' : 'center', gap: 12, marginBottom: 14, ...style }}>
      <span
        style={{
          width: labelWidth,
          flex: 'none',
          color: token.colorTextTertiary,
          fontSize: 12,
          paddingTop: align === 'start' ? 6 : undefined,
        }}
      >
        {label}
      </span>
      {children}
      {hint ? <Hint tip={hint} /> : null}
    </div>
  );
}

/** Responsive control grid — auto-fits columns, min `minColWidth` px each (default 300). The
 *  plain-React counterpart to the Formily `SettingsGrid` (which is fixed 2-col by default). */
export function ControlGrid(props: {
  minColWidth?: number;
  columnGap?: number;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}) {
  const { minColWidth = 300, columnGap = 32, style, children } = props;
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fit, minmax(${minColWidth}px, 1fr))`,
        columnGap,
        alignItems: 'center',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** Card shell for one row of a repeating-list editor (rules / conditions / targets). */
export function SettingCard(props: { style?: React.CSSProperties; children?: React.ReactNode }) {
  const { token } = theme.useToken();
  return (
    <div
      style={{
        border: `1px solid ${token.colorBorderSecondary}`,
        borderRadius: 8,
        padding: '14px 16px',
        background: token.colorBgContainer,
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        ...props.style,
      }}
    >
      {props.children}
    </div>
  );
}

/** Reset + Save button row for a PLAIN-REACT panel (state-based — the Formily `ResetButton` needs
 *  `useForm()`). `onReset` restores local state; `onSave` persists (may be async → set `saving`). */
export function SaveBar(props: {
  onReset?: () => void;
  onSave?: () => void | Promise<any>;
  saving?: boolean;
  resetLabel?: string;
  saveLabel?: string;
  extra?: React.ReactNode;
  style?: React.CSSProperties;
}) {
  const { onReset, onSave, saving, resetLabel = 'Reset', saveLabel = 'Save', extra, style } = props;
  return (
    <Space wrap style={{ marginTop: 20, ...style }}>
      {onReset ? <Button onClick={onReset}>{resetLabel}</Button> : null}
      {extra}
      {onSave ? (
        <Button type="primary" loading={saving} onClick={() => onSave()}>
          {saveLabel}
        </Button>
      ) : null}
    </Space>
  );
}

/** Preview chrome for the plain-React lane — like `PreviewBox` but the inner box style is
 *  overridable via `boxStyle` (e.g. a dark chrome for a header pill). */
export function PreviewPane(props: {
  label?: React.ReactNode;
  boxStyle?: React.CSSProperties;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}) {
  const { label = 'Preview', boxStyle, style, children } = props;
  const { token } = theme.useToken();
  return (
    <div style={style}>
      <div style={{ fontSize: 12, color: token.colorTextTertiary, marginBottom: 6 }}>{label}</div>
      <div
        style={{
          border: `1px dashed ${token.colorBorder}`,
          borderRadius: 8,
          padding: 14,
          background: token.colorBgLayout,
          ...boxStyle,
        }}
      >
        {children}
      </div>
    </div>
  );
}
