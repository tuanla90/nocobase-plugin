/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import React, { useEffect, useRef, useState } from 'react';
import { css } from '@emotion/css';
import { tExpr } from '@nocobase/flow-engine';
// Pure format helper from the shared source lib (sideEffects:false → tree-shaken to just this
// function; pulls no antd/@nocobase/client, so the /v/ client-v2 bundle stays clean).
import { escapeHtml } from '@ptdl/shared';

/**
 * Lane-injected deps. The base `TableBlockModel` and the v1 hooks
 * (useAPIClient / useTableBlockContext / useCollection_deprecated) differ per lane, and this
 * shared file must NOT import @nocobase/client — that would pull @nocobase/client into the
 * client-v2 bundle, which the /v/ app doesn't provide (RequireJS "Script error for @nocobase/client").
 * The v1 lane injects the real hooks; the v2 lane keeps the no-ops (the isV1 branch never runs there).
 * The base model is passed into defineEnhancedTableBlockModel() by each lane.
 */
const noop = (): any => undefined;
const injected: {
  useAPIClient: () => any;
  useTableBlockContext: () => any;
  useCollection_deprecated: () => any;
} = { useAPIClient: noop, useTableBlockContext: noop, useCollection_deprecated: noop };
export function setEnhancedTableDeps(d: Partial<typeof injected>) {
  Object.assign(injected, d);
}
import { observer, useFieldSchema } from '@formily/react';
import { useTranslation } from 'react-i18next';

const wrapperCss = css`
  position: relative;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding-bottom: 7px;

  .enhanced-selected-cell {
    background-color: #ffff0033 !important; /* light yellow to match screenshot */
    border: 1px solid #ffcc00 !important;
  }
`;

// Format a numeric value so it visually matches how a column renders its cells
// (thousand/decimal separators, and prefix/suffix such as currency symbols or %).
// The `sampleText` is taken from an actual rendered cell in the same column, so the
// summary automatically mirrors whatever number format NocoBase applies to that field.
function formatNumberLikeSample(value: number, sampleText: string, stripAffix = false): string {
  if (typeof value !== 'number' || isNaN(value)) return String(value);
  const sample = (sampleText || '').trim();
  // No usable sample: fall back to grouped thousands with up to 2 decimals.
  if (!sample || !/\d/.test(sample)) {
    return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }
  const coreMatch = sample.match(/-?\d[\d.,\s ]*/);
  const raw = coreMatch ? coreMatch[0] : '';
  const core = raw.trim();
  const start = coreMatch ? sample.indexOf(raw) : -1;
  let prefix = start > 0 ? sample.slice(0, start) : '';
  let suffix = start >= 0 ? sample.slice(start + raw.length) : '';
  if (stripAffix) {
    prefix = '';
    suffix = '';
  }
  const lastComma = core.lastIndexOf(',');
  const lastDot = core.lastIndexOf('.');
  const hasComma = lastComma !== -1;
  const hasDot = lastDot !== -1;
  const hasSpace = /[\s ]/.test(core);
  let thousandSep = ',';
  let decimalSep = '.';
  let sampleDecimals = 0;
  if (hasComma && hasDot) {
    // Both separators present -> the later one is the decimal separator.
    if (lastComma > lastDot) {
      decimalSep = ',';
      thousandSep = '.';
    } else {
      decimalSep = '.';
      thousandSep = ',';
    }
    sampleDecimals = core.slice(core.lastIndexOf(decimalSep) + 1).replace(/\D/g, '').length;
  } else if (hasComma || hasDot) {
    const sep = hasComma ? ',' : '.';
    const after = core.slice(core.lastIndexOf(sep) + 1).replace(/\D/g, '');
    // A single separator grouping exactly 3 trailing digits -> thousands separator.
    if (after.length === 3 && !new RegExp('[.,]\\d{1,2}$').test(core)) {
      thousandSep = sep;
      decimalSep = sep === ',' ? '.' : ',';
      sampleDecimals = 0;
    } else {
      decimalSep = sep;
      thousandSep = hasSpace ? ' ' : sep === ',' ? '.' : ',';
      sampleDecimals = after.length;
    }
  } else if (hasSpace) {
    thousandSep = ' ';
    sampleDecimals = 0;
  } else {
    // No separator in the sample: a short value (≤3 digits, e.g. "4") carries no grouping
    // information — default to grouped thousands. Only a LONG ungrouped sample (e.g. "20260101")
    // proves the column really doesn't group.
    const digitCount = core.replace(/\D/g, '').length;
    thousandSep = digitCount > 3 ? '' : ',';
    sampleDecimals = 0;
  }
  // Show at least the column's decimals, but never hide the value's own decimals (up to 2).
  const valueDecimals = Number.isInteger(value) ? 0 : Math.min(2, (String(value).split('.')[1] || '').length);
  const decimals = Math.max(sampleDecimals, valueDecimals);
  const neg = value < 0;
  const fixed = Math.abs(value).toFixed(decimals);
  const parts = fixed.split('.');
  let intPart = parts[0];
  const decPart = parts[1];
  if (thousandSep) intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, thousandSep);
  let out = intPart + (decimals > 0 && decPart ? decimalSep + decPart : '');
  if (neg) out = '-' + out;
  return prefix + out + suffix;
}

