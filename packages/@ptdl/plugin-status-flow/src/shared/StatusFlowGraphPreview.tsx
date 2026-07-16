import React, { useMemo } from 'react';
import { StatusRow, TAG_HEX } from './types';
import { tt } from './i18n';

// Hand-rolled SVG state graph (no mermaid dependency): nodes are laid out in columns by BFS
// depth from the initial status, forward transitions are horizontal beziers, backward/same
// column transitions are routed underneath. Hovering an edge shows the roles allowed to move.

const NODE_H = 30;
const COL_GAP = 190;
const ROW_GAP = 52;
const PAD = 24;

interface NodePos {
  row: StatusRow;
  x: number;
  y: number;
  w: number;
  col: number;
}

function nodeWidth(label: string): number {
  return Math.max(88, Math.min(200, label.length * 7.5 + 30));
}

function computeLayout(rows: StatusRow[], initial?: string): NodePos[] {
  const nodes = rows.filter((r) => r.value);
  if (!nodes.length) return [];
  const byValue = new Map(nodes.map((n) => [n.value, n]));

  // BFS depth from initial statuses along declared transitions.
  const depth = new Map<string, number>();
  const starts = nodes.filter((n) => n.value === initial || n.kind === 'init');
  const queue: string[] = [];
  for (const s of starts.length ? starts : [nodes[0]]) {
    depth.set(s.value, 0);
    queue.push(s.value);
  }
  while (queue.length) {
    const v = queue.shift()!;
    const d = depth.get(v)!;
    for (const t of byValue.get(v)?.to || []) {
      if (byValue.has(t) && !depth.has(t)) {
        depth.set(t, d + 1);
        queue.push(t);
      }
    }
  }
  let maxDepth = 0;
  for (const d of depth.values()) maxDepth = Math.max(maxDepth, d);
  // Unreachable nodes: park terminal kinds in the last column, others after the starts.
  for (const n of nodes) {
    if (!depth.has(n.value)) {
      depth.set(n.value, n.kind === 'success' || n.kind === 'fail' ? maxDepth + 1 : 1);
    }
  }

  const cols = new Map<number, StatusRow[]>();
  for (const n of nodes) {
    const c = depth.get(n.value)!;
    if (!cols.has(c)) cols.set(c, []);
    cols.get(c)!.push(n);
  }

  const positions: NodePos[] = [];
  const maxRows = Math.max(...Array.from(cols.values()).map((list) => list.length));
  for (const [c, list] of cols) {
    const offset = ((maxRows - list.length) * ROW_GAP) / 2; // center shorter columns vertically
    list.forEach((n, i) => {
      positions.push({
        row: n,
        col: c,
        x: PAD + c * COL_GAP,
        y: PAD + offset + i * ROW_GAP,
        w: nodeWidth(n.label || n.value),
      });
    });
  }
  return positions;
}

