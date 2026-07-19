/**
 * Factory that builds the "ECharts Pro" chart class on top of the Data
 * Visualization plugin's `Chart` base. Kept lane-agnostic: the v1 (`client`)
 * and v2 (`client-v2`) entry files pass their own `Chart` base in.
 */
import * as echarts from 'echarts';
import { ProEChart } from './ProEChart';
import { buildOption } from './buildOption';
import { applyFont, applyNumberFormat, NumberFormat } from './format';

function applyTransform(rows: any[], code: any): any[] {
  if (!code || !String(code).trim()) return rows;
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function('data', 'echarts', String(code));
    const out = fn(rows, echarts);
    return Array.isArray(out) ? out : rows;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[echarts-pro] transform error', e);
    return rows;
  }
}

function parseJsonStyle(text: any): any {
  if (!text || !String(text).trim()) return undefined;
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function('echarts', 'return (' + String(text) + ');');
    const o = fn(echarts);
    return o && typeof o === 'object' ? o : undefined;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[echarts-pro] jsonStyle error', e);
    return undefined;
  }
}

// Show number-format detail fields only when the toggle is on.
const nfReaction = { dependencies: ['nfEnabled'], fulfill: { state: { visible: '{{$deps[0]}}' } } };

// Config schema as a function of the translate `t` so labels are localized at registration time
// (runtime i18n against the plugin namespace) — framework-agnostic, no reliance on the data-viz form
// compiling `{{t()}}`. Code-example placeholders are left untranslated on purpose.
const buildConfig = (t: (s: string) => string): any[] => [
  {
    chartType: {
      title: t('Chart type'),
      type: 'string',
      'x-decorator': 'FormItem',
      'x-component': 'Select',
      default: 'line',
      enum: [
        { label: t('Line'), value: 'line' },
        { label: t('Area'), value: 'area' },
        { label: t('Column (vertical bar)'), value: 'column' },
        { label: t('Bar (horizontal)'), value: 'bar' },
        { label: t('Pie'), value: 'pie' },
        { label: t('Scatter'), value: 'scatter' },
      ],
    },
    smooth: { title: t('Smooth line'), type: 'boolean', 'x-decorator': 'FormItem', 'x-component': 'Switch' },
    stack: { title: t('Stack series'), type: 'boolean', 'x-decorator': 'FormItem', 'x-component': 'Switch' },
    donut: { title: t('Donut (pie)'), type: 'boolean', 'x-decorator': 'FormItem', 'x-component': 'Switch' },
    showLegend: {
      title: t('Show legend'),
      type: 'boolean',
      'x-decorator': 'FormItem',
      'x-component': 'Switch',
      default: true,
    },
    showLabel: { title: t('Show data labels'), type: 'boolean', 'x-decorator': 'FormItem', 'x-component': 'Switch', default: true },
    height: {
      title: t('Height (px)'),
      type: 'number',
      'x-decorator': 'FormItem',
      'x-component': 'InputNumber',
      default: 400,
      'x-component-props': { min: 100, style: { width: '100%' } },
    },

    fontFamily: {
      title: t('Font family'),
      type: 'string',
      'x-decorator': 'FormItem',
      'x-component': 'Input',
      'x-component-props': { placeholder: 'Inter, -apple-system, Arial, sans-serif' },
      description: t('Applied globally as ECharts textStyle.fontFamily.'),
    },

    nfEnabled: { title: t('Custom number format'), type: 'boolean', 'x-decorator': 'FormItem', 'x-component': 'Switch' },
    nfDecimals: {
      title: t('Decimals'),
      type: 'number',
      'x-decorator': 'FormItem',
      'x-component': 'InputNumber',
      default: 0,
      'x-component-props': { min: 0, max: 10, style: { width: '100%' } },
      'x-reactions': nfReaction,
    },
    nfThousandSep: {
      title: t('Thousands separator'),
      type: 'string',
      'x-decorator': 'FormItem',
      'x-component': 'Input',
      default: ',',
      'x-reactions': nfReaction,
    },
    nfDecimalSep: {
      title: t('Decimal separator'),
      type: 'string',
      'x-decorator': 'FormItem',
      'x-component': 'Input',
      default: '.',
      'x-reactions': nfReaction,
    },
    nfPrefix: {
      title: t('Prefix'),
      type: 'string',
      'x-decorator': 'FormItem',
      'x-component': 'Input',
      'x-component-props': { placeholder: '$' },
      'x-reactions': nfReaction,
    },
    nfSuffix: {
      title: t('Suffix'),
      type: 'string',
      'x-decorator': 'FormItem',
      'x-component': 'Input',
      'x-component-props': { placeholder: ' USD  /  %' },
      'x-reactions': nfReaction,
    },
    nfMultiplier: {
      title: t('Multiplier'),
      type: 'number',
      'x-decorator': 'FormItem',
      'x-component': 'InputNumber',
      default: 1,
      'x-component-props': { style: { width: '100%' } },
      'x-reactions': nfReaction,
    },
    nfCompact: {
      title: t('Compact (1.2K / 3.4M)'),
      type: 'boolean',
      'x-decorator': 'FormItem',
      'x-component': 'Switch',
      'x-reactions': nfReaction,
    },

    transform: {
      title: t('Transform (JavaScript)'),
      type: 'string',
      'x-decorator': 'FormItem',
      'x-component': 'Input.TextArea',
      'x-component-props': { rows: 4, placeholder: 'return data; // data = array of rows; echarts is available' },
      description: t('JS body run before rendering. Receives `data` (rows) and `echarts`. Must return an array of rows.'),
    },
    jsonStyle: {
      title: t('JSON style (ECharts option override)'),
      type: 'string',
      'x-decorator': 'FormItem',
      'x-component': 'Input.TextArea',
      'x-component-props': { rows: 6, placeholder: '{ tooltip: { valueFormatter: v => v + " %" } }' },
      description: t('A JS object literal, deep-merged over the option using ECharts native merge. Functions are allowed (e.g. custom formatters).'),
    },
  },
];

