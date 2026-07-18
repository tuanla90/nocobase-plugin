// Sync the "Phiên bản"/"Version" meta line in each plugin README to package.json version.
const fs = require('fs');
const path = require('path');
const base = path.join(process.argv[2], 'packages', '@ptdl');
const changed = [];
for (const d of fs.readdirSync(base)) {
  if (!d.startsWith('plugin-')) continue;
  const dir = path.join(base, d);
  const pkgf = path.join(dir, 'package.json');
  if (!fs.existsSync(pkgf)) continue;
  const ver = JSON.parse(fs.readFileSync(pkgf, 'utf8')).version;
  for (const [file, label] of [['README.vi-VN.md', 'Phiên bản'], ['README.md', 'Version']]) {
    const f = path.join(dir, file);
    if (!fs.existsSync(f)) continue;
    let txt = fs.readFileSync(f, 'utf8');
    const re = new RegExp('(\\*\\*' + label + ':\\*\\*\\s*)(v?\\d[\\w.\\-]*)');
    const m = txt.match(re);
    if (m && m[2] !== ver) {
      txt = txt.replace(re, '$1' + ver);
      fs.writeFileSync(f, txt);
      changed.push(d.replace('plugin-', '') + ' / ' + file + ': ' + m[2] + ' -> ' + ver);
    }
  }
}
console.log(changed.length ? changed.join('\n') : '(no version mismatches found)');
