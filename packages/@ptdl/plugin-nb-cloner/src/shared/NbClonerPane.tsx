import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, Tabs, Checkbox, Switch, Button, Table, Tag, Alert,
  message, Upload, Spin, Badge, Divider, Space, Typography, Input, Row, Col,
  notification, Result, Progress,
} from 'antd';
import {
  DownloadOutlined, UploadOutlined, ReloadOutlined,
  DatabaseOutlined, AppstoreOutlined, CheckCircleOutlined, CloseCircleOutlined,
} from '@ant-design/icons';
import { ConfigContainer, formatNumber } from '@ptdl/shared';
import { t } from './nbClonerClient';

const { Title, Text } = Typography;

interface CollectionInfo {
  name: string;
  title: string;
  type: 'system' | 'business';
  tableName: string;
  fieldsCount: number;
  rowCount?: number;
}

interface BusinessSelection {
  name: string;
  selected: boolean;
  includeData: boolean;
}

const yn = (b: boolean) => (b ? '✅' : '❌');

/** Read a file → base64 in 8 KB chunks (avoids call-stack overflow on large bundles). */
async function fileToBase64(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const uint8 = new Uint8Array(arrayBuffer);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < uint8.length; i += chunkSize) {
    binary += String.fromCharCode(...(uint8.subarray(i, i + chunkSize) as any));
  }
  return btoa(binary);
}

