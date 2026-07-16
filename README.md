# nocobase-plugins — workspace @ptdl

Bộ plugin NocoBase của **@ptdl** (1 scope duy nhất `@ptdl`) + toolchain build + tài liệu.
Target **NocoBase 2.1.19**. Dev local: `nb-local` (sqlite, pm2). Prod: **Railway** (HTTPS sẵn).

> **Nguồn sự thật về danh sách plugin = [`PLUGIN-REGISTRY.md`](PLUGIN-REGISTRY.md)** (24 plugin, mô tả đầy đủ).
> Kế hoạch/bối cảnh: [`PLAN.md`](PLAN.md) · [`HANDOFF.md`](HANDOFF.md) · [`docs/`](docs/) (các thiết kế chi tiết).

---

## Cài trên máy khác / server (KHÔNG cần build) ⭐

Cách cài chuẩn = **upload file `.tgz` qua Plugin Manager UI** (chạy y hệt trên nb-local, Railway, Docker):

1. `git clone https://github.com/tuanla90/nocobase-plugin.git` (hoặc `git pull` nếu đã clone).
2. Mở NocoBase → **Plugin Manager (góc phải trên) → Add & Update → Upload plugin**.
3. Chọn file trong **[`latest/@ptdl/`](latest/@ptdl/)** (bản `.tgz` MỚI NHẤT, mỗi plugin 1 file) → **Submit** → **Enable**.
4. **Ctrl+Shift+R** (hard refresh). Plugin có settings riêng (PWA, Branding, Device Kit…) thì vào Settings tương ứng để chỉnh.

**Lưu ý:**
- Một số plugin phụ thuộc nhau — bật kèm: **custom-icons** (icon Lucide, nhiều plugin dùng), **file-manager** (native, cần cho **device-kit** camera).
- Nếu upload báo **403** trên Railway/proxy: proxy nuốt header `X-Role: root` → xem [`docs/NOCOBASE-PLUGIN-BUILD-GUIDE.md`](docs/NOCOBASE-PLUGIN-BUILD-GUIDE.md) §2.
- Cập nhật plugin: bản build sau **tăng `version`** trong `package.json` → NocoBase coi là update.

## Cấu trúc

```
nocobase-plugins/
├── packages/@ptdl/            # SOURCE code từng plugin (src/, package.json, README)
├── packages/@ptdl/shared/     # thư viện dùng chung (bundle thẳng vào từng plugin; dist/ được .gitignore)
├── packages/_inactive/@ptdl/  # plugin không dùng nữa (giữ lại tham khảo)
├── latest/@ptdl/              # ⭐ .tgz MỚI NHẤT — file để upload cài đặt (1 bản/plugin)
├── build-env/                 # toolchain build (recipes/) — node_modules/storage/ được .gitignore
│   ├── recipes/run-<name>-build.sh   # build 1 plugin
│   └── BUILD.md
├── docs/                      # thiết kế chi tiết (DEVICE-KIT, COMPUTED-FIELD, build-guide…)
├── snippets/                  # RunJS snippet library
├── theme/                     # CSS ERPNext (dán vào Theme editor — no-code, không cần plugin)
├── PLUGIN-REGISTRY.md · PLAN.md · HANDOFF.md · SHARED-LIBS-PROPOSAL.md
```

> **`.gitignore` loại:** `node_modules/`, `build-env/{node_modules,packages,storage}/`, `packages/@ptdl/shared/dist/`,
> `_backup-localhost-*/` + `*.sqlite` (DB thật — không đẩy lên git), `archive/` (mọi version tgz cũ — nặng).

## Build lại từ source (dev)

```bash
cd build-env
npm install @nocobase/build@2.1.19 --no-audit --no-fund   # 1 lần (toolchain không kèm trong git)
bash recipes/run-shared-build.sh                          # khi sửa @ptdl/shared
bash recipes/run-<plugin>-build.sh                        # build 1 plugin → storage/tar/@ptdl/*.tgz
bash recipes/add-markers.sh storage/tar/@ptdl/<pkg>-<ver>.tgz   # BẮT BUỘC (marker client-v2 cho /v/)
cp storage/tar/@ptdl/<pkg>-<ver>.tgz ../latest/@ptdl/     # promote bản mới để upload
```
Chi tiết: [`build-env/BUILD.md`](build-env/BUILD.md) · [`docs/NOCOBASE-PLUGIN-BUILD-GUIDE.md`](docs/NOCOBASE-PLUGIN-BUILD-GUIDE.md).

## Đồng bộ git (giữa các máy)

```bash
git add -A && git commit -m "..."   # kèm Co-Authored-By nếu do Claude tạo
git push                            # remote: origin = github.com/tuanla90/nocobase-plugin (nhánh main)
# máy khác:
git pull                            # lấy source + latest/@ptdl mới nhất → upload lại qua Plugin Manager
```

## License

`@nocobase/*`: AGPL-3.0 · `@ptdl/*`: plugin nội bộ.
