import React, { useEffect, useState } from 'react';
import { Button, Select, Switch, Space, Tooltip, theme, InputNumber } from 'antd';
import {
  ColorField, colorToString, RegistryIconPicker, IconByKey, setIconRegistry,
  evalConditionOp, get, SettingCard, SettingRow, ConditionRow, SegmentedGroup, registerFlowComponentsOnce } from '@tuanla90/shared';
import {
  globalRulesFor, globalRulesVersion, upsertGlobalRules,
  loadGlobalRulesCache, bindGlobalRulesAutoRefresh,
} from './globalRulesStore';

/**
 * BLOCK-LEVEL conditional formatting (bản A — kiểu "linkage rules" của NocoBase).
 *
 * Mỗi rule = phần ĐIỀU KIỆN (nhiều condition tham chiếu BẤT KỲ field nào, kể cả xuyên quan hệ, nối AND/OR)
 * + phần CHỌN CỘT ÁP + format (màu chữ/nền/đậm/nghiêng/viền/ICON). Đánh giá theo TỪNG DÒNG, áp vào ô của các
 * cột đích → tô được MỌI cột.
 *
 * UI dùng lại đồ chung của workspace: `FieldPickerCascader` (chọn field lazy drill-deep), condition kit
 * `@tuanla90/shared/condition` (operator theo type + value input thông minh + evaluator client — lineage từ
 * filter-tree), `RegistryIconPicker`/`IconByKey` (icon registry custom-icons), `ColorField`.
 *
 * Cơ chế áp: patch `TableBlockModel.getColumns()` → bọc `onCell` (style ô: màu/nền/đậm/nghiêng/viền) + bọc
 * `render` (chèn icon trước nội dung — icon là CONTENT nên không đi qua onCell/style được). CRASH-SAFE: mọi
 * lỗi ở khâu này rơi về hành vi gốc, không được làm trắng trang. Lane: chỉ /v/ (classic không có TableBlockModel).
 */

// i18n namespace for this plugin's own labels (registered per-lane via app.i18n.addResources).
export const NS = '@tuanla90/plugin-conditional-format/client';

// Runtime translator for this plugin's own React render strings (settings-dialog labels, Segmented
// options, placeholders, preview text). Injected from the app i18n in registerTableConditionalFormat;
// falls back to the KEY — which IS the Vietnamese source string — so an unset/absent locale renders
// Vietnamese exactly as before. (uiSchema flow/step titles go through the compilable `t()`/tExpr path.)
let runtimeT: ((s: string) => string) | null = null;
export function rt(s: string): string {
  if (!runtimeT) return s;
  try {
    const out = runtimeT(s);
    return out && typeof out === 'string' ? out : s;
  } catch (_) {
    return s;
  }
}

// Walk up the flow-model parent chain to find `collectionField`. NocoBase v2's field models expose it via a
// getter that reads `this.context.collectionField` — reliable on a plain top-level TableColumnModel, but NOT
// guaranteed on a SubTableColumnModel or an inner field-model rendered inside a form/detail, where it actually
// lives on a PARENT model. Bounded walk (max 4 hops) avoids infinite loops on malformed parent chains.
function resolveCf(model: any): any {
  for (let cur: any = model, i = 0; cur && i < 4; cur = cur.parent, i++) {
    if (cur?.collectionField) return cur.collectionField;
  }
  return null;
}

// ---- Rule model + evaluator ---------------------------------------------------------------------
type Cond = { field?: string; fieldLabel?: string; op?: string; value?: any };
type RuleMode = 'condition' | 'colorScale' | 'dataBar';
export type Rule = {
  key?: string;
  mode?: RuleMode;
  // condition mode
  match?: 'all' | 'any';
  conditions?: Cond[];
  targets?: string[];
  color?: any;
  background?: any;
  bold?: boolean;
  italic?: boolean;
  border?: boolean;
  radius?: number; // condition-mode pill corner radius (px). undefined → default rounded.
  fillMode?: 'pill' | 'cell'; // condition mode: inner pill (default) vs fill the whole cell.
  icon?: string;
  // scale modes (colorScale / dataBar) — a single source column, auto-scaled to its min/max
  column?: string;
  colorMin?: any;
  colorMid?: any;
  useMid?: boolean;
  colorMax?: any;
  barColor?: any;
  textColor?: any;      // manual text colour for scale modes (empty = auto contrast for heatmap)
  textOutline?: boolean; // halo/outline around text so it stays legible over colours
  outlineColor?: any;    // outline colour (default white)
};

// Text halo (multi-direction shadow reads as an outline). text-shadow is an inherited property so it
// applies to the cell text even when set on the <td>.
function haloShadow(oc: string): string {
  return `-1px -1px 0 ${oc}, 1px -1px 0 ${oc}, -1px 1px 0 ${oc}, 1px 1px 0 ${oc}, 0 0 2px ${oc}`;
}

// Dot-path read → @tuanla90/shared canonical `get` (wrapper keeps the `!path` guard).
function getPath(obj: any, path?: string): any {
  return path ? get(obj, path) : undefined;
}
export function evalRule(rule: Rule, record: any): boolean {
  const conds = (rule?.conditions || []).filter((c) => c && c.field);
  if (!conds.length) return false; // rule không có điều kiện → KHÔNG áp (tránh tô cả bảng)
  const rs = conds.map((c) => evalConditionOp(c.op || '$eq', getPath(record, c.field), c.value));
  return rule.match === 'any' ? rs.some(Boolean) : rs.every(Boolean);
}

