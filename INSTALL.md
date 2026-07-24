# Cài @tuanla90 plugins vào NocoBase (không cần upload file)

Các plugin trong repo này được đóng gói sẵn (`.tgz` ở `latest/@tuanla90/`). Cài vào **bất kỳ NocoBase 2.x** nào **mà không upload file qua trình duyệt** — server tự tải từ URL. Hợp khi thiết bị/mạng chặn upload `.tgz`, và để share cho instance người khác host.

## ⭐ Cách nhanh nhất — Plugin Hub (cài 1 lần, lo hết)
Cài **Plugin Hub** rồi nó tự cài/cập nhật mọi plugin còn lại từ manifest (`latest/index.json`) — khỏi dán URL 30+ lần.
1. Admin NocoBase → **Plugin manager → Add → URL** → dán:
   `https://raw.githubusercontent.com/tuanla90/nocobase-plugin/main/latest/@tuanla90/plugin-hub-0.1.15.tgz`
   → Install → **Enable**.
2. Vào **Settings → Plugin Hub → Kiểm tra ngay** → cài/cập nhật từng cái hoặc **Cập nhật tất cả**.

> Kiểm tra cập nhật hàng tuần — chỉ **báo**, không tự áp dụng.

## Cách thủ công (từng plugin, không cần Hub)
1. Admin NocoBase → **Plugin manager → Add** → nguồn **URL / npm** (KHÔNG chọn Local/Upload).
2. Dán **Install URL** (bảng dưới) → **Install** → **Enable**.
> Trình duyệt chỉ gửi một chuỗi URL; **server** NocoBase tải file. Nếu `@` trong URL lỗi, thay bằng `%40tuanla90`.

## ⚠️ Railway / Docker: bắt buộc volume cho `storage/`
Plugin cài lúc runtime nằm ở `storage/plugins` trên **service NocoBase** (không phải Postgres). Railway filesystem ephemeral → **mount volume vào `/app/nocobase/storage`**, nếu không plugin **mất khi redeploy**.

