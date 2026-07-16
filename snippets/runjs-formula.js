/**
 * Formula cell — Run JS (JS Column / JS Field hiển thị / JS editable field)
 * Viết 1 CÔNG THỨC kiểu Excel để tính toán + hiển thị HTML, thay vì viết cả đoạn JS.
 *
 * Thư viện hàm = FORMULA.JS (@formulajs/formulajs) — ~400 hàm Excel CÓ SẴN, nạp từ CDN,
 * KHÔNG phải tự khai báo từng hàm: SUM, AVERAGE, IF, IFS, SWITCH, ROUND, TEXT, CONCATENATE,
 * LEFT/RIGHT/MID, VLOOKUP, DATEDIF, AND/OR/NOT, MIN/MAX... (tra hàm Excel nào cũng chạy).
 * Viết HOA hay thường đều được: SUM(...) = sum(...).
 *
 *   FORMULA = 'CONCATENATE("<b>", data.name, "</b>")'
 *   FORMULA = 'data.quality * data.product.price'          // truy cập lồng nhau + tính toán
 *   FORMULA = 'sum(data.order_ids.amount)'                 // CỘNG DỒN mảng quan hệ (xem "PLUCK" bên dưới)
 *   FORMULA = 'IF(data.total > 1000000, TAG("VIP","gold"), TAG("Thường","default"))'
 *   FORMULA = 'TEXT(data.price, "#,##0") & " đ"'           // & = nối chuỗi kiểu Excel
 *
 * PLUCK mảng quan hệ: `data.order_ids.amount` tự trả về MẢNG amount của từng dòng con
 *   [10,20,30] → lồng vào SUM/AVERAGE/MAX...  Lồng nhiều tầng cũng được: `sum(data.lines.item.price)`.
 *   ⚠ Bảng KHÔNG tự nạp field quan hệ cho JS Column — phải thêm quan hệ đó vào block (hoặc appends) để
 *     record có sẵn dữ liệu con, nếu không mảng sẽ rỗng.
 *
 * - `data` / `record` = record dòng hiện tại (JS Column) hoặc record đang xem (JS Field).
 * - `value` = giá trị của chính field đang gắn RunJS (nếu có).
 * - Kết quả có thẻ HTML (<b>, <span style>, TAG(), COLOR()...) → render HTML thật khi RENDER_HTML = true.
 *
 * KHÔNG cần build/cài plugin — chỉ dán RunJS này lên 1 JS Column hoặc JS Field, sửa dòng FORMULA.
 */

// ============================== CẤU HÌNH ==============================
const FORMULA = 'CONCATENATE("<b>", data.name, "</b>")'; // ← công thức của bạn ở đây
const RENDER_HTML = true;   // true: render kết quả thành HTML | false: hiện text thô (an toàn hơn)
const ALIGN       = 'left'; // 'left' | 'center' | 'right'
const EMPTY_TEXT  = '';     // hiện gì khi kết quả rỗng/null (vd '—')
const LIB_URL     = '@formulajs/formulajs@4.6.0'; // đổi version nếu cần
const SHOW_HELP   = false;  // true: in danh sách hàm formulajs ra Console (F12) để tra cứu
// =====================================================================

// ---- Nguồn dữ liệu ----
const rawData = ctx.record ?? {};
const value   = (typeof ctx.getValue === 'function' ? ctx.getValue() : undefined) ?? ctx.value;

// ---- Proxy tự "pluck" xuyên mảng quan hệ: data.order_ids.amount -> [a1,a2,...], lồng nhiều tầng ----
const ARR_PASS = new Set(['length', 'constructor']);
function wrap(v) {
  if (Array.isArray(v)) {
    return new Proxy(v, {
      get(t, k) {
        if (typeof k === 'symbol' || ARR_PASS.has(k) || (typeof k === 'string' && /^\d+$/.test(k)) || k in Array.prototype) {
          const val = t[k];
          return typeof val === 'function' ? val.bind(t) : val;
        }
        return wrap(t.map((el) => (el == null ? undefined : el[k])));
      },
    });
  }
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    return new Proxy(v, { get(t, k) { return typeof k === 'symbol' ? t[k] : wrap(t[k]); } });
  }
  return v;
}

