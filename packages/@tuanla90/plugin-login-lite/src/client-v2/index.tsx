/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import {
  DingtalkOutlined,
  GoogleOutlined,
  LeftOutlined,
  LoginOutlined,
  MailOutlined,
  MobileOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { css } from '@emotion/css';
import { Plugin, SwitchLanguage, useApp, usePlugin, useSystemSettings } from '@nocobase/client-v2';
import PluginAuthClientV2, {
  AuthenticatorsContext,
  AuthenticatorsContextProvider,
  type AuthOptions,
  type Authenticator,
} from '@nocobase/plugin-auth/client-v2';
import { Alert, Button, Col, Empty, Row, Space, Spin, theme } from 'antd';
import MarkdownIt from 'markdown-it';
import React, { lazy, Suspense, useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet, useOutletContext, useSearchParams } from 'react-router-dom';
import {
  DEFAULT_BG_GRADIENT,
  DEFAULT_POWERED_BY_HTML,
  hexToRgba,
  svgFieldIcon,
  accountIconPath,
  passwordIconPath,
  resolveThemePalette,
  gradientCss,
} from '@tuanla90/shared';
import enUS from '../locale/en-US.json';
import viVN from '../locale/vi-VN.json';
import { LoginConfigPaneV2 } from './LoginConfigPaneV2';

const NAMESPACE = '@tuanla90/plugin-login-lite';

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
});

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

type LoaderMap<L> = Record<string, L>;

type SignInComponentProps = {
  authenticator: Authenticator;
};

type LoginOption = {
  type: 'authenticator';
  key: string;
  label: string;
  icon: React.ReactNode;
  authenticator: Authenticator;
};

function useLoginLiteTranslation() {
  return useTranslation([NAMESPACE, 'client'], { nsMode: 'fallback' });
}

function getErrorMessage(error: unknown, fallback: string) {
  if (!error || typeof error !== 'object') {
    return fallback;
  }

  const maybeError = error as {
    message?: string;
    response?: { data?: { errors?: { message?: string }[] } };
  };
  return maybeError.response?.data?.errors?.[0]?.message || maybeError.message || fallback;
}

function getResponseData<T>(response: { data?: { data?: T } | T } | undefined): T | undefined {
  const payload = response?.data;
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return payload.data as T;
  }
  return payload as T | undefined;
}

function normalizeLoginConfig(config: LoginConfigRecord | undefined): LoginConfigOptions {
  return config?.options || config || {};
}

