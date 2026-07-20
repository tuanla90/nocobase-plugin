import React from 'react';
import { Input, Popover, Button, Space, theme } from 'antd';

/**
 * Shared icon utilities (consumer of the custom-icons registry) — one canonical copy for all @tuanla90 plugins.
 * Icons come from the host `icons` Map + `<Icon type=key/>` of @nocobase/client(-v2) (no bundled lucide, no CDN).
 * Each plugin calls setIconRegistry(Icon, icons) once per lane in its client load().
 */

let IconComp: any = null;
let iconsMap: Map<string, any> | null = null;

export function setIconRegistry(Icon?: any, icons?: Map<string, any>) {
  if (Icon) IconComp = Icon;
  if (icons) iconsMap = icons;
}

export const IconByKey = ({ type }: { type?: string }) => (IconComp && type ? <IconComp type={type} /> : null);

// Library + clean name from key. lucide: `lucide-<kebab>outlined`; antd: `<name>outlined/filled/twotone`.
const libOf = (k: string): string => (k.startsWith('lucide-') ? 'Lucide' : 'Ant Design');
const cleanName = (k: string): string => k.replace(/^lucide-/, '').replace(/(outlined|filled|twotone)$/i, '');
const hasSuffix = (k: string) => /(?:outlined|filled|twotone)$/.test(k);
// Show only one variant/icon: drop the suffix-less alias when an outlined/filled/twotone exists.
const isAliasDup = (k: string) =>
  !hasSuffix(k) && (iconsMap?.has(`${k}outlined`) || iconsMap?.has(`${k}filled`) || iconsMap?.has(`${k}twotone`));
const showable = (k: string) => (k.includes('-') ? !isAliasDup(k) : hasSuffix(k));

const CAP_SEARCH = 240; // total while searching
const CAP_GROUP = 60; // per library when NOT searching (avoid rendering 1739 icons)

/**
 * Icon picker — core-like UI:
 *  - Trigger: `[selected icon][×]` (Space.Compact, separate clear button when a value is set).
 *  - Popover: Search box + list GROUPED by library ("Lucide (N)") + icon grid, scrollable.
 */
export function RegistryIconPicker(props: any) {
  const { value, onChange, disabled } = props;
  const { token } = theme.useToken();
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState('');
  const allKeys = iconsMap ? Array.from(iconsMap.keys()) : [];
  const ql = q.trim().toLowerCase();

  const visible = allKeys.filter(showable);
  const matched = ql ? visible.filter((k) => cleanName(k).toLowerCase().includes(ql)) : visible;

  // Group by library (Lucide first, then Ant Design), sort names within a group.
  const groups: Record<string, string[]> = {};
  for (const k of matched) (groups[libOf(k)] ||= []).push(k);
  const order = Object.keys(groups).sort((a, b) => (a === 'Lucide' ? -1 : b === 'Lucide' ? 1 : a.localeCompare(b)));
  for (const g of order) groups[g].sort((a, b) => cleanName(a).localeCompare(cleanName(b)));

  const IconBtn = (k: string) => (
    <button key={k} type="button" title={cleanName(k)} onClick={() => { onChange?.(k); setOpen(false); }}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', height: 30, fontSize: 18,
        border: k === value ? '1px solid #1677ff' : '1px solid transparent', borderRadius: 6,
        background: k === value ? 'rgba(22,119,255,0.12)' : 'transparent', cursor: 'pointer',
      }}>
      <IconByKey type={k} />
    </button>
  );

  const content = (
    <div style={{ width: 320 }}>
      <Input
        size="small" allowClear autoFocus
        placeholder="Search… e.g. cart, check, user"
        value={q} onChange={(e: any) => setQ(e.target.value)}
        style={{ marginBottom: 8 }}
      />
      <div style={{ maxHeight: 300, overflow: 'auto', paddingRight: 2 }}>
        {order.length === 0 ? (
          <div style={{ color: token.colorTextTertiary, padding: 8 }}>No icons found</div>
        ) : (
          order.map((g) => {
            const list = groups[g];
            const cap = ql ? CAP_SEARCH : CAP_GROUP;
            const shown = list.slice(0, cap);
            const more = list.length - shown.length;
            return (
              <div key={g} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: token.colorTextTertiary, padding: '2px 2px 4px' }}>
                  {g} ({list.length})
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 4 }}>
                  {shown.map(IconBtn)}
                </div>
                {more > 0 ? (
                  <div style={{ fontSize: 11, color: token.colorTextQuaternary, padding: '4px 2px 0' }}>
                    +{more} more — search to narrow
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  return (
    <Space.Compact>
      <Popover open={open} onOpenChange={(v: boolean) => !disabled && setOpen(v)} trigger="click" placement="bottomLeft" content={content}>
        <Button size="small" disabled={disabled} title={value ? cleanName(value) : props.placeholder || 'Select icon'}
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 40, padding: '0 8px', fontSize: 16 }}>
          {value ? <IconByKey type={value} /> : <span style={{ color: token.colorTextTertiary, fontSize: 13, lineHeight: 1 }}>{props.placeholder || 'Select'}</span>}
        </Button>
      </Popover>
      {value && !disabled ? (
        <Button size="small" onClick={() => onChange?.(undefined)} title="Clear"
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 8px', color: token.colorTextTertiary }}>
          ✕
        </Button>
      ) : null}
    </Space.Compact>
  );
}
