> ⚠️ **ĐÃ GỠ HẲN (v0.1.39, 2026-07-16).** Rollup field-interface + RollupManager engine đã xoá. Lý do:
> **computed column (aggregate) đã cover HOÀN TOÀN** — dùng "Công thức tự tính" với
> `SUM(data.<relation>.<field>)` (roll-up N tầng, kéo quan hệ, số học, IF… + trang quản lý tập trung + AI).
> Field cũ `products.on_hand` đã migrate sang 1 computed rule (live-verified cascade). **Gộp-LỌC cũng đã
> có (v0.1.40)**: `SUMIFS(data.items.amount, data.items.active, true)` = 200 (khớp rollup filter cũ) —
> fix `_crit` boolean-aware + override SUMIF/SUMIFS/COUNTIF(S)/AVERAGEIF(S) qua FILTER (xem formulaEngine.ts).
> Không còn khoảng trống nào so với rollup. Tài liệu dưới giữ làm lịch sử.

# Rollup field — tài liệu (đọc trước khi improve) — [REMOVED]

Feature thêm vào `@tuanla90/plugin-formula` (2026-07-13). Đây là **lane SERVER đầu tiên** của plugin
(trước đó server rỗng, mọi thứ client-side).

---

## 1. Bài toán & vì sao

User cần cột kiểu **`SUM(order_items.subtotal)`** trên bảng `order`, và **tự đồng bộ khi dòng con
(order_items) thêm / sửa / XÓA / dời sang order khác** — thay cho workflow đang phải viết tay.

**Không giải pháp có sẵn nào làm được:**
- **Built-in `@nocobase/plugin-field-formula`**: tính bằng `record.toJSON()` của chính record cha, chỉ
  chạy khi record CHA save, KHÔNG load quan hệ → không aggregate to-many, không nhảy khi con đổi.
- **@tuanla90 formula column (client)**: aggregate to-many được (auto-pluck `data.order_ids.amount`) nhưng
  **live client-only** → chỉ hiển thị, không lưu (không filter/sort/export/title được), không phủ server.
- NocoBase core **không có "Rollup field"** kiểu Airtable.

→ Rollup = **field thật lưu DB trên bảng cha** + **hook trên bảng CON** để tự tính lại.

> Phân biệt với nhu cầu "label per-row theo điều kiện" (đã giải quyết bằng built-in formula field làm
> title field, hoặc JS item) — xem §8. Rollup KHÁC: nó là aggregate qua quan hệ.

---

## 2. Trạng thái

| Phần | Trạng thái |
|---|---|
| Server core (hook + recompute + backfill) | ✅ XONG, verified e2e qua API |
| Client field interface (Add field → Rollup) | ✅ XONG (MVP text input), verified qua registry |
| Hàm gộp: SUM / COUNT / AVG / MIN / MAX | ✅ |
| Lọc dòng con (filter) | ✅ |
| Dropdown động cho relation/child-field | ❌ chưa (MVP gõ tay) — xem §7 |
| Lane classic `/admin` collection manager | ❌ chưa (chỉ đăng ký ở client-v2) |
| belongsToMany (m2m) rollup | ❌ chưa (chỉ hasMany/hasOne) |

---

## 3. File

```
src/server/rollup.ts   — RollupManager (toàn bộ logic server)
src/server/plugin.ts   — wire: scan lúc afterStart + rescan khi field đổi + action recompute
src/client-v2/rollupInterface.tsx — PtdlRollupFieldInterface (field interface UI)
src/client-v2/index.tsx — đăng ký: this.app.addFieldInterfaces([PtdlRollupFieldInterface])
```

---

## 4. Cấu hình (config shape)

Rollup là field thật (type `double`/`integer`/`bigInt`) mang blob option:

```jsonc
// field.options.ptdlRollup
{
  "relation": "order_items",  // tên field hasMany/hasOne TRÊN bảng cha
  "fn": "sum",                // sum | count | avg | min | max
  "field": "subtotal",        // field con để gộp (bỏ qua nếu count)
  "filter": { "active": true } // optional; object HOẶC chuỗi JSON (server tự parse)
}
```

`readRollupConfig()` đọc `field.options.ptdlRollup` (runtime) hoặc `field.ptdlRollup` (khi API trả top-level).

---

## 5. Cách hoạt động (data flow)

1. **`scan()`** (`RollupManager`): duyệt mọi collection → field có `ptdlRollup` → dựng danh sách `RollupDef`
   `{parentCollection, fieldName, childCollection, foreignKey, sourceKey, fn, field, filter}`. Lấy
   `childCollection`/`foreignKey`/`sourceKey` từ **field quan hệ** `relation` trên cha.
   - Gọi lúc `app.on('afterStart')` (đợi user collections load) + mỗi `db.on('fields.afterSave/…')`
     (rescan khi thêm/xóa/sửa rollup field).
2. **Hook trên bảng con** (`ensureChildHook`, idempotent qua `hookedChildren` Set):
   - `${child}.afterCreateWithAssociations` → recompute cha (FK hiện tại).
   - `${child}.afterUpdate` (RAW — xem §6) → recompute cha mới + cha cũ (nếu FK đổi).
   - `${child}.afterDestroy` → recompute cha (FK của bản ghi vừa xóa).
