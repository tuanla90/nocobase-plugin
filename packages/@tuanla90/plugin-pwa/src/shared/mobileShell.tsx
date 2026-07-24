import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BottomBar, BottomBarConfig, BarItem, barHeight, MAX_ITEMS, MOBILE_MAX_WIDTH, ShowOn, Placement } from './bottomBar';
import { FabMenu } from './fabMenu';
import { InstallPrompt, InstallConfig, isStandalone } from './installPrompt';
import { TopbarSearch } from './topbarSearch';
import { setPwaConfig, setPwaNavigate, setBadgeCounts, useBadgeCounts } from './configStore';

// ---------------------------------------------------------------------------
// App-wide mobile shell provider. Injected via app.addProvider on both lanes; it
// sits above the router, fetches the PWA config once, and portals the nav bar /
// FAB + install suggestion onto document.body. Lane-agnostic (no @nocobase/client*):
// each lane injects its own api-client hook. The avatar-menu placement is handled
// in the v2 lane (a UserCenter model reads the shared config store).
// ---------------------------------------------------------------------------

const CONFIG_EVENT = 'pwa:config-updated'; // settings Save dispatches this for live refresh
const LOC_EVENT = 'pwa:locationchange';
const STYLE_ID = 'pwa-bar-reserve';
const BAR_VAR = '--pwa-bar-h';

// Reserve space for a fixed bar by resizing the ProLayout container (both lanes use ProLayout; its
// inner content/scrollers cascade from this height — verified on the live modern client).
function ensureStyle() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent =
    `body.pwa-reserve-bottom .ant-pro-layout-container{height:calc(100vh - var(${BAR_VAR},0px) - env(safe-area-inset-bottom,0px)) !important;}` +
    `body.pwa-reserve-top .ant-pro-layout-container{margin-top:var(${BAR_VAR},0px) !important;height:calc(100vh - var(${BAR_VAR},0px)) !important;}`;
  document.head.appendChild(el);
}
function setReserved(px: number, side: 'bottom' | 'top' | 'none') {
  if (typeof document === 'undefined') return;
  ensureStyle();
  document.documentElement.style.setProperty(BAR_VAR, `${px}px`);
  document.body.classList.toggle('pwa-reserve-bottom', px > 0 && side === 'bottom');
  document.body.classList.toggle('pwa-reserve-top', px > 0 && side === 'top');
}

