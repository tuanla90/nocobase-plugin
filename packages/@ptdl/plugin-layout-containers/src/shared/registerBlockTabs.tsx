/**
 * Shared registration for the Tabs block — called from BOTH lanes:
 *   - src/client      (classic app, Plugin/Icon from @nocobase/client)
 *   - src/client-v2   (modern /v/ app, Plugin/Icon from @nocobase/client-v2)
 *
 * Models registered here:
 *   - BlockTabsModel      (extends core BlockModel)  — the container block. Holds an array
 *                          sub-model `tabs`, renders an antd <Tabs>, "Add tab" in edit mode.
 *   - BlockTabPaneModel   (extends core FlowModel)   — one tab. Holds an object sub-model
 *                          `grid` (a core BlockGridModel or FormGridModel) so each tab can
 *                          contain any other block/field. Infinite nesting is free because the
 *                          nested grid's add-menu lists the same models.
 *
 * The tab-styling helpers (buildTabCss / renderTabsUI / TabStylePreview / TabPaneGrid) and the
 * reused BlockTabPaneModel are exported so the form variant (registerFormTabs) can share them.
 * Everything persists through the standard flowModels tree — no server code, no desktopRoutes.
 */
import {
  AddSubModelButton,
  DndProvider,
  DragHandler,
  Droppable,
  FlowModel,
  FlowModelRenderer,
  FlowSettingsButton,
  tExpr,
} from '@nocobase/flow-engine';
import { observer, useForm } from '@formily/react';
import { Collapse, Spin, Tabs } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import React from 'react';
import { ColorField, CollapsibleSection, SEG_PROPS, visibleWhen, SegmentedGroup } from '@ptdl/shared';

export const NS = 'plugin-block-tabs'; // i18n namespace (labels fall back to English keys)

// SEG_PROPS (bordered + `block` Segmented preset for the settings-dialog button groups) is imported
// from @ptdl/shared above — the kit const is byte-identical to the former local one.

// Color field for the settings dialogs — now the canonical shared wrapper (antd ColorPicker with the
// same 16-preset palette + safe value->string normalize; emits undefined when cleared, as before).
// Re-exported so existing uiSchema `'x-component': ColorField` references keep resolving.
export { ColorField };

export type TabStyleKind = 'line' | 'button' | 'segment' | 'text' | 'card' | 'step';

export interface TabStyleOpts {
  activeColor?: string;
  normalColor?: string; // inactive tab label colour; empty → theme default
  bold?: 'none' | 'active' | 'all'; // which tab labels are bold
  hoverColor?: string;
  containerColor?: string;
  borderColor?: string;
  bgColor?: string;
  fontSize?: number;
  topSpacing?: number;
}

export const DEFAULTS = {
  style: 'line' as TabStyleKind,
  activeColor: '#1677ff',
  normalColor: '' as string, // empty → theme default (inactive tab text)
  bold: 'active' as 'none' | 'active' | 'all', // active tab only (current behaviour)
  hoverColor: '' as string, // empty → falls back to activeColor
  containerColor: '' as string, // empty → theme default tray background
  borderColor: '' as string, // empty → no container border
  bgColor: '' as string, // empty → theme default (tab bar strip / card active fill)
  fontSize: 0, // 0 → default label size
  topSpacing: 0, // px pushed above the tab bar
  tabPosition: 'top' as 'top' | 'bottom' | 'left' | 'right',
  centered: false,
};

/** Scoped CSS that turns antd's line-tabs into the chosen look. `scope` is a CSS selector
 *  (e.g. `.nb-bt-<uid>`) so the same builder serves the block, page and form tabs. */
