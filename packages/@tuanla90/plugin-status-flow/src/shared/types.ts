// Shared data model for the statusFlow field interface.
//
// Persistence layout on the field record (everything below `uiSchema`/`statusFlow`
// lands in the `options` JSON column of the `fields` collection):
//   uiSchema.enum          -> [{ value, label, color }]  (standard select shape: classic lane
//                             + DisplayEnumFieldModel render colored tags for free)
//   statusFlow.initial     -> value auto-assigned on create when the field is empty
//   statusFlow.kinds       -> { [value]: 'init' | 'processing' | 'success' | 'fail' }
//   statusFlow.transitions -> { [from]: { to: string[], roles?: string[] } }
//                             (no entry for a value = final status, no outgoing transitions;
//                              empty/missing roles = every role may transition)

export type StatusKind = 'init' | 'processing' | 'success' | 'fail';

// How statuses are painted in the widgets / tags:
//   colorful -> each status uses its own color (default, current behaviour)
//   mono     -> a single neutral grey for every status; emphasis comes from fill/weight
//               (the "selected stands out, the rest recede" look of the button group)
export type ColorMode = 'colorful' | 'mono';

export const MONO_HEX = '#8c8c8c';

export interface EnumOption {
  value: string;
  label: string;
  color?: string;
  /** icon registry key (e.g. `lucide-check`, `CheckOutlined`) shown next to the label */
  icon?: string;
}

export interface TransitionRule {
  to: string[];
  /** wildcard: this status may move to every other status */
  toAll?: boolean;
  roles?: string[];
}

export interface StatusFlowConfig {
  initial?: string;
  kinds?: Record<string, StatusKind>;
  transitions?: Record<string, TransitionRule>;
  /** wildcard targets: every status may move INTO these (e.g. Archived/Cancelled);
   *  roles gate who may perform that move */
  openFrom?: Record<string, { roles?: string[] }>;
}

// One editable row in the config editor (a join of enum entry + kinds + transitions).
export interface StatusRow {
  value: string;
  label: string;
  color: string;
  icon?: string;
  kind: StatusKind;
  to: string[];
  toAll: boolean;
  fromAll: boolean;
  roles: string[];
}

export const KIND_META: Array<{ value: StatusKind; label: string; color: string }> = [
  { value: 'init', label: 'Initial', color: 'orange' },
  { value: 'processing', label: 'In progress', color: 'blue' },
  { value: 'success', label: 'Success', color: 'green' },
  { value: 'fail', label: 'Failed / Cancelled', color: 'red' },
];

// antd Tag palette (names) + hex map — now unified in @tuanla90/shared on the primary-6 palette.
export { TAG_COLORS, TAG_HEX } from '@tuanla90/shared';

import { TAG_HEX as _TAG_HEX } from '@tuanla90/shared';

// Resolve the hex used for backgrounds/borders honouring the color mode. In mono mode, the chosen
// `monoColor` (if any) is used, otherwise the neutral default.
export function statusHex(color: string | undefined, mode: ColorMode = 'colorful', monoColor?: string): string {
  if (mode === 'mono') return monoColor || MONO_HEX;
  return (_TAG_HEX as Record<string, string>)[color || 'default'] || (_TAG_HEX as Record<string, string>).default;
}

// The `color` prop to feed an antd <Tag>: a preset name in colorful mode; in mono mode the chosen
// mono hex (solid tag) or undefined (neutral default tag) when no color is picked.
export function statusTagColor(
  color: string | undefined,
  mode: ColorMode = 'colorful',
  monoColor?: string,
): string | undefined {
  return mode === 'mono' ? monoColor || undefined : color;
}

