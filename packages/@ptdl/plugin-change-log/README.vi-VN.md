# Nhật ký thay đổi — Hướng dẫn sử dụng

> Tự động ghi lại **lịch sử thay đổi** của những field bạn chọn (rất hợp với **field trạng thái**):
> ai đổi · lúc nào · vai trò gì · từ giá trị nào sang giá trị nào · qua đường nào · nằm ở giá trị cũ bao lâu · kèm lý do (tuỳ chọn).
> Xem lại dưới dạng **dòng thời gian** ngay trên bản ghi — không cần code, không cần restart.

**Nhóm:** Kiểm toán / Nhật ký (Auditing) · **Chạy trên:** /admin (classic) + /v/ (modern) · **Phiên bản:** 0.1.3

## Sau khi cài, có gì mới?

- **Một trang cấu hình mới trong Settings**: **“Nhật ký thay đổi”** (biểu tượng đồng hồ lịch sử) → tab **“Collection theo dõi”**. Đây là nơi bạn chọn **theo dõi bảng nào, field nào**.
- **Một nút bản ghi mới**: **“Lịch sử thay đổi”** — thêm vào thanh hành động của bảng/biểu mẫu; bấm để mở dòng thời gian của bản ghi đó (dạng **Drawer** đầy đủ hoặc **Popover** gọn).
- **Một block mới**: **“Lịch sử thay đổi”** — thả vào **trang chi tiết bản ghi** để hiện dòng thời gian ngay tại chỗ.
- ⚠️ **Chưa ghi gì cho tới khi bạn khai báo.** Bật plugin lên thì chưa có gì được ghi — nhật ký chỉ bắt đầu sau khi bạn **thêm một collection và chọn field kích hoạt** trong trang cấu hình.

## Cấu hình ở đâu?

| Giao diện | Đường tới trang cấu hình |
|---|---|
| **Modern (`/v/`)** | ⚙ **Settings** → **“Nhật ký thay đổi”** → tab **“Collection theo dõi”** |
| **Classic (`/admin`)** | **Settings** → **“Nhật ký thay đổi”** (đường dẫn `/admin/settings/ptdl-change-log`) |

Cả hai giao diện mở **cùng một trang cấu hình** và dùng chung một bộ luật theo dõi.

## Dùng thế nào (từng bước)

### Tình huống A — Bật ghi lịch sử cho một field (thường là trạng thái)

1. Mở trang **“Nhật ký thay đổi”** → bấm **“Thêm collection”**.
2. Ở ô **Collection**, chọn bảng cần theo dõi. Plugin **điền sẵn giúp bạn**: **Field kích hoạt** = các field trạng thái của bảng, **Field chụp kèm** = `updatedBy`/`updatedAt` (nếu có).
3. Chỉnh **“Field kích hoạt”** — mỗi khi **một trong các field này đổi giá trị** sẽ ghi 1 dòng lịch sử (field trạng thái được xếp lên đầu danh sách).
4. (Tuỳ chọn) chọn thêm **“Field chụp kèm”** — các field sẽ được **chụp lại đúng giá trị tại thời điểm đổi** để hiện kèm trong lịch sử.
5. (Tuỳ chọn) bật **“Ghi kèm lý do khi thay đổi”**, và đặt **“Lưu giữ (ngày)”** để tự xoá dòng cũ.
6. Bấm **“Lưu”**. ✅ Từ giờ mọi lần các field đó đổi giá trị đều được ghi lại **tự động**.

> 💡 Mỗi collection chỉ có **một** cấu hình. Muốn tạm ngừng mà không xoá, gạt cột **“Bật”** ở dòng đó về tắt.

### Tình huống B — Xem lịch sử bằng nút “Lịch sử thay đổi”

1. Mở view có bản ghi (bảng hoặc trang chi tiết) → bật **UI Editor**.
2. Vào phần **cấu hình hành động** của khối → thêm hành động **“Lịch sử thay đổi”** (nút mặc định hiển thị chữ **“Lịch sử”**).
3. Mở ⚙ của nút → **“Cấu hình lịch sử thay đổi”**:
   - **“Hiển thị dạng”**: **“Drawer (đầy đủ)”** (ngăn trượt rộng, đủ ghi chú + field chụp kèm) hoặc **“Popover (gọn)”** (mở nhanh, nhỏ gọn).
   - **“Hiện badge số lượng”**: gắn số lần thay đổi lên nút.
4. Bấm nút trên một bản ghi → xem **dòng thời gian** đầy đủ.

### Tình huống C — Nhúng dòng thời gian vào trang chi tiết (block)

1. Mở **trang/pop-up chi tiết** của một bản ghi → bật **UI Editor** → thêm block.
2. Chọn block **“Lịch sử thay đổi”**.
3. (Tuỳ chọn) trong ⚙ của block → **“Nền”** → chọn **“Màu nền”**; tiêu đề/mô tả lấy từ **Card settings** sẵn có.