export function NbClonerPane({ api }: { api: any }) {
  // State
  const [loading, setLoading] = useState(false);
  const [collections, setCollections] = useState<{ system: CollectionInfo[]; business: CollectionInfo[] }>({ system: [], business: [] });
  const [businessSelections, setBusinessSelections] = useState<BusinessSelection[]>([]);
  const [options, setOptions] = useState({
    includeSystemSchema: true,
    includeUiSchemas: true,
    includeRoles: true,
    includeWorkflows: false,
    appName: 'my-app',
  });
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('export');
  const [pluginInfo, setPluginInfo] = useState<any>(null);
  const [updating, setUpdating] = useState(false);
  const [updateResult, setUpdateResult] = useState<any>(null);

  // Load thông tin phiên bản plugin
  const loadInfo = useCallback(async () => {
    try {
      const res = await api.request({ url: 'nbCloner:info', method: 'GET' });
      setPluginInfo(res.data?.data ?? res.data);
    } catch {
      /* ignore */
    }
  }, [api]);

  useEffect(() => {
    loadInfo();
  }, [loadInfo]);

  // Update plugin: đọc file zip → base64 → gửi selfUpdate
  const handleSelfUpdate = async (file: File) => {
    setUpdating(true);
    setUpdateResult(null);
    try {
      const base64 = await fileToBase64(file);
      const res = await api.request({
        url: 'nbCloner:selfUpdate',
        method: 'POST',
        data: { fileData: base64, filename: file.name },
      });
      const r = res.data?.data ?? res.data;   // NocoBase bọc trong { data }
      setUpdateResult(r);
      if (r?.success) {
        message.success(r?.message || t('Updated successfully!'));
      } else {
        message.error(r?.error || t('Update failed'));
      }
      loadInfo();
    } catch (err: any) {
      message.error(t('Update failed: {{msg}}', { msg: err.message }));
    } finally {
      setUpdating(false);
    }
    return false; // ngăn antd Upload tự upload
  };

  // Load collections
  const loadCollections = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.request({ url: 'nbCloner:listCollections', method: 'GET' });
      const data = res.data?.data ?? res.data;
      setCollections(data);
      setBusinessSelections(
        data.business.map((c: CollectionInfo) => ({
          name: c.name,
          selected: true,
          includeData: false,
        }))
      );
    } catch (err: any) {
      message.error(t('Failed to load collections: {{msg}}', { msg: err.message }));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    loadCollections();
  }, [loadCollections]);

  // Toggle business collection selection
  const toggleBusiness = (name: string, field: 'selected' | 'includeData', value: boolean) => {
    setBusinessSelections((prev) =>
      prev.map((s) => (s.name === name ? { ...s, [field]: value } : s))
    );
  };

  const toggleAllBusiness = (selected: boolean) => {
    setBusinessSelections((prev) => prev.map((s) => ({ ...s, selected })));
  };

  const toggleAllData = (includeData: boolean) => {
    setBusinessSelections((prev) => prev.map((s) => ({ ...s, includeData: s.selected ? includeData : s.includeData })));
  };

  // Export
  const handleExport = async () => {
    setExporting(true);
    try {
      const selectedBusiness = businessSelections
        .filter((s) => s.selected)
        .map((s) => ({ name: s.name, includeData: s.includeData }));

      const res = await api.request({
        url: 'nbCloner:export',
        method: 'POST',
        data: {
          ...options,
          businessCollections: selectedBusiness,
        },
        responseType: 'blob',
      });

      // Trigger download
      const blob = new Blob([res.data], { type: 'application/gzip' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nb-clone-${options.appName}-${new Date().toISOString().split('T')[0]}.nbc.gz`;
      a.click();
      URL.revokeObjectURL(url);
      message.success(t('Export successful! The file is downloading.'));
    } catch (err: any) {
      message.error(t('Export failed: {{msg}}', { msg: err.message }));
    } finally {
      setExporting(false);
    }
  };

  // Import — đọc file thành base64 rồi gửi JSON (multipart bị NocoBase middleware block)
  const handleImport = async (file: File) => {
    setImporting(true);
    setImportResult(null);
    try {
      const base64 = await fileToBase64(file);
      const res = await api.request({
        url: 'nbCloner:import',
        method: 'POST',
        data: { fileData: base64, filename: file.name },
      });
      const result = res.data?.data ?? res.data;   // NocoBase bọc trong { data }
      setImportResult(result);
      const okSteps = (result?.steps || []).filter((s: any) => s.status === 'ok').length;
      const errSteps = (result?.steps || []).filter((s: any) => s.status === 'error');
      if (result?.success) {
        notification.success({
          message: t('✅ Import successful'),
          description: t('Ran {{count}} steps OK. RESTART the app so the tables & UI appear fully.', { count: String(okSteps) }),
          duration: 10,
        });
      } else {
        notification.error({
          message: t('⚠️ Import finished with ERRORS'),
          description: t('{{count}} steps failed: {{steps}}. See the detail table below.', {
            count: String(errSteps.length),
            steps: errSteps.map((s: any) => s.step).join(', '),
          }),
          duration: 0,
        });
      }
    } catch (err: any) {
      notification.error({ message: t('Import failed'), description: err.message, duration: 0 });
    } finally {
      setImporting(false);
    }
    return false; // Ngăn Upload tự upload
  };

  // Business table columns
  const businessColumns = [
    {
      title: (
        <Checkbox
          checked={businessSelections.length > 0 && businessSelections.every((s) => s.selected)}
          indeterminate={businessSelections.some((s) => s.selected) && !businessSelections.every((s) => s.selected)}
          onChange={(e) => toggleAllBusiness(e.target.checked)}
        />
      ),
      width: 50,
      render: (_: any, record: CollectionInfo) => {
        const sel = businessSelections.find((s) => s.name === record.name);
        return (
          <Checkbox
            checked={sel?.selected}
            onChange={(e) => toggleBusiness(record.name, 'selected', e.target.checked)}
          />
        );
      },
    },
    {
      title: t('Collection'),
      dataIndex: 'name',
      render: (name: string, record: CollectionInfo) => (
        <Space direction="vertical" size={0}>
          <Text strong>{record.title}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>{name}</Text>
        </Space>
      ),
    },
    {
      title: t('Rows'),
      dataIndex: 'rowCount',
      width: 90,
      render: (v: number) =>
        v === undefined || v === null
          ? <Text type="secondary">–</Text>
          : <Tag color={v > 0 ? 'blue' : 'default'}>{formatNumber(v)}</Tag>,
    },
    {
      title: t('Fields'),
      dataIndex: 'fieldsCount',
      width: 70,
      render: (v: number) => <Tag>{formatNumber(v)}</Tag>,
    },
    {
      title: (
        <Space>
          {t('Copy Data')}
          <Button size="small" type="link" onClick={() => toggleAllData(true)}>{t('All')}</Button>
          <Button size="small" type="link" onClick={() => toggleAllData(false)}>{t('None')}</Button>
        </Space>
      ),
      width: 140,
      render: (_: any, record: CollectionInfo) => {
        const sel = businessSelections.find((s) => s.name === record.name);
        return (
          <Switch
            disabled={!sel?.selected}
            checked={sel?.includeData}
            onChange={(v) => toggleBusiness(record.name, 'includeData', v)}
            checkedChildren={t('Data')}
            unCheckedChildren={t('Schema only')}
            size="small"
          />
        );
      },
    },
  ];

  const selectedCount = businessSelections.filter((s) => s.selected).length;
  const withDataCount = businessSelections.filter((s) => s.selected && s.includeData).length;

  return (
    <ConfigContainer maxWidth={1000}>
      <Row justify="space-between" align="middle" gutter={16}>
        <Col flex="auto">
          <Title level={3} style={{ marginBottom: 0 }}>
            <AppstoreOutlined /> NB Cloner
          </Title>
          <Text type="secondary">
            {t('Clone all NocoBase configuration and data into a new app')}
          </Text>
        </Col>
        <Col>
          <Space direction="vertical" align="end" size={2}>
            <Tag
              color="geekblue"
              style={{ fontSize: 18, padding: '4px 14px', margin: 0, fontWeight: 600, borderRadius: 8 }}
            >
              v{pluginInfo?.version ?? '…'}
            </Tag>
            {pluginInfo?.fileVersion && pluginInfo.fileVersion !== pluginInfo.version && (
              <Tag color="orange" style={{ margin: 0 }}>
                {t('code v{{version}} · restart to sync', { version: pluginInfo.fileVersion })}
              </Tag>
            )}
          </Space>
        </Col>
      </Row>

      <Divider />

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'export',
            label: <span><DownloadOutlined /> {t('Export Bundle')}</span>,
            children: (
              <Space direction="vertical" style={{ width: '100%' }} size="large">
                {/* App name */}
                <Card size="small" title={t('Bundle info')}>
                  <Space>
                    <Text>{t('App name:')}</Text>
                    <Input
                      value={options.appName}
                      onChange={(e) => setOptions((o) => ({ ...o, appName: e.target.value }))}
                      style={{ width: 200 }}
                      placeholder="my-app"
                    />
                  </Space>
                </Card>

                {/* System options */}
                <Card size="small" title={<span><DatabaseOutlined /> {t('System (schema is always exported)')}</span>}>
                  <Row gutter={16}>
                    <Col span={6}>
                      <div>
                        <Switch
                          checked={options.includeSystemSchema}
                          onChange={(v) => setOptions((o) => ({ ...o, includeSystemSchema: v }))}
                          size="small"
                        />
                        <Text style={{ marginLeft: 8 }}>{t('Collections Schema')}</Text>
                      </div>
                    </Col>
                    <Col span={6}>
                      <div>
                        <Switch
                          checked={options.includeUiSchemas}
                          onChange={(v) => setOptions((o) => ({ ...o, includeUiSchemas: v }))}
                          size="small"
                        />
                        <Text style={{ marginLeft: 8 }}>{t('UI / Menus')}</Text>
                      </div>
                    </Col>
                    <Col span={6}>
                      <div>
                        <Switch
                          checked={options.includeRoles}
                          onChange={(v) => setOptions((o) => ({ ...o, includeRoles: v }))}
                          size="small"
                        />
                        <Text style={{ marginLeft: 8 }}>{t('Roles & Permissions')}</Text>
                      </div>
                    </Col>
                    <Col span={6}>
                      <div>
                        <Switch
                          checked={options.includeWorkflows}
                          onChange={(v) => setOptions((o) => ({ ...o, includeWorkflows: v }))}
                          size="small"
                        />
                        <Text style={{ marginLeft: 8 }}>{t('Workflows')}</Text>
                      </div>
                    </Col>
                  </Row>
                </Card>

                {/* Business collections */}
                <Card
                  size="small"
                  title={
                    <Space>
                      {t('Business Collections')}
                      <Tag color="blue">{t('{{count}} / {{total}} selected', { count: String(selectedCount), total: String(collections.business.length) })}</Tag>
                      {withDataCount > 0 && <Tag color="orange">{t('{{count}} with data', { count: String(withDataCount) })}</Tag>}
                    </Space>
                  }
                  extra={
                    <Button icon={<ReloadOutlined />} size="small" onClick={loadCollections} loading={loading}>
                      {t('Refresh')}
                    </Button>
                  }
                >
                  <Spin spinning={loading}>
                    <Table
                      dataSource={collections.business}
                      columns={businessColumns as any}
                      rowKey="name"
                      size="small"
                      pagination={{ pageSize: 15 }}
                    />
                  </Spin>
                </Card>

                {/* Export summary + button */}
                <Alert
                  type="info"
                  message={
                    <Space direction="vertical" size={2}>
                      <Text>{t('Bundle will include:')}</Text>
                      <Text>
                        {t('Schema')}: {yn(options.includeSystemSchema)} | {t('UI / Menus')}: {yn(options.includeUiSchemas)} | {t('Roles & Permissions')}: {yn(options.includeRoles)} | {t('Workflows')}: {yn(options.includeWorkflows)}
                      </Text>
                      <Text>{t('{{count}} business collections ({{withData}} with data)', { count: String(selectedCount), withData: String(withDataCount) })}</Text>
                    </Space>
                  }
                />

                <Button
                  type="primary"
                  size="large"
                  icon={<DownloadOutlined />}
                  loading={exporting}
                  onClick={handleExport}
                  disabled={!options.includeSystemSchema && selectedCount === 0}
                  block
                >
                  {exporting ? t('Creating bundle…') : t('Export → Download .nbc.gz')}
                </Button>
              </Space>
            ),
          },
          {
            key: 'import',
            label: <span><UploadOutlined /> {t('Import Bundle')}</span>,
            children: (
              <Space direction="vertical" style={{ width: '100%' }} size="large">
                <Alert
                  type="warning"
                  message={t('Important notes')}
                  description={
                    <ul style={{ marginBottom: 0 }}>
                      <li>{t('The source and target apps MUST be the same NocoBase version (the flow-engine format changes between versions).')}</li>
                      <li>{t('Import is an UPSERT — it does not delete existing data.')}</li>
                      <li>{t('Run it on a blank (freshly installed) app for the most accurate result.')}</li>
                      <li>{t('Large app → set env REQUEST_BODY_LIMIT=50mb (default 10mb; a flow-engine bundle can exceed it).')}</li>
                      <li>{t('File attachments / uploads are NOT cloned.')}</li>
                      <li>{t('After import you must Restart the app so tables + UI load fully.')}</li>
                    </ul>
                  }
                />

                <Card title={t('Upload Bundle ZIP')}>
                  {importing && (
                    <Alert
                      type="warning"
                      showIcon
                      icon={<Spin />}
                      style={{ marginBottom: 12 }}
                      message={t('Importing, please wait…')}
                      description={
                        <Space direction="vertical" size={4} style={{ width: '100%' }}>
                          <Text>{t('Writing schema + creating tables + loading the UI. A large app can take 1–2 minutes.')}</Text>
                          <Text type="danger"><b>{t('Do not close/reload the page')}</b> {t('until the result is shown.')}</Text>
                          <Progress percent={100} status="active" showInfo={false} />
                        </Space>
                      }
                    />
                  )}
                  <Spin spinning={importing} tip={t('Importing…')}>
                    <Upload.Dragger
                      accept=".nbc.gz,.gz"
                      beforeUpload={handleImport}
                      showUploadList={false}
                      disabled={importing}
                    >
                      <p className="ant-upload-drag-icon">
                        <UploadOutlined style={{ fontSize: 48, color: importing ? '#ccc' : '#1890ff' }} />
                      </p>
                      <p className="ant-upload-text">{importing ? t('Processing, please wait…') : t('Drag & drop a file or click to select')}</p>
                      <p className="ant-upload-hint">{t('Only accepts .nbc.gz files created by NB Cloner')}</p>
                    </Upload.Dragger>
                  </Spin>
                </Card>

                {/* Import result */}
                {importResult && (
                  <Card
                    title={
                      <Space>
                        {importResult.success
                          ? <CheckCircleOutlined style={{ color: '#52c41a' }} />
                          : <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
                        }
                        {importResult.success ? t('Import successful') : t('Import has errors')}
                        {importResult.manifest && (
                          <Tag>{importResult.manifest.appName} — {importResult.manifest.exportedAt?.split('T')[0]}</Tag>
                        )}
                      </Space>
                    }
                  >
                    <Result
                      status={importResult.success ? 'success' : 'warning'}
                      title={importResult.success ? t('Import successful!') : t('Import finished but with errors')}
                      subTitle={
                        importResult.success
                          ? t('RESTART the app so the data tables and UI appear fully.')
                          : t('Some steps failed — see the detail below. Tables/UI may be incomplete.')
                      }
                      style={{ padding: '12px 0' }}
                    />
                    <Table
                      dataSource={importResult.steps}
                      rowKey="step"
                      size="small"
                      pagination={false}
                      columns={[
                        { title: t('Step'), dataIndex: 'step', render: (v: string) => <Text code>{v}</Text> },
                        {
                          title: t('Status'),
                          dataIndex: 'status',
                          width: 100,
                          render: (v: string) => (
                            <Tag color={v === 'ok' ? 'green' : v === 'skipped' ? 'default' : 'red'}>
                              {v === 'ok' ? t('ok') : v === 'skipped' ? t('skipped') : t('error')}
                            </Tag>
                          ),
                        },
                        {
                          title: t('Rows'),
                          dataIndex: 'count',
                          width: 80,
                          render: (v: number) => v !== undefined ? <Badge count={formatNumber(v)} showZero style={{ backgroundColor: '#108ee9' }} /> : '-',
                        },
                        {
                          title: t('Error'),
                          dataIndex: 'error',
                          render: (v: string) => v ? <Text type="danger" style={{ fontSize: 12 }}>{v}</Text> : '-',
                        },
                      ]}
                    />
                  </Card>
                )}
              </Space>
            ),
          },
          {
            key: 'update',
            label: <span><ReloadOutlined /> {t('Update Plugin')}</span>,
            children: (
              <Space direction="vertical" style={{ width: '100%' }} size="large">
                <Card size="small" title={t('Plugin version')}>
                  <Space direction="vertical" size={4}>
                    <Space>
                      <Text>{t('Installed (shown by NocoBase):')}</Text>
                      <Tag color="geekblue">v{pluginInfo?.version ?? '?'}</Tag>
                    </Space>
                    {pluginInfo?.fileVersion && (
                      <Space>
                        <Text>{t('Running code (file):')}</Text>
                        <Tag color={pluginInfo.fileVersion === pluginInfo.version ? 'green' : 'orange'}>
                          v{pluginInfo.fileVersion}
                        </Tag>
                        {pluginInfo.fileVersion !== pluginInfo.version && (
                          <Text type="warning">{t('— mismatch, restart the app to sync')}</Text>
                        )}
                      </Space>
                    )}
                    <Button size="small" icon={<ReloadOutlined />} onClick={loadInfo}>{t('Refresh')}</Button>
                  </Space>
                </Card>

                <Alert
                  type="info"
                  showIcon
                  message={t('Update the plugin manually without removing the old build')}
                  description={
                    <ul style={{ marginBottom: 0 }}>
                      <li>{t('Drop the plugin-nb-cloner-vX.Y.Z.zip file into the box below.')}</li>
                      <li>{t('The plugin overwrites the old build in storage/plugins and updates the version (avoids the "already added" / EBUSY error on Remove).')}</li>
                      <li>{t('After it reports success, restart the app to load the new code.')}</li>
                    </ul>
                  }
                />

                <Card title={t('Upload the new version (.zip)')}>
                  <Spin spinning={updating} tip={t('Updating, please wait…')}>
                    <Upload.Dragger
                      accept=".zip"
                      beforeUpload={handleSelfUpdate}
                      showUploadList={false}
                      disabled={updating}
                    >
                      <p className="ant-upload-drag-icon">
                        <ReloadOutlined style={{ fontSize: 48, color: '#1890ff' }} />
                      </p>
                      <p className="ant-upload-text">{t('Drag & drop the plugin .zip or click to select')}</p>
                      <p className="ant-upload-hint">{t('Accepts a packaged NB Cloner .zip (contains package.json + dist)')}</p>
                    </Upload.Dragger>
                  </Spin>
                </Card>

                {updateResult && (
                  <Alert
                    type={updateResult.success ? 'success' : 'error'}
                    showIcon
                    message={updateResult.success ? t('Updated to v{{version}}', { version: updateResult.version }) : t('Update failed')}
                    description={updateResult.message || updateResult.error}
                  />
                )}
              </Space>
            ),
          },
        ]}
      />
    </ConfigContainer>
  );
}

export default NbClonerPane;
