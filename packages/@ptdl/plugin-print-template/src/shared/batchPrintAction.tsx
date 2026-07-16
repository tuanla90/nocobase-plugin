import React, { useState } from 'react';
import { Button, Tooltip, message } from 'antd';
import { RegistryIcon } from './iconRegistry';
import { AUTO_TEMPLATE, batchPrint, fetchTemplates, templateSelectSchema } from './printService';
import { batchExportZip, batchSaveToField } from './batchExport';
import { attachmentFieldsOf } from './pdfSave';
import { t, te } from './i18n';

// "In hàng loạt" collection action (table toolbar): prints the SELECTED rows — or all
// rows on the current page if none selected — into one document (one record/page).

const BatchButton: React.FC<{
  api: any;
  blockModel: any;
  collection: any;
  templateId?: number | string;
  mode?: string;
  targetField?: string;
  label: React.ReactNode;
  btnProps: any;
}> = ({ api, blockModel, collection, templateId, mode, targetField, label, btnProps }) => {
  const [busy, setBusy] = useState(false);
  const icon = <RegistryIcon type="lucide-printer" fallback="PrinterOutlined" style={{ fontSize: 13 }} />;

  const reason = !collection?.name ? t('Không có ngữ cảnh collection') : !blockModel?.resource ? t('Không có khối dữ liệu') : '';

  const run = async (e: any) => {
    e?.stopPropagation?.();
    const resource: any = blockModel?.resource;
    const tkField = collection.filterTargetKey || 'id';
    const tkKey = Array.isArray(tkField) ? tkField[0] : tkField;
    const selected: any[] = resource?.getSelectedRows?.() || [];
    const rows: any[] = selected.length ? selected : resource?.getData?.() || [];
    const tks = rows.map((r) => r?.[tkKey]).filter((v) => v != null);
    if (!tks.length) {
      message.warning(t('Chọn ít nhất 1 dòng để in (hoặc để trống sẽ in cả trang hiện tại)'));
      return;
    }
    const opts = {
      auto: templateId === AUTO_TEMPLATE,
      pinnedId: templateId && templateId !== AUTO_TEMPLATE ? Number(templateId) : undefined,
    };
    setBusy(true);
    const hide = message.loading(t('Đang xử lý {{count}} bản ghi...', { count: tks.length }), 0);
    try {
      const list = await fetchTemplates(api, collection.name);
      if (!list.length) throw new Error(t('Chưa có template in cho collection này'));
      if (mode === 'zip') {
        await batchExportZip(api, collection.name, list, tks, opts);
        message.success(t('Đã tải ZIP {{count}} file PDF', { count: tks.length }));
      } else if (mode === 'field') {
        if (!targetField) throw new Error(t('Chưa cấu hình field đích (mở settings của nút)'));
        await batchSaveToField(api, collection.name, list, tks, targetField, opts);
        message.success(t('Đã lưu PDF vào field cho {{count}} bản ghi', { count: tks.length }));
        await (resource?.refresh?.());
      } else {
        await batchPrint(api, collection.name, list, tks, opts);
      }
    } catch (err: any) {
      message.error(err?.response?.data?.errors?.[0]?.message || err?.message || t('In hàng loạt thất bại'));
    } finally {
      hide();
      setBusy(false);
    }
  };

  const btn = (
    <Button {...btnProps} loading={busy} disabled={!!reason || btnProps.disabled} onClick={run}>
      {icon}
      {label}
    </Button>
  );
  return reason ? <Tooltip title={reason}>{btn}</Tooltip> : btn;
};

export function defineBatchPrintActionModel(Base: any) {
  class BatchPrintActionModel extends Base {
    static scene = 'collection';

    defaultProps: any = { title: 'In hàng loạt' };

    getAclActionName() {
      return 'view';
    }

    render() {
      const { ptTemplateId, ptBatchMode, ptTargetField, tooltip, title, children, ...btnProps }: any =
        (this as any).props || {};
      const ctx: any = (this as any).context;
      const blockModel = ctx?.blockModel;
      const collection = ctx?.collection || blockModel?.collection;
      const resolved = (typeof (this as any).getTitle === 'function' ? (this as any).getTitle() : title) || 'In hàng loạt';
      const label = children || (typeof resolved === 'string' ? t(resolved) : resolved);
      const btn = (
        <BatchButton
          api={ctx?.api}
          blockModel={blockModel}
          collection={collection}
          templateId={ptTemplateId}
          mode={ptBatchMode}
          targetField={ptTargetField}
          label={label}
          btnProps={btnProps}
        />
      );
      return tooltip ? <Tooltip title={tooltip}>{btn}</Tooltip> : btn;
    }
  }

  (BatchPrintActionModel as any).define({ label: te('In hàng loạt'), sort: 58 });

  (BatchPrintActionModel as any).registerFlow({
    key: 'ptdlBatchPrint',
    title: te('In hàng loạt'),
    sort: 600,
    steps: {
      settings: {
        title: te('Cấu hình in hàng loạt'),
        uiSchema: async (ctx: any) => {
          const collection = ctx?.model?.context?.collection || ctx?.model?.context?.blockModel?.collection;
          const attFields = attachmentFieldsOf(collection);
          return {
            ptTemplateId: await templateSelectSchema(ctx, te('Template (hoặc Tự động theo dữ liệu)'), true),
            ptBatchMode: {
              type: 'string',
              title: te('Kiểu xuất'),
              'x-decorator': 'FormItem',
              'x-component': 'Select',
              default: 'print',
              enum: [
                { label: te('Gộp 1 file — mở cửa sổ in (Save PDF = vector)'), value: 'print' },
                { label: te('Tách nhiều file — tải về ZIP (mỗi bản ghi 1 PDF)'), value: 'zip' },
                { label: te('Tách — lưu PDF vào field từng bản ghi'), value: 'field' },
              ],
            },
            ptTargetField: {
              type: 'string',
              title: te('Field đính kèm (chỉ dùng khi kiểu = "lưu vào field")'),
              'x-decorator': 'FormItem',
              'x-component': 'Select',
              'x-component-props': { allowClear: true, placeholder: te('Chọn field attachment') },
              enum: attFields.map((f: any) => ({
                label: f?.uiSchema?.title || f?.options?.uiSchema?.title || f.name,
                value: f.name,
              })),
            },
          };
        },
        handler(ctx: any, params: any) {
          ctx.model.setProps({
            ptTemplateId: params.ptTemplateId,
            ptBatchMode: params.ptBatchMode || 'print',
            ptTargetField: params.ptTargetField,
          });
        },
      },
    },
  });

  return BatchPrintActionModel;
}
