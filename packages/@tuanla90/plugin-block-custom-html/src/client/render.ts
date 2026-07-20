/**
 * Runs the user's JS against the query rows and returns an HTML string.
 * The block config exposes a single JS field: it receives (data, rows, helpers)
 * and returns an HTML string. (html/css params are still supported internally
 * for backward compatibility, but the UI only exposes JS now.)
 */

import React from 'react';
import ReactDOM from 'react-dom';
import {
  escapeHtml,
  aggSum,
  aggAvg,
  aggCount,
  aggMin,
  aggMax,
  groupBy as sharedGroupBy,
  relativeTime,
} from '@tuanla90/shared';

/**
 * Icon registry is INJECTED by the lane (classic → @nocobase/client, modern → @nocobase/client-v2)
 * so this shared module never imports @nocobase/client directly. A direct import would pull that
 * module into the client-v2 bundle, and the /v/ app doesn't provide @nocobase/client → RequireJS
 * "Script error for @nocobase/client". Each lane's entry calls setIconRegistry(icons) on load.
 */
let iconRegistry: any = null;
export function setIconRegistry(reg: any) {
  iconRegistry = reg;
}

// Small built-in FALLBACK set (inner SVG only) — used only when the shared icon
// registry doesn't have the icon (e.g. @tuanla90/plugin-icon-kit not installed).
// NOTE: we do NOT bundle lucide-react here — icons normally come from the shared
// registry (see ICON-ARCHITECTURE.md, provider/consumer pattern).
const LUCIDE: Record<string, string> = {
  'circle': '<circle cx="12" cy="12" r="10"/>',
  'dollar-sign': '<line x1="12" y1="2" x2="12" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  'coins': '<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/>',
  'banknote': '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/>',
  'wallet': '<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/>',
  'credit-card': '<rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>',
  'receipt': '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17.5v-11"/>',
  'trending-up': '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
  'trending-down': '<polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/>',
  'arrow-up-right': '<line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/>',
  'arrow-down-right': '<line x1="7" y1="7" x2="17" y2="17"/><polyline points="17 7 17 17 7 17"/>',
  'activity': '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
  'users': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  'user': '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  'shopping-cart': '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>',
  'package': '<path d="M16.5 9.4 7.5 4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
  'bar-chart': '<line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/>',
  'pie-chart': '<path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/>',
  'check-circle': '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
  'x-circle': '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>',
  'alert-triangle': '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  'target': '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  'percent': '<line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
  'calendar': '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  'clock': '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  'star': '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  'zap': '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  'database': '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>',
  'briefcase': '<rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
  'building': '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01"/>',
  'home': '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  'bell': '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  'mail': '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  'eye': '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
  'download': '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  'upload': '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
  'refresh-cw': '<path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/>',
  'info': '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
  'lock': '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  'shield': '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  'tag': '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>',
  'layers': '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
  'gift': '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"/>',
  'truck': '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
  'award': '<circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/>',
  'flame': '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  'heart': '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  'file-text': '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v5h5"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
  'map-pin': '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
};

// Data cache: the block's real render fills this by uid, so the config editor's
// live preview can show REAL data even though the settings form's model resource
// may not be populated. Falls back to the most recent rows, then a sample.
const DATA_CACHE: Record<string, any[]> = {};
let LAST_ROWS: any[] = [];
export function cacheData(uid: string | undefined, rows: any[]): void {
  const arr = Array.isArray(rows) ? rows : [];
  if (uid) DATA_CACHE[uid] = arr;
  if (arr.length) LAST_ROWS = arr;
}
export function getCachedData(uid?: string): any[] {
  return (uid && DATA_CACHE[uid]) || LAST_ROWS || [];
}

