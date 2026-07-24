import React, { useEffect, useState } from 'react';
import { SafeIcon } from './bottomBar';

// ---------------------------------------------------------------------------
// Opt-in Search icon for the collapsed (mobile) topbar. On narrow screens the
// core NocoBase topbar collapses every action into a "⋮" overflow, and
// @tuanla90/plugin-global-search hides its header pill there (no room). This
// overlays a compact Search button just left of that "⋮" and opens Global
// Search by dispatching its Ctrl/Cmd+K shortcut. It borrows Global Search's own
// look (its saved Appearance colours) so the two match. Self-hides when the "⋮"
// isn't present (desktop) or when disabled. Lane-agnostic; no @nocobase/client*.
// ---------------------------------------------------------------------------

const GS_APPEARANCE_KEY = 'ptdl-global-search-appearance';
const GS_APPEARANCE_EVENT = 'ptdl-gs-appearance';

interface GsLook {
  bg?: string;
  fg?: string;
}
function readGsLook(): GsLook {
  try {
    const raw = localStorage.getItem(GS_APPEARANCE_KEY);
    if (!raw) return {};
    const a = JSON.parse(raw);
    return { bg: a?.bg, fg: a?.fg };
  } catch (e) {
    return {};
  }
}

// The header overflow "⋮" sits at the top-right. Ignore stray ellipsis icons elsewhere (table menus).
function findTopbarEllipsis(): Element | null {
  if (typeof document === 'undefined') return null;
  const w = typeof window !== 'undefined' ? window.innerWidth : 0;
  const scoped = document.querySelectorAll(
    '.ant-layout-header .anticon-ellipsis, .ant-pro-layout-header .anticon-ellipsis, header .anticon-ellipsis',
  );
  const pool: Element[] = scoped.length ? Array.from(scoped) : Array.from(document.querySelectorAll('.anticon-ellipsis'));
  for (const el of pool) {
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

interface Pos {
  top: number;
  right: number;
}

export const TopbarSearch: React.FC<{ enabled?: boolean; themeColor?: string }> = ({ enabled, themeColor }) => {
  const [pos, setPos] = useState<Pos | null>(null);
  const [look, setLook] = useState<GsLook>(readGsLook);

  // keep in sync with Global Search's Appearance settings (live)
  useEffect(() => {
    const fn = () => setLook(readGsLook());
    window.addEventListener(GS_APPEARANCE_EVENT, fn);
    window.addEventListener('storage', fn);
    return () => {
      window.removeEventListener(GS_APPEARANCE_EVENT, fn);
      window.removeEventListener('storage', fn);
    };
  }, []);

  // position just left of the header "⋮"
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
      const next: Pos = { top: Math.round(r.top + r.height / 2), right: Math.round((window.innerWidth || 0) - r.left + 6) };
      setPos((p) => (p && p.top === next.top && p.right === next.right ? p : next));
    };
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    const iv = window.setInterval(measure, 1000);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
      window.clearInterval(iv);
    };
  }, [enabled]);

  if (!enabled || !pos) return null;

  // Borrow Global Search's colours; fall back to the PWA theme colour / a blue circle with a white glyph.
  const bg = (look.bg && look.bg.trim()) || themeColor || '#1677ff';
  const fg = look.fg && look.fg.trim() && look.fg.toLowerCase() !== 'transparent' ? look.fg : '#fff';

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
        width: 34,
        height: 34,
        borderRadius: '50%',
        border: 'none',
        background: bg,
        color: fg,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
      }}
    >
      <SafeIcon type="searchoutlined" size={16} />
    </button>
  );
};
