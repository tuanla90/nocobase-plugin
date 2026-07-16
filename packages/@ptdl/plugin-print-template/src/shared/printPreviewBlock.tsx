import React from 'react';
import { Alert } from 'antd';
import { PrintConfigPanel } from './PrintConfigPanel';
import { attachmentFieldsOf } from './pdfSave';
import { AUTO_TEMPLATE, settingsCollection, templateSelectSchema } from './printService';
import { t, te } from './i18n';

// "Print preview" BLOCK: drop it on a record page/popup, pick the template in the
// block settings (admin-only), and it renders that template inline for the current
// record with a floating In / Save-PDF bar — the native replacement for the user's
// old custom-HTML invoice block.

const BlockBody: React.FC<{ model: any }> = ({ model }) => {
  const ctx: any = model?.context;
  // A standalone block has no record resource of its own — but a record page/popup
  // carries the record identity in ctx.view.inputArgs (filterByTk + collectionName +
  // dataSourceKey), and the collection object comes from dataSourceManager. This is
  // how core CollectionBlockModel resolves the current record too.
  const inputArgs = ctx?.view?.inputArgs || {};
  const dataSourceKey = inputArgs.dataSourceKey || 'main';
  const collectionName = inputArgs.collectionName;
  const collection =
    (collectionName && ctx?.dataSourceManager?.getCollection?.(dataSourceKey, collectionName)) ||
    ctx?.collection ||
    ctx?.blockModel?.collection;
  // filterByTk in the view inputArgs covers detail pages AND popups; fall back to a
  // record object on the context if some popup shapes only expose that.
  const tkField = collection?.filterTargetKey || 'id';
  const tkKey = Array.isArray(tkField) ? tkField[0] : tkField;
  const rec = ctx?.record || ctx?.currentRecord || ctx?.popup?.record;
  const tk = inputArgs.filterByTk ?? rec?.[tkKey];

  const { ptTemplateId, ptTargetField }: any = model?.props || {};

  if (!collection?.name || tk == null) {
    return (
      <Alert
        type="info"
        showIcon
        message={t('Print preview cần ngữ cảnh record')}
        description={t('Đặt block này trong POPUP/TRANG CHI TIẾT của một record (mở từ 1 dòng dữ liệu). Trang trống hoặc form tạo mới sẽ không có record để xem trước.')}
      />
    );
  }
  if (!ptTemplateId) {
    return (
      <Alert
        type="warning"
        showIcon
        message={t('Chưa chọn template')}
        description={t('Mở ⚙ cấu hình của block (Print preview settings) để chọn template in.')}
      />
    );
  }
  const isAuto = ptTemplateId === AUTO_TEMPLATE;
  return (
    <PrintConfigPanel
      api={ctx?.api}
      collection={collection}
      tk={tk}
      pinnedTemplateId={isAuto ? undefined : Number(ptTemplateId)}
      autoByRecord={isAuto}
      defaultTargetField={ptTargetField}
      headerless
      compact
    />
  );
};

export function definePrintPreviewBlockModel(Base: any) {
  class PrintPreviewBlockModel extends Base {
    render() {
      return (
        <div style={{ padding: 4 }}>
          <BlockBody model={this} />
        </div>
      );
    }
  }

  (PrintPreviewBlockModel as any).define({
    label: te('Xem trước bản in'),
    icon: 'lucide-printer',
    createModelOptions: { use: 'PrintPreviewBlockModel' },
    sort: 730,
  });

  (PrintPreviewBlockModel as any).registerFlow({
    key: 'ptdlPrintPreview',
    title: te('Xem trước bản in'),
    sort: 300,
    steps: {
      settings: {
        title: te('Cấu hình xem trước bản in'),
        uiSchema: async (ctx: any) => {
          const collection = settingsCollection(ctx);
          const attFields = attachmentFieldsOf(collection);
          return {
            ptTemplateId: await templateSelectSchema(ctx, te('Template'), false),
            ptTargetField: {
              type: 'string',
              title: te('Field đính kèm cho nút "Lưu vào field" (tuỳ chọn)'),
              'x-decorator': 'FormItem',
              'x-component': 'Select',
              'x-component-props': { allowClear: true, placeholder: te('Không chọn = ẩn nút Lưu') },
              enum: attFields.map((f: any) => ({
                label: f?.uiSchema?.title || f?.options?.uiSchema?.title || f.name,
                value: f.name,
              })),
            },
          };
        },
        handler(ctx: any, params: any) {
          ctx.model.setProps({ ptTemplateId: params.ptTemplateId, ptTargetField: params.ptTargetField });
        },
      },
    },
  });

  return PrintPreviewBlockModel;
}
