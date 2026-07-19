/**
 * @ptdl/plugin-formula — shared formula engine.
 *
 * Wraps @formulajs/formulajs (~400 Excel functions, bundled) so a user can write a single
 * Excel-style formula string that computes over the current record and can emit HTML.
 *
 * Two public entry points:
 *  - evaluateFormula(formula, data, value) — run in the plugin realm (for the display field).
 *  - compileToRunJS(formula)               — turn a formula into JS source that runs inside the
 *                                            RunJS sandbox (for the "Set default value" mode).
 *
 * Key ergonomics on top of raw formulajs:
 *  - `data` / `record` is wrapped in an auto-pluck Proxy so `data.order_ids.amount` → [a1,a2,…]
 *    (aggregates a to-many relation), nestable: `data.lines.item.price`.
 *  - Excel string-concat `&` is rewritten to `+` (raw JS `&` is bitwise) — skipping `&&`, `&=`
 *    and `&` inside string literals.
 *  - Case-insensitive: SUM === sum. Reserved JS words are filtered from the injected names.
 *  - A few HTML helpers formulajs lacks: B/I/U/BR/COLOR/BG/TAG/DOT/LINK/IMG/ESCAPE.
 */

// NOTE: import the vendored self-contained browser build via a RELATIVE path.
// `@formulajs/formulajs` is on NocoBase's hardcoded external allowlist (dependency of
// @nocobase/evaluators) but is NOT provided to client plugin code at runtime, so a bare
// import would be externalized and fail. A relative import gets bundled instead.
// The file is a UMD → rspack treats it as CommonJS; interop below covers namespace/default.
import * as formulajsVendor from './vendor/formulajs.browser.js';

// escapeHtml is INLINED (not imported from '@ptdl/shared') so this engine has ZERO package imports —
// only the relative vendored formulajs. The SERVER lane imports this engine (computed.ts), and the
// NocoBase server-build bundles only a package's `main` entry into dist/node_modules, so a subpath
// import like '@ptdl/shared/format' would be MISSING at runtime. Byte-equivalent to @ptdl/shared's.
function escapeHtml(s: any): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
const _fjs = formulajsVendor as any;
const formulajs: Record<string, any> =
  _fjs && typeof _fjs.SUM === 'function' ? _fjs : _fjs?.default || _fjs;

// ---------------- helpers ----------------
const _s = (v: any) => (v === null || v === undefined ? '' : String(v));
const _esc = escapeHtml;

// A well-known symbol the auto-pluck array Proxy answers with its UNDERLYING array (see `wrap`). Lets the
// indexed FILTER reach the stable, cached row array behind a per-call Proxy so a hash index built on it
// survives across evaluateFormula() calls (the loadTable cache reuses one array until the table changes).
const RAW: unique symbol = Symbol('ptdl.raw');

const TAG_COLORS: Record<string, string> = {
  red: '#cf1322', volcano: '#d4380d', orange: '#d46b08', gold: '#d48806', yellow: '#d4b106',
  lime: '#7cb305', green: '#389e0d', cyan: '#08979c', blue: '#096dd9', geekblue: '#1d39c4',
  purple: '#531dab', magenta: '#c41d7f', gray: '#595959', default: '#595959',
};

export const HTML_FNS: Record<string, (...a: any[]) => string> = {
  B: (x) => '<b>' + _s(x) + '</b>',
  I: (x) => '<i>' + _s(x) + '</i>',
  U: (x) => '<u>' + _s(x) + '</u>',
  BR: () => '<br/>',
  ESCAPE: (x) => _esc(x),
  COLOR: (x, c) => '<span style="color:' + _s(c) + '">' + _s(x) + '</span>',
  BG: (x, c) => '<span style="background:' + _s(c) + ';padding:1px 6px;border-radius:4px">' + _s(x) + '</span>',
  LINK: (href, text) => '<a href="' + _esc(href) + '" target="_blank" rel="noopener">' + _s(text ?? href) + '</a>',
  IMG: (src, size = 20) =>
    '<img src="' + _esc(src) + '" style="width:' + size + 'px;height:' + size +
    'px;border-radius:4px;object-fit:cover;vertical-align:middle"/>',
  DOT: (color = '#16a34a', size = 8) =>
    '<span style="display:inline-block;width:' + size + 'px;height:' + size +
    'px;border-radius:50%;background:' + _s(color) + ';vertical-align:middle"></span>',
  TAG: (text, color = 'default') => {
    const c = TAG_COLORS[color] || color;
    return (
      '<span style="display:inline-flex;align-items:center;color:' + c + ';border:1px solid ' + c +
      '55;background:' + c + '14;border-radius:10px;padding:0 8px;font-size:12px;line-height:1.7;font-weight:600">' +
      _s(text) + '</span>'
    );
  },
};

