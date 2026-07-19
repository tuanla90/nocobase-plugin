// Admin settings for the external HTML→PDF service (Gotenberg). Config is stored
// server-side; the password is write-only (never returned to the client).
import React, { useEffect, useState } from 'react';
import { Alert, Button, Card, Checkbox, Input, Space, Typography, message, theme } from 'antd';
import { getPdfServiceConfig, renderPdfViaService, setPdfServiceConfig } from './pdfServiceClient';
import { t } from './i18n';

export function createPdfServiceSettings(deps: { useApiClient: () => any }): React.FC {
  const { useApiClient } = deps;
  return function PdfServiceSettings() {
    const { token } = theme.useToken();
    const api = useApiClient();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [url, setUrl] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [hasPassword, setHasPassword] = useState(false);
    const [pwTouched, setPwTouched] = useState(false);
    const [enabled, setEnabled] = useState(false);

    useEffect(() => {
      getPdfServiceConfig(api)
        .then((c) => {
          setUrl(c.url || '');
          setUsername(c.username || '');
          setEnabled(!!c.enabled);
          setHasPassword(!!c.hasPassword);
        })
        .catch((e) => message.error(e?.message || t('Không đọc được cấu hình')))
        .finally(() => setLoading(false));
    }, []);

    const save = async () => {
      setSaving(true);
      try {
        await setPdfServiceConfig(api, {
          url,
          username,
          enabled,
          ...(pwTouched ? { password } : {}),
        });
        setPwTouched(false);
        setPassword('');
        if (pwTouched) setHasPassword(true);
        message.success(t('Đã lưu cấu hình PDF service'));
      } catch (e: any) {
        message.error(e?.response?.data?.errors?.[0]?.message || e?.message || t('Lưu thất bại'));
      } finally {
        setSaving(false);
      }
    };

    const test = async () => {
      setTesting(true);
      try {
        // save first so the server uses current values, then render a tiny doc
        await setPdfServiceConfig(api, { url, username, enabled: true, ...(pwTouched ? { password } : {}) });
        const blob = await renderPdfViaService(
          api,
          '<!DOCTYPE html><html><body style="font-family:sans-serif"><h1>PDF service OK ✓</h1><p>Xin chào từ plugin in ấn.</p></body></html>',
          'test',
        );
        if (blob && blob.size > 0) {
          const u = URL.createObjectURL(blob);
          window.open(u, '_blank');
          setTimeout(() => URL.revokeObjectURL(u), 5000);
          message.success(t('Kết nối OK — nhận PDF {{size}}KB', { size: Math.round(blob.size / 1024) }));
        } else message.error(t('Dịch vụ trả về rỗng'));
      } catch (e: any) {
        message.error(e?.response?.data?.errors?.[0]?.message || e?.message || t('Kết nối thất bại'));
      } finally {
        setTesting(false);
      }
    };

    if (loading) return <div style={{ padding: 24 }}>{t('Đang tải...')}</div>;

    const label = (text: string) => <div style={{ fontSize: 12, color: token.colorTextSecondary, margin: '12px 0 4px' }}>{text}</div>;

    return (
      <div style={{ padding: 20, maxWidth: 1200, margin: '8px auto 16px', background: token.colorBgContainer, border: `0.8px solid ${token.colorBorderSecondary}`, borderRadius: 8 }}>
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={t('Dịch vụ HTML → PDF (Gotenberg) dùng chung')}
          description={
            <span>
              {t('Bật để xuất PDF')} <b>vector</b>{' '}
              {t('(chữ thật, copy được) cho "Lưu vào field" và "In hàng loạt". Một dịch vụ Gotenberg có thể phục vụ nhiều instance NocoBase. Tắt = dùng ảnh raster tại client (nút "In / PDF" thủ công vẫn luôn là vector).')}
            </span>
          }
        />
        <Card size="small">
          <Checkbox checked={enabled} onChange={(e) => setEnabled(e.target.checked)}>
            <b>{t('Bật dịch vụ PDF vector')}</b>
          </Checkbox>
          {label(t('URL dịch vụ (Gotenberg)'))}
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="VD: http://gotenberg.railway.internal:3000"
          />
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {t('Nên dùng URL nội bộ (private network) để không lộ dịch vụ ra internet.')}
          </Typography.Text>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              {label(t('Username (Basic Auth — tuỳ chọn)'))}
              <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder={t('để trống nếu không đặt auth')} />
            </div>
            <div style={{ flex: 1 }}>
              {label(t('Password (Basic Auth)'))}
              <Input.Password
                value={pwTouched ? password : hasPassword ? '••••••••' : ''}
                onChange={(e) => {
                  setPwTouched(true);
                  setPassword(e.target.value);
                }}
                placeholder={hasPassword ? t('đã đặt — gõ để đổi') : t('mật khẩu')}
              />
            </div>
          </div>
          <Space style={{ marginTop: 16 }}>
            <Button type="primary" loading={saving} onClick={save}>
              {t('Lưu')}
            </Button>
            <Button loading={testing} onClick={test} disabled={!url}>
              {t('Test kết nối')}
            </Button>
          </Space>
        </Card>
        <div style={{ fontSize: 12, color: token.colorTextSecondary, marginTop: 12 }}>
          {t('Gợi ý deploy: chạy image')} <code>gotenberg/gotenberg:8</code> {t('(Docker/Railway). Endpoint plugin gọi:')}
          <code> {'{url}'}/forms/chromium/convert/html</code>. {t('Mật khẩu lưu ở server, không trả về client.')}
        </div>
      </div>
    );
  };
}
