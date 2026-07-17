import { Plugin } from '@nocobase/server';
import path from 'path';
import { decide, parseList, normalizeIp, GuardConfig, GuardMode } from '../shared/ipMatch';

type AnyObj = Record<string, any>;

export type EnforcementScope = 'api' | 'app';

// The editable/stored shape (what the UI sends and getConfig returns). Lists are arrays of entries.
export interface IpGuardOptions {
  mode: GuardMode;
  enforcementScope: EnforcementScope; // 'api' = gate /api only; 'app' = gate every request (hard firewall)
  allowList: string[];
  denyList: string[];
  safeList: string[];
  allowLoopback: boolean;
  allowPrivate: boolean;
  trustProxy: boolean;
  forwardedHeader: string;
  blockMessage: string;
  blockStatus: number;
  logBlocked: boolean;
  logAllowed: boolean;
}

export const DEFAULT_OPTIONS: IpGuardOptions = {
  mode: 'off',
  enforcementScope: 'app',
  allowList: [],
  denyList: [],
  safeList: [],
  allowLoopback: true,
  allowPrivate: false,
  trustProxy: true,
  forwardedHeader: 'x-forwarded-for',
  blockMessage: 'Access denied: your IP address is not allowed.',
  blockStatus: 403,
  logBlocked: true,
  logAllowed: false,
};

const LOG_CAP = 500; // keep at most this many access-log rows
const API_GUARD_TAG = 'ptdlIpAccessGuard'; // resourcer lane (/api)
const APP_GUARD_TAG = 'ptdlIpAccessAppGuard'; // app lane (every request)
const LOG_DEDUPE_MS = 2000; // collapse repeat log rows from the same IP within this window

function normalizeOptions(raw: AnyObj | undefined): IpGuardOptions {
  const o = raw || {};
  const mode: GuardMode = ['off', 'monitor', 'blacklist', 'whitelist'].includes(o.mode) ? o.mode : 'off';
  return {
    mode,
    enforcementScope: o.enforcementScope === 'api' ? 'api' : 'app',
    allowList: parseList(o.allowList),
    denyList: parseList(o.denyList),
    safeList: parseList(o.safeList),
    allowLoopback: o.allowLoopback !== false,
    allowPrivate: !!o.allowPrivate,
    trustProxy: o.trustProxy !== false,
    forwardedHeader: (typeof o.forwardedHeader === 'string' && o.forwardedHeader.trim()) || 'x-forwarded-for',
    blockMessage: (typeof o.blockMessage === 'string' && o.blockMessage) || DEFAULT_OPTIONS.blockMessage,
    blockStatus: Number(o.blockStatus) || 403,
    logBlocked: o.logBlocked !== false,
    logAllowed: !!o.logAllowed,
  };
}

/**
 * IP whitelist / blacklist firewall. Two enforcement lanes, selected by `enforcementScope`:
 *   - 'app'  → an app-level `this.app.use` middleware registered `before: 'cors'`, so it gates EVERY
 *              request (the HTML shell, static assets, /api) — a true firewall: a blocked IP gets
 *              nothing.
 *   - 'api'  → a `resourcer.use` middleware gating only `/api` actions (data, sign-in, settings); the
 *              shell still loads but does nothing. Can never hard-brick the HTTP server.
 * Both guards are registered once; each no-ops unless it is the active lane, so only one ever acts.
 * Loopback is exempt by default and there is an always-allow admin safe-list, so a local (or
 * safe-listed) admin can always reach the settings page to recover. See README "Recovering from a lock-out".
 */
export class PluginIpGuardServer extends Plugin {
  private cfg: IpGuardOptions = { ...DEFAULT_OPTIONS };
  private logCounter = 0;
  private lastLogAt: Map<string, number> = new Map();