// ---------------- FILTER / SELECT (AppSheet-style conditional list, formulajs lacks FILTER) ----------------
// Excel-style criteria match: exact value, or a string operator like ">40", "<=x", "<>y".
function _crit(cell: any, criteria: any): boolean {
  if (criteria === null || criteria === undefined) return cell === null || cell === undefined;
  // Boolean-aware: DBs store booleans as 1/0 (sqlite) or true/false; criteria may be a real boolean or
  // "true"/"false". Coerce both sides so SUMIFS/FILTER(…, active, true) matches a stored 1. (Excel has no
  // booleans, so this is a superset — plain numeric/string criteria fall through unchanged.)
  if (typeof criteria === 'boolean' || (typeof criteria === 'string' && /^(true|false)$/i.test(criteria))) {
    const want = criteria === true || /^true$/i.test(String(criteria));
    const has = cell === true || cell === 1 || cell === '1' || /^true$/i.test(String(cell ?? ''));
    return has === want;
  }
  const s = String(criteria);
  const m = s.match(/^(<=|>=|<>|=|<|>)([\s\S]*)$/);
  if (m) {
    const op = m[1];
    const rhs = m[2];
    const rn = Number(rhs);
    if (rhs.trim() !== '' && !Number.isNaN(rn)) {
      const cn = typeof cell === 'number' ? cell : Number(cell);
      if (!Number.isNaN(cn)) {
        switch (op) {
          case '>': return cn > rn; case '<': return cn < rn; case '>=': return cn >= rn;
          case '<=': return cn <= rn; case '=': return cn === rn; case '<>': return cn !== rn;
        }
      }
    }
    const cs = String(cell ?? '');
    if (op === '=') return cs === rhs;
    if (op === '<>') return cs !== rhs;
    return false;
  }
  return String(cell ?? '') === s;
}
/**
 * FILTER(returnRange, critRange1, crit1, [critRange2, crit2, …]) → the values of `returnRange` whose row
 * matches ALL (critRange, crit) pairs. Like AppSheet SELECT(Table[col], AND(cond1, cond2)). Wrap the
 * result with SUM / AVERAGE / MIN / MAX / COUNT / INDEX(…,1)=first, etc. `crit` = exact value OR an
 * operator string (">40", "<="&data.x, "<>y").
 */
function FILTER(returnRange: any, ...crit: any[]): any[] {
  const ret = Array.isArray(returnRange) ? returnRange : returnRange == null ? [] : [returnRange];
  const pairs: Array<[any, any]> = [];
  for (let i = 0; i + 1 < crit.length; i += 2) pairs.push([crit[i], crit[i + 1]]);
  const out: any[] = [];
  for (let idx = 0; idx < ret.length; idx++) {
    let ok = true;
    for (const [range, c] of pairs) {
      const cell = Array.isArray(range) ? range[idx] : range;
      if (!_crit(cell, c)) { ok = false; break; }
    }
    if (ok) out.push(ret[idx]);
  }
  return out;
}
// Per-row engine for the LAZY FILTER form `FILTER(t.col, t.a == data.x && t.b > data.y)` — the
// compiler rewrites that into `__FILTER_ROWS(t, row => cond, row => ret)` (see transformFilters).
function __FILTER_ROWS(tableArr: any, condFn: (r: any) => any, retFn: (r: any) => any): any[] {
  const rows = Array.isArray(tableArr) ? tableArr : tableArr == null ? [] : [tableArr];
  const out: any[] = [];
  for (const r of rows) {
    let keep = false;
    try { keep = !!condFn(r); } catch { keep = false; }
    if (keep) { try { out.push(retFn(r)); } catch { /* skip */ } }
  }
  return out;
}
// ---------------- INDEXED lazy FILTER (equality fast-path) ----------------
// __FILTER_ROWS_IDX(t, col, condFn, retFn, keyFn) returns the SAME result as
// __FILTER_ROWS(t, condFn, retFn) but when the condition has a top-level `t.col == <key>` conjunct, it uses a
// hash index on `col` (built once per underlying array, cached in a WeakMap) to fetch only the rows whose
// `col` equals `key`, then still runs the full condFn on them (so ranges / extra conjuncts stay correct).
// This turns a config-table fan-out (M facts each scanning N lookup rows) from O(M·N) into O(M + N).
const _INDEX_CACHE: WeakMap<any[], Map<string, Map<string, any[]>>> = new WeakMap();
const _INDEX_MIN_ROWS = 48; // below this, a linear scan is cheaper than building an index

