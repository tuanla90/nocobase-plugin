# AppSheet → NocoBase formula — hướng dẫn chuyển đổi

> Cách dịch công thức **AppSheet** (App Formula / Initial Value / Valid If) sang **`@ptdl/plugin-formula`**
> (display column, form default, computed field). Bảng ánh xạ + pattern thật rút từ một app AppSheet
> production (26 cột định nghĩa, ~200 công thức: IF·SELECT·SUM·FILTER·LIST·IN·ANY·LOOKUP·USERSETTINGS…).
> Đọc kèm: [COMPUTED-FIELD.md](COMPUTED-FIELD.md) · [MIGRATE-SQL-TO-COMPUTED.md](MIGRATE-SQL-TO-COMPUTED.md).

---

## 0. Ba loại cột công thức của AppSheet ứng với gì

| Cột AppSheet | Bản chất | Về NocoBase |
|---|---|---|
| **App Formula** (Auto Compute) | cột ảo tự tính | **Computed field** (lưu, tự tính lại) hoặc **Display column** (chỉ hiển thị, kể cả HTML) |
| **Initial Value** (Auto Compute) | giá trị mặc định lúc tạo | **Default value** (formula) — hoặc computed trigger `create` |
| **Valid If** (Data Validity) | (a) ràng buộc số / (b) lọc dropdown | (a) **validation rule**; (b) **data scope của quan hệ** — KHÔNG phải công thức tính (xem §5) |

---

## 1. Cú pháp cơ bản — ánh xạ 1-1

| AppSheet | NocoBase | Ghi chú |
|---|---|---|
| `[column]` | `data.column` | tham chiếu field dòng hiện tại |
| `[_THISROW]` | `data` | dòng hiện tại |
| `[_THISROW].[id]` | `data.id` | |
| `[_THIS]` / `[_this]` | `value` | **giá trị của CHÍNH field này** (dùng trong Valid If) |
| `[ref].[field]` | `data.ref.field` | deref 1 tầng (belongsTo) |
| `[a].[b].[c].[d]` | ⚠️ **flatten từng tầng** | 2+ tầng KHÔNG chạy (§6.1) |
| `=` (so sánh) | `==` | ⚠️ `=` đơn trong NocoBase là gán |
| `<>` | `!=` | |
| `&` (nối chuỗi) | `&` | **GIỮ NGUYÊN** — cùng là nối chuỗi |
| `"chuỗi"` | `"chuỗi"` | như nhau |
| số, `TRUE`/`FALSE` | như nhau | |

> **3 thay đổi máy móc nhất:** `[x]` → `data.x`, `=` → `==`, `[ref].[f]` → `data.ref.f`. ~70% công thức
> chỉ cần bấy nhiêu.

---

## 2. Ánh xạ HÀM (đã kiểm tra thực tế engine)

### GIỮ NGUYÊN TÊN — đã có sẵn (nhiều hàm AppSheet thêm native từ v0.1.65)
| AppSheet | NocoBase | |
|---|---|---|
| `IF` `IFS` `SWITCH` `AND` `OR` `NOT` | như nhau | |
| `SUM` `MIN` `MAX` `AVERAGE` | như nhau | |
| **`IN(x, LIST("a","b"))`** | `IN(x, LIST("a","b"))` | ✅ native v0.1.65 |
| **`LIST(a,b,…)`** `ANY(list)` | `LIST(a,b,…)` `ANY(list)` | ✅ native (ANY = phần tử đầu) |
| **`SPLIT(t, " ")`** | `SPLIT(t, " ")` | ✅ native v0.1.65 |
| **`STARTSWITH` `ENDSWITH` `CONTAINS`** | như nhau | ✅ native v0.1.65 |
| **`ISNOTBLANK(x)`** `ISBLANK(x)` | như nhau | ✅ native |
| `LOOKUP(val, "t", key, ret)` | `INDEX(SELECT(t.ret, t.key == val), 1)` | tra 1 giá trị |
| `NOW()` `TODAY()` `TEXT(x,"DD/MM/YYYY")` | như nhau | |
| `LEFT` `RIGHT` `MID` `LEN` `TRIM` `UPPER` `LOWER` `CONCATENATE` | như nhau | |
| `IFERROR` `ROUND` `YEAR` `MONTH` | như nhau | |

