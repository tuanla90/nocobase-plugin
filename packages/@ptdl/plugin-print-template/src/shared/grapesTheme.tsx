// GrapesJS restyle: light antd-like theme + lucide icons.
//
// GrapesJS panel buttons are `<i class="fa fa-...">` and it does NOT ship
// FontAwesome — without it every toolbar button renders as an empty square
// (that's the "thô" look). Each fa-* class used by core + preset-webpage gets a
// ::before with a lucide SVG as a CSS mask (mask + background: currentColor →
// icons follow the theme text/active colors automatically).

const mask = (body: string) =>
  `url("data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'>${body}</svg>`,
  )}")`;

// lucide icon bodies (kebab name → svg inner markup)
const LUCIDE: Record<string, string> = {
  'layout-grid':
    "<rect width='7' height='7' x='3' y='3' rx='1'/><rect width='7' height='7' x='14' y='3' rx='1'/><rect width='7' height='7' x='14' y='14' rx='1'/><rect width='7' height='7' x='3' y='14' rx='1'/>",
  brush:
    "<path d='m9.06 11.9 8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08'/><path d='M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z'/>",
  settings:
    "<path d='M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z'/><circle cx='12' cy='12' r='3'/>",
  layers:
    "<path d='m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z'/><path d='m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65'/><path d='m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65'/>",
  monitor:
    "<rect width='20' height='14' x='2' y='3' rx='2'/><line x1='8' x2='16' y1='21' y2='21'/><line x1='12' x2='12' y1='17' y2='21'/>",
  tablet:
    "<rect width='16' height='20' x='4' y='2' rx='2' ry='2'/><line x1='12' x2='12.01' y1='18' y2='18'/>",
  smartphone: "<rect width='14' height='20' x='5' y='2' rx='2' ry='2'/><path d='M12 18h.01'/>",
  'square-dashed':
    "<path d='M5 3a2 2 0 0 0-2 2'/><path d='M19 3a2 2 0 0 1 2 2'/><path d='M21 19a2 2 0 0 1-2 2'/><path d='M5 21a2 2 0 0 1-2-2'/><path d='M9 3h1'/><path d='M9 21h1'/><path d='M14 3h1'/><path d='M14 21h1'/><path d='M3 9v1'/><path d='M21 9v1'/><path d='M3 14v1'/><path d='M21 14v1'/>",
  maximize:
    "<path d='M8 3H5a2 2 0 0 0-2 2v3'/><path d='M21 8V5a2 2 0 0 0-2-2h-3'/><path d='M3 16v3a2 2 0 0 0 2 2h3'/><path d='M16 21h3a2 2 0 0 0 2-2v-3'/>",
  code: "<polyline points='16 18 22 12 16 6'/><polyline points='8 6 2 12 8 18'/>",
  'undo-2': "<path d='M9 14 4 9l5-5'/><path d='M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11'/>",
  'redo-2': "<path d='m15 14 5-5-5-5'/><path d='M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13'/>",
  download:
    "<path d='M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4'/><polyline points='7 10 12 15 17 10'/><line x1='12' x2='12' y1='15' y2='3'/>",
  upload:
    "<path d='M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4'/><polyline points='17 8 12 3 7 8'/><line x1='12' x2='12' y1='3' y2='15'/>",
  'trash-2':
    "<path d='M3 6h18'/><path d='M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6'/><path d='M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2'/><line x1='10' x2='10' y1='11' y2='17'/><line x1='14' x2='14' y1='11' y2='17'/>",
  move: "<polyline points='5 9 2 12 5 15'/><polyline points='9 5 12 2 15 5'/><polyline points='15 19 12 22 9 19'/><polyline points='19 9 22 12 19 15'/><line x1='2' x2='22' y1='12' y2='12'/><line x1='12' x2='12' y1='2' y2='22'/>",
  copy: "<rect width='14' height='14' x='8' y='8' rx='2' ry='2'/><path d='M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2'/>",
  'arrow-up': "<path d='m5 12 7-7 7 7'/><path d='M12 19V5'/>",
  eye: "<path d='M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0'/><circle cx='12' cy='12' r='3'/>",
  plus: "<path d='M5 12h14'/><path d='M12 5v14'/>",
  pencil:
    "<path d='M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z'/>",
  link: "<path d='M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71'/><path d='M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'/>",
  braces:
    "<path d='M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1'/><path d='M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1'/>",
  table:
    "<path d='M12 3v18'/><rect width='18' height='18' x='3' y='3' rx='2'/><path d='M3 9h18'/><path d='M3 15h18'/>",
  sigma:
    "<path d='M18 7V5a1 1 0 0 0-1-1H6.5a.5.5 0 0 0-.4.8l4.5 6a2 2 0 0 1 0 2.4l-4.5 6a.5.5 0 0 0 .4.8H17a1 1 0 0 0 1-1v-2'/>",
  'pen-line':
    "<path d='M12 20h9'/><path d='M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z'/>",
  calendar:
    "<path d='M8 2v4'/><path d='M16 2v4'/><rect width='18' height='18' x='3' y='4' rx='2'/><path d='M3 10h18'/>",
  text: "<path d='M17 6.1H3'/><path d='M21 12.1H3'/><path d='M15.1 18H3'/>",
  type: "<polyline points='4 7 4 4 20 4 20 7'/><line x1='9' x2='15' y1='20' y2='20'/><line x1='12' x2='12' y1='4' y2='20'/>",
  image:
    "<rect width='18' height='18' x='3' y='3' rx='2' ry='2'/><circle cx='9' cy='9' r='2'/><path d='m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21'/>",
  video:
    "<path d='m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5'/><rect x='2' y='6' width='14' height='12' rx='2'/>",
  map: "<path d='M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z'/><path d='M15 5.764v15'/><path d='M9 3.236v15'/>",
  square: "<rect width='18' height='18' x='3' y='3' rx='2'/>",
  'columns-2': "<rect width='18' height='18' x='3' y='3' rx='2'/><path d='M12 3v18'/>",
  'columns-3': "<rect width='18' height='18' x='3' y='3' rx='2'/><path d='M9 3v18'/><path d='M15 3v18'/>",
  'panel-left': "<rect width='18' height='18' x='3' y='3' rx='2'/><path d='M9 3v18'/>",
  quote:
    "<path d='M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z'/><path d='M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z'/>",
  'chevron-down': "<path d='m6 9 6 6 6-6'/>",
  'chevron-right': "<path d='m9 18 6-6-6-6'/>",
  qr: "<rect width='5' height='5' x='3' y='3' rx='1'/><rect width='5' height='5' x='16' y='3' rx='1'/><rect width='5' height='5' x='3' y='16' rx='1'/><path d='M21 16h-3a2 2 0 0 0-2 2v3'/><path d='M21 21v.01'/><path d='M12 7v3a2 2 0 0 1-2 2H7'/><path d='M3 12h.01'/><path d='M12 3h.01'/><path d='M12 16v.01'/><path d='M16 12h1'/><path d='M21 12v.01'/><path d='M12 21v-1'/>",
  scissors:
    "<circle cx='6' cy='6' r='3'/><path d='M8.12 8.12 12 12'/><path d='M20 4 8.12 15.88'/><circle cx='6' cy='18' r='3'/><path d='M14.8 14.8 20 20'/>",
};