## Danh sách (39 plugin — sync theo `latest/@tuanla90/`)
| Plugin | Version | Install URL |
|---|---|---|
| action-enhancements | 0.1.2 | `https://raw.githubusercontent.com/tuanla90/nocobase-plugin/main/latest/@tuanla90/plugin-action-enhancements-0.1.2.tgz` |
| ai-column | 0.7.5 | `https://raw.githubusercontent.com/tuanla90/nocobase-plugin/main/latest/@tuanla90/plugin-ai-column-0.7.5.tgz` |
| app-builder | 0.6.33 | `https://raw.githubusercontent.com/tuanla90/nocobase-plugin/main/latest/@tuanla90/plugin-app-builder-0.6.33.tgz` |
| app-doctor | 0.1.0 | `https://raw.githubusercontent.com/tuanla90/nocobase-plugin/main/latest/@tuanla90/plugin-app-doctor-0.1.0.tgz` |
| block-custom-html | 0.12.9 | `https://raw.githubusercontent.com/tuanla90/nocobase-plugin/main/latest/@tuanla90/plugin-block-custom-html-0.12.9.tgz` |
| branding | 0.4.18 | `https://raw.githubusercontent.com/tuanla90/nocobase-plugin/main/latest/@tuanla90/plugin-branding-0.4.18.tgz` |
| change-log | 0.1.4 | `https://raw.githubusercontent.com/tuanla90/nocobase-plugin/main/latest/@tuanla90/plugin-change-log-0.1.4.tgz` |
| column-resize | 0.1.9 | `https://raw.githubusercontent.com/tuanla90/nocobase-plugin/main/latest/@tuanla90/plugin-column-resize-0.1.9.tgz` |
| conditional-format | 0.2.19 | `https://raw.githubusercontent.com/tuanla90/nocobase-plugin/main/latest/@tuanla90/plugin-conditional-format-0.2.19.tgz` |
| custom-header | 0.2.4 | `https://raw.githubusercontent.com/tuanla90/nocobase-plugin/main/latest/@tuanla90/plugin-custom-header-0.2.4.tgz` |
| custom-icons | 0.2.5 | `https://raw.githubusercontent.com/tuanla90/nocobase-plugin/main/latest/@tuanla90/plugin-custom-icons-0.2.5.tgz` |
| data-visualization-echarts-pro | 0.2.5 | `https://raw.githubusercontent.com/tuanla90/nocobase-plugin/main/latest/@tuanla90/plugin-data-visualization-echarts-pro-0.2.5.tgz` |
| detail-panel | 0.1.1 | `https://raw.githubusercontent.com/tuanla90/nocobase-plugin/main/latest/@tuanla90/plugin-detail-panel-0.1.1.tgz` |
| device-kit | 0.8.3 | `https://raw.githubusercontent.com/tuanla90/nocobase-plugin/main/latest/@tuanla90/plugin-device-kit-0.8.3.tgz` |
| enhanced-table-block | 2.1.0-beta.18 | `https://raw.githubusercontent.com/tuanla90/nocobase-plugin/main/latest/@tuanla90/plugin-enhanced-table-block-2.1.0-beta.18.tgz` |
| field-enhancements | 0.2.36 | `https://raw.githubusercontent.com/tuanla90/nocobase-plugin/main/latest/@tuanla90/plugin-field-enhancements-0.2.36.tgz` |
| field-order | 0.2.0 | `https://raw.githubusercontent.com/tuanla90/nocobase-plugin/main/latest/@tuanla90/plugin-field-order-0.2.0.tgz` |
| file-vault | 0.1.2 | `https://raw.githubusercontent.com/tuanla90/nocobase-plugin/main/latest/@tuanla90/plugin-file-vault-0.1.2.tgz` |
| filter-tree | 0.3.7 | `https://raw.githubusercontent.com/tuanla90/nocobase-plugin/main/latest/@tuanla90/plugin-filter-tree-0.3.7.tgz` |
| formula | 0.1.86 | `https://raw.githubusercontent.com/tuanla90/nocobase-plugin/main/latest/@tuanla90/plugin-formula-0.1.86.tgz` |
| global-search | 0.9.8 | `https://raw.githubusercontent.com/tuanla90/nocobase-plugin/main/latest/@tuanla90/plugin-global-search-0.9.8.tgz` |
| gsheet-sync | 0.1.3 | `https://raw.githubusercontent.com/tuanla90/nocobase-plugin/main/latest/@tuanla90/plugin-gsheet-sync-0.1.3.tgz` |
| hub | 0.1.15 | `https://raw.githubusercontent.com/tuanla90/nocobase-plugin/main/latest/@tuanla90/plugin-hub-0.1.15.tgz` |
| inline-field | 0.1.9 | `https://raw.githubusercontent.com/tuanla90/nocobase-plugin/main/latest/@tuanla90/plugin-inline-field-0.1.9.tgz` |
| instant-create-page | 0.1.8 | `https://raw.githubusercontent.com/tuanla90/nocobase-plugin/main/latest/@tuanla90/plugin-instant-create-page-0.1.8.tgz` |
| ip-guard | 0.2.1 | `https://raw.githubusercontent.com/tuanla90/nocobase-plugin/main/latest/@tuanla90/plugin-ip-guard-0.2.1.tgz` |
| layout-containers | 0.4.4 | `https://raw.githubusercontent.com/tuanla90/nocobase-plugin/main/latest/@tuanla90/plugin-layout-containers-0.4.4.tgz` |
| line-generator | 0.8.4 | `https://raw.githubusercontent.com/tuanla90/nocobase-plugin/main/latest/@tuanla90/plugin-line-generator-0.8.4.tgz` |
| login-lite | 2.3.3 | `https://raw.githubusercontent.com/tuanla90/nocobase-plugin/main/latest/@tuanla90/plugin-login-lite-2.3.3.tgz` |
| mailer | 0.2.0 | `https://raw.githubusercontent.com/tuanla90/nocobase-plugin/main/latest/@tuanla90/plugin-mailer-0.2.0.tgz` |
| menu-enhancements | 0.4.19 | `https://raw.githubusercontent.com/tuanla90/nocobase-plugin/main/latest/@tuanla90/plugin-menu-enhancements-0.4.19.tgz` |
| my-columns | 0.1.0 | `https://raw.githubusercontent.com/tuanla90/nocobase-plugin/main/latest/@tuanla90/plugin-my-columns-0.1.0.tgz` |
| nb-cloner | 1.11.0 | `https://raw.githubusercontent.com/tuanla90/nocobase-plugin/main/latest/@tuanla90/plugin-nb-cloner-1.11.0.tgz` |
| perf-guard | 0.1.6 | `https://raw.githubusercontent.com/tuanla90/nocobase-plugin/main/latest/@tuanla90/plugin-perf-guard-0.1.6.tgz` |
| print-template | 0.1.5 | `https://raw.githubusercontent.com/tuanla90/nocobase-plugin/main/latest/@tuanla90/plugin-print-template-0.1.5.tgz` |
| pwa | 0.5.0 | `https://raw.githubusercontent.com/tuanla90/nocobase-plugin/main/latest/@tuanla90/plugin-pwa-0.5.0.tgz` |
| spreadsheet-view | 0.2.4 | `https://raw.githubusercontent.com/tuanla90/nocobase-plugin/main/latest/@tuanla90/plugin-spreadsheet-view-0.2.4.tgz` |
| status-flow | 0.1.2 | `https://raw.githubusercontent.com/tuanla90/nocobase-plugin/main/latest/@tuanla90/plugin-status-flow-0.1.2.tgz` |
| subtable-pro | 0.2.10 | `https://raw.githubusercontent.com/tuanla90/nocobase-plugin/main/latest/@tuanla90/plugin-subtable-pro-0.2.10.tgz` |

_Tự sinh từ `latest/@tuanla90/` bởi `build-env/gen-manifest.cjs`. Chạy lại sau mỗi lần rebuild._
