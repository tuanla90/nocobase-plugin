import { Plugin } from '@nocobase/server';

export class PluginPwaServer extends Plugin {
  async beforeLoad() {
    // Collection lưu cấu hình PWA (1 dòng duy nhất)
    this.db.collection({
      name: 'pwaSettings',
      fields: [
        { type: 'string', name: 'name' },
        { type: 'string', name: 'shortName' },
        { type: 'string', name: 'themeColor' },
        { type: 'string', name: 'backgroundColor' },
        { type: 'json', name: 'icon' },
        // Thanh điều hướng dưới cùng kiểu mobile app: { enabled, showOn, items[≤5], style{...} }
        { type: 'json', name: 'bottomBar' },
        // Gợi ý "Cài ứng dụng" (Add to Home Screen): { enabled, position, title, description }
        { type: 'json', name: 'install' },
      ],
    });

    // Đọc: công khai (manifest cần đọc cho mọi người). Ghi: qua snippet (admin bật trong UI).
    this.app.acl.allow('pwaSettings', ['list', 'get'], 'public');
    this.app.acl.registerSnippet({
      name: 'pm.pwa.configuration',
      actions: ['pwaSettings:list', 'pwaSettings:get', 'pwaSettings:create', 'pwaSettings:update'],
    });
  }

  async install() {
    await this.db.sync();
  }

  async afterEnable() {
    // đảm bảo bảng tồn tại khi bật lại
    try {
      await this.db.sync();
    } catch (e) {
      this.app.logger?.warn?.('[plugin-pwa] sync failed: ' + (e as any)?.message);
    }
  }

  async load() {
    // Đảm bảo cột tồn tại kể cả khi plugin đã cài/bật từ trước lúc thêm các cột mới
    // (bottomBar/install) — install()/afterEnable() không chạy lại khi chỉ update + reload in-process.
    try {
      await this.db.getCollection('pwaSettings')?.sync?.();
    } catch (e) {
      this.app.logger?.warn?.('[plugin-pwa] pwaSettings sync failed: ' + (e as any)?.message);
    }
  }
}

export default PluginPwaServer;