// ---- Toán tử nối chuỗi Excel `&` -> `+` (bỏ qua `&&`, `&=`, và `&` trong chuỗi "" '' ``) ----
function ampToPlus(src) {
  let out = '', q = null;
  for (let i = 0; i < src.length; i++) {
    const c = src[i], p = src[i - 1];
    if (q) { out += c; if (c === q && p !== '\\') q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; out += c; continue; }
    if (c === '&') {
      if (src[i + 1] === '&') { out += '&&'; i++; continue; }
      if (src[i + 1] === '=') { out += '&='; i++; continue; }
      out += '+'; continue;
    }
    out += c;
  }
  return out;
}

// ---- Hàm HTML tự thêm (formulajs chỉ tính toán, không có phần hiển thị) ----
const _s = (v) => (v === null || v === undefined ? '' : String(v));
const _esc = (v) => _s(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const TAG_COLORS = { red: '#cf1322', volcano: '#d4380d', orange: '#d46b08', gold: '#d48806', yellow: '#d4b106', lime: '#7cb305', green: '#389e0d', cyan: '#08979c', blue: '#096dd9', geekblue: '#1d39c4', purple: '#531dab', magenta: '#c41d7f', gray: '#595959', default: '#595959' };
const HTML_FNS = {
  B: (x) => '<b>' + _s(x) + '</b>',
  I: (x) => '<i>' + _s(x) + '</i>',
  U: (x) => '<u>' + _s(x) + '</u>',
  BR: () => '<br/>',
  ESCAPE: (x) => _esc(x),
  COLOR: (x, c) => '<span style="color:' + _s(c) + '">' + _s(x) + '</span>',
  BG: (x, c) => '<span style="background:' + _s(c) + ';padding:1px 6px;border-radius:4px">' + _s(x) + '</span>',
  LINK: (href, text) => '<a href="' + _esc(href) + '" target="_blank" rel="noopener">' + _s(text ?? href) + '</a>',
  IMG: (src, size = 20) => '<img src="' + _esc(src) + '" style="width:' + size + 'px;height:' + size + 'px;border-radius:4px;object-fit:cover;vertical-align:middle"/>',
  DOT: (color = '#16a34a', size = 8) => '<span style="display:inline-block;width:' + size + 'px;height:' + size + 'px;border-radius:50%;background:' + _s(color) + ';vertical-align:middle"></span>',
  TAG: (text, color = 'default') => {
    const c = TAG_COLORS[color] || color;
    return '<span style="display:inline-flex;align-items:center;color:' + c + ';border:1px solid ' + c + '55;background:' + c + '14;border-radius:10px;padding:0 8px;font-size:12px;line-height:1.7;font-weight:600">' + _s(text) + '</span>';
  },
};

// ---- Tên là từ khoá JS thì không dùng làm tham số của new Function được → bỏ qua ----
const RESERVED = new Set(('do if in for let new try var case else enum eval null this true void with await break catch class const false super throw while yield delete export import public return static switch typeof default extends finally package private continue debugger function arguments interface protected implements instanceof').split(' '));

// ---- Nạp formulajs (cache toàn cục, chỉ tải mạng lần đầu) rồi đánh giá FORMULA ----
async function run() {
  let F;
  try {
    const mod = await ctx.importAsync(LIB_URL);
    F = mod && typeof mod.SUM === 'function' ? mod : (mod && mod.default) || mod;
  } catch (e) {
    return { error: new Error('Không nạp được thư viện formulajs (' + LIB_URL + '): ' + e.message) };
  }
  if (!F || typeof F.SUM !== 'function') return { error: new Error('formulajs nạp không đúng định dạng.') };

  if (SHOW_HELP) console.log('[FORMULA] Hàm formulajs:', Object.keys(F).sort().join(', '));

  // Gộp scope: formulajs (HOA + alias thường) + hàm HTML + data/value/record
  const map = {};
  for (const k of Object.keys(F)) {
    if (typeof F[k] !== 'function') continue;
    if (!RESERVED.has(k)) map[k] = F[k];
    const lk = k.toLowerCase();
    if (!(lk in map) && !RESERVED.has(lk)) map[lk] = F[k];
  }
  Object.assign(map, HTML_FNS); // hàm HTML luôn thắng nếu trùng tên
  map.data = wrap(rawData); map.record = wrap(rawData); map.value = value;

  const names = Object.keys(map), vals = names.map((n) => map[n]);
  try {
    const src = ampToPlus(FORMULA);
    const body = /(^|[^.\w])return[\s(]/.test(src) ? src : 'return ( ' + src + ' );';
    // eslint-disable-next-line no-new-func
    const fn = new Function(...names, body);
    let out = fn(...vals);
    if (out && out.error) out = String(out); // lỗi kiểu #DIV/0! của formulajs
    return { value: out };
  } catch (e) {
    return { error: e };
  }
}

function Cell(props) {
  const { error, value: out } = props.r;
  if (error) {
    return ctx.React.createElement('span', {
      style: { color: '#cf1322', fontFamily: 'monospace', fontSize: 12, cursor: 'help' },
      title: 'Lỗi công thức: ' + error.message + '\n\n' + FORMULA,
    }, '#ERR');
  }
  const text = _s(out);
  const wrapStyle = { display: 'block', textAlign: ALIGN, width: '100%' };
  if (text === '' || out === null || out === undefined) {
    return ctx.React.createElement('span', { style: { color: '#bbb' } }, EMPTY_TEXT);
  }
  if (RENDER_HTML) {
    return ctx.React.createElement('span', { style: wrapStyle, dangerouslySetInnerHTML: { __html: text } });
  }
  return ctx.React.createElement('span', { style: wrapStyle }, text);
}

const r = await run();
ctx.render(ctx.React.createElement(Cell, { r }));

/* ============================ GHI CHÚ NHANH ============================
 * • Toán tử:  &  = nối chuỗi (Excel),  + - * /  tính toán,  > < >= <= == !=  so sánh,  a ? b : c  điều kiện nhanh.
 * • Hàm Excel: gõ tên hàm Excel bất kỳ (tra Google "excel <hàm>"), formulajs hỗ trợ ~400 hàm.
 *     Text : CONCATENATE · TEXTJOIN · LEFT · RIGHT · MID · UPPER · LOWER · PROPER · TRIM · LEN · SUBSTITUTE · TEXT · REPT
 *     Logic: IF · IFS · SWITCH · AND · OR · NOT · IFERROR · ISBLANK · ISNUMBER
 *     Số   : SUM · AVERAGE · MIN · MAX · COUNT · ROUND · ROUNDUP · ROUNDDOWN · ABS · MOD · POWER · CEILING · FLOOR
 *     Ngày : TODAY · NOW · DATE · YEAR · MONTH · DAY · DATEDIF · EDATE · TEXT(date,"dd/mm/yyyy")
 *     Tra  : VLOOKUP · INDEX · MATCH · CHOOSE
 * • Hàm HTML tự thêm (cần RENDER_HTML=true): B · I · U · BR · COLOR(x,màu) · BG · LINK(href,text) · IMG(src,size)
 *     TAG(text,màu) · DOT(màu,size) · ESCAPE(x).  Màu TAG: red/orange/gold/green/blue/purple/gray/... hoặc mã hex.
 *
 * VÍ DỤ:
 *   data.quality * data.product.price
 *   sum(data.order_ids.amount)
 *   TEXT(sum(data.lines.item.price), "#,##0") & " đ"
 *   IF(data.stock > 0, TAG("Còn hàng","green"), TAG("Hết","red"))
 *   IFS(data.score>=8,"Giỏi", data.score>=5,"Khá", true,"Yếu")
 *   COLOR(ROUND(data.done/data.total*100,0) & "%", data.done>=data.total ? "#16a34a" : "#d46b08")
 *   TEXT(data.createdAt, "dd/mm/yyyy") & " " & DOT(data.active ? "#16a34a" : "#bbb")
 * ==================================================================== */
