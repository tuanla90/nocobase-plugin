# Mẫu trang hướng dẫn người dùng (User Guide) cho plugin @ptdl

Tài liệu này là **khuôn** để viết trang hướng dẫn *người dùng cuối* cho mỗi plugin —
kiểu "cài cái này thì có gì thay đổi, chỉnh ở đâu, hover vào đâu ra lựa chọn gì".

## Đặt ở đâu → NocoBase tự hiển thị

- Ghi thành **`README.vi-VN.md`** (bản tiếng Việt) và **`README.md`** (bản tiếng Anh) ở **thư mục gốc của package**
  (`packages/@ptdl/plugin-<x>/`).
- NocoBase phục vụ tĩnh tại `/static/plugins/<packageName>/<file>` và render trong
  **Plugin Manager (`/admin/pm/list`) → bấm plugin → "More details"**.
  Hàm `getExposeReadmeUrl(pkg, lang)` **ưu tiên `README.vi-VN.md`**, fallback `README.md`.
- `CHANGELOG.md` → tab changelog. `homepage` (trong `package.json`) → nút link ngoài.
- **Ảnh**: để file trong package (vd `./docs/img/foo.png`) và trỏ đường dẫn tương đối — cùng base `/static/plugins/<pkg>/…` nên vẫn hiển thị.
  Muốn chắc chắn không lệ thuộc đóng gói: nhúng ảnh dạng data-URI, hoặc để guide thiên về chữ + bảng + emoji.

> **Doc kỹ thuật ≠ guide người dùng.** Kiến trúc/build/ACL vẫn để trong `docs/*.md` của workspace
> (hoặc cuối README dưới mục "Cho nhà phát triển"). README người dùng thì tập trung *dùng thế nào*.

## Triển khai lên nb-local (không cần build lại)

README không phải file biên dịch → chỉ cần chép file vào **cả hai** chỗ plugin đã cài rồi hard-refresh:
`nb-local/node_modules/@ptdl/plugin-<x>/README.vi-VN.md` **và** `nb-local/storage/plugins/@ptdl/plugin-<x>/README.vi-VN.md`.
(Lần đóng gói `.tgz` kế tiếp nhớ để README ở gốc package để đi kèm.)

---

## Cấu trúc chuẩn (giữ đúng các mục, đúng thứ tự)

```markdown
# <Tên plugin tiếng Việt> — Hướng dẫn sử dụng

> Một câu: plugin này làm gì, cho ai.

**Nhóm:** <Fields/Blocks/UI/…>  ·  **Chạy trên:** /admin (classic) + /v/ (modern)  ·  **Phiên bản:** x.y.z

## Sau khi cài, có gì mới?
Liệt kê những thứ **xuất hiện thêm** ngay sau khi bật plugin — để người dùng biết cần nhìn đâu:
- Menu / trang mới: …
- Nút / hành động mới trong block: …
- Kiểu field / kiểu hiển thị mới: …
- Mục mới trong Settings: …

## Cấu hình ở đâu?
- Trang cấu hình (nếu có): **/v/ → ⚙ Settings → “<Tên>”** (classic: `/admin/settings/<key>`).
- Nếu không có trang riêng: nói rõ chỉnh ngay trên block/field.

## Dùng thế nào (từng bước)
### Tình huống A — <ví dụ cụ thể>
1. Vào <view/trang> …
2. Bật UI Editor → bấm vào <cột/field/khối> …
3. Mở ⚙ (bánh răng) → chọn **“<Tên lựa chọn>”** …
4. Chỉnh <tham số> → **Lưu**.
> 💡 Ảnh minh hoạ: `./docs/img/<ten>.png`

### Tình huống B — …

## Mẹo & lưu ý
- Mặc định bật sẵn hay phải chọn tay? Ảnh hưởng tới field kiểu nào?
- Chạy được ở classic và /v/ không?
- Cần restart server không (nếu đụng tầng server)?

## Gỡ / tắt
- Tắt plugin trong **Plugin Manager**. Cấu hình/dữ liệu đã lưu **còn hay mất**, phục hồi ra sao.

---

### Cho nhà phát triển (tuỳ chọn, để cuối)
Link tới `docs/<DESIGN>.md`, ghi chú build, giới hạn đã biết…
```

## Quy ước viết
- **Song ngữ bắt buộc** (theo chuẩn @ptdl): luôn có `README.vi-VN.md` **và** `README.md`.
- Xưng hô thân thiện, câu ngắn, mỗi bước 1 hành động. Dùng **in đậm** cho nhãn nút/menu đúng như trên UI.
- Ưu tiên **bảng** cho ánh xạ kiểu-field → widget, và **emoji mốc** (💡 mẹo, ⚠️ lưu ý, ✅ kết quả).
- Tên nút/menu phải khớp bản dịch trong `src/locale/*.json` của chính plugin.
