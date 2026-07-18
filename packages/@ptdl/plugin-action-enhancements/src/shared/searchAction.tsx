import React, { useRef, useState, useEffect } from 'react';
import { Input, Cascader, theme } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { useFlowSettingsContext } from '@nocobase/flow-engine';
import { observer, useForm } from '@formily/react';
import { css } from '@emotion/css';
import { ColorField, SettingsGrid, buildFieldCascaderOptions, rx, SegmentedGroup } from '@ptdl/shared';
import { debounce } from 'lodash';
import { NS, t } from './i18n';

/**
 * "Search bar" as a first-class toolbar ACTION (scene: collection) — added via the toolbar "＋ Actions" menu,
 * so it can be dragged / repositioned (native `position` left|right) like any action. render() (not
 * renderButton) returns an <Input.Search> that sets a named filter group on the block's MultiRecordResource.
 *
 * Config (its ⚙, mirrors the native Filter's field picker):
 *  - BACKEND: which fields to search (`ptdlSearchFields`, default = all text fields) + match mode
 *    (`ptdlMatchMode`: contains/startsWith/exact → $includes/$startsWith/$eq).
 *  - FRONTEND: placeholder, width, position.
 */
const SEARCH_FILTER_KEY = 'ptdlSearch';
const MATCH_OP: Record<string, string> = { contains: '$includes', startsWith: '$startsWith', exact: '$eq' };
const WIDTH_PX: Record<string, number> = { narrow: 160, normal: 220, wide: 320 };

/** All searchable (string/text, non-association) field objects of a collection. */
function textFields(collection: any): Array<{ name: string; title: string }> {
  try {
    const fields = (collection && collection.getFields && collection.getFields()) || [];
    return fields
      .filter((f: any) => f && (!f.isAssociationField || !f.isAssociationField()) && (f.type === 'string' || f.type === 'text'))
      .map((f: any) => ({ name: f.name, title: f.title || f.name }))
      .filter((f: any) => f.name);
  } catch (_) {
    return [];
  }
}

const SHAPE_RADIUS: Record<string, number> = { square: 0, rounded: 8, pill: 999 };

function collectionOfModel(model: any): any {
  return (model && model.context && (model.context.collection || (model.context.blockModel && model.context.blockModel.collection))) || (model && model.collection) || null;
}
function apiOfModel(model: any): any {
  return (model && model.context && (model.context.api || (model.context.app && model.context.app.apiClient))) || null;
}
function dsKeyOfModel(model: any): string {
  const c = collectionOfModel(model);
  return (c && (c.dataSourceKey || (c.dataSource && c.dataSource.key))) || 'main';
}

/** Multi-level field picker (checkable multi-select cascader). Fetches the field tree via the API
 *  (`buildFieldCascaderOptions`, robust — needs only the collection NAME) so association fields drill in
 *  (pick `customer → name` to search a linked table's label). Falls back to the local flat text fields.
 *  Value stored as dot-paths (`['status','customer.name']`); Cascader works in path arrays. */
function SearchFieldPicker(p: any) {
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
    if (api && collName) {
      buildFieldCascaderOptions(api, collName, dsKeyOfModel(model), { maxDepth: 1, includeToMany: false })
        .then((opts: any[]) => setOptions(Array.isArray(opts) ? opts : []))
        .catch(() => setOptions(textFields(coll).map((f) => ({ value: f.name, label: f.title, isLeaf: true }))));
    } else {
      setOptions(textFields(coll).map((f) => ({ value: f.name, label: f.title, isLeaf: true })));
    }
  }, [model]);
  const value = (Array.isArray(p.value) ? p.value : []).map((s: string) => String(s).split('.'));
  return (
    <Cascader
      multiple
      options={options}
      value={value}
      onChange={(paths: any) => p.onChange && p.onChange((paths || []).map((pp: string[]) => pp.join('.')))}
      placeholder={t('All text fields')}
      style={{ width: '100%' }}
      maxTagCount="responsive"
      showSearch
    />
  );
}

/**
 * Scoped CSS for the search box. Everything stays on ONE affix-wrapper structure (`<Input prefix|suffix>`)
 * for consistent width/className — the icon *container* is drawn by styling the icon side
 * (`.ant-input-prefix` / `.ant-input-suffix`) directly, no antd addon group:
 *  - FILL  → the icon side becomes a full-height filled block flush to the edge, corners per Shape radius
 *            (`overflow:hidden` on the wrapper clips it to the rounded border → images 1/2).
 *  - BORDER→ a full-height SOLID divider line between icon and text; negative vertical margins cancel the
 *            wrapper's 4px padding so the line touches top & bottom ("liền nét" → images 3/4).
 * Also handles Shape radius + custom bg/text (whose values don't reach the inner box via outer `style`).
 */
