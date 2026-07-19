// Drag-drop visual editor for the template body (GrapesJS, lazy-loaded like alasql).
// GrapesJS output = HTML + CSS classes; both are stored back into bodyHtml as
// `<style>…</style>` + markup so the Handlebars renderer needs no changes.
//
// Handlebars caveat: a literal {{#each}} between <tr> rows would be MANGLED by any
// DOM parser (foster parenting) — so the repeat row uses `data-pt-each="relation"`,
// which the renderer expands into {{#each}} just before compiling (printService).
import React, { useEffect, useRef, useState } from 'react';
import * as ReactDOM from 'react-dom';
import { Alert, Spin, theme } from 'antd';
import { ColorField, FieldPickerCascader } from '@ptdl/shared';
import { appFontFamily, injectGrapesTheme, lucideSvg } from './grapesTheme';
import { loadCssOnce, loadScriptClean } from './scriptLoader';
// Aliased to `tt`: this file uses `t` as a local (`const t = findTableComp(...)`). `tt` is the
// runtime translator; only the GrapesJS editor CHROME (block/trait/sector labels, toolbar,
// hints) is translated — inserted block `content` (the document body) is left as-is.
import { t as tt } from './i18n';

// px — fixed height keeps the %-height chain out of the picture; sized to the viewport
// so the drawer pane doesn't need its own scrollbar (nested scrollbars made grapes'
// hover highlight drift away from the hovered element).
const editorHeight = () => Math.max(480, (typeof window !== 'undefined' ? window.innerHeight : 900) - 245);

const BASE = '/static/plugins/@ptdl/plugin-print-template/dist/grapes';

async function ensureGrapes(token?: any): Promise<{ grapesjs: any; plugins: any[] }> {
  const w = window as any;
  // CSS must be in place BEFORE init — initialising against the unstyled DOM leaves
  // the canvas blank until something (e.g. the fullscreen toggle) forces a reflow.
  await loadCssOnce(`${BASE}/grapes.min.css`);
  injectGrapesTheme(token);
  if (!w.grapesjs) {
    await loadScriptClean(`${BASE}/grapes.min.js`);
    await loadScriptClean(`${BASE}/preset-webpage.js`).catch(() => {});
    await loadScriptClean(`${BASE}/blocks-basic.js`).catch(() => {});
  }
  return {
    grapesjs: w.grapesjs,
    plugins: [w['grapesjs-preset-webpage'], w['gjs-blocks-basic']].filter(Boolean),
  };
}

/** bodyHtml <-> (css, html): grapes stores its stylesheet as a leading <style> block. */
export function splitStyleFromBody(body: string): { css: string; html: string } {
  const m = String(body || '').match(/^\s*<style[^>]*>([\s\S]*?)<\/style>\s*/i);
  return m ? { css: m[1], html: String(body).slice(m[0].length) } : { css: '', html: String(body || '') };
}

export function composeBody(html: string, css: string): string {
  const h = String(html || '').replace(/^\s*<body[^>]*>/i, '').replace(/<\/body>\s*$/i, '');
  return css && css.trim() ? `<style>\n${css.trim()}\n</style>\n${h}` : h;
}

// Grapes exports single-line HTML/CSS — reformat so the "Mã HTML" tab stays readable.
// Only applied on the grapes → bodyHtml path (never while the user types by hand).
const VOID_TAGS = /^(area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)$/i;
export function prettyHtml(html: string): string {
  const tokens = String(html || '').replace(/\r?\n\s*/g, ' ').replace(/>\s+</g, '><').match(/<[^>]+>|[^<]+/g) || [];
  const out: string[] = [];
  let ind = 0;
  for (const raw of tokens) {
    const t = raw.trim();
    if (!t) continue;
    if (/^<\//.test(t)) {
      ind = Math.max(0, ind - 1);
      out.push('  '.repeat(ind) + t);
    } else if (/^</.test(t)) {
      out.push('  '.repeat(ind) + t);
      const tag = (t.match(/^<([a-zA-Z0-9-]+)/) || [])[1] || '';
      if (!/\/>$/.test(t) && !VOID_TAGS.test(tag) && !/^<!/.test(t)) ind++;
    } else {
      out.push('  '.repeat(ind) + t);
    }
  }
  return out.join('\n');
}

