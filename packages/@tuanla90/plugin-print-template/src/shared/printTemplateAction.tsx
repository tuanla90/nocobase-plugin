import React, { useState } from 'react';
import { Button, Modal, Tooltip } from 'antd';
import { RegistryIcon } from './iconRegistry';
import { PrintConfigPanel } from './PrintConfigPanel';
import { AUTO_TEMPLATE, templateSelectSchema } from './printService';
import { t, te } from './i18n';

// "Print template" record action: opens the print-config screen (template picker +
// live preview for this record + In / Save-PDF-to-field) instead of printing blind.

const PrintButton: React.FC<{
  api: any;
  collection: any;
  record: any;
  tk: any;
  pinnedId?: number | string;
  label: React.ReactNode;
  btnProps: any;
}> = ({ api, collection, record, tk, pinnedId, label, btnProps }) => {
  const [open, setOpen] = useState(false);
  const icon = <RegistryIcon type="lucide-printer" fallback="PrinterOutlined" style={{ fontSize: 13 }} />;

  let reason = '';
  if (!collection?.name) reason = t('Không có ngữ cảnh collection');
  else if (!record || tk == null) reason = t('Không có ngữ cảnh bản ghi');

  if (reason) {
    return (
      <Tooltip title={reason}>
        <Button {...btnProps} disabled>
          {icon}
          {label}
        </Button>
      </Tooltip>
    );
  }

  return (
    <>
      <Button
        {...btnProps}
        onClick={(e: any) => {
          e?.stopPropagation?.();
          setOpen(true);
        }}
      >
        {icon}
        {label}
      </Button>
      <Modal
        title={t('In / xuất PDF')}
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
        width={980}
        destroyOnClose
      >
        <PrintConfigPanel
          api={api}
          collection={collection}
          tk={tk}
          pinnedTemplateId={pinnedId === AUTO_TEMPLATE ? undefined : (pinnedId as number | undefined)}
          autoByRecord={pinnedId === AUTO_TEMPLATE}
          onDone={() => setOpen(false)}
        />
      </Modal>
    </>
  );
};

export function definePrintTemplateActionModel(Base: any) {
  class PrintTemplateActionModel extends Base {
    static scene = 'record';

    defaultProps: any = {
      title: 'In',
    };

    getAclActionName() {
      return 'get';
    }

    render() {
      const { ptTemplateId, iconOnly, tooltip, title, children, ...btnProps }: any = (this as any).props || {};
      void iconOnly;
      const ctx: any = (this as any).context;
      const collection = ctx?.collection || ctx?.blockModel?.collection;
      const record = ctx?.record;
      const tkField = collection?.filterTargetKey || 'id';
      const tk = record?.[Array.isArray(tkField) ? tkField[0] : tkField];
      const resolved = (typeof (this as any).getTitle === 'function' ? (this as any).getTitle() : title) || 'In';
      const label = children || (typeof resolved === 'string' ? t(resolved) : resolved);
      const btn = (
        <PrintButton
          api={ctx?.api}
          collection={collection}
          record={record}
          tk={tk}
          pinnedId={ptTemplateId === AUTO_TEMPLATE ? AUTO_TEMPLATE : ptTemplateId ? Number(ptTemplateId) : undefined}
          label={label}
          btnProps={btnProps}
        />
      );
      return tooltip ? <Tooltip title={tooltip}>{btn}</Tooltip> : btn;
    }
  }

  (PrintTemplateActionModel as any).define({
    label: te('Mẫu in'),
    sort: 56,
  });

  (PrintTemplateActionModel as any).registerFlow({
    key: 'ptdlPrintTemplate',
    title: te('Mẫu in'),
    sort: 600,
    steps: {
      settings: {
        title: te('Cấu hình mẫu in'),
        uiSchema: async (ctx: any) => ({
          ptTemplateId: await templateSelectSchema(ctx, te('Template (trống = cho chọn khi bấm In)'), true),
        }),
        handler(ctx: any, params: any) {
          ctx.model.setProps({ ptTemplateId: params.ptTemplateId });
        },
      },
    },
  });

  return PrintTemplateActionModel;
}