function searchCss(cfg: any): string | undefined {
  const radius = SHAPE_RADIUS[cfg && cfg.ptdlSearchShape];
  const bg = cfg && cfg.ptdlSearchBg;
  const txt = cfg && cfg.ptdlSearchText;
  const container = (cfg && cfg.ptdlSearchIconContainer) || 'none';
  const pos = (cfg && cfg.ptdlSearchIconPos) || 'left';
  const iconSel = `& .ant-input-${pos === 'right' ? 'suffix' : 'prefix'}`;
  const rules: string[] = [];

  if (radius != null) {
    rules.push(`&, &.ant-input-affix-wrapper{border-radius:${radius}px !important;}`);
  }
  if (bg) {
    rules.push(`&.ant-input-affix-wrapper, &.ant-input{background-color:${bg} !important;}`);
    rules.push(`& .ant-input{background-color:transparent !important;}`);
  }
  if (txt) {
    // input text + placeholder + the allowClear × — NOT the search icon (it has its own colour).
    rules.push(`& .ant-input, & input{color:${txt} !important;}`);
    rules.push(`& input::placeholder{color:${txt} !important;opacity:0.5;}`);
    rules.push(`& .ant-input-clear-icon, & .ant-input-clear-icon .anticon{color:${txt} !important;}`);
  }

  if (container === 'fill' || container === 'border') {
    // ONE shared geometry so switching border↔fill keeps the SAME container size. The visual (bg for fill,
    // divider line for border) lives on the inner span from buildSearchIcon; here we stretch the affix
    // full-height + flush to the edge, and collapse the empty clear-icon (×). antd puts the × in this same
    // affix, and letting it share the icon zone was what broke the right-side case (× shoved/hid the icon and
    // pushed the border divider away from the icon vs the left case which has no × in its prefix).
    const reach = pos === 'right' ? 'end' : 'start'; // edge the container is flush to
    const gap = pos === 'right' ? 'start' : 'end'; // inner gap toward the text
    if (container === 'fill') rules.push(`&.ant-input-affix-wrapper{overflow:hidden;}`);
    rules.push(
      `${iconSel}{align-self:stretch;padding:0;margin-top:-4px;margin-bottom:-4px;margin-inline-${reach}:-11px;margin-inline-${gap}:8px;}`,
    );
    rules.push(`& .ant-input-clear-icon-hidden{display:none;}`);
  }

  if (!rules.length) return undefined;
  return css(rules.join('\n'));
}

/** The search icon. `none` → plain <SearchOutlined>. `fill`/`border` → a self-contained inner block AROUND
 *  the icon with the SAME geometry (fixed 36px width ⇒ identical container width + ~11px breathing room each
 *  side of the icon), so switching between them doesn't change the layout and the affix's clear-icon (×) stays
 *  outside it. Full height comes from the parent affix being stretched in `searchCss`. Fill = background +
 *  rounded outer corner (per Shape); Border = a full-height divider on the text-facing edge (pos right → line
 *  on the left, pos left → on the right). */
function buildSearchIcon(cfg: any, token: any): React.ReactNode {
  const container = cfg.ptdlSearchIconContainer || 'none';
  const iconColor = cfg.ptdlSearchIconColor || (container === 'fill' ? '#fff' : token.colorTextQuaternary);
  const icon = <SearchOutlined style={{ color: iconColor, fontSize: 14 }} />;
  if (container === 'none') return icon;
  const pos = cfg.ptdlSearchIconPos || 'left';
  // 32px width + 4px padding on the OUTER (flush) side — left icon → padding-left, right icon → padding-right
  // (user's preferred DevTools values, mirrored per position). border-box keeps fill (no border) and border
  // (1px divider) the SAME width — the divider's 1px is absorbed inside the 32px, not added to it.
  const box: React.CSSProperties = {
    alignSelf: 'stretch',
    boxSizing: 'border-box',
    width: 32,
    [pos === 'right' ? 'paddingRight' : 'paddingLeft']: 4,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };
  if (container === 'fill') {
    const shapeR = SHAPE_RADIUS[cfg.ptdlSearchShape];
    const r = shapeR == null ? 6 : shapeR;
    box.background = cfg.ptdlSearchIconBoxColor || '#8c8c8c';
    box.borderRadius = pos === 'right' ? `0 ${r}px ${r}px 0` : `${r}px 0 0 ${r}px`;
  } else {
    const lineColor = cfg.ptdlSearchIconBoxColor || token.colorBorderSecondary;
    if (pos === 'right') box.borderInlineStart = `1px solid ${lineColor}`;
    else box.borderInlineEnd = `1px solid ${lineColor}`;
  }
  return <span style={box}>{icon}</span>;
}

