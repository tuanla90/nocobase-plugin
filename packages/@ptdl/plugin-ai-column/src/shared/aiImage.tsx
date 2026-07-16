import React, { useEffect, useRef, useState } from 'react';
import { Button, Input, Select, Tooltip, message } from 'antd';
import { observer, useForm } from '@formily/react';
import { useFlowSettingsContext } from '@nocobase/flow-engine';
import { getFields } from '@ptdl/shared';
import { SparklesIcon, collectValues, syncAutorunRule, extractDeps, triggerArray, gateConfig, PtdlAutorunGate } from './aiColumn';
import { NS, t } from './i18n';

/**
 * @ptdl/plugin-ai-column — media GENERATION into an attachment field (image + voice). Mirror-image
 * of AI Extract: Extract READS an attachment (→ fills other fields); this GENERATES media (→ fills
 * its OWN attachment value). Reuses the server actions `ptdlAiColumn:generateImage` /
 * `:generateVoice`, which call the provider's REST media API (plugin-ai reuse is chat-only) and
 * save the bytes as a real NocoBase attachment.
 *
 * `registerAiImage` and `registerAiVoice` share one parameterized editable + register core
 * (`registerMediaGen`) — they differ only in the server endpoint, the extra request fields, the
 * settings schema, and the toast wording. Bound (non-default) to the same attachment interfaces as
 * AI Extract, so a field's "Field component" picker lists Input / AI extract / AI image / AI voice.
 */

export type AiMediaVariant = {
  Base: any; // UploadFieldModel | AttachmentURLFieldModel (per-lane import)
  modelName: string;
  interfaces: string[];
  label: string;
  /** true for AttachmentURLFieldModel (value is a bare url STRING); false for the belongsToMany
   *  `attachment` interface (value is an ARRAY of attachment records). */
  urlMode?: boolean;
};

type Deps = {
  flowEngine: any;
  variants: AiMediaVariant[];
  EditableItemModel: any;
  api?: any;
  tExpr?: (s: string, opts?: any) => any;
};

/** What makes one media kind different from another. */
export type MediaSpec = {
  endpoint: string; // server action, e.g. 'ptdlAiColumn:generateImage'
  buildData: (p: any) => Record<string, any>; // extra request fields beyond {prompt, values}
  doneMsg: string; // success toast
  tipReady: string; // button tooltip when a prompt is configured
  color: string; // ✨ button colour
  autorunKind: 'image' | 'voice'; // server auto-run rule kind (onServerUpdate trigger)
  // #5 img2img: name of the prop holding a "source image field" (image only) — its current value is
  // sent as input so the model EDITS it. undefined for voice.
  sourceFieldProp?: string;
};

let API: any = null;

/* ----------------------------- shared editable ----------------------------- */

