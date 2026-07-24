# Bộ sinh dòng theo quy tắc — Hướng dẫn sử dụng

> Từ **1 bản ghi cha** → sinh ra **N dòng con** trong **một giao dịch**, theo một **bộ quy tắc** bạn khai báo một lần.
> Cùng một cơ chế lo được: **nổ định mức BOM**, **chia hoa hồng**, **phân bổ chi phí/lương khoán** — có khớp qua quan hệ,
> người nhận động, gộp-và-tổng, làm tròn; chạy **thủ công bằng nút** hoặc **tự động khi lưu**, kèm **xem thử (dry-run)** + **trình gỡ lỗi**.

**Nhóm:** Công cụ mô hình dữ liệu (Data model tools) · **Chạy trên:** /admin (classic) + /v/ (modern) · **Phiên bản:** 0.8.3

> **Mới ở 0.8** — phép JOIN đơn được tổng quát thành một **pipeline JOIN nhiều bước có thứ tự**. Trình cấu hình trở thành **trình dựng pipeline**: LEFT nguồn ở trên, ở giữa là danh sách **thẻ bước** (thêm/xoá/đổi thứ tự — mỗi thẻ nối một bảng RIGHT riêng), dưới cùng là gộp/SUM + nơi ghi kết quả.
> - **Pipeline N bước** — mỗi bước nối một **bảng config khác nhau** (hoặc đi theo quan hệ) và nổ dòng ra; **output bước N là input bước N+1** (công thức bước sau đọc dòng vào qua `src.*`), nên **số lượng nhân dồn tự nhiên** theo dây chuyền. Ca đích thực tế: đơn → order_items → **⋈ combo_config (đệ quy)** → **⋈ bom** → gộp theo NVL + SUM.
> - **Hai kiểu bước** — vế RIGHT của một bước là **bảng config** (quét bảng chuẩn/định mức, khớp theo điều kiện) *hoặc* **quan hệ có sẵn** (đi theo hasMany/o2m theo khoá ngoại đã đánh chỉ mục — không quét bảng). Kiểu quan hệ cũng gộp chung cách "đi theo bảng con nguồn" cũ.
> - **Đệ quy + bậc ưu tiên theo từng bước** — nổ đệ quy (self-join) và khớp đích-danh-thắng-chung-chung của 0.7 giờ áp **cho mỗi bước**.
> - **An toàn nổ dây chuyền (`maxRows`, mặc định 10000)** — nổ nhiều tầng có thể bùng nổ số dòng, nên nếu tập đang xử lý vượt ngưỡng ở bất kỳ bước nào thì cả lần chạy **bị huỷ kèm thông báo rõ ràng** (không cắt cụt, không treo).
>
> Cấu hình **không có** bước join vẫn giữ nguyên bố cục JOIN một bước của 0.7 và cho kết quả **byte-identical** (tương thích ngược hoàn toàn).

> **Mới ở 0.7** — trình cấu hình được vẽ lại như một **phép JOIN** (LEFT nguồn ⋈ RIGHT định mức THEO điều kiện nối → kết quả), thêm hai kiểu khớp tuỳ chọn:
> - **Khớp theo bậc ưu tiên** (*đích danh thắng chung chung*): thử dòng cụ thể trước (vd dòng cho đúng nhân viên này); không có thì lùi về dòng chung (vd dòng cho vai trò) — tự chống đếm trùng.
> - **Nổ đệ quy** (*BOM nhiều cấp trong 1 lần chạy*): cây sản phẩm → cụm → NVL gốc sâu bao nhiêu cũng nổ hết trong một lượt, số lượng nhân dồn xuống, có chặn BOM vòng lặp. Cấu hình không dùng các trường này vẫn chạy y như cũ.

## Sau khi cài, có gì mới?

