import React from 'react';

/**
 * Column drag-resize for /v/ (flow-engine) tables.
 *
 * TWO independent mechanisms, because sub-tables can't be reached by the model patch:
 *
 *  1) MAIN TABLES (TableBlockModel) — MODEL PATCH. We patch TableBlockModel.getColumns to attach resize
 *     handlers and inject a custom header cell (ResizableTitle) via `this.components`. Live drag drives the
 *     COLUMN MODEL's `props.width` (setProps) each frame; on mouse-up the width persists to the block's
 *     stepParams (`ptdlColumnResize`) — shared per-block, editor-only. This path WORKS and is unchanged.
 *
 *  2) SUB-TABLES (SubTableFieldModel + subclasses like Sub-table Pro) — DOM PATCH. The model patch can NOT
 *     reach these: the flow engine re-registers model classes, so a rendered sub-table instance's real
 *     prototype is a different object than any class we patch (identity mismatch — confirmed live). So sub
 *     tables are handled purely off the rendered DOM: a document-level mousedown (capture) starts a drag when
 *     the pointer is in a header cell's right-edge grab zone, and the width is applied to the antd table's
 *     `<colgroup><col>` (and the <th>) directly. Identity-independent. Persistence is best-effort
 *     (localStorage keyed by a DOM-derived id, re-applied by a MutationObserver). CRASH-SAFE throughout.
 */

const MIN_W = 50; // never collapse a column to 0 (matches the core "Column width" min); also the drag floor
const EDGE_ZONE = 10; // px from a header's right edge that arms the drag (also the ::after grab-zone width)
const HANDLE_CLASS = 'ptdl-col-resizer';
const FLOW_KEY = 'ptdlColumnResize';
const STEP_KEY = 'widths';
const CR_VERSION = '0.1.9';

// The field currently being dragged — while set, getColumns must NOT overwrite that column's width with
// the persisted value (the live `props.width` from the drag is the source of truth for that column).
let draggingField: string | null = null;

function crlog(msg: string): void {
  try { if (typeof console !== 'undefined') console.log('[ptdl-cr] ' + msg); } catch (_) { /* ignore */ }
}

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
    `body.ptdl-col-resizing{cursor:col-resize!important;user-select:none!important}` +
    // Sub-table (DOM) variant: the grab zone lives on the DEFAULT <th> itself (right-edge ::after). Skip
    // fixed cells (their sticky position must win).
    `.ant-table-thead th.ptdl-resizable-sub:not(.ant-table-cell-fix-left):not(.ant-table-cell-fix-right){position:relative}` +
    `.ant-table-thead th.ptdl-resizable-sub::after{content:'';position:absolute;top:0;right:0;width:${EDGE_ZONE}px;height:100%;cursor:col-resize;z-index:6}` +
    `.ant-table-thead th.ptdl-resizable-sub:hover::after,body.ptdl-col-resizing th.ptdl-resizable-sub::after{box-shadow:inset -2px 0 0 var(--ptdl-resize-accent,#1677ff)}`;
  document.head.appendChild(s);
}

/**
 * Resizable header cell for MAIN tables. antd merges `onHeaderCell()`'s return with the default <th> props
 * and passes them here, so we read our `ptdl*` handlers and render a right-edge grab strip; everything else
 * spreads to <th>. Dragging calls `ptdlOnResize(w)` (rAF-throttled) and, on release, `ptdlOnResizeStop(w)`.
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
    if (typeof localStorage === 'undefined') return false;
    // The UI-editor flag is stored as "1" (not "true") → be truthy-tolerant.
    const v = localStorage.getItem('NOCOBASE_V2_FLOW_SETTINGS_ENABLED');
    return !!v && v !== 'false' && v !== '0';
  } catch (_) {
    return false;
  }
}

// field-name → column sub-model (main table) for the live props.width drive.
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

// MAIN table: apply persisted widths (all viewers) + attach resize handlers (editor only) to a column list.
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

// =================================================================================================
// SUB-TABLE DOM RESIZE (identity-independent) ------------------------------------------------------
// =================================================================================================

const SUB_LS_KEY = 'ptdlSubColWidths'; // localStorage store: { [domKey]: width }

function domReadStore(): Record<string, number> {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(SUB_LS_KEY) : null;
    const o = raw ? JSON.parse(raw) : null;
    return o && typeof o === 'object' ? o : {};
  } catch (_) { return {}; }
}
function domWriteStore(map: Record<string, number>): void {
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(SUB_LS_KEY, JSON.stringify(map)); } catch (_) { /* ignore */ }
}

