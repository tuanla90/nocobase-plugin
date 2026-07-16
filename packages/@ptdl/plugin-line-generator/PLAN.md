# PLAN — @ptdl/plugin-line-generator

**"Sinh dòng theo quy tắc" (Rule-based Line Generator)** — từ 1 bản ghi cha + bảng quy tắc, sinh n dòng con trong 1 transaction. Snapshot, không live.

Trạng thái: **P0 XONG — LIVE E2E VERIFIED** (2026-07-15, v0.1.1). Deploy vào nb-local + enable + seed; dựng demo Section I qua API + chạy thật:
- **generate** đơn G1 đủ người → 15 dòng order_commissions, **tổng 11.344.000 khớp chính xác test offline**; người nhận đúng (self/direct/indirect manager), snapshot vị trí/phòng ban/period_month đúng; parentUpdates (is_commission_created=1, commission_status=COMPLETED) trong cùng transaction.
- **guard chặn chạy lại** (đơn đã is_commission_created=true → guard-failed).
- **skip live**: đơn NV không có quản lý + thiếu NV giao dịch → 8 dòng + 7 skip `required-null` (báo cáo từng rule).
- **BUG do live-test phát hiện + đã sửa (v0.1.1)**: return key `rows` TRÙNG quy ước list-response của NocoBase (body `{rows,count}` → `data=rows[]`, nuốt mất ok/skipped/errors) → preview dialog vỡ. Đổi `rows`→`lines`. Xem [[reference_nocobase_list_response_rows_key]].
- Offline core test 30/30; build 3 lane sạch + markers.

## P6.6 — đã làm (2026-07-16, v0.6.9) — Mục 5 dùng picker + nút Nạp mẫu to bằng Lưu + cảnh báo đóng khi chưa lưu
- **Mục 5 (Nâng cao): mọi ô chọn cột → field picker** (user: "chưa phải là picker"). Thêm `FieldMultiSelect` (Select mode=tags: dropdown cột thật của bảng đích + vẫn gõ tay được cho cột output chưa có trên bảng). Group by / Cột cộng dồn / Làm tròn cột → `FieldMultiSelect(targetCollection)`; Kiểm tra tổng (sumField) → `FieldSelect(targetCollection)`. `runVersionSource`/`markerField` vốn đã là `FieldSelect`. Gỡ `TagList` (free-text) không còn dùng. Live-verify: 6/6 ô mục 5 = picker (multi cho group/sum/round, single cho phần còn lại).
- **Nút "Nạp mẫu" to bằng "Lưu"**: bỏ `size="small"` trên Select nạp mẫu → cỡ middle; live-verify cả hai cao 28px.
- **Cảnh báo đóng khi chưa lưu** (user: "cảnh báo khi bấm escape hoặc bấm x có save hay k"): theo dõi `dirty` = JSON(cfg) ≠ baseline lúc mở; Drawer `onClose` (cả nút ✕ lẫn Escape đều route qua đây) → nếu dirty mở `Modal` 3 nút **Ở lại / Đóng, không lưu / Lưu & đóng** (Lưu & đóng gọi save → onSaved đóng drawer). Live-verify: sửa Name → bấm ✕ → modal hiện đủ 3 nút, drawer chưa đóng; "Đóng không lưu" đóng sạch, không ghi. i18n en-US bổ sung 5 key.

## P6.5 — đã làm (2026-07-15, v0.6.8) — Demo BOM THẬT + fix cross-product per-line
- **Config trùng `oc-auto` (id 3) → thay bằng demo BOM thật** (user: "convert nó thành config thật của BOM"). Dựng schema BOM qua API (`products`, `materials`, `bom_lines` = bảng quy tắc định mức, `order_lines` = dòng nguồn, `material_requirements` = bảng đích) + quan hệ m2o/o2m; seed Ghế/Bàn + định mức (Ghế: Chân×4/Mặt×1/Vít×8; Bàn: Chân×4/Mặt×1) + đơn Ghế×10, Bàn×5; config `order-bom` (`sourceLinesPath=order_lines`, `ruleWhere product_id=src.product_id`, `groupBy material_id`, SUM qty).
- **BUG cross-product per-line (đây là bug logic thật, ẩn tới khi có case per-line)**: `ruleWhere` chứa ref `src.` (vd `product_id = src.product_id`) không thể bỏ vào DB prefilter vì lúc query CHƯA biết ghép với dòng nguồn nào → `buildRuleFilter` bỏ điều kiện (resolveWhereValue trả undefined) → nạp TẤT CẢ quy tắc; mà `pairMatches` chỉ đọc `matchMap` (rỗng) → **mọi dòng nguồn ghép mọi quy tắc** (2 dòng × 5 rule = 10 cặp thay vì 5). Đơn Ghế×10+Bàn×5 ra Chân 120/Mặt 30/Vít 120 (sai gấp bội).
  - **Sửa**: thêm `ruleWherePass(config, src, rule, parent, evaluate)` vào `generateCore` — áp `ruleWhere` cho TỪNG cặp (src,rule) trong bộ nhớ (`resolveWhereValue` giờ thấy cả parent/src/rule). DB prefilter vẫn lo điều kiện parent-only (tối ưu), per-pair lo điều kiện `src.` (đúng đắn). Điều kiện parent-only bị áp lại trong RAM là vô hại (cùng kết quả). Không đổi hoa hồng (config đó dùng ref parent, vẫn 15 dòng).
  - **Verified**: đơn Ghế×10+Bàn×5 → **5 cặp**, group 3 NVL: **Chân 60, Mặt 15, Vít 80**. Hoa hồng mọi đơn thanh lý vẫn **15 dòng/11.344.000**.
- **Template person rút gọn** (user: "SWITCH có dùng kiểu `parent[rule.base_field]` không?"): từ SWITCH 9 nhánh → 1 dòng `REL(parent, rule.based_on & IF(rule.recipient=='self','','.'&rule.recipient))`; comment template dạy 3 kiểu truy cập ĐỘNG: `parent[rule.base_field]` (scalar), `parent[rule.based_on]` (quan hệ), `REL()` (path null-safe multi-hop) + lối SWITCH khi enum tách rời tên quan hệ.
- Test scenario G (BOM per-line ruleWhere: 5 cặp, group 60/15/80). Offline 48/48. Deploy 0.6.8.

