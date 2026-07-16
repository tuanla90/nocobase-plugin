import { Plugin } from '@nocobase/server';

/**
 * ECharts Pro is a client-only chart type that plugs into the existing
 * Data Visualization plugin. The server side is intentionally a no-op:
 * the data query is handled by @nocobase/plugin-data-visualization.
 */
export class PluginDataVisualizationEChartsProServer extends Plugin {
  async load() {}
}

export default PluginDataVisualizationEChartsProServer;
