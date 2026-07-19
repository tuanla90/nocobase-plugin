import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Table, Input, Button, Switch, Select, Space, message, Popconfirm, Typography, Modal, Tag, Popover, Tooltip, Empty, Cascader, Checkbox, theme } from 'antd';
import { PlusOutlined, ReloadOutlined, PartitionOutlined, FunctionOutlined, LinkOutlined, FilterOutlined, CalculatorOutlined, ArrowUpOutlined, ArrowDownOutlined, PushpinOutlined, TableOutlined, BulbOutlined, PlayCircleOutlined, RobotOutlined, AimOutlined } from '@ant-design/icons';
import { SettingCard, SettingRow, Hint, FieldPickerCascader, getCaretElement, insertAtCaret, getFields } from '@ptdl/shared';
import { FORMULA_EXAMPLES as EXAMPLES, FORMULA_FUNCTIONS as FN_HELP, TRIGGER_OPTIONS, splitTriggers } from './formulaKnowledge';
import { t } from './i18n';

/**
 * Computed-rules management page (Settings → "Công thức tự tính"). Plain settings page (always
 * renders — unlike a column ⚙ flow or a code-defined-collection block, neither surfaces on /v/).
 * Rule table + deps tags + a modal editor with a MULTI-LEVEL field-picker cascader (shared
 * FieldPickerCascader → inserts `data.<path>`), plus an interactive DAG (hover-highlight + collection
 * filter). Styled with the @ptdl settings-kit (theme-aware CSS vars). `api` is provided per-lane.
 *
 * NOTE: custom actions go through NocoBase dataWrapping, so `ctx.body={nodes,edges}` arrives as
 * `res.data.data` (double-wrapped) — unwrap via `res.data.data`.
 */

// Inline compact-row label: auto-width + never breaks (a fixed labelWidth clipped longer English labels).
const INLINE_LBL: React.CSSProperties = { color: 'var(--colorTextTertiary, rgba(0,0,0,0.45))', fontSize: 12, whiteSpace: 'nowrap', flex: 'none' };

// Bridge antd theme TOKENS → the `--colorX` CSS vars this file styles with. antd exposes its own
// `--ant-*` vars (not `--colorX`), so our `var(--colorX, <light-fallback>)` silently used the LIGHT
// fallback → white lines / black text in dark mode, esp. inside Modal/Popover PORTALS (which don't
// inherit page-scoped vars). Applying this on every portal root + the page root resolves them all to
// the live theme value. Values come from `theme.useToken()` so they track light/dark automatically.
function themeVars(token: any): React.CSSProperties {
  const m: Record<string, string> = {
    '--colorText': token.colorText, '--colorTextSecondary': token.colorTextSecondary,
    '--colorTextTertiary': token.colorTextTertiary, '--colorTextQuaternary': token.colorTextQuaternary,
    '--colorBorder': token.colorBorder, '--colorBorderSecondary': token.colorBorderSecondary,
    '--colorBgContainer': token.colorBgContainer, '--colorBgLayout': token.colorBgLayout,
    '--colorFillSecondary': token.colorFillSecondary, '--colorFillTertiary': token.colorFillTertiary,
    '--colorFillQuaternary': token.colorFillQuaternary, '--colorPrimary': token.colorPrimary,
    '--colorPrimaryBorder': token.colorPrimaryBorder, '--colorPrimaryBg': token.colorPrimaryBg,
    '--colorInfo': token.colorInfo, '--colorInfoBg': token.colorInfoBg, '--colorInfoBorder': token.colorInfoBorder,
    '--colorWarning': token.colorWarning, '--colorWarningBg': token.colorWarningBg,
    '--colorWarningBorder': token.colorWarningBorder, '--colorSuccess': token.colorSuccess,
    '--colorError': token.colorError,
  };
  return m as unknown as React.CSSProperties;
}

type Rule = { id?: number; key?: string; dataSourceKey?: string; collectionName: string; targetField: string; formula: string; runOn?: string; enabled?: boolean; onError?: string };

