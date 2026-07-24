import React, { useEffect, useState } from 'react';
import { SafeIcon } from './bottomBar';

// ---------------------------------------------------------------------------
// Opt-in Search icon for the collapsed (mobile) topbar. On narrow screens the
// core NocoBase topbar collapses every action into a "⋮" overflow (see
// TopbarActionsBar) — there's no room for search. This overlays a search button
// just left of that "⋮" and opens @tuanla90/plugin-global-search by dispatching
// its Ctrl/Cmd+K shortcut (verified: its window keydown listener toggles the
// palette). Self-hides when the "⋮" isn't present (desktop) or when disabled.
// Lane-agnostic; no @nocobase/client* imports.
// ---------------------------------------------------------------------------

interface Pos {
  top: number;
  right: number;
  color: string;
}

// The header overflow "⋮" sits at the top-right. Ignore stray ellipsis icons elsewhere (table menus).
function findTopbarEllipsis(): Element | null {
  if (typeof document === 'undefined') return null;
  const w = window.innerWidth || 0;
  const scoped = document.querySelectorAll(
    '.ant-layout-header .anticon-ellipsis, .ant-pro-layout-header .anticon-ellipsis, header .anticon-ellipsis',
  );
  const pools: Element[] = scoped.length ? Array.from(scoped) : Array.from(document.querySelectorAll('.anticon-ellipsis'));
  for (const el of pools) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.top < 70 && r.right > w - 100) return el;
  }
  return null;
}

function openGlobalSearch() {
  try {
    const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || '');
    const init: any = { key: 'k', code: 'KeyK', bubbles: true, cancelable: true };
    if (isMac) init.metaKey = true;
    else init.ctrlKey = true;
    window.dispatchEvent(new KeyboardEvent('keydown', init));
  } catch (e) {
    // ignore
  }
}

export const TopbarSearch: React.FC<{ enabled?: boolean }> = ({ enabled }) => {
  const [pos, setPos] = useState<Pos | null>(null);

  useEffect(() => {
    if (!enabled) {
      setPos(null);
      return;
    }
    let raf = 0;
    const measure = () => {
      const el = findTopbarEllipsis();
      if (!el) {
        setPos((p) => (p === null ? p : null));
        return;
      }
      const wrap = (el as HTMLElement).closest('div') || el;
      const r = wrap.getBoundingClientRect();
      const color = getComputedStyle(el as Element).color || 'currentColor';
      const next: Pos = { top: Math.round(r.top + r.height / 2), right: Math.round((window.innerWidth || 0) - r.left + 4), color };
      setPos((p) => (p && p.top === next.top && p.right === next.right && p.color === next.color ? p : next));
    };
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    const iv = window.setInterval(measure, 1000); // header can mount/relayout after route changes
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
      window.clearInterval(iv);
    };
  }, [enabled]);

  if (!enabled || !pos) return null;

  return (
    <button
      type="button"
      title="Search"
      onClick={openGlobalSearch}
      style={{
        position: 'fixed',
        top: pos.top,
        right: pos.right,
        transform: 'translateY(-50%)',
        zIndex: 500,
        width: 40,
        height: 40,
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        color: pos.color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        fontSize: 18,
      }}
    >
      <SafeIcon type="searchoutlined" size={19} />
    </button>
  );
};
