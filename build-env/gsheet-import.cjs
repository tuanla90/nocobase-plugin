#!/usr/bin/env node
/*
 * gsheet-import.cjs — one-off importer: pull each Google-Sheet tab (public) and
 * load rows into the matching NocoBase collection via the REST API, resolving
 * AppSheet-style Ref relations by the target's business key.
 *
 * Usage:
 *   DOC_ID=<sheetId> node build-env/gsheet-import.cjs <appspec.json> <sourceplan.json> [--dry-run]
 *   token read from build-env/.nb-token ; base http://localhost:13000/api
 *
 * Import order is topological (parents before children) so m2o relations can be
 * linked by the parent's key → NocoBase id.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');

const [specФ, planФ] = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const DRY = process.argv.includes('--dry-run');
const DOC_ID = process.env.DOC_ID;
const BASE = process.env.NB_BASE || 'http://localhost:13000/api';
const TOKEN = (fs.existsSync(path.join(__dirname, '.nb-token')) ? fs.readFileSync(path.join(__dirname, '.nb-token'), 'utf8').trim() : '');
const planHasDocs = (() => { try { return JSON.parse(fs.readFileSync(planФ, 'utf8')).some((p) => p.docId); } catch { return false; } })();
if (!specФ || !planФ || (!DOC_ID && !planHasDocs)) { console.error('usage: DOC_ID=.. node gsheet-import.cjs <appspec.json> <sourceplan.json> [--dry-run]  (DOC_ID optional if sourceplan carries per-table docId)'); process.exit(1); }

const spec = JSON.parse(fs.readFileSync(specФ, 'utf8'));
const plan = JSON.parse(fs.readFileSync(planФ, 'utf8'));
const tabByColl = new Map(plan.map((p) => [p.collection, p.tab]));
const docByColl = new Map(plan.map((p) => [p.collection, p.docId || DOC_ID]));   // per-table sheet (safaco spans 2 docs)
const collByName = new Map(spec.collections.map((c) => [c.name, c]));
const slug = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^([0-9])/, 'c$1').toLowerCase();

// key field per collection = the unique/IsKey field (fallback titleField)
const keyFieldOf = (c) => (c.fields.find((f) => f.unique) || {}).name || c.titleField || null;

// ── topological order by m2o relations ──────────────────────────────────────
function order() {
  const names = spec.collections.map((c) => c.name);
  const deps = new Map(names.map((n) => [n, new Set()]));
  for (const c of spec.collections) for (const r of c.relations || []) if (r.type === 'm2o' && r.target !== c.name && collByName.has(r.target)) deps.get(c.name).add(r.target);
  const out = [], seen = new Set();
  const visit = (n, stack = new Set()) => {
    if (seen.has(n) || stack.has(n)) return; stack.add(n);
    for (const d of deps.get(n)) visit(d, stack);
    seen.add(n); out.push(n);
  };
  names.forEach((n) => visit(n));
  return out;
}

// ── minimal RFC-4180 CSV parser ─────────────────────────────────────────────
function parseCSV(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (ch === '\r') { /* skip */ }
    else cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

const httpReq = (method, url, body) => new Promise((res, rej) => {
  const u = new URL(url);
  const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, method, headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' } }, (r) => {
    let d = ''; r.on('data', (c) => d += c); r.on('end', () => res({ status: r.statusCode, body: d }));
  });
  req.on('error', rej); if (body) req.write(JSON.stringify(body)); req.end();
});

const fetchCSV = (tab, docId) => new Promise((res, rej) => {
  const url = `https://docs.google.com/spreadsheets/d/${docId || DOC_ID}/gviz/tq?tqx=out:csv&headers=1&sheet=${encodeURIComponent(tab)}`;
  require('https').get(url, (r) => {
    if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) { require('https').get(r.headers.location, (r2) => { let d = ''; r2.on('data', (c) => d += c); r2.on('end', () => res(d)); }).on('error', rej); return; }
    let d = ''; r.on('data', (c) => d += c); r.on('end', () => res(d));
  }).on('error', rej);
});

