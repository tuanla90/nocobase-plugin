#!/usr/bin/env node
/*
 * appsheet-to-appspec.cjs — Convert an AppSheet app-definition (network readapp/AppDef blob)
 * into a NocoBase App-Spec (@tuanla90/plugin-app-builder IR) + gsheet-sync sourceplan + report.
 *
 * Usage: node build-env/appsheet-to-appspec.cjs <appdef.json> [outPrefix]
 *
 * v2: reverse-ref (Related X / REF_ROWS) → real o2m (reverseName on the child m2o, shown on
 * the parent's page); AppSheet formulas translated to @tuanla90 computed fields where safe
 * (same-row, lookup [A].[B], unfiltered roll-up SUM([Related X][Col])/SUM(SELECT(Child[..]))),
 * filtered SUMIF-style roll-ups + unsafe funcs FLAGGED (kept as plain fields), not guessed.
 */
'use strict';
const fs = require('fs');

const inFile = process.argv[2];
const outPrefix = process.argv[3] || (inFile || '').replace(/\.json$/i, '');
if (!inFile) { console.error('usage: node appsheet-to-appspec.cjs <appdef.json> [outPrefix]'); process.exit(1); }
const raw = JSON.parse(fs.readFileSync(inFile, 'utf8'));
const app = typeof raw.app === 'string' ? JSON.parse(raw.app) : (raw.app || raw);

const report = { collections: 0, fields: 0, relations: 0, o2m: 0, staticEnums: 0, dynamicEnums: [], computedOk: [], computedFlag: [], attachments: [], todos: [], viewsSkipped: [], dashboards: 0, dashCharts: 0, menuTables: [], pagesIconized: 0, sliceScoped: [], sliceAcl: [], sliceComplex: [], auditMapped: [], auditGuessed: [], auditUnmapped: [] };
const slug = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^([0-9])/, 'c$1').toLowerCase() || 'field';
const parseAux = (s) => { try { return typeof s === 'string' ? JSON.parse(s) : (s || {}); } catch { return {}; } };

