/**
 * Computed field — client config (Phase 1).
 *
 * Entry point = the ⚙ menu of a table column bound to a REAL (stored) number field. A "Giá trị tự
 * tính" step lets the user type an Excel formula; on save it upserts a row into the server's
 * `ptdlComputedRules` collection (the "global rule"), exactly like plugin-custom-header writes field
 * styles to `ptdlFieldStyles`. The server then recomputes that column on every save of the row.
 *
 * Storage ≠ input: the rule lives in `ptdlComputedRules` (server-enforced), but is entered here in the
 * column config — no separate admin screen. See docs/COMPUTED-FIELD-DESIGN.md §3.1.
 */

import React from 'react';
import { Tooltip, Modal, message } from 'antd';
import { CalculatorOutlined } from '@ant-design/icons';
import { fi, onWsMessage, refreshFlowBlocks, LIVE_REFRESH_TYPE } from '@tuanla90/shared';
import { registerFormulaComponents, highlightFormula, FormulaCode } from './formulaEditorComponents';
import { ComputedRuleEditor } from './ComputedRuleEditor';
import type { RuleValue } from './ComputedRuleEditor';
import { splitTriggers } from './formulaKnowledge';
import { ComputedPreview, setPreviewApi, setPreviewRulesProvider } from './computedPreview';
import { NS, t as rt } from './i18n';

// Captured in loadComputedRuleCache() so the in-form ⓘ edit modal (rendered deep inside a field model)
// can reach the API client without threading it through every render.
let sharedApi: any = null;
// Whether the current user may CLICK the ⓘ to edit a rule in place: admins (allowAll) or roles that can
// manage the data source (pm.data-source-manager). Everyone else gets a hover-only tooltip. Resolved once
// at load; defaults false so the affordance stays hidden until we know the user is allowed.
let canEditRules = false;

// Client-side cache of existing rules, keyed `${dataSourceKey}.${collectionName}.${targetField}`, so
// the config dialog can prefill synchronously (defaultParams is sync). Loaded in each lane's load().
const ruleCache = new Map<string, any>();

const cacheKey = (ds: string, col: string, field: string) => `${ds || 'main'}.${col}.${field}`;
const ruleKey = (ds: string, col: string, field: string) => `${ds || 'main'}:${col}.${field}`;

/** Populate the rule cache from the server. Call (awaited) in the plugin's client load(). */
export async function loadComputedRuleCache(api: any) {
  if (!api?.request) return;
  sharedApi = api; // remember for the in-form edit modal
  // Live in-form preview: give it the api + a live view of the rule cache (re-read on every render,
  // so later cache reloads are picked up automatically).
  setPreviewApi(api);
  setPreviewRulesProvider(() => [...ruleCache.values()]);
  // Gate the in-form click-to-edit: admins (allowAll) or roles that can manage the data source
  // (pm.data-source-manager snippet). Others still SEE the tooltip but can't open the editor.
  try {
    const chk = await api.request({ url: 'roles:check' });
    const d = chk?.data?.data || {};
    const snippets: string[] = Array.isArray(d.snippets) ? d.snippets : [];
    canEditRules =
      d.allowAll === true ||
      snippets.some((s) => s === 'pm.*' || (typeof s === 'string' && s.startsWith('pm.data-source-manager')));
  } catch (e) {
    canEditRules = false; // fail closed — no affordance if we can't confirm permission
  }
  try {
    const res = await api.request({ url: 'ptdlComputedRules:list', params: { pageSize: 1000 } });
    const rows = res?.data?.data || [];
    ruleCache.clear();
    for (const r of rows) {
      ruleCache.set(cacheKey(r.dataSourceKey, r.collectionName, r.targetField), r);
    }
    // eslint-disable-next-line no-console
    console.log('[ptdl-computed] rule cache loaded:', ruleCache.size);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[ptdl-computed] load rule cache failed (table may be new/empty)', e);
  }
}

// ---------------------------------------------------------------------------------------------
// Scan/window hint (v0.1.74): the SAME 🧮 hover-icon idea, but for columns driven by a SCAN/WINDOW
// rule instead of a computed rule. Deliberately a SEPARATE, simpler, hover-ONLY affordance — no
// click-to-edit (a scan rule's shape doesn't map onto ComputedRuleEditor's single-formula form, and a
// scan value isn't a per-row pure formula so the live ComputedPreview wouldn't be meaningful for it).
type ScanHint = {
  accumulator: string; metricLabel?: string;
  qtyFormula?: string; qtyColumn?: string; costFormula?: string; costColumn?: string;
  inputFormula?: string; inputColumn?: string;
  partitionBy?: string[]; orderBy?: Array<{ field: string; dir?: 'asc' | 'desc' }>;
};
const scanHintCache = new Map<string, ScanHint>(); // key: `${collection}.${field}` (scan rules are main-datasource only)

