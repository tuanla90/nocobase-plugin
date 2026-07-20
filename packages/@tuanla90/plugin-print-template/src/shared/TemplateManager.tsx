// Settings screen: list + edit print templates. Shared by both lanes — the lane
// injects its own api-client hook (v1 useAPIClient / v2 useApp().apiClient).
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Button, Checkbox, Drawer, Input, InputNumber, Popconfirm, Select, Slider, Space,
  Modal, Table, Tabs, Tag, Tooltip, message, theme,
} from 'antd';
import Handlebars from 'handlebars';
import { GrapesBodyEditor, composeBody, splitStyleFromBody } from './GrapesBodyEditor';
import { RegistryIcon } from './iconRegistry';
import { ColorField, FieldPickerCascader, RelationAppendsPicker, getCaretElement, insertAtCaret, AiCodegenButton, st, SegmentedGroup } from '@tuanla90/shared';
import { HelperDocs } from './HelperDocs';
import { registerPtdlHelpers } from './helpers';
import { buildPrintDocument } from './printDoc';
import {
  ensureTemplateLibs,
  fetchSampleRecords,
  printData,
  printPreview,
  recordLabel,
  renderTemplateParts,
} from './printService';
import { DEFAULT_PAGE_SETUP, DEFAULT_WATERMARK, PrintTemplate, TEMPLATES_COLLECTION } from './types';
// Aliased to `tt` because this file uses `t` extensively as the template state variable
// (`const [t, setT] = useState`) and in `.map((t) => …)` — importing the translator as `t`
// would shadow / be shadowed. `tt` is the runtime translator (VN key → localized).
import { t as tt } from './i18n';

const fieldToken = (path: string[]) => `{{${path.join('.')}}}`;

