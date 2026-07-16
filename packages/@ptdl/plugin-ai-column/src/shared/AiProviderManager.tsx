import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Input, Popconfirm, Select, Space, Table, Tabs, Tag, Tooltip, Typography, message } from 'antd';
import { FieldTokenTextArea } from '@ptdl/shared';
import { createVoiceProviderManager } from './VoiceProviderManager';
import { t } from './i18n';

/**
 * Combined "AI Provider" settings page — merges what used to be a voice-only page into a tabbed
 * screen: (1) Giọng đọc (TTS) — the ElevenLabs/Vbee credential manager; (2) Đối chiếu / Embedding —
 * the AI-Classify vector-index manager (list indexed masters, re-embed, clear). Registered once per
 * lane (same createX({useApiClient}) shape as before), so the single menu entry now covers both.
 */

type StatusRow = { masterCollection: string; dataSourceKey: string; textTemplate?: string; model?: string; count: number; refreshEveryMin?: number; lastRefreshAt?: string; updatedAt?: string };

const REFRESH_OPTS = [
  { label: 'Tắt', value: 0 },
  { label: 'Mỗi 1 giờ', value: 60 },
  { label: 'Mỗi 6 giờ', value: 360 },
  { label: 'Mỗi 12 giờ', value: 720 },
  { label: 'Mỗi ngày', value: 1440 },
];

/** The "Đối chiếu / Embedding" tab: shows every embedded master (built from AI-Classify fields) and
 *  lets an admin refresh (only new/changed rows), rebuild all, or clear the index. */
