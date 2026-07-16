# TEST-CHECKLIST — @ptdl/plugin-ai-column (kiểm thử TAY trên trình duyệt)

> Toàn bộ logic đã verify bằng API/eval-sim, nhưng **UI chưa ai bấm thử thật** (Chrome MCP hỏng lúc phát triển). Checklist này để bạn tick từng bước — trọng tâm là **render + tương tác UI**, thứ chưa được kiểm.
>
> Chuẩn bị: 1 LLM service Google (google-genai) đã cấu hình ở Settings → AI. Tạo 1 collection thử, vd `demo_ai`, với các field: `tieu_de` (Single line text), `tom_tat` (Long text), `anh` (Attachment), `giong_doc` (Attachment), `mau` (Single line text), `co_chu` (Checkbox). Đặt 1 Form block + 1 Table block cho `demo_ai` lên 1 page `/v/`.

## 0. Tiền đề
- [ ] Plugin `@ptdl/plugin-ai-column` **Enabled**; mở page `/v/` không có lỗi "Script error".
- [ ] Console trình duyệt in `[ai-column] client-v2 ... loaded ... image + voice ...` (F12 → Console).

## 1. AI input (sinh chữ)
- [ ] Form block → gear field `tieu_de` → **Field component** → thấy & chọn **"AI input"**.
- [ ] Gear field `tieu_de` giờ có **nhóm "AI"** → mở → dialog hiện: service, model, Output type, Prompt (có **＋ Chèn cột**), System, Trigger.
- [ ] Bấm **＋ Chèn cột** → xổ cây field; field quan hệ có mũi tên `→`, mở ra drill sâu được; chọn field lá → chèn `{{...}}` vào prompt.
- [ ] Nhập prompt (vd `Viết tiêu đề hấp dẫn cho: {{tom_tat}}`) → Save dialog.
- [ ] Ô `tieu_de` hiện nút **✨** → nhập `tom_tat` → bấm ✨ → tiêu đề tự điền. Kiểm rồi Save record.
- [ ] Output **Number**: đổi Output type = Number, prompt "đếm số từ trong {{tom_tat}}" → ✨ ra **số** (không phải chữ).
- [ ] Output **Single select** + Options → ✨ ra đúng 1 option.

## 2. AI textarea (chữ dài / markdown)
- [ ] Field `tom_tat` → Field component → **"AI textarea"** → cấu hình → ✨ ra đoạn dài.
- [ ] Nếu `tom_tat` là field **Markdown** → kết quả GIỮ định dạng `**đậm**`; nếu Long text thường → bị strip sạch (không còn `**`).

## 3. AI extract (đọc file → nhiều field)
- [ ] Field `anh` (Attachment) → Field component → **"AI extract"**.
- [ ] Nhóm "AI" → dialog: service/model, System, Prompt, **bảng "Fields to extract"**.
- [ ] "+ Thêm field" → chọn `mau` → tag hiện "văn bản"; chọn `co_chu` → tag "đúng/sai".
- [ ] Upload 1 ảnh vào `anh` → bấm ✨ → `mau`/`co_chu` tự điền (đúng kiểu: `co_chu` là checkbox tick/không).
- [ ] **PDF:** upload 1 PDF có chữ → map field text → ✨ → ra nội dung.
- [ ] **Audio (STT):** upload 1 file ghi âm → map 1 field text (prompt "phiên âm") → ✨ → ra bản phiên âm.

## 4. AI image (sinh ảnh)
- [ ] Field `anh` → Field component → **"AI image"** → dialog: service, **Image model**, Prompt.
- [ ] Prompt (vd "logo con mèo phẳng, nền trắng") → Save → ✨ (tím) → ảnh sinh ra hiện trong field. Save record → ảnh còn đó.

## 5. AI voice (TTS) — ⚠️ chỗ hay bị lạc
- [ ] Field `giong_doc` (Attachment) → gear → **Field component** → chọn **"AI voice"**.
- [ ] Gear field `giong_doc` → nhóm **"AI"** → dialog hiện: **TTS model**, **Voice** (dropdown 30 giọng), **Phong cách/cảm xúc/tốc độ**, **🔊 Nghe thử**, **Text cần đọc**.
- [ ] Ô **Voice**: gõ `nữ` → lọc còn giọng nữ; gõ `nam` → giọng nam. Chọn 1 giọng.
- [ ] Ô **Phong cách**: gõ "chậm rãi, trầm ấm" → **🔊 Nghe thử** → giọng đọc chậm/trầm hơn; đổi thành "vui vẻ, nhanh" → nghe thử → khác rõ. (Xác nhận chỉ dẫn KHÔNG bị đọc thành tiếng.)
- [ ] Bấm **🔊 Nghe thử** → **nghe được** câu mẫu bằng giọng đang chọn (cần loa; trình duyệt có thể chặn autoplay → bấm lần 2).
- [ ] Nhập Text (vd `Chào {{tieu_de}}`) → Save → ✨ (xanh teal) → file .wav vào field, phát nghe được.

