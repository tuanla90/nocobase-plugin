# Gửi Email — Hướng dẫn sử dụng

> Gửi email thẳng từ bản ghi và workflow, dùng mẫu HTML tái sử dụng và gửi qua Google Apps Script (Gmail) hoặc SMTP — không cần code.

**Nhóm:** Dữ liệu · **Chạy trên:** /v/ (client hiện đại) · **Phiên bản:** 0.1.1

## Làm được gì
- **Mẫu HTML tái sử dụng**, soạn bằng **trình chỉnh sửa kéo-thả trực quan** (GrapesJS), chèn biến Handlebars `{{field}}` / `{{relation.field}}` / `{{formatDate …}}` / `{{formatNumber …}}` / `{{docso …}}`, có **xem trước trực tiếp gắn với 1 bản ghi mẫu**.
- **2 backend gửi** chọn được: **Google Apps Script** (dùng chính Gmail của bạn qua web app — khỏi cấu hình SMTP) hoặc **SMTP** (nodemailer). Thông tin bí mật lưu **phía server**, không trả về trình duyệt.
- **Gửi từ bản ghi** — action **Gửi email** trên từng record: chọn mẫu (hoặc soạn trực tiếp), xem trước theo record đó, sửa To/CC/BCC, đính kèm file của record, gửi.
- **Gửi trong workflow** — node **Send email** (nhóm Extended), có thể ghi đè backend cho riêng node.

## Ở đâu
Cài đặt (⚙) → **Gửi Email / Mailer**. Hai tab: **Backend** (chọn Apps Script hoặc SMTP + thông tin đăng nhập) và **Templates** (tạo/sửa mẫu HTML bằng trình trực quan + xem trước).

## Thiết lập
1. **Backend → Google Apps Script:** copy đoạn `doPost` hiện ở tab Backend → tạo project trên script.google.com → dán vào → Deploy dạng **Web app** (Execute as: Me · Access: Anyone) → copy URL `/exec` dán lại vào ô. Hoặc **SMTP:** điền host / port / secure / user / pass / from (vd Gmail: `smtp.gmail.com:465` + App Password). **Save**, rồi **Save & send test**.
2. **Templates:** New template → chọn collection + dữ liệu liên quan (appends) → viết Subject + soạn body HTML → chọn 1 record mẫu bên phải để xem trước → Save.
3. **Gửi:** thêm action **Send email** vào record (Configure actions), hoặc node **Send email** trong workflow.

## Lưu ý
- **Quota Google Apps Script:** ~100 người nhận/ngày (Gmail thường), ~1500 (Workspace) — không dùng gửi hàng loạt lớn.
- URL `/exec` của Apps Script là **bí mật** (ai có URL gửi được dưới danh bạn) — chỉ lưu phía server.
- Email HTML: client thích inline CSS; trình trực quan lưu 1 khối `<style>` mà Gmail / đa số SMTP render OK (inline CSS là bước follow-up để chuẩn trên mọi client).

## Cho lập trình viên
- Collection cấu hình `ptdlMailerConfig` (bí mật được mask khi đọc); collection mẫu `ptdlMailTemplates`.
- Action server `mailer:send` (loggedIn); CRUD cấu hình gate theo admin. Backend: Apps Script POST / SMTP nodemailer (bundle vào plugin).
- Engine mẫu port từ `@tuanla90/plugin-print-template` (Handlebars), isomorphic — preview client và gửi server dùng chung 1 code.
- Node workflow type key `ptdl-mailer` (đăng ký trên `@nocobase/plugin-workflow` nếu có).
