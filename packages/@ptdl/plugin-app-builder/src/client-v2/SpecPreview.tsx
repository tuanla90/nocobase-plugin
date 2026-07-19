/**
 * SpecPreview — a VISUAL preview of an App-Spec, so a user can see what the app will contain without
 * reading JSON. EVERYTHING is derived from the spec; anything the spec doesn't carry is simply omitted
 * (no faking). Rendered as a "Xem trước" view in the Build-app launcher (see index.tsx).
 *
 * Sections (all spec-derived):
 *  · stat chips + a plain-Vietnamese summary
 *  · a data-model diagram (ERD): one box per collection, an arrow per relation (labelled by type)
 *  · the menu tree (groups → pages)
 *  · per page: the table columns, the popup columns, any o2m sub-tables, and the row actions — every
 *    column carries a field-type icon, and columns with extra config (status-flow, formula, relation,
 *    choices) reveal it on hover (a mini flow diagram / the formula / the target / the options).
 */
import React from 'react';
import { Collapse, Empty, Popover, Space, Tag, Typography, theme } from 'antd';
import {
  FontColorsOutlined, FileTextOutlined, MailOutlined, PhoneOutlined, LinkOutlined, NumberOutlined,
  PercentageOutlined, UnorderedListOutlined, CheckSquareOutlined, CalendarOutlined, ClockCircleOutlined,
  BgColorsOutlined, AppstoreOutlined, CodeOutlined, BranchesOutlined, FunctionOutlined, PaperClipOutlined,
  TableOutlined, EyeOutlined, EditOutlined, SwapOutlined, DatabaseOutlined, PartitionOutlined,
  LayoutOutlined, FolderOutlined,
} from '@ant-design/icons';
import type { AppSpec, CollectionSpec, FieldSpec, RelationSpec, PageSpec } from '../shared/appSpec';

