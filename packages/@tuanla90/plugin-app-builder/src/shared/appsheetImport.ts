/**
 * appsheetImport.ts — convert an AppSheet app-definition blob (network readapp/AppDef) into a NocoBase
 * App-Spec + a gsheet sourcePlan + a report. PURE logic (no fs / no network) so it runs client-side in the
 * "Build app" JSON tab AND server-side. Ported 1:1 from build-env/appsheet-to-appspec.cjs — KEEP IN SYNC
 * (that CLI stays the source of truth for batch use; this mirrors it for the in-app paste flow).
 */
import type { AppSpec } from './appSpec';

/** AppSheet audit columns detected on a table → NocoBase's built-in createdAt/updatedAt/createdBy/updatedBy.
 *  Values are the AppSheet SHEET column names/titles (= gviz CSV headers) so the import can read the real
 *  created/updated date + user out of the Google Sheet instead of letting NocoBase auto-stamp import-time. */
export interface AppSheetAudit { createdAt?: string; updatedAt?: string; createdBy?: string; updatedBy?: string }
export interface AppSheetSource { collection: string; table: string; docId: string | null; tab: string; audit?: AppSheetAudit }
export interface AppSheetReport {
  collections: number; fields: number; relations: number; o2m: number; staticEnums: number;
  dynamicEnums: string[]; computedOk: string[]; computedFlag: string[]; attachments: string[]; todos: string[];
  viewsSkipped: string[]; dashboards: number; dashCharts: number; menuTables: string[]; pagesIconized: number;
  sliceScoped: string[]; sliceAcl: string[]; sliceComplex: string[]; auditMapped: string[]; auditGuessed: string[]; auditUnmapped: string[];
}
export interface AppSheetConvertResult { spec: AppSpec; sourcePlan: AppSheetSource[]; report: AppSheetReport; validationErrors: string[] }

/** True if `obj` looks like an AppSheet app-definition blob (so the paste flow can auto-convert it). */
export function looksLikeAppSheet(obj: any): boolean {
  if (!obj || typeof obj !== 'object') return false;
  if (typeof obj.app === 'string' && /"AppData"|"DataSchemas"|"Presentation"/.test(obj.app)) return true;
  return !!(obj.AppData && (obj.AppData.DataSchemas || obj.AppData.DataSets));
}

