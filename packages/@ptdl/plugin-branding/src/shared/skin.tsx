import React from 'react';
import { Button, Card, ColorPicker, Divider, Modal, Slider, Space, Switch, Tooltip, Upload, message } from 'antd';
import { COLOR_PRESETS, colorToString, SegmentedGroup } from '@ptdl/shared';
import { currentThemeUid, scopedType } from './themeScope';

/**
 * @ptdl/plugin-branding — admin skin builder. A visual settings page produces a SkinCfg (per-section
 * gradient + text colour); `buildSkinCss` turns it into a global stylesheet that `injectSkin` writes
 * to <head>. Applied app-wide (every client calls loadAndApplySkin at startup). Raw-CSS under the
 * hood but no CSS knowledge needed in the UI.
 */

export type GradPart = { on?: boolean; from?: string; to?: string; angle?: number; text?: string; selBg?: string; border?: string; shadow?: boolean };
export type SkinCfg = {
  preset?: string;
  sidebar?: GradPart;
  header?: GradPart;
  card?: GradPart;
  container?: GradPart; // the main content-area background (the grey region behind blocks/cards)
  accent?: string; // antd primary/accent colour — buttons, links, active tabs, switches, focus rings
  radius?: number; // corner radius (px) for controls + cards (antd default 6). 0 = sharp, 16 = rounded
  density?: 'compact' | 'default' | 'comfortable'; // global spacing (form items / list / card body)
};

const STYLE_ID = 'ptdl-branding-skin';

// Nudge a #rrggbb colour lighter (+delta) or darker (−delta) per channel — for accent hover/active shades.
function adjustColor(hex: string, delta: number): string {
  const m = String(hex).trim().match(/^#([0-9a-f]{6})$/i);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const cl = (x: number) => Math.max(0, Math.min(255, x));
  const parts = [cl((n >> 16) + delta), cl(((n >> 8) & 255) + delta), cl((n & 255) + delta)];
  return '#' + parts.map((x) => x.toString(16).padStart(2, '0')).join('');
}

// ── Colour maths: derive whole theme families from ONE base hue, so Light / Dark / Mix stay in sync
// by construction (the Mix theme literally reuses Dark's chrome + Light's container). ───────────────
function hexToRgb(hex: string): [number, number, number] {
  let h = String(hex).replace('#', '');
  if (h.length === 3) h = h.split('').map((x) => x + x).join('');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return [h * 360, s, l];
}
function hslToHex(h: number, s: number, l: number): string {
  const hh = (((h % 360) + 360) % 360) / 360;
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  let r: number;
  let g: number;
  let b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, hh + 1 / 3);
    g = hue2rgb(p, q, hh);
    b = hue2rgb(p, q, hh - 1 / 3);
  }
  const to = (x: number) => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

// The four gradient building blocks derived from a base hue. Lightness/saturation are tuned to read
// like the old hand-picked presets: deep, rich dark chrome; a soft light container. Saturation is
// preserved (so greys stay grey, vivid hues stay vivid) but capped so neons don't glare.
function stops(hex: string): {
  darkChrome: { from: string; to: string };
  darkCont: { from: string; to: string };
  lightChrome: { from: string; to: string };
  lightCont: { from: string; to: string };
  darkText: string;
  lightText: string;
} {
  const [h, s0] = rgbToHsl(...hexToRgb(hex));
  const S = Math.min(0.92, s0); // cap only — low-sat greys keep their neutral character
  return {
    darkChrome: { from: hslToHex(h, S * 0.85, 0.09), to: hslToHex(h, S, 0.3) },
    darkCont: { from: hslToHex(h, S * 0.8, 0.07), to: hslToHex(h, S * 0.95, 0.18) },
    lightChrome: { from: hslToHex(h, S * 0.3, 0.985), to: hslToHex(h, S * 0.55, 0.87) },
    lightCont: { from: hslToHex(h, S * 0.22, 0.99), to: hslToHex(h, S * 0.45, 0.93) },
    darkText: hslToHex(h, Math.min(S, 0.4), 0.97), // near-white tint of the hue
    lightText: hslToHex(h, Math.min(S + 0.1, 0.7), 0.25), // deep tone, readable on the light container
  };
}

// One base colour → { light, dark, mix }. The alignment the design needs is guaranteed structurally:
//   • mix.sidebar / mix.header  ===  dark.sidebar / dark.header   (same chrome objects)
//   • mix.container             ===  light.container              (same container object)
function triplet(hex: string): { light: SkinCfg; dark: SkinCfg; mix: SkinCfg } {
  const k = stops(hex);
  const dark: SkinCfg = {
    sidebar: { on: true, from: k.darkChrome.from, to: k.darkChrome.to, angle: 172, text: k.darkText },
    header: { on: true, from: k.darkChrome.from, to: k.darkChrome.to, angle: 90, text: k.darkText },
    container: { on: true, from: k.darkCont.from, to: k.darkCont.to, angle: 180 },
  };
  const light: SkinCfg = {
    sidebar: { on: true, from: k.lightChrome.from, to: k.lightChrome.to, angle: 180, text: k.lightText, selBg: 'rgba(0,0,0,.06)' },
    header: { on: true, from: k.lightChrome.from, to: k.lightChrome.to, angle: 90, text: k.lightText },
    container: { on: true, from: k.lightCont.from, to: k.lightCont.to, angle: 180 },
  };
  const mix: SkinCfg = { sidebar: dark.sidebar, header: dark.header, container: light.container };
  return { light, dark, mix };
}

function rgbHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('');
}

// Two candidate brand colours are "the same" if their hues are within ~22° (both greys collapse to one).
function closeHue(a: string, b: string): boolean {
  const [ha, sa] = rgbToHsl(...hexToRgb(a));
  const [hb, sb] = rgbToHsl(...hexToRgb(b));
  if (sa < 0.12 && sb < 0.12) return true;
  let d = Math.abs(ha - hb);
  if (d > 180) d = 360 - d;
  return d < 22;
}

// Pull the dominant brand colours out of a logo, purely client-side (canvas — no upload, no AI). We draw
// the image small, drop transparent/near-white/near-black pixels (logo backgrounds), bin the rest by a
// coarse hue+lightness key, and rank buckets by size × saturation so vivid brand colours win over greys.
function extractPalette(img: HTMLImageElement, topN = 3): string[] {
  const W = 56;
  const H = Math.max(1, Math.round((56 * img.height) / (img.width || 1)));
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d');
  if (!ctx) return [];
  ctx.drawImage(img, 0, 0, W, H);
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, W, H).data;
  } catch {
    return []; // tainted canvas (shouldn't happen for a same-origin blob) — bail gracefully
  }
  const buckets = new Map<string, { n: number; r: number; g: number; b: number; s: number }>();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue; // transparent
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const [h, s, l] = rgbToHsl(r, g, b);
    if (l > 0.94 || l < 0.06) continue; // near-white / near-black (logo backgrounds)
    const key = s < 0.12 ? `g${Math.round(l * 6)}` : `${Math.round(h / 24)}_${Math.round(l * 4)}`;
    const bk = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0, s: 0 };
    bk.n++;
    bk.r += r;
    bk.g += g;
    bk.b += b;
    bk.s += s;
    buckets.set(key, bk);
  }
  const ranked = [...buckets.values()]
    .map((bk) => ({ color: rgbHex(bk.r / bk.n, bk.g / bk.n, bk.b / bk.n), weight: bk.n * (0.35 + bk.s / bk.n) }))
    .sort((a, b) => b.weight - a.weight);
  const out: string[] = [];
  for (const c of ranked) {
    if (out.some((o) => closeHue(o, c.color))) continue;
    out.push(c.color);
    if (out.length >= topN) break;
  }
  return out;
}

function grad(g?: GradPart): string {
  if (!g?.from) return '';
  return `linear-gradient(${g.angle ?? 180}deg, ${g.from} 0%, ${g.to || g.from} 100%)`;
}

// Rough perceived-luminance test so we can auto-pick readable text (dark bg → light text, and vice
// versa) when the user hasn't set an explicit colour. Handles #rgb, #rrggbb and rgb()/rgba().
function isLightColor(c?: string): boolean {
  if (!c) return false;
  let r = 0;
  let gg = 0;
  let b = 0;
  const s = String(c).trim();
  const hex = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split('').map((x) => x + x).join('');
    r = parseInt(h.slice(0, 2), 16);
    gg = parseInt(h.slice(2, 4), 16);
    b = parseInt(h.slice(4, 6), 16);
  } else {
    const rm = s.match(/rgba?\(([^)]+)\)/i);
    if (!rm) return false;
    const parts = rm[1].split(',').map((x) => parseFloat(x));
    r = parts[0] || 0;
    gg = parts[1] || 0;
    b = parts[2] || 0;
  }
  return 0.299 * r + 0.587 * gg + 0.114 * b > 150;
}

// Text colour for the content area: explicit override, else auto-contrast against the gradient start.
// A cleared picker can yield 'transparent' — treat that as "auto" so the title never goes invisible.
function containerText(ct?: GradPart): string {
  const t = ct?.text;
  if (t && t.toLowerCase() !== 'transparent') return t;
  return isLightColor(ct?.from) ? '#1f2937' : '#ffffff';
}

// Read NocoBase's active theme (light/dark) from antd's live design tokens on the page — independent of
// the skin we inject (that only overrides element backgrounds, not the `--color*` tokens). A dark theme
// yields a dark `--colorBgContainer`; fall back to text-colour luminance, then light.
export function detectSystemDark(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const cs = getComputedStyle(document.body);
    const bg = (
      cs.getPropertyValue('--colorBgContainer') ||
      cs.getPropertyValue('--colorBgBase') ||
      cs.getPropertyValue('--colorBgLayout')
    ).trim();
    if (bg) return !isLightColor(bg);
    const txt = cs.getPropertyValue('--colorText').trim();
    if (txt) return isLightColor(txt); // light text ⇒ dark theme
  } catch {
    /* ignore */
  }
  return false;
}

