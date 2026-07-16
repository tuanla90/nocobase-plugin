/**
 * Định dạng kết quả công thức (Number/Date) — dùng chung cho Formula column + Formula display field.
 * Number/date formatting ủy quyền cho @ptdl/shared/format (makeNumberFormatter / formatDate) — bản
 * canonical — thay vì tự viết lại regex toFixed+nghìn và token replacer YYYY/MM/DD.
 * Chuỗi import CLIENT-ONLY (field models + editor), KHÔNG chạm server bundle (đã verify).
 */
import { makeNumberFormatter, formatDate } from '@ptdl/shared/format';

export type FormulaFormatProps = {
  fmtType?: 'auto' | 'number' | 'date';
  fmtThousands?: boolean;
  fmtDecimals?: number;
  fmtDate?: string;
};

/** null = ngày không hợp lệ (caller fallback về render mặc định) — giữ nguyên contract cũ. */
export function formatDateValue(v: any, fmt: string): string | null {
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return formatDate(d, fmt || 'DD/MM/YYYY');
}

export function formatNumberValue(v: any, p: FormulaFormatProps): string | null {
  const n = Number(v);
  if (v === null || v === undefined || v === '' || Number.isNaN(n)) return null;
  if (p.fmtDecimals !== undefined && p.fmtDecimals !== null) {
    return makeNumberFormatter({ decimals: p.fmtDecimals, thousandSep: p.fmtThousands ? ',' : '' })(n);
  }
  // decimals KHÔNG set → giữ đúng precision của String(n) (kể cả dạng mũ 1e-7 / 1e21); makeNumberFormatter
  // luôn toFixed() nên sẽ làm mất/nở precision ở nhánh này → giữ local, chỉ group nghìn y như cũ.
  let s = String(n);
  if (p.fmtThousands) {
    const parts = s.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    s = parts.join('.');
  }
  return s;
}

/** null = không áp format (để caller dùng resultToString mặc định / render HTML như cũ). */
export function applyFormulaFormat(value: any, p: FormulaFormatProps): string | null {
  if (!p || !p.fmtType || p.fmtType === 'auto') return null;
  if (p.fmtType === 'number') return formatNumberValue(value, p);
  if (p.fmtType === 'date') return formatDateValue(value, p.fmtDate || 'DD/MM/YYYY');
  return null;
}

export const DATE_FORMAT_PRESETS = [
  'DD/MM/YYYY',
  'DD/MM/YYYY HH:mm',
  'YYYY-MM-DD',
  'YYYY-MM-DD HH:mm',
  'MM/YYYY',
  'HH:mm',
];
