import React, { useCallback } from 'react';
import { Form } from 'antd';
import {
  ActionModel,
  CollectionFieldInterface,
  DisplayEnumFieldModel,
  Icon,
  Plugin,
  SelectFieldModel,
  icons,
  useApp,
} from '@nocobase/client-v2';
import { setIconRegistry } from '@ptdl/shared';
import { setStatusFlowIconRegistry } from '../shared/iconRegistry';
import { NS, setRuntimeT, tt } from '../shared/i18n';
import enUS from '../locale/en-US.json';
import viVN from '../locale/vi-VN.json';
import zhCN from '../locale/zh-CN.json';
import { DisplayItemModel, EditableItemModel, FilterableItemModel } from '@nocobase/flow-engine';
import { StatusFlowConfigEditor } from '../shared/StatusFlowConfigEditor';
import { defineStatusFlowFieldModel } from '../shared/statusFlowFieldModel';
import { defineStatusFlowDisplayModel } from '../shared/statusFlowDisplayModel';
import { defineStatusTransitionActionModel } from '../shared/statusTransitionAction';

// Custom configure item for the /v/ field dialog. The dialog passes the antd FormInstance
// (not value/onChange), so we watch/write the two paths ourselves: `statusFlow` (this item's
// own name) and `uiSchema.enum` (kept in sync so display/classic render like a normal select).
const StatusFlowConfigItem: React.FC<any> = (props) => {
  const { form } = props;
  const app: any = useApp();
  // The paths we edit have no Form.Item, so plain useWatch(path, form) sees nothing (antd only
  // exposes REGISTERED fields to watchers without `preserve: true`) — the old config looked
  // "lost" in the edit dialog and adds were invisible. preserve:true reads the full store.
  const watchedFlow = Form.useWatch(['statusFlow'], { form, preserve: true } as any);
  const watchedEnum = Form.useWatch(['uiSchema', 'enum'], { form, preserve: true } as any);
  const [, force] = React.useReducer((x: number) => x + 1, 0);
  const flowValue = watchedFlow ?? form?.getFieldValue?.(['statusFlow']);
  const enumValue = watchedEnum ?? form?.getFieldValue?.(['uiSchema', 'enum']);
  // The dialog fills the form via resetFields()+setFieldsValue in an effect AFTER mount —
  // re-read once shortly after so the existing config shows even if the watcher missed it.
  React.useEffect(() => {
    const t = setTimeout(force, 120);
    return () => clearTimeout(t);
  }, []);
  const fetchRoles = useCallback(async () => {
    const res = await app?.apiClient?.request({
      url: 'roles:list',
      params: { paginate: false, fields: ['name', 'title'] },
    });
    return res?.data?.data || [];
  }, [app]);
  return (
    <StatusFlowConfigEditor
      enumValue={enumValue}
      flowValue={flowValue}
      onChange={(nextEnum, nextFlow) => {
        form.setFieldValue(['uiSchema', 'enum'], nextEnum);
        form.setFieldValue(['statusFlow'], nextFlow);
        // Create forms prefill from collectionField.defaultValue — keep it on the initial status.
        form.setFieldValue(['defaultValue'], nextFlow.initial ?? null);
        force();
      }}
      fetchRoles={fetchRoles}
    />
  );
};

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
      'x-component': 'Select',
      enum: [],
    },
  };
  availableTypes = ['string'];
  hasDefaultValue = false;
  filterable = {
    operators: 'enumType',
  };
  titleUsable = true;
  configure = {
    items: [
      {
        name: 'statusFlow',
        // Config-dialog item label. Rendered as a plain string by the /v/ field dialog (not a
        // compiled schema title), so use the runtime translator (resolved at interface construction).
        title: tt('Statuses & transitions'),
        Component: StatusFlowConfigItem,
      },
    ],
  };
}

export class PluginStatusFlowClientV2 extends Plugin {
  async load() {
    // i18n: register locale bundles + the runtime translator BEFORE defining models / interfaces,
    // so define-time titles (model labels, flow/step titles) and interface labels resolve against
    // this plugin's namespace. Missing keys fall back to the English key text.
    try {
      this.app.i18n.addResources('en-US', NS, enUS);
      this.app.i18n.addResources('vi-VN', NS, viVN);
      this.app.i18n.addResources('zh-CN', NS, zhCN);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[status-flow] i18n addResources failed', e);
    }
    setRuntimeT((s: string, opts?: any) => (this.app as any).i18n.t(s, { ns: NS, ...(opts || {}) }));

    // Icon registry consumer (docs/ICON-ARCHITECTURE.md): lucide-* keys come from
    // @ptdl/plugin-custom-icons; antd keys are the built-in fallback.
    setStatusFlowIconRegistry({ Icon, icons });
    // Also feed the @ptdl/shared registry so RegistryIconPicker (config editor) + IconByKey
    // (per-status icons in widgets/tags) resolve on this lane.
    setIconRegistry(Icon, icons);
    this.app.addFieldInterfaces([StatusFlowFieldInterface]);

    const engine: any = (this as any).flowEngine || (this.app as any).flowEngine;
    const StatusFlowFieldModel = defineStatusFlowFieldModel(SelectFieldModel);
    const StatusFlowDisplayFieldModel = defineStatusFlowDisplayModel(DisplayEnumFieldModel);
    const StatusTransitionActionModel = defineStatusTransitionActionModel(ActionModel);
    engine.registerModels({ StatusFlowFieldModel, StatusFlowDisplayFieldModel, StatusTransitionActionModel });

    // No allowClear: a status-flow value can't be cleared once set (the server rejects it with
    // a confusing "-> null" error), so don't offer a dead-end clear button in the UI.
    EditableItemModel.bindModelToInterface('StatusFlowFieldModel', ['statusFlow'], { isDefault: true });
    // Display (table cells, details): DisplayEnumFieldModel subclass — tags plus optional
    // flow-graph popover & quick transition buttons (column settings "Status flow options").
    DisplayItemModel.bindModelToInterface('StatusFlowDisplayFieldModel', ['statusFlow'], { isDefault: true });
    FilterableItemModel.bindModelToInterface('SelectFieldModel', ['statusFlow'], {
      isDefault: true,
      defaultProps: { allowClear: true },
    });

    // eslint-disable-next-line no-console
    console.log('[status-flow] client-v2 lane loaded');
  }
}

export default PluginStatusFlowClientV2;
