import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Input, Popconfirm, Select, Space, Table, Tag, Typography, message } from 'antd';
import { t } from './i18n';

/**
 * Settings screen to configure 3rd-party TTS provider credentials (ElevenLabs / Vbee) from the UI,
 * so admins don't have to call the `setVoiceProvider` action by hand. Google TTS reuses plugin-ai's
 * llmServices and isn't managed here. Shared by both client lanes; the only lane-specific bit — how
 * to get the api client — is injected as a hook (same pattern as gsheet-sync's ConnectionManager).
 *
 * Secrets (apiKey/token) are WRITE-ONLY here: the list action never returns them, so the table shows
 * only name/provider. To change a key, re-add the same name (setVoiceProvider upserts).
 */

type Row = { name: string; provider: string; voiceDefault?: string };

const PROVIDERS = [
  { label: 'ElevenLabs', value: 'elevenlabs' },
  { label: 'Vbee (giọng Việt)', value: 'vbee' },
];

export function createVoiceProviderManager({ useApiClient }: { useApiClient: () => any }) {
  return function VoiceProviderManager() {
    const api = useApiClient();
    const [rows, setRows] = useState<Row[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    // add/edit form state
    const [name, setName] = useState('');
    const [provider, setProvider] = useState('elevenlabs');
    const [apiKey, setApiKey] = useState('');
    const [appId, setAppId] = useState('');
    const [token, setToken] = useState('');
    const [voiceDefault, setVoiceDefault] = useState('');
    const [baseURL, setBaseURL] = useState('');

    const refresh = useCallback(async () => {
      if (!api) return;
      setLoading(true);
      try {
        const res = await api.request({ url: 'ptdlAiColumn:listVoiceProviders', method: 'post', data: {} });
        // Coerce to array — a malformed/wrapped response must never make <Table dataSource> a
        // non-array (antd calls dataSource.some(...) → would crash the whole settings layout).
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

    const resetForm = () => {
      setName('');
      setApiKey('');
      setAppId('');
      setToken('');
      setVoiceDefault('');
      setBaseURL('');
    };

    const save = async () => {
      if (!name.trim()) {
        message.warning(t('Nhập Tên (định danh) cho credential.'));
        return;
      }
      if (provider === 'elevenlabs' && !apiKey.trim()) {
        message.warning(t('ElevenLabs cần API Key.'));
        return;
      }
      if (provider === 'vbee' && (!appId.trim() || !token.trim())) {
        message.warning(t('Vbee cần cả App ID và Token.'));
        return;
      }
      setSaving(true);
      try {
        await api.request({
          url: 'ptdlAiColumn:setVoiceProvider',
          method: 'post',
          data: {
            name: name.trim(),
            provider,
            apiKey: provider === 'elevenlabs' ? apiKey.trim() : undefined,
            appId: provider === 'vbee' ? appId.trim() : undefined,
            token: provider === 'vbee' ? token.trim() : undefined,
            baseURL: baseURL.trim() || undefined,
            voiceDefault: voiceDefault.trim() || undefined,
          },
        });
        message.success(t('Đã lưu "{{name}}".', { name: name.trim() }));
        resetForm();
        refresh();
      } catch (e: any) {
        message.error(t('Lưu thất bại: ') + (e?.response?.data?.errors?.[0]?.message || e?.message || e));
      } finally {
        setSaving(false);
      }
    };

    const remove = async (rowName: string) => {
      try {
        await api.request({ url: 'ptdlAiColumn:removeVoiceProvider', method: 'post', data: { name: rowName } });
        message.success(t('Đã xoá "{{name}}".', { name: rowName }));
        refresh();
      } catch (e: any) {
        message.error(t('Xoá thất bại: ') + (e?.message || e));
      }
    };

    const columns = [
      { title: t('Tên'), dataIndex: 'name', key: 'name' },
      {
        title: t('Provider'),
        dataIndex: 'provider',
        key: 'provider',
        render: (p: string) => <Tag color={p === 'vbee' ? 'geekblue' : 'purple'}>{p}</Tag>,
      },
      { title: t('Giọng mặc định'), dataIndex: 'voiceDefault', key: 'voiceDefault', render: (v: string) => v || '—' },
      {
        title: '',
        key: 'action',
        width: 90,
        render: (_: any, r: Row) => (
          <Popconfirm title={t('Xoá "{{name}}"?', { name: r.name })} onConfirm={() => remove(r.name)} okText={t('Xoá')} cancelText={t('Huỷ')}>
            <Button danger size="small">
              {t('Xoá')}
            </Button>
          </Popconfirm>
        ),
      },
    ];

    return (
      <div style={{ padding: 20, maxWidth: 1200, margin: '8px auto 16px', background: 'var(--colorBgContainer, #fff)', border: '0.8px solid var(--colorBorderSecondary, #f0f0f0)', borderRadius: 8 }}>
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={t('Cấu hình giọng đọc ElevenLabs / Vbee')}
          description={t('Thêm credential ở đây rồi trong cấu hình field AI Voice chọn Provider tương ứng + credential này. Google (Gemini) dùng LLM service ở Settings → AI, không cần cấu hình tại đây. Khoá bí mật chỉ ghi vào, không hiển thị lại.')}
        />

        <Typography.Title level={5}>{t('Thêm / cập nhật credential')}</Typography.Title>
        <Space direction="vertical" style={{ width: '100%', marginBottom: 12 }} size={8}>
          <Space wrap>
            <Input style={{ width: 200 }} placeholder={t('Tên (vd my-11labs)')} value={name} onChange={(e) => setName(e.target.value)} />
            <Select style={{ width: 200 }} options={PROVIDERS.map((o) => ({ ...o, label: t(o.label) }))} value={provider} onChange={setProvider} />
          </Space>
          {provider === 'elevenlabs' ? (
            <Input.Password style={{ width: 410 }} placeholder={t('ElevenLabs API Key (xi-api-key)')} value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
          ) : (
            <Space wrap>
              <Input style={{ width: 200 }} placeholder={t('Vbee App ID')} value={appId} onChange={(e) => setAppId(e.target.value)} />
              <Input.Password style={{ width: 200 }} placeholder={t('Vbee Token')} value={token} onChange={(e) => setToken(e.target.value)} />
            </Space>
          )}
          <Space wrap>
            <Input
              style={{ width: 200 }}
              placeholder={provider === 'vbee' ? t('Giọng mặc định (voice_code)') : t('Giọng mặc định (Voice ID)')}
              value={voiceDefault}
              onChange={(e) => setVoiceDefault(e.target.value)}
            />
            <Input style={{ width: 260 }} placeholder={t('Base URL (tùy chọn — để trống dùng mặc định)')} value={baseURL} onChange={(e) => setBaseURL(e.target.value)} />
          </Space>
          <Button type="primary" loading={saving} onClick={save}>
            {t('Lưu credential')}
          </Button>
        </Space>

        <Typography.Title level={5} style={{ marginTop: 8 }}>
          {t('Đã cấu hình')}
        </Typography.Title>
        <Table rowKey="name" size="small" loading={loading} columns={columns as any} dataSource={Array.isArray(rows) ? rows : []} pagination={false} locale={{ emptyText: t('Chưa có credential nào') }} />
      </div>
    );
  };
}
