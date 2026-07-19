# Khối: HTML tùy biến — Hướng dẫn sử dụng

> Một khối lấy **dữ liệu như khối Biểu đồ (Chart)** — chọn bảng, dựng truy vấn bằng **Builder** hoặc **SQL**,
> xem trước, lọc, làm mới — rồi để **bạn tự vẽ giao diện bằng JavaScript trả về HTML**: thẻ điểm (scorecard),
> chỉ số KPI, bảng xếp hạng, thẻ card… Có sẵn **mẫu bấm-là-chạy** và **bộ hàm trợ giúp** (định dạng số, escape, icon).

**Nhóm:** Khối (Blocks) · **Chạy trên:** /admin (classic) + /v/ (modern) · **Phiên bản:** 0.12.3

## Sau khi cài, có gì mới?

- **Một loại khối mới** tên **“Custom HTML”** trong bảng chọn **Thêm khối** — nằm cùng nhóm với khối **Biểu đồ (Chart)** vì nó được dựng trên khối Chart.
- Khi thêm, khối **hỏi nguồn dữ liệu (bảng) y như thêm biểu đồ**, rồi bạn cấu hình truy vấn theo cách quen thuộc của Chart: **Builder / SQL**, **xem trước**, **lọc**, **làm mới (Run query)**.
- **Không thêm menu, không thêm trang Settings** nào. Mọi thứ chỉnh **ngay trên khối**.
- Trong ⚙ của khối có thêm mục cấu hình **“Custom HTML”**: mở ra một **cửa sổ soạn code** với **6 mẫu dựng sẵn**, **ô xem trước trực tiếp**, **bộ chọn cột**, nút **“AI viết hộ”** và **danh sách hàm trợ giúp**.
- **Tên khối dễ đọc** — trong ⚙ nay có thêm mục **“Tiêu đề block”**. Khối Biểu đồ và Custom HTML không có header, nên hộp thoại **Filter form → “Connect fields”** của NocoBase trước đây liệt kê chúng bằng ID khó hiểu như *“Custom HTML #b287”*. Giờ mỗi khối **báo cáo một tiêu đề có nghĩa**: là chuỗi bạn gõ ở **Tiêu đề block**, hoặc — nếu để trống — **tự suy ra** từ chính cấu hình khối (tiêu đề biểu đồ, hoặc measure/dimension). Nhờ vậy dialog nối trường hiện *“Doanh thu #b287”* thay vì ID. (Cũng cải thiện mọi nơi khác có hiển thị tiêu đề khối.)
- ⚠️ Khối này cần bật sẵn plugin **Data Visualization** (khối Biểu đồ). Nếu chưa bật, khối **sẽ không xuất hiện** trong bảng chọn.

## Cấu hình ở đâu?

Không có trang cấu hình riêng — bạn chỉnh **trực tiếp trên khối**, ở **hai chỗ**:

| Chỗ cấu hình | Mở ở đâu | Dùng để |
|---|---|---|
| **Truy vấn dữ liệu** | Cấu hình của chính khối (giống khối Biểu đồ) | Chọn bảng, dựng câu hỏi bằng **Builder** hoặc **SQL**, xem trước, **Run query** để lấy dữ liệu thật |
| **Custom HTML** | ⚙ (bánh răng) của khối → **“Custom HTML”** | Viết đoạn **JavaScript** `return` ra **chuỗi HTML** để vẽ giao diện |

> 💡 Cứ nghĩ đơn giản: **phần trên lấy số liệu, phần dưới quyết định hiển thị thế nào.**

## Dùng thế nào (từng bước)

### Tình huống A — Thẻ điểm KPI “Tổng doanh số” (Scorecard)

