/**
 * Shared floating LAUNCHER DOCK — a single draggable, collapsible container that BOTH page-builder plugins
 * portal their edit-mode launcher buttons into (app-builder: Build app + Dashboard; instant-create-page:
 * Quick page). One tidy stack instead of per-plugin fixed-position buttons that leave gaps when a plugin
 * isn't installed and overlap right-side config panels (e.g. an ECharts "save config" button). Vanilla DOM
 * (framework-agnostic) + idempotent: whichever plugin loads first builds the dock; the rest reuse it via the
 * shared `#ptdl-launcher-dock` id and just portal their buttons into `.ptdl-dock-items`. Drag the handle to
 * move it (out of a sidebar's way); click the handle to collapse to just the handle. Position + collapsed
 * state persist in localStorage. MUST stay byte-identical in both plugins — enforced by
 * build-env/checks/quickview-sync.mjs (DOCK_FILES). Keep the two copies in sync.
 */
const DOCK_ID = 'ptdl-launcher-dock';
const POS_KEY = 'ptdl-launcher-dock-pos';
const COL_KEY = 'ptdl-launcher-dock-collapsed';

/** Ensure the shared dock exists and return the element buttons should be portalled into. Safe to call from
 *  render (idempotent + cheap after the first call). Returns a fresh detached <div> if there's no document
 *  (non-browser), so callers never crash. */
export function ensureLauncherDock(): HTMLElement {
  if (typeof document === 'undefined') return (globalThis as any).__ptdlDockStub || ((globalThis as any).__ptdlDockStub = { appendChild() {}, querySelector() { return null; } } as any);
  const existing = document.getElementById(DOCK_ID);
  if (existing) return existing.querySelector('.ptdl-dock-items') as HTMLElement;

  const dock = document.createElement('div');
  dock.id = DOCK_ID;
  Object.assign(dock.style, { position: 'fixed', zIndex: '1000', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px', userSelect: 'none' } as Partial<CSSStyleDeclaration>);
  let pos: any = null; try { pos = JSON.parse(localStorage.getItem(POS_KEY) || 'null'); } catch { /* ignore */ }
  dock.style.right = (pos && typeof pos.right === 'number' ? pos.right : 20) + 'px';
  dock.style.bottom = (pos && typeof pos.bottom === 'number' ? pos.bottom : 20) + 'px';

  const items = document.createElement('div');
  items.className = 'ptdl-dock-items';
  Object.assign(items.style, { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' } as Partial<CSSStyleDeclaration>);

  const handle = document.createElement('button');
  handle.type = 'button';
  handle.title = 'Kéo để di chuyển · bấm để thu/mở';
  handle.setAttribute('aria-label', 'Launcher');
  Object.assign(handle.style, { width: '36px', height: '36px', borderRadius: '999px', border: 'none', cursor: 'grab', background: '#7C3AED', color: '#fff', boxShadow: '0 4px 14px rgba(0,0,0,0.18)', fontSize: '18px', lineHeight: '36px', padding: '0', touchAction: 'none' } as Partial<CSSStyleDeclaration>);

  let collapsed = false; try { collapsed = localStorage.getItem(COL_KEY) === '1'; } catch { /* ignore */ }
  const applyCollapsed = () => { items.style.display = collapsed ? 'none' : 'flex'; handle.textContent = collapsed ? '≡' : '×'; };

  // Drag the handle to move the whole dock; a click with (almost) no movement toggles collapse instead.
  let drag: { sx: number; sy: number; r: number; b: number; moved: boolean } | null = null;
  handle.addEventListener('pointerdown', (e: PointerEvent) => {
    drag = { sx: e.clientX, sy: e.clientY, r: parseInt(dock.style.right) || 20, b: parseInt(dock.style.bottom) || 20, moved: false };
    try { handle.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    handle.style.cursor = 'grabbing';
  });
  handle.addEventListener('pointermove', (e: PointerEvent) => {
    if (!drag) return;
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
    dock.style.right = Math.max(6, Math.min(window.innerWidth - 46, drag.r - dx)) + 'px';
    dock.style.bottom = Math.max(6, Math.min(window.innerHeight - 46, drag.b - dy)) + 'px';
  });
  handle.addEventListener('pointerup', () => {
    handle.style.cursor = 'grab';
    if (drag && !drag.moved) { collapsed = !collapsed; applyCollapsed(); try { localStorage.setItem(COL_KEY, collapsed ? '1' : '0'); } catch { /* ignore */ } }
    else if (drag) { try { localStorage.setItem(POS_KEY, JSON.stringify({ right: parseInt(dock.style.right) || 20, bottom: parseInt(dock.style.bottom) || 20 })); } catch { /* ignore */ } }
    drag = null;
  });

  dock.appendChild(items);
  dock.appendChild(handle);
  document.body.appendChild(dock);
  applyCollapsed();
  return items;
}