## P6.3 — đã làm (2026-07-15, v0.6.6) — 2 bug user bắt: literal chưa nháy + hiển thị object
- **Bug 1 — từ trần chưa nháy (`status = COMPLETED`)**: evalExpr coi 1 từ trần KHÔNG phải biến scope/helper/keyword (true/false/null…) là **string literal** — quyết định TRƯỚC khi eval (không dựa vào bắt lỗi, vì trên SES identifier chưa định nghĩa trả `undefined` chứ KHÔNG ném lỗi → fallback-bắt-lỗi vô dụng; đây là bài học SES quan trọng). Nên `COMPLETED`→"COMPLETED", `DRAFT`→"DRAFT", nhưng `true`→boolean, `person`/`parent`→biến thật. Live-verified SES.
- **Debug lộ lỗi**: thêm **Bước 6 — Cập nhật bản ghi cha (post)** vào trace (generateCore đánh giá parentUpdates khi debug, push lỗi vào errors) → công thức sai của post-action giờ hiện đỏ trong "Chạy thử" thay vì im lặng.
- **Bug 2 — lưu object → preview `[object Object]`**: helper `disp(v)` render object thành `#id tên` (id/name/title/nickname), array `[n]`, dùng ở bảng preview + MiniTable + Bước 6. Output là object (vd employee = person) hiển thị `#16` + ghi được (NocoBase nested connect by id). Live-verified.
- Test scenario F (bare literal + parentUpdates trace + real-error surface). Offline 43/43. Deploy 0.6.6.

## P6.2 — đã làm (2026-07-15, v0.6.2) — Nested field cascader + op/date theo type thật
1. **Chú giải "parent"**: mục 1 title "…bảng cha (parent)…" + dòng legend "bản ghi này gọi là parent trong công thức". **Trim preload template hoa hồng 9→6** (chỉ 6 đường person thực dùng bởi 15 rule: responsible_staff+2 QL, transaction_staff self, liquidation_employee+direct); live-verify vẫn 15 dòng/11.344.000/6 nhân sự.
2+4. **Ô chọn cột = NESTED CASCADER** (`CondFieldCascader`, lazy-load relation con, hover xổ, click chọn → trả dot-path + leaf type) cho cả guard lẫn ruleWhere — thay ô gõ tay. **Toán tử theo type THẬT kể cả cột xuyên quan hệ**: `resolvePathType`/`useResolvedTypes` walk quan hệ tới lá → `commission_rule_group.is_active` (boolean) chỉ còn = ≠ (browser-verified opOptions=['=','≠']); số/date → thêm > < ≥ ≤; text → chứa.
3. **Cột date → ô date thật**: value input = `<Input type="date">` khi leaf type là date/time (native picker, không cần dayjs).
- Browser-verified: legend parent, 6 preload tag, 6 cascader, op nested boolean = 2 lựa chọn. Offline 42/42. Deploy 0.6.2 + reseed 6-path.

## P6.1 — đã làm (2026-07-15, v0.6.1) — 5 tinh chỉnh UX tiếp
1. **preload (quan hệ bảng CHA) → dời lên Mục 1** (cạnh "Bảng kích hoạt (cha)"). 2. **Mục 2 = "Đầu vào — nhân theo bảng nào (src)"**: nhãn "Bảng dòng nguồn (src)" (chuẩn hoá tên gọi bảng này = "bảng dòng nguồn"); thêm **`srcAppends`** — nạp quan hệ của bảng dòng nguồn (chỉ hiện khi có bảng con), server load bằng cách prefix `sourceLinesPath.`. 3. **Mục 3 tiêu đề (config)→(rule)**. 4. **Toán tử theo DATA TYPE**: số/date → = ≠ > < ≥ ≤; text → = ≠ chứa; bool/select → = ≠; dot-path/unknown → full. `opsForType(fieldType(fields,name))`, đổi cột thì op không hợp lệ tự về eq. 5. **Toolbar công thức TÁCH RIÊNG, sticky trên đầu panel** (dùng chung cho skipIf mục 2 + value mục 3 + công thức mục 4; các ô đó đều `trackFocus`); src picker tự ẩn khi không có bảng dòng nguồn.
- Server: `generator.ts` load appends = preload(cha) + [sourceLinesPath, sourceLinesPath.<srcAppends>] (expand prefix). `types` thêm `srcAppends`.
- Browser-verified: toolbar sticky trước mục 1, preload trong mục 1, mục 2/3 tiêu đề mới, preview vẫn 15 dòng, debug stepper OK, toolbar 2 picker (src ẩn đúng). Offline 42/42. Deploy 0.6.1.

## P6 — đã làm (2026-07-15, v0.6.0) — ĐA CẢI TIẾN UX (2 sub-agent song song) + lean data
Chạy 2 sub-agent song song trên 2 bộ file rời (contract types/api viết trước): SERVER (ruleWhere + trace) / CLIENT (đại tu UI). Tích hợp + build một lượt + live-verify.
- **(1)(2) Gộp điều kiện → `ruleWhere`**: matchMap + ruleFilter → 1 danh sách `[{field, op, value}]`. Bỏ "VÀ" (mặc định AND, thêm dòng = thêm điều kiện). Bỏ toggle Giá trị|Cột-nguồn: value là 1 ô gõ tự do "gõ gì ăn nấy" — server `resolveWhereValue` tự hiểu: `true`/số→literal, `parent.x`/`src.x`→expr eval theo record, có nháy→string, còn lại→literal. Đủ toán tử = ≠ > < ≥ ≤ chứa (map `$ne/$gt/$lt/$gte/$lte/$includes`). `condsPass` (guard) + `guardPasses` (client show-if) cũng mở đủ toán tử. Legacy matchMap/ruleFilter đọc back-compat + migrate lúc mở editor.
- **(3) Mọi list = BẢNG** (`EditTable` bọc antd Table header xám + cột ✕ + nút ＋): guard, lọc quy tắc, cập nhật cha, biến trung gian, cột sinh ra.
- **(4)** Mục 2: preload lên đầu (trước "Nhân theo"). **(6)** Mục 4: "Ghi vào" lên đầu (Ghi vào → chèn cột → biến → cột sinh ra); `src.*` fallback parent khi không có bảng con (engine sẵn). **(5)** Thuật ngữ "quy tắc" nhất quán.
- **(7) DEBUG TỪNG BƯỚC**: previewInline mặc định debug=true → `trace: PreviewTrace {parent, srcRows, rules, pairs[{index,src,rule,derived,outputs,dropped,reason}], grouped}`. UI Collapse 5 bước (gập sẵn): Bản ghi cha → src → quy tắc khớp → từng cặp (derived+outputs+badge giữ/bỏ) → kết quả gộp. Browser-verified render đủ 5 header.
- **Lean demo data (user)**: template + demo bỏ cột snapshot chỉ-để-debug (position/department/shipping_type/quotation_method → hiển thị qua QUAN HỆ trên block; run_version → dùng `createdAt`). lineOutputs hoa hồng 12→**7 cột** (employee_id, commission_rule_name, base_field, base_value, rate, commission_amt, period_month); preload 18→9 (chỉ object người, bỏ .position/.department); bỏ runVersionSource/markerField/hashField. Bảng `order_commissions` drop 7 cột qua API fields:destroy → còn 10 cột gọn.
- **Live-verify v0.6**: previewInline ruleWhere → 15 dòng/11.344.000; trace đủ 5 bước (pairs=15, derived.person có, outputs.employee_id đúng); UI 5 EditTable + debug Collapse render. Offline 42/42. Deploy 0.6.0.