// ---- colour interpolation (for heatmap scale) --------------------------------------------------
function parseRGB(c: any): [number, number, number] | null {
  if (!c) return null;
  const s = String(c).trim();
  let m = s.match(/^#([0-9a-f]{6})$/i);
  if (m) { const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  m = s.match(/^#([0-9a-f]{3})$/i);
  if (m) { const h = m[1]; return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)]; }
  m = s.match(/rgba?\(([^)]+)\)/i);
  if (m) { const p = m[1].split(',').map((x) => parseFloat(x)); return [p[0] || 0, p[1] || 0, p[2] || 0]; }
  return null;
}
function mix(c1: any, c2: any, t: number): string {
  const a = parseRGB(c1), b = parseRGB(c2);
  if (!a || !b) return (colorToString(c1) || colorToString(c2) || '') as string;
  const l = (i: number) => Math.round(a[i] + (b[i] - a[i]) * t);
  return `rgb(${l(0)}, ${l(1)}, ${l(2)})`;
}
function scaleColorAt(rule: Rule, t: number): string {
  const cMin = colorToString(rule.colorMin) || '#ffffff';
  const cMax = colorToString(rule.colorMax) || '#5b8ff9';
  if (rule.useMid) {
    const cMid = colorToString(rule.colorMid) || '#ffeb84';
    return t < 0.5 ? mix(cMin, cMid, t * 2) : mix(cMid, cMax, (t - 0.5) * 2);
  }
  return mix(cMin, cMax, t);
}
function isLightRGB(c: string): boolean {
  const rgb = parseRGB(c);
  if (!rgb) return true;
  return (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000 > 150;
}

// Min/max per scale-rule column, memoised on the model (recompute only when data/rules ref changes).
type Ranges = Record<string, { min: number; max: number }>;
function computeRanges(records: any[], rules: Rule[]): Ranges {
  const cols = new Set<string>();
  for (const r of rules) if ((r.mode === 'colorScale' || r.mode === 'dataBar') && r.column) cols.add(r.column);
  const out: Ranges = {};
  for (const c of cols) {
    let min = Infinity, max = -Infinity;
    for (const rec of records) { const v = Number(getPath(rec, c)); if (!Number.isNaN(v)) { if (v < min) min = v; if (v > max) max = v; } }
    if (min !== Infinity) out[c] = { min, max };
  }
  return out;
}
export function rangesFor(model: any, rules: Rule[]): Ranges {
  const data = model?.resource?.getData?.() || [];
  const c = model?.__ptdlRangeCache;
  if (c && c.data === data && c.rules === rules) return c.ranges;
  const ranges = computeRanges(data, rules);
  if (model) model.__ptdlRangeCache = { data, rules, ranges };
  return ranges;
}

// GLOBAL (collection-level) rules ⊕ this block's local rules. Global first so a block-local rule can
// override it (later rule wins in styleForCell/iconForCell). Memoised on the model by (localRef,
// globalRef, globalVersion) so the returned array is STABLE across renders — keeps rangesFor's cache
// valid and avoids reallocating every render.
export function mergedRulesFor(model: any): Rule[] {
  const local: Rule[] = model?.props?.ptdlCondRules || [];
  const coll = model?.collection;
  const global: Rule[] = globalRulesFor(coll?.dataSourceKey, coll?.name);
  const gv = globalRulesVersion();
  const c = model?.__ptdlMergedCache;
  if (c && c.local === local && c.global === global && c.gv === gv) return c.merged;
  const merged = global.length ? (local.length ? [...global, ...local] : global) : local;
  if (model) model.__ptdlMergedCache = { local, global, gv, merged };
  return merged;
}

/** onCell (whole-cell) style — SCALE modes only (heatmap / data-bar). Condition mode is drawn as an
 *  inner pill in render() (see conditionPresentation), so it's not hidden by branding's `!important` td bg. */
export function styleForCell(record: any, fieldName: string, rules: Rule[], ranges?: Ranges): React.CSSProperties | null {
  let st: React.CSSProperties | null = null;
  for (const rule of rules || []) {
    const mode = rule.mode || 'condition';

    if (mode === 'colorScale' || mode === 'dataBar') {
      if (rule.column !== fieldName) continue;
      const rng = ranges?.[fieldName];
      if (!rng) continue;
      const v = Number(getPath(record, fieldName));
      if (Number.isNaN(v)) continue;
      const span = rng.max - rng.min;
      const t = span === 0 ? 0.5 : Math.max(0, Math.min(1, (v - rng.min) / span));
      st = st || {};
      const tc = colorToString(rule.textColor);
      if (mode === 'colorScale') {
        const bg = scaleColorAt(rule, t);
        st.background = bg;
        st.color = tc || (isLightRGB(bg) ? 'rgba(0,0,0,0.88)' : '#fff');
      } else {
        // Solid bar = exactly the picked colour (readability handled by text colour + outline options).
        const bar = (colorToString(rule.barColor) || '#5b8ff9') as string;
        const pct = Math.round(t * 100);
        st.background = `linear-gradient(90deg, ${bar} 0%, ${bar} ${pct}%, transparent ${pct}%)`;
        if (tc) st.color = tc;
      }
      if (rule.textOutline) st.textShadow = haloShadow(colorToString(rule.outlineColor) || '#ffffff');
      continue;
    }

    // condition mode → drawn as an inner PILL by conditionPresentation/renderConditionPill (NOT a <td>
    // background), so a theme/branding forcing `.ant-table td{background:…!important}` can't hide it,
    // and it supports a corner radius. Nothing to add to the cell-level style here.
  }
  return st;
}
/** Icon (+ màu) của rule khớp CUỐI CÙNG có icon cho ô. (giữ cho tương thích; render giờ dùng conditionPresentation) */
export function iconForCell(record: any, fieldName: string, rules: Rule[]): { icon: string; color?: string } | null {
  let out: { icon: string; color?: string } | null = null;
  for (const rule of rules || []) {
    if ((rule.mode || 'condition') !== 'condition') continue; // icon chỉ thuộc mode Điều kiện (tab khác không áp)
    if (!rule?.icon) continue;
    if (!(rule?.targets || []).includes(fieldName)) continue;
    if (!evalRule(rule, record)) continue;
    out = { icon: rule.icon, color: colorToString(rule.color) };
  }
  return out;
}

// Condition-mode presentation for a cell → an inner PILL (background/text/bold/italic/border/radius/icon),
// merged across all matching condition rules (later rule wins per property). We render this INSIDE the cell
// content (not as a <td> background) so it (a) survives themes/branding that force `.ant-table td` background
// with `!important`, and (b) supports a corner radius. Scale modes (heatmap/data-bar) still fill the whole
// cell via styleForCell/onCell — those genuinely need the full cell.
export type CondPresent = {
  color?: string; background?: string; bold?: boolean; italic?: boolean;
  border?: boolean; radius?: number; icon?: string; iconColor?: string; textShadow?: string;
  fillMode?: 'pill' | 'cell';
};
export function conditionPresentation(record: any, fieldName: string, rules: Rule[]): CondPresent | null {
  let p: CondPresent | null = null;
  for (const rule of rules || []) {
    if ((rule.mode || 'condition') !== 'condition') continue;
    if (!(rule?.targets || []).includes(fieldName)) continue;
    if (!evalRule(rule, record)) continue;
    p = p || {};
    const color = colorToString(rule.color);
    const bg = colorToString(rule.background);
    if (color) { p.color = color; }
    if (bg) { p.background = bg; }
    if (rule.bold) p.bold = true;
    if (rule.italic) p.italic = true;
    if (rule.border) p.border = true;
    if (typeof rule.radius === 'number') p.radius = rule.radius;
    p.fillMode = rule.fillMode === 'cell' ? 'cell' : 'pill';
    if (rule.icon) { p.icon = rule.icon; p.iconColor = color || undefined; }
    if (rule.textOutline) p.textShadow = haloShadow(colorToString(rule.outlineColor) || '#ffffff');
  }
  return p;
}
/** Icon prefix (for CELL fill mode — bg/text is on the <td>, only the icon lives in the content). */
export function renderIconPrefix(node: React.ReactNode, p: CondPresent | null): React.ReactNode {
  if (!p?.icon) return node;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: '100%' }}>
      <span style={{ display: 'inline-flex', lineHeight: 0, flex: '0 0 auto', color: p.iconColor || undefined }}><IconByKey type={p.icon} /></span>
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node}</span>
    </span>
  );
}
/** Whole-cell <td> props for CELL fill mode (className+CSS var beats branding's `!important` td bg). */
export function cellFillProps(p: CondPresent | null, base: any): { className?: string; style?: any } {
  const out: { className?: string; style?: any } = {};
  const st: any = { ...(base?.style || {}) };
  if (p?.color) st.color = p.color;
  if (p?.bold) st.fontWeight = 700;
  if (p?.italic) st.fontStyle = 'italic';
  if (p?.border) st.boxShadow = `inset 0 0 0 1px ${p.color || p.background || '#d9d9d9'}`;
  if (p?.textShadow) st.textShadow = p.textShadow;
  if (p?.background) {
    st['--ptdlcf-bg'] = p.background; // consumed by the injected `.ptdlcf-fill` rule (see injectCellFillCss)
    out.className = [base?.className, 'ptdlcf-fill'].filter(Boolean).join(' ');
  }
  out.style = st;
  return out;
}
/** Wrap a cell/value node with the condition-mode pill. `node` is whatever the field normally renders. */
export function renderConditionPill(node: React.ReactNode, p: CondPresent | null): React.ReactNode {
  if (!p) return node;
  const filled = !!(p.background || p.border); // pad + round only when there's a visible chip
  const style: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: '100%', verticalAlign: 'middle',
    color: p.color || undefined,
    background: p.background || undefined,
    fontWeight: p.bold ? 700 : undefined,
    fontStyle: p.italic ? 'italic' : undefined,
    border: p.border ? `1px solid ${p.color || p.background || '#d9d9d9'}` : undefined,
    borderRadius: filled ? (typeof p.radius === 'number' ? p.radius : 4) : undefined,
    padding: filled ? '1px 8px' : undefined,
    lineHeight: filled ? 1.6 : undefined,
    textShadow: p.textShadow || undefined,
  };
  return (
    <span style={style}>
      {p.icon ? <span style={{ display: 'inline-flex', lineHeight: 0, flex: '0 0 auto', color: p.iconColor || undefined }}><IconByKey type={p.icon} /></span> : null}
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node}</span>
    </span>
  );
}

