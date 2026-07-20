// Handlebars helper set — ported verbatim (behaviour-wise) from the user's proven
// "khối HTML" template setup, so existing templates keep working when pasted in.
import Handlebars from 'handlebars';
import qrcode from 'qrcode-generator';
// Shared token-based date formatter — superset of the former local `formatDateImpl` with the
// same tokens + in-word guard; identical output for the valid Dates both call sites pass.
import { formatDate as formatDateImpl } from '@tuanla90/shared/format';

type HB = typeof Handlebars;

// Vietnamese "đọc số thành chữ" — e.g. 1234567 → "một triệu hai trăm ba mươi bốn nghìn năm trăm sáu mươi bảy"
const DV = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
function doc3(num: number, full: boolean): string {
  const tram = Math.floor(num / 100);
  const chuc = Math.floor((num % 100) / 10);
  const donvi = num % 10;
  let s = '';
  if (tram > 0) s = DV[tram] + ' trăm';
  else if (full) s = 'không trăm';
  if (chuc > 1) {
    s += ' ' + DV[chuc] + ' mươi';
    if (donvi === 1) s += ' mốt';
    else if (donvi === 5) s += ' lăm';
    else if (donvi > 0) s += ' ' + DV[donvi];
  } else if (chuc === 1) {
    s += ' mười';
    if (donvi === 5) s += ' lăm';
    else if (donvi > 0) s += ' ' + DV[donvi];
  } else if (donvi > 0) {
    if (tram > 0 || full) s += ' linh ' + DV[donvi];
    else s += DV[donvi];
  }
  return s.trim();
}
export function docSo(input: any): string {
  let n = Math.round(Number(input));
  if (isNaN(n)) return '';
  if (n === 0) return 'không';
  const neg = n < 0;
  n = Math.abs(n);
  const groups: number[] = [];
  while (n > 0) {
    groups.unshift(n % 1000);
    n = Math.floor(n / 1000);
  }
  const len = groups.length;
  const parts: string[] = [];
  for (let i = 0; i < len; i++) {
    const g = groups[i];
    const scaleIdx = len - 1 - i;
    if (g === 0) continue;
    const str = doc3(g, i > 0);
    const s3 = scaleIdx % 3;
    const billions = Math.floor(scaleIdx / 3);
    let scale = ['', 'nghìn', 'triệu'][s3];
    if (billions > 0) scale = (scale ? scale + ' ' : '') + Array(billions).fill('tỷ').join(' ');
    parts.push((str + ' ' + scale).trim());
  }
  return ((neg ? 'âm ' : '') + parts.join(' ')).replace(/\s+/g, ' ').trim();
}

export function createRenderer(): HB {
  const hb = Handlebars.create() as HB;
  registerPtdlHelpers(hb);
  return hb;
}

