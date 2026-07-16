import React, { useEffect, useRef, useState } from 'react';
import { Button, Checkbox, Input, InputNumber, List, Modal, Select, Tag, Tooltip, message } from 'antd';
import { observer, useForm } from '@formily/react';
import { FormTab } from '@formily/antd-v5';
import { useFlowSettingsContext } from '@nocobase/flow-engine';
import { SparklesIcon, collectValues } from './aiColumn';
import { FieldTokenTextArea } from '@ptdl/shared';
import { NS, t } from './i18n';

/**
 * @ptdl/plugin-ai-column — "AI Phân loại" (Block B, surface 2): match this field's value to ONE row
 * of a MASTER collection using vector embedding + LLM re-rank (server `ptdlAiColumn:classify`), then
 * write the picked code into THIS field. Bound (non-default) onto a plain text/code field — e.g. an
 * "HS code" or "Mã SP" field that should be filled by classifying a {{description}} query against a
 * master catalog. The ✨ button classifies → shows a candidate picker (label + score + reasoning) →
 * writes the chosen candidate's `write` value. Optional auto-pick when confidence ≥ threshold.
 *
 * The master must be embedded first — the config dialog has an "Embed master now" button (calls
 * `ptdlAiColumn:embedMaster`). The SAME `classify` action is reused per-row by AI Multi-row Extract
 * (surface 1) so báo-giá lines can be matched to product codes.
 */

export type AiClassifyVariant = { Base: any; modelName: string; interfaces: string[]; label: string };

type Deps = { flowEngine: any; variants: AiClassifyVariant[]; EditableItemModel: any; api?: any; tExpr?: (s: string, opts?: any) => any };

let API: any = null;

/** Tiny client-side {{token}} renderer (server has its own; here we only need it to build the query
 *  string from the current record before calling classify). */
function renderTokens(tpl: string, values: Record<string, any>): string {
  if (!tpl) return '';
  return String(tpl).replace(/\{\{\s*([\w.$-]+)\s*\}\}/g, (_m, path) => {
    const v = String(path).split('.').reduce((a: any, k: string) => (a == null ? undefined : a[k]), values);
    if (v == null) return '';
    return typeof v === 'object' ? JSON.stringify(v) : String(v);
  });
}

function useCurrentCollection(): { coll?: string; dsk: string } {
  let coll: string | undefined;
  let dsk = 'main';
  try {
    const ctx: any = useFlowSettingsContext();
    const model: any = ctx?.model;
    const cf = model?.context?.collectionField;
    coll = cf?.collectionName || model?.context?.blockModel?.collection?.name;
    dsk = cf?.dataSourceKey || 'main';
  } catch {
    /* no ctx */
  }
  return { coll, dsk };
}

/** Master collection picker — lists non-system collections. Stores {collection, dataSourceKey, title}. */
export const PtdlMasterCollectionSelect: React.FC<any> = observer((props: any) => {
  const [opts, setOpts] = useState<any[]>([]);
  const val = props.value || {};
  useEffect(() => {
    let alive = true;
    if (!API) return;
    API.request({ url: 'collections:list', params: { paginate: false } })
      .then((res: any) => {
        if (!alive) return;
        const list = res?.data?.data || [];
        const cleaned = list
          .filter((c: any) => c?.name && !c.hidden && c.template !== 'view')
          .map((c: any) => ({ value: c.name, label: `${c.title || c.name} (${c.name})` }));
        setOpts(cleaned);
      })
      .catch(() => setOpts([]));
    return () => {
      alive = false;
    };
  }, []);
  return (
    <Select
      style={{ width: '100%' }}
      showSearch
      optionFilterProp="label"
      placeholder={t('Chọn bảng master (danh mục để đối chiếu)')}
      options={opts}
      value={val.collection || undefined}
      onChange={(collection) => props.onChange?.({ collection, dataSourceKey: 'main', title: opts.find((o) => o.value === collection)?.label })}
    />
  );
});

/** A {{token}} textarea whose tokens come from the MASTER collection (read from sibling
 *  `aiMaster.collection`). Reused for the embed-text, label and write templates. */
export const PtdlMasterTokenArea: React.FC<any> = observer((props: any) => {
  const form = useForm();
  // `aiMaster` in the AI-Classify dialog; `aiClfMaster` when reused inside AI-Multi-row-Extract.
  const master = form?.values?.aiClfMaster || form?.values?.aiMaster || {};
  return (
    <FieldTokenTextArea
      value={props.value}
      onChange={props.onChange}
      api={API}
      collectionName={master.collection}
      dataSourceKey={master.dataSourceKey || 'main'}
      format={(p) => `{{${p.join('.')}}}`}
      rows={2}
      placeholder={props.placeholder || t('Chọn bảng master trước, rồi chèn cột của bảng đó')}
    />
  );
});

