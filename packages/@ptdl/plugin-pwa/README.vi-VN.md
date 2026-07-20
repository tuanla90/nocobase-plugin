# PWA (ứng dụng cài đặt được) — Hướng dẫn sử dụng

> Biến NocoBase thành một **ứng dụng cài được** trên máy tính và điện thoại (**Add to Home Screen / Install**):
> có icon riêng trên màn hình chính, mở ra chạy toàn màn hình như một app thật. Bạn tự đặt **tên, màu và biểu tượng**
> trong một trang cấu hình — **không cần code, không cần restart server**.

**Nhóm:** Giao diện & Trải nghiệm (UI/UX) · **Chạy trên:** /admin (classic) + /v/ (modern) · **Phiên bản:** 0.4.2

## Sau khi cài, có gì mới?

- **Một trang cấu hình mới trong Settings**: **“PWA”** (biểu tượng điện thoại di động). Đây là nơi duy nhất bạn chỉnh.
- **Trình duyệt sẽ đề nghị “Cài đặt” / “Thêm vào màn hình chính”** khi mở NocoBase — vì trang giờ đã có “manifest” của một ứng dụng cài được.
- **Không thêm menu, nút hay field** nào lên các trang/khối dữ liệu của bạn.
- ✅ **Dùng được ngay sau khi bật.** Nếu bạn chưa chỉnh gì, plugin tự lấy **tên hệ thống** (System Settings), **màu xanh mặc định** và **icon là chữ cái đầu của tên**. Chỉ vào chỉnh khi muốn khác đi.

## Cấu hình ở đâu?

| Giao diện | Đường tới trang cấu hình |
|---|---|
| **Modern (`/v/`)** | ⚙ **Settings** → **“PWA”** |
| **Classic (`/admin`)** | **Settings** → **“PWA”** (đường dẫn `/admin/settings/pwa`) |

Cả hai giao diện mở **cùng một trang cấu hình** và dùng chung **một bộ cấu hình** (đổi ở đâu cũng có hiệu lực cho cả hai).

## Dùng thế nào (từng bước)

### Tình huống A — Đặt tên, màu và biểu tượng cho app

1. Mở trang **“PWA”** (xem bảng trên).
2. **“Tên ứng dụng”**: tên đầy đủ hiện lên khi cài (vd *“Công ty ABC”*). Để trống → tự lấy **tên hệ thống**.
3. **“Tên ngắn (màn hình chính)”**: tên hiển thị **dưới icon** trên màn hình chính — nên **ngắn (≤ 12 ký tự)**. Để trống → tự lấy **từ đầu tiên** của tên ứng dụng.
4. **“Màu chủ đạo”**: màu thương hiệu của app. **“Màu nền”**: màu màn hình chờ lúc app vừa mở.
5. **“Biểu tượng”**: bấm **“Chọn ảnh”** để tải logo lên (PNG/JPG). Đổi thì bấm **“Đổi ảnh”**, bỏ thì bấm **“Xoá”**.
   > 💡 Không tải ảnh cũng được: hệ thống **tự tạo icon bằng chữ cái đầu** của tên ứng dụng trên nền **Màu chủ đạo**.
6. Bấm **“Lưu”**. ✅ Màn hình báo *“Đã lưu. Tải lại trang (Ctrl+Shift+R) để cập nhật app đã cài.”*
7. **Tải lại trang bằng `Ctrl+Shift+R`** để trình duyệt nạp cấu hình mới.

### Tình huống B — Cài lên máy tính (Chrome / Edge)

1. Đảm bảo đã cấu hình và **“Lưu”** như Tình huống A.
2. Mở NocoBase bằng **Chrome** hoặc **Edge**.
3. Nhìn **cuối thanh địa chỉ**, bấm **biểu tượng cài đặt** (hình màn hình có dấu **+** / mũi tên); hoặc mở menu **⋮** → **“Cài đặt <tên app>”** (*Install*).
4. Xác nhận → app xuất hiện như một phần mềm riêng, có **icon trên Desktop / Start Menu** và mở ở **cửa sổ riêng**.

