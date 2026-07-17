# Audit trùng lặp code @ptdl ↔ `@ptdl/shared` (2026-07-15)

Rà soát read-only toàn bộ `packages/@ptdl/plugin-*` so với `@ptdl/shared`. Loại trừ `shared/**`, `dist/**`, `node_modules/**`, và lib vendor (`formulajs.browser.js`).

> **Kết luận đầu dòng:** roadmap trong `SHARED-LIBS-PROPOSAL.md` đã **~90% xong** — color, icon, field-picker, token-insert, escapeHtml/get, settings-kit, condition-UI, loginKit, realtime đều đã gom & import rộng rãi. Phần **column picker** và **HTML template chèn biến** mà bạn hỏi **đã nằm trong shared** (`FieldPickerCascader`, `FieldTokenTextArea`, `getCaretElement`/`insertAtCaret`, `interpolate`) và được dùng đúng ở đa số plugin.
>
> Tồn dư thật nằm ở: **(a) format số/ngày** — `formula` chưa bao giờ migrate + 3 plugin giữ bản re-impl; **(b) 2 nhóm CHƯA từng được đề xuất: relative-time ("X phút trước") và aggregate (sum/avg/min/max/groupBy).**

---

## A) Bảng tồn dư (đã dedup)

### 1. Format số — canonical `formatNumber` / `makeNumberFormatter`
| Plugin | file:line | Trạng thái | Ghi chú |
|---|---|---|---|
| data-viz-echarts-pro | `common/format.ts:8` | USES-SHARED | Re-export `makeNumberFormatter` (nơi khai sinh bản canonical). |
| **formula** | `shared/formulaFormat.ts:30-40` `formatNumberValue` | **DUPLICATE** | `toFixed`+`\B(?=(\d{3})` với `,` = `makeNumberFormatter({decimals,thousandSep:','})`. **Chưa migrate**, không có trong list "giữ local". |
| **spreadsheet-view** | `shared/spreadsheet.tsx:1648-1656` `formatNum` | **DUPLICATE** | `toFixed`+`\B(?=(\d{3})` `,` giống hệt. |
| **field-enhancements** | `shared/numberFieldModel.tsx:39-53` `addThousands`/`formatDisplay` | **DUPLICATE** | `clampDecimals:62` là input-mask (legit-local). |
| **enhanced-table-block** | `client/EnhancedTableBlockModel.tsx:128-133` `formatStat` | **DUPLICATE** | `toLocaleString('en-US')` = `formatNumber`. |
| enhanced-table-block | `…EnhancedTableBlockModel.tsx:54-125` `formatNumberLikeSample` | LEGIT (sniffing) | Nhưng khối ráp cuối (:116-124) re-derive `makeNumberFormatter` — gọi lại được sau khi suy ra sep. |
| block-custom-html | `client/render.ts:199-205` `helpers.fmt` | LEGIT | `toLocaleString(locale)` mặc định `vi-VN` + forward `Intl` opts (currency/percent) — **khác** shared (group `.`). |
| print-template | `shared/helpers.ts:223-245` HB `formatNumber` | LEGIT | Parser mask Excel (`#,##0.00`, `₫/$/€/£`, `%`) — superset. |
| filter-tree / menu-enhancements | `filterTree.tsx:922` / `menuBadge.tsx:74` | SHAREABLE | `Intl.NumberFormat({notation:'compact'})` — shared có `compact` nhưng output K/M/B thủ công khác. |
| formula | `shared/vendor/formulajs.browser.js` | VENDORED | Excel fn lib — bỏ qua. |

### 2. Format ngày — canonical `formatDate`
| Plugin | file:line | Trạng thái | Ghi chú |
|---|---|---|---|
| print-template | `shared/helpers.ts:7` | USES-SHARED | `import { formatDate } from '@ptdl/shared/format'` (đã migrate). |
| **formula** | `shared/formulaFormat.ts:17-28` `formatDateValue` | **DUPLICATE** | Token `.replace(/YYYY/…)` = subset shared. Trả `null` khi invalid → cần wrapper. |
| **block-custom-html** | `client/render.ts:206-226` `helpers.date` | **DUPLICATE** | Subset — **nhưng hỗ trợ token `H` (24h 1 chữ số) mà shared thiếu** → swap cần shared thêm `H`. |
| **change-log** | `shared/changeLogClient.ts:62-68` `formatDateFriendly` | **DUPLICATE** | Đúng `formatDate(v,'DD/MM/YYYY HH:mm')` — swap tầm thường. |
| field-enhancements / gsheet-sync / change-log | `relativeDateModel.tsx:122` / `writeback.ts:28,42`,`plugin.ts:324` / `changeLogClient.ts:146` | LEGIT | dayjs sẵn / ISO cho Sheets API / `toLocaleString` chủ ý. |

