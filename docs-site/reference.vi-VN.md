# Hàm & Helper dùng chung (@tuanla90) — Tham khảo

> Trang **tham khảo** liệt kê đầy đủ các hàm/helper **dùng chung** của bộ plugin @tuanla90, chia 3 họ: **Công thức Excel-like** (dùng ở plugin *Formula* + *Spreadsheet View*), **Handlebars helper** (dùng ở plugin *Print Template*) và **helper khối HTML** (dùng ở plugin *Block: Custom HTML*). Danh sách sinh trực tiếp từ code — không có hàm nào nằm ngoài mã nguồn.

## 1. 🧮 Công thức Excel-like (Formula DSL) · dùng ở: Formula, Spreadsheet View

Engine bọc **`@formulajs/formulajs`** (~400 hàm Excel) nên đa số hàm Excel đều chạy; bảng dưới là danh sách **được hỗ trợ / khuyến nghị chính thức** (AI viết công thức chỉ dùng trong danh sách này, không bịa hàm). Công thức **không phân biệt hoa/thường** (`SUM` = `sum`), và có thể **xuất HTML** qua nhóm hàm hiển thị ở dưới.

### Cú pháp

- Dòng hiện tại: `data.<field>`. Quan hệ to-one: `data.<relation>.<field>`. Quan hệ to-many tự gộp: `SUM(data.<relation>.<field>)`.
- Bảng tra cứu / config (collection **rời**, không phải quan hệ): gõ **thẳng** tên collection, **không** có `data.` → `<tenBang>.<cot>` (là **mảng** cột đó của **mọi** dòng bảng).
- Nối chuỗi dùng `&` (vd `data.a & " " & data.b`). So sánh: `==` (hoặc `===`), `!=` hoặc `<>`, `> < >= <=`. VÀ = `&&` (hoặc `AND(...)`). **Không** dùng `=` đơn (là gán) hay `&` đơn cho VÀ.
- **Chỉ** dùng hàm có trong danh sách bên dưới. Không bịa hàm (không có `XLOOKUP`, không có mảng-động Excel kiểu `FILTER(arr, boolArr)`).
- Quan hệ lồng 2+ tầng **không** nạp được (`data.a.b.c` hay `bang.quan_he.cot` ra rỗng) → so theo **khoá id**: `bang.rel_id == data.x_id`.
- Cột đích có thể là số / text / date / boolean — trả **đúng kiểu** (so sánh → boolean, ghép chuỗi / `IF` → text, `EDATE` / `TODAY` → date).

### Hàm theo nhóm

| Nhóm | Hàm |
|---|---|
| Số | `SUM` · `AVERAGE` · `MIN` · `MAX` · `COUNT` · `ROUND` · `ROUNDUP` · `ABS` · `MOD` · `CEILING` · `FLOOR` |
| Lọc/gộp có điều kiện (≈ SELECT/FILTER AppSheet) | `SUMIF` · `SUMIFS` · `COUNTIF` · `COUNTIFS` · `AVERAGEIF` · `AVERAGEIFS` — vd `SUMIFS(data.items.line_amount, data.items.status, "active")` |
| FILTER / SELECT — lọc **danh sách** theo điều kiện (bọc SUM/COUNT/INDEX…) | `FILTER` · `SELECT` — vd `SUM(FILTER(data.items.amt, data.items.status == "active" && data.items.amt > 40))`, `INDEX(SELECT(bang.ten, bang.a == data.x && bang.b == data.y), 1)`. Dùng `==`, `&&` cho VÀ, và `> < >= <= <>` |
| Bảng tra cứu 2 khoá (gõ thẳng tên bảng, không có `data.`) | `SUMIFS(bang_hs.he_so, bang_hs.tc_a, data.a, bang_hs.tc_b, data.b)` — `bang_hs` = tên collection config |
| Lookup khác | `INDEX` · `MATCH` · `CHOOSE` · `SWITCH` · `VLOOKUP` (VLOOKUP cần mảng 2D trong 1 field JSON, không dùng cho bảng collection) |
| Logic | `IF` · `IFS` · `AND` · `OR` · `NOT` · `IFERROR` · `ISBLANK` · `ISNUMBER` |
| Text | `CONCATENATE` · `LEFT` · `RIGHT` · `MID` · `UPPER` · `LOWER` · `TRIM` · `LEN` · `TEXT` |
| Ngày | `TODAY` · `NOW` · `YEAR` · `MONTH` · `DAY` · `DATEDIF` · `EDATE` · `DAYS` |

