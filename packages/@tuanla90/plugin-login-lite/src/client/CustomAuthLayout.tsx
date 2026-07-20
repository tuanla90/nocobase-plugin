/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Col, Row, Spin } from 'antd';
import { Outlet } from 'react-router-dom';
import { useSystemSettings, useRequest } from '@nocobase/client';
import { usePluginTranslation } from './locale';
import { AuthenticatorsContextProvider } from '@nocobase/plugin-auth/client';
import { css } from '@emotion/css';
import MarkdownIt from 'markdown-it';
import { DEFAULT_BG_GRADIENT, DEFAULT_POWERED_BY_HTML, hexToRgba, resolveThemePalette, gradientCss } from '@tuanla90/shared';

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
});

function MarkdownRenderer({ content }: { content: string }) {
  const html = useMemo(() => md.render(content || ''), [content]);
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

// Tracks the visitor's OS light/dark preference (for the "System" form theme).
function usePrefersDark(): boolean {
  const query = '(prefers-color-scheme: dark)';
  const [dark, setDark] = useState(
    () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(query).matches,
  );
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener?.('change', handler);
    return () => mq.removeEventListener?.('change', handler);
  }, []);
  return dark;
}

type LoginConfigOptions = {
  useSystemName?: 'yes' | 'no';
  customSystemName?: string;
  leftContentType?: 'gradient' | 'image' | 'html' | 'url';
  leftGradient?: string;
  leftImage?: string;
  leftUrl?: string;
  leftHtml?: string;
  loginMethods?: string[];
  copyright?: string;
  icp?: string;
  themeColor?: string;
  themeOpacity?: number;
  fontColor?: string;
  formThemeColor?: string;
  formFontColor?: string;
  buttonBgColor?: string;
  buttonTextColor?: string;
  formLayout?: 'panel' | 'float';
  formPosition?: 'left' | 'center' | 'right';
  showFieldIcons?: boolean;
  redirectPath?: string;
  logoUrl?: string;
  formTheme?: 'custom' | 'dark' | 'light';
  accountIcon?: string;
  passwordIcon?: string;
};

type LoginConfigRecord = LoginConfigOptions & {
  options?: LoginConfigOptions;
  __previewLive?: boolean;
};

type LoginConfigResponse = {
  data?: LoginConfigRecord | null;
};

let cachedLoginConfig: LoginConfigRecord | null = null;

