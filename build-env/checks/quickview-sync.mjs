/**
 * Guard: the two page-builders must not silently diverge.
 *
 * app-builder and instant-create-page each keep their OWN `src/shared/quickView.tsx` (both are
 * deliberately self-contained — no @ptdl/shared bundling machinery; see the build recipes). That means a
 * fix applied to one can be forgotten in the other (this is exactly how the row-Edit / Change-status
 * buttons and the relation click-to-Details popup once diverged). This check compares the SHARED-CORE
 * functions of the two files (normalised: comments + whitespace stripped) and fails if any differ, so the
 * divergence is caught at build/CI time instead of by a user.
 *
 * app-builder's quickView is the SUPERSET (adds quick-create templates, sub-column ordering, widget/
 * popupColumns threading), so functions that legitimately differ are NOT in SYNC_LIST — only the ones that
 * must stay identical are. Run: `node build-env/checks/quickview-sync.mjs`.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const AB = path.join(ROOT, 'packages/@ptdl/plugin-app-builder/src/shared/quickView.tsx');
const IC = path.join(ROOT, 'packages/@ptdl/plugin-instant-create-page/src/shared/quickView.tsx');

// (a) Helpers that MUST be byte-identical (modulo comments/whitespace) in both files — the small, shared
// action/render pieces that carry no plugin-specific difference.
const SYNC_LIST = [
  'editAction', 'changeStatusAction', 'findStatusFlowField', 'popupShell',
  'resInit', 'fieldStep', 'colTitleStep', 'formLabelStep', 'detailLabelStep', 'modelClassFor',
];
// (b) Feature markers that MUST appear in BOTH files. The bigger functions (buildTableBlock / detailsBlock
// / tableColumn / relationPopupColumns) legitimately differ — app-builder is the superset (popup columns,
// sub-column ordering, quick-create templates) — so we can't byte-compare them; instead assert the shared
// FEATURES are present in both, so a feature can't be silently DROPPED from one (which is exactly how the
// row-Edit / Change-status buttons and the relation click-to-Details popup once diverged).
const MARKERS = [
  'ViewActionModel', 'EditActionModel', 'TableActionsColumnModel', 'AddNewActionModel',
  'StatusTransitionActionModel', 'changeStatusAction', 'viewActions', 'relPopup',
  'relationPopupColumns', 'findStatusFlowField',
];

/** Extract a top-level `function NAME` / `const NAME = …{…}` block by brace-matching from its first `{`. */
function extract(src, name) {
  const starts = [
    new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\b`),
    new RegExp(`(?:export\\s+)?const\\s+${name}\\b`),
  ];
  let i = -1;
  for (const re of starts) { const m = src.search(re); if (m >= 0) { i = m; break; } }
  if (i < 0) return null;
  const j = src.indexOf('{', i);
  if (j < 0) return null;
  let depth = 0;
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (depth === 0) return src.slice(i, k + 1); }
  }
  return null;
}
const norm = (s) => s.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').trim();

const ab = fs.readFileSync(AB, 'utf8');
const ic = fs.readFileSync(IC, 'utf8');
const problems = [];
for (const name of SYNC_LIST) {
  const a = extract(ab, name), b = extract(ic, name);
  if (!a) { problems.push(`  MISSING in app-builder: ${name}`); continue; }
  if (!b) { problems.push(`  MISSING in instant-create-page: ${name}`); continue; }
  if (norm(a) !== norm(b)) problems.push(`  DIVERGED (body differs): ${name}`);
}
for (const marker of MARKERS) {
  const inA = ab.includes(marker), inB = ic.includes(marker);
  if (inA && !inB) problems.push(`  FEATURE dropped from instant-create-page: "${marker}" (present in app-builder)`);
  if (inB && !inA) problems.push(`  FEATURE dropped from app-builder: "${marker}" (present in instant-create-page)`);
}
if (problems.length) {
  console.error(`❌ quickView sync FAILED — ${problems.length} shared function(s) out of sync between the two page-builders:`);
  console.error(problems.join('\n'));
  console.error('\nFix: apply the same change to BOTH src/shared/quickView.tsx (app-builder is the superset — mirror it), then re-run.');
  process.exit(1);
}
console.log(`✅ quickView sync OK — ${SYNC_LIST.length} shared helpers byte-identical + ${MARKERS.length} shared features present in both page-builders.`);