// Canonical bucket key so every JS `==` match for a real lookup key (finite number / non-empty string) lands
// in ONE bucket — no false negatives. Booleans → 1/0 and numeric strings collapse to their number, matching
// `5 == "5" == "5.0" == (1==true)`. `want` of any OTHER type triggers a full scan (see __FILTER_ROWS_IDX), so
// the non-transitive `==` corners (0 == "" == false, yet "" != "0") can never drop a row.
function _keyOf(v: any): string {
  if (v === null || v === undefined) return ' N';
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : ' ' + String(v);
  const s = String(v);
  const t = s.trim();
  if (t !== '' && /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(t)) {
    const n = Number(t);
    if (Number.isFinite(n)) return String(n);
  }
  // Empty/whitespace strings coerce to 0 under JS `==` (`"" == 0`, `"  " == 0`, `"" == false`) → put them in
  // the SAME bucket as 0/false so a `want === 0` lookup can't miss them. Worst case is a harmless false
  // positive that condFn re-filters — never a dropped row.
  if (t === '') return '0';
  return s;
}
function _rawArr(a: any): any[] {
  try { const r = a && a[RAW]; if (Array.isArray(r)) return r; } catch { /* not our proxy */ }
  return Array.isArray(a) ? a : a == null ? [] : [a];
}
function _bucketOf(rows: any[], col: string, want: any): any[] {
  let byCol = _INDEX_CACHE.get(rows);
  if (!byCol) { byCol = new Map(); _INDEX_CACHE.set(rows, byCol); }
  let idx = byCol.get(col);
  if (!idx) {
    idx = new Map();
    for (const r of rows) {
      const k = _keyOf(r == null ? undefined : (r as any)[col]);
      let b = idx.get(k);
      if (!b) { b = []; idx.set(k, b); }
      b.push(r);
    }
    byCol.set(col, idx);
  }
  return idx.get(_keyOf(want)) || [];
}
function __FILTER_ROWS_IDX(
  tableArr: any, col: string, condFn: (r: any) => any, retFn: (r: any) => any, keyFn: () => any,
): any[] {
  const rows = _rawArr(tableArr);
  let candidates: any[] = rows;
  if (rows.length >= _INDEX_MIN_ROWS && col) {
    let want: any;
    try { want = keyFn(); } catch { want = undefined; }
    // Only index the two real lookup-key types; anything else falls back to the full scan below.
    if ((typeof want === 'number' && Number.isFinite(want)) || (typeof want === 'string' && want !== '')) {
      try { candidates = _bucketOf(rows, col, want); } catch { candidates = rows; }
    }
  }
  const out: any[] = [];
  for (const r of candidates) {
    let keep = false;
    try { keep = !!condFn(r); } catch { keep = false; }
    if (keep) { try { out.push(retFn(r)); } catch { /* skip */ } }
  }
  return out;
}
// Conditional aggregates routed through our FILTER (→ boolean-aware `_crit` + auto-pluck arrays), so
// SUMIFS(data.items.amount, data.items.active, true) works over a to-many relation. These OVERRIDE
// formula.js's native versions (CUSTOM_FNS wins on name clash) — string-operator criteria (">40") and
// exact value/number criteria still behave as before, this just also handles booleans + plucked arrays.
const _sum = (a: any[]) => a.reduce((s, v) => s + (Number(v) || 0), 0);
function SUMIFS(sumRange: any, ...crit: any[]): number { return _sum(FILTER(sumRange, ...crit)); }
function SUMIF(range: any, criteria: any, sumRange?: any): number { return _sum(FILTER(sumRange !== undefined ? sumRange : range, range, criteria)); }
function COUNTIFS(...crit: any[]): number { return crit.length ? FILTER(crit[0], ...crit).length : 0; }
function COUNTIF(range: any, criteria: any): number { return FILTER(range, range, criteria).length; }
function AVERAGEIFS(sumRange: any, ...crit: any[]): number { const k = FILTER(sumRange, ...crit); return k.length ? _sum(k) / k.length : 0; }
function AVERAGEIF(range: any, criteria: any, sumRange?: any): number { const k = FILTER(sumRange !== undefined ? sumRange : range, range, criteria); return k.length ? _sum(k) / k.length : 0; }

