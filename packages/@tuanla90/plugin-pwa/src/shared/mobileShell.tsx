import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BottomBar, BottomBarConfig, BarItem, barHeight, MAX_ITEMS, MOBILE_MAX_WIDTH, ShowOn } from './bottomBar';
import { InstallPrompt, InstallConfig, isStandalone } from './installPrompt';

// ---------------------------------------------------------------------------
// App-wide mobile shell provider. Injected via app.addProvider on both lanes; it
// sits ABOVE the router, fetches the PWA config once, and portals the bottom bar
// + install suggestion onto document.body. Lane-agnostic (no @nocobase/client*):
// each lane injects its own api-client hook.
// ---------------------------------------------------------------------------

const CONFIG_EVENT = 'pwa:config-updated'; // settings Save dispatches this for live refresh
const LOC_EVENT = 'pwa:locationchange';
const STYLE_ID = 'pwa-bottom-bar-reserve';
const BAR_VAR = '--pwa-bar-h';

// Reserve space for the fixed bar by shrinking the ProLayout container (both lanes use ProLayout;
// its inner content/scrollers cascade from this height — verified on the live modern client). The
// class is stable across desktop and mobile widths.
function ensureStyle() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent =
    `body.pwa-has-bottom-bar .ant-pro-layout-container{height:calc(100vh - var(${BAR_VAR},0px) - env(safe-area-inset-bottom,0px)) !important;}`;
  document.head.appendChild(el);
}
function setReserved(px: number) {
  if (typeof document === 'undefined') return;
  ensureStyle();
  document.documentElement.style.setProperty(BAR_VAR, `${px}px`);
  document.body.classList.toggle('pwa-has-bottom-bar', px > 0);
}

// Current desktop-route schemaUid from the URL: `/admin/<uid>` or `/v/admin/<uid>[/...]`.
function currentSchemaUid(): string {
  if (typeof location === 'undefined') return '';
  const m = /\/admin\/([^/?#]+)/.exec(location.pathname);
  return m ? m[1] : '';
}

// Fallback SPA navigation — verified on the live /v/ client: pushState then a synthetic popstate
// makes react-router re-read the location without a full reload. Used when the lane didn't inject the
// framework navigate (app.router.navigate). location.assign is the last-resort safety net.
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

// Navigate to a page. Prefers the framework navigate (basename-relative `/admin/<uid>`; react-router
// re-adds the `/v` prefix); falls back to the raw history hack when the lane provided none.
function goToPage(schemaUid: string, navigate?: (path: string) => void) {
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

// Patch pushState/replaceState once so the active tab stays in sync no matter how the app navigates
// (sider menu, tabs, our bar). Emits LOC_EVENT alongside the native popstate.
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
              setCfg({
                bottomBar: row.bottomBar || undefined,
                install: row.install || undefined,
                themeColor: row.themeColor || undefined,
                icon: typeof row.icon === 'string' ? row.icon : undefined,
              });
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
      const iv = window.setInterval(onLoc, 1200); // belt-and-suspenders for exotic nav paths
      return () => {
        window.removeEventListener('popstate', onLoc);
        window.removeEventListener(LOC_EVENT, onLoc);
        window.clearInterval(iv);
      };
    }, []);

    const bb = cfg.bottomBar;
    const standalone = isStandalone();
    const items: BarItem[] = useMemo(
      () => (bb?.items || []).filter((it) => it && it.schemaUid).slice(0, MAX_ITEMS),
      [bb],
    );
    const showBar = inApp && !!bb?.enabled && items.length > 0 && visibleFor(bb?.showOn, width, standalone);
    const bh = showBar ? barHeight(bb?.style) : 0;

    // reserve content space when the bar is shown
    useEffect(() => {
      setReserved(bh);
      return () => setReserved(0);
    }, [bh]);

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
                  themeColor={cfg.themeColor}
                  onNavigate={(it) => goToPage(it.schemaUid || '', navigate)}
                />
              ) : null}
              {inApp ? (
                <InstallPrompt config={cfg.install} icon={cfg.icon} themeColor={cfg.themeColor} bottomOffset={bh} />
              ) : null}
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
