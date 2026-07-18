# Dựng app từ mô tả — Hướng dẫn sử dụng

> Tả app bằng **tiếng Việt** (hoặc dán **App-Spec** JSON) → plugin tự dựng cả một app NocoBase:
> **bảng dữ liệu, quan hệ, dữ liệu mẫu, cột tính tự động, luồng trạng thái, trang và menu** — hiện ngay
> trên giao diện **/v/**. Cần chỉnh app đã có? AI cũng **thêm/sửa từng bước** giúp bạn.

**Nhóm:** Công cụ dựng app (Low-code Builder) · **Chạy trên:** Chỉ **/v/** (modern) · **Phiên bản:** 0.2.0

## Sau khi cài, có gì mới?

- **Một nút nổi** ở **góc dưới bên phải** màn hình: **“🛠 Dựng app”** (chỉ trên giao diện **/v/**). Bấm để mở hộp thoại **“Dựng app từ App-Spec”** — đây là nơi duy nhất bạn thao tác.
- **Không thêm** trang trong Settings, **không đụng** vào các menu/trang/khối dữ liệu hiện có của bạn.
- Trong hộp thoại có **3 cách dựng**: để **AI viết từ mô tả**, để **AI dựng/sửa từng bước**, hoặc **dán / nạp App-Spec (JSON)** rồi bấm tạo.
- Tạo xong sẽ hiện **“Các trang đã tạo”** kèm **link bấm vào dùng ngay**, và nút **“🗑 Xoá app vừa tạo”** để hoàn tác nhanh.
- ⚠️ Trên giao diện **classic (`/admin`)** plugin **không hiện gì** — cố ý, vì trang do plugin sinh ra là trang **/v/**.

## Cấu hình ở đâu?

Plugin này **không có trang Settings riêng.** Mọi thứ làm ngay trong nút nổi:

| Giao diện | Vào đâu |
|---|---|
| **Modern (`/v/`)** | Bấm nút nổi **“🛠 Dựng app”** ở **góc dưới bên phải** → mở hộp thoại **“Dựng app từ App-Spec”** |
| **Classic (`/admin`)** | Không có giao diện (bỏ trống có chủ ý) |

> 💡 Người viết script/AI còn có cổng `window.__ptdlAppBuilder` để gọi từng bước — xem mục **Cho nhà phát triển**.

## Dùng thế nào (từng bước)

Trong hộp thoại **“Dựng app từ App-Spec”**, các nút hoạt động như sau:

| Nút / ô | Làm gì |
|---|---|
| Ô mô tả *(trên cùng)* | Gõ mô tả app của bạn bằng tiếng Việt |
| **✨ Sinh bằng AI** | AI viết **App-Spec (JSON)** vào ô bên dưới cho **một app mới** — xem lại rồi bấm **Tạo app** |
| **🔧 Dựng/Sửa từng bước** | AI **lập kế hoạch** các bước; **sửa được cả app đã có** (thêm field/trang, đổi tên…) — xem trước rồi bấm **▶ Chạy** |
| Ô JSON *(App-Spec)* | Dán trực tiếp App-Spec, hoặc để 2 nút AI ở trên tự điền |
| **Nạp demo** | Nạp App-Spec mẫu **“Bán hàng”** vào ô JSON |
| **Kiểm tra** | Kiểm tra App-Spec có **hợp lệ** không (chưa ghi gì cả) |
| **Tạo app** | **Dựng thật:** bảng + quan hệ + dữ liệu mẫu + cột tính + luồng trạng thái + trang + menu |
| **🗑 Xoá app vừa tạo** | Hoàn tác: xoá đúng những gì vừa tạo (chỉ hiện **sau khi** đã tạo) |

Khi bấm **Tạo app**, plugin biên dịch App-Spec thành 2 tầng:

| Tầng | Sinh ra gì |
|---|---|
| **Dữ liệu** *(server)* | Các **bảng** + field đủ kiểu (chữ, số, %, chọn, ngày/giờ, đúng-sai, màu, icon, JSON…), **quan hệ** (1–nhiều / nhiều–1 / 1–1 / nhiều–nhiều, tự tạo cả link ngược), **cột tính tự động** (vd Thành tiền = SL × Đơn giá), **luồng trạng thái** (Nháp → Xác nhận → …), và **dữ liệu mẫu** |
| **Giao diện** *(/v/)* | **Nhóm menu** + mỗi bảng một **trang** (bảng thường hoặc bảng nâng cao) kèm popup **Xem / Sửa / Thêm** |

### Tình huống A — Tả là dựng (nhanh nhất, tạo app mới)

1. Bấm nút nổi **“🛠 Dựng app”** ở góc dưới bên phải.
2. Ở ô mô tả trên cùng, gõ app bạn muốn — vd: *“App quản lý bán hàng: khách hàng, sản phẩm, đơn hàng có dòng chi tiết + trạng thái đơn”*.
3. Bấm **“✨ Sinh bằng AI”**. AI của NocoBase viết **App-Spec (JSON)** vào ô bên dưới.
4. **Xem lại** JSON (đổi tên field / thêm cột tuỳ ý). Muốn chắc thì bấm **“Kiểm tra”**.
5. Bấm **“Tạo app”**. ✅ Xong sẽ hiện **“Các trang đã tạo”** — bấm link vào dùng ngay.

> 💡 Hai nút **✨ / 🔧** chỉ chạy khi đã bật **AI (`@nocobase/plugin-ai`)** và cấu hình sẵn một model. Chưa có sẽ báo *“Chưa bật/cấu hình AI…”*.

### Tình huống B — Dựng/Sửa từng bước (sửa được cả app đã có)

1. Mở **“🛠 Dựng app”**.
2. Gõ yêu cầu — vd: *“Thêm field trạng thái cho bảng đơn hàng”* hoặc *“Thêm trang danh sách khách hàng”*.
3. Bấm **“🔧 Dựng/Sửa từng bước”**. AI **nhìn hiện trạng** app của bạn rồi lập một **Kế hoạch** gồm các bước.
4. **Xem trước** danh sách bước trong khung **“Kế hoạch (N):”**. Ưng thì bấm **“▶ Chạy”**.
5. Plugin chạy **lần lượt** từng bước, mỗi bước hiện **✓** (xanh, xong) hoặc **✕** (đỏ, kèm lỗi). Cuối cùng báo *“N/N bước OK”*.

> 💡 Đây là cách **sửa app có sẵn** (thêm/bớt field, thêm trang, đổi tên hiển thị). Nó **không dựng lại** bảng đã tồn tại.

### Tình huống C — Dán / nạp App-Spec có sẵn (không cần AI)

1. Mở **“🛠 Dựng app”**.
2. Bấm **“Nạp demo”** để nạp App-Spec mẫu **“Bán hàng”** (4 bảng: **Khách hàng · Sản phẩm · Đơn hàng · Dòng hàng**) — hoặc **dán** App-Spec JSON của bạn vào ô.
3. Bấm **“Kiểm tra”** để chắc chắn spec hợp lệ.
4. Bấm **“Tạo app”**. ✅ Xong có link các trang để vào xem.

> 💡 Bảng của demo có tiền tố `ab_` nên **không đè** lên bảng thật của bạn. Demo này minh hoạ đủ: quan hệ **đơn ↔ dòng hàng**, **cột tính** *Thành tiền*, **luồng trạng thái** đơn, và widget **thanh tiến độ**.

> 🗑 **Lỡ tay?** Ngay sau khi tạo, bấm **“🗑 Xoá app vừa tạo”** để xoá đúng phần vừa dựng (bảng + trang). Nút chỉ hoàn tác **lần tạo gần nhất trong phiên** này.

## Mẹo & lưu ý

- ⚠️ **Tạo app = ghi thật vào cơ sở dữ liệu** (tạo bảng, quan hệ, trang). Hãy **Kiểm tra** / xem lại JSON **trước khi** bấm **Tạo app**.
- ✅ **An toàn khi chạy lại:** nếu bảng đã tồn tại, plugin **bỏ qua** (không đè). Nếu tạo giữa chừng gặp lỗi, plugin **tự thu hồi** các bảng nó vừa tạo trong lần đó.
- 🤖 Hai nút **✨ Sinh bằng AI** và **🔧 Dựng/Sửa từng bước** cần **`@nocobase/plugin-ai`** đã bật + có model. Cách **Nạp demo / dán JSON** thì **không cần AI**.
- 🧩 Muốn dùng đầy đủ, nên cài kèm: **`@ptdl/plugin-formula`** (cột tính tự động) và **status-flow** của @ptdl (luồng trạng thái); trang **/v/** dùng lại bộ dựng trang của **instant-create-page**. Thiếu plugin nào thì phần đó bị bỏ qua — bảng vẫn được tạo (vd cột tính vẫn có nhưng **chưa tự tính**).
- 🖥️ Chỉ chạy trên **/v/ (modern)**; trên **/admin classic** nút **không hiện** (có chủ ý).
- 🔁 Nút **“🗑 Xoá app vừa tạo”** chỉ nhớ **lần tạo gần nhất** trong phiên trình duyệt; **tải lại trang** là mất “trí nhớ” đó (khi ấy phải xoá bảng/trang thủ công).
- 🔐 **Ai đã đăng nhập** cũng gọi được thao tác dựng — nên chỉ mở plugin cho môi trường / vai trò tin cậy (thường là **quản trị viên**).

