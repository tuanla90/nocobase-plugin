# @ptdl/plugin-change-log — status-aware change history

> Ngày: 2026-07-13. Plugin RIÊNG (tách khỏi status-flow) nhưng làm status trigger trước.
> Thiết kế schema tổng quát để mở rộng sang field thường sau. Build: recipe
> `build-env/recipes/run-change-log-build.sh` (pass cả 3 lane).
>
> **TRẠNG THÁI: ✅ HOÀN THIỆN + đã build vào `latest/@ptdl/plugin-change-log-0.1.0.tgz`** (2026-07-13),
> chạy trên nb-local, user test UI OK (config, timeline, action popover/drawer + badge, block).
> **Backlog (chưa có yêu cầu):** (1) phân quyền đọc log theo ACL collection nguồn — hiện mọi user
> đọc được mọi log; (2) retention/dọn log cũ; (3) source 'form' vs 'api'. Xem PLAN.md §3.

## Vì sao tách plugin riêng
User yêu cầu "làm riêng cho phần status trước" + cần config danh sách field trigger / field log
kèm → đây là năng lực audit tổng quát (không chỉ status), nên tách plugin. Nhưng V1 tập trung
status: rendering giàu (label/màu/icon + cycle-time) chỉ áp cho field `interface==='statusFlow'`;
field thường vẫn log from→to thô.

## Data model (2 collection, server tự tạo qua db.import)
- `ptdlChangeLogConfigs` (config per-collection): collectionName(unique), enabled, triggerFields[],
  snapshotFields[], captureNote, options. Sửa qua trang Settings → Change Log.
- `ptdlChangeLogs` (entries, immutable, createdAt=thời điểm chuyển): collectionName, recordId(string,
  polymorphic — không FK), fieldName, fromValue/toValue, **fromMeta/toMeta** (snapshot
  label/color/icon/kind), userId/userName/roleName, **source**, **durationMs** (time-in-prev-value),
  note, **snapshot** (JSON các field kèm).

## Server logging (src/server/plugin.ts)
- Hook `afterCreate` (source='create') + `afterUpdate`, filter theo config cache (reload khi
  ptdlChangeLogConfigs đổi). Log MỌI path kể cả API/internal (khác enforcement — không skip no-ctx;
  no-ctx → source='system').
- durationMs = now − createdAt của entry trước (hoặc record.createdAt). Dùng `new Date()` (server
  code, không phải workflow DSL nên OK).
- Best-effort: bọc try/catch, lỗi log KHÔNG chặn ghi nghiệp vụ. Ghi cùng transaction của op.
- Chống đệ quy: bỏ qua chính 2 collection của plugin.

## Nguyên tắc: 1 nguồn sự thật (2026-07-13)
**Logic = trang Settings → Change Log** (ptdlChangeLogConfigs): log field nào (trigger), snapshot
field nào, note, bật/tắt. ĐÂY LÀ NƠI DUY NHẤT cấu hình "log cái gì".
**Action + Block = chỉ UI hiển thị**: action chỉ có "Hiển thị dạng" (popover/drawer); không có gì
đụng tới logic log. (Đã bỏ "Lọc theo field" khỏi action vì nó ngửi giống config, gây nhầm với
trigger — theo phản hồi user.) Đổi config chỉ ảnh hưởng log TỪ GIỜ + cách hiển thị; log cũ immutable.

## Client
- Trang Settings (ChangeLogConfigManager) 2 lane: chọn collection → trigger fields (status field
  xếp trước) + snapshot fields + captureNote + enabled.
- Timeline UI (ChangeLogTimeline): header (current + lead time + count + thanh time-in-value) +
  timeline dọc (chấm màu/icon, from→to, actor, role, source chip, badge duration, note). Tái dùng
  IconByKey + TAG_HEX của @ptdl/shared.
- Bề mặt: action record "Change history" (defineChangeHistoryAction) mở **popover** hoặc **drawer**
  (setting sfMode) — dùng ctx.record/api, không cần wiring per-collection.

## Tích hợp chéo với status-flow (ĐÃ WIRE — 2026-07-13)
Contract qua HTTP header (không có hard dependency giữa 2 plugin):
- `x-ptdl-change-source`: status-flow gửi khi user thao tác — quick-transition tag → `quick`,
  action "Status transition" → `action`. Server change-log đọc header này làm `source`.
- `x-ptdl-change-note`: base64(utf8) của note (tránh Unicode trong header). Action status-flow có
  setting **"Ask for a note/reason"** (sfAskNote) → hiện ô textarea trong dialog confirm, gửi note
  qua header. Server decode base64, chỉ lưu khi config `captureNote` bật.