// ---- Condition row (field picker + smart operator + smart value) --------------------------------
// Injected apiClient (module-level) — passing the APIClient through Formily x-component-props can strip its
// methods (the picker then can't fetch fields → stays disabled). Same pattern as plugin-filter-tree: set it in
// uiSchema (runs before the dialog renders) and read it here. Resolved from model.context.api ‖ model.flowEngine.context.api.
let injectedApi: any = null;
type PickerCtx = { api?: any; collectionName?: string; dataSourceKey?: string };

// Visual language borrowed from plugin-global-search / layout-containers settings panels:
// white card + subtle shadow, fixed muted label column, tidy label-rows.
// color is a theme token applied at the usage site (see RuleCard) — this fixed part only carries
// the structural (non-color) shell.
const LABEL: React.CSSProperties = { width: 74, fontSize: 12, flex: 'none' };
const ROW_H = 32; // default antd controls are 32px tall — align labels/connectors to this

// IconByKey only forwards `type`; wrap it to control size/color (lucide glyphs inherit fontSize/currentColor).
const LIcon: React.FC<{ name: string; size?: number; color?: string }> = ({ name, size = 13, color = '#8c8c8c' }) => (
  <span style={{ display: 'inline-flex', lineHeight: 0, fontSize: size, color }}><IconByKey type={name} /></span>
);

