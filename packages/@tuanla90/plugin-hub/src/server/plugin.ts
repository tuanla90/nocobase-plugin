import { Plugin } from '@nocobase/server';
import path from 'path';

/**
 * Plugin Hub — install & update @tuanla90 plugins from a manifest, in one place.
 *
 * The Hub fetches a MANIFEST JSON (default = the public repo's `latest/index.json`) listing
 * `{ packageName, version, url }` per plugin, compares each to what's installed (via the pm
 * repository), and drives NocoBase's own plugin manager to apply changes:
 *   - install  → `pm add <url>` via runAsCLI (downloads + registers; ends DISABLED) — or the
 *                in-process installOnly/installEnable variants (see each handler's comment)
 *   - enable   → in-process `pm.enable(pkg)` (runs migrations + enables; app reloads)
 *   - update   → in-process `pm.upgradeByCompressedFileUrl` + require-cache purge + reload (the CLI
 *                `pm update` restarts via pm2, which no-ops on Docker/Railway — see updateAction)
 * Mutations are fire-and-forget (the app reloads) — the client polls health then re-checks.
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
        // NOTE (2 traps): (1) handler METHODS must NOT be named install/enable/update/upgrade — they collide
        // with the Plugin lifecycle methods (Plugin.install() etc.) NocoBase calls with no ctx; (2) the ACTION
        // name 'update' is a RESERVED resourcer action → NocoBase auto-enforces `filterByTk` on it ("to do
        // update action, filter or filterByTk is required"), rejecting our handler. So expose it as 'updatePlugin'.
        install: this.installAction,
        installEnable: this.installEnableAction,
        installOnly: this.installOnlyAction, // download + register as DISABLED, NO reload (for heavy apps)
        enable: this.enableAction,
        updatePlugin: this.updateAction,
        disable: this.disableAction,
        uninstall: this.uninstallAction, // NOT 'remove' — that's a reserved association action
      },
      only: ['getConfig', 'saveConfig', 'check', 'install', 'installEnable', 'installOnly', 'enable', 'updatePlugin', 'disable', 'uninstall'],
    });
    // System collection isn't covered by the admin role strategy → grant explicitly. Reads are for any
    // logged-in user; mutating actions additionally require the `root` role (checked in-handler).
    this.app.acl.allow('ptdlPluginHub', ['getConfig', 'check', 'saveConfig', 'install', 'installEnable', 'installOnly', 'enable', 'updatePlugin', 'disable', 'uninstall'], 'loggedIn');

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
    // FIRE-AND-FORGET (do NOT await) — exactly like NocoBase's own pm:add HTTP action. `pm add` downloads the
    // files then runs `yarn nocobase pm2-restart` to register the plugin; AWAITING it broke that restart (0.1.5
    // regression → "Install spins forever"). The client polls `check` (waitForStatus) for the real result.
    try { this.runPm(['add', url]); } catch (e: any) { ctx.body = { ok: false, error: 'pm add lỗi: ' + (e?.message || e) }; await next(); return; }
    ctx.body = { ok: true, pending: true, op: 'install' };
    await next();
  };

  // Install + enable a plugin IN-PROCESS, but FIRE-AND-FORGET (do NOT await the chain in-request).
  //  • `addByCompressedFileUrl` downloads+links the files — the SAME step `pm add` uses, minus the external
  //    `yarn nocobase pm2-restart` that silently no-ops on non-pm2 deploys (Docker/Railway) → "downloads but
  //    never registers". Plain HTTP download + copy, no restart.
  //  • `pm.enable` then auto-registers it (addOrThrow), runs migrations, writes the applicationPlugins row
  //    (enabled+installed), and reloads via `tryReloadOrRestart` — the in-process reload the native Plugin
  //    Manager's own enable uses (proven to work here: Bulk enable reaches "syncing database…").
  // WHY fire-and-forget: `pm.enable` ends by tearing the app down to reload; AWAITING it inside the HTTP
  // request aborts the enable before its row commits (the 0.1.10 "downloaded but stays disabled" bug). Detached,
  // the response has already flushed → row write → reload runs cleanly in the background. It also means a big
  // plugin's slow download can't trip a proxy timeout. The client polls `check` (waitForStatus) for the result.
  private installEnableAction = async (ctx: any, next: any) => {
    this.requireRoot(ctx);
    const v = ctx.action?.params?.values || {};
    const url = String(v.url || '').trim();
    const pkg = String(v.packageName || '').trim();
    if (!url || !pkg) { ctx.body = { ok: false, error: 'Thiếu url hoặc packageName' }; await next(); return; }
    const pm: any = this.app.pm;
    void (async () => {
      try {
        await pm.addByCompressedFileUrl({ compressedFileUrl: url });
        await pm.enable(pkg);
      } catch (e: any) {
        this.app.log?.error?.('[plugin-hub] installEnable failed for ' + pkg + ': ' + (e?.message || e));
      }
    })();
    ctx.body = { ok: true, pending: true, op: 'installEnable' };
    await next();
  };

  // Install (files only) — download + link the plugin AND register it in `applicationPlugins` as
  // DISABLED, but do NOT enable → NO app reload / db.sync. On a heavy app the enable-reload is the slow
  // step that trips the install poll timeout; splitting it lets Install finish in seconds. The plugin
  // then shows as "disabled" in BOTH Plugin Hub and the native Plugin manager, ready to Enable when the
  // user is willing to pay the single restart (there, or here). `enable` auto-registers from the linked
  // files (pm.enable → addOrThrow), so writing just the files + the disabled row is enough.
  // Fire-and-forget (download can be slow); the client polls `check` until the row appears ('disabled').
  private installOnlyAction = async (ctx: any, next: any) => {
    this.requireRoot(ctx);
    const v = ctx.action?.params?.values || {};
    const url = String(v.url || '').trim();
    const pkg = String(v.packageName || '').trim();
    const clientVersion = String(v.version || '').trim();
    if (!url || !pkg) { ctx.body = { ok: false, error: 'Thiếu url hoặc packageName' }; await next(); return; }
    const pm: any = this.app.pm;
    void (async () => {
      try {
        // 1) download + link the plugin files (no reload, no db.sync)
        await pm.addByCompressedFileUrl({ compressedFileUrl: url });
        // 2) resolve the canonical short name (the applicationPlugins PK) + version
        // The applicationPlugins PK `name` is what enable() looks up. NocoBase's parseName keeps the FULL
        // packageName as `name` for non-@nocobase scopes (verified live: every @tuanla90 row has
        // name === packageName), and only shortens @nocobase/plugin-*. So parseName is authoritative; the
        // fallback is the full packageName (NOT a shortened slug, which would mismatch enable()).
        const PM: any = pm.constructor;
        let name = '';
        try { const parsed = await PM.parseName(pkg); name = parsed?.name || ''; } catch { /* fallback below */ }
        if (!name) name = pkg;
        let version = clientVersion;
        if (!version) { try { const pj = await PM.getPackageJson(pkg); version = pj?.version || ''; } catch { /* best-effort */ } }
        // 3) write the DISABLED row → the plugin shows in the manager, ready to Enable. No reload.
        const repo = this.app.db.getRepository('applicationPlugins');
        await repo.updateOrCreate({ values: { name, packageName: pkg, enabled: false, installed: false, version }, filterKeys: ['name'] });
        this.app.log?.info?.('[plugin-hub] installOnly done (files + disabled row): ' + pkg + ' @ ' + version);
      } catch (e: any) {
        this.app.log?.error?.('[plugin-hub] installOnly failed for ' + pkg + ': ' + (e?.message || e));
      }
    })();
    ctx.body = { ok: true, pending: true, op: 'install' };
    await next();
  };

  // Enable = direct, FIRE-AND-FORGET `pm.enable` — the SAME in-process path the native Plugin Manager toggle
  // / Bulk enable use (proven to work on non-pm2 deploys), NOT `runAsCLI`. pm.enable writes the
  // applicationPlugins row (enabled: true) then reloads via tryReloadOrRestart. Detached so the HTTP response
  // flushes BEFORE that reload tears the app down (awaiting in-request would abort the row commit). Client
  // polls `check` for the result. NB: this cannot save a plugin whose CLIENT bundle crashes on load (e.g. an
  // unguarded optional-peer import) — that surfaces as a white-screen after the reload; fix the plugin, not this.
  private enableAction = async (ctx: any, next: any) => {
    this.requireRoot(ctx);
    const pkg = String(ctx.action?.params?.values?.packageName || '').trim();
    if (!pkg) { ctx.body = { ok: false, error: 'Thiếu packageName' }; await next(); return; }
    const pm: any = this.app.pm;
    void (async () => {
      try { await pm.enable(pkg); }
      catch (e: any) { this.app.log?.error?.('[plugin-hub] enable failed for ' + pkg + ': ' + (e?.message || e)); }
    })();
    ctx.body = { ok: true, pending: true, op: 'enable' };
    await next();
  };

  // Update = replace files IN-PROCESS, then purge the require cache and reload. The CLI path
  // (`runAsCLI(['pm','update',url])` → pm.update) replaces the files fine but restarts via
  // `execa('yarn',['nocobase','pm2-restart'])`, which silently no-ops on non-pm2 deploys
  // (Docker/Railway) → new dist on disk, OLD code still serving from RAM, row version never bumped —
  // the exact trap install already works around (installEnable). Three in-process steps instead:
  //   1) pm.upgradeByCompressedFileUrl — the SAME download+replace step pm.update uses (also verifies
  //      the plugin is registered; throws "<pkg> does not exist" otherwise).
  //   2) purge require.cache entries under the package dir — upstream PluginManager.clearCache is
  //      DISABLED (unconditional early return) and importModule is a plain require, so without this the
  //      reload's resolvePlugin would re-serve the cached old module and the update would be a no-op.
  //      Matched by path fragment (@scope/name normalized to the OS separator) → hits both the
  //      node_modules link and its storage/plugins target, including the plugin's bundled deps.
  //   3) bump the applicationPlugins row version (from the NEW package.json) so `check` reports
  //      up-to-date, then tryReloadOrRestart — the same in-process reload pm.enable ends with (proven
  //      on these deploys); with the cache purged it re-requires the NEW dist.
  // Fire-and-forget like enable: the reload tears the app down; awaiting it in-request would abort it.
  // The client polls `check` (waitForStatus/waitAppReady) for the result.
  private updateAction = async (ctx: any, next: any) => {
    this.requireRoot(ctx);
    const v = ctx.action?.params?.values || {};
    const url = String(v.url || '').trim();
    const pkg = String(v.packageName || '').trim();
    if (!url) { ctx.body = { ok: false, error: 'Thiếu url' }; await next(); return; }
    const pm: any = this.app.pm;
    void (async () => {
      try {
        await pm.upgradeByCompressedFileUrl({ compressedFileUrl: url });
        if (pkg) {
          const needle = path.sep + pkg.replace('/', path.sep) + path.sep;
          for (const key of Object.keys(require.cache)) {
            if (key.includes(needle)) delete require.cache[key];
          }
          try {
            const PM: any = pm.constructor;
            const pj = await PM.getPackageJson(pkg); // reads the freshly replaced storage/plugins package.json
            if (pj?.version) {
              await this.app.db.getRepository('applicationPlugins').update({ filter: { packageName: pkg }, values: { version: pj.version } });
            }
          } catch { /* best-effort — status self-heals on next full restart */ }
        } else {
          this.app.log?.warn?.('[plugin-hub] update without packageName — require cache NOT purged; a full restart is needed to load the new code');
        }
        await this.app.tryReloadOrRestart();
      } catch (e: any) {
        this.app.log?.error?.('[plugin-hub] update failed for ' + (pkg || url) + ': ' + (e?.message || e));
      }
    })();
    ctx.body = { ok: true, pending: true, op: 'update' };
    await next();
  };

  private disableAction = async (ctx: any, next: any) => {
    this.requireRoot(ctx);
    const pkg = String(ctx.action?.params?.values?.packageName || '').trim();
    if (!pkg) { ctx.body = { ok: false, error: 'Thiếu packageName' }; await next(); return; }
    try { this.runPm(['disable', pkg]); } catch (e: any) { ctx.body = { ok: false, error: 'pm disable lỗi: ' + (e?.message || e) }; await next(); return; }
    ctx.body = { ok: true, pending: true, op: 'disable' };
    await next();
  };

  private uninstallAction = async (ctx: any, next: any) => {
    this.requireRoot(ctx);
    const pkg = String(ctx.action?.params?.values?.packageName || '').trim();
    if (!pkg) { ctx.body = { ok: false, error: 'Thiếu packageName' }; await next(); return; }
    try { this.runPm(['remove', pkg]); } catch (e: any) { ctx.body = { ok: false, error: 'pm remove lỗi: ' + (e?.message || e) }; await next(); return; }
    ctx.body = { ok: true, pending: true, op: 'uninstall' };
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
