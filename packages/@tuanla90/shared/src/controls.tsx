import React from 'react';
import { Segmented, theme } from 'antd';

/**
 * SegmentedGroup — THE standard "button group" for @tuanla90 plugins: an antd Segmented at the house
 * default size (**medium**). Use this everywhere instead of a bare `<Segmented>` (or `size="small"`)
 * so every segmented control across plugins is visually consistent. Pass `size` explicitly only to
 * deliberately deviate. All other antd Segmented props pass straight through.
 */
export type SegmentedGroupProps = React.ComponentProps<typeof Segmented>;

export const SegmentedGroup: React.FC<SegmentedGroupProps> = ({ size, style, ...rest }) => {
  // Resolve the frame border from the live theme token — the SEG_PROPS fallback (`var(--colorBorder,#d9d9d9)`)
  // doesn't resolve inside dialog/dropdown portals, so it used to paint a bright light line in dark mode.
  const { token } = theme.useToken();
  return <Segmented size={size || 'middle'} {...rest} style={{ ...style, border: `1px solid ${token.colorBorder}` }} />;
};
