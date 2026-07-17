import React, { useEffect, useRef, useState } from 'react';
import { Alert, Button, Checkbox, Input, Modal, Select, Tag, Tooltip, message } from 'antd';
import { observer, useForm } from '@formily/react';
import { FormTab } from '@formily/antd-v5';
import { getFields, ColumnSelect, cleanLabel } from '@ptdl/shared';
import { SparklesIcon, collectValues } from './aiColumn';
import { NS, t } from './i18n';

/**
 * @ptdl/plugin-ai-column — "AI Phân loại chuyên sâu" (deep/decision-support classify). For HARD
 * classification with NO golden answer (HS code, ICD, chart-of-accounts, legal categorization…):
 * server `classifyDeep` extracts attributes → scores EVERY candidate with domain criteria →
 * reasoning + confidence + requires-verification + warnings. This field shows a RICH candidate
 * modal for a HUMAN to pick from (never auto), then logs the pick (`classifyFeedback`).
 *
 * Reuses the master/query/column pickers registered by registerAiClassify (PtdlMasterCollectionSelect,
 * PtdlQueryFieldsMulti, PtdlMasterColSelect/Multi, PtdlMasterIndexHint, PtdlNumber) — so this only
 * adds the deep-specific components (attributes list, rubric, role hint, feedback) + the rich modal.
 */

export type AiClassifyDeepVariant = { Base: any; modelName: string; interfaces: string[]; label: string; relationMode?: boolean };
type Deps = { flowEngine: any; variants: AiClassifyDeepVariant[]; EditableItemModel: any; api?: any; tExpr?: (s: string, opts?: any) => any };

let API: any = null;

/** Slug a Vietnamese label into a valid JSON-schema key (the extraction schema property name), so the
 *  user types ONE Vietnamese thing and we derive the machine key behind the scenes. */
const slugKey = (s: string, i: number) => {
  const base = String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
  return base || `attr_${i + 1}`;
};

/** Repeatable attribute rows. The user types ONE Vietnamese label per row (e.g. "Chức năng chính");
 *  we store {name: slug (machine key), description: the label} — name feeds the extraction schema,
 *  description is what shows in the result's "AI understood" panel. No duplicate second input. */
export const PtdlDeepAttributes: React.FC<any> = observer((props: any) => {
  const rows: any[] = Array.isArray(props.value) ? props.value : [];
  const update = (i: number, label: string) => { const n = rows.slice(); n[i] = { name: slugKey(label, i), description: label }; props.onChange?.(n); };
  const add = () => props.onChange?.([...rows, { name: '', description: '' }]);
  const rm = (i: number) => props.onChange?.(rows.filter((_: any, idx: number) => idx !== i));
  return (
    <div>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
          <span style={{ flex: '0 0 auto', width: 18, height: 18, borderRadius: 9, background: '#f0e9fb', color: '#7c3aed', fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
          <Input style={{ flex: 1 }} placeholder={t('Thuộc tính cần AI rút ra (vd: Chức năng chính, Vật liệu…)')} value={r.description} onChange={(e) => update(i, e.target.value)} />
          <Button danger type="text" onClick={() => rm(i)}>✕</Button>
        </div>
      ))}
      <Button type="dashed" onClick={add} style={{ width: '100%' }}>{t('+ Thêm thuộc tính')}</Button>
      {!rows.length ? <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>{t('AI sẽ trích các thuộc tính này từ input để chấm chính xác hơn (bỏ trống nếu không cần).')}</div> : null}
    </div>
  );
});

/** Structured rubric: rows of {criterion (VN), weight (points)}. Feeds the AI's per-criterion scoring
 *  AND the composed score bar in the result. Replaces the free-text rubric — clearer + machine-usable. */
export const PtdlDeepRubricRows: React.FC<any> = observer((props: any) => {
  const rows: any[] = Array.isArray(props.value) ? props.value : [];
  const update = (i: number, patch: any) => { const n = rows.slice(); n[i] = { ...n[i], ...patch }; props.onChange?.(n); };
  const add = () => props.onChange?.([...rows, { criterion: '', weight: 20 }]);
  const rm = (i: number) => props.onChange?.(rows.filter((_: any, idx: number) => idx !== i));
  const total = rows.reduce((s, r) => s + (Number(r.weight) || 0), 0);
  return (
    <div>
      {rows.length ? (
        <div style={{ display: 'flex', gap: 8, marginBottom: 4, fontSize: 12, color: '#999' }}>
          <span style={{ flex: 1 }}>{t('Tiêu chí')}</span>
          <span style={{ width: 90 }}>{t('Điểm tối đa')}</span>
          <span style={{ width: 24 }} />
        </div>
      ) : null}
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
          <Input style={{ flex: 1 }} placeholder={t('vd: Chức năng khớp')} value={r.criterion} onChange={(e) => update(i, { criterion: e.target.value })} />
          <Input type="number" style={{ width: 90 }} value={r.weight} onChange={(e) => update(i, { weight: Number(e.target.value) || 0 })} />
          <Button danger type="text" style={{ width: 24 }} onClick={() => rm(i)}>✕</Button>
        </div>
      ))}
      <Button type="dashed" onClick={add} style={{ width: '100%' }}>{t('+ Thêm tiêu chí')}</Button>
      {rows.length ? <div style={{ fontSize: 12, color: total === 100 ? '#52c41a' : '#d48806', marginTop: 4 }}>{t('Tổng điểm')}: {total}{total !== 100 ? t(' (nên = 100)') : ' ✓'}</div> : <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>{t('Bỏ trống = AI tự chấm tổng quát. Khai báo tiêu chí + trọng số → điểm hiện thành thanh nhiều màu theo cấu phần.')}</div>}
    </div>
  );
});

