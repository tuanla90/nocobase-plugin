import React from 'react';
import { ColorPicker } from 'antd';
import { ChangeLogHistory } from './ChangeLogSurfaces';
import { t, te } from './changeLogClient';

// Background color field for the block settings (outputs a hex string, clearable = no background).
const BgColorField: React.FC<any> = ({ value, onChange }) => (
  <ColorPicker
    allowClear
    value={value || undefined}
    onChange={(_c: any, hex: string) => onChange?.(hex)}
    onClear={() => onChange?.('')}
  />
);

// Standalone block: drop it on a record detail page to show that record's change-history timeline
// inline. Reads the record + api from the flow context the same way the record action does; when
// there's no record in scope (e.g. placed on a plain page) it shows a hint instead of crashing.

// The record this block is scoped to. On a record view (detail popup/page) NocoBase exposes the
// identity directly via `context.view.inputArgs` ({collectionName, filterByTk}) — exactly what we
// need (filterByTk = recordId). Fall back to an ambient `context.record` when nested inside a
// details/form block. Same access the core CollectionBlockModel uses.
function resolveCtx(model: any) {
  const ctx: any = model?.context || {};
  const api = ctx.api || ctx.app?.apiClient;
  const inputArgs = ctx.view?.inputArgs || {};
  let collectionName = inputArgs.collectionName;
  let recordId = inputArgs.filterByTk;

  if (collectionName == null || recordId == null) {
    const collection = ctx.collection || ctx.blockModel?.collection;
    const record = ctx.record;
    if (collection && record) {
      collectionName = collectionName ?? collection.name;
      const tk = collection.filterTargetKey || 'id';
      recordId = recordId ?? record[Array.isArray(tk) ? tk[0] : tk];
    }
  }
  return { collectionName, recordId, api };
}

export async function registerChangeHistoryBlock(fe: any): Promise<void> {
  if (!fe) return;
  if (fe.getModelClass?.('ChangeHistoryBlockModel')) return;

  let BlockModel: any;
  try {
    BlockModel = fe.getModelClassAsync ? await fe.getModelClassAsync('BlockModel') : fe.getModelClass?.('BlockModel');
  } catch (e) {
    BlockModel = fe.getModelClass?.('BlockModel');
  }
  if (!BlockModel) {
    // eslint-disable-next-line no-console
    console.warn('[change-log] core BlockModel not found — history block not registered.');
    return;
  }

  // Implement renderComponent (NOT render) so the core BlockModel wraps us in its Card — that
  // gives the built-in "Card settings" (title & description) for free, so we don't duplicate a
  // title. We only add a background-color option the core card doesn't provide.
  class ChangeHistoryBlockModel extends BlockModel {
    renderComponent() {
      const { collectionName, recordId, api } = resolveCtx(this);
      if (!collectionName || recordId === undefined || recordId === null || recordId === '') {
        return (
          <div style={{ padding: 10, opacity: 0.6, fontSize: 13 }}>
            {t('Add this block to a record page to see its history.')}
          </div>
        );
      }
      return <ChangeLogHistory api={api} collectionName={collectionName} recordId={recordId} />;
    }
  }

  (ChangeHistoryBlockModel as any).define({
    label: te('Change history'),
    icon: 'HistoryOutlined',
    createModelOptions: { use: 'ChangeHistoryBlockModel' },
    sort: 720,
  });

  // Only a background color — title/description come from the core "Card settings" flow.
  (ChangeHistoryBlockModel as any).registerFlow?.({
    key: 'changeHistoryBlockBg',
    title: te('Background'),
    sort: 320,
    steps: {
      background: {
        title: te('Background'),
        uiSchema: {
          background: {
            type: 'string',
            title: te('Background color'),
            'x-decorator': 'FormItem',
            'x-component': BgColorField,
          },
        },
        defaultParams: { background: '' },
        handler(ctx: any, params: any) {
          // Color the whole block card via the core decoratorProps.style.
          ctx.model.setDecoratorProps({ style: params.background ? { background: params.background } : {} });
        },
      },
    },
  });

  fe.registerModels({ ChangeHistoryBlockModel });
}
