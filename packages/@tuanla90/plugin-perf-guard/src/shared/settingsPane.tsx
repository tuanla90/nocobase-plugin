import React from 'react';
import { Card, Switch, InputNumber, Button, Space, Typography, Alert, Descriptions, Tag, message } from 'antd';
import {
  isEnabled,
  setEnabledSetting,
  getMaxAlive,
  setMaxAlive,
  scanNow,
  runEvict,
  getStatus,
  KAC_VERSION,
} from './keepaliveCap';

const { Title, Paragraph, Text } = Typography;

/**
 * Settings page for both fixes. The keep-alive cap is a per-browser toggle + threshold (localStorage);
 * the crash guard is always-on (pure defense-in-depth, no downside) so it only shows a status line.
 * `t` translates VN source keys → EN for non-VN UIs (falls back to identity).
 */
export const PerfGuardSettingsPane: React.FC<{ t?: (s: string) => string }> = ({ t: tin }) => {
  const t = tin || ((s: string) => s);
  const [enabled, setEnabled] = React.useState<boolean>(() => isEnabled());
  const [maxAlive, setMax] = React.useState<number>(() => getMaxAlive());
  const [status, setStatus] = React.useState(() => getStatus());

  const refresh = React.useCallback(() => {
    try {
      setStatus(getStatus());
    } catch {
      /* ignore */
    }
  }, []);

  React.useEffect(() => {
    refresh();
    const id = setInterval(refresh, 2000); // live DOM signal
    return () => clearInterval(id);
  }, [refresh]);

  const onToggle = (v: boolean) => {
    setEnabledSetting(v);
    setEnabled(v);
    refresh();
  };
  const onMax = (v: number | null) => {
    const n = Math.max(0, Math.floor(Number(v) || 0));
    setMaxAlive(n);
    setMax(n);
    refresh();
  };
  const onScan = () => {
    const r = scanNow();
    message.info(`${t('Sẽ dọn')} ${r.evicted} ${t('trang nền')} · ${t('đang có')} ${r.scanned}`);
    refresh();
  };
  const onEvict = () => {
    const r = runEvict();
    message.success(`${t('Đã dọn')} ${r.evicted} ${t('trang')} · ${t('còn giữ')} ${r.kept}`);
    refresh();
  };

  return (
    <div style={{ maxWidth: 780 }}>
      <Title level={4} style={{ marginTop: 0 }}>
        {t('Tối ưu & Ổn định')}{' '}
        <Tag color="blue" style={{ verticalAlign: 'middle' }}>
          v{KAC_VERSION}
        </Tag>
      </Title>
      <Paragraph type="secondary" style={{ marginBottom: 20 }}>
        {t('Hai lớp bảo vệ cho giao diện hiện đại (/v/): giới hạn keep-alive để app không chậm dần, và chống treo khi gặp quan hệ hỏng.')}
      </Paragraph>

      {/* ── Keep-alive cap ─────────────────────────────────────────────────────────────── */}
      <Card
        size="small"
        title={t('Giới hạn keep-alive (chống DOM phình to)')}
        style={{ marginBottom: 16 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <Text strong>{t('Tự động dọn trang nền')}</Text>
            <Paragraph type="secondary" style={{ margin: '4px 0 0' }}>
              {t('NocoBase v2 giữ mọi trang đã mở trong bộ nhớ và không dọn — số DOM node tăng vô hạn khi điều hướng menu (3k → 21k) cho tới khi F5. Bật để tự động dọn, giữ DOM gọn.')}
            </Paragraph>
          </div>
          <Switch checked={enabled} onChange={onToggle} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
          <div style={{ flex: 1 }}>
            <Text strong>{t('Số trang nền giữ tối đa')}</Text>
            <Paragraph type="secondary" style={{ margin: '4px 0 0' }}>
              {t('Giữ N trang gần nhất còn sống để quay lại tức thì; các trang cũ hơn sẽ được dọn. 0 = dọn hết trang nền (tối đa hiệu năng, nhưng quay lại sẽ tải lại trang).')}
            </Paragraph>
          </div>
          <InputNumber min={0} max={100} value={maxAlive} onChange={onMax} disabled={!enabled} style={{ width: 96 }} />
        </div>

        <Descriptions size="small" column={2} bordered style={{ marginTop: 16 }}>
          <Descriptions.Item label={t('Trạng thái')}>
            {enabled ? <Tag color="green">{t('Đang bật')}</Tag> : <Tag>{t('Đã tắt')}</Tag>}
          </Descriptions.Item>
          <Descriptions.Item label={t('Giữ tối đa')}>{maxAlive === 0 ? t('dọn hết') : maxAlive}</Descriptions.Item>
          <Descriptions.Item label={t('Trang đang giữ (page-header)')}>
            <Text strong style={{ color: status.pageHeaders > 8 ? '#d46b08' : undefined }}>{status.pageHeaders}</Text>
          </Descriptions.Item>
          <Descriptions.Item label={t('Vùng chứa trang con (slot)')}>{status.slots}</Descriptions.Item>
        </Descriptions>

        <Space style={{ marginTop: 16 }} wrap>
          <Button onClick={onScan}>{t('Quét thử (không xoá)')}</Button>
          <Button type="primary" onClick={onEvict}>{t('Dọn ngay')}</Button>
          <Button type="text" onClick={refresh}>{t('Làm mới')}</Button>
        </Space>
        <Paragraph type="secondary" style={{ margin: '12px 0 0', fontSize: 12 }}>
          {t('Mẹo: mở Console gõ')} <Text code>window.__ptdlPerfGuard.status()</Text> {t('để xem chi tiết.')}
        </Paragraph>
      </Card>

      {/* ── Crash guard (always on) ─────────────────────────────────────────────────────── */}
      <Card size="small" title={t('Chống treo do quan hệ hỏng')}>
        <Alert
          type="success"
          showIcon
          message={t('Đang bật (luôn bật)')}
          description={t('Một quan hệ hỏng (thiếu belongsTo ngược / lệch khóa ngoại) có thể khiến một cột ném lỗi khi render và làm treo cả app. Lớp này cô lập từng cột: cột hỏng chỉ thành ô trống thay vì làm treo tất cả.')}
        />
      </Card>
    </div>
  );
};

export default PerfGuardSettingsPane;