## P5.3 — đã làm (2026-07-15, v0.5.3) — Preview bỏ qua guard (kèm cảnh báo) + đồng nhất style input
- **"Chạy thử" giờ luôn cho xem kết quả**: previewInline mặc định `ignoreGuard` (CHỈ dry-run; generate thật vẫn enforce). Bản ghi mẫu không đạt điều kiện → banner vàng "CHƯA đạt điều kiện (…chi tiết…) — thực tế nút ẩn/auto không chạy; kết quả là GIẢ ĐỊNH bỏ qua điều kiện" + vẫn render đủ dòng. (Nguồn cơn: user preview đơn ĐÃ tính → guard chặn 'cần false' gây khó hiểu — đó là guard đúng vai, nhưng preview phải thân thiện hơn.) GenerateDialog (nút thật) giữ strict.
- **Style đồng nhất mọi ô nhập** (theo feedback ảnh): 3 vùng gán dữ liệu (post-update / biến trung gian / cột sinh ra) cùng 1 style `AssignRow` = [ô trái 240px | ô công thức] Space.Compact nối liền, cao 32px (middle); điều kiện (guard + lọc quy tắc) cùng nhịp [VÀ] [cột | = | giá trị] nối liền middle. Hết input 24px (`ant-input-sm` = 0, DOM-verified).
- Browser-verified: preview đơn #12 (đã tính) → banner + 15 dòng vẫn hiện.

## P5.2 — đã làm (2026-07-15, v0.5.2) — Bố cục song song mục 2 ↔ 3 (user đề xuất)
- Mục 2 và 3 giờ CÙNG một nhịp "**bảng gốc → chọn append → điều kiện lọc**": Mục 2 (Đầu vào) = Nhân theo → **preload (chuyển từ mục 4 về)** → Bỏ qua dòng khi; Mục 3 (Bảng quy tắc) = chọn bảng → appends (đảo lên trước) → điều kiện lấy dòng. Mục 4 còn thuần công thức: chèn cột → biến trung gian → ghi vào → cột sinh ra. DOM-verified thứ tự.

## P5.1 — đã làm (2026-07-15, v0.5.1) — GỠ HẲN UI nhúng + REBUILD demo data collection-mode
- User thấy lưới rule nhúng hiển thị vỡ (config cũ thiếu ruleFields) → chốt gỡ hẳn: **UI nhúng xoá sạch** (ScopesEditor/RuleGrid/ruleFields editor/Dropdown rule-picker); config nhúng cũ mở lên chỉ còn notice "kiểu cũ, vẫn chạy, không sửa được" (engine giữ; cleanConfig bảo toàn scopes khi save).
- **Demo data rebuild thuần bảng dữ liệu**: `commission_rule_groups` G1–G4 + `commission_rules` 60 dòng (15/nhóm, chỉ "Lương vận chuyển" khác nhau theo spec); CẢ 2 config (order-commission bấm nút + oc-auto tự động) viết lại kiểu mới: collection rules + person SWITCH chấm trực tiếp + append + markerField.
- **BUG LIVE bắt được nhờ rebuild**: `repository.findOne({appends})` với đường LÁ ('responsible_staff.position') KHÔNG materialize object trung gian (khác HTTP :get) → parent.responsible_staff null → 15 skip required-null (flag vẫn set — parentUpdates chạy). Fix: `expandAppends` server-side nở prefix mọi path ('a.b.c'→'a','a.b','a.b.c') cho cả preload lẫn ruleAppends. Xem [[reference_nocobase_repo_appends_prefix]]. (Offline không thấy vì fixture nhúng sẵn quan hệ — nhấn mạnh lại: đổi config phải re-verify live.)
- **Live verify PASS**: G1 (guard chặn khi chưa thanh lý → flip status tự sinh 15 dòng/11.344.000, Alice/Dan đúng người); G3 tạo đơn đã-thanh-lý → auto ngay khi CREATE, 15 dòng/13.344.000, vận chuyển 4tr = ×4% đúng nhóm theo DỮ LIỆU BẢNG, snapshot + cha tự đánh dấu. Seed script: scratchpad rebuild-demo-data.mjs (chú ý bảng demo không có createdAt/updatedAt).

## P5 — đã làm (2026-07-15, v0.5.0) — TÁI CẤU TRÚC 5 PHẦN theo lý thuyết user
Lý thuyết chốt: "tạo bảng Item; trigger condition trên bảng cha; số item = (dòng bảng con hoặc cha) × (dòng config)". Editor sắp lại đúng luồng đó:
1. **Kích hoạt** — tên, bảng kích hoạt (cha), bật, mode nút|tự động, điều kiện, cập nhật cha sau khi chạy (pre+post về一 chỗ).
2. **Đầu vào — nhân theo dòng nào** — "Nhân theo" (mặc định chính bản ghi cha | bảng con; label mới thay "Dòng nguồn") + "Bỏ qua dòng khi" (skipIf chuyển từ Nâng cao lên làm bộ lọc đầu vào).
3. **Bảng quy tắc (config)** — ruleCollection + điều kiện lấy dòng + appends. **INLINE BỎ KHỎI UI cho bộ sinh mới** (user chốt: quy tắc là data, để trong bảng); engine + editor GIỮ legacy (config nhúng cũ mở lên có notice "kiểu cũ" + scopes editor; lưới rule tự suy cột từ dữ liệu khi config thiếu ruleFields — fallback cho seed cũ). Template inline bỏ khỏi menu Nạp mẫu (export giữ cho test).
4. **Công thức tạo dòng & ghi kết quả** — preload, chèn cột, biến trung gian, ghi vào, cột sinh ra.
5. **Nâng cao — logic điền số** — group by, cột cộng dồn (khôi phục row bị rơi), làm tròn, kiểm tra tổng, cột đếm lần chạy, cột nhận diện.
Browser-verified: 5 mục đúng thứ tự, hết mode switch, "Multiply by"/"Skip a row when" hiện; oc-auto (nhúng cũ) mở được — G1 + 15 rule + rate render qua fallback. Offline ALL PASS. Deploy 0.5.0.

