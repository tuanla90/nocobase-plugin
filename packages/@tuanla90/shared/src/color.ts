/**
 * Canonical antd ColorPicker preset palette.
 * (Was copy-pasted byte-identical into 7+ plugins as `colorPresets.ts`.)
 */
export const COLOR_PRESETS = [
  {
    label: 'Presets',
    colors: [
      '#1677ff', '#2f54eb', '#722ed1', '#eb2f96', '#f5222d', '#fa541c', '#fa8c16', '#faad14',
      '#fadb14', '#a0d911', '#52c41a', '#13c2c2', '#000000', '#595959', '#bfbfbf', '#ffffff',
    ],
  },
];

/**
 * Safe antd ColorPicker value → string: passes plain strings through, else
 * falls back to hex, then rgb. Returns undefined for empty input.
 * (Canonical replacement for the ~13 inline `c ? c.toHexString() : …` copies.)
 */
export function colorToString(c: any): string | undefined {
  if (!c) return undefined;
  if (typeof c === 'string') return c;
  return c?.toHexString?.() ?? c?.toRgbString?.();
}

/** Ordered antd Tag color names (for color pickers). */
export const TAG_COLORS = [
  'default', 'magenta', 'red', 'volcano', 'orange', 'gold', 'yellow',
  'lime', 'green', 'cyan', 'blue', 'geekblue', 'purple',
];

/**
 * Canonical antd Tag color name → hex, unified on the **primary-6** palette
 * (matches NocoBase core select enum colors). Replaces the divergent per-plugin
 * maps (status-flow TAG_HEX / field-enhancements PRESET_HEX / spreadsheet ANTD_TAG).
 */
export const TAG_HEX: Record<string, string> = {
  default: '#8c8c8c',
  gray: '#8c8c8c',
  magenta: '#eb2f96',
  red: '#f5222d',
  volcano: '#fa541c',
  orange: '#fa8c16',
  gold: '#faad14',
  yellow: '#fadb14',
  lime: '#a0d911',
  green: '#52c41a',
  cyan: '#13c2c2',
  blue: '#1677ff',
  geekblue: '#2f54eb',
  purple: '#722ed1',
};

/** Resolve a Tag color (name or raw #/rgb) to a hex string; unknown → default gray. */
export function tagColorToHex(color?: string): string {
  if (!color) return TAG_HEX.default;
  if (TAG_HEX[color]) return TAG_HEX[color];
  if (/^#|^rgb/i.test(color)) return color;
  return TAG_HEX.default;
}
