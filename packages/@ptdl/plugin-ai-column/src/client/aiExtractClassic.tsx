import React, { useEffect, useRef, useState } from 'react';
import { Button, Input, Tag } from 'antd';
import { observer, useField, useFieldSchema, useForm } from '@formily/react';
import {
  SchemaSettings,
  SchemaSettingsModalItem,
  useDesignable,
  useCollectionRecordData,
  useCollection,
  Upload,
} from '@nocobase/client';
import { AiExtractEditable, PtdlExtractTriggerSelect, extractTypeTagLabel, type MapRow } from '../shared/aiExtract';
import { AI_SETTINGS_COMPONENTS } from '../shared/aiColumn';
import { FieldTokenTextArea, buildFieldCascaderOptions, getFields, fieldJsonMeta, ColumnSelect } from '@ptdl/shared';
import { t } from '../shared/i18n';

// Module-level apiClient — set once in registerAiExtractClassic(), read by the collection-context
// components below (same pattern as aiColumn.tsx/aiExtract.tsx's own module-level `API`).
let API: any = null;

/**
 * @ptdl/plugin-ai-column — "AI Extract" for CLASSIC (/admin) Formily forms. Same idea as
 * aiColumnClassic.tsx (bespoke SchemaSettings item patching `x-component` directly — the shared
 * `fieldComponentSettingsItem` dropdown only ever touches `x-component-props.component`, which
 * `Upload.Attachment` doesn't read in edit mode), reusing `AiExtractEditable` from
 * `../shared/aiExtract.tsx` via the same thin `model`-shaped adapter as AiEditable.
 *
 * SCOPE: only the main `attachment` interface (`Upload.Attachment`, confirmed exported directly
 * from `@nocobase/client`). The `attachmentURL` interface's classic component (`AttachmentUrl`,
 * from `@nocobase/plugin-field-attachment-url`) is registered via a lazy `app.addComponents()`
 * call with no importable reference and no confirmed "resolve a registered component by string
 * name outside SchemaComponent" hook — rather than guess, it's left out of this pass.
 *
 * Collection/field-list context: classic settings render OUTSIDE any flow-engine context, so
 * (unlike the /v/ dialog's `useFlowSettingsContext()`) this uses `useCollection()` — a plain,
 * always-available Formily/NocoBase hook (confirmed: 113 call sites in core) — for the current
 * collection's name + field list.
 */

/** Prompt with the SAME "＋ Chèn cột" field picker as /v/ — collection resolved via useCollection(). */
const PtdlExtractPromptClassic: React.FC<any> = observer((props: any) => {
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
      rows={5}
      placeholder={t('VD: Đọc thông tin trong ảnh CCCD.')}
      hint={
        <>
          {t('Bấm')} <b>＋ Chèn cột</b> {t('để chèn field (khỏi nhớ tên), hoặc gõ tay')} <code>{'{{ten_field}}'}</code>.
        </>
      }
    />
  );
});

/** Mapping rows (target field + description) — same as /v/'s PtdlExtractMapping (incl. auto
 *  type/enum detection on pick), collection resolved via useCollection() instead. */
