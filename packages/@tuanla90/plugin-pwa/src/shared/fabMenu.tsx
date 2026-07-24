import React, { useState } from 'react';
import { theme } from 'antd';
import { BarItem, SafeIcon, ItemBadge, hexAlpha } from './bottomBar';

// ---------------------------------------------------------------------------
// FAB placement: a floating round button (bottom-right) that opens a small
// speed-dial menu listing the shortcuts. Lane-agnostic. Doesn't reserve space.
// ---------------------------------------------------------------------------

export const FabMenu: React.FC<{
  items: BarItem[];
  activeKey?: string;
  counts?: Record<string, number>;
  themeColor?: string;
  onNavigate?: (item: BarItem) => void;
  preview?: boolean;
}> = ({ items, activeKey, counts, themeColor, onNavigate, preview }) => {
  const { token } = theme.useToken();
  const [open, setOpen] = useState(!!preview);
  const list = (items || []).slice(0, 5);
  if (!list.length) return null;
  const accent = themeColor || token.colorPrimary;
  const total = list.reduce((a, it) => a + (it.badge?.enabled ? counts?.[it.key] || 0 : 0), 0);

  const wrap: React.CSSProperties = preview
    ? { position: 'absolute', right: 12, bottom: 12, zIndex: 2 }
    : { position: 'fixed', right: 16, bottom: 'calc(16px + env(safe-area-inset-bottom))', zIndex: 991 };

  const fab = (
    <button
      type="button"
      onClick={() => setOpen((o) => !o)}
      title="menu"
      style={{
        position: 'relative',
        width: 52,
        height: 52,
        borderRadius: '50%',
        border: 'none',
        background: accent,
        color: '#fff',
        cursor: 'pointer',
        boxShadow: `0 8px 20px ${hexAlpha(accent, 0.45)}, 0 2px 6px rgba(0,0,0,0.2)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 20,
        alignSelf: 'flex-end',
        transition: 'transform 0.15s',
        transform: open ? 'rotate(90deg)' : 'none',
      }}
    >
      {open ? <span style={{ fontSize: 22, lineHeight: 1 }}>✕</span> : <SafeIcon type="appstoreoutlined" size={22} />}
      {!open && total > 0 ? (
        <span
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            minWidth: 17,
            height: 17,
            padding: '0 4px',
            borderRadius: 999,
            background: '#ff4d4f',
            color: '#fff',
            fontSize: 10,
            fontWeight: 600,
            lineHeight: '17px',
            boxShadow: '0 0 0 2px #fff',
          }}
        >
          {total > 99 ? '99+' : total}
        </span>
      ) : null}
    </button>
  );

  const menu = open ? (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, marginBottom: 10 }}>
      {list.map((it) => {
        const active = activeKey ? it.key === activeKey : false;
        return (
          <button
            key={it.key}
            type="button"
            title={it.label}
            onClick={() => {
              onNavigate?.(it);
              setOpen(false);
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              maxWidth: 'min(70vw, 240px)',
              padding: '7px 14px 7px 12px',
              border: `1px solid ${active ? accent : token.colorBorderSecondary}`,
              borderRadius: 999,
              background: active ? hexAlpha(accent, 0.12) : token.colorBgElevated,
              color: active ? accent : token.colorText,
              cursor: 'pointer',
              boxShadow: '0 3px 10px rgba(0,0,0,0.14)',
              fontSize: 13,
            }}
          >
            <span style={{ position: 'relative', display: 'inline-flex' }}>
              <SafeIcon type={it.icon} size={18} />
              <ItemBadge badge={it.badge} count={counts?.[it.key]} />
            </span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.label}</span>
          </button>
        );
      })}
    </div>
  ) : null;

  return (
    <>
      {open && !preview ? (
        <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 990, background: 'transparent' }} />
      ) : null}
      <div style={{ ...wrap, display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
        {menu}
        {fab}
      </div>
    </>
  );
};