- **Một trang cấu hình mới trong Settings**: **“Bộ sinh dòng”** (biểu tượng danh sách ＋). Bên trong là tab **“Danh sách bộ sinh”** — nơi bạn tạo/sửa từng **“bộ sinh”** (mỗi bộ = một quy tắc “1 cha → N con”).
- **Một hành động mới để gắn vào block**: **“Sinh dòng theo quy tắc”** (nút hiển thị chữ **“Sinh dòng”**). Bạn tự thêm nút này vào bảng/biểu mẫu chứa bản ghi cha.
- ⚠️ **Mặc định chưa có gì chạy.** Cài xong bạn **chưa thấy nút nào** — phải vào Settings **tạo một bộ sinh** trước, rồi mới gắn nút (hoặc bật chạy tự động).
- **Không thêm** field hay kiểu hiển thị mới nào lên dữ liệu của bạn.
- 🧠 Nút **tự ẩn/hiện thông minh**: chỉ hiện khi bảng đó có bộ sinh hợp lệ **và** bản ghi đạt điều kiện (vd đơn đã ở trạng thái “Đã thanh lý”).

## Cấu hình ở đâu?

| Giao diện | Đường tới trang cấu hình |
|---|---|
| **Modern (`/v/`)** | ⚙ **Settings** → **“Bộ sinh dòng”** → tab **“Danh sách bộ sinh”** |
| **Classic (`/admin`)** | **Settings** → **“Bộ sinh dòng”** → **“Danh sách bộ sinh”** (đường dẫn `/admin/settings/line-generator`) |

Cả hai giao diện mở **cùng một danh sách bộ sinh** và dùng chung dữ liệu.

## Dùng thế nào (từng bước)

> ✅ **Ý tưởng chung:** một **bộ sinh** = trả lời 5 câu → (1) chạy trên **bảng cha** nào, khi nào; (2) nhân theo **dòng nào**; (3) đọc **bảng quy tắc** nào; (4) mỗi dòng con **ghi cột gì** (công thức); (5) **ghi vào bảng con** nào. Khai xong bấm **“Chạy thử”** ở panel bên phải để xem trước, rồi **“Lưu”**.

### Tình huống A — Chia hoa hồng cho từng nhân sự (chạy bằng nút)

1. Vào **Settings → “Bộ sinh dòng”**, bấm **“＋ Bộ sinh mới”**.
2. Góc trên phải, mở **“Nạp mẫu…”** → chọn **“Hoa hồng (quy tắc từ bảng dữ liệu)”** để có sẵn khung (bạn chỉ sửa tên bảng/cột cho khớp dữ liệu của mình).
3. Duyệt lần lượt 5 mục (bấm mở từng mục):
   - **1. Kích hoạt** → đặt **Tên**, chọn **Bảng kích hoạt (cha)** (vd *Đơn hàng*). Ở **Kích hoạt** giữ **“Bấm nút”**. Ở **Điều kiện** khai khi nào được chạy (vd `status = Đã thanh lý` **VÀ** `is_commission_created = false`).
   - **2. Đầu vào** → để trống **“Bảng dòng nguồn (src)”** = mỗi đơn tính 1 lần (mỗi quy tắc khớp → 1 dòng hoa hồng).
   - **3. Bảng quy tắc** → chọn **Bảng quy tắc** (vd *commission_rules*); ở **“Chỉ lấy dòng quy tắc thoả”** khai điều kiện khớp (vd nhóm quy tắc trùng loại vận chuyển của đơn, và quy tắc còn hiệu lực).
   - **4. Công thức tạo dòng & ghi kết quả** → chọn **“Ghi vào”** (bảng con nhận dòng, vd *order_commissions*); mỗi dòng ở bảng **cột đích ← công thức** (vd `commission_amt ← NUM(parent[rule.base_field]) * rule.rate`). Cột nào tích **“Bắt buộc”** mà ra rỗng thì **dòng đó bị bỏ**.
   - **5. Nâng cao** *(tuỳ chọn)* → làm tròn tiền, kiểm tra tổng %…
