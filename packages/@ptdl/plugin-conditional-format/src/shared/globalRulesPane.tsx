import React, { useEffect, useMemo, useState } from 'react';
import { Select, Button, message, Empty, Spin, Tag, theme, Divider, Table, Popconfirm, Tooltip } from 'antd';
import { ConfigContainer, colorToString, IconByKey } from '@ptdl/shared';
import { CondRulesEditor, rt, Rule } from './tableRulesModel';
import {
  loadGlobalRulesCache, globalRulesFor, upsertGlobalRules, allGlobalRuleCollections,
} from './globalRulesStore';

/**
 * Central settings page for the GLOBAL (field-level) conditional-format rules.
 *
 * Top: an OVERVIEW table of EVERY global rule across all collections (like the computed-field manager)
 * so you see everything at a glance — filter by collection, preview the style, edit or delete a rule.
 * Bottom: the full rule editor (the same CondRulesEditor the block dialog uses) for the picked collection.
 * Saves to `ptdlFieldFormatRules`; every table/detail on that collection then applies the rules.
 *
 * Single data source ('main'); multi-datasource collections use the block "Apply to all views" toggle.
 */

const DS = 'main';

type CollInfo = { name: string; title: string };
type RuleRow = { key: string; collection: string; index: number; rule: Rule };

