/**
 * Lane-agnostic React renderer. Creates one ECharts instance on a div and
 * keeps it in sync with the `option` prop. The `jsonOption` prop is applied
 * as a SECOND setOption call so ECharts performs its native, component-wise
 * deep merge over the base option (the JSON-style escape hatch).
 */
import React, { useEffect, useRef } from 'react';
import * as echarts from 'echarts';

export const ProEChart: React.FC<any> = (props) => {
  const { option, jsonOption, height } = props || {};
  const elRef = useRef<HTMLDivElement>(null);
  const instRef = useRef<any>(null);

  // Create / dispose the chart instance once.
  useEffect(() => {
    if (!elRef.current) return;
    const inst = echarts.init(elRef.current);
    instRef.current = inst;
    let ro: any;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => {
        try {
          inst.resize();
        } catch (e) {
          /* ignore */
        }
      });
      ro.observe(elRef.current);
    }
    return () => {
      if (ro) ro.disconnect();
      inst.dispose();
      instRef.current = null;
    };
  }, []);

  // Re-apply options whenever they change.
  useEffect(() => {
    const inst = instRef.current;
    if (!inst) return;
    try {
      inst.setOption(option || {}, true);
      if (jsonOption && typeof jsonOption === 'object') {
        inst.setOption(jsonOption);
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[echarts-pro] setOption failed', e);
    }
  }, [option, jsonOption]);

  const h = typeof height === 'number' ? height : parseInt(height, 10) || 400;
  return <div ref={elRef} style={{ width: '100%', height: h }} />;
};

export default ProEChart;
