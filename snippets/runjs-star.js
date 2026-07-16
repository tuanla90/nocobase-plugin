/**
 * Rating icon — Run JS (JS Column / JS Field)
 * Hiển thị giá trị số (vd 3.5) thành dãy icon 3 trạng thái: Fill / Half / Empty
 * Icon mặc định: lucide "star" — đổi ICON thành icon lucide bất kỳ (kebab-case)
 * EDITABLE = true: bấm vào icon để chấm điểm. Tự nhận diện ngữ cảnh:
 * - Form Create/Edit (dùng "JS field" nhóm editable): ghi vào form qua ctx.setValue — bấm Save mới lưu
 * - JS Column (bảng): gọi API update — lưu ngay
 */

// ================== CẤU HÌNH ==================
const FIELD       = 'rating';   // tên field lấy giá trị từ record (JS Column)
const ICON        = 'star';     // icon lucide bất kỳ: 'star', 'heart', 'thumbs-up', 'flame'...
const MAX         = 5;          // tổng số icon
const EDITABLE    = true;       // true: bấm icon để chấm điểm
const ALLOW_HALF  = true;       // true: bấm nửa trái icon = điểm lẻ .5
const CLICK_AGAIN_CLEARS = true; // bấm lại đúng điểm hiện tại → xóa về 0
const SIZE        = 18;         // kích thước px
const FILL_COLOR  = '#fadb14';  // màu trạng thái Fill / Half
const EMPTY_COLOR = '#d9d9d9';  // màu trạng thái Empty
const SHOW_NUMBER = true;       // hiện số bên cạnh dãy icon

// ==============================================
const output = (html) =>
  typeof ctx.render === 'function' ? ctx.render(html) : (ctx.element.innerHTML = html);

// Nhận diện ngữ cảnh: JS editable field trong form có ctx.getValue/ctx.setValue
const isFormField = typeof ctx.setValue === 'function' && typeof ctx.getValue === 'function';
const canEdit = EDITABLE
  ? (isFormField
      ? !ctx.readOnly && !ctx.disabled
      : !!(ctx.record && ctx.collection && typeof ctx.api?.request === 'function'))
  : false;
let saving = false;

async function save(newRaw) {
  if (isFormField) {
    // Trong form: chỉ ghi vào giá trị form — bấm Save của form mới thực sự lưu
    ctx.setValue(newRaw);
    return;
  }
  const tk = ctx.collection?.getFilterByTK?.(ctx.record);
  if (tk === null || tk === undefined) throw new Error('Không xác định được khóa của record');
  await ctx.api.request({
    url: `${ctx.collection.name}:update`,
    method: 'post',
    params: { filterByTk: tk },
    data: { [FIELD]: newRaw },
  });
  try { ctx.record[FIELD] = newRaw; } catch (_) { /* record read-only thì bỏ qua */ }
}

async function draw(raw) {
  lastDrawn = raw; // để listener value-change không vẽ trùng
  // Làm tròn về bước 0.5 để chia 3 trạng thái Fill / Half / Empty
  const value = Math.max(0, Math.min(MAX, Math.round(raw * 2) / 2));
  const cursor = canEdit ? 'cursor:pointer' : '';

  try {
    // Load lucide qua CDN (ctx.requireAsync — UMD). RunJS không truy cập được registry icon nội bộ
    // của @nocobase/client-v2 (xem docs/ICON-ARCHITECTURE.md) nên đây là cách đúng cho RunJS, không phải
    // vi phạm pattern provider/consumer — RunJS không phải "plugin bundle". Version khớp lucide-react mà
    // @ptdl/plugin-custom-icons (provider icon đang active) pin, để tránh lệch tên icon giữa các version.
    const lucide = await ctx.requireAsync('lucide@0.469.0/dist/umd/lucide.min.js');

    // 'thumbs-up' -> 'ThumbsUp' (key trong lucide.icons là PascalCase)
    const pascal = ICON.split('-').map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join('');
    const iconNode = lucide.icons[pascal];
    if (!iconNode) throw new Error(`Không tìm thấy icon lucide: ${ICON}`);

    const svg = (filled) => {
      const el = lucide.createElement(iconNode);
      el.setAttribute('width', SIZE);
      el.setAttribute('height', SIZE);
      el.setAttribute('fill', filled ? FILL_COLOR : 'none');
      el.setAttribute('stroke', filled ? FILL_COLOR : EMPTY_COLOR);
      return el.outerHTML;
    };

    const FILL = svg(true);
    const EMPTY = svg(false);
    // Half = icon Empty làm nền + icon Fill phủ lên, cắt 50% bề ngang → dùng được với MỌI icon
    const HALF =
      EMPTY +
      `<span style="position:absolute;left:0;top:0;width:50%;height:100%;overflow:hidden;pointer-events:none">${FILL}</span>`;

    let icons = '';
    for (let i = 1; i <= MAX; i++) {
      const inner = value >= i ? FILL : value >= i - 0.5 ? HALF : EMPTY;
      icons += `<span data-i="${i}" style="position:relative;display:inline-block;width:${SIZE}px;height:${SIZE}px;line-height:0;${cursor}">${inner}</span>`;
    }

    const numberHtml = SHOW_NUMBER
      ? `<span style="margin-left:6px;font-size:12px;color:#8c8c8c">${raw}</span>`
      : '';

    output(
      `<span data-stars title="${raw}/${MAX}${canEdit ? ' — bấm để chấm điểm' : ''}" style="display:inline-flex;align-items:center;gap:2px">${icons}${numberHtml}</span>`,
    );

    if (!canEdit) return;
    const wrap = ctx.element?.querySelector?.('[data-stars]');
    if (!wrap) return;
    wrap.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (saving) return;
      const star = e.target?.closest?.('[data-i]');
      if (!star) return;
      saving = true;
      try {
        const i = Number(star.getAttribute('data-i'));
        let newVal = i;
        if (ALLOW_HALF) {
          // Bấm nửa trái icon → điểm lẻ .5
          const rect = star.getBoundingClientRect();
          if (e.clientX - rect.left < rect.width / 2) newVal = i - 0.5;
        }
        if (CLICK_AGAIN_CLEARS && newVal === value) newVal = 0;
        await save(newVal);
        await draw(newVal);
      } catch (err) {
        ctx.message?.error?.(err.message || 'Cập nhật thất bại');
      } finally {
        saving = false;
      }
    });
  } catch (e) {
    // Fallback khi CDN lỗi: hiển thị bằng ký tự (không hỗ trợ bấm chỉnh)
    const full = Math.floor(value);
    const half = value % 1 ? 1 : 0;
    output(`<span title="${e.message}">${'★'.repeat(full)}${half ? '⯨' : ''}${'☆'.repeat(MAX - full - half)} ${SHOW_NUMBER ? raw : ''}</span>`);
  }
}

// Giá trị ban đầu: form dùng ctx.getValue(), JS Column dùng ctx.record, JS Field dùng ctx.value
let lastDrawn;
await draw(Number((isFormField ? ctx.getValue() : ctx.record ? ctx.record?.[FIELD] : ctx.value) ?? 0));

// Form: vẽ lại khi giá trị bị đổi từ bên ngoài (reset form, linkage, submit xong...)
if (isFormField) {
  ctx.element?.addEventListener?.('js-field:value-change', (ev) => {
    const v = Number(ev?.detail ?? 0);
    if (v === lastDrawn) return;
    void draw(v);
  });
}
