# Đồng bộ Google Sheets — Hướng dẫn sử dụng

> Kéo dữ liệu từ **một tab Google Sheet** vào một **collection NocoBase thật** — chạy tay hoặc
> tự động theo lịch. Tự tạo collection và **đoán kiểu dữ liệu**, hoặc map cột vào collection có sẵn;
> chế độ **thay toàn bộ** hoặc **upsert theo cột khóa**; tuỳ chọn **ghi ngược 2 chiều** lên sheet.

**Nhóm:** Công cụ mô hình dữ liệu (Data model tools) · **Chạy trên:** /admin (classic) + /v/ (modern) · **Phiên bản:** 0.1.1

## Sau khi cài, có gì mới?

- **Một trang cấu hình mới trong Settings**: **“Google Sheets Sync”** (biểu tượng đám mây đồng bộ). Đây là nơi duy nhất bạn thao tác — chia làm 2 thẻ: **“Kết nối”** và **“Service Account”**.
- **Không thêm menu, nút hay field** nào lên các trang/khối dữ liệu của bạn.
- Khi bạn chạy đồng bộ lần đầu, một **collection dữ liệu thật** sẽ xuất hiện trong **Data sources** (dùng được ngay trong block/quan hệ như mọi bảng khác).
- ⚠️ **Bật plugin lên thì chưa đồng bộ gì cả.** Phải khai báo một **Service Account** + một **Kết nối** thì dữ liệu mới bắt đầu chảy.

## Cấu hình ở đâu?

| Giao diện | Đường tới trang cấu hình |
|---|---|
| **Modern (`/v/`)** | ⚙ **Settings** → **“Google Sheets Sync”** → thẻ **“Kết nối”** |
| **Classic (`/admin`)** | **Settings** → **“Google Sheets Sync”** (đường dẫn `/admin/settings/gsheet-sync`) |

Cả hai giao diện mở **cùng một trang cấu hình** và dùng chung dữ liệu. Trong trang có sẵn 2 nút ở góc trên phải: **“↻ Tải lại”** và **“Quản lý collection”** (mở thẳng danh sách collection trong Data sources).

## Dùng thế nào (từng bước)

> ✅ **Làm một lần trước tiên:** khai báo **Service Account** rồi **Share** Google Sheet cho email của nó. Không có bước này thì mọi kết nối đều báo lỗi “không truy cập được sheet”.

### Bước chuẩn bị — Tạo Service Account & chia sẻ sheet

1. Vào **Google Cloud Console → IAM → Service Accounts** → tạo một service account → tab **Keys** → thêm **key JSON** (tải file về).
2. Trong NocoBase mở trang **“Google Sheets Sync”** → thẻ **“Service Account”** → bấm **“Thêm Service Account”**.
3. Đặt **“Tên gợi nhớ”** (VD: *SA phòng kế toán*) và dán **toàn bộ** nội dung file JSON vào ô **“Service Account JSON”** → **“Lưu”**.
4. Sau khi lưu, cột **“Service account email”** hiện ra một email dạng `…@…iam.gserviceaccount.com`. **Copy** email đó.
5. Mở Google Sheet cần đồng bộ → **Share** cho email vừa copy: quyền **Viewer** là đủ để kéo về; cần **Editor** nếu muốn **ghi ngược 2 chiều**.

> 💡 Một Service Account **dùng lại được cho nhiều kết nối** — chỉ cần khai báo một lần. Cột **“Đang dùng”** cho biết nó đang được bao nhiêu kết nối sử dụng (đang dùng thì không xoá được).

### Tình huống A — Kéo một tab về collection MỚI (tạo tự động)