## P4.3 — đã làm (2026-07-15, v0.4.3) — Chấm trực tiếp null-safe + "＋ Chèn cột" (user đề xuất)
- **`nullSafeDots` transform trong evalExpr**: `a.b.c` → `a?.b?.c` (optional chaining; string-aware, bỏ qua số 1.5/spread/`?.` sẵn) → **viết chấm trực tiếp `parent.responsible_staff.direct_manager.id` giờ null-safe** — null giữa đường ra null êm → required-drop sạch (skip 'required-null', không phải error). REL() thành legacy (config cũ trong DB vẫn chạy). Templates đổi hết sang chấm trực tiếp (PERSON_SWITCH các nhánh `parent.x.y`, outputs `person.id`/`person.position.name`, BOM `rule.material.name`).
- **FormulaBar "Chèn cột vào công thức"** (pattern các plugin cũ, reuse `FieldPickerCascader` @ptdl/shared): 3 picker — Cột của cha (`parent.<path>`, **tự thêm preload** cho path qua quan hệ), Cột dòng nguồn (`src.<path>`, hiện khi có sourceLinesPath), Cột quy tắc (`rule.<name>` — dropdown ruleFields ở inline mode / cascader ruleCollection ở collection mode). Chèn tại con trỏ của ô công thức focus gần nhất (native value setter + input event → React onChange bắt được).
- Test scenario E: null hop → 0 error + 1 skip required-null; chuỗi đủ → Bob; literal `1.5` không bị rewrite. ALL PASS; deploy 0.4.3 (server dist verify có nullSafeDots); DOM check FormulaBar + 3 picker.

## P4.2 — đã làm (2026-07-15, v0.4.2) — CASE-WHEN style thay ghép-chuỗi (user đề xuất)
- User chỉ đúng chỗ mỏng nhất: template cũ GHÉP CHUỖI `rule.based_on & '.' & rule.recipient` thành đường REL — chỉ chạy khi giá trị config TRÙNG tên quan hệ (trùng hợp thiết kế, sập nếu enum là 'NVPT'/'TP'). Sửa: **ánh xạ tường minh kiểu CASE WHEN** — template dùng 1 deriveVar `person = SWITCH(rule.based_on & '|' & rule.recipient, 'x|y', REL(parent,'<đường tĩnh>'), … , null)` (9 nhánh, như CASE WHEN SQL); outputs = REL(person,'id'/'position.name'/'department.name').
- Engine ĐÃ sẵn IF/IFS/SWITCH (formulajs; lưu ý `null` viết thường, `NULL` không tồn tại; SWITCH trả được cả OBJECT rồi REL đi tiếp). REL giữ vai trò null-safe (NV không có quản lý → null → required-drop sạch; truy cập chuỗi thuộc tính trực tiếp `a.b.c` sẽ THROW trên null).
- deriveVars giữ làm "CTE" tuỳ chọn (khỏi lặp 9 nhánh ở 3 cột); hints UI dạy IF/IFS/SWITCH là công cụ chính. Test scenario D mới: enum 'NVPT'/'BAN_THAN'/'TP'/'KTTL' KHÔNG trùng tên quan hệ → map đúng người. Templates equivalence: scenario C vẫn 15 dòng/11.344.000 với style mới.
- ⚠️ Build/deploy 0.4.2 chờ task nền "gom RelationAppendsPicker vào shared" xong (nó đang refactor cùng workspace + rebuild shared; build lúc này sẽ vỡ vì build-env shared chưa có relationPicker).

## P4.1 — đã làm (2026-07-15, v0.4.1) — Preload/appends = relation CASCADER (user đề xuất)
- Preload + ruleAppends đổi từ tag-gõ-tay thành **cascader quan hệ nhiều cấp** (pattern AppendsPicker của print-template: hover xổ cấp con, depth 3, mỗi pick thành tag đóng được). Semantics ghi rõ trong hint: **append 1 path nạp TOÀN BỘ cột của mọi object trên đường đi** (a.b.c kéo theo a và b) — không chọn cột lẻ, đúng NocoBase gốc.
- Template preload rút 27 → **18 đường lá** (bỏ các entry trung gian thừa — `responsible_staff` đã được `responsible_staff.position` kéo theo). Config cũ 27 đường vẫn chạy (thừa vô hại).

## P4 — đã làm (2026-07-15, v0.4.0) — ALWAYS APPEND + pre/post model (user đề xuất)
- **Bỏ regenPolicy khỏi UI — luôn APPEND**: không bao giờ xoá dòng; chống trùng = việc của điều kiện (pre) + cờ parentUpdates (post); xoá dòng cũ = việc của user. Engine GIỮ replace/block-if-edited cho config cũ (legacy, cần markerField; fallback '_genRule' trong destroy path). 'version' vốn ≡ append trong engine.
- **Marker/hash thành OPT-IN, không default**: bảng đích KHÔNG cần cột đặc biệt nào nữa. "Cột ghi nhận diện bộ sinh" = mapping tuỳ chọn ở Nâng cao (chọn cột trên BẢNG ĐÍCH để đóng dấu key — đúng ý user: quan tâm "ghi vào đâu" chứ không phải "giá trị gì"). Templates giữ markerField (demo tables có cột).
- **Mục 4 = "Kích hoạt (pre) & cập nhật cha (post)"**: chỉ còn Kích hoạt (nút|tự động) + Điều kiện + Sau-khi-chạy-cập-nhật-cha. runVersionSource chuyển xuống Nâng cao (biến runVersion phân biệt đợt sinh khi append).
- Offline ALL PASS (test config thêm markerField/hashField tường minh để giữ coverage stamp); build+deploy 0.4.0; DOM-verified (regenPolicy select biến mất, tiêu đề pre/post, post-action label).

## P3.2 — đã làm (2026-07-15, v0.3.2) — Key thành internal + mental model "dòng nguồn"
- **Key BỎ khỏi form** (user: "sao bắt user điền?"): tự sinh khi tạo (key template hoặc slug từ tên, tự chống trùng qua existingKeys), **đóng băng sau khi tạo** (không sửa được → hết footgun mồ côi dòng). Vẫn giữ key thay vì row-id vì: marker `_genRule` đọc-hiểu-được trong bảng kết quả + export/import config giữa môi trường (id mỗi nơi một khác). Key vẫn hiện ở cột danh sách (read-only).
- **Mental model chuẩn hoá theo user**: "Bảng nguồn" = nơi neo NÚT/TRIGGER (mỗi bản ghi là một cha, parent.*); "Dòng nguồn" = cái đem NHÂN với quy tắc. "Bảng con nguồn" đổi tên thành "Dòng nguồn" + đổi từ Input gõ tay thành Select (mặc định "Chính bản ghi cha" | các quan hệ bảng con). Hint viết lại theo model này. Browser-verified.

## P3.1 — đã làm (2026-07-15, v0.3.1) — Sắp lại luồng đọc theo feedback
- User: preload + biến trung gian phải nằm TRÊN công thức ("công thức mới có cái dùng"). Mục 3 đổi thành "Công thức & kết quả" pipeline: **preload → biến trung gian → ghi vào → cột sinh ra**; Nâng cao chỉ còn: bảng con nguồn, group by, làm tròn, skipIf, kiểm tra tổng (đều niche có chủ đích — use case: làm tròn = chia tiền theo % lệch đồng lẻ, largest-remainder giữ tổng khớp; skipIf = loại cặp theo điều kiện phi-null (đơn nội bộ, NV thử việc); kiểm tra tổng = nghiệp vụ allocation bắt buộc đủ 100%). Browser-verified thứ tự mới.

