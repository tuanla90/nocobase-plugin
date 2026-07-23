import React, { useMemo, useState } from 'react';
import { Button, Popover, Checkbox, InputNumber, Tooltip, Typography, Popconfirm, Space, Divider } from 'antd';
import {
  ControlOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  VerticalRightOutlined,
  VerticalLeftOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { NS, t } from './i18n';
import {
  MyColSettings,
  Pin,
  getSettings,
  normalize,
  persist,
  reset,
} from './store';

/**
 * My Columns (per-user) — /v/ TableBlockModel.getColumns patch + the "My columns" toolbar action.
 *
 * The patch reads the current user's saved layout (module cache, keyed by the block uid) and, when the
 * UI editor is OFF, transforms the columns array (hide / reorder / width / pin) on a COPY. Everything is
 * try/catch guarded and falls back to the ORIGINAL columns on any error, so it can never white-screen.
 */

const PATCH_FLAG = '__ptdlMyColsPatched';
const REV_PROP = '__ptdlMyColsRev';

// Blocks whose getColumns has run — so a late cache load can force them to re-run getColumns.
const seenBlocks = new Set<any>();
let _rev = 1;
let _api: any = null; // captured in register() as a fallback source for the apiClient

function bumpBlock(blockModel: any): void {
  try {
    blockModel.setProps(REV_PROP, _rev++);
  } catch (_) {
    /* ignore */
  }
}

/** Force every mounted table block to recompute its columns (used after the cache first loads). */
export function bumpAllSeenBlocks(): void {
  for (const b of seenBlocks) bumpBlock(b);
}

function hasDataIndex(di: any): boolean {
  if (Array.isArray(di)) return di.length > 0;
  return di != null && di !== '';
}

/** Column identity key. Field columns have no `key` in props → falls through to the dataIndex path,
 *  matching the popover's enumeration (which derives the same key from the column model's props). */
function colKeyOf(p: any): string {
  if (!p) return '';
  const di = p.dataIndex;
  if (hasDataIndex(di)) return Array.isArray(di) ? di.join('.') : String(di);
  return p.key != null ? String(p.key) : '';
}

function regroupByFixed(cols: any[]): any[] {
  const left: any[] = [];
  const mid: any[] = [];
  const right: any[] = [];
  for (const c of cols) {
    if (c && c.fixed === 'left') left.push(c);
    else if (c && c.fixed === 'right') right.push(c);
    else mid.push(c);
  }
  return [...left, ...mid, ...right];
}

/**
 * Apply the per-user settings to the (already core-adjusted) columns array. Operates on copies; structural
 * columns (row-actions / 'empty' / 'addColumn' — anything without a real dataIndex) are never hidden or
 * reordered, only kept in place. Re-groups by `fixed` at the end so pins land in the sticky groups.
 */
export function applyMyCols(cols: any[], s: MyColSettings): any[] {
  const hidden = new Set(s.hidden || []);
  const widths = s.widths || {};
  const pinned = s.pinned || {};
  const order = Array.isArray(s.order) ? s.order : [];
  const orderIdx = new Map<string, number>();
  order.forEach((k, i) => {
    if (!orderIdx.has(k)) orderIdx.set(k, i);
  });

  // Managed (field) columns, in original order.
  const fieldEntries: { key: string; col: any }[] = [];
  for (const col of cols) {
    if (!col || !hasDataIndex(col.dataIndex)) continue;
    fieldEntries.push({ key: colKeyOf(col), col });
  }

  // HIDE + WIDTH + PIN (on copies).
  const kept = fieldEntries
    .filter((e) => !hidden.has(e.key))
    .map((e) => {
      const c = { ...e.col };
      if (widths[e.key] != null) c.width = widths[e.key];
      const pin = pinned[e.key];
      if (pin === 'left' || pin === 'right') c.fixed = pin;
      else if (c.fixed === 'left' || c.fixed === 'right') delete c.fixed; // un-pin a col that had a default fixed
      return { key: e.key, col: c };
    });

  // REORDER: stable-sort by the saved order (listed keys first; unlisted keep relative order).
  kept.sort((a, b) => {
    const ia = orderIdx.has(a.key) ? (orderIdx.get(a.key) as number) : Number.POSITIVE_INFINITY;
    const ib = orderIdx.has(b.key) ? (orderIdx.get(b.key) as number) : Number.POSITIVE_INFINITY;
    return ia - ib;
  });
  const reordered = kept.map((e) => e.col);

  // Reassemble: fill field-column slots (in their original positions) with the reordered field cols;
  // keep structural columns exactly where they were. Hidden field cols drop their slot, and
  // reordered.length matches the number of remaining field slots, so it maps 1:1.
  const out: any[] = [];
  let fi = 0;
  for (const col of cols) {
    if (col && hasDataIndex(col.dataIndex)) {
      if (hidden.has(colKeyOf(col))) continue;
      if (fi < reordered.length) out.push(reordered[fi++]);
    } else {
      out.push(col);
    }
  }
  while (fi < reordered.length) out.push(reordered[fi++]);

  return regroupByFixed(out);
}

function isEditorOn(model: any): boolean {
  try {
    if (model?.context?.flowSettingsEnabled != null) return !!model.context.flowSettingsEnabled;
  } catch (_) {
    /* fall through */
  }
  return false;
}

/** Patch TableBlockModel.getColumns once (idempotent). Crash-safe: returns the original columns on error. */
function patchGetColumns(TableBlockModel: any): void {
  const proto = TableBlockModel?.prototype;
  if (!proto || proto[PATCH_FLAG] || typeof proto.getColumns !== 'function') return;
  const orig = proto.getColumns;
  proto.getColumns = function (...args: any[]) {
    const cols = orig.apply(this, args) || [];
    try {
      // Touch the re-render trigger prop so this autorun re-runs when a popover change bumps it.
      // (props is a formily proxy — reading an unknown key still subscribes.)
      void (this.props ? this.props[REV_PROP] : undefined);
      seenBlocks.add(this);
      if (!Array.isArray(cols)) return cols;
      // UI-editor / designer mode → show everything unfiltered (the designer must see all columns).
      if (isEditorOn(this)) return cols;
      const settings = getSettings(this.uid);
      if (!settings) return cols;
      return applyMyCols(cols, settings);
    } catch (e) {
      // eslint-disable-next-line no-console
      try {
        console.warn('[my-columns] getColumns transform failed (using original)', e);
      } catch (_) {
        /* ignore */
      }
      return cols;
    }
  };
  proto[PATCH_FLAG] = true;
}

// ── Popover UI ────────────────────────────────────────────────────────────────────────────────────

interface ColItem {
  key: string;
  label: string;
}

/** All FIELD columns of the block (incl. hidden ones) — enumerated from the models, NOT the patched
 *  getColumns, so hidden columns still appear (so the user can show them again). */
function listFieldColumns(blockModel: any): ColItem[] {
  const out: ColItem[] = [];
  try {
    blockModel.mapSubModels('columns', (cm: any) => {
      const p = (cm && cm.props) || {};
      if (!hasDataIndex(p.dataIndex)) return null; // skip row-actions / structural columns
      const key = colKeyOf(p);
      if (!key) return null;
      let label = '';
      if (typeof p.title === 'string' && p.title) label = p.title;
      else if (cm?.collectionField?.title) label = String(cm.collectionField.title);
      else if (typeof cm?.title === 'string' && cm.title) label = cm.title;
      if (!label) label = key;
      out.push({ key, label });
      return null;
    });
  } catch (_) {
    /* ignore */
  }
  return out;
}

/** Order the popover rows the same way the table shows them (saved order first, then the rest). */
function orderList(cols: ColItem[], s: MyColSettings): ColItem[] {
  const order = Array.isArray(s.order) ? s.order : [];
  const idx = new Map<string, number>();
  order.forEach((k, i) => {
    if (!idx.has(k)) idx.set(k, i);
  });
  return [...cols].sort((a, b) => {
    const ia = idx.has(a.key) ? (idx.get(a.key) as number) : Number.POSITIVE_INFINITY;
    const ib = idx.has(b.key) ? (idx.get(b.key) as number) : Number.POSITIVE_INFINITY;
    return ia - ib;
  });
}

function apiOf(model: any): any {
  return model?.context?.app?.apiClient || model?.context?.api || _api || null;
}

const MyColumnsPanel: React.FC<{ blockModel: any; tableUid: string; api: any }> = ({ blockModel, tableUid, api }) => {
  const cols = useMemo(() => listFieldColumns(blockModel), [blockModel]);
  const [draft, setDraft] = useState<MyColSettings>(() => normalize(getSettings(tableUid) || {}));

  const ordered = useMemo(() => orderList(cols, draft), [cols, draft]);
  const hidden = new Set(draft.hidden || []);
  const pinned = draft.pinned || {};
  const widths = draft.widths || {};

  const commit = (next: MyColSettings) => {
    const n = normalize(next);
    setDraft(n);
    persist(api, tableUid, n);
    bumpBlock(blockModel);
  };

  const toggleVis = (key: string) => {
    const h = new Set(draft.hidden || []);
    if (h.has(key)) h.delete(key);
    else h.add(key);
    commit({ ...draft, hidden: Array.from(h) });
  };

  const move = (key: string, dir: -1 | 1) => {
    const keys = ordered.map((o) => o.key);
    const i = keys.indexOf(key);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= keys.length) return;
    const tmp = keys[i];
    keys[i] = keys[j];
    keys[j] = tmp;
    commit({ ...draft, order: keys });
  };

  const setPin = (key: string, val?: Pin) => {
    const p: Record<string, Pin> = { ...(draft.pinned || {}) };
    if (val) p[key] = val;
    else delete p[key];
    commit({ ...draft, pinned: p });
  };

  const setWidth = (key: string, n: number | null) => {
    const w: Record<string, number> = { ...(draft.widths || {}) };
    if (n && Number.isFinite(n) && n > 0) w[key] = Math.round(n);
    else delete w[key];
    commit({ ...draft, widths: w });
  };

  const doReset = () => {
    setDraft({});
    reset(api, tableUid);
    bumpBlock(blockModel);
  };

  return (
    <div style={{ width: 380, maxWidth: '92vw' }}>
      <div style={{ marginBottom: 6 }}>
        <Typography.Text strong>{t('Tuỳ chỉnh cột — chỉ riêng bạn')}</Typography.Text>
        <div>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {t('Mỗi người có bố cục cột riêng; không ảnh hưởng người khác.')}
          </Typography.Text>
        </div>
      </div>
      <Divider style={{ margin: '8px 0' }} />
      <div style={{ maxHeight: 340, overflowY: 'auto', overflowX: 'hidden' }}>
        {ordered.length === 0 ? (
          <Typography.Text type="secondary">{t('Không có cột nào')}</Typography.Text>
        ) : (
          ordered.map((c, i) => {
            const pin = pinned[c.key];
            const visible = !hidden.has(c.key);
            return (
              <div
                key={c.key}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', minHeight: 32 }}
              >
                <Space.Compact size="small">
                  <Tooltip title={t('Lên')}>
                    <Button size="small" type="text" icon={<ArrowUpOutlined />} disabled={i === 0} onClick={() => move(c.key, -1)} />
                  </Tooltip>
                  <Tooltip title={t('Xuống')}>
                    <Button
                      size="small"
                      type="text"
                      icon={<ArrowDownOutlined />}
                      disabled={i === ordered.length - 1}
                      onClick={() => move(c.key, 1)}
                    />
                  </Tooltip>
                </Space.Compact>
                <Checkbox checked={visible} onChange={() => toggleVis(c.key)} style={{ flex: 1, minWidth: 0 }}>
                  <span
                    title={c.label}
                    style={{
                      display: 'inline-block',
                      maxWidth: 150,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      verticalAlign: 'middle',
                      opacity: visible ? 1 : 0.45,
                    }}
                  >
                    {c.label}
                  </span>
                </Checkbox>
                <InputNumber
                  size="small"
                  min={50}
                  max={1000}
                  step={10}
                  value={widths[c.key] ?? null}
                  placeholder={t('Tự động')}
                  onChange={(v) => setWidth(c.key, v as number | null)}
                  style={{ width: 74 }}
                  controls={false}
                />
                <Space.Compact size="small">
                  <Tooltip title={t('Ghim trái')}>
                    <Button
                      size="small"
                      type={pin === 'left' ? 'primary' : 'text'}
                      icon={<VerticalRightOutlined />}
                      onClick={() => setPin(c.key, pin === 'left' ? undefined : 'left')}
                    />
                  </Tooltip>
                  <Tooltip title={t('Ghim phải')}>
                    <Button
                      size="small"
                      type={pin === 'right' ? 'primary' : 'text'}
                      icon={<VerticalLeftOutlined />}
                      onClick={() => setPin(c.key, pin === 'right' ? undefined : 'right')}
                    />
                  </Tooltip>
                </Space.Compact>
              </div>
            );
          })
        )}
      </div>
      <Divider style={{ margin: '8px 0' }} />
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Popconfirm title={t('Đặt lại bố cục cột của bạn về mặc định?')} onConfirm={doReset} okText={t('Đặt lại')}>
          <Button size="small" type="text" danger icon={<ReloadOutlined />}>
            {t('Đặt lại')}
          </Button>
        </Popconfirm>
      </div>
    </div>
  );
};

