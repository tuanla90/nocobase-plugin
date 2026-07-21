# Quản lý tệp — Hướng dẫn sử dụng

> Trung tâm quản lý **mọi tệp đã tải lên**. NocoBase lưu tất cả tệp trong một collection lõi
> `attachments` nhưng không cho bạn chỗ nào để xem — Quản lý tệp thì có: **duyệt, xem trước, đổi tên và
> xóa** tệp, biết **mỗi tệp đang được bản ghi nào dùng**, tìm và **dọn hàng loạt tệp rác**, và **tải về
> bản sao lưu ZIP**. Nó chỉ đọc bảng attachments sẵn có — **không tạo bảng mới, không thêm dữ liệu**.

**Nhóm:** Công cụ & quản trị (Admin & tools) · **Chạy trên:** /v/ (modern) · **Phiên bản:** 0.1.2

## Sau khi cài, có gì mới?

- **Một trang cấu hình mới trong Settings: “Quản lý tệp”** (biểu tượng thư mục). Đây là nơi duy nhất bạn thao tác.
- **Không tạo collection hay bảng mới** — nó quản lý chính bảng `attachments` sẵn có mà File Manager lõi đã ghi vào mỗi lần upload.
- **Không thêm menu, nút hay field** nào lên các trang/khối dữ liệu của bạn.
- ⚠️ **Các thao tác thay đổi (đổi tên / xóa / dọn rác …) chỉ dành cho quản trị viên.** Việc duyệt và xem thống kê thì mọi người dùng đã đăng nhập vào được trang đều dùng được.

## Tìm ở đâu?

| Giao diện | Đường dẫn |
|---|---|
| **Modern (`/v/`)** | ⚙ **Settings** → **“Quản lý tệp”** (nhãn tiếng Anh: **“File Vault”**) |

> Quản lý tệp là tính năng của **giao diện modern (`/v/`)**; trên giao diện classic `/admin` nó nạp ở chế độ no-op (không có gì để cấu hình ở đó).

## Làm được những gì?

- **Duyệt** mọi tệp ở dạng **lưới ảnh** (ảnh có thumbnail; tệp khác hiện icon loại theo Lucide) hoặc **bảng** — kèm dung lượng dễ đọc, loại, kho lưu trữ, người tải lên và ngày. Có phân trang.
- **Tìm** theo tiêu đề / tên tệp, và **lọc** theo:
  - **Loại** — hình ảnh, video, âm thanh, PDF, tài liệu, bảng tính, nén, khác.
  - **Kho lưu trữ** — tệp nằm ở kho nào.
  - **Khoảng ngày** — thời điểm tải lên.
  - **Dùng ở collection** (+ **Mã bản ghi** tùy chọn) — chỉ hiện các tệp được một bản ghi trong collection đó tham chiếu, hoặc bởi một bản ghi cụ thể. Lọc này chạy **ở server** nên bao trùm **tất cả** tệp, không chỉ trang hiện tại.
- **Thống kê ở đầu trang** — tổng số tệp, tổng dung lượng, phân tích theo loại, và **số tệp rác + dung lượng thu hồi được**, tách thành các ô số liệu gọn gàng.
- **Sử dụng** — mỗi tệp hiện huy hiệu **“dùng ở N nơi”**; bấm vào để xem **collection + field + bản ghi** nào đang tham chiếu (kèm nhãn và id của bản ghi). Tệp không bản ghi nào dùng được đánh dấu **Rác (Orphan)**.
- **Quản lý** — **Xem trước** (mở ảnh phóng to / mở tab), **Đổi tên** tiêu đề hiển thị, **Tải về** một tệp, và **Xóa** kèm **cảnh báo theo mức sử dụng** (xóa tệp đang được dùng sẽ được cảnh báo mạnh).
- **Hàng loạt** — chọn nhiều tệp rồi **xóa hàng loạt** hoặc **Tải ZIP**.
- **Dọn tệp rác** — một thao tác xóa mọi tệp không bản ghi nào tham chiếu, lấy lại dung lượng (có hộp xác nhận hiện số lượng + dung lượng trước).
- **Sao lưu** — **Tải ZIP** các tệp đã chọn, hoặc **Sao lưu tất cả (ZIP)** từ đầu trang để sao lưu toàn bộ. Mỗi file zip có kèm `_manifest.txt` liệt kê tệp nào được đưa vào / bị bỏ qua.

## Dùng thế nào (từng bước)

### Xem một tệp đang được dùng ở đâu

1. Mở **Settings → “Quản lý tệp”**.
2. Trên bất kỳ tệp nào, huy hiệu **Sử dụng** ghi **“dùng ở N nơi”** (hoặc **Rác**). Bấm vào **“dùng ở N nơi”**.
3. Cửa sổ liệt kê từng **collection · field** và các **bản ghi** tham chiếu (nhãn + `#id`).