// ── field interface → icon + friendly type label ──────────────────────────────────────────────────
const ICONS: Record<string, React.ComponentType<any>> = {
  input: FontColorsOutlined, textarea: FileTextOutlined, markdown: FileTextOutlined, richText: FileTextOutlined,
  email: MailOutlined, phone: PhoneOutlined, url: LinkOutlined, uuid: FontColorsOutlined, nanoid: FontColorsOutlined,
  password: FontColorsOutlined,
  number: NumberOutlined, integer: NumberOutlined, percent: PercentageOutlined,
  select: UnorderedListOutlined, multipleSelect: UnorderedListOutlined, radioGroup: UnorderedListOutlined,
  checkboxGroup: UnorderedListOutlined,
  checkbox: CheckSquareOutlined, boolean: CheckSquareOutlined,
  date: CalendarOutlined, datetime: CalendarOutlined, time: ClockCircleOutlined,
  color: BgColorsOutlined, icon: AppstoreOutlined, json: CodeOutlined,
  statusFlow: BranchesOutlined, computed: FunctionOutlined,
  attachment: PaperClipOutlined, attachmentUrl: PaperClipOutlined,
  m2o: LinkOutlined, o2o: LinkOutlined, o2m: TableOutlined, m2m: TableOutlined,
};
const TYPE_LABEL: Record<string, string> = {
  input: 'Văn bản', textarea: 'Văn bản dài', email: 'Email', phone: 'Điện thoại', url: 'Liên kết',
  number: 'Số', integer: 'Số nguyên', percent: 'Phần trăm', select: 'Một lựa chọn',
  multipleSelect: 'Nhiều lựa chọn', radioGroup: 'Một lựa chọn', checkboxGroup: 'Nhiều lựa chọn',
  checkbox: 'Có/Không', boolean: 'Có/Không', date: 'Ngày', datetime: 'Ngày giờ', time: 'Giờ',
  color: 'Màu', icon: 'Biểu tượng', json: 'JSON', statusFlow: 'Luồng trạng thái', computed: 'Tự tính',
  attachment: 'Tệp', attachmentUrl: 'Ảnh/Tệp (URL)',
  m2o: 'Liên kết 1 bản ghi', o2o: 'Liên kết 1–1', o2m: 'Danh sách con', m2m: 'Nhiều–nhiều',
};
const RELATION_TYPES = new Set(['m2o', 'o2o', 'o2m', 'm2m']);
const OPTION_IFACES = new Set(['select', 'multipleSelect', 'radioGroup', 'checkboxGroup']);
const SYS = new Set(['id', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy', 'createdById', 'updatedById', 'sort']);

// map a friendly/concrete statusFlow colour to an antd Tag colour
const TAG_COLOR: Record<string, string> = { processing: 'blue', warning: 'gold', success: 'green', error: 'red', default: 'default' };
const tagColor = (c?: string) => (c ? TAG_COLOR[c] || c : 'default');

type ColCfg =
  | { kind: 'statusFlow'; states: { label: string; color?: string }[]; transitions?: Record<string, string[]> }
  | { kind: 'computed'; expression: string }
  | { kind: 'relation'; target: string; targetTitle: string; type: string }
  | { kind: 'select'; options: { value: string; label?: string; color?: string }[] }
  | null;
interface PreviewCol { name: string; title: string; iface: string; isRelation?: boolean; required?: boolean; unique?: boolean; cfg: ColCfg; }

// ── spec → view helpers (pure) ────────────────────────────────────────────────────────────────────
const findColl = (spec: AppSpec, name?: string): CollectionSpec | undefined => (spec.collections || []).find((c) => c.name === name);
const normStates = (s: FieldSpec['states']) => (s || []).map((x) => (typeof x === 'string' ? { label: x } : x));
const normOptions = (o: FieldSpec['options']) => (o || []).map((x) => (typeof x === 'string' ? { value: x, label: x } : x));

function fieldCfg(spec: AppSpec, f: FieldSpec): ColCfg {
  if (f.computed?.expression) return { kind: 'computed', expression: f.computed.expression };
  if (f.interface === 'statusFlow' && f.states?.length) return { kind: 'statusFlow', states: normStates(f.states), transitions: f.transitions };
  if (OPTION_IFACES.has(f.interface) && f.options?.length) return { kind: 'select', options: normOptions(f.options) };
  return null;
}
function resolveCol(spec: AppSpec, coll: CollectionSpec | undefined, name: string): PreviewCol {
  const f = coll?.fields?.find((x) => x.name === name);
  if (f) return { name, title: f.title || name, iface: f.computed ? 'computed' : f.interface, required: f.required, unique: f.unique, cfg: fieldCfg(spec, f) };
  const r = coll?.relations?.find((x) => x.name === name);
  if (r) return { name, title: r.title || name, iface: r.type, isRelation: true, cfg: { kind: 'relation', target: r.target, targetTitle: findColl(spec, r.target)?.title || r.target, type: r.type } };
  return { name, title: name, iface: 'input', cfg: null };
}
const colNames = (p: PageSpec): string[] => (p.columns || []).map((c) => (typeof c === 'string' ? c : c.name));

function subTablesFor(spec: AppSpec, coll: CollectionSpec | undefined, names: string[]) {
  const out: { title: string; columns: PreviewCol[] }[] = [];
  for (const n of names) {
    const r = coll?.relations?.find((x) => x.name === n && x.type === 'o2m');
    if (!r) continue;
    const tgt = findColl(spec, r.target);
    const childNames = r.subColumns?.length ? r.subColumns : (tgt?.fields || []).filter((f) => !SYS.has(f.name)).map((f) => f.name);
    out.push({ title: r.title || r.name, columns: childNames.map((cn) => resolveCol(spec, tgt, cn)) });
  }
  return out;
}

// ── ERD layout (grid + straight arrows clipped to box borders) ────────────────────────────────────
function borderPoint(cx: number, cy: number, hw: number, hh: number, tx: number, ty: number): [number, number] {
  const dx = tx - cx, dy = ty - cy;
  if (!dx && !dy) return [cx, cy];
  const s = Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity);
  return [cx + dx * s, cy + dy * s];
}
function buildErd(spec: AppSpec) {
  const colls = spec.collections || [];
  const referenced = new Set<string>();
  colls.forEach((c) => (c.relations || []).forEach((r) => { if (r.type === 'm2o' || r.type === 'o2o') referenced.add(r.target); }));
  const W = 150, H = 46, gapX = 46, gapY = 58, pad = 14;
  const cols = Math.max(1, Math.min(colls.length, 3));
  const nodes = colls.map((c, i) => {
    const cc = i % cols, rr = Math.floor(i / cols);
    return { name: c.name, title: c.title || c.name, master: referenced.has(c.name), x: pad + cc * (W + gapX), y: pad + rr * (H + gapY), w: W, h: H };
  });
  const byName: Record<string, (typeof nodes)[number]> = {};
  nodes.forEach((n) => (byName[n.name] = n));
  // ONE edge per collection PAIR (a m2o + its reverse o2m are the same link — don't draw both). Merge to a
  // single cardinality label: N–N (any m2m) > 1–N (m2o/o2m) > 1–1 (o2o). Rendered as a two-headed arrow.
  const pairs = new Map<string, { a: string; b: string; card: string }>();
  const rank: Record<string, number> = { '1–1': 0, '1–N': 1, 'N–N': 2 };
  colls.forEach((c) => (c.relations || []).forEach((r) => {
    if (!byName[c.name] || !byName[r.target] || c.name === r.target) return;
    const key = [c.name, r.target].sort().join('|');
    const card = r.type === 'm2m' ? 'N–N' : (r.type === 'o2o' ? '1–1' : '1–N');
    const prev = pairs.get(key);
    if (!prev || rank[card] > rank[prev.card]) pairs.set(key, { a: c.name, b: r.target, card });
  }));
  const edges: { x1: number; y1: number; x2: number; y2: number; mx: number; my: number; label: string }[] = [];
  pairs.forEach(({ a: an, b: bn, card }) => {
    const a = byName[an], b = byName[bn];
    const ac = [a.x + a.w / 2, a.y + a.h / 2], bc = [b.x + b.w / 2, b.y + b.h / 2];
    const [x1, y1] = borderPoint(ac[0], ac[1], a.w / 2, a.h / 2, bc[0], bc[1]);
    const [x2, y2] = borderPoint(bc[0], bc[1], b.w / 2, b.h / 2, ac[0], ac[1]);
    edges.push({ x1, y1, x2, y2, mx: (x1 + x2) / 2, my: (y1 + y2) / 2, label: card });
  });
  const rows = Math.ceil(colls.length / cols);
  return { nodes, edges, width: pad * 2 + cols * W + (cols - 1) * gapX, height: pad * 2 + rows * H + (rows - 1) * gapY };
}

function buildSummary(spec: AppSpec): string {
  const colls = spec.collections || [];
  const titles = colls.map((c) => c.title || c.name);
  const list = titles.length > 1 ? `${titles.slice(0, -1).join(', ')} và ${titles[titles.length - 1]}` : titles[0] || '';
  const rels: string[] = [];
  colls.forEach((c) => (c.relations || []).forEach((r) => {
    const to = findColl(spec, r.target)?.title || r.target;
    if (r.type === 'o2m') rels.push(`mỗi ${c.title || c.name} có nhiều ${to}`);
    else if (r.type === 'm2o' || r.type === 'o2o') rels.push(`mỗi ${c.title || c.name} gắn 1 ${to}`);
    else rels.push(`${c.title || c.name} liên kết nhiều–nhiều với ${to}`);
  }));
  const nG = (spec.menu?.groups?.length) || new Set((spec.pages || []).map((p) => p.menuGroup).filter(Boolean)).size;
  const sf = colls.reduce((a, c) => a + (c.fields || []).filter((f) => f.interface === 'statusFlow').length, 0);
  let s = `App "${spec.meta?.title || spec.meta?.name || 'chưa đặt tên'}" gồm ${colls.length} bảng: ${list}.`;
  if (rels.length) s += ` ${rels.slice(0, 4).join('; ')}${rels.length > 4 ? '…' : ''}.`;
  s += ` Có ${(spec.pages || []).length} trang${nG ? ` chia ${nG} nhóm menu` : ''}.`;
  if (sf) s += ` Có ${sf} cột luồng trạng thái.`;
  return s;
}

// ── small render pieces ───────────────────────────────────────────────────────────────────────────
const TypeIcon: React.FC<{ iface: string }> = ({ iface }) => {
  const I = ICONS[iface] || FontColorsOutlined;
  return <I style={{ fontSize: 13, opacity: 0.75 }} />;
};

const StatusFlowMini: React.FC<{ cfg: Extract<ColCfg, { kind: 'statusFlow' }> }> = ({ cfg }) => {
  const colorOf = (label: string) => cfg.states.find((s) => s.label === label)?.color;
  const T = cfg.transitions && Object.keys(cfg.transitions).length ? cfg.transitions : null;
  return (
    <div style={{ maxWidth: 300 }}>
      {T
        ? Object.entries(T).map(([from, tos]) => (
            <div key={from} style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4, margin: '3px 0' }}>
              <Tag color={tagColor(colorOf(from))} style={{ margin: 0 }}>{from}</Tag>
              <SwapOutlined style={{ fontSize: 11, opacity: 0.5 }} />
              {tos.map((to) => <Tag key={to} color={tagColor(colorOf(to))} style={{ margin: 0 }}>{to}</Tag>)}
            </div>
          ))
        : (
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
              {cfg.states.map((s, i) => (
                <React.Fragment key={i}>
                  <Tag color={tagColor(s.color)} style={{ margin: 0 }}>{s.label}</Tag>
                  {i < cfg.states.length - 1 && <span style={{ opacity: 0.4 }}>→</span>}
                </React.Fragment>
              ))}
            </div>
          )}
    </div>
  );
};

