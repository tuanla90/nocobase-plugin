#!/usr/bin/env node
/*
 * publish-ghp.cjs — Publish the @ptdl plugin tarballs to GitHub Packages under
 * the @tuanla90 scope, WITHOUT touching source, recipes or the build.
 *
 * Why a rewrite step? GitHub Packages requires the npm scope to equal the GitHub
 * owner. `@ptdl` is taken by someone else, so packages must ship as `@tuanla90/*`.
 * Instead of renaming 31 packages + 31 recipes (name==folder is assumed all over
 * the build), we keep the workspace as `@ptdl` and only rewrite the name INSIDE
 * each .tgz at publish time. Same published result, zero build risk.
 *
 * Usage (run from the repo root; the actual token stays in YOUR shell env):
 *   # dry run — transform + repack every tgz, print what would publish, no token:
 *   DRY_RUN=1 node build-env/publish-ghp.cjs
 *
 *   # publish ONE plugin (recommended first real publish, to validate the token):
 *   GITHUB_TOKEN=ghp_xxx node build-env/publish-ghp.cjs field-order
 *
 *   # publish everything in latest/@ptdl:
 *   GITHUB_TOKEN=ghp_xxx node build-env/publish-ghp.cjs
 *
 * Env:
 *   GITHUB_TOKEN  required unless DRY_RUN — a PAT (classic) with `write:packages`
 *                 (+ read:packages) owned by GitHub user `tuanla90`.
 *   DRY_RUN=1     do everything except `npm publish`.
 *   GHP_REGISTRY  default https://npm.pkg.github.com
 *   FROM_SCOPE    default @ptdl        (scope inside your tarballs)
 *   TO_SCOPE      default @tuanla90    (scope to publish under = your GitHub login)
 *   SRC_DIR       default <repo>/latest/@ptdl
 *
 * Notes:
 *   - GitHub Packages (like npmjs) refuses to overwrite an already-published
 *     version. To release a change you MUST bump the plugin version first — the
 *     script reports "already published" as a skip, not a failure.
 *   - The token is written only to a temp .npmrc (mode 600) and deleted on exit;
 *     it is never printed and never passed on the command line.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const BUILD_ENV = __dirname;
const REPO = path.resolve(BUILD_ENV, '..');
const tar = require(path.join(BUILD_ENV, 'node_modules', 'tar'));

const REGISTRY = process.env.GHP_REGISTRY || 'https://npm.pkg.github.com';
const FROM = process.env.FROM_SCOPE || '@ptdl';
const TO = process.env.TO_SCOPE || '@tuanla90';
const DRY = process.env.DRY_RUN === '1' || process.argv.includes('--dry-run');
const SRC_DIR = process.env.SRC_DIR || path.join(REPO, 'latest', '@ptdl');
const filter = process.argv.slice(2).find((a) => !a.startsWith('-')) || '';
const TOKEN_PLACEHOLDER = 'PASTE_YOUR_GITHUB_TOKEN_HERE';
let TOKEN = process.env.GITHUB_TOKEN || '';
if (!TOKEN) {
  // Friendly fallback: read the token from build-env/.ghp-token (gitignored) so you
  // never have to fight shell env-var syntax (PowerShell vs bash differ).
  const tokFile = path.join(BUILD_ENV, '.ghp-token');
  if (fs.existsSync(tokFile)) TOKEN = fs.readFileSync(tokFile, 'utf8').trim();
  if (TOKEN === TOKEN_PLACEHOLDER) TOKEN = ''; // file exists but token not pasted yet
}
const registryHost = REGISTRY.replace(/^https?:\/\//, '').replace(/\/$/, '');

if (!DRY && !TOKEN) {
  console.error(
    'ERROR: chưa thấy token.\n' +
      '  Cách dễ nhất: dán PUBLISH token (PAT có quyền write:packages) vào file:\n' +
      '      build-env/.ghp-token        (1 dòng, đã được gitignore)\n' +
      '  Hoặc đặt biến môi trường GITHUB_TOKEN, hoặc chạy DRY_RUN=1 để thử không publish.',
  );
  process.exit(1);
}
if (!fs.existsSync(SRC_DIR)) {
  console.error('ERROR: source dir not found: ' + SRC_DIR);
  process.exit(1);
}

const tgzs = fs
  .readdirSync(SRC_DIR)
  .filter((f) => f.endsWith('.tgz') && (!filter || f.includes(filter)))
  .sort();
if (!tgzs.length) {
  console.error(`No .tgz matched in ${SRC_DIR}${filter ? ` (filter="${filter}")` : ''}`);
  process.exit(1);
}

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'ghp-'));
const results = { published: [], skipped: [], failed: [] };

function cleanup() {
  try { fs.rmSync(work, { recursive: true, force: true }); } catch (_) {}
}
process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(130); });

try {
  let userconfig = '';
  if (!DRY) {
    userconfig = path.join(work, 'auth.npmrc');
    fs.writeFileSync(
      userconfig,
      `${TO}:registry=${REGISTRY}\n` + `//${registryHost}/:_authToken=${TOKEN}\n`,
      { mode: 0o600 },
    );
  }

  console.log(`${DRY ? '[DRY RUN] ' : ''}publishing ${tgzs.length} package(s) ${FROM}/* -> ${TO}/* @ ${REGISTRY}\n`);

  for (const file of tgzs) {
    const src = path.join(SRC_DIR, file);
    const ex = fs.mkdtempSync(path.join(work, 'ex-'));
    try {
      // nocobase-build tarballs are FLAT (files at the root). npm/GitHub Packages
      // require a `package/` root, so extract INTO ex/package/ and repack that.
      const pkgRoot = path.join(ex, 'package');
      fs.mkdirSync(pkgRoot, { recursive: true });
      tar.x({ file: src, cwd: pkgRoot, sync: true });
      const pjPath = path.join(pkgRoot, 'package.json');
      const pj = JSON.parse(fs.readFileSync(pjPath, 'utf8'));
      const origName = String(pj.name || '');
      if (!origName.startsWith(FROM + '/')) {
        console.log(`skip  ${file} — name "${origName}" is not under ${FROM}/`);
        results.skipped.push(`${file} (scope ${origName})`);
        continue;
      }
      const newName = `${TO}/${origName.slice(FROM.length + 1)}`;
      pj.name = newName;
      pj.publishConfig = Object.assign({}, pj.publishConfig, { registry: REGISTRY });
      fs.writeFileSync(pjPath, JSON.stringify(pj, null, 2) + '\n');

      const outTgz = path.join(work, `${newName.replace('@', '').replace('/', '-')}-${pj.version}.tgz`);
      tar.c({ gzip: true, file: outTgz, cwd: ex, sync: true, portable: true }, ['package']);

      const label = `${newName}@${pj.version}`;
      if (DRY) {
        console.log(`DRY   would publish ${label}   (from ${file})`);
        results.published.push(label + ' [dry]');
        continue;
      }
      try {
        // --tag latest: also makes prerelease versions (e.g. 2.1.0-beta.x) installable
        // by bare name — npm otherwise refuses to publish a prerelease without a tag.
        execSync(`npm publish "${outTgz}" --registry ${REGISTRY} --tag latest`, {
          stdio: ['ignore', 'pipe', 'pipe'],
          env: Object.assign({}, process.env, { npm_config_userconfig: userconfig }),
        });
        console.log(`OK    published ${label}`);
        results.published.push(label);
      } catch (e) {
        const msg = `${e.stderr ? e.stderr.toString() : ''}${e.stdout ? e.stdout.toString() : ''}`;
        if (/EPUBLISHCONFLICT|cannot publish over|already exists|status code 409/i.test(msg)) {
          console.log(`skip  ${label} — already published (bump the version to release a change)`);
          results.skipped.push(label + ' (already published)');
        } else {
          console.error(`FAIL  ${label}\n  ${msg.split('\n').filter(Boolean).slice(0, 6).join('\n  ')}`);
          results.failed.push(label);
        }
      }
    } catch (e) {
      console.error(`FAIL  ${file} — ${e.message}`);
      results.failed.push(file);
    } finally {
      try { fs.rmSync(ex, { recursive: true, force: true }); } catch (_) {}
    }
  }
} finally {
  cleanup();
}

console.log('\n=== summary ===');
console.log(`published: ${results.published.length}  ${results.published.join(', ') || ''}`);
console.log(`skipped:   ${results.skipped.length}  ${results.skipped.join(', ') || ''}`);
console.log(`failed:    ${results.failed.length}  ${results.failed.join(', ') || ''}`);
process.exit(results.failed.length ? 1 : 0);
