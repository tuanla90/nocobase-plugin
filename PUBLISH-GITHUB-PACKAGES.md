# Phân phối plugin qua GitHub Packages — "update 1 chỗ → mọi server cập nhật"

Mục tiêu: sửa/nâng cấp 1 plugin ở đây → publish 1 lần → mọi NocoBase server đang
dùng nó kéo về bản mới. Đây là bài toán **phân phối npm package qua registry**; ta
dùng **GitHub Packages** (registry npm private của GitHub — không cần tự host).

---

## ⚡ Bắt đầu nhanh (người mới — làm đúng 5 bước này)

Không cần build lại gì cả: **30 file `.tgz` đã sẵn** trong `latest/@tuanla90/`. Chỉ cần đẩy chúng lên.

**Bước 1 — Tạo 1 token GitHub** (đây là "chìa khóa" để đẩy plugin lên; chỉ làm 1 lần):
- Mở: https://github.com/settings/tokens/new (đăng nhập tài khoản `tuanla90`).
- Ô **Note**: gõ `nocobase publish`.
- **Expiration**: chọn `No expiration` (hoặc 1 năm).
- Kéo xuống tick ô **`write:packages`** (nó tự tick luôn `read:packages`).
- Bấm **Generate token** (cuối trang) → **copy** chuỗi `ghp_...` hiện ra (chỉ hiện 1 lần!).

**Bước 2 — Dán token vào 1 file** (thay cho việc gõ lệnh phức tạp):
- Tạo file mới `build-env/.ghp-token`, dán chuỗi `ghp_...` vào, lưu lại. (File này đã được
  chặn commit, an toàn.) Bảo tôi tạo hộ khung file cũng được.

**Bước 3 — Đẩy tất cả plugin lên** (chạy ở thư mục repo, terminal nào cũng được):
```
node build-env/publish-ghp.cjs
```
Chờ nó in `published: 30`. Xong — plugin đã ở trên GitHub.

**Bước 4 — Kiểm tra**: mở https://github.com/tuanla90?tab=packages → thấy 30 package `plugin-...`.

