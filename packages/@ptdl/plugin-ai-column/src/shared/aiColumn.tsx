import React, { useEffect, useRef, useState } from 'react';
import { Button, Checkbox, Input, Select, Tooltip, message } from 'antd';
import { observer, useForm } from '@formily/react';
import { useFlowSettingsContext } from '@nocobase/flow-engine';
import { FieldTokenTextArea, SettingsGrid } from '@ptdl/shared';
import { NS, t } from './i18n';

/** Lucide "sparkles" icon (self-contained SVG, inherits color via currentColor). Exported for
 *  reuse by aiExtract.tsx's own button (same visual language, no need to duplicate). */
export const SparklesIcon: React.FC = () => (
  <svg
    width="1em"
    height="1em"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ display: 'block' }}
    aria-hidden="true"
  >
    <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.582a.5.5 0 0 1 0 .962L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0Z" />
    <path d="M20 3v4" />
    <path d="M22 5h-4" />
    <path d="M4 17v2" />
    <path d="M5 18H3" />
  </svg>
);

/** Field names referenced by {{token}} in the prompt (for the onDepChange trigger). */
export function extractDeps(prompt: string): string[] {
  const out: string[] = [];
  const re = /\{\{\s*([\w.$-]+)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(String(prompt || '')))) out.push(m[1]);
  return out;
}

/** A stable string of the current dep values, to detect changes. */
function depKey(deps: string[], values: Record<string, any>): string {
  return deps
    .map((d) => {
      const v = d.split('.').reduce((a: any, k: string) => (a == null ? undefined : a[k]), values);
      return v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    })
    .join('');
}

/**
 * @ptdl/plugin-ai-column — shared editable field model.
 *
 * `AiInputFieldModel extends InputFieldModel`: renders the normal antd input plus a ✨ button.
 * Clicking it collects the current row/form values, POSTs to `ptdlAiColumn:generate`, and writes
 * the returned value back into the field (the same way core's nanoid flow does — props.onChange).
 * The value is a plain stored text value; the user can still edit it and must Save the form.
 *
 * Bound (non-default) to text interfaces via `EditableItemModel.bindModelToInterface`, so users
 * switch a field's component to "AI input" in the field settings.
 */

/** One field type to wire "AI input" behavior onto — e.g. single-line Input, or Textarea. */
export type AiFieldVariant = {
  Base: any; // per-lane field model class (e.g. InputFieldModel, TextareaFieldModel)
  modelName: string; // registered name — bindModelToInterface + saved stepParams.fieldBinding.use reference this
  interfaces: string[]; // collection field interfaces this variant attaches to (non-default component)
  label: string; // shown in the "Field component" picker
};

type Deps = {
  flowEngine: any;
  variants: AiFieldVariant[];
  EditableItemModel: any; // from @nocobase/flow-engine — editable-model → interface registry
  api?: any; // apiClient
  tExpr?: (s: string, opts?: any) => any;
};

// Module-level apiClient + a tiny cache of enabled LLM services, shared by the settings pickers.
let API: any = null;
let SERVICES_CACHE: any[] | null = null;

async function loadServices(): Promise<any[]> {
  if (SERVICES_CACHE) return SERVICES_CACHE;
  if (!API) return [];
  try {
    const res = await API.request({ url: 'ai:listAllEnabledModels', method: 'get' });
    SERVICES_CACHE = res?.data?.data || [];
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[ai-column] loadServices failed', e);
    SERVICES_CACHE = [];
  }
  return SERVICES_CACHE || [];
}

/** Settings component: pick the LLM service (from the enabled services list). */
const PtdlLlmServiceSelect: React.FC<any> = observer((props: any) => {
  const [opts, setOpts] = useState<any[]>([]);
  useEffect(() => {
    let alive = true;
    loadServices().then((list) => {
      if (!alive) return;
      setOpts((list || []).map((s: any) => ({ label: s.llmServiceTitle || s.llmService, value: s.llmService })));
    });
    return () => {
      alive = false;
    };
  }, []);
  return (
    <Select
      allowClear
      showSearch
      optionFilterProp="label"
      style={{ width: '100%' }}
      placeholder={t('Chọn LLM service')}
      options={opts}
      value={props.value || undefined}
      onChange={(v) => props.onChange?.(v)}
      notFoundContent={opts.length ? undefined : t('Chưa có LLM service — vào Settings → AI để thêm')}
    />
  );
});