export function buildTabCss(
  scope: string,
  kind: TabStyleKind,
  opts: TabStyleOpts = {},
  position: 'top' | 'bottom' | 'left' | 'right' = 'top',
): string {
  const s = scope;
  const active = opts.activeColor || DEFAULTS.activeColor;
  const hover = opts.hoverColor || active;
  const tray = opts.containerColor || 'var(--colorFillTertiary, rgba(0,0,0,0.04))';
  const border = opts.borderColor;
  const segBorder = border || 'var(--colorBorder, #d9d9d9)';
  // Card active fill defaults to the current page background (theme var, auto-adapts incl. dark mode)
  // so the folder tab blends into the content; an explicit bgColor overrides it.
  const cardActiveBg = opts.bgColor || 'var(--colorBgLayout, #fff)';
  const textMuted = opts.normalColor || 'var(--colorText, rgba(0,0,0,0.65))';
  // Vertical (Position = Left/Right) needs orientation-flipped CSS for the bordered/folder/stepped
  // looks; `endSide` is the content-facing edge of the tab column (right for Left, left for Right).
  const vertical = position === 'left' || position === 'right';
  const endSide = position === 'right' ? 'start' : 'end';
  let css = '';

  if (kind === 'text') {
    // No line, no ink bar — the active tab is shown by coloured, bold text only.
    css = `
${s} .ant-tabs-nav::before{border:none!important}
${s} .ant-tabs-ink-bar{display:none!important}
${s} .ant-tabs-tab{padding:4px 12px!important;${vertical ? 'margin:0 0 2px 0' : 'margin:0 4px 0 0'}!important}
${s} .ant-tabs-tab .ant-tabs-tab-btn{color:${textMuted};transition:color .2s}
${s} .ant-tabs-tab:hover .ant-tabs-tab-btn{color:${hover}!important}
${s} .ant-tabs-tab-active .ant-tabs-tab-btn{color:${active}!important;font-weight:600;text-shadow:none}
`;
  } else if (kind === 'button') {
    // Segmented "button group" (≈ option 6): a soft/pill tray; active pill filled with activeColor.
    css = `
${s} .ant-tabs-nav::before{border:none!important}
${s} .ant-tabs-ink-bar{display:none!important}
${s} .ant-tabs-nav .ant-tabs-nav-list{gap:4px;padding:4px;background:${tray};border-radius:${vertical ? '14px' : '999px'}}
${s} .ant-tabs-tab{margin:0!important;padding:4px 16px!important;border:none!important;border-radius:999px!important;justify-content:center;transition:background .2s,color .2s}${vertical ? `\n${s} .ant-tabs-tab{align-self:stretch}` : ''}
${s} .ant-tabs-tab .ant-tabs-tab-btn{color:${textMuted}}
${s} .ant-tabs-tab:hover:not(.ant-tabs-tab-active){background:var(--colorFillSecondary, rgba(0,0,0,0.06))!important}
${s} .ant-tabs-tab:hover:not(.ant-tabs-tab-active) .ant-tabs-tab-btn{color:${hover}!important}
${s} .ant-tabs-tab-active{background:${active}!important}
${s} .ant-tabs-tab-active .ant-tabs-tab-btn{color:#fff!important;font-weight:600}
${s} .ant-tabs-tab-active:hover .ant-tabs-tab-btn{color:#fff!important}
`;
  } else if (kind === 'segment') {
    // Bordered segmented box (≈ option 4): outlined container, tabs split by dividers, active filled.
    css = `
${s} .ant-tabs-nav::before{border:none!important}
${s} .ant-tabs-ink-bar{display:none!important}
${s} .ant-tabs-nav .ant-tabs-nav-list{border:1px solid ${segBorder};border-radius:8px;overflow:hidden}
${s} .ant-tabs-tab{margin:0!important;padding:6px 18px!important;border:none!important;${vertical ? 'border-block-end' : 'border-inline-end'}:1px solid ${segBorder}!important;justify-content:center;transition:all .2s}
${s} .ant-tabs-tab:last-child{${vertical ? 'border-block-end' : 'border-inline-end'}:none!important}
${s} .ant-tabs-tab .ant-tabs-tab-btn{color:${textMuted}}
${s} .ant-tabs-tab:hover:not(.ant-tabs-tab-active) .ant-tabs-tab-btn{color:${hover}!important}
${s} .ant-tabs-tab-active{background:${active}!important}
${s} .ant-tabs-tab-active .ant-tabs-tab-btn{color:#fff!important;font-weight:600}
`;
  } else if (kind === 'step') {
    // Numbered stepper: a circle badge per tab + connector line; active step filled with activeColor.
    // Vertical stacks the badges with a vertical connector; horizontal keeps them in a row.
    css = vertical
      ? `
${s} .ant-tabs-nav::before{border:none!important}
${s} .ant-tabs-ink-bar{display:none!important}
${s} .ant-tabs-nav-list{counter-reset:nbstep}
${s} .ant-tabs-tab{position:relative;counter-increment:nbstep;margin:0 0 20px 0!important;padding:4px 8px 4px 40px!important;justify-content:flex-start}
${s} .ant-tabs-tab::before{content:counter(nbstep);position:absolute;inset-inline-start:0;top:50%;transform:translateY(-50%);width:26px;height:26px;border-radius:50%;background:${tray};color:${textMuted};display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;z-index:1;transition:all .2s}
${s} .ant-tabs-tab:not(:nth-last-child(2))::after{content:'';position:absolute;inset-inline-start:12px;top:calc(50% + 13px);height:calc(100% + 20px - 26px);width:2px;background:var(--colorSplit, #e5e5e5)}
${s} .ant-tabs-tab .ant-tabs-tab-btn{color:${textMuted}}
${s} .ant-tabs-tab:hover .ant-tabs-tab-btn{color:${hover}!important}
${s} .ant-tabs-tab:hover::before{color:${hover}}
${s} .ant-tabs-tab-active::before{background:${active}!important;color:#fff!important}
${s} .ant-tabs-tab-active .ant-tabs-tab-btn{color:${active}!important;font-weight:600}
`
      : `
${s} .ant-tabs-nav::before{border:none!important}
${s} .ant-tabs-ink-bar{display:none!important}
${s} .ant-tabs-nav-list{counter-reset:nbstep}
${s} .ant-tabs-tab{position:relative;counter-increment:nbstep;margin:0 28px 0 0!important;padding:4px 8px 4px 36px!important}
${s} .ant-tabs-tab::before{content:counter(nbstep);position:absolute;left:0;top:50%;transform:translateY(-50%);width:26px;height:26px;border-radius:50%;background:${tray};color:${textMuted};display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;transition:all .2s}
${s} .ant-tabs-tab:not(:nth-last-child(2))::after{content:'';position:absolute;right:-28px;top:50%;width:28px;height:2px;background:var(--colorSplit, #e5e5e5)}
${s} .ant-tabs-tab .ant-tabs-tab-btn{color:${textMuted}}
${s} .ant-tabs-tab:hover .ant-tabs-tab-btn{color:${hover}!important}
${s} .ant-tabs-tab:hover::before{color:${hover}}
${s} .ant-tabs-tab-active::before{background:${active}!important;color:#fff!important}
${s} .ant-tabs-tab-active .ant-tabs-tab-btn{color:${active}!important;font-weight:600}
`;
  } else if (kind === 'card') {
    // CSS folder/card tabs (≈ option 10). Built purely with CSS (no antd type="card") so the core
    // page/popup tabs get it too — those are rendered as line-tabs and we can only inject CSS.
    // The active folder tab MERGES into a bordered content panel (cardActiveBg) so it reads as
    // "attached to its container", not floating: the nav↔content gap is removed and the content-holder
    // gets a border/fill. Vertical uses a robust flush merge — the active tab drops its panel-facing
    // border and shares the panel fill (both borderless + same colour on the seam → no line, no pixel
    // overlap to misalign); inactive tabs keep their border as the separator. Top/Bottom use a −1px
    // matching-colour overlap: Top hangs the folder below the tabs (round top, join at bottom); Bottom
    // flips it — tabs under the content, round the bottom corners, join UPWARD into the panel above.
    css = vertical
      ? `
${s} .ant-tabs-nav{margin-inline-${endSide}:0!important}
${s} .ant-tabs-nav::before{border:none!important}
${s} .ant-tabs-ink-bar{display:none!important}
${s} .ant-tabs-tab{align-self:stretch;justify-content:flex-start;margin:0 0 4px 0!important;padding:6px 16px!important;border:1px solid ${segBorder}!important;border-inline-${endSide}:none!important;border-radius:${position === 'right' ? '0 8px 8px 0' : '8px 0 0 8px'}!important;background:var(--colorFillQuaternary, rgba(0,0,0,0.02))!important;transition:all .2s}
${s} .ant-tabs-tab .ant-tabs-tab-btn{color:${textMuted}}
${s} .ant-tabs-tab:hover .ant-tabs-tab-btn{color:${hover}!important}
${s} .ant-tabs-tab-active{background:${cardActiveBg}!important;z-index:1}
${s} .ant-tabs-tab-active .ant-tabs-tab-btn{color:${active}!important;font-weight:600}
${s} .ant-tabs-content-holder{border:1px solid ${segBorder}!important;margin:0!important;background:${cardActiveBg}!important;border-radius:${position === 'right' ? '8px 0 0 8px' : '0 8px 8px 0'}!important}
${s} .ant-tabs-tabpane{padding:10px!important}
`
      : position === 'bottom'
      ? `
${s} .ant-tabs-nav{margin-top:0!important}
${s} .ant-tabs-nav::before{border-top:1px solid ${segBorder}!important;border-bottom:none!important}
${s} .ant-tabs-ink-bar{display:none!important}
${s} .ant-tabs-tab{margin:-1px 4px 0 0!important;padding:6px 16px!important;border:1px solid ${segBorder}!important;border-radius:0 0 8px 8px!important;background:var(--colorFillQuaternary, rgba(0,0,0,0.02))!important;transition:all .2s}
${s} .ant-tabs-tab .ant-tabs-tab-btn{color:${textMuted}}
${s} .ant-tabs-tab:hover .ant-tabs-tab-btn{color:${hover}!important}
${s} .ant-tabs-tab-active{background:${cardActiveBg}!important;border-top-color:${cardActiveBg}!important;z-index:1}
${s} .ant-tabs-tab-active .ant-tabs-tab-btn{color:${active}!important;font-weight:600}
${s} .ant-tabs-content-holder{border:1px solid ${segBorder}!important;border-bottom:none!important;background:${cardActiveBg}!important;border-radius:8px 8px 0 0!important}
${s} .ant-tabs-tabpane{padding:10px!important}
`
      : `
${s} .ant-tabs-nav{margin-bottom:0!important}
${s} .ant-tabs-nav::before{border-bottom:1px solid ${segBorder}!important}
${s} .ant-tabs-ink-bar{display:none!important}
${s} .ant-tabs-tab{margin:0 4px -1px 0!important;padding:6px 16px!important;border:1px solid ${segBorder}!important;border-radius:8px 8px 0 0!important;background:var(--colorFillQuaternary, rgba(0,0,0,0.02))!important;transition:all .2s}
${s} .ant-tabs-tab .ant-tabs-tab-btn{color:${textMuted}}
${s} .ant-tabs-tab:hover .ant-tabs-tab-btn{color:${hover}!important}
${s} .ant-tabs-tab-active{background:${cardActiveBg}!important;border-bottom-color:${cardActiveBg}!important;z-index:1}
${s} .ant-tabs-tab-active .ant-tabs-tab-btn{color:${active}!important;font-weight:600}
${s} .ant-tabs-content-holder{border:1px solid ${segBorder}!important;border-top:none!important;background:${cardActiveBg}!important;border-radius:0 0 8px 8px!important}
${s} .ant-tabs-tabpane{padding:10px!important}
`;
  } else {
    // line (antd default) — recolour the ink bar + active/hover text.
    css = `
${s} .ant-tabs-ink-bar{background:${active}!important}
${s} .ant-tabs-tab:hover .ant-tabs-tab-btn{color:${hover}!important}
${s} .ant-tabs-tab-active .ant-tabs-tab-btn{color:${active}!important}
`;
  }

  // Optional container border (segment already has its own). Wraps the tab strip in an outline.
  if (border) {
    if (kind === 'button') {
      css += `\n${s} .ant-tabs-nav .ant-tabs-nav-list{border:1px solid ${border}!important}`;
    } else if (kind !== 'segment' && kind !== 'card') {
      // segment & card already draw their own border (via segBorder = borderColor || default).
      css += `\n${s} .ant-tabs-nav .ant-tabs-nav-list{border:1px solid ${border};border-radius:8px;padding:2px 6px}`;
    }
  }
  // Background of the ACTIVE tab only (card handles it via cardActiveBg above; here for other styles).
  if (opts.bgColor && kind !== 'card') {
    css += `\n${s} .ant-tabs-tab-active{background:${opts.bgColor}!important}`;
  }
  // Bigger label text — e.g. Text style + a heading size = a lightweight fake header/title.
  if (opts.fontSize) {
    css += `\n${s} .ant-tabs-tab .ant-tabs-tab-btn{font-size:${opts.fontSize}px;line-height:1.35}`;
  }
  // Push the whole tab bar down a bit (e.g. so a Card tab isn't flush against the top edge).
  if (opts.topSpacing) {
    css += `\n${s} .ant-tabs-nav{margin-top:${opts.topSpacing}px!important;margin-bottom:${opts.topSpacing}px!important}`;
  }
  // Non-card styles: a top rule on the content so it reads as separate from the tab bar. Card is a
  // folder that JOINS its content, so it's excluded (no divider).
  if (kind !== 'card') {
    css += `\n${s} .ant-tabs-content-holder{border-top:1px solid ${segBorder}!important;padding-top:10px!important}`;
  }
  // Bold mode: 'none' → no bold; 'active' → active tab only (default); 'all' → every tab bold.
  // Appended LAST (inactive rule first, active second) so it overrides each style's hard-coded
  // `font-weight:600` on the active tab, and the equal-specificity active rule wins by source order.
  const boldMode = opts.bold || 'active';
  const activeWeight = boldMode === 'none' ? 400 : 600;
  const inactiveWeight = boldMode === 'all' ? 600 : 400;
  css += `\n${s} .ant-tabs-tab .ant-tabs-tab-btn{font-weight:${inactiveWeight}}\n${s} .ant-tabs-tab-active .ant-tabs-tab-btn{font-weight:${activeWeight}}`;
  // Neutralise tab styling LEAKING in from a surrounding PAGE tab style (its `.nb-ptab-<uid> .ant-tabs-*`
  // descendant selectors also match a nested block/form tab). Reset first; the style branches above
  // re-set whatever they need (card/segment/button re-add border+fill; line/text/step stay clean).
  const resetCss =
    `\n${s} .ant-tabs-tab{border:none!important;background:none!important;border-radius:0!important;box-shadow:none!important}` +
    // Default breathing room below the tab bar (a surrounding PAGE card style can leak margin-bottom:0
    // in and jam the content against the tabs). Card overrides to 0 (folder join); Spacing overrides too.
    `\n${s} .ant-tabs-nav{margin-bottom:12px!important}`;
  return resetCss + css;
}

