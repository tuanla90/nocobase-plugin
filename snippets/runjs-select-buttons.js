/**
 * Select → Button group — Run JS (JS Column / JS editable field trong form)
 * Hiển thị field select/multi-select thành dãy NÚT thay vì dropdown — sửa nhanh khi option ít (2-3 mục).
 * - Single select → nút kiểu Radio (chọn đúng 1, có thể bỏ chọn nếu ALLOW_DESELECT)
 * - Multi select  → nút kiểu Checkbox (bấm nhiều nút, độc lập bật/tắt từng nút)
 *
 * COLOR_MODE:
 * - 'colorful' → mỗi option 1 màu riêng, KẾ THỪA màu đã cấu hình trên field (Edit field → chỉnh màu từng option).
 * - 'mono'     → chỉ 1 màu (MONO_COLOR) cho nút đang active, các nút khác trung tính (xám) — mặc định lấy màu
 *                primary theo theme qua CSS var `--colorPrimaryTextActive` (NocoBase tự set sẵn trên <body>),
 *                không lấy được thì fallback về xanh dương antd.
 *
 * LAYOUT:
 * - 'separated' → mỗi nút tách rời, viền riêng, có khoảng cách (kiểu hiện tại).
 * - 'joined'    → dính thành 1 khối kiểu segmented control (nền track xám nhạt, nút active nổi lên nền trắng).
 *
 * ICONS: mapping icon lucide theo TỪNG value (key = String(value) của option) — để trống = không hiện icon,
 * không tốn tải lucide. Icon dùng màu currentColor nên tự đổi màu theo COLOR_MODE/trạng thái active như chữ.
 *
 * RADIUS: số (px) hoặc 'full' (bo tròn hết cỡ, kiểu pill/segmented tròn).
 *
 * FONT_SIZE: số (px) — để `null` thì tự theo SIZE ('small'=12px, 'default'=13px) như trước.
 *
 * Tự nhận diện ngữ cảnh:
 * - Form Create/Edit (JS editable field): ghi qua ctx.setValue — bấm Save của form mới lưu
 * - JS Column (bảng): gọi API update — lưu ngay
 */

// ================== CẤU HÌNH ==================
const FIELD          = 'status'; // tên field select/multi-select trên record
const MODE            = 'auto';  // 'auto' | 'single' | 'multi' — auto: tự nhận theo field.interface
const ALLOW_DESELECT  = true;    // (single) bấm lại nút đang chọn → bỏ chọn (value = null)
const SIZE             = 'default'; // 'small' | 'default' — quyết định padding của nút
const FONT_SIZE         = null;     // số (px), vd 15 — để null thì tự theo SIZE (small=12px, default=13px)
const GAP              = 6;         // khoảng cách giữa các nút — chỉ áp dụng khi LAYOUT='separated' (px)
const COLOR_MODE       = 'colorful'; // 'colorful' | 'mono'
const MONO_COLOR       = 'var(--colorPrimaryTextActive, #1677ff)'; // màu dùng khi COLOR_MODE='mono'
const LAYOUT           = 'separated'; // 'separated' | 'joined'
const RADIUS           = 4; // số (px) hoặc 'full' (bo tròn hết cỡ)
const ICON_SIZE         = 14; // kích thước icon (px)
// Icon lucide theo từng value — key PHẢI là String(value) của option (vd value số 1 → key '1')
const ICONS = {
  // todo: 'circle',
  // doing: 'loader',
  // done: 'check-circle',
};
// Fallback khi KHÔNG lấy được option từ field (vd chạy trong JS Block không gắn collection) — điền tay:
const OPTIONS_FALLBACK = [
  // { value: 'todo', label: 'To do', color: 'default' },
  // { value: 'doing', label: 'Doing', color: 'blue' },
  // { value: 'done', label: 'Done', color: 'green' },
];

// Preset màu chuẩn antd — field select của NocoBase chọn màu option từ đúng bộ này
const PRESET_HEX = {
  red: '#f5222d', volcano: '#fa541c', orange: '#fa8c16', gold: '#faad14',
  yellow: '#fadb14', lime: '#a0d911', green: '#52c41a', cyan: '#13c2c2',
  blue: '#1677ff', geekblue: '#2f54eb', purple: '#722ed1', magenta: '#eb2f96',
  default: '#8c8c8c',
};

