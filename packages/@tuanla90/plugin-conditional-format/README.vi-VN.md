# Định dạng có điều kiện — Hướng dẫn sử dụng

> Tô màu chữ, màu nền, in đậm/nghiêng, viền, icon hoặc vẽ **heatmap / thanh dữ liệu** cho các ô trong
> **khối Bảng (Table)** theo giá trị từng dòng — cấu hình ngay trên bảng, **không cần code, không đổi dữ liệu**.

**Nhóm:** Khối (Blocks) · **Chạy trên:** /v/ (modern) — trên khối **Bảng (Table)** · **Phiên bản:** 0.2.15

## Sau khi cài, có gì mới?

- **Một mục mới trong menu cài đặt ⚙ của mỗi khối Bảng**: **“Định dạng có điều kiện”**. Đây là nơi duy nhất bạn chỉnh — không có trang Settings riêng.
- **Không thêm menu, trang hay field** nào khác. Chỉ các **khối Bảng** mới có thêm mục cấu hình này.
- Mỗi bảng có **bộ quy tắc riêng**; định dạng chỉ là **hiển thị**, hoàn toàn **không thay đổi dữ liệu** của bạn.
- ⚠️ **Chưa tô gì cho tới khi bạn thêm quy tắc.** Cài xong bảng vẫn như cũ — mọi thứ chỉ có hiệu lực sau khi bạn tạo quy tắc và **Lưu** khối.

## Cấu hình ở đâu?

Không có trang cấu hình tập trung. Bạn chỉnh **ngay trên từng khối Bảng**:

| Giao diện | Cách vào |
|---|---|
| **Modern (`/v/`)** | Bật **UI Editor** → mở menu **⚙ (cài đặt)** của khối Bảng → **“Định dạng có điều kiện”**. Một hộp thoại lớn mở ra để thêm/sửa quy tắc. |
| **Classic (`/admin`)** | ⚠️ **Không áp dụng.** Bảng cổ điển không có mô hình khối tương thích nên plugin **không tô gì** ở đây. |

## Dùng thế nào (từng bước)

> Mở đầu chung: vào trang có **khối Bảng**, bật **UI Editor**, mở **⚙** của khối → **“Định dạng có điều kiện”**.
> Trong hộp thoại, bấm **“Thêm quy tắc”**. Mỗi quy tắc chọn 1 trong 3 kiểu: **Điều kiện · Thang màu · Thanh dữ liệu**.

### Tình huống A — Tô chữ / nền / icon theo điều kiện (kiểu **Điều kiện**)

Ví dụ: đơn **“Quá hạn”** thì bôi đỏ + đậm cột **Tên khách**; kèm icon cảnh báo.

1. **Thêm quy tắc** → ở đầu thẻ, chọn kiểu **“Điều kiện”**.
2. Chọn **Khớp**: **“Tất cả”** (mọi điều kiện đều đúng) hay **“Bất kỳ”** (chỉ cần một điều kiện đúng).
3. Ở mục **Điều kiện**, bấm **“Chọn field…”** để chọn field cần kiểm tra (có thể chọn field **xuyên quan hệ**, ví dụ `Khách hàng → Nhóm`), chọn phép so sánh và nhập giá trị. Cần nhiều điều kiện thì bấm **“Thêm điều kiện”**.
4. Ở **Áp dụng cho**, chọn **(các) cột** sẽ được tô. 💡 Cột được tô **không nhất thiết** là cột trong điều kiện — bạn có thể xét *Trạng thái* nhưng lại tô cột *Tên*.
5. Ở **Định dạng**, bật các hiệu ứng mong muốn (xem bảng dưới) và xem ô **“Xem trước” / “Mẫu”**.
6. **Lưu** hộp thoại → **Lưu** khối. ✅ Các dòng thoả điều kiện sẽ được tô ngay.

| Tuỳ chọn (trong **Định dạng**) | Làm gì |
|---|---|
| **Chữ** | Đổi màu chữ |
| **Nền** | Đổi màu nền ô |
| **B** / **I** | In **đậm** / in *nghiêng* |
| **Viền ô** | Kẻ viền quanh ô |
| **Viền chữ** | Thêm viền (quầng) quanh chữ cho dễ đọc trên nền màu; bật xong chọn thêm **Màu viền** |
| **Biểu tượng** | Chèn một icon trước nội dung ô (bấm **“Chọn”** để chọn icon) |

### Tình huống B — Heatmap 2/3 màu cho một cột số (kiểu **Thang màu**)

Ví dụ: cột **Doanh thu** — số nhỏ nền nhạt, số lớn nền đậm.

