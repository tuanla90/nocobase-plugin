#!/usr/bin/env node
/**
 * Regenerate the two catalog docs the plugin distribution relies on, both from `latest/@tuanla90/*.tgz`
 * (single source of truth for shipped versions). Run after every rebuild that refreshes latest/.
 *
 *   node build-env/gen-manifest.cjs
 *
 *   1. latest/index.json — the machine manifest @tuanla90/plugin-hub reads ({packageName,version,url}).
 *   2. INSTALL.md        — the human, shareable install index (Plugin Hub bootstrap + URL table).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'latest', '@tuanla90');
const BASE = 'https://raw.githubusercontent.com/tuanla90/nocobase-plugin/main/latest/@tuanla90/';

const plugins = [];
for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.tgz')).sort()) {
  const r = f.replace(/^plugin-/, '').replace(/\.tgz$/, '');
  const m = r.match(/^(.*?)-(\d.*)$/);
  const slug = m ? m[1] : r;
  const version = m ? m[2] : '0.0.0';
  const packageName = '@tuanla90/plugin-' + slug;
  let displayName = slug;
  try {
    const p = JSON.parse(fs.readFileSync(path.join(ROOT, 'packages', '@tuanla90', 'plugin-' + slug, 'package.json'), 'utf8'));
    displayName = p.displayName || slug;
  } catch { /* keep slug */ }
  plugins.push({ packageName, slug, version, displayName, file: f, url: BASE + f });
}

// 1) manifest
const manifest = { source: '@tuanla90/nocobase-plugin', updatedAt: null, count: plugins.length, plugins: plugins.map(({ file, ...p }) => p) };
fs.writeFileSync(path.join(ROOT, 'latest', 'index.json'), JSON.stringify(manifest, null, 2) + '\n');

// 2) INSTALL.md
const hub = plugins.find((p) => p.slug === 'hub');
const lag = new Set([]); // plugins whose latest/ tgz trails uncommitted source (none right now)
let md = `# Cài @tuanla90 plugins vào NocoBase (không cần upload file)

Các plugin trong repo này được đóng gói sẵn (\`.tgz\` ở \`latest/@tuanla90/\`). Cài vào **bất kỳ NocoBase 2.x** nào **mà không upload file qua trình duyệt** — server tự tải từ URL. Hợp khi thiết bị/mạng chặn upload \`.tgz\`, và để share cho instance người khác host.

## ⭐ Cách nhanh nhất — Plugin Hub (cài 1 lần, lo hết)
Cài **Plugin Hub** rồi nó tự cài/cập nhật mọi plugin còn lại từ manifest (\`latest/index.json\`) — khỏi dán URL 30+ lần.
${hub ? `1. Admin NocoBase → **Plugin manager → Add → URL** → dán:\n   \`${hub.url}\`\n   → Install → **Enable**.\n2. Vào **Settings → Plugin Hub → Kiểm tra ngay** → cài/cập nhật từng cái hoặc **Cập nhật tất cả**.` : '_(chưa có bản plugin-hub trong latest/)_'}

> Kiểm tra cập nhật hàng tuần — chỉ **báo**, không tự áp dụng.

## Cách thủ công (từng plugin, không cần Hub)
1. Admin NocoBase → **Plugin manager → Add** → nguồn **URL / npm** (KHÔNG chọn Local/Upload).
2. Dán **Install URL** (bảng dưới) → **Install** → **Enable**.
> Trình duyệt chỉ gửi một chuỗi URL; **server** NocoBase tải file. Nếu \`@\` trong URL lỗi, thay bằng \`%40tuanla90\`.

## ⚠️ Railway / Docker: bắt buộc volume cho \`storage/\`
Plugin cài lúc runtime nằm ở \`storage/plugins\` trên **service NocoBase** (không phải Postgres). Railway filesystem ephemeral → **mount volume vào \`/app/nocobase/storage\`**, nếu không plugin **mất khi redeploy**.

## Danh sách (${plugins.length} plugin — sync theo \`latest/@tuanla90/\`)
| Plugin | Version | Install URL |
|---|---|---|
`;
for (const p of plugins) {
  const note = lag.has(p.slug) ? ' ⚠️(bản committed, có thể cũ hơn source WIP)' : '';
  md += `| ${p.slug}${note} | ${p.version} | \`${p.url}\` |\n`;
}
md += `\n_Tự sinh từ \`latest/@tuanla90/\` bởi \`build-env/gen-manifest.cjs\`. Chạy lại sau mỗi lần rebuild._\n`;
fs.writeFileSync(path.join(ROOT, 'INSTALL.md'), md);

console.log(`latest/index.json + INSTALL.md: ${plugins.length} plugins`);
