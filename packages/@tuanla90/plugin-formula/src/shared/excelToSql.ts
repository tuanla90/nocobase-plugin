/**
 * Excel-style formula → SQL scalar expression transpiler.
 *
 * Scope: PER-ROW SCALAR expressions only — arithmetic, comparison, logical (&& || / AND OR / NOT),
 * string concat (&), IF(), and a SAFE, universally-available set of scalar functions. This is exactly
 * what a window `input` needs (a running column's input is a per-row scalar anyway).
 *
 * REJECTED with a clear message (they need joins/subqueries and don't belong in a running column):
 *   • aggregate / lookup functions: SUM(data.items.x), SUMIFS, FILTER, SELECT, VLOOKUP, INDEX/MATCH…
 *   • relation paths: data.a.b
 *   • cross-table lookups: some_table.col   (a dotted ref without the `data.` prefix)
 *
 * Output is built from an AST with quoted identifiers + escaped literals, so it is injection-safe by
 * construction (no user text is ever passed through verbatim). Dialect-aware (sqlite/postgres/mysql).
 *
 * Same Excel dialect as the rest of the plugin: `data.<field>` refs, `==` (or `=`) equality, `&&`/`||`
 * for AND/OR, `&` for string concat. Case-insensitive function/keyword names.
 */

export type SqlDialect = 'sqlite' | 'postgres' | 'mysql' | 'mariadb' | string;
export type TranspileResult = { sql: string } | { error: string };
export const isTranspileError = (r: TranspileResult): r is { error: string } => 'error' in r;

type Node =
  | { type: 'num'; value: string }
  | { type: 'str'; value: string }
  | { type: 'bool'; value: boolean }
  | { type: 'ref'; name: string }
  | { type: 'unary'; op: string; arg: Node }
  | { type: 'binary'; op: string; left: Node; right: Node }
  | { type: 'call'; name: string; args: Node[] };

type Tok = { t: string; v: string };

// ---------------- tokenizer ----------------
function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  const n = src.length;
  let i = 0;
  const isIdStart = (c: string) => /[A-Za-z_]/.test(c);
  const isId = (c: string) => /[A-Za-z0-9_]/.test(c);
  const isDigit = (c: string) => c >= '0' && c <= '9';
  while (i < n) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
    if (c === '"' || c === "'") {
      const quote = c; let j = i + 1; let s = '';
      while (j < n) {
        if (src[j] === quote) { if (src[j + 1] === quote) { s += quote; j += 2; continue; } break; }
        s += src[j]; j++;
      }
      if (j >= n) throw new Error('Chuỗi chưa đóng (thiếu dấu nháy).');
      toks.push({ t: 'str', v: s }); i = j + 1; continue;
    }
    if (isDigit(c) || (c === '.' && isDigit(src[i + 1]))) {
      let j = i; while (j < n && /[0-9.]/.test(src[j])) j++;
      toks.push({ t: 'num', v: src.slice(i, j) }); i = j; continue;
    }
    if (isIdStart(c)) {
      let j = i; while (j < n && (isId(src[j]) || src[j] === '.')) j++;
      toks.push({ t: 'ident', v: src.slice(i, j) }); i = j; continue;
    }
    const two = src.slice(i, i + 2);
    if (['&&', '||', '==', '<>', '!=', '<=', '>='].includes(two)) { toks.push({ t: 'op', v: two }); i += 2; continue; }
    if (c === '(' || c === ')' || c === ',') { toks.push({ t: c, v: c }); i++; continue; }
    if ('+-*/%^&<>='.includes(c)) { toks.push({ t: 'op', v: c }); i++; continue; }
    throw new Error(`Ký tự không hợp lệ '${c}'.`);
  }
  toks.push({ t: 'eof', v: '' });
  return toks;
}

// ---------------- parser (precedence-climbing) ----------------
const BINPREC: Record<string, number> = {
  '||': 1, OR: 1,
  '&&': 2, AND: 2,
  '=': 3, '==': 3, '<>': 3, '!=': 3, '<': 3, '<=': 3, '>': 3, '>=': 3,
  '&': 4,
  '+': 5, '-': 5,
  '*': 6, '/': 6, '%': 6,
  '^': 7,
};

