import React, { useState } from 'react';
import { theme } from 'antd';
import { BarItem, SafeIcon, hexAlpha } from './bottomBar';

// ---------------------------------------------------------------------------
// FAB placement: a floating round button (bottom-right) that opens a small
// speed-dial menu listing the shortcuts. Lane-agnostic. Doesn't reserve space.
// ---------------------------------------------------------------------------

export const FabMenu: React.FC<{
  items: BarItem[];
  activeKey?: string;
  themeColor?: string;
  onNavigate?: (item: BarItem) => void;
  preview?: boolean;
}> = ({ items, activeKey, themeColor, onNavigate, preview }) => {
  const { token } = theme.useToken();
  const [open, setOpen] = useState(!!preview);
  const list = (items || []).slice(0, 5);
  if (!list.length) return null;
  const accent = themeColor || token.colorPrimary;

  const wrap: React.CSSProperties = preview
    ? { position: 'absolute', right: 12, bottom: 12, zIndex: 2 }
    : { position: 'fixed', right: 16, bottom: 'calc(16px + env(safe-area-inset-bottom))', zIndex: 991 };

  const fab = (
    <button
      type="button"
      onClick={() => setOpen((o) => !o)}
      title="menu"
      style={{
        width: 52,
        height: 52,
        borderRadius: '50%',
        border: 'none',
        background: accent,
        color: '#fff',
        cursor: 'pointer',
        boxShadow: '0 6px 18px rgba(0,0,0,0.28)',
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
            <SafeIcon type={it.icon} size={18} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.label}</span>
          </button>
        );
      })}
    </div>
  ) : null;

  return (
    <>
      {open && !preview ? (
        <div
          onClick={() => setOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 990, background: 'transparent' }}
        />
      ) : null}
      <div style={{ ...wrap, display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
        {menu}
        {fab}
      </div>
    </>
  );
};