const ROLE_OPTS = () => [
  { value: 'title', label: t('Tiêu đề (đậm)') },
  { value: 'path', label: t('Đường dẫn (breadcrumb)') },
  { value: 'text', label: t('Văn bản') },
  { value: 'tag', label: t('Nhãn (chip)') },
];

/** Role-aware display config: rows of {field, role}. The user DECLARES how each master column shows on
 *  the candidate card (title / breadcrumb / plain text / tag) so the card renders by role instead of
 *  guessing — a generic tool can't know which column is the primary label vs a tag. */
export const PtdlDeepDisplayFields: React.FC<any> = observer((props: any) => {
  const form = useForm();
  const master = form?.values?.aiMaster || {};
  const [opts, setOpts] = useState<any[]>([]);
  useEffect(() => {
    let alive = true;
    if (master.collection) getFields(API, master.collection, master.dataSourceKey || 'main').then((f: any) => alive && setOpts((f || []).filter((x: any) => !x.isForeignKey).map((x: any) => ({ value: x.name, label: cleanLabel(x.uiSchema?.title, x.name) + ' (' + x.name + ')' }))));
    else setOpts([]);
    return () => { alive = false; };
  }, [master.collection]);
  const rows: any[] = (Array.isArray(props.value) ? props.value : []).map((x: any) => (typeof x === 'string' ? { field: x, role: 'tag' } : x));
  const update = (i: number, patch: any) => { const n = rows.slice(); n[i] = { ...n[i], ...patch }; props.onChange?.(n); };
  const add = () => props.onChange?.([...rows, { field: undefined, role: 'tag' }]);
  const rm = (i: number) => props.onChange?.(rows.filter((_: any, idx: number) => idx !== i));
  return (
    <div>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
          <ColumnSelect style={{ flex: 1 }} options={opts} value={r.field} onChange={(v: any) => update(i, { field: v })} placeholder={master.collection ? t('Chọn cột') : t('Chọn bảng master trước')} />
          <Select style={{ width: 175 }} options={ROLE_OPTS()} value={r.role || 'tag'} onChange={(v) => update(i, { role: v })} />
          <Button danger type="text" onClick={() => rm(i)}>✕</Button>
        </div>
      ))}
      <Button type="dashed" onClick={add} style={{ width: '100%' }}>{t('+ Thêm cột hiển thị')}</Button>
      {!rows.length ? <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>{t('Khai từng cột + vai trò để thẻ ứng viên hiển thị đúng ý (không đoán tự động).')}</div> : null}
    </div>
  );
});

/** Human-verified examples config: {collection, queryField, codeField, k}. At classify time the server
 *  retrieves the most similar past (input→correct-code) pairs, injects them as few-shot precedent AND
 *  forces their codes into the candidate list — the strongest accuracy lever for a no-golden-answer domain. */
export const PtdlDeepExamples: React.FC<any> = observer((props: any) => {
  const v = props.value || {};
  const [colls, setColls] = useState<any[]>([]);
  const [cols, setCols] = useState<any[]>([]);
  useEffect(() => {
    let a = true;
    if (!API) return;
    API.request({ url: 'collections:list', params: { paginate: false } }).then((r: any) => { if (!a) return; setColls((r?.data?.data || []).filter((c: any) => c?.name && !c.hidden && c.template !== 'view').map((c: any) => ({ value: c.name, label: `${cleanLabel(c.title, c.name)} (${c.name})` }))); }).catch(() => {});
    return () => { a = false; };
  }, []);
  useEffect(() => {
    let a = true;
    if (v.collection) getFields(API, v.collection, v.dataSourceKey || 'main').then((f: any) => a && setCols((f || []).filter((x: any) => !x.isForeignKey).map((x: any) => ({ value: x.name, label: cleanLabel(x.uiSchema?.title, x.name) + ' (' + x.name + ')' }))));
    else setCols([]);
    return () => { a = false; };
  }, [v.collection]);
  const set = (patch: any) => props.onChange?.({ ...v, ...patch });
  return (
    <div>
      <Select style={{ width: '100%', marginBottom: 6 }} allowClear showSearch optionFilterProp="label" options={colls} value={v.collection || undefined} onChange={(c) => set({ collection: c || undefined, dataSourceKey: 'main', queryField: undefined, codeField: undefined })} placeholder={t('Bảng ví dụ đã xác thực (input → mã đúng)')} />
      {v.collection ? (
        <div style={{ display: 'flex', gap: 8 }}>
          <ColumnSelect style={{ flex: 1 }} options={cols} value={v.queryField} onChange={(q: any) => set({ queryField: q })} placeholder={t('Cột nội dung ví dụ')} />
          <ColumnSelect style={{ flex: 1 }} options={cols} value={v.codeField} onChange={(c: any) => set({ codeField: c })} placeholder={t('Cột mã đúng')} />
          <Input type="number" style={{ width: 70 }} value={v.k ?? 3} onChange={(e) => set({ k: Number(e.target.value) || 3 })} />
        </div>
      ) : null}
      <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>{t('Lấy vài ví dụ giống nhất làm few-shot cho AI + đảm bảo mã đúng lọt vào danh sách. Để trống nếu chưa có.')}</div>
    </div>
  );
});

