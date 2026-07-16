/**
 * SINGLE source of truth for the computed-field formula DSL — reused by BOTH:
 *   • the settings-page UI (the "Ví dụ" and "hàm" popovers), and
 *   • the AI formula-writer's prompt (few-shot demos + capability list + syntax rules).
 * Keep this PLAIN (no React/antd) so the server lane can import it to build the AI prompt.
 * Update the examples/functions here once → the UI popovers AND the AI stay in sync (no prompt drift).
 */

/** The 3 trigger checkboxes (multi-select `runOn`). Shared by the settings page + the column/field ⚙ flow. */
export const TRIGGER_OPTIONS = [
  { label: 'Khi tạo', value: 'create' },
  { label: 'Khi sửa', value: 'update' },
  { label: 'Khi nguồn thay đổi', value: 'source' },
];
const LEGACY_TRIGGERS: Record<string, string[]> = { both: ['create', 'update', 'source'], create: ['create'], self: ['create', 'update'], update: ['update', 'source'] };
/** stored `runOn` (comma-joined / legacy token / array) → checkbox value array. null/undefined → all 3; '' → none. */
export function splitTriggers(v: any): string[] {
  if (Array.isArray(v)) return v;
  if (v == null) return ['create', 'update', 'source'];
  const s = String(v).trim();
  if (!s) return [];
  return LEGACY_TRIGGERS[s] || s.split(',').map((x) => x.trim()).filter(Boolean);
}

/** Few-shot: intent → formula. All e2e-verified on the SES server. Shown click-to-insert in "Ví dụ". */
export const FORMULA_EXAMPLES: Array<[string, string]> = [
  ['Cùng dòng', 'data.subtotal - data.discount'],
  ['Nhân đơn giá (kéo quan hệ)', 'data.quantity * data.product.unit_price'],
  ['Gộp quan hệ (roll-up)', 'SUM(data.items.line_amount)'],
  ['Gộp CÓ ĐIỀU KIỆN (≈ SELECT AppSheet)', 'SUMIFS(data.items.line_amount, data.items.status, "active")'],
  ['Bảng tra cứu 2 khoá (≈ VLOOKUP nhiều ĐK)', 'data.metric * SUMIFS(bang_hs.he_so, bang_hs.a, data.parent.region, bang_hs.b, data.grade)'],
  ['Số thứ tự trong nhóm (OR-123.1, .2…)', 'data.order.code & "." & (COUNTIFS(order_item.order_id, data.order_id, order_item.id, "<" & data.id) + 1)'],
  ['Lọc danh sách có điều kiện (FILTER)', 'SUM(FILTER(data.items.line_amount, data.items.status == "active" && data.items.line_amount > 0))'],
  ['Tra bảng 2 khoá ra CHỮ (SELECT + INDEX)', 'INDEX(SELECT(bang_hs.ten, bang_hs.a == data.parent.region && bang_hs.b == data.grade), 1)'],
  ['Nhãn điều kiện', 'IF(data.total>1000000, "VIP", "Thường")'],
  ['Đếm dòng con theo ĐK (COUNT+FILTER)', 'COUNT(FILTER(data.items.id, data.items.status == "pending"))'],
  ['Trung bình / lớn nhất dòng con', 'AVERAGE(data.items.line_amount)'],
  ['Tỉ lệ % hoàn thành', 'data.done_qty / data.total_qty * 100'],
  ['Cờ vượt hạn mức (boolean)', 'data.total > data.credit_limit'],
  ['Ghép chuỗi (họ tên → text)', 'data.first_name & " " & data.last_name'],
  ['Phân loại nhiều bậc (IFS)', 'IFS(data.total >= 1000000, "VIP", data.total >= 500000, "Bạc", TRUE, "Thường")'],
  ['Ngày đến hạn +1 tháng (date)', 'EDATE(data.order_date, 1)'],
  ['Số ngày giữa 2 mốc', 'DAYS(data.end_date, data.start_date)'],
  ['Tra đơn giá theo KHOÁ QUAN HỆ (so id — thay cho nested)', 'INDEX(SELECT(bang_gia.don_gia, bang_gia.product_id == data.product_id), 1)'],
];

/** Capability manifest — which functions exist (grouped). Shown in the "hàm" popover; fed to the AI so
 *  it doesn't invent non-existent functions. */
