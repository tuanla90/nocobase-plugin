/**
 * @tuanla90/plugin-spreadsheet-view — SPIKE (MVP bước 1, xem docs/MVP-spreadsheet-view.md).
 *
 * Block spreadsheet trên FlowEngine /v/:
 *  - KHUNG: AG Grid Community (bundle thật) — virtualization, keyboard nav, resize cột.
 *  - RUỘT:  cell editor TÁI DÙNG NocoBase FieldModel qua binding registry `EditableItemModel`
 *           (pattern QuickEditFormModel của core, bỏ popover): mỗi CỘT có 1 "cell host model"
 *           (PtdlSheetCellModel) tạo lazy, resolve binding theo interface → addSubModel field
 *           → render <FieldModelRenderer value onChange> ngay trong ô.
 *  - Ghi:   commit per-cell qua MultiRecordResource.update(filterByTk, {field: value})
 *           (spike; MVP sẽ chuyển dirty-row store + commit per-row).
 *
 * Field đã gán widget @tuanla90 (Star/Progress/RichSelect/Boolean…) tự resolve ra đúng widget đó
 * vì cùng registry EditableItemModel.
 */
import React from 'react';
// Bare import GIỮ NGUYÊN: nocobase-build chỉ externalize package mà SOURCE plugin import trực tiếp.
// ag-grid-react cần react-dom (createPortal); không có dòng này react-dom bị bundle thành stub rỗng.
import 'react-dom';
import { tagColorToHex, SettingRow, SettingCard, AiCodegenButton, registerSettingsKit, rx, SegmentedGroup, ColumnSelect, aggSum, aggAvg } from '@tuanla90/shared';
import {
  ArrowDown, ArrowLeftToLine, ArrowRightToLine, ArrowUp, Check, ChevronDown, ChevronLeft, ChevronRight,
  Copy, Download, ExternalLink, Eye, EyeOff, Flag, GripVertical, Pencil, Pin, Play, Plus, Send, SlidersHorizontal,
  Star, Trash2, X,
} from 'lucide-react';

// Icon dùng cho row-action button (curated — đủ cho thao tác thường; user chọn trong ⚙ Actions).
const ACTION_ICONS: Record<string, any> = {
  check: Check, x: X, edit: Pencil, eye: Eye, copy: Copy, trash: Trash2, send: Send,
  download: Download, link: ExternalLink, star: Star, flag: Flag, play: Play,
};
// Màu button → hex (theo antd token, fallback hex).
const ACTION_COLORS: Record<string, string> = {
  default: 'var(--ptdl-primary, #1677ff)',
  success: 'var(--colorSuccess, #52c41a)',
  warning: 'var(--colorWarning, #faad14)',
  danger: 'var(--colorError, #ff4d4f)',
};
import {
  EditableItemModel,
  FieldModelRenderer,
  FlowModel,
  FlowModelRenderer,
  MultiRecordResource,
  SingleRecordResource,
  observer,
  tExpr,
} from '@nocobase/flow-engine';
import {
  Button,
  Checkbox as AntCheckbox,
  ColorPicker as AntColorPicker,
  Input as AntInput,
  InputNumber,
  Modal as AntModal,
  Pagination,
  Popconfirm,
  Popover,
  Select as AntSelect,
  Space as AntSpace,
  Switch as AntSwitch,
  theme,
} from 'antd';
import {
  CopyOutlined,
  DeleteOutlined,
  ExpandAltOutlined,
  ExportOutlined,
  EyeInvisibleOutlined,
  FunctionOutlined,
  PlusOutlined,
  SaveOutlined,
  SettingOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry, themeQuartz } from 'ag-grid-community';
// FormTab của Formily: chia dialog settings thành tab (void wrapper → field paths PHẲNG, params cũ bind
// nguyên). Import trực tiếp → nocobase-build externalize @formily/antd-v5 (host cấp runtime). Pattern
// đã dùng ở @tuanla90/plugin-ai-column.
import { FormTab } from '@formily/antd-v5';

ModuleRegistry.registerModules([AllCommunityModule]);

// ---------------- i18n (VN-string-as-key) ----------------
// Vietnamese is the SOURCE: each user-facing VN string IS the i18n key. Only en-US.json is registered
// (per lane, in load()); a vi-VN user misses en-US → i18next falls back to the key = the Vietnamese
// text, so the UI stays Vietnamese with no vi-VN file. NS is per-lane (client / client-v2 bundle
// separately) but the string is identical.
export const NS = '@tuanla90/plugin-spreadsheet-view/client';

// Framework-compiled path (FlowEngine flow/step titles, model label, uiSchema title/enum/placeholder/
// description): emit a `{{t("key", { ns })}}` expression the framework compiles at RENDER time so it
// stays reactive to language switching. `teCore` targets the core namespace for shared keys the block
// picker groups by (e.g. "Content") so this block sits in the same group as core blocks in both langs.
const te = (s: string) => tExpr(s, { ns: NS });
const teCore = (s: string) => tExpr(s);

// Runtime path (React-rendered strings): a module-level translator injected per-lane via setRuntimeT
// in load() (`app.i18n.t(s, { ns: NS, ...opts })`). Falls back to the key (= the Vietnamese source)
// until injected, so nothing breaks before load(). NEVER read a window global here.
let _t: (s: string, opts?: any) => string = (s) => s;
export const setRuntimeT = (fn: (s: string, opts?: any) => string) => {
  _t = fn;
};
export const t = (s: string, opts?: any): string => _t(s, opts);

// Theme gần Lark Base: viền mảnh, header xám nhạt, accent màu primary antd.
// Tham số MẬT ĐỘ (không màu) — cố định.
const SHEET_THEME_BASE = {
  fontSize: 13,
  headerFontWeight: 600,
  spacing: 5, // mật độ gọn hơn mặc định (8)
  cellHorizontalPadding: 6, // chữ/nút ↔ mép ô (mật độ Lark ~6px)
};
// Theme AG Grid LẤY MÀU TỪ antd token (theme.useToken) → tự khớp light/dark của app. Trước đây hardcode
// màu sáng nên lưới luôn trắng dù app dark mode. Fallback = màu sáng khi token thiếu.
const buildSheetTheme = (token: any) =>
  themeQuartz.withParams({
    ...SHEET_THEME_BASE,
    accentColor: token?.colorPrimary || '#1677ff',
    backgroundColor: token?.colorBgContainer || '#fff',
    foregroundColor: token?.colorText || 'rgba(0,0,0,0.88)',
    borderColor: token?.colorBorderSecondary || '#f0f0f0',
    headerBackgroundColor: token?.colorFillQuaternary || '#fafafa',
    headerTextColor: token?.colorTextHeading || token?.colorText || 'rgba(0,0,0,0.88)',
    chromeBackgroundColor: token?.colorFillQuaternary || '#fafafa',
    oddRowBackgroundColor: token?.colorBgContainer || '#fff',
    rowHoverColor: token?.controlItemBgHover || 'rgba(0,0,0,0.04)',
    selectedRowBackgroundColor: token?.controlItemBgActive || 'rgba(22,119,255,0.1)',
    inputBackgroundColor: token?.colorBgContainer || '#fff',
  });

// PHẢI ổn định reference — KHÔNG inline vào <AgGridReact defaultColDef={{…}}>. AgGridReact re-apply
// defaultColDef mỗi khi prop đổi ref; object inline tạo mới MỖI render → AG re-sync width MỌI cột về
// width này mỗi render → user kéo dãn cột xong bị "tự về vị trí cũ" (springback). Const module = 1 ref.
// KHÔNG đặt `width` ở đây: nếu có, mỗi lần rebuild colDefs AG áp lại width này = MẤT width user đã kéo.
// Không có width ở đâu cả → AG GIỮ NGUYÊN width runtime của cột qua mọi lần đổi colDefs. Width mặc định
// 160 cho cột data/formula chưa lưu do width-apply effect seed (xem desiredWidth).
const SHEET_DEFAULT_COLDEF = { resizable: true, sortable: false };

// Khử border 2 lớp khi edit: chỉ giữ 1 viền xanh của ô (AG Grid), input antd bên trong borderless
// + fill nguyên ô; popup editor của AG Grid bỏ chrome (card do editor tự vẽ).
const SHEET_CSS = `
.ptdl-sheet .ag-cell-inline-editing {
  box-shadow: none !important;
  border: 1px solid var(--ptdl-primary, #1677ff) !important;
  border-radius: 0 !important;
  background: var(--ptdl-elevated, #fff) !important;
}
.ptdl-sheet .ag-cell-inline-editing .ptdl-sheet-editor { height: 100%; }
.ptdl-sheet .ag-cell-inline-editing .ant-input,
.ptdl-sheet .ag-cell-inline-editing .ant-input-number,
.ptdl-sheet .ag-cell-inline-editing .ant-input-number-input {
  border: none !important;
  box-shadow: none !important;
  outline: none !important;
  background: transparent !important;
  width: 100%;
  height: 100%;
  padding: 0 !important;
  font-size: 13px;
}
.ptdl-sheet .ag-popup-editor {
  background: transparent !important;
  box-shadow: none !important;
  border: none !important;
  padding: 0 !important;
}
.ptdl-sheet .ag-row-pinned {
  background: var(--ptdl-pinned-bg, #fafcff) !important;
  font-style: italic;
}
.ptdl-sheet .ptdl-expand { opacity: 0; transition: opacity 0.12s; }
.ptdl-sheet .ag-row-hover .ptdl-expand { opacity: 0.85; }
.ptdl-sheet .ptdl-colgear { opacity: 0; cursor: pointer; font-size: 12px; transition: opacity 0.12s; }
.ptdl-sheet .ag-header-cell:hover .ptdl-colgear { opacity: 0.7; }
.ptdl-sheet .ptdl-range { background-color: rgba(22, 119, 255, 0.10) !important; }
.ptdl-sheet .ptdl-dirty { box-shadow: inset 3px 0 0 #faad14; }
.ptdl-sheet .ptdl-gadd { opacity: 0.3; cursor: pointer; color: var(--ptdl-primary, #1677ff); font-weight: 600; padding: 0 4px; transition: opacity 0.12s; }
.ptdl-sheet .ptdl-gadd:hover { opacity: 1; }
/* Merge mode (cell spanning): giá trị ô gộp "dính" mép trên khi scroll trong span dài.
   position:sticky KHÔNG dùng được — AG Grid transform:translateY container chứa spanned cells
   (setOffsetTop) và sticky chết trong ancestor có transform → tự translate bằng JS (ptdlStickSpans). */
.ptdl-sheet .ag-spanned-cell { height: 100%; }
/* Sticky qua CSS VARIABLE đặt trên wrapper: AG Grid tái tạo inner trong rAF của nó (SAU stick()
   trong cùng frame) → ghi transform inline lên inner thua race ở mọi frame đang scroll. Rule CSS
   + var kế thừa từ wrapper thì áp tại thời điểm style-resolve — inner mới sinh ra là dính ngay. */
.ptdl-sheet .ag-spanned-cell > * {
  /* display:inline (span/pill) KHÔNG transformable theo spec — computed style vẫn báo transform
     nhưng không render. inline-block giữ nguyên hình pill mà transform ăn. */
  display: inline-block;
  transform: translateY(var(--ptdl-stick, 0px));
  will-change: transform;
}
/* Cột số dòng kiểu NocoBase: mặc định hiện số, hover dòng (hoặc đã tick) → đổi thành checkbox */
.ptdl-sheet .ptdl-rownum { color: #8c8c8c; font-size: 12px; }
.ptdl-sheet .ptdl-rowsel { display: none !important; }
.ptdl-sheet .ag-row-hover .ptdl-rowsel,
.ptdl-sheet .ag-row-selected .ptdl-rowsel { display: inline-flex !important; }
.ptdl-sheet .ag-row-hover .ptdl-rownum,
.ptdl-sheet .ag-row-selected .ptdl-rownum { display: none; }
/* Thanh Progress: chữ % dùng tabular-nums (số fixed-width của field-enhancements) → user thấy "font lạ".
   Ép về số THƯỜNG cho khớp phần còn lại của bảng. */
.ptdl-sheet .ag-cell [style*="tabular-nums"] { font-variant-numeric: normal !important; }
/* Căn GIỮA DỌC mọi nội dung ô (AG v36 mặc định block → text/nút dính top khi tăng rowHeight). Căn NGANG
   giữ qua justifyContent trong cellStyle theo align. Chừa ô đang edit + ô gộp (merge có transform sticky riêng). */
.ptdl-sheet .ag-cell:not(.ag-cell-inline-editing):not(.ag-spanned-cell) { display: flex; align-items: center; }
/* Tay cầm RESIZE cột: AG mặc định trong suốt 8px → khó thấy/khó trúng. Cột thường tay cầm ở mép PHẢI (như
   user quen); cột GHIM PHẢI thì AG đặt tay cầm ở mép TRÁI/TRONG (vì mép phải dính viewport, không kéo ra
   ngoài được) → user hay tưởng "cột ghim không resize được". Fix: (1) nới vùng bắt rộng hơn cho dễ trúng,
   (2) hiện VẠCH xanh khi hover để lộ đúng chỗ kéo dãn. */
.ptdl-sheet .ag-header-cell-resize { width: 12px !important; }
.ptdl-sheet .ag-header-cell-resize::after {
  content: ''; position: absolute; top: 16%; bottom: 16%; left: 50%;
  width: 2px; transform: translateX(-50%); border-radius: 1px;
  background: transparent; transition: background 0.12s; pointer-events: none;
}
.ptdl-sheet .ag-header-cell-resize:hover::after { background: var(--ptdl-primary, #1677ff); }
/* Cột tay cầm KÉO-THẢ đổi vị trí dòng: mờ mặc định, hover dòng mới rõ (giống ⤢/số dòng); con trỏ grab. */
.ptdl-sheet .ptdl-drag-cell { justify-content: center; }
.ptdl-sheet .ptdl-drag-cell .ag-drag-handle { opacity: 0.28; color: #8c8c8c; cursor: grab; transition: opacity 0.12s; }
.ptdl-sheet .ag-row-hover .ptdl-drag-cell .ag-drag-handle { opacity: 0.8; }
.ptdl-sheet .ptdl-drag-cell .ag-drag-handle:active { cursor: grabbing; }
/* VẠCH CHỈ VỊ TRÍ THẢ khi kéo dòng (unmanaged drag — AG không tự vẽ gì): line màu primary trên/dưới dòng
   đích, khớp đúng luật thả ở onRowDragEnd (kéo XUỐNG → chèn SAU đích = vạch DƯỚI; kéo LÊN → vạch TRÊN).
   Vẽ bằng ::after overlay (không dùng box-shadow — cell có nền conditional-format sẽ che mất line). */
.ptdl-sheet .ag-row.ptdl-drop-above::after,
.ptdl-sheet .ag-row.ptdl-drop-below::after {
  content: ''; position: absolute; left: 0; right: 0; height: 3px; z-index: 9;
  background: var(--ptdl-primary, #1677ff); border-radius: 2px; pointer-events: none;
}
.ptdl-sheet .ag-row.ptdl-drop-above::after { top: -1.5px; }
.ptdl-sheet .ag-row.ptdl-drop-below::after { bottom: -1.5px; }
/* Dòng ĐANG kéo: mờ đi để phân biệt nguồn/đích (AG set class này khi drag). */
.ptdl-sheet .ag-row.ag-row-dragging { opacity: 0.45; }
`;
let __sheetCssDone = false;
function ensureSheetCss() {
  if (__sheetCssDone || typeof document === 'undefined') return;
  __sheetCssDone = true;
  const s = document.createElement('style');
  s.setAttribute('data-ptdl-sheet', '');
  s.textContent = SHEET_CSS;
  document.head.appendChild(s);
}

// ---------------- interface sets ----------------
// Sửa inline được (có editor bind trong EditableItemModel registry).
const EDITABLE_IFACES = new Set([
  'input', 'textarea', 'email', 'phone', 'url', 'uuid', 'nanoid',
  'integer', 'number', 'percent',
  'select', 'multipleSelect', 'radioGroup', 'checkboxGroup',
  'checkbox', 'boolean',
  'datetime', 'datetimeNoTz', 'dateOnly', 'date', 'time', 'unixTimestamp',
  'm2o', 'o2o', 'oho', 'obo',
]);
// Ẩn hẳn khỏi bảng (không hiển thị nổi / vô nghĩa trong grid).
const HIDE_IFACES = new Set(['password', 'sort', 'attachment', 'attachmentURL', 'richText', 'vditor', 'markdown', 'json', 'subform', 'subtable', 'linkTo']);
// Editor cần chỗ xổ dropdown → dùng popup editor của AG Grid (đặt dưới ô).
const POPUP_IFACES = new Set(['m2o', 'o2o', 'oho', 'obo', 'select', 'multipleSelect', 'checkboxGroup', 'radioGroup', 'datetime', 'datetimeNoTz', 'dateOnly', 'date', 'time']);

// Widget hiển thị của @tuanla90/plugin-field-enhancements dùng lại trong ô (opt-in per-cột, config bằng
// DIALOG NATIVE của widget). Render = gọi renderComponent(value) của field model (1 model/cột, N ô gọi).
// `flow` = key flow settings có uiMode dialog để mở cấu hình. `ifaces` = interface áp dụng.
const SHEET_DISPLAY_WIDGETS: Record<string, { use: string; label: string; flow: string; ifaces: string[] }> = {
  relDate: {
    use: 'PtdlRelativeDateFieldModel',
    label: 'Ngày tương đối',
    flow: 'ptdlRelativeDate',
    ifaces: ['date', 'dateOnly', 'datetime', 'datetimeNoTz', 'unixTimestamp', 'createdAt', 'updatedAt'],
  },
  selBtn: {
    use: 'PtdlSelectButtonsDisplayFieldModel',
    label: 'Nút chọn',
    flow: 'ptdlSelectButtonsDisplay',
    ifaces: ['select', 'multipleSelect'],
  },
  // Rich select (field-enhancements): render quan hệ thành RichRow (avatar/title/subtitle) — DISPLAY biến thể
  // PtdlRichSelectDisplayFieldModel (readPretty). Vào "Hiển thị" của cột quan hệ → có cả nút ⚙ cấu hình
  // (chọn field title/avatar/subtitle qua flow ptdlRichSelectDisplay). Thay cho việc chỉ set editorUse (chỉ
  // hiện lúc sửa). createdBy/updatedBy cũng là belongsTo(users) nên cho luôn.
  richSel: {
    use: 'PtdlRichSelectDisplayFieldModel',
    label: 'Rich select',
    flow: 'ptdlRichSelectDisplay',
    ifaces: ['m2o', 'o2o', 'oho', 'obo', 'createdBy', 'updatedBy'],
  },
};
const displayWidgetsForIface = (iface: string) =>
  Object.entries(SHEET_DISPLAY_WIDGETS)
    .filter(([, w]) => w.ifaces.includes(iface))
    .map(([key, w]) => ({ key, ...w }));

// ---------------- display helpers ----------------
const enumOf = (cf: any): any[] =>
  (Array.isArray(cf?.enum) && cf.enum) || cf?.options?.uiSchema?.enum || [];

const assocLabelKey = (cf: any): string | null =>
  cf?.getComponentProps?.()?.fieldNames?.label ||
  cf?.options?.uiSchema?.['x-component-props']?.fieldNames?.label ||
  null;

function labelOfRecord(cf: any, rec: any): any {
  if (rec == null || typeof rec !== 'object') return rec ?? '';
  const pref = assocLabelKey(cf);
  for (const k of [pref, 'nickname', 'title', 'name', 'label', 'username', 'email', 'id']) {
    if (k && rec[k] != null && typeof rec[k] !== 'object') return rec[k];
  }
  return rec.id ?? '';
}

function displayValue(cf: any, v: any): string {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.map((x) => displayValue(cf, x)).filter((s) => s !== '').join(', ');
  const en = enumOf(cf);
  if (en.length) {
    const o = en.find((o: any) => String(o?.value) === String(v));
    if (o) return String(o.label ?? v);
  }
  if (typeof v === 'object') return String(labelOfRecord(cf, v));
  const i = cf?.interface;
  if (i === 'checkbox' || i === 'boolean') return v ? '✓' : '';
  if (i === 'percent' && typeof v === 'number') return `${Math.round(v * 10000) / 100}%`;
  // datetime/createdAt/updatedAt: server trả ISO UTC ("...T02:09:00.000Z") — cắt chuỗi thô là hiện GIỜ UTC
  // (user VN thấy lệch -7h). Phải convert sang giờ LOCAL của máy (như bảng core). datetimeNoTz lưu "giờ
  // tường" không timezone → giữ nguyên chuỗi, KHÔNG convert (new Date sẽ làm lệch tuỳ máy).
  if ((i === 'datetime' || i === 'createdAt' || i === 'updatedAt') && typeof v === 'string') {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) {
      const p = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
    }
    return v.replace('T', ' ').slice(0, 16);
  }
  if (i === 'datetimeNoTz' && typeof v === 'string') return v.replace('T', ' ').slice(0, 16);
  if ((i === 'date' || i === 'dateOnly') && typeof v === 'string') return v.slice(0, 10);
  return String(v);
}

// ---------------- formula view (engine từ @tuanla90/plugin-formula qua globalThis.__ptdlFormula) ----------------
// Cache theo (formula, row object): AG Grid gọi valueGetter mỗi lần vẽ lại ô (kể cả refreshCells khi
// bôi vùng) — cache để không evaluate lại khi row chưa đổi (row object mới sau mỗi refresh → tự invalidate).
const __fCache = new Map<string, WeakMap<object, any>>();
const IDENT_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
// Field UI-tạo có tên máy (f_abc123) còn user nghĩ theo TITLE → alias title→name để công thức
// viết được cả `Status` lẫn `f_abc123`. Cache alias theo collection.
const __fAlias = new WeakMap<object, Array<[string, string]>>();
function aliasPairs(coll: any): Array<[string, string]> {
  if (!coll) return [];
  let pairs = __fAlias.get(coll);
  if (pairs) return pairs;
  pairs = [];
  const names = new Set((coll.getFields?.() || []).map((f: any) => f?.name));
  for (const f of coll.getFields?.() || []) {
    const t = f?.title;
    if (typeof t === 'string' && t && t !== f.name && IDENT_RE.test(t) && !names.has(t)) {
      pairs.push([t, f.name]);
    }
  }
  __fAlias.set(coll, pairs);
  return pairs;
}
/** Excel viết `=` đơn để so sánh — chuyển thành `==` (ngoài string literal; giữ nguyên ==, !=, >=, <=, =>). */
function excelEq(src: string): string {
  let out = '';
  let i = 0;
  let q: string | null = null;
  while (i < src.length) {
    const c = src[i];
    if (q) {
      out += c;
      if (c === '\\' && q !== '`') {
        out += src[i + 1] ?? '';
        i += 2;
        continue;
      }
      if (c === q) q = null;
      i += 1;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      q = c;
      out += c;
      i += 1;
      continue;
    }
    if (c === '=') {
      const prev = src[i - 1];
      const next = src[i + 1];
      if (prev === '=' || prev === '!' || prev === '<' || prev === '>' || next === '=' ) {
        out += c; // thuộc ==, ===, !=, >=, <=
      } else if (next === '>') {
        out += '=>';
        i += 2;
        continue;
      } else {
        out += '=='; // `=` đơn kiểu Excel → so sánh
      }
      i += 1;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

const stripHtml = (s: string) => s.replace(/<[^>]*>/g, '');

function evalViewFormula(formula: string, row: any, coll?: any): any {
  const lib = (globalThis as any).__ptdlFormula;
  if (!lib?.evaluateFormula) return t('⚠ cần @tuanla90/plugin-formula');
  if (!row || typeof row !== 'object') return '';
  let byRow = __fCache.get(formula);
  if (!byRow) {
    byRow = new WeakMap();
    __fCache.set(formula, byRow);
  }
  if (byRow.has(row)) return byRow.get(row);
  let data = row;
  const pairs = aliasPairs(coll);
  const enumFields = (coll?.getFields?.() || []).filter((f: any) => enumOf(f).length);
  if (pairs.length || enumFields.length) {
    data = { ...row };
    for (const [alias, name] of pairs) if (data[alias] === undefined) data[alias] = row[name];
    // Cột select: thêm `<name>_label` = label của option (value thô vẫn ở `<name>`).
    for (const f of enumFields) {
      const k = `${f.name}_label`;
      if (data[k] === undefined) data[k] = displayValue(f, row[f.name]);
    }
  }
  // Engine chỉ expose `data`/`record` — bọc with(data) để gõ identifier TRẦN như Excel
  // (`qty * price`, `TAG(status_label,...)`); `data.x` vẫn dùng được như thường.
  // LƯU Ý: phải TỰ thêm `return` ngoài cùng — engine thấy chữ `return` (của with-wrapper)
  // sẽ không wrap nữa; thiếu nó cả hàm trả undefined → ô rỗng toàn bộ.
  const src = excelEq(formula);
  const expr = /(^|[^.\w])return[\s(]/.test(src)
    ? src
    : `return (function(){ with (data) { return ( ${src} ); } })();`;
  const res = lib.evaluateFormula(expr, data);
  const out = res && 'error' in res ? `⚠ ${res.error?.message || 'error'}` : res?.value;
  byRow.set(row, out);
  return out;
}
const FormulaCell = (p: any) => {
  const v = p.value;
  if (v === null || v === undefined) return null;
  const c = p.model?.getColCfg?.(p.fcolId) || {};
  if (p.data?.__ptdlSummary) return <SummaryCellText v={v} align={c.align} />;
  // format số theo config cột ƒ (⚙ panel) khi kết quả là number
  const s =
    typeof v === 'number' && (c.thousands || c.decimals !== undefined) ? formatNum(v, c) : String(v);
  if (s.startsWith('<')) return <span dangerouslySetInnerHTML={{ __html: s }} />;
  return <span>{s}</span>;
};

/** Parse 1 ô paste từ Excel/Sheets theo interface field. undefined = bỏ qua field đó. */
function parsePastedValue(cf: any, raw: string): any {
  const t = String(raw ?? '').trim();
  if (t === '') return undefined;
  const i = cf?.interface;
  if (i === 'integer' || i === 'number') {
    const n = Number(t.replace(/,/g, ''));
    return Number.isNaN(n) ? undefined : n;
  }
  if (i === 'percent') {
    const had = t.includes('%');
    const n = Number(t.replace(/[%,]/g, ''));
    if (Number.isNaN(n)) return undefined;
    return had ? n / 100 : n;
  }
  if (i === 'checkbox' || i === 'boolean') {
    return ['1', 'true', 'yes', 'y', 'x', '✓'].includes(t.toLowerCase());
  }
  const en = enumOf(cf);
  if (en.length) {
    const one = (s: string) => {
      const o = en.find(
        (o: any) => String(o?.label).toLowerCase() === s.toLowerCase() || String(o?.value) === s,
      );
      return o?.value;
    };
    if (i === 'multipleSelect' || i === 'checkboxGroup') {
      const vs = t.split(/[,;]/).map((s) => one(s.trim())).filter((v) => v !== undefined);
      return vs.length ? vs : undefined;
    }
    return one(t);
  }
  if (['m2o', 'o2o', 'oho', 'obo', 'o2m', 'm2m'].includes(i)) return undefined; // chưa map được từ text
  return t; // text/date — để server parse/validate
}

const tkOf = (coll: any): string => {
  const tk = coll?.filterTargetKey || 'id';
  return Array.isArray(tk) ? tk[0] || 'id' : tk;
};

// Cột SORT của collection (field type/interface 'sort') — có thì mới cho kéo-thả đổi vị trí DÒNG
// (server action `<coll>:move` cần sortField). scopeKey (nếu có) = sort theo phạm vi (mỗi nhóm 1 dãy thứ tự).
const sortFieldOf = (coll: any): { name: string; scopeKey?: string } | null => {
  for (const f of coll?.getFields?.() || []) {
    if (f?.type === 'sort' || f?.interface === 'sort') {
      const scopeKey = f?.options?.scopeKey || (f as any)?.scopeKey || undefined;
      return { name: f.name, scopeKey };
    }
  }
  // sortable ở cấp collection → NocoBase tự thêm field 'sort'
  if (coll?.options?.sortable || coll?.sortable) return { name: 'sort' };
  return null;
};

// ---------------- custom choice editors (enum select — KHÔNG dùng antd Select) ----------------
// Cột select/multi-select vẽ THẲNG danh sách option trong popup editor (không có ô Select trung
// gian) và commit TRỰC TIẾP qua resource → bấm 1 lần mở list, 1 lần chọn là lưu.
const dotOf = (color?: string) =>
  color ? (
    <span
      style={{
        display: 'inline-block', width: 8, height: 8, borderRadius: '50%', marginRight: 8,
        background: tagColorToHex(color), flex: 'none',
      }}
    />
  ) : null;

// background is a theme token applied at each usage site (PtdlChoiceEditor / PtdlMultiChoiceEditor) —
// this fixed part only carries the structural (non-color) shell.
const choiceListStyle: React.CSSProperties = {
  minWidth: 170, maxHeight: 280, overflowY: 'auto', padding: 4, borderRadius: 8,
  boxShadow: '0 6px 16px rgba(0,0,0,0.14)',
};
const choiceItemStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', padding: '6px 10px', borderRadius: 6, cursor: 'pointer',
  fontSize: 13, lineHeight: 1.3, userSelect: 'none',
};

/** Select đơn / radio: click option → commit trực tiếp + đóng editor. */
function PtdlChoiceEditor(props: any) {
  const { token } = theme.useToken();
  const { data, colDef } = props;
  const options: any[] = props.options || [];
  const cur = props.value;
  const pick = (v: any) => {
    props.api?.stopEditing?.(true); // cancel: giá trị đi đường commit trực tiếp, không qua AG Grid
    props.commit?.(data, colDef?.field, v);
  };
  return (
    <div style={{ ...choiceListStyle, background: token.colorBgElevated }}>
      {cur !== null && cur !== undefined ? (
        <div style={{ ...choiceItemStyle, color: token.colorTextTertiary }} onClick={() => pick(null)}>✕&nbsp; {t('Bỏ chọn')}</div>
      ) : null}
      {options.map((o: any) => {
        const active = String(o?.value) === String(cur);
        return (
          <div
            key={String(o?.value)}
            style={{ ...choiceItemStyle, background: active ? token.colorPrimaryBg : undefined }}
            onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = token.colorFillTertiary; }}
            onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = ''; }}
            onClick={() => pick(o.value)}
          >
            {dotOf(o?.color)}
            <span style={{ flex: 1 }}>{String(o?.label ?? o?.value)}</span>
            {active ? <span style={{ color: token.colorPrimary }}>✓</span> : null}
          </div>
        );
      })}
    </div>
  );
}

/** Multi-select / checkbox group: tick nhiều mục, đóng editor (click ra ngoài/Enter) là commit; Esc = huỷ. */
function PtdlMultiChoiceEditor(props: any) {
  const { token } = theme.useToken();
  const { data, colDef } = props;
  const options: any[] = props.options || [];
  const init = Array.isArray(props.value) ? props.value : props.value != null ? [props.value] : [];
  const [sel, setSel] = React.useState<any[]>(init);
  const selRef = React.useRef(sel);
  selRef.current = sel;
  const changed = React.useRef(false);
  const cancelled = React.useRef(false);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') cancelled.current = true; };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      if (changed.current && !cancelled.current) props.commit?.(data, colDef?.field, selRef.current);
    };
  }, []);
  const toggle = (v: any) => {
    changed.current = true;
    setSel((s) => (s.some((x) => String(x) === String(v)) ? s.filter((x) => String(x) !== String(v)) : [...s, v]));
  };
  return (
    <div style={{ ...choiceListStyle, background: token.colorBgElevated }}>
      {options.map((o: any) => {
        const active = sel.some((x) => String(x) === String(o?.value));
        return (
          <div key={String(o?.value)} style={choiceItemStyle} onClick={() => toggle(o.value)}>
            <span
              style={{
                width: 14, height: 14, marginRight: 8, borderRadius: 3, flex: 'none',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                border: active ? 'none' : `1px solid ${token.colorBorder}`,
                background: active ? token.colorPrimary : 'transparent',
                color: '#fff', fontSize: 10, lineHeight: 1,
              }}
            >
              {active ? '✓' : ''}
            </span>
            {dotOf(o?.color)}
            <span style={{ flex: 1 }}>{String(o?.label ?? o?.value)}</span>
          </div>
        );
      })}
      <div style={{ ...choiceItemStyle, color: token.colorTextTertiary, fontSize: 12 }}>{t('Click ra ngoài để lưu · Esc huỷ')}</div>
    </div>
  );
}

/** Boolean: KHÔNG cần edit mode — click checkbox trên ô là toggle + lưu luôn (nếu có quyền). */
function PtdlBoolCell(props: any) {
  const { token } = theme.useToken();
  if (props.data?.__ptdlSummary) return <SummaryCellText v={props.value} align={props.getAlign?.()} />;
  const v = !!props.value;
  const can = props.canUpdate ? props.canUpdate(props.data) : true;
  return (
    <span
      onClick={(e) => {
        e.stopPropagation();
        if (can) props.commit?.(props.data, props.colDef?.field, !v);
      }}
      style={{
        cursor: 'pointer', display: 'inline-flex', width: 16, height: 16, verticalAlign: 'middle',
        alignItems: 'center', justifyContent: 'center', borderRadius: 4,
        border: v ? 'none' : `1px solid ${token.colorBorder}`,
        background: v ? token.colorPrimary : 'transparent',
        color: '#fff', fontSize: 11, lineHeight: 1,
      }}
    >
      {v ? '✓' : ''}
    </span>
  );
}

