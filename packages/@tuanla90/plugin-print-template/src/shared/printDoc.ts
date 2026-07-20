// Builds the complete standalone HTML document that goes into the print window.
//
// Two flavours:
// 1. Default (no page numbers): header/footer repeat per page via <table><thead>/<tfoot>.
//    `@page { margin: 0 }` at print time so the BROWSER's own date/URL header-footer has
//    no margin band to draw in (the user saw those and thought we added them); per-page
//    vertical margins are simulated by padding on the repeated thead/tfoot cells,
//    horizontal ones by padding on the sheet.
// 2. Paged.js (pageSetup.pageNumbers): real pagination — header/footer become CSS
//    running elements in the page margins and "Trang X / Y" renders bottom-right.
//    paged.polyfill.min.js ships in this plugin package (repacked by the recipe, like
//    alasql) and prints with margin 0 by itself, so browser chrome stays hidden too.
// Import from the `/format` subpath (pure utils, NO @formily) — the bare '@tuanla90/shared'
// index pulls ColorField → @formily, which then has to be bundled here for no reason.
import { escapeHtml } from '@tuanla90/shared/format';
import { DEFAULT_PAGE_SETUP, DEFAULT_WATERMARK, PageSetup, PrintTemplate, WatermarkConfig } from './types';
// The floating "In / PDF" button injected into the generated print window is plugin chrome
// (hidden from the actual print via @media print), so it is localized. It is built in the main
// app context — where the runtime translator is set — before being written into the new window.
import { t } from './i18n';

const PAGEDJS_URL = '/static/plugins/@tuanla90/plugin-print-template/dist/paged.polyfill.min.js';

/** Paper sizes in mm [width, height] (portrait). */
const PAGE_MM: Record<string, [number, number]> = {
  A4: [210, 297],
  A5: [148, 210],
  A3: [297, 420],
  letter: [216, 279],
};

function pageHeightMm(page: PageSetup): number {
  const [w, h] = PAGE_MM[page.size || 'A4'] || PAGE_MM.A4;
  return page.orientation === 'landscape' ? w : h;
}

/** 9-grid position → flex alignment. */
function wmAlign(pos?: string): { ai: string; jc: string } {
  const p = pos || 'center';
  const ai = p.startsWith('top') ? 'flex-start' : p.startsWith('bottom') ? 'flex-end' : 'center';
  const jc = p.endsWith('left') ? 'flex-start' : p.endsWith('right') ? 'flex-end' : 'center';
  return { ai, jc };
}

// Byte-equivalent to the former local `esc`; kept as an alias to avoid churn at call sites.
const esc = escapeHtml;

/** '12mm' | '12mm 10mm' → { v, h } */
function splitMargin(margin?: string): { v: string; h: string } {
  const parts = String(margin || DEFAULT_PAGE_SETUP.margin).trim().split(/\s+/);
  if (parts.length >= 2) return { v: parts[0], h: parts[1] };
  return { v: parts[0], h: parts[0] };
}

function baseTag(): string {
  return typeof window !== 'undefined' && (window as any).location?.origin
    ? `<base href="${(window as any).location.origin}/">`
    : '';
}

function bgPosOf(pos?: string): string {
  const { ai, jc } = wmAlign(pos);
  const x = jc === 'flex-start' ? 'left' : jc === 'flex-end' ? 'right' : 'center';
  const y = ai === 'flex-start' ? 'top' : ai === 'flex-end' ? 'bottom' : 'center';
  return `${x} ${y}`;
}

