/**
 * ECharts Pro default theme — a clean, modern dashboard look (light + dark), ported from the "semantix"
 * viz library's `lib/viz/core/theme.ts`: Tailwind-500 palette, muted slate axes, NO grid clutter, a
 * rounded shadowed tooltip with a soft category shadow-pointer, circle legend, and compact (K/M/B) numbers.
 *
 * Registered as an ECharts *theme* (`echarts.registerTheme`) so palette / axis / tooltip / legend / series
 * visual defaults apply automatically — `buildOption` only maps data + toggles + data-label position. The
 * user's JSON-style override + custom number-format still layer on top via later setOption calls.
 */

// Tailwind 500 (light) / 400 (dark) — same categorical palette semantix ships.
export const LIGHT_PALETTE = [
  '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899',
  '#06b6d4', '#f97316', '#14b8a6', '#e11d48', '#6366f1',
];
export const DARK_PALETTE = [
  '#60a5fa', '#34d399', '#fbbf24', '#a78bfa', '#f472b6',
  '#22d3ee', '#fb923c', '#2dd4bf', '#fb7185', '#818cf8',
];

// Compact notation "218K" / "24.9K" / "8.83K" / "305" / "1" (≈3 significant digits, EN suffixes).
let _cf: Intl.NumberFormat | null = null;
export function compactNum(v: any): string {
  if (v == null || v === '') return '';
  const n = typeof v === 'number' ? v : Number(v);
  if (!isFinite(n)) return String(v);
  try {
    _cf = _cf || new Intl.NumberFormat('en', { notation: 'compact', maximumSignificantDigits: 3 } as any);
    return _cf.format(n);
  } catch {
    return String(n);
  }
}

export const LIGHT_THEME_NAME = 'ptdlProLight';
export const DARK_THEME_NAME = 'ptdlProDark';

const DEFAULT_FONT = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';

function buildTheme(isDark: boolean) {
  const palette = isDark ? DARK_PALETTE : LIGHT_PALETTE;
  const axisLabel = '#94a3b8'; // slate-400 (muted) — both modes
  const line = isDark ? '#334155' : '#e2e8f0'; // slate-700 : slate-200
  const tooltipBg = isDark ? '#0f172a' : '#ffffff';
  const tooltipBorder = isDark ? '#334155' : '#e2e8f0';
  const tooltipText = isDark ? '#f8fafc' : '#0f172a';
  const nodeBorder = isDark ? '#0f172a' : '#ffffff';

  // Data-label defaults (dark-aware, crisp halo, compact numbers). Series set only show + position.
  const dataLabel = {
    color: isDark ? '#f1f5f9' : '#0f172a',
    fontSize: 10,
    fontWeight: 700 as any,
    textBorderColor: isDark ? 'rgba(2,6,23,0.65)' : '#ffffff',
    textBorderWidth: 2,
    formatter: (p: any) => compactNum(p && p.value != null ? p.value : ''),
  };

  const categoryAxis = {
    axisLine: { show: true, lineStyle: { color: line } },
    axisTick: { show: false },
    axisLabel: { color: axisLabel, margin: 12, fontSize: 11, fontWeight: 500 },
    splitLine: { show: false, lineStyle: { color: line, type: 'dashed' } },
    splitArea: { show: false },
  };
  const valueAxis = {
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: axisLabel, margin: 12, fontSize: 11, fontWeight: 500, formatter: (v: any) => compactNum(v) },
    splitLine: { show: false, lineStyle: { color: line, type: 'dashed' } },
    splitArea: { show: false },
  };

  return {
    color: palette,
    backgroundColor: 'transparent',
    textStyle: { fontFamily: DEFAULT_FONT },
    title: {
      textStyle: { color: isDark ? '#f1f5f9' : '#0f172a', fontWeight: 700 },
      subtextStyle: { color: axisLabel },
    },
    grid: { top: 40, left: 12, right: 20, bottom: 20, containLabel: true },
    categoryAxis,
    valueAxis,
    logAxis: valueAxis,
    timeAxis: categoryAxis,
    legend: {
      icon: 'circle',
      itemGap: 14,
      itemWidth: 10,
      itemHeight: 10,
      top: 4,
      textStyle: { color: axisLabel, fontSize: 12 },
    },
    tooltip: {
      backgroundColor: tooltipBg,
      borderColor: tooltipBorder,
      borderWidth: 1,
      textStyle: { color: tooltipText, fontSize: 12 },
      padding: [8, 12],
      extraCssText: 'box-shadow: 0 6px 20px rgba(15,23,42,0.14); border-radius: 10px;',
      axisPointer: {
        type: 'shadow',
        shadowStyle: { color: isDark ? 'rgba(148,163,184,0.12)' : 'rgba(100,116,139,0.08)' },
        lineStyle: { color: line },
      },
    },
    // Series-type visual defaults (data-label position/formatter is set in buildOption — orientation-aware).
    line: {
      symbol: 'circle',
      symbolSize: 7,
      showSymbol: true,
      lineStyle: { width: 2.5 },
      itemStyle: { borderWidth: 2, borderColor: nodeBorder },
      label: dataLabel,
      emphasis: { focus: 'series', scale: true },
    },
    bar: {
      itemStyle: { borderRadius: [5, 5, 0, 0] },
      barMaxWidth: 44,
      label: dataLabel,
      emphasis: { focus: 'series' },
    },
    pie: {
      itemStyle: { borderColor: nodeBorder, borderWidth: 2 },
      label: { color: isDark ? '#e2e8f0' : '#334155', fontSize: 11 },
      emphasis: { scale: true, scaleSize: 6 },
    },
    scatter: {
      symbolSize: 12,
      itemStyle: { opacity: 0.85 },
      emphasis: { focus: 'series' },
    },
  };
}

/** Register both themes on an echarts instance/namespace. Idempotent-safe (re-register is cheap). */
export function registerProThemes(echarts: any): void {
  try {
    echarts.registerTheme(LIGHT_THEME_NAME, buildTheme(false));
    echarts.registerTheme(DARK_THEME_NAME, buildTheme(true));
  } catch {
    /* ignore — falls back to default look */
  }
}

function lumOf(color: string): number | null {
  const m = (color || '').match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const p = m[1].split(',').map((s) => parseFloat(s));
  const a = p.length > 3 ? p[3] : 1;
  if (a < 0.05) return null; // fully transparent → no signal
  return 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2];
}

/** Detect a dark surface. PRIMARY signal = the inherited TEXT colour (always set, never transparent):
 *  light text ⇒ dark mode. Falls back to the first opaque ancestor background. Theme-agnostic — works for
 *  NocoBase light/dark (incl. its dark-purple content bg) without reading framework internals. */
export function detectDark(el: HTMLElement | null): boolean {
  try {
    const textLum = el ? lumOf(getComputedStyle(el).color) : null;
    if (textLum != null) return textLum > 140; // light text on the element ⇒ dark surface
    let node: HTMLElement | null = el;
    for (let i = 0; node && i < 12; i++) {
      const bgLum = lumOf(getComputedStyle(node).backgroundColor);
      if (bgLum != null) return bgLum < 128;
      node = node.parentElement;
    }
  } catch {
    /* ignore */
  }
  return false;
}
