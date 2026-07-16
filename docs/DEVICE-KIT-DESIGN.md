# DEVICE KIT — thiết kế đề xuất `@ptdl/plugin-device-kit`

> **Mục tiêu:** dùng **full power của thiết bị** (điện thoại/tablet chạy NocoBase qua trình duyệt/PWA) cho nhập liệu
> hiện trường kiểu AppSheet: **quét QR/barcode · chụp ảnh tại chỗ · định vị GPS · chữ ký · ghi âm**.
> Mở rộng từ PLAN.md #5 (QR Scanner) thành 1 plugin "Device Kit" duy nhất.
> Trạng thái: 🔨 **P1a ĐÃ BUILD v0.1.0** (2026-07-16) — camera+watermark+metadata + field GPS `ptdlLocation`; tgz
> `latest/@ptdl/plugin-device-kit-0.1.0.tgz` sẵn sàng upload qua Plugin Manager UI; **CHỜ user test trên điện thoại
> thật qua Railway**. Target NocoBase 2.1.19, lane chính `/v/`. Chi tiết cài + tính năng: plugin README.md.
>
> **Quyết định user (2026-07-16):**
> 1. **Ưu tiên #1 = B Chụp ảnh + watermark + tự lưu metadata** (camera-first, không phải POS/QR).
> 2. Production host **Railway** (vd `https://nocobasenocobaselatest-production-b504.up.railway.app`) → **HTTPS sẵn**, rủi ro TLS biến mất; test điện thoại = mở thẳng URL Railway.
> 3. **Watermark + metadata: BẬT mặc định** ("chụp kèm watermark và lưu field metadata luôn").
> 4. **GPS: TỰ LÀM field type riêng `ptdlLocation`** — KHÔNG bind field `point` của plugin-map (user đã bật plugin map nhưng không thấy/không ưng field lat-long native; point của map nấp dưới group "Map-based geometry" trong Add field và picker/display đòi API key AMap/Google → bỏ, không phụ thuộc).

---

## 1. Kết quả nghiên cứu (native NocoBase 2.1.19 + workspace)

### 1.1 NocoBase có sẵn gì (đã kiểm tra trong `nb-local/node_modules/@nocobase`)

| Thứ | Có gì | Dùng lại được? |
|---|---|---|
| **`plugin-block-workbench`** | Action "Scan QR code" trong block Action panel, **cả lane client-v2** (`ActionPanelScanActionModel`, `components/qrcode-scanner/useScanner`). Lib = **`html5-qrcode` ^2.3.8** (bundle sẵn zxing). Hành vi: quét → coi kết quả là URL → **navigate**. | **Tham khảo pattern** (viewfinder + scan file ảnh). KHÔNG tái dùng trực tiếp được cho "quét → điền field / lookup record" — nó chỉ điều hướng, và scoped trong Action panel. Chọn cùng lib `html5-qrcode` cho đồng bộ. |
| **`plugin-map`** | Field interface `point/lineString/polygon/circle` + client-v2 models đầy đủ (`PointFieldModel`, `DisplayPointFieldModel`…), có gọi `getCurrentPosition` trong picker. Lane v2 đăng ký qua `app.addFieldInterfaces(...)` + `app.addFieldInterfaceGroups({map:{label:'Map-based geometry',order:300}})` → field point CÓ trong Add field nhưng nấp dưới group đó. Provider = **AMap (Gaode) + Google** — cả hai **cần API key**. | **KHÔNG dùng (user chốt).** Picker/display đòi key, UX không ưng → Device Kit **tự làm field type `ptdlLocation`** (xem §2C). Chỉ mượn plugin-map làm **mẫu code** cho việc đăng ký field interface + group riêng ở lane v2. |
| **`plugin-file-manager`** | Client-v2 có **`UploadFieldModel extends FieldModel`** (có `set customRequest(fn)`) + `uploadFieldUtils`. API upload `attachments:create` (branding đã dùng để upload logo). | **Subclass `UploadFieldModel`** cho widget "Chụp ảnh" (pattern y hệt subtable-pro subclass `SubTableFieldModel`) — giữ nguyên plumbing value/submit/preview native, chỉ thêm nguồn ảnh = camera. |
| **`plugin-mobile`** | **Deprecated ở 2.x** ("replaced by the new ui-layout plugin, still under development"). | Bỏ qua. Mobile của mình = **`/v/` responsive + `@ptdl/plugin-pwa`** (đã live 0.4.1) — đúng hướng đang đi. |
| **antd 5** | Có sẵn component **`<QRCode>`** (@rc-component/qrcode). | **Sinh/hiển thị QR = 0 KB bundle** — widget "QR của bản ghi" gần như miễn phí. |

