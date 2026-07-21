# Kéo giãn cột (resize cột bảng) — Hướng dẫn sử dụng

> Kéo **mép phải** của tiêu đề bất kỳ cột nào để làm cột rộng ra hay hẹp lại. Độ rộng được **lưu theo từng
> block** (mọi người thấy cùng một bố cục, giống hệt tính năng *Column width* có sẵn của NocoBase). Chỉ cần
> bật lên — **không cần code**.

**Nhóm:** Blocks · **Chạy trên:** **chỉ /v/ (modern)** — không phải /admin (classic) · **Phiên bản:** 0.1.1

## Sau khi cài, có gì mới?

- **Một tay nắm kéo trên mỗi tiêu đề cột** trong bảng `/v/` — rê chuột vào mép phải của tiêu đề, con trỏ
  chuyển thành ↔, kéo để đặt độ rộng. **Live**: bảng tự dàn lại ngay khi bạn kéo, cột co/giãn đúng như
  tính năng gốc.
- Hoạt động với **bảng trang** (Table block) **và cả sub-table** trong form thêm/sửa.
- **Độ rộng lưu theo từng block / từng field sub-table** và chia sẻ cho mọi người — y như *Column width* có
  sẵn. Giữ nguyên sau khi reload.
- **Không thêm** menu, trang Settings, field hay collection nào. Thuần UI — không đụng tới server.

## Cách dùng

1. Bật **UI editor** (nút góc phải trên). Độ rộng chỉ chỉnh được ở chế độ edit, nên người dùng thường không
   vô tình đổi bố cục chung.
2. Rê chuột vào **mép phải** tiêu đề cột cho tới khi con trỏ thành ↔.
3. **Kéo** trái/phải để chỉnh; thả ra là lưu. Độ rộng được lưu vào block đó và hiển thị cho mọi người.

## Yêu cầu & giới hạn

- **Chỉ client `/v/` (modern).** Trên client cổ điển `/admin`, plugin là no-op (không làm gì).
- **Chỉ chỉnh được khi bật UI editor** — khi tắt editor, cột vẫn hiển thị đúng độ rộng đã lưu nhưng không
  kéo được (người xem thường thấy bố cục, không đổi được).
- Độ rộng cột tối thiểu **56px**.
- Độ rộng **chia sẻ chung, không theo từng người** — đã lưu là bố cục của block cho tất cả (giống *Column
  width* gốc).
- **An toàn khi lỗi:** nếu có trục trặc, plugin tự lặng lẽ trở về bảng thường — không bao giờ làm trắng trang.