## P3 — đã làm (2026-07-15, v0.3.0) — KÍCH HOẠT Manual/Auto (thiết kế do user đề xuất)
- **1 khái niệm "điều kiện" duy nhất** (`guard`), chế độ kích hoạt quyết định cách dùng: `trigger:'manual'` (default) = show-if nút + chốt chặn server; `trigger:'auto'` = **điều kiện kích hoạt** — server hook `afterCreate/afterUpdateWithAssociations` trên sourceCollection (pattern ai-column autorun), bản ghi lưu mà thoả điều kiện là TỰ chạy, không cần nút.
- Loop-safety 2 lớp: parentUpdates mang `context.__ptdlLineGenInternal` (hook bỏ qua write của chính mình) + re-entrancy lock `${key}:${tk}`. Config cache reload qua afterStart + ptdl_linegen_rules.afterSave/Destroy (afterCommit). Rule auto bị LOẠI khỏi rulesFor (không hiện trên nút).
- **Chạy lại ở auto mode = bỏ cờ đánh dấu** (is_commission_created=false) → hook thấy thoả điều kiện → tự chạy lại (version policy đánh run_version mới). UI hint nói rõ điều này.
- UI mục 4 đổi thành "Kích hoạt & chạy lại": Segmented Bấm nút | Tự động; nhãn điều kiện đổi theo ngữ cảnh.
- **Live e2e 4 bước PASS**: tạo đơn chưa thanh lý → 0 dòng; flip status → tự sinh 15 dòng/11.344.000 + flag COMPLETED; touch đơn → guard chặn, không dup; bỏ flag → tự chạy lại, 30 dòng (15 v1 + 15 v2). UI verified qua DOM.
- ⚠️ Gotcha khi seed config qua bash inline `node -e`: dấu nháy đơn trong công thức (`'self'`, `'COMPLETED'`) bị bash single-quote NUỐT → công thức hỏng → auto-run created 0 (flag vẫn set). Debug qua pm2 log + đọc lại config từ DB. **Luôn seed bằng file .mjs.**

## P2.2 — đã làm (2026-07-15, v0.2.3) — GỘP matchMap + ruleFilter thành 1 danh sách
- User hỏi đúng: "Điều kiện khớp" và "Lọc thêm" bản chất là MỘT ("chỉ lấy dòng quy tắc thoả…"), chỉ khác vế phải. Gộp UI thành 1 danh sách "Chỉ lấy dòng quy tắc thoả (VÀ)": mỗi dòng = [cột quy tắc ▾] = [so với: Giá trị | Cột trên nguồn ▾] [giá trị/cột ▾]. **Schema lưu KHÔNG đổi** (decompose ngược về matchMap/ruleFilter khi lưu — backward compatible, config cũ tự map). Browser-verified: rule cũ hiện 4 dòng gộp đúng (2 Source column + 2 Value), 2 mục cũ biến mất. Quirk chấp nhận: đổi kind làm dòng nhảy vị trí nhóm (field-rows đứng trước).

## P2.1 — đã làm (2026-07-15, v0.2.2) — GỘP & TỰ SUY, pickers kiểu print-template
- 7→5 mục: (1) Chung (2) Quy tắc (3) Kết quả = "ghi vào" + cột sinh ra GỘP CHUNG (4) Vận hành nút = guard + chạy-lại + cập-nhật-cha (5) Nâng cao collapsed (bảng con nguồn, preload, biến trung gian, gộp/làm tròn, skipIf, kiểm tra tổng).
- **Tự suy, khỏi điền**: `targetForeignKey` tự lấy từ quan hệ hasMany khi chọn "Ghi vào" (field biến mất khỏi form); `key` tự slug từ tên; "Cột đếm lần chạy" chỉ hiện khi chọn policy Phiên bản.
- **Pickers kiểu print-template** (ConditionPicker style): mọi ô "cột" = AutoComplete nạp field thật của collection (nhãn + tên, vẫn gõ tay được cho dot-path); ô giá trị điều kiện gợi ý enum của select field. Áp cho: scope-when, guard, lọc quy tắc, matchMap, cột đích lineOutputs (theo bảng ĐÍCH đã chọn), parentUpdates, runVersionSource. Component: `useCollectionFields` (cache), `FieldSelect`, `ValueSuggest`, `CondList` (dùng chung when+guard).
- Verified: build sạch, offline 41/41, DOM check editor mới (5 mục, segmented mode, 0 textarea JSON). i18n bổ sung đủ key mới (R1).

## P2 — đã làm (2026-07-15, v0.2.0) — QUY TẮC NHÚNG (inline scopes), không cần bảng ngoài
- **`ruleSource: 'inline'`**: quy tắc định nghĩa THẲNG trong config qua `scopes[]` — mỗi scope = {name, when[] (điều kiện trên cha, semantics = guard), rules[] (dòng quy tắc)}. `ruleFields[]` chuẩn hoá cột của dòng quy tắc (text/number/select+options) → UI render lưới nhập động. Server: `resolveInlineRules(config, parent)` (pure, trong generateCore) lọc scope theo `when` → engine chạy y hệt collection mode. **Không cần `commission_rule_groups`/`commission_rules` nữa** — chỉ cần bảng dữ liệu đầu vào (orders/employees) + bảng đích.
- **UI mục "2. Quy tắc"**: Segmented "Định nghĩa ngay tại đây" | "Lấy từ bảng dữ liệu". Inline = editor cột chuẩn hoá (collapsed) + danh sách scope card (tên, bật/tắt, nhân bản ⧉, điều kiện khi-nào-dùng, lưới quy tắc). Collection mode giữ nguyên (đúng cho master data lớn như định mức BOM import Excel). cleanConfig tự bỏ field của mode không dùng.
- **Template mới (mặc định)**: "Hoa hồng — quy tắc nhúng" nhúng đủ G1–G4 × 15 rule (60 dòng, sinh programmatic) + ruleFields chuẩn.
- **Verified**: offline 41/41 (thêm scenario C: G1 match → 15 dòng/11.344.000; G4 đổi base_field; no-match → 0; scope disabled → 0); live previewInline với config inline trên server thật → 15 dòng/11.344.000, chỉ scope G1 áp, **không truy vấn bảng quy tắc ngoài**.
- Trade-off ghi nhận: quy tắc nhúng = config (admin sửa trong Settings, không qua block/ACL/change-log); bảng ngoài = data (business user sửa, import Excel, audit). Giữ CẢ HAI mode là chủ đích.

