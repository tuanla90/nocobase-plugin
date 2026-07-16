# NocoBase icon architecture — provider / consumer pattern

**Purpose of this file:** teach an AI (or a developer) how to use icons correctly when building a
**new NocoBase plugin** in this workspace, so we never re-bundle an icon library per plugin.
Read this before writing any plugin that renders or lets the user pick an icon.

Verified against: NocoBase **2.1.19** host (`nb-local`), lucide-react **1.23.0**, antd **5.24.2**,
`@formily/react` **2.3.7**, `@formily/antd-v5` **1.2.3**. If versions differ, re-verify the API in
"How to verify" at the bottom before trusting the snippets.

---

## 0. The rule (TL;DR)

> **Exactly ONE plugin (`@ptdl/plugin-icon-kit`, the "provider") bundles the icon library
> (lucide-react) and registers every icon into NocoBase's shared icon registry.
> EVERY other plugin is a "consumer": it renders/picks icons through that registry and
> NEVER imports lucide-react (or any icon library) itself.**

- ✅ DO: `import { Icon, icons } from '@nocobase/client-v2'` and render `<Icon type="lucide-check" />`.
- ❌ DON'T: `import * as Lucide from 'lucide-react'` in a new plugin. That silently bundles the whole
  ~745 KB library into your plugin, again.

---

## 1. The problem this solves

Each NocoBase plugin is built as its **own separate bundle**. The build marks the *framework* libs as
**external** (shared from the host at runtime) but **bundles everything else**. `lucide-react` is NOT a
framework lib and the host does **not** ship it — so **every plugin that imports lucide inlines its own
full copy**. Worse: `import * as Lucide` + dynamic `Lucide[name]` **defeats tree-shaking**, so the
*entire* library is bundled even if you use 5 icons.

Measured in this workspace:

| Plugin | Bundles lucide? | Built client bundle |
|---|---|---|
| Old "merged" plugin (icons + conditional-format together) | yes | **~745 KB** |
| `@ptdl/plugin-conditional-format` after the split (consumer) | **no** | **~20 KB** |

So with N icon-using plugins each importing lucide, the browser downloads **N × ~168 KB gzip** of the
*same* library. The provider/consumer pattern collapses that to **1 copy total**.

---

## 2. The solution: NocoBase's shared icon registry

NocoBase has a process-wide icon registry. The provider fills it once; consumers read from it.

```
@ptdl/plugin-icon-kit (PROVIDER)                     any CONSUMER plugin
  bundles lucide-react (~745 KB, once)                 bundles NO icon lib (~20 KB)
  registerIcon('lucide-check', <comp>)  ─────►  icons: Map<string, Component>  ◄─────  reads keys + renders
                                                   ├─ antd icons (core, ALWAYS present)
                                                   └─ lucide-* (only if provider installed)
                                                          │
                                          <Icon type="lucide-check" />  renders by key
```

Key consequences:
- **antd icons are always in the registry** (NocoBase core registers them). So a consumer's icon picker
  works **even without the provider** — it just shows the Ant Design set instead of Lucide. This is the
  built-in graceful fallback; you get it for free.
- The provider adds the **Lucide** set on top. Install it and consumers instantly see ~1990 more icons.
- Consumers depend on the **registry**, not on the provider's code. No build-time coupling.

---

## 3. The registry API (exported by BOTH client lanes)

`@nocobase/client` (classic v1) **and** `@nocobase/client-v2` (modern v2, the `/v/` FlowEngine pages)
each export:

```ts
export declare const icons: Map<string, any>;          // the shared registry
export declare function registerIcon(type: string, icon?: any): void;
export declare function hasIcon(type: string): boolean;
export declare function registerIcons(components: any): void;
export declare const Icon: (props: { type: string; [k: string]: any }) => JSX.Element; // renders by key
```