export const FORMULA_FUNCTIONS: Array<[string, string]> = [
  ['Số', 'SUM · AVERAGE · MIN · MAX · COUNT · ROUND · ROUNDUP · ABS · MOD · CEILING · FLOOR'],
  ['Lọc/gộp có điều kiện (≈ SELECT/FILTER AppSheet)', 'SUMIF · SUMIFS · COUNTIF · COUNTIFS · AVERAGEIF · AVERAGEIFS — vd SUMIFS(data.items.line_amount, data.items.status,"active")'],
  ['FILTER / SELECT — lọc DANH SÁCH theo điều kiện (bọc SUM/COUNT/INDEX…)', 'SUM(FILTER(data.items.amt, data.items.status == "active" && data.items.amt > 40)) · INDEX(SELECT(bang.ten, bang.a == data.x && bang.b == data.y), 1). Dùng == (hoặc ===), && cho VÀ, và > < >= <= <>'],
  ['Bảng tra cứu 2 khoá (gõ THẲNG tên bảng, không có data.)', 'SUMIFS(bang_hs.he_so, bang_hs.tc_a, data.a, bang_hs.tc_b, data.b) — bang_hs = tên collection config'],
  ['Lookup khác', 'INDEX · MATCH · CHOOSE · SWITCH · VLOOKUP (VLOOKUP cần mảng 2D trong 1 field JSON, không dùng cho bảng collection)'],
  ['Logic', 'IF · IFS · AND · OR · NOT · IFERROR · ISBLANK · ISNUMBER'],
  ['Text', 'CONCATENATE · LEFT · RIGHT · MID · UPPER · LOWER · TRIM · LEN · TEXT'],
  ['Ngày', 'TODAY · NOW · YEAR · MONTH · DAY · DATEDIF · EDATE · DAYS'],
];

/** The DSL syntax rules the AI must follow EXACTLY (also the essence of the "hàm" popover header). */
export const FORMULA_RULES = [
  'Dòng hiện tại: data.<field>. Quan hệ to-one: data.<relation>.<field>. Quan hệ to-many TỰ gộp: SUM(data.<relation>.<field>).',
  'Bảng tra cứu / config (collection RỜI, không phải quan hệ): gõ THẲNG tên collection, KHÔNG có data. → <tenBang>.<cot> (là MẢNG cột đó của MỌI dòng bảng).',
  'Nối chuỗi dùng & (vd: data.a & " " & data.b). So sánh: == (hoặc ===), != hoặc <>, > < >= <=. VÀ = && (hoặc AND(...)). KHÔNG dùng = đơn (là gán) hay & đơn cho VÀ.',
  'CHỈ dùng hàm có trong danh sách CAPABILITY. KHÔNG bịa hàm (không có XLOOKUP, không có mảng-động Excel FILTER(arr, boolArr)).',
  'Quan hệ lồng 2+ tầng KHÔNG nạp được (data.a.b.c hay bang.quan_he.cot ra rỗng) → so theo KHOÁ id: bang.rel_id == data.x_id.',
  'Cột đích có thể là số / text / date / boolean — trả đúng kiểu (so sánh → boolean, ghép chuỗi/IF → text, EDATE/TODAY → date).',
].join('\n');

/** Build the AI system prompt: rules + capability + few-shot + the live collection schema (injected). */
export function buildFormulaSystemPrompt(schemaText: string): string {
  const fns = FORMULA_FUNCTIONS.map(([g, f]) => `- ${g}: ${f}`).join('\n');
  const shots = FORMULA_EXAMPLES.map(([intent, f]) => `- "${intent}" → ${f}`).join('\n');
  return [
    'Bạn viết ĐÚNG 1 công thức cho tính năng "computed field" (cột tự tính) trong app NocoBase.',
    'Chỉ trả về BIỂU THỨC công thức — không markdown, không giải thích lồng trong công thức.',
    'Chỉ dùng tên field/quan hệ/bảng CÓ THẬT trong schema bên dưới.',
    '',
    'LUẬT CÚ PHÁP (tuân thủ CHÍNH XÁC):',
    FORMULA_RULES,
    '',
    'CAPABILITY — các hàm có sẵn (KHÔNG dùng hàm ngoài danh sách này):',
    fns,
    '',
    'VÍ DỤ (ý muốn → công thức):',
    shots,
    '',
    'SCHEMA của collection bạn đang viết công thức cho:',
    schemaText,
  ].join('\n');
}