// SkinCfg → global CSS. Selectors target antd's semantic classes (survive the CSS-in-JS hashing);
// `!important` beats antd's own tokens.
export function buildSkinCss(cfg: SkinCfg): string {
  if (!cfg || typeof cfg !== 'object') return '';
  const p: string[] = [];
  const sb = cfg.sidebar;
  if (sb?.on && sb.from) {
    const g = grad(sb);
    if (cfg.preset === 'glass') {
      // Glass: a SINGLE translucent layer on the visible menu + blur. Painting only the menu (not the
      // sider too) avoids the sider+menu double-stack that made a lighter "block" at the top.
      p.push(
        `.ant-layout-sider .ant-menu,.ant-layout-sider .ant-pro-base-menu,.ant-layout-sider .ant-pro-base-menu-inline` +
          `{background:${g}!important;backdrop-filter:blur(10px)!important;border-inline-end:none!important}`,
      );
      p.push(`.ant-layout-sider,.ant-layout-sider .ant-layout-sider-children{background:transparent!important}`);
    } else {
      // Paint the gradient on the sider AND the ProLayout menu container (the Settings nav's visible
      // background is `.ant-pro-base-menu*`, NOT `.ant-layout-sider`). Solid colours → no visible seam.
      p.push(
        `.ant-layout-sider,.ant-layout-sider .ant-layout-sider-children,` +
          `.ant-layout-sider .ant-pro-base-menu,.ant-layout-sider .ant-pro-base-menu-inline{background:${g}!important}`,
      );
      p.push(
        `.ant-layout-sider .ant-menu:not([class*="pro-base-menu"]),.ant-layout-sider .ant-menu-sub` +
          `{background:transparent!important;border-inline-end:none!important}`,
      );
    }
    if (sb.text) {
      // Text + icons. Colour ONLY via `color` (→ `currentColor`): works for stroke-based Lucide icons
      // (`stroke="currentColor" fill="none"`) AND antd fill icons. Never force `fill` — that floods a
      // Lucide icon's `fill:none` interior and turns the clean outline into a solid blob.
      p.push(
        `.ant-layout-sider .ant-menu-item,.ant-layout-sider .ant-menu-submenu-title,` +
          `.ant-layout-sider .ant-menu-title-content,.ant-layout-sider .ant-menu-item a,` +
          `.ant-layout-sider [class*="menu"] .anticon,.ant-layout-sider .ant-menu svg,` +
          `.ant-layout-sider [class*="menu"] svg{color:${sb.text}!important}`,
      );
    }
    // Neutral hover/selected tints → readable on BOTH dark and light gradients.
    p.push(`.ant-layout-sider .ant-menu-item:hover,.ant-layout-sider .ant-menu-submenu-title:hover{background:rgba(127,127,127,.16)!important}`);
    p.push(`.ant-layout-sider .ant-menu-item-selected{background:${sb.selBg || 'rgba(127,127,127,.24)'}!important}`);
  }
  const hd = cfg.header;
  if (hd?.on && hd.from) {
    p.push(`.ant-layout-header,.ant-pro-layout-header{background:${grad(hd)}!important}`);
    if (hd.text) {
      p.push(`.ant-layout-header,.ant-layout-header a,.ant-layout-header .anticon{color:${hd.text}!important}`);
      // The real topbar (logo + collapse toggle + right-side action icons: settings/notifications/help/
      // avatar) is `.ant-pro-global-header`, which floats OVER the header bar — it is NOT inside
      // `.ant-layout-header`, so the rule above misses it. Colour the logo/collapse/right actions here.
      // Skip the middle slot (`-right-content` only): the global-search plugin styles its own pill there.
      p.push(
        `.ant-pro-global-header-logo,.ant-pro-global-header-logo *,` +
          `.ant-pro-global-header-collapsed-button,.ant-pro-global-header-collapsed-button *,` +
          `.ant-pro-global-header-right-content,.ant-pro-global-header-right-content *{color:${hd.text}!important}`,
      );
    }
  }
  const cd = cfg.card;
  if (cd?.on && cd.from) {
    const cg = grad(cd);
    const cdText = containerText(cd); // auto-contrast unless the user set an explicit colour
    const cdBorder = cd.border || 'transparent';
    // Card frame: gradient background + optional border. Head band transparent so the gradient runs
    // edge-to-edge, and its title/text take the card text colour.
    p.push(`.ant-card{background:${cg}!important;border:1px solid ${cdBorder}!important}`);
    p.push(`.ant-card-head{background:transparent!important;border-color:${cd.border || 'rgba(127,127,127,.2)'}!important}`);
    p.push(
      `.ant-card,.ant-card-body,.ant-card-head,.ant-card .ant-card-head-title,` +
        `.ant-card .ant-card-meta-title,.ant-card .ant-card-meta-description{color:${cdText}!important}`,
    );
    // Tables/lists sitting inside the card would otherwise paint their own white and hide the gradient
    // ("chưa thấy đâu"). Make their surfaces transparent + inherit the readable card text colour; keep a
    // faint separator so rows stay legible.
    p.push(
      `.ant-card .ant-table,.ant-card .ant-table-thead>tr>th,.ant-card .ant-table-tbody>tr>td,` +
        `.ant-card .ant-table-cell,.ant-card .ant-table-summary>tr>td,.ant-card .ant-list-item` +
        `{background:transparent!important;color:${cdText}!important;border-color:${cd.border || 'rgba(127,127,127,.22)'}!important}`,
    );
  }
  // Card elevation — independent of the gradient, so cards can just float (soft shadow, white or themed).
  if (cd?.on && cd.shadow) {
    p.push(`.ant-card{box-shadow:0 1px 2px rgba(0,0,0,.06),0 6px 18px rgba(0,0,0,.10)!important}`);
  }
  const ct = cfg.container;
  if (ct?.on && ct.from) {
    const g = grad(ct);
    // Content area on every surface: the main page AND record popups (NocoBase opens records in a
    // right-side drawer by default). Paint the outer wrappers…
    p.push(`.ant-layout-content,.ant-pro-layout-content,.ant-pro-page-container,.ant-drawer-body{background:${g}!important}`);
    // …then clear the structural wrappers NocoBase stacks between the content root and the blocks so
    // the gradient shows through: the nested antd `<Layout>` (inline `colorBgLayout`) AND the
    // plain/hashed `acss-*` wrapper divs (verified via the user's F12 — a class-less/hashed `<div>`,
    // NOT an `.ant-layout`). Target by structure (classes are per-build hashes), stop at `.ant-card`
    // (white blocks stay) AND at `.ant-page-header` — the custom-header plugin paints the header's own
    // background inline, so we must never wipe it. The default header is ghost (already transparent),
    // so the container gradient shows through it without our help.
    // `:not([style*="border"])` spares intentional panels (a plugin's config card is a plain <div> with an
    // inline border — e.g. the @ptdl settings-page container); only the class-less/hashed wrapper divs
    // (no inline border) get cleared. Without this the skin would wipe every config page's white panel.
    p.push(
      `.ant-layout-content>div:not(.ant-page-header):not([style*="border"]),.ant-layout-content>div>div:not(.ant-card):not(.ant-page-header):not([style*="border"]),` +
        `.ant-layout-content .ant-layout,` +
        `.ant-pro-page-container>div:not(.ant-page-header):not([style*="border"]),.ant-pro-page-container .ant-layout,` +
        `.ant-drawer-body>div:not(.ant-page-header):not([style*="border"]),.ant-drawer-body>div>div:not(.ant-card):not(.ant-page-header):not([style*="border"]),.ant-drawer-body .ant-layout` +
        `{background:transparent!important}`,
    );
    // Give the title a readable default colour — but WITHOUT `!important`, via specificity only. This
    // beats antd's default (so the title is readable on a dark container) yet still LOSES to the
    // custom-header plugin's own inline title colour/gradient, so we never clobber a sibling plugin.
    const ctText = containerText(ct);
    p.push(
      `.ant-layout .ant-page-header .ant-page-header-heading-title,` +
        `.ant-layout .ant-page-header .ant-page-header-heading-sub-title,` +
        `.ant-pro-page-container .ant-page-header-heading-title,` +
        `.pageHeaderCss .ant-page-header-heading-title{color:${ctText}}`,
    );
    // Settings / sub-pages render inside a NESTED `.ant-layout-content` (regular data pages have exactly
    // one). Those config UIs are full of bare labels/descriptions/headings with per-element colours
    // that can't be re-themed safely and go unreadable on a dark container. So neutralise the inner
    // content back to the app's default surface — light bg + default text — instead of fighting each
    // element. Verified via the user's DevTools + live-injected CSS. The theme-token vars adapt if the
    // app itself is in antd dark mode. Also reset any page-header title there (my rule above colours it).
    p.push(`.ant-layout-content .ant-layout-content{background:var(--colorBgLayout,#f5f5f5)!important}`);
    p.push(
      `.ant-layout-content .ant-layout-content,` +
        `.ant-layout-content .ant-layout-content .ant-page-header-heading-title,` +
        `.ant-layout-content .ant-layout-content .ant-page-header-heading-sub-title{color:var(--colorText,rgba(0,0,0,0.88))!important}`,
    );
  }

  // ---- Accent (antd primary) --------------------------------------------------------------------
  // NOTE: antd buttons/switches/etc. ignore injected CSS entirely (their colours are generated from the
  // antd theme *token*, not a stylesheet rule you can override — verified: even `outline !important`
  // won't stick on `.ant-btn`). So accent is NOT done here; on Save the client writes `colorPrimary`
  // into NocoBase's active theme token (see `applyAccentToken`), which antd regenerates on reload.

  // ---- Corner radius ----------------------------------------------------------------------------
  if (typeof cfg.radius === 'number') {
    const r = Math.max(0, Math.min(24, cfg.radius));
    p.push(
      `.ant-btn,.ant-input,.ant-input-affix-wrapper,.ant-input-number,.ant-select-selector,.ant-picker,` +
        `.ant-tag,.ant-segmented,.ant-segmented-item,.ant-alert,.ant-message-notice-content,.ant-avatar` +
        `{border-radius:${r}px!important}`,
    );
    p.push(
      `.ant-card,.ant-modal-content,.ant-dropdown-menu,.ant-popover-inner,.ant-table,.ant-table-container,` +
        `.ant-collapse,.ant-notification-notice,.ant-drawer-content{border-radius:${r}px!important}`,
    );
  }

  // ---- Density (global spacing) -----------------------------------------------------------------
  if (cfg.density === 'compact' || cfg.density === 'comfortable') {
    const comfy = cfg.density === 'comfortable';
    p.push(`.ant-form-item{margin-bottom:${comfy ? 28 : 12}px!important}`);
    p.push(`.ant-list-item{padding-top:${comfy ? 14 : 6}px!important;padding-bottom:${comfy ? 14 : 6}px!important}`);
    p.push(`.ant-card-body{padding:${comfy ? 28 : 14}px!important}`);
  }

  // Effect presets
  if (cfg.preset === 'animated' && sb?.on) {
    p.push(`@keyframes ptdlSkinShift{0%{background-position:0% 0%}100%{background-position:0% 100%}}`);
    p.push(`.ant-layout-sider{background-size:100% 220%!important;animation:ptdlSkinShift 14s ease-in-out infinite alternate!important}`);
  }
  return p.join('\n');
}

