# Nút thao tác nâng cao — Hướng dẫn sử dụng

> Tùy biến **nút thao tác** trên trang: đổi màu riêng từng nút (nền/chữ/viền/hover), xếp lại **thanh nút**
> của khối, và thêm 2 công cụ mới cho bảng — **Thanh tìm kiếm** và **Bộ lọc** — tất cả chỉnh ngay trên
> giao diện, **không cần code, không cần restart server**.

**Nhóm:** Giao diện · Nút thao tác (Actions/UI)  ·  **Chạy trên:** /admin (classic) + /v/ (modern)  ·  **Phiên bản:** 0.1.0

## Sau khi cài, có gì mới?

Plugin **không thêm menu hay trang Settings** nào. Thay vào đó, khi bạn **bật chế độ chỉnh sửa giao diện
(UI Editor)** sẽ có thêm các lựa chọn mới:

- 🎨 **Trong ⚙ của mỗi nút**: thêm mục **“Kiểu nút”** — đặt màu nền/chữ/viền, màu khi rê chuột (hover),
  bóng đổ, bo góc, cỡ & màu icon, cỡ nút, và **ghim** nút về trái/phải.
- 📐 **Trong ⚙ của mỗi khối (form hoặc bảng)**: thêm mục **“Bố cục thanh nút”** — xếp nút ngang/dọc,
  căn trái/giữa/phải, giãn đều hai đầu…
- 🔍 **Trên bảng (Table)**: thêm được hành động **“Thanh tìm kiếm”** — ô tìm kiếm gõ tới đâu lọc tới đó.
- 🧰 **Trên bảng (Table)**: thêm được hành động **“Bộ lọc”** — các ô lọc nhanh theo cột dropdown/quan hệ/ngày.

## Cấu hình ở đâu?

Không có trang cấu hình riêng — **mọi thứ chỉnh tại chỗ**, sau khi bật **UI Editor** (nút bật/tắt chỉnh sửa
giao diện ở góc trên bên phải):

| Bạn muốn | Chỉnh ở đâu |
|---|---|
| Màu & kiểu **một nút** | Rê chuột vào nút → bấm ⚙ → **“Kiểu nút”** |
| **Bố cục thanh nút** của một khối | Rê chuột vào khối (form/bảng) → ⚙ của khối → **“Bố cục thanh nút”** |
| Thêm **Thanh tìm kiếm** cho bảng | Ở khu vực thanh nút của bảng → mở danh sách **thêm hành động** → **“Thanh tìm kiếm”** |
| Thêm **Bộ lọc** cho bảng | Ở khu vực thanh nút của bảng → mở danh sách **thêm hành động** → **“Bộ lọc”** |

> Chỉnh riêng cho **Thanh tìm kiếm / Bộ lọc**: sau khi thêm, rê chuột vào nó → bấm ⚙ để mở hộp cấu hình.

## Dùng thế nào (từng bước)

### Tình huống A — Đổi màu một nút (nền/chữ/viền/hover)

1. Bật **UI Editor**.
2. Rê chuột vào nút cần đổi → bấm **⚙** → chọn **“Kiểu nút”**.
3. Trong hộp thoại, có sẵn **“Nút mẫu”** để xem trước (💡 rê chuột lên nút mẫu để thấy màu hover). Chỉnh các mục:

   | Nhóm | Nhãn | Giá trị |
   |---|---|---|
   | Cỡ nút | **Cỡ nút** | Nhỏ · Vừa · Lớn |
   | Ghim | **Ghim nút** | Không · Ghim trái · Ghim phải |
   | Màu sắc | **Nền · Chữ · Viền · Đổ bóng · Nền hover · Chữ hover** | bảng chọn màu (để trống = giữ mặc định) |
   | Viền & icon | **Kiểu viền** (Liền/Đứt/Chấm) · **Độ dày viền** (1–3px) · **Bo góc** (Vuông/Bo tròn/Viên) · **Cỡ icon** (Nhỏ/Vừa/Lớn) · **Màu icon** | để trống = mặc định |

4. Bấm **“Lưu”**. ✅ Nút đổi màu ngay.

### Tình huống B — Xếp/căn lại thanh nút của một khối

1. Bật **UI Editor** → rê chuột vào **khối** (biểu mẫu Thêm/Sửa/Chi tiết, hoặc bảng) → ⚙ của khối → **“Bố cục thanh nút”**.
2. Chọn **Hướng**: **Ngang** hoặc **Dọc (xếp chồng)**.
3. Nếu **Ngang** → chọn **Sắp xếp**: Trái · Giữa · Phải · **Hai đầu** · **Đều** · **Lấp đầy**.
   Nếu **Dọc** → chọn **Căn chỉnh**: Trái · Giữa · Phải · **Toàn chiều rộng**.
4. Bấm **“Lưu”**. ✅
> 💡 Muốn “neo” một nút cụ thể về mép trái/phải của thanh? Mở ⚙ của **nút đó** → **“Kiểu nút”** → **Ghim nút** → **Ghim trái/Ghim phải**.

### Tình huống C — Thêm Thanh tìm kiếm cho bảng