**Lane rule (important):** `@nocobase/client` and `@nocobase/client-v2` have their **own separate**
`icons` Map. So within one page the provider and the consumer must use the **same lane's** `registerIcon`
/ `icons` / `Icon`. In practice: register and read via **`@nocobase/client-v2`** for Modern (v2) pages
(the default here), and additionally via `@nocobase/client` if you also support Classic (v1) pages. The
provider registers on both lanes; a consumer imports `Icon`/`icons` from the lane its code runs in.

---

## 4. The key contract: `lucide-<kebab>`

The provider registers each lucide icon under the key **`lucide-` + kebab-case name**:

| lucide component | registry key |
|---|---|
| `Check` | `lucide-check` |
| `ShoppingCart` | `lucide-shopping-cart` |
| `CircleCheck` | `lucide-circle-check` |

The `lucide-` **prefix is the contract** every consumer relies on:
- render: `<Icon type="lucide-shopping-cart" />`
- list the lucide set: `[...icons.keys()].filter(k => k.startsWith('lucide-'))`
- list the antd set: `[...icons.keys()].filter(k => !k.startsWith('lucide-'))`

Store the **registry key** (e.g. `"lucide-shopping-cart"`) as the saved value in your config — never a
bare lucide component name. That value is what you pass to `<Icon type={...} />` and it works whether the
icon is Lucide or Ant Design.

---

## 5. Recipe — writing a CONSUMER plugin (the common case)

> Canonical example to copy from:
> `build-env/packages/plugins/@ptdl/plugin-conditional-format/src/shared/conditionalModel.tsx`

### 5a. Render an icon by key — zero icon-lib import

```tsx
import React from 'react';
// Icon comes from the lane your code runs in (v2 shown). Passed in from the plugin's load(), see 5d.
function IconByKey({ Icon, type }: { Icon: any; type?: string }) {
  if (!type || !Icon) return null;
  return React.createElement(Icon, { type }); // <Icon type="lucide-check" /> — sizes to 1em (font-size)
}
```

### 5b. A registry-driven icon picker (Formily field) — self-adapting, no lucide

Value = registry key string. Lists whatever is registered, grouped Lucide + Ant Design. If the provider
is absent, the Lucide group is simply empty and only Ant Design shows — no branching needed.

```tsx
import React from 'react';
import { Button, Input, Popover } from 'antd';

// `Icon` and `icons` are injected once (see 5d); here shown as module vars for brevity.
let IconComp: any = null;
let iconsMap: Map<string, any> | null = null;

function RegistryIconPicker(props: any) {
  const { value, onChange } = props;
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState('');
  const keys = iconsMap ? [...iconsMap.keys()] : [];
  const ql = q.trim().toLowerCase();
  const match = (k: string) => k.toLowerCase().includes(ql);
  const lucide = keys.filter(k => k.startsWith('lucide-') && match(k)).sort();
  const antd   = keys.filter(k => !k.startsWith('lucide-') && match(k)).sort();
  const CAP = 96; // never render thousands of icons at once — cap + rely on search

  const grid = (title: string, ks: string[]) => ks.length ? (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 12, color: '#888' }}>{title} ({ks.length})</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8,1fr)', gap: 4 }}>
        {ks.slice(0, CAP).map(k => (
          <button key={k} type="button" title={k}
            onClick={() => { onChange?.(k); setOpen(false); }}
            style={{ height: 30, fontSize: 18, border: k === value ? '1px solid #1677ff' : '1px solid transparent',
                     borderRadius: 6, background: 'transparent', cursor: 'pointer' }}>
            {IconComp ? React.createElement(IconComp, { type: k }) : null}
          </button>
        ))}
      </div>
      {ks.length > CAP ? <div style={{ fontSize: 12, color: '#999' }}>+{ks.length - CAP} more — type to narrow</div> : null}
    </div>
  ) : null;

  return (
    <Popover open={open} onOpenChange={setOpen} trigger="click" placement="bottomLeft" content={
      <div style={{ width: 340 }}>
        <Input size="small" allowClear placeholder="Search… e.g. cart, check" value={q}
               onChange={(e: any) => setQ(e.target.value)} />
        <div style={{ maxHeight: 260, overflow: 'auto' }}>{grid('Lucide', lucide)}{grid('Ant Design', antd)}</div>
      </div>
    }>
      <Button size="small" title={value || 'Select icon'}>
        {value && IconComp ? React.createElement(IconComp, { type: value }) : '＋'}
      </Button>
    </Popover>
  );
}
```

