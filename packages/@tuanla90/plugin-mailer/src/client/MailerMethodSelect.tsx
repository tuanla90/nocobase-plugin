// Sending-method picker for the Workflow node config (classic lane). Lists the named methods (fetched
// from mailer:methodOptions) and stores the method's stable `key`. A "Default method" option (value '')
// means "use whichever method is marked default". Crash-safe: if the fetch fails, the default option is
// still offered. Also exposes MailerConfigMethodsLink — a quick jump to Settings → Mailer → Sending methods.
import React, { useEffect, useState } from 'react';
import { Select, Space } from 'antd';
import { useAPIClient } from '@nocobase/client';
import { MAILER_RESOURCE } from '../shared/constants';
import type { MailMethodOption } from '../shared/types';
import { t, mailerMethodsSettingsUrl } from '../shared/mailerClient';

/** "Configure sending methods ↗" — opens the mailer settings (Tab 1) in a new tab (same app). */
export const MailerConfigMethodsLink: React.FC = () => (
  <a
    onClick={(e) => {
      e.preventDefault();
      window.open(mailerMethodsSettingsUrl(), '_blank', 'noopener');
    }}
    style={{ fontSize: 12, whiteSpace: 'nowrap' }}
  >
    {t('Configure sending methods ↗')}
  </a>
);

export const MailerMethodSelect: React.FC<{ value?: any; onChange?: (v: any) => void }> = ({ value, onChange }) => {
  const api: any = useAPIClient();
  const [methods, setMethods] = useState<MailMethodOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let live = true;
    setLoading(true);
    api
      ?.request?.({ url: `${MAILER_RESOURCE}:methodOptions`, method: 'post' })
      .then((res: any) => {
        if (live) setMethods((res?.data?.data || res?.data || []) as MailMethodOption[]);
      })
      .catch(() => {
        /* keep the default-only option */
      })
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [api]);

  const options = [
    { label: t('Default method'), value: '' },
    ...methods.map((m) => ({
      label: `${m.name || m.key} · ${m.backend === 'smtp' ? t('SMTP') : t('Apps Script')}${m.isDefault ? ' · ' + t('Default') : ''}${m.enabled === false ? ' · ' + t('Off') : ''}`,
      value: m.key,
    })),
  ];

  return (
    <Space.Compact style={{ width: '100%' }}>
      <Select
        style={{ width: '100%' }}
        showSearch
        optionFilterProp="label"
        loading={loading}
        placeholder={t('Default method')}
        value={value ?? ''}
        onChange={(v) => onChange?.(v)}
        options={options}
      />
    </Space.Compact>
  );
};

export default MailerMethodSelect;