/** Settings component: pick the model for the chosen service (reacts to aiService). */
const PtdlLlmModelSelect: React.FC<any> = observer((props: any) => {
  const form = useForm();
  const svc = form?.values?.aiService;
  const [opts, setOpts] = useState<any[]>([]);
  useEffect(() => {
    let alive = true;
    loadServices().then((list) => {
      if (!alive) return;
      const s = (list || []).find((x: any) => x.llmService === svc);
      setOpts((s?.enabledModels || []).map((m: any) => ({ label: m.label || m.value, value: m.value })));
    });
    return () => {
      alive = false;
    };
  }, [svc]);
  return (
    <Select
      allowClear
      showSearch
      optionFilterProp="label"
      style={{ width: '100%' }}
      placeholder={svc ? t('Chọn model') : t('Chọn service trước')}
      options={opts}
      value={props.value || undefined}
      onChange={(v) => props.onChange?.(v)}
    />
  );
});

const OUTPUT_OPTS = [
  { label: 'Text (văn bản)', value: 'text' },
  { label: 'Number (số)', value: 'number' },
  { label: 'Single select (chọn 1 từ danh sách)', value: 'singleSelect' },
];

/** Output-type picker. Labels translated at render (module const is built before setRuntimeT). */
const PtdlAiOutputSelect: React.FC<any> = observer((props: any) => (
  <Select style={{ width: '100%' }} options={OUTPUT_OPTS.map((o) => ({ ...o, label: t(o.label) }))} value={props.value || 'text'} onChange={(v) => props.onChange?.(v)} />
));

/** Options as compact tags — type a value, press Enter (or paste comma/newline-separated text). */
const PtdlAiOptions: React.FC<any> = observer((props: any) => (
  <Select
    mode="tags"
    style={{ width: '100%' }}
    open={false}
    suffixIcon={null}
    tokenSeparators={[',', '\n']}
    placeholder={t('Gõ 1 lựa chọn rồi Enter — VD: Cao, Trung bình, Thấp')}
    value={Array.isArray(props.value) ? props.value : []}
    onChange={(v) => props.onChange?.(v)}
  />
));

/** Optional system prompt. Auto-expands as you type (2→10 rows) then scrolls — a fixed rows={2}
 *  scrolled after the 2nd line which felt cramped for multi-sentence instructions. */
const PtdlAiSystemInput: React.FC<any> = observer((props: any) => (
  <Input.TextArea
    autoSize={{ minRows: 2, maxRows: 10 }}
    value={props.value}
    onChange={(e) => props.onChange?.(e.target.value)}
    placeholder={t('(Tùy chọn) VD: Bạn là trợ lý viết tiếng Việt ngắn gọn, chuyên nghiệp.')}
  />
));

/** The prompt template + a field picker ("＋ Chèn cột") so users don't type field names. */
const PtdlAiPromptInput: React.FC<any> = observer((props: any) => {
  let coll: string | undefined;
  let dsk = 'main';
  try {
    const ctx: any = useFlowSettingsContext();
    const model: any = ctx?.model;
    coll =
      model?.context?.collectionField?.collectionName ||
      model?.collection?.name ||
      model?.context?.collection?.name;
    dsk =
      model?.context?.collectionField?.dataSourceKey ||
      model?.collection?.dataSourceKey ||
      model?.context?.collection?.dataSourceKey ||
      'main';
  } catch {
    /* no settings context — picker just stays disabled */
  }
  return (
    <FieldTokenTextArea
      value={props.value}
      onChange={props.onChange}
      api={API}
      collectionName={coll}
      dataSourceKey={dsk}
      format={(p) => `{{${p.join('.')}}}`}
      rows={5}
      placeholder={t('VD: Tóm tắt {{content}} trong 1 câu.')}
      hint={
        <>
          {t('Bấm')} <b>＋ Chèn cột</b> {t('để chèn field (khỏi nhớ tên), hoặc gõ tay')} <code>{'{{ten_field}}'}</code>.
        </>
      }
    />
  );
});

