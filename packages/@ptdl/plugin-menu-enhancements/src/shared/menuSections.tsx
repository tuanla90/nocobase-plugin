import React from 'react';
import { ColorField, registerSettingsKit, rx, fi, livePreview, previewField, SEG_PROPS, SegmentedGroup } from '@ptdl/shared';

/**
 * @ptdl/plugin-menu-sections — turn any left-sidebar menu item into a NON-CLICKABLE
 * "group title" (section label like "ANA MENÜ") or a "divider" line.
 *
 * NocoBase has no native menu-item type for either (the built-in `group` type is a collapsible
 * SubMenu, not a static label). The desktop menu is built from the `desktopRoutes` collection and
 * rendered via @ant-design/pro-layout's `ProLayout`. Each menu node is an `AdminLayoutMenuItemModel`
 * (a FlowModel). We hook it three ways — all monkeypatches on that ONE class, resolved by name at
 * runtime via `flowEngine.getModelClass('AdminLayoutMenuItemModel')`:
 *
 *  1. A settings flow `ptdlMenuSections` adds a "Display as" step to every menu item's settings
 *     menu: Normal / Group title / Divider. The chosen kind is stored on the route's existing
 *     `options` JSON column (`options.ptdlMenuKind`) via `model.updateMenuRoute` — NO schema change,
 *     and it persists across reloads.
 *
 *  2. `render()` is patched: when a route carries the marker, it renders our own inert node
 *     (a line, or an uppercase muted label) instead of the normal menu link. The FlowModelRenderer
 *     that wraps the model still overlays the settings gear on hover, so the item stays editable
 *     (you can switch it back to Normal or delete it).
 *
 *  3. `toProLayoutRoute()` is patched so a converted item is emitted as an inert leaf (no redirect,
 *     no child submenu) — it always gets its own slot in the sidebar and never navigates.
 *
 * A tiny stylesheet (injected once) neutralises the surrounding `li.ant-menu-item` (hover
 * background / fixed height / pointer cursor) using `:has()` — supported by all modern browsers
 * that run the NocoBase admin.
 *
 * Client-only. Imports nothing from @nocobase/client(-v2); the model class and flowEngine are
 * injected per-lane so the bundle stays clean.
 */

const KIND_KEY = 'ptdlMenuKind'; // property name inside route.options
const STYLE_KEY = 'ptdlMenuStyle'; // route.options.ptdlMenuStyle — per-item appearance for the section
const STYLE_ID = 'ptdl-menu-sections-style';
const RENDER_FLAG = '__ptdlMenuSectionsRenderPatched';
const ROUTE_FLAG = '__ptdlMenuSectionsRoutePatched';

type Kind = 'divider' | 'groupLabel';

// Per-item styling stored on route.options.ptdlMenuStyle. Fields used depend on kind:
//   groupLabel → color, size, bold ; divider → text, color, thickness, lineOn, pos, align, size.
type SectionStyle = {
  color?: string;
  size?: number;
  bold?: boolean;
  text?: string;
  thickness?: number;
  lineOn?: boolean; // divider: false = hide the rule (title only). default true.
  pos?: 'above' | 'on' | 'below'; // divider: caption position relative to the rule. default 'on'.
  align?: 'left' | 'center' | 'right'; // divider: caption alignment. default 'center'.
};

function readStyle(route: any): SectionStyle {
  const s = route?.options?.[STYLE_KEY];
  return s && typeof s === 'object' ? s : {};
}

// ---- i18n (namespace shared with the badge feature) ---------------------------------------------
const I18N_NS = '@ptdl/plugin-menu-enhancements/client';
let _i18n: any = null;
export function setSectionsI18n(i18n: any) {
  if (i18n) _i18n = i18n;
}
function T(s: string): string {
  try {
    return _i18n ? _i18n.t(s, { ns: I18N_NS }) : s;
  } catch (e) {
    return s;
  }
}

// A converted item (group title / divider) must not navigate. Its content sits INSIDE NocoBase's
// menu <Link>, so a bubble-phase onClick that prevents default + stops propagation kills both the
// React-Router navigation and the native <a href> before they reach the link wrapper.
const stopNav = (e: React.MouseEvent) => {
  e.preventDefault();
  e.stopPropagation();
};

