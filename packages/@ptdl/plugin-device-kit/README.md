# @ptdl/plugin-device-kit

Dùng phần cứng thiết bị (điện thoại/tablet qua trình duyệt hoặc PWA) để nhập liệu hiện trường trong NocoBase.

**v0.1.0 — P1a:** Chụp ảnh tại chỗ + watermark + lưu metadata GPS · Field type Định vị GPS.
Quét QR/barcode (P1b) và check-in action + chữ ký/ghi âm (P2) làm sau.

> **Điều kiện bắt buộc: HTTPS.** Camera (`getUserMedia`) và GPS (`getCurrentPosition`) chỉ chạy trên trang
> HTTPS (hoặc `localhost`). Host trên **Railway** đã có HTTPS sẵn → mở URL production trên điện thoại là dùng được.

---

## Tính năng

### 1. Field "Chụp ảnh (camera)" — trên field đính kèm (attachment)

Subclass `UploadFieldModel` của plugin-file-manager nên **value/preview/submit giữ nguyên native** — chỉ thêm nút **📷 Chụp ảnh**.

- **2 cách chụp** (settings → *Cách chụp*):
  - **Trong app** (mặc định): mở camera bằng `getUserMedia` ngay trong app, **ép chụp ảnh sống** (không cho chọn từ thư viện) → bằng chứng hiện trường. Có nút đổi camera trước/sau, chụp lại, và "Từ máy" (dự phòng).
  - **Camera hệ thống**: mở app camera của điện thoại (`<input capture>`).
- **Watermark — BẬT mặc định** (đóng dấu thẳng vào pixel, vì canvas làm mất EXIF): giờ chụp · toạ độ GPS · người chụp (`nickname`) · dòng chữ thêm tuỳ chọn; chọn được góc (4 góc).
- **Lưu metadata GPS vào field**: settings → *Lưu toạ độ vào field* → chọn 1 field (nên là field **Vị trí (GPS)**). Khi chụp, toạ độ được ghi luôn vào field đó (`{lat,lng,accuracy,ts,src}`).
- **Nén trước khi tải lên**: kích thước tối đa (1280/1600/1920/gốc) + chất lượng JPEG → tiết kiệm 4G. Tải lên qua action `attachments:create` sẵn có.

**Dùng:** field đính kèm → ⚙ **Field component → Chụp ảnh (camera)** → mở ⚙ lần nữa để **Cấu hình chụp ảnh**.

### 2. Field type "Vị trí (GPS)" — `ptdlLocation`

Kiểu field mới, hiện trong **Add field → nhóm "Thiết bị"**. Lưu bằng dbType `json`: `{lat, lng, accuracy, ts, src, address?}`. **Không cần API key bản đồ.**

- **Nhập:** nút **📍 Lấy vị trí** → `getCurrentPosition` (độ chính xác cao) → hiện toạ độ + chấm màu theo ngưỡng độ chính xác + link Google Maps. Có **nhập tay / dán link Google Maps** (tự parse).
- **Hiển thị (bảng/chi tiết):** pill 📍 `lat, lng (±m)`, click mở Google Maps tab mới. Tuỳ chọn **nhúng bản đồ OSM** (không key) trong chi tiết.
- **Settings:** độ chính xác cao on/off · hiện ±m · ngưỡng màu (tốt ≤ / khá ≤) · nhúng bản đồ.

> **Dự phòng:** nếu vì lý do build mà field type mới không hiện trong Add field, vẫn dùng được bằng cách tạo field **JSON** rồi ⚙ **Field component → Vị trí (GPS)** (widget bind cả interface `json`).

---

## Cài đặt (Railway / nb-local — upload qua UI)

1. Build: `cd build-env && bash recipes/run-device-kit-build.sh && bash recipes/add-markers.sh storage/tar/@ptdl/plugin-device-kit-0.1.0.tgz`
   (tgz đã build sẵn: `latest/@ptdl/plugin-device-kit-0.1.0.tgz`).
2. NocoBase → **Plugin Manager (góc phải trên) → Add & Update → Upload plugin** → chọn `.tgz` → **Submit** → **Enable**.
3. **Ctrl+Shift+R** (hard refresh).

**Yêu cầu:** plugin **File manager** đã bật (camera widget subclass `UploadFieldModel` của nó).

> **Nâng cấp về sau:** tăng `version` trong `package.json` mỗi lần build mới để NocoBase coi là update.
> **Nếu upload báo 403:** proxy nuốt header `X-Role: root` — xem `docs/NOCOBASE-PLUGIN-BUILD-GUIDE.md` §2.

---

## Kỹ thuật (tóm tắt)

- **Client-only** (server no-op). 2 lane: `/v/` (chính, có custom field interface) + classic `/` (bind widget vào `json`/`attachment`, không đăng ký interface vì classic không export `CollectionFieldInterface`).
- `src/shared/`: `geo.ts` (getCurrentFix/parse/format) · `watermark.ts` (canvas + burn watermark + nén→blob) · `cameraModal.tsx` (modal getUserMedia) · `cameraFieldModel.tsx` (subclass UploadFieldModel) · `locationField.tsx` (interface + editable + display) · `user.ts` (auth:check cache) · `registerAll.tsx` (wiring + i18n) · `i18n.ts`.
- i18n: VN-source (chuỗi VN làm key + `locale/en-US.json` cho tiếng Anh); dùng `@ptdl/shared` settings-kit.
- Mọi khâu đăng ký đều **guard try/catch** — 1 phần lỗi không kéo sập phần khác.