// ---------------- cell editor (AG Grid custom React editor — FieldModel path) ----------------
// Chọn xong 1 giá trị là commit trực tiếp (m2o/assoc/date) — KHÔNG áp cho text/number.
const SINGLE_PICK_IFACES = new Set(['m2o', 'o2o', 'oho', 'obo', 'datetime', 'datetimeNoTz', 'dateOnly', 'date', 'time', 'unixTimestamp']);

/**
 * AG Grid v33+ reactive custom editor: nhận { value, onValueChange, data } — value cuối cùng
 * là lần onValueChange gần nhất. FieldModelRenderer đã normalize event→value + IME-safe.
 *
 * UX: dropdown antd render BÊN TRONG wrapper (getPopupContainer) để AG Grid không tưởng
 * mất focus mà ngắt edit; mount xong tự mở dropdown/focus input (mousedown mô phỏng);
 * single-pick chọn xong là stopEditing → commit ngay, không cần click ra ngoài.
 */
function PtdlCellEditor(props: any) {
  const { token } = theme.useToken();
  const { value, onValueChange, data } = props;
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const host = React.useMemo(() => props.getHost?.(), []); // 1 host / cột, cache trên block model
  if (host) host.currentRecord = data;
  const singlePick = !!props.singlePick;
  // Type-to-edit kiểu Excel: mở editor bằng cách GÕ ký tự → ký tự đó THAY giá trị cũ.
  React.useLayoutEffect(() => {
    const k = props.eventKey;
    if (typeof k === 'string' && k.length === 1) {
      if (props.numeric) {
        if (/[0-9.-]/.test(k)) onValueChange(k);
      } else {
        onValueChange(k);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  React.useLayoutEffect(() => {
    host?.setProps({
      value,
      onChange: (v: any) => {
        if (singlePick) {
          // Commit TRỰC TIẾP (không nhờ AG Grid đọc lại value từ editor — tránh race mất giá trị).
          props.api?.stopEditing?.(true);
          props.commit?.(data, props.colDef?.field, v);
        } else {
          onValueChange(v);
        }
      },
      // Giữ dropdown trong DOM của editor — click chọn option không bị AG Grid coi là click ra ngoài.
      getPopupContainer: () => wrapRef.current || document.body,
      // Inline (text/number): input borderless fill nguyên ô — chỉ còn 1 viền xanh của ô đang edit.
      ...(props.inline ? { variant: 'borderless', controls: false } : {}),
    });
  }, [host, value, onValueChange, singlePick]);
  // Tự mở dropdown / focus input khi editor mount (FlowModelRenderer render async → poll ngắn).
  React.useEffect(() => {
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      const el = wrapRef.current;
      if (el) {
        const selector = el.querySelector('.ant-select-selector, .ant-picker');
        const input = el.querySelector('input:not([type=checkbox]), textarea') as HTMLElement | null;
        if (selector) {
          selector.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
          (input || (selector as HTMLElement)).focus?.();
          clearInterval(timer);
          return;
        }
        if (input) {
          input.focus();
          clearInterval(timer);
          return;
        }
        if (el.querySelector('.ant-checkbox, .ant-switch, .ant-radio-group, .ant-rate')) {
          clearInterval(timer);
          return;
        }
      }
      if (tries > 30) clearInterval(timer);
    }, 40);
    return () => clearInterval(timer);
  }, []);
  if (!host) return null;
  const wrapStyle: React.CSSProperties = props.inline
    ? // inline: trong suốt, fill ô — viền/nền do ô AG Grid đảm nhận (1 lớp duy nhất)
      { width: '100%', height: '100%', display: 'flex', alignItems: 'center', padding: '0 8px', position: 'relative' }
    : {
        minWidth: 200,
        width: '100%',
        position: 'relative',
        background: token.colorBgElevated,
        boxShadow: '0 6px 16px rgba(0,0,0,0.14)',
        padding: 4,
        borderRadius: 8,
      };
  return (
    <div ref={wrapRef} className="ptdl-sheet-editor" style={wrapStyle}>
      <FlowModelRenderer model={host} fallback={<span style={{ padding: '0 8px', color: '#999' }}>…</span>} />
    </div>
  );
}

// ---------------- per-column style (header ⚙ khi bật UI editor) ----------------
/**
 * Port đúng `NBColorPicker` của core client-v2 (ColorFieldModel.tsx — không được export ra package):
 * antd ColorPicker + allowClear + trigger hover + preset "Recommended" + onChange chuẩn hoá
 * hex string / null khi clear. Đây là color picker chuẩn mà core dùng trong mọi flow-settings uiSchema.
 */
const NB_RECOMMENDED_COLORS = [
  '#8BBB11', '#52C41A', '#13A8A8', '#1677FF', '#F5222D', '#FADB14',
  '#FA8C164D', '#FADB144D', '#52C41A4D', '#1677FF4D', '#2F54EB4D', '#722ED14D', '#EB2F964D',
];
function PtdlNBColorPicker(props: any) {
  return (
    <AntColorPicker
      allowClear
      size="small"
      trigger="hover"
      destroyTooltipOnHide
      {...props}
      onChange={(color: any) => {
        if (color?.cleared) props.onChange?.(null);
        else props.onChange?.(color.toHexString());
      }}
      presets={[{ label: t('Đề xuất'), colors: NB_RECOMMENDED_COLORS }]}
    />
  );
}

/**
 * Widget cell từ @tuanla90/plugin-field-enhancements (bridge __ptdlFieldEnh — view component thuần React,
 * KHÔNG FlowModel per cell). Tương tác trực tiếp trên ô: click sao / kéo progress → commit luôn.
 */
function widgetCellRenderer(model: any, fieldName: string, cf: any, widget: string) {
  return (p: any) => {
    if (p.data?.__ptdlSummary) {
      return <SummaryCellText v={p.value} align={model.getColCfg(fieldName).align || 'right'} />;
    }
    const fe = (globalThis as any).__ptdlFieldEnh;
    const fallback = <span>{displayValue(cf, p.value)}</span>;
    if (!fe) return fallback;
    const row = p.data;
    const c = model.getColCfg(fieldName); // đọc LIVE — chỉnh config widget trong ⚙ áp ngay
    const can = row?.__ptdlNew ? true : model.canUpdate(row);
    const commit = (v: any) => {
      if (row?.__ptdlNew) model.setDraftValue(fieldName, v);
      else model.commitValue(row, fieldName, v);
    };
    if (widget === 'star' && fe.StarView) {
      const cfg = {
        ...fe.S_DEFAULTS,
        ...(c.starCount ? { count: c.starCount } : {}),
        ...(c.starColor ? { color: c.starColor } : {}),
        ...(c.starHalf ? { allowHalf: true } : {}),
        ...(c.starValue ? { showValue: true } : {}),
      };
      return <fe.StarView cfg={cfg} value={p.value} disabled={!can} onChange={(v: any) => can && commit(v)} />;
    }
    if (widget === 'progress' && fe.LineProgress) {
      const isPercent = cf?.interface === 'percent';
      const cfg = {
        ...fe.P_DEFAULTS,
        ...(c.progressMax ? { max: c.progressMax } : {}),
        ...(c.progressColor ? { colorMode: 'mono', color: c.progressColor } : {}),
        ...(c.progressInfo === false ? { showInfo: false } : {}),
      };
      const percent = fe.computePercent ? fe.computePercent(p.value, cfg, isPercent) : 0;
      return (
        <div style={{ width: '100%', display: 'flex', alignItems: 'center', height: '100%' }}>
          <fe.LineProgress
            cfg={cfg}
            percent={percent}
            onPercent={
              can
                ? (pc: number) => commit(isPercent ? pc / 100 : Math.round(pc * (cfg.max || 100)) / 100)
                : undefined
            }
          />
        </div>
      );
    }
    return fallback;
  };
}

/** Render 1 ô qua widget hiển thị enhancement (Relative date / Select buttons…): gọi renderComponent/render
 *  của field model (1 model/cột — config từ dialog native trong stepParams). Trả JSX hoặc NULL (để renderer
 *  gọi fallback về text thường). Được gọi LIVE trong condCellRenderer → đổi widget KHÔNG cần rebuild colDefs
 *  (không remount header = KHÔNG nháy panel ⚙). set currentRecord để widget refMode='field' đọc đúng dòng. */
function tryRenderDisplayWidget(model: any, fieldName: string, cf: any, p: any): any {
  try {
    const host = model.getWidgetHost?.(fieldName);
    const fm = model.widgetFieldModel?.(fieldName);
    if (!fm) return null;
    if (host) host.currentRecord = p.data;
    // 1 model/cột → PHẢI "bake" value vào element (không đọc props LAZY, vì N ô share model → lẫn value).
    //  - relative-date override renderComponent(value) → element mang value (eager) ✓
    //  - select-buttons dùng bindDisplayField: renderComponent trả null → render() bake value vào
    //    <ButtonGroupView value={props.value}/> (đọc props NGAY lúc gọi, đồng bộ sau setProps) ✓
    let out: any = typeof fm.renderComponent === 'function' ? fm.renderComponent(p.value) : null;
    if (out == null && typeof fm.render === 'function') {
      fm.setProps({ value: p.value });
      out = fm.render();
    }
    return out ?? null;
  } catch (e) {
    return null;
  }
}

/** Cell renderer khi cột có Format rules: match value/label → pill (tái dùng renderPill của conditional-format). */
/** Aggregate client-side trên 1 tập rows (dùng cho group header + fallback summary). */
function clientAgg(rows: any[], field: string, agg: string, coll: any, fc: any): number | null {
  const nums: number[] = [];
  let nonNull = 0;
  let empty = 0;
  const seen = new Set<any>();
  for (const r of rows) {
    const v = fc ? evalViewFormula(fc.formula, r, coll) : r?.[field];
    if (v === null || v === undefined || v === '') {
      empty += 1;
      continue;
    }
    nonNull += 1;
    seen.add(typeof v === 'object' ? (v?.id ?? JSON.stringify(v)) : v);
    const n = Number(v);
    if (!Number.isNaN(n)) nums.push(n);
  }
  const total = rows.length;
  if (agg === 'count') return nonNull; // đã điền (non-empty)
  if (agg === 'empty') return empty;
  if (agg === 'unique') return seen.size; // số giá trị KHÁC NHAU (vd số khách hàng)
  if (agg === 'filledPct') return total ? (nonNull / total) * 100 : null;
  if (!nums.length) return null;
  // sum/avg migrated to @tuanla90/shared (aggSum/aggAvg) — verified byte-identical over the reachable
  // domain (non-empty numeric arrays incl. ±Infinity): shared aggSum's `Number(x)||0` coercion is a
  // no-op for the already-numeric, non-NaN `nums` here, and aggAvg = aggSum/len matches exactly.
  // min/max/range/median/count intentionally KEPT local: shared min/max/range/median use pluckNums
  // (isFinite filter) which drops ±Infinity that OLD Math.min/max/sort preserve; and OLD `count`
  // returns `nonNull` (non-empty incl. non-numeric), not aggCount(nums)=numeric count.
  if (agg === 'sum') return aggSum(nums);
  if (agg === 'avg') return aggAvg(nums);
  if (agg === 'min') return Math.min(...nums);
  if (agg === 'max') return Math.max(...nums);
  if (agg === 'range') return Math.max(...nums) - Math.min(...nums);
  if (agg === 'median') {
    const s = [...nums].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
  return null;
}
/** Ratio (A÷B) trên 1 tập dòng: Σnum / Σden (×100 nếu pct). Đúng ở mọi cấp nhóm (không phải avg cột %). */
function clientRatio(rows: any[], numField: string, denField: string, coll: any, model: any, pct: boolean): number | null {
  const nfc = model._formulaOf?.(numField);
  const dfc = model._formulaOf?.(denField);
  let sn = 0;
  let sd = 0;
  for (const r of rows) {
    const a = Number(nfc ? evalViewFormula(nfc.formula, r, coll) : r?.[numField]);
    const b = Number(dfc ? evalViewFormula(dfc.formula, r, coll) : r?.[denField]);
    if (!Number.isNaN(a)) sn += a;
    if (!Number.isNaN(b)) sd += b;
  }
  if (!sd) return null;
  return (sn / sd) * (pct ? 100 : 1);
}
const AGG_SHORT: Record<string, string> = {
  sum: 'Σ', avg: 'Avg', min: 'Min', max: 'Max', count: '#', empty: '∅', unique: '≠', median: 'Med', range: 'Rng',
};
/** Agg tính chính xác toàn bảng qua server `:query`. Còn lại (empty/unique/median/range/filledPct)
 *  tính client trên dòng đã tải (đánh dấu *). ratio & filledPct hiển thị dạng `<num>%`. */
const SERVER_AGGS = new Set(['sum', 'avg', 'min', 'max', 'count']);

/** ptdlGroupBy chấp nhận string (settings cũ, 1 cấp), string[] (multi-level), mobx OBSERVABLE ARRAY (một số
 *  bản mobx cho Array.isArray=FALSE), HOẶC object array-like {0:a,1:b,…} → luôn trả string[].
 *  DÙNG Array.from cho mọi thứ CÓ length (mảng thật + observable array) → không lệ thuộc Array.isArray;
 *  chỉ object thuần {0,1} mới đi nhánh Object.keys. (Nhánh Object.keys chạy TRÊN observable array = lấy key
 *  nội bộ → rỗng → grouping VỠ; đó là bug đã sửa.) */
function groupFieldsOf(model: any): string[] {
  const v: any = model?.props?.ptdlGroupBy;
  if (typeof v === 'string') return v ? [v] : [];
  if (!v || typeof v !== 'object') return [];
  const src: any[] =
    typeof v.length === 'number'
      ? Array.from(v)
      : Object.keys(v).sort((a, b) => Number(a) - Number(b)).map((k) => v[k]);
  return src.filter((x) => typeof x === 'string' && x);
}
/** Ngăn cách các cấp trong key nhóm — NUL không thể xuất hiện trong label thật. */
const GROUP_KEY_SEP = String.fromCharCode(0);

/** Cột số dòng kiểu NocoBase: hiện số thứ tự (chỉ đếm dòng data), hover/tick → checkbox chọn dòng. */
function PtdlRowNumCell(p: any) {
  const { token } = theme.useToken();
  const model = p.model;
  const d = p.data;
  // Dòng NHÁP: hiện dấu ＋ (giống Airtable) khi setting add-new bật hiển thị dòng ＋ — báo "gõ để thêm dòng".
  if (d?.__ptdlNew) {
    const dm = model?.props?.ptdlAddNewDisplay || 'both';
    if (dm !== 'row' && dm !== 'both') return null;
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', color: token.colorPrimary }}>
        <PlusOutlined style={{ fontSize: 13 }} />
      </span>
    );
  }
  if (!d || d.__ptdlSummary || d.__ptdlGroup || p.node?.rowPinned) return null;
  const tk = tkOf(model?.context?.collection);
  const n = model?._rowNumMap?.get(String(d?.[tk]));
  const sel = !!p.node?.isSelected?.();
  return (
    <span
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}
    >
      {p.showNumber !== false ? <span className="ptdl-rownum">{n ?? ''}</span> : null}
      {p.allowSelect !== false ? (
        <AntCheckbox
          className="ptdl-rowsel"
          checked={sel}
          onClick={(e: any) => e.stopPropagation()}
          onChange={(e: any) => p.node?.setSelected?.(!!e.target.checked)}
        />
      ) : null}
    </span>
  );
}
function PtdlSelHeader(p: any) {
  const { token } = theme.useToken();
  const [, force] = React.useReducer((x: number) => x + 1, 0);
  React.useEffect(() => {
    const f = () => force();
    p.api?.addEventListener?.('selectionChanged', f);
    p.api?.addEventListener?.('modelUpdated', f);
    return () => {
      p.api?.removeEventListener?.('selectionChanged', f);
      p.api?.removeEventListener?.('modelUpdated', f);
    };
  }, [p.api]);
  let total = 0;
  let sel = 0;
  p.api?.forEachNode?.((n: any) => {
    const d = n?.data;
    if (!d || d.__ptdlGroup || d.__ptdlSummary || d.__ptdlNew) return;
    total++;
    if (n.isSelected?.()) sel++;
  });
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
      <AntCheckbox
        checked={total > 0 && sel >= total}
        indeterminate={sel > 0 && sel < total}
        onChange={(e: any) => (e.target.checked ? p.api?.selectAll?.() : p.api?.deselectAll?.())}
      />
    </span>
  );
}

/** Chuỗi tổng hợp cho 1 nhóm theo các cột đã bật Summary — dùng chung header nhóm + ô merge. */
function groupAggLines(model: any, coll: any, rows: any[]): string[] {
  const titleOf = (f: string) => model._formulaOf(f)?.title || coll?.getField?.(f)?.title || f;
  return (model.summaryDefs() as any[])
    .map((d: any) => {
      if (d.agg === 'ratio') {
        const val = clientRatio(rows || [], d.num, d.den, coll, model, d.pct);
        if (val === null || val === undefined) return null;
        const dec = d.decimals ?? 1;
        return `${titleOf(d.field)}: ${Number(val).toFixed(dec)}${d.pct ? '%' : ''}`;
      }
      const fc = model._formulaOf(d.field);
      const val = clientAgg(rows || [], d.field, d.agg, coll, fc);
      if (val === null || val === undefined) return null;
      if (d.agg === 'filledPct') return `${titleOf(d.field)}: ${Number(val).toFixed(0)}%`;
      const n = d.agg === 'avg' ? Math.round(Number(val) * 100) / 100 : Number(val);
      const sym = model.getColCfg(d.field).summaryHideIcon ? '' : AGG_SHORT[d.agg] || d.agg;
      return `${titleOf(d.field)}: ${sym ? sym + ' ' : ''}${formatNum(n, { thousands: true })}`;
    })
    .filter(Boolean) as string[];
}


// ---------------- Stage 2: group header per-cell (subtotal thẳng dưới cột measure) ----------------
/** Ô nhãn nhóm (cột data đầu, colSpan qua các cột dim): toggle + tên + count + ＋ thêm dòng. */
const PtdlGroupLabelCell = observer(function PtdlGroupLabelCell({ model, p }: any) {
  // token TỪNG là free variable (thiếu dòng này) → ReferenceError khi render nhãn nhóm rows-mode.
  const { token } = theme.useToken();
  // ĐỌC ptdlGroupRev (observable) → tự re-render khi toggleGroup, đồng bộ icon với data.
  // (_groupOpen là Map thường; toggleGroup bump ptdlGroupRev + rebuild rowData nhưng AG KHÔNG
  //  tự re-render ô header nhóm vì "value" ô không đổi → icon trễ 1 nhịp nếu không subscribe.)
  void model.props.ptdlGroupRev;
  const d = p.data || {};
  const key = d.__key ?? d.__lbl;
  const lvl = d.__lvl || 0;
  const open = model.isGroupOpen(key);
  return (
    <div
      onClick={() => model.toggleGroup(key)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        height: '100%',
        paddingLeft: lvl * 18,
        cursor: 'pointer',
        userSelect: 'none',
        fontWeight: 600,
        fontSize: 12.5,
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ color: token.colorTextTertiary, display: 'inline-flex', flex: 'none' }}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.__lbl}</span>
      <span style={{ color: token.colorTextTertiary, fontWeight: 400, flex: 'none' }}>({d.__count})</span>
      {model.props.ptdlAllowAdd !== false ? (
        <span
          className="ptdl-gadd"
          title={t('Thêm dòng vào nhóm này')}
          style={{ display: 'inline-flex', flex: 'none' }}
          onClick={(e: any) => {
            e.stopPropagation();
            model.addRowToGroup(d.__rows?.[0], lvl, p.api);
          }}
        >
          <Plus size={13} />
        </span>
      ) : null}
    </div>
  );
});
/** Sticky nhóm (rows mode): OVERLAY React NỔI, mỗi cấp 1 dòng (chain = prefix các cấp ĐÃ DOCK, tick per-level
 *  anchor quyết định). Container TRONG SUỐT — dòng nào chưa dock thì slot đó xuyên thấu (header thật hiện
 *  qua, tự trượt vào slot bằng chuyển động cuộn rồi "đóng băng"); từng dòng nền đục đè đúng chỗ header thật
 *  vừa rời đi → không che dòng nào khác, không khoảng trắng, không jitter (layout bảng không đổi). */
const PtdlStickyGroupStack = observer(function PtdlStickyGroupStack({ model, coll, getApi, chain, top, rowHeight }: any) {
  void model.props.ptdlGroupRev; // đồng bộ icon mở/đóng theo toggleGroup
  // token TỪNG là free variable (thiếu dòng này) → ReferenceError khi sticky stack dock nhóm đầu tiên.
  const { token } = theme.useToken();
  const boxRef = React.useRef<any>(null);
  // Vị trí các cột CÓ Summary — đo từ Ô HEADER CỘT thật (.ag-header-cell[col-id]) nên tự đúng cả khi
  // resize/pin/cuộn ngang. Sticky row nhờ đó hiện subtotal Ở ĐÚNG CỘT như dòng header thật → hết cảnh
  // "header bị sticky đè thì mất Σ, header khác lại có" (user: summary sai sai khó hiểu). Interval nhẹ
  // re-đo (400ms, setState chỉ khi đổi).
  const [sumCols, setSumCols] = React.useState<any[]>([]);
  React.useEffect(() => {
    const NUMISH = ['integer', 'number', 'percent', 'datetime', 'datetimeNoTz', 'dateOnly', 'date', 'time', 'unixTimestamp', 'createdAt', 'updatedAt'];
    const measure = () => {
      const host = boxRef.current?.parentElement;
      if (!host) return;
      const gr = host.getBoundingClientRect();
      const out: any[] = [];
      host.querySelectorAll('.ag-header-cell[col-id]').forEach((h: any) => {
        const colId = h.getAttribute('col-id');
        if (!colId || colId.startsWith('__ptdl') || colId.startsWith('ag-')) return;
        const cfg = model.getColCfg(colId);
        if (!cfg?.summary) return;
        const r = h.getBoundingClientRect();
        const cf = coll?.getField?.(colId);
        const align = cfg.align || (cf && NUMISH.includes(cf.interface) ? 'right' : 'left');
        out.push({ colId, left: Math.round(r.left - gr.left), width: Math.round(r.width), align });
      });
      setSumCols((cur) => (JSON.stringify(cur) === JSON.stringify(out) ? cur : out));
    };
    measure();
    const iv = setInterval(measure, 400);
    return () => clearInterval(iv);
  }, [model, coll]);
  if (!chain || !chain.length) return null;
  return (
    <div
      ref={boxRef}
      data-ptdl-sticky-stack=""
      style={{
        position: 'absolute', top, left: 0, right: 0, height: chain.length * rowHeight, zIndex: 5,
        // TRONG SUỐT: slot chưa dock xuyên thấu — header thật hiện qua và trượt vào slot. Nền đục ở TỪNG DÒNG.
        background: 'transparent',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {chain.map((g: any) => {
        const lvl = g.__lvl || 0;
        const open = model.isGroupOpen(g.__key);
        return (
          <div
            key={g.__key}
            onClick={(e: any) => { e.stopPropagation(); model.toggleGroup(g.__key); }}
            style={{
              height: rowHeight, flex: 'none', display: 'flex', alignItems: 'center', gap: 6,
              paddingLeft: 90 + lvl * 18, paddingRight: 12,
              fontWeight: 600, fontSize: 12.5, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
              borderBottom: `1px solid ${token.colorBorderSecondary}`,
              position: 'relative', zIndex: chain.length - lvl,
              background: token.colorBgElevated,
              boxShadow: '0 1px 3px rgba(0,0,0,.05)',
            }}
          >
            <span style={{ color: token.colorTextTertiary, display: 'inline-flex', flex: 'none' }}>
              {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.__lbl}</span>
            <span style={{ color: token.colorTextTertiary, fontWeight: 400, flex: 'none' }}>({g.__count})</span>
            {model.props.ptdlAllowAdd !== false ? (
              <span
                className="ptdl-gadd"
                title={t('Thêm dòng vào nhóm này')}
                style={{ display: 'inline-flex', flex: 'none' }}
                onClick={(e: any) => {
                  e.stopPropagation();
                  model.addRowToGroup(g.__rows?.[0], lvl, getApi?.());
                }}
              >
                <Plus size={13} />
              </span>
            ) : null}
            {/* Subtotal per-cột — giống hệt dòng header thật (groupSubtotalText), đặt tuyệt đối theo cột đo được */}
            {sumCols.map((c: any) => (
              <span
                key={c.colId}
                style={{
                  position: 'absolute', left: c.left, width: c.width, top: 0, bottom: 0,
                  display: 'flex', alignItems: 'center',
                  justifyContent: c.align === 'right' ? 'flex-end' : c.align === 'center' ? 'center' : 'flex-start',
                  padding: '0 6px', fontWeight: 600, fontSize: 12,
                  color: token.colorTextSecondary,
                  overflow: 'hidden', whiteSpace: 'nowrap', pointerEvents: 'none',
                }}
              >
                {groupSubtotalText(model, coll, c.colId, g.__rows)}
              </span>
            ))}
          </div>
        );
      })}
    </div>
  );
});
/** Text subtotal của 1 cột measure cho 1 nhóm (giá trị, không kèm tên cột). */
function groupSubtotalText(model: any, coll: any, colId: string, rows: any[]): string {
  const cfg = model.getColCfg(colId);
  if (!cfg.summary) return '';
  if (cfg.summary === 'ratio') {
    const v = clientRatio(rows || [], cfg.ratioNum, cfg.ratioDen, coll, model, cfg.ratioPct !== false);
    return v == null ? '' : `${Number(v).toFixed(cfg.decimals ?? 1)}${cfg.ratioPct !== false ? '%' : ''}`;
  }
  const v = clientAgg(rows || [], colId, cfg.summary, coll, model._formulaOf(colId));
  if (v == null) return '';
  if (cfg.summary === 'filledPct') return `${Number(v).toFixed(0)}%`;
  const n = cfg.summary === 'avg' ? Math.round(Number(v) * 100) / 100 : Number(v);
  const icon = cfg.summaryHideIcon ? '' : AGG_SHORT[cfg.summary] || '';
  return `${icon} ${formatNum(n, { thousands: true })}`.trim();
}
/** Thứ tự colId cột DATA đang hiển thị THẬT (theo AG, KHÔNG theo colDefs vì AG giữ thứ tự drag riêng). */
function displayedDataColIds(api: any): string[] {
  return (api?.getAllDisplayedColumns?.() || [])
    .map((c: any) => c.getColId?.())
    .filter((id: any) => id && !String(id).startsWith('__ptdl') && !String(id).startsWith('ag-'));
}
/** Bọc cellRenderer 1 cột để render dòng nhóm (__ptdlGroup): cột data ĐẦU (theo AG) = nhãn, cột có Summary = subtotal, còn lại rỗng. */
function groupCellRenderer(base: any, model: any, coll: any, colId: string, defAlign: string | undefined) {
  return (p: any) => {
    const { token } = theme.useToken();
    if (p.data?.__ptdlGroup) {
      const cols = displayedDataColIds(p.api);
      if (cols[0] === colId) return <PtdlGroupLabelCell model={model} p={p} />;
      const cfg = model.getColCfg(colId);
      if (!cfg.summary) return null;
      const align = cfg.align || defAlign; // khớp ĐÚNG align của data cell (formula→trái, số/ngày→phải)
      return (
        <div style={{ textAlign: align as any, fontWeight: 600, fontSize: 12, color: token.colorTextSecondary }}>
          {groupSubtotalText(model, coll, colId, p.data.__rows)}
        </div>
      );
    }
    return typeof base === 'function' ? base(p) : p.valueFormatted ?? p.value ?? null;
  };
}

const SummaryCellText = ({ v, align }: { v: any; align?: string }) => {
  const { token } = theme.useToken();
  return (
  <div
    style={{
      width: '100%',
      textAlign: (align as any) || 'left',
      fontWeight: 600,
      fontSize: 12,
      color: token.colorTextSecondary,
    }}
  >
    {v ?? ''}
  </div>
  );
};

/** Renderer thống nhất cho mọi cột data: align + number format + Format rules + summary — đọc cfg LIVE. */
function condCellRenderer(model: any, fieldName: string, cf: any, defaultAlign?: string) {
  const numeric = ['integer', 'number', 'percent'].includes(cf?.interface);
  return (p: any) => {
    const { token } = theme.useToken();
    const c = model.getColCfg(fieldName);
    if (p.data?.__ptdlSummary) return <SummaryCellText v={p.value} align={c.align || defaultAlign} />;
    // Dòng NHÁP (thêm mới): ô EDITABLE đầu (đọc live model._firstEditableCol) + đang trống → gợi ý
    // "Thêm dòng mới…" (giống Airtable) khi setting bật hiển thị dòng ＋. Nhìn là biết gõ vào đó.
    if (p.data?.__ptdlNew && model._firstEditableCol === fieldName) {
      const dm = model.props.ptdlAddNewDisplay || 'both';
      const rawV = p.value;
      if ((dm === 'row' || dm === 'both') && (rawV === null || rawV === undefined || rawV === '')) {
        return <span style={{ color: token.colorTextPlaceholder }}>{model.translate?.('Thêm dòng mới…') || 'Thêm dòng mới…'}</span>;
      }
    }
    // Widget hiển thị enhancement — đọc LIVE (không structural) → đổi widget/config KHÔNG rebuild colDefs →
    // header không remount → panel ⚙ không nháy tắt-bật. Dòng nhóm để renderer nhóm lo.
    if (
      !p.data?.__ptdlGroup &&
      c.displayWidget &&
      SHEET_DISPLAY_WIDGETS[c.displayWidget]?.ifaces?.includes(cf?.interface)
    ) {
      const w = tryRenderDisplayWidget(model, fieldName, cf, p);
      if (w != null) return w;
    }
    const raw = p.value;
    let label: string;
    if (numeric && (c.thousands || c.decimals !== undefined) && raw !== null && raw !== undefined && raw !== '' && !Number.isNaN(Number(raw))) {
      label = formatNum(Number(raw), c);
    } else {
      label = displayValue(cf, raw);
    }
    const rules = c.rules || [];
    const bridge = (globalThis as any).__ptdlCondFmt;
    const m = bridge?.matchRule?.(rules, raw, label);
    if (!m) return <span>{label}</span>;
    if (bridge?.renderPill) {
      return bridge.renderPill({ text: label, color: m.color, background: m.background, icon: m.icon, radius: 24 });
    }
    // fallback nếu plugin-conditional-format chưa cài/bật
    return (
      <span style={{ color: m.color, background: m.background, borderRadius: 999, padding: m.background ? '0 8px' : 0 }}>
        {label}
      </span>
    );
  };
}

/** Editor danh sách Format rules trong panel ⚙ (value/label khớp → màu chữ + nền). */
function PtdlRulesEditor({ model, fieldName, cfg, upd }: any) {
  const rules: any[] = cfg.rules || [];
  // giữ mảng (kể cả rỗng) — bật/tắt renderer là thay đổi cấu trúc làm remount popover
  const set = (next: any[]) => upd({ rules: next });
  return (
    <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 8, marginTop: 4 }}>
      <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>{t('Format rules (khớp value/label)')}</div>
      {rules.map((r, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <input
            placeholder={t('Giá trị…')}
            value={r.value || ''}
            onChange={(e) => {
              const next = rules.slice();
              next[i] = { ...r, value: e.target.value };
              set(next);
            }}
            style={{ flex: 1, minWidth: 0, border: '1px solid #d9d9d9', borderRadius: 4, padding: '1px 6px', fontSize: 12 }}
          />
          <PtdlNBColorPicker
            value={r.color || null}
            onChange={(hex: string | null) => {
              const next = rules.slice();
              next[i] = { ...r, color: hex || undefined };
              set(next);
            }}
          />
          <PtdlNBColorPicker
            value={r.background || null}
            onChange={(hex: string | null) => {
              const next = rules.slice();
              next[i] = { ...r, background: hex || undefined };
              set(next);
            }}
          />
          <span style={{ cursor: 'pointer', color: '#999' }} onClick={() => set(rules.filter((_, j) => j !== i))}>
            ✕
          </span>
        </div>
      ))}
      <Button size="small" onClick={() => set([...rules, { value: '' }])}>
        {t('+ Quy tắc')}
      </Button>
    </div>
  );
}

