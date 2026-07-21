/**
 * LIVE CLIENT-SIDE PREVIEW of a computed field inside a form (Phase 1).
 *
 * The stored rule's formula is evaluated IN THE BROWSER with the same isomorphic engine
 * (`evaluateFormula`) the server uses, against the form's CURRENT (unsaved) values — so the user sees
 * the number they're about to get while typing. The server remains the source of truth: it recomputes
 * on save; this is display-only (never written into form values, so nothing fake gets submitted).
 *
 * Dep kinds → where preview data comes from:
 *   • local `data.a`            → the form values (live per keystroke, via FormValueRuntime's proxy)
 *   • to-many `SUM(data.items.x)` → the form's OWN sub-table rows if present (live, incl. unsaved rows;
 *                                  child rows' own computed fields are evaluated 1 level deep) — else
 *                                  the saved children fetched once (edit) / [] (create)
 *   • to-one `data.product.y`   → form value object if the picker set one, else fetched by FK (cached)
 *   • bare table `bang.he_so`   → the whole (small) lookup collection fetched once (cached)
 *
 * Reactivity: FormBlockModel.formValueRuntime.formValues is a proxy over an observable mirror —
 * reading it inside `observer` re-renders exactly when a read path changes. Async fetches bump a local
 * tick when they land. Hidden when: no form host, rule wouldn't fire on this save (trigger gating),
 * evaluation fails, or the preview equals the currently stored value.
 */
import React from 'react';
import { Tooltip } from 'antd';
import { observer } from '@nocobase/flow-engine';
import { evaluateFormula } from './formulaEngine';
import { splitTriggers } from './formulaKnowledge';
import { t } from './i18n';

// ---------- wiring from computedRuleClient (avoids a circular import) ----------
let api: any = null;
let rulesProvider: () => any[] = () => [];
export function setPreviewApi(a: any) {
  api = a;
}
/** computedRuleClient hands us a live view of the rule cache (all rules, all collections). */
export function setPreviewRulesProvider(fn: () => any[]) {
  rulesProvider = fn;
}
const rulesOf = (collection: string) =>
  rulesProvider().filter((r) => r && r.collectionName === collection && r.enabled !== false && (r.formula || '').trim());

// ---------- module-level caches (session-scoped; deduped in-flight promises) ----------
const relCache = new Map<string, any>(); // `${coll}#${key}` -> record|rows|null | Promise
const tblCache = new Map<string, any>(); // collection -> rows[]|null | Promise
const metaCache = new Map<string, any>(); // collection -> Map(field -> meta)|null | Promise

/** Sync read-through cache: returns the value, or undefined while the load is in flight. */
function cached(map: Map<string, any>, key: string, load: () => Promise<any>, onDone: () => void): any {
  const cur = map.get(key);
  if (cur !== undefined && !(cur instanceof Promise)) return cur;
  if (cur === undefined) {
    const p = load()
      .then((v) => map.set(key, v ?? null))
      .catch(() => map.set(key, null))
      .then(() => onDone());
    map.set(key, p);
  }
  return undefined;
}

const unwrapList = (res: any) => res?.data?.data ?? res?.data ?? [];

/** Field metadata (name → {type,target,foreignKey}) — prefer the client collection object, fall back to API. */
function getMeta(collection: string, hintColl: any, onDone: () => void): Map<string, any> | null | undefined {
  const hit = metaCache.get(collection);
  if (hit !== undefined && !(hit instanceof Promise)) return hit;
  // client-side collection object (no network)
  try {
    const fs = hintColl?.getFields?.();
    if (Array.isArray(fs) && fs.length) {
      const m = new Map<string, any>();
      for (const f of fs) {
        const o = f?.options || f || {};
        m.set(f.name || o.name, {
          type: f.type || o.type,
          target: f.target ?? o.target,
          foreignKey: f.foreignKey ?? o.foreignKey,
          targetKey: f.targetKey ?? o.targetKey,
        });
      }
      metaCache.set(collection, m);
      return m;
    }
  } catch (e) {
    /* fall through to API */
  }
  return cached(
    metaCache,
    collection,
    async () => {
      const res = await api?.request?.({ url: `collections/${collection}/fields:list`, params: { paginate: false } });
      const m = new Map<string, any>();
      for (const f of unwrapList(res)) m.set(f.name, { type: f.type, target: f.target, foreignKey: f.foreignKey, targetKey: f.targetKey });
      return m.size ? m : null;
    },
    onDone,
  );
}