function injectStyleOnce() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = `
/* Any menu item that hosts a section marker: kill hover/selected background + click affordance. */
li.ant-menu-item:has([data-ptdl-menu-kind]) {
  cursor: default !important;
  background: transparent !important;
}
li.ant-menu-item:has([data-ptdl-menu-kind]):hover,
li.ant-menu-item:has([data-ptdl-menu-kind]):active,
li.ant-menu-item-selected:has([data-ptdl-menu-kind]) {
  background: transparent !important;
  color: inherit !important;
}
/* Divider host: collapse the normal menu-item height to a thin line row. */
li.ant-menu-item:has([data-ptdl-menu-kind="divider"]) {
  height: auto !important;
  min-height: 0 !important;
  line-height: normal !important;
  margin-block: 6px !important;
  padding-block: 0 !important;
}
/* Group-title host: let the label size itself, drop the tall menu-item row height. */
li.ant-menu-item:has([data-ptdl-menu-kind="groupLabel"]) {
  height: auto !important;
  min-height: 0 !important;
  line-height: normal !important;
  margin-block: 2px !important;
}
`;
  document.head.appendChild(el);
}

function DividerNode({ style, fallbackText }: { style?: SectionStyle; fallbackText?: any }) {
  // Section labels/dividers render INSIDE NocoBase's menu-item slot, whose text colour the ACTIVE theme
  // already sets correctly (white on a dark sider, dark on a light one) — even for custom themes. Do NOT
  // resolve an absolute colour here: theme.useToken() returns the WRONG algorithm in this subtree (the
  // menu runs antd's `light` algorithm even when the sider is painted dark, so colorTextTertiary comes
  // back near-black ≈ rgba(0,0,0,0.45) and is invisible on a dark sider — the "màu title chưa ăn" bug).
  // Instead INHERIT the slot's themed colour and DIM the whole node (opacity) for the muted section look
  // — theme-proof by construction. An explicit style.color (user chose one) wins at full strength.
  // onClick guard (not pointer-events:none) so the click is swallowed here instead of bubbling to
  // the surrounding menu <Link> and navigating.
  const lineColor = style?.color || 'currentColor';
  const textColor = style?.color || 'inherit';
  const dim = style?.color ? undefined : 0.62;
  const thickness = Math.max(1, Number(style?.thickness) || 1);
  const explicit = typeof style?.text === 'string' ? style.text.trim() : '';
  const lineOn = style?.lineOn !== false; // default: show the rule
  // Group-title behaviour without a separate kind: when the line is OFF and no text is typed, fall
  // back to the item's own name — so a heading tracks the menu label like the old "Group title" did.
  const fb = !explicit && !lineOn && typeof fallbackText === 'string' ? fallbackText.trim() : '';
  const label = explicit || fb;
  const pos: 'above' | 'on' | 'below' = style?.pos === 'above' || style?.pos === 'below' ? style.pos : 'on';
  const align: 'left' | 'center' | 'right' = style?.align === 'left' || style?.align === 'right' ? style.align : 'center';
  const size = Number(style?.size) > 0 ? Number(style?.size) : 11;
  const justify = align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center';
  // "On the line" caption = the classic small-caps rule caption; anything else reads as a normal title.
  const onLine = lineOn && pos === 'on';

  // A full-width rule that stands alone (no caption, or above/below a stacked caption).
  const soloRule = <span style={{ display: 'block', borderTop: `${thickness}px solid ${lineColor}`, width: '100%' }} />;
  // A flexible rule segment for the "on the line" mode (fills the space beside the caption).
  const segRule = () => <span style={{ flex: 'auto', borderTop: `${thickness}px solid ${lineColor}` }} />;
  // The caption. Uppercase only in the classic "on the line" mode; above/below/no-line reads as a title.
  const caption = label ? (
    <span
      style={{
        flex: 'none',
        maxWidth: '100%',
        fontSize: size,
        color: textColor,
        fontWeight: onLine ? 400 : 600,
        textTransform: onLine ? 'uppercase' : 'none',
        letterSpacing: onLine ? 0.4 : 0.2,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      {label}
    </span>
  ) : null;

  let body: React.ReactNode;
  if (!caption) {
    // No text → just the rule (or nothing, if the line is hidden).
    body = lineOn ? soloRule : null;
  } else if (!lineOn) {
    // Title only — no rule.
    body = <span style={{ display: 'flex', justifyContent: justify, width: '100%' }}>{caption}</span>;
  } else if (pos === 'on') {
    // Caption on the line: center = rule both sides; left = caption then rule; right = rule then caption.
    body = (
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
        {align !== 'left' ? segRule() : null}
        {caption}
        {align !== 'right' ? segRule() : null}
      </span>
    );
  } else {
    // Stacked: title above or below the rule.
    const captionRow = <span style={{ display: 'flex', justifyContent: justify, width: '100%' }}>{caption}</span>;
    body = (
      <span style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }}>
        {pos === 'above' ? (
          <>
            {captionRow}
            {soloRule}
          </>
        ) : (
          <>
            {soloRule}
            {captionRow}
          </>
        )}
      </span>
    );
  }

  return (
    <span
      data-ptdl-menu-kind="divider"
      role="separator"
      aria-orientation="horizontal"
      aria-label={label || undefined}
      onClick={stopNav}
      style={{ display: 'block', width: '100%', cursor: 'default', opacity: dim }}
    >
      {body}
    </span>
  );
}

