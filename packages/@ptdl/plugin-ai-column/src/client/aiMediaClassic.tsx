import React, { useRef } from 'react';
import { observer, useField, useFieldSchema, useForm } from '@formily/react';
import {
  SchemaSettings,
  SchemaSettingsModalItem,
  useDesignable,
  useCollectionRecordData,
  useCollection,
  Upload,
} from '@nocobase/client';
import {
  AiImageEditable, // === MediaGenEditable (image + voice share it)
  imageMediaSpec,
  voiceMediaSpec,
  PtdlImageModelSelect,
  PtdlVoiceModelSelect,
  PtdlVoiceSelect,
  PtdlVoiceStyleInput,
  PtdlVoicePreview,
  PtdlMediaTriggerSelect,
} from '../shared/aiImage';
import { AI_SETTINGS_COMPONENTS } from '../shared/aiColumn';
import { FieldTokenTextArea } from '@ptdl/shared';
import { t } from '../shared/i18n';

// Module-level apiClient — set once in registerAiMediaClassic(), read by the collection-context
// components below (same pattern as aiExtractClassic.tsx's own module-level `API`).
let API: any = null;

/**
 * @ptdl/plugin-ai-column — "AI Image" / "AI Voice" for CLASSIC (/admin) Formily forms. Sibling of
 * aiExtractClassic.tsx: same bespoke-SchemaSettings approach (patch `x-component` directly, since
 * the shared field-component dropdown only touches `x-component-props.component` which
 * `Upload.Attachment` ignores), reusing `AiImageEditable` (the shared MediaGenEditable) via the same
 * thin `model`-shaped adapter.
 *
 * SCOPE: main `attachment` interface only (`Upload.Attachment`) — identical rationale to
 * aiExtractClassic.tsx (the `attachmentURL` classic component has no importable reference).
 */

/** Prompt with the "＋ Chèn cột" field picker — collection resolved via useCollection() (classic
 *  settings render outside any flow-engine context, so we can't use useFlowSettingsContext here). */
const PtdlMediaPromptClassic: React.FC<any> = observer((props: any) => {
  const collection: any = useCollection();
  const coll = collection?.name;
  const dsk = collection?.dataSource?.key || collection?.dataSource || 'main';
  return (
    <FieldTokenTextArea
      value={props.value}
      onChange={props.onChange}
      api={API}
      collectionName={coll}
      dataSourceKey={typeof dsk === 'string' ? dsk : 'main'}
      format={(p) => `{{${p.join('.')}}}`}
      rows={4}
      placeholder={t('VD (ảnh): logo con mèo phẳng, nền trắng. VD (voice): Chào {{ten_kh}}, đơn hàng đã sẵn sàng.')}
      hint={
        <>
          {t('Bấm')} <b>＋ Chèn cột</b> {t('để chèn field, hoặc gõ tay')} <code>{'{{ten_field}}'}</code>.
        </>
      }
    />
  );
});

const IMAGE_DEFAULTS = { aiService: '', aiImageModel: '', aiPrompt: '', aiTrigger: [], aiGate: {} };
const VOICE_DEFAULTS = { aiService: '', aiVoiceModel: '', aiVoice: '', aiVoiceStyle: '', aiPrompt: '', aiTrigger: [], aiGate: {} };

/** The field wrapper: Upload.Attachment unchanged + a ✨ generate button, via the shared adapter.
 *  `spec` picks image vs voice; both use the same MediaGenEditable. */