4. Bên phải, chọn một bản ghi ở **“Chạy thử với:”** → bấm **“Chạy thử”** để xem trước các dòng sẽ sinh → ưng thì bấm **“Lưu”**.
5. **Gắn nút lên trang:** mở bảng/biểu mẫu *Đơn hàng* → bật **UI Editor** → thêm hành động (**Configure actions**) → chọn **“Sinh dòng theo quy tắc”**. Nút hiện chữ **“Sinh dòng”**.
6. Người dùng mở một đơn đủ điều kiện → bấm **“Sinh dòng”** → cửa sổ **xem trước** hiện *“N dòng sẽ tạo”* → bấm **“Xác nhận tạo N dòng”**. ✅ Báo **“Đã tạo N dòng”**, bảng con tự làm mới.

> 💡 Có **nhiều bộ sinh** cho cùng một bảng? Nút **“Sinh dòng”** biến thành **menu xổ** để chọn đúng bộ. Muốn cố định một bộ cho một nút: bấm ⚙ trên nút → **“Cấu hình bộ sinh”** → điền **“Key bộ sinh”** (để trống = tự nhận theo bảng).

### Tình huống B — Nổ định mức NVL theo từng dòng đơn (gộp + cộng dồn)

1. **“＋ Bộ sinh mới”** → **“Nạp mẫu…”** → **“Nổ định mức BOM”**.
2. Ở **2. Đầu vào**, chọn **“Bảng dòng nguồn (src)”** = quan hệ dòng con của cha (vd *order_lines*). Khi đó bộ sinh **nhân theo TỪNG DÒNG** của đơn (mỗi dòng sản phẩm × định mức của nó); công thức đọc dòng qua `src.*`.
3. Ở **3. Bảng quy tắc**, khai khớp theo dòng (vd `product_id` của quy tắc **=** `src.product_id`).
4. Ở **5. Nâng cao**, dùng **“Gộp theo cột (group by)”** (vd `material_id`) và **“Cột cộng dồn khi gộp”** (vd `qty`) để gộp các dòng trùng NVL và **cộng dồn** số lượng.
5. **“Chạy thử”** → **“Lưu”** → gắn nút như Tình huống A.

### Tình huống C — Tự động chạy ngay khi lưu (không cần nút)

1. Mở bộ sinh → mục **1. Kích hoạt** → ở **“Kích hoạt”** chọn **“Tự động khi đạt điều kiện”**.
2. Khai **“Điều kiện kích hoạt”**: cứ **lưu** bản ghi mà thoả các điều kiện này là **tự sinh dòng** (không cần bấm nút).
3. ⚠️ **Quan trọng — chống chạy trùng:** ở **“Sau khi chạy thành công, cập nhật bản ghi cha (post)”** hãy đánh một **cờ đã chạy** (vd `is_commission_created ← true`) và đưa cờ đó vào điều kiện (vd `is_commission_created = false`). Nhờ vậy mỗi bản ghi chỉ chạy **một lần**. **Muốn chạy lại** thì **gỡ cờ đó** ra.
4. **“Lưu”**. Từ giờ server tự lo, kiểu như AI Column.

### Xem thử & gỡ lỗi (làm trước khi lưu)

