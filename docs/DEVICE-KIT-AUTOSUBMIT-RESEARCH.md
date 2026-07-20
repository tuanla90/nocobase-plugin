# Device Kit — "Auto ghi nhận khi Submit" (nghiên cứu)

> Câu hỏi: khi bấm **Lưu/Submit** form thì **tự động lấy GPS** (và giờ/người) ghi vào bản ghi — không cần bấm 📍 tay.
> Trạng thái: 📝 **NGHIÊN CỨU (2026-07-16)** — khả thi cao, chưa code. Bổ sung cho `@tuanla90/plugin-device-kit`.

---

## 1. Kết luận: KHẢ THI (client-side, monkeypatch submit)

GPS là **browser API async** → **bắt buộc chặn submit lại vài giây** để lấy toạ độ rồi mới lưu. Không thể làm ở
server (server không có GPS). Vậy phải hook **client-side, ngay trước khi form gửi request**.

### Cơ chế NocoBase v2 (đã kiểm tra `@nocobase/client-v2`)
- Form dùng `CreateFormModel` / `EditFormModel` (đều `extends FormBlockModel`).
- Cả hai có method **`submit(params, cb)`** và **`submitHandler(ctx, params, cb)`** — đều **async (Promise)**.
  `submitHandler` = pipeline thật: validate → gom values từ `this.form` → gọi API create/update.
- `FormBlockModel` cung cấp **`this.form`** (antd FormInstance), **`setFieldValue(name, value)`**, **`setFieldsValue(values)`**.
- Nút Submit = `FormSubmitActionModel` → dispatch → gọi `model.submit()`.
- **KHÔNG có event `beforeSubmit`** công khai → dùng **monkeypatch** (đúng pattern nhà: conditional-format patch
  `TableBlockModel.getColumns`, detail-panel augment `openView`, menu-sections patch render — resolve class qua
  `flowEngine.getModelClass`).

### Điểm chèn (chốt)
Patch **`submitHandler`** trên `CreateFormModel` + `EditFormModel`:
```
const orig = Cls.prototype.submitHandler;
Cls.prototype.submitHandler = async function (ctx, params, cb) {
  await autoCaptureLocations(this);   // lấy GPS + setFieldValue TRƯỚC
  return orig.call(this, ctx, params, cb);   // rồi validate + gửi như native
};
```
Vì set value **trước** khi original validate/gom values → field `ptdlLocation` (kể cả **required**) sẽ có giá trị
đúng lúc submit. `submit()` gọi `submitHandler()` nên chỉ patch 1 chỗ, không nhân đôi.

`autoCaptureLocations(formModel)`:
1. Tìm các field `ptdlLocation` trong form đang bật cờ **auto-on-submit** (xem §2 cách đăng ký).
2. Với mỗi field (theo policy "chỉ khi trống" / "luôn cập nhật"): `await getCurrentFix({timeout, maximumAge})`
   → `formModel.setFieldValue(name, fix)`.
3. Lỗi quyền/timeout: nếu field đặt **bắt buộc** → `throw` (chặn lưu + báo lỗi); nếu không → bỏ qua, lưu bình thường.

---

## 2. Cấu hình cho user (đề xuất) — trên chính field "Vị trí (GPS)"

Thêm vào dialog "Cấu hình vị trí" một mục **"Tự động lấy khi Lưu"**:
- **Bật/tắt** `autoOnSubmit`.
- **Thời điểm:** `Chỉ khi trống` (không đè giá trị đã có — hợp cho sửa) | `Luôn cập nhật` (mỗi lần lưu ghi lại — hợp cho check-in).
- **Bắt buộc:** nếu không lấy được GPS → chặn lưu (mặc định OFF = lưu vẫn cho qua).