/** The query template — tokens come from the CURRENT record (e.g. {{moTa}}). */
export const PtdlClassifyQuery: React.FC<any> = observer((props: any) => {
  const { coll, dsk } = useCurrentCollection();
  return (
    <FieldTokenTextArea
      value={props.value}
      onChange={props.onChange}
      api={API}
      collectionName={coll}
      dataSourceKey={dsk}
      format={(p) => `{{${p.join('.')}}}`}
      rows={2}
      placeholder={t('VD: {{ten}} {{moTa}} — nội dung cần đem đi đối chiếu')}
    />
  );
});

/** "Embed master now" — builds the vector cache for the chosen master so classify has something to
 *  search. Reads the current dialog form values; safe to press repeatedly (idempotent server-side). */
export const PtdlEmbedButton: React.FC<any> = observer(() => {
  const form = useForm();
  const [loading, setLoading] = useState(false);
  const onEmbed = async (force: boolean) => {
    const v = form?.values || {};
    const master = v.aiMaster || {};
    if (!master.collection) return message.warning(t('Chọn bảng master trước.'));
    if (!v.aiTextTemplate) return message.warning(t('Nhập "Nội dung đem embed" trước.'));
    if (!API) return message.error(t('AI: apiClient chưa sẵn sàng'));
    setLoading(true);
    try {
      const res = await API.request({
        url: 'ptdlAiColumn:embedMaster',
        method: 'post',
        data: { masterCollection: master.collection, dataSourceKey: master.dataSourceKey || 'main', textTemplate: v.aiTextTemplate, llmService: v.aiService || undefined, embedModel: v.aiEmbedModel || undefined, force },
      });
      const d = res?.data?.data || {};
      message.success(t('Đã embed {{n}}/{{total}} dòng của bảng master.', { n: d.embedded ?? 0, total: d.total ?? 0 }));
    } catch (e: any) {
      message.error('AI: ' + (e?.response?.data?.errors?.[0]?.message || e?.message || t('thất bại')));
    } finally {
      setLoading(false);
    }
  };
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <Button loading={loading} onClick={() => onEmbed(false)}>
        {t('Embed master ngay (chỉ dòng mới/đổi)')}
      </Button>
      <Button loading={loading} onClick={() => onEmbed(true)}>
        {t('Embed lại toàn bộ')}
      </Button>
    </div>
  );
});

const CLF_SCALAR = new Set(['string', 'text', 'integer', 'bigInt', 'float', 'double', 'decimal', 'boolean', 'date']);

/** Multi-select of the CURRENT record's scalar columns → the text to classify (joined). Replaces the
 *  free {{token}} box — you almost always just combine a couple of fields (name + description). */
export const PtdlQueryFieldsMulti: React.FC<any> = observer((props: any) => {
  const { coll, dsk } = useCurrentCollection();
  const [opts, setOpts] = useState<any[]>([]);
  useEffect(() => {
    let alive = true;
    if (coll) getFields(API, coll, dsk).then((f) => alive && setOpts((f || []).filter((x: any) => !x.isForeignKey && CLF_SCALAR.has(x?.type)).map((x: any) => ({ value: x.name, label: x.uiSchema?.title || x.name }))));
    else setOpts([]);
    return () => {
      alive = false;
    };
  }, [coll, dsk]);
  return <Select mode="multiple" style={{ width: '100%' }} showSearch optionFilterProp="label" options={opts} value={Array.isArray(props.value) ? props.value : []} onChange={(v) => props.onChange?.(v)} placeholder={t('Chọn cột trên bản ghi để đem đối chiếu (vd: tên, mô tả)')} />;
});