1. **Thêm quy tắc** → chọn kiểu **“Thang màu”**.
2. Ở **Cột số**, bấm **“Chọn cột số”** để chọn cột muốn tô. Thang màu **tự scale theo min–max của cột**.
3. Đặt màu hai đầu: **Thấp** và **Cao**. Muốn 3 màu (thêm điểm giữa) thì bật **“3 màu”** rồi đặt **Giữa**. Dải màu preview hiện ngay bên cạnh.
4. (Tuỳ chọn) Ở dòng **Chữ**, chỉnh **Màu** chữ, bật **Viền chữ** + **Màu viền** nếu chữ khó đọc trên nền màu.
5. **Lưu** → **Lưu** khối. ✅ Cả cột được tô thành một dải nhiệt theo giá trị.

### Tình huống C — Thanh dữ liệu ngay trong ô (kiểu **Thanh dữ liệu**)

Ví dụ: cột **Số lượng** hiện thêm một thanh ngang dài–ngắn theo giá trị.

1. **Thêm quy tắc** → chọn kiểu **“Thanh dữ liệu”**.
2. Chọn **Cột số** như trên (thanh cũng **tự scale theo min–max của cột**).
3. Chọn **Màu thanh**; ô preview hiển thị một thanh mẫu.
4. (Tuỳ chọn) chỉnh **Chữ** / **Viền chữ** / **Màu viền** cho dễ đọc.
5. **Lưu** → **Lưu** khối. ✅ Mỗi ô có một thanh nền dài theo giá trị của nó.

> 💡 Một bảng có thể có **nhiều quy tắc** cùng lúc (mỗi cột một kiểu, hoặc nhiều điều kiện chồng nhau). Bấm **“Thêm quy tắc”** bao nhiêu tuỳ ý; bấm **“Xoá”** trên thẻ để bỏ một quy tắc.

## Mẹo & lưu ý

- 🎨 **Đây là định dạng hiển thị thuần túy (phía trình duyệt).** Nó **không sửa dữ liệu**, không cần **restart server**, và có hiệu lực **ngay khi Lưu** khối.
- ⚠️ **Quy tắc kiểu “Điều kiện” phải có ít nhất một điều kiện** — nếu để trống, quy tắc **không tô gì** (chủ ý, để tránh lỡ tô cả bảng).
- 🧭 **Điều kiện xét theo từng dòng** và có thể tham chiếu **bất kỳ field nào, kể cả xuyên quan hệ**. Cột *được tô* (**Áp dụng cho**) có thể khác cột *dùng để xét điều kiện*.
- 🔢 **Thang màu / Thanh dữ liệu chỉ dùng cho cột số** và scale theo **min–max của các dòng đang hiển thị**. Vì vậy **phân trang / lọc** sẽ làm thang màu đổi theo tập dòng hiện có trên trang.
- 🧩 **Icon chỉ có ở kiểu “Điều kiện”** (Thang màu / Thanh dữ liệu không chèn icon).
- 🔁 **Khi nhiều quy tắc cùng khớp một ô:** phần màu/kiểu chữ — quy tắc **sau đè** quy tắc trước; icon — lấy quy tắc **có icon khớp cuối cùng**.
- 🖥️ **Chỉ chạy trên giao diện `/v/` (modern).** Trên `/admin` cổ điển plugin không tô gì.
- 🛟 An toàn: nếu có lỗi khi tô, bảng **tự rơi về cách hiển thị gốc** (không làm trắng trang).

## Gỡ / tắt

- **Bỏ một quy tắc:** mở lại **“Định dạng có điều kiện”**, bấm **“Xoá”** trên thẻ quy tắc (hoặc xoá hết) → **Lưu** khối.
- **Tắt cho toàn hệ thống:** tắt plugin trong **Plugin Manager**. Việc tô **dừng ngay**. Các quy tắc đã lưu vẫn nằm trong cấu hình khối/trang một cách vô hại — **bật lại** plugin là chúng hiển thị trở lại.
- Vì cấu hình gắn với **từng khối**, gỡ plugin **không đụng** dữ liệu bảng của bạn.

---

### Cho nhà phát triển

Thuần client, chỉ lane `/v/`: patch `TableBlockModel.getColumns()` → bọc `onCell` (style ô: màu/nền/đậm/nghiêng/viền) và bọc `render` (chèn icon trước nội dung), **crash-safe** (mọi lỗi rơi về hành vi gốc). Quy tắc lưu trong prop khối `ptdlCondRules` qua `setProps` (MobX reactive → bảng tự re-render, không lưu vào dữ liệu). Bộ điều kiện dùng lại condition-kit của `@tuanla90/shared` (`evalConditionOp`, field picker xuyên quan hệ); nội suy màu heatmap + min/max tính trên các dòng đang tải. Lane classic là no-op (không có `TableBlockModel`); server để trống. Chi tiết: `src/shared/tableRulesModel.tsx`.
