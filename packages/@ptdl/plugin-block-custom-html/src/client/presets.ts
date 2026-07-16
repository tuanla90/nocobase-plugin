/**
 * Ready-to-use code templates shown as quick-pick buttons in the editor.
 * Each `code` is the JS the user gets when they click the preset.
 */
import { DEFAULT_JS } from './render';

const TOPLIST = `// Top list — top 1/2/3 có style riêng. Đổi 'name'/'value' cho đúng cột.
const nameCol = 'name', valCol = 'value';
const medal = { 0: '#f5b301', 1: '#9aa4ad', 2: '#cd7f32' };
const badge = { 0: 'trophy', 1: 'award', 2: 'star' };
const items = data.map((r, i) => {
  const top = i < 3, accent = medal[i] || '#e3e6ea';
  return \`
  <div style="display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:12px;margin-bottom:8px;background:\${top ? '#fff' : 'transparent'};border:1px solid \${top ? accent : '#eef0f2'};box-shadow:\${top ? '0 1px 4px rgba(0,0,0,.07)' : 'none'}">
    <div style="width:30px;height:30px;flex:0 0 30px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px;background:\${top ? accent : '#f4f5f6'};color:\${top ? '#fff' : '#737b83'}">\${top ? helpers.icon(badge[i], { size: 16, color: '#fff' }) : i + 1}</div>
    <div style="flex:1;font-weight:\${top ? 700 : 500};color:#1f272e">\${helpers.esc(r[nameCol])}</div>
    <div style="font-weight:800;color:\${top ? accent : '#1f272e'}">\${helpers.fmt(r[valCol])}</div>
  </div>\`;
}).join('');
return \`<div style="font-family:Inter,system-ui,sans-serif;max-width:420px"><div style="font-size:13px;font-weight:700;color:#737b83;margin-bottom:10px">🏆 TOP \${data.length}</div>\${items}</div>\`;`;

const PROGRESS = `// Progress bars — value so với giá trị lớn nhất. Đổi 'name'/'value'.
const nameCol = 'name', valCol = 'value';
const max = helpers.max(data, valCol) || 1;
return \`<div style="font-family:Inter,system-ui,sans-serif;max-width:460px">\${
  data.map(r => {
    const pct = Math.round((Number(r[valCol]) || 0) / max * 100);
    return \`<div style="margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px">
        <span style="color:#1f272e;font-weight:600">\${helpers.esc(r[nameCol])}</span>
        <span style="color:#737b83">\${helpers.fmt(r[valCol])}</span>
      </div>
      <div style="height:8px;background:#f0f2f4;border-radius:99px;overflow:hidden">
        <div style="height:100%;width:\${pct}%;background:#2490ef;border-radius:99px"></div>
      </div>
    </div>\`;
  }).join('')
}</div>\`;`;

const CARDS = `// Lưới thẻ KPI — 1 thẻ / dòng (dùng 2 cột đầu: nhãn + số).
const cols = helpers.keys(data);
return \`<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;font-family:Inter,system-ui,sans-serif">\${
  data.map(r => \`<div style="padding:16px;border:1px solid #eef0f2;border-radius:12px;background:#fff">
    <div style="color:#737b83;font-size:12px;font-weight:600">\${helpers.esc(r[cols[0]])}</div>
    <div style="color:#18181b;font-size:24px;font-weight:800;margin-top:4px">\${helpers.fmt(r[cols[1]])}</div>
  </div>\`).join('')
}</div>\`;`;

const TABLE = `// Bảng dữ liệu (tự sinh cột)
return helpers.table(data);`;

const DEBUG = `// Xem cấu trúc dữ liệu thô (tên cột, kiểu)
return helpers.json(data);`;

export const PRESETS: Array<{ key: string; label: string; code: string }> = [
  { key: 'scorecard', label: 'Scorecard', code: DEFAULT_JS },
  { key: 'toplist', label: 'Top list', code: TOPLIST },
  { key: 'progress', label: 'Progress', code: PROGRESS },
  { key: 'cards', label: 'Thẻ KPI', code: CARDS },
  { key: 'table', label: 'Bảng', code: TABLE },
  { key: 'debug', label: 'Debug', code: DEBUG },
];
