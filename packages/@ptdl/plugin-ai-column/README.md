# @ptdl/plugin-ai-column

AI vào thẳng **field** của NocoBase — kiểu "AI column" của Airtable, nhưng phủ nhiều modality: sinh chữ, đọc tài liệu/ảnh/PDF/audio ra field có kiểu, sinh ảnh, sinh giọng nói (TTS), chuyển giọng nói thành chữ (STT), làm hàng loạt, và tự chạy phía server khi dữ liệu tới qua automation/API.

> **Điểm vào của MỌI tính năng là "Field component".** Bạn KHÔNG tìm thấy nút AI ở đâu cho tới khi đổi 1 field sang component AI. Xem mục [Bắt đầu](#bắt-đầu) — đặc biệt nếu bạn "không biết chọn voice ở đâu".

---

## Yêu cầu

- **`@nocobase/plugin-ai`** bật + đã cấu hình ít nhất 1 **LLM service** (Settings → AI). Không có service thì không sinh được gì.
- **Ảnh + STT/đọc-audio** hiện chỉ chạy với service **Google (google-genai)**. **Voice (TTS)** hỗ trợ **Google / ElevenLabs / Vbee**. Sinh/đọc **chữ** dùng được mọi provider của plugin-ai.
- **`@nocobase/plugin-file-manager`** + (tùy chọn) **`@nocobase/plugin-field-attachment-url`** cho các tính năng dính file.

---

## Bắt đầu

Mọi thứ bắt đầu từ **cài đặt field → "Field component"**:

1. Vào 1 block Form (hoặc Table) ở `/v/` (hoặc /admin).
2. Bấm ⚙ (gear) trên field muốn gắn AI.
3. Chọn **"Field component"** → chọn component AI phù hợp (xem bảng dưới).
4. Sau khi đổi, gear của field xuất hiện thêm **nhóm cài đặt "AI"** → mở ra để cấu hình (service, model, prompt, …).

| Loại field | Chọn "Field component" | Làm được |
| --- | --- | --- |
| Single line text | **AI input** | Sinh/tóm tắt/phân loại/chấm điểm → điền chính field đó |
| Long text / Markdown | **AI textarea** | Như trên, nội dung dài; giữ markdown nếu field là Markdown |
| Attachment / Attachment URL | **AI extract** | Đọc ảnh/PDF/DOC/**audio** trong field → điền các field KHÁC (OCR, chấm điểm, phiên âm) |
| Attachment / Attachment URL | **AI image** | Sinh ẢNH từ prompt → điền vào chính field đó (có trigger server-autorun) |
| Attachment / Attachment URL | **AI voice** | Sinh GIỌNG NÓI (TTS) từ text → file .wav vào chính field đó (có trigger server-autorun) |

> **"Chọn voice ở đâu?"** → field Attachment → gear → **Field component → "AI voice"** → mở nhóm **"AI"** vừa hiện → dialog có: **TTS model**, **Voice** (30 giọng, gõ `nam`/`nữ` để lọc), nút **🔊 Nghe thử**, và ô **Text cần đọc**. Nếu "AI voice" KHÔNG hiện trong danh sách Field component → báo lỗi (xem [Sự cố](#sự-cố)).

---

## Các tính năng

### AI input / AI textarea — sinh chữ vào field
- Cấu hình: **LLM service + model**, **Output type** (Text / Number / Single select), **Mẫu prompt** (chọn nhanh: Tóm tắt / Viết lại chuyên nghiệp / Dịch / Phân loại cảm xúc / Trích từ khóa…), **Prompt** (có nút **＋ Chèn cột** để chèn `{{ten_field}}`, drill sâu qua quan hệ), **System prompt**, **Trigger**.
- Bấm nút **✨** để chạy; giá trị điền vào field, kiểm rồi Save.
- Output **Number/Single select** được ép đúng kiểu (số thật / đúng 1 option).

### AI extract — đọc file → nhiều field
- Gắn vào field Attachment (chứa **ảnh/PDF/DOC/audio**). Cấu hình prompt + **bảng "Fields to extract"** (chọn field đích; kiểu number/bool/enum tự nhận từ field).
- Bấm **✨** → đọc file → điền các field đã map. Dùng cho: OCR hóa đơn/CCCD, **chấm điểm CV/cuộc gọi**, **phiên âm audio (STT)**.

### AI image — sinh ảnh (+ SỬA ảnh / img2img)
- Field Attachment → "AI image". Cấu hình service + **image model** (mặc định `gemini-2.5-flash-image`) + prompt.
- **Sửa ảnh (img2img):** chọn **"Ảnh nguồn để SỬA"** = 1 field ảnh (kể cả chính field đó) → prompt mô tả cách sửa (vd *"xóa nền"*, *"đổi sang tông ấm"*, *"thêm logo góc phải"*) → ✨ sẽ EDIT ảnh nguồn thay vì sinh mới. Để trống = sinh ảnh mới từ prompt.
- **Mẫu prompt dựng sẵn:** ô **"Mẫu prompt"** đầu dialog — chọn nhanh: *Logo tối giản, Ảnh sản phẩm nền trắng, Icon phẳng* (sinh mới) hoặc *Xóa nền, Nâng nét HD, Đổi nền trắng, Phong cách hoạt hình, Sáng & tương phản đẹp* (chỉnh sửa). Chọn mẫu chỉnh sửa sẽ **tự đặt ảnh nguồn = chính field** → chỉ cần có ảnh sẵn trong field rồi bấm ✨.

### AI voice — sinh giọng nói (TTS) — 3 nhà cung cấp
- Field Attachment → "AI voice" → chọn **Provider**: **Google (Gemini)** / **ElevenLabs** / **Vbee**.
- **Google (Gemini):** chọn **TTS model** + **Voice** (30 giọng, nhãn nam/nữ) + ô **Phong cách/cảm xúc/tốc độ** (gõ chữ vd *"chậm rãi, trầm ấm"* — Gemini không có tham số SỐ cho speed/pitch, chỉ mô tả bằng chữ). Dùng key từ llmServices (google-genai). File ra `.wav`.
- **ElevenLabs:** chọn **Credential** (cấu hình ở collection `ptdlVoiceProvider`) + dán **Voice ID** (từ dashboard ElevenLabs) + **model** (`eleven_multilingual_v2` tốt cho tiếng Việt). File ra `.mp3`.
- **Vbee (giọng Việt):** chọn **Credential** + **voice_code** (gõ/chọn, vd `hn_male_manhdung_news_48k-fhg`) + **tốc độ** (vd `0.95`). Vbee gọi bất đồng bộ (poll ~3–20s). File ra `.mp3`.
- Nút **🔊 Nghe thử** hoạt động cho cả 3 provider.

> **Cấu hình key ElevenLabs / Vbee:** thêm 1 bản ghi vào collection **`ptdlVoiceProvider`** (hoặc gọi action `ptdlAiColumn:setVoiceProvider`): ElevenLabs cần `{name, provider:"elevenlabs", apiKey}`; Vbee cần `{name, provider:"vbee", appId, token}` (tạo App ID+Token ở https://api.vbee.vn/apps). Secret KHÔNG lộ ra client (picker chỉ trả tên).

### Bulk (hàng loạt) — action trên bảng
- Trong Table block: **Configure actions** → **"Bulk AI Generate"** / **"Bulk AI Extract"** / **"Bulk AI Image"** / **"Bulk AI Voice"** (cùng nhóm với "Delete").
- Tick nhiều dòng → cấu hình (field đích + prompt; voice thêm giọng/phong cách) → chạy 1 lượt cho tất cả. Có retry khi bị rate-limit + cảnh báo khi chọn nhiều dòng. Media (ảnh/voice) chạy pool nhỏ hơn (2) vì nặng + dễ rate-limit.

### Trigger tự động
- **Client (trong form):** `onOpenEmpty` (mở form & ô trống), `onDepChange` (field nguồn đổi), `onAttachChange` (file đổi). CHỈ chạy khi mở form.
- **Server (`onServerUpdate`):** chạy khi record được **tạo/cập nhật từ BẤT KỲ nguồn** — automation, API, bulk — không cần mở form. Áp cho **cả 4 loại: generate, extract, sinh ảnh, sinh voice**. Với ảnh/voice: mở dialog cấu hình field → chọn trigger **"Server: tự sinh khi record tạo/cập nhật"**. Dùng cho: tự OCR/chấm điểm/phiên âm/sinh ảnh/đọc-thành-giọng khi dữ liệu được đẩy vào qua automation.

### Kiểm soát chi phí (cost control)
- **Điều kiện chạy** (mục *"Điều kiện chạy"* trong dialog): **Chỉ chạy khi field đích trống** (không sinh lại nếu đã có) + **điều kiện field** (vd chỉ chấm lead khi `status = new`). Chỉ áp cho trigger Server.
- **Cache dedup:** kết quả sinh CHỮ giống hệt (cùng service/model/prompt) được tái dùng trong 1 giờ → bulk phân loại 1000 dòng mà input ít giá trị (vd 5 trạng thái) chỉ gọi ~5 lần. Response có `cached:true` khi trúng cache.
- **Throttle:** autorun đổ dồn (automation/import tạo hàng loạt record) được xếp **hàng đợi concurrency 3**, gộp theo record → không cháy quota vì bùng nổ.

### Theo dõi lỗi autorun
- Autorun chạy phía server **không còn thất bại trong im lặng**: mỗi lần lỗi ghi vào collection ẩn **`ptdlAiAutorunLog`** (dựng 1 block bảng trên nó để xem) + truy vấn nhanh qua action `ptdlAiColumn:autorunErrors` (`{collectionName?, limit?}`). Log tự dọn sau 14 ngày.

---

## Ghi chú kiến trúc (cho dev)

- Server action: `ptdlAiColumn:generate` / `:extract` / `:generateImage` / `:generateVoice` (+ `:setAutorun` / `:removeAutorun`). Text đi qua `@nocobase/plugin-ai` (đa provider); media gọi thẳng REST Google (google-genai) vì plugin-ai reuse là chat-only.
- Server-autorun: config lưu ở collection ẩn `ptdlAiAutorun`; hook `afterCreate/afterUpdateWithAssociations` chạy AI **sau commit**, ghi kết quả với `hooks:false` (chống lặp vô hạn).
- 3 lane: `client` (classic /admin) + `client-v2` (/v/) + `server`. Cả 3 phải build & cài (thiếu marker `client.js`/`client-v2.js` → /v/ vỡ "Script error").

---

## Giới hạn hiện tại

- **Ảnh + STT = Google only** (voice thì đã đa provider Google/ElevenLabs/Vbee; text đa provider).
- **Quota:** free-tier dễ cạn (nhất là TTS). Có retry rate-limit nhưng không giải quyết hết quota.
- **Chưa làm:** sinh **video** (Veo); **bulk trên bảng Formily CỔ ĐIỂN thuần** (bulk hiện chạy ở table flow-engine, kể cả khi đặt trên trang /admin — chỉ bảng Formily pre-flow-engine là chưa có; cân nhắc vì per-record classic đã có + /v/ bulk đã đủ); **media vẫn Google-only** (chưa đa provider cho ảnh/voice/STT).
- **Đã bổ sung (2026-07-12):** bulk ảnh/voice; server-autorun ảnh/voice; classic Formily cho image/voice; **img2img (sửa ảnh)**; **cost control** (điều kiện chạy + cache dedup + throttle queue); **log lỗi autorun** (`ptdlAiAutorunLog`). img2img source picker hiện chỉ ở /v/ (classic giữ text→image).
- **UI chưa được kiểm thử tay đầy đủ** — xem [TEST-CHECKLIST.md](./TEST-CHECKLIST.md). Server-autorun **ảnh** đã test end-to-end (tạo record → sinh ảnh tự động); voice dùng chung code path (chỉ kẹt quota TTS).

## Sự cố

- **Không thấy "AI voice"/"AI xxx" trong Field component:** kiểm tra plugin đã enabled + đã build đủ 3 lane + đúng loại interface (AI voice/image/extract chỉ hiện trên field Attachment/Attachment URL).
- **Lỗi "No LLM service configured":** vào Settings → AI thêm service + API key.
- **Media báo lỗi 429 / quota:** hết quota Google free-tier — chờ reset theo ngày hoặc nâng billing.
- **Media báo "cần Google service":** tính năng media chỉ chạy với service `google-genai`.
