import React, { useEffect, useMemo, useState } from 'react';
import { Table, Tag, Button, Popconfirm, Empty, Spin, Select, message, theme } from 'antd';
import { ConfigContainer } from '@tuanla90/shared';
import { allFieldWidgets, loadFieldWidgetCache, removeFieldWidget } from './fieldWidgetStore';

/**
 * Central overview for GLOBAL (field-level) widget assignments (`ptdlFieldWidget`).
 *
 * Read/manage only — you SET a global widget from the field's own settings dialog (the "Apply to all
 * views" toggle). Here you see every assignment at a glance and can remove one. Mirrors the
 * conditional-format global overview table.
 */

// Model name → friendly widget label (matches the no-code widget catalog).
const WIDGET_LABELS: Record<string, string> = {
  ConditionalStatusFieldModel: 'Value tag',
  PtdlRelativeDateFieldModel: 'Relative date',
  PtdlNumberFieldModel: 'Number + unit',
  PtdlProgressFieldModel: 'Progress bar',
  PtdlStarFieldModel: 'Star rating',
  PtdlBooleanFieldModel: 'Boolean style',
  PtdlLongTextFieldModel: 'Clamp text',
  PtdlJsonFieldModel: 'JSON view',
  PtdlColorFieldModel: 'Colour chip',
  PtdlIconGlyphFieldModel: 'Icon glyph',
  PtdlLinkFieldModel: 'Link',
  PtdlRichSelectFieldModel: 'Rich select',
  PtdlRichSelectDisplayFieldModel: 'Rich select',
};
const widgetLabel = (m: string) => WIDGET_LABELS[m] || m;

function compileTitle(raw: any, appT?: (s: string) => string): string {
  const s = String(raw ?? '');
  if (!appT || s.indexOf('{{') < 0) return s;
  return s.replace(/\{\{\s*t\(\s*["'`](.+?)["'`]\s*\)\s*\}\}/g, (_m, k) => appT(k) || k);
}

type Row = { key: string; dataSource: string; collection: string; field: string; widgetModel: string };

export const GlobalWidgetsPane: React.FC<{ api: any; appT?: (s: string) => string; t?: (s: string) => string }> = ({ api, appT, t }) => {
  const { token } = theme.useToken();
  const tr = t || ((s: string) => s);
  const [collTitles, setCollTitles] = useState<Record<string, string>>({});
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  const rebuild = () => setRows(allFieldWidgets().map((w) => ({ key: `${w.dataSource}.${w.collection}.${w.field}`, dataSource: w.dataSource, collection: w.collection, field: w.field, widgetModel: w.widget.widgetModel })));

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await api?.request?.({ url: 'collections:list', params: { paginate: false } });
        const map: Record<string, string> = {};
        for (const c of res?.data?.data || []) if (c?.name) map[c.name] = compileTitle((c.title && String(c.title)) || c.name, appT);
        if (alive) setCollTitles(map);
      } catch (_) { /* ignore */ }
      try { await loadFieldWidgetCache(api); } catch (_) { /* ignore */ }
      if (alive) { rebuild(); setReady(true); }
    })();
    return () => { alive = false; };
  }, [api, appT]);

  const del = async (r: Row) => {
    try {
      await removeFieldWidget(api, r.dataSource, r.collection, r.field);
      rebuild();
      message.success(tr('Đã xoá'));
    } catch (e: any) {
      message.error(e?.message || tr('Xoá thất bại'));
    }
  };

  const collOptions = useMemo(() => {
    const names = Array.from(new Set(rows.map((r) => r.collection)));
    return names.map((n) => ({ value: n, label: collTitles[n] || n }));
  }, [rows, collTitles]);
  const visible = useMemo(() => (filter.length ? rows.filter((r) => filter.includes(r.collection)) : rows), [rows, filter]);

  const columns = [
    { title: tr('Collection'), key: 'coll', width: 200, render: (_: any, r: Row) => <b>{collTitles[r.collection] || r.collection}</b> },
    { title: tr('Cột'), dataIndex: 'field', width: 200, render: (v: string) => <Tag>{v}</Tag> },
    { title: tr('Widget'), key: 'widget', render: (_: any, r: Row) => <Tag color="blue">{widgetLabel(r.widgetModel)}</Tag> },
    {
      title: '', key: 'act', width: 90,
      render: (_: any, r: Row) => (
        <Popconfirm title={tr('Bỏ widget global cho cột này?')} okText={tr('Xoá')} cancelText={tr('Huỷ')} onConfirm={() => del(r)}>
          <Button size="small" type="link" danger>{tr('Xoá')}</Button>
        </Popconfirm>
      ),
    },
  ];

  if (!ready) return <ConfigContainer maxWidth={100000}><div style={{ padding: 40, textAlign: 'center' }}><Spin /></div></ConfigContainer>;

  return (
    <ConfigContainer maxWidth={100000}>
      <div style={{ marginBottom: 16, color: token.colorTextTertiary, fontSize: 13 }}>
        {tr('Danh sách các cột đã gán widget hiển thị "global" — set 1 lần, hiện ở mọi bảng/chi tiết. Muốn thêm: mở cấu hình widget của cột (⚙ → Field component) rồi bật "Áp dụng cho mọi view".')}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>{tr('Widget global')} <span style={{ color: token.colorTextTertiary, fontWeight: 400 }}>({rows.length})</span></span>
        <Select mode="multiple" allowClear size="small" placeholder={tr('Lọc theo collection…')} value={filter} onChange={setFilter}
          options={collOptions} style={{ minWidth: 220 }} maxTagCount="responsive" showSearch optionFilterProp="label" />
      </div>
      {rows.length ? (
        <Table<Row> rowKey="key" size="small" bordered pagination={false} columns={columns as any} dataSource={visible} />
      ) : (
        <Empty description={tr('Chưa có widget global nào. Bật "Áp dụng cho mọi view" trong cấu hình widget của một cột để thêm.')} style={{ padding: '24px 0' }} />
      )}
    </ConfigContainer>
  );
};

export default GlobalWidgetsPane;