const TRIGGER_OPTS = [
  { label: 'Khi mở form & ô đang trống (client)', value: 'onOpenEmpty' },
  { label: 'Khi field nguồn thay đổi trong form (client)', value: 'onDepChange' },
  { label: 'Server: khi record được tạo/cập nhật (cả automation/API/bulk)', value: 'onServerUpdate' },
];

/** Normalize aiTrigger to an array — accepts old single-string data ('manual'/'onOpenEmpty'/...)
 *  from before this became multi-select ('manual' has no matching option → becomes []). */
export function triggerArray(v: any): string[] {
  if (Array.isArray(v)) return v;
  if (v && typeof v === 'string' && v !== 'manual') return [v];
  return [];
}

/** Which auto-triggers are active — multi-select. Nút ✨ thủ công LUÔN dùng được, bất kể chọn gì. */
const PtdlAiTriggerSelect: React.FC<any> = observer((props: any) => (
  <Select
    mode="multiple"
    style={{ width: '100%' }}
    options={TRIGGER_OPTS.map((o) => ({ ...o, label: t(o.label) }))}
    placeholder={t('(để trống = chỉ bấm ✨ thủ công)')}
    value={triggerArray(props.value)}
    onChange={(v) => props.onChange?.(v)}
  />
));

const GATE_OPS = [
  { label: '= bằng', value: 'eq' },
  { label: '≠ khác', value: 'ne' },
  { label: 'chứa', value: 'contains' },
  { label: 'đang trống', value: 'empty' },
  { label: 'không trống', value: 'notEmpty' },
];

/** Ready-made TEXT prompt templates — pick one to fill the Prompt field fast. `{{...}}` is a
 *  placeholder the user replaces with a real field via the "＋ Chèn cột" picker. */
const TEXT_TEMPLATES = [
  { label: 'Tóm tắt ngắn gọn', prompt: 'Tóm tắt ngắn gọn, súc tích bằng tiếng Việt nội dung sau:\n{{...}}' },
  { label: 'Viết lại chuyên nghiệp', prompt: 'Viết lại đoạn sau cho chuyên nghiệp, rõ ràng, giữ nguyên ý:\n{{...}}' },
  { label: 'Dịch sang tiếng Anh', prompt: 'Dịch sang tiếng Anh, tự nhiên:\n{{...}}' },
  { label: 'Phân loại cảm xúc', prompt: 'Phân loại cảm xúc (Tích cực / Trung lập / Tiêu cực) của nội dung sau, chỉ trả về nhãn:\n{{...}}' },
  { label: 'Trích từ khóa', prompt: 'Liệt kê 3–5 từ khóa chính (cách nhau bằng dấu phẩy) của:\n{{...}}' },
  { label: 'Sinh tiêu đề hấp dẫn', prompt: 'Viết 1 tiêu đề ngắn, hấp dẫn cho nội dung sau:\n{{...}}' },
];

/** A "pick to fill" menu: choosing a template writes its text into the `aiPrompt` field (overwrite).
 *  Controlled with value=undefined so it always resets to placeholder — behaves like an action menu,
 *  not a stored field. Shared shape reused by the image template picker (aiImage.tsx). */
export const PtdlTextTemplateSelect: React.FC<any> = observer(() => {
  const form = useForm();
  return (
    <Select
      allowClear
      showSearch
      optionFilterProp="label"
      style={{ width: '100%' }}
      placeholder={t('Chọn mẫu prompt để điền nhanh (ghi đè ô Prompt)…')}
      value={undefined}
      options={TEXT_TEMPLATES.map((tpl, i) => ({ label: t(tpl.label), value: String(i) }))}
      onChange={(v) => {
        if (v == null) return;
        const tpl = TEXT_TEMPLATES[Number(v)];
        if (tpl && form?.setValuesIn) form.setValuesIn('aiPrompt', t(tpl.prompt));
      }}
    />
  );
});

