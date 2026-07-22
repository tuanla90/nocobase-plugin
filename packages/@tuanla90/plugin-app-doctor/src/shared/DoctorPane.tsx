import React from 'react';
import { Button, Table, Tag, Typography, Space, Alert, Popconfirm, message } from 'antd';

const RESOURCE = 'ptdlAppDoctor';
const { Title, Paragraph, Text } = Typography;

// read a raw-or-wrapped action body (server sets ctx.body raw; tolerate a {data:…} envelope too)
const readBody = (res: any) => res?.data?.data ?? res?.data ?? {};

const RELTYPE_LABEL: Record<string, string> = {
  belongsTo: 'thuộc về (n-1)',
  hasMany: 'một-nhiều (1-n)',
  hasOne: 'một-một (1-1)',
  belongsToMany: 'nhiều-nhiều (n-n)',
};

/**
 * App Doctor settings pane: scan the app for relation-integrity issues and one-click repair the fixable
 * ones (missing reverse relations). `api` = apiClient, `t` = translator (VN source key → EN).
 */
export const DoctorPane: React.FC<{ api: any; t?: (s: string) => string }> = ({ api, t: tin }) => {
  const t = tin || ((s: string) => s);
  const [scanning, setScanning] = React.useState(false);
  const [repairing, setRepairing] = React.useState<string | boolean>(false); // issue-id, or true = "all"
  const [result, setResult] = React.useState<any>(null);
  const [scanned, setScanned] = React.useState(false);

  const scan = React.useCallback(async () => {
    if (!api) return;
    setScanning(true);
    try {
      const res = await api.request({ url: `${RESOURCE}:scan`, method: 'post' });
      setResult(readBody(res));
      setScanned(true);
    } catch (e) {
      message.error(t('Quét thất bại (chỉ quản trị viên mới chạy được)'));
    } finally {
      setScanning(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  React.useEffect(() => {
    scan(); // auto-scan on open (read-only)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const repair = async (scope?: { collection?: string; field?: string }, key?: string) => {
    if (!api) return;
    setRepairing(key || true);
    try {
      const res = await api.request({ url: `${RESOURCE}:repair`, method: 'post', data: scope || {} });
      const body = readBody(res);
      const n = (body.fixed || []).length;
      const errs = (body.errors || []).length;
      if (n > 0) message.success(`${t('Đã sửa')} ${n} ${t('quan hệ')} — ${t('tải lại trang (F5) để thấy quan hệ mới')}`, 6);
      else if (!errs) message.info(t('Không có gì để sửa'));
      if (errs) message.warning(`${errs} ${t('quan hệ sửa lỗi')}`);
      await scan();
    } catch (e) {
      message.error(t('Sửa thất bại'));
    } finally {
      setRepairing(false);
    }
  };

  const issues: any[] = result?.issues || [];
  const summary = result?.summary;
  const fixableCount = summary?.fixable || 0;

  const columns = [
    {
      title: t('Mức'),
      dataIndex: 'severity',
      width: 100,
      render: (s: string) =>
        s === 'error' ? <Tag color="red">{t('Lỗi')}</Tag> : <Tag color="gold">{t('Cảnh báo')}</Tag>,
    },
    {
      title: t('Bảng'),
      dataIndex: 'collection',
      render: (_: any, r: any) => (
        <span>
          <Text strong>{r.collectionTitle || r.collection}</Text>
          {r.collectionTitle ? <Text type="secondary"> · {r.collection}</Text> : null}
        </span>
      ),
    },
    {
      title: t('Quan hệ'),
      dataIndex: 'field',
      render: (_: any, r: any) => (
        <span>
          {r.fieldTitle || r.field}{' '}
          <Tag>{t(RELTYPE_LABEL[r.relationType] || r.relationType)}</Tag>
          {r.target ? <Text type="secondary"> → {r.targetTitle || r.target}</Text> : null}
        </span>
      ),
    },
    { title: t('Vấn đề'), dataIndex: 'message' },
    {
      title: t('Hành động'),
      dataIndex: 'fixable',
      width: 130,
      render: (fixable: boolean, r: any) =>
        fixable ? (
          <Button
            size="small"
            type="primary"
            ghost
            loading={repairing === r.id}
            disabled={!!repairing && repairing !== r.id}
            onClick={() => repair({ collection: r.collection, field: r.field }, r.id)}
          >
            {t('Sửa')}
          </Button>
        ) : (
          <Tag>{t('Sửa thủ công')}</Tag>
        ),
    },
  ];

  return (
    <div style={{ maxWidth: 1040 }}>
      <Title level={4} style={{ marginTop: 0 }}>
        {t('App Doctor — Kiểm tra & sửa quan hệ')}
      </Title>
      <Paragraph type="secondary">
        {t('Quét toàn bộ bảng dữ liệu để tìm quan hệ hỏng: quan hệ một chiều (thiếu chiều ngược — thường do import/sinh app tự động, và là nguyên nhân treo khi mở sub-table), quan hệ trỏ tới bảng/bảng trung gian không tồn tại. Bấm “Sửa” để tự tạo quan hệ ngược còn thiếu (chỉ THÊM quan hệ ảo, không đụng dữ liệu).')}
      </Paragraph>

      <Space style={{ marginBottom: 16 }} wrap>
        <Button type="default" onClick={scan} loading={scanning}>
          {t('Quét lại')}
        </Button>
        <Popconfirm
          title={t('Tạo tất cả quan hệ ngược còn thiếu?')}
          description={t('Chỉ thêm quan hệ ảo, không thay đổi dữ liệu. Nên tải lại trang sau khi sửa.')}
          okText={t('Sửa tất cả')}
          cancelText={t('Huỷ')}
          onConfirm={() => repair()}
          disabled={fixableCount === 0}
        >
          <Button type="primary" loading={repairing === true} disabled={fixableCount === 0}>
            {t('Sửa tất cả')} {fixableCount ? `(${fixableCount})` : ''}
          </Button>
        </Popconfirm>
      </Space>

      {scanned && issues.length === 0 ? (
        <Alert type="success" showIcon message={t('Không phát hiện vấn đề quan hệ nào 🎉')} description={
          summary ? `${t('Đã quét')} ${summary.collectionsScanned} ${t('bảng')} · ${summary.relationsScanned} ${t('quan hệ')}.` : undefined
        } />
      ) : null}

      {issues.length > 0 ? (
        <>
          <Alert
            style={{ marginBottom: 12 }}
            type={issues.some((i) => i.severity === 'error') ? 'warning' : 'info'}
            showIcon
            message={`${t('Phát hiện')} ${summary?.total ?? issues.length} ${t('vấn đề')} · ${fixableCount} ${t('tự sửa được')} · ${(summary?.total ?? issues.length) - fixableCount} ${t('cần xử lý thủ công')}`}
            description={summary ? `${t('Đã quét')} ${summary.collectionsScanned} ${t('bảng')} · ${summary.relationsScanned} ${t('quan hệ')}.` : undefined}
          />
          <Table
            size="small"
            rowKey="id"
            columns={columns as any}
            dataSource={issues}
            pagination={issues.length > 20 ? { pageSize: 20 } : false}
          />
        </>
      ) : null}

      {!scanned && !scanning ? <Paragraph type="secondary">{t('Bấm “Quét lại” để kiểm tra.')}</Paragraph> : null}
    </div>
  );
};

export default DoctorPane;
