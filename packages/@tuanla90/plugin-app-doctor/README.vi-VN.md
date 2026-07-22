# App Doctor (Bác sĩ ứng dụng) — Hướng dẫn sử dụng

> **Quét** toàn bộ bảng dữ liệu để tìm **quan hệ hỏng** và **sửa bằng một cú bấm**. Chuyên trị loại hỏng do
> **import / sinh app tự động** để lại — cũng chính là nguyên nhân **treo app khi mở sub-table**. Việc sửa chỉ
> **THÊM quan hệ ngược còn thiếu**, **không bao giờ đụng dữ liệu**.

**Nhóm:** System services · **Chạy trên:** /v/ (modern) + /admin (classic) · **Phiên bản:** 0.1.0

## Vì sao cần plugin này?

Khi bạn **import dữ liệu** hoặc để **AI/app-builder sinh app**, quan hệ nhiều khi bị **một chiều**: bảng con có
`đơn hàng → khách`, nhưng bảng `khách` **không có** danh sách `đơn hàng` ngược lại. Hậu quả:
- **Treo app** khi bạn bật một cột **sub-table** trỏ vào quan hệ thiếu chiều (cột không phân giải được field → lỗi
  render lan ra cả app). *(Plugin `perf-guard` đã chặn treo — App Doctor **chữa tận gốc** để quan hệ hoạt động đúng.)*
- Không mở được danh sách liên quan, không lọc/hiển thị xuyên quan hệ như mong đợi.

App Doctor tìm những chỗ đó và **tự tạo quan hệ ngược** cho khớp.

## Sau khi cài, có gì mới?

- **Một trang cài đặt mới**: **⚙ Cài đặt → “App Doctor”** (có ở cả `/v/` và `/admin`). Mở là **tự quét** ngay.
- **Không thêm** bảng / field / collection nào của riêng plugin; chạy khi bạn bấm.
- ⚠️ Cần quyền **quản trị viên** để quét/sửa.

## Nó kiểm tra gì?

| Vấn đề | Mức | Sửa tự động? |
|---|---|---|
| **Thiếu quan hệ ngược** — quan hệ một chiều (belongsTo thiếu hasMany của cha, hasMany thiếu belongsTo của con, hoặc n-n một chiều) | Cảnh báo | ✅ **Có** (tạo quan hệ ngược) |
| **Trỏ tới bảng không tồn tại** — quan hệ target là bảng đã xoá | Lỗi | ❌ Sửa thủ công (mô hình đã mất) |
| **Thiếu bảng trung gian** — quan hệ nhiều-nhiều mất bảng nối (through) | Lỗi | ❌ Sửa thủ công |

*(Quan hệ tới bảng hệ thống như `users`/`roles` — ví dụ “người tạo/người sửa” — **không** bị coi là thiếu ngược.)*

## Dùng thế nào (từng bước)

1. Vào **⚙ Cài đặt → “App Doctor”**. Trang **tự quét** và hiện danh sách vấn đề (Lỗi đỏ trước, Cảnh báo vàng sau).
2. Xem cột **Vấn đề** để hiểu từng dòng: bảng nào, quan hệ nào, thiếu gì.
3. Sửa:
   - **Từng cái:** bấm **“Sửa”** ở dòng có thể tự sửa → tạo đúng quan hệ ngược còn thiếu.
   - **Tất cả:** bấm **“Sửa tất cả (N)”** → tạo mọi quan hệ ngược còn thiếu trong một lần (có hỏi xác nhận).
4. **Tải lại trang (F5)** sau khi sửa để giao diện nạp lại danh sách field mới. Bấm **“Quét lại”** để xác nhận đã sạch.

## Mẹo & lưu ý

- 🛟 **An toàn:** sửa chỉ **THÊM** một field quan hệ ảo (để điều hướng), **không** xoá/sửa dữ liệu hay field sẵn có.
  Tên quan hệ ngược được **chọn tránh trùng** tự động.
- 🔁 **Idempotent:** quét/sửa lại nhiều lần vô hại — cái nào đã có quan hệ ngược sẽ **không** bị tạo lần hai.
- 🩺 **Dùng chung với `perf-guard`:** perf-guard **chặn treo** tức thời; App Doctor **chữa gốc** để quan hệ chạy đúng.
  Nên chạy App Doctor **sau mỗi lần import / sinh app**.
- ⚠️ Mục **Lỗi** (bảng/through không tồn tại) cần bạn tự xử ở phần **Quản lý collection** (khôi phục bảng hoặc xoá
  quan hệ mồ côi) — App Doctor không tự đoán mô hình đã mất.

## Gỡ / tắt

Tắt plugin trong **Plugin Manager** là xong — App Doctor **không chạy nền**, chỉ hoạt động khi bạn mở trang và bấm,
nên gỡ ra hoàn toàn vô hại (những quan hệ ngược **đã tạo** vẫn ở lại vì chúng là một phần mô hình dữ liệu của bạn).

---

### Cho nhà phát triển

Server thuần (`src/server/doctor.ts` + `plugin.ts`). Scan đọc **một lần** toàn bộ `fields` repo + danh sách bảng
dữ liệu người dùng từ `collections` repo (allowlist — bỏ qua system), rồi với mỗi field quan hệ kiểm tra quan hệ
ngược tương ứng tồn tại trên bảng target (belongsTo↔hasMany/hasOne theo cùng `foreignKey`; n-n theo `through`).
Repair **re-scan phía server** rồi tạo field ngược qua `fields` repo — **idempotent theo (target, FK)**, đặt tên
tránh trùng (mượn nguyên cơ chế đã kiểm chứng của `app-builder`). Hai action `ptdlAppDoctor:scan|repair`, **chỉ
admin** (snippet `pm.app-doctor` + `requireAdmin`), `ctx.body` **raw** (không bọc `{data}`). Không collection riêng.