// Render a registered icon (from the shared registry — Lucide via icon-kit, or
// antd) to an SVG string, once, cached. No icon library is bundled by this plugin.
// Cache ONLY successful renders. A negative result is never cached: the icon registry is populated
// by @tuanla90/plugin-custom-icons on its own load, so an early lookup (config-dialog live preview,
// plugin load order) could otherwise poison the cache with `null` forever → every icon then falls
// back to the tiny built-in set and renders the wrong glyph (`circle`). Retrying is cheap because
// `reg.has(key)` short-circuits a genuinely-absent icon before any React render.
const _iconSvgCache: Record<string, string> = {};
function registryIconSvg(key: string): string | null {
  if (Object.prototype.hasOwnProperty.call(_iconSvgCache, key)) return _iconSvgCache[key];
  const reg: any = iconRegistry;
  // Registry not wired yet, or it does not (yet) have this key → return null WITHOUT caching, so a
  // later call (once custom-icons has registered) can still resolve it.
  if (!reg || !reg.get || (reg.has && !reg.has(key))) return null;
  let out: string | null = null;
  try {
    const Comp = reg.get(key);
    if (Comp && ReactDOM && (ReactDOM as any).render && typeof document !== 'undefined') {
      const div = document.createElement('div');
      (ReactDOM as any).render(React.createElement(Comp, {}), div);
      const svg = div.querySelector('svg');
      out = svg ? svg.outerHTML : null;
      (ReactDOM as any).unmountComponentAtNode(div);
    }
  } catch (e) {
    out = null;
  }
  if (out) _iconSvgCache[key] = out; // only memoize a real hit
  return out;
}

/** Reference shown in the editor's helper list. */
export const HELPERS_REF: Array<{ sig: string; desc: string }> = [
  { sig: "helpers.table(data)", desc: 'hiện toàn bộ dữ liệu dạng bảng' },
  { sig: "helpers.json(data)", desc: 'xem cấu trúc thô (debug)' },
  { sig: "helpers.keys(data)", desc: 'mảng tên cột' },
  { sig: "helpers.first(data,'col')", desc: 'giá trị 1 cột ở dòng đầu' },
  { sig: "helpers.sum(data,'col')", desc: 'tổng 1 cột' },
  { sig: "helpers.avg(data,'col')", desc: 'trung bình 1 cột' },
  { sig: "helpers.count(data)", desc: 'số dòng' },
  { sig: "helpers.min/max(data,'col')", desc: 'nhỏ nhất / lớn nhất' },
  { sig: "helpers.groupBy(data,'col')", desc: 'gom nhóm theo cột → { key: rows[] }' },
  { sig: "helpers.fmt(n)", desc: "định dạng SỐ nghìn (vi-VN). Tuỳ chọn: fmt(n,{maximumFractionDigits:2}) · tiền tệ fmt(n,{style:'currency',currency:'VND'})" },
  { sig: "helpers.date(v,'DD/MM/YYYY HH:mm')", desc: 'định dạng ngày giờ (tokens YYYY MM DD HH mm ss)' },
  { sig: "helpers.timeAgo(v)", desc: 'thời gian tương đối — 2 giờ trước' },
  { sig: "helpers.esc(chuỗi)", desc: 'escape HTML khi in giá trị người dùng (chống chèn thẻ)' },
  { sig: "helpers.icon('shopping-cart',{size:22,color:'#2490ef'})", desc: 'icon Lucide bất kỳ (kebab-case) qua registry của icon-kit' },
];

/** Sample rows used for the live preview when the query has not run yet. */
export const SAMPLE_DATA: any[] = [
  { status: 'success', value: 12263344 },
  { status: 'fail', value: 50000 },
];

export const DEFAULT_HTML = '';
export const DEFAULT_CSS = '';

// Default: a "hero score" card with an icon in the top-right corner.
export const DEFAULT_JS = `// data = mảng dòng kết quả query. Đổi 'value' thành tên cột của bạn.
// (gõ  return helpers.table(data);  để xem tên cột)
const total = helpers.sum(data, 'value');
const delta = 0; // % thay đổi so với kỳ trước (tự tính nếu có cột)

return \`
<div style="position:relative;font-family:Inter,system-ui,sans-serif;padding:22px 24px;border:1px solid #eef0f2;border-radius:16px;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.05);max-width:340px">
  <div style="position:absolute;top:18px;right:18px;width:44px;height:44px;border-radius:13px;background:#eaf4fe;color:#2490ef;display:flex;align-items:center;justify-content:center">
    \${helpers.icon('trending-up', { size: 24 })}
  </div>
  <div style="color:#737b83;font-size:13px;font-weight:600;letter-spacing:.2px">DOANH SỐ</div>
  <div style="color:#18181b;font-size:36px;font-weight:800;line-height:1.05;margin-top:6px">
    \${helpers.fmt(total)} <span style="font-size:15px;color:#737b83;font-weight:600">VND</span>
  </div>
  <div style="margin-top:10px;font-size:13px;font-weight:600;color:\${delta >= 0 ? '#16a34a' : '#dc2626'};display:inline-flex;align-items:center;gap:4px">
    \${helpers.icon(delta >= 0 ? 'arrow-up-right' : 'arrow-down-right', { size: 15 })} \${Math.abs(delta)}% vs kỳ trước
  </div>
</div>\`;`;

