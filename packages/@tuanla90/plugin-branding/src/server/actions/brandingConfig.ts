import { Context, Next } from '@nocobase/actions';

// Public read: the active config of a given `type` (default 'skin'). Used by every client to apply
// the skin at startup — so it must be reachable before login too.
export const getActive = async (ctx: Context, next: Next) => {
  const type = ctx.action.params?.values?.type || ctx.action.params?.type || 'skin';
  const repo = ctx.db.getRepository('brandingConfigs');
  let row = await repo.findOne({ filter: { type } });
  // Theme-scoped rows are `<base>@<uid>`. If the theme has no override, fall back to the global `<base>`
  // row in the same request — so every loader can ask for its theme's config and still get the default.
  if (!row && typeof type === 'string' && type.includes('@')) {
    const base = type.split('@')[0];
    row = await repo.findOne({ filter: { type: base } });
  }
  ctx.body = row || { type, options: {} };
  await next();
};

// Upsert the singleton config for a `type` (admin only, gated by ACL).
export const save = async (ctx: Context, next: Next) => {
  const { type = 'skin', options = {} } = ctx.action.params?.values || {};
  const repo = ctx.db.getRepository('brandingConfigs');
  const existing = await repo.findOne({ filter: { type } });
  const row = existing
    ? await repo.update({ filterByTk: existing.id, values: { options } })
    : await repo.create({ values: { type, options } });
  ctx.body = Array.isArray(row) ? row[0] : row;
  await next();
};

// Write the accent colour into NocoBase's active theme token (`colorPrimary`/`colorLink`). This is the
// ONLY way to recolour antd buttons/links/switches — those are generated from the antd theme *token*,
// not any stylesheet rule (injected CSS, even `!important`, can't touch `.ant-btn`). Targets the theme
// with `default:true` (the system-wide active one), falling back to the built-in `default`. antd
// regenerates its styles on the next page load. Empty colour resets to antd's stock #1677ff.
export const setAccent = async (ctx: Context, next: Next) => {
  const { color: rawColor, uid } = ctx.action.params?.values || {};
  const color = String(rawColor || '').trim();
  const db = ctx.db;
  let ok = false;
  try {
    const tRepo = db.getRepository('themeConfig');
    if (tRepo) {
      // Accent is a per-theme token → write to the theme being edited (`uid`); global scope (no uid)
      // targets the system default theme.
      let theme = uid ? await tRepo.findOne({ filter: { uid } }) : null;
      if (!theme) theme = await tRepo.findOne({ filter: { default: true } });
      if (!theme) theme = await tRepo.findOne({ filter: { uid: 'default' } });
      if (theme) {
        const cfg = { ...((theme as any).config || {}) };
        cfg.token = { ...(cfg.token || {}) };
        const c = color || '#1677ff';
        cfg.token.colorPrimary = c;
        cfg.token.colorLink = c;
        await tRepo.update({ filterByTk: (theme as any).id, values: { config: cfg } });
        ok = true;
      }
    }
  } catch (e) {
    /* theme-editor not installed — accent unavailable */
  }
  ctx.body = { ok };
  await next();
};

// ── Import / Export a whole theme (admin only) ─────────────────────────────────────────────────
// One portable bundle = every branding config (skin/nav/typography) + the NocoBase Theme Editor
// themes (`themeConfig` — antd token themes). Lets an admin move a full look between instances.

// Dump all branding rows + all theme-editor themes into a single JSON bundle.
export const exportBundle = async (ctx: Context, next: Next) => {
  const db = ctx.db;
  const branding: Record<string, any> = {};
  try {
    const rows = await db.getRepository('brandingConfigs').find();
    for (const r of rows as any[]) branding[r.type] = r.options || {};
  } catch (e) {
    /* ignore */
  }
  let themes: any[] = [];
  try {
    // Present only when @nocobase/plugin-theme-editor is enabled.
    const tRepo = db.getRepository('themeConfig');
    if (tRepo) {
      const trows = await tRepo.find();
      themes = (trows as any[]).map((t) => ({
        uid: t.uid,
        config: t.config,
        optional: t.optional,
        isBuiltIn: t.isBuiltIn,
        default: t.default,
      }));
    }
  } catch (e) {
    /* theme-editor not installed — export branding only */
  }
  ctx.body = { _ptdlTheme: 1, exportedAt: new Date().toISOString(), branding, themes };
  await next();
};

// Restore a bundle: upsert branding rows by `type`, and theme-editor themes by `uid`.
export const importBundle = async (ctx: Context, next: Next) => {
  const { branding = {}, themes = [] } = ctx.action.params?.values || {};
  const db = ctx.db;
  let brandingCount = 0;
  const bRepo = db.getRepository('brandingConfigs');
  for (const type of Object.keys(branding || {})) {
    const options = (branding as any)[type] || {};
    const existing = await bRepo.findOne({ filter: { type } });
    if (existing) await bRepo.update({ filterByTk: (existing as any).id, values: { options } });
    else await bRepo.create({ values: { type, options } });
    brandingCount++;
  }
  let themeCount = 0;
  try {
    const tRepo = db.getRepository('themeConfig');
    if (tRepo && Array.isArray(themes)) {
      for (const th of themes as any[]) {
        if (!th || !th.uid) continue;
        const values = { config: th.config, optional: th.optional, isBuiltIn: th.isBuiltIn, default: th.default };
        const existing = await tRepo.findOne({ filter: { uid: th.uid } });
        if (existing) await tRepo.update({ filterByTk: (existing as any).id, values });
        else await tRepo.create({ values: { uid: th.uid, ...values } });
        themeCount++;
      }
    }
  } catch (e) {
    /* theme-editor not installed — skip themes */
  }
  ctx.body = { ok: true, brandingCount, themeCount };
  await next();
};