export function injectSkin(css: string) {
  if (typeof document === 'undefined') return;
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = css || '';
}

// Every client calls this at startup to apply the saved skin — for the CURRENT theme (server falls back
// to the global `skin` row when this theme has no override).
export async function loadAndApplySkin(apiClient: any) {
  try {
    const res = await apiClient.request({ url: 'brandingConfigs:getActive', params: { type: scopedType('skin', currentThemeUid()) } });
    const cfg = res?.data?.data?.options || res?.data?.data || {};
    injectSkin(buildSkinCss(cfg));
  } catch (e) {
    /* ignore — no skin yet */
  }
}

// ---- Presets --------------------------------------------------------------------------------------
// Each preset is a FULL skin: it styles the sidebar + header + content container as one coordinated
// palette (cards stay white so tables/forms remain readable — a light card floats on the dark
// container). Dark presets: white menu/header text, no container `text` (that would cascade into the
// white cards). Light presets: dark text, subtle-tint container.
// The 21 base colours from the ColorField palette (Tailwind-500). Each becomes a "colour standard"
// from which a whole Light / Dark / Mix family is generated — so themes stay systematic and aligned.
export const BASE_COLORS: Array<{ key: string; label: string; hex: string }> = [
  { key: 'red', label: 'Red', hex: '#ef4444' },
  { key: 'rose', label: 'Rose', hex: '#f43f5e' },
  { key: 'pink', label: 'Pink', hex: '#ec4899' },
  { key: 'fuchsia', label: 'Fuchsia', hex: '#d946ef' },
  { key: 'purple', label: 'Purple', hex: '#a855f7' },
  { key: 'violet', label: 'Violet', hex: '#8b5cf6' },
  { key: 'indigo', label: 'Indigo', hex: '#6366f1' },
  { key: 'blue', label: 'Blue', hex: '#3b82f6' },
  { key: 'sky', label: 'Sky', hex: '#0ea5e9' },
  { key: 'cyan', label: 'Cyan', hex: '#06b6d4' },
  { key: 'teal', label: 'Teal', hex: '#14b8a6' },
  { key: 'emerald', label: 'Emerald', hex: '#10b981' },
  { key: 'green', label: 'Green', hex: '#22c55e' },
  { key: 'lime', label: 'Lime', hex: '#84cc16' },
  { key: 'amber', label: 'Amber', hex: '#f59e0b' },
  { key: 'yellow', label: 'Yellow', hex: '#eab308' },
  { key: 'orange', label: 'Orange', hex: '#f97316' },
  { key: 'slate', label: 'Slate', hex: '#64748b' },
  { key: 'gray', label: 'Gray', hex: '#6b7280' },
  { key: 'stone', label: 'Stone', hex: '#78716c' },
  { key: 'neutral', label: 'Neutral', hex: '#737373' },
];