function GroupLabelNode({ text, style }: { text: any; style?: SectionStyle }) {
  // Inherit the menu slot's themed colour + dim (see DividerNode) — theme-proof, no absolute token.
  const size = Number(style?.size) > 0 ? Number(style?.size) : 11;
  const dim = style?.color ? undefined : 0.62;
  return (
    <span
      data-ptdl-menu-kind="groupLabel"
      role="heading"
      aria-level={3}
      onClick={stopNav}
      title={typeof text === 'string' ? text : undefined}
      style={{
        cursor: 'default',
        display: 'block',
        textTransform: 'uppercase',
        fontSize: size,
        fontWeight: style?.bold === false ? 500 : 600,
        letterSpacing: 0.6,
        color: style?.color || 'inherit',
        opacity: dim,
        padding: '8px 0 2px',
        lineHeight: 1.4,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      {text}
    </span>
  );
}

function readKind(route: any): Kind | undefined {
  const k = route?.options?.[KIND_KEY];
  return k === 'divider' || k === 'groupLabel' ? k : undefined;
}

// Resolve the route's title to a display string (route titles may be i18n keys/variables).
function titleText(model: any): any {
  const raw = model?.getRoute?.()?.title;
  if (typeof raw !== 'string') return raw;
  const t = model?.context?.t;
  try {
    return typeof t === 'function' ? t(raw, { ns: 'lm-desktop-routes' }) : raw;
  } catch (e) {
    return raw;
  }
}

function patchRender(proto: any) {
  if (proto[RENDER_FLAG] || typeof proto.render !== 'function') return;
  const origRender = proto.render;
  proto.render = function (this: any) {
    try {
      const route = this.getRoute?.();
      const kind = readKind(route);
      const style = readStyle(route);
      if (kind === 'divider') return <DividerNode style={style} fallbackText={titleText(this)} />;
      // Backward compat: items still saved as the old 'groupLabel' kind keep rendering as before.
      if (kind === 'groupLabel') return <GroupLabelNode text={titleText(this)} style={style} />;
    } catch (e) {
      /* never break the menu render */
    }
    return origRender.apply(this, arguments);
  };
  proto[RENDER_FLAG] = true;
}

function patchToProLayoutRoute(proto: any) {
  if (proto[ROUTE_FLAG] || typeof proto.toProLayoutRoute !== 'function') return;
  const orig = proto.toProLayoutRoute;
  proto.toProLayoutRoute = function (this: any, options: any) {
    const route = this.props?.route;
    const kind = readKind(route);
    let node = orig.apply(this, arguments);
    if (kind) {
      if (!node) {
        // Some route types (e.g. a page with no runtime) return null — still show the section.
        node = {
          name: route?.title,
          path: `/admin/ptdl-section-${this.uid}`,
          hideInMenu: route?.hideInMenu,
          _route: route,
          _parentRoute: this.props?.parentRoute,
          _depth: options?.depth || 0,
          _model: this,
        };
      } else {
        // Inert leaf: no navigation, no child submenu — just a slot we fully control in render().
        // NocoBase computes the menu link target as `_runtimePath || redirect || path`, so stripping
        // redirect/routes alone still leaves `path` (and `_runtimePath`) navigable. Remove the runtime
        // target too and repoint `path` at an inert, unique in-app slug — kept unique so ProLayout
        // still has a stable menu key. (The onClick guard in the render nodes is the primary stop;
        // this is defence-in-depth so a slipped click can't reach the item's real page.)
        delete node.redirect;
        delete node.routes;
        delete node._runtimePath;
        delete node._navigationMode;
        node.path = `/admin/ptdl-section-${this.uid}`;
        node.disabled = false;
      }
      node._ptdlKind = kind;
    }
    return node;
  };
  proto[ROUTE_FLAG] = true;
}

// NocoBase's desktopRoutes:update runs a tree-repository transaction wrapped by several workflow
// middlewares. On SQLite (esp. Windows) that can transiently throw `SQLITE_BUSY: database is locked`
// → HTTP 500, even though the same call succeeds moments later. Retry a few times with a short
// backoff so a transient lock recovers silently instead of surfacing the FlowEngine error page.
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
      const retryable = status === 500 || /busy|locked|timeout/i.test(msg);
      if (!retryable || i === attempts - 1) break;
      // 120ms, 240ms, 360ms — short enough to feel instant, long enough to clear a lock.
      await new Promise((r) => setTimeout(r, 120 * (i + 1)));
    }
  }
  throw lastErr;
}

