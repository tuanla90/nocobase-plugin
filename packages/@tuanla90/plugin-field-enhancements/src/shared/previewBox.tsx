import React from 'react';
import { theme } from 'antd';

/**
 * Shared "Xem trước"/Preview surface for the widget settings dialogs. Widget settings render in a PORTAL
 * (escapes the ConfigProvider CSS scope), so the old `background: 'var(--colorFillQuaternary, #fafafa)'` +
 * `border: '1px dashed #d9d9d9'` fell back to light literals → a white box in dark mode. This reads the LIVE
 * token values via `theme.useToken()` so the box is correct in BOTH light and dark, everywhere the preview
 * shows (the widget dialog here AND when editing from a column ⚙). Pass `style` for per-widget layout
 * (flex/gap/maxWidth/padding overrides).
 */
export const PreviewBox: React.FC<{ style?: React.CSSProperties; children?: React.ReactNode }> = ({ style, children }) => {
  const { token } = theme.useToken();
  return (
    <div style={{
      padding: '10px 12px',
      background: token.colorFillQuaternary,
      borderRadius: 6,
      border: `1px dashed ${token.colorBorderSecondary}`,
      color: token.colorText,
      ...style,
    }}>
      {children}
    </div>
  );
};

export default PreviewBox;
