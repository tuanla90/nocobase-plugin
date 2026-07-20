/** v1 (classic page) entry. */
import { Plugin } from '@nocobase/client';
// @nocobase/plugin-data-visualization is an OPTIONAL peer — this plugin extends it, but if data-viz is
// disabled on an instance, a plain `import DataVisualizationClient, { Chart }` can crash the whole client
// bundle (reading `.default`/`.Chart` off an absent module namespace). Import defensively: a missing peer
// → both consts are `undefined` → the runtime `if (!dv) return` below no-ops cleanly instead of crashing.
import * as dataVizMod from '@nocobase/plugin-data-visualization/client';
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
      console.warn('[echarts-pro] @nocobase/plugin-data-visualization (v1) not found/disabled; chart not registered');
      return;
    }
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
