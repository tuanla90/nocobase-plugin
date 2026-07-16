/**
 * Progress bar — Run JS (JS Column / JS Field)
 * Hiển thị giá trị số thành thanh tiến độ + %, màu đổi theo ngưỡng
 * EDITABLE = true: bấm vào vị trí trên thanh để đặt giá trị mới. Tự nhận diện ngữ cảnh:
 * - Form Create/Edit (dùng "JS field" nhóm editable): ghi vào form qua ctx.setValue — bấm Save mới lưu
 * - JS Column (bảng): gọi API update — lưu ngay
 */

// ================== CẤU HÌNH ==================
const FIELD      = 'amount';   // tên field lấy giá trị từ record (JS Column)
const MAX        = 100;        // giá trị coi là 100% (vd field lưu 0–1 thì để MAX = 1)
const EDITABLE   = true;       // true: bấm lên thanh để đặt giá trị theo vị trí bấm
const STEP       = 5;          // bước làm tròn % khi bấm chỉnh (vd 5 → 0,5,10,...)
const SHOW_TEXT  = true;       // hiện số % bên cạnh thanh
const DECIMALS   = 0;          // số chữ số thập phân của %
const BAR_HEIGHT = 10;         // độ cao thanh (px)
const BAR_WIDTH  = 100;        // độ rộng thanh (px); 0 = co giãn theo ô
// Ngưỡng màu: duyệt từ trên xuống, lấy màu đầu tiên có percent >= min
const THRESHOLDS = [
  { min: 100, color: '#52c41a' }, // xanh lá — hoàn thành
  { min: 70,  color: '#1677ff' }, // xanh dương
  { min: 40,  color: '#faad14' }, // vàng
  { min: 0,   color: '#f5222d' }, // đỏ
];

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

function draw(raw) {
  lastDrawn = raw; // để listener value-change không vẽ trùng
  if (!Number.isFinite(raw)) {
    output('<span style="color:#bfbfbf">-</span>');
    return;
  }

  const percent = Math.max(0, Math.min(100, (raw / MAX) * 100));
  const color = (THRESHOLDS.find((t) => percent >= t.min) || THRESHOLDS.at(-1)).color;

  const widthStyle = BAR_WIDTH > 0 ? `width:${BAR_WIDTH}px` : 'flex:1;min-width:60px';
  const cursor = canEdit ? 'cursor:pointer' : '';
  const textHtml = SHOW_TEXT
    ? `<span style="color:${color};font-weight:500;font-size:12px;min-width:${DECIMALS > 0 ? 48 : 36}px;text-align:right">${percent.toFixed(DECIMALS)}%</span>`
    : '';

  output(`
    <div title="${raw} / ${MAX}${canEdit ? ' — bấm để chỉnh' : ''}" style="display:flex;align-items:center;gap:8px">
      <div data-bar style="${widthStyle};height:${BAR_HEIGHT}px;background:#f0f0f0;border-radius:${BAR_HEIGHT / 2}px;overflow:hidden;${cursor}">
        <div style="width:${percent}%;height:100%;background:${color};border-radius:${BAR_HEIGHT / 2}px;transition:width .3s ease;pointer-events:none"></div>
      </div>
      ${textHtml}
    </div>
  `);

  if (!canEdit) return;
  const track = ctx.element?.querySelector?.('[data-bar]');
  if (!track) return;
  track.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (saving) return;
    saving = true;
    try {
      // % mới = vị trí bấm trên thanh, làm tròn theo STEP
      const rect = track.getBoundingClientRect();
      let p = ((e.clientX - rect.left) / rect.width) * 100;
      p = Math.max(0, Math.min(100, Math.round(p / STEP) * STEP));
      const newRaw = Number(((p / 100) * MAX).toFixed(4)); // tránh sai số 0.30000000004
      await save(newRaw);
      draw(newRaw);
    } catch (err) {
      ctx.message?.error?.(err.message || 'Cập nhật thất bại');
    } finally {
      saving = false;
    }
  });
}

// Giá trị ban đầu: form dùng ctx.getValue(), JS Column dùng ctx.record, JS Field dùng ctx.value
let lastDrawn;
draw(Number((isFormField ? ctx.getValue() : ctx.record ? ctx.record?.[FIELD] : ctx.value) ?? NaN));

// Form: vẽ lại khi giá trị bị đổi từ bên ngoài (reset form, linkage, submit xong...)
if (isFormField) {
  ctx.element?.addEventListener?.('js-field:value-change', (ev) => {
    const v = Number(ev?.detail ?? NaN);
    if (v === lastDrawn || (Number.isNaN(v) && Number.isNaN(lastDrawn))) return;
    draw(v);
  });
}
