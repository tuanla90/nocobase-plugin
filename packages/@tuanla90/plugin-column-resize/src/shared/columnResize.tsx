import React from 'react';

/**
 * Column drag-resize for /v/ (flow-engine) tables — both the TableBlockModel (page tables) and the
 * SubTableFieldModel (sub-tables inside edit/create forms). All CRASH-SAFE: any failure falls back to the
 * native table, never white-screens.
 *
 * Live drag drives the COLUMN MODEL's `props.width` (`setProps`) each animation frame, so antd owns the
 * layout and shrink/grow behave identically (the earlier DOM-`<col>` approach couldn't shrink below the
 * cell's content min-width). On mouse-up the width is persisted to the OWNER model's stepParams
 * (`ptdlColumnResize`) via `save()` — shared per-block/per-field, editable only with the UI editor on.
 *
 * Injecting the resizable header cell:
 *   - TableBlockModel builds its antd `components` as `this.components` → we merge `header.cell` in a
 *     renderComponent wrap.
 *   - SubTableFieldModel builds `components` as a LOCAL in render() → we wrap render() and clone the antd
 *     Table element in the returned tree to merge `header.cell`.
 */

const MIN_W = 56;
const HANDLE_CLASS = 'ptdl-col-resizer';
const FLOW_KEY = 'ptdlColumnResize';
const STEP_KEY = 'widths';

// The field currently being dragged — while set, getColumns must NOT overwrite that column's width with
// the persisted value (the live `props.width` from the drag is the source of truth for that column).
let draggingField: string | null = null;

function ensureCss(): void {
  if (typeof document === 'undefined' || document.getElementById('ptdl-col-resize-css')) return;
  const s = document.createElement('style');
  s.id = 'ptdl-col-resize-css';
  s.textContent =
    `.ant-table-thead th.ptdl-resizable-th{position:relative}` +
    `.${HANDLE_CLASS}{position:absolute;top:0;right:-5px;width:11px;height:100%;cursor:col-resize;` +
    `user-select:none;touch-action:none;z-index:5}` +
    `.${HANDLE_CLASS}::after{content:'';position:absolute;top:20%;right:5px;width:2px;height:60%;` +
    `background:transparent;border-radius:2px;transition:background .15s}` +
    `.${HANDLE_CLASS}:hover::after,body.ptdl-col-resizing .${HANDLE_CLASS}::after{background:var(--ptdl-resize-accent,#1677ff)}` +
    `body.ptdl-col-resizing{cursor:col-resize!important;user-select:none!important}`;
  document.head.appendChild(s);
}

/**
 * Resizable header cell. antd merges `onHeaderCell()`'s return with the default <th> props and passes them
 * here, so we read our `ptdl*` handlers and render a right-edge grab strip; everything else spreads to <th>.
 * Dragging calls `ptdlOnResize(w)` (rAF-throttled → live re-layout via the column model) and, on release,
 * `ptdlOnResizeStop(w)` (persist).
 */