1. Sang thẻ **“Kết nối”** → bấm **“＋ Thêm connection”**.
2. **“Tên connection”**: đặt tên gợi nhớ (VD: *Danh sách đơn hàng*).
3. **“Service Account”**: chọn account đã lưu ở bước chuẩn bị.
4. **“Spreadsheet ID hoặc URL”**: dán **nguyên URL** Google Sheet cũng được (hệ thống tự tách ID) → bấm **“Kiểm tra kết nối”**. Nếu OK sẽ hiện tên bảng tính + số tab.
5. **“Sheet (tab)”**: chọn tab cần lấy (danh sách nạp sau khi Kiểm tra kết nối).
6. *(Tuỳ chọn)* **“Vùng dữ liệu (tuỳ chọn)”**: để trống = cả sheet; hoặc gõ `A1:F` — **dòng đầu của vùng là dòng tiêu đề**.
7. **“Collection đích”**: chọn **“Tạo collection mới”** và đặt tên bảng (VD: `gs_don_hang`).
8. Bấm **“👁 Xem trước & thiết lập mapping cột”** để xem **kiểu dữ liệu đoán tự động** và **dữ liệu mẫu**. Bỏ tick cột không cần, sửa tên field / **“Kiểu lưu”** nếu muốn.
9. Đặt **“Tự động sync (phút)”** (`0` = chỉ chạy tay; `15` = mỗi 15 phút), giữ **“Bật connection”** đang bật → **“Lưu”**.
10. Bấm **“Đồng bộ ngay”** (ở dòng kết nối hoặc trong cửa sổ sửa). ✅ Collection được **tạo tự động** kèm dữ liệu; báo *“Đồng bộ xong: N dòng”*.

> 💡 Cột **“Ngày”** trên sheet được nhận đúng là ngày (không phải số serial của Google) — kiểu dữ liệu đoán theo định dạng ô, không phụ thuộc locale.

### Tình huống B — Đổ vào một collection CÓ SẴN (map cột)

1. Ở **“Collection đích”** chọn **“Collection có sẵn”** → chọn collection trong danh sách.
2. Bấm **“👁 Xem trước & thiết lập mapping cột”**. Cột trùng tên field sẽ **tự khớp**; chỉ những cột được **tick** mới đồng bộ.
3. Với mỗi cột, chọn **“Field đích”** tương ứng (kiểu dữ liệu **lấy theo field đích**, không cần chọn “Kiểu lưu”).
4. Chọn chế độ đồng bộ → **“Lưu”** → **“Đồng bộ ngay”**.

> ⚠️ Ở collection có sẵn, chế độ **replace** **chỉ xoá những dòng do plugin này tạo ra** (dòng bạn tự nhập tay vẫn giữ nguyên).

### Tình huống C — Giữ nguyên ID record (Upsert theo cột khóa)

1. Ở **“Chế độ đồng bộ”** chọn **“Upsert theo cột khóa”**.
2. Chọn **“Cột khóa”** — cột có **giá trị duy nhất** mỗi dòng (VD: *Mã đơn*). *(Bấm Xem trước để nạp danh sách cột.)*
3. *(Tuỳ chọn)* tick **“Xoá record không còn trên sheet”** để dọn các dòng đã bị xoá khỏi sheet.
4. **“Lưu”**. ✅ Mỗi lần sync sẽ **cập nhật hoặc thêm** theo cột khóa, **giữ nguyên id record** — an toàn cho quan hệ / comment gắn vào record.

### Tình huống D — Ghi ngược 2 chiều (NocoBase → Sheet)

1. Phải đang ở **Upsert + đã chọn cột khóa** (điều kiện bắt buộc), và sheet đã **Share quyền Editor** cho service account.
2. Bật công tắc **“Đẩy thay đổi từ NocoBase lên sheet”**.
3. Chọn cách xử lý **“Khi xoá record:”** — **“Không đụng sheet”**, **“Xoá trắng dòng (giữ dòng)”**, hoặc **“Xoá hẳn dòng trên sheet”**.
4. **“Lưu”**. Từ giờ, **sửa/thêm/xoá** record trong NocoBase sẽ được **đẩy lên sheet sau ~3 giây** (gộp thành một lô). Muốn đẩy lại toàn bộ ngay: bấm **“⇪ Đẩy toàn bộ lên sheet”**.