function MarkdownRenderer({ content }: { content: string }) {
  const html = useMemo(() => md.render(content || ''), [content]);
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

function useLoaderMap<K extends keyof AuthOptions>(field: K): LoaderMap<NonNullable<AuthOptions[K]>> {
  const plugin = usePlugin(PluginAuthClientV2);
  return useMemo(() => {
    const result: LoaderMap<NonNullable<AuthOptions[K]>> = {};
    for (const [authType, options] of plugin.authTypes.getEntities()) {
      const loader = options[field];
      if (loader) {
        result[authType] = loader as NonNullable<AuthOptions[K]>;
      }
    }
    return result;
  }, [field, plugin]);
}

function lazyByAuthType<P>(loaderMap: LoaderMap<() => Promise<{ default: React.ComponentType<P> }>>) {
  const cache = new Map<string, React.LazyExoticComponent<React.ComponentType<P>>>();
  return (authType: string) => {
    if (!loaderMap[authType]) {
      return undefined;
    }
    if (!cache.has(authType)) {
      cache.set(authType, lazy(loaderMap[authType]));
    }
    return cache.get(authType);
  };
}

export function AuthLayoutRenderV2({
  loginConfig: propsLoginConfig,
  children,
}: {
  loginConfig?: LoginConfigRecord;
  children?: React.ReactNode;
}) {
  const { data } = useSystemSettings() || {};
  const { t: tCollections } = useTranslation('lm-collections');
  const { token } = theme.useToken();

  const loginConfig = normalizeLoginConfig(propsLoginConfig);
  const isPreview = !!propsLoginConfig?.__previewLive;
  const isHtmlContent = loginConfig.leftContentType === 'html';
  const isUrlContent = loginConfig.leftContentType === 'url';
  const isGradient = loginConfig.leftContentType === 'gradient';

  // Full palette (custom pickers, or a light/dark/system preset that overrides them).
  const prefersDark = usePrefersDark();
  const palette = resolveThemePalette(loginConfig, prefersDark);
  const themeOpacity = loginConfig.themeOpacity !== undefined ? loginConfig.themeOpacity : 1;
  const bgColor =
    themeOpacity !== 1 && palette.pageBg.startsWith('#') ? hexToRgba(palette.pageBg, themeOpacity) : palette.pageBg;
  const fontColor = palette.pageText;
  const systemTitle = String(data?.data?.title || 'NocoBase');
  const systemName = loginConfig.useSystemName === 'no' ? loginConfig.customSystemName : tCollections(systemTitle);
  const footerCopyright = loginConfig.copyright || DEFAULT_POWERED_BY_HTML;
  // Custom image if the admin set one; otherwise a bundled gradient (no external request).
  const bgImage = loginConfig.leftImage || '';
  const bgStyleImage = isGradient
    ? gradientCss(loginConfig.leftGradient)
    : bgImage
      ? `url(${bgImage})`
      : DEFAULT_BG_GRADIENT;

  const formLayout = loginConfig.formLayout === 'float' ? 'float' : 'panel';
  const rawPosition = loginConfig.formPosition;
  const formPosition =
    rawPosition === 'left' || rawPosition === 'center' || rawPosition === 'right' ? rawPosition : 'right';

  const rootStyle: React.CSSProperties = {
    width: isPreview ? '100%' : '100vw',
    height: isPreview ? '100%' : '100vh',
    minHeight: isPreview ? '100%' : '100vh',
    overflow: 'hidden',
  };

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

  const languageSwitch = (
    <div style={{ position: 'fixed', top: token.paddingLG, right: token.paddingLG, color: fontColor, zIndex: 10 }}>
      <SwitchLanguage />
    </div>
  );

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
      <div style={{ width: '70%', margin: '0 auto 20px', textAlign: 'center' }}>
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
            {children || <Outlet context={{ loginConfig: propsLoginConfig }} />}
          </AuthenticatorsContextProvider>
        </div>
      </div>
      <div style={{ width: '90%', margin: '40px auto 0', color: fontColor, textAlign: 'center' }}>
        <div style={{ marginBottom: 8 }}>
          <MarkdownRenderer content={footerCopyright} />
        </div>
        {loginConfig.icp ? (
          <div style={{ marginBottom: 8 }}>
            <MarkdownRenderer content={loginConfig.icp} />
          </div>
        ) : null}
      </div>
    </div>
  );

  // Floating card: background fills the whole viewport, form floats over it.
  if (formLayout === 'float') {
    const justify = formPosition === 'left' ? 'flex-start' : formPosition === 'center' ? 'center' : 'flex-end';
    return (
      <div
        className={css`
          &,
          & * {
            font-family: inherit !important;
          }
        `}
        style={{ ...rootStyle, position: 'relative' }}
      >
        <div style={{ position: 'absolute', inset: 0 }}>{bgLayer}</div>
        {!isPreview && languageSwitch}
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
    <div
      className={css`
        &,
        & * {
          font-family: inherit !important;
        }
      `}
      style={{ ...rootStyle, position: 'relative' }}
    >
      <div style={{ position: 'absolute', inset: 0 }}>{bgLayer}</div>
      {!isPreview && languageSwitch}
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

export function CustomSignInPageV2({ loginConfig: propsLoginConfig }: { loginConfig?: LoginConfigRecord }) {
  const [t] = useLoginLiteTranslation();
  const { loginConfig: contextLoginConfig } = useOutletContext<{ loginConfig?: LoginConfigRecord }>() || {};
  const rawLoginConfig = propsLoginConfig || contextLoginConfig;
  const loginConfig = normalizeLoginConfig(rawLoginConfig);
  // Config passed via props (not Outlet context) means this is the settings-page preview, not the
  // real sign-in route — skip page-level side effects (document.title, ?redirect injection).
  const isPreview = !!propsLoginConfig;
  const authenticators = useContext(AuthenticatorsContext);
  const signInFormLoaders = useLoaderMap('signInFormLoader');
  const signInButtonLoaders = useLoaderMap('signInButtonLoader');
  const resolveSignInForm = useMemo(() => lazyByAuthType<SignInComponentProps>(signInFormLoaders), [signInFormLoaders]);
  const resolveSignInButton = useMemo(
    () => lazyByAuthType<SignInComponentProps>(signInButtonLoaders),
    [signInButtonLoaders],
  );

  useEffect(() => {
    if (isPreview) return;
    document.title = t('Signin');
  }, [t, isPreview]);

  const loginMethods = loginConfig.loginMethods || ['password'];
  const showPassword = loginMethods.includes('password');

  const availableOptions: LoginOption[] = useMemo(() => {
    const options: LoginOption[] = [];
    authenticators.forEach((authenticator) => {
      const hasForm = !!resolveSignInForm(authenticator.authType);
      const hasButton = !!resolveSignInButton(authenticator.authType);
      const isBasicOrEmail =
        authenticator.authType === 'basic' || authenticator.authType === 'email' || authenticator.authType === 'Email';

      if ((!hasForm && !hasButton) || (isBasicOrEmail && !showPassword)) {
        return;
      }

      let icon = <LoginOutlined />;
      if (isBasicOrEmail) {
        icon =
          authenticator.authType === 'email' || authenticator.authType === 'Email' ? (
            <MailOutlined />
          ) : (
            <UserOutlined />
          );
      } else if (authenticator.authType.toLowerCase() === 'sms') {
        icon = <MobileOutlined />;
      } else if (authenticator.authType.toLowerCase() === 'dingtalk') {
        icon = <DingtalkOutlined />;
      } else if (authenticator.authType.toLowerCase() === 'google' || authenticator.authType === 'Google') {
        icon = <GoogleOutlined />;
      }

      options.push({
        type: 'authenticator',
        key: authenticator.name,
        label: authenticator.title || (isBasicOrEmail ? t('Password Login') : authenticator.name),
        icon,
        authenticator,
      });
    });
    return options;
  }, [authenticators, resolveSignInButton, resolveSignInForm, showPassword, t]);

  const [mode, setMode] = useState<string>('select');
  const [currentAuthenticator, setCurrentAuthenticator] = useState<Authenticator | null>(null);

  useEffect(() => {
    if (availableOptions.length === 1 && mode === 'select') {
      const option = availableOptions[0];
      setMode(option.key);
      setCurrentAuthenticator(option.authenticator);
    }
  }, [availableOptions, mode]);

  // Full palette (custom pickers, or a light/dark/system preset that overrides them).
  const prefersDark = usePrefersDark();
  const palette = resolveThemePalette(loginConfig, prefersDark);
  const formThemeColor = palette.cardBg;
  const formFontColor = palette.cardText;
  const buttonBgColor = palette.btnBg;
  const buttonTextColor = palette.btnText;
  const { inputBg, inputBorder, inputBorderHover, inputText } = palette;

  // Icon-only fields: draw a leading icon inside the username / password inputs.
  // Default ON (only disabled when explicitly set to false).
  const showFieldIcons = loginConfig.showFieldIcons !== false;
  const fieldIconCss = showFieldIcons
    ? css`
        /* account (username): classic wraps it in an affix wrapper, v2 uses a plain input;
           in both lanes only the PASSWORD carries the .ant-input-password class */
        .ant-input-affix-wrapper:not(.ant-input-password),
        input.ant-input:not(.ant-input-affix-wrapper input) {
          padding-left: 34px !important;
          background-image: ${svgFieldIcon(accountIconPath(loginConfig.accountIcon), inputText)};
          background-repeat: no-repeat;
          background-position: 10px center;
        }
        /* password: affix wrapper tagged .ant-input-password in both lanes */
        .ant-input-affix-wrapper.ant-input-password {
          padding-left: 34px !important;
          background-image: ${svgFieldIcon(passwordIconPath(loginConfig.passwordIcon), inputText)};
          background-repeat: no-repeat;
          background-position: 10px center;
        }
      `
    : '';

  // A11y: sign-in inputs have no visible label (icon + placeholder only) — mirror the
  // placeholder into aria-label so screen readers announce the field.
  const formCardRef = React.useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = formCardRef.current;
    if (!root) return;
    const apply = () => {
      root.querySelectorAll('input').forEach((el) => {
        const ph = el.getAttribute('placeholder');
        if (ph && !el.getAttribute('aria-label')) el.setAttribute('aria-label', ph);
      });
    };
    apply();
    const mo = new MutationObserver(apply);
    mo.observe(root, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [mode, currentAuthenticator]);

  // Default landing page: inject ?redirect= when config sets one and the URL has none.
  // Only on the real sign-in page (config from Outlet context, not props → preview).
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (isPreview) return;
    const redirectPath = loginConfig.redirectPath;
    if (redirectPath && !searchParams.get('redirect')) {
      const next = new URLSearchParams(searchParams);
      next.set('redirect', redirectPath);
      setSearchParams(next, { replace: true });
    }
  }, [isPreview, loginConfig.redirectPath, searchParams, setSearchParams]);

  if (!availableOptions.length) {
    return <Empty description={t('No authentication methods available.')} />;
  }

  return (
    <Space
      direction="vertical"
      className={css`
        display: flex;
        width: 100%;
      `}
    >
      {mode === 'select' && availableOptions.length > 1 ? (
        <div style={{ width: '70%', margin: '0 auto' }}>
          <div
            className={css`
              display: grid;
              grid-template-columns: 1fr;
              gap: 14px;
            `}
          >
            {availableOptions.map((option) => {
              const ButtonComponent = resolveSignInButton(option.authenticator.authType);
              const FormComponent = resolveSignInForm(option.authenticator.authType);
              if (ButtonComponent && !FormComponent) {
                return (
                  <div
                    key={option.key}
                    className={css`
                      width: 100%;
                      .ant-btn {
                        width: 100%;
                        height: 44px;
                        border-radius: 999px;
                        background: ${buttonBgColor};
                        border-color: ${buttonBgColor} !important;
                        color: ${buttonTextColor} !important;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        box-shadow: none;
                      }
                      .ant-btn:hover {
                        background: ${buttonBgColor} !important;
                        border-color: ${buttonBgColor} !important;
                        color: ${buttonTextColor} !important;
                        opacity: 0.92 !important;
                      }
                    `}
                  >
                    <Suspense fallback={<Spin />}>
                      <ButtonComponent authenticator={option.authenticator} />
                    </Suspense>
                  </div>
                );
              }

              return (
                <Button
                  key={option.key}
                  block
                  size="large"
                  type="default"
                  icon={option.icon}
                  onClick={() => {
                    setMode(option.key);
                    setCurrentAuthenticator(option.authenticator);
                  }}
                  className={css`
                    height: 44px;
                    border-radius: 999px;
                    background: ${buttonBgColor};
                    border-color: ${buttonBgColor} !important;
                    color: ${buttonTextColor} !important;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                  `}
                >
                  {option.label}
                </Button>
              );
            })}
          </div>
        </div>
      ) : null}

      {mode !== 'select' || availableOptions.length === 1 ? (
        <div
          ref={formCardRef}
          style={{
            maxWidth: 360,
            width: '90%',
            margin: '40px auto 0',
            padding: 32,
            background: formThemeColor,
            border: '1px solid rgba(255,255,255,0.25)',
            borderRadius: 16,
            backdropFilter: 'blur(6px)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
            color: formFontColor,
          }}
          className={[
            css`
            .ant-input,
            .ant-input-password,
            .ant-input-affix-wrapper {
              background-color: ${inputBg} !important;
              border-color: ${inputBorder} !important;
              color: ${inputText} !important;
              /* keep the fill inside the border so the semi-transparent edge doesn't create a halo */
              background-clip: padding-box !important;
            }
            .ant-input-affix-wrapper > input.ant-input {
              background-color: transparent !important;
              color: ${inputText} !important;
            }
            .ant-input::placeholder {
              color: ${inputText} !important;
              opacity: 0.6;
            }
            .ant-input:hover,
            .ant-input:focus,
            .ant-input-password:hover,
            .ant-input-password:focus-within,
            .ant-input-affix-wrapper:hover,
            .ant-input-affix-wrapper-focused {
              border-color: ${inputBorderHover} !important;
            }
            .ant-btn-primary {
              background-color: ${buttonBgColor} !important;
              border-color: ${buttonBgColor} !important;
              color: ${buttonTextColor} !important;
            }
            .ant-form-item-explain-error {
              color: #ffccc7 !important;
            }
            .ant-form-item-label > label,
            label {
              color: ${formFontColor} !important;
            }
            .ant-btn-default,
            .ant-btn:not(.ant-btn-primary):not(.ant-btn-link):not(.ant-btn-text) {
              background-color: transparent !important;
              border-color: rgba(255, 255, 255, 0.4) !important;
              color: ${formFontColor} !important;
            }
            a {
              color: ${formFontColor} !important;
              text-decoration: underline;
              opacity: 0.8;
            }
          `,
            fieldIconCss,
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {availableOptions.length > 1 ? (
            <div style={{ marginBottom: 16 }}>
              <Button
                type="text"
                icon={<LeftOutlined />}
                onClick={() => {
                  setMode('select');
                  setCurrentAuthenticator(null);
                }}
                style={{ color: formFontColor, paddingLeft: 0 }}
              >
                {t('Back')}
              </Button>
            </div>
          ) : null}

          {currentAuthenticator ? (
            <Suspense fallback={<Spin />}>
              {(() => {
                const FormComponent = resolveSignInForm(currentAuthenticator.authType);
                const ButtonComponent = resolveSignInButton(currentAuthenticator.authType);
                const Component = FormComponent || ButtonComponent;
                return Component ? <Component authenticator={currentAuthenticator} /> : null;
              })()}
            </Suspense>
          ) : null}
        </div>
      ) : null}
    </Space>
  );
}

export function CustomAuthLayoutV2() {
  const app = useApp();
  const [t] = useLoginLiteTranslation();
  const [state, setState] = useState<{
    loginConfig?: LoginConfigRecord;
    loading: boolean;
    error?: string;
  }>({
    loading: true,
  });

  useEffect(() => {
    let active = true;
    app.apiClient
      .resource('login_configs')
      .getActiveConfig({
        type: 'home',
      })
      .then((res) => {
        if (!active) {
          return;
        }
        setState({
          loginConfig: getResponseData<LoginConfigRecord>(res) || {},
          loading: false,
        });
      })
      .catch((error) => {
        if (!active) {
          return;
        }
        setState({
          loginConfig: {},
          loading: false,
          error: getErrorMessage(error, t('Failed to fetch login config')),
        });
      });

    return () => {
      active = false;
    };
  }, [app.apiClient, t]);

  if (state.loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin />
      </div>
    );
  }

  return (
    <AuthLayoutRenderV2 loginConfig={state.loginConfig}>
      {state.error ? <Alert type="warning" showIcon message={state.error} /> : undefined}
    </AuthLayoutRenderV2>
  );
}

// Renders the /v/ "Login configurations" settings pane, injecting the REAL sign-in components so its
// live preview IS the actual page (background, opacity, layout, theme all from one source of truth).
// Injected as props rather than imported by LoginConfigPaneV2 to avoid an index ⇄ pane import cycle.
function LoginConfigTab() {
  return <LoginConfigPaneV2 previewComponents={{ AuthLayoutRenderV2, CustomSignInPageV2 }} />;
}

export class PluginLoginLiteClientV2 extends Plugin {
  private registerAuthRoutes = () => {
    this.router.add('auth', {
      componentLoader: async () => ({ default: CustomAuthLayoutV2 }),
    });
    this.router.add('auth.signin', {
      path: '/signin',
      skipAuthCheck: true,
      componentLoader: async () => ({ default: CustomSignInPageV2 }),
    });
  };

  async beforeLoad() {
    this.app.eventBus.addEventListener('plugin:auth:loaded', this.registerAuthRoutes);
    this.app.eventBus.addEventListener('plugin:@nocobase/plugin-auth:loaded', this.registerAuthRoutes);
  }

  async load() {
    this.registerAuthRoutes();

    // Load this plugin's i18n bundle on the modern client (the auth-page components rely on it too),
    // then register the "Login configurations" settings page — the /v/ equivalent of the classic
    // pluginSettingsManager.add() in ../client, editing the same `login_configs` record.
    try {
      this.app.i18n.addResources('en-US', NAMESPACE, enUS as any);
      this.app.i18n.addResources('vi-VN', NAMESPACE, viVN as any);
    } catch (e) {
      // ignore i18n load errors
    }
    const psm: any = this.app.pluginSettingsManager;
    psm?.addMenuItem?.({
      key: 'plugin-login',
      title: this.app.i18n.t('Login configurations', { ns: NAMESPACE }),
      icon: 'SettingOutlined',
    });
    psm?.addPageTabItem?.({ menuKey: 'plugin-login', key: 'index', Component: LoginConfigTab });
  }
}

export default PluginLoginLiteClientV2;
