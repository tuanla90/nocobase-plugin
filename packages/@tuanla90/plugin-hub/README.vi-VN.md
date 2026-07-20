# Trung tâm Plugin (Plugin Hub) — Hướng dẫn sử dụng

> Cài **một plugin duy nhất**, rồi từ đó **cài và cập nhật mọi plugin @tuanla90 khác** — không cần upload
> file `.tgz` qua trình duyệt, không cần vào server. Trỏ tới một **manifest URL**, bấm một nút là xong.

**Nhóm:** Giao diện (UI) · **Chạy trên:** /admin (classic) + /v/ (modern) · **Phiên bản:** 0.1.0

## Vì sao cần?

Cài plugin trên NocoBase thường phải **upload file `.tgz`** qua trình duyệt — nhiều thiết bị/mạng công ty
**chặn** kiểu upload này. Plugin Hub đi đường khác: **server tự tải** plugin từ một URL, nên rào cản upload
trình duyệt không còn ý nghĩa. Và thay vì dán URL cho từng plugin (30+ lần), bạn cài Hub **một lần** rồi nó
lo hết phần còn lại — kể cả **cập nhật** về sau.

## Sau khi cài, có gì mới?

- **Một trang mới trong Settings**: **“Trung tâm Plugin”**. Đây là nơi duy nhất bạn thao tác.
- **Không thêm menu/nút/field** nào lên trang dữ liệu của bạn.
- **Kiểm tra cập nhật hàng tuần** — chỉ **báo** “có N bản mới”, **không tự động cài** (an toàn: không tự
  đưa code mới vào khi bạn chưa xem).

## Cấu hình ở đâu?

| Giao diện | Đường tới trang |
|---|---|
| **Modern (`/v/`)** | ⚙ **Settings** → **“Trung tâm Plugin”** |
| **Classic (`/admin`)** | **Settings** → **“Trung tâm Plugin”** (`/admin/settings/ptdl-plugin-hub`) |

## Dùng thế nào?

1. **Nguồn** — ô **Manifest URL** (mặc định = `latest/index.json` của repo @tuanla90 công khai). Manifest là một
   file JSON liệt kê `{ packageName, version, url }` cho từng plugin.
2. Bấm **Kiểm tra ngay** → bảng hiện **mọi plugin** kèm *bản đang cài · bản mới nhất · trạng thái*:
   - **Chưa cài** → nút **Cài** (`pm add`), rồi **Bật** (`pm enable`).
   - **Đã cài (chưa bật)** → nút **Bật**.
   - **Có bản mới** → nút **Cập nhật** (`pm update`).
   - **Mới nhất** → ✓.
3. **Cập nhật tất cả** — cập nhật tuần tự mọi plugin đang có bản mới, kèm thanh tiến trình.

> Mỗi lần Cài/Bật/Cập nhật, NocoBase **tải lại app** một chút (vào maintenance) — Hub **tự chờ app sống lại**
> rồi làm mới danh sách. Bình thường; với “Cập nhật tất cả” nhiều plugin sẽ hơi lâu.

## Lưu ý

- **Chỉ role `root`** mới cài/cập nhật được (thao tác động tới code).
- **Railway / Docker**: plugin cài lúc chạy nằm ở `storage/plugins` → cần **mount volume vào
  `/app/nocobase/storage`**, nếu không plugin **mất khi redeploy**.
- **Con gà–quả trứng**: Hub cũng là một plugin, nên **lần đầu** phải cài Hub bằng URL (Plugin manager → Add →
  URL → dán link `plugin-hub-*.tgz`). Từ đó Hub lo mọi thứ.
