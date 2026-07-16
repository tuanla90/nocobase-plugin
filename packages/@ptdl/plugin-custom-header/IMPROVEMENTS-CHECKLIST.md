# Custom Header — Checklist cải tiến & nghiệm thu

> Ngày: 2026-07-13 · Plugin: `@ptdl/plugin-custom-header` · Ver: 0.1.0 → **0.2.0**
> Mục đích: sync docs + gom nhóm cải tiến an toàn, kèm bộ test để **nghiệm thu**.

---

## Phần 1 — Công việc (dev tick khi xong)

### Đã làm trong đợt này — ✅ HOÀN THÀNH (v0.2.0)
- [x] **DOC-1** Sync mô tả `package.json` (4 bề mặt + 2 lane) + thêm `displayName.vi-VN`
- [x] **DOC-2** Sync `PLUGIN-REGISTRY.md` dòng custom-header (+ bump 0.2.0, + README list)
- [x] **DOC-3** Sửa comment header `customHeader.tsx` mô tả sai design (option a → option b)
- [x] **A1** Xóa dead code `registerTabStyle` (~66 dòng) — verify bundle: `ptdlTabStyle` = 0
- [x] **B2** Thêm **Size** cho Column / Form-Detail label / Block (áp `fontSize` trong `injectIconIntoTitle` + `decorateHeader`; `hasStyle`/`FIELD_DEFAULTS` gồm size)
- [x] **C5** i18n: locale **en-US / vi-VN / zh-CN** + `addResources` cả 2 lane + `t()` → expression có `ns` (pattern enhanced-table). Verify bundle: namespace ✓, "Giao diện tiêu đề" inlined ✓
- [x] **C7** Guard `pageSize:1000` trong `loadFieldStyleCache` — `console.warn` khi `count > rows`
- [x] **C8** Tạo `README.md` cho plugin
- [x] **B3** Tách **Header align** vs **Cell align**: cell qua antd `align`; header override qua `onHeaderCell` style (`chHeaderAlign`). "Header align = Default" → theo cell align
- [x] **B4** Phủ **JS Field trong form** (`FormJSFieldItemModel`, flow `ptdlJsFieldLabel`) — resolve theo tên, skip an toàn nếu lane không có model
- [x] **C6** Cache freshness đa-phiên: `bindFieldStyleAutoRefresh` reload `fieldCache` khi tab refocus (throttle 10s). *Giới hạn: view đang mở chỉ cập nhật ở lần re-render kế (điều hướng/mở lại block)*
- [x] **i18n-FULL** Dịch nốt nhãn Segmented (Left/Right/Center/Default) + "Preview" + placeholder (Page title/Field label) qua runtime-translator `setRuntimeT` (app.i18n) — component React không đi qua schema `{{t()}}`
- [x] **GRADIENT** Nền **gradient 2 màu + hướng** cho Page header & Block (`headerBg2` + `bgDirection` → `linear-gradient`; component `ChBgDir`; ô hướng chỉ hiện khi đã chọn màu nền 2). Clear màu → xóa nền sạch (fix "không clear được" cũ)
- [x] **UI-POLISH** Làm đẹp + đồng bộ màn hình config theo chuẩn `@ptdl/shared` (như layout-containers): field gom vào **`CollapsibleSection`** accordion (Icon / Text / Background / Alignment) thay vì 1 flat grid; preview dùng **`PreviewBox`** chuẩn (viền gạch đứt, label tertiary, Reset ở góc). Chỉ đổi *trình bày* — giữ nguyên key field + handler + defaultParams (void section không lồng data path)
- [x] **BUILD** Build OK cả client + client-v2 (Rspack compiled) → `build-env/storage/tar/@ptdl/plugin-custom-header-0.2.0.tgz` — verify bundle: `chHeaderAlign`/`onHeaderCell`/`ptdlJsFieldLabel`/`visibilitychange`/`linear-gradient`/`ChBgDir`/`setRuntimeT` ✓; locale JSON hợp lệ ✓

### Chưa làm — đợt sau (đã ghi nhận, KHÔNG trong đợt này)
- [ ] Ảnh nền (image) cho header; nền/gradient cho **column** header (hiện gradient chỉ Page + Block)
- [ ] Force re-render toàn cục khi field default đổi (C6 nâng cao — hiện chỉ refresh cache lúc refocus)

