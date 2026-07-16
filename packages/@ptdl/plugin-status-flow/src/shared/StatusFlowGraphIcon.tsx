import React from 'react';
import { Popover } from 'antd';
import { RegistryIcon } from './iconRegistry';
import { StatusFlowGraphPreview } from './StatusFlowGraphPreview';
import { StatusFlowConfig, rowsFromField } from './types';

const InfoGlyph: React.FC = () => (
  <RegistryIcon
    type="lucide-workflow"
    fallback="NodeIndexOutlined"
    style={{ fontSize: 15, opacity: 0.55, cursor: 'pointer' }}
  />
);

// Small ⓘ that opens the flow diagram in a popover, highlighting the current status.
export const StatusFlowGraphIcon: React.FC<{
  enumOptions: any[];
  flow: StatusFlowConfig;
  current?: any;
}> = ({ enumOptions, flow, current }) => (
  <Popover
    trigger={['hover', 'click']}
    placement="right"
    content={
      <div style={{ maxWidth: 640 }}>
        <StatusFlowGraphPreview
          rows={rowsFromField(enumOptions, flow)}
          initial={flow.initial}
          current={current == null || current === '' ? undefined : String(current)}
        />
      </div>
    }
  >
    <span onClick={(e) => e.stopPropagation()} style={{ lineHeight: 1, flexShrink: 0 }}>
      <InfoGlyph />
    </span>
  </Popover>
);