- **Xem thử (dry-run):** panel bên phải trình cấu hình — chọn bản ghi ở **“Chạy thử với:”**, bấm **“Chạy thử”**. Hiện các thẻ **“N dòng”**, **“N bỏ qua”**, **“N lỗi”** và bảng các dòng sẽ sinh. **Không ghi gì cả.**
- **Debug từng bước:** mở khối **“Debug từng bước”** dưới bảng xem thử để soi từng chặng: **Bước 1** bản ghi cha (đã nạp quan hệ) → **Bước 2** dòng đầu vào → **Bước 3** quy tắc khớp → **Bước 4** từng cặp (dòng × quy tắc, thấy rõ **Giữ**/**Bỏ qua** và lý do) → **Bước 5** kết quả sau gộp → **Bước 6** các cột sẽ cập nhật lại cho cha.
- **Chèn cột vào công thức:** dùng thanh **“Công cụ công thức — chèn cột vào ô đang chọn”** trên cùng: bấm vào một ô công thức, rồi chọn **“＋ Cột của cha (parent)”**, **“＋ Cột dòng nguồn (src)”** hoặc **“＋ Cột quy tắc (rule)”** — token dạng `parent.responsible_staff.direct_manager.id` được chèn tại con trỏ (đi qua quan hệ rỗng thì tự ra rỗng, không lỗi).

## Mẹo & lưu ý

- 📸 **Chốt số tại thời điểm bấm (snapshot), KHÔNG “sống”.** Sửa định mức/tỉ lệ **sau** khi đã sinh **không** làm đổi các dòng đã tạo. Muốn cập nhật theo giá mới thì sinh lại.
- 🤫 **Thiếu dữ liệu = bỏ qua lặng.** Cột **“Bắt buộc”** mà ra rỗng (vd đơn thiếu người phụ trách, hoặc người đó không có quản lý) thì **bỏ đúng dòng đó**, ghi vào phần **“Bỏ qua”**, **không báo lỗi** cả mẻ.
- 🔒 **Điều kiện được canh 2 đầu.** Điều kiện ở mục 1 vừa **ẩn/hiện nút**, vừa được **máy chủ kiểm lại** khi chạy — chặn bấm đôi hay gọi thẳng API.
- ♻️ **Chạy lại = chỉ THÊM dòng mới** (không tự xoá dòng cũ). Vì vậy hãy dùng **cờ đã chạy** (mục *post*) để khỏi chạy trùng; cần dọn dòng cũ thì tự xoá tay.
- 🔢 **Chia tiền theo %?** Bật **“Làm tròn cột (largest-remainder)”** ở mục 5: phần lẻ được **dồn vào dòng cuối** để tổng khớp tuyệt đối; kèm **“Kiểm tra tổng”** (vd tổng % = 1) cho chắc.
- 👥 **Ai được làm gì:** **chạy/xem thử** bộ sinh thì **mọi người đăng nhập** đều được (kế toán bấm nút chạy hoa hồng); còn **tạo/sửa quy tắc** trong Settings **chỉ quản trị** mới được.
- 🔗 **Người nhận động:** một quy tắc có thể trỏ tới *chính mình / trưởng phòng / giám đốc* tuỳ dữ liệu — engine đi theo quan hệ bằng `REL()`. Nhớ **“Nạp kèm quan hệ”** ở mục 1/2/3 cho đúng đường mà công thức cần đọc.
- 🔁 **Tự làm mới:** sinh xong danh sách/bảng liên quan tự cập nhật (không cần F5).
- Chạy trên **cả hai** giao diện: classic `/admin` và modern `/v/`.

## Gỡ / tắt

- **Tắt một bộ sinh:** mở bộ sinh, bỏ tích **“Bật”** (hoặc dùng **“Xoá”** trong danh sách). Bộ đang **chạy tự động** sẽ ngừng bắt sự kiện ngay.
- **Gỡ hẳn plugin:** tắt trong **Plugin Manager** — nút biến mất, không còn tự chạy. **Các dòng con đã sinh vẫn còn** (chúng là dữ liệu bình thường), và các bộ sinh đã khai vẫn nằm trong cơ sở dữ liệu nếu bạn bật lại.
- 🆘 **Lỡ sinh nhầm:** các dòng con là bản ghi thường trong bảng đích — cứ **xoá tay** như dữ liệu bình thường; nếu có dùng **cờ đã chạy** thì gỡ cờ để được phép sinh lại.

---

### Cho nhà phát triển

Một cơ chế **config-driven**: mỗi bộ sinh là một dòng trong collection `ptdl_linegen_rules` (toàn bộ cấu hình nằm ở cột JSON `config`). Máy chủ mở resource `ptdlLineGen` với 3 action chính: `rulesFor` (bộ nào áp cho bảng nào), `preview` (dry-run), `generate` (ghi transaction: dòng con + cập nhật cha, cùng một giao dịch). Chạy tự động bám hook `afterCreate/UpdateWithAssociations` với khoá chống lặp. Lõi thuật toán (khớp/bỏ/gộp/làm tròn/hash) thuần, không đụng DB, test bằng Node — xem `README.md` (tiếng Anh) và `seed/COMMISSION-SETUP.md`.
