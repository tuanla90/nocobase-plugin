import React from 'react';
import { Button, Switch, Slider, Space } from 'antd';
import { ArrayTable } from '@formily/antd-v5';
import { observer as fObserver, useForm, useField } from '@formily/react';
import { SegmentedGroup, colorToString, ColorField, setIconRegistry, IconByKey, RegistryIconPicker, registerFlowComponentsOnce, tagColorToHex } from '@tuanla90/shared';
import { globalToggleField, saveWidgetGlobal } from './globalWidgetToggle';

// Resolve a model's collectionField, walking up `.parent` — a SubTableColumnModel's column model (or an
// inner field-model rendered inside a form) doesn't always carry `collectionField` directly on itself;
// it can live on a parent (e.g. a FormItemModel). Walking `.parent` is the only real fix.
function resolveCf(model: any): any {
  for (let cur: any = model, i = 0; cur && i < 4; cur = cur.parent, i++) {
    if (cur?.collectionField) return cur.collectionField;
  }
  return null;
}

/**
 * "Value tag" field component (moved here from @tuanla90/plugin-conditional-format 2026-07-13).
 * A per-field DISPLAY widget: maps a cell's value → a colored tag (text/bg colour, icon, border, radius, text
 * style) via a rules table. Works for string/select/radio/input fields. Bound as a "Field component" option.
 *
 * NOTE: model class name (`ConditionalStatusFieldModel`), flow key (`conditionalFormatting`) and interface
 * bindings are UNCHANGED so columns already configured with it (when it lived in conditional-format) keep
 * working. Still sets `globalThis.__ptdlCondFmt` (spreadsheet-view reads this bridge for its "Format rules").
 *
 * Standalone icon consumer — ships ZERO icon library; renders icons via NocoBase's shared icon registry:
 *   - render  → <Icon type="lucide-check" /> (Icon injected from the host client)
 *   - pick    → enumerate `icons` Map keys, grouped: Lucide (lucide-*) + Ant Design (rest)
 * So with @tuanla90/plugin-custom-icons installed you get the full lucide set; without it, the
 * picker still works and falls back to the built-in Ant Design icons. No lucide bundled.
 *
 * Icon registry + picker come from @tuanla90/shared: the host Icon component + icons Map are
 * injected once per lane via setIconRegistry() (see registerConditionalModel below).
 */

// Runtime translator for the few labels rendered in React (not through the schema compiler).
const ttc = (k: string): string => {
  try { return (globalThis as any)?.window?.__nocobase_i18n__?.t?.(k, { ns: 'field-enhancements' }) || k; } catch (_) { return k; }
};

type Rule = { value?: string; color?: any; background?: any; icon?: string };

function normColor(c: any): string | undefined {
  return colorToString(c);
}