// A header cell we should handle in the DOM path. Eligible = a thead <th> that is NOT the main-table handle
// (`.ptdl-resizable-th`, already resizable via the model patch) and NOT a fixed / selection column.
function domEligibleTh(th: any): boolean {
  try {
    if (!th || !th.classList || th.tagName !== 'TH') return false;
    if (th.classList.contains('ptdl-resizable-th')) return false; // main table — handled by the model path
    if (th.classList.contains('ant-table-cell-fix-left') || th.classList.contains('ant-table-cell-fix-right')) return false;
    if (th.classList.contains('ant-table-selection-column')) return false;
    return true;
  } catch (_) { return false; }
}

// Column index of a th within its header row.
function domColIndex(th: any): number {
  try {
    if (typeof th.cellIndex === 'number' && th.cellIndex >= 0) return th.cellIndex;
    const row = th.parentNode;
    return row ? Array.prototype.indexOf.call(row.children, th) : -1;
  } catch (_) { return -1; }
}

// Force a sub-table column to EXACTLY `w` px: set the <col> width AND — because the core-configured column
// width behaves as a MIN-width floor (the <col> alone won't shrink below it) — cap the th + EVERY td at this
// index with `min-width:0; max-width:w; width:w; overflow:hidden`. This is the exact recipe the user verified
// shrinks a content column. Applied live each rAF frame and in the re-apply pass. (`th` param unused — the
// thead row iteration already covers the header cell.)
function domSetColWidth(tableRoot: any, colIndex: number, w: number, _th?: any): void {
  try {
    if (!tableRoot || colIndex < 0) return;
    const px = w + 'px';
    const colgroups = tableRoot.querySelectorAll('colgroup');
    colgroups.forEach((cg: any) => {
      const col = cg.children && cg.children[colIndex];
      if (col) col.style.width = px;
    });
    const rows = tableRoot.querySelectorAll('.ant-table-thead > tr, .ant-table-tbody > tr');
    rows.forEach((row: any) => {
      const cell = row.children && row.children[colIndex];
      if (!cell || !cell.style) return;
      cell.style.minWidth = '0';
      cell.style.maxWidth = px;
      cell.style.width = px;
      cell.style.overflow = 'hidden';
    });
  } catch (_) { /* ignore */ }
}

// Proactively let a column shrink on the FIRST inward drag: remove the min-width floor + clip overflow on its
// cells (NO max-width, so current width / enlarge are unaffected). Applied to eligible columns in the observer.
function domPrimeColumn(tableRoot: any, colIndex: number): void {
  try {
    if (!tableRoot || colIndex < 0) return;
    const rows = tableRoot.querySelectorAll('.ant-table-thead > tr, .ant-table-tbody > tr');
    rows.forEach((row: any) => {
      const cell = row.children && row.children[colIndex];
      if (cell && cell.style) { cell.style.minWidth = '0'; cell.style.overflow = 'hidden'; }
    });
  } catch (_) { /* ignore */ }
}

// After authoritative model-width persistence, drop our inline width CAPS (max-width/width) on the cells so
// the column MODEL's width fully drives the render (keeps the core "Column width" control working). Runs the
// frame AFTER the model re-render, so there's no flash (both equal `w`). min-width:0 + overflow are kept.
function domClearForce(tableRoot: any, colIndex: number): void {
  try {
    if (!tableRoot || colIndex < 0) return;
    const rows = tableRoot.querySelectorAll('.ant-table-thead > tr, .ant-table-tbody > tr');
    rows.forEach((row: any) => {
      const cell = row.children && row.children[colIndex];
      if (cell && cell.style) { cell.style.maxWidth = ''; cell.style.width = ''; }
    });
  } catch (_) { /* ignore */ }
}