export function prettyCss(css: string): string {
  return String(css || '')
    .replace(/\s*\{\s*/g, ' {\n  ')
    .replace(/;\s*(?!\})/g, ';\n  ')
    .replace(/;?\s*\}\s*/g, ';\n}\n')
    .replace(/\n\s*\n/g, '\n')
    .trim();
}

const CELL = 'border:1px solid #ddd;padding:4px 8px;';

function addPrintBlocks(editor: any) {
  const bm = editor.BlockManager;
  const cat = tt('Template in');
  bm.add('pt-field', {
    label: tt('Trường dữ liệu'),
    category: cat,
    media: lucideSvg('braces'),
    content: '<span>{{ten_truong}}</span>',
  });
  bm.add('pt-table', {
    label: tt('Bảng'),
    category: cat,
    media: lucideSvg('table'),
    content: `<table data-pt-border="#d9d9d9" data-pt-borderw="1" data-pt-pad="6">
      <thead><tr><th>Cột 1</th><th>Cột 2</th><th>Cột 3</th></tr></thead>
      <tbody>
        <tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>
        <tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>
      </tbody>
    </table>`,
  });
  bm.add('pt-each-table', {
    label: tt('Bảng dòng con'),
    category: cat,
    media: lucideSvg('table'),
    content: `<table data-pt-border="#d9d9d9" data-pt-borderw="1" data-pt-pad="6">
      <thead><tr>
        <th style="width:40px">STT</th><th>Tên</th>
        <th style="width:70px">SL</th><th style="width:120px;text-align:right">Thành tiền</th>
      </tr></thead>
      <tbody><tr data-pt-each="items">
        <td>{{add @index 1}}</td>
        <td>{{this.name}}</td>
        <td>{{this.qty}}</td>
        <td style="text-align:right">{{formatNumber this.amount format="#,##0₫"}}</td>
      </tr></tbody>
    </table>
    <p style="font-size:11px;color:#888">Bấm vào Ô BẤT KỲ của dòng dữ liệu → tab ⚙ bên phải → điền "Lặp theo quan hệ" = tên quan hệ đã thêm ở tab Chung (VD: items).</p>`,
  });
  bm.add('pt-metric', {
    label: tt('Số liệu tổng'),
    category: cat,
    media: lucideSvg('sigma'),
    content: '<p style="text-align:right">Tổng cộng: <b>{{formatNumber (arraySum (pluck items "amount")) format="#,##0₫"}}</b></p>',
  });
  bm.add('pt-sign', {
    label: tt('Khu chữ ký'),
    category: cat,
    media: lucideSvg('pen-line'),
    content: `<table style="width:100%;margin-top:24px"><tr>
      <td style="text-align:center;width:50%"><b>Người lập</b><br/><i style="font-size:11px">(Ký, họ tên)</i><div style="height:70px"></div></td>
      <td style="text-align:center"><b>Người duyệt</b><br/><i style="font-size:11px">(Ký, họ tên)</i><div style="height:70px"></div></td>
    </tr></table>`,
  });
  bm.add('pt-now', {
    label: tt('Ngày in'),
    category: cat,
    media: lucideSvg('calendar'),
    content: '<p style="text-align:right;font-style:italic">Ngày {{now "DD"}} tháng {{now "MM"}} năm {{now "YYYY"}}</p>',
  });
  bm.add('pt-money-words', {
    label: tt('Số tiền bằng chữ'),
    category: cat,
    media: lucideSvg('sigma'),
    content: '<p><b>Bằng chữ:</b> <i>{{docsoHoa total}} đồng</i></p>',
  });
  bm.add('pt-qr', {
    label: tt('Mã QR'),
    category: cat,
    media: lucideSvg('qr'),
    content: '<div>{{qr code size=110}}</div>',
  });
  bm.add('pt-pagebreak', {
    label: tt('Ngắt trang'),
    category: cat,
    media: lucideSvg('scissors'),
    content:
      '<div class="pt-pagebreak" style="break-before:page;page-break-before:always;height:0;border-top:1px dashed #bbb;margin:6px 0"></div>',
  });
}

