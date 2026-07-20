import React, { useEffect, useRef, useState } from 'react';
import { Button, Input, Select, Tag, Tooltip, message, theme } from 'antd';
import { observer } from '@formily/react';
import { FormTab } from '@formily/antd-v5';
import { useFlowSettingsContext } from '@nocobase/flow-engine';
import { SparklesIcon, collectValues, syncAutorunRule, gateConfig, registerFlowComponentsOnce, resolveCf } from './aiColumn';
import { buildFieldCascaderOptions, getFields, fieldJsonMeta, ColumnSelect } from '@tuanla90/shared';
import { NS, t } from './i18n';

/**
 * @tuanla90/plugin-ai-column — "AI Extract": read an ATTACHMENT field (image/PDF, e.g. an ID card
 * scan) and split it into N named target fields of the SAME collection in one LLM call
 * (structuredOutput, one schema property per target field) — unlike AiInputFieldModel/
 * AiTextareaFieldModel, this writes into SIBLING fields via `form.setFieldValue`, not into
 * its own value (the field keeps its normal upload behavior; render() only adds the ✨ button).
 *
 * Bound (non-default) to the file-manager `attachment` interface (UploadFieldModel) and the
 * attachment-url plugin's `attachmentURL` interface (AttachmentURLFieldModel) — both peer
 * plugins, both confirmed enabled in this environment (see memory: DB query + bundle read).
 */

export type AiExtractVariant = {
  Base: any; // UploadFieldModel | AttachmentURLFieldModel (per-lane import)
  modelName: string;
  interfaces: string[];
  label: string;
};

type Deps = {
  flowEngine: any;
  variants: AiExtractVariant[];
  EditableItemModel: any;
  api?: any;
  tExpr?: (s: string, opts?: any) => any;
};

let API: any = null;

/** One mapping row: which field to fill + what to tell the model to look for. `type`/`enumValues`
 *  are auto-filled from the target field's REAL data type the moment it's picked (see
 *  fieldJsonMeta) — not user-entered — so a number/boolean/select field gets a correctly-typed
 *  structuredOutput property instead of the schema defaulting every field to a bare string. */
export type MapRow = {
  field?: string;
  description?: string;
  type?: 'string' | 'number' | 'boolean';
  enumValues?: string[];
  /** Auto-detected: target field's interface is 'markdown' — the server keeps the model's
   *  markdown formatting for this field instead of stripping it (see fieldJsonMeta). */
  markdown?: boolean;
  /** Multi-row extract only: a mapping row is either a plain AI-extracted scalar (default) OR a
   *  RELATION column resolved by classify — in which case `target` = the relation's target
   *  collection and `queryField` = the sibling scalar field whose raw text is matched against it.
   *  Lets ONE extracted row resolve N relation FKs (product + warehouse + unit…) in one config. */
  kind?: 'scalar' | 'relation';
  target?: string;
  queryField?: string;
  /** Relation row, "transient match" source: instead of matching a stored column, the AI extracts a
   *  throwaway value described here purely to resolve the FK — it is NOT persisted as a child column. */
  matchDesc?: string;
  /** Relation row rule: minimum classify confidence (0–100) to accept the FK; below → leave empty
   *  (a blank FK = "needs manual review"). 0/undefined = accept any match. */
  minScore?: number;
  /** Relation row rule (transient source only): when there's no acceptable match, save the raw
   *  matched text into this CHILD column so it isn't lost — for manual review/fix later. When the
   *  source is a stored column the raw is already kept there, so this isn't needed. */
  saveRawTo?: string;
  /** Relation row: run the LLM re-rank (slower, +1 LLM call/row) for higher accuracy on ambiguous
   *  catalogs. Default off → fast vector-only match (batchable). */
  rerank?: boolean;
};

/** Small "what type will the AI be constrained to" indicator — builds trust that the auto-detect
 *  actually did something, and doubles as a sanity check for the user before they run it. */