function ClassifyManager({ useApiClient }: { useApiClient: () => any }) {
  const api = useApiClient();
  const [rows, setRows] = useState<StatusRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string>('');
  // add/edit form state
  const [collOpts, setCollOpts] = useState<any[]>([]);
  const [svcOpts, setSvcOpts] = useState<any[]>([]);
  const [fMaster, setFMaster] = useState<string>('');
  const [fText, setFText] = useState<string>('');
  const [fModel, setFModel] = useState<string>('');
  const [fSvc, setFSvc] = useState<string>('');
  const [embedding, setEmbedding] = useState(false);

  useEffect(() => {
    if (!api) return;
    api
      .request({ url: 'collections:list', params: { paginate: false } })
      .then((res: any) => {
        const l = res?.data?.data || [];
        setCollOpts(l.filter((c: any) => c?.name && !c.hidden && c.template !== 'view').map((c: any) => ({ value: c.name, label: `${c.title || c.name} (${c.name})` })));
      })
      .catch(() => {});
    api
      .request({ url: 'llmServices:list' })
      .then((res: any) => {
        const l = res?.data?.data || [];
        // Only google-genai services can build embeddings (the embed REST path).
        setSvcOpts(l.filter((s: any) => s.provider === 'google-genai').map((s: any) => ({ value: s.name, label: `${s.title || s.name}` })));
      })
      .catch(() => {});
  }, [api]);

  const editRow = (r: StatusRow) => {
    setFMaster(r.masterCollection);
    setFText(r.textTemplate || '');
    setFModel((r.model || '').replace(/^models\//, ''));
    setFSvc((r as any).llmService || '');
  };
  const resetForm = () => {
    setFMaster('');
    setFText('');
    setFModel('');
    setFSvc('');
  };
  const submitEmbed = async () => {
    if (!fMaster) return message.warning(t('Chọn bảng master trước.'));
    if (!fText.trim()) return message.warning(t('Nhập "Nội dung đem embed" trước.'));
    setEmbedding(true);
    try {
      const res = await api.request({ url: 'ptdlAiColumn:embedMaster', method: 'post', data: { masterCollection: fMaster, textTemplate: fText, embedModel: fModel.trim() || undefined, llmService: fSvc || undefined } });
      const d = res?.data?.data || {};
      message.success(t('Đã embed {{n}}/{{total}} dòng của bảng master.', { n: d.embedded ?? 0, total: d.total ?? 0 }));
      resetForm();
      refresh();
    } catch (e: any) {
      message.error('AI: ' + (e?.response?.data?.errors?.[0]?.message || e?.message || e));
    } finally {
      setEmbedding(false);
    }
  };

  const refresh = useCallback(async () => {
    if (!api) return;
    setLoading(true);
    try {
      const res = await api.request({ url: 'ptdlAiColumn:classifyStatus', method: 'post', data: {} });
      const d = res?.data?.data;
      setRows(Array.isArray(d) ? d : []);
    } catch (e: any) {
      message.error(t('Không tải được danh sách: ') + (e?.message || e));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const reindex = async (r: StatusRow, force: boolean) => {
    setBusy(r.masterCollection + (force ? ':full' : ':inc'));
    try {
      const res = await api.request({ url: 'ptdlAiColumn:classifyReindex', method: 'post', data: { masterCollection: r.masterCollection, dataSourceKey: r.dataSourceKey, force } });
      const d = res?.data?.data || {};
      message.success(t('Đã embed {{n}}/{{total}} dòng của bảng master.', { n: d.embedded ?? 0, total: d.total ?? 0 }));
      refresh();
    } catch (e: any) {
      message.error('AI: ' + (e?.response?.data?.errors?.[0]?.message || e?.message || e));
    } finally {
      setBusy('');
    }
  };

  const setSchedule = async (r: StatusRow, refreshEveryMin: number) => {
    try {
      await api.request({ url: 'ptdlAiColumn:classifySchedule', method: 'post', data: { masterCollection: r.masterCollection, dataSourceKey: r.dataSourceKey, refreshEveryMin } });
      message.success(refreshEveryMin ? t('Đã đặt tự làm mới.') : t('Đã tắt tự làm mới.'));
      refresh();
    } catch (e: any) {
      message.error('AI: ' + (e?.response?.data?.errors?.[0]?.message || e?.message || e));
    }
  };

  const clear = async (r: StatusRow) => {
    try {
      await api.request({ url: 'ptdlAiColumn:classifyClear', method: 'post', data: { masterCollection: r.masterCollection, dataSourceKey: r.dataSourceKey } });
      message.success(t('Đã xoá index của "{{name}}".', { name: r.masterCollection }));
      refresh();
    } catch (e: any) {
      message.error(t('Xoá thất bại: ') + (e?.message || e));
    }
  };

  const columns = [
    { title: t('Bảng master'), dataIndex: 'masterCollection', key: 'm', render: (v: string) => <b>{v}</b> },
    { title: t('Đã index'), dataIndex: 'count', key: 'c', width: 100, render: (v: number) => <Tag color={v > 0 ? 'green' : 'default'}>{v} {t('dòng')}</Tag> },
    { title: t('Model embedding'), dataIndex: 'model', key: 'md', render: (v: string) => v || '—' },
    {
      title: t('Nội dung embed'),
      dataIndex: 'textTemplate',
      key: 'tt',
      ellipsis: true,
      render: (v: string) => (
        <Tooltip title={v}>
          <span style={{ color: '#888' }}>{v || '—'}</span>
        </Tooltip>
      ),
    },
    {
      title: t('Tự làm mới'),
      key: 'sched',
      width: 210,
      render: (_: any, r: StatusRow) => (
        <div>
          <Select
            size="small"
            style={{ width: 130 }}
            options={REFRESH_OPTS.map((o) => ({ ...o, label: t(o.label) }))}
            value={r.refreshEveryMin || 0}
            onChange={(v) => setSchedule(r, v)}
          />
          {r.lastRefreshAt ? (
            <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>
              {t('Lần cuối')}: {new Date(r.lastRefreshAt).toLocaleString()}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      title: '',
      key: 'action',
      width: 300,
      render: (_: any, r: StatusRow) => (
        <Space>
          <Button size="small" loading={busy === r.masterCollection + ':inc'} onClick={() => reindex(r, false)}>
            {t('Cập nhật')}
          </Button>
          <Button size="small" loading={busy === r.masterCollection + ':full'} onClick={() => reindex(r, true)}>
            {t('Xây lại')}
          </Button>
          <Button size="small" type="link" onClick={() => editRow(r)}>
            {t('Sửa')}
          </Button>
          <Popconfirm title={t('Xoá index của "{{name}}"?', { name: r.masterCollection })} onConfirm={() => clear(r)} okText={t('Xoá')} cancelText={t('Huỷ')}>
            <Button size="small" danger>
              {t('Xoá index')}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message={t('Chỉ mục vector cho AI Phân loại')}
        description={t('Mỗi bảng master (danh mục để đối chiếu) được embed thành vector để tìm nhanh. Chỉ mục được tạo lần đầu từ nút "Embed master" trong cấu hình field AI Phân loại; tại đây bạn có thể cập nhật (chỉ dòng mới/đổi), xây lại toàn bộ, hoặc xoá.')}
      />
      <Typography.Title level={5}>{fMaster && rows.some((r) => r.masterCollection === fMaster) ? t('Cập nhật chỉ mục') : t('Thêm chỉ mục mới')}</Typography.Title>
      <Space direction="vertical" style={{ width: '100%', marginBottom: 16 }} size={8}>
        <Space wrap>
          <Select
            style={{ width: 300 }}
            showSearch
            optionFilterProp="label"
            placeholder={t('Chọn bảng master (danh mục để đối chiếu)')}
            options={collOpts}
            value={fMaster || undefined}
            onChange={setFMaster}
          />
          <Select
            style={{ width: 220 }}
            allowClear
            placeholder={t('Google service (embedding)')}
            options={svcOpts}
            value={fSvc || undefined}
            onChange={setFSvc}
          />
          <Input style={{ width: 220 }} placeholder={t('gemini-embedding-001 (mặc định)')} value={fModel} onChange={(e) => setFModel(e.target.value)} />
        </Space>
        <div style={{ maxWidth: 640 }}>
          <FieldTokenTextArea
            value={fText}
            onChange={setFText}
            api={api}
            collectionName={fMaster}
            dataSourceKey="main"
            format={(p) => `{{${p.join('.')}}}`}
            rows={2}
            placeholder={t('Nội dung đem embed — vd: {{ten}}. {{moTa}}')}
          />
        </div>
        <Space>
          <Button type="primary" loading={embedding} onClick={submitEmbed}>
            {t('Embed / Lưu chỉ mục')}
          </Button>
          {fMaster ? (
            <Button onClick={resetForm}>{t('Làm mới form')}</Button>
          ) : null}
        </Space>
      </Space>

      <Space style={{ marginBottom: 12 }}>
        <Typography.Title level={5} style={{ margin: 0 }}>
          {t('Đã cấu hình')}
        </Typography.Title>
        <Button size="small" onClick={refresh} loading={loading}>
          {t('Tải lại')}
        </Button>
      </Space>
      <Table rowKey="masterCollection" size="small" loading={loading} columns={columns as any} dataSource={Array.isArray(rows) ? rows : []} pagination={false} locale={{ emptyText: t('Chưa có bảng master nào được index (embed từ field AI Phân loại trước).') }} />
    </div>
  );
}

export function createAiProviderManager({ useApiClient }: { useApiClient: () => any }) {
  const VoiceTab = createVoiceProviderManager({ useApiClient });
  return function AiProviderManager() {
    return (
      <div style={{ padding: 20, maxWidth: 1200, margin: '8px auto 16px', background: 'var(--colorBgContainer, #fff)', border: '0.8px solid var(--colorBorderSecondary, #f0f0f0)', borderRadius: 8 }}>
        <Typography.Title level={5} style={{ marginTop: 0 }}>
          {t('Nhà cung cấp AI')}
        </Typography.Title>
        <Tabs
          defaultActiveKey="voice"
          items={[
            { key: 'voice', label: t('Giọng đọc (TTS)'), children: <VoiceTab /> },
            { key: 'classify', label: t('Đối chiếu / Embedding'), children: <ClassifyManager useApiClient={useApiClient} /> },
          ]}
        />
      </div>
    );
  };
}
