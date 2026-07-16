import { setSharedT, SHARED_NS, sharedEnUS } from '@ptdl/shared';
import { setActionEnhI18n, NS } from './i18n';
import { patchActionColor } from './patchActionColor';
import { patchActionBarLayout } from './patchActionBarLayout';
import { registerSearchAction } from './searchAction';
import { registerFilterAction } from './filterAction';
import viVN from '../locale/vi-VN.json';
import enUS from '../locale/en-US.json';

/**
 * Single lane-agnostic registration path shared by BOTH clients (classic `/admin` and modern `/v/`).
 * Both lanes host a flow-engine, so the ActionModel/block patches are identical; only the Plugin base
 * class differs per lane. Keeping the sequence here stops the two entry files from drifting.
 */
export interface RegisterAllDeps {
  flowEngine: any;
  i18n?: any;
  tExpr: (s: string, o?: any) => any;
  lane: string; // 'client' | 'client-v2'
}

export function registerAll(deps: RegisterAllDeps) {
  const { flowEngine, i18n, tExpr, lane } = deps;

  // English-source plugin — register both languages under our namespace, each lane.
  try {
    i18n?.addResources?.('en-US', NS, enUS);
    i18n?.addResources?.('vi-VN', NS, viVN);
    setActionEnhI18n(i18n);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(`[action-enh] (${lane}) i18n addResources failed`, e);
  }

  // @ptdl/shared's own render strings (VN-string-as-key under SHARED_NS) — make them bilingual too.
  try {
    if (i18n?.t) {
      i18n.addResources?.('en-US', SHARED_NS, sharedEnUS);
      setSharedT((s: string, o?: any) => i18n.t(s, { ns: SHARED_NS, ...(o || {}) }));
    }
  } catch (e) {
    /* i18n optional */
  }

  if (!flowEngine) {
    // eslint-disable-next-line no-console
    console.warn(`[action-enh] (${lane}) no flowEngine on this lane — nothing to patch`);
    return;
  }

  // Feature A — deep per-button colour.
  patchActionColor({ flowEngine, tExpr, lane });

  // Feature B — per-block action-bar layout.
  patchActionBarLayout({ flowEngine, tExpr, lane });

  // Search bar as an addable toolbar action (table).
  registerSearchAction({ flowEngine, tExpr, lane });

  // Filter bar (inline dropdown + date-range filters) as an addable toolbar action (table).
  registerFilterAction({ flowEngine, tExpr, lane });
}
