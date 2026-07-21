// Template picker for the Workflow node config (classic lane). Lists MANAGED templates by NAME
// (fetched from ptdlMailTemplates) and stores the template id under the hood — so the user never
// types a raw "template id". An "Inline (no template)" option (value 0) means "use the Subject/Content
// fields below". Crash-safe: if the fetch fails, the inline option is still offered.
import React, { useEffect, useState } from 'react';
import { Select } from 'antd';
import { useAPIClient } from '@nocobase/client';
import { TEMPLATES_COLLECTION } from '../shared/constants';
import { t } from '../shared/mailerClient';

export const MailerTemplateSelect: React.FC<{ value?: any; onChange?: (v: any) => void }> = ({ value, onChange }) => {
  const api: any = useAPIClient();
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let live = true;
    setLoading(true);
    api
      ?.request?.({ url: `${TEMPLATES_COLLECTION}:list`, params: { paginate: false, sort: ['-id'] } })
      .then((res: any) => {
        if (live) setTemplates((res?.data?.data || []).filter((x: any) => x.enabled !== false));
      })
      .catch(() => {
        /* keep the inline-only option */
      })
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [api]);

  const options = [
    { label: t('Inline (no template)'), value: 0 },
    ...templates.map((x: any) => ({
      label: `${x.name || `#${x.id}`} · ${x.collectionName || t('any collection')} · #${x.id}`,
      value: x.id,
    })),
  ];

  return (
    <Select
      style={{ width: '100%' }}
      showSearch
      optionFilterProp="label"
      loading={loading}
      placeholder={t('Pick a template')}
      value={value ?? 0}
      onChange={(v) => onChange?.(v)}
      options={options}
    />
  );
};

export default MailerTemplateSelect;
