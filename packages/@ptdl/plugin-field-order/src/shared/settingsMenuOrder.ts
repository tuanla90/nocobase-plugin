/**
 * Reorder the /v/ Settings-center menu into a logical, theme-grouped order.
 *
 * NocoBase orders settings entries by `pluginSettingsManager.menus[key].sort`
 * (default 0) via `sortMenuNames()`, and there is NO drag-reorder in the UI.
 * None of the @ptdl settings pages set a sort, so they land in registration order.
 *
 * We stamp an explicit ascending `sort` onto the known @ptdl menu keys — without
 * editing/rebuilding those 13 plugins — by:
 *   1) stamping any item already registered before us, and
 *   2) patching `addMenuItem` once so items registered after us also get stamped.
 * Either path covers every load-order case; the cache is cleared so it shows at once.
 *
 * Folded into @ptdl/plugin-field-order (the "ordering" plugin) by request.
 * Adjust PTDL_SETTINGS_ORDER to change the order; lower number = higher in the menu.
 */

// addMenuItem key → sort. Grouped by theme.
export const PTDL_SETTINGS_ORDER: Record<string, number> = {
  // 🎨 Giao diện / Thương hiệu
  branding: 100, // branding
  'plugin-login': 110, // login-lite
  pwa: 120, // pwa
  'icon-remap': 130, // custom-icons
  // 🔍 Tìm kiếm & tiện ích
  'global-search': 140, // global-search
  'instant-create-page': 150, // instant-create-page
  // 🗄️ Dữ liệu & tự động hoá
  'ptdl-ai-provider': 160, // ai-column
  'ptdl-computed': 170, // formula — computed fields
  'ptdl-scancalc': 180, // formula — sequential/window
  'line-generator': 190, // line-generator
  'gsheet-sync': 200, // gsheet-sync
  'ptdl-change-log': 210, // change-log
  // 🖨️ In ấn
  'print-template': 220, // print-template
  // 🔒 Bảo mật (để cuối)
  'ptdl-ip-guard': 230, // ip-guard
};

export function applySettingsMenuOrder(app: any, order: Record<string, number> = PTDL_SETTINGS_ORDER): void {
  try {
    const psm = app?.pluginSettingsManager;
    if (!psm || typeof psm.addMenuItem !== 'function') return;

    const stamp = (key: string) => {
      const item = psm.menus?.[key];
      if (item && order[key] != null) item.sort = order[key];
    };
    const clearCache = () => {
      try {
        psm.cachedList = {};
      } catch (_) {
        /* not resettable — ignore */
      }
    };

    // 1) Items registered before this plugin loaded.
    Object.keys(order).forEach(stamp);
    clearCache();

    // 2) Items registered after — patch addMenuItem once so they get stamped too.
    if (!psm.__ptdlOrderPatched) {
      const orig = psm.addMenuItem.bind(psm);
      psm.addMenuItem = (opts: any) => {
        const r = orig(opts);
        if (opts && order[opts.key] != null) {
          stamp(opts.key);
          clearCache();
        }
        return r;
      };
      psm.__ptdlOrderPatched = true;
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[field-order] settings menu reorder failed', e);
  }
}