// Current desktop-route schemaUid from the URL: `/admin/<uid>` or `/v/admin/<uid>[/...]`.
function currentSchemaUid(): string {
  if (typeof location === 'undefined') return '';
  const m = /\/admin\/([^/?#]+)/.exec(location.pathname);
  return m ? m[1] : '';
}

// Fallback SPA navigation — verified on the live /v/ client: pushState then a synthetic popstate
// makes react-router re-read the location without a full reload. Used when the lane didn't inject the
// framework navigate. location.assign is the last-resort safety net.
function pushStateNavigate(schemaUid: string) {
  const prefix = location.pathname.startsWith('/v/') || location.pathname === '/v' ? '/v' : '';
  const url = `${prefix}/admin/${schemaUid}`;
  if (url === location.pathname) return;
  try {
    history.pushState({}, '', url);
    window.dispatchEvent(new PopStateEvent('popstate'));
  } catch (e) {
    try {
      window.location.assign(url);
    } catch (e2) {
      // ignore
    }
  }
}

/** Navigate to a page. Prefers the framework navigate (`/admin/<uid>`; basename re-added); else the raw history hack. */
export function goToPage(schemaUid: string, navigate?: (path: string) => void) {
  if (!schemaUid) return;
  if (navigate) {
    try {
      navigate(`/admin/${schemaUid}`);
      return;
    } catch (e) {
      // fall through
    }
  }
  pushStateNavigate(schemaUid);
}

// Patch pushState/replaceState once so the active tab stays in sync no matter how the app navigates.
let historyPatched = false;
function patchHistory() {
  if (historyPatched || typeof history === 'undefined') return;
  historyPatched = true;
  (['pushState', 'replaceState'] as const).forEach((m) => {
    const orig = (history as any)[m];
    (history as any)[m] = function (...args: any[]) {
      const r = orig.apply(this, args);
      try {
        window.dispatchEvent(new Event(LOC_EVENT));
      } catch (e) {
        // ignore
      }
      return r;
    };
  });
}

function visibleFor(showOn: ShowOn | undefined, width: number, standalone: boolean): boolean {
  switch (showOn || 'mobileOrStandalone') {
    case 'always':
      return true;
    case 'mobile':
      return width <= MOBILE_MAX_WIDTH;
    case 'standalone':
      return standalone;
    case 'mobileOrStandalone':
    default:
      return width <= MOBILE_MAX_WIDTH || standalone;
  }
}

interface ShellConfig {
  bottomBar?: BottomBarConfig;
  install?: InstallConfig;
  themeColor?: string;
  icon?: string;
}

export function createMobileShell({
  useApiClient,
  useNavigate,
}: {
  useApiClient: () => any;
  useNavigate?: () => ((path: string) => void) | undefined;
}): React.FC<{ children?: React.ReactNode }> {
  const MobileShell: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
    const api = useApiClient();
    const navigate = useNavigate ? useNavigate() : undefined;
    const [cfg, setCfg] = useState<ShellConfig>({});
    const [width, setWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1024);
    const [, setTick] = useState(0);
    const pathRef = useRef(currentSchemaUid());
    const [activeUid, setActiveUid] = useState(pathRef.current);
    const [inApp, setInApp] = useState(typeof location !== 'undefined' ? /\/admin(\/|$)/.test(location.pathname) : false);

    // expose the navigate fn to consumers outside this tree (avatar item / fab in the dropdown)
    useEffect(() => {
      setPwaNavigate((uid: string) => goToPage(uid, navigate));
    }, [navigate]);

    // --- config fetch (once + on Save event) ---
    useEffect(() => {
      let alive = true;
      const load = () => {
        if (!api) return;
        api
          .request({ url: 'pwaSettings:list', params: { pageSize: 1, sort: ['id'] } })
          .then((res: any) => {
            const row = res?.data?.data?.[0];
            if (alive && row) {
              const next: ShellConfig = {
                bottomBar: row.bottomBar || undefined,
                install: row.install || undefined,
                themeColor: row.themeColor || undefined,
                icon: typeof row.icon === 'string' ? row.icon : undefined,
              };
              setCfg(next);
              setPwaConfig(next);
            }
          })
          .catch(() => {});
      };
      load();
      const onCfg = () => load();
      window.addEventListener(CONFIG_EVENT, onCfg);
      return () => {
        alive = false;
        window.removeEventListener(CONFIG_EVENT, onCfg);
      };
    }, [api]);

    // --- viewport + standalone tracking ---
    useEffect(() => {
      const onResize = () => setWidth(window.innerWidth);
      window.addEventListener('resize', onResize);
      const mq = window.matchMedia?.('(display-mode: standalone)');
      const onMq = () => setTick((n) => n + 1);
      mq?.addEventListener?.('change', onMq);
      return () => {
        window.removeEventListener('resize', onResize);
        mq?.removeEventListener?.('change', onMq);
      };
    }, []);

    // --- active route tracking ---
    useEffect(() => {
      patchHistory();
      const onLoc = () => {
        const uid = currentSchemaUid();
        if (uid !== pathRef.current) {
          pathRef.current = uid;
          setActiveUid(uid);
        }
        setInApp(/\/admin(\/|$)/.test(location.pathname));
      };
      window.addEventListener('popstate', onLoc);
      window.addEventListener(LOC_EVENT, onLoc);
      const iv = window.setInterval(onLoc, 1200);
      return () => {
        window.removeEventListener('popstate', onLoc);
        window.removeEventListener(LOC_EVENT, onLoc);
        window.clearInterval(iv);
      };
    }, []);

    const bb = cfg.bottomBar;
    const counts = useBadgeCounts();

    // --- badge counts (poll + refetch on focus) ---
    useEffect(() => {
      const badged = (bb?.items || []).filter((it) => it && it.badge?.enabled && it.badge?.collection);
      if (!api || !badged.length) {
        setBadgeCounts({});
        return;
      }
      let alive = true;
      const fetchAll = async () => {
        const entries = await Promise.all(
          badged.map(async (it) => {
            try {
              const b = it.badge!;
              const headers = b.dataSource && b.dataSource !== 'main' ? { 'X-Data-Source': b.dataSource } : undefined;
              let filter: any;
              try {
                filter = b.filter ? (typeof b.filter === 'string' ? (b.filter.trim() ? JSON.parse(b.filter) : undefined) : b.filter) : undefined;
              } catch (e) {
                filter = undefined;
              }
              const res = await api.request({ url: `${b.collection}:list`, params: { pageSize: 1, filter }, headers });
              const c = res?.data?.meta?.count;
              return [it.key, typeof c === 'number' ? c : 0] as [string, number];
            } catch (e) {
              return [it.key, 0] as [string, number];
            }
          }),
        );
        if (alive) setBadgeCounts(Object.fromEntries(entries));
      };
      fetchAll();
      const iv = window.setInterval(fetchAll, 30000);
      const onFocus = () => fetchAll();
      window.addEventListener('focus', onFocus);
      return () => {
        alive = false;
        window.clearInterval(iv);
        window.removeEventListener('focus', onFocus);
      };
    }, [api, bb]);

    const standalone = isStandalone();
    const placement: Placement = bb?.placement || 'bottom';
    const items: BarItem[] = useMemo(
      () => (bb?.items || []).filter((it) => it && it.schemaUid).slice(0, MAX_ITEMS),
      [bb],
    );
    // Có modal/drawer/dialog đang mở? → ẩn bottom bar + FAB và BỎ reservation: bottom-nav không được đè nút
    // Save/footer của overlay, và không co .ant-pro-layout-container làm lệch scroll khi overlay mở.
    // Overlay portaled ra body → theo dõi DOM (debounce bằng rAF cho nhẹ).
    const [overlayOpen, setOverlayOpen] = useState(false);
    useEffect(() => {
      if (typeof document === 'undefined') return;
      // Dựa vào MASK/wrap ĐANG HIỂN THỊ (drawer/modal đóng vẫn nằm trong DOM → phải xét display/opacity thật,
      // không chỉ sự tồn tại). Mask chỉ visible khi overlay thực sự mở.
      const check = () => {
        const els = document.querySelectorAll('.ant-modal-mask, .ant-drawer-mask, .ant-modal-wrap');
        let open = false;
        for (const el of Array.from(els)) {
          const s = getComputedStyle(el as Element);
          if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') continue;
          const r = (el as Element).getBoundingClientRect();
          if (r.width > 4 && r.height > 4) { open = true; break; }
        }
        setOverlayOpen(open);
      };
      check();
      let raf = 0;
      const schedule = () => {
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = 0;
          check();
        });
      };
      const mo = new MutationObserver(schedule);
      mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
      return () => {
        mo.disconnect();
        if (raf) cancelAnimationFrame(raf);
      };
    }, []);

    const overlayVisible =
      inApp && !overlayOpen && !!bb?.enabled && items.length > 0 && visibleFor(bb?.showOn, width, standalone);
    const isBar = placement === 'bottom' || placement === 'top' || placement === 'floating';
    const showBar = overlayVisible && isBar;
    const showFab = overlayVisible && placement === 'fab';

    const barH = barHeight(bb?.style);
    const reserveSide: 'bottom' | 'top' | 'none' = showBar && placement === 'bottom' ? 'bottom' : showBar && placement === 'top' ? 'top' : 'none';
    const reservePx = reserveSide === 'none' ? 0 : barH;
    // Lift the install pill/banner/fab above whatever sits at the bottom (bottom bar, floating dock,
    // or the nav FAB which shares the bottom-right corner).
    const installOffset = showBar && placement === 'bottom' ? barH : showBar && placement === 'floating' ? barH + 24 : showFab ? 68 : 0;

    useEffect(() => {
      setReserved(reservePx, reserveSide);
      return () => setReserved(0, 'none');
    }, [reservePx, reserveSide]);

    const activeKey = useMemo(() => {
      const hit = items.find((it) => it.schemaUid === activeUid);
      return hit?.key;
    }, [items, activeUid]);

    const overlay =
      typeof document !== 'undefined'
        ? createPortal(
            <>
              {showBar ? (
                <BottomBar
                  items={items}
                  activeKey={activeKey}
                  style={bb?.style}
                  placement={placement}
                  counts={counts}
                  themeColor={cfg.themeColor}
                  onNavigate={(it) => goToPage(it.schemaUid || '', navigate)}
                />
              ) : null}
              {showFab ? (
                <FabMenu items={items} activeKey={activeKey} counts={counts} themeColor={cfg.themeColor} onNavigate={(it) => goToPage(it.schemaUid || '', navigate)} />
              ) : null}
              {inApp ? (
                <InstallPrompt config={cfg.install} icon={cfg.icon} themeColor={cfg.themeColor} bottomOffset={installOffset} />
              ) : null}
              {inApp ? <TopbarSearch enabled={!!bb?.topSearch} themeColor={cfg.themeColor} /> : null}
            </>,
            document.body,
          )
        : null;

    return (
      <>
        {children}
        {overlay}
      </>
    );
  };

  return MobileShell;
}
