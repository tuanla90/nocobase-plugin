import React from 'react';
import { Button } from 'antd';
import { getPlatform, type PlatformKind } from './deviceInfo';
import { t } from './i18n';

/**
 * Friendly "permission was blocked" guidance — replaces a bare toast. Detects the platform and shows
 * the exact steps to re-enable camera / location, plus a Retry button. Used by the camera modal and
 * the location widget.
 */

export type PermKind = 'camera' | 'location';

function steps(kind: PermKind, platform: PlatformKind): string[] {
  const what = kind === 'camera' ? t('Máy ảnh') : t('Định vị');
  if (platform === 'ios') {
    return kind === 'camera'
      ? [
          t('Mở Cài đặt → Safari → Máy ảnh → chọn "Cho phép".'),
          t('Hoặc chạm biểu tượng "ᴀA" bên trái thanh địa chỉ → Cài đặt trang → Máy ảnh → Cho phép.'),
          t('Quay lại trang này và bấm "Thử lại".'),
        ]
      : [
          t('Mở Cài đặt → Quyền riêng tư & Bảo mật → Dịch vụ định vị → bật, và cho Safari = "Khi dùng ứng dụng".'),
          t('Cài đặt → Safari → Vị trí → chọn "Hỏi" hoặc "Cho phép".'),
          t('Quay lại trang này và bấm "Thử lại".'),
        ];
  }
  if (platform === 'android') {
    return [
      t('Chạm biểu tượng 🔒 bên trái thanh địa chỉ → Quyền (Permissions).'),
      t('Bật {{w}} = "Cho phép".').replace('{{w}}', what),
      kind === 'location'
        ? t('Đảm bảo GPS/Vị trí của điện thoại đang BẬT (vuốt xuống bật Location).')
        : t('Nếu không thấy, vào Cài đặt Chrome → Cài đặt trang → {{w}}.').replace('{{w}}', what),
      t('Tải lại trang rồi bấm "Thử lại".'),
    ];
  }
  // desktop
  return [
    t('Bấm biểu tượng 🔒 (hoặc ⓘ) bên trái thanh địa chỉ.'),
    t('Đổi {{w}} từ "Chặn" sang "Cho phép".').replace('{{w}}', what),
    t('Bấm "Thử lại" (có thể cần tải lại trang).'),
  ];
}

export const PermissionHelp: React.FC<{ kind: PermKind; onRetry?: () => void; compact?: boolean }> = ({ kind, onRetry, compact }) => {
  const platform = getPlatform();
  const list = steps(kind, platform);
  const title = kind === 'camera'
    ? t('Chưa được cấp quyền máy ảnh')
    : t('Chưa được cấp quyền vị trí');

  return (
    <div
      style={{
        border: '1px solid var(--colorWarningBorder, #ffe58f)',
        background: 'var(--colorWarningBg, #fffbe6)',
        borderRadius: 10,
        padding: compact ? '10px 12px' : '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, color: 'var(--colorWarningText, #ad6800)' }}>
        <span style={{ fontSize: 18, lineHeight: 1 }}>{kind === 'camera' ? '📷' : '📍'}</span>
        <span>{title}</span>
      </div>
      <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 4, color: 'var(--colorText, #555)', fontSize: 13, lineHeight: 1.5 }}>
        {list.map((s, i) => <li key={i}>{s}</li>)}
      </ol>
      {onRetry && (
        <div style={{ marginTop: 2 }}>
          <Button size="small" type="primary" onClick={onRetry}>{t('Thử lại')}</Button>
        </div>
      )}
    </div>
  );
};