// ── AppSheet audit-column detection (KEEP IN SYNC with src/shared/appsheetImport.ts) ─────────────────────────
// Map a table's created/updated at/by columns onto NocoBase's BUILT-IN createdAt/updatedAt/createdById/
// updatedById so the import carries the REAL values (else NocoBase auto-stamps import-time → all rows collapse
// to the same date, real dates+users lost). Signal = the AppSheet column DEFINITION, not the sheet data:
//   • "Initial value" = attr.Default / attr.DefaultExpression.SourceExpr — set ONCE on create → createdAt / createdBy.
//   • "App formula"    = attr.AppFormula — RECOMPUTES on every edit → updatedAt / updatedBy (ChangeTimestamp-style).
// NOW()/TODAY() alone is NOT enough (used broadly): key off WHERE it sits. A DateTime with init NOW() but a name
// saying "updated/cập nhật" is the AppSheet "last modified" idiom → updatedAt. Name heuristic = multilingual fallback.
const auditNorm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
const initExprOf = (attr) => { const de = attr && attr.DefaultExpression; return (de && typeof de === 'object' && de.SourceExpr) ? String(de.SourceExpr) : String((attr && attr.Default) || ''); };
const appExprOf = (attr) => String((attr && attr.AppFormula) || '');
const isNowToday = (e) => /^=?\s*(NOW|TODAY)\s*\(\s*\)\s*$/i.test(String(e || '').trim());
const isUserFn = (e) => /^=?\s*(USEREMAIL|USERNAME)\s*\(\s*\)\s*$/i.test(String(e || '').trim());
const NAME_UPDATED_AT = /(updated|modified|last\s*modif|ngay (sua|cap nhat|chinh sua|cn)|thoi gian (sua|cap nhat))/;
const NAME_CREATED_AT = /(created|create[d]?\s*(on|at|date)?|date\s*created|ngay (tao|lap)|thoi gian tao)/;
const NAME_UPDATED_BY = /((updated|modified)\s*by|nguoi (sua|cap nhat|chinh sua)|(sua|cap nhat|chinh sua)\s*boi)/;
const NAME_CREATED_BY = /((created|create)\s*by|creator|nguoi tao|tao boi)/;
function classifyAudit(attr) {
  const type = attr.Type;
  const isDate = type === 'Date' || type === 'DateTime';
  const isUserish = type === 'Name' || type === 'Email' || type === 'Text' || type === 'LongText';
  const init = initExprOf(attr), appf = appExprOf(attr);
  const nm = auditNorm(attr.Name) + ' ' + auditNorm(attr.DisplayName);
  if (isDate && isNowToday(appf)) return { role: 'updatedAt', by: 'formula' };
  if (isDate && isNowToday(init)) return NAME_UPDATED_AT.test(nm) ? { role: 'updatedAt', by: 'formula' } : { role: 'createdAt', by: 'formula' };
  if (isUserFn(appf)) return { role: 'updatedBy', by: 'formula' };
  if (isUserFn(init)) return NAME_UPDATED_BY.test(nm) ? { role: 'updatedBy', by: 'formula' } : { role: 'createdBy', by: 'formula' };
  if (isDate) { if (NAME_UPDATED_AT.test(nm)) return { role: 'updatedAt', by: 'name' }; if (NAME_CREATED_AT.test(nm)) return { role: 'createdAt', by: 'name' }; }
  if (isUserish) { if (NAME_UPDATED_BY.test(nm)) return { role: 'updatedBy', by: 'name' }; if (NAME_CREATED_BY.test(nm)) return { role: 'createdBy', by: 'name' }; }
  return null;
}
function detectAudit(attrs, cn) {
  const cands = [];
  for (const attr of attrs || []) {
    if (!attr || !attr.Name || SYS.has(attr.Name) || attr.Name === '_RowNumber') continue;
    const c = classifyAudit(attr); if (c) cands.push({ name: attr.Name, role: c.role, by: c.by });
  }
  const map = {}; const byOf = {};
  for (const role of ['createdAt', 'updatedAt', 'createdBy', 'updatedBy']) {
    const forRole = cands.filter((c) => c.role === role); if (!forRole.length) continue;
    const pick = forRole.find((c) => c.by === 'formula') || forRole[0];
    map[role] = pick.name; byOf[role] = pick.by;
    if (pick.by === 'formula') report.auditMapped.push(`${cn}.${slug(pick.name)} → ${role}`);
    else report.auditGuessed.push(`${cn}.${slug(pick.name)} → ${role} (theo tên)`);
  }
  for (const c of cands) if (map[c.role] !== c.name) report.auditUnmapped.push(`${cn}.${slug(c.name)} (giống ${c.role}) → không map được; ${c.role} sẽ là giờ import`);
  return map;
}
// AppSheet view icon (Font Awesome, e.g. "fal fa-users") → NocoBase lucide key. Best-effort curated map;
// unknown → null (caller falls back to a sensible default). Keeps only icons known to exist in lucide.
const FA_TO_LUCIDE = {
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
function faToLucide(fa) {
  if (!fa) return null;
  let n = String(fa).trim().split(/\s+/).pop() || '';        // last token drops weight prefix ("fal fa-users" → "fa-users")
  n = n.replace(/^fa[a-z]?-/, '').replace(/^fa-/, '').toLowerCase();
  const m = FA_TO_LUCIDE[n] || FA_TO_LUCIDE[n.replace(/-(alt|solid|regular|light)$/, '')];
  return m ? `lucide-${m}` : null;
}
const TYPE_MAP = { Text: 'input', Name: 'input', LongText: 'textarea', Number: 'number', Decimal: 'number', Percent: 'percent', Price: 'number', Date: 'date', DateTime: 'datetime', Time: 'time', 'Yes/No': 'boolean', Email: 'email', Phone: 'phone', Url: 'url', Color: 'color', Image: 'ATTACHMENT', Thumbnail: 'ATTACHMENT', File: 'ATTACHMENT', Drawing: 'ATTACHMENT', Signature: 'ATTACHMENT' };
const SYS = new Set(['_RowNumber', '_EMAIL', '_NAME', '_LOCATION', '_THISUSER', '_THISROW']);
// allow-list = what @tuanla90/plugin-formula's engine actually runs (formula.js + AppSheet-parity CUSTOM_FNS).
// See packages/@tuanla90/plugin-formula/APPSHEET-TO-FORMULA.md §2.
const SAFE_FN = new Set([
  // math
  'SUM', 'ABS', 'ROUND', 'ROUNDUP', 'ROUNDDOWN', 'INT', 'TRUNC', 'MOD', 'POWER', 'SQRT', 'EXP', 'LOG', 'LN', 'MAX', 'MIN', 'AVERAGE', 'MEDIAN', 'COUNT', 'COUNTA', 'SUMPRODUCT', 'CEILING', 'FLOOR', 'SIGN', 'PI',
  // logic
  'IF', 'IFS', 'AND', 'OR', 'NOT', 'SWITCH', 'IFERROR', 'IFNA', 'ISBLANK', 'ISNOTBLANK', 'ISNUMBER', 'ISTEXT', 'ISERROR',
  // text
  'CONCATENATE', 'CONCAT', 'LEFT', 'RIGHT', 'MID', 'LEN', 'LOWER', 'UPPER', 'PROPER', 'TRIM', 'TEXT', 'SUBSTITUTE', 'REPLACE', 'FIND', 'SEARCH', 'VALUE', 'TEXTJOIN', 'REPT', 'EXACT', 'STARTSWITH', 'ENDSWITH', 'CONTAINS', 'SPLIT',
  // date
  'TODAY', 'NOW', 'DATE', 'DATEVALUE', 'YEAR', 'MONTH', 'DAY', 'HOUR', 'MINUTE', 'SECOND', 'WEEKDAY', 'WEEKNUM', 'EOMONTH', 'EDATE', 'DATEDIF', 'DAYS', 'TIME',
  // lookup / list / filtered-aggregate
  'SELECT', 'FILTER', 'SUMIF', 'SUMIFS', 'COUNTIF', 'COUNTIFS', 'AVERAGEIF', 'AVERAGEIFS', 'INDEX', 'MATCH', 'LIST', 'IN', 'ANY', 'SORT', 'UNIQUE',
]);

// ── business tables + schema/table maps ─────────────────────────────────────
const dataSets = (app.AppData?.DataSets) || [];
const schemasByName = new Map((app.AppData?.DataSchemas || []).map((s) => [s.Name, s]));
const business = dataSets.filter((ds) => (ds.ProviderName === 'google' || ds.DataSourceName === 'google') && ds.Visibility !== 'NEVER');
const tableToColl = new Map(business.map((ds) => [ds.Name, slug(ds.Name)]));
const schemaToTable = new Map(business.map((ds) => [ds.SchemaName, ds.Name]));
// slice → base table: SELECT()/lookups may target a filtered SLICE (a view of a table) — resolve to its
// base collection (slice RowFilterCondition is NOT re-applied yet → flagged as a fidelity gap).
const sliceToTable = new Map(((app.AppData?.TableSlices) || []).map((sl) => [sl.Name, sl.SourceTable]).filter(([, t]) => t));
const collSlugs = new Set(tableToColl.values());
// resolve a table/slice name (AppSheet is case/diacritic-tolerant, e.g. "Nhân viên" vs "Nhân Viên") → collection slug
const resolveColl = (name) => {
  const n = String(name || '').trim();
  if (tableToColl.has(n)) return tableToColl.get(n);
  if (sliceToTable.has(n) && tableToColl.has(sliceToTable.get(n))) return tableToColl.get(sliceToTable.get(n));
  const sl = slug(n);
  if (collSlugs.has(sl)) return sl;                                              // case/diacritic-insensitive base table
  for (const [sn, base] of sliceToTable) if (slug(sn) === sl && tableToColl.has(base)) return tableToColl.get(base); // slice by slug
  return null;
};

// reverse-ref map: parentTable → Map(childTable → reverse-column-name)  (o2m sources)
const revByParent = new Map();
for (const s of app.AppData?.DataSchemas || []) {
  const parentTable = schemaToTable.get(s.Name); if (!parentTable) continue;
  for (const a of s.Attributes || []) {
    if (a.Type !== 'List') continue;
    const p = a.InternalQualifier?.Properties || {};
    let childTable = p.IsReverseRef ? p.ReferencingTableName : null;
    if (!childTable && a.AppFormula) { const m = String(a.AppFormula).match(/SELECT\(\s*([^\[\(]+?)\s*\[/); if (m) childTable = m[1].trim(); }
    if (childTable && tableToColl.has(childTable)) { if (!revByParent.has(parentTable)) revByParent.set(parentTable, new Map()); revByParent.get(parentTable).set(childTable, a.Name); }
  }
}

// ── build collections ───────────────────────────────────────────────────────
const collections = [];
const sourcePlan = [];
const o2mByColl = new Map();       // collName → [{name, childColl}]
const childRollupName = new Map(); // collName → Map(childTable → o2mRelName)  (for formula roll-ups)
const menuTables = new Set();      // collName of "virtual menu" tables (icon + link-to-view, no real data) → skip page

for (const ds of business) {
  const schema = schemasByName.get(ds.SchemaName); if (!schema) { report.todos.push(`${ds.Name} (no schema)`); continue; }
  const cn = tableToColl.get(ds.Name);
  const docId = (String(ds.Source || '').match(/DocId=([^&;]+)/) || [])[1] || null;
  // Detect audit columns FIRST (a mapped one is NOT emitted as a regular field — it feeds NocoBase's built-in).
  const audit = detectAudit(schema.Attributes || [], cn);
  const auditCols = new Set(Object.values(audit));
  sourcePlan.push({ collection: cn, table: ds.Name, docId, tab: ds.SourceQualifier || ds.Name, ...(Object.keys(audit).length ? { audit } : {}) });

  const fields = [], relations = [], computedDefs = [];
  const usedNames = new Set(['id', 'created_at', 'updated_at']);
  const nameOf = (t) => { let n = slug(t); while (usedNames.has(n)) n += '_x'; usedNames.add(n); return n; };
  // may already exist if a CHILD was processed first (line ~86 seeds the parent's map) — don't clobber it
  const rollup = childRollupName.get(cn) || new Map(); childRollupName.set(cn, rollup);
  let titleField = null;

  for (const attr of schema.Attributes || []) {
    const title = attr.Name; if (SYS.has(title) || title === '_RowNumber') continue;
    if (auditCols.has(title)) continue;   // mapped to a built-in createdAt/updatedAt/createdBy/updatedBy → not a regular field
    const aux = parseAux(attr.TypeAuxData);
    if (attr.IsVirtual && attr.Type === 'List') continue; // reverse-ref → handled as o2m (below)

    // relation (Ref, or Enum/EnumList over Ref)
    const refTable = attr.Type === 'Ref' ? aux.ReferencedTableName : (aux.BaseType === 'Ref' ? parseAux(aux.BaseTypeQualifier).ReferencedTableName : null);
    if (refTable) {
      const target = tableToColl.get(refTable);
      if (!target) { report.todos.push(`${ds.Name}.${title}: Ref → "${refTable}" (not synced) — manual`); continue; }
      const rname = nameOf(title);
      const type = attr.Type === 'EnumList' ? 'm2m' : 'm2o';
      const rel = { name: rname, type, target, title };
      // reverseName from the PARENT's reverse-ref column for (this child table, this FK). The app-builder
      // server (opAddRelation → ensureReverseHasMany) now MATERIALIZES this into a real reverse hasMany on the
      // target (same FK) so the master lists its children. A m2o without a reverse-ref still gets an auto
      // reverse server-side (named after the child) — keep this light; the server auto-reverse is the safety net.
      const revName = revByParent.get(refTable)?.get(ds.Name);
      if (type === 'm2o' && revName) {
        rel.reverseName = slug(revName);
        if (!o2mByColl.has(target)) o2mByColl.set(target, []);
        o2mByColl.get(target).push({ name: rel.reverseName, childColl: cn });
        (childRollupName.get(target) || childRollupName.set(target, new Map()).get(target)).set(ds.Name, rel.reverseName);
        report.o2m++;
      }
      relations.push(rel); report.relations++;
      continue;
    }

    // scalar / enum / attachment
    const iface = TYPE_MAP[attr.Type] || (attr.Type === 'Enum' ? 'select' : attr.Type === 'EnumList' ? 'multipleSelect' : 'input');
    const name = nameOf(title);
    const f = { name, title, interface: iface };
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
    // computed handled after all names known (needs rollup map) → stash
    if (attr.AppFormula) computedDefs.push({ f, formula: attr.AppFormula, virtual: !!attr.IsVirtual });
    report.fields++;
  }

  const coll = { name: cn, title: ds.Name, fields, _computed: computedDefs };
  if (titleField) coll.titleField = titleField;
  if (relations.length) coll.relations = relations;
  collections.push(coll);
  report.collections++;

  // "virtual menu" table (AppSheet trick: a small table of icon + link-to-view rows faking a nav menu) →
  // NocoBase's sidebar already lists every page, so this table needs no data PAGE. Detect: has an image/
  // attachment column + a "view/link/menu/target" column + few columns overall. Collection kept (harmless).
  const realCols = (schema.Attributes || []).filter((a) => a.Name && !SYS.has(a.Name) && a.Name !== '_RowNumber' && !a.IsVirtual);
  const hasImg = realCols.some((a) => a.Type === 'Image' || a.Type === 'Thumbnail' || a.Type === 'File');
  const hasLink = realCols.some((a) => /(^|[\s_])(view|link|menu|target|screen|màn hình|man hinh|điều hướng)([\s_]|$)/i.test(a.Name));
  if (hasImg && hasLink && realCols.length <= 5) { menuTables.add(cn); report.menuTables.push(ds.Name); }
}

// ── formula translation (second pass — o2m names now known) ─────────────────
// AppSheet comparison ops → JS: <> → !=, single = → == (protect <=, >=). `&` (concat) left intact.
function fixOps(s) {
  return s.replace(/<=/g, '\x01').replace(/>=/g, '\x02').replace(/<>/g, '!=').replace(/=/g, '==').replace(/\x01/g, '<=').replace(/\x02/g, '>=');
}
// split a string by top-level commas (respecting parens)
function splitTop(s) {
  const out = []; let d = 0, cur = '';
  for (const ch of s) { if (ch === '(') d++; else if (ch === ')') d--; if (ch === ',' && d === 0) { out.push(cur); cur = ''; } else cur += ch; }
  if (cur.trim() !== '') out.push(cur);
  return out;
}
// AND(a,b,…)/OR(a,b,…) → (a && b …); drop TRUE terms; recurse into nested logical groups.
function unwrapLogical(s) {
  s = s.trim();
  const m = s.match(/^(AND|OR)\(([\s\S]*)\)$/i);
  if (!m) return s;
  const op = m[1].toUpperCase() === 'AND' ? ' && ' : ' || ';
  const parts = splitTop(m[2]).map((p) => unwrapLogical(p).trim()).filter((p) => p && !/^true$/i.test(p));
  return parts.length === 1 ? parts[0] : '(' + parts.join(op) + ')';
}
// A bare same-row reference `[X]` (via [_THISROW].[X] or plain [X]) translates to `data.<x>` — but if `X` is
// itself a RELATION field on `coll`, the engine's `data.<x>` is the whole associated OBJECT (so `.field`
// derefs work), NOT a scalar. Used bare (compared/passed as a value), that's always wrong — append `.id`.
const relOf = (coll, name) => (coll?.relations || []).find((r) => r.name === name);
function sameRowRef(coll, x) {
  const n = slug(x);
  return relOf(coll, n) ? `data.${n}.id` : `data.${n}`;
}
// translate a SELECT condition: [_THISROW].[X] → data.x (or data.x.id if X is coll's OWN relation) ;
// bare [X] → <child>.x ; [X].[Y] → <child>.x.y
function transCond(cond, childSlug, coll) {
  let s = unwrapLogical(cond.trim());
  s = s.replace(/\[_THISROW\]\.\[([^\]]+)\]/g, (_, x) => sameRowRef(coll, x));
  s = s.replace(/\[([^\]]+)\]\.\[([^\]]+)\]/g, (_, a, b) => `${childSlug}.${slug(a)}.${slug(b)}`);
  s = s.replace(/\[([^\]]+)\]/g, (_, x) => `${childSlug}.${slug(x)}`);
  // AppSheet Refs compare by business KEY; NocoBase must compare the FOREIGN KEY, not the relation object.
  // A m2o back to the CURRENT collection: `child.<rel> == data.<x>` → `child.<rel>_id == data.id` (FK == PK).
  const childSpec = collections.find((c) => c.name === childSlug);
  for (const r of (childSpec?.relations || [])) {
    if ((r.type !== 'm2o' && r.type !== 'o2o') || r.target !== (coll && coll.name)) continue;
    const fk = `${childSlug}.${r.name}_id`;
    s = s.replace(new RegExp(`\\b${childSlug}\\.${r.name}\\b\\s*(==?|!=|<>)\\s*data\\.[A-Za-z0-9_.]+`, 'g'), `${fk} $1 data.id`);   // rel == data.x
    s = s.replace(new RegExp(`data\\.[A-Za-z0-9_.]+\\s*(==?|!=|<>)\\s*\\b${childSlug}\\.${r.name}\\b`, 'g'), `data.id $1 ${fk}`);   // data.x == rel (reversed)
  }
  return s; // ops normalized once by translate()'s global fixOps (avoid double = → ====)
}
// A SELECT/LOOKUP that RETURNS a Ref (relation) column must yield the FK (…_id), NOT the relation itself:
// `SELECT(t.<ref>, …)` auto-plucks the lookup table's unloaded relation → empty `{}`. The FK form
// `INDEX(SELECT(t.<ref>_id, …), 1)` yields the id, which the computed engine writes straight into the target
// relation's own FK. Kept in sync with the plugin's appsheetImport.ts + formulaKnowledge.ts.
const retFk = (collName, colSlug) => {
  const spec = collections.find((c) => c.name === collName);
  return relOf(spec, colSlug) ? `${colSlug}_id` : colSlug;
};
// translate EVERY AppSheet `SELECT(Table[col], cond)` / `Select(Slice[col], …)` → `SELECT(<coll>.<col>, <cond>)`,
// under ANY wrapper (SUM/INDEX/COUNT/MAX/bare) and tolerant of whitespace/newlines, case, and spaces/diacritics
// in table & slice names. Balanced-paren scan; the `<child>.fk == data.key` conjunct is what the engine indexes.
function translateSelects(s, coll) {
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
    const parts = splitTop(s.slice(argStart, k - 1));   // [ "Table[col]", "<cond...>" ]
    const head = parts.shift() || '';
    const cond = parts.join(',');
    const hm = head.match(/^\s*([\s\S]+?)\s*\[\s*([^\]]+?)\s*\]\s*$/);   // Table[col] — name may hold spaces
    if (!hm) { out += s.slice(m.index, k); i = k; continue; }            // already NocoBase-form (e.g. from LOOKUP) → pass through
    const childColl = resolveColl(hm[1]);
    if (!childColl) throw { flag: `SELECT table "${hm[1].trim()}" not a synced collection` };
    out += `SELECT(${childColl}.${retFk(childColl, slug(hm[2]))}, ${transCond(cond, childColl, coll)})`;
    i = k;
    if (++guard > 300) throw { flag: 'SELECT loop' };
  }
}
// LOOKUP(value, Table, keyCol, retCol) → INDEX(SELECT(<coll>.<ret>, <coll>.<key> = value), 1)  (APPSHEET-TO-FORMULA §2).
// SPECIAL CASE (preferred whenever it applies): if `value` is bare `[_THISROW].[X]`/`[X]` and X is a relation
// ON `coll` that ALREADY points at the LOOKUP's target table, that relation was resolved and linked at IMPORT
// time — re-matching it here by AppSheet's business key is redundant AND fragile (that key may not even be
// the field it looks like: AppSheet's "ID" column collides with NocoBase's own `id` PK and gets renamed to
// `id_x` by the converter, so a naive `slug("ID")` → "id" silently binds to the wrong field — the system PK
// — instead of throwing). Skip all of that: just deref the relation directly, `data.<rel>.<retCol>`.
function translateLookups(s, coll) {
  const re = /\bLOOKUP\s*\(/gi;
  let out = '', i = 0, guard = 0;
  const bare = (x) => String(x).trim().replace(/^\s*\[?\s*|\s*\]?\s*$/g, '').replace(/^["']|["']$/g, '');
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
    const rel = directM && relOf(coll, slug(directM[1] || directM[2]));
    if (rel && rel.target === targetColl) { out += `data.${rel.name}.${slug(bare(parts[3]))}`; i = k; if (++guard > 300) throw { flag: 'LOOKUP loop' }; continue; }
    const val = translateLookups(rawVal, coll);                              // nested LOOKUP inside the value
    out += `INDEX(SELECT(${targetColl}.${retFk(targetColl, slug(bare(parts[3])))}, ${targetColl}.${slug(bare(parts[2]))} = ${val}), 1)`;
    i = k;
    if (++guard > 300) throw { flag: 'LOOKUP loop' };
  }
}
function translate(f, coll) {
  let s = String(f).trim().replace(/^=/, '');
  s = translateLookups(s, coll);                                              // LOOKUP(…) → direct deref or INDEX(SELECT(…),1)
  s = translateSelects(s, coll);                                              // every SELECT(Table[col], cond)
  // 2+ level deref chain [A].[B].[C] — engine loads only 1 hop → flag (§3.5 flatten per-hop)
  if (/\][.]\s*\[[^\]]+\]\s*[.]\s*\[/.test(s.replace(/\[_THISROW\]/g, 'data'))) throw { flag: 'deref 2+ levels' };
  s = s.replace(/\[([^\]]+)\]\s*\[([^\]]+)\]/g, (_, a, b) => `data.${slug(a)}.${slug(b)}`); // [Related X][Col] → o2m roll-up
  s = s.replace(/\[_THISROW\]\.\[([^\]]+)\]/g, (_, x) => sameRowRef(coll, x));                // [_THISROW].[X]
  s = s.replace(/\[([^\]]+)\]\.\[([^\]]+)\]/g, (_, a, b) => `data.${slug(a)}.${slug(b)}`);   // lookup [A].[B]
  s = s.replace(/\[([^\]]+)\]/g, (_, x) => sameRowRef(coll, x));                            // same-row [X]
  s = fixOps(s);                                                                            // = → == , <> → !=
  if (/[\[\]]|_THISROW|REF_ROWS|LOOKUP|USER(SETTINGS|EMAIL|NAME)/i.test(s)) throw { flag: 'unresolved (relation/user fn)' };
  const bad = [...s.matchAll(/([A-Za-z][A-Za-z0-9_]+)\s*\(/g)].map((m) => m[1]).filter((fn) => fn === fn.toUpperCase()).find((fn) => !SAFE_FN.has(fn));
  if (bad) throw { flag: `unsafe fn ${bad}` };
  return s;
}
for (const coll of collections) {
  for (const { f, formula, virtual } of coll._computed) {
    // AppSheet virtual col (recomputed on read) → 'display'; stored col w/ app-formula → 'stored' (recompute on write)
    try { const expr = translate(formula, coll); f.computed = { expression: expr, kind: virtual ? 'display' : 'stored' }; report.computedOk.push(`${coll.name}.${f.name} [${virtual ? 'display' : 'stored'}] = ${expr}`); }
    catch (e) { report.computedFlag.push(`${coll.name}.${f.name} ⚠ ${e.flag || e.message}: ${String(formula).replace(/\s+/g, ' ').slice(0, 70)}`); }
  }
  delete coll._computed;
}

