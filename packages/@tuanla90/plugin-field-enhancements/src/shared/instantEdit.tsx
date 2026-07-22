import React from 'react';
import { Select, Switch, Input, InputNumber, DatePicker, TimePicker, theme } from 'antd';
import dayjs from 'dayjs';
import { registerFlowComponentsOnce, fieldItem as fi, rx } from '@tuanla90/shared';
import { resolveCf, quickInlineSave } from './inlineQuickEdit';

/**
 * BLOCK-LEVEL "Instant edit" for /v/ tables (flow-engine). When ON for a Table block, EVERY eligible column's
 * cell becomes editable on a SINGLE click — no pencil, no edit button — with a per-column opt-out (columns the
 * user chooses to keep read-only). This is NOT a spreadsheet (no keyboard nav / fill-down / freeze) — just
 * "click cell → edit → save", reusing the field's own editor.
 *
 * HOW (HYBRID — reuse the framework, don't reinvent editors):
 *   Each eligible column is routed once (in a patched `TableColumnModel.getColumnProps`) to one of:
 *     • 'inline'  → a LITERAL antd input mounted in the cell (safe scalars: text/number/percent/boolean/
 *                   select/multiselect/date/time) — save on blur/Enter, Esc reverts, persisted via the shared
 *                   `quickInlineSave` (optimistic + rollback + toast). Sub-toggle `ptdlIeInline` (default ON).
 *     • 'popover' → the native `QuickEditFormModel.open(...)` popover (any other editable field; also when
 *                   the sub-toggle is OFF). `getColumnProps` injects `editable:true` + a single-click `onClick`
 *                   that the native `components.body.cell` (EditableCell) spreads onto the <td>; pencil hidden.
 *     • 'skip'    → not editable (pk/timestamps/computed/excluded) → native display, untouched.
 *   The route is carried to the body cell via an `onCell` marker (`ptdlIeRoute`). A per-block
 *   `components.body.cell` override mounts the inline editor for 'inline' cells and passes every other cell
 *   straight through to the native EditableCell.
 *
 *   Our OWN inline widgets (star / progress / rich-select / button-group, 0.2.26) already edit in-cell; they
 *   route to 'skip' here and self-activate through the enhanced `isQuickEditCell()` (which reads the block flag).
 *
 * COMPOSES: we wrap `getColumnProps().onCell` (call through the previous) so conditional-format's onCell
 * cell-styling still merges, and we override `components.body.cell` while column-resize overrides
 * `components.header.cell` (different key). CRASH-SAFE: every path is wrapped; any failure falls back to the
 * native cell / popover / display — never white-screen. Lane: /v/ only (guarded on TableBlockModel).
 */

export const IE_VERSION = '0.2.29';
export const IE_FLAG = 'ptdlIeEnabled';
export const IE_EXCLUDED = 'ptdlIeExcluded';
export const IE_INLINE = 'ptdlIeInline'; // sub-toggle: literal in-cell input for simple fields (default ON)

function ielog(msg: string, obj?: any): void {
  try {
    if (typeof console === 'undefined') return;
    // DEBUG-GATED: silent unless explicitly enabled — this used to log unconditionally and spam the console.
    // Enable with `window.__ptdlIeDebug = true` or localStorage['ptdl:ie:debug']='1'.
    let dbg = false;
    try {
      dbg = (typeof window !== 'undefined' && (window as any).__ptdlIeDebug === true) ||
        (typeof localStorage !== 'undefined' && localStorage.getItem('ptdl:ie:debug') === '1');
    } catch (_) { /* ignore */ }
    if (!dbg) return;
    if (obj !== undefined) console.log('[ptdl-ie] ' + msg, obj);
    else console.log('[ptdl-ie] ' + msg);
  } catch (_) { /* ignore */ }
}