// A print template has a fixed paper size and no import/preview workflow — hide the
// preset's device switcher and the risky/no-op buttons (code view included: the
// "Mã HTML" segment next door does that job) to keep the toolbar lean.
function trimPanels(editor: any) {
  const pn = editor.Panels;
  try {
    pn.removePanel?.('devices-c');
  } catch (e) {
    /* preset variations */
  }
  ['gjs-open-import-webpage', 'canvas-clear', 'preview', 'export-template'].forEach((id) => {
    try {
      pn.removeButton?.('options', id);
    } catch (e) {
      /* not present */
    }
  });
  // Layers tree confuses end users; selecting a parent is already covered by the
  // ↑ button on the component toolbar.
  try {
    pn.removeButton?.('views', 'open-layers');
  } catch (e) {
    /* not present */
  }
  // paper has no videos/maps/nav links — drop the print-useless basic blocks
  ['video', 'map', 'link-block'].forEach((id) => {
    try {
      editor.BlockManager.remove?.(id);
    } catch (e) {
      /* absent */
    }
  });
}

// blocks-basic/preset ship chunky filled icons — swap them for lucide strokes so the
// whole block panel matches the app icon set.
const BASIC_BLOCK_ICONS: Record<string, string> = {
  text: 'text',
  'text-basic': 'text',
  quote: 'quote',
  link: 'link',
  'link-block': 'link',
  image: 'image',
  video: 'video',
  map: 'map',
  column1: 'square',
  column2: 'columns-2',
  column3: 'columns-3',
  'column3-7': 'panel-left',
};
function restyleBasicBlocks(editor: any) {
  Object.entries(BASIC_BLOCK_ICONS).forEach(([id, icon]) => {
    try {
      editor.BlockManager.get(id)?.set?.('media', lucideSvg(icon));
    } catch (e) {
      /* block absent */
    }
  });
}

// Top-bar buttons: swap the fa-class ::before masks (mushy at 15px) for REAL inline
// lucide SVGs via the Panels API — crisp strokes that follow the active color.
const PANEL_BUTTON_ICONS: [string, string, string][] = [
  ['options', 'sw-visibility', 'square-dashed'],
  ['options', 'fullscreen', 'maximize'],
  ['options', 'undo', 'undo-2'],
  ['options', 'redo', 'redo-2'],
  ['views', 'open-sm', 'brush'],
  ['views', 'open-tm', 'settings'],
  ['views', 'open-layers', 'layers'],
  ['views', 'open-blocks', 'layout-grid'],
];
function restylePanelButtons(editor: any) {
  const pn = editor.Panels;
  PANEL_BUTTON_ICONS.forEach(([panel, id, icon]) => {
    try {
      const btn = pn.getButton?.(panel, id);
      if (btn) btn.set({ label: lucideSvg(icon, 16), className: '' });
    } catch (e) {
      /* absent in this preset */
    }
  });
}

// "Lặp theo quan hệ" (data-pt-each) editable from the Settings panel. Clicking a
// table selects the innermost CELL, not the <tr> — asking users to hunt for the row
// in the Layers tree is hopeless. So the trait is attached to BOTH cell and row
// types, and reads/writes the attribute on the closest enclosing <tr>.
function findUp(comp: any, tags: string[], depth = 8): any {
  let c = comp;
  for (let i = 0; c && i < depth; i++) {
    if (tags.includes(c.get?.('tagName'))) return c;
    c = c.parent?.();
  }
  return null;
}
const findRowComp = (comp: any) => findUp(comp, ['tr'], 6);
const findTableComp = (comp: any) => findUp(comp, ['table'], 8);

