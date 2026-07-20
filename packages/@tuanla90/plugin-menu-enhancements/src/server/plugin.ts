import { Plugin } from '@nocobase/server';

/**
 * Menu sections — a pure marker on the route `options` JSON, 100% client-side (no collection here).
 *
 * Menu/tab BADGES (count chips) — client-side too, BUT this server lane adds a small **live data-change
 * broadcaster** so a badge refreshes across ALL clients the instant its collection's data changes, instead
 * of only on the 45s poll / tab-focus / this-browser's-own-edit.
 *
 * How: NocoBase's Database emits an UNPREFIXED global event per Sequelize hook (model-hook.js
 * `buildSequelizeHook` → `emitAsync(type, ...)`), so `db.on('afterCreate'|'afterUpdate'|'afterDestroy'|…)`
 * fires for EVERY collection; `model.constructor.name` is the collection name (same as NocoBase's own
 * `findModelName`). We debounce the changed-collection names and broadcast
 *   { type: 'ptdl:data-changed', payload: { collections } }
 * to this app's clients via `app.emit('ws:sendToCurrentApp', …)`. The badge client refreshes badges whose
 * collection is in the list. A DISTINCT message type (not `ptdl:live-refresh`) keeps computed-field blocks —
 * which listen only to `ptdl:live-refresh` — from over-refreshing on unrelated writes.
 *
 * Note: writes done with `hooks:false` (e.g. the computed-field cascade writeback) do NOT fire these hooks;
 * those are covered by @tuanla90/plugin-formula's own `ptdl:live-refresh` push, which the badge also listens to.
 */

// NocoBase internal / high-churn collections a badge would never count — skip to avoid needless WS traffic.
// (Correctness doesn't depend on this list — the client only refetches badges whose collection matches — it
// is purely to keep the firehose quiet.)
const SKIP = new Set([
  // UI / routes
  'uiSchemas', 'uiSchemaTemplates', 'uiSchemaServerHooks', 'desktopRoutes', 'mobileRoutes', 'uiRoutes',
  // flow-engine internal model storage (churns on UI render/design)
  'flowModels', 'flowModelTemplateUsages', 'flowModelRepositories',
  // auth / session / tokens (churn on every login/refresh)
  'roles', 'rolesUsers', 'usersTokens', 'issuedTokens', 'authenticators', 'tokenControlConfig',
  'tokenBlacklist', 'sessions',
  // data source / plugin / system
  'dataSources', 'dataSourcesCollections', 'dataSourcesFields', 'collectionCategories', 'applicationPlugins',
  'systemSettings',
  // workflow internals (can churn heavily while automations run)
  'executions', 'jobs', 'workflowStats', 'workflowVersionStats', 'workflowTasks', 'workflowCategories',
  'workflows', 'flow_nodes',
  // localization / notifications
  'localizationTexts', 'localizationTranslations', 'notificationInAppMessages', 'notificationChannels',
  'notificationSendRecords',
]);
const skipCollection = (n?: string) =>
  !n || SKIP.has(n) || n.startsWith('ptdl') || n.startsWith('flowModel') || /Resources$/i.test(n);

/** Extract the collection name from a Sequelize/NocoBase hook's args (single-row model OR bulk options),
 *  mirroring @nocobase/database ModelHook.findModelName. */
function collectionNameFrom(args: any[]): string | null {
  for (let a of args) {
    if (Array.isArray(a)) a = a[0];
    if (a && a._previousDataValues) return a.constructor?.name || null; // a model instance
    if (a && typeof a === 'object') {
      if (a.model?.name) return a.model.name; // bulk options
      if (typeof a.modelName === 'string') return a.modelName;
    }
  }
  return null;
}

export class PluginMenuSectionsServer extends Plugin {
  async load() {
    const app: any = this.app;
    const db: any = this.db;
    if (!db?.on || !app?.emit) return;

    const pending = new Set<string>();
    let timer: any = null;
    const flush = () => {
      timer = null;
      const collections = [...pending];
      pending.clear();
      if (!collections.length) return;
      try {
        app.emit('ws:sendToCurrentApp', { message: { type: 'ptdl:data-changed', payload: { collections } } });
      } catch (e: any) {
        app.logger?.warn?.(`[menu-badge] ws broadcast failed: ${e?.message || e}`);
      }
    };
    const mark = (...args: any[]) => {
      const name = collectionNameFrom(args);
      if (skipCollection(name || undefined)) return;
      pending.add(name!);
      if (!timer) timer = setTimeout(flush, 250); // coalesce bursts (bulk import, cascades) into one push
    };

    // Global (unprefixed) hooks fire for every collection. `afterCreate/Update/Destroy` cover single-row
    // form/quick edits; the bulk variants cover where-based update/destroy and imports.
    for (const ev of ['afterCreate', 'afterUpdate', 'afterDestroy', 'afterBulkUpdate', 'afterBulkDestroy']) {
      db.on(ev, mark);
    }
    app.logger?.info?.('[menu-badge] live data-change broadcaster installed (ptdl:data-changed)');
  }
}

export default PluginMenuSectionsServer;