// Mirrors ScanCalcManager's accGroups/OUT_GROUPS/SRC_OUT VN labels (kept local — that file doesn't export
// them, and these are tiny display-only strings low-risk to duplicate).
const SCAN_ACC_LABEL: Record<string, string> = {
  running_sum: 'Số dư lũy kế (SUM)', running_count: 'Đếm lũy kế (COUNT)', running_min: 'Nhỏ nhất tới hiện tại (MIN)',
  running_max: 'Lớn nhất tới hiện tại (MAX)', running_avg: 'Trung bình lũy kế (AVG)', row_number: 'Số thứ tự (ROW_NUMBER)',
  fifo: 'FIFO', lifo: 'LIFO', fefo: 'FEFO (hết hạn trước)', weighted_avg: 'Bình quân gia quyền',
};
const SCAN_OUT_LABEL: Record<string, string> = {
  outRunningQty: 'Số dư lượng', outRunningValue: 'Số dư giá trị', outConsumedQty: 'Lượng tiêu hao',
  outCogs: 'Giá trị tiêu hao (COGS)', outUnitCost: 'Đơn giá đã định (dòng này)', outAvgCost: 'Đơn giá bình quân',
  outConsumedUnitCost: 'Đơn giá tiêu hao',
};
const SCAN_SINGLE_OUT_KEYS = ['outRunningQty', 'outRunningValue', 'outConsumedQty', 'outCogs', 'outConsumedUnitCost', 'outUnitCost', 'outAvgCost'];
const SCAN_SRC_OUT_KEYS = ['outRunningQty', 'outUnitCost', 'outCogs', 'outRunningValue', 'outConsumedQty'];

