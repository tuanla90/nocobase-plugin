import React, { useRef, useState } from 'react';
import { Alert, Button, Checkbox, Input, Modal, Tag, Tooltip, message } from 'antd';
import { observer } from '@formily/react';
import { FormTab } from '@formily/antd-v5';
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

export type AiClassifyDeepVariant = { Base: any; modelName: string; interfaces: string[]; label: string };
type Deps = { flowEngine: any; variants: AiClassifyDeepVariant[]; EditableItemModel: any; api?: any; tExpr?: (s: string, opts?: any) => any };

let API: any = null;

/** Repeatable {name, description} rows — the attribute-extraction schema for THIS domain. */
export const PtdlDeepAttributes: React.FC<any> = observer((props: any) => {
  const rows: any[] = Array.isArray(props.value) ? props.value : [];
  const update = (i: number, patch: any) => { const n = rows.slice(); n[i] = { ...n[i], ...patch }; props.onChange?.(n); };
  const add = () => props.onChange?.([...rows, { name: '', description: '' }]);
  const rm = (i: number) => props.onChange?.(rows.filter((_: any, idx: number) => idx !== i));
  return (
    <div>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
          <span style={{ flex: '0 0 auto', width: 18, height: 18, borderRadius: 9, background: '#f0e9fb', color: '#7c3aed', fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
          <Input style={{ width: 180 }} placeholder={t('tên thuộc tính (vd: vat_lieu)')} value={r.name} onChange={(e) => update(i, { name: e.target.value })} />
          <Input style={{ flex: 1 }} placeholder={t('mô tả cho AI (vd: vật liệu chính, null nếu không có)')} value={r.description} onChange={(e) => update(i, { description: e.target.value })} />
          <Button danger type="text" onClick={() => rm(i)}>✕</Button>
        </div>
      ))}
      <Button type="dashed" onClick={add} style={{ width: '100%' }}>{t('+ Thêm thuộc tính')}</Button>
      {!rows.length ? <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>{t('AI sẽ trích các thuộc tính này từ input để chấm chính xác hơn (bỏ trống nếu không cần).')}</div> : null}
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

function aiClassifyDeepStepUiSchema(t: (s: string) => any) {
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
            aiMaster: { type: 'object', title: t('Bảng master (danh mục đối chiếu)'), 'x-decorator': 'FormItem', 'x-component': 'PtdlMasterCollectionSelect' },
            aiIndexHint: { type: 'void', 'x-decorator': 'FormItem', 'x-decorator-props': { style: { marginTop: -12, marginBottom: 8 } }, 'x-component': 'PtdlMasterIndexHint' },
            aiQueryFields: { type: 'array', title: t('Nội dung cần đối chiếu (cột trên bản ghi)'), 'x-decorator': 'FormItem', 'x-decorator-props': { tooltip: t('Chọn 1 hoặc NHIỀU cột trên bản ghi hiện tại; giá trị được ghép lại thành nội dung đem so khớp với master.') }, 'x-component': 'PtdlQueryFieldsMulti' },
            rowWrite: {
              type: 'void',
              'x-component': 'PtdlGrid',
              properties: {
                aiWriteField: { type: 'string', title: t('Chọn ứng viên xong → ghi cột nào vào ô?'), 'x-decorator': 'FormItem', 'x-decorator-props': { tooltip: t('Sau khi bạn chọn 1 ứng viên, lấy giá trị cột này CỦA ỨNG VIÊN ghi vào ô đang cấu hình. Thường chọn cột mã (vd maHs) để ghi mã số.') }, 'x-component': 'PtdlMasterColSelect' },
                aiTopK: { type: 'number', title: t('Số ứng viên xét (topK)'), 'x-decorator': 'FormItem', 'x-decorator-props': { tooltip: t('Số ứng viên gần nhất đem cho AI chấm. Nhiều hơn = kỹ hơn nhưng chậm/tốn token hơn (khuyên 10–15).') }, 'x-component': 'PtdlNumber' },
              },
            },
            aiDisplayFields: { type: 'array', title: t('Cột hiển thị trên thẻ ứng viên (chỉ để xem)'), 'x-decorator': 'FormItem', 'x-decorator-props': { tooltip: t('CHỈ để hiển thị cho bạn so sánh khi chọn — KHÔNG ảnh hưởng việc khớp. Vd: đường dẫn, chương, thuế, chính sách. Cột dạng “A › B › C” tự thành breadcrumb.') }, 'x-component': 'PtdlMasterColMulti' },
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
            aiRubric: { type: 'string', title: t('② Tiêu chí CHẤM ĐIỂM ứng viên (rubric)'), 'x-decorator': 'FormItem', 'x-decorator-props': { tooltip: t('Cách + trọng số để AI cho điểm mỗi ứng viên (vd chức năng 40đ, vật liệu 20đ…). Đây là bước CHẤM. Điểm & tiêu chí khớp/lệch hiện trên từng thẻ ứng viên. Bỏ trống = AI tự chấm tổng quát.') }, 'x-component': 'PtdlDeepRubric' },
            aiFeedback: { type: 'boolean', 'x-decorator': 'FormItem', 'x-component': 'PtdlDeepFeedback' },
          },
        },
      },
    },
  };
}