// ==============================================
function toHex(color) {
  if (!color) return PRESET_HEX.default;
  if (PRESET_HEX[color]) return PRESET_HEX[color];
  if (/^#|^rgb/i.test(color)) return color;
  return PRESET_HEX.default;
}

// Màu "chủ đạo" của 1 option theo COLOR_MODE — dùng chung cho cả 2 layout
function colorFor(opt) {
  return COLOR_MODE === 'mono' ? MONO_COLOR : toHex(opt.color);
}

function radiusPx(base) {
  return RADIUS === 'full' ? 999 : (RADIUS ?? base);
}

// Cache icon SVG (name → outerHTML) — chỉ tải lucide nếu ICONS có cấu hình, tải 1 lần rồi dùng lại cho mọi lần vẽ.
// stroke="currentColor" nên icon tự đổi màu theo `color` của button (active/inactive/mono/colorful) mà không cần tính riêng.
let iconCache = {};
async function loadIconCache() {
  const names = Object.values(ICONS).filter(Boolean);
  if (!names.length) return;
  try {
    // Load qua CDN (RunJS không truy cập được registry icon nội bộ @nocobase/client-v2 — xem
    // docs/ICON-ARCHITECTURE.md). Version khớp lucide-react mà @ptdl/plugin-custom-icons pin (provider đang active).
    const lucide = await ctx.requireAsync('lucide@0.469.0/dist/umd/lucide.min.js');
    for (const name of new Set(names)) {
      const pascal = name.split('-').map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join('');
      const iconNode = lucide.icons[pascal];
      if (!iconNode) continue;
      const el = lucide.createElement(iconNode);
      el.setAttribute('width', ICON_SIZE);
      el.setAttribute('height', ICON_SIZE);
      el.setAttribute('stroke', 'currentColor');
      iconCache[name] = el.outerHTML;
    }
  } catch (_) {
    // Tải icon lỗi (CDN down...) → bỏ qua, nút vẫn hiện chữ bình thường
  }
}

function iconFor(opt) {
  const name = ICONS[String(opt.value)];
  if (!name || !iconCache[name]) return '';
  return `<span style="display:inline-flex;line-height:0">${iconCache[name]}</span>`;
}

const output = (html) =>
  typeof ctx.render === 'function' ? ctx.render(html) : (ctx.element.innerHTML = html);

const isFormField = typeof ctx.setValue === 'function' && typeof ctx.getValue === 'function';
const canEdit = isFormField
  ? !ctx.readOnly && !ctx.disabled
  : !!(ctx.record && ctx.collection && typeof ctx.api?.request === 'function');
let saving = false;

// Lấy định nghĩa field (nếu ctx.collection có sẵn) để suy ra: danh sách option (value/label/color) + single hay multi
const fieldDef = ctx.collection?.getField?.(FIELD);
const options = (fieldDef?.enum?.length ? fieldDef.enum : OPTIONS_FALLBACK) || [];
const isMulti = MODE === 'auto' ? fieldDef?.interface === 'multipleSelect' : MODE === 'multi';

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

let lastDrawn;

function draw(raw) {
  lastDrawn = raw;

  if (!options.length) {
    output('<span style="color:#bfbfbf">Chưa có option (kiểm tra FIELD hoặc điền OPTIONS_FALLBACK)</span>');
    return;
  }

  const selected = isMulti
    ? new Set(Array.isArray(raw) ? raw : raw != null ? [raw] : [])
    : new Set(raw != null ? [raw] : []);

  const pad = SIZE === 'small' ? '2px 10px' : '4px 14px';
  const fontSize = FONT_SIZE ?? (SIZE === 'small' ? 12 : 13);
  const cursor = canEdit ? 'cursor:pointer' : 'cursor:default';

  let btns, wrapStyle;

  if (LAYOUT === 'joined') {
    // Kiểu segmented: track nền xám nhạt, nút active nổi lên nền trắng + shadow nhẹ
    const itemRadius = radiusPx(4);
    const trackRadius = RADIUS === 'full' ? 999 : itemRadius + 2;
    btns = options
      .map((opt) => {
        const active = selected.has(opt.value);
        const color = active ? colorFor(opt) : '#8c8c8c';
        const style = active
          ? `background:#fff;color:${color};box-shadow:0 1px 2px rgba(0,0,0,.08)`
          : `background:transparent;color:${color}`;
        return `<button type="button" data-val="${String(opt.value)}" ${canEdit ? '' : 'disabled'}
          style="${style};${cursor};padding:${pad};font-size:${fontSize}px;border:none;border-radius:${itemRadius}px;line-height:1.4;font-weight:${active ? 500 : 400};transition:all .15s;display:inline-flex;align-items:center;gap:4px">
          ${iconFor(opt)}<span>${opt.label ?? opt.value}</span>
        </button>`;
      })
      .join('');
    wrapStyle = `display:inline-flex;align-items:center;gap:2px;background:#f0f0f0;padding:2px;border-radius:${trackRadius}px`;
  } else {
    // Kiểu tách rời: mỗi nút viền riêng
    const itemRadius = radiusPx(4);
    btns = options
      .map((opt) => {
        const active = selected.has(opt.value);
        const color = colorFor(opt);
        const style = active
          ? `background:${color};border-color:${color};color:#fff`
          : COLOR_MODE === 'mono'
            ? 'background:#fff;border-color:#d9d9d9;color:#595959'
            : `background:#fff;border-color:${color}88;color:${color}`;
        return `<button type="button" data-val="${String(opt.value)}" ${canEdit ? '' : 'disabled'}
          style="${style};${cursor};padding:${pad};font-size:${fontSize}px;border-width:1px;border-style:solid;border-radius:${itemRadius}px;line-height:1.4;font-weight:${active ? 500 : 400};transition:all .15s;display:inline-flex;align-items:center;gap:4px">
          ${iconFor(opt)}<span>${opt.label ?? opt.value}</span>
        </button>`;
      })
      .join('');
    wrapStyle = `display:inline-flex;flex-wrap:wrap;align-items:center;gap:${GAP}px`;
  }

  output(`<span data-btn-group style="${wrapStyle}">${btns}</span>`);

  if (!canEdit) return;
  const wrap = ctx.element?.querySelector?.('[data-btn-group]');
  if (!wrap) return;
  wrap.addEventListener('click', async (e) => {
    const btn = e.target?.closest?.('[data-val]');
    if (!btn || saving) return;
    e.stopPropagation();

    // Khớp lại value gốc (đúng kiểu number/string/boolean) từ chuỗi data-val
    const matched = options.find((o) => String(o.value) === btn.getAttribute('data-val'));
    if (!matched) return;

    let nextVal;
    if (isMulti) {
      const current = Array.isArray(lastDrawn) ? [...lastDrawn] : [];
      const idx = current.findIndex((v) => v === matched.value);
      if (idx >= 0) current.splice(idx, 1);
      else current.push(matched.value);
      nextVal = current;
    } else {
      const isSame = lastDrawn === matched.value;
      nextVal = isSame && ALLOW_DESELECT ? null : matched.value;
    }

    saving = true;
    try {
      await save(nextVal);
      draw(nextVal);
    } catch (err) {
      ctx.message?.error?.(err.message || 'Cập nhật thất bại');
    } finally {
      saving = false;
    }
  });
}

// Tải icon (nếu có cấu hình ICONS) rồi mới vẽ lần đầu — tránh vẽ thiếu icon do CDN chưa kịp trả về
await loadIconCache();

// Giá trị ban đầu: form dùng ctx.getValue(), JS Column dùng ctx.record, JS Field dùng ctx.value
draw(isFormField ? ctx.getValue() : ctx.record ? ctx.record?.[FIELD] : ctx.value);

// Form: vẽ lại khi giá trị bị đổi từ bên ngoài (reset form, linkage, submit xong...)
if (isFormField) {
  ctx.element?.addEventListener?.('js-field:value-change', (ev) => {
    draw(ev?.detail);
  });
}