// Make a resized sub-table column REFLOW correctly, addressing two content-tracking problems:
//   (1) SHRINK was blocked below the content's min-width → force `overflow:hidden` + `min-width:0` on the
//       cell (th + every td at this index) so the column can shrink past its content, clipping with "…".
//   (2) WIDEN didn't reveal more text → each cell's content sits in a FIXED-width wrapper (native MemoCell
//       `<div style="width:<col>px">`; header title `<div css="width:calc(<col>px - 16px)">`), which ignores
//       our <col> resize. Both wrappers carry white-space:nowrap + text-overflow:ellipsis, so we detect them
//       by COMPUTED style (structure-agnostic — works for the native cell AND any Sub-table Pro variant) and
//       make them FLUID (`width:100%`) so they track the actual cell width. Each element is checked once
//       (`__ptdlChecked`) to keep the MutationObserver re-apply pass cheap; new wrappers (after re-render)
//       are unmarked and get re-fluidised.
function domApplyFluid(tableRoot: any, colIndex: number): void {
  try {
    if (!tableRoot || colIndex < 0) return;
    const rows = tableRoot.querySelectorAll('.ant-table-thead > tr, .ant-table-tbody > tr');
    rows.forEach((row: any) => {
      const cell = row.children && row.children[colIndex];
      if (!cell || !cell.style || !cell.querySelectorAll) return;
      cell.style.overflow = 'hidden';
      cell.style.minWidth = '0';
      // Locate the deepest nowrap+ellipsis CLIP element (native MemoCell / header title). Cache it on the
      // cell so the getComputedStyle scan only runs on cache-miss (first time + after React/emotion
      // regenerates the cell), keeping the per-observer-tick cost low.
      let ellip: any = cell.__ptdlEllip;
      if (!ellip || !ellip.isConnected || !cell.contains(ellip)) {
        ellip = null;
        const divs = cell.querySelectorAll('div');
        for (let i = 0; i < divs.length; i++) {
          const d = divs[i];
          let cs: any = null;
          try { cs = typeof getComputedStyle !== 'undefined' ? getComputedStyle(d) : null; } catch (_) { cs = null; }
          if (cs && cs.whiteSpace === 'nowrap' && cs.textOverflow === 'ellipsis') { ellip = d; break; }
        }
        cell.__ptdlEllip = ellip;
      }
      if (ellip) {
        // Keep the clip element clipping…
        ellip.style.width = '100%';
        ellip.style.maxWidth = '100%';
        ellip.style.overflow = 'hidden';
        ellip.style.textOverflow = 'ellipsis';
        ellip.style.whiteSpace = 'nowrap';
        // …and fluidise the ENTIRE wrapper chain from the clip element UP to the cell — the intermediate
        // FIXED-width divs (e.g. the ~Npx whiteSpace:normal wrapper) otherwise pin the width and block reflow.
        let p: any = ellip.parentElement;
        let guard = 0;
        while (p && p !== cell && guard < 8) {
          if (p.tagName === 'DIV' && p.style) { p.style.width = '100%'; p.style.maxWidth = '100%'; }
          p = p.parentElement;
          guard++;
        }
      } else {
        // Fallback (no clip element, e.g. some editable cells): fluidise wrapper divs with a fixed inline px width.
        const divs = cell.querySelectorAll('div');
        for (let i = 0; i < divs.length && i < 6; i++) {
          const d = divs[i];
          if (d.style && typeof d.style.width === 'string' && d.style.width.indexOf('px') >= 0) { d.style.width = '100%'; d.style.maxWidth = '100%'; }
        }
      }
    });
  } catch (_) { /* crash-safe */ }
}

// Stable-enough persistence key from DOM context (+ header text) — best-effort, survives typical re-renders.
function domKey(th: any, tableRoot: any, colIndex: number): string {
  try {
    const path = (typeof location !== 'undefined' && location.pathname) || '';
    const row = th.parentNode;
    const colCount = row ? row.children.length : 0;
    const text = String(th.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 32);
    return path + '||' + colCount + '||' + colIndex + '||' + text;
  } catch (_) { return ''; }
}

// React-fiber helpers — used only to reach the owning FlowModel for BEST-EFFORT shared persistence. Reaching
// a live INSTANCE via fiber is fine (it's the real instance, not a class), so no identity problem here.
function domFiberOf(node: any): any {
  try {
    for (const k in node) {
      if (k.indexOf('__reactFiber$') === 0 || k.indexOf('__reactInternalInstance$') === 0) return node[k];
    }
  } catch (_) { /* ignore */ }
  return null;
}
// Reach the sub-table COLUMN MODEL from a header <th> via the React fiber. The header renders
// `<Droppable model={columnModel}>` / `<FlowsFloatContextMenu model={columnModel}>`, so the column model is a
// `props.model` up the fiber chain. Reaching a live INSTANCE is identity-safe (unlike patching a class). The
// column model exposes getColumnProps + the `width` prop/stepParams that the core "Column width" control uses.
function domReachColumnModel(th: any): any {
  try {
    let fiber = domFiberOf(th);
    let depth = 0;
    while (fiber && depth < 60) {
      const p = fiber.memoizedProps;
      const m = p && p.model;
      if (
        m &&
        typeof m.setProps === 'function' &&
        typeof m.setStepParams === 'function' &&
        typeof m.save === 'function' &&
        (typeof m.getColumnProps === 'function' || (m.props && m.props.dataIndex != null))
      ) {
        return m;
      }
      fiber = fiber.return;
      depth++;
    }
  } catch (_) { /* ignore */ }
  return null;
}

