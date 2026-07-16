# @ptdl/plugin-custom-icons

Registers a **curated set of ~100 Lucide icons** into the NocoBase (v2.1.x) icon
picker — for both the **classic** client and **client-v2** (Modern pages).

## Why curated (not the full library)

The v2 icon picker renders **all** registered icons in the active tab at once (no
lazy loading / no top-N limit). Dumping ~1,500 Lucide icons would make the picker
lag. So we register a hand-picked ~100 (10 per group) that cover common needs.

## How the icons appear

- The v2 picker groups icons into **Outlined / Filled / TwoTone** tabs by a name
  suffix. Custom icons therefore MUST end with `outlined` to show up — this plugin
  registers each as `lucide-<name>outlined`, so they land in the **Outlined** tab.
- They are **searchable by name** (e.g. type `cart` → finds `lucide-shopping-cart`,
  or type `lucide` to list them all).

## Add / remove icons later

Edit the list in [`src/shared/lucideIcons.tsx`](src/shared/lucideIcons.tsx):
append the exact **lucide-react component name** (PascalCase, e.g. `TruckIcon` →
just `Truck`) to any group, then rebuild. Names that don't exist in the installed
lucide version are skipped silently (a wrong name won't break the build).

## Files

```
src/
├─ index.ts                 re-exports the server plugin (package main)
├─ server/index.ts          empty server Plugin (required to be installable)
├─ shared/lucideIcons.tsx   the curated list + registerLucideIcons() helper
├─ client/index.tsx         classic entry  -> registerIcon from @nocobase/client
└─ client-v2/index.tsx      Modern-page entry -> registerIcon from @nocobase/client-v2
```

The v2 client has its **own** icon registry (separate from `@nocobase/client`),
which is why both entries exist and each registers into its own registry.

## Build

Source only — build with `@nocobase/build` (`--no-dts`) in the build session:

- **Bundled** (install for real): `lucide-react`.
- **External** (versions only): `@nocobase/client`, `@nocobase/client-v2`,
  `@nocobase/server`, `@ant-design/icons`, `react`.
- Flow: `npm install` → `@nocobase/build --no-dts` → `dist/` + `<name>-<version>.tgz`
  into `D:\Users\tuanla2\Documents\nocobase-plugin-build\` → Plugin Manager →
  Add from local → Enable.

Note: `import * as Lucide` bundles the whole lucide-react (~1.5 MB) even though only
~100 are registered; the **picker stays fast** (only ~100 rendered). To also shrink
the bundle, switch `src/shared/lucideIcons.tsx` to named imports of just the used
icons.

## Test after install

1. On a Modern (v2) page, open any icon picker → **Outlined** tab.
2. Search `lucide` (or `cart`, `user`, `truck`…) → the curated icons appear and are
   selectable.
