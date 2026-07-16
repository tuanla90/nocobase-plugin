# nocobase-plugins

Bộ plugin NocoBase của **@ptdl** — đã gom về 1 folder, chuẩn hoá **1 scope duy nhất `@ptdl`**.

/ Cập nhật: 2026-07-08. NocoBase 2.1.19. Localhost dev: http://localhost:13000 (sqlite, pm2).

> ⚠️ **Danh sách plugin bên dưới (8 cái) đã LỖI THỜI.** Nguồn sự thật hiện tại = **[`PLUGIN-REGISTRY.md`](PLUGIN-REGISTRY.md)**
> (19 plugin `@ptdl`). Tiến độ/bối cảnh session: **[`HANDOFF.md`](HANDOFF.md)**, **[`docs/PLAN.md`](docs/PLAN.md)**,
> **[`SHARED-LIBS-PROPOSAL.md`](SHARED-LIBS-PROPOSAL.md)**.

## Cấu trúc
```
nocobase-plugins/
├── packages/@ptdl/            # SOURCE code (8 plugin ĐANG DÙNG), scope @ptdl
│   └── plugin-<name>/         #   src/, package.json, README...
├── packages/_inactive/@ptdl/  # source plugin KHÔNG dùng nữa (giữ lại, không xoá)
│   ├── plugin-icon-kit/       #   -> đã thay bằng custom-icons + conditional-format
│   └── plugin-number-format/  #   -> SUPERSEDED: nhu cầu (dấu nghìn/thập phân/icon/đơn vị) đã có trong
│   │                          #      field-enhancements "Number with unit" widget (đã build+cài)
├── latest/@ptdl/              # .tgz MỚI NHẤT của 8 plugin active (bản để upload / khớp localhost)
├── archive/@ptdl/             # MỌI version .tgz đã build (gồm cả icon-kit, number-format cũ)
├── archive/_legacy-scope-cu/  # .tgz bản GỐC scope cũ (@nocobase/*, @taichuy/*) — lưu vết
└── _backup-localhost-*/       # backup DB sqlite của localhost trước mỗi lần đồng bộ
```

## 8 plugin đang chạy trên localhost (tất cả `@ptdl`, đã enable)
| Plugin | Version |
|---|---|
| @ptdl/plugin-block-custom-html | 0.12.0 |
| @ptdl/plugin-conditional-format | 0.2.0 |
| @ptdl/plugin-custom-icons | 0.1.0 |
| @ptdl/plugin-data-visualization-echarts-pro | 0.1.0 |
| @ptdl/plugin-enhanced-table-block | 2.1.0-beta.13 |
| @ptdl/plugin-global-search | 0.2.0 |
| @ptdl/plugin-login-lite | 2.2.0 |
| @ptdl/plugin-pwa | 0.3.0 |

## Ghi chú
- Trước đây scope lẫn lộn `@nocobase/*`, `@taichuy/*`, `@ptdl/*`. Đã build lại tất cả về `@ptdl`
  (đổi scope **bắt buộc build lại** vì tên package bị nướng cứng trong client bundle + đường dẫn static).
- `plugin-icon-kit`: bỏ, chuyển sang dùng `custom-icons` + `conditional-format`.
- `plugin-number-format` (+ `plugin-number-input`, kiến trúc classic v1 cũ hơn): **superseded**, không cần sửa build.
  Chưa từng build (không có root stub/recipe) — vướng thật là kiến trúc: flow mới đăng ký trên `NumberFieldModel`
  không hiện trong menu ⋮ settings của FORM (menu form chỉ render flow tên cố định, khác cột bảng). Nhu cầu gốc
  (dấu nghìn/thập phân/icon/đơn vị) đã có lời giải khác + đã build+cài: `field-enhancements` widget **"Number
  with unit"** (đăng ký FieldModel mới qua `bindModelToInterface` → hiện trong dropdown "Field component").
- Build lại 1 plugin: đặt source `@ptdl` vào build-env có `@nocobase/build@2.1.19`, chạy
  `nocobase-build.js @ptdl/plugin-<name> --tar --no-dts` (xem NOCOBASE-PLUGIN-BUILD-GUIDE.md ở dự án cũ).