// Persist the resized width. PREFERRED = set the column MODEL's width exactly like the core "Column width"
// control (stepParams `subTableColumnSettings.width` + props.width + save) — authoritative, shared, survives
// antd re-renders (no snap-back), persists on reopen, and stays compatible with the core control. FALLBACK
// (model unreachable) = localStorage keyed by the DOM key, re-applied by the observer. Returns true when the
// model was set (caller then drops the inline force so the model drives).
function domPersist(th: any, tableRoot: any, colIndex: number, w: number): boolean {
  let modelOk = false;
  try {
    const cm = domReachColumnModel(th);
    if (cm) {
      try { cm.setStepParams('subTableColumnSettings', 'width', { width: w }); } catch (_) { /* ignore */ }
      try { cm.setProps('width', w); } catch (_) { /* ignore */ }
      try { if (typeof cm.save === 'function') cm.save(); } catch (_) { /* ignore */ }
      modelOk = true;
    }
  } catch (_) { /* ignore */ }
  if (!modelOk) {
    try { const key = domKey(th, tableRoot, colIndex); if (key) { const store = domReadStore(); store[key] = w; domWriteStore(store); } } catch (_) { /* ignore */ }
  }
  return modelOk;
}

// Document-level mousedown (capture): begin a sub-table column drag ONLY when the pointer lands in a header
// cell's right-edge grab zone — so normal header clicks / drag-reorder / settings still work everywhere else.
function domOnMouseDown(e: MouseEvent): void {
  try {
    if (!e || e.button !== 0 || !isEditorOn(null)) return;
    const target = e.target as any;
    if (!target || typeof target.closest !== 'function') return;
    const th = target.closest('.ant-table-thead th');
    if (!th || !domEligibleTh(th)) return;
    const rect = th.getBoundingClientRect();
    if (e.clientX < rect.right - EDGE_ZONE) return; // not in the grab zone → let the event through
    const tableRoot = th.closest('.ant-table');
    const colIndex = domColIndex(th);
    if (!tableRoot || colIndex < 0) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = rect.width;
    if (typeof document !== 'undefined') document.body.classList.add('ptdl-col-resizing');
    domApplyFluid(tableRoot, colIndex);            // wrappers fluid so text tracks the drag
    domSetColWidth(tableRoot, colIndex, startW);   // prime the force NOW so the first inward move already shrinks
    let lastW = startW;
    let raf = 0;
    const flush = () => { raf = 0; domSetColWidth(tableRoot, colIndex, lastW); };
    const onMove = (ev: MouseEvent) => {
      lastW = Math.max(MIN_W, Math.round(startW + (ev.clientX - startX)));
      if (!raf && typeof requestAnimationFrame !== 'undefined') raf = requestAnimationFrame(flush);
      else if (typeof requestAnimationFrame === 'undefined') flush();
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove, true);
      document.removeEventListener('mouseup', onUp, true);
      if (raf && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(raf);
      if (typeof document !== 'undefined') document.body.classList.remove('ptdl-col-resizing');
      domSetColWidth(tableRoot, colIndex, lastW); // final
      // Authoritative persistence: set the column MODEL width (like the core control). On success, drop the
      // inline caps next frame (after the model re-render) so the model drives; else keep them (localStorage
      // + observer re-apply is the fallback).
      const modelOk = domPersist(th, tableRoot, colIndex, lastW);
      if (modelOk && typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(() => domClearForce(tableRoot, colIndex));
    };
    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('mouseup', onUp, true);
  } catch (_) { /* crash-safe — sub-table renders untouched */ }
}

// Tag eligible header cells (affordance, editor-only) + re-apply any persisted widths (all viewers). Runs on
// a throttled MutationObserver pass and once on arm. Reading `.ant-table-thead` broadly is cheap.
function domTagAndReapply(root: any): void {
  try {
    const scope = root && typeof root.querySelectorAll === 'function' ? root : document;
    const editable = isEditorOn(null);
    const store = domReadStore();
    const hasStore = store && Object.keys(store).length > 0;
    const theads = scope.querySelectorAll('.ant-table-thead');
    theads.forEach((thead: any) => {
      const tableRoot = thead.closest ? thead.closest('.ant-table') : null;
      const ths = thead.querySelectorAll('tr th');
      ths.forEach((th: any) => {
        if (!domEligibleTh(th)) return;
        const idx = domColIndex(th);
        if (!tableRoot || idx < 0) return;
        if (editable && th.classList && !th.classList.contains('ptdl-resizable-sub')) th.classList.add('ptdl-resizable-sub');
        if (editable) domPrimeColumn(tableRoot, idx); // ready the FIRST inward drag
        const stored = hasStore ? store[domKey(th, tableRoot, idx)] : undefined;
        // Keep the wrapper CHAIN fluid so content tracks the cell width — React/emotion re-renders regenerate
        // the fixed-width middle divs, so re-fluidise every tick (cached ellipsis lookup keeps it cheap).
        if (editable || stored != null) domApplyFluid(tableRoot, idx);
        if (stored != null) domSetColWidth(tableRoot, idx, stored); // localStorage-fallback re-force
      });
    });
  } catch (_) { /* ignore */ }
}

let _domArmed = false;
function armDomSubResize(): void {
  if (_domArmed || typeof document === 'undefined') return;
  _domArmed = true;
  try {
    // The drag itself — the one listener that MUST work. Capture phase so we can intercept in the grab zone.
    document.addEventListener('mousedown', domOnMouseDown, true);
    // Cheap affordance tagging on hover (in case the observer hasn't tagged yet).
    document.addEventListener(
      'mouseover',
      (e: any) => {
        try {
          if (!isEditorOn(null)) return;
          const th = e?.target?.closest?.('.ant-table-thead th');
          if (th && domEligibleTh(th) && th.classList && !th.classList.contains('ptdl-resizable-sub')) th.classList.add('ptdl-resizable-sub');
        } catch (_) { /* ignore */ }
      },
      true,
    );
    // Throttled observer: tag new sub-table headers + re-apply persisted widths as tables (re)render.
    if (typeof MutationObserver !== 'undefined') {
      let scheduled = false;
      const run = () => { scheduled = false; domTagAndReapply(document); };
      const obs = new MutationObserver(() => {
        if (scheduled) return;
        scheduled = true;
        if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(run);
        else setTimeout(run, 50);
      });
      obs.observe(document.body, { childList: true, subtree: true });
    }
    // Re-tag when the UI editor is toggled on/off.
    try { window.addEventListener('nocobase:v2:flow-settings-preference-change', () => domTagAndReapply(document)); } catch (_) { /* ignore */ }
    domTagAndReapply(document); // initial pass for already-rendered tables
  } catch (_) { /* crash-safe */ }
}

// =================================================================================================

export function registerColumnResize({ flowEngine }: { flowEngine: any }): void {
  if (!flowEngine || typeof flowEngine.getModelClass !== 'function') return;
  try { (window as any).__ptdlCR = CR_VERSION; } catch (_) { /* ignore */ } // version beacon (console: window.__ptdlCR)
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
  const patchGetColumns = (proto: any, applyFn: (owner: any, cols: any[]) => void) => {
    if (!proto || proto.__ptdlResizePatched || typeof proto.getColumns !== 'function') return;
    const orig = proto.getColumns;
    proto.getColumns = function (...args: any[]) {
      const cols = orig.apply(this, args) || [];
      try { if (Array.isArray(cols)) applyFn(this, cols); } catch (_) { /* crash-safe */ }
      return cols;
    };
    proto.__ptdlResizePatched = true;
  };

  // --- MAIN table (TableBlockModel): getColumns + header.cell via this.components (renderComponent wrap). UNCHANGED. ---
  regFlow(TableBlockModel);
  patchGetColumns(TableBlockModel.prototype, applyResizeToColumns);
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

  // --- SUB-TABLES: DOM path (identity-independent — the model patch can't reach re-registered subclasses). ---
  armDomSubResize();
  crlog('DOM sub-resize armed');
}