/** Cost gate for SERVER auto-run (#2): "only when target empty" + an optional simple field condition
 *  (e.g. only score a lead when status = new). antd-only + NO collection lookup (field typed by name)
 *  so it drops into any dialog + any lane. Value = { onlyWhenEmpty, condition:{field,op,value} }. */
export const PtdlAutorunGate: React.FC<any> = observer((props: any) => {
  const v = props.value || {};
  const cond = v.condition || {};
  const set = (patch: any) => props.onChange?.({ ...v, ...patch });
  const setCond = (patch: any) => set({ condition: { ...cond, ...patch } });
  const opNeedsValue = cond.op && cond.op !== 'empty' && cond.op !== 'notEmpty';
  return (
    <div>
      <Checkbox checked={!!v.onlyWhenEmpty} onChange={(e) => set({ onlyWhenEmpty: e.target.checked })}>
        {t('Chỉ chạy khi field đích đang trống (không sinh lại nếu đã có giá trị)')}
      </Checkbox>
      <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center' }}>
        <span style={{ color: '#888', flex: '0 0 auto' }}>{t('Chỉ chạy khi')}</span>
        <Input style={{ width: 130 }} placeholder={t('tên field')} value={cond.field} onChange={(e) => setCond({ field: e.target.value })} />
        <Select
          style={{ width: 120, flex: '0 0 auto' }}
          placeholder={t('điều kiện')}
          allowClear
          options={GATE_OPS.map((o) => ({ ...o, label: t(o.label) }))}
          value={cond.op || undefined}
          onChange={(op) => setCond({ op })}
        />
        {opNeedsValue ? <Input style={{ flex: 1 }} placeholder={t('giá trị')} value={cond.value} onChange={(e) => setCond({ value: e.target.value })} /> : null}
      </div>
      <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
        {t('Chỉ áp dụng cho trigger')} <b>{t('Server')}</b> {t('(để trống = luôn chạy).')}
      </div>
    </div>
  );
});

const tight = { style: { marginBottom: 8 } };

// Flat properties map (NOT wrapped in {type:'object', properties}) — the flow-settings dialog
// renders each key as a field. Every x-component is a custom-registered component (bare antd
// 'Select'/'Input.TextArea' are NOT in the flow-settings registry). `rowConnection`/`rowBehavior`
// are void grid wrappers pairing 2 fields per row to save vertical space.
export function aiStepUiSchema(t: (s: string) => any) {
  return {
    rowConnection: {
      type: 'void',
      'x-component': 'PtdlGrid',
      properties: {
        aiService: {
          type: 'string',
          title: t('Dịch vụ LLM'),
          'x-decorator': 'FormItem',
          'x-decorator-props': tight,
          'x-component': 'PtdlLlmServiceSelect',
        },
        aiModel: {
          type: 'string',
          title: t('Model'),
          'x-decorator': 'FormItem',
          'x-decorator-props': tight,
          'x-component': 'PtdlLlmModelSelect',
        },
      },
    },
    rowBehavior: {
      type: 'void',
      'x-component': 'PtdlGrid',
      properties: {
        aiOutputType: {
          type: 'string',
          title: t('Kiểu kết quả'),
          'x-decorator': 'FormItem',
          'x-decorator-props': tight,
          'x-component': 'PtdlAiOutputSelect',
        },
        aiTrigger: {
          type: 'array',
          title: t('Tự sinh khi'),
          'x-decorator': 'FormItem',
          'x-decorator-props': tight,
          'x-component': 'PtdlAiTriggerSelect',
        },
      },
    },
    aiOptions: {
      type: 'array',
      title: t('Lựa chọn (Chọn 1)'),
      'x-decorator': 'FormItem',
      'x-decorator-props': tight,
      'x-component': 'PtdlAiOptions',
      // Hide the whole field (not just disable it) when Output type isn't Single select —
      // must be a FUNCTION, not a {{$deps}} string (see nocobase-v2-uischema-reaction-gotcha).
      'x-reactions': (field: any) => {
        field.display = field.form?.values?.aiOutputType === 'singleSelect' ? 'visible' : 'hidden';
      },
    },
    aiSystem: {
      type: 'string',
      title: t('Câu lệnh hệ thống'),
      'x-decorator': 'FormItem',
      'x-decorator-props': tight,
      'x-component': 'PtdlAiSystemInput',
    },
    aiTemplate: { type: 'void', title: t('Mẫu prompt (tùy chọn)'), 'x-decorator': 'FormItem', 'x-decorator-props': tight, 'x-component': 'PtdlTextTemplateSelect' },
    aiPrompt: { type: 'string', title: t('Prompt'), 'x-decorator': 'FormItem', 'x-component': 'PtdlAiPromptInput' },
    aiGate: { type: 'object', title: t('Điều kiện chạy (tiết kiệm chi phí)'), 'x-decorator': 'FormItem', 'x-decorator-props': tight, 'x-component': 'PtdlAutorunGate' },
  };
}

