# @ptdl/plugin-line-generator — Bộ sinh dòng theo quy tắc

Từ **1 bản ghi cha + 1 bảng quy tắc** → sinh **N dòng con** trong một transaction. Snapshot (chốt số tại thời điểm bấm, KHÔNG live). Một cơ chế config-driven phủ nhiều nghiệp vụ:

| Nghiệp vụ | Nguồn | Bảng quy tắc | Dòng sinh ra |
|---|---|---|---|
| Nổ BOM / định mức | dòng đơn hàng | định mức SP→NVL | nhu cầu NVL (gộp) |
| **Chia hoa hồng** (case nghiệm thu P0) | đơn hàng | `commission_rules` (G1–G4) | hoa hồng từng nhân sự |
| Phân bổ chi phí, lương khoán | bản ghi cha | bảng hệ số | dòng con |

Khác nhau giữa các nghiệp vụ chỉ là **config**, không phải code.

## Cách hoạt động

1 nút **"Sinh dòng"** trên record. Bấm → **preview** (dry-run, hiện các dòng sẽ tạo + dòng bỏ qua) → **xác nhận** → ghi transaction.

- **Match xuyên quan hệ**: điều kiện khớp (vd shipping_type) đọc được ở bảng nhóm qua dot-path `commission_rule_group.shipping_type`.
- **Người nhận động** (`based_on` + `recipient`): `REL(parent, personPath & '.id')` đi theo quan hệ mà đường đi lấy từ dữ liệu quy tắc (self / trưởng phòng / giám đốc).
- **Null = bỏ qua lặng** (`required`): đơn thiếu NV / NV không có quản lý → drop dòng đó, ghi vào báo cáo, không lỗi.
- **Snapshot**: sửa định mức/tỉ lệ sau KHÔNG ảnh hưởng chứng từ đã sinh.
- **Guard 2 đầu**: điều kiện tiền đề (vd `status='Đã thanh lý' AND is_commission_created=false`) enforce ở server VÀ làm show-if của nút.
- **Cập nhật ngược cha** (`parentUpdates`): set cờ/counter (is_commission_created, commission_status…) cùng transaction.
- Gộp + SUM (`groupBy`), làm tròn largest-remainder, validate tổng % — có sẵn.

Engine biểu thức tái dùng vendored `@formulajs/formulajs` + helper `REL / NUM / YMONTH / NOW`.

## Kiến trúc

```
src/shared/generateCore.ts   Thuật toán THUẦN (no DB) — match, skip, output, group, round, hash. Test bằng Node.
src/shared/evalExpr.ts       Scope {parent,src,rule,user,runVersion,derived} + helper, quanh formulaEngine.
src/shared/formulaEngine.ts  Vendored (self-contained, zero package import — bundle được vào server dist).
src/server/generator.ts      Load DB + ghi transaction + parentUpdates + WS live-refresh.
src/server/plugin.ts         Collection `ptdl_linegen_rules` (config JSON) + resource `ptdlLineGen`.
src/shared/generateLinesAction.tsx  Action model 2 lane (/admin + /v/).
```

## Test

```bash
bash test/run.sh    # 30/30 assertions: case hoa hồng G1 (đủ người → 15 dòng; thiếu QL → skip)
```

## Build & deploy

```bash
bash build-env/recipes/run-line-generator-build.sh                 # -> storage/tar/...-<ver>.tgz (+ markers)
bash packages/@ptdl/plugin-line-generator/seed/deploy-nb-local.sh  # copy vào node_modules + pm2 restart
```

Cấu hình + Section I schema + luồng nghiệm thu: xem [seed/COMMISSION-SETUP.md](seed/COMMISSION-SETUP.md).

Trạng thái: **P0** — core + build verified; live e2e cần Section I schema (xem setup doc).