## Mẹo & lưu ý

- **Replace hay Upsert?**

  | Chế độ | Cách chạy | ID record | Dùng khi |
  |---|---|---|---|
  | **Thay toàn bộ (replace)** *(mặc định)* | Xoá sạch rồi nạp lại mỗi lần sync | **Đổi mỗi lần** → quan hệ/comment gắn vào record sẽ đứt | Bảng tra cứu, không gắn quan hệ; cần nhanh |
  | **Upsert theo cột khóa** | Khớp theo cột khóa, cập-nhật-hoặc-thêm từng dòng | **Giữ nguyên** | Cần ID ổn định, có quan hệ, hoặc bật 2 chiều |

- **Kiểu dữ liệu đoán được** (khi tạo collection mới) — sửa được ở cột **“Kiểu lưu”** trong bảng mapping: **Chữ (string)**, **Chữ dài (text)**, **Số nguyên**, **Số thực**, **Đúng/sai**, **Ngày**.
- ⚠️ **Re-sync không đổi kiểu field đã có** — mỗi lần sync chỉ **thêm** field còn thiếu, không sửa kiểu field cũ. Muốn đổi kiểu/định dạng: bấm vào **thẻ tên collection** (màu xanh, có biểu tượng ⚙) ở cột **“Collection đích”** để mở thẳng cấu hình field, sửa xong rồi sync lại.
- **Ghi ngược là “ghi sau đè ghi trước” (last-write-wins)** — chưa có phát hiện xung đột. Tránh sửa cùng một dòng đồng thời ở cả hai nơi.
- **Service Account không tạo được bảng tính mới** (chính sách Google 2025) — Google Sheet phải **tồn tại sẵn** và đã được **Share** cho service account.
- **Lịch tự động:** hệ thống rà mỗi phút; đặt/đổi **“Tự động sync (phút)”** rồi **“Lưu”** là có hiệu lực — **không cần restart server**. Đặt `0` để chỉ chạy tay.
- **Credentials cũ (per-connection):** kết nối cũ có thể còn dùng credentials dán trực tiếp (gắn nhãn **“credentials riêng (cũ)”**). Vẫn chạy được, nhưng nên chọn một **Service Account** dùng chung cho gọn.
- Chạy trên **cả hai** giao diện: classic `/admin` và modern `/v/`.

## Gỡ / tắt

- **Tạm ngừng một kết nối:** mở kết nối, **tắt “Bật connection”** (hoặc đặt **“Tự động sync (phút)”** = `0`, hoặc tắt 2 chiều) → **“Lưu”**. Cấu hình vẫn giữ, bật lại lúc nào cũng được.
- **Xoá một kết nối:** bấm **“Xoá”** — chỉ xoá phần cấu hình. **Collection dữ liệu và các dòng đã đồng bộ vẫn còn**, Google Sheet cũng nguyên vẹn; từ đó hai bên trở nên độc lập.
- **Gỡ hẳn plugin:** tắt trong **Plugin Manager** — việc đồng bộ dừng ngay. Các collection đã tạo và dữ liệu trong đó **vẫn còn** trong cơ sở dữ liệu.

---

### Cho nhà phát triển

Client Google **không phụ thuộc thư viện ngoài** (JWT RS256 ký bằng `crypto` của node + `fetch`, gọi thẳng Sheets REST). Cấu hình lưu ở 2 collection ẩn: `ptdl_gsheet_connections` (mỗi kết nối 1 dòng) và `ptdl_gsheet_accounts` (service account dùng lại, `credentials` chỉ-ghi). Collection đích tạo qua repository của collection-manager (nên xuất hiện trong Data sources) + thêm field ẩn `_sheet_row` để định danh dòng. Resource server: `ptdlGsheet` (ACL snippet `pm.gsheet-sync`); scheduler chạy mỗi 60 giây; ghi ngược gộp-lô (debounce) qua `values:batchUpdate`. Chi tiết kỹ thuật đầy đủ: xem `README.md` (tiếng Anh).