// ── run ─────────────────────────────────────────────────────────────────────
(async () => {
  const ord = order();
  console.log(`${DRY ? '[DRY RUN] ' : ''}import ${ord.length} collections (order: ${ord.join(' → ')})\n`);
  const keymap = new Map(); // collection → Map(keyValue → nocobaseId)

  for (const cn of ord) {
    const c = collByName.get(cn); const tab = tabByColl.get(cn);
    const kf = keyFieldOf(c);
    let rowsRaw; try { rowsRaw = parseCSV(await fetchCSV(tab, docByColl.get(cn))); } catch (e) { console.log(`  ${cn}: (fetch lỗi — sheet chưa public?)`); continue; }
    if (rowsRaw.length && /^<!DOCTYPE|^<html/i.test(String(rowsRaw[0]?.[0] || '').trim())) { console.log(`  ${cn}: ⚠ sheet CHƯA PUBLIC (nhận HTML, không phải CSV) — bỏ qua`); continue; }
    if (!rowsRaw.length) { console.log(`  ${cn}: (empty tab "${tab}")`); continue; }
    const header = rowsRaw[0].map((h) => h.trim());
    const dataRows = rowsRaw.slice(1).filter((r) => r.some((v) => v !== ''));
    const hIndex = new Map(header.map((h, i) => [slug(h), i]));
    const hRaw = new Map(header.map((h, i) => [h.trim(), i]));   // by original header — for collision-renamed fields (AppSheet "ID" → NocoBase field "id_x")

    // build field/relation → csv column index (by slug(name), else by original title)
    const colOf = (fr) => { const a = hIndex.get(fr.name); if (a != null) return a; return hRaw.get(String(fr.title || '').trim()); };
    const fmap = c.fields.map((f) => ({ f, i: colOf(f) })).filter((x) => x.i != null);
    const rmap = (c.relations || []).filter((r) => r.type === 'm2o').map((r) => ({ r, i: colOf(r) })).filter((x) => x.i != null);
    const missing = header.filter((h) => !c.fields.some((f) => f.name === slug(h) || String(f.title || '').trim() === h) && !(c.relations || []).some((r) => r.name === slug(h) || String(r.title || '').trim() === h));

    let relOk = 0, relMiss = 0;
    const km = new Map(); keymap.set(cn, km);
    let posted = 0, failed = 0;

    for (const r of dataRows) {
      const rec = {};
      for (const { f, i } of fmap) {
        let v = r[i];
        if (v === '' || v == null) continue;
        if (f.interface === 'number' || f.interface === 'integer' || f.interface === 'percent') { const n = Number(String(v).replace(/,/g, '')); if (!Number.isNaN(n)) v = n; }
        else if (f.interface === 'boolean') v = /^(true|1|yes|có|x)$/i.test(v);
        else if (f.interface === 'multipleSelect' || f.interface === 'checkboxGroup') { v = String(v).split(/\s*,\s*/).map((x) => x.trim()).filter(Boolean); }   // AppSheet EnumList = comma-separated → array
        rec[f.name] = v;
      }
      for (const { r: rel, i } of rmap) {
        const keyVal = r[i]; if (!keyVal) continue;
        const targetId = keymap.get(rel.target)?.get(keyVal);
        if (targetId) { rec[rel.name] = { id: targetId }; relOk++; } else relMiss++;
      }
      const kfCol = kf ? colOf(c.fields.find((f) => f.name === kf) || { name: kf, title: kf }) : null;   // key col via same title-fallback (ID→id_x)
      const keyVal = kfCol != null ? r[kfCol] : null;
      if (!DRY) {
        const resp = await httpReq('POST', `${BASE}/${cn}:create`, rec);
        if (resp.status >= 200 && resp.status < 300) { posted++; const id = (() => { try { return JSON.parse(resp.body).data?.id; } catch { return null; } })(); if (keyVal != null && id != null) km.set(keyVal, id); }
        else { failed++; if (failed <= 2) console.log(`    POST ${cn} failed ${resp.status}: ${resp.body.slice(0, 120)}`); }
      } else if (keyVal != null) km.set(keyVal, `dry-${km.size + 1}`);
    }

    console.log(`  ${cn.padEnd(30)} tab "${tab}"  rows=${dataRows.length}  fields=${fmap.length}/${c.fields.length}  rel(m2o)=${rmap.length} linked=${relOk}${relMiss ? ' miss=' + relMiss : ''}${DRY ? '' : `  posted=${posted}${failed ? ' FAILED=' + failed : ''}`}`);
    if (missing.length) console.log(`      · sheet cols not mapped: ${missing.join(', ')}`);
  }
  console.log(`\n${DRY ? 'dry-run done — rerun without --dry-run to POST' : 'import done'}`);
})();