### 1.2 Tài sản workspace ăn khớp

- **PLAN.md #5 QR Scanner** — đã dự tính từ đầu (client-only, html5-qrcode, rủi ro thấp–trung). Doc này thay thế/mở rộng.
- **`plugin-pwa` 0.4.1** — app cài được lên màn hình chính → Device Kit là "phần ruột" cho PWA đó.
- **`plugin-subtable-pro` 0.2.6** — bridge pub/sub "thêm vào giỏ" theo key → **quét barcode → add-to-cart POS** chỉ là 1 publisher mới.
- **`plugin-detail-panel` 0.1.0** — quét mã → mở record trong **side panel** (mode `sidePanel` qua `dispatchEvent('click', {mode, filterByTk})`).
- **`plugin-ai-column` 0.3.x** — đọc ảnh/audio → field (multi-row extract, STT) → **chụp hoá đơn tại chỗ → AI bóc thành dòng**; ghi âm → STT.
- **`plugin-print-template`** — in tem/nhãn: sinh QR per-record (antd QRCode) → in → dán → quét lại = **khép vòng asset/kho**.
- **`plugin-formula` window/scan mode** — quét kho vào `stock_movements` → tồn kho/giá vốn tự chạy.
- **`@ptdl/shared` + settings-kit + i18n R1/R2** — bắt buộc dùng như mọi plugin (bilingual en+vi, SettingsGrid/CollapsibleSection/ColorField/FieldPickerCascader).

### 1.3 Ràng buộc nền tảng (quan trọng — đọc trước khi code)

1. **HTTPS bắt buộc** cho `getUserMedia` (camera) + `geolocation` (Chrome chặn trên HTTP). ✅ **ĐÃ THOẢ:** production host **Railway** → HTTPS mặc định (`*.up.railway.app`) → test máy thật = mở thẳng URL Railway trên điện thoại. Dev nb-local (`localhost`) được trình duyệt miễn secure-context trên desktop; muốn test nb-local bằng điện thoại mới cần tunnel (cloudflared/tailscale) — không bắt buộc, có Railway rồi.
   - **Deploy lên Railway = quy trình chuẩn sẵn có** (NOCOBASE-PLUGIN-BUILD-GUIDE.md): build tgz + `add-markers.sh` → Plugin Manager → **Add & Update → Upload plugin → Submit → Enable** (`pm:add`). Gotcha đã ghi trong guide: **bump version mỗi lần build** để NocoBase coi là update (§7), và **403 khi upload sau proxy Railway** = mất header `X-Role: root` (guide §2 mục 403 — check DevTools Network). Railway chạy Linux → không dính lỗi symlink EPERM của Windows.
2. **iOS Safari:** `getUserMedia` phải khởi động từ user gesture; `<input capture>` chỉ là *hint* (iOS vẫn cho chọn từ thư viện) → muốn **ép "chụp tại chỗ"** thật sự phải dùng mode getUserMedia in-app. html5-qrcode chạy iOS ≥ 14.3.
3. **BarcodeDetector API** native (nhanh, đỡ CPU) chỉ có Chrome/Android ổn định — html5-qrcode có cờ `useBarCodeDetectorIfSupported: true` → bật để tự dùng native khi có, fallback zxing khi không.
4. **Quyền bị từ chối** (camera/GPS denied) là trạng thái thường gặp → mọi widget phải có UI hướng dẫn mở lại quyền (vi/en), không được trắng/treo.
5. Canvas re-encode ảnh sẽ **mất EXIF** (kể cả GPS EXIF) → muốn "bằng chứng hiện trường" thì **đóng dấu watermark vào pixel** + lưu meta ra field riêng, đừng trông vào EXIF.
6. Lane: làm **`/v/` trước** (field model + action model v2); classic `/` chỉ port phần rẻ (RunJS/None) — cùng chính sách như detail-panel/subtable-pro.

---

## 2. Giải pháp đề xuất — 1 plugin `@ptdl/plugin-device-kit`

**Vì sao 1 plugin:** cùng nhóm "device capabilities", dùng chung modal camera + permission UX + i18n; registry đang chuộng gộp (menu-enhancements, layout-containers). Tên hiển thị: **"Device Kit (QR · Camera · GPS)" / vi "Thiết bị: quét mã · chụp ảnh · định vị"**. Client-only (server lane no-op) — mọi ghi dữ liệu qua API sẵn có (`attachments:create`, `resource.update`).

### A. Quét QR / Barcode (P1)

