# Cột AI — Hướng dẫn sử dụng

> Đưa AI vào thẳng **cột dữ liệu** kiểu Airtable: sinh chữ, đọc ảnh/PDF/audio (OCR/STT),
> phân loại theo một bảng danh mục, biến **một tài liệu thành nhiều dòng** trong bảng con,
> tạo ảnh và đọc thành **giọng nói** (TTS) — làm lẻ từng ô, làm **hàng loạt**, hoặc **tự chạy khi lưu**.

**Nhóm:** Trường (Fields) · AI · **Chạy trên:** /admin (classic) + /v/ (modern) · **Phiên bản:** 0.7.2

> ⚙ **Cần chuẩn bị trước (nếu không có, sẽ không sinh được gì):**
> - Bật **`@nocobase/plugin-ai`** và thêm ít nhất **1 LLM service** ở **Settings → AI**.
> - **Đọc file** (trích xuất/nhiều dòng/ảnh) cần **`@nocobase/plugin-file-manager`** (và tùy chọn **`@nocobase/plugin-field-attachment-url`**).
> - **Sinh chữ / phân loại** dùng **mọi provider** của plugin-ai. Nhưng **sinh ảnh** và **đọc audio (STT)** hiện **chỉ chạy với Google (google-genai)**. **Giọng nói (TTS)** hỗ trợ **Google / ElevenLabs / Vbee**.

## Sau khi cài, có gì mới?

- 🔑 **Điểm vào của MỌI tính năng là "Field component".** Bạn sẽ **không thấy nút AI ở đâu cả** cho tới khi đổi 1 field sang một component AI (bấm ⚙ trên field → **Field component**). Đây là điều quan trọng nhất cần nhớ.
- **8 kiểu Field component mới** (tùy loại field): **AI nhập**, **AI văn bản**, **AI trích xuất**, **AI trích nhiều dòng**, **AI phân loại**, **AI phân loại chuyên sâu**, **AI ảnh**, **AI giọng nói**.
- **Nút ✨ ngay trên ô**: sau khi đổi component, mỗi field AI có nút ✨ để chạy thủ công, và một **nhóm cài đặt "AI"** trong gear để cấu hình (service, model, prompt, trigger…).
- **Hành động hàng loạt trên bảng** (trong *Configure actions*): **Sinh AI hàng loạt**, **Trích xuất AI hàng loạt**, **Tạo ảnh AI hàng loạt**, **Tạo giọng AI hàng loạt**, **Phân loại AI hàng loạt**, **Trích nhiều dòng AI hàng loạt** — chạy 1 lượt cho nhiều dòng đã tick.
- **Nút AI theo từng bản ghi**: **AI Function** (trên thanh hành động của bản ghi) và **AI điền hộ** (trong biểu mẫu) — 1 nút làm được mọi việc AI cho bản ghi hiện tại.
- **Tự chạy phía server**: AI có thể **tự chạy khi record được tạo/cập nhật** từ automation / API / import / bulk — không cần mở form.
- **Một trang Settings mới**: **"Nhà cung cấp AI"** — chỉ để (a) khai **credential giọng nói ElevenLabs / Vbee** và (b) **quản lý chỉ mục vector** cho AI phân loại. Việc cấu hình sinh/đọc/phân loại thường ngày vẫn nằm ngay trên field.

## Cấu hình ở đâu?

Có **2 nơi**, và nơi bạn dùng nhiều nhất là **ngay trên chính field**:

| Cần chỉnh gì | Vào đâu |
|---|---|
| **Bật AI cho 1 cột + prompt/model/trigger** *(hay dùng nhất)* | Bấm ⚙ trên field → **Field component** → chọn component AI → mở lại ⚙ → nhóm **AI** |
| **Credential giọng nói (ElevenLabs / Vbee)** | **/v/** ⚙ Settings → **"Nhà cung cấp AI"** → thẻ **"Giọng đọc (TTS)"** · (classic: `/admin/settings/ptdl-ai-provider`) |
| **Chỉ mục vector cho AI phân loại** | Cùng trang **"Nhà cung cấp AI"** → thẻ **"Đối chiếu / Embedding"** |
| **LLM service + API key** (của plugin-ai, không thuộc plugin này) | **Settings → AI** |

## Dùng thế nào (từng bước)

> ✅ **Luôn bắt đầu như nhau:** vào 1 block **Form** hoặc **Table** ở `/v/` (hoặc /admin) → bật **UI Editor** → bấm ⚙ trên field muốn gắn AI → **Field component** → chọn component AI (bảng dưới). Sau đó mở lại ⚙ → nhóm **AI** để cấu hình.

**Chọn component nào cho loại field nào:**

| Loại field | Chọn "Field component" | Làm được |
|---|---|---|
| Văn bản 1 dòng (input/email/url/phone) | **AI nhập** | Sinh / tóm tắt / dịch / phân loại / chấm điểm → điền **chính ô đó** |
| Văn bản dài / Markdown | **AI văn bản** | Như trên nhưng nội dung dài; giữ markdown |
| Đính kèm (ảnh/PDF/DOC/**audio**) | **AI trích xuất** | Đọc file → điền **nhiều field khác** (OCR hoá đơn/CCCD, chấm CV, **phiên âm audio**) |
| Đính kèm **hoặc** Văn bản dài | **AI trích nhiều dòng** | 1 tài liệu → **N dòng** vào một **bảng con** (quan hệ 1-nhiều) |
| Văn bản 1 dòng | **AI phân loại** | Đối chiếu giá trị với **1 bảng master** (danh mục) → ghi **mã** khớp nhất |
| Văn bản 1 dòng **hoặc** Quan hệ (n-1) | **AI phân loại chuyên sâu** | Như trên + **chấm điểm & giải thích** từng ứng viên; field quan hệ thì gán thẳng **FK** |
| Đính kèm | **AI ảnh** | Sinh ảnh từ prompt **hoặc sửa ảnh** (img2img: xoá nền, đổi tông…) |
| Đính kèm | **AI giọng nói** | Đọc text thành **giọng nói** (TTS) → file audio vào ô đó |

### Tình huống A — Sinh chữ vào một ô (AI nhập / AI văn bản)

1. Đổi field văn bản sang **AI nhập** (hoặc **AI văn bản** cho nội dung dài).
2. Mở ⚙ → nhóm **AI**: chọn **Dịch vụ LLM** + **Model**, chọn **Kiểu kết quả** (**Text** / **Number** / **Single select**).
3. Viết **Prompt**. Muốn chèn giá trị cột khác thì dùng **nút chèn cột** để chèn `{{ten_field}}` (khỏi phải nhớ tên); hoặc chọn nhanh một **Mẫu prompt** (Tóm tắt / Viết lại chuyên nghiệp / Dịch / Phân loại cảm xúc / Trích từ khóa…).
4. Bấm **✨** để chạy → kiểm tra giá trị → **Save**. Nếu chọn **Number** / **Single select**, kết quả được **ép đúng kiểu** (số thật / đúng 1 option).

### Tình huống B — Đọc ảnh / PDF / audio → điền nhiều field (AI trích xuất)

1. Đổi field **Đính kèm** (chứa ảnh/PDF/DOC/audio) sang **AI trích xuất**.
2. Mở ⚙ → nhóm **AI**: viết mô tả cần đọc, rồi ở bảng **Các field cần trích xuất** bấm **+ Thêm field** để chọn các field đích cần điền (kiểu số/đúng-sai/enum **tự nhận** theo field).
3. Tải file lên field → bấm **✨** → AI đọc file và điền các field đã map → kiểm tra → **Save**.
> 💡 Dùng cho: OCR hoá đơn/CCCD, **chấm điểm CV/cuộc gọi**, **phiên âm audio (STT)** (audio hiện chỉ chạy với Google).

### Tình huống C — Phân loại theo một bảng danh mục (AI phân loại)

1. Đổi field mã (vd *Mã HS*, *Mã SP*) sang **AI phân loại** (hoặc **AI phân loại chuyên sâu** nếu cần chấm điểm + giải thích).
2. Mở ⚙ → nhóm **AI**: chọn **Bảng master** (danh mục để đối chiếu), khai **Nội dung cần đối chiếu** (các cột của bản ghi hiện tại) và **Giá trị ghi vào field** (cột mã của master).
3. Lần đầu, bấm **Embed master** để xây **chỉ mục vector** (về sau quản lý ở Settings → **Nhà cung cấp AI** → **Đối chiếu / Embedding**).
4. Bấm **✨** → AI hiện danh sách ứng viên gần nhất → **Chọn** đáp án → mã được ghi vào ô. Có thể đặt tự chọn nếu điểm ≥ ngưỡng.

### Tình huống D — Một tài liệu → nhiều dòng bảng con (AI trích nhiều dòng)

1. Đổi field **Đính kèm** (hoặc **Văn bản dài** dán nội dung) sang **AI trích nhiều dòng**.
2. Mở ⚙ → nhóm **AI**: chọn **Bảng con nhận dòng** (quan hệ 1-nhiều của bản ghi), rồi **+ Thêm field** để khai **Các field của mỗi dòng**; chọn **Cách ghi**: **Thêm vào (append)** hay **Thay thế (replace)**.
3. Bấm **✨** → AI tách tài liệu (vd báo giá → các dòng hàng) và đổ vào bảng con → kiểm tra → **Save**.

### Tình huống E — Sinh ảnh / sửa ảnh (AI ảnh)

1. Đổi field **Đính kèm** sang **AI ảnh**. Mở ⚙ → nhóm **AI**: chọn **Model ảnh** (mặc định `gemini-2.5-flash-image`) + viết **Prompt**.
2. **Sinh mới:** để trống ô **Ảnh nguồn để SỬA** → prompt mô tả ảnh cần tạo → **✨**.
3. **Sửa ảnh (img2img):** chọn **Ảnh nguồn để SỬA** = một field ảnh (kể cả chính field) → prompt mô tả cách sửa (*"xoá nền"*, *"đổi nền trắng"*, *"tông ấm"*) → **✨**. Hoặc chọn nhanh một **Mẫu prompt (sinh mới / chỉnh sửa)** — chọn mẫu chỉnh sửa sẽ tự đặt ảnh nguồn = chính field.

### Tình huống F — Đọc thành giọng nói (AI giọng nói) — *"chọn voice ở đâu?"*

1. Đổi field **Đính kèm** sang **AI giọng nói** → mở ⚙ → nhóm **AI**.
2. Chọn **Nhà cung cấp giọng (Provider)**: **Google (Gemini TTS)** / **ElevenLabs** / **Vbee (giọng Việt)**.
   - **Google:** chọn **Model TTS** + **Giọng đọc** (30 giọng — gõ `nam`/`nữ` để lọc) + ô **Phong cách / cảm xúc / tốc độ** (mô tả bằng chữ, vd *"chậm rãi, trầm ấm"*).
   - **ElevenLabs / Vbee:** chọn **Credential** (khai trước ở Settings, xem dưới) + dán **Voice ID / voice_code**.
3. Điền **Text cần đọc** (chèn cột được), bấm **🔊 Nghe thử** để nghe trước, rồi **✨** để tạo file → **Save**.
> 💡 **Khai credential ElevenLabs / Vbee** ở **Settings → "Nhà cung cấp AI" → thẻ "Giọng đọc (TTS)"**: thêm 1 credential rồi quay lại field chọn Provider + credential đó. Google **không** cần khai ở đây (dùng LLM service ở Settings → AI). Khoá bí mật chỉ ghi vào, **không hiển thị lại**.

### Tình huống G — Làm hàng loạt cho nhiều dòng (bulk)

1. Trong 1 **Table block**, bật **Configure actions** → thêm hành động AI cần dùng (**Sinh AI hàng loạt** / **Trích xuất AI hàng loạt** / **Tạo ảnh AI hàng loạt** / **Tạo giọng AI hàng loạt** / **Phân loại AI hàng loạt** / **Trích nhiều dòng AI hàng loạt**).
2. Mở ⚙ của nút để cấu hình (field đích + prompt; voice thêm giọng/phong cách).
3. **Tick nhiều dòng** → bấm nút → chạy 1 lượt. Có **thử lại** khi bị giới hạn tốc độ; dòng lỗi báo riêng để chạy lại sau.
> ⚠️ Giá trị hiện tại của field đích sẽ **bị ghi đè** cho các dòng đã chọn.

### Tình huống H — Một nút AI theo từng bản ghi (AI Function)

1. Bật **UI Editor** → ở thanh hành động của bản ghi (hoặc trong biểu mẫu) thêm nút **AI Function** (trong biểu mẫu tên là **AI điền hộ**).
2. Mở ⚙ → chọn **Việc cần làm**: *Sinh nội dung*, *Trích xuất*, *Phân loại*, *Tạo nhiều dòng*, *Tạo ảnh*, *Đọc thành giọng nói (TTS)*, hoặc *Chép lời từ audio (STT)* — rồi cấu hình field/prompt tương ứng.
3. Bấm nút trên 1 bản ghi để chạy đúng việc đó cho bản ghi hiện tại.

### Tình huống I — Tự chạy phía server khi lưu (auto-run)

1. Trong cấu hình field (hoặc nút bulk), tìm mục trigger **"Tự sinh khi"** → chọn **"Server: khi record được tạo/cập nhật (cả automation/API/bulk)"**.
2. Để tiết kiệm chi phí, mở **Điều kiện chạy (tiết kiệm chi phí)**: bật **"Chỉ chạy khi field đích đang trống"** và/hoặc thêm điều kiện field (vd chỉ chấm khi `status = new`).
3. Từ giờ, mỗi khi record được tạo/cập nhật từ **automation / API / import / bulk**, AI **tự chạy** — không cần mở form. Áp cho cả 4 loại: sinh chữ, trích xuất, sinh ảnh, sinh giọng.

## Mẹo & lưu ý

- 🔑 **Không thấy nút AI?** Bạn chưa đổi field sang một **Field component** AI. Đó là điểm vào duy nhất. Nếu component AI **không hiện** trong danh sách: kiểm tra plugin đã bật + đúng loại field (AI trích xuất/ảnh/giọng nói chỉ hiện trên field **Đính kèm**).
- ⚠️ **Bulk / auto-run ghi đè** giá trị field đích. Cân nhắc bật **"Chỉ chạy khi field đích đang trống"** để không sinh lại cái đã có.
- 💰 **Tiết kiệm chi phí sẵn có:** kết quả **sinh chữ giống hệt** (cùng service/model/prompt) được **tái dùng trong 1 giờ** (phân loại 1000 dòng mà chỉ có vài giá trị → chỉ gọi vài lần); auto-run đổ dồn được xếp **hàng đợi** để không cháy quota.
- 🎙️ **Giới hạn provider:** **sinh ảnh** và **đọc audio (STT)** hiện **chỉ Google (google-genai)**; **giọng nói (TTS)** thì đủ **Google / ElevenLabs / Vbee**; **sinh/đọc chữ** dùng **mọi provider**.
- 🔢 **Hết quota (lỗi 429):** free-tier của Google dễ cạn, nhất là TTS — chờ reset theo ngày hoặc nâng billing. Plugin có tự thử lại khi rate-limit nhưng không giải quyết được hết quota.
- 🩺 **Auto-run lỗi không còn im lặng:** mỗi lần lỗi được ghi vào collection ẩn **`ptdlAiAutorunLog`** (dựng 1 block bảng trên nó để xem; tự dọn sau 14 ngày).
- Chạy được trên **cả hai** giao diện: classic `/admin` và modern `/v/`. Đụng tầng server (auto-run, collection ẩn) nên **bật/tắt plugin cần khởi động lại server**.

## Gỡ / tắt

- **Tắt một tính năng lẻ:** đổi Field component của field **về kiểu thường** (vd *Chuyển về Input thường*), hoặc bỏ trigger **"Tự sinh khi"** về **"(để trống = chỉ bấm ✨ thủ công)"**. Dữ liệu đã sinh vẫn còn.
- **Gỡ hẳn:** tắt plugin trong **Plugin Manager**. Các field AI trở lại component thường; dữ liệu đã sinh (chữ, ảnh, audio, dòng con) **vẫn nằm trong bản ghi**. Credential giọng nói và chỉ mục vector vẫn còn trong CSDL (các collection `ptdlVoiceProvider`, `ptdlClassifyEmbed`…) nếu bật lại sau.

---

### Cho nhà phát triển

Server action: `ptdlAiColumn:generate` / `:extract` / `:generateImage` / `:generateVoice` (+ `:setAutorun` / `:removeAutorun` / `:setVoiceProvider` / `:autorunErrors`). Sinh chữ đi qua `@nocobase/plugin-ai` (đa provider); media gọi thẳng REST Google. Auto-run lưu config ở collection ẩn `ptdlAiAutorun`, hook `afterCreate/afterUpdateWithAssociations` chạy sau commit + ghi lại với `hooks:false` (chống lặp vô hạn); lỗi vào `ptdlAiAutorunLog` (tự dọn 14 ngày). Credential giọng nói ở `ptdlVoiceProvider` (secret write-only); chỉ mục phân loại ở `ptdlClassifyEmbed` / `ptdlClassifyConfig` (+ log quyết định `ptdlClassifyDecisionLog`). 3 lane phải build & cài đủ (`client` + `client-v2` + `server`) — thiếu marker → /v/ vỡ "Script error". Chi tiết & giới hạn: xem `README.md` (tiếng Anh) và `TEST-CHECKLIST.md`.
