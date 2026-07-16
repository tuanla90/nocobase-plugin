/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import React, { useContext, useState, useEffect } from 'react';
import { Space, Button, Tabs } from 'antd';
import { css } from '@emotion/css';
import { useCurrentDocumentTitle, useViewport, usePlugin } from '@nocobase/client';
import { usePluginTranslation } from './locale';
import AuthPlugin, { AuthenticatorsContext } from '@nocobase/plugin-auth/client';
import {
  UserOutlined,
  MobileOutlined,
  LoginOutlined,
  DingtalkOutlined,
  MailOutlined,
  GoogleOutlined,
} from '@ant-design/icons';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { svgFieldIcon, accountIconPath, passwordIconPath, resolveThemePalette } from '@ptdl/shared';

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

const useSignInComponents = () => {
  const plugin = usePlugin(AuthPlugin);
  const authTypes = plugin.authTypes.getEntities();
  const signInComponents: any = {};
  for (const [authType, options] of authTypes) {
    signInComponents[authType] = {
      SignInForm: options.components?.SignInForm,
      SignInButton: options.components?.SignInButton,
    };
  }
  return signInComponents;
};

export const CustomSignInPage = ({ loginConfig: propsLoginConfig }: { loginConfig?: any }) => {
  const { t } = usePluginTranslation();
  useCurrentDocumentTitle('Signin');
  useViewport();
  const { loginConfig: contextLoginConfig } = useOutletContext<any>() || {};
  const rawLoginConfig = propsLoginConfig || contextLoginConfig;
  const loginConfig = rawLoginConfig?.options || rawLoginConfig || {};

  const signInComponents = useSignInComponents();
  const authenticators = useContext(AuthenticatorsContext);

  const loginMethods = loginConfig?.loginMethods || ['password'];
  const showPassword = loginMethods.includes('password');

  // Filter authenticators that have a corresponding SignInForm or SignInButton
  const formAuthenticators = authenticators.filter((a) => {
    const comps = signInComponents[a.authType] || signInComponents[a.authType.toLowerCase()];
    return comps && (comps.SignInForm || comps.SignInButton);
  });

  // Prepare available options
  const availableOptions: { type: 'authenticator'; key: string; label: string; icon: any; data?: any }[] = [];

  formAuthenticators.forEach((a) => {
    // If it's basic/email, respect showPassword config
    const isBasicOrEmail = a.authType === 'basic' || a.authType === 'email' || a.authType === 'Email';
    if (isBasicOrEmail && !showPassword) {
      return;
    }

    let icon = <LoginOutlined />;
    if (isBasicOrEmail) {
      if (a.authType === 'email' || a.authType === 'Email') {
        icon = <MailOutlined />;
      } else {
        icon = <UserOutlined />;
      }
    } else if (a.authType.toLowerCase() === 'sms') {
      icon = <MobileOutlined />;
    } else if (a.authType.toLowerCase() === 'dingtalk') {
      icon = <DingtalkOutlined />;
    } else if (a.authType.toLowerCase() === 'google' || a.authType === 'Google') {
      icon = <GoogleOutlined />;
    }

    availableOptions.push({
      type: 'authenticator',
      key: a.name,
      label: a.title || (isBasicOrEmail ? t('Password Login') : a.name),
      icon,
      data: a,
    });
  });

  const [mode, setMode] = useState<string>('select');
  const [currentAuthenticator, setCurrentAuthenticator] = useState<any>(null);

  useEffect(() => {
    // Auto switch if only one option is available
    if (availableOptions.length === 1 && mode === 'select') {
      const option = availableOptions[0];
      setMode(option.key);
      setCurrentAuthenticator(option.data);
    }
  }, [availableOptions.length, mode]);

  const handleBack = () => {
    setMode('select');
    setCurrentAuthenticator(null);
  };

  // Full palette (custom pickers, or a light/dark/system preset that overrides them).
  const prefersDark = usePrefersDark();
  const palette = resolveThemePalette(loginConfig || {}, prefersDark);
  const formThemeColor = palette.cardBg;
  const formFontColor = palette.cardText;
  const buttonBgColor = palette.btnBg;
  const buttonTextColor = palette.btnText;
  const { inputBg, inputBorder, inputBorderHover, inputText } = palette;

  // Icon-only fields: draw a leading icon inside the username / password inputs.
  // Default ON (only disabled when explicitly set to false).
  const showFieldIcons = loginConfig?.showFieldIcons !== false;
  const fieldIconCss = showFieldIcons
    ? css`
        /* account (username): classic wraps it in an affix wrapper, v2 uses a plain input;
           in both lanes only the PASSWORD carries the .ant-input-password class */
        .ant-input-affix-wrapper:not(.ant-input-password),
        input.ant-input:not(.ant-input-affix-wrapper input) {
          padding-left: 34px !important;
          background-image: ${svgFieldIcon(accountIconPath(loginConfig?.accountIcon), inputText)};
          background-repeat: no-repeat;
          background-position: 10px center;
        }
        /* password: affix wrapper tagged .ant-input-password in both lanes */
        .ant-input-affix-wrapper.ant-input-password {
          padding-left: 34px !important;
          background-image: ${svgFieldIcon(passwordIconPath(loginConfig?.passwordIcon), inputText)};
          background-repeat: no-repeat;
          background-position: 10px center;
        }
      `
    : '';

  // A11y: the sign-in inputs have no visible label (icon + placeholder only) — mirror the
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

  // Default landing page: inject ?redirect= when the config sets one and the URL has none.
  // Only on the real sign-in page (config comes from Outlet context, not props → preview).
  const isPreview = !!propsLoginConfig;
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (isPreview) return;
    const redirectPath = loginConfig?.redirectPath;
    if (redirectPath && !searchParams.get('redirect')) {
      const next = new URLSearchParams(searchParams);
      next.set('redirect', redirectPath);
      setSearchParams(next, { replace: true });
    }
  }, [isPreview, loginConfig?.redirectPath, searchParams, setSearchParams]);

  return (
    <Space
      direction="vertical"
      className={css`
        display: flex;
        width: 100%;
      `}
    >
      {mode === 'select' && availableOptions.length > 1 && (
        <div
          style={{
            width: '70%',
            margin: '0 auto',
          }}
        >
          <div
            className={css`
              display: grid;
              grid-template-columns: 1fr;
              gap: 14px;
            `}
          >
            {availableOptions.map((option) => {
              const comps =
                signInComponents[option.data.authType] || signInComponents[option.data.authType.toLowerCase()];
              // If the authenticator only provides a SignInButton (no SignInForm), render it directly
              if (comps?.SignInButton && !comps?.SignInForm) {
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
                        box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.35) !important;
                        opacity: 0.92 !important;
                        filter: none !important;
                      }
                      .ant-space {
                        width: 100%;
                        display: flex;
                      }
                      .ant-space-item {
                        width: 100%;
                      }
                    `}
                  >
                    <comps.SignInButton authenticator={option.data} />
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
                    if (option.type === 'authenticator') {
                      setCurrentAuthenticator(option.data);
                    }
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
                    &:hover {
                      background: ${buttonBgColor} !important;
                      border-color: ${buttonBgColor} !important;
                      color: ${buttonTextColor} !important;
                      box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.35) !important;
                      opacity: 0.88 !important;
                      filter: none !important;
                    }
                  `}
                >
                  {option.label}
                </Button>
              );
            })}
          </div>
        </div>
      )}

      {(mode !== 'select' || availableOptions.length === 1) && (
        <div
          ref={formCardRef}
          style={{
            maxWidth: 360,
            width: '90%',
            margin: '40px auto 0',
            padding: '32px',
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
            .ant-input::placeholder,
            .ant-input-affix-wrapper::placeholder {
              color: ${inputText} !important;
              opacity: 0.6;
            }
            .ant-input:hover,
            .ant-input:focus,
            .ant-input-password:hover,
            .ant-input-password:focus-within,
            .ant-input-affix-wrapper:hover,
            .ant-input-affix-wrapper:focus,
            .ant-input-affix-wrapper-focused {
              border-color: ${inputBorderHover} !important;
            }
            .ant-btn-primary {
              background-color: ${buttonBgColor} !important;
              border-color: ${buttonBgColor} !important;
              color: ${buttonTextColor} !important;
              box-shadow: 0 2px 0 rgba(0, 0, 0, 0.05) !important;
            }
            .ant-btn-primary:hover {
              background-color: ${buttonBgColor} !important;
              border-color: ${buttonBgColor} !important;
              opacity: 0.9;
              box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.25) !important;
            }
            .ant-form-item-explain-error {
              color: #ffccc7 !important;
            }
            .ant-form-item-label > label,
            .ant-form-item-label label,
            label {
              color: ${formFontColor} !important;
            }
            .ant-btn-default,
            .ant-btn:not(.ant-btn-primary):not(.ant-btn-link):not(.ant-btn-text) {
              background-color: transparent !important;
              border-color: rgba(255, 255, 255, 0.4) !important;
              color: ${formFontColor} !important;
            }
            .ant-btn-default:hover,
            .ant-btn:not(.ant-btn-primary):not(.ant-btn-link):not(.ant-btn-text):hover {
              border-color: rgba(255, 255, 255, 0.6) !important;
              color: ${formFontColor} !important;
              opacity: 0.85;
            }
            a {
              color: ${formFontColor} !important;
              text-decoration: underline;
              opacity: 0.8;
            }
            a:hover {
              opacity: 1;
            }
          `,
            fieldIconCss,
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {availableOptions.length > 1 && (
            <div style={{ marginBottom: 16 }}>
              <Button
                type="text"
                icon={<div style={{ fontSize: 18 }}>⬅</div>}
                onClick={handleBack}
                style={{ color: formFontColor, paddingLeft: 0 }}
              >
                {t('Back')}
              </Button>
            </div>
          )}

          {currentAuthenticator &&
            React.createElement(
              (() => {
                const comps =
                  signInComponents[currentAuthenticator.authType] ||
                  signInComponents[currentAuthenticator.authType.toLowerCase()];
                return comps?.SignInForm || comps?.SignInButton;
              })(),
              {
                authenticator: currentAuthenticator,
              },
            )}
        </div>
      )}
    </Space>
  );
};