// ---------- formula text analysis (mirrors the server's deriveDeps heads) ----------
/** Blank out string literals so `"a.b"` inside quotes is never mistaken for a table/relation ref. */
function stripStrings(formula: string): string {
  return String(formula).replace(/"[^"]*"|'[^']*'/g, '""');
}
/** `data.<rel>.<field>` relation heads. */
function relHeads(formula: string): string[] {
  const out = new Set<string>();
  const re = /\bdata\s*\.\s*([A-Za-z_]\w*)\s*\.\s*[A-Za-z_]\w*/g;
  const src = stripStrings(formula);
  let m: any;
  while ((m = re.exec(src))) out.add(m[1]);
  return [...out];
}
/** bare `<table>.<col>` heads (lookup tables — anything dotted whose head isn't `data`). */
function tableHeads(formula: string, meta: Map<string, any> | null): string[] {
  const out = new Set<string>();
  const re = /(^|[^.\w])([A-Za-z_]\w*)\s*\.\s*[A-Za-z_]\w*/g;
  const src = stripStrings(formula);
  let m: any;
  while ((m = re.exec(src))) {
    const head = m[2];
    if (head === 'data' || head === 'value' || head === 'record') continue;
    if (meta && meta.has(head)) continue; // a field/relation of this collection, not a table
    out.add(head);
  }
  return [...out];
}

// ---------- the evaluator (sync over caches; kicks fetches and reports pending) ----------
type Ctx = { onDone: () => void; depth: number };

/**
 * Evaluate EVERY rule of `collection` against `base` (form values / a child row). Two passes so a rule
 * that reads a sibling computed field (total = subtotal − discount) sees the sibling's fresh preview.
 * Returns previews + whether anything is still waiting on a fetch.
 */
function evalCollectionPreviews(collection: string, base: any, hintColl: any, ctx: Ctx): { previews: Record<string, any>; pending: boolean } {
  const previews: Record<string, any> = {};
  let pending = false;
  const rules = rulesOf(collection);
  if (!rules.length) return { previews, pending };
  const meta = getMeta(collection, hintColl, ctx.onDone);
  if (meta === undefined) return { previews, pending: true };

  for (let pass = 0; pass < 2; pass++) {
    for (const rule of rules) {
      const formula = String(rule.formula || '');
      const data: any = { ...base, ...previews };
      let skip = false;

      // 1) relation heads → make sure data.<rel> is usable
      for (const rel of relHeads(formula)) {
        const fm = meta?.get(rel);
        const val = data[rel];
        if (Array.isArray(val)) {
          // sub-table rows in the form (may be unsaved) → evaluate the CHILD's own computed fields
          // one level deep so aggregates sum fresh numbers, not stale/empty ones.
          if (ctx.depth < 1 && fm?.target && rulesOf(fm.target).length) {
            let rowsPending = false;
            const childColl = hintColl?.collectionManager?.getCollection?.(fm.target);
            data[rel] = val.map((row: any) => {
              if (!row || typeof row !== 'object') return row;
              const r = evalCollectionPreviews(fm.target, row, childColl, { ...ctx, depth: ctx.depth + 1 });
              if (r.pending) rowsPending = true;
              return { ...row, ...r.previews };
            });
            if (rowsPending) pending = true;
          }
          continue;
        }
        if (val && typeof val === 'object') continue; // picker already set the object
        if (!fm) continue; // unknown → let the engine see undefined
        if (fm.target && ['belongsTo', 'hasOne'].includes(fm.type)) {
          const fk = fm.foreignKey || `${rel}_id`;
          const fkVal = data[fk];
          if (fkVal == null) { skip = true; break; } // nothing selected yet → no preview
          const rec = cached(relCache, `${fm.target}#${fkVal}`, async () => {
            const res = await api?.request?.({ url: `${fm.target}:get`, params: { filterByTk: fkVal } });
            return res?.data?.data ?? null;
          }, ctx.onDone);
          if (rec === undefined) { pending = true; skip = true; break; }
          if (rec === null) { skip = true; break; }
          data[rel] = rec;
        } else if (fm.target && ['hasMany', 'belongsToMany'].includes(fm.type)) {
          // no sub-table in the form → saved children (edit) / none (create)
          const pk = data.id;
          if (pk == null) { data[rel] = []; continue; }
          const fk = fm.foreignKey;
          if (!fk) { skip = true; break; }
          const rows = cached(relCache, `${fm.target}#${fk}=${pk}`, async () => {
            const res = await api?.request?.({ url: `${fm.target}:list`, params: { pageSize: 500, filter: JSON.stringify({ [fk]: pk }) } });
            return unwrapList(res);
          }, ctx.onDone);
          if (rows === undefined) { pending = true; skip = true; break; }
          data[rel] = rows || [];
        }
      }
      if (skip) continue;

      // 2) lookup tables → fetch whole (small) collections once
      const tables: Record<string, any[]> = {};
      for (const tb of tableHeads(formula, meta)) {
        const rows = cached(tblCache, tb, async () => {
          const res = await api?.request?.({ url: `${tb}:list`, params: { pageSize: 1000 } });
          return unwrapList(res);
        }, ctx.onDone);
        if (rows === undefined) { pending = true; skip = true; break; }
        if (rows === null) { skip = true; break; } // not a collection / no access → can't preview this rule
        tables[tb] = rows;
      }
      if (skip) continue;

      const res = evaluateFormula(formula, data, base?.[rule.targetField], tables);
      if (!(res as any).error) previews[rule.targetField] = (res as any).value;
    }
  }
  return { previews, pending };
}

