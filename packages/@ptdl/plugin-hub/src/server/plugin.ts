import { Plugin } from '@nocobase/server';
import path from 'path';

/**
 * Plugin Hub — install & update @ptdl plugins from a manifest, in one place.
 *
 * The Hub fetches a MANIFEST JSON (default = the public repo's `latest/index.json`) listing
 * `{ packageName, version, url }` per plugin, compares each to what's installed (via the pm
 * repository), and drives NocoBase's own plugin manager to apply changes:
 *   - install  → `pm add <url>`      (downloads + registers; ends DISABLED)
 *   - enable   → `pm enable <pkg>`   (runs migrations + enables; app reloads)
 *   - update   → `pm update <url>`   (replaces files of an installed plugin; app reloads)
 * These fire via `app.runAsCLI(...)` exactly like NocoBase's own `pm:add` HTTP action, and are
 * fire-and-forget (the app reloads) — the client polls health then re-checks.
 *
 * A weekly timer re-checks and stores `updatesAvailable` — NOTIFY only, never auto-applies (installing
 * code without review is opt-out-by-design). Dangerous actions (install/enable/update/saveConfig) are
 * gated to the `root` role in-handler on top of the loggedIn ACL. See
 * [[reference_ptdl_railway_url_install]] + [[reference_nocobase_acl_system_collection_writes]].
 */

export interface HubConfig {
  manifestUrl: string;
  weeklyCheck: boolean;
  lastChecked: string | null;
  updatesAvailable: number;
}

const DEFAULT_MANIFEST = 'https://raw.githubusercontent.com/tuanla90/nocobase-plugin/main/latest/index.json';

export const DEFAULTS: HubConfig = {
  manifestUrl: DEFAULT_MANIFEST,
  weeklyCheck: true,
  lastChecked: null,
  updatesAvailable: 0,
};

const WEEK_MS = 7 * 24 * 3600 * 1000;

/** semver-ish compare: 1 if a>b, -1 if a<b, 0 equal. Numeric per dotted segment (so 0.6.10 > 0.6.9),
 *  a release (no `-pre`) ranks above its prerelease, and prerelease segments compare numeric-then-lexical. */