// Color picker for the section settings dialog (shared ColorField — presets built in). Registered on
// flowEngine.flowSettings so the schema can reference it as `x-component: 'PtdlSectionColor'`. The
// minHeight span keeps the small picker aligned with the sibling number input in its grid row.
function PtdlSectionColor(props: any) {
  const { value, onChange } = props;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', minHeight: 32 }}>
      <ColorField value={value} onChange={onChange} />
    </span>
  );
}

// A faux sidebar menu row — drawn above AND below the section preview so the result is easy to
// picture in context (a real menu item, the section, another menu item).
function PreviewMenuItem() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', fontSize: 13, color: 'var(--colorText, rgba(0,0,0,0.88))' }}>
      <span style={{ width: 15, height: 15, borderRadius: 4, background: 'var(--colorFillSecondary, rgba(0,0,0,0.06))', flex: 'none' }} />
      <span>{T('Menu item')}</span>
    </div>
  );
}

// Live preview of the section exactly as it renders in the sidebar. `livePreview` wraps this in an
// observer that reads the dialog's `form.values`, so it re-renders on every edit (text / position /
// align / size / colour / line toggle). Registered as `PtdlSectionPreview`, pinned at the top of the
// dialog and shown only once "Convert to section" is on.
const SectionPreview = livePreview((v: any) => {
  if (v?.dvOn !== true) return null; // hidden anyway via reaction; guard for safety
  const style: SectionStyle = {
    text: String(v?.dvText || '').trim() || undefined,
    color: v?.dvColor || undefined,
    thickness: Number(v?.dvThickness) || undefined,
    lineOn: v?.dvLineOn !== false,
    pos: v?.dvPos,
    align: v?.dvAlign,
    size: Number(v?.dvSize) || undefined,
  };
  return (
    <div
      style={{
        padding: 8,
        background: 'var(--colorFillQuaternary, #fafafa)',
        border: '1px solid var(--colorBorderSecondary, #f0f0f0)',
        borderRadius: 8,
      }}
    >
      <PreviewMenuItem />
      {/* __title is seeded into form.values by defaultParams so a line-off heading shows the item name. */}
      <div style={{ padding: '2px 8px' }}>
        <DividerNode style={style} fallbackText={v?.__title} />
      </div>
      <PreviewMenuItem />
    </div>
  );
});

