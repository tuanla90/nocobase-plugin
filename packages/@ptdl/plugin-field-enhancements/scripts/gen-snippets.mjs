/**
 * Dev-time generator: đọc các snippet field từ `nocobase-plugins/snippets/*.js` (NGUỒN SỰ THẬT),
 * bọc content qua JSON.stringify (tự escape an toàn backtick + ${}), sinh `src/shared/generatedSnippets.ts`.
 *
 * Chạy: node scripts/gen-snippets.mjs   (từ thư mục plugin)
 * Chạy lại mỗi khi sửa snippet nguồn, rồi build plugin.
 *
 * `contexts` set bằng tên MODEL class (không phải tên context class). Lý do: editor gọi
 * `listSnippetsForContext(ctxClassName)` với `ctxClassName = hostCtx.model.constructor.name` (tên MODEL, vd
 * 'JSEditableFieldModel') rồi bỏ THẲNG vào allowedContextNames. Snippet match nếu `contexts` chứa tên đó. Tên model
 * NocoBase KHÔNG minify (dùng cho registry getModelClass) nên bền — khác tên context class có thể minify. Registry
 * map (flow-engine `runjs-context/setup.ts`): JSEditableFieldModel→form, JSColumnModel→table, JSFieldModel→detail,
 * FormJSFieldItemModel→form. Xem memory runjs-snippet-registry-native.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNIPPETS_DIR = resolve(__dirname, '../../../../snippets');
const OUT = resolve(__dirname, '../src/shared/generatedSnippets.ts');

// Tên MODEL class (không minify). ED = field editable trong form (cả biến thể FormJSFieldItemModel).
const ED = ['JSEditableFieldModel', 'FormJSFieldItemModel'];
const COL = ['JSColumnModel'];
const FLD = ['JSFieldModel'];

// Danh mục snippet field (formula ĐÃ tách @ptdl/plugin-formula — không gộp).
const META = [
  { file: 'runjs-input-icon-placeholder.js', ref: 'ptdl/field/input-icon', label: 'Input icon + placeholder', description: 'Text/password input với icon lucide ở prefix, placeholder tự lấy từ tên field (kiểu login form).', contexts: [ED] },
  { file: 'runjs-record-select-rich.js', ref: 'ptdl/field/rich-select', label: 'Rich association dropdown', description: 'Dropdown chọn record quan hệ (m2o/o2o/o2m/m2m) — mỗi option 2 dòng: avatar + tên + chức vụ + icon trạng thái.', contexts: [ED] },
  { file: 'runjs-select-buttons.js', ref: 'ptdl/field/select-buttons', label: 'Select → button group', description: 'Field select/multi-select hiển thị thành dãy nút thay vì dropdown; tự lấy option + màu từ field.', contexts: [ED, COL] },
  { file: 'runjs-checkbox.js', ref: 'ptdl/field/checkbox', label: 'Checkbox (toggle / icon)', description: 'Field boolean hiển thị dạng switch hoặc icon lucide; bấm để đổi (form ghi qua Save, bảng lưu ngay).', contexts: [ED, COL, FLD] },
  { file: 'runjs-star.js', ref: 'ptdl/field/star', label: 'Star rating', description: 'Số (vd 3.5) → dãy icon rating 3 trạng thái fill/half/empty; editable click-to-set.', contexts: [ED, COL, FLD] },
  { file: 'runjs-process-bar.js', ref: 'ptdl/field/progress', label: 'Progress bar', description: 'Số 0–100 → thanh tiến độ + %, màu đổi theo ngưỡng; editable click-to-set.', contexts: [ED, COL, FLD] },
  { file: 'runjs-tags.js', ref: 'ptdl/field/tags', label: 'Tags / array', description: 'Multi-select hoặc m2m → dãy tag màu, cắt bớt "+N"; bỏ tag được trong form.', contexts: [ED, COL, FLD] },
  { file: 'runjs-avatar.js', ref: 'ptdl/field/avatar', label: 'Avatar + text', description: 'Ảnh đại diện (field ảnh hoặc quan hệ user) + tên bên cạnh, fallback initials khi thiếu ảnh.', contexts: [ED, COL, FLD] },
  { file: 'runjs-number-format.js', ref: 'ptdl/field/number-format', label: 'Number format', description: 'Định dạng số: phân tách nghìn (comma/dot chuẩn VN), số thập phân, tiền tệ/hậu tố.', contexts: [COL, FLD] },
  { file: 'runjs-status-format.js', ref: 'ptdl/field/status-format', label: 'Status tag (map)', description: 'Map value → nhãn + màu tag (khai báo MAP trong code).', contexts: [COL, FLD] },
];

const entries = META.map((m) => {
  const content = readFileSync(resolve(SNIPPETS_DIR, m.file), 'utf8');
  const prefix = m.ref.split('/').pop();
  // m.contexts là mảng các nhóm (mỗi nhóm ED/COL/FLD là mảng tên model) → flatten + dedupe.
  const contexts = [...new Set(m.contexts.flat())];
  return { ref: m.ref, prefix, label: m.label, description: m.description, contexts, content };
});

const header = `/**
 * AUTO-GENERATED bởi scripts/gen-snippets.mjs — ĐỪNG SỬA TAY.
 * Nguồn: nocobase-plugins/snippets/*.js. Sửa snippet nguồn rồi chạy lại generator.
 */
export type FieldSnippet = {
  ref: string;
  prefix: string;
  label: string;
  description: string;
  contexts: string[];
  content: string;
};

export const FIELD_SNIPPETS: FieldSnippet[] = ${JSON.stringify(entries, null, 2)};
`;

writeFileSync(OUT, header, 'utf8');
console.log(`[gen-snippets] wrote ${entries.length} snippets → ${OUT}`);
