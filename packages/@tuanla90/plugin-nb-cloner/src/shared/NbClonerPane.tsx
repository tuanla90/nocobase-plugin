import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Card, Tabs, Checkbox, Switch, Button, Table, Tag, Alert, Segmented, Tooltip, Modal,
  message, Upload, Spin, Badge, Divider, Space, Typography, Input, Row, Col,
  notification, Result, Progress, theme,
} from 'antd';
import {
  DownloadOutlined, UploadOutlined, ReloadOutlined, SaveOutlined, CopyOutlined, ClearOutlined,
  DatabaseOutlined, AppstoreOutlined, CheckCircleOutlined, CloseCircleOutlined,
  DeleteOutlined, WarningOutlined,
} from '@ant-design/icons';
import { formatNumber } from '@tuanla90/shared';
import { t } from './nbClonerClient';

// Local layout wrapper — replaces @tuanla90/shared's ConfigContainer so this plugin doesn't pull in the
// shared settingsKit (which imports @formily/react and failed to externalize in this build; conditional-format
// tree-shakes it away because it never touches the Formily lane). Mirrors the shared render 1:1 via antd tokens.
const ConfigContainer: React.FC<{ maxWidth?: number; padded?: boolean; style?: React.CSSProperties; children?: React.ReactNode }> = ({
  maxWidth = 1440,
  padded = true,
  style,
  children,
}) => {
  const { token } = theme.useToken();
  return (
    <div style={{ padding: '8px 16px 16px', maxWidth, margin: '0 auto' }}>
      <div
        style={{
          background: token.colorBgContainer,
          border: `0.8px solid ${token.colorBorderSecondary}`,
          borderRadius: 8,
          padding: padded ? 16 : 0,
          ...style,
        }}
      >
        {children}
      </div>
    </div>
  );
};

const { Title, Text } = Typography;

type Category = 'user' | 'plugin' | 'system' | 'deleted';

interface CollectionInfo {
  name: string;
  title: string;
  category: Category;
  origin: string;
  managed: boolean;
  tableExists: boolean;
  tableName: string;
  fieldsCount: number;
  rowCount?: number;
}

interface Selection {
  selected: boolean;
  includeData: boolean;
}

