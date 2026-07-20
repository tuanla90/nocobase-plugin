// alasql is ~500KB min — too heavy to put in every user's main bundle for a helper
// most templates never use. It ships as a static file inside this plugin's package
// (recipe repacks dist/alasql.min.js into the tgz) and is injected on demand, only
// when a template actually references the `sql` helper.

import { loadScriptClean } from './scriptLoader';

const ALASQL_URL = '/static/plugins/@tuanla90/plugin-print-template/dist/alasql.min.js';

export async function ensureAlasql(): Promise<any> {
  const w = window as any;
  if (!w.alasql) await loadScriptClean(ALASQL_URL);
  return w.alasql;
}

/** Does any template part reference the `sql` helper? (block, inline or subexpression) */
export function templateUsesSql(...parts: (string | undefined | null)[]): boolean {
  return parts.some((p) => !!p && /\{\{\s*#?\s*sql\b|\(\s*sql\b/.test(p));
}