function cfgPopover(cfg: ColCfg): { title: string; content: React.ReactNode } | null {
  if (!cfg) return null;
  if (cfg.kind === 'statusFlow') return { title: 'Luồng trạng thái', content: <StatusFlowMini cfg={cfg} /> };
  if (cfg.kind === 'computed') return { title: 'Cột tự tính (công thức)', content: <Typography.Text code style={{ fontSize: 12 }}>{cfg.expression}</Typography.Text> };
  if (cfg.kind === 'relation') return { title: 'Quan hệ', content: <span style={{ fontSize: 12 }}>→ bảng <b>{cfg.targetTitle}</b> · {TYPE_LABEL[cfg.type] || cfg.type}</span> };
  if (cfg.kind === 'select') return { title: 'Lựa chọn', content: <Space size={4} wrap>{cfg.options.map((o) => <Tag key={o.value} color={tagColor(o.color)} style={{ margin: 0 }}>{o.label || o.value}</Tag>)}</Space> };
  return null;
}

const ColChip: React.FC<{ col: PreviewCol; token: any }> = ({ col, token }) => {
  const pop = cfgPopover(col.cfg);
  const chip = (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, padding: '2px 9px', borderRadius: 6,
        background: token.colorFillQuaternary, border: `1px ${pop ? 'dashed' : 'solid'} ${token.colorBorderSecondary}`,
        cursor: pop ? 'help' : 'default', color: token.colorText,
      }}
    >
      <TypeIcon iface={col.iface} />
      {col.title}
      {col.required && <span style={{ color: token.colorError }}>*</span>}
    </span>
  );
  if (!pop) return chip;
  return <Popover title={pop.title} content={pop.content} trigger="hover" mouseEnterDelay={0.15}>{chip}</Popover>;
};

