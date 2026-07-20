import React from 'react';
import { Tooltip } from 'antd';
import { ChangeLogTrigger } from './ChangeLogSurfaces';
import { t, te } from './changeLogClient';

// Record action: a button that opens this record's change history — either in a drawer (full) or
// a popover (compact). It shows the FULL history (what is logged is decided solely by the Change
// Log settings page — single source of truth); this action only controls how it is displayed.
export function defineChangeHistoryAction(Base: any) {
  class ChangeHistoryActionModel extends Base {
    static scene = 'record';

    defaultProps: any = {
      title: 'History',
    };

    getAclActionName() {
      return 'get';
    }

    render() {
      const ctx: any = (this as any).context;
      const props: any = (this as any).props || {};
      const collection = ctx?.collection || ctx?.blockModel?.collection;
      const record = ctx?.record;
      const api = ctx?.api;
      const tkField = collection?.filterTargetKey || 'id';
      const recordId = record?.[Array.isArray(tkField) ? tkField[0] : tkField];

      const rawTitle = props.title || (typeof (this as any).getTitle === 'function' ? (this as any).getTitle() : '') || 'History';
      const title = t(rawTitle);

      if (!collection || record == null || recordId === undefined || recordId === null) {
        return (
          <Tooltip title={t('Open a record to see its history')}>
            <span style={{ opacity: 0.5 }}>{title}</span>
          </Tooltip>
        );
      }

      return (
        <ChangeLogTrigger
          api={api}
          collectionName={collection.name}
          recordId={recordId}
          mode={props.sfMode === 'popover' ? 'popover' : 'drawer'}
          showBadge={!!props.sfShowBadge}
          label={title}
          buttonProps={{ type: props.type, size: props.size }}
        />
      );
    }
  }

  (ChangeHistoryActionModel as any).define?.({
    label: te('Change history'),
    sort: 56,
  });

  (ChangeHistoryActionModel as any).registerFlow?.({
    key: 'ptdlChangeHistory',
    title: te('Change history'),
    sort: 600,
    steps: {
      settings: {
        title: te('Change history settings'),
        // Display-only: WHAT is logged lives entirely on the Change Log settings page.
        uiSchema: {
          sfMode: {
            type: 'string',
            title: te('Display as'),
            'x-decorator': 'FormItem',
            'x-component': 'Select',
            enum: [
              { label: te('Drawer (full)'), value: 'drawer' },
              { label: te('Popover (compact)'), value: 'popover' },
            ],
          },
          sfShowBadge: {
            type: 'boolean',
            title: te('Show count badge'),
            'x-decorator': 'FormItem',
            'x-component': 'Checkbox',
          },
        },
        defaultParams: { sfMode: 'drawer', sfShowBadge: false },
        handler(ctx: any, params: any) {
          ctx.model.setProps({ sfMode: params.sfMode || 'drawer', sfShowBadge: !!params.sfShowBadge });
        },
      },
    },
  });

  return ChangeHistoryActionModel;
}