export function extractTypeTagLabel(row: MapRow): string {
  if (row.enumValues?.length) {
    const preview = row.enumValues.slice(0, 3).join('/');
    return t('chọn 1: {{preview}}', { preview }) + (row.enumValues.length > 3 ? '…' : '');
  }
  if (row.type === 'number') return t('số');
  if (row.type === 'boolean') return t('đúng/sai');
  if (row.markdown) return t('văn bản (giữ markdown)');
  return t('văn bản');
}

/** Mapping-table field picker — reused by BOTH the field-level AI Extract (bound to one
 *  attachment field via `collectionField`) AND the table-level Bulk AI Extract action (bound to
 *  a table block via `blockModel.collection`, no single field of its own) — hence the fallback
 *  chain below. `ownField` (excluded from target options) only applies to the field-level case. */
export const PtdlExtractMapping: React.FC<any> = observer((props: any) => {
  const { token } = theme.useToken();
  const rows: MapRow[] = Array.isArray(props.value) ? props.value : [];
  const [options, setOptions] = useState<any[]>([]);
  const [fieldsByName, setFieldsByName] = useState<Record<string, any>>({});

  let coll: string | undefined;
  let dsk = 'main';
  let ownField: string | undefined;
  try {
    const ctx: any = useFlowSettingsContext();
    const model: any = ctx?.model;
    const cf = resolveCf(model);
    const blockColl = model?.context?.blockModel?.collection;
    coll = cf?.collectionName || blockColl?.name;
    dsk = cf?.dataSourceKey || blockColl?.dataSourceKey || 'main';
    ownField = cf?.name;
  } catch {
    /* no settings context — options just stay empty */
  }

  useEffect(() => {
    let alive = true;
    if (coll) {
      // maxDepth:0 — flat leaf fields of THIS collection only (no relation drill-down): a write
      // target must be a plain field `form.setFieldValue(name, v)` can address directly.
      buildFieldCascaderOptions(API, coll, dsk, { maxDepth: 0 }).then((o) => {
        if (alive) setOptions(o.filter((x: any) => x.value !== ownField));
      });
      getFields(API, coll, dsk).then((fields) => {
        if (!alive) return;
        const byName: Record<string, any> = {};
        fields.forEach((f: any) => f?.name && (byName[f.name] = f));
        setFieldsByName(byName);
      });
    } else {
      setOptions([]);
      setFieldsByName({});
    }
    return () => {
      alive = false;
    };
  }, [coll, dsk, ownField]);

  const update = (i: number, patch: Partial<MapRow>) => {
    const next = rows.slice();
    next[i] = { ...next[i], ...patch };
    props.onChange?.(next);
  };
  const pickField = (i: number, v: string) => {
    const meta = fieldJsonMeta(fieldsByName[v]);
    update(i, { field: v, type: meta.type, enumValues: meta.enumValues, markdown: meta.markdown });
  };
  const addRow = () => props.onChange?.([...rows, { field: '', description: '' }]);
  const removeRow = (i: number) => props.onChange?.(rows.filter((_: any, idx: number) => idx !== i));

  return (
    <div>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
          <ColumnSelect
            style={{ width: 200, flex: '0 0 auto' }}
            options={options}
            value={r.field || undefined}
            placeholder={t('Field đích')}
            onChange={(v) => pickField(i, v)}
          />
          {r.field ? (
            <Tag style={{ flex: '0 0 auto', margin: 0 }} title={t('Kiểu dữ liệu tự nhận diện từ field đích')}>
              {extractTypeTagLabel(r)}
            </Tag>
          ) : null}
          <Input
            style={{ flex: 1 }}
            placeholder={t('Mô tả cho AI — vd: số CCCD, 12 chữ số')}
            value={r.description}
            onChange={(e) => update(i, { description: e.target.value })}
          />
          <Button danger size="small" onClick={() => removeRow(i)}>
            ✕
          </Button>
        </div>
      ))}
      <Button size="small" onClick={addRow}>
        {t('+ Thêm field')}
      </Button>
      {!rows.length ? (
        <div style={{ fontSize: 12, color: token.colorTextTertiary, marginTop: 4 }}>
          {t('Chưa có field nào — bấm "+ Thêm field" để chọn field cần điền (vd: họ tên, số CCCD, ngày sinh...).')}
        </div>
      ) : null}
    </div>
  );
});