const emptyCounts: Record<Category, number> = { user: 0, plugin: 0, system: 0, deleted: 0 };
const CAT_COLOR: Record<Category, string> = { user: 'green', plugin: 'blue', system: 'default', deleted: 'red' };

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
  const [collections, setCollections] = useState<CollectionInfo[]>([]);
  const [counts, setCounts] = useState<Record<Category, number>>(emptyCounts);
  const [selections, setSelections] = useState<Record<string, Selection>>({});
  const [category, setCategory] = useState<Category | 'all'>('user');
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
  // Import preview (dry-run) shown before the real import runs.
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<{ report: any; base64: string; filename: string } | null>(null);
  // Import SELECTION (mirrors the export tab): which parts + which collections + which get their data.
  const [importParts, setImportParts] = useState({ schema: true, ui: true, roles: true, workflows: true });
  const [importColSel, setImportColSel] = useState<Record<string, { selected: boolean; includeData: boolean }>>({});
  // Khi TRÙNG TÊN bảng/cột (và dòng dữ liệu trùng khóa): 'overwrite' = file thắng (hành vi cũ),
  // 'append' = giữ nguyên cái đang có, chỉ thêm mới. Chọn trong modal preview trước khi import.
  const [conflictStrategy, setConflictStrategy] = useState<'append' | 'overwrite'>('overwrite');
  // Cleanup tab (delete junk collections).
  const [cleanupSel, setCleanupSel] = useState<Record<string, boolean>>({});
  const [deleting, setDeleting] = useState(false);
  const [deleteResult, setDeleteResult] = useState<any>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  // Load plugin version info (header tag)
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

  // Load collections (classified into user/plugin/system/deleted)
  const loadCollections = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.request({ url: 'nbCloner:listCollections', method: 'GET' });
      const data = res.data?.data ?? res.data;
      const list: CollectionInfo[] = data.collections ?? [];
      setCollections(list);
      setCounts({ ...emptyCounts, ...(data.counts ?? {}) });
      // Default-select only the user's own collections (real business data).
      const sel: Record<string, Selection> = {};
      list.forEach((c) => { sel[c.name] = { selected: c.category === 'user', includeData: false }; });
      setSelections(sel);
    } catch (err: any) {
      message.error(t('Failed to load collections: {{msg}}', { msg: err.message }));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    loadCollections();
  }, [loadCollections]);

  // Rows visible under the active category filter.
  const visible = useMemo(
    () => (category === 'all' ? collections : collections.filter((c) => c.category === category)),
    [collections, category],
  );

  const setSel = (name: string, field: keyof Selection, value: boolean) =>
    setSelections((prev) => ({ ...prev, [name]: { ...prev[name], [field]: value } }));

  // "Select all / none" + "copy data all / none" operate on the VISIBLE (filtered) rows only.
  const toggleAllVisible = (selected: boolean) =>
    setSelections((prev) => {
      const next = { ...prev };
      visible.forEach((c) => { next[c.name] = { ...next[c.name], selected }; });
      return next;
    });
  const toggleAllData = (includeData: boolean) =>
    setSelections((prev) => {
      const next = { ...prev };
      visible.forEach((c) => { if (next[c.name]?.selected && c.tableExists) next[c.name] = { ...next[c.name], includeData }; });
      return next;
    });

  const selectedCount = collections.filter((c) => selections[c.name]?.selected).length;
  const withDataCount = collections.filter((c) => selections[c.name]?.selected && selections[c.name]?.includeData).length;
  const visibleAllSelected = visible.length > 0 && visible.every((c) => selections[c.name]?.selected);
  const visibleSomeSelected = visible.some((c) => selections[c.name]?.selected);

  // Export
  const handleExport = async () => {
    setExporting(true);
    try {
      const selectedBusiness = collections
        .filter((c) => selections[c.name]?.selected)
        .map((c) => ({ name: c.name, includeData: !!selections[c.name]?.includeData }));

      const res = await api.request({
        url: 'nbCloner:export',
        method: 'POST',
        data: { ...options, businessCollections: selectedBusiness },
        responseType: 'blob',
      });

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

  // Quick goal presets — set the system toggles + collection selection in one click.
  //  backup  : your whole app + ALL your data (structure, UI, roles, workflows, data ON)
  //  clone   : the same app WITHOUT data (a blank copy for a new install; data OFF)
  //  default : the conservative default (only your tables selected, workflows off, no data)
  const applyPreset = (preset: 'backup' | 'clone' | 'default') => {
    const withData = preset === 'backup';
    const withWorkflows = preset !== 'default';
    setOptions((o) => ({
      ...o,
      includeSystemSchema: true,
      includeUiSchemas: true,
      includeRoles: true,
      includeWorkflows: withWorkflows,
    }));
    setSelections(() => {
      const next: Record<string, Selection> = {};
      collections.forEach((c) => {
        const isUser = c.category === 'user';
        next[c.name] = { selected: isUser, includeData: isUser && withData && c.tableExists };
      });
      return next;
    });
    setCategory('user'); // show what the preset picked
    const label: Record<typeof preset, string> = { backup: t('Backup'), clone: t('Clone'), default: t('Default') };
    message.success(t('Preset applied: {{name}}', { name: label[preset] }));
  };

  // File dropped → DRY-RUN preview first (no writes); the user reviews conflicts, then confirms.
  const handleFileSelected = async (file: File) => {
    setImportResult(null);
    setPreviewing(true);
    try {
      const base64 = await fileToBase64(file);
      const res = await api.request({
        url: 'nbCloner:previewImport',
        method: 'POST',
        data: { fileData: base64, filename: file.name },
      });
      const report = res.data?.data ?? res.data;
      setPreview({ report, base64, filename: file.name });
      // Default the selection to "import everything the bundle carries" (matches the old behaviour);
      // the user can then narrow it. Parts NOT in the bundle start off (and are disabled in the UI).
      const bc = report?.bundleContents || {};
      setImportParts({
        schema: true,
        ui: (bc.ui || 0) > 0,
        roles: (bc.roles || 0) > 0,
        workflows: (bc.workflows || 0) > 0,
      });
      setConflictStrategy('overwrite'); // reset về hành vi mặc định cho mỗi bundle mới

      const cs: Record<string, { selected: boolean; includeData: boolean }> = {};
      (report?.collections || []).forEach((c: any) => {
        cs[c.name] = { selected: true, includeData: (c.dataRows || 0) > 0 };
      });
      setImportColSel(cs);
    } catch (err: any) {
      notification.error({ message: t('Could not read the bundle'), description: err.message, duration: 0 });
    } finally {
      setPreviewing(false);
    }
    return false; // stop antd auto-upload
  };

  // The real import — runs only after the user confirms the preview. `cols` is the preview's collection
  // list; we translate the on-screen selection into the server's { parts, collections, data } shape.
  const runImport = async (base64: string, filename: string, cols: any[]) => {
    setPreview(null);
    setImporting(true);
    setImportResult(null);
    try {
      const selectedCols = (cols || []).filter((c: any) => importColSel[c.name]?.selected);
      const selection = {
        parts: importParts,
        collections: selectedCols.map((c: any) => c.name),
        data: selectedCols
          .filter((c: any) => importColSel[c.name]?.includeData && (c.dataRows || 0) > 0)
          .map((c: any) => c.name),
        conflictStrategy,
      };
      const res = await api.request({
        url: 'nbCloner:import',
        method: 'POST',
        data: { fileData: base64, filename, selection },
      });
      const result = res.data?.data ?? res.data;
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
  };

  // ── Cleanup (delete junk collections) ─────────────────────────────────────────
  const userCollections = useMemo(() => collections.filter((c) => c.category === 'user'), [collections]);
  const cleanupNames = userCollections.filter((c) => cleanupSel[c.name]).map((c) => c.name);
  const cleanupRows = userCollections
    .filter((c) => cleanupSel[c.name])
    .reduce((s, c) => s + (c.rowCount || 0), 0);
  const CONFIRM_WORD = 'DELETE';

  const doDelete = async () => {
    setDeleting(true);
    try {
      const res = await api.request({
        url: 'nbCloner:deleteCollections',
        method: 'POST',
        data: { names: cleanupNames },
      });
      const r = res.data?.data ?? res.data;
      setDeleteResult(r);
      setConfirmOpen(false);
      setConfirmText('');
      setCleanupSel({});
      const ok = (r?.results || []).filter((x: any) => x.status === 'ok').length;
      if (ok > 0) {
        notification.success({
          message: t('Deleted {{count}} collections', { count: String(ok) }),
          description: t('RESTART the app so the change is fully reflected.'),
          duration: 10,
        });
      }
      loadCollections();
    } catch (err: any) {
      notification.error({ message: t('Delete failed'), description: err.message, duration: 0 });
    } finally {
      setDeleting(false);
    }
  };

  const catLabel: Record<Category, string> = {
    user: t('My collections'),
    plugin: t('Plugin'),
    system: t('System'),
    deleted: t('Deleted'),
  };
  const total = collections.length;
  const filterOptions = [
    { label: `${catLabel.user} (${counts.user})`, value: 'user' },
    { label: `${catLabel.plugin} (${counts.plugin})`, value: 'plugin' },
    { label: `${catLabel.system} (${counts.system})`, value: 'system' },
    { label: `${catLabel.deleted} (${counts.deleted})`, value: 'deleted' },
    { label: `${t('All')} (${total})`, value: 'all' },
  ];

  // Collections table columns
  const columns = [
    {
      title: (
        <Checkbox
          checked={visibleAllSelected}
          indeterminate={visibleSomeSelected && !visibleAllSelected}
          onChange={(e) => toggleAllVisible(e.target.checked)}
        />
      ),
      width: 44,
      render: (_: any, record: CollectionInfo) => (
        <Checkbox
          checked={!!selections[record.name]?.selected}
          onChange={(e) => setSel(record.name, 'selected', e.target.checked)}
        />
      ),
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
      title: t('Origin'),
      dataIndex: 'origin',
      width: 150,
      render: (origin: string, record: CollectionInfo) => (
        <Space direction="vertical" size={0}>
          <Tag color={CAT_COLOR[record.category]} style={{ marginRight: 0 }}>{catLabel[record.category]}</Tag>
          {origin && origin !== 'core' && (
            <Text type="secondary" style={{ fontSize: 11 }}>{origin}</Text>
          )}
        </Space>
      ),
    },
    {
      title: t('Rows'),
      dataIndex: 'rowCount',
      width: 90,
      render: (v: number, record: CollectionInfo) =>
        !record.tableExists
          ? <Tag color="red">{t('no table')}</Tag>
          : v === undefined || v === null
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
        const sel = selections[record.name];
        return (
          <Switch
            disabled={!sel?.selected || !record.tableExists}
            checked={sel?.includeData}
            onChange={(v) => setSel(record.name, 'includeData', v)}
            checkedChildren={t('Data')}
            unCheckedChildren={t('Schema only')}
            size="small"
          />
        );
      },
    },
  ];

  // ── Import-selection derived values (used by the preview/selection modal below) ──
  const impCols: any[] = preview?.report?.collections || [];
  const impBundle: any = preview?.report?.bundleContents || {};
  const impSelectedCols = impCols.filter((c) => importColSel[c.name]?.selected);
  const impSelCount = impSelectedCols.length;
  const impDataCount = impSelectedCols.filter((c) => importColSel[c.name]?.includeData && (c.dataRows || 0) > 0).length;
  const impAllSel = impCols.length > 0 && impCols.every((c) => importColSel[c.name]?.selected);
  const impSomeSel = impCols.some((c) => importColSel[c.name]?.selected);
  // Trùng tên: tổng số cột đã tồn tại trên đích (cùng key + khác key) — strategy quyết định số phận.
  const impSameNameCols = impCols.reduce(
    (s, c) => s + (c.matchFields || 0) + ((c.conflictFields || []).length), 0,
  );
  const impHasExisting = (preview?.report?.existingCollections || 0) > 0;
  // Ghi đè lên bảng đang có mới là thao tác "nguy hiểm" cần tô đỏ; append thì vô hại.
  const impDanger = impHasExisting && conflictStrategy === 'overwrite';
  // Nothing to write: no collection picked AND no whole-app part picked.
  const impNothing = impSelCount === 0 && !importParts.ui && !importParts.roles && !importParts.workflows;
  const toggleImpAll = (selected: boolean) =>
    setImportColSel((prev) => {
      const next = { ...prev };
      impCols.forEach((c) => { next[c.name] = { ...next[c.name], selected }; });
      return next;
    });
  const toggleImpData = (includeData: boolean) =>
    setImportColSel((prev) => {
      const next = { ...prev };
      impCols.forEach((c) => {
        // "All" only turns on rows for selected collections that actually carry data.
        if (includeData) { if (next[c.name]?.selected && (c.dataRows || 0) > 0) next[c.name] = { ...next[c.name], includeData: true }; }
        else next[c.name] = { ...next[c.name], includeData: false };
      });
      return next;
    });

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
            <Tag color="geekblue" style={{ fontSize: 18, padding: '4px 14px', margin: 0, fontWeight: 600, borderRadius: 8 }}>
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
                {/* Quick goal presets */}
                <Card size="small" title={<span>🎯 {t('Quick goal')}</span>}>
                  <Space wrap align="center">
                    <Tooltip title={t('Backup — your whole app + ALL your data (structure, UI, roles, workflows, data). For archiving or moving as-is.')}>
                      <Button icon={<SaveOutlined />} onClick={() => applyPreset('backup')}>{t('Backup')}</Button>
                    </Tooltip>
                    <Tooltip title={t('Clone — the same app (structure, UI, roles, workflows) WITHOUT data. A blank copy for a new install.')}>
                      <Button icon={<CopyOutlined />} onClick={() => applyPreset('clone')}>{t('Clone')}</Button>
                    </Tooltip>
                    <Tooltip title={t('Reset to the safe default: only your tables selected, no data.')}>
                      <Button type="text" icon={<ClearOutlined />} onClick={() => applyPreset('default')}>{t('Default')}</Button>
                    </Tooltip>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {t('Presets pick your collections + the right toggles. The target app needs the same NocoBase version & plugins.')}
                    </Text>
                  </Space>
                </Card>

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
                      <Switch checked={options.includeSystemSchema} onChange={(v) => setOptions((o) => ({ ...o, includeSystemSchema: v }))} size="small" />
                      <Text style={{ marginLeft: 8 }}>{t('Collections Schema')}</Text>
                    </Col>
                    <Col span={6}>
                      <Switch checked={options.includeUiSchemas} onChange={(v) => setOptions((o) => ({ ...o, includeUiSchemas: v }))} size="small" />
                      <Text style={{ marginLeft: 8 }}>{t('UI / Menus')}</Text>
                    </Col>
                    <Col span={6}>
                      <Switch checked={options.includeRoles} onChange={(v) => setOptions((o) => ({ ...o, includeRoles: v }))} size="small" />
                      <Text style={{ marginLeft: 8 }}>{t('Roles & Permissions')}</Text>
                    </Col>
                    <Col span={6}>
                      <Switch checked={options.includeWorkflows} onChange={(v) => setOptions((o) => ({ ...o, includeWorkflows: v }))} size="small" />
                      <Text style={{ marginLeft: 8 }}>{t('Workflows')}</Text>
                    </Col>
                  </Row>
                </Card>

                {/* Collections + category filter */}
                <Card
                  size="small"
                  title={
                    <Space wrap>
                      {t('Collections')}
                      <Tag color="blue">{t('{{count}} selected', { count: String(selectedCount) })}</Tag>
                      {withDataCount > 0 && <Tag color="orange">{t('{{count}} with data', { count: String(withDataCount) })}</Tag>}
                    </Space>
                  }
                  extra={
                    <Button icon={<ReloadOutlined />} size="small" onClick={loadCollections} loading={loading}>
                      {t('Refresh')}
                    </Button>
                  }
                >
                  <Space direction="vertical" style={{ width: '100%' }} size="small">
                    <Segmented
                      size="small"
                      value={category}
                      onChange={(v) => setCategory(v as any)}
                      options={filterOptions as any}
                    />
                    <Alert
                      type="info"
                      showIcon
                      banner
                      message={t('“My collections” are the tables you created. Plugin/System are defined by plugins & NocoBase; they are usually not cloned.')}
                      style={{ padding: '4px 12px' }}
                    />
                    <Spin spinning={loading}>
                      <Table
                        dataSource={visible}
                        columns={columns as any}
                        rowKey="name"
                        size="small"
                        locale={{ emptyText: t('No collections in this filter') }}
                        pagination={{ pageSize: 15, hideOnSinglePage: true }}
                      />
                    </Spin>
                  </Space>
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
                      <Text>{t('{{count}} collections selected ({{withData}} with data)', { count: String(selectedCount), withData: String(withDataCount) })}</Text>
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
                      <li>{t('Import never deletes. When a table/column with the same name exists, you choose in the preview: append only (keep existing) or overwrite with the file.')}</li>
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
                  <Spin spinning={importing || previewing} tip={previewing ? t('Reading the bundle…') : t('Importing…')}>
                    <Upload.Dragger accept=".nbc.gz,.gz" beforeUpload={handleFileSelected} showUploadList={false} disabled={importing || previewing}>
                      <p className="ant-upload-drag-icon">
                        <UploadOutlined style={{ fontSize: 48, color: importing || previewing ? '#ccc' : '#1890ff' }} />
                      </p>
                      <p className="ant-upload-text">{importing ? t('Processing, please wait…') : t('Drag & drop a file or click to select')}</p>
                      <p className="ant-upload-hint">{t('You will see a preview of what changes before anything is written.')}</p>
                    </Upload.Dragger>
                  </Spin>
                </Card>

                {importResult && (
                  <Card
                    title={
                      <Space>
                        {importResult.success
                          ? <CheckCircleOutlined style={{ color: '#52c41a' }} />
                          : <CloseCircleOutlined style={{ color: '#ff4d4f' }} />}
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
                      subTitle={importResult.success
                        ? t('RESTART the app so the data tables and UI appear fully.')
                        : t('Some steps failed — see the detail below. Tables/UI may be incomplete.')}
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
                          title: t('Status'), dataIndex: 'status', width: 100,
                          render: (v: string) => (
                            <Tag color={v === 'ok' ? 'green' : v === 'skipped' ? 'default' : 'red'}>
                              {v === 'ok' ? t('ok') : v === 'skipped' ? t('skipped') : t('error')}
                            </Tag>
                          ),
                        },
                        {
                          title: t('Rows'), dataIndex: 'count', width: 80,
                          render: (v: number) => v !== undefined ? <Badge count={formatNumber(v)} showZero style={{ backgroundColor: '#108ee9' }} /> : '-',
                        },
                        { title: t('Error'), dataIndex: 'error', render: (v: string) => v ? <Text type="danger" style={{ fontSize: 12 }}>{v}</Text> : '-' },
                      ]}
                    />
                  </Card>
                )}
              </Space>
            ),
          },
          {
            key: 'cleanup',
            label: <span><DeleteOutlined /> {t('Clean up')}</span>,
            children: (
              <Space direction="vertical" style={{ width: '100%' }} size="large">
                <Alert
                  type="error"
                  showIcon
                  message={t('Danger zone — permanent delete')}
                  description={t('Deleting a collection drops its table, ALL its rows, and any relations pointing to it. It cannot be undone. Only your own collections are listed here (system & plugin tables are never deletable).')}
                />
                <Card
                  size="small"
                  title={
                    <Space wrap>
                      {t('Your collections')}
                      <Tag>{userCollections.length}</Tag>
                      {cleanupNames.length > 0 && <Tag color="red">{t('{{count}} selected', { count: String(cleanupNames.length) })}</Tag>}
                    </Space>
                  }
                  extra={<Button icon={<ReloadOutlined />} size="small" onClick={loadCollections} loading={loading}>{t('Refresh')}</Button>}
                >
                  <Spin spinning={loading}>
                    <Table
                      dataSource={userCollections}
                      rowKey="name"
                      size="small"
                      locale={{ emptyText: t('No collections in this filter') }}
                      pagination={{ pageSize: 15, hideOnSinglePage: true }}
                      columns={[
                        {
                          title: (
                            <Checkbox
                              checked={userCollections.length > 0 && userCollections.every((c) => cleanupSel[c.name])}
                              indeterminate={userCollections.some((c) => cleanupSel[c.name]) && !userCollections.every((c) => cleanupSel[c.name])}
                              onChange={(e) => {
                                const v = e.target.checked;
                                const next: Record<string, boolean> = {};
                                userCollections.forEach((c) => { next[c.name] = v; });
                                setCleanupSel(next);
                              }}
                            />
                          ),
                          width: 44,
                          render: (_: any, r: CollectionInfo) => (
                            <Checkbox checked={!!cleanupSel[r.name]} onChange={(e) => setCleanupSel((p) => ({ ...p, [r.name]: e.target.checked }))} />
                          ),
                        },
                        {
                          title: t('Collection'),
                          dataIndex: 'name',
                          render: (name: string, r: CollectionInfo) => (
                            <Space direction="vertical" size={0}>
                              <Text strong>{r.title}</Text>
                              <Text type="secondary" style={{ fontSize: 12 }}>{name}</Text>
                            </Space>
                          ),
                        },
                        {
                          title: t('Rows'),
                          dataIndex: 'rowCount',
                          width: 100,
                          render: (v: number, r: CollectionInfo) =>
                            !r.tableExists ? <Tag color="red">{t('no table')}</Tag> : <Tag color={v > 0 ? 'blue' : 'default'}>{formatNumber(v || 0)}</Tag>,
                        },
                        { title: t('Fields'), dataIndex: 'fieldsCount', width: 70, render: (v: number) => <Tag>{formatNumber(v)}</Tag> },
                      ]}
                    />
                  </Spin>
                </Card>

                <Button
                  danger
                  type="primary"
                  icon={<DeleteOutlined />}
                  disabled={cleanupNames.length === 0}
                  onClick={() => { setConfirmText(''); setConfirmOpen(true); }}
                  block
                >
                  {t('Delete selected ({{count}})', { count: String(cleanupNames.length) })}
                </Button>

                {deleteResult && (
                  <Card size="small" title={t('Delete result')}>
                    <Table
                      dataSource={deleteResult.results}
                      rowKey="name"
                      size="small"
                      pagination={false}
                      columns={[
                        { title: t('Collection'), dataIndex: 'name', render: (v: string) => <Text code>{v}</Text> },
                        {
                          title: t('Status'), dataIndex: 'status', width: 110,
                          render: (v: string) => (
                            <Tag color={v === 'ok' ? 'green' : v === 'skipped' ? 'default' : 'red'}>
                              {v === 'ok' ? t('deleted') : v === 'skipped' ? t('skipped') : t('error')}
                            </Tag>
                          ),
                        },
                        { title: t('Rows'), dataIndex: 'rows', width: 80, render: (v: number) => (v !== undefined && v !== null ? formatNumber(v) : '-') },
                        { title: t('Error'), dataIndex: 'error', render: (v: string) => v ? <Text type="danger" style={{ fontSize: 12 }}>{v}</Text> : '-' },
                      ]}
                    />
                  </Card>
                )}
              </Space>
            ),
          },
        ]}
      />

      {/* Import preview + SELECTION — shown before the real import writes anything */}
      <Modal
        open={!!preview}
        width={840}
        onCancel={() => setPreview(null)}
        title={<Space><WarningOutlined style={{ color: impDanger ? '#faad14' : '#1890ff' }} />{t('Import preview')}</Space>}
        footer={[
          <Button key="cancel" onClick={() => setPreview(null)}>{t('Cancel')}</Button>,
          <Button
            key="go"
            type="primary"
            danger={impDanger}
            icon={<UploadOutlined />}
            loading={importing}
            disabled={impNothing}
            onClick={() => preview && runImport(preview.base64, preview.filename, preview.report.collections || [])}
          >
            {t('Import selected ({{count}})', { count: String(impSelCount) })}
          </Button>,
        ]}
      >
        {preview && (
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <Alert
              type={!impHasExisting ? 'success' : conflictStrategy === 'overwrite' ? 'warning' : 'info'}
              showIcon
              message={t('{{newC}} new · {{existC}} already exist · {{same}} same-name columns', {
                newC: String(preview.report.newCollections || 0),
                existC: String(preview.report.existingCollections || 0),
                same: String(impSameNameCols),
              })}
              description={!impHasExisting
                ? t('Nothing on this app clashes with the bundle — both strategies give the same result: everything is added as new.')
                : conflictStrategy === 'overwrite'
                  ? t('OVERWRITE: same-name collections/columns are UPDATED to match the file — including {{n}} same-name columns whose internal key differs. Imported data rows with the same primary key are replaced. Nothing is deleted.', {
                      n: String(preview.report.conflictFieldTotal || 0),
                    })
                  : t('APPEND ONLY: same-name collections/columns (and data rows with the same primary key) are KEPT exactly as they are on this app. Only new tables, new columns and new rows are added.')}
            />

            {/* Chiến lược khi trùng tên — quyết định số phận của bảng/cột/dòng đã tồn tại */}
            <Card size="small" title={<span>⚖️ {t('When a table/column with the same name already exists')}</span>}>
              <Segmented
                value={conflictStrategy}
                onChange={(v) => setConflictStrategy(v as any)}
                options={[
                  { label: `♻️ ${t('Overwrite with the file')}`, value: 'overwrite' },
                  { label: `➕ ${t('Append only (keep existing)')}`, value: 'append' },
                ]}
              />
            </Card>

            {/* Parts to import — the whole-app sections (mirrors the export toggles) */}
            <Card size="small" title={t('Parts to import')}>
              <Row gutter={[8, 8]}>
                <Col span={12}>
                  <Checkbox checked={importParts.schema} onChange={(e) => setImportParts((p) => ({ ...p, schema: e.target.checked }))}>
                    {t('Schema (collections + fields)')} <Tag color="blue">{formatNumber(impCols.length)}</Tag>
                  </Checkbox>
                </Col>
                <Col span={12}>
                  <Checkbox checked={importParts.ui} disabled={(impBundle.ui || 0) === 0} onChange={(e) => setImportParts((p) => ({ ...p, ui: e.target.checked }))}>
                    {t('UI / Menus / Pages')}{' '}
                    {(impBundle.ui || 0) > 0 ? <Tag color="blue">{formatNumber(impBundle.ui)}</Tag> : <Tag>{t('not in bundle')}</Tag>}
                  </Checkbox>
                </Col>
                <Col span={12}>
                  <Checkbox checked={importParts.roles} disabled={(impBundle.roles || 0) === 0} onChange={(e) => setImportParts((p) => ({ ...p, roles: e.target.checked }))}>
                    {t('Roles & Permissions')}{' '}
                    {(impBundle.roles || 0) > 0 ? <Tag color="blue">{formatNumber(impBundle.roles)}</Tag> : <Tag>{t('not in bundle')}</Tag>}
                  </Checkbox>
                </Col>
                <Col span={12}>
                  <Checkbox checked={importParts.workflows} disabled={(impBundle.workflows || 0) === 0} onChange={(e) => setImportParts((p) => ({ ...p, workflows: e.target.checked }))}>
                    {t('Workflows')}{' '}
                    {(impBundle.workflows || 0) > 0 ? <Tag color="blue">{formatNumber(impBundle.workflows)}</Tag> : <Tag>{t('not in bundle')}</Tag>}
                  </Checkbox>
                </Col>
              </Row>
            </Card>

            {!importParts.schema && (
              <Alert
                type="info"
                showIcon
                banner
                style={{ padding: '4px 12px' }}
                message={t('Schema is off — the table below only controls DATA imported into tables that already exist on the target.')}
              />
            )}

            {/* Collections — pick which to import + which get their row data */}
            <Table
              dataSource={preview.report.collections}
              rowKey="name"
              size="small"
              pagination={{ pageSize: 8, hideOnSinglePage: true }}
              columns={[
                {
                  title: (
                    <Checkbox
                      checked={impAllSel}
                      indeterminate={impSomeSel && !impAllSel}
                      onChange={(e) => toggleImpAll(e.target.checked)}
                    />
                  ),
                  width: 40,
                  render: (_: any, r: any) => (
                    <Checkbox
                      checked={!!importColSel[r.name]?.selected}
                      onChange={(e) => setImportColSel((prev) => ({ ...prev, [r.name]: { ...prev[r.name], selected: e.target.checked } }))}
                    />
                  ),
                },
                {
                  title: t('Collection'), dataIndex: 'name',
                  render: (name: string, r: any) => (
                    <Space direction="vertical" size={0}>
                      <Text strong>{r.title}</Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>{name}</Text>
                    </Space>
                  ),
                },
                { title: t('On target'), dataIndex: 'existsOnTarget', width: 84, render: (v: boolean) => v ? <Tag color="orange">{t('exists')}</Tag> : <Tag color="green">{t('new')}</Tag> },
                { title: t('+ new cols'), dataIndex: 'newFields', width: 84, render: (v: number) => <Tag color={v > 0 ? 'blue' : 'default'}>{v}</Tag> },
                {
                  // Cột trùng tên (cùng key + khác key) — nhãn & màu đổi theo strategy đã chọn.
                  title: conflictStrategy === 'append' ? t('same name (kept)') : t('same name (overwritten)'),
                  dataIndex: 'matchFields', width: 110,
                  render: (_: any, r: any) => {
                    const conflicts: string[] = r.conflictFields || [];
                    const total = (r.matchFields || 0) + conflicts.length;
                    if (!total) return <Tag>0</Tag>;
                    const tag = <Tag color={conflictStrategy === 'append' ? 'default' : 'orange'}>{total}</Tag>;
                    return conflicts.length
                      ? <Tooltip title={t('Different internal key: {{names}}', { names: conflicts.join(', ') })}>{tag}</Tooltip>
                      : tag;
                  },
                },
                {
                  title: (
                    <Space size={4}>
                      {t('Data')}
                      <Button size="small" type="link" style={{ padding: 0 }} onClick={() => toggleImpData(true)}>{t('All')}</Button>
                      <Button size="small" type="link" style={{ padding: 0 }} onClick={() => toggleImpData(false)}>{t('None')}</Button>
                    </Space>
                  ),
                  dataIndex: 'dataRows', width: 150,
                  render: (rows: number, r: any) => {
                    const sel = importColSel[r.name];
                    if (!rows) return <Text type="secondary" style={{ fontSize: 12 }}>{t('Schema only')}</Text>;
                    return (
                      <Switch
                        size="small"
                        disabled={!sel?.selected}
                        checked={!!sel?.includeData}
                        onChange={(v) => setImportColSel((prev) => ({ ...prev, [r.name]: { ...prev[r.name], includeData: v } }))}
                        checkedChildren={formatNumber(rows)}
                        unCheckedChildren={t('off')}
                      />
                    );
                  },
                },
              ]}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              {t('{{count}} collections selected · {{data}} with data', { count: String(impSelCount), data: String(impDataCount) })}
            </Text>
          </Space>
        )}
      </Modal>

      {/* Permanent-delete confirmation (type-to-confirm) */}
      <Modal
        open={confirmOpen}
        onCancel={() => setConfirmOpen(false)}
        title={<Space><WarningOutlined style={{ color: '#ff4d4f' }} />{t('Confirm permanent delete')}</Space>}
        footer={[
          <Button key="cancel" onClick={() => setConfirmOpen(false)}>{t('Cancel')}</Button>,
          <Button
            key="del"
            danger
            type="primary"
            icon={<DeleteOutlined />}
            loading={deleting}
            disabled={confirmText.trim().toUpperCase() !== CONFIRM_WORD}
            onClick={doDelete}
          >
            {t('Delete permanently')}
          </Button>,
        ]}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Alert
            type="error"
            showIcon
            message={t('This permanently deletes {{count}} collection(s) and {{rows}} row(s).', { count: String(cleanupNames.length), rows: formatNumber(cleanupRows) })}
            description={t('Tables are dropped and relations pointing to them are removed. This cannot be undone.')}
          />
          <div style={{ maxHeight: 140, overflowY: 'auto' }}>
            {cleanupNames.map((n) => <Tag key={n} style={{ margin: 2 }}>{n}</Tag>)}
          </div>
          <div>
            <Text>{t('Type {{word}} to confirm:', { word: CONFIRM_WORD })}</Text>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={CONFIRM_WORD}
              style={{ marginTop: 4 }}
              onPressEnter={() => { if (confirmText.trim().toUpperCase() === CONFIRM_WORD) doDelete(); }}
            />
          </div>
        </Space>
      </Modal>
    </ConfigContainer>
  );
}

export default NbClonerPane;
