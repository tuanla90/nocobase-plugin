/**
 * In-form Tabs — a "Tabs" item that appears in a Form block's "Fields" menu (under "Others",
 * next to Divider/Markdown). Each tab holds its own FormGridModel, so you can drop real fields
 * into each tab. Fields bind to the form the normal way: the form reads values from the Formily
 * `form` instance (form.getFieldsValue), and the value-runtime walks the model tree recursively —
 * neither cares how deep a field is nested, so fields inside tabs submit/validate correctly.
 *
 *   FormTabsItemModel extends CommonItemModel   → shows in the form "Fields" menu.
 *   each tab = the shared BlockTabPaneModel, whose `grid` sub-model is a FormGridModel here.
 *
 * Shares all styling/rendering with the block variant via renderTabsUI(model, 'FormGridModel').
 */
import { FormItem, tExpr } from '@nocobase/flow-engine';
import React from 'react';
import {
  NS,
  registerTabPaneModel,
  renderTabsUI,
  renderCollapseUI,
  tabStyleFlowStep,
  collapseStyleFlowStep,
} from './registerBlockTabs';

/** Register the in-form Tabs item. Safe no-op if the form item base is unavailable. */
export async function registerFormTabs(fe: any, deps: { Icon?: any } = {}): Promise<void> {
  if (!fe) return;
  if (fe.getModelClass && fe.getModelClass('FormTabsItemModel')) return;

  // Base = CommonItemModel (like Divider/Markdown form items); fall back to FormCustomItemModel.
  let Base: any;
  const resolve = (name: string) => {
    try {
      return fe.getModelClass && fe.getModelClass(name);
    } catch (e) {
      return undefined;
    }
  };
  try {
    Base = fe.getModelClassAsync ? await fe.getModelClassAsync('CommonItemModel') : resolve('CommonItemModel');
  } catch (e) {
    Base = resolve('CommonItemModel');
  }
  if (!Base) Base = resolve('FormCustomItemModel');
  if (!Base) {
    // eslint-disable-next-line no-console
    console.warn('[block-tabs] CommonItemModel/FormCustomItemModel not found — form Tabs not registered.');
    return;
  }

  // Shared tab-pane model (idempotent — usually already registered by registerBlockTabs).
  registerTabPaneModel(fe, deps.Icon);

  class FormTabsItemModel extends Base {
    render() {
      return (
        <FormItem showLabel={false}>
          {renderTabsUI(this, 'FormGridModel')}
        </FormItem>
      );
    }
  }

  FormTabsItemModel.define({
    label: tExpr('Tabs', { ns: NS }),
    createModelOptions: { use: 'FormTabsItemModel' },
    sort: 720,
  });

  FormTabsItemModel.registerFlow({
    key: 'formTabsSettings',
    title: tExpr('Tabs', { ns: NS }),
    sort: 300,
    steps: {
      tabStyle: tabStyleFlowStep(),
    },
  });

  fe.registerModels({ FormTabsItemModel });
}

/** Register the in-form Sections (Collapse) item — collapsible sections of fields inside a Form.
 *  Same shared panes + settings as the block Collapse, but each pane's grid is a FormGridModel. */
export async function registerFormCollapse(fe: any, deps: { Icon?: any } = {}): Promise<void> {
  if (!fe) return;
  if (fe.getModelClass && fe.getModelClass('FormCollapseItemModel')) return;

  let Base: any;
  const resolve = (name: string) => {
    try {
      return fe.getModelClass && fe.getModelClass(name);
    } catch (e) {
      return undefined;
    }
  };
  try {
    Base = fe.getModelClassAsync ? await fe.getModelClassAsync('CommonItemModel') : resolve('CommonItemModel');
  } catch (e) {
    Base = resolve('CommonItemModel');
  }
  if (!Base) Base = resolve('FormCustomItemModel');
  if (!Base) {
    // eslint-disable-next-line no-console
    console.warn('[block-tabs] CommonItemModel/FormCustomItemModel not found — form Sections not registered.');
    return;
  }

  // Shared tab-pane model (idempotent — usually already registered by registerBlockTabs).
  registerTabPaneModel(fe, deps.Icon);

  class FormCollapseItemModel extends Base {
    render() {
      return <FormItem showLabel={false}>{renderCollapseUI(this, 'FormGridModel')}</FormItem>;
    }
  }

  FormCollapseItemModel.define({
    label: tExpr('Collapse (Sections)', { ns: NS }),
    createModelOptions: { use: 'FormCollapseItemModel' },
    sort: 721,
  });

  FormCollapseItemModel.registerFlow({
    key: 'formCollapseSettings',
    title: tExpr('Collapse', { ns: NS }),
    sort: 300,
    steps: {
      collapseStyle: collapseStyleFlowStep(),
    },
  });

  fe.registerModels({ FormCollapseItemModel });
}