function AuthLayoutLoading() {
  return (
    <div
      style={{
        width: '100vw',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Spin />
    </div>
  );
}

export function AuthLayoutRender({
  loginConfig: propsLoginConfig,
  children,
}: {
  loginConfig?: LoginConfigRecord | null;
  children?: React.ReactNode;
}) {
  const { data } = useSystemSettings() || {};
  const { t } = usePluginTranslation();

  // Use options if available, otherwise fallback to the object itself (in case it's already the options object)
  const loginConfig = propsLoginConfig?.options || propsLoginConfig || {};
  const isPreview = !!propsLoginConfig?.__previewLive;

  // Custom image if the admin set one; otherwise a bundled gradient (no external request).
  const bgImage = loginConfig.leftImage || '';

  const systemName = loginConfig.useSystemName === 'no' ? loginConfig.customSystemName : t(data?.data?.title);
  const isHtmlContent = loginConfig.leftContentType === 'html';
  const isUrlContent = loginConfig.leftContentType === 'url';
  const isGradient = loginConfig.leftContentType === 'gradient';

  // Full palette (custom pickers, or a light/dark/system preset that overrides them).
  const prefersDark = usePrefersDark();
  const palette = resolveThemePalette(loginConfig, prefersDark);
  const themeOpacity = loginConfig.themeOpacity !== undefined ? loginConfig.themeOpacity : 1;
  let bgColor = palette.pageBg;
  if (themeOpacity !== 1 && bgColor.startsWith('#')) {
    bgColor = hexToRgba(bgColor, themeOpacity);
  }
  const fontColor = palette.pageText;
  const footerCopyright = loginConfig.copyright || DEFAULT_POWERED_BY_HTML;

  const bgStyleImage = isGradient
    ? gradientCss(loginConfig.leftGradient)
    : bgImage
      ? `url(${bgImage})`
      : DEFAULT_BG_GRADIENT;

  const formLayout = loginConfig.formLayout === 'float' ? 'float' : 'panel';
  const rawPosition = loginConfig.formPosition;
  const formPosition =
    rawPosition === 'left' || rawPosition === 'center' || rawPosition === 'right' ? rawPosition : 'right';

  const fontFamilyCss = css`
    &,
    & * {
      font-family: inherit !important;
    }
  `;
  const rootStyle: React.CSSProperties = {
    width: isPreview ? '100%' : '100vw',
    height: isPreview ? '100%' : '100vh',
    minHeight: isPreview ? '100%' : '100vh',
    overflow: 'hidden',
  };

  // 左侧内容区域 / background layer
  const bgLayer = isUrlContent ? (
    <iframe
      src={loginConfig.leftUrl}
      style={{ width: '100%', height: '100%', border: 'none' }}
      title="Embedded Content"
    />
  ) : isHtmlContent ? (
    <div
      style={{ width: '100%', height: '100%', border: 'none' }}
      dangerouslySetInnerHTML={{ __html: loginConfig.leftHtml || '' }}
    />
  ) : (
    <div
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: '#111',
        backgroundImage: bgStyleImage,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        position: 'relative',
      }}
    >
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.1)' }} />
    </div>
  );

  // 系统名 + 表单 + 页脚
  const formRegion = (
    <div
      className={css`
        .content-wrapper,
        .main-content {
          width: 100%;
          display: flex;
          justify-content: center;
        }
      `}
    >
      <div style={{ width: '70%', margin: '0 auto', marginBottom: 20, textAlign: 'center' }}>
        {loginConfig.logoUrl ? (
          <img
            src={loginConfig.logoUrl}
            alt="logo"
            style={{ maxHeight: 56, maxWidth: '100%', objectFit: 'contain', marginBottom: 12 }}
          />
        ) : null}
        <h1 style={{ fontSize: 24, fontWeight: 'bold', margin: 0, color: fontColor }}>{systemName}</h1>
      </div>
      <div className="content-wrapper">
        <div className="main-content">
          <AuthenticatorsContextProvider>
            {children ? children : <Outlet context={{ loginConfig: propsLoginConfig }} />}
          </AuthenticatorsContextProvider>
        </div>
      </div>
      <div style={{ width: '90%', margin: '40px auto 0', color: fontColor, textAlign: 'center' }}>
        {/* 警告：版权信息,根据开源协议，开源版不许移除对应版权信息
           如果要修改调整请遵守官方许可协议：
           中文；https://www.nocobase.com/cn/agreement
           English：https://www.nocobase.com/agreement
           调整版权信息请遵守开源协议，否则可能会导致法律问题等一系列原因，我方不对此负任何责任
        */}
        <div style={{ marginBottom: 8 }}>
          <MarkdownRenderer content={footerCopyright} />
        </div>
        {/* ICP 备案信息 */}
        {loginConfig.icp && (
          <div style={{ marginBottom: 8 }}>
            <MarkdownRenderer content={loginConfig.icp} />
          </div>
        )}
      </div>
    </div>
  );

  // Floating card: background fills the whole viewport, form floats over it.
  if (formLayout === 'float') {
    const justify = formPosition === 'left' ? 'flex-start' : formPosition === 'center' ? 'center' : 'flex-end';
    return (
      <div className={fontFamilyCss} style={{ ...rootStyle, position: 'relative' }}>
        <div style={{ position: 'absolute', inset: 0 }}>{bgLayer}</div>
        <div
          style={{
            position: 'relative',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: justify,
            padding: '24px clamp(24px, 6vw, 120px)',
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              width: 'min(420px, 92vw)',
              maxHeight: '92%',
              overflowY: 'auto',
              background: bgColor,
              color: fontColor,
              borderRadius: 16,
              padding: '40px 28px',
              boxShadow: '0 16px 48px rgba(0,0,0,0.35)',
            }}
            className={css`
              @media (max-width: 768px) {
                padding: 28px 18px !important;
              }
            `}
          >
            {formRegion}
          </div>
        </div>
      </div>
    );
  }

  // Side panel (default): full-bleed background with a full-height form column overlaying it
  // (left or right). A transparent panel color lets the background show through.
  return (
    <div className={fontFamilyCss} style={{ ...rootStyle, position: 'relative' }}>
      <div style={{ position: 'absolute', inset: 0 }}>{bgLayer}</div>
      <div
        style={{
          position: 'relative',
          height: '100%',
          display: 'flex',
          justifyContent: formPosition === 'left' ? 'flex-start' : 'flex-end',
        }}
      >
        <div
          style={{
            width: 400,
            maxWidth: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            position: 'relative',
            backgroundColor: bgColor,
            color: fontColor,
          }}
          className={css`
            @media (max-width: 768px) {
              width: 100% !important;
            }
          `}
        >
          {formRegion}
        </div>
      </div>
    </div>
  );
}

export function CustomAuthLayout() {
  const {
    data: loginConfigResult,
    loading,
    error,
  } = useRequest(
    {
      resource: 'login_configs',
      action: 'getActiveConfig', // This action needs to be implemented in server
      params: {
        type: 'home',
      },
    },
    {
      onError: (err) => {
        console.error('Failed to fetch login config', err);
      },
    },
  );

  const requestConfig = (loginConfigResult as LoginConfigResponse | undefined)?.data || null;
  const loginConfig = loading ? cachedLoginConfig : requestConfig || (error ? cachedLoginConfig : null) || {};

  useEffect(() => {
    if (!loading && !error) {
      cachedLoginConfig = requestConfig;
    }
  }, [error, loading, requestConfig]);

  if (loading && !loginConfig) {
    return <AuthLayoutLoading />;
  }

  return <AuthLayoutRender loginConfig={loginConfig} />;
}