**A1. Field widget "Scan input"** — bind `['input','integer','number','sequence','uuid','nanoid']`, `isDefault:false` ("Field component → Quét mã").
- Input thường + nút 📷 (suffix) → mở modal viewfinder (html5-qrcode) → decode → điền value → đóng. Hỗ trợ cả **quét từ ảnh** (chọn file — pattern `startScanFile` của workbench) cho máy không camera.
- Config (settings-kit dialog): formats (QR / EAN-13 / Code128 / tất cả) · beep+rung khi trúng (Vibration API) · regex validate/transform (cắt prefix) · auto-submit form sau khi quét (tuỳ chọn).

**A2. Action "Quét mã → tìm bản ghi" (scan-to-lookup)** — action block-level trên Table (và Workbench-style đứng riêng):
- Quét → tìm record theo **field cấu hình** (FieldPickerCascader, hỗ trợ dot-path) → tuỳ chọn kết quả:
  1. **Mở record** — drawer / dialog / **side panel** (bridge detail-panel nếu có, degrade drawer nếu không);
  2. **Publish vào giỏ subtable-pro** (bus key như "Thêm vào giỏ") → **POS: quét liên tục, mỗi phát +1 vào giỏ**;
  3. Không thấy → tuỳ chọn "mở form tạo mới, điền sẵn mã vào field X".
- **Continuous mode**: không đóng modal, dedupe cùng mã trong 2s, đếm số lần quét — dành cho kiểm kho/soát vé.

**A3. Display widget "QR của bản ghi"** (P2, gần free) — bind display các field text: render antd `<QRCode>` từ template token `{{field}}` (chuẩn @ptdl, vd `{{code}}` hoặc URL deep-link `/v/...?filterByTk={{id}}`), size/level config. Kết hợp print-template để in tem.

**Lib:** `html5-qrcode` ^2.3.8 (đúng version NocoBase pin) — **dep thật, bundle** (~320KB min, tương tự tiền lệ ag-grid/echarts), lazy-load khi mở modal lần đầu (dynamic import → không phình first-load).

### B. Chụp ảnh tại chỗ ⭐ **ƯU TIÊN #1 (user chốt)**

**Widget "Camera" trên interface `attachment`** — `PtdlCameraFieldModel extends UploadFieldModel` (file-manager, client-v2), `isDefault:false` → giữ nguyên value shape/submit/preview native, thêm nút "📷 Chụp ảnh".
- **2 nguồn (config):**
  - `Nhanh (native)`: `<input type="file" accept="image/*" capture="environment">` — mở app camera hệ thống, zero-risk, mọi máy. iOS không ép được "cấm chọn thư viện".
  - `Tại chỗ (in-app)` **(mặc định)**: modal getUserMedia (facing back/front, đèn flash nếu có) → canvas chụp → **ép ảnh sống**, không cho chọn từ gallery. Đây là mode "bằng chứng hiện trường".
- **Xử lý ảnh trước upload:** resize max-dimension (config 1280/1920/gốc) + JPEG quality (0.7 mặc định) qua canvas `toBlob` → tiết kiệm 4G hiện trường; upload qua `customRequest` → `attachments:create` (plumbing native của UploadFieldModel).
- **Watermark — BẬT MẶC ĐỊNH (user chốt):** đóng dấu vào pixel — **giờ chụp + toạ độ GPS + tên user (currentUser.nickname) + text tuỳ ý** (template `{{field}}`), góc chọn được (mặc định dưới-trái, nền mờ đen chữ trắng, 2 dòng: `16/07/2026 14:32 · Nguyễn A` / `10.7769, 106.7009 (±12m)`). Flow chụp: mở modal → xin GPS song song (không chặn nếu bị từ chối → watermark bỏ dòng toạ độ) → chụp → preview có watermark → "Dùng ảnh này / Chụp lại".
- **Metadata tự lưu — BẬT MẶC ĐỊNH (user chốt):** cùng lúc upload, tự ghi meta vào record (vì EXIF mất sau canvas):
  - **Cách 1 (khuyến nghị): 1 field "Vị trí" `ptdlLocation`** (§C) — nhét trọn `{lat,lng,accuracy,ts,src:'camera'}` 1 phát, config chỉ cần chọn 1 field.
  - **Cách 2: map từng cột** — lat→fieldA, lng→fieldB, time→fieldC (FieldPickerCascader), cho collection đã có sẵn cột số.
  - Trong form: set qua form values (submit chung); ngoài form (detail/table): `resource.update` sau upload.
- Multi-shot: chụp liên tiếp N tấm trong 1 phiên (attachment multiple).
- **Synergy:** cột AI (ai-column) đọc ảnh vừa chụp → bóc số liệu (công tơ, hoá đơn → N dòng sub-table).