// Every preset is generated from a base colour via triplet(): for each base we emit Light / Dark / Mix.
// The alignment the design needs holds by construction — Mix reuses Dark's chrome + Light's container:
//   Dark & Mix share the SIDEBAR (+ header) gradient · Light & Mix share the CONTAINER gradient.
export type Preset = { key: string; base: string; label: string; group: 'light' | 'dark' | 'mix'; cfg: SkinCfg };
export const PRESETS: Preset[] = BASE_COLORS.flatMap((b) => {
  const t = triplet(b.hex);
  const mk = (group: 'light' | 'dark' | 'mix', part: SkinCfg): Preset => ({
    key: `${b.key}-${group}`,
    base: b.key,
    label: b.label,
    group,
    cfg: { preset: `${b.key}-${group}`, ...part },
  });
  return [mk('light', t.light), mk('dark', t.dark), mk('mix', t.mix)];
});
export const PRESETS_BY_KEY: Record<string, Preset> = Object.fromEntries(PRESETS.map((p) => [p.key, p]));

// Accent (antd primary) = the base colour itself (its vivid 500 tone) for every variant of that base.
export const PRESET_ACCENTS: Record<string, string> = Object.fromEntries(
  PRESETS.map((p) => [p.key, BASE_COLORS.find((b) => b.key === p.base)!.hex]),
);

// One preset chip: a mini admin mockup (sidebar bar + header strip + container fill) so the swatch
// shows the preset covers all three areas, not just the sidebar colour.
function PresetSwatch({ pr, active, onClick }: { pr: { key: string; label: string; group?: string; cfg: SkinCfg }; active: boolean; onClick: () => void }) {
  const s = pr.cfg;
  const vLabel = pr.group === 'dark' ? 'Dark' : pr.group === 'mix' ? 'Mix' : 'Light';
  return (
    <Tooltip title={`${pr.label} · ${vLabel}`}>
      <div
        onClick={onClick}
        style={{
          width: 62,
          height: 38,
          borderRadius: 8,
          cursor: 'pointer',
          overflow: 'hidden',
          display: 'flex',
          border: active ? '2px solid #1677ff' : '1px solid #d9d9d9',
          background: grad(s.container) || grad(s.sidebar) || '#eee',
        }}
      >
        <div style={{ width: 15, flex: 'none', background: grad(s.sidebar) }} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ height: 9, flex: 'none', background: grad(s.header) || 'transparent' }} />
        </div>
      </div>
    </Tooltip>
  );
}