export const PtdlDeepRubric: React.FC<any> = observer((props: any) => (
  <Input.TextArea autoSize={{ minRows: 2, maxRows: 8 }} value={props.value} placeholder={t('Tiêu chí chấm điểm (vd: chức năng chính 40đ, vật liệu 20đ, mục đích dùng 20đ, hàng nguyên chiếc 20đ)')} onChange={(e) => props.onChange?.(e.target.value)} />
));
export const PtdlDeepRoleHint: React.FC<any> = observer((props: any) => (
  <Input value={props.value} placeholder={t('Vai chuyên gia (vd: chuyên gia hải quan / bác sĩ mã hoá ICD / kế toán trưởng)')} onChange={(e) => props.onChange?.(e.target.value)} />
));
export const PtdlDeepFeedback: React.FC<any> = observer((props: any) => (
  <Checkbox checked={props.value !== false} onChange={(e) => props.onChange?.(e.target.checked)}>{t('Ghi lại quyết định (audit + cải thiện) khi người dùng chọn')}</Checkbox>
));

function aiClassifyDeepStepUiSchema(t: (s: string) => any, relationMode?: boolean) {
  // In relationMode the field IS a belongsTo relation to the master → picking a candidate writes the
  // real FK (via model.change), so there's NO "which column to write" question. Master is auto-derived
  // from the relation at run time; the picker below is optional, only to enable the display-column list.
  const rowWrite = relationMode
    ? { aiTopK: { type: 'number', title: t('Số ứng viên xét (topK)'), 'x-decorator': 'FormItem', 'x-decorator-props': { tooltip: t('Số ứng viên gần nhất đem cho AI chấm. Nhiều hơn = kỹ hơn nhưng chậm/tốn token hơn (khuyên 10–15).') }, 'x-component': 'PtdlNumber' } }
    : {
        aiWriteField: { type: 'string', title: t('Chọn ứng viên xong → ghi cột nào vào ô?'), 'x-decorator': 'FormItem', 'x-decorator-props': { tooltip: t('Sau khi bạn chọn 1 ứng viên, lấy giá trị cột này CỦA ỨNG VIÊN ghi vào ô đang cấu hình. Thường chọn cột mã (vd maHs) để ghi mã số.') }, 'x-component': 'PtdlMasterColSelect' },
        aiTopK: { type: 'number', title: t('Số ứng viên xét (topK)'), 'x-decorator': 'FormItem', 'x-decorator-props': { tooltip: t('Số ứng viên gần nhất đem cho AI chấm. Nhiều hơn = kỹ hơn nhưng chậm/tốn token hơn (khuyên 10–15).') }, 'x-component': 'PtdlNumber' },
      };
  return {
    tabs: {
      type: 'void',
      'x-component': 'FormTab',
      properties: {
        tabMatch: {
          type: 'void',
          'x-component': 'FormTab.TabPane',
          'x-component-props': { tab: t('Đối chiếu & Hiển thị') },
          properties: {
            aiMaster: { type: 'object', title: relationMode ? t('Bảng master (tự lấy từ quan hệ — chọn nếu muốn cấu hình cột hiển thị)') : t('Bảng master (danh mục đối chiếu)'), 'x-decorator': 'FormItem', 'x-component': 'PtdlMasterCollectionSelect' },
            aiIndexHint: { type: 'void', 'x-decorator': 'FormItem', 'x-decorator-props': { style: { marginTop: -12, marginBottom: 8 } }, 'x-component': 'PtdlMasterIndexHint' },
            aiQueryFields: { type: 'array', title: t('Nội dung cần đối chiếu (cột trên bản ghi)'), 'x-decorator': 'FormItem', 'x-decorator-props': { tooltip: t('Chọn 1 hoặc NHIỀU cột trên bản ghi hiện tại; giá trị được ghép lại thành nội dung đem so khớp với master.') }, 'x-component': 'PtdlQueryFieldsMulti' },
            rowWrite: {
              type: 'void',
              'x-component': 'PtdlGrid',
              properties: rowWrite,
            },
            aiDisplayFields: { type: 'array', title: t('Cột hiển thị trên thẻ ứng viên + vai trò'), 'x-decorator': 'FormItem', 'x-decorator-props': { tooltip: t('Khai từng cột và VAI TRÒ hiển thị: Tiêu đề (đậm) / Đường dẫn (breadcrumb) / Văn bản / Nhãn (chip). Chỉ để xem khi so sánh — KHÔNG ảnh hưởng việc khớp.') }, 'x-component': 'PtdlDeepDisplayFields' },
            rowLLM: {
              type: 'void',
              'x-component': 'PtdlGrid',
              properties: {
                aiService: { type: 'string', title: t('Dịch vụ LLM'), 'x-decorator': 'FormItem', 'x-component': 'PtdlLlmServiceSelect' },
                aiModel: { type: 'string', title: t('Model (suy luận)'), 'x-decorator': 'FormItem', 'x-component': 'PtdlLlmModelSelect' },
              },
            },
          },
        },
        tabDeep: {
          type: 'void',
          'x-component': 'FormTab.TabPane',
          'x-component-props': { tab: t('Suy luận chuyên sâu') },
          properties: {
            aiRoleHint: { type: 'string', title: t('Vai chuyên gia'), 'x-decorator': 'FormItem', 'x-decorator-props': { tooltip: t('AI sẽ nhập vai này khi trích thuộc tính & chấm điểm — ảnh hưởng cách lý luận (vd chuyên gia hải quan, bác sĩ mã ICD).') }, 'x-component': 'PtdlDeepRoleHint' },
            aiAttributes: { type: 'array', title: t('① Thuộc tính AI trích để HIỂU input (hiện ở đầu kết quả)'), 'x-decorator': 'FormItem', 'x-decorator-props': { tooltip: t('AI đọc nội dung đầu vào và rút ra các thuộc tính này (vd bản chất, chức năng…) TRƯỚC khi chấm. Chúng hiện ở panel “AI đã hiểu…” đầu modal kết quả, và giúp AI chấm sát hơn. Đây là bước HIỂU đề, khác với Rubric (bước CHẤM).') }, 'x-component': 'PtdlDeepAttributes' },
            aiRubricItems: { type: 'array', title: t('② Tiêu chí CHẤM ĐIỂM ứng viên (tiêu chí + trọng số)'), 'x-decorator': 'FormItem', 'x-decorator-props': { tooltip: t('Mỗi dòng: một tiêu chí + điểm tối đa. AI chấm điểm ĐẠT của từng tiêu chí → điểm tổng hiện thành thanh nhiều màu theo cấu phần. Đây là bước CHẤM (khác Attributes = bước HIỂU). Bỏ trống = AI tự chấm tổng quát.') }, 'x-component': 'PtdlDeepRubricRows' },
            aiExamples: { type: 'object', title: t('③ Ví dụ đã xác thực (few-shot — tăng độ chính xác)'), 'x-decorator': 'FormItem', 'x-decorator-props': { tooltip: t('Trỏ tới một bảng chứa các ca ĐÃ DUYỆT ĐÚNG (nội dung → mã đúng). AI lấy vài ca giống nhất làm ví dụ mẫu và đảm bảo mã đúng của tiền lệ luôn nằm trong danh sách ứng viên — cách tăng độ chính xác mạnh nhất cho domain khó.') }, 'x-component': 'PtdlDeepExamples' },
            aiFeedback: { type: 'boolean', 'x-decorator': 'FormItem', 'x-component': 'PtdlDeepFeedback' },
          },
        },
      },
    },
  };
}