// The shared `ConditionRow` (field cascader + smart operator + adaptive value), adapted to this
// plugin's dot-string `field` shape, with the leading connector word + lucide-x remove.
const CondRow: React.FC<{ cond: Cond; ctx: PickerCtx; connector: string; onChange: (c: Cond) => void; onRemove: () => void }> = ({ cond, ctx, connector, onChange, onRemove }) => (
  <ConditionRow
    api={ctx.api}
    collectionName={ctx.collectionName}
    dataSourceKey={ctx.dataSourceKey}
    path={cond.field ? String(cond.field).split('.') : []}
    op={cond.op}
    value={cond.value}
    fieldLabel={cond.fieldLabel}
    onChange={(nc) =>
      onChange({ field: nc.path.join('.'), fieldLabel: (nc.meta?.title as string) || nc.path[nc.path.length - 1], op: nc.op, value: nc.value })
    }
    onRemove={onRemove}
    placeholder={rt('Chọn field…')}
    emptyLabel={rt('(không có field)')}
    cascaderWidth={200}
    style={{ minHeight: ROW_H, marginBottom: 6 }}
    connector={
      <span style={{ width: 34, flex: 'none', textAlign: 'right', fontSize: 11.5, color: '#bbb', fontStyle: 'italic' }}>{connector}</span>
    }
    renderRemove={(onR) => (
      <Tooltip title={rt('Xoá điều kiện')}>
        <span
          onClick={onR}
          role="button"
          style={{ height: ROW_H, width: 24, flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', borderRadius: 6 }}
        >
          <LIcon name="lucide-x" color="#bbb" size={15} />
        </span>
      </Tooltip>
    )}
  />
);

const RuleCard: React.FC<{
  rule: Rule; idx: number; ctx: PickerCtx; columns: { value: string; label: string }[];
  onChange: (r: Rule) => void; onRemove: () => void;
}> = ({ rule, idx, ctx, columns, onChange, onRemove }) => {
  const { token } = theme.useToken();
  const conds = rule.conditions && rule.conditions.length ? rule.conditions : [{}];
  const patch = (p: Partial<Rule>) => onChange({ ...rule, ...p });
  const setCond = (i: number, c: Cond) => patch({ conditions: conds.map((x, j) => (j === i ? c : x)) });
  const addCond = () => patch({ conditions: [...conds, {}] });
  const removeCond = (i: number) => {
    const next = conds.filter((_, j) => j !== i);
    patch({ conditions: next.length ? next : [{}] });
  };

  const mode: RuleMode = rule.mode || 'condition';
  const setMode = (m: RuleMode) => {
    const p: Partial<Rule> = { mode: m };
    if (m === 'colorScale' && rule.colorMin == null && rule.colorMax == null) { p.colorMin = '#ffffff'; p.colorMax = '#5b8ff9'; }
    if (m === 'dataBar' && rule.barColor == null) { p.barColor = '#5b8ff9'; }
    if ((m === 'colorScale' || m === 'dataBar') && !rule.column && columns[0]) p.column = columns[0].value;
    patch(p);
  };

  const color = colorToString(rule.color);
  const bg = colorToString(rule.background);
  const sampleStyle: React.CSSProperties = {
    color: color || undefined, background: bg || undefined,
    fontWeight: rule.bold ? 700 : undefined, fontStyle: rule.italic ? 'italic' : undefined,
    border: rule.border ? `1px solid ${color || bg || '#d9d9d9'}` : undefined,
    textShadow: rule.textOutline ? haloShadow(colorToString(rule.outlineColor) || '#ffffff') : undefined,
    padding: '2px 10px',
    borderRadius: rule.fillMode === 'cell' ? 0 : (typeof rule.radius === 'number' ? rule.radius : 4),
    display: 'inline-flex', alignItems: 'center', gap: 5,
  };

  const cMin = colorToString(rule.colorMin) || '#ffffff';
  const cMid = colorToString(rule.colorMid) || '#ffeb84';
  const cMax = colorToString(rule.colorMax) || '#5b8ff9';
  const gradCss = rule.useMid ? `linear-gradient(90deg, ${cMin}, ${cMid}, ${cMax})` : `linear-gradient(90deg, ${cMin}, ${cMax})`;
  const barC = colorToString(rule.barColor) || '#5b8ff9';
  const previewTextColor = colorToString(rule.textColor) || (mode === 'colorScale' ? (isLightRGB(cMax) ? 'rgba(0,0,0,0.88)' : '#fff') : 'rgba(0,0,0,0.85)');
  const previewTextShadow = rule.textOutline ? haloShadow(colorToString(rule.outlineColor) || '#ffffff') : undefined;
  const sampleBg = mode === 'colorScale' ? cMax : barC; // solid — matches the actual cell bar

  return (
    <SettingCard style={{ borderRadius: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.06), 0 2px 10px rgba(0,0,0,0.04)', marginBottom: 12 }}>
      {/* Header: Rule N + mode selector + (condition) match + delete */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <b style={{ fontSize: 13 }}>{`${rt('Quy tắc')} ${idx + 1}`}</b>
          <SegmentedGroup value={mode} onChange={(v: any) => setMode(v)}
            options={[{ label: rt('Điều kiện'), value: 'condition' }, { label: rt('Thang màu'), value: 'colorScale' }, { label: rt('Thanh dữ liệu'), value: 'dataBar' }]} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {mode === 'condition' && (
            <>
              <span style={{ fontSize: 12, color: token.colorTextTertiary }}>{rt('Khớp')}</span>
              <SegmentedGroup value={rule.match || 'all'} onChange={(v: any) => patch({ match: v })}
                options={[{ label: rt('Tất cả'), value: 'all' }, { label: rt('Bất kỳ'), value: 'any' }]} />
            </>
          )}
          <Button danger size="small" onClick={onRemove}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
            icon={<LIcon name="lucide-trash-2" size={14} color="#ff4d4f" />}>
            {rt('Xoá')}
          </Button>
        </div>
      </div>

      {mode === 'condition' ? (
        <>
          {/* Conditions */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <span style={{ ...LABEL, color: token.colorTextTertiary, width: 84, height: ROW_H, display: 'flex', alignItems: 'center', alignSelf: 'flex-start' }}>{rt('Điều kiện')}</span>
            <div style={{ flex: 1 }}>
              {conds.map((c, i) => (
                <CondRow key={i} cond={c} ctx={ctx} connector={i === 0 ? rt('khi') : rule.match === 'any' ? rt('hoặc') : rt('và')}
                  onChange={(nc) => setCond(i, nc)} onRemove={() => removeCond(i)} />
              ))}
              <Button size="small" type="link" style={{ padding: 0, height: 'auto', marginLeft: 42, display: 'inline-flex', alignItems: 'center', gap: 4 }} onClick={addCond}>
                <LIcon name="lucide-plus" size={13} color={token.colorPrimary} /> {rt('Thêm điều kiện')}
              </Button>
            </div>
          </div>

          {/* Apply to columns */}
          <SettingRow label={rt('Áp dụng cho')} labelWidth={84} style={{ gap: 10, marginBottom: 12 }}>
            <Select size="small" mode="multiple" allowClear style={{ flex: 1 }} placeholder={rt('Chọn cột cần định dạng')}
              value={rule.targets || []} onChange={(v) => patch({ targets: v })} options={columns}
              showSearch optionFilterProp="label" />
          </SettingRow>

          {/* Display style: pill (inner chip, robust) vs cell (whole-cell fill). */}
          <SettingRow label={rt('Kiểu')} labelWidth={84} style={{ gap: 10, marginBottom: 12 }}>
            <SegmentedGroup value={rule.fillMode || 'pill'} onChange={(v: any) => patch({ fillMode: v })}
              options={[{ label: rt('Nhãn'), value: 'pill' }, { label: rt('Cả ô'), value: 'cell' }]} />
            <span style={{ fontSize: 11.5, color: '#bbb' }}>{rt('Nhãn = chip bo góc trong ô; Cả ô = tô kín ô')}</span>
          </SettingRow>

          {/* Format */}
          <SettingRow label={rt('Định dạng')} labelWidth={84} style={{ gap: 10, marginBottom: 0 }}>
            <div style={{ flex: 1, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: 12, color: token.colorTextTertiary }}>{rt('Chữ')}</span>
                <ColorField value={rule.color} onChange={(v: any) => patch({ color: v })} size="small" />
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: 12, color: token.colorTextTertiary }}>{rt('Nền')}</span>
                <ColorField value={rule.background} onChange={(v: any) => patch({ background: v })} size="small" />
              </span>
              <Space.Compact size="small">
                <Button size="small" type={rule.bold ? 'primary' : 'default'} onClick={() => patch({ bold: !rule.bold })} style={{ fontWeight: 700, width: 30 }}>B</Button>
                <Button size="small" type={rule.italic ? 'primary' : 'default'} onClick={() => patch({ italic: !rule.italic })} style={{ fontStyle: 'italic', width: 30 }}>I</Button>
              </Space.Compact>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: 12, color: token.colorTextTertiary }}>{rt('Viền')}</span>
                <Switch size="small" checked={!!rule.border} onChange={(v) => patch({ border: v })} />
              </span>
              <Tooltip title={rt('Bo góc pill (px) — chỉ hiện khi có Nền/Viền')}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ fontSize: 12, color: token.colorTextTertiary }}>{rt('Bo góc')}</span>
                  <InputNumber size="small" min={0} max={20} style={{ width: 60 }}
                    value={typeof rule.radius === 'number' ? rule.radius : 4}
                    onChange={(v: any) => patch({ radius: typeof v === 'number' ? v : undefined })} />
                </span>
              </Tooltip>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: 12, color: token.colorTextTertiary }}>{rt('Viền chữ')}</span>
                <Switch size="small" checked={!!rule.textOutline} onChange={(v) => patch({ textOutline: v })} />
              </span>
              {rule.textOutline && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ fontSize: 12, color: token.colorTextTertiary }}>{rt('Màu viền')}</span>
                  <ColorField value={rule.outlineColor ?? '#ffffff'} onChange={(v: any) => patch({ outlineColor: v })} size="small" />
                </span>
              )}
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: 12, color: token.colorTextTertiary }}>{rt('Biểu tượng')}</span>
                <RegistryIconPicker value={rule.icon} onChange={(k: string) => patch({ icon: k })} placeholder={rt('Chọn')} />
              </span>
              <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#bbb' }}>
                {rt('Xem trước')}
                <span style={{ ...sampleStyle, minWidth: 44, justifyContent: 'center' }}>
                  {rule.icon ? <span style={{ display: 'inline-flex', lineHeight: 0 }}><IconByKey type={rule.icon} /></span> : null}
                  <span>{rt('Mẫu')}</span>
                </span>
              </span>
            </div>
          </SettingRow>
        </>
      ) : (
        <>
          {/* Column (shared by both scale modes) */}
          <SettingRow label={rt('Cột số')} labelWidth={84} style={{ gap: 10, marginBottom: 12 }}>
            <Select size="small" allowClear showSearch optionFilterProp="label" style={{ width: 280 }}
              placeholder={rt('Chọn cột số')} value={rule.column} onChange={(v) => patch({ column: v })} options={columns} />
            <span style={{ fontSize: 11.5, color: '#bbb' }}>{rt('tự scale theo min–max của cột')}</span>
          </SettingRow>

          {mode === 'colorScale' ? (
            <SettingRow label={rt('Thang màu')} labelWidth={84} style={{ gap: 10, marginBottom: 0, flexWrap: 'wrap' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: 12, color: token.colorTextTertiary }}>{rt('Thấp')}</span>
                <ColorField value={rule.colorMin} onChange={(v: any) => patch({ colorMin: v })} size="small" />
              </span>
              {rule.useMid && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ fontSize: 12, color: token.colorTextTertiary }}>{rt('Giữa')}</span>
                  <ColorField value={rule.colorMid} onChange={(v: any) => patch({ colorMid: v })} size="small" />
                </span>
              )}
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: 12, color: token.colorTextTertiary }}>{rt('Cao')}</span>
                <ColorField value={rule.colorMax} onChange={(v: any) => patch({ colorMax: v })} size="small" />
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: 12, color: token.colorTextTertiary }}>{rt('3 màu')}</span>
                <Switch size="small" checked={!!rule.useMid} onChange={(v) => patch({ useMid: v })} />
              </span>
              <span style={{ width: 120, height: 16, borderRadius: 4, background: gradCss, border: '1px solid #eee', marginLeft: 4 }} />
            </SettingRow>
          ) : (
            <SettingRow label={rt('Màu thanh')} labelWidth={84} style={{ gap: 10, marginBottom: 0, flexWrap: 'wrap' }}>
              <ColorField value={rule.barColor} onChange={(v: any) => patch({ barColor: v })} size="small" />
              {/* mini cell preview: a ~65% bar */}
              <span style={{ position: 'relative', width: 160, height: 24, borderRadius: 4, border: '1px solid #eee', overflow: 'hidden', display: 'inline-flex', alignItems: 'center', paddingLeft: 8, fontSize: 12 }}>
                <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '65%', background: barC }} />
                <span style={{ position: 'relative', color: previewTextColor, textShadow: previewTextShadow, fontWeight: 500 }}>1,234</span>
              </span>
            </SettingRow>
          )}

          {/* Text colour + outline (shared by both scale modes) */}
          <SettingRow label={rt('Chữ')} labelWidth={84} style={{ gap: 12, marginTop: 12, marginBottom: 0, flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ fontSize: 12, color: token.colorTextTertiary }}>{rt('Màu')}</span>
              <ColorField value={rule.textColor} onChange={(v: any) => patch({ textColor: v })} size="small" />
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ fontSize: 12, color: token.colorTextTertiary }}>{rt('Viền chữ')}</span>
              <Switch size="small" checked={!!rule.textOutline} onChange={(v) => patch({ textOutline: v })} />
            </span>
            {rule.textOutline && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: 12, color: token.colorTextTertiary }}>{rt('Màu viền')}</span>
                <ColorField value={rule.outlineColor ?? '#ffffff'} onChange={(v: any) => patch({ outlineColor: v })} size="small" />
              </span>
            )}
            <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#bbb' }}>
              {rt('Xem trước')}
              <span style={{ padding: '3px 14px', borderRadius: 4, background: sampleBg, color: previewTextColor, textShadow: previewTextShadow, fontSize: 13, fontWeight: 500 }}>1,234</span>
            </span>
          </SettingRow>
        </>
      )}
    </SettingCard>
  );
};

