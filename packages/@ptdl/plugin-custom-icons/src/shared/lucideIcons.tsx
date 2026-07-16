import React from 'react';
import * as Lucide from 'lucide-react';

/**
 * Registers the FULL lucide-react icon set into a NocoBase icon registry.
 *
 * lucide is fully bundled either way (`import *` defeats tree-shaking), so registering
 * every icon costs ~0 extra download vs a curated subset.
 *
 * KEYS — each icon is registered under TWO keys on purpose:
 *   1) `lucide-<kebab>outlined`  → the /v/ (modern) & classic IconPicker groups icons into
 *      Outlined/Filled/TwoTone tabs by suffix (app bundle: groupBy(k => k.endsWith("outlined")…)).
 *      Only keys ending with one of those suffixes appear in the picker. These land in "Outlined"
 *      and are searchable (the picker strips the suffix for the label).
 *   2) `lucide-<kebab>`          → stable programmatic contract for consumer plugins
 *      (conditional-format, computed-field, …) that reference icons by name without a theme suffix.
 *   Both keys map to the same component, so a visible duplicate never appears in the picker
 *   (the no-suffix key falls into the un-rendered `undefined` group).
 */

const NON_ICON = new Set(['Icon', 'createLucideIcon', 'icons']);

function getAllLucideNames(): string[] {
  const out: string[] = [];
  for (const k of Object.keys(Lucide as any)) {
    if (!/^[A-Z]/.test(k)) continue;
    if (k === 'Icon' || k.endsWith('Icon')) continue; // skip generic + <Name>Icon aliases
    if (k.startsWith('Lucide')) continue; // skip Lucide<Name> aliases
    if (NON_ICON.has(k)) continue;
    const v = (Lucide as any)[k];
    if (v && (typeof v === 'function' || (typeof v === 'object' && (v as any).$$typeof))) out.push(k);
  }
  return out.sort();
}

const toKebab = (s: string) =>
  s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/[_\s]+/g, '-').toLowerCase();

/** Render lucide directly (no antd <Icon> wrapper) → crisp outline inheriting currentColor.
 *  AntD's <Icon> forces svg `fill: currentColor` via CSS which fills lucide's stroke-based
 *  icons into solid blobs; explicit fill="none" + stroke="currentColor" keeps the outline. */
const makeIcon = (Comp: any) => (props: any) =>
  React.createElement(Comp, { ...props, width: '1em', height: '1em', fill: 'none', stroke: 'currentColor' });

/**
 * Register the full lucide set into a NocoBase icon registry.
 * Pass the `registerIcon` of the target client:
 *   - classic:   from '@nocobase/client'
 *   - client-v2: from '@nocobase/client-v2'
 * Returns the number of ICONS registered (not keys).
 */
export function registerLucideIcons(registerIcon: (type: string, icon: any) => void): number {
  let n = 0;
  for (const name of getAllLucideNames()) {
    const Comp = (Lucide as any)[name];
    if (!Comp) continue;
    const icon = makeIcon(Comp);
    const kebab = toKebab(name);
    registerIcon(`lucide-${kebab}outlined`, icon); // visible in picker (Outlined tab)
    registerIcon(`lucide-${kebab}`, icon); // programmatic contract alias
    n++;
  }
  return n;
}