export const TabCss: React.FC<{
  uid: string;
  kind: TabStyleKind;
  opts: TabStyleOpts;
  position?: 'top' | 'bottom' | 'left' | 'right';
}> = ({ uid, kind, opts, position }) => (
  // Double the scope class (`.nb-bt-x.nb-bt-x`) so every block rule is 3-specificity and beats a
  // surrounding PAGE tab style's 2-specificity `.nb-ptab-<uid> .ant-tabs-*` leak, regardless of order.
  <style dangerouslySetInnerHTML={{ __html: buildTabCss(`.nb-bt-${uid}.nb-bt-${uid}`, kind, opts, position) }} />
);

/**
 * Live preview of the tab bar for the settings dialog. Reads the dialog's current form values
 * (style / activeColor / centered) reactively via @formily and renders a sample tab bar so the
 * user sees the result before saving.
 */
export const TabStylePreview: React.FC = observer(() => {
  const form: any = useForm();
  const v = (form && form.values) || {};
  const kind: TabStyleKind | 'default' = v.style || DEFAULTS.style;
  const opts: TabStyleOpts = {
    activeColor: v.activeColor,
    normalColor: v.normalColor,
    bold: v.bold,
    hoverColor: v.hoverColor,
    containerColor: v.containerColor,
    borderColor: v.borderColor,
    bgColor: v.bgColor,
    fontSize: v.fontSize,
    topSpacing: v.topSpacing,
  };
  const tabPosition = 'top'; // Position option hidden (forced Top) — keep preview in sync
  const vertical = tabPosition === 'left' || tabPosition === 'right';
  const centered = !!v.centered;
  if (kind === 'default') {
    return (
      <div style={{ color: 'var(--colorTextTertiary, #999)', fontSize: 12, padding: '4px 0' }}>
        Preview: giữ kiểu mặc định (không đổi).
      </div>
    );
  }
  const scope = 'nb-bt-preview';
  // Vertical tabs (Position = Left/Right): antd/rc-tabs collapses tabs into a "…" overflow button
  // when the tab column is taller than the flex row. Here the row's height is driven by the tab
  // column itself, so showing the "…" shrinks the column → it now fits → the "…" is removed → the
  // column grows → it overflows again … an endless ResizeObserver loop that blinks the "…" on/off
  // and makes the whole settings dialog jump size (the reported bug). Break the self-reference by
  // making the CONTENT the tallest element: size it to clear the 3 stacked sample tabs (scaled with
  // the chosen label size) with comfortable slack, so the tabs always fit and rc-tabs settles.
  const labelPx = v.fontSize || 14;
  const vMinHeight = Math.max(150, labelPx * 5 + 80);
  const content = (
    <div
      style={{
        background: '#fff',
        border: '1px solid var(--colorBorderSecondary, #f0f0f0)',
        borderRadius: 6,
        minHeight: vertical ? vMinHeight : 56,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--colorTextQuaternary, #bfbfbf)',
        fontSize: 12,
      }}
    >
      Nội dung tab
    </div>
  );
  const items = ['Tab 1', 'Tab 2', 'Tab 3'].map((t, i) => ({ key: String(i), label: t, children: content }));
  const css =
    buildTabCss(`.${scope}`, kind as TabStyleKind, opts, tabPosition as any) +
    (centered && vertical ? `\n.${scope} .ant-tabs-nav{justify-content:center}` : '');
  return (
    <div
      className={scope}
      style={{
        border: '1px dashed var(--colorBorder, #e8e8e8)',
        borderRadius: 8,
        padding: 12,
        background: 'var(--colorBgLayout, #fafafa)',
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <Tabs
        activeKey="0"
        items={items as any}
        type="line"
        tabPosition={tabPosition as any}
        centered={centered && !vertical}
        tabBarStyle={{ marginBottom: vertical ? 0 : 8 }}
      />
    </div>
  );
});

/** The `preview` uiSchema field, appended to every tab-style settings step. */
export const previewField = {
  type: 'void',
  title: tExpr('Preview', { ns: NS }),
  'x-decorator': 'FormItem',
  'x-component': TabStylePreview,
};

/**
 * Lazily load/create the grid that lives inside one tab and render it. `gridUse` selects the grid
 * kind — 'BlockGridModel' for the block (any block) or 'FormGridModel' for the in-form variant
 * (fields that bind to the form). Mirrors core's PageTabChildrenRenderer without desktopRoutes.
 */
export const TabPaneGrid: React.FC<{ tabModel: any; gridUse?: string }> = ({ tabModel, gridUse = 'BlockGridModel' }) => {
  const ctx = tabModel.context;
  const [model, setModel] = React.useState<any>(() => tabModel.subModels?.grid || null);
  React.useEffect(() => {
    let alive = true;
    if (tabModel.subModels?.grid) {
      setModel(tabModel.subModels.grid);
      return;
    }
    Promise.resolve(
      tabModel.flowEngine.loadOrCreateModel(
        { parentId: tabModel.uid, subKey: 'grid', async: true, subType: 'object', use: gridUse },
        { skipSave: !ctx.flowSettingsEnabled },
      ),
    )
      .then((m: any) => {
        if (!alive || !m) return;
        m.context.addDelegate(ctx);
        setModel(m);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [tabModel.uid]);
  const margin = ctx?.themeToken?.marginBlock ?? 16;
  if (!model) {
    return (
      <div style={{ padding: margin, textAlign: 'center' }}>
        <Spin />
      </div>
    );
  }
  return <FlowModelRenderer model={model} />;
};

/**
 * Render the whole tabs UI (scoped CSS + antd <Tabs> + drag-reorder + Add-tab) for a container
 * model that has `subModels.tabs`. Shared by the block container and the in-form container; each
 * only differs in `gridUse` and its wrapper element. Called directly from render() (not as a
 * component) so it re-runs on every model re-render.
 */
export function renderTabsUI(model: any, gridUse: string): React.ReactElement {
  const editing = !!model.context.flowSettingsEnabled;
  const kind: TabStyleKind = model.props.btStyle ?? DEFAULTS.style;
  const opts: TabStyleOpts = {
    activeColor: model.props.btActiveColor ?? DEFAULTS.activeColor,
    normalColor: model.props.btNormalColor,
    bold: model.props.btBold,
    hoverColor: model.props.btHoverColor,
    containerColor: model.props.btContainerColor,
    borderColor: model.props.btBorderColor,
    bgColor: model.props.btBgColor,
    fontSize: model.props.btFontSize,
    topSpacing: model.props.btTopSpacing,
  };
  // Position option temporarily hidden — vertical/bottom card rendering is WIP; force Top for now.
  const tabPosition = 'top';
  const centered = model.props.btCentered ?? DEFAULTS.centered;

  const items = model
    .mapSubModels('tabs', (m: any) => {
      // NOTE: previously `if (!editing && m.hidden) return null` — that hid ALL tabs in view mode
      // when m.hidden was truthy (tabs showed in edit only). Removed so tabs render in both modes.
      return {
        key: m.uid,
        label: editing ? (
          <Droppable model={m}>
            <FlowModelRenderer
              model={m}
              showFlowSettings={{ showBackground: true, showBorder: false, toolbarPosition: 'above', style: { transform: 'translateY(6px)' } }}
              extraToolbarItems={[{ key: 'drag-handler', component: DragHandler, sort: 1 }]}
            />
          </Droppable>
        ) : (
          // View mode: render the tab TITLE text directly (no Droppable, no FlowModelRenderer) — the
          // most robust label; wrapping was leaving the label empty and hiding the whole tab bar.
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {(m.getTabTitle && m.getTabTitle()) || m.props?.title || 'Tab'}
          </span>
        ),
        children: <TabPaneGrid tabModel={m} gridUse={gridUse} />,
      };
    })
    .filter(Boolean);

  const ids = (items as any[]).map((it) => it.key);
  const firstUid = ids[0];
  let activeKey = model.props.tabActiveKey || firstUid;
  if (activeKey && ids.indexOf(activeKey) === -1) activeKey = firstUid;

  const onDragEnd = async (event: any) => {
    if (!event?.active?.id || !event?.over?.id) return;
    if (event.active.id === event.over.id) return;
    await model.flowEngine.moveModel(event.active.id, event.over.id);
  };

  const addButton = editing ? (
    <span style={{ display: 'inline-flex', marginInlineStart: 8 }}>
      <AddSubModelButton
        model={model}
        subModelKey="tabs"
        subModelType="array"
        afterSubModelAdd={async (sub: any) => {
          if (sub?.uid) model.setProps('tabActiveKey', sub.uid);
        }}
        items={[
          {
            key: 'blank',
            label: model.context.t('Blank tab', { ns: NS }) || 'Blank tab',
            createModelOptions: () => ({ use: 'BlockTabPaneModel' }),
          },
        ]}
      >
        <FlowSettingsButton icon={<PlusOutlined />}>
          {model.context.t('Add tab', { ns: NS }) || 'Add tab'}
        </FlowSettingsButton>
      </AddSubModelButton>
    </span>
  ) : null;

  // Always render antd line-tabs; every look (incl. card/folder) is produced via buildTabCss so it
  // stays consistent with the page/popup tabs (which we can only restyle with CSS, not re-type).
  const antType = 'line';

  return (
    <div className={`nb-bt nb-bt-${model.uid}`}>
      <TabCss uid={model.uid} kind={kind} opts={opts} position={tabPosition} />
      {/* Guard: the PAGE tab style's "hide when single tab" injects `.nb-ptab-<uid> .ant-tabs-nav
          {display:none}` — a descendant selector that also hits THIS block's nav when the block sits
          inside such a page. Force our own nav back (higher specificity: 3 classes vs 2 + !important). */}
      <style
        dangerouslySetInnerHTML={{
          __html: `.nb-bt-${model.uid} .ant-tabs > .ant-tabs-nav{display:flex!important}`,
        }}
      />
      {centered && (tabPosition === 'left' || tabPosition === 'right') ? (
        <style dangerouslySetInnerHTML={{ __html: `.nb-bt-${model.uid} .ant-tabs-nav{justify-content:center}` }} />
      ) : null}
      {items.length === 0 ? (
        editing ? (
          <div style={{ padding: '8px 0' }}>{addButton}</div>
        ) : null
      ) : editing ? (
        <DndProvider onDragEnd={onDragEnd}>
          <Tabs
            type={antType as any}
            tabPosition={tabPosition as any}
            centered={centered}
            activeKey={activeKey}
            items={items as any}
            onChange={(k) => model.setProps('tabActiveKey', k)}
            tabBarExtraContent={{ right: addButton }}
          />
        </DndProvider>
      ) : (
        <Tabs
          type={antType as any}
          tabPosition={tabPosition as any}
          centered={centered}
          activeKey={activeKey}
          items={items as any}
          onChange={(k) => model.setProps('tabActiveKey', k)}
        />
      )}
    </div>
  );
}

/**
 * Render a Collapse/accordion container — same `subModels.tabs` panes as the Tabs block (each pane =
 * title + a grid via BlockTabPaneModel/TabPaneGrid), but stacked vertically as collapsible sections
 * (the "khối thu/gập" for form/detail). All sections start open; `clpAccordion` keeps only one open.
 * In edit mode only the chevron toggles so the title/gear/drag stay clickable; in view mode the whole
 * header toggles. Reuses the exact same container-core (loadOrCreateModel grid + moveModel DnD).
 */
export function renderCollapseUI(model: any, gridUse: string): React.ReactElement {
  const editing = !!model.context.flowSettingsEnabled;
  const accordion = !!model.props.clpAccordion;
  const bordered = model.props.clpBordered ?? true;
  const ghost = !!model.props.clpGhost;
  const size = model.props.clpSize || 'middle';
  const iconPos = model.props.clpIconPos || 'start';
  const headerBg: string | undefined = model.props.clpHeaderBg;
  const activeColor: string | undefined = model.props.clpActiveColor;
  const normalColor: string | undefined = model.props.clpNormalColor;
  const bold: string | undefined = model.props.clpBold;
  const borderColor: string | undefined = model.props.clpBorderColor;

  const items = model
    .mapSubModels('tabs', (m: any) => {
      if (!editing && m.hidden) return null;
      return {
        key: m.uid,
        label: (
          <Droppable model={m}>
            <FlowModelRenderer
              model={m}
              showFlowSettings={
                editing ? { showBackground: true, showBorder: false, toolbarPosition: 'right' } : false
              }
              extraToolbarItems={editing ? [{ key: 'drag-handler', component: DragHandler, sort: 1 }] : undefined}
            />
          </Droppable>
        ),
        children: <TabPaneGrid tabModel={m} gridUse={gridUse} />,
      };
    })
    .filter(Boolean);

  const ids = (items as any[]).map((it) => it.key);
  const defaultState = model.props.clpDefaultState || 'expand';
  const defaultActiveKey = defaultState === 'collapse' ? [] : accordion ? (ids[0] ? [ids[0]] : []) : ids;

  const onDragEnd = async (event: any) => {
    if (!event?.active?.id || !event?.over?.id || event.active.id === event.over.id) return;
    await model.flowEngine.moveModel(event.active.id, event.over.id);
  };

  const addButton = editing ? (
    <AddSubModelButton
      model={model}
      subModelKey="tabs"
      subModelType="array"
      items={[
        {
          key: 'blank',
          label: model.context.t('Blank section', { ns: NS }) || 'Blank section',
          createModelOptions: () => ({ use: 'BlockTabPaneModel' }),
        },
      ]}
    >
      <FlowSettingsButton icon={<PlusOutlined />}>
        {model.context.t('Add section', { ns: NS }) || 'Add section'}
      </FlowSettingsButton>
    </AddSubModelButton>
  ) : null;

  const collapseEl = (
    <Collapse
      items={items as any}
      defaultActiveKey={defaultActiveKey as any}
      accordion={accordion}
      collapsible={editing ? 'icon' : 'header'}
      bordered={bordered}
      ghost={ghost}
      size={size as any}
      expandIconPosition={iconPos as any}
    />
  );

  const scope = `.nb-clp-${model.uid}`;
  let css = '';
  if (headerBg) css += `${scope} .ant-collapse-item > .ant-collapse-header{background:${headerBg}!important}`;
  // Normal (collapsed) section header text + expand icon. Active header keeps activeColor (applied
  // with !important below), so this only paints the non-active headers.
  if (normalColor)
    css += `\n${scope} .ant-collapse-item > .ant-collapse-header,${scope} .ant-collapse-item > .ant-collapse-header .ant-collapse-expand-icon{color:${normalColor}}`;
  if (activeColor)
    css += `\n${scope} .ant-collapse-item-active > .ant-collapse-header{color:${activeColor}!important}\n${scope} .ant-collapse-item-active > .ant-collapse-header .ant-collapse-expand-icon{color:${activeColor}!important}`;
  // Bold mode (only when set → keeps the antd default otherwise). Normal rule first, active second so
  // the equal-specificity active rule wins by source order.
  if (bold) {
    const activeW = bold === 'none' ? 400 : 600;
    const normalW = bold === 'all' ? 600 : 400;
    css += `\n${scope} .ant-collapse-item > .ant-collapse-header{font-weight:${normalW}}\n${scope} .ant-collapse-item-active > .ant-collapse-header{font-weight:${activeW}}`;
  }
  if (borderColor)
    css += `\n${scope} .ant-collapse,${scope} .ant-collapse > .ant-collapse-item,${scope} .ant-collapse-content{border-color:${borderColor}!important}`;

  return (
    <div className={`nb-bt nb-clp-${model.uid}`}>
      {css ? <style dangerouslySetInnerHTML={{ __html: css }} /> : null}
      {items.length === 0 ? (
        editing ? <div style={{ padding: '8px 0' }}>{addButton}</div> : null
      ) : (
        <>
          <DndProvider onDragEnd={onDragEnd}>{collapseEl}</DndProvider>
          {editing ? <div style={{ marginTop: 8 }}>{addButton}</div> : null}
        </>
      )}
    </div>
  );
}

/** The shared "Tab style" settings step (style / color / position / centered + live preview).
 *  `handler` writes bt* props that renderTabsUI reads. */
// Show a field only for certain style values — the kit's `visibleWhen('style', [...])` (function-form
// reaction; the {{$deps}} string form is unreliable in flow dialogs). It sets `{visible}`, which maps
// to display 'visible'/'none' exactly as the former local `setDisplay(...)` helper did.

const STYLE_ENUM = [
  { label: 'Line', value: 'line' },
  { label: 'Button group (pill)', value: 'button' },
  { label: 'Segment (bordered)', value: 'segment' },
  { label: 'Card (folder)', value: 'card' },
  { label: 'Step', value: 'step' },
  { label: 'Text (color only)', value: 'text' },
];

const POSITION_ENUM = [
  { label: 'Top', value: 'top' },
  { label: 'Bottom', value: 'bottom' },
  { label: 'Left', value: 'left' },
  { label: 'Right', value: 'right' },
];

export function tabStyleFlowStep() {
  return {
    title: tExpr('Tab style', { ns: NS }),
    uiSchema: {
      // Live preview first so it's always in view while tweaking the options below.
      preview: { ...previewField },
      // Shape: the two most fundamental choices (look + orientation), side by side and always visible.
      shape: {
        type: 'void',
        'x-component': 'FormGrid',
        'x-component-props': { maxColumns: 2, minColumns: 1, columnGap: 12 },
        properties: {
          style: {
            type: 'string',
            title: tExpr('Style', { ns: NS }),
            'x-decorator': 'FormItem',
            'x-component': 'Select',
            enum: STYLE_ENUM,
          },
          // Position temporarily hidden (vertical/bottom card WIP → forced Top); Centered surfaced here.
          centered: {
            type: 'boolean',
            title: tExpr('Centered', { ns: NS }),
            'x-decorator': 'FormItem',
            'x-component': 'Switch',
          },
        },
      },
      // Colors: one compact swatch strip (each is the shared ColorField, text hidden). The tray colour
      // only applies to Button/Step so it's shown last and reacts to the style.
      colors: {
        type: 'void',
        'x-component': CollapsibleSection,
        'x-component-props': { title: tExpr('Colors', { ns: NS }), defaultOpen: true },
        properties: {
          grid: {
            type: 'void',
            'x-component': 'FormGrid',
            'x-component-props': { maxColumns: 3, minColumns: 2, columnGap: 10 },
            properties: {
              activeColor: {
                type: 'string',
                title: tExpr('Active', { ns: NS }),
                'x-decorator': 'FormItem',
                'x-component': ColorField,
                'x-component-props': { showText: false },
              },
              normalColor: {
                type: 'string',
                title: tExpr('Normal', { ns: NS }),
                'x-decorator': 'FormItem',
                'x-decorator-props': { tooltip: tExpr('Inactive tab text colour. Empty = theme default.', { ns: NS }) },
                'x-component': ColorField,
                'x-component-props': { showText: false },
              },
              hoverColor: {
                type: 'string',
                title: tExpr('Hover', { ns: NS }),
                'x-decorator': 'FormItem',
                'x-decorator-props': { tooltip: tExpr('Leave empty to use the active color.', { ns: NS }) },
                'x-component': ColorField,
                'x-component-props': { showText: false },
              },
              borderColor: {
                type: 'string',
                title: tExpr('Border', { ns: NS }),
                'x-decorator': 'FormItem',
                'x-decorator-props': { tooltip: tExpr('Outline around the tab strip. Empty = no border.', { ns: NS }) },
                'x-component': ColorField,
                'x-component-props': { showText: false },
              },
              bgColor: {
                type: 'string',
                title: tExpr('Background', { ns: NS }),
                'x-decorator': 'FormItem',
                'x-decorator-props': { tooltip: tExpr('Background of the ACTIVE tab (the Card fill). Empty = matches the current page background.', { ns: NS }) },
                'x-component': ColorField,
                'x-component-props': { showText: false },
              },
              containerColor: {
                type: 'string',
                title: tExpr('Tray', { ns: NS }),
                'x-decorator': 'FormItem',
                'x-decorator-props': { tooltip: tExpr('Background of the button tray / step badges.', { ns: NS }) },
                'x-component': ColorField,
                'x-component-props': { showText: false },
                'x-reactions': visibleWhen('style', ['button', 'step']),
              },
            },
          },
        },
      },
      layout: {
        type: 'void',
        'x-component': CollapsibleSection,
        'x-component-props': { title: tExpr('Layout', { ns: NS }), defaultOpen: true },
        properties: {
          grid: {
            type: 'void',
            'x-component': 'FormGrid',
            'x-component-props': { maxColumns: 3, minColumns: 1, columnGap: 12 },
            properties: {
              fontSize: {
                type: 'number',
                title: tExpr('Text size', { ns: NS }),
                'x-decorator': 'FormItem',
                'x-decorator-props': { tooltip: tExpr('Bigger tab label — pair Text style + a heading size to use tabs as a title.', { ns: NS }) },
                'x-component': 'Select',
                enum: [
                  { label: 'Default', value: 0 },
                  { label: 'Large (16)', value: 16 },
                  { label: 'Larger (18)', value: 18 },
                  { label: 'Heading (22)', value: 22 },
                  { label: 'Big (28)', value: 28 },
                ],
              },
              bold: {
                type: 'string',
                title: tExpr('Bold', { ns: NS }),
                'x-decorator': 'FormItem',
                'x-decorator-props': { tooltip: tExpr('Which tab labels are bold.', { ns: NS }) },
                'x-component': 'Select',
                enum: [
                  { label: 'None', value: 'none' },
                  { label: 'Active only', value: 'active' },
                  { label: 'All', value: 'all' },
                ],
              },
              topSpacing: {
                type: 'number',
                title: tExpr('Spacing', { ns: NS }),
                'x-decorator': 'FormItem',
                'x-decorator-props': { tooltip: tExpr('Space above AND below the tab bar (breathing room between the tabs and the content).', { ns: NS }) },
                'x-component': 'Select',
                enum: [
                  { label: 'None', value: 0 },
                  { label: 'Small (4)', value: 4 },
                  { label: 'Medium (8)', value: 8 },
                  { label: 'Large (12)', value: 12 },
                  { label: 'XL (20)', value: 20 },
                ],
              },
            },
          },
        },
      },
    },
    defaultParams() {
      return { ...DEFAULTS };
    },
    handler(ctx: any, params: any) {
      ctx.model.setProps('btStyle', params.style ?? DEFAULTS.style);
      ctx.model.setProps('btActiveColor', params.activeColor ?? DEFAULTS.activeColor);
      ctx.model.setProps('btNormalColor', params.normalColor || undefined);
      ctx.model.setProps('btBold', params.bold ?? DEFAULTS.bold);
      ctx.model.setProps('btHoverColor', params.hoverColor || undefined);
      ctx.model.setProps('btContainerColor', params.containerColor || undefined);
      ctx.model.setProps('btBorderColor', params.borderColor || undefined);
      ctx.model.setProps('btBgColor', params.bgColor || undefined);
      ctx.model.setProps('btFontSize', params.fontSize || undefined);
      ctx.model.setProps('btTopSpacing', params.topSpacing || undefined);
      ctx.model.setProps('btTabPosition', params.tabPosition ?? DEFAULTS.tabPosition);
      ctx.model.setProps('btCentered', params.centered ?? DEFAULTS.centered);
    },
  };
}

/** Live preview of the Collapse/Sections look for its settings dialog (reads form values reactively). */
export const CollapsePreview: React.FC = observer(() => {
  const form: any = useForm();
  const v = (form && form.values) || {};
  const scope = 'nb-clp-preview';
  let css = '';
  if (v.headerBg) css += `.${scope} .ant-collapse-item > .ant-collapse-header{background:${v.headerBg}!important}`;
  if (v.normalColor)
    css += `\n.${scope} .ant-collapse-item > .ant-collapse-header,.${scope} .ant-collapse-item > .ant-collapse-header .ant-collapse-expand-icon{color:${v.normalColor}}`;
  if (v.activeColor)
    css += `\n.${scope} .ant-collapse-item-active > .ant-collapse-header{color:${v.activeColor}!important}\n.${scope} .ant-collapse-item-active > .ant-collapse-header .ant-collapse-expand-icon{color:${v.activeColor}!important}`;
  if (v.bold) {
    const activeW = v.bold === 'none' ? 400 : 600;
    const normalW = v.bold === 'all' ? 600 : 400;
    css += `\n.${scope} .ant-collapse-item > .ant-collapse-header{font-weight:${normalW}}\n.${scope} .ant-collapse-item-active > .ant-collapse-header{font-weight:${activeW}}`;
  }
  if (v.borderColor)
    css += `\n.${scope} .ant-collapse,.${scope} .ant-collapse > .ant-collapse-item,.${scope} .ant-collapse-content{border-color:${v.borderColor}!important}`;
  const body = (t: string) => <div style={{ color: 'var(--colorTextQuaternary, #bfbfbf)', fontSize: 12 }}>{t}</div>;
  const items = [
    { key: '1', label: 'Section 1', children: body('Nội dung mục') },
    { key: '2', label: 'Section 2', children: body('Nội dung mục') },
    { key: '3', label: 'Section 3', children: body('Nội dung mục') },
  ];
  return (
    <div
      className={scope}
      style={{
        border: '1px dashed var(--colorBorder, #e8e8e8)',
        borderRadius: 8,
        padding: 12,
        background: 'var(--colorBgLayout, #fafafa)',
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <Collapse
        key={`${v.defaultState || 'expand'}-${v.accordion ? 'a' : 'n'}`}
        items={items as any}
        defaultActiveKey={v.defaultState === 'collapse' ? [] : v.accordion ? ['1'] : ['1', '2', '3']}
        accordion={!!v.accordion}
        bordered={(v.frame || 'boxed') === 'boxed'}
        ghost={v.frame === 'ghost'}
        size={(v.size || 'middle') as any}
        expandIconPosition={(v.expandIconPosition || 'start') as any}
      />
    </div>
  );
});

/** The shared "Collapse style" settings step (accordion + look). `handler` writes clp* props that
 *  renderCollapseUI reads. Shared by the Collapse block and the in-form Sections variant. */
export function collapseStyleFlowStep() {
  return {
    title: tExpr('Collapse style', { ns: NS }),
    uiSchema: {
      preview: {
        type: 'void',
        title: tExpr('Preview', { ns: NS }),
        'x-decorator': 'FormItem',
        'x-component': CollapsePreview,
      },
      topRow: {
        type: 'void',
        'x-component': 'FormGrid',
        'x-component-props': { maxColumns: 2, minColumns: 1, columnGap: 16 },
        properties: {
          accordion: {
            type: 'boolean',
            title: tExpr('Accordion (open one at a time)', { ns: NS }),
            'x-decorator': 'FormItem',
            'x-component': 'Switch',
          },
          defaultState: {
            type: 'string',
            title: tExpr('Default state', { ns: NS }),
            'x-decorator': 'FormItem',
            'x-decorator-props': { tooltip: tExpr('Whether the sections start expanded or collapsed when the page first opens.', { ns: NS }) },
            'x-component': SegmentedGroup,
            'x-component-props': {
              ...SEG_PROPS,
              options: [
                { label: tExpr('Expand all', { ns: NS }), value: 'expand' },
                { label: tExpr('Collapse all', { ns: NS }), value: 'collapse' },
              ],
            },
          },
          bold: {
            type: 'string',
            title: tExpr('Bold', { ns: NS }),
            'x-decorator': 'FormItem',
            'x-decorator-props': { tooltip: tExpr('Which section headers are bold. Default = keep the theme default.', { ns: NS }) },
            'x-component': SegmentedGroup,
            'x-component-props': {
              ...SEG_PROPS,
              options: [
                { label: tExpr('None', { ns: NS }), value: 'none' },
                { label: tExpr('Active', { ns: NS }), value: 'active' },
                { label: tExpr('All', { ns: NS }), value: 'all' },
              ],
            },
          },
          frame: {
            type: 'string',
            title: tExpr('Frame', { ns: NS }),
            'x-decorator': 'FormItem',
            'x-decorator-props': { tooltip: tExpr('Boxed = outer border + dividers. Borderless = no border, but headers keep their fill. Ghost = fully transparent & seamless (overrides the border).', { ns: NS }) },
            'x-component': SegmentedGroup,
            'x-component-props': {
              ...SEG_PROPS,
              options: [
                { label: tExpr('Boxed', { ns: NS }), value: 'boxed' },
                { label: tExpr('Borderless', { ns: NS }), value: 'borderless' },
                { label: tExpr('Ghost', { ns: NS }), value: 'ghost' },
              ],
            },
          },
        },
      },
      options: {
        type: 'void',
        'x-component': CollapsibleSection,
        'x-component-props': { title: tExpr('Style', { ns: NS }), defaultOpen: true },
        properties: {
          szGrid: {
            type: 'void',
            'x-component': 'FormGrid',
            'x-component-props': { maxColumns: 2, minColumns: 1, columnGap: 12 },
            properties: {
              size: {
                type: 'string',
                title: tExpr('Size', { ns: NS }),
                'x-decorator': 'FormItem',
                'x-component': SegmentedGroup,
                'x-component-props': {
                  ...SEG_PROPS,
                  options: [
                    { label: tExpr('Small', { ns: NS }), value: 'small' },
                    { label: tExpr('Medium', { ns: NS }), value: 'middle' },
                    { label: tExpr('Large', { ns: NS }), value: 'large' },
                  ],
                },
              },
              expandIconPosition: {
                type: 'string',
                title: tExpr('Expand icon', { ns: NS }),
                'x-decorator': 'FormItem',
                'x-component': SegmentedGroup,
                'x-component-props': {
                  ...SEG_PROPS,
                  options: [
                    { label: tExpr('Start', { ns: NS }), value: 'start' },
                    { label: tExpr('End', { ns: NS }), value: 'end' },
                  ],
                },
              },
            },
          },
        },
      },
      colors: {
        type: 'void',
        'x-component': CollapsibleSection,
        'x-component-props': { title: tExpr('Colors', { ns: NS }), defaultOpen: true },
        properties: {
          grid: {
            type: 'void',
            'x-component': 'FormGrid',
            'x-component-props': { maxColumns: 4, minColumns: 2, columnGap: 8 },
            properties: {
              headerBg: {
                type: 'string',
                title: tExpr('Header', { ns: NS }),
                'x-decorator': 'FormItem',
                'x-decorator-props': { tooltip: tExpr('Section header background.', { ns: NS }) },
                'x-component': ColorField,
                'x-component-props': { showText: false },
              },
              activeColor: {
                type: 'string',
                title: tExpr('Active', { ns: NS }),
                'x-decorator': 'FormItem',
                'x-decorator-props': { tooltip: tExpr('Text + icon colour of the open section header.', { ns: NS }) },
                'x-component': ColorField,
                'x-component-props': { showText: false },
              },
              normalColor: {
                type: 'string',
                title: tExpr('Normal', { ns: NS }),
                'x-decorator': 'FormItem',
                'x-decorator-props': { tooltip: tExpr('Text + icon colour of CLOSED section headers. Set this when the header background is dark so the label stays readable.', { ns: NS }) },
                'x-component': ColorField,
                'x-component-props': { showText: false },
              },
              borderColor: {
                type: 'string',
                title: tExpr('Border', { ns: NS }),
                'x-decorator': 'FormItem',
                'x-component': ColorField,
                'x-component-props': { showText: false },
              },
            },
          },
        },
      },
    },
    defaultParams(ctx: any) {
      // Back-compat: derive the merged Frame from the old bordered/ghost props so existing blocks
      // show the right value when the dialog re-opens (old saves have no `frame` key).
      const p = ctx?.model?.props || {};
      const frame = p.clpGhost ? 'ghost' : p.clpBordered === false ? 'borderless' : 'boxed';
      return { accordion: false, defaultState: p.clpDefaultState || 'expand', frame, size: 'middle', expandIconPosition: 'start', bold: 'none' };
    },
    handler(ctx: any, params: any) {
      ctx.model.setProps('clpAccordion', !!params.accordion);
      ctx.model.setProps('clpDefaultState', params.defaultState || 'expand');
      // Frame → the antd bordered/ghost pair (render is unchanged; ghost subsumes the border).
      // Back-compat: old saves have no `frame` — fall back to their bordered/ghost booleans.
      const frame = params.frame || (params.ghost ? 'ghost' : params.bordered === false ? 'borderless' : 'boxed');
      ctx.model.setProps('clpBordered', frame === 'boxed');
      ctx.model.setProps('clpGhost', frame === 'ghost');
      ctx.model.setProps('clpSize', params.size || 'middle');
      ctx.model.setProps('clpIconPos', params.expandIconPosition || 'start');
      ctx.model.setProps('clpHeaderBg', params.headerBg || undefined);
      ctx.model.setProps('clpActiveColor', params.activeColor || undefined);
      ctx.model.setProps('clpNormalColor', params.normalColor || undefined);
      ctx.model.setProps('clpBold', params.bold || undefined);
      ctx.model.setProps('clpBorderColor', params.borderColor || undefined);
    },
  };
}

/** Register the shared tab-pane model + its "Edit tab" (name/icon) settings. Idempotent. */
export function registerTabPaneModel(fe: any, Icon: any): void {
  if (fe.getModelClass && fe.getModelClass('BlockTabPaneModel')) return;

  class BlockTabPaneModel extends FlowModel<{ subModels: { grid: any } }> {
    getTabTitle(): string {
      const raw = this.stepParams?.tabPaneSettings?.tab?.title;
      const translated = this.context.t(raw, { ns: 'lm-desktop-routes' });
      return translated || this.context.t('Tab', { ns: NS }) || 'Tab';
    }

    getTabIcon(): string | undefined {
      return this.stepParams?.tabPaneSettings?.tab?.icon;
    }

    render() {
      const iconType = this.props.icon ?? this.getTabIcon();
      const title = this.props.title ?? this.getTabTitle();
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {Icon && iconType ? <Icon type={iconType} /> : null}
          <span>{title}</span>
        </span>
      );
    }
  }

  BlockTabPaneModel.registerFlow({
    key: 'tabPaneSettings',
    title: tExpr('Tab', { ns: NS }),
    steps: {
      tab: {
        title: tExpr('Edit tab', { ns: NS }),
        preset: true,
        uiSchema: {
          title: {
            type: 'string',
            title: tExpr('Tab name', { ns: NS }),
            'x-decorator': 'FormItem',
            'x-component': 'Input',
            required: true,
          },
          icon: {
            title: tExpr('Icon', { ns: NS }),
            'x-decorator': 'FormItem',
            'x-component': 'IconPicker',
          },
        },
        defaultParams(ctx: any) {
          return { title: ctx.model.context.t('Tab', { ns: NS }) || 'Tab' };
        },
        handler(ctx: any, params: any) {
          ctx.model.setProps('title', ctx.t(params.title, { ns: 'lm-desktop-routes' }));
          ctx.model.setProps('icon', params.icon);
        },
      },
    },
  });

  fe.registerModels({ BlockTabPaneModel });
}

/**
 * Make the built-in PAGE tabs (the ones enabled via "Enable tabs" on a page) able to use the
 * same styles — per page, opt-in. Registers a "Tab style" step on the core PageModel and
 * monkeypatches its `renderTabs()` to wrap the antd <Tabs> with scoped CSS. A page that keeps the
 * 'default' style is rendered untouched, so other pages are never affected.
 */
// ---------------------------------------------------------------------------
// APP-WIDE default tab style, stored SERVER-SIDE (collection `ptdlTabStyleSettings`) and keyed BY
// THEME (row settingKey = 'light' | 'dark') so a light and a dark theme each keep their own default.
// Admin sets it once → every user sees it (for the matching theme). Loaded into an in-memory map at
// load time (read synchronously by the render patch) with a localStorage mirror as an instant/offline
// fallback. A page's own "Tab style" (applyGlobal OFF + a real style) still wins.
// ---------------------------------------------------------------------------
const LS_GLOBAL = 'ptdl-tabstyle-global-map'; // { [themeKey]: config } — local mirror of the server rows
const GLOBAL_RESOURCE = 'ptdlTabStyleSettings';
let _globalMap: Record<string, any> = {};
let _globalApi: any = null;
let _currentThemeId: any = null; // the user's current theme id (stable key, survives colour edits)

/** true if a colour reads as "light" (used to tell a light theme from a dark one). */
function isLightColor(color: string): boolean {
  try {
    let r = 255;
    let g = 255;
    let b = 255;
    const s = String(color).trim();
    if (s.charAt(0) === '#') {
      let hex = s.slice(1);
      if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
      r = parseInt(hex.slice(0, 2), 16);
      g = parseInt(hex.slice(2, 4), 16);
      b = parseInt(hex.slice(4, 6), 16);
    } else {
      const m = s.match(/rgba?\(([^)]+)\)/i);
      if (m) {
        const p = m[1].split(',').map((x) => parseFloat(x));
        r = p[0];
        g = p[1];
        b = p[2];
      }
    }
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5;
  } catch (e) {
    return true;
  }
}

/**
 * Key identifying the CURRENT theme so each theme keeps its own default. Prefer the user's theme id
 * (`currentUser.systemSettings.themeId`, fetched at load) → `t<id>`, which is STABLE: editing the
 * theme's colours (primary/secondary) never changes it, so the saved default never gets orphaned.
 * Falls back to a token signature `<light|dark>-<colorPrimary>` only when no theme id is available
 * (e.g. the built-in default theme, or auth:check failed).
 */
export function currentThemeKey(themeToken?: any): string {
  if (_currentThemeId != null && _currentThemeId !== '') return 't' + _currentThemeId;
  const bg = themeToken?.colorBgContainer || themeToken?.colorBgBase || themeToken?.colorBgLayout;
  const mode = bg && !isLightColor(bg) ? 'dark' : 'light';
  const primary = themeToken?.colorPrimary
    ? String(themeToken.colorPrimary).toLowerCase().replace(/[^0-9a-z]/g, '')
    : 'def';
  return `${mode}-${primary}`;
}

function readMapLS(): Record<string, any> {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(LS_GLOBAL) : null;
    const m = raw ? JSON.parse(raw) : {};
    return m && typeof m === 'object' ? m : {};
  } catch (e) {
    return {};
  }
}

function writeMapLS(m: Record<string, any>): void {
  try {
    localStorage.setItem(LS_GLOBAL, JSON.stringify(m || {}));
  } catch (e) {
    // ignore
  }
}

/** Read the app-wide default for the CURRENT theme (sync). Map filled from the server at load. */
export function loadGlobalTabStyle(themeToken?: any): any {
  return _globalMap[currentThemeKey(themeToken)] || null;
}

/** Fetch every theme's server-stored default into the in-memory map. Await in the plugin's load()
 *  so page/popup tabs get the shared default on first paint. Falls back to the local mirror. */
export async function loadGlobalTabStyleCache(apiClient: any): Promise<void> {
  _globalApi = apiClient;
  _globalMap = readMapLS(); // instant fallback while the request is in flight
  if (!apiClient) return;
  // The user's current theme id → the stable key for this theme.
  try {
    const me = await apiClient.request({ url: 'auth:check' });
    const ss = me?.data?.data?.systemSettings;
    const parsed = typeof ss === 'string' ? JSON.parse(ss) : ss;
    _currentThemeId = parsed?.themeId ?? null;
  } catch (e) {
    // keep null → currentThemeKey falls back to the token signature
  }
  try {
    const res = await apiClient.resource(GLOBAL_RESOURCE).list({ pageSize: 100 });
    const rows = res?.data?.data || [];
    const m: Record<string, any> = {};
    for (const row of rows) {
      if (row?.settingKey) m[row.settingKey] = row.config;
    }
    _globalMap = m;
    writeMapLS(m);
  } catch (e) {
    // keep the local mirror on any error (collection not ready / offline)
  }
}

/** Save the default for the CURRENT theme: server (shared across all users) + mirror + cache. */
export function saveGlobalTabStyle(cfg: any, themeToken?: any): void {
  const key = currentThemeKey(themeToken);
  _globalMap[key] = cfg;
  writeMapLS(_globalMap);
  try {
    window.dispatchEvent(new CustomEvent('ptdl-tabstyle-global'));
  } catch (e) {
    // ignore
  }
  if (_globalApi) {
    try {
      _globalApi
        .resource(GLOBAL_RESOURCE)
        .updateOrCreate({ filterKeys: ['settingKey'], values: { settingKey: key, config: cfg } })
        .catch(() => {});
    } catch (e) {
      // ignore
    }
  }
}

/** Resolve the base PageModel class: engine registry first, else walk up the prototype chain of
 *  the class the lane imported (e.g. classic exports ChildPageModel, whose parent IS PageModel). */
function resolvePageModelClass(fe: any, hint: any): any {
  try {
    const c = fe && fe.getModelClass && fe.getModelClass('PageModel');
    if (c && typeof c.registerFlow === 'function') return c;
  } catch (e) {
    // ignore
  }
  let c = hint;
  while (c) {
    if (c.name === 'PageModel' && typeof c.registerFlow === 'function') return c;
    c = Object.getPrototypeOf(c);
  }
  return hint && typeof hint.registerFlow === 'function' ? hint : null;
}

function patchPageTabStyle(fe: any, pageHint?: any): void {
  if (!fe) return;

  const applyPatch = (PageModel: any): boolean => {
    if (!PageModel || !PageModel.prototype) return false;
    const proto = PageModel.prototype;
    if (proto.__ptdlTabStylePatched) return true;

    try {
      PageModel.registerFlow({
        key: 'ptdlPageTabStyle',
        title: tExpr('Tab style', { ns: NS }),
        sort: 500,
        steps: {
          tabStyle: {
            title: tExpr('Tab style', { ns: NS }),
            uiSchema: {
              preview: { ...previewField },
              style: {
                type: 'string',
                title: tExpr('Style', { ns: NS }),
                'x-decorator': 'FormItem',
                'x-decorator-props': { tooltip: tExpr('Inherit = keep NocoBase default / follow the global setting. Line = same underline look but recoloured to your colors.', { ns: NS }) },
                'x-component': 'Select',
                enum: [
                  { label: 'Inherit (global / default)', value: 'default' },
                  { label: 'Line', value: 'line' },
                  { label: 'Button group (pill)', value: 'button' },
                  { label: 'Segment (bordered)', value: 'segment' },
                  { label: 'Card (folder)', value: 'card' },
                  { label: 'Step', value: 'step' },
                  { label: 'Text (color only)', value: 'text' },
                ],
              },
              colors: {
                type: 'void',
                'x-component': 'FormGrid',
                'x-component-props': { maxColumns: 3, minColumns: 2, columnGap: 10 },
                properties: {
                  activeColor: {
                    type: 'string',
                    title: tExpr('Active', { ns: NS }),
                    'x-decorator': 'FormItem',
                    'x-component': ColorField,
                    'x-component-props': { showText: false },
                  },
                  normalColor: {
                    type: 'string',
                    title: tExpr('Normal', { ns: NS }),
                    'x-decorator': 'FormItem',
                    'x-decorator-props': { tooltip: tExpr('Inactive tab text colour. Empty = theme default.', { ns: NS }) },
                    'x-component': ColorField,
                    'x-component-props': { showText: false },
                  },
                  hoverColor: {
                    type: 'string',
                    title: tExpr('Hover', { ns: NS }),
                    'x-decorator': 'FormItem',
                    'x-decorator-props': { tooltip: tExpr('Leave empty to use the active color.', { ns: NS }) },
                    'x-component': ColorField,
                    'x-component-props': { showText: false },
                  },
                  borderColor: {
                    type: 'string',
                    title: tExpr('Border', { ns: NS }),
                    'x-decorator': 'FormItem',
                    'x-decorator-props': { tooltip: tExpr('Outline around the tab strip. Empty = no border.', { ns: NS }) },
                    'x-component': ColorField,
                    'x-component-props': { showText: false },
                  },
                  bgColor: {
                    type: 'string',
                    title: tExpr('Background', { ns: NS }),
                    'x-decorator': 'FormItem',
                    'x-decorator-props': { tooltip: tExpr('Background of the ACTIVE tab (the Card fill). Empty = matches the current page background.', { ns: NS }) },
                    'x-component': ColorField,
                    'x-component-props': { showText: false },
                  },
                  containerColor: {
                    type: 'string',
                    title: tExpr('Tray', { ns: NS }),
                    'x-decorator': 'FormItem',
                    'x-decorator-props': { tooltip: tExpr('Background of the button tray / step badges.', { ns: NS }) },
                    'x-component': ColorField,
                    'x-component-props': { showText: false },
                    'x-reactions': visibleWhen('style', ['button', 'step']),
                  },
                },
              },
              options: {
                type: 'void',
                'x-component': 'FormGrid',
                'x-component-props': { maxColumns: 2, minColumns: 1, columnGap: 12 },
                properties: {
                  centered: {
                    type: 'boolean',
                    title: tExpr('Centered', { ns: NS }),
                    'x-decorator': 'FormItem',
                    'x-component': 'Switch',
                  },
                  hideSingleTab: {
                    type: 'boolean',
                    title: tExpr('Hide tab bar when only one tab', { ns: NS }),
                    'x-decorator': 'FormItem',
                    'x-component': 'Switch',
                  },
                  fontSize: {
                    type: 'number',
                    title: tExpr('Text size', { ns: NS }),
                    'x-decorator': 'FormItem',
                    'x-decorator-props': { tooltip: tExpr('Bigger tab label — pair Text style + a heading size to use tabs as a title.', { ns: NS }) },
                    'x-component': 'Select',
                    enum: [
                      { label: 'Default', value: 0 },
                      { label: 'Large (16)', value: 16 },
                      { label: 'Larger (18)', value: 18 },
                      { label: 'Heading (22)', value: 22 },
                      { label: 'Big (28)', value: 28 },
                    ],
                  },
                  bold: {
                    type: 'string',
                    title: tExpr('Bold', { ns: NS }),
                    'x-decorator': 'FormItem',
                    'x-decorator-props': { tooltip: tExpr('Which tab labels are bold.', { ns: NS }) },
                    'x-component': 'Select',
                    enum: [
                      { label: 'None', value: 'none' },
                      { label: 'Active only', value: 'active' },
                      { label: 'All', value: 'all' },
                    ],
                  },
                  topSpacing: {
                    type: 'number',
                    title: tExpr('Spacing', { ns: NS }),
                    'x-decorator': 'FormItem',
                    'x-decorator-props': { tooltip: tExpr('Space above AND below the tab bar (breathing room between the tabs and the content).', { ns: NS }) },
                    'x-component': 'Select',
                    enum: [
                      { label: 'None', value: 0 },
                      { label: 'Small (4)', value: 4 },
                      { label: 'Medium (8)', value: 8 },
                      { label: 'Large (12)', value: 12 },
                      { label: 'XL (20)', value: 20 },
                    ],
                  },
                },
              },
              applyGlobal: {
                type: 'boolean',
                title: tExpr('Apply to all default tabs (page / popup / view)', { ns: NS }),
                description: tExpr('There is ONE global default for this browser. Saving with this ON overwrites it (a later save on another page wins). Every page/popup with this ON follows the global; pages you style with this OFF keep their own look.', { ns: NS }),
                'x-decorator': 'FormItem',
                'x-component': 'Switch',
              },
            },
            defaultParams(ctx: any) {
              // Seed the dialog from the current theme's global default so it's easy to see/adjust.
              const g = loadGlobalTabStyle(ctx?.themeToken) || {};
              return {
                style: 'default',
                activeColor: g.activeColor || '#1677ff',
                normalColor: g.normalColor || '',
                bold: g.bold || 'active',
                hoverColor: g.hoverColor || '',
                containerColor: g.containerColor || '',
                borderColor: g.borderColor || '',
                bgColor: g.bgColor || '',
                fontSize: g.fontSize || 0,
                topSpacing: g.topSpacing || 0,
                centered: !!g.centered,
                hideSingleTab: !!g.hideSingleTab,
                applyGlobal: false,
              };
            },
            beforeParamsSave(_ctx: any, values: any) {
              // When "apply to all" is on, persist as the app-wide default FOR THE CURRENT THEME.
              if (values && values.applyGlobal) {
                saveGlobalTabStyle(
                  {
                    style: values.style,
                    activeColor: values.activeColor,
                    normalColor: values.normalColor,
                    bold: values.bold,
                    hoverColor: values.hoverColor,
                    containerColor: values.containerColor,
                    borderColor: values.borderColor,
                    bgColor: values.bgColor,
                    fontSize: values.fontSize,
                    topSpacing: values.topSpacing,
                    centered: values.centered,
                    hideSingleTab: values.hideSingleTab,
                  },
                  _ctx?.themeToken,
                );
              }
            },
            handler() {
              /* no-op: renderTabs reads these stepParams (and the global default) directly */
            },
          },
        },
      });
    } catch (e) {
      // already registered on a shared prototype — ignore
    }

    const origRenderTabs = proto.renderTabs;
    if (typeof origRenderTabs === 'function') {
      proto.renderTabs = function (this: any, ...args: any[]) {
        const node = origRenderTabs.apply(this, args);
        try {
          const p = (this.getStepParams && this.getStepParams('ptdlPageTabStyle', 'tabStyle')) || {};
          const g = loadGlobalTabStyle(this.context?.themeToken);
          const globalStyle = g && g.style && g.style !== 'default' ? g : null;
          // STYLE: per-page exception (apply-global OFF + real style) else follow the browser global.
          const pageHasOwnStyle = !p.applyGlobal && p.style && p.style !== 'default';
          const styleCfg = pageHasOwnStyle ? p : globalStyle; // may be null → no style, hide can still apply
          // HIDE, decoupled from style: page's own if configured with global OFF, else the global one.
          const pageConfigured = 'applyGlobal' in p || 'hideSingleTab' in p || 'style' in p;
          const hideSingle = pageConfigured && !p.applyGlobal ? !!p.hideSingleTab : !!(g && g.hideSingleTab);
          const scope = `.nb-ptab-${this.uid}`;
          let css = '';
          if (styleCfg) {
            css += buildTabCss(scope, styleCfg.style as TabStyleKind, {
              activeColor: styleCfg.activeColor,
              normalColor: styleCfg.normalColor,
              bold: styleCfg.bold,
              hoverColor: styleCfg.hoverColor,
              containerColor: styleCfg.containerColor,
              borderColor: styleCfg.borderColor,
              bgColor: styleCfg.bgColor,
              fontSize: styleCfg.fontSize,
              topSpacing: styleCfg.topSpacing,
            });
            if (styleCfg.centered) css += `\n${scope} .ant-tabs-nav-wrap{justify-content:center}`;
          }
          if (hideSingle) {
            const cnt = ((this.subModels && this.subModels.tabs) || []).filter((t: any) => !t.hidden).length;
            // Hide only in runtime. While editing, keep the bar fully visible so tabs stay
            // manageable — collapsing/animating it here caused a hover flicker loop.
            if (cnt <= 1 && !this.context?.flowSettingsEnabled) {
              css += `\n${scope} .ant-tabs-nav{display:none!important}`;
            }
          }
          if (!css) return node;
          return React.createElement(
            'div',
            { className: `nb-ptab-${this.uid}` },
            React.createElement('style', { dangerouslySetInnerHTML: { __html: css } }),
            node,
          );
        } catch (e) {
          return node;
        }
      };
    }

    proto.__ptdlTabStylePatched = true;
    return true;
  };

  if (applyPatch(resolvePageModelClass(fe, pageHint))) return;
  let n = 0;
  const retry = () => {
    if (applyPatch(resolvePageModelClass(fe, pageHint))) return;
    if (n++ < 12) setTimeout(retry, 300);
  };
  setTimeout(retry, 200);
}

/** Register the Tabs block into the given FlowEngine instance. Safe no-op if unavailable. */
export async function registerBlockTabs(fe: any, deps: { Icon?: any; PageModel?: any } = {}): Promise<void> {
  if (!fe) {
    // eslint-disable-next-line no-console
    console.warn('[block-tabs] no flowEngine on this lane — block not registered.');
    return;
  }
  // Idempotent: never register twice on the same engine.
  if (fe.getModelClass && fe.getModelClass('BlockTabsModel')) return;

  let BlockModel: any;
  try {
    BlockModel = fe.getModelClassAsync
      ? await fe.getModelClassAsync('BlockModel')
      : fe.getModelClass && fe.getModelClass('BlockModel');
  } catch (e) {
    BlockModel = fe.getModelClass && fe.getModelClass('BlockModel');
  }
  if (!BlockModel) {
    // eslint-disable-next-line no-console
    console.warn('[block-tabs] core BlockModel not found — block not registered.');
    return;
  }

  // Shared tab-pane model (used by both the block and form containers).
  registerTabPaneModel(fe, deps.Icon);

  // The container block.
  class BlockTabsModel extends BlockModel {
    render() {
      return renderTabsUI(this, 'BlockGridModel');
    }
  }

  BlockTabsModel.define({
    label: tExpr('Tabs', { ns: NS }),
    icon: 'AppstoreOutlined',
    createModelOptions: { use: 'BlockTabsModel' },
    sort: 710,
  });

  BlockTabsModel.registerFlow({
    key: 'blockTabsSettings',
    title: tExpr('Tabs', { ns: NS }),
    sort: 300,
    steps: {
      tabStyle: tabStyleFlowStep(),
    },
  });

  // Sibling container: same panes, rendered as collapsible sections instead of tabs.
  class BlockCollapseModel extends BlockModel {
    render() {
      return renderCollapseUI(this, 'BlockGridModel');
    }
  }
  BlockCollapseModel.define({
    label: tExpr('Collapse (Sections)', { ns: NS }),
    icon: 'ProfileOutlined',
    createModelOptions: { use: 'BlockCollapseModel' },
    sort: 711,
  });

  BlockCollapseModel.registerFlow({
    key: 'blockCollapseSettings',
    title: tExpr('Collapse', { ns: NS }),
    sort: 300,
    steps: {
      collapseStyle: collapseStyleFlowStep(),
    },
  });

  fe.registerModels({ BlockTabsModel, BlockCollapseModel });

  // Let the built-in page tabs opt into these same styles (per-page, from the page's gear).
  patchPageTabStyle(fe, deps.PageModel);
}