function errorBox(msg: string): string {
  return (
    '<pre style="margin:0;padding:10px 12px;background:#fff1f0;border:1px solid #ffccc7;' +
    'border-radius:6px;color:#cf1322;white-space:pre-wrap;font:12px/1.5 ui-monospace,monospace">' +
    escapeHtml(msg) +
    '</pre>'
  );
}

export function buildHelpers() {
  // Numeric reducers come from @tuanla90/shared/aggregate (same null-safe semantics as the old local
  // copies; min/max there reduce instead of Math.min(...xs) so they're safe on huge arrays).
  const helpers: any = {
    sum: aggSum,
    avg: aggAvg,
    count: aggCount,
    min: aggMin,
    max: aggMax,
    groupBy: sharedGroupBy,
    fmt: (n: any, opts?: any) => {
      const locale = (opts && opts.locale) || 'vi-VN';
      const o = Object.assign({ maximumFractionDigits: 0 }, opts || {});
      delete o.locale;
      const x = Number(n);
      return isFinite(x) ? x.toLocaleString(locale, o) : String(n == null ? '' : n);
    },
    /** date(v, 'DD/MM/YYYY HH:mm') — tokens: YYYY YY MM M DD D HH H mm ss (giờ địa phương). */
    date: (v: any, fmt?: string) => {
      if (v == null || v === '') return '';
      const d = v instanceof Date ? v : new Date(v);
      if (isNaN(d.getTime())) return String(v);
      const f = fmt || 'DD/MM/YYYY';
      const p2 = (n: number) => (n < 10 ? '0' + n : '' + n);
      const map: Record<string, any> = {
        YYYY: d.getFullYear(),
        YY: ('' + d.getFullYear()).slice(-2),
        MM: p2(d.getMonth() + 1),
        M: d.getMonth() + 1,
        DD: p2(d.getDate()),
        D: d.getDate(),
        HH: p2(d.getHours()),
        H: d.getHours(),
        mm: p2(d.getMinutes()),
        ss: p2(d.getSeconds()),
      };
      return f.replace(/YYYY|YY|MM|M|DD|D|HH|H|mm|ss/g, (t: string) => '' + map[t]);
    },
    /** timeAgo(v) — "2 giờ trước" / "sau 3 ngày". Shared core, default opts = this exact vi vocabulary. */
    timeAgo: (v: any) => relativeTime(v),
    esc: escapeHtml,
    keys: (arr: any[]) => (arr && arr[0] ? Object.keys(arr[0]) : []),
    first: (arr: any[], key: string, fallback?: any) => {
      const r = arr && arr[0];
      const v = r ? r[key] : undefined;
      return v == null ? (fallback == null ? '' : fallback) : v;
    },
    json: (x: any) =>
      '<pre style="font:12px ui-monospace,monospace;background:#f7f8fa;padding:10px;border-radius:6px;overflow:auto;margin:0">' +
      escapeHtml(JSON.stringify(x, null, 2)) +
      '</pre>',
    /** icon(name, { size, color }) — inline SVG. Uses the shared icon registry
     *  first (ANY Lucide icon when @tuanla90/plugin-icon-kit is installed, e.g.
     *  'shopping-cart'; plus antd icons by their name), and only falls back to a
     *  small built-in set if the registry doesn't have it. No lucide re-bundle. */
    icon: (name: string, opts?: any) => {
      const o = opts || {};
      const size = o.size || 20;
      const color = o.color || 'currentColor';
      const raw = String(name || '').trim();
      const reg: any = iconRegistry;
      const key = raw.indexOf('lucide-') === 0 || (reg && reg.has && reg.has(raw)) ? raw : 'lucide-' + raw;
      const svg = registryIconSvg(key) || registryIconSvg(raw);
      if (svg) {
        // Registry icons render at 1em + currentColor → size/color via the wrapper.
        return (
          '<span style="display:inline-flex;line-height:0;vertical-align:middle;font-size:' +
          size +
          'px;color:' +
          color +
          '">' +
          svg +
          '</span>'
        );
      }
      const sw = o.strokeWidth || 2;
      const inner = LUCIDE[raw.replace(/^lucide-/, '')] || LUCIDE['circle'];
      return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="' +
        size +
        '" height="' +
        size +
        '" viewBox="0 0 24 24" fill="none" stroke="' +
        color +
        '" stroke-width="' +
        sw +
        '" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle">' +
        inner +
        '</svg>'
      );
    },
    table: (arr: any[], cols?: string[]) => {
      const rows2 = arr || [];
      if (!rows2.length) {
        return '<div style="color:#999;font:13px Inter,system-ui,sans-serif;padding:8px">(không có dữ liệu)</div>';
      }
      const ks = cols && cols.length ? cols : Object.keys(rows2[0]);
      const th = ks
        .map(
          (k) =>
            '<th style="text-align:left;padding:6px 10px;border-bottom:2px solid #e3e6ea;white-space:nowrap">' +
            escapeHtml(k) +
            '</th>',
        )
        .join('');
      const body = rows2
        .map(
          (r) =>
            '<tr>' +
            ks
              .map(
                (k) =>
                  '<td style="padding:6px 10px;border-bottom:1px solid #eef0f2;white-space:nowrap">' +
                  escapeHtml(r ? r[k] : '') +
                  '</td>',
              )
              .join('') +
            '</tr>',
        )
        .join('');
      return (
        '<table style="border-collapse:collapse;font:13px Inter,system-ui,sans-serif;color:#1f272e">' +
        '<thead><tr>' +
        th +
        '</tr></thead><tbody>' +
        body +
        '</tbody></table>'
      );
    },
  };
  return helpers;
}