export function registerPtdlHelpers(hb: HB) {
  // --- Arrays ---
  hb.registerHelper({
    arrayGet: (arr: any, i: any) => (Array.isArray(arr) ? arr[i] : ''),
    arrayLength: (arr: any) => (Array.isArray(arr) ? arr.length : 0),
    arrayIncludes: (arr: any, v: any) => Array.isArray(arr) && arr.includes(v),
    arrayJoin: (arr: any, sep: any) => (Array.isArray(arr) ? arr.join(typeof sep === 'string' ? sep : ', ') : ''),
    arrayMax: (arr: any) => (Array.isArray(arr) ? Math.max(...arr.map(Number)) : null),
    arrayMin: (arr: any) => (Array.isArray(arr) ? Math.min(...arr.map(Number)) : null),
    arraySum: (arr: any) => (Array.isArray(arr) ? arr.reduce((a, b) => a + Number(b || 0), 0) : 0),
    arrayAvg: (arr: any) =>
      Array.isArray(arr) && arr.length ? arr.reduce((a, b) => a + Number(b || 0), 0) / arr.length : 0,
    arrayUnique: (arr: any) => (Array.isArray(arr) ? [...new Set(arr)] : []),
    arrayReverse: (arr: any) => (Array.isArray(arr) ? [...arr].reverse() : []),
  } as any);

  hb.registerHelper('pluck', function (arr: any, ...keys: any[]) {
    keys.pop(); // options
    if (!Array.isArray(arr)) return '';
    return keys.length === 1 ? arr.map((o) => o?.[keys[0]]) : arr.map((o) => keys.map((k) => o?.[k]));
  });

  // --- Math ---
  (['add', 'subtract', 'multiply', 'divide', 'mod'] as const).forEach((fn) => {
    hb.registerHelper(fn, (a: any, b: any) => {
      a = Number(a);
      b = Number(b);
      if (fn === 'add') return a + b;
      if (fn === 'subtract') return a - b;
      if (fn === 'multiply') return a * b;
      if (fn === 'divide') return b !== 0 ? a / b : 0;
      return a % b;
    });
  });

  // --- Comparison / logic ---
  hb.registerHelper({
    // eslint-disable-next-line eqeqeq
    eq: (a: any, b: any) => a == b,
    // eslint-disable-next-line eqeqeq
    ne: (a: any, b: any) => a != b,
    gt: (a: any, b: any) => Number(a) > Number(b),
    lt: (a: any, b: any) => Number(a) < Number(b),
    gte: (a: any, b: any) => Number(a) >= Number(b),
    lte: (a: any, b: any) => Number(a) <= Number(b),
    and: function (...args: any[]) {
      return args.slice(0, -1).every(Boolean);
    },
    or: function (...args: any[]) {
      return args.slice(0, -1).some(Boolean);
    },
  } as any);

  // --- Strings ---
  hb.registerHelper({
    uppercase: (s: any) => String(s ?? '').toUpperCase(),
    lowercase: (s: any) => String(s ?? '').toLowerCase(),
    capitalize: (s: any) => {
      const str = String(s ?? '');
      return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    },
    concat: (...args: any[]) => args.slice(0, -1).join(''),
    proper: (s: any) =>
      String(s ?? '')
        .toLowerCase()
        .split(' ')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' '),
  } as any);

  // --- Regex ---
  hb.registerHelper('regexReplace', function (input: any, pattern: any, replacement: any) {
    try {
      return String(input ?? '').replace(new RegExp(pattern, 'g'), replacement);
    } catch (e) {
      return input;
    }
  });
  hb.registerHelper('regexExtract', function (input: any, pattern: any, groupIndex: any) {
    try {
      if (typeof input !== 'string') return '';
      const match = input.match(new RegExp(pattern));
      if (!match) return '';
      const gi = typeof groupIndex === 'number' ? groupIndex : 0;
      return match[gi] || '';
    } catch (e) {
      return '';
    }
  });

  // --- Dates ---
  hb.registerHelper('now', (format: any) => formatDateImpl(new Date(), typeof format === 'string' ? format : 'DD/MM/YYYY'));
  hb.registerHelper('formatDate', (dateString: any, format: any) => {
    if (!dateString || typeof format !== 'string') return '';
    const date = new Date(dateString);
    if (isNaN(date as any)) return dateString;
    return formatDateImpl(date, format);
  });

  // --- Đọc số thành chữ (vi-VN) ---
  hb.registerHelper('docso', (val: any) => docSo(val));
  // Capitalized: "Một triệu..." (tiện cho dòng "Bằng chữ:")
  hb.registerHelper('docsoHoa', (val: any) => {
    const s = docSo(val);
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  });

  // --- QR code (bundled qrcode-generator → inline SVG) ---
  hb.registerHelper('qr', (text: any, opts: any) => {
    try {
      const size = Number(opts?.hash?.size) || 96;
      const level = opts?.hash?.level || 'M';
      const qr = qrcode(0, level);
      qr.addData(String(text ?? ''));
      qr.make();
      const cell = Math.max(1, Math.floor(size / (qr.getModuleCount() + 2)));
      const svg = qr.createSvgTag({ cellSize: cell, margin: 1, scalable: true });
      return new (hb as any).SafeString(
        `<span style="display:inline-block;width:${size}px;height:${size}px;line-height:0">${svg}</span>`,
      );
    } catch (e: any) {
      return `QR_ERROR: ${e?.message}`;
    }
  });

  // --- SQL (alasql, lazy-loaded — see alasqlLoader.ts) ---
  // Scalar: {{sql "SELECT SUM(amount) FROM ?" items}} — 1 row × 1 col trả giá trị.
  // Block:  {{#sql "SELECT ... FROM ? GROUP BY ..." items}} ...{{product}}... {{/sql}}
  // Ported verbatim from the user's proven helper (incl. @index/@first/@last frame).
  hb.registerHelper('sql', function (this: any, query: any, ...args: any[]) {
    const options: any = args.pop();
    const alasql = typeof window !== 'undefined' ? (window as any).alasql : null;
    if (!alasql) return 'SQL_ERROR: alasql chưa được tải — bấm render lại';
    try {
      const result = alasql(query, args);
      if (!result || result.length === 0) return options?.inverse ? options.inverse(this) : '';
      if (result.length === 1 && Object.keys(result[0]).length === 1) return Object.values(result[0])[0];
      if (options && typeof options.fn === 'function') {
        let out = '';
        const data = (hb as any).createFrame(options.data);
        result.forEach((row: any, i: number) => {
          data.index = i;
          data.first = i === 0;
          data.last = i === result.length - 1;
          out += options.fn(row, { data });
        });
        return out;
      }
      return result;
    } catch (e: any) {
      return `SQL_ERROR: ${e?.message}`;
    }
  });

  // --- Numbers ---
  hb.registerHelper('formatNumber', (val: any, opts: any) => {
    const num = Number(val);
    if (isNaN(num)) return val;
    const format: string = opts?.hash?.format || '';
    const locale: string = opts?.hash?.locale || 'vi-VN';
    const decimals = (format.match(/\.([0#]+)/) || [])[1]?.length || 0;
    const useGrouping = format.includes(',');
    const isPercent = format.includes('%');
    let n = num;
    let currency: string | null = null;
    if (isPercent) n *= 100;
    if (format.includes('₫')) currency = 'VND';
    else if (format.includes('$')) currency = 'USD';
    else if (format.includes('€')) currency = 'EUR';
    else if (format.includes('£')) currency = 'GBP';
    const intl: any = { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping };
    if (currency) {
      intl.style = 'currency';
      intl.currency = currency;
    }
    const formatted = new Intl.NumberFormat(locale, intl).format(n);
    return isPercent ? formatted + '%' : formatted;
  });
}
