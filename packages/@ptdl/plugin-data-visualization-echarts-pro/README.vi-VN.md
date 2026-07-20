# Biểu đồ ECharts Pro — Hướng dẫn sử dụng

> Thêm **một kiểu biểu đồ ECharts linh hoạt** vào khối *Data Visualization* của NocoBase:
> vẽ đường / vùng / cột / thanh / tròn / phân tán, bật–tắt đường mượt · xếp chồng · donut · chú giải · nhãn,
> tùy chỉnh phông chữ & định dạng số, biến đổi dữ liệu bằng JavaScript, và một ô **ghi đè option ECharts thô**
> để kiểm soát toàn bộ — tất cả chỉnh **ngay trên biểu đồ**, không cần code phía máy chủ.

**Nhóm:** Blocks (Khối hiển thị) · **Chạy trên:** /admin (classic) + /v/ (modern) · **Phiên bản:** 0.2.4

## Sau khi cài, có gì mới?

- Trong khối **Biểu đồ** (*Data Visualization* / *Charts*), khi chọn kiểu biểu đồ sẽ có thêm **một nhóm mới “ECharts Pro”**, bên trong là biểu đồ **“ECharts Pro”** — một kiểu biểu đồ “tất cả trong một” mà plugin thêm vào.
- **Không** thêm menu, trang Settings, nút hay field nào lên ứng dụng của bạn. Mọi thứ chỉnh **ngay trong bảng cấu hình của biểu đồ**.
- ⚠️ Cần plugin gốc **Data Visualization** (`@nocobase/plugin-data-visualization`) đang **bật** — ECharts Pro “gắn” vào khối đó. Nếu không thấy nhóm “ECharts Pro”, hãy kiểm tra plugin gốc đã bật chưa.
- Chỉ chạy ở phía giao diện (không đụng máy chủ) → **không cần restart server**.

## Cấu hình ở đâu?

Không có trang cấu hình riêng. Bạn chỉnh **trực tiếp trên biểu đồ** trong khối Data Visualization.

| Giao diện | Đường tới cấu hình |
|---|---|
| **Modern (`/v/`)** và **Classic (`/admin`)** | Trang có khối **Biểu đồ** → thêm/sửa một biểu đồ → ở ô chọn **kiểu biểu đồ**, mở nhóm **“ECharts Pro”** → chọn **“ECharts Pro”** → điền các mục bên dưới rồi **Lưu**. |

> 💡 Có **hai chỗ “chọn kiểu”** đừng nhầm: (1) ô chọn kiểu biểu đồ của NocoBase — nơi bạn chọn **“ECharts Pro”** để dùng plugin này; (2) mục **“Loại biểu đồ”** *bên trong* ECharts Pro — nơi bạn chọn Đường / Cột / Tròn…

## Dùng thế nào (từng bước)

### Chuẩn bị chung — thêm biểu đồ ECharts Pro
1. Mở trang cần đặt biểu đồ, bật **UI Editor** (chỉnh giao diện).
2. Thêm khối **Biểu đồ** (*Data Visualization* / *Charts*) — hoặc mở một biểu đồ đã có để sửa.
3. Ở ô chọn **kiểu biểu đồ**, chọn nhóm **ECharts Pro** → **ECharts Pro**.
4. Ở phần dữ liệu, chọn **bảng (Collection)**, thêm **chỉ số (Measures)** = trục giá trị và **chiều (Dimensions)** = trục danh mục / nhóm chuỗi.
   > ECharts Pro **tự đoán** vai trò X / Y / chuỗi từ dữ liệu nên thường vẽ được ngay từ bước này.
5. Xuống mục **Loại biểu đồ** và các tùy chọn của ECharts Pro (xem các tình huống bên dưới), chỉnh rồi **Lưu**.

### Tình huống A — Biểu đồ đường / cột cơ bản
1. **Loại biểu đồ**: chọn **Đường**, **Vùng**, **Cột (dọc)** hoặc **Thanh (ngang)**.
2. Bật thêm tùy nhu cầu: **Đường mượt** (chỉ có tác dụng với *Đường / Vùng*), **Xếp chồng chuỗi** (khi có nhiều chuỗi), **Hiện chú giải**, **Hiện nhãn dữ liệu**.
3. Chỉnh **Chiều cao (px)** nếu cần (mặc định 400). ✅ **Lưu**.

### Tình huống B — Biểu đồ tròn / donut
1. **Loại biểu đồ** = **Tròn**. Mỗi dòng dữ liệu là một miếng: **tên** lấy từ chiều, **giá trị** lấy từ chỉ số đầu tiên.
2. Bật **Vòng (donut)** để thành biểu đồ vòng.
3. Bật **Hiện nhãn dữ liệu** để in số lên từng miếng. ✅ **Lưu**.