function PtdlColStylePanel({ model, fieldName, inDialog }: any) {
  const [cfg, setCfg] = React.useState<any>(() => ({ ...model.getColCfg(fieldName) }));
  const upd = (patch: any) => {
    const next = { ...cfg, ...patch };
    setCfg(next);
    model.setColCfg(fieldName, patch);
  };
  // Cột số dùng được cho Ratio (tử/mẫu): field số thật + cột formula ảo.
  const numCols: Array<{ value: string; label: string; type?: string; iface?: string }> = [];
  for (const f of model.context.collection?.getFields?.() || []) {
    if (['integer', 'number', 'percent'].includes(f?.interface))
      numCols.push({ value: f.name, label: (typeof f.title === 'string' && f.title) || f.name, type: f.type, iface: f.interface });
  }
  for (const fc of model.props.ptdlFormulas || [])
    if (fc?.key) numCols.push({ value: `__f_${fc.key}`, label: `ƒ ${fc.title || fc.key}` });
  // Dùng house style SettingRow (label trái cố định + control) thay hàng tự chế.
  const Row = (p: any) => <SettingRow labelWidth={96} style={{ marginBottom: 10 }} {...p} />;
  // Trong POPOVER ⚙ (header): portal dropdown VÀO panel để click không rơi "ngoài Popover" → không đóng panel.
  // Trong DIALOG settings (tab Cột, inDialog): panel nằm trong Modal — portal vào panel 264px bị chật/kẹt dưới,
  // để MẶC ĐỊNH (body) cho dropdown/colorpicker nổi ĐÚNG trên Modal (antd tự xếp z-index cao hơn).
  const rootRef = React.useRef<any>(null);
  const pop = inDialog ? undefined : () => rootRef.current || document.body;
  const Color = ({ k }: { k: string }) => (
    <PtdlNBColorPicker value={cfg[k] || null} onChange={(hex: string | null) => upd({ [k]: hex || undefined })} getPopupContainer={pop} />
  );
  return (
    <div ref={rootRef} style={{ width: 264 }}>
      <Row label={t('Căn lề')}>
        <SegmentedGroup
          value={cfg.align || 'left'}
          onChange={(v: any) => upd({ align: v })}
          options={[
            { value: 'left', label: t('Trái') },
            { value: 'center', label: t('Giữa') },
            { value: 'right', label: t('Phải') },
          ]}
        />
      </Row>
      <Row label={t('Chữ đậm')}>
        <AntSwitch size="small" checked={!!cfg.bold} onChange={(v: any) => upd({ bold: v || undefined })} />
      </Row>
      <Row label={t('Màu chữ')}>
        <Color k="color" />
      </Row>
      <Row label={t('Nền')}>
        <Color k="bg" />
      </Row>
      <Row label={t('Màu tiêu đề')}>
        <Color k="headerColor" />
      </Row>
      <Row label={t('Tiêu đề đậm')}>
        <AntSwitch size="small" checked={!!cfg.headerBold} onChange={(v: any) => upd({ headerBold: v || undefined })} />
      </Row>
      <Row label={t('Độ rộng')}>
        <InputNumber
          size="small"
          min={60}
          max={800}
          value={cfg.width}
          onChange={(v: any) => upd({ width: v || undefined })}
          style={{ width: 90 }}
        />
      </Row>
      <Row label={t('Ghim')}>
        <AntSelect
          style={{ width: 120 }}
          getPopupContainer={pop}
          value={cfg.pinned || ''}
          onChange={(v: any) => upd({ pinned: v || undefined })}
          options={[
            { value: '', label: t('Không') },
            { value: 'left', label: t('Trái') },
            { value: 'right', label: t('Phải') },
          ]}
        />
      </Row>
      {model.isAssocField?.(fieldName) && model.flowEngine?.getModelClass?.('PtdlRichSelectFieldModel') ? (
        <Row label={t('Trình sửa')}>
          <AntSelect
            style={{ width: 120 }}
            getPopupContainer={pop}
            value={cfg.editorUse || ''}
            onChange={(v: any) => upd({ editorUse: v || undefined })}
            options={[
              { value: '', label: t('Mặc định') },
              { value: 'PtdlRichSelectFieldModel', label: t('Chọn nâng cao') },
            ]}
          />
        </Row>
      ) : null}
      {(() => {
        const iface = model.context.collection?.getField?.(fieldName)?.interface;
        const widgets = displayWidgetsForIface(iface);
        if (!widgets.length) return null;
        return (
          <Row label={t('Hiển thị')}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <AntSelect
                style={{ width: 120 }}
                getPopupContainer={pop}
                value={cfg.displayWidget || ''}
                onChange={(v: any) => {
                  upd({ displayWidget: v || undefined, displayWidgetParams: undefined });
                  model._widgetHosts?.clear?.();
                }}
                options={[{ value: '', label: t('Mặc định') }, ...widgets.map((w) => ({ value: w.key, label: t(w.label) }))]}
              />
              {cfg.displayWidget ? (
                <Button
                  size="small"
                  icon={<SlidersHorizontal size={14} />}
                  title={t('Cấu hình widget (hộp thoại gốc)')}
                  onClick={async () => {
                    await model.configColWidget(fieldName);
                    setCfg({ ...model.getColCfg(fieldName) });
                  }}
                />
              ) : null}
            </div>
          </Row>
        );
      })()}
      {model.isNumericField?.(fieldName) ? (
        <Row label={t('Widget')}>
          <AntSelect
            style={{ width: 120 }}
            getPopupContainer={pop}
            value={cfg.widget || ''}
            onChange={(v: any) => upd({ widget: v || undefined })}
            options={[
              { value: '', label: t('Mặc định') },
              { value: 'star', label: t('★ Chấm sao') },
              { value: 'progress', label: t('▬ Thanh tiến độ') },
            ]}
          />
        </Row>
      ) : null}
      {cfg.widget === 'star' ? (
        <>
          <Row label={t('Số sao tối đa')}>
            <InputNumber size="small" min={2} max={10} value={cfg.starCount ?? 5} onChange={(v: any) => upd({ starCount: v || undefined })} style={{ width: 90 }} />
          </Row>
          <Row label={t('Màu sao')}>
            <PtdlNBColorPicker value={cfg.starColor || null} onChange={(hex: string | null) => upd({ starColor: hex || undefined })} getPopupContainer={pop} />
          </Row>
          <Row label={t('Nửa sao')}>
            <AntSwitch size="small" checked={!!cfg.starHalf} onChange={(v: any) => upd({ starHalf: v || undefined })} />
          </Row>
          <Row label={t('Hiện số')}>
            <AntSwitch size="small" checked={!!cfg.starValue} onChange={(v: any) => upd({ starValue: v || undefined })} />
          </Row>
        </>
      ) : null}
      {cfg.widget === 'progress' ? (
        <>
          <Row label={t('Giá trị đầy (100%)')}>
            <InputNumber size="small" min={1} value={cfg.progressMax ?? 100} onChange={(v: any) => upd({ progressMax: v || undefined })} style={{ width: 90 }} />
          </Row>
          <Row label={t('Màu thanh')}>
            <PtdlNBColorPicker value={cfg.progressColor || null} onChange={(hex: string | null) => upd({ progressColor: hex || undefined })} getPopupContainer={pop} />
          </Row>
          <Row label={t('Hiện %')}>
            <AntSwitch size="small" checked={cfg.progressInfo !== false} onChange={(v: any) => upd({ progressInfo: v ? undefined : false })} />
          </Row>
        </>
      ) : null}
      {model.isNumericField?.(fieldName) || String(fieldName).startsWith('__f_') ? (
        <>
          <Row label={t('Dấu phân cách nghìn')}>
            <AntSwitch size="small" checked={!!cfg.thousands} onChange={(v: any) => upd({ thousands: v || undefined })} />
          </Row>
          <Row label={t('Số lẻ')}>
            <InputNumber
              size="small"
              min={0}
              max={6}
              value={cfg.decimals}
              onChange={(v: any) => upd({ decimals: v === null || v === undefined ? undefined : v })}
              style={{ width: 90 }}
            />
          </Row>
        </>
      ) : null}
      <Row label={t('Tổng hợp')}>
        <AntSelect
          style={{ width: 140 }}
          getPopupContainer={pop}
          value={cfg.summary || ''}
          onChange={(v: any) => upd({ summary: v || undefined })}
          options={
            model.isNumericField?.(fieldName) || String(fieldName).startsWith('__f_')
              ? [
                  { value: '', label: t('Không') },
                  { value: 'sum', label: t('Tổng (Σ)') },
                  { value: 'avg', label: t('Trung bình') },
                  { value: 'median', label: t('Trung vị') },
                  { value: 'min', label: t('Nhỏ nhất') },
                  { value: 'max', label: t('Lớn nhất') },
                  { value: 'range', label: t('Khoảng (max−min)') },
                  { value: 'count', label: t('Count (đã điền)') },
                  { value: 'empty', label: t('Empty (trống)') },
                  { value: 'unique', label: t('Unique (khác nhau)') },
                  { value: 'filledPct', label: t('Đã điền %') },
                  { value: 'ratio', label: t('Tỉ lệ A÷B') },
                ]
              : [
                  { value: '', label: t('Không') },
                  { value: 'count', label: t('Count (đã điền)') },
                  { value: 'empty', label: t('Empty (trống)') },
                  { value: 'unique', label: t('Unique (khác nhau)') },
                  { value: 'filledPct', label: t('Đã điền %') },
                ]
          }
        />
      </Row>
      {cfg.summary && !['ratio', 'filledPct'].includes(cfg.summary) ? (
        <Row label={t('Ký hiệu (Σ …)')}>
          <AntSwitch
            size="small"
            checked={!cfg.summaryHideIcon}
            onChange={(v: any) => upd({ summaryHideIcon: v ? undefined : true })}
          />
        </Row>
      ) : null}
      {cfg.summary === 'ratio' ? (
        <>
          <Row label={t('Tử số (A)')}>
            <ColumnSelect
              getPopupContainer={pop}
              style={{ width: 140 }}
              placeholder={t('chọn cột')}
              value={cfg.ratioNum || undefined}
              onChange={(v: any) => upd({ ratioNum: v || undefined })}
              options={numCols}
            />
          </Row>
          <Row label={t('Mẫu số (B)')}>
            <ColumnSelect
              getPopupContainer={pop}
              style={{ width: 140 }}
              placeholder={t('chọn cột')}
              value={cfg.ratioDen || undefined}
              onChange={(v: any) => upd({ ratioDen: v || undefined })}
              options={numCols}
            />
          </Row>
          <Row label={t('× 100 (hiện %)')}>
            <AntSwitch size="small" checked={cfg.ratioPct !== false} onChange={(v: any) => upd({ ratioPct: v ? undefined : false })} />
          </Row>
        </>
      ) : null}
      <PtdlRulesEditor model={model} fieldName={fieldName} cfg={cfg} upd={upd} />
      <Button
        size="small"
        style={{ marginTop: 8 }}
        onClick={() => {
          model.resetColCfg(fieldName);
          setCfg({});
        }}
      >
        {t('Đặt lại')}
      </Button>
    </div>
  );
}

/** Thanh "‹ Back + tiêu đề" cho các trang con trong PtdlColMenu. */
function PtdlColMenuBack({ onBack, title }: any) {
  const { token } = theme.useToken();
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        marginBottom: 10,
        paddingBottom: 8,
        borderBottom: `1px solid ${token.colorBorderSecondary}`,
      }}
    >
      <span
        onClick={onBack}
        style={{ cursor: 'pointer', color: token.colorPrimary, fontSize: 13, display: 'inline-flex', alignItems: 'center' }}
      >
        <ChevronLeft size={15} />
        {t('Quay lại')}
      </span>
      <span style={{ fontSize: 13, fontWeight: 600, color: token.colorText }}>{title}</span>
    </div>
  );
}

/** Form nhỏ nhập title + công thức (dùng cho Chèn / Sửa cột ƒ). */
// Danh mục hàm phân nhóm cho popover "ƒ" (hữu ích hơn dump 400 tên). Đồng bộ HELP_GROUPS của
// @tuanla90/plugin-formula. Bấm 1 tên → chèn NAME() + đặt con trỏ TRONG ngoặc.
const FORMULA_FN_GROUPS: Array<[string, string[]]> = [
  ['Văn bản', ['CONCATENATE', 'TEXTJOIN', 'LEFT', 'RIGHT', 'MID', 'UPPER', 'LOWER', 'PROPER', 'TRIM', 'LEN', 'SUBSTITUTE', 'TEXT', 'REPT']],
  ['Logic', ['IF', 'IFS', 'SWITCH', 'AND', 'OR', 'NOT', 'IFERROR', 'ISBLANK', 'ISNUMBER']],
  ['Số', ['SUM', 'AVERAGE', 'MIN', 'MAX', 'COUNT', 'ROUND', 'ROUNDUP', 'ROUNDDOWN', 'ABS', 'MOD', 'POWER', 'CEILING', 'FLOOR']],
  ['Ngày', ['TODAY', 'NOW', 'DATE', 'YEAR', 'MONTH', 'DAY', 'DATEDIF', 'EDATE']],
  ['Tra cứu', ['VLOOKUP', 'INDEX', 'MATCH', 'CHOOSE']],
  ['HTML (định dạng ô)', ['B', 'I', 'U', 'BR', 'COLOR', 'BG', 'TAG', 'DOT', 'LINK', 'IMG']],
];

/** Vài công thức mẫu suy ra từ field thật của collection (bấm để nạp làm điểm bắt đầu). */
function ptdlFormulaSamples(coll: any): Array<{ label: string; formula: string }> {
  const fields = (coll?.getFields?.() || []).filter((f: any) => f?.name && f?.interface && !HIDE_IFACES.has(f.interface));
  const pick = (ifaces: string[]) => fields.filter((f: any) => ifaces.includes(f.interface)).map((f: any) => f.name);
  const nums = pick(['number', 'integer', 'percent']);
  const texts = pick(['input', 'textarea', 'email', 'phone', 'url']);
  const enums = fields.filter((f: any) => enumOf(f).length).map((f: any) => f.name);
  const dates = pick(['datetime', 'date', 'createdAt', 'updatedAt', 'datetimeNoTz', 'unixTimestamp']);
  const s: Array<{ label: string; formula: string }> = [];
  if (nums.length >= 2) s.push({ label: t('Nhân hai cột số'), formula: `${nums[0]} * ${nums[1]}` });
  else if (nums.length === 1) s.push({ label: t('Làm tròn số'), formula: `ROUND(${nums[0]}, 0)` });
  if (texts.length >= 2) s.push({ label: t('Nối chuỗi'), formula: `CONCATENATE(${texts[0]}, " - ", ${texts[1]})` });
  else if (texts.length === 1) s.push({ label: t('Viết hoa'), formula: `UPPER(${texts[0]})` });
  if (enums.length) s.push({ label: t('Gắn thẻ màu theo trạng thái'), formula: `TAG(${enums[0]}_label, "blue")` });
  if (nums.length) s.push({ label: t('Điều kiện IF'), formula: `IF(${nums[0]} > 0, TAG("Có", "green"), TAG("Không", "red"))` });
  if (dates.length) s.push({ label: t('Định dạng ngày'), formula: `TEXT(${dates[0]}, "DD/MM/YYYY")` });
  if (!s.length) s.push({ label: t('Ví dụ'), formula: 'qty * price' }, { label: t('Nối chuỗi'), formula: 'CONCATENATE(name, " - ", status)' });
  return s;
}

/**
 * Ô nhập CÔNG THỨC dùng chung (form Chèn cột ƒ + popover "Công thức" toolbar). Tối ưu UX kiểu "calculated
 * field": textarea + [ƒ Hàm] (danh sách phân nhóm) + [＋ Trường] (chèn tên field, có _label cho select) +
 * [Mẫu] (nạp ví dụ) + [✨ AI viết hộ] (tái dùng AiCodegenButton của @tuanla90/shared → endpoint
 * ptdlComputed:aiWrite của plugin-formula, tự chạy thử) + XEM TRƯỚC sống trên bản ghi đầu.
 * Nested popover đặt getPopupContainer = container CHÍNH nó → click trong popover con KHÔNG đóng popover cha
 * (bẫy cũ: portal ra body = "ngoài" → đóng cả cụm).
 */
function PtdlFormulaField({ model, value, onChange, onCommit, rows = 3, autoFocus, showAi = true, containPopups = false }: any) {
  const { token } = theme.useToken();
  const coll = model.context.collection;
  const api = model.context?.api || model.flowEngine?.context?.api;
  const collName = coll?.name;
  const dsKey = coll?.dataSourceKey;
  const boxRef = React.useRef<any>(null);
  const taRef = React.useRef<any>(null);
  // containPopups: nhốt fn/field/mẫu popover TRONG boxRef — CHỈ khi nhúng trong popover CONTROLLED (MiniForm
  // menu cột) để click không đóng popover cha. Trong MODAL (Manager) thì để portal ra body (undefined) —
  // nhốt vào boxRef sẽ bị overflow:auto của modal-body CẮT (user báo "màn hình bị che").
  const getPopup = containPopups ? () => boxRef.current || document.body : () => document.body;
  const fields = (coll?.getFields?.() || []).filter((f: any) => f?.name && f?.interface && !HIDE_IFACES.has(f.interface));
  const sample = React.useMemo(() => (model.resource?.getData?.() || [])[0], [model.resource, model.props.ptdlDirtyRev]);
  const domTa = () => {
    const r = taRef.current;
    return r?.resizableTextArea?.textArea || r?.textarea || r?.input || null;
  };
  // Chèn text tại con trỏ (fallback: cuối chuỗi). insideParens = lùi con trỏ 1 để nằm giữa NAME(|).
  const insertAt = (text: string, insideParens = false) => {
    const ta = domTa();
    const cur = value || '';
    let start = cur.length;
    let end = cur.length;
    if (ta && typeof ta.selectionStart === 'number') {
      start = ta.selectionStart;
      end = ta.selectionEnd;
    }
    const next = cur.slice(0, start) + text + cur.slice(end);
    onChange?.(next);
    const caret = start + text.length - (insideParens ? 1 : 0);
    requestAnimationFrame(() => {
      const t2 = domTa();
      if (t2?.setSelectionRange) {
        t2.focus();
        try { t2.setSelectionRange(caret, caret); } catch (e) { /* noop */ }
      }
    });
  };
  const aiGenerate = async (r: any) => {
    if (!api?.request || !collName) return { error: t('Thiếu bảng hoặc kết nối API') };
    try {
      const res = await api.request({
        url: 'ptdlComputed:aiWrite',
        method: 'post',
        data: { collection: collName, dataSourceKey: dsKey, description: r.instruction, fixFormula: r.current },
      });
      const d = res?.data?.data || {};
      if (d.error) return { error: d.error };
      if (!d.formula) return { error: t('AI không trả về công thức') };
      const note = d.test?.error ? `⚠️ ${d.test.error}` : `✓ ${t('chạy thử OK')}`;
      return { code: d.formula, explain: [d.explanation, note].filter(Boolean).join(' — ') };
    } catch (e: any) {
      return { error: e?.response?.data?.errors?.[0]?.message || e?.message || String(e) };
    }
  };
  const validateFormula = (code: string) => {
    if (!code?.trim()) return { ok: false, error: t('Công thức trống') };
    if (!sample) return { ok: true }; // không có bản ghi mẫu → server đã tự chạy thử
    const out = evalViewFormula(code, sample, coll);
    const so = out == null ? '' : String(out);
    return so.startsWith('⚠') ? { ok: false, error: so.replace(/^⚠\s*/, '') } : { ok: true };
  };
  const codeChip: React.CSSProperties = {
    cursor: 'pointer', fontSize: 12, fontFamily: 'var(--fontFamilyCode, monospace)',
    background: token.colorFillQuaternary, padding: '1px 6px', borderRadius: 4, whiteSpace: 'nowrap',
  };
  const fnHelp = (
    <div style={{ width: 430, maxHeight: 320, overflow: 'auto' }}>
      <div style={{ fontSize: 12, color: token.colorTextSecondary, marginBottom: 8 }}>
        {t('Bấm để chèn hàm. Gõ thẳng tên field như Excel:')} <code>qty * price</code>.
      </div>
      {FORMULA_FN_GROUPS.map(([title, fns]) => (
        <div key={title} style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: token.colorTextTertiary, marginBottom: 3 }}>{t(title)}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {fns.map((fn) => (
              <code key={fn} style={codeChip} onClick={() => insertAt(`${fn}()`, true)}>{fn}</code>
            ))}
          </div>
        </div>
      ))}
      <div style={{ fontSize: 11, color: token.colorTextQuaternary, marginTop: 6 }}>
        {t('~400 hàm Excel (formulajs) + helper HTML. Cộng dồn quan hệ: SUM(order_ids.amount).')}
      </div>
    </div>
  );
  const fieldHelp = (
    <div style={{ width: 260, maxHeight: 300, overflow: 'auto' }}>
      <div style={{ fontSize: 11, color: token.colorTextTertiary, marginBottom: 6 }}>{t('Bấm để chèn tên trường')}</div>
      {fields.map((f: any) => (
        <div key={f.name} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, flexWrap: 'wrap' }}>
          <code style={codeChip} onClick={() => insertAt(f.name)}>{f.name}</code>
          {enumOf(f).length ? <code style={{ ...codeChip, color: token.colorPrimary }} onClick={() => insertAt(`${f.name}_label`)}>{f.name}_label</code> : null}
          {typeof f.title === 'string' && f.title && f.title !== f.name ? (
            <span style={{ fontSize: 11, color: token.colorTextQuaternary }}>{f.title}</span>
          ) : null}
        </div>
      ))}
    </div>
  );
  const samples = ptdlFormulaSamples(coll);
  const sampleHelp = (
    <div style={{ width: 300, maxHeight: 300, overflow: 'auto' }}>
      {samples.map((s, i) => (
        <div
          key={i}
          onClick={() => { onChange?.(s.formula); onCommit?.(s.formula); requestAnimationFrame(() => domTa()?.focus?.()); }}
          style={{ cursor: 'pointer', padding: '5px 8px', borderRadius: 4, marginBottom: 2 }}
          onMouseEnter={(e: any) => (e.currentTarget.style.background = token.colorFillQuaternary)}
          onMouseLeave={(e: any) => (e.currentTarget.style.background = 'transparent')}
        >
          <div style={{ fontSize: 12, fontWeight: 500, color: token.colorText }}>{s.label}</div>
          <code style={{ fontSize: 11, color: token.colorTextTertiary, fontFamily: 'var(--fontFamilyCode, monospace)' }}>{s.formula}</code>
        </div>
      ))}
    </div>
  );
  // Xem trước sống trên bản ghi đầu (evalViewFormula cache theo chuỗi formula → gõ ra kết quả mới ngay).
  const f = (value || '').trim();
  let preview: React.ReactNode = null;
  if (f) {
    if (!sample) preview = <span style={{ color: token.colorTextQuaternary }}>{t('(chưa có dữ liệu để xem trước)')}</span>;
    else {
      const out = evalViewFormula(f, sample, coll);
      const so = out == null ? '' : String(out);
      if (so.startsWith('⚠')) preview = <span style={{ color: '#cf1322', fontFamily: 'var(--fontFamilyCode, monospace)', fontSize: 12 }}>{so}</span>;
      else if (so === '') preview = <span style={{ color: token.colorTextQuaternary }}>{t('(trống)')}</span>;
      else if (so.startsWith('<')) preview = <span dangerouslySetInnerHTML={{ __html: so }} />;
      else preview = <span style={{ color: token.colorText }}>{so}</span>;
    }
  }
  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <AntInput.TextArea
        ref={taRef}
        rows={rows}
        autoFocus={autoFocus}
        value={value}
        onChange={(e: any) => onChange?.(e.target.value)}
        onBlur={() => onCommit?.(value)}
        placeholder={'qty * price\nTAG(status_label, "green")'}
        style={{ fontFamily: 'var(--fontFamilyCode, monospace)', fontSize: 12 }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginTop: 6, flexWrap: 'wrap' }}>
        <Popover trigger="click" placement="bottomLeft" content={fnHelp} title={t('Hàm & cú pháp')} getPopupContainer={getPopup}>
          <Button size="small" type="text" icon={<FunctionOutlined />}>{t('Hàm')}</Button>
        </Popover>
        <Popover trigger="click" placement="bottomLeft" content={fieldHelp} title={t('Trường')} getPopupContainer={getPopup}>
          <Button size="small" type="text" icon={<PlusOutlined />}>{t('Trường')}</Button>
        </Popover>
        <Popover trigger="click" placement="bottomLeft" content={sampleHelp} title={t('Công thức mẫu')} getPopupContainer={getPopup}>
          <Button size="small" type="text">{t('Mẫu')}</Button>
        </Popover>
        <span style={{ flex: 1 }} />
        {showAi && api && collName ? (
          <AiCodegenButton
            language="formula"
            size="small"
            placeholder={t('Mô tả bạn muốn tính (vd: tổng tiền = số lượng × đơn giá, định dạng tiền)')}
            getCurrent={() => value}
            callGenerate={aiGenerate}
            validate={validateFormula}
            onInsert={(code: string) => { onChange?.(code); onCommit?.(code); }}
          />
        ) : null}
      </div>
      {preview != null ? (
        <div style={{ marginTop: 6, fontSize: 12, display: 'flex', gap: 6, alignItems: 'baseline' }}>
          <span style={{ fontSize: 11, color: token.colorTextTertiary, flex: 'none' }}>{t('Xem trước:')}</span>
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{preview}</span>
        </div>
      ) : null}
    </div>
  );
}

function PtdlFormulaMiniForm({ model, title: initTitle, formula: initFormula, submitLabel, onSubmit, onCancel }: any) {
  const [title, setTitle] = React.useState(initTitle || '');
  const [formula, setFormula] = React.useState(initFormula || '');
  return (
    // width 100% — CHA (PtdlColMenu mode edit/insert) quyết định bề rộng. Trước đây fix cứng 380 trong khi
    // wrapper cha 300 → form (và input title/công thức bên trong) TRÀN ra ngoài card popover 80px (user báo
    // "input rộng hơn popup container").
    <div style={{ width: '100%' }}>
      <SettingRow layout="vertical" label={t('Tiêu đề cột')}>
        <AntInput value={title} placeholder={t('ƒ Cột')} onChange={(e: any) => setTitle(e.target.value)} />
      </SettingRow>
      <SettingRow layout="vertical" label={t('Công thức')}>
        {/* showAi=false: MiniForm nằm trong popover menu cột (controlled) — Modal AI portal ra body sẽ đóng
            popover đó. AI đầy đủ ở nút "Công thức" trên toolbar (mở bằng Modal). fn/field/mẫu vẫn có (contained). */}
        <PtdlFormulaField model={model} value={formula} onChange={setFormula} rows={3} autoFocus showAi={false} containPopups />
      </SettingRow>
      <AntSpace style={{ width: '100%', justifyContent: 'flex-end', marginTop: 8 }}>
        <Button onClick={onCancel}>{t('Huỷ')}</Button>
        <Button type="primary" disabled={!formula.trim()} onClick={() => onSubmit({ title: title.trim(), formula: formula.trim() })}>
          {submitLabel || 'OK'}
        </Button>
      </AntSpace>
    </div>
  );
}

/**
 * Tab "Cột": DANH SÁCH cột (kiểu core NocoBase) — kéo ⋮⋮ sắp thứ tự, tick ẩn/hiện (thêm/bớt), nút "Sửa"
 * mở panel cấu hình cột đó (định dạng + CÁCH HIỂN THỊ: Trình sửa/editorUse + Hiển thị/Widget = tương đương
 * "Field component"). Ghi thẳng qua model (reorderColumns / setColCfg) → áp NGAY, như ⚙ trên header.
 */