---

## Phần 2 — Build & Deploy ✅ ĐÃ XONG

Build **và deploy** đã hoàn tất lên nb-local (đang chạy `localhost:13000`, pm2 `index`):
1. Build → `plugin-custom-header-0.2.0.tgz` → nhồi markers `client.js`/`client-v2.js` (`add-markers.sh` — bắt buộc, nếu không `/v/` bỏ lane)
2. Giải nén 0.2.0 vào **`nb-local/node_modules/@ptdl/plugin-custom-header`** ← *vị trí RUNTIME NocoBase serve* (không phải `storage/plugins`) + đồng bộ `storage/plugins/...`
3. `pm2 restart index`
4. Verify serve: cả 2 lane trả bundle **0.2.0** (Content-Length 35383/35347; `linear-gradient`+`ChBgDir`+vi-locale ✓); server **không lỗi**
5. Đồng bộ deliverable: `latest/@ptdl/` = 0.2.0, `archive/@ptdl/` giữ cả 0.1.0+0.2.0

### 👉 Bạn chỉ cần: **hard-refresh trình duyệt (Ctrl+Shift+R)** rồi test. KHÔNG cần upload/restart gì thêm.

> - Plugin Manager UI có thể vẫn hiện **0.1.0** (nhãn trong DB) — nhưng CODE đang chạy là **0.2.0**. Không sao.
> - Rollback: giải nén `archive/@ptdl/plugin-custom-header-0.1.0.tgz` vào `node_modules/@ptdl/plugin-custom-header` → `pm2 restart index` (backup 0.1.0 cũng ở scratchpad).
> - Deploy lại sau khi sửa: rebuild → `bash recipes/add-markers.sh <tgz>` → giải nén vào `node_modules/@ptdl/...` → `pm2 restart index`.

---

## Phần 3 — Test nghiệm thu (bạn thực hiện)

> Ký hiệu: **TT** = thao tác · **KV** = kỳ vọng. Test trên **cả `/` và `/v/`** nếu có ghi (2 lane).

### Nhóm cải tiến mới

| # | Thao tác (TT) | Kỳ vọng (KV) | Pass |
|---|---|---|---|
| T1 | `/v/` → mở bảng → ⚙ trên **header 1 cột** → **Column style** → kéo **Size** = 24 | Chữ header cột to lên rõ (≈24px); icon (nếu có) căn theo chữ; **ô dữ liệu KHÔNG đổi cỡ** | [ ] |
| T2 | Form block → ⚙ field → **Label style** → **Size** = 20 | Nhãn field to lên 20px | [ ] |
| T3 | Details block → ⚙ field → **Label style** → **Size** = 20 | Nhãn field (detail) to lên 20px | [ ] |
| T4 | Block bất kỳ → ⚙ → **Block title style** → **Size** = 22 | Tiêu đề khối to lên 22px | [ ] |
| T5 | Đổi ngôn ngữ user → **Tiếng Việt** → mở lại các menu ⚙ trên | Tên mục + nhãn hiện tiếng Việt: *Giao diện tiêu đề / Kiểu cột / Kiểu nhãn / Kiểu tiêu đề khối*, *Cỡ chữ, Màu chữ, Đậm, Căn lề…* | [ ] |
| T6 | Đổi ngôn ngữ → **中文** → mở menu ⚙ | Nhãn hiện tiếng Trung (页头样式 / 列样式 …) | [ ] |
| T7 | Đổi về **English** | Nhãn hiện tiếng Anh như cũ | [ ] |
| T8 | **Column style** → **Header align** = Center, **Cell align** = Left | Chữ **header** cột căn **giữa**, còn **dữ liệu** ô căn **trái** (2 cái độc lập) | [ ] |
| T9 | Cùng cột → **Header align** = Right, **Cell align** = Center | Header căn **phải**, dữ liệu căn **giữa** | [ ] |
| T10 | Form có **JS Field** (editable JS) → ⚙ trên field đó → **Label style** → set icon + màu | Mục "Label style" xuất hiện; nhãn JS field có icon/màu. *(Nếu JS field không render nhãn chuẩn → mục có thể không áp — ghi nhận, không tính fail nặng)* | [ ] |
| T11 | **C6** (cần 2 phiên): trình duyệt **A** set field default (Apply to all views) cho field X → trình duyệt **B** rời tab ~10s rồi quay lại + **điều hướng** sang trang có field X | B thấy style mới của X (không cần logout). *View đang mở sẵn cần re-render (đổi trang/mở lại block)* | [ ] |
| T12 | **Gradient page**: Page header ⚙ → *Header appearance* → **Header background** = màu A, **Background (gradient end)** = màu B → ô **Gradient direction** hiện ra → chọn hướng ↘ | Nền header là **gradient A→B** theo hướng đã chọn (preview + thực tế khớp); phủ cả thanh tab | [ ] |
| T13 | **Gradient block**: Block ⚙ → *Block title style* → 2 màu nền + hướng | Header khối là gradient theo hướng; bỏ màu B → về nền đơn; bỏ cả 2 → **hết nền** (clear sạch) | [ ] |
| T14 | **i18n đầy đủ**: đổi **Tiếng Việt** → mở lại các dialog | Nút Segmented hiện **Trái/Phải/Giữa/Mặc định**; chữ **Xem trước**; placeholder **Tiêu đề trang / Nhãn field** — đều tiếng Việt (không còn English) | [ ] |