**Cách submit-patch biết field nào bật:** khi `PtdlLocationFieldModel` render với `autoOnSubmit`, nó **tự đăng ký
lên form block gần nhất** (walk `this.parent` tới `FormBlockModel`) vào một Set `formModel.__ptdlAutoLoc = {name, cfg}`.
Patch chỉ đọc Set đó (khỏi duyệt cả cây model). Field ẩn/không mount → không trong Set → bỏ qua.

---

## 3. UX & cạm bẫy (phải xử để không "khựng" khi lưu)

- **Quyền GPS + user gesture:** submit là 1 cú click → **được phép** bật prompt quyền lần đầu. Đã cấp rồi thì không hỏi lại.
- **Độ trễ:** đừng để submit treo 12s. Hai giảm nhẹ:
  - **Pre-warm:** khi form MỞ, gọi `getCurrentFix` ngầm 1 lần → cache; lúc submit dùng `maximumAge` (vd 30s) → lấy **tức thì**.
  - Submit dùng **timeout ngắn** (vd 6s); quá → theo policy (bỏ qua/lưu, hoặc báo "không lấy được vị trí").
  - Nút Submit tự hiện **loading** khi await (submit vốn async) → có phản hồi trực quan.
- **Chỉ /v/** (Create/Edit form model của lane hiện đại). Classic `/` dùng schema submit khác → v1 bỏ qua (guard).
- **Sub-form / popup:** popup tạo bản ghi cũng là Create/EditFormModel → patch phủ luôn (tốt cho "thêm nhanh + check-in").
- **QuickEdit (spreadsheet inline)** dùng `QuickEditFormModel` (submit riêng) → v1 KHÔNG phủ; thêm sau nếu cần.

---

## 4. Mở rộng "auto ghi nhận" (ngoài GPS)

| Muốn tự ghi khi lưu | Cách |
|---|---|
| **Vị trí GPS** | ⭐ submit-patch ở trên (client, async) — trọng tâm. |
| **Giờ tạo/sửa** | Đã có **native** `createdAt`/`updatedAt` — không cần plugin. |
| **Người tạo/sửa** | Đã có **native** `createdBy`/`updatedBy`. |
| **"Giờ check-in" riêng (khác updatedAt)** | submit-patch set thêm 1 field datetime = now (rẻ, đi kèm luôn). |
| **Ảnh** | KHÔNG auto được (chụp cần UI camera) — giữ thủ công (nút 📷). Có thể **bắt buộc chụp ≥1 ảnh trước khi lưu** (validate). |

→ Trọng tâm plugin = **GPS auto-on-submit**. Giờ/người dùng native. Có thể kèm option "giờ check-in" + "bắt buộc có ảnh".

---

## 5. Ước lượng & rủi ro

- **Code:** ~0.5–1 ngày. Thêm: submit-patch (resolve `CreateFormModel`/`EditFormModel` qua `getModelClass`, patch prototype,
  guard try/catch), self-register trên form model, 3 option config + pre-warm cache. Không đụng server.
- **Rủi ro thấp–trung:** (1) `submitHandler` gom values ở thời điểm nào — set value TRƯỚC khi gọi original là an toàn, nhưng
  cần verify trên form thật (create + edit + popup). (2) Độ trễ GPS — giải bằng pre-warm + maximumAge. (3) required-block phải
  báo lỗi rõ, không "nuốt" submit im lặng.
- **Verify:** phải test **live trên máy thật** (GPS + submit) — môi trường này không chạy được /v/.

---

## 6. Quyết định cần user chốt (trước khi code)

1. Cờ auto đặt **trên field Vị trí** (khuyến nghị, mỗi field tự quyết) hay **1 setting cấp form**?
2. Mặc định thời điểm: **Chỉ khi trống** hay **Luôn cập nhật** khi lưu?
3. Có cần option **bắt buộc** (không có GPS thì chặn lưu) không, hay luôn cho lưu?
4. Có làm kèm **"giờ check-in" (datetime)** + **"bắt buộc có ảnh"** trong đợt này không, hay chỉ GPS trước?
