# Thương hiệu & Giao diện — Hướng dẫn sử dụng

> Đổi “bộ mặt” toàn app: màu thanh bên/đầu trang/thẻ, màu nhấn, độ dày (mật độ), font,
> tên app, favicon, logo (sáng/tối)… Có sẵn preset, **nhớ theo từng theme**, và xuất/nhập cấu hình.

**Nhóm:** UI · **Chạy trên:** /admin (classic) + /v/ (modern) · **Phiên bản:** 0.4.9

## Sau khi cài, có gì mới?

- Trong **Settings** xuất hiện thêm mục **“Branding & Theme”** (icon giọt màu 🎨).
- Từ đó chỉnh được **skin/màu sidebar–header–thẻ–nền**, **màu nhấn (Accent)**, **mật độ (Density)**,
  **font toàn app**, **tên app + favicon + logo**, và **xuất/nhập** nguyên bộ cấu hình.
- Cấu hình **gắn theo từng theme** của NocoBase: mỗi theme nhớ riêng bộ màu của nó.

## Cấu hình ở đâu?

- **/v/ (modern):** bấm **⚙ Settings → “Branding & Theme”**.
- **/admin (classic):** **`/admin/settings/branding`** (Settings → Branding & Theme).

Trang có các tab: **Skin** · **Header & Logo** · **Import / export**.

## Dùng thế nào (từng bước)

### 1) Đổi màu & phong cách tổng thể (tab **Skin**)
1. Mở **Settings → Branding & Theme → tab Skin**.
2. Chọn **Admin skin** (preset dựng sẵn) để đổi nhanh cả bộ.
3. Tinh chỉnh:
   - **Accent & shape** — màu nhấn + bo góc (**Corners**).
   - **Density** — **Compact** (gọn) hay **Comfortable** (thoáng).
   - **Font** — **Font family**, **Font size**, hoặc dán **Google Fonts link**.
   - Màu nền: **Container (content background)**, **Card**, **Header** (có **From/To/Angle** để chuyển sắc gradient, **Header weight**, **Hide top menu**).
4. Đổi tới đâu xem preview tới đó → hài lòng thì **Lưu**. ✅

### 2) Tên app, favicon, logo (tab **Header & Logo**)
1. **App name & favicon** — đặt lại **tên app** và **favicon**.
2. **Logo** — tải **logo sáng/tối** riêng, hoặc **Generate from logo…** để suy ra màu.

### 3) Sao lưu / mang sang app khác (tab **Import / export**)
- **Export theme** → tải file cấu hình; **Import** → dán/tải lên để áp lại y hệt.

> 💡 Vì cấu hình **theo theme**: nếu đổi theme mà thấy “mất màu”, kiểm tra xem đang ở đúng theme đã cấu hình chưa.

## Mẹo & lưu ý

- ⚠️ **Màu nút bấm (primary)**: antd lấy màu từ **token theme**, không theo CSS chèn thêm — muốn đổi màu nút,
  chỉnh ở token theme (áp dụng sau khi tải lại trang).
- **Tên app** là toàn cục (không theo theme). Trang **đăng nhập** không gộp vào đây (dùng plugin *Custom Login*).
- Chạy trên **cả hai** giao diện classic và /v/.

## Gỡ / tắt

- Tắt plugin trong **Plugin Manager** → app trở lại giao diện gốc NocoBase.
  Cấu hình đã lưu vẫn còn trong DB; bật lại là khôi phục.

---

### Cho nhà phát triển
Cơ chế theme-aware (`type@<uid>` + fallback global, đọc `localStorage.NOCOBASE_THEME.uid`):
xem `docs/` (THEME-AWARE-PLAN) và mã trong `src/shared/brandingPage.tsx`.