// ================= Settings-page builder (plain-React lane) ========================================
let _api: any = null;
let _t: (s: string) => string = (s) => s;
export function initSkinUi(deps: { apiClient: any; t?: (s: string) => string }) {
  _api = deps.apiClient || _api;
  if (deps.t) _t = deps.t;
}

function ColorBtn({ value, onChange, label }: { value?: string; onChange: (v: string) => void; label: string }) {
  return (
    <Space size={4}>
      <span style={{ fontSize: 12, color: '#888' }}>{label}</span>
      <ColorPicker
        size="small"
        value={value || undefined}
        presets={COLOR_PRESETS as any}
        allowClear
        showText
        onChange={(c: any) => onChange(colorToString(c) || '')}
        onClear={() => onChange('')}
      />
    </Space>
  );
}

function GradientSection({
  title,
  part,
  withText,
  withBorder,
  withShadow,
  onChange,
}: {
  title: string;
  part: GradPart;
  withText?: boolean;
  withBorder?: boolean;
  withShadow?: boolean;
  onChange: (p: GradPart) => void;
}) {
  const set = (patch: Partial<GradPart>) => onChange({ ...part, ...patch });
  return (
    <Card size="small" title={<Space><Switch checked={!!part.on} onChange={(on) => set({ on })} size="small" />{title}</Space>} style={{ marginBottom: 0, height: '100%' }}>
      {part.on ? (
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          <Space wrap size={16}>
            <ColorBtn label={_t('From')} value={part.from} onChange={(from) => set({ from })} />
            <ColorBtn label={_t('To')} value={part.to} onChange={(to) => set({ to })} />
            {withText ? <ColorBtn label={_t('Text')} value={part.text} onChange={(text) => set({ text })} /> : null}
            {withBorder ? <ColorBtn label={_t('Border')} value={part.border} onChange={(border) => set({ border })} /> : null}
            {withShadow ? (
              <Space size={4}>
                <span style={{ fontSize: 12, color: '#888' }}>{_t('Shadow')}</span>
                <Switch size="small" checked={!!part.shadow} onChange={(shadow) => set({ shadow })} />
              </Space>
            ) : null}
          </Space>
          <Space size={10} style={{ width: '100%' }} align="center">
            <span style={{ fontSize: 12, color: '#888', flex: 'none' }}>{_t('Angle')}</span>
            <Slider min={0} max={360} value={part.angle ?? 180} onChange={(angle) => set({ angle })} style={{ flex: 1, minWidth: 160 }} />
            <span style={{ fontSize: 12, color: '#888', width: 40 }}>{part.angle ?? 180}°</span>
          </Space>
          <div style={{ height: 26, borderRadius: 6, background: grad(part) || '#eee' }} />
        </Space>
      ) : (
        <span style={{ color: '#999', fontSize: 12 }}>{_t('Off')}</span>
      )}
    </Card>
  );
}