## 6. Bulk (hàng loạt) — Table block
- [ ] Table block của `demo_ai` → **Configure actions** (toolbar trên) → thấy **"Bulk AI Generate"**, **"Bulk AI Extract"**, **"Bulk AI Image"**, **"Bulk AI Voice"**.
- [ ] Thêm "Bulk AI Generate" → gear của nút → cấu hình field đích + prompt → Save.
- [ ] Tick 2–3 dòng → bấm nút → confirm → chạy → các dòng được điền; báo "X thành công".
- [ ] Bulk AI Extract: chọn field ảnh nguồn + map field → tick dòng có ảnh → chạy → điền.
- [ ] **Bulk AI Image:** gear → chọn field đích `anh` + prompt (vd "logo tối giản {{tieu_de}}") → tick vài dòng → chạy → mỗi dòng có ảnh. (Ảnh gọi quota image, thường còn.)
- [ ] **Bulk AI Voice:** gear → field đích `giong_doc` + chọn giọng + text → tick dòng → chạy → mỗi dòng có .wav. (⚠️ dễ đụng quota TTS 429.)

## 7. Trigger tự động
- [ ] **onDepChange:** AI input, Trigger chọn "khi field nguồn thay đổi" → sửa field nguồn trong form → sau ~1s tự sinh lại.
- [ ] **onAttachChange:** AI extract, Trigger "khi tệp thay đổi" → upload file mới → tự trích.
- [ ] **onServerUpdate (SERVER):** AI input/extract, Trigger chọn **"Server: khi record tạo/cập nhật..."** → Save cấu hình. Rồi **cập nhật record đó KHÔNG qua form** (vd 1 automation NocoBase sửa field nguồn, hoặc gọi API) → sau vài giây field AI tự điền. (Đã test end-to-end bằng API.)
- [ ] **onServerUpdate cho ẢNH/VOICE:** field `anh` (AI image) hoặc `giong_doc` (AI voice) → dialog "AI" → ô **"Tự chạy (trigger)"** chọn "Server: tự sinh khi record tạo/cập nhật" → Save. Rồi tạo/sửa record qua automation/API → field media tự sinh. (**Ảnh đã verify end-to-end**; voice cùng code path, chỉ kẹt quota TTS.)

## 8. Classic /admin (nếu dùng form Formily cũ)
- [ ] `/admin` → Form Formily cổ điển → field text → gear → **"Chuyển sang AI input/textarea"** → cấu hình "AI generation" → ✨ chạy.
- [ ] Field Attachment → **"Chuyển sang AI Extract"** → chạy.
- [ ] Field Attachment → **"Chuyển sang AI Image"** → nhóm "AI" → prompt → ✨ (tím) → ảnh vào field.
- [ ] Field Attachment → **"Chuyển sang AI Voice"** → nhóm "AI" → chọn giọng + text + 🔊 Nghe thử → ✨ (teal) → .wav vào field.
- [ ] (Bulk trên bảng Formily CỔ ĐIỂN thuần chưa có — nhưng bảng flow-engine đặt trên /admin thì bulk vẫn chạy.)

## 9. Nâng cấp production (cost control / img2img / log lỗi)
- [ ] **img2img:** field `anh` (AI image) → dialog → **"Ảnh nguồn để SỬA"** chọn field ảnh (vd chính `anh` hoặc field ảnh khác) → prompt "xóa nền, giữ chủ thể" → upload 1 ảnh vào field nguồn → ✨ → ra ảnh ĐÃ SỬA (không phải ảnh mới ngẫu nhiên). Để trống ô nguồn → ✨ sinh ảnh mới như cũ.
- [ ] **onlyWhenEmpty:** AI input, mục "Điều kiện chạy" → tick "Chỉ chạy khi field đích trống" + Trigger Server → record đã có giá trị field đó → update record → KHÔNG sinh lại (giữ nguyên).
- [ ] **Điều kiện field:** mục "Điều kiện chạy" → "Chỉ chạy khi [status] [= bằng] [new]" + Trigger Server → update record có status≠new → KHÔNG chạy; status=new → chạy.
- [ ] **Log lỗi:** tạo 1 block **Table** trên collection `ptdlAiAutorunLog` (hoặc gọi API `ptdlAiColumn:autorunErrors`) → khi autorun server lỗi (vd hết quota, config sai) → thấy dòng lỗi (collection/field/kind/message). Không còn "im lặng".
- [ ] **Cache (tùy chọn):** bulk generate 1 cột phân loại trên nhiều dòng có input giống nhau → nhanh hơn nhiều lần chạy đầu (các dòng trùng lấy từ cache, không tốn token).

## Lỗi hay gặp khi test
- Không thấy option trong Field component → field sai loại (voice/image/extract chỉ trên Attachment), hoặc plugin chưa build đủ 3 lane.
- ✨ báo "apiClient chưa sẵn sàng" → reload trang.
- Media 429 → hết quota Google.
- Nghe thử không ra tiếng → kiểm loa + autoplay của trình duyệt (bấm lại).

---
Ghi lại bug tìm được (field nào, bước nào, hiện tượng) để sửa.