// Field-model class names of OUR inline-self-editing widgets (0.2.26). Class names are NOT minified in this
// build (cond-fmt relies on the same), so a name check is reliable. For these columns we let the widget
// handle the click (it self-activates via isQuickEditCell reading the block flag) — no popover onClick.
const SELF_EDIT_MODELS = new Set([
  'PtdlStarDisplayFieldModel', 'PtdlProgressDisplayFieldModel',
  'PtdlRichSelectDisplayFieldModel', 'PtdlSelectButtonsDisplayFieldModel',
  // the editable variants too (in case a block binds the editable model directly)
  'PtdlStarFieldModel', 'PtdlProgressFieldModel', 'PtdlRichSelectFieldModel', 'PtdlSelectButtonsFieldModel',
]);

// Interfaces that are inherently non-editable (system / computed) → never offered for inline edit.
const SKIP_INTERFACES = new Set([
  'id', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy',
  'formula', 'sequence', 'uuid', 'nanoid', 'snapshot', 'tableoid',
]);

// Walk up to the owning TableBlockModel (class names aren't minified). Fallback to context.blockModel.
function walkToBlock(model: any): any {
  for (let cur: any = model, i = 0; cur && i < 10; cur = cur.parent, i++) {
    if (cur?.constructor?.name === 'TableBlockModel') return cur;
  }
  return model?.context?.blockModel || null;
}

function selfEditWidget(colModel: any): boolean {
  const name = colModel?.subModels?.field?.constructor?.name;
  return !!name && SELF_EDIT_MODELS.has(name);
}

// Best-effort client ACL check — fail-open (the server enforces update ACL and a 403 surfaces natively).
function aclAllowsUpdate(block: any, collectionName?: string): boolean {
  try {
    const app = block?.flowEngine?.context?.app || block?.context?.app;
    const acl = app?.acl;
    if (acl && typeof acl.can === 'function' && collectionName) {
      const r = acl.can({ resource: collectionName, action: 'update' });
      if (r === false || r === null) return false;
    }
  } catch (_) { /* fail open */ }
  return true;
}

// Is this column an editable data field (not pk / timestamp / audit / computed / explicitly read-only)?
function isEligibleField(colModel: any, field: string | undefined): boolean {
  if (!field) return false;
  const cf = resolveCf(colModel);
  if (!cf) return false;
  if (cf.primaryKey === true) return false;
  const pk = cf.collection?.filterTargetKey;
  if (cf.name === 'id' || (typeof pk === 'string' && cf.name === pk)) return false;
  const iface = cf.interface;
  if (!iface || SKIP_INTERFACES.has(iface)) return false;
  try { if (cf.uiSchema && cf.uiSchema['x-read-pretty'] === true) return false; } catch (_) { /* ignore */ }
  return true;
}

// The field name a column edits — the real collectionField name (robust for relations, unlike a joined dataIndex).
function fieldOf(colModel: any): string | undefined {
  return resolveCf(colModel)?.name;
}

