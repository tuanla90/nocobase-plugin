import React, { useEffect, useRef, useState } from 'react';
import { Button, Checkbox, Input, InputNumber, Select, Tag, Tooltip, message, theme } from 'antd';
import { observer, useForm } from '@formily/react';
import { FormTab } from '@formily/antd-v5';
import { useFlowSettingsContext } from '@nocobase/flow-engine';
import { SparklesIcon, collectValues, syncAutorunRule, gateConfig, registerFlowComponentsOnce } from './aiColumn';
import { extractTypeTagLabel, type MapRow } from './aiExtract';
import { getFields, fieldJsonMeta, SegmentedGroup, ColumnSelect } from '@tuanla90/shared';
import { NS, t } from './i18n';

/**
 * @tuanla90/plugin-ai-column — "AI Multi-row Extract" (blocks A+C): read ONE source (an uploaded
 * document in an attachment field, OR a pasted-text field via a {{token}} prompt) and split it into
 * N ROWS written into a to-many (sub-table) relation of the SAME record — e.g. a quote PDF → many
 * order-line rows {product, qty, note}. Unlike AI Extract (which fills sibling scalar fields of ONE
 * record), this appends child records into a hasMany/belongsToMany field; the form persists them on
 * Save via NocoBase's native nested-create (updateAssociationValues) — no server write needed for
 * the manual/client path. Server-side auto-run (`kind:'extractRows'`) creates the children directly.
 *
 * The ✨ button is bound (non-default) onto the SOURCE field: attachment / attachmentURL (document
 * vision) or textarea (pasted text). The user configures which relation to fill + the child-field
 * mapping in the field settings dialog.
 */

export type AiExtractRowsVariant = {
  Base: any; // UploadFieldModel | AttachmentURLFieldModel | TextareaFieldModel (per-lane import)
  modelName: string;
  interfaces: string[];
  label: string;
  /** true for attachment/attachmentURL sources (own value = the file to read); false for text. */
  isFileSource: boolean;
};

type Deps = {
  flowEngine: any;
  variants: AiExtractRowsVariant[];
  EditableItemModel: any;
  api?: any;
  tExpr?: (s: string, opts?: any) => any;
};

let API: any = null;

/** The to-many relation this row-extract fills, plus the child collection it points at (so the child
 *  mapping picker knows which fields to offer). Stored as an object on the field model props. */
export type RelationTarget = { name?: string; target?: string; label?: string };

