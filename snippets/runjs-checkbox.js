/**
 * Checkbox display — Run JS (JS Column / JS Field)
 * Hiển thị giá trị boolean theo 2 kiểu: 'toggle' (switch) | 'icon' (lucide)
 * EDITABLE = true: bấm vào để bật/tắt. Tự nhận diện ngữ cảnh:
 * - Form Create/Edit (dùng "JS field" nhóm editable): ghi vào form qua ctx.setValue — bấm Save mới lưu
 * - JS Column (bảng): gọi API update — lưu ngay
 */

// ================== CẤU HÌNH ==================
const FIELD      = 'checkbox';      // tên field checkbox trong record
const STYLE      = 'icon';          // 'toggle' | 'icon'
const EDITABLE   = true;            // true: bấm để đổi giá trị
const ON_COLOR   = '#52c41a';       // màu trạng thái bật
const OFF_COLOR  = '#d9d9d9';       // màu trạng thái tắt
const SIZE       = 18;              // kích thước icon (px) — chỉ dùng cho STYLE 'icon'
const ICON_ON    = 'circle-check';  // icon lucide khi bật  (gợi ý khác: 'square-check', 'toggle-right')
const ICON_OFF   = 'circle';        // icon lucide khi tắt  (gợi ý khác: 'square', 'toggle-left')
const FILLED     = true;            // true: icon bật kiểu nền đặc + dấu check trắng
const CHECK_COLOR = '#fff';         // màu dấu check khi FILLED
const SHOW_LABEL = false;           // hiện chữ bên cạnh
const LABELS     = { on: 'Bật', off: 'Tắt' };
const NULL_AS_OFF = true;           // true: null/undefined coi là tắt; false: hiện '-'

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

async function save(newVal) {
  if (isFormField) {
    // Trong form: chỉ ghi vào giá trị form — bấm Save của form mới thực sự lưu
    ctx.setValue(newVal);
    return;
  }
  const tk = ctx.collection?.getFilterByTK?.(ctx.record);
  if (tk === null || tk === undefined) throw new Error('Không xác định được khóa của record');
  await ctx.api.request({
    url: `${ctx.collection.name}:update`,
    method: 'post',
    params: { filterByTk: tk },
    data: { [FIELD]: newVal },
  });
  try { ctx.record[FIELD] = newVal; } catch (_) { /* record read-only thì bỏ qua */ }
}

function attachClick(selector, checked) {
  if (!canEdit) return;
  const el = ctx.element?.querySelector?.(selector);
  if (!el) return;
  el.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (saving) return;
    saving = true;
    try {
      await save(!checked);
      await draw(!checked);
    } catch (err) {
      ctx.message?.error?.(err.message || 'Cập nhật thất bại');
    } finally {
      saving = false;
    }
  });
}

async function draw(v) {
  lastDrawn = v; // để listener value-change không vẽ trùng
  if ((v === null || v === undefined) && !NULL_AS_OFF) {
    output('<span style="color:#bfbfbf">-</span>');
    return;
  }
  const checked = v === true || v === 1 || v === '1' || v === 'true';
  const color = checked ? ON_COLOR : OFF_COLOR;
  const cursor = canEdit ? 'cursor:pointer' : '';
  const labelHtml = SHOW_LABEL
    ? `<span style="font-size:12px;color:${checked ? ON_COLOR : '#8c8c8c'}">${checked ? LABELS.on : LABELS.off}</span>`
    : '';

  if (STYLE === 'toggle') {
    // Switch CSS thuần, giống antd Switch
    const W = 36, H = 20, KNOB = H - 4;
    output(`
      <span data-cbx style="display:inline-flex;align-items:center;gap:6px;${cursor}" title="${checked ? LABELS.on : LABELS.off}">
        <span style="position:relative;display:inline-block;width:${W}px;height:${H}px;border-radius:${H / 2}px;background:${color};transition:background .2s">
          <span style="position:absolute;top:2px;left:${checked ? W - KNOB - 2 : 2}px;width:${KNOB}px;height:${KNOB}px;border-radius:50%;background:#fff;box-shadow:0 2px 4px rgba(0,0,0,.2);transition:left .2s"></span>
        </span>
        ${labelHtml}
      </span>
    `);
    attachClick('[data-cbx]', checked);
  } else {
    // Kiểu icon lucide — load qua CDN (ctx.requireAsync). RunJS không truy cập được registry icon nội bộ
    // của @nocobase/client-v2 (xem docs/ICON-ARCHITECTURE.md), đây là cách đúng cho RunJS. Version khớp
    // lucide-react mà @tuanla90/plugin-custom-icons (provider icon đang active) pin.
    try {
      const lucide = await ctx.requireAsync('lucide@0.469.0/dist/umd/lucide.min.js');
      const name = checked ? ICON_ON : ICON_OFF;
      const pascal = name.split('-').map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join('');
      const iconNode = lucide.icons[pascal];
      if (!iconNode) throw new Error(`Không tìm thấy icon lucide: ${name}`);

      const el = lucide.createElement(iconNode);
      el.setAttribute('width', SIZE);
      el.setAttribute('height', SIZE);

      if (checked && FILLED) {
        // Bật + kiểu fill: nền tô ON_COLOR, dấu check nét trắng
        el.setAttribute('stroke', CHECK_COLOR);
        el.setAttribute('stroke-width', 2.5);
        const box = el.querySelector('rect, circle');
        if (box) {
          box.setAttribute('fill', ON_COLOR);
          box.setAttribute('stroke', ON_COLOR);
        }
      } else {
        el.setAttribute('stroke', color);
      }

      output(`
        <span data-cbx style="display:inline-flex;align-items:center;gap:6px;line-height:0;${cursor}" title="${checked ? LABELS.on : LABELS.off}">
          ${el.outerHTML}${labelHtml}
        </span>
      `);
      attachClick('[data-cbx]', checked);
    } catch (e) {
      // Fallback khi CDN lỗi
      output(`<span data-cbx style="color:${color};font-size:${SIZE}px;${cursor}">${checked ? '☑' : '☐'}</span>`);
      attachClick('[data-cbx]', checked);
    }
  }
}

// Giá trị ban đầu: form dùng ctx.getValue(), JS Column dùng ctx.record, JS Field dùng ctx.value
let lastDrawn;
await draw(isFormField ? ctx.getValue() : (ctx.record ? ctx.record?.[FIELD] : ctx.value));

// Form: vẽ lại khi giá trị bị đổi từ bên ngoài (reset form, linkage, submit xong...)
if (isFormField) {
  ctx.element?.addEventListener?.('js-field:value-change', (ev) => {
    const v = ev?.detail;
    if (v === lastDrawn) return;
    lastDrawn = v;
    void draw(v);
  });
}
