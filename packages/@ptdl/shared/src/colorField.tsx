import React from 'react';
import { ColorPicker } from 'antd';
import { COLOR_PRESETS, colorToString } from './color';

/**
 * Canonical antd ColorPicker wrapper: 16-preset palette + safe value->string normalize.
 * Replaces the ~12 per-plugin ColorField clones. Props pass through to antd ColorPicker.
 *  - emptyValue: what onChange emits when cleared (default undefined; pass "" for callers that want '').
 *  - allowAlpha: keep rgba() when opacity < 100% (login-lite theme colors). Default off = hex only,
 *    and the alpha slider is hidden so hex fields don't offer a transparency that gets dropped.
 *  - size defaults to "small" for a tight, consistent trigger; override via props.
 */
export function ColorField(props: any) {
  const {
    value, onChange, allowClear = true, showText = true, disabled,
    emptyValue, allowAlpha = false, size = 'small', ...rest
  } = props;

  const emit = (c: any) => {
    if (!c) { onChange?.(emptyValue); return; }
    if (typeof c === 'string') { onChange?.(c); return; }
    if (allowAlpha) {
      const rgb = c.toRgb?.();
      const a = rgb && typeof rgb.a === 'number' ? rgb.a : 1;
      if (a < 1) { onChange?.(`rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})`); return; }
    }
    onChange?.(colorToString(c) ?? emptyValue);
  };

  return (
    <ColorPicker
      value={value || undefined}
      presets={COLOR_PRESETS as any}
      allowClear={allowClear}
      showText={showText}
      disabled={disabled}
      size={size}
      disabledAlpha={!allowAlpha}
      onChange={emit}
      onClear={() => onChange?.(emptyValue)}
      {...rest}
    />
  );
}
