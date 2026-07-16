/**
 * Tags / Array display — Run JS (JS Column / JS Field / JS editable field trong form)
 * Hiển thị field multi-select hoặc quan hệ m2m thành dãy tag màu, cắt bớt nếu quá dài ("+N").
 * EDITABLE = true: cho phép bấm "x" để bỏ 1 tag — CHỈ áp dụng khi giá trị là mảng chuỗi/số đơn giản
 * (multi-select enum) VÀ đang chạy trong JS editable field của form (ghi qua ctx.setValue, bấm Save mới lưu).
 * Với mảng object (quan hệ m2m) mặc định chỉ hiển thị — xóa quan hệ nên dùng picker gốc của NocoBase.
 */

// ================== CẤU HÌNH ==================
const FIELD       = 'tags';  // tên field trên record (JS Column) — multi-select hoặc quan hệ m2m
const LABEL_KEY    = 'label'; // nếu phần tử là object (m2m), lấy nhãn theo key này (thử thêm 'name'/'title' nếu thiếu)
const EDITABLE     = true;    // true: cho bỏ tag (chỉ hiệu lực với mảng giá trị đơn giản trong form)
const MAX_VISIBLE  = 3;       // số tag hiện tối đa, còn lại gộp thành "+N"
const SIZE         = 'small'; // 'small' | 'default'
const EMPTY_TEXT   = '-';
// Màu cố định theo nhãn (không khai báo → tự suy màu ổn định từ hash(nhãn))
const COLORS = {
  // 'Urgent': '#f5222d',
  // 'Low': '#8c8c8c',
};
const PALETTE = ['#1677ff', '#52c41a', '#faad14', '#f5222d', '#722ed1', '#13c2c2', '#eb2f96', '#fa8c16'];

// ==============================================
const output = (html) =>
  typeof ctx.render === 'function' ? ctx.render(html) : (ctx.element.innerHTML = html);

const isFormField = typeof ctx.setValue === 'function' && typeof ctx.getValue === 'function';
const canEdit = EDITABLE && isFormField && !ctx.readOnly && !ctx.disabled;

function hashColor(text) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

function toLabel(item) {
  if (item == null) return '';
  if (typeof item === 'object') {
    return String(item[LABEL_KEY] ?? item.name ?? item.title ?? item.label ?? item.id ?? '').trim();
  }
  return String(item).trim();
}

// true nếu toàn bộ phần tử là string/number (đủ an toàn để ghi thẳng lại qua setValue khi xóa tag)
function isSimpleArray(arr) {
  return arr.every((it) => typeof it === 'string' || typeof it === 'number');
}

function normalize(raw) {
  if (raw == null || raw === '') return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') return raw.split(',').map((s) => s.trim()).filter(Boolean);
  return [raw];
}

function draw(rawValue) {
  const list = normalize(rawValue);
  if (!list.length) {
    output(`<span style="color:#bfbfbf">${EMPTY_TEXT}</span>`);
    return;
  }

  const editableHere = canEdit && isSimpleArray(list);
  const pad = SIZE === 'small' ? '0 6px' : '2px 10px';
  const fontSize = SIZE === 'small' ? '12px' : '13px';
  const visible = list.slice(0, MAX_VISIBLE);
  const restCount = list.length - visible.length;
  const restLabels = list.slice(MAX_VISIBLE).map(toLabel).join(', ');

  const tagHtml = (item, idx) => {
    const label = toLabel(item) || '?';
    const color = COLORS[label] || hashColor(label);
    const closeBtn = editableHere
      ? `<span data-remove="${idx}" style="margin-left:4px;cursor:pointer;opacity:.7">×</span>`
      : '';
    return `
      <span style="display:inline-flex;align-items:center;padding:${pad};border-radius:4px;font-size:${fontSize};line-height:1.8;background:${color}1a;color:${color};border:1px solid ${color}55;white-space:nowrap">
        ${label}${closeBtn}
      </span>
    `;
  };

  const tagsHtml = visible.map(tagHtml).join('');
  const moreHtml = restCount > 0
    ? `<span title="${restLabels}" style="font-size:${fontSize};color:#8c8c8c;padding:${pad}">+${restCount}</span>`
    : '';

  output(`
    <span data-tags style="display:inline-flex;flex-wrap:wrap;align-items:center;gap:4px;max-width:100%">
      ${tagsHtml}${moreHtml}
    </span>
  `);

  if (!editableHere) return;
  const wrap = ctx.element?.querySelector?.('[data-tags]');
  if (!wrap) return;
  wrap.addEventListener('click', (e) => {
    const btn = e.target?.closest?.('[data-remove]');
    if (!btn) return;
    e.stopPropagation();
    const idx = Number(btn.getAttribute('data-remove'));
    const next = list.slice(0, idx).concat(list.slice(idx + 1));
    ctx.setValue(next);
    draw(next);
  });
}

// Giá trị ban đầu: form dùng ctx.getValue(), JS Column dùng ctx.record, JS Field dùng ctx.value
draw(isFormField ? ctx.getValue() : ctx.record ? ctx.record?.[FIELD] : ctx.value);

// Form: vẽ lại khi giá trị bị đổi từ bên ngoài (reset form, linkage, submit xong...)
if (isFormField) {
  ctx.element?.addEventListener?.('js-field:value-change', (ev) => {
    draw(ev?.detail);
  });
}