// ---------- helpers ----------
function findFormHost(model: any): { block: any; runtime: any } | null {
  for (let cur = model, i = 0; cur && i < 10; cur = cur.parent, i++) {
    if (cur.formValueRuntime || (cur.form && typeof cur.form.getFieldsValue === 'function')) {
      return { block: cur, runtime: cur.formValueRuntime || null };
    }
  }
  return null;
}

const isNum = (v: any) => typeof v === 'number' && Number.isFinite(v);
function sameValue(a: any, b: any): boolean {
  if (a == null && b == null) return true;
  const na = typeof a === 'string' && a.trim() !== '' ? Number(a) : a;
  const nb = typeof b === 'string' && b.trim() !== '' ? Number(b) : b;
  if (isNum(na) && isNum(nb)) return Math.abs(na - nb) < 1e-9;
  return String(a) === String(b);
}
function fmt(v: any): string {
  if (v == null) return '—';
  if (isNum(v)) return v.toLocaleString();
  if (v instanceof Date) return v.toLocaleDateString();
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return String(v);
}

/**
 * Wraps a computed field's EDITABLE form control. When a live preview exists and differs from the
 * stored value, the control is visually REPLACED by the previewed number (user chose: "looks as if
 * already saved" — plain, non-editable, normal colour; their users know the convention). The original
 * control stays MOUNTED but hidden (display:none) so the form binding is untouched and nothing fake is
 * ever submitted. In every other case (outside a form, trigger-gated, loading, error, equal value) the
 * original control renders unchanged.
 */
export const ComputedPreview: React.FC<{ hostModel: any; cf: any; rule: any; children?: any }> = (props) => {
  const host = React.useMemo(() => findFormHost(props.hostModel), [props.hostModel]);
  if (!host) return props.children ?? null;
  const blockColl = host.block?.collection?.name;
  // A computed cell inside a SUB-TABLE row walks up to the PARENT form host — evaluate it against the
  // ROW's values, located via the cell's `context.fieldIndex` (segments like "items:1", nested-capable).
  let rowPath: Array<{ rel: string; idx: number }> | null = null;
  if (blockColl && blockColl !== props.cf?.collectionName) {
    const fi = props.hostModel?.context?.fieldIndex;
    if (!Array.isArray(fi) || !fi.length) return props.children ?? null;
    const segs = fi.map((s: any) => {
      const m = /^(.+):(\d+)$/.exec(String(s));
      return m ? { rel: m[1], idx: Number(m[2]) } : null;
    });
    if (segs.some((x: any) => !x)) return props.children ?? null;
    rowPath = segs as any;
  }
  return React.createElement(PreviewInner as any, { ...props, host, rowPath });
};