class Parser {
  private toks: Tok[];
  private i = 0;
  constructor(toks: Tok[]) { this.toks = toks; }
  private peek() { return this.toks[this.i]; }
  private next() { return this.toks[this.i++]; }
  private atEnd() { return this.peek().t === 'eof'; }
  private curBinOp(): string | null {
    const tk = this.peek();
    if (tk.t === 'op') return tk.v;
    if (tk.t === 'ident') { const u = tk.v.toUpperCase(); if (u === 'AND' || u === 'OR') return u; }
    return null;
  }
  parse(): Node {
    const e = this.parseExpr(0);
    if (!this.atEnd()) throw new Error(`Thừa ký tự sau biểu thức: '${this.peek().v}'.`);
    return e;
  }
  private parseExpr(minPrec: number): Node {
    let left = this.parseUnary();
    for (;;) {
      const op = this.curBinOp();
      if (op == null) break;
      const prec = BINPREC[op];
      if (prec == null || prec < minPrec) break;
      this.next();
      const nextMin = op === '^' ? prec : prec + 1; // ^ right-assoc
      left = { type: 'binary', op, left, right: this.parseExpr(nextMin) };
    }
    return left;
  }
  private parseUnary(): Node {
    const tk = this.peek();
    if (tk.t === 'op' && (tk.v === '-' || tk.v === '+')) { this.next(); return { type: 'unary', op: tk.v, arg: this.parseUnary() }; }
    if (tk.t === 'ident' && tk.v.toUpperCase() === 'NOT') { this.next(); return { type: 'unary', op: 'NOT', arg: this.parseUnary() }; }
    return this.parsePrimary();
  }
  private parsePrimary(): Node {
    const tk = this.next();
    if (tk.t === 'num') return { type: 'num', value: tk.v };
    if (tk.t === 'str') return { type: 'str', value: tk.v };
    if (tk.t === '(') { const e = this.parseExpr(0); this.expect(')'); return e; }
    if (tk.t === 'ident') {
      const u = tk.v.toUpperCase();
      if (u === 'TRUE') return { type: 'bool', value: true };
      if (u === 'FALSE') return { type: 'bool', value: false };
      if (this.peek().t === '(') {
        this.next();
        const args: Node[] = [];
        if (this.peek().t !== ')') { args.push(this.parseExpr(0)); while (this.peek().t === ',') { this.next(); args.push(this.parseExpr(0)); } }
        this.expect(')');
        return { type: 'call', name: tk.v, args };
      }
      return { type: 'ref', name: tk.v };
    }
    throw new Error(`Không hiểu '${tk.v || tk.t}'.`);
  }
  private expect(t: string) { const tk = this.next(); if (tk.t !== t) throw new Error(`Thiếu '${t}'.`); }
}

// ---------------- emitter ----------------
// Aggregate / lookup functions can't be a per-row scalar → rejected with a helpful message.
const AGG_FNS = new Set([
  'SUM', 'SUMPRODUCT', 'AVERAGE', 'AVG', 'COUNT', 'COUNTA', 'MIN', 'MAX', 'PRODUCT',
  'SUMIF', 'SUMIFS', 'COUNTIF', 'COUNTIFS', 'AVERAGEIF', 'AVERAGEIFS', 'MAXIFS', 'MINIFS',
  'FILTER', 'SELECT', 'VLOOKUP', 'HLOOKUP', 'LOOKUP', 'INDEX', 'MATCH', 'XLOOKUP',
]);

function defaultQuote(dialect: SqlDialect) {
  const bt = dialect === 'mysql' || dialect === 'mariadb';
  return (id: string) => (bt ? '`' + String(id).replace(/`/g, '``') + '`' : '"' + String(id).replace(/"/g, '""') + '"');
}

