import React from 'react';
// ColumnSelect (below) renders antd's Select. nocobase-build only externalizes packages that appear in the
// plugin's OWN src imports; this plugin otherwise never imports antd, so without this line the shared barrel's
// transitive `import 'antd'` (colorField) would try to bundle antd (build-env ships an entry-less stub) → fail.
// This value-less side-effect import marks antd as an external → resolves to the host-provided antd at runtime.
import 'antd';
import { ColumnSelect, registerFlowComponentsOnce } from '@tuanla90/shared';

/**
 * Detail Panel — AppSheet-style master–detail split view for NocoBase `/v/`, two complementary features that
 * share the layout's built-in `#nocobase-embed-container` (a flex sibling of the content; docking a view
 * into it shrinks the content beside it, no mask, both interactive; being the *global* embed target it also
 * gets the flow-engine's replace behavior → opening another record swaps the panel without closing it):
 *
 *  A. **"Side panel" open mode** on native record popups (`openView`). The "Edit popup" dialog gains a 4th
 *     Open-mode next to Drawer / Dialog / Page. Picking it opens the *exact same configured popup* (tabs,
 *     actions, editable form/detail/sub-blocks) docked to the right. Done by augmenting the registered
 *     `openView` action: push a `sidePanel` option into `uiSchema.mode.enum`, and wrap `handler` so mode
 *     'sidePanel' retargets the open to the embed container (MUTATING `ctx.inputArgs` PROPERTIES — reassigning
 *     `ctx.inputArgs = {...}` does NOT stick, the handler reads back the original object) + width + no router.
 *
 *  B. **Row-click quick panel** — a Table block ⚙ toggle. Clicking anywhere on a row (no button needed) opens
 *     a zero-config read-only detail of that record in the same side panel; clicking other rows swaps it;
 *     re-clicking the highlighted row (native `selected=false`) or the X closes it.
 *
 * A shared container manager owns the panel: it resets the layout width when the panel closes and mounts a
 * **drag-resize splitter** on the panel's left edge while it's open.
 */

export const NS = 'detail-panel';

let _t: (s: string, o?: any) => string = (s) => s;
export const setRuntimeT = (fn: (s: string, o?: any) => string) => {
  _t = fn;
};
const t = (s: string, o?: any) => _t(s, o);

const EMBED_ID = 'nocobase-embed-container';
const EMBED_REPLACING_KEY = 'nocobaseEmbedReplacing';
const SIZE_TO_WIDTH: Record<string, string> = { small: '30%', medium: '40%', large: '50%' };
const MIN_PANEL_PX = 320;
const MIN_CONTENT_PX = 360; // keep at least this much of the main content visible when dragging

// ---- Container / splitter manager ---------------------------------------------------------------------

type ManagedContainer = HTMLElement & { __ptdlObs?: MutationObserver };
let splitterHandle: HTMLElement | null = null;

function getContainer(): ManagedContainer | null {
  if (typeof document === 'undefined') return null;
  return document.getElementById(EMBED_ID) as ManagedContainer | null;
}

export function applyPanelWidth(container: HTMLElement, width: string) {
  container.style.width = width;
  container.style.minWidth = '0px';
  container.style.maxWidth = '';
}

function resetPanelWidth(container: HTMLElement) {
  container.style.width = 'auto';
  container.style.minWidth = '';
  container.style.maxWidth = '';
}

function positionSplitter(container: HTMLElement) {
  if (!splitterHandle) return;
  const r = container.getBoundingClientRect();
  splitterHandle.style.left = `${Math.round(r.left) - 3}px`;
  splitterHandle.style.top = `${Math.round(r.top)}px`;
  splitterHandle.style.height = `${Math.round(r.height)}px`;
}