// "Apply to all views" toggle for the block dialog: ON → the rule set is saved as the GLOBAL default
// for the whole collection (collection ptdlFieldFormatRules) so every table/detail/list using it applies
// them; OFF → the rules stay local to this block. Prominent card so the scope choice is obvious.
const GlobalToggle: React.FC<{ value?: boolean; onChange?: (v: boolean) => void; title?: string; hint?: string }> = (props) => {
  const on = !!props.value;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10,
      background: on ? 'var(--colorPrimaryBg, rgba(22,119,255,0.08))' : 'var(--colorFillQuaternary, #fafafa)',
      border: `1px solid ${on ? 'var(--colorPrimaryBorder, #91caff)' : 'var(--colorBorderSecondary, #f0f0f0)'}`,
      transition: 'background .15s, border-color .15s',
    }}>
      <Switch checked={on} onChange={(c: any) => props.onChange?.(c)} />
      <div style={{ lineHeight: 1.35, minWidth: 0 }}>
        <div style={{ fontWeight: 500, fontSize: 13 }}>{props.title || rt('Áp dụng cho mọi view')}</div>
        {props.hint ? <div style={{ fontSize: 12, color: 'var(--colorTextTertiary, #8c8c8c)' }}>{props.hint}</div> : null}
      </div>
    </div>
  );
};