1. Vào trang cần đặt khối → bật **UI Editor** → bấm **Thêm khối** → chọn **“Custom HTML”**.
2. Chọn **bảng/nguồn dữ liệu** (ví dụ *Đơn hàng*), rồi ở phần truy vấn thêm phép tính bạn cần (ví dụ **tổng** cột `value`/`amount`). Bấm **Run query** để chạy thật.
3. Mở ⚙ của khối → **“Custom HTML”**. Cửa sổ soạn code hiện ra, mặc định đã là mẫu **Scorecard**.
4. Ở thanh **“Mẫu:”** phía trên có thể đổi nhanh sang mẫu khác. Trong code, **đổi tên cột** cho đúng dữ liệu của bạn (mặc định dùng `'value'`).
5. Nhìn ô **“Xem trước”** bên phải — nó cập nhật **ngay khi gõ**. Vừa ý thì bấm **Lưu**. ✅ Khối hiện thẻ số liệu bạn vừa dựng.

> 💡 Không nhớ tên cột thật? Bấm mẫu **Debug** (hoặc gõ `return helpers.table(data);`) để xem toàn bộ cột & dữ liệu, rồi quay lại chỉnh.

### Tình huống B — Bảng xếp hạng / danh sách top (Top list, Progress)

1. Dựng truy vấn trả về **danh sách có cột tên + cột số** (ví dụ *tên sản phẩm* + *doanh thu*), rồi **Run query**.
2. Mở **“Custom HTML”** → bấm mẫu **“Top list”** (huy chương cho top 1–2–3) hoặc **“Progress”** (thanh tiến độ theo giá trị lớn nhất).
3. Trong code đổi hai dòng đầu `const nameCol = 'name', valCol = 'value';` cho khớp cột của bạn → xem trước → **Lưu**.

### Tình huống C — Để AI viết hộ đoạn code

1. Mở **“Custom HTML”** → bấm nút **“AI viết hộ”** (góc phải thanh công cụ).
2. Gõ mô tả bằng tiếng Việt, ví dụ *“thẻ KPI tổng doanh thu + số đơn hàng”* → AI sinh JS dựa trên **đúng các cột** trong truy vấn của bạn.
3. Xem preview, chỉnh thêm nếu cần → **Lưu**.

> 💡 **Chèn tên cột nhanh:** đặt con trỏ trong ô code rồi dùng **bộ chọn cột** (ở góc phải thanh công cụ) — tên cột được chèn sẵn dạng chuỗi `'ten_cot'`.

## Mẹo & lưu ý

- **Đoạn JS nhận sẵn** 4 thứ và **phải `return` một chuỗi HTML**:

  | Biến | Là gì |
  |---|---|
  | `data` (hoặc `rows`) | Mảng các dòng kết quả truy vấn |
  | `count` | Số dòng |
  | `helpers` | Bộ hàm trợ giúp (xem bảng dưới) |

- **Bộ hàm trợ giúp `helpers`** (bấm **“Danh sách helpers”** trong cửa sổ để xem đầy đủ):

  | Hàm | Công dụng |
  |---|---|
  | `helpers.fmt(số)` | Định dạng số kiểu nghìn (vi-VN). `fmt(n, { locale, … })` |
  | `helpers.esc(chuỗi)` | **Escape** HTML — luôn dùng khi in dữ liệu người dùng để tránh vỡ giao diện |
  | `helpers.icon('shopping-cart', { size:22, color:'#2490ef' })` | Chèn **icon Lucide** bất kỳ (tên kebab-case) |
  | `helpers.sum / avg / min / max / count(data, 'cột')` | Tính tổng / trung bình / nhỏ nhất / lớn nhất / đếm |
  | `helpers.first(data, 'cột')` | Lấy giá trị một cột ở dòng đầu |
  | `helpers.keys(data)` | Mảng tên cột |
  | `helpers.groupBy(data, 'cột')` | Gom nhóm theo cột → `{ khoá: dòng[] }` |
  | `helpers.date(v, 'DD/MM/YYYY HH:mm')` | Định dạng ngày giờ (token `YYYY MM DD HH mm ss`) |
  | `helpers.timeAgo(v)` | Thời gian tương đối — *“2 giờ trước”* |
  | `helpers.table(data)` | In toàn bộ dữ liệu ra bảng (tiện để dò cột) |
  | `helpers.json(data)` | In cấu trúc thô để debug |