/** Populate the scan/window hint cache. Call (awaited) alongside loadComputedRuleCache(). */
export async function loadScanHintCache(api: any) {
  if (!api?.request) return;
  scanHintCache.clear();
  try {
    const winRes = await api.request({ url: 'ptdlWindow:list', method: 'get' });
    const winList = winRes?.data?.data?.list || winRes?.data?.list || [];
    for (const w of winList) {
      if (!w?.collection || !w?.field) continue;
      const formulaish = w.inputMode === 'formula' || w.inputMode === 'sql';
      scanHintCache.set(`${w.collection}.${w.field}`, {
        accumulator: w.accumulator || 'running_sum',
        partitionBy: w.partitionBy || [], orderBy: w.orderBy || [],
        inputFormula: formulaish && w.input ? String(w.input) : undefined,
        inputColumn: !formulaish && w.input ? String(w.input) : undefined,
      });
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[ptdl-computed] load window hint cache failed', e);
  }
  try {
    const scanRes = await api.request({ url: 'ptdlScanRules:list', method: 'get', params: { pageSize: 200 } });
    const scanList = scanRes?.data?.data || scanRes?.data || [];
    for (const r of Array.isArray(scanList) ? scanList : []) {
      if (r?.enabled === false) continue;
      const acc = r.method || 'weighted_avg';
      if (Array.isArray(r.sources) && r.sources.length) {
        for (const s of r.sources) {
          if (!s?.collection) continue;
          for (const k of SCAN_SRC_OUT_KEYS) {
            const col = s[k];
            if (!col) continue;
            scanHintCache.set(`${s.collection}.${col}`, {
              accumulator: acc, metricLabel: SCAN_OUT_LABEL[k],
              qtyFormula: s.qtyFormula, costFormula: s.costMode === 'formula' ? s.costFormula : undefined,
              costColumn: s.costMode === 'column' ? s.costField : undefined,
              partitionBy: r.partitionBy || [], orderBy: r.orderBy || [],
            });
          }
        }
      } else if (r.collectionName) {
        for (const k of SCAN_SINGLE_OUT_KEYS) {
          const col = (r as any)[k];
          if (!col) continue;
          scanHintCache.set(`${r.collectionName}.${col}`, {
            accumulator: acc, metricLabel: SCAN_OUT_LABEL[k],
            qtyFormula: r.qtyMode === 'formula' ? r.qtyFormula : undefined,
            qtyColumn: r.qtyMode !== 'formula' ? (r.qtyField || r.inQtyField || r.outQtyField) : undefined,
            costFormula: r.costMode === 'formula' ? r.costFormula : undefined,
            costColumn: r.costMode === 'column' ? r.costField : undefined,
            partitionBy: r.partitionBy || [], orderBy: r.orderBy || [],
          });
        }
      }
    }
    // eslint-disable-next-line no-console
    console.log('[ptdl-computed] scan/window hint cache loaded:', scanHintCache.size);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[ptdl-computed] load scan hint cache failed (table may be new/empty)', e);
  }
}

// ---------------------------------------------------------------------------------------------
// Auto-refresh: when a record on a computed-relevant collection is mutated, the recomputed value is
// correct in the DB immediately BUT the mutation response doesn't carry it and sibling blocks don't
// refetch → the page shows stale numbers until F5. Fix: after such a mutation, refetch every data
// block on the page (short delay so the server cascade has committed). Verified server-side that a
// refetch right after the mutation returns fresh values.
// ---------------------------------------------------------------------------------------------
const computedCollections = new Set<string>();
const MUTATING = new Set(['create', 'update', 'updateOrCreate', 'firstOrCreate', 'destroy', 'move', 'add', 'remove', 'set', 'toggle']);

/** Load the set of collections whose mutations can change a computed value (incl. lookup targets). */
export async function loadComputedCollections(api: any) {
  if (!api?.request) return;
  try {
    const res = await api.request({ url: 'ptdlComputed:collections' });
    const list: string[] = res?.data?.collections || res?.data?.data?.collections || [];
    computedCollections.clear();
    for (const c of list) computedCollections.add(c);
    // eslint-disable-next-line no-console
    console.log('[ptdl-computed] auto-refresh watches collections:', [...computedCollections]);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[ptdl-computed] load involved collections failed', e);
  }
}

let autoRefreshInstalled = false;

/** Refetch page data blocks after computed values change. TWO triggers, both debounced into one refresh:
 *   1. An apiClient response interceptor — fires ~220ms after a mutation on a computed-relevant collection
 *      (fast, optimistic; only on the client that made the edit).
 *   2. A server WebSocket push `ptdl:live-refresh` — fires the instant the server cascade truly settles
 *      (authoritative; reaches ALL clients, and wins the race on large fan-outs the 220ms guess would miss).
 *  Keeping both = snappy in the common case, correct in the slow case, and other users see updates too. */
export function installComputedAutoRefresh(app: any) {
  const axios = app?.apiClient?.axios;
  const flowEngine = app?.flowEngine;
  if (autoRefreshInstalled || !axios?.interceptors?.response || !flowEngine?.forEachModel) return;
  autoRefreshInstalled = true;
  let timer: any = null;
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      refreshFlowBlocks(flowEngine);
    }, 220);
  };
  // (2) authoritative: server signals when the recompute is actually done → refetch exactly then.
  onWsMessage(app, LIVE_REFRESH_TYPE, () => schedule());
  // (1) optimistic: refetch shortly after a local mutation on a computed-relevant collection.
  axios.interceptors.response.use(
    (response: any) => {
      try {
        const path = String(response?.config?.url || '').split('?')[0];
        const colon = path.lastIndexOf(':');
        if (colon > 0) {
          const action = path.slice(colon + 1);
          if (MUTATING.has(action)) {
            const segs = path.slice(0, colon).split('/').filter(Boolean); // ['api','order','1','items']
            const resourceSeg = segs[segs.length - 1];
            const firstColl = segs.find((s) => s !== 'api' && !/^\d+$/.test(s));
            if (computedCollections.has(resourceSeg) || (firstColl && computedCollections.has(firstColl))) schedule();
          }
        }
      } catch {
        /* ignore */
      }
      return response;
    },
    (err: any) => Promise.reject(err),
  );
  // eslint-disable-next-line no-console
  console.log('[ptdl-computed] auto-refresh installed (axios 220ms + ws ' + LIVE_REFRESH_TYPE + ')');
}

// Resolve a FlowEngine model class robustly across lanes (mirrors plugin-custom-header).
function resolveModelClass(flowEngine: any, name: string, hint: any): any {
  try {
    const c = flowEngine?.getModelClass?.(name);
    if (c && typeof c.registerFlow === 'function') return c;
  } catch (e) {
    /* ignore */
  }
  let c: any = hint;
  while (c && typeof c === 'function') {
    if (c.name === name && typeof c.registerFlow === 'function') return c;
    c = Object.getPrototypeOf(c);
  }
  return hint && typeof hint.registerFlow === 'function' ? hint : null;
}

async function saveRule(api: any, cf: any, formula: string, runOn: string, onError?: string) {
  if (!api?.request || !cf) return;
  const ds = cf.dataSourceKey || 'main';
  const key = ruleKey(ds, cf.collectionName, cf.name);
  const ck = cacheKey(ds, cf.collectionName, cf.name);
  const trimmed = (formula || '').trim();
  if (!trimmed) {
    // Empty formula → remove the rule (turn the column back into a plain field).
    try {
      await api.request({ url: 'ptdlComputedRules:destroy', method: 'post', params: { filter: { key } } });
    } catch (e) {
      /* ignore */
    }
    ruleCache.delete(ck);
    return;
  }
  const values = {
    key,
    dataSourceKey: ds,
    collectionName: cf.collectionName,
    targetField: cf.name,
    formula: trimmed,
    // Phase 1 = local same-row: leave deps empty → server recomputes on the row's own save (correct
    // for local; the fine-grained dep graph lands in Phase 2). onError: null → store null on error.
    deps: [],
    runOn: runOn || 'both',
    enabled: true,
    onError: onError || 'null',
  };
  await api.request({
    url: 'ptdlComputedRules:updateOrCreate',
    method: 'post',
    params: { filterKeys: ['key'] },
    data: values,
  });
  ruleCache.set(ck, values);
}