## P1 — đã làm (2026-07-15, v0.1.3) — CONFIG UI THÂN THIỆN, gom 1 chỗ, browser-verified
- **Editor thân thiện (v0.1.3)**: BỎ ô JSON thô, gom TẤT CẢ vào 1 chỗ dạng control + bảng thêm/xoá dòng, chia 7 CollapsibleSection (Chung / Khớp / Biến trung gian / Cột sinh ra / Gộp&làm tròn / Ghi vào đâu / Guard&cập nhật cha). Mảng (lineOutputs/matchMap/deriveVars/guard/parentUpdates) = RowList thêm/xoá; string[] (preload/groupBy/sumFields/ruleAppends) = tag input; ruleFilter/guard value tự nhận kiểu true/false/số. Dùng `CollapsibleSection`/`SettingRow` của @ptdl/shared (house style). **Browser-verified**: trang settings load (/admin/settings/line-generator/index), editor 7 section + 85 control render, "Run preview" trong UI → 15 dòng. (screenshot timeout = trap view NocoBase đã biết, verify qua DOM inspection.)

- **Trang settings** `RulesManager.tsx` (2 lane: v1 `pluginSettingsManager.add`, v2 `addMenuItem`+`addPageTabItem`): list bộ sinh + editor drawer. Field top-level = control (title/key/enabled/sourceCollection/ruleCollection/targetPath/regenPolicy); phần nâng cao (matchMap/deriveVars/lineOutputs/guard/parentUpdates…) = **JSON editor có validate**; nút "Nạp mẫu" (hoa hồng / BOM từ `templates.ts`); nhân bản/xoá.
- **Live preview trước khi lưu**: action server MỚI `ptdlLineGen:previewInline` (nhận config INLINE chưa lưu + filterByTk → dry-run). Editor có picker bản ghi mẫu + "Chạy thử" → bảng kết quả + đếm skip/lỗi.
- **Save path**: create/update `ptdl_linegen_rules` với `{config}` → beforeSave denormalize key/title/enabled/sourceCollection.
- **Live-verified**: previewInline config hoa hồng → 15 dòng/11.344.000; create qua {config} → beforeSave denormalize đúng; rulesFor liệt kê rule mới. Bundle grep xác nhận cả 2 lane deploy. Offline core vẫn 30/30.
- **Templates bundled**: `COMMISSION_TEMPLATE` (đủ) + `BOM_TEMPLATE` (mẫu nổ định mức: sourceLinesPath + groupBy+SUM — nửa còn lại của engine, user sửa tên field).

**P1 còn lại (nhỏ, cần browser)**: click thật trang settings trong UI (data plumbing đã proven, component theo pattern print-template đã chạy). BOM case chạy thật = cần schema orders_lines/bom_lines (chưa dựng).

## P0 — đã làm (2026-07-15)
- **Core thuần** `src/shared/generateCore.ts` (match dot-path, deriveVars, skipIf, required-null drop, group+SUM, largest-remainder round, hash) — NO DB, test bằng Node.
- **Người nhận động**: `evalExpr.ts` inject scope {parent,src,rule,user,runVersion,derived} + helper `REL/NUM/YMONTH/NOW` quanh vendored formula engine (copy self-contained từ plugin-formula — server-lane không import shared subpath được).
- **Server**: `generator.ts` (load preload appends + rules qua filter dot-path, generateCore, ghi transaction + parentUpdates + WS live-refresh), `plugin.ts` (collection `ptdl_linegen_rules` config-JSON + resource `ptdlLineGen` rulesFor/preview/generate, ACL, `ctx.body` RAW tránh double-wrap).
- **Client 2 lane**: action `GenerateLinesActionModel` (show-if theo guard, dropdown nếu >1 rule, dialog preview→commit) + i18n song ngữ VN-as-key.
- **Test**: `test/commission.test.ts` — G1 đủ người → 15 dòng (amount/person/dept/period đúng, tổng 11.344.000); thiếu QL/NV → 6 dòng + 9 skip required-null. `bash test/run.sh` → 30/30.
- **Build**: `build-env/recipes/run-line-generator-build.sh` (vendored formulajs bundle, không cần stub) → tgz + add-markers. Verified dist: plugin.js/generator.js/generateCore.js/evalExpr.js + vendor 225KB.
- **Seed + deploy**: `seed/order-commission.config.json` (27 preload appends), `seed/deploy-nb-local.sh`, `seed/COMMISSION-SETUP.md` (Section I checklist + nghiệm thu).

**Còn lại cho P0-done (cần môi trường)**: tạo Section I schema (departments/positions/employees+orders fields/order_commissions/seed G1–G4) → deploy + enable → seed config row → bấm nút trên đơn thật → đối chiếu order_commissions. Deploy vào nb-local ĐANG CHẠY + restart = state change; chờ greenlight hoặc drive tương tác.

## 1. Mục tiêu & use case

Một cơ chế generic, config-driven, phủ được:

| Use case | Nguồn | Bảng quy tắc | Dòng sinh ra |
|---|---|---|---|
| Nổ BOM / định mức | Dòng đơn hàng (SP × SL) | Định mức: SP → NVL × SL/đv | Nhu cầu NVL (gộp NVL trùng) |
| Chia hoa hồng | Đơn hàng (doanh thu, công lắp, LN gộp…) | Tỉ lệ: vai trò/NS → cột cơ sở × % | Dòng hoa hồng từng người |
| (mở sau) Phân bổ chi phí, lương khoán | bản ghi cha bất kỳ | bảng hệ số bất kỳ | dòng con bất kỳ |

**Quyết định thiết kế đã chốt (từ thảo luận):**
1. **Snapshot** — sinh bản ghi thật, cố định tại thời điểm bấm. Đổi định mức/tỉ lệ sau KHÔNG ảnh hưởng chứng từ đã sinh.
2. **Regenerate** = xóa dòng máy-sinh cũ + tạo mới; cảnh báo nếu có dòng đã bị sửa tay.
3. **BOM 1 cấp** ở v0; nổ đệ quy đa cấp để v1 (kèm chống vòng lặp).
4. **Đơn vị**: v0 quy ước định mức khai theo đơn vị kho của NVL; v1 thêm bảng quy đổi (1 cuộn = 50m).
5. Làm tròn tiền: **largest remainder** — dòng cuối nhận phần dư để tổng khớp tuyệt đối.

## 2. Data model

### 2.1 Collection config: `ptdl_linegen_rules` (mỗi bản ghi = 1 "bộ sinh")

