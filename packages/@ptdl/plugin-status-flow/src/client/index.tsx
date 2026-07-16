import React from 'react';
import { CollectionFieldInterface, Icon, Plugin, icons, interfacesProperties, useAPIClient } from '@nocobase/client';
import { setIconRegistry } from '@ptdl/shared';
import { setStatusFlowIconRegistry } from '../shared/iconRegistry';
import { NS, setRuntimeT, te, tt } from '../shared/i18n';
import enUS from '../locale/en-US.json';
import viVN from '../locale/vi-VN.json';
import zhCN from '../locale/zh-CN.json';
import { DisplayItemModel, EditableItemModel, FilterableItemModel } from '@nocobase/flow-engine';
import { observer, useForm } from '@formily/react';
import { StatusFlowConfigEditor } from '../shared/StatusFlowConfigEditor';
import { defineStatusFlowFieldModel } from '../shared/statusFlowFieldModel';
import { defineStatusFlowDisplayModel } from '../shared/statusFlowDisplayModel';
import { defineStatusTransitionActionModel } from '../shared/statusTransitionAction';
import { StatusFlowSelect } from './StatusFlowSelectClassic';

const { defaultProps, operators } = interfacesProperties as any;

// Classic field-config dialog is formily-based: this component is the x-component of the
// `statusFlow` property, so formily injects value/onChange for that path; the sibling
// `uiSchema.enum` is written through the formily form instance.
const StatusFlowConfigEditorClassic = observer((props: any) => {
  const form: any = useForm();
  const api: any = useAPIClient();
  const enumValue = form?.values?.uiSchema?.enum;
  return (
    <StatusFlowConfigEditor
      enumValue={enumValue}
      flowValue={props.value}
      onChange={(nextEnum, nextFlow) => {
        form?.setValuesIn?.('uiSchema.enum', nextEnum);
        // Create forms prefill from the field's defaultValue — keep it on the initial status.
        form?.setValuesIn?.('defaultValue', nextFlow.initial ?? null);
        props.onChange?.(nextFlow);
      }}
      fetchRoles={async () => {
        const res = await api?.request?.({
          url: 'roles:list',
          params: { paginate: false, fields: ['name', 'title'] },
        });
        return res?.data?.data || [];
      }}
    />
  );
});

export class StatusFlowFieldInterface extends CollectionFieldInterface {
  name = 'statusFlow';
  type = 'object';
  group = 'choices';
  order = 9;
  // Field-type picker label. Rendered as a plain string by the picker (not a compiled schema
  // title), so use the runtime translator (resolved when the interface is constructed in load()).
  title = tt('Status Flow');
  sortable = true;
  default = {
    type: 'string',
    uiSchema: {
      type: 'string',
      // Legacy /admin (Formily) forms render through this component so the editable dropdown only
      // offers valid transitions; its .ReadPretty keeps the colored tag. The /v/ + flow-engine
      // lanes bind their own models by interface name and ignore this x-component.
      'x-component': 'StatusFlowSelect',
      enum: [],
    },
  };
  availableTypes = ['string'];
  hasDefaultValue = false;
  filterable = {
    operators: operators?.enumType || operators?.string || [],
  };
  titleUsable = true;
  properties = {
    ...defaultProps,
    statusFlow: {
      type: 'object',
      // Formily FormItem title in the classic field-config dialog → compiled via te (`{{t()}}`).
      title: te('Statuses & transitions'),
      'x-decorator': 'FormItem',
      'x-component': StatusFlowConfigEditorClassic,
    },
  };
}

export class PluginStatusFlowClient extends Plugin {
  async load() {
    // i18n: register locale bundles + the runtime translator BEFORE defining models / interfaces,
    // so define-time titles (model labels, flow/step titles) and the shared React widgets resolve
    // against this plugin's namespace. Missing keys fall back to the English key text.
    try {
      this.app.i18n.addResources('en-US', NS, enUS);
      this.app.i18n.addResources('vi-VN', NS, viVN);
      this.app.i18n.addResources('zh-CN', NS, zhCN);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[status-flow] i18n addResources failed', e);
    }
    setRuntimeT((s: string, opts?: any) => (this.app as any).i18n.t(s, { ns: NS, ...(opts || {}) }));

    // Icon registry consumer (docs/ICON-ARCHITECTURE.md) — classic lane has its own icons Map.
    setStatusFlowIconRegistry({ Icon, icons });
    // Also feed the @ptdl/shared registry so RegistryIconPicker (config editor) + IconByKey
    // (per-status icons in widgets/tags) resolve on this lane.
    setIconRegistry(Icon, icons);
    // Register the legacy-form editable/read-pretty component referenced by the interface uiSchema.
    this.app.addComponents({ StatusFlowSelect });
    this.app.dataSourceManager.addFieldInterfaces([StatusFlowFieldInterface]);

    // Flow-engine blocks also run on /admin; core field models there may register lazily,
    // so resolve SelectFieldModel with a short retry loop before subclass + bind.
    const fe: any = (this as any).flowEngine;
    const bind = (attempt = 0) => {
      const Base = fe?.getModelClass?.('SelectFieldModel');
      const DisplayBase = fe?.getModelClass?.('DisplayEnumFieldModel');
      const ActionBase = fe?.getModelClass?.('ActionModel');
      if (!Base || !DisplayBase || !ActionBase) {
        if (attempt < 10) setTimeout(() => bind(attempt + 1), 1000);
        return;
      }
      const StatusFlowFieldModel = defineStatusFlowFieldModel(Base);
      const StatusFlowDisplayFieldModel = defineStatusFlowDisplayModel(DisplayBase);
      const StatusTransitionActionModel = defineStatusTransitionActionModel(ActionBase);
      fe.registerModels({ StatusFlowFieldModel, StatusFlowDisplayFieldModel, StatusTransitionActionModel });
      // No allowClear: a status-flow value can't be cleared once set (the server rejects it
      // with a confusing "-> null" error), so don't offer a dead-end clear button in the UI.
      EditableItemModel.bindModelToInterface('StatusFlowFieldModel', ['statusFlow'], { isDefault: true });
      DisplayItemModel.bindModelToInterface('StatusFlowDisplayFieldModel', ['statusFlow'], { isDefault: true });
      FilterableItemModel.bindModelToInterface('SelectFieldModel', ['statusFlow'], {
        isDefault: true,
        defaultProps: { allowClear: true },
      });
      // eslint-disable-next-line no-console
      console.log('[status-flow] classic lane flow-engine bindings ready');
    };
    bind();

    // eslint-disable-next-line no-console
    console.log('[status-flow] client (classic lane) loaded');
  }
}

export default PluginStatusFlowClient;