/** The search input, styled per config. Icon `position` (left=`prefix` / right=`suffix`, both INSIDE the box)
 *  + icon `container` (none/border/fill). Shared by the live action and the config preview. */
function SearchBox({ cfg, ...rest }: { cfg: any; [k: string]: any }) {
  const { token } = theme.useToken();
  const common: any = {
    variant: cfg.ptdlSearchVariant || 'outlined',
    style: { width: WIDTH_PX[cfg.ptdlSearchWidth] || 220 },
    className: searchCss(cfg),
    ...rest,
  };
  const icon = buildSearchIcon(cfg, token);
  return (cfg.ptdlSearchIconPos || 'left') === 'right' ? <Input {...common} suffix={icon} /> : <Input {...common} prefix={icon} />;
}

/** Live preview inside the config dialog — reactive sample of the search bar as it's configured. Reads each
 *  config key HERE (in the observer's own render) so the observer subscribes to them — passing the raw
 *  form.values object to a child would only track the object identity, not the individual keys. */
const SearchBarPreview: any = observer(() => {
  const form: any = useForm();
  const { token } = theme.useToken();
  const v = (form && form.values) || {};
  const cfg = {
    ptdlSearchIconPos: v.ptdlSearchIconPos,
    ptdlSearchIconContainer: v.ptdlSearchIconContainer,
    ptdlSearchIconBoxColor: v.ptdlSearchIconBoxColor,
    ptdlSearchIconColor: v.ptdlSearchIconColor,
    ptdlSearchVariant: v.ptdlSearchVariant,
    ptdlSearchShape: v.ptdlSearchShape,
    ptdlSearchBg: v.ptdlSearchBg,
    ptdlSearchText: v.ptdlSearchText,
    ptdlSearchWidth: v.ptdlSearchWidth,
  };
  return (
    <div style={{ padding: '10px 12px', background: token.colorFillQuaternary, borderRadius: 6, border: `1px dashed ${token.colorBorder}`, display: 'flex' }}>
      <SearchBox cfg={cfg} allowClear placeholder={v.ptdlSearchPlaceholder || t('Search...')} />
    </div>
  );
});

function resourceOf(actionModel: any): any {
  const ctx = actionModel && actionModel.context;
  return ctx && (ctx.resource || (ctx.blockModel && ctx.blockModel.resource));
}
function collectionOf(actionModel: any): any {
  const ctx = actionModel && actionModel.context;
  return ctx && (ctx.collection || (ctx.blockModel && ctx.blockModel.collection));
}

/**
 * The action re-renders/remounts aggressively (FlowModelRenderer + Droppable), which resets React state and
 * fires unmount cleanups. So we keep the value ON THE MODEL (`__ptdlSearchVal`, survives remounts), use an
 * UNCONTROLLED input, read everything fresh inside a ref-held debounce, and DON'T clear on unmount.
 */
function TableSearchInline({ actionModel }: { actionModel: any }) {
  const runRef = useRef<any>(null);
  if (!runRef.current) {
    runRef.current = debounce(() => {
      const text = (actionModel && actionModel.__ptdlSearchVal) || '';
      const resource = resourceOf(actionModel);
      if (!resource || !resource.addFilterGroup) return;
      const props = (actionModel && actionModel.props) || {};
      const configured: string[] = Array.isArray(props.ptdlSearchFields) ? props.ptdlSearchFields : [];
      const fields = configured.length ? configured : textFields(collectionOf(actionModel)).map((f) => f.name);
      const op = MATCH_OP[props.ptdlMatchMode] || '$includes';
      if (!text || !fields.length) {
        resource.removeFilterGroup(SEARCH_FILTER_KEY);
      } else {
        resource.addFilterGroup(SEARCH_FILTER_KEY, { $or: fields.map((f) => ({ [f]: { [op]: text } })) });
      }
      if (resource.setPage) resource.setPage(1);
      if (resource.refresh) resource.refresh();
    }, 300);
  }

  const props = (actionModel && actionModel.props) || {};
  return (
    <SearchBox
      cfg={props}
      allowClear
      placeholder={props.ptdlSearchPlaceholder || t('Search...')}
      defaultValue={(actionModel && actionModel.__ptdlSearchVal) || ''}
      onChange={(e: any) => {
        if (actionModel) actionModel.__ptdlSearchVal = e.target.value;
        if (runRef.current) runRef.current();
      }}
      onClick={(e: any) => e.stopPropagation()}
    />
  );
}