### Tình huống C — Cài lên điện thoại (Add to Home Screen)

| Thiết bị | Cách cài |
|---|---|
| **Android (Chrome)** | Menu **⋮** → **“Thêm vào màn hình chính”** / **“Cài đặt ứng dụng”** → xác nhận. |
| **iPhone / iPad (Safari)** | Nút **Chia sẻ** (hình vuông có mũi tên lên) → **“Thêm vào MH chính”** (*Add to Home Screen*) → **“Thêm”**. |

✅ Icon xuất hiện trên **màn hình chính**; chạm vào là app mở **toàn màn hình**, không còn thanh địa chỉ trình duyệt.

> ⚠️ Chữ trong menu **“Cài đặt / Thêm vào màn hình chính”** là do **trình duyệt** hiển thị (không phải plugin), nên có thể khác nhau đôi chút theo trình duyệt và phiên bản.

## Mẹo & lưu ý

- ⚠️ **Luôn “Lưu” rồi tải lại trang (`Ctrl+Shift+R`)** thì tên/màu/icon mới vào manifest. Nếu **đã cài app từ trước**, đôi khi phải **gỡ rồi cài lại** để icon/tên mới cập nhật.
- ⚠️ **Cần HTTPS.** Trình duyệt chỉ cho **“Cài đặt”** khi site chạy qua **`https://…`** (hoặc `localhost` khi thử máy). Không thấy nút cài → kiểm tra site có phải HTTPS không.
- 🖼️ **Biểu tượng đẹp nhất là ảnh vuông.** Hệ thống tự **bo góc** và tạo cỡ **192 / 512 px**. Ảnh không vuông sẽ được đặt **gọn vào giữa** trên nền **“Màu nền”**.
- ✂️ **“Tên ngắn” quá dài** sẽ bị màn hình chính cắt bớt — giữ thật ngắn gọn.
- 🔁 **Một bộ cấu hình dùng chung** cho cả classic `/admin` và modern `/v/`.
- 🖥️ Đây là tính năng **phía trình duyệt** (chèn manifest ở client): đổi cấu hình chỉ cần **tải lại trang**, **không cần restart server**.

## Gỡ / tắt

- **Gỡ app đã cài khỏi máy/điện thoại:** làm như gỡ một ứng dụng bình thường (chuột phải icon trên Desktop → *Uninstall*, hoặc nhấn giữ icon trên điện thoại → *Xoá*). Việc này **độc lập** với plugin.
- **Tắt plugin** trong **Plugin Manager** → NocoBase **ngừng chèn manifest**, trình duyệt không còn mời cài. App đã cài trước đó có thể vẫn còn icon nhưng mở ra chỉ là web bình thường — hãy gỡ nó ở hệ điều hành như trên.
- **Cấu hình đã lưu** (tên/màu/biểu tượng) **vẫn được giữ** trong cơ sở dữ liệu; bật lại plugin là có ngay.

---

### Cho nhà phát triển

Client chèn một **Web App Manifest** (blob URL) cùng các thẻ `<meta>` (`theme-color`, `apple-touch-icon`, `apple-mobile-web-app-*`) vào `<head>`, và chạy trên **cả hai lane** (`client` cho `/admin`, `client-v2` cho `/v/`). Icon **192 / 512 px** (kèm bản `maskable`) được vẽ bằng **canvas**: ảnh tải lên đặt trong nền, hoặc chữ cái đầu của tên trên **Màu chủ đạo**. Cấu hình lưu **một dòng** trong collection `pwaSettings`; quyền **đọc công khai (`public`)** để manifest tải được cho mọi khách, **ghi** qua snippet `pm.pwa.configuration`. Không đụng tầng nào cần restart. Mã nguồn: `src/shared/pwa.tsx` (chèn manifest + trang cấu hình), `src/server/plugin.ts` (collection + ACL).