1. Bật **UI Editor** → ở khu vực thanh nút của **bảng**, mở danh sách **thêm hành động** → chọn **“Thanh tìm kiếm”**.
2. Ô tìm kiếm hiện ra; rê chuột vào nó → ⚙ để tinh chỉnh:

   | Nhóm | Nhãn | Ý nghĩa |
   |---|---|---|
   | Dữ liệu | **Cột được tìm** | Mặc định **“Tất cả cột chữ”**; có thể chọn cột cụ thể (kể cả cột quan hệ 1 cấp, ví dụ `khách hàng → tên`) |
   | | **Kiểu khớp** | Chứa · Bắt đầu bằng · Khớp chính xác |
   | Hiển thị | **Độ rộng** (Hẹp/Vừa/Rộng) · **Gợi ý (placeholder)** · **Vị trí** (Trái/Phải) | vị trí ô trên thanh nút |
   | Icon | **Vị trí icon** (Trái/Phải) · **Khung icon** (Không/Viền/Lấp đầy) · **Màu icon** · **Màu khung** | |
   | Kiểu ô | **Kiểu** (Có viền/Nền đặc/Không viền) · **Hình dạng** (Vuông/Bo tròn/Viên) · **Màu nền** · **Màu chữ** | |

3. Bấm **“Lưu”**. ✅ Gõ vào ô là bảng tự lọc (gõ tới đâu lọc tới đó).

### Tình huống D — Thêm Bộ lọc nhanh cho bảng

1. Bật **UI Editor** → ở thanh nút của **bảng**, mở danh sách **thêm hành động** → chọn **“Bộ lọc”**.
2. Ban đầu nó hiện một ô gạch đứt gợi ý *“Chọn cột dropdown / ngày”*. Rê chuột vào → ⚙ để cấu hình:

   | Nhãn | Ý nghĩa |
   |---|---|
   | **Cột lọc** | Chọn các cột để lọc — **chỉ** cột kiểu **dropdown** (chọn/nhiều-chọn/radio), **quan hệ**, hoặc **ngày** |
   | **Mặc định & gợi ý theo cột** | Đặt **Giá trị mặc định** (lọc sẵn khi mở bảng) và **Gợi ý tùy chỉnh** cho từng cột |
   | **Độ rộng** | Hẹp · Vừa · Rộng |
   | **Vị trí** | Trái · Phải |

3. Bấm **“Lưu”**. ✅ Mỗi cột đã chọn thành một ô lọc: cột dropdown/quan hệ → chọn nhiều giá trị; cột ngày → chọn khoảng ngày.
> 💡 Ô ngày có sẵn các mốc nhanh: **Hôm nay · Hôm qua · 7 ngày qua · 30 ngày qua · Tháng này · Tháng trước · Năm nay**. Đặt một mốc làm **mặc định** thì mỗi lần mở bảng nó tự tính lại theo kỳ hiện tại.

## Mẹo & lưu ý

- ⚡ **Áp dụng ngay khi Lưu**, không cần restart. Đây là tùy biến **phía giao diện** (client) — không đụng dữ liệu.
- 🎨 Khi bạn đặt màu cho nút, nút sẽ dùng kiểu “mặc định” để màu bạn chọn phủ toàn bộ (nền/chữ/viền/hover đúng như xem trước).
- 🔍🧰 **Thanh tìm kiếm** và **Bộ lọc** dùng cho **bảng (Table)**. Chúng là hành động thật nên có thể **kéo đổi vị trí** và đặt **Trái/Phải** như các nút khác.
- **Bộ lọc** chỉ nhận cột **dropdown / quan hệ / ngày** — các cột chữ tự do hãy dùng **Thanh tìm kiếm**.
- Bỏ trống một ô màu/viền = **giữ mặc định** của giao diện (không ép kiểu).
- ✅ Chạy trên **cả hai** giao diện: classic `/admin` và modern `/v/`.

## Gỡ / tắt

- **Bỏ màu một nút:** mở ⚙ của nút → **“Kiểu nút”** → **xóa trống** các ô màu/viền bạn đã đặt → **Lưu**.
- **Bỏ bố cục thanh nút:** mở **“Bố cục thanh nút”** của khối, đưa về **Hướng: Ngang** với sắp xếp mặc định → **Lưu**.
- **Bỏ Thanh tìm kiếm / Bộ lọc:** rê chuột vào nó → ⚙ → xóa hành động (như xóa một nút bình thường).
- **Tắt hẳn plugin:** vào **Plugin Manager** tắt plugin — mọi tùy biến (màu nút, bố cục, thanh tìm kiếm/bộ lọc) sẽ **ngừng hiển thị**. Cấu hình đã lưu nằm trong **schema của trang**; bật lại plugin thì hiện lại.

---

### Cho nhà phát triển

Toàn bộ là tùy biến client trên **flow-engine** (không có tầng server): vá `ActionModel.renderButton`
(màu qua **component token** của antd `<ConfigProvider>`, vì antd bỏ qua CSS tiêm thẳng vào nút) + vá
`renderComponent` của các khối để bọc **`ActionBarLayout`**; **Thanh tìm kiếm** và **Bộ lọc** là hai
`ActionModel` con (scene `collection`) ghi vào **một filter-group** trên resource của khối
(`addFilterGroup` → `setPage(1)` → `refresh()`). Song ngữ Anh/Việt, dùng chung `@ptdl/shared`.
Chi tiết thiết kế: `docs/ACTION-ENHANCEMENTS-DESIGN.md`; bản tiếng Anh: `README.md`.
