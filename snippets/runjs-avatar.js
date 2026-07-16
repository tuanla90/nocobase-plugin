/**
 * Avatar + text — Run JS (JS Column / JS Field / JS editable field trong form)
 * Hiển thị ảnh đại diện (từ field ảnh hoặc field quan hệ user) + tên bên cạnh.
 * Không có ảnh → fallback initials (chữ cái đầu) trên nền màu suy từ tên (ổn định, không random).
 * Chỉ hiển thị — không chỉnh sửa (đổi người/ảnh nên dùng field picker gốc của NocoBase).
 */

// ================== CẤU HÌNH ==================
// Đường dẫn (dot path) tính TỪ record, không phải từ FIELD — để trống nếu field nằm phẳng ngay trên record.
// Ví dụ quan hệ m2o "createdBy" trả về { id, nickname, avatar: { url } }:
//   AVATAR_PATH = 'createdBy.avatar.url'
//   NAME_PATH   = 'createdBy.nickname'
// Ví dụ field phẳng trên record (avatarUrl, fullName):
//   AVATAR_PATH = 'avatarUrl'
//   NAME_PATH   = 'fullName'
const AVATAR_PATH = 'createdBy.avatar.url';
const NAME_PATH   = 'createdBy.nickname';
const SIZE        = 24;       // kích thước avatar (px)
const SHAPE       = 'circle'; // 'circle' | 'square'
const SHOW_NAME   = true;     // hiện tên bên cạnh avatar
const MAX_LEN     = 20;       // cắt bớt tên nếu quá dài (0 = không cắt)
const EMPTY_TEXT  = '-';      // hiển thị khi không có tên/avatar
// Bảng màu nền cho fallback initials — chọn theo hash(tên) nên cùng 1 tên luôn ra cùng 1 màu
const PALETTE = ['#1677ff', '#52c41a', '#faad14', '#f5222d', '#722ed1', '#13c2c2', '#eb2f96', '#fa8c16'];

// ==============================================
function get(obj, path) {
  if (!obj || !path) return undefined;
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

function hashColor(text) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

function initials(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const output = (html) =>
  typeof ctx.render === 'function' ? ctx.render(html) : (ctx.element.innerHTML = html);

// Nguồn record: JS Column dùng ctx.record; JS editable field trong form dùng ctx.getValue()/ctx.record nếu có;
// JS Field (detail, không editable) chỉ có ctx.value + ctx.record.
const record = ctx.record || {};
const rawName = get(record, NAME_PATH);
const avatarUrl = get(record, AVATAR_PATH);
const name = rawName == null ? '' : String(rawName).trim();

if (!name && !avatarUrl) {
  output(`<span style="color:#bfbfbf">${EMPTY_TEXT}</span>`);
  return;
}

const radius = SHAPE === 'circle' ? '50%' : '4px';
const displayName = MAX_LEN > 0 && name.length > MAX_LEN ? name.slice(0, MAX_LEN) + '…' : name;

let avatarHtml;
if (avatarUrl) {
  avatarHtml = `<img src="${avatarUrl}" alt="${name}" style="width:${SIZE}px;height:${SIZE}px;border-radius:${radius};object-fit:cover;flex:none" />`;
} else {
  const bg = hashColor(name || '?');
  avatarHtml = `
    <span style="display:inline-flex;align-items:center;justify-content:center;width:${SIZE}px;height:${SIZE}px;border-radius:${radius};background:${bg};color:#fff;font-size:${Math.max(10, SIZE * 0.42)}px;font-weight:600;flex:none;line-height:1">
      ${initials(name || '?')}
    </span>
  `;
}

const nameHtml = SHOW_NAME
  ? `<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${displayName}</span>`
  : '';

output(`
  <span title="${name}" style="display:inline-flex;align-items:center;gap:6px;max-width:100%">
    ${avatarHtml}${nameHtml}
  </span>
`);