// ---- Table quick-style: "dòng đầu màu X, cột đầu màu Y, viền cả bảng" without
// styling cell-by-cell. Values live as data-pt-* attributes on the <table>; the
// generated CSS targets a per-table class so it exports with the template. ----
function tableClassOf(table: any): string {
  const classes: string[] = (table.getClasses?.() || []).map(String);
  let cls = classes.find((c) => c.startsWith('pt-tbl-'));
  if (!cls) {
    cls = 'pt-tbl-' + Math.random().toString(36).slice(2, 7);
    table.addClass?.(cls);
  }
  return cls;
}

function applyTableStyle(editor: any, table: any) {
  try {
    const a = table.getAttributes?.() || {};
    const cls = tableClassOf(table);
    const css = editor.Css;
    const setOrRemove = (sel: string, style: Record<string, string> | null) => {
      const rule = css.getRule?.(sel);
      if (rule) css.remove?.(rule);
      if (style) css.setRule?.(sel, style);
    };
    css.setRule?.(`.${cls}`, { 'border-collapse': 'collapse', width: '100%' });
    const bw = String(a['data-pt-borderw'] || '1');
    const pad = String(a['data-pt-pad'] || '');
    setOrRemove(
      `.${cls} th, .${cls} td`,
      a['data-pt-border'] || pad
        ? {
            ...(a['data-pt-border'] ? { border: `${bw}px solid ${a['data-pt-border']}` } : {}),
            ...(pad ? { padding: `${pad}px` } : {}),
          }
        : null,
    );
    setOrRemove(
      `.${cls} tr > td:first-child, .${cls} tr > th:first-child`,
      a['data-pt-colbg'] ? { 'background-color': a['data-pt-colbg'] } : null,
    );
    // header rule AFTER first-col rule so the corner cell takes the header colour
    setOrRemove(
      `.${cls} thead th, .${cls} thead td`,
      a['data-pt-headbg'] ? { 'background-color': a['data-pt-headbg'] } : null,
    );
  } catch (e) {
    /* cosmetic */
  }
}

// Table structure tools: HTML has no "column" element to select, so duplicating a
// column is impossible with the stock toolbar. When a cell is selected we add
// +Dòng/−Dòng/+Cột/−Cột buttons — column ops loop over every <tr> at that index.
function registerTableTools(editor: any) {
  const cellIdx = (cell: any) => {
    const row = cell?.parent?.();
    return row ? row.components().indexOf(cell) : -1;
  };
  const addColumn = (cell: any) => {
    const table = findTableComp(cell);
    const idx = cellIdx(cell);
    if (!table || idx < 0) return;
    table.find('tr').forEach((tr: any) => {
      const cells = tr.components();
      const ref = cells.at(Math.min(idx, cells.length - 1));
      const tag = ref?.get?.('tagName') === 'th' ? 'th' : 'td';
      tr.append(`<${tag}>&nbsp;</${tag}>`, { at: Math.min(idx + 1, cells.length) });
    });
  };
  const delColumn = (cell: any) => {
    const table = findTableComp(cell);
    const idx = cellIdx(cell);
    if (!table || idx < 0) return;
    table.find('tr').forEach((tr: any) => {
      const cells = tr.components();
      if (cells.length > 1) cells.at(idx)?.remove();
    });
  };
  const addRow = (cell: any) => {
    const row = findRowComp(cell);
    const parent = row?.parent?.();
    if (!row || !parent) return;
    const i = parent.components().indexOf(row);
    const clone = row.clone();
    clone.removeAttributes?.(['data-pt-each']); // duplicated loop rows would double the data
    parent.append(clone, { at: i + 1 });
  };
  const delRow = (cell: any) => {
    const row = findRowComp(cell);
    const parent = row?.parent?.();
    if (row && parent && parent.components().length > 1) row.remove();
  };

  editor.on('component:selected', (comp: any) => {
    const tag = comp?.get?.('tagName');
    if (tag !== 'td' && tag !== 'th') return;
    const tb = [...(comp.get('toolbar') || [])];
    if (tb.some((t: any) => t.id === 'pt-col-add')) return;
    const mk = (id: string, text: string, title: string, cmd: () => void) => ({
      id,
      label: `<span class="pt-tbtn" title="${title}" style="display:inline-block;padding:0 7px;font-size:11px;font-weight:600;border-left:1px solid rgba(255,255,255,.35);white-space:nowrap">${text}</span>`,
      command: cmd,
    });
    tb.push(mk('pt-row-add', tt('+Dòng'), tt('Thêm dòng bên dưới'), () => addRow(comp)));
    tb.push(mk('pt-row-del', tt('−Dòng'), tt('Xoá dòng này'), () => delRow(comp)));
    tb.push(mk('pt-col-add', tt('+Cột'), tt('Thêm cột bên phải (mọi hàng)'), () => addColumn(comp)));
    tb.push(mk('pt-col-del', tt('−Cột'), tt('Xoá cột này (mọi hàng)'), () => delColumn(comp)));
    comp.set('toolbar', tb);
  });
}

