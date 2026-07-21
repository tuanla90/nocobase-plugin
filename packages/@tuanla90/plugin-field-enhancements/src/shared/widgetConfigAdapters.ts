/**
 * Adapters for the Widget-global manager (GlobalWidgetsPane): map a stored `config` (the widget's ptdl* props
 * object) ↔ the settings-form PARAMS (short names), plus per-widget config summaries + icons.
 *
 * WHY: each widget's settings dialog is a Formily form over PARAM names (icon, count, ptype…); its handler
 * converts params → props (ptdlsIcon, ptdlsCount, ptdlpType…) and stores the props as `config`. To EDIT a
 * global widget with the SAME form we (a) seed the form with params reconstructed from config, (b) on save
 * convert params back to props. The maps below are declarative `{param: propKey}` pairs copied verbatim from
 * each widget's handler (verifiable, reversible — no hand-derived logic → no config corruption).
 *
 * Widgets with a map → the real settings form (via createModel + openStepSettingsDialog). Widgets WITHOUT a
 * map (e.g. Value tag, whose settings schema needs a live block's columns) → JSON raw-config editor fallback.
 */

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
// Build {param: propKey} where propKey = prefix + Cap(param), except the given overrides.
function mk(prefix: string, params: string[], overrides: Record<string, string> = {}): Record<string, string> {
  const m: Record<string, string> = {};
  for (const p of params) m[p] = overrides[p] || prefix + cap(p);
  return m;
}

// param → prop key, per widget model. Copied from each widget's handler `setProps({...})`.
export const WIDGET_PARAM_MAP: Record<string, Record<string, string>> = {
  PtdlStarFieldModel: mk('ptdls', ['icon', 'count', 'allowHalf', 'color', 'showValue', 'clickSave']),
  PtdlProgressFieldModel: mk('ptdlp',
    ['ptype', 'max', 'showInfo', 'textPos', 'textAlign', 'colorMode', 'color', 'colorFrom', 'colorMid', 'colorTo', 't1', 'c1', 't2', 'c2', 'c3', 'clickSave'],
    { ptype: 'ptdlpType' }),
  PtdlNumberFieldModel: mk('ptdln', ['icon', 'iconColor', 'thousands', 'decimals', 'unitMode', 'unitText', 'unitField']),
  PtdlLinkFieldModel: mk('ptdll', ['icon', 'kind', 'template', 'labelMode', 'customLabel', 'mailApp', 'openMode', 'color', 'underline', 'maxLen']),
  PtdlBooleanFieldModel: mk('ptdlb', ['style', 'onColor', 'offColor', 'iconOn', 'iconOff', 'filled', 'size', 'showLabel', 'labelOn', 'labelOff', 'nullAsOff']),
  PtdlLongTextFieldModel: mk('ptdllt', ['lines', 'expand']),
  PtdlColorFieldModel: mk('ptdlcl', ['style', 'text', 'size', 'copy']),
  PtdlIconGlyphFieldModel: mk('ptdli', ['size', 'color', 'bg', 'bgColor', 'label']),
  PtdlRelativeDateFieldModel: mk('ptdlrd', ['format', 'refMode', 'refField', 'pastColor', 'warnColor', 'warnDays', 'todayColor', 'futureColor', 'showAbs', 'absFormat']),
  PtdlJsonFieldModel: mk('ptdlj', ['mode', 'lines']),
  PtdlRichSelectDisplayFieldModel: mk('ptdlrs',
    ['mode', 'titleField', 'subField', 'avatarField', 'rightField', 'avatarDefault', 'html', 'avatarMode', 'avatarSize', 'iconStyle', 'iconColor', 'iconColorField', 'clickSave'],
    { titleField: 'ptdlrsTitle', subField: 'ptdlrsSub', avatarField: 'ptdlrsAvatar', rightField: 'ptdlrsRight' }),
};
// Rich-select can be stored under the editable OR the display model name → share the map.
WIDGET_PARAM_MAP.PtdlRichSelectFieldModel = WIDGET_PARAM_MAP.PtdlRichSelectDisplayFieldModel;
// Value tag (conditional-format): its settings form params == config keys (identity — the handler stores the
// same names). Its uiSchema reads the FIELD's own enum (via collectionField), not a block's columns → it
// renders standalone with a synthetic collectionField.
WIDGET_PARAM_MAP.ConditionalStatusFieldModel = {
  rules: 'rules', radius: 'radius', border: 'border', iconPosition: 'iconPosition',
  textStyle: 'textStyle', textSize: 'textSize', useOptionColors: 'useOptionColors',
};