### Tình huống C — Phông chữ & định dạng số
1. **Phông chữ**: gõ tên font (vd `Inter, Arial, sans-serif`) — áp cho toàn biểu đồ.
2. Bật **Định dạng số tùy chỉnh** để hiện thêm các ô:
   - **Số thập phân**, **Dấu phân cách nghìn**, **Dấu thập phân**
   - **Tiền tố** (vd `$`), **Hậu tố** (vd ` USD` hoặc ` %`)
   - **Hệ số nhân**, **Rút gọn (1.2K / 3.4M)**
3. Định dạng số này áp cho **trục giá trị**, **tooltip** và **nhãn dữ liệu**. ✅ **Lưu**.

### Tình huống D — Biến đổi dữ liệu bằng JS (nâng cao)
1. Mở ô **Biến đổi (JavaScript)**.
2. Viết thân hàm JS: nhận sẵn `data` (mảng các dòng) và `echarts`, và **phải `return` một mảng dòng** đã xử lý (lọc / gộp / sắp xếp / thêm cột tính toán…). Đoạn này chạy **trước khi vẽ**.
   - Ví dụ: `return data.filter(r => r.value > 0);`
3. ⚠️ Nếu code lỗi hoặc không trả về mảng, plugin **dùng lại dữ liệu gốc** (cảnh báo ghi ở Console trình duyệt). ✅ **Lưu**.

### Tình huống E — Ghi đè option ECharts (kiểm soát toàn bộ)
1. Mở ô **JSON style (ghi đè option ECharts)**.
2. Viết một **object JS** (được phép chứa **hàm**, vd formatter tùy chỉnh). Nội dung này được **deep-merge đè lên** option mà plugin đã dựng sẵn, bằng cơ chế merge gốc của ECharts.
   - Ví dụ: `{ tooltip: { valueFormatter: v => v + " %" } }`
3. Cần tra tên thuộc tính? Bấm liên kết **Tài liệu option ECharts** ở cuối phần cấu hình. ✅ **Lưu**.

## Mẹo & lưu ý

- Tùy chọn nào ăn với loại biểu đồ nào:

  | Loại biểu đồ | Đường mượt | Xếp chồng chuỗi | Vòng (donut) | Nhãn / Chú giải |
  |---|:---:|:---:|:---:|:---:|
  | **Đường / Vùng** | ✓ | ✓ *(nhiều chuỗi)* | — | ✓ |
  | **Cột / Thanh** | — | ✓ *(nhiều chuỗi)* | — | ✓ |
  | **Tròn** | — | — | ✓ | ✓ |
  | **Phân tán** | — | — | — | ✓ |

- **Xếp chồng chuỗi** chỉ thấy rõ khi có **nhiều chuỗi** — tức nhiều **chỉ số (Measures)** hoặc một **chiều (Dimension)** đóng vai trò chuỗi.
- **Phân tán** cần **hai trường số** (cả X và Y đều là số).
- Các ô định dạng số **chỉ hiện** khi bật **Định dạng số tùy chỉnh**.
- **JSON style** đè **sau cùng** nên có thể ghi đè bất kỳ phần nào plugin dựng — mạnh hơn JSON thuần vì cho phép hàm.
- Chỉ chạy phía giao diện: **không cần restart server**, dùng được ở cả **/admin** (classic) và **/v/** (modern).
- Đổi tùy chọn chỉ ảnh hưởng **biểu đồ hiện tại**; cấu hình được lưu ngay trong khối.

## Gỡ / tắt

- **Đổi về kiểu biểu đồ khác:** ở ô chọn kiểu biểu đồ, chọn lại một kiểu gốc của Data Visualization.
- **Gỡ hẳn:** tắt plugin trong **Plugin Manager**. Nhóm “ECharts Pro” biến mất; các biểu đồ đang dùng kiểu này sẽ **không vẽ được** cho tới khi bạn đổi sang kiểu khác hoặc bật lại plugin. Cấu hình đã lưu trong khối vẫn còn nguyên.

---

### Cho nhà phát triển

Kiểu biểu đồ **chỉ chạy phía client**, cắm vào lớp `Chart` gốc của `@nocobase/plugin-data-visualization` ở **cả hai lane** (`client` cho /admin, `client-v2` cho /v/) qua `charts.addGroup('echartsPro', …)`; server là no-op (truy vấn dữ liệu do plugin gốc lo). Vai trò X/Y/chuỗi tự suy ra từ `fieldProps` (`buildOption.ts`). **Biến đổi (JavaScript)** chạy bằng `new Function('data','echarts', …)`; **JSON style** parse qua `new Function` rồi áp bằng lần `setOption` thứ hai để ECharts tự deep-merge; bộ định dạng số dùng chung `@ptdl/shared/format`. Chi tiết kỹ thuật ở mã nguồn `src/common/*`.