### 5c. Build config — a consumer bundles (almost) nothing

Because you import only external libs, the bundle is tiny (~20 KB). In the plugin's build script, stub
every external at the **host's exact version** so `dist/externalVersion.js` matches at runtime:

```bash
# run-<plugin>-build.sh — externals only, ZERO bundled deps
mkstub react 18.3.1
mkstub react-dom 18.3.1
mkstub antd 5.24.2
mkstub "@nocobase/client" 2.1.19
mkstub "@nocobase/client-v2" 2.1.19
mkstub "@nocobase/flow-engine" 2.1.19
mkstub "@nocobase/server" 2.1.19
mkstub "@formily/antd-v5" 1.2.3   # only if you use ArrayTable / other @formily/antd-v5 components
mkstub "@formily/react" 2.3.7     # only if you use observer / useForm / useField
node "$NM/@nocobase/build/bin/nocobase-build.js" "@ptdl/<plugin>" --tar --no-dts
```

`package.json` should have **empty `dependencies`** (nothing to bundle). If you ever add a real
runtime dep that must be bundled, ask whether it belongs in a shared provider instead.

### 5d. Wire it up in the plugin's `load()` (inject `Icon` + `icons`)

```tsx
// src/client-v2/index.tsx  (Modern v2 lane)
import { Plugin, DisplayTextFieldModel, Icon, icons } from '@nocobase/client-v2';
import { CollectionFieldModel, tExpr } from '@nocobase/flow-engine';
import { ColorPicker } from 'antd';
import { registerMyModel } from '../shared/myModel';

export class MyPluginClientV2 extends Plugin {
  async load() {
    const fe = (this as any).flowEngine;
    registerMyModel({ flowEngine: fe, flowSettings: fe?.flowSettings, Icon, icons, tExpr /* … */ });
  }
}
export default MyPluginClientV2;
```

Register `RegistryIconPicker` into the flow-settings scope so a uiSchema can reference it:
`fe.flowSettings.registerComponents({ RegistryIconPicker })`, then use
`'x-component': 'RegistryIconPicker'` on your icon field.

---

## 6. The PROVIDER (reference only — you rarely touch this)

> Canonical file: `build-env/packages/plugins/@ptdl/plugin-icon-kit/src/shared/iconKit.tsx`

It bundles lucide-react and registers the set. The essence:

```tsx
import * as Lucide from 'lucide-react'; // the ONLY place this import is allowed
const toKebab = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/[_\s]+/g, '-').toLowerCase();
const makeIcon = (C: any) => (p: any) => React.createElement(C, { ...p, width: '1em', height: '1em', fill: 'none', stroke: 'currentColor' });

export function registerLucideIcons(registerIcon: (type: string, icon: any) => void): number {
  let n = 0;
  for (const name of getAllLucideNames()) {                 // ~1990 canonical icons
    registerIcon(`lucide-${toKebab(name)}`, makeIcon(Lucide[name])); // KEY = lucide-<kebab>
    n++;
  }
  return n;
}
```

Its `client` + `client-v2` `load()` each call `registerLucideIcons(registerIcon)` — nothing else. To
extend the set you edit only this one plugin and rebuild it; every consumer benefits with no changes.

---

## 7. NocoBase build & packaging rules (why the pattern works)

- **External (host-provided, 0 KB in your bundle):** `@nocobase/*`, `@formily/*`, `react`, `react-dom`,
  `antd`, `@ant-design/icons`. `@nocobase/build` externalizes these by scope automatically.
- **Bundled (adds to your size):** anything else you `import` (lucide-react, markdown-it, …). This is
  exactly why only ONE plugin should own lucide.