- Sửa ở: status-flow `statusFlowDisplayModel.doTransition` (source=quick),
  `statusTransitionAction.applyTransition` (source=action + note + setting sfAskNote);
  change-log `plugin.ts` (decode base64 note).

## i18n (2026-07-13)
Dịch tiếng Việt tự chứa: `changeLogClient.ts` có dict VI + `t(key)` (dịch khi app language vi-*,
else giữ English) + `relativeTime` tiếng Việt. Áp cho timeline, config manager, action, block,
menu Settings. Field label trong snapshot/config dùng `tr()` (bóc `{{t("...")}}`) + resolve giá
trị (enum→label, date→`13/07/2026 15:00`). Font timeline chuẩn 1 thang `FS{big15/title14/body13/meta12}`.
**Lưu ý detect ngôn ngữ**: KHÔNG dùng `window.__nocobase_i18n__` (không resolve ở lane /v/ →
`t()` fallback English). Phải `setChangeLogI18n(this.app.i18n)` trong load() 2 lane → `lang()` đọc
`app.i18n.language`. Đa số chuỗi dịch ở render-time (live); vài label baked lúc load (action picker,
label dialog settings) theo ngôn ngữ lúc mở trang.

## Badge số lượng (2026-07-13)
Action có option **"Hiện badge số lượng"** (sfShowBadge) → bọc nút trong antd `Badge` với số entry
của record (`fetchHistoryCount` = list pageSize 1 đọc `meta.count`, refresh khi đóng panel). Display-only.

## Block độc lập (2026-07-13, đã sửa cách lấy record)
`changeHistoryBlock.tsx`: subclass core `BlockModel`, `.define({label,icon,createModelOptions,sort})`
→ xuất hiện trong "Add block". **Lấy record đúng chuẩn core**: `this.context.view.inputArgs`
(`{collectionName, filterByTk}` — filterByTk = recordId) như `CollectionBlockModel`/`BlockGridModel`
dùng; fallback `this.context.record` khi lồng trong details/form block. api = `this.context.api`.
Không có record view (trang list) → hiện hint. Đăng ký 2 lane. Cần test: thả block trên **trang
chi tiết record** (popup/route mở 1 record) chứ không phải trang list.

## Block background + log ở cột status (2026-07-13)
- **Block màu nền**: block có registerFlow step "Nền" → antd `ColorPicker` (allowClear), render bọc
  div `background`. `changeHistoryBlock.tsx`.
- **Bridge cross-plugin**: change-log expose `globalThis.__ptdlChangeLog = { ChangeLogTrigger,
  ChangeLogHistory }` (`exposeChangeLogBridge()` gọi ở load 2 lane) — mẫu như `__ptdlCondFmt`.
- **status-flow cột status**: display model thêm checkbox **"Change-log history"** (`sfShowLog`).
  Khi bật + bridge có mặt → `StatusFlowCellExtras` render icon lịch sử (popover) cạnh graph/quick
  buttons, dùng `bridge.ChangeLogTrigger` (mode popover). Không có change-log → không hiện (no hard dep).

## Còn thiếu / cần làm tiếp
- **Source 'form'**: đổi qua widget editable/dropdown đi theo form submit chuẩn (không qua code
  mình) → server chỉ đoán heuristic (api/bulk/create). Muốn label 'form' chính xác phải hook
  submit của block — để sau.
- **Test runtime** localhost:13000 (môi trường build chỉ có stub, chưa chạy app). Cần verify:
  APIClient forward custom `headers`, ctx.get đọc được header, và `__dirname`/`Buffer` chạy ổn.
- Deploy: extract tgz `storage/tar/@ptdl/plugin-change-log-0.1.0.tgz` + rebuild status-flow.

## Deploy status (2026-07-13)
✅ ĐÃ DEPLOY lên nb-local: extract tgz vào node_modules/@ptdl + storage/plugins/@ptdl (cả 2 plugin),
`nocobase-v1 pm add` + `pm enable @ptdl/plugin-change-log`, `pm2 restart index`. Verify:
enabled=1/installed=1, 2 bảng `ptdlChangeLogs`+`ptdlChangeLogConfigs` tạo xong, app http 200,
không lỗi boot. Backup DB: `storage/db/nocobase.sqlite.bak-predeploy-*`.
⚠️ CHƯA test runtime hook + UI: cần đăng nhập (không tự nhập mật khẩu được) — in-app browser đang
ở màn signin. Thử boot app in-process để test hook (script scratchpad) nhưng `AppSupervisor.getApp('main')`
cần bootstrapper của gateway/CLI → chưa dựng được tay. → Chờ user đăng nhập để test qua UI.