export const CondRulesEditor: React.FC<{
  value?: Rule[]; onChange?: (v: Rule[]) => void;
  api?: any; collectionName?: string; dataSourceKey?: string; columns?: { value: string; label: string }[];
}> = (props) => {
  const { token } = theme.useToken();
  const rules: Rule[] = Array.isArray(props.value) ? props.value : [];
  const columns = props.columns || [];
  const ctx: PickerCtx = { api: injectedApi || props.api, collectionName: props.collectionName, dataSourceKey: props.dataSourceKey };
  const set = (next: Rule[]) => props.onChange?.(next);
  const addRule = () => set([...rules, { mode: 'condition', match: 'all', conditions: [{}], targets: [], color: '', background: '' }]);
  return (
    <div>
      <div style={{ fontSize: 12.5, color: token.colorTextTertiary, marginBottom: 12 }}>
        {rt('Tô định dạng ô theo giá trị. Mỗi quy tắc có 3 kiểu:')} <b>{rt('Điều kiện')}</b> (rule if–then), <b>{rt('Thang màu')}</b>{' '}
        {rt('(heatmap theo min–max của cột) hoặc')} <b>{rt('Thanh dữ liệu')}</b> {rt('(data bar trong ô).')}
      </div>
      {rules.length === 0 ? (
        <SettingCard style={{ borderRadius: 10, marginBottom: 12, boxShadow: 'none', borderStyle: 'dashed', textAlign: 'center', color: '#bbb', fontSize: 13, padding: '22px 16px' }}>
          {rt('Chưa có quy tắc nào — thêm bên dưới.')}
        </SettingCard>
      ) : (
        rules.map((r, i) => (
          <RuleCard key={i} rule={r} idx={i} ctx={ctx} columns={columns}
            onChange={(nr) => set(rules.map((x, j) => (j === i ? nr : x)))}
            onRemove={() => set(rules.filter((_, j) => j !== i))} />
        ))
      )}
      <Button type="dashed" block onClick={addRule} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <LIcon name="lucide-plus" size={14} color={token.colorPrimary} /> {rt('Thêm quy tắc')}
      </Button>
    </div>
  );
};

