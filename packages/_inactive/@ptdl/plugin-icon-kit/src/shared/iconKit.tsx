import React from 'react';
import * as Lucide from 'lucide-react';

/**
 * @ptdl/plugin-icon-kit — ICON PROVIDER (the ONLY plugin that ships lucide-react).
 *
 * It registers the full lucide set into NocoBase's shared icon registry under stable
 * `lucide-<kebab>` keys (e.g. `lucide-shopping-cart`, `lucide-circle-check`). Any other
 * plugin then renders them with `<Icon type="lucide-..." />` and enumerates them with
 * `[...icons.keys()].filter(k => k.startsWith('lucide-'))` — WITHOUT bundling lucide.
 *
 * The `lucide-` prefix is the contract: it lets every consumer library (conditional
 * formatting, echarts, html-chart, table-cell-style, …) find the lucide set generically.
 */

// ========================= SINGLE SOURCE OF TRUTH =========================
// Curated fallback list (only used when REGISTER_ALL_LUCIDE = false).
export const LUCIDE_NAMES: string[] = [
  'ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ChevronUp','ChevronDown','ChevronLeft','ChevronRight','RefreshCw','RotateCcw',
  'ShoppingCart','ShoppingBag','Package','PackageCheck','Truck','Receipt','Tag','Store','Barcode','Gift',
  'DollarSign','Wallet','Banknote','Coins','CreditCard','PiggyBank','TrendingUp','TrendingDown','Calculator','Percent',
  'User','Users','UserPlus','UserCheck','UserX','UserCog','UserMinus','Contact','IdCard','CircleUser',
  'File','FileText','FileCheck','FilePlus','FileSpreadsheet','Folder','FolderOpen','ClipboardList','Paperclip','Files',
  'Plus','Minus','Check','X','Pencil','Trash2','Search','Filter','Settings','Save',
  'CircleCheck','CircleX','CircleAlert','TriangleAlert','Info','Bell','Clock','Ban','ShieldCheck','CircleHelp',
  'Mail','Phone','MessageSquare','MessageCircle','Send','Share2','Inbox','AtSign','PhoneCall','Reply',
  'Warehouse','Boxes','Container','MapPin','Ship','Plane','Route','Forklift','Anchor','Map',
  'Image','Camera','Video','Calendar','Home','Star','Heart','Bookmark','Eye','Printer',
];
// =========================================================================

// true  → register EVERY icon lucide-react ships (~1990). lucide is fully bundled either
//         way (import * defeats tree-shaking), so this costs ~0 extra download.
// false → register only the curated LUCIDE_NAMES set above.
export const REGISTER_ALL_LUCIDE = true;

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

export const ICON_SET: string[] = REGISTER_ALL_LUCIDE ? getAllLucideNames() : LUCIDE_NAMES;

const toKebab = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/[_\s]+/g, '-').toLowerCase();

// Render lucide directly (no antd wrapper) → crisp outline inheriting currentColor.
const makeIcon = (Comp: any) => (props: any) =>
  React.createElement(Comp, { ...props, width: '1em', height: '1em', fill: 'none', stroke: 'currentColor' });

/**
 * Register the lucide set into a NocoBase icon registry.
 * KEY = `lucide-<kebab>` — prefix is the shared contract for all consumer plugins.
 * Returns the number of icons registered.
 */
export function registerLucideIcons(registerIcon: (type: string, icon: any) => void): number {
  let n = 0;
  for (const name of ICON_SET) {
    const Comp = (Lucide as any)[name];
    if (!Comp) continue;
    registerIcon(`lucide-${toKebab(name)}`, makeIcon(Comp));
    n++;
  }
  return n;
}