// Open the native quick-edit popover for one cell and sync the block resource on success (mirrors the native
// EditableCell handler). Never throws.
async function openInstantEdit(e: any, block: any, colModel: any, field: string, record: any, recordIndex: any): Promise<void> {
  try {
    // Let genuinely interactive children (links/inputs/selects/our widgets) handle their own clicks.
    const tgt = e?.target;
    if (tgt && typeof tgt.closest === 'function' &&
      tgt.closest('a,button,input,textarea,select,.ant-select,.ant-checkbox,.ant-switch,.ant-rate,[role="button"],[contenteditable="true"]')) {
      return;
    }
    e?.preventDefault?.();
    e?.stopPropagation?.();
    const flowEngine = block?.flowEngine || colModel?.flowEngine;
    const QEF: any = flowEngine?.getModelClass?.('QuickEditFormModel');
    const collection = block?.collection || colModel?.collection;
    if (!QEF?.open || !collection) { ielog('open skipped — QuickEditFormModel/collection unavailable', { field }); return; }
    ielog('popover edit', { field, recordIndex });
    const anchor = e?.currentTarget || tgt;
    await QEF.open({
      flowEngine,
      target: anchor,
      dataSourceKey: collection.dataSourceKey,
      collectionName: collection.name,
      fieldPath: field,
      filterByTk: collection.getFilterByTK ? collection.getFilterByTK(record) : (record?.id),
      record,
      fieldProps: { ...(colModel?.props || {}), ...(colModel?.subModels?.field?.props || {}) },
      sourceFieldModelUid: colModel?.subModels?.field?.uid,
      onSuccess: (values: any) => {
        try {
          if (values && Object.prototype.hasOwnProperty.call(values, field)) record[field] = values[field];
          const res = block?.resource;
          if (res) {
            if (typeof recordIndex === 'number' && typeof res.setItem === 'function') res.setItem(recordIndex, record);
            res.emit?.('refresh');
          }
          try { colModel?.rerender?.(); } catch (_) { /* ignore */ }
        } catch (_) { /* optimistic sync best-effort */ }
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[ptdl-ie] open failed (ignored)', err);
  }
}

// ---- HYBRID in-cell editing (0.2.29) ------------------------------------------------------------
// For SAFE SCALAR columns, a single click mounts a LITERAL antd input in the cell (save on blur/Enter,
// Esc reverts) instead of the popover — reusing `quickInlineSave` for persistence. Everything else keeps
// the native QuickEditFormModel popover. The per-column route ('inline' | 'popover' | 'skip') is decided
// ONCE in getColumnProps and passed to the cell via an onCell marker (fast; composes with cond-fmt onCell).

// Text-like interfaces → a plain <Input>.
const TEXT_IFACES = new Set(['input', 'singleLineText', 'email', 'phone', 'url']);

function enumOptions(cf: any): { value: any; label: any }[] {
  const e = cf?.uiSchema?.enum || cf?.enum;
  if (!Array.isArray(e)) return [];
  return e.map((o: any) => (o && typeof o === 'object') ? { value: o.value, label: o.label ?? o.value } : { value: o, label: String(o) });
}

// Which literal input (if any) a field maps to. `fallback` = a reason it stays on the popover (logged once).
function inlineKind(cf: any): { kind?: string; fallback?: string } {
  const i = cf?.interface;
  if (!i) return { fallback: 'no-interface' };
  if (cf.unique === true) return { fallback: 'unique' }; // conservative: let the popover + server own uniqueness
  if (TEXT_IFACES.has(i)) return { kind: 'text' };
  if (i === 'integer' || i === 'number') return { kind: 'number' };
  if (i === 'percent') return { kind: 'percent' };
  if (i === 'checkbox' || i === 'boolean') return { kind: 'boolean' };
  if (i === 'select' || i === 'radioGroup') return enumOptions(cf).length ? { kind: 'select' } : { fallback: 'no-enum' };
  if (i === 'multipleSelect' || i === 'checkboxGroup') return enumOptions(cf).length ? { kind: 'multiselect' } : { fallback: 'no-enum' };
  if (i === 'datetime') return { kind: 'datetime' };
  if (i === 'date') return { kind: 'date' };
  if (i === 'time') return { kind: 'time' };
  return { fallback: 'not-whitelisted' };
}

const _ieFallbackLogged = new Set<string>();
function logFallbackOnce(block: any, field: string, reason: string): void {
  try {
    const key = `${block?.uid || ''}:${field}:${reason}`;
    if (_ieFallbackLogged.has(key)) return;
    _ieFallbackLogged.add(key);
    ielog('inline fallback→popover', { field, reason });
  } catch (_) { /* ignore */ }
}

// Per-column routing decision. 'skip' = not editable (native display); 'inline' = literal in-cell input;
// 'popover' = native QuickEditFormModel. Reads the block flags (reactive → toggling re-renders).
function routeCell(colModel: any, block: any, field?: string): 'inline' | 'popover' | 'skip' {
  if (!field || !block) return 'skip';
  if (block.props?.[IE_FLAG] !== true) return 'skip';
  const excluded: string[] = Array.isArray(block.props?.[IE_EXCLUDED]) ? block.props[IE_EXCLUDED] : [];
  if (excluded.includes(field)) return 'skip';
  if (selfEditWidget(colModel)) return 'skip'; // our own widgets edit in-cell themselves
  if (!isEligibleField(colModel, field)) return 'skip';
  if (!aclAllowsUpdate(block, block.collection?.name)) return 'skip';
  if (block.props?.[IE_INLINE] !== false) { // sub-toggle default ON
    const k = inlineKind(resolveCf(colModel));
    if (k.kind) return 'inline';
    if (k.fallback) logFallbackOnce(block, field, k.fallback);
  }
  return 'popover';
}

// stored (DB) value → editor value.
function fromStored(iface: string, v: any): any {
  if (iface === 'percent') return v == null || v === '' ? null : Math.round(Number(v) * 10000) / 100; // 0–1 → 0–100
  if (iface === 'date' || iface === 'datetime' || iface === 'time') return v ? dayjs(v) : null;
  if (iface === 'checkbox' || iface === 'boolean') return !!v;
  return v;
}
// editor value → stored (DB) value.
function toStored(iface: string, raw: any): any {
  if (iface === 'percent') return raw == null || raw === '' ? null : Number(raw) / 100;
  if (iface === 'integer' || iface === 'number') return raw == null || raw === '' ? null : Number(raw);
  if (iface === 'datetime') return raw ? dayjs(raw).toISOString() : null;
  if (iface === 'date') return raw ? dayjs(raw).format('YYYY-MM-DD') : null;
  if (iface === 'time') return raw ? dayjs(raw).format('HH:mm:ss') : null;
  return raw;
}

// The literal in-cell editor. Autofocus; Enter/blur → save (quickInlineSave optimistic + rollback + toast);
// Esc → revert (a done-guard stops a blur-after-Esc from saving). Select/date/boolean commit on change.
// CRASH-SAFE: quickInlineSave never throws; an unknown kind just closes.
function InlineCellEditor({ model, cf, field, record, onClose }: {
  model: any; cf: any; field: string; record: any; onClose: () => void;
}) {
  const iface: string = cf?.interface || '';
  const kind = inlineKind(cf).kind || 'text';
  const [val, setVal] = React.useState<any>(() => fromStored(iface, record?.[field]));
  const doneRef = React.useRef(false);
  const finish = (save: boolean, raw?: any) => {
    if (doneRef.current) return;
    doneRef.current = true;
    if (save) {
      try {
        // model = COLUMN model (shared across rows) → its context.record isn't THIS row; pass the row + api.
        quickInlineSave(model, toStored(iface, raw), { record, api: model?.flowEngine?.context?.api });
      } catch (_) { /* quickInlineSave already rolls back + toasts */ }
    }
    onClose();
  };
  const onKeyDown = (e: any) => {
    if (e.key === 'Escape') { e.stopPropagation(); finish(false); }
    else if (e.key === 'Enter' && (kind === 'text' || kind === 'number' || kind === 'percent')) { e.stopPropagation(); finish(true, val); }
  };
  const wrapStyle: React.CSSProperties = { display: 'inline-flex', width: '100%', minWidth: 80 };

  let input: React.ReactNode = null;
  if (kind === 'number') {
    input = <InputNumber autoFocus size="small" value={val} onChange={(v: any) => setVal(v)} onBlur={() => finish(true, val)} style={{ width: '100%' }} />;
  } else if (kind === 'percent') {
    input = <InputNumber autoFocus size="small" value={val} min={0} max={100} onChange={(v: any) => setVal(v)} onBlur={() => finish(true, val)} style={{ width: '100%' }}
      formatter={(v: any) => (v == null || v === '' ? '' : `${v}%`)} parser={(v: any) => (v == null ? '' : String(v).replace('%', ''))} />;
  } else if (kind === 'boolean') {
    input = <Switch autoFocus checked={!!val} onChange={(c: any) => finish(true, c)} />;
  } else if (kind === 'select') {
    input = <Select autoFocus defaultOpen size="small" style={{ width: '100%' }} value={val ?? undefined} options={enumOptions(cf)} onChange={(v: any) => finish(true, v)} onBlur={() => finish(false)} showSearch optionFilterProp="label" />;
  } else if (kind === 'multiselect') {
    input = <Select autoFocus defaultOpen mode="multiple" size="small" style={{ width: '100%' }} value={Array.isArray(val) ? val : []} options={enumOptions(cf)} onChange={(v: any) => setVal(v)} onBlur={() => finish(true, val)} maxTagCount="responsive" showSearch optionFilterProp="label" />;
  } else if (kind === 'date' || kind === 'datetime') {
    input = <DatePicker autoFocus size="small" style={{ width: '100%' }} showTime={kind === 'datetime'} value={val} onChange={(d: any) => finish(true, d)} onOpenChange={(o: boolean) => { if (!o) finish(false); }} />;
  } else if (kind === 'time') {
    input = <TimePicker autoFocus size="small" style={{ width: '100%' }} value={val} onChange={(d: any) => finish(true, d)} onOpenChange={(o: boolean) => { if (!o) finish(false); }} />;
  } else {
    input = <Input autoFocus size="small" value={val ?? ''} onChange={(e: any) => setVal(e.target.value)} onBlur={() => finish(true, val)} style={{ width: '100%' }} />;
  }
  // Stop click propagation so interacting with the input doesn't re-trigger row/cell handlers.
  return <span onKeyDown={onKeyDown} onClick={(e: any) => e.stopPropagation()} style={wrapStyle}>{input}</span>;
}

// Per-block body-cell component (closes over the native cell + block). Renders the inline editor for
// inline-route cells; passes every other cell straight through to the native EditableCell (which keeps the
// popover onClick that getColumnProps injected). CRASH-SAFE: any error → native cell (never white-screen).
function makeInstantCell(NativeCell: any, block: any): React.FC<any> {
  const Cell: React.FC<any> = (props: any) => {
    const [editing, setEditing] = React.useState(false);
    const route = props?.ptdlIeRoute;
    if (route !== 'inline') {
      const { ptdlIeRoute, ptdlIeField, ...rest } = props || {};
      try { return NativeCell ? <NativeCell {...rest} /> : <td {...rest}>{rest.children}</td>; }
      catch (_) { return <td>{props?.children}</td>; }
    }
    try {
      const { ptdlIeRoute, ptdlIeField, editable, record, recordIndex, dataIndex, model, children, title, width, ...h } = props;
      const colModel = model;
      const field: string = ptdlIeField;
      const cf = resolveCf(colModel);
      if (editing) {
        return (
          <td {...h} className={[h.className, 'ptdl-ie-cell', 'ptdl-ie-editing'].filter(Boolean).join(' ')}>
            <InlineCellEditor model={colModel} cf={cf} field={field} record={record} onClose={() => setEditing(false)} />
          </td>
        );
      }
      const onEnter = (e: any) => {
        try {
          const tgt = e?.target;
          if (tgt?.closest?.('a,button,input,textarea,select,[role="button"],[contenteditable="true"]')) return;
          ielog('inline edit', { field, interface: cf?.interface });
          setEditing(true);
        } catch (_) { /* ignore */ }
      };
      const cls = [h.className, 'ptdl-ie-cell'].filter(Boolean).join(' ');
      return (
        <td {...h} className={cls} onClick={onEnter} style={{ cursor: 'pointer', ...(h.style || {}) }}>
          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{children}</div>
        </td>
      );
    } catch (_) {
      const { ptdlIeRoute, ptdlIeField, ...rest } = props || {};
      try { return NativeCell ? <NativeCell {...rest} /> : <td>{rest.children}</td>; }
      catch (__) { return <td>{props?.children}</td>; }
    }
  };
  try { Object.defineProperty(Cell, 'name', { value: 'PtdlInstantEditCell' }); } catch (_) { /* ignore */ }
  return Cell;
}

// Hide the native pencil inside an Instant-edit cell + show the pointer affordance (the native hover bg stays).
function ensureCss(): void {
  try {
    if (typeof document === 'undefined' || document.getElementById('ptdl-ie-css')) return;
    const s = document.createElement('style');
    s.id = 'ptdl-ie-css';
    s.textContent = '.ant-table-tbody>tr>td.ptdl-ie-cell .edit-icon{display:none!important}'
      + '.ant-table-tbody>tr>td.ptdl-ie-cell{cursor:pointer}'
      + '.ant-table-tbody>tr>td.ptdl-ie-editing{padding-top:2px!important;padding-bottom:2px!important}';
    document.head.appendChild(s);
  } catch (_) { /* ignore */ }
}

// ---- settings components ------------------------------------------------------------------------
// Dialogs render in a portal (escapes the ConfigProvider CSS scope), so antd's `--ant-*`/`--color*` CSS vars
// DON'T resolve there → `var(--color…)` fell back to a light literal (invisible text in dark mode). Read the
// LIVE token values via `theme.useToken()` and apply them directly (same fix the canonical GlobalWidgetToggle
// already uses) so every piece of text/box is correct in BOTH light and dark. The title needs an EXPLICIT
// `token.colorText` — without it the switch label inherited an unreadable colour (the reported bug).
const IeToggle = (props: any) => {
  const on = !!props.value;
  const { token } = theme.useToken();
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10,
      background: on ? token.colorPrimaryBg : token.colorFillQuaternary,
      border: `1px solid ${on ? token.colorPrimaryBorder : token.colorBorderSecondary}`,
      transition: 'background 0.2s, border-color 0.2s',
    }}>
      <Switch checked={on} onChange={(c: any) => props.onChange?.(c)} />
      <div style={{ lineHeight: 1.35, minWidth: 0 }}>
        <div style={{ fontWeight: 500, fontSize: 13, color: token.colorText }}>{props.title}</div>
        {props.hint ? <div style={{ fontSize: 12, color: token.colorTextTertiary, marginTop: 2 }}>{props.hint}</div> : null}
      </div>
    </div>
  );
};
const IeExcludeSelect = (props: any) => (
  <Select
    mode="multiple" allowClear showSearch optionFilterProp="label" style={{ width: '100%' }}
    placeholder={props.placeholder} value={props.value || []} onChange={(v: any) => props.onChange?.(v)}
    options={props.columns || []} maxTagCount="responsive"
  />
);