function aiClassifyDeepFlowConfig(te: (s: string) => any, relationMode?: boolean) {
  return {
    key: 'ptdlAiClassifyDeepSettings',
    sort: 554,
    title: te('AI'),
    steps: {
      ai: {
        title: te('AI phân loại chuyên sâu'),
        uiMode: { type: 'dialog', props: { width: 820 } },
        uiSchema: aiClassifyDeepStepUiSchema(te, relationMode),
        defaultParams: { aiService: '', aiModel: '', aiMaster: {}, aiQueryFields: [], aiWriteField: '', aiDisplayFields: [], aiTopK: 20, aiRoleHint: '', aiAttributes: [], aiRubric: '', aiRubricItems: [], aiExamples: {}, aiFeedback: true },
        handler(ctx: any, params: any) {
          ctx.model.setProps('aiService', params?.aiService || '');
          ctx.model.setProps('aiModel', params?.aiModel || '');
          ctx.model.setProps('aiMaster', params?.aiMaster || {});
          ctx.model.setProps('aiQueryFields', Array.isArray(params?.aiQueryFields) ? params.aiQueryFields : []);
          ctx.model.setProps('aiWriteField', params?.aiWriteField || '');
          ctx.model.setProps('aiDisplayFields', Array.isArray(params?.aiDisplayFields) ? params.aiDisplayFields : []);
          ctx.model.setProps('aiTopK', params?.aiTopK || 20);
          ctx.model.setProps('aiRoleHint', params?.aiRoleHint || '');
          ctx.model.setProps('aiAttributes', Array.isArray(params?.aiAttributes) ? params.aiAttributes : []);
          ctx.model.setProps('aiRubric', params?.aiRubric || '');
          ctx.model.setProps('aiRubricItems', Array.isArray(params?.aiRubricItems) ? params.aiRubricItems : []);
          ctx.model.setProps('aiExamples', params?.aiExamples || {});
          ctx.model.setProps('aiFeedback', params?.aiFeedback !== false);
        },
      },
    },
  };
}