const PreviewInner: React.FC<any> = observer((props: any) => {
  const { cf, rule, host, rowPath, children } = props;
  const [, force] = React.useReducer((x: number) => x + 1, 0);
  const onDone = React.useCallback(() => force(), []);
  const orig = children ?? null; // the real (bound) control — default rendering for every bail-out path
  try {
    // Reading via the runtime's proxy tracks the read paths → observer re-renders on form edits.
    const values: any = host.runtime ? host.runtime.formValues : host.block?.form?.getFieldsValue?.(true);
    if (!values || typeof values !== 'object') return orig;

    // Row scope: a sub-table cell evaluates against ITS row's (possibly unsaved) values.
    let base: any = values;
    if (rowPath) {
      for (const seg of rowPath) {
        base = base?.[seg.rel]?.[seg.idx];
        if (!base || typeof base !== 'object') return orig;
      }
    }

    // trigger gating: only show a number the server would actually write on THIS save
    const pk = host.block?.collection?.filterTargetKey || 'id';
    const ctor = host.block?.constructor?.name || '';
    const isCreate = rowPath
      ? base.id == null // a sub-table row is "created" iff it has no pk yet, whatever the outer form is
      : /Create/i.test(ctor) || (!/Edit/i.test(ctor) && values[pk] == null);
    const trig = new Set(splitTriggers(rule?.runOn));
    if (isCreate ? !trig.has('create') : !(trig.has('update') || trig.has('source'))) return orig;

    const hintColl = rowPath
      ? host.block?.collection?.collectionManager?.getCollection?.(cf.collectionName)
      : host.block?.collection;
    const stored = base[cf.name];

    // We're PAST the trigger gate → the server WILL (re)compute this field on this save, so its value is
    // server-controlled and the user must never type into it. REPLACE the control with a read-only number
    // in EVERY branch below — never fall back to the raw editable `orig`. The hidden `orig` stays mounted
    // so the form binding/submit is untouched; the tooltip shows the currently-stored value only when the
    // live preview differs from it.
    //
    // Before this, three branches fell back to `orig` (the editable input): preview pending / not
    // evaluable client-side (309–310), and — the common one — the live preview EQUAL to the stored value
    // (313). Inside a sub-table that made a computed cell flip-flop row-by-row over its lifecycle: an
    // empty new row showed an input (can't evaluate yet), a new row with inputs showed the read-only
    // number, then once saved (stored == computed) it reverted to an input again ("dòng cũ thì không
    // display-only"). Rendering read-only unconditionally here keeps the column consistently non-editable.
    const readOnly = (display: any, showStored: boolean) => (
      <>
        <span style={{ display: 'none' }}>{orig}</span>
        <Tooltip title={showStored && stored != null ? `${t('Số đã lưu')}: ${fmt(stored)}` : undefined}>
          <span style={{ display: 'inline-flex', alignItems: 'center', minHeight: 24, whiteSpace: 'nowrap' }}>
            {fmt(display)}
          </span>
        </Tooltip>
      </>
    );

    const { previews, pending } = evalCollectionPreviews(cf.collectionName, base, hintColl, {
      onDone,
      depth: rowPath ? 1 : 0,
    });
    // No fresh preview yet (still loading) or at all (this formula isn't evaluable in the browser) → show
    // the STORED value read-only, so the cell stays non-editable AND an already-saved value stays visible.
    if (pending) return readOnly(stored, false);
    if (!(cf.name in previews)) return readOnly(stored, false);
    const val = previews[cf.name];
    if (val == null || (typeof val === 'number' && !Number.isFinite(val))) return readOnly(stored, false);
    // Preview available → show it read-only; surface the "saved value" tooltip only when it will change.
    return readOnly(val, !sameValue(val, stored));
  } catch (e) {
    return orig; // preview must never break a form
  }
});
