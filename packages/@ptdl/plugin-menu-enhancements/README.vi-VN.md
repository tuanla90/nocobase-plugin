# Menu nâng cao — Hướng dẫn sử dụng

> Nâng cấp **menu bên trái (sidebar)**: biến một mục menu thành **tiêu đề nhóm / đường kẻ ngăn**,
> và gắn **badge đếm số** sống (số dòng hoặc tổng/trung bình/lớn nhất/nhỏ nhất của một field) lên mục menu.
> Tất cả chỉnh ngay trên mục menu — **không cần code, không thêm trang**.

**Nhóm:** Menu · **Chạy trên:** /admin (classic) + /v/ (modern) · **Phiên bản:** 0.4.15

## Sau khi cài, có gì mới?

- **Không thêm menu, không thêm trang, không thêm mục Settings.** Mọi thứ nằm trong **⚙ (bánh răng) của từng mục menu** ở sidebar.
- Mỗi mục menu giờ có thêm **2 lựa chọn** khi mở ⚙:
  - **“Hiển thị dạng”** (nhóm **Giao diện**) → biến mục menu thành **tiêu đề nhóm / đường kẻ ngăn**.
  - **“Badge đếm số”** (nhóm **Badge số**) → gắn **badge số** đếm live lên mục menu.
- **Tab trang** (page tab) cũng có thêm **“Badge đếm số”** trong ⚙ của tab — cùng hộp thiết lập với badge menu.
- Không đụng cấu trúc dữ liệu: cấu hình lưu vào phần `options` của route menu nên **giữ nguyên qua reload** và khi bật/tắt lại plugin.

## Cấu hình ở đâu?

Không có trang cấu hình riêng. Chỉnh **ngay trên mục menu**:

1. Bật **UI Editor** (chế độ chỉnh giao diện).
2. **Rê chuột vào một mục menu** ở sidebar → bấm biểu tượng **⚙**.
3. Chọn **“Hiển thị dạng”** (làm tiêu đề/đường kẻ) hoặc **“Badge đếm số”** (gắn badge).

> 💡 Với **tab trang**: bật UI Editor → ⚙ trên tab → **“Badge đếm số”**.

## Dùng thế nào (từng bước)

### Tình huống A — Biến một mục menu thành tiêu đề nhóm / đường kẻ ngăn

1. ⚙ trên mục menu → **“Hiển thị dạng”**.
2. Bật công tắc **“Chuyển thành mục phân cách”**. Hộp thiết lập hiện ra kèm **Xem trước** trực tiếp ở trên cùng.
3. Chọn kiểu bạn muốn:

| Bạn muốn | Cách đặt |
|---|---|
| **Đường kẻ ngăn** trơn | Bật **“Hiện đường kẻ”**, để trống **“Nhãn (tùy chọn)”** |
| **Tiêu đề nhóm** (chữ, không đường kẻ) | Tắt **“Hiện đường kẻ”**; gõ **Nhãn** (vd `COMMUNICATION`) — để trống thì lấy luôn tên mục menu |
| **Đường kẻ + chữ** | Bật **“Hiện đường kẻ”** + gõ **Nhãn**; chọn **“Vị trí chữ”** (Phía trên / Trên đường kẻ / Phía dưới) |

4. Tinh chỉnh thêm: **Căn lề** (Trái/Giữa/Phải), **Độ dày đường kẻ (px)**, **Màu sắc** (áp cho cả kẻ lẫn chữ), **Cỡ chữ (px)**.
5. **Lưu**.
6. ✅ Mục menu giờ là một dải phân cách/tiêu đề — **không bấm được nữa** (không điều hướng), nhưng vẫn sửa lại được qua ⚙.

> ↩️ Muốn trả về mục menu thường: ⚙ → “Hiển thị dạng” → **tắt** “Chuyển thành mục phân cách” → Lưu.

### Tình huống B — Gắn badge đếm số lên mục menu (vd “12” đơn chờ xử lý)