const CONF_COLOR: Record<string, string> = { high: 'green', medium: 'orange', low: 'red' };
const CONF_DOT: Record<string, string> = { high: '#52c41a', medium: '#faad14', low: '#ff4d4f' };
const CONF_LABEL: Record<string, string> = { high: 'cao', medium: 'vừa', low: 'thấp' };
const scoreStyle = (s: number) =>
  s >= 80 ? { bg: '#f6ffed', bd: '#b7eb8f', fg: '#389e0d' } : s >= 55 ? { bg: '#fffbe6', bd: '#ffe58f', fg: '#d48806' } : { bg: '#fff1f0', bd: '#ffa39e', fg: '#cf1322' };

/** Render a "A › B › C" path value as a subtle breadcrumb (last crumb emphasized). */
const Breadcrumb: React.FC<{ path: string }> = ({ path }) => {
  const parts = String(path).split('›').map((s) => s.trim()).filter(Boolean);
  return (
    <span style={{ lineHeight: 1.5 }}>
      {parts.map((p, i) => (
        <React.Fragment key={i}>
          {i > 0 ? <span style={{ color: '#c8c8c8', margin: '0 5px' }}>›</span> : null}
          <span style={{ color: i === parts.length - 1 ? '#1f1f1f' : '#8c8c8c', fontWeight: i === parts.length - 1 ? 600 : 400 }}>{p}</span>
        </React.Fragment>
      ))}
    </span>
  );
};

const SEG_PALETTE = ['#52c41a', '#1677ff', '#722ed1', '#fa8c16', '#13c2c2', '#eb2f96'];
/** Composed score bar: one colored segment per rubric criterion (width ∝ points earned), the rest of
 *  the track grey = points not earned. A legend below spells out criterion: points/max. */
const ScoreBar: React.FC<{ items: any[] }> = ({ items }) => {
  const list = (items || []).filter((c) => c && Number(c.max) > 0);
  if (!list.length) return null;
  const totalMax = list.reduce((s, c) => s + (Number(c.max) || 0), 0) || 100;
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', background: '#f0f0f0' }}>
        {list.map((c, i) => {
          const w = (Math.max(0, Math.min(Number(c.points) || 0, c.max)) / totalMax) * 100;
          return <Tooltip key={i} title={`${c.criterion}: ${c.points}/${c.max}`}><div style={{ width: w + '%', background: SEG_PALETTE[i % SEG_PALETTE.length] }} /></Tooltip>;
        })}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 5 }}>
        {list.map((c, i) => (
          <span key={i} style={{ fontSize: 11, color: '#777', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <i style={{ width: 8, height: 8, borderRadius: 2, background: SEG_PALETTE[i % SEG_PALETTE.length], display: 'inline-block' }} />
            {c.criterion}: <b style={{ color: '#333' }}>{c.points}</b><span style={{ color: '#bbb' }}>/{c.max}</span>
          </span>
        ))}
      </div>
    </div>
  );
};

/** One candidate = structured card: rank + code chip + score pill + confidence dot + Pick, then
 *  composed score bar, breadcrumb path, other display fields, reasoning, criteria tags, verify/policy. */