export function hasParamMap(model: string): boolean {
  return !!WIDGET_PARAM_MAP[model];
}

// Each widget's OWN settings flow + step (verbatim from `registerFlow`/`bindDisplayField` in the widget file),
// keyed by the STORED widgetModel name. Editing must open THIS flow/step deterministically — never a
// first-dialog-step guess, which would grab a CROSS-CUTTING inherited flow the widget's base class carries
// (e.g. the formula plugin's `ptdlComputedRule` "Giá trị tự cập nhật (công thức)" on FieldModel). Most steps
// are keyed `settings`; Value tag's is `rules`.
export const WIDGET_FLOW: Record<string, { flow: string; step: string }> = {
  PtdlStarFieldModel: { flow: 'ptdlStar', step: 'settings' },
  PtdlProgressFieldModel: { flow: 'ptdlProgress', step: 'settings' },
  PtdlNumberFieldModel: { flow: 'ptdlNumber', step: 'settings' },
  PtdlBooleanFieldModel: { flow: 'ptdlBoolean', step: 'settings' },
  PtdlLongTextFieldModel: { flow: 'ptdlClampText', step: 'settings' },
  PtdlJsonFieldModel: { flow: 'ptdlJsonView', step: 'settings' },
  PtdlRelativeDateFieldModel: { flow: 'ptdlRelativeDate', step: 'settings' },
  PtdlRichSelectDisplayFieldModel: { flow: 'ptdlRichSelectDisplay', step: 'settings' },
  PtdlRichSelectFieldModel: { flow: 'ptdlRichSelect', step: 'settings' },
  ConditionalStatusFieldModel: { flow: 'conditionalFormatting', step: 'rules' },
  // These display widgets don't currently expose a global-save toggle (so they rarely appear as rows), but
  // map them anyway so Edit opens the right form if one ever does.
  PtdlLinkFieldModel: { flow: 'ptdlLink', step: 'settings' },
  PtdlColorFieldModel: { flow: 'ptdlColorChip', step: 'settings' },
  PtdlIconGlyphFieldModel: { flow: 'ptdlIconGlyph', step: 'settings' },
};

// Cross-cutting flows that must NEVER be opened as a widget's config (defense-in-depth; the map above already
// can't reference them). `ptdlComputedRule*` = @tuanla90/plugin-formula's computed-field editor.
export const EXCLUDED_FLOW_KEYS = new Set<string>(['ptdlComputedRule']);
export function isExcludedFlow(key: string): boolean {
  return EXCLUDED_FLOW_KEYS.has(key) || /^ptdlComputedRule/i.test(key || '');
}

/** The widget's OWN settings flow+step, or null (→ JSON fallback — never an inherited/cross-cutting flow). */
export function widgetOwnFlow(model: string): { flow: string; step: string } | null {
  const f = WIDGET_FLOW[model];
  return f && !isExcludedFlow(f.flow) ? f : null;
}

/** config (props) → form params. Returns null when there's no map (→ JSON fallback). */
export function configToParams(model: string, config: any): Record<string, any> | null {
  const map = WIDGET_PARAM_MAP[model];
  if (!map) return null;
  const c = config || {};
  const params: Record<string, any> = {};
  for (const [param, prop] of Object.entries(map)) if (Object.prototype.hasOwnProperty.call(c, prop)) params[param] = c[prop];
  return params;
}

