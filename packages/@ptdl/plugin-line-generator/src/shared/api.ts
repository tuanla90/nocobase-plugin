// Client helpers over the `ptdlLineGen` server resource. `api` is the NocoBase apiClient
// (useAPIClient on /admin, useApp().apiClient on /v/). Responses are RAW (ctx.body = result,
// no {data:...} wrap) — but the http layer still nests under res.data, so we read res.data.
import type { PreviewTrace } from './types';

export interface RuleMeta {
  key: string;
  title: string;
  sourceCollection: string;
  targetPath: string;
  guard: Array<{ field: string; op?: string; value: any }>;
}

export interface PreviewRow {
  [field: string]: any;
}

export interface RunResult {
  ok: boolean;
  error?: string;
  detail?: string;
  dryRun?: boolean;
  lines?: PreviewRow[]; // preview rows (NOT `rows` — avoids NocoBase list-response unwrapping)
  /** dry-run only: whether the record actually satisfies the condition (preview ignores it but reports). */
  guardOk?: boolean;
  guardDetail?: string;
  created?: number;
  skipped?: Array<{ reason: string; detail?: string; rule?: any }>;
  errors?: Array<{ field: string; message: string; rule?: any }>;
  runVersion?: number;
  ruleCount?: number;
  /** dry-run + debug: per-stage snapshots for the step-by-step preview. */
  trace?: PreviewTrace;
}

async function call(api: any, action: string, params: any): Promise<any> {
  const res = await api.request({ url: `ptdlLineGen:${action}`, method: 'post', ...params });
  return res?.data?.data !== undefined ? res.data.data : res?.data;
}

/** Which generators apply to a collection (drives the button's show-if + rule menu). */
export async function fetchRulesFor(api: any, collection: string): Promise<RuleMeta[]> {
  try {
    const res = await api.request({ url: 'ptdlLineGen:rulesFor', method: 'post', params: { collection } });
    const body = res?.data?.data !== undefined ? res.data.data : res?.data;
    return Array.isArray(body) ? body : [];
  } catch (_) {
    return [];
  }
}

export async function previewGenerate(api: any, ruleKey: string, filterByTk: any): Promise<RunResult> {
  return call(api, 'preview', { data: { ruleKey, filterByTk } });
}

export async function commitGenerate(api: any, ruleKey: string, filterByTk: any): Promise<RunResult> {
  return call(api, 'generate', { data: { ruleKey, filterByTk } });
}

/** Dry-run an inline (unsaved) config against a sample record — powers the settings editor's live preview.
 *  debug:true → response includes `trace` (per-stage snapshots) for the step-by-step debugger. */
export async function previewInline(api: any, config: any, filterByTk: any, debug = true): Promise<RunResult> {
  return call(api, 'previewInline', { data: { config, filterByTk, debug } });
}

/** Client-side guard check (mirrors the server's condsPass, full CondOp set) so the button hides when
 *  preconditions fail. Server still enforces — this is only the show-if. */
export function guardPasses(guard: RuleMeta['guard'] | undefined, record: any): boolean {
  if (!guard || !guard.length || !record) return true;
  for (const g of guard) {
    const a = record[g.field];
    const eq = typeof g.value === 'boolean' ? !!a === g.value : String(a ?? '') === String(g.value ?? '');
    let ok: boolean;
    switch (g.op || 'eq') {
      case 'ne': ok = !eq; break;
      case 'gt': ok = Number(a) > Number(g.value); break;
      case 'lt': ok = Number(a) < Number(g.value); break;
      case 'gte': ok = Number(a) >= Number(g.value); break;
      case 'lte': ok = Number(a) <= Number(g.value); break;
      case 'contains': ok = String(a).includes(String(g.value)); break;
      default: ok = eq; break;
    }
    if (!ok) return false;
  }
  return true;
}