const PtdlColumnsTab = observer(function PtdlColumnsTab({ model }: any) {
  const { token } = theme.useToken();
  const coll = model?.context?.collection;
  // đọc để re-render khi order/hidden/formulas đổi (observer)
  const colState = model?.props?.ptdlColState;
  const formulas = model?.props?.ptdlFormulas;
  const items = React.useMemo(() => {
    const base: Array<{ id: string; label: string; iface?: string }> = [];
    for (const f of coll?.getFields?.() || []) {
      if (f?.name && f?.interface && !HIDE_IFACES.has(f.interface))
        base.push({ id: f.name, label: typeof f.title === 'string' && f.title ? f.title : f.name, iface: f.interface });
    }
    for (const fc of formulas || []) if (fc?.key) base.push({ id: `__f_${fc.key}`, label: `ƒ ${fc.title || fc.key}` });
    const order: string[] = model.getColState()?.order || [];
    const rank = new Map(order.map((id: string, i: number) => [id, i]));
    base.sort((a, b) => (rank.has(a.id) ? (rank.get(a.id) as number) : 9999) - (rank.has(b.id) ? (rank.get(b.id) as number) : 9999));
    return base;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coll, colState, formulas]);

  const [editing, setEditing] = React.useState<string | null>(null);
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [overId, setOverId] = React.useState<string | null>(null);

  if (!items.length) return <div style={{ color: token.colorTextTertiary, padding: 8 }}>{t('Không có cột nào để cấu hình')}</div>;

  // Trang SỬA: panel cấu hình đầy đủ của 1 cột (giống ⚙ header) — có "Trình sửa" (editor) + "Hiển thị"/"Widget".
  if (editing) {
    const it = items.find((i) => i.id === editing);
    return (
      <div>
        <div
          onClick={() => setEditing(null)}
          style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 10, color: token.colorPrimary, fontWeight: 500 }}
        >
          <ChevronLeft size={16} /> {t('Danh sách cột')}
        </div>
        <div style={{ marginBottom: 8, fontWeight: 600, color: token.colorText }}>{it?.label || editing}</div>
        {/* key={editing} → remount khi đổi cột (PtdlColStylePanel init local-state từ getColCfg 1 lần/mount).
            inDialog → dropdown/colorpicker portal ra body, nổi đúng trên Modal (không kẹt dưới popup cha). */}
        <PtdlColStylePanel key={editing} model={model} fieldName={editing} inDialog />
      </div>
    );
  }

  const move = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    const ids = items.map((i) => i.id);
    const from = ids.indexOf(fromId);
    const to = ids.indexOf(toId);
    if (from < 0 || to < 0) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    model.reorderColumns(ids);
  };
  const isVisible = (id: string) => !model.getColCfg(id).hidden;
  const toggle = (id: string) => model.setColCfg(id, { hidden: isVisible(id) ? true : undefined });

  return (
    <div>
      <div style={{ fontSize: 12, color: token.colorTextTertiary, marginBottom: 8 }}>
        {t('Kéo ⋮⋮ để sắp thứ tự · tick để hiện/ẩn cột · Sửa để đổi cách hiển thị & định dạng')}
      </div>
      <div style={{ maxHeight: 340, overflowY: 'auto', paddingRight: 2 }}>
        {items.map((it) => {
          const vis = isVisible(it.id);
          const isOver = overId === it.id && dragId && dragId !== it.id;
          return (
            <div
              key={it.id}
              onDragOver={(e: any) => {
                e.preventDefault();
                if (overId !== it.id) setOverId(it.id);
              }}
              onDrop={(e: any) => {
                e.preventDefault();
                if (dragId) move(dragId, it.id);
                setDragId(null);
                setOverId(null);
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', marginBottom: 6, borderRadius: 6,
                border: `1px solid ${isOver ? token.colorPrimary : token.colorBorderSecondary}`,
                background: dragId === it.id ? token.colorFillTertiary : token.colorFillQuaternary,
                opacity: dragId === it.id ? 0.55 : 1,
              }}
            >
              <span
                draggable
                onDragStart={(e: any) => {
                  // Firefox BẮT BUỘC có dataTransfer mới khởi động drag.
                  try {
                    e.dataTransfer?.setData?.('text/plain', it.id);
                    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
                  } catch {
                    /* noop */
                  }
                  setDragId(it.id);
                }}
                onDragEnd={() => {
                  setDragId(null);
                  setOverId(null);
                }}
                title={t('Kéo để sắp thứ tự')}
                style={{ cursor: 'grab', color: token.colorTextTertiary, display: 'inline-flex', flex: 'none' }}
              >
                <GripVertical size={15} />
              </span>
              <AntCheckbox checked={vis} onChange={() => toggle(it.id)} />
              <span
                style={{
                  flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  color: vis ? token.colorText : token.colorTextTertiary,
                }}
              >
                {it.label}
              </span>
              <Button size="small" type="text" icon={<Pencil size={14} />} onClick={() => setEditing(it.id)}>
                {t('Sửa')}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
});

/**
 * Menu header cột kiểu Lark/Airtable (Popover mini-router). Chỉ hiện khi bật UI editor.
 * Trang: menu → { settings (bọc PtdlColStylePanel) | insertLeft | insertRight | edit }.
 */
const PtdlColMenu = observer(function PtdlColMenu({ model, fieldName, onClose }: any) {
  const { token } = theme.useToken();
  // mode cũng để trên model (cùng _ptdlColMenu) → đổi Pin/Width rebuild header vẫn giữ đúng trang settings.
  const cm = model.props._ptdlColMenu;
  const mode: 'menu' | 'settings' | 'insertLeft' | 'insertRight' | 'edit' =
    (cm && cm.field === fieldName && cm.mode) || 'menu';
  const setMode = (m: string) => model.setProps({ _ptdlColMenu: { field: fieldName, mode: m } });
  const isFormula = String(fieldName).startsWith('__f_');
  const fc = isFormula ? model._formulaOf(fieldName) : null;
  const cfg = model.getColCfg(fieldName);
  const Item = ({ onClick, danger, icon, children }: any) => (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        padding: '7px 8px',
        borderRadius: 6,
        cursor: 'pointer',
        fontSize: 13,
        color: danger ? 'var(--colorErrorText, #ff4d4f)' : token.colorText,
      }}
      onMouseEnter={(e: any) => (e.currentTarget.style.background = danger ? 'var(--colorErrorBg, #fff1f0)' : token.colorFillTertiary)}
      onMouseLeave={(e: any) => (e.currentTarget.style.background = 'transparent')}
    >
      <span
        style={{
          display: 'inline-flex',
          width: 16,
          flex: 'none',
          color: danger ? 'var(--colorError, #ff4d4f)' : token.colorTextTertiary,
        }}
      >
        {icon}
      </span>
      {children}
    </div>
  );
  const Sep = () => <div style={{ height: 1, background: token.colorBorderSecondary, margin: '4px 0' }} />;

  if (mode === 'settings') {
    return (
      <div style={{ width: 264 }}>
        <PtdlColMenuBack onBack={() => setMode('menu')} title={t('Định dạng cột')} />
        <PtdlColStylePanel model={model} fieldName={fieldName} />
      </div>
    );
  }
  if (mode === 'insertLeft' || mode === 'insertRight') {
    const side = mode === 'insertLeft' ? 'left' : 'right';
    return (
      // 380 = bề rộng form công thức (title + textarea + hàng nút Hàm/Trường/Mẫu) — MiniForm ăn 100% theo đây.
      <div style={{ width: 380 }}>
        <PtdlColMenuBack onBack={() => setMode('menu')} title={side === 'left' ? t('Chèn cột ƒ · bên trái') : t('Chèn cột ƒ · bên phải')} />
        <PtdlFormulaMiniForm
          model={model}
          submitLabel={t('Chèn')}
          onCancel={() => setMode('menu')}
          onSubmit={(v: any) => {
            model.insertFormula(fieldName, side, v);
            onClose?.();
          }}
        />
      </div>
    );
  }
  if (mode === 'edit' && fc) {
    return (
      // 380 — đồng bộ với mode insert (MiniForm width 100%, cha quyết định; 300 cũ làm input tràn card).
      <div style={{ width: 380 }}>
        <PtdlColMenuBack onBack={() => setMode('menu')} title={t('Sửa công thức')} />
        <PtdlFormulaMiniForm
          model={model}
          title={fc.title}
          formula={fc.formula}
          submitLabel={t('Lưu')}
          onCancel={() => setMode('menu')}
          onSubmit={(v: any) => {
            model.updateFormula(fc.key, v);
            onClose?.();
          }}
        />
      </div>
    );
  }
  return (
    <div style={{ width: 218 }}>
      <Item icon={<ArrowLeftToLine size={15} />} onClick={() => setMode('insertLeft')}>
        {t('Chèn cột ƒ bên trái')}
      </Item>
      <Item icon={<ArrowRightToLine size={15} />} onClick={() => setMode('insertRight')}>
        {t('Chèn cột ƒ bên phải')}
      </Item>
      {isFormula ? (
        <Item icon={<Pencil size={15} />} onClick={() => setMode('edit')}>
          {t('Sửa công thức')}
        </Item>
      ) : null}
      <Sep />
      <Item
        icon={<Pin size={15} />}
        onClick={() => {
          model.setColCfg(fieldName, { pinned: cfg.pinned === 'left' ? undefined : 'left' });
          onClose?.();
        }}
      >
        {cfg.pinned === 'left' ? t('Bỏ ghim') : t('Ghim trái')}
      </Item>
      <Item icon={<SlidersHorizontal size={15} />} onClick={() => setMode('settings')}>
        {t('Định dạng cột…')}
      </Item>
      <Item
        icon={<EyeOff size={15} />}
        onClick={() => {
          model.hideColumn(fieldName);
          onClose?.();
        }}
      >
        {t('Ẩn cột')}
      </Item>
      {isFormula ? (
        <Item
          danger
          icon={<Trash2 size={15} />}
          onClick={() => {
            model.deleteFormula(fc.key);
            onClose?.();
          }}
        >
          {t('Xoá cột ƒ')}
        </Item>
      ) : null}
    </div>
  );
});

// observer: tự re-render khi colState đổi — KHÔNG dùng api.refreshHeader() (nó REMOUNT header
// component → popover ⚙ đang mở bị unmount, chính là bug "gõ 1 chữ tắt màn config").
const PtdlColHeader = observer(function PtdlColHeader(props: any) {
  const { displayName, model, fieldName } = props;
  // token TỪNG là free variable (thiếu dòng này) → ReferenceError ngay khi có sort direction trên cột.
  const { token } = theme.useToken();
  const cfg = model.getColCfg(fieldName);
  const editing = !!model.flowEngine?.flowSettings?.enabled;
  // Open-state của panel để TRÊN MODEL (không phải state cục bộ) → sống sót khi AG Grid remount
  // header lúc rebuild colDefs (đổi Pin/Width/Widget = structural). Nếu để useState, remount = đóng panel.
  const cm = model.props._ptdlColMenu;
  const menuOpen = !!cm && cm.field === fieldName;
  const align = cfg.align || props.defaultAlign;
  const justify = align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start';
  const sortable = !String(fieldName).startsWith('__');
  const sort = model.props.ptdlSort;
  const sortDir = sort?.col === fieldName ? sort.dir : null;
  return (
    // paddingRight khi edit: chừa ~14px cuối cho AG resize-handle (nay 12px) — nếu không, cột right-align đẩy
    // gear ⚙ ra sát mép phải, đè lên handle → user khó grab để kéo dãn cột ("resize không work").
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        width: '100%',
        justifyContent: justify,
        paddingRight: editing ? 14 : undefined,
      }}
    >
      {/* Sort CHỈ trên nhãn — KHÔNG để onClick lên cả div: Popover content là con React của div này,
          click trong panel bubble THEO CÂY REACT (dù portal ra body) lên div → trigger sort + đóng popup.
          (Cột ƒ không sortable nên trước đây không lộ; cột thật sortable thì dính.) */}
      <span
        onClick={() => sortable && model.toggleSort(fieldName)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          minWidth: 0,
          cursor: sortable ? 'pointer' : undefined,
        }}
      >
        <span
          style={{
            color: cfg.headerColor || undefined,
            fontWeight: cfg.headerBold ? 700 : 600,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {displayName}
        </span>
        {sortDir ? (
          <span style={{ color: token.colorPrimary, display: 'inline-flex', flex: 'none' }}>
            {sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
          </span>
        ) : null}
      </span>
      {editing ? (
        <Popover
          trigger="click"
          placement="bottomLeft"
          open={menuOpen}
          onOpenChange={(o: boolean) => {
            if (o) model.setProps({ _ptdlColMenu: { field: fieldName, mode: 'menu' } });
            else if (model.props._ptdlColMenu?.field === fieldName) model.setProps({ _ptdlColMenu: null });
          }}
          content={
            // Chặn click trong panel bubble (theo cây React) lên header/AG → khỏi sort/side-effect ngoài ý muốn.
            <div onClick={(e: any) => e.stopPropagation()}>
              <PtdlColMenu model={model} fieldName={fieldName} onClose={() => model.setProps({ _ptdlColMenu: null })} />
            </div>
          }
        >
          <span className="ptdl-colgear" onClick={(e: any) => e.stopPropagation()}>
            <SettingOutlined />
          </span>
        </Popover>
      ) : null}
    </div>
  );
});

function formatNum(n: number, cfg: any): string {
  let s = cfg.decimals !== undefined && cfg.decimals !== null ? n.toFixed(cfg.decimals) : String(n);
  if (cfg.thousands) {
    const parts = s.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    s = parts.join('.');
  }
  return s;
}
function numberFormatter(cf: any, cfg: any) {
  return (p: any) => {
    const v = p.value;
    if (v === null || v === undefined || v === '') return '';
    const n = Number(v);
    if (Number.isNaN(n)) return String(v);
    return formatNum(n, cfg);
  };
}

// ---------------- grid component ----------------
function buildColDefs(model: any, coll: any, visibleFields?: string[], canDrag?: boolean) {
  if (!coll) return [];
  const pick = Array.isArray(visibleFields) && visibleFields.length ? new Set(visibleFields) : null;
  // group display = merge → các cột group gộp ô liền kề (AG Grid cell spanning, Community v33+).
  // Multi-level: cột cấp i chỉ merge khi TẤT CẢ cấp 0..i cùng label (composite key) — tránh
  // "Hà Nội/Done" merge dính vào "Đà Nẵng/Done".
  const mergeFields: string[] = model.props.ptdlGroupDisplay === 'merge' ? groupFieldsOf(model) : [];
  const out: any[] = [];
  // Cột tay cầm KÉO-THẢ đổi vị trí dòng (chỉ khi collection có cột sort + không nhóm + không sort cột khác).
  // Dùng renderer mặc định của AG Grid (rowDrag=true tự vẽ tay cầm ⠿); rowDrag là HÀM để chỉ hiện tay cầm
  // ở dòng data thật (bỏ dòng nháp/summary/nhóm/ghim). Ghim trái, đứng TRƯỚC cột số dòng.
  if (canDrag) {
    out.push({
      colId: '__ptdlDrag',
      headerName: '',
      width: 28,
      minWidth: 28,
      maxWidth: 28,
      pinned: 'left',
      editable: false,
      sortable: false,
      resizable: false,
      suppressMovable: true,
      suppressNavigable: true,
      rowDrag: (p: any) =>
        !p.node?.rowPinned && !p.data?.__ptdlNew && !p.data?.__ptdlSummary && !p.data?.__ptdlGroup,
      cellClass: 'ptdl-drag-cell',
      cellStyle: { padding: 0, textAlign: 'center' },
    });
  }
  // Cột số dòng + chọn dòng (kiểu NocoBase: số ↔ checkbox khi hover). Thay cho rowNumbers + selection
  // column mặc định của AG Grid (2 cột riêng, và selection column bị spanning container đè khi merge).
  const allowSelect = model.props.ptdlAllowDelete !== false;
  const showNumber = model.props.ptdlRowNumbers !== false;
  if (allowSelect || showNumber) {
    out.push({
      colId: '__ptdlSel',
      headerName: '',
      width: 44,
      pinned: 'left',
      editable: false,
      sortable: false,
      resizable: false,
      suppressMovable: true,
      headerComponent: allowSelect ? PtdlSelHeader : undefined,
      cellRenderer: PtdlRowNumCell,
      cellRendererParams: { model, allowSelect, showNumber },
      cellStyle: { padding: 0, textAlign: 'center' },
    });
  }
  // Cột expand: mở record drawer (van xả cho field không edit inline được). Hiện khi hover dòng.
  out.push({
    colId: '__ptdlExpand',
    headerName: '',
    width: 40,
    pinned: 'left',
    editable: false,
    sortable: false,
    resizable: false,
    suppressMovable: true,
    cellRenderer: (p: any) =>
      p.data?.__ptdlNew || p.data?.__ptdlSummary || p.data?.__ptdlGroup ? null : (
        <span
          className="ptdl-expand"
          title={t('Mở bản ghi')}
          onClick={(e: any) => {
            e.stopPropagation();
            model.openRecordDrawer(p.data);
          }}
          style={{ cursor: 'pointer', color: 'var(--ptdl-primary, #1677ff)', fontSize: 13 }}
        >
          <ExpandAltOutlined />
        </span>
      ),
  });
  for (const cf of coll.getFields?.() || []) {
    const name = cf?.name;
    const iface = cf?.interface || '';
    if (!name || !iface || HIDE_IFACES.has(iface)) continue;
    if (pick && !pick.has(name)) continue;
    if (model.getColCfg(name).hidden) continue;
    const rawTitle = cf.title || cf?.options?.uiSchema?.title || name;
    // createdBy/updatedBy là belongsTo(users) nhưng KHÔNG mặc định editable (field hệ thống). Chỉ mở editable
    // khi user CHỦ ĐỘNG gán Trình sửa (editorUse) — opt-in, tránh lỡ tay sửa field hệ thống.
    const editable =
      EDITABLE_IFACES.has(iface) || (['createdBy', 'updatedBy'].includes(iface) && !!model.getColCfg(name).editorUse);
    const cfg = model.getColCfg(name);
    // Số & ngày tháng mặc định căn phải (kiểu bảng tính) — cfg.align của user vẫn ưu tiên hơn.
    const defaultAlign =
      ['integer', 'number', 'percent', 'datetime', 'datetimeNoTz', 'dateOnly', 'date', 'time', 'unixTimestamp', 'createdAt', 'updatedAt'].includes(iface)
        ? 'right'
        : undefined;
    const def: any = {
      field: name,
      headerName: typeof rawTitle === 'string' ? rawTitle : name,
      editable,
      valueFormatter: (p: any) => displayValue(cf, p.value),
      headerComponent: PtdlColHeader,
      headerComponentParams: { model, fieldName: name, defaultAlign },
      cellClassRules: {
        'ptdl-range': (p: any) => model.inFillRange(p),
        'ptdl-dirty': (p: any) => model.isDirtyCell(p),
      },
    };
    // pin là CẤU TRÚC (đổi = rebuild defs). WIDTH tuyệt đối KHÔNG set vào colDef: width không nằm trong
    // structuralSig nên colDef không rebuild khi kéo → colDef.width bị STALE → mỗi lần re-render AgGridReact
    // re-sync cột về width cũ trong colDef = "kéo xong tự về vị trí cũ" (springback). Thay vào đó AG tự giữ
    // width khi user kéo, và width-apply effect áp width từ colState (load + panel ⚙) — không set colDef nào.
    if (cfg.pinned) def.pinned = cfg.pinned;
    const mergeIdx = mergeFields.indexOf(name);
    if (mergeIdx >= 0) {
      const upto = mergeFields.slice(0, mergeIdx + 1);
      def.spanRows = (p: any) => {
        const a = p.nodeA?.data;
        const b = p.nodeB?.data;
        if (!a || !b) return false;
        if (a.__ptdlNew || b.__ptdlNew || a.__ptdlSummary || b.__ptdlSummary) return false;
        for (const f of upto) {
          const fcf = coll?.getField?.(f);
          if (String(displayValue(fcf, a?.[f]) ?? '') !== String(displayValue(fcf, b?.[f]) ?? '')) return false;
        }
        return true;
      };
    }
    def.cellStyle = (p: any) => {
      if (p.data?.__ptdlGroup) return null; // dòng nhóm: để bg nhóm (getRowStyle) đồng nhất
      const c = model.getColCfg(name);
      const st: any = {};
      const al = c.align || defaultAlign;
      if (al) {
        st.textAlign = al;
        // ô là flex (căn giữa dọc) → căn ngang qua justifyContent (textAlign không định vị flex-item)
        st.justifyContent = al === 'right' ? 'flex-end' : al === 'center' ? 'center' : 'flex-start';
      }
      if (c.color) st.color = c.color;
      if (c.bg) st.backgroundColor = c.bg;
      if (c.bold) st.fontWeight = 600;
      return Object.keys(st).length ? st : null;
    };
    if (iface === 'integer' || iface === 'number') {
      def.valueFormatter = (p: any) => {
        const c = model.getColCfg(name);
        if (c.thousands || c.decimals !== undefined) return numberFormatter(cf, c)(p);
        return displayValue(cf, p.value);
      };
    }
    // Renderer thống nhất cho MỌI cột data (trừ boolean có renderer riêng): align/format/rules/summary
    // đều đọc live → chỉnh trong ⚙ không rebuild defs, popover không sập.
    if (iface !== 'checkbox' && iface !== 'boolean') {
      def.cellRenderer = condCellRenderer(model, name, cf, defaultAlign);
    }
    // Widget field-enhancements (Star/Progress) cho cột số — tương tác trên ô thay editor
    if (cfg.widget && ['integer', 'number', 'percent'].includes(iface)) {
      def.cellRenderer = widgetCellRenderer(model, name, cf, cfg.widget);
      def.editable = false;
    }
    // Widget HIỂN THỊ enhancement (Relative date / Select buttons) render LIVE trong condCellRenderer
    // (KHÔNG set cellRenderer/editable ở đây → không structural → đổi widget không rebuild = panel ⚙ không nháy).
    const commit = (row: any, f: string, v: any) => model.commitValue(row, f, v);
    // ACL: dòng mới (draft) luôn sửa được; dòng tổng không sửa; dòng thật theo allowedActions.update.
    // Cột đang bật display-widget = read-only (đọc LIVE) → sửa giá trị qua drawer ⤢.
    const aclEditable = (p: any) => {
      const c = model.getColCfg(name);
      if (c.displayWidget && SHEET_DISPLAY_WIDGETS[c.displayWidget]?.ifaces?.includes(iface)) return false;
      return !p?.data?.__ptdlSummary && !p?.data?.__ptdlGroup && model.canUpdate(p?.data);
    };
    if (editable) def.editable = aclEditable;
    if (iface === 'checkbox' || iface === 'boolean') {
      // Không cần edit mode — click là toggle + lưu.
      def.editable = false;
      def.cellRenderer = PtdlBoolCell;
      def.cellRendererParams = {
        commit,
        canUpdate: (row: any) => model.canUpdate(row),
        getAlign: () => model.getColCfg(name).align,
      };
    } else if (iface === 'select' || iface === 'radioGroup') {
      def.cellEditor = PtdlChoiceEditor;
      def.cellEditorParams = { options: enumOf(cf), commit };
      def.cellEditorPopup = true;
      def.cellEditorPopupPosition = 'under';
      def.singleClickEdit = true;
    } else if (iface === 'multipleSelect' || iface === 'checkboxGroup') {
      def.cellEditor = PtdlMultiChoiceEditor;
      def.cellEditorParams = { options: enumOf(cf), commit };
      def.cellEditorPopup = true;
      def.cellEditorPopupPosition = 'under';
      def.singleClickEdit = true;
    } else if (editable) {
      def.cellEditor = PtdlCellEditor;
      def.cellEditorParams = {
        getHost: () => model.getCellHost(name),
        singlePick: SINGLE_PICK_IFACES.has(iface),
        numeric: iface === 'integer' || iface === 'number' || iface === 'percent',
        inline: !POPUP_IFACES.has(iface),
        commit,
      };
      if (POPUP_IFACES.has(iface)) {
        def.cellEditorPopup = true;
        def.cellEditorPopupPosition = 'under';
        // Cột dạng chọn: 1 click vào ô là mở editor luôn (đỡ double-click + click mở dropdown).
        def.singleClickEdit = true;
      }
    }
    // Merge mode: ô đã gộp không sửa inline (giống Excel — sửa ô gộp mơ hồ: sửa dòng nào?);
    // editor popup của AG Grid cũng không đứng nổi trên SpannedCellCtrl. Sửa qua drawer ⤢.
    if (mergeIdx >= 0) {
      def.editable = false;
      def.cellEditor = undefined;
      def.singleClickEdit = false;
      if (iface === 'checkbox' || iface === 'boolean') {
        def.cellRendererParams = { ...def.cellRendererParams, canUpdate: () => false };
      } else {
        // Ô gộp: label ((trống) mờ khi giá trị rỗng — nhóm rỗng thường là nhóm dài nhất, để trống
        // là cột trắng cả trang) + count/aggregates của đúng nhóm đó (chỉ dòng anchor của span,
        // tra qua model._mergeAggs; cả khối nằm trong inner nên sticky kéo theo cùng nhau).
        const base = def.cellRenderer;
        def.cellRenderer = (p: any) => {
          const d = p.data;
          if (d?.__ptdlSummary || d?.__ptdlNew) return typeof base === 'function' ? base(p) : null;
          const v = p.value;
          const empty = v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length);
          const label = empty ? (
            <div style={{ color: '#bfbfbf', fontStyle: 'italic' }}>{t('(trống)')}</div>
          ) : typeof base === 'function' ? (
            base(p)
          ) : (
            <div>{displayValue(cf, v)}</div>
          );
          const entry = model._mergeAggs?.get(`${name}::${String(d?.[tkOf(coll)])}`);
          if (!entry || entry.count < 2) return label;
          const lines = groupAggLines(model, coll, entry.rows);
          return (
            <div>
              {label}
              <div
                style={{
                  fontSize: 11,
                  color: '#8c8c8c',
                  lineHeight: 1.7,
                  marginTop: 2,
                  fontStyle: 'normal',
                  fontWeight: 400,
                }}
              >
                <div>{t('{{n}} dòng', { n: entry.count })}</div>
                {lines.map((l: string, i: number) => (
                  <div key={i}>{l}</div>
                ))}
              </div>
            </div>
          );
        };
      }
    }
    out.push(def);
  }
  // Cột formula ảo (view-level, không đụng DB) — read-only, tính on-render; có ⚙ style/format như cột thường.
  for (const fc of model.props.ptdlFormulas || []) {
    if (!fc?.key || !fc?.formula) continue;
    const colId = `__f_${fc.key}`;
    if (model.getColCfg(colId).hidden) continue;
    const cfgF = model.getColCfg(colId);
    out.push({
      colId,
      headerName: fc.title || 'ƒ',
      editable: false,
      // KHÔNG set width vào colDef (tránh springback — xem note cột data). Width áp qua effect từ colState;
      // mặc định 160 (defaultColDef). Formula width mặc định fc.width seed vào colState 1 lần bên dưới.
      pinned: cfgF.pinned || undefined,
      valueGetter: (p: any) =>
        p.data?.__ptdlSummary
          ? p.data[colId]
          : p.data?.__ptdlNew || p.data?.__ptdlGroup
            ? ''
            : evalViewFormula(fc.formula, p.data, coll),
      cellRenderer: FormulaCell,
      cellRendererParams: { model, fcolId: colId },
      headerComponent: PtdlColHeader,
      headerComponentParams: { model, fieldName: colId },
      cellClassRules: { 'ptdl-range': (p: any) => model.inFillRange(p) },
      cellStyle: (p: any) => {
        const c = model.getColCfg(colId);
        const st: any = {};
        if (c.align) {
          st.textAlign = c.align;
          st.justifyContent = c.align === 'right' ? 'flex-end' : c.align === 'center' ? 'center' : 'flex-start';
        }
        if (c.color) st.color = c.color;
        if (c.bg) st.backgroundColor = c.bg;
        if (c.bold) st.fontWeight = 600;
        return Object.keys(st).length ? st : null;
      },
    });
  }
  // Cột Actions — ghim phải. Hiện khi: đang cấu hình (admin), còn legacy, HOẶC có native action mà role
  // hiện tại DÙNG ĐƯỢC (ACL). Role user chỉ-xem không update/destroy → native action bị aclCheck ẩn hết →
  // ẩn luôn cột rỗng thay vì để cột "Thao tác" trống trơn.
  const editingCols = !!model.flowEngine?.flowSettings?.enabled;
  const hasNativeActs = !!model.hasNativeRowActions?.();
  const legacyActs = model.props.ptdlRowActions || [];
  if (editingCols || legacyActs.length || (hasNativeActs && model.nativeActionsUsableForRole())) {
    // Width cột Actions: KHÔNG set vào colDef (springback — xem note cột data). Width áp qua width-apply
    // effect từ colState; mặc định (khi chưa kéo) = 180, effect tự seed cho '__ptdlActions'.
    out.push({
      colId: '__ptdlActions',
      headerName: t('Thao tác'),
      editable: false,
      sortable: false,
      resizable: true,
      suppressMovable: true,
      pinned: 'right',
      cellRenderer: (p: any) => {
        if (p.data?.__ptdlNew || p.data?.__ptdlSummary || p.data?.__ptdlGroup) return null;
        // NATIVE: render TỪNG action sub-model qua FlowModelRenderer + inputArgs={record} — đường mount
        // CHUẨN (chạy auto-flows, action đọc record từ inputArgs). Check LIVE để render ngay khi đổi action.
        if (model.hasNativeRowActions?.()) {
          try {
            const acts = model.getRowActionsList(); // đã sort theo props.ptdlActionOrder
            const tk = p.data?.[tkOf(coll)];
            return (
              <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                {acts.map((a: any, i: number) => (
                  <FlowModelRenderer
                    key={a.uid || i}
                    model={a}
                    inputArgs={{ record: p.data, filterByTk: tk }}
                    showFlowSettings={editingCols}
                    fallback={null}
                  />
                ))}
              </span>
            );
          } catch (e) {
            return null;
          }
        }
        // LEGACY custom (migrate)
        if ((model.props.ptdlRowActions || []).length) return <PtdlActionsCell model={model} data={p.data} />;
        return null;
      },
    });
  }
  // Áp thứ tự cột đã lưu (kéo-thả): expand giữ đầu, cột (field/ƒ) theo state.order, cột mới xếp cuối.
  const order: string[] = model.getColState()?.order || [];
  if (order.length) {
    const rank = new Map(order.map((id: string, i: number) => [id, i]));
    const HEAD_IDS = new Set(['__ptdlDrag', '__ptdlSel', '__ptdlExpand']);
    const head = out.filter((d) => HEAD_IDS.has(d.colId));
    const rest = out.filter((d) => !HEAD_IDS.has(d.colId));
    rest.sort((a, b) => {
      const ka = a.colId || a.field;
      const kb = b.colId || b.field;
      const ra = rank.has(ka) ? (rank.get(ka) as number) : 9999;
      const rb = rank.has(kb) ? (rank.get(kb) as number) : 9999;
      return ra - rb;
    });
    out.length = 0;
    out.push(...head, ...rest);
  }
  // Cột EDITABLE đầu tiên theo THỨ TỰ HIỂN THỊ (bỏ cột widget read-only) — placeholder dòng nháp +
  // nút "Thêm mới" nhắm đúng ô gõ được. Đọc live: model._firstEditableCol.
  model._firstEditableCol =
    (out.find((d: any) => {
      const id = d.field;
      if (!id) return false;
      const fcf = coll?.getField?.(id);
      if (!fcf || !EDITABLE_IFACES.has(fcf.interface)) return false;
      if (model.getColCfg(id).displayWidget) return false;
      return true;
    })?.field as string) || null;
  // Merge mode: các cột group buộc phải đứng đầu (sau cột expand) theo đúng thứ tự cấp —
  // giống Excel, và để các span nằm cạnh nhau thay vì rải rác giữa bảng. Ưu tiên hơn order đã lưu.
  if (mergeFields.length) {
    const mrank = new Map(mergeFields.map((f, i) => [f, i]));
    const HEAD_IDS = new Set(['__ptdlDrag', '__ptdlSel', '__ptdlExpand']);
    const head = out.filter((d) => HEAD_IDS.has(d.colId));
    const groups = out
      .filter((d) => mrank.has(d.field))
      .sort((a, b) => (mrank.get(a.field) as number) - (mrank.get(b.field) as number));
    const rest = out.filter((d) => !HEAD_IDS.has(d.colId) && !mrank.has(d.field));
    return [...head, ...groups, ...rest];
  }
  // Stage 2: group header = row có Ô THẬT (rows-mode). Bọc renderer mỗi cột data để render nhóm:
  // cột data ĐẦU = nhãn (colSpan qua các cột dim tới cột measure đầu), cột có Summary = subtotal thẳng cột.
  const dataDefs = out.filter((d: any) => d.field || (d.colId && String(d.colId).startsWith('__f_')));
  for (const d of dataDefs) {
    const id = d.field || d.colId;
    const iface = coll?.getField?.(id)?.interface;
    // defaultAlign PHẢI khớp data cell: field số/ngày → right; formula (iface undefined) → none (left).
    const defAlign = ['integer', 'number', 'percent', 'datetime', 'datetimeNoTz', 'dateOnly', 'date', 'time', 'unixTimestamp', 'createdAt', 'updatedAt'].includes(iface)
      ? 'right'
      : undefined;
    d.cellRenderer = groupCellRenderer(d.cellRenderer, model, coll, id, defAlign);
    // colSpan cột NHÃN = số cột (theo thứ tự AG THẬT) tới cột measure đầu; chỉ cột data đầu mới span.
    // Tính từ AG API lúc render (không dựa `out` — AG có thể sắp xếp khác do drag), đọc summary live.
    d.colSpan = (p: any) => {
      if (!p.data?.__ptdlGroup) return 1;
      const cols = displayedDataColIds(p.api);
      if (cols[0] !== id) return 1;
      let fm = -1;
      for (let i = 0; i < cols.length; i++) {
        if (model.getColCfg(cols[i]).summary) {
          fm = i;
          break;
        }
      }
      return Math.max(1, fm < 0 ? cols.length : fm);
    };
  }
  // Cột spacer flex: lấp khoảng trống khi cột KHÔNG lấp đầy bề rộng + có cột ghim phải (Actions) —
  // AG Grid để hở giữa center và pinned-right. flex:1 hút hết chỗ thừa; khi cột tràn thì co về 1px.
  out.push({
    colId: '__ptdlSpacer',
    headerName: '',
    flex: 1,
    minWidth: 1,
    editable: false,
    sortable: false,
    resizable: false,
    suppressMovable: true,
    suppressNavigable: true,
    cellStyle: { border: 'none', background: 'transparent' },
  });
  return out;
}

// ---------------- row actions (cột Actions cấu hình được) ----------------
const interpolateUrl = (tpl: string, row: any) =>
  String(tpl || '').replace(/\{(\w+)\}/g, (_m, k) => {
    const v = row?.[k];
    if (v === null || v === undefined) return '';
    return encodeURIComponent(typeof v === 'object' ? v.id ?? '' : v);
  });