- **Cross-plugin imports don't help:** `import … from '@ptdl/plugin-icon-kit'` is NOT external, so it
  would bundle that code into your plugin. Share via the **runtime registry**, not imports.
- **Root stubs:** the build only emits a `client`/`client-v2` lane if a root `client.js`/`client-v2.js`
  exists in source (`module.exports = require('./dist/<lane>/index.js')` + a `.d.ts`). `--tar` may strip
  them; re-add them at install. The server's `pm:listEnabledV2` needs root `client-v2.js` to show the
  plugin on Modern (v2) pages.
- **Install:** copy the built package into BOTH `nb-local/node_modules/<pkg>` and
  `nb-local/storage/plugins/<pkg>` (copy `dist` **excluding** `dist/node_modules` — the client bundle
  already inlines its deps and the deep paths blow Windows MAX_PATH), then
  `yarn nocobase pm add <pkg>` + `pm enable <pkg>`.

---

## 8. Gotchas (learned the hard way)

- **`import * as X` kills tree-shaking.** Dynamic `X[name]` forces the whole library into the bundle.
  Only the provider may do this (for lucide); consumers must not.
- **Two separate `icons` Maps.** `@nocobase/client` vs `@nocobase/client-v2` don't share the Map — use
  the same lane for register + read on a given page (v2 for Modern pages here).
- **`tExpr('X')` returns the string `{{t("X")}}`.** NocoBase evaluates it only at the **schema** level
  (Formily `title:` and `x-component-props`). If you drop `tExpr('X')` as a **raw React child** inside a
  custom component's render, it shows literally `{{t("X")}}`. Use plain strings for in-component labels.
- **Don't render thousands of icons at once.** The registry can hold ~2000+ entries; a picker must cap
  the grid (e.g. 96) and rely on search, or the popover jank.
- **Version-match externals.** Stub each external at the host's exact version so `externalVersion.js`
  doesn't trigger a runtime mismatch warning.

---

## 9. Checklist for a NEW icon-using plugin

1. [ ] Does it render or pick icons? → it's a **consumer**. Do not import any icon library.
2. [ ] Import `Icon`, `icons` from the lane you run in (`@nocobase/client-v2` for Modern pages).
3. [ ] Render via `<Icon type={key} />`; store the **registry key** as the value.
4. [ ] Need a picker? Reuse the `RegistryIconPicker` pattern (§5b) — it self-adapts to the registry.
5. [ ] Build script stubs externals only; `dependencies: {}`; bundle should be tens of KB, not hundreds.
6. [ ] Add root stubs (`client.js`/`client-v2.js`/`server.js` + `.d.ts`); re-add after `--tar`.
7. [ ] Grep your built bundle to confirm no icon lib leaked: it must NOT contain lucide component names.

---

## 10. Canonical examples & how to verify the API

- **Provider:** `build-env/packages/plugins/@ptdl/plugin-icon-kit/src/shared/iconKit.tsx`
- **Consumer:** `build-env/packages/plugins/@ptdl/plugin-conditional-format/src/shared/conditionalModel.tsx`
  and its `src/client(-v2)/index.tsx` (shows the `Icon` + `icons` injection).

Before trusting the API on a new host version, verify it still exists:

```bash
# Icon + icons still exported by client-v2?
grep -nE "export .*(Icon|icons|registerIcon)" \
  nb-local/node_modules/@nocobase/client-v2/es/components/Icon.d.ts

# Is lucide-react absent from the host? (if present, it could instead be externalized)
ls nb-local/node_modules/lucide-react 2>/dev/null || echo "not in host → must be bundled by the provider"
```

---

## Appendix — non-React icon consumers (e.g. ECharts)

`<Icon type>` returns a React element, which fits tables, forms, menus, cell renderers. Some libraries
(**ECharts**) need an SVG `path://` string or a data-URL image, not React. For those, the **provider**
should expose a small runtime helper (e.g. `getIconSvg(key): string`) rather than each consumer pulling
in lucide. Until that helper exists, keep icon usage to `<Icon type>` contexts.
