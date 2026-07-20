/** v2 (FlowEngine / Modern page) entry. */
import { Plugin } from '@nocobase/client-v2';
// @nocobase/plugin-data-visualization is an OPTIONAL peer (see the v1 lane note) — import defensively so a
// disabled data-viz degrades to "chart not registered" instead of crashing the whole /v/ bundle.
import * as dataVizMod from '@nocobase/plugin-data-visualization/client-v2';
const DataVisualizationClient: any = (dataVizMod as any)?.default;
const Chart: any = (dataVizMod as any)?.Chart;
import { makeEChartsProChart } from '../common/makeChart';
import { enumValueFormatter } from '../common/buildOption';
import viVN from '../locale/vi-VN.json';

const NS = '@tuanla90/plugin-data-visualization-echarts-pro/client';

export class PluginDataVisualizationEChartsProClient extends Plugin {
  async load() {
    try {
      this.app.i18n.addResources('vi-VN', NS, viVN);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[echarts-pro] i18n addResources failed', e);
    }
    const t = (s: string) => this.app.i18n.t(s, { ns: NS });
    const dv: any = DataVisualizationClient ? this.app.pm.get(DataVisualizationClient) : null;
    if (!dv || !dv.charts) {
      // eslint-disable-next-line no-console
      console.warn('[echarts-pro] @nocobase/plugin-data-visualization (v2) not found/disabled; chart not registered');
      return;
    }

    // Teach data-viz how to label a `statusFlow` field (a custom interface it has no transformer for) →
    // EVERY chart (core + pro) + filter shows "Đang giao" instead of the stored "dang_giao". Global.
    try {
      dv.registerFieldInterfaceConfig?.('statusFlow', { valueFormatter: enumValueFormatter });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[echarts-pro] registerFieldInterfaceConfig(statusFlow) failed', e);
    }
    dv.charts.addGroup('echartsPro', {
      title: 'ECharts Pro',
      charts: [makeEChartsProChart({ Chart, t })],
      sort: 1,
    });
  }
}

export default PluginDataVisualizationEChartsProClient;
