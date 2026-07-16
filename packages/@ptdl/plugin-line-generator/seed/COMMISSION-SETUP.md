# Cài đặt & nghiệm thu — Tính hoa hồng (P0)

Plugin đã build + core đã test (30/30). Để chạy live cần **Section I schema** (dữ liệu của bạn) + seed 1 dòng config. Doc này liệt kê đủ.

## A. Section I — schema NocoBase (tạo trong UI hoặc migration)

Đây là mô hình dữ liệu của bạn, KHÔNG do plugin tạo. Tạo theo spec:

**Bảng mới**
- `departments` (Phòng ban): `name` (text), `is_active` (boolean). Seed: Kinh doanh, Giao dịch, Kho TQ, Kho VN, Kế toán, XNK.
- `positions` (Vị trí): `name` (text), `is_active`. Seed: Nhân viên, Trưởng phòng, Giám đốc.
- `commission_rule_groups`: `name`, `shipping_type` (select: Tiểu ngạch/Chính ngạch), `quotation_method` (select: Báo trọn/Hàng lẻ), `is_active`. Seed G1–G4 (ma trận).
- `commission_rules`: `commission_rule_group` (m2o → groups), `name`, `based_on` (select: responsible_staff/transaction_staff/liquidation_employee), `recipient` (select: self/direct_manager/indirect_manager), `base_field` (select: package_revenue/payment_profit/order_service_fee/commission_price/extra_amount/shipping_fee_commission), `rate` (number), `is_active`, `note`. Seed 60 dòng (G1–G4 × 15).
- `order_commissions` (Hoa hồng đơn hàng): `order` (m2o → orders, FK `order_id`), `employee` (m2o → employees, FK `employee_id`), `commission_rule_name` (text), `position` (text), `base_field` (text), `base_value` (number), `rate` (number), `commission_amt` (number), `period_month` (text), `run_version` (number), `shipping_type` (text), `quotation_method` (text), `department` (text). **+ 2 cột plugin dùng: `_genRule` (text), `_genHash` (text).**

**Bổ sung field vào `employees`**: `department` (m2o), `position` (m2o), `direct_manager` (m2o→employees), `indirect_manager` (m2o→employees), `is_active`.

**Bổ sung field vào `orders`**: `responsible_staff`/`transaction_staff`/`liquidation_employee` (m2o→employees), `shipping_type`/`quotation_method` (select), các cột base (`package_revenue`, `payment_profit`, `order_service_fee`, `commission_price`, `extra_amount`, `shipping_fee_commission`), `status`, `liquidation_date` (date), `is_commission_created` (bool, default false), `commission_status` (select PENDING/COMPLETED), `rerun_count` (number default 0), `last_rerun_at`, `last_rerun_by`.

> ⚠️ **Chuẩn rate = thập phân**: 2% → `0.02`, 0.25% → `0.0025`, 0.04% → `0.0004`. Đặt format cột `rate` dạng % trong UI để nhập không nhầm ×100.

## B. Deploy plugin

```bash
bash build-env/recipes/run-line-generator-build.sh                 # build tgz + markers
bash packages/@ptdl/plugin-line-generator/seed/deploy-nb-local.sh  # copy vào node_modules + pm2 restart
```
Lần đầu: enable `@ptdl/plugin-line-generator` (Plugin Manager UI upload tgz → Enable, hoặc CLI `pm add`+`pm enable`) → hard refresh. Khi enable, plugin tự tạo bảng `ptdl_linegen_rules` (`.sync()` trong load()).

## C. Seed dòng config

Nội dung: [`order-commission.config.json`](order-commission.config.json). Tạo 1 bản ghi trong `ptdl_linegen_rules` với cột `config` = JSON đó (dán qua block form trên bảng `ptdl_linegen_rules`, hoặc API `POST /api/ptdl_linegen_rules:create` với `{ "config": {...} }`). Hook `beforeSave` tự điền key/enabled/sourceCollection từ JSON.

## D. Nút trên đơn hàng

Trên block đơn hàng (row action hoặc detail toolbar) → Configure actions → thêm **"Sinh dòng theo quy tắc"**. Nút tự ẩn khi đơn chưa `status='Đã thanh lý'` hoặc đã `is_commission_created=true` (guard = show-if). Không cần cấu hình workflow — nút thay trọn vai trò post-action trong spec.

## E. Nghiệm thu (đối chiếu Node test)

Tạo 1 đơn G1 (Chính ngạch + Báo trọn), status "Đã thanh lý", is_commission_created=false, gán responsible/transaction/liquidation staff (responsible có direct+indirect manager), điền base fields. Bấm nút:

1. **Preview** hiện đúng N dòng (đủ người → 15 với G1) + dòng bỏ qua nếu thiếu quản lý.
2. Xác nhận → `order_commissions` có N dòng: `employee` đúng người nhận (self/TP/GĐ), `commission_amt = base × rate`, `position`/`department`/`period_month` snapshot đúng.
3. Đơn tự set `is_commission_created=true`, `commission_status=COMPLETED` → nút biến mất (guard).
4. Số liệu khớp bảng kỳ vọng trong `test/commission.test.ts` (đã pass 30/30 offline).

Kỳ vọng G1 mẫu (base: package_revenue 100tr, payment_profit 20tr, order_service_fee 5tr, commission_price 80tr, extra 1tr):
Lương vận chuyển = 2.000.000 · Lương order = 4.000.000 · Lương order GD (NV giao dịch) = 2.000.000 · phí order GD 3 cấp = 500k/1tr/1tr · TP/GĐ = 200k mỗi · báo dư 3 cấp = 100k mỗi · com kế toán = 32k/32k/40k/40k. **Tổng 11.344.000**.