**Bước 5 — Trên mỗi NocoBase server, cài về**: xem [Phần 3](#phần-3--cài-trên-mỗi-nocobase-server-làm-1-lần--server).
Dùng chính token Bước 1 cho lần đầu; sau này tạo thêm token chỉ-đọc cho server (an toàn hơn).

> Sau này khi bạn **sửa** 1 plugin: build lại plugin đó (recipe như cũ) → **tăng version** →
> `node build-env/publish-ghp.cjs <tên-plugin>` → trên server bấm Upgrade. Hết.

Phần dưới giải thích kỹ từng bước + xử lý nâng cao.

---

## Vì sao publish dưới tên `@tuanla90/*` (không phải `@tuanla90/*`)

GitHub Packages bắt buộc **scope npm = tên chủ GitHub**. `@tuanla90` đã bị một tổ chức
khác chiếm (`github.com/ptdl`), nên package phải publish dưới scope tài khoản của bạn:
`@tuanla90/*`.

Để **không** phải đổi tên 31 package + 31 recipe (cả hệ build giả định
`name == thư mục == @tuanla90/plugin-X`), ta giữ nguyên workspace là `@tuanla90` và **chỉ đổi
scope bên trong file `.tgz` lúc publish**. Kết quả publish y hệt như đổi tên tận gốc,
nhưng không đụng gì tới source/recipe/build. Script làm việc này:
[`build-env/publish-ghp.cjs`](build-env/publish-ghp.cjs).

> Dev (nb-local) vẫn chạy `@tuanla90/plugin-X`; server production chạy `@tuanla90/plugin-X`.
> Code y hệt, chỉ khác cái tên bọc ngoài — hai máy là 2 instance riêng nên không xung đột.

---

## Vòng lặp cập nhật (câu trả lời cho "update 1 chỗ")

```
sửa plugin  →  build (recipe, như thường)  →  BUMP version  →  publish  →  mỗi server: upgrade + restart
```

Chi tiết từng phần bên dưới.

---

## Phần 1 — Chuẩn bị GitHub (làm 1 lần, việc của bạn)

Không cần tạo org. Scope `@tuanla90` chính là tài khoản của bạn.

Tạo **2 Personal Access Token (classic)** tại `github.com/settings/tokens`:

| Token | Scope (quyền) | Dùng để |
|---|---|---|
| **PUBLISH** | `write:packages`, `read:packages`, `delete:packages` | máy dev — đẩy plugin lên |
| **READ** | chỉ `read:packages` | mỗi server — kéo plugin về |

> GitHub Packages **luôn cần token để cài** (kể cả package để public). Nên mỗi server
> phải có READ token trong `.npmrc`. Giữ token READ quyền tối thiểu để đỡ rủi ro.

---

## Phần 2 — Publish (trên máy dev / trong repo này)

Token đọc từ `build-env/.ghp-token` (xem Bước 2 phần Bắt đầu nhanh). Các lệnh dưới chạy
được ở **mọi terminal** (PowerShell, Git Bash, cmd) vì không dùng biến môi trường:

```bash
# (tùy chọn) thử KHÔ — không cần token, chỉ kiểm tra transform:
node build-env/publish-ghp.cjs --dry-run

# publish MỘT plugin (kiểm chứng lần đầu):
node build-env/publish-ghp.cjs formula
#    → kiểm tra tại github.com/tuanla90?tab=packages

# publish TẤT CẢ tgz trong latest/@tuanla90:
node build-env/publish-ghp.cjs
```

Nếu vừa **sửa** một plugin thì build lại nó trước (recipe như thường, ví dụ
`bash build-env/recipes/run-formula-build.sh`), **nhớ tăng `version`**, rồi publish.

> Không thích dùng file token? Có thể truyền qua biến môi trường:
> Git Bash `GITHUB_TOKEN=ghp_xxx node build-env/publish-ghp.cjs` ·
> PowerShell `$env:GITHUB_TOKEN='ghp_xxx'; node build-env/publish-ghp.cjs`

**Luật quan trọng — không ghi đè version:** GitHub Packages (như npmjs) từ chối
publish đè lên version đã có. Muốn ra bản mới thì **phải tăng `version`** trong
`package.json` của plugin trước khi build. Script báo `already published` (skip) chứ
không lỗi, nên chạy lại toàn bộ luôn an toàn — chỉ những version mới thực sự lên.

Script làm gì: giải nén từng `.tgz` → đổi `name` `@tuanla90/…`→`@tuanla90/…` + thêm
`publishConfig` + bọc lại đúng chuẩn npm (`package/`) → `npm publish`. Token chỉ nằm
trong 1 file `.npmrc` tạm (mode 600), xóa khi xong, không bao giờ in ra.

---

## Phần 3 — Cài trên mỗi NocoBase server (làm 1 lần / server)

```bash
# 1) Cho server biết registry + token READ:
export GITHUB_READ_TOKEN=<READ_TOKEN>
cp npmrc.consumer.example ~/.npmrc         # (xem file npmrc.consumer.example)

# 2) Cài plugin — NocoBase kéo qua npm nên tôn trọng ~/.npmrc:
yarn nocobase pm add @tuanla90/plugin-formula
yarn nocobase pm enable @tuanla90/plugin-formula
#    (khởi động lại app)
```

Hoặc qua UI: **Plugin Manager → Add new → Add from npm registry**, tên
`@tuanla90/plugin-formula` (đã có `.npmrc` thì resolve được).

---

## Phần 4 — Nâng cấp khi có bản mới (làm trên mỗi server)

```bash
# đã publish version mới ở Phần 2 → trên từng server:
yarn nocobase pm add @tuanla90/plugin-formula     # kéo bản mới nhất
#    (khởi động lại app)
```

Hoặc Plugin Manager UI hiện nút **Upgrade** khi registry có version cao hơn.

Có nhiều server? Gói 3 dòng trên thành 1 script `upgrade.sh` rồi chạy qua ssh cho từng
host — publish 1 lần, mọi host chạy cùng script là xong.

---

## Phần 5 — Server đang chạy `@tuanla90/*` (migrate)

Server nào trước đây cài `@tuanla90/plugin-X` bằng tay (giải nén tgz vào `node_modules/@tuanla90`)
thì với NocoBase, `@tuanla90/plugin-X` là **plugin khác tên**. Cách chuyển:

1. Cài `@tuanla90/plugin-X` (Phần 3) — bảng dữ liệu plugin tạo ra vẫn còn trong DB, tên
   collection giống hệt nên bản mới dùng lại được.
2. Gỡ bản `@tuanla90` cũ (`pm disable` rồi `pm remove`) để tránh chạy 2 bản.
3. **Thử trên 1 server trước**, xác nhận dữ liệu + tính năng ổn rồi mới nhân rộng.

Server mới tinh thì bỏ qua phần này — cài thẳng `@tuanla90/*`.

---

## Bảo mật

- **Không bao giờ commit `.npmrc`** đã điền token — đã đưa vào `.gitignore`. Chỉ commit
  `npmrc.consumer.example`.
- `.npmrc` dùng dạng `${GITHUB_READ_TOKEN}` để token nằm ở biến môi trường, không nằm
  trong file.
- Token theo quyền tối thiểu (READ chỉ `read:packages`). Thu hồi/tạo lại ở
  `github.com/settings/tokens` nếu lộ.

---

## (Tùy chọn tương lai) Đổi tên tận gốc `@tuanla90 → @tuanla90`

Nếu sau này muốn dev == prod cùng tên: đổi `name` trong 31 `package.json`, rồi sửa mỗi
`build-env/recipes/run-*.sh` cho `PKG="@tuanla90/plugin-X"` **nhưng giữ** `SRC=".../packages/@tuanla90/plugin-X"`
(thư mục workspace) và các tham chiếu `@tuanla90/shared`. Khi đó bỏ được bước rewrite của
`publish-ghp.cjs`. Không bắt buộc — cách publish-time hiện tại đã ra đúng `@tuanla90/*`.