/** Dropdown(s) of the MASTER's scalar columns. `mode='multiple'` → several columns joined for display. */
function makeMasterColSelect(multiple: boolean): React.FC<any> {
  return observer((props: any) => {
    const form = useForm();
    const master = form?.values?.aiMaster || {};
    const [opts, setOpts] = useState<any[]>([]);
    useEffect(() => {
      let alive = true;
      if (master.collection) getFields(API, master.collection, master.dataSourceKey || 'main').then((f) => alive && setOpts((f || []).filter((x: any) => !x.isForeignKey && CLF_SCALAR.has(x?.type)).map((x: any) => ({ value: x.name, label: (x.uiSchema?.title || x.name) + ' (' + x.name + ')' }))));
      else setOpts([]);
      return () => {
        alive = false;
      };
    }, [master.collection]);
    return (
      <Select
        style={{ width: '100%' }}
        allowClear
        showSearch
        optionFilterProp="label"
        mode={multiple ? 'multiple' : undefined}
        options={opts}
        value={multiple ? (Array.isArray(props.value) ? props.value : []) : props.value || undefined}
        onChange={(v) => props.onChange?.(v)}
        placeholder={master.collection ? (multiple ? t('Chọn cột để hiển thị ứng viên') : t('Chọn cột mã để ghi vào field')) : t('Chọn bảng master trước')}
      />
    );
  });
}
export const PtdlMasterColSelect = makeMasterColSelect(false);
export const PtdlMasterColMulti = makeMasterColSelect(true);

/** Index-status line for the chosen master — vector index lives in Settings → AI Providers, NOT here. */
export const PtdlMasterIndexHint: React.FC<any> = observer(() => {
  const form = useForm();
  const master = form?.values?.aiMaster || {};
  const [info, setInfo] = useState<any>(null);
  useEffect(() => {
    let alive = true;
    if (API && master.collection)
      API.request({ url: 'ptdlAiColumn:classifyStatus', method: 'post', data: {} })
        .then((res: any) => alive && setInfo((res?.data?.data || []).find((s: any) => s.masterCollection === master.collection) || { count: 0 }))
        .catch(() => {});
    else setInfo(null);
    return () => {
      alive = false;
    };
  }, [master.collection]);
  if (!master.collection) return null;
  return info?.count ? (
    <div style={{ fontSize: 12, color: '#16a34a' }}>{t('✓ Bảng {{tb}} đã có chỉ mục ({{n}} dòng). Quản lý chỉ mục ở Settings → Nhà cung cấp AI.', { tb: master.collection, n: info.count })}</div>
  ) : (
    <div style={{ fontSize: 12, color: '#d97706' }}>{t('⚠ Bảng {{tb}} CHƯA embed → sẽ khớp từ khoá (kém chính xác). Tạo chỉ mục ở Settings → Nhà cung cấp AI.', { tb: master.collection })}</div>
  );
});

function aiClassifyStepUiSchema(t: (s: string) => any) {
  // Flat + dropdowns. Embedding the master is managed centrally (Settings → AI Providers), NOT here —
  // this field only points at a master and defines query / write / display / rules.
  return {
    aiMaster: { type: 'object', title: t('Bảng master (danh mục đối chiếu)'), 'x-decorator': 'FormItem', 'x-component': 'PtdlMasterCollectionSelect' },
    aiIndexHint: { type: 'void', 'x-decorator': 'FormItem', 'x-decorator-props': { style: { marginTop: -12, marginBottom: 8 } }, 'x-component': 'PtdlMasterIndexHint' },
    aiQueryFields: { type: 'array', title: t('Nội dung cần đối chiếu (cột trên bản ghi)'), 'x-decorator': 'FormItem', 'x-component': 'PtdlQueryFieldsMulti' },
    rowWrite: {
      type: 'void',
      'x-component': 'PtdlGrid',
      properties: {
        aiWriteField: { type: 'string', title: t('Ghi mã vào field (cột master)'), 'x-decorator': 'FormItem', 'x-component': 'PtdlMasterColSelect' },
        aiLabelFields: { type: 'array', title: t('Hiển thị ứng viên (cột master)'), 'x-decorator': 'FormItem', 'x-component': 'PtdlMasterColMulti' },
      },
    },
    aiAuto: { type: 'object', title: t('Tự chọn đáp án tốt nhất'), 'x-decorator': 'FormItem', 'x-component': 'PtdlAutoPick' },
    aiRerank: { type: 'boolean', 'x-decorator': 'FormItem', 'x-component': 'PtdlRerankToggle' },
    rowAdv: {
      type: 'void',
      'x-component': 'PtdlGrid',
      properties: {
        aiService: { type: 'string', title: t('Dịch vụ LLM'), 'x-decorator': 'FormItem', 'x-component': 'PtdlLlmServiceSelect' },
        aiModel: { type: 'string', title: t('Model (chấm điểm)'), 'x-decorator': 'FormItem', 'x-component': 'PtdlLlmModelSelect' },
      },
    },
    aiTopK: { type: 'number', title: t('Số ứng viên xét (topK)'), 'x-decorator': 'FormItem', 'x-component': 'PtdlNumber' },
  };
}