export function slugify(label: string): string {
  return String(label || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function rowsFromField(enumValue?: EnumOption[], flow?: StatusFlowConfig): StatusRow[] {
  const kinds = flow?.kinds || {};
  const transitions = flow?.transitions || {};
  const openFrom = flow?.openFrom || {};
  return (Array.isArray(enumValue) ? enumValue : []).map((opt) => {
    const v = String(opt?.value ?? '');
    return {
      value: v,
      label: String(opt?.label ?? ''),
      color: opt?.color || 'default',
      icon: opt?.icon || undefined,
      kind: kinds[v] || 'processing',
      to: Array.isArray(transitions[v]?.to) ? transitions[v].to.map(String) : [],
      toAll: !!transitions[v]?.toAll,
      fromAll: !!openFrom[v],
      roles: Array.isArray(transitions[v]?.roles)
        ? (transitions[v].roles as string[]).map(String)
        : Array.isArray(openFrom[v]?.roles)
          ? (openFrom[v].roles as string[]).map(String)
          : [],
    };
  });
}

export function rowsToField(
  rows: StatusRow[],
  initial?: string,
): { enumValue: EnumOption[]; flow: StatusFlowConfig } {
  const enumValue: EnumOption[] = rows.map((r) => ({
    value: r.value,
    label: r.label,
    color: r.color,
    ...(r.icon ? { icon: r.icon } : {}),
  }));
  const kinds: Record<string, StatusKind> = {};
  const transitions: Record<string, TransitionRule> = {};
  const openFrom: Record<string, { roles?: string[] }> = {};
  const valid = new Set(rows.map((r) => r.value));
  for (const r of rows) {
    if (!r.value) continue;
    kinds[r.value] = r.kind;
    const roles = r.roles.length ? { roles: r.roles } : {};
    if (r.toAll) {
      transitions[r.value] = { to: [], toAll: true, ...roles };
    } else {
      const to = r.to.filter((v) => valid.has(v) && v !== r.value);
      if (to.length) transitions[r.value] = { to, ...roles };
    }
    if (r.fromAll) openFrom[r.value] = { ...roles };
  }
  let init = initial && valid.has(initial) ? initial : undefined;
  if (!init) init = rows.find((r) => r.kind === 'init')?.value || rows[0]?.value;
  return { enumValue, flow: { initial: init, kinds, transitions, openFrom } };
}

export function isFlowConfigured(flow?: StatusFlowConfig): boolean {
  return !!(flow && (Object.keys(flow.transitions || {}).length || Object.keys(flow.openFrom || {}).length));
}

function roleOk(ruleRoles: string[] | undefined, roleNames: string[]): boolean {
  if (!Array.isArray(ruleRoles) || !ruleRoles.length) return true;
  // Unknown roles client-side -> stay permissive, the server is the authority.
  if (!roleNames.length) return true;
  return roleNames.some((r) => ruleRoles.includes(r));
}

// Every target declared reachable from `current`, ignoring roles.
export function declaredTargets(flow: StatusFlowConfig | undefined, current: string, allValues: string[]): string[] {
  const set = new Set<string>();
  const rule = flow?.transitions?.[current];
  if (rule) {
    if (rule.toAll) allValues.forEach((v) => set.add(String(v)));
    else (rule.to || []).forEach((v) => set.add(String(v)));
  }
  for (const t of Object.keys(flow?.openFrom || {})) set.add(t);
  set.delete(current);
  return Array.from(set);
}

// Returns the list of target values the given roles may transition to from `current`,
// or null when no filtering should happen (flow not configured / root / unknown state).
export function computeAllowedTargets(
  flow: StatusFlowConfig | undefined,
  current: string | null | undefined,
  roleNames: string[],
  allValues: string[],
): string[] | null {
  if (!isFlowConfigured(flow)) return null;
  if (current === null || current === undefined || current === '') return null;
  if (roleNames.includes('root')) return null;
  const cur = String(current);
  const set = new Set<string>();
  const rule = flow!.transitions?.[cur];
  if (rule && roleOk(rule.roles, roleNames)) {
    if (rule.toAll) allValues.forEach((v) => set.add(String(v)));
    else (rule.to || []).forEach((v) => set.add(String(v)));
  }
  for (const [target, cfg] of Object.entries(flow!.openFrom || {})) {
    if (target !== cur && roleOk(cfg?.roles, roleNames)) set.add(target);
  }
  set.delete(cur);
  return Array.from(set);
}
