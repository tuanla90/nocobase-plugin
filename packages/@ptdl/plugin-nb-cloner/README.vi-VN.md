# NB Cloner (Xuất / nhập ứng dụng) — Hướng dẫn sử dụng

> Nhân bản toàn bộ một app NocoBase tự xây — collections, giao diện, menu, phân quyền và dữ liệu được
> chọn — từ bản cài này sang bản cài khác bằng một file **`.nbc.gz`** duy nhất. Import là **UPSERT**
> (không bao giờ xoá dữ liệu đang có).

**Nhóm:** Quản trị / Di trú (Migration) · **Chạy trên:** /admin (classic) + /v/ (modern) · **CSDL:** chỉ PostgreSQL · **Phiên bản:** 1.8.0

## Sau khi cài, có gì mới?

- **Một trang cấu hình mới trong Settings: “NB Cloner”** (biểu tượng copy) với ba tab: **Xuất (Export)**, **Nhập (Import)** và **Cập nhật plugin (Update Plugin)**.
- **Không thêm menu, nút hay field** nào lên các trang/khối dữ liệu của bạn.
- Không có gì chạy tự động — mọi lần xuất/nhập đều do bạn bấm từ trang này.

## Cấu hình ở đâu?

| Client | Đường dẫn tới trang |
|---|---|
| **Hiện đại (`/v/`)** | ⚙ **Settings** → **“NB Cloner”** |
| **Cổ điển (`/admin`)** | **Settings** → **“NB Cloner”** (đường dẫn `/admin/settings/ptdl-nb-cloner`) |

Cả hai client mở **cùng một trang** và gọi cùng các endpoint phía server.

## Những gì được clone

| Phần | Có | Ghi chú |
|---|---|---|
| **Collections + Fields** | ✅ | Cấu trúc các bảng nghiệp vụ (bảng hệ thống KHÔNG bị đụng khi import). |
| **Nhóm bảng (categories)** | ✅ | Các nhóm hiển thị trong collection manager. |
| **Giao diện (UI)** | tuỳ chọn | uiSchemas, flow-engine models (nội dung trang/khối của `/v/`), block template. |
| **Menu / routes** | ✅ (kèm UI) | routes desktop + mobile và các bảng closure/path — thiếu chúng thì app đích trắng menu. |
| **Vai trò & phân quyền** | tuỳ chọn | Chỉ role tự tạo (`root`/`admin`/`member` được bỏ qua để không ghi đè role mặc định của app đích). |
| **Workflows** | tuỳ chọn | Chỉ định nghĩa + node — **không** lấy executions/jobs. |
| **Dữ liệu nghiệp vụ** | theo từng bảng | Mặc định tắt; bật **“Chép dữ liệu”** cho bảng nào bạn muốn lấy cả dòng. |
| **File đính kèm / upload** | ❌ | File nhị phân **không** được clone — chỉ có dòng DB. |

## Cách dùng (từng bước)

### Xuất (app nguồn)

1. Mở **Settings → “NB Cloner” → Xuất**.
2. Đặt **Tên app** (dùng trong tên file tải về).
3. Bật các tuỳ chọn **Hệ thống** bạn muốn: *Cấu trúc bảng*, *Giao diện / Menu*, *Vai trò & phân quyền*, *Quy trình*.
4. Trong **Bảng nghiệp vụ**, tích các bảng cần lấy và bật **“Chép dữ liệu”** cho bảng nào muốn lấy cả dòng. Dùng nút **Tất cả / Không** để bật/tắt nhanh.
5. Bấm **“Xuất → Tải .nbc.gz”**. Trình duyệt tải về file `nb-clone-<app>-<ngày>.nbc.gz`.

### Nhập (app đích)

> ⚠️ **App đích PHẢI CÙNG phiên bản NocoBase với app nguồn.** Flow-engine đổi định dạng lưu giữa các
> version, nên import chéo phiên bản sẽ làm hỏng giao diện.