export function registerSearchAction(deps: { flowEngine: any; tExpr: (s: string, o?: any) => any; lane: string }) {
  const { flowEngine, tExpr, lane } = deps;
  const te = (s: string) => tExpr(s, { ns: NS });

  const bind = (attempt = 0) => {
    const ActionBase: any = flowEngine?.getModelClass?.('ActionModel');
    if (!ActionBase) {
      if (attempt < 15) setTimeout(() => bind(attempt + 1), 800);
      return;
    }
    if (flowEngine.getModelClass?.('PtdlSearchActionModel')) return; // already registered

    class PtdlSearchActionModel extends ActionBase {
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
        return <TableSearchInline actionModel={this} />;
      }
    }

    try {
      flowEngine.registerModels({ PtdlSearchActionModel });
      (PtdlSearchActionModel as any).define({ label: te('Search bar'), sort: 60 });
      try {
        flowEngine.flowSettings?.registerComponents?.({ PtdlSearchPreview: SearchBarPreview, PtdlSearchGrid: SettingsGrid });
      } catch (e) {
        /* preview optional */
      }

      (PtdlSearchActionModel as any).registerFlow({
        key: 'ptdlSearchSettings',
        title: te('Search bar'),
        sort: 100,
        steps: {
          settings: {
            title: te('Search bar'),
            uiMode: { type: 'dialog', props: { width: 560 } },
            uiSchema() {
              // Compact helpers — a FormItem cell (tight bottom margin) + a 2-col grid row, so related
              // options sit side-by-side and the dialog stays short. Choice pickers use the standard antd
              // <Segmented> control via `segCell` (value/onChange match Formily's injected props; options in
              // component-props, NOT schema `enum`).
              const cell = (title: string, comp: any, extra: any = {}) => ({
                'x-decorator': 'FormItem',
                'x-decorator-props': { style: { marginBottom: 8 }, ...(extra.decoratorProps || {}) },
                'x-component': comp,
                title: te(title),
                ...(extra.type ? { type: extra.type } : {}),
                ...(extra.props ? { 'x-component-props': extra.props } : {}),
                ...(extra.reactions ? { 'x-reactions': extra.reactions } : {}),
              });
              const segCell = (title: string, options: any[]) =>
                cell(title, SegmentedGroup, { props: { size: 'middle', block: true, options } });
              const grid = (properties: any) => ({ type: 'void', 'x-component': 'PtdlSearchGrid', properties });
              return {
                preview: {
                  type: 'void',
                  'x-decorator': 'FormItem',
                  'x-decorator-props': { style: { marginBottom: 8 } },
                  'x-component': 'PtdlSearchPreview',
                },
                // ── Backend ── multi-level field picker (drill into association fields), fetched at render.
                ptdlSearchFields: cell('Searchable fields', SearchFieldPicker, { type: 'array' }),
                rowBackend: grid({
                  ptdlMatchMode: segCell('Match mode', [
                    { value: 'contains', label: te('Contains') },
                    { value: 'startsWith', label: te('Starts with') },
                    { value: 'exact', label: te('Exact') },
                  ]),
                  ptdlSearchWidth: segCell('Width', [
                    { value: 'narrow', label: te('Narrow') },
                    { value: 'normal', label: te('Normal') },
                    { value: 'wide', label: te('Wide') },
                  ]),
                }),
                // ── Frontend ──
                rowPlace: grid({
                  ptdlSearchPlaceholder: cell('Placeholder', 'Input', { props: { placeholder: te('Search...') } }),
                  position: segCell('Position', [
                    { value: 'left', label: te('Left') },
                    { value: 'right', label: te('Right') },
                  ]),
                }),
                rowIcon: grid({
                  ptdlSearchIconPos: segCell('Icon position', [
                    { value: 'left', label: te('Left') },
                    { value: 'right', label: te('Right') },
                  ]),
                  ptdlSearchIconContainer: segCell('Icon container', [
                    { value: 'none', label: te('None') },
                    { value: 'border', label: te('Border') },
                    { value: 'fill', label: te('Fill') },
                  ]),
                }),
                rowIconColor: grid({
                  ptdlSearchIconColor: cell('Icon colour', ColorField),
                  ptdlSearchIconBoxColor: cell('Container colour', ColorField, {
                    reactions: rx((v: any) => v && v.ptdlSearchIconContainer && v.ptdlSearchIconContainer !== 'none'),
                  }),
                }),
                rowStyle: grid({
                  ptdlSearchVariant: segCell('Style', [
                    { value: 'outlined', label: te('Outlined') },
                    { value: 'filled', label: te('Filled') },
                    { value: 'borderless', label: te('Borderless') },
                  ]),
                  ptdlSearchShape: segCell('Shape', [
                    { value: 'square', label: te('Square') },
                    { value: 'rounded', label: te('Rounded') },
                    { value: 'pill', label: te('Pill') },
                  ]),
                }),
                rowInputColor: grid({
                  ptdlSearchBg: cell('Background colour', ColorField),
                  ptdlSearchText: cell('Text colour', ColorField),
                }),
              };
            },
            defaultParams(ctx: any) {
              const p = (ctx.model && ctx.model.props) || {};
              return {
                ptdlSearchFields: Array.isArray(p.ptdlSearchFields) ? p.ptdlSearchFields : [],
                ptdlMatchMode: p.ptdlMatchMode || 'contains',
                ptdlSearchPlaceholder: p.ptdlSearchPlaceholder || '',
                ptdlSearchWidth: p.ptdlSearchWidth || 'normal',
                ptdlSearchIconPos: p.ptdlSearchIconPos || 'left',
                ptdlSearchIconContainer: p.ptdlSearchIconContainer || 'none',
                ptdlSearchIconBoxColor: p.ptdlSearchIconBoxColor || '',
                ptdlSearchIconColor: p.ptdlSearchIconColor || '',
                ptdlSearchVariant: p.ptdlSearchVariant || 'outlined',
                ptdlSearchShape: p.ptdlSearchShape || 'rounded',
                ptdlSearchBg: p.ptdlSearchBg || '',
                ptdlSearchText: p.ptdlSearchText || '',
                position: p.position || 'left',
              };
            },
            handler(ctx: any, params: any) {
              const p = params || {};
              ctx.model.setProps({
                ptdlSearchFields: Array.isArray(p.ptdlSearchFields) ? p.ptdlSearchFields : [],
                ptdlMatchMode: p.ptdlMatchMode || 'contains',
                ptdlSearchPlaceholder: p.ptdlSearchPlaceholder || '',
                ptdlSearchWidth: p.ptdlSearchWidth || 'normal',
                ptdlSearchIconPos: p.ptdlSearchIconPos || 'left',
                ptdlSearchIconContainer: p.ptdlSearchIconContainer || 'none',
                ptdlSearchIconBoxColor: p.ptdlSearchIconBoxColor || '',
                ptdlSearchIconColor: p.ptdlSearchIconColor || '',
                ptdlSearchVariant: p.ptdlSearchVariant || 'outlined',
                ptdlSearchShape: p.ptdlSearchShape || 'rounded',
                ptdlSearchBg: p.ptdlSearchBg || '',
                ptdlSearchText: p.ptdlSearchText || '',
                position: p.position || 'left',
              });
              // re-apply the current search with the new config
              try {
                const resource = ctx.model.context && (ctx.model.context.resource || (ctx.model.context.blockModel && ctx.model.context.blockModel.resource));
                const text = ctx.model.__ptdlSearchVal || '';
                if (resource && resource.addFilterGroup) {
                  const configured = Array.isArray(p.ptdlSearchFields) && p.ptdlSearchFields.length ? p.ptdlSearchFields : textFields(collectionOf(ctx.model)).map((x) => x.name);
                  const op = MATCH_OP[p.ptdlMatchMode] || '$includes';
                  if (text && configured.length) {
                    resource.addFilterGroup(SEARCH_FILTER_KEY, { $or: configured.map((f: string) => ({ [f]: { [op]: text } })) });
                    if (resource.setPage) resource.setPage(1);
                    if (resource.refresh) resource.refresh();
                  }
                }
              } catch (_) {
                /* re-apply is best-effort */
              }
            },
          },
        },
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(`[action-enh] (${lane}) search action register failed`, e);
    }
  };

  bind();
}