// ---------------- AppSheet-parity helpers (formulajs lacks these; keeps converted AppSheet formulas 1:1) ----
function SPLIT(text: any, sep: any = ','): any[] { const s = _s(text); return s === '' ? [] : s.split(_s(sep)); }
function STARTSWITH(text: any, s: any): boolean { return _s(text).startsWith(_s(s)); }
function ENDSWITH(text: any, s: any): boolean { return _s(text).endsWith(_s(s)); }
function CONTAINS(text: any, s: any): boolean { return _s(text).indexOf(_s(s)) >= 0; }
function ISNOTBLANK(x: any): boolean { return !(x === null || x === undefined || x === ''); }
// AppSheet LIST(a, b, …) → a flat list value (nested lists flattened).
function LIST(...args: any[]): any[] { const out: any[] = []; for (const a of args) { if (Array.isArray(a)) out.push(...a); else out.push(a); } return out; }
// AppSheet IN(x, list) → membership (loose, string-tolerant like AppSheet). NOTE: register UPPER-CASE ONLY —
// a lower-case `in` param name would be a reserved word and throw under strict/SES.
function IN(x: any, list: any): boolean {
  const arr = Array.isArray(list) ? list : list == null ? [] : [list];
  return arr.some((v) => v === x || _s(v) === _s(x));
}
// AppSheet ANY(list) → the first element (≈ INDEX(list, 1)).
function ANY(list: any): any { const arr = Array.isArray(list) ? list : list == null ? [] : [list]; return arr.length ? arr[0] : ''; }

export const CUSTOM_FNS: Record<string, (...a: any[]) => any> = {
  FILTER, filter: FILTER, SELECT: FILTER, select: FILTER, __FILTER_ROWS, __FILTER_ROWS_IDX,
  SUMIFS, sumifs: SUMIFS, SUMIF, sumif: SUMIF,
  COUNTIFS, countifs: COUNTIFS, COUNTIF, countif: COUNTIF,
  AVERAGEIFS, averageifs: AVERAGEIFS, AVERAGEIF, averageif: AVERAGEIF,
  // AppSheet-parity (see APPSHEET-TO-FORMULA.md). `IN` upper-case only (lower `in` = reserved word).
  SPLIT, split: SPLIT, STARTSWITH, startswith: STARTSWITH, ENDSWITH, endswith: ENDSWITH,
  CONTAINS, contains: CONTAINS, ISNOTBLANK, isnotblank: ISNOTBLANK,
  LIST, list: LIST, ANY, any: ANY, IN,
};

const RESERVED = new Set(
  ('do if in for let new try var case else enum eval null this true void with await break catch class const false ' +
    'super throw while yield delete export import public return static switch typeof default extends finally package ' +
    'private continue debugger function arguments interface protected implements instanceof')
    .split(' '),
);

