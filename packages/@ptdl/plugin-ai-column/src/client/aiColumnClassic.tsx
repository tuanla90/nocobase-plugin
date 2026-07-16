import React, { useRef } from 'react';
import { Input } from 'antd';
import { observer, useField, useFieldSchema, useForm } from '@formily/react';
import { SchemaSettings, SchemaSettingsModalItem, useDesignable, useCollectionRecordData } from '@nocobase/client';
import { AiEditable, aiStepUiSchema, AI_SETTINGS_COMPONENTS } from '../shared/aiColumn';
import { t } from '../shared/i18n';

/**
 * @ptdl/plugin-ai-column — CLASSIC (/admin) Formily-schema forms. Completely separate mechanism
 * from the flow-engine field models in `../shared/aiColumn.tsx` (which already work for /v/ AND
 * for flow-engine blocks placed on /admin pages, e.g. EnhancedTableBlockModel) — this file targets
 * the OLD-style Formily Form blocks that predate flow-engine.
 *
 * Classic has NO live "switch this field's rendering widget" mechanism for plain text
 * interfaces — the shared `fieldComponentSettingsItem` ("Field component" dropdown) only ever
 * patches `x-component-props.component`, and core's `Input`/`Input.TextArea` never read that
 * prop in edit mode (confirmed against @nocobase/client-v2's readable reimplementation of the
 * same interface registry). So instead we do what core itself does for association fields
 * (Select ↔ Subtable ↔ Record picker): a bespoke SchemaSettings item that patches `x-component`
 * directly. Confirmed via the classic bundle: `fieldSettings:component:Input` and
 * `fieldSettings:component:Input.TextArea` genuinely exist and get merged into a field's gear
 * menu whenever its CURRENT x-component name matches — so switching TO 'PtdlAiInputClassic'
 * automatically surfaces a NEW `fieldSettings:component:PtdlAiInputClassic` bundle we register,
 * and switching back just needs one more item added into core's own Input/Input.TextArea bundles.
 */

type ClassicVariantDef = {
  originalComponent: string; // e.g. 'Input' — core's default x-component for this interface
  aiComponent: string; // e.g. 'PtdlAiInputClassic' — our registered replacement
  switchToLabel: string;
  switchBackLabel: string;
  multiline?: boolean;
};

/** Adapts the flow-engine-shaped `AiEditable` to a plain classic Formily field. */
function makeClassicField(multiline?: boolean) {
  return observer((props: any) => {
    const record = (useCollectionRecordData() as any) || {};
    const form: any = useForm();
    const field: any = useField();
    const schema: any = useFieldSchema();
    // Same defensive 3-way merge plugin-formula's classic cell uses — schema/field.componentProps
    // can lag a render behind `props` right after a live patch.
    const cfg = {
      ...(schema?.['x-component-props'] || {}),
      ...(field?.componentProps || {}),
      ...(props || {}),
    };

    const Base = multiline ? Input.TextArea : Input;
    if (field?.pattern === 'readPretty' || props.disabled) {
      return <Base {...props} />;
    }

    const modelRef = useRef<any>({});
    const m = modelRef.current;
    m.props = cfg;
    m.context = { record, form };
    m.setProps = () => {
      /* no-op: config is read fresh from schema/componentProps every render */
    };
    return <AiEditable model={m} baseRender={() => <Base {...props} />} />;
  });
}

const PtdlAiInputClassic = makeClassicField(false);
const PtdlAiTextareaClassic = makeClassicField(true);

/** A plain clickable "switch component" action item (name/type/useComponentProps — confirmed
 *  shape from the classic bundle's own item-factory helper). */
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

const AI_DEFAULTS = {
  aiService: '',
  aiModel: '',
  aiOutputType: 'text',
  aiOptions: [],
  aiSystem: '',
  aiPrompt: '',
  aiTrigger: [],
  aiGate: {},
};

/** The "AI generation" config modal — same schema/fields as the /v/ dialog (Formily JSON Schema +
 *  x-component name strings work identically in classic SchemaComponent rendering). */
function aiGenerationSettingsItem() {
  return {
    name: 'aiGeneration',
    Component: SchemaSettingsModalItem,
    useComponentProps() {
      const schema: any = useFieldSchema();
      const { dn } = useDesignable();
      const cur = schema?.['x-component-props'] || {};
      return {
        title: t('AI sinh giá trị'),
        width: 680,
        initialValues: { ...AI_DEFAULTS, ...cur },
        // Pass the RUNTIME translator so classic renders actual translated strings (classic
        // SchemaComponent doesn't compile the flow-engine {{t()}} expressions te() produces).
        schema: { type: 'object', properties: aiStepUiSchema(t) },
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

function buildVariant({ originalComponent, aiComponent, switchToLabel, switchBackLabel }: ClassicVariantDef) {
  return {
    switchToItem: switchItem(`ptdlSwitchTo_${aiComponent}`, switchToLabel, aiComponent),
    ownSettings: new SchemaSettings({
      name: `fieldSettings:component:${aiComponent}`,
      items: [switchItem(`ptdlSwitchBack_${originalComponent}`, switchBackLabel, originalComponent), { name: 'divider', type: 'divider' }, aiGenerationSettingsItem()],
    }),
  };
}

const VARIANTS: ClassicVariantDef[] = [
  { originalComponent: 'Input', aiComponent: 'PtdlAiInputClassic', switchToLabel: 'Chuyển sang AI input', switchBackLabel: 'Chuyển về Input thường' },
  {
    originalComponent: 'Input.TextArea',
    aiComponent: 'PtdlAiTextareaClassic',
    switchToLabel: 'Chuyển sang AI textarea',
    switchBackLabel: 'Chuyển về Textarea thường',
    multiline: true,
  },
];

export function registerAiColumnClassic(app: any) {
  if (!app) return;
  try {
    app.addComponents({ ...AI_SETTINGS_COMPONENTS, PtdlAiInputClassic, PtdlAiTextareaClassic });
    for (const v of VARIANTS) {
      const { switchToItem, ownSettings } = buildVariant(v);
      app.schemaSettingsManager?.addItem?.(`fieldSettings:component:${v.originalComponent}`, switchToItem.name, switchToItem);
      app.schemaSettingsManager?.add?.(ownSettings);
    }
    // eslint-disable-next-line no-console
    console.log('[ai-column] classic Formily forms registered — AI input + AI textarea');
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[ai-column] classic Formily registration failed', e);
  }
}