### Nhóm hồi quy (đảm bảo A1 + đổi `t()` KHÔNG làm hỏng thứ đang chạy)

| # | Thao tác (TT) | Kỳ vọng (KV) | Pass |
|---|---|---|---|
| R1 | **Page header** ⚙ → Header appearance → icon + màu + **size** + bold + **background** | Áp đủ; nền phủ cả thanh tab (2 lane) | [ ] |
| R2 | **Column style** → icon + màu + bold + **Cell align** = Center (**Header align** = Default) | Icon+chữ header và dữ liệu đều căn giữa (header đi theo cell khi chưa override) — tương thích cũ | [ ] |
| R3 | **Column** → bật **Apply to all views** → set icon/màu | Field đó ở bảng/view KHÁC cùng collection hiện cùng style | [ ] |
| R4 | **Form/Detail label** → icon + màu + bold | Nhãn có icon/màu/bold; string field không vỡ | [ ] |
| R5 | **Block title style** → icon + màu + bold + background | Áp đủ; header khối flush, không strip trắng | [ ] |
| R6 | Mở **Enhanced Table** có cột đã set Column style | KHÔNG lỗi "Render failed" (`.trim`); summary chạy | [ ] |
| R7 | Kiểm tra **KHÔNG còn** mục "Tab style" ở menu tab | Không thấy (đã gỡ dead code — vốn chưa từng hiển thị) | [ ] |
| R8 | Console trình duyệt khi load app | Log `[custom-header] ... loaded`; không có error đỏ | [ ] |

### Nhóm polish UI config (đợt bổ sung — cần xem nhanh)

| # | Thao tác (TT) | Kỳ vọng (KV) | Pass |
|---|---|---|---|
| T15 | Mở lại **Header appearance** / **Column style** / **Block title style** | Field gom thành **section gập/mở** (Icon · Text · Background · Alignment) có mũi tên ▸, click gập được; KHÔNG còn 1 lưới phẳng dài | [ ] |
| T16 | Nhìn ô **Preview** trong dialog | Khung preview **viền gạch đứt** (dashed), chữ "Preview/Xem trước" xám nhạt, nút **Reset** cùng hàng bên phải; preview vẫn cập nhật sống | [ ] |
| T17 | Đổi **Tiếng Việt** → mở dialog | Tiêu đề section tiếng Việt: **Biểu tượng / Chữ / Nền / Căn lề** (không hiện `{{t(...)}}` thô) | [ ] |
| R9 | Set icon+màu+size+bold+align+gradient qua UI mới → Save → mở lại | Áp đúng + giá trị lưu/đọc y như trước (chỉ refactor trình bày, không đổi key/handler) | [ ] |

### Kết luận nghiệm thu — ✅ PASS (2026-07-13)
- [x] Tất cả **T1–T14** pass (T10/T11 best-effort — xem ghi chú)
- [x] Tất cả **R1–R8** pass
- [x] Không lỗi console/regression → **CHẤP NHẬN v0.2.0** ✅ (đã deploy nb-local)

> Có mục fail → ghi số test + mô tả hiện tượng để mình sửa tiếp.
