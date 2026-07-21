import { message } from 'antd';

/**
 * SHARED inline quick-edit plumbing — one implementation used by every widget whose DISPLAY cell can be made
 * directly click-to-edit-and-save (button group, star rating, progress bar, rich select). Extracted from
 * selectButtonsModel so the persistence path lives in exactly ONE place instead of being copy-pasted per
 * widget (they would silently drift otherwise).
 *
 * The pattern: a table cell renders a DISPLAY field-model. That model's `context` carries the same handles
 * NocoBase gives every cell — `context.api` (APIClient) and `context.record` (the observable row). We write
 * one field back with `api.resource(collection).update({ filterByTk, values })` — verified live — and mutate
 * the observable row IN PLACE so ONLY that cell re-renders (deliberately NO `resource.refresh()`, which would
 * refetch the whole block and flicker the table). The server write is optimistic with rollback on failure.
 */

// Resolve a model's collectionField, walking up `.parent` — a SubTableColumnModel's column model (or an
// inner field-model rendered inside a form) doesn't always carry `collectionField` directly on itself; it
// can live on a parent (e.g. a FormItemModel). `model.collectionField` is a getter whose body is just
// `return this.context.collectionField`, so walking `.parent` is the only real fallback.
export function resolveCf(model: any): any {
  for (let cur: any = model, i = 0; cur && i < 4; cur = cur.parent, i++) {
    if (cur?.collectionField) return cur.collectionField;
  }
  return null;
}

// The display widget becomes click-to-save (instead of needing the pencil → popover) when EITHER:
//   (a) the core per-column "Enable quick edit" switch is on → `props.editable === true` on the COLUMN model, or
//   (b) our block-level "Instant edit" is on → `props.ptdlIeEnabled === true` on the TABLE BLOCK model, and
//       this field isn't in the block's `props.ptdlIeExcluded` opt-out list.
// Our display field-model renders INSIDE the column which is inside the block, so we walk up `.parent`
// (same idea as resolveCf) to find whichever ancestor carries the flag. Bounded walk (≤8) is loop-safe.
export function isQuickEditCell(model: any): boolean {
  let field: string | undefined;
  try { field = resolveCf(model)?.name; } catch (_) { field = undefined; }
  for (let cur: any = model, i = 0; cur && i < 8; cur = cur.parent, i++) {
    const p = cur?.props;
    if (!p) continue;
    if (p.editable === true) return true;
    if (p.ptdlIeEnabled === true) {
      const ex = p.ptdlIeExcluded;
      if (Array.isArray(ex) && field && ex.includes(field)) return false; // explicitly kept read-only
      return true;
    }
  }
  return false;
}

/**
 * Persist ONE field on the current row directly (inline quick-edit). OPTIMISTIC IN-PLACE: mutate the
 * observable row so only this cell re-renders, then fire the server write; on failure roll the on-screen
 * value back and surface a toast. Never throws — safe to call straight from an onClick without a try/catch.
 *
 * `options.payload` lets the value SHOWN on screen differ from the value SENT to the server — needed for
 * relations, where the optimistic UI wants the full record (to render title/avatar) but the server only
 * needs the target key (associate-by-pk, don't accidentally update the target's own fields).
 */
export async function quickInlineSave(model: any, value: any, options?: { payload?: any; record?: any; api?: any }): Promise<void> {
  const ctx: any = model?.context || {};
  const cf = resolveCf(model);
  // `options.record`/`options.api` let a caller that holds the COLUMN model (whose `context.record` is not a
  // single row — e.g. the Instant-edit in-cell editor) supply the row + APIClient explicitly.
  const api = options?.api || ctx.api || ctx.blockModel?.context?.api || model?.flowEngine?.context?.api;
  const record = options && 'record' in options ? options.record : ctx.record;
  const fieldName = cf?.name;
  const collectionName = cf?.collectionName || cf?.collection?.name || ctx.collection?.name;
  const pkName = cf?.collection?.filterTargetKey || ctx.collection?.filterTargetKey || 'id';
  const pk = record?.[pkName] ?? record?.id;
  if (!api?.resource || !collectionName || !fieldName || pk == null) {
    // eslint-disable-next-line no-console
    console.warn('[field-enh] inline quick-edit skipped — missing api/collection/field/pk', { collectionName, fieldName, pk });
    return;
  }
  const payload = options && 'payload' in options ? options.payload : value;
  const prev = record ? record[fieldName] : undefined;
  if (record) record[fieldName] = value; // optimistic — observable row updates just this cell, no refetch
  try {
    await api.resource(collectionName).update({ filterByTk: pk, values: { [fieldName]: payload } });
  } catch (e) {
    if (record) record[fieldName] = prev; // rollback the on-screen value
    try {
      const t = ctx.t || ((s: string) => s);
      message.error(t('Save failed'));
    } catch (_) { /* toast is best-effort */ }
    // eslint-disable-next-line no-console
    console.warn('[field-enh] inline quick-edit save failed', e);
  }
}