// Resolve a model's collectionField, walking up `.parent` (mirrors patchComputedHint's render-time walk —
// SOME contexts, notably a SubTableColumnModel's column model, don't carry `collectionField` directly on
// themselves; it lives on a parent). Without this, the rule-editor dialog opened from a sub-table column's
// ⚙ can silently resolve `cf` to nothing (or the wrong ancestor), which shows as "Test on record" listing
// the wrong/empty collection ("Bảng chưa có bản ghi") even though the real target collection has rows.
function resolveCf(model: any): any {
  for (let cur: any = model, i = 0; cur && i < 4; cur = cur.parent, i++) {
    if (cur?.collectionField) return cur.collectionField;
  }
  return null;
}

let flowRegistered = false;

export function registerComputedRuleFlow({
  flowEngine,
  flowSettings,
  TableColumnModel,
  EditableFieldModel,
  FieldModel,
  DisplayTextFieldModel,
  tExpr,
}: {
  flowEngine: any;
  flowSettings?: any;
  TableColumnModel: any;
  EditableFieldModel?: any;
  FieldModel?: any;
  DisplayTextFieldModel?: any;
  tExpr?: (s: string, opts?: any) => any;
}) {
  if (flowRegistered) return;
  const t = (s: string) => (tExpr ? tExpr(s, { ns: NS }) : s);
  // The RULE EDITOR (config dialog) is registered on the table-column ⚙ AND the editable form/edit field ⚙
  // (via the `FieldModel` base below — the same base field-enhancements' editable widgets, e.g. star-rating /
  // input-with-icon, extend, and whose settings DO surface in a form field's ⚙). An earlier attempt put it on
  // a form field's ⚙ and got "a dead menu item" — that was the wrong base; `FieldModel` is the one that
  // surfaces. Detail/VIEW fields (DisplayTextFieldModel) are deliberately NOT targeted: they stay read-only
  // and just get the TOOLTIP hint (below) showing the formula. Config is a column-level action, so the editor
  // deliberately lives only where you configure a field (column ⚙ / editable field ⚙), not on a read-only view.
  const TableColumn = resolveModelClass(flowEngine, 'TableColumnModel', TableColumnModel);
  if (!TableColumn || typeof TableColumn.registerFlow !== 'function') {
    // eslint-disable-next-line no-console
    console.warn('[ptdl-computed] TableColumnModel not resolvable — skip rule flow');
    return;
  }
  flowRegistered = true;
  registerFormulaComponents(flowSettings); // ensure components are available
  // Tooltip hint on form/edit inputs + detail displays: signal "auto-computed (server)" + show the
  // formula on hover. There's no single field base to patch — each field TYPE owns its own render
  // (editable *FieldModel via render, display Display*FieldModel via renderComponent) — so iterate the
  // model registry and wrap every field model. The wrapper is a guarded no-op for non-computed fields,
  // so patching broadly is safe and needs no per-type maintenance list.
  patchAllFieldHints(flowEngine, [EditableFieldModel, DisplayTextFieldModel]);

  // The two CANONICAL column surfaces the rule editor lives on. Resolve them once so the settings-menu
  // visibility predicate below can tell "this model IS a column" / "this field is nested INSIDE a column"
  // from "this is a standalone form/edit field".
  const SubTableColumn = resolveModelClass(flowEngine, 'SubTableColumnModel', undefined);
  const isColumnModel = (m: any) =>
    !!m && ((TableColumn && m instanceof TableColumn) || (SubTableColumn && m instanceof SubTableColumn));
  // hideInSettings predicate for the rule step (wired below). The flow is registered on THREE bases:
  // TableColumnModel + SubTableColumnModel (the column ⚙) AND FieldModel (a standalone form/edit field ⚙).
  // In /v/, a (sub-)table column's ⚙ aggregates its OWN flows PLUS its inner field component's flows
  // (FlowsFloatContextMenu settingsMenuLevel:2 → walkSubModels), and that field component extends
  // FieldModel — so the FieldModel registration surfaces a SECOND, duplicate "Giá trị tự cập nhật (công
  // thức)" entry on the very same column ⚙. Kill ONLY that in-column duplicate:
  //   • the column model itself (TableColumn/SubTableColumn) → SHOW (canonical surface).
  //   • a field model that has a (sub-)table-column ANCESTOR → HIDE (it's the column's inner component).
  //   • a standalone form/edit field (no column ancestor) → SHOW (must keep working).
  // This is menu-visibility only; the step's auto-apply handler + write-guard are untouched.
  const hideDuplicateOnColumnField = (ctx: any): boolean => {
    const model = ctx?.model;
    if (!model || isColumnModel(model)) return false;
    for (let cur: any = model.parent, i = 0; cur && i < 4; cur = cur.parent, i++) {
      if (isColumnModel(cur)) return true;
    }
    return false;
  };

  const flowConfig: any = {
      key: 'ptdlComputedRule',
      sort: 504, // just after the Formula display flow (502)
      title: t('Giá trị tự tính'),
      steps: {
        rule: {
          title: t('Giá trị tự cập nhật (công thức)'),
          // Hide the DUPLICATE entry on a (sub-)table column's ⚙ (the column already shows it); keep it on
          // the column itself and on a standalone form/edit field. See hideDuplicateOnColumnField above.
          hideInSettings: hideDuplicateOnColumnField,
          uiMode: { type: 'dialog', props: { width: 800 } },
          // Host the SAME full editor as the Settings page (toolbar field-picker/ví dụ/hàm/AI + triggers +
          // Khi lỗi + Chạy thử) — just with the Bảng/Cột-đích pickers hidden (known from this column).
          uiSchema: (ctx: any) => {
            const cf = resolveCf(ctx?.model);
            const api = ctx?.app?.apiClient || ctx?.model?.context?.api || ctx?.model?.flowEngine?.context?.api;
            return {
              rule: {
                type: 'object',
                'x-component': 'ComputedRuleEditorField',
                'x-component-props': { api, collection: cf?.collectionName, targetField: cf?.name, dataSourceKey: cf?.dataSourceKey },
              },
            };
          },
          defaultParams(ctx: any) {
            // legacy single tokens → the equivalent combo value so the checkboxes show right
            const combo = (v: any) => (({ both: 'create,update,source', self: 'create,update', update: 'update,source' } as any)[v] || v || 'create,update,source');
            const cf = resolveCf(ctx?.model);
            const r = cf ? ruleCache.get(cacheKey(cf.dataSourceKey || 'main', cf.collectionName, cf.name)) : null;
            return { rule: { formula: r?.formula || '', runOn: combo(r?.runOn), onError: r?.onError || 'null' } };
          },
          async handler(ctx: any, params: any) {
            const cf = resolveCf(ctx?.model);
            if (!cf) return;
            // Resolve the API client from the widest set of handles — on a form/edit FIELD model the api may
            // not sit on `ctx.model.context` the way it does on a table column, so mirror the uiSchema chain
            // (else saveRule/recompute would silently no-op when the editor is opened from a form field ⚙).
            const api = ctx?.model?.context?.api || ctx?.app?.apiClient || ctx?.model?.flowEngine?.context?.api || sharedApi;
            const rule = params?.rule || {};
            // This step AUTO-APPLIES on EVERY render (flow-engine settings flow), with `defaultParams`
            // = the current cached rule. Writing unconditionally here made every table render re-save +
            // recompute + (for empty columns) destroy EVERY column — a write→live-refresh→re-render loop,
            // and a hard 403 → "Render failed" for non-admins once writes got ACL-gated. So WRITE only when
            // the user actually CHANGED the rule (this handler also runs on the dialog's real submit).
            const cached = ruleCache.get(cacheKey(cf.dataSourceKey || 'main', cf.collectionName, cf.name));
            const norm = (v: any) => (v == null ? '' : String(v)).trim();
            const trig = (v: any) => splitTriggers(v).slice().sort().join(',');
            if (!cached && !norm(rule.formula)) return; // no rule + empty formula → nothing to create or delete
            const unchanged =
              norm(rule.formula) === norm(cached?.formula) &&
              trig(rule.runOn) === trig(cached?.runOn) &&
              norm(rule.onError || 'null') === norm(cached?.onError || 'null');
            if (unchanged) return; // render-time apply (or a no-op OK) — don't touch the server
            await saveRule(api, cf, rule.formula, rule.runOn, rule.onError);
            // Best-effort backfill so existing rows reflect the new/edited rule right away.
            try {
              await api?.request({ url: 'ptdlComputed:recompute', method: 'post', params: { collection: cf.collectionName, field: cf.name } });
            } catch (e) {
              /* ignore */
            }
          },
        },
      },
  };
  // Register the SAME editor flow on THREE bases so "Giá trị tự cập nhật (công thức)" shows in every place a
  // field is configured:
  //   • TableColumnModel      — main-table column ⚙
  //   • SubTableColumnModel   — sub-table column ⚙ (does NOT extend TableColumnModel → inherits nothing)
  //   • FieldModel            — the editable form/edit field ⚙ (base of every form input; sub-table/detail
  //                             DISPLAY models are a separate base, so this hits editable contexts only)
  const targets = [
    TableColumn,
    SubTableColumn,
    resolveModelClass(flowEngine, 'FieldModel', FieldModel),
  ].filter((c: any) => c && typeof c.registerFlow === 'function');
  for (const Cls of targets) {
    try {
      (Cls as any).registerFlow(flowConfig);
      // eslint-disable-next-line no-console
      console.log('[ptdl-computed] rule flow registered on', (Cls as any).name);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[ptdl-computed] rule flow registerFlow failed', e);
    }
  }
}