### C. Định vị GPS — **field type riêng `ptdlLocation`, TỰ LÀM 100%** (user chốt, không dùng point của map)

**C1. Field interface mới "Vị trí (GPS)"** — đăng ký như plugin-map lane v2: `app.addFieldInterfaces([PtdlLocationInterface])` + `app.addFieldInterfaceGroups({ptdlDevice:{label:'Thiết bị',order:310}})` → Add field hiện group **"Thiết bị" → "Vị trí (GPS)"**. (Tiền lệ nội bộ: formula từng làm `PtdlWindowFieldInterface` — cơ chế đã chạy, sau bỏ vì lý do sản phẩm chứ không phải kỹ thuật.)
- **Kiểu lưu: `json`** (dbType native của NocoBase, không cần server code): `{lat, lng, accuracy, ts, address?, src}` — `src` = `'gps' | 'camera' | 'manual'`. 1 field chứa trọn bộ, khỏi map 3-4 cột; vẫn để Cách-2 (map từng cột) ở widget B cho ai muốn cột số rời để filter/aggregate.
- **Editable widget (`PtdlLocationFieldModel`):** nút "📍 Lấy vị trí" → `getCurrentPosition({enableHighAccuracy:true, timeout:10s})` → hiện `lat, lng ±accuracy m` + chấm màu theo ngưỡng (config, vd xanh ≤25m / vàng ≤100m / đỏ hơn) + nút thử lại + nhập tay (paste "lat,lng" hoặc dán link Google Maps → tự parse). Permission denied → hướng dẫn mở quyền (vi/en), không treo.
- **Display widget (`PtdlLocationDisplayModel`):** pill 📍 `10.7769, 106.7009 (±12m)` + giờ; click → mở `https://maps.google.com/?q=lat,lng` tab mới — **không cần bất kỳ API key nào**. Tuỳ chọn (config) nhúng bản đồ nhỏ qua iframe OSM embed (free, không key) trong detail. Trong bảng: pill gọn 1 dòng.
- Field height chuẩn antd 24/32 (feedback control-height).

**C2. Action "Check-in"** — action button trên form/table/workbench: 1 chạm ghi `{lat,lng,accuracy,ts,src:'gps'}` vào field `ptdlLocation` cấu hình sẵn của record hiện tại (`resource.update`) — chấm công hiện trường, xác nhận viếng thăm khách hàng. Tuỳ chọn kèm **bắt buộc chụp 1 ảnh** (gọi modal của widget B) → "đến nơi + ảnh + toạ độ" trong 1 nút.
- Auto-capture khi mở form tạo mới (config per-field): form load → điền sẵn vị trí (không chặn nếu user từ chối quyền).
- Reverse geocode (toạ độ → địa chỉ chữ, ghi `address`) **tuỳ chọn** qua Nominatim (free, rate-limit) — P2.

### D. P2+ — vắt nốt "full power"

| Tính năng | API | Đánh giá |
|---|---|---|
| **Chữ ký (signature pad)** | canvas thuần (không cần device API) | Rẻ, nhu cầu cao (xác nhận giao hàng/nghiệm thu) → PNG → `attachments:create`. Nên làm ngay sau P1. |
| **Ghi âm note** | `MediaRecorder` → attachment | Rẻ; chain ai-column STT → ra text. |
| **NFC đọc tag** | WebNFC | Chỉ Android/Chrome → niche, làm khi có case thật. |
| **Web Share / share-target** | PWA manifest | Nhét vào plugin-pwa (nhận ảnh share từ app khác vào form) — để sau. |
| **Push notification** | Web Push (cần server VAPID) | Khác hẳn scope (server + subscription) → plugin riêng, KHÔNG gộp. |
| **Offline queue** | Service worker + IndexedDB | Nặng (conflict, sync) → ghi nhận, chưa làm. |

---

## 3. Kiến trúc kỹ thuật (theo pattern nhà)

```
@ptdl/plugin-device-kit
 ├─ src/shared/
 │   ├─ scanModal.tsx        # modal viewfinder html5-qrcode (lazy import), dùng chung A1/A2
 │   ├─ cameraModal.tsx      # modal getUserMedia + canvas + watermark + nén, dùng chung B/C2
 │   ├─ geo.ts               # getPosition wrapper (timeout, accuracy, permission UX)
 │   ├─ cameraFieldModel.tsx # B   PtdlCameraFieldModel extends UploadFieldModel (file-manager) ⭐ P1a
 │   ├─ locationField.tsx    # C1  PtdlLocationInterface (json) + PtdlLocationFieldModel + DisplayModel ⭐ P1a
 │   ├─ checkinAction.tsx    # C2  action model (v2) — memory reference_nocobase_v2_action_models
 │   ├─ scanInputModel.tsx   # A1  PtdlScanInputFieldModel extends FieldModel (P1b)
 │   ├─ scanLookupAction.tsx # A2  (P1b)
 │   └─ i18n.ts              # NS @ptdl/plugin-device-kit/client, en+vi (R1)
 ├─ src/client/ + src/client-v2/   # registerAll per-lane (pattern field-enhancements registerAllFieldModels)
 └─ src/server/               # no-op Plugin (main entry)
```