const EXTRACT_TRIGGER_OPTS = [
  { label: 'Tự động khi tệp được upload/thay đổi trong form (client)', value: 'onAttachChange' },
  { label: 'Server: khi record được tạo/cập nhật (cả automation/API/bulk)', value: 'onServerUpdate' },
];

/** Normalize aiTrigger to an array (same convention as aiColumn.tsx's triggerArray). */
function extractTriggerArray(v: any): string[] {
  return Array.isArray(v) ? v : [];
}

/** Which auto-trigger is active — multi-select for future-proofing (today: 1 option), same UI
 *  pattern as PtdlAiTriggerSelect. Nút ✨ thủ công LUÔN dùng được bất kể chọn gì. Exported — the
 *  classic (/admin) Formily lane reuses it directly (no flow-engine dependency in this component). */
export const PtdlExtractTriggerSelect: React.FC<any> = observer((props: any) => (
  <Select
    mode="multiple"
    style={{ width: '100%' }}
    options={EXTRACT_TRIGGER_OPTS.map((o) => ({ ...o, label: t(o.label) }))}
    placeholder={t('(để trống = chỉ bấm ✨ thủ công)')}
    value={extractTriggerArray(props.value)}
    onChange={(v) => props.onChange?.(v)}
  />
));

function aiExtractStepUiSchema(t: (s: string) => any) {
  return {
    tabs: {
      type: 'void',
      'x-component': 'FormTab',
      properties: {
        tabMain: {
          type: 'void', 'x-component': 'FormTab.TabPane', 'x-component-props': { tab: t('Trích xuất & Prompt') },
          properties: {
            aiMapping: { type: 'array', title: t('Các field cần trích xuất'), 'x-decorator': 'FormItem', 'x-component': 'PtdlExtractMapping' },
            // System prompt BEFORE the user prompt — it sets context/behavior; the prompt is the actual
            // instruction that follows it (same order as aiColumn.tsx's AI input/textarea dialog).
            aiSystem: { type: 'string', title: t('Câu lệnh hệ thống'), 'x-decorator': 'FormItem', 'x-component': 'PtdlAiSystemInput' },
            aiPrompt: { type: 'string', title: t('Prompt'), 'x-decorator': 'FormItem', 'x-component': 'PtdlAiPromptInput' },
            rowConnection: {
              type: 'void', 'x-component': 'PtdlGrid',
              properties: {
                aiService: { type: 'string', title: t('Dịch vụ LLM'), 'x-decorator': 'FormItem', 'x-component': 'PtdlLlmServiceSelect' },
                aiModel: { type: 'string', title: t('Model'), 'x-decorator': 'FormItem', 'x-component': 'PtdlLlmModelSelect' },
              },
            },
          },
        },
        tabAuto: {
          type: 'void', 'x-component': 'FormTab.TabPane', 'x-component-props': { tab: t('Tự động & Điều kiện') },
          properties: {
            aiTrigger: { type: 'array', title: t('Tự sinh khi'), 'x-decorator': 'FormItem', 'x-component': 'PtdlExtractTriggerSelect' },
            aiGate: { type: 'object', title: t('Điều kiện chạy (tiết kiệm chi phí)'), 'x-decorator': 'FormItem', 'x-component': 'PtdlAutorunGate' },
            aiHint: { type: 'string', title: t('Chú thích nút ✨ (hiện khi hover)'), 'x-decorator': 'FormItem', 'x-component': 'PtdlHintInput' },
          },
        },
      },
    },
  };
}