export const StatusFlowGraphPreview: React.FC<{
  rows: StatusRow[];
  initial?: string;
  /** highlight this status as the record's current one (ring + bold) */
  current?: string;
  roleLabel?: (name: string) => string;
}> = ({ rows, initial, current, roleLabel }) => {
  const positions = useMemo(() => computeLayout(rows, initial), [rows, initial]);
  if (positions.length < 2) return null;

  const byValue = new Map(positions.map((p) => [p.row.value, p]));
  const width = Math.max(...positions.map((p) => p.x + p.w)) + PAD;
  let height = Math.max(...positions.map((p) => p.y)) + NODE_H + PAD;

  const edges: Array<{ d: string; color: string; title: string; key: string }> = [];
  let hasBackEdge = false;
  for (const p of positions) {
    for (const t of p.row.to) {
      const target = byValue.get(t);
      if (!target) continue;
      const color = TAG_HEX[p.row.color] || TAG_HEX.default;
      const roles = p.row.roles.length
        ? p.row.roles.map((r) => (roleLabel ? roleLabel(r) : r)).join(', ')
        : tt('All roles');
      const title = `${p.row.label || p.row.value} → ${target.row.label || target.row.value}  (${roles})`;
      const key = `${p.row.value}->${t}`;
      if (target.col > p.col) {
        // forward: right side -> left side, horizontal bezier
        const sx = p.x + p.w;
        const sy = p.y + NODE_H / 2;
        const tx = target.x;
        const ty = target.y + NODE_H / 2;
        const mx = (sx + tx) / 2;
        edges.push({ key, color, title, d: `M ${sx} ${sy} C ${mx} ${sy}, ${mx} ${ty}, ${tx - 6} ${ty}` });
      } else {
        // backward / same column: dip below both nodes
        hasBackEdge = true;
        const sx = p.x + p.w / 2;
        const sy = p.y + NODE_H;
        const tx = target.x + target.w / 2;
        const ty = target.y + NODE_H;
        const dip = Math.max(sy, ty) + 28 + Math.abs(p.col - target.col) * 8;
        edges.push({
          key,
          color,
          title,
          d: `M ${sx} ${sy} C ${sx} ${dip}, ${tx} ${dip}, ${tx} ${ty + 6}`,
        });
      }
    }
  }
  if (hasBackEdge) height += 30;

  // One arrow marker per used color (context-stroke is not reliable across browsers).
  const markerId = (hex: string) => 'sf-arrow-' + hex.replace('#', '');
  const usedColors = Array.from(
    new Set([...edges.map((e) => e.color), ...positions.map((p) => TAG_HEX[p.row.color] || TAG_HEX.default)]),
  );

  return (
    <div style={{ overflowX: 'auto', marginBottom: 8 }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        style={{ display: 'block', maxWidth: '100%' }}
      >
        <defs>
          {usedColors.map((hex) => (
            <marker
              key={hex}
              id={markerId(hex)}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 9 5 L 0 9 z" fill={hex} />
            </marker>
          ))}
        </defs>
        {edges.map((e) => (
          <g key={e.key}>
            <path
              d={e.d}
              fill="none"
              stroke={e.color}
              strokeWidth={1.5}
              opacity={0.7}
              markerEnd={`url(#${markerId(e.color)})`}
            >
              <title>{e.title}</title>
            </path>
            {/* wide invisible hit area so the tooltip is easy to reach */}
            <path d={e.d} fill="none" stroke="transparent" strokeWidth={10}>
              <title>{e.title}</title>
            </path>
          </g>
        ))}
        {positions.map((p) => {
          const color = TAG_HEX[p.row.color] || TAG_HEX.default;
          const isInitial = p.row.value === initial;
          const isFinal = !p.row.to.length && !p.row.toAll;
          const isCurrent = current !== undefined && p.row.value === current;
          let rawLabel = p.row.label || p.row.value;
          if (p.row.fromAll) rawLabel = '✳→ ' + rawLabel;
          if (p.row.toAll) rawLabel = rawLabel + ' →✳';
          const label = rawLabel.length > 24 ? rawLabel.slice(0, 23) + '…' : rawLabel;
          return (
            <g key={p.row.value}>
              {isInitial && (
                <path
                  d={`M ${p.x - 16} ${p.y + NODE_H / 2} L ${p.x - 5} ${p.y + NODE_H / 2}`}
                  stroke={color}
                  strokeWidth={1.5}
                  markerEnd={`url(#${markerId(color)})`}
                />
              )}
              {isCurrent && (
                <rect
                  x={p.x - 3}
                  y={p.y - 3}
                  rx={8}
                  width={p.w + 6}
                  height={NODE_H + 6}
                  fill="none"
                  stroke={color}
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  opacity={0.9}
                />
              )}
              <rect
                x={p.x}
                y={p.y}
                rx={6}
                width={p.w}
                height={NODE_H}
                fill={color + (isCurrent ? '33' : '1A')}
                stroke={color}
                strokeWidth={isCurrent ? 2.2 : isInitial ? 2 : 1.2}
              />
              <text
                x={p.x + p.w / 2}
                y={p.y + NODE_H / 2 + 4}
                textAnchor="middle"
                fontSize={12}
                fontFamily="inherit"
                fill={color}
                style={{ fontWeight: 500 }}
              >
                {label}
                <title>{rawLabel + (isInitial ? ' (' + tt('initial') + ')' : '') + (isFinal ? ' (' + tt('final') + ')' : '')}</title>
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};