// Self-contained mini-admin mockup — shows sidebar/header/card exactly as configured, so the preview
// works even on the Settings page (whose own left nav is a DIFFERENT element from the app sidebar).
function SkinPreview({ cfg }: { cfg: SkinCfg }) {
  const sb = cfg.sidebar || {};
  const hd = cfg.header || {};
  const cd = cfg.card || {};
  const ct = cfg.container || {};
  const txt = sb.text || '#fff';
  const accent = cfg.accent || '#1677ff';
  const rad = cfg.radius ?? 6;
  return (
    <div style={{ display: 'flex', border: '1px solid var(--colorBorder,#e5e5e5)', borderRadius: 8, overflow: 'hidden', height: 156, marginBottom: 16 }}>
      <div style={{ width: 128, flex: 'none', background: sb.on && sb.from ? grad(sb) : '#1f1f24', color: txt, padding: '10px 8px', fontSize: 11.5 }}>
        <div style={{ fontWeight: 700, marginBottom: 10, opacity: 0.95 }}>◆ Logo</div>
        <div style={{ padding: '5px 8px', borderRadius: 5, marginBottom: 3 }}>{_t('Menu')} 1</div>
        <div style={{ padding: '5px 8px', borderRadius: 5, marginBottom: 3, background: sb.selBg || 'rgba(255,255,255,.16)' }}>{_t('Menu')} 2</div>
        <div style={{ padding: '5px 8px', borderRadius: 5 }}>{_t('Menu')} 3</div>
      </div>
      <div style={{ flex: 1, background: ct.on && ct.from ? grad(ct) : 'var(--colorBgLayout,#f5f5f5)', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ height: 34, flex: 'none', background: hd.on && hd.from ? grad(hd) : '#fff', color: hd.text || '#333', display: 'flex', alignItems: 'center', padding: '0 12px', fontSize: 11.5, borderBottom: '1px solid var(--colorBorderSecondary,#eee)' }}>
          {_t('Header')}
        </div>
        <div style={{ padding: '8px 12px 0', fontSize: 11.5, fontWeight: 600, color: ct.on && ct.from ? containerText(ct) : '#555' }}>{_t('Page')}</div>
        <div style={{ flex: 1, padding: '6px 12px 12px' }}>
          <div style={{ height: '100%', borderRadius: rad, background: cd.on && cd.from ? grad(cd) : '#fff', border: `1px solid ${cd.on && cd.border ? cd.border : 'var(--colorBorderSecondary,#eee)'}`, boxShadow: cd.on && cd.shadow ? '0 4px 14px rgba(0,0,0,.18)' : 'none', padding: 10, fontSize: 11.5, color: cd.on && cd.from ? containerText(cd) : '#888', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <span>{_t('Card')}</span>
            <span style={{ alignSelf: 'flex-start', background: accent, color: '#fff', fontSize: 10.5, padding: '3px 10px', borderRadius: rad, fontWeight: 600 }}>{_t('Button')}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function BrandingSkinPage({ scopeUid }: { scopeUid?: string } = {}): React.ReactElement {
  const [cfg, setCfg] = React.useState<SkinCfg>({});
  const savedRef = React.useRef<SkinCfg>({});
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  // Which preset group to surface first — follows NocoBase's active light/dark theme.
  const [sysDark, setSysDark] = React.useState(false);
  React.useEffect(() => setSysDark(detectSystemDark()), []);
  // Brand colours pulled from an uploaded logo (client-side) → each offers a generated Light/Mix/Dark trio.
  const [logoColors, setLogoColors] = React.useState<string[]>([]);

  // Load the skin for the theme currently being edited (`scopeUid`); reloads when the scope changes.
  React.useEffect(() => {
    let active = true;
    if (!_api?.request) {
      setLoading(false);
      return;
    }
    setLoading(true);
    _api
      .request({ url: 'brandingConfigs:getActive', params: { type: scopedType('skin', scopeUid) } })
      .then((res: any) => {
        if (!active) return;
        const o = res?.data?.data?.options || {};
        savedRef.current = o;
        setCfg(o);
      })
      .catch(() => {})
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [scopeUid]);

  // Live-apply to the real admin as you edit; on leave, revert to the last SAVED skin.
  React.useEffect(() => {
    injectSkin(buildSkinCss(cfg));
  }, [cfg]);
  React.useEffect(() => {
    return () => injectSkin(buildSkinCss(savedRef.current));
  }, []);

  // Apply a preset's colours + its matched accent, but KEEP the user's shape/density prefs (radius,
  // density aren't colour and shouldn't be wiped when swatching through presets). `accent` overrides the
  // preset's accent — used by the logo-generated triplets (accent = the extracted brand colour).
  const applyPreset = (pr: { key: string; cfg: SkinCfg }, accent?: string) =>
    setCfg((c) => ({ ...pr.cfg, accent: accent ?? PRESET_ACCENTS[pr.key] ?? pr.cfg.accent, radius: c.radius, density: c.density }));

  // Read an uploaded logo client-side and pull its brand colours (no upload; return false to block antd).
  const onLogoFile = (file: File) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const cols = extractPalette(img, 3);
        setLogoColors(cols);
        if (!cols.length) message.info(_t('No usable colours found — try a more colourful logo.'));
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      message.error(_t('Could not read that image.'));
      URL.revokeObjectURL(url);
    };
    img.src = url;
    return false as const;
  };
  const setPart = (key: keyof SkinCfg, part: GradPart) => setCfg((c) => ({ ...c, [key]: part, preset: 'custom' }));

  const save = async () => {
    if (!_api?.request) return;
    setSaving(true);
    try {
      await _api.request({ url: 'brandingConfigs:save', method: 'post', data: { type: scopedType('skin', scopeUid), options: cfg } });
      // Accent → antd theme token of the theme being edited (buttons/links can't be recoloured by CSS).
      // Only when it changed; it applies on reload, so offer one.
      const accentChanged = (cfg.accent || '') !== (savedRef.current.accent || '');
      if (accentChanged) {
        await _api
          .request({ url: 'brandingConfigs:setAccent', method: 'post', data: { color: cfg.accent || '', uid: scopeUid || undefined } })
          .catch(() => {});
      }
      savedRef.current = cfg;
      message.success(_t('Saved'));
      if (accentChanged) {
        Modal.confirm({
          title: _t('Reload now?'),
          content: _t('The accent colour (buttons, links) applies after a reload.'),
          okText: _t('Reload'),
          cancelText: _t('Later'),
          onOk: () => window.location.reload(),
        });
      }
    } catch (e) {
      message.error(_t('Save failed'));
    }
    setSaving(false);
  };
  const reset = () => setCfg(savedRef.current || {});

  if (loading) return <div style={{ padding: 24 }}>{_t('Loading…')}</div>;

  // Each base colour → a Light / Mix / Dark trio in one aligned row. Mix sits in the MIDDLE: it reuses
  // Dark's sidebar (right neighbour) and Light's container (left neighbour), so the shared gradients
  // line up across the row. The variant nearest the system theme leads.
  const vOrder: Array<'light' | 'mix' | 'dark'> = sysDark ? ['dark', 'mix', 'light'] : ['light', 'mix', 'dark'];
  const vName: Record<string, string> = { light: _t('Light'), mix: _t('Mix'), dark: _t('Dark') };

  return (
    <div style={{ padding: 20, maxWidth: 1440, margin: '0 auto' }}>
      <h2 style={{ marginTop: 0, marginBottom: 4 }}>{_t('Admin skin')}</h2>
      <p style={{ color: '#888', margin: '0 0 16px' }}>{_t('Gradient/colour the sidebar, header and cards. Changes preview live; press Save to apply for everyone.')}</p>

      {/* Generate from logo — pull the brand colours out of an uploaded image (client-side canvas, no
          upload/AI) and offer a matched Light / Mix / Dark trio + accent for each, via the same generator. */}
      <div style={{ marginBottom: 16, padding: 12, border: '1px dashed var(--colorBorder, #d9d9d9)', borderRadius: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Upload accept="image/*" showUploadList={false} beforeUpload={onLogoFile}>
            <Button>{_t('Generate from logo…')}</Button>
          </Upload>
          <span style={{ fontSize: 12, color: '#888', flex: '1 1 260px' }}>
            {_t('Upload a logo — we suggest matching gradient themes + accent from its brand colours. Read in your browser only; nothing is uploaded.')}
          </span>
        </div>
        {logoColors.length > 0 ? (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {logoColors.map((hex, idx) => {
              const tri = triplet(hex);
              return (
                <div key={hex + idx} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span title={hex} style={{ width: 18, height: 18, flex: 'none', borderRadius: 4, background: hex, border: '1px solid rgba(0,0,0,.15)' }} />
                  <span style={{ width: 66, flex: 'none', fontSize: 12, color: '#666', fontFamily: 'monospace' }}>{hex}</span>
                  {vOrder.map((v) => {
                    const pr = { key: `logo-${idx}-${v}`, label: hex, group: v, cfg: { preset: `logo-${idx}-${v}`, ...tri[v] } };
                    return <PresetSwatch key={pr.key} pr={pr} active={cfg.preset === pr.key} onClick={() => applyPreset(pr, hex)} />;
                  })}
                </div>
              );
            })}
          </div>
        ) : null}
      </div>

      {/* Presets — one row per base colour, its Light / Mix / Dark variants aligned so the shared
          gradients line up (Mix = Dark's sidebar + Light's container). */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: '#888', margin: '0 0 8px' }}>
          {_t('Each row = one colour →')} <b>{vName[vOrder[0]]}</b> · <b>{vName[vOrder[1]]}</b> · <b>{vName[vOrder[2]]}</b>{'  '}
          <span style={{ color: '#aaa' }}>({_t('Mix shares its sidebar with Dark, its container with Light')})</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '10px 18px' }}>
          {BASE_COLORS.map((b) => (
            <div key={b.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 52, flex: 'none', fontSize: 12, color: '#666', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {_t(b.label)}
              </span>
              {vOrder.map((v) => {
                const pr = PRESETS_BY_KEY[`${b.key}-${v}`];
                return <PresetSwatch key={pr.key} pr={pr} active={cfg.preset === pr.key} onClick={() => applyPreset(pr)} />;
              })}
            </div>
          ))}
        </div>
      </div>

      <Divider style={{ margin: '4px 0 16px' }} />

      {/* Sticky preview + actions on the left; the four section editors in a 2-col grid on the right. */}
      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 340px', minWidth: 300, maxWidth: 440, position: 'sticky', top: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{_t('Preview')}</div>
          <SkinPreview cfg={cfg} />
          <Space>
            <Button type="primary" loading={saving} onClick={save}>
              {_t('Save')}
            </Button>
            <Button onClick={reset}>{_t('Reset')}</Button>
          </Space>
        </div>
        <div style={{ flex: '2 1 520px', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, alignItems: 'start' }}>
          <GradientSection title={_t('Sidebar')} part={cfg.sidebar || {}} withText onChange={(p) => setPart('sidebar', p)} />
          <GradientSection title={_t('Header')} part={cfg.header || {}} withText onChange={(p) => setPart('header', p)} />
          <GradientSection title={_t('Cards')} part={cfg.card || {}} withText withBorder withShadow onChange={(p) => setPart('card', p)} />
          <GradientSection title={_t('Container (content background)')} part={cfg.container || {}} withText onChange={(p) => setPart('container', p)} />
          {/* Accent (antd primary) + corner radius + density — spans the full width under the 2×2 grid. */}
          <Card size="small" title={_t('Accent & shape')} style={{ gridColumn: '1 / -1', marginBottom: 0 }}>
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <Space wrap size={20} align="center">
                <ColorBtn label={_t('Accent')} value={cfg.accent} onChange={(v) => setCfg((c) => ({ ...c, accent: v || undefined, preset: 'custom' }))} />
                <Space size={8} align="center">
                  <span style={{ fontSize: 12, color: '#888', flex: 'none' }}>{_t('Corners')}</span>
                  <Slider min={0} max={20} value={cfg.radius ?? 6} onChange={(v) => setCfg((c) => ({ ...c, radius: v }))} style={{ width: 150 }} />
                  <span style={{ fontSize: 12, color: '#888', width: 34 }}>{cfg.radius ?? 6}px</span>
                </Space>
              </Space>
              <Space size={8} align="center" wrap>
                <span style={{ fontSize: 12, color: '#888', flex: 'none' }}>{_t('Density')}</span>
                <SegmentedGroup
                  value={cfg.density || 'default'}
                  onChange={(v) => setCfg((c) => ({ ...c, density: v as SkinCfg['density'] }))}
                  options={[
                    { label: _t('Compact'), value: 'compact' },
                    { label: _t('Default'), value: 'default' },
                    { label: _t('Comfortable'), value: 'comfortable' },
                  ]}
                />
              </Space>
            </Space>
          </Card>
        </div>
      </div>
    </div>
  );
}
