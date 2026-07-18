# docs-site — trang hướng dẫn người dùng (GitHub Pages)

Sinh **1 trang web tĩnh** từ file `README.vi-VN.md` của mỗi plugin và xuất bản lên GitHub Pages:
👉 **https://tuanla90.github.io/nocobase-plugin/**

- Nguồn nội dung = `packages/@ptdl/plugin-*/README.vi-VN.md` (nguồn duy nhất — sửa guide ở đó).
- Trang **Tham khảo** ghim đầu site (hàm/helper dùng chung) = `docs-site/reference.vi-VN.md` + `docs-site/reference.md`. Sinh từ `plugin-formula/src/shared/formulaKnowledge.ts` + `formulaEngine.ts`, `plugin-print-template/src/shared/HelperDocs.tsx` + `helpers.ts`, `plugin-block-custom-html/src/client/render.ts` — cập nhật reference khi các file đó đổi.
- `generate.cjs` gom hết, render markdown (markdown-it), gắn sidebar theo nhóm + ô tìm kiếm, ra `index.html` tự chứa (light/dark, responsive).
- Xuất bản từ nhánh **`gh-pages`** (chỉ chứa `index.html` + `.nojekyll` — không lộ source/dev-doc). Pages: *Settings → Pages → Deploy from a branch → `gh-pages` / root*.
- Mỗi plugin trỏ `package.json` → `homepage` = `https://tuanla90.github.io/nocobase-plugin/#<slug>` để popup Plugin Manager trên `/v/` hiện link **"Homepage"**.

## Regenerate + publish (sau khi thêm/sửa guide)

```bash
# 1. Build site (markdown-it lấy từ build-env)
NODE_PATH="$PWD/build-env/node_modules" node docs-site/generate.cjs "$PWD" /tmp/site

# 2. Đẩy lên nhánh gh-pages (commit nối tiếp tip cũ)
export GIT_INDEX_FILE=$(mktemp); git read-tree --empty
git update-index --add --cacheinfo "100644,$(git hash-object -w /tmp/site/index.html),index.html"
git update-index --add --cacheinfo "100644,$(git hash-object -w /tmp/site/.nojekyll),.nojekyll"
T=$(git write-tree); C=$(echo 'docs: update site' | git commit-tree "$T" -p refs/heads/gh-pages)
git update-ref refs/heads/gh-pages "$C"; unset GIT_INDEX_FILE
git push origin gh-pages
```

Thêm plugin mới → chỉ cần tạo `README.vi-VN.md` cho nó, set `homepage`, rồi chạy lại 2 bước trên. Nhóm danh mục lấy từ bảng `SLUG_CAT` trong `generate.cjs`.