### ĐỔI TÊN / còn thiếu
| AppSheet | NocoBase | |
|---|---|---|
| `NUMBER(x)` | `VALUE(x)` | ép số |
| **`COUNT(list)`** đếm số phần tử | **`COUNTA(list)`** | ⚠️ Excel `COUNT` chỉ đếm Ô SỐ → list chữ ra 0. VD `COUNT(SPLIT(x," "))` → `COUNTA(SPLIT(x," "))` |
| `XLOOKUP` `SORTBY` | `INDEX/MATCH` · `SORT` | chưa có bản trực tiếp |

---

## 3. Pattern LỚN (rút từ chính sheet của bạn)

### 3.1 Gộp bảng con qua SELECT — **PHỔ BIẾN NHẤT** (44×SUM, 79×SELECT)
```
AppSheet:  SUM(SELECT(phieu_tra_hang[xs_th], [ggc_id] = [_THISROW].[id]))
```
`SELECT(child[col], [fk] = [_THISROW].[id])` = "các dòng child có fk trỏ về dòng này" = **quan hệ hasMany**.
```
NocoBase (nếu đã mô hình hoá quan hệ):   SUM(data.phieu_tra_hang.xs_th)
NocoBase (dạng bảng rời, tổng quát):     SUM(SELECT(phieu_tra_hang.xs_th, phieu_tra_hang.ggc_id == data.id))
```
> ⚡ Dạng bảng rời `phieu_tra_hang.ggc_id == data.id` là điều kiện `==` → **được engine ĐÁNH INDEX** (v0.1.64),
> nên gộp nhanh kể cả bảng lớn. Ưu tiên dạng `data.<quan_hệ>` nếu có quan hệ; không thì dạng SELECT vẫn ổn.

### 3.2 SELECT có nhiều điều kiện (AND)
```
AppSheet:  SUM(SELECT(phieu_tra_hang[xs_th], AND([ggc_id]=[_THISROW].[ggc_id], [id]<>[_THISROW].[id])))
NocoBase:  SUM(SELECT(phieu_tra_hang.xs_th, phieu_tra_hang.ggc_id == data.ggc_id && phieu_tra_hang.id != data.id))
```
(Trong điều kiện SELECT: cột bảng-đang-lọc = `bảng.cột`, cột dòng hiện tại = `data.cột`; dùng `&&`, `==`, `!=`.)

### 3.3 Trạng thái khởi tạo = ANY(SELECT(... MIN(stt)))
```
AppSheet:  ANY(Select(config_luong[ID], AND([ten_bang]="Nhân viên",
             [stt] = MIN(Select(config_luong[stt], [ten_bang]="Nhân viên")))))
NocoBase:  INDEX(SELECT(config_luong.ID,
             config_luong.ten_bang == "Nhân viên" &&
             config_luong.stt == MIN(SELECT(config_luong.stt, config_luong.ten_bang == "Nhân viên"))), 1)
```
(`ANY`→`INDEX(…,1)`; `=`→`==`; `Select`→`SELECT`.) Đặt ở **Initial Value / computed trigger `create`**.

### 3.4 Số thứ tự tự tăng
```
AppSheet:  MAX(SELECT(nha_cung_cap[stt], TRUE)) + 1
NocoBase:  MAX(nha_cung_cap.stt) + 1
```
> ⚠️ `MAX+1` có **đua** khi tạo đồng thời. Cân nhắc dùng **field kiểu Sequence/Auto-increment** của NocoBase
> cho mã chạy; giữ công thức chỉ khi số lượng tạo thấp.