1. ⚙ trên mục menu → **“Badge đếm số”**.
2. Bật **“Hiện badge đếm số”**.
3. Mục **Dữ liệu & phép đo**:
   - **Collection**: chọn bảng cần đếm.
   - **Phép đo**: chọn cách tính —

     | Phép đo | Kết quả |
     |---|---|
     | **Đếm dòng** | số dòng của collection *(mặc định)* |
     | **Tổng / Trung bình / Lớn nhất / Nhỏ nhất** | tổng hợp một **field số** — phải chọn thêm **“Field cần tổng hợp”** |

   - **Bộ lọc (tùy chọn)**: dựng điều kiện để chỉ đếm dòng khớp (vd `status = pending`). Có trình dựng trực quan (**Thêm điều kiện**, khớp **TẤT CẢ (AND)** / **BẤT KỲ (OR)**) hoặc **Nâng cao (JSON thô)**.
   - Bấm **“Thử đếm”** để xem ngay kết quả (`= N dòng khớp`) trước khi lưu.
4. Mục **Giao diện**:
   - **Màu sắc**: đặt **Nền** và **Viền** của badge (bỏ trống Viền = không viền).
   - **Hiển thị số**: Số đầy đủ · `99+` · `999+` · `9999+` · **Gọn (1.2K)** · **Chỉ chấm (không số)**.
   - **Hiện khi bằng 0**: mặc định badge **ẩn khi = 0**; bật nếu muốn luôn hiện.
   - **Ngưỡng cảnh báo** + **Màu cảnh báo**: khi số đếm đạt ngưỡng, badge tự đổi sang màu cảnh báo (đặt `0` để tắt).
5. Mục **Làm mới** → **Chu kỳ làm mới (giây)** (tối thiểu 10, mặc định 45).
6. **Lưu**.
7. ✅ Badge hiện ở mép phải mục menu (khi sidebar thu gọn thì hiện dạng số nhỏ ở góc icon).

## Mẹo & lưu ý

- 🔄 **Badge tự cập nhật** theo 3 cách: theo chu kỳ đã đặt, khi bạn **quay lại tab**, và **ngay khi có thêm/sửa/xóa dòng** — kể cả người khác sửa (qua WebSocket của server).
- 🧮 **Tổng/Trung bình/…** chạy qua API tổng hợp; hãy dùng **“Thử đếm”** để chắc chắn ra số trước khi lưu.
- 🎯 **Đếm dữ liệu thật**: badge chỉ đọc để đếm, **không thay đổi dữ liệu**; bộ lọc chỉ giới hạn phạm vi đếm.
- ⚠️ Mục đã chuyển thành **tiêu đề/đường kẻ** sẽ **không điều hướng nữa**; nếu lỡ, mở ⚙ tắt “Chuyển thành mục phân cách” để phục hồi.
- Một mục menu **hoặc** làm phân cách **hoặc** gắn badge — nếu đã chuyển thành tiêu đề/đường kẻ thì badge sẽ không hiển thị trên mục đó.
- Chạy trên **cả hai** giao diện: classic `/admin` và modern `/v/`. Không cần khởi động lại server (đây là tính năng phía client).

## Gỡ / tắt

- Tắt plugin trong **Plugin Manager**.
- Cấu hình **không mất**: nó nằm trong `options` của route menu. Khi tắt plugin, các mục phân cách trở lại thành **mục menu thường** (trỏ về trang gốc như cũ) và badge **biến mất**.
- **Bật lại** plugin → mọi tiêu đề/đường kẻ và badge hiện lại y như trước.

---

### Cho nhà phát triển

- Client-only, **không đổi schema**: cấu hình lưu trên `route.options` — `ptdlMenuKind` + `ptdlMenuStyle` (section) và `ptdlBadge` (badge).
- Cài đặt bằng monkeypatch trên `AdminLayoutMenuItemModel` (`render` / `toProLayoutRoute`) và `BasePageTabModel` (badge trên tab), phân giải theo tên qua `flowEngine.getModelClass(...)`; đăng ký 2 flow settings `ptdlMenuSections` + `ptdlMenuBadge`.
- Tổng hợp số dùng data-viz `<collection>:query` (measures); làm mới qua axios response-interceptor + `onLiveRefresh` (WebSocket).
- Chi tiết: xem `src/shared/menuSections.tsx` và `src/shared/menuBadge.tsx`.
