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

  async load() {}
}

export default PluginPwaServer;
