/* Generate a self-contained, BILINGUAL (vi/en) GitHub Pages docs site from each plugin's
   README.vi-VN.md (Vietnamese) + README.md (English). READMEs stay the single source of truth.
   Output: <out>/index.html + <out>/.nojekyll
   Run: NODE_PATH=<repo>/build-env/node_modules node docs-site/generate.cjs <repo> <out> */
const fs = require('fs');
const path = require('path');
const MarkdownIt = require('markdown-it');

const REPO = process.argv[2];
const OUT = process.argv[3];
const PKGS = path.join(REPO, 'packages', '@ptdl');

const md = new MarkdownIt({ html: true, linkify: true, typographer: true, breaks: false });

const CAT_ORDER = ['Fields', 'Blocks', 'UI', 'Menu', 'Actions', 'Data', 'Charts', 'Icons', 'Security', 'Auth'];
const CAT_LABEL_VI = {
  Fields: 'Trường / Field', Blocks: 'Khối (Block)', UI: 'Giao diện', Menu: 'Menu',
  Actions: 'Hành động', Data: 'Dữ liệu', Charts: 'Biểu đồ', Icons: 'Icon', Security: 'Bảo mật', Auth: 'Đăng nhập',
};
const CAT_LABEL_EN = {
  Fields: 'Fields', Blocks: 'Blocks', UI: 'Interface', Menu: 'Menu',
  Actions: 'Actions', Data: 'Data', Charts: 'Charts', Icons: 'Icons', Security: 'Security', Auth: 'Sign-in',
};
// Authoritative category per plugin (from PLUGIN-REGISTRY) — package.json keywords[0] is inconsistent.
const SLUG_CAT = {
  'ai-column': 'Fields', 'device-kit': 'Fields', 'field-enhancements': 'Fields', 'field-order': 'Fields', 'formula': 'Fields', 'status-flow': 'Fields',
  'block-custom-html': 'Blocks', 'conditional-format': 'Blocks', 'detail-panel': 'Blocks', 'enhanced-table-block': 'Blocks', 'filter-tree': 'Blocks', 'layout-containers': 'Blocks', 'spreadsheet-view': 'Blocks', 'subtable-pro': 'Blocks',
  'app-builder': 'UI', 'branding': 'UI', 'custom-header': 'UI', 'global-search': 'UI', 'hub': 'UI', 'instant-create-page': 'UI', 'pwa': 'UI',
  'menu-enhancements': 'Menu',
  'action-enhancements': 'Actions', 'print-template': 'Actions',
  'change-log': 'Data', 'gsheet-sync': 'Data', 'line-generator': 'Data',
  'data-visualization-echarts-pro': 'Charts',
  'custom-icons': 'Icons',
  'ip-guard': 'Security',
  'login-lite': 'Auth',
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Read a README, drop its leading "# Title" line, bump remaining headings one level, render to HTML.
function renderReadme(file) {
  if (!fs.existsSync(file)) return '';
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  if (lines[0] && /^#\s/.test(lines[0])) lines.shift();
  const body = lines.join('\n').replace(/^(#{1,5})(\s)/gm, '#$1$2');
  return md.render(body);
}

function collect() {
  const out = [];
  for (const dir of fs.readdirSync(PKGS)) {
    if (!dir.startsWith('plugin-')) continue;
    const base = path.join(PKGS, dir);
    const viFile = path.join(base, 'README.vi-VN.md');
    const enFile = path.join(base, 'README.md');
    const pkgf = path.join(base, 'package.json');
    if (!fs.existsSync(viFile) || !fs.existsSync(pkgf)) continue;
    const pkg = JSON.parse(fs.readFileSync(pkgf, 'utf8'));
    const slug = dir.replace(/^plugin-/, '');
    const bodyVi = renderReadme(viFile);
    const bodyEn = renderReadme(enFile) || bodyVi; // fall back to VN if no English yet
    out.push({
      slug,
      titleVi: pkg['displayName.vi-VN'] || pkg.displayName || slug,
      titleEn: pkg.displayName || pkg['displayName.vi-VN'] || slug,
      descVi: pkg['description.vi-VN'] || pkg.description || '',
      descEn: pkg.description || '',
      version: pkg.version || '',
      cat: SLUG_CAT[slug] || (pkg.keywords && pkg.keywords[0]) || 'UI',
      bodyVi,
      bodyEn,
    });
  }
  out.sort((a, b) => {
    const ia = CAT_ORDER.indexOf(a.cat), ib = CAT_ORDER.indexOf(b.cat);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.titleVi.localeCompare(b.titleVi, 'vi');
  });
  return out;
}

const L = (vi, en) => `<span class="lang lang-vi">${vi}</span><span class="lang lang-en" hidden>${en}</span>`;

function build(plugins) {
  const groups = {};
  for (const p of plugins) (groups[p.cat] = groups[p.cat] || []).push(p);
  const cats = Object.keys(groups).sort((a, b) => {
    const ia = CAT_ORDER.indexOf(a), ib = CAT_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });

  const sidebar = cats.map((c) => `
    <div class="nav-group">
      <div class="nav-cat">${L(esc(CAT_LABEL_VI[c] || c), esc(CAT_LABEL_EN[c] || c))}</div>
      ${groups[c].map((p) => `<a class="nav-link" href="#${p.slug}" data-text="${esc((p.titleVi + ' ' + p.titleEn + ' ' + p.descVi + ' ' + p.descEn).toLowerCase())}">${L(esc(p.titleVi), esc(p.titleEn))}</a>`).join('\n      ')}
    </div>`).join('\n');

  const sections = plugins.map((p) => `
    <section class="plugin" id="${p.slug}" data-text="${esc((p.titleVi + ' ' + p.titleEn + ' ' + p.descVi + ' ' + p.descEn + ' ' + p.cat).toLowerCase())}">
      <div class="plugin-head">
        <h2>${L(esc(p.titleVi), esc(p.titleEn))}</h2>
        <span class="chip chip-cat">${L(esc(CAT_LABEL_VI[p.cat] || p.cat), esc(CAT_LABEL_EN[p.cat] || p.cat))}</span>
        ${p.version ? `<span class="chip">v${esc(p.version)}</span>` : ''}
        <a class="chip chip-top" href="#top" title="Top">↑</a>
      </div>
      <div class="prose lang lang-vi">${p.bodyVi}</div>
      <div class="prose lang lang-en" hidden>${p.bodyEn}</div>
    </section>`).join('\n');

  const count = plugins.length;

  // Pinned "Reference" entry (shared functions & helpers), sourced from docs-site/reference.*.md.
  const refVi = renderReadme(path.join(REPO, 'docs-site', 'reference.vi-VN.md'));
  const refEn = renderReadme(path.join(REPO, 'docs-site', 'reference.md')) || refVi;
  const refDataText = 'reference tham khảo hàm helper functions helpers handlebars excel formula sum if vlookup';
  const refNav = refVi ? `
    <div class="nav-group">
      <div class="nav-cat">${L('📘 Tham khảo', '📘 Reference')}</div>
      <a class="nav-link" href="#reference" data-text="${refDataText}">${L('Hàm &amp; Helper dùng chung', 'Shared functions &amp; helpers')}</a>
    </div>` : '';
  const refSection = refVi ? `
    <section class="plugin" id="reference" data-text="${refDataText}">
      <div class="plugin-head"><h2>${L('📘 Tham khảo: Hàm &amp; Helper dùng chung', '📘 Reference: Shared functions &amp; helpers')}</h2></div>
      <div class="prose lang lang-vi">${refVi}</div>
      <div class="prose lang lang-en" hidden>${refEn}</div>
    </section>` : '';

  return `<!doctype html>
<html lang="vi" data-lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Hướng dẫn Plugin @ptdl · @ptdl Plugin Guides</title>
<meta name="description" content="Hướng dẫn sử dụng ${count} plugin @ptdl cho NocoBase — User guides for ${count} @ptdl NocoBase plugins.">
<style>
:root{
  --bg:#ffffff; --fg:#1f2328; --muted:#656d76; --border:#d1d9e0; --card:#f6f8fa;
  --accent:#2563eb; --accent-soft:#dbeafe; --code-bg:#f6f8fa; --sidebar:#fbfcfd; --shadow:0 1px 3px rgba(0,0,0,.06);
}
@media (prefers-color-scheme:dark){
  :root{--bg:#0d1117;--fg:#e6edf3;--muted:#9198a1;--border:#30363d;--card:#161b22;
  --accent:#4c8dff;--accent-soft:#132a4d;--code-bg:#161b22;--sidebar:#0d1117;--shadow:none;}
}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,"Noto Sans",sans-serif;
  background:var(--bg);color:var(--fg);line-height:1.6;font-size:15px;-webkit-font-smoothing:antialiased}
a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:underline}
.layout{display:flex;min-height:100vh;max-width:1180px;margin:0 auto}
.side{width:270px;flex:0 0 270px;border-right:1px solid var(--border);background:var(--sidebar);position:sticky;top:0;height:100vh;overflow-y:auto;padding:20px 14px 40px}
.brand{font-weight:700;font-size:16px;padding:4px 8px 2px}
.brand small{display:block;font-weight:400;color:var(--muted);font-size:12px;margin-top:2px}
.langtoggle{display:flex;gap:4px;margin:10px 8px 4px}
.langtoggle button{flex:1;padding:5px 8px;border:1px solid var(--border);border-radius:7px;background:var(--bg);color:var(--fg);font-size:12.5px;cursor:pointer}
.langtoggle button.active{background:var(--accent-soft);color:var(--accent);border-color:var(--accent-soft);font-weight:600}
.search{width:100%;margin:8px 0;padding:8px 10px;border:1px solid var(--border);border-radius:8px;background:var(--bg);color:var(--fg);font-size:13px}
.search:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
.nav-group{margin:10px 0}
.nav-cat{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);font-weight:600;padding:6px 8px 2px}
.nav-link{display:block;padding:5px 10px;border-radius:6px;color:var(--fg);font-size:13.5px}
.nav-link:hover{background:var(--card);text-decoration:none}
.nav-link.active{background:var(--accent-soft);color:var(--accent);font-weight:600}
.nav-empty{display:none;color:var(--muted);font-size:13px;padding:10px}
.main{flex:1 1 auto;min-width:0;padding:34px 40px 90px}
.hero h1{margin:0 0 6px;font-size:26px;letter-spacing:-.01em}
.hero p{margin:0 0 4px;color:var(--muted)}
.hero .meta{font-size:13px;color:var(--muted);margin-top:10px}
.plugin{scroll-margin-top:16px;padding-top:30px;margin-top:26px;border-top:1px solid var(--border)}
.plugin-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px}
.plugin-head h2{margin:0;font-size:21px}
.chip{font-size:11.5px;color:var(--muted);border:1px solid var(--border);border-radius:999px;padding:1px 9px;background:var(--card)}
.chip-cat{color:var(--accent);border-color:var(--accent-soft);background:var(--accent-soft)}
.chip-top{margin-left:auto;text-decoration:none;color:var(--muted)}
.chip-top:hover{color:var(--accent);text-decoration:none}
.prose h2{font-size:17px;margin:22px 0 8px;padding-bottom:4px;border-bottom:1px solid var(--border)}
.prose h3{font-size:15px;margin:18px 0 6px}
.prose p{margin:8px 0}
.prose ul,.prose ol{margin:8px 0;padding-left:22px}
.prose li{margin:3px 0}
.prose blockquote{margin:10px 0;padding:8px 14px;border-left:3px solid var(--accent);background:var(--card);border-radius:0 8px 8px 0;color:var(--fg)}
.prose blockquote p{margin:2px 0}
.prose code{background:var(--code-bg);border:1px solid var(--border);border-radius:5px;padding:.1em .4em;font-size:.88em;font-family:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace}
.prose pre{background:var(--code-bg);border:1px solid var(--border);border-radius:8px;padding:12px 14px;overflow:auto}
.prose pre code{background:none;border:none;padding:0}
.prose table{border-collapse:collapse;width:100%;margin:12px 0;font-size:13.5px;display:block;overflow-x:auto}
.prose th,.prose td{border:1px solid var(--border);padding:7px 10px;text-align:left;vertical-align:top}
.prose th{background:var(--card);font-weight:600}
.prose tr:nth-child(even) td{background:var(--card)}
.prose hr{border:none;border-top:1px solid var(--border);margin:18px 0}
.prose a{word-break:break-word}
.menu-btn{display:none}
@media (max-width:860px){
  .layout{flex-direction:column}
  .side{position:static;width:auto;height:auto;border-right:none;border-bottom:1px solid var(--border)}
  .main{padding:22px 18px 70px}
  .menu-btn{display:inline-block;margin:0 0 8px;padding:7px 12px;border:1px solid var(--border);border-radius:8px;background:var(--card);color:var(--fg);cursor:pointer}
  .nav-wrap.collapsed{display:none}
}
</style>
</head>
<body>
<a id="top"></a>
<div class="layout">
  <aside class="side">
    <div class="brand">📚 ${L('Hướng dẫn Plugin @ptdl', '@ptdl Plugin Guides')}<small>${count} plugin · NocoBase</small></div>
    <div class="langtoggle">
      <button data-lang="vi" class="active">Tiếng Việt</button>
      <button data-lang="en">English</button>
    </div>
    <button class="menu-btn" onclick="document.getElementById('navwrap').classList.toggle('collapsed')">☰ ${L('Danh mục', 'Menu')}</button>
    <div class="nav-wrap" id="navwrap">
      <input class="search" id="q" type="search" placeholder="Tìm plugin… · Search plugins…" autocomplete="off">
      <div id="nav">${refNav}${sidebar}
        <div class="nav-empty" id="empty">${L('Không tìm thấy plugin phù hợp.', 'No matching plugin found.')}</div>
      </div>
    </div>
  </aside>
  <main class="main">
    <div class="hero">
      <h1>${L('Hướng dẫn sử dụng Plugin @ptdl', '@ptdl Plugin User Guides')}</h1>
      <p>${L('Cài plugin xong thì <b>đổi gì</b>, chỉnh <b>ở đâu</b>, dùng <b>thế nào</b> — từng bước.', 'What <b>changes</b> after installing, <b>where</b> to configure, <b>how</b> to use — step by step.')}</p>
      <div class="meta">${L('Chọn plugin ở thanh bên, hoặc dùng ô tìm kiếm. Nội dung sinh tự động từ tài liệu của từng plugin.', 'Pick a plugin in the sidebar, or use the search box. Content is generated from each plugin&#39;s docs.')}</div>
    </div>
    ${refSection}${sections}
  </main>
</div>
<script>
var q=document.getElementById('q');
function filter(){
  var v=(q.value||'').trim().toLowerCase(), anyLink=false;
  document.querySelectorAll('.nav-link').forEach(function(a){var m=!v||a.getAttribute('data-text').indexOf(v)>=0;a.style.display=m?'':'none';if(m)anyLink=true;});
  document.querySelectorAll('.nav-group').forEach(function(g){g.style.display=g.querySelectorAll('.nav-link:not([style*="none"])').length?'':'none';});
  document.getElementById('empty').style.display=anyLink?'none':'block';
  document.querySelectorAll('.plugin').forEach(function(s){s.style.display=(!v||s.getAttribute('data-text').indexOf(v)>=0)?'':'none';});
}
q.addEventListener('input',filter);
function setLang(l){
  document.documentElement.setAttribute('data-lang',l);
  document.documentElement.setAttribute('lang',l==='en'?'en':'vi');
  document.querySelectorAll('.lang-vi').forEach(function(e){e.hidden=(l!=='vi');});
  document.querySelectorAll('.lang-en').forEach(function(e){e.hidden=(l!=='en');});
  document.querySelectorAll('.langtoggle button').forEach(function(b){b.classList.toggle('active',b.dataset.lang===l);});
  try{localStorage.setItem('ptdlDocsLang',l);}catch(e){}
}
var saved=null;try{saved=localStorage.getItem('ptdlDocsLang');}catch(e){}
// No saved choice → default to the visitor's browser language (proxy for the NocoBase UI language):
// Vietnamese browser → vi, anything else → en. A manual toggle click persists the choice.
var def=saved||(((navigator.language||navigator.userLanguage||'').toLowerCase().indexOf('vi')===0)?'vi':'en');
document.querySelectorAll('.langtoggle button').forEach(function(b){b.addEventListener('click',function(){setLang(b.dataset.lang);});});
setLang(def);
var links={};document.querySelectorAll('.nav-link').forEach(function(a){links[a.getAttribute('href').slice(1)]=a;});
var obs=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){var a=links[e.target.id];if(a){Object.values(links).forEach(function(x){x.classList.remove('active');});a.classList.add('active');}}});},{rootMargin:'-10% 0px -80% 0px'});
document.querySelectorAll('.plugin').forEach(function(s){obs.observe(s);});
</script>
</body>
</html>`;
}

const plugins = collect();
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'index.html'), build(plugins));
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
console.log('Built bilingual site with', plugins.length, 'plugin(s):', plugins.map((p) => p.slug).join(', '));