1. Mở **Settings → “NB Cloner” → Nhập** trên app **đích**.
2. Đọc phần cảnh báo, rồi kéo thả file `.nbc.gz` vào ô tải lên.
3. Chờ báo cáo từng bước — **đừng đóng hay reload trang** khi đang chạy (app lớn có thể mất 1–2 phút).
4. Xong thì **Restart app** để bảng và giao diện nạp đủ.

Bảng kết quả liệt kê từng bước (`schema.collections`, `db.sync`, `ui.schemas`, `data.<bảng>`, …) kèm trạng thái `ok` / `bỏ qua` / `lỗi` và số dòng.

### Cập nhật plugin (tuỳ chọn)

Tab **Cập nhật plugin** cho phép thả file `plugin-nb-cloner-vX.Y.Z.zip` mới để ghi đè bản đang cài tại
chỗ (né lỗi *“already added”* / EBUSY khi Remove). Sau khi báo thành công, **restart app**. Tab này cũng
hiện version đang cài so với version code đang thực chạy, để bạn biết khi nào còn cần restart.

## Yêu cầu & giới hạn

- **Chỉ PostgreSQL.** Xuất/nhập dùng SQL đặc thù PostgreSQL (`ON CONFLICT` upsert, dò khóa chính qua
  `information_schema`). Trên dialect khác, plugin **báo lỗi rõ ràng và dừng ngay** thay vì làm hỏng app đích.
- **Cùng phiên bản NocoBase** ở hai đầu (xem cảnh báo import ở trên).
- **Import là UPSERT** — cập nhật/chèn, không xoá. Muốn kết quả sạch, import vào một app **trắng, vừa cài**.
- **Bundle lớn:** nội dung flow-engine có thể vượt giới hạn request mặc định 10 MB của NocoBase. Nếu import
  lỗi trên app lớn, đặt env **`REQUEST_BODY_LIMIT=50mb`** (hoặc cao hơn) rồi restart.
- **File đính kèm không được clone** — copy storage riêng nếu cần file.
- **Bắt buộc restart** sau import để bảng + giao diện xuất hiện.

## Bảo mật

Các endpoint export / import / self-update rất mạnh: export đọc **mọi** bảng nghiệp vụ, import ghi
schema/UI/role của app đích, còn self-update **ghi đè chính code của plugin** (sẽ chạy ở lần restart sau).
Chúng được cấp cho `loggedIn` — giống các plugin cấu hình @ptdl khác — và chỉ vào được qua trang **Settings**
(vốn chỉ admin thấy). **Nếu app của bạn cho người dùng không tin cậy đăng nhập, hãy giới hạn quyền bằng
role của NocoBase** (hoặc đừng bật plugin ở đó).

## Định dạng `.nbc.gz`

File `.nbc.gz` là một JSON bundle duy nhất (manifest + schema + ui + acl + workflows + businessData) nén
bằng gzip. Manifest mang version của định dạng bundle; importer sẽ từ chối bundle có major version cũ hơn
mức nó hiểu và yêu cầu bạn export lại.

## Xử lý sự cố

| Hiện tượng | Nguyên nhân / cách xử lý |
|---|---|
| “NB Cloner supports PostgreSQL only …” | App không chạy PostgreSQL. Tool này chỉ hỗ trợ PostgreSQL theo thiết kế. |
| Import lỗi trên app lớn | Tăng `REQUEST_BODY_LIMIT` (vd `50mb`) rồi restart, thử lại. |
| Menu / trang app đích trống sau import | Đảm bảo đã bật **Giao diện / Menu** khi export, và **Restart** app đích sau import. |
| Vài bước `data.<bảng>` báo `lỗi` | Các dòng đó bị bỏ qua (thường do thứ tự FK hoặc lệch cột); phần còn lại của import vẫn áp dụng. Restart rồi chạy lại nếu cần. |
| Tag version hiện màu cam “code v… · restart để đồng bộ” | Code đang chạy khác version ghi trong DB — hãy restart app. |