function PtdlActionsCell(props: any) {
  const { model } = props;
  const row = props.data;
  if (!row || row.__ptdlNew || row.__ptdlSummary || row.__ptdlGroup) return null;
  const actions: any[] = model.props.ptdlRowActions || [];
  const run = (a: any) => {
    if (a.type === 'delete') return model.deleteRows([row[tkOf(model.context.collection)]]);
    if (a.type === 'drawer') model.openRecordDrawer(row);
    else if (a.type === 'duplicate') model.duplicateRow(row);
    else if (a.type === 'update') model.runUpdateAction(row, a.updateField, a.updateValue);
    else if (a.type === 'link' && a.url) {
      const href = interpolateUrl(a.url, row);
      if (a.newTab) {
        const w = window.open(href, '_blank');
        if (w) (w as any).opener = null;
      } else {
        window.location.href = href;
      }
    }
  };
  return (
    <span style={{ display: 'inline-flex', gap: 12, alignItems: 'center' }}>
      {actions.map((a: any, i: number) => {
        if (a.type === 'delete' && !model.canDestroy(row)) return null;
        const color = ACTION_COLORS[a.color || (a.type === 'delete' ? 'danger' : 'default')] || ACTION_COLORS.default;
        const Icon = a.icon ? ACTION_ICONS[a.icon] : null;
        const label = a.label || (a.icon ? '' : a.type);
        const content = (
          <span style={{ cursor: 'pointer', color, fontSize: 12, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            {Icon ? <Icon size={13} /> : null}
            {label ? <span>{label}</span> : null}
          </span>
        );
        if (a.confirm || a.type === 'delete') {
          return (
            <Popconfirm
              key={i}
              title={a.confirmText || (a.type === 'delete' ? t('Xoá dòng này?') : t('Xác nhận?'))}
              onConfirm={() => run(a)}
            >
              <span onClick={(e) => e.stopPropagation()}>{content}</span>
            </Popconfirm>
          );
        }
        return (
          <span
            key={i}
            onClick={(e) => {
              e.stopPropagation();
              run(a);
            }}
          >
            {content}
          </span>
        );
      })}
    </span>
  );
}

/** Manager row-action NATIVE — thêm/xoá action (native + MỌI plugin qua defineChildren). House style. */
function PtdlActionsNativeManager({ model }: any) {
  const { token } = theme.useToken();
  const _rev = model.props.ptdlActionsRev; // reactive: re-render khi thêm/bớt action
  void _rev;
  const [addable, setAddable] = React.useState<any[]>([]);
  React.useEffect(() => {
    let alive = true;
    model.getAddableRowActions().then((list: any[]) => {
      // defineChildren có thể lồng nhóm (children) → duyệt lấy leaf có createModelOptions/useModel
      const flat: any[] = [];
      const walk = (arr: any[]) =>
        (arr || []).forEach((it: any) => {
          if (Array.isArray(it?.children) && it.children.length) walk(it.children);
          else if (it?.createModelOptions || it?.useModel) flat.push(it);
        });
      walk(list);
      if (alive) setAddable(flat);
    });
    return () => {
      alive = false;
    };
  }, [model]);
  const tLabel = (raw: any) => {
    if (typeof raw !== 'string') return String(raw ?? '');
    const mt = raw.match(/\{\{\s*t\(\s*["']([^"']+)["']/);
    const key = mt ? mt[1] : raw;
    try {
      return model.translate?.(raw) || key;
    } catch {
      return key;
    }
  };
  const actions = model.getRowActionsList();
  const actLabel = (a: any) =>
    tLabel(a?.props?.title) || String(a?.constructor?.name || '').replace(/ActionModel$/, '') || t('Thao tác');
  return (
    <div style={{ width: 300 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: token.colorTextSecondary, marginBottom: 8 }}>
        {t('Thao tác dòng — {{n}}', { n: actions.length })}
      </div>
      {actions.length ? (
        actions.map((a: any, i: number) => (
          <div
            key={a.uid || i}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              padding: '4px 6px',
              borderRadius: 6,
              marginBottom: 2,
              background: token.colorFillQuaternary,
            }}
          >
            <span style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{actLabel(a)}</span>
            <span style={{ display: 'inline-flex', flex: 'none', gap: 0 }}>
              <Button
                size="small"
                type="text"
                disabled={i === 0}
                icon={<ArrowUp size={13} />}
                onClick={() => model.moveRowAction(a, -1)}
                title={t('Đưa lên (nút bên trái)')}
              />
              <Button
                size="small"
                type="text"
                disabled={i === actions.length - 1}
                icon={<ArrowDown size={13} />}
                onClick={() => model.moveRowAction(a, 1)}
                title={t('Đưa xuống (nút bên phải)')}
              />
              <Button size="small" type="text" danger icon={<Trash2 size={14} />} onClick={() => model.removeRowAction(a)} title={t('Xoá action')} />
            </span>
          </div>
        ))
      ) : (
        <div style={{ fontSize: 12, color: token.colorTextTertiary, marginBottom: 6 }}>{t('Chưa có action — thêm bên dưới ↓')}</div>
      )}
      <div style={{ borderTop: `1px solid ${token.colorBorderSecondary}`, paddingTop: 8, marginTop: 6 }}>
        <div style={{ fontSize: 11, color: token.colorTextTertiary, marginBottom: 6 }}>{t('＋ Thêm action (native + plugin):')}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
          {addable.map((item: any) => (
            <Button key={item.key} size="small" onClick={() => model.addRowAction(item.createModelOptions || { use: item.useModel })}>
              {tLabel(item.label)}
            </Button>
          ))}
        </div>
      </div>
      <div style={{ marginTop: 8, fontSize: 11, color: token.colorTextTertiary, lineHeight: 1.5 }}>
        {t('Cấu hình từng action (template Print nào, Workflow nào…): bấm')} <b>⚙</b> {t('trên nút action ở dòng khi bật UI editor.')}
      </div>
    </div>
  );
}

/**
 * Quản lý cột formula (popover toolbar, chỉ hiện khi bật UI editor).
 * Gõ chỉ đổi STATE CỤC BỘ — persist khi blur/Apply (persist mỗi phím sẽ rebuild cả grid → mất phím gõ).
 */
function PtdlFormulaManager({ model }: any) {
  const { token } = theme.useToken();
  const [list, setList] = React.useState<any[]>(() => (model.props.ptdlFormulas || []).map((f: any) => ({ ...f })));
  const apply = (next?: any[]) => model.saveFormulas(next || list);
  const patch = (i: number, p: any) => {
    setList((cur) => {
      const next = cur.slice();
      next[i] = { ...next[i], ...p };
      return next;
    });
  };
  return (
    <div style={{ width: 460 }}>
      {list.map((f, i) => (
        <div key={f.key || i} style={{ marginBottom: 12, paddingBottom: 10, borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            <AntInput
              size="small"
              placeholder={t('Tiêu đề cột')}
              value={f.title || ''}
              onChange={(e: any) => patch(i, { title: e.target.value })}
              onBlur={() => apply()}
            />
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => {
                const next = list.filter((_, j) => j !== i);
                setList(next);
                apply(next);
              }}
            />
          </div>
          <PtdlFormulaField
            model={model}
            value={f.formula || ''}
            onChange={(v: string) => patch(i, { formula: v })}
            onCommit={(v: string) => apply(list.map((x, j) => (j === i ? { ...x, formula: v } : x)))}
            rows={2}
          />
        </div>
      ))}
      <div style={{ display: 'flex', gap: 6 }}>
        <Button
          size="small"
          icon={<PlusOutlined />}
          onClick={() => setList([...list, { key: `f${Date.now().toString(36)}`, title: '', formula: '' }])}
        >
          {t('Thêm cột công thức')}
        </Button>
        <Button size="small" type="primary" onClick={() => apply()}>
          {t('Áp dụng')}
        </Button>
      </div>
      <div style={{ color: token.colorTextTertiary, fontSize: 11, marginTop: 8 }}>
        {t('Cột ảo tính lúc hiển thị — không tạo field DB, không sort/filter server.')}
      </div>
    </div>
  );
}

/** Divider dọc mảnh phân cụm nút trên toolbar (kiểu Lark). */
const PtdlToolDivider = () => (
  <span style={{ width: 1, alignSelf: 'stretch', minHeight: 16, background: '#eff0f1', margin: '0 2px' }} />
);

const SheetGrid = observer(({ model }: { model: any }) => {
  const { token } = theme.useToken();
  const coll = model.context.collection;
  // Theme AG Grid theo antd token → khớp dark/light của app. Memo theo các màu thực dùng (đổi theme app
  // mới rebuild, không rebuild mỗi render). Đổi ref theme lúc runtime = AG re-apply CSS, không mất state.
  const gridTheme = React.useMemo(
    () => buildSheetTheme(token),
    [
      token.colorPrimary,
      token.colorBgContainer,
      token.colorText,
      token.colorBorderSecondary,
      token.colorFillQuaternary,
      token.colorTextHeading,
      token.controlItemBgHover,
      token.controlItemBgActive,
      token.colorBgElevated,
    ],
  );
  const raw = model.resource?.getData?.();
  const dirtyRev = model.props.ptdlDirtyRev || 0;
  const tkForOverlay = tkOf(coll);
  const groupFields = groupFieldsOf(model);
  const groupSig = groupFields.join(',');
  const grouping = groupFields.length > 0;
  const groupRev = model.props.ptdlGroupRev || 0;
  // merge mode: vẫn load-all + bucket theo label, nhưng đổ dòng PHẲNG (không header nhóm) — các
  // cột group tự gộp ô liền kề bằng spanRows (Excel style), không có đóng/mở nhóm.
  const groupMerge = grouping && model.props.ptdlGroupDisplay === 'merge';
  // grouping bật → load-all: nâng pageSize = groupLimit (1 request); tắt → về 100.
  React.useEffect(() => {
    const res = model.resource;
    if (!res) return;
    try {
      if (grouping) {
        const limit = Number(model.props.ptdlGroupLimit) || 5000;
        if (res.getPageSize?.() !== limit) {
          res.setPageSize?.(limit);
          res.setPage?.(1);
          res.refresh?.();
        }
      } else if ((res.getPageSize?.() || 100) > 500) {
        res.setPageSize?.(100);
        res.setPage?.(1);
        res.refresh?.();
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[spreadsheet-view] group load failed', err);
    }
  }, [model, grouping, model.props.ptdlGroupLimit]);
  // overlay giá trị dirty (chưa lưu) lên data server — refresh giữa chừng không làm mất chữ đang gõ;
  // grouping bật → chèn dòng header nhóm (full-width) theo thứ tự xuất hiện (tôn trọng sort server).
  const groupCount = React.useRef(0); // số nhóm cấp 1
  const headerCount = React.useRef(0); // tổng số dòng header nhóm (mọi cấp) — để tính "đã tải" ở footer
  const rowData = React.useMemo(() => {
    let arr = Array.isArray(raw) ? raw.slice() : [];
    if (model._dirty?.size) {
      arr = arr.map((r: any) => {
        const d = model._dirty.get(String(r?.[tkForOverlay]));
        return d ? { ...r, ...d.patch } : r;
      });
    }
    // map tk → số thứ tự (chỉ đếm dòng data, theo thứ tự hiển thị) cho cột __ptdlSel
    const numberRows = (rows: any[]) => {
      const m = new Map<string, number>();
      let i = 0;
      for (const r of rows) {
        if (!r || r.__ptdlGroup || r.__ptdlSummary || r.__ptdlNew) continue;
        m.set(String(r?.[tkForOverlay]), ++i);
      }
      model._rowNumMap = m;
    };
    if (!grouping) {
      groupCount.current = 0;
      headerCount.current = 0;
      numberRows(arr);
      return arr;
    }
    const cfs = groupFields.map((f: string) => coll?.getField?.(f));
    const out: any[] = [];
    let headers = 0;
    // merge mode: map "field::tk(dòng đầu nhóm)" → {count, rows} để renderer ô gộp hiện count +
    // aggregates của đúng nhóm đó (mọi cấp — cấp con là subset của cấp cha).
    const mergeAggs = new Map<string, { count: number; rows: any[] }>();
    // rows mode: map tk(dòng) → chuỗi header nhóm các cấp — cho thanh overlay dính ở top.
    const rowGroups = new Map<string, any[]>();
    // map key nhóm → displayed index của dòng header (sticky cần VỊ TRÍ PIXEL header thật để biết cấp nào
    // đã "đóng băng" — header trôi qua đúng slot của nó mới dock, không dock sớm = không che nội dung).
    const headerIdx = new Map<string, number>();
    // Bucket đệ quy theo từng cấp — thứ tự xuất hiện = tôn trọng sort server ở mọi cấp.
    // Rows mode: header nhóm mỗi cấp (indent theo __lvl), đóng cấp cha ẩn toàn bộ cấp con.
    // Merge mode: chỉ cần dòng data LIỀN KỀ đúng thứ tự nhóm để spanRows gộp — không header.
    const walk = (rows: any[], lvl: number, parentKey: string, chain: any[]) => {
      const buckets = new Map<string, any[]>();
      for (const r of rows) {
        const lbl = String(displayValue(cfs[lvl], r?.[groupFields[lvl]]) || '') || t('(trống)');
        if (!buckets.has(lbl)) buckets.set(lbl, []);
        (buckets.get(lbl) as any[]).push(r);
      }
      if (lvl === 0) groupCount.current = buckets.size;
      const last = lvl + 1 >= groupFields.length;
      for (const [lbl, rows2] of buckets) {
        const key = parentKey ? parentKey + GROUP_KEY_SEP + lbl : lbl;
        if (groupMerge) {
          mergeAggs.set(`${groupFields[lvl]}::${String(rows2[0]?.[tkForOverlay])}`, {
            count: rows2.length,
            rows: rows2,
          });
          if (last) out.push(...rows2);
          else walk(rows2, lvl + 1, key, chain);
          continue;
        }
        const h = { __ptdlGroup: true, __lbl: lbl, __key: key, __lvl: lvl, __count: rows2.length, __rows: rows2 };
        const chain2 = [...chain, h];
        out.push(h);
        headerIdx.set(key, out.length - 1);
        headers++;
        if (model.isGroupOpen(key)) {
          if (last) {
            out.push(...rows2);
            for (const r of rows2) rowGroups.set(String(r?.[tkForOverlay]), chain2);
          } else walk(rows2, lvl + 1, key, chain2);
        }
      }
    };
    walk(arr, 0, '', []);
    headerCount.current = headers;
    model._mergeAggs = mergeAggs;
    model._rowGroups = rowGroups;
    model._groupHeaderIndex = headerIdx;
    numberRows(out);
    return out;
  }, [raw, dirtyRev, groupSig, groupRev, groupMerge]);
  const loading = !!model.resource?.loading;
  const visibleFields = model.props.ptdlFields;
  const colState = model.props.ptdlColState;
  const formulas = model.props.ptdlFormulas;
  // Kéo-thả đổi vị trí DÒNG: chỉ bật khi (1) collection có cột sort, (2) KHÔNG ở chế độ nhóm, và
  // (3) KHÔNG đang sort theo cột nào (sort cột khác → thứ tự hiển thị không theo cột sort → kéo xong
  // không thấy đổi = rối). Persist qua server action `<coll>:move`.
  const sortFld = React.useMemo(() => sortFieldOf(coll), [coll]);
  const userSort = model.props.ptdlSort;
  const canDragSort = !!sortFld && !grouping && !(userSort && userSort.col);
  // Khi bật kéo-thả dòng: BẮT BUỘC order theo cột sort. Server mặc định order theo khóa chính (id), KHÔNG
  // theo cột sort → kéo xong refresh sẽ không thấy đổi vị trí. Giống table block NocoBase (drag-sort luôn
  // hiển thị theo sortField). Chỉ set khi khác để tránh refresh thừa; user bấm sort cột khác thì canDragSort
  // = false, không đụng vào (toggleSort tự quản sort lúc đó).
  React.useEffect(() => {
    const res = model.resource;
    if (!res || !canDragSort || !sortFld?.name) return;
    try {
      const cur = res.getSort?.() || [];
      const want = sortFld.name;
      if (!(cur.length === 1 && cur[0] === want)) {
        res.setSort?.([want]);
        res.setPage?.(1);
        res.refresh?.();
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[spreadsheet-view] apply sort-field order failed', err);
    }
  }, [model, canDragSort, sortFld?.name]);
  // ── Drop-indicator khi kéo dòng: vạch primary trên/dưới dòng đích + nhớ đích hợp lệ CUỐI CÙNG ──
  // (thả tay ở vùng trống dưới đáy / trên dòng summary → vẫn thả vào đích cuối, khớp với vạch đang vẽ).
  const sheetWrapRef = React.useRef<HTMLDivElement | null>(null);
  const dropMarkRef = React.useRef<{ els: any[]; key: string } | null>(null);
  const lastDragOverRef = React.useRef<any>(null); // rowNode đích hợp lệ cuối cùng rê qua
  const clearDropMark = React.useCallback(() => {
    const m = dropMarkRef.current;
    if (m) {
      m.els.forEach((el) => el.classList.remove('ptdl-drop-above', 'ptdl-drop-below'));
      dropMarkRef.current = null;
    }
  }, []);
  const dragRowOk = (d: any) => d && !d.__ptdlNew && !d.__ptdlSummary && !d.__ptdlGroup;
  const markDropTarget = React.useCallback((e: any) => {
    const src = e.node;
    const over = e.overNode;
    if (!src || !dragRowOk(src.data)) return;
    // Rê ra vùng trống (không overNode): GIỮ vạch + đích cuối — thả ở đó vẫn về đích đang chỉ.
    if (!over) return;
    // Rê lên chính nó: thả sẽ không làm gì → xoá vạch cho khỏi gây hiểu lầm.
    if (over === src) { clearDropMark(); return; }
    // Đích không hợp lệ (pinned/summary/dòng nháp): giữ nguyên vạch ở đích hợp lệ trước đó.
    if (over.rowPinned || !dragRowOk(over.data)) return;
    lastDragOverRef.current = over;
    const from = src.rowIndex ?? -1;
    const to = over.rowIndex ?? -1;
    if (from < 0 || to < 0) { clearDropMark(); return; }
    const below = from < to; // TRÙNG luật quyết insertAfter/insertBefore ở onRowDragEnd
    const key = `${to}:${below ? 'b' : 'a'}`;
    if (dropMarkRef.current?.key === key) return;
    clearDropMark();
    const wrap = sheetWrapRef.current;
    if (!wrap) return;
    // 1 dòng dữ liệu = nhiều phần tử .ag-row (container pinned trái / giữa / phải) → mark hết để vạch chạy suốt.
    const els = Array.from(wrap.querySelectorAll(`.ag-row[row-index="${to}"]`));
    if (!els.length) return;
    els.forEach((el) => el.classList.add(below ? 'ptdl-drop-below' : 'ptdl-drop-above'));
    dropMarkRef.current = { els, key };
  }, [clearDropMark]);
  // Chỉ rebuild defs khi CẤU TRÚC đổi (width/pin/order/widget/bật-tắt rules) — style/format/rule text
  // đọc live trong renderer + refreshCells, để popover ⚙ không bị unmount khi đang gõ.
  const structuralSig = React.useMemo(() => {
    const cols = Object.fromEntries(
      Object.entries((colState || {}).columns || {}).map(([k, v]: any) => [
        k,
        // WIDTH không còn structural — áp qua AG API (applyColumnState) → đổi width trong panel ⚙ không
        // rebuild → header không remount → không nháy. Pin GIỮ structural (reorder khó áp qua API sạch, user OK
        // để nó nháy). widget/editor/hidden structural như cũ.
        { p: v?.pinned, g: v?.widget, e: v?.editorUse, h: v?.hidden },
      ]),
    );
    return JSON.stringify({ o: (colState || {}).order || [], c: cols });
  }, [colState]);
  const rowActions = model.props.ptdlRowActions;
  // Chữ ký ACL: đọc TRỰC TIẾP trong render (observer) nên khi allowedActions meta về theo quyền role thì
  // đổi → colDefs rebuild → cột "Thao tác" ẩn/hiện đúng cho role đó (xem nativeActionsUsableForRole).
  const aclSig = (() => {
    try {
      const allowed: any = (model as any).resource?.getMeta?.('allowedActions');
      if (!allowed || typeof allowed !== 'object') return '';
      return Object.keys(allowed)
        .map((k) => `${k}:${Array.isArray(allowed[k]) ? (allowed[k].length ? 1 : 0) : allowed[k] ? 1 : 0}`)
        .sort()
        .join(',');
    } catch (e) {
      return '';
    }
  })();
  const colDefs = React.useMemo(
    () => buildColDefs(model, coll, visibleFields, canDragSort),
    [
      model,
      coll,
      JSON.stringify(visibleFields || []),
      canDragSort,
      structuralSig,
      JSON.stringify(formulas || []),
      JSON.stringify(rowActions || []),
      // native row actions (add/remove/config) → rebuild để __ptdlActions render lại đúng danh sách nút
      model.props.ptdlActionsRev,
      // ACL role đổi (allowedActions về) → rebuild để quyết ẩn/hiện cột Thao tác
      aclSig,
      // spanRows trên các cột group là CẤU TRÚC → đổi group by / display mode phải rebuild defs
      groupSig,
      groupMerge,
      // cột __ptdlSel phụ thuộc 2 setting này
      model.props.ptdlRowNumbers,
      model.props.ptdlAllowDelete,
    ],
  );
  const tk = tkOf(coll);
  const apiRef = React.useRef<any>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);
  // Merge mode: giữ giá trị ô gộp luôn nhìn thấy khi scroll trong span dài. position:sticky không
  // sống nổi trong container bị AG Grid transform:translateY → tự translate nội dung theo scroll.
  const stickRef = React.useRef<() => void>(() => {});
  // Tick sticky-top nhóm (rows mode) — gọi từ onBodyScroll (thay rAF loop chạy nóng liên tục).
  const topTickRef = React.useRef<() => void>(() => {});
  React.useEffect(() => {
    if (!groupMerge) {
      stickRef.current = () => {};
      return;
    }
    // Viewport v36 KHÔNG phát scroll event ra ngoài (scrollTop đổi nhưng cả window-capture lẫn
    // listener trên element đều im — verify thực nghiệm) → rAF loop + interval + MutationObserver.
    const stickCore = () => {
      // rootRef đọc LIVE mỗi tick — root null lúc arm không được phép giết vĩnh viễn cả effect.
      const root = rootRef.current;
      if (!root) return;
      const vp = root.querySelector(
        '.ag-grid-viewport, .ag-body-viewport, .ag-center-cols-viewport',
      ) as HTMLElement | null;
      // Geometry lấy từ WRAPPER (.ag-spanned-cell-wrapper) — phần tử duy nhất mang chiều cao span
      // thật; .ag-spanned-cell cao theo nội dung → clamp height-30 luôn ra 0 (bug đợt 1).
      const wrappers = root.querySelectorAll('.ag-spanned-cell-wrapper');
      if (!wrappers.length) return;
      // BUG AG Grid 36 + pinned columns: spanning container của section center KHÔNG được bù
      // bề rộng các cột pinned-left → span vẽ đè lên cột số dòng/expand. Tự hiệu chỉnh bằng cách
      // so x của section center ở dòng thường vs ở spanned row rồi dịch container. Ngưỡng 1.5px
      // (không phải 0.5) để không drift tích luỹ trên Windows DPI scale 125%/150% (gBCR lẻ).
      const normalSec = root.querySelector('.ag-row:not(.ag-spanned-row) .ag-grid-scrolling-cells');
      const spanSec = root.querySelector('.ag-spanned-row .ag-grid-scrolling-cells');
      if (normalSec && spanSec) {
        const dx = normalSec.getBoundingClientRect().x - spanSec.getBoundingClientRect().x;
        if (Math.abs(dx) > 1.5) {
          const sc = spanSec.closest('.ag-spanning-container') as HTMLElement | null;
          // position:static thì style.left vô hiệu — cộng dồn lúc đó là bom hẹn giờ (left phình
          // to vô hình, đến khi container thành positioned thì bay khỏi màn hình). Clamp ±1000
          // làm phao cứu sinh cuối.
          if (sc && getComputedStyle(sc).position !== 'static') {
            const cur = parseFloat(sc.style.left || '0') || 0;
            const next = Math.max(-1000, Math.min(1000, Math.round(cur + dx)));
            if (next !== cur) sc.style.left = `${next}px`;
          }
        }
      }
      // Neo vào ĐÁY HEADER, không phải mép viewport: .ag-header position:absolute z-index:1 ĐÈ
      // lên phần đầu viewport (vpTop == headerTop) → dính vào vpTop là dính sau lưng header,
      // đúng mà không ai thấy (phát hiện của user + verify elementFromPoint = header cell).
      const vpTop = (vp || root).getBoundingClientRect().top;
      const header = root.querySelector('.ag-header') as HTMLElement | null;
      const anchor = Math.max(vpTop, header ? header.getBoundingClientRect().bottom : vpTop);
      wrappers.forEach((w: any) => {
        const cell = w.querySelector('.ag-spanned-cell') as HTMLElement | null;
        const inner = cell?.firstElementChild as HTMLElement | null;
        const r = (w as HTMLElement).getBoundingClientRect();
        const delta = Math.min(Math.max(0, anchor - r.top), Math.max(0, r.height - 30));
        // Ghi CSS var lên WRAPPER; rule trong SHEET_CSS áp translateY xuống inner lúc
        // style-resolve → inner bị AG tái tạo giữa chừng vẫn dính. CHỈ ghi khi giá trị đổi:
        // nếu AG rewrite style attr của wrapper mỗi frame, MO(style) sẽ gọi lại stick — ghi
        // vô điều kiện lúc đó thành vòng MO↔setProperty tự kích.
        const want = delta > 0.5 ? `${Math.round(delta)}px` : '0px';
        if ((w as HTMLElement).style.getPropertyValue('--ptdl-stick') !== want) {
          (w as HTMLElement).style.setProperty('--ptdl-stick', want);
        }
        // Dọn transform inline còn sót từ bản cũ — inline đè chết rule CSS.
        if (inner && inner.style.transform) inner.style.transform = '';
      });
    };
    const stick = () => {
      try {
        stickCore();
      } catch {
        // Exception KHÔNG được giết rAF loop — hình học lệch tự hồi ở tick sau.
      }
    };
    stickRef.current = stick;
    // Chạy stick MỖI tick, không change-detect: AG Grid re-render inner element sau scroll
    // (transform cũ mất) trong khi top wrapper không đổi → detect-theo-top sẽ bỏ sót (đã dính).
    // Vài wrapper × gBCR mỗi frame = rẻ.
    let raf = 0;
    const loop = () => {
      stick();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    // rAF bị pause khi cửa sổ occluded (và scroll event chỉ dispatch trong render frame) —
    // interval là lưới an toàn cho môi trường không có frame; rAF lo độ mượt khi có.
    const iv = setInterval(stick, 200);
    // Thêm belt: wheel trên block chắc chắn bubble tới đây kể cả khi viewport nuốt scroll event.
    const root0 = rootRef.current;
    const onWheel = () => setTimeout(stick, 60);
    root0?.addEventListener('wheel', onWheel, { passive: true });
    // MutationObserver = microtask, chạy NGAY SAU lượt rAF của AG Grid (kẻ vừa mutate DOM) và
    // TRƯỚC paint — thắng race về thứ tự bất kể AG đăng ký rAF lúc nào trong frame.
    let mo: MutationObserver | null = null;
    if (root0 && typeof MutationObserver !== 'undefined') {
      let scheduled = false;
      mo = new MutationObserver(() => {
        if (scheduled) return;
        scheduled = true;
        queueMicrotask(() => {
          scheduled = false;
          stick();
        });
      });
      // attributes:['style'] để bắt cả trường hợp AG rewrite style attr của wrapper (wipe CSS
      // var) — an toàn vì stick chỉ ghi khi giá trị đổi (không tự kích).
      mo.observe(root0, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
    }
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(iv);
      root0?.removeEventListener('wheel', onWheel);
      mo?.disconnect();
      stickRef.current = () => {};
    };
  }, [groupMerge]);
  // Rows mode: STACK header nhóm dính ở top — overlay React NỔI (KHÔNG pinned row chừa chỗ: số pinned đổi
  // theo độ dài chain → CẢ BODY đẩy lên/xuống = giật). Mỗi cấp dock ĐỘC LẬP theo per-level anchor (xem tick):
  // sticky chỉ đè đúng chỗ header thật vừa trôi qua slot → không che dòng khác, dòng kế tiếp luôn hiện ngay
  // dưới stack; slot chưa dock trong suốt để header mới tự trượt vào bằng chuyển động cuộn.
  const [topChain, setTopChain] = React.useState<any[]>([]);
  React.useEffect(() => {
    if (!grouping || groupMerge) {
      setTopChain([]);
      return;
    }
    const root = rootRef.current;
    if (!root) return;
    let lastArr: any[] = []; // prefix docked hiện tại — so sánh IDENTITY từng object
    const tick = () => {
      const api = apiRef.current;
      const vp = root.querySelector('.ag-grid-viewport') as HTMLElement | null;
      if (!api || !vp) return;
      // ĐỌC rowHeight THẬT (từng hardcode 30, nhưng rowHeight=36 → idx lệch tăng dần khi cuộn → sticky sai).
      const rh = api.getGridOption?.('rowHeight') || 36;
      const st = vp.scrollTop;
      const i0 = Math.floor((st + 1) / rh);
      const hIdx: Map<string, number> = model._groupHeaderIndex || new Map();
      const chainOf = (r: any): any[] | null => {
        if (!r) return null;
        if (r.__ptdlGroup) {
          const full = r.__rows?.[0] ? model._rowGroups?.get(String(r.__rows[0][tk])) : null;
          return full ? full.slice(0, (r.__lvl || 0) + 1) : null; // ancestors + CHÍNH nó
        }
        if (r.__ptdlSummary || r.__ptdlNew) return null;
        return model._rowGroups?.get(String(r[tk])) || null;
      };
      // PER-LEVEL ANCHOR (chuẩn sticky-tree — sửa lỗi "che thông tin/khoảng trắng" của bản probe-1-điểm):
      // slot cấp L neo vào DÒNG ĐANG NẰM TẠI slot đó (i0+L). Cấp L chỉ DOCK khi header THẬT của nhóm đã
      // trôi tới/qua đúng vị trí slot (pos ≤ st + L*rh — đọc từ _groupHeaderIndex). Hệ quả: sticky luôn
      // nằm ĐÈ đúng chỗ header thật vừa rời đi → không che dòng nào khác, dòng kế tiếp hiện ngay dưới
      // stack; giữa 2 nhóm thì slot chưa dock = trống TRONG SUỐT (header mới hiện xuyên qua, trượt vào
      // slot rồi mới đóng băng — không còn dải trắng). Docked là PREFIX (cha dock trước con) nên stack
      // luôn liền mạch từ cấp 0.
      const D = groupFields.length;
      const docked: any[] = [];
      for (let L = 0; L < D; L++) {
        const ch = chainOf(api.getDisplayedRowAtIndex?.(i0 + L)?.data);
        const g = ch && ch[L];
        if (!g) break;
        const hi = hIdx.get(String(g.__key));
        if (hi === undefined || hi * rh > st + L * rh) break; // header thật chưa tới slot → chưa dock
        docked.push(g);
      }
      // Chuyển cảnh KHÔNG cần transform: header thật tự trượt vào slot bằng chính chuyển động cuộn
      // (slot chưa dock = trong suốt), chạm slot thì "đóng băng" (dock); nhóm cũ nhả dock đúng lúc header
      // mới chạm đáy stack. So sánh IDENTITY (không phải chuỗi __key): rowData rebuild tạo group object
      // MỚI (count/__rows tươi) → sticky cập nhật ngay, hết cảnh count/Σ cũ kẹt lại (vd "Success (31)"
      // trong khi nhóm con (37)).
      if (docked.length !== lastArr.length || docked.some((g: any, i: number) => g !== lastArr[i])) {
        lastArr = docked;
        setTopChain(docked);
      }
    };
    topTickRef.current = tick;
    tick();
    // Cuộn → onBodyScroll gọi topTickRef (mượt lúc cuộn); interval nhẹ bắt các đổi ngoài scroll (collapse/resize).
    const iv = setInterval(tick, 150);
    return () => {
      clearInterval(iv);
      topTickRef.current = () => {};
    };
  }, [grouping, groupMerge, groupSig, model, tk]);
  // Sticky nhóm KHÔNG dùng pinned top row của AG: ô nhóm value-less → AG không bao giờ vẽ lại khi data đổi
  // (state/option đúng "(empty)" nhưng DOM kẹt "Success"). Thay bằng STACK OVERLAY React (dưới) đọc thẳng
  // topChain state → tự cập nhật, không phụ thuộc cơ chế refresh của AG.
  const [selCount, setSelCount] = React.useState(0);
  const [formulaOpen, setFormulaOpen] = React.useState(false); // Modal "Cột công thức" (thay popover — có AI/hàm/mẫu)
  // Grid sẵn sàng (api set trong onGridReady). Đưa vào dep width-apply effect để áp width ĐÃ LƯU + mặc định
  // NGAY khi api có (effect chạy lần mount trước onGridReady thì api null → bỏ qua, không thì width load bị mất).
  const [gridReady, setGridReady] = React.useState(false);
  const allowAdd = model.props.ptdlAllowAdd !== false;
  const allowDelete = model.props.ptdlAllowDelete !== false;
  const height = Number(model.props.ptdlHeight) > 100 ? Number(model.props.ptdlHeight) : 480;
  const meta = model.resource?.getMeta?.() || {};
  const draft = model.props.ptdlDraft || {};
  const draftDirty = Object.keys(draft).length > 0;
  // Add new: setting chọn hiển thị ở đâu — nút toolbar (giống core) và/hoặc dòng ＋ inline (giống Airtable).
  const addNewDisplay = model.props.ptdlAddNewDisplay || 'both';
  const showAddBtn = allowAdd && (addNewDisplay === 'button' || addNewDisplay === 'both');
  const showExport: boolean = false; // TẠM ẨN nút Xuất theo yêu cầu — đổi true để bật lại
  // Divider trước cụm "Thêm mới"/"Lưu dòng mới" chỉ hiện khi có nút NÀO ĐÓ đứng trước (copy/xoá theo selCount,
  // lưu-dirty, cụm editing, Xuất) — tránh dấu | thừa khi role user chỉ có mỗi nút Thêm mới.
  const hasLeftGroupButtons =
    selCount > 0 || model.dirtyCount() > 0 || !!model.flowEngine?.flowSettings?.enabled || showExport;
  // Nút "Thêm mới" → cuộn xuống + mở editor ô data đầu của dòng nháp (pinned bottom, index 0).
  const startAddNew = () => {
    const api = apiRef.current;
    if (!api) return;
    // Cột EDITABLE đầu (bỏ widget/không sửa được) — nếu chưa có thì lấy cột data đầu bất kỳ.
    const colKey =
      model._firstEditableCol ||
      (api.getAllDisplayedColumns?.() || [])
        .map((c: any) => c.getColId?.() || '')
        .find((id: string) => id && !id.startsWith('__ptdl') && !id.startsWith('__f_') && !id.startsWith('ag-Grid'));
    if (!colKey) return;
    try {
      api.ensureIndexVisible?.(api.getDisplayedRowCount() - 1, 'bottom');
      api.startEditingCell?.({ rowIndex: 0, rowPinned: 'bottom', colKey });
    } catch (e) {
      /* noop */
    }
  };
  // dòng tổng: model.props.ptdlSummary = {field: {agg, val, approx}} → format hiển thị
  const summary = model.props.ptdlSummary;
  const summarySig = JSON.stringify(
    Object.fromEntries(
      Object.entries((colState || {}).columns || {}).map(([k, v]: any) => [k, v?.summary || '']),
    ),
  );
  React.useEffect(() => {
    model.refreshSummary();
  }, [model, summarySig, raw]);
  const summaryRow = React.useMemo(() => {
    if (!summary || !Object.keys(summary).length) return null;
    const row: any = { __ptdlSummary: true };
    for (const [f, s] of Object.entries(summary) as any) {
      if (s?.val === null || s?.val === undefined) continue;
      if (s.agg === 'ratio' || s.agg === 'filledPct') {
        const dec = s.decimals ?? (s.agg === 'filledPct' ? 0 : 1);
        const asPct = s.pct || s.agg === 'filledPct';
        row[f] = `${Number(s.val).toFixed(dec)}${asPct ? '%' : ''}${s.approx ? ' *' : ''}`;
        continue;
      }
      const n = Number(s.val);
      const numTxt = Number.isNaN(n) ? String(s.val) : formatNum(s.agg === 'avg' ? Math.round(n * 100) / 100 : n, { thousands: true });
      const sym = model.getColCfg(f).summaryHideIcon ? '' : AGG_SHORT[s.agg] || s.agg;
      row[f] = `${sym ? sym + ' ' : ''}${numTxt}${s.approx ? ' *' : ''}`;
    }
    return row;
  }, [JSON.stringify(summary || {})]);
  const pinnedBottomRowData = React.useMemo(() => {
    const rows: any[] = [];
    if (allowAdd) rows.push({ __ptdlNew: true, ...draft });
    if (summaryRow) rows.push(summaryRow);
    return rows.length ? rows : undefined;
  }, [allowAdd, draft, summaryRow]);
  // AG Grid diff nông colDefs → đổi cellStyle phải ép vẽ lại cell. KHÔNG refreshHeader ở đây
  // (remount header giết popover ⚙ đang mở — header là observer tự cập nhật).
  React.useEffect(() => {
    apiRef.current?.refreshCells?.({ force: true });
  }, [JSON.stringify(colState || {}), model.props.ptdlActionsRev, model.props.ptdlWidgetRev]);
  // Áp WIDTH qua AG API thay vì rebuild colDefs → đổi width trong panel ⚙ KHÔNG remount header = KHÔNG
  // nháy panel. Chỉ áp cột width ĐÃ KHÁC (tránh vòng lặp). _suppressColCapture chặn handler tự capture khi áp.
  // QUAN TRỌNG: nếu colState này vừa CAPTURE TỪ GRID (user kéo resize/move/pin) thì SKIP — grid đã có width
  // đúng rồi, áp ngược lại (nhất là cột GHIM, capture đọc trễ) = "kéo xong tự về vị trí cũ" (springback).
  // Chỉ áp khi thay đổi đến từ PANEL ⚙ (setColCfg → _saveColState, không set cờ này).
  // useLayoutEffect (áp TRƯỚC paint): colDef không còn giữ width → cột này là NGUỒN width duy nhất (ngoài
  // lúc user kéo). Áp trước paint = không nháy khi load/rebuild và tự KHÔI PHỤC width từ colState sau mọi
  // rebuild colDefs (không còn springback vì không có colDef.width stale để AG re-sync về).
  React.useLayoutEffect(() => {
    const api = apiRef.current;
    if (!api?.getColumnState) return;
    if (model._colStateFromGrid) {
      model._colStateFromGrid = false;
      return; // width này vừa đến TỪ user kéo → AG đã có đúng, đừng áp ngược
    }
    const want = (colState || {}).columns || {};
    // Width mong muốn: colState.width (đã lưu) → mặc định. Cột điều khiển (sel/expand/spacer) tự giữ width
    // trong colDef → bỏ qua (null). Thao tác = 180. Data/formula chưa lưu = 160 (seed, vì defaultColDef bỏ width).
    const desiredWidth = (colId: string) => {
      const w = want[colId]?.width;
      if (w != null) return w;
      if (colId === '__ptdlActions') return 180;
      if (colId === '__ptdlSel' || colId === '__ptdlExpand' || colId === '__ptdlSpacer' || colId.startsWith('ag-Grid')) return null;
      return 160;
    };
    const changes: any[] = [];
    for (const c of api.getColumnState()) {
      const dw = desiredWidth(c.colId);
      if (dw != null && Math.round(dw) !== Math.round(c.width || 0)) {
        changes.push({ colId: c.colId, width: dw });
      }
    }
    if (!changes.length) return;
    model._suppressColCapture = true;
    try {
      api.applyColumnState({ state: changes });
    } finally {
      setTimeout(() => {
        model._suppressColCapture = false;
      }, 0);
    }
  }, [JSON.stringify((colState || {}).columns || {}), colDefs, gridReady]);
  ensureSheetCss();
  // Sự kiện từ input/textarea (popover ƒ, panel ⚙, editor…) — để browser xử lý copy/paste text bình thường.
  // Lưu ý: Popover antd là PORTAL nhưng React vẫn cho event nổi theo CÂY COMPONENT về wrapper này.
  const isTypingTarget = (t: any) => {
    const tag = t?.tagName?.toLowerCase?.();
    return tag === 'input' || tag === 'textarea' || !!t?.isContentEditable;
  };
  const onPaste = (e: React.ClipboardEvent) => {
    if (isTypingTarget(e.target)) return;
    const api = apiRef.current;
    if (!api) return;
    if (api.getEditingCells?.().length) return; // đang edit trong ô → để editor tự xử lý paste
    const focused = api.getFocusedCell?.();
    if (!focused) return;
    // paste khi focus dòng ghim: chỉ cho dòng draft (thêm mới), không cho dòng tổng
    if (focused.rowPinned === 'bottom') {
      const pr = pinnedBottomRowData?.[focused.rowIndex];
      if (!pr?.__ptdlNew) return;
    }
    const text = e.clipboardData?.getData('text/plain');
    if (!text || (!text.includes('\t') && !text.includes('\n'))) return; // 1 ô đơn lẻ thì thôi
    e.preventDefault();
    model.pasteTSV({
      text,
      startRowIndex: focused.rowIndex,
      startColId: focused.column?.getColId?.(),
      rowPinned: focused.rowPinned,
      api,
    });
  };
  // Copy NGƯỢC ra Excel/Sheets: Ctrl+C → TSV. Có dòng tick chọn = copy các dòng đó; không thì copy ô focus.
  const copySelection = (): number => {
    const api = apiRef.current;
    if (!api || api.getEditingCells?.().length) return -1;
    const sel = api.getSelectedRows?.() || [];
    let tsv = '';
    if (sel.length) {
      tsv = model.buildTSV(sel, api);
    } else if (model.hasMultiRange()) {
      tsv = model.rangeTSV(api);
    } else {
      const f = api.getFocusedCell?.();
      if (!f) return -1;
      const rowNode = f.rowPinned ? null : api.getDisplayedRowAtIndex?.(f.rowIndex);
      const fld = f.column?.getColId?.();
      if (!rowNode?.data || !fld || fld === '__ptdlExpand' || String(fld).startsWith('ag-Grid')) return -1;
      const fc = model._formulaOf(fld);
      if (fc) {
        const v = evalViewFormula(fc.formula, rowNode.data, coll);
        tsv = v === null || v === undefined ? '' : stripHtml(String(v));
      } else {
        const cf = coll?.getField?.(fld);
        const v = rowNode.data[fld];
        tsv = ['integer', 'number', 'percent'].includes(cf?.interface)
          ? v === null || v === undefined
            ? ''
            : String(v)
          : String(displayValue(cf, v ?? ''));
      }
    }
    (navigator as any).clipboard?.writeText?.(tsv);
    return sel.length;
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (isTypingTarget(e.target)) return; // đang gõ trong input/textarea → không cướp Ctrl+C/D/Esc
    if (e.key === 'Escape') {
      model.clearRange(apiRef.current);
      return;
    }
    if (!(e.ctrlKey || e.metaKey)) return;
    const k = String(e.key).toLowerCase();
    if (k === 'c') {
      const n = copySelection();
      if (n < 0) return;
      e.preventDefault();
      if (n > 0) model.context.message?.success?.(t('Đã sao chép {{n}} dòng', { n })); // copy ô/vùng: im lặng
    } else if (k === 'd') {
      if (!model.hasMultiRange()) return;
      e.preventDefault();
      model.fillDown(apiRef.current);
    }
  };
  // kết thúc kéo bôi vùng khi nhả chuột ở bất kỳ đâu
  React.useEffect(() => {
    const up = () => {
      model._rangeDrag = false;
    };
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, [model]);
  // còn dòng chưa lưu → cảnh báo trước khi rời trang
  React.useEffect(() => {
    if (!model.dirtyCount()) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [model, dirtyRev]);
  // rời sang dòng khác → flush dirty của dòng cũ (1 request/dòng)
  const lastRowKeyRef = React.useRef<string | null>(null);
  const onCellFocused = (e: any) => {
    if (e?.rowPinned) return;
    const rowNode = e?.api?.getDisplayedRowAtIndex?.(e.rowIndex);
    const key = rowNode?.data?.[tkForOverlay];
    const k = key === undefined || key === null ? null : String(key);
    const prev = lastRowKeyRef.current;
    lastRowKeyRef.current = k;
    if (prev && prev !== k && model._dirty.has(prev)) model.flushRow(prev);
  };
  return (
    <div
      ref={rootRef}
      className="ptdl-sheet"
      style={
        {
          width: '100%',
          // CSS var theo token → rule trong SHEET_CSS (editor bg, pinned row, accent) tự khớp dark/light + primary.
          '--ptdl-elevated': token.colorBgElevated,
          '--ptdl-pinned-bg': token.colorFillQuaternary,
          '--ptdl-primary': token.colorPrimary,
        } as React.CSSProperties
      }
      onPaste={onPaste}
      onKeyDown={onKeyDown}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        {/* SEARCH — bên trái (đồng bộ core). LIVE: gõ là lọc luôn (debounce 300ms) — không cần Enter. */}
        <AntInput.Search
          size="middle"
          allowClear
          placeholder={t('Tìm…')}
          style={{ width: 200 }}
          onSearch={(v: string) => {
            clearTimeout(model._searchTimer);
            model.quickSearch(v);
          }}
          onChange={(e: any) => {
            const v = e.target.value;
            clearTimeout(model._searchTimer);
            model._searchTimer = setTimeout(() => model.quickSearch(v), 300);
          }}
        />
        {/* NHÓM NÚT — dồn sang phải */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {selCount > 0 ? (
            <Button
              size="middle"
              icon={<CopyOutlined />}
              onClick={() => {
                const n = copySelection();
                if (n >= 0) model.context.message?.success?.(t('Đã sao chép {{n}} dòng', { n }));
              }}
            >
              {t('Sao chép')} ({selCount})
            </Button>
          ) : null}
          {allowDelete && selCount > 0 ? (
            <Popconfirm
              title={t('Xoá {{n}} dòng?', { n: selCount })}
              onConfirm={() => {
                const rows = (apiRef.current?.getSelectedRows?.() || []).filter((r: any) => model.canDestroy(r));
                model.deleteRows(rows.map((r: any) => r?.[tk]).filter((v: any) => v !== null && v !== undefined));
                setSelCount(0);
              }}
            >
              <Button size="middle" danger icon={<DeleteOutlined />}>
                {selCount}
              </Button>
            </Popconfirm>
          ) : null}
          {model.dirtyCount() > 0 ? (
            <>
              <span style={{ color: '#d48806', fontSize: 12 }}>● {t('{{n}} chưa lưu', { n: model.dirtyCount() })}</span>
              <Button size="middle" type="primary" onClick={() => model.flushAll()}>
                {t('Lưu')}
              </Button>
            </>
          ) : null}
          {model.flowEngine?.flowSettings?.enabled ? (
            <>
              <PtdlToolDivider />
              <Button size="middle" type="text" icon={<FunctionOutlined />} onClick={() => setFormulaOpen(true)}>
                {t('Công thức')}
              </Button>
              <AntModal
                open={formulaOpen}
                onCancel={() => setFormulaOpen(false)}
                title={<span><FunctionOutlined style={{ marginRight: 6 }} />{t('Cột công thức')}</span>}
                footer={null}
                width={540}
                destroyOnClose
                styles={{ body: { maxHeight: '68vh', overflowY: 'auto' } }}
              >
                <PtdlFormulaManager model={model} />
              </AntModal>
              <Popover trigger="click" placement="bottomLeft" content={<PtdlActionsNativeManager model={model} />}>
                <Button size="middle" type="text" icon={<ThunderboltOutlined />}>
                  {t('Thao tác')}
                </Button>
              </Popover>
              {model.hiddenColumns().length ? (
                <Popover
                  trigger="click"
                  placement="bottomLeft"
                  content={
                    <div style={{ width: 230 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#8c8c8c', marginBottom: 6 }}>{t('Cột đang ẩn')}</div>
                      {model.hiddenColumns().map((h: any) => (
                        <div
                          key={h.colId}
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 2 }}
                        >
                          <span style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {h.title}
                          </span>
                          <Button size="small" type="link" style={{ padding: 0 }} onClick={() => model.unhideColumn(h.colId)}>
                            {t('Hiện')}
                          </Button>
                        </div>
                      ))}
                    </div>
                  }
                >
                  <Button size="middle" type="text" icon={<EyeInvisibleOutlined />}>
                    {t('Ẩn')} ({model.hiddenColumns().length})
                  </Button>
                </Popover>
              ) : null}
            </>
          ) : null}
          {showExport ? (
            <Button
              size="middle"
              type="text"
              icon={<ExportOutlined />}
              onClick={() =>
                apiRef.current?.exportDataAsCsv?.({
                  fileName: `${coll?.name || 'sheet'}.csv`,
                  processCellCallback: (p: any) => {
                    const id = p.column?.getColId?.() || '';
                    if (id === '__ptdlExpand' || id === '__ptdlSel' || id === '__ptdlActions' || id === '__ptdlSpacer' || String(id).startsWith('ag-Grid')) return '';
                    const fc = model._formulaOf(id);
                    if (fc) return stripHtml(String(evalViewFormula(fc.formula, p.node?.data, coll) ?? ''));
                    const cf = coll?.getField?.(id);
                    return displayValue(cf, p.value);
                  },
                })
              }
            >
              {t('Xuất')}
            </Button>
          ) : null}
          {/* Thêm mới / Lưu dòng mới — RA NGOÀI CÙNG (nút chính, phải nhất) */}
          {allowAdd && draftDirty ? (
            <>
              {hasLeftGroupButtons ? <PtdlToolDivider /> : null}
              <Button size="middle" type="primary" icon={<SaveOutlined />} onClick={() => model.saveDraft()}>
                {t('Lưu dòng mới')}
              </Button>
              <Button size="middle" onClick={() => model.clearDraft()}>
                {t('Bỏ')}
              </Button>
            </>
          ) : showAddBtn ? (
            <>
              {hasLeftGroupButtons ? <PtdlToolDivider /> : null}
              <Button size="middle" type="primary" icon={<PlusOutlined />} onClick={startAddNew}>
                {t('Thêm mới')}
              </Button>
            </>
          ) : null}
        </div>
      </div>
      <div ref={sheetWrapRef} style={{ height, width: '100%', position: 'relative' }}>
        {/* Sticky nhóm (rows mode) = STACK overlay React NỔI đọc topChain state (mảng cha→con). KHÔNG pinned
            row chừa chỗ (đổi số pinned = body nhảy N×36px = giật); overlay đè lên nội dung, nhóm mới trờ tới
            có hiệu ứng đẩy (tick ghi translateY — xem topTickRef). */}
        {grouping && !groupMerge && topChain.length ? (
          <PtdlStickyGroupStack
            model={model}
            coll={coll}
            getApi={() => apiRef.current}
            chain={topChain}
            top={35}
            rowHeight={36}
          />
        ) : null}
        <AgGridReact
          theme={gridTheme}
          rowData={rowData}
          columnDefs={colDefs}
          pinnedBottomRowData={pinnedBottomRowData}
          getRowId={(p: any) =>
            p.data?.__ptdlNew
              ? 'ptdl-new-row'
              : p.data?.__ptdlSummary
                ? 'ptdl-summary-row'
                : p.data?.__ptdlGroup
                  ? `ptdl-g:${p.data.__key ?? p.data.__lbl}`
                  : String(p.data?.[tk] ?? '')
          }
          getRowStyle={(p: any) =>
            p.data?.__ptdlSummary
              ? { background: token.colorFillQuaternary, fontStyle: 'normal' }
              : p.data?.__ptdlGroup
                ? { background: token.colorFillQuaternary, fontWeight: 600 }
                : undefined
          }
          loading={loading && rowData.length === 0}
          rowHeight={36}
          headerHeight={34}
          defaultColDef={SHEET_DEFAULT_COLDEF}
          enableCellSpan={true}
          onBodyScroll={() => {
            stickRef.current();
            topTickRef.current();
          }}
          singleClickEdit={true}
          enterNavigatesVertically={true}
          enterNavigatesVerticallyAfterEdit={true}
          stopEditingWhenCellsLoseFocus={true}
          suppressDragLeaveHidesColumns={true}
          rowSelection={
            allowDelete
              ? { mode: 'multiRow', checkboxes: false, headerCheckbox: false, enableClickSelection: false }
              : undefined
          }
          onGridReady={(e: any) => {
            apiRef.current = e.api;
            setGridReady(true); // → width-apply effect chạy lại với api sẵn sàng → áp width đã lưu lúc load
          }}
          onSelectionChanged={(e: any) => {
            setSelCount(e.api?.getSelectedRows?.().length || 0);
            // checkbox trong __ptdlSel đọc node.isSelected() lúc render → phải refresh cột này
            e.api?.refreshCells?.({ columns: ['__ptdlSel'], force: true });
          }}
          onCellFocused={onCellFocused}
          onCellMouseDown={(e: any) => {
            const ev = e.event;
            if (ev?.button !== 0) return;
            const fld = e.column?.getColId?.() || e.colDef?.field;
            // Cột điều khiển (__ptdlSel/Expand/Actions/Spacer) KHÔNG được khởi động range bôi vùng:
            // mousedown lên nút row-action (Edit/View/…) mà begin range → _repaintRange refreshCells →
            // action re-render giữa down/up → click bị nuốt = "bấm Edit không ra popup". Loại hết __ptdl*.
            if (!fld || String(fld).startsWith('__ptdl') || String(fld).startsWith('ag-Grid') || e.node?.rowPinned) {
              model.clearRange(e.api);
              return;
            }
            if (ev.shiftKey) {
              model.extendRange(e.api, e.node.rowIndex, fld);
              ev.preventDefault();
            } else {
              model.beginRange(e.api, e.node.rowIndex, fld);
            }
          }}
          onCellMouseOver={(e: any) => {
            const fld = e.column?.getColId?.() || e.colDef?.field;
            if (model._rangeDrag && fld && !e.node?.rowPinned) {
              model.extendRange(e.api, e.node.rowIndex, fld);
            }
          }}
          onColumnResized={(e: any) => {
            // Chỉ resize từ UI (kéo tay): set cờ để width-apply effect SKIP (AG đã có width đúng — hết
            // springback), rồi lưu colState. applyColumnState của effect bắn source 'api' → không lọt vào đây.
            if (e.finished && e.source === 'uiColumnResized') {
              model._colStateFromGrid = true;
              model.captureColumnState(e.api);
            }
          }}
          onColumnMoved={(e: any) => e.finished && !model._suppressColCapture && model.captureColumnState(e.api)}
          onColumnPinned={(e: any) => !model._suppressColCapture && model.captureColumnState(e.api)}
          onCellValueChanged={(e: any) => model.commitCell(e)}
          onRowDragEnter={(e: any) => {
            // Drag mới: dọn trạng thái cũ (kể cả vạch mồ côi nếu lần trước bị ESC) rồi vẽ ngay.
            lastDragOverRef.current = null;
            clearDropMark();
            markDropTarget(e);
          }}
          onRowDragMove={(e: any) => markDropTarget(e)}
          onRowDragLeave={() => {
            // Kéo RA NGOÀI grid: thả ở ngoài sẽ không move (AG không bắn rowDragEnd) → xoá vạch + đích.
            lastDragOverRef.current = null;
            clearDropMark();
          }}
          onRowDragEnd={(e: any) => {
            // Unmanaged row drag: AG Grid KHÔNG tự sắp lại — mình gọi server `:move` rồi refresh (server
            // là nguồn sự thật, khớp phần còn lại của plugin). vDirection không đáng tin bằng so index nguồn/đích.
            clearDropMark();
            const src = e.node?.data;
            if (!src || e.node?.rowPinned || !dragRowOk(src)) { lastDragOverRef.current = null; return; }
            // Đích = row đang rê; thả ở vùng trống dưới đáy / trên dòng summary → dùng đích hợp lệ CUỐI
            // CÙNG đã rê qua (đúng chỗ vạch chỉ đang vẽ) thay vì lặng lẽ bỏ qua như trước.
            let overNode = e.overNode;
            if (!overNode || overNode.rowPinned || !dragRowOk(overNode.data)) overNode = lastDragOverRef.current;
            lastDragOverRef.current = null;
            const over = overNode?.data;
            if (!over) return;
            const sourceId = src[tk];
            const targetId = over[tk];
            if (sourceId == null || targetId == null || String(sourceId) === String(targetId)) return;
            const from = e.node.rowIndex ?? -1;
            const to = overNode.rowIndex ?? -1;
            // kéo XUỐNG (from<to) → chèn SAU đích; kéo LÊN → chèn TRƯỚC đích (TRÙNG luật vẽ vạch markDropTarget).
            const method = from >= 0 && to >= 0 ? (from < to ? 'insertAfter' : 'insertBefore') : 'insertAfter';
            const scopeKey = sortFld?.scopeKey;
            model.moveRow(sourceId, targetId, method, scopeKey ? over[scopeKey] : undefined);
          }}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, marginTop: 6 }}>
        {grouping ? (
          <>
            {!groupMerge ? (
              <>
                <Button size="small" type="text" onClick={() => model.setAllGroups(true)} style={{ color: '#666' }}>
                  {t('Mở tất cả')}
                </Button>
                <Button size="small" type="text" onClick={() => model.setAllGroups(false)} style={{ color: '#666' }}>
                  {t('Thu tất cả')}
                </Button>
              </>
            ) : null}
            <span style={{ color: '#999', fontSize: 12 }}>
              {typeof meta.count === 'number' ? t('{{rows}} dòng · {{groups}} nhóm', { rows: meta.count, groups: groupCount.current }) : ''}
              {(() => {
                const loaded = rowData.length - headerCount.current;
                return typeof meta.count === 'number' && meta.count > loaded
                  ? t(' (đang tải {{loaded}}/{{total}} — tăng Group load limit)', { loaded, total: meta.count })
                  : '';
              })()}
            </span>
          </>
        ) : null}
        {!grouping ? (
          <span style={{ color: '#999', fontSize: 12 }}>
            {typeof meta.count === 'number' ? t('{{n}} dòng', { n: meta.count }) : ''}
          </span>
        ) : null}
        {grouping ? null : (
        <Pagination
          size="small"
          current={model.resource?.getPage?.() || 1}
          pageSize={model.resource?.getPageSize?.() || 100}
          total={typeof meta.count === 'number' ? meta.count : 0}
          showSizeChanger
          pageSizeOptions={[50, 100, 200, 500]}
          onChange={(page: number, pageSize: number) => {
            try {
              if (pageSize !== (model.resource?.getPageSize?.() || 100)) {
                model.resource.setPageSize?.(pageSize);
                model.resource.setPage?.(1);
              } else {
                model.resource.setPage?.(page);
              }
              model.resource.refresh?.();
            } catch (err) {
              // eslint-disable-next-line no-console
              console.warn('[spreadsheet-view] pagination failed', err);
            }
          }}
        />
        )}
      </div>
    </div>
  );
});

// ---------------- registration ----------------
export function registerSpreadsheet({ flowEngine }: { flowEngine: any }) {
  const CollectionBlockModel: any = flowEngine?.getModelClass?.('CollectionBlockModel');
  if (!CollectionBlockModel) {
    // eslint-disable-next-line no-console
    console.warn('[spreadsheet-view] CollectionBlockModel not found in this lane — skip');
    return;
  }
  // House style dialog cấu hình: SettingsGrid + CollapsibleSection của @tuanla90/shared (idempotent — các
  // plugin khác cũng đăng ký; tự đăng ký để không phụ thuộc plugin nào được bật).
  registerSettingsKit(flowEngine?.flowSettings, {
    FormTab,
    'FormTab.TabPane': (FormTab as any).TabPane,
    // PtdlColumnsTab dùng qua component-reference (ColumnsTabComp closure), không cần đăng ký string.
  });

  // --- cell host: bản rút gọn của QuickEditFormModel (không popover, không antd Form) ---
  class PtdlSheetCellModel extends FlowModel {
    declare fieldPath: string;
    collection: any;
    currentRecord: any = null;

    onInit(options: any) {
      super.onInit(options);
      this.context.defineProperty('blockModel', { value: this });
      this.context.defineProperty('record', { get: () => this.currentRecord, cache: false });
      this.context.defineProperty('collection', { get: () => this.collection });
    }

    render() {
      return (
        <>
          {this.mapSubModels('fields', (field: any) => (
            <FieldModelRenderer
              key={field.uid}
              model={field}
              value={(this.props as any).value}
              onChange={(this.props as any).onChange}
            />
          ))}
        </>
      );
    }
  }
  (PtdlSheetCellModel as any).registerFlow({
    key: 'ptdlCellSettings',
    sort: 100,
    steps: {
      init: {
        async handler(ctx: any, params: any) {
          const { dataSourceKey, collectionName, fieldPath } = params || {};
          if (!dataSourceKey || !collectionName || !fieldPath) return;
          ctx.model.fieldPath = fieldPath;
          ctx.model.collection = ctx.dataSourceManager.getCollection(dataSourceKey, collectionName);
          const cf = ctx.model.collection?.getField?.(fieldPath);
          if (!cf) return;
          // Editor tuỳ chọn per-column (vd PtdlRichSelectFieldModel) — không có/không tồn tại thì default binding.
          const override =
            params.use && ctx.model.flowEngine?.getModelClass?.(params.use) ? params.use : null;
          const binding = override
            ? { modelName: override, defaultProps: undefined }
            : (EditableItemModel as any).getDefaultBindingByField?.(ctx, cf);
          if (!binding) return;
          // Widget hiển thị enhancement: nạp config (từ dialog native, lưu ở colState) vào stepParams của
          // flow widget → beforeRender áp thành props → renderComponent đọc đúng cấu hình.
          const widgetStep =
            params.widgetFlow && params.widgetParams ? { [params.widgetFlow]: { settings: params.widgetParams } } : {};
          const fieldModel = ctx.model.addSubModel('fields', {
            use: binding.modelName,
            props: typeof binding.defaultProps === 'function' ? binding.defaultProps(ctx, cf) : binding.defaultProps,
            stepParams: { fieldSettings: { init: { dataSourceKey, collectionName, fieldPath } }, ...widgetStep },
          });
          try {
            fieldModel.setProps(cf.getComponentProps?.() || {});
          } catch {
            /* getComponentProps optional */
          }
          ctx.model.context.defineProperty('collectionField', { get: () => cf });
          await fieldModel.dispatchEvent('beforeRender');
          // Widget select (Select buttons) đọc options từ uiSchema.enum — field này có thể RỖNG ([{},{}])
          // trong khi getComponentProps().options mới đầy đủ (value/label/color). Ép lại SAU beforeRender
          // (flow của model đã chạy) để renderComponent match đúng option. Chỉ áp khi có options tĩnh (select).
          try {
            const gcpOpts = cf.getComponentProps?.()?.options;
            if (Array.isArray(gcpOpts) && gcpOpts.length && gcpOpts.some((o: any) => o && (o.value != null || o.label != null))) {
              fieldModel.setProps({ options: gcpOpts });
            }
          } catch {
            /* optional */
          }
        },
      },
    },
  });

  // --- record drawer form: N field như QuickEditFormModel nhưng cho CẢ record ---
  // CHỈ các interface đã kiểm chứng chạy được khi tạo field model tay (to-many o2m/m2m cần
  // stepParams `target` riêng của flow core → crash "destructure 'target'", để Phase 2).
  const RECORD_FORM_IFACES = new Set([...EDITABLE_IFACES, 'textarea']);

  class PtdlFieldErrorBoundary extends React.Component<any, { err: boolean }> {
    state = { err: false };
    static getDerivedStateFromError() {
      return { err: true };
    }
    componentDidCatch(e: any) {
      // eslint-disable-next-line no-console
      console.warn('[spreadsheet-view] field render failed in drawer:', this.props.name, e);
    }
    render() {
      if (this.state.err) {
        return <span style={{ color: '#bbb', fontSize: 12 }}>{t('(field này chưa hỗ trợ sửa ở đây)')}</span>;
      }
      return this.props.children;
    }
  }
  class PtdlRecordFormModel extends FlowModel {
    collection: any;
    currentRecord: any = {};
    dirty: Record<string, any> = {};
    declare resource: any;

    onInit(options: any) {
      super.onInit(options);
      this.context.defineProperty('blockModel', { value: this });
      this.context.defineProperty('record', { get: () => this.currentRecord, cache: false });
      this.context.defineProperty('collection', { get: () => this.collection });
    }

    render() {
      const values = (this.props as any).ptdlValues || {};
      const labelColor = this.context?.themeToken?.colorTextSecondary || '#666';
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {this.mapSubModels('fields', (field: any) => {
            const name = field.__ptdlFieldName;
            if (field.__ptdlBroken) return null;
            return (
              <div key={field.uid}>
                <div style={{ fontSize: 12, color: labelColor, marginBottom: 4 }}>
                  {field.__ptdlFieldTitle}
                </div>
                <PtdlFieldErrorBoundary name={name}>
                  <FieldModelRenderer
                    model={field}
                    value={values[name]}
                    onChange={(v: any) => {
                      this.dirty[name] = v;
                      this.setProps({ ptdlValues: { ...values, [name]: v } });
                    }}
                  />
                </PtdlFieldErrorBoundary>
              </div>
            );
          })}
        </div>
      );
    }
  }
  (PtdlRecordFormModel as any).registerFlow({
    key: 'ptdlRecordFormSettings',
    sort: 100,
    steps: {
      init: {
        async handler(ctx: any, params: any) {
          const { dataSourceKey, collectionName } = params || {};
          if (!dataSourceKey || !collectionName) return;
          ctx.model.collection = ctx.dataSourceManager.getCollection(dataSourceKey, collectionName);
          const resource = ctx.createResource(SingleRecordResource);
          resource.setDataSourceKey(dataSourceKey);
          resource.setResourceName(collectionName);
          ctx.model.resource = resource;
          const record = ctx.inputArgs?.record || {};
          if (ctx.inputArgs?.filterByTk !== undefined && ctx.inputArgs?.filterByTk !== null) {
            resource.setFilterByTk(ctx.inputArgs.filterByTk);
          }
          resource.setData(record);
          ctx.model.currentRecord = record;
          ctx.model.setProps({ ptdlValues: { ...record } });
          for (const cf of ctx.model.collection?.getFields?.() || []) {
            if (!cf?.name || !cf?.interface || !RECORD_FORM_IFACES.has(cf.interface)) continue;
            try {
              const binding = (EditableItemModel as any).getDefaultBindingByField?.(ctx, cf);
              if (!binding) continue;
              const fieldModel: any = ctx.model.addSubModel('fields', {
                use: binding.modelName,
                props: typeof binding.defaultProps === 'function' ? binding.defaultProps(ctx, cf) : binding.defaultProps,
                stepParams: { fieldSettings: { init: { dataSourceKey, collectionName, fieldPath: cf.name } } },
              });
              fieldModel.__ptdlFieldName = cf.name;
              fieldModel.__ptdlFieldTitle = typeof cf.title === 'string' && cf.title ? cf.title : cf.name;
              try {
                fieldModel.setProps(cf.getComponentProps?.() || {});
              } catch {
                /* optional */
              }
              try {
                await fieldModel.dispatchEvent('beforeRender');
              } catch (e) {
                // Field lỗi flow (thiếu params đặc thù) → bỏ qua field đó, KHÔNG sập cả form.
                fieldModel.__ptdlBroken = true;
                // eslint-disable-next-line no-console
                console.warn('[spreadsheet-view] skip drawer field', cf.name, e);
              }
            } catch (e) {
              // eslint-disable-next-line no-console
              console.warn('[spreadsheet-view] skip drawer field', cf?.name, e);
            }
          }
        },
      },
    },
  });

  function PtdlRecordDrawer({ form, block, view, record, filterByTk }: any) {
    const [saving, setSaving] = React.useState(false);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <FlowModelRenderer
          model={form}
          inputArgs={{ record, filterByTk }}
          fallback={<span style={{ color: '#999' }}>{t('Đang tải…')}</span>}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button onClick={() => view?.close?.()}>{t('Huỷ')}</Button>
          <Button
            type="primary"
            loading={saving}
            onClick={async () => {
              const changed = form.dirty || {};
              if (!Object.keys(changed).length) {
                view?.close?.();
                return;
              }
              setSaving(true);
              try {
                await form.resource.save({ ...changed }, { refresh: false });
                block.resource?.refresh?.();
                block.context.message?.success?.(t('Đã lưu'));
                view?.close?.();
              } catch (err: any) {
                const msg = err?.response?.data?.errors?.[0]?.message || err?.message || t('Lưu thất bại');
                block.context.message?.error?.(msg);
              } finally {
                setSaving(false);
              }
            }}
          >
            {t('Lưu')}
          </Button>
        </div>
      </div>
    );
  }

  // --- block model ---
  class PtdlSpreadsheetBlockModel extends CollectionBlockModel {
    static scene = 'many';
    _cellHosts = new Map<string, any>();
    /** record của dòng đang mở popup — context `record` (getter sống) cho expression {{ ctx.record.<tk> }} */
    _popupRow: any = null;

    onInit(options: any) {
      super.onInit(options);
      try {
        this.context.defineProperty('record', { get: () => this._popupRow, cache: false });
      } catch {
        /* đã có sẵn từ base thì thôi */
      }
      // _ptdlColMenu là STATE UI (popover config cột đang mở) — nếu lỡ persist (save khi đang mở) sẽ TỰ MỞ
      // config lúc load trang. Reset về null khi khởi tạo để không bao giờ tự mở.
      try {
        if ((this.props as any)._ptdlColMenu) this.setProps({ _ptdlColMenu: null });
      } catch {
        /* noop */
      }
    }

    /** KHÔNG persist state UI thuần (popover config cột đang mở) → tránh tự mở config khi load trang. */
    serialize() {
      const data: any = super.serialize();
      if (data?.props) delete data.props._ptdlColMenu;
      return data;
    }

    createResource(_ctx: any, _params: any) {
      return this.context.createResource(MultiRecordResource);
    }
    get resource(): any {
      return this.context.resource;
    }

    getCellHost(fieldPath: string) {
      // editor override đọc LIVE từ colCfg — cache theo (field, editor) để đổi editor là host mới
      const use = this.getColCfg(fieldPath).editorUse || '';
      const key = `${fieldPath}::${use}`;
      if (!this._cellHosts.has(key)) {
        const coll = this.context.collection;
        const host = this.flowEngine.createModel({
          use: 'PtdlSheetCellModel',
          stepParams: {
            ptdlCellSettings: {
              init: { dataSourceKey: coll?.dataSourceKey, collectionName: coll?.name, fieldPath, use: use || undefined },
            },
          },
        });
        this._cellHosts.set(key, host);
      }
      return this._cellHosts.get(key);
    }

    // ---------- widget hiển thị enhancement (Relative date / Select buttons) ----------
    _widgetHosts = new Map<string, any>();
    /** Host cho widget hiển thị của cột — 1 model/cột, config (từ dialog native) lưu trong colState và
     *  nạp vào field model qua init handler. Cache theo (field, widget, params) để đổi config = host mới. */
    getWidgetHost(fieldName: string) {
      const c = this.getColCfg(fieldName);
      const w = SHEET_DISPLAY_WIDGETS[c.displayWidget];
      if (!w || !this.flowEngine?.getModelClass?.(w.use)) return null;
      const key = `${fieldName}::${c.displayWidget}::${JSON.stringify(c.displayWidgetParams || null)}`;
      if (!this._widgetHosts.has(key)) {
        const coll = this.context.collection;
        const host: any = this.flowEngine.createModel({
          use: 'PtdlSheetCellModel',
          stepParams: {
            ptdlCellSettings: {
              init: {
                dataSourceKey: coll?.dataSourceKey,
                collectionName: coll?.name,
                fieldPath: fieldName,
                use: w.use,
                widgetFlow: w.flow,
                // Select-buttons: mặc định size NHỎ trong bảng (mật độ cao) — user vẫn đổi được qua dialog ⚙.
                widgetParams:
                  w.use === 'PtdlSelectButtonsDisplayFieldModel' && !c.displayWidgetParams?.size
                    ? { ...(c.displayWidgetParams || {}), size: 'small' }
                    : c.displayWidgetParams || undefined,
              },
            },
          },
        });
        this._widgetHosts.set(key, host);
        // Display gọi renderComponent trực tiếp (không mount qua FlowModelRenderer) → phải TỰ chạy init flow
        // để tạo field submodel; xong thì bump rev → refreshCells vẽ lại ô với widget đã sẵn sàng.
        Promise.resolve(host.dispatchEvent?.('beforeRender'))
          .then(() => this.setProps({ ptdlWidgetRev: (((this.props as any).ptdlWidgetRev as number) || 0) + 1 }))
          .catch(() => {});
      }
      return this._widgetHosts.get(key);
    }
    widgetFieldModel(fieldName: string) {
      const host: any = this.getWidgetHost(fieldName);
      const f = host?.subModels?.fields;
      return Array.isArray(f) ? f[0] : f;
    }
    /** Chọn widget hiển thị cho cột (hoặc bỏ). Xoá config cũ + cache để dựng lại. */
    setColWidget(fieldName: string, key: string | undefined) {
      this.setColCfg(fieldName, { displayWidget: key || undefined, displayWidgetParams: undefined });
      this._widgetHosts.clear();
    }
    /** Mở DIALOG NATIVE của widget để cấu hình; đóng xong bắt stepParams → lưu vào colState (persist chắc). */
    async configColWidget(fieldName: string) {
      const c = this.getColCfg(fieldName);
      const w = SHEET_DISPLAY_WIDGETS[c.displayWidget];
      const fm: any = this.widgetFieldModel(fieldName);
      if (!w || !fm?.openStepSettingsDialog) return;
      try {
        await fm.openStepSettingsDialog(w.flow, 'settings');
        const sp = fm.stepParams?.[w.flow]?.settings;
        this.setColCfg(fieldName, { displayWidgetParams: sp && Object.keys(sp).length ? sp : undefined });
        this._widgetHosts.clear();
      } catch (e) {
        /* noop */
      }
    }

    // ---------- per-column state: {order:[field...], columns:{[field]:{width,pinned,align,color,bg,bold,headerColor,headerBold,thousands,decimals}}} ----------
    getColState(): any {
      return (this.props as any).ptdlColState || {};
    }
    getColCfg(fieldName: string): any {
      return this.getColState().columns?.[fieldName] || {};
    }
    setColCfg(fieldName: string, patch: any) {
      const state = { ...this.getColState() };
      const cols = { ...(state.columns || {}) };
      const cur: any = { ...(cols[fieldName] || {}), ...patch };
      Object.keys(cur).forEach((k) => cur[k] === undefined && delete cur[k]);
      cols[fieldName] = cur;
      state.columns = cols;
      this._saveColState(state);
    }
    resetColCfg(fieldName: string) {
      const state = { ...this.getColState() };
      const cols = { ...(state.columns || {}) };
      delete cols[fieldName];
      state.columns = cols;
      this._saveColState(state);
    }
    isNumericField(fieldName: string) {
      const cf = this.context.collection?.getField?.(fieldName);
      return ['integer', 'number', 'percent'].includes(cf?.interface);
    }
    isAssocField(fieldName: string) {
      const cf = this.context.collection?.getField?.(fieldName);
      // createdBy/updatedBy = belongsTo(users) → cũng là quan hệ, cho phép Trình sửa (RichSelect).
      return ['m2o', 'o2o', 'oho', 'obo', 'createdBy', 'updatedBy'].includes(cf?.interface);
    }
    /** Bắt kéo-thả của AG Grid (resize/move/pin) → lưu width/pin/order vào state. */
    captureColumnState(api: any) {
      const st = api?.getColumnState?.() || [];
      const state = { ...this.getColState() };
      const cols = { ...(state.columns || {}) };
      const order: string[] = [];
      for (const c of st) {
        const id = c?.colId;
        if (!id || id === '__ptdlDrag' || id === '__ptdlExpand' || id === '__ptdlSpacer' || String(id).startsWith('ag-Grid')) continue;
        order.push(id);
        const cur: any = { ...(cols[id] || {}) };
        if (c.width) cur.width = c.width;
        if (c.pinned) cur.pinned = c.pinned;
        else delete cur.pinned;
        cols[id] = cur;
      }
      state.order = order;
      state.columns = cols;
      // KHÔNG set _colStateFromGrid ở đây: cờ đó chỉ đúng cho RESIZE (AG đã có width, đừng áp ngược). Với
      // pin/move (cấu trúc → rebuild colDefs làm MẤT width) thì effect PHẢI áp lại từ colState để khôi phục.
      // Nên cờ được set riêng trong handler onColumnResized (chỉ resize), không ở đây.
      this._saveColState(state);
    }
    _saveTimer: any = null;
    _searchTimer: any = null;
    _saveColState(state: any) {
      this.setProps({ ptdlColState: state });
      try {
        this.setStepParams('ptdlSheetColumns', 'state', { state });
        // Chỉ persist khi đang bật UI editor (user thường kéo cột = session-only, không ghi uiSchema).
        // Debounce — gõ trong panel ⚙ không bắn 1 request/phím.
        if (this.flowEngine?.flowSettings?.enabled) {
          clearTimeout(this._saveTimer);
          this._saveTimer = setTimeout(() => {
            try {
              (this as any).save?.();
            } catch {
              /* noop */
            }
          }, 800);
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[spreadsheet-view] persist column state failed', e);
      }
    }

    // ---------- ACL phản chiếu (with-acl-meta): thiếu meta = cho phép, có meta = theo danh sách tk ----------
    _aclAllows(action: string, rowData: any): boolean {
      if (rowData?.__ptdlNew) return action === 'update';
      const aa = this.resource?.getMeta?.()?.allowedActions;
      const list = aa?.[action];
      if (!Array.isArray(list)) return true;
      const tk = rowData?.[tkOf(this.context.collection)];
      return list.some((x: any) => String(x) === String(tk));
    }
    canUpdate(rowData: any) {
      return this._aclAllows('update', rowData);
    }
    canDestroy(rowData: any) {
      return this._aclAllows('destroy', rowData);
    }

    // ---------- draft: dòng nhập mới ghim cuối bảng ----------
    setDraftValue(fieldName: string, value: any) {
      const d = { ...((this.props as any).ptdlDraft || {}) };
      d[fieldName] = value;
      this.setProps({ ptdlDraft: d });
    }
    clearDraft() {
      this.setProps({ ptdlDraft: {} });
    }
    async saveDraft() {
      const coll = this.context.collection;
      const draft = (this.props as any).ptdlDraft || {};
      const values: any = {};
      for (const f of coll?.getFields?.() || []) {
        const dv = f?.options?.defaultValue;
        if (dv !== undefined && dv !== null) values[f.name] = dv;
      }
      Object.assign(values, draft);
      try {
        await this.resource.create(values);
        this.clearDraft();
        this.resource.refresh?.();
        this.context.message?.success?.(t('Đã thêm dòng'));
      } catch (err: any) {
        const msg = err?.response?.data?.errors?.[0]?.message || err?.message || t('Thêm dòng thất bại');
        this.context.message?.error?.(msg);
      }
    }

    /** Ghi 1 field của 1 row trực tiếp qua resource (editor tự gọi, không nhờ AG Grid chuyển value). */
    async commitValue(rowData: any, fieldName: string, value: any): Promise<boolean> {
      if (!fieldName || rowData?.__ptdlSummary) return false;
      // Dòng nhập mới: ghi vào draft, CHƯA gọi server (bấm Save new row mới tạo record).
      if (rowData?.__ptdlNew) {
        this.setDraftValue(fieldName, value);
        return true;
      }
      const coll = this.context.collection;
      const tk = rowData?.[tkOf(coll)];
      if (tk === null || tk === undefined) return false;
      try {
        await this.resource.update(tk, { [fieldName]: value });
        // im lặng khi thành công — toast chỉ dành cho lỗi & thao tác hàng loạt
        return true;
      } catch (err: any) {
        // eslint-disable-next-line no-console
        console.error('[spreadsheet-view] save failed', err);
        const msg = err?.response?.data?.errors?.[0]?.message || err?.message || t('Lưu thất bại');
        this.context.message?.error?.(msg);
        return false;
      }
    }

    /** Kéo-thả đổi vị trí dòng → server action `<coll>:move` (đổi giá trị cột sort) rồi refresh. */
    async moveRow(sourceId: any, targetId: any, method?: string, targetScope?: any): Promise<void> {
      const coll = this.context.collection;
      const sf = sortFieldOf(coll);
      if (!sf?.name || sourceId == null || targetId == null) return;
      const params: any = { sourceId, targetId, sortField: sf.name };
      if (method) params.method = method;
      if (sf.scopeKey && targetScope !== undefined) params.targetScope = targetScope;
      try {
        // CHUẨN HOÁ cột sort về 1..N TRƯỚC khi move (action server của plugin này). Dữ liệu tạo ngoài
        // luồng chuẩn (import cloner/gsheet-sync, INSERT SQL, workflow…) không qua hook cấp sort → cột
        // sort bị TRÙNG/NULL. Thuật toán `:move` của NocoBase shift theo KHOẢNG GIÁ TRỊ và giả định sort
        // duy nhất — gặp trùng là dòng nhảy lung tung + đẻ thêm giá trị trùng sau mỗi lần kéo. Bảng đã
        // chuẩn → server no-op (1 câu SELECT). Server chưa cập nhật plugin → bỏ qua, move như cũ.
        try {
          await this.resource.runAction('ptdlResequenceSort', { data: { sortField: sf.name } });
        } catch (seqErr) {
          // eslint-disable-next-line no-console
          console.warn('[spreadsheet-view] resequence sort skipped (old server?)', seqErr);
        }
        await this.resource.runAction('move', { params });
        await this.resource.refresh?.();
      } catch (err: any) {
        // eslint-disable-next-line no-console
        console.error('[spreadsheet-view] move row failed', err);
        const msg = err?.response?.data?.errors?.[0]?.message || err?.message || t('Đổi vị trí dòng thất bại');
        this.context.message?.error?.(msg);
      }
    }

    /**
     * Row expand. 2 chế độ (block settings → Row drawer):
     *  - custom: popup NATIVE của NocoBase (action `openView` → ChildPageModel persist dưới block;
     *    bật UI editor để tự thiết kế nội dung drawer bằng block chuẩn — Details/Form/tab, đủ cả to-many).
     *  - auto (mặc định): form tự sinh như cũ, zero-config.
     */
    openRecordDrawer(rowData: any) {
      const coll = this.context.collection;
      if (!coll || !rowData) return;
      const tk = rowData[tkOf(coll)];
      if ((this.props as any).ptdlDrawerMode === 'custom') {
        this._popupRow = rowData;
        this.dispatchEvent('ptdlOpenRow');
        return;
      }
      const form = this.flowEngine.createModel({
        use: 'PtdlRecordFormModel',
        stepParams: {
          ptdlRecordFormSettings: { init: { dataSourceKey: coll.dataSourceKey, collectionName: coll.name } },
        },
      });
      this.context.viewer?.open?.({
        type: 'drawer',
        title: `${typeof coll.title === 'string' && coll.title ? coll.title : coll.name} #${tk}`,
        width: 520,
        content: (drawer: any) => (
          <PtdlRecordDrawer form={form} block={this} view={drawer} record={rowData} filterByTk={tk} />
        ),
      });
    }

    /**
     * Paste TSV từ Excel/Sheets: map vào vùng ô từ ô đang focus, mỗi dòng 1 request update
     * (runAction — KHÔNG refresh từng dòng), vượt cuối bảng / paste ở dòng draft → create mới.
     * Trần 200 dòng/lần (BRD §4.4 — nâng khi có bulkSync server).
     */
    async pasteTSV({ text, startRowIndex, startColId, rowPinned, api }: any) {
      const coll = this.context.collection;
      if (!coll) return;
      const lines = String(text).replace(/\r/g, '').split('\n');
      while (lines.length && lines[lines.length - 1] === '') lines.pop();
      if (!lines.length) return;
      const MAX = 1000; // bulkSync transaction lo phần ghi; fallback per-row vẫn chạy được nhưng chậm
      if (lines.length > MAX) {
        this.context.message?.error?.(t('Dán tối đa {{max}} dòng/lần', { max: MAX }));
        return;
      }
      const displayed = (api?.getAllDisplayedColumns?.() || [])
        .map((c: any) => c.getColId?.())
        .filter((id: any) => id && id !== '__ptdlExpand' && !String(id).startsWith('ag-Grid'));
      let startIdx = displayed.indexOf(startColId);
      if (startIdx < 0) startIdx = 0;
      const tkField = tkOf(coll);
      const fromDraftRow = rowPinned === 'bottom';
      // Target đi theo DÒNG HIỂN THỊ (không phải index mảng data) — bỏ qua dòng nhóm/summary khi grouping.
      let cursor = startRowIndex;
      const nextTargetRow = (): any => {
        for (;;) {
          const node = api?.getDisplayedRowAtIndex?.(cursor);
          cursor += 1;
          const d = node?.data;
          if (!d) return null; // hết bảng → phần còn lại thành create
          if (d.__ptdlGroup || d.__ptdlSummary || d.__ptdlNew) continue;
          return d;
        }
      };
      // Gom ops trước, ưu tiên 1 request bulkSync (transaction); server chưa có action → fallback per-row.
      const updates: any[] = [];
      const creates: any[] = [];
      let skipped = 0;
      for (let r = 0; r < lines.length; r++) {
        const cells = lines[r].split('\t');
        const patch: any = {};
        for (let c = 0; c < cells.length; c++) {
          const fieldName = displayed[startIdx + c];
          if (!fieldName) break;
          const cf = coll.getField?.(fieldName);
          if (!cf) continue;
          const v = parsePastedValue(cf, cells[c]);
          if (v !== undefined) patch[fieldName] = v;
        }
        if (!Object.keys(patch).length) continue;
        const targetRow = fromDraftRow ? null : nextTargetRow();
        if (targetRow && !targetRow.__ptdlNew) {
          if (!this.canUpdate(targetRow)) {
            skipped += 1;
            continue;
          }
          updates.push({ filterByTk: targetRow[tkField], values: patch });
        } else {
          creates.push(patch);
        }
      }
      if (!updates.length && !creates.length) return;
      const key = 'ptdl-paste';
      this.context.message?.loading?.({ content: t('Đang dán {{n}} dòng…', { n: updates.length + creates.length }), key, duration: 0 });
      let failed = 0;
      try {
        await this.resource.runAction('bulkSync', { data: { updates, creates } });
      } catch (bulkErr) {
        // eslint-disable-next-line no-console
        console.warn('[spreadsheet-view] bulkSync unavailable/failed — fallback per-row', bulkErr);
        for (const u of updates) {
          try {
            await this.resource.runAction('update', { params: { filterByTk: u.filterByTk }, data: u.values });
          } catch {
            failed += 1;
          }
        }
        for (const c of creates) {
          try {
            await this.resource.runAction('create', { data: c });
          } catch {
            failed += 1;
          }
        }
      }
      await this.resource.refresh?.();
      const summary = [
        updates.length ? t('{{n}} đã cập nhật', { n: updates.length }) : null,
        creates.length ? t('{{n}} đã tạo', { n: creates.length }) : null,
        failed ? t('{{n}} lỗi', { n: failed }) : null,
        skipped ? t('{{n}} bỏ qua (không có quyền)', { n: skipped }) : null,
      ]
        .filter(Boolean)
        .join(' · ');
      const fn = failed ? this.context.message?.warning : this.context.message?.success;
      fn?.({ content: summary || t('Không có gì được dán'), key, duration: 3 });
    }

    // ---------- sort server-side + quick search (Phase "basics") ----------
    /** Cycle sort: none → asc → desc → none. Cột formula không sort được (giá trị không có ở server). */
    toggleSort(fieldName: string) {
      if (String(fieldName).startsWith('__')) return;
      const cur = (this.props as any).ptdlSort || {};
      let next: any = null;
      if (cur.col !== fieldName) next = { col: fieldName, dir: 'asc' };
      else if (cur.dir === 'asc') next = { col: fieldName, dir: 'desc' };
      // else: đang desc → về none
      try {
        this.resource.setSort?.(next ? [next.dir === 'desc' ? `-${next.col}` : next.col] : []);
        this.resource.setPage?.(1);
        this.resource.refresh?.();
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[spreadsheet-view] sort failed', e);
      }
      this.setProps({ ptdlSort: next });
    }
    /**
     * Tìm nhanh trên nhiều loại cột:
     *  - text (input/textarea/email/phone/url): $includes
     *  - select/radio: match LABEL option chứa q → lọc theo value ($in / $anyOf cho multi)
     *  - m2o: lọc nested theo label field của record đích ($includes)
     *  - q là số: match chính xác id (tk) + các cột integer/number
     */
    quickSearch(text: string) {
      const coll = this.context.collection;
      const q = String(text || '').trim();
      try {
        if (!q) {
          this.resource.removeFilterGroup?.('ptdlQuickSearch');
        } else {
          const ql = q.toLowerCase();
          const or: any[] = [];
          const asNum = /^-?\d+(\.\d+)?$/.test(q) ? Number(q) : null;
          for (const f of coll?.getFields?.() || []) {
            const iface = f?.interface;
            const name = f?.name;
            if (!name || !iface) continue;
            if (['input', 'textarea', 'email', 'phone', 'url'].includes(iface)) {
              or.push({ [name]: { $includes: q } });
            } else if (['select', 'radioGroup'].includes(iface)) {
              const vals = enumOf(f)
                .filter((o: any) => String(o?.label ?? '').toLowerCase().includes(ql))
                .map((o: any) => o.value);
              if (vals.length) or.push({ [name]: { $in: vals } });
            } else if (['multipleSelect', 'checkboxGroup'].includes(iface)) {
              const vals = enumOf(f)
                .filter((o: any) => String(o?.label ?? '').toLowerCase().includes(ql))
                .map((o: any) => o.value);
              if (vals.length) or.push({ [name]: { $anyOf: vals } });
            } else if (['m2o', 'o2o', 'oho', 'obo'].includes(iface)) {
              // Tìm theo LABEL quan hệ: field label đã cấu hình → titleField của target → các field định danh
              // có THẬT trên target (nickname/title/name/username/email). Chỉ dùng field TỒN TẠI (tránh SQL lỗi).
              const tColl: any = (f as any).targetCollection;
              const tFields = new Set(((tColl?.getFields?.() || []) as any[]).map((tf: any) => tf?.name));
              const cands = [
                assocLabelKey(f),
                tColl?.titleField,
                tColl?.options?.titleField,
                'nickname', 'title', 'name', 'username', 'label', 'email',
              ].filter(Boolean);
              const seen = new Set<string>();
              for (const lf of cands) {
                if (tFields.has(lf) && !seen.has(lf)) {
                  seen.add(lf);
                  or.push({ [`${name}.${lf}`]: { $includes: q } });
                }
              }
            } else if (asNum !== null && ['integer', 'number', 'id'].includes(iface)) {
              or.push({ [name]: { $eq: asNum } });
            }
          }
          // id/tk luôn match khi gõ số (kể cả không hiển thị cột id)
          if (asNum !== null) {
            const tk = tkOf(coll);
            if (!or.some((c) => Object.keys(c)[0] === tk)) or.push({ [tk]: { $eq: asNum } });
          }
          if (!or.length) return;
          this.resource.addFilterGroup?.('ptdlQuickSearch', { $or: or });
        }
        this.resource.setPage?.(1);
        this.resource.refresh?.();
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[spreadsheet-view] quick search failed', e);
      }
    }

    // ---------- dirty-row batch: text/number gõ nhiều ô 1 dòng → 1 request khi rời dòng ----------
    _dirty = new Map<string, { row: any; patch: Record<string, any> }>();
    _bumpDirty() {
      this.setProps({ ptdlDirtyRev: (((this.props as any).ptdlDirtyRev as number) || 0) + 1 });
    }
    dirtyCount() {
      return this._dirty.size;
    }
    isDirtyCell(p: any): boolean {
      if (!this._dirty.size || p?.node?.rowPinned) return false;
      const key = String(p?.data?.[tkOf(this.context.collection)]);
      const d = this._dirty.get(key);
      return !!d && p?.colDef?.field !== undefined && d.patch[p.colDef.field] !== undefined;
    }
    stageCell(row: any, fieldName: string, value: any) {
      const key = String(row?.[tkOf(this.context.collection)]);
      const cur = this._dirty.get(key) || { row, patch: {} };
      cur.patch[fieldName] = value;
      this._dirty.set(key, cur);
      this._bumpDirty();
    }
    _isConflict(err: any) {
      return err?.response?.status === 409 || err?.status === 409;
    }
    async _handleConflict(entries: Array<[string, any]>) {
      // record đã bị người khác sửa: tải bản mới, GIỮ dirty của user, cập nhật snapshot updatedAt
      // để lần Save tiếp theo = ghi đè có chủ đích.
      await this.resource.refresh?.();
      const data = this.resource.getData?.() || [];
      const tkField = tkOf(this.context.collection);
      for (const [k, d] of entries) {
        const fresh = data.find((r: any) => String(r?.[tkField]) === String(k));
        if (fresh) d.row = fresh;
        this._dirty.set(k, d);
      }
      this._bumpDirty();
      this.context.message?.warning?.(
        t('Dòng này vừa bị người khác sửa — bảng đã tải bản mới, thay đổi của bạn vẫn giữ (bấm Save để ghi đè).'),
      );
    }
    async flushRow(key: string) {
      const d = this._dirty.get(key);
      if (!d) return;
      this._dirty.delete(key);
      this._bumpDirty();
      try {
        // bulkSync (có check xung đột updatedAt) → fallback update thường nếu server chưa có action
        try {
          await this.resource.runAction('bulkSync', {
            data: { updates: [{ filterByTk: key, values: d.patch, expectUpdatedAt: d.row?.updatedAt }] },
          });
        } catch (err: any) {
          if (this._isConflict(err)) throw err;
          await this.resource.runAction('update', { params: { filterByTk: key }, data: d.patch });
        }
        await this.resource.refresh?.();
        // im lặng khi thành công — vạch cam biến mất là tín hiệu đã lưu
      } catch (err: any) {
        if (this._isConflict(err)) {
          await this._handleConflict([[key, d]]);
          return;
        }
        this._dirty.set(key, d); // giữ lại dirty để sửa tiếp
        this._bumpDirty();
        const msg = err?.response?.data?.errors?.[0]?.message || err?.message || t('Lưu thất bại');
        this.context.message?.error?.(msg);
      }
    }
    async flushAll() {
      if (!this._dirty.size) return;
      const entries = Array.from(this._dirty.entries());
      this._dirty.clear();
      this._bumpDirty();
      try {
        const updates = entries.map(([k, d]) => ({
          filterByTk: k,
          values: d.patch,
          expectUpdatedAt: d.row?.updatedAt,
        }));
        try {
          await this.resource.runAction('bulkSync', { data: { updates } });
        } catch (err: any) {
          if (this._isConflict(err)) throw err;
          // server chưa có bulkSync → per-row (không check xung đột)
          for (const [k, d] of entries) {
            await this.resource.runAction('update', { params: { filterByTk: k }, data: d.patch });
          }
        }
        await this.resource.refresh?.();
        if (entries.length > 1) this.context.message?.success?.(t('Đã lưu {{n}} dòng', { n: entries.length }));
      } catch (err: any) {
        if (this._isConflict(err)) {
          await this._handleConflict(entries);
          return;
        }
        for (const [k, d] of entries) this._dirty.set(k, d);
        this._bumpDirty();
        const msg = err?.response?.data?.errors?.[0]?.message || err?.message || t('Lưu thất bại');
        this.context.message?.error?.(msg);
      }
    }

    // ---------- grouping (Lark-style, 1 cấp, load-all) ----------
    _groupOpen = new Map<string, boolean>();
    isGroupOpen(label: string) {
      return this._groupOpen.get(label) ?? true;
    }
    toggleGroup(label: string) {
      this._groupOpen.set(label, !this.isGroupOpen(label));
      this.setProps({ ptdlGroupRev: (((this.props as any).ptdlGroupRev as number) || 0) + 1 });
    }
    setAllGroups(open: boolean) {
      const arr = this.resource.getData?.() || [];
      const flds = groupFieldsOf(this);
      const coll = this.context.collection;
      for (const r of arr) {
        // key nhóm = path label các cấp, nối bằng GROUP_KEY_SEP  (không đụng label thật)
        let key = '';
        for (const f of flds) {
          const cf = coll?.getField?.(f);
          const lbl = String(displayValue(cf, r?.[f]) || '') || t('(trống)');
          key = key ? key + GROUP_KEY_SEP + lbl : lbl;
          this._groupOpen.set(key, open);
        }
      }
      this.setProps({ ptdlGroupRev: (((this.props as any).ptdlGroupRev as number) || 0) + 1 });
    }

    // ---------- summary row (dòng tổng ghim cuối) ----------
    summaryDefs(): Array<any> {
      const cols = this.getColState().columns || {};
      return Object.entries(cols)
        .filter(([, c]: any) => c?.summary)
        .map(([f, c]: any) =>
          c.summary === 'ratio'
            ? { field: f, agg: 'ratio', num: c.ratioNum, den: c.ratioDen, pct: c.ratioPct !== false, decimals: c.decimals }
            : { field: f, agg: c.summary },
        )
        .filter((d: any) => d.agg !== 'ratio' || (d.num && d.den));
    }
    _summarySeq = 0;
    /** Tính tổng: field thật → 1 request `:query` aggregate ĐÚNG filter/search hiện tại (toàn bảng);
     *  cột ƒ / fallback → tính client trên dữ liệu đã tải. */
    async refreshSummary() {
      const defs = this.summaryDefs();
      if (!defs.length) {
        if ((this.props as any).ptdlSummary) this.setProps({ ptdlSummary: null });
        return;
      }
      const seq = ++this._summarySeq;
      const coll = this.context.collection;
      const out: Record<string, any> = {};
      // 1 field → 1 server measure. Cột association (m2o/…) KHÔNG có cột SQL trùng tên (chỉ có FK) →
      // aggregate theo foreignKey; cột ƒ ảo không query server được (trả null → fallback client).
      const ASSOC_IFACES = new Set(['m2o', 'o2o', 'oho', 'obo']);
      const measureFor = (field: string, agg: string): { col: string; agg: string } | null => {
        if (!field || field.startsWith('__f_') || !coll?.getField?.(field)) return null;
        if (!SERVER_AGGS.has(agg)) return null; // empty/unique/median/range/filledPct → tính client
        const cf = coll.getField(field);
        if (ASSOC_IFACES.has(cf?.interface)) {
          if (agg !== 'count') return null; // assoc: chỉ count map được sang FK; unique/… tính client cho đúng
          const fk = cf?.foreignKey || cf?.options?.foreignKey;
          return fk ? { col: fk, agg: 'count' } : null;
        }
        return { col: field, agg };
      };
      // Gom measures: agg thường = 1 measure; ratio = 2 measure (Σ tử + Σ mẫu, chia ở client cho đúng
      // ở mọi cấp — KHÔNG phải trung bình cột %). alias có tiền tố để map lại.
      const measures: Array<{ alias: string; field: string; aggregation: string }> = [];
      for (const d of defs) {
        if (d.agg === 'ratio') {
          const mn = measureFor(d.num, 'sum');
          const md = measureFor(d.den, 'sum');
          if (mn && md) {
            measures.push({ alias: `__rn_${d.field}`, field: mn.col, aggregation: mn.agg });
            measures.push({ alias: `__rd_${d.field}`, field: md.col, aggregation: md.agg });
          }
        } else {
          const m = measureFor(d.field, d.agg);
          if (m) measures.push({ alias: d.field, field: m.col, aggregation: m.agg });
        }
      }
      let row: any = null;
      if (measures.length) {
        try {
          const body = await this.resource.runAction('query', {
            data: {
              measures,
              ...(Object.keys(this.resource.getFilter?.() || {}).length ? { filter: this.resource.getFilter() } : {}),
            },
          });
          row = (body?.data || body || [])[0] || {};
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn('[spreadsheet-view] summary :query failed — fallback client', e);
        }
      }
      const data = this.resource.getData?.() || [];
      const has = (v: any) => v !== null && v !== undefined;
      for (const d of defs) {
        if (d.agg === 'ratio') {
          const rn = row?.[`__rn_${d.field}`];
          const rd = row?.[`__rd_${d.field}`];
          if (has(rn) && has(rd)) {
            out[d.field] = { agg: 'ratio', pct: d.pct, decimals: d.decimals, val: Number(rd) ? (Number(rn) / Number(rd)) * (d.pct ? 100 : 1) : null };
          } else {
            out[d.field] = { agg: 'ratio', pct: d.pct, decimals: d.decimals, approx: true, val: clientRatio(data, d.num, d.den, coll, this, d.pct) };
          }
        } else if (has(row?.[d.field])) {
          out[d.field] = { agg: d.agg, val: row[d.field] };
        } else {
          out[d.field] = { agg: d.agg, approx: true, val: clientAgg(data, d.field, d.agg, coll, this._formulaOf(d.field)) };
        }
      }
      if (seq !== this._summarySeq) return; // request cũ về muộn — bỏ
      this.setProps({ ptdlSummary: out });
    }

    // ---------- row actions NATIVE (TableActionsColumnModel host action model core + mọi plugin) ----------
    _rowActionCol: any = null;
    /** Cột row-action native: host record-scene action (Edit/View/Delete/Update/Print/Status/Workflow/…).
     *  render() → (value, record, index) => JSX cho từng dòng; nút "＋" liệt kê MỌI action đã đăng ký. */
    getRowActionColumn() {
      if (this._rowActionCol) return this._rowActionCol;
      const sm: any = (this as any).subModels?.ptdlActionsCol;
      const existing = Array.isArray(sm) ? sm[0] : sm;
      this._rowActionCol = existing || (this as any).addSubModel('ptdlActionsCol', { use: 'TableActionsColumnModel' });
      return this._rowActionCol;
    }
    /** Có action native nào chưa (để quyết hiện cột). */
    hasNativeRowActions() {
      const col = this._rowActionCol || (Array.isArray((this as any).subModels?.ptdlActionsCol) ? (this as any).subModels.ptdlActionsCol[0] : (this as any).subModels?.ptdlActionsCol);
      const acts = col?.subModels?.actions;
      return Array.isArray(acts) ? acts.length > 0 : false;
    }
    /** Danh sách action native hiện có, SẮP theo props.ptdlActionOrder (uid[]).
     *  Backend KHÔNG persist sortIndex sub-model lồng (giữ thứ tự tạo) → lưu thứ tự ở block props (persist
     *  chắc như ptdlColState) rồi sort ở client. Action mới (chưa có trong order) xếp cuối. */
    getRowActionsList() {
      const acts = this.getRowActionColumn()?.subModels?.actions;
      if (!Array.isArray(acts)) return [];
      const order: string[] = (this.props as any).ptdlActionOrder;
      if (!Array.isArray(order) || !order.length) return acts;
      const rank = (u: string) => {
        const k = order.indexOf(u);
        return k < 0 ? 1e6 : k;
      };
      return [...acts].sort((a: any, b: any) => rank(a.uid) - rank(b.uid));
    }
    /** Role hiện tại có dùng được ÍT NHẤT một native row-action nào không (đọc allowedActions meta mà server
     *  trả kèm data theo quyền của role). Fail-open: chưa có meta → true (đừng ẩn nhầm cột khi chưa biết).
     *  Native EditActionModel/DeleteActionModel gắn getAclActionName() = 'update'/'destroy'; role chỉ-xem có
     *  mảng rỗng → ẩn cột Thao tác. (admin/root: mọi pk đều nằm trong list → hiện.) */
    nativeActionsUsableForRole() {
      const acts = this.getRowActionsList();
      if (!acts.length) return false;
      let allowed: any;
      try {
        allowed = (this as any).resource?.getMeta?.('allowedActions');
      } catch (e) {
        allowed = null;
      }
      if (!allowed || typeof allowed !== 'object') return true; // chưa biết quyền → hiện (fail-open)
      return acts.some((a: any) => {
        let an: any = null;
        try {
          an = a?.getAclActionName?.();
        } catch (e) {
          an = null;
        }
        if (!an) return true; // action custom không gắn ACL → coi như dùng được
        const list = allowed[an];
        return Array.isArray(list) ? list.length > 0 : !!list;
      });
    }
    /** Action có thể thêm (native + MỌI plugin) — item {key, label, createModelOptions, useModel}. */
    async getAddableRowActions() {
      const RG: any = this.flowEngine?.getModelClass?.('RecordActionGroupModel');
      if (!RG?.defineChildren) return [];
      try {
        return (await RG.defineChildren({ engine: this.flowEngine, model: this, collection: this.context.collection })) || [];
      } catch (e) {
        return [];
      }
    }
    // Persist row-action THEO TỪNG CHILD (kiểu native NocoBase), KHÔNG parent-save:
    //  - parent save() serialize cả cây rồi upsert; backend TẠO child mới nhưng KHÔNG prune child bị bỏ →
    //    remove không dính + save đang-bay re-tạo child vừa destroy (trùng/sống lại). Verified live.
    //  - add = child.save() (tạo record), remove = child.destroy() (xoá record), move = save sortIndex mới.
    addRowAction(createModelOptions: any) {
      try {
        const child = this.getRowActionColumn().addSubModel('actions', createModelOptions);
        this._persistChild(child);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[spreadsheet-view] add row action failed', e);
      }
      this._bumpActionsRev();
    }
    async removeRowAction(a: any) {
      try {
        // Editing → destroy() xoá record DB thật; ngoài editing → chỉ gỡ local (session-only, như kéo cột).
        if (this.flowEngine?.flowSettings?.enabled) await (a?.destroy?.() ?? a?.remove?.());
        else a?.remove?.();
      } catch (e) {
        /* noop */
      }
      this._bumpActionsRev();
    }
    /** Đổi thứ tự nút action (dir -1=trái, +1=phải): hoán vị mảng + gán lại sortIndex.
     *  Persist bằng PARENT save() — serialize set sortIndex=vị-trí-mảng cho MỌI child (load sort theo đó).
     *  Reorder KHÔNG add/remove nên parent-save an toàn (không prune/re-tạo). child.save() lẻ không đẩy được
     *  thứ tự (order nằm ở blob subModels của parent). */
    /** Đổi thứ tự nút action (dir -1=trái, +1=phải): hoán vị theo thứ tự HIỂN THỊ rồi lưu uid[] vào
     *  props.ptdlActionOrder (persist qua block save như mọi prop). Render đọc lại qua getRowActionsList. */
    moveRowAction(a: any, dir: number) {
      const list = this.getRowActionsList(); // thứ tự hiện tại (đã sort theo order)
      const i = list.indexOf(a);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= list.length) return;
      const arr = [...list];
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
      this.setProps({ ptdlActionOrder: arr.map((x: any) => x.uid) });
      this._bumpActionsRev();
      if (this.flowEngine?.flowSettings?.enabled) {
        try {
          (this as any).save?.();
        } catch (e) {
          /* noop */
        }
      }
    }
    /** Persist 1 action sub-model (tạo/cập-nhật record của CHÍNH nó) — chỉ khi bật UI editor. */
    _persistChild(child: any) {
      if (child && this.flowEngine?.flowSettings?.enabled) {
        try {
          child.save?.();
        } catch (e) {
          /* noop */
        }
      }
    }
    /** Bump rev → colDefs rebuild + refreshCells (CHỈ UI; persist do _persistChild/destroy lo). */
    _bumpActionsRev() {
      this.setProps({ ptdlActionsRev: (((this.props as any).ptdlActionsRev as number) || 0) + 1 });
    }

    // ---------- row actions (LEGACY custom — giữ để migrate, sẽ bỏ khi native ổn) ----------
    saveRowActions(list: any[]) {
      const clean = (list || []).filter((a: any) => a && a.type);
      this.setProps({ ptdlRowActions: clean });
      try {
        this.setStepParams('ptdlSheetActions', 'state', { list: clean });
        if (this.flowEngine?.flowSettings?.enabled) (this as any).save?.();
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[spreadsheet-view] persist row actions failed', e);
      }
    }
    /** Thêm dòng vào đúng nhóm — 3 chế độ (setting "Add row"):
     *  - form (mặc định): tạo record prefill field nhóm rồi MỞ NGAY drawer của dòng đó (đúng popup
     *    của nút ⤢ — auto form hoặc custom openView tuỳ Row drawer) để điền nốt các field còn lại.
     *  - quick: tạo ngay + toast (kiểu Lark cũ).
     *  - link: mở URL tuỳ biến ({field} thay bằng giá trị của dòng mẫu trong nhóm), tab mới. */
    async addRowToGroup(sample: any, lvl: number, api?: any) {
      const mode = (this.props as any).ptdlAddRowMode || 'form';
      if (mode === 'link') {
        const tpl = (this.props as any).ptdlAddRowLink || '';
        if (!tpl) {
          this.context.message?.warning?.(t('Chưa cấu hình "Add row link" trong Settings'));
          return;
        }
        const w = window.open(interpolateUrl(tpl, sample || {}), '_blank');
        if (w) (w as any).opener = null;
        return;
      }
      const coll = this.context.collection;
      const flds = groupFieldsOf(this).slice(0, (lvl ?? 0) + 1);
      const values: any = {};
      for (const f of flds) {
        let v = sample?.[f];
        // m2o/o2o: value là object đầy đủ — thu về {targetKey} để create associate chắc chắn
        // (gửi nguyên object có thể bị bỏ qua → record rơi vào nhóm (trống)).
        if (v && typeof v === 'object' && !Array.isArray(v)) {
          const tkey = coll?.getField?.(f)?.options?.targetKey || 'id';
          if (v[tkey] !== undefined) v = { [tkey]: v[tkey] };
        }
        if (v !== undefined) values[f] = v;
      }
      try {
        // create() của MultiRecordResource tự refresh và trả body {data: record-mới}
        const res: any = await this.resource.create(values);
        const created = res?.data?.data ?? res?.data ?? null;
        if (mode === 'form' && created) {
          this.openRecordDrawer(created);
        }
        // Dòng mới rơi vào CUỐI nhóm — cuộn tới + nháy sáng để thấy nó nằm đâu.
        const id = created?.[tkOf(coll)];
        if (api && id !== undefined && id !== null) {
          let tries = 0;
          const seek = () => {
            const node = api.getRowNode?.(String(id));
            if (node) {
              api.ensureNodeVisible?.(node, 'middle');
              api.flashCells?.({ rowNodes: [node] });
              return;
            }
            if (++tries < 15) setTimeout(seek, 200);
          };
          setTimeout(seek, 250);
        } else if (mode !== 'form') {
          this.context.message?.success?.(t('Đã thêm 1 dòng vào cuối nhóm'));
        }
      } catch (err: any) {
        const msg = err?.response?.data?.errors?.[0]?.message || err?.message || t('Thêm dòng thất bại');
        this.context.message?.error?.(msg);
      }
    }
    /** Nhân bản dòng: copy giá trị scalar + m2o, bỏ khoá/hệ thống/to-many. */
    async duplicateRow(row: any) {
      const coll = this.context.collection;
      if (!coll || !row) return;
      const tkField = tkOf(coll);
      const SKIP = new Set([tkField, 'createdAt', 'updatedAt', 'createdById', 'updatedById']);
      const values: any = {};
      for (const f of coll.getFields?.() || []) {
        const name = f?.name;
        const iface = f?.interface;
        if (!name || SKIP.has(name)) continue;
        if (['id', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy', 'o2m', 'm2m', 'sort', 'sequence', 'formula', 'attachment'].includes(iface)) continue;
        const v = row[name];
        if (v !== undefined && v !== null) values[name] = v;
      }
      try {
        await this.resource.create(values);
        this.resource.refresh?.();
        this.context.message?.success?.(t('Đã nhân bản dòng'));
      } catch (err: any) {
        const msg = err?.response?.data?.errors?.[0]?.message || err?.message || t('Nhân bản thất bại');
        this.context.message?.error?.(msg);
      }
    }

    /** Row-action "Update field": set 1 field của dòng = giá trị cố định (nút kiểu "Mark done"). */
    async runUpdateAction(row: any, field: string, value: any) {
      const coll = this.context.collection;
      const tk = row?.[tkOf(coll)];
      if (!field || tk === null || tk === undefined) return;
      try {
        await this.resource.update(tk, { [field]: value });
        this.context.message?.success?.(t('Đã cập nhật'));
      } catch (err: any) {
        const msg = err?.response?.data?.errors?.[0]?.message || err?.message || t('Cập nhật thất bại');
        this.context.message?.error?.(msg);
      }
    }

    // ---------- formula columns (view-level) ----------
    saveFormulas(list: any[]) {
      const clean = (list || []).filter((f: any) => f && (f.title || f.formula));
      this.setProps({ ptdlFormulas: clean });
      try {
        this.setStepParams('ptdlSheetFormulas', 'state', { list: clean });
        if (this.flowEngine?.flowSettings?.enabled) (this as any).save?.();
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[spreadsheet-view] persist formulas failed', e);
      }
    }

    /**
     * Thứ tự colId dữ liệu hiện tại (field + formula, GỒM cả cột đang ẩn — để chèn/hiện lại đúng chỗ).
     * Nhân đôi đúng logic filter + apply order của buildColDefs nhưng chỉ trả colId (không dựng def).
     */
    _orderedDataColIds(): string[] {
      const coll = this.context.collection;
      const pf = (this.props as any).ptdlFields;
      const pick = Array.isArray(pf) && pf.length ? new Set(pf) : null;
      const fieldIds = (coll?.getFields?.() || [])
        .filter((cf: any) => cf?.name && cf?.interface && !HIDE_IFACES.has(cf.interface) && (!pick || pick.has(cf.name)))
        .map((cf: any) => cf.name);
      const formulaIds = ((this.props as any).ptdlFormulas || [])
        .filter((f: any) => f?.key)
        .map((f: any) => `__f_${f.key}`);
      let seq = [...fieldIds, ...formulaIds];
      const order = this.getColState()?.order || [];
      if (order.length) {
        const rank = new Map(order.map((id: string, i: number) => [id, i]));
        seq = seq
          .slice()
          .sort((a, b) => (rank.has(a) ? (rank.get(a) as number) : 9999) - (rank.has(b) ? (rank.get(b) as number) : 9999));
      }
      return seq;
    }

    /** Chèn cột formula ảo cạnh 1 cột (trái/phải), điền sẵn nội dung, ghim đúng vị trí qua order. */
    insertFormula(anchorColId: string, side: 'left' | 'right', payload: { title?: string; formula?: string }) {
      const key = `f${Date.now().toString(36)}`;
      const newCol = `__f_${key}`;
      const seq = this._orderedDataColIds();
      const idx = seq.indexOf(anchorColId);
      const at = idx < 0 ? seq.length : side === 'left' ? idx : idx + 1;
      const nextOrder = [...seq.slice(0, at), newCol, ...seq.slice(at)];
      const formulas = [
        ...(((this.props as any).ptdlFormulas || []) as any[]),
        { key, title: payload.title || '', formula: payload.formula || '' },
      ];
      this.saveFormulas(formulas);
      this._saveColState({ ...this.getColState(), order: nextOrder });
    }

    /** Sửa 1 cột formula (title/formula), giữ nguyên vị trí. */
    updateFormula(key: string, patch: { title?: string; formula?: string }) {
      const list = (((this.props as any).ptdlFormulas || []) as any[]).map((f: any) =>
        f?.key === key ? { ...f, ...patch } : f,
      );
      this.saveFormulas(list);
    }

    /** Xoá 1 cột formula: bỏ khỏi list + order + colCfg. */
    deleteFormula(key: string) {
      const colId = `__f_${key}`;
      const list = (((this.props as any).ptdlFormulas || []) as any[]).filter((f: any) => f?.key !== key);
      this.saveFormulas(list);
      const state = { ...this.getColState() };
      state.order = (state.order || []).filter((id: string) => id !== colId);
      const cols = { ...(state.columns || {}) };
      delete cols[colId];
      state.columns = cols;
      this._saveColState(state);
    }

    // ---------- ẩn/hiện cột (field hoặc formula) — cột ẩn vẫn giữ vị trí trong order ----------
    hideColumn(colId: string) {
      this.setColCfg(colId, { hidden: true });
    }
    unhideColumn(colId: string) {
      this.setColCfg(colId, { hidden: undefined });
    }
    /** Sắp lại thứ tự cột (từ tab "Cột" kéo-thả) — ghi thẳng state.order, buildColDefs áp ngay. */
    reorderColumns(orderedIds: string[]) {
      this._saveColState({ ...this.getColState(), order: Array.isArray(orderedIds) ? orderedIds : [] });
    }
    hiddenColumns(): Array<{ colId: string; title: string }> {
      const coll = this.context.collection;
      const cols = this.getColState().columns || {};
      const out: Array<{ colId: string; title: string }> = [];
      for (const colId of Object.keys(cols)) {
        if (!cols[colId]?.hidden) continue;
        const fc = this._formulaOf(colId);
        if (fc) {
          out.push({ colId, title: `ƒ ${fc.title || ''}`.trim() || 'ƒ' });
        } else {
          const f = coll?.getField?.(colId);
          out.push({ colId, title: (typeof f?.title === 'string' && f.title) || colId });
        }
      }
      return out;
    }

    // ---------- range selection tự code (Community không có) + fill-down ----------
    _range: any = null; // {ar, ac, er, ec} — anchor/extent theo (rowIndex, index trong _displayedCols)
    _rangeDrag = false;
    _displayedCols: string[] = [];
    _rafPending = false;

    _dataCols(api: any): string[] {
      // cột GHI được (đích của paste/fill): loại expand, formula (__f_*), selection (ag-Grid-*)
      return (api?.getAllDisplayedColumns?.() || [])
        .map((c: any) => c.getColId?.())
        .filter((id: any) => id && !String(id).startsWith('__') && !String(id).startsWith('ag-Grid'));
    }
    _copyCols(api: any): string[] {
      // cột ĐỌC được (copy/bôi vùng): field + formula __f_*; loại MỌI cột điều khiển __ptdl* (Sel/Expand/Actions/Spacer)
      return (api?.getAllDisplayedColumns?.() || [])
        .map((c: any) => c.getColId?.())
        .filter((id: any) => id && !String(id).startsWith('__ptdl') && !String(id).startsWith('ag-Grid'));
    }
    _formulaOf(colId: string): any {
      if (!String(colId).startsWith('__f_')) return null;
      const key = String(colId).slice(4);
      return ((this.props as any).ptdlFormulas || []).find((f: any) => f?.key === key) || null;
    }
    _normRange() {
      const r = this._range;
      if (!r) return null;
      return {
        r1: Math.min(r.ar, r.er),
        r2: Math.max(r.ar, r.er),
        c1: Math.min(r.ac, r.ec),
        c2: Math.max(r.ac, r.ec),
      };
    }
    _repaintRange(api: any) {
      if (this._rafPending) return;
      this._rafPending = true;
      requestAnimationFrame(() => {
        this._rafPending = false;
        // CHỈ vẽ lại cột data/formula (vùng bôi nằm ở đó) — KHÔNG force-refresh cột action:
        // FlowModelRenderer nút row-action đắt + re-render mỗi frame kéo range làm giật + có thể nuốt click.
        api?.refreshCells?.({ force: true, columns: this._copyCols(api) });
      });
    }
    beginRange(api: any, rowIndex: number, field: string) {
      this._displayedCols = this._copyCols(api);
      const ci = this._displayedCols.indexOf(field);
      if (ci < 0) return this.clearRange(api);
      this._range = { ar: rowIndex, ac: ci, er: rowIndex, ec: ci };
      this._rangeDrag = true;
      this._repaintRange(api);
    }
    extendRange(api: any, rowIndex: number, field: string) {
      if (!this._range) return this.beginRange(api, rowIndex, field);
      const ci = this._displayedCols.indexOf(field);
      this._range.er = rowIndex;
      if (ci >= 0) this._range.ec = ci;
      api?.stopEditing?.(true); // shift+click đừng mở editor
      this._repaintRange(api);
    }
    clearRange(api: any) {
      if (!this._range) return;
      this._range = null;
      this._rangeDrag = false;
      this._repaintRange(api);
    }
    hasMultiRange() {
      const n = this._normRange();
      return !!n && (n.r1 !== n.r2 || n.c1 !== n.c2);
    }
    /** cellClassRules gọi per cell để highlight vùng bôi. */
    inFillRange(p: any): boolean {
      const n = this._normRange();
      if (!n || p?.node?.rowPinned) return false;
      if (n.r1 === n.r2 && n.c1 === n.c2) return false; // 1 ô = để viền focus lo
      const ci = this._displayedCols.indexOf(p?.column?.getColId?.() || p?.colDef?.field);
      if (ci < 0) return false;
      const ri = p?.node?.rowIndex;
      return ri >= n.r1 && ri <= n.r2 && ci >= n.c1 && ci <= n.c2;
    }
    /** Dòng DATA hiển thị trong khoảng index hiển thị [r1..r2] — bỏ qua dòng nhóm/summary. */
    _displayedDataRows(api: any, r1: number, r2: number): any[] {
      const rows: any[] = [];
      for (let i = r1; i <= r2; i++) {
        const d = api?.getDisplayedRowAtIndex?.(i)?.data;
        if (!d || d.__ptdlGroup || d.__ptdlSummary || d.__ptdlNew) continue;
        rows.push(d);
      }
      return rows;
    }
    /** TSV của vùng bôi (rows × cols trong range) — theo dòng hiển thị. */
    rangeTSV(api: any): string {
      const n = this._normRange();
      if (!n) return '';
      const rows = this._displayedDataRows(api, n.r1, n.r2);
      const cols = this._displayedCols.slice(n.c1, n.c2 + 1);
      return this.buildTSV(rows, api, cols);
    }
    /** Ctrl+D: lấy dòng ĐẦU của vùng bôi fill xuống các dòng dưới (chỉ cột editable + có quyền). */
    async fillDown(api: any) {
      const n = this._normRange();
      const coll = this.context.collection;
      if (!n || !coll) return;
      if (n.r2 <= n.r1) {
        this.context.message?.info?.(t('Bôi vùng ≥ 2 dòng rồi Ctrl+D'));
        return;
      }
      const cols = this._displayedCols.slice(n.c1, n.c2 + 1);
      // dòng hiển thị (bỏ dòng nhóm/summary): dòng đầu = nguồn, các dòng sau = đích
      const rangeRows = this._displayedDataRows(api, n.r1, n.r2);
      const src = rangeRows[0];
      if (!src || rangeRows.length < 2) return;
      const tkField = tkOf(coll);
      const updates: any[] = [];
      let skipped = 0;
      for (let ri = 1; ri < rangeRows.length; ri++) {
        const row = rangeRows[ri];
        if (!this.canUpdate(row)) {
          skipped += 1;
          continue;
        }
        const patch: any = {};
        for (const f of cols) {
          const cf = coll.getField?.(f);
          if (!cf || !EDITABLE_IFACES.has(cf.interface)) continue;
          patch[f] = src[f] === undefined ? null : src[f];
        }
        if (Object.keys(patch).length) updates.push({ filterByTk: row[tkField], values: patch });
      }
      if (!updates.length) return;
      const key = 'ptdl-filldown';
      this.context.message?.loading?.({ content: t('Đang điền {{n}} dòng…', { n: updates.length }), key, duration: 0 });
      let failed = 0;
      try {
        await this.resource.runAction('bulkSync', { data: { updates } });
      } catch (bulkErr) {
        // eslint-disable-next-line no-console
        console.warn('[spreadsheet-view] bulkSync unavailable/failed — fallback per-row', bulkErr);
        for (const u of updates) {
          try {
            await this.resource.runAction('update', { params: { filterByTk: u.filterByTk }, data: u.values });
          } catch {
            failed += 1;
          }
        }
      }
      await this.resource.refresh?.();
      const fn = failed ? this.context.message?.warning : this.context.message?.success;
      fn?.({
        content: `${t('Điền xuống: {{n}} dòng', { n: updates.length - failed })}${failed ? t(' · {{n}} lỗi', { n: failed }) : ''}${skipped ? t(' · {{n}} bỏ qua', { n: skipped }) : ''}`,
        key,
        duration: 3,
      });
    }

    /** Serialize rows → TSV theo cột đang hiển thị (số giữ raw cho Excel; cột ƒ tính giá trị + bỏ HTML). */
    buildTSV(rows: any[], api: any, colsOverride?: string[]): string {
      const coll = this.context.collection;
      const displayed = colsOverride && colsOverride.length ? colsOverride : this._copyCols(api);
      return rows
        .map((r: any) =>
          displayed
            .map((f: string) => {
              const fc = this._formulaOf(f);
              if (fc) {
                const v = evalViewFormula(fc.formula, r, coll);
                if (v === null || v === undefined) return '';
                return stripHtml(String(v)).replace(/\t/g, ' ').replace(/\r?\n/g, ' ');
              }
              const cf = coll?.getField?.(f);
              const v = r?.[f];
              if (v === null || v === undefined) return '';
              if (['integer', 'number', 'percent'].includes(cf?.interface)) return String(v);
              return String(displayValue(cf, v)).replace(/\t/g, ' ').replace(/\r?\n/g, ' ');
            })
            .join('\t'),
        )
        .join('\n');
    }

    async deleteRows(tks: any[]) {
      if (!tks?.length) return;
      try {
        await this.resource.destroy(tks);
        this.resource.refresh?.();
        this.context.message?.success?.(t('Đã xoá {{n}} dòng', { n: tks.length }));
      } catch (err: any) {
        const msg = err?.response?.data?.errors?.[0]?.message || err?.message || t('Xoá thất bại');
        this.context.message?.error?.(msg);
      }
    }

    // Đường commit của editor text/number (Enter/blur → onCellValueChanged của AG Grid):
    // KHÔNG gọi server ngay — stage vào dirty map, flush khi rời dòng / Save all.
    async commitCell(e: any) {
      const fieldName = e?.colDef?.field;
      if (!fieldName) return;
      if (e?.data?.__ptdlNew) {
        this.setDraftValue(fieldName, e.newValue);
        return;
      }
      this.stageCell(e.data, fieldName, e.newValue);
    }

    renderComponent() {
      return <SheetGrid model={this} />;
    }
  }
  Object.defineProperty(PtdlSpreadsheetBlockModel, 'name', { value: 'PtdlSpreadsheetBlockModel' });

  // Nạp lại per-column state đã lưu vào props khi model khởi tạo.
  (PtdlSpreadsheetBlockModel as any).registerFlow({
    key: 'ptdlSheetColumns',
    sort: 2,
    steps: {
      state: {
        defaultParams: { state: {} },
        handler(ctx: any, params: any) {
          ctx.model.setProps({ ptdlColState: params?.state || {} });
        },
      },
    },
  });

  // Nạp row actions đã lưu vào props.
  (PtdlSpreadsheetBlockModel as any).registerFlow({
    key: 'ptdlSheetActions',
    sort: 4,
    steps: {
      state: {
        defaultParams: { list: [] },
        handler(ctx: any, params: any) {
          ctx.model.setProps({ ptdlRowActions: params?.list || [] });
        },
      },
    },
  });

  // Nạp formula columns đã lưu vào props.
  (PtdlSpreadsheetBlockModel as any).registerFlow({
    key: 'ptdlSheetFormulas',
    sort: 3,
    steps: {
      state: {
        defaultParams: { list: [] },
        handler(ctx: any, params: any) {
          ctx.model.setProps({ ptdlFormulas: params?.list || [] });
        },
      },
    },
  });

  // pageSize + appends cho association TRƯỚC refresh (resourceSettings sort -999 → đây → refreshSettings 10000)
  (PtdlSpreadsheetBlockModel as any).registerFlow({
    key: 'ptdlSheetInit',
    sort: 0,
    steps: {
      init: {
        handler(ctx: any) {
          const coll = ctx.collection;
          const res = ctx.model?.resource;
          if (!coll || !res) return;
          try {
            res.setPageSize?.(100);
          } catch {
            /* noop */
          }
          for (const f of coll.getFields?.() || []) {
            const isAssoc = f?.isAssociationField?.() || !!f?.options?.target;
            if (isAssoc && f?.name && !HIDE_IFACES.has(f?.interface)) {
              try {
                res.addAppends?.(f.name);
              } catch {
                /* noop */
              }
            }
          }
        },
      },
    },
  });

  // Popup native cho row expand (chế độ custom): tái dùng action `openView` của core —
  // child page persist dưới block (subModelKey ptdlRowPopup), user cấu hình nội dung trong UI editor.
  (PtdlSpreadsheetBlockModel as any).registerFlow({
    key: 'ptdlRowPopupFlow',
    title: te('Popup dòng'),
    on: 'ptdlOpenRow',
    sort: 600,
    steps: {
      open: {
        use: 'openView',
        defaultParams: (ctx: any) => ({
          mode: 'drawer',
          size: 'large',
          subModelKey: 'ptdlRowPopup',
          dataSourceKey: ctx.collection?.dataSourceKey,
          collectionName: ctx.collection?.name,
          filterByTk: `{{ ctx.record.${tkOf(ctx.collection)} }}`,
        }),
      },
    },
  });

  // Block settings → "Spreadsheet settings": chọn cột hiển thị, chiều cao, bật/tắt thêm-xoá dòng.
  (PtdlSpreadsheetBlockModel as any).registerFlow({
    key: 'ptdlSheetConfig',
    title: te('Bảng tính'),
    sort: 500,
    steps: {
      config: {
        title: te('Cấu hình bảng tính'),
        uiSchema: (ctx: any) => {
          const fields = ctx.collection?.getFields?.() || [];
          const options = fields
            .filter((f: any) => f?.name && f?.interface && !HIDE_IFACES.has(f.interface))
            .map((f: any) => ({
              label: typeof f.title === 'string' && f.title ? `${f.title} (${f.name})` : f.name,
              value: f.name,
              type: f.type,
              iface: f.interface,
            }));
          // House style @tuanla90: 4 section CollapsibleSection + SettingsGrid 2 cột; mô tả dài → tooltip ⓘ
          // trên nhãn (decorator) thay vì description chiếm chỗ. Tên field GIỮ NGUYÊN (void container không
          // đổi data path) → params đã lưu vẫn đọc đúng. Reaction dùng rx() (KHÔNG '{{$deps}}' — kit rule).
          const dec = (tooltip?: any) => ({
            'x-decorator': 'FormItem',
            'x-decorator-props': { style: { marginBottom: 8 }, ...(tooltip ? { tooltip } : {}) },
          });
          const grid = (properties: any) => ({
            type: 'void',
            'x-component': 'SettingsGrid',
            'x-component-props': { minColWidth: 190 },
            properties,
          });
          // Mỗi mục = 1 TAB. FormTab.TabPane là void wrapper → field paths vẫn PHẲNG (params cũ bind nguyên).
          const section = (title: string, properties: any, _first = false) => ({
            type: 'void',
            'x-component': 'FormTab.TabPane',
            'x-component-props': { tab: title },
            properties,
          });
          // Tab "Cột": component THAM CHIẾU (không string) đóng gói model qua CLOSURE. TUYỆT ĐỐI không để
          // model vào x-component-props: Formily compile-schema deep-traverse props → model (object lớn +
          // vòng tham chiếu) bị mangle ⇒ tab TRỐNG + mỗi lần chuyển tab CHẬM 2-3s (traverse lại cả model).
          const ColumnsTabComp = () => React.createElement(PtdlColumnsTab, { model: ctx.model });
          return {
            tabs: {
              type: 'void',
              'x-component': 'FormTab',
              properties: {
            secDisplay: section(t('Hiển thị'), {
              fields: {
                type: 'array',
                title: te('Cột hiển thị'),
                ...dec(te('Để trống = hiện mọi cột được hỗ trợ')),
                'x-component': 'ColumnSelect',
                'x-component-props': { mode: 'multiple', allowClear: true, placeholder: te('Tất cả cột (mặc định)'), options },
              },
              g1: grid({
                height: {
                  type: 'number',
                  title: te('Chiều cao bảng'),
                  ...dec(),
                  // InputNumber render RỖNG trong dialog settings của flow-engine → Input type=number.
                  'x-component': 'Input',
                  'x-component-props': { type: 'number', placeholder: '480', addonAfter: 'px' },
                },
                rowNumbers: { type: 'boolean', title: te('Hiện số thứ tự dòng'), ...dec(), 'x-component': 'Switch' },
              }),
            }, true),
            secCols: section(t('Cột'), {
              colcfg: {
                type: 'void',
                // Panel cấu hình cột (chọn cột → định dạng + cách hiển thị). Ghi thẳng model.setColCfg
                // (áp ngay, như ⚙ header). Model đi qua closure ColumnsTabComp, KHÔNG qua x-component-props.
                'x-component': ColumnsTabComp,
              },
            }),
            secGroup: section(t('Nhóm dòng'), {
              groupBy: {
                type: 'string',
                title: te('Nhóm theo'),
                ...dec(te('Nhóm theo 1–3 field, THỨ TỰ CHỌN = cấp 1 → cấp N — bảng tự tải toàn bộ dòng (tới Group load limit)')),
                'x-component': 'ColumnSelect',
                'x-component-props': {
                  mode: 'multiple',
                  allowClear: true,
                  placeholder: te('Không nhóm'),
                  options: (ctx.collection?.getFields?.() || [])
                    .filter((f: any) =>
                      ['select', 'radioGroup', 'm2o', 'input', 'checkbox', 'boolean', 'email'].includes(f?.interface),
                    )
                    .map((f: any) => ({
                      label: typeof f.title === 'string' && f.title ? f.title : f.name,
                      value: f.name,
                      type: f.type,
                      iface: f.interface,
                    })),
                },
              },
              g2: grid({
                groupDisplay: {
                  type: 'string',
                  title: te('Kiểu hiển thị nhóm'),
                  enum: [
                    { label: te('Dòng nhóm (đóng/mở)'), value: 'rows' },
                    { label: te('Gộp ô (kiểu Excel)'), value: 'merge' },
                  ],
                  ...dec(te('Merged cells: gộp ô cột group giống Excel — không có dòng header nhóm/đóng mở')),
                  'x-component': 'Select',
                },
                groupLimit: {
                  type: 'number',
                  title: te('Giới hạn tải khi nhóm'),
                  ...dec(te('Số dòng tối đa tải khi bật group (tối đa 50.000)')),
                  'x-component': 'Input',
                  'x-component-props': { type: 'number', placeholder: '5000', addonAfter: te('dòng') },
                },
              }),
            }),
            secCrud: section(t('Thêm & xoá dòng'), {
              g3: grid({
                allowAdd: { type: 'boolean', title: te('Cho phép thêm dòng'), ...dec(), 'x-component': 'Switch' },
                allowDelete: { type: 'boolean', title: te('Cho phép xoá dòng'), ...dec(), 'x-component': 'Switch' },
              }),
              g4: grid({
                addNewDisplay: {
                  type: 'string',
                  title: te('Hiện nút "Thêm mới" ở'),
                  enum: [
                    { label: te('Cả hai (nút toolbar + dòng ＋)'), value: 'both' },
                    { label: te('Dòng ＋ ở cuối bảng'), value: 'row' },
                    { label: te('Nút trên toolbar'), value: 'button' },
                  ],
                  ...dec(te('Chọn cách người dùng thêm dòng: nút trên thanh (giống core), dòng ＋ inline (giống Airtable), hoặc cả hai')),
                  'x-component': 'Select',
                  'x-reactions': rx((v: any) => v.allowAdd !== false),
                },
                addRowMode: {
                  type: 'string',
                  title: te('Thêm dòng (nút ＋ của nhóm)'),
                  enum: [
                    { label: te('Tạo + mở form (giống nút ⤢)'), value: 'form' },
                    { label: te('Tạo nhanh, không mở form'), value: 'quick' },
                    { label: te('Mở link tuỳ biến'), value: 'link' },
                  ],
                  ...dec(te('Form dùng đúng Row drawer bên dưới (auto form / custom popup tự thiết kế)')),
                  'x-component': 'Select',
                  'x-reactions': rx((v: any) => v.allowAdd !== false),
                },
              }),
              addRowLink: {
                type: 'string',
                title: te('Link thêm dòng'),
                ...dec(te('Chỉ dùng khi Add row = link — {field} thay bằng giá trị nhóm, mở tab mới')),
                'x-component': 'Input',
                'x-component-props': { placeholder: '/admin/xxx?status={status}' },
                // Trước đây luôn hiện (thừa) — giờ chỉ hiện khi chọn "Mở link tuỳ biến".
                'x-reactions': rx((v: any) => v.allowAdd !== false && v.addRowMode === 'link'),
              },
            }),
            secDrawer: section(t('Mở bản ghi'), {
              drawerMode: {
                type: 'string',
                title: te('Ngăn kéo dòng'),
                enum: [
                  { label: te('Form tự động (không cấu hình)'), value: 'auto' },
                  { label: te('Popup tuỳ biến (thiết kế bằng block)'), value: 'custom' },
                ],
                ...dec(te('Custom: bật UI editor, mở drawer 1 dòng rồi Add block (Details/Form) để tự thiết kế')),
                'x-component': 'Select',
              },
            }),
              },
            },
          };
        },
        defaultParams: {
          height: 480,
          allowAdd: true,
          allowDelete: true,
          drawerMode: 'auto',
          rowNumbers: true,
          groupDisplay: 'rows',
          groupLimit: 5000,
          addRowMode: 'form',
          addNewDisplay: 'both',
        },
        handler(ctx: any, params: any) {
          ctx.model.setProps({
            ptdlFields: params.fields,
            ptdlHeight: params.height,
            ptdlAllowAdd: params.allowAdd !== false,
            ptdlAllowDelete: params.allowDelete !== false,
            ptdlDrawerMode: params.drawerMode || 'auto',
            ptdlRowNumbers: params.rowNumbers !== false,
            // settings cũ lưu string (1 cấp) — chuẩn hoá về mảng, rỗng = null (tắt group)
            ptdlGroupBy: (() => {
              const gb = Array.isArray(params.groupBy)
                ? params.groupBy.filter(Boolean)
                : params.groupBy
                  ? [params.groupBy]
                  : [];
              return gb.length ? gb.slice(0, 3) : null;
            })(),
            ptdlGroupDisplay: params.groupDisplay || 'rows',
            ptdlGroupLimit: Math.min(50000, Number(params.groupLimit) || 5000),
            ptdlAddRowMode: params.addRowMode || 'form',
            ptdlAddRowLink: params.addRowLink || '',
            ptdlAddNewDisplay: params.addNewDisplay || 'both',
          });
        },
      },
    },
  });

  (PtdlSpreadsheetBlockModel as any).define({
    // Block-picker label: runtime-translated PLAIN string (not a `{{t()}}` expression). Resolved at
    // define() time — setRuntimeT runs before registerSpreadsheet in each lane's load(), so `t` is
    // wired. Safe whether or not the picker compiles expressions; only downside is it needs a reload
    // to reflect a live language switch (acceptable for a picker entry).
    label: t('Bảng tính'),
    // Group MUST stay a compiled expression in the CORE namespace (no plugin ns) so this block lands
    // in the same translated "Content" group as core blocks in both languages — mirrors
    // @tuanla90/plugin-enhanced-table-block.
    group: teCore('Content'),
    searchable: true,
    createModelOptions: () => ({ use: 'PtdlSpreadsheetBlockModel' }),
    sort: 310,
  });

  flowEngine.registerModels({ PtdlSheetCellModel, PtdlRecordFormModel, PtdlSpreadsheetBlockModel });
  // eslint-disable-next-line no-console
  console.log('[spreadsheet-view] registered:', !!flowEngine.getModelClass?.('PtdlSpreadsheetBlockModel'));
}
