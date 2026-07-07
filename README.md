# NocoBase plugins

Bộ plugin đóng gói sẵn (`.tgz`) cho **NocoBase 2.1.x** (test trên 2.1.19).
Tải về → **upload → enable** là dùng được ngay, không cần build.

## Cài đặt (mỗi plugin)

1. Đăng nhập NocoBase bằng tài khoản admin.
2. Vào **Settings → Plugin manager** (Quản lý plugin).
3. Bấm **Add new → Upload plugin**, chọn file `.tgz` trong thư mục [`plugins/`](plugins/).
4. Sau khi thêm, bấm **Enable** cho plugin đó.
5. Với plugin có phần cấu hình riêng (PWA, Custom HTML…), vào Settings tương ứng để chỉnh, rồi **Ctrl+Shift+R** tải lại trang.

> Cài lên server (Railway/Docker) thì thao tác y hệt qua Plugin manager. Không cần chép tay hay restart thủ công.

## Danh sách plugin (`plugins/`)

| Plugin | File | Chức năng |
|---|---|---|
| **PWA** | `plugin-pwa-0.3.0.tgz` | Cài NocoBase như app (desktop/mobile). Cấu hình tên/icon/màu ở **Settings → PWA**. |
| **Enhanced Table** | `plugin-enhanced-table-block-2.1.0-beta.13.tgz` | Bảng nâng cao: dòng tổng (summary) + chọn ô để cộng nhanh. |
| **Custom HTML block** | `plugin-block-custom-html-0.1.0.tgz` | Khối HTML gắn dữ liệu (Modern v2): chọn data source, ăn filter/refresh, tự viết HTML + CSS + JS (scorecard, KPI, card tùy biến). |
| **ECharts Pro** | `plugin-data-visualization-echarts-pro-0.1.0.tgz` | Loại chart ECharts linh hoạt cho block Data Visualization (v1): custom font, number format, transform, JSON option override. |
| **Login page** | `plugin-login-lite-2.1.6.tgz` | Tùy biến theme/màu trang đăng nhập. |
| **Icon Kit** | `plugin-icon-kit-0.1.0.tgz` | **(Khuyên dùng)** Lucide icons vào bộ chọn icon (menu/sidebar) **+** conditional formatting cho cột bảng. Gộp 2 plugin dưới. |
| Custom Icons | `plugin-custom-icons-0.1.0.tgz` | *(Tách riêng)* Chỉ thêm Lucide icons vào icon picker. Đã gộp vào Icon Kit. |
| Conditional Format | `plugin-conditional-format-0.1.0.tgz` | *(PoC/tách riêng)* Tô màu + icon theo giá trị ô. Đã gộp vào Icon Kit. |

> "Custom icon + format number": dùng **Icon Kit** là đủ (gộp icon + conditional format). Hai plugin *Custom Icons* / *Conditional Format* là bản tách riêng trước đó, giữ lại để tham khảo.

## Extras (`extras/`)

- `NOCOBASE-PLUGIN-BUILD-GUIDE.md` — hướng dẫn tự build plugin NocoBase từ source (dev).
- `runjs-number-format.js`, `runjs-status-format.js` — snippet RunJS (định dạng số / status) dán vào block JS.

## Ghi chú

- Một số plugin là bản phát triển/beta (`0.1.0`, `beta.x`) — chạy tốt cho nhu cầu hiện tại, sẽ cập nhật dần.
- `@nocobase/*` và `@taichuy/plugin-login-lite`: AGPL-3.0 · `@ptdl/*`: plugin nội bộ.
