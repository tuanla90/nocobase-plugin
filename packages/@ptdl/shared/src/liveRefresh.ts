/**
 * Reusable server→client "live refresh" over NocoBase's app WebSocket. Shared across @ptdl plugins
 * (computed-field blocks, menu/tab count badges, filter-tree node counts, …) so a value the SERVER
 * changes asynchronously (a computed cascade, another client's edit, a workflow) refreshes on screen the
 * moment it settles — no fixed-timer guessing, no poll lag.
 *
 * ── SERVER (per plugin; keep inline — server lanes can't import this client module) ────────────────
 *   // broadcast to every client of this app (see @nocobase/server ws-server.js bindAppWSEvents):
 *   app.emit('ws:sendToCurrentApp', { message: { type: '<TYPE>', payload: { collections } } });
 *   //   <TYPE> = LIVE_REFRESH_TYPE  → a computed cascade settled (precise; emitted by plugin-formula)
 *   //   <TYPE> = DATA_CHANGED_TYPE  → a collection's data changed (firehose; menu-enhancements server)
 *
 * ── CLIENT (any lane — @nocobase/client `/admin` and client-v2 `/v/` share the WS client) ──────────
 *   // low level — one message type:
 *   onWsMessage(app, LIVE_REFRESH_TYPE, () => refreshFlowBlocks(app.flowEngine));
 *   // high level — both refresh signals, get the changed collections (or null = "refresh everything"):
 *   onLiveRefresh(app, (collections) => { ...refresh what you own... });
 *
 * Verified live against NocoBase 2.1.19: `app.ws` is a WebSocketClient (EventEmitter over the native
 * socket); `ws.on('message', fn)` attaches fn to the live socket immediately, and fn receives the raw
 * MessageEvent whose `.data` is the server's JSON.stringify'd message. `ws.off('message', fn)` detaches.
 *
 * ⚠️ Do NOT send `{ payload: { refresh: true } }` — NocoBase core treats a truthy `payload.refresh` as a
 * full `window.location.reload()`. Use a custom `type` for a targeted, state-preserving refresh.
 */

/** WS message type: "a computed cascade settled" (precise). Computed blocks + badges/trees listen. */
export const LIVE_REFRESH_TYPE = 'ptdl:live-refresh';
/** WS message type: "a collection's data changed" (firehose). Count surfaces (badges, trees) listen. */
export const DATA_CHANGED_TYPE = 'ptdl:data-changed';

/**
 * Subscribe to a server-pushed WebSocket message of the given `type`. `handler` receives the message's
 * `payload`. Returns an unsubscribe function. No-op (returns a no-op unsubscribe) if the app has no WS.
 */
export function onWsMessage(
  app: any,
  type: string,
  handler: (payload: any, message: any) => void,
): () => void {
  const ws = app?.ws;
  if (!ws || typeof ws.on !== 'function') return () => {};
  const listener = (event: any) => {
    let data: any;
    try {
      data = typeof event?.data === 'string' ? JSON.parse(event.data) : event?.data;
    } catch {
      return; // ignore non-JSON frames
    }
    if (data && data.type === type) {
      try {
        handler(data.payload, data);
      } catch {
        /* swallow handler error so it can't break the socket */
      }
    }
  };
  ws.on('message', listener);
  return () => {
    try {
      ws.off?.('message', listener);
    } catch {
      /* ignore */
    }
  };
}

/**
 * Subscribe to BOTH @ptdl refresh signals (computed-settled + data-changed) at once. `handler` gets the
 * list of changed collection names, or `null` when the signal carried none (meaning "refresh everything").
 * Returns a single unsubscribe function. This is what count surfaces (badge / filter-tree) use to re-fetch
 * only the collections that changed.
 */
export function onLiveRefresh(
  app: any,
  handler: (collections: string[] | null) => void,
): () => void {
  const pick = (payload: any) =>
    handler(Array.isArray(payload?.collections) && payload.collections.length ? payload.collections : null);
  const offA = onWsMessage(app, DATA_CHANGED_TYPE, pick);
  const offB = onWsMessage(app, LIVE_REFRESH_TYPE, pick);
  return () => {
    offA();
    offB();
  };
}

/**
 * Refetch every data block on the page. `flowEngine.forEachModel` yields ONLY the top-level "chrome"
 * models (layout / menu / RouteModel) — none of which own a `resource`; the real data blocks live deeper
 * (a page-scoped engine) reached via `.subModels`. So recurse from each top model, calling
 * `resource.refresh()` on any model that has one. Dedup by model reference so a shared/cyclic subtree
 * cannot loop.
 */
export function refreshFlowBlocks(flowEngine: any): void {
  if (!flowEngine?.forEachModel) return;
  const seen = new Set<any>();
  const visit = (m: any) => {
    if (!m || seen.has(m)) return;
    seen.add(m);
    try {
      m?.resource?.refresh?.();
    } catch {
      /* ignore a single block */
    }
    const sm = m?.subModels;
    if (sm) {
      for (const k of Object.keys(sm)) {
        const v = sm[k];
        if (Array.isArray(v)) v.forEach(visit);
        else visit(v);
      }
    }
  };
  try {
    flowEngine.forEachModel((m: any) => visit(m));
  } catch {
    /* ignore */
  }
}
