/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import React, { useState, useRef, useEffect } from 'react';
import { FormConsumer, useForm } from '@formily/react';
import { toJS } from '@formily/reactive';
import { useDebounceFn } from 'ahooks';
import {
  SchemaComponent,
  Input,
  FormItem,
  Checkbox,
  Radio,
  Select,
  InputNumber,
  Password,
  Space,
  Markdown,
  Action,
  ActionBar,
  useAPIClient,
} from '@nocobase/client';
import { css } from '@emotion/css';
import { theme } from 'antd';
import { usePluginTranslation } from './locale';
import { CustomSignInPage } from './CustomSignInPage';
import { AuthLayoutRender } from './CustomAuthLayout';
import { CustomColorPicker } from './components/CustomColorPicker';
import { PercentageInput } from './components/PercentageInput';

const SectionHeader = ({ title }: { title?: React.ReactNode }) => {
  const { token } = theme.useToken();
  return (
  <div
    style={{
      margin: '14px 0 8px',
      paddingBottom: 4,
      borderBottom: `1px solid ${token.colorBorderSecondary}`,
      fontSize: 12,
      fontWeight: 600,
      letterSpacing: 0.4,
      textTransform: 'uppercase',
      color: token.colorTextTertiary,
    }}
  >
    {title}
  </div>
  );
};

// Two-column grid wrapper for compact fields (e.g. the color pickers).
const Grid2 = ({ children }: { children?: React.ReactNode }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 12 }}>{children}</div>
);

// Tighten the vertical rhythm of the config panel.
const compactPanelCss = css`
  .ant-formily-item,
  .ant-form-item {
    margin-bottom: 10px !important;
  }
  .ant-formily-item-label,
  .ant-form-item-label {
    padding-bottom: 2px !important;
  }
  .ant-formily-item-label > label,
  .ant-form-item-label > label {
    height: auto !important;
    font-size: 13px;
  }
  .ant-formily-item-extra,
  .ant-form-item-extra {
    font-size: 11px;
    line-height: 1.35;
    opacity: 0.75;
  }
`;

export const LoginConfigDesigner = (props: any) => {
  const { token } = theme.useToken();
  const { t } = usePluginTranslation();
  const { schema, config } = props;
  const form = useForm();
  const [displayValues, setDisplayValues] = useState(toJS(form.values));
  const { run: applyPreview } = useDebounceFn((next) => setDisplayValues(next), { wait: 400 });
  const lastPreviewVersionRef = useRef<number | undefined>(undefined);
  const api = useAPIClient();

  useEffect(() => {
    if (config) {
      form.setValues(config);
    }
  }, [config, form]);

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* 左侧预览区域 */}
      <div
        style={{
          flex: 1,
          position: 'relative',
          borderRight: `1px solid ${token.colorBorderSecondary}`,
          overflow: 'hidden',
          background: '#f0f2f5',
        }}
      >
        <FormConsumer>
          {() => {
            const values = toJS(form.values);
            const livePreview = values?.__previewLive ?? true;
            const previewVersion = values?.__previewVersion;
            if (livePreview) {
              applyPreview(values);
            } else {
              if (previewVersion && previewVersion !== lastPreviewVersionRef.current) {
                lastPreviewVersionRef.current = previewVersion;
                setDisplayValues(values);
              }
            }
            return (
              <div style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
                <AuthLayoutRender loginConfig={displayValues}>
                  <CustomSignInPage loginConfig={displayValues} />
                </AuthLayoutRender>
              </div>
            );
          }}
        </FormConsumer>
      </div>

      {/* 右侧配置区域 */}
      <div
        className={compactPanelCss}
        style={{ width: 400, padding: '16px 20px', overflowY: 'auto', background: token.colorBgContainer, borderLeft: `1px solid ${token.colorBorderSecondary}` }}
      >
        <SchemaComponent
          schema={schema}
          scope={{
            t,
          }}
          components={{
            Input,
            FormItem,
            Checkbox,
            Radio,
            Select,
            InputNumber,
            Password,
            Space,
            Markdown,
            Action,
            ActionBar,
            CustomColorPicker,
            PercentageInput,
            SectionHeader,
            Grid2,
            fieldset: 'fieldset',
          }}
        />
      </div>
    </div>
  );
};