const MyColumnsButton: React.FC<{ model: any }> = ({ model }) => {
  const [open, setOpen] = useState(false);
  const blockModel = model?.context?.blockModel;
  const tableUid = blockModel?.uid ? String(blockModel.uid) : '';
  const api = apiOf(model);

  if (!blockModel || !tableUid) {
    // Not on a table block context — render an inert button rather than crash.
    return (
      <Button size="small" icon={<ControlOutlined />}>
        {t('Cột của tôi')}
      </Button>
    );
  }

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger="click"
      placement="bottomRight"
      destroyTooltipOnHide
      content={open ? <MyColumnsPanel blockModel={blockModel} tableUid={tableUid} api={api} /> : null}
    >
      <Button size="small" icon={<ControlOutlined />} onClick={(e) => e.stopPropagation()}>
        {t('Cột của tôi')}
      </Button>
    </Popover>
  );
};

// ── Registration ────────────────────────────────────────────────────────────────────────────────

/**
 * Register the getColumns patch + the "My columns" collection-scene action model. The action is added to a
 * table's action bar once (via the toolbar "＋ Actions" menu in UI-editor mode); after that EVERY logged-in
 * user sees it and personalises their own view — it is NOT gated to editors.
 */
export function registerMyColumns(deps: { flowEngine: any; app?: any; api?: any; tExpr: (s: string, o?: any) => any }): void {
  const { flowEngine, app, api, tExpr } = deps;
  if (!flowEngine || typeof flowEngine.getModelClass !== 'function') return;
  _api = api || app?.apiClient || null;
  try {
    (window as any).__ptdlMyCols = '0.1.0';
  } catch (_) {
    /* ignore */
  }

  const TableBlockModel: any = flowEngine.getModelClass('TableBlockModel');
  if (!TableBlockModel) return; // classic lane — no /v/ table models
  patchGetColumns(TableBlockModel);

  const te = (s: string) => {
    try {
      return tExpr ? tExpr(s, { ns: NS }) : s;
    } catch (_) {
      return s;
    }
  };

  // Register the action model (retry until the ActionModel base is available, like the reference actions).
  const bind = (attempt = 0) => {
    let ActionBase: any = null;
    try {
      ActionBase = flowEngine.getModelClass('ActionModel');
    } catch (_) {
      ActionBase = null;
    }
    if (!ActionBase) {
      if (attempt < 15) setTimeout(() => bind(attempt + 1), 800);
      return;
    }
    try {
      if (flowEngine.getModelClass('PtdlMyColumnsActionModel')) return; // already registered
    } catch (_) {
      /* ignore */
    }

    class PtdlMyColumnsActionModel extends ActionBase {
      static scene = 'collection';
      enableEditTitle = false;
      enableEditIcon = false;
      enableEditType = false;
      enableEditDanger = false;
      enableEditColor = false;

      defaultProps: any = { title: t('Cột của tôi'), icon: 'ControlOutlined' };

      // A user who can VIEW the table can use it (no extra permission) — every logged-in user.
      getAclActionName() {
        return 'view';
      }

      render() {
        return <MyColumnsButton model={this} />;
      }
    }

    try {
      flowEngine.registerModels({ PtdlMyColumnsActionModel });
      (PtdlMyColumnsActionModel as any).define({ label: te('Cột của tôi (cá nhân)'), sort: 62 });
      // eslint-disable-next-line no-console
      console.log('[my-columns] registered PtdlMyColumnsActionModel');
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[my-columns] action register failed (ignored)', e);
    }
  };
  bind();
}