/** form params → config (props). Returns null when there's no map. */
export function paramsToConfig(model: string, params: any): any | null {
  const map = WIDGET_PARAM_MAP[model];
  if (!map) return null;
  const p = params || {};
  const config: any = {};
  for (const [param, prop] of Object.entries(map)) if (Object.prototype.hasOwnProperty.call(p, param)) config[prop] = p[param];
  return config;
}

// Lucide icon key (custom-icons registry) per widget model.
const WIDGET_ICON: Record<string, string> = {
  ConditionalStatusFieldModel: 'lucide-tag',
  PtdlRelativeDateFieldModel: 'lucide-calendar-clock',
  PtdlNumberFieldModel: 'lucide-hash',
  PtdlProgressFieldModel: 'lucide-bar-chart-horizontal-big',
  PtdlStarFieldModel: 'lucide-star',
  PtdlBooleanFieldModel: 'lucide-toggle-left',
  PtdlLongTextFieldModel: 'lucide-text',
  PtdlJsonFieldModel: 'lucide-braces',
  PtdlColorFieldModel: 'lucide-palette',
  PtdlIconGlyphFieldModel: 'lucide-shapes',
  PtdlLinkFieldModel: 'lucide-link',
  PtdlRichSelectFieldModel: 'lucide-list',
  PtdlRichSelectDisplayFieldModel: 'lucide-list',
};
export function widgetIcon(model: string): string { return WIDGET_ICON[model] || 'lucide-square-pen'; }

/**
 * One-line human summary of a row's config, best-effort per widget (blank if unknown). `t` translates the
 * short unit words. Reads the ptdl* props directly (same keys as the maps above).
 */
export function configSummary(model: string, config: any, t: (s: string) => string): string {
  const c = config || {};
  try {
    switch (model) {
      case 'PtdlStarFieldModel':
        return `${typeof c.ptdlsCount === 'number' ? c.ptdlsCount : 5} ★`;
      case 'PtdlProgressFieldModel': {
        const max = c.ptdlpMax && c.ptdlpMax > 0 ? c.ptdlpMax : t('auto');
        return `${c.ptdlpType || 'line'} · ${max}`;
      }
      case 'PtdlNumberFieldModel':
        return c.ptdlnUnitText || (c.ptdlnUnitMode && c.ptdlnUnitMode !== 'none' ? String(c.ptdlnUnitMode) : (typeof c.ptdlnDecimals === 'number' ? `${c.ptdlnDecimals} ${t('decimals')}` : ''));
      case 'PtdlRelativeDateFieldModel':
        return String(c.ptdlrdFormat || 'auto');
      case 'PtdlLinkFieldModel':
        return String(c.ptdllKind || 'url');
      case 'PtdlRichSelectFieldModel':
      case 'PtdlRichSelectDisplayFieldModel':
        return c.ptdlrsMode === 'html' ? 'HTML' : (c.ptdlrsTitle ? `${t('title')}: ${c.ptdlrsTitle}` : 'preset');
      case 'PtdlColorFieldModel':
        return String(c.ptdlclStyle || 'chip');
      case 'PtdlIconGlyphFieldModel':
        return `${typeof c.ptdliSize === 'number' ? c.ptdliSize : 18}px`;
      case 'PtdlBooleanFieldModel':
        return String(c.ptdlbStyle || 'toggle');
      case 'PtdlLongTextFieldModel':
        return `${typeof c.ptdlltLines === 'number' ? c.ptdlltLines : 2} ${t('lines')}`;
      case 'PtdlJsonFieldModel':
        return String(c.ptdljMode || 'pills');
      case 'ConditionalStatusFieldModel': {
        // Value tag: config holds a rules array (key unknown across versions) → count the first array prop.
        const arr = Object.values(c).find((v) => Array.isArray(v)) as any[] | undefined;
        return arr && arr.length ? `${arr.length} ${t('rules')}` : '';
      }
      default:
        return '';
    }
  } catch (_) { return ''; }
}