  async load() {
    const db: any = this.db;
    await db.import({ directory: path.resolve(__dirname, 'collections') });

    this.app.resourcer.define({
      name: 'ptdlIpAccessConfigs',
      actions: {
        getConfig: this.getConfig,
        saveConfig: this.saveConfig,
        testIp: this.testIp,
      },
      only: ['getConfig', 'saveConfig', 'testIp'],
    });
    this.app.resourcer.define({
      name: 'ptdlIpAccessLogs',
      actions: { clear: this.clearLogs },
      only: ['list', 'get', 'clear'],
    });

    // Both are system collections (dumpRules) → NOT covered by the admin role strategy, so grant the
    // settings endpoints explicitly (settings surface is admin-only in the UI). See
    // [[reference_nocobase_acl_system_collection_writes]].
    this.app.acl.allow('ptdlIpAccessConfigs', ['getConfig', 'saveConfig', 'testIp'], 'loggedIn');
    this.app.acl.allow('ptdlIpAccessLogs', ['list', 'get', 'clear'], 'loggedIn');

    const reload = async () => {
      try {
        const row = await db.getRepository('ptdlIpAccessConfigs').findOne({ filter: { key: 'global' } });
        this.cfg = normalizeOptions(row?.options);
      } catch (e) {
        // table may not exist on the very first load (before sync) — keep defaults / previous
      }
    };
    await reload();
    db.on('ptdlIpAccessConfigs.afterSave', reload);
    db.on('ptdlIpAccessConfigs.afterDestroy', reload);

    // Two gates, registered once; both read the live in-memory config so changes apply without a
    // restart, and each no-ops unless it is the active lane (enforcementScope).
    //  - app lane: run as early as possible (before CORS) so a blocked IP never even gets the shell.
    //    `before` targeting an absent tag is tolerated by NocoBase's toposort; the try/catch is belt
    //    and suspenders in case a version validates eagerly.
    try {
      this.app.use(this.appGuard, { tag: APP_GUARD_TAG, before: 'cors' });
    } catch (e) {
      try {
        this.app.use(this.appGuard, { tag: APP_GUARD_TAG });
      } catch (_) {
        /* ignore */
      }
    }
    //  - api lane: gates every /api action (proven resourcer.use pattern).
    this.app.resourcer.use(this.apiGuard, { tag: API_GUARD_TAG });
  }

  /** Resolve the caller's IP the same way the guard does, honouring the trust-proxy setting. */
  private resolveClientIp(ctx: any, cfg: IpGuardOptions): string {
    if (cfg.trustProxy) {
      const header = (cfg.forwardedHeader || 'x-forwarded-for').toLowerCase();
      const fwd = ctx.get?.(header) || ctx.req?.headers?.[header];
      if (fwd) {
        const first = String(fwd).split(',')[0].trim(); // original client = first hop
        if (first) return normalizeIp(first);
      }
      const real = ctx.get?.('x-real-ip');
      if (real) return normalizeIp(String(real).trim());
    }
    return normalizeIp(ctx.ip || ctx.request?.ip || ctx.req?.socket?.remoteAddress || '');
  }

  // ------------------------------------------------------------------ the guards
  // App lane: every request. API lane: /api actions. Each defers to the shared evaluator, which
  // no-ops unless its lane is the one the admin selected.
  private appGuard = (ctx: any, next: any) => this.evaluate(ctx, next, 'app');
  private apiGuard = (ctx: any, next: any) => this.evaluate(ctx, next, 'api');

  private evaluate = async (ctx: any, next: any, lane: EnforcementScope) => {
    const cfg = this.cfg;
    if (!cfg || cfg.mode === 'off') return next();
    // The api lane (resourcer.use) ALWAYS gates /api in both scopes — it is the reliable, proven gate.
    // The app lane (app.use) is the extra shell/static coverage, active only in 'app' scope. So if the
    // app-lane ends up ordered after the resourcer on some deployment, 'app' scope degrades safely to
    // 'api' behaviour (shell loads, /api still blocked) instead of leaving a hole.
    if (lane === 'app' && cfg.enforcementScope !== 'app') return next();
    if (ctx.state?.ptdlIpChecked) return next(); // already evaluated upstream (dedupe app+api lanes)
    if (ctx.state) ctx.state.ptdlIpChecked = true;

    let clientIp = '';
    try {
      clientIp = this.resolveClientIp(ctx, cfg);
      if (ctx.state) ctx.state.ptdlClientIp = clientIp;
      const d = decide(clientIp, cfg as unknown as GuardConfig);
      const enforced = !d.allow && cfg.mode !== 'monitor';

      if (enforced) {
        if (cfg.logBlocked) await this.writeLog(ctx, clientIp, 'deny', d.reason);
        ctx.throw(cfg.blockStatus || 403, cfg.blockMessage || DEFAULT_OPTIONS.blockMessage);
        return; // unreachable (throw), but keeps control-flow explicit
      }

      // Not enforced: monitor-mode would-be-denials are logged so the admin can preview impact;
      // allowed hits only when explicitly enabled (verbose — fires on every request).
      if (!d.allow && cfg.mode === 'monitor' && cfg.logBlocked) {
        await this.writeLog(ctx, clientIp, 'monitor', d.reason);
      } else if (d.allow && cfg.logAllowed) {
        await this.writeLog(ctx, clientIp, 'allow', d.reason);
      }
    } catch (e: any) {
      // A thrown block (enforced) must propagate; any OTHER error fails OPEN so an internal bug in
      // the guard can never lock everyone out.
      if (e && (e.status === (cfg.blockStatus || 403) || e.statusCode === (cfg.blockStatus || 403))) throw e;
    }
    await next();
  };

