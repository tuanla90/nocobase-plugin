// Thin wrapper over the vendored formula engine (evaluateFormula) that sets up the line-generator's
// evaluation scope: top-level vars {parent, src, rule, user, runVersion, ...derived} plus a few helpers
// the commission/BOM formulas need but formulajs lacks.
//
// evaluateFormula(formula, data, value, tables): `tables` become TOP-LEVEL names (wrapped in the
// auto-pluck proxy). We pass every scope var and helper through `tables` so a formula can write
// `parent.package_revenue`, `rule.rate`, `REL(parent, personPath & '.id')` directly.

import { evaluateFormula } from './formulaEngine';

/** Number-or-zero: turns null/undefined/'' /NaN into 0 so `NUM(parent[field]) * rate` never yields NaN. */
function NUM(x: any): number {
  if (x === null || x === undefined || x === '') return 0;
  const n = typeof x === 'number' ? x : Number(x);
  return Number.isFinite(n) ? n : 0;
}

/** 'YYYY-MM' from a Date | ISO string | anything Date can parse. Empty string if unparseable. */
function YMONTH(d: any): string {
  if (d === null || d === undefined || d === '') return '';
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * Null-safe relation walk. `path` is a dot string (built at runtime from rule columns), e.g.
 * 'responsible_staff.direct_manager.id'. Any missing hop => null (so a `required` output drops the row
 * instead of throwing). `obj` may be the wrapped proxy; property access forwards through it fine.
 */
function REL(obj: any, path: any): any {
  if (obj === null || obj === undefined) return null;
  const segs = String(path === null || path === undefined ? '' : path).split('.').map((s) => s.trim()).filter(Boolean);
  let cur: any = obj;
  for (const s of segs) {
    if (cur === null || cur === undefined) return null;
    cur = cur[s];
  }
  return cur === null || cur === undefined ? null : cur;
}

/**
 * Rewrite property chains to OPTIONAL access (`a.b.c` → `a?.b?.c`) so a null hop yields null instead
 * of throwing — formulas can use direct dot paths (`parent.responsible_staff.direct_manager.id`)
 * without REL(). String-aware (never touches quoted paths); skips numeric literals (1.5) and spreads.
 */
export function nullSafeDots(src: string): string {
  let out = '';
  let q: string | null = null;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) { out += c; if (c === q && src[i - 1] !== '\\') q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; out += c; continue; }
    if (c === '.') {
      const prev = src[i - 1] || '';
      const next = src[i + 1] || '';
      if (next === '.' || prev === '.' || prev === '?') { out += c; continue; } // spread / already-optional
      if (/[A-Za-z_$)\]]/.test(prev) && /[A-Za-z_$]/.test(next)) {
        // scan back over the identifier; a token starting with a digit is a numeric literal → leave as-is
        let j = i - 1;
        while (j >= 0 && /[\w$]/.test(src[j])) j--;
        const tok = src.slice(j + 1, i);
        if (!/^\d/.test(tok)) { out += '?.'; continue; }
      }
      out += c;
      continue;
    }
    out += c;
  }
  return out;
}

const RESERVED = new Set(['data', 'value', 'record']);

export interface EvalScope {
  parent?: any;
  src?: any;
  rule?: any;
  user?: any;
  runVersion?: number;
  [k: string]: any;
}

export interface EvalResult {
  value?: any;
  error?: string;
}

/** Evaluate one expression against a scope. Never throws — returns { error } on failure. */
export function evalExpr(formula: string, scope: EvalScope): EvalResult {
  if (formula === null || formula === undefined || String(formula).trim() === '') return { value: undefined };
  // Helpers always available; scope vars override nothing here (helpers have distinct names).
  const tables: Record<string, any> = { REL, NUM, YMONTH, NOW: () => new Date() };
  for (const k of Object.keys(scope || {})) {
    if (!/^[A-Za-z_$][\w$]*$/.test(k) || RESERVED.has(k)) continue;
    tables[k] = scope[k];
  }
  // Friendly literal: a SINGLE bare word that is NOT a scope var / helper / JS keyword is almost always
  // an intended string the user forgot to quote (e.g. status = COMPLETED). Decide it BEFORE evaluating —
  // on the SES server an unknown identifier resolves to `undefined` WITHOUT throwing, so an
  // error-based fallback never fires. `parent`/`rule`/`person`/… stay real (they're in `tables`).
  const bare = String(formula).trim();
  if (/^[A-Za-z_$][\w$]*$/.test(bare)
    && !Object.prototype.hasOwnProperty.call(tables, bare)
    && !['true', 'false', 'null', 'undefined', 'NaN', 'Infinity'].includes(bare)) {
    return { value: bare };
  }
  // `data`/`record` is set to parent so bare `data.x` also works; primary values come via named tables.
  // nullSafeDots makes direct dot-chains null-tolerant (see above) — REL() stays supported for legacy.
  const res = evaluateFormula(nullSafeDots(String(formula)), scope.parent ?? {}, undefined, tables);
  if ('error' in res) return { error: (res.error && (res.error as any).message) || String(res.error) };
  return { value: res.value };
}