### Hàm hiển thị HTML

Các hàm formulajs không có, thêm riêng để công thức **xuất HTML** vào ô hiển thị:

| Hàm | Ý nghĩa |
|---|---|
| `B(x)` | In đậm → `<b>x</b>` |
| `I(x)` | In nghiêng → `<i>x</i>` |
| `U(x)` | Gạch chân → `<u>x</u>` |
| `BR()` | Xuống dòng → `<br/>` |
| `COLOR(x, màu)` | Đổi màu chữ (vd `COLOR(data.status, "red")`) |
| `BG(x, màu)` | Tô nền + bo góc cho chữ (dạng "pill") |
| `TAG(text, màu?)` | Thẻ nhãn bo tròn (viền + nền nhạt). `màu` nhận tên antd (`red` `volcano` `orange` `gold` `yellow` `lime` `green` `cyan` `blue` `geekblue` `purple` `magenta` `gray` `default`) hoặc mã màu; mặc định `default` |
| `DOT(màu?, size?)` | Chấm tròn trạng thái; mặc định màu `#16a34a`, size `8`px |
| `LINK(href, text?)` | Liên kết mở tab mới; bỏ `text` thì hiện `href` |
| `IMG(src, size?)` | Ảnh vuông bo góc; mặc định `20`px |
| `ESCAPE(x)` | Escape HTML (an toàn hoá chuỗi) |

### Ví dụ (ý muốn → công thức)

| Ý muốn | Công thức |
|---|---|
| Cùng dòng | `data.subtotal - data.discount` |
| Nhân đơn giá (kéo quan hệ) | `data.quantity * data.product.unit_price` |
| Gộp quan hệ (roll-up) | `SUM(data.items.line_amount)` |
| Gộp **có điều kiện** (≈ SELECT AppSheet) | `SUMIFS(data.items.line_amount, data.items.status, "active")` |
| Bảng tra cứu 2 khoá (≈ VLOOKUP nhiều ĐK) | `data.metric * SUMIFS(bang_hs.he_so, bang_hs.a, data.parent.region, bang_hs.b, data.grade)` |
| Số thứ tự trong nhóm (OR-123.1, .2…) | `data.order.code & "." & (COUNTIFS(order_item.order_id, data.order_id, order_item.id, "<" & data.id) + 1)` |
| Lọc danh sách có điều kiện (FILTER) | `SUM(FILTER(data.items.line_amount, data.items.status == "active" && data.items.line_amount > 0))` |
| Tra bảng 2 khoá ra **chữ** (SELECT + INDEX) | `INDEX(SELECT(bang_hs.ten, bang_hs.a == data.parent.region && bang_hs.b == data.grade), 1)` |
| Nhãn điều kiện | `IF(data.total>1000000, "VIP", "Thường")` |
| Đếm dòng con theo ĐK (COUNT + FILTER) | `COUNT(FILTER(data.items.id, data.items.status == "pending"))` |
| Trung bình / lớn nhất dòng con | `AVERAGE(data.items.line_amount)` |
| Tỉ lệ % hoàn thành | `data.done_qty / data.total_qty * 100` |
| Cờ vượt hạn mức (boolean) | `data.total > data.credit_limit` |
| Ghép chuỗi (họ tên → text) | `data.first_name & " " & data.last_name` |
| Phân loại nhiều bậc (IFS) | `IFS(data.total >= 1000000, "VIP", data.total >= 500000, "Bạc", TRUE, "Thường")` |
| Ngày đến hạn +1 tháng (date) | `EDATE(data.order_date, 1)` |
| Số ngày giữa 2 mốc | `DAYS(data.end_date, data.start_date)` |
| Tra đơn giá theo **khoá quan hệ** (so id — thay cho nested) | `INDEX(SELECT(bang_gia.don_gia, bang_gia.product_id == data.product_id), 1)` |