- **6 mẫu dựng sẵn** ở thanh **“Mẫu:”** — bấm là thay toàn bộ code: **Scorecard**, **Top list**, **Progress**, **Thẻ KPI**, **Bảng**, **Debug**.
- **Mẫu code tối giản** để bắt đầu (đổi `'value'` thành tên cột của bạn):

  ```js
  // data = mảng dòng kết quả truy vấn.
  const total = helpers.sum(data, 'value');
  return `
    <div style="padding:22px 24px;border:1px solid #eef0f2;border-radius:16px;background:#fff;max-width:340px;font-family:system-ui">
      <div style="color:#737b83;font-size:13px;font-weight:600">DOANH SỐ</div>
      <div style="font-size:36px;font-weight:800;margin-top:6px">
        ${helpers.fmt(total)} <span style="font-size:15px;color:#737b83">VND</span>
      </div>
    </div>`;
  ```

  > CSS viết **inline ngay trong HTML** (như các mẫu). Không cần ô CSS riêng.

- **Xem trước dùng dữ liệu mẫu** cho tới khi bạn **Run query**. Khi chưa có dữ liệu thật, ô preview ghi rõ *“(dữ liệu mẫu — chạy Run query để lấy dữ liệu thật)”*; có dữ liệu rồi sẽ ghi *“(N dòng thật)”*.
- **Tên cột phải khớp kết quả truy vấn** — sau khi tính tổng/nhóm, cột có thể đổi tên (alias). Dùng mẫu **Debug** / `helpers.table(data)` để lấy **đúng tên cột thật**.
- **Icon:** dùng được **mọi tên Lucide** (kebab-case, ví dụ `'shopping-cart'`, `'trending-up'`, `'calendar-days'` — tra tên tại lucide.dev) khi đã bật plugin **Thư viện icon (Lucide + thay icon hệ thống)** (`custom-icons`). Nếu chưa bật, icon rơi về **bộ dựng sẵn nhỏ**, tên lạ sẽ ra hình tròn.
- **Nút “AI viết hộ”** cần hệ thống đã **cấu hình một mô hình AI/LLM** (plugin AI của NocoBase). Chưa cấu hình thì nút báo lỗi kết nối.
- Chạy được ở **cả hai** giao diện: classic `/admin` và modern `/v/`. **Không cần restart server** — chỉ cần lưu và tải lại trang.

## Gỡ / tắt

- **Bỏ một khối cụ thể:** vào UI Editor, mở ⚙ của khối → **xoá khối**. Đoạn code được lưu trong cấu hình trang, xoá khối là mất theo.
- **Tắt hẳn plugin:** trong **Plugin Manager** tắt **“Khối: HTML tùy biến”**. Các khối Custom HTML đã đặt sẽ **không hiển thị nữa** (loại khối biến mất khỏi hệ thống); bật lại plugin thì chúng hoạt động trở lại vì code vẫn nằm trong cấu hình trang.
- ⚠️ Nếu khối bỗng **trống/không thấy trong bảng chọn**: kiểm tra plugin **Data Visualization** còn bật không — khối này dựa trên khối Biểu đồ để lấy dữ liệu.

---

### Cho nhà phát triển

Khối là **lớp con của `ChartBlockModel`** (data-visualization) nên tái dùng nguyên tầng truy vấn (Builder/SQL/filter/refresh); phần vẽ ghi đè `renderComponent()` để chạy code người dùng qua `new Function('data','rows','helpers','scope', code)` và trả HTML (bọc full-bleed để ẩn khung card). Các reducer/format/escape/`relativeTime` lấy từ `@ptdl/shared`; icon lấy từ **registry icon dùng chung** (do `custom-icons` nạp — provider/consumer, không bundle lucide). Nút “AI viết hộ” gọi action server **`customHtmlAi:generate`** → `generateCode` của `@ptdl/shared/ai-server` (client tự validate + retry cú pháp). Đăng ký chung một lần ở `src/client/registerBlock.tsx`, dùng cho cả hai lane classic (`src/client`) và modern (`src/client-v2`). Chi tiết kỹ thuật: xem mã nguồn trong package.