// ── pages (ONE per AppSheet MENU view — preserves multiple views/table with different column sets) ──
const controls = (app.Presentation?.Controls) || [];
const validCols = (cn) => { const c = collections.find((x) => x.name === cn); return new Set([...(c?.fields || []).map((f) => f.name), ...(c?.relations || []).map((r) => r.name), ...(o2mByColl.get(cn) || []).map((o) => o.name), 'id', 'created_at', 'updated_at']); };
const sliceByName = new Map(((app.AppData?.TableSlices) || []).map((s) => [s.Name, s]));   // Name → slice (for FilterCondition / data scope, Part A)
const collByName = new Map(collections.map((c) => [c.name, c]));
const PRIMARY = new Set(['center', 'left', 'left most', 'right']);   // AppSheet "Primary navigation"
const cleanTitle = (n) => String(n || '').replace(/_(Slice|Dashboard|Deck|Detail|Form|Table)(_Mobile)?$/i, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
const defaultCols = (coll) => [...new Set([coll.titleField, ...coll.fields.map((f) => f.name), ...(coll.relations || []).map((r) => r.name)].filter(Boolean))].filter((x) => validCols(coll.name).has(x));
// AppSheet slice FilterCondition → NocoBase block data scope. Static `[f]=val` / `IN([f],LIST(..))` (AND-combined)
// → filter items; per-user (USERSETTINGS/USEREMAIL) → null + Phase-D ACL flag; config/relation lookup → null.
function translateSliceFilter(slice, coll, valid) {
  const raw = slice && slice.FilterCondition ? String(slice.FilterCondition).trim().replace(/^=/, '') : '';
  if (!raw || /^true\(?\)?$/i.test(raw)) return null;
  if (/USERSETTINGS|USEREMAIL|USERNAME/i.test(raw)) { report.sliceAcl.push(`${coll} ← ${slice.Name}`); return null; }
  if (/SELECT\(|LOOKUP\(|\bFILTER\b|ANY\(/i.test(raw)) { report.sliceComplex.push(`${coll} ← ${slice.Name}`); return null; }
  const am = raw.match(/^AND\(([\s\S]*)\)$/i);
  const parts = am ? splitTop(am[1]) : [raw];
  const opMap = { '=': '$eq', '<>': '$ne', '>': '$gt', '<': '$lt', '>=': '$gte', '<=': '$lte' };
  const items = [];
  for (let p of parts) {
    p = p.trim(); if (!p || /^true\(?\)?$/i.test(p)) continue;
    let m;
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
}
const pages = [];
const coveredColls = new Set();
const seenKey = new Set();       // dedup identical views (same coll + same columns)
const usedTitles = new Set();    // NocoBase materialize dedups pages by title → keep titles unique
const uniqTitle = (t) => { let u = t || 'Trang', i = 2; while (usedTitles.has(u)) u = `${t} (${i++})`; usedTitles.add(u); return u; };
for (const c of controls) {
  if (!['table', 'deck', 'card'].includes(c.Action)) continue;
  if (!PRIMARY.has(c.Position) && c.Position !== 'menu') continue;              // only sidebar-level views → pages
  const coll = resolveColl(c.TableOrFolderName); if (!coll || menuTables.has(coll)) continue;
  const collObj = collByName.get(coll); if (!collObj) continue;
  const valid = validCols(coll);
  let st = {}; try { st = JSON.parse(c.Settings || '{}'); } catch {}
  let columns = (st.ColumnOrder || []).map(slug).filter((x) => valid.has(x));
  if (!columns.length) columns = defaultCols(collObj);
  const key = coll + '|' + columns.join(',');
  if (seenKey.has(key)) continue; seenKey.add(key);
  const o2mNames = (o2mByColl.get(coll) || []).map((o) => o.name);
  const popupColumns = [...new Set([...columns, ...o2mNames])].filter((x) => valid.has(x));
  const icon = faToLucide(st.Icon); if (icon) report.pagesIconized++;
  const menuGroup = PRIMARY.has(c.Position) ? 'Chính' : 'Menu';
  const page = { title: uniqTitle(cleanTitle(c.Name) || collObj.title || coll), collection: coll, ...(icon ? { icon } : {}), menuGroup, columns, popupColumns };
  // Part A: static slice filter → block data scope (user-based/complex → flagged for Phase D ACL)
  const scope = translateSliceFilter(sliceByName.get(c.TableOrFolderName), coll, valid);
  if (scope) page.dataScope = scope;
  pages.push(page); coveredColls.add(coll);
}
// collections with NO menu view → a default page (config/lookup tables) so their data stays reachable
for (const coll of collections) {
  if (coveredColls.has(coll.name) || menuTables.has(coll.name)) continue;
  const columns = defaultCols(coll);
  const o2mNames = (o2mByColl.get(coll.name) || []).map((o) => o.name);
  const popupColumns = [...new Set([...columns, ...o2mNames])].filter((x) => validCols(coll.name).has(x));
  pages.push({ title: uniqTitle(coll.title), collection: coll.name, menuGroup: 'Danh mục / Cấu hình', columns, popupColumns });
}

// ── dashboards (AppSheet chart views → App-Spec DashboardSpec[]) ─────────────
// chart ViewDefinition = { ChartType, ChartColumns:[dim], GroupAggregate:"FN :: measure" }.
// Group charts by their base collection → one dashboard page each (feeds app-builder createDashboard()).
const collTitleOf = new Map(collections.map((c) => [c.name, c.title]));
const chartsByColl = new Map();
for (const c of controls) {
  if (c.Action !== 'chart') continue;
  let vd = c.ViewDefinition; if (typeof vd === 'string') { try { vd = JSON.parse(vd); } catch { vd = null; } }
  if (!vd) continue;
  const coll = resolveColl(String(c.TableOrFolderName || '').replace(/_(Dashboard|Slice|Deck|Detail|Form|Chart)$/i, '')) || resolveColl(c.TableOrFolderName);
  if (!coll) { report.viewsSkipped.push(`chart "${c.Name}" (bảng "${c.TableOrFolderName}" chưa map)`); continue; }
  const valid = validCols(coll);
  const dim = (vd.ChartColumns || [])[0] ? slug(vd.ChartColumns[0]) : null;
  if (!dim || !valid.has(dim)) { report.viewsSkipped.push(`chart "${c.Name}" (dimension chưa có)`); continue; }
  const [fnRaw, measRaw] = String(vd.GroupAggregate || 'NONE').split('::').map((x) => x.trim());
  const fn = (fnRaw || '').toUpperCase();
  let measure = { field: 'id', aggregation: 'count' };                       // COUNT / NONE → count records per dimension
  if (fn === 'SUM' && measRaw && valid.has(slug(measRaw))) measure = { field: slug(measRaw), aggregation: 'sum' };
  else if (fn === 'AVERAGE' && measRaw && valid.has(slug(measRaw))) measure = { field: slug(measRaw), aggregation: 'avg' };
  const chartType = /Histogram|Bar|Column/i.test(vd.ChartType) ? 'bar' : /Line/i.test(vd.ChartType) ? 'line' : 'pie';
  const title = String(c.Name || '').replace(/_(Dashboard|Slice)$/i, '').trim();
  if (!chartsByColl.has(coll)) chartsByColl.set(coll, []);
  chartsByColl.get(coll).push({ kind: 'chart', title, chartType, dimension: { field: dim }, measure }); // kind required by createDashboard
}
const dashboards = [...chartsByColl].map(([coll, widgets]) => ({ title: `${collTitleOf.get(coll) || coll} — Phân tích`, collection: coll, icon: 'lucide-chart-pie', menuGroup: 'Menu', widgets }));
report.dashboards = dashboards.length;
report.dashCharts = dashboards.reduce((n, d) => n + d.widgets.length, 0);

// ── validate + emit ─────────────────────────────────────────────────────────
const IFACES = new Set(['input', 'textarea', 'markdown', 'richText', 'phone', 'email', 'url', 'uuid', 'nanoid', 'password', 'number', 'integer', 'percent', 'select', 'multipleSelect', 'radioGroup', 'checkbox', 'checkboxGroup', 'boolean', 'date', 'datetime', 'time', 'color', 'icon', 'json', 'statusFlow']);
const OPT = new Set(['select', 'multipleSelect', 'radioGroup', 'checkboxGroup']);
const cset = new Set(collections.map((c) => c.name));
const vErr = [];
for (const c of collections) {
  for (const f of c.fields) { if (!IFACES.has(f.interface)) vErr.push(`${c.name}.${f.name}: bad interface "${f.interface}"`); if (OPT.has(f.interface) && !(f.options && f.options.length)) vErr.push(`${c.name}.${f.name}: ${f.interface} without options`); }
  for (const r of c.relations || []) if (!cset.has(r.target)) vErr.push(`${c.name}.${r.name}: relation → missing "${r.target}"`);
}
for (const p of pages) { const valid = validCols(p.collection); for (const col of p.columns) if (!valid.has(col)) vErr.push(`page "${p.title}": col "${col}" not in "${p.collection}"`); }

const spec = { meta: { name: slug(app.ShortName), title: app.ShortName, locale: 'vi' }, collections, pages, ...(dashboards.length ? { dashboards } : {}), menu: { groups: [{ label: 'Chính' }, { label: 'Menu' }, { label: 'Danh mục / Cấu hình' }] } };
fs.writeFileSync(`${outPrefix}.appspec.json`, JSON.stringify(spec, null, 2));
fs.writeFileSync(`${outPrefix}.sourceplan.json`, JSON.stringify(sourcePlan, null, 2));

const L = (s) => console.log(s);
L(`\n=== ${app.ShortName} → App-Spec ===`);
L(`collections: ${report.collections}  fields: ${report.fields}  m2o: ${report.relations - report.o2m}  o2m: ${report.o2m}  computed: ${report.computedOk.length}✓ ${report.computedFlag.length}⚠  static-enums: ${report.staticEnums}  pages: ${pages.length} (icon: ${report.pagesIconized})  dashboards: ${report.dashboards} (${report.dashCharts} charts)`);
if (report.auditMapped.length) L(`\n🕒 cột audit → built-in (giữ ngày/người tạo·sửa thật): ${report.auditMapped.join(', ')}`);
if (report.auditGuessed.length) L(`\n⚠ cột audit ĐOÁN theo tên (nên rà lại): ${report.auditGuessed.join(', ')}`);
if (report.auditUnmapped.length) L(`\n⚠ cột giống audit nhưng KHÔNG map (sẽ dùng giờ import): ${report.auditUnmapped.join(', ')}`);
if (report.menuTables.length) L(`\n🔲 menu ảo (bỏ trang, để sidebar tự làm nav): ${report.menuTables.join(', ')}`);
if (report.sliceScoped.length) L(`\n🔎 data scope tĩnh (áp filter cho trang): ${report.sliceScoped.join(', ')}`);
if (report.sliceAcl.length) L(`\n🔐 slice per-user → cần ACL role (Phase D, chưa áp): ${report.sliceAcl.length} — ${report.sliceAcl.slice(0, 6).join(', ')}${report.sliceAcl.length > 6 ? ' …' : ''}`);
if (report.sliceComplex.length) L(`\n⚠ slice filter phức tạp (bỏ qua): ${report.sliceComplex.length}`);
if (report.computedOk.length) { L(`\n✅ công thức DỊCH được:`); report.computedOk.forEach((c) => L('  ' + c)); }
if (report.computedFlag.length) { L(`\n⚠ công thức GẮN CỜ (giữ giá trị tĩnh):`); report.computedFlag.forEach((c) => L('  ' + c)); }
if (report.dynamicEnums.length) L(`\n⚠ enum động (input tự do): ${report.dynamicEnums.join(', ')}`);
if (report.attachments.length) L(`\n⚠ đính kèm (text path): ${report.attachments.join(', ')}`);
L(`\nvalidate: ${vErr.length ? '❌ ' + vErr.length + ':' : '✅ PASS'}`); vErr.forEach((e) => L('  • ' + e));
L(`\nwrote: ${outPrefix}.appspec.json  +  ${outPrefix}.sourceplan.json`);