// Storable scalar types a computed value can target — number, text, date, boolean (NOT relations).
const TARGET_TYPES = new Set(['double', 'integer', 'bigInt', 'decimal', 'float', 'real', 'number', 'percent', 'string', 'text', 'boolean', 'date', 'datetime', 'dateOnly', 'datetimeNoTz', 'unixTimestamp']);
const keyOf = (r: Rule) => r.key || `${r.dataSourceKey || 'main'}:${r.collectionName}.${r.targetField}`;
const clip = (s: string, n = 22) => (s && s.length > n ? s.slice(0, n - 1) + '…' : s);
const unwrap = (res: any) => res?.data?.data ?? res?.data ?? {};
// Resolve a NocoBase i18n title template `{{t("Users")}}` → "Users"; fall back to the technical name.
const cleanTitle = (title: any, name: string): string => {
  if (!title) return name;
  const s = String(title);
  const m = s.match(/\{\{\s*t\(\s*['"]([^'"]+)['"]/);
  if (m) return m[1];
  return /\{\{/.test(s) ? name : s;
};

const KIND_COLOR: Record<string, string> = { local: '#94a3b8', aggregate: '#2563eb', lookup: '#16a34a' };
const Dot = ({ c }: { c: string }) => <span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: c, verticalAlign: 'middle', marginRight: 4 }} />;

// ------------------------------- DAG (SVG, theme-aware, interactive) -------------------------------
function Dag({ nodes, edges, focus }: { nodes: any[]; edges: any[]; focus?: { id: string; n: number } }) {
  const [filter, setFilter] = useState<string[]>([]);
  const [hover, setHover] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const active = pinned || hover;
  const scrollRef = useRef<HTMLDivElement>(null);
  const pendingScroll = useRef<string | null>(null);

  const collOptions = useMemo(() => [...new Set(nodes.map((n) => n.collection))].map((c) => ({ value: c, label: c })), [nodes]);

  const { vNodes, vEdges } = useMemo(() => {
    if (!filter.length) return { vNodes: nodes, vEdges: edges };
    const base = new Set(nodes.filter((n) => filter.includes(n.collection)).map((n) => n.id));
    const vis = new Set(base);
    edges.forEach((e) => { if (base.has(e.from)) vis.add(e.to); if (base.has(e.to)) vis.add(e.from); });
    return { vNodes: nodes.filter((n) => vis.has(n.id)), vEdges: edges.filter((e) => vis.has(e.from) && vis.has(e.to)) };
  }, [nodes, edges, filter]);

  // adjacency over visible edges (out = downstream/affected, in = upstream/sources)
  const { adjIn, adjOut } = useMemo(() => {
    const ai = new Map<string, string[]>(), ao = new Map<string, string[]>();
    vEdges.forEach((e) => { (ao.get(e.from) ?? ao.set(e.from, []).get(e.from))!.push(e.to); (ai.get(e.to) ?? ai.set(e.to, []).get(e.to))!.push(e.from); });
    return { adjIn: ai, adjOut: ao };
  }, [vEdges]);

  // RECURSIVE reach: all ancestors (upstream) / descendants (downstream) of a node.
  const { up, down, hi } = useMemo(() => {
    if (!active) return { up: new Set<string>(), down: new Set<string>(), hi: null as Set<string> | null };
    const reach = (start: string, adj: Map<string, string[]>) => {
      const seen = new Set<string>(), stack = [start];
      while (stack.length) { const c = stack.pop()!; for (const nx of adj.get(c) || []) if (!seen.has(nx)) { seen.add(nx); stack.push(nx); } }
      return seen;
    };
    const u = reach(active, adjIn), d = reach(active, adjOut);
    return { up: u, down: d, hi: new Set<string>([active, ...u, ...d]) };
  }, [active, adjIn, adjOut]);

  const layout = useMemo(() => {
    if (!vNodes?.length) return null;
    const ranks = [...new Set(vNodes.map((n) => n.rank ?? 0))].sort((a, b) => a - b);
    const byRank = new Map(ranks.map((r) => [r, vNodes.filter((n) => (n.rank ?? 0) === r)]));
    const boxW = 158, boxH = 46, hGap = 60, vGap = 20, padX = 14, padY = 16;
    const colW = boxW + hGap;
    const pos = new Map<string, any>();
    ranks.forEach((r, ci) => byRank.get(r)!.forEach((n, ri) => pos.set(n.id, { x: padX + ci * colW, y: padY + ri * (boxH + vGap), n })));
    const rowsMax = Math.max(1, ...ranks.map((r) => byRank.get(r)!.length));
    return { pos, boxW, boxH, width: padX * 2 + ranks.length * colW - hGap, height: padY * 2 + rowsMax * (boxH + vGap) - vGap };
  }, [vNodes]);

  const activeNode = active ? vNodes.find((n) => n.id === active) : null;

  // Focus from the rule table: clear the filter (so the node is visible), pin it, and remember to scroll to it.
  useEffect(() => {
    if (!focus?.id) return;
    setFilter([]);
    setPinned(focus.id);
    pendingScroll.current = focus.id;
  }, [focus?.n]);
  // Scroll runs once the (possibly re-filtered) layout is ready, so pos.get() sees the node.
  useEffect(() => {
    const id = pendingScroll.current;
    if (!id || !layout || !scrollRef.current) return;
    const p = layout.pos.get(id);
    if (p) { scrollRef.current.scrollTo({ top: Math.max(0, p.y - 140), behavior: 'smooth' }); pendingScroll.current = null; }
  }, [layout, pinned]);

  const nodeSkin = (id: string, enabled: boolean) => {
    if (!hi) return { fill: enabled === false ? 'var(--colorFillTertiary,#f5f5f5)' : 'var(--colorBgContainer,#fff)', stroke: enabled === false ? 'var(--colorBorderSecondary,#e0e0e0)' : 'var(--colorPrimaryBorder,#c7d2fe)', sw: 1.4, op: 1 };
    if (id === active) return { fill: 'var(--colorPrimaryBg,#e6f0ff)', stroke: 'var(--colorPrimary,#2563eb)', sw: 2.6, op: 1 };
    if (up.has(id)) return { fill: 'var(--colorInfoBg,#e6f4ff)', stroke: 'var(--colorInfoBorder,#69b1ff)', sw: 1.8, op: 1 };
    if (down.has(id)) return { fill: 'var(--colorWarningBg,#fff7e6)', stroke: 'var(--colorWarningBorder,#ffc069)', sw: 1.8, op: 1 };
    return { fill: 'var(--colorFillTertiary,#f5f5f5)', stroke: 'var(--colorBorderSecondary,#e0e0e0)', sw: 1.2, op: 0.28 };
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <FilterOutlined style={{ color: 'var(--colorTextTertiary)' }} />
        <Select mode="multiple" allowClear size="small" placeholder={t('Lọc theo bảng…')} value={filter} onChange={setFilter} options={collOptions} style={{ minWidth: 220 }} maxTagCount="responsive" />
        <span style={{ fontSize: 12, color: 'var(--colorTextTertiary)' }}>{vNodes.length}/{nodes.length} {t('cột computed')}</span>
        <span style={{ flex: 1 }} />
        <Space size={14} style={{ fontSize: 12 }}>
          <span><Dot c={KIND_COLOR.aggregate} />{t('gộp')}</span>
          <span><Dot c={KIND_COLOR.lookup} />{t('kéo')}</span>
          <span><Dot c={KIND_COLOR.local} />{t('cùng dòng')}</span>
        </Space>
      </div>

      {/* FIXED height + own scroll: a long formula must NOT grow this box, else the SVG below shifts down,
          the cursor lands on a different node, hover flips, and it flickers. Constant height = stable layout. */}
      <div style={{ height: 56, overflow: 'auto', marginBottom: 6, fontSize: 12 }}>
        {activeNode ? (
          <>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <b>{activeNode.collection}.{activeNode.field}</b>
              <span style={{ color: 'var(--colorInfo,#1677ff)' }}><ArrowUpOutlined /> {up.size} {t('nguồn')}</span>
              <span style={{ color: 'var(--colorWarning,#d48806)' }}><ArrowDownOutlined /> {down.size} {t('bị ảnh hưởng')}</span>
              <span style={{ color: 'var(--colorTextTertiary)' }}>{pinned ? <><PushpinOutlined /> {t('đã ghim — bấm lại để bỏ')}</> : t('(bấm để ghim)')}</span>
            </div>
            <code style={{ fontSize: 11.5, color: 'var(--colorTextSecondary)', wordBreak: 'break-word' }}>{activeNode.formula}</code>
          </>
        ) : (
          <span style={{ color: 'var(--colorTextTertiary)' }}>{t('Rê chuột (hoặc bấm để ghim) lên một ô → nổi bật')} <b style={{ color: 'var(--colorInfo,#1677ff)' }}>{t('toàn bộ nguồn (upstream)')}</b> & <b style={{ color: 'var(--colorWarning,#d48806)' }}>{t('toàn bộ chỗ bị ảnh hưởng (downstream)')}</b> — {t('đệ quy.')}</span>
        )}
      </div>

      {!layout ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('Chưa có công thức nào')} />
      ) : (
        <div ref={scrollRef} style={{ overflow: 'auto', maxHeight: 420, border: '1px solid var(--colorBorderSecondary, #f0f0f0)', borderRadius: 8, background: 'var(--colorBgLayout, #fafafa)' }} onClick={() => setPinned(null)}>
          <svg width={Math.max(layout.width, 320)} height={Math.max(layout.height, 80)}>
            <defs>
              <marker id="cf-arr" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" style={{ fill: 'var(--colorTextTertiary, #94a3b8)' }} /></marker>
            </defs>
            {vEdges.map((e, i) => {
              const a = layout.pos.get(e.from), b = layout.pos.get(e.to);
              if (!a || !b) return null;
              const on = !hi || (hi.has(e.from) && hi.has(e.to));
              const x1 = a.x + layout.boxW, y1 = a.y + layout.boxH / 2, x2 = b.x, y2 = b.y + layout.boxH / 2, mx = (x1 + x2) / 2;
              return <path key={i} d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`} fill="none" stroke={KIND_COLOR[e.kind] || '#bbb'} strokeWidth={on ? 2.2 : 1} markerEnd="url(#cf-arr)" opacity={on ? 0.95 : 0.1} />;
            })}
            {[...layout.pos.values()].map(({ x, y, n }: any) => {
              const s = nodeSkin(n.id, n.enabled);
              return (
                <g key={n.id} transform={`translate(${x},${y})`} opacity={s.op} style={{ cursor: 'pointer' }}
                  onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover((h) => (h === n.id ? null : h))}
                  onClick={(ev) => { ev.stopPropagation(); setPinned((p) => (p === n.id ? null : n.id)); }}>
                  <rect width={layout.boxW} height={layout.boxH} rx={7} strokeWidth={s.sw} style={{ fill: s.fill, stroke: s.stroke }} />
                  <text x={10} y={18} fontSize={11} style={{ fill: 'var(--colorTextTertiary, #94a3b8)' }}>{clip(n.collection)}</text>
                  <text x={10} y={35} fontSize={13} fontWeight={600} style={{ fill: n.enabled === false ? 'var(--colorTextQuaternary, #aaa)' : 'var(--colorText, #1e293b)' }}>{clip(n.field)}</text>
                </g>
              );
            })}
          </svg>
        </div>
      )}
    </div>
  );
}

// ------------------------------- main -------------------------------
export function ComputedRulesManager({ api }: { api: any }) {
  const [rows, setRows] = useState<Rule[]>([]);
  const [graph, setGraph] = useState<{ nodes: any[]; edges: any[] }>({ nodes: [], edges: [] });
  // A focus request for the DAG (bumped `.n` re-triggers even for the same node). Set by the table's ◎ button.
  const [focusReq, setFocusReq] = useState<{ id: string; n: number }>({ id: '', n: 0 });
  const focusInDag = (r: Rule) => {
    const n = graph.nodes.find((x: any) => x.collection === r.collectionName && x.field === r.targetField);
    if (!n) { message.info(t('Cột này chưa có trong sơ đồ (lưu công thức trước).')); return; }
    setFocusReq((p) => ({ id: n.id, n: p.n + 1 }));
  };
  const [collOptions, setCollOptions] = useState<{ value: string; label: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState<Rule | null>(null);
  const [numericOpts, setNumericOpts] = useState<{ value: string; label: string }[]>([]);
  const [recordOpts, setRecordOpts] = useState<{ value: any; label: string }[]>([]);
  const [testId, setTestId] = useState<any>('');
  const [testRes, setTestRes] = useState<any>(null);
  const [testing, setTesting] = useState(false);
  const [aiDesc, setAiDesc] = useState('');
  const [aiBusy, setAiBusy] = useState('');
  const [aiResult, setAiResult] = useState<any>(null);
  const [aiOptions, setAiOptions] = useState<any[] | null>(null);
  const [aiExplainText, setAiExplainText] = useState('');
  const [aiAppsheet, setAiAppsheet] = useState('');
  const { token } = theme.useToken();
  const tv = themeVars(token);
  const taRef = useRef<any>(null);

  const req = (url: string, opts: any = {}) => api?.request?.({ url, ...opts });

  // AI formula tools — all call the server (which self-validates via Chạy thử) then update the modal.
  const aiClear = () => { setAiResult(null); setAiOptions(null); setAiExplainText(''); };
  const aiCall = async (busy: string, url: string, data: any, onOk: (d: any) => void) => {
    if (!modal?.collectionName) { message.warning(t('Chọn "Bảng" trước')); return; }
    setAiBusy(busy); aiClear();
    try {
      const res = await req(url, { method: 'post', data: { collection: modal.collectionName, sampleId: testId || undefined, ...data } });
      onOk(unwrap(res));
    } catch (e: any) {
      setAiResult({ error: String(e?.response?.data?.errors?.[0]?.message || e?.message || e) });
    } finally { setAiBusy(''); }
  };
  const aiWrite = () => { if (!aiDesc.trim()) return message.warning(t('Nhập mô tả bạn muốn tính')); aiCall('write', 'ptdlComputed:aiWrite', { description: aiDesc }, (d) => { setAiResult(d); if (d.formula) setModal({ ...modal!, formula: d.formula }); }); };
  const aiSuggest = () => { if (!aiDesc.trim()) return message.warning(t('Nhập mô tả bạn muốn tính')); aiCall('suggest', 'ptdlComputed:aiSuggest', { description: aiDesc, count: 3 }, (d) => { if (d.error) setAiResult(d); else setAiOptions(d.options || []); }); };
  const aiExplain = () => { if (!modal?.formula?.trim()) return message.warning(t('Ô công thức đang trống')); aiCall('explain', 'ptdlComputed:aiExplain', { formula: modal.formula }, (d) => { if (d.error) setAiResult(d); else setAiExplainText(d.explanation || ''); }); };
  const aiFix = () => { if (!modal?.formula?.trim()) return message.warning(t('Ô công thức đang trống')); aiCall('fix', 'ptdlComputed:aiWrite', { fixFormula: modal.formula, description: aiDesc }, (d) => { setAiResult(d); if (d.formula) setModal({ ...modal!, formula: d.formula }); }); };
  const aiConvert = () => { if (!aiAppsheet.trim()) return message.warning(t('Dán công thức AppSheet')); aiCall('convert', 'ptdlComputed:aiConvert', { appsheet: aiAppsheet }, (d) => { setAiResult(d); if (d.formula) setModal({ ...modal!, formula: d.formula }); }); };

  const load = async () => {
    if (!api?.request) return;
    setLoading(true);
    try {
      const [r1, r2, r3] = await Promise.all([
        req('ptdlComputedRules:list', { params: { pageSize: 1000, sort: ['collectionName', 'targetField'] } }),
        req('ptdlComputed:graph'),
        req('collections:list', { params: { paginate: false } }).catch(() => null),
      ]);
      setRows(r1?.data?.data || []);
      const g = unwrap(r2);
      setGraph({ nodes: g.nodes || [], edges: g.edges || [] });
      setCollOptions((r3?.data?.data || []).map((c: any) => { const t = cleanTitle(c.title, c.name); return { value: c.name, label: t !== c.name ? `${t} (${c.name})` : c.name }; }));
    } catch (e) {
      message.error(t('Không tải được danh sách công thức'));
    }
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  // On collection change: target-field options + records for "Chạy thử" (labelled by the collection's title field).
  useEffect(() => {
    let alive = true;
    setTestRes(null); setTestId('');
    (async () => {
      const coll = modal?.collectionName;
      if (!coll) { setNumericOpts([]); setRecordOpts([]); return; }
      const fs = await getFields(api, coll).catch(() => []);
      if (!alive) return;
      setNumericOpts((fs || []).filter((f: any) => TARGET_TYPES.has(f.type)).map((f: any) => { const t = cleanTitle(f.uiSchema?.title, f.name); return { value: f.name, label: t !== f.name ? `${t} (${f.name}) · ${f.type}` : `${f.name} · ${f.type}` }; }));
      try {
        const cg = await req('collections:get', { params: { filterByTk: coll } });
        const tf = cg?.data?.data?.titleField || (fs || []).find((f: any) => f.type === 'string')?.name || null;
        const rl = await req(`${coll}:list`, { params: { pageSize: 100, sort: ['id'] } });
        const recs = (rl?.data?.data || []).map((r: any) => { const id = r.id; const t = tf ? r[tf] : null; return { value: id, label: t != null && t !== '' ? `${t} · #${id}` : `#${id}` }; });
        if (alive) setRecordOpts(recs);
      } catch { if (alive) setRecordOpts([]); }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line
  }, [modal?.collectionName]);

  const save = async (r: Rule | null) => {
    if (!r) return;
    if (!r.collectionName || !r.targetField || !r.formula?.trim()) { message.warning(t('Cần Bảng + Cột đích + Công thức')); return; }
    try {
      await req('ptdlComputedRules:updateOrCreate', {
        method: 'post', params: { filterKeys: ['key'] },
        data: { ...r, key: keyOf(r), deps: [], enabled: r.enabled !== false, runOn: r.runOn == null ? 'both' : r.runOn, onError: r.onError || 'null', dataSourceKey: r.dataSourceKey || 'main' },
      });
      message.success(t('Đã lưu — server tự tính lại các dòng liên quan'));
      setModal(null);
      load();
    } catch (e: any) {
      message.error(t('Lưu lỗi') + ': ' + (e?.response?.data?.errors?.[0]?.message || e?.message || 'unknown'));
    }
  };
  const del = async (r: Rule) => { try { await req('ptdlComputedRules:destroy', { method: 'post', params: { filter: { key: keyOf(r) } } }); message.success(t('Đã xoá')); load(); } catch { message.error(t('Xoá lỗi')); } };
  const recompute = async (r: Rule) => { try { const res = await req('ptdlComputed:recompute', { method: 'post', params: { collection: r.collectionName } }); message.success(t('Đã tính lại {{n}} lượt cho {{coll}}', { n: unwrap(res).recomputed ?? '?', coll: r.collectionName })); } catch { message.error(t('Recompute lỗi')); } };
  const toggle = async (r: Rule, on: boolean) => { await save({ ...r, enabled: on }); };

  const pickField = (path: string[]) => {
    if (!modal) return;
    insertAtCaret(getCaretElement(taRef.current), 'data.' + path.join('.'), modal.formula || '', (v) => setModal({ ...modal, formula: v }));
  };

  // Lookup-table picker: any collection → its columns; inserts a BARE `collection.column` (no data.).
  const [tableOpts, setTableOpts] = useState<any[]>([]);
  useEffect(() => { setTableOpts(collOptions.map((c) => ({ value: c.value, label: c.label, isLeaf: false }))); }, [collOptions]);
  const loadTableFields = (selected: any[]) => {
    const target = selected[selected.length - 1];
    if (!target || target.children) return;
    target.loading = true;
    getFields(api, target.value).then((fs: any[]) => {
      target.loading = false;
      const kids = (fs || []).map((f: any) => ({ value: f.name, label: f.uiSchema?.title ? `${f.uiSchema.title} (${f.name})` : f.name, isLeaf: true }));
      target.children = kids.length ? kids : [{ value: '__none', label: t('(không có cột)'), disabled: true, isLeaf: true }];
      setTableOpts((prev) => [...prev]);
    });
  };
  const insertTableRef = (val: any[]) => {
    if (!modal || !val || val.length < 2) return;
    insertAtCaret(getCaretElement(taRef.current), `${val[0]}.${val[1]}`, modal.formula || '', (v) => setModal({ ...modal, formula: v }));
  };

  // "Chạy thử": evaluate the formula against one record (server, no write) and show the result.
  const runTest = async (idArg?: any) => {
    if (!modal?.collectionName || !modal?.formula?.trim()) { message.warning(t('Cần bảng + công thức')); return; }
    const id = idArg !== undefined ? idArg : testId;
    setTesting(true); setTestRes(null);
    try {
      const res = await req('ptdlComputed:test', { method: 'post', data: { collection: modal.collectionName, formula: modal.formula, filterByTk: id === '' || id == null ? undefined : id } });
      setTestRes(unwrap(res));
    } catch (e: any) { setTestRes({ error: e?.response?.data?.errors?.[0]?.message || e?.message || t('lỗi') }); }
    setTesting(false);
  };
  // options that always include the current value (so a preset/code-defined name still shows + Select opens full)
  const withCurrent = (opts: { value: string; label: string }[], cur?: string) =>
    cur && !opts.some((o) => o.value === cur) ? [{ value: cur, label: cur }, ...opts] : opts;

  const depByNode = useMemo(() => new Map(graph.nodes.map((n) => [`${n.collection}.${n.field}`, n.deps])), [graph]);
  const depTags = (r: Rule) => {
    const d = depByNode.get(`${r.collectionName}.${r.targetField}`);
    if (!d) return <span style={{ color: 'var(--colorTextQuaternary, #ccc)' }}>—</span>;
    const tags: any[] = [];
    (d.local || []).forEach((f: string, i: number) => tags.push(<Tag key={'l' + i}>{f}</Tag>));
    (d.aggregate || []).forEach((e: any, i: number) => tags.push(<Tag key={'a' + i} color="blue" icon={<FunctionOutlined />}>{e.relation}.{e.field}</Tag>));
    (d.lookup || []).forEach((e: any, i: number) => tags.push(<Tag key={'k' + i} color="green" icon={<LinkOutlined />}>{e.relation}.{e.field}</Tag>));
    (d.table || []).forEach((e: any, i: number) => tags.push(<Tag key={'t' + i} color="purple" icon={<TableOutlined />}>{e.collection}</Tag>));
    return tags.length ? <Space size={[0, 4]} wrap>{tags}</Space> : <span style={{ color: 'var(--colorTextQuaternary, #ccc)' }}>—</span>;
  };

  const columns = [
    { title: t('Bảng'), dataIndex: 'collectionName', width: 140, ellipsis: true },
    { title: t('Cột đích'), dataIndex: 'targetField', width: 130, ellipsis: true, render: (v: string) => <b>{v}</b> },
    { title: t('Công thức'), dataIndex: 'formula', render: (v: string) => <code style={{ fontSize: 12 }}>{v}</code> },
    { title: t('Phụ thuộc'), width: 220, render: (_: any, r: Rule) => depTags(r) },
    { title: t('Bật'), dataIndex: 'enabled', width: 56, render: (_: any, r: Rule) => <Switch size="small" checked={r.enabled !== false} onChange={(c) => toggle(r, c)} /> },
    {
      title: '', width: 220, render: (_: any, r: Rule) => (
        <Space size={4}>
          <Tooltip title={t('Xem trong sơ đồ')}><Button size="small" icon={<AimOutlined />} onClick={() => focusInDag(r)} /></Tooltip>
          <Button size="small" onClick={() => setModal({ ...r })}>{t('Sửa')}</Button>
          <Tooltip title={t('Tính lại toàn bộ dòng của bảng này')}><Button size="small" onClick={() => recompute(r)}>{t('Tính lại')}</Button></Tooltip>
          <Popconfirm title={t('Xoá công thức này?')} okText={t('Xoá')} cancelText={t('Huỷ')} onConfirm={() => del(r)}><Button size="small" danger>{t('Xoá')}</Button></Popconfirm>
        </Space>
      ),
    },
  ];

  const helpPopover = (
    <div style={{ width: 420, maxHeight: 320, overflow: 'auto', ...tv }}>
      <Typography.Paragraph style={{ marginBottom: 8 }}>
        <span dangerouslySetInnerHTML={{ __html: t('Cách tham chiếu dữ liệu:<br/>• <b>Cột của dòng hiện tại</b> → <code>data.&lt;tên_cột&gt;</code> (vd <code>data.subtotal</code>).<br/>• <b>Qua quan hệ</b> → <code>data.&lt;tên_quan_hệ&gt;.&lt;cột&gt;</code> (vd <code>SUM(data.items.line_amount)</code>, <code>data.product.unit_price</code>).<br/>• <b>Bảng tra cứu</b> (một collection khác) → gõ thẳng <code>&lt;tên_collection&gt;.&lt;cột&gt;</code> — KHÔNG có <code>data.</code> (vd <code>bang_gia.he_so</code>).<br/>Nối chuỗi dùng <b>&amp;</b>. Tên hàm HOA/thường đều được.') }} />
      </Typography.Paragraph>
      {FN_HELP.map(([g, fns]) => <div key={g} style={{ marginBottom: 6 }}><div style={{ fontSize: 12, fontWeight: 600, color: 'var(--colorTextTertiary, #888)' }}>{t(g)}</div><div style={{ fontSize: 12, fontFamily: 'monospace' }}>{t(fns)}</div></div>)}
    </div>
  );
  const examplesPopover = (
    <div style={{ width: 470, maxHeight: 360, overflow: 'auto', ...tv }}>
      {EXAMPLES.map(([label, f]) => (
        <div key={label} style={{ marginBottom: 9, cursor: 'pointer', padding: 4, borderRadius: 4 }}
          onClick={() => { if (modal) insertAtCaret(getCaretElement(taRef.current), f, modal.formula || '', (v) => setModal({ ...modal, formula: v })); }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--colorFillQuaternary, #f5f5f5)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
          <div style={{ fontSize: 12, fontWeight: 600 }}>{t(label)}</div>
          <code style={{ fontSize: 11.5, color: 'var(--colorTextSecondary)' }}>{f}</code>
        </div>
      ))}
    </div>
  );
  const testBadge = (tr: any, tries?: number) => !tr ? null : (tr.error
    ? <span style={{ color: 'var(--colorWarning, #d48806)' }}>{t('Chạy thử lỗi')}{tries ? ` (${tries} ${t('lần')})` : ''}: {tr.error}</span>
    : <span style={{ color: 'var(--colorSuccess, #389e0d)' }}>{t('Chạy thử OK')}{tries ? ` (${tries} ${t('lần')})` : ''} → <b>{JSON.stringify(tr.value)}</b></span>);
  const aiPopover = (
    <div style={{ width: 430, ...tv }}>
      <Input.TextArea rows={2} value={aiDesc} onChange={(e) => setAiDesc(e.target.value)}
        placeholder={t('Mô tả bằng lời, vd: "tổng tiền các dòng đang active", "số ngày từ ngày tạo đến hôm nay"')} />
      <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button type="primary" size="small" icon={<RobotOutlined />} loading={aiBusy === 'write'} onClick={aiWrite}>{t('Tạo công thức')}</Button>
        <Button size="small" loading={aiBusy === 'suggest'} onClick={aiSuggest}>{t('Gợi ý 3 phương án')}</Button>
      </div>
      <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed var(--colorBorderSecondary, #eee)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: 'var(--colorTextTertiary)' }}>{t('Trên công thức đang có:')}</span>
        <Button size="small" loading={aiBusy === 'explain'} disabled={!modal?.formula?.trim()} onClick={aiExplain}>{t('Giải thích')}</Button>
        <Button size="small" loading={aiBusy === 'fix'} disabled={!modal?.formula?.trim()} onClick={aiFix}>{t('AI sửa lỗi')}</Button>
      </div>
      <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed var(--colorBorderSecondary, #eee)' }}>
        <span style={{ fontSize: 11, color: 'var(--colorTextTertiary)' }}>{t('Có công thức AppSheet? Dán vào đây để AI chuyển:')}</span>
        <Input.TextArea rows={2} value={aiAppsheet} onChange={(e) => setAiAppsheet(e.target.value)} style={{ marginTop: 4, fontFamily: 'monospace', fontSize: 12 }}
          placeholder={'SUM(SELECT(items[amount], [order_id] = [_THISROW].[id]))'} />
        <Button style={{ marginTop: 6 }} size="small" loading={aiBusy === 'convert'} onClick={aiConvert}>⇄ {t('Chuyển từ AppSheet')}</Button>
      </div>
      {aiExplainText && <div style={{ marginTop: 10, fontSize: 12, color: 'var(--colorTextSecondary)', background: 'var(--colorFillQuaternary, #f7f7f7)', padding: 8, borderRadius: 4 }}>{aiExplainText}</div>}
      {aiResult && (
        <div style={{ marginTop: 10, fontSize: 12, borderTop: '1px solid var(--colorBorderSecondary, #f0f0f0)', paddingTop: 8 }}>
          {aiResult.error ? <div style={{ color: 'var(--colorError, #cf1322)' }}>{t('Lỗi')}: {aiResult.error}</div> : (
            <>
              {aiResult.formula && <div>{t('Đã điền')}: <code style={{ fontSize: 11.5 }}>{aiResult.formula}</code></div>}
              {aiResult.explanation && <div style={{ color: 'var(--colorTextSecondary)', marginTop: 4 }}>{aiResult.explanation}</div>}
              <div style={{ marginTop: 4 }}>{testBadge(aiResult.test, aiResult.tries)}</div>
            </>
          )}
        </div>
      )}
      {aiOptions && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 11, color: 'var(--colorTextTertiary)', marginBottom: 4 }}>{t('Bấm 1 phương án để chèn:')}</div>
          {aiOptions.length === 0 && <div style={{ fontSize: 12, color: 'var(--colorTextTertiary)' }}>{t('(AI không trả về phương án)')}</div>}
          {aiOptions.map((o, i) => (
            <div key={i} style={{ padding: 6, borderRadius: 4, cursor: 'pointer', border: '1px solid var(--colorBorderSecondary, #f0f0f0)', marginBottom: 6 }}
              onClick={() => { setModal({ ...modal!, formula: o.formula }); message.success(t('Đã chèn phương án {{n}}', { n: i + 1 })); }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--colorFillQuaternary, #f5f5f5)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
              <code style={{ fontSize: 11.5 }}>{o.formula}</code>
              {o.explanation && <div style={{ fontSize: 11, color: 'var(--colorTextTertiary)', marginTop: 2 }}>{o.explanation}</div>}
              <div style={{ fontSize: 11, marginTop: 2 }}>{testBadge(o.test)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
  const isEdit = !!(modal?.id || modal?.key);

  return (
    <div style={{ padding: 20, maxWidth: 1200, margin: '8px auto 16px', background: 'var(--colorBgContainer, #fff)', border: '0.8px solid var(--colorBorderSecondary, #f0f0f0)', borderRadius: 8, ...tv }}>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
        <span dangerouslySetInnerHTML={{ __html: t('Cột computed là <b>field thật</b> (số / chữ / ngày / boolean) server tự tính lại khi dữ liệu liên quan đổi (cùng dòng, gộp quan hệ, kéo quan hệ — mọi độ sâu). Phụ thuộc tự phát hiện từ công thức. Lưu là tự tính lại dòng cũ + đồng bộ về sau.') }} />
      </Typography.Paragraph>

      <SettingCard style={{ marginBottom: 16, padding: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: '1px solid var(--colorBorderSecondary, #f0f0f0)', fontWeight: 600 }}>
          <PartitionOutlined /> {t('Sơ đồ phụ thuộc (DAG)')}
          <Hint tip={t('Node = cột computed, xếp theo tầng topo (nguồn trái → kết quả phải). Mũi tên: nguồn → cột được tính. Rê chuột lên node để làm nổi bật chuỗi & xem công thức. Lọc theo bảng khi nhiều cột.')} />
        </div>
        <div style={{ padding: 12 }}><Dag nodes={graph.nodes} edges={graph.edges} focus={focusReq} /></div>
      </SettingCard>

      <Space style={{ marginBottom: 8 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModal({ collectionName: '', targetField: '', formula: '', runOn: 'both', onError: 'null', enabled: true, dataSourceKey: 'main' })}>{t('Thêm công thức')}</Button>
        <Button icon={<ReloadOutlined />} onClick={load}>{t('Tải lại')}</Button>
      </Space>
      <Table rowKey={(r) => keyOf(r)} size="small" loading={loading} columns={columns as any} dataSource={rows} pagination={false} bordered />

      <Modal open={!!modal} title={<Space><CalculatorOutlined />{isEdit ? t('Sửa công thức') : t('Thêm công thức')}</Space>} onCancel={() => setModal(null)} onOk={() => save(modal)} okText={t('Lưu')} cancelText={t('Huỷ')} width={800} destroyOnClose>
        {modal && (
          <div style={{ paddingTop: 8, ...tv }}>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                <SettingRow layout="vertical" label={t('Bảng (collection)')}>
                  <Select showSearch style={{ width: '100%' }} value={modal.collectionName || undefined} options={withCurrent(collOptions, modal.collectionName)}
                    optionFilterProp="label" filterOption={(i, o) => String(o?.label).toLowerCase().includes(i.toLowerCase())}
                    onChange={(v) => setModal({ ...modal, collectionName: (v as string) || '', targetField: '' })} placeholder={t('Chọn hoặc tìm bảng')} disabled={isEdit} />
                </SettingRow>
              </div>
              <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                <SettingRow layout="vertical" label={t('Cột đích — field thật (số / chữ / ngày / boolean)')}>
                  <Select showSearch style={{ width: '100%' }} value={modal.targetField || undefined} options={withCurrent(numericOpts, modal.targetField)}
                    optionFilterProp="label" filterOption={(i, o) => String(o?.label).toLowerCase().includes(i.toLowerCase())}
                    onChange={(v) => setModal({ ...modal, targetField: (v as string) || '' })} placeholder={numericOpts.length ? t('Chọn cột đích') : t('Chọn bảng trước')} disabled={isEdit} notFoundContent={t('Không có field phù hợp')} />
                </SettingRow>
              </div>
            </div>
            <SettingRow layout="vertical" label={<span>{t('Công thức — dòng hiện tại & quan hệ dùng')} <code>data.…</code> · {t('bảng tra cứu gõ thẳng tên bảng')} <code>{t('tên_bảng.cột')}</code></span>}>
              <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
                <FieldPickerCascader api={api} collectionName={modal.collectionName} includeToMany maxDepth={4} onPick={pickField}
                  label={<span style={{ fontSize: 12.5 }}><PartitionOutlined /> {t('Chèn field/quan hệ')}</span>} />
                <Cascader options={tableOpts} loadData={loadTableFields as any} changeOnSelect={false} placement="bottomLeft"
                  showSearch={{ filter: (i: string, p: any[]) => p.some((o) => String(o.label).toLowerCase().includes(i.toLowerCase())) }}
                  onChange={(val: any) => insertTableRef(val)} value={[] as any}>
                  <a style={{ fontSize: 12.5 }} onClick={(e) => e.preventDefault()}><TableOutlined /> {t('Chèn bảng tra cứu')}</a>
                </Cascader>
                <Popover content={examplesPopover} trigger="click" title={t('Ví dụ công thức')}><a style={{ fontSize: 12.5 }}><BulbOutlined /> {t('Ví dụ')}</a></Popover>
                <Popover content={helpPopover} trigger="click" title={t('Hàm & cú pháp')}><a style={{ fontSize: 12.5 }}><FunctionOutlined /> {t('hàm')}</a></Popover>
                <Popover content={aiPopover} trigger="click" title={<span><RobotOutlined /> {t('Viết công thức bằng AI')}</span>} placement="bottomLeft" destroyTooltipOnHide={false}>
                  <a style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--colorPrimary, #722ed1)' }}><RobotOutlined /> {t('AI viết hộ')}</a>
                </Popover>
              </div>
              <Input.TextArea ref={taRef} autoSize={{ minRows: 3, maxRows: 8 }} value={modal.formula}
                onChange={(e) => setModal({ ...modal, formula: e.target.value })}
                placeholder={t('vd: data.subtotal - data.discount\nhoặc: SUM(data.items.line_amount)\nbảng tra cứu (gõ thẳng tên bảng): data.metric * SUMIFS(bang_hs.he_so, bang_hs.a, data.parent.region, bang_hs.b, data.grade)')}
                style={{ fontFamily: 'monospace', fontSize: 13 }} />
            </SettingRow>
            {/* Auto-width nowrap labels so bilingual labels (e.g. "Enabled") never break; wrap only BETWEEN groups. */}
            <Space size={20} wrap align="center" style={{ marginBottom: 8, rowGap: 8 }}>
              <Space size={8} align="center">
                <span style={INLINE_LBL}>{t('Tính khi')}</span>
                <Checkbox.Group options={TRIGGER_OPTIONS.map((o) => ({ ...o, label: t(o.label) }))} value={splitTriggers(modal.runOn)}
                  onChange={(vals) => setModal({ ...modal, runOn: (vals as string[]).join(',') })} />
                <Tooltip title={
                  <div style={{ fontSize: 12, lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: t('Tích nhiều được — ghép thành kịch bản:<br/><b>Khi tạo</b>: tính 1 lần lúc tạo dòng.<br/><b>Khi sửa</b>: tính lại mỗi lần mở dòng đó bấm lưu (bất kể sửa field nào).<br/><b>Khi nguồn thay đổi</b>: tính lại khi dữ liệu nguồn đổi (thêm/xoá dòng con, sửa cha, <u>sửa bảng config</u>) — đây là phần “lan” (fan-out).<br/><br/>Ví dụ:<br/>• <b>Tạo + Sửa + Nguồn</b> = luôn đúng tuyệt đối (mặc định).<br/>• <b>Tạo + Sửa</b> = cứ mở form lưu là tính, nhưng sửa bảng config KHÔNG lan (an toàn, không tốn).<br/>• <b>Sửa + Nguồn</b> = luôn đúng theo nguồn, không chốt lúc tạo.<br/>• <b>Chỉ Tạo</b> = chốt số, đóng băng (số HĐ, giá lúc đặt).') }} />
                }><BulbOutlined style={{ color: 'var(--colorTextTertiary, #999)', cursor: 'help' }} /></Tooltip>
                {splitTriggers(modal.runOn).length === 0 && (
                  <span style={{ fontSize: 12, color: 'var(--colorWarning, #d48806)', whiteSpace: 'nowrap' }}>{t('Chưa chọn → không tự tính (chỉ bằng nút “Tính lại”).')}</span>
                )}
              </Space>
              <Space size={8} align="center">
                <span style={INLINE_LBL}>{t('Khi lỗi')}</span>
                <Select size="small" value={modal.onError || 'null'} style={{ width: 150 }} onChange={(v) => setModal({ ...modal, onError: v })}
                  options={[{ label: t('Ghi null'), value: 'null' }, { label: t('Giữ giá trị cũ'), value: 'keep' }]} />
              </Space>
              <Space size={8} align="center">
                <span style={INLINE_LBL}>{t('Bật')}</span>
                <Switch size="small" checked={modal.enabled !== false} onChange={(c) => setModal({ ...modal, enabled: c })} />
              </Space>
            </Space>
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--colorBorderSecondary, #f0f0f0)' }}>
              <Space wrap size={8} align="center">
                <span style={{ fontSize: 12, color: 'var(--colorTextTertiary)' }}><PlayCircleOutlined /> {t('Chạy thử trên 1 bản ghi:')}</span>
                <Select showSearch size="small" style={{ width: 320 }} allowClear optionFilterProp="label"
                  placeholder={recordOpts.length ? t('Chọn bản ghi (trống = bản ghi đầu)') : t('Bảng chưa có bản ghi')}
                  value={testId === '' || testId == null ? undefined : testId} options={recordOpts}
                  filterOption={(i, o) => String(o?.label).toLowerCase().includes(i.toLowerCase())}
                  onChange={(v) => { setTestId(v ?? ''); runTest(v ?? ''); }} notFoundContent={t('Không có bản ghi')} />
                <Button size="small" type="dashed" loading={testing} onClick={() => runTest()}>{t('Chạy')}</Button>
                {testRes && (testRes.error
                  ? <Tag color="red" style={{ whiteSpace: 'normal', maxWidth: 520 }}>{t('Lỗi')}: {testRes.error}</Tag>
                  : <Tag color="green" style={{ whiteSpace: 'normal', maxWidth: 520 }}>{t('Kết quả')} = <b>{testRes.value === null || testRes.value === undefined ? 'null' : String(testRes.value)}</b>{testRes.recordId != null ? ` · id ${testRes.recordId}` : ''}</Tag>)}
              </Space>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

export default ComputedRulesManager;
