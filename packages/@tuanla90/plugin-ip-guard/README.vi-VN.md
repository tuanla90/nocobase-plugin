# Chặn/Cho phép theo IP (Danh sách trắng/đen) — Hướng dẫn sử dụng

> Tường lửa cho NocoBase theo **địa chỉ IP** của người truy cập: chỉ cho một số IP vào, hoặc chặn
> một số IP xấu — cấu hình ngay trong trang quản trị, **không cần code, không cần restart server**.

**Nhóm:** Bảo mật (Security) · **Chạy trên:** /admin (classic) + /v/ (modern) · **Phiên bản:** 0.2.1

## Sau khi cài, có gì mới?

- **Một trang cấu hình mới trong Settings**: **“Chặn/Cho phép theo IP”** (biểu tượng ổ khoá). Đây là nơi duy nhất bạn chỉnh.
- **Không thêm menu, nút hay field** nào lên các trang/khối dữ liệu của bạn.
- ⚠️ **Mặc định là Tắt.** Bật plugin lên thì **chưa chặn gì cả** — mọi việc chỉ có hiệu lực sau khi bạn chọn chế độ và bấm **Lưu**.
- Kèm sẵn: ô **hiện IP hiện tại của bạn**, công cụ **kiểm tra thử một IP**, và **nhật ký truy cập** để theo dõi ai bị chặn.

## Cấu hình ở đâu?

| Giao diện | Đường tới trang cấu hình |
|---|---|
| **Modern (`/v/`)** | ⚙ **Settings** → **“Chặn/Cho phép theo IP”** |
| **Classic (`/admin`)** | **Settings** → **“Chặn/Cho phép theo IP”** (đường dẫn `/admin/settings/ptdl-ip-guard`) |

Cả hai giao diện mở **cùng một trang cấu hình** và dùng chung một bộ luật.

## Dùng thế nào (từng bước)

> ✅ **Luôn làm trước tiên:** ở thẻ trên cùng, xem **“IP hiện tại của bạn”** rồi bấm
> **“Thêm IP của tôi vào danh sách an toàn”**. Đây là “lối thoát hiểm” để bạn không tự khoá chính mình.

### Tình huống A — Chỉ cho phép vài IP tin cậy vào (danh sách trắng)

1. Mở trang **“Chặn/Cho phép theo IP”**.
2. Bấm **“Thêm IP của tôi vào danh sách an toàn”** (để chắc chắn bạn vẫn vào được).
3. Ở mục **Chế độ**, chọn **“Danh sách cho phép”**.
4. Chọn **Phạm vi chặn**: **“Cả ứng dụng”** (chặn triệt để) hoặc **“Chỉ API”** (an toàn hơn — xem bảng ở dưới).
5. Điền vào ô **“Danh sách cho phép (IP được truy cập)”**, **mỗi dòng một mục** (IP đơn, dải CIDR `10.0.0.0/8`, hoặc dải `1.2.3.4-1.2.3.9`).
6. Bấm **“Lưu”**. ✅ Từ giờ chỉ các IP trong danh sách (và danh sách an toàn) mới vào được; còn lại bị chặn ngay.

### Tình huống B — Chặn vài IP quấy phá (danh sách đen)

1. Mở trang cấu hình → **Chế độ** chọn **“Danh sách chặn”**.
2. Điền các IP cần cấm vào ô **“Danh sách chặn (IP bị chặn)”**, mỗi dòng một mục.
3. Bấm **“Lưu”**. ✅ Mọi IP đều vào được, **trừ** các IP bạn vừa liệt kê.

### Tình huống C — Chạy thử trước khi siết thật (Giám sát)

1. **Chế độ** chọn **“Giám sát”**, điền luật như bình thường rồi **“Lưu”**.
2. Plugin **kiểm tra và ghi log** các trường hợp *lẽ ra bị chặn* nhưng **không chặn thật** — an toàn để xem tác động.
3. Theo dõi bảng **“Nhật ký truy cập gần đây”** (bấm **“Làm mới”**). Cột **Kết quả** hiện **“Lẽ ra chặn”** cho các IP sẽ bị cấm.
4. Yên tâm rồi thì đổi **Chế độ** sang **“Danh sách cho phép”** / **“Danh sách chặn”** và **“Lưu”** lại.