```
key            uid      — định danh, dùng trong marker
title          string   — tên hiển thị (song ngữ qua i18n key hoặc nhập 2 cột)
enabled        boolean
sourceCollection  string   — collection cha đặt nút (vd: orders)
sourceLinesPath   string?  — assoc bảng con làm đầu vào (vd: orderLines);
                             null = dùng chính bản ghi cha làm 1 dòng nguồn (case hoa hồng)
ruleCollection    string   — collection quy tắc (vd: bom_lines, commission_rules)
matchMap          json     — [{ruleField, sourceField}] điều kiện join, vd product_id↔product_id;
                             ruleField cho phép DOT-PATH xuyên quan hệ
                             (vd 'commission_rule_group.shipping_type' ↔ 'shipping_type' —
                             NocoBase filter hỗ trợ sẵn filter theo assoc);
                             [] = mọi rule áp cho mọi dòng nguồn (hoa hồng theo vai trò)
ruleFilter        json?    — filter thêm trên bảng quy tắc (vd: active=true; hỗ trợ nested
                             'commission_rule_group.is_active')
preload           json?    — [assocPath] appends khi load bản ghi cha, vd
                             ['responsible_staff.direct_manager', 'responsible_staff.position']
                             → formula đi được vào quan hệ đã preload
lineOutputs       json     — [{targetField, formula, required?}] — mỗi cột đích = 1 biểu thức
                             scope biến: src.* (dòng nguồn), rule.* (dòng quy tắc), parent.* (bản ghi cha),
                             user.* (người bấm nút), runVersion
                             helper: REL(record, path) — đi theo quan hệ ĐỘNG đã preload,
                             path ghép được từ dữ liệu rule, vd:
                               employee_id = "REL(parent, CONCAT(rule.based_on,
                                              IF(rule.recipient='self', '', '.' & rule.recipient), '.id'))"
                             required:true + kết quả null/undefined → DROP dòng đó (skip, không lỗi),
                             ghi vào report của preview/kết quả
                             vd BOM:  qty = "src.quantity * rule.qty_per_unit * (1 + rule.scrap_pct)"
                             vd HH:   amount = "parent[rule.base_field] * rule.rate"
skipIf            json?    — biểu thức trên (src, rule, parent): true → bỏ cặp này trước khi evaluate
                             (vd rule đòi based_on mà cột đó null trên đơn)
groupBy           json?    — [field] khóa gộp (vd material_id / staff_id); cột số = SUM; null = không gộp
targetPath        string   — assoc hasMany trên cha nhận dòng sinh ra (vd: materialRequirements)
regenPolicy       string   — 'replace' (default) | 'append' | 'block-if-edited' | 'version'
                             'version' = KHÔNG xóa dòng cũ; stamp run_version = số lần chạy + 1
                             vào field khai ở versionField; báo cáo lọc theo max(run_version)
guard             json?    — điều kiện trên bản ghi cha, server-enforced trước khi chạy
                             (vd status='Đã thanh lý' AND is_commission_created=false);
                             client dùng cùng condition (condition-kit shared) làm show-if nút
parentUpdates     json?    — [{field, formula}] cập nhật bản ghi CHA trong cùng transaction sau khi sinh
                             (vd is_commission_created=true, commission_status='COMPLETED',
                             rerun_count=parent.rerun_count+1, last_rerun_at=NOW(), last_rerun_by=user.id)
rounding          json?    — {fields:[...], precision, remainderToLast:true}
validations       json?    — v0: {sumField, sumEquals} (tổng % = 100); v1: {stockCheck:{...}}
```

Import qua `db.import({directory: collections/})` giống change-log.

### 2.2 Marker trên dòng sinh ra

Bảng con đích cần 2 cột (plugin tự thêm qua field options hoặc yêu cầu user tạo):
- `_genRule` (string) — key của rule đã sinh
- `_genHash` (string) — hash payload lúc sinh → so sánh để phát hiện dòng bị sửa tay khi regenerate

## 3. Server

### 3.1 Resource riêng `ptdlLineGen`

```
POST /api/ptdlLineGen:generate   { ruleKey, filterByTk, dryRun? }
POST /api/ptdlLineGen:preview    = generate với dryRun=true (không commit)
```

⚠️ `ctx.body = kếtQuả` RAW — không bọc `{data:...}` (trap double-wrap đã dính ở action cũ).

### 3.2 Luồng generate

1. Load bản ghi cha (kèm `preload` appends) + dòng nguồn (`sourceLinesPath`, hoặc [cha] nếu null).
2. **Guard check** server-side (`guard`): fail → 400 kèm lý do, không chạy tiếp.
3. Load rule khớp: 1 query `ruleCollection` với `IN` theo matchMap (hỗ trợ dot-path) + ruleFilter.
4. Với mỗi cặp (dòng nguồn × rule khớp):
   - `skipIf` true → bỏ cặp, ghi note.
   - Evaluate từng `lineOutputs.formula` bằng **`evaluateFormula(formula, {src, rule, parent, user, runVersion})`** — engine tái dùng từ plugin-formula (xem §5); helper `REL()` đi quan hệ động.
   - Output `required` ra null → DROP dòng (skip có ghi nhận, không error).
5. Group-by + SUM các cột số; làm tròn largest-remainder nếu bật.
6. Validations: tổng % (v0), check tồn (v1). Fail → trả lỗi có cấu trúc `{ok:false, errors:[{material, need, have}]}`, KHÔNG ghi gì.
7. `dryRun` → trả preview rows + danh sách skip/drop, dừng.
8. Transaction:
   - policy `replace`: xóa dòng đích có `_genRule = ruleKey`; nếu có dòng `_genHash` lệch (đã sửa tay) và policy `block-if-edited` → abort + báo danh sách.
   - policy `version`: giữ nguyên dòng cũ, stamp `run_version = runVersion` vào dòng mới.
   - bulkCreate dòng mới qua repository của assoc `targetPath` (nested create — nhớ `updateAssociationValues` nếu đi qua form values).
   - **`parentUpdates`**: update bản ghi cha (flags, counter, timestamp, user) trong cùng transaction.
9. Emit WS live-refresh (`ws:sendToCurrentApp`, pattern liveRefresh.ts) → bảng con trên UI tự reload; computed fields downstream (tồn kho, giá thành) tự recompute theo trigger create sẵn có của plugin-formula.

⚠️ SES strict mode: engine formula đã chạy ổn trong server (computed field) — không dùng `new Function` mới nào có param trùng tên; mọi công thức phải test trên server thật, không tin smoke-test Node.

## 4. Client (2 lane: /admin v1 + /v/ v2)

### 4.1 Action `GenerateLinesActionModel`

- `shared/generateLinesAction.tsx` → `defineGenerateLinesActionModel(Base)` — pattern y hệt print-template (`define(...)` + `registerFlow(...)`, đăng ký cả 2 lane; lane v1 resolve `ActionModel` bằng retry loop).
- Vị trí: record action (row + detail/form toolbar). Bind theo `sourceCollection` của rule.
- UX bấm nút:
  1. Nếu >1 rule enabled cho collection này → dropdown chọn rule.
  2. Gọi `preview` → dialog hiện bảng dòng sẽ sinh (NVL/nhân sự, số lượng/tiền, cột "cách tính") + cảnh báo (thiếu tồn, dòng sửa tay sẽ bị thay).
  3. Confirm → gọi `generate` → toast kết quả + block refresh (WS đã lo).

### 4.2 Settings page quản lý rules