// Plain grouped-thousands formatter for the multi-cell selection popup.
function formatStat(n: number): string {
  if (typeof n !== 'number' || isNaN(n)) return String(n);
  return Number.isInteger(n)
    ? n.toLocaleString('en-US')
    : n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

// Light sanitizers so admin-entered style values can't break out of the injected HTML.
function sanitizeColor(c: any): string {
  return String(c || '')
    .replace(/[^#a-zA-Z0-9(),.%\s-]/g, '')
    .slice(0, 40);
}
function sanitizeFontSize(s: any): number | null {
  const n = parseFloat(String(s));
  return isFinite(n) && n > 0 ? Math.min(n, 60) : null;
}
// escapeHtml now comes from '@ptdl/shared' (imported above) — byte-equivalent to the former local
// version for every call site here (all pass truthy strings, so the null/undefined coercion the
// shared `String(s ?? '')` handles differently is never reached).

export const EnhancedTableWrapper = observer(({ model, children }: { model?: any; children: React.ReactNode }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectionStats, setSelectionStats] = useState<{
    sum: number;
    min: number;
    max: number;
    avg: number;
    count: number;
  } | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const api = injected.useAPIClient();
  const [allPagesData, setAllPagesData] = useState<any[]>([]);
  const { t } = useTranslation(['@ptdl/plugin-enhanced-table-block/client', 'client'], { nsMode: 'fallback' });

  // V1 Fallbacks
  const blockContext = injected.useTableBlockContext();
  const collection = injected.useCollection_deprecated();
  const fieldSchema = useFieldSchema();
  const isV1 = !model;

  const config = isV1 ? fieldSchema?.['x-decorator-props']?.summaryConfig || {} : model?.props?.summaryConfig || {};

  const summaryStyle = isV1
    ? fieldSchema?.['x-decorator-props']?.summaryStyle || {}
    : model?.props?.summaryStyle || {};
  const summaryStyleStr = JSON.stringify(summaryStyle);

  const requestParams = isV1 ? blockContext?.service?.params?.[0] : (model?.resource as any)?.request?.params;

  const paramsStr = JSON.stringify(requestParams || {});

  const resourceDataStr = isV1
    ? JSON.stringify(blockContext?.service?.data?.data || [])
    : JSON.stringify(model?.resource?.getData?.() || []);

  useEffect(() => {
    if (Object.keys(config).length === 0) {
      setAllPagesData([]);
      return;
    }

    let isMounted = true;
    const fetchAllData = async () => {
      try {
        if (isV1 && blockContext?.service) {
          // V1 API Call
          const requestParams = {
            ...(blockContext.service.params?.[0] || {}),
            paginate: false,
          };
          let responseData;
          if (blockContext.resource && typeof blockContext.resource.list === 'function') {
            const response = await blockContext.resource.list(requestParams);
            responseData = response?.data;
          } else {
            const resourceName =
              typeof blockContext.resource === 'string'
                ? blockContext.resource
                : blockContext.association || blockContext.collection;
            if (!resourceName) return;
            const response = await api.request({
              url: `${resourceName}:list`,
              params: requestParams,
            });
            responseData = response?.data;
          }

          if (isMounted) {
            let rows: any[] = [];
            if (Array.isArray(responseData)) {
              rows = responseData;
            } else if (responseData && Array.isArray(responseData.data)) {
              rows = responseData.data;
            } else if (responseData && Array.isArray(responseData.rows)) {
              rows = responseData.rows;
            }
            setAllPagesData(rows);
          }
        } else if (!isV1 && typeof model?.resource?.runAction === 'function') {
          // V2 API Call
          const currentOptions = model.resource.getRefreshRequestOptions();
          const response = await model.resource.runAction('list', {
            method: 'get',
            ...currentOptions,
            params: {
              ...(currentOptions?.params || {}),
              paginate: false,
            },
          });

          if (isMounted) {
            let rows: any[] = [];
            if (response && Array.isArray(response.data)) {
              rows = response.data;
            } else if (response && Array.isArray(response)) {
              rows = response;
            }
            setAllPagesData(rows);
          }
        }
      } catch (err) {
        console.error('EnhancedTable fetchAllData Error: ', err);
      }
    };

    fetchAllData();
    return () => {
      isMounted = false;
    };
  }, [model, paramsStr, JSON.stringify(config), resourceDataStr, isV1]);

  const orderedColumns: string[] = [];
  const columnTitles: Record<string, string> = {};
  const numericFields = new Set<string>();
  // Virtual columns (no collectionField) that expose evaluateForRecord(record) — e.g. the
  // Formula column from @ptdl/plugin-formula. Keyed '__vcol__<uid>'; value = the column model.
  const virtualColumns: Record<string, any> = {};

  if (isV1 && collection) {
    if (fieldSchema?.properties) {
      const tableSchema = Object.values(fieldSchema.properties).find((p: any) => p['x-component'] === 'TableV2') as any;
      if (tableSchema?.properties) {
        Object.values(tableSchema.properties).forEach((col: any) => {
          const name = col.name || col['x-collection-field'];
          if (name) orderedColumns.push(name);
        });
      }
    }
    collection.fields?.forEach((field: any) => {
      columnTitles[field.name] = field.uiSchema?.title || field.title || field.name;
      const isNumeric =
        ['integer', 'bigInt', 'float', 'double', 'decimal', 'number'].includes(field.type) ||
        ['number', 'integer', 'percent', 'currency'].includes(field.interface);
      if (isNumeric) numericFields.add(field.name);
    });
  } else if (!isV1 && typeof model?.mapSubModels === 'function') {
    model.mapSubModels('columns', (column: any) => {
      const collectionField = column?.collectionField;
      if (collectionField) {
        orderedColumns.push(collectionField.name);
        columnTitles[collectionField.name] = column.props?.title || collectionField.title || collectionField.name;
        const isNumeric =
          ['integer', 'bigInt', 'float', 'double', 'decimal', 'number'].includes(collectionField.type) ||
          ['number', 'integer', 'percent', 'currency'].includes(collectionField.interface);
        if (isNumeric) numericFields.add(collectionField.name);
      } else if (typeof column?.evaluateForRecord === 'function') {
        const key = '__vcol__' + column.uid;
        orderedColumns.push(key);
        columnTitles[key] = column.props?.title || 'Formula';
        numericFields.add(key); // lets drag-select stats pick its cells up too
        virtualColumns[key] = column;
      }
    });
  }

  const metadataRef = useRef({ numericFields, columnTitles, orderedColumns, virtualColumns });
  metadataRef.current = { numericFields, columnTitles, orderedColumns, virtualColumns };

  // Track selection state in a ref so event listeners don't need to be recreated (which broke dragging)
  const selectionState = useRef({
    isSelecting: false,
    startCell: null as { r: number; c: number } | null,
    endCell: null as { r: number; c: number } | null,
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const getCellCoords = (td: HTMLElement) => {
      const tr = td.parentElement;
      if (!tr) return null;
      const tbody = tr.parentElement;
      if (!tbody) return null;
      return {
        r: Array.prototype.indexOf.call(tbody.children, tr),
        c: Array.prototype.indexOf.call(tr.children, td),
      };
    };

    const updateSelection = () => {
      const { startCell, endCell } = selectionState.current;
      if (!startCell || !endCell) return;
      const minR = Math.min(startCell.r, endCell.r);
      const maxR = Math.max(startCell.r, endCell.r);
      const minC = Math.min(startCell.c, endCell.c);
      const maxC = Math.max(startCell.c, endCell.c);

      const selectedNumbers: number[] = [];

      const { numericFields, columnTitles } = metadataRef.current;
      const domColumnToNumericKey: Record<number, boolean> = {};
      const thead = container.querySelector('.ant-table-thead');
      if (thead) {
        const firstRow = thead.querySelector('tr');
        if (firstRow) {
          for (let i = 0; i < firstRow.children.length; i++) {
            const thText = (firstRow.children[i].textContent || '').trim();
            for (const field of numericFields) {
              const title = (columnTitles[field] || '').trim();
              // Use exact match to prevent false positives
              if (title && thText === title) {
                domColumnToNumericKey[i] = true;
                break;
              }
            }
          }
        }
      }

      container
        .querySelectorAll('.enhanced-selected-cell')
        .forEach((el) => el.classList.remove('enhanced-selected-cell'));

      const tbodys = container.querySelectorAll('.ant-table-tbody');
      tbodys.forEach((tbody) => {
        for (let r = minR; r <= maxR; r++) {
          const tr = tbody.children[r];
          if (!tr) continue;
          for (let c = minC; c <= maxC; c++) {
            const td = tr.children[c] as HTMLElement;
            if (!td) continue;

            if (!domColumnToNumericKey[c]) {
              continue;
            }

            td.classList.add('enhanced-selected-cell');
            const rawText = td.textContent || '';
            // Strip out known non-numeric characters for reliable parseFloat
            const cleanStr = rawText.replace(/[¥$€£￥,% ]/g, '').trim();
            const num = parseFloat(cleanStr);
            if (!isNaN(num)) {
              selectedNumbers.push(num);
            }
          }
        }
      });

      if (selectedNumbers.length > 1) {
        const sum = selectedNumbers.reduce((a, b) => a + b, 0);
        const max = Math.max(...selectedNumbers);
        const min = Math.min(...selectedNumbers);
        const avg = sum / selectedNumbers.length;
        setSelectionStats({ sum, min, max, avg, count: selectedNumbers.length });
      } else {
        setSelectionStats(null);
        setMousePos(null);
      }
    };

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      const td = target.closest('td');

      if (!td) {
        // We do not read state from dependencies, just clear the UI
        container
          .querySelectorAll('.enhanced-selected-cell')
          .forEach((el) => el.classList.remove('enhanced-selected-cell'));
        setSelectionStats(null);
        setMousePos(null);
        selectionState.current.startCell = null;
        selectionState.current.endCell = null;
        return;
      }

      const isInteractive = target.closest('button, a, input, textarea, .ant-checkbox-wrapper, .ant-radio-wrapper');
      if (isInteractive) return;

      selectionState.current.isSelecting = true;
      selectionState.current.startCell = getCellCoords(td);
      selectionState.current.endCell = selectionState.current.startCell;
      setMousePos({ x: e.clientX, y: e.clientY });
      updateSelection();

      // Allow text selection inside the cell
      // e.preventDefault() was here, preventing native text selection.
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!selectionState.current.isSelecting) return;
      setMousePos({ x: e.clientX, y: e.clientY });
      const td = (e.target as HTMLElement).closest('td');
      if (td) {
        const coords = getCellCoords(td);
        selectionState.current.endCell = coords;

        // If moving across different cells, clear native text selection to keep UI clean
        if (
          selectionState.current.startCell &&
          (selectionState.current.startCell.r !== coords.r || selectionState.current.startCell.c !== coords.c)
        ) {
          window.getSelection()?.removeAllRanges();
        }

        updateSelection();
      }
    };

    const onMouseUp = () => {
      selectionState.current.isSelecting = false;
    };

    container.addEventListener('mousedown', onMouseDown);
    container.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    return () => {
      container.removeEventListener('mousedown', onMouseDown);
      container.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    // We removed selectionSum from deps so event listeners are not recreated.
  }, []);

  useEffect(() => {
    const tLabels: Record<string, string> = {
      sum: t('Sum', { ns: '@ptdl/plugin-enhanced-table-block/client' }),
      avg: t('Average', { ns: '@ptdl/plugin-enhanced-table-block/client' }),
      count: t('Count', { ns: '@ptdl/plugin-enhanced-table-block/client' }),
      countDistinct: t('Count distinct', { ns: '@ptdl/plugin-enhanced-table-block/client' }),
      max: t('Max', { ns: '@ptdl/plugin-enhanced-table-block/client' }),
      min: t('Min', { ns: '@ptdl/plugin-enhanced-table-block/client' }),
    };

    const container = containerRef.current;
    if (!container) return;

    if (Object.keys(config).length === 0) {
      container.querySelectorAll('.enhanced-table-summary').forEach((e) => e.remove());
      return;
    }

    const updateDOM = () => {
      const valueColor = sanitizeColor((summaryStyle as any)?.valueColor) || '#1890ff';
      const labelColor = sanitizeColor((summaryStyle as any)?.labelColor) || '#8c8c8c';
      const bgColor = sanitizeColor((summaryStyle as any)?.backgroundColor) || '#fafafa';
      const valueWeight = (summaryStyle as any)?.valueFontWeight === 'normal' ? 'normal' : 'bold';
      const valueSize = sanitizeFontSize((summaryStyle as any)?.valueFontSize) || 14;
      const showLabel = (summaryStyle as any)?.showLabel !== false;
      const thead = container.querySelector('.ant-table-thead');
      if (!thead) return;
      const firstRow = Array.from(thead.querySelectorAll('tr')).find(
        (r) => !r.classList.contains('ant-table-measure-row'),
      ) as HTMLElement;
      if (!firstRow) return;

      const bodyTable = container.querySelector('.ant-table-body table, .ant-table-content table') as HTMLTableElement;
      if (!bodyTable) return;

      // Grab the first non-empty rendered value in a column; used as a format template
      // so the summary value mirrors the column's own number formatting.
      const getColumnSample = (idx: number): string => {
        // Prefer the cell with the MOST digits — big values are the ones that reveal the
        // column's real grouping/decimal format (a first-row "4" says nothing about it).
        // :not(.enhanced-table-summary) — never sample our own injected summary row.
        const rows = bodyTable.querySelectorAll('tbody:not(.enhanced-table-summary) tr');
        let best = '';
        let bestDigits = 0;
        for (let r = 0; r < rows.length; r++) {
          const txt = ((rows[r].children[idx] as HTMLElement)?.textContent || '').trim();
          if (!/\d/.test(txt)) continue;
          const digits = (txt.match(/\d/g) || []).length;
          if (digits > bestDigits) {
            best = txt;
            bestDigits = digits;
          }
        }
        return best;
      };

      // Rows ticked via the row-selection checkboxes (antd marks them with
      // .ant-table-row-selected) — supports non-contiguous rows across the current page.
      const selectedTrs = Array.from(
        bodyTable.querySelectorAll('tbody:not(.enhanced-table-summary) tr.ant-table-row-selected'),
      ) as HTMLElement[];

      // Filter out AntD's scrollbar compensation column from header cells
      const headerCells = Array.from(firstRow.children).filter(
        (el) => !(el as HTMLElement).classList.contains('ant-table-cell-scrollbar'),
      ) as HTMLElement[];

      // Get body reference row for accurate position/width syncing
      // Bỏ qua measure-row ẩn của antd (tr đầu tiên khi có scroll.x — td trống, không style)
      const bodyFirstRow = (bodyTable.querySelector('tbody:not(.enhanced-table-summary) tr.ant-table-row') ||
        bodyTable.querySelector('tbody:not(.enhanced-table-summary) tr:not(.ant-table-measure-row)')) as HTMLElement;
      const bodyCells = bodyFirstRow ? (Array.from(bodyFirstRow.children) as HTMLElement[]) : [];

      // Position: bottom (default) = <tfoot> sticky at the bottom of the table's scroll area;
      // top = an extra <tbody> inserted BEFORE the data tbody, cells sticky at top:0 so the
      // totals stay visible below the header while scrolling long tables.
      const posTop = (summaryStyle as any)?.position === 'top';
      let host = bodyTable.querySelector(':scope > .enhanced-table-summary') as HTMLElement | null;
      if (host && host.tagName !== (posTop ? 'TBODY' : 'TFOOT')) {
        host.remove();
        host = null;
      }
      if (!host) {
        host = document.createElement(posTop ? 'tbody' : 'tfoot');
        // NOT 'ant-table-tbody' — the drag-selection stats iterate that class.
        host.className = 'ant-table-summary enhanced-table-summary';
        if (posTop) {
          const mainTbody = bodyTable.querySelector('tbody');
          bodyTable.insertBefore(host, mainTbody);
        } else {
          host.style.position = 'sticky';
          host.style.bottom = '0';
          host.style.zIndex = '3'; // Ensure it's above table rows
          bodyTable.appendChild(host);
        }
      }
      host.style.backgroundColor = bgColor;

      let tr = host.querySelector('tr') as HTMLElement;
      if (!tr) {
        tr = document.createElement('tr');
        tr.className = 'ant-table-row';
        host.appendChild(tr);
      }

      // Use body cell count (more accurate) or filtered header cell count
      const colCount = bodyCells.length || headerCells.length;

      // Ensure exact number of td elements
      while (tr.children.length < colCount) {
        const td = document.createElement('td');
        tr.appendChild(td);
      }
      while (tr.children.length > colCount) {
        if (tr.lastChild) tr.lastChild.remove();
      }

      // Sync columns and data
      let summaryTitleRendered = false;

      for (let i = 0; i < colCount; i++) {
        const th = headerCells[i] as HTMLElement | undefined;
        const td = tr.children[i] as HTMLElement;
        const bodyTd = bodyCells[i] as HTMLElement | undefined;

        // Use body cell for styling (more accurate alignment), fall back to header cell
        const refCell = bodyTd || th;

        // Copy fixed styling from reference cell
        let classList = 'ant-table-cell ';
        if (refCell) {
          refCell.classList.forEach((c) => {
            if (c.includes('fix-left') || c.includes('fix-right')) classList += c + ' ';
          });
        }
        classList = classList.trim();
        if (td.className !== classList) td.className = classList;

        // Sync sticky positioning from body cell (more accurate than header)
        if (bodyTd) {
          if (td.style.position !== bodyTd.style.position) td.style.position = bodyTd.style.position;
          if (td.style.left !== bodyTd.style.left) td.style.left = bodyTd.style.left;
          if (td.style.right !== bodyTd.style.right) td.style.right = bodyTd.style.right;
        } else if (th) {
          if (td.style.left !== th.style.left) td.style.left = th.style.left;
          if (td.style.right !== th.style.right) td.style.right = th.style.right;
        }

        // Top mode: every cell sticks below the header inside the table's scroll container
        // (sticky top+left can coexist, so fixed columns keep their horizontal pinning too).
        if (posTop) {
          td.style.position = 'sticky';
          td.style.top = '0';
          td.style.zIndex = td.className.includes('fix') ? '4' : '3';
        }

        const bgKey = bgColor + (posTop ? ':top' : ':bottom');
        if (td.dataset.summaryBg !== bgKey) {
          td.dataset.summaryBg = bgKey;
          td.style.backgroundColor = bgColor;
          td.style.borderTop = posTop ? '1px solid #e8e8e8' : '2px solid #e8e8e8';
          td.style.borderBottom = posTop ? '2px solid #e8e8e8' : '1px solid #e8e8e8';
          td.style.padding = '8px 4px';
        }

        // Determine if column is checkbox / action column
        const isSelectionColumn =
          (th || refCell)?.classList.contains('ant-table-selection-column') ||
          !!(th || refCell)?.querySelector?.('.ant-checkbox-wrapper');
        const thText = th?.textContent?.trim() || '';
        const isActionColumn =
          (th || refCell)?.classList.contains('nb-action-column') || thText === '操作' || thText === 'Actions';

        let matchedIndex: string | null = null;

        for (const [dataIndex, entry] of Object.entries(config)) {
          const entryType = typeof entry === 'string' ? entry : (entry as any)?.type;
          if (!entryType) continue;
          const title = (metadataRef.current.columnTitles[dataIndex] || dataIndex).trim();
          // Use exact match to prevent false positives (e.g., field "a" matching "Created at")
          if (title && thText === title && !isActionColumn && !isSelectionColumn) {
            matchedIndex = dataIndex;
            break;
          }
        }

        let newHTML = '';

        if (matchedIndex) {
          const entry = config[matchedIndex];
          const type = typeof entry === 'string' ? entry : (entry as any)?.type;
          const colLabel = typeof entry === 'object' && entry ? (entry as any).label : '';
          // Căn theo đúng align của cột. Nguồn theo thứ tự: td (antd align inline) → div con trong td
          // (formula column đặt textAlign ở inner div) → th header. 'start/end' map về left/right.
          const pickAlign = (el?: HTMLElement | null): string => {
            if (!el) return '';
            const inline = el.style?.textAlign;
            const v = inline || getComputedStyle(el).textAlign;
            if (v === 'end') return 'right';
            return ['left', 'right', 'center'].includes(v) ? v : '';
          };
          const colAlign =
            pickAlign(bodyTd) ||
            pickAlign(bodyTd?.firstElementChild as HTMLElement | null) ||
            pickAlign(th) ||
            'left';
          const alignItems = colAlign === 'right' ? 'flex-end' : colAlign === 'center' ? 'center' : 'flex-start';
          let result: number | string = '';

          // Raw non-empty values — Count / Count distinct work on ANY column type.
          // Virtual formula columns have no data key: evaluate the formula per raw row instead.
          const vcol = metadataRef.current.virtualColumns[matchedIndex];
          const rawValues = allPagesData
            .map((row: any) => {
              if (vcol) {
                try {
                  return vcol.evaluateForRecord(row);
                } catch {
                  return null;
                }
              }
              return typeof row[matchedIndex] === 'function' ? null : row[matchedIndex];
            })
            .filter((v: any) => v !== null && v !== undefined && v !== '');
          // Numeric-only values — Sum / Average / Min / Max. Formula results may be HTML
          // strings (e.g. TAG/B helpers): strip tags and common affixes before parsing.
          const numValues = rawValues
            .map((v: any) =>
              typeof v === 'number'
                ? v
                : Number(
                    String(v)
                      .replace(/<[^>]*>/g, '')
                      .replace(/[¥$€£￥,% ]/g, ''),
                  ),
            )
            .filter((v: any) => typeof v === 'number' && !isNaN(v)) as number[];

          if (type === 'count') {
            result = rawValues.length;
          } else if (type === 'countDistinct') {
            result = new Set(rawValues.map((v: any) => (typeof v === 'object' ? JSON.stringify(v) : String(v)))).size;
          } else if (numValues.length > 0) {
            if (type === 'sum') result = numValues.reduce((a, b) => a + b, 0);
            else if (type === 'avg') result = numValues.reduce((a, b) => a + b, 0) / numValues.length;
            else if (type === 'max') result = Math.max(...numValues);
            else if (type === 'min') result = Math.min(...numValues);
          }

          // Mirror the column's own number format (separators, decimals, currency, %...).
          // Counts are plain integers, so strip any currency/unit affixes from them.
          const isCount = type === 'count' || type === 'countDistinct';
          const sample = getColumnSample(i);
          let displayResult: string | number = result;
          if (typeof result === 'number') {
            displayResult = formatNumberLikeSample(result, sample, isCount);
          }

          // Per-column custom label wins; otherwise fall back to the aggregation type name.
          const labelStr = colLabel ? escapeHtml(colLabel) : tLabels[type]?.toUpperCase() || type;

          // When rows are ticked, aggregate ONLY those rows (parsed from their rendered cells)
          // and promote that to the main value; the all-rows total drops to a small second line.
          let selResult: number | null = null;
          if (selectedTrs.length > 0) {
            const texts = selectedTrs
              .map((selTr) => ((selTr.children[i] as HTMLElement)?.textContent || '').trim())
              .filter((txt) => txt !== '');
            const nums = texts
              .map((txt) => parseFloat(txt.replace(/[¥$€£￥,% ]/g, '')))
              .filter((n) => !isNaN(n));
            if (type === 'count') selResult = texts.length;
            else if (type === 'countDistinct') selResult = new Set(texts).size;
            else if (nums.length > 0) {
              if (type === 'sum') selResult = nums.reduce((a, b) => a + b, 0);
              else if (type === 'avg') selResult = nums.reduce((a, b) => a + b, 0) / nums.length;
              else if (type === 'max') selResult = Math.max(...nums);
              else if (type === 'min') selResult = Math.min(...nums);
            }
          }

          if (selResult !== null) {
            const selDisplay = formatNumberLikeSample(selResult, sample, isCount);
            const selLabel = t('{{num}} selected', {
              ns: '@ptdl/plugin-enhanced-table-block/client',
              num: selectedTrs.length,
            });
            const allLabel = t('All', { ns: '@ptdl/plugin-enhanced-table-block/client' });
            const labelHtml = showLabel
              ? `<span style="color: ${labelColor}; font-size: 11px; font-weight: normal; letter-spacing: 0.5px; text-align: ${colAlign};">${labelStr} · ${escapeHtml(selLabel)}</span>`
              : '';
            newHTML = `<div style="display: flex; flex-direction: column; align-items: ${alignItems}; line-height: 1.4;">
            <span style="color: ${valueColor}; font-weight: ${valueWeight}; font-size: ${valueSize}px; text-align: ${colAlign};">${selDisplay}</span>
            ${labelHtml}
            <span style="color: ${labelColor}; font-size: 11px; font-weight: normal; text-align: ${colAlign};">${escapeHtml(allLabel)}: ${displayResult}</span>
          </div>`;
          } else {
            const labelHtml = showLabel
              ? `<span style="color: ${labelColor}; font-size: 11px; font-weight: normal; letter-spacing: 0.5px; text-align: ${colAlign};">${labelStr}</span>`
              : '';
            newHTML = `<div style="display: flex; flex-direction: column; align-items: ${alignItems}; line-height: 1.4;">
            <span style="color: ${valueColor}; font-weight: ${valueWeight}; font-size: ${valueSize}px; text-align: ${colAlign};">${displayResult}</span>
            ${labelHtml}
          </div>`;
          }
          summaryTitleRendered = true;
        }

        // Instead of td.innerHTML !== newHTML, compare using dataset
        // Browsers parse innerHTML colors (e.g. #8c8c8c -> rgb(...)), returning a different string,
        // causing this to run repeatedly in a loop!
        if (td.dataset.contentHash !== newHTML) {
          td.dataset.contentHash = newHTML;
          td.innerHTML = newHTML;
        }
      }
    };

    let updateRafId: number | null = null;
    let observerObj: MutationObserver | null = null;

    const scheduleUpdate = () => {
      if (updateRafId !== null) return;
      updateRafId = requestAnimationFrame(() => {
        updateRafId = null;
        if (observerObj) observerObj.disconnect();
        updateDOM();
        if (observerObj) {
          observerObj.observe(container, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['style', 'class'],
          });
        }
      });
    };

    updateDOM();

    // Use MutationObserver to trigger update dynamically
    observerObj = new MutationObserver(() => scheduleUpdate());
    observerObj.observe(container, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class'],
    });

    return () => {
      if (updateRafId !== null) cancelAnimationFrame(updateRafId);
      if (observerObj) observerObj.disconnect();
    };
  }, [config, allPagesData, metadataRef.current.columnTitles, t, summaryStyleStr]);

  return (
    <div className={wrapperCss} ref={containerRef}>
      {children}

      {selectionStats && mousePos && (
        <div
          style={{
            position: 'fixed',
            left: mousePos.x + 15,
            top: mousePos.y + 15,
            pointerEvents: 'none',
            zIndex: 9999,
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            border: '1px solid #d9d9d9',
            borderRadius: '4px',
            padding: '8px 12px',
            fontSize: '13px',
            color: '#333',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}
        >
          <div
            style={{ fontWeight: 'bold', marginBottom: '4px', borderBottom: '1px solid #eee', paddingBottom: '4px' }}
          >
            {t('Selection stats (contains {{num}} cells)', {
              ns: '@ptdl/plugin-enhanced-table-block/client',
              num: selectionStats.count,
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px' }}>
            <span>{t('Sum', { ns: '@ptdl/plugin-enhanced-table-block/client' })}：</span>
            <strong>{formatStat(selectionStats.sum)}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px' }}>
            <span>{t('Max', { ns: '@ptdl/plugin-enhanced-table-block/client' })}：</span>
            <strong>{formatStat(selectionStats.max)}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px' }}>
            <span>{t('Min', { ns: '@ptdl/plugin-enhanced-table-block/client' })}：</span>
            <strong>{formatStat(selectionStats.min)}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px' }}>
            <span>{t('Average', { ns: '@ptdl/plugin-enhanced-table-block/client' })}：</span>
            <strong>{formatStat(selectionStats.avg)}</strong>
          </div>
        </div>
      )}
    </div>
  );
});

export function defineEnhancedTableBlockModel(TableBlockModel: any) {
  class EnhancedTableBlockModel extends TableBlockModel {
    renderComponent() {
      const original = super.renderComponent();
      return <EnhancedTableWrapper model={this}>{original}</EnhancedTableWrapper>;
    }
  }

EnhancedTableBlockModel.registerFlow({
  key: 'enhancedTableSettings',
  sort: 600,
  title: `{{t("Enhanced table settings", { ns: "@ptdl/plugin-enhanced-table-block/client" })}}`,
  steps: {
    summaryConfig: {
      title: `{{t("Summary row settings", { ns: "@ptdl/plugin-enhanced-table-block/client" })}}`,
      uiSchema: (ctx) => {
        // MIGRATION: the old dialog saved entries as plain strings ('amount': 'sum'), the new one
        // binds each column to an OBJECT ({type, label}). Formily cannot write `.type` into a
        // string value — the Select shows empty on reopen and a new choice is silently dropped on
        // save. Normalize the stored step params (in memory) BEFORE the dialog reads them as
        // initialValues; they get persisted in the new shape on OK.
        const rawParams = ctx.model.getStepParams('enhancedTableSettings', 'summaryConfig') || {};
        const rawConfig = (rawParams as any).summaryConfig || {};
        if (Object.values(rawConfig).some((v: any) => typeof v === 'string')) {
          const migrated = Object.fromEntries(
            Object.entries(rawConfig).map(([k, v]) => [k, typeof v === 'string' ? { type: v } : v]),
          );
          ctx.model.setStepParams('enhancedTableSettings', 'summaryConfig', { summaryConfig: migrated });
        }

        const columnsToSelect: { label: string; value: string; isNumeric: boolean }[] = [];
        if (typeof ctx.model.mapSubModels === 'function') {
          ctx.model.mapSubModels('columns', (column: any) => {
            const collectionField = column?.collectionField;
            if (!collectionField) {
              // Virtual columns exposing evaluateForRecord (Formula column) — aggregate the
              // per-row computed values; offer the full numeric option set.
              if (typeof column?.evaluateForRecord === 'function') {
                columnsToSelect.push({
                  label: column.props?.title || 'Formula',
                  value: '__vcol__' + column.uid,
                  isNumeric: true,
                });
              }
              return;
            }

            const isNumeric =
              ['integer', 'bigInt', 'float', 'double', 'decimal', 'number'].includes(collectionField.type) ||
              ['number', 'integer', 'percent', 'currency'].includes(collectionField.interface);
            // Count / Count distinct work on ANY column; sum/avg/min/max are numeric-only.
            columnsToSelect.push({
              label: column.props?.title || collectionField.title || collectionField.name,
              value: collectionField.name,
              isNumeric,
            });
          });
        }

        const currentConfig = (ctx.model.props?.summaryConfig as Record<string, any>) || {};
        const currentStyle = (ctx.model.props?.summaryStyle as Record<string, any>) || {};
        const normEntry = (v: any) => (typeof v === 'string' ? { type: v } : v || {});
        const countOptions = [
          { label: `{{t("Count", { ns: "@ptdl/plugin-enhanced-table-block/client" })}}`, value: 'count' },
          { label: `{{t("Count distinct", { ns: "@ptdl/plugin-enhanced-table-block/client" })}}`, value: 'countDistinct' },
        ];
        const numericOptions = [
          { label: `{{t("Sum", { ns: "@ptdl/plugin-enhanced-table-block/client" })}}`, value: 'sum' },
          { label: `{{t("Average", { ns: "@ptdl/plugin-enhanced-table-block/client" })}}`, value: 'avg' },
          ...countOptions,
          { label: `{{t("Min", { ns: "@ptdl/plugin-enhanced-table-block/client" })}}`, value: 'min' },
          { label: `{{t("Max", { ns: "@ptdl/plugin-enhanced-table-block/client" })}}`, value: 'max' },
        ];

        // One group per numeric column: aggregation type + its own custom label, side by side.
        const columnFields = columnsToSelect.reduce(
          (acc, col) => {
            const cur = normEntry(currentConfig[col.value]);
            acc[col.value] = {
              type: 'object',
              title: col.label,
              'x-decorator': 'FormItem',
              'x-component': 'FormGrid',
              'x-component-props': { minColumns: 2, maxColumns: 2 },
              properties: {
                type: {
                  type: 'string',
                  default: cur.type,
                  'x-component': 'Select',
                  'x-component-props': {
                    allowClear: true,
                    placeholder: `{{t("Select aggregation type", { ns: "@ptdl/plugin-enhanced-table-block/client" })}}`,
                    options: col.isNumeric ? numericOptions : countOptions,
                  },
                },
                label: {
                  type: 'string',
                  default: cur.label,
                  'x-component': 'Input',
                  'x-component-props': {
                    allowClear: true,
                    placeholder: `{{t("Custom label", { ns: "@ptdl/plugin-enhanced-table-block/client" })}}`,
                  },
                },
              },
            };
            return acc;
          },
          {} as Record<string, any>,
        );

        return {
          settingsTabs: {
            type: 'void',
            'x-component': 'FormTab',
            properties: {
              tabColumns: {
                type: 'void',
                'x-component': 'FormTab.TabPane',
                'x-component-props': {
                  tab: `{{t("Summary row settings", { ns: "@ptdl/plugin-enhanced-table-block/client" })}}`,
                },
                properties: {
                  summaryConfig: {
                    type: 'object',
                    'x-component': 'div',
                    properties: columnFields,
                  },
                },
              },
              tabStyle: {
                type: 'void',
                'x-component': 'FormTab.TabPane',
                'x-component-props': {
                  tab: `{{t("Summary row style", { ns: "@ptdl/plugin-enhanced-table-block/client" })}}`,
                },
                properties: {
                  summaryStyle: {
                    type: 'object',
                    'x-component': 'div',
                    properties: {
                      position: {
                        type: 'string',
                        title: `{{t("Summary row position", { ns: "@ptdl/plugin-enhanced-table-block/client" })}}`,
                        default: currentStyle.position || 'bottom',
                        'x-decorator': 'FormItem',
                        'x-component': 'Select',
                        'x-component-props': {
                          options: [
                            {
                              label: `{{t("Bottom (default)", { ns: "@ptdl/plugin-enhanced-table-block/client" })}}`,
                              value: 'bottom',
                            },
                            {
                              label: `{{t("Top, sticky below header", { ns: "@ptdl/plugin-enhanced-table-block/client" })}}`,
                              value: 'top',
                            },
                          ],
                        },
                      },
                      showLabel: {
                        type: 'boolean',
                        title: `{{t("Show label", { ns: "@ptdl/plugin-enhanced-table-block/client" })}}`,
                        default: currentStyle.showLabel !== false,
                        'x-decorator': 'FormItem',
                        'x-component': 'Switch',
                      },
                      valueColor: {
                        type: 'string',
                        title: `{{t("Value text color", { ns: "@ptdl/plugin-enhanced-table-block/client" })}}`,
                        default: currentStyle.valueColor,
                        'x-decorator': 'FormItem',
                        'x-component': 'Input',
                        'x-component-props': { placeholder: '#1890ff', allowClear: true },
                      },
                      labelColor: {
                        type: 'string',
                        title: `{{t("Label text color", { ns: "@ptdl/plugin-enhanced-table-block/client" })}}`,
                        default: currentStyle.labelColor,
                        'x-decorator': 'FormItem',
                        'x-component': 'Input',
                        'x-component-props': { placeholder: '#8c8c8c', allowClear: true },
                      },
                      backgroundColor: {
                        type: 'string',
                        title: `{{t("Background color", { ns: "@ptdl/plugin-enhanced-table-block/client" })}}`,
                        default: currentStyle.backgroundColor,
                        'x-decorator': 'FormItem',
                        'x-component': 'Input',
                        'x-component-props': { placeholder: '#fafafa', allowClear: true },
                      },
                      valueFontWeight: {
                        type: 'string',
                        title: `{{t("Value font weight", { ns: "@ptdl/plugin-enhanced-table-block/client" })}}`,
                        default: currentStyle.valueFontWeight,
                        'x-decorator': 'FormItem',
                        'x-component': 'Select',
                        'x-component-props': {
                          allowClear: true,
                          options: [
                            { label: `{{t("Bold", { ns: "@ptdl/plugin-enhanced-table-block/client" })}}`, value: 'bold' },
                            { label: `{{t("Normal", { ns: "@ptdl/plugin-enhanced-table-block/client" })}}`, value: 'normal' },
                          ],
                        },
                      },
                      valueFontSize: {
                        type: 'string',
                        title: `{{t("Value font size (px)", { ns: "@ptdl/plugin-enhanced-table-block/client" })}}`,
                        default: currentStyle.valueFontSize,
                        'x-decorator': 'FormItem',
                        'x-component': 'Input',
                        'x-component-props': { placeholder: '14', allowClear: true },
                      },
                    },
                  },
                },
              },
            },
          },
        };
      },
      defaultParams: { summaryConfig: {}, summaryStyle: {} },
      handler(ctx, params) {
        // Normalize to the object shape ({type, label}) and drop typeless entries, so props stay
        // uniform regardless of whether the params came from the old (string) or new dialog.
        const config: Record<string, any> = {};
        for (const [key, value] of Object.entries((params.summaryConfig as Record<string, any>) || {})) {
          const entry = typeof value === 'string' ? { type: value } : value;
          if (entry && (entry as any).type) config[key] = entry;
        }
        ctx.model.setProps('summaryConfig', config);
        ctx.model.setProps('summaryStyle', params.summaryStyle || {});
      },
    },
  },
});

EnhancedTableBlockModel.define({
  label: `{{t("Enhanced Table", { ns: "@ptdl/plugin-enhanced-table-block/client" })}}`,
  group: `{{t("Content", { ns: "@ptdl/plugin-enhanced-table-block/client" })}}`,
  searchable: true,
  searchPlaceholder: `{{t("Search", { ns: "@ptdl/plugin-enhanced-table-block/client" })}}`,
  createModelOptions: () => ({
    use: 'EnhancedTableBlockModel',
    subModels: {
      columns: [
        {
          use: 'TableActionsColumnModel',
        },
      ],
    },
  }),
  sort: 301,
});

  return EnhancedTableBlockModel;
}