### Tìm mọi tệp mà một bản ghi đang dùng

1. Trên thanh lọc, chọn một collection ở **“Dùng ở collection”**.
2. *(Tuỳ chọn)* gõ **Mã bản ghi** để thu hẹp về một bản ghi duy nhất.
3. Danh sách chỉ còn các tệp mà bản ghi đó tham chiếu — trên toàn bộ dữ liệu, không chỉ trang này.

### Xóa an toàn / dọn dẹp

- **Một tệp:** bấm icon **thùng rác** → xác nhận. Nếu tệp đang được dùng, hộp thoại **cảnh báo** rằng xóa sẽ làm hỏng các bản ghi đó.
- **Nhiều tệp:** tick các tệp → **“Xóa mục đã chọn”**.
- **Tất cả tệp rác:** ở đầu trang bấm **“Dọn file rác (N)”** → xác nhận. Chỉ những tệp không bản ghi nào dùng mới bị xóa.
- Xóa một tệp sẽ xóa cả **dòng trong cơ sở dữ liệu** lẫn **tệp vật lý** trên đĩa (với kho lưu trữ local, và các kho khác mà File Manager lõi xử lý).

### Sao lưu tệp

1. Tick các tệp cần lấy → **“Tải ZIP”** (hoặc **“Sao lưu tất cả (ZIP)”** ở đầu trang để lấy toàn bộ).
2. Một file `.zip` được tải về, mỗi tệp đặt tên theo tiêu đề hiển thị; tên trùng sẽ được thêm hậu tố ` (2)`; kèm `_manifest.txt` liệt kê tệp được đưa vào / bị bỏ qua.

## Mẹo & lưu ý

- ⚠️ **Rác = không được field tệp đính kèm / quan hệ nào tham chiếu.** Quản lý tệp chỉ phát hiện tham chiếu **qua quan hệ**. Tệp chỉ được tham chiếu bằng **URL nhúng trong trường văn bản hoặc JSON** sẽ *không* được phát hiện và bị coi là rác — hãy rà lại trước khi **Dọn file rác**.
- **Xóa là vĩnh viễn** — tệp vật lý bị gỡ bỏ. Hãy **Tải ZIP** trước nếu muốn giữ bản sao lưu.
- **Chỉ quản trị viên:** đổi tên, xóa, xóa hàng loạt và dọn rác đều cần vai trò admin; và nếu việc quét sử dụng không xác minh được đầy đủ tham chiếu thì **Dọn file rác sẽ hủy để an toàn** thay vì mạo hiểm xóa nhầm tệp đang được dùng.
- **Không cần cấu hình gì** — plugin không cần thiết lập; nó đọc các kho lưu trữ mà File Manager đã khai báo sẵn.

## Gỡ / tắt

- **Tắt trong Plugin Manager** — trang “Quản lý tệp” biến mất; các tệp của bạn, bảng `attachments` và mọi kho lưu trữ vẫn **nguyên vẹn** (Quản lý tệp chỉ đọc và quản lý chúng).

---

### Cho nhà phát triển

Quản lý tệp **không tạo collection nào**. Trang cấu hình `/v/` (`ptdl-file-vault`) gọi tới một resource server tùy biến **`fileVault`** với các action `browse`, `stats`, `usage`, `rename`, `purge`, `cleanOrphans`, `downloadZip` — không dùng `attachments:list` gốc (lõi đã vô hiệu hóa) cũng không dùng `attachments:update` / `:destroy` (lõi giới hạn theo người tải lên), nên nó thao tác thẳng qua **repository** của attachments, và chặn theo quyền admin ngay trong handler.

**Quét sử dụng** duyệt `db.collections` lúc chạy và, với mọi association có target là `attachments` (belongsToMany qua bảng nối, hoặc belongsTo — ví dụ `systemSettings.logo` định nghĩa trong code), đếm số bản ghi tham chiếu bằng **một truy vấn gộp cho mỗi quan hệ** (không N+1); tệp không quan hệ nào chỉ tới là tệp rác. **Xóa vật lý** diễn ra tự động — hủy một dòng `attachments` sẽ kích hoạt hook `afterDestroy` của File Manager, hook này gỡ tệp khỏi kho lưu trữ. **ZIP hàng loạt** đọc từng tệp (qua chính `getFileStream` của File Manager tra cứu lúc chạy, hoặc đọc từ đĩa local, hoặc fetch theo URL từ xa), nén trong bộ nhớ bằng **jszip** (đóng gói sẵn vào lane server), rồi trả về Buffer `application/zip` thô không bị bọc JSON. Mọi thứ đều crash-safe: một lần quét lỗi hay một tệp không đọc được cũng không làm hỏng trang hay file zip. Build bằng `bash build-env/recipes/run-file-vault-build.sh`.