const CandidateCard: React.FC<any> = ({ c, rank, isTop, displayRoles, writeField, fieldTitles, onPick }) => {
  const st = scoreStyle(c.score || 0);
  const rec = c.record || {};
  const roles: Record<string, string> = displayRoles || {};
  // Render strictly by the USER-DECLARED role of each column — no guessing which is title/path/tag.
  const has = (f: string) => rec[f] != null && String(rec[f]).trim() !== '';
  const byRole = (role: string) => Object.keys(roles).filter((f) => f !== writeField && roles[f] === role && has(f));
  const titleFields = byRole('title');
  const pathFields = byRole('path');
  const textFields = byRole('text');
  const tagFields = byRole('tag');
  const code = c.write || rec[writeField] || (titleFields[0] ? String(rec[titleFields[0]]) : '') || String(c.tk);
  const label = (f: string) => (fieldTitles?.[f] ? fieldTitles[f] + ': ' : '');
  const [openReason, setOpenReason] = useState(true);
  return (
    <div style={{ border: `1px solid ${isTop ? '#b39ddb' : '#ececec'}`, background: isTop ? '#faf7ff' : '#fff', borderRadius: 10, padding: '12px 14px', marginBottom: 10, boxShadow: isTop ? '0 1px 6px rgba(124,58,237,0.12)' : 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ flex: '0 0 auto', width: 22, height: 22, borderRadius: 11, background: isTop ? '#7c3aed' : '#eee', color: isTop ? '#fff' : '#888', fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{rank}</span>
        <code style={{ fontSize: 16, fontWeight: 700, color: '#4c1d95', background: '#f3effc', padding: '2px 8px', borderRadius: 6, letterSpacing: 0.3 }}>{code}</code>
        {isTop ? <Tag color="purple" style={{ marginInlineEnd: 0 }}>{t('Đề xuất')}</Tag> : null}
        {c.fromPrecedent ? <Tooltip title={t('Mã này khớp một tiền lệ đã xác thực — luôn được hiện để bạn cân nhắc.')}><Tag color="gold" style={{ marginInlineEnd: 0 }}>{t('Tiền lệ')}</Tag></Tooltip> : null}
        <span style={{ flex: 1 }} />
        <Tooltip title={t('Mức khớp AI chấm (0–100)')}>
          <span style={{ fontSize: 13, fontWeight: 700, color: st.fg, background: st.bg, border: `1px solid ${st.bd}`, borderRadius: 20, padding: '1px 10px' }}>{c.score}</span>
        </Tooltip>
        <Tooltip title={t('Độ tin cậy')}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#666' }}>
            <i style={{ width: 8, height: 8, borderRadius: 4, background: CONF_DOT[c.confidence] || '#bbb', display: 'inline-block' }} />
            {CONF_LABEL[c.confidence] || c.confidence}
          </span>
        </Tooltip>
        <Button type="primary" size="small" style={{ background: '#7c3aed', borderColor: '#7c3aed' }} onClick={() => onPick(c)}>{t('Chọn')}</Button>
      </div>
      <ScoreBar items={c.criteriaScores} />
      {titleFields.map((f) => <div key={f} style={{ margin: '8px 0 2px', fontSize: 14, fontWeight: 600, color: '#1f1f1f' }}>{String(rec[f])}</div>)}
      {pathFields.map((f) => <div key={f} style={{ margin: '8px 0 2px', fontSize: 13 }}><Breadcrumb path={String(rec[f])} /></div>)}
      {textFields.map((f) => <div key={f} style={{ margin: '4px 0', fontSize: 13, color: '#555', lineHeight: 1.5 }}><span style={{ color: '#999' }}>{label(f)}</span>{String(rec[f])}</div>)}
      {tagFields.length ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '6px 0' }}>
          {tagFields.map((f) => <span key={f} style={{ fontSize: 12, color: '#595959', background: '#f5f5f5', border: '1px solid #eee', borderRadius: 4, padding: '1px 7px' }}><span style={{ color: '#999' }}>{label(f)}</span>{String(rec[f])}</span>)}
        </div>
      ) : null}
      {c.reasoning ? (
        <div style={{ marginTop: 6 }}>
          <a style={{ fontSize: 12, color: '#7c3aed' }} onClick={() => setOpenReason((v) => !v)}>{openReason ? t('▾ Lý do') : t('▸ Lý do')}</a>
          {openReason ? <div style={{ color: '#555', fontSize: 13, marginTop: 2, lineHeight: 1.5 }}>{c.reasoning}</div> : null}
        </div>
      ) : null}
      {(c.matchedCriteria || []).length || (c.unmatchedCriteria || []).length ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
          {(c.matchedCriteria || []).map((m: string, i: number) => <Tag key={'m' + i} color="success" style={{ marginInlineEnd: 0, marginBottom: 2 }}>✓ {m}</Tag>)}
          {(c.unmatchedCriteria || []).map((m: string, i: number) => <Tag key={'u' + i} color="error" style={{ marginInlineEnd: 0, marginBottom: 2 }}>✗ {m}</Tag>)}
        </div>
      ) : null}
      {(c.requiresVerification || []).length ? <div style={{ fontSize: 12, color: '#d97706', marginTop: 6 }}>⚠ {t('Cần kiểm tra')}: {(c.requiresVerification || []).join('; ')}</div> : null}
      {c.warnings && c.warnings !== 'Không có' && String(c.warnings).trim() ? <div style={{ fontSize: 12, color: '#dc2626', marginTop: 4 }}>🛑 {c.warnings}</div> : null}
    </div>
  );
};

