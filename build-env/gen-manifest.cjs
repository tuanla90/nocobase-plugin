#!/usr/bin/env node
/**
 * Regenerate latest/index.json — the manifest the @ptdl/plugin-hub reads. One entry per tgz in
 * latest/@ptdl/, mapping packageName + version → its raw-GitHub download URL (+ displayName from the
 * plugin's package.json). Run after every rebuild that refreshes latest/. Public-repo URL is fixed.
 *
 *   node build-env/gen-manifest.cjs
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'latest', '@ptdl');
const BASE = 'https://raw.githubusercontent.com/tuanla90/nocobase-plugin/main/latest/@ptdl/';

const plugins = [];
for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.tgz')).sort()) {
  const r = f.replace(/^plugin-/, '').replace(/\.tgz$/, '');
  const m = r.match(/^(.*?)-(\d.*)$/);
  const slug = m ? m[1] : r;
  const version = m ? m[2] : '0.0.0';
  const packageName = '@ptdl/plugin-' + slug;
  let displayName = slug;
  try {
    const p = JSON.parse(fs.readFileSync(path.join(ROOT, 'packages', '@ptdl', 'plugin-' + slug, 'package.json'), 'utf8'));
    displayName = p.displayName || slug;
  } catch { /* keep slug */ }
  plugins.push({ packageName, slug, version, displayName, url: BASE + f });
}

const manifest = { source: '@ptdl/nocobase-plugin', updatedAt: null, count: plugins.length, plugins };
fs.writeFileSync(path.join(ROOT, 'latest', 'index.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('latest/index.json:', plugins.length, 'plugins');