// Validate an AI-generated Handlebars snippet the same way the renderer will: compile + render with the
// helper set registered (empty data). Catches syntax errors AND missing/typo'd helpers — the signals the
// AI retry loop then fixes.
function validateHbs(code: string): { ok: boolean; error?: string } {
  try {
    const hb: any = (Handlebars as any).create();
    registerPtdlHelpers(hb);
    hb.compile(String(code || ''))({});
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

function cleanTitle(raw: any, fallback: string): string {
  const s = String(raw ?? '');
  const m = s.match(/\{\{\s*t\(\s*['"]([^'"]+)['"]/);
  if (m) return m[1];
  if (!s || /\{\{/.test(s)) return fallback;
  return s;
}

const EMPTY: PrintTemplate = {
  title: '',
  collectionName: undefined,
  appends: [],
  headerHtml: '',
  bodyHtml: '',
  footerHtml: '',
  css: '',
  watermark: { ...DEFAULT_WATERMARK, text: '' },
  pageSetup: { ...DEFAULT_PAGE_SETUP },
  filename: '',
  enabled: true,
};

// Function (not a const) so the runtime translator resolves at render time, not module load.
const bodyHint = () => (
  <span>
    Handlebars: <code>{'{{field}}'}</code>, {tt('quan hệ')} <code>{'{{client.name}}'}</code>, {tt('lặp dòng con')}{' '}
    <code>{'{{#each items}} … {{this.qty}} … {{/each}}'}</code>, {tt('số')}{' '}
    <code>{'{{formatNumber total format="#,##0₫"}}'}</code>, {tt('ngày')} <code>{'{{formatDate date "DD/MM/YYYY"}}'}</code>
  </span>
);

export function createTemplateManager(deps: { useApiClient: () => any }): React.FC {
  const { useApiClient } = deps;

  // Appends must support NESTED dot-paths (items.product...) — NocoBase :get accepts them.
  // A flat one-hop multi-select broke down for the user before, so this is the shared 3-level
  // relation cascader (`RelationAppendsPicker` from @tuanla90/shared); each pick becomes a removable tag.

  // Multiple conditions for dynamic template selection. Each row: a field (nested
  // dot-path via the cascader) + matching values (smart enum suggestions). ALL rows
  // must match (AND). e.g. status ∈ [A] AND client.type ∈ [vip] → this template.
  const ConditionPicker: React.FC<{
    api: any;
    collectionName?: string;
    conditions: { field: string; values: string[] }[];
    onChange: (conds: { field: string; values: string[] }[]) => void;
  }> = ({ api, collectionName, conditions, onChange }) => {
    const [fields, setFields] = useState<any[]>([]); // top-level fields (for enum hints)
    useEffect(() => {
      let live = true;
      if (!collectionName) {
        setFields([]);
        return;
      }
      api
        ?.request({ url: 'collections:get', params: { filterByTk: collectionName, appends: ['fields'] } })
        .then((res: any) => live && setFields(res?.data?.data?.fields || []))
        .catch(() => live && setFields([]));
      return () => {
        live = false;
      };
    }, [collectionName]);
    const enumFor = (field: string) => {
      // enum suggestions only for a top-level select/status field
      const f = fields.find((x: any) => x.name === field);
      return ((f?.uiSchema?.enum || f?.options?.uiSchema?.enum || []) as any[]).map((o: any) => ({
        label: o?.label ?? o?.value,
        value: String(o?.value),
      }));
    };
    const rows = conditions || [];
    const setRow = (i: number, patch: any) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    const addRow = () => onChange([...rows, { field: '', values: [] }]);
    const delRow = (i: number) => onChange(rows.filter((_, j) => j !== i));
    return (
      <div>
        {rows.map((row, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            {i > 0 && <Tag color="blue" style={{ margin: 0 }}>{tt('VÀ')}</Tag>}
            <div style={{ minWidth: 190 }}>
              {row.field ? (
                <Tag closable onClose={() => setRow(i, { field: '' })} style={{ marginRight: 4 }}>
                  {row.field}
                </Tag>
              ) : null}
              <FieldPickerCascader
                api={api}
                collectionName={collectionName}
                includeToMany={false}
                onPick={(path: string[]) => setRow(i, { field: path.join('.') })}
                label={row.field ? tt('↻ đổi cột') : tt('＋ Chọn cột')}
              />
            </div>
            <Select
              mode="tags"
              style={{ flex: 1 }}
              placeholder={tt('Giá trị khớp (VD: A, B) — Enter để thêm')}
              disabled={!row.field}
              value={row.values}
              onChange={(v) => setRow(i, { values: v })}
              options={enumFor(row.field)}
            />
            <Button size="small" danger onClick={() => delRow(i)}>
              {tt('Xoá')}
            </Button>
          </div>
        ))}
        <Button size="small" type="dashed" onClick={addRow}>
          {tt('＋ Thêm điều kiện')} {rows.length ? tt('(VÀ)') : ''}
        </Button>
      </div>
    );
  };

  // Upload an image to NocoBase Attachments and return its URL — so users pick a logo
  // from a file instead of hunting for a URL.
  const AssetUploadButton: React.FC<{ api: any; onUploaded: (url: string) => void; label?: string; size?: 'small' | 'middle' }> = ({
    api,
    onUploaded,
    label = tt('Tải ảnh lên'),
    size = 'small',
  }) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const [busy, setBusy] = useState(false);
    const pick = () => inputRef.current?.click();
    const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      setBusy(true);
      try {
        const fd = new FormData();
        fd.append('file', file);
        const res = await api.request({
          url: 'attachments:create',
          method: 'post',
          data: fd,
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        const url = res?.data?.data?.url;
        if (url) {
          onUploaded(url);
          message.success(tt('Đã tải ảnh lên'));
        } else message.error(tt('Upload không trả về URL'));
      } catch (err: any) {
        message.error(err?.message || tt('Upload thất bại'));
      } finally {
        setBusy(false);
      }
    };
    return (
      <>
        <Button
          size={size}
          loading={busy}
          onClick={pick}
          icon={busy ? undefined : <RegistryIcon type="lucide-image-up" fallback="UploadOutlined" style={{ fontSize: 14 }} />}
        >
          {label}
        </Button>
        <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onFile} />
      </>
    );
  };

  // Textarea for one HTML part: "＋ Chèn cột" + a collapsible helper-function panel
  // right under it (scrollable, drag-to-resize, Copy/Chèn-at-caret) — user feedback:
  // functions belong WITH the HTML editor, not on a separate tab.
  const HtmlEditorArea: React.FC<{
    api: any;
    collectionName?: string;
    includeToMany?: boolean;
    value?: string;
    onChange: (v: string) => void;
    rows?: number;
    placeholder?: string;
    hint?: React.ReactNode;
  }> = ({ api, collectionName, includeToMany, value, onChange, rows = 12, placeholder, hint }) => {
    const { token } = theme.useToken();
    const taRef = useRef<any>(null);
    const [showFns, setShowFns] = useState(false);
    const [fnsHeight, setFnsHeight] = useState(240);
    const insert = (text: string) =>
      insertAtCaret(getCaretElement(taRef.current), text, value || '', (v) => onChange(v));
    const aiGenerate = async (req: any) => {
      if (!api?.request) return { error: st('Không có kết nối API') };
      try {
        const res = await api.request({ url: 'ptdlPrintAi:generate', method: 'post', data: { ...req, collectionName } });
        return res?.data?.data || { error: st('AI không phản hồi') };
      } catch (e: any) {
        return { error: e?.message || String(e) };
      }
    };
    const startDrag = (e: React.MouseEvent) => {
      e.preventDefault();
      const startY = e.clientY;
      const startH = fnsHeight;
      const move = (ev: MouseEvent) => setFnsHeight(Math.min(560, Math.max(120, startH - (ev.clientY - startY))));
      const stop = () => {
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', stop);
      };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', stop);
    };
    return (
      <div>
        <div style={{ marginBottom: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Space size={10}>
            <FieldPickerCascader
              api={api}
              collectionName={collectionName}
              includeToMany={includeToMany}
              onPick={(path) => insert(fieldToken(path))}
            />
            <AssetUploadButton
              api={api}
              label={tt('Chèn ảnh')}
              onUploaded={(url) => insert(`<img src="${url}" style="height:80px" />`)}
            />
            <AiCodegenButton
              language="handlebars"
              placeholder={st('Mô tả mẫu in bạn muốn (vd: hoá đơn có bảng dòng hàng + tổng tiền bằng chữ)')}
              getCurrent={() => value}
              validate={validateHbs}
              callGenerate={aiGenerate}
              onInsert={(code) => onChange(code)}
            />
          </Space>
          <a style={{ fontSize: 12.5, userSelect: 'none' }} onClick={() => setShowFns((s) => !s)}>
            {tt('ƒ Hàm')} {showFns ? '▴' : '▾'}
          </a>
        </div>
        <Input.TextArea
          ref={taRef}
          rows={rows}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
        {hint ? <div style={{ fontSize: 12, color: token.colorTextSecondary, marginTop: 4 }}>{hint}</div> : null}
        {showFns && (
          <>
            <div
              onMouseDown={startDrag}
              title={tt('Kéo để đổi chiều cao')}
              style={{
                height: 10,
                margin: '6px 0 0',
                cursor: 'ns-resize',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: token.colorTextQuaternary,
                fontSize: 10,
                userSelect: 'none',
              }}
            >
              ● ● ●
            </div>
            <div style={{ height: fnsHeight, overflow: 'auto', border: `1px solid ${token.colorBorderSecondary}`, borderRadius: 6 }}>
              <HelperDocs onInsert={insert} />
            </div>
          </>
        )}
      </div>
    );
  };

  // Header/footer editor with the same HTML | drag-drop toggle as the body tab.
  const HtmlOrVisual: React.FC<{
    api: any;
    collectionName?: string;
    value?: string;
    onChange: (v: string) => void;
    rows?: number;
    placeholder?: string;
    hint?: React.ReactNode;
  }> = ({ api, collectionName, value, onChange, rows = 6, placeholder, hint }) => {
    const [mode, setMode] = useState<'html' | 'visual'>('html');
    return (
      <div>
        <SegmentedGroup
          style={{ marginBottom: 8 }}
          value={mode}
          onChange={(v: any) => setMode(v)}
          options={[
            {
              value: 'html',
              label: (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 4px' }}>
                  <RegistryIcon type="lucide-code" fallback="CodeOutlined" style={{ fontSize: 14 }} />
                  {tt('Mã HTML')}
                </span>
              ),
            },
            {
              value: 'visual',
              label: (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 4px' }}>
                  <RegistryIcon type="lucide-layout-grid" fallback="AppstoreOutlined" style={{ fontSize: 14 }} />
                  {tt('Kéo-thả')}
                </span>
              ),
            },
          ]}
        />
        {mode === 'html' ? (
          <HtmlEditorArea
            api={api}
            collectionName={collectionName}
            rows={rows}
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            hint={hint}
          />
        ) : (
          <GrapesBodyEditor api={api} collectionName={collectionName} value={value} onChange={onChange} heightPx={340} />
        )}
      </div>
    );
  };

  const EditorDrawer: React.FC<{
    api: any;
    open: boolean;
    initial: PrintTemplate;
    collections: any[];
    onClose: () => void;
    onSaved: () => void;
  }> = ({ api, open, initial, collections, onClose, onSaved }) => {
    const { token } = theme.useToken();
    const [t, setT] = useState<PrintTemplate>(initial);
    const [saving, setSaving] = useState(false);
    const [bodyMode, setBodyMode] = useState<'html' | 'visual'>('visual');
    const [dirty, setDirty] = useState(false);
    useEffect(() => {
      setT(initial);
      setDirty(false);
    }, [initial, open]);
    const up = (patch: Partial<PrintTemplate>) => {
      setDirty(true);
      setT((prev) => ({ ...prev, ...patch }));
    };
    // Escape / click-outside must NOT silently discard edits — confirm first.
    const tryClose = () => {
      if (!dirty) return onClose();
      Modal.confirm({
        title: tt('Bỏ thay đổi chưa lưu?'),
        content: tt('Bạn có thay đổi chưa bấm Lưu. Đóng sẽ mất các thay đổi này.'),
        okText: tt('Đóng, bỏ thay đổi'),
        okButtonProps: { danger: true },
        cancelText: tt('Ở lại'),
        onOk: onClose,
      });
    };
    const wm = { ...DEFAULT_WATERMARK, text: '', ...(t.watermark || {}) };
    const ps = { ...DEFAULT_PAGE_SETUP, ...(t.pageSetup || {}) };

    // Live preview: sample = first record (refetched when collection/appends change),
    // render debounced so typing doesn't recompile every keystroke. Handlebars syntax
    // errors mid-typing are expected — show them instead of the preview, never crash.
    const [records, setRecords] = useState<any[]>([]);
    const [sampleTk, setSampleTk] = useState<any>(undefined);
    const [sampleTick, setSampleTick] = useState(0);
    const [previewHtml, setPreviewHtml] = useState('');
    const [previewErr, setPreviewErr] = useState('');
    const appendsKey = (t.appends || []).join(',');
    // Load a page of records for the picker; keep the current selection if still present,
    // otherwise fall back to the newest record.
    useEffect(() => {
      let live = true;
      fetchSampleRecords(api, t).then((rows) => {
        if (!live) return;
        setRecords(rows);
        setSampleTk((prev: any) =>
          prev != null && rows.some((r) => r.id === prev) ? prev : rows[0]?.id,
        );
      });
      return () => {
        live = false;
      };
    }, [api, t.collectionName, appendsKey, sampleTick]);
    const sample = records.find((r) => r.id === sampleTk) || records[0] || {};
    useEffect(() => {
      let live = true;
      const timer = setTimeout(async () => {
        try {
          await ensureTemplateLibs(t); // lazy-load alasql when the template uses {{sql}}
          if (!live) return;
          const parts = renderTemplateParts(t, sample);
          // Preview always non-Paged.js (responsive, consistent); page numbers apply on print.
          const previewT = { ...t, pageSetup: { ...(t.pageSetup || {}), pageNumbers: false } };
          setPreviewHtml(buildPrintDocument(previewT, parts, { embedded: true }));
          setPreviewErr('');
        } catch (e: any) {
          if (live) setPreviewErr(e?.message || String(e));
        }
      }, 400);
      return () => {
        live = false;
        clearTimeout(timer);
      };
    }, [t, sample]);

    const save = async () => {
      if (!t.title?.trim()) return message.warning(tt('Nhập tên template'));
      if (!t.collectionName) return message.warning(tt('Chọn collection'));
      setSaving(true);
      try {
        if (t.id) {
          await api.request({
            url: `${TEMPLATES_COLLECTION}:update`,
            method: 'post',
            params: { filterByTk: t.id },
            data: t,
          });
        } else {
          await api.request({ url: `${TEMPLATES_COLLECTION}:create`, method: 'post', data: t });
        }
        message.success(tt('Đã lưu'));
        setDirty(false);
        onSaved();
      } catch (e: any) {
        message.error(e?.response?.data?.errors?.[0]?.message || e?.message || tt('Lưu thất bại'));
      } finally {
        setSaving(false);
      }
    };

    const label = (text: string) => <div style={{ fontSize: 12, color: token.colorTextSecondary, margin: '10px 0 4px' }}>{text}</div>;

    return (
      <Drawer
        title={t.id ? tt('Sửa template #{{id}}', { id: t.id }) : tt('Template mới')}
        open={open}
        onClose={tryClose}
        keyboard={false}
        maskClosable={false}
        width="100%"
        destroyOnClose
        styles={{ body: { padding: 0, overflow: 'hidden' } }}
        extra={
          <Space>
            <Button onClick={() => printPreview(api, t)} disabled={!t.collectionName}>
              {tt('Xem thử (record đầu tiên)')}
            </Button>
            <Button type="primary" loading={saving} onClick={save}>
              {tt('Lưu')}
            </Button>
          </Space>
        }
      >
        <div style={{ display: 'flex', height: '100%' }}>
        <div
          style={{
            flex: bodyMode === 'visual' ? '0 0 64%' : '0 0 54%',
            maxWidth: bodyMode === 'visual' ? 1120 : 780,
            overflowY: 'auto',
            padding: 16,
            transition: 'flex-basis .2s',
          }}
        >
        <Tabs
          defaultActiveKey={t.id ? 'body' : 'general'}
          items={[
            {
              key: 'general',
              label: tt('Chung'),
              children: (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                    gap: '0 24px',
                    alignItems: 'start',
                  }}
                >
                  <div>
                    {label(tt('Tên template'))}
                    <Input value={t.title} onChange={(e) => up({ title: e.target.value })} placeholder={tt('VD: Hoá đơn bán hàng')} />
                  </div>
                  <div>
                    {label(tt('Collection nguồn dữ liệu'))}
                    <Select
                      style={{ width: '100%' }}
                      showSearch
                      optionFilterProp="label"
                      placeholder={tt('Collection nguồn dữ liệu')}
                      options={collections}
                      value={t.collectionName}
                      onChange={(v) => up({ collectionName: v, appends: [] })}
                    />
                  </div>
                  <div>
                    {label(tt('Tên file khi in (Handlebars, tuỳ chọn)'))}
                    <Input
                      value={t.filename}
                      onChange={(e) => up({ filename: e.target.value })}
                      placeholder='VD: HoaDon-{{code}} — thành tên gợi ý khi Save as PDF'
                    />
                  </div>
                  <div>
                    {label(tt('Tải kèm quan hệ (appends)'))}
                    <RelationAppendsPicker
                      api={api}
                      collectionName={t.collectionName}
                      value={t.appends}
                      onChange={(v) => up({ appends: v })}
                      hint={
                        <>
                          {tt('Chọn sâu nhiều cấp được (hover để xổ cấp con, VD')} <code>items</code> → <code>items.product</code>
                          {tt('). Quan hệ đã thêm mới dùng được trong template:')} <code>{'{{#each items}} {{this.product.name}} {{/each}}'}</code>
                        </>
                      }
                    />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                  {label(tt('Điều kiện áp dụng — cho chế độ "Tự động theo dữ liệu" (tuỳ chọn)'))}
                  <ConditionPicker
                    api={api}
                    collectionName={t.collectionName}
                    conditions={
                      (t.conditions && t.conditions.length
                        ? t.conditions
                        : t.whenField && (t.whenValues || []).length
                          ? [{ field: t.whenField, values: t.whenValues as string[] }]
                          : []) as any
                    }
                    onChange={(v) => up({ conditions: v, whenField: undefined, whenValues: undefined })}
                  />
                  <div style={{ fontSize: 12, color: token.colorTextSecondary, marginTop: 4 }}>
                    {tt('Khi nút In / block đặt chế độ')} <b>{tt('Tự động')}</b>
                    {tt(': chọn template đầu tiên khớp bản ghi. Nhiều điều kiện = phải khớp')} <b>{tt('tất cả')}</b>{' '}
                    {tt('(VÀ); mỗi điều kiện khớp nếu giá trị bản ghi nằm trong danh sách. Cột có thể chọn nhiều cấp (VD')}{' '}
                    <code>khach_hang.loai</code>
                    {tt('). Template để trống điều kiện = mặc định (dùng khi không điều kiện nào khớp).')}
                  </div>
                  <div style={{ marginTop: 14, borderTop: `1px dashed ${token.colorBorderSecondary}`, paddingTop: 10 }}>
                    <Checkbox
                      checked={!!t.isPartial}
                      onChange={(e) => up({ isPartial: e.target.checked })}
                    >
                      {tt('Dùng làm')} <b>{tt('khối chung')}</b> {tt('(partial) — ẩn khỏi danh sách in, nhúng vào template khác')}
                    </Checkbox>
                    {t.isPartial && (
                      <>
                        {label(tt('Mã khối (slug) — dùng trong template khác'))}
                        <Input
                          value={t.slug}
                          onChange={(e) => up({ slug: e.target.value.replace(/[^a-zA-Z0-9_]/g, '') })}
                          placeholder="VD: header_chung"
                          addonBefore="{{>"
                          addonAfter="}}"
                        />
                        <div style={{ fontSize: 12, color: token.colorTextSecondary, marginTop: 6, lineHeight: 1.6 }}>
                          {tt('Khối chung là')} <b>{tt('đoạn HTML tái sử dụng')}</b>{tt('. Sau khi đặt')} <b>slug</b> {tt('(VD')}{' '}
                          <code>header_chung</code>
                          {tt('), ở template khác bạn chèn nó vào phần Header / Nội dung / Footer bằng cú pháp')}{' '}
                          <code style={{ background: token.colorFillTertiary, padding: '1px 5px', borderRadius: 3 }}>
                            {'{{> header_chung}}'}
                          </code>
                          {tt('. Khi in, chỗ đó được thay bằng nội dung khối này (dùng chung dữ liệu bản ghi — mọi')}{' '}
                          <code>{'{{field}}'}</code> {tt('bên trong vẫn chạy). Sửa 1 nơi → mọi template đang nhúng đều cập nhật. Bản thân khối chung không xuất hiện trong danh sách chọn khi in.')}
                        </div>
                      </>
                    )}
                  </div>
                  </div>
                </div>
              ),
            },
            {
              key: 'body',
              label: tt('Nội dung'),
              children: (
                <div>
                  <SegmentedGroup
                    style={{ marginBottom: 8 }}
                    value={bodyMode}
                    onChange={(v: any) => setBodyMode(v)}
                    options={[
                      {
                        value: 'visual',
                        label: (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 4px' }}>
                            <RegistryIcon type="lucide-layout-grid" fallback="AppstoreOutlined" style={{ fontSize: 14 }} />
                            {tt('Kéo-thả')}
                          </span>
                        ),
                      },
                      {
                        value: 'html',
                        label: (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 4px' }}>
                            <RegistryIcon type="lucide-code" fallback="CodeOutlined" style={{ fontSize: 14 }} />
                            {tt('Mã HTML')}
                          </span>
                        ),
                      },
                    ]}
                  />
                  {bodyMode === 'html' ? (
                    (() => {
                      // HTML and the drag-drop-generated CSS live in one stored string,
                      // but edit as two separate blocks (user feedback).
                      const parts = splitStyleFromBody(t.bodyHtml || '');
                      return (
                        <>
                          <HtmlEditorArea
                            api={api}
                            collectionName={t.collectionName}
                            includeToMany
                            rows={14}
                            value={parts.html}
                            onChange={(v) => up({ bodyHtml: composeBody(v, parts.css) })}
                            placeholder="<h1>HOÁ ĐƠN {{code}}</h1> ..."
                            hint={bodyHint()}
                          />
                          <div style={{ fontSize: 12, color: token.colorTextSecondary, margin: '12px 0 4px' }}>
                            {tt('CSS của nội dung (kéo-thả sinh ra đây — tự đi kèm khi in)')}
                          </div>
                          <Input.TextArea
                            rows={5}
                            value={parts.css}
                            onChange={(e) => up({ bodyHtml: composeBody(parts.html, e.target.value) })}
                            placeholder={'.ten-class {\n  color: #333;\n}'}
                          />
                        </>
                      );
                    })()
                  ) : (
                    <GrapesBodyEditor
                      api={api}
                      collectionName={t.collectionName}
                      value={t.bodyHtml}
                      onChange={(v) => up({ bodyHtml: v })}
                    />
                  )}
                </div>
              ),
            },
            {
              key: 'css',
              label: 'CSS',
              children: (
                <Input.TextArea
                  rows={16}
                  value={t.css}
                  onChange={(e) => up({ css: e.target.value })}
                  placeholder={'/* CSS chung của template (áp cho cả header/footer) */\ntable.items td { border: 1px solid #ddd; padding: 4px 8px; }\n.total { font-weight: 700; }'}
                />
              ),
            },
            {
              key: 'header',
              label: 'Header',
              children: (
                <HtmlOrVisual
                  api={api}
                  collectionName={t.collectionName}
                  value={t.headerHtml}
                  onChange={(v) => up({ headerHtml: v })}
                  placeholder={tt('Lặp lại ở ĐẦU mỗi trang in — logo, tên công ty...')}
                  hint={
                    <span>
                      {tt('Ảnh dùng thẻ img bình thường: logo tĩnh')}{' '}
                      <code>{'<img src="/storage/uploads/logo.png" style="height:56px">'}</code>{tt('; ảnh từ field attachment của record:')}{' '}
                      <code>{'{{#each anh_dai_dien}}<img src="{{this.url}}" style="height:56px">{{/each}}'}</code>
                    </span>
                  }
                />
              ),
            },
            {
              key: 'footer',
              label: 'Footer',
              children: (
                <HtmlOrVisual
                  api={api}
                  collectionName={t.collectionName}
                  value={t.footerHtml}
                  onChange={(v) => up({ footerHtml: v })}
                  placeholder={tt('Lặp lại ở CUỐI mỗi trang in — địa chỉ, hotline...')}
                  hint={
                    <span>
                      {tt('HTML + ảnh đều được, VD chữ ký/con dấu:')}{' '}
                      <code>{'<img src="/storage/uploads/seal.png" style="height:64px">'}</code>
                    </span>
                  }
                />
              ),
            },
            {
              key: 'watermark',
              label: 'Watermark',
              children: (
                <div style={{ maxWidth: 900 }}>
                  <Checkbox checked={!!wm.enabled} onChange={(e) => up({ watermark: { ...wm, enabled: e.target.checked } })}>
                    {tt('Bật watermark')}
                  </Checkbox>
                  {label(tt('Chữ watermark'))}
                  <Input value={wm.text} onChange={(e) => up({ watermark: { ...wm, text: e.target.value } })} placeholder={tt('VD: BẢN NHÁP / ĐÃ THANH TOÁN')} />
                  {label(tt('Hoặc ảnh (ưu tiên hơn chữ)'))}
                  <Space.Compact style={{ width: '100%' }}>
                    <Input
                      value={(wm as any).imageUrl}
                      onChange={(e) => up({ watermark: { ...wm, imageUrl: e.target.value } })}
                      placeholder={tt('Dán URL hoặc bấm Tải ảnh →')}
                    />
                    <AssetUploadButton api={api} onUploaded={(url) => up({ watermark: { ...wm, imageUrl: url } })} label={tt('Tải ảnh')} size="middle" />
                  </Space.Compact>
                  <div style={{ display: 'flex', gap: 16, marginTop: 6 }}>
                    <Checkbox checked={!!(wm as any).tile} onChange={(e) => up({ watermark: { ...wm, tile: e.target.checked } })}>
                      {tt('Lặp kín trang (tile)')}
                    </Checkbox>
                    <Checkbox checked={!!(wm as any).behind} onChange={(e) => up({ watermark: { ...wm, behind: e.target.checked } })}>
                      {tt('Nằm dưới nội dung')}
                    </Checkbox>
                  </div>
                  {!(wm as any).tile && (
                    <>
                      {label(tt('Vị trí trên trang'))}
                      <Select
                        style={{ width: '100%' }}
                        value={(wm as any).position || 'center'}
                        onChange={(v) => up({ watermark: { ...wm, position: v } })}
                        options={[
                          { value: 'center', label: tt('Giữa trang') },
                          { value: 'top-left', label: tt('Góc trên trái') },
                          { value: 'top', label: tt('Cạnh trên') },
                          { value: 'top-right', label: tt('Góc trên phải') },
                          { value: 'left', label: tt('Cạnh trái') },
                          { value: 'right', label: tt('Cạnh phải') },
                          { value: 'bottom-left', label: tt('Góc dưới trái') },
                          { value: 'bottom', label: tt('Cạnh dưới') },
                          { value: 'bottom-right', label: tt('Góc dưới phải') },
                        ]}
                      />
                      <div style={{ display: 'flex', gap: 12 }}>
                        <div style={{ flex: 1 }}>
                          {label(tt('Dịch ngang X (px)'))}
                          <InputNumber
                            style={{ width: '100%' }}
                            value={(wm as any).offsetX ?? 0}
                            onChange={(v) => up({ watermark: { ...wm, offsetX: v ?? 0 } })}
                          />
                        </div>
                        <div style={{ flex: 1 }}>
                          {label(tt('Dịch dọc Y (px)'))}
                          <InputNumber
                            style={{ width: '100%' }}
                            value={(wm as any).offsetY ?? 0}
                            onChange={(v) => up({ watermark: { ...wm, offsetY: v ?? 0 } })}
                          />
                        </div>
                      </div>
                    </>
                  )}
                  {label(tt('Độ mờ: {{value}}', { value: wm.opacity }))}
                  <Slider min={0.02} max={0.6} step={0.01} value={wm.opacity} onChange={(v) => up({ watermark: { ...wm, opacity: v } })} />
                  <div style={{ display: 'flex', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      {label(tt('Góc xoay (°)'))}
                      <InputNumber style={{ width: '100%' }} min={-90} max={90} value={wm.angle} onChange={(v) => up({ watermark: { ...wm, angle: v ?? -30 } })} />
                    </div>
                    <div style={{ flex: 1 }}>
                      {label((wm as any).imageUrl ? tt('Rộng ảnh (%)') : tt('Cỡ chữ (px)'))}
                      {(wm as any).imageUrl ? (
                        <InputNumber
                          style={{ width: '100%' }}
                          min={5}
                          max={100}
                          value={(wm as any).imageWidth ?? 60}
                          onChange={(v) => up({ watermark: { ...wm, imageWidth: v ?? 60 } })}
                        />
                      ) : (
                        <InputNumber style={{ width: '100%' }} min={8} max={200} value={wm.fontSize} onChange={(v) => up({ watermark: { ...wm, fontSize: v ?? 84 } })} />
                      )}
                    </div>
                    <div style={{ flex: 1 }}>
                      {label(tt('Màu'))}
                      <ColorField
                        value={wm.color}
                        size="middle"
                        onChange={(v: string) => up({ watermark: { ...wm, color: v || '#000000' } })}
                      />
                    </div>
                  </div>
                  {(wm as any).tile && (
                    <>
                      {label(tt('Khoảng cách lặp (px)'))}
                      <InputNumber
                        style={{ width: '100%' }}
                        min={0}
                        max={300}
                        value={(wm as any).tileGap ?? 40}
                        onChange={(v) => up({ watermark: { ...wm, tileGap: v ?? 40 } })}
                      />
                    </>
                  )}
                </div>
              ),
            },
            {
              key: 'page',
              label: tt('Trang in'),
              children: (
                <div style={{ maxWidth: 900 }}>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      {label(tt('Khổ giấy'))}
                      <Select
                        style={{ width: '100%' }}
                        value={ps.size}
                        onChange={(v) => up({ pageSetup: { ...ps, size: v } })}
                        options={['A4', 'A5', 'A3', 'letter'].map((s) => ({ value: s, label: s }))}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      {label(tt('Hướng'))}
                      <Select
                        style={{ width: '100%' }}
                        value={ps.orientation}
                        onChange={(v) => up({ pageSetup: { ...ps, orientation: v } })}
                        options={[
                          { value: 'portrait', label: tt('Dọc') },
                          { value: 'landscape', label: tt('Ngang') },
                        ]}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      {label(tt('Lề (@page margin)'))}
                      <Input value={ps.margin} onChange={(e) => up({ pageSetup: { ...ps, margin: e.target.value } })} placeholder="12mm" />
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: token.colorTextSecondary, marginTop: 12 }}>
                    {tt('Header/footer lặp lại ở mỗi trang khi in; dòng ngày giờ/URL trình duyệt tự thêm đã được chặn.')}
                  </div>
                </div>
              ),
            },
          ]}
        />
        </div>
        <div
          style={{
            flex: 1,
            borderLeft: `1px solid ${token.colorBorderSecondary}`,
            display: 'flex',
            flexDirection: 'column',
            background: token.colorBgLayout,
            minWidth: 0,
          }}
        >
          <div style={{ padding: '8px 12px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12.5, color: token.colorTextSecondary, whiteSpace: 'nowrap' }}>{tt('Xem thử với:')}</span>
            <Select
              size="small"
              style={{ flex: 1, minWidth: 160 }}
              showSearch
              optionFilterProp="label"
              placeholder={tt('Chọn bản ghi')}
              value={sampleTk}
              onChange={(v) => setSampleTk(v)}
              notFoundContent={tt('Chưa có bản ghi')}
              options={records.map((r) => ({ value: r.id, label: recordLabel(r) }))}
            />
            <Tooltip title={tt('Tải lại danh sách bản ghi')}>
              <Button size="small" onClick={() => setSampleTick((x) => x + 1)}>
                <RegistryIcon type="lucide-refresh-cw" fallback="ReloadOutlined" style={{ fontSize: 13 }} />
              </Button>
            </Tooltip>
            <Button
              size="small"
              type="primary"
              disabled={!t.collectionName}
              onClick={() => printData(api, t, sample)}
              icon={<RegistryIcon type="lucide-printer" fallback="PrinterOutlined" style={{ fontSize: 13 }} />}
            >
              {tt('In thử')}
            </Button>
          </div>
          {previewErr ? (
            <div
              style={{
                margin: 12,
                padding: 12,
                background: '#fff2f0',
                border: '1px solid #ffccc7',
                borderRadius: 6,
                fontSize: 12.5,
                color: '#a8071a',
                whiteSpace: 'pre-wrap',
              }}
            >
              {tt('Lỗi template (đang gõ dở là bình thường):')} {previewErr}
            </div>
          ) : (
            <iframe title="print-preview" srcDoc={previewHtml} style={{ flex: 1, width: '100%', border: 'none' }} />
          )}
        </div>
        </div>
      </Drawer>
    );
  };

  return function TemplateManager() {
    const { token } = theme.useToken();
    const api = useApiClient();
    const [rows, setRows] = useState<PrintTemplate[]>([]);
    const [loading, setLoading] = useState(false);
    const [collections, setCollections] = useState<any[]>([]);
    const [editing, setEditing] = useState<PrintTemplate | null>(null);

    const reload = useCallback(() => {
      setLoading(true);
      api
        ?.request({ url: `${TEMPLATES_COLLECTION}:list`, params: { paginate: false, sort: ['id'] } })
        .then((res: any) => setRows(res?.data?.data || []))
        .catch((e: any) => message.error(e?.message || tt('Load thất bại')))
        .finally(() => setLoading(false));
    }, [api]);

    useEffect(() => {
      reload();
      api
        ?.request({ url: 'collections:list', params: { paginate: false, sort: ['name'] } })
        .then((res: any) => {
          const list = (res?.data?.data || [])
            .filter((c: any) => !c.hidden)
            .map((c: any) => ({ value: c.name, label: cleanTitle(c.title, c.name) + ` (${c.name})` }));
          setCollections(list);
        })
        .catch(() => setCollections([]));
    }, []);

    const remove = async (id: any) => {
      try {
        await api.request({ url: `${TEMPLATES_COLLECTION}:destroy`, method: 'post', params: { filterByTk: id } });
        message.success(tt('Đã xoá'));
        reload();
      } catch (e: any) {
        message.error(e?.message || tt('Xoá thất bại'));
      }
    };

    const collectionLabel = useMemo(() => {
      const m = new Map(collections.map((c: any) => [c.value, c.label]));
      return (name?: string) => m.get(name) || name || '';
    }, [collections]);

    return (
      <div style={{ padding: 20, maxWidth: 1200, margin: '8px auto 16px', background: token.colorBgContainer, border: `0.8px solid ${token.colorBorderSecondary}`, borderRadius: 8 }}>
        <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ color: token.colorTextSecondary }}>
            {tt('Template in ấn (Handlebars). Gắn nút in vào block qua action')} <b>{tt('Mẫu in')}</b> {tt('trong "Configure actions".')}
          </div>
          <Button type="primary" onClick={() => setEditing({ ...EMPTY })}>
            + {tt('Template mới')}
          </Button>
        </div>
        <Table
          rowKey="id"
          size="small"
          loading={loading}
          dataSource={rows}
          pagination={false}
          columns={[
            { title: 'ID', dataIndex: 'id', width: 56 },
            {
              title: tt('Tên'),
              dataIndex: 'title',
              render: (v: any, r: any) => (
                <a onClick={() => setEditing({ ...EMPTY, ...r })}>{v || `#${r.id}`}</a>
              ),
            },
            { title: 'Collection', dataIndex: 'collectionName', render: (v: any) => collectionLabel(v) },
            {
              title: tt('Loại'),
              dataIndex: 'isPartial',
              width: 110,
              render: (v: any, r: any) =>
                v ? <Tag color="purple">{tt('Khối chung')} {r.slug ? `(${r.slug})` : ''}</Tag> : <Tag>Template</Tag>,
            },
            {
              title: tt('Trạng thái'),
              dataIndex: 'enabled',
              width: 100,
              render: (v: any) => (v === false ? <Tag>{tt('Tắt')}</Tag> : <Tag color="green">{tt('Bật')}</Tag>),
            },
            {
              title: '',
              width: 210,
              render: (_: any, r: any) => (
                <Space size="small">
                  <Button size="small" onClick={() => setEditing({ ...EMPTY, ...r })}>
                    {tt('Sửa')}
                  </Button>
                  <Tooltip title={tt('Render với record đầu tiên của collection')}>
                    <Button size="small" onClick={() => printPreview(api, r)}>
                      {tt('Xem thử')}
                    </Button>
                  </Tooltip>
                  <Button
                    size="small"
                    onClick={() => {
                      const { id, ...rest } = r;
                      setEditing({ ...EMPTY, ...rest, title: `${r.title || ''} ${tt('(bản sao)')}` });
                    }}
                  >
                    {tt('Nhân bản')}
                  </Button>
                  <Popconfirm title={tt('Xoá template này?')} onConfirm={() => remove(r.id)}>
                    <Button size="small" danger>
                      {tt('Xoá')}
                    </Button>
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
        {editing && (
          <EditorDrawer
            api={api}
            open={!!editing}
            initial={editing}
            collections={collections}
            onClose={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              reload();
            }}
          />
        )}
      </div>
    );
  };
}