/** Small antd number + auto-pick + rerank-toggle components (distinct names). */
export const PtdlNumber: React.FC<any> = observer((props: any) => (
  <InputNumber style={{ width: 140 }} min={1} max={30} value={props.value ?? 8} onChange={(v) => props.onChange?.(v)} />
));
export const PtdlAutoPick: React.FC<any> = observer((props: any) => {
  const v = props.value || {};
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <Checkbox checked={!!v.enabled} onChange={(e) => props.onChange?.({ ...v, enabled: e.target.checked })}>
        {t('Tự ghi đáp án tốt nhất nếu điểm ≥')}
      </Checkbox>
      <InputNumber min={0} max={100} value={v.threshold ?? 80} onChange={(n) => props.onChange?.({ ...v, threshold: n })} addonAfter="%" />
      <span style={{ color: '#999', fontSize: 12 }}>{t('(dưới ngưỡng → hiện danh sách để chọn tay)')}</span>
    </div>
  );
});
export const PtdlRerankToggle: React.FC<any> = observer((props: any) => (
  <Tooltip title={t('Bật: AI đọc & chấm lại + giải thích (chính xác hơn, có lý do trong danh sách). Tắt: chỉ dùng vector (nhanh hơn, không có điểm/lý do LLM).')}>
    <Checkbox checked={props.value !== false} onChange={(e) => props.onChange?.(e.target.checked)}>
      {t('AI chấm kỹ + giải thích (rerank)')}
    </Checkbox>
  </Tooltip>
));

function aiClassifyFlowConfig(t: (s: string) => any) {
  return {
    key: 'ptdlAiClassifySettings',
    sort: 553,
    title: t('AI'),
    steps: {
      ai: {
        title: t('AI phân loại'),
        uiMode: { type: 'dialog', props: { width: 760 } },
        uiSchema: aiClassifyStepUiSchema(t),
        defaultParams: { aiService: '', aiModel: '', aiMaster: {}, aiTextTemplate: '', aiQuery: '', aiLabelTemplate: '', aiWriteTemplate: '', aiTopK: 8, aiEmbedModel: '', aiAuto: { enabled: false, threshold: 80 }, aiRerank: true },
        handler(ctx: any, params: any) {
          for (const k of ['aiService', 'aiModel', 'aiTextTemplate', 'aiQuery', 'aiLabelTemplate', 'aiWriteTemplate', 'aiEmbedModel']) ctx.model.setProps(k, params?.[k] || '');
          ctx.model.setProps('aiMaster', params?.aiMaster || {});
          ctx.model.setProps('aiTopK', params?.aiTopK || 8);
          ctx.model.setProps('aiAuto', params?.aiAuto || { enabled: false, threshold: 80 });
          ctx.model.setProps('aiRerank', params?.aiRerank !== false);
        },
      },
    },
  };
}

