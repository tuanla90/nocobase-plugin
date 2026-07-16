/** Number formatting + font/format helpers applied to an ECharts option. */

// The number formatter (`makeNumberFormatter`) and its config type (`NumberFormat`) are the
// CANONICAL versions now living in @ptdl/shared — they were lifted from this plugin, so the shared
// implementation is byte-identical. Re-exported here so existing imports from './format' keep working.
// applyFont / applyNumberFormat stay local: they are ECharts-option specific.
// Pure subpath (no antd/react) — avoids pulling the shared color/icon/picker modules into this bundle.
import { makeNumberFormatter } from '@ptdl/shared/format';
import type { NumberFormat } from '@ptdl/shared/format';

export { makeNumberFormatter };
export type { NumberFormat };

/** Set a global font family (ECharts propagates textStyle to most components). */
export function applyFont(option: any, font: string) {
  if (!font) return option;
  option.textStyle = Object.assign({}, option.textStyle, { fontFamily: font });
  return option;
}

/** Wire the number formatter into value axes, tooltip and shown data labels. */
export function applyNumberFormat(option: any, nf: NumberFormat) {
  const fmt = makeNumberFormatter(nf);

  option.tooltip = option.tooltip || {};
  if (option.tooltip.valueFormatter == null) {
    option.tooltip.valueFormatter = (v: any) => fmt(v);
  }

  const doAxis = (ax: any) => {
    if (!ax) return;
    const arr = Array.isArray(ax) ? ax : [ax];
    arr.forEach((a: any) => {
      if (a && a.type === 'value') {
        a.axisLabel = a.axisLabel || {};
        if (a.axisLabel.formatter == null) {
          a.axisLabel.formatter = (v: any) => fmt(v);
        }
      }
    });
  };
  doAxis(option.yAxis);
  doAxis(option.xAxis);

  (option.series || []).forEach((s: any) => {
    if (s && s.label && s.label.show && s.label.formatter == null) {
      s.label.formatter = (p: any) => {
        let v = p.value;
        if (Array.isArray(v)) v = v[v.length - 1];
        else if (v != null && typeof v === 'object') v = p.data && p.data.value;
        return fmt(v);
      };
    }
  });

  return option;
}