export function cmpVer(a: string, b: string): number {
  const parse = (v: string) => {
    const [main, pre = ''] = String(v || '0').split('-');
    return { nums: main.split('.').map((n) => parseInt(n, 10) || 0), pre };
  };
  const A = parse(a), B = parse(b);
  const len = Math.max(A.nums.length, B.nums.length);
  for (let i = 0; i < len; i++) {
    const d = (A.nums[i] || 0) - (B.nums[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  if (!A.pre && B.pre) return 1;
  if (A.pre && !B.pre) return -1;
  if (A.pre === B.pre) return 0;
  const ap = A.pre.split('.'), bp = B.pre.split('.');
  for (let i = 0; i < Math.max(ap.length, bp.length); i++) {
    const x = ap[i], y = bp[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const nx = parseInt(x, 10), ny = parseInt(y, 10);
    if (!isNaN(nx) && !isNaN(ny)) { if (nx !== ny) return nx > ny ? 1 : -1; }
    else if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}

export class PluginPluginHubServer extends Plugin {
  private timer: any = null;

  async load() {
    await this.db.import({ directory: path.resolve(__dirname, 'collections') });

    this.app.resourcer.define({
      name: 'ptdlPluginHub',
      actions: {
        getConfig: this.getConfig,
        saveConfig: this.saveConfig,
        check: this.check,
        // NOTE: handler methods must NOT be named install/enable/update/upgrade — those collide with
        // the Plugin lifecycle methods (Plugin.install() etc.), which NocoBase calls with no ctx.
        install: this.installAction,
        enable: this.enableAction,
        update: this.updateAction,
      },
      only: ['getConfig', 'saveConfig', 'check', 'install', 'enable', 'update'],
    });
    // System collection isn't covered by the admin role strategy → grant explicitly. Reads are for any
    // logged-in user; mutating actions additionally require the `root` role (checked in-handler).
    this.app.acl.allow('ptdlPluginHub', ['getConfig', 'check', 'saveConfig', 'install', 'enable', 'update'], 'loggedIn');

    // Weekly NOTIFY check (never auto-applies). Start after the app is up.
    this.app.on('afterStart', () => {
      try {
        setTimeout(() => this.weeklyTick(), 60 * 1000);
        this.timer = setInterval(() => this.weeklyTick(), 6 * 3600 * 1000);
      } catch { /* ignore */ }
    });
  }

  async unload() {
    try { if (this.timer) clearInterval(this.timer); } catch { /* ignore */ }
  }

  // ── config ────────────────────────────────────────────────────────────────────────────────────
  private async loadConfig(): Promise<HubConfig> {
    try {
      const row = await this.db.getRepository('ptdlPluginHubConfig').findOne({ filter: { key: 'global' } });
      return { ...DEFAULTS, ...(row?.options || {}) };
    } catch { return { ...DEFAULTS }; }
  }

  private async saveConfigObj(patch: Partial<HubConfig>): Promise<HubConfig> {
    const repo = this.db.getRepository('ptdlPluginHubConfig');
    const existing = await repo.findOne({ filter: { key: 'global' } });
    const options: HubConfig = { ...DEFAULTS, ...(existing?.options || {}), ...patch };
    if (existing) await repo.update({ filterByTk: existing.id, values: { options } });
    else await repo.create({ values: { key: 'global', options } });
    return options;
  }

  // packageName → { version, enabled } for every registered plugin.
  private async installedMap(): Promise<Record<string, { version: string; enabled: boolean }>> {
    const out: Record<string, { version: string; enabled: boolean }> = {};
    try {
      const repo = (this.app.pm as any)?.repository || this.db.getRepository('applicationPlugins');
      const rows = await repo.find();
      for (const r of rows) {
        const j = typeof r?.toJSON === 'function' ? r.toJSON() : r;
        if (j?.packageName) out[j.packageName] = { version: j.version || '', enabled: !!j.enabled };
      }
    } catch { /* table may not exist yet */ }
    return out;
  }

  private async fetchManifest(url: string): Promise<any> {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 15000);
    try {
      const res = await (globalThis as any).fetch(url, { signal: ctrl.signal, headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } finally { clearTimeout(to); }
  }

  /** Build the per-plugin status list from a manifest + the installed map. */
  private diff(manifest: any, installed: Record<string, { version: string; enabled: boolean }>) {
    const plugins = Array.isArray(manifest?.plugins) ? manifest.plugins : [];
    let updatesAvailable = 0;
    const items = plugins.map((p: any) => {
      const cur = installed[p.packageName];
      const installedVersion = cur?.version || '';
      let status: 'not-installed' | 'disabled' | 'update' | 'up-to-date';
      if (!cur) status = 'not-installed';
      else if (!cur.enabled) status = 'disabled';
      else if (cmpVer(p.version, installedVersion) > 0) { status = 'update'; updatesAvailable++; }
      else status = 'up-to-date';
      return {
        packageName: p.packageName,
        slug: p.slug || String(p.packageName || '').split('/').pop()?.replace(/^plugin-/, ''),
        displayName: p.displayName || p.slug || p.packageName,
        availableVersion: p.version,
        installedVersion,
        enabled: cur?.enabled ?? false,
        status,
        url: p.url,
      };
    });
    return { items, updatesAvailable };
  }

  private requireRoot(ctx: any) {
    const roles = ctx.state?.currentRoles;
    const ok = Array.isArray(roles) ? roles.includes('root') : roles === 'root';
    if (!ok) ctx.throw(403, 'Chỉ role root mới được cài/cập nhật plugin / Only the root role may install or update plugins');
  }

  // ── actions ───────────────────────────────────────────────────────────────────────────────────
  private getConfig = async (ctx: any, next: any) => {
    ctx.body = await this.loadConfig();
    await next();
  };

  private saveConfig = async (ctx: any, next: any) => {
    this.requireRoot(ctx);
    const v = ctx.action?.params?.values || {};
    const patch: Partial<HubConfig> = {};
    if (typeof v.manifestUrl === 'string' && v.manifestUrl.trim()) patch.manifestUrl = v.manifestUrl.trim();
    if (typeof v.weeklyCheck === 'boolean') patch.weeklyCheck = v.weeklyCheck;
    ctx.body = await this.saveConfigObj(patch);
    await next();
  };

  private check = async (ctx: any, next: any) => {
    const cfg = await this.loadConfig();
    const url = String(ctx.action?.params?.values?.manifestUrl || cfg.manifestUrl || '').trim();
    let manifest: any;
    try { manifest = await this.fetchManifest(url); }
    catch (e: any) { ctx.body = { ok: false, error: 'Không tải được manifest: ' + (e?.message || e) }; await next(); return; }
    const installed = await this.installedMap();
    const { items, updatesAvailable } = this.diff(manifest, installed);
    await this.saveConfigObj({ lastChecked: new Date().toISOString(), updatesAvailable });
    ctx.body = { ok: true, updatesAvailable, count: items.length, items, manifestUrl: url, manifestUpdatedAt: manifest?.updatedAt || null };
    await next();
  };

  private runPm(args: string[]) {
    // Fire-and-forget, exactly like NocoBase's own pm:add HTTP action (resource.js). The app reloads;
    // the client polls health then re-checks.
    this.app.runAsCLI(['pm', ...args], { from: 'user' });
  }

  private installAction = async (ctx: any, next: any) => {
    this.requireRoot(ctx);
    const url = String(ctx.action?.params?.values?.url || '').trim();
    if (!url) { ctx.body = { ok: false, error: 'Thiếu url' }; await next(); return; }
    try { this.runPm(['add', url]); } catch (e: any) { ctx.body = { ok: false, error: 'pm add lỗi: ' + (e?.message || e) }; await next(); return; }
    ctx.body = { ok: true, pending: true, op: 'install' };
    await next();
  };

  private enableAction = async (ctx: any, next: any) => {
    this.requireRoot(ctx);
    const pkg = String(ctx.action?.params?.values?.packageName || '').trim();
    if (!pkg) { ctx.body = { ok: false, error: 'Thiếu packageName' }; await next(); return; }
    try { this.runPm(['enable', pkg]); } catch (e: any) { ctx.body = { ok: false, error: 'pm enable lỗi: ' + (e?.message || e) }; await next(); return; }
    ctx.body = { ok: true, pending: true, op: 'enable' };
    await next();
  };

  private updateAction = async (ctx: any, next: any) => {
    this.requireRoot(ctx);
    const url = String(ctx.action?.params?.values?.url || '').trim();
    if (!url) { ctx.body = { ok: false, error: 'Thiếu url' }; await next(); return; }
    try { this.runPm(['update', url]); } catch (e: any) { ctx.body = { ok: false, error: 'pm update lỗi: ' + (e?.message || e) }; await next(); return; }
    ctx.body = { ok: true, pending: true, op: 'update' };
    await next();
  };

  // ── weekly notify ───────────────────────────────────────────────────────────────────────────────
  private async weeklyTick() {
    try {
      const cfg = await this.loadConfig();
      if (!cfg.weeklyCheck) return;
      const last = cfg.lastChecked ? Date.parse(cfg.lastChecked) : 0;
      if (Date.now() - last < WEEK_MS) return;
      const manifest = await this.fetchManifest(cfg.manifestUrl).catch(() => null);
      if (!manifest?.plugins) return;
      const installed = await this.installedMap();
      const { updatesAvailable } = this.diff(manifest, installed);
      await this.saveConfigObj({ lastChecked: new Date().toISOString(), updatesAvailable });
      this.app.log?.info?.(`[plugin-hub] weekly check: ${updatesAvailable} update(s) available`);
    } catch { /* best-effort */ }
  }
}

export default PluginPluginHubServer;