function makeClassicMediaField(spec: any) {
  return observer((props: any) => {
    const record = (useCollectionRecordData() as any) || {};
    const form: any = useForm();
    const field: any = useField();
    const schema: any = useFieldSchema();
    const collection: any = useCollection();
    const cfg = {
      ...(schema?.['x-component-props'] || {}),
      ...(field?.componentProps || {}),
      ...(props || {}),
    };

    if (field?.pattern === 'readPretty' || props.disabled) {
      return <Upload.Attachment {...props} />;
    }

    const fieldName = field?.props?.name || field?.name;
    const dsk = collection?.dataSource?.key || collection?.dataSource || 'main';
    const modelRef = useRef<any>({});
    const m = modelRef.current;
    m.props = cfg;
    // collectionField lets the shared editable's server-autorun sync work in classic too (same shape
    // the /v/ lane exposes via model.context.collectionField).
    m.context = {
      record,
      form,
      collectionField: fieldName
        ? { name: fieldName, collectionName: collection?.name, dataSourceKey: typeof dsk === 'string' ? dsk : 'main' }
        : undefined,
    };
    // urlMode false: Upload.Attachment is the belongsToMany `attachment` interface (value = array).
    return <AiImageEditable model={m} spec={spec} urlMode={false} baseRender={() => <Upload.Attachment {...props} />} />;
  });
}

const PtdlAiImageClassic = makeClassicMediaField(imageMediaSpec);
const PtdlAiVoiceClassic = makeClassicMediaField(voiceMediaSpec);

/** A plain clickable "switch component" action item — same proven shape as aiExtractClassic.tsx. */
function switchItem(name: string, title: string, toComponent: string) {
  return {
    name,
    type: 'item',
    useComponentProps() {
      const schema: any = useFieldSchema();
      const { dn } = useDesignable();
      return {
        title: t(title),
        onClick: () => {
          schema['x-component'] = toComponent;
          if (schema['x-uid']) {
            dn.emit('patch', { schema: { 'x-uid': schema['x-uid'], 'x-component': toComponent } });
          }
          dn.refresh({ refreshParentSchema: true });
        },
      };
    },
  };
}

function imageSettingsItem() {
  return {
    name: 'aiImage',
    Component: SchemaSettingsModalItem,
    useComponentProps() {
      const schema: any = useFieldSchema();
      const { dn } = useDesignable();
      const cur = schema?.['x-component-props'] || {};
      return {
        title: t('AI ảnh'),
        width: 640,
        initialValues: { ...IMAGE_DEFAULTS, ...cur },
        schema: {
          type: 'object',
          properties: {
            rowConnection: {
              type: 'void',
              'x-component': 'PtdlGrid',
              properties: {
                aiService: { type: 'string', title: t('Dịch vụ LLM'), 'x-decorator': 'FormItem', 'x-component': 'PtdlLlmServiceSelect' },
                aiImageModel: { type: 'string', title: t('Model ảnh'), 'x-decorator': 'FormItem', 'x-component': 'PtdlImageModelSelect' },
              },
            },
            aiPrompt: { type: 'string', title: t('Prompt (mô tả ảnh cần tạo)'), 'x-decorator': 'FormItem', 'x-component': 'PtdlMediaPromptClassic' },
            aiTrigger: { type: 'array', title: t('Tự chạy (trigger)'), 'x-decorator': 'FormItem', 'x-component': 'PtdlMediaTriggerSelect' },
            aiGate: { type: 'object', title: t('Điều kiện chạy (tiết kiệm chi phí)'), 'x-decorator': 'FormItem', 'x-component': 'PtdlAutorunGate' },
          },
        },
        onSubmit: (values: any) => {
          const props = { ...cur, ...values };
          schema['x-component-props'] = props;
          if (schema['x-uid']) {
            dn.emit('patch', { schema: { 'x-uid': schema['x-uid'], 'x-component-props': props } });
          }
          dn.refresh({ refreshParentSchema: true });
        },
      };
    },
  };
}

