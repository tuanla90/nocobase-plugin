# Color picker — house standard

Every place in an `@tuanla90` plugin where a user picks a **colour** must use the same component and
palette, so the UI feels consistent across plugins (like the header search, PWA, custom-header,
conditional-format, field styles, etc.).

## The standard

Use the antd **`ColorPicker`** with:

- `showText` — show the hex value next to the swatch,
- `allowClear` — when an empty/unset colour is meaningful (optional colours),
- `presets={COLOR_PRESETS}` — the shared preset palette (see below),
- store the value as a **hex string** (`#rrggbb`), not the antd `Color` object.

Do **not** use the native `<input type="color">` or hand-rolled pickers.

## The shared palette

Each plugin keeps a copy of the palette at **`src/shared/colorPresets.ts`** (plugins are built as
independent packages, so the constant is duplicated rather than imported across packages — keep the
values identical to this file):

```ts
export const COLOR_PRESETS = [
  {
    label: 'Presets',
    colors: [
      '#1677ff', '#2f54eb', '#722ed1', '#eb2f96', '#f5222d', '#fa541c', '#fa8c16', '#faad14',
      '#a0d911', '#52c41a', '#13c2c2', '#000000', '#595959', '#ffffff',
    ],
  },
];
```

Import it with the correct relative path (`./colorPresets` from `src/shared/`, `../shared/colorPresets`
from `src/client/` or `src/client-v2/`).

## Usage

### Plain JSX

```tsx
import { ColorPicker } from 'antd';
import { COLOR_PRESETS } from '../shared/colorPresets';

<ColorPicker
  showText
  allowClear
  presets={COLOR_PRESETS}
  value={value || undefined}
  onChange={(c: any) =>
    onChange?.(!c ? undefined : typeof c === 'string' ? c : c?.toHexString?.())
  }
/>
```

The `typeof c === 'string' ? c : c?.toHexString?.()` guard keeps a plain hex string in state whether
antd hands back a string or a `Color` object, and `!c ? undefined` supports `allowClear`. If the field
is required (never cleared), drop `allowClear` and the `!c` branch and use `c.toHexString()`.

### Injected / registered component

Some plugins don't import `ColorPicker` directly — they receive it as a prop or register it as a
Formily component, to keep a shared file free of `@nocobase/client*` imports (see
[NOCOBASE-PLUGIN-BUILD-GUIDE.md](./NOCOBASE-PLUGIN-BUILD-GUIDE.md) on the two-lane split). In that
case add the presets where the element is created:

```ts
// custom-header: AntdColorPicker is antd's ColorPicker, passed in from each lane's index.
React.createElement(AntdColorPicker, { showText: true, presets: COLOR_PRESETS, ...rest });
```

## Where it's used

Plugins with colour pickers (all standardized to the above):

- `@tuanla90/plugin-pwa` — theme / background colour.
- `@tuanla90/plugin-custom-header` — title colour, header/tab/block background (Formily `ChColorPicker`).
- `@tuanla90/plugin-conditional-format` — cell / text / background colours.
- `@tuanla90/plugin-field-enhancements` — colours for star / progress / boolean / link / select-buttons /
  number / input-icon field models.
- `@tuanla90/plugin-menu-badge` — badge colour.
- `@tuanla90/plugin-filter-tree` — node / accent colour.
- `@tuanla90/plugin-login-lite` — theme / font / button colours.

## Adding a new colour field

1. Copy `src/shared/colorPresets.ts` into the plugin if it isn't there.
2. Render antd `ColorPicker` with `showText presets={COLOR_PRESETS}` (+ `allowClear` if optional).
3. Store the hex string via the `onChange` guard above.

_Palette changes: edit every plugin's `colorPresets.ts` (keep them identical) and rebuild those
plugins. There is intentionally no cross-package shared module because each plugin ships as its own
UMD bundle._