function cleanRelLabel(f: any): string {
  const title = f?.uiSchema?.title || f?.title;
  if (title == null) return f?.name;
  const l = String(title);
  const m = l.match(/\{\{\s*t\(\s*['"]([^'"]+)['"]/);
  if (m) return m[1];
  if (/\{\{/.test(l)) return f?.name;
  return l;
}

/** Resolve the current (parent) collection + datasource from the field-settings model context. */
function useParentCollection(): { coll?: string; dsk: string } {
  let coll: string | undefined;
  let dsk = 'main';
  try {
    const ctx: any = useFlowSettingsContext();
    const model: any = ctx?.model;
    const cf = model?.context?.collectionField;
    const blockColl = model?.context?.blockModel?.collection;
    coll = cf?.collectionName || blockColl?.name;
    dsk = cf?.dataSourceKey || blockColl?.dataSourceKey || 'main';
  } catch {
    /* no settings context */
  }
  return { coll, dsk };
}

/** Settings component: pick which to-many (hasMany / belongsToMany) relation of the current
 *  collection receives the extracted rows. Storing {name,target} lets the child mapping resolve the
 *  child collection's fields without a second lookup. */
export const PtdlRelationTargetSelect: React.FC<any> = observer((props: any) => {
  const { coll, dsk } = useParentCollection();
  const [opts, setOpts] = useState<any[]>([]);
  const [byName, setByName] = useState<Record<string, any>>({});
  const value: RelationTarget = props.value || {};

  useEffect(() => {
    let alive = true;
    if (coll) {
      getFields(API, coll, dsk).then((fields) => {
        if (!alive) return;
        const rel = (fields || []).filter((f: any) => ['hasMany', 'belongsToMany'].includes(f?.type) && f?.target);
        const map: Record<string, any> = {};
        rel.forEach((f: any) => (map[f.name] = f));
        setByName(map);
        setOpts(rel.map((f: any) => ({ value: f.name, label: `${cleanRelLabel(f)} (${f.name}) →` })));
      });
    } else {
      setOpts([]);
      setByName({});
    }
    return () => {
      alive = false;
    };
  }, [coll, dsk]);

  return (
    <Select
      style={{ width: '100%' }}
      showSearch
      optionFilterProp="label"
      placeholder={t('Chọn bảng con (quan hệ 1-nhiều) để đổ dòng vào')}
      options={opts}
      value={value.name || undefined}
      onChange={(name) => {
        const f = byName[name];
        props.onChange?.({ name, target: f?.target, label: f ? cleanRelLabel(f) : name });
      }}
      notFoundContent={coll ? t('(bảng này chưa có quan hệ 1-nhiều)') : t('(đang tải…)')}
    />
  );
});

/** The extra controls for a RELATION mapping row: match source (a stored raw column OR a transient
 *  "extract-only" description), the confidence threshold, create-if-missing, and an inline hint of
 *  whether the target master is embedded (else keyword fallback). Kept as its own component so it can
 *  fetch the target master's fields + embed status independently per row. */
/** Small hover-able index-status dot for a relation's target master — green = embedded (vector),
 *  amber = not embedded (keyword fallback). Tooltip shows the detail. Sits next to the 🔗 badge. */
const IndexStatusDot: React.FC<{ target?: string; embedInfo?: any }> = ({ target, embedInfo }) => {
  const ok = !!embedInfo?.count;
  const title = ok
    ? t('✓ Bảng {{tb}} đã có chỉ mục vector ({{n}} dòng, nội dung: {{txt}})', { tb: target, n: embedInfo.count, txt: embedInfo.textTemplate || '?' })
    : t('⚠ Bảng {{tb}} chưa embed → khớp từ khoá (kém chính xác). Vào Settings → Nhà cung cấp AI để embed.', { tb: target });
  return (
    <Tooltip title={title}>
      <span style={{ cursor: 'help', color: ok ? '#16a34a' : '#d97706', fontSize: 12, flex: '0 0 auto' }}>{ok ? '● index' : '● keyword'}</span>
    </Tooltip>
  );
};

/** The RELATION mapping row's stacked controls (rendered full-width UNDER the field header):
 *  line 2 = match source (a stored column OR a transient extract-only description),
 *  line 3 = rules (confidence threshold + create-if-missing). */
const RelationRow: React.FC<{ row: MapRow; scalarMapped: any[]; childScalarOpts: any[]; onPatch: (p: Partial<MapRow>) => void }> = observer(({ row, scalarMapped, childScalarOpts, onPatch }) => {
  const { token } = theme.useToken();
  const sourceMode = row.matchDesc != null ? 'transient' : 'column';
  const labelW = { color: token.colorTextTertiary, flex: '0 0 auto', width: 92 } as React.CSSProperties;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8, paddingLeft: 4 }}>
      {/* Line 2: match source */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={labelW}>{t('đối chiếu từ')}</span>
        <SegmentedGroup
          value={sourceMode}
          options={[
            { label: t('cột đã trích'), value: 'column' },
            { label: t('tự trích (không lưu)'), value: 'transient' },
          ]}
          onChange={(v) => (v === 'transient' ? onPatch({ matchDesc: row.matchDesc || '', queryField: undefined }) : onPatch({ matchDesc: undefined, saveRawTo: undefined }))}
        />
        {sourceMode === 'column' ? (
          <Select style={{ flex: 1 }} options={scalarMapped} value={row.queryField || undefined} placeholder={t('chọn cột raw ở trên')} onChange={(v) => onPatch({ queryField: v })} notFoundContent={t('(thêm cột text ở trên trước)')} />
        ) : (
          <Input style={{ flex: 1 }} value={row.matchDesc} placeholder={t('Mô tả cho AI trích tạm để đối chiếu — vd: tên hàng')} onChange={(e) => onPatch({ matchDesc: e.target.value })} />
        )}
      </div>
      {/* Line 3: rules — threshold + (transient & gated only) save-raw-on-no-match */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Tooltip title={t('Điểm khớp tối thiểu (0–100) để nhận FK. 0 = luôn nhận đáp án tốt nhất. Tăng lên → chỉ nhận khi đủ tin cậy; dưới ngưỡng thì FK để trống (cần đối chiếu tay).')}>
          <span style={{ ...labelW, cursor: 'help', borderBottom: `1px dotted ${token.colorBorder}` }}>{t('Ngưỡng')} ⓘ</span>
        </Tooltip>
        <InputNumber min={0} max={100} style={{ width: 96 }} value={row.minScore ?? 0} onChange={(n) => onPatch({ minScore: Number(n) || 0 })} addonAfter="%" />
        <span style={{ color: token.colorTextTertiary, fontSize: 12, flex: '0 0 auto' }}>{(row.minScore ?? 0) > 0 ? t('dưới ngưỡng → không nhận') : t('0 = luôn nhận đáp án tốt nhất')}</span>
        <Tooltip title={t('Bật: AI đọc & chấm lại (chính xác hơn với catalog dễ nhầm, nhưng chậm hơn +1 call LLM/dòng). Tắt: chỉ dùng vector (nhanh, gộp batch được).')}>
          <Checkbox checked={!!row.rerank} onChange={(e) => onPatch({ rerank: e.target.checked })}>
            {t('AI chấm kỹ (rerank)')}
          </Checkbox>
        </Tooltip>
        {sourceMode === 'transient' && (row.minScore ?? 0) > 0 ? (
          <>
            <span style={{ color: token.colorTextTertiary, flex: '0 0 auto' }}>{t('không khớp → lưu thô vào')}</span>
            <ColumnSelect style={{ width: 170 }} options={childScalarOpts} value={row.saveRawTo || undefined} placeholder={t('(không lưu)')} onChange={(v) => onPatch({ saveRawTo: v })} />
          </>
        ) : null}
      </div>
    </div>
  );
});

/** Settings component: map the child collection's fields (the target collection of the chosen
 *  relation) → what to tell the model to extract per row. Same auto-typing as AI Extract's mapping,
 *  but the collection is the CHILD one (read from the sibling `aiTargetRelation.target` value). */
export const PtdlChildFieldMapping: React.FC<any> = observer((props: any) => {
  const { token } = theme.useToken();
  const rows: MapRow[] = Array.isArray(props.value) ? props.value : [];
  const form = useForm();
  const rel: RelationTarget = form?.values?.aiTargetRelation || {};
  const childColl = rel.target;
  const { dsk } = useParentCollection();
  const [options, setOptions] = useState<any[]>([]);
  const [fieldsByName, setFieldsByName] = useState<Record<string, any>>({});
  const [statusByColl, setStatusByColl] = useState<Record<string, any>>({});

  // Embed-index status per master (so relation rows can show vector-vs-keyword transparency).
  useEffect(() => {
    let alive = true;
    if (API)
      API.request({ url: 'ptdlAiColumn:classifyStatus', method: 'post', data: {} })
        .then((res: any) => {
          if (!alive) return;
          const map: Record<string, any> = {};
          (res?.data?.data || []).forEach((s: any) => (map[s.masterCollection] = s));
          setStatusByColl(map);
        })
        .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    if (childColl) {
      getFields(API, childColl, dsk).then((fields) => {
        if (!alive) return;
        const byName: Record<string, any> = {};
        fields.forEach((f: any) => f?.name && (byName[f.name] = f));
        setFieldsByName(byName);
        // Field picker offers scalar fields (AI-extracted) AND belongsTo/hasOne relations (🔗,
        // resolved by classify) — excluding raw FK columns (baoGiaId/sanPhamId).
        setOptions(
          (fields || [])
            .filter((f: any) => !f.isForeignKey && (CHILD_SCALAR_TYPES.has(f?.type) || f?.type === 'belongsTo' || f?.type === 'hasOne'))
            .map((f: any) => ({ value: f.name, label: (f.uiSchema?.title || f.name) + (f.type === 'belongsTo' || f.type === 'hasOne' ? ' 🔗' : ''), type: f.type, iface: f.interface })),
        );
      });
    } else {
      setOptions([]);
      setFieldsByName({});
    }
    return () => {
      alive = false;
    };
  }, [childColl, dsk]);

  const update = (i: number, patch: Partial<MapRow>) => {
    const next = rows.slice();
    next[i] = { ...next[i], ...patch };
    props.onChange?.(next);
  };
  const pickField = (i: number, v: string) => {
    const f = fieldsByName[v] || {};
    if (f.type === 'belongsTo' || f.type === 'hasOne') {
      // Relation column: resolved by classify. Store its target collection; clear scalar meta.
      update(i, { field: v, kind: 'relation', target: f.target || f.options?.target, type: undefined, enumValues: undefined, markdown: undefined, description: undefined });
    } else {
      const meta = fieldJsonMeta(f);
      update(i, { field: v, kind: 'scalar', target: undefined, queryField: undefined, type: meta.type, enumValues: meta.enumValues, markdown: meta.markdown });
    }
  };
  const addRow = () => props.onChange?.([...rows, { field: '', description: '' }]);
  const removeRow = (i: number) => props.onChange?.(rows.filter((_: any, idx: number) => idx !== i));

  // Scalar fields already mapped = candidate "raw source" columns for a relation row's classify.
  const scalarMapped = rows.filter((r) => r.field && r.kind !== 'relation').map((r) => ({ value: r.field as string, label: (fieldsByName[r.field as string]?.uiSchema?.title || r.field) as string }));
  // All scalar child columns = candidate targets to save the raw text into on a no-match.
  const childScalarOpts = Object.values(fieldsByName)
    .filter((f: any) => !f.isForeignKey && CHILD_SCALAR_TYPES.has(f?.type))
    .map((f: any) => ({ value: f.name, label: f.uiSchema?.title || f.name, type: f.type, iface: f.interface }));

  if (!childColl) {
    return <div style={{ fontSize: 12, color: token.colorTextTertiary }}>{t('Chọn bảng con ở trên trước để hiện danh sách field.')}</div>;
  }
  return (
    <div>
      {rows.map((r, i) => {
        const isRel = r.kind === 'relation';
        return (
          <div key={i} style={{ border: `1px solid ${token.colorBorderSecondary}`, borderRadius: 6, padding: 8, marginBottom: 8 }}>
            {/* Line 1: field + type/🔗target(+index dot) + remove */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <ColumnSelect
                style={{ width: 190, flex: '0 0 auto' }}
                options={options}
                value={r.field || undefined}
                placeholder={t('Field trong bảng con')}
                onChange={(v) => pickField(i, v)}
              />
              {r.field ? (
                isRel ? (
                  <>
                    <Tag color="purple" style={{ flex: '0 0 auto', margin: 0 }} title={t('Cột quan hệ — sẽ đối chiếu để lấy FK')}>
                      🔗 {r.target || '?'}
                    </Tag>
                    <IndexStatusDot target={r.target} embedInfo={statusByColl[r.target as string]} />
                  </>
                ) : (
                  <Tag style={{ flex: '0 0 auto', margin: 0 }} title={t('Kiểu dữ liệu tự nhận diện từ field đích')}>
                    {extractTypeTagLabel(r)}
                  </Tag>
                )
              ) : null}
              <div style={{ flex: 1 }} />
              <Button danger onClick={() => removeRow(i)} style={{ flex: '0 0 auto' }}>
                ✕
              </Button>
            </div>
            {/* Scalar → AI description; Relation → source + rules (stacked, full width) */}
            {!isRel && r.field ? (
              <Input
                style={{ marginTop: 8 }}
                placeholder={t('Mô tả cho AI — vd: tên sản phẩm, số lượng, đơn giá')}
                value={r.description}
                onChange={(e) => update(i, { description: e.target.value })}
              />
            ) : null}
            {isRel && r.field ? <RelationRow row={r} scalarMapped={scalarMapped} childScalarOpts={childScalarOpts} onPatch={(p) => update(i, p)} /> : null}
          </div>
        );
      })}
      <Button onClick={addRow}>{t('+ Thêm field')}</Button>
      {!rows.length ? (
        <div style={{ fontSize: 12, color: token.colorTextTertiary, marginTop: 4 }}>
          {t('Chưa có field nào — thêm cột text (AI trích) hoặc cột quan hệ 🔗 (AI đối chiếu ra FK).')}
        </div>
      ) : null}
    </div>
  );
});

const CHILD_TARGET_TYPES = new Set(['string', 'text', 'integer', 'bigInt', 'float', 'double', 'decimal', 'boolean', 'date', 'belongsTo', 'hasOne']);
const CHILD_SCALAR_TYPES = new Set(['string', 'text', 'integer', 'bigInt', 'float', 'double', 'decimal', 'boolean', 'date']);

/** Single-select of a CHILD collection field. `role='query'` → only the fields ALREADY mapped for
 *  extraction (the match query must be an extracted value — no re-listing every field). `role='target'`
 *  → fields that can RECEIVE a match: belongsTo relations (🔗, writes an FK link) + scalar fields.
 *  Both EXCLUDE raw foreign-key columns (e.g. baoGiaId/sanPhamId) — those are never a sensible pick. */
export const PtdlChildFieldSelect: React.FC<any> = observer((props: any) => {
  const form = useForm();
  const rel: RelationTarget = form?.values?.aiTargetRelation || {};
  const childColl = rel.target;
  const { dsk } = useParentCollection();
  const role: string = props.role || 'target';
  const [fields, setFields] = useState<any[]>([]);
  useEffect(() => {
    let alive = true;
    if (childColl) getFields(API, childColl, dsk).then((f) => alive && setFields(f || []));
    else setFields([]);
    return () => {
      alive = false;
    };
  }, [childColl, dsk]);

  // For the TARGET select, flag whether the picked field is a relation → the sibling "value to write"
  // (only meaningful for a code/text target) hides itself via a reaction on this flag.
  useEffect(() => {
    if (role !== 'target') return;
    const f: any = fields.find((x: any) => x.name === props.value);
    const isRel = !!f && (f.type === 'belongsTo' || f.type === 'hasOne');
    try {
      form?.setValuesIn?.('aiClfTargetIsRel', isRel);
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.value, fields, role]);

  const mappedNames: string[] = (Array.isArray(form?.values?.aiChildMapping) ? form.values.aiChildMapping : []).map((m: any) => m?.field).filter(Boolean);
  const byName: Record<string, any> = {};
  fields.forEach((f) => f?.name && (byName[f.name] = f));
  const options =
    role === 'query'
      ? mappedNames.map((n) => ({ value: n, label: byName[n]?.uiSchema?.title || n, type: byName[n]?.type, iface: byName[n]?.interface }))
      : fields
          .filter((f: any) => !f.isForeignKey && CHILD_TARGET_TYPES.has(f?.type))
          .map((f: any) => ({ value: f.name, label: (f.uiSchema?.title || f.name) + (f.type === 'belongsTo' || f.type === 'hasOne' ? ' 🔗' : ''), type: f.type, iface: f.interface }));

  return (
    <ColumnSelect
      placeholder={
        childColl
          ? role === 'query'
            ? mappedNames.length
              ? t('Chọn 1 field đã trích ở trên')
              : t('Thêm field ở "Các field của mỗi dòng" trước')
            : props.placeholder || t('Chọn field/quan hệ 🔗 nhận kết quả')
          : t('Chọn bảng con trước')
      }
      options={options}
      value={props.value || undefined}
      onChange={(v) => props.onChange?.(v)}
    />
  );
});

const ROW_MODE_OPTS = [
  { label: 'Thêm vào (append) — giữ dòng đang có', value: 'append' },
  { label: 'Thay thế (replace) — xóa dòng cũ rồi đổ mới', value: 'replace' },
];

/** Append vs replace: whether extracted rows are added to existing children or replace them. */
export const PtdlRowModeSelect: React.FC<any> = observer((props: any) => (
  <Select
    style={{ width: '100%' }}
    options={ROW_MODE_OPTS.map((o) => ({ ...o, label: t(o.label) }))}
    value={props.value || 'append'}
    onChange={(v) => props.onChange?.(v)}
  />
));

const ROWS_TRIGGER_OPTS_FILE = [
  { label: 'Tự động khi tệp được upload/thay đổi trong form (client)', value: 'onAttachChange' },
  { label: 'Server: khi record được tạo/cập nhật (cả automation/API/bulk)', value: 'onServerUpdate' },
];
const ROWS_TRIGGER_OPTS_TEXT = [{ label: 'Server: khi record được tạo/cập nhật (cả automation/API/bulk)', value: 'onServerUpdate' }];

function rowsTriggerArray(v: any): string[] {
  return Array.isArray(v) ? v : [];
}

/** Trigger picker — options depend on whether the source is a file (attachment) or text field. */
function makeRowsTriggerSelect(isFileSource: boolean): React.FC<any> {
  const opts = isFileSource ? ROWS_TRIGGER_OPTS_FILE : ROWS_TRIGGER_OPTS_TEXT;
  return observer((props: any) => (
    <Select
      mode="multiple"
      style={{ width: '100%' }}
      options={opts.map((o) => ({ ...o, label: t(o.label) }))}
      placeholder={t('(để trống = chỉ bấm ✨ thủ công)')}
      value={rowsTriggerArray(props.value)}
      onChange={(v) => props.onChange?.(v)}
    />
  ));
}

function aiExtractRowsStepUiSchema(t: (s: string) => any) {
  // Split the (long) config into tabs. FormTab + FormTab.TabPane are VOID wrappers, so every field
  // keeps its own flat name (aiService, aiChildMapping, …) — no data-path nesting under the tab key,
  // so the handler still reads params.<field> flat (see the flow-settings tab-nesting trap).
  return {
    tabs: {
      type: 'void',
      'x-component': 'FormTab',
      'x-component-props': { style: { marginTop: -4 } },
      properties: {
        tabData: {
          type: 'void',
          'x-component': 'FormTab.TabPane',
          'x-component-props': { tab: t('Cột & dòng') },
          properties: {
            aiTargetRelation: { type: 'object', title: t('Bảng con nhận dòng'), 'x-decorator': 'FormItem', 'x-component': 'PtdlRelationTargetSelect' },
            aiChildMapping: { type: 'array', title: t('Các field của mỗi dòng'), 'x-decorator': 'FormItem', 'x-component': 'PtdlChildFieldMapping' },
            aiRowMode: { type: 'string', title: t('Cách ghi'), 'x-decorator': 'FormItem', 'x-component': 'PtdlRowModeSelect' },
          },
        },
        tabPrompt: {
          type: 'void',
          'x-component': 'FormTab.TabPane',
          'x-component-props': { tab: t('AI / Prompt') },
          properties: {
            rowConnection: {
              type: 'void',
              'x-component': 'PtdlGrid',
              properties: {
                aiService: { type: 'string', title: t('Dịch vụ LLM'), 'x-decorator': 'FormItem', 'x-component': 'PtdlLlmServiceSelect' },
                aiModel: { type: 'string', title: t('Model'), 'x-decorator': 'FormItem', 'x-component': 'PtdlLlmModelSelect' },
              },
            },
            aiSystem: { type: 'string', title: t('Câu lệnh hệ thống'), 'x-decorator': 'FormItem', 'x-component': 'PtdlAiSystemInput' },
            aiPrompt: { type: 'string', title: t('Prompt'), 'x-decorator': 'FormItem', 'x-component': 'PtdlAiPromptInput' },
          },
        },
        tabAuto: {
          type: 'void',
          'x-component': 'FormTab.TabPane',
          'x-component-props': { tab: t('Tự động & Điều kiện') },
          properties: {
            aiTrigger: { type: 'array', title: t('Tự sinh khi'), 'x-decorator': 'FormItem', 'x-component': 'PtdlRowsTriggerSelect' },
            aiGate: { type: 'object', title: t('Điều kiện chạy (tiết kiệm chi phí)'), 'x-decorator': 'FormItem', 'x-component': 'PtdlAutorunGate' },
            aiHint: { type: 'string', title: t('Chú thích nút ✨ (hiện khi hover)'), 'x-decorator': 'FormItem', 'x-component': 'PtdlHintInput' },
          },
        },
      },
    },
  };
}

function aiExtractRowsFlowConfig(t: (s: string) => any) {
  return {
    key: 'ptdlAiExtractRowsSettings',
    sort: 552,
    title: t('AI'),
    steps: {
      ai: {
        title: t('AI trích nhiều dòng'),
        uiMode: { type: 'dialog', props: { width: 760 } },
        uiSchema: aiExtractRowsStepUiSchema(t),
        defaultParams: {
          aiService: '',
          aiModel: '',
          aiTargetRelation: {},
          aiChildMapping: [],
          aiRowMode: 'append',
          aiSystem: '',
          aiPrompt: '',
          aiTrigger: [],
          aiGate: {},
          aiHint: '',
        },
        handler(ctx: any, params: any) {
          ctx.model.setProps('aiService', params?.aiService || '');
          ctx.model.setProps('aiModel', params?.aiModel || '');
          ctx.model.setProps('aiTargetRelation', params?.aiTargetRelation || {});
          ctx.model.setProps('aiChildMapping', Array.isArray(params?.aiChildMapping) ? params.aiChildMapping : []);
          ctx.model.setProps('aiRowMode', params?.aiRowMode || 'append');
          ctx.model.setProps('aiSystem', params?.aiSystem || '');
          ctx.model.setProps('aiPrompt', params?.aiPrompt || '');
          ctx.model.setProps('aiTrigger', Array.isArray(params?.aiTrigger) ? params.aiTrigger : []);
          ctx.model.setProps('aiGate', params?.aiGate || {});
          ctx.model.setProps('aiHint', params?.aiHint || '');
        },
      },
    },
  };
}

/** Base render + a ✨ "Extract rows" button. On click: reads the source (own file for attachment
 *  variants, or the {{token}} prompt for text), calls `extractRows`, and writes the returned rows
 *  into the configured to-many field on the form. The user reviews the rows then Saves. */
export const AiExtractRowsEditable: React.FC<{ model: any; baseRender: () => React.ReactNode; isFileSource: boolean }> = observer(
  ({ model, baseRender, isFileSource }) => {
    const [loading, setLoading] = useState(false);
    const loadingRef = useRef(false);
    const p: any = model?.props || {};
    const prompt = p.aiPrompt || '';
    const rel: RelationTarget = p.aiTargetRelation || {};
    const relName = rel.name;
    const mapping: MapRow[] = (Array.isArray(p.aiChildMapping) ? p.aiChildMapping : []).filter((m: MapRow) => m?.field);
    const { fields: scalarFields, relationMaps } = splitMapping(mapping);
    const mode = p.aiRowMode || 'append';
    // Need at least one scalar field to extract (relations derive from an extracted raw column).
    const canGen = !!String(prompt).trim() && !!relName && scalarFields.length > 0;
    const triggers = rowsTriggerArray(p.aiTrigger);
    const hasAttachChange = isFileSource && triggers.includes('onAttachChange');

    // Sync the SERVER-side auto-run rule (kind 'extractRows') for the onServerUpdate trigger.
    useEffect(() => {
      const cf = model?.context?.collectionField;
      const sourceField = cf?.name;
      syncAutorunRule(model, {
        kind: 'extractRows',
        targetField: relName, // key the rule by the destination relation field
        wantServer: triggers.includes('onServerUpdate') && canGen && !!relName,
        config: {
          llmService: p.aiService || undefined,
          model: p.aiModel || undefined,
          system: p.aiSystem || undefined,
          prompt,
          sourceField: isFileSource ? sourceField : undefined,
          relationField: relName,
          fields: scalarFields,
          relationMaps,
          mode,
          ...gateConfig(p),
        },
        dependsOn: isFileSource && sourceField ? [sourceField] : depsOfPrompt(prompt),
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [p.aiTrigger, p.aiPrompt, p.aiService, p.aiModel, p.aiSystem, p.aiChildMapping, p.aiTargetRelation, p.aiRowMode, p.aiGate]);

    const onGen = async () => {
      if (!API || loadingRef.current) {
        if (!API) message.error(t('AI: apiClient chưa sẵn sàng'));
        return;
      }
      loadingRef.current = true;
      setLoading(true);
      try {
        const values = collectValues(model);
        const attachment = isFileSource ? model.props?.value : undefined;
        const res = await API.request({
          url: 'ptdlAiColumn:extractRows',
          method: 'post',
          data: {
            llmService: p.aiService || undefined,
            model: p.aiModel || undefined,
            system: p.aiSystem || undefined,
            prompt,
            values,
            attachment,
            fields: scalarFields,
          },
        });
        // Server returns `{ lines: [...] }` (NOT `rows` — that key gets list-unwrapped by NocoBase).
        const rows: any[] = res?.data?.data?.lines || [];
        if (!rows.length) {
          message.info(t('AI không tách được dòng nào.'));
          return;
        }
        // Resolve each RELATION column per row: classify the raw source value against the relation's
        // target collection → write the FK link {id: tk}. Supports N relations per row.
        if (relationMaps.length) {
          let matched = 0;
          const applyBest = (row: any, rm: any, best: any, q: string) => {
            const min = Number(rm.minScore) || 0;
            if (best && (best.score || 0) >= min) {
              row[rm.field as string] = best.record || { id: best.tk }; // full record → displays now
              matched++;
            } else if (rm.saveRawTo) {
              row[rm.saveRawTo] = q;
            }
          };
          // FAST relations (no rerank) → ONE batch call per master (20 dòng → 1 call, không phải 20).
          const fastByMaster: Record<string, Array<{ row: any; rm: any; q: string }>> = {};
          for (const row of rows) for (const rm of relationMaps.filter((r: any) => !r.rerank)) {
            const q = row[rm.queryField as string];
            if (q != null && String(q).trim() !== '') {
              if (!fastByMaster[rm.target as string]) fastByMaster[rm.target as string] = [];
              fastByMaster[rm.target as string].push({ row, rm, q: String(q) });
            }
          }
          for (const master of Object.keys(fastByMaster)) {
            const items = fastByMaster[master];
            try {
              const cr = await API.request({ url: 'ptdlAiColumn:classifyBatch', method: 'post', data: { queries: items.map((it) => it.q), masterCollection: master, llmService: p.aiService || undefined } });
              const results = cr?.data?.data?.results || [];
              items.forEach((it, i) => applyBest(it.row, it.rm, results[i]?.best, it.q));
            } catch {
              /* batch failed for this master */
            }
          }
          // RERANK relations → per-row LLM classify, concurrency-pooled.
          const rTasks: Array<{ row: any; rm: any; q: string }> = [];
          for (const row of rows) for (const rm of relationMaps.filter((r: any) => r.rerank)) {
            const q = row[rm.queryField as string];
            if (q != null && String(q).trim() !== '') rTasks.push({ row, rm, q: String(q) });
          }
          let ti = 0;
          const worker = async () => {
            while (ti < rTasks.length) {
              const { row, rm, q } = rTasks[ti++];
              try {
                const cr = await API.request({ url: 'ptdlAiColumn:classify', method: 'post', data: { query: q, masterCollection: rm.target, topK: 8, rerank: true, llmService: p.aiService || undefined, model: p.aiModel || undefined } });
                applyBest(row, rm, cr?.data?.data?.best, q);
              } catch {
                /* leave unresolved */
              }
            }
          };
          await Promise.all(Array.from({ length: Math.min(6, rTasks.length) }, worker));
          if (matched) message.success(t('Đã đối chiếu {{n}} FK quan hệ.', { n: matched }));
        }
        // Drop transient match-only fields (`__m_*`) before writing to the sub-table form.
        const cleanRows = rows.map((row) => {
          const c: Record<string, any> = { ...row };
          Object.keys(c).forEach((k) => k.startsWith('__m_') && delete c[k]);
          return c;
        });
        const form = model.context?.form;
        const existing = Array.isArray(form?.values?.[relName as string]) ? form.values[relName as string] : [];
        const next = mode === 'replace' ? cleanRows : [...existing, ...cleanRows];
        try {
          form?.setFieldValue?.(relName, next);
        } catch {
          /* form couldn't address the relation field (not on this form?) */
        }
        message.success(t('Đã tạo {{n}} dòng vào bảng con. Kiểm tra rồi bấm Save.', { n: rows.length }));
      } catch (e: any) {
        const msg = e?.response?.data?.errors?.[0]?.message || e?.response?.data?.message || e?.message || t('thất bại');
        message.error('AI: ' + msg);
      } finally {
        setLoading(false);
        loadingRef.current = false;
      }
    };
    const genRef = useRef(onGen);
    genRef.current = onGen;

    // Trigger: onAttachChange — auto-run when the source file's own value changes to non-empty (same
    // debounced baseline logic as AI Extract). Only meaningful for attachment sources.
    const lastKeyRef = useRef<string | undefined>(undefined);
    useEffect(() => {
      if (!hasAttachChange || !canGen) return;
      const cur = model.props?.value;
      const hasContent = Array.isArray(cur) ? cur.length > 0 : cur != null && cur !== '';
      const key = hasContent ? JSON.stringify(cur) : '';
      if (lastKeyRef.current === undefined) {
        lastKeyRef.current = key;
        return;
      }
      if (key !== lastKeyRef.current && hasContent) {
        lastKeyRef.current = key;
        const timer = setTimeout(() => genRef.current(), 800);
        return () => clearTimeout(timer);
      }
      lastKeyRef.current = key;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasAttachChange, canGen, model.props?.value]);

    const tooltipTitle = !canGen
      ? t('Chưa cấu hình: chọn bảng con + field + prompt (mở field settings)')
      : hasAttachChange
        ? t('Trích nhiều dòng bằng AI (tự động khi tệp thay đổi — bấm để chạy lại ngay)')
        : t('Trích nhiều dòng bằng AI vào bảng con đã cấu hình');

    return (
      <div style={{ display: 'flex', gap: 4, width: '100%', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>{baseRender()}</div>
        <Tooltip title={p.aiHint || tooltipTitle}>
          <Button
            aria-label="AI extract rows"
            icon={<SparklesIcon />}
            loading={loading}
            disabled={!canGen}
            onClick={() => genRef.current()}
            style={{ flex: '0 0 auto', color: !canGen ? undefined : hasAttachChange ? '#16a34a' : '#7c3aed' }}
          />
        </Tooltip>
      </div>
    );
  },
);

/** Split the unified mapping into: the SCALAR field defs the AI extracts, and the RELATION resolves
 *  (each = a relation column + the raw source column whose value is matched to get the FK). Supports
 *  N relation columns per extracted row. */
export function splitMapping(mapping: MapRow[]): { fields: any[]; relationMaps: any[] } {
  const rows = (Array.isArray(mapping) ? mapping : []).filter((m) => m?.field);
  const fields = rows
    .filter((m) => m.kind !== 'relation')
    .map((m) => ({ name: m.field, description: m.description || '', type: m.type || 'string', enum: m.enumValues, markdown: m.markdown }));
  const relationMaps: any[] = [];
  for (const m of rows) {
    if (m.kind !== 'relation' || !m.target) continue;
    const hasTransient = !m.queryField && !!(m.matchDesc && m.matchDesc.trim());
    if (!m.queryField && !hasTransient) continue; // no source configured
    const queryField = m.queryField || `__m_${m.field}`;
    // A transient match field is extracted by the AI (so it exists on the row) but never persisted —
    // the server drops any `__m_*` field before creating the child.
    if (hasTransient) fields.push({ name: queryField, description: m.matchDesc, type: 'string' });
    relationMaps.push({ field: m.field, target: m.target, queryField, minScore: m.minScore || 0, saveRawTo: (hasTransient && m.saveRawTo) || undefined, rerank: !!m.rerank });
  }
  return { fields, relationMaps };
}

/** {{token}} field names referenced by a text-source prompt (server dependsOn for onServerUpdate). */
function depsOfPrompt(prompt: string): string[] {
  const out: string[] = [];
  const re = /\{\{\s*([\w.$-]+)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(String(prompt || '')))) out.push(m[1]);
  return out;
}

export function registerAiExtractRows({ flowEngine, variants, EditableItemModel, api, tExpr }: Deps) {
  if (!flowEngine || !variants?.length) {
    // eslint-disable-next-line no-console
    console.warn('[ai-column] extractRows: missing flowEngine or variants — skip');
    return;
  }
  if (api) API = api;
  const te = (s: string) => (tExpr ? tExpr(s, { ns: NS }) : s);

  try {
    // The shared AI settings components (LLM pickers, system/prompt inputs, gate, grid) are already
    // registered by registerAiColumn(); only these row-specific ones are new. Trigger selects differ
    // per source kind (file vs text), so both variants are registered.
    registerFlowComponentsOnce(flowEngine, {
      PtdlRelationTargetSelect,
      PtdlChildFieldMapping,
      PtdlChildFieldSelect,
      PtdlRowModeSelect,
      PtdlRowsTriggerSelect: makeRowsTriggerSelect(true),
      PtdlRowsTriggerSelectText: makeRowsTriggerSelect(false),
      FormTab,
      'FormTab.TabPane': FormTab.TabPane,
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[ai-column] extractRows: registerComponents failed', e);
  }

  const registered: any[] = [];
  for (const { Base, modelName, interfaces, label, isFileSource } of variants) {
    if (!Base) {
      // eslint-disable-next-line no-console
      console.warn('[ai-column] extractRows: variant missing Base — skip', modelName);
      continue;
    }

    class AiExtractRowsFieldModel extends Base {
      render() {
        const p: any = (this as any).props || {};
        if (p.pattern === 'readPretty' || p.readOnly) {
          return super.render();
        }
        return <AiExtractRowsEditable model={this} baseRender={() => super.render()} isFileSource={isFileSource} />;
      }
    }

    flowEngine.registerModels({ [modelName]: AiExtractRowsFieldModel });

    try {
      // Text sources use the text-only trigger set — swap the trigger component name in a per-variant
      // flow config so the dialog shows the right options.
      const cfg = aiExtractRowsFlowConfig(te);
      if (!isFileSource) {
        (cfg.steps.ai.uiSchema as any).tabs.properties.tabAuto.properties.aiTrigger['x-component'] = 'PtdlRowsTriggerSelectText';
      }
      (AiExtractRowsFieldModel as any).registerFlow(cfg);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[ai-column] extractRows: registerFlow failed', modelName, e);
    }

    try {
      (AiExtractRowsFieldModel as any).define?.({ label });
    } catch {
      /* define optional */
    }

    try {
      // Text-source variant subclasses TextareaFieldModel: replicate core's auto-expand default
      // (core sets it on ITS binding's defaultProps, which our subclass binding doesn't inherit) so
      // switching to this component keeps the textarea growing 3→14 rows instead of scrolling at 2.
      const bindOpts: any = { isDefault: false };
      if (!isFileSource) bindOpts.defaultProps = { autoSize: { minRows: 3, maxRows: 14 } };
      EditableItemModel?.bindModelToInterface?.(modelName, interfaces, bindOpts);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[ai-column] extractRows: bind failed', modelName, e);
    }

    registered.push(AiExtractRowsFieldModel);
  }

  return registered;
}