function ResizableTitle(props: any) {
  const { ptdlResizable, ptdlOnResize, ptdlOnResizeStop, ...rest } = props || {};
  const thRef = React.useRef<HTMLTableCellElement>(null);
  if (!ptdlResizable) return <th {...rest} />;

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const th = thRef.current;
    if (!th) return;
    const startX = e.clientX;
    const startW = th.getBoundingClientRect().width;
    if (typeof document !== 'undefined') document.body.classList.add('ptdl-col-resizing');
    let lastW = startW;
    let raf = 0;
    const flush = () => {
      raf = 0;
      try { ptdlOnResize?.(lastW); } catch (_) { /* ignore */ }
    };
    const onMove = (ev: MouseEvent) => {
      lastW = Math.max(MIN_W, Math.round(startW + (ev.clientX - startX)));
      if (!raf && typeof requestAnimationFrame !== 'undefined') raf = requestAnimationFrame(flush);
      else if (typeof requestAnimationFrame === 'undefined') flush();
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (raf && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(raf);
      if (typeof document !== 'undefined') document.body.classList.remove('ptdl-col-resizing');
      try { ptdlOnResizeStop?.(lastW); } catch (_) { /* ignore */ }
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const cls = [rest.className, 'ptdl-resizable-th'].filter(Boolean).join(' ');
  return (
    <th {...rest} ref={thRef} className={cls}>
      {rest.children}
      <span className={HANDLE_CLASS} onMouseDown={onMouseDown} onClick={(ev) => ev.stopPropagation()} />
    </th>
  );
}

function readWidths(model: any): Record<string, number> {
  try {
    const m = model?.stepParams?.[FLOW_KEY]?.[STEP_KEY]?.map;
    return m && typeof m === 'object' ? m : {};
  } catch (_) {
    return {};
  }
}

function saveWidth(model: any, field: string, w: number, colModel: any): void {
  try {
    colModel?.setProps?.('width', w); // authoritative width for the re-render
    const next = { ...readWidths(model), [field]: w };
    model?.setStepParams?.(FLOW_KEY, STEP_KEY, { map: next });
    model?.save?.();
  } catch (_) {
    /* ignore — width already applied live via setProps */
  }
}

function isEditorOn(model: any): boolean {
  try {
    if (model?.context?.flowSettingsEnabled != null) return !!model.context.flowSettingsEnabled;
  } catch (_) { /* fall through */ }
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem('NOCOBASE_V2_FLOW_SETTINGS_ENABLED') === 'true';
  } catch (_) {
    return false;
  }
}

// field-name → column sub-model (TableColumnModel or SubTableColumnModel) for the live props.width drive.
function fieldModelMap(model: any): Map<string, any> {
  const map = new Map<string, any>();
  try {
    const cols: any[] = model?.subModels?.columns || [];
    for (const cm of cols) {
      const f = cm?.collectionField?.name || cm?.props?.dataIndex || cm?.props?.name;
      if (f) map.set(String(f), cm);
    }
  } catch (_) { /* ignore */ }
  return map;
}

// Shared: apply persisted widths (all viewers) + attach resize handlers (editor only) to an antd column list.
// `owner` is the model that stores the widths (block model or sub-table field model).
function applyResizeToColumns(owner: any, cols: any[]): void {
  const widths = readWidths(owner);
  const editable = isEditorOn(owner);
  const models = editable ? fieldModelMap(owner) : null;
  for (const col of cols) {
    if (!col || col.key === 'empty' || col.key === 'addColumn') continue;
    const di = col.dataIndex;
    const field = Array.isArray(di) ? di.join('.') : di;
    if (!field) continue;
    const f = String(field);
    // Apply the shared persisted width — EXCEPT the column being dragged (its live props.width wins).
    if (widths[f] != null && draggingField !== f) col.width = widths[f];
    if (!editable) continue;
    const prevOHC = col.onHeaderCell;
    col.onHeaderCell = (column: any) => {
      const base = prevOHC ? prevOHC(column) || {} : {};
      return {
        ...base,
        ptdlResizable: true,
        ptdlOnResize: (w: number) => {
          draggingField = f;
          try { models?.get(f)?.setProps?.('width', w); } catch (_) { /* ignore */ }
        },
        ptdlOnResizeStop: (w: number) => {
          saveWidth(owner, f, w, models?.get(f));
          draggingField = null;
        },
      };
    };
  }
}

// Recursively clone a React element tree to merge `components.header.cell = ResizableTitle` into the antd
// Table (identified by having `components.header` + `columns` props). Used for models that build their
// table `components` as a render-local (SubTableFieldModel), where we can't patch a `this.components`.
function injectHeaderCell(node: any, depth: number): any {
  if (depth > 8 || !node || typeof node !== 'object' || !node.props) return node;
  try {
    const p = node.props;
    if (p.components && p.components.header && p.columns) {
      if (p.components.header.cell === ResizableTitle) return node;
      return React.cloneElement(node, {
        components: { ...p.components, header: { ...p.components.header, cell: ResizableTitle } },
      });
    }
    if (p.children) {
      const mapped = React.Children.map(p.children, (c: any) => injectHeaderCell(c, depth + 1));
      return React.cloneElement(node, undefined, mapped);
    }
  } catch (_) { /* ignore — return node unchanged */ }
  return node;
}

export function registerColumnResize({ flowEngine }: { flowEngine: any }): void {
  if (!flowEngine || typeof flowEngine.getModelClass !== 'function') return;
  const TableBlockModel: any = flowEngine.getModelClass('TableBlockModel');
  if (!TableBlockModel) return; // classic lane — no /v/ table models
  ensureCss();

  // Register a data-only flow so the width map is a recognised stepParams key that survives save().
  const regFlow = (Cls: any) => {
    try {
      if (Cls && typeof Cls.registerFlow === 'function' && !Cls.__ptdlResizeFlow) {
        Cls.registerFlow({ key: FLOW_KEY, sort: 999, steps: { [STEP_KEY]: { handler() { /* data only */ } } } });
        Cls.__ptdlResizeFlow = true;
      }
    } catch (_) { /* optional */ }
  };

  // Patch a model's getColumns to apply widths + resize handlers.
  const patchGetColumns = (proto: any) => {
    if (!proto || proto.__ptdlResizePatched || typeof proto.getColumns !== 'function') return;
    const orig = proto.getColumns;
    proto.getColumns = function (...args: any[]) {
      const cols = orig.apply(this, args) || [];
      try { if (Array.isArray(cols)) applyResizeToColumns(this, cols); } catch (_) { /* crash-safe */ }
      return cols;
    };
    proto.__ptdlResizePatched = true;
  };

  // --- TableBlockModel: getColumns + header.cell via this.components (renderComponent wrap) ---
  regFlow(TableBlockModel);
  patchGetColumns(TableBlockModel.prototype);
  const tbProto = TableBlockModel.prototype;
  if (!tbProto.__ptdlResizeRender) {
    const origRender = tbProto.renderComponent;
    if (typeof origRender === 'function') {
      tbProto.renderComponent = function (...a: any[]) {
        try {
          const c = this.components;
          if (c && c.header && c.header.cell !== ResizableTitle) {
            this.components = { ...c, header: { ...c.header, cell: ResizableTitle } };
          }
        } catch (_) { /* ignore — render native */ }
        return origRender.apply(this, a);
      };
      tbProto.__ptdlResizeRender = true;
    }
  }

  // --- SubTableFieldModel: getColumns + header.cell via render() wrap (components is a render-local) ---
  try {
    const SubTable: any = flowEngine.getModelClass('SubTableFieldModel');
    if (SubTable) {
      regFlow(SubTable);
      patchGetColumns(SubTable.prototype);
      const stProto = SubTable.prototype;
      if (!stProto.__ptdlResizeRender && typeof stProto.render === 'function') {
        const origRender = stProto.render;
        stProto.render = function (...a: any[]) {
          const el = origRender.apply(this, a);
          try { return isEditorOn(this) || readWidthsHasAny(this) ? injectHeaderCell(el, 0) : el; } catch (_) { return el; }
        };
        stProto.__ptdlResizeRender = true;
      }
    }
  } catch (_) { /* sub-table optional */ }
}

// Only pay the tree-clone cost when there's something to do (editor on, or some widths already saved).
function readWidthsHasAny(model: any): boolean {
  try { return Object.keys(readWidths(model)).length > 0; } catch (_) { return false; }
}