function interpolate(tpl: string, scope: any): string {
  return tpl.replace(/\{\{([\s\S]+?)\}\}/g, (_m: string, expr: string) => {
    try {
      const keys = Object.keys(scope);
      const vals = keys.map((k) => scope[k]);
      // eslint-disable-next-line no-new-func
      const fn = new Function(...keys, 'return (' + expr + ');');
      const v = fn.apply(null, vals);
      return v == null ? '' : String(v);
    } catch (e) {
      return '';
    }
  });
}

function scopeCss(css: string, scopeSel: string): string {
  return css.replace(/([^{}]+)\{/g, (m: string, sel: string) => {
    const s = String(sel).trim();
    if (!s || s.charAt(0) === '@' || /%\s*$/.test(s) || /^\d/.test(s)) return m;
    const scoped = s
      .split(',')
      .map((one) => {
        const t = one.trim();
        if (!t) return t;
        return t.indexOf(scopeSel) === 0 ? t : scopeSel + ' ' + t;
      })
      .join(', ');
    return scoped + ' {';
  });
}

export function renderCustomHtml(opts: { html?: string; css?: string; js: string; rows: any[]; uid: string }): string {
  const rows = Array.isArray(opts.rows) ? opts.rows : [];
  const helpers = buildHelpers();
  let scope: any = { data: rows, rows, count: rows.length, helpers };
  let body = '';

  if (opts.js && String(opts.js).trim()) {
    try {
      // eslint-disable-next-line no-new-func
      const fn = new Function('data', 'rows', 'helpers', 'scope', String(opts.js));
      const result = fn(rows, rows, helpers, scope);
      if (typeof result === 'string') {
        body = result;
      } else if (result && typeof result === 'object') {
        scope = Object.assign({}, scope, result);
      }
    } catch (e: any) {
      return errorBox('JS error: ' + (e && e.message ? e.message : String(e)));
    }
  }

  if (!body) {
    try {
      body = interpolate(String(opts.html || ''), scope);
    } catch (e: any) {
      return errorBox('Template error: ' + (e && e.message ? e.message : String(e)));
    }
  }

  const css = opts.css && String(opts.css).trim() ? String(opts.css) : '';
  const styleTag = css ? '<style>' + scopeCss(css, '.chtml-' + opts.uid) + '</style>' : '';
  return styleTag + body;
}
