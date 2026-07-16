/** v1 (classic page) entry. */
import { Plugin } from '@nocobase/client';
import DataVisualizationClient, { Chart } from '@nocobase/plugin-data-visualization/client';
import { makeEChartsProChart } from '../common/makeChart';
import viVN from '../locale/vi-VN.json';

const NS = '@ptdl/plugin-data-visualization-echarts-pro/client';

export class PluginDataVisualizationEChartsProClient extends Plugin {
  async load() {
    try {
      this.app.i18n.addResources('vi-VN', NS, viVN);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[echarts-pro] i18n addResources failed', e);
    }
    const t = (s: string) => this.app.i18n.t(s, { ns: NS });
    const dv: any = this.app.pm.get(DataVisualizationClient);
    if (!dv || !dv.charts) {
      // eslint-disable-next-line no-console
      console.warn('[echarts-pro] @nocobase/plugin-data-visualization (v1) not found; chart not registered');
      return;
    }
    dv.charts.addGroup('echartsPro', {
      title: 'ECharts Pro',
      charts: [makeEChartsProChart({ Chart, t })],
      sort: 1,
    });
  }
}

export default PluginDataVisualizationEChartsProClient;
