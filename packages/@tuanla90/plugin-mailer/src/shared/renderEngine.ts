// Handlebars email renderer — the SAME proven engine @tuanla90/plugin-print-template uses (helpers.ts),
// ported verbatim so templates behave identically on both sides. Isomorphic: the client-v2 live preview
// and the server `mailer:send` both render through this. No react/antd/nodemailer here.
//
//   render subject + htmlBody against a record's data → { subject, html } with:
//   - variable interpolation:  {{field}}  {{relation.field}}  {{#each items}}…{{/each}}
//   - formatting helpers:      formatDate, formatNumber (currency/percent), docso (đọc số), qr, etc.
import Handlebars from 'handlebars';
import qrcode from 'qrcode-generator';
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
  hb.registerHelper('docsoHoa', (val: any) => {
    const s = docSo(val);
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  });

  // --- QR code (bundled qrcode-generator → inline SVG). Note: many email clients strip inline SVG,
  //     so prefer a hosted image for QR in emails; kept for parity with the print engine. ---
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

// A literal {{#each}} between table rows gets destroyed by DOM/browser parsers — so (like the print
// engine) a repeat row may be marked <tr data-pt-each="relation"> and is expanded to {{#each}} before compile.
export function expandEachAttrs(src: string): string {
  return String(src || '').replace(
    /<tr([^>]*?)\s+data-pt-each="([^"]+)"([^>]*)>([\s\S]*?)<\/tr>/gi,
    '{{#each $2}}<tr$1$3>$4</tr>{{/each}}',
  );
}

/** Rendered email parts. */
export interface RenderedMail {
  subject: string;
  html: string;
}

/**
 * Render a template's subject + htmlBody against a record's data. Never throws — a bad template yields
 * the raw source with an inline error marker so the caller can still see/fix it (used by both the live
 * preview and the server send path). `data` may be `{}` (unknown {{vars}} render blank).
 */
export function renderEmail(subject: string, html: string, data: any): RenderedMail {
  const hb = createRenderer();
  const run = (src?: string): string => {
    if (!src) return '';
    try {
      return hb.compile(expandEachAttrs(src))(data || {});
    } catch (e: any) {
      return `${src}\n<!-- render error: ${e?.message || e} -->`;
    }
  };
  return { subject: run(subject).replace(/\s+/g, ' ').trim(), html: run(html) };
}

/** Best-effort HTML → plaintext for the multipart text/plain fallback (and GmailApp's body arg). */
export function htmlToText(html: string): string {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .trim();
}

/** Collect the `{{tokens}}` referenced by a template (for the variable picker "used" hints). */
export function extractTokens(...sources: string[]): string[] {
  const set = new Set<string>();
  const re = /\{\{\{?\s*#?\s*([a-zA-Z0-9_.]+)/g;
  for (const src of sources) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(String(src || '')))) {
      const tok = m[1];
      if (tok && !/^(each|if|unless|with|else|this)$/.test(tok)) set.add(tok);
    }
  }
  return [...set];
}