function aiClassifyDeepFlowConfig(te: (s: string) => any) {
  return {
    key: 'ptdlAiClassifyDeepSettings',
    sort: 554,
    title: te('AI'),
    steps: {
      ai: {
        title: te('AI phân loại chuyên sâu'),
        uiMode: { type: 'dialog', props: { width: 820 } },
        uiSchema: aiClassifyDeepStepUiSchema(te),
        defaultParams: { aiService: '', aiModel: '', aiMaster: {}, aiQueryFields: [], aiWriteField: '', aiDisplayFields: [], aiTopK: 15, aiRoleHint: '', aiAttributes: [], aiRubric: '', aiFeedback: true },
        handler(ctx: any, params: any) {
          ctx.model.setProps('aiService', params?.aiService || '');
          ctx.model.setProps('aiModel', params?.aiModel || '');
          ctx.model.setProps('aiMaster', params?.aiMaster || {});
          ctx.model.setProps('aiQueryFields', Array.isArray(params?.aiQueryFields) ? params.aiQueryFields : []);
          ctx.model.setProps('aiWriteField', params?.aiWriteField || '');
          ctx.model.setProps('aiDisplayFields', Array.isArray(params?.aiDisplayFields) ? params.aiDisplayFields : []);
          ctx.model.setProps('aiTopK', params?.aiTopK || 15);
          ctx.model.setProps('aiRoleHint', params?.aiRoleHint || '');
          ctx.model.setProps('aiAttributes', Array.isArray(params?.aiAttributes) ? params.aiAttributes : []);
          ctx.model.setProps('aiRubric', params?.aiRubric || '');
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

/** One candidate = structured card: rank + code chip + score pill + confidence dot + Pick, then
 *  breadcrumb path, other display fields, reasoning (collapsible), criteria tags, verify/policy. */
const CandidateCard: React.FC<any> = ({ c, rank, isTop, displayFields, writeField, onPick }) => {
  const st = scoreStyle(c.score || 0);
  const rec = c.record || {};
  const code = c.write || rec[writeField] || '';
  const others: string[] = (displayFields || []).filter((f: string) => f !== writeField);
  const pathField = others.find((f) => typeof rec[f] === 'string' && rec[f].includes('›'));
  const chips = others.filter((f) => f !== pathField && rec[f] != null && String(rec[f]).trim() !== '' && !String(rec[f]).includes('›'));
  const [openReason, setOpenReason] = useState(true);
  return (
    <div style={{ border: `1px solid ${isTop ? '#b39ddb' : '#ececec'}`, background: isTop ? '#faf7ff' : '#fff', borderRadius: 10, padding: '12px 14px', marginBottom: 10, boxShadow: isTop ? '0 1px 6px rgba(124,58,237,0.12)' : 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ flex: '0 0 auto', width: 22, height: 22, borderRadius: 11, background: isTop ? '#7c3aed' : '#eee', color: isTop ? '#fff' : '#888', fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{rank}</span>
        <code style={{ fontSize: 16, fontWeight: 700, color: '#4c1d95', background: '#f3effc', padding: '2px 8px', borderRadius: 6, letterSpacing: 0.3 }}>{code}</code>
        {isTop ? <Tag color="purple" style={{ marginInlineEnd: 0 }}>{t('Đề xuất')}</Tag> : null}
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
      {pathField ? <div style={{ margin: '8px 0 2px', fontSize: 13 }}><Breadcrumb path={rec[pathField]} /></div> : null}
      {chips.length ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '6px 0' }}>
          {chips.map((f) => <span key={f} style={{ fontSize: 12, color: '#595959', background: '#f5f5f5', border: '1px solid #eee', borderRadius: 4, padding: '1px 7px' }}>{String(rec[f])}</span>)}
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
export const AiClassifyDeepEditable: React.FC<{ model: any; baseRender: () => React.ReactNode }> = observer(({ model, baseRender }) => {
  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<any>(null);
  const p: any = model?.props || {};
  const master = p.aiMaster || {};
  const canGen = !!master.collection && Array.isArray(p.aiQueryFields) && p.aiQueryFields.length > 0;

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
      const writeTemplate = p.aiWriteField ? `{{${p.aiWriteField}}}` : undefined;
      const labelTemplate = Array.isArray(p.aiDisplayFields) && p.aiDisplayFields.length ? p.aiDisplayFields.map((c: string) => `{{${c}}}`).join(' - ') : undefined;
      const res = await API.request({
        url: 'ptdlAiColumn:classifyDeep',
        method: 'post',
        data: {
          query, masterCollection: master.collection, dataSourceKey: master.dataSourceKey || 'main',
          topK: p.aiTopK || 15, roleHint: p.aiRoleHint || undefined, rubric: p.aiRubric || undefined,
          attributes: Array.isArray(p.aiAttributes) ? p.aiAttributes.filter((a: any) => a?.name) : undefined,
          displayFields: Array.isArray(p.aiDisplayFields) && p.aiDisplayFields.length ? p.aiDisplayFields : undefined,
          labelTemplate, writeTemplate, llmService: p.aiService || undefined, model: p.aiModel || undefined,
        },
      });
      const d = res?.data?.data;
      if (!d?.candidates?.length) { message.info(t('Không tìm thấy ứng viên phù hợp.')); return; }
      setResult({ ...d, query });
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
    writeValue(c.write ?? c.label);
    setOpen(false);
    message.success(t('Đã chọn: {{label}}', { label: c.label }));
    if (p.aiFeedback !== false && result) {
      try {
        await API.request({
          url: 'ptdlAiColumn:classifyFeedback', method: 'post',
          data: { masterCollection: master.collection, query: result.query, selectedTk: c.tk, aiTopTk: result.best?.tk, aiTopScore: result.best?.score, candidates: (result.candidates || []).map((x: any) => ({ tk: x.tk, score: x.score })) },
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
                    <span style={{ color: '#999' }}>{k}:</span> <span style={{ color: '#333' }}>{String(v)}</span>
                  </span>
                ))}
              </div>
            </div>
          );
        })()}
        {result?.overallRecommendation ? <Alert type="info" showIcon style={{ marginBottom: 10 }} message={t('Tư vấn')} description={result.overallRecommendation} /> : null}
        {(result?.missingInfo || []).length ? <Alert type="warning" showIcon style={{ marginBottom: 10 }} message={t('Thiếu thông tin để chắc chắn')} description={<ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{(result.missingInfo || []).map((m: string, i: number) => <li key={i}>{m}</li>)}</ul>} /> : null}
        {cands.map((c: any, i: number) => (
          <CandidateCard key={c.tk ?? i} c={c} rank={i + 1} isTop={i === 0} displayFields={p.aiDisplayFields} writeField={p.aiWriteField} onPick={pick} />
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
    flowEngine.flowSettings?.registerComponents?.({ PtdlDeepAttributes, PtdlDeepRubric, PtdlDeepRoleHint, PtdlDeepFeedback, FormTab, 'FormTab.TabPane': FormTab.TabPane });
  } catch (e) {
    console.warn('[ai-column] classifyDeep: registerComponents failed', e);
  }

  const registered: any[] = [];
  for (const { Base, modelName, interfaces, label } of variants) {
    if (!Base) continue;
    class AiClassifyDeepFieldModel extends Base {
      render() {
        const pp: any = (this as any).props || {};
        if (pp.pattern === 'readPretty' || pp.readOnly) return super.render();
        return <AiClassifyDeepEditable model={this} baseRender={() => super.render()} />;
      }
    }
    flowEngine.registerModels({ [modelName]: AiClassifyDeepFieldModel });
    try { (AiClassifyDeepFieldModel as any).registerFlow(aiClassifyDeepFlowConfig(te)); } catch (e) { console.warn('[ai-column] classifyDeep: registerFlow failed', e); }
    try { (AiClassifyDeepFieldModel as any).define?.({ label }); } catch { /* optional */ }
    try { EditableItemModel?.bindModelToInterface?.(modelName, interfaces, { isDefault: false }); } catch (e) { console.warn('[ai-column] classifyDeep: bind failed', e); }
    registered.push(AiClassifyDeepFieldModel);
  }
  return registered;
}