/**
 * The ⓘ calculator affordance next to a computed field. EDITABLE context (form/edit) → clickable, opens
 * the SAME shared editor (formula toolbar + AI + triggers + Chạy thử) in a modal and saves in place; VIEW
 * context (detail) → hover-only. The server ACL on `ptdlComputedRules` still gates the write, so a user
 * without permission just gets a save error — the modal is a convenience, not a new permission surface.
 */
const ComputedHintIcon: React.FC<{ rule: any; cf: any; editable: boolean }> = ({ rule, cf, editable }) => {
  const [open, setOpen] = React.useState(false);
  const [val, setVal] = React.useState<RuleValue | null>(null);
  const [saving, setSaving] = React.useState(false);
  const tipContent = (
    <div>
      <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>{rt('Giá trị tự tính (server)')}:</div>
      <div
        style={{
          fontFamily: 'monospace',
          fontSize: 12,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          background: 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(255,255,255,0.14)',
          borderRadius: 4,
          padding: '6px 8px',
        }}
      >
        {highlightFormula(rule.formula)}
      </div>
      {editable ? <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>({rt('bấm để sửa công thức')})</div> : null}
    </div>
  );

  const openEditor = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setVal({
      collectionName: cf.collectionName,
      targetField: cf.name,
      dataSourceKey: cf.dataSourceKey || 'main',
      formula: rule.formula || '',
      runOn: rule.runOn,
      onError: rule.onError || 'null',
      enabled: rule.enabled !== false,
    });
    setOpen(true);
  };

  const onOk = async () => {
    if (!val || !sharedApi) {
      setOpen(false);
      return;
    }
    setSaving(true);
    try {
      await saveRule(sharedApi, cf, val.formula || '', val.runOn as string, val.onError);
      try {
        await sharedApi.request({ url: 'ptdlComputed:recompute', method: 'post', params: { collection: cf.collectionName, field: cf.name } });
      } catch (_) {
        /* recompute is best-effort */
      }
      ruleCache.set(cacheKey(cf.dataSourceKey || 'main', cf.collectionName, cf.name), { ...rule, ...val });
      message.success(rt('Đã lưu — server tự tính lại các dòng liên quan'));
      setOpen(false);
    } catch (e: any) {
      message.error(`${rt('Lưu lỗi')}: ${e?.message || ''}`.trim());
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Tooltip
        title={tipContent}
        overlayStyle={{ maxWidth: 460 }}
        overlayInnerStyle={{ maxWidth: 460 }}
      >
        <CalculatorOutlined
          onClick={editable ? openEditor : undefined}
          style={{ color: 'var(--colorTextTertiary, #999)', fontSize: 12, flex: 'none', cursor: editable ? 'pointer' : 'help' }}
        />
      </Tooltip>
      {editable && open ? (
        <Modal
          open
          width={820}
          title={rt('Giá trị tự cập nhật (công thức)')}
          okText={rt('Lưu')}
          cancelText={rt('Huỷ')}
          confirmLoading={saving}
          onOk={onOk}
          onCancel={() => setOpen(false)}
          destroyOnClose
          styles={{ body: { maxHeight: '68vh', overflowY: 'auto' } }}
        >
          {val ? (
            <ComputedRuleEditor
              api={sharedApi}
              value={val}
              onChange={(patch) => setVal((v) => ({ ...(v || {}), ...patch }))}
              showCollectionField={false}
              showTargetField={false}
              showEnabled
              isEdit
            />
          ) : null}
        </Modal>
      ) : null}
    </>
  );
};