function addEachTrait(editor: any) {
  try {
    editor.TraitManager.addType('pt-each', {
      eventCapture: ['input', 'change'],
      createInput() {
        const el = document.createElement('input');
        el.placeholder = tt('VD: items — trống = không lặp');
        el.style.width = '100%';
        return el;
      },
      onEvent({ component, elInput }: any) {
        const row = findRowComp(component);
        if (!row) return;
        const v = String((elInput as HTMLInputElement).value || '').trim();
        if (v) row.addAttributes({ 'data-pt-each': v });
        else row.removeAttributes?.(['data-pt-each']);
      },
      onUpdate({ component, elInput }: any) {
        const row = findRowComp(component);
        (elInput as HTMLInputElement).value = row?.getAttributes?.()['data-pt-each'] || '';
      },
    });

    // Table quick-style traits: written on the closest <table> no matter what part
    // of the table is selected (clicking always lands on a cell).
    const tableAttrTrait = (kind: 'color' | 'number') => ({
      eventCapture: ['input', 'change'],
      createInput({ trait }: any) {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'display:flex;gap:4px;align-items:center;';
        const el = document.createElement('input');
        el.type = kind === 'color' ? 'color' : 'number';
        el.style.cssText = kind === 'color' ? 'width:44px;height:26px;padding:1px;' : 'width:100%;';
        el.className = 'pt-trait-main';
        wrap.appendChild(el);
        if (kind === 'color') {
          const clear = document.createElement('button');
          clear.textContent = '✕';
          clear.title = tt('Bỏ màu');
          clear.style.cssText = 'border:1px solid #ddd;background:#fff;border-radius:4px;cursor:pointer;';
          clear.onclick = (ev) => {
            ev.preventDefault();
            const table = findTableComp((editor.getSelected && editor.getSelected()) || null);
            if (table) {
              table.removeAttributes?.([trait.get?.('name') || trait.attributes?.name]);
              applyTableStyle(editor, table);
            }
          };
          wrap.appendChild(clear);
        }
        return wrap;
      },
      onEvent({ component, trait, elInput }: any) {
        const table = findTableComp(component);
        if (!table) return;
        const name = trait.get?.('name') || trait.attributes?.name;
        const input = (elInput as HTMLElement).querySelector?.('.pt-trait-main') as HTMLInputElement;
        const v = String(input?.value || '').trim();
        if (v) table.addAttributes({ [name]: v });
        else table.removeAttributes?.([name]);
        applyTableStyle(editor, table);
      },
      onUpdate({ component, trait, elInput }: any) {
        const table = findTableComp(component);
        const name = trait.get?.('name') || trait.attributes?.name;
        const input = (elInput as HTMLElement).querySelector?.('.pt-trait-main') as HTMLInputElement;
        if (input) input.value = table?.getAttributes?.()[name] || (kind === 'color' ? '#ffffff' : '');
      },
    });
    // Color trait: render the standard antd ColorField (COLOR_PRESETS palette) into the
    // grapes trait DOM via ReactDOM — matches the workspace color-picker standard instead
    // of a raw <input type=color>. Writes the value onto the closest <table> attribute.
    const colorTrait = () => ({
      createInput({ trait }: any) {
        const wrap = document.createElement('div');
        wrap.className = 'pt-cf';
        const name = trait.get?.('name') || trait.attributes?.name;
        const render = () => {
          const table = findTableComp((editor.getSelected && editor.getSelected()) || null);
          const cur = table?.getAttributes?.()[name] || '';
          ReactDOM.render(
            React.createElement(ColorField as any, {
              value: cur,
              size: 'small',
              onChange: (v: string) => {
                const t = findTableComp((editor.getSelected && editor.getSelected()) || null);
                if (!t) return;
                if (v) t.addAttributes({ [name]: v });
                else t.removeAttributes?.([name]);
                applyTableStyle(editor, t);
              },
            }),
            wrap,
          );
        };
        render();
        (wrap as any).__ptRender = render;
        return wrap;
      },
      onUpdate({ elInput }: any) {
        (elInput as any)?.__ptRender?.();
      },
    });
    editor.TraitManager.addType('pt-tcolor', colorTrait());
    editor.TraitManager.addType('pt-tnum', tableAttrTrait('number'));

    const TABLE_TRAITS = [
      { type: 'pt-tcolor', name: 'data-pt-headbg', label: tt('Bảng: màu dòng đầu') },
      { type: 'pt-tcolor', name: 'data-pt-colbg', label: tt('Bảng: màu cột đầu') },
      { type: 'pt-tcolor', name: 'data-pt-border', label: tt('Bảng: màu viền') },
      { type: 'pt-tnum', name: 'data-pt-borderw', label: tt('Bảng: dày viền (px)') },
      { type: 'pt-tnum', name: 'data-pt-pad', label: tt('Bảng: padding ô (px)') },
    ];
    const TRAITS = [
      'id',
      'title',
      { type: 'pt-each', name: 'data-pt-each', label: tt('Lặp theo quan hệ') },
      ...TABLE_TRAITS,
    ];
    // addType with an EXISTING name extends it in place (no `extend:` self-reference)
    editor.DomComponents.addType('table', { model: { defaults: { traits: ['id', 'title', ...TABLE_TRAITS] } } });
    editor.DomComponents.addType('row', { model: { defaults: { traits: TRAITS } } });
    // Cells re-based on 'text': grapes' stock cell type has NO inline editing, so the
    // user couldn't change any table content — extending text gives dblclick-to-edit.
    editor.DomComponents.addType('cell', {
      extend: 'text',
      isComponent: (el: any) => !!el?.tagName && ['TD', 'TH'].includes(el.tagName),
      model: {
        defaults: {
          tagName: 'td',
          draggable: ['tr'],
          editable: true,
          traits: TRAITS,
        },
      },
    });
    // new tables dropped with default data-pt-* attrs get their css generated
    editor.on('component:add', (c: any) => {
      if (c?.get?.('tagName') === 'table' && c.getAttributes?.()['data-pt-border']) {
        setTimeout(() => applyTableStyle(editor, c), 50);
      }
    });
  } catch (e) {
    /* trait registry drift — convenience only */
  }
}