export function convertAppSheet(raw: any): AppSheetConvertResult {
  const app = typeof raw.app === 'string' ? JSON.parse(raw.app) : (raw.app || raw);

  const report: AppSheetReport = { collections: 0, fields: 0, relations: 0, o2m: 0, staticEnums: 0, dynamicEnums: [], computedOk: [], computedFlag: [], attachments: [], todos: [], viewsSkipped: [], dashboards: 0, dashCharts: 0, menuTables: [], pagesIconized: 0, sliceScoped: [], sliceAcl: [], sliceComplex: [], auditMapped: [], auditGuessed: [], auditUnmapped: [] };
  const slug = (s: any) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^([0-9])/, 'c$1').toLowerCase() || 'field';
  const parseAux = (s: any) => { try { return typeof s === 'string' ? JSON.parse(s) : (s || {}); } catch { return {}; } };

  // ── AppSheet audit-column detection ──────────────────────────────────────────
  // Map a table's created/updated at/by columns onto NocoBase's BUILT-IN createdAt/updatedAt/createdById/
  // updatedById so the import can carry the REAL values (else NocoBase auto-stamps import-time for every row →
  // all rows collapse to the same date and the real created/updated dates+users are lost). The signal is the
  // AppSheet column DEFINITION, not the sheet data:
  //   • "Initial value"  = attr.Default / attr.DefaultExpression.SourceExpr — set ONCE on create → createdAt / createdBy.
  //   • "App formula"     = attr.AppFormula — RECOMPUTES on every edit → updatedAt / updatedBy (ChangeTimestamp-style).
  // NOW()/TODAY() alone is NOT enough (NOW() is used broadly): key off WHERE it sits (initial-value vs app-formula).
  // A DateTime whose init = NOW() but whose NAME says "updated/cập nhật" is the AppSheet "last modified" idiom →
  // updatedAt (init NOW() and app-formula NOW() are indistinguishable by formula for created-vs-updated, so the
  // NAME breaks that one tie). Name heuristic is the multilingual fallback when no formula signal is present.
  const auditNorm = (s: any) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
  const initExprOf = (attr: any): string => { const de = attr && attr.DefaultExpression; return (de && typeof de === 'object' && de.SourceExpr) ? String(de.SourceExpr) : String((attr && attr.Default) || ''); };
  const appExprOf = (attr: any): string => String((attr && attr.AppFormula) || '');
  const isNowToday = (e: any) => /^=?\s*(NOW|TODAY)\s*\(\s*\)\s*$/i.test(String(e || '').trim());
  const isUserFn = (e: any) => /^=?\s*(USEREMAIL|USERNAME)\s*\(\s*\)\s*$/i.test(String(e || '').trim());
  const NAME_UPDATED_AT = /(updated|modified|last\s*modif|ngay (sua|cap nhat|chinh sua|cn)|thoi gian (sua|cap nhat))/;
  const NAME_CREATED_AT = /(created|create[d]?\s*(on|at|date)?|date\s*created|ngay (tao|lap)|thoi gian tao)/;
  const NAME_UPDATED_BY = /((updated|modified)\s*by|nguoi (sua|cap nhat|chinh sua)|(sua|cap nhat|chinh sua)\s*boi)/;
  const NAME_CREATED_BY = /((created|create)\s*by|creator|nguoi tao|tao boi)/;
  const classifyAudit = (attr: any): { role: string; by: string } | null => {
    const type = attr.Type;
    const isDate = type === 'Date' || type === 'DateTime';
    const isUserish = type === 'Name' || type === 'Email' || type === 'Text' || type === 'LongText';
    const init = initExprOf(attr), appf = appExprOf(attr);
    const nm = auditNorm(attr.Name) + ' ' + auditNorm(attr.DisplayName);
    // formula-first (high confidence)
    if (isDate && isNowToday(appf)) return { role: 'updatedAt', by: 'formula' };
    if (isDate && isNowToday(init)) return NAME_UPDATED_AT.test(nm) ? { role: 'updatedAt', by: 'formula' } : { role: 'createdAt', by: 'formula' };
    if (isUserFn(appf)) return { role: 'updatedBy', by: 'formula' };
    if (isUserFn(init)) return NAME_UPDATED_BY.test(nm) ? { role: 'updatedBy', by: 'formula' } : { role: 'createdBy', by: 'formula' };
    // name-only fallback (low confidence — flagged for review)
    if (isDate) { if (NAME_UPDATED_AT.test(nm)) return { role: 'updatedAt', by: 'name' }; if (NAME_CREATED_AT.test(nm)) return { role: 'createdAt', by: 'name' }; }
    if (isUserish) { if (NAME_UPDATED_BY.test(nm)) return { role: 'updatedBy', by: 'name' }; if (NAME_CREATED_BY.test(nm)) return { role: 'createdBy', by: 'name' }; }
    return null;
  };
  // Resolve a table's audit columns: ≤1 per role, formula beats name, first wins within a tier. Returns the
  // { role → sheet-column-name } map (+ pushes review warnings for name-guessed and couldn't-map columns).
  const detectAudit = (attrs: any[], cn: string): AppSheetAudit => {
    const cands: Array<{ name: string; role: string; by: string }> = [];
    for (const attr of attrs || []) {
      if (!attr || !attr.Name || SYS.has(attr.Name) || attr.Name === '_RowNumber') continue;
      const c = classifyAudit(attr); if (c) cands.push({ name: attr.Name, role: c.role, by: c.by });
    }
    const map: AppSheetAudit = {}; const byOf: Record<string, string> = {};
    for (const role of ['createdAt', 'updatedAt', 'createdBy', 'updatedBy'] as const) {
      const forRole = cands.filter((c) => c.role === role); if (!forRole.length) continue;
      const pick = forRole.find((c) => c.by === 'formula') || forRole[0];
      map[role] = pick.name; byOf[role] = pick.by;
      if (pick.by === 'formula') report.auditMapped.push(`${cn}.${slug(pick.name)} → ${role}`);
      else report.auditGuessed.push(`${cn}.${slug(pick.name)} → ${role} (theo tên)`);
    }
    for (const c of cands) if (map[c.role as keyof AppSheetAudit] !== c.name) report.auditUnmapped.push(`${cn}.${slug(c.name)} (giống ${c.role}) → không map được; ${c.role} sẽ là giờ import`);
    return map;
  };
  const FA_TO_LUCIDE: Record<string, string> = {
    'list-ul': 'list', 'list': 'list', 'list-ol': 'list-ordered', 'table': 'table', 'th': 'layout-grid', 'th-list': 'list',
    'edit': 'pencil', 'pen': 'pen', 'pencil': 'pencil', 'trash': 'trash-2', 'trash-alt': 'trash-2',
    'truck': 'truck', 'truck-loading': 'truck', 'conveyor-belt': 'package', 'shipping-fast': 'truck',
    'users': 'users', 'user': 'user', 'user-tie': 'user', 'user-plus': 'user-plus', 'user-friends': 'users', 'address-book': 'contact',
    'dollar-sign': 'dollar-sign', 'money-bill': 'banknote', 'money-bill-wave': 'banknote', 'coins': 'coins', 'wallet': 'wallet', 'receipt': 'receipt', 'file-invoice': 'receipt', 'file-invoice-dollar': 'receipt',
    'bar-chart': 'chart-column', 'chart-bar': 'chart-column', 'chart-pie': 'chart-pie', 'chart-line': 'chart-line', 'chart-area': 'chart-area', 'analytics': 'chart-column',
    'warehouse': 'warehouse', 'warehouse-alt': 'warehouse', 'box': 'box', 'boxes': 'boxes', 'box-open': 'package-open', 'cube': 'box', 'cubes': 'boxes', 'pallet': 'package',
    'laptop': 'laptop', 'desktop': 'monitor', 'mobile': 'smartphone', 'mobile-android': 'smartphone', 'tablet': 'tablet', 'print': 'printer', 'print-search': 'printer', 'printer': 'printer',
    'star': 'star', 'info': 'info', 'info-circle': 'info', 'scroll': 'scroll-text', 'file': 'file', 'file-alt': 'file-text', 'folder': 'folder', 'clipboard': 'clipboard', 'clipboard-list': 'clipboard-list', 'ballot': 'clipboard-list', 'indent': 'indent',
    'search': 'search', 'exchange': 'arrow-left-right', 'exchange-alt': 'arrow-left-right', 'sync': 'refresh-cw', 'random': 'shuffle',
    'cog': 'settings', 'cogs': 'settings', 'wrench': 'wrench', 'tools': 'wrench', 'sliders-h': 'sliders-horizontal',
    'calendar': 'calendar', 'calendar-alt': 'calendar', 'clock': 'clock', 'history': 'history', 'map': 'map', 'map-marker': 'map-pin', 'map-marker-alt': 'map-pin', 'location-arrow': 'navigation',
    'tag': 'tag', 'tags': 'tags', 'shopping-cart': 'shopping-cart', 'cart-plus': 'shopping-cart', 'shopping-bag': 'shopping-bag', 'store': 'store',
    'home': 'home', 'building': 'building', 'industry': 'factory', 'warehouse-full': 'warehouse',
    'phone': 'phone', 'envelope': 'mail', 'bell': 'bell', 'check': 'check', 'check-circle': 'circle-check', 'times': 'x', 'plus': 'plus', 'ban': 'ban',
    'flag': 'flag', 'bookmark': 'bookmark', 'heart': 'heart', 'eye': 'eye', 'lock': 'lock', 'key': 'key', 'shield-alt': 'shield', 'bolt': 'zap', 'fire': 'flame', 'lightbulb': 'lightbulb',
  };
  const faToLucide = (fa: any): string | null => {
    if (!fa) return null;
    let n = String(fa).trim().split(/\s+/).pop() || '';
    n = n.replace(/^fa[a-z]?-/, '').replace(/^fa-/, '').toLowerCase();
    const m = FA_TO_LUCIDE[n] || FA_TO_LUCIDE[n.replace(/-(alt|solid|regular|light)$/, '')];
    return m ? `lucide-${m}` : null;
  };
  const TYPE_MAP: Record<string, string> = { Text: 'input', Name: 'input', LongText: 'textarea', Number: 'number', Decimal: 'number', Percent: 'percent', Price: 'number', Date: 'date', DateTime: 'datetime', Time: 'time', 'Yes/No': 'boolean', Email: 'email', Phone: 'phone', Url: 'url', Color: 'color', Image: 'ATTACHMENT', Thumbnail: 'ATTACHMENT', File: 'ATTACHMENT', Drawing: 'ATTACHMENT', Signature: 'ATTACHMENT' };
  const SYS = new Set(['_RowNumber', '_EMAIL', '_NAME', '_LOCATION', '_THISUSER', '_THISROW']);
  const SAFE_FN = new Set([
    'SUM', 'ABS', 'ROUND', 'ROUNDUP', 'ROUNDDOWN', 'INT', 'TRUNC', 'MOD', 'POWER', 'SQRT', 'EXP', 'LOG', 'LN', 'MAX', 'MIN', 'AVERAGE', 'MEDIAN', 'COUNT', 'COUNTA', 'SUMPRODUCT', 'CEILING', 'FLOOR', 'SIGN', 'PI',
    'IF', 'IFS', 'AND', 'OR', 'NOT', 'SWITCH', 'IFERROR', 'IFNA', 'ISBLANK', 'ISNOTBLANK', 'ISNUMBER', 'ISTEXT', 'ISERROR',
    'CONCATENATE', 'CONCAT', 'LEFT', 'RIGHT', 'MID', 'LEN', 'LOWER', 'UPPER', 'PROPER', 'TRIM', 'TEXT', 'SUBSTITUTE', 'REPLACE', 'FIND', 'SEARCH', 'VALUE', 'TEXTJOIN', 'REPT', 'EXACT', 'STARTSWITH', 'ENDSWITH', 'CONTAINS', 'SPLIT',
    'TODAY', 'NOW', 'DATE', 'DATEVALUE', 'YEAR', 'MONTH', 'DAY', 'HOUR', 'MINUTE', 'SECOND', 'WEEKDAY', 'WEEKNUM', 'EOMONTH', 'EDATE', 'DATEDIF', 'DAYS', 'TIME',
    'SELECT', 'FILTER', 'SUMIF', 'SUMIFS', 'COUNTIF', 'COUNTIFS', 'AVERAGEIF', 'AVERAGEIFS', 'INDEX', 'MATCH', 'LIST', 'IN', 'ANY', 'SORT', 'UNIQUE',
  ]);

  const dataSets = (app.AppData?.DataSets) || [];
  const schemasByName = new Map((app.AppData?.DataSchemas || []).map((s: any) => [s.Name, s]));
  const business = dataSets.filter((ds: any) => (ds.ProviderName === 'google' || ds.DataSourceName === 'google') && ds.Visibility !== 'NEVER');
  const tableToColl = new Map(business.map((ds: any) => [ds.Name, slug(ds.Name)]));
  const schemaToTable = new Map(business.map((ds: any) => [ds.SchemaName, ds.Name]));
  const sliceToTable = new Map(((app.AppData?.TableSlices) || []).map((sl: any) => [sl.Name, sl.SourceTable]).filter(([, t]: any) => t));
  const collSlugs = new Set(tableToColl.values());
  const resolveColl = (name: any): any => {
    const n = String(name || '').trim();
    if (tableToColl.has(n)) return tableToColl.get(n);
    if (sliceToTable.has(n) && tableToColl.has(sliceToTable.get(n))) return tableToColl.get(sliceToTable.get(n));
    const sl = slug(n);
    if (collSlugs.has(sl)) return sl;
    for (const [sn, base] of sliceToTable as any) if (slug(sn) === sl && tableToColl.has(base)) return tableToColl.get(base);
    return null;
  };

  const revByParent = new Map<string, Map<string, string>>();
  for (const s of app.AppData?.DataSchemas || []) {
    const parentTable = schemaToTable.get(s.Name); if (!parentTable) continue;
    for (const a of s.Attributes || []) {
      if (a.Type !== 'List') continue;
      const p = a.InternalQualifier?.Properties || {};
      let childTable = p.IsReverseRef ? p.ReferencingTableName : null;
      if (!childTable && a.AppFormula) { const m = String(a.AppFormula).match(/SELECT\(\s*([^\[\(]+?)\s*\[/); if (m) childTable = m[1].trim(); }
      if (childTable && tableToColl.has(childTable)) { if (!revByParent.has(parentTable as any)) revByParent.set(parentTable as any, new Map()); revByParent.get(parentTable as any)!.set(childTable, a.Name); }
    }
  }

  const collections: any[] = [];
  const sourcePlan: AppSheetSource[] = [];
  const o2mByColl = new Map<string, any[]>();
  const childRollupName = new Map<string, Map<string, string>>();
  const menuTables = new Set<string>();

  for (const ds of business) {
    const schema: any = schemasByName.get(ds.SchemaName); if (!schema) { report.todos.push(`${ds.Name} (no schema)`); continue; }
    const cn = tableToColl.get(ds.Name) as string;
    const docId = (String(ds.Source || '').match(/DocId=([^&;]+)/) || [])[1] || null;
    // Detect audit columns FIRST (a mapped one is NOT emitted as a regular field — it feeds NocoBase's built-in).
    const audit = detectAudit(schema.Attributes || [], cn);
    const auditCols = new Set(Object.values(audit));
    sourcePlan.push({ collection: cn, table: ds.Name, docId, tab: ds.SourceQualifier || ds.Name, ...(Object.keys(audit).length ? { audit } : {}) });

    const fields: any[] = [], relations: any[] = [], computedDefs: any[] = [];
    const usedNames = new Set(['id', 'created_at', 'updated_at']);
    const nameOf = (t: any) => { let n = slug(t); while (usedNames.has(n)) n += '_x'; usedNames.add(n); return n; };
    const rollup = childRollupName.get(cn) || new Map(); childRollupName.set(cn, rollup);
    let titleField: any = null;

    for (const attr of schema.Attributes || []) {
      const title = attr.Name; if (SYS.has(title) || title === '_RowNumber') continue;
      if (auditCols.has(title)) continue;   // mapped to a built-in createdAt/updatedAt/createdBy/updatedBy → not a regular field
      const aux = parseAux(attr.TypeAuxData);
      if (attr.IsVirtual && attr.Type === 'List') continue;

      const refTable = attr.Type === 'Ref' ? aux.ReferencedTableName : (aux.BaseType === 'Ref' ? parseAux(aux.BaseTypeQualifier).ReferencedTableName : null);
      if (refTable) {
        const target = tableToColl.get(refTable);
        if (!target) { report.todos.push(`${ds.Name}.${title}: Ref → "${refTable}" (not synced) — manual`); continue; }
        const rname = nameOf(title);
        const type = attr.Type === 'EnumList' ? 'm2m' : 'm2o';
        const rel: any = { name: rname, type, target, title };
        const revName = revByParent.get(refTable)?.get(ds.Name);
        if (type === 'm2o' && revName) {
          rel.reverseName = slug(revName);
          if (!o2mByColl.has(target as any)) o2mByColl.set(target as any, []);
          o2mByColl.get(target as any)!.push({ name: rel.reverseName, childColl: cn });
          (childRollupName.get(target as any) || childRollupName.set(target as any, new Map()).get(target as any))!.set(ds.Name, rel.reverseName);
          report.o2m++;
        }
        relations.push(rel); report.relations++;
        continue;
      }

      const iface = TYPE_MAP[attr.Type] || (attr.Type === 'Enum' ? 'select' : attr.Type === 'EnumList' ? 'multipleSelect' : 'input');
      const name = nameOf(title);
      const f: any = { name, title, interface: iface };
      if (attr.Type === 'Enum' || attr.Type === 'EnumList') {
        const opts = Array.isArray(aux.EnumValues) ? aux.EnumValues : [];
        f.interface = attr.Type === 'EnumList' ? 'multipleSelect' : 'select';
        if (opts.length) { f.options = opts; report.staticEnums++; } else { f.interface = 'input'; report.dynamicEnums.push(`${ds.Name}.${title}`); delete f.options; }
      }
      if (iface === 'ATTACHMENT') { f.interface = 'input'; report.attachments.push(`${ds.Name}.${title}`); }
      if (attr.IsRequired) f.required = true;
      if (attr.IsKey) f.unique = true;
      if (attr.IsLabel && !titleField) titleField = name;
      fields.push(f);
      if (attr.AppFormula) computedDefs.push({ f, formula: attr.AppFormula, virtual: !!attr.IsVirtual });
      report.fields++;
    }

    const coll: any = { name: cn, title: ds.Name, fields, _computed: computedDefs };
    if (titleField) coll.titleField = titleField;
    if (relations.length) coll.relations = relations;
    collections.push(coll);
    report.collections++;

    const realCols = (schema.Attributes || []).filter((a: any) => a.Name && !SYS.has(a.Name) && a.Name !== '_RowNumber' && !a.IsVirtual);
    const hasImg = realCols.some((a: any) => a.Type === 'Image' || a.Type === 'Thumbnail' || a.Type === 'File');
    const hasLink = realCols.some((a: any) => /(^|[\s_])(view|link|menu|target|screen|màn hình|man hinh|điều hướng)([\s_]|$)/i.test(a.Name));
    if (hasImg && hasLink && realCols.length <= 5) { menuTables.add(cn); report.menuTables.push(ds.Name); }
  }

  // ── formula translation ──
  const fixOps = (s: string) => s.replace(/<=/g, '\x01').replace(/>=/g, '\x02').replace(/<>/g, '!=').replace(/=/g, '==').replace(/\x01/g, '<=').replace(/\x02/g, '>=');
  const splitTop = (s: string) => {
    const out: string[] = []; let d = 0, cur = '';
    for (const ch of s) { if (ch === '(') d++; else if (ch === ')') d--; if (ch === ',' && d === 0) { out.push(cur); cur = ''; } else cur += ch; }
    if (cur.trim() !== '') out.push(cur);
    return out;
  };
  const unwrapLogical = (s: string): string => {
    s = s.trim();
    const m = s.match(/^(AND|OR)\(([\s\S]*)\)$/i);
    if (!m) return s;
    const op = m[1].toUpperCase() === 'AND' ? ' && ' : ' || ';
    const parts = splitTop(m[2]).map((p) => unwrapLogical(p).trim()).filter((p) => p && !/^true$/i.test(p));
    return parts.length === 1 ? parts[0] : '(' + parts.join(op) + ')';
  };
  // A bare same-row reference `[X]` (via [_THISROW].[X] or plain [X]) translates to `data.<x>` — but if `X`
  // is itself a RELATION field on `coll`, the engine's `data.<x>` is the whole associated OBJECT (so `.field`
  // derefs work), NOT a scalar. Used bare (compared/passed as a value), that's always wrong — append `.id`.
  const relOf = (coll: any, name: string) => (coll?.relations || []).find((r: any) => r.name === name);
  const sameRowRef = (coll: any, x: any): string => { const n = slug(x); return relOf(coll, n) ? `data.${n}.id` : `data.${n}`; };
  const transCond = (cond: string, childSlug: string, coll: any): string => {
    let s = unwrapLogical(cond.trim());
    s = s.replace(/\[_THISROW\]\.\[([^\]]+)\]/g, (_, x) => sameRowRef(coll, x));
    s = s.replace(/\[([^\]]+)\]\.\[([^\]]+)\]/g, (_, a, b) => `${childSlug}.${slug(a)}.${slug(b)}`);
    s = s.replace(/\[([^\]]+)\]/g, (_, x) => `${childSlug}.${slug(x)}`);
    return s;
  };
  const translateSelects = (s: string, coll: any): string => {
    const re = /\bSELECT\s*\(/gi;
    let out = '', i = 0, guard = 0;
    for (;;) {
      re.lastIndex = i;
      const m = re.exec(s);
      if (!m) { out += s.slice(i); return out; }
      out += s.slice(i, m.index);
      let k = m.index + m[0].length, depth = 1;
      const argStart = k;
      while (k < s.length && depth > 0) { if (s[k] === '(') depth++; else if (s[k] === ')') depth--; k++; }
      const parts = splitTop(s.slice(argStart, k - 1));
      const head = parts.shift() || '';
      const cond = parts.join(',');
      const hm = head.match(/^\s*([\s\S]+?)\s*\[\s*([^\]]+?)\s*\]\s*$/);
      if (!hm) { out += s.slice(m.index, k); i = k; continue; }
      const childColl = resolveColl(hm[1]);
      if (!childColl) throw { flag: `SELECT table "${hm[1].trim()}" not a synced collection` };
      out += `SELECT(${childColl}.${slug(hm[2])}, ${transCond(cond, childColl, coll)})`;
      i = k;
      if (++guard > 300) throw { flag: 'SELECT loop' };
    }
  };
  // LOOKUP(value, Table, keyCol, retCol) → INDEX(SELECT(<coll>.<ret>, <coll>.<key> = value), 1). SPECIAL CASE
  // (preferred whenever it applies): if `value` is bare `[_THISROW].[X]`/`[X]` and X is a relation ON `coll`
  // that ALREADY points at the LOOKUP's target table, that relation was resolved/linked at IMPORT time —
  // re-matching by AppSheet's business key here is redundant AND fragile (AppSheet's "ID" column collides
  // with NocoBase's own `id` PK and gets renamed to `id_x` by the converter, so a naive slug("ID")→"id"
  // silently binds to the wrong field — the system PK — instead of throwing). Skip all that: deref directly.
  const translateLookups = (s: string, coll: any): string => {
    const re = /\bLOOKUP\s*\(/gi;
    let out = '', i = 0, guard = 0;
    const bare = (x: any) => String(x).trim().replace(/^\s*\[?\s*|\s*\]?\s*$/g, '').replace(/^["']|["']$/g, '');
    for (;;) {
      re.lastIndex = i;
      const m = re.exec(s);
      if (!m) { out += s.slice(i); return out; }
      out += s.slice(i, m.index);
      let k = m.index + m[0].length, depth = 1;
      const argStart = k;
      while (k < s.length && depth > 0) { if (s[k] === '(') depth++; else if (s[k] === ')') depth--; k++; }
      const parts = splitTop(s.slice(argStart, k - 1));
      if (parts.length < 4) throw { flag: 'LOOKUP arity' };
      const rawVal = parts[0].trim();
      const targetColl = resolveColl(bare(parts[1]).replace(/^["']|["']$/g, ''));
      if (!targetColl) throw { flag: `LOOKUP table "${bare(parts[1])}" not a synced collection` };
      const directM = rawVal.match(/^\[_THISROW\]\.\[([^\]]+)\]$|^\[([^\]]+)\]$/);
      const rel: any = directM && relOf(coll, slug(directM[1] || directM[2]));
      if (rel && rel.target === targetColl) { out += `data.${rel.name}.${slug(bare(parts[3]))}`; i = k; if (++guard > 300) throw { flag: 'LOOKUP loop' }; continue; }
      const val = translateLookups(rawVal, coll);
      out += `INDEX(SELECT(${targetColl}.${slug(bare(parts[3]))}, ${targetColl}.${slug(bare(parts[2]))} = ${val}), 1)`;
      i = k;
      if (++guard > 300) throw { flag: 'LOOKUP loop' };
    }
  };
  const translate = (f: any, coll: any): string => {
    let s = String(f).trim().replace(/^=/, '');
    s = translateLookups(s, coll);
    s = translateSelects(s, coll);
    if (/\][.]\s*\[[^\]]+\]\s*[.]\s*\[/.test(s.replace(/\[_THISROW\]/g, 'data'))) throw { flag: 'deref 2+ levels' };
    s = s.replace(/\[([^\]]+)\]\s*\[([^\]]+)\]/g, (_, a, b) => `data.${slug(a)}.${slug(b)}`);
    s = s.replace(/\[_THISROW\]\.\[([^\]]+)\]/g, (_, x) => sameRowRef(coll, x));
    s = s.replace(/\[([^\]]+)\]\.\[([^\]]+)\]/g, (_, a, b) => `data.${slug(a)}.${slug(b)}`);
    s = s.replace(/\[([^\]]+)\]/g, (_, x) => sameRowRef(coll, x));
    s = fixOps(s);
    if (/[\[\]]|_THISROW|REF_ROWS|LOOKUP|USER(SETTINGS|EMAIL|NAME)/i.test(s)) throw { flag: 'unresolved (relation/user fn)' };
    const bad = [...s.matchAll(/([A-Za-z][A-Za-z0-9_]+)\s*\(/g)].map((m) => m[1]).filter((fn) => fn === fn.toUpperCase()).find((fn) => !SAFE_FN.has(fn));
    if (bad) throw { flag: `unsafe fn ${bad}` };
    return s;
  };
  for (const coll of collections) {
    for (const { f, formula, virtual } of coll._computed) {
      try { const expr = translate(formula, coll); f.computed = { expression: expr, kind: virtual ? 'display' : 'stored' }; report.computedOk.push(`${coll.name}.${f.name} [${virtual ? 'display' : 'stored'}] = ${expr}`); }
      catch (e: any) { report.computedFlag.push(`${coll.name}.${f.name} ⚠ ${e.flag || e.message}: ${String(formula).replace(/\s+/g, ' ').slice(0, 70)}`); }
    }
    delete coll._computed;
  }

  // ── pages ──
  const controls = (app.Presentation?.Controls) || [];
  const validCols = (cn: string) => { const c: any = collections.find((x) => x.name === cn); return new Set([...(c?.fields || []).map((f: any) => f.name), ...(c?.relations || []).map((r: any) => r.name), ...(o2mByColl.get(cn) || []).map((o: any) => o.name), 'id', 'created_at', 'updated_at']); };
  const sliceByName = new Map(((app.AppData?.TableSlices) || []).map((s: any) => [s.Name, s]));
  const collByName = new Map(collections.map((c) => [c.name, c]));
  const PRIMARY = new Set(['center', 'left', 'left most', 'right']);
  const cleanTitle = (n: any) => String(n || '').replace(/_(Slice|Dashboard|Deck|Detail|Form|Table)(_Mobile)?$/i, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  const defaultCols = (coll: any) => [...new Set([coll.titleField, ...coll.fields.map((f: any) => f.name), ...(coll.relations || []).map((r: any) => r.name)].filter(Boolean))].filter((x) => validCols(coll.name).has(x));
  const translateSliceFilter = (slice: any, coll: string, valid: Set<any>) => {
    const rawF = slice && slice.FilterCondition ? String(slice.FilterCondition).trim().replace(/^=/, '') : '';
    if (!rawF || /^true\(?\)?$/i.test(rawF)) return null;
    if (/USERSETTINGS|USEREMAIL|USERNAME/i.test(rawF)) { report.sliceAcl.push(`${coll} ← ${slice.Name}`); return null; }
    if (/SELECT\(|LOOKUP\(|\bFILTER\b|ANY\(/i.test(rawF)) { report.sliceComplex.push(`${coll} ← ${slice.Name}`); return null; }
    const am = rawF.match(/^AND\(([\s\S]*)\)$/i);
    const parts = am ? splitTop(am[1]) : [rawF];
    const opMap: Record<string, string> = { '=': '$eq', '<>': '$ne', '>': '$gt', '<': '$lt', '>=': '$gte', '<=': '$lte' };
    const items: any[] = [];
    for (let p of parts) {
      p = p.trim(); if (!p || /^true\(?\)?$/i.test(p)) continue;
      let m: any;
      if ((m = p.match(/^\[([^\]]+)\]\s*(<>|>=|<=|=|>|<)\s*"([^"]*)"$/)) || (m = p.match(/^\[([^\]]+)\]\s*(<>|>=|<=|=|>|<)\s*([0-9.]+)$/))) {
        const f = slug(m[1]); if (!valid.has(f)) { report.sliceComplex.push(`${coll} ← ${slice.Name} (field ${m[1]})`); return null; }
        items.push({ field: f, op: opMap[m[2]], value: /^[0-9.]+$/.test(m[3]) ? Number(m[3]) : m[3] });
      } else if ((m = p.match(/^IN\(\s*\[([^\]]+)\]\s*,\s*LIST\(([\s\S]*)\)\s*\)$/i))) {
        const f = slug(m[1]); if (!valid.has(f)) { report.sliceComplex.push(`${coll} ← ${slice.Name} (field ${m[1]})`); return null; }
        items.push({ field: f, op: '$in', value: splitTop(m[2]).map((x) => x.trim().replace(/^"|"$/g, '')) });
      } else { report.sliceComplex.push(`${coll} ← ${slice.Name}`); return null; }
    }
    if (!items.length) return null;
    report.sliceScoped.push(`${coll} ← ${slice.Name}`);
    return { logic: '$and', items };
  };
  const pages: any[] = [];
  const coveredColls = new Set();
  const seenKey = new Set();
  const usedTitles = new Set();
  const uniqTitle = (t: any) => { let u = t || 'Trang', i = 2; while (usedTitles.has(u)) u = `${t} (${i++})`; usedTitles.add(u); return u; };
  for (const c of controls) {
    if (!['table', 'deck', 'card'].includes(c.Action)) continue;
    if (!PRIMARY.has(c.Position) && c.Position !== 'menu') continue;
    const coll = resolveColl(c.TableOrFolderName); if (!coll || menuTables.has(coll)) continue;
    const collObj: any = collByName.get(coll); if (!collObj) continue;
    const valid = validCols(coll);
    let st: any = {}; try { st = JSON.parse(c.Settings || '{}'); } catch { /* */ }
    let columns = (st.ColumnOrder || []).map(slug).filter((x: any) => valid.has(x));
    if (!columns.length) columns = defaultCols(collObj);
    const key = coll + '|' + columns.join(',');
    if (seenKey.has(key)) continue; seenKey.add(key);
    const o2mNames = (o2mByColl.get(coll) || []).map((o: any) => o.name);
    const popupColumns = [...new Set([...columns, ...o2mNames])].filter((x) => valid.has(x));
    const icon = faToLucide(st.Icon); if (icon) report.pagesIconized++;
    const menuGroup = PRIMARY.has(c.Position) ? 'Chính' : 'Menu';
    const page: any = { title: uniqTitle(cleanTitle(c.Name) || collObj.title || coll), collection: coll, ...(icon ? { icon } : {}), menuGroup, columns, popupColumns };
    const scope = translateSliceFilter(sliceByName.get(c.TableOrFolderName), coll, valid);
    if (scope) page.dataScope = scope;
    pages.push(page); coveredColls.add(coll);
  }
  for (const coll of collections) {
    if (coveredColls.has(coll.name) || menuTables.has(coll.name)) continue;
    const columns = defaultCols(coll);
    const o2mNames = (o2mByColl.get(coll.name) || []).map((o: any) => o.name);
    const popupColumns = [...new Set([...columns, ...o2mNames])].filter((x) => validCols(coll.name).has(x));
    pages.push({ title: uniqTitle(coll.title), collection: coll.name, menuGroup: 'Danh mục / Cấu hình', columns, popupColumns });
  }

  // ── dashboards ──
  const collTitleOf = new Map(collections.map((c) => [c.name, c.title]));
  const chartsByColl = new Map<string, any[]>();
  for (const c of controls) {
    if (c.Action !== 'chart') continue;
    let vd: any = c.ViewDefinition; if (typeof vd === 'string') { try { vd = JSON.parse(vd); } catch { vd = null; } }
    if (!vd) continue;
    const coll = resolveColl(String(c.TableOrFolderName || '').replace(/_(Dashboard|Slice|Deck|Detail|Form|Chart)$/i, '')) || resolveColl(c.TableOrFolderName);
    if (!coll) { report.viewsSkipped.push(`chart "${c.Name}" (bảng "${c.TableOrFolderName}" chưa map)`); continue; }
    const valid = validCols(coll);
    const dim = (vd.ChartColumns || [])[0] ? slug(vd.ChartColumns[0]) : null;
    if (!dim || !valid.has(dim)) { report.viewsSkipped.push(`chart "${c.Name}" (dimension chưa có)`); continue; }
    const [fnRaw, measRaw] = String(vd.GroupAggregate || 'NONE').split('::').map((x) => x.trim());
    const fn = (fnRaw || '').toUpperCase();
    let measure: any = { field: 'id', aggregation: 'count' };
    if (fn === 'SUM' && measRaw && valid.has(slug(measRaw))) measure = { field: slug(measRaw), aggregation: 'sum' };
    else if (fn === 'AVERAGE' && measRaw && valid.has(slug(measRaw))) measure = { field: slug(measRaw), aggregation: 'avg' };
    const chartType = /Histogram|Bar|Column/i.test(vd.ChartType) ? 'bar' : /Line/i.test(vd.ChartType) ? 'line' : 'pie';
    const title = String(c.Name || '').replace(/_(Dashboard|Slice)$/i, '').trim();
    if (!chartsByColl.has(coll)) chartsByColl.set(coll, []);
    chartsByColl.get(coll)!.push({ kind: 'chart', title, chartType, dimension: { field: dim }, measure });
  }
  const dashboards = [...chartsByColl].map(([coll, widgets]) => ({ title: `${collTitleOf.get(coll) || coll} — Phân tích`, collection: coll, icon: 'lucide-chart-pie', menuGroup: 'Menu', widgets }));
  report.dashboards = dashboards.length;
  report.dashCharts = dashboards.reduce((n, d) => n + d.widgets.length, 0);

  // ── validate ──
  const IFACES = new Set(['input', 'textarea', 'markdown', 'richText', 'phone', 'email', 'url', 'uuid', 'nanoid', 'password', 'number', 'integer', 'percent', 'select', 'multipleSelect', 'radioGroup', 'checkbox', 'checkboxGroup', 'boolean', 'date', 'datetime', 'time', 'color', 'icon', 'json', 'statusFlow']);
  const OPT = new Set(['select', 'multipleSelect', 'radioGroup', 'checkboxGroup']);
  const cset = new Set(collections.map((c) => c.name));
  const vErr: string[] = [];
  for (const c of collections) {
    for (const f of c.fields) { if (!IFACES.has(f.interface)) vErr.push(`${c.name}.${f.name}: bad interface "${f.interface}"`); if (OPT.has(f.interface) && !(f.options && f.options.length)) vErr.push(`${c.name}.${f.name}: ${f.interface} without options`); }
    for (const r of c.relations || []) if (!cset.has(r.target)) vErr.push(`${c.name}.${r.name}: relation → missing "${r.target}"`);
  }
  for (const p of pages) { const valid = validCols(p.collection); for (const col of p.columns) if (!valid.has(col)) vErr.push(`page "${p.title}": col "${col}" not in "${p.collection}"`); }

  const spec: any = { meta: { name: slug(app.ShortName), title: app.ShortName, locale: 'vi' }, collections, pages, ...(dashboards.length ? { dashboards } : {}), menu: { groups: [{ label: 'Chính' }, { label: 'Menu' }, { label: 'Danh mục / Cấu hình' }] } };
  return { spec: spec as AppSpec, sourcePlan, report, validationErrors: vErr };
}