function aiExtractFlowConfig(t: (s: string) => any) {
  return {
    key: 'ptdlAiExtractSettings',
    sort: 551,
    title: t('AI'),
    steps: {
      ai: {
        title: t('AI trích xuất'),
        uiMode: { type: 'dialog', props: { width: 720 } },
        uiSchema: aiExtractStepUiSchema(t),
        defaultParams: { aiService: '', aiModel: '', aiSystem: '', aiPrompt: '', aiMapping: [], aiTrigger: [], aiGate: {}, aiHint: '' },
        handler(ctx: any, params: any) {
          ctx.model.setProps('aiService', params?.aiService || '');
          ctx.model.setProps('aiModel', params?.aiModel || '');
          ctx.model.setProps('aiSystem', params?.aiSystem || '');
          ctx.model.setProps('aiPrompt', params?.aiPrompt || '');
          ctx.model.setProps('aiMapping', Array.isArray(params?.aiMapping) ? params.aiMapping : []);
          ctx.model.setProps('aiTrigger', Array.isArray(params?.aiTrigger) ? params.aiTrigger : []);
          ctx.model.setProps('aiGate', params?.aiGate || {});
          ctx.model.setProps('aiHint', params?.aiHint || '');
        },
      },
    },
  };
}

/** Base render + a ✨ "Extract" button. On click: reads THIS field's own value (the uploaded
 *  file(s)) as the vision source, calls the server, then writes each result into a SIBLING form
 *  field (`form.setFieldValue`) — this field's own value is never touched. Exported — the classic
 *  (/admin) Formily lane reuses it via the same thin `model`-shaped adapter as AiEditable. */