  // ------------------------------------------------------------------ logging (best-effort + capped + deduped)
  private async writeLog(ctx: any, ip: string, decisionLabel: string, reason: string) {
    // App-lane blocks can fire on many asset requests — collapse repeats from the same IP so the log
    // stays readable (and cheap).
    const now = Date.now();
    const last = this.lastLogAt.get(ip) || 0;
    if (now - last < LOG_DEDUPE_MS) return;
    this.lastLogAt.set(ip, now);
    if (this.lastLogAt.size > 2000) this.lastLogAt.clear();

    try {
      const repo = this.db.getRepository('ptdlIpAccessLogs');
      await repo.create({
        values: {
          ip,
          decision: decisionLabel,
          reason,
          mode: this.cfg.mode,
          method: ctx.request?.method || ctx.method || '',
          path: ctx.request?.path || ctx.path || '',
          userAgent: ctx.get?.('user-agent') || '',
          createdAt: new Date(),
        },
      });
      // Prune occasionally rather than on every write.
      if (++this.logCounter % 25 === 0) await this.pruneLogs(repo);
    } catch (e) {
      // never let logging affect the request
    }
  }

  private async pruneLogs(repo: any) {
    try {
      const total = await repo.count();
      if (total <= LOG_CAP) return;
      // Find the id boundary: the newest LOG_CAP rows are kept; anything older is deleted.
      const keep = await repo.find({ sort: ['-id'], limit: 1, offset: LOG_CAP });
      const boundary = keep?.[0]?.id;
      if (boundary) await repo.destroy({ filter: { id: { $lt: boundary } } });
    } catch (e) {
      // best-effort
    }
  }

  // ------------------------------------------------------------------ actions
  private getConfig = async (ctx: any, next: any) => {
    const row = await this.db.getRepository('ptdlIpAccessConfigs').findOne({ filter: { key: 'global' } });
    const options = normalizeOptions(row?.options);
    const callerIp = this.resolveClientIp(ctx, options);
    // raw client IP too, so the UI can warn when trust-proxy changes which address is seen
    const socketIp = normalizeIp(ctx.ip || ctx.req?.socket?.remoteAddress || '');
    ctx.body = {
      options,
      callerIp,
      socketIp,
      callerDecision: decide(callerIp, options as unknown as GuardConfig),
    };
    await next();
  };

  private saveConfig = async (ctx: any, next: any) => {
    const values = ctx.action?.params?.values || {};
    const incoming = values.options ?? values; // accept {options:{…}} or a bare options object
    const options = normalizeOptions(incoming);
    const repo = this.db.getRepository('ptdlIpAccessConfigs');
    const existing = await repo.findOne({ filter: { key: 'global' } });
    if (existing) {
      await repo.update({ filterByTk: existing.id, values: { options } });
    } else {
      await repo.create({ values: { key: 'global', options } });
    }
    await this.reloadNow();
    ctx.body = { options };
    await next();
  };

  private testIp = async (ctx: any, next: any) => {
    const params = ctx.action?.params || {};
    const raw = params.values?.ip ?? params.ip ?? '';
    const ip = normalizeIp(String(raw));
    ctx.body = { ip, decision: decide(ip, this.cfg as unknown as GuardConfig) };
    await next();
  };

  private clearLogs = async (ctx: any, next: any) => {
    try {
      await this.db.getRepository('ptdlIpAccessLogs').destroy({ truncate: true });
    } catch (e) {
      // ignore
    }
    ctx.body = { ok: true };
    await next();
  };

  private async reloadNow() {
    try {
      const row = await this.db.getRepository('ptdlIpAccessConfigs').findOne({ filter: { key: 'global' } });
      this.cfg = normalizeOptions(row?.options);
    } catch (e) {
      // ignore
    }
  }
}

export default PluginIpGuardServer;
