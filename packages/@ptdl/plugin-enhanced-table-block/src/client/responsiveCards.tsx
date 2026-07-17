import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Switch, InputNumber } from 'antd';

// Settings-dialog controls (registered via flowSettings.registerComponents in each lane entry, so the
// responsive settings step doesn't depend on a bare 'Switch'/'InputNumber' being globally available).
export const EtRespSwitch = (props: any) => <Switch checked={!!props.value} onChange={(c: any) => props.onChange?.(c)} />;
export const EtRespNum = (props: any) => (
  <InputNumber min={320} max={1400} step={20} style={{ width: 140 }} value={typeof props.value === 'number' ? props.value : 640} onChange={(v: any) => props.onChange?.(v)} addonAfter="px" />
);

/**
 * Responsive card mode for the Enhanced Table block. When the block's container is narrower than a
 * breakpoint (i.e. on a phone), the wide horizontally-scrolling table is hidden and each row is shown
 * as a stacked card instead — no more sideways scrolling. Desktop keeps the full table.
 *
 * How it slots in: the native antd table is left in place (so its toolbar + pagination keep working);
 * card mode hides `.ant-table` via a CSS class on the wrapper and PORTALS a card list into the same
 * `.ant-spin-container` right before the pagination, so the visual order stays toolbar → cards →
 * pagination. If the DOM shape isn't found, it falls back to rendering the cards inline.
 *
 * Cells reuse the antd column `render` (so conditional-format colours, field widgets, relation titles
 * all still show) with a plain-value fallback per cell.
 */

// ---- container-width breakpoint ----------------------------------------------------------------
export function useContainerNarrow(ref: React.RefObject<HTMLElement>, breakpoint: number): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      const w = el.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 9999);
      setNarrow(w > 0 && w < breakpoint);
    };
    check();
    let ro: any;
    try { ro = new ResizeObserver(check); ro.observe(el); } catch (_) { window.addEventListener('resize', check); }
    return () => { try { ro?.disconnect(); } catch (_) { /* ignore */ } try { window.removeEventListener('resize', check); } catch (_) { /* ignore */ } };
  }, [ref, breakpoint]);
  return narrow;
}

// ---- value helpers -----------------------------------------------------------------------------
function getByPath(obj: any, path: any): any {
  if (obj == null || path == null) return undefined;
  if (Array.isArray(path)) return path.reduce((a: any, k: any) => (a == null ? undefined : a[k]), obj);
  return String(path).split('.').reduce((a: any, k: string) => (a == null ? undefined : a[k]), obj);
}

function simpleFormat(v: any): React.ReactNode {
  if (v == null || v === '') return <span style={{ color: '#bfbfbf' }}>—</span>;
  if (typeof v === 'boolean') return v ? '✓' : '—';
  if (Array.isArray(v)) return v.map((x) => (x && typeof x === 'object' ? (x.title ?? x.name ?? x.label ?? x.id) : x)).filter((x) => x != null).join(', ');
  if (typeof v === 'object') return v.title ?? v.name ?? v.label ?? v.nickname ?? v.id ?? '';
  return String(v);
}

function hasDataIndex(col: any): boolean {
  const di = col?.dataIndex;
  return di != null && !(Array.isArray(di) && di.length === 0) && di !== '';
}
function isSelectionCol(col: any): boolean {
  const cls = String(col?.className || '') + ' ' + String(col?.key || '');
  return /selection/i.test(cls) || col?.type === 'selection';
}
function colTitleText(col: any): string {
  const tt = col?.title;
  return typeof tt === 'string' ? tt : '';
}

function renderCell(col: any, record: any, index: number): React.ReactNode {
  const val = getByPath(record, col?.dataIndex);
  try {
    if (typeof col?.render === 'function') {
      const out = col.render(val, record, index);
      // antd render may return { children, props } for cell-merging — unwrap.
      if (out && typeof out === 'object' && 'children' in out && !React.isValidElement(out)) return (out as any).children ?? simpleFormat(val);
      return out;
    }
  } catch (_) { /* fall through to plain value */ }
  return simpleFormat(val);
}