/** Base render + ✨ + RICH candidate modal (cards with score/confidence/reasoning/verify/warnings). */
export const AiClassifyDeepEditable: React.FC<{ model: any; baseRender: () => React.ReactNode; relationMode?: boolean }> = observer(({ model, baseRender, relationMode }) => {
  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<any>(null);
  const p: any = model?.props || {};
  const master = p.aiMaster || {};
  // relationMode: this field is a belongsTo relation → the master collection is the relation target,
  // auto-derived from the field's collectionField (no need to configure it; a configured aiMaster still
  // wins so the display-column picker can work). Picking a candidate writes the real FK via model.change.
  const cf: any = relationMode ? (model?.collectionField || model?.context?.collectionField) : null;
  const masterColl = master.collection || cf?.target || '';
  const masterDsk = master.dataSourceKey || cf?.collection?.dataSourceKey || cf?.dataSourceKey || 'main';
  const canGen = !!masterColl && Array.isArray(p.aiQueryFields) && p.aiQueryFields.length > 0;

  const writeValue = (val: any) => {
    if (val == null) return;
    const out = String(val);
    if (typeof model.props?.onChange === 'function') model.props.onChange(out);
    try { model.setProps?.('value', out); } catch { /* ignore */ }
  };

  const onGen = async () => {
    if (!API || loadingRef.current) { if (!API) message.error(t('AI: apiClient chưa sẵn sàng')); return; }
    loadingRef.current = true;
    setLoading(true);
    try {
      const values = collectValues(model);
      const query = (Array.isArray(p.aiQueryFields) ? p.aiQueryFields : []).map((f: string) => values?.[f]).filter((v: any) => v != null && String(v).trim() !== '').map((v: any) => String(v)).join(' ').trim();
      if (!query) { message.info(t('Nội dung đối chiếu đang trống (kiểm tra cột nguồn).')); return; }
      // Normalize display config: rows of {field, role} (back-compat: old string[] → role 'tag').
      const dfRows = (Array.isArray(p.aiDisplayFields) ? p.aiDisplayFields : []).map((x: any) => (typeof x === 'string' ? { field: x, role: 'tag' } : x)).filter((x: any) => x?.field);
      const displayFieldNames = dfRows.map((x: any) => x.field);
      const displayRoles: Record<string, string> = Object.fromEntries(dfRows.map((x: any) => [x.field, x.role || 'tag']));
      const writeTemplate = relationMode ? undefined : (p.aiWriteField ? `{{${p.aiWriteField}}}` : undefined);
      const labelTemplate = displayFieldNames.length ? displayFieldNames.map((c: string) => `{{${c}}}`).join(' - ') : undefined;
      const res = await API.request({
        url: 'ptdlAiColumn:classifyDeep',
        method: 'post',
        data: {
          query, masterCollection: masterColl, dataSourceKey: masterDsk,
          topK: p.aiTopK || 20, roleHint: p.aiRoleHint || undefined, rubric: p.aiRubric || undefined,
          rubricItems: Array.isArray(p.aiRubricItems) ? p.aiRubricItems.filter((r: any) => r?.criterion) : undefined,
          attributes: Array.isArray(p.aiAttributes) ? p.aiAttributes.filter((a: any) => a?.name) : undefined,
          displayFields: displayFieldNames.length ? displayFieldNames : undefined,
          examples: p.aiExamples?.collection && p.aiExamples?.queryField && p.aiExamples?.codeField
            ? { collection: p.aiExamples.collection, dataSourceKey: p.aiExamples.dataSourceKey || 'main', queryField: p.aiExamples.queryField, codeField: p.aiExamples.codeField, masterCodeField: p.aiWriteField || undefined, k: p.aiExamples.k || 3 }
            : undefined,
          labelTemplate, writeTemplate, llmService: p.aiService || undefined, model: p.aiModel || undefined,
        },
      });
      const d = res?.data?.data;
      if (!d?.candidates?.length) { message.info(t('Không tìm thấy ứng viên phù hợp.')); return; }
      // Fetch the master field titles once so candidate-card chips read "Chương: 95" not a bare "95".
      let fieldTitles: Record<string, string> = {};
      try {
        const fr = await API.request({ url: `collections/${masterColl}/fields:list`, method: 'get', params: { pageSize: 200 } });
        (fr?.data?.data || []).forEach((f: any) => { fieldTitles[f.name] = cleanLabel(f?.uiSchema?.title, f.name); });
      } catch { /* titles are best-effort */ }
      // Map each extracted attribute key back to its Vietnamese label (the configured description).
      const attrLabels: Record<string, string> = {};
      (Array.isArray(p.aiAttributes) ? p.aiAttributes : []).forEach((a: any) => { if (a?.name) attrLabels[a.name] = a.description || a.name; });
      setResult({ ...d, query, fieldTitles, attrLabels, displayRoles });
      setOpen(true);
    } catch (e: any) {
      message.error('AI: ' + (e?.response?.data?.errors?.[0]?.message || e?.response?.data?.message || e?.message || t('thất bại')));
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  };
  const genRef = useRef(onGen);
  genRef.current = onGen;

  const pick = async (c: any) => {
    if (relationMode) {
      // Write the real FK: RecordSelectFieldModel.change(record) links the associated master row (the
      // full record makes the select display the label). Fall back to the code string if change fails.
      try { (model as any).change?.(c.record || { [cf?.targetKey || 'id']: c.tk }); }
      catch { writeValue(c.write ?? c.label); }
    } else {
      writeValue(c.write ?? c.label);
    }
    setOpen(false);
    message.success(t('Đã chọn: {{label}}', { label: c.label }));
    if (p.aiFeedback !== false && result) {
      try {
        await API.request({
          url: 'ptdlAiColumn:classifyFeedback', method: 'post',
          data: { masterCollection: masterColl, query: result.query, selectedTk: c.tk, aiTopTk: result.best?.tk, aiTopScore: result.best?.score, candidates: (result.candidates || []).map((x: any) => ({ tk: x.tk, score: x.score })) },
        });
      } catch { /* feedback best-effort */ }
    }
  };

  const cands = result?.candidates || [];
  return (
    <div style={{ display: 'flex', gap: 4, width: '100%', alignItems: 'flex-start' }}>
      <div style={{ flex: 1, minWidth: 0 }}>{baseRender()}</div>
      <Tooltip title={!canGen ? t('Chưa cấu hình: chọn bảng master + nội dung đối chiếu (mở field settings)') : t('Phân loại chuyên sâu — AI chấm & giải trình từng ứng viên')}>
        <Button aria-label="AI deep classify" icon={<SparklesIcon />} loading={loading} disabled={!canGen} onClick={() => genRef.current()} style={{ flex: '0 0 auto', color: !canGen ? undefined : '#7c3aed' }} />
      </Tooltip>
      <Modal
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
        width={760}
        styles={{ body: { maxHeight: '72vh', overflowY: 'auto', paddingTop: 8 } }}
        title={
          <div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{t('Kết quả phân loại — chọn 1 đáp án')}</div>
            {result?.query ? <div style={{ fontSize: 12, fontWeight: 400, color: '#888', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 640 }}>{t('Nội dung')}: “{result.query}”</div> : null}
          </div>
        }
      >
        {(() => {
          const a = result?.attributes;
          if (!a || typeof a !== 'object') return null;
          const entries = Object.entries(a).filter(([k, v]) => k !== 'missing_info' && v != null && String(v).trim() !== '' && String(v).toLowerCase() !== 'null');
          if (!entries.length) return null;
          return (
            <div style={{ background: '#f6f4fb', border: '1px solid #e6dffa', borderRadius: 8, padding: '8px 12px', marginBottom: 10 }}>
              <div style={{ fontSize: 12, color: '#7c3aed', fontWeight: 600, marginBottom: 4 }}>{t('AI đã hiểu nội dung của bạn')}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {entries.map(([k, v]) => (
                  <span key={k} style={{ fontSize: 12, background: '#fff', border: '1px solid #e6dffa', borderRadius: 4, padding: '1px 8px' }}>
                    <span style={{ color: '#999' }}>{result.attrLabels?.[k] || k}:</span> <span style={{ color: '#333' }}>{String(v)}</span>
                  </span>
                ))}
              </div>
            </div>
          );
        })()}
        {result?.overallRecommendation ? <Alert type="info" showIcon style={{ marginBottom: 10 }} message={t('Tư vấn')} description={result.overallRecommendation} /> : null}
        {(result?.missingInfo || []).length ? <Alert type="warning" showIcon style={{ marginBottom: 10 }} message={t('Thiếu thông tin để chắc chắn')} description={<ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{(result.missingInfo || []).map((m: string, i: number) => <li key={i}>{m}</li>)}</ul>} /> : null}
        {(result?.examplesUsed || []).length ? (
          <Alert type="success" showIcon style={{ marginBottom: 10 }} message={t('Đã tham chiếu {{n}} tiền lệ đã xác thực', { n: result.examplesUsed.length })} description={<div>{(result.examplesUsed || []).map((e: any, i: number) => <div key={i} style={{ fontSize: 12 }}>• “{e.q}” → <b>{e.code}</b></div>)}</div>} />
        ) : null}
        {cands.map((c: any, i: number) => (
          <CandidateCard key={c.tk ?? i} c={c} rank={i + 1} isTop={i === 0} displayRoles={result?.displayRoles} writeField={p.aiWriteField} fieldTitles={result?.fieldTitles} onPick={pick} />
        ))}
        {result?.method === 'keyword' ? <div style={{ fontSize: 12, color: '#aaa', textAlign: 'center', marginTop: 4 }}>{t('Đối chiếu bằng từ khoá (master chưa embed) — kết quả kém chính xác hơn.')}</div> : null}
      </Modal>
    </div>
  );
});

export function registerAiClassifyDeep({ flowEngine, variants, EditableItemModel, api, tExpr }: Deps) {
  if (!flowEngine || !variants?.length) { console.warn('[ai-column] classifyDeep: missing flowEngine/variants — skip'); return; }
  if (api) API = api;
  const te = (s: string) => (tExpr ? tExpr(s, { ns: NS }) : s);

  try {
    flowEngine.flowSettings?.registerComponents?.({ PtdlDeepAttributes, PtdlDeepRubric, PtdlDeepRubricRows, PtdlDeepDisplayFields, PtdlDeepExamples, PtdlDeepRoleHint, PtdlDeepFeedback, FormTab, 'FormTab.TabPane': FormTab.TabPane });
  } catch (e) {
    console.warn('[ai-column] classifyDeep: registerComponents failed', e);
  }

  const registered: any[] = [];
  for (const { Base, modelName, interfaces, label, relationMode } of variants) {
    if (!Base) continue;
    class AiClassifyDeepFieldModel extends Base {
      render() {
        const pp: any = (this as any).props || {};
        if (pp.pattern === 'readPretty' || pp.readOnly) return super.render();
        return <AiClassifyDeepEditable model={this} relationMode={!!relationMode} baseRender={() => super.render()} />;
      }
    }
    flowEngine.registerModels({ [modelName]: AiClassifyDeepFieldModel });
    try { (AiClassifyDeepFieldModel as any).registerFlow(aiClassifyDeepFlowConfig(te, !!relationMode)); } catch (e) { console.warn('[ai-column] classifyDeep: registerFlow failed', e); }
    try { (AiClassifyDeepFieldModel as any).define?.({ label }); } catch { /* optional */ }
    try { EditableItemModel?.bindModelToInterface?.(modelName, interfaces, { isDefault: false }); } catch (e) { console.warn('[ai-column] classifyDeep: bind failed', e); }
    registered.push(AiClassifyDeepFieldModel);
  }
  return registered;
}
