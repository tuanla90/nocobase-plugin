# Tối ưu & Ổn định — Hướng dẫn sử dụng

> Hai lớp bảo vệ cho giao diện **hiện đại (/v/)**: **giới hạn keep-alive** để app không **chậm dần** khi
> dùng lâu, và **chống treo** khi gặp **quan hệ hỏng**. Thuần client — **không đổi dữ liệu, không cần restart server**.

**Nhóm:** System services · **Chạy trên:** /v/ (modern) · **Phiên bản:** 0.1.5

> ⚠️ **QUAN TRỌNG (0.1.5):** Phần **CHỐNG TREO** là tính năng chính, **đang bật, an toàn**. Phần **GIỚI HẠN
> KEEP-ALIVE** hiện là **THỬ NGHIỆM và MẶC ĐỊNH TẮT**: cách duy nhất NocoBase cho để gỡ trang (`destroyModel`)
> hoá ra **XÓA trang khỏi DB** (không phải chỉ unmount), nên auto-dọn bị **vô hiệu** cho tới khi có cách gỡ
> không hủy diệt. `evict()` giờ **chỉ báo cáo, không xóa gì**. Các mục keep-alive bên dưới mô tả cách nó *sẽ*
> chạy khi có primitive an toàn.

## Vì sao cần plugin này?

- **App chậm dần theo thời gian dùng.** NocoBase v2 **giữ mọi trang bạn đã mở** trong bộ nhớ (keep-alive) và
  **không bao giờ dọn**. Điều hướng qua nhiều trang menu → số **DOM node tăng vô hạn** (đo thực tế: 3k → 12k → 21k),
  render chậm dần; chỉ **F5** mới nhẹ lại. → Lớp **keep-alive cap** tự dọn bớt để DOM luôn gọn.
- **Treo cả app khi gặp quan hệ hỏng.** Một quan hệ thiếu chiều ngược (belongsTo) hoặc lệch khóa ngoại làm một
  cột không phân giải được field → flow `beforeRender` của cột đó ném lỗi → **treo toàn bộ app** (“đơ luôn”).
  → Lớp **crash-guard** cô lập từng cột: cột hỏng chỉ thành **ô trống** thay vì làm treo tất cả.

## Sau khi cài, có gì mới?

- **Một trang cài đặt mới**: **⚙ Cài đặt → “Tối ưu & Ổn định”** (có ở cả `/v/` và `/admin`).
- **keep-alive cap TỰ BẬT** (mặc định an toàn), giữ **3 trang nền gần nhất** còn sống, dọn phần cũ hơn.
- **crash-guard LUÔN BẬT** (bảo vệ thuần túy, không có tác dụng phụ).
- **Không thêm** bảng / field / collection nào; **không cần restart server** — mọi thứ chạy phía trình duyệt.

## Cấu hình ở đâu?

| Giao diện | Cách vào |
|---|---|
| **Modern (`/v/`)** | **⚙ Cài đặt** → **“Tối ưu & Ổn định”**. |
| **Classic (`/admin`)** | **Cài đặt** → **“Tối ưu & Ổn định”**. (keep-alive cap **không tác dụng** ở đây — trang con là cơ chế của `/v/` — nhưng trang cấu hình vẫn mở được.) |

## Dùng thế nào

### Cách A — Để mặc định (khuyến nghị)
**Không cần làm gì.** Cài + bật plugin là xong: keep-alive cap tự dọn, crash-guard tự bảo vệ. Dùng app một lúc rồi
mở trang cài đặt xem **“Trang đang giữ (page-header)”** — con số này giờ **đứng yên** quanh mức nhỏ thay vì tăng mãi.

### Cách B — Chỉnh số trang nền giữ lại
Trong trang cài đặt, đổi **“Số trang nền giữ tối đa”**:
- **Số lớn hơn** (vd 6–10): quay lại các trang gần đây **tức thì** (giữ nguyên bộ lọc/cuộn), nhưng DOM lớn hơn.
- **Số nhỏ** (1–2): DOM gọn nhất, nhưng quay lại trang cũ sẽ **tải lại**.
- **0**: **dọn hết** trang nền — tối đa hiệu năng; mọi lần quay lại đều tải lại trang.

### Cách C — Kiểm tra / thao tác thủ công
- **“Quét thử (không xoá)”**: xem sẽ dọn bao nhiêu trang (không đụng gì) — bước an toàn để thử trước.
- **“Dọn ngay”**: dọn ngay lập tức.
- **Console** (F12): `window.__ptdlPerfGuard.status()` (xem trạng thái), `.scan()` (quét thử), `.evict()` (dọn),
  `.setMax(2)` (đổi số trang giữ), `.disable()` / `.enable()` (tắt/bật).

## Mẹo & lưu ý

- 🔁 **Đánh đổi khi dọn trang:** trang bị dọn khi quay lại sẽ **tải lại từ đầu** (mất bộ lọc/cuộn tạm thời của
  trang đó). Vì vậy mặc định **giữ 3 trang gần nhất** — kiểu qua lại “danh sách → chi tiết → danh sách” vẫn tức thì.
- 🛟 **crash-guard an toàn tuyệt đối:** chỉ **cô lập** lỗi render của từng cột; nếu có gì bất thường nó **rơi về
  cách xử lý gốc** của NocoBase, không bao giờ tự ném lỗi.
- 🖥️ **keep-alive cap chỉ có tác dụng trên `/v/`** (modern). Trên `/admin` cổ điển nó **không làm gì** (vô hại).
- 🔌 **Nếu gặp bất kỳ trục trặc lạ nào** liên quan điều hướng, cứ **Tắt** “Tự động dọn trang nền” trong trang cài
  đặt (hoặc gõ `window.__ptdlPerfGuard.disable()`); crash-guard vẫn hoạt động độc lập.

## Gỡ / tắt

- **Tắt riêng keep-alive cap:** tắt công tắc **“Tự động dọn trang nền”** trong trang cài đặt (lưu theo **từng
  trình duyệt**).
- **Tắt toàn bộ:** tắt plugin trong **Plugin Manager**. Cả hai lớp ngừng ngay. Vì plugin **không đụng dữ liệu**,
  gỡ ra hoàn toàn vô hại.

---

### Cho nhà phát triển

Thuần client. **keep-alive cap** (`src/shared/keepaliveCap.ts`): đọc danh sách “view descriptor” các trang con
trong `.nb-subpages-slot-without-header-and-side` bằng cách **duyệt React-fiber chỉ-đọc**, xếp theo **LRU** (quan
sát trang nào đang hiện để chấm mốc), giữ `maxAlive` trang gần nhất và gọi chính `flowEngine.destroyModel(uid)` của
core để unmount sạch phần còn lại; hook điều hướng qua `pushState/replaceState/popstate` (debounce 300ms). **Mặc
định BẬT** (chỉ `localStorage['ptdl:perf-guard:enabled']==='0'` mới tắt). **crash-guard** (`src/shared/crashGuard.ts`):
đi ngược prototype chain từ các model class core để tìm đúng `FlowModel.prototype`, patch
`applySubModelsBeforeRenderFlows` để **cô lập `beforeRender` từng sub-model** (một cột hỏng không làm reject cả
`Promise.all` → không treo app); idempotent, giữ bản gốc làm fallback. Không collection, server để trống.
