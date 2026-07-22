# Gửi Email — Hướng dẫn sử dụng

> Gửi email thẳng từ bản ghi và workflow, dùng mẫu HTML tái sử dụng và gửi qua Google Apps Script (Gmail) hoặc SMTP — không cần code.

**Nhóm:** Dữ liệu · **Chạy trên:** /v/ (client hiện đại) · **Phiên bản:** 0.2.0

## Mới ở 0.2.0
- **Nhiều phương thức gửi có tên** thay cho một backend duy nhất. Ví dụ vừa có phương thức Gmail-qua-Apps-Script **vừa** có phương thức SMTP song song; đánh dấu một cái làm **mặc định**, bật/tắt từng cái. Action trên record và node workflow chỉ **chọn phương thức** (hoặc dùng mặc định) — không còn nhập thông tin đăng nhập ở từng node.
- **Tương thích ngược:** thiết lập một-backend cũ sẽ **tự động chuyển** thành một phương thức tên *Mặc định* khi nâng cấp, nên vẫn gửi bình thường.
- **Liên kết nhanh** — từ hộp thoại Gửi email và từ node workflow có link **“Cấu hình phương thức gửi ↗”** mở thẳng trang cài đặt để thêm/sửa phương thức.

## Làm được gì
- **Mẫu HTML tái sử dụng**, soạn bằng **trình chỉnh sửa kéo-thả trực quan** (GrapesJS), chèn biến Handlebars `{{field}}` / `{{relation.field}}` / `{{formatDate …}}` / `{{formatNumber …}}` / `{{docso …}}`, có **xem trước trực tiếp gắn với 1 bản ghi mẫu**.
- **Danh sách phương thức gửi** — mỗi phương thức là một backend có tên: **Google Apps Script** (dùng chính Gmail của bạn qua web app — khỏi cấu hình SMTP) hoặc **SMTP** (nodemailer). Thông tin bí mật lưu **phía server**, không trả về trình duyệt.
- **Gửi từ bản ghi** — action **Gửi email** trên từng record: chọn **phương thức** + mẫu (hoặc soạn trực tiếp), xem trước theo record đó, sửa To/CC/BCC, đính kèm file của record, gửi.
- **Gửi trong workflow** — node **Send email** (nhóm Extended): chỉ **chọn phương thức + mẫu** và đặt To/CC/BCC/đính kèm. Không cấu hình backend/thông tin đăng nhập trên node.

## Ở đâu
Cài đặt (⚙) → **Gửi Email / Mailer**. Hai tab: **Phương thức gửi** (thêm/sửa các phương thức Apps Script / SMTP, đặt mặc định) và **Templates** (tạo/sửa mẫu HTML bằng trình trực quan + xem trước).

## Thiết lập
1. **Phương thức gửi → Thêm:** đặt tên cho phương thức, chọn **Apps Script** hoặc **SMTP**.
   - **Google Apps Script:** copy đoạn `doPost` hiện ra → tạo project trên script.google.com → dán vào → Deploy dạng **Web app** (Execute as: Me · Access: Anyone) → copy URL `/exec` dán lại vào ô.
   - **SMTP:** điền host / port / secure / user / pass / from (vd Gmail: `smtp.gmail.com:465` + App Password).
   - **Save**, hoặc **Save & send test**. Đánh dấu một phương thức **mặc định** để các lần gửi không chọn phương thức sẽ dùng nó.
2. **Templates:** New template → chọn collection + dữ liệu liên quan (appends) → viết Subject + soạn body HTML → chọn 1 record mẫu bên phải để xem trước → Save.
3. **Gửi:** thêm action **Send email** vào record (Configure actions), hoặc node **Send email** trong workflow — mỗi nơi chọn một phương thức (hoặc mặc định).

## Lưu ý
- **Quota Google Apps Script:** ~100 người nhận/ngày (Gmail thường), ~1500 (Workspace) — không dùng gửi hàng loạt lớn.
- URL `/exec` của Apps Script là **bí mật** (ai có URL gửi được dưới danh bạn) — chỉ lưu phía server.
- Email HTML: client thích inline CSS; trình trực quan lưu 1 khối `<style>` mà Gmail / đa số SMTP render OK (inline CSS là bước follow-up để chuẩn trên mọi client).

## Cho lập trình viên
- Collection phương thức `ptdlMailerMethods` (mỗi dòng là một backend, bí mật được mask khi đọc); collection mẫu `ptdlMailTemplates`. Collection cũ `ptdlMailerConfig` (một dòng) được giữ chỉ-đọc và tự chuyển thành một phương thức mặc định khi load/nâng cấp.
- Action server trên resource `mailer`: `send` + `methodOptions` (loggedIn); `getMethods` / `saveMethod` / `deleteMethod` / `setDefaultMethod` / `sendTest` (gate admin qua snippet `pm.mailer`). Khi gửi, server tự nạp phương thức được chọn (theo `key` ổn định, hoặc mặc định). Backend: Apps Script POST / SMTP nodemailer (bundle vào plugin).
- Engine mẫu port từ `@tuanla90/plugin-print-template` (Handlebars), isomorphic — preview client và gửi server dùng chung 1 code.
- Node workflow type key `ptdl-mailer` (đăng ký trên `@nocobase/plugin-workflow` nếu có); node chỉ chọn phương thức + mẫu + người nhận/đính kèm.
