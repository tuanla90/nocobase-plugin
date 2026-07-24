# build-env — cách build lại plugin

Toolchain (`@nocobase/build` + node_modules) KHÔNG kèm ở đây cho gọn. Dựng lại 1 lần:

```bash
cd build-env
npm install @nocobase/build@2.1.19 --no-audit --no-fund
# đặt source cần build vào: packages/plugins/@tuanla90/plugin-<name>/   (copy từ ../packages/@tuanla90/)
# dep phải BUNDLE (không stub): npm i echarts zrender tslib lucide-react markdown-it
```

Build 1 plugin:
```bash
node node_modules/@nocobase/build/bin/nocobase-build.js @tuanla90/plugin-<name> --tar --no-dts
# ra: storage/tar/@tuanla90/plugin-<name>-<ver>.tgz
```

`recipes/` chứa script build từng plugin (đã set sẵn stub external + dep thật):
- run-condfmt / globalsearch / iconkit / login-build.sh  → build trong build-env này
- run-build-block-html / pwa / echarts-pro.sh            → cần echarts thật; block-html phải tar tay (server lane xuất dist/index.js ở gốc, thiếu client-v2 → abort tar)

Chi tiết đầy đủ: `../docs/NOCOBASE-PLUGIN-BUILD-GUIDE.md`.

Lưu ý: đổi scope plugin BẮT BUỘC build lại (tên package nướng cứng trong client UMD + path /static/plugins/<pkg>/).

## ⚠️ Gate typecheck trước khi build (recipes/typecheck.sh)
`@nocobase/build` chỉ transpile, KHÔNG typecheck — biến khai báo trong block nhưng đọc ngoài block vẫn
compile êm và chỉ nổ `ReferenceError` lúc runtime (vụ line-generator 0.8.0/0.8.1: preview 500
"rules is not defined"). `recipes/typecheck.sh <plugin-dir>` chạy tsc --noEmit và CHỈ gate lỗi scope
(TS2304/TS2448/TS2454, whitelist global Node như `__dirname`/`require`) — noise môi trường (TS2307
module-not-found…) được bỏ qua nên KHÔNG cần cài @types/node hay framework thật. Đã wire vào recipe
line-generator + plugin-hub (fail-fast ngay sau bước sync src); recipe khác thêm 1 dòng:
`bash "$ROOT/recipes/typecheck.sh" "$DST"`.

## ⚠️ BẮT BUỘC sau khi build: nhồi marker cho client `/v/`
`nocobase-build --tar` KHÔNG đóng `client.js`/`client-v2.js` vào tgz. NHƯNG NocoBase **modern client `/v/`**
chỉ nạp lane `client-v2` của plugin có file **`client-v2.js` ở gốc package** (server: `@nocobase/server/.../
plugin-manager/options/resource.js` → `hasClientEntry` dùng marker, KHÔNG dùng `dist/client-v2`). Thiếu marker
→ `/v/` bỏ qua client-v2 → code v2 (vd đăng ký icon Lucide vào picker, field model FlowEngine) **không chạy**.
→ Sau mỗi build: `bash recipes/add-markers.sh storage/tar/@tuanla90/plugin-<name>-<ver>.tgz`
(Guide cũ ghi "marker không vào tar" — đúng về mặc định builder, nhưng SAI về việc `/v/` cần nó.)