## 2. 🖨 Handlebars helper · dùng ở: Print Template

Cú pháp Handlebars gốc (`{{field}}` `#each` `#if`…) cộng bộ helper riêng bên dưới. Ví dụ **copy dán được** ngay vào mẫu in.

| Helper | Mô tả | Ví dụ |
|---|---|---|
| `{{field}}` | Giá trị 1 trường; quan hệ dùng dấu chấm | `{{client.name}}` |
| `{{#each}}` | Lặp danh sách dòng con (appends) | `<table>{{#each items}}<tr><td>{{this.product.name}}</td><td>{{this.qty}}</td></tr>{{/each}}</table>` |
| `{{#if}}` / `{{#unless}}` | Điều kiện (kết hợp `eq`/`gt`/`and`…) | `{{#if (eq status "paid")}}ĐÃ THANH TOÁN{{else}}CHƯA THU{{/if}}` |
| `@index` | Số thứ tự trong `#each` (bắt đầu từ 0) | `{{#each items}}<tr><td>{{add @index 1}}</td></tr>{{/each}}` |
| `formatNumber` | Định dạng số / tiền tệ / %. `format="#,##0₫"` (₫ $ € £), có `%`, kèm `locale` | `{{formatNumber total format="#,##0₫"}}` |
| `add` `subtract` `multiply` `divide` `mod` | Toán tử 2 ngôi | `{{multiply qty price}}` |
| `docso` / `docsoHoa` | Đọc số thành chữ tiếng Việt (`docsoHoa` = viết hoa chữ đầu) | `Bằng chữ: {{docsoHoa total}} đồng` |
| `qr` | Sinh mã QR (SVG). `size`=px, `level`=L/M/Q/H | `{{qr code size=110}}` |
| Ngắt trang | Ép sang trang mới ở vị trí này khi in | `<div style="break-before:page"></div>` |
| Khối chung (partial) | Nhúng template "khối chung" theo slug (tạo ở tab Chung) | `{{> header_chung}}` |
| `formatDate` | Định dạng ngày. Token: `DD MM YYYY HH mm ss DDDD MMMM A`… | `{{formatDate createdAt "DD/MM/YYYY HH:mm"}}` |
| `now` | Thời điểm in | `In lúc {{now "HH:mm DD/MM/YYYY"}}` |
| `eq` `ne` `gt` `lt` `gte` `lte` | So sánh — dùng trong `#if` | `{{#if (gte total 1000000)}}<b>Khách VIP</b>{{/if}}` |
| `and` / `or` | Logic nhiều điều kiện | `{{#if (and paid (gt total 0))}}✔{{/if}}` |
| `uppercase` `lowercase` `capitalize` `proper` | Đổi hoa–thường | `{{uppercase client.name}}` |
| `concat` | Nối chuỗi | `{{concat code " - " client.name}}` |
| `regexReplace` | Thay theo regex (cờ `g`) | `{{regexReplace phone "^84" "0"}}` |
| `regexExtract` | Trích theo regex (chỉ số group) | `{{regexExtract email "^[^@]+"}}` |
| `sql` (giá trị đơn) | Query trả 1 dòng 1 cột → ra thẳng giá trị. `FROM ?` = mảng truyền vào | `{{formatNumber (sql "SELECT SUM(total_cost) FROM ?" items) format="#,##0₫"}}` |
| `#sql` (lặp dòng) | Query trả nhiều dòng → lặp như `#each` (có `@index`/`@first`/`@last`). Aggregate + `GROUP BY` | `{{#sql "SELECT document_name, SUM(quantity) AS qty, SUM(total_cost) AS total FROM ? GROUP BY document_name" items}}<tr><td>{{add @index 1}}</td><td>{{document_name}}</td><td>{{qty}}</td><td>{{formatNumber total format="#,##0₫"}}</td></tr>{{/sql}}` |
| `#sql` (lọc + sắp xếp) | `WHERE` / `ORDER BY` / `LIMIT` như SQL thường | `{{#sql "SELECT * FROM ? WHERE fee_type = 'Solicitor Fees' ORDER BY total_cost DESC" items}}<tr><td>{{document_name}}</td></tr>{{/sql}}` |
| `sql` (CASE WHEN…) | Biến đổi giá trị, nối chuỗi, `NOW()`… | `{{sql "SELECT CASE WHEN SUM(amount)>=1000000 THEN 'VIP' ELSE 'Thường' END FROM ?" items}}` |
| `pluck` | Rút 1 cột từ danh sách object → mảng | `{{arraySum (pluck items "amount")}}` |
| `arraySum` `arrayAvg` `arrayMax` `arrayMin` | Tổng hợp trên mảng số | `Tổng: {{formatNumber (arraySum (pluck items "amount")) format="#,##0₫"}}` |
| `arrayLength` | Số phần tử | `{{arrayLength items}} dòng` |
| `arrayJoin` | Nối mảng thành chuỗi | `{{arrayJoin (pluck items "product.name") ", "}}` |
| `arrayUnique` `arrayReverse` `arrayGet` `arrayIncludes` | Khử trùng / đảo / lấy phần tử thứ i / kiểm tra chứa | `{{arrayGet (pluck items "sku") 0}}` |

