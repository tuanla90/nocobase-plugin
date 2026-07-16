import React, { useState } from 'react';
import { Button, Tooltip, message } from 'antd';
import { RegistryIcon } from './iconRegistry';
import { attachmentFieldsOf, savePdfToField } from './pdfSave';
import { AUTO_TEMPLATE, fetchRecordData, fetchTemplates, templateSelectSchema } from './printService';
import { pickTemplateForRecord } from './types';
import { t, te } from './i18n';

// One-click "Save PDF to field" record action: renders the configured template and
// attaches the PDF to the configured attachment field — no dialogs, made for flows
// like "chốt đơn → lưu hoá đơn PDF vào hồ sơ".

const SaveButton: React.FC<{
  api: any;
  collection: any;
  tk: any;
  templateId?: number | string;
  targetField?: string;
  label: React.ReactNode;
  btnProps: any;
  onSaved: () => void;
}> = ({ api, collection, tk, templateId, targetField, label, btnProps, onSaved }) => {
  const [busy, setBusy] = useState(false);
  const icon = <RegistryIcon type="lucide-save" fallback="SaveOutlined" style={{ fontSize: 13 }} />;

  let reason = '';
  if (!collection?.name) reason = t('Không có ngữ cảnh collection');
  else if (tk == null) reason = t('Không có ngữ cảnh bản ghi');
  else if (!targetField) reason = t('Chưa cấu hình field đích — mở settings của nút này (Save PDF settings)');

  const run = async (e: any) => {
    e?.stopPropagation?.();
    setBusy(true);
    try {
      const list = await fetchTemplates(api, collection.name);
      let tpl;
      if (templateId === AUTO_TEMPLATE) {
        // auto mode: pick by the record's data (condition)
        const rec = await fetchRecordData(api, { collectionName: collection.name } as any, tk).catch(() => ({}));
        tpl = pickTemplateForRecord(list, rec);
      } else {
        tpl = (templateId && list.find((t) => t.id === Number(templateId))) || list[0];
      }
      if (!tpl) throw new Error(t('Chưa có template in cho collection này'));
      const r = await savePdfToField(api, tpl, tk, targetField!);
      message.success(t('Đã lưu {{filename}}', { filename: r.filename }));
      onSaved();
    } catch (err: any) {
      message.error(err?.response?.data?.errors?.[0]?.message || err?.message || t('Lưu PDF thất bại'));
    } finally {
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

export function defineSaveToFieldActionModel(Base: any) {
  class SavePdfToFieldActionModel extends Base {
    static scene = 'record';

    defaultProps: any = {
      title: 'Lưu PDF',
    };

    getAclActionName() {
      return 'update';
    }

    render() {
      const { ptTemplateId, ptTargetField, tooltip, title, children, ...btnProps }: any = (this as any).props || {};
      const ctx: any = (this as any).context;
      const collection = ctx?.collection || ctx?.blockModel?.collection;
      const record = ctx?.record;
      const tkField = collection?.filterTargetKey || 'id';
      const tk = record?.[Array.isArray(tkField) ? tkField[0] : tkField];
      const resolved = (typeof (this as any).getTitle === 'function' ? (this as any).getTitle() : title) || 'Lưu PDF';
      const label = children || (typeof resolved === 'string' ? t(resolved) : resolved);
      const btn = (
        <SaveButton
          api={ctx?.api}
          collection={collection}
          tk={tk}
          templateId={ptTemplateId === AUTO_TEMPLATE ? AUTO_TEMPLATE : ptTemplateId ? Number(ptTemplateId) : undefined}
          targetField={ptTargetField}
          label={label}
          btnProps={btnProps}
          onSaved={() => (ctx?.blockModel?.resource?.refresh?.() || ctx?.resource?.refresh?.())}
        />
      );
      return tooltip ? <Tooltip title={tooltip}>{btn}</Tooltip> : btn;
    }
  }

  (SavePdfToFieldActionModel as any).define({
    label: te('Lưu PDF vào field'),
    sort: 57,
  });

  (SavePdfToFieldActionModel as any).registerFlow({
    key: 'ptdlSavePdf',
    title: te('Lưu PDF'),
    sort: 600,
    steps: {
      settings: {
        title: te('Cấu hình lưu PDF'),
        uiSchema: async (ctx: any) => {
          const collection = ctx?.model?.context?.collection || ctx?.model?.context?.blockModel?.collection;
          const attFields = attachmentFieldsOf(collection);
          return {
            ptTargetField: {
              type: 'string',
              title: te('Field đính kèm (bắt buộc)'),
              'x-decorator': 'FormItem',
              'x-component': 'Select',
              enum: attFields.map((f: any) => ({
                label: f?.uiSchema?.title || f?.options?.uiSchema?.title || f.name,
                value: f.name,
              })),
            },
            ptTemplateId: await templateSelectSchema(ctx, te('Template (trống = template đầu tiên của collection)'), true),
          };
        },
        handler(ctx: any, params: any) {
          ctx.model.setProps({ ptTargetField: params.ptTargetField, ptTemplateId: params.ptTemplateId });
        },
      },
    },
  });

  return SavePdfToFieldActionModel;
}
