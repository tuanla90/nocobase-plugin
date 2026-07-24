import { Plugin } from '@nocobase/server';
import { GenerateManager } from './generator';
import type { LineGenConfig } from '../shared/types';

// Server lane. Owns:
//  - the config store collection `ptdl_linegen_rules` (one row per generator; the full LineGenConfig
//    lives in the `config` JSON column, with key/enabled/sourceCollection denormalized for querying).
//  - the `ptdlLineGen` resource: rulesFor (which generators apply to a collection), preview (dry-run),
//    generate (write child rows + parent bookkeeping in one transaction).
export class PluginLineGeneratorServer extends Plugin {
  manager!: GenerateManager;
  /** sourceCollection -> enabled auto-trigger configs (rebuilt on any rule change). */
  private autoConfigs: Map<string, LineGenConfig[]> = new Map();
  /** collections whose save-hooks are already attached (hooks stay; autoConfigs decides if they act). */
  private hooked = new Set<string>();
  /** re-entrancy locks `${key}:${tk}` so a run can't cascade into itself. */
  private running = new Set<string>();

  async load() {
    const db: any = this.db;
    this.manager = new GenerateManager(db, this.app.logger);
    // Reuse the established @tuanla90 live-refresh convention (same signal formula/computed emits).
    this.manager.notify = (collections: string[]) => {
      this.app.emit('ws:sendToCurrentApp', { message: { type: 'ptdl:live-refresh', payload: { collections } } });
    };

    const ui = (title: string, comp = 'Input', extra: any = {}) => ({
      type: comp === 'Checkbox' ? 'boolean' : 'string',
      title,
      'x-component': comp,
      'x-decorator': 'FormItem',
      ...extra,
    });
    db.collection({
      name: 'ptdl_linegen_rules',
      title: 'Bộ sinh dòng (Line generators)',
      fields: [
        { type: 'string', name: 'key', unique: true, uiSchema: ui('Key') },
        { type: 'string', name: 'title', uiSchema: ui('Tên') },
        { type: 'boolean', name: 'enabled', defaultValue: true, uiSchema: ui('Bật', 'Checkbox') },
        { type: 'string', name: 'sourceCollection', uiSchema: ui('Bảng nguồn') },
        { type: 'json', name: 'config' }, // the full LineGenConfig
      ],
    });
    // Keep the denormalized columns in sync with the authoritative `config` JSON.
    db.on('ptdl_linegen_rules.beforeSave', (model: any) => {
      const cfg = model.get('config') || {};
      if (cfg.key) model.set('key', cfg.key);
      if (cfg.sourceCollection) model.set('sourceCollection', cfg.sourceCollection);
      if (typeof cfg.enabled === 'boolean') model.set('enabled', cfg.enabled);
      if (cfg.title) model.set('title', cfg.title);
    });
    try {
      await db.getCollection('ptdl_linegen_rules').sync();
    } catch (e: any) {
      this.app.logger?.warn?.(`[line-generator] rules sync failed: ${e?.message || e}`);
    }

    // Reading the rule catalog is open (the client needs it to decide which buttons to show + their
    // guard). Writing rule config is admin-gated (snippet below).
    this.app.acl.allow('ptdl_linegen_rules', ['list', 'get'], 'loggedIn');
    this.app.acl.registerSnippet({
      name: 'pm.data-source-manager.ptdl-linegen',
      actions: ['ptdl_linegen_rules:create', 'ptdl_linegen_rules:update', 'ptdl_linegen_rules:updateOrCreate', 'ptdl_linegen_rules:destroy'],
    });

    // ---- AUTO trigger (ai-column autorun pattern) -------------------------------------------------
    // A save-hook on each auto-config's sourceCollection re-runs the generator whenever a record
    // satisfies the config's condition. run() re-checks the condition itself, so the hook can fire
    // liberally: guard-failed results are silent no-ops. Loop safety: (1) our parentUpdates carries a
    // context marker the handler ignores, (2) a per-(rule,record) re-entrancy lock.
    const attachAutoHook = (col: string) => {
      if (this.hooked.has(col)) return;
      this.hooked.add(col);
      const handler = (model: any, options: any) => {
        if (options?.context?.__ptdlLineGenInternal) return; // our own bookkeeping write
        const cfgs = this.autoConfigs.get(col) || [];
        if (!cfgs.length) return;
        const tk = model?.get?.('id') ?? model?.id;
        if (tk == null) return;
        const go = async () => {
          for (const c of cfgs) {
            const lock = `${c.key}:${tk}`;
            if (this.running.has(lock)) continue;
            this.running.add(lock);
            try {
              const res = await this.manager.run(c, tk, { dryRun: false });
              if (res?.ok) this.app.logger?.info?.(`[line-generator] auto-run ${c.key} #${tk}: created ${res.created}`);
              else if (res?.error && res.error !== 'guard-failed') this.app.logger?.warn?.(`[line-generator] auto-run ${c.key} #${tk}: ${res.error} ${res.detail || ''}`);
            } catch (e: any) {
              this.app.logger?.error?.(`[line-generator] auto-run ${c.key} #${tk} failed: ${e?.message || e}`);
            } finally {
              this.running.delete(lock);
            }
          }
        };
        const t = options?.transaction;
        const fire = () => go().catch((e) => this.app.logger?.error?.(`[line-generator] auto-run failed: ${e?.message || e}`));
        if (t && typeof t.afterCommit === 'function') t.afterCommit(fire);
        else fire();
      };
      db.on(`${col}.afterCreateWithAssociations`, handler);
      db.on(`${col}.afterUpdateWithAssociations`, handler);
    };
    const reloadAutoConfigs = async () => {
      try {
        const rows = await db.getRepository('ptdl_linegen_rules').find({ filter: { enabled: true } });
        const map = new Map<string, LineGenConfig[]>();
        for (const r of rows || []) {
          const c = (r.get ? r.get('config') : r.config) as LineGenConfig;
          if (!c?.key || c.trigger !== 'auto' || !c.sourceCollection) continue;
          if (!map.has(c.sourceCollection)) map.set(c.sourceCollection, []);
          map.get(c.sourceCollection)!.push(c);
        }
        this.autoConfigs = map;
        for (const col of map.keys()) attachAutoHook(col);
        if (map.size) this.app.logger?.info?.(`[line-generator] auto-trigger active on: ${[...map.keys()].join(', ')}`);
      } catch (e: any) {
        this.app.logger?.warn?.(`[line-generator] reload auto configs failed: ${e?.message || e}`);
      }
    };
    this.app.on('afterStart', reloadAutoConfigs);
    const onRuleChange = (model: any, options: any) => {
      const t = options?.transaction;
      const go = () => reloadAutoConfigs();
      if (t && typeof t.afterCommit === 'function') t.afterCommit(go);
      else go();
    };
    db.on('ptdl_linegen_rules.afterSave', onRuleChange);
    db.on('ptdl_linegen_rules.afterDestroy', onRuleChange);

    const loadConfig = async (ruleKey: string): Promise<LineGenConfig | null> => {
      const row = await db.getRepository('ptdl_linegen_rules').findOne({ filter: { key: ruleKey } });
      if (!row) return null;
      const cfg = (row.get ? row.get('config') : row.config) as LineGenConfig;
      return cfg && cfg.key ? cfg : null;
    };

    this.app.resourceManager.define({
      name: 'ptdlLineGen',
      actions: {
        // Which generators exist for a collection (feeds the button's rule-picker). Metadata only.
        // Returns ALL enabled configs INCLUDING auto — the guard is the AUTO/default condition, while a
        // button (placed + linkage-ruled by the UI builder like any core action) may trigger any rule
        // manually. `trigger` is included so pickers can label auto rules.
        rulesFor: async (ctx: any, next: any) => {
          const collection = ctx.action?.params?.collection || ctx.action?.params?.values?.collection;
          const rows = await db.getRepository('ptdl_linegen_rules').find({ filter: { enabled: true, sourceCollection: collection } });
          ctx.body = (rows || [])
            .map((r: any) => (r.get ? r.get('config') : r.config) || {})
            .map((c: any) => ({ key: c.key, title: c.title, sourceCollection: c.sourceCollection, targetPath: c.targetPath, trigger: c.trigger || 'manual', guard: c.guard || [] }));
          await next();
        },
        // Dry-run: evaluate + validate, return the rows that WOULD be written (+ skips) without writing.
        // ignoreGuard lets the dialog ALWAYS show the would-be result (guardOk/guardDetail carry the warning).
        preview: async (ctx: any, next: any) => {
          const v = ctx.action?.params?.values || ctx.action?.params || {};
          const config = await loadConfig(v.ruleKey);
          if (!config) { ctx.body = { ok: false, error: 'rule-not-found' }; return next(); }
          ctx.body = await this.manager.run(config, v.filterByTk, { userId: ctx.state?.currentUser?.id, dryRun: true, ignoreGuard: v.ignoreGuard === true });
          await next();
        },
        // Dry-run an INLINE config (not yet saved) — powers live preview in the settings editor.
        previewInline: async (ctx: any, next: any) => {
          const v = ctx.action?.params?.values || ctx.action?.params || {};
          const config = v.config as LineGenConfig;
          if (!config || !config.sourceCollection) { ctx.body = { ok: false, error: 'bad-config' }; return next(); }
          ctx.body = await this.manager.run(config, v.filterByTk, { userId: ctx.state?.currentUser?.id, dryRun: true, ignoreGuard: v.ignoreGuard !== false, debug: v.debug !== false });
          await next();
        },
        // Commit: write child rows + parent bookkeeping in one transaction. The config guard is the
        // AUTO/default condition; a MANUAL run may override it by sending ignoreGuard (the dialog asks
        // for an explicit confirm first). Auto-runs never send it — hooks always enforce the guard.
        generate: async (ctx: any, next: any) => {
          const v = ctx.action?.params?.values || ctx.action?.params || {};
          const config = await loadConfig(v.ruleKey);
          if (!config) { ctx.body = { ok: false, error: 'rule-not-found' }; return next(); }
          ctx.body = await this.manager.run(config, v.filterByTk, { userId: ctx.state?.currentUser?.id, dryRun: false, ignoreGuard: v.ignoreGuard === true });
          await next();
        },
      },
    });
    // Running/previewing a generator is a business action (accountants run commission) → any signed-in
    // user; the guard + record context bound the blast radius. Editing the rule config stays admin-only.
    this.app.acl.allow('ptdlLineGen', ['rulesFor', 'preview', 'generate'], 'loggedIn');
    // Inline preview is an editor/config action → admin-gated (same as editing rule config).
    this.app.acl.registerSnippet({ name: 'pm.data-source-manager.ptdl-linegen-preview', actions: ['ptdlLineGen:previewInline'] });
  }
}

export default PluginLineGeneratorServer;