const Chips: React.FC<{ label: React.ReactNode; cols: PreviewCol[]; token: any }> = ({ label, cols, token }) => (
  <div style={{ margin: '9px 0 2px' }}>
    <div style={{ fontSize: 11.5, color: token.colorTextTertiary, marginBottom: 5 }}>{label}</div>
    <Space size={6} wrap>{cols.map((c) => <ColChip key={c.name} col={c} token={token} />)}</Space>
  </div>
);

// ── ERD ───────────────────────────────────────────────────────────────────────────────────────────
const Erd: React.FC<{ spec: AppSpec; token: any }> = ({ spec, token }) => {
  const { nodes, edges, width, height } = buildErd(spec);
  if (!nodes.length) return null;
  const stroke = token.colorTextTertiary;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ maxHeight: height, display: 'block' }} role="img" aria-label="Sơ đồ dữ liệu">
      <defs>
        <marker id="ptdl-erd-ar" markerWidth="8" markerHeight="8" refX="6.5" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 z" fill={stroke} />
        </marker>
        <marker id="ptdl-erd-ar-s" markerWidth="8" markerHeight="8" refX="1.5" refY="4" orient="auto">
          <path d="M8,0 L0,4 L8,8 z" fill={stroke} />
        </marker>
      </defs>
      {edges.map((e, i) => (
        <g key={i}>
          <line x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} stroke={stroke} strokeWidth={1.3} markerStart="url(#ptdl-erd-ar-s)" markerEnd="url(#ptdl-erd-ar)" opacity={0.75} />
          <text x={e.mx} y={e.my - 3} fill={token.colorTextTertiary} fontSize={10} textAnchor="middle">{e.label}</text>
        </g>
      ))}
      {nodes.map((n) => (
        <g key={n.name}>
          <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={8}
            fill={n.master ? token.colorInfoBg : token.colorFillSecondary}
            stroke={n.master ? token.colorInfoBorder : token.colorBorder} strokeWidth={1} />
          <text x={n.x + n.w / 2} y={n.y + n.h / 2 + 4} textAnchor="middle" fontSize={12.5} fill={token.colorText}>{n.title}</text>
        </g>
      ))}
    </svg>
  );
};