/** Full inline SVG for a lucide icon (block thumbnails, etc). The pt-lucide class
 *  matters: grapes paints .gjs-block svg with fill, which turns stroke icons into
 *  solid black squares — the theme forces fill:none back for this class. */
export function lucideSvg(name: string, size = 24): string {
  const body = LUCIDE[name] || LUCIDE.plus;
  // inline style: presentation ATTRIBUTES lose to any stylesheet `fill:` rule (grapes
  // paints block/panel svgs), which turned stroke icons into solid blobs — style wins.
  return `<svg class='pt-lucide' xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 24 24' style='fill:none;stroke:currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'>${body}</svg>`;
}

// fa class (grapes core + preset-webpage) → lucide key
const FA_TO_LUCIDE: Record<string, string> = {
  'fa-th-large': 'layout-grid',
  'fa-paint-brush': 'brush',
  'fa-cog': 'settings',
  'fa-bars': 'layers',
  'fa-desktop': 'monitor',
  'fa-tablet': 'tablet',
  'fa-mobile': 'smartphone',
  'fa-square-o': 'square-dashed',
  'fa-arrows-alt': 'maximize',
  'fa-code': 'code',
  'fa-undo': 'undo-2',
  'fa-repeat': 'redo-2',
  'fa-download': 'download',
  'fa-upload': 'upload',
  'fa-trash': 'trash-2',
  'fa-trash-o': 'trash-2',
  'fa-arrows': 'move',
  'fa-clone': 'copy',
  'fa-arrow-up': 'arrow-up',
  'fa-eye': 'eye',
  'fa-caret-down': 'chevron-down',
  'fa-caret-right': 'chevron-right',
  'fa-plus': 'plus',
  'fa-plus-square-o': 'plus',
  'fa-pencil': 'pencil',
  'fa-link': 'link',
};

