// The print-config screen: pick a template, see the live preview for THIS record,
// then print or save the PDF into an attachment field. Reused by the Print action's
// modal and the "Print preview" block.
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Empty, Select, Space, Spin, message, theme } from 'antd';
import { ColumnSelect } from '@ptdl/shared';
import { attachmentFieldsOf, savePdfToField } from './pdfSave';
import { buildPrintDocument } from './printDoc';
import {
  ensureTemplateLibs,
  fetchRecordData,
  fetchTemplates,
  partialTemplates,
  printableTemplates,
  printRecord,
  renderTemplateParts,
} from './printService';
import { RegistryIcon } from './iconRegistry';
import { PrintTemplate, pickTemplateForRecord } from './types';
import { t } from './i18n';

function cleanTitle(raw: any, fallback: string): string {
  const s = String(raw ?? '');
  const m = s.match(/\{\{\s*t\(\s*['"]([^'"]+)['"]/);
  if (m) return m[1];
  if (!s || /\{\{/.test(s)) return fallback;
  return s;
}

export interface PrintConfigPanelProps {
  api: any;
  collection: any; // collection object (for attachment fields) — name via .name
  tk: any;
  /** pin one template (from action/block settings); undefined = user picks */
  pinnedTemplateId?: number;
  /** auto mode: pick the template dynamically from the record's data (condition) */
  autoByRecord?: boolean;
  /** compact = block mode (smaller preview) */
  compact?: boolean;
  /** preselected target field for save-to-field */
  defaultTargetField?: string;
  /** block mode: no header bar — actions float over the preview top-right */
  headerless?: boolean;
  onDone?: () => void;
}

export const PrintConfigPanel: React.FC<PrintConfigPanelProps> = ({
  api,
  collection,
  tk,
  pinnedTemplateId,
  autoByRecord,
  compact,
  defaultTargetField,
  headerless,
  onDone,
}) => {
  const { token } = theme.useToken();
  const collectionName = collection?.name;
  const [templates, setTemplates] = useState<PrintTemplate[] | null>(null);
  const [tplId, setTplId] = useState<number | undefined>(pinnedTemplateId);
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewErr, setPreviewErr] = useState('');
  const [rendering, setRendering] = useState(false);
  const [targetField, setTargetField] = useState<string | undefined>(defaultTargetField);
  const [saving, setSaving] = useState(false);
  const [hoverActions, setHoverActions] = useState(false);

  const attFields = useMemo(() => attachmentFieldsOf(collection), [collection]);

  useEffect(() => {
    let live = true;
    if (!collectionName) return;
    (async () => {
      const list = await fetchTemplates(api, collectionName);
      if (!live) return;
      setTemplates(list);
      const printable = printableTemplates(list);
      if (autoByRecord) {
        // resolve the template from the record's field value (condition)
        try {
          const res = await api.request({ url: `${collectionName}:get`, params: { filterByTk: tk } });
          const rec = res?.data?.data || {};
          if (live) setTplId(pickTemplateForRecord(printable, rec)?.id as number | undefined);
        } catch (e) {
          if (live) setTplId(printable[0]?.id as number | undefined);
        }
      } else {
        setTplId((cur) => cur ?? (printable[0]?.id as number | undefined));
      }
    })();
    return () => {
      live = false;
    };
  }, [api, collectionName, autoByRecord, tk]);

  const tpl = useMemo(() => (templates || []).find((t) => t.id === tplId), [templates, tplId]);

  useEffect(() => {
    let live = true;
    if (!tpl || tk == null) return;
    setRendering(true);
    (async () => {
      try {
        const [data] = await Promise.all([fetchRecordData(api, tpl, tk), ensureTemplateLibs(tpl)]);
        if (!live) return;
        const parts = renderTemplateParts(tpl, data, partialTemplates(templates || []));
        // Preview always uses the responsive (non-Paged.js) flavour so it stays
        // consistent and never overflows; real page numbers apply on actual print.
        const previewTpl = { ...tpl, pageSetup: { ...(tpl.pageSetup || {}), pageNumbers: false } };
        setPreviewHtml(buildPrintDocument(previewTpl, parts, { embedded: true }));
        setPreviewErr('');
      } catch (e: any) {
        if (live) setPreviewErr(e?.message || String(e));
      } finally {
        if (live) setRendering(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [api, tpl, tk]);

  if (!collectionName) return <Alert type="warning" message={t('Không có collection trong ngữ cảnh này')} />;
  if (tk == null) return <Alert type="warning" message={t('Không có record — đặt trong popup/trang chi tiết record')} />;
  if (templates && !templates.length)
    return (
      <Empty description={t('Chưa có template in cho collection này — thêm ở Settings → Print templates')} />
    );

  const doSave = async () => {
    if (!tpl || !targetField) return;
    setSaving(true);
    try {
      const r = await savePdfToField(api, tpl, tk, targetField);
      message.success(t('Đã lưu {{filename}} vào field', { filename: r.filename }));
      onDone?.();
    } catch (e: any) {
      message.error(e?.response?.data?.errors?.[0]?.message || e?.message || t('Lưu PDF thất bại'));
    } finally {
      setSaving(false);
    }
  };

  const printBtn = (
    <Button
      type="primary"
      size="small"
      disabled={!tpl}
      icon={<RegistryIcon type="lucide-printer" fallback="PrinterOutlined" style={{ fontSize: 13 }} />}
      onClick={() => tpl && printRecord(api, tpl, tk).catch((e) => message.error(e?.message || t('In thất bại')))}
    >
      {t('In / PDF')}
    </Button>
  );
  const saveBtn =
    defaultTargetField && attFields.some((f: any) => f.name === defaultTargetField) ? (
      <Button
        size="small"
        loading={saving}
        disabled={!tpl}
        icon={<RegistryIcon type="lucide-save" fallback="SaveOutlined" style={{ fontSize: 13 }} />}
        onClick={doSave}
      >
        {t('Lưu vào field')}
      </Button>
    ) : null;
  const iframe = (
    <iframe
      title="print-config-preview"
      srcDoc={previewHtml}
      style={{ width: '100%', height: compact ? 520 : 'calc(100vh - 240px)', border: 'none', display: 'block', background: '#fff' }}
    />
  );

  // Block mode: no header — actions float over the preview top-right; template is
  // fixed via block settings (admin-only), so no runtime picker. White buttons to
  // match the record action bar; translucent until hovered so the document behind
  // stays readable.
  if (headerless) {
    const whitePrint = (
      <Button
        size="small"
        disabled={!tpl}
        icon={<RegistryIcon type="lucide-printer" fallback="PrinterOutlined" style={{ fontSize: 13 }} />}
        onClick={() => tpl && printRecord(api, tpl, tk).catch((e) => message.error(e?.message || t('In thất bại')))}
      >
        {t('In / PDF')}
      </Button>
    );
    const whiteSave =
      defaultTargetField && attFields.some((f: any) => f.name === defaultTargetField) ? (
        <Button
          size="small"
          loading={saving}
          disabled={!tpl}
          icon={<RegistryIcon type="lucide-save" fallback="SaveOutlined" style={{ fontSize: 13 }} />}
          onClick={doSave}
        >
          {t('Lưu vào field')}
        </Button>
      ) : null;
    return (
      <div style={{ position: 'relative', border: '1px solid #eee', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
        <div
          style={{
            position: 'absolute',
            top: 14,
            right: 20,
            zIndex: 3,
            display: 'flex',
            gap: 8,
            opacity: hoverActions ? 1 : 0.55,
            transition: 'opacity .15s',
          }}
          onMouseEnter={() => setHoverActions(true)}
          onMouseLeave={() => setHoverActions(false)}
        >
          {whitePrint}
          {whiteSave}
        </div>
        {previewErr ? <Alert type="error" style={{ margin: 12 }} message={t('Lỗi template: {{err}}', { err: previewErr })} /> : <Spin spinning={rendering}>{iframe}</Spin>}
      </div>
    );
  }

  // Modal mode: explicit In/xuất PDF dialog — keep the picker + save-to-field toolbar.
  return (
    <div style={{ border: `1px solid ${token.colorBorderSecondary}`, borderRadius: 8, overflow: 'hidden', background: token.colorBgContainer }}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
          background: token.colorFillQuaternary,
        }}
      >
        {!pinnedTemplateId && !autoByRecord && (
          <Select
            size="small"
            style={{ minWidth: 200 }}
            placeholder={t('Chọn template')}
            value={tplId}
            onChange={(v) => setTplId(v)}
            options={(templates || []).map((t) => ({ value: t.id, label: t.title || `#${t.id}` }))}
          />
        )}
        {printBtn}
        <span style={{ flex: 1 }} />
        {attFields.length > 0 && (
          <Space.Compact size="small">
            <ColumnSelect
              size="small"
              style={{ minWidth: 180 }}
              placeholder={t('Field đính kèm...')}
              value={targetField}
              onChange={(v) => setTargetField(v)}
              options={attFields.map((f: any) => ({
                value: f.name,
                label: cleanTitle(f?.uiSchema?.title ?? f?.options?.uiSchema?.title, f.name),
                type: f.type ?? f?.options?.type,
                iface: f.interface ?? f?.options?.interface,
              }))}
            />
            <Button
              size="small"
              loading={saving}
              disabled={!tpl || !targetField}
              icon={<RegistryIcon type="lucide-save" fallback="SaveOutlined" style={{ fontSize: 13 }} />}
              onClick={doSave}
            >
              {t('Lưu vào field')}
            </Button>
          </Space.Compact>
        )}
      </div>
      {previewErr ? <Alert type="error" style={{ margin: 12 }} message={t('Lỗi template: {{err}}', { err: previewErr })} /> : <Spin spinning={rendering}>{iframe}</Spin>}
    </div>
  );
};
