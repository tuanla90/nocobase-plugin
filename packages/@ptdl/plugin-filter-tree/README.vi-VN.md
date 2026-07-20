# Cây lọc / Thanh lọc — Hướng dẫn sử dụng

> Thêm một **khối lọc kiểu AppSheet**: gom một bảng theo một cột thành danh sách **có đếm số** (“Tất cả” + từng
> giá trị kèm badge), bấm vào một giá trị là **lọc ngay** các khối Bảng/List liên kết trên cùng trang.
> Hai kiểu trên cùng một bộ máy: **Cây lọc** (dọc, lồng nhau) và **Thanh lọc** (ngang: pill / segmented / tab),
> kèm **ô tìm kiếm** chữ tự do tuỳ chọn — **không cần code**.

**Nhóm:** Blocks · **Chạy trên:** /admin (classic) + /v/ (modern) · **Phiên bản:** 0.3.6

## Sau khi cài, có gì mới?

- **Không thêm menu, không thêm trang, không đụng dữ liệu.** Chỉ có **2 khối mới** trong trình thêm khối **＋**.
- Trong menu **＋ (Thêm khối)**, ở nhóm **Filter blocks**, xuất hiện thêm:
  - **Cây lọc** — danh sách **dọc**, lồng tối đa **3 cấp**, gập/mở, **chọn nhiều** (Ctrl/⌘ hoặc Shift-click).
  - **Thanh lọc** — danh sách **ngang** một cấp, 3 kiểu **pill / segmented / tab**.
- Mỗi giá trị hiện kèm **badge chỉ số**: đếm số dòng (mặc định) hoặc Tổng / Trung bình / Nhỏ nhất / Lớn nhất.
- Cấu hình nằm **ngay trong ⚙ của khối** (không có trang Settings riêng).

## Cấu hình ở đâu?

Tất cả nằm trong **⚙ của chính khối** (bật UI Editor → rê vào khối → biểu tượng bánh răng). Có **2 mục**:

| Mục trong ⚙ | Làm gì |
|---|---|
| **Cây lọc** / **Thanh lọc** | Mở hộp cấu hình (có **Xem trước** trực tiếp) — chọn Bảng, cột nhóm, chỉ số, kiểu hiển thị, phạm vi, ô tìm kiếm. |
| **Kết nối tới khối dữ liệu** | Chọn **khối Bảng/List nào trên trang** sẽ bị khối lọc này điều khiển. **Bắt buộc** nếu muốn lọc. |

Hộp cấu hình chia thành các tab:

| Tab | Có gì |
|---|---|
| **Nhóm** | **Bảng dữ liệu** + **Nhóm theo** (Cây lọc có thêm cấp 2 / cấp 3 tùy chọn). |
| **Chỉ số & định dạng** | **Chỉ số (giá trị badge)**: Đếm số dòng / Tổng / Trung bình / Nhỏ nhất / Lớn nhất · **Cột tổng hợp** · **Gom theo ngày** (Theo ngày/tháng/năm) · **Định dạng số** (Thường / Dấu phân cách nghìn / Rút gọn) · Tiền tố / Hậu tố / Số thập phân. |
| **Kiểu hiển thị** | **Màu badge đếm** (Nhiều màu theo giá trị / Một màu) · **Icon & màu theo giá trị**. *Thanh lọc thêm:* **Kiểu thanh** (Pill/Segmented/Tab), **Cỡ**, **Căn lề**, **Cho chọn nhiều (chỉ pill)**, **Hiện mục “Tất cả”**, **Hiện số đếm**. |
| **Phạm vi dữ liệu** | **Chỉ đếm dòng thỏa…** — bộ dựng điều kiện (chỉ đếm/lọc trên tập con dữ liệu). |
| **Tìm kiếm** | **Hiện ô tìm kiếm** · **Tìm trong cột** · **Chữ gợi ý** · **Hiện nút đặt lại** · **Ẩn nhóm rỗng**. *Thanh lọc thêm:* **Vị trí ô tìm kiếm**, **Chiều rộng ô tìm (px)**. |

## Dùng thế nào (từng bước)

### Tình huống A — Cây lọc dọc lọc một bảng (ví dụ: lọc Đơn hàng theo Trạng thái)

1. Mở trang đã có **khối Bảng** (vd bảng `Đơn hàng`).
2. Bật **UI Editor** → bấm **＋ (Thêm khối)** → nhóm **Filter blocks** → chọn **Cây lọc**.
3. Khối hiện lời nhắc *“Cấu hình cây lọc…”*. Mở **⚙ → Cây lọc**:
   - Tab **Nhóm**: chọn **Bảng dữ liệu** = `Đơn hàng`, **Nhóm theo (cấp 1)** = cột `Trạng thái`.
   - (Tuỳ chọn) đặt thêm **cấp 2 / cấp 3** để lồng cây; vào **Chỉ số & định dạng**, **Kiểu hiển thị**… nếu cần.
   - Xem **Xem trước** ở đầu hộp → **Lưu**.