> ℹ️ Nếu đặt block/nút ở nơi **không có bản ghi** trong ngữ cảnh, nó chỉ hiện dòng nhắc *“Thêm block này vào trang chi tiết bản ghi để xem lịch sử.”* thay vì báo lỗi.

### Đọc dòng thời gian có gì?

- **Đầu bảng**: giá trị **hiện tại** (kèm màu/icon), **“Tổng thời gian”**, **“Số lần đổi”**, và thanh **“nằm ở mỗi giá trị bao lâu”**.
- **Mỗi dòng**: giá trị mới ← giá trị cũ, **người đổi** (avatar), **vai trò**, **nguồn thay đổi** (chip), thời gian **ở giá trị trước**, **lý do** (nếu có), và các **field chụp kèm**.

## Mẹo & lưu ý

- **Ghi tự động ở phía máy chủ, cho mọi đường ghi**: lưu **biểu mẫu**, **đổi nhanh** (quick), **sửa hàng loạt** (từng dòng), và cả **gọi API/quy trình** trực tiếp — tất cả đều vào nhật ký. Ghi theo kiểu *best-effort*: nếu ghi log lỗi thì **không bao giờ chặn** thao tác nghiệp vụ của bạn.
- **Nguồn thay đổi tự nhận diện** và hiện thành chip trong lịch sử:

  | Chip | Nghĩa |
  |---|---|
  | **Tạo mới** | Bản ghi vừa được tạo với giá trị đó |
  | **Biểu mẫu** | Lưu qua form trên giao diện |
  | **Hành động** / **Nhanh** | Đổi qua nút hành động / đổi trạng thái nhanh |
  | **Hàng loạt** | Sửa nhiều bản ghi cùng lúc |
  | **API** / **Quy trình** / **Hệ thống** | Gọi API trực tiếp / workflow / tiến trình nền |

- 🎨 **Màu và icon của giá trị được “chụp” tại thời điểm đổi.** Về sau bạn có sửa danh sách trạng thái / đổi màu / đổi icon thì **lịch sử cũ vẫn hiển thị đúng** như lúc xảy ra.
- ⏱ **“Field chụp kèm” bị đóng băng** theo đúng giá trị tại thời điểm đổi; **thời gian nằm ở giá trị trước** (cycle time) được tính tự động.
- 📝 Muốn ghi **lý do** cho mỗi lần đổi thì phải bật **“Ghi kèm lý do khi thay đổi”** trong cấu hình của collection đó.
- 🗑 **“Lưu giữ (ngày)”** đặt riêng cho từng collection: tự xoá dòng cũ hơn số ngày này (chạy nền định kỳ và ngay khi bạn lưu cấu hình). **`0` = giữ mãi.**
- 🔒 **Phân quyền xem**: người dùng chỉ đọc được lịch sử của **collection mà họ có quyền xem**; tài khoản root/admin luôn xem được. (Cơ chế “an toàn khi nghi ngờ” — nên **kiểm thử với một vai trò hạn chế thật** trước khi tin tưởng hoàn toàn.)
- Cấu hình **có hiệu lực ngay khi bấm “Lưu”** (server tự nạp lại), **không cần restart**.
- Chạy trên **cả hai** giao diện: classic `/admin` và modern `/v/`.

## Gỡ / tắt

- **Ngừng theo dõi một collection:** vào trang cấu hình, gạt cột **“Bật”** ở dòng đó về tắt, hoặc bấm **“Xoá”** cấu hình. Lịch sử **đã ghi vẫn được giữ lại**.
- **Dọn lịch sử cũ:** đặt **“Lưu giữ (ngày)”** cho collection để hệ thống tự xoá dòng quá hạn.
- **Gỡ hẳn:** tắt plugin trong **Plugin Manager** — việc ghi nhật ký dừng ngay. **Dữ liệu lịch sử** (`ptdlChangeLogs`) và **cấu hình** (`ptdlChangeLogConfigs`) vẫn còn trong cơ sở dữ liệu nếu bạn bật lại sau này.

---

### Cho nhà phát triển

Ghi ở **tầng server** qua db hook `afterCreate`/`afterUpdate` cho các field kích hoạt; mỗi thay đổi thành 1 dòng ở collection **`ptdlChangeLogs`** (bất biến, `dumpRules: 'skipped'`), cấu hình theo bảng ở **`ptdlChangeLogConfigs`** (một dòng/collection). Màu/icon/nhãn của giá trị được snapshot từ `uiSchema.enum` của field `statusFlow` vào `fromMeta`/`toMeta`. Nguồn thay đổi = header `x-ptdl-change-source` (`form`/`quick`/`action` do client gắn) cộng suy luận phía server (`create`/`bulk`/`api`/`system`); lý do đi qua header base64 `x-ptdl-change-note`. Các surface (timeline/popover/drawer/block) query qua resource API chuẩn và được **gate quyền theo collection nguồn** (fail-open). Cầu nối `globalThis.__ptdlChangeLog` cho phép plugin khác (vd trạng thái) mở popover lịch sử mà không phụ thuộc cứng. Chi tiết kỹ thuật: xem `README.md` (tiếng Anh).