// ---------------- auto-pluck proxy ----------------
const ARR_PASS = new Set(['length', 'constructor']);
export function wrap(v: any): any {
  if (Array.isArray(v)) {
    return new Proxy(v, {
      get(t, k) {
        if (k === RAW) return t; // unwrap to the underlying array (for the indexed FILTER cache)
        if (
          typeof k === 'symbol' ||
          ARR_PASS.has(k as string) ||
          (typeof k === 'string' && /^\d+$/.test(k)) ||
          k in Array.prototype
        ) {
          const val = (t as any)[k];
          return typeof val === 'function' ? val.bind(t) : val;
        }
        return wrap((t as any[]).map((el) => (el == null ? undefined : el[k as any])));
      },
    });
  }
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    return new Proxy(v, { get: (t, k) => (typeof k === 'symbol' ? (t as any)[k] : wrap((t as any)[k])) });
  }
  return v;
}

// ---------------- Excel `&` → `+` (skip &&, &=, and string literals) ----------------
export function ampToPlus(src: string): string {
  let out = '';
  let q: string | null = null;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    const p = src[i - 1];
    if (q) {
      out += c;
      if (c === q && p !== '\\') q = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      q = c;
      out += c;
      continue;
    }
    if (c === '&') {
      if (src[i + 1] === '&') { out += '&&'; i++; continue; }
      if (src[i + 1] === '=') { out += '&='; i++; continue; }
      out += '+';
      continue;
    }
    out += c;
  }
  return out;
}