// ── main ──────────────────────────────────────────────────────────────────────────────────────────
export const SpecPreview: React.FC<{ spec: AppSpec }> = ({ spec }) => {
  const { token } = theme.useToken();
  if (!spec || !Array.isArray(spec.collections) || !spec.collections.length) {
    return <Empty description="App-Spec chưa hợp lệ hoặc chưa có bảng nào" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
  }
  const colls = spec.collections;
  const nRel = colls.reduce((a, c) => a + (c.relations || []).length, 0);
  const nSF = colls.reduce((a, c) => a + (c.fields || []).filter((f) => f.interface === 'statusFlow').length, 0);
  const groups = spec.menu?.groups?.length ? spec.menu.groups.map((g) => g.label) : Array.from(new Set((spec.pages || []).map((p) => p.menuGroup).filter(Boolean) as string[]));
  const groupOf = (p: PageSpec) => p.menuGroup || '(không nhóm)';

  const stat = (icon: React.ReactNode, n: number, label: string) => (
    <Tag icon={icon} style={{ padding: '2px 10px', borderRadius: 999, background: token.colorFillQuaternary, borderColor: token.colorBorderSecondary, color: token.colorTextSecondary }}>{n} {label}</Tag>
  );

  return (
    <div style={{ color: token.colorText }}>
      <Space size={6} wrap style={{ marginBottom: 12 }}>
        {stat(<DatabaseOutlined />, colls.length, 'bảng')}
        {stat(<PartitionOutlined />, nRel, 'quan hệ')}
        {stat(<LayoutOutlined />, (spec.pages || []).length, 'trang')}
        {stat(<FolderOutlined />, groups.length, 'nhóm menu')}
        {nSF > 0 && stat(<BranchesOutlined />, nSF, 'luồng trạng thái')}
      </Space>

      <Typography.Paragraph style={{ color: token.colorTextSecondary, marginBottom: 16 }}>{buildSummary(spec)}</Typography.Paragraph>

      <div style={{ fontSize: 13, fontWeight: 500, margin: '0 0 6px' }}>Sơ đồ dữ liệu</div>
      <div style={{ border: `1px solid ${token.colorBorderSecondary}`, borderRadius: 10, padding: 10, marginBottom: 16, overflowX: 'auto' }}>
        <Erd spec={spec} token={token} />
      </div>

      <div style={{ fontSize: 13, fontWeight: 500, margin: '0 0 6px' }}>Cây menu</div>
      <div style={{ border: `1px solid ${token.colorBorderSecondary}`, borderRadius: 10, padding: '8px 12px', marginBottom: 16 }}>
        {groups.map((g) => (
          <div key={g}>
            <div style={{ fontSize: 12, color: token.colorTextTertiary, margin: '8px 0 2px' }}><FolderOutlined /> {g}</div>
            {(spec.pages || []).filter((p) => groupOf(p) === g).map((p) => (
              <div key={p.title} style={{ marginLeft: 16, padding: '3px 0', fontSize: 13.5 }}><LayoutOutlined style={{ opacity: 0.6, marginRight: 6 }} />{p.title}</div>
            ))}
          </div>
        ))}
        {(spec.pages || []).filter((p) => !p.menuGroup).length > 0 && groups.length === 0 &&
          (spec.pages || []).map((p) => <div key={p.title} style={{ padding: '3px 0', fontSize: 13.5 }}><LayoutOutlined style={{ opacity: 0.6, marginRight: 6 }} />{p.title}</div>)}
      </div>

      <div style={{ fontSize: 13, fontWeight: 500, margin: '0 0 6px' }}>Trang &amp; cột <span style={{ fontWeight: 400, color: token.colorTextTertiary, fontSize: 12 }}>— bấm mở, di chuột vào cột viền nét đứt để xem chi tiết</span></div>
      <Collapse
        defaultActiveKey={(spec.pages || []).slice(0, 1).map((_, i) => String(i))}
        items={(spec.pages || []).map((p, i) => {
          const coll = findColl(spec, p.collection);
          const names = colNames(p);
          const cols = names.map((n) => resolveCol(spec, coll, n));
          const popupNames = p.popupColumns?.length ? p.popupColumns : names;
          const popupCols = popupNames.map((n) => resolveCol(spec, coll, n));
          const subs = subTablesFor(spec, coll, popupNames.concat(names));
          const hasSF = (coll?.fields || []).some((f) => f.interface === 'statusFlow');
          return {
            key: String(i),
            label: <span><LayoutOutlined style={{ marginRight: 8, opacity: 0.7 }} />{p.title} <Typography.Text type="secondary" style={{ fontSize: 12 }}>· {cols.length} cột · {p.collection}</Typography.Text></span>,
            children: (
              <div>
                <Chips label={<span><TableOutlined /> Cột trên bảng</span>} cols={cols} token={token} />
                {(p.popupColumns?.length ? true : false) && <Chips label={<span><EyeOutlined /> Cột trong popup Xem/Sửa/Thêm</span>} cols={popupCols} token={token} />}
                {subs.map((s) => <Chips key={s.title} label={<span><TableOutlined /> Bảng con: {s.title}</span>} cols={s.columns} token={token} />)}
                <div style={{ margin: '10px 0 2px' }}>
                  <div style={{ fontSize: 11.5, color: token.colorTextTertiary, marginBottom: 5 }}>Nút mỗi dòng</div>
                  <Space size={6} wrap>
                    <Tag icon={<EyeOutlined />} color="blue" style={{ margin: 0 }}>Xem</Tag>
                    <Tag icon={<EditOutlined />} color="purple" style={{ margin: 0 }}>Sửa</Tag>
                    {hasSF && <Tag icon={<SwapOutlined />} color="gold" style={{ margin: 0 }}>Đổi trạng thái</Tag>}
                  </Space>
                </div>
              </div>
            ),
          };
        })}
      />
    </div>
  );
};

export default SpecPreview;