// hex (#rgb / #rrggbb) → rgba with the given alpha; non-hex colours are returned unchanged.
function withAlpha(color: string, alpha: number): string {
  const s = String(color || '').trim();
  let m = s.match(/^#([0-9a-f]{6})$/i);
  if (m) { const n = parseInt(m[1], 16); return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`; }
  m = s.match(/^#([0-9a-f]{3})$/i);
  if (m) { const h = m[1]; return `rgba(${parseInt(h[0] + h[0], 16)}, ${parseInt(h[1] + h[1], 16)}, ${parseInt(h[2] + h[2], 16)}, ${alpha})`; }
  return s;
}
// A dropdown option's OWN colour (antd tag name like 'red' or a raw hex) → a soft "native tag" pill style
// (light background + saturated text), so value-tag mirrors the field's existing option colours with no
// per-value rule. null when the option carries no colour.
function optionPillStyle(rawColor?: string): { color: string; background: string } | null {
  if (!rawColor) return null;
  const hex = tagColorToHex(rawColor);
  return { color: hex, background: withAlpha(hex, 0.16) };
}

function matchRule(rules: Rule[], rawValue: any, label?: any): Rule | null {
  const rv = String(rawValue ?? '').trim().toLowerCase();
  const lv = String(label ?? '').trim().toLowerCase();
  return (
    rules.find((r) => {
      const t = String(r?.value ?? '').trim().toLowerCase();
      return t !== '' && (t === rv || (lv !== '' && t === lv));
    }) || null
  );
}

// Shared pill renderer — used by BOTH the live table cell and the Preview column.
function renderPill(opts: {
  text: any;
  color?: any;
  background?: any;
  icon?: string;
  border?: boolean;
  radius?: number;
  iconPosition?: 'left' | 'right';
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  fontSize?: number;
}) {
  const color = normColor(opts.color);
  const bg = normColor(opts.background);
  const showBorder = !!opts.border;
  const borderColor = color || bg || 'currentColor'; // "same as the main color"
  const isPill = !!bg || showBorder;
  const rawRadius = typeof opts.radius === 'number' ? opts.radius : 24;
  const radius = rawRadius >= 24 ? 999 : rawRadius; // slider max = full pill
  const iconRight = opts.iconPosition === 'right';
  const decoration = [opts.underline ? 'underline' : '', opts.strike ? 'line-through' : ''].filter(Boolean).join(' ');
  const iconEl = opts.icon ? <IconByKey type={opts.icon} /> : null;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        color,
        background: bg,
        fontWeight: opts.bold ? 700 : undefined,
        fontStyle: opts.italic ? 'italic' : undefined,
        textDecoration: decoration || undefined,
        fontSize: typeof opts.fontSize === 'number' && opts.fontSize > 0 ? opts.fontSize : undefined,
        border: showBorder ? `1px solid ${borderColor}` : undefined,
        borderRadius: isPill ? radius : 0,
        padding: isPill ? '2px 10px' : 0,
        lineHeight: 1.7,
      }}
    >
      {iconRight ? null : iconEl}
      {opts.text}
      {iconRight ? iconEl : null}
    </span>
  );
}

// Live preview cell (reactive): reads its own row + global appearance props from the form.
const RulePreview: any = fObserver(() => {
  const form: any = useForm();
  const field: any = useField();
  const addr = String(field?.address ?? field?.path ?? '');
  const m = addr.match(/(?:^|\.)(\d+)(?:\.|$)/);
  const idx = m ? Number(m[1]) : -1;
  const v: any = form?.values || {};
  const row: any = (Array.isArray(v.rules) ? v.rules[idx] : null) || {};
  const text = row.value != null && String(row.value).trim() !== '' ? String(row.value) : 'Preview';
  const ts = v.textStyle || {};
  return renderPill({
    text,
    color: row.color,
    background: row.background,
    icon: row.icon,
    border: v.border,
    radius: v.radius,
    iconPosition: v.iconPosition,
    bold: ts.bold,
    italic: ts.italic,
    underline: ts.underline,
    strike: ts.strike,
    fontSize: v.textSize,
  });
});

type Deps = {
  flowEngine: any;
  flowSettings?: any;
  Base: any; // DisplayTextFieldModel (per-lane import)
  CollectionFieldModel?: any;
  tExpr?: (s: string, opts?: any) => any;
  Icon?: any; // <Icon type=... /> from the lane's @nocobase/client(-v2)
  icons?: Map<string, any>; // the shared registry Map
};

export function registerConditionalModel({
  flowEngine,
  flowSettings,
  Base,
  CollectionFieldModel,
  tExpr,
  Icon,
  icons,
}: Deps) {
  if (!flowEngine || !Base) {
    // eslint-disable-next-line no-console
    console.warn('[cond-fmt] missing flowEngine or Base — skip', { flowEngine: !!flowEngine, Base: !!Base });
    return;
  }
  // Inject the host Icon component + icons Map into the shared registry (once per lane).
  // Same wiring as before — Icon/icons still come from @nocobase/client(-v2); only the sink changed.
  setIconRegistry(Icon, icons);
  // Bridge cho plugin khác (spreadsheet-view) tái dùng evaluator + pill renderer — KHÔNG fork logic.
  (globalThis as any).__ptdlCondFmt = { matchRule, renderPill, normColor };
  const t = (s: string) => (tExpr ? tExpr(s, { ns: 'field-enhancements' }) : s);

  if (flowSettings) {
    // ColorField (shared) registered under the legacy name `ColorPicker` so existing uiSchemas keep working.
    // Old wrapper emitted colorToString(c) (undefined on empty) → shared default emptyValue (undefined) matches.
    const IconSide = (props: any) => (
      <SegmentedGroup
        style={{ border: '1px solid var(--colorBorder, #d9d9d9)' }}
        value={props.value || 'left'}
        onChange={(v: any) => props.onChange?.(v)}
        options={[
          { label: ttc('Left'), value: 'left' },
          { label: ttc('Right'), value: 'right' },
        ]}
      />
    );
    const RadiusSlider = (props: any) => {
      const v = typeof props.value === 'number' ? Math.min(props.value, 24) : 24;
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 190 }}>
          <Slider min={0} max={24} value={v} onChange={(n: any) => props.onChange?.(n)} style={{ flex: 1 }} />
          <span style={{ width: 44, textAlign: 'right', color: '#888', fontVariantNumeric: 'tabular-nums' }}>
            {v >= 24 ? 'Pill' : `${v}px`}
          </span>
        </div>
      );
    };
    const BorderSwitch = (props: any) => (
      <Switch checked={!!props.value} onChange={(c: any) => props.onChange?.(c)} />
    );
    // Bold / italic / underline / strikethrough — value is { bold, italic, underline, strike }.
    // Joined 32px button group (Space.Compact) so it reads as one control, matching the segmented pickers.
    const TextStyleToggles = (props: any) => {
      const v = props.value || {};
      const toggle = (k: string) => props.onChange?.({ ...v, [k]: !v[k] });
      const mk = (k: string, label: string, st: any) => (
        <Button
          key={k}
          type={v[k] ? 'primary' : 'default'}
          onClick={() => toggle(k)}
          style={{ minWidth: 38, padding: '0 8px', fontSize: 15 }}
        >
          <span style={st}>{label}</span>
        </Button>
      );
      return (
        <Space.Compact>
          {mk('bold', 'B', { fontWeight: 700 })}
          {mk('italic', 'I', { fontStyle: 'italic' })}
          {mk('underline', 'U', { textDecoration: 'underline' })}
          {mk('strike', 'S', { textDecoration: 'line-through' })}
        </Space.Compact>
      );
    };
    // Text size in px (0 = inherit the table's default).
    const TextSizeSlider = (props: any) => {
      const v = typeof props.value === 'number' ? props.value : 0;
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 180 }}>
          <Slider min={0} max={28} value={v} onChange={(n: any) => props.onChange?.(n)} style={{ flex: 1 }} />
          <span style={{ width: 56, textAlign: 'right', color: '#888', fontVariantNumeric: 'tabular-nums' }}>
            {v <= 0 ? 'Default' : `${v}px`}
          </span>
        </div>
      );
    };
    try {
      registerFlowComponentsOnce(flowSettings, {
        ColorPicker: ColorField,
        RegistryIconPicker,
        IconSide,
        RadiusSlider,
        BorderSwitch,
        TextStyleToggles,
        TextSizeSlider,
        ArrayTable,
        RulePreview,
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[cond-fmt] register components failed', e);
    }
  }

  class ConditionalStatusFieldModel extends Base {
    // Resolve the field option for a value → { label, color }. `color` is the option's OWN colour
    // (antd tag name or hex) configured on the dropdown/select field. null for non-enum fields.
    resolveOption(value: any): { label?: any; color?: string } | null {
      try {
        const cf: any = resolveCf(this);
        const opts =
          cf?.enum || cf?.uiSchema?.enum || cf?.options || cf?.uiSchema?.['x-component-props']?.options || [];
        if (Array.isArray(opts) && opts.length) {
          const o = opts.find((x: any) => x && String(x.value) === String(value));
          if (o) return { label: o.label != null ? o.label : value, color: o.color };
        }
      } catch (e) {
        /* not an enum field */
      }
      return null;
    }

    resolveLabel(value: any): any {
      const o = this.resolveOption(value);
      return o ? o.label : undefined;
    }

    // Style props are per-model (global), rule carries color/bg/icon. Shared by scalar + array paths.
    pillFor(rule: Rule, text: any, p: any) {
      const ts = p.textStyle || {};
      return renderPill({
        text,
        color: rule.color,
        background: rule.background,
        icon: rule.icon,
        border: p.border,
        radius: p.radius,
        iconPosition: p.iconPosition,
        bold: ts.bold,
        italic: ts.italic,
        underline: ts.underline,
        strike: ts.strike,
        fontSize: p.textSize,
      });
    }

    renderComponent(value: any, wrap: any) {
      const p: any = (this as any).props || {};
      const rules: Rule[] = p.rules || [];
      const useOptionColors = p.useOptionColors !== false; // default ON: inherit the field option's own colour

      // No explicit rule for this value? Fall back to the field option's OWN colour (soft native-tag pill),
      // so a coloured dropdown shows its colours with ZERO rules — rules then act as pure overrides.
      const autoPill = (v: any, text: any) => {
        if (!useOptionColors) return null;
        const st = optionPillStyle(this.resolveOption(v)?.color);
        return st ? this.pillFor({ color: st.color, background: st.background }, text, p) : null;
      };

      // multipleSelect (and any array value): match + pill PER element, else the value stringifies to
      // "a,b" and never matches any rule (silent loss of formatting). Render one pill per value.
      if (Array.isArray(value)) {
        if (!value.length) return super.renderComponent(value, wrap);
        const nodes = value.map((v: any, i: number) => {
          const label = this.resolveLabel(v);
          const rule = matchRule(rules, v, label);
          const text =
            label != null
              ? typeof (this as any).t === 'function'
                ? (this as any).t(label)
                : label
              : v == null
                ? ''
                : String(v);
          const node = rule ? this.pillFor(rule, text, p) : (autoPill(v, text) ?? <span>{text}</span>);
          return <React.Fragment key={i}>{node}</React.Fragment>;
        });
        return <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>{nodes}</span>;
      }

      const label = this.resolveLabel(value);
      const rule = matchRule(rules, value, label);
      const inner =
        label != null
          ? typeof (this as any).t === 'function'
            ? (this as any).t(label)
            : label
          : super.renderComponent(value, wrap);
      if (rule) return this.pillFor(rule, inner, p);
      return autoPill(value, inner) ?? inner;
    }
  }

  flowEngine.registerModels({ ConditionalStatusFieldModel });

  try {
    (ConditionalStatusFieldModel as any).registerFlow({
      key: 'conditionalFormatting',
      sort: 501, // sit right after the core `tableColumnSettings` group (sort 500), near Field component
      title: t('Value tag'),
      steps: {
        rules: {
          title: t('Format Rule'),
          uiMode: { type: 'dialog', props: { width: 900 } },
          uiSchema: {
            ...globalToggleField(t),
            appearance: {
              type: 'void',
              'x-component': 'Space',
              'x-component-props': { size: 28, wrap: true, align: 'end', style: { marginBottom: 4 } },
              properties: {
                textStyle: {
                  type: 'object',
                  title: t('Text style'),
                  'x-decorator': 'FormItem',
                  'x-decorator-props': { style: { marginBottom: 0 } },
                  'x-component': 'TextStyleToggles',
                },
                textSize: {
                  type: 'number',
                  title: t('Text size'),
                  'x-decorator': 'FormItem',
                  'x-decorator-props': { style: { marginBottom: 0 } },
                  'x-component': 'TextSizeSlider',
                },
                iconPosition: {
                  type: 'string',
                  title: t('Icon position'),
                  'x-decorator': 'FormItem',
                  'x-decorator-props': { style: { marginBottom: 0 } },
                  'x-component': 'IconSide',
                },
                border: {
                  type: 'boolean',
                  title: t('Border (text color)'),
                  'x-decorator': 'FormItem',
                  'x-decorator-props': { style: { marginBottom: 0 } },
                  'x-component': 'BorderSwitch',
                },
                radius: {
                  type: 'number',
                  title: t('Corner radius'),
                  'x-decorator': 'FormItem',
                  'x-decorator-props': { style: { marginBottom: 0 } },
                  'x-component': 'RadiusSlider',
                },
                useOptionColors: {
                  type: 'boolean',
                  title: t('Use field option colours'),
                  'x-decorator': 'FormItem',
                  'x-decorator-props': { style: { marginBottom: 0 } },
                  'x-component': 'BorderSwitch',
                },
              },
            },
            rules: {
              type: 'array',
              title: t('Rules'),
              'x-decorator': 'FormItem',
              'x-component': 'ArrayTable',
              'x-component-props': { pagination: false, size: 'small', scroll: { x: 'max-content' } },
              items: {
                type: 'object',
                properties: {
                  cValue: {
                    type: 'void',
                    'x-component': 'ArrayTable.Column',
                    'x-component-props': { title: 'Value', width: 150 },
                    properties: {
                      value: {
                        type: 'string',
                        'x-decorator': 'FormItem',
                        'x-decorator-props': { style: { marginBottom: 0 } },
                        'x-component': 'Input',
                        'x-component-props': { placeholder: 'e.g. Fail' },
                      },
                    },
                  },
                  cColor: {
                    type: 'void',
                    'x-component': 'ArrayTable.Column',
                    'x-component-props': { title: 'Text color', width: 120, align: 'center' },
                    properties: {
                      color: {
                        type: 'string',
                        'x-decorator': 'FormItem',
                        'x-decorator-props': { style: { marginBottom: 0 } },
                        'x-component': 'ColorPicker',
                      },
                    },
                  },
                  cBg: {
                    type: 'void',
                    'x-component': 'ArrayTable.Column',
                    'x-component-props': { title: 'Background', width: 130, align: 'center' },
                    properties: {
                      background: {
                        type: 'string',
                        'x-decorator': 'FormItem',
                        'x-decorator-props': { style: { marginBottom: 0 } },
                        'x-component': 'ColorPicker',
                      },
                    },
                  },
                  cIcon: {
                    type: 'void',
                    'x-component': 'ArrayTable.Column',
                    'x-component-props': { title: 'Icon', width: 80, align: 'center' },
                    properties: {
                      icon: {
                        type: 'string',
                        'x-decorator': 'FormItem',
                        'x-decorator-props': { style: { marginBottom: 0 } },
                        'x-component': 'RegistryIconPicker',
                      },
                    },
                  },
                  cPreview: {
                    type: 'void',
                    'x-component': 'ArrayTable.Column',
                    'x-component-props': { title: 'Preview', width: 160, align: 'center' },
                    properties: {
                      preview: { type: 'void', 'x-component': 'RulePreview' },
                    },
                  },
                  cOp: {
                    type: 'void',
                    'x-component': 'ArrayTable.Column',
                    'x-component-props': { title: '', width: 56, align: 'center', fixed: 'right' },
                    properties: {
                      remove: { type: 'void', 'x-component': 'ArrayTable.Remove' },
                    },
                  },
                },
              },
              properties: {
                add: { type: 'void', 'x-component': 'ArrayTable.Addition', title: t('Add rule') },
              },
            },
          },
          defaultParams: { rules: [], radius: 24, border: false, iconPosition: 'left', textStyle: {}, textSize: 0, useOptionColors: true },
          handler(ctx: any, params: any) {
            ctx.model.setProps('rules', params?.rules || []);
            ctx.model.setProps('radius', typeof params?.radius === 'number' ? params.radius : 24);
            ctx.model.setProps('border', !!params?.border);
            ctx.model.setProps('iconPosition', params?.iconPosition || 'left');
            ctx.model.setProps('textStyle', params?.textStyle || {});
            ctx.model.setProps('textSize', typeof params?.textSize === 'number' ? params.textSize : 0);
            ctx.model.setProps('useOptionColors', params?.useOptionColors !== false);
            // Global: if "Apply to all views" is on, mirror this widget + config to the field-widget store
            // so it renders on every table/detail using this field (no per-block config). Fire-and-forget.
            saveWidgetGlobal(ctx, params, 'ConditionalStatusFieldModel', {
              rules: params?.rules || [],
              radius: typeof params?.radius === 'number' ? params.radius : 24,
              border: !!params?.border,
              iconPosition: params?.iconPosition || 'left',
              textStyle: params?.textStyle || {},
              textSize: typeof params?.textSize === 'number' ? params.textSize : 0,
              useOptionColors: params?.useOptionColors !== false,
            });
          },
        },
      },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[cond-fmt] registerFlow failed', e);
  }

  const interfaces = ['select', 'radioGroup', 'multipleSelect', 'singleSelect', 'input'];
  const binder = [ConditionalStatusFieldModel, Base, CollectionFieldModel].find(
    (c: any) => c && typeof c.bindModelToInterface === 'function',
  );
  try {
    (binder as any)?.bindModelToInterface('ConditionalStatusFieldModel', interfaces, { isDefault: false });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[cond-fmt] bind failed', e);
  }
  try {
    (ConditionalStatusFieldModel as any).define?.({ label: 'Value tag' });
  } catch (e) {
    /* define optional */
  }

  return ConditionalStatusFieldModel;
}