// ---- the card list -----------------------------------------------------------------------------
const CardList: React.FC<{ model: any }> = ({ model }) => {
  let columns: any[] = [];
  try { columns = model?.getColumns?.() || []; } catch (_) { columns = []; }
  const rows: any[] = (() => { try { return model?.resource?.getData?.() || []; } catch (_) { return []; } })();
  const rowKey = model?.collection?.filterTargetKey || model?.collection?.options?.filterTargetKey || 'id';

  const dataCols = columns.filter((c) => hasDataIndex(c));
  const actionCols = columns.filter((c) => !hasDataIndex(c) && !isSelectionCol(c) && typeof c.render === 'function' && colTitleText(c));

  if (!rows.length) {
    return <div style={{ padding: '24px 8px', textAlign: 'center', color: '#bfbfbf' }}>—</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '8px 0' }}>
      {rows.map((rec, idx) => {
        const key = getByPath(rec, rowKey) ?? idx;
        const head = dataCols[0];
        const rest = dataCols.slice(1);
        return (
          <div
            key={key}
            style={{
              border: '1px solid var(--colorBorderSecondary, #f0f0f0)', borderRadius: 10,
              background: 'var(--colorBgContainer, #fff)', boxShadow: '0 1px 2px rgba(0,0,0,.04)', overflow: 'hidden',
            }}
          >
            {head && (
              <div style={{ padding: '10px 12px', borderBottom: rest.length ? '1px solid var(--colorFillQuaternary, #f5f5f5)' : 'none', fontWeight: 600, fontSize: 15 }}>
                {renderCell(head, rec, idx)}
              </div>
            )}
            {rest.length > 0 && (
              <div style={{ padding: '6px 12px' }}>
                {rest.map((col, ci) => (
                  <div key={ci} style={{ display: 'flex', gap: 10, padding: '5px 0', borderTop: ci ? '1px dashed var(--colorFillQuaternary, #f5f5f5)' : 'none', alignItems: 'baseline' }}>
                    <span style={{ flex: '0 0 40%', maxWidth: 160, color: 'var(--colorTextSecondary, #888)', fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {col.title}
                    </span>
                    <span style={{ flex: 1, minWidth: 0, textAlign: 'right', wordBreak: 'break-word' }}>
                      {renderCell(col, rec, idx)}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {actionCols.length > 0 && (
              <div style={{ padding: '8px 12px', borderTop: '1px solid var(--colorFillQuaternary, #f5f5f5)', display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' }}>
                {actionCols.map((col, ai) => <span key={ai}>{renderCell(col, rec, idx)}</span>)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ---- portal placement --------------------------------------------------------------------------
export const ResponsiveCards: React.FC<{ model: any; containerRef: React.RefObject<HTMLElement> }> = ({ model, containerRef }) => {
  const [mount, setMount] = useState<HTMLElement | 'inline' | null>(null);
  const nodeRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const wrap = containerRef.current;
    if (!wrap) { setMount('inline'); return; }
    const spin = wrap.querySelector('.ant-table-wrapper .ant-spin-container') || wrap.querySelector('.ant-table-wrapper') || wrap;
    if (!spin) { setMount('inline'); return; }
    const node = document.createElement('div');
    node.className = 'ptdl-resp-cards';
    nodeRef.current = node;
    const pag = spin.querySelector('.ant-table-pagination') as HTMLElement | null;
    try {
      if (pag && pag.parentElement === spin) spin.insertBefore(node, pag);
      else spin.appendChild(node);
    } catch (_) { setMount('inline'); return; }
    setMount(node);
    return () => { try { node.remove(); } catch (_) { /* ignore */ } };
  }, [containerRef]);

  const cards = <CardList model={model} />;
  if (mount === 'inline') return cards;
  if (!mount) return null;
  return createPortal(cards, mount);
};

/** CSS injected once: under `.ptdl-card-mode`, hide the native table (keep toolbar + pagination). */
export const RESP_CARD_CSS = '.ptdl-card-mode .ant-table{display:none!important}.ptdl-card-mode .ant-table-title,.ptdl-card-mode .ant-table-footer{display:none!important}';