function registerSectionComponents(flowSettings: any) {
  // registerSettingsKit also registers the shared layout primitives (SettingsGrid + CollapsibleSection).
  // PtdlSegmented = antd Segmented (block, bordered via SEG_PROPS) for the position / align pickers.
  registerSettingsKit(flowSettings, { PtdlSectionColor, PtdlSectionPreview: SectionPreview, PtdlSegmented: SegmentedGroup });
}

// Field-visibility predicates for the single "section" model (function-form reactions — the string
// {{$deps}} form throws under v2 compileUiSchema).
const secOn = (v: any) => v?.dvOn === true; // "Convert to section" is on
const secText = (v: any) => !!String(v?.dvText || '').trim(); // an explicit caption was typed
const secLineOn = (v: any) => v?.dvLineOn !== false; // the rule is shown
// A caption is present when text is typed, OR the line is off (then it falls back to the item name).
const secCaption = (v: any) => secText(v) || !secLineOn(v);

function registerSettingsFlow(Model: any) {
  try {
    Model.registerFlow({
      key: 'ptdlMenuSections',
      sort: 210,
      title: T('Appearance'),
      steps: {
        kind: {
          title: T('Display as'),
          uiMode: { type: 'dialog', props: { width: 560 } },
          defaultParams: (ctx: any) => {
            const opts = ctx.model?.getRoute?.()?.options || {};
            const st = opts[STYLE_KEY] || {};
            const oldKind = opts[KIND_KEY];
            const wasGroup = oldKind === 'groupLabel'; // migrate the retired kind → line-off heading
            return {
              dvOn: oldKind === 'divider' || oldKind === 'groupLabel',
              __title: titleText(ctx.model), // read-only: item name, used as the line-off heading fallback
              dvText: st.text || '',
              dvColor: st.color || '',
              dvThickness: st.thickness || 1,
              dvLineOn: wasGroup ? false : st.lineOn !== false, // group titles had no rule
              dvPos: st.pos || 'on',
              dvAlign: st.align || (wasGroup ? 'left' : 'center'), // group titles read left-aligned
              dvSize: st.size || 11,
            };
          },
          uiSchema: () => ({
            // Live preview, pinned on top; shown once "Convert to section" is on.
            preview: {
              ...previewField('PtdlSectionPreview', T('Preview')),
              'x-reactions': rx(secOn),
            },
            // Single master toggle — replaces the old 3-way "Display as" radio. Off = a normal menu
            // item; on = a non-clickable section (heading, divider line, or line + title).
            dvOn: fi(T('Convert to section'), 'Switch', {
              type: 'boolean',
              decoratorProps: {
                style: { marginBottom: 8 },
                tooltip: T('Turn this menu item into a non-clickable heading and/or divider line.'),
              },
            }),
            dvText: fi(T('Label (optional)'), 'Input', {
              componentProps: { placeholder: T('e.g. COMMUNICATION') },
              decoratorProps: {
                tooltip: T('Section text. Leave empty for a plain line — or, with the line off, the menu item name.'),
              },
              reactions: rx(secOn),
            }),
            // Position + alignment — Segmented pickers (block, bordered per house style).
            posRow: {
              type: 'void',
              'x-component': 'SettingsGrid',
              properties: {
                dvPos: fi(T('Text position'), 'PtdlSegmented', {
                  componentProps: {
                    ...SEG_PROPS,
                    options: [
                      { label: T('Above'), value: 'above' },
                      { label: T('On line'), value: 'on' },
                      { label: T('Below'), value: 'below' },
                    ],
                  },
                  // Position vs the line only matters with a caption AND a visible line.
                  reactions: rx((v: any) => secOn(v) && secText(v) && secLineOn(v)),
                }),
                dvAlign: fi(T('Align'), 'PtdlSegmented', {
                  componentProps: {
                    ...SEG_PROPS,
                    options: [
                      { label: T('Left'), value: 'left' },
                      { label: T('Center'), value: 'center' },
                      { label: T('Right'), value: 'right' },
                    ],
                  },
                  reactions: rx((v: any) => secOn(v) && secCaption(v)),
                }),
              },
            },
            // Line on/off + thickness (thickness hidden when the line is off).
            lineRow: {
              type: 'void',
              'x-component': 'SettingsGrid',
              properties: {
                dvLineOn: fi(T('Show line'), 'Switch', { type: 'boolean', reactions: rx(secOn) }),
                dvThickness: fi(T('Line thickness (px)'), 'Input', {
                  type: 'number',
                  componentProps: { type: 'number', min: 1, max: 6, placeholder: '1' },
                  reactions: rx((v: any) => secOn(v) && secLineOn(v)),
                }),
              },
            },
            // Colour (line + caption) + caption font size (size hidden when there is no caption).
            styleRow: {
              type: 'void',
              'x-component': 'SettingsGrid',
              properties: {
                dvColor: fi(T('Color'), 'PtdlSectionColor', { reactions: rx(secOn) }),
                dvSize: fi(T('Font size (px)'), 'Input', {
                  type: 'number',
                  componentProps: { type: 'number', min: 8, max: 28, placeholder: '11' },
                  reactions: rx((v: any) => secOn(v) && secCaption(v)),
                }),
              },
            },
          }),
          // IMPORTANT: beforeParamsSave (runs ONLY on dialog save), NOT handler. A `handler` auto-applies
          // on every menu render for every item → would call updateMenuRoute (API write) on every route
          // continuously → desktopRoutes:update storm → SQLITE_BUSY. render() reads route.options directly,
          // so no auto-apply is needed.
          async beforeParamsSave(ctx: any, params: any) {
            const model = ctx.model;
            const route = model?.getRoute?.();
            const options = { ...(route?.options || {}) };
            // One section kind now — the flexible 'divider'. Off = a normal menu item.
            if (params?.dvOn !== true) {
              delete options[KIND_KEY];
              delete options[STYLE_KEY];
            } else {
              options[KIND_KEY] = 'divider';
              const style: SectionStyle = {};
              const txt = String(params.dvText || '').trim();
              if (txt) style.text = txt;
              if (params.dvColor) style.color = String(params.dvColor);
              const th = Number(params.dvThickness);
              if (th > 1) style.thickness = th;
              // Only persist non-defaults (keeps route.options lean; absent → the render defaults apply).
              if (params.dvLineOn === false) style.lineOn = false;
              if (params.dvPos === 'above' || params.dvPos === 'below') style.pos = params.dvPos;
              if (params.dvAlign === 'left' || params.dvAlign === 'right') style.align = params.dvAlign;
              const dsz = Number(params.dvSize);
              if (dsz > 0 && dsz !== 11) style.size = dsz;
              if (Object.keys(style).length) options[STYLE_KEY] = style;
              else delete options[STYLE_KEY];
            }
            await updateRouteWithRetry(model, { options });
            // Nudge a re-render so the change shows immediately for leaf items.
            model.setProps?.('ptdlSectionRev', Date.now());
          },
        },
      },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[menu-sections] registerFlow failed', e);
  }
}

export function registerMenuSections(deps: { flowEngine: any; i18n?: any }) {
  const { flowEngine } = deps;
  setSectionsI18n(deps.i18n);
  const Model = flowEngine?.getModelClass?.('AdminLayoutMenuItemModel');
  if (!Model || typeof Model.registerFlow !== 'function') {
    // eslint-disable-next-line no-console
    console.warn('[menu-sections] AdminLayoutMenuItemModel not resolvable in this lane — skip');
    return;
  }
  injectStyleOnce();
  registerSectionComponents(flowEngine?.flowSettings);
  const proto: any = Model.prototype;
  patchRender(proto);
  patchToProLayoutRoute(proto);
  registerSettingsFlow(Model);
  // eslint-disable-next-line no-console
  console.log('[menu-sections] registered on AdminLayoutMenuItemModel');
}