function ensureSplitterHandle(): HTMLElement {
  if (splitterHandle) return splitterHandle;
  const h = document.createElement('div');
  h.setAttribute('data-ptdl-splitter', '1');
  Object.assign(h.style, {
    position: 'fixed',
    width: '6px',
    zIndex: '1200',
    cursor: 'col-resize',
    display: 'none',
    background: 'transparent',
  } as CSSStyleDeclaration);

  // a thin visible grip that brightens on hover/drag
  const grip = document.createElement('div');
  Object.assign(grip.style, {
    position: 'absolute',
    left: '2px',
    top: '0',
    width: '2px',
    height: '100%',
    background: 'rgba(128,128,128,0.25)',
    transition: 'background 0.15s',
  } as CSSStyleDeclaration);
  h.appendChild(grip);
  h.addEventListener('mouseenter', () => (grip.style.background = 'var(--colorPrimary, #6f56cf)'));
  h.addEventListener('mouseleave', () => (grip.style.background = 'rgba(128,128,128,0.25)'));

  const onDown = (downEv: MouseEvent) => {
    downEv.preventDefault();
    const container = getContainer();
    if (!container) return;
    grip.style.background = 'var(--colorPrimary, #6f56cf)';
    const prevUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = 'none';
    const rightEdge = container.getBoundingClientRect().right;

    const onMove = (moveEv: MouseEvent) => {
      let w = rightEdge - moveEv.clientX;
      const maxW = window.innerWidth - MIN_CONTENT_PX;
      w = Math.max(MIN_PANEL_PX, Math.min(w, maxW));
      container.style.width = `${Math.round(w)}px`;
      container.style.maxWidth = 'none';
      positionSplitter(container);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.userSelect = prevUserSelect;
      grip.style.background = 'rgba(128,128,128,0.25)';
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };
  h.addEventListener('mousedown', onDown);

  document.body.appendChild(h);
  splitterHandle = h;

  // keep the handle glued to the panel edge on viewport changes
  window.addEventListener('resize', () => {
    const c = getContainer();
    if (c && c.children.length > 0) positionSplitter(c);
  });
  return h;
}

function showSplitter(container: HTMLElement) {
  const h = ensureSplitterHandle();
  h.style.display = 'block';
  positionSplitter(container);
}

function hideSplitter() {
  if (splitterHandle) splitterHandle.style.display = 'none';
}

/** Install the childList observer that manages width-reset + splitter lifecycle. Idempotent. */
function ensureContainerManager(): ManagedContainer | null {
  const container = getContainer();
  if (!container) return null;
  if (!container.__ptdlObs) {
    const obs = new MutationObserver(() => {
      if (container.children.length > 0) {
        showSplitter(container);
      } else {
        hideSplitter();
        if (container.dataset[EMBED_REPLACING_KEY] !== '1') resetPanelWidth(container);
      }
    });
    obs.observe(container, { childList: true });
    container.__ptdlObs = obs;
    // in case something is already open
    if (container.children.length > 0) showSplitter(container);
  }
  return container;
}

// =======================================================================================================
// Feature A — "Side panel" open mode on the native openView action
// =======================================================================================================

export function registerSidePanelMode({ flowEngine, sidePanelLabel }: { flowEngine: any; sidePanelLabel: string }) {
  const act: any = flowEngine?.getAction?.('openView');
  if (!act) return false;
  if (act.__ptdlSidePanel) return true;
  act.__ptdlSidePanel = true;

  try {
    const modeEnum = act.uiSchema?.mode?.enum;
    if (Array.isArray(modeEnum) && !modeEnum.some((o: any) => o?.value === 'sidePanel')) {
      modeEnum.push({ label: sidePanelLabel, value: 'sidePanel' });
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[detail-panel] could not add sidePanel enum option', e);
  }

  const orig = act.handler;
  act.handler = async function ptdlOpenViewWithSidePanel(ctx: any, params: any) {
    const mode = ctx?.inputArgs?.mode ?? params?.mode;
    if (mode !== 'sidePanel') return orig.call(this, ctx, params);

    const container = ensureContainerManager();
    if (!container) return orig.call(this, ctx, { ...params, mode: 'drawer' }); // graceful fallback (no container)

    const size = ctx?.inputArgs?.size ?? params?.size ?? 'medium';
    const width = SIZE_TO_WIDTH[size] || SIZE_TO_WIDTH.medium;
    const ia = ctx.inputArgs;
    if (ia) {
      const prevOnOpen = ia.onOpen;
      // MUTATE properties (do not reassign ctx.inputArgs).
      ia.mode = 'embed';
      ia.target = container;
      ia.navigation = false;
      ia.onOpen = (view: any, c: any) => {
        applyPanelWidth(container, width);
        prevOnOpen && prevOnOpen(view, c);
      };
    }
    return orig.call(this, ctx, { ...params, mode: 'embed', navigation: false });
  };

  // eslint-disable-next-line no-console
  console.log('[detail-panel] "Side panel" open mode added to openView');
  return true;
}

export function registerSidePanelModeWithRetry(opts: { flowEngine: any; sidePanelLabel: string }) {
  if (registerSidePanelMode(opts)) return;
  let tries = 0;
  const timer = setInterval(() => {
    tries += 1;
    if (registerSidePanelMode(opts) || tries > 40) clearInterval(timer);
  }, 150);
}

// =======================================================================================================
// Feature B — row-click quick panel (read-only), a Table block ⚙ toggle
// =======================================================================================================

const HIDDEN_INTERFACES = new Set(['password']);
let activePanelView: any = null;
let activeToken: object | null = null;

function getRowKey(record: any, filterTargetKey: any): any {
  const key = Array.isArray(filterTargetKey) ? filterTargetKey[0] : filterTargetKey || 'id';
  return record?.[key];
}

/**
 * Find the row's popup-opening action (the one behind the row's "View" button) on a Table block, so a
 * row-body click can trigger it. Row actions are column-level models under TableActionsColumnModel, rendered
 * per row. Prefer View, then Edit, then any action that has the `popupSettings` (openView) flow.
 */
function findRowPopupAction(model: any): any {
  const isPopup = (a: any) => {
    try {
      return !!(a?.getFlow && a.getFlow('popupSettings'));
    } catch (e) {
      return false;
    }
  };
  const cols: any[] = model?.subModels?.columns || [];
  const actCol = cols.find((c) => c?.constructor?.name === 'TableActionsColumnModel');
  const acts: any[] = actCol?.subModels?.actions || [];
  return (
    acts.find((a) => a?.constructor?.name === 'ViewActionModel' && isPopup(a)) ||
    acts.find((a) => a?.constructor?.name === 'EditActionModel' && isPopup(a)) ||
    acts.find(isPopup) ||
    null
  );
}

function resolveFields(model: any, picked?: string[]): any[] {
  const all: any[] = model?.collection?.getFields?.() || [];
  if (Array.isArray(picked) && picked.length) {
    const set = new Set(picked);
    return all.filter((f) => set.has(f.name));
  }
  return all.filter((f) => f?.interface && !HIDDEN_INTERFACES.has(f.interface));
}

function formatValue(field: any, record: any): React.ReactNode {
  const v = record?.[field.name];
  if (v === null || v === undefined || v === '') return '—';
  if (field.target) {
    const tfName = field.targetCollectionTitleFieldName || 'id';
    if (Array.isArray(v)) {
      const parts = v.map((x) => (x && typeof x === 'object' ? x[tfName] ?? x.id : x)).filter((x) => x != null);
      return parts.length ? parts.join(', ') : '—';
    }
    if (typeof v === 'object') return String(v[tfName] ?? v.id ?? JSON.stringify(v));
    return String(v);
  }
  const en: any[] = field.enum || [];
  if (en.length) {
    if (Array.isArray(v)) return v.map((x) => en.find((o) => String(o.value) === String(x))?.label ?? String(x)).join(', ');
    const opt = en.find((o) => String(o.value) === String(v));
    if (opt) return opt.label;
  }
  if (typeof v === 'boolean') return v ? '✓' : '✗';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function computeTitle(model: any, record: any): React.ReactNode {
  const tf = model?.collection?.titleCollectionField;
  const raw = tf ? record?.[tf.name] : undefined;
  const key = getRowKey(record, model?.collection?.filterTargetKey);
  const label = raw != null && raw !== '' ? String(raw) : t('Bản ghi');
  return (
    <span>
      {label}
      {key != null && (
        <span style={{ opacity: 0.55, marginLeft: 8, fontWeight: 400, fontSize: '0.85em' }}>#{String(key)}</span>
      )}
    </span>
  );
}

const DetailPanelContent: React.FC<{ model: any; record: any; fields: any[] }> = ({ model, record, fields }) => {
  const token = model?.flowEngine?.context?.themeToken || ({} as any);
  const border = token.colorSplit || 'rgba(0,0,0,0.06)';
  const labelColor = token.colorTextSecondary || '#8c8c8c';
  const valueColor = token.colorText || '#000';
  const bg = token.colorBgContainer || '#fff';
  return (
    <div style={{ height: '100%', overflowY: 'auto', background: bg, padding: `${token.paddingSM ?? 12}px 0` }}>
      {fields.length === 0 && (
        <div style={{ padding: 16, color: labelColor }}>{t('Không có trường nào để hiển thị')}</div>
      )}
      {fields.map((f) => (
        <div
          key={f.name}
          style={{
            display: 'flex',
            gap: 12,
            padding: `${token.paddingXS ?? 8}px ${token.padding ?? 16}px`,
            borderBottom: `1px solid ${border}`,
            alignItems: 'baseline',
          }}
        >
          <div style={{ flex: '0 0 38%', color: labelColor, fontSize: token.fontSizeSM ?? 12, lineHeight: 1.5 }}>
            {f.title}
          </div>
          <div style={{ flex: 1, color: valueColor, fontSize: token.fontSize ?? 14, wordBreak: 'break-word' }}>
            {formatValue(f, record)}
          </div>
        </div>
      ))}
    </div>
  );
};

/** Register the rowClick → quick-panel flow on the native /v/ TableBlockModel. Idempotent; no-op elsewhere. */
export function registerRowClickPanel({ flowEngine }: { flowEngine: any }) {
  const TableBlockModel: any = flowEngine?.getModelClass?.('TableBlockModel');
  if (!TableBlockModel) return;
  if (TableBlockModel.__ptdlRowClickPanel) return;
  TableBlockModel.__ptdlRowClickPanel = true;

  // Register the shared column picker so `x-component: 'ColumnSelect'` resolves in the flow-settings dialog
  // (this plugin doesn't use registerSettingsKit, so ColumnSelect must be registered explicitly).
  try { registerFlowComponentsOnce(flowEngine?.flowSettings, { ColumnSelect }); } catch (e) { /* non-fatal */ }

  TableBlockModel.registerFlow({
    key: 'ptdlDetailPanel',
    title: t('Panel chi tiết (bấm dòng)'),
    on: { eventName: 'rowClick' },
    sort: 950,
    steps: {
      settings: {
        title: t('Panel chi tiết cạnh bên'),
        uiSchema: (ctx: any) => {
          const all: any[] = ctx?.model?.collection?.getFields?.() || [];
          const fieldOptions = all
            .filter((f) => f?.interface && !HIDDEN_INTERFACES.has(f.interface))
            .map((f) => ({ label: f.title, value: f.name, type: f.type, iface: f.interface }));
          return {
            dpEnabled: {
              type: 'boolean',
              title: t('Bấm dòng để mở panel chi tiết bên phải'),
              'x-decorator': 'FormItem',
              'x-component': 'Switch',
            },
            dpContent: {
              type: 'string',
              title: t('Nội dung panel'),
              'x-decorator': 'FormItem',
              'x-component': 'Select',
              enum: [
                { label: t('Popup đã cấu hình (đầy đủ, sửa được)'), value: 'popup' },
                { label: t('Xem nhanh (chỉ đọc)'), value: 'quick' },
              ],
              'x-reactions': { dependencies: ['dpEnabled'], fulfill: { state: { visible: '{{ !!$deps[0] }}' } } },
            },
            dpWidth: {
              type: 'string',
              title: t('Độ rộng panel'),
              'x-decorator': 'FormItem',
              'x-component': 'Select',
              enum: [
                { label: t('Hẹp (30%)'), value: 'small' },
                { label: t('Vừa (40%)'), value: 'medium' },
                { label: t('Rộng (50%)'), value: 'large' },
              ],
              'x-reactions': { dependencies: ['dpEnabled'], fulfill: { state: { visible: '{{ !!$deps[0] }}' } } },
            },
            dpFields: {
              type: 'array',
              title: t('Trường hiển thị (để trống = tất cả)'),
              'x-decorator': 'FormItem',
              'x-component': 'ColumnSelect',
              'x-component-props': {
                mode: 'multiple',
                allowClear: true,
                placeholder: t('Tất cả trường'),
                options: fieldOptions,
              },
              // only relevant to the read-only "quick" content
              'x-reactions': {
                dependencies: ['dpEnabled', 'dpContent'],
                fulfill: { state: { visible: '{{ !!$deps[0] && $deps[1] === "quick" }}' } },
              },
            },
          };
        },
        defaultParams: { dpEnabled: false, dpContent: 'popup', dpWidth: 'medium', dpFields: [] },
        handler(ctx: any, params: any) {
          if (!params?.dpEnabled) return;
          const container = ensureContainerManager();
          if (!container) return;

          // Ignore clicks that landed on an interactive control (View/Edit/Delete buttons, links, checkboxes,
          // inline inputs) — those run their own action; the panel is only for clicking the row body. This
          // lets the row-click panel coexist with row action buttons (incl. a "Side panel" View).
          const ev = ctx?.inputArgs?.event;
          const tgt = ev?.target;
          if (tgt && typeof tgt.closest === 'function' && tgt.closest('button, a, input, .ant-checkbox, [role="button"], .ant-select, .ant-picker')) {
            return;
          }

          const model = ctx.model;
          const record = ctx?.inputArgs?.record;
          const selected = ctx?.inputArgs?.selected;
          const content = params?.dpContent || 'popup';

          // --- Content = configured popup: trigger the row's View/popup action in Side panel mode ---------
          // Reuses the SAME popup the user built for the View button (tabs, actions, editable form). We fire
          // the action's 'click' with inputArgs mode:'sidePanel' + explicit filterByTk (no saved-config
          // mutation). Do NOT await — the click flow's promise resolves only when the popup closes.
          if (content === 'popup') {
            if (selected === false) return; // leave the popup open; user closes it via its own X
            if (!record) return;
            const action = findRowPopupAction(model);
            if (action?.dispatchEvent) {
              const key = getRowKey(record, model?.collection?.filterTargetKey);
              try {
                action.dispatchEvent('click', { mode: 'sidePanel', size: params?.dpWidth || 'medium', filterByTk: key });
              } catch (e) {
                // eslint-disable-next-line no-console
                console.error('[detail-panel] row-click popup trigger failed', e);
              }
              return;
            }
            // No popup action on this table → fall through to the read-only quick panel.
          }

          // --- Content = quick (read-only field list) --------------------------------------------------
          if (!ctx?.viewer?.embed) return;

          if (selected === false) {
            try {
              activePanelView?.close?.();
            } catch (e) {
              /* noop */
            }
            activePanelView = null;
            activeToken = null;
            return;
          }
          if (!record) return;

          const width = SIZE_TO_WIDTH[params.dpWidth] || SIZE_TO_WIDTH.medium;
          const fields = resolveFields(model, params.dpFields);
          const title = computeTitle(model, record);
          const token = {};

          try {
            const view = ctx.viewer.embed({
              target: container,
              title,
              inheritContext: false,
              onOpen: () => applyPanelWidth(container, width),
              onClose: () => {
                if (activeToken === token) {
                  activePanelView = null;
                  activeToken = null;
                }
                // width-reset + splitter handled by the container manager observer
              },
              content: () => <DetailPanelContent model={model} record={record} fields={fields} />,
            });
            activePanelView = view;
            activeToken = token;
          } catch (e) {
            // eslint-disable-next-line no-console
            console.error('[detail-panel] row-click open failed', e);
          }
        },
      },
    },
  });

  // eslint-disable-next-line no-console
  console.log('[detail-panel] row-click quick panel registered on TableBlockModel');
}