## 3. 🧱 Helper khối HTML (Custom HTML block) · dùng ở: Block: Custom HTML

Ô JS của khối nhận `(data, rows, helpers)` và **trả về chuỗi HTML** (`data` = mảng dòng kết quả query). Gõ `return helpers.table(data);` để xem tên cột.

| Helper | Mô tả |
|---|---|
| `helpers.table(data)` | Hiện toàn bộ dữ liệu dạng bảng |
| `helpers.json(data)` | Xem cấu trúc thô (debug) |
| `helpers.keys(data)` | Mảng tên cột |
| `helpers.first(data,'col')` | Giá trị 1 cột ở dòng đầu |
| `helpers.sum(data,'col')` | Tổng 1 cột |
| `helpers.avg(data,'col')` | Trung bình 1 cột |
| `helpers.count(data)` | Số dòng |
| `helpers.min/max(data,'col')` | Nhỏ nhất / lớn nhất |
| `helpers.groupBy(data,'col')` | Gom nhóm theo cột → `{ key: rows[] }` |
| `helpers.fmt(số)` | Định dạng nghìn (vi-VN). `fmt(n, {locale, …})` |
| `helpers.date(v,'DD/MM/YYYY HH:mm')` | Định dạng ngày giờ (token `YYYY MM DD HH mm ss`) |
| `helpers.timeAgo(v)` | Thời gian tương đối — "2 giờ trước" |
| `helpers.icon('shopping-cart',{size:22,color:'#2490ef'})` | Icon Lucide bất kỳ (kebab-case) qua registry của icon-kit |

Ngoài ra còn `helpers.esc(x)` để escape HTML.

---

*Nguồn sinh từ code — cập nhật tại: `plugin-formula/src/shared/formulaKnowledge.ts` + `formulaEngine.ts` (họ 1), `plugin-print-template/src/shared/HelperDocs.tsx` + `helpers.ts` (họ 2), `plugin-block-custom-html/src/client/render.ts` (họ 3).*