class Emitter {
  private dialect: SqlDialect;
  private q: (s: string) => string;
  private columns?: Set<string>;
  private mysql: boolean;
  constructor(opts: { dialect?: SqlDialect; quoteId?: (s: string) => string; columns?: Set<string> }) {
    this.dialect = opts.dialect || 'sqlite';
    this.q = opts.quoteId || defaultQuote(this.dialect);
    this.columns = opts.columns;
    this.mysql = this.dialect === 'mysql' || this.dialect === 'mariadb';
  }
  emit(node: Node): string {
    switch (node.type) {
      case 'num': {
        if (!/^[0-9]+(\.[0-9]+)?$/.test(node.value)) throw new Error(`Số không hợp lệ '${node.value}'.`);
        return node.value;
      }
      case 'str': return "'" + String(node.value).replace(/'/g, "''") + "'";
      case 'bool': return this.dialect === 'postgres' ? (node.value ? 'TRUE' : 'FALSE') : (node.value ? '1' : '0');
      case 'ref': return this.emitRef(node.name);
      case 'unary': return this.emitUnary(node);
      case 'binary': return this.emitBinary(node);
      case 'call': return this.emitCall(node);
    }
  }
  private emitRef(name: string): string {
    const parts = name.split('.');
    let col: string;
    if (parts[0].toLowerCase() === 'data') {
      if (parts.length === 2) col = parts[1];
      else if (parts.length > 2) throw new Error(`Tham chiếu quan hệ '${name}' cần join — không dùng được ở cột lũy kế (hãy dùng Công thức tự tính / Computed).`);
      else throw new Error(`'data' phải kèm tên cột, ví dụ data.qty.`);
    } else {
      if (parts.length > 1) throw new Error(`Tra cứu bảng khác '${name}' cần join — không dùng được ở cột lũy kế.`);
      col = parts[0];
    }
    if (this.columns && !this.columns.has(col)) throw new Error(`Cột '${col}' không có trong bảng.`);
    return this.q(col);
  }
  private emitUnary(node: Extract<Node, { type: 'unary' }>): string {
    const a = this.emit(node.arg);
    if (node.op === '-') return `(-${a})`;
    if (node.op === '+') return `(${a})`;
    return `(NOT ${a})`; // NOT
  }
  private emitBinary(node: Extract<Node, { type: 'binary' }>): string {
    const L = this.emit(node.left);
    const R = this.emit(node.right);
    switch (node.op) {
      case '||': case 'OR': return `(${L} OR ${R})`;
      case '&&': case 'AND': return `(${L} AND ${R})`;
      case '=': case '==': return `(${L} = ${R})`;
      case '!=': case '<>': return `(${L} <> ${R})`;
      case '<': case '<=': case '>': case '>=': return `(${L} ${node.op} ${R})`;
      case '&': return this.mysql ? `CONCAT(${L}, ${R})` : `(${L} || ${R})`;
      case '+': case '-': case '*': case '/': case '%': return `(${L} ${node.op} ${R})`;
      case '^': throw new Error('Luỹ thừa (^) chưa hỗ trợ chuyển sang SQL — dùng chế độ SQL nâng cao.');
      default: throw new Error(`Toán tử '${node.op}' chưa hỗ trợ.`);
    }
  }
  private concat(parts: string[]): string {
    return this.mysql ? `CONCAT(${parts.join(', ')})` : `(${parts.join(' || ')})`;
  }
  private emitCall(node: Extract<Node, { type: 'call' }>): string {
    const name = node.name.toUpperCase();
    const a = node.args.map((x) => this.emit(x));
    const need = (k: number) => { if (a.length !== k) throw new Error(`${name} cần ${k} tham số.`); };
    if (name === 'IF') { need(3); return `CASE WHEN ${a[0]} THEN ${a[1]} ELSE ${a[2]} END`; }
    if (name === 'IFERROR' || name === 'IFNA') { need(2); return `COALESCE(${a[0]}, ${a[1]})`; }
    if (AGG_FNS.has(name)) throw new Error(`${name}(…) là hàm gộp/tra cứu — không chạy được trong cột lũy kế SQL (dùng Công thức tự tính / Computed, hoặc chuyển sang chế độ SQL nâng cao).`);
    switch (name) {
      case 'ABS': need(1); return `abs(${a[0]})`;
      case 'ROUND': return a.length > 1 ? `round(${a[0]}, ${a[1]})` : `round(${a[0]})`;
      case 'COALESCE': if (!a.length) throw new Error('COALESCE cần ít nhất 1 tham số.'); return `COALESCE(${a.join(', ')})`;
      case 'UPPER': need(1); return `upper(${a[0]})`;
      case 'LOWER': need(1); return `lower(${a[0]})`;
      case 'TRIM': need(1); return `trim(${a[0]})`;
      case 'LEN': case 'LENGTH': need(1); return `length(${a[0]})`;
      case 'LEFT': return `substr(${a[0]}, 1, ${a[1] ?? '1'})`;
      case 'RIGHT': { const nn = a[1] ?? '1'; return this.mysql ? `right(${a[0]}, ${nn})` : this.dialect === 'postgres' ? `right(${a[0]}, ${nn})` : `substr(${a[0]}, -1 * (${nn}))`; }
      case 'MID': need(3); return `substr(${a[0]}, ${a[1]}, ${a[2]})`;
      case 'CONCATENATE': if (!a.length) throw new Error('CONCATENATE cần tham số.'); return this.concat(a);
      case 'MOD': need(2); return `(${a[0]} % ${a[1]})`;
      default: throw new Error(`Hàm ${name}(…) chưa hỗ trợ chuyển sang SQL — dùng chế độ SQL nâng cao.`);
    }
  }
}

/** Transpile an Excel-style scalar formula into a SQL expression. Returns {sql} or {error}. */
export function excelToSql(
  formula: string,
  opts: { dialect?: SqlDialect; quoteId?: (s: string) => string; columns?: Set<string> } = {},
): TranspileResult {
  const src = String(formula || '').trim();
  if (!src) return { error: 'Công thức trống.' };
  try {
    const ast = new Parser(tokenize(src)).parse();
    return { sql: new Emitter(opts).emit(ast) };
  } catch (e: any) {
    return { error: e?.message || String(e) };
  }
}