// ---- Registration -------------------------------------------------------------------------------
type Deps = {
  flowEngine: any;
  flowSettings?: any;
  tExpr?: (s: string, o?: any) => any;
  Icon?: any;
  icons?: Map<string, any>;
  app?: any;
};

export function registerTableConditionalFormat({ flowEngine, flowSettings, tExpr, Icon, icons, app }: Deps) {
  // Runtime translator for this plugin's own React render strings (settings dialog), resolved against
  // NS from the app i18n. Injected once; falls back to the KEY (= the Vietnamese source string) so an
  // unset/absent locale keeps rendering Vietnamese exactly as before.
  const i18n = app?.i18n || flowEngine?.context?.app?.i18n;
  if (i18n?.t && !runtimeT) runtimeT = (s: string) => i18n.t(s, { ns: NS });
  if (!flowEngine || typeof flowEngine.getModelClass !== 'function') return;

  // Global (field-level) rules — load the cache once + refresh on tab re-focus. Done before the
  // TableBlockModel guard so it also primes the cache for the detail/list value-render patches.
  const api = app?.apiClient || flowEngine?.context?.api;
  if (api) { loadGlobalRulesCache(api); bindGlobalRulesAutoRefresh(api); }

  const TableBlockModel: any = flowEngine.getModelClass('TableBlockModel');
  if (!TableBlockModel) return; // classic lane — no table block model
  // Wire the shared icon registry for this lane (RegistryIconPicker in the dialog + IconByKey in cells).
  // conditional-format's bundled @tuanla90/shared is a separate per-plugin registry → must set it here (the old
  // registerConditionalModel that used to do this moved to field-enhancements).
  setIconRegistry(Icon, icons);
  // "Cả ô" fill: the td carries `--ptdlcf-bg` (set in onCell). This rule is deliberately MORE specific
  // than branding's zebra/hover td-background rules (`.ant-table-wrapper` + repeated class → 4 classes)
  // so its `!important` wins regardless of injection order.
  try {
    if (typeof document !== 'undefined' && !document.getElementById('ptdlcf-fill-css')) {
      const s = document.createElement('style');
      s.id = 'ptdlcf-fill-css';
      s.textContent = '.ant-table-wrapper .ant-table-tbody>tr>td.ptdlcf-fill.ptdlcf-fill{background:var(--ptdlcf-bg)!important}';
      document.head.appendChild(s);
    }
  } catch (_) { /* ignore */ }
  const t = (s: string) => (tExpr ? tExpr(s, { ns: NS }) : s);

  if (flowSettings?.registerComponents) {
    try { registerFlowComponentsOnce(flowSettings, { PtdlCondRulesEditor: CondRulesEditor, PtdlGlobalToggle: GlobalToggle }); }
    catch (e) { /* eslint-disable-next-line no-console */ console.warn('[cond-fmt] table register components failed', e); }
  }

  (globalThis as any).__ptdlTableCondFmt = { evalRule, styleForCell, iconForCell };

  // 1) Patch getColumns → bọc onCell (style) + render (icon). CRASH-SAFE.
  const proto = TableBlockModel.prototype;
  if (!proto.__ptdlCondPatched) {
    const orig = proto.getColumns;
    proto.getColumns = function (...args: any[]) {
      const cols = orig.apply(this, args) || [];
      try {
        const self = this;
        for (const col of cols) {
          if (!col || col.key === 'empty' || col.key === 'addColumn') continue;
          const di = col.dataIndex;
          const fieldName = Array.isArray(di) ? di.join('.') : di;
          if (!fieldName) continue;

          const prevOnCell = col.onCell;
          col.onCell = (record: any, recordIndex: any) => {
            const base = prevOnCell ? prevOnCell(record, recordIndex) : {};
            try {
              const rules: Rule[] = mergedRulesFor(self); // global (collection) ⊕ block-local
              if (!rules.length) return base;
              // Scale-mode whole-cell fill (heatmap / data-bar).
              const st = styleForCell(record, fieldName, rules, rangesFor(self, rules));
              let out: any = st ? { ...base, style: { ...(base.style || {}), ...st } } : base;
              // Condition-mode "Cả ô" (fillMode==='cell') → className + CSS var beats branding's !important td bg.
              const p = conditionPresentation(record, fieldName, rules);
              if (p && p.fillMode === 'cell') out = { ...out, ...cellFillProps(p, out) };
              return out;
            } catch (_) { return base; }
          };

          const prevRender = col.render;
          if (typeof prevRender === 'function') {
            col.render = (value: any, record: any, index: any) => {
              const node = prevRender(value, record, index);
              try {
                const rules: Rule[] = mergedRulesFor(self); // global (collection) ⊕ block-local
                if (rules.length) {
                  const p = conditionPresentation(record, fieldName, rules);
                  // "Cả ô": bg/text applied to the <td> via onCell → here only prepend the icon.
                  // "Nhãn" (default): inner pill (bg/text/bold/italic/border/radius/icon).
                  if (p) return p.fillMode === 'cell' ? renderIconPrefix(node, p) : renderConditionPill(node, p);
                }
              } catch (_) { /* fall through to plain node */ }
              return node;
            };
          }
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[cond-fmt] getColumns wrap failed (ignored)', e);
      }
      return cols;
    };
    proto.__ptdlCondPatched = true;
  }

  // 1b) Detail / List (read) — apply GLOBAL condition rules to the field VALUE via the shared display base
  // render() (base of the scalar display models: text/number/enum/date/percent/url…). We DON'T gate on
  // `instanceof DetailsBlockModel` (it fails on the field forks a Details block creates); instead we skip
  // when the `_inTableCellRender` flag says we're inside a table cell (handled by getColumns above), so no
  // double styling. Forms use editable models (not this display base) → untouched. Scale modes need a
  // column range → skipped here; only condition-mode colour/bg/border/icon/pill apply. CRASH-SAFE.
  try {
    const DTF: any = flowEngine.getModelClass('DisplayTextFieldModel');
    const ClickProto: any = DTF && Object.getPrototypeOf(DTF.prototype);
    if (ClickProto && typeof ClickProto.render === 'function' && !ClickProto.__ptdlDetailPatched) {
      const origRender = ClickProto.render;
      ClickProto.render = function (...rargs: any[]) {
        const node = origRender.apply(this, rargs);
        try {
          const bmName: string | undefined = (this as any).context?.blockModel?.constructor?.name;
          const cf: any = resolveCf(this);
          const fieldName: string | undefined = cf?.name;
          const bmColl = (this as any).context?.blockModel?.collection;
          const coll = cf?.collectionName || cf?.collection?.name || bmColl?.name;
          const ds = cf?.dataSourceKey || bmColl?.dataSourceKey;
          // Table is handled by getColumns (which merges block-local rules too) → skip here to avoid a
          // DOUBLE pill/icon. Class names aren't minified, so the block-type check is reliable.
          if (bmName === 'TableBlockModel') return node;
          const rules: Rule[] = (fieldName && coll) ? globalRulesFor(ds, coll) : [];
          if (!rules.length) return node;
          const record = (this as any).context?.record;
          if (!record) return node;
          const p = conditionPresentation(record, fieldName, rules);
          if (!p) return node;
          return p.fillMode === 'cell' ? renderIconPrefix(node, p) : renderConditionPill(node, p);
        } catch (_) { return node; }
      };
      ClickProto.__ptdlDetailPatched = true;
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[cond-fmt] detail patch failed (ignored)', e);
  }

  // 2) Block-level settings flow (menu ⚙ của Table block).
  try {
    TableBlockModel.registerFlow({
      key: 'ptdlTableCondFmt',
      sort: 650,
      title: t('Định dạng có điều kiện'),
      steps: {
        rules: {
          title: t('Định dạng có điều kiện'),
          uiMode: { type: 'dialog', props: { width: 900 } },
          uiSchema: (ctx: any) => {
            const collection = ctx?.model?.collection;
            // Resolve + inject the APIClient for the field pickers (see injectedApi note above).
            injectedApi =
              ctx?.model?.context?.api ||
              ctx?.model?.flowEngine?.context?.api ||
              (flowEngine as any)?.context?.api ||
              injectedApi;
            let columns: { value: string; label: string }[] = [];
            try {
              columns = ctx.model
                .mapSubModels('columns', (c: any) => {
                  const di = c?.props?.dataIndex;
                  const name = Array.isArray(di) ? di.join('.') : di;
                  if (!name) return null;
                  const title = typeof c?.props?.title === 'string' ? c.props.title : name;
                  return { value: name, label: title };
                })
                .filter(Boolean);
            } catch (_) { columns = []; }
            const collTitle = collection?.title || collection?.name || '';
            return {
              // Scope toggle first — the whole dialog's save destination depends on it.
              applyGlobal: {
                type: 'boolean',
                'x-decorator': 'FormItem',
                'x-decorator-props': { style: { marginBottom: 14 } },
                'x-component': 'PtdlGlobalToggle',
                'x-component-props': {
                  title: rt('Áp dụng cho mọi view (global cho collection)'),
                  hint: rt('Bật: lưu các quy tắc thành mặc định của collection') + (collTitle ? ` “${collTitle}” ` : ' ') + rt('— mọi bảng/chi tiết/danh sách dùng nó đều áp. Tắt: chỉ áp riêng block này.'),
                },
              },
              rules: {
                type: 'array',
                'x-decorator': 'FormItem',
                'x-component': 'PtdlCondRulesEditor',
                'x-component-props': {
                  api: ctx?.model?.context?.api,
                  collectionName: collection?.name,
                  dataSourceKey: collection?.dataSourceKey,
                  columns,
                },
              },
            };
          },
          // Preload: a fresh block on a collection that already has global rules opens showing them
          // (toggle ON); a block with its own local rules shows those (toggle OFF). Once saved, the
          // step's own persisted params take over on reopen.
          defaultParams: (ctx: any) => {
            const coll = ctx?.model?.collection;
            const local = ctx?.model?.props?.ptdlCondRules;
            const hasLocal = Array.isArray(local) && local.length > 0;
            const global = globalRulesFor(coll?.dataSourceKey, coll?.name);
            if (!hasLocal && global.length) return { rules: global, applyGlobal: true };
            return { rules: hasLocal ? local : [], applyGlobal: false };
          },
          async handler(ctx: any, params: any) {
            const rules = Array.isArray(params?.rules) ? params.rules : [];
            const coll = ctx?.model?.collection;
            if (params?.applyGlobal) {
              // Promote to the collection-wide global store; clear this block's local copy so the two
              // don't stack (getColumns already merges the global rules for every block on this collection).
              const gApi = ctx?.model?.context?.api || ctx?.model?.flowEngine?.context?.api || injectedApi;
              try { await upsertGlobalRules(gApi, coll?.dataSourceKey, coll?.name, rules); }
              catch (e) { /* eslint-disable-next-line no-console */ console.warn('[cond-fmt] save global rules failed', e); }
              ctx.model.setProps('ptdlCondRules', []);
            } else {
              // Local to this block. setProps is reactive (MobX) → the table re-renders; do NOT call
              // rerender() (runs during flow-apply → "update during render" → blank screen).
              ctx.model.setProps('ptdlCondRules', rules);
            }
          },
        },
      },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[cond-fmt] table registerFlow failed', e);
  }
}
