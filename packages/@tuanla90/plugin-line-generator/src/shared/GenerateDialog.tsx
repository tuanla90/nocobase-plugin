import React, { useEffect, useState } from 'react';
import { Alert, Button, Modal, Space, Table, Tag, Typography, message } from 'antd';
import { commitGenerate, previewGenerate, PreviewRow, RunResult } from './api';
import { t } from './i18n';

// Preview-then-commit dialog for a line generator. Opens on the record, dry-runs the rule to show the
// rows that WOULD be written (+ skipped rules), and only writes on confirm.

const errorText = (r: RunResult): string => {
  if (r.error === 'guard-failed') return t('Đơn chưa đủ điều kiện: {{detail}}', { detail: r.detail || '' });
  if (r.error === 'validation-failed') return t('Không đạt kiểm tra: {{detail}}', { detail: r.detail || '' });
  if (r.error === 'rule-not-found') return t('Không tìm thấy cấu hình bộ sinh');
  if (r.error === 'record-not-found') return t('Không tìm thấy bản ghi');
  return r.detail || r.error || t('Lỗi không xác định');
};

export const GenerateDialog: React.FC<{
  open: boolean;
  api: any;
  ruleKey: string;
  ruleTitle?: string;
  filterByTk: any;
  onClose: () => void;
  onDone?: () => void;
}> = ({ open, api, ruleKey, ruleTitle, filterByTk, onClose, onDone }) => {
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);

  useEffect(() => {
    if (!open) return;
    setResult(null);
    setLoading(true);
    // ignoreGuard: the button's visibility is now the creator's linkage rules, not the config guard —
    // so ALWAYS show what would be generated; guardOk/guardDetail carry the warning when it fails.
    previewGenerate(api, ruleKey, filterByTk, { ignoreGuard: true })
      .then(setResult)
      .catch((e) => setResult({ ok: false, error: e?.message || 'error' }))
      .finally(() => setLoading(false));
  }, [open, ruleKey, filterByTk]);

  const rows: PreviewRow[] = result?.lines || [];
  // Build columns from the union of row keys, hiding internal marker/hash columns.
  const HIDDEN = new Set(['_genRule', '_genHash']);
  const cols = Array.from(rows.reduce((s, r) => { Object.keys(r).forEach((k) => !HIDDEN.has(k) && s.add(k)); return s; }, new Set<string>()));
  const columns = cols.map((c) => ({ title: c, dataIndex: c, key: c, ellipsis: true, render: (v: any) => (v === null || v === undefined ? '' : String(v)) }));

  const guardFailed = !!result?.ok && result.guardOk === false;

  const doCommit = async () => {
    // Guard = the config's AUTO/default condition. A manual run may override it, but only after an
    // explicit confirm — the server rejects unless ignoreGuard is sent.
    if (guardFailed) {
      const yes = await new Promise<boolean>((resolve) => {
        Modal.confirm({
          title: t('Bản ghi chưa thỏa điều kiện của bộ sinh'),
          content: `${result?.guardDetail || ''}`,
          okText: t('Vẫn sinh dòng'),
          okButtonProps: { danger: true },
          cancelText: t('Đóng'),
          onOk: () => resolve(true),
          onCancel: () => resolve(false),
        });
      });
      if (!yes) return;
    }
    setCommitting(true);
    try {
      const r = await commitGenerate(api, ruleKey, filterByTk, { ignoreGuard: guardFailed });
      if (r.ok) {
        message.success(t('Đã tạo {{n}} dòng', { n: r.created ?? 0 }));
        onDone?.();
        onClose();
      } else {
        message.error(errorText(r));
      }
    } catch (e: any) {
      message.error(e?.message || t('Lỗi không xác định'));
    } finally {
      setCommitting(false);
    }
  };

  const canCommit = !!result?.ok && rows.length > 0;

  return (
    <Modal
      title={ruleTitle || t('Sinh dòng')}
      open={open}
      onCancel={onClose}
      width={820}
      destroyOnClose
      footer={[
        <Button key="cancel" onClick={onClose}>{t('Đóng')}</Button>,
        <Button key="ok" type="primary" loading={committing} disabled={!canCommit} onClick={doCommit}>
          {t('Xác nhận tạo {{n}} dòng', { n: rows.length })}
        </Button>,
      ]}
    >
      {loading ? (
        <div style={{ padding: 24, textAlign: 'center' }}>{t('Đang tính thử…')}</div>
      ) : !result ? null : !result.ok ? (
        <Alert type="warning" showIcon message={errorText(result)} />
      ) : (
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          {guardFailed ? (
            <Alert
              type="warning"
              showIcon
              message={t('Bản ghi chưa thỏa điều kiện của bộ sinh (điều kiện dùng cho auto)')}
              description={result?.guardDetail || undefined}
            />
          ) : null}
          <Space size="small" wrap>
            <Tag color="blue">{t('{{n}} dòng sẽ tạo', { n: rows.length })}</Tag>
            {result.skipped && result.skipped.length ? <Tag color="orange">{t('{{n}} bỏ qua', { n: result.skipped.length })}</Tag> : null}
            {result.errors && result.errors.length ? <Tag color="red">{t('{{n}} lỗi công thức', { n: result.errors.length })}</Tag> : null}
          </Space>
          <Table size="small" rowKey={(_, i) => String(i)} columns={columns} dataSource={rows} pagination={rows.length > 20 ? { pageSize: 20 } : false} scroll={{ x: true }} />
          {result.skipped && result.skipped.length ? (
            <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
              {t('Bỏ qua')}: {result.skipped.map((s, i) => `${s.rule?.name || ''}${s.detail ? ` (${s.detail})` : ''}`).filter(Boolean).slice(0, 30).join(', ')}
            </Typography.Paragraph>
          ) : null}
        </Space>
      )}
    </Modal>
  );
};
