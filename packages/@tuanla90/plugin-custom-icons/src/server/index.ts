import { Plugin } from '@nocobase/server';
import { DEFAULT_ICON_REMAPS } from '../shared/defaultIconMap';

/**
 * Custom Icons server. Two jobs:
 *  1) Own the `ptdlIconRemaps` collection (sourceKey → lucideKey) that the client reads at startup to
 *     override NocoBase's built-in Ant Design icons with Lucide ones. (Merged in from the former
 *     standalone @tuanla90/plugin-icon-remap — same collection name, so existing rows are preserved.)
 *  2) Ship a BUNDLED default mapping (src/shared/defaultIconMap.ts, ~200 antd→lucide pairs) and seed it
 *     ONCE per instance, so a fresh install already Lucide-ifies the app chrome without a manual import.
 *     Seeding is upsert-missing: it never overwrites a row the user has customized or removed post-seed.
 */
export class PluginCustomIconsServer extends Plugin {
  async beforeLoad() {
    this.db.collection({
      name: 'ptdlIconRemaps',
      title: 'Icon remaps',
      fields: [
        { type: 'string', name: 'sourceKey', unique: true },
        { type: 'string', name: 'lucideKey' },
      ],
    });
    this.app.acl.allow('ptdlIconRemaps', ['list', 'get', 'create', 'update', 'updateOrCreate', 'destroy'], 'loggedIn');
  }

  private async ensureTable() {
    try {
      await this.db.getCollection('ptdlIconRemaps')?.sync?.();
    } catch (e) {
      this.app.logger?.warn?.('[custom-icons] ptdlIconRemaps sync failed: ' + (e as any)?.message);
    }
  }

  /** Insert bundled defaults for any sourceKey not already present. Idempotent; keeps user edits. */
  private async seedDefaults() {
    try {
      const repo: any = this.db.getRepository('ptdlIconRemaps');
      if (!repo) return;
      const existing = await repo.find({ fields: ['sourceKey'] });
      // Case-insensitive: the registry lookup lowercases every key, so 'SettingOutlined' and
      // 'settingoutlined' are the SAME icon. Never seed a default that collides with a user row.
      const have = new Set((existing || []).map((r: any) => String(r.sourceKey).toLowerCase()));
      const missing = DEFAULT_ICON_REMAPS.filter((r) => !have.has(r.sourceKey.toLowerCase()));
      if (!missing.length) return;
      try {
        await repo.model.bulkCreate(missing.map((r) => ({ ...r })), { ignoreDuplicates: true });
      } catch (e) {
        // Fallback: per-row create (tolerates the unique constraint under a race).
        for (const r of missing) {
          try {
            await repo.create({ values: r });
          } catch (_) {
            /* ignore duplicates */
          }
        }
      }
      this.app.logger?.info?.(`[custom-icons] seeded ${missing.length} default icon remap(s)`);
    } catch (e) {
      this.app.logger?.warn?.('[custom-icons] seedDefaults failed: ' + (e as any)?.message);
    }
  }

  /**
   * One-time backfill for instances that were ALREADY installed before defaults shipped
   * (install()/afterEnable() don't re-run on a plain restart/upgrade). Guarded by a persisted flag on
   * this plugin's own `options`, so it runs exactly once — after which user deletions stick.
   */
  private async backfillOnce() {
    try {
      const repo: any = this.app.db.getRepository('applicationPlugins');
      const rec = repo ? await repo.findOne({ filter: { name: this.name } }) : null;
      const opts = (rec?.options as any) || {};
      if (opts.iconRemapSeeded) return;
      await this.seedDefaults();
      if (repo && rec) {
        await repo.update({ filter: { name: this.name }, values: { options: { ...opts, iconRemapSeeded: true } } });
      }
    } catch (e) {
      this.app.logger?.warn?.('[custom-icons] backfillOnce failed: ' + (e as any)?.message);
    }
  }

  async install() {
    await this.ensureTable();
    await this.seedDefaults();
  }

  async afterEnable() {
    await this.ensureTable();
    await this.seedDefaults();
  }

  async load() {
    await this.ensureTable();
    await this.backfillOnce();
  }
}

export default PluginCustomIconsServer;