function iconRules(): string {
  return Object.entries(FA_TO_LUCIDE)
    .map(([fa, lu]) => {
      const m = mask(LUCIDE[lu]);
      return `.gjs-editor .${fa}::before, .gjs-editor-cont .${fa}::before, .gjs-toolbar .${fa}::before {
  content: ''; display: inline-block; width: 15px; height: 15px; vertical-align: -2px;
  background-color: currentColor; -webkit-mask: ${m} center / contain no-repeat; mask: ${m} center / contain no-repeat;
}`;
    })
    .join('\n');
}

const THEME_CSS = `
/* ---- light antd-like GrapesJS theme (plugin-print-template) ---- */
/* size guards: the editor lives inside Drawer/Tabs/Spin wrappers — make sure the
   %-height chain and the absolutely-positioned canvas/views never collapse */
.gjs-editor-cont { height: 100%; }
.gjs-editor { height: 100%; --gjs-left-width: 232px; color-scheme: light; }
.gjs-editor, .gjs-editor * { letter-spacing: normal !important; }
.gjs-cv-canvas, .gjs-pn-views-container { visibility: visible !important; opacity: 1 !important; }

/* panel buttons carry real lucide SVGs (set via Panels API) */
.gjs-pn-btn svg.pt-lucide { width: 16px; height: 16px; display: block; }
.gjs-pn-btn { display: inline-flex; align-items: center; justify-content: center; }
/* print templates don't need hover/active pseudo-state styling */
.gjs-clm-states, .gjs-clm-header-status { display: none !important; }
/* our antd ColorField (trait + style-manager) already has its own border — strip the
   grapes .gjs-field wrapper's border/bg/padding so there's no double frame */
.gjs-field:has(.pt-cf), .gjs-sm-field:has(.pt-cf) { border: none !important; background: transparent !important; padding: 0 !important; box-shadow: none !important; }
.pt-cf, .pt-cf > div { width: 100% !important; }
.pt-cf .ant-color-picker-trigger { width: 100% !important; justify-content: flex-start; }
/* make sure the color property spans the full row */
.gjs-sm-property.gjs-sm-property__full, .gjs-sm-property[class*="--full"] { width: 100% !important; }
/* component toolbar: ONLY our text row/column buttons size to content (default icon
   items keep their fixed sizing, otherwise they collapse/disappear) */
.gjs-toolbar { white-space: nowrap; }
.gjs-toolbar .gjs-toolbar-item:has(.pt-tbtn) { width: auto !important; min-width: 0 !important; }

/* Top bar: keep undo/redo/fullscreen (options) + the 3 view icons at NATURAL icon size,
   evenly spaced. Do NOT force width:100% on views — that hid the options panel. */
.gjs-pn-views .gjs-pn-btn, .gjs-pn-options .gjs-pn-btn { width: auto !important; min-width: 0 !important; margin: 0 5px; padding: 7px; }

/* Style Manager: cleaner left-aligned sector header (was awkward centered 2-line) */
.gjs-sm-sector-title { display: flex !important; align-items: center; gap: 8px; padding: 8px 12px !important; text-align: left !important; font-size: 12.5px; font-weight: 600; }
.gjs-sm-sector-title .gjs-sm-sector-label { flex: 1; }
/* labels lighter, tighter */
.gjs-sm-label { font-size: 11px; color: #8c8c8c; margin-bottom: 3px; }
.gjs-sm-property { margin-bottom: 8px; }
/* padding/margin composite: lighter frame + tighter cells */
.gjs-sm-composite { background: #fafafa !important; border: 1px solid #f0f0f0 !important; border-radius: 6px; padding: 6px !important; }
.gjs-sm-composite .gjs-sm-property { margin-bottom: 4px; }
.gjs-sm-field input, .gjs-sm-field select, .gjs-field-integer, .gjs-field-select { border-radius: 6px; }
.gjs-one-bg { background-color: #ffffff !important; }
.gjs-two-color { color: rgba(0,0,0,.72) !important; }
.gjs-three-bg { background-color: #1677ff !important; color: #fff !important; }
.gjs-four-color, .gjs-four-color-h:hover { color: #1677ff !important; }

.gjs-pn-panel { border-color: #f0f0f0 !important; }
.gjs-pn-views, .gjs-pn-views-container { border-color: #f0f0f0 !important; box-shadow: none !important; }
.gjs-pn-btn { border-radius: 6px; margin: 1px; }
.gjs-pn-btn:hover { background: #f5f5f5; }
.gjs-pn-btn.gjs-pn-active { background: #e6f4ff !important; color: #1677ff !important; box-shadow: none !important; }

.gjs-cv-canvas { background: #eef0f3; }
.gjs-frame-wrapper { box-shadow: 0 1px 6px rgba(0,0,0,.15); }

.gjs-block {
  border-radius: 8px; border: 1px solid #ececec; background: #fff; color: #555;
  box-shadow: none; transition: all .15s; font-size: 11.5px; padding: 8px 4px; min-height: 64px;
}
.gjs-block:hover { border-color: #1677ff; color: #1677ff; box-shadow: 0 2px 8px rgba(22,119,255,.12); }
svg.pt-lucide, svg.pt-lucide * { fill: none !important; stroke: currentColor; }
.gjs-block svg.pt-lucide { width: 24px; height: 24px; }
.gjs-caret-icon::before { width: 11px; height: 11px; vertical-align: -1px; }
.gjs-block__media { margin-bottom: 6px; display: flex; justify-content: center; }
.gjs-block-category { border-color: #f0f0f0; }
.gjs-title, .gjs-sm-sector-title { background: #fafafa !important; color: #555 !important; border-color: #f0f0f0 !important; font-weight: 600; }

.gjs-field { background: #fff; border: 1px solid #d9d9d9; border-radius: 6px; color: #444; }
.gjs-field input, .gjs-field select { color: #444; }
.gjs-category-open, .gjs-block-category.gjs-open { border-color: #f0f0f0; }
.gjs-layer { border-color: #f5f5f5; }
.gjs-layer.gjs-selected { background: #e6f4ff; }
.gjs-toolbar { background: #1677ff; border-radius: 6px; }
.gjs-badge { background: #1677ff; border-radius: 4px; }
.gjs-com-badge, .gjs-badge__name { font-size: 11px; }
.gjs-rte-toolbar { border-radius: 6px; border-color: #f0f0f0; }
.gjs-rte-action { border-color: #f0f0f0; }
${iconRules()}
`;

/** The app theme's font stack — used for the grapes UI and the canvas content. */
export function appFontFamily(): string {
  try {
    return getComputedStyle(document.body).fontFamily || 'Arial, sans-serif';
  } catch (e) {
    return 'Arial, sans-serif';
  }
}

export function injectGrapesTheme() {
  if (document.getElementById('pt-grapes-theme')) return;
  const s = document.createElement('style');
  s.id = 'pt-grapes-theme';
  // grapes UI font rides on its own CSS var — point it at the app theme font (and
  // force font-family directly too: the var alone lost to :root in some setups)
  const font = appFontFamily();
  s.textContent = `${THEME_CSS}
.gjs-editor { --gjs-main-font: ${font}; --gjs-font-size: 12.5px; }
.gjs-editor, .gjs-editor input, .gjs-editor select, .gjs-editor button, .gjs-editor textarea { font-family: ${font} !important; }`;
  document.head.appendChild(s);
}