const MediaGenEditable: React.FC<{ model: any; baseRender: () => React.ReactNode; urlMode?: boolean; spec: MediaSpec }> = observer(
  ({ model, baseRender, urlMode, spec }) => {
    const [loading, setLoading] = useState(false);
    const loadingRef = useRef(false);
    const p: any = model?.props || {};
    const prompt = p.aiPrompt || '';
    const canGen = !!String(prompt).trim();

    // Keep the server-side auto-run rule in sync with this field's config (fires on
    // automation/API/bulk saves — the only trigger that makes sense for media generation). No-op
    // unless the user ticked the "Server" trigger; de-duped inside syncAutorunRule.
    const cf = model?.context?.collectionField;
    useEffect(() => {
      const imageSource = spec.sourceFieldProp ? p[spec.sourceFieldProp] || undefined : undefined;
      syncAutorunRule(model, {
        kind: spec.autorunKind,
        targetField: cf?.name,
        wantServer: triggerArray(p.aiTrigger).includes('onServerUpdate') && !!String(prompt).trim(),
        config: {
          llmService: p.aiService || undefined,
          prompt: String(prompt || ''),
          urlMode: !!urlMode,
          ...spec.buildData(p),
          ...(imageSource ? { imageSource } : {}),
          ...gateConfig(p),
        },
        dependsOn: extractDeps(String(prompt || '')),
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
      p.aiTrigger,
      p.aiPrompt,
      p.aiService,
      p.aiImageModel,
      p.aiImageSource,
      p.aiVoiceModel,
      p.aiVoice,
      p.aiVoiceStyle,
      p.aiVoiceProvider,
      p.aiVoiceCred,
      p.aiVoiceId,
      p.aiElevenModel,
      p.aiVbeeSpeed,
      p.aiGate,
      cf?.name,
    ]);

    const onGen = async () => {
      if (!API || loadingRef.current) {
        if (!API) message.error(t('AI: apiClient chưa sẵn sàng'));
        return;
      }
      loadingRef.current = true;
      setLoading(true);
      try {
        const values = collectValues(model);
        // #5 img2img: if a source-image field is configured, send its current value so the model edits it.
        const srcField = spec.sourceFieldProp ? p[spec.sourceFieldProp] : undefined;
        const sourceImages = srcField ? values[srcField] : undefined;
        const res = await API.request({
          url: spec.endpoint,
          method: 'post',
          data: { llmService: p.aiService || undefined, prompt, values, ...spec.buildData(p), ...(sourceImages ? { sourceImages } : {}) },
        });
        const att = res?.data?.data?.attachment;
        if (!att) {
          message.error(t('AI: không nhận được kết quả từ model.'));
          return;
        }
        // attachment interface = array of records; attachmentURL = a bare url string.
        const next = urlMode ? att.url : [att];
        try {
          model.props?.onChange?.(next);
        } catch {
          /* ignore */
        }
        try {
          model.setProps?.('value', next);
        } catch {
          /* ignore */
        }
        message.success(t(spec.doneMsg));
      } catch (e: any) {
        const msg = e?.response?.data?.errors?.[0]?.message || e?.response?.data?.message || e?.message || t('thất bại');
        message.error('AI: ' + msg);
      } finally {
        setLoading(false);
        loadingRef.current = false;
      }
    };

    const tip = canGen ? t(spec.tipReady) : t('Chưa cấu hình prompt (mở field settings → AI)');
    return (
      <div style={{ display: 'flex', gap: 4, width: '100%', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>{baseRender()}</div>
        <Tooltip title={tip}>
          <Button
            aria-label="AI generate media"
            icon={<SparklesIcon />}
            loading={loading}
            disabled={!canGen}
            onClick={onGen}
            style={{ flex: '0 0 auto', color: canGen ? spec.color : undefined }}
          />
        </Tooltip>
      </div>
    );
  },
);

/** Also exported under the original name so any earlier import keeps working. */
export const AiImageEditable = MediaGenEditable;

/* ----------------------------- generic register ----------------------------- */

function registerMediaGen(
  { flowEngine, variants, EditableItemModel, api, tExpr }: Deps,
  opts: { spec: MediaSpec; flowConfig: (t: any) => any; settingsComponents: Record<string, any>; logKind: string },
) {
  if (!flowEngine || !variants?.length) {
    // eslint-disable-next-line no-console
    console.warn(`[ai-column] ${opts.logKind}: missing flowEngine or variants — skip`);
    return;
  }
  if (api) API = api;
  const te = (s: string) => (tExpr ? tExpr(s, { ns: NS }) : s);

  try {
    flowEngine.flowSettings?.registerComponents?.(opts.settingsComponents);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(`[ai-column] ${opts.logKind}: registerComponents failed`, e);
  }

  for (const { Base, modelName, interfaces, label, urlMode } of variants) {
    if (!Base) {
      // eslint-disable-next-line no-console
      console.warn(`[ai-column] ${opts.logKind}: variant missing Base — skip`, modelName);
      continue;
    }
    class AiMediaFieldModel extends Base {
      render() {
        const pr: any = (this as any).props || {};
        if (pr.pattern === 'readPretty' || pr.readOnly) {
          return super.render();
        }
        return <MediaGenEditable model={this} urlMode={urlMode} spec={opts.spec} baseRender={() => super.render()} />;
      }
    }
    flowEngine.registerModels({ [modelName]: AiMediaFieldModel });
    try {
      (AiMediaFieldModel as any).registerFlow(opts.flowConfig(te));
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(`[ai-column] ${opts.logKind}: registerFlow failed`, modelName, e);
    }
    try {
      (AiMediaFieldModel as any).define?.({ label });
    } catch {
      /* define optional */
    }
    try {
      EditableItemModel?.bindModelToInterface?.(modelName, interfaces, { isDefault: false });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(`[ai-column] ${opts.logKind}: bind failed`, modelName, e);
    }
  }
}

const tight = { style: { marginBottom: 8 } };

/** Trigger for media generation. Only the SERVER trigger makes sense here — image/voice aren't
 *  auto-generated on form open the way text fields are; `onServerUpdate` runs the generation when
 *  the record is created/updated from automation/API/bulk (see the server auto-run hook). */
const MEDIA_TRIGGER_OPTS = [
  { label: 'Server: tự sinh khi record được tạo/cập nhật (automation / API / bulk)', value: 'onServerUpdate' },
];
export const PtdlMediaTriggerSelect: React.FC<any> = observer((props: any) => (
  <Select
    mode="multiple"
    allowClear
    style={{ width: '100%' }}
    options={MEDIA_TRIGGER_OPTS.map((o) => ({ ...o, label: t(o.label) }))}
    value={triggerArray(props.value)}
    placeholder={t('Không tự chạy (chỉ bấm ✨ thủ công)')}
    onChange={(v) => props.onChange?.(v)}
  />
));

/* ------------------------------- IMAGE kind -------------------------------- */

/** Known Google image-generation models (all `generateContent`-based). Clearable → server default. */
const IMAGE_MODELS = [
  { label: 'Gemini 2.5 Flash Image (nhanh — mặc định)', value: 'gemini-2.5-flash-image' },
  { label: 'Gemini 3.1 Flash Image', value: 'gemini-3.1-flash-image' },
  { label: 'Gemini 3 Pro Image (chất lượng cao)', value: 'gemini-3-pro-image' },
];

// Defined here (before the voice section's CustomModelSelect) so both model pickers can reuse it;
// it only reads props at render time, so referencing it from PtdlImageModelSelect is fine.
const CustomModelSelect: React.FC<any> = observer((props: any) => {
  const value = props.value ? [String(props.value)] : [];
  return (
    <Select
      mode="tags"
      style={{ width: '100%' }}
      options={props.opts}
      value={value}
      placeholder={props.placeholder}
      maxTagCount={1}
      showSearch
      optionFilterProp="label"
      // Keep only the last pick/typed value → behaves like a single-select that allows custom input.
      onChange={(arr: string[]) => props.onChange?.(arr && arr.length ? arr[arr.length - 1] : '')}
      tokenSeparators={[',']}
    />
  );
});

export const PtdlImageModelSelect: React.FC<any> = observer((props: any) => (
  <CustomModelSelect {...props} opts={IMAGE_MODELS.map((o) => ({ ...o, label: t(o.label) }))} placeholder={t('gemini-2.5-flash-image (mặc định — hoặc gõ model khác)')} />
));

/** #5 img2img: pick an attachment field (of this field's collection, incl. itself) whose current
 *  image is fed to the model as INPUT to edit (background removal, restyle, enhance…). Empty = plain
 *  text→image. Lists attachment/attachmentURL fields via getFields (same as the bulk source picker). */
const PtdlImageSourceSelect: React.FC<any> = observer((props: any) => {
  const [options, setOptions] = useState<any[]>([]);
  let coll: string | undefined;
  let dsk = 'main';
  try {
    const ctx: any = useFlowSettingsContext();
    const model: any = ctx?.model;
    coll = model?.context?.collectionField?.collectionName;
    dsk = model?.context?.collectionField?.dataSourceKey || 'main';
  } catch {
    /* no context — stays empty */
  }
  useEffect(() => {
    let alive = true;
    if (coll && API) {
      getFields(API, coll, dsk).then((fields) => {
        if (!alive) return;
        setOptions(
          (fields || [])
            .filter((f: any) => f?.interface === 'attachment' || f?.interface === 'attachmentURL')
            .map((f: any) => ({ value: f.name, label: f.uiSchema?.title || f.name })),
        );
      });
    } else {
      setOptions([]);
    }
    return () => {
      alive = false;
    };
  }, [coll, dsk]);
  return (
    <Select
      allowClear
      showSearch
      optionFilterProp="label"
      style={{ width: '100%' }}
      options={options}
      value={props.value || undefined}
      placeholder={t('(để trống = sinh ảnh mới); chọn field ảnh để SỬA ảnh đó')}
      onChange={(v) => props.onChange?.(v)}
      notFoundContent={coll ? t('(không có field ảnh nào)') : t('(mở trong field ở form để tải)')}
    />
  );
});

function aiImageStepUiSchema(t: (s: string) => any) {
  return {
    aiTemplate: { type: 'void', title: t('Mẫu prompt (sinh mới / chỉnh sửa)'), 'x-decorator': 'FormItem', 'x-decorator-props': tight, 'x-component': 'PtdlImageTemplateSelect' },
    rowConnection: {
      type: 'void',
      'x-component': 'PtdlGrid',
      properties: {
        aiService: { type: 'string', title: t('Dịch vụ LLM'), 'x-decorator': 'FormItem', 'x-decorator-props': tight, 'x-component': 'PtdlLlmServiceSelect' },
        aiImageModel: { type: 'string', title: t('Model ảnh'), 'x-decorator': 'FormItem', 'x-decorator-props': tight, 'x-component': 'PtdlImageModelSelect' },
      },
    },
    aiImageSource: { type: 'string', title: t('Ảnh nguồn để SỬA (img2img) — trống = sinh mới'), 'x-decorator': 'FormItem', 'x-decorator-props': tight, 'x-component': 'PtdlImageSourceSelect' },
    aiPrompt: { type: 'string', title: t('Prompt (mô tả ảnh / cách sửa)'), 'x-decorator': 'FormItem', 'x-component': 'PtdlAiPromptInput' },
    aiTrigger: { type: 'string', title: t('Tự chạy (trigger)'), 'x-decorator': 'FormItem', 'x-decorator-props': tight, 'x-component': 'PtdlMediaTriggerSelect' },
    aiGate: { type: 'object', title: t('Điều kiện chạy (tiết kiệm chi phí)'), 'x-decorator': 'FormItem', 'x-decorator-props': tight, 'x-component': 'PtdlAutorunGate' },
  };
}

function aiImageFlowConfig(t: (s: string) => any) {
  return {
    key: 'ptdlAiImageSettings',
    sort: 552,
    title: t('AI'),
    steps: {
      ai: {
        title: t('AI sinh ảnh'),
        uiMode: { type: 'dialog', props: { width: 640 } },
        uiSchema: aiImageStepUiSchema(t),
        defaultParams: { aiService: '', aiImageModel: '', aiImageSource: '', aiPrompt: '', aiTrigger: [], aiGate: {} },
        handler(ctx: any, params: any) {
          ctx.model.setProps('aiService', params?.aiService || '');
          ctx.model.setProps('aiImageModel', params?.aiImageModel || '');
          ctx.model.setProps('aiImageSource', params?.aiImageSource || '');
          ctx.model.setProps('aiPrompt', params?.aiPrompt || '');
          ctx.model.setProps('aiTrigger', params?.aiTrigger || []);
          ctx.model.setProps('aiGate', params?.aiGate || {});
        },
      },
    },
  };
}

/** Exported so the CLASSIC (/admin) lane can reuse the exact same MediaGenEditable spec. */
export const imageMediaSpec: MediaSpec = {
  endpoint: 'ptdlAiColumn:generateImage',
  buildData: (p) => ({ model: p.aiImageModel || undefined }),
  doneMsg: 'Đã tạo ảnh. Kiểm tra lại trước khi Save.',
  tipReady: 'Sinh ảnh bằng AI vào field này',
  color: '#7c3aed',
  autorunKind: 'image',
  sourceFieldProp: 'aiImageSource', // #5 img2img
};

export function registerAiImage(deps: Deps) {
  return registerMediaGen(deps, {
    logKind: 'image',
    spec: imageMediaSpec,
    flowConfig: aiImageFlowConfig,
    settingsComponents: { PtdlImageModelSelect, PtdlImageSourceSelect, PtdlImageTemplateSelect, PtdlMediaTriggerSelect, PtdlAutorunGate },
  });
}

/** Ready-made IMAGE prompt templates. `edit:true` ones are img2img (need a source image) — picking
 *  one ALSO auto-sets the source field to THIS field itself, so a user just needs an image already
 *  in the field, then ✨. `edit:false` generate from text. */
const IMAGE_TEMPLATES = [
  { g: 'Sinh ảnh mới', label: 'Logo tối giản', prompt: 'Logo tối giản, phẳng, nền trắng, cho: ', edit: false },
  { g: 'Sinh ảnh mới', label: 'Ảnh sản phẩm nền trắng', prompt: 'Ảnh sản phẩm chuyên nghiệp, nền trắng tinh, ánh sáng studio, độ nét cao, cho: ', edit: false },
  { g: 'Sinh ảnh mới', label: 'Icon phẳng', prompt: 'Icon phẳng đơn giản, nét gọn, nền trong suốt, cho: ', edit: false },
  { g: 'Sinh ảnh mới', label: 'Ảnh minh họa banner', prompt: 'Ảnh minh họa ngang hiện đại, màu tươi, phong cách phẳng, chủ đề: ', edit: false },
  { g: 'Chỉnh sửa ảnh (cần ảnh nguồn)', label: 'Xóa nền', prompt: 'Xóa nền, chỉ giữ lại chủ thể, đặt trên nền trắng tinh.', edit: true },
  { g: 'Chỉnh sửa ảnh (cần ảnh nguồn)', label: 'Nâng nét (HD)', prompt: 'Tăng độ nét và chi tiết, khử noise, giữ nguyên bố cục và màu sắc.', edit: true },
  { g: 'Chỉnh sửa ảnh (cần ảnh nguồn)', label: 'Đổi nền trắng', prompt: 'Thay nền hiện tại thành nền trắng tinh, giữ nguyên chủ thể.', edit: true },
  { g: 'Chỉnh sửa ảnh (cần ảnh nguồn)', label: 'Phong cách hoạt hình', prompt: 'Chuyển ảnh sang phong cách hoạt hình / anime, màu tươi, giữ bố cục.', edit: true },
  { g: 'Chỉnh sửa ảnh (cần ảnh nguồn)', label: 'Sáng & tương phản đẹp', prompt: 'Cải thiện ánh sáng, tăng tương phản và độ rực, giữ vẻ tự nhiên.', edit: true },
];

/** Build antd grouped options once from IMAGE_TEMPLATES. */
const IMAGE_TEMPLATE_OPTIONS = (() => {
  const groups: Record<string, any[]> = {};
  IMAGE_TEMPLATES.forEach((tpl, i) => {
    groups[tpl.g] = groups[tpl.g] || [];
    groups[tpl.g].push({ label: tpl.label, value: String(i) });
  });
  // Labels/group names are Vietnamese i18n keys — translated at render (see PtdlImageTemplateSelect).
  return Object.keys(groups).map((label) => ({ label, options: groups[label] }));
})();

/** "Pick to fill" menu for image: writes the template into `aiPrompt`; for edit templates also sets
 *  `aiImageSource` to THIS field (self) so img2img works in one click. Resets to placeholder. */
const PtdlImageTemplateSelect: React.FC<any> = observer(() => {
  const form = useForm();
  let selfName: string | undefined;
  try {
    const ctx: any = useFlowSettingsContext();
    selfName = ctx?.model?.context?.collectionField?.name;
  } catch {
    /* no context */
  }
  return (
    <Select
      allowClear
      showSearch
      optionFilterProp="label"
      style={{ width: '100%' }}
      placeholder={t('Chọn mẫu prompt để điền nhanh…')}
      value={undefined}
      options={IMAGE_TEMPLATE_OPTIONS.map((g) => ({ label: t(g.label), options: (g.options || []).map((o: any) => ({ ...o, label: t(o.label) })) }))}
      onChange={(v) => {
        if (v == null) return;
        const tpl = IMAGE_TEMPLATES[Number(v)];
        if (!tpl || !form?.setValuesIn) return;
        form.setValuesIn('aiPrompt', t(tpl.prompt));
        // Edit templates need a source image → default it to this field itself (self).
        if (tpl.edit && selfName) form.setValuesIn('aiImageSource', selfName);
      }}
    />
  );
});

/* ------------------------------- VOICE kind -------------------------------- */

const VOICE_MODELS = [
  { label: 'Gemini 2.5 Flash TTS (mặc định)', value: 'gemini-2.5-flash-preview-tts' },
  { label: 'Gemini 2.5 Pro TTS (chất lượng cao)', value: 'gemini-2.5-pro-preview-tts' },
  { label: 'Gemini 3.1 Flash TTS', value: 'gemini-3.1-flash-tts-preview' },
];

/** All 30 Gemini prebuilt voices (official set). Label = "Name — <gender>, <tone>". Gender is the
 *  PERCEIVED gender, determined empirically (each voice's audio classified by Gemini, majority of
 *  3 votes) — Google doesn't publish it, so it's a best-effort aid, not authoritative. Typing
 *  "nam"/"nữ" in the picker filters by gender (optionFilterProp=label). */
const VOICES = [
  { label: 'Kore — nữ, chắc chắn (mặc định)', value: 'Kore' },
  { label: 'Puck — nam, sôi nổi', value: 'Puck' },
  { label: 'Charon — nam, rõ ràng', value: 'Charon' },
  { label: 'Zephyr — nữ, tươi sáng', value: 'Zephyr' },
  { label: 'Fenrir — nam, hào hứng', value: 'Fenrir' },
  { label: 'Leda — nữ, trẻ trung', value: 'Leda' },
  { label: 'Orus — nam, chắc', value: 'Orus' },
  { label: 'Aoede — nữ, nhẹ nhàng', value: 'Aoede' },
  { label: 'Callirrhoe — nữ, thoải mái', value: 'Callirrhoe' },
  { label: 'Autonoe — nữ, tươi sáng', value: 'Autonoe' },
  { label: 'Enceladus — nam, thì thầm', value: 'Enceladus' },
  { label: 'Iapetus — nam, trong trẻo', value: 'Iapetus' },
  { label: 'Umbriel — nam, thoải mái', value: 'Umbriel' },
  { label: 'Algieba — nam, mượt', value: 'Algieba' },
  { label: 'Despina — nữ, mượt', value: 'Despina' },
  { label: 'Erinome — nữ, trong trẻo', value: 'Erinome' },
  { label: 'Algenib — nam, khàn', value: 'Algenib' },
  { label: 'Rasalgethi — nam, rõ ràng', value: 'Rasalgethi' },
  { label: 'Laomedeia — nữ, sôi nổi', value: 'Laomedeia' },
  { label: 'Achernar — nữ, dịu', value: 'Achernar' },
  { label: 'Alnilam — nam, chắc', value: 'Alnilam' },
  { label: 'Schedar — nam, đều', value: 'Schedar' },
  { label: 'Gacrux — nữ, trưởng thành', value: 'Gacrux' },
  { label: 'Pulcherrima — nữ, mạnh dạn', value: 'Pulcherrima' },
  { label: 'Achird — nam, thân thiện', value: 'Achird' },
  { label: 'Zubenelgenubi — nam, bình dị', value: 'Zubenelgenubi' },
  { label: 'Vindemiatrix — nữ, êm', value: 'Vindemiatrix' },
  { label: 'Sadachbia — nam, sống động', value: 'Sadachbia' },
  { label: 'Sadaltager — nam, uyên bác', value: 'Sadaltager' },
  { label: 'Sulafat — nữ, ấm', value: 'Sulafat' },
];

export const PtdlVoiceModelSelect: React.FC<any> = observer((props: any) => (
  <CustomModelSelect {...props} opts={VOICE_MODELS.map((o) => ({ ...o, label: t(o.label) }))} placeholder={t('gemini-2.5-flash-preview-tts (mặc định — hoặc gõ model khác)')} />
));

export const PtdlVoiceSelect: React.FC<any> = observer((props: any) => (
  <Select
    style={{ width: '100%' }}
    options={VOICES.map((o) => ({ ...o, label: t(o.label) }))}
    value={props.value || undefined}
    placeholder={t('Kore (mặc định) — 30 giọng')}
    allowClear
    showSearch
    optionFilterProp="label"
    onChange={(v) => props.onChange?.(v)}
  />
));

/** Style/emotion/pace directive. Gemini TTS has no numeric speed/pitch knobs — delivery is steered
 *  by a natural-language instruction (not spoken), so the user just describes how it should sound. */
export const PtdlVoiceStyleInput: React.FC<any> = observer((props: any) => (
  <Input
    style={{ width: '100%' }}
    value={props.value}
    placeholder={t('vd: vui vẻ, phấn khích / chậm rãi, trầm ấm / thì thầm nhẹ nhàng (để trống = bình thường)')}
    onChange={(e) => props.onChange?.(e.target.value)}
  />
));

/** "🔊 Nghe thử": synthesize a fixed sample with the voice/model CURRENTLY selected in this dialog
 *  (read live from the form) and play it inline — no need to Save/generate on a record first. */
export const PtdlVoicePreview: React.FC<any> = observer(() => {
  const form = useForm();
  const [loading, setLoading] = useState(false);
  const audioRef = useRef<any>(null);
  const play = async () => {
    if (!API || loading) {
      if (!API) message.error(t('AI: apiClient chưa sẵn sàng'));
      return;
    }
    setLoading(true);
    try {
      const v: any = form?.values || {};
      const provider = v.aiVoiceProvider || 'google';
      const data: any = { provider, prompt: t('Xin chào, đây là giọng đọc thử. Bạn có thể chọn giọng này cho trường của mình.'), values: {} };
      if (provider === 'elevenlabs') {
        data.credName = v.aiVoiceCred || undefined;
        data.voiceId = v.aiVoiceId || undefined;
        data.elevenModel = v.aiElevenModel || undefined;
      } else if (provider === 'vbee') {
        data.credName = v.aiVoiceCred || undefined;
        data.voiceId = v.aiVoiceId || undefined;
        data.speed = v.aiVbeeSpeed || undefined;
      } else {
        data.llmService = v.aiService || undefined;
        data.model = v.aiVoiceModel || undefined;
        data.voice = v.aiVoice || undefined;
        data.style = v.aiVoiceStyle || undefined;
      }
      const res = await API.request({ url: 'ptdlAiColumn:generateVoice', method: 'post', data });
      const url = res?.data?.data?.attachment?.url;
      if (!url) {
        message.error(t('AI: không tạo được audio nghe thử.'));
        return;
      }
      try {
        audioRef.current?.pause?.();
      } catch {
        /* ignore */
      }
      const a = new Audio(url);
      audioRef.current = a;
      a.play().catch(() => message.warning(t('Trình duyệt chặn tự phát — bấm lại lần nữa.')));
    } catch (e: any) {
      message.error('AI: ' + (e?.response?.data?.errors?.[0]?.message || e?.response?.data?.message || e?.message || t('thất bại')));
    } finally {
      setLoading(false);
    }
  };
  return (
    <Button size="small" loading={loading} onClick={play} style={{ marginTop: -4 }}>
      🔊 {t('Nghe thử giọng đang chọn')}
    </Button>
  );
});

/* ---- multi-provider TTS: Google (Gemini) | ElevenLabs | Vbee ---- */

const VOICE_PROVIDERS = [
  { label: 'Google (Gemini TTS)', value: 'google' },
  { label: 'ElevenLabs', value: 'elevenlabs' },
  { label: 'Vbee (giọng Việt)', value: 'vbee' },
];
const ELEVEN_MODELS = [
  { label: 'Multilingual v2 (tốt cho tiếng Việt — mặc định)', value: 'eleven_multilingual_v2' },
  { label: 'Turbo v2.5 (nhanh, ép ngôn ngữ được)', value: 'eleven_turbo_v2_5' },
  { label: 'Flash v2.5 (rẻ/nhanh nhất)', value: 'eleven_flash_v2_5' },
  { label: 'v3 (biểu cảm, đọc audio-tag)', value: 'eleven_v3' },
];
/** A few recommended Vbee voice_codes (full 461 in Vbee portal). Free-entry, so type any code. */
const VBEE_VOICES = [
  { label: 'hn_male_manhdung_news_48k-fhg (nam Bắc, tin tức/uy tín)', value: 'hn_male_manhdung_news_48k-fhg' },
  { label: 'hn_male_thanhlong_talk_48k-fhg (nam Bắc, talk/chuyên gia)', value: 'hn_male_thanhlong_talk_48k-fhg' },
  { label: 'sg_male_minhhoang_full_48k-fhg (nam Sài Gòn)', value: 'sg_male_minhhoang_full_48k-fhg' },
  { label: 'hn_female_ngochuyen_full_48k-fhg (nữ Bắc)', value: 'hn_female_ngochuyen_full_48k-fhg' },
];

const PtdlVoiceProviderSelect: React.FC<any> = observer((props: any) => (
  <Select
    style={{ width: '100%' }}
    options={VOICE_PROVIDERS.map((o) => ({ ...o, label: t(o.label) }))}
    value={props.value || 'google'}
    onChange={(v) => props.onChange?.(v)}
  />
));

/** Credential picker for ElevenLabs / Vbee — lists names from `ptdlVoiceProvider` (via
 *  listVoiceProviders, secrets never returned), filtered to the currently-chosen provider. */
const PtdlVoiceCredSelect: React.FC<any> = observer((props: any) => {
  const form = useForm();
  const provider = (form?.values as any)?.aiVoiceProvider;
  const [options, setOptions] = useState<any[]>([]);
  useEffect(() => {
    let alive = true;
    if (API && (provider === 'elevenlabs' || provider === 'vbee')) {
      API.request({ url: 'ptdlAiColumn:listVoiceProviders', method: 'post', data: {} })
        .then((res: any) => {
          if (!alive) return;
          const d = res?.data?.data;
          const rows = Array.isArray(d) ? d : [];
          setOptions(rows.filter((r: any) => r.provider === provider).map((r: any) => ({ value: r.name, label: r.name })));
        })
        .catch(() => setOptions([]));
    } else {
      setOptions([]);
    }
    return () => {
      alive = false;
    };
  }, [provider]);
  return (
    <Select
      style={{ width: '100%' }}
      options={options}
      value={props.value || undefined}
      placeholder={t('Chọn credential đã cấu hình (mục AI Voice Provider)')}
      allowClear
      onChange={(v) => props.onChange?.(v)}
      notFoundContent={t('(chưa có — thêm 1 mục vào collection ptdlVoiceProvider)')}
    />
  );
});

const PtdlElevenModelSelect: React.FC<any> = observer((props: any) => (
  <CustomModelSelect {...props} opts={ELEVEN_MODELS.map((o) => ({ ...o, label: t(o.label) }))} placeholder={t('eleven_multilingual_v2 (mặc định — hoặc gõ model khác)')} />
));

const PtdlVoiceIdInput: React.FC<any> = observer((props: any) => (
  <CustomModelSelect {...props} opts={VBEE_VOICES.map((o) => ({ ...o, label: t(o.label) }))} placeholder={t('ElevenLabs: dán Voice ID · Vbee: chọn/gõ voice_code')} />
));

const PtdlVbeeSpeedInput: React.FC<any> = observer((props: any) => (
  <Input style={{ width: '100%' }} value={props.value} placeholder={t('1.0 (0.9 = chậm, 1.1 = nhanh)')} onChange={(e) => props.onChange?.(e.target.value)} />
));

// x-reactions helpers (MUST be functions, not {{$deps}} strings — see uiSchema-reaction gotcha).
const showWhenGoogle = (field: any) => {
  const p = field.form?.values?.aiVoiceProvider;
  field.display = !p || p === 'google' ? 'visible' : 'hidden';
};
const showWhenThirdParty = (field: any) => {
  const p = field.form?.values?.aiVoiceProvider;
  field.display = p === 'elevenlabs' || p === 'vbee' ? 'visible' : 'hidden';
};
const showWhenEleven = (field: any) => {
  field.display = field.form?.values?.aiVoiceProvider === 'elevenlabs' ? 'visible' : 'hidden';
};
const showWhenVbee = (field: any) => {
  field.display = field.form?.values?.aiVoiceProvider === 'vbee' ? 'visible' : 'hidden';
};

function aiVoiceStepUiSchema(t: (s: string) => any) {
  return {
    aiVoiceProvider: { type: 'string', title: t('Nhà cung cấp giọng (Provider)'), 'x-decorator': 'FormItem', 'x-decorator-props': tight, 'x-component': 'PtdlVoiceProviderSelect' },
    aiVoiceCred: { type: 'string', title: t('Credential (11labs/Vbee)'), 'x-decorator': 'FormItem', 'x-decorator-props': tight, 'x-component': 'PtdlVoiceCredSelect', 'x-reactions': showWhenThirdParty },
    aiVoiceId: { type: 'string', title: t('Voice ID / voice_code'), 'x-decorator': 'FormItem', 'x-decorator-props': tight, 'x-component': 'PtdlVoiceIdInput', 'x-reactions': showWhenThirdParty },
    aiElevenModel: { type: 'string', title: t('ElevenLabs model'), 'x-decorator': 'FormItem', 'x-decorator-props': tight, 'x-component': 'PtdlElevenModelSelect', 'x-reactions': showWhenEleven },
    aiVbeeSpeed: { type: 'string', title: t('Tốc độ đọc (Vbee)'), 'x-decorator': 'FormItem', 'x-decorator-props': tight, 'x-component': 'PtdlVbeeSpeedInput', 'x-reactions': showWhenVbee },
    aiService: { type: 'string', title: t('Dịch vụ LLM'), 'x-decorator': 'FormItem', 'x-decorator-props': tight, 'x-component': 'PtdlLlmServiceSelect', 'x-reactions': showWhenGoogle },
    rowVoice: {
      type: 'void',
      'x-component': 'PtdlGrid',
      'x-reactions': showWhenGoogle,
      properties: {
        aiVoiceModel: { type: 'string', title: t('Model TTS'), 'x-decorator': 'FormItem', 'x-decorator-props': tight, 'x-component': 'PtdlVoiceModelSelect' },
        aiVoice: { type: 'string', title: t('Giọng đọc'), 'x-decorator': 'FormItem', 'x-decorator-props': tight, 'x-component': 'PtdlVoiceSelect' },
      },
    },
    aiVoiceStyle: {
      type: 'string',
      title: t('Phong cách / cảm xúc / tốc độ (tùy chọn)'),
      'x-decorator': 'FormItem',
      'x-decorator-props': tight,
      'x-component': 'PtdlVoiceStyleInput',
      'x-reactions': showWhenGoogle,
    },
    voicePreview: { type: 'void', 'x-decorator': 'FormItem', 'x-decorator-props': tight, 'x-component': 'PtdlVoicePreview' },
    aiPrompt: { type: 'string', title: t('Text cần đọc (hỗ trợ chèn cột)'), 'x-decorator': 'FormItem', 'x-component': 'PtdlAiPromptInput' },
    aiTrigger: { type: 'string', title: t('Tự chạy (trigger)'), 'x-decorator': 'FormItem', 'x-decorator-props': tight, 'x-component': 'PtdlMediaTriggerSelect' },
    aiGate: { type: 'object', title: t('Điều kiện chạy (tiết kiệm chi phí)'), 'x-decorator': 'FormItem', 'x-decorator-props': tight, 'x-component': 'PtdlAutorunGate' },
  };
}

function aiVoiceFlowConfig(t: (s: string) => any) {
  return {
    key: 'ptdlAiVoiceSettings',
    sort: 553,
    title: t('AI'),
    steps: {
      ai: {
        title: t('AI sinh giọng nói'),
        uiMode: { type: 'dialog', props: { width: 640 } },
        uiSchema: aiVoiceStepUiSchema(t),
        defaultParams: {
          aiVoiceProvider: 'google',
          aiVoiceCred: '',
          aiVoiceId: '',
          aiElevenModel: '',
          aiVbeeSpeed: '',
          aiService: '',
          aiVoiceModel: '',
          aiVoice: '',
          aiVoiceStyle: '',
          aiPrompt: '',
          aiTrigger: [],
          aiGate: {},
        },
        handler(ctx: any, params: any) {
          ctx.model.setProps('aiVoiceProvider', params?.aiVoiceProvider || 'google');
          ctx.model.setProps('aiVoiceCred', params?.aiVoiceCred || '');
          ctx.model.setProps('aiVoiceId', params?.aiVoiceId || '');
          ctx.model.setProps('aiElevenModel', params?.aiElevenModel || '');
          ctx.model.setProps('aiVbeeSpeed', params?.aiVbeeSpeed || '');
          ctx.model.setProps('aiService', params?.aiService || '');
          ctx.model.setProps('aiVoiceModel', params?.aiVoiceModel || '');
          ctx.model.setProps('aiVoice', params?.aiVoice || '');
          ctx.model.setProps('aiVoiceStyle', params?.aiVoiceStyle || '');
          ctx.model.setProps('aiPrompt', params?.aiPrompt || '');
          ctx.model.setProps('aiTrigger', params?.aiTrigger || []);
          ctx.model.setProps('aiGate', params?.aiGate || {});
        },
      },
    },
  };
}

/** Exported so the CLASSIC (/admin) lane can reuse the exact same MediaGenEditable spec. */
export const voiceMediaSpec: MediaSpec = {
  endpoint: 'ptdlAiColumn:generateVoice',
  buildData: (p) => {
    const provider = p.aiVoiceProvider || 'google';
    if (provider === 'elevenlabs') {
      return { provider, credName: p.aiVoiceCred || undefined, voiceId: p.aiVoiceId || undefined, elevenModel: p.aiElevenModel || undefined };
    }
    if (provider === 'vbee') {
      return { provider, credName: p.aiVoiceCred || undefined, voiceId: p.aiVoiceId || undefined, speed: p.aiVbeeSpeed || undefined };
    }
    return { provider: 'google', model: p.aiVoiceModel || undefined, voice: p.aiVoice || undefined, style: p.aiVoiceStyle || undefined };
  },
  doneMsg: 'Đã tạo audio. Nghe thử & kiểm tra trước khi Save.',
  tipReady: 'Đọc thành giọng nói bằng AI vào field này',
  color: '#0d9488',
  autorunKind: 'voice',
};

export function registerAiVoice(deps: Deps) {
  return registerMediaGen(deps, {
    logKind: 'voice',
    spec: voiceMediaSpec,
    flowConfig: aiVoiceFlowConfig,
    settingsComponents: {
      PtdlVoiceModelSelect,
      PtdlVoiceSelect,
      PtdlVoiceStyleInput,
      PtdlVoicePreview,
      PtdlMediaTriggerSelect,
      PtdlAutorunGate,
      PtdlVoiceProviderSelect,
      PtdlVoiceCredSelect,
      PtdlElevenModelSelect,
      PtdlVoiceIdInput,
      PtdlVbeeSpeedInput,
    },
  });
}