/** A repeating-tile background (SVG data-uri for text, the image itself for images). */
function tileBackground(wm: WatermarkConfig): string {
  const gap = wm.tileGap ?? 40;
  if (wm.imageUrl) {
    const w = (wm.imageWidth ?? 20) * 2; // px-ish tile from % (rough)
    return `background:url("${esc(wm.imageUrl)}"); background-repeat:repeat; background-size:${w + gap}px auto;`;
  }
  const fs = wm.fontSize ?? DEFAULT_WATERMARK.fontSize;
  const text = wm.text || '';
  const tw = Math.max(fs * 3, text.length * fs * 0.62) + gap;
  const th = fs * 2 + gap;
  const angle = wm.angle ?? DEFAULT_WATERMARK.angle;
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='${Math.round(tw)}' height='${Math.round(th)}'>` +
    `<text x='50%' y='50%' font-family='sans-serif' font-weight='700' font-size='${fs}' fill='${wm.color || DEFAULT_WATERMARK.color}' ` +
    `text-anchor='middle' dominant-baseline='middle' transform='rotate(${angle} ${Math.round(tw / 2)} ${Math.round(th / 2)})'>${esc(text)}</text></svg>`;
  return `background:url("data:image/svg+xml,${encodeURIComponent(svg)}"); background-repeat:repeat;`;
}

function watermarkLayer(wm?: WatermarkConfig): string {
  if (!wm?.enabled) return '';
  const opacity = wm.opacity ?? DEFAULT_WATERMARK.opacity;
  const z = wm.behind ? 0 : 9999;
  if (wm.tile) {
    return `<div class="__pt-watermark" style="opacity:${opacity};z-index:${z};${tileBackground(wm)}"></div>`;
  }
  // Absolutely position the mark by the 9-grid anchor (predictable — flexbox + a
  // percent-width image was ambiguous and drifted toward the centre). The inner box is
  // pinned to an edge/centre of the padded layer, then nudged + rotated about its centre.
  const angle = wm.angle ?? DEFAULT_WATERMARK.angle;
  const pos = wm.position || 'center';
  const isImg = !!wm.imageUrl;
  let hx = 'left:50%;';
  let tx = 'translateX(-50%)';
  if (pos.endsWith('left')) { hx = 'left:0;'; tx = ''; }
  else if (pos.endsWith('right')) { hx = 'right:0;'; tx = ''; }
  let vy = 'top:50%;';
  let ty = 'translateY(-50%)';
  if (pos.startsWith('top')) { vy = 'top:0;'; ty = ''; }
  else if (pos.startsWith('bottom')) { vy = 'bottom:0;'; ty = ''; }
  const nudge = `translate(${wm.offsetX ?? 0}px, ${wm.offsetY ?? 0}px)`;
  const transform = [nudge, tx, ty, `rotate(${angle}deg)`].filter(Boolean).join(' ');
  // Image width is a % of the PAGE — give the wrapper that definite width so the img
  // (width:100%) resolves against a real box, not a shrink-to-fit flex item.
  const wrapWidth = isImg ? `width:${wm.imageWidth ?? 60}%;` : '';
  const inner = isImg
    ? `<img src="${esc(wm.imageUrl)}" style="width:100%;display:block;" />`
    : `<span style="font-size:${wm.fontSize ?? DEFAULT_WATERMARK.fontSize}px;font-weight:700;color:${esc(
        wm.color || DEFAULT_WATERMARK.color,
      )};white-space:nowrap;">${esc(wm.text || '')}</span>`;
  return `<div class="__pt-watermark" style="opacity:${opacity};z-index:${z};"><div style="position:absolute;${hx}${vy}${wrapWidth}transform:${transform};transform-origin:center;">${inner}</div></div>`;
}