/** The hover-only hint icon for a SCAN/WINDOW-driven column — no click-to-edit (see loadScanHintCache). */
const ScanHintIcon: React.FC<{ info: ScanHint }> = ({ info }) => {
  const accLabel = SCAN_ACC_LABEL[info.accumulator] || info.accumulator;
  const orderTxt = (info.orderBy || []).map((o) => `${o.field}${o.dir === 'desc' ? ' ↓' : ' ↑'}`).join(', ');
  const partTxt = (info.partitionBy || []).join(', ');
  const tipContent = (
    <div>
      <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>
        {rt('Giá trị tự tính (scan)')}: {accLabel}
        {info.metricLabel ? ` — ${rt(info.metricLabel)}` : ''}
      </div>
      {info.qtyFormula ? (
        <div style={{ marginBottom: 4 }}>
          <div style={{ fontSize: 10, opacity: 0.6, marginBottom: 2 }}>{rt('Công thức lượng')}:</div>
          <FormulaCode formula={info.qtyFormula} style={{ fontSize: 12 }} />
        </div>
      ) : null}
      {info.costFormula ? (
        <div style={{ marginBottom: 4 }}>
          <div style={{ fontSize: 10, opacity: 0.6, marginBottom: 2 }}>{rt('Công thức đơn giá')}:</div>
          <FormulaCode formula={info.costFormula} style={{ fontSize: 12 }} />
        </div>
      ) : null}
      {info.inputFormula ? (
        <div style={{ marginBottom: 4 }}>
          <FormulaCode formula={info.inputFormula} style={{ fontSize: 12 }} />
        </div>
      ) : null}
      {info.qtyColumn ? <div style={{ fontSize: 10.5, opacity: 0.65 }}>{rt('Cột lượng')}: {info.qtyColumn}</div> : null}
      {info.costColumn ? <div style={{ fontSize: 10.5, opacity: 0.65 }}>{rt('Cột đơn giá')}: {info.costColumn}</div> : null}
      {info.inputColumn ? <div style={{ fontSize: 10.5, opacity: 0.65 }}>{rt('Cột nguồn')}: {info.inputColumn}</div> : null}
      {partTxt ? <div style={{ fontSize: 10.5, opacity: 0.65, marginTop: 2 }}>{rt('Theo nhóm')}: {partTxt}</div> : null}
      {orderTxt ? <div style={{ fontSize: 10.5, opacity: 0.65 }}>{rt('Sắp theo')}: {orderTxt}</div> : null}
    </div>
  );
  return (
    <Tooltip title={tipContent} overlayStyle={{ maxWidth: 460 }} overlayInnerStyle={{ maxWidth: 460 }}>
      <CalculatorOutlined style={{ color: 'var(--colorTextTertiary, #999)', fontSize: 12, flex: 'none', cursor: 'help' }} />
    </Tooltip>
  );
};