// Paper needs a fraction of the default Style Manager (no position/float/flex/
// transitions...) — replace all sectors with 3 print-focused groups, and put the
// app theme font first in the font list.
function tuneStyleManager(editor: any) {
  try {
    const sm = editor.StyleManager;
    // Custom Style Manager type: the standard antd ColorField (COLOR_PRESETS) instead
    // of grapes' native color input, so text/background colors match the app palette.
    // A Style Manager color type per CSS property, applying the value DIRECTLY to the
    // selected component's style (grapes' emit/updateStyle path didn't apply reliably).
    // grapes doesn't render a label for custom style types, so we render label + the
    // full-width ColorField ourselves inside the property cell.
    const makeColorType = (cssProp: string, labelText: string) => ({
      create() {
        const div = document.createElement('div');
        div.className = 'pt-cf';
        div.style.width = '100%';
        return div;
      },
      update({ value, el }: any) {
        ReactDOM.render(
          React.createElement(
            'div',
            { style: { width: '100%' } },
            React.createElement('div', { style: { fontSize: 11, color: '#8c8c8c', marginBottom: 3 } }, labelText),
            React.createElement(ColorField as any, {
              value: value || '',
              size: 'small',
              style: { width: '100%' },
              onChange: (v: string) => {
                const sel = editor.getSelected?.() || editor.getSelectedAll?.()?.[0];
                if (!sel) return;
                if (v) sel.addStyle?.({ [cssProp]: v });
                else sel.removeStyle?.(cssProp);
              },
            }),
          ),
          el,
        );
      },
      destroy() {},
    });
    let scolorOk = false;
    try {
      sm.addType('pt-scolor-color', makeColorType('color', tt('Màu chữ')));
      sm.addType('pt-scolor-bg', makeColorType('background-color', tt('Màu nền')));
      sm.addType('pt-scolor-border', makeColorType('border-color', tt('Màu viền')));
      scolorOk = true;
    } catch (e) {
      /* keep native color input if the custom type API differs */
    }
    // `name` gives each property a visible label; `full: true` makes color pickers span
    // the full width (own row) so they don't jam next to width/style and lose their label.
    const colorProp = scolorOk ? { property: 'color', type: 'pt-scolor-color', name: tt('Màu chữ'), full: true } : 'color';
    const bgProp = scolorOk
      ? { property: 'background-color', type: 'pt-scolor-bg', name: tt('Màu nền'), full: true }
      : 'background-color';
    // Split the 'border' composite so its color sub-field also uses ColorField (the
    // composite keeps a native color picker otherwise).
    const borderProps: any[] = scolorOk
      ? [
          { property: 'border-width', type: 'integer', units: ['px'], name: tt('Độ dày viền'), default: '0px' },
          {
            property: 'border-style',
            type: 'select',
            name: tt('Kiểu viền'),
            default: 'solid',
            list: [{ value: 'solid' }, { value: 'dashed' }, { value: 'dotted' }, { value: 'double' }, { value: 'none' }],
          },
          { property: 'border-color', type: 'pt-scolor-border', name: tt('Màu viền'), full: true },
        ]
      : ['border'];
    sm.getSectors?.().reset?.([
      {
        id: 'pt-typo',
        name: tt('Chữ'),
        open: true,
        properties: [
          'font-family', 'font-size', 'font-weight', 'font-style',
          colorProp, 'text-align', 'line-height', 'text-decoration',
        ],
      },
      {
        id: 'pt-space',
        name: tt('Kích thước & khoảng cách'),
        open: false,
        properties: ['width', 'height', 'padding', 'margin'],
      },
      {
        id: 'pt-deco',
        name: tt('Viền & nền'),
        open: false,
        properties: [bgProp, ...borderProps, { property: 'border-radius', name: tt('Bo góc') }],
      },
    ]);
    const fp = sm.getProperty?.('pt-typo', 'font-family');
    if (fp) {
      const font = appFontFamily();
      const opts = (typeof fp.getOptions === 'function' ? fp.getOptions() : fp.get('options')) || [];
      fp.set('options', [{ id: font, label: tt('Font hệ thống (theme)') }, ...opts]);
      fp.set('default', font);
    }
  } catch (e) {
    /* SM API drift between versions — cosmetic only */
  }
}