const PtdlExtractMappingClassic: React.FC<any> = observer((props: any) => {
  const rows: MapRow[] = Array.isArray(props.value) ? props.value : [];
  const [options, setOptions] = useState<any[]>([]);
  const [fieldsByName, setFieldsByName] = useState<Record<string, any>>({});
  const collection: any = useCollection();
  const coll = collection?.name;
  const dsk = collection?.dataSource?.key || collection?.dataSource || 'main';
  const field: any = useField();
  const ownField = field?.props?.name || field?.name;

  useEffect(() => {
    let alive = true;
    const dataSourceKey = typeof dsk === 'string' ? dsk : 'main';
    if (coll && API) {
      buildFieldCascaderOptions(API, coll, dataSourceKey, { maxDepth: 0 }).then((o) => {
        if (alive) setOptions(o.filter((x: any) => x.value !== ownField));
      });
      getFields(API, coll, dataSourceKey).then((fields) => {
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
    </div>
  );
});

const EXTRACT_DEFAULTS = { aiService: '', aiModel: '', aiSystem: '', aiPrompt: '', aiMapping: [], aiTrigger: [], aiGate: {} };

/** The field wrapper: Upload.Attachment unchanged + a ✨ Extract button, via the shared adapter. */
const PtdlAiExtractClassic = observer((props: any) => {
  const record = (useCollectionRecordData() as any) || {};
  const form: any = useForm();
  const field: any = useField();
  const schema: any = useFieldSchema();
  const cfg = {
    ...(schema?.['x-component-props'] || {}),
    ...(field?.componentProps || {}),
    ...(props || {}),
  };

  if (field?.pattern === 'readPretty' || props.disabled) {
    return <Upload.Attachment {...props} />;
  }

  const modelRef = useRef<any>({});
  const m = modelRef.current;
  m.props = cfg;
  m.context = { record, form };
  return <AiExtractEditable model={m} baseRender={() => <Upload.Attachment {...props} />} />;
});

/** A plain clickable "switch component" action item — same proven shape as aiColumnClassic.tsx. */
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

function aiExtractSettingsItem() {
  return {
    name: 'aiExtract',
    Component: SchemaSettingsModalItem,
    useComponentProps() {
      const schema: any = useFieldSchema();
      const { dn } = useDesignable();
      const cur = schema?.['x-component-props'] || {};
      return {
        title: t('AI trích xuất'),
        width: 720,
        initialValues: { ...EXTRACT_DEFAULTS, ...cur },
        schema: {
          type: 'object',
          properties: {
            rowConnection: {
              type: 'void',
              'x-component': 'PtdlGrid',
              properties: {
                aiService: { type: 'string', title: t('Dịch vụ LLM'), 'x-decorator': 'FormItem', 'x-component': 'PtdlLlmServiceSelect' },
                aiModel: { type: 'string', title: t('Model'), 'x-decorator': 'FormItem', 'x-component': 'PtdlLlmModelSelect' },
              },
            },
            aiTrigger: { type: 'array', title: t('Tự sinh khi'), 'x-decorator': 'FormItem', 'x-component': 'PtdlExtractTriggerSelect' },
            // System prompt BEFORE the user prompt — same order as aiColumn.tsx's dialogs.
            aiSystem: { type: 'string', title: t('Câu lệnh hệ thống'), 'x-decorator': 'FormItem', 'x-component': 'PtdlAiSystemInput' },
            aiPrompt: { type: 'string', title: t('Prompt'), 'x-decorator': 'FormItem', 'x-component': 'PtdlExtractPromptClassic' },
            aiMapping: { type: 'array', title: t('Các field cần trích xuất'), 'x-decorator': 'FormItem', 'x-component': 'PtdlExtractMappingClassic' },
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

export function registerAiExtractClassic(app: any) {
  if (!app) return;
  try {
    if (app.apiClient) API = app.apiClient;

    app.addComponents({
      ...AI_SETTINGS_COMPONENTS,
      PtdlExtractTriggerSelect,
      PtdlExtractPromptClassic,
      PtdlExtractMappingClassic,
      PtdlAiExtractClassic,
    });

    app.schemaSettingsManager?.addItem?.(
      'fieldSettings:component:Upload.Attachment',
      'ptdlSwitchTo_PtdlAiExtractClassic',
      switchItem('ptdlSwitchTo_PtdlAiExtractClassic', 'Chuyển sang AI Extract', 'PtdlAiExtractClassic'),
    );
    app.schemaSettingsManager?.add?.(
      new SchemaSettings({
        name: 'fieldSettings:component:PtdlAiExtractClassic',
        items: [
          switchItem('ptdlSwitchBack_Upload.Attachment', 'Chuyển về Attachment thường', 'Upload.Attachment'),
          { name: 'divider', type: 'divider' },
          aiExtractSettingsItem(),
        ],
      }),
    );
    // eslint-disable-next-line no-console
    console.log('[ai-column] classic Formily forms — AI Extract registered (Upload.Attachment only)');
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[ai-column] classic AI Extract registration failed', e);
  }
}
