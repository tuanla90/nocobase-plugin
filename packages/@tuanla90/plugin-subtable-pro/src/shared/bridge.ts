/**
 * Bridge — client-side, single-tab pub/sub used by the (v2) "receive events from another Table block"
 * feature. NOT wired into the widget yet in v0; shipped now so the API is stable.
 *
 * A source block publishes an event on a channel (via a RunJS action, e.g.
 *   ctx.app.ptdlBridge.publish('cart', { action: 'add', record: ctx.record })
 * ), and a Sub-table Pro widget configured with that channel subscribes and mutates its own field value.
 * Everything is in-memory in one browser tab — no server round-trip, no multi-device sync (that would be
 * a v3 WebSocket concern). See docs/SUBTABLE-PRO-DESIGN.md §2.2.
 */

export type BridgeAction = 'add' | 'inc' | 'dec' | 'remove' | 'set';
export interface BridgeEvent {
  action: BridgeAction;
  record: any;
  /** optional quantity delta for inc/dec; defaults to 1 */
  delta?: number;
}
type Listener = (ev: BridgeEvent) => void;
/** membership = map of source-key → quantity currently in the receiver (cart). qty 0/absent = not in cart. */
export type MemberCounts = Record<string, number>;
type MemberListener = (counts: MemberCounts) => void;

interface Channel {
  last?: BridgeEvent;
  listeners: Set<Listener>;
  // The cart broadcasts this so a source-side control (checkbox / +/− with number) can reflect membership
  // AND the current quantity of its record. Reverse of publish/subscribe.
  members: MemberCounts;
  memberListeners: Set<MemberListener>;
}

export interface PtdlBridge {
  publish(channel: string, ev: BridgeEvent): void;
  subscribe(channel: string, cb: Listener): () => void;
  getLast(channel: string): BridgeEvent | undefined;
  /** cart → broadcast {key: qty} of what it currently holds */
  setMembers(channel: string, counts: MemberCounts): void;
  getMembers(channel: string): MemberCounts;
  /** source → react to membership/qty changes (returns unsubscribe) */
  onMembers(channel: string, cb: MemberListener): () => void;
}

function createBridge(): PtdlBridge {
  const channels = new Map<string, Channel>();
  const chan = (name: string): Channel => {
    let c = channels.get(name);
    if (!c) {
      c = { listeners: new Set(), members: {}, memberListeners: new Set() };
      channels.set(name, c);
    }
    return c;
  };
  return {
    publish(channel, ev) {
      const c = chan(channel);
      c.last = ev;
      c.listeners.forEach((fn) => {
        try {
          fn(ev);
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error('[subtable-pro] bridge listener threw', e);
        }
      });
    },
    subscribe(channel, cb) {
      const c = chan(channel);
      c.listeners.add(cb);
      return () => c.listeners.delete(cb);
    },
    getLast(channel) {
      return channels.get(channel)?.last;
    },
    setMembers(channel, counts) {
      const c = chan(channel);
      const next: MemberCounts = {};
      for (const k of Object.keys(counts || {})) if (counts[k] != null) next[k] = counts[k];
      // skip if unchanged (avoids render loops)
      const a = Object.keys(next).sort();
      const b = Object.keys(c.members).sort();
      if (a.length === b.length && a.every((k, i) => k === b[i] && next[k] === c.members[k])) return;
      c.members = next;
      c.memberListeners.forEach((fn) => {
        try {
          fn(next);
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error('[subtable-pro] bridge member listener threw', e);
        }
      });
    },
    getMembers(channel) {
      return channels.get(channel)?.members || {};
    },
    onMembers(channel, cb) {
      const c = chan(channel);
      c.memberListeners.add(cb);
      return () => c.memberListeners.delete(cb);
    },
  };
}

/** Singleton per browser tab, attached to the app in both lanes so RunJS (ctx.app) can reach it. */
export function installBridge(app: any): PtdlBridge {
  const g: any = globalThis as any;
  if (!g.__ptdlBridge) g.__ptdlBridge = createBridge();
  if (app && !app.ptdlBridge) {
    try {
      app.ptdlBridge = g.__ptdlBridge;
    } catch (_) {
      /* app may be frozen — global still works */
    }
  }
  return g.__ptdlBridge;
}

export function getBridge(): PtdlBridge {
  const g: any = globalThis as any;
  if (!g.__ptdlBridge) g.__ptdlBridge = createBridge();
  return g.__ptdlBridge;
}