/** Merge the saved record (edit/table) with live form values (create/unsaved edits). Exported —
 *  aiExtract.tsx's field model needs the exact same row-context gathering. */
export function collectValues(model: any): Record<string, any> {
  const ctx = model?.context || {};
  const record = ctx.record || {};
  let formValues: any = {};
  try {
    const form = ctx.form;
    if (form) {
      formValues =
        form.values || (typeof form.getFieldsValue === 'function' ? form.getFieldsValue() : {}) || {};
    }
  } catch {
    /* no form (table/detail) — record only */
  }
  return { ...record, ...formValues };
}

/** Accepts the current tags-array value, or legacy newline/comma-separated string data saved
 *  before Options became a tags Select. */
function parseOptions(raw: any): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((s) => String(s).trim()).filter(Boolean);
  return String(raw)
    .split(/\r?\n|,/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Options fallback: the field's own enum (select fields) when the user typed none. */
function fieldEnumOptions(model: any): string[] {
  try {
    const en = model?.context?.collectionField?.enum;
    if (Array.isArray(en)) return en.map((e: any) => (e && typeof e === 'object' ? e.value ?? e.label : e)).filter(Boolean);
  } catch {
    /* ignore */
  }
  return [];
}

const TRIGGER_LABEL: Record<string, string> = {
  onOpenEmpty: 'tự sinh khi mở form (ô trống)',
  onDepChange: 'tự sinh khi field nguồn đổi',
  onServerUpdate: 'tự sinh phía server khi record đổi (cả automation)',
};

// De-dupe server-side auto-run registration: only hit the API when a field's config actually
// changes (the editable renders often). fieldKey → last-synced signature; and which fields we've
// registered as server-run (so we only send `removeAutorun` when turning an existing one OFF).
const autorunSig = new Map<string, string>();
const autorunOn = new Set<string>();

/** Generic: keep ONE server-side auto-run rule in sync with a field's config. Deduped so it only
 *  hits the API when the config actually changes (editables re-render a lot). Shared by AI input/
 *  textarea (kind 'generate') and AI Extract (kind 'extract') — exported for the latter. */
export function syncAutorunRule(
  model: any,
  opts: { kind: string; targetField?: string; wantServer: boolean; config: any; dependsOn: string[] },
) {
  try {
    if (!API) return;
    const cf = model?.context?.collectionField;
    const collectionName = cf?.collectionName;
    const targetField = opts.targetField;
    if (!collectionName || !targetField) return;
    const dataSourceKey = cf?.dataSourceKey || 'main';
    const fieldKey = `${dataSourceKey}:${collectionName}.${targetField}.${opts.kind}`;

    if (opts.wantServer) {
      const sig = JSON.stringify({ config: opts.config, dependsOn: opts.dependsOn });
      if (autorunSig.get(fieldKey) === sig) return; // already in sync
      autorunSig.set(fieldKey, sig);
      autorunOn.add(fieldKey);
      API.request({
        url: 'ptdlAiColumn:setAutorun',
        method: 'post',
        data: { collectionName, dataSourceKey, targetField, kind: opts.kind, config: opts.config, dependsOn: opts.dependsOn, runOn: 'both' },
      }).catch(() => {});
    } else if (autorunOn.has(fieldKey)) {
      // Was registered, now turned off → remove.
      autorunOn.delete(fieldKey);
      autorunSig.delete(fieldKey);
      API.request({
        url: 'ptdlAiColumn:removeAutorun',
        method: 'post',
        data: { collectionName, dataSourceKey, targetField, kind: opts.kind },
      }).catch(() => {});
    }
  } catch {
    /* best-effort */
  }
}

/** Extract the server auto-run cost gate (#2) from the `aiGate` prop into the flat config shape the
 *  server reads (`onlyWhenEmpty` + `condition`). Shared by generate/extract/media syncers. Returns
 *  {} when nothing is set so it doesn't bloat the stored rule. */
export function gateConfig(p: any): { onlyWhenEmpty?: boolean; condition?: any } {
  const g = p?.aiGate || {};
  const out: any = {};
  if (g.onlyWhenEmpty) out.onlyWhenEmpty = true;
  const c = g.condition || {};
  if (c.field && c.op) out.condition = { field: c.field, op: c.op, value: c.value };
  return out;
}

/** Sync the 'generate' auto-run rule for an AI input/textarea field. */
function syncAutorun(model: any) {
  const p: any = model?.props || {};
  const prompt = String(p.aiPrompt || '');
  const cf = model?.context?.collectionField;
  syncAutorunRule(model, {
    kind: 'generate',
    targetField: cf?.name,
    wantServer: triggerArray(p.aiTrigger).includes('onServerUpdate') && !!prompt.trim(),
    config: {
      llmService: p.aiService || undefined,
      model: p.aiModel || undefined,
      system: p.aiSystem || undefined,
      prompt,
      output: { type: p.aiOutputType || 'text', options: parseOptions(p.aiOptions) },
      ...gateConfig(p),
    },
    dependsOn: extractDeps(prompt),
  });
}

/** The editable field renderer: base input + ✨ generate button (+ optional auto-trigger).
 *  Exported so the classic (/admin) Formily lane can reuse it via a thin `model`-shaped adapter
 *  (see aiColumnClassic.tsx) — it only ever touches `model.props`/`model.context.{record,form}`/
 *  `model.setProps`, none of which are flow-engine-specific. */
export const AiEditable: React.FC<{ model: any; baseRender: () => React.ReactNode }> = observer(
  ({ model, baseRender }) => {
    const [loading, setLoading] = useState(false);
    const loadingRef = useRef(false);
    const p: any = model?.props || {};
    const outputType = p.aiOutputType || 'text';
    const prompt = p.aiPrompt || '';
    const triggers = triggerArray(p.aiTrigger);
    const hasOpenEmpty = triggers.includes('onOpenEmpty');
    const hasDepChange = triggers.includes('onDepChange');
    const canGen = !!String(prompt).trim();

    const onGen = async () => {
      if (!API || loadingRef.current) {
        if (!API) message.error(t('AI: apiClient chưa sẵn sàng'));
        return;
      }
      loadingRef.current = true;
      setLoading(true);
      try {
        const values = collectValues(model);
        let options = parseOptions(p.aiOptions);
        if (outputType === 'singleSelect' && !options.length) options = fieldEnumOptions(model);
        const res = await API.request({
          url: 'ptdlAiColumn:generate',
          method: 'post',
          data: {
            llmService: p.aiService || undefined,
            model: p.aiModel || undefined,
            system: p.aiSystem || undefined,
            prompt,
            values,
            output: { type: outputType, options },
          },
        });
        const value = res?.data?.data?.value;
        if (value !== undefined && value !== null) {
          const out = outputType === 'number' ? value : String(value);
          // Set the field value exactly like core's nanoid flow (raw value → field onChange).
          if (typeof model.props?.onChange === 'function') model.props.onChange(out);
          try {
            model.setProps?.('value', out);
          } catch {
            /* ignore */
          }
        }
      } catch (e: any) {
        const msg =
          e?.response?.data?.errors?.[0]?.message || e?.response?.data?.message || e?.message || t('thất bại');
        message.error('AI: ' + msg);
      } finally {
        setLoading(false);
        loadingRef.current = false;
      }
    };
    // Keep effects calling the latest closure without re-subscribing each render.
    const genRef = useRef(onGen);
    genRef.current = onGen;

    // Keep the SERVER-side auto-run rule in sync with this field's config (registers/updates/removes
    // the rule so `onServerUpdate` fires on automation/API/bulk saves). De-duped inside syncAutorun.
    useEffect(() => {
      syncAutorun(model);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [p.aiTrigger, p.aiPrompt, p.aiService, p.aiModel, p.aiOutputType, p.aiSystem, p.aiOptions, p.aiGate]);

    // Trigger: onOpenEmpty — generate once on mount when the field is empty.
    const firedRef = useRef(false);
    useEffect(() => {
      if (!hasOpenEmpty || !canGen || firedRef.current) return;
      const v = model.props?.value;
      if (v == null || v === '') {
        firedRef.current = true;
        genRef.current();
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasOpenEmpty, canGen]);

    // Trigger: onDepChange — regenerate (debounced) when any {{field}} in the prompt changes.
    useEffect(() => {
      if (!hasDepChange || !canGen) return;
      const form = model.context?.form;
      if (!form?.subscribe) return;
      const deps = extractDeps(prompt);
      if (!deps.length) return;
      let last = '';
      try {
        last = depKey(deps, collectValues(model));
      } catch {
        /* ignore */
      }
      let timer: any;
      const id = form.subscribe(() => {
        let k = last;
        try {
          k = depKey(deps, collectValues(model));
        } catch {
          return;
        }
        if (k !== last) {
          last = k;
          clearTimeout(timer);
          timer = setTimeout(() => genRef.current(), 900);
        }
      });
      return () => {
        try {
          form.unsubscribe?.(id);
        } catch {
          /* ignore */
        }
        clearTimeout(timer);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasDepChange, prompt, canGen]);

    const auto = triggers.length > 0;
    const tooltipTitle = !canGen
      ? t('Chưa cấu hình prompt AI (mở field settings)')
      : auto
        ? t('Sinh giá trị bằng AI') + ' (' + triggers.map((k) => t(TRIGGER_LABEL[k])).filter(Boolean).join(', ') + ')'
        : t('Sinh giá trị bằng AI');
    return (
      <div style={{ display: 'flex', gap: 4, width: '100%', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>{baseRender()}</div>
        <Tooltip title={tooltipTitle}>
          <Button
            aria-label="AI generate"
            icon={<SparklesIcon />}
            loading={loading}
            disabled={!canGen || !!p.disabled}
            onClick={() => genRef.current()}
            style={{ flex: '0 0 auto', color: !canGen || p.disabled ? undefined : auto ? '#16a34a' : '#7c3aed' }}
          />
        </Tooltip>
      </div>
    );
  },
);

/** Same "AI generation" flow config for every variant (Input, Textarea, ...) — a fresh object
 *  per call since each gets registered on a DIFFERENT class. */
function aiFlowConfig(t: (s: string) => any) {
  return {
    key: 'ptdlAiSettings',
    sort: 550,
    title: t('AI'),
    steps: {
      ai: {
        title: t('AI sinh giá trị'),
        uiMode: { type: 'dialog', props: { width: 680 } },
        uiSchema: aiStepUiSchema(t),
        defaultParams: {
          aiService: '',
          aiModel: '',
          aiOutputType: 'text',
          aiOptions: [],
          aiSystem: '',
          aiPrompt: '',
          aiTrigger: [],
          aiGate: {},
        },
        // Client-only setProps (safe as an auto-flow handler — no API writes here).
        handler(ctx: any, params: any) {
          ctx.model.setProps('aiService', params?.aiService || '');
          ctx.model.setProps('aiModel', params?.aiModel || '');
          ctx.model.setProps('aiOutputType', params?.aiOutputType || 'text');
          ctx.model.setProps('aiOptions', parseOptions(params?.aiOptions));
          ctx.model.setProps('aiSystem', params?.aiSystem || '');
          ctx.model.setProps('aiPrompt', params?.aiPrompt || '');
          ctx.model.setProps('aiTrigger', Array.isArray(params?.aiTrigger) ? params.aiTrigger : []);
          ctx.model.setProps('aiGate', params?.aiGate || {});
        },
      },
    },
  };
}

/** Every settings-dialog sub-component the "AI generation" schema (`aiStepUiSchema`) references
 *  by name. Shared between /v/ (`flowEngine.flowSettings.registerComponents`) and classic
 *  (`app.addComponents`) — same components, same x-component-name strings, same uiSchema. */
export const AI_SETTINGS_COMPONENTS = {
  PtdlLlmServiceSelect,
  PtdlLlmModelSelect,
  PtdlAiOutputSelect,
  PtdlAiOptions,
  PtdlAiSystemInput,
  PtdlAiPromptInput,
  PtdlAiTriggerSelect,
  PtdlAutorunGate,
  PtdlTextTemplateSelect,
  // 2-col grid wrapper (void) that pairs two fields on one line — now the shared SettingsGrid,
  // registered under the same `PtdlGrid` name so every uiSchema x-component string keeps resolving.
  PtdlGrid: SettingsGrid,
};

export function registerAiColumn({ flowEngine, variants, EditableItemModel, api, tExpr }: Deps) {
  if (!flowEngine || !variants?.length) {
    // eslint-disable-next-line no-console
    console.warn('[ai-column] missing flowEngine or variants — skip', { flowEngine: !!flowEngine, variants: variants?.length });
    return;
  }
  if (api) API = api;
  // Framework-compiled translator (→ {{t("key",{ns})}}) for flow/step/uiSchema titles + labels.
  const te = (s: string) => (tExpr ? tExpr(s, { ns: NS }) : s);

  try {
    flowEngine.flowSettings?.registerComponents?.(AI_SETTINGS_COMPONENTS);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[ai-column] registerComponents failed', e);
  }

  const registered: any[] = [];
  for (const { Base, modelName, interfaces, label } of variants) {
    if (!Base) {
      // eslint-disable-next-line no-console
      console.warn('[ai-column] variant missing Base — skip', modelName);
      continue;
    }

    class AiFieldModel extends Base {
      render() {
        const p: any = (this as any).props || {};
        // In read-only / readPretty (table cell, detail) just show the stored value.
        if (p.pattern === 'readPretty' || p.readOnly) {
          return super.render();
        }
        return <AiEditable model={this} baseRender={() => super.render()} />;
      }
    }

    flowEngine.registerModels({ [modelName]: AiFieldModel });

    try {
      (AiFieldModel as any).registerFlow(aiFlowConfig(te));
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[ai-column] registerFlow failed', modelName, e);
    }

    try {
      (AiFieldModel as any).define?.({ label });
    } catch {
      /* define optional */
    }

    // Make it a switchable (non-default) editable component for its interfaces. The textarea variant
    // subclasses TextareaFieldModel, whose auto-expand lives on CORE's binding defaultProps (not
    // inherited by our subclass binding) — replicate it so switching to "AI văn bản" keeps the box
    // growing 3→14 rows instead of scrolling at 2 lines.
    try {
      const bindOpts: any = { isDefault: false };
      if (interfaces.includes('textarea')) bindOpts.defaultProps = { autoSize: { minRows: 3, maxRows: 14 } };
      EditableItemModel?.bindModelToInterface?.(modelName, interfaces, bindOpts);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[ai-column] bind failed', modelName, e);
    }

    registered.push(AiFieldModel);
  }

  return registered;
}