### 3. Aggregate / data-helper (CHƯA có trong shared → SHAREABLE)
| Plugin | file:line | Ghi chú |
|---|---|---|
| block-custom-html | `client/render.ts:171-340` `buildHelpers` | Giàu nhất: `sum/avg/count/min/max/groupBy/keys/first/table/json` (+fmt/date/timeAgo/icon/esc). Seed tự nhiên cho module shared. |
| print-template | `shared/helpers.ts:77-79` `arraySum`/`arrayAvg` | Re-impl sum/avg. |
| spreadsheet-view | `shared/spreadsheet.tsx:770-785` | `sum/avg/min/max/count/unique/range/median/filledPct`. |
| filter-tree | `shared/filterTree.tsx:909,1001` | reducer sum/count cho facet. |
| enhanced-table-block | `client/models/EnhancedTableBlockModel.tsx:43-45` | sum/avg cho column summary. |

≥5 plugin re-derive cùng reducer với null-handling hơi khác.

### 3b. Relation-appends cascader — ✅ GOM XONG (2026-07-15, sau audit)
Dup audit gốc BỎ SÓT: cascader "chọn quan hệ nhiều cấp → tag" build từ `collections:get?appends=fields` (depth 3) tồn tại 2 bản gần giống hệt:
| Plugin | Bản local (đã xoá) | Trạng thái |
|---|---|---|
| print-template | `TemplateManager.tsx` `AppendsPicker`+`buildRelOptions`+`relationFields`+`relCache` | **USES-SHARED** `RelationAppendsPicker` (hint Handlebars → prop `hint`) |
| line-generator | `RulesManager.tsx` `RelationAppendsPicker`+`buildRelOptions`+`fetchFields`+`fieldsCache` | **USES-SHARED** `RelationAppendsPicker`; `useCollectionFields` chuyển sang shared `getFields` (cùng cache với field-picker) |

→ Canonical: `@ptdl/shared/relationPicker.tsx` (`RelationAppendsPicker` + `buildRelationOptions`, props `collectionName/depth=3/dataSourceKey/hint`), i18n `st()` key `＋ Thêm quan hệ ▾` (thêm vào `sharedEnUS`; xoá key chết ở locale 2 plugin). line-generator trước đó CHƯA wire shared i18n → đã thêm `addResources(SHARED_NS)`+`setSharedT` cả 2 lane. Build shared + 2 consumer, deploy nb-local, served bundle verify (marker `Add relation`, đúng 1 `expandTrigger`/bundle).

### 4–9. Đã gom sạch (chỉ liệt kê ngoại lệ)
- **Field picker (4)**, **Token insert (5)**, **escape/get (7)**, **color/icon (9)**: **CONSOLIDATED**. Bản local còn lại đều justified (filter-tree GROUP-BY builder; formula `AutoComplete` editor; formula inline `escapeHtml` cố ý zero-import; branding `adjustColor`/`isLightColor` single-consumer).
- **Template interpolate (6)**: block-custom-html `render.ts:342` **KHÔNG phải dup** — là **`new Function()` JS-eval**, khác hẳn `interpolate` token-substitution. **Đừng swap.**
- **Condition (8)**: conditional-format + menu-enhancements đã USES-SHARED. `filter-tree:381-408` (`SCOPE_OPS`/`OPS_*`/`DATE_PRESETS`) SHAREABLE-deferred — build server-JSON nên chỉ share được phần UI taxonomy, giữ builder.

---