export const GrapesBodyEditor: React.FC<{
  api: any;
  collectionName?: string;
  value?: string;
  onChange: (v: string) => void;
  /** override the auto (viewport) height — smaller for header/footer editors */
  heightPx?: number;
}> = ({ api, collectionName, value, onChange, heightPx }) => {
  const { token } = theme.useToken();
  const tokenRef = useRef(token);
  tokenRef.current = token;
  const boxRef = useRef<HTMLDivElement>(null);
  const edRef = useRef<any>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const initialRef = useRef(value || '');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  // Re-theme the (global, shared) grapes stylesheet when the app theme changes while
  // the editor is open — light ↔ dark bakes new token values into the CSS.
  useEffect(() => {
    injectGrapesTheme(token);
  }, [token]);

  useEffect(() => {
    let dead = false;
    ensureGrapes(tokenRef.current)
      .then(({ grapesjs, plugins }) => {
        if (dead || !boxRef.current) return;
        const { css, html } = splitStyleFromBody(initialRef.current);
        const h = heightPx || editorHeight();
        if (boxRef.current) boxRef.current.style.height = `${h}px`;
        const editor = grapesjs.init({
          container: boxRef.current,
          height: `${h}px`, // fixed px — '100%' collapsed inside Drawer/Tabs/Spin wrappers
          fromElement: false,
          storageManager: false,
          // canvas-only css (NOT exported into the template): app theme font + paper-ish body
          canvasCss: `body { font-family: ${appFontFamily()}; font-size: 13px; color: #222; background: #fff; padding: 12px; margin: 0; }`,
          plugins,
          pluginsOpts: {
            'grapesjs-preset-webpage': { modalImportButton: false, useCustomTheme: false },
            'gjs-blocks-basic': { flexGrid: false },
          },
        });
        edRef.current = editor;
        // Register types/traits BEFORE loading content — components built by
        // setComponents snapshot their type defaults at creation time, so a trait
        // registered afterwards never shows up on the loaded table (user-reported).
        addEachTrait(editor);
        registerTableTools(editor);
        addPrintBlocks(editor);
        trimPanels(editor);
        restyleBasicBlocks(editor);
        restylePanelButtons(editor);
        tuneStyleManager(editor);
        editor.setComponents(html || '<h1>HOÁ ĐƠN</h1><p>Kéo block từ cột phải vào đây...</p>');
        if (css) editor.setStyle(css);
        // Belt & braces against the blank-canvas-until-reflow issue (drawer/tab layout
        // settles a beat after mount): recompute canvas offsets shortly after ready.
        editor.onReady?.(() => setTimeout(() => editor.refresh?.(), 60));
        setTimeout(() => {
          editor.refresh?.();
          // size probe — if the canvas ever comes up blank again, this console line says why
          const cv = boxRef.current?.querySelector?.('.gjs-cv-canvas') as HTMLElement | null;
          const fr = boxRef.current?.querySelector?.('iframe.gjs-frame') as HTMLElement | null;
          // eslint-disable-next-line no-console
          console.log(
            '[print-template] grapes sizes',
            'box:', boxRef.current?.offsetHeight,
            'editor:', (boxRef.current?.firstElementChild as HTMLElement | null)?.offsetHeight,
            'canvas:', cv?.offsetWidth, 'x', cv?.offsetHeight,
            'frame:', fr?.offsetWidth, 'x', fr?.offsetHeight,
          );
        }, 500);
        let timer: any;
        editor.on('update', () => {
          clearTimeout(timer);
          timer = setTimeout(() => {
            try {
              onChangeRef.current(composeBody(prettyHtml(editor.getHtml() || ''), prettyCss(editor.getCss() || '')));
            } catch (e) {
              /* mid-drag states can throw — next update wins */
            }
          }, 350);
        });
        setLoading(false);
      })
      .catch((e) => {
        if (!dead) {
          setErr(e?.message || String(e));
          setLoading(false);
        }
      });
    return () => {
      dead = true;
      try {
        edRef.current?.destroy?.();
      } catch (e) {
        /* already gone */
      }
      edRef.current = null;
    };
  }, []);

  const insertToken = (path: string[]) => {
    const ed = edRef.current;
    if (!ed) return;
    const comp = `<span>{{${path.join('.')}}}</span>`;
    const sel = ed.getSelected?.();
    if (sel?.append) sel.append(comp);
    else ed.addComponents(comp);
  };

  if (err) return <Alert type="error" message={tt('Không tải được trình kéo-thả: {{err}}', { err })} />;

  return (
    <div>
      <div style={{ marginBottom: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <FieldPickerCascader api={api} collectionName={collectionName} includeToMany onPick={insertToken} />
        <span style={{ fontSize: 12, color: token.colorTextSecondary }}>{tt('Block nhóm "Template in" ở panel phải')}</span>
      </div>
      <Spin spinning={loading}>
        <div ref={boxRef} style={{ height: heightPx || editorHeight(), border: `1px solid ${token.colorBorderSecondary}`, borderRadius: 6, overflow: 'hidden' }} />
      </Spin>
    </div>
  );
};