### 3.5 Deref nhiều tầng → flatten
```
AppSheet:  [khsx_id].[v_sku].[id_san_pham].[quy_cach_may]     (3 tầng)
```
NocoBase computed **chỉ nạp 1 tầng**. Tách per-hop: đặt computed phẳng trên bảng trung gian, rồi đọc 1 tầng.
```
trên giao_gia_cong:  data.khsx_id.v_sku      (1 tầng — nếu v_sku là field/khoá)
→ nếu cần .id_san_pham.quy_cach_may: đặt computed `qc_may_flat = data.id_san_pham.quy_cach_may` trên bảng
   của v_sku, rồi ở đây đọc data.khsx_id.<...>.qc_may_flat (mỗi hop 1 computed).
```

### 3.6 Nhãn trạng thái điều kiện (IF/IFS + IN + SELECT)
```
AppSheet:  IF(IN([trang_thai_TH].[ten_trang_thai], LIST("Nhận hàng","Đã QC","Yêu cầu thanh toán")),
             [xs_th]+[xs_qcloi], 0)
NocoBase:  IF(OR(data.trang_thai_TH.ten_trang_thai == "Nhận hàng",
                 data.trang_thai_TH.ten_trang_thai == "Đã QC",
                 data.trang_thai_TH.ten_trang_thai == "Yêu cầu thanh toán"),
             data.xs_th + data.xs_qcloi, 0)
```

### 3.7 Bảng HTML lịch sử/tổng hợp (concat lớn) → DISPLAY column
```
AppSheet:  "<table><tr><td>"&TEXT(NOW(),"DD/MM/YYYY HH:mm")&"</td><td>"&[trang_thai].[label]&"</td></table>"
NocoBase:  "<table><tr><td>" & TEXT(NOW(),"DD/MM/YYYY HH:mm") & "</td><td>" & data.trang_thai.label & "</td></table>"
```
> `&` giữ nguyên; engine có helper HTML (`B/I/COLOR/TAG/LINK/IMG…`) nếu muốn gọn hơn. Đặt ở **display column**
> (cột hiển thị HTML), không cần lưu.

---

## 4. Ví dụ đối chiếu nhanh (trực tiếp từ sheet)

| AppSheet | NocoBase |
|---|---|
| `[so_luong]*[don_gia]` | `data.so_luong * data.don_gia` |
| `[tong_tien]*[ti_gia]` | `data.tong_tien * data.ti_gia` |
| `[ma_npl].[don_vi]` | `data.ma_npl.don_vi` |
| `[id_san_pham].[sku] & [mau_viet_tat]` | `data.id_san_pham.sku & data.mau_viet_tat` |
| `IF(ISNOTBLANK([sku_1]),1,0)+IF(ISNOTBLANK([sku_2]),1,0)` | `IF(NOT(ISBLANK(data.sku_1)),1,0) + IF(NOT(ISBLANK(data.sku_2)),1,0)` |
| `IF(STARTSWITH([SKU],"DN"), NUMBER(RIGHT([SKU],4)), "")` | `IF(LEFT(data.SKU,2)=="DN", VALUE(RIGHT(data.SKU,4)), "")` |
| `MAX(SELECT(phieu_tra_hang[stt],TRUE))+1` | `MAX(phieu_tra_hang.stt) + 1` |
| `"NCC" & [stt]` | `"NCC" & data.stt` |
| `CONCATENATE(LEFT([id_v_sku].[v-sku],6),[size],RIGHT([id_v_sku].[v-sku],3))` | `LEFT(data.id_v_sku.v_sku,6) & data.size & RIGHT(data.id_v_sku.v_sku,3)` |
| `[_this] <= [xs_th] - [xs_huy]` (Valid If) | `value <= data.xs_th - data.xs_huy` |

---

## 5. KHÔNG map thành công thức tính — dùng feature khác của NocoBase