export const AiExtractEditable: React.FC<{ model: any; baseRender: () => React.ReactNode }> = observer(
  ({ model, baseRender }) => {
    const [loading, setLoading] = useState(false);
    const loadingRef = useRef(false);
    const p: any = model?.props || {};
    const prompt = p.aiPrompt || '';
    const mapping: MapRow[] = (Array.isArray(p.aiMapping) ? p.aiMapping : []).filter((m: MapRow) => m?.field);
    const canGen = !!String(prompt).trim() && mapping.length > 0;
    const triggers = extractTriggerArray(p.aiTrigger);
    const hasAttachChange = triggers.includes('onAttachChange');

    // Sync the SERVER-side auto-run rule (kind 'extract') so `onServerUpdate` runs on automation/API
    // saves. Keyed by the source attachment field; the rule writes the mapped fields server-side.
    useEffect(() => {
      const cf = resolveCf(model);
      const sourceField = cf?.name;
      syncAutorunRule(model, {
        kind: 'extract',
        targetField: sourceField, // key the rule by the source attachment field
        wantServer: triggers.includes('onServerUpdate') && !!String(prompt).trim() && mapping.length > 0 && !!sourceField,
        config: {
          llmService: p.aiService || undefined,
          model: p.aiModel || undefined,
          system: p.aiSystem || undefined,
          prompt,
          sourceField,
          fields: mapping.map((m) => ({ name: m.field, description: m.description || '', type: m.type || 'string', enum: m.enumValues, markdown: m.markdown })),
          ...gateConfig(p),
        },
        dependsOn: sourceField ? [sourceField] : [],
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [p.aiTrigger, p.aiPrompt, p.aiService, p.aiModel, p.aiSystem, p.aiMapping, p.aiGate]);

    const onGen = async () => {
      if (!API || loadingRef.current) {
        if (!API) message.error(t('AI: apiClient chưa sẵn sàng'));
        return;
      }
      loadingRef.current = true;
      setLoading(true);
      try {
        const values = collectValues(model);
        const attachment = model.props?.value;
        const res = await API.request({
          url: 'ptdlAiColumn:extract',
          method: 'post',
          data: {
            llmService: p.aiService || undefined,
            model: p.aiModel || undefined,
            system: p.aiSystem || undefined,
            prompt,
            values,
            attachment,
            fields: mapping.map((m) => ({
              name: m.field,
              description: m.description || '',
              type: m.type || 'string',
              enum: m.enumValues,
              markdown: m.markdown,
            })),
          },
        });
        const outValues: Record<string, any> = res?.data?.data?.values || {};
        const form = model.context?.form;
        let count = 0;
        for (const [name, value] of Object.entries(outValues)) {
          if (value == null) continue;
          try {
            form?.setFieldValue?.(name, value);
            count++;
          } catch {
            /* skip a field the form can't address (e.g. removed since configured) */
          }
        }
        message.success(count ? t('Đã điền {{n}} field. Kiểm tra lại trước khi Save.', { n: count }) : t('AI không trả về giá trị nào.'));
      } catch (e: any) {
        const msg =
          e?.response?.data?.errors?.[0]?.message || e?.response?.data?.message || e?.message || t('thất bại');
        message.error('AI: ' + msg);
      } finally {
        setLoading(false);
        loadingRef.current = false;
      }
    };
    // Keep the effect below calling the latest closure without re-subscribing each render.
    const genRef = useRef(onGen);
    genRef.current = onGen;

    // Trigger: onAttachChange — auto-run when the attachment's OWN value changes to non-empty
    // content (e.g. right after the user finishes uploading the ID card photo). Debounced so it
    // doesn't fire on intermediate in-progress-upload states; the FIRST render just records a
    // baseline (so an already-attached image on open doesn't immediately re-trigger).
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
      ? t('Chưa cấu hình prompt / field đích (mở field settings)')
      : hasAttachChange
        ? t('Trích xuất bằng AI (tự động khi tệp thay đổi — bấm để chạy lại ngay)')
        : t('Trích xuất bằng AI vào các field đã cấu hình');

    return (
      <div style={{ display: 'flex', gap: 4, width: '100%', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>{baseRender()}</div>
        <Tooltip title={p.aiHint || tooltipTitle}>
          <Button
            aria-label="AI extract"
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

export function registerAiExtract({ flowEngine, variants, EditableItemModel, api, tExpr }: Deps) {
  if (!flowEngine || !variants?.length) {
    // eslint-disable-next-line no-console
    console.warn('[ai-column] extract: missing flowEngine or variants — skip');
    return;
  }
  if (api) API = api;
  const te = (s: string) => (tExpr ? tExpr(s, { ns: NS }) : s);

  try {
    // AI_SETTINGS_COMPONENTS (LLM pickers, prompt/system inputs, grid) is ALREADY registered by
    // registerAiColumn() in the same load() — only these two are new here. Re-registering the
    // shared ones is harmless (same names → same components) but avoided for clarity.
    registerFlowComponentsOnce(flowEngine, { PtdlExtractMapping, PtdlExtractTriggerSelect, FormTab, 'FormTab.TabPane': FormTab.TabPane });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[ai-column] extract: registerComponents failed', e);
  }

  const registered: any[] = [];
  for (const { Base, modelName, interfaces, label } of variants) {
    if (!Base) {
      // eslint-disable-next-line no-console
      console.warn('[ai-column] extract: variant missing Base — skip', modelName);
      continue;
    }

    class AiExtractFieldModel extends Base {
      render() {
        const p: any = (this as any).props || {};
        if (p.pattern === 'readPretty' || p.readOnly) {
          return super.render();
        }
        return <AiExtractEditable model={this} baseRender={() => super.render()} />;
      }
    }

    flowEngine.registerModels({ [modelName]: AiExtractFieldModel });

    try {
      (AiExtractFieldModel as any).registerFlow(aiExtractFlowConfig(te));
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[ai-column] extract: registerFlow failed', modelName, e);
    }

    try {
      (AiExtractFieldModel as any).define?.({ label });
    } catch {
      /* define optional */
    }

    try {
      EditableItemModel?.bindModelToInterface?.(modelName, interfaces, { isDefault: false });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[ai-column] extract: bind failed', modelName, e);
    }

    registered.push(AiExtractFieldModel);
  }

  return registered;
}