/** Base render + ✨ classify button + candidate picker modal. */
export const AiClassifyEditable: React.FC<{ model: any; baseRender: () => React.ReactNode }> = observer(({ model, baseRender }) => {
  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [candidates, setCandidates] = useState<any[]>([]);
  const p: any = model?.props || {};
  const master = p.aiMaster || {};
  const canGen = !!master.collection && !!String(p.aiQuery || '').trim();

  const writeValue = (val: any) => {
    if (val == null) return;
    const out = String(val);
    if (typeof model.props?.onChange === 'function') model.props.onChange(out);
    try {
      model.setProps?.('value', out);
    } catch {
      /* ignore */
    }
  };

  const onClassify = async () => {
    if (!API || loadingRef.current) {
      if (!API) message.error(t('AI: apiClient chưa sẵn sàng'));
      return;
    }
    loadingRef.current = true;
    setLoading(true);
    try {
      const values = collectValues(model);
      const query = renderTokens(String(p.aiQuery || ''), values).trim();
      if (!query) {
        message.info(t('Nội dung đối chiếu đang trống (kiểm tra field nguồn).'));
        return;
      }
      const res = await API.request({
        url: 'ptdlAiColumn:classify',
        method: 'post',
        data: {
          query,
          masterCollection: master.collection,
          dataSourceKey: master.dataSourceKey || 'main',
          labelTemplate: p.aiLabelTemplate || undefined,
          writeTemplate: p.aiWriteTemplate || undefined,
          topK: p.aiTopK || 8,
          rerank: p.aiRerank !== false,
          llmService: p.aiService || undefined,
          model: p.aiModel || undefined,
          embedModel: p.aiEmbedModel || undefined,
        },
      });
      const d = res?.data?.data || {};
      const cands: any[] = d.candidates || [];
      if (!cands.length) {
        message.info(t('Không tìm thấy ứng viên phù hợp.'));
        return;
      }
      const auto = p.aiAuto || {};
      if (auto.enabled && (d.confidence ?? 0) >= (auto.threshold ?? 80)) {
        writeValue(d.best?.write ?? d.best?.label);
        message.success(t('Đã tự chọn: {{label}} ({{score}} điểm)', { label: d.best?.label, score: d.best?.score }));
        return;
      }
      setCandidates(cands);
      setModalOpen(true);
    } catch (e: any) {
      message.error('AI: ' + (e?.response?.data?.errors?.[0]?.message || e?.response?.data?.message || e?.message || t('thất bại')));
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  };
  const genRef = useRef(onClassify);
  genRef.current = onClassify;

  const pick = (c: any) => {
    writeValue(c.write ?? c.label);
    setModalOpen(false);
    message.success(t('Đã chọn: {{label}}', { label: c.label }));
  };

  return (
    <div style={{ display: 'flex', gap: 4, width: '100%', alignItems: 'flex-start' }}>
      <div style={{ flex: 1, minWidth: 0 }}>{baseRender()}</div>
      <Tooltip title={!canGen ? t('Chưa cấu hình: chọn bảng master + nội dung đối chiếu (mở field settings)') : t('Phân loại/đối chiếu bằng AI rồi chọn đáp án')}>
        <Button
          aria-label="AI classify"
          icon={<SparklesIcon />}
          loading={loading}
          disabled={!canGen}
          onClick={() => genRef.current()}
          style={{ flex: '0 0 auto', color: !canGen ? undefined : '#7c3aed' }}
        />
      </Tooltip>
      <Modal open={modalOpen} onCancel={() => setModalOpen(false)} footer={null} title={t('Chọn đáp án khớp nhất')} width={600}>
        <List
          dataSource={candidates}
          renderItem={(c: any) => (
            <List.Item
              style={{ cursor: 'pointer' }}
              onClick={() => pick(c)}
              actions={[<Button type="link" key="pick">{t('Chọn')}</Button>]}
            >
              <List.Item.Meta
                title={
                  <span>
                    {c.label} <Tag color={c.score >= 80 ? 'green' : c.score >= 50 ? 'orange' : 'default'}>{c.score} {t('điểm')}</Tag>
                  </span>
                }
                description={c.reasoning}
              />
            </List.Item>
          )}
        />
      </Modal>
    </div>
  );
});

export function registerAiClassify({ flowEngine, variants, EditableItemModel, api, tExpr }: Deps) {
  if (!flowEngine || !variants?.length) {
    // eslint-disable-next-line no-console
    console.warn('[ai-column] classify: missing flowEngine or variants — skip');
    return;
  }
  if (api) API = api;
  const te = (s: string) => (tExpr ? tExpr(s, { ns: NS }) : s);

  try {
    flowEngine.flowSettings?.registerComponents?.({
      PtdlMasterCollectionSelect,
      PtdlMasterTokenArea,
      PtdlClassifyQuery,
      PtdlEmbedButton,
      PtdlNumber,
      PtdlPlainInput,
      PtdlAutoPick,
      PtdlRerankToggle,
      FormTab,
      'FormTab.TabPane': FormTab.TabPane,
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[ai-column] classify: registerComponents failed', e);
  }

  const registered: any[] = [];
  for (const { Base, modelName, interfaces, label } of variants) {
    if (!Base) continue;
    class AiClassifyFieldModel extends Base {
      render() {
        const pp: any = (this as any).props || {};
        if (pp.pattern === 'readPretty' || pp.readOnly) return super.render();
        return <AiClassifyEditable model={this} baseRender={() => super.render()} />;
      }
    }
    flowEngine.registerModels({ [modelName]: AiClassifyFieldModel });
    try {
      (AiClassifyFieldModel as any).registerFlow(aiClassifyFlowConfig(te));
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[ai-column] classify: registerFlow failed', modelName, e);
    }
    try {
      (AiClassifyFieldModel as any).define?.({ label });
    } catch {
      /* optional */
    }
    try {
      EditableItemModel?.bindModelToInterface?.(modelName, interfaces, { isDefault: false });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[ai-column] classify: bind failed', modelName, e);
    }
    registered.push(AiClassifyFieldModel);
  }
  return registered;
}