/**
 * Patch EVERY registered field model so a computed field shows the ⓘ formula tooltip wherever it renders
 * (form input, edit input, detail display). Enumerates the flow-engine model registry rather than a fixed
 * list, so all field types (number/text/date/boolean + plugin variants) are covered with no maintenance.
 * `fallbacks` are the classes imported directly (in case the registry misses them at this load moment).
 */
function patchAllFieldHints(flowEngine: any, fallbacks: any[] = []) {
  const tryPatchByName = (name: string): boolean => {
    if (!/Field/.test(name)) return false; // only field models render a collection value
    let C: any = null;
    try {
      C = flowEngine.getModelClass ? flowEngine.getModelClass(name) : flowEngine?._modelClasses?.get(name);
    } catch (_) {
      /* skip */
    }
    return !!(C?.prototype && patchComputedHint(C.prototype));
  };
  // (a) Eager: patch every field model already registered (core client-v2 models load before us).
  let patched = 0;
  try {
    const reg = flowEngine?._modelClasses;
    const names: string[] = reg && typeof reg.keys === 'function' ? Array.from(reg.keys()) : [];
    for (const name of names) if (tryPatchByName(name)) patched++;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[ptdl-computed] field-hint registry scan failed', e);
  }
  for (const C of fallbacks) if (C?.prototype && patchComputedHint(C.prototype)) patched++;
  // (b) Future: OTHER plugins (e.g. field-enhancements' PtdlNumberFieldModel) call registerModels AFTER
  // our load(), so a one-time scan misses them. Wrap registerModels once to patch any field model
  // registered later — deterministic, no setTimeout timing guesses.
  try {
    if (!flowEngine.__ptdlHintHook && typeof flowEngine.registerModels === 'function') {
      flowEngine.__ptdlHintHook = true;
      const orig = flowEngine.registerModels.bind(flowEngine);
      flowEngine.registerModels = function (models: any) {
        const ret = orig(models);
        try {
          for (const name of Object.keys(models || {})) tryPatchByName(name);
        } catch (_) {
          /* ignore */
        }
        return ret;
      };
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[ptdl-computed] registerModels hook failed', e);
  }
  // eslint-disable-next-line no-console
  console.log('[ptdl-computed] computed-field tooltip hint patched on', patched, 'field model(s) + future-registration hook');
}

/**
 * Wrap a COMPUTED field's rendered output with a small ⓘ calculator icon whose tooltip shows the
 * formula — so form/edit inputs and detail displays signal "this value is auto-computed on the server"
 * without hosting a config dialog there (config stays on the table-column ⚙ + the Settings page).
 * Wraps whichever of `renderComponent`/`render` the class OWNS; a pure passthrough for every non-computed
 * field, so it can't affect normal fields. Returns true if it patched at least one method.
 */
// The 🧮/hint icon repeats on EVERY row when the field renders inside a (sub-)table CELL — noisy. Hide it
// there (user request); the column-level entry point is the column ⚙. Cell detection: a row fieldIndex,
// or the model hanging directly under a *ColumnModel. Shared by both the computed and scan/window hints.
function isInCell(model: any): boolean {
  try {
    const fi = model?.context?.fieldIndex;
    if (Array.isArray(fi) && fi.length) return true;
    for (let cur: any = model, i = 0; cur && i < 3; cur = cur.parent, i++) {
      if (/ColumnModel/.test(cur?.constructor?.name || '')) return true;
    }
  } catch (_) {
    /* ignore */
  }
  return false;
}

function patchComputedHint(proto: any): boolean {
  if (!proto || proto.__ptdlComputedHint) return false;
  // Different field models expose their output via different methods: display/detail fields override
  // `renderComponent`, editable form inputs override `render`. Wrap whichever the class OWNS (never an
  // inherited base method — that would shadow it for unrelated models).
  const wrapMethod = (methodName: string): boolean => {
    if (!Object.prototype.hasOwnProperty.call(proto, methodName) || typeof proto[methodName] !== 'function') return false;
    const prev = proto[methodName];
    proto[methodName] = function (...args: any[]) {
      const out = prev.apply(this, args);
      try {
        // Already wrapped by a super-class's patched method (inheritance) → don't double-wrap.
        if (out && (out as any).props && (out as any).props['data-ptdl-hint']) return out;
        // In a FORM, the inner field model (e.g. NumberFieldModel) renders the input but the
        // `collectionField` lives on its parent FormItemModel — so resolve it from self OR up the chain
        // (table cells / detail displays carry it directly on the model).
        let cf: any = null;
        for (let cur: any = this, i = 0; cur && i < 4; cur = cur.parent, i++) {
          if (cur.collectionField) { cf = cur.collectionField; break; }
        }
        const r = cf && ruleCache.get(cacheKey(cf.dataSourceKey || 'main', cf.collectionName, cf.name));
        if (r && r.formula && React.isValidElement(out)) {
          // Clickable-to-edit ONLY when BOTH: (1) an EDITABLE field context (`render`, i.e. form/edit —
          // `renderComponent`/detail is view-only), AND (2) the user may edit rules (admin / data-source
          // manager). Everyone else — and every detail/view — gets a hover-only tooltip.
          // Editable form context: ComputedPreview WRAPS the control — when a live preview differs from
          // the stored value it swaps the control for the previewed number (control stays mounted but
          // hidden); otherwise it renders the control untouched. Display contexts render the value as-is.
          const content =
            methodName === 'render'
              ? React.createElement(ComputedPreview, { hostModel: this, cf, rule: r }, out)
              : out;
          const inCell = isInCell(this);
          return React.createElement(
            'span',
            { 'data-ptdl-hint': true, style: { display: 'inline-flex', alignItems: 'center', gap: 4, maxWidth: '100%' } },
            content,
            inCell ? null : React.createElement(ComputedHintIcon, { rule: r, cf, editable: methodName === 'render' && canEditRules }),
          );
        }
        // Not a COMPUTED field — check whether it's a SCAN/WINDOW-driven column instead (separate cache,
        // separate hover-only icon; see loadScanHintCache). No live preview here (scan values are a
        // stateful sequential scan, not a per-row pure formula, so a client-side "preview" would mislead).
        const sh = cf && scanHintCache.get(`${cf.collectionName}.${cf.name}`);
        if (sh && React.isValidElement(out)) {
          const inCell = isInCell(this);
          return React.createElement(
            'span',
            { 'data-ptdl-hint': true, style: { display: 'inline-flex', alignItems: 'center', gap: 4, maxWidth: '100%' } },
            out,
            inCell ? null : React.createElement(ScanHintIcon, { info: sh }),
          );
        }
      } catch (e) {
        /* ignore — always fall back to the un-wrapped field */
      }
      return out;
    };
    return true;
  };
  const a = wrapMethod('renderComponent');
  const b = wrapMethod('render');
  if (a || b) {
    proto.__ptdlComputedHint = true;
    return true;
  }
  return false;
}
