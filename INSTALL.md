# Cài @ptdl plugins vào NocoBase (không cần upload file)

Các plugin trong repo này được đóng gói sẵn (`.tgz` ở `latest/@ptdl/`). Cài vào **bất kỳ NocoBase 2.x** nào **mà không upload file qua trình duyệt** — server tự tải từ URL. Hợp khi thiết bị/mạng chặn upload `.tgz`, và để share cho instance người khác host.

## Cách cài (UI, ~30s/plugin)
1. Admin NocoBase → **Plugin manager**.
2. **Add** → nguồn **URL / npm** (KHÔNG chọn Local/Upload).
3. Dán **Install URL** (bảng dưới) → **Install** → **Enable**.

> Trình duyệt chỉ gửi một chuỗi URL; **server** NocoBase tải file. Nếu `@` trong URL bị lỗi, thay bằng `%40ptdl`.

## ⚠️ Railway / Docker: bắt buộc volume cho `storage/`
Plugin cài lúc runtime nằm ở `storage/plugins` trên **service NocoBase** (không phải Postgres). Railway filesystem ephemeral → **mount volume vào `/app/nocobase/storage`**, nếu không plugin **mất khi redeploy**.

## Danh sách (32 plugin — sync theo `latest/@ptdl/`)
| Plugin | Version | Install URL |
|---|---|---|
| action-enhancements | 0.1.1 | `https://raw.githubusercontent.com/tuanla90/nocobase-plugin/main/latest/@ptdl/plugin-action-enhancements-0.1.1.tgz` |
| ai-column | 0.7.2 | `https://raw.githubusercontent.com/tuanla90/nocobase-plugin/main/latest/@ptdl/plugin-ai-column-0.7.2.tgz` |
| app-builder ⚠️(bản committed, đang cũ hơn source WIP) | 0.6.10 | `https://raw.githubusercontent.com/tuanla90/nocobase-plugin/main/latest/@ptdl/plugin-app-builder-0.6.10.tgz` |
| block-custom-html | 0.12.9 | `https://raw.githubusercontent.com/tuanla90/nocobase-plugin/main/latest/@ptdl/plugin-block-custom-html-0.12.9.tgz` |
| branding ⚠️(bản committed, đang cũ hơn source WIP) | 0.4.7 | `https://raw.githubusercontent.com/tuanla90/nocobase-plugin/main/latest/@ptdl/plugin-branding-0.4.7.tgz` |
| change-log | 0.1.4 | `https://raw.githubusercontent.com/tuanla90/nocobase-plugin/main/latest/@ptdl/plugin-change-log-0.1.4.tgz` |
| conditional-format | 0.2.8 | `https://raw.githubusercontent.com/tuanla90/nocobase-plugin/main/latest/@ptdl/plugin-conditional-format-0.2.8.tgz` |
| custom-header | 0.2.3 | `https://raw.githubusercontent.com/tuanla90/nocobase-plugin/main/latest/@ptdl/plugin-custom-header-0.2.3.tgz` |
| custom-icons | 0.2.5 | `https://raw.githubusercontent.com/tuanla90/nocobase-plugin/main/latest/@ptdl/plugin-custom-icons-0.2.5.tgz` |
| data-visualization-echarts-pro | 0.2.4 | `https://raw.githubusercontent.com/tuanla90/nocobase-plugin/main/latest/@ptdl/plugin-data-visualization-echarts-pro-0.2.4.tgz` |
| detail-panel | 0.1.1 | `https://raw.githubusercontent.com/tuanla90/nocobase-plugin/main/latest/@ptdl/plugin-detail-panel-0.1.1.tgz` |
| device-kit | 0.8.1 | `https://raw.githubusercontent.com/tuanla90/nocobase-plugin/main/latest/@ptdl/plugin-device-kit-0.8.1.tgz` |
| enhanced-table-block | 2.1.0-beta.17 | `https://raw.githubusercontent.com/tuanla90/nocobase-plugin/main/latest/@ptdl/plugin-enhanced-table-block-2.1.0-beta.17.tgz` |
| field-enhancements | 0.2.12 | `https://raw.githubusercontent.com/tuanla90/nocobase-plugin/main/latest/@ptdl/plugin-field-enhancements-0.2.12.tgz` |
| field-order | 0.1.1 | `https://raw.githubusercontent.com/tuanla90/nocobase-plugin/main/latest/@ptdl/plugin-field-order-0.1.1.tgz` |
| filter-tree | 0.3.6 | `https://raw.githubusercontent.com/tuanla90/nocobase-plugin/main/latest/@ptdl/plugin-filter-tree-0.3.6.tgz` |
| formula | 0.1.74 | `https://raw.githubusercontent.com/tuanla90/nocobase-plugin/main/latest/@ptdl/plugin-formula-0.1.74.tgz` |
| global-search | 0.9.7 | `https://raw.githubusercontent.com/tuanla90/nocobase-plugin/main/latest/@ptdl/plugin-global-search-0.9.7.tgz` |
| gsheet-sync ⚠️(bản committed, đang cũ hơn source WIP) | 0.1.1 | `https://raw.githubusercontent.com/tuanla90/nocobase-plugin/main/latest/@ptdl/plugin-gsheet-sync-0.1.1.tgz` |
| inline-field | 0.1.3 | `https://raw.githubusercontent.com/tuanla90/nocobase-plugin/main/latest/@ptdl/plugin-inline-field-0.1.3.tgz` |
| instant-create-page | 0.1.7 | `https://raw.githubusercontent.com/tuanla90/nocobase-plugin/main/latest/@ptdl/plugin-instant-create-page-0.1.7.tgz` |
| ip-guard | 0.2.0 | `https://raw.githubusercontent.com/tuanla90/nocobase-plugin/main/latest/@ptdl/plugin-ip-guard-0.2.0.tgz` |
| layout-containers | 0.4.3 | `https://raw.githubusercontent.com/tuanla90/nocobase-plugin/main/latest/@ptdl/plugin-layout-containers-0.4.3.tgz` |
| line-generator | 0.6.11 | `https://raw.githubusercontent.com/tuanla90/nocobase-plugin/main/latest/@ptdl/plugin-line-generator-0.6.11.tgz` |
| login-lite | 2.3.2 | `https://raw.githubusercontent.com/tuanla90/nocobase-plugin/main/latest/@ptdl/plugin-login-lite-2.3.2.tgz` |
| menu-enhancements | 0.4.17 | `https://raw.githubusercontent.com/tuanla90/nocobase-plugin/main/latest/@ptdl/plugin-menu-enhancements-0.4.17.tgz` |
| nb-cloner | 1.9.2 | `https://raw.githubusercontent.com/tuanla90/nocobase-plugin/main/latest/@ptdl/plugin-nb-cloner-1.9.2.tgz` |
| print-template | 0.1.4 | `https://raw.githubusercontent.com/tuanla90/nocobase-plugin/main/latest/@ptdl/plugin-print-template-0.1.4.tgz` |
| pwa | 0.4.2 | `https://raw.githubusercontent.com/tuanla90/nocobase-plugin/main/latest/@ptdl/plugin-pwa-0.4.2.tgz` |
| spreadsheet-view | 0.2.3 | `https://raw.githubusercontent.com/tuanla90/nocobase-plugin/main/latest/@ptdl/plugin-spreadsheet-view-0.2.3.tgz` |
| status-flow | 0.1.0 | `https://raw.githubusercontent.com/tuanla90/nocobase-plugin/main/latest/@ptdl/plugin-status-flow-0.1.0.tgz` |
| subtable-pro | 0.2.8 | `https://raw.githubusercontent.com/tuanla90/nocobase-plugin/main/latest/@ptdl/plugin-subtable-pro-0.2.8.tgz` |

_Cập nhật tự động từ `latest/@ptdl/`. Sinh lại sau mỗi lần rebuild._