- Đăng ký đúng API từng lane: v1 `pluginSettingsManager.add()`, v2 `addMenuItem`+`addPageTabItem` (sai lane = trang biến mất im lặng).
- Dùng **@ptdl/shared settings-kit** (SettingsGrid / fi / CollapsibleSection; `rx()` KHÔNG dùng `{{$deps}}`) + **field-picker của shared** cho sourceCollection / assoc / ruleCollection / matchMap / groupBy / targetPath.
- Ô công thức: v0 textarea + nút "Chạy thử" (gọi `preview` với 1 bản ghi mẫu); v1 cân nhắc tái dùng formula input UI của plugin-formula.
- Nút "AI viết hộ" cho ô công thức — tái dùng `AiCodegenButton` (@ptdl/shared) như computed-field đã làm.

### 4.3 i18n — BẮT BUỘC song ngữ en+vi

NS riêng, `tExpr`, `addResources` cả 2 lane; wire `setSharedT`/`SHARED_NS` cho field-picker + condition-kit của shared (23 keys). Client i18n đọc `app.i18n` (window global fail trên /v/).

## 5. Tái dùng engine formula

`evaluateFormula` hiện nằm ở `plugin-formula/src/shared/formulaEngine.ts` (thuần TS, không phụ thuộc lane). Phương án: **extract sang `@ptdl/shared`** (module `formula-engine`), plugin-formula và plugin-line-generator cùng import — đúng rule R2 (reuse shared, không copy-paste). Sau extract: rebuild shared + rebuild cả 2 plugin consumer.
Fallback nếu extract tốn: v0 import trực tiếp từ dist của `@ptdl/plugin-formula` (dependency), extract ở P1.

## 6. Phases

- **P0 — core server + action v2** (chứng minh e2e BOM):
  collection config (seed tay, chưa UI) → resource generate/preview → action button lane v2 → e2e: đơn A×10 B×5 → nhu cầu NVL gộp đúng, regenerate đúng, WS refresh, tồn kho computed tự trừ.
- **P1 — config UI + lane v1 + preview dialog + rounding + validate tổng %**. Case hoa hồng chạy được ở đây (chỉ là config khác, không cần code thêm nhờ formula).
- **P2 — hardening**: block-if-edited, cảnh báo sửa tay chi tiết, template rule mẫu (BOM / hoa hồng) bấm 1 nút tạo sẵn, AI viết hộ công thức.
- **P3 — mở rộng sản xuất**: check tồn kho trước ghi (từ chối + báo thiếu), bảng quy đổi đơn vị, BOM nổ đệ quy đa cấp (chống vòng), % hao hụt vào template mẫu.

## 7. Deploy & verify (nb-local)

1. Build tgz → **add-markers đúng version vừa build** (trap `find|head -1` dính tgz cũ) → verify marker.
2. Deploy vào `node_modules/@ptdl` (KHÔNG storage/plugins) → `pm2 restart index`.
3. Plugin MỚI: tạo bảng `ptdl_linegen_rules` bằng tay + seed + `flags=1` (manual DB INSERT không tự tạo bảng).
4. Verify `pm:listEnabled` có clientV2Url; grep bundle đã extract (SWC hex-escape `à`→`\xe0`).
5. E2E trên /v/ thật (SES + double-wrap chỉ lộ trên server thật).

## 8. Rủi ro

| Rủi ro | Né bằng |
|---|---|
| Formula user viết chạm SES/lỗi runtime | preview bắt buộc trước generate; evaluate try/catch per-line, báo dòng lỗi |
| Xóa nhầm dòng user nhập tay | chỉ xóa `_genRule` khớp; `_genHash` phát hiện sửa tay |
| Race 2 người cùng bấm | transaction + xóa-theo-marker idempotent; sau cân nhắc lock theo (ruleKey, parentId) |
| Nested create không nhận assoc | dùng repository của assoc trực tiếp phía server, không đi qua form |
| Bảng đích thiếu cột marker | validate config lúc save rule: check field tồn tại, báo ngay trên settings UI |

## 9. Đối chiếu case thực tế: hoa hồng logistics (spec 2026-07-15)

Spec: đơn hàng (orders) khi status="Đã thanh lý" → bấm nút → sinh `order_commissions` theo
`commission_rule_groups` (G1–G4, match shipping_type + quotation_method) × `commission_rules`
(based_on / recipient / base_field / rate). Đây là **case nghiệm thu chính cho nhánh hoa hồng** —
plugin phải chạy được spec này thuần bằng config, không code riêng.

Mapping config (1 bản ghi `ptdl_linegen_rules`):

```
sourceCollection = orders          sourceLinesPath = null (cha là dòng nguồn duy nhất)
ruleCollection   = commission_rules      ← DÙNG TRỰC TIẾP bảng khách đã dựng, không bắt migrate
matchMap  = [{'commission_rule_group.shipping_type'   ↔ shipping_type},
             {'commission_rule_group.quotation_method' ↔ quotation_method}]
ruleFilter = {is_active: true, 'commission_rule_group.is_active': true}
preload    = [responsible_staff|transaction_staff|liquidation_employee].[direct_manager|indirect_manager|position|department]
skipIf     = "REL(parent, rule.based_on) == null"          (đơn không có NV đó → bỏ cả rule)
lineOutputs:
  employee_id   = REL(parent, based_on + recipient path)    required → manager null = drop dòng
  base_field    = rule.base_field
  base_value    = parent[rule.base_field]
  rate          = rule.rate
  commission_amt= parent[rule.base_field] * rule.rate
  commission_rule_name / shipping_type / quotation_method   (snapshot)
  position / department = REL(person).position.name / .department.name
  period_month  = TEXT(parent.liquidation_date, 'YYYY-MM')
  run_version   = runVersion
groupBy = null (giữ từng dòng rule để đối soát)
targetPath = orders.order_commissions      regenPolicy = 'version'
guard = status='Đã thanh lý' AND is_commission_created=false      (server + show-if nút)
parentUpdates = is_commission_created=true, commission_status='COMPLETED',
                rerun_count+1, last_rerun_at=NOW(), last_rerun_by=user.id
```

5 extension đã bổ sung vào thiết kế vì case này: matchMap dot-path xuyên quan hệ; `preload` +
helper `REL()` cho recipient động (self/direct_manager/indirect_manager); `skipIf` + `required`
(null = skip lặng, đúng lưu ý trong spec); regenPolicy `'version'` + biến `runVersion` (giữ lịch
sử chạy lại); `guard` + `parentUpdates` (thay thế hoàn toàn workflow post-action trong spec —
không cần cấu hình workflow NocoBase).

Ngoài phạm vi plugin (NocoBase core lo): tạo bảng departments/positions/order_commissions, thêm
field vào employees/orders, seed dữ liệu G1–G4.

⚠️ Chuẩn hóa dữ liệu rate: lưu THẬP PHÂN (0.25% = 0.0025, KHÔNG phải 0.25); UI hiện tại hiển thị
2 số lẻ nên 0.0025 hiện thành "0.00" — cần format cột dạng % trong UI để người nhập không nhầm ×100.