function voiceSettingsItem() {
  return {
    name: 'aiVoice',
    Component: SchemaSettingsModalItem,
    useComponentProps() {
      const schema: any = useFieldSchema();
      const { dn } = useDesignable();
      const cur = schema?.['x-component-props'] || {};
      return {
        title: t('AI giọng nói'),
        width: 640,
        initialValues: { ...VOICE_DEFAULTS, ...cur },
        schema: {
          type: 'object',
          properties: {
            aiService: { type: 'string', title: t('Dịch vụ LLM'), 'x-decorator': 'FormItem', 'x-component': 'PtdlLlmServiceSelect' },
            rowVoice: {
              type: 'void',
              'x-component': 'PtdlGrid',
              properties: {
                aiVoiceModel: { type: 'string', title: t('Model TTS'), 'x-decorator': 'FormItem', 'x-component': 'PtdlVoiceModelSelect' },
                aiVoice: { type: 'string', title: t('Giọng đọc'), 'x-decorator': 'FormItem', 'x-component': 'PtdlVoiceSelect' },
              },
            },
            aiVoiceStyle: { type: 'string', title: t('Phong cách / cảm xúc / tốc độ (tùy chọn)'), 'x-decorator': 'FormItem', 'x-component': 'PtdlVoiceStyleInput' },
            voicePreview: { type: 'void', 'x-decorator': 'FormItem', 'x-component': 'PtdlVoicePreview' },
            aiPrompt: { type: 'string', title: t('Text cần đọc (hỗ trợ chèn cột)'), 'x-decorator': 'FormItem', 'x-component': 'PtdlMediaPromptClassic' },
            aiTrigger: { type: 'array', title: t('Tự chạy (trigger)'), 'x-decorator': 'FormItem', 'x-component': 'PtdlMediaTriggerSelect' },
            aiGate: { type: 'object', title: t('Điều kiện chạy (tiết kiệm chi phí)'), 'x-decorator': 'FormItem', 'x-component': 'PtdlAutorunGate' },
          },
        },
        onSubmit: (values: any) => {
          const props = { ...cur, ...values };
          schema['x-component-props'] = props;
          if (schema['x-uid']) {
            dn.emit('patch', { schema: { 'x-uid': schema['x-uid'], 'x-component-props': props } });
          }
          dn.refresh({ refreshParentSchema: true });
        },
      };
    },
  };
}

export function registerAiMediaClassic(app: any) {
  if (!app) return;
  try {
    if (app.apiClient) API = app.apiClient;

    app.addComponents({
      ...AI_SETTINGS_COMPONENTS,
      PtdlMediaPromptClassic,
      PtdlImageModelSelect,
      PtdlVoiceModelSelect,
      PtdlVoiceSelect,
      PtdlVoiceStyleInput,
      PtdlVoicePreview,
      PtdlMediaTriggerSelect,
      PtdlAiImageClassic,
      PtdlAiVoiceClassic,
    });

    // Two more entry points on the Upload.Attachment field settings (alongside AI Extract).
    app.schemaSettingsManager?.addItem?.(
      'fieldSettings:component:Upload.Attachment',
      'ptdlSwitchTo_PtdlAiImageClassic',
      switchItem('ptdlSwitchTo_PtdlAiImageClassic', 'Chuyển sang AI Image', 'PtdlAiImageClassic'),
    );
    app.schemaSettingsManager?.addItem?.(
      'fieldSettings:component:Upload.Attachment',
      'ptdlSwitchTo_PtdlAiVoiceClassic',
      switchItem('ptdlSwitchTo_PtdlAiVoiceClassic', 'Chuyển sang AI Voice', 'PtdlAiVoiceClassic'),
    );

    app.schemaSettingsManager?.add?.(
      new SchemaSettings({
        name: 'fieldSettings:component:PtdlAiImageClassic',
        items: [
          switchItem('ptdlSwitchBack_Upload.Attachment', 'Chuyển về Attachment thường', 'Upload.Attachment'),
          { name: 'divider', type: 'divider' },
          imageSettingsItem(),
        ],
      }),
    );
    app.schemaSettingsManager?.add?.(
      new SchemaSettings({
        name: 'fieldSettings:component:PtdlAiVoiceClassic',
        items: [
          switchItem('ptdlSwitchBack_Upload.Attachment', 'Chuyển về Attachment thường', 'Upload.Attachment'),
          { name: 'divider', type: 'divider' },
          voiceSettingsItem(),
        ],
      }),
    );
    // eslint-disable-next-line no-console
    console.log('[ai-column] classic Formily forms — AI Image + AI Voice registered (Upload.Attachment only)');
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[ai-column] classic AI Media registration failed', e);
  }
}
