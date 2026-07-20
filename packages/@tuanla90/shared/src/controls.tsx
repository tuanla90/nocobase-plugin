import React from 'react';
import { Segmented } from 'antd';

/**
 * SegmentedGroup — THE standard "button group" for @tuanla90 plugins: an antd Segmented at the house
 * default size (**medium**). Use this everywhere instead of a bare `<Segmented>` (or `size="small"`)
 * so every segmented control across plugins is visually consistent. Pass `size` explicitly only to
 * deliberately deviate. All other antd Segmented props pass straight through.
 */
export type SegmentedGroupProps = React.ComponentProps<typeof Segmented>;

export const SegmentedGroup: React.FC<SegmentedGroupProps> = ({ size, ...rest }) => (
  <Segmented size={size || 'middle'} {...rest} />
);