3. **`recomputeParent(def, parentKey)`**: chạy trong `transaction.afterCommit` →
   - `childRepo.aggregate({ method: fn, field, filter: {$and:[{[fk]:parentKey}, userFilter]} })`
     (count dùng `childRepo.count`).
   - sum/count rỗng → 0; avg/min/max rỗng → null.
   - `parentRepo.update({ filter:{[sourceKey]:parentKey}, values:{[fieldName]:value}, hooks:false })`.
4. **Action `POST /api/ptdlRollup:recompute?collection=&field=`** = backfill/sửa lệch toàn bảng (ACL `loggedIn`).

---

## 6. CẠM BẪY (đã trả giá — đừng lặp lại)

1. **FK-move phải hook `afterUpdate` RAW, KHÔNG `afterUpdateWithAssociations`.** Cái WithAssociations bắn
   với instance **đã reload** → `instance.previous(fk)` mất → không biết cha cũ → cha cũ không nhảy.
2. **Snapshot `instance.get(fk)` + `instance.previous(fk)` ĐỒNG BỘ trong handler**, TRƯỚC `afterCommit`.
   Sequelize reset `previous()` sau commit → đọc trong afterCommit sẽ sai.
3. **`afterCommit`** để aggregate đọc state đã commit (nhất là afterDestroy — dòng phải đã bị xóa).
4. **`hooks:false`** khi update cha → chống loop / không kích hoạt lại hook cha.
5. **filter có thể là chuỗi JSON** (UI textarea) → `recomputeParent` tự `JSON.parse`.
6. Chỉ nhận **hasMany/hasOne** (relOpts.type). m2m chưa xử (through/otherKey khác).

---

## 7. Nâng cấp tương lai (TODO)

- **Dropdown động trong form settings** (thay vì gõ tay):
  - `relation`: Select liệt kê field hasMany/hasOne của collection hiện tại. Built-in formula interface
    dùng scope **`{{ useCurrentFields }}`** + `Component` custom — tham khảo
    `nb-local/node_modules/@nocobase/plugin-field-formula/dist/client-v2/index.js` (interface class) +
    chunk `408.*.js` (editor component). Cần component đọc collection context trong field-config modal.
  - `child-field`: Select reactive theo `relation` → target collection → field số.
  - `filter`: đổi Input.TextArea JSON → NocoBase **Filter builder** trên child collection.
  - ⚠️ Sandbox không screenshot được → build UI cần verify ở browser thật.
- **Đăng ký ở lane classic** (`src/client/index.tsx`) nếu user dùng collection manager `/admin`.
- **belongsToMany (m2m)**: resolve through-table + 2 FK; recompute qua join.
- **Debounce/batch** khi bulk create/update nhiều con cùng lúc (mỗi con hiện recompute cha 1 lần →
  N lần cho N con cùng 1 cha). Tham khảo pattern debounce của `@tuanla90/plugin-gsheet-sync` writeback.
- **`min/max/avg` rỗng = null** — cân nhắc cho phép config giá trị mặc định.
- **Recompute-all UI**: nút bấm trong field settings gọi `ptdlRollup:recompute` (hiện chỉ có API).
- **Concat/join + count-distinct** (đã hoãn — user chọn bộ số cơ bản).

---

## 8. Tham chiếu: "label per-row theo điều kiện" (KHÁC rollup — đã giải quyết, không cần plugin)

Nhu cầu "title column theo điều kiện kiểu AppSheet Label" **KHÔNG cần build** — dùng có sẵn:

- **Title field toàn app** (quan hệ/picker/popup): tạo **built-in Formula field** (engine `formula.js` =
  Excel functions, cú pháp `{{field}}`, có `IF()`), rồi đặt làm **Record title** của collection. Formula
  field có `titleUsable:true`. Tính per-row server-side, lưu DB → chạy tự nhiên mọi nơi. (Đã test collection
  `ptdl_label_test`.)
- **Hiển thị 1 cột (client, live)**: JS item / @tuanla90 formula column. JS item **PHẢI** `ctx.render(<span>{v}</span>)`
  (KHÔNG `return`), và engine @tuanla90 tham chiếu field qua **`data.status` / `data.name`** (không bare — vì
  compile `new Function('data','value','record',…)`).

---

## 9. Build / deploy / test

```bash
cd build-env
bash recipes/run-formula-build.sh        # tự sync src từ packages/@tuanla90 → build 3 lane (client/client-v2/server)
bash recipes/add-markers.sh storage/tar/@tuanla90/plugin-formula-0.1.0.tgz
# deploy: giải nén tgz vào node_modules/@tuanla90/ + storage/plugins/@tuanla90/ (tar --force-local)
cd ../../nb-local && npx pm2 restart index    # server lane đổi → PHẢI restart
```

**Test e2e đã chạy (collection `rollup_order` ← hasMany `items` → `rollup_item`):**
create 3 item (180) · xóa 1 (→130) · sửa (→230) · dời cha (cha cũ −, cha mới +) · filter active · count/avg
· recompute-all — TẤT CẢ đúng. (Các collection test `rollup_order`/`rollup_item` còn trong nb-local để xem.)

**Verify nhanh interface đã đăng ký (browser console /v/):**
```js
app.dataSourceManager.collectionFieldInterfaceManager.getFieldInterfaces() // phải có 'ptdlRollup'
```

Memory liên quan: `ptdl-plugin-formula` (index memory workspace).