4. Mở **⚙ → Kết nối tới khối dữ liệu** → chọn **khối Bảng `Đơn hàng`** làm đích.
5. ✅ Giờ danh sách hiện **Tất cả + từng trạng thái kèm số đếm**. Bấm một trạng thái → bảng lọc ngay; bấm **Tất cả** → bỏ lọc.
   > 💡 Giữ **Ctrl/⌘** hoặc **Shift-click** để chọn nhiều giá trị cùng lúc.

### Tình huống B — Thanh lọc ngang kiểu pill/tab

1. **＋ (Thêm khối)** → **Filter blocks** → **Thanh lọc**.
2. **⚙ → Thanh lọc** → tab **Nhóm**: chọn **Bảng dữ liệu** + **Nhóm theo** (một cấp).
3. Tab **Kiểu hiển thị**: chọn **Kiểu thanh** (Pill / Segmented / Tab), **Cỡ**, **Căn lề**; bật **Cho chọn nhiều (chỉ pill)** nếu muốn chọn nhiều.
4. **⚙ → Kết nối tới khối dữ liệu** → chọn Bảng/List cần lọc → **Lưu**.
5. ✅ Thanh pill/tab ngang hiện trên bảng; bấm để lọc.

### Thêm ô tìm kiếm chữ tự do (áp dụng cho cả hai kiểu)

1. Trong hộp cấu hình → tab **Tìm kiếm** → bật **Hiện ô tìm kiếm**.
2. Chọn **Tìm trong cột** (một hoặc nhiều cột sẽ đối chiếu kiểu *chứa*, ghép OR), đặt **Chữ gợi ý**.
3. (Thanh lọc) chọn **Vị trí ô tìm kiếm** (Dưới / Trên / Trái / Phải thanh).
4. ✅ Gõ chữ → sau ~0,3s tự lọc bảng liên kết; ô tìm **ghép AND** với lựa chọn nhóm đang chọn.

## Mẹo & lưu ý

- ⚠️ **Phải “Kết nối tới khối dữ liệu”** thì bấm lọc mới có tác dụng — chỉ chọn Bảng + cột nhóm là mới thấy số đếm.
- Cột nhóm được: **trạng thái / lựa chọn / số / ngày / boolean**. **Không nhóm** theo cột quan hệ trực tiếp, JSON — nhưng có thể **rẽ qua 1 quan hệ 1–1** tới cột con (vd `khách → giới tính`). Nếu trống sẽ báo *“Không có nhóm…”*.
- 🔢 Badge đếm lấy từ **một truy vấn GROUP BY** trên chính bảng đích — **không sửa dữ liệu**, chỉ đếm.
- 🔄 **Tự cập nhật số** khi dữ liệu bảng đổi (thêm/sửa/xoá — kể cả do người khác hoặc quy trình máy chủ) và khi quay lại tab.
- Lựa chọn đang bấm là **tạm thời**: **F5 / tải lại trang** sẽ về **Tất cả** (không “kẹt” bộ lọc).
- **Trung bình** không cộng gộp được nên badge tổng “Tất cả” để trống khi Chỉ số là Trung bình.
- Chạy trên **cả hai** giao diện: classic `/admin` và modern `/v/`. **Không cần khởi động lại máy chủ** (chỉ ở client).

## Gỡ / tắt

- Tắt plugin trong **Plugin Manager**. Hai khối **Cây lọc / Thanh lọc** biến mất khỏi menu ＋; khối đã đặt trên trang sẽ **ngưng hoạt động** cho tới khi bật lại.
- Cấu hình khối đã lưu **vẫn nằm trong schema của trang** → bật lại plugin là khối chạy lại như cũ. Dữ liệu bảng **không hề bị đụng tới**.

---

### Cho nhà phát triển

Hai model `FilterTreeBlockModel` + `FilterBarBlockModel` kế thừa `FilterBlockModel` (tự vào nhóm “Filter blocks”),
đăng ký qua `flowEngine.registerModels` trong `src/shared/filterTree.tsx` (dùng chung cho cả hai lane client). Đếm =
`<collection>:query` GROUP BY (measure + dimension); lọc = core `connectFields` + `resource.addFilterGroup` (nhóm
`ptdl-tree:*` và `ptdl-search:*`). Máy chủ **no-op** (không thêm collection/schema). Nhãn UI song ngữ ở
`src/locale/vi-VN.json`.