- **Bind interface:** camera/scan = `bindModelToInterface` `isDefault:false` trên interface có sẵn (attachment/input…) — user tự chọn "Field component" (như Button group/Value tag). Model resolve base qua `flowEngine.getModelClass` (UploadFieldModel của file-manager — nhớ bẫy build-env=stubs, resolve runtime).
- **Field interface mới (`ptdlLocation`):** `app.addFieldInterfaces` + `addFieldInterfaceGroups` (mẫu = plugin-map client-v2); dbType `json` → server core xử lý native, plugin vẫn client-only; model editable/display của mình `isDefault:true` cho interface này.
- **Config dialogs:** settings-kit (SettingsGrid/CollapsibleSection/SEG_PROPS + live preview); field mapping dùng `FieldPickerCascader`; template token `{{field}}` chuẩn @ptdl.
- **Build:** recipe mới `run-device-kit-build.sh`; `html5-qrcode` cài THẬT trong build-env (dep bundle như ag-grid); antd QRCode = external sẵn. **add-markers bắt buộc** (bẫy cũ). Deploy nb-local như thường lệ.
- **ACL/an toàn:** widget chỉ ghi qua resource API hiện có → kế thừa ACL server, không mở endpoint mới.

## 4. Lộ trình & estimate

| Phase | Nội dung | Ước lượng |
|---|---|---|
| **P0 spike (go/no-go)** | Test nhanh trên nb-local desktop + **điện thoại thật mở URL Railway**: getUserMedia chụp → canvas watermark → `attachments:create`; `getCurrentPosition` accuracy thực tế; iOS Safari gesture/orientation. | 0.5–1 ngày |
| **P1a ⭐ (user chốt làm trước)** | ✅ **BUILT v0.1.0 (2026-07-16):** B camera widget (in-app mặc định + native mode, nén, **watermark ON** giờ/GPS/user, meta tự lưu vào field) + C1 field `ptdlLocation` (interface + editable + display, no key). i18n en+vi, settings-kit, 2 lane. **C2 check-in action = CHƯA làm** (tách sang iteration sau, không chặn camera). CHỜ test máy thật. | 3–4 ngày |
| **P1b** | A1 scan-input widget + A2 scan-to-lookup (open/side-panel/giỏ subtable-pro, continuous POS). | 2–3 ngày |
| **P2** | A3 QR display (+ combo print-template) · chữ ký · POS polish (beep/dedupe/counter) · reverse geocode (`address`) · ghi âm. | 2–4 ngày, cắt nhỏ theo nhu cầu |

**Rủi ro chính:** (1) iOS getUserMedia quirks (gesture, orientation, front/back switch) — dồn vào P0 spike; (2) GPS trong nhà accuracy kém (±100m+) → ngưỡng màu + cho nhập tay, đừng hard-block; (3) bundle html5-qrcode (P1b) — tiền lệ ag-grid, lazy-load; (4) **deploy lên Railway** — quy trình cài @ptdl tgz lên instance Railway (volume `storage/plugins` / custom image) cần chốt trước khi ship P1a.

## 5. Quyết định đã chốt (2026-07-16) + việc còn mở

**Đã chốt (user):** ① thứ tự = camera+watermark+metadata trước (P1a), QR sau (P1b); ② Railway = HTTPS sẵn, test máy thật trực tiếp trên URL production; ③ watermark + metadata **bật mặc định**; ④ GPS = **field type riêng `ptdlLocation` (json)**, không dùng point của plugin-map (đã bật nhưng field không như ý — point nấp dưới group "Map-based geometry" + đòi API key).

**Còn mở (không chặn code, chốt khi ship):**
1. ~~Quy trình deploy Railway~~ → **ĐÃ RÕ**: upload tgz qua Plugin Manager UI (Add & Update → Upload plugin) — quy trình chuẩn trong build-guide, nhớ bump version + gotcha 403 X-Role sau proxy (xem §1.3.1).
2. Reverse geocode (địa chỉ chữ) có cần ngay P1a không hay để P2 (Nominatim free nhưng rate-limit).