export function makeEChartsProChart(deps: { Chart: any; t?: (s: string) => string }) {
  const Chart = deps.Chart;
  const t = deps.t || ((s: string) => s);

  class EChartsPro extends Chart {
    constructor() {
      super({
        name: 'echartsPro',
        title: t('ECharts Pro'),
        Component: ProEChart,
        config: buildConfig(t),
      });
    }

    init(fields: any[], query: { measures?: any[]; dimensions?: any[] }) {
      try {
        const inferred = this.infer(fields, query);
        const yFields = inferred.yFields && inferred.yFields.length ? inferred.yFields : inferred.yField ? [inferred.yField] : [];
        return {
          general: {
            chartType: 'line',
            xField: inferred.xField ? inferred.xField.value : undefined,
            yField: yFields.map((f: any) => f.value),
            seriesField: inferred.seriesField ? inferred.seriesField.value : undefined,
            showLegend: true,
            showLabel: true,
            height: 400,
          },
        };
      } catch (e) {
        return { general: { chartType: 'line', showLegend: true, showLabel: true, height: 400 } };
      }
    }

    getProps(props: any) {
      const general = props.general || {};
      const data = Array.isArray(props.data) ? props.data.slice() : [];
      const fieldProps = props.fieldProps || {};

      const rows = applyTransform(data, general.transform);
      let option = buildOption(rows, general, fieldProps);

      if (general.fontFamily) {
        option = applyFont(option, general.fontFamily);
      }
      if (general.nfEnabled) {
        const nf: NumberFormat = {
          enabled: true,
          decimals: general.nfDecimals,
          thousandSep: general.nfThousandSep,
          decimalSep: general.nfDecimalSep,
          prefix: general.nfPrefix,
          suffix: general.nfSuffix,
          multiplier: general.nfMultiplier,
          compact: general.nfCompact,
        };
        option = applyNumberFormat(option, nf);
      }

      const jsonOption = parseJsonStyle(general.jsonStyle);
      const height = typeof general.height === 'number' ? general.height : parseInt(general.height, 10) || 400;
      return { option, jsonOption, height };
    }

    getReference() {
      return { title: t('ECharts option reference'), link: 'https://echarts.apache.org/en/option.html' };
    }
  }

  return new EChartsPro();
}