/** Watermark repeated on every Paged.js page via ::after on the page box. */
function pagedWatermarkCss(wm?: WatermarkConfig): string {
  if (!wm?.enabled) return '';
  const opacity = wm.opacity ?? DEFAULT_WATERMARK.opacity;
  const z = wm.behind ? 0 : 99;
  if (wm.tile) {
    return `.pagedjs_pagebox{position:relative;} .pagedjs_pagebox::after{content:'';position:absolute;inset:0;pointer-events:none;z-index:${z};opacity:${opacity};${tileBackground(wm)}}`;
  }
  const angle = wm.angle ?? DEFAULT_WATERMARK.angle;
  const { ai, jc } = wmAlign(wm.position);
  const nudge = `translate(${wm.offsetX ?? 0}px, ${wm.offsetY ?? 0}px) `;
  const common = `position:absolute;inset:0;padding:12mm;display:flex;align-items:${ai};justify-content:${jc};pointer-events:none;z-index:${z};opacity:${opacity};transform:${nudge}rotate(${angle}deg);`;
  if (wm.imageUrl) {
    return `.pagedjs_pagebox::after{content:'';${common}background:url("${esc(wm.imageUrl)}") ${bgPosOf(wm.position)}/${wm.imageWidth ?? 60}% no-repeat;}`;
  }
  const text = String(wm.text || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `.pagedjs_pagebox::after{content:"${text}";${common}font-size:${wm.fontSize ?? DEFAULT_WATERMARK.fontSize}px;font-weight:700;color:${esc(wm.color || DEFAULT_WATERMARK.color)};white-space:nowrap;}`;
}

const PRINT_BTN_CSS = `
  #__pt-print-btn {
    position: fixed; top: 15px; right: 20px; z-index: 10000;
    background: #fff; border: 1px solid #c7c7c7; border-radius: 4px;
    padding: 6px 16px; font-size: 14px; font-weight: 500; cursor: pointer;
  }
  #__pt-print-btn:hover { color: #707070; }
  #__pt-print-btn:active { transform: scale(.96); }
  @media print { #__pt-print-btn { display: none; } }
`;

const BASE_FONT_CSS = `
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 13px; color: #222; }
  tr, img { page-break-inside: avoid; }
`;

export interface BuiltParts {
  headerHtml?: string;
  bodyHtml: string;
  footerHtml?: string;
  /** already-rendered document title (suggested PDF filename) */
  title?: string;
}

export interface BuildOpts {
  /** embedded (iframe) preview — omit the floating In/PDF button (the panel toolbar
   *  already has one) and drop the grey page background so it reads as one card. */
  embedded?: boolean;
}

export function buildPrintDocument(template: PrintTemplate, parts: BuiltParts, opts: BuildOpts = {}): string {
  const page: PageSetup = { ...DEFAULT_PAGE_SETUP, ...(template.pageSetup || {}) };
  // The Paged.js page-number flavour rendered too differently from the responsive
  // table flavour (header in margin box, different watermark/padding) — removed per
  // user request. Always the table flavour now; buildPagedDocument kept but unused.
  void buildPagedDocument;
  return buildTableDocument(template, parts, page, opts);
}

// ---- Flavour 1: table thead/tfoot, no page numbers ----
function buildTableDocument(template: PrintTemplate, parts: BuiltParts, page: PageSetup, opts: BuildOpts): string {
  const pageSize = `${page.size} ${page.orientation === 'landscape' ? 'landscape' : 'portrait'}`;
  const m = splitMargin(page.margin);
  // tfoot only sits at the bottom of the TABLE — for short documents that's right under
  // the content (user bug report). Give the table the full paper height (acts as a
  // minimum, multi-page content still flows) and let the tbody row absorb the slack.
  const ph = pageHeightMm(page) - 1; // -1mm: rounding safety so 1 page never spills to 2
  // "behind content": the fixed watermark sits at z-index 0, so the paper sheet must be
  // transparent (paper white comes from the page bg) and the content stacked above it.
  const behind = template.watermark?.enabled && template.watermark?.behind;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
${baseTag()}
<title>${esc(parts.title || template.title || 'Print')}</title>
<style>
${BASE_FONT_CSS}
  html, body { background: ${behind ? '#fff' : opts.embedded ? '#fff' : '#f0f1f3'}; }

  /* Screen preview: paper-like sheet */
  .__pt-sheet {
    background: ${behind ? 'transparent' : '#fff'};
    position: relative; z-index: 1;
    max-width: 900px;
    margin: ${opts.embedded ? '0 auto' : '16px auto'};
    padding: 0 ${m.h};
    ${opts.embedded || behind ? '' : 'box-shadow: 0 1px 6px rgba(0,0,0,.18);'}
  }

  table.__pt-layout { width: 100%; border-collapse: collapse; height: ${ph}mm; }
  table.__pt-layout > thead > tr,
  table.__pt-layout > tfoot > tr { height: 1px; }
  table.__pt-layout > thead > tr > td,
  table.__pt-layout > tbody > tr > td,
  table.__pt-layout > tfoot > tr > td { padding: 0; border: none; vertical-align: top; }
  /* The repeated thead/tfoot double as per-page vertical margins (print uses @page margin 0
     so the browser cannot draw its own date/URL header & footer). */
  td.__pt-header-cell { padding-top: ${m.v}; padding-bottom: 8px; }
  td.__pt-footer-cell { padding-bottom: ${m.v}; padding-top: 8px; }

  /* Preview (embedded): anchor the watermark to the SHEET so it centers on the page
     and scrolls with content. Print: position:fixed so browsers repeat it per page. */
  .__pt-watermark {
    position: ${opts.embedded ? 'absolute' : 'fixed'}; inset: 0; z-index: 9999; padding: 12mm;
    display: flex; align-items: center; justify-content: center;
    pointer-events: none;
  }
  @media print { .__pt-watermark { position: fixed; } }
${PRINT_BTN_CSS}
  @page { size: ${pageSize}; margin: 0; }
  @media print {
    html, body { background: #fff; }
    .__pt-sheet { max-width: none; margin: 0; box-shadow: none; }
  }
${template.css || ''}
</style>
</head>
<body>
${opts.embedded ? '' : `<button id="__pt-print-btn" onclick="window.print()">${t('🖨 In / PDF')}</button>`}
<div class="__pt-sheet">
  ${watermarkLayer(template.watermark)}
  <table class="__pt-layout">
    <thead><tr><td class="__pt-header-cell">${parts.headerHtml || ''}</td></tr></thead>
    <tbody><tr><td>${parts.bodyHtml}</td></tr></tbody>
    <tfoot><tr><td class="__pt-footer-cell">${parts.footerHtml || ''}</td></tr></tfoot>
  </table>
</div>
</body>
</html>`;
}

// ---- Flavour 2: Paged.js — real pages, margin-box header/footer, "Trang X / Y" ----
function buildPagedDocument(template: PrintTemplate, parts: BuiltParts, page: PageSetup, opts: BuildOpts): string {
  const pageSize = `${page.size} ${page.orientation === 'landscape' ? 'landscape' : 'portrait'}`;
  const header = parts.headerHtml || '';
  const footer = parts.footerHtml || '';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
${baseTag()}
<title>${esc(parts.title || template.title || 'Print')}</title>
<style>
${BASE_FONT_CSS}
  html, body { background: ${opts.embedded ? '#fff' : '#f0f1f3'}; }
  .pagedjs_pages { margin: 0 auto; }
  .pagedjs_page { background: #fff; ${opts.embedded ? '' : 'box-shadow: 0 1px 6px rgba(0,0,0,.18);'} margin: ${opts.embedded ? '0 auto 10px' : '12px auto'}; }
  @media print { html, body { background: #fff; } .pagedjs_page { box-shadow: none; margin: 0; } }

  @page {
    size: ${pageSize};
    margin: ${page.margin};
    @bottom-right { content: "Trang " counter(page) " / " counter(pages); font-size: 10px; color: #666; }
    ${header ? '@top-center { content: element(ptHeader); width: 100%; }' : ''}
    ${footer ? '@bottom-center { content: element(ptFooter); width: 100%; }' : ''}
  }
  .__pt-run-header { position: running(ptHeader); }
  .__pt-run-footer { position: running(ptFooter); }
${pagedWatermarkCss(template.watermark)}
${PRINT_BTN_CSS}
${template.css || ''}
</style>
</head>
<body>
${header ? `<div class="__pt-run-header">${header}</div>` : ''}
${footer ? `<div class="__pt-run-footer">${footer}</div>` : ''}
${parts.bodyHtml}
<script>
  window.PagedConfig = {
    auto: true,
    after: function () {
      if (${opts.embedded ? 'true' : 'false'}) {
        // Paged.js lays pages out at real A4 width (~793px) which overflows the narrow
        // preview iframe → shrink to fit (zoom reflows so there's no leftover space).
        var fit = function () {
          var pages = document.querySelector('.pagedjs_pages');
          var page = document.querySelector('.pagedjs_page');
          if (!pages || !page) return;
          var ratio = (window.innerWidth - 16) / page.offsetWidth;
          pages.style.zoom = ratio < 1 ? ratio : 1;
        };
        fit();
        window.addEventListener('resize', fit);
        return;
      }
      var b = document.createElement('button');
      b.id = '__pt-print-btn';
      b.textContent = '🖨 In / PDF';
      b.onclick = function () { window.print(); };
      document.body.appendChild(b);
    },
  };
</script>
<script src="${PAGEDJS_URL}"></script>
</body>
</html>`;
}

export interface MultiItem {
  template: PrintTemplate;
  parts: BuiltParts;
}

/** Batch print: many records in ONE document, one record per page-block. Each record
 *  keeps its own table-layout (footer anchored to its page bottom) and page-breaks
 *  after; a single fixed watermark (from the first record) repeats on every page. */
export function buildMultiDocument(items: MultiItem[], opts: BuildOpts = {}): string {
  if (!items.length) return '<!DOCTYPE html><html><body></body></html>';
  const first = items[0].template;
  const page: PageSetup = { ...DEFAULT_PAGE_SETUP, ...(first.pageSetup || {}) };
  const pageSize = `${page.size} ${page.orientation === 'landscape' ? 'landscape' : 'portrait'}`;
  const m = splitMargin(page.margin);
  const ph = pageHeightMm(page) - 1;
  const css = [...new Set(items.map((it) => it.template.css || '').filter(Boolean))].join('\n');

  const recBlocks = items
    .map((it, i) => {
      const last = i === items.length - 1;
      return `<div class="__pt-rec" style="${last ? '' : 'page-break-after:always;'}">
  <table class="__pt-layout">
    <thead><tr><td class="__pt-header-cell">${it.parts.headerHtml || ''}</td></tr></thead>
    <tbody><tr><td>${it.parts.bodyHtml}</td></tr></tbody>
    <tfoot><tr><td class="__pt-footer-cell">${it.parts.footerHtml || ''}</td></tr></tfoot>
  </table>
</div>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
${baseTag()}
<title>${esc(items[0].parts.title || 'Print')} (+${items.length - 1})</title>
<style>
${BASE_FONT_CSS}
  html, body { background: ${opts.embedded ? '#fff' : '#f0f1f3'}; }
  .__pt-rec { background: #fff; max-width: 900px; margin: ${opts.embedded ? '0 auto' : '16px auto'}; padding: 0 ${m.h}; ${opts.embedded ? '' : 'box-shadow: 0 1px 6px rgba(0,0,0,.18);'} }
  table.__pt-layout { width: 100%; border-collapse: collapse; height: ${ph}mm; }
  table.__pt-layout > thead > tr, table.__pt-layout > tfoot > tr { height: 1px; }
  table.__pt-layout > thead > tr > td, table.__pt-layout > tbody > tr > td, table.__pt-layout > tfoot > tr > td { padding: 0; border: none; vertical-align: top; }
  td.__pt-header-cell { padding-top: ${m.v}; padding-bottom: 8px; }
  td.__pt-footer-cell { padding-bottom: ${m.v}; padding-top: 8px; }
  .__pt-watermark { position: fixed; inset: 0; z-index: 9999; padding: 12mm; display: flex; align-items: center; justify-content: center; pointer-events: none; }
${PRINT_BTN_CSS}
  @page { size: ${pageSize}; margin: 0; }
  @media print { html, body { background: #fff; } .__pt-rec { max-width: none; margin: 0; box-shadow: none; } }
${css}
</style>
</head>
<body>
${opts.embedded ? '' : `<button id="__pt-print-btn" onclick="window.print()">${t('🖨 In tất cả / PDF')}</button>`}
${watermarkLayer(first.watermark)}
${recBlocks}
</body>
</html>`;
}

/** Open the built document in a new tab; user prints (or saves as PDF) from there. */
export function openPrintDocument(html: string) {
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
}