// ---------------- lazy FILTER/SELECT: rewrite `FILTER(t.col, <cond>)` (exactly 2 args) into a
// per-row call `__FILTER_ROWS(t, __r=>cond, __r=>ret)` so `t.a == data.x && t.b > data.y` is evaluated
// PER ROW. 3+ args = the SUMIFS-style pairs form (left as-is). Use `&&` / AND() for logical-and in the
// condition (single `&` is Excel string-concat). String-aware; a no-op on formulas without FILTER. ----
function _matchParen(s: string, open: number): number {
  let depth = 0; let q: string | null = null;
  for (let i = open; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === q && s[i - 1] !== '\\') q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '(') depth++;
    else if (c === ')') { depth--; if (depth === 0) return i; }
  }
  return -1;
}
function _splitArgs(s: string): string[] {
  const args: string[] = []; let depth = 0; let q: string | null = null; let cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { cur += c; if (c === q && s[i - 1] !== '\\') q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; cur += c; continue; }
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    if (c === ',' && depth === 0) { args.push(cur); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim() !== '') args.push(cur);
  return args;
}
function _tableExprOf(expr: string): string | null {
  const s = expr.trim();
  let m = /^data\.([A-Za-z_$][\w$]*)\.[A-Za-z_$][\w$]*/.exec(s); // data.<relation>.<field> → table = data.<relation>
  if (m) return 'data.' + m[1];
  m = /^([A-Za-z_$][\w$]*)\.[A-Za-z_$][\w$]*/.exec(s); // <collection>.<field> → table = <collection>
  if (m && !['data', 'value', 'record'].includes(m[1])) return m[1];
  return null;
}
function _rebind(expr: string, tbl: string): string {
  const pre = tbl + '.';
  let out = ''; let q: string | null = null; let i = 0;
  while (i < expr.length) {
    const c = expr[i];
    if (q) { out += c; if (c === q && expr[i - 1] !== '\\') q = null; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; out += c; i++; continue; }
    const prev = i > 0 ? expr[i - 1] : '';
    if (!/[.\w$]/.test(prev) && expr.startsWith(pre, i)) { out += '__r.'; i += pre.length; continue; }
    out += c; i++;
  }
  return out;
}
// Split a condition on TOP-LEVEL `&&` (string/paren aware) → conjuncts. `AND(...)` form is not split (falls
// back to a plain scan). Used to find an indexable equality among the AND-ed conditions of a lazy FILTER.
function _splitAmp(s: string): string[] {
  const parts: string[] = []; let depth = 0; let q: string | null = null; let cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { cur += c; if (c === q && s[i - 1] !== '\\') q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; cur += c; continue; }
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    if (depth === 0 && c === '&' && s[i + 1] === '&') { parts.push(cur); cur = ''; i++; continue; }
    cur += c;
  }
  if (cur.trim() !== '') parts.push(cur);
  return parts;
}
// Position of the first TOP-LEVEL `==`/`===` (not `!= <= >= ===`-tail, not inside strings/parens).
function _topEq(s: string): { start: number; end: number } | null {
  let depth = 0; let q: string | null = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === q && s[i - 1] !== '\\') q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '(' || c === '[' || c === '{') { depth++; continue; }
    if (c === ')' || c === ']' || c === '}') { depth--; continue; }
    if (depth !== 0) continue;
    if (c === '=' && s[i + 1] === '=') {
      const prev = s[i - 1];
      if (prev === '!' || prev === '<' || prev === '>' || prev === '=') continue; // part of !== <== >== ===head
      let end = i + 2;
      if (s[end] === '=') end++; // ===
      return { start: i, end };
    }
  }
  return null;
}
function _refsTbl(expr: string, escTbl: string): boolean {
  return new RegExp('(^|[^.\\w$])' + escTbl + '\\.').test(expr);
}
// If a lazy-FILTER condition (raw, pre-rebind) AND-contains `tbl.col == <key>` (or `<key> == tbl.col`) where
// <key> does NOT reference the table, return {col, valExpr} so the caller can index on `col`. Else null.
function _indexableEq(condRaw: string, tbl: string): { col: string; valExpr: string } | null {
  const escTbl = tbl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const colOnly = new RegExp('^' + escTbl + '\\.([A-Za-z_$][\\w$]*)$');
  for (const raw of _splitAmp(condRaw)) {
    const part = raw.trim();
    const eq = _topEq(part);
    if (!eq) continue;
    const lhs = part.slice(0, eq.start).trim();
    const rhs = part.slice(eq.end).trim();
    let m = colOnly.exec(lhs);
    if (m && !_refsTbl(rhs, escTbl)) return { col: m[1], valExpr: rhs };
    m = colOnly.exec(rhs);
    if (m && !_refsTbl(lhs, escTbl)) return { col: m[1], valExpr: lhs };
  }
  return null;
}
export function transformFilters(src: string): string {
  let out = ''; let i = 0; let q: string | null = null;
  while (i < src.length) {
    const c = src[i];
    if (q) { out += c; if (c === q && src[i - 1] !== '\\') q = null; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; out += c; i++; continue; }
    const m = /^(FILTER|SELECT|filter|select)(\s*)\(/.exec(src.slice(i));
    const prev = out.length ? out[out.length - 1] : '';
    if (m && !/[.\w$]/.test(prev)) {
      const openIdx = i + m[0].length - 1;
      const close = _matchParen(src, openIdx);
      if (close > openIdx) {
        const inner = src.slice(openIdx + 1, close);
        const args = _splitArgs(inner);
        if (args.length === 2) {
          const tbl = _tableExprOf(args[0]);
          if (tbl) {
            const ret2 = _rebind(transformFilters(args[0]), tbl);
            const cond2 = _rebind(transformFilters(args[1]), tbl);
            // arrow fns (expression body, NO `return` keyword) so we don't trip wrapExpression's return-detection.
            const eq = _indexableEq(args[1], tbl);
            if (eq) {
              // keyFn runs in the OUTER scope (references data.*, not the row) → NOT rebound to __r.
              const keyE = transformFilters(eq.valExpr);
              out += `__FILTER_ROWS_IDX(${tbl}, ${JSON.stringify(eq.col)}, (__r) => (${cond2}), (__r) => (${ret2}), () => (${keyE}))`;
            } else {
              out += `__FILTER_ROWS(${tbl}, (__r) => (${cond2}), (__r) => (${ret2}))`;
            }
            i = close + 1; continue;
          }
        }
        // 3+ args (pairs form) or untransformable → keep call, but recurse into its args for nested FILTER
        out += src.slice(i, openIdx + 1) + transformFilters(inner) + ')';
        i = close + 1; continue;
      }
    }
    out += c; i++;
  }
  return out;
}

// ---------------- scope (function library) ----------------
let cachedNames: string[] | null = null;
let cachedVals: any[] | null = null;

function buildScope() {
  if (cachedNames && cachedVals) return { names: cachedNames, vals: cachedVals };
  const map: Record<string, any> = {};
  for (const k of Object.keys(formulajs)) {
    const fn = (formulajs as any)[k];
    if (typeof fn !== 'function') continue;
    if (!RESERVED.has(k)) map[k] = fn;
    const lk = k.toLowerCase();
    if (!(lk in map) && !RESERVED.has(lk)) map[lk] = fn;
  }
  Object.assign(map, HTML_FNS, CUSTOM_FNS); // HTML helpers + FILTER/SELECT win on name clashes
  // The compiled fn is `new Function('data','value','record', ...names, body)`. A formulajs export
  // whose lower-cased name equals one of those params — Excel VALUE() → 'value' — creates a DUPLICATE
  // parameter name, which throws "Duplicate parameter name not allowed" under STRICT mode / SES
  // lockdown (the NocoBase server runs under SES; browser + plain Node are sloppy so it slips through).
  // Drop the three lower-case collisions; the UPPER-CASE aliases (VALUE) still resolve, and bare
  // data/value/record keep their injected meaning.
  for (const p of ['data', 'value', 'record']) delete map[p];
  cachedNames = Object.keys(map);
  cachedVals = cachedNames.map((n) => map[n]);
  return { names: cachedNames, vals: cachedVals };
}

/** Sorted list of available function names (for the help panel). */
export function listFunctionNames(): string[] {
  return Object.keys(formulajs)
    .filter((k) => typeof (formulajs as any)[k] === 'function')
    .concat(Object.keys(HTML_FNS))
    .concat(['FILTER', 'SELECT', 'SPLIT', 'STARTSWITH', 'ENDSWITH', 'CONTAINS', 'ISNOTBLANK', 'LIST', 'IN', 'ANY'])
    .sort();
}

function wrapExpression(formula: string): string {
  // transformFilters BEFORE ampToPlus: the lazy FILTER rewrite emits `&&` (which ampToPlus must keep,
  // not turn into `+`); a single `&` inside a FILTER condition stays Excel string-concat.
  const src = ampToPlus(transformFilters(formula));
  return /(^|[^.\w])return[\s(]/.test(src) ? src : 'return ( ' + src + ' );';
}

export type FormulaResult = { value: any } | { error: Error };

const RESERVED_INJECT = new Set(['data', 'value', 'record']);

/**
 * Evaluate a formula against a record.
 * `tables` (optional) exposes whole lookup/config collections as TOP-LEVEL vars so a formula can write
 * a lookup table WITHOUT the `data.` prefix — `table_policy.discount_rate` (vs `data.subtotal` for the
 * current row). Each table is wrapped so `table_name.column` auto-plucks to an array (for SUMIFS/VLOOKUP).
 */
export function evaluateFormula(formula: string, data: any, value?: any, tables?: Record<string, any[]>): FormulaResult {
  try {
    const { names, vals } = buildScope();
    // Lookup tables → extra named params, taking precedence over function names on a clash (a duplicate
    // `new Function` param name throws under SES strict mode — see the VALUE() note in buildScope()).
    const extraNames: string[] = [];
    const extraVals: any[] = [];
    if (tables) {
      for (const k of Object.keys(tables)) {
        if (!/^[A-Za-z_$][\w$]*$/.test(k) || RESERVED_INJECT.has(k)) continue;
        extraNames.push(k);
        extraVals.push(wrap(tables[k] ?? []));
      }
    }
    const skip = new Set(extraNames);
    const fNames = [...extraNames];
    const fVals = [...extraVals];
    for (let i = 0; i < names.length; i++) if (!skip.has(names[i])) { fNames.push(names[i]); fVals.push(vals[i]); }
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
    const fn = new Function('data', 'value', 'record', ...fNames, wrapExpression(formula));
    let out = fn(wrap(data ?? {}), value, wrap(data ?? {}), ...fVals);
    if (out && (out as any).error) out = String(out); // formulajs error object → text, e.g. #DIV/0!
    return { value: out };
  } catch (error) {
    return { error: error as Error };
  }
}

/** Coerce a formula result to a string for rendering. */
export function resultToString(out: any): string {
  return _s(out);
}