// API titles for system entities arrive as raw `{{t("Roles")}}`; compile with the app translator.
function compileTitle(raw: any, appT?: (s: string) => string): string {
  const s = String(raw ?? '');
  if (!appT || s.indexOf('{{') < 0) return s;
  return s.replace(/\{\{\s*t\(\s*["'`](.+?)["'`]\s*\)\s*\}\}/g, (_m, k) => appT(k) || k);
}

const OP_LABEL: Record<string, string> = {
  $eq: '=', $ne: '≠', $includes: '⊃', $notIncludes: '⊅', $gt: '>', $lt: '<', $gte: '≥', $lte: '≤',
  $empty: '∅', $notEmpty: '≠∅', $null: '∅', $notNull: '≠∅', $between: '∈', $in: '∈', $notIn: '∉',
};

function condSummary(rule: Rule): string {
  const mode = rule.mode || 'condition';
  if (mode !== 'condition') return `${mode === 'colorScale' ? rt('Thang màu') : rt('Thanh dữ liệu')}: ${rule.column || '—'}`;
  const conds = (rule.conditions || []).filter((c) => c && c.field);
  if (!conds.length) return '—';
  const parts = conds.map((c) => `${c.fieldLabel || c.field} ${OP_LABEL[c.op || '$eq'] || c.op || '='} ${c.value == null ? '' : c.value}`.trim());
  const join = rule.match === 'any' ? ` ${rt('hoặc')} ` : ` ${rt('và')} `;
  return parts.join(join);
}

// Small style preview chip for a rule (mirrors the editor's "Mẫu").
const RulePreviewChip: React.FC<{ rule: Rule }> = ({ rule }) => {
  const mode = rule.mode || 'condition';
  if (mode === 'colorScale') {
    const a = colorToString(rule.colorMin) || '#ffffff'; const b = colorToString(rule.colorMax) || '#5b8ff9';
    const mid = rule.useMid ? `, ${colorToString(rule.colorMid) || '#ffeb84'}` : '';
    return <span style={{ display: 'inline-block', width: 90, height: 16, borderRadius: 3, border: '1px solid #eee', background: `linear-gradient(90deg, ${a}${mid}, ${b})` }} />;
  }
  if (mode === 'dataBar') {
    const bar = colorToString(rule.barColor) || '#5b8ff9';
    return <span style={{ display: 'inline-block', width: 90, height: 16, borderRadius: 3, border: '1px solid #eee', background: `linear-gradient(90deg, ${bar} 60%, transparent 60%)` }} />;
  }
  const color = colorToString(rule.color); const bg = colorToString(rule.background);
  const style: React.CSSProperties = {
    color: color || undefined, background: bg || undefined,
    fontWeight: rule.bold ? 700 : undefined, fontStyle: rule.italic ? 'italic' : undefined,
    border: rule.border ? `1px solid ${color || bg || '#d9d9d9'}` : undefined,
    borderRadius: rule.fillMode === 'cell' ? 2 : (typeof rule.radius === 'number' ? rule.radius : 4),
    padding: '1px 8px', display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12,
  };
  return (
    <span style={style}>
      {rule.icon ? <span style={{ display: 'inline-flex', lineHeight: 0 }}><IconByKey type={rule.icon} /></span> : null}
      <span>{rt('Mẫu')}</span>
    </span>
  );
};

function modeTags(rule: Rule): React.ReactNode {
  const mode = rule.mode || 'condition';
  if (mode === 'condition') return (
    <>
      <Tag style={{ marginInlineEnd: 4 }}>{rt('Điều kiện')}</Tag>
      <Tag color={rule.fillMode === 'cell' ? 'geekblue' : 'default'}>{rule.fillMode === 'cell' ? rt('Cả ô') : rt('Nhãn')}</Tag>
    </>
  );
  if (mode === 'colorScale') return <Tag color="orange">{rt('Thang màu')}</Tag>;
  return <Tag color="purple">{rt('Thanh dữ liệu')}</Tag>;
}

export const GlobalRulesPane: React.FC<{ api: any; appT?: (s: string) => string }> = ({ api, appT }) => {
  const { token } = theme.useToken();
  const [collections, setCollections] = useState<CollInfo[]>([]);
  const [sel, setSel] = useState<string | undefined>(undefined);
  const [fields, setFields] = useState<{ value: string; label: string }[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [rows, setRows] = useState<RuleRow[]>([]);
  const [filter, setFilter] = useState<string[]>([]);
  const [loadingFields, setLoadingFields] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false);

  const titleOf = (name: string) => collections.find((c) => c.name === name)?.title || name;

  const rebuildRows = () => {
    const out: RuleRow[] = [];
    for (const { dataSource, collection } of allGlobalRuleCollections()) {
      if (dataSource !== DS) continue;
      globalRulesFor(DS, collection).forEach((rule, index) => out.push({ key: `${collection}#${index}`, collection, index, rule }));
    }
    setRows(out);
  };

  // Initial load: collection list + global-rules cache.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await api?.request?.({ url: 'collections:list', params: { paginate: false } });
        const list: CollInfo[] = (res?.data?.data || [])
          .filter((c: any) => c && c.name && !c.hidden && String(c.name)[0] !== '_' && c.template !== 'view')
          .map((c: any) => ({ name: c.name, title: compileTitle((c.title && String(c.title)) || c.name, appT) }));
        list.sort((a, b) => a.title.localeCompare(b.title));
        if (alive) setCollections(list);
      } catch (_) { /* ignore */ }
      try { await loadGlobalRulesCache(api); } catch (_) { /* ignore */ }
      if (alive) { rebuildRows(); setReady(true); }
    })();
    return () => { alive = false; };
  }, [api, appT]);

  // On collection change: load its rules + fields (for the "Apply to" column list).
  useEffect(() => {
    if (!sel) { setFields([]); setRules([]); return; }
    setRules(globalRulesFor(DS, sel));
    let alive = true;
    setLoadingFields(true);
    (async () => {
      try {
        const res = await api?.request?.({ url: `collections/${sel}/fields:list`, params: { paginate: false } });
        const fs = (res?.data?.data || [])
          .filter((f: any) => f && f.name)
          .map((f: any) => ({ value: f.name, label: compileTitle((f.uiSchema?.title && String(f.uiSchema.title)) || (f.title && String(f.title)) || f.name, appT) }));
        if (alive) setFields(fs);
      } catch (_) { if (alive) setFields([]); }
      finally { if (alive) setLoadingFields(false); }
    })();
    return () => { alive = false; };
  }, [sel, api, appT]);

  const save = async () => {
    if (!sel) return;
    setSaving(true);
    try {
      await upsertGlobalRules(api, DS, sel, rules);
      rebuildRows();
      message.success(rt('Đã lưu'));
    } catch (e: any) {
      message.error(e?.message || rt('Lưu thất bại'));
    } finally {
      setSaving(false);
    }
  };

  const deleteRule = async (collection: string, index: number) => {
    const next = globalRulesFor(DS, collection).slice();
    next.splice(index, 1);
    try {
      await upsertGlobalRules(api, DS, collection, next);
      rebuildRows();
      if (sel === collection) setRules(globalRulesFor(DS, collection));
      message.success(rt('Đã xoá'));
    } catch (e: any) {
      message.error(e?.message || rt('Xoá thất bại'));
    }
  };

  const collOptions = useMemo(() => collections.map((c) => ({ value: c.name, label: c.title })), [collections]);
  const visibleRows = useMemo(() => (filter.length ? rows.filter((r) => filter.includes(r.collection)) : rows), [rows, filter]);

  const columns = [
    { title: rt('Collection'), dataIndex: 'collection', width: 150, ellipsis: true, render: (_: any, r: RuleRow) => <b>{titleOf(r.collection)}</b> },
    { title: rt('Quy tắc'), key: 'rule', render: (_: any, r: RuleRow) => <span style={{ fontSize: 12.5 }}>{condSummary(r.rule)}</span> },
    {
      title: rt('Áp dụng cho'), key: 'targets', width: 200,
      render: (_: any, r: RuleRow) => {
        const t = (r.rule.mode || 'condition') === 'condition' ? (r.rule.targets || []) : (r.rule.column ? [r.rule.column] : []);
        return <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 3 }}>{t.map((x, i) => <Tag key={i} style={{ marginInlineEnd: 0 }}>{x}</Tag>)}</span>;
      },
    },
    { title: rt('Kiểu'), key: 'mode', width: 150, render: (_: any, r: RuleRow) => modeTags(r.rule) },
    { title: rt('Xem trước'), key: 'preview', width: 130, render: (_: any, r: RuleRow) => <RulePreviewChip rule={r.rule} /> },
    {
      title: '', key: 'act', width: 120,
      render: (_: any, r: RuleRow) => (
        <span style={{ display: 'inline-flex', gap: 4 }}>
          <Button size="small" type="link" onClick={() => setSel(r.collection)}>{rt('Sửa')}</Button>
          <Popconfirm title={rt('Xoá quy tắc này?')} okText={rt('Xoá')} cancelText={rt('Huỷ')} onConfirm={() => deleteRule(r.collection, r.index)}>
            <Button size="small" type="link" danger>{rt('Xoá')}</Button>
          </Popconfirm>
        </span>
      ),
    },
  ];

  if (!ready) return <ConfigContainer maxWidth={100000}><div style={{ padding: 40, textAlign: 'center' }}><Spin /></div></ConfigContainer>;

  return (
    <ConfigContainer maxWidth={100000}>
      <div style={{ marginBottom: 16, color: token.colorTextTertiary, fontSize: 13 }}>
        {rt('Đặt quy tắc tô màu/biểu tượng cho một collection một lần — mọi bảng, trang chi tiết và danh sách dùng collection đó đều áp, không cần cấu hình từng block.')}
      </div>

      {/* Overview: every global rule at a glance */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>{rt('Tất cả quy tắc')} <span style={{ color: token.colorTextTertiary, fontWeight: 400 }}>({rows.length})</span></span>
        <Select mode="multiple" allowClear size="small" placeholder={rt('Lọc theo collection…')} value={filter} onChange={setFilter}
          options={collOptions} style={{ minWidth: 220 }} maxTagCount="responsive" showSearch optionFilterProp="label" />
        <span style={{ flex: 1 }} />
        <Tooltip title={rt('Chọn collection bên dưới rồi thêm quy tắc')}>
          <span style={{ fontSize: 12, color: token.colorTextTertiary }}>{rt('Thêm mới ở khu vực bên dưới ↓')}</span>
        </Tooltip>
      </div>
      {rows.length ? (
        <Table<RuleRow>
          rowKey="key" size="small" bordered pagination={false}
          columns={columns as any} dataSource={visibleRows}
          onRow={(r) => ({ onClick: () => setSel(r.collection), style: { cursor: 'pointer', ...(sel === r.collection ? { background: token.colorPrimaryBg } : {}) } })}
          style={{ marginBottom: 20 }}
        />
      ) : (
        <Empty description={rt('Chưa có quy tắc global nào — chọn collection bên dưới để thêm.')} style={{ padding: '18px 0', marginBottom: 12 }} />
      )}

      <Divider style={{ margin: '8px 0 18px' }} />

      {/* Editor for the picked collection */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <span style={{ color: token.colorTextTertiary, fontSize: 13 }}>{rt('Cấu hình collection')}</span>
        <Select
          showSearch optionFilterProp="label" allowClear
          style={{ minWidth: 340, flex: '1 1 340px', maxWidth: 560 }}
          placeholder={rt('Chọn collection để cấu hình')}
          value={sel}
          onChange={(v) => setSel(v)}
          options={collOptions}
        />
        {sel ? <Button type="primary" loading={saving} onClick={save}>{rt('Lưu quy tắc global')}</Button> : null}
      </div>

      {sel ? (
        <div style={{ position: 'relative' }}>
          {loadingFields ? (
            <div style={{ position: 'absolute', right: 0, top: -30, color: token.colorTextTertiary, fontSize: 12 }}>
              <Spin size="small" /> {rt('Đang tải cột…')}
            </div>
          ) : null}
          <CondRulesEditor value={rules} onChange={(v) => setRules(v)} api={api} collectionName={sel} dataSourceKey={DS} columns={fields} />
        </div>
      ) : (
        <Empty description={rt('Chọn một collection ở trên để bắt đầu.')} style={{ padding: '20px 0' }} />
      )}
    </ConfigContainer>
  );
};

export default GlobalRulesPane;