export function registerInstantEdit(deps: {
  flowEngine: any; flowSettings?: any; tExpr?: (s: string, o?: any) => any;
}): void {
  const { flowEngine, flowSettings } = deps;
  if (!flowEngine || typeof flowEngine.getModelClass !== 'function') return;
  try { (window as any).__ptdlInstantEdit = IE_VERSION; } catch (_) { /* ignore */ }

  const TableBlockModel: any = flowEngine.getModelClass('TableBlockModel');
  const TableColumnModel: any = flowEngine.getModelClass('TableColumnModel');
  ielog('register v' + IE_VERSION + ' TableBlockModel=' + !!TableBlockModel + ' TableColumnModel=' + !!TableColumnModel);
  if (!TableBlockModel || !TableColumnModel) return; // classic lane — no /v/ table models
  ensureCss();
  const t = (s: string) => (deps.tExpr ? deps.tExpr(s, { ns: 'field-enhancements' }) : s);

  if (flowSettings?.registerComponents) {
    try { registerFlowComponentsOnce(flowSettings, { PtdlIeToggle: IeToggle, PtdlIeExclude: IeExcludeSelect }); }
    catch (e) { /* eslint-disable-next-line no-console */ console.warn('[ptdl-ie] register components failed', e); }
  }

  // 1) Patch TableColumnModel.getColumnProps → decide the per-column route ONCE and wrap onCell to carry it
  //    (marker `ptdlIeRoute`) to the body cell. For 'popover' also inject editable + the single-click handler
  //    (the native EditableCell reads them); 'inline' is handled by the body-cell override below. CRASH-SAFE.
  const colProto = TableColumnModel.prototype;
  if (!colProto.__ptdlIePatched && typeof colProto.getColumnProps === 'function') {
    const orig = colProto.getColumnProps;
    colProto.getColumnProps = function (...args: any[]) {
      const col: any = orig.apply(this, args);
      try {
        if (!col) return col;
        const colModel = this;
        const block = walkToBlock(colModel);
        const field = fieldOf(colModel);
        const route = routeCell(colModel, block, field);
        if (route === 'skip') return col; // native display — no changes

        const prevOnCell = col.onCell;
        if (prevOnCell && (prevOnCell as any).__ptdlIe) return col; // already wrapped this col object
        const wrapped = (record: any, recordIndex: any) => {
          const base = prevOnCell ? (prevOnCell.call(this, record, recordIndex) || {}) : {};
          const out: any = { ...base, ptdlIeRoute: route, ptdlIeField: field };
          if (route === 'popover') {
            out.editable = true; // native EditableCell renders the editable <td>; pencil hidden via CSS
            out.className = [base.className, 'ptdl-ie-cell'].filter(Boolean).join(' ');
            out.onClick = (e: any) => { openInstantEdit(e, block, colModel, field as string, record, recordIndex); };
          }
          return out;
        };
        (wrapped as any).__ptdlIe = true;
        col.onCell = wrapped;
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[ptdl-ie] getColumnProps wrap failed (ignored)', e);
      }
      return col;
    };
    colProto.__ptdlIePatched = true;
    ielog('getColumnProps PATCHED');
  }

  // 1b) Override the block's `components.body.cell` with a per-block wrapper that mounts the literal in-cell
  //     editor for 'inline'-route cells and passes everything else to the native cell (which handles the
  //     popover route + all structural cells). Composes with column-resize (it wraps `components.header.cell`;
  //     different key). The wrapper component is cached per block (`__ptdlIeCell`) for a STABLE React identity
  //     (a fresh component each render would remount every cell). CRASH-SAFE.
  const tbProto = TableBlockModel.prototype;
  if (!tbProto.__ptdlIeRender) {
    const origRender = tbProto.renderComponent;
    if (typeof origRender === 'function') {
      tbProto.renderComponent = function (...a: any[]) {
        try {
          const c = this.components;
          const nativeCell = c?.body?.cell;
          if (nativeCell && nativeCell !== this.__ptdlIeCell) {
            if (this.__ptdlIeNativeCell !== nativeCell) {
              this.__ptdlIeNativeCell = nativeCell;
              this.__ptdlIeCell = makeInstantCell(nativeCell, this);
            }
            this.components = { ...c, body: { ...c.body, cell: this.__ptdlIeCell } };
          }
        } catch (_) { /* render native */ }
        return origRender.apply(this, a);
      };
      tbProto.__ptdlIeRender = true;
    }
  }

  // 2) Block-level setting (⚙ menu of the Table block): switch + per-column opt-out (keep read-only).
  if (TableBlockModel.__ptdlIeFlow) return;
  try {
    TableBlockModel.__ptdlIeFlow = true;
    TableBlockModel.registerFlow({
      key: 'ptdlInstantEdit',
      sort: 660,
      title: t('Instant edit'),
      steps: {
        settings: {
          title: t('Instant edit'),
          uiMode: { type: 'dialog', props: { width: 520 } },
          uiSchema: (ctx: any) => {
            let columns: { value: string; label: string }[] = [];
            try {
              columns = ctx.model
                .mapSubModels('columns', (c: any) => {
                  const name = resolveCf(c)?.name || (Array.isArray(c?.props?.dataIndex) ? c.props.dataIndex.join('.') : c?.props?.dataIndex);
                  if (!name) return null;
                  const title = typeof c?.props?.title === 'string' ? c.props.title : name;
                  return { value: name, label: title };
                })
                .filter(Boolean);
            } catch (_) { columns = []; }
            return {
              enabled: {
                type: 'boolean',
                'x-decorator': 'FormItem',
                'x-decorator-props': { style: { marginBottom: 14 } },
                'x-component': 'PtdlIeToggle',
                'x-component-props': {
                  title: t('Instant edit (click a cell to edit)'),
                  hint: t('Every column becomes editable on a single click. Read-only fields (id, timestamps, computed…) are skipped automatically.'),
                },
              },
              inline: {
                type: 'boolean',
                'x-decorator': 'FormItem',
                'x-decorator-props': { style: { marginBottom: 12 } },
                'x-component': 'PtdlIeToggle',
                'x-component-props': {
                  title: t('In-cell input for simple fields'),
                  hint: t('Simple fields (text, number, date, choice…) get a small input right in the cell; other fields open the popup. Turn off to use the popup for everything.'),
                },
                'x-reactions': rx((v: any) => !!v.enabled),
              },
              excluded: fi(t('Columns to keep read-only'), 'PtdlIeExclude', {
                type: 'array',
                componentProps: { columns, placeholder: t('Select columns to exclude') },
                reactions: rx((v: any) => !!v.enabled),
              }),
            };
          },
          defaultParams: (ctx: any) => ({
            enabled: ctx?.model?.props?.[IE_FLAG] === true,
            inline: ctx?.model?.props?.[IE_INLINE] !== false, // default ON
            excluded: Array.isArray(ctx?.model?.props?.[IE_EXCLUDED]) ? ctx.model.props[IE_EXCLUDED] : [],
          }),
          handler(ctx: any, params: any) {
            const enabled = params?.enabled === true;
            const inline = params?.inline !== false; // default ON
            const excluded = Array.isArray(params?.excluded) ? params.excluded : [];
            // setProps is reactive → the table re-renders and getColumnProps re-decides each column's route.
            // The flow step's saved params re-apply this handler on EVERY render. ⚠️ setProps must be GUARDED
            // to fire only on a REAL change — otherwise `setProps(IE_EXCLUDED, [])` hands mobx a NEW empty-array
            // reference every render → re-render → re-apply → INFINITE LOOP (observed: `[ptdl-ie] activate`
            // spamming + the table re-rendering non-stop on a wide table = major slowdown). Comparing first
            // makes the handler idempotent so a steady-state render does nothing.
            const p = ctx.model?.props || {};
            const flagChanged = p[IE_FLAG] !== enabled;
            const inlineChanged = p[IE_INLINE] !== inline;
            const cur = p[IE_EXCLUDED];
            const exChanged = !(
              Array.isArray(cur) && cur.length === excluded.length && cur.every((x: any, i: number) => x === excluded[i])
            );
            if (flagChanged) ctx.model.setProps(IE_FLAG, enabled);
            if (inlineChanged) ctx.model.setProps(IE_INLINE, inline);
            if (exChanged) ctx.model.setProps(IE_EXCLUDED, excluded);
            if (flagChanged || inlineChanged || exChanged) ielog('activate', { enabled, inline, excluded });
          },
        },
      },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[ptdl-ie] registerFlow failed', e);
  }
}