| AppSheet | Vì sao | Dùng gì ở NocoBase |
|---|---|---|
| `UNIQUEID()` (Initial Value của id) | NocoBase **tự sinh id** | bỏ — để field id/UUID/Snowflake tự tạo |
| `USERSETTINGS("User name")` | người dùng hiện tại | field hệ thống **"Created by/Updated by"**, hoặc default theo biến ngữ cảnh — KHÔNG qua formula engine |
| `LIST([nguoi_tao],[nguoi_cap_nhat])` cho `nguoi_xem` | quyền xem theo dòng | **ACL / row-level permission**, không phải cột tính |
| **Valid If = `FILTER("table", …)`** / `SELECT(t[col], …)` | lọc **danh sách chọn** của dropdown/Ref | **Data scope / linkage filter** của trường quan hệ (không phải công thức) |
| **Valid If = `[_this] <= …`** | ràng buộc nhập | **Validation rule** của field (hoặc computed boolean + chặn ở workflow) |
| `ORDERBY(FILTER(...), col)` cho danh sách chọn | dropdown có sắp xếp | data scope + sort của trường quan hệ |

> Nhận diện nhanh: nếu công thức AppSheet đang **định nghĩa tập giá trị hợp lệ của một trường Ref/Enum**
> (kết quả là một LIST/bảng), đó là **cấu hình quan hệ**, không phải computed. Nếu nó **ra 1 giá trị vô hướng**
> (số/chuỗi/ngày/bool), đó là **computed / default / display**.

---

## 6. Cạm bẫy

1. **`=` → `==`** (và `<>` → `!=`). Bỏ sót = gán, sai âm thầm.
2. **`&` giữ nguyên** (đừng đổi thành `+`). Engine tự hiểu `&` = nối chuỗi.
3. **Deref 2+ tầng** `[a].[b].[c]` KHÔNG chạy → flatten per-hop (§3.5).
4. **Blank vs "":** AppSheet `""`/blank ≈ NocoBase thiếu/`""`. `ISBLANK`/`ISNOTBLANK` đều có sẵn.
5. **Enum/status là ID băm** (vd `"967d2bae"`, `"02ceb566"`): đó là **khoá bản ghi trạng thái** trong AppSheet.
   Ở NocoBase nên so theo **giá trị enum/tên trạng thái** thật hoặc id bản ghi tương ứng — đừng bê nguyên chuỗi băm.
6. **`SELECT(t[col], TRUE)`**: `TRUE` = "mọi dòng" → NocoBase `t.col` (auto-pluck cả cột), hoặc `SELECT(t.col, TRUE)`.
7. **`COUNT` list → `COUNTA`** (§2): AppSheet COUNT đếm phần tử, Excel COUNT chỉ đếm số. Đây là lỗi âm thầm hay gặp nhất khi dịch.

---

## 7. Chat AI dịch AppSheet → NocoBase — **ĐÃ CÓ (v0.1.65)**

Trong popover **"AI viết hộ"** (nút 🤖 ở ô công thức, cả trang Settings ⚙ lẫn dialog ⚙ cột) có ô **"Có công
thức AppSheet? Dán vào đây"** + nút **⇄ Chuyển từ AppSheet**. Dán công thức AppSheet → AI dịch → **tự Chạy thử
(`testFormula`) + sửa lỗi ≤3 lần** trên **schema thật của bảng** → điền thẳng vào ô + hiện kết quả mẫu. Vì
self-validate, đầu ra **đảm bảo parse được**; AI còn dùng tên quan hệ THẬT và cảnh báo khi gặp deref 2+ tầng
(cần flatten).

- Server: action `ptdlComputed:aiConvert {collection, appsheet}` → `aiConvertFormula` (clone `aiWrite`, dùng
  `buildAppsheetConvertSystemPrompt`).
- Prompt = luật + few-shot ở doc này (single source of truth trong `formulaKnowledge.ts`: `APPSHEET_RULES` +
  `APPSHEET_MAP`) + schema bảng.
- Mẹo: dán từng công thức một; công thức phức tạp (nhiều tầng / status enum id) nên xem lại kết quả rồi tinh chỉnh.