## B) Kế hoạch gom (xếp theo ROI)
1. ~~**`formula/formulaFormat.ts` → shared**~~ ✅ **XONG (source, 2026-07-15)** — `formatDateValue`→`formatDate` (giữ null-guard), `formatNumberValue` set-decimals branch→`makeNumberFormatter`, unset branch giữ local (preserve `String(n)` precision dạng mũ mà `toFixed` sẽ phá — đúng caveat). Import `@ptdl/shared/format` (subpath pure, client-only chain, server-safe — đã verify). **Validated 176/176 case OLD≡NEW** (6 date-preset × dates + numbers incl. 1e-7/1e21/0.1/neg). Build hoãn tới khi `task_d1aef206` (field-picker) xong để tránh đụng build-env staging (formula là consumer của field-picker → sẽ được task đó rebuild luôn).
2. **spreadsheet `formatNum` + field-enh `formatDisplay` → `makeNumberFormatter`** (đều hardcode `,` = mặc định shared). Giữ `clampDecimals`.
3. **change-log `formatDateFriendly` → `formatDate(v,'DD/MM/YYYY HH:mm')`** — output byte-identical.
4. **enhanced-table `formatStat` → `formatNumber`**; khối ráp cuối `formatNumberLikeSample` → `makeNumberFormatter` (giữ sniffing).
5. **`shared/relativeTime`** — ✅ **EXTRACTED + 1 consumer migrated (2026-07-17).** Module `relativeTime(value,{now,units,past,future,justNow,soon})` với default = **đúng vocabulary vi của block-custom-html `timeAgo`** (behavior-preserving by construction). Migrated: `block-custom-html` (`render.ts` `timeAgo` → `relativeTime(v)`, ship 0.12.3). **CÒN LẠI:** `change-log relativeTime` (bilingual + "tuần", ngưỡng w<5/mo<12 khác chút — migrate khi có thể test live để không trôi biên) và `field-enh` reduceUnit/todayLabel (day-distance + i18n plural — footgun `count`, giữ nguyên). Cả hai truyền `units`/`past`/`future` riêng khi migrate.
6. **`shared/aggregate`** — ✅ **EXTRACTED + 1 consumer migrated (2026-07-17).** `pluckNums/aggSum/aggAvg/aggCount/aggMin/aggMax/aggMedian/aggRange/groupBy`, một null-policy (khớp `buildHelpers`; min/max dùng `reduce` thay `Math.min(...xs)` → an toàn mảng lớn). Migrated: `block-custom-html buildHelpers` (sum/avg/count/min/max/groupBy → shared, ship 0.12.3). **CÒN LẠI:** enhanced-table/spreadsheet/formula/data-viz reducer sets → trỏ vào shared khi rebuild từng plugin.
7. **filter-tree condition taxonomy** → trỏ `SCOPE_OPS`/`OPS_*`/`DATE_PRESETS` vào shared `OP_LABELS`/`operatorsForMeta`/`DATE_PRESETS` (chỉ UI; giữ builder server-JSON). Rủi ro trung bình (plugin đang chạy).
8. **compact-number** (filter-tree:922, menu-enhancements:74) → chỉ converge nếu chấp nhận diff output K/M/B thủ công vs `Intl`; hoặc thêm flavor `intlCompact`.

### ⚠️ Diff hành vi chặn swap ngây thơ
- `decimals` unset: formula/spreadsheet giữ full precision; `makeNumberFormatter` mặc định `toFixed(0)`.
- `helpers.fmt` dùng `toLocaleString('vi-VN')` → group `.` + forward currency/percent → **KHÔNG** tương đương shared (`,`). Giữ hoặc mở rộng shared.
- `helpers.date` có token `H` (24h 1 chữ số); shared `formatDate` chưa → thêm `H` trước khi swap.
- `formatDateValue`/`formatNumberValue` trả `null` khi invalid; shared trả `toDisplayString(raw)` → wrapper tại call-site nào branch theo null.
- Bộ 3 relative-time có 3 vocabulary + chiến lược i18n khác nhau → API extract phải tham số hoá locale/style.

---

## C) Doc cần sửa (đã áp dụng ở lần cập nhật này)
- `SHARED-LIBS-PROPOSAL.md` §4b (list "giữ local") **thiếu 4 dup thật**: formula `formatNumberValue`+`formatDateValue`, spreadsheet `formatNum`, field-enh `formatDisplay`, change-log `formatDateFriendly`. Dòng "MIGRATE TẤT CẢ HOÀN TẤT" bị overstate — formula chưa từng nằm trong đợt migrate 9-consumer. → xem §10 (bổ sung).
- **Chưa đề xuất** relative-time & aggregate dù có 3 & 5 bản → thêm vào §10.
- **R2 vs proposal mâu thuẫn về condition:** R2 cấm copy-paste `condition`, nhưng `filter-tree` có trước rule và giữ taxonomy riêng (proposal §condition thừa nhận là deferred). → R2 mang ngoại lệ filter-tree.
- Proposal §condition liệt kê `menu-enhancements` là "chưa migrate" → **stale**, đã import `ConditionRow`/`opNeedsNoValue`.