> 💡 Muốn thử nhanh một địa chỉ bất kỳ mà **chưa cần lưu**? Dùng ô **“Kiểm tra một IP với luật hiện tại (chưa lưu)”**, nhập IP rồi bấm **“Kiểm tra”**.

## Mẹo & lưu ý

- ⚠️ **Đây là chặn ở phía máy chủ (server-enforced).** Luật áp dụng **ngay khi bấm “Lưu”**, **không cần restart** — hãy chắc chắn trước khi lưu.
- ⚠️ **Đừng tự khoá mình.** Nếu cấu hình sắp chặn chính IP của bạn, trang sẽ hiện cảnh báo đỏ **“Cấu hình này sẽ chặn chính IP của bạn”**. Hãy thêm IP của bạn vào **danh sách cho phép** hoặc **danh sách an toàn** trước khi lưu.
- Chọn **Phạm vi chặn** cho đúng nhu cầu:

  | Phạm vi | Chặn cái gì | Ghi chú |
  |---|---|---|
  | **Cả ứng dụng** *(mặc định)* | **Mọi request**, kể cả trang web + tài nguyên tĩnh | Tường lửa thật: IP bị chặn không thấy gì cả. |
  | **Chỉ API** | Chỉ API (dữ liệu, đăng nhập, cài đặt) | Khung trang vẫn tải nhưng vô dụng với IP bị chặn; **không bao giờ làm chết cứng server**. |

  Cả hai phạm vi đều **miễn trừ loopback và danh sách an toàn**, nên bạn luôn có đường khôi phục.
- **Loopback luôn được cho phép** (mặc định bật): `127.0.0.1`, `::1`. Nhờ vậy nếu lỡ tự khoá, bạn vẫn vào được **từ chính máy chủ** qua `http://127.0.0.1:<cổng>` để đổi Chế độ về **“Tắt”**.
- **Đứng sau proxy?** Nếu NocoBase chạy sau Nginx / cân bằng tải / Cloudflare, để bật **“Đứng sau proxy (đọc header chuyển tiếp)”** để đọc đúng IP thật của khách. Nếu khách kết nối **thẳng** tới server thì **tắt** đi (header chuyển tiếp có thể bị giả mạo).
- **Nhật ký truy cập** tự giới hạn quanh **500 dòng** gần nhất; có thể **“Xoá nhật ký”** bất cứ lúc nào. Bật **“Ghi log các yêu cầu được cho phép”** chỉ nên dùng ngắn khi gỡ lỗi vì rất nhiều dòng.
- Chạy trên **cả hai** giao diện: classic `/admin` và modern `/v/`.

## Gỡ / tắt

- **Tạm ngừng chặn:** vào trang cấu hình, đổi **Chế độ** về **“Tắt”** → **“Lưu”**. Cấu hình (các danh sách) vẫn được giữ nguyên để bật lại sau.
- **Gỡ hẳn:** tắt plugin trong **Plugin Manager** — việc chặn dừng ngay. Cấu hình và nhật ký đã lưu vẫn còn trong cơ sở dữ liệu nếu bạn bật lại.
- 🆘 **Lỡ tự khoá và không có đường an toàn?** Mở app **từ máy chủ** qua `http://127.0.0.1:<cổng>` (loopback được miễn trừ) rồi đưa Chế độ về **“Tắt”**; hoặc sửa lại dòng cấu hình trong bảng `ptdlIpAccessConfigs` ở cơ sở dữ liệu.

---

### Cho nhà phát triển

Chặn ở tầng server: **Cả ứng dụng** dùng `app.use` (đăng ký trước CORS, phủ toàn bộ), **Chỉ API** dùng `resourcer.use`. Cấu hình lưu một dòng (`key = 'global'`) trong `ptdlIpAccessConfigs`, nhật ký ở `ptdlIpAccessLogs` (tự cắt còn ~500 dòng). Lõi so khớp IP (`ipMatch`) thuần và có unit-test (IPv4/IPv6, CIDR, dải, loopback/LAN). Chi tiết kỹ thuật: xem `README.md` (tiếng Anh).