## Gỡ / tắt

- **Hoàn tác app vừa dựng:** bấm **“🗑 Xoá app vừa tạo”** ngay trong hộp thoại (khi còn nhớ lần tạo gần nhất).
- **Tắt plugin:** tắt trong **Plugin Manager** → nút **“🛠 Dựng app”** biến mất, không dựng được nữa.
- ⚠️ **Lưu ý:** các bảng / quan hệ / dữ liệu / trang **đã tạo vẫn còn** sau khi tắt plugin (chúng là collection & route **thật** của NocoBase). Muốn bỏ hẳn: dùng nút **xoá trước khi tắt**, hoặc xoá thủ công sau đó — **bảng** trong **Collection Manager**, **trang** trong phần quản lý menu/route.

---

### Cho nhà phát triển

- **Kiến trúc:** App-Spec (IR mô tả cấp cao) → compiler. **Tầng dữ liệu** chạy ở **server** (action `appBuilder:apply` và các tool lẻ `createCollection` / `addField` / `addRelation` / `addComputed` / `addStatusFlow` / `seed` / `describeApp` / `dropField` / `dropCollection` / `renameField`, ACL `loggedIn`). **Tầng trang** chạy ở **client /v/** (flowEngine + routeRepository, dùng lại `createQuickPage` của instant-create-page). AI dùng chính LLM của NocoBase (`aiGenerate` = sinh spec, `aiPlan` = lập kế hoạch tool).
- **Cổng script/AI:** `window.__ptdlAppBuilder` — có `buildApp(spec)`, `validateAppSpec(spec)`, `runPlan(steps)`, `callTool(name, args)`, `toolNames`, `samples.banHang`, và từng tool lẻ. Tiện để kiểm thử tự động.
- **Guardrail:** `dropCollection` từ chối các collection lõi NocoBase/@ptdl; `dropField` từ chối field hệ thống; `renameField` chỉ đổi **nhãn hiển thị** (không đổi tên máy, để khỏi vỡ quan hệ/trang/FK).
- **Chi tiết thiết kế:** `docs/APP-BUILDER-DESIGN.md`.
